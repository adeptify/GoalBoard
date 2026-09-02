import { randomUUID } from "node:crypto";

import type {
  AttachEvidenceReviewInput,
  AuthorizedEvidenceSubmissionInput,
  CorrectEvidenceInput,
  EvidenceCommandApi,
  EvidenceCorrectionRecord,
  EvidenceCorrectionResult,
  EvidenceRecord,
  EvidenceSubmissionResult,
} from "@adeptify/goalboard-contracts/modules/evidence-verification";

import {
  ProjectReferenceError,
  validateEvidenceLocator,
} from "./locator.js";
import {
  EvidenceRepository,
  type EvidenceEventInput,
} from "./repository.js";
import {
  EvidenceVerificationError,
  type EvidenceVerificationErrorFactory,
} from "./errors.js";

export interface EvidenceLifecycleOptions {
  now?: () => string;
  id?: () => string;
  errorFactory?: EvidenceVerificationErrorFactory;
  appendEvent(input: EvidenceEventInput): number;
}

export class EvidenceLifecycle implements EvidenceCommandApi {
  private readonly now: () => string;
  private readonly id: () => string;
  private readonly errorFactory: EvidenceVerificationErrorFactory;

  constructor(
    readonly repository: EvidenceRepository,
    private readonly options: EvidenceLifecycleOptions,
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.id = options.id ?? randomUUID;
    this.errorFactory = options.errorFactory ?? ((code, message, details) =>
      new EvidenceVerificationError(code, message, details));
  }

  submitAuthorizedEvidence(input: AuthorizedEvidenceSubmissionInput): EvidenceSubmissionResult {
    if (!input.locator.trim()) {
      throw this.errorFactory("evidence.locator_required", "Evidence 必须有可查找的位置");
    }
    if (input.criterion_ids.length === 0) {
      throw this.errorFactory("evidence.criterion_required", "Evidence 至少要对应一条验收条件");
    }
    const now = this.now();
    const validation = this.validateLocator(input, now);
    return this.repository.immediate(() => {
      const evidenceId = `evidence-${this.id()}`;
      const locatorWorkspaceRoot = validation.status === "verified"
        ? validation.verified_project_root ?? input.locator_context?.project_root ?? null
        : null;
      const locatorWorkspaceId = validation.status === "verified" &&
          validation.verified_via !== "registered_git_worktree"
        ? input.locator_context?.workspace_id ?? null
        : null;
      const evidence: EvidenceRecord = {
        evidence_id: evidenceId,
        board_id: input.board_id,
        goal_id: input.goal_id,
        contract_revision: input.contract_revision,
        criterion_ids: unique(input.criterion_ids).sort(),
        producer_actor_id: input.producer_actor_id,
        run_id: input.run_id ?? null,
        review_id: input.review_id ?? null,
        kind: input.kind,
        locator: validation.normalized_locator,
        locator_status: validation.status,
        locator_validation_reason: validation.reason,
        locator_checked_at: validation.checked_at,
        locator_workspace_id: locatorWorkspaceId,
        digest: input.digest ?? null,
        captured_at: now,
        result: input.result,
        lifecycle_state: "effective",
        correction: null,
        historical_unmapped: false,
      };
      this.repository.insertEvidence({ ...evidence, locator_workspace_root: locatorWorkspaceRoot });
      const cursor = this.options.appendEvent({
        eventId: this.id(),
        boardId: input.board_id,
        actorId: input.producer_actor_id,
        type: "evidence.submitted",
        objectType: "evidence",
        objectId: evidenceId,
        reason: "提交验收证据",
        payload: {
          goal_id: input.goal_id,
          criterion_ids: input.criterion_ids,
          result: input.result,
        },
        at: now,
      });
      return {
        evidence: this.requireEvidence(input.board_id, evidenceId),
        observed_event_cursor: cursor,
      };
    });
  }

  correctEvidence(input: CorrectEvidenceInput): EvidenceCorrectionResult {
    const reason = input.reason.trim();
    if (!reason) {
      throw this.errorFactory(
        "evidence.correction_reason_required",
        "更正 Evidence 必须说明原因",
      );
    }
    if (input.action !== "supersede" && input.action !== "retract") {
      throw this.errorFactory(
        "evidence.correction_action_invalid",
        "Evidence 更正必须是 supersede 或 retract",
      );
    }
    return this.repository.immediate(() => {
      const target = this.repository.getEvidence(input.board_id, input.target_evidence_id);
      if (!target || target.goal_id !== input.goal_id) {
        throw this.errorFactory(
          "evidence.correction_target_invalid",
          "待更正的 Evidence 不属于这个 Goal",
        );
      }
      if (target.producer_actor_id !== input.actor_id) {
        throw this.errorFactory(
          "evidence.correction_not_owner",
          "Runtime 只能更正自己提交的 Evidence",
        );
      }
      if (target.correction) {
        throw this.errorFactory(
          "evidence.already_corrected",
          "这条 Evidence 已有不可变更正记录，不能再次改写同一历史节点",
        );
      }

      const replacementId = input.replacement_evidence_id?.trim() || null;
      let replacement: EvidenceRecord | null = null;
      if (input.action === "supersede") {
        if (!replacementId) {
          throw this.errorFactory(
            "evidence.replacement_required",
            "supersede 必须引用一条已经提交的替代 Evidence",
          );
        }
        if (replacementId === input.target_evidence_id) {
          throw this.errorFactory("evidence.correction_cycle", "Evidence 不能用自己替代自己");
        }
        replacement = this.repository.getEvidence(input.board_id, replacementId);
        if (!replacement || replacement.goal_id !== input.goal_id) {
          throw this.errorFactory(
            "evidence.replacement_invalid",
            "替代 Evidence 必须属于同一个 Board 和 Goal",
          );
        }
        if (replacement.producer_actor_id !== input.actor_id) {
          throw this.errorFactory(
            "evidence.replacement_not_owner",
            "Runtime 只能用自己提交的 Evidence 建立替代关系",
          );
        }
        this.assertAcyclicReplacement(input.target_evidence_id, replacementId);
        if (replacement.correction) {
          throw this.errorFactory(
            "evidence.replacement_not_effective",
            "替代 Evidence 必须是当前有效记录，不能再引用已被替代或撤销的历史",
          );
        }
      } else if (replacementId) {
        throw this.errorFactory(
          "evidence.replacement_not_allowed",
          "retract 只撤销当前 Evidence，不能同时指定替代记录",
        );
      }

      const now = this.now();
      const correction: EvidenceCorrectionRecord = {
        correction_id: `evidence-correction-${this.id()}`,
        board_id: input.board_id,
        goal_id: input.goal_id,
        target_evidence_id: input.target_evidence_id,
        action: input.action,
        replacement_evidence_id: replacementId,
        actor_id: input.actor_id,
        reason,
        created_at: now,
      };
      this.repository.insertCorrection(correction);
      const cursor = this.options.appendEvent({
        eventId: this.id(),
        boardId: input.board_id,
        actorId: input.actor_id,
        type: input.action === "supersede" ? "evidence.superseded" : "evidence.retracted",
        objectType: "evidence_correction",
        objectId: correction.correction_id,
        reason,
        payload: {
          goal_id: input.goal_id,
          target_evidence_id: input.target_evidence_id,
          replacement_evidence_id: replacementId,
        },
        at: now,
      });
      return {
        correction: this.requireCorrection(correction.correction_id),
        target_evidence: this.requireEvidence(input.board_id, input.target_evidence_id),
        replacement_evidence: replacementId
          ? this.requireEvidence(input.board_id, replacementId)
          : null,
        invalidates_passing_evidence: target.result === "passed",
        observed_event_cursor: cursor,
      };
    });
  }

  attachReview(input: AttachEvidenceReviewInput): EvidenceRecord {
    return this.repository.immediate(() => {
      const evidence = this.repository.attachReview(
        input.board_id,
        input.evidence_id,
        input.review_id,
      );
      if (!evidence) {
        throw this.errorFactory("evidence.not_found", `Evidence 不存在: ${input.evidence_id}`);
      }
      return evidence;
    });
  }

  private validateLocator(input: AuthorizedEvidenceSubmissionInput, now: string) {
    try {
      return validateEvidenceLocator(input.locator, {
        projectRoot: input.locator_context?.project_root,
        now,
      });
    } catch (error) {
      if (!(error instanceof ProjectReferenceError)) throw error;
      const code = /anchor 不存在/.test(error.message)
        ? "evidence.locator_anchor_missing"
        : /文件不存在/.test(error.message)
          ? "evidence.locator_file_missing"
          : /范围外|跳出项目目录|相对路径/.test(error.message)
            ? "evidence.locator_outside_project"
            : /根目录不可用/.test(error.message)
              ? "evidence.locator_project_unavailable"
              : "evidence.locator_invalid";
      throw this.errorFactory(code, error.message);
    }
  }

  private assertAcyclicReplacement(targetEvidenceId: string, replacementEvidenceId: string): void {
    let cursor: string | null = replacementEvidenceId;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor === targetEvidenceId) {
        throw this.errorFactory(
          "evidence.correction_cycle",
          "Evidence 更正关系不能形成循环",
        );
      }
      if (visited.has(cursor)) {
        throw this.errorFactory(
          "evidence.correction_cycle",
          "现有 Evidence 更正链已经形成循环",
        );
      }
      visited.add(cursor);
      const correction = this.repository.getCorrectionForTarget(cursor);
      cursor = correction?.action === "supersede"
        ? correction.replacement_evidence_id
        : null;
    }
  }

  private requireEvidence(boardId: string, evidenceId: string): EvidenceRecord {
    const evidence = this.repository.getEvidence(boardId, evidenceId);
    if (!evidence) throw new Error(`Evidence 写入后无法读取: ${evidenceId}`);
    return evidence;
  }

  private requireCorrection(correctionId: string): EvidenceCorrectionRecord {
    const correction = this.repository.getCorrection(correctionId);
    if (!correction) throw new Error(`Evidence 更正写入后无法读取: ${correctionId}`);
    return correction;
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

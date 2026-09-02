import { randomUUID } from "node:crypto";

import {
  compactGoalActionProjection,
  compatibleContractRevisions,
  contractRevisionIsCompatible,
  deriveGoalActionProjection,
  dialogueEvidenceDigest,
  humanReviewAttentionToken,
} from "@adeptify/goalboard-plugin-goals";

import { GoalBoardV1Error } from "./errors.js";
import type {
  ActionTransitionReceipt,
  EvidenceCorrectionRecord,
  EvidenceRecord,
  GoalRecord,
  ReviewRecord,
} from "./types.js";
import type { ExecutionValidationApplicationPorts } from "./execution-validation-ports.js";
import {
  executionValidationRequestHash as requestHash,
  uniqueExecutionValues as unique,
} from "./execution-validation-support.js";

export class ExecutionValidationVerificationCommands {
  constructor(private readonly ports: ExecutionValidationApplicationPorts) {}

  private get store() { return this.ports.store; }
  private get execution() { return this.ports.execution; }
  private get executionModule() { return this.ports.executionModule; }
  private get evidenceVerification() { return this.ports.evidenceVerification; }
  private get governance() { return this.ports.governance; }
  private get goalsModule() { return this.ports.goalsModule; }
  private get clock(): () => Date { return this.ports.clock; }
  private getGoalActionProjection(input: { board_id: string; goal_id: string }) {
    const snapshot = this.store.snapshot(input.board_id);
    const goal = snapshot.goals.find((item) => item.goal_id === input.goal_id);
    if (!goal) throw new GoalBoardV1Error("goal.not_found", `找不到这个 Goal: ${input.goal_id}`);
    return deriveGoalActionProjection(goal, snapshot, this.clock().toISOString());
  }
  private hasPostExecutionNeedsChanges(boardId: string, goalId: string): boolean {
    return this.ports.hasPostExecutionNeedsChanges(boardId, goalId);
  }
  private readReview(boardId: string, reviewId: string): ReviewRecord {
    return this.ports.readReview(boardId, reviewId);
  }
  private reconcileLifecycle(
    boardId: string,
    goalId: string,
    actorId: string,
    previousActionToken: string,
    summary: string,
    at: string,
  ): ActionTransitionReceipt {
    return this.ports.reconcileLifecycle(boardId, goalId, actorId, previousActionToken, summary, at);
  }
  private requireBoard(boardId: string): void { this.ports.requireBoard(boardId); }
  private requireGoalOnBoard(boardId: string, goalId: string): GoalRecord {
    return this.ports.requireGoalOnBoard(boardId, goalId);
  }
  private replay<T>(
    boardId: string,
    actorId: string,
    operation: string,
    key: string,
    hash: string,
  ): T | null {
    return this.ports.replay<T>(boardId, actorId, operation, key, hash);
  }
  private remember(
    boardId: string,
    actorId: string,
    operation: string,
    key: string,
    hash: string,
    outcome: unknown,
    at: string,
  ): void {
    this.ports.remember(boardId, actorId, operation, key, hash, outcome, at);
  }

  submitEvidence(input: {
    board_id: string;
    goal_id: string;
    actor_id: string;
    criterion_ids: string[];
    run_id?: string | null;
    review_id?: string | null;
    kind: EvidenceRecord["kind"];
    locator: string;
    /** Host-only validation context; Runtime and Web schemas never accept a user-supplied root. */
    locator_context?: { project_root?: string | null; workspace_id?: string | null };
    digest?: string | null;
    result: EvidenceRecord["result"];
    contract_revision?: number;
    action_token?: string;
    idempotency_key: string;
  }): {
    evidence: EvidenceRecord;
    replayed: boolean;
    observed_event_cursor: number;
    transition: ActionTransitionReceipt;
  } {
    const hash = requestHash(input);
    return this.store.immediate(() => {
      const replay = this.replay<{
        evidence: EvidenceRecord;
        observed_event_cursor: number;
        transition?: ActionTransitionReceipt;
      }>(
        input.board_id,
        input.actor_id,
        "submit_evidence",
        input.idempotency_key,
        hash,
      );
      if (replay) {
        const projection = this.getGoalActionProjection({ board_id: input.board_id, goal_id: input.goal_id });
        return {
          ...replay,
          transition: replay.transition ?? {
            goal_id: input.goal_id,
            previous_action_token: projection.action_token,
            projection,
            affected_goals: [compactGoalActionProjection(projection)],
            summary: "已记录完成依据",
            observed_event_cursor: replay.observed_event_cursor,
          },
          replayed: true,
        };
      }
      const goal = this.requireGoalOnBoard(input.board_id, input.goal_id);
      const revisionSnapshot = this.store.snapshot(input.board_id);
      const previousProjection = this.getGoalActionProjection({
        board_id: input.board_id,
        goal_id: input.goal_id,
      });
      if (
        input.contract_revision != null &&
        !contractRevisionIsCompatible(goal, revisionSnapshot, input.contract_revision)
      ) {
        throw new GoalBoardV1Error(
          "contract.revision_stale",
          "Evidence 属于旧 Contract revision，未写入当前 Goal。",
          { current_contract_revision: goal.current_contract_revision, projection: previousProjection },
        );
      }
      if (input.action_token && input.action_token !== previousProjection.action_token) {
        throw new GoalBoardV1Error(
          "action.token_stale",
          "提交 Evidence 前 Goal 已变化；旧写入未生效。",
          { projection: previousProjection },
        );
      }
      const validCriteria = new Set(goal.acceptance_criteria.map((item) => item.criterion_id));
      for (const criterionId of input.criterion_ids) {
        if (!validCriteria.has(criterionId)) {
          throw new GoalBoardV1Error(
            "evidence.criterion_invalid",
            `验收条件不属于这个 Goal: ${criterionId}`,
          );
        }
      }
      if (input.run_id) {
        const pair = this.execution.query.getRunWithClaim(input.board_id, input.run_id);
        if (!pair || pair.run.goal_id !== input.goal_id) {
          throw new GoalBoardV1Error("evidence.run_invalid", "Evidence 引用的 Run 不属于这个 Goal");
        }
        if (pair.run.actor_id !== input.actor_id) {
          throw new GoalBoardV1Error("evidence.actor_invalid", "只有 Run 执行者可以提交它的 Evidence");
        }
        if (!contractRevisionIsCompatible(goal, revisionSnapshot, pair.claim.contract_revision)) {
          throw new GoalBoardV1Error(
            "contract.revision_stale",
            "这个 Run 属于旧 Contract revision，不能继续写入当前 Evidence。",
            { current_contract_revision: goal.current_contract_revision, projection: previousProjection },
          );
        }
      }
      const submitted = this.evidenceVerification.commands.submitAuthorizedEvidence({
        board_id: input.board_id,
        goal_id: input.goal_id,
        contract_revision: goal.current_contract_revision,
        criterion_ids: input.criterion_ids,
        producer_actor_id: input.actor_id,
        run_id: input.run_id,
        review_id: input.review_id,
        kind: input.kind,
        locator: input.locator,
        locator_context: input.locator_context,
        digest: input.digest,
        result: input.result,
      });
      const now = submitted.evidence.captured_at;
      const transition = this.reconcileLifecycle(
        input.board_id,
        input.goal_id,
        input.actor_id,
        previousProjection.action_token,
        "已记录完成依据",
        now,
      );
      const evidence = submitted.evidence;
      const outcome = {
        evidence,
        observed_event_cursor: transition.observed_event_cursor,
        transition,
      };
      this.remember(
        input.board_id,
        input.actor_id,
        "submit_evidence",
        input.idempotency_key,
        hash,
        outcome,
        now,
      );
      return { ...outcome, replayed: false };
    });
  }

  correctEvidence(input: {
    board_id: string;
    goal_id: string;
    actor_id: string;
    target_evidence_id: string;
    action: EvidenceCorrectionRecord["action"];
    replacement_evidence_id?: string | null;
    reason: string;
    idempotency_key: string;
  }): {
    correction: EvidenceCorrectionRecord;
    target_evidence: EvidenceRecord;
    replacement_evidence: EvidenceRecord | null;
    replayed: boolean;
    observed_event_cursor: number;
    transition: ActionTransitionReceipt;
  } {
    const hash = requestHash(input);
    return this.store.immediate(() => {
      const replay = this.replay<{
        correction: EvidenceCorrectionRecord;
        target_evidence: EvidenceRecord;
        replacement_evidence: EvidenceRecord | null;
        observed_event_cursor: number;
        transition?: ActionTransitionReceipt;
      }>(input.board_id, input.actor_id, "correct_evidence", input.idempotency_key, hash);
      if (replay) {
        const projection = this.getGoalActionProjection({ board_id: input.board_id, goal_id: input.goal_id });
        return {
          ...replay,
          transition: replay.transition ?? {
            goal_id: input.goal_id,
            previous_action_token: projection.action_token,
            projection,
            affected_goals: [compactGoalActionProjection(projection)],
            summary: "已更正完成依据",
            observed_event_cursor: replay.observed_event_cursor,
          },
          replayed: true,
        };
      }

      this.requireBoard(input.board_id);
      this.requireGoalOnBoard(input.board_id, input.goal_id);
      const previousProjection = this.getGoalActionProjection({
        board_id: input.board_id,
        goal_id: input.goal_id,
      });
      const corrected = this.evidenceVerification.commands.correctEvidence({
        board_id: input.board_id,
        goal_id: input.goal_id,
        actor_id: input.actor_id,
        target_evidence_id: input.target_evidence_id,
        action: input.action,
        replacement_evidence_id: input.replacement_evidence_id,
        reason: input.reason,
      });
      const now = corrected.correction.created_at;
      if (corrected.invalidates_passing_evidence) {
        this.goalsModule.lifecycle.markSatisfiedGoalForEvidenceRevalidation(
          input.board_id,
          input.goal_id,
          input.actor_id,
          input.target_evidence_id,
          corrected.correction.correction_id,
          now,
        );
      }
      const transition = this.reconcileLifecycle(
        input.board_id,
        input.goal_id,
        input.actor_id,
        previousProjection.action_token,
        input.action === "supersede" ? "已替换旧完成依据" : "已撤回旧完成依据",
        now,
      );
      const outcome = {
        correction: corrected.correction,
        target_evidence: corrected.target_evidence,
        replacement_evidence: corrected.replacement_evidence,
        observed_event_cursor: transition.observed_event_cursor,
        transition,
      };
      this.remember(
        input.board_id,
        input.actor_id,
        "correct_evidence",
        input.idempotency_key,
        hash,
        outcome,
        now,
      );
      return { ...outcome, replayed: false };
    });
  }

  submitReview(input: {
    board_id: string;
    goal_id: string;
    obligation_id: string;
    actor_id: string;
    actor_kind?: "user" | "runtime";
    verdict: ReviewRecord["verdict"];
    evidence_refs?: string[];
    reasoning: string;
    contract_revision?: number;
    action_token?: string;
    idempotency_key: string;
  }): {
    review: ReviewRecord;
    replayed: boolean;
    observed_event_cursor: number;
    transition: ActionTransitionReceipt;
  } {
    const hash = requestHash(input);
    return this.store.immediate(() => {
      const replay = this.replay<{
        review: ReviewRecord;
        observed_event_cursor: number;
        transition?: ActionTransitionReceipt;
      }>(
        input.board_id,
        input.actor_id,
        "submit_review",
        input.idempotency_key,
        hash,
      );
      if (replay) {
        const projection = this.getGoalActionProjection({ board_id: input.board_id, goal_id: input.goal_id });
        return {
          ...replay,
          transition: replay.transition ?? {
            goal_id: input.goal_id,
            previous_action_token: projection.action_token,
            projection,
            affected_goals: [compactGoalActionProjection(projection)],
            summary: "已记录复核结果",
            observed_event_cursor: replay.observed_event_cursor,
          },
          replayed: true,
        };
      }
      const reviewGoal = this.requireGoalOnBoard(input.board_id, input.goal_id);
      const revisionSnapshot = this.store.snapshot(input.board_id);
      if (reviewGoal.trashed_at) {
        throw new GoalBoardV1Error("goal.trashed", "回收站中的 Goal 不能提交 Review");
      }
      const previousProjection = this.getGoalActionProjection({
        board_id: input.board_id,
        goal_id: input.goal_id,
      });
      if (
        input.contract_revision != null &&
        !contractRevisionIsCompatible(reviewGoal, revisionSnapshot, input.contract_revision)
      ) {
        throw new GoalBoardV1Error(
          "contract.revision_stale",
          "Review 属于旧 Contract revision，未写入当前 Goal。",
          { current_contract_revision: reviewGoal.current_contract_revision, projection: previousProjection },
        );
      }
      if (input.action_token && input.action_token !== previousProjection.action_token) {
        throw new GoalBoardV1Error(
          "action.token_stale",
          "提交 Review 前 Goal 已变化；旧写入未生效。",
          { projection: previousProjection },
        );
      }
      if (!input.reasoning.trim()) throw new GoalBoardV1Error("review.reasoning_required", "Review 必须说明判断理由");
      const obligation = this.governance.query.getReviewObligation(
        input.board_id,
        input.obligation_id,
      );
      if (!obligation || obligation.goal_id !== input.goal_id) {
        throw new GoalBoardV1Error("review.obligation_not_found", "找不到这项 Review 要求");
      }
      if (obligation.state !== "pending") {
        throw new GoalBoardV1Error("review.obligation_closed", "这项 Review 要求已经关闭");
      }
      if (!contractRevisionIsCompatible(reviewGoal, revisionSnapshot, obligation.contract_revision)) {
        throw new GoalBoardV1Error(
          "contract.revision_stale",
          "这项 Review 要求属于旧 Contract revision。",
          { current_contract_revision: reviewGoal.current_contract_revision, projection: previousProjection },
        );
      }
      const latestWorkRun = this.executionModule.repository.latestRunForGoal(
        input.board_id,
        input.goal_id,
        ["executor", "revalidator"],
      );
      if (!latestWorkRun || latestWorkRun.state !== "completed") {
        throw new GoalBoardV1Error("review.execution_not_completed", "执行 Run 尚未完成，不能提交 Review");
      }
      if (this.hasPostExecutionNeedsChanges(input.board_id, input.goal_id)) {
        throw new GoalBoardV1Error(
          "review.rework_pending",
          "Review 已要求返工，必须先完成新的执行 Run 再重新复核",
        );
      }
      const evidenceRefs = unique(input.evidence_refs ?? []);
      if (input.verdict === "pass") {
        for (const evidenceRef of evidenceRefs) {
          const referenced = this.evidenceVerification.query.getReviewReference(evidenceRef);
          if (!referenced) continue;
          if (
            referenced.evidence.board_id !== input.board_id ||
            referenced.evidence.goal_id !== input.goal_id
          ) {
            throw new GoalBoardV1Error(
              "review.evidence_wrong_goal",
              "Review 引用的 Evidence 不属于这个 Goal",
            );
          }
          if (referenced.evidence.lifecycle_state !== "effective") {
            throw new GoalBoardV1Error(
              "review.evidence_not_effective",
              "Review 通过只能引用当前有效 Evidence；已被替代或撤销的记录只保留为历史",
            );
          }
          const staleCriterionIds = referenced.evidence.criterion_ids.filter(
            (criterionId) =>
              this.evidenceVerification.query.latestCriterionReworkSeq(
                input.board_id,
                input.goal_id,
                criterionId,
              ) >= referenced.submitted_event_seq,
          );
          if (staleCriterionIds.length > 0) {
            throw new GoalBoardV1Error(
              "review.evidence_stale_after_rework",
              "Review 通过不能复用返工请求之前的旧 Evidence",
              {
                stale_criterion_ids: staleCriterionIds,
                evidence_id: evidenceRef,
                recovery_action: "请在新的执行 Run 中提交覆盖这些验收条件的新 Evidence，再重新复核。",
              },
            );
          }
        }
      }
      const role = obligation.role;
      if (role === "human_approver" && input.actor_kind !== "user") {
        throw new GoalBoardV1Error(
          "review.user_authority_required",
          "只有用户可以提交 human approval Review",
        );
      }
      if (role === "cross_reviewer" || role === "adversarial_reviewer") {
        const executor = this.executionModule.repository.latestClaimForGoal(
          input.board_id,
          input.goal_id,
          ["executor", "revalidator"],
        );
        if (executor?.actor_id === input.actor_id) {
          throw new GoalBoardV1Error(
            "review.independence_failed",
            "执行者不能交叉或对抗性复核自己的 Goal",
          );
        }
      }
      const now = this.clock().toISOString();
      const activeReviewerClaim = role === "human_approver"
        ? null
        : revisionSnapshot.claims
            .filter((claim) =>
              claim.board_id === input.board_id &&
              claim.goal_id === input.goal_id &&
              claim.actor_id === input.actor_id &&
              claim.state === "active" &&
              contractRevisionIsCompatible(reviewGoal, revisionSnapshot, claim.contract_revision) &&
              claim.action_kind === "review" &&
              claim.action_target_id === input.obligation_id
            )
            .sort((left, right) =>
              left.claimed_at.localeCompare(right.claimed_at) ||
              left.claim_id.localeCompare(right.claim_id)
            )
            .at(-1) ?? null;
      // Authorization and cross-owner checks stay in the Coordinator. The
      // Governance owner performs the formal Review write and state transition.
      const submittedReview = this.governance.reviews.submitAuthorizedReview({
        board_id: input.board_id,
        goal_id: input.goal_id,
        obligation_id: input.obligation_id,
        claim_id: activeReviewerClaim?.claim_id ?? null,
        actor_id: input.actor_id,
        verdict: input.verdict,
        evidence_refs: evidenceRefs,
        reasoning: input.reasoning,
      });
      const reviewId = submittedReview.review.review_id;
      if (activeReviewerClaim) {
        const activeRun = this.executionModule.repository.latestActiveRunForClaim(activeReviewerClaim.claim_id);
        if (activeRun) {
          this.executionModule.repository.completeRun(activeRun.run_id, now);
          this.store.appendEvent({
            eventId: randomUUID(),
            boardId: input.board_id,
            actorId: input.actor_id,
            type: "run.completed",
            objectType: "run",
            objectId: activeRun.run_id,
            reason: "Review 已提交，Reviewer Run 自动结束",
            payload: { review_id: reviewId, obligation_id: input.obligation_id },
            at: now,
          });
        }
      }
      const transition = this.reconcileLifecycle(
        input.board_id,
        input.goal_id,
        input.actor_id,
        previousProjection.action_token,
        input.verdict === "needs_changes" ? "已记录修改要求" : "已记录复核结果",
        now,
      );
      const review = this.readReview(input.board_id, reviewId);
      const outcome = {
        review,
        observed_event_cursor: transition.observed_event_cursor,
        transition,
      };
      this.remember(input.board_id, input.actor_id, "submit_review", input.idempotency_key, hash, outcome, now);
      return { ...outcome, replayed: false };
    });
  }

  /**
   * Record one unambiguous user verdict from a trusted local dialogue. The
   * caller supplies provenance discovered by the host; the Runtime only
   * carries the exact quote, target and current attention token.
   */
  submitHumanReviewFromDialogue(input: {
    board_id: string;
    goal_id: string;
    obligation_id: string;
    attention_token: string;
    verdict: "approve" | "request_changes";
    exact_user_quote: string;
    user_id: string;
    session_id: string;
    message_id: string;
    idempotency_key: string;
  }): {
    evidence: EvidenceRecord;
    review: ReviewRecord;
    transition: ActionTransitionReceipt;
    observed_event_cursor: number;
    replayed: boolean;
  } {
    const normalized = {
      ...input,
      exact_user_quote: input.exact_user_quote.trim(),
      user_id: input.user_id.trim(),
      session_id: input.session_id.trim(),
      message_id: input.message_id.trim(),
    };
    const hash = requestHash(normalized);
    return this.store.immediate(() => {
      const replay = this.replay<{
        evidence: EvidenceRecord;
        review: ReviewRecord;
        transition: ActionTransitionReceipt;
        observed_event_cursor: number;
      }>(input.board_id, input.user_id, "human_review_dialogue", input.idempotency_key, hash);
      if (replay) return { ...replay, replayed: true };
      if (
        !normalized.exact_user_quote || !normalized.user_id ||
        !normalized.session_id || !normalized.message_id
      ) {
        throw new GoalBoardV1Error(
          "review.dialogue_provenance_required",
          "对话验收必须保留用户原话、用户、Session 和消息来源。",
        );
      }
      const snapshot = this.store.snapshot(input.board_id);
      const goal = snapshot.goals.find((candidate) => candidate.goal_id === input.goal_id);
      if (!goal) throw new GoalBoardV1Error("goal.not_found", `找不到这个 Goal: ${input.goal_id}`);
      const compatibleRevisions = compatibleContractRevisions(goal, snapshot);
      const pendingHuman = snapshot.review_obligations.filter((obligation) =>
        obligation.goal_id === input.goal_id &&
        compatibleRevisions.has(obligation.contract_revision) &&
        obligation.role === "human_approver" &&
        obligation.state === "pending"
      );
      const completedHuman = snapshot.review_obligations.filter((obligation) =>
        obligation.goal_id === input.goal_id &&
        compatibleRevisions.has(obligation.contract_revision) &&
        obligation.role === "human_approver" &&
        obligation.state === "satisfied"
      );
      const candidates = pendingHuman.length > 0
        ? pendingHuman
        : input.verdict === "request_changes" && goal.fulfillment_state === "satisfied"
          ? completedHuman
          : [];
      const obligation = candidates.find((candidate) => candidate.obligation_id === input.obligation_id);
      if (!obligation || candidates.length !== 1) {
        throw new GoalBoardV1Error(
          "review.dialogue_target_ambiguous",
          "当前对话不能唯一对应一项用户验收；请到 Decision Center 逐项处理。",
          { pending_obligation_ids: pendingHuman.map((item) => item.obligation_id) },
        );
      }
      const expectedToken = humanReviewAttentionToken(goal, obligation, snapshot);
      if (input.attention_token !== expectedToken) {
        throw new GoalBoardV1Error(
          "review.attention_token_stale",
          "验收内容在用户回答前已经变化；旧回答没有写入。",
          {
            obligation_id: obligation.obligation_id,
            current_attention_token: expectedToken,
            projection: deriveGoalActionProjection(goal, snapshot, this.clock().toISOString()),
          },
        );
      }
      if (obligation.state === "satisfied" && input.verdict === "request_changes") {
        this.governance.reviews.reopenObligation(input.board_id, obligation.obligation_id);
      }
      const evidence = this.submitEvidence({
        board_id: input.board_id,
        goal_id: input.goal_id,
        actor_id: normalized.user_id,
        criterion_ids: obligation.criterion_scope,
        kind: "human_verdict",
        locator: `conversation://${encodeURIComponent(normalized.session_id)}/${encodeURIComponent(normalized.message_id)}`,
        digest: dialogueEvidenceDigest(normalized.exact_user_quote),
        result: input.verdict === "approve" ? "passed" : "failed",
        contract_revision: goal.current_contract_revision,
        idempotency_key: `human-evidence:${input.idempotency_key}`,
      }).evidence;
      const reviewResult = this.submitReview({
        board_id: input.board_id,
        goal_id: input.goal_id,
        obligation_id: input.obligation_id,
        actor_id: normalized.user_id,
        actor_kind: "user",
        verdict: input.verdict === "approve" ? "pass" : "needs_changes",
        evidence_refs: [evidence.evidence_id],
        reasoning: normalized.exact_user_quote,
        contract_revision: goal.current_contract_revision,
        idempotency_key: `human-review:${input.idempotency_key}`,
      });
      const linkedEvidence = this.evidenceVerification.commands.attachReview({
        board_id: input.board_id,
        evidence_id: evidence.evidence_id,
        review_id: reviewResult.review.review_id,
      });
      const outcome = {
        evidence: linkedEvidence,
        review: reviewResult.review,
        transition: {
          ...reviewResult.transition,
          summary: input.verdict === "approve" ? "已记录你的验收" : "已记录你的修改要求",
        },
        observed_event_cursor: reviewResult.transition.observed_event_cursor,
      };
      this.remember(
        input.board_id,
        normalized.user_id,
        "human_review_dialogue",
        input.idempotency_key,
        hash,
        outcome,
        this.clock().toISOString(),
      );
      return { ...outcome, replayed: false };
    });
  }

}


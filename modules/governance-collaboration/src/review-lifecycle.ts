import { randomUUID } from "node:crypto";

import type {
  AuthorizedReviewSubmissionInput,
  AuthorizedReviewSubmissionResult,
  GovernanceReviewApi,
  ReviewObligationRecord,
  ReviewObligationSpec,
  ReviewRecord,
} from "@adeptify/goalboard-contracts/modules/governance-collaboration";

import { GovernanceError, type GovernanceErrorFactory } from "./errors.js";
import { GovernanceRepository } from "./repository.js";

export interface GovernanceReviewLifecycleOptions {
  now?: () => string;
  id?: () => string;
  errorFactory?: GovernanceErrorFactory;
}

export class GovernanceReviewLifecycle implements GovernanceReviewApi {
  private readonly now: () => string;
  private readonly id: () => string;
  private readonly errorFactory: GovernanceErrorFactory;

  constructor(
    readonly repository: GovernanceRepository,
    options: GovernanceReviewLifecycleOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.id = options.id ?? randomUUID;
    this.errorFactory = options.errorFactory ?? ((code, message, details) =>
      new GovernanceError(code, message, details));
  }

  submitAuthorizedReview(
    input: AuthorizedReviewSubmissionInput,
  ): AuthorizedReviewSubmissionResult {
    const reasoning = input.reasoning.trim();
    if (!reasoning) {
      throw this.errorFactory("review.reasoning_required", "Review 必须说明判断理由");
    }
    return this.repository.immediate(() => {
      const obligation = this.repository.getReviewObligation(input.board_id, input.obligation_id);
      if (!obligation || obligation.goal_id !== input.goal_id) {
        throw this.errorFactory("review.obligation_not_found", "找不到这项 Review 要求");
      }
      if (obligation.state !== "pending") {
        throw this.errorFactory("review.obligation_closed", "这项 Review 要求已经关闭");
      }
      const at = this.now();
      const review: ReviewRecord = {
        review_id: `review-${this.id()}`,
        board_id: input.board_id,
        goal_id: input.goal_id,
        obligation_id: input.obligation_id,
        claim_id: input.claim_id ?? null,
        actor_id: input.actor_id,
        verdict: input.verdict,
        evidence_refs: [...new Set(input.evidence_refs)].sort(),
        reasoning,
        submitted_at: at,
      };
      this.repository.insertReview(review);
      this.repository.appendEvent({
        event_id: this.id(), board_id: input.board_id, actor_id: input.actor_id,
        type: "review.submitted", object_type: "review", object_id: review.review_id,
        reason: reasoning,
        payload: { goal_id: input.goal_id, obligation_id: input.obligation_id, verdict: input.verdict },
        at,
      });
      if (input.verdict === "needs_changes") {
        for (const item of this.repository.listReviewObligations(input.board_id, input.goal_id)) {
          if (item.state === "satisfied") this.repository.updateReviewObligation(item.obligation_id, { state: "pending" });
        }
      } else if (input.verdict === "pass") {
        const afterSeq = this.repository.latestCompletedWorkRunEventSeq(input.board_id, input.goal_id);
        if (this.repository.passingReviewActorCountAfterEventSeq(obligation.obligation_id, afterSeq) >= obligation.required_count) {
          this.repository.updateReviewObligation(obligation.obligation_id, { state: "satisfied" });
        }
      }
      return {
        review,
        obligation: this.repository.getReviewObligation(input.board_id, input.obligation_id) ?? obligation,
        observed_event_cursor: this.repository.eventCursor(input.board_id),
      };
    });
  }

  reconcileObligations(input: {
    board_id: string;
    goal_id: string;
    contract_revision: number;
    compatible_contract_revisions?: number[];
    created_at?: string;
    desired: ReviewObligationSpec[];
  }): ReviewObligationRecord[] {
    return this.repository.immediate(() => {
      const desiredRoles = new Set(input.desired.map((item) => item.role));
      const compatible = new Set(input.compatible_contract_revisions ?? [input.contract_revision]);
      const existing = this.repository.listReviewObligations(input.board_id, input.goal_id)
        .filter((item) => compatible.has(item.contract_revision));
      for (const item of existing) {
        if (!desiredRoles.has(item.role) && item.state === "pending") {
          this.repository.updateReviewObligation(item.obligation_id, { state: "waived", criterion_scope: [] });
        }
      }
      for (const spec of input.desired) {
        const current = existing.find((item) => item.role === spec.role);
        if (current) {
          if (JSON.stringify(current.criterion_scope) !== JSON.stringify(spec.criterion_scope)) {
            this.repository.updateReviewObligation(current.obligation_id, { criterion_scope: spec.criterion_scope });
          }
          continue;
        }
        const obligation: ReviewObligationRecord = {
          obligation_id: `obligation-${this.id()}`, board_id: input.board_id,
          goal_id: input.goal_id, contract_revision: input.contract_revision,
          role: spec.role, required_count: spec.required_count,
          independence_rule: spec.independence_rule,
          criterion_scope: [...spec.criterion_scope], state: "pending",
          created_at: input.created_at ?? this.now(),
        };
        this.repository.insertReviewObligation(obligation);
      }
      return this.repository.listReviewObligations(input.board_id, input.goal_id);
    });
  }

  reopenSatisfiedObligations(boardId: string, goalId: string): void {
    this.repository.immediate(() => {
      for (const item of this.repository.listReviewObligations(boardId, goalId)) {
        if (item.state === "satisfied") {
          this.repository.updateReviewObligation(item.obligation_id, { state: "pending" });
        }
      }
    });
  }

  reopenObligation(boardId: string, obligationId: string): ReviewObligationRecord {
    return this.repository.immediate(() => {
      const obligation = this.repository.getReviewObligation(boardId, obligationId);
      if (!obligation) {
        throw this.errorFactory("review.obligation_not_found", "找不到这项 Review 要求");
      }
      this.repository.updateReviewObligation(obligationId, { state: "pending" });
      return this.repository.getReviewObligation(boardId, obligationId) ?? obligation;
    });
  }

  waivePendingObligationsForRevision(goalId: string, contractRevision: number): void {
    this.repository.waivePendingObligationsForRevision(goalId, contractRevision);
  }
}

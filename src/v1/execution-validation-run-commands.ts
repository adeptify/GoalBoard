import { randomUUID } from "node:crypto";

import {
  compactGoalActionProjection,
  contractRevisionIsCompatible,
  deriveGoalActionProjection,
  type ReportRunResult as RunReportResult,
} from "@adeptify/goalboard-plugin-goals";

import { GoalBoardV1Error } from "./errors.js";
import type { ActionTransitionReceipt, GoalRecord, RunRecord } from "./types.js";
import type { ExecutionValidationApplicationPorts } from "./execution-validation-ports.js";
import {
  executionValidationRequestHash as requestHash,
  uniqueExecutionValues as unique,
} from "./execution-validation-support.js";

export class ExecutionValidationRunCommands {
  constructor(private readonly ports: ExecutionValidationApplicationPorts) {}

  private get store() { return this.ports.store; }
  private get execution() { return this.ports.execution; }
  private get executionModule() { return this.ports.executionModule; }
  private get governance() { return this.ports.governance; }
  private get clock(): () => Date { return this.ports.clock; }
  private getGoalActionProjection(input: { board_id: string; goal_id: string }) {
    const snapshot = this.store.snapshot(input.board_id);
    const goal = snapshot.goals.find((item) => item.goal_id === input.goal_id);
    if (!goal) throw new GoalBoardV1Error("goal.not_found", `找不到这个 Goal: ${input.goal_id}`);
    return deriveGoalActionProjection(goal, snapshot, this.clock().toISOString());
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
  private readRun(runId: string): RunRecord { return this.ports.readRun(runId); }
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

  requestGoalRework(input: {
    board_id: string;
    goal_id: string;
    actor_id: string;
    criterion_ids: string[];
    reason: string;
    evidence_refs: string[];
    idempotency_key: string;
  }): {
    goal: GoalRecord;
    rework_request_id: string;
    criterion_ids: string[];
    evidence_refs: string[];
    replayed: boolean;
    observed_event_cursor: number;
    transition: ActionTransitionReceipt;
  } {
    const criterionIds = unique(input.criterion_ids.map((item) => item.trim()).filter(Boolean)).sort();
    const evidenceRefs = unique(input.evidence_refs.map((item) => item.trim()).filter(Boolean)).sort();
    const reasonText = input.reason.trim();
    const hash = requestHash({
      board_id: input.board_id,
      goal_id: input.goal_id,
      actor_id: input.actor_id,
      criterion_ids: criterionIds,
      reason: reasonText,
      evidence_refs: evidenceRefs,
    });
    return this.store.immediate(() => {
      const replay = this.replay<{
        goal: GoalRecord;
        rework_request_id: string;
        criterion_ids: string[];
        evidence_refs: string[];
        observed_event_cursor: number;
        transition?: ActionTransitionReceipt;
      }>(input.board_id, input.actor_id, "request_goal_rework", input.idempotency_key, hash);
      if (replay) {
        const projection = this.getGoalActionProjection({
          board_id: input.board_id,
          goal_id: input.goal_id,
        });
        return {
          ...replay,
          transition: replay.transition ?? {
            goal_id: input.goal_id,
            previous_action_token: projection.action_token,
            projection,
            affected_goals: [compactGoalActionProjection(projection)],
            summary: "已记录返工要求",
            observed_event_cursor: replay.observed_event_cursor,
          },
          replayed: true,
        };
      }

      const goal = this.requireGoalOnBoard(input.board_id, input.goal_id);
      if (!reasonText) {
        throw new GoalBoardV1Error("goal.rework_reason_required", "请求返工必须说明哪项既有完成前提已经不成立");
      }
      if (criterionIds.length === 0) {
        throw new GoalBoardV1Error("goal.rework_criterion_required", "请求返工必须指出至少一条受新反证影响的验收条件");
      }
      if (evidenceRefs.length === 0) {
        throw new GoalBoardV1Error("goal.rework_evidence_required", "请求返工必须引用至少一项可追溯的新反证或检查记录");
      }
      const validCriterionIds = new Set(goal.acceptance_criteria.map((criterion) => criterion.criterion_id));
      const invalidCriterionIds = criterionIds.filter((criterionId) => !validCriterionIds.has(criterionId));
      if (invalidCriterionIds.length > 0) {
        throw new GoalBoardV1Error(
          "goal.rework_criterion_invalid",
          `返工请求引用了不属于这条 Goal 的验收条件: ${invalidCriterionIds.join("、")}`,
          { invalid_criterion_ids: invalidCriterionIds },
        );
      }
      if (
        goal.definition_state !== "accepted" ||
        goal.decomposition_state !== "closed_leaf" ||
        goal.fulfillment_state !== "unmet" ||
        goal.validity_state !== "valid" ||
        goal.trashed_at ||
        goal.archived_at
      ) {
        throw new GoalBoardV1Error(
          "goal.rework_state_invalid",
          "只有仍未完成、当前有效且已经接受的最小 Goal 可以从完成前门禁返回返工",
          {
            definition_state: goal.definition_state,
            decomposition_state: goal.decomposition_state,
            fulfillment_state: goal.fulfillment_state,
            validity_state: goal.validity_state,
          },
        );
      }
      const now = this.clock().toISOString();
      const activeClaimId = this.executionModule.repository
        .activeClaimIdsForGoal(input.board_id, input.goal_id, now)[0];
      if (activeClaimId) {
        throw new GoalBoardV1Error(
          "goal.rework_active_claim",
          "这条 Goal 仍有有效 Claim；请在当前工作流内处理新发现，不要并行开启返工",
          { claim_id: activeClaimId },
        );
      }
      const latestWorkRun = this.executionModule.repository.latestRunForGoal(
        input.board_id,
        input.goal_id,
        ["executor", "revalidator"],
      );
      if (!latestWorkRun || latestWorkRun.state !== "completed") {
        throw new GoalBoardV1Error(
          "goal.rework_completed_run_required",
          "只有既有执行已经结束、随后出现新反证时才需要返工请求；未结束的工作应继续当前 Run",
        );
      }
      const projectionBefore = deriveGoalActionProjection(
        goal,
        this.store.snapshot(input.board_id),
        now,
      );
      const currentAction = projectionBefore.primary_action;
      const atCompletionGate = currentAction != null && (
        (currentAction.kind === "review" && currentAction.actor === "user") ||
        currentAction.kind === "accept_risk" ||
        currentAction.kind === "mitigate_risk" ||
        (
          currentAction.kind === "repair" &&
          currentAction.reasons.some((item) => item.code === "action.completion_reconciliation_required")
        )
      );
      if (!atCompletionGate) {
        throw new GoalBoardV1Error(
          "goal.rework_not_at_completion_gate",
          "这条 Goal 当前不在完成前门禁；请按 Available 返回的现有阶段继续，不要制造重复返工",
          { projection: projectionBefore },
        );
      }

      const reworkRequestId = `rework-request-${randomUUID()}`;
      this.governance.reviews.reopenSatisfiedObligations(input.board_id, input.goal_id);
      this.store.appendEvent({
        eventId: reworkRequestId,
        boardId: input.board_id,
        actorId: input.actor_id,
        type: "goal.rework_requested",
        objectType: "goal",
        objectId: input.goal_id,
        reason: reasonText,
        payload: {
          criterion_ids: criterionIds,
          evidence_refs: evidenceRefs,
          previous_display_status: projectionBefore.display_status,
          previous_action_id: currentAction.action_id,
          latest_completed_run_id: latestWorkRun.run_id,
        },
        at: now,
      });
      const transition = this.reconcileLifecycle(
        input.board_id,
        input.goal_id,
        input.actor_id,
        projectionBefore.action_token,
        "已记录返工要求",
        now,
      );
      const outcome = {
        goal: this.requireGoalOnBoard(input.board_id, input.goal_id),
        rework_request_id: reworkRequestId,
        criterion_ids: criterionIds,
        evidence_refs: evidenceRefs,
        observed_event_cursor: transition.observed_event_cursor,
        transition,
      };
      this.remember(
        input.board_id,
        input.actor_id,
        "request_goal_rework",
        input.idempotency_key,
        hash,
        outcome,
        now,
      );
      return { ...outcome, replayed: false };
    });
  }

  reportRun(input: {
    board_id: string;
    run_id: string;
    actor_id: string;
    state: "started" | "blocked" | "completed" | "failed" | "abandoned";
    block_reason?: string | null;
    output_refs?: string[];
    discovery_refs?: string[];
    contract_revision?: number;
    action_token?: string;
    idempotency_key: string;
  }): RunReportResult {
    const hash = requestHash(input);
    const replay = this.replay<Omit<RunReportResult, "replayed">>(
      input.board_id,
      input.actor_id,
      "report_run",
      input.idempotency_key,
      hash,
    );
    if (replay) {
      return { ...replay, replayed: true };
    }
    const leaseRecovery = this.store.immediate(() => {
      const pair = this.execution.query.getRunWithClaim(input.board_id, input.run_id);
      if (!pair) throw new GoalBoardV1Error("run.not_found", `Run 不存在: ${input.run_id}`);
      if (pair.run.actor_id !== input.actor_id) {
        throw new GoalBoardV1Error("run.not_owner", "只有执行者可以报告这个 Run");
      }
      const at = this.clock().toISOString();
      if (pair.claim.state === "active" && pair.claim.expires_at <= at) {
        this.execution.commands.expirePastClaims(input.board_id, input.actor_id);
        return {
          goal_id: pair.run.goal_id,
          claim_id: pair.claim.claim_id,
          run_id: input.run_id,
        };
      }
      if (pair.claim.state === "expired") {
        return {
          goal_id: pair.run.goal_id,
          claim_id: pair.claim.claim_id,
          run_id: input.run_id,
        };
      }
      return null;
    });
    if (leaseRecovery) {
      throw new GoalBoardV1Error(
        "run.claim_expired",
        "Run 对应的 Claim 租约已过期，旧 Runtime 不能再报告终态；请重新领取 Goal",
        {
          ...leaseRecovery,
          next_action: "select_goal",
          requires_user_confirmation: false,
          retry_same_idempotency_key: false,
        },
      );
    }
    return this.store.immediate(() => {
      const replay = this.replay<Omit<RunReportResult, "replayed">>(
        input.board_id,
        input.actor_id,
        "report_run",
        input.idempotency_key,
        hash,
      );
      if (replay) {
        return { ...replay, replayed: true };
      }
      const pair = this.execution.query.getRunWithClaim(input.board_id, input.run_id);
      if (!pair) throw new GoalBoardV1Error("run.not_found", `Run 不存在: ${input.run_id}`);
      if (pair.run.actor_id !== input.actor_id) {
        throw new GoalBoardV1Error("run.not_owner", "只有执行者可以报告这个 Run");
      }
      const previousProjection = this.getGoalActionProjection({
        board_id: input.board_id,
        goal_id: pair.run.goal_id,
      });
      const current = pair.run.state;
      const now = this.clock().toISOString();
      if (current === "completed" && input.state === "completed") {
        const transition = this.reconcileLifecycle(
          input.board_id,
          pair.run.goal_id,
          input.actor_id,
          previousProjection.action_token,
          "本阶段已经完成",
          now,
        );
        const outcome = {
          run: this.readRun(input.run_id),
          observed_event_cursor: transition.observed_event_cursor,
          transition,
        };
        this.remember(input.board_id, input.actor_id, "report_run", input.idempotency_key, hash, outcome, now);
        return { ...outcome, replayed: false };
      }
      const currentGoal = this.requireGoalOnBoard(input.board_id, pair.run.goal_id);
      const revisionSnapshot = this.store.snapshot(input.board_id);
      if (
        pair.claim.state !== "active" ||
        !contractRevisionIsCompatible(currentGoal, revisionSnapshot, pair.claim.contract_revision) ||
        (input.contract_revision != null && !contractRevisionIsCompatible(currentGoal, revisionSnapshot, input.contract_revision))
      ) {
        throw new GoalBoardV1Error(
          "contract.revision_stale",
          "这个 Run 属于旧 Contract revision，写入没有生效。",
          { current_contract_revision: currentGoal.current_contract_revision, projection: previousProjection },
        );
      }
      if (input.action_token && input.action_token !== previousProjection.action_token) {
        throw new GoalBoardV1Error(
          "action.token_stale",
          "报告 Run 前 Goal 已变化；旧写入没有生效。",
          { projection: previousProjection },
        );
      }
      const reported = this.execution.commands.reportRun({
        board_id: input.board_id,
        run_id: input.run_id,
        actor_id: input.actor_id,
        state: input.state,
        block_reason: input.block_reason,
        output_refs: input.output_refs,
        discovery_refs: input.discovery_refs,
      });
      const transition = this.reconcileLifecycle(
        input.board_id,
        pair.run.goal_id,
        input.actor_id,
        previousProjection.action_token,
        input.state === "completed"
          ? "已记录本阶段产物"
          : input.state === "blocked"
            ? "已记录当前卡点"
            : input.state === "failed"
              ? "已记录失败并释放工作"
              : "已更新工作状态",
        now,
      );
      const outcome = {
        run: reported.run,
        observed_event_cursor: transition.observed_event_cursor,
        transition,
      };
      const reportOutcome = outcome;
      this.remember(input.board_id, input.actor_id, "report_run", input.idempotency_key, hash, reportOutcome, now);
      return { ...reportOutcome, replayed: false };
    });
  }

}


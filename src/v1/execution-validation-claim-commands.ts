import type { ExecutionApplicationApi } from "@adeptify/goalboard-contracts/modules/execution";
import type { GoalPolicy } from "@adeptify/goalboard-contracts/modules/goals";
import {
  compactGoalActionProjection,
  deriveGoalActionProjection,
  type ClaimDecision,
  type ClaimReleaseHandoff,
  type ClaimReleaseResult,
  type ClaimRenewRequest,
  type ClaimRenewResult,
  type ClaimRequest,
  type ClaimRunDecision,
} from "@adeptify/goalboard-plugin-goals";

import { GoalBoardV1Error } from "./errors.js";
import type {
  ActionTransitionReceipt,
  BoardSnapshot,
  ClaimRecord,
  ClaimRole,
  DecisionReason,
  GoalAction,
  GoalRecord,
  GoalWorkStateView,
  RunRecord,
} from "./types.js";
import type {
  ExecutionValidationApplicationPorts,
  ExecutionValidationEvaluation,
  ExecutionValidationEvaluationInput,
} from "./execution-validation-ports.js";
import {
  CLAIMABLE_GOAL_ACTION_KINDS,
  CLAIM_RELEASE_HANDOFF,
  compareExecutionValidationReasons as compareReasons,
  executionValidationReason as reason,
  executionValidationRequestHash as requestHash,
} from "./execution-validation-support.js";

export class ExecutionValidationClaimCommands {
  constructor(private readonly ports: ExecutionValidationApplicationPorts) {}

  private get store() { return this.ports.store; }
  private get execution(): ExecutionApplicationApi { return this.ports.execution; }
  private get clock(): () => Date { return this.ports.clock; }

  private evaluate(input: ExecutionValidationEvaluationInput): ExecutionValidationEvaluation {
    return this.ports.evaluate(input);
  }
  private claimRoleForAction(candidate: GoalAction, snapshot: BoardSnapshot): ClaimRole {
    return this.ports.claimRoleForAction(candidate, snapshot);
  }
  private ensureReviewObligations(
    boardId: string,
    goalId: string,
    policy: GoalPolicy,
    at: string,
  ): void {
    this.ports.ensureReviewObligations(boardId, goalId, policy, at);
  }
  private deriveGoalWorkState(
    boardId: string,
    goal: GoalRecord,
    snapshot: BoardSnapshot,
    now: string,
  ): GoalWorkStateView {
    return this.ports.deriveGoalWorkState(boardId, goal, snapshot, now);
  }
  private executorHandoffReasons(workState: GoalWorkStateView): DecisionReason[] {
    return this.ports.executorHandoffReasons(workState);
  }
  private getGoalActionProjection(input: { board_id: string; goal_id: string }) {
    const snapshot = this.store.snapshot(input.board_id);
    const goal = snapshot.goals.find((item) => item.goal_id === input.goal_id);
    if (!goal) throw new GoalBoardV1Error("goal.not_found", `找不到这个 Goal: ${input.goal_id}`);
    return deriveGoalActionProjection(goal, snapshot, this.clock().toISOString());
  }
  private getGoalWorkState(input: { board_id: string; goal_id: string }): GoalWorkStateView {
    const snapshot = this.store.snapshot(input.board_id);
    const goal = snapshot.goals.find((item) => item.goal_id === input.goal_id);
    if (!goal) throw new GoalBoardV1Error("goal.not_found", `找不到这个 Goal: ${input.goal_id}`);
    return this.deriveGoalWorkState(input.board_id, goal, snapshot, this.clock().toISOString());
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

  claimGoal(request: ClaimRequest): ClaimDecision {
    let role = request.role ?? "executor";
    const hash = requestHash({
      board_id: request.board_id,
      goal_id: request.goal_id,
      actor_id: request.actor_id,
      role,
      capabilities: request.capabilities ?? [],
      goal_mode_attestation: request.goal_mode_attestation ?? false,
      lease_seconds: request.lease_seconds ?? null,
      strengthen_policy: request.strengthen_policy ?? null,
      action_id: request.action_id ?? null,
      action_token: request.action_token ?? null,
    });
    return this.store.immediate(() => {
      const replay = this.replay<ClaimDecision>(
        request.board_id,
        request.actor_id,
        "claim_goal",
        request.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };

      this.requireBoard(request.board_id);
      const now = this.clock().toISOString();
      const observedCursor = this.store.eventCursor(request.board_id);
      const snapshot = this.store.snapshot(request.board_id);
      const goal = snapshot.goals.find((item) => item.goal_id === request.goal_id);
      if (!goal) throw new GoalBoardV1Error("goal.not_found", `找不到这个 Goal: ${request.goal_id}`);
      const projection = deriveGoalActionProjection(goal, snapshot, now);
      if (request.action_token && request.action_token !== projection.action_token) {
        throw new GoalBoardV1Error(
          "action.token_stale",
          "这条 Goal 在你操作前已经变化；旧动作未执行，请按最新状态继续。",
          {
            submitted_action_token: request.action_token,
            latest_action_token: projection.action_token,
            projection,
            recovery: "刷新当前 Goal，并使用最新 action_id + action_token 重试。",
          },
        );
      }
      const claimable = projection.actions.filter((candidate) =>
        candidate.actor === "runtime" &&
        candidate.status === "ready" &&
        CLAIMABLE_GOAL_ACTION_KINDS.has(candidate.kind)
      );
      let selectedAction: GoalAction | null = null;
      if (request.action_id) {
        selectedAction = claimable.find((candidate) => candidate.action_id === request.action_id) ?? null;
        if (!selectedAction) {
          throw new GoalBoardV1Error(
            "action.not_available",
            "这个动作已经不可用；没有创建 Claim 或 Run。",
            { action_id: request.action_id, projection },
          );
        }
        const derivedRole = this.claimRoleForAction(selectedAction, snapshot);
        if (request.role && request.role !== derivedRole) {
          throw new GoalBoardV1Error(
            "action.role_mismatch",
            `动作要求 ${derivedRole}，不能按 ${request.role} 领取。`,
            { action_id: selectedAction.action_id, expected_role: derivedRole },
          );
        }
        role = derivedRole;
      } else {
        const legacyCompatibleKinds = new Set<GoalAction["kind"]>([
          "clarify",
          "execute",
          "review",
          "revalidate",
        ]);
        const legacyMatches = claimable.filter((candidate) =>
          legacyCompatibleKinds.has(candidate.kind) &&
          this.claimRoleForAction(candidate, snapshot) === role
        );
        selectedAction = legacyMatches.length === 1 ? legacyMatches[0]! : null;
      }
      const evaluation = this.evaluate({
        boardId: request.board_id,
        goalId: request.goal_id,
        actorId: request.actor_id,
        role,
        capabilities: request.capabilities ?? [],
        goalModeAttestation: request.goal_mode_attestation ?? false,
        strengthenPolicy: request.strengthen_policy,
        now,
        snapshot,
      });
      if (selectedAction?.kind === "mitigate_risk") {
        evaluation.reasons = evaluation.reasons.filter((item) =>
          !(item.subject_type === "risk" && item.subject_id === selectedAction!.target_id)
        );
      }
      const requestedLease = request.lease_seconds ?? evaluation.policy.max_lease_seconds;
      if (!Number.isInteger(requestedLease) || requestedLease <= 0) {
        evaluation.reasons.push(
          reason(
            "lease.duration_invalid",
            "policy",
            request.goal_id,
            "领取时长必须是正整数秒",
            { requested_lease_seconds: requestedLease },
          ),
        );
      } else if (requestedLease > evaluation.policy.max_lease_seconds) {
        evaluation.reasons.push(
          reason(
            "lease.duration_exceeds_policy",
            "policy",
            request.goal_id,
            `领取时长不能超过 ${evaluation.policy.max_lease_seconds} 秒`,
            {
              requested_lease_seconds: requestedLease,
              max_lease_seconds: evaluation.policy.max_lease_seconds,
            },
          ),
        );
      }

      if (evaluation.reasons.length > 0) {
        const decision: ClaimDecision = {
          allowed: false,
          observed_event_cursor: observedCursor,
          reasons: evaluation.reasons.sort(compareReasons),
          claim: null,
          replayed: false,
        };
        this.remember(
          request.board_id,
          request.actor_id,
          "claim_goal",
          request.idempotency_key,
          hash,
          decision,
          now,
        );
        return decision;
      }

      if (!selectedAction) {
        const availableSummary = claimable
          .map((candidate) =>
            `${candidate.kind}:${this.claimRoleForAction(candidate, snapshot)}:${candidate.target_id}`
          )
          .join("、");
        throw new GoalBoardV1Error(
          "action.id_required",
          claimable.length === 0
            ? "当前没有与这个角色唯一匹配的可领取动作。"
            : `当前没有与 ${role} 唯一匹配的动作；可领取动作：${availableSummary}。请指定 action_id，避免领取错 Review 或 Risk。`,
          { role, actions: claimable, projection },
        );
      }

      if (
        role === "executor" ||
        role === "revalidator" ||
        role === "self_verifier" ||
        role === "cross_reviewer" ||
        role === "adversarial_reviewer"
      ) {
        this.ensureReviewObligations(request.board_id, request.goal_id, evaluation.policy, now);
      }
      const claim = this.execution.commands.createAuthorizedClaim({
        board_id: request.board_id,
        goal_id: request.goal_id,
        actor_id: request.actor_id,
        role,
        contract_revision: goal.current_contract_revision,
        action_id: selectedAction.action_id,
        action_kind: selectedAction.kind,
        action_target_id: selectedAction.target_id,
        capabilities: request.capabilities ?? [],
        goal_mode_attestation: request.goal_mode_attestation ?? false,
        resolved_policy: evaluation.policy,
        lease_seconds: requestedLease,
        reason:
          role === "clarifier"
            ? "Runtime 自主领取待澄清 Goal"
            : role === "revalidator"
              ? "Runtime 自主领取待重新验证 Goal"
              : "Runtime 自主领取 Ready Goal",
      });
      const decision: ClaimDecision = {
        allowed: true,
        observed_event_cursor: observedCursor,
        reasons: [],
        claim,
        replayed: false,
      };
      this.remember(
        request.board_id,
        request.actor_id,
        "claim_goal",
        request.idempotency_key,
        hash,
        decision,
        now,
      );
      return decision;
    });
  }

  renewClaim(input: ClaimRenewRequest): ClaimRenewResult {
    const hash = requestHash({
      board_id: input.board_id,
      claim_id: input.claim_id,
      actor_id: input.actor_id,
      lease_seconds: input.lease_seconds ?? null,
    });
    return this.store.immediate(() => {
      const replay = this.replay<Omit<ClaimRenewResult, "replayed" | "transition"> & {
        transition?: ActionTransitionReceipt;
      }>(
        input.board_id,
        input.actor_id,
        "renew_claim",
        input.idempotency_key,
        hash,
      );
      if (replay) {
        const projection = this.getGoalActionProjection({
          board_id: input.board_id,
          goal_id: replay.claim.goal_id,
        });
        return {
          ...replay,
          transition: replay.transition ?? {
            goal_id: replay.claim.goal_id,
            previous_action_token: projection.action_token,
            projection,
            affected_goals: [compactGoalActionProjection(projection)],
            summary: "已续期当前工作",
            observed_event_cursor: replay.observed_event_cursor,
          },
          replayed: true,
        };
      }

      this.requireBoard(input.board_id);
      const now = this.clock().toISOString();
      const claim = this.execution.query.getClaim(input.board_id, input.claim_id);
      if (!claim) throw new GoalBoardV1Error("claim.not_found", `Claim 不存在: ${input.claim_id}`);
      const previousProjection = this.getGoalActionProjection({
        board_id: input.board_id,
        goal_id: claim.goal_id,
      });
      const updated = this.execution.commands.renewClaim({
        board_id: input.board_id,
        claim_id: input.claim_id,
        actor_id: input.actor_id,
        lease_seconds: input.lease_seconds,
      });
      const transition = this.reconcileLifecycle(
        input.board_id,
        claim.goal_id,
        input.actor_id,
        previousProjection.action_token,
        "已续期当前工作",
        now,
      );
      const outcome = {
        claim: updated,
        observed_event_cursor: transition.observed_event_cursor,
        transition,
      };
      this.remember(
        input.board_id,
        input.actor_id,
        "renew_claim",
        input.idempotency_key,
        hash,
        outcome,
        now,
      );
      return { ...outcome, replayed: false };
    });
  }

  /**
   * The normal Runtime entry point after it has chosen an item from
   * `queryAvailable`: both the Claim and its working Run are created in one
   * SQLite transaction. Legacy `claimGoal` / `startRun` remain available for
   * compatibility, but cannot be used by a new Runtime flow to leave a
   * claimed-without-a-Run gap.
   */
  selectGoalAndStart(request: ClaimRequest): ClaimRunDecision {
    const role = request.role ?? "executor";
    const hash = requestHash({
      board_id: request.board_id,
      goal_id: request.goal_id,
      actor_id: request.actor_id,
      role,
      capabilities: request.capabilities ?? [],
      goal_mode_attestation: request.goal_mode_attestation ?? false,
      lease_seconds: request.lease_seconds ?? null,
      strengthen_policy: request.strengthen_policy ?? null,
      action_id: request.action_id ?? null,
      action_token: request.action_token ?? null,
    });
    return this.store.immediate(() => {
      const replay = this.replay<ClaimRunDecision>(
        request.board_id,
        request.actor_id,
        "select_goal_and_start",
        request.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      const previousProjection = this.getGoalActionProjection({
        board_id: request.board_id,
        goal_id: request.goal_id,
      });

      let claimDecision: ClaimDecision;
      try {
        claimDecision = this.claimGoal({
          ...request,
          role,
          idempotency_key: `select-goal-claim:${request.idempotency_key}`,
        });
      } catch (error) {
        if (!(error instanceof GoalBoardV1Error) || error.code !== "action.id_required") throw error;
        const snapshot = this.store.snapshot(request.board_id);
        const goal = snapshot.goals.find((item) => item.goal_id === request.goal_id);
        const workState = goal
          ? this.deriveGoalWorkState(request.board_id, goal, snapshot, this.clock().toISOString())
          : null;
        const compatibilityReasons = workState && role === "executor"
          ? this.executorHandoffReasons(workState)
          : workState?.reasons ?? [];
        const reasons = compatibilityReasons.length
          ? compatibilityReasons
          : previousProjection.primary_action?.reasons.length
            ? previousProjection.primary_action.reasons
            : [reason(
                error.code,
                "goal",
                request.goal_id,
                error.message,
                error.details,
                "刷新动作投影，并明确提交 action_id + action_token。",
              )];
        const outcome: ClaimRunDecision = {
          allowed: false,
          observed_event_cursor: snapshot.cursor,
          reasons,
          claim: null,
          run: null,
          work_state: workState,
          projection: previousProjection,
          transition: null,
          replayed: false,
        };
        this.remember(
          request.board_id,
          request.actor_id,
          "select_goal_and_start",
          request.idempotency_key,
          hash,
          outcome,
          this.clock().toISOString(),
        );
        return outcome;
      }
      if (!claimDecision.allowed || !claimDecision.claim) {
        const outcome: ClaimRunDecision = {
          allowed: false,
          observed_event_cursor: claimDecision.observed_event_cursor,
          reasons: claimDecision.reasons,
          claim: null,
          run: null,
          work_state: null,
          projection: this.getGoalActionProjection({
            board_id: request.board_id,
            goal_id: request.goal_id,
          }),
          transition: null,
          replayed: false,
        };
        const now = this.clock().toISOString();
        this.remember(
          request.board_id,
          request.actor_id,
          "select_goal_and_start",
          request.idempotency_key,
          hash,
          outcome,
          now,
        );
        return outcome;
      }

      const started = this.startRun({
        board_id: request.board_id,
        claim_id: claimDecision.claim.claim_id,
        actor_id: request.actor_id,
        idempotency_key: `select-goal-run:${request.idempotency_key}`,
      });
      const transition = this.reconcileLifecycle(
        request.board_id,
        request.goal_id,
        request.actor_id,
        previousProjection.action_token,
        "已开始推进",
        this.clock().toISOString(),
      );
      const outcome: ClaimRunDecision = {
        allowed: true,
        observed_event_cursor: transition.observed_event_cursor,
        reasons: [],
        claim: claimDecision.claim,
        run: started.run,
        work_state: this.getGoalWorkState({
          board_id: request.board_id,
          goal_id: request.goal_id,
        }),
        projection: transition.projection,
        transition,
        replayed: false,
      };
      this.remember(
        request.board_id,
        request.actor_id,
        "select_goal_and_start",
        request.idempotency_key,
        hash,
        outcome,
        this.clock().toISOString(),
      );
      return outcome;
    });
  }

  releaseClaim(input: {
    board_id: string;
    claim_id: string;
    actor_id: string;
    reason: string;
    idempotency_key: string;
  }): ClaimReleaseResult {
    const hash = requestHash({
      board_id: input.board_id,
      claim_id: input.claim_id,
      actor_id: input.actor_id,
      reason: input.reason,
    });
    const replay = this.replay<{
      claim: ClaimRecord;
      observed_event_cursor: number;
      handoff?: ClaimReleaseHandoff;
      transition?: ActionTransitionReceipt;
    }>(
      input.board_id,
      input.actor_id,
      "release_claim",
      input.idempotency_key,
      hash,
    );
    if (replay) {
      const projection = this.getGoalActionProjection({
        board_id: input.board_id,
        goal_id: replay.claim.goal_id,
      });
      return {
        ...replay,
        handoff: CLAIM_RELEASE_HANDOFF,
        transition: replay.transition ?? {
          goal_id: replay.claim.goal_id,
          previous_action_token: projection.action_token,
          projection,
          affected_goals: [compactGoalActionProjection(projection)],
          summary: "已结束当前工作",
          observed_event_cursor: replay.observed_event_cursor,
        },
        replayed: true,
      };
    }
    const leaseRecovery = this.store.immediate(() => {
      this.requireBoard(input.board_id);
      const claim = this.execution.query.getClaim(input.board_id, input.claim_id);
      if (!claim) throw new GoalBoardV1Error("claim.not_found", `Claim 不存在: ${input.claim_id}`);
      if (claim.actor_id !== input.actor_id) {
        throw new GoalBoardV1Error("claim.not_owner", "只有领取者可以释放 Claim");
      }
      const at = this.clock().toISOString();
      if (claim.state === "active" && claim.expires_at <= at) {
        this.execution.commands.expirePastClaims(input.board_id, input.actor_id);
        return {
          goal_id: claim.goal_id,
          claim_id: input.claim_id,
        };
      }
      if (claim.state === "expired") {
        return {
          goal_id: claim.goal_id,
          claim_id: input.claim_id,
        };
      }
      return null;
    });
    if (leaseRecovery) {
      throw new GoalBoardV1Error(
        "claim.lease_expired",
        "Claim 租约已过期，旧 Runtime 不需要再释放；请重新领取 Goal",
        {
          ...leaseRecovery,
          next_action: "select_goal",
          requires_user_confirmation: false,
          retry_same_idempotency_key: false,
        },
      );
    }
    return this.store.immediate(() => {
      const replay = this.replay<{
        claim: ClaimRecord;
        observed_event_cursor: number;
        handoff?: ClaimReleaseHandoff;
        transition?: ActionTransitionReceipt;
      }>(
        input.board_id,
        input.actor_id,
        "release_claim",
        input.idempotency_key,
        hash,
      );
      if (replay) {
        const projection = this.getGoalActionProjection({
          board_id: input.board_id,
          goal_id: replay.claim.goal_id,
        });
        return {
          ...replay,
          handoff: CLAIM_RELEASE_HANDOFF,
          transition: replay.transition ?? {
            goal_id: replay.claim.goal_id,
            previous_action_token: projection.action_token,
            projection,
            affected_goals: [compactGoalActionProjection(projection)],
            summary: "已结束当前工作",
            observed_event_cursor: replay.observed_event_cursor,
          },
          replayed: true,
        };
      }
      this.requireBoard(input.board_id);
      const claim = this.execution.query.getClaim(input.board_id, input.claim_id);
      if (!claim) throw new GoalBoardV1Error("claim.not_found", `Claim 不存在: ${input.claim_id}`);
      if (claim.actor_id !== input.actor_id) {
        throw new GoalBoardV1Error("claim.not_owner", "只有领取者可以释放 Claim");
      }
      const goalId = claim.goal_id;
      const previousProjection = this.getGoalActionProjection({
        board_id: input.board_id,
        goal_id: goalId,
      });
      if (claim.state === "released") {
        const projection = this.getGoalActionProjection({
          board_id: input.board_id,
          goal_id: goalId,
        });
        const transition: ActionTransitionReceipt = {
          goal_id: goalId,
          previous_action_token: previousProjection.action_token,
          projection,
          affected_goals: [compactGoalActionProjection(projection)],
          summary: "工作已经结束",
          observed_event_cursor: this.store.eventCursor(input.board_id),
        };
        const outcome = {
          claim,
          observed_event_cursor: transition.observed_event_cursor,
          handoff: CLAIM_RELEASE_HANDOFF,
          transition,
        };
        this.remember(
          input.board_id,
          input.actor_id,
          "release_claim",
          input.idempotency_key,
          hash,
          outcome,
          this.clock().toISOString(),
        );
        return { ...outcome, replayed: false };
      }
      if (claim.state !== "active") {
        throw new GoalBoardV1Error("claim.not_active", "Claim 已经不是 active 状态");
      }
      const at = this.clock().toISOString();
      const ended = this.execution.commands.releaseClaim({
        board_id: input.board_id,
        claim_id: input.claim_id,
        actor_id: input.actor_id,
        reason: input.reason,
        active_run_reason: `Claim 被领取者释放：${input.reason}`,
      });
      const transition = this.reconcileLifecycle(
        input.board_id,
        goalId,
        input.actor_id,
        previousProjection.action_token,
        "已结束当前工作",
        at,
      );
      const outcome = {
        claim: ended.claim,
        observed_event_cursor: transition.observed_event_cursor,
        handoff: CLAIM_RELEASE_HANDOFF,
        transition,
      };
      this.remember(
        input.board_id,
        input.actor_id,
        "release_claim",
        input.idempotency_key,
        hash,
        outcome,
        at,
      );
      return { ...outcome, replayed: false };
    });
  }

  /**
   * Management/system recovery can revoke a stalled Claim without pretending
   * that the original Runtime still owns its Run. Runtime callers only get
   * the owner-scoped `releaseClaim` surface.
   */
  revokeClaim(input: {
    board_id: string;
    claim_id: string;
    actor_id: string;
    reason: string;
    idempotency_key: string;
  }): {
    claim: ClaimRecord;
    replayed: boolean;
    observed_event_cursor: number;
    transition: ActionTransitionReceipt;
  } {
    const hash = requestHash({
      board_id: input.board_id,
      claim_id: input.claim_id,
      actor_id: input.actor_id,
      reason: input.reason,
    });
    return this.store.immediate(() => {
      const replay = this.replay<{
        claim: ClaimRecord;
        observed_event_cursor: number;
        transition?: ActionTransitionReceipt;
      }>(
        input.board_id,
        input.actor_id,
        "revoke_claim",
        input.idempotency_key,
        hash,
      );
      if (replay) {
        const projection = this.getGoalActionProjection({
          board_id: input.board_id,
          goal_id: replay.claim.goal_id,
        });
        return {
          ...replay,
          transition: replay.transition ?? {
            goal_id: replay.claim.goal_id,
            previous_action_token: projection.action_token,
            projection,
            affected_goals: [compactGoalActionProjection(projection)],
            summary: "已撤销当前工作",
            observed_event_cursor: replay.observed_event_cursor,
          },
          replayed: true,
        };
      }
      this.requireBoard(input.board_id);
      const claim = this.execution.query.getClaim(input.board_id, input.claim_id);
      if (!claim) throw new GoalBoardV1Error("claim.not_found", `Claim 不存在: ${input.claim_id}`);
      if (claim.state !== "active") {
        throw new GoalBoardV1Error("claim.not_active", "Claim 已经不是 active 状态");
      }
      const goalId = claim.goal_id;
      const previousProjection = this.getGoalActionProjection({
        board_id: input.board_id,
        goal_id: goalId,
      });
      const at = this.clock().toISOString();
      const ended = this.execution.commands.revokeClaim({
        board_id: input.board_id,
        claim_id: input.claim_id,
        actor_id: input.actor_id,
        reason: input.reason,
        active_run_reason: `Claim 被撤销：${input.reason}`,
      });
      const transition = this.reconcileLifecycle(
        input.board_id,
        goalId,
        input.actor_id,
        previousProjection.action_token,
        "已撤销当前工作",
        at,
      );
      const outcome = {
        claim: ended.claim,
        observed_event_cursor: transition.observed_event_cursor,
        transition,
      };
      this.remember(
        input.board_id,
        input.actor_id,
        "revoke_claim",
        input.idempotency_key,
        hash,
        outcome,
        at,
      );
      return { ...outcome, replayed: false };
    });
  }

  startRun(input: {
    board_id: string;
    claim_id: string;
    actor_id: string;
    idempotency_key: string;
  }): { run: RunRecord; replayed: boolean; observed_event_cursor: number } {
    const hash = requestHash({
      board_id: input.board_id,
      claim_id: input.claim_id,
      actor_id: input.actor_id,
    });
    return this.store.immediate(() => {
      const replay = this.replay<{ run: RunRecord; observed_event_cursor: number }>(
        input.board_id,
        input.actor_id,
        "start_run",
        input.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      this.requireBoard(input.board_id);
      const now = this.clock().toISOString();
      const run = this.execution.commands.startRun({
        board_id: input.board_id,
        claim_id: input.claim_id,
        actor_id: input.actor_id,
      });
      const cursor = this.store.eventCursor(input.board_id);
      const outcome = { run, observed_event_cursor: cursor };
      this.remember(input.board_id, input.actor_id, "start_run", input.idempotency_key, hash, outcome, now);
      return { ...outcome, replayed: false };
    });
  }
}

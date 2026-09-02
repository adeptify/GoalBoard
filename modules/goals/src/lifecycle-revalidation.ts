import { randomUUID } from "node:crypto";

import type {
  GoalLifecycleReason,
  GoalRevalidationDecision,
  GoalRevalidationInput,
  GoalRecord,
  GoalValidityState,
} from "@adeptify/goalboard-contracts/modules/goals";

import { GoalsCommandContext, requestHash, unique } from "./command-support.js";
import {
  compareLifecycleReasons,
  dependencyReasons,
  lifecycleReason,
} from "./lifecycle-reasons.js";
import type { GoalsLifecycleHooks } from "./lifecycle-ports.js";
import { rowText } from "./repository.js";

type Row = Record<string, unknown>;
const reason = lifecycleReason;
const compareReasons = compareLifecycleReasons;

export class GoalRevalidationCommands<TTransition> {
  constructor(
    private readonly context: GoalsCommandContext,
    private readonly hooks: GoalsLifecycleHooks<TTransition>,
  ) {}

  setValidityState(
    boardId: string,
    goalId: string,
    validityState: GoalValidityState,
    at: string,
  ): GoalRecord {
    this.context.requireGoal(boardId, goalId);
    this.context.repository.db.prepare(`
      UPDATE goals SET validity_state = ?, updated_at = ?
      WHERE board_id = ? AND goal_id = ?
    `).run(validityState, at, boardId, goalId);
    return this.context.requireGoal(boardId, goalId);
  }

  revalidate(input: GoalRevalidationInput): GoalRevalidationDecision<TTransition> {
    const hash = requestHash(input);
    return this.context.repository.immediate(() => {
      const replay = this.context.replay<Omit<GoalRevalidationDecision<TTransition>, "replayed">>(
        input.board_id,
        input.actor_id,
        "revalidate_goal",
        input.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      this.context.requireBoard(input.board_id);
      const reasonText = input.reason.trim();
      const evidenceRefs = unique(input.evidence_refs.map((item) => item.trim()).filter(Boolean));
      if (!reasonText) {
        throw this.context.error("revalidation.reason_required", "重新验证必须说明核对结论");
      }
      if (evidenceRefs.length === 0) {
        throw this.context.error("revalidation.evidence_required", "重新验证必须引用至少一项核对证据");
      }
      const now = this.context.now().toISOString();
      const run = this.requiredHook("readRevalidationRun")(input.board_id, input.run_id);
      if (!run) throw this.context.error("run.not_found", `Run 不存在: ${input.run_id}`);
      if (run.goal_id !== input.goal_id) {
        throw this.context.error("revalidation.goal_mismatch", "这个 Run 领取的不是待重新验证的 Goal");
      }
      if (run.actor_id !== input.actor_id || run.claim_actor_id !== input.actor_id) {
        throw this.context.error("run.not_owner", "只有这个 Run 的领取者可以提交重新验证");
      }
      if (run.role !== "revalidator" || run.claim_role !== "revalidator") {
        throw this.context.error("revalidation.role_required", "只有 revalidator Run 可以恢复 Goal 的可信状态");
      }
      if (run.claim_state !== "active" || run.claim_expires_at <= now) {
        throw this.context.error("revalidation.claim_inactive", "重新验证 Claim 已释放、撤销或过期");
      }
      if (run.state !== "started") {
        throw this.context.error("revalidation.run_not_started", "重新验证只能由正在执行的 Run 提交");
      }
      const goal = this.context.requireGoal(input.board_id, input.goal_id);
      const previousProjection = this.requiredHook("currentActionProjection")(input.board_id, input.goal_id);
      const compatible = this.requiredHook("isContractRevisionCompatible");
      if (
        !compatible(input.board_id, input.goal_id, run.claim_contract_revision) ||
        (input.contract_revision != null && !compatible(input.board_id, input.goal_id, input.contract_revision))
      ) {
        throw this.context.error(
          "contract.revision_stale",
          "重新验证 Run 属于旧 Contract revision。",
          { current_contract_revision: goal.current_contract_revision, projection: previousProjection },
        );
      }
      if (input.action_token && input.action_token !== previousProjection.action_token) {
        throw this.context.error(
          "action.token_stale",
          "提交重新验证前 Goal 已变化；旧写入未生效。",
          { projection: previousProjection },
        );
      }
      if (goal.trashed_at) {
        throw this.context.error("goal.trashed", "回收站中的 Goal 不能重新验证");
      }
      const reasons: GoalLifecycleReason[] = [];
      if (goal.definition_state !== "accepted") {
        reasons.push(reason("goal.not_accepted", "goal", goal.goal_id, "Goal 还没有被接受"));
      }
      if (goal.decomposition_state !== "closed_leaf") {
        reasons.push(reason(
          "goal.not_closed_leaf",
          "goal",
          goal.goal_id,
          "这个 Goal 还不是可以直接验证的最小 Goal",
          { decomposition_state: goal.decomposition_state },
        ));
      }
      if (goal.acceptance_criteria.length === 0) {
        reasons.push(reason("goal.acceptance_missing", "criterion", goal.goal_id, "Goal 没有明确验收条件"));
      }
      if (goal.validity_state === "valid") {
        reasons.push(reason("goal.revalidation_not_needed", "goal", goal.goal_id, "Goal 当前已经是可信状态"));
      } else if (goal.validity_state === "invalidated") {
        reasons.push(reason("goal.invalidated", "goal", goal.goal_id, "Goal 已失效，不能通过重新验证直接恢复"));
      }
      reasons.push(...dependencyReasons(this.context, input.board_id, input.goal_id, "revalidate"));
      const risks = this.context.repository.db.prepare(`
        SELECT r.* FROM risks r
        JOIN goal_risks gr ON gr.risk_id = r.risk_id
        WHERE gr.goal_id = ?
          AND r.state IN ('open', 'triggered')
          AND r.blocking_mode <> 'none'
        ORDER BY r.risk_id
      `).all(input.goal_id) as Row[];
      for (const risk of risks) {
        reasons.push(reason(
          "risk.blocks_revalidation",
          "risk",
          rowText(risk.risk_id),
          `风险仍未解除：${rowText(risk.description)}`,
          { blocking_mode: rowText(risk.blocking_mode), state: rowText(risk.state) },
          rowText(risk.revisit_condition),
        ));
      }
      if (reasons.length > 0) {
        const outcome: Omit<GoalRevalidationDecision<TTransition>, "replayed"> = {
          revalidated: false,
          goal,
          observed_event_cursor: this.context.repository.eventCursor(input.board_id),
          reasons: reasons.sort(compareReasons),
        };
        this.context.remember(input.board_id, input.actor_id, "revalidate_goal", input.idempotency_key, hash, outcome, now);
        return { ...outcome, replayed: false };
      }
      this.context.repository.db
        .prepare("UPDATE goals SET validity_state = 'valid', updated_at = ? WHERE goal_id = ?")
        .run(now, input.goal_id);
      this.context.repository.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId: input.actor_id,
        type: "goal.revalidated",
        objectType: "goal",
        objectId: input.goal_id,
        reason: reasonText,
        payload: {
          run_id: input.run_id,
          evidence_refs: evidenceRefs,
          previous_validity_state: goal.validity_state,
        },
        at: now,
      });
      this.requiredHook("completeRevalidationRun")(
        input.board_id,
        input.goal_id,
        input.run_id,
        input.actor_id,
        now,
      );
      const transition = this.requiredHook("reconcileLifecycle")(
        input.board_id,
        input.goal_id,
        input.actor_id,
        previousProjection.action_token,
        "已完成重新验证",
        now,
      );
      const outcome: Omit<GoalRevalidationDecision<TTransition>, "replayed"> = {
        revalidated: true,
        goal: this.context.requireGoal(input.board_id, input.goal_id),
        observed_event_cursor: (transition as TTransition & { observed_event_cursor: number }).observed_event_cursor,
        reasons: [],
        transition,
      };
      this.context.remember(input.board_id, input.actor_id, "revalidate_goal", input.idempotency_key, hash, outcome, now);
      return { ...outcome, replayed: false };
    });
  }


  private requiredHook<K extends keyof GoalsLifecycleHooks<TTransition>>(
    name: K,
  ): NonNullable<GoalsLifecycleHooks<TTransition>[K]> {
    const hook = this.hooks[name];
    if (!hook) {
      throw this.context.error(
        "goals.lifecycle_port_missing",
        `Goals lifecycle port 未配置: ${String(name)}`,
      );
    }
    return hook as NonNullable<GoalsLifecycleHooks<TTransition>[K]>;
  }
}

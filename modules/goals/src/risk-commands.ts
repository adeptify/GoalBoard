import { randomUUID } from "node:crypto";

import type {
  GoalValidityState,
  GoalsActorWrite,
  RiskFactsInput,
  RiskRecord,
  SetRiskStateInput,
  UpdateRiskInput,
} from "@adeptify/goalboard-contracts/modules/goals";

import { GoalsCommandContext, requestHash, unique } from "./command-support.js";
import { sqliteJson } from "./repository.js";

export interface GoalsRiskLifecycleHooks<TTransition> {
  currentActionToken(boardId: string, goalId: string): string;
  authorizeRiskUpdate(
    boardId: string,
    input: UpdateRiskInput,
    write: GoalsActorWrite,
    current: RiskRecord,
  ): void;
  authorizeRiskState(
    boardId: string,
    input: SetRiskStateInput,
    write: GoalsActorWrite,
    current: RiskRecord,
    linkedGoalIds: string[],
    resolutionBasis: RiskRecord["resolution_basis"],
  ): void;
  reconcileLifecycle(
    boardId: string,
    goalId: string,
    actorId: string,
    previousActionToken: string,
    summary: string,
    at: string,
  ): TTransition;
  reopenCompoundAncestorsForUntrustedChild?(
    boardId: string,
    childGoalId: string,
    actorId: string,
    at: string,
    reason: string,
    excludedParentGoalId?: string,
  ): number;
}

export class RiskCommands<TTransition> {
  constructor(
    private readonly context: GoalsCommandContext,
    private readonly lifecycle: GoalsRiskLifecycleHooks<TTransition>,
  ) {}

  addRisk(
    boardId: string,
    input: RiskFactsInput,
    write: GoalsActorWrite,
  ): {
    risk: RiskRecord;
    transitions: TTransition[];
    replayed: boolean;
    observed_event_cursor: number;
  } {
    const hash = requestHash({ board_id: boardId, ...input });
    const repository = this.context.repository;
    return repository.immediate(() => {
      const replay = this.context.replay<{
        risk: RiskRecord;
        transitions?: TTransition[];
        observed_event_cursor: number;
      }>(boardId, write.actor_id, "add_risk", write.idempotency_key, hash);
      if (replay) return { ...replay, transitions: replay.transitions ?? [], replayed: true };
      this.context.requireBoard(boardId);
      const facts = this.normalizeRiskFacts(boardId, input);
      const previousTokens = new Map(
        facts.goal_ids.map((goalId) => [
          goalId,
          this.lifecycle.currentActionToken(boardId, goalId),
        ]),
      );
      const riskId = input.risk_id?.trim() || `risk-${randomUUID()}`;
      const now = this.context.now().toISOString();
      repository.db.prepare(`
        INSERT INTO risks (
          risk_id, board_id, description, probability, impact,
          affected_surfaces_json, trigger, treatment, treatment_plan, blocking_mode,
          revisit_condition, owner, state, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
      `).run(
        riskId,
        boardId,
        facts.description,
        facts.probability,
        facts.impact,
        sqliteJson(facts.affected_surfaces),
        facts.trigger,
        facts.treatment,
        facts.treatment_plan,
        facts.blocking_mode,
        facts.revisit_condition,
        facts.owner,
        now,
        now,
      );
      const link = repository.db.prepare(
        "INSERT INTO goal_risks (goal_id, risk_id) VALUES (?, ?)",
      );
      for (const goalId of facts.goal_ids) link.run(goalId, riskId);
      repository.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId: write.actor_id,
        type: "risk.created",
        objectType: "risk",
        objectId: riskId,
        reason: write.reason ?? "登记 Goal 风险",
        payload: { goal_ids: facts.goal_ids, blocking_mode: facts.blocking_mode },
        at: now,
      });
      const transitions = facts.goal_ids.map((goalId) =>
        this.lifecycle.reconcileLifecycle(
          boardId,
          goalId,
          write.actor_id,
          previousTokens.get(goalId)!,
          facts.blocking_mode === "none" || facts.treatment === "defer"
            ? "已记录风险，不新增用户待办"
            : facts.treatment === "accept"
              ? "已记录风险，等待用户决定"
              : "已记录风险，可继续处理",
          now,
        ),
      );
      const risk = repository.getRisk(boardId, riskId);
      if (!risk) throw new Error("Risk 写入后无法读取");
      const outcome = {
        risk,
        transitions,
        observed_event_cursor: repository.eventCursor(boardId),
      };
      this.context.remember(
        boardId,
        write.actor_id,
        "add_risk",
        write.idempotency_key,
        hash,
        outcome,
        now,
      );
      return { ...outcome, replayed: false };
    });
  }

  updateRisk(
    boardId: string,
    input: UpdateRiskInput,
    write: GoalsActorWrite,
  ): {
    risk: RiskRecord;
    transitions: TTransition[];
    replayed: boolean;
    observed_event_cursor: number;
  } {
    const hash = requestHash({ board_id: boardId, ...input, reason: write.reason });
    const repository = this.context.repository;
    return repository.immediate(() => {
      const replay = this.context.replay<{
        risk: RiskRecord;
        transitions?: TTransition[];
        observed_event_cursor: number;
      }>(boardId, write.actor_id, "update_risk", write.idempotency_key, hash);
      if (replay) return { ...replay, transitions: replay.transitions ?? [], replayed: true };
      this.context.requireBoard(boardId);
      const reasonText = write.reason?.trim();
      if (!reasonText) {
        throw this.context.error("risk.reason_required", "更新 Risk 时必须说明原因");
      }
      const riskId = input.risk_id.trim();
      const previous = repository.getRisk(boardId, riskId);
      if (!previous) throw this.context.error("risk.not_found", `Risk 不存在: ${riskId}`);
      const actionContextValues = [
        input.action_goal_id,
        input.contract_revision,
        input.action_id,
        input.action_token,
      ];
      if (actionContextValues.some((value) => value != null)) {
        if (actionContextValues.some((value) => value == null || value === "")) {
          throw this.context.error(
            "action.context_incomplete",
            "Risk 决定必须同时提交 goal、Contract revision、action_id 和 action_token。",
          );
        }
        if (!input.goal_ids.includes(input.action_goal_id!)) {
          throw this.context.error("risk.goal_mismatch", "Risk 决定不属于指定 Goal。");
        }
      }
      this.lifecycle.authorizeRiskUpdate(boardId, input, write, previous);
      const facts = this.normalizeRiskFacts(boardId, input);
      const previousGoalIds = repository.listRiskGoalIds(riskId);
      const affectedGoalIds = unique([...previousGoalIds, ...facts.goal_ids]).sort();
      const previousTokens = new Map(
        affectedGoalIds.map((goalId) => [
          goalId,
          this.lifecycle.currentActionToken(boardId, goalId),
        ]),
      );
      const state = previous.state;
      const now = this.context.now().toISOString();
      repository.db.prepare(`
        UPDATE risks SET
          description = ?, probability = ?, impact = ?, affected_surfaces_json = ?,
          trigger = ?, treatment = ?, treatment_plan = ?, blocking_mode = ?, revisit_condition = ?, owner = ?, updated_at = ?
        WHERE risk_id = ? AND board_id = ?
      `).run(
        facts.description,
        facts.probability,
        facts.impact,
        sqliteJson(facts.affected_surfaces),
        facts.trigger,
        facts.treatment,
        facts.treatment_plan,
        facts.blocking_mode,
        facts.revisit_condition,
        facts.owner,
        now,
        riskId,
        boardId,
      );
      repository.db.prepare("DELETE FROM goal_risks WHERE risk_id = ?").run(riskId);
      const link = repository.db.prepare(
        "INSERT INTO goal_risks (goal_id, risk_id) VALUES (?, ?)",
      );
      for (const goalId of facts.goal_ids) link.run(goalId, riskId);

      const wasInvalidating = previous.blocking_mode === "invalidate_on_trigger" && state === "triggered";
      const isInvalidating = facts.blocking_mode === "invalidate_on_trigger" && state === "triggered";
      const nextInvalidated = new Set(isInvalidating ? facts.goal_ids : []);
      if (wasInvalidating) {
        for (const goalId of previousGoalIds.filter((item) => !nextInvalidated.has(item))) {
          repository.db.prepare(`
            UPDATE goals SET validity_state = 'needs_revalidation', updated_at = ? WHERE goal_id = ?
          `).run(now, goalId);
        }
      }
      if (isInvalidating) {
        for (const goalId of facts.goal_ids) {
          repository.db.prepare(`
            UPDATE goals SET validity_state = 'invalidated', updated_at = ? WHERE goal_id = ?
          `).run(now, goalId);
        }
      }

      let cursor = repository.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId: write.actor_id,
        type: "risk.updated",
        objectType: "risk",
        objectId: riskId,
        reason: reasonText,
        payload: {
          previous_goal_ids: previousGoalIds,
          goal_ids: facts.goal_ids,
          previous_blocking_mode: previous.blocking_mode,
          blocking_mode: facts.blocking_mode,
          state,
        },
        at: now,
      });
      if (wasInvalidating || isInvalidating) {
        for (const goalId of unique([...previousGoalIds, ...facts.goal_ids])) {
          cursor = this.lifecycle.reopenCompoundAncestorsForUntrustedChild?.(
            boardId,
            goalId,
            write.actor_id,
            now,
            "子 Goal 关联的失效型 Risk 发生变化",
          ) ?? cursor;
        }
      }
      const risk = repository.getRisk(boardId, riskId);
      if (!risk) throw new Error("Risk 更新后无法读取");
      const transitions = affectedGoalIds.map((goalId) =>
        this.lifecycle.reconcileLifecycle(
          boardId,
          goalId,
          write.actor_id,
          previousTokens.get(goalId)!,
          facts.treatment === "accept" ? "风险改为等待你的决定" : "已更新风险处理方式",
          now,
        ),
      );
      const outcome = {
        risk,
        transitions,
        observed_event_cursor: Math.max(cursor, repository.eventCursor(boardId)),
      };
      this.context.remember(
        boardId,
        write.actor_id,
        "update_risk",
        write.idempotency_key,
        hash,
        outcome,
        now,
      );
      return { ...outcome, replayed: false };
    });
  }

  setRiskState(
    boardId: string,
    input: SetRiskStateInput,
    write: GoalsActorWrite,
  ): {
    risk: RiskRecord;
    transitions: TTransition[];
    replayed: boolean;
    observed_event_cursor: number;
  } {
    const hash = requestHash({ board_id: boardId, ...input });
    const repository = this.context.repository;
    return repository.immediate(() => {
      const replay = this.context.replay<{
        risk: RiskRecord;
        transitions?: TTransition[];
        observed_event_cursor: number;
      }>(boardId, write.actor_id, "set_risk_state", write.idempotency_key, hash);
      if (replay) return { ...replay, transitions: replay.transitions ?? [], replayed: true };
      if (!RISK_STATES.has(input.state)) {
        throw this.context.error(
          "risk.state_invalid",
          "Risk 状态必须是开放、已触发、已解决、已接受或已过期",
        );
      }
      const reasonText = input.reason.trim();
      if (!reasonText) {
        throw this.context.error("risk.reason_required", "变更 Risk 状态时必须说明原因");
      }
      const resolutionBasis = normalizeResolutionBasis(input, this.context);
      const current = repository.getRisk(boardId, input.risk_id);
      if (!current) {
        throw this.context.error("risk.not_found", `Risk 不存在: ${input.risk_id}`);
      }
      if (write.actor_kind === "runtime") {
        if (input.state === "accepted" || current.treatment === "accept") {
          throw this.context.error(
            "risk.user_acceptance_required",
            "Runtime 不能代替用户接受残余风险。",
          );
        }
        if (current.treatment !== "mitigate" && current.treatment !== "avoid") {
          throw this.context.error(
            "risk.runtime_treatment_forbidden",
            "Runtime 只能处理 mitigate 或 avoid Risk。",
          );
        }
      }
      if (input.state === "accepted" && current.treatment !== "accept") {
        throw this.context.error(
          "risk.acceptance_not_requested",
          "这条 Risk 的既定处理方式不是 accept；请先通过显式 Proposal 修改处理方式。",
        );
      }
      const linkedGoalIds = repository.listRiskGoalIds(input.risk_id);
      if (input.goal_id && !linkedGoalIds.includes(input.goal_id)) {
        throw this.context.error("risk.goal_mismatch", "Risk 没有关联到指定 Goal");
      }
      const actionContextValues = [
        input.goal_id,
        input.contract_revision,
        input.action_id,
        input.action_token,
      ];
      if (
        actionContextValues.some((value) => value != null) &&
        actionContextValues.some((value) => value == null || value === "")
      ) {
        throw this.context.error(
          "action.context_incomplete",
          "Risk 动作必须同时提交 goal、Contract revision、action_id 和 action_token。",
        );
      }
      this.lifecycle.authorizeRiskState(
        boardId,
        input,
        write,
        current,
        linkedGoalIds,
        resolutionBasis,
      );
      const previousTokens = new Map(
        linkedGoalIds.map((goalId) => [
          goalId,
          this.lifecycle.currentActionToken(boardId, goalId),
        ]),
      );
      const now = this.context.now().toISOString();
      repository.db.prepare(`
        UPDATE risks SET state = ?, resolution_basis_json = ?, updated_at = ? WHERE risk_id = ?
      `).run(
        input.state,
        resolutionBasis == null ? null : sqliteJson(resolutionBasis),
        now,
        input.risk_id,
      );
      let validity: GoalValidityState | null = null;
      if (current.blocking_mode === "invalidate_on_trigger") {
        validity = input.state === "triggered"
          ? "invalidated"
          : current.state === "triggered"
            ? "needs_revalidation"
            : null;
        if (validity) {
          for (const goalId of linkedGoalIds) {
            repository.db.prepare(`
              UPDATE goals SET validity_state = ?, updated_at = ? WHERE goal_id = ?
            `).run(validity, now, goalId);
          }
        }
      }
      let cursor = repository.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId: write.actor_id,
        type: `risk.${input.state}`,
        objectType: "risk",
        objectId: input.risk_id,
        reason: reasonText,
        payload: {
          previous_state: current.state,
          state: input.state,
          resolution_basis: resolutionBasis,
          blocking_mode: current.blocking_mode,
          linked_goal_ids: linkedGoalIds,
        },
        at: now,
      });
      if (validity) {
        for (const goalId of linkedGoalIds) {
          cursor = this.lifecycle.reopenCompoundAncestorsForUntrustedChild?.(
            boardId,
            goalId,
            write.actor_id,
            now,
            "子 Goal 关联的失效型 Risk 改变了可信状态",
          ) ?? cursor;
        }
      }
      const transitions = linkedGoalIds.map((goalId) =>
        this.lifecycle.reconcileLifecycle(
          boardId,
          goalId,
          write.actor_id,
          previousTokens.get(goalId)!,
          input.state === "accepted" ? "已记录风险决定" : "已更新风险状态",
          now,
        ),
      );
      const risk = repository.getRisk(boardId, input.risk_id);
      if (!risk) throw new Error("Risk 状态更新后无法读取");
      const outcome = {
        risk,
        transitions,
        observed_event_cursor: Math.max(cursor, repository.eventCursor(boardId)),
      };
      this.context.remember(
        boardId,
        write.actor_id,
        "set_risk_state",
        write.idempotency_key,
        hash,
        outcome,
        now,
      );
      return { ...outcome, replayed: false };
    });
  }

  normalizeRiskFacts(
    boardId: string,
    input: Omit<RiskFactsInput, "risk_id">,
  ): Omit<RiskFactsInput, "risk_id" | "affected_surfaces"> & { affected_surfaces: string[] } {
    const goalIds = unique(input.goal_ids.map((item) => item.trim()).filter(Boolean));
    const description = input.description.trim();
    const probability = input.probability.trim();
    const impact = input.impact.trim();
    const affectedSurfaces = unique(
      (input.affected_surfaces ?? []).map((item) => item.trim()).filter(Boolean),
    );
    const trigger = input.trigger.trim();
    const treatmentPlan = input.treatment_plan?.trim() ?? "";
    const revisitCondition = input.revisit_condition.trim();
    const owner = input.owner.trim();
    if (!goalIds.length) {
      throw this.context.error("risk.goal_required", "Risk 必须关联至少一个 Goal");
    }
    if (!description || !probability || !impact || !trigger || !revisitCondition || !owner) {
      throw this.context.error(
        "risk.required_field_missing",
        "Risk 必须说明描述、概率、影响、触发条件、复查条件和负责人",
      );
    }
    if (!RISK_TREATMENTS.has(input.treatment)) {
      throw this.context.error("risk.treatment_invalid", "Risk 处理方式无效");
    }
    if (!RISK_BLOCKING_MODES.has(input.blocking_mode)) {
      throw this.context.error("risk.blocking_mode_invalid", "Risk 阻塞方式无效");
    }
    for (const goalId of goalIds) this.context.requireGoal(boardId, goalId);
    return {
      goal_ids: goalIds,
      description,
      probability,
      impact,
      affected_surfaces: affectedSurfaces,
      trigger,
      treatment: input.treatment,
      treatment_plan: treatmentPlan,
      blocking_mode: input.blocking_mode,
      revisit_condition: revisitCondition,
      owner,
    };
  }
}

const RISK_TREATMENTS = new Set<RiskRecord["treatment"]>([
  "accept",
  "mitigate",
  "avoid",
  "defer",
]);
const RISK_BLOCKING_MODES = new Set<RiskRecord["blocking_mode"]>([
  "none",
  "claim",
  "completion",
  "invalidate_on_trigger",
]);
const RISK_STATES = new Set<RiskRecord["state"]>([
  "open",
  "triggered",
  "resolved",
  "accepted",
  "expired",
]);

function normalizeResolutionBasis(
  input: SetRiskStateInput,
  context: GoalsCommandContext,
): RiskRecord["resolution_basis"] {
  if (input.state !== "resolved") return null;
  const raw = input.resolution_basis;
  const summary = raw?.summary?.trim() ?? "";
  const evidenceRefs = unique((raw?.evidence_refs ?? []).map((item) => item.trim()).filter(Boolean));
  const residualGapsProvided = Array.isArray(raw?.residual_gaps);
  const residualGaps = unique((raw?.residual_gaps ?? []).map((item) => item.trim()).filter(Boolean));
  if (!summary || evidenceRefs.length === 0 || !residualGapsProvided) {
    throw context.error(
      "risk.resolution_basis_required",
      "Risk 标记为已解决时，必须记录解决摘要、至少一条证据引用，并明确 residual_gaps（没有剩余缺口时传空数组）",
    );
  }
  return { summary, evidence_refs: evidenceRefs, residual_gaps: residualGaps };
}

import { randomUUID } from "node:crypto";

import type {
  GoalCompletionResult,
  GoalDecompositionReview,
  GoalLifecycleReason,
  GoalRecord,
} from "@adeptify/goalboard-contracts/modules/goals";

import { GoalsCommandContext, requestHash } from "./command-support.js";
import {
  compareLifecycleReasons,
  completionRiskReasons,
  dependencyReasons,
  lifecycleReason,
} from "./lifecycle-reasons.js";
import type { GoalCompletionHooks } from "./lifecycle-ports.js";
import { rowText } from "./repository.js";

type Row = Record<string, unknown>;
const reason = lifecycleReason;
const compareReasons = compareLifecycleReasons;

export class GoalCompletionCommands {
  constructor(
    private readonly context: GoalsCommandContext,
    private readonly hooks: GoalCompletionHooks,
  ) {}

  evaluateCompletion(input: {
    board_id: string;
    goal_id: string;
    actor_id: string;
    idempotency_key: string;
  }): GoalCompletionResult {
    const hash = requestHash(input);
    return this.context.repository.immediate(() => {
      const replay = this.context.replay<Omit<GoalCompletionResult, "replayed">>(
        input.board_id,
        input.actor_id,
        "evaluate_leaf_completion",
        input.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      const goal = this.context.requireGoal(input.board_id, input.goal_id);
      if (goal.fulfillment_state === "satisfied" && goal.validity_state === "valid") {
        const outcome = {
          satisfied: true,
          reasons: [],
          observed_event_cursor: this.context.repository.eventCursor(input.board_id),
        };
        this.context.remember(input.board_id, input.actor_id, "evaluate_leaf_completion", input.idempotency_key, hash, outcome, this.context.now().toISOString());
        return { ...outcome, replayed: false };
      }
      const reasons: GoalLifecycleReason[] = [];
      if (goal.trashed_at) {
        reasons.push(reason("goal.trashed", "goal", goal.goal_id, "回收站中的 Goal 不能完成", { trashed_at: goal.trashed_at }));
      }
      if (goal.definition_state !== "accepted" || goal.decomposition_state !== "closed_leaf") {
        reasons.push(reason("goal.not_closed_leaf", "goal", goal.goal_id, "只有已接受的最小 Goal 才能完成"));
      }
      if (goal.validity_state !== "valid") {
        reasons.push(reason("goal.not_valid", "goal", goal.goal_id, "Goal 当前不可信，不能完成"));
      }
      reasons.push(...dependencyReasons(this.context, input.board_id, input.goal_id, "complete"));
      reasons.push(...completionRiskReasons(this.context, input.goal_id));
      reasons.push(...(this.hooks.completionGateReasons?.(input.board_id, input.goal_id) ?? []));
      const now = this.context.now().toISOString();
      if (reasons.length > 0) {
        const outcome = {
          satisfied: false,
          reasons: reasons.sort(compareReasons),
          observed_event_cursor: this.context.repository.eventCursor(input.board_id),
        };
        this.context.remember(input.board_id, input.actor_id, "evaluate_leaf_completion", input.idempotency_key, hash, outcome, now);
        return { ...outcome, replayed: false };
      }
      this.context.repository.db
        .prepare("UPDATE goals SET fulfillment_state = 'satisfied', updated_at = ? WHERE goal_id = ?")
        .run(now, input.goal_id);
      const activeGoalCleared = this.hooks.clearActiveGoalIfMatches?.(input.board_id, input.goal_id, now) ?? false;
      this.context.repository.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId: input.actor_id,
        type: "goal.satisfied",
        objectType: "goal",
        objectId: input.goal_id,
        reason: "全部验收证据和 Review 要求已满足",
        payload: { active_goal_cleared: activeGoalCleared },
        at: now,
      });
      const cursor = this.reconcileCompoundAncestors(input.board_id, input.goal_id, input.actor_id, now);
      const outcome = { satisfied: true, reasons: [], observed_event_cursor: cursor };
      this.context.remember(input.board_id, input.actor_id, "evaluate_leaf_completion", input.idempotency_key, hash, outcome, now);
      return { ...outcome, replayed: false };
    });
  }

  reopenForLifecycleFacts(
    boardId: string,
    goalId: string,
    actorId: string,
    at: string,
    reason: string,
  ): number {
    const goal = this.context.requireGoal(boardId, goalId);
    if (goal.fulfillment_state !== "satisfied") {
      return this.context.repository.eventCursor(boardId);
    }
    this.context.repository.db
      .prepare("UPDATE goals SET fulfillment_state = 'unmet', updated_at = ? WHERE goal_id = ?")
      .run(at, goalId);
    this.context.repository.appendEvent({
      eventId: randomUUID(),
      boardId,
      actorId,
      type: "goal.reopened",
      objectType: "goal",
      objectId: goalId,
      reason,
      payload: { contract_revision: goal.current_contract_revision },
      at,
    });
    return this.reopenCompoundAncestorsForUntrustedChild(
      boardId,
      goalId,
      actorId,
      at,
      reason,
    );
  }

  satisfyForLifecycleFacts(
    boardId: string,
    goalId: string,
    actorId: string,
    at: string,
  ): number {
    const goal = this.context.requireGoal(boardId, goalId);
    if (goal.fulfillment_state === "satisfied") {
      return this.context.repository.eventCursor(boardId);
    }
    this.context.repository.db
      .prepare("UPDATE goals SET fulfillment_state = 'satisfied', updated_at = ? WHERE goal_id = ?")
      .run(at, goalId);
    const activeGoalCleared = this.hooks.clearActiveGoalIfMatches?.(boardId, goalId, at) ?? false;
    this.context.repository.appendEvent({
      eventId: randomUUID(),
      boardId,
      actorId,
      type: "goal.satisfied",
      objectType: "goal",
      objectId: goalId,
      reason: "当前 Contract revision 的执行、依据、复核和风险门禁均已满足",
      payload: {
        auto: true,
        contract_revision: goal.current_contract_revision,
        active_goal_cleared: activeGoalCleared,
      },
      at,
    });
    return this.reconcileCompoundAncestors(boardId, goalId, actorId, at);
  }

  closeAcceptedCompound(input: {
    board_id: string;
    goal_id: string;
    decomposition_review?: GoalDecompositionReview;
    actor_id: string;
    reason: string;
    source_item_id: string;
    at: string;
  }): GoalRecord {
    const existing = this.context.requireGoal(input.board_id, input.goal_id);
    if (existing.definition_state !== "accepted") {
      throw this.context.error("goal.not_accepted", "只有已接受 Goal 可以收口为复合 Goal");
    }
    const children = (this.context.repository.db.prepare(`
      SELECT from_goal_id AS goal_id FROM goal_relations
      WHERE board_id = ? AND to_goal_id = ?
        AND type = 'part_of' AND state = 'active'
      ORDER BY from_goal_id
    `).all(input.board_id, input.goal_id) as Row[]).map((child) => rowText(child.goal_id));
    this.context.repository.db.prepare(`
      UPDATE goals
      SET decomposition_state = 'closed_compound', decomposition_review_json = ?,
        fulfillment_state = 'unmet', updated_at = ?
      WHERE board_id = ? AND goal_id = ?
    `).run(
      input.decomposition_review == null ? null : JSON.stringify(input.decomposition_review),
      input.at,
      input.board_id,
      input.goal_id,
    );
    this.context.repository.appendEvent({
      eventId: randomUUID(),
      boardId: input.board_id,
      actorId: input.actor_id,
      type: "goal.accepted_compound_closed_from_tree_proposal",
      objectType: "goal",
      objectId: input.goal_id,
      reason: input.reason,
      payload: {
        previous_decomposition_state: existing.decomposition_state,
        decomposition_state: "closed_compound",
        child_goal_ids: children,
        proposal_item_id: input.source_item_id,
      },
      at: input.at,
    });
    this.reconcileCompoundGoalAndAncestors(
      input.board_id,
      input.goal_id,
      input.actor_id,
      input.at,
    );
    return this.context.requireGoal(input.board_id, input.goal_id);
  }

  reopenSatisfiedCompoundParent(
    boardId: string,
    parentGoalId: string,
    actorId: string,
    at: string,
  ): boolean {
    const parent = this.context.requireGoal(boardId, parentGoalId);
    if (
      parent.trashed_at ||
      parent.archived_at ||
      parent.fulfillment_state !== "satisfied" ||
      parent.definition_state !== "accepted" ||
      parent.decomposition_state !== "closed_compound"
    ) return false;
    this.context.repository.db.prepare(`
      UPDATE goals SET
        definition_state = 'draft', decomposition_state = 'frontier_open',
        fulfillment_state = 'unmet', accepted_by = NULL, accepted_at = NULL,
        updated_at = ?
      WHERE goal_id = ? AND board_id = ?
    `).run(at, parentGoalId, boardId);
    this.context.repository.appendEvent({
      eventId: randomUUID(),
      boardId,
      actorId,
      type: "goal.reopened_for_clarification",
      objectType: "goal",
      objectId: parentGoalId,
      reason: "用户确认新增子 Goal，父 Goal 需要重新确认拆分",
      payload: { decomposition_state: "frontier_open" },
      at,
    });
    return true;
  }

  markSatisfiedGoalForEvidenceRevalidation(
    boardId: string,
    goalId: string,
    actorId: string,
    evidenceId: string,
    correctionId: string,
    at: string,
  ): number {
    const goal = this.context.requireGoal(boardId, goalId);
    if (goal.fulfillment_state !== "satisfied") return this.context.repository.eventCursor(boardId);
    if (goal.validity_state === "valid") {
      this.context.repository.db.prepare(
        "UPDATE goals SET validity_state = 'needs_revalidation', updated_at = ? WHERE board_id = ? AND goal_id = ?",
      ).run(at, boardId, goalId);
      this.context.repository.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId,
        type: "goal.completion_revalidation_required",
        objectType: "goal",
        objectId: goalId,
        reason: "支撑已完成结果的通过 Evidence 已被更正，需要重新验证",
        payload: { evidence_id: evidenceId, correction_id: correctionId },
        at,
      });
    }
    return this.reopenCompoundAncestorsForUntrustedChild(
      boardId,
      goalId,
      actorId,
      at,
      "子 Goal 的完成 Evidence 已被更正",
    );
  }

  reopenCompoundAncestorsForUntrustedChild(
    boardId: string,
    childGoalId: string,
    actorId: string,
    at: string,
    triggerReason: string,
    directParentGoalId?: string,
  ): number {
    const pendingChildren = [childGoalId];
    const visitedParents = new Set<string>();
    while (pendingChildren.length > 0) {
      const childId = pendingChildren.shift()!;
      const parentRows = this.context.repository.db.prepare(`
        SELECT to_goal_id FROM goal_relations
        WHERE board_id = ? AND from_goal_id = ?
          AND type = 'part_of' AND state = 'active'
        ORDER BY to_goal_id
      `).all(boardId, childId) as Row[];
      const relevantParents = childId === childGoalId && directParentGoalId
        ? parentRows.filter((row) => rowText(row.to_goal_id) === directParentGoalId)
        : parentRows;
      for (const row of relevantParents) {
        const parentGoalId = rowText(row.to_goal_id);
        if (visitedParents.has(parentGoalId)) continue;
        visitedParents.add(parentGoalId);
        pendingChildren.push(parentGoalId);
        const parent = this.context.requireGoal(boardId, parentGoalId);
        if (
          parent.trashed_at ||
          parent.archived_at ||
          parent.definition_state !== "accepted" ||
          parent.decomposition_state !== "closed_compound" ||
          parent.fulfillment_state !== "satisfied"
        ) continue;
        this.context.repository.db
          .prepare("UPDATE goals SET fulfillment_state = 'unmet', updated_at = ? WHERE board_id = ? AND goal_id = ?")
          .run(at, boardId, parentGoalId);
        this.context.repository.appendEvent({
          eventId: randomUUID(),
          boardId,
          actorId,
          type: "goal.compound_completion_reopened",
          objectType: "goal",
          objectId: parentGoalId,
          reason: "子 Goal 当前不再是可信完成，复合父 Goal 重新等待子结果",
          payload: { child_goal_id: childId, trigger_goal_id: childGoalId, trigger_reason: triggerReason },
          at,
        });
      }
    }
    return this.context.repository.eventCursor(boardId);
  }

  reconcileCompoundGoalAndAncestors(boardId: string, goalId: string, actorId: string, at: string): number {
    return this.satisfyClosedCompoundGoalIfReady(boardId, goalId, actorId, at)
      ? this.reconcileCompoundAncestors(boardId, goalId, actorId, at)
      : this.context.repository.eventCursor(boardId);
  }

  reconcileAllClosedCompoundGoals(boardId: string, actorId: string, at: string): number {
    const pendingGoalIds = new Set(
      (this.context.repository.db.prepare(`
        SELECT goal_id FROM goals
        WHERE board_id = ?
          AND definition_state = 'accepted'
          AND decomposition_state = 'closed_compound'
          AND validity_state = 'valid'
          AND fulfillment_state = 'unmet'
          AND trashed_at IS NULL
          AND archived_at IS NULL
        ORDER BY goal_id
      `).all(boardId) as Row[]).map((row) => rowText(row.goal_id)),
    );
    while (pendingGoalIds.size > 0) {
      let changed = false;
      for (const goalId of pendingGoalIds) {
        if (!this.satisfyClosedCompoundGoalIfReady(boardId, goalId, actorId, at)) continue;
        pendingGoalIds.delete(goalId);
        changed = true;
      }
      if (!changed) break;
    }
    return this.context.repository.eventCursor(boardId);
  }

  reconcileCompoundAncestors(boardId: string, childGoalId: string, actorId: string, at: string): number {
    const pendingChildren = [childGoalId];
    const visitedParents = new Set<string>();
    while (pendingChildren.length > 0) {
      const childId = pendingChildren.shift()!;
      const parentRows = this.context.repository.db.prepare(`
        SELECT to_goal_id FROM goal_relations
        WHERE board_id = ? AND from_goal_id = ?
          AND type = 'part_of' AND state = 'active'
        ORDER BY to_goal_id
      `).all(boardId, childId) as Row[];
      for (const row of parentRows) {
        const parentGoalId = rowText(row.to_goal_id);
        if (visitedParents.has(parentGoalId)) continue;
        visitedParents.add(parentGoalId);
        if (this.satisfyClosedCompoundGoalIfReady(boardId, parentGoalId, actorId, at)) {
          pendingChildren.push(parentGoalId);
        }
      }
    }
    return this.context.repository.eventCursor(boardId);
  }

  private satisfyClosedCompoundGoalIfReady(
    boardId: string,
    goalId: string,
    actorId: string,
    at: string,
  ): boolean {
    const goal = this.context.requireGoal(boardId, goalId);
    if (
      goal.trashed_at ||
      goal.archived_at ||
      goal.definition_state !== "accepted" ||
      goal.decomposition_state !== "closed_compound" ||
      goal.validity_state !== "valid" ||
      goal.fulfillment_state === "satisfied" ||
      this.hooks.compoundCoverageBlocksClosure?.(boardId, goalId)
    ) return false;
    const children = this.context.repository.db.prepare(`
      SELECT child.goal_id, child.fulfillment_state, child.validity_state, child.trashed_at, child.archived_at
      FROM goal_relations relation
      JOIN goals child ON child.goal_id = relation.from_goal_id
      WHERE relation.board_id = ? AND relation.to_goal_id = ?
        AND relation.type = 'part_of' AND relation.state = 'active'
      ORDER BY child.goal_id
    `).all(boardId, goalId) as Row[];
    if (
      children.length === 0 ||
      children.some((child) =>
        rowText(child.fulfillment_state) !== "satisfied" ||
        rowText(child.validity_state) !== "valid" ||
        child.trashed_at != null ||
        child.archived_at != null
      )
    ) return false;
    this.context.repository.db
      .prepare("UPDATE goals SET fulfillment_state = 'satisfied', updated_at = ? WHERE goal_id = ?")
      .run(at, goalId);
    const activeGoalCleared = this.hooks.clearActiveGoalIfMatches?.(boardId, goalId, at) ?? false;
    this.context.repository.appendEvent({
      eventId: randomUUID(),
      boardId,
      actorId,
      type: "goal.compound_satisfied",
      objectType: "goal",
      objectId: goalId,
      reason: "所有必需子 Goal 已完成，复合父 Goal 自动完成",
      payload: {
        child_goal_ids: children.map((child) => rowText(child.goal_id)),
        active_goal_cleared: activeGoalCleared,
      },
      at,
    });
    return true;
  }

}

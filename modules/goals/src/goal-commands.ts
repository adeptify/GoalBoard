import { randomUUID } from "node:crypto";

import type {
  AddGoalRelationInput,
  CreateGoalInput,
  GoalPolicy,
  GoalRecord,
  GoalRelationRecord,
  GoalsActorWrite,
} from "@adeptify/goalboard-contracts/modules/goals";

import { GoalsCommandContext, requestHash, unique } from "./command-support.js";
import { sqliteJson } from "./repository.js";

export interface GoalRelationGraphIssue {
  code: string;
  message: string;
}

export interface GoalsCommandLifecycleHooks {
  validateRelationGraph?(boardId: string, input: AddGoalRelationInput): GoalRelationGraphIssue | null;
  reopenSatisfiedCompoundParent?(
    boardId: string,
    parentGoalId: string,
    actorId: string,
    at: string,
  ): boolean;
  reconcileCompoundAncestors?(
    boardId: string,
    childGoalId: string,
    actorId: string,
    at: string,
  ): number;
  reopenCompoundAncestorsForUntrustedChild?(
    boardId: string,
    childGoalId: string,
    actorId: string,
    at: string,
    reason: string,
    excludedParentGoalId?: string,
  ): number;
}

export class GoalCommands {
  constructor(
    private readonly context: GoalsCommandContext,
    private readonly lifecycle: GoalsCommandLifecycleHooks = {},
  ) {}

  createGoal(
    boardId: string,
    input: CreateGoalInput,
    write: GoalsActorWrite,
  ): { goal: GoalRecord; replayed: boolean; observed_event_cursor: number } {
    this.validateGoalInput(input);
    const hash = requestHash({ board_id: boardId, goal: input });
    const repository = this.context.repository;
    return repository.immediate(() => {
      const replay = this.context.replay<{ goal: GoalRecord; observed_event_cursor: number }>(
        boardId,
        write.actor_id,
        "create_goal",
        write.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };

      this.context.requireBoard(boardId);
      const goalId = input.goal_id?.trim() || `goal-${randomUUID()}`;
      if (repository.getGoal(goalId)) {
        throw this.context.error("goal.exists", `Goal 已存在: ${goalId}`);
      }
      const at = this.context.now().toISOString();
      const definitionState = input.definition_state ?? "draft";
      const decompositionState = input.decomposition_state ?? "abstract";
      const acceptedAt = definitionState === "accepted" ? at : null;
      const acceptedBy = definitionState === "accepted" ? write.actor_id : null;
      repository.db.prepare(`
        INSERT INTO goals (
          goal_id, board_id, title, outcome, why, business_logic,
          in_scope_json, out_of_scope_json, constraints_json,
          required_inputs_json, promised_outputs_json, decomposition_review_json,
          definition_state, decomposition_state, validity_state, fulfillment_state,
          priority, accepted_by, accepted_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'valid', 'unmet', ?, ?, ?, ?, ?)
      `).run(
        goalId,
        boardId,
        input.title.trim(),
        input.outcome.trim(),
        input.why.trim(),
        input.business_logic.trim(),
        sqliteJson(input.in_scope ?? []),
        sqliteJson(input.out_of_scope ?? []),
        sqliteJson(input.constraints ?? []),
        sqliteJson(input.required_inputs ?? []),
        sqliteJson(input.promised_outputs ?? []),
        input.decomposition_review == null ? null : sqliteJson(input.decomposition_review),
        definitionState,
        decompositionState,
        input.priority ?? 0,
        acceptedBy,
        acceptedAt,
        at,
        at,
      );
      const insertCriterion = repository.db.prepare(`
        INSERT INTO acceptance_criteria (
          criterion_id, goal_id, statement, decision_method,
          pass_condition, target_json, required_evidence_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const criterion of input.acceptance_criteria) {
        insertCriterion.run(
          criterion.criterion_id?.trim() || `criterion-${randomUUID()}`,
          goalId,
          criterion.statement.trim(),
          criterion.decision_method,
          criterion.pass_condition.trim(),
          criterion.target == null ? null : sqliteJson(criterion.target),
          sqliteJson(criterion.required_evidence ?? []),
        );
      }
      const createdGoal = repository.getGoal(goalId);
      if (!createdGoal) throw new Error(`Goal 写入后无法读取: ${goalId}`);
      repository.db.prepare(`
        INSERT INTO goal_contract_revisions (
          goal_id, board_id, revision, contract_json, effect, source_proposal_id,
          changed_by, reason, created_at
        ) VALUES (?, ?, 1, ?, 'metadata', NULL, ?, ?, ?)
      `).run(
        goalId,
        boardId,
        sqliteJson(contractInputFromGoal(createdGoal)),
        write.actor_id,
        "创建 Goal Contract revision 1",
        at,
      );
      const cursor = repository.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId: write.actor_id,
        type: "goal.created",
        objectType: "goal",
        objectId: goalId,
        reason: write.reason ?? "创建新 Goal",
        payload: { definition_state: definitionState, decomposition_state: decompositionState },
        at,
      });
      const goal = repository.getGoal(goalId);
      if (!goal) throw new Error("Goal 写入后无法读取");
      const outcome = { goal, observed_event_cursor: cursor };
      this.context.remember(
        boardId,
        write.actor_id,
        "create_goal",
        write.idempotency_key,
        hash,
        outcome,
        at,
      );
      return { ...outcome, replayed: false };
    });
  }

  updateDraftGoal(
    boardId: string,
    goalId: string,
    input: CreateGoalInput,
    write: GoalsActorWrite,
  ): { goal: GoalRecord; replayed: boolean; observed_event_cursor: number } {
    if (input.definition_state && input.definition_state !== "draft") {
      throw this.context.error(
        "goal.draft_update_cannot_accept",
        "Draft 编辑只能补全草稿；确认 accepted Contract 必须走用户确认流程",
      );
    }
    const changeReason = write.reason?.trim() ?? "";
    if (!changeReason) {
      throw this.context.error("goal.draft_update_reason_required", "更新 Draft 时必须说明修改原因");
    }
    const normalized: CreateGoalInput = {
      ...input,
      goal_id: goalId,
      definition_state: "draft",
      in_scope: unique((input.in_scope ?? []).map((item) => item.trim()).filter(Boolean)),
      out_of_scope: unique((input.out_of_scope ?? []).map((item) => item.trim()).filter(Boolean)),
      constraints: unique((input.constraints ?? []).map((item) => item.trim()).filter(Boolean)),
      required_inputs: unique((input.required_inputs ?? []).map((item) => item.trim()).filter(Boolean)),
      promised_outputs: unique((input.promised_outputs ?? []).map((item) => item.trim()).filter(Boolean)),
      acceptance_criteria: input.acceptance_criteria.map((criterion) => ({
        ...criterion,
        criterion_id: criterion.criterion_id?.trim() || undefined,
        statement: criterion.statement.trim(),
        pass_condition: criterion.pass_condition.trim(),
        required_evidence: unique(
          (criterion.required_evidence ?? []).map((item) => item.trim()).filter(Boolean),
        ),
      })),
    };
    this.validateGoalInput(normalized);
    const hash = requestHash({ board_id: boardId, goal_id: goalId, goal: normalized });
    const repository = this.context.repository;
    return repository.immediate(() => {
      const replay = this.context.replay<{ goal: GoalRecord; observed_event_cursor: number }>(
        boardId,
        write.actor_id,
        "update_draft_goal",
        write.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };

      const current = this.context.requireGoal(boardId, goalId);
      if (current.definition_state !== "draft") {
        throw this.context.error(
          "goal.accepted_contract_immutable",
          "accepted Contract 不能原地修改；请创建新 Goal 并确认 Rewire",
        );
      }
      const criterionIds = normalized.acceptance_criteria
        .map((criterion) => criterion.criterion_id)
        .filter((criterionId): criterionId is string => Boolean(criterionId));
      if (new Set(criterionIds).size !== criterionIds.length) {
        throw this.context.error("goal.acceptance_id_duplicate", "验收条件 ID 不能重复");
      }

      const now = this.context.now().toISOString();
      const pendingProposals = repository.db.prepare(`
        SELECT proposal_id FROM contract_proposals
        WHERE board_id = ? AND goal_id = ? AND state = 'pending' ORDER BY created_at
      `).all(boardId, goalId) as Array<{ proposal_id: string }>;
      if (pendingProposals.length) {
        repository.db.prepare(`
          UPDATE contract_proposals
          SET state = 'superseded', decided_at = ?, decision_json = ?
          WHERE board_id = ? AND goal_id = ? AND state = 'pending'
        `).run(
          now,
          sqliteJson({
            reason: "用户直接更新了 Draft，需要基于新事实重新提交 Contract Proposal",
            superseded_by: write.actor_id,
          }),
          boardId,
          goalId,
        );
      }

      repository.db.prepare(`
        UPDATE goals SET
          title = ?, outcome = ?, why = ?, business_logic = ?,
          in_scope_json = ?, out_of_scope_json = ?, constraints_json = ?,
          required_inputs_json = ?, promised_outputs_json = ?,
          decomposition_review_json = ?, decomposition_state = ?, priority = ?, updated_at = ?
        WHERE goal_id = ? AND board_id = ?
      `).run(
        normalized.title.trim(),
        normalized.outcome.trim(),
        normalized.why.trim(),
        normalized.business_logic.trim(),
        sqliteJson(normalized.in_scope ?? []),
        sqliteJson(normalized.out_of_scope ?? []),
        sqliteJson(normalized.constraints ?? []),
        sqliteJson(normalized.required_inputs ?? []),
        sqliteJson(normalized.promised_outputs ?? []),
        normalized.decomposition_review == null ? null : sqliteJson(normalized.decomposition_review),
        normalized.decomposition_state ?? current.decomposition_state,
        normalized.priority ?? current.priority,
        now,
        goalId,
        boardId,
      );
      repository.db.prepare("DELETE FROM acceptance_criteria WHERE goal_id = ?").run(goalId);
      const insertCriterion = repository.db.prepare(`
        INSERT INTO acceptance_criteria (
          criterion_id, goal_id, statement, decision_method,
          pass_condition, target_json, required_evidence_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const criterion of normalized.acceptance_criteria) {
        insertCriterion.run(
          criterion.criterion_id || `criterion-${randomUUID()}`,
          goalId,
          criterion.statement,
          criterion.decision_method,
          criterion.pass_condition,
          criterion.target == null ? null : sqliteJson(criterion.target),
          sqliteJson(criterion.required_evidence ?? []),
        );
      }
      const cursor = repository.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId: write.actor_id,
        type: "goal.draft_updated",
        objectType: "goal",
        objectId: goalId,
        reason: changeReason,
        payload: {
          decomposition_state: normalized.decomposition_state ?? current.decomposition_state,
          acceptance_criterion_count: normalized.acceptance_criteria.length,
          superseded_contract_proposal_ids: pendingProposals.map((item) => item.proposal_id),
        },
        at: now,
      });
      const goal = this.context.requireGoal(boardId, goalId);
      const outcome = { goal, observed_event_cursor: cursor };
      this.context.remember(
        boardId,
        write.actor_id,
        "update_draft_goal",
        write.idempotency_key,
        hash,
        outcome,
        now,
      );
      return { ...outcome, replayed: false };
    });
  }

  addRelation(
    boardId: string,
    input: AddGoalRelationInput,
    write: GoalsActorWrite,
  ): { relation_id: string; replayed: boolean; observed_event_cursor: number } {
    const hash = requestHash({ board_id: boardId, ...input });
    const repository = this.context.repository;
    return repository.immediate(() => {
      const replay = this.context.replay<{ relation_id: string; observed_event_cursor: number }>(
        boardId,
        write.actor_id,
        "add_relation",
        write.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      this.context.requireNonTrashedGoal(boardId, input.from_goal_id);
      this.context.requireNonTrashedGoal(boardId, input.to_goal_id);
      if (input.from_goal_id === input.to_goal_id) {
        throw this.context.error("relation.self_reference", "Goal 不能关联到自身");
      }
      if ((input.state ?? "active") === "active" && ["part_of", "depends_on"].includes(input.type)) {
        const issue = this.lifecycle.validateRelationGraph?.(boardId, input);
        if (issue) throw this.context.error(issue.code, issue.message);
      }
      const relationReason = input.reason.trim();
      if (!relationReason) {
        throw this.context.error("relation.reason_required", "关系必须说明建立原因");
      }
      const alreadyActive = repository.db.prepare(`
        SELECT relation_id FROM goal_relations
        WHERE board_id = ? AND from_goal_id = ? AND to_goal_id = ?
          AND type = ? AND state = ? LIMIT 1
      `).get(
        boardId,
        input.from_goal_id,
        input.to_goal_id,
        input.type,
        input.state ?? "active",
      );
      if (alreadyActive) {
        throw this.context.error(
          "relation.already_exists",
          input.state === "proposed" ? "这条待确认关系已经存在" : "这条关系已经生效",
        );
      }
      const relationId = `relation-${randomUUID()}`;
      const at = this.context.now().toISOString();
      repository.db.prepare(`
        INSERT INTO goal_relations (
          relation_id, board_id, from_goal_id, to_goal_id, type, state,
          reason, created_by, created_at, deactivated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `).run(
        relationId,
        boardId,
        input.from_goal_id,
        input.to_goal_id,
        input.type,
        input.state ?? "active",
        relationReason,
        write.actor_id,
        at,
      );
      let cursor = repository.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId: write.actor_id,
        type: "relation.added",
        objectType: "relation",
        objectId: relationId,
        reason: relationReason,
        payload: { ...input, reason: relationReason },
        at,
      });
      if (input.type === "part_of" && (input.state ?? "active") === "active") {
        repository.db.prepare(`
          INSERT OR REPLACE INTO coverage_contract_revisions (
            parent_goal_id, child_goal_id, parent_contract_revision, child_contract_revision, recorded_at
          )
          SELECT parent.goal_id, child.goal_id,
                 parent.current_contract_revision, child.current_contract_revision, ?
          FROM goals parent, goals child
          WHERE parent.goal_id = ? AND child.goal_id = ?
        `).run(at, input.to_goal_id, input.from_goal_id);
        const reopened = this.lifecycle.reopenSatisfiedCompoundParent?.(
          boardId,
          input.to_goal_id,
          write.actor_id,
          at,
        ) ?? false;
        if (!reopened) {
          cursor = this.lifecycle.reconcileCompoundAncestors?.(
            boardId,
            input.from_goal_id,
            write.actor_id,
            at,
          ) ?? cursor;
        }
      }
      const outcome = { relation_id: relationId, observed_event_cursor: cursor };
      this.context.remember(
        boardId,
        write.actor_id,
        "add_relation",
        write.idempotency_key,
        hash,
        outcome,
        at,
      );
      return { ...outcome, replayed: false };
    });
  }

  deactivateRelation(
    boardId: string,
    input: { relation_id: string; reason: string },
    write: GoalsActorWrite,
  ): { relation: GoalRelationRecord; replayed: boolean; observed_event_cursor: number } {
    const reasonText = input.reason.trim();
    if (!reasonText) {
      throw this.context.error(
        "relation.deactivation_reason_required",
        "解除关系时必须说明原因",
      );
    }
    const hash = requestHash({ board_id: boardId, relation_id: input.relation_id, reason: reasonText });
    const repository = this.context.repository;
    return repository.immediate(() => {
      const replay = this.context.replay<{
        relation: GoalRelationRecord;
        observed_event_cursor: number;
      }>(boardId, write.actor_id, "deactivate_relation", write.idempotency_key, hash);
      if (replay) return { ...replay, replayed: true };
      this.context.requireBoard(boardId);
      const relation = repository.getRelation(boardId, input.relation_id);
      if (!relation) {
        throw this.context.error("relation.not_found", `找不到关系: ${input.relation_id}`);
      }
      if (relation.state !== "active") {
        throw this.context.error("relation.not_active", "只有正在生效的关系可以解除");
      }
      const at = this.context.now().toISOString();
      if (relation.type === "part_of") {
        this.lifecycle.reopenCompoundAncestorsForUntrustedChild?.(
          boardId,
          relation.from_goal_id,
          write.actor_id,
          at,
          "子 Goal 与父 Goal 的 part_of 关系已解除",
          relation.to_goal_id,
        );
      }
      repository.db.prepare(`
        UPDATE goal_relations SET state = 'inactive', deactivated_at = ? WHERE relation_id = ?
      `).run(at, input.relation_id);
      const cursor = repository.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId: write.actor_id,
        type: "relation.deactivated",
        objectType: "relation",
        objectId: input.relation_id,
        reason: reasonText,
        payload: {
          from_goal_id: relation.from_goal_id,
          to_goal_id: relation.to_goal_id,
          type: relation.type,
        },
        at,
      });
      const updated = repository.getRelation(boardId, input.relation_id);
      if (!updated) throw new Error("关系停用后无法读取");
      const outcome = { relation: updated, observed_event_cursor: cursor };
      this.context.remember(
        boardId,
        write.actor_id,
        "deactivate_relation",
        write.idempotency_key,
        hash,
        outcome,
        at,
      );
      return { ...outcome, replayed: false };
    });
  }

  setPolicy(
    boardId: string,
    input: { goal_id?: string | null; policy: Partial<GoalPolicy>; reason: string },
    write: GoalsActorWrite,
  ): { policy_binding_id: string; replayed: boolean; observed_event_cursor: number } {
    const hash = requestHash({ board_id: boardId, ...input });
    const repository = this.context.repository;
    return repository.immediate(() => {
      const replay = this.context.replay<{
        policy_binding_id: string;
        observed_event_cursor: number;
      }>(boardId, write.actor_id, "set_policy", write.idempotency_key, hash);
      if (replay) return { ...replay, replayed: true };
      this.context.requireBoard(boardId);
      if (input.goal_id) this.context.requireGoal(boardId, input.goal_id);
      if (!input.reason.trim()) {
        throw this.context.error("policy.reason_required", "保存 Policy 时必须说明原因");
      }
      validatePolicy(input.policy, this.context);
      const scope = input.goal_id ? "goal" : "project_default";
      const normalizedPolicy: Partial<GoalPolicy> = {
        ...input.policy,
        ...(input.policy.required_capabilities
          ? {
              required_capabilities: unique(
                input.policy.required_capabilities.map((item) => item.trim()),
              ).sort(),
            }
          : {}),
      };
      const bindingId = `policy-${randomUUID()}`;
      const at = this.context.now().toISOString();
      const replaced = (input.goal_id
        ? repository.db.prepare(`
            SELECT policy_binding_id FROM policy_bindings
            WHERE board_id = ? AND goal_id = ? AND scope = 'goal' AND state = 'active'
          `).all(boardId, input.goal_id)
        : repository.db.prepare(`
            SELECT policy_binding_id FROM policy_bindings
            WHERE board_id = ? AND goal_id IS NULL AND scope = 'project_default' AND state = 'active'
          `).all(boardId)) as Array<{ policy_binding_id: string }>;
      if (input.goal_id) {
        repository.db.prepare(`
          UPDATE policy_bindings SET state = 'replaced'
          WHERE board_id = ? AND goal_id = ? AND scope = 'goal' AND state = 'active'
        `).run(boardId, input.goal_id);
      } else {
        repository.db.prepare(`
          UPDATE policy_bindings SET state = 'replaced'
          WHERE board_id = ? AND goal_id IS NULL AND scope = 'project_default' AND state = 'active'
        `).run(boardId);
      }
      repository.db.prepare(`
        INSERT INTO policy_bindings (
          policy_binding_id, board_id, goal_id, scope, policy_json,
          state, created_by, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
      `).run(
        bindingId,
        boardId,
        input.goal_id ?? null,
        scope,
        sqliteJson(normalizedPolicy),
        write.actor_id,
        input.reason.trim(),
        at,
      );
      const cursor = repository.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId: write.actor_id,
        type: "policy.added",
        objectType: "policy",
        objectId: bindingId,
        reason: input.reason.trim(),
        payload: {
          ...input,
          policy: normalizedPolicy,
          scope,
          replaced_binding_ids: replaced.map((item) => item.policy_binding_id),
        },
        at,
      });
      const outcome = { policy_binding_id: bindingId, observed_event_cursor: cursor };
      this.context.remember(
        boardId,
        write.actor_id,
        "set_policy",
        write.idempotency_key,
        hash,
        outcome,
        at,
      );
      return { ...outcome, replayed: false };
    });
  }

  validateGoalInput(input: CreateGoalInput): void {
    if (!input.title?.trim()) {
      throw this.context.error("goal.title_required", "Goal 必须有名称");
    }
    const requiresCompleteContract =
      input.definition_state === "accepted" || input.decomposition_state === "closed_leaf";
    if (
      requiresCompleteContract &&
      [input.outcome, input.why, input.business_logic].some((value) => !value?.trim())
    ) {
      throw this.context.error(
        "goal.required_field_missing",
        "可执行 Goal 必须包含结果、原因和非技术业务逻辑",
      );
    }
    if (requiresCompleteContract && input.acceptance_criteria.length === 0) {
      throw this.context.error(
        "goal.acceptance_missing",
        "被接受或可直接执行的最小 Goal 至少需要一条明确验收条件",
      );
    }
    for (const criterion of input.acceptance_criteria) {
      if (!criterion.statement.trim() || !criterion.pass_condition.trim()) {
        throw this.context.error(
          "goal.acceptance_invalid",
          "每条验收条件都要说明检查什么和怎样算通过",
        );
      }
    }
  }
}

function validatePolicy(policy: Partial<GoalPolicy>, context: GoalsCommandContext): void {
  if (policy.goal_mode != null && !["disabled", "preferred", "required"].includes(policy.goal_mode)) {
    throw context.error("policy.goal_mode_invalid", "Goal Mode 必须是关闭、建议或强制");
  }
  if (
    policy.required_capabilities != null &&
    (!Array.isArray(policy.required_capabilities) ||
      policy.required_capabilities.some(
        (capability) => typeof capability !== "string" || !capability.trim(),
      ))
  ) {
    throw context.error("policy.capabilities_invalid", "Runtime 必需能力必须是非空字符串列表");
  }
  for (const [field, value] of [
    ["cross_reviewers", policy.cross_reviewers],
    ["adversarial_reviewers", policy.adversarial_reviewers],
  ] as const) {
    if (value != null && (!Number.isInteger(value) || value < 0)) {
      throw context.error("policy.review_count_invalid", `${field} 必须是非负整数`);
    }
  }
  if (
    policy.max_lease_seconds != null &&
    (!Number.isInteger(policy.max_lease_seconds) || policy.max_lease_seconds <= 0)
  ) {
    throw context.error("policy.max_lease_invalid", "最长领取时间必须是正整数秒数");
  }
}

function contractInputFromGoal(goal: GoalRecord): CreateGoalInput {
  return {
    goal_id: goal.goal_id,
    title: goal.title,
    outcome: goal.outcome,
    why: goal.why,
    business_logic: goal.business_logic,
    in_scope: goal.in_scope,
    out_of_scope: goal.out_of_scope,
    constraints: goal.constraints,
    required_inputs: goal.required_inputs,
    promised_outputs: goal.promised_outputs,
    decomposition_review: goal.decomposition_review ?? undefined,
    definition_state: goal.definition_state,
    decomposition_state: goal.decomposition_state,
    priority: goal.priority,
    acceptance_criteria: goal.acceptance_criteria.map((criterion) => ({
      criterion_id: criterion.criterion_id,
      statement: criterion.statement,
      decision_method: criterion.decision_method,
      pass_condition: criterion.pass_condition,
      target: criterion.target,
      required_evidence: criterion.required_evidence,
    })),
  };
}

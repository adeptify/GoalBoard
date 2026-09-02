import { randomUUID } from "node:crypto";

import type {
  CreateGoalInput,
  GoalContractRevisionEffect,
  GoalRecord,
} from "@adeptify/goalboard-contracts/modules/goals";

import { GoalsCommandContext } from "./command-support.js";
import { rowText, sqliteJson } from "./repository.js";

type Row = Record<string, unknown>;

export interface AcceptDraftGoalInput {
  board_id: string;
  goal_id: string;
  proposed_goal: CreateGoalInput;
  actor_id: string;
  accepted_at: string;
}

export interface ApplyAcceptedContractRevisionInput {
  board_id: string;
  goal_id: string;
  proposed_goal: CreateGoalInput;
  source_proposal_id: string;
  source_item_id?: string;
  actor_id: string;
  reason: string;
  applied_at: string;
}

export interface AppliedGoalContractRevision {
  goal: GoalRecord;
  previous_contract_revision: number;
  contract_revision: number;
  effect: GoalContractRevisionEffect;
  downstream_goal_ids: string[];
}

export interface GoalRevisionDependentTransition {
  board_id: string;
  goal_id: string;
  previous_contract_revision: number;
  contract_revision: number;
  effect: GoalContractRevisionEffect;
  actor_id: string;
  at: string;
}

export interface GoalRevisionHooks {
  validateGoalInput(input: CreateGoalInput): void;
  transitionRevisionDependents(input: GoalRevisionDependentTransition): void;
  reopenCompoundAncestorsForUntrustedChild(
    boardId: string,
    childGoalId: string,
    actorId: string,
    at: string,
    reason: string,
  ): number;
}

export class GoalRevisionCommands {
  constructor(
    private readonly context: GoalsCommandContext,
    private readonly hooks: GoalRevisionHooks,
  ) {}

  acceptDraft(input: AcceptDraftGoalInput): GoalRecord {
    const existing = this.context.requireGoal(input.board_id, input.goal_id);
    if (existing.definition_state !== "draft") {
      throw this.context.error("goal.not_draft", "只有 Draft Goal 可以首次接受");
    }
    const normalized: CreateGoalInput = {
      ...input.proposed_goal,
      goal_id: input.goal_id,
      definition_state: "accepted",
      decomposition_state: input.proposed_goal.decomposition_state ?? existing.decomposition_state,
      priority: input.proposed_goal.priority ?? existing.priority,
    };
    this.hooks.validateGoalInput(normalized);
    this.context.repository.db.prepare(`
      UPDATE goals SET
        title = ?, outcome = ?, why = ?, business_logic = ?,
        in_scope_json = ?, out_of_scope_json = ?, constraints_json = ?,
        required_inputs_json = ?, promised_outputs_json = ?,
        decomposition_review_json = ?, definition_state = 'accepted',
        decomposition_state = ?, validity_state = 'valid', fulfillment_state = 'unmet',
        priority = ?, accepted_by = ?, accepted_at = ?, updated_at = ?
      WHERE board_id = ? AND goal_id = ?
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
      normalized.decomposition_state,
      normalized.priority,
      input.actor_id,
      input.accepted_at,
      input.accepted_at,
      input.board_id,
      input.goal_id,
    );
    this.replaceAcceptanceCriteria(input.goal_id, normalized);
    return this.context.requireGoal(input.board_id, input.goal_id);
  }

  applyAcceptedContractRevision(
    input: ApplyAcceptedContractRevisionInput,
  ): AppliedGoalContractRevision {
    const existing = this.context.requireGoal(input.board_id, input.goal_id);
    if (existing.definition_state !== "accepted") {
      throw this.context.error("contract.goal_not_accepted", "只有已接受 Goal 才能增加 Contract revision");
    }
    if (input.proposed_goal.goal_id?.trim() && input.proposed_goal.goal_id.trim() !== input.goal_id) {
      throw this.context.error("contract.goal_id_immutable", "Contract revision 必须保留原 Goal ID");
    }
    if ((input.proposed_goal.definition_state ?? "accepted") !== "accepted") {
      throw this.context.error("contract.definition_state_immutable", "已接受 Goal 的 revision 不能退回 Draft");
    }
    const normalized: CreateGoalInput = {
      ...input.proposed_goal,
      goal_id: input.goal_id,
      definition_state: "accepted",
      decomposition_state: input.proposed_goal.decomposition_state ?? existing.decomposition_state,
      priority: input.proposed_goal.priority ?? existing.priority,
    };
    this.hooks.validateGoalInput(normalized);
    const currentContract = contractInputFromGoal(existing);
    const effect = contractRevisionEffect(currentContract, normalized);
    const revision = existing.current_contract_revision + 1;
    this.hooks.transitionRevisionDependents({
      board_id: input.board_id,
      goal_id: input.goal_id,
      previous_contract_revision: existing.current_contract_revision,
      contract_revision: revision,
      effect,
      actor_id: input.actor_id,
      at: input.applied_at,
    });

    const nextValidity = effect === "revalidate"
      ? "needs_revalidation"
      : effect === "rework"
        ? "valid"
        : existing.validity_state;
    const nextFulfillment = effect === "metadata" ? existing.fulfillment_state : "unmet";
    this.context.repository.db.prepare(`
      UPDATE goals SET
        title = ?, outcome = ?, why = ?, business_logic = ?,
        in_scope_json = ?, out_of_scope_json = ?, constraints_json = ?,
        required_inputs_json = ?, promised_outputs_json = ?,
        decomposition_review_json = ?, definition_state = 'accepted',
        decomposition_state = ?, validity_state = ?, fulfillment_state = ?,
        priority = ?, current_contract_revision = ?, updated_at = ?
      WHERE board_id = ? AND goal_id = ?
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
      normalized.decomposition_state,
      nextValidity,
      nextFulfillment,
      normalized.priority,
      revision,
      input.applied_at,
      input.board_id,
      input.goal_id,
    );
    this.replaceAcceptanceCriteria(input.goal_id, normalized);

    const revised = this.context.requireGoal(input.board_id, input.goal_id);
    this.context.repository.db.prepare(`
      INSERT INTO goal_contract_revisions (
        goal_id, board_id, revision, contract_json, effect, source_proposal_id,
        changed_by, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.goal_id,
      input.board_id,
      revision,
      sqliteJson(contractInputFromGoal(revised)),
      effect,
      input.source_proposal_id,
      input.actor_id,
      input.reason,
      input.applied_at,
    );

    const coverageWasExplicitlyUpdated = !sameValue(
      currentContract.decomposition_review,
      normalized.decomposition_review,
    );
    if (
      revised.decomposition_state === "closed_compound" &&
      revised.decomposition_review != null &&
      (effect === "metadata" || coverageWasExplicitlyUpdated)
    ) {
      const children = this.activePartOfChildren(input.board_id, input.goal_id);
      const insertCoverage = this.context.repository.db.prepare(`
        INSERT OR REPLACE INTO coverage_contract_revisions (
          parent_goal_id, child_goal_id, parent_contract_revision, child_contract_revision, recorded_at
        ) VALUES (?, ?, ?, ?, ?)
      `);
      for (const child of children) {
        insertCoverage.run(
          input.goal_id,
          rowText(child.goal_id),
          revision,
          Number(child.current_contract_revision ?? this.context.repository.getGoal(rowText(child.goal_id))?.current_contract_revision ?? 1),
          input.applied_at,
        );
      }
    }

    const downstreamGoalIds = (this.context.repository.db.prepare(`
      SELECT DISTINCT relation.from_goal_id AS goal_id
      FROM goal_relations relation
      WHERE relation.board_id = ? AND relation.to_goal_id = ?
        AND relation.type = 'depends_on' AND relation.state = 'active'
      ORDER BY relation.from_goal_id
    `).all(input.board_id, input.goal_id) as Row[]).map((row) => rowText(row.goal_id));
    if (effect !== "metadata") {
      for (const downstreamGoalId of downstreamGoalIds) {
        this.context.repository.db.prepare(`
          UPDATE goals
          SET validity_state = 'needs_revalidation', fulfillment_state = 'unmet', updated_at = ?
          WHERE board_id = ? AND goal_id = ?
        `).run(input.applied_at, input.board_id, downstreamGoalId);
        this.context.repository.appendEvent({
          eventId: randomUUID(),
          boardId: input.board_id,
          actorId: input.actor_id,
          type: "contract.downstream_revalidation_required",
          objectType: "goal",
          objectId: downstreamGoalId,
          reason: "直接依赖的上游 Contract 已实质修改",
          payload: { changed_goal_id: input.goal_id, contract_revision: revision },
          at: input.applied_at,
        });
        this.hooks.reopenCompoundAncestorsForUntrustedChild(
          input.board_id,
          downstreamGoalId,
          input.actor_id,
          input.applied_at,
          "下游 Goal 需要重新验证",
        );
      }
      this.hooks.reopenCompoundAncestorsForUntrustedChild(
        input.board_id,
        input.goal_id,
        input.actor_id,
        input.applied_at,
        "子 Goal Contract revision 已变化，旧 coverage 不再可信",
      );
    }
    this.context.repository.appendEvent({
      eventId: randomUUID(),
      boardId: input.board_id,
      actorId: input.actor_id,
      type: "contract.revision_applied",
      objectType: "goal",
      objectId: input.goal_id,
      reason: input.reason,
      payload: {
        proposal_id: input.source_proposal_id,
        ...(input.source_item_id ? { proposal_item_id: input.source_item_id } : {}),
        previous_contract_revision: existing.current_contract_revision,
        contract_revision: revision,
        effect,
        downstream_goal_ids: downstreamGoalIds,
      },
      at: input.applied_at,
    });
    return {
      goal: revised,
      previous_contract_revision: existing.current_contract_revision,
      contract_revision: revision,
      effect,
      downstream_goal_ids: downstreamGoalIds,
    };
  }

  private replaceAcceptanceCriteria(goalId: string, goal: CreateGoalInput): void {
    this.context.repository.db.prepare("DELETE FROM acceptance_criteria WHERE goal_id = ?").run(goalId);
    const insert = this.context.repository.db.prepare(`
      INSERT INTO acceptance_criteria (
        criterion_id, goal_id, statement, decision_method,
        pass_condition, target_json, required_evidence_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const criterion of goal.acceptance_criteria) {
      insert.run(
        criterion.criterion_id?.trim() || `criterion-${randomUUID()}`,
        goalId,
        criterion.statement.trim(),
        criterion.decision_method,
        criterion.pass_condition.trim(),
        criterion.target == null ? null : sqliteJson(criterion.target),
        sqliteJson(criterion.required_evidence ?? []),
      );
    }
  }

  private activePartOfChildren(boardId: string, parentGoalId: string): Row[] {
    return this.context.repository.db.prepare(`
      SELECT child.goal_id, child.current_contract_revision
      FROM goal_relations relation
      JOIN goals child ON child.goal_id = relation.from_goal_id
      WHERE relation.board_id = ? AND relation.to_goal_id = ?
        AND child.board_id = ?
        AND relation.type = 'part_of' AND relation.state = 'active'
      ORDER BY child.goal_id
    `).all(boardId, parentGoalId, boardId) as Row[];
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

function contractRevisionEffect(
  current: CreateGoalInput,
  proposed: CreateGoalInput,
): GoalContractRevisionEffect {
  const reworkFields: Array<keyof CreateGoalInput> = [
    "outcome",
    "business_logic",
    "in_scope",
    "out_of_scope",
    "constraints",
    "required_inputs",
    "promised_outputs",
    "decomposition_review",
    "definition_state",
    "decomposition_state",
  ];
  if (reworkFields.some((field) => !sameValue(current[field], proposed[field]))) return "rework";
  if (!sameValue(current.acceptance_criteria, proposed.acceptance_criteria)) return "revalidate";
  return "metadata";
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

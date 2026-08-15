import { createHash, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { SqliteGoalBoardStore, mapSqliteClaim, sqliteJson } from "./store.js";
import {
  DEFAULT_GOAL_POLICY,
  type ClaimDecision,
  type ClaimRecord,
  type ClaimRequest,
  type ClaimRole,
  type CandidateGoalRecord,
  type ContractFieldSource,
  type ContractProposalImpact,
  type ContractProposalRecord,
  type ContractProposalRisk,
  type CreateGoalInput,
  type DecisionReason,
  type EvidenceRecord,
  type GoalPolicy,
  type GoalContractView,
  type GoalRecord,
  type ImpactAccess,
  type ImpactBindingRecord,
  type ReadyGoal,
  type RevalidationDecision,
  type ReviewRecord,
  type RewireRecord,
  type RiskRecord,
  type RunRecord,
} from "./types.js";

type Row = Record<string, unknown>;

type NormalizedProposedRelation = Record<string, unknown> & {
  from_goal_id: string;
  to_goal_id: string;
  type: string;
  reason: string;
};

export class GoalBoardV1Error extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GoalBoardV1Error";
  }
}

export interface ExplainGoalResult {
  goal: GoalRecord | null;
  role: ClaimRole;
  ready: boolean;
  observed_event_cursor: number;
  reasons: DecisionReason[];
  resolved_policy: GoalPolicy;
  relevant_surfaces: ImpactBindingRecord[];
}

export interface ReadyQuery {
  board_id: string;
  actor_id: string;
  role?: ClaimRole;
  capabilities?: string[];
  goal_mode_attestation?: boolean;
}

export interface ReadyQueryResult {
  observed_event_cursor: number;
  ready: ReadyGoal[];
}

interface ActorWrite {
  actor_id: string;
  idempotency_key: string;
  reason?: string;
}

interface SubmitContractProposalInput {
  board_id: string;
  goal_id: string;
  actor_id: string;
  discovered_in_run_id: string;
  proposed_goal: CreateGoalInput;
  field_sources: ContractFieldSource[];
  review_policy: GoalPolicy;
  proposed_impacts?: ContractProposalImpact[];
  proposed_risks?: ContractProposalRisk[];
  dependency_rewire_ids?: string[];
  idempotency_key: string;
}

interface DecideContractProposalInput {
  board_id: string;
  proposal_id: string;
  actor_id: string;
  actor_kind: "user" | "runtime";
  decision: "approved" | "rejected";
  reason: string;
  idempotency_key: string;
}

interface EvaluationInput {
  boardId: string;
  goalId: string;
  actorId: string;
  role: ClaimRole;
  capabilities: string[];
  goalModeAttestation: boolean;
  strengthenPolicy?: Partial<GoalPolicy>;
  now: string;
}

interface Evaluation {
  goal: GoalRecord | null;
  reasons: DecisionReason[];
  policy: GoalPolicy;
  surfaces: ImpactBindingRecord[];
}

const GOAL_MODE_ORDER = { disabled: 0, preferred: 1, required: 2 } as const;

function asText(value: unknown): string {
  return value == null ? "" : String(value);
}

function asNullableText(value: unknown): string | null {
  return value == null ? null : String(value);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
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

function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function reason(
  code: string,
  subjectType: string,
  subjectId: string,
  message: string,
  facts?: Record<string, unknown>,
  remediation?: string,
): DecisionReason {
  return {
    code,
    severity: "blocker",
    subject_type: subjectType,
    subject_id: subjectId,
    message,
    ...(facts ? { facts } : {}),
    ...(remediation ? { remediation } : {}),
  };
}

function compareReasons(left: DecisionReason, right: DecisionReason): number {
  return (
    left.code.localeCompare(right.code) ||
    left.subject_type.localeCompare(right.subject_type) ||
    left.subject_id.localeCompare(right.subject_id)
  );
}

function addSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

export class GoalBoardCoordinator {
  constructor(
    readonly store: SqliteGoalBoardStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  initializeBoard(input: {
    board_id: string;
    title: string;
    actor_id: string;
    idempotency_key: string;
  }): { board_id: string; replayed: boolean; observed_event_cursor: number } {
    if (!input.board_id.trim() || !input.title.trim()) {
      throw new GoalBoardV1Error("request.invalid", "Board ID 和名称不能为空");
    }
    const hash = requestHash({ board_id: input.board_id, title: input.title });
    return this.store.immediate(() => {
      const replay = this.replay<{ board_id: string; observed_event_cursor: number }>(
        input.board_id,
        input.actor_id,
        "initialize_board",
        input.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };

      const exists = this.store.db
        .prepare("SELECT board_id FROM boards WHERE board_id = ?")
        .get(input.board_id);
      if (exists) throw new GoalBoardV1Error("board.exists", `Board 已存在: ${input.board_id}`);

      const at = this.clock().toISOString();
      this.store.db
        .prepare(
          "INSERT INTO boards (board_id, title, active_goal_id, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)",
        )
        .run(input.board_id, input.title.trim(), at, at);
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId: input.actor_id,
        type: "board.created",
        objectType: "board",
        objectId: input.board_id,
        reason: "创建 GoalBoard 真相源",
        payload: { title: input.title.trim() },
        at,
      });
      const outcome = { board_id: input.board_id, observed_event_cursor: cursor };
      this.remember(
        input.board_id,
        input.actor_id,
        "initialize_board",
        input.idempotency_key,
        hash,
        outcome,
        at,
      );
      return { ...outcome, replayed: false };
    });
  }

  createGoal(
    boardId: string,
    input: CreateGoalInput,
    write: ActorWrite,
  ): { goal: GoalRecord; replayed: boolean; observed_event_cursor: number } {
    this.validateGoalInput(input);
    const payload = { board_id: boardId, goal: input };
    const hash = requestHash(payload);
    return this.store.immediate(() => {
      const replay = this.replay<{ goal: GoalRecord; observed_event_cursor: number }>(
        boardId,
        write.actor_id,
        "create_goal",
        write.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };

      this.requireBoard(boardId);
      const goalId = input.goal_id?.trim() || `goal-${randomUUID()}`;
      if (this.store.getGoal(goalId)) {
        throw new GoalBoardV1Error("goal.exists", `Goal 已存在: ${goalId}`);
      }
      const at = this.clock().toISOString();
      const definitionState = input.definition_state ?? "draft";
      const decompositionState = input.decomposition_state ?? "abstract";
      const acceptedAt = definitionState === "accepted" ? at : null;
      const acceptedBy = definitionState === "accepted" ? write.actor_id : null;
      this.store.db
        .prepare(`
          INSERT INTO goals (
            goal_id, board_id, title, outcome, why, business_logic,
            in_scope_json, out_of_scope_json, constraints_json,
            required_inputs_json, promised_outputs_json,
            definition_state, decomposition_state, validity_state, fulfillment_state,
            priority, accepted_by, accepted_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'valid', 'unmet', ?, ?, ?, ?, ?)
        `)
        .run(
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
          definitionState,
          decompositionState,
          input.priority ?? 0,
          acceptedBy,
          acceptedAt,
          at,
          at,
        );
      const criterionStatement = this.store.db.prepare(`
        INSERT INTO acceptance_criteria (
          criterion_id, goal_id, statement, decision_method,
          pass_condition, target_json, required_evidence_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const criterion of input.acceptance_criteria) {
        criterionStatement.run(
          criterion.criterion_id?.trim() || `criterion-${randomUUID()}`,
          goalId,
          criterion.statement.trim(),
          criterion.decision_method,
          criterion.pass_condition.trim(),
          criterion.target == null ? null : sqliteJson(criterion.target),
          sqliteJson(criterion.required_evidence ?? []),
        );
      }
      const cursor = this.store.appendEvent({
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
      const goal = this.store.getGoal(goalId);
      if (!goal) throw new Error("Goal 写入后无法读取");
      const outcome = { goal, observed_event_cursor: cursor };
      this.remember(boardId, write.actor_id, "create_goal", write.idempotency_key, hash, outcome, at);
      return { ...outcome, replayed: false };
    });
  }

  updateDraftGoal(
    boardId: string,
    goalId: string,
    input: CreateGoalInput,
    write: ActorWrite,
  ): { goal: GoalRecord; replayed: boolean; observed_event_cursor: number } {
    if (input.definition_state && input.definition_state !== "draft") {
      throw new GoalBoardV1Error(
        "goal.draft_update_cannot_accept",
        "Draft 编辑只能补全草稿；确认 accepted Contract 必须走用户确认流程",
      );
    }
    const changeReason = write.reason?.trim() ?? "";
    if (!changeReason) {
      throw new GoalBoardV1Error("goal.draft_update_reason_required", "更新 Draft 时必须说明修改原因");
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
    return this.store.immediate(() => {
      const replay = this.replay<{ goal: GoalRecord; observed_event_cursor: number }>(
        boardId,
        write.actor_id,
        "update_draft_goal",
        write.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };

      const current = this.requireGoalOnBoard(boardId, goalId);
      if (current.definition_state !== "draft") {
        throw new GoalBoardV1Error(
          "goal.accepted_contract_immutable",
          "accepted Contract 不能原地修改；请创建新 Goal 并确认 Rewire",
        );
      }
      const criterionIds = normalized.acceptance_criteria
        .map((criterion) => criterion.criterion_id)
        .filter((criterionId): criterionId is string => Boolean(criterionId));
      if (new Set(criterionIds).size !== criterionIds.length) {
        throw new GoalBoardV1Error("goal.acceptance_id_duplicate", "验收条件 ID 不能重复");
      }

      const now = this.clock().toISOString();
      const pendingProposals = this.store.db
        .prepare(
          "SELECT proposal_id FROM contract_proposals WHERE board_id = ? AND goal_id = ? AND state = 'pending' ORDER BY created_at",
        )
        .all(boardId, goalId) as Array<{ proposal_id: string }>;
      if (pendingProposals.length) {
        this.store.db
          .prepare(`
            UPDATE contract_proposals
            SET state = 'superseded', decided_at = ?, decision_json = ?
            WHERE board_id = ? AND goal_id = ? AND state = 'pending'
          `)
          .run(
            now,
            sqliteJson({
              reason: "用户直接更新了 Draft，需要基于新事实重新提交 Contract Proposal",
              superseded_by: write.actor_id,
            }),
            boardId,
            goalId,
          );
      }

      this.store.db
        .prepare(`
          UPDATE goals SET
            title = ?, outcome = ?, why = ?, business_logic = ?,
            in_scope_json = ?, out_of_scope_json = ?, constraints_json = ?,
            required_inputs_json = ?, promised_outputs_json = ?,
            decomposition_state = ?, priority = ?, updated_at = ?
          WHERE goal_id = ? AND board_id = ?
        `)
        .run(
          normalized.title.trim(),
          normalized.outcome.trim(),
          normalized.why.trim(),
          normalized.business_logic.trim(),
          sqliteJson(normalized.in_scope ?? []),
          sqliteJson(normalized.out_of_scope ?? []),
          sqliteJson(normalized.constraints ?? []),
          sqliteJson(normalized.required_inputs ?? []),
          sqliteJson(normalized.promised_outputs ?? []),
          normalized.decomposition_state ?? current.decomposition_state,
          normalized.priority ?? current.priority,
          now,
          goalId,
          boardId,
        );
      this.store.db.prepare("DELETE FROM acceptance_criteria WHERE goal_id = ?").run(goalId);
      const insertCriterion = this.store.db.prepare(`
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
      const cursor = this.store.appendEvent({
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
      const goal = this.requireGoalOnBoard(boardId, goalId);
      const outcome = { goal, observed_event_cursor: cursor };
      this.remember(
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
    input: {
      from_goal_id: string;
      to_goal_id: string;
      type: "part_of" | "depends_on" | "conflicts_with" | "mitigates" | "extends" | "replaces" | "corrects" | "invalidates" | "migrates_from";
      state?: "proposed" | "active";
      reason: string;
    },
    write: ActorWrite,
  ): { relation_id: string; replayed: boolean; observed_event_cursor: number } {
    const hash = requestHash({ board_id: boardId, ...input });
    return this.store.immediate(() => {
      const replay = this.replay<{ relation_id: string; observed_event_cursor: number }>(
        boardId,
        write.actor_id,
        "add_relation",
        write.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      this.requireGoalOnBoard(boardId, input.from_goal_id);
      this.requireGoalOnBoard(boardId, input.to_goal_id);
      if (input.from_goal_id === input.to_goal_id) {
        throw new GoalBoardV1Error("relation.self_reference", "Goal 不能关联到自身");
      }
      const relationId = `relation-${randomUUID()}`;
      const at = this.clock().toISOString();
      this.store.db
        .prepare(`
          INSERT INTO goal_relations (
            relation_id, board_id, from_goal_id, to_goal_id, type, state,
            reason, created_by, created_at, deactivated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        `)
        .run(
          relationId,
          boardId,
          input.from_goal_id,
          input.to_goal_id,
          input.type,
          input.state ?? "active",
          input.reason,
          write.actor_id,
          at,
        );
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId: write.actor_id,
        type: "relation.added",
        objectType: "relation",
        objectId: relationId,
        reason: input.reason,
        payload: input,
        at,
      });
      const outcome = { relation_id: relationId, observed_event_cursor: cursor };
      this.remember(boardId, write.actor_id, "add_relation", write.idempotency_key, hash, outcome, at);
      return { ...outcome, replayed: false };
    });
  }

  addImpact(
    boardId: string,
    input: {
      goal_id: string;
      surface: string;
      access: ImpactAccess;
      input_snapshot?: string | null;
      state?: "proposed" | "confirmed";
      reason: string;
    },
    write: ActorWrite,
  ): { binding_id: string; replayed: boolean; observed_event_cursor: number } {
    const hash = requestHash({ board_id: boardId, ...input });
    return this.store.immediate(() => {
      const replay = this.replay<{ binding_id: string; observed_event_cursor: number }>(
        boardId,
        write.actor_id,
        "add_impact",
        write.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      this.requireGoalOnBoard(boardId, input.goal_id);
      if (!input.surface.trim()) throw new GoalBoardV1Error("impact.surface_required", "影响面不能为空");
      const bindingId = `impact-${randomUUID()}`;
      const at = this.clock().toISOString();
      this.store.db
        .prepare(`
          INSERT INTO impact_bindings (
            binding_id, board_id, goal_id, surface, access, input_snapshot,
            state, reason, created_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          bindingId,
          boardId,
          input.goal_id,
          input.surface.trim(),
          input.access,
          input.input_snapshot ?? null,
          input.state ?? "confirmed",
          input.reason,
          write.actor_id,
          at,
        );
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId: write.actor_id,
        type: "impact.added",
        objectType: "impact",
        objectId: bindingId,
        reason: input.reason,
        payload: input,
        at,
      });
      const outcome = { binding_id: bindingId, observed_event_cursor: cursor };
      this.remember(boardId, write.actor_id, "add_impact", write.idempotency_key, hash, outcome, at);
      return { ...outcome, replayed: false };
    });
  }

  setPolicy(
    boardId: string,
    input: { goal_id?: string | null; policy: Partial<GoalPolicy>; reason: string },
    write: ActorWrite,
  ): { policy_binding_id: string; replayed: boolean; observed_event_cursor: number } {
    const hash = requestHash({ board_id: boardId, ...input });
    return this.store.immediate(() => {
      const replay = this.replay<{ policy_binding_id: string; observed_event_cursor: number }>(
        boardId,
        write.actor_id,
        "set_policy",
        write.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      this.requireBoard(boardId);
      if (input.goal_id) this.requireGoalOnBoard(boardId, input.goal_id);
      if (!input.reason.trim()) {
        throw new GoalBoardV1Error("policy.reason_required", "保存 Policy 时必须说明原因");
      }
      if (
        input.policy.goal_mode != null &&
        !["disabled", "preferred", "required"].includes(input.policy.goal_mode)
      ) {
        throw new GoalBoardV1Error("policy.goal_mode_invalid", "Goal Mode 必须是关闭、建议或强制");
      }
      if (
        input.policy.required_capabilities != null &&
        (!Array.isArray(input.policy.required_capabilities) ||
          input.policy.required_capabilities.some(
            (capability) => typeof capability !== "string" || !capability.trim(),
          ))
      ) {
        throw new GoalBoardV1Error(
          "policy.capabilities_invalid",
          "Runtime 必需能力必须是非空字符串列表",
        );
      }
      for (const [field, value] of [
        ["cross_reviewers", input.policy.cross_reviewers],
        ["adversarial_reviewers", input.policy.adversarial_reviewers],
      ] as const) {
        if (value != null && (!Number.isInteger(value) || value < 0)) {
          throw new GoalBoardV1Error("policy.review_count_invalid", `${field} 必须是非负整数`);
        }
      }
      if (
        input.policy.max_lease_seconds != null &&
        (!Number.isInteger(input.policy.max_lease_seconds) || input.policy.max_lease_seconds <= 0)
      ) {
        throw new GoalBoardV1Error(
          "policy.max_lease_invalid",
          "最长领取时间必须是正整数秒数",
        );
      }
      const scope = input.goal_id ? "goal" : "project_default";
      const normalizedPolicy: Partial<GoalPolicy> = {
        ...input.policy,
        ...(input.policy.required_capabilities
          ? { required_capabilities: unique(input.policy.required_capabilities.map((item) => item.trim())).sort() }
          : {}),
      };
      const bindingId = `policy-${randomUUID()}`;
      const at = this.clock().toISOString();
      const replaced = (input.goal_id
        ? this.store.db
            .prepare(
              "SELECT policy_binding_id FROM policy_bindings WHERE board_id = ? AND goal_id = ? AND scope = 'goal' AND state = 'active'",
            )
            .all(boardId, input.goal_id)
        : this.store.db
            .prepare(
              "SELECT policy_binding_id FROM policy_bindings WHERE board_id = ? AND goal_id IS NULL AND scope = 'project_default' AND state = 'active'",
            )
            .all(boardId)) as Array<{ policy_binding_id: string }>;
      if (input.goal_id) {
        this.store.db
          .prepare(
            "UPDATE policy_bindings SET state = 'replaced' WHERE board_id = ? AND goal_id = ? AND scope = 'goal' AND state = 'active'",
          )
          .run(boardId, input.goal_id);
      } else {
        this.store.db
          .prepare(
            "UPDATE policy_bindings SET state = 'replaced' WHERE board_id = ? AND goal_id IS NULL AND scope = 'project_default' AND state = 'active'",
          )
          .run(boardId);
      }
      this.store.db
        .prepare(`
          INSERT INTO policy_bindings (
            policy_binding_id, board_id, goal_id, scope, policy_json,
            state, created_by, reason, created_at
          ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
        `)
        .run(
          bindingId,
          boardId,
          input.goal_id ?? null,
          scope,
          sqliteJson(normalizedPolicy),
          write.actor_id,
          input.reason.trim(),
          at,
        );
      const cursor = this.store.appendEvent({
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
      this.remember(boardId, write.actor_id, "set_policy", write.idempotency_key, hash, outcome, at);
      return { ...outcome, replayed: false };
    });
  }

  addRisk(
    boardId: string,
    input: {
      risk_id?: string;
      goal_ids: string[];
      description: string;
      probability: string;
      impact: string;
      affected_surfaces?: string[];
      trigger: string;
      treatment: RiskRecord["treatment"];
      blocking_mode: RiskRecord["blocking_mode"];
      revisit_condition: string;
      owner: string;
    },
    write: ActorWrite,
  ): { risk: RiskRecord; replayed: boolean; observed_event_cursor: number } {
    const hash = requestHash({ board_id: boardId, ...input });
    return this.store.immediate(() => {
      const replay = this.replay<{ risk: RiskRecord; observed_event_cursor: number }>(
        boardId,
        write.actor_id,
        "add_risk",
        write.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      this.requireBoard(boardId);
      if (!input.description.trim() || !input.trigger.trim() || !input.revisit_condition.trim()) {
        throw new GoalBoardV1Error("risk.required_field_missing", "Risk 必须说明风险、触发条件和何时重看");
      }
      for (const goalId of input.goal_ids) this.requireGoalOnBoard(boardId, goalId);
      const riskId = input.risk_id?.trim() || `risk-${randomUUID()}`;
      const now = this.clock().toISOString();
      this.store.db
        .prepare(`
          INSERT INTO risks (
            risk_id, board_id, description, probability, impact,
            affected_surfaces_json, trigger, treatment, blocking_mode,
            revisit_condition, owner, state, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
        `)
        .run(
          riskId,
          boardId,
          input.description.trim(),
          input.probability,
          input.impact,
          sqliteJson(input.affected_surfaces ?? []),
          input.trigger.trim(),
          input.treatment,
          input.blocking_mode,
          input.revisit_condition.trim(),
          input.owner,
          now,
          now,
        );
      const link = this.store.db.prepare("INSERT INTO goal_risks (goal_id, risk_id) VALUES (?, ?)");
      for (const goalId of unique(input.goal_ids)) link.run(goalId, riskId);
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId: write.actor_id,
        type: "risk.created",
        objectType: "risk",
        objectId: riskId,
        reason: write.reason ?? "登记 Goal 风险",
        payload: { goal_ids: input.goal_ids, blocking_mode: input.blocking_mode },
        at: now,
      });
      const risk = this.readRisk(boardId, riskId);
      const outcome = { risk, observed_event_cursor: cursor };
      this.remember(boardId, write.actor_id, "add_risk", write.idempotency_key, hash, outcome, now);
      return { ...outcome, replayed: false };
    });
  }

  setRiskState(
    boardId: string,
    input: { risk_id: string; state: RiskRecord["state"]; reason: string },
    write: ActorWrite,
  ): { risk: RiskRecord; replayed: boolean; observed_event_cursor: number } {
    const hash = requestHash({ board_id: boardId, ...input });
    return this.store.immediate(() => {
      const replay = this.replay<{ risk: RiskRecord; observed_event_cursor: number }>(
        boardId,
        write.actor_id,
        "set_risk_state",
        write.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      const row = this.store.db
        .prepare("SELECT * FROM risks WHERE risk_id = ? AND board_id = ?")
        .get(input.risk_id, boardId) as Row | undefined;
      if (!row) throw new GoalBoardV1Error("risk.not_found", `Risk 不存在: ${input.risk_id}`);
      const now = this.clock().toISOString();
      this.store.db
        .prepare("UPDATE risks SET state = ?, updated_at = ? WHERE risk_id = ?")
        .run(input.state, now, input.risk_id);
      const linkedGoals = this.store.db
        .prepare("SELECT goal_id FROM goal_risks WHERE risk_id = ? ORDER BY goal_id")
        .all(input.risk_id) as Row[];
      if (asText(row.blocking_mode) === "invalidate_on_trigger") {
        const validity = input.state === "triggered" ? "invalidated" : input.state === "resolved" ? "needs_revalidation" : null;
        if (validity) {
          for (const linked of linkedGoals) {
            this.store.db
              .prepare("UPDATE goals SET validity_state = ?, updated_at = ? WHERE goal_id = ?")
              .run(validity, now, asText(linked.goal_id));
          }
        }
      }
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId: write.actor_id,
        type: `risk.${input.state}`,
        objectType: "risk",
        objectId: input.risk_id,
        reason: input.reason,
        payload: { linked_goal_ids: linkedGoals.map((item) => asText(item.goal_id)) },
        at: now,
      });
      const risk = this.readRisk(boardId, input.risk_id);
      const outcome = { risk, observed_event_cursor: cursor };
      this.remember(boardId, write.actor_id, "set_risk_state", write.idempotency_key, hash, outcome, now);
      return { ...outcome, replayed: false };
    });
  }

  setActiveGoal(
    boardId: string,
    input: { goal_id: string; reason: string },
    write: ActorWrite,
  ): { active_goal_id: string; replayed: boolean; observed_event_cursor: number } {
    const hash = requestHash({ board_id: boardId, ...input });
    return this.store.immediate(() => {
      const replay = this.replay<{ active_goal_id: string; observed_event_cursor: number }>(
        boardId,
        write.actor_id,
        "set_active_goal",
        write.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      const goal = this.requireGoalOnBoard(boardId, input.goal_id);
      if (goal.definition_state !== "accepted") {
        throw new GoalBoardV1Error("goal.not_accepted", "只有已接受的 Goal 可以成为当前产品目标");
      }
      if (goal.archived_at) {
        throw new GoalBoardV1Error("goal.archived", "已归档 Goal 需要先恢复，才能设为当前产品目标");
      }
      const now = this.clock().toISOString();
      this.store.db
        .prepare("UPDATE boards SET active_goal_id = ?, updated_at = ? WHERE board_id = ?")
        .run(input.goal_id, now, boardId);
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId: write.actor_id,
        type: "board.active_goal_changed",
        objectType: "goal",
        objectId: input.goal_id,
        reason: input.reason,
        payload: {},
        at: now,
      });
      const outcome = { active_goal_id: input.goal_id, observed_event_cursor: cursor };
      this.remember(boardId, write.actor_id, "set_active_goal", write.idempotency_key, hash, outcome, now);
      return { ...outcome, replayed: false };
    });
  }

  setGoalArchived(
    boardId: string,
    input: { goal_id: string; archived: boolean; reason: string },
    write: ActorWrite,
  ): {
    goal: GoalRecord;
    active_goal_cleared: boolean;
    replayed: boolean;
    observed_event_cursor: number;
  } {
    const hash = requestHash({ board_id: boardId, ...input });
    return this.store.immediate(() => {
      const replay = this.replay<{
        goal: GoalRecord;
        active_goal_cleared: boolean;
        observed_event_cursor: number;
      }>(boardId, write.actor_id, "set_goal_archived", write.idempotency_key, hash);
      if (replay) return { ...replay, replayed: true };
      const goal = this.requireGoalOnBoard(boardId, input.goal_id);
      if (input.archived && goal.fulfillment_state !== "satisfied") {
        throw new GoalBoardV1Error("goal.not_satisfied", "只有已完成的 Goal 可以归档");
      }
      if (Boolean(goal.archived_at) === input.archived) {
        throw new GoalBoardV1Error(
          "goal.archive_state_unchanged",
          input.archived ? "Goal 已经归档" : "Goal 当前未归档",
        );
      }
      const now = this.clock().toISOString();
      this.store.db
        .prepare("UPDATE goals SET archived_at = ?, archived_by = ?, updated_at = ? WHERE goal_id = ?")
        .run(input.archived ? now : null, input.archived ? write.actor_id : null, now, input.goal_id);
      const board = this.store.db
        .prepare("SELECT active_goal_id FROM boards WHERE board_id = ?")
        .get(boardId) as Row;
      const activeGoalCleared = input.archived && asNullableText(board.active_goal_id) === input.goal_id;
      if (activeGoalCleared) {
        this.store.db
          .prepare("UPDATE boards SET active_goal_id = NULL, updated_at = ? WHERE board_id = ?")
          .run(now, boardId);
      }
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId: write.actor_id,
        type: input.archived ? "goal.archived" : "goal.restored",
        objectType: "goal",
        objectId: input.goal_id,
        reason: input.reason,
        payload: { active_goal_cleared: activeGoalCleared },
        at: now,
      });
      const updated = this.requireGoalOnBoard(boardId, input.goal_id);
      const outcome = {
        goal: updated,
        active_goal_cleared: activeGoalCleared,
        observed_event_cursor: cursor,
      };
      this.remember(
        boardId,
        write.actor_id,
        "set_goal_archived",
        write.idempotency_key,
        hash,
        outcome,
        now,
      );
      return { ...outcome, replayed: false };
    });
  }

  queryReady(input: ReadyQuery): ReadyQueryResult {
    this.requireBoard(input.board_id);
    const now = this.clock().toISOString();
    const role = input.role ?? "executor";
    const ready: ReadyGoal[] = [];
    for (const goal of this.store.listGoals(input.board_id)) {
      const evaluation = this.evaluate({
        boardId: input.board_id,
        goalId: goal.goal_id,
        actorId: input.actor_id,
        role,
        capabilities: input.capabilities ?? [],
        goalModeAttestation: input.goal_mode_attestation ?? false,
        now,
      });
      if (evaluation.reasons.length > 0 || !evaluation.goal) continue;
      ready.push({
        goal: evaluation.goal,
        role,
        why_now:
          role === "clarifier"
            ? "Goal 仍需要补齐定义、拆分或验收，现在可以开始澄清"
            : role === "revalidator"
              ? "Goal 的前提发生过变化，需要重新核对 Contract、依赖和风险后恢复可信状态"
            : "Goal 已定义清楚，依赖、风险、影响面和领取策略当前都允许开始",
        priority_hint: evaluation.goal.priority,
        dependency_summary: this.dependencySummary(input.board_id, goal.goal_id),
        risk_summary: this.riskSummary(goal.goal_id),
        resolved_policy: evaluation.policy,
        relevant_surfaces: evaluation.surfaces,
      });
    }
    ready.sort(
      (left, right) =>
        right.priority_hint - left.priority_hint || left.goal.goal_id.localeCompare(right.goal.goal_id),
    );
    return { observed_event_cursor: this.store.eventCursor(input.board_id), ready };
  }

  explainGoal(input: ReadyQuery & { goal_id: string }): ExplainGoalResult {
    this.requireBoard(input.board_id);
    const role = input.role ?? "executor";
    const evaluation = this.evaluate({
      boardId: input.board_id,
      goalId: input.goal_id,
      actorId: input.actor_id,
      role,
      capabilities: input.capabilities ?? [],
      goalModeAttestation: input.goal_mode_attestation ?? false,
      now: this.clock().toISOString(),
    });
    return {
      goal: evaluation.goal,
      role,
      ready: evaluation.reasons.length === 0 && evaluation.goal !== null,
      observed_event_cursor: this.store.eventCursor(input.board_id),
      reasons: evaluation.reasons,
      resolved_policy: evaluation.policy,
      relevant_surfaces: evaluation.surfaces,
    };
  }

  readGoalContract(boardId: string, goalId: string): GoalContractView {
    this.requireBoard(boardId);
    const snapshot = this.store.snapshot(boardId);
    const goal = snapshot.goals.find((item) => item.goal_id === goalId);
    if (!goal) throw new GoalBoardV1Error("goal.not_found", `找不到这个 Goal: ${goalId}`);
    const runs = snapshot.runs.filter((item) => item.goal_id === goalId);
    const runIds = new Set(runs.map((item) => item.run_id));
    const candidates = snapshot.candidates.filter(
      (item) => item.discovered_in_run_id != null && runIds.has(item.discovered_in_run_id),
    );
    const candidateIds = new Set(candidates.map((item) => item.candidate_id));
    const riskIds = new Set(
      (this.store.db
        .prepare("SELECT risk_id FROM goal_risks WHERE goal_id = ? ORDER BY risk_id")
        .all(goalId) as Row[]).map((row) => asText(row.risk_id)),
    );
    return {
      board: snapshot.board,
      observed_event_cursor: snapshot.cursor,
      goal_path: `/goals/${encodeURIComponent(goalId)}`,
      goal,
      relations: snapshot.relations.filter(
        (item) => item.from_goal_id === goalId || item.to_goal_id === goalId,
      ),
      impacts: snapshot.impacts.filter((item) => item.goal_id === goalId),
      risks: snapshot.risks.filter((item) => riskIds.has(item.risk_id)),
      resolved_policy: this.resolvePolicy(boardId, goalId),
      claims: snapshot.claims.filter((item) => item.goal_id === goalId),
      runs,
      evidence: snapshot.evidence.filter((item) => item.goal_id === goalId),
      review_obligations: snapshot.review_obligations.filter((item) => item.goal_id === goalId),
      reviews: snapshot.reviews.filter((item) => item.goal_id === goalId),
      candidates,
      contract_proposals: snapshot.contract_proposals.filter((item) => item.goal_id === goalId),
      rewires: snapshot.rewires.filter((item) => {
        if (item.candidate_id != null && candidateIds.has(item.candidate_id)) return true;
        return (item.proposal.relations ?? []).some((relation) => {
          const fromGoalId = String(relation.from_goal_id ?? "");
          const toGoalId = String(relation.to_goal_id ?? "");
          return fromGoalId === goalId || toGoalId === goalId;
        });
      }),
    };
  }

  claimGoal(request: ClaimRequest): ClaimDecision {
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
      const evaluation = this.evaluate({
        boardId: request.board_id,
        goalId: request.goal_id,
        actorId: request.actor_id,
        role,
        capabilities: request.capabilities ?? [],
        goalModeAttestation: request.goal_mode_attestation ?? false,
        strengthenPolicy: request.strengthen_policy,
        now,
      });
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

      this.expirePastClaims(request.board_id, now, request.actor_id);
      const claimId = `claim-${randomUUID()}`;
      const expiresAt = addSeconds(now, requestedLease);
      this.store.db
        .prepare(`
          INSERT INTO claims (
            claim_id, board_id, goal_id, actor_id, role, state,
            capabilities_json, goal_mode_attestation, resolved_policy_json,
            claimed_at, expires_at, renewed_at, released_at, release_reason
          ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, NULL, NULL, NULL)
        `)
        .run(
          claimId,
          request.board_id,
          request.goal_id,
          request.actor_id,
          role,
          sqliteJson(unique(request.capabilities ?? []).sort()),
          request.goal_mode_attestation ? 1 : 0,
          sqliteJson(evaluation.policy),
          now,
          expiresAt,
        );
      if (role === "executor" || role === "revalidator") {
        this.ensureReviewObligations(request.board_id, request.goal_id, evaluation.policy, now);
      }
      this.store.appendEvent({
        eventId: randomUUID(),
        boardId: request.board_id,
        actorId: request.actor_id,
        type: "claim.created",
        objectType: "claim",
        objectId: claimId,
        reason:
          role === "clarifier"
            ? "Runtime 自主领取待澄清 Goal"
            : role === "revalidator"
              ? "Runtime 自主领取待重新验证 Goal"
              : "Runtime 自主领取 Ready Goal",
        payload: { goal_id: request.goal_id, role, expires_at: expiresAt },
        at: now,
      });
      const claimRow = this.store.db.prepare("SELECT * FROM claims WHERE claim_id = ?").get(claimId) as Row;
      const claim = mapSqliteClaim(claimRow);
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

  releaseClaim(input: {
    board_id: string;
    claim_id: string;
    actor_id: string;
    reason: string;
    idempotency_key: string;
  }): { claim: ClaimRecord; replayed: boolean; observed_event_cursor: number } {
    const hash = requestHash({
      board_id: input.board_id,
      claim_id: input.claim_id,
      actor_id: input.actor_id,
      reason: input.reason,
    });
    return this.store.immediate(() => {
      const replay = this.replay<{ claim: ClaimRecord; observed_event_cursor: number }>(
        input.board_id,
        input.actor_id,
        "release_claim",
        input.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      this.requireBoard(input.board_id);
      const row = this.store.db
        .prepare("SELECT * FROM claims WHERE claim_id = ? AND board_id = ?")
        .get(input.claim_id, input.board_id) as Row | undefined;
      if (!row) throw new GoalBoardV1Error("claim.not_found", `Claim 不存在: ${input.claim_id}`);
      if (asText(row.actor_id) !== input.actor_id) {
        throw new GoalBoardV1Error("claim.not_owner", "只有领取者可以释放 Claim");
      }
      if (asText(row.state) !== "active") {
        throw new GoalBoardV1Error("claim.not_active", "Claim 已经不是 active 状态");
      }
      const at = this.clock().toISOString();
      this.store.db
        .prepare("UPDATE claims SET state = 'released', released_at = ?, release_reason = ? WHERE claim_id = ?")
        .run(at, input.reason, input.claim_id);
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId: input.actor_id,
        type: "claim.released",
        objectType: "claim",
        objectId: input.claim_id,
        reason: input.reason,
        payload: {},
        at,
      });
      const updated = this.store.db.prepare("SELECT * FROM claims WHERE claim_id = ?").get(input.claim_id) as Row;
      const outcome = { claim: mapSqliteClaim(updated), observed_event_cursor: cursor };
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
      const claim = this.store.db
        .prepare("SELECT * FROM claims WHERE claim_id = ? AND board_id = ?")
        .get(input.claim_id, input.board_id) as Row | undefined;
      if (!claim) throw new GoalBoardV1Error("claim.not_found", `Claim 不存在: ${input.claim_id}`);
      if (asText(claim.actor_id) !== input.actor_id) {
        throw new GoalBoardV1Error("claim.not_owner", "只有领取者可以开始 Run");
      }
      if (asText(claim.state) !== "active" || asText(claim.expires_at) <= now) {
        throw new GoalBoardV1Error("run.claim_inactive", "Claim 已释放、撤销或过期，不能开始 Run");
      }
      const role = asText(claim.role);
      if (role !== "clarifier" && role !== "executor" && role !== "revalidator") {
        throw new GoalBoardV1Error("run.role_invalid", "这个 Claim 角色不能启动工作 Run");
      }
      const goal = this.store.getGoal(asText(claim.goal_id));
      if (!goal || goal.validity_state === "invalidated") {
        throw new GoalBoardV1Error("goal.invalidated", "Goal 已失效，不能开始 Run");
      }
      const active = this.store.db
        .prepare("SELECT run_id FROM runs WHERE claim_id = ? AND state IN ('started', 'blocked')")
        .get(input.claim_id);
      if (active) throw new GoalBoardV1Error("run.already_active", "这个 Claim 已有未结束的 Run");

      const runId = `run-${randomUUID()}`;
      this.store.db
        .prepare(`
          INSERT INTO runs (
            run_id, board_id, goal_id, claim_id, actor_id, role, state,
            block_reason, output_refs_json, discovery_refs_json, started_at, ended_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'started', NULL, '[]', '[]', ?, NULL)
        `)
        .run(
          runId,
          input.board_id,
          asText(claim.goal_id),
          input.claim_id,
          input.actor_id,
          role,
          now,
        );
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId: input.actor_id,
        type: "run.started",
        objectType: "run",
        objectId: runId,
        reason: "开始执行已领取的 Goal",
        payload: { goal_id: asText(claim.goal_id), claim_id: input.claim_id },
        at: now,
      });
      const run = this.readRun(runId);
      const outcome = { run, observed_event_cursor: cursor };
      this.remember(input.board_id, input.actor_id, "start_run", input.idempotency_key, hash, outcome, now);
      return { ...outcome, replayed: false };
    });
  }

  revalidateGoal(input: {
    board_id: string;
    goal_id: string;
    run_id: string;
    actor_id: string;
    reason: string;
    evidence_refs: string[];
    idempotency_key: string;
  }): RevalidationDecision {
    const hash = requestHash(input);
    return this.store.immediate(() => {
      const replay = this.replay<Omit<RevalidationDecision, "replayed">>(
        input.board_id,
        input.actor_id,
        "revalidate_goal",
        input.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };

      this.requireBoard(input.board_id);
      const reasonText = input.reason.trim();
      const evidenceRefs = unique(input.evidence_refs.map((item) => item.trim()).filter(Boolean));
      if (!reasonText) {
        throw new GoalBoardV1Error("revalidation.reason_required", "重新验证必须说明核对结论");
      }
      if (evidenceRefs.length === 0) {
        throw new GoalBoardV1Error("revalidation.evidence_required", "重新验证必须引用至少一项核对证据");
      }

      const now = this.clock().toISOString();
      const run = this.store.db
        .prepare(`
          SELECT
            r.*,
            c.state AS claim_state,
            c.expires_at AS claim_expires_at,
            c.role AS claim_role,
            c.actor_id AS claim_actor_id
          FROM runs r
          JOIN claims c ON c.claim_id = r.claim_id
          WHERE r.run_id = ? AND r.board_id = ?
        `)
        .get(input.run_id, input.board_id) as Row | undefined;
      if (!run) throw new GoalBoardV1Error("run.not_found", `Run 不存在: ${input.run_id}`);
      if (asText(run.goal_id) !== input.goal_id) {
        throw new GoalBoardV1Error("revalidation.goal_mismatch", "这个 Run 领取的不是待重新验证的 Goal");
      }
      if (asText(run.actor_id) !== input.actor_id || asText(run.claim_actor_id) !== input.actor_id) {
        throw new GoalBoardV1Error("run.not_owner", "只有这个 Run 的领取者可以提交重新验证");
      }
      if (asText(run.role) !== "revalidator" || asText(run.claim_role) !== "revalidator") {
        throw new GoalBoardV1Error("revalidation.role_required", "只有 revalidator Run 可以恢复 Goal 的可信状态");
      }
      if (asText(run.state) !== "started") {
        throw new GoalBoardV1Error("revalidation.run_not_started", "重新验证只能由正在执行的 Run 提交");
      }
      if (asText(run.claim_state) !== "active" || asText(run.claim_expires_at) <= now) {
        throw new GoalBoardV1Error("revalidation.claim_inactive", "重新验证 Claim 已释放、撤销或过期");
      }

      const goal = this.requireGoalOnBoard(input.board_id, input.goal_id);
      const reasons: DecisionReason[] = [];
      if (goal.definition_state !== "accepted") {
        reasons.push(reason("goal.not_accepted", "goal", goal.goal_id, "Goal 还没有被接受"));
      }
      if (goal.decomposition_state !== "closed_leaf") {
        reasons.push(
          reason(
            "goal.not_closed_leaf",
            "goal",
            goal.goal_id,
            "这个 Goal 还不是可以直接验证的最小 Goal",
            { decomposition_state: goal.decomposition_state },
          ),
        );
      }
      if (goal.acceptance_criteria.length === 0) {
        reasons.push(reason("goal.acceptance_missing", "criterion", goal.goal_id, "Goal 没有明确验收条件"));
      }
      if (goal.validity_state === "valid") {
        reasons.push(reason("goal.revalidation_not_needed", "goal", goal.goal_id, "Goal 当前已经是可信状态"));
      } else if (goal.validity_state === "invalidated") {
        reasons.push(reason("goal.invalidated", "goal", goal.goal_id, "Goal 已失效，不能通过重新验证直接恢复"));
      }

      const dependencies = this.store.db
        .prepare(`
          SELECT g.goal_id, g.title, g.fulfillment_state, g.validity_state
          FROM goal_relations r
          JOIN goals g ON g.goal_id = r.to_goal_id
          WHERE r.board_id = ? AND r.from_goal_id = ?
            AND r.type = 'depends_on' AND r.state = 'active'
          ORDER BY g.goal_id
        `)
        .all(input.board_id, input.goal_id) as Row[];
      for (const dependency of dependencies) {
        const dependencyId = asText(dependency.goal_id);
        if (asText(dependency.fulfillment_state) !== "satisfied") {
          reasons.push(
            reason(
              "dependency.unsatisfied",
              "dependency",
              dependencyId,
              `前置 Goal「${asText(dependency.title)}」还未完成，不能恢复可信状态`,
              { dependency_goal_id: dependencyId },
            ),
          );
        }
        if (asText(dependency.validity_state) !== "valid") {
          reasons.push(
            reason(
              "dependency.not_valid",
              "dependency",
              dependencyId,
              `前置 Goal「${asText(dependency.title)}」当前不可信`,
              { validity_state: asText(dependency.validity_state) },
            ),
          );
        }
      }

      const risks = this.store.db
        .prepare(`
          SELECT r.* FROM risks r
          JOIN goal_risks gr ON gr.risk_id = r.risk_id
          WHERE gr.goal_id = ?
            AND r.state IN ('open', 'triggered')
            AND r.blocking_mode <> 'none'
          ORDER BY r.risk_id
        `)
        .all(input.goal_id) as Row[];
      for (const risk of risks) {
        reasons.push(
          reason(
            "risk.blocks_revalidation",
            "risk",
            asText(risk.risk_id),
            `风险仍未解除：${asText(risk.description)}`,
            { blocking_mode: asText(risk.blocking_mode), state: asText(risk.state) },
            asText(risk.revisit_condition),
          ),
        );
      }

      if (reasons.length > 0) {
        const outcome: Omit<RevalidationDecision, "replayed"> = {
          revalidated: false,
          goal,
          observed_event_cursor: this.store.eventCursor(input.board_id),
          reasons: reasons.sort(compareReasons),
        };
        this.remember(
          input.board_id,
          input.actor_id,
          "revalidate_goal",
          input.idempotency_key,
          hash,
          outcome,
          now,
        );
        return { ...outcome, replayed: false };
      }

      this.store.db
        .prepare("UPDATE goals SET validity_state = 'valid', updated_at = ? WHERE goal_id = ?")
        .run(now, input.goal_id);
      const cursor = this.store.appendEvent({
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
      const updatedGoal = this.requireGoalOnBoard(input.board_id, input.goal_id);
      const outcome: Omit<RevalidationDecision, "replayed"> = {
        revalidated: true,
        goal: updatedGoal,
        observed_event_cursor: cursor,
        reasons: [],
      };
      this.remember(
        input.board_id,
        input.actor_id,
        "revalidate_goal",
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
    idempotency_key: string;
  }): { run: RunRecord; replayed: boolean; observed_event_cursor: number } {
    const hash = requestHash(input);
    return this.store.immediate(() => {
      const replay = this.replay<{ run: RunRecord; observed_event_cursor: number }>(
        input.board_id,
        input.actor_id,
        "report_run",
        input.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      const row = this.store.db
        .prepare("SELECT * FROM runs WHERE run_id = ? AND board_id = ?")
        .get(input.run_id, input.board_id) as Row | undefined;
      if (!row) throw new GoalBoardV1Error("run.not_found", `Run 不存在: ${input.run_id}`);
      if (asText(row.actor_id) !== input.actor_id) {
        throw new GoalBoardV1Error("run.not_owner", "只有执行者可以报告这个 Run");
      }
      const current = asText(row.state);
      const allowed =
        (current === "started" && ["blocked", "completed", "failed", "abandoned"].includes(input.state)) ||
        (current === "blocked" && ["started", "completed", "failed", "abandoned"].includes(input.state));
      if (!allowed) {
        throw new GoalBoardV1Error("run.transition_invalid", `Run 不能从 ${current} 变为 ${input.state}`);
      }
      if (input.state === "blocked" && !input.block_reason?.trim()) {
        throw new GoalBoardV1Error("run.block_reason_required", "阻塞 Run 必须说明原因");
      }
      const now = this.clock().toISOString();
      const terminal = ["completed", "failed", "abandoned"].includes(input.state);
      this.store.db
        .prepare(`
          UPDATE runs SET state = ?, block_reason = ?, output_refs_json = ?,
            discovery_refs_json = ?, ended_at = ? WHERE run_id = ?
        `)
        .run(
          input.state,
          input.block_reason ?? null,
          sqliteJson(unique(input.output_refs ?? parseJson<string[]>(row.output_refs_json, []))),
          sqliteJson(unique(input.discovery_refs ?? parseJson<string[]>(row.discovery_refs_json, []))),
          terminal ? now : null,
          input.run_id,
        );
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId: input.actor_id,
        type: `run.${input.state}`,
        objectType: "run",
        objectId: input.run_id,
        reason: input.block_reason ?? `Run 状态变为 ${input.state}`,
        payload: { output_refs: input.output_refs ?? [], discovery_refs: input.discovery_refs ?? [] },
        at: now,
      });
      const outcome = { run: this.readRun(input.run_id), observed_event_cursor: cursor };
      this.remember(input.board_id, input.actor_id, "report_run", input.idempotency_key, hash, outcome, now);
      return { ...outcome, replayed: false };
    });
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
    digest?: string | null;
    result: EvidenceRecord["result"];
    idempotency_key: string;
  }): { evidence: EvidenceRecord; replayed: boolean; observed_event_cursor: number } {
    const hash = requestHash(input);
    return this.store.immediate(() => {
      const replay = this.replay<{ evidence: EvidenceRecord; observed_event_cursor: number }>(
        input.board_id,
        input.actor_id,
        "submit_evidence",
        input.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      const goal = this.requireGoalOnBoard(input.board_id, input.goal_id);
      if (!input.locator.trim()) throw new GoalBoardV1Error("evidence.locator_required", "Evidence 必须有可查找的位置");
      if (input.criterion_ids.length === 0) {
        throw new GoalBoardV1Error("evidence.criterion_required", "Evidence 至少要对应一条验收条件");
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
        const run = this.store.db
          .prepare("SELECT actor_id, goal_id FROM runs WHERE run_id = ? AND board_id = ?")
          .get(input.run_id, input.board_id) as Row | undefined;
        if (!run || asText(run.goal_id) !== input.goal_id) {
          throw new GoalBoardV1Error("evidence.run_invalid", "Evidence 引用的 Run 不属于这个 Goal");
        }
        if (asText(run.actor_id) !== input.actor_id) {
          throw new GoalBoardV1Error("evidence.actor_invalid", "只有 Run 执行者可以提交它的 Evidence");
        }
      }
      const evidenceId = `evidence-${randomUUID()}`;
      const now = this.clock().toISOString();
      this.store.db
        .prepare(`
          INSERT INTO evidence (
            evidence_id, board_id, goal_id, criterion_ids_json, producer_actor_id,
            run_id, review_id, kind, locator, digest, captured_at, result
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          evidenceId,
          input.board_id,
          input.goal_id,
          sqliteJson(unique(input.criterion_ids).sort()),
          input.actor_id,
          input.run_id ?? null,
          input.review_id ?? null,
          input.kind,
          input.locator.trim(),
          input.digest ?? null,
          now,
          input.result,
        );
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId: input.actor_id,
        type: "evidence.submitted",
        objectType: "evidence",
        objectId: evidenceId,
        reason: "提交验收证据",
        payload: { goal_id: input.goal_id, criterion_ids: input.criterion_ids, result: input.result },
        at: now,
      });
      const evidence = this.readEvidence(evidenceId);
      const outcome = { evidence, observed_event_cursor: cursor };
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

  submitReview(input: {
    board_id: string;
    goal_id: string;
    obligation_id: string;
    actor_id: string;
    actor_kind?: "user" | "runtime";
    verdict: ReviewRecord["verdict"];
    evidence_refs?: string[];
    reasoning: string;
    idempotency_key: string;
  }): { review: ReviewRecord; replayed: boolean; observed_event_cursor: number } {
    const hash = requestHash(input);
    return this.store.immediate(() => {
      const replay = this.replay<{ review: ReviewRecord; observed_event_cursor: number }>(
        input.board_id,
        input.actor_id,
        "submit_review",
        input.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      this.requireGoalOnBoard(input.board_id, input.goal_id);
      if (!input.reasoning.trim()) throw new GoalBoardV1Error("review.reasoning_required", "Review 必须说明判断理由");
      const obligation = this.store.db
        .prepare("SELECT * FROM review_obligations WHERE obligation_id = ? AND goal_id = ?")
        .get(input.obligation_id, input.goal_id) as Row | undefined;
      if (!obligation) throw new GoalBoardV1Error("review.obligation_not_found", "找不到这项 Review 要求");
      if (asText(obligation.state) !== "pending") {
        throw new GoalBoardV1Error("review.obligation_closed", "这项 Review 要求已经关闭");
      }
      const role = asText(obligation.role);
      if (role === "human_approver" && input.actor_kind !== "user") {
        throw new GoalBoardV1Error(
          "review.user_authority_required",
          "只有用户可以提交 human approval Review",
        );
      }
      if (role === "cross_reviewer" || role === "adversarial_reviewer") {
        const executor = this.store.db
          .prepare(`
            SELECT actor_id FROM claims WHERE goal_id = ? AND role IN ('executor', 'revalidator')
            ORDER BY claimed_at DESC LIMIT 1
          `)
          .get(input.goal_id) as Row | undefined;
        if (executor && asText(executor.actor_id) === input.actor_id) {
          throw new GoalBoardV1Error(
            "review.independence_failed",
            "执行者不能交叉或对抗性复核自己的 Goal",
          );
        }
      }
      const reviewId = `review-${randomUUID()}`;
      const now = this.clock().toISOString();
      this.store.db
        .prepare(`
          INSERT INTO reviews (
            review_id, board_id, goal_id, obligation_id, claim_id, actor_id,
            verdict, evidence_refs_json, reasoning, submitted_at
          ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
        `)
        .run(
          reviewId,
          input.board_id,
          input.goal_id,
          input.obligation_id,
          input.actor_id,
          input.verdict,
          sqliteJson(unique(input.evidence_refs ?? [])),
          input.reasoning.trim(),
          now,
        );
      if (input.verdict === "pass") {
        const passed = this.store.db
          .prepare("SELECT COUNT(DISTINCT actor_id) AS count FROM reviews WHERE obligation_id = ? AND verdict = 'pass'")
          .get(input.obligation_id) as Row;
        if (Number(passed.count ?? 0) >= Number(obligation.required_count ?? 0)) {
          this.store.db
            .prepare("UPDATE review_obligations SET state = 'satisfied' WHERE obligation_id = ?")
            .run(input.obligation_id);
        }
      }
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId: input.actor_id,
        type: "review.submitted",
        objectType: "review",
        objectId: reviewId,
        reason: input.reasoning,
        payload: { goal_id: input.goal_id, obligation_id: input.obligation_id, verdict: input.verdict },
        at: now,
      });
      const review = this.readReview(reviewId);
      const outcome = { review, observed_event_cursor: cursor };
      this.remember(input.board_id, input.actor_id, "submit_review", input.idempotency_key, hash, outcome, now);
      return { ...outcome, replayed: false };
    });
  }

  evaluateLeafCompletion(input: {
    board_id: string;
    goal_id: string;
    actor_id: string;
    idempotency_key: string;
  }): {
    satisfied: boolean;
    reasons: DecisionReason[];
    replayed: boolean;
    observed_event_cursor: number;
  } {
    const hash = requestHash(input);
    return this.store.immediate(() => {
      const replay = this.replay<{
        satisfied: boolean;
        reasons: DecisionReason[];
        observed_event_cursor: number;
      }>(input.board_id, input.actor_id, "evaluate_leaf_completion", input.idempotency_key, hash);
      if (replay) return { ...replay, replayed: true };
      const goal = this.requireGoalOnBoard(input.board_id, input.goal_id);
      const reasons: DecisionReason[] = [];
      if (goal.definition_state !== "accepted" || goal.decomposition_state !== "closed_leaf") {
        reasons.push(reason("goal.not_closed_leaf", "goal", goal.goal_id, "只有已接受的最小 Goal 才能完成"));
      }
      if (goal.validity_state !== "valid") {
        reasons.push(reason("goal.not_valid", "goal", goal.goal_id, "Goal 当前不可信，不能完成"));
      }
      const dependencies = this.store.db
        .prepare(`
          SELECT g.goal_id, g.title, g.fulfillment_state, g.validity_state
          FROM goal_relations r
          JOIN goals g ON g.goal_id = r.to_goal_id
          WHERE r.board_id = ? AND r.from_goal_id = ?
            AND r.type = 'depends_on' AND r.state = 'active'
          ORDER BY g.goal_id
        `)
        .all(input.board_id, input.goal_id) as Row[];
      for (const dependency of dependencies) {
        const dependencyId = asText(dependency.goal_id);
        if (asText(dependency.fulfillment_state) !== "satisfied") {
          reasons.push(
            reason(
              "dependency.unsatisfied",
              "dependency",
              dependencyId,
              `前置 Goal「${asText(dependency.title)}」尚未完成，不能完成当前 Goal`,
            ),
          );
        }
        if (asText(dependency.validity_state) !== "valid") {
          reasons.push(
            reason(
              "dependency.not_valid",
              "dependency",
              dependencyId,
              `前置 Goal「${asText(dependency.title)}」当前不可信，不能完成当前 Goal`,
              { validity_state: asText(dependency.validity_state) },
            ),
          );
        }
      }
      const evidenceRows = this.store.db
        .prepare("SELECT criterion_ids_json, result FROM evidence WHERE goal_id = ?")
        .all(input.goal_id) as Row[];
      for (const criterion of goal.acceptance_criteria) {
        const passed = evidenceRows.some(
          (row) =>
            asText(row.result) === "passed" &&
            parseJson<string[]>(row.criterion_ids_json, []).includes(criterion.criterion_id),
        );
        if (!passed) {
          reasons.push(
            reason(
              "evidence.criterion_uncovered",
              "criterion",
              criterion.criterion_id,
              `验收条件「${criterion.statement}」还没有通过证据`,
              undefined,
              criterion.pass_condition,
            ),
          );
        }
      }
      const pendingReviews = this.store.db
        .prepare("SELECT obligation_id, role FROM review_obligations WHERE goal_id = ? AND state = 'pending'")
        .all(input.goal_id) as Row[];
      for (const pending of pendingReviews) {
        reasons.push(
          reason(
            "policy.review_pending",
            "review",
            asText(pending.obligation_id),
            `还缺少 ${asText(pending.role)} Review`,
          ),
        );
      }
      const completionRisks = this.store.db
        .prepare(`
          SELECT r.risk_id, r.description FROM risks r
          JOIN goal_risks gr ON gr.risk_id = r.risk_id
          WHERE gr.goal_id = ? AND r.blocking_mode IN ('completion', 'invalidate_on_trigger')
            AND r.state IN ('open', 'triggered')
        `)
        .all(input.goal_id) as Row[];
      for (const risk of completionRisks) {
        reasons.push(
          reason("risk.blocks_completion", "risk", asText(risk.risk_id), asText(risk.description)),
        );
      }
      const pendingCandidates = this.store.db
        .prepare(`
          SELECT c.candidate_id FROM candidates c
          JOIN runs r ON r.run_id = c.discovered_in_run_id
          WHERE r.goal_id = ? AND c.state = 'pending' AND c.blocking_mode = 'current_run'
        `)
        .all(input.goal_id) as Row[];
      for (const candidate of pendingCandidates) {
        reasons.push(
          reason(
            "candidate.user_decision_required",
            "candidate",
            asText(candidate.candidate_id),
            "执行中发现的新工作需要用户决定",
          ),
        );
      }
      const pendingRewires = this.store.db
        .prepare(`
          SELECT w.rewire_id, c.candidate_id FROM rewires w
          JOIN candidates c ON c.candidate_id = w.candidate_id
          JOIN runs r ON r.run_id = c.discovered_in_run_id
          WHERE r.goal_id = ? AND w.state = 'pending'
            AND c.blocking_mode = 'current_run'
        `)
        .all(input.goal_id) as Row[];
      for (const pending of pendingRewires) {
        reasons.push(
          reason(
            "rewire.user_confirmation_required",
            "rewire",
            asText(pending.rewire_id),
            "用户已接受 Candidate Goal，但关系调整尚未确认",
            { candidate_id: asText(pending.candidate_id) },
          ),
        );
      }
      const directPendingRewires = this.store
        .snapshot(input.board_id)
        .rewires.filter(
          (rewire) =>
            rewire.candidate_id == null &&
            rewire.state === "pending" &&
            rewire.proposal.proposal_kind === "dependency" &&
            rewire.proposal.blocking_mode === "current_run" &&
            rewire.proposal.discovered_in_run_id != null,
        );
      for (const pending of directPendingRewires) {
        const discoveredRun = this.store
          .snapshot(input.board_id)
          .runs.find((run) => run.run_id === pending.proposal.discovered_in_run_id);
        if (discoveredRun?.goal_id !== input.goal_id) continue;
        reasons.push(
          reason(
            "rewire.user_confirmation_required",
            "rewire",
            pending.rewire_id,
            "Runtime 提出了依赖调整，等待用户决定",
          ),
        );
      }
      const now = this.clock().toISOString();
      const observedCursor = this.store.eventCursor(input.board_id);
      if (reasons.length > 0) {
        const outcome = { satisfied: false, reasons: reasons.sort(compareReasons), observed_event_cursor: observedCursor };
        this.remember(
          input.board_id,
          input.actor_id,
          "evaluate_leaf_completion",
          input.idempotency_key,
          hash,
          outcome,
          now,
        );
        return { ...outcome, replayed: false };
      }
      this.store.db
        .prepare("UPDATE goals SET fulfillment_state = 'satisfied', updated_at = ? WHERE goal_id = ?")
        .run(now, input.goal_id);
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId: input.actor_id,
        type: "goal.satisfied",
        objectType: "goal",
        objectId: input.goal_id,
        reason: "全部验收证据和 Review 要求已满足",
        payload: {},
        at: now,
      });
      const outcome = { satisfied: true, reasons: [], observed_event_cursor: cursor };
      this.remember(
        input.board_id,
        input.actor_id,
        "evaluate_leaf_completion",
        input.idempotency_key,
        hash,
        outcome,
        now,
      );
      return { ...outcome, replayed: false };
    });
  }

  submitContractProposal(input: SubmitContractProposalInput): {
    proposal: ContractProposalRecord;
    replayed: boolean;
    observed_event_cursor: number;
  } {
    const normalizedDependencyIds = unique(input.dependency_rewire_ids ?? []).sort();
    const normalizedInput = {
      ...input,
      proposed_impacts: input.proposed_impacts ?? [],
      proposed_risks: input.proposed_risks ?? [],
      dependency_rewire_ids: normalizedDependencyIds,
    };
    const hash = requestHash(normalizedInput);
    return this.store.immediate(() => {
      const replay = this.replay<{
        proposal: ContractProposalRecord;
        observed_event_cursor: number;
      }>(
        input.board_id,
        input.actor_id,
        "submit_contract_proposal",
        input.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };

      const goal = this.requireGoalOnBoard(input.board_id, input.goal_id);
      if (goal.definition_state !== "draft") {
        throw new GoalBoardV1Error(
          "contract_proposal.goal_not_draft",
          "Contract Proposal 只能补全尚未接受的 Draft Goal",
        );
      }
      const run = this.store.db
        .prepare("SELECT actor_id, goal_id, role, state FROM runs WHERE run_id = ? AND board_id = ?")
        .get(input.discovered_in_run_id, input.board_id) as Row | undefined;
      if (!run) {
        throw new GoalBoardV1Error(
          "contract_proposal.run_not_found",
          "Contract Proposal 引用的 clarifier Run 不存在",
        );
      }
      if (
        asText(run.actor_id) !== input.actor_id ||
        asText(run.goal_id) !== input.goal_id ||
        asText(run.role) !== "clarifier"
      ) {
        throw new GoalBoardV1Error(
          "contract_proposal.run_invalid",
          "只有认领这个 Draft 的 clarifier 可以提交它的 Contract Proposal",
        );
      }
      if (["failed", "abandoned"].includes(asText(run.state))) {
        throw new GoalBoardV1Error(
          "contract_proposal.run_closed",
          "失败或放弃的 clarifier Run 不能提交 Contract Proposal",
        );
      }
      this.validateContractProposal(
        input.board_id,
        input.goal_id,
        input.proposed_goal,
        input.field_sources,
        input.review_policy,
        input.proposed_impacts ?? [],
        input.proposed_risks ?? [],
        normalizedDependencyIds,
        false,
      );

      const now = this.clock().toISOString();
      this.store.db
        .prepare(`
          UPDATE contract_proposals
          SET state = 'superseded', decided_at = ?, decision_json = ?
          WHERE board_id = ? AND goal_id = ? AND state = 'pending'
        `)
        .run(
          now,
          sqliteJson({ reason: "clarifier 提交了新的完整 Proposal", superseded_by: input.actor_id }),
          input.board_id,
          input.goal_id,
        );
      const proposalId = `contract-proposal-${randomUUID()}`;
      this.store.db
        .prepare(`
          INSERT INTO contract_proposals (
            proposal_id, board_id, goal_id, submitted_by, discovered_in_run_id,
            proposed_goal_json, field_sources_json, review_policy_json,
            proposed_impacts_json, proposed_risks_json, dependency_rewire_ids_json,
            state, decision_json, created_at, decided_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, NULL)
        `)
        .run(
          proposalId,
          input.board_id,
          input.goal_id,
          input.actor_id,
          input.discovered_in_run_id,
          sqliteJson(input.proposed_goal),
          sqliteJson(input.field_sources),
          sqliteJson(input.review_policy),
          sqliteJson(input.proposed_impacts ?? []),
          sqliteJson(input.proposed_risks ?? []),
          sqliteJson(normalizedDependencyIds),
          now,
        );
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId: input.actor_id,
        type: "contract_proposal.submitted",
        objectType: "contract_proposal",
        objectId: proposalId,
        reason: "clarifier 提交了同一 Draft 的 Contract 补全提案，等待用户决定",
        payload: {
          goal_id: input.goal_id,
          field_count: input.field_sources.length,
          dependency_rewire_ids: normalizedDependencyIds,
        },
        at: now,
      });
      const proposal = this.readContractProposal(proposalId);
      const outcome = { proposal, observed_event_cursor: cursor };
      this.remember(
        input.board_id,
        input.actor_id,
        "submit_contract_proposal",
        input.idempotency_key,
        hash,
        outcome,
        now,
      );
      return { ...outcome, replayed: false };
    });
  }

  decideContractProposal(input: DecideContractProposalInput): {
    proposal: ContractProposalRecord;
    goal: GoalRecord;
    replayed: boolean;
    observed_event_cursor: number;
  } {
    if (input.actor_kind !== "user") {
      throw new GoalBoardV1Error(
        "contract_proposal.user_decision_required",
        "Runtime 可以补全 Draft，但只有用户可以确认它成为正式 Contract",
      );
    }
    if (input.decision !== "approved" && input.decision !== "rejected") {
      throw new GoalBoardV1Error(
        "contract_proposal.decision_invalid",
        "Contract Proposal 决定必须是 approved 或 rejected",
      );
    }
    if (!input.reason.trim()) {
      throw new GoalBoardV1Error(
        "contract_proposal.reason_required",
        "用户决定需要说明原因",
      );
    }
    const hash = requestHash(input);
    return this.store.immediate(() => {
      const replay = this.replay<{
        proposal: ContractProposalRecord;
        goal: GoalRecord;
        observed_event_cursor: number;
      }>(
        input.board_id,
        input.actor_id,
        "decide_contract_proposal",
        input.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };

      const row = this.store.db
        .prepare("SELECT * FROM contract_proposals WHERE proposal_id = ? AND board_id = ?")
        .get(input.proposal_id, input.board_id) as Row | undefined;
      if (!row) {
        throw new GoalBoardV1Error(
          "contract_proposal.not_found",
          "Contract Proposal 不存在",
        );
      }
      if (asText(row.state) !== "pending") {
        throw new GoalBoardV1Error(
          "contract_proposal.already_decided",
          "Contract Proposal 已经做过决定",
        );
      }
      const goalId = asText(row.goal_id);
      const goal = this.requireGoalOnBoard(input.board_id, goalId);
      if (goal.definition_state !== "draft") {
        throw new GoalBoardV1Error(
          "contract_proposal.goal_not_draft",
          "这个 Goal 已经不是 Draft，不能再用补全提案改写",
        );
      }
      const now = this.clock().toISOString();
      if (input.decision === "rejected") {
        this.store.db
          .prepare(`
            UPDATE contract_proposals
            SET state = 'rejected', decision_json = ?, decided_at = ?
            WHERE proposal_id = ?
          `)
          .run(
            sqliteJson({ reason: input.reason, decided_by: input.actor_id }),
            now,
            input.proposal_id,
          );
        const cursor = this.store.appendEvent({
          eventId: randomUUID(),
          boardId: input.board_id,
          actorId: input.actor_id,
          type: "contract_proposal.rejected",
          objectType: "contract_proposal",
          objectId: input.proposal_id,
          reason: input.reason,
          payload: { goal_id: goalId, canonical_goal_changed: false },
          at: now,
        });
        const proposal = this.readContractProposal(input.proposal_id);
        const unchangedGoal = this.requireGoalOnBoard(input.board_id, goalId);
        const outcome = { proposal, goal: unchangedGoal, observed_event_cursor: cursor };
        this.remember(
          input.board_id,
          input.actor_id,
          "decide_contract_proposal",
          input.idempotency_key,
          hash,
          outcome,
          now,
        );
        return { ...outcome, replayed: false };
      }

      const proposedGoal = parseJson<CreateGoalInput>(
        row.proposed_goal_json,
        {} as CreateGoalInput,
      );
      const fieldSources = parseJson<ContractFieldSource[]>(row.field_sources_json, []);
      const reviewPolicy = parseJson<GoalPolicy>(row.review_policy_json, {} as GoalPolicy);
      const proposedImpacts = parseJson<ContractProposalImpact[]>(row.proposed_impacts_json, []);
      const proposedRisks = parseJson<ContractProposalRisk[]>(row.proposed_risks_json, []);
      const dependencyRewireIds = parseJson<string[]>(row.dependency_rewire_ids_json, []);
      this.validateContractProposal(
        input.board_id,
        goalId,
        proposedGoal,
        fieldSources,
        reviewPolicy,
        proposedImpacts,
        proposedRisks,
        dependencyRewireIds,
        true,
      );

      this.store.db
        .prepare(`
          UPDATE goals SET
            title = ?, outcome = ?, why = ?, business_logic = ?,
            in_scope_json = ?, out_of_scope_json = ?, constraints_json = ?,
            required_inputs_json = ?, promised_outputs_json = ?,
            definition_state = 'accepted', decomposition_state = 'closed_leaf',
            validity_state = 'valid', fulfillment_state = 'unmet', priority = ?,
            accepted_by = ?, accepted_at = ?, updated_at = ?
          WHERE goal_id = ? AND board_id = ?
        `)
        .run(
          proposedGoal.title.trim(),
          proposedGoal.outcome.trim(),
          proposedGoal.why.trim(),
          proposedGoal.business_logic.trim(),
          sqliteJson(proposedGoal.in_scope ?? []),
          sqliteJson(proposedGoal.out_of_scope ?? []),
          sqliteJson(proposedGoal.constraints ?? []),
          sqliteJson(proposedGoal.required_inputs ?? []),
          sqliteJson(proposedGoal.promised_outputs ?? []),
          proposedGoal.priority ?? goal.priority,
          input.actor_id,
          now,
          now,
          goalId,
          input.board_id,
        );
      this.store.db.prepare("DELETE FROM acceptance_criteria WHERE goal_id = ?").run(goalId);
      const insertCriterion = this.store.db.prepare(`
        INSERT INTO acceptance_criteria (
          criterion_id, goal_id, statement, decision_method,
          pass_condition, target_json, required_evidence_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const criterion of proposedGoal.acceptance_criteria) {
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

      this.store.db
        .prepare(`
          UPDATE policy_bindings SET state = 'replaced'
          WHERE board_id = ? AND goal_id = ? AND scope = 'goal' AND state = 'active'
        `)
        .run(input.board_id, goalId);
      const policyBindingId = `policy-${randomUUID()}`;
      this.store.db
        .prepare(`
          INSERT INTO policy_bindings (
            policy_binding_id, board_id, goal_id, scope, policy_json,
            state, created_by, reason, created_at
          ) VALUES (?, ?, ?, 'goal', ?, 'active', ?, ?, ?)
        `)
        .run(
          policyBindingId,
          input.board_id,
          goalId,
          sqliteJson(reviewPolicy),
          input.actor_id,
          `用户批准 Contract Proposal ${input.proposal_id}`,
          now,
        );

      const impactBindingIds: string[] = [];
      for (const impact of proposedImpacts) {
        const bindingId = `impact-${randomUUID()}`;
        this.store.db
          .prepare(`
            INSERT INTO impact_bindings (
              binding_id, board_id, goal_id, surface, access, input_snapshot,
              state, reason, created_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)
          `)
          .run(
            bindingId,
            input.board_id,
            goalId,
            impact.surface.trim(),
            impact.access,
            impact.input_snapshot ?? null,
            impact.reason.trim(),
            input.actor_id,
            now,
          );
        impactBindingIds.push(bindingId);
      }

      const riskIds: string[] = [];
      for (const risk of proposedRisks) {
        this.store.db
          .prepare(`
            INSERT INTO risks (
              risk_id, board_id, description, probability, impact,
              affected_surfaces_json, trigger, treatment, blocking_mode,
              revisit_condition, owner, state, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
          `)
          .run(
            risk.risk_id.trim(),
            input.board_id,
            risk.description.trim(),
            risk.probability.trim(),
            risk.impact.trim(),
            sqliteJson(risk.affected_surfaces),
            risk.trigger.trim(),
            risk.treatment,
            risk.blocking_mode,
            risk.revisit_condition.trim(),
            risk.owner.trim(),
            now,
            now,
          );
        this.store.db
          .prepare("INSERT INTO goal_risks (goal_id, risk_id) VALUES (?, ?)")
          .run(goalId, risk.risk_id.trim());
        riskIds.push(risk.risk_id.trim());
      }

      const confirmedFields = unique(fieldSources.map((source) => source.field)).sort();
      this.store.db
        .prepare(`
          UPDATE contract_proposals
          SET state = 'approved', decision_json = ?, decided_at = ?
          WHERE proposal_id = ?
        `)
        .run(
          sqliteJson({
            reason: input.reason,
            decided_by: input.actor_id,
            confirmed_fields: confirmedFields,
            policy_binding_id: policyBindingId,
            impact_binding_ids: impactBindingIds,
            risk_ids: riskIds,
            dependency_rewire_ids: dependencyRewireIds,
          }),
          now,
          input.proposal_id,
        );
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId: input.actor_id,
        type: "contract_proposal.approved",
        objectType: "contract_proposal",
        objectId: input.proposal_id,
        reason: input.reason,
        payload: {
          goal_id: goalId,
          canonical_goal_changed: true,
          confirmed_fields: confirmedFields,
        },
        at: now,
      });
      const proposal = this.readContractProposal(input.proposal_id);
      const acceptedGoal = this.requireGoalOnBoard(input.board_id, goalId);
      const outcome = { proposal, goal: acceptedGoal, observed_event_cursor: cursor };
      this.remember(
        input.board_id,
        input.actor_id,
        "decide_contract_proposal",
        input.idempotency_key,
        hash,
        outcome,
        now,
      );
      return { ...outcome, replayed: false };
    });
  }

  submitCandidate(input: {
    board_id: string;
    actor_id: string;
    discovered_in_run_id?: string | null;
    proposed_goal: CreateGoalInput;
    proposed_relations?: Array<Record<string, unknown>>;
    proposed_impacts?: Array<Record<string, unknown>>;
    proposed_risks?: Array<Record<string, unknown>>;
    blocking_mode?: CandidateGoalRecord["blocking_mode"];
    idempotency_key: string;
  }): { candidate: CandidateGoalRecord; replayed: boolean; observed_event_cursor: number } {
    this.validateGoalInput(input.proposed_goal);
    const proposedRelations = this.normalizeProposedRelations(input.proposed_relations ?? [], true);
    if (input.blocking_mode === "current_run" && !input.discovered_in_run_id) {
      throw new GoalBoardV1Error(
        "candidate.run_required",
        "blocking_mode=current_run 的 Candidate 必须引用发现它的 Run",
      );
    }
    const hash = requestHash({ ...input, proposed_relations: proposedRelations });
    return this.store.immediate(() => {
      const replay = this.replay<{ candidate: CandidateGoalRecord; observed_event_cursor: number }>(
        input.board_id,
        input.actor_id,
        "submit_candidate",
        input.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      this.validateCandidateCoordination(
        input.board_id,
        input.proposed_goal,
        proposedRelations,
        input.proposed_impacts ?? [],
        input.proposed_risks ?? [],
      );
      this.requireBoard(input.board_id);
      if (input.discovered_in_run_id) {
        const run = this.store.db
          .prepare("SELECT run_id, actor_id FROM runs WHERE run_id = ? AND board_id = ?")
          .get(input.discovered_in_run_id, input.board_id) as Row | undefined;
        if (!run) throw new GoalBoardV1Error("candidate.run_not_found", "Candidate 引用的 Run 不存在");
        if (asText(run.actor_id) !== input.actor_id) {
          throw new GoalBoardV1Error("candidate.run_not_owner", "只有 Run 执行者可以报告它发现的新工作");
        }
      }
      const candidateId = `candidate-${randomUUID()}`;
      const now = this.clock().toISOString();
      this.store.db
        .prepare(`
          INSERT INTO candidates (
            candidate_id, board_id, submitted_by, discovered_in_run_id,
            proposed_goal_json, proposed_relations_json, proposed_impacts_json,
            proposed_risks_json, blocking_mode, state, decision_json, created_at, decided_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, NULL)
        `)
        .run(
          candidateId,
          input.board_id,
          input.actor_id,
          input.discovered_in_run_id ?? null,
          sqliteJson(input.proposed_goal),
          sqliteJson(proposedRelations),
          sqliteJson(input.proposed_impacts ?? []),
          sqliteJson(input.proposed_risks ?? []),
          input.blocking_mode ?? "none",
          now,
        );
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId: input.actor_id,
        type: "candidate.submitted",
        objectType: "candidate",
        objectId: candidateId,
        reason: "澄清或执行中发现了 Goal 之外的新工作，等待用户决定",
        payload: { blocking_mode: input.blocking_mode ?? "none" },
        at: now,
      });
      const candidate = this.readCandidate(candidateId);
      const outcome = { candidate, observed_event_cursor: cursor };
      this.remember(
        input.board_id,
        input.actor_id,
        "submit_candidate",
        input.idempotency_key,
        hash,
        outcome,
        now,
      );
      return { ...outcome, replayed: false };
    });
  }

  submitDependencyProposal(input: {
    board_id: string;
    actor_id: string;
    discovered_in_run_id: string;
    dependencies: Array<Record<string, unknown>>;
    blocking_mode?: "none" | "current_run";
    idempotency_key: string;
  }): { rewire: RewireRecord; replayed: boolean; observed_event_cursor: number } {
    if (input.dependencies.length === 0) {
      throw new GoalBoardV1Error(
        "dependency_proposal.empty",
        "Dependency Proposal 至少要包含一条依赖调整",
      );
    }
    const dependencies = this.normalizeProposedRelations(input.dependencies).map((relation) => {
      if (relation.type !== "depends_on") {
        throw new GoalBoardV1Error(
          "dependency_proposal.type_invalid",
          "Dependency Proposal 只接受 depends_on 关系",
        );
      }
      return relation;
    });
    const blockingMode = input.blocking_mode ?? "none";
    const hash = requestHash({ ...input, dependencies, blocking_mode: blockingMode });
    return this.store.immediate(() => {
      const replay = this.replay<{ rewire: RewireRecord; observed_event_cursor: number }>(
        input.board_id,
        input.actor_id,
        "submit_dependency_proposal",
        input.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      this.requireBoard(input.board_id);
      const run = this.store.db
        .prepare("SELECT run_id, actor_id, goal_id FROM runs WHERE run_id = ? AND board_id = ?")
        .get(input.discovered_in_run_id, input.board_id) as Row | undefined;
      if (!run) {
        throw new GoalBoardV1Error(
          "dependency_proposal.run_not_found",
          "Dependency Proposal 引用的 Run 不存在",
        );
      }
      if (asText(run.actor_id) !== input.actor_id) {
        throw new GoalBoardV1Error(
          "dependency_proposal.run_not_owner",
          "只有 Run 执行者可以提交它发现的依赖",
        );
      }
      this.validateStandaloneDependencies(input.board_id, dependencies);
      if (
        blockingMode === "current_run" &&
        !dependencies.some((dependency) => dependency.from_goal_id === asText(run.goal_id))
      ) {
        throw new GoalBoardV1Error(
          "dependency_proposal.current_run_unrelated",
          "阻塞当前 Run 的依赖提案必须从这个 Run 的 Goal 出发",
        );
      }
      const rewireId = `rewire-${randomUUID()}`;
      const now = this.clock().toISOString();
      const affectedGoalIds = unique(
        dependencies.flatMap((dependency) => [dependency.from_goal_id, dependency.to_goal_id]),
      ).sort();
      const activeRuns = this.store.db
        .prepare(`
          SELECT run_id, goal_id FROM runs
          WHERE board_id = ? AND state IN ('started', 'blocked')
          ORDER BY run_id
        `)
        .all(input.board_id) as Row[];
      const proposal: RewireRecord["proposal"] = {
        proposal_kind: "dependency",
        submitted_by: input.actor_id,
        discovered_in_run_id: input.discovered_in_run_id,
        blocking_mode: blockingMode,
        relations: dependencies,
      };
      const impact = {
        affected_goal_ids: affectedGoalIds,
        active_runs_protected: activeRuns
          .filter((activeRun) => affectedGoalIds.includes(asText(activeRun.goal_id)))
          .map((activeRun) => ({
            run_id: asText(activeRun.run_id),
            goal_id: asText(activeRun.goal_id),
          })),
        proposed_changes_applied: false,
      };
      this.store.db
        .prepare(`
          INSERT INTO rewires (
            rewire_id, board_id, candidate_id, proposal_json, impact_json,
            state, created_at, decided_at
          ) VALUES (?, ?, NULL, ?, ?, 'pending', ?, NULL)
        `)
        .run(rewireId, input.board_id, sqliteJson(proposal), sqliteJson(impact), now);
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId: input.actor_id,
        type: "rewire.proposed",
        objectType: "rewire",
        objectId: rewireId,
        reason: "Runtime 提交了 Dependency Proposal，等待用户决定",
        payload: {
          proposal_kind: "dependency",
          dependency_count: dependencies.length,
          blocking_mode: blockingMode,
        },
        at: now,
      });
      const rewire = this.readRewire(rewireId);
      const outcome = { rewire, observed_event_cursor: cursor };
      this.remember(
        input.board_id,
        input.actor_id,
        "submit_dependency_proposal",
        input.idempotency_key,
        hash,
        outcome,
        now,
      );
      return { ...outcome, replayed: false };
    });
  }

  decideCandidate(input: {
    board_id: string;
    candidate_id: string;
    actor_id: string;
    actor_kind: "user" | "runtime";
    decision: "approved" | "rejected" | "dismissed";
    reason: string;
    idempotency_key: string;
  }): { candidate: CandidateGoalRecord; replayed: boolean; observed_event_cursor: number } {
    if (input.actor_kind !== "user") {
      throw new GoalBoardV1Error(
        "candidate.user_decision_required",
        "Runtime 可以提出 Candidate Goal，但只有用户可以决定是否纳入 Goal Spine",
      );
    }
    const hash = requestHash(input);
    return this.store.immediate(() => {
      const replay = this.replay<{ candidate: CandidateGoalRecord; observed_event_cursor: number }>(
        input.board_id,
        input.actor_id,
        "decide_candidate",
        input.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      const row = this.store.db
        .prepare("SELECT * FROM candidates WHERE candidate_id = ? AND board_id = ?")
        .get(input.candidate_id, input.board_id) as Row | undefined;
      if (!row) throw new GoalBoardV1Error("candidate.not_found", "Candidate Goal 不存在");
      if (asText(row.state) !== "pending") {
        throw new GoalBoardV1Error("candidate.already_decided", "Candidate Goal 已经做过决定");
      }
      const now = this.clock().toISOString();
      let decision: Record<string, unknown> = { reason: input.reason, decided_by: input.actor_id };
      if (input.decision === "approved") {
        const proposed = parseJson<CreateGoalInput>(row.proposed_goal_json, {} as CreateGoalInput);
        const proposedRelations = this.normalizeProposedRelations(
          parseJson<Array<Record<string, unknown>>>(row.proposed_relations_json, []),
          true,
        );
        this.validateCandidateCoordination(
          input.board_id,
          proposed,
          proposedRelations,
          parseJson<Array<Record<string, unknown>>>(row.proposed_impacts_json, []),
          parseJson<Array<Record<string, unknown>>>(row.proposed_risks_json, []),
        );
        const created = this.createGoal(
          input.board_id,
          { ...proposed, definition_state: "accepted" },
          {
            actor_id: input.actor_id,
            idempotency_key: `candidate-goal:${input.candidate_id}`,
            reason: `批准 Candidate Goal ${input.candidate_id}`,
          },
        );
        this.store.db
          .prepare("UPDATE goals SET validity_state = 'needs_revalidation', updated_at = ? WHERE goal_id = ?")
          .run(now, created.goal.goal_id);
        const rewireId = `rewire-${randomUUID()}`;
        const proposal = {
          formal_goal_id: created.goal.goal_id,
          proposal_kind: "candidate" as const,
          relations: proposedRelations,
          impacts: parseJson<Array<Record<string, unknown>>>(row.proposed_impacts_json, []),
          risks: parseJson<Array<Record<string, unknown>>>(row.proposed_risks_json, []),
        };
        const activeRuns = this.store.db
          .prepare("SELECT run_id, goal_id FROM runs WHERE board_id = ? AND state IN ('started', 'blocked') ORDER BY run_id")
          .all(input.board_id) as Row[];
        const impact = {
          active_runs_protected: activeRuns.map((run) => ({
            run_id: asText(run.run_id),
            goal_id: asText(run.goal_id),
          })),
          new_goal_requires_rewire_confirmation: true,
        };
        this.store.db
          .prepare(`
            INSERT INTO rewires (
              rewire_id, board_id, candidate_id, proposal_json, impact_json,
              state, created_at, decided_at
            ) VALUES (?, ?, ?, ?, ?, 'pending', ?, NULL)
          `)
          .run(
            rewireId,
            input.board_id,
            input.candidate_id,
            sqliteJson(proposal),
            sqliteJson(impact),
            now,
          );
        decision = {
          ...decision,
          formal_goal_id: created.goal.goal_id,
          rewire_id: rewireId,
          next_action: "confirm_rewire",
        };
      }
      this.store.db
        .prepare("UPDATE candidates SET state = ?, decision_json = ?, decided_at = ? WHERE candidate_id = ?")
        .run(input.decision, sqliteJson(decision), now, input.candidate_id);
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId: input.actor_id,
        type: `candidate.${input.decision}`,
        objectType: "candidate",
        objectId: input.candidate_id,
        reason: input.reason,
        payload: {},
        at: now,
      });
      const candidate = this.readCandidate(input.candidate_id);
      const outcome = { candidate, observed_event_cursor: cursor };
      this.remember(
        input.board_id,
        input.actor_id,
        "decide_candidate",
        input.idempotency_key,
        hash,
        outcome,
        now,
      );
      return { ...outcome, replayed: false };
    });
  }

  confirmRewire(input: {
    board_id: string;
    rewire_id: string;
    actor_id: string;
    actor_kind: "user" | "runtime";
    decision?: "confirmed" | "rejected";
    reason: string;
    idempotency_key: string;
  }): { rewire: RewireRecord; replayed: boolean; observed_event_cursor: number } {
    if (input.actor_kind !== "user") {
      throw new GoalBoardV1Error("rewire.user_confirmation_required", "只有用户可以决定 Goal Spine 线路变更");
    }
    const decision = input.decision ?? "confirmed";
    if (decision !== "confirmed" && decision !== "rejected") {
      throw new GoalBoardV1Error("rewire.decision_invalid", "Rewire 决定必须是 confirmed 或 rejected");
    }
    const hash = requestHash(input);
    return this.store.immediate(() => {
      const replay = this.replay<{ rewire: RewireRecord; observed_event_cursor: number }>(
        input.board_id,
        input.actor_id,
        "confirm_rewire",
        input.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      const row = this.store.db
        .prepare("SELECT * FROM rewires WHERE rewire_id = ? AND board_id = ?")
        .get(input.rewire_id, input.board_id) as Row | undefined;
      if (!row) throw new GoalBoardV1Error("rewire.not_found", "Rewire 不存在");
      if (asText(row.state) !== "pending") {
        throw new GoalBoardV1Error("rewire.not_pending", "Rewire 已经做过决定");
      }
      const proposal = parseJson<RewireRecord["proposal"]>(row.proposal_json, {});
      const formalGoalId = String(proposal.formal_goal_id ?? "");
      if (formalGoalId) this.requireGoalOnBoard(input.board_id, formalGoalId);
      const now = this.clock().toISOString();
      if (decision === "rejected") {
        if (formalGoalId) {
          this.store.db
            .prepare("UPDATE goals SET validity_state = 'valid', updated_at = ? WHERE goal_id = ?")
            .run(now, formalGoalId);
        }
        const previousImpact = parseJson<Record<string, unknown>>(row.impact_json, {});
        const rejectedImpact = {
          ...previousImpact,
          proposed_changes_applied: false,
          rejection_reason: input.reason,
        };
        this.store.db
          .prepare("UPDATE rewires SET state = 'rejected', impact_json = ?, decided_at = ? WHERE rewire_id = ?")
          .run(sqliteJson(rejectedImpact), now, input.rewire_id);
        const cursor = this.store.appendEvent({
          eventId: randomUUID(),
          boardId: input.board_id,
          actorId: input.actor_id,
          type: "rewire.rejected",
          objectType: "rewire",
          objectId: input.rewire_id,
          reason: input.reason,
          payload: { formal_goal_id: formalGoalId, proposed_changes_applied: false },
          at: now,
        });
        const rewire = this.readRewire(input.rewire_id);
        const outcome = { rewire, observed_event_cursor: cursor };
        this.remember(
          input.board_id,
          input.actor_id,
          "confirm_rewire",
          input.idempotency_key,
          hash,
          outcome,
          now,
        );
        return { ...outcome, replayed: false };
      }
      const relations = proposal.relations ?? [];
      const addedRelations: string[] = [];
      const deactivatedRelations: string[] = [];
      const revalidatedGoals = new Set<string>();
      const validTypes = new Set([
        "part_of",
        "depends_on",
        "conflicts_with",
        "mitigates",
        "extends",
        "replaces",
        "corrects",
        "invalidates",
        "migrates_from",
      ]);
      for (const relation of relations) {
        const fromGoalId = String(relation.from_goal_id ?? formalGoalId).replace("$new_goal", formalGoalId);
        const toGoalId = String(relation.to_goal_id ?? "").replace("$new_goal", formalGoalId);
        const type = String(relation.type ?? "part_of");
        const action = String(relation.action ?? "add");
        if (!toGoalId || !validTypes.has(type)) {
          throw new GoalBoardV1Error("rewire.relation_invalid", "Rewire 中的 Goal 关系不完整");
        }
        this.requireGoalOnBoard(input.board_id, fromGoalId);
        this.requireGoalOnBoard(input.board_id, toGoalId);
        if (fromGoalId === toGoalId) {
          throw new GoalBoardV1Error("rewire.relation_invalid", "Rewire 不能让 Goal 依赖或归属于自身");
        }
        if (action === "deactivate") {
          if (type !== "depends_on") {
            throw new GoalBoardV1Error(
              "rewire.action_invalid",
              "当前只支持通过 Rewire 停用 depends_on 关系",
            );
          }
          const activeRows = this.store.db
            .prepare(`
              SELECT relation_id FROM goal_relations
              WHERE board_id = ? AND from_goal_id = ? AND to_goal_id = ?
                AND type = 'depends_on' AND state = 'active'
              ORDER BY relation_id
            `)
            .all(input.board_id, fromGoalId, toGoalId) as Row[];
          if (activeRows.length === 0) {
            throw new GoalBoardV1Error(
              "rewire.dependency_not_active",
              "要停用的依赖已经不再生效，请重新检查后提交 Proposal",
            );
          }
          for (const activeRow of activeRows) {
            const relationId = asText(activeRow.relation_id);
            this.store.db
              .prepare(`
                UPDATE goal_relations
                SET state = 'inactive', deactivated_at = ?
                WHERE relation_id = ?
              `)
              .run(now, relationId);
            deactivatedRelations.push(relationId);
          }
        } else if (action === "add") {
          const alreadyActive = this.store.db
            .prepare(`
              SELECT relation_id FROM goal_relations
              WHERE board_id = ? AND from_goal_id = ? AND to_goal_id = ?
                AND type = ? AND state = 'active'
              LIMIT 1
            `)
            .get(input.board_id, fromGoalId, toGoalId, type) as Row | undefined;
          if (alreadyActive) {
            throw new GoalBoardV1Error(
              "rewire.relation_already_active",
              "这条关系已经生效，请重新检查后提交 Proposal",
            );
          }
          const relationId = `relation-${randomUUID()}`;
          this.store.db
            .prepare(`
              INSERT INTO goal_relations (
                relation_id, board_id, from_goal_id, to_goal_id, type, state,
                reason, created_by, created_at, deactivated_at
              ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, NULL)
            `)
            .run(
              relationId,
              input.board_id,
              fromGoalId,
              toGoalId,
              type,
              String(relation.reason ?? input.reason),
              input.actor_id,
              now,
            );
          addedRelations.push(relationId);
        } else {
          throw new GoalBoardV1Error(
            "rewire.action_invalid",
            "Rewire action 必须是 add 或 deactivate",
          );
        }
        if (fromGoalId !== formalGoalId) revalidatedGoals.add(fromGoalId);
      }
      for (const impact of proposal.impacts ?? []) {
        const surface = String(impact.surface ?? "").trim();
        const access = String(impact.access ?? "read");
        if (!surface || !["read", "write", "decide", "exclusive"].includes(access)) continue;
        this.store.db
          .prepare(`
            INSERT INTO impact_bindings (
              binding_id, board_id, goal_id, surface, access, input_snapshot,
              state, reason, created_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)
          `)
          .run(
            `impact-${randomUUID()}`,
            input.board_id,
            String(impact.goal_id ?? formalGoalId).replace("$new_goal", formalGoalId),
            surface,
            access,
            impact.input_snapshot ?? null,
            String(impact.reason ?? input.reason),
            input.actor_id,
            now,
          );
      }
      const addedRiskIds: string[] = [];
      const validTreatments = new Set(["accept", "mitigate", "avoid", "defer"]);
      const validBlockingModes = new Set(["none", "claim", "completion", "invalidate_on_trigger"]);
      for (const risk of proposal.risks ?? []) {
        const description = String(risk.description ?? "").trim();
        const probability = String(risk.probability ?? "").trim();
        const impact = String(risk.impact ?? "").trim();
        const trigger = String(risk.trigger ?? "").trim();
        const treatment = String(risk.treatment ?? "");
        const blockingMode = String(risk.blocking_mode ?? "none");
        const revisitCondition = String(risk.revisit_condition ?? "").trim();
        const owner = String(risk.owner ?? input.actor_id).trim();
        if (
          !description ||
          !probability ||
          !impact ||
          !trigger ||
          !revisitCondition ||
          !owner ||
          !validTreatments.has(treatment) ||
          !validBlockingModes.has(blockingMode)
        ) {
          throw new GoalBoardV1Error("rewire.risk_invalid", "Rewire 中的 Risk 字段不完整或取值无效");
        }
        const riskId = String(risk.risk_id ?? `risk-${randomUUID()}`);
        const goalIds = ((risk.goal_ids as unknown[]) ?? [formalGoalId]).map((goalId) =>
          String(goalId).replace("$new_goal", formalGoalId),
        );
        if (goalIds.length === 0) {
          throw new GoalBoardV1Error("rewire.risk_invalid", "Rewire 中的 Risk 必须关联至少一个 Goal");
        }
        for (const goalId of goalIds) this.requireGoalOnBoard(input.board_id, goalId);
        this.store.db
          .prepare(`
            INSERT INTO risks (
              risk_id, board_id, description, probability, impact,
              affected_surfaces_json, trigger, treatment, blocking_mode,
              revisit_condition, owner, state, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
          `)
          .run(
            riskId,
            input.board_id,
            description,
            probability,
            impact,
            sqliteJson((risk.affected_surfaces as string[]) ?? []),
            trigger,
            treatment,
            blockingMode,
            revisitCondition,
            owner,
            now,
            now,
          );
        const link = this.store.db.prepare("INSERT INTO goal_risks (goal_id, risk_id) VALUES (?, ?)");
        for (const goalId of unique(goalIds)) link.run(goalId, riskId);
        addedRiskIds.push(riskId);
        this.store.appendEvent({
          eventId: randomUUID(),
          boardId: input.board_id,
          actorId: input.actor_id,
          type: "risk.added",
          objectType: "risk",
          objectId: riskId,
          reason: `用户确认 Rewire 时纳入 Risk：${description}`,
          payload: { goal_ids: unique(goalIds), blocking_mode: blockingMode },
          at: now,
        });
      }
      for (const goalId of revalidatedGoals) {
        this.store.db
          .prepare("UPDATE goals SET validity_state = 'needs_revalidation', updated_at = ? WHERE goal_id = ?")
          .run(now, goalId);
      }
      if (formalGoalId) {
        this.store.db
          .prepare("UPDATE goals SET validity_state = 'valid', updated_at = ? WHERE goal_id = ?")
          .run(now, formalGoalId);
      }
      const previousImpact = parseJson<Record<string, unknown>>(row.impact_json, {});
      const appliedImpact = {
        ...previousImpact,
        added_relation_ids: addedRelations,
        deactivated_relation_ids: deactivatedRelations,
        added_risk_ids: addedRiskIds,
        goals_needing_revalidation: [...revalidatedGoals].sort(),
      };
      this.store.db
        .prepare("UPDATE rewires SET state = 'applied', impact_json = ?, decided_at = ? WHERE rewire_id = ?")
        .run(sqliteJson(appliedImpact), now, input.rewire_id);
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId: input.actor_id,
        type: "rewire.applied",
        objectType: "rewire",
        objectId: input.rewire_id,
        reason: input.reason,
        payload: {
          formal_goal_id: formalGoalId,
          added_relation_ids: addedRelations,
          deactivated_relation_ids: deactivatedRelations,
          added_risk_ids: addedRiskIds,
          goals_needing_revalidation: [...revalidatedGoals].sort(),
        },
        at: now,
      });
      const rewire = this.readRewire(input.rewire_id);
      const outcome = { rewire, observed_event_cursor: cursor };
      this.remember(
        input.board_id,
        input.actor_id,
        "confirm_rewire",
        input.idempotency_key,
        hash,
        outcome,
        now,
      );
      return { ...outcome, replayed: false };
    });
  }

  private ensureReviewObligations(
    boardId: string,
    goalId: string,
    policy: GoalPolicy,
    at: string,
  ): void {
    const obligations: Array<{
      role: "self_verifier" | "cross_reviewer" | "adversarial_reviewer" | "human_approver";
      count: number;
      independence: string;
    }> = [];
    if (policy.self_verification) {
      obligations.push({ role: "self_verifier", count: 1, independence: "executor_allowed" });
    }
    if (policy.cross_reviewers > 0) {
      obligations.push({
        role: "cross_reviewer",
        count: policy.cross_reviewers,
        independence: "actor_must_differ_from_executor",
      });
    }
    if (policy.adversarial_reviewers > 0) {
      obligations.push({
        role: "adversarial_reviewer",
        count: policy.adversarial_reviewers,
        independence: "actor_must_differ_from_executor",
      });
    }
    if (policy.human_approval) {
      obligations.push({ role: "human_approver", count: 1, independence: "user_authority" });
    }
    const criterionIds = this.store
      .getGoal(goalId)
      ?.acceptance_criteria.map((criterion) => criterion.criterion_id) ?? [];
    for (const obligation of obligations) {
      const existing = this.store.db
        .prepare("SELECT obligation_id FROM review_obligations WHERE goal_id = ? AND role = ?")
        .get(goalId, obligation.role);
      if (existing) continue;
      this.store.db
        .prepare(`
          INSERT INTO review_obligations (
            obligation_id, board_id, goal_id, role, required_count,
            independence_rule, criterion_scope_json, state, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        `)
        .run(
          `obligation-${randomUUID()}`,
          boardId,
          goalId,
          obligation.role,
          obligation.count,
          obligation.independence,
          sqliteJson(criterionIds),
          at,
        );
    }
  }

  private readRun(runId: string): RunRecord {
    const row = this.store.db.prepare("SELECT board_id FROM runs WHERE run_id = ?").get(runId) as
      | Row
      | undefined;
    if (!row) throw new Error(`Run 写入后无法读取: ${runId}`);
    const run = this.store.snapshot(asText(row.board_id)).runs.find((item) => item.run_id === runId);
    if (!run) throw new Error(`Run 写入后无法读取: ${runId}`);
    return run;
  }

  private readEvidence(evidenceId: string): EvidenceRecord {
    const row = this.store.db
      .prepare("SELECT board_id FROM evidence WHERE evidence_id = ?")
      .get(evidenceId) as Row | undefined;
    if (!row) throw new Error(`Evidence 写入后无法读取: ${evidenceId}`);
    const evidence = this.store
      .snapshot(asText(row.board_id))
      .evidence.find((item) => item.evidence_id === evidenceId);
    if (!evidence) throw new Error(`Evidence 写入后无法读取: ${evidenceId}`);
    return evidence;
  }

  private readReview(reviewId: string): ReviewRecord {
    const row = this.store.db
      .prepare("SELECT board_id FROM reviews WHERE review_id = ?")
      .get(reviewId) as Row | undefined;
    if (!row) throw new Error(`Review 写入后无法读取: ${reviewId}`);
    const review = this.store
      .snapshot(asText(row.board_id))
      .reviews.find((item) => item.review_id === reviewId);
    if (!review) throw new Error(`Review 写入后无法读取: ${reviewId}`);
    return review;
  }

  private readCandidate(candidateId: string): CandidateGoalRecord {
    const row = this.store.db
      .prepare("SELECT board_id FROM candidates WHERE candidate_id = ?")
      .get(candidateId) as Row | undefined;
    if (!row) throw new Error(`Candidate 写入后无法读取: ${candidateId}`);
    const candidate = this.store
      .snapshot(asText(row.board_id))
      .candidates.find((item) => item.candidate_id === candidateId);
    if (!candidate) throw new Error(`Candidate 写入后无法读取: ${candidateId}`);
    return candidate;
  }

  private readContractProposal(proposalId: string): ContractProposalRecord {
    const row = this.store.db
      .prepare("SELECT board_id FROM contract_proposals WHERE proposal_id = ?")
      .get(proposalId) as Row | undefined;
    if (!row) throw new Error(`Contract Proposal 写入后无法读取: ${proposalId}`);
    const proposal = this.store
      .snapshot(asText(row.board_id))
      .contract_proposals.find((item) => item.proposal_id === proposalId);
    if (!proposal) throw new Error(`Contract Proposal 写入后无法读取: ${proposalId}`);
    return proposal;
  }

  private readRewire(rewireId: string): RewireRecord {
    const row = this.store.db
      .prepare("SELECT board_id FROM rewires WHERE rewire_id = ?")
      .get(rewireId) as Row | undefined;
    if (!row) throw new Error(`Rewire 写入后无法读取: ${rewireId}`);
    const rewire = this.store
      .snapshot(asText(row.board_id))
      .rewires.find((item) => item.rewire_id === rewireId);
    if (!rewire) throw new Error(`Rewire 写入后无法读取: ${rewireId}`);
    return rewire;
  }

  private readRisk(boardId: string, riskId: string): RiskRecord {
    const risk = this.store.snapshot(boardId).risks.find((item) => item.risk_id === riskId);
    if (!risk) throw new Error(`Risk 写入后无法读取: ${riskId}`);
    return risk;
  }

  private evaluate(input: EvaluationInput): Evaluation {
    const goal = this.store.getGoal(input.goalId);
    const policy = this.resolvePolicy(input.boardId, input.goalId, input.strengthenPolicy);
    const surfaces = this.goalImpacts(input.boardId, input.goalId);
    const reasons: DecisionReason[] = [];
    if (!goal || goal.board_id !== input.boardId) {
      reasons.push(reason("goal.not_found", "goal", input.goalId, "找不到这个 Goal"));
      return { goal: null, reasons, policy, surfaces };
    }
    if (goal.archived_at) {
      reasons.push(
        reason(
          "goal.archived",
          "goal",
          goal.goal_id,
          "Goal 已归档，当前不接受新的 Runtime 领取",
          { archived_at: goal.archived_at },
          "由用户恢复后再查询 Ready",
        ),
      );
    }
    if (input.role === "clarifier") {
      const needsClarification =
        goal.definition_state !== "accepted" ||
        goal.decomposition_state === "abstract" ||
        goal.decomposition_state === "frontier_open" ||
        goal.acceptance_criteria.length === 0;
      if (!needsClarification) {
        reasons.push(
          reason(
            "goal.clarification_not_needed",
            "goal",
            goal.goal_id,
            "这个 Goal 已经可以进入执行领取，不再需要澄清者",
            undefined,
            "改用 executor 查询和领取",
          ),
        );
      }
      const pendingContractProposal = this.store.db
        .prepare(`
          SELECT proposal_id FROM contract_proposals
          WHERE board_id = ? AND goal_id = ? AND state = 'pending'
          ORDER BY created_at DESC LIMIT 1
        `)
        .get(input.boardId, goal.goal_id) as Row | undefined;
      if (pendingContractProposal) {
        reasons.push(
          reason(
            "contract_proposal.user_decision_required",
            "contract_proposal",
            asText(pendingContractProposal.proposal_id),
            "clarifier 已提交 Contract 补全提案，等待用户确认或拒绝",
          ),
        );
      }
      if (goal.validity_state === "invalidated") {
        reasons.push(reason("goal.invalidated", "goal", goal.goal_id, "Goal 已失效"));
      }
      if (goal.fulfillment_state === "satisfied") {
        reasons.push(reason("goal.already_satisfied", "goal", goal.goal_id, "Goal 已完成"));
      }
    } else {
      if (goal.definition_state !== "accepted") {
        reasons.push(reason("goal.not_accepted", "goal", goal.goal_id, "Goal 还没有被接受"));
      }
      if (goal.decomposition_state !== "closed_leaf") {
        reasons.push(
          reason(
            "goal.not_closed_leaf",
            "goal",
            goal.goal_id,
            "这个 Goal 还不是可以直接执行的最小 Goal",
            { decomposition_state: goal.decomposition_state },
            "继续拆分，直到结果和验收都能在 Goal 内闭环",
          ),
        );
      }
      if (input.role === "revalidator" && goal.validity_state === "valid") {
        reasons.push(
          reason(
            "goal.revalidation_not_needed",
            "goal",
            goal.goal_id,
            "Goal 当前已经是可信状态，不需要重新验证",
            undefined,
            "改用 executor 查询和领取",
          ),
        );
      } else if (input.role === "executor" && goal.validity_state === "needs_revalidation") {
        reasons.push(reason("goal.needs_revalidation", "goal", goal.goal_id, "Goal 需要重新验证后才能执行"));
      }
      if (goal.validity_state === "invalidated") {
        reasons.push(reason("goal.invalidated", "goal", goal.goal_id, "Goal 已失效"));
      }
      if (input.role === "executor" && goal.fulfillment_state === "satisfied") {
        reasons.push(reason("goal.already_satisfied", "goal", goal.goal_id, "Goal 已完成"));
      }
      if (goal.acceptance_criteria.length === 0) {
        reasons.push(reason("goal.acceptance_missing", "criterion", goal.goal_id, "Goal 没有明确验收条件"));
      }

      const dependencies = this.store.db
        .prepare(`
          SELECT g.goal_id, g.title, g.fulfillment_state, g.validity_state
          FROM goal_relations r
          JOIN goals g ON g.goal_id = r.to_goal_id
          WHERE r.board_id = ? AND r.from_goal_id = ?
            AND r.type = 'depends_on' AND r.state = 'active'
          ORDER BY g.goal_id
        `)
        .all(input.boardId, input.goalId) as Row[];
      for (const dependency of dependencies) {
        const dependencyId = asText(dependency.goal_id);
        if (asText(dependency.fulfillment_state) !== "satisfied") {
          reasons.push(
            reason(
              "dependency.unsatisfied",
              "dependency",
              dependencyId,
              `前置 Goal「${asText(dependency.title)}」还未完成`,
              { dependency_goal_id: dependencyId },
            ),
          );
        }
        if (asText(dependency.validity_state) !== "valid") {
          reasons.push(
            reason(
              "dependency.not_valid",
              "dependency",
              dependencyId,
              `前置 Goal「${asText(dependency.title)}」当前不可信`,
              { validity_state: asText(dependency.validity_state) },
            ),
          );
        }
      }

      const risks = this.store.db
        .prepare(`
          SELECT r.* FROM risks r
          JOIN goal_risks gr ON gr.risk_id = r.risk_id
          WHERE gr.goal_id = ? AND r.state IN ('open', 'triggered')
          ORDER BY r.risk_id
        `)
        .all(input.goalId) as Row[];
      for (const risk of risks) {
        const blockingMode = asText(risk.blocking_mode);
        const state = asText(risk.state);
        if (blockingMode === "claim" || (blockingMode === "invalidate_on_trigger" && state === "triggered")) {
          reasons.push(
            reason(
              "risk.blocks_claim",
              "risk",
              asText(risk.risk_id),
              asText(risk.description),
              { blocking_mode: blockingMode, state },
              asText(risk.revisit_condition),
            ),
          );
        }
      }
    }

    if (policy.goal_mode === "required" && !input.goalModeAttestation) {
      reasons.push(
        reason(
          "policy.goal_mode_required",
          "policy",
          input.goalId,
          "这个 Goal 要求 Runtime 开启 Goal 模式",
          undefined,
          "领取时提交 goal_mode_attestation=true",
        ),
      );
    }
    const capabilities = new Set(input.capabilities);
    for (const required of policy.required_capabilities) {
      if (!capabilities.has(required)) {
        reasons.push(
          reason(
            "policy.capability_missing",
            "policy",
            required,
            `Runtime 缺少能力：${required}`,
            { required_capability: required },
          ),
        );
      }
    }

    const competingRoles =
      input.role === "clarifier" ? ["clarifier"] : ["executor", "revalidator"];
    const placeholders = competingRoles.map(() => "?").join(", ");
    const sameGoalClaim = this.store.db
      .prepare(`
        SELECT claim_id, actor_id FROM claims
        WHERE goal_id = ? AND state = 'active' AND expires_at > ?
          AND role IN (${placeholders})
        ORDER BY claim_id LIMIT 1
      `)
      .get(input.goalId, input.now, ...competingRoles) as Row | undefined;
    if (sameGoalClaim) {
      reasons.push(
        reason(
          input.role === "clarifier" ? "claim.clarifier_already_active" : "claim.already_active",
          "claim",
          asText(sameGoalClaim.claim_id),
          input.role === "clarifier"
            ? "这个 Goal 已被其他澄清者领取"
            : "这个 Goal 已被其他执行者领取",
          { actor_id: asText(sameGoalClaim.actor_id) },
        ),
      );
    }

    if (input.role === "executor" || input.role === "revalidator") {
      reasons.push(...this.impactConflicts(input.boardId, input.goalId, surfaces, input.now));
    }
    return { goal, reasons: reasons.sort(compareReasons), policy, surfaces };
  }

  private resolvePolicy(
    boardId: string,
    goalId: string,
    strengthen?: Partial<GoalPolicy>,
  ): GoalPolicy {
    const rows = this.store.activePolicyRows(boardId, goalId);
    let resolved: GoalPolicy = { ...DEFAULT_GOAL_POLICY, required_capabilities: [] };
    for (const { policy } of rows.filter((row) => row.scope === "project_default")) {
      if (policy.goal_mode != null) resolved.goal_mode = policy.goal_mode;
      if (policy.required_capabilities != null) {
        resolved.required_capabilities = unique(policy.required_capabilities).sort();
      }
      if (policy.self_verification != null) {
        resolved.self_verification = policy.self_verification;
      }
      if (policy.cross_reviewers != null) resolved.cross_reviewers = policy.cross_reviewers;
      if (policy.adversarial_reviewers != null) {
        resolved.adversarial_reviewers = policy.adversarial_reviewers;
      }
      if (policy.human_approval != null) resolved.human_approval = policy.human_approval;
      if (policy.max_lease_seconds != null) {
        resolved.max_lease_seconds = Math.max(1, policy.max_lease_seconds);
      }
    }
    const strengtheningPolicies = rows
      .filter((row) => row.scope !== "project_default")
      .map((row) => row.policy);
    if (strengthen) strengtheningPolicies.push(strengthen);
    for (const policy of strengtheningPolicies) {
      if (policy.goal_mode && GOAL_MODE_ORDER[policy.goal_mode] > GOAL_MODE_ORDER[resolved.goal_mode]) {
        resolved.goal_mode = policy.goal_mode;
      }
      resolved.required_capabilities = unique([
        ...resolved.required_capabilities,
        ...(policy.required_capabilities ?? []),
      ]).sort();
      resolved.self_verification ||= policy.self_verification ?? false;
      resolved.cross_reviewers = Math.max(resolved.cross_reviewers, policy.cross_reviewers ?? 0);
      resolved.adversarial_reviewers = Math.max(
        resolved.adversarial_reviewers,
        policy.adversarial_reviewers ?? 0,
      );
      resolved.human_approval ||= policy.human_approval ?? false;
      if (policy.max_lease_seconds != null) {
        resolved.max_lease_seconds = Math.min(
          resolved.max_lease_seconds,
          Math.max(1, policy.max_lease_seconds),
        );
      }
    }
    return resolved;
  }

  private impactConflicts(
    boardId: string,
    goalId: string,
    requested: ImpactBindingRecord[],
    now: string,
  ): DecisionReason[] {
    const rows = this.store.db
      .prepare(`
        SELECT c.claim_id, c.goal_id AS existing_goal_id,
               i.surface, i.access, i.input_snapshot
        FROM claims c
        JOIN impact_bindings i ON i.goal_id = c.goal_id AND i.state = 'confirmed'
        WHERE c.board_id = ? AND c.state = 'active' AND c.expires_at > ?
          AND c.goal_id <> ?
        ORDER BY i.surface, c.claim_id
      `)
      .all(boardId, now, goalId) as Row[];
    const conflicts: DecisionReason[] = [];
    for (const wanted of requested) {
      if (wanted.state !== "confirmed") continue;
      for (const existing of rows) {
        if (asText(existing.surface) !== wanted.surface) continue;
        const existingAccess = asText(existing.access) as ImpactAccess;
        if (this.isImpactPairSafe(existingAccess, asNullableText(existing.input_snapshot), wanted)) continue;
        const code =
          existingAccess === "exclusive" || wanted.access === "exclusive"
            ? "impact.exclusive_conflict"
            : existingAccess === "decide" || wanted.access === "decide"
              ? "impact.decision_conflict"
              : existingAccess === "write" && wanted.access === "write"
                ? "impact.write_write_conflict"
                : "impact.read_write_unpinned";
        conflicts.push(
          reason(
            code,
            "surface",
            wanted.surface,
            `影响面「${wanted.surface}」正在被不兼容地占用`,
            {
              active_claim_id: asText(existing.claim_id),
              active_goal_id: asText(existing.existing_goal_id),
              existing_access: existingAccess,
              requested_access: wanted.access,
            },
            "等待现有 Claim 释放，或确认只读输入快照",
          ),
        );
      }
    }
    return conflicts;
  }

  private isImpactPairSafe(
    existingAccess: ImpactAccess,
    existingSnapshot: string | null,
    requested: ImpactBindingRecord,
  ): boolean {
    if (existingAccess === "exclusive" || requested.access === "exclusive") return false;
    if (existingAccess === "decide" || requested.access === "decide") return false;
    if (existingAccess === "read" && requested.access === "read") return true;
    if (existingAccess === "read" && requested.access === "write") return Boolean(existingSnapshot);
    if (existingAccess === "write" && requested.access === "read") return Boolean(requested.input_snapshot);
    return false;
  }

  private goalImpacts(boardId: string, goalId: string): ImpactBindingRecord[] {
    return this.store
      .snapshot(boardId)
      .impacts.filter((impact) => impact.goal_id === goalId && impact.state !== "inactive");
  }

  private dependencySummary(boardId: string, goalId: string): string[] {
    return (this.store.db
      .prepare(`
        SELECT g.title FROM goal_relations r
        JOIN goals g ON g.goal_id = r.to_goal_id
        WHERE r.board_id = ? AND r.from_goal_id = ?
          AND r.type = 'depends_on' AND r.state = 'active'
        ORDER BY g.goal_id
      `)
      .all(boardId, goalId) as Row[]).map((row) => asText(row.title));
  }

  private riskSummary(goalId: string): string[] {
    return (this.store.db
      .prepare(`
        SELECT r.description FROM risks r
        JOIN goal_risks gr ON gr.risk_id = r.risk_id
        WHERE gr.goal_id = ? AND r.state IN ('open', 'triggered')
        ORDER BY r.risk_id
      `)
      .all(goalId) as Row[]).map((row) => asText(row.description));
  }

  private expirePastClaims(boardId: string, now: string, actorId: string): void {
    const expired = this.store.db
      .prepare(`
        SELECT claim_id, goal_id FROM claims
        WHERE board_id = ? AND state = 'active' AND expires_at <= ?
        ORDER BY claim_id
      `)
      .all(boardId, now) as Row[];
    if (expired.length === 0) return;
    this.store.db
      .prepare("UPDATE claims SET state = 'expired' WHERE board_id = ? AND state = 'active' AND expires_at <= ?")
      .run(boardId, now);
    for (const claim of expired) {
      this.store.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId,
        type: "lease.expired",
        objectType: "claim",
        objectId: asText(claim.claim_id),
        reason: "领取期限已到",
        payload: { goal_id: asText(claim.goal_id) },
        at: now,
      });
    }
  }

  private validateContractProposal(
    boardId: string,
    goalId: string,
    proposedGoal: CreateGoalInput,
    fieldSources: ContractFieldSource[],
    reviewPolicy: GoalPolicy,
    proposedImpacts: ContractProposalImpact[],
    proposedRisks: ContractProposalRisk[],
    dependencyRewireIds: string[],
    requireResolvedDependencies: boolean,
  ): void {
    if (proposedGoal.goal_id !== goalId) {
      throw new GoalBoardV1Error(
        "contract_proposal.goal_mismatch",
        "Contract Proposal 必须补全同一个 Draft Goal，不能换成新 Goal ID",
      );
    }
    if (
      proposedGoal.definition_state !== "accepted" ||
      proposedGoal.decomposition_state !== "closed_leaf"
    ) {
      throw new GoalBoardV1Error(
        "contract_proposal.not_executable",
        "Contract Proposal 必须明确形成 accepted / closed_leaf 的最小可执行 Goal",
      );
    }
    this.validateGoalInput(proposedGoal);
    const priority = proposedGoal.priority;
    if (!Number.isInteger(priority) || Number(priority) < 0 || Number(priority) > 100) {
      throw new GoalBoardV1Error(
        "contract_proposal.priority_invalid",
        "Contract Proposal 必须给出 0 到 100 的明确优先级",
      );
    }
    const criterionIds = proposedGoal.acceptance_criteria
      .map((criterion) => criterion.criterion_id?.trim())
      .filter((criterionId): criterionId is string => Boolean(criterionId));
    if (new Set(criterionIds).size !== criterionIds.length) {
      throw new GoalBoardV1Error(
        "contract_proposal.acceptance_duplicate",
        "Contract Proposal 的验收条件 ID 不能重复",
      );
    }
    for (const criterionId of criterionIds) {
      const existing = this.store.db
        .prepare("SELECT goal_id FROM acceptance_criteria WHERE criterion_id = ?")
        .get(criterionId) as Row | undefined;
      if (existing && asText(existing.goal_id) !== goalId) {
        throw new GoalBoardV1Error(
          "contract_proposal.acceptance_conflict",
          `验收条件 ID 已被其他 Goal 使用: ${criterionId}`,
        );
      }
    }

    const validFields = new Set([
      "title",
      "outcome",
      "why",
      "business_logic",
      "in_scope",
      "out_of_scope",
      "constraints",
      "required_inputs",
      "promised_outputs",
      "priority",
      "acceptance_criteria",
      "review_policy",
    ]);
    const requiredFields = new Set([
      "title",
      "outcome",
      "why",
      "business_logic",
      "in_scope",
      "out_of_scope",
      "priority",
      "acceptance_criteria",
      "review_policy",
    ]);
    if ((proposedGoal.constraints ?? []).length) requiredFields.add("constraints");
    if ((proposedGoal.required_inputs ?? []).length) requiredFields.add("required_inputs");
    if ((proposedGoal.promised_outputs ?? []).length) requiredFields.add("promised_outputs");
    const sourceKinds = new Set([
      "user_answer",
      "repository_fact",
      "document_fact",
      "runtime_inference",
    ]);
    const seenFields = new Set<string>();
    for (const source of fieldSources) {
      if (!validFields.has(source.field) || seenFields.has(source.field)) {
        throw new GoalBoardV1Error(
          "contract_proposal.source_invalid",
          `字段来源无效或重复: ${String(source.field)}`,
        );
      }
      seenFields.add(source.field);
      const refs = Array.isArray(source.source_refs)
        ? source.source_refs.map(String).map((value) => value.trim()).filter(Boolean)
        : [];
      if (
        !sourceKinds.has(source.source_kind) ||
        refs.length === 0 ||
        !Number.isFinite(source.confidence) ||
        source.confidence < 0 ||
        source.confidence > 1 ||
        !source.rationale?.trim() ||
        source.status !== "proposed" ||
        source.requires_user_confirmation !== true
      ) {
        throw new GoalBoardV1Error(
          "contract_proposal.source_invalid",
          `字段 ${String(source.field)} 必须保留来源、可信度、理由和待用户确认状态`,
        );
      }
    }
    const missingSources = [...requiredFields].filter((field) => !seenFields.has(field));
    if (missingSources.length) {
      throw new GoalBoardV1Error(
        "contract_proposal.source_missing",
        `Contract Proposal 缺少字段来源: ${missingSources.join("、")}`,
      );
    }

    const goalModes = new Set(["disabled", "preferred", "required"]);
    if (
      !goalModes.has(reviewPolicy.goal_mode) ||
      !Array.isArray(reviewPolicy.required_capabilities) ||
      reviewPolicy.required_capabilities.some(
        (capability) => typeof capability !== "string" || !capability.trim(),
      ) ||
      typeof reviewPolicy.self_verification !== "boolean" ||
      !Number.isInteger(reviewPolicy.cross_reviewers) ||
      reviewPolicy.cross_reviewers < 0 ||
      !Number.isInteger(reviewPolicy.adversarial_reviewers) ||
      reviewPolicy.adversarial_reviewers < 0 ||
      typeof reviewPolicy.human_approval !== "boolean" ||
      !Number.isInteger(reviewPolicy.max_lease_seconds) ||
      reviewPolicy.max_lease_seconds <= 0
    ) {
      throw new GoalBoardV1Error(
        "contract_proposal.policy_invalid",
        "Contract Proposal 必须包含完整、有效的 Goal Mode 与 Review policy",
      );
    }

    const impactAccesses = new Set(["read", "write", "decide", "exclusive"]);
    for (const impact of proposedImpacts) {
      if (
        !impact.surface?.trim() ||
        !impactAccesses.has(impact.access) ||
        !impact.reason?.trim()
      ) {
        throw new GoalBoardV1Error(
          "contract_proposal.impact_invalid",
          "每个 Impact 必须说明影响面、访问方式和原因",
        );
      }
    }

    const treatments = new Set(["accept", "mitigate", "avoid", "defer"]);
    const blockingModes = new Set(["none", "claim", "completion", "invalidate_on_trigger"]);
    const proposedRiskIds = new Set<string>();
    for (const risk of proposedRisks) {
      const riskId = risk.risk_id?.trim();
      if (
        !riskId ||
        proposedRiskIds.has(riskId) ||
        !risk.description?.trim() ||
        !risk.probability?.trim() ||
        !risk.impact?.trim() ||
        !Array.isArray(risk.affected_surfaces) ||
        !risk.trigger?.trim() ||
        !treatments.has(risk.treatment) ||
        !blockingModes.has(risk.blocking_mode) ||
        !risk.revisit_condition?.trim() ||
        !risk.owner?.trim()
      ) {
        throw new GoalBoardV1Error(
          "contract_proposal.risk_invalid",
          "每个 Risk 必须有唯一 ID、影响、触发条件、处理方式、复查条件和负责人",
        );
      }
      proposedRiskIds.add(riskId);
      const existingRisk = this.store.db
        .prepare("SELECT risk_id FROM risks WHERE board_id = ? AND risk_id = ?")
        .get(boardId, riskId);
      if (existingRisk) {
        throw new GoalBoardV1Error(
          "contract_proposal.risk_exists",
          `Risk 已存在，Contract Proposal 不能静默覆盖: ${riskId}`,
        );
      }
    }

    if (new Set(dependencyRewireIds).size !== dependencyRewireIds.length) {
      throw new GoalBoardV1Error(
        "contract_proposal.dependency_duplicate",
        "Dependency Rewire 引用不能重复",
      );
    }
    for (const rewireId of dependencyRewireIds) {
      const row = this.store.db
        .prepare("SELECT state, proposal_json FROM rewires WHERE board_id = ? AND rewire_id = ?")
        .get(boardId, rewireId) as Row | undefined;
      if (!row) {
        throw new GoalBoardV1Error(
          "contract_proposal.dependency_not_found",
          `找不到 Dependency Rewire: ${rewireId}`,
        );
      }
      const proposal = parseJson<RewireRecord["proposal"]>(row.proposal_json, {});
      if (
        proposal.proposal_kind !== "dependency" ||
        !(proposal.relations ?? []).some(
          (relation) => String(relation.from_goal_id ?? "") === goalId,
        )
      ) {
        throw new GoalBoardV1Error(
          "contract_proposal.dependency_unrelated",
          `Dependency Rewire 不属于这个 Draft: ${rewireId}`,
        );
      }
      if (
        requireResolvedDependencies &&
        !["applied", "rejected"].includes(asText(row.state))
      ) {
        throw new GoalBoardV1Error(
          "contract_proposal.dependency_pending",
          `请先确认或拒绝依赖调整，再接受 Contract: ${rewireId}`,
        );
      }
    }
  }

  private validateGoalInput(input: CreateGoalInput): void {
    if (!input.title?.trim()) {
      throw new GoalBoardV1Error("goal.title_required", "Goal 必须有名称");
    }
    const requiresCompleteContract =
      input.definition_state === "accepted" || input.decomposition_state === "closed_leaf";
    const requiredContract = [input.outcome, input.why, input.business_logic];
    if (requiresCompleteContract && requiredContract.some((value) => !value?.trim())) {
      throw new GoalBoardV1Error(
        "goal.required_field_missing",
        "可执行 Goal 必须包含结果、原因和非技术业务逻辑",
      );
    }
    const requiresAcceptance =
      input.definition_state === "accepted" || input.decomposition_state === "closed_leaf";
    if (requiresAcceptance && input.acceptance_criteria.length === 0) {
      throw new GoalBoardV1Error(
        "goal.acceptance_missing",
        "被接受或可直接执行的最小 Goal 至少需要一条明确验收条件",
      );
    }
    for (const criterion of input.acceptance_criteria) {
      if (!criterion.statement.trim() || !criterion.pass_condition.trim()) {
        throw new GoalBoardV1Error("goal.acceptance_invalid", "每条验收条件都要说明检查什么和怎样算通过");
      }
    }
  }

  private normalizeProposedRelations(
    relations: Array<Record<string, unknown>>,
    allowNewGoalDefault = false,
  ): NormalizedProposedRelation[] {
    const validBases = new Set([
      "contract_output",
      "code_reference",
      "test_dependency",
      "business_sequence",
      "impact_conflict",
      "risk_policy",
    ]);
    return relations.map((relation) => {
      const type = String(relation.type ?? "").trim();
      const normalized: NormalizedProposedRelation = {
        ...relation,
        from_goal_id: String(
          relation.from_goal_id ?? (allowNewGoalDefault ? "$new_goal" : ""),
        ).trim(),
        to_goal_id: String(relation.to_goal_id ?? "").trim(),
        type,
        reason: String(relation.reason ?? "").trim(),
      };
      if (type !== "depends_on") return normalized;

      const action = String(relation.action ?? "add");
      const basis = String(relation.basis ?? "");
      const evidenceRefs = Array.isArray(relation.evidence_refs)
        ? relation.evidence_refs.map(String).map((value) => value.trim()).filter(Boolean)
        : [];
      const impactIfRejected = String(relation.impact_if_rejected ?? "").trim();
      const directionReason = String(relation.direction_reason ?? "").trim();
      const confidence = relation.confidence;
      if (
        !normalized.from_goal_id ||
        !normalized.to_goal_id ||
        !normalized.reason ||
        !impactIfRejected ||
        !directionReason
      ) {
        throw new GoalBoardV1Error(
          "dependency_proposal.field_missing",
          "Dependency Proposal 必须说明起点、前置 Goal、原因、拒绝影响和方向依据",
        );
      }
      if (action !== "add" && action !== "deactivate") {
        throw new GoalBoardV1Error(
          "dependency_proposal.action_invalid",
          "依赖调整 action 必须是 add 或 deactivate",
        );
      }
      if (!validBases.has(basis)) {
        throw new GoalBoardV1Error(
          "dependency_proposal.basis_invalid",
          "Dependency Proposal 的 basis 不在允许范围内",
        );
      }
      if (evidenceRefs.length === 0) {
        throw new GoalBoardV1Error(
          "dependency_proposal.evidence_required",
          "Dependency Proposal 至少需要一个可查找的代码、文档、测试或 Contract 引用",
        );
      }
      if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        throw new GoalBoardV1Error(
          "dependency_proposal.confidence_invalid",
          "Dependency Proposal 的 confidence 必须是 0 到 1 之间的数字",
        );
      }
      return {
        ...normalized,
        action,
        basis,
        evidence_refs: evidenceRefs,
        impact_if_rejected: impactIfRejected,
        confidence,
        direction_reason: directionReason,
      };
    });
  }

  private validateStandaloneDependencies(
    boardId: string,
    dependencies: NormalizedProposedRelation[],
  ): void {
    for (const dependency of dependencies) {
      this.requireGoalOnBoard(boardId, dependency.from_goal_id);
      this.requireGoalOnBoard(boardId, dependency.to_goal_id);
      if (dependency.from_goal_id === dependency.to_goal_id) {
        throw new GoalBoardV1Error(
          "dependency_proposal.self_reference",
          "Goal 不能依赖自身",
        );
      }
      const active = this.store.db
        .prepare(`
          SELECT relation_id FROM goal_relations
          WHERE board_id = ? AND from_goal_id = ? AND to_goal_id = ?
            AND type = 'depends_on' AND state = 'active'
          ORDER BY relation_id
        `)
        .all(boardId, dependency.from_goal_id, dependency.to_goal_id) as Row[];
      if (dependency.action === "add" && active.length > 0) {
        throw new GoalBoardV1Error(
          "dependency_proposal.already_active",
          "这条依赖已经生效，不需要重复提案",
        );
      }
      if (dependency.action === "deactivate" && active.length === 0) {
        throw new GoalBoardV1Error(
          "dependency_proposal.not_active",
          "要停用的依赖当前并未生效",
        );
      }
    }
  }

  private validateCandidateCoordination(
    boardId: string,
    proposedGoal: CreateGoalInput,
    relations: Array<Record<string, unknown>>,
    impacts: Array<Record<string, unknown>>,
    risks: Array<Record<string, unknown>>,
  ): void {
    this.requireBoard(boardId);
    const proposedGoalId = proposedGoal.goal_id?.trim() ?? "";
    if (proposedGoalId && this.store.getGoal(proposedGoalId)) {
      throw new GoalBoardV1Error(
        "candidate.goal_exists",
        `Candidate 使用了已经存在的 Goal ID: ${proposedGoalId}`,
      );
    }
    const isNewGoal = (goalId: string) =>
      goalId === "$new_goal" || (proposedGoalId.length > 0 && goalId === proposedGoalId);
    const requireKnownGoal = (goalId: string, subject: string) => {
      if (!goalId) {
        throw new GoalBoardV1Error(`candidate.${subject}_invalid`, `${subject} 缺少 Goal ID`);
      }
      if (!isNewGoal(goalId)) this.requireGoalOnBoard(boardId, goalId);
    };
    const validRelationTypes = new Set([
      "part_of",
      "depends_on",
      "conflicts_with",
      "mitigates",
      "extends",
      "replaces",
      "corrects",
      "invalidates",
      "migrates_from",
    ]);
    for (const relation of relations) {
      const fromGoalId = String(relation.from_goal_id ?? "$new_goal").trim();
      const toGoalId = String(relation.to_goal_id ?? "").trim();
      const type = String(relation.type ?? "");
      if (!validRelationTypes.has(type) || !String(relation.reason ?? "").trim()) {
        throw new GoalBoardV1Error(
          "candidate.relation_invalid",
          "Candidate 中的关系必须包含有效类型和原因",
        );
      }
      requireKnownGoal(fromGoalId, "relation");
      requireKnownGoal(toGoalId, "relation");
      const canonicalFrom = isNewGoal(fromGoalId) ? "$new_goal" : fromGoalId;
      const canonicalTo = isNewGoal(toGoalId) ? "$new_goal" : toGoalId;
      if (canonicalFrom === canonicalTo) {
        throw new GoalBoardV1Error(
          "candidate.relation_invalid",
          "Candidate 不能让新 Goal 依赖或归属于自身",
        );
      }
      if (type === "depends_on") {
        const action = String(relation.action ?? "add");
        if (action === "deactivate" && (isNewGoal(fromGoalId) || isNewGoal(toGoalId))) {
          throw new GoalBoardV1Error(
            "dependency_proposal.not_active",
            "尚未创建的新 Goal 不存在可停用的 active dependency",
          );
        }
        if (!isNewGoal(fromGoalId) && !isNewGoal(toGoalId)) {
          this.validateStandaloneDependencies(boardId, [relation as NormalizedProposedRelation]);
        }
      }
    }
    for (const impact of impacts) {
      const goalId = String(impact.goal_id ?? "$new_goal").trim();
      const surface = String(impact.surface ?? "").trim();
      const access = String(impact.access ?? "");
      if (!surface || !["read", "write", "decide", "exclusive"].includes(access)) {
        throw new GoalBoardV1Error(
          "candidate.impact_invalid",
          "Candidate 中的 Impact 必须包含影响面和有效访问方式",
        );
      }
      requireKnownGoal(goalId, "impact");
    }
    const validTreatments = new Set(["accept", "mitigate", "avoid", "defer"]);
    const validBlockingModes = new Set(["none", "claim", "completion", "invalidate_on_trigger"]);
    const proposedRiskIds = new Set<string>();
    for (const risk of risks) {
      const description = String(risk.description ?? "").trim();
      const probability = String(risk.probability ?? "").trim();
      const impact = String(risk.impact ?? "").trim();
      const trigger = String(risk.trigger ?? "").trim();
      const treatment = String(risk.treatment ?? "");
      const blockingMode = String(risk.blocking_mode ?? "none");
      const revisitCondition = String(risk.revisit_condition ?? "").trim();
      const owner = String(risk.owner ?? "").trim();
      if (
        !description ||
        !probability ||
        !impact ||
        !trigger ||
        !revisitCondition ||
        !owner ||
        !validTreatments.has(treatment) ||
        !validBlockingModes.has(blockingMode)
      ) {
        throw new GoalBoardV1Error(
          "candidate.risk_invalid",
          "Candidate 中的 Risk 字段不完整或取值无效",
        );
      }
      const goalIdsValue = risk.goal_ids;
      const goalIds = goalIdsValue == null
        ? ["$new_goal"]
        : Array.isArray(goalIdsValue)
          ? goalIdsValue.map(String)
          : [];
      if (goalIds.length === 0) {
        throw new GoalBoardV1Error(
          "candidate.risk_invalid",
          "Candidate 中的 Risk 必须关联至少一个 Goal",
        );
      }
      for (const goalId of goalIds) requireKnownGoal(goalId, "risk");
      const riskId = risk.risk_id == null ? "" : String(risk.risk_id).trim();
      if (riskId) {
        if (proposedRiskIds.has(riskId) || this.store.db.prepare("SELECT risk_id FROM risks WHERE risk_id = ?").get(riskId)) {
          throw new GoalBoardV1Error(
            "candidate.risk_exists",
            `Candidate 使用了重复或已存在的 Risk ID: ${riskId}`,
          );
        }
        proposedRiskIds.add(riskId);
      }
    }
  }

  private requireBoard(boardId: string): void {
    const row = this.store.db.prepare("SELECT board_id FROM boards WHERE board_id = ?").get(boardId);
    if (!row) throw new GoalBoardV1Error("board.not_found", `Board 不存在: ${boardId}`);
  }

  private requireGoalOnBoard(boardId: string, goalId: string): GoalRecord {
    const goal = this.store.getGoal(goalId);
    if (!goal || goal.board_id !== boardId) {
      throw new GoalBoardV1Error("goal.not_found", `Goal 不存在: ${goalId}`);
    }
    return goal;
  }

  private replay<T>(
    boardId: string,
    actorId: string,
    operation: string,
    key: string,
    hash: string,
  ): T | null {
    const existing = this.store.getIdempotency(boardId, actorId, operation, key);
    if (!existing) return null;
    if (existing.request_hash !== hash) {
      throw new GoalBoardV1Error(
        "request.idempotency_key_reused",
        `幂等键 ${key} 已被不同请求使用`,
      );
    }
    return existing.outcome as T;
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
    this.store.putIdempotency({
      boardId,
      actorId,
      operation,
      key,
      requestHash: hash,
      outcome,
      at,
    });
  }
}

export type GoalBoardDatabase = Database.Database;

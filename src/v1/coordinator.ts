import { createHash, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { SqliteGoalBoardStore, mapSqliteClaim, sqliteJson } from "./store.js";
import {
  ProjectReferenceError,
  validateEvidenceLocator,
} from "../evidence/locator.js";
import {
  DEFAULT_GOAL_POLICY,
  type AvailableGoal,
  type BoardSnapshot,
  type BlockedAvailableGoal,
  type ClaimDecision,
  type ClaimRecord,
  type ClaimRenewRequest,
  type ClaimRenewResult,
  type ClaimRunDecision,
  type ClaimRequest,
  type ClaimRole,
  type CandidateGoalRecord,
  type ContractFieldSource,
  type ContractProposalImpact,
  type ContractProposalRecord,
  type ContractProposalRisk,
  type ClarificationAssumption,
  type ClarificationFact,
  type ClarificationSessionRecord,
  type CreateGoalInput,
  type DecisionReason,
  type DraftDialogueResumeInput,
  type DraftDialogueStartInput,
  type DraftDialogueTurnInput,
  type DraftDialogueView,
  type EvidenceCorrectionRecord,
  type EvidenceRecord,
  type GoalPolicy,
  type GoalContractView,
  type GoalRecord,
  type GoalRelationRecord,
  type GoalTrashResult,
  type GoalTreeProposalItemInput,
  type GoalTreeProposalItemRecord,
  type GoalTreeProposalCheckInput,
  type GoalTreeProposalDecideInput,
  type GoalTreeProposalDecisionAuthority,
  type GoalTreeProposalItemDecisionInput,
  type GoalTreeProposalDecisionRecord,
  type GoalTreeProposalRecord,
  type GoalTreeProposalSubmitInput,
  type ProposalAffectedObject,
  type ProposalObjectVersion,
  type GoalWorkAction,
  type GoalWorkState,
  type GoalWorkStateView,
  type ImpactAccess,
  type ImpactBindingRecord,
  type ParallelExecutionSuggestion,
  type ReadyGoal,
  type RevalidationDecision,
  type ReviewRecord,
  type RewireRecord,
  type RiskRecord,
  type RunRecord,
} from "./types.js";
import { requiresParentCompletionConfirmation } from "./parent-completion.js";
import {
  goalTreeProposalItemValidationIssues,
  goalTreeRiskDescription,
} from "./goal-tree-proposal-validation.js";
import {
  goalProposalLeafReadinessIssues,
  goalTreeProposalDecompositionIssues,
  readDecompositionReview,
} from "./goal-decomposition-validation.js";
import {
  composePlanningMethodPacks,
  normalizePlanningMethodPack,
  resolvePlanningMethodPacks,
  type PlanningMethodComposition,
  type PlanningMethodPack,
  type PlanningMethodPackInput,
} from "../planning/method-packs.js";
import {
  analyzeGoalChangeImpact,
  planningMetrics,
  projectPlanningRelations,
  validatePlanningGraph,
  validatePlanningProposalGraph,
  type GoalChangeImpact,
  type PlanningGraphIssue,
  type PlanningMetric,
} from "../planning/goal-graph.js";

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
    readonly details?: Record<string, unknown>,
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

/** A role-neutral query: the Runtime gets the whole Available set and chooses. */
export interface AvailableQuery {
  board_id: string;
  actor_id: string;
  capabilities?: string[];
  goal_mode_attestation?: boolean;
}

export interface AvailableQueryResult {
  observed_event_cursor: number;
  available: AvailableGoal[];
  blocked: BlockedAvailableGoal[];
  parallel_suggestion: ParallelExecutionSuggestion | null;
}

export interface GoalTreeProposalListQuery {
  board_id: string;
  proposal_id?: string;
  root_goal_id?: string;
  include_legacy?: boolean;
}

export interface GoalTreeProposalListResult {
  observed_event_cursor: number;
  proposals: GoalTreeProposalRecord[];
}

export interface GoalTreeProposalCheckResult {
  proposal: GoalTreeProposalRecord;
  conflict_item_ids: string[];
  planning_issues: PlanningGraphIssue[];
  observed_event_cursor: number;
}

export interface GoalTreeProposalDecisionResult {
  proposal: GoalTreeProposalRecord;
  revision_proposals: GoalTreeProposalRecord[];
  applied_item_ids: string[];
  rejected_item_ids: string[];
  revised_item_ids: string[];
  conflict_item_ids: string[];
  observed_event_cursor: number;
  replayed: boolean;
}

interface ActorWrite {
  actor_id: string;
  idempotency_key: string;
  reason?: string;
}

interface ImpactFactsInput {
  binding_id?: string;
  goal_id: string;
  surface: string;
  access: ImpactAccess;
  input_snapshot?: string | null;
  state?: "proposed" | "confirmed";
  reason: string;
}

interface RiskFactsInput {
  risk_id?: string;
  goal_ids: string[];
  description: string;
  probability: string;
  impact: string;
  affected_surfaces?: string[];
  trigger: string;
  treatment: RiskRecord["treatment"];
  treatment_plan?: string;
  blocking_mode: RiskRecord["blocking_mode"];
  revisit_condition: string;
  owner: string;
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
  snapshot?: BoardSnapshot;
}

interface Evaluation {
  goal: GoalRecord | null;
  reasons: DecisionReason[];
  policy: GoalPolicy;
  surfaces: ImpactBindingRecord[];
}

interface AvailableAction {
  role: ClaimRole | null;
  next_action: GoalWorkAction;
  review_obligation_id: string | null;
}

const GOAL_MODE_ORDER = { disabled: 0, preferred: 1, required: 2 } as const;
const IMPACT_ACCESSES = new Set<ImpactAccess>(["read", "write", "decide", "exclusive"]);
const IMPACT_ACTIVE_STATES = new Set<"proposed" | "confirmed">(["proposed", "confirmed"]);
const RISK_TREATMENTS = new Set<RiskRecord["treatment"]>(["accept", "mitigate", "avoid", "defer"]);
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

function requiredDialogueText(value: string, code: string, message: string): string {
  const text = value.trim();
  if (!text) throw new GoalBoardV1Error(code, message);
  return text;
}

function nullableDialogueText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const text = value.trim();
  return text || null;
}

function dialogueReferences(value: string[] | undefined, turnId: string): string[] {
  return unique([...(value ?? []).map((item) => item.trim()).filter(Boolean), `clarification-turn:${turnId}`]);
}

function dialogueConfidence(value: number | undefined, label: string): number {
  const confidence = value ?? 1;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new GoalBoardV1Error("draft_dialogue.confidence_invalid", `${label} 的置信度必须在 0 到 1 之间`);
  }
  return confidence;
}

function normalizeClarificationFacts(
  facts: NonNullable<DraftDialogueTurnInput["known_facts"]>,
  turnId: string,
): ClarificationFact[] {
  return facts.map((fact) => {
    const statement = requiredDialogueText(
      fact.statement,
      "draft_dialogue.fact_required",
      "每条已知事实都需要清楚说明",
    );
    if (!["user_answer", "repository_fact", "document_fact"].includes(fact.source_kind)) {
      throw new GoalBoardV1Error(
        "draft_dialogue.fact_source_invalid",
        "Runtime 推断必须写入假设，不能伪装成已知事实",
      );
    }
    return {
      statement,
      source_kind: fact.source_kind,
      source_refs: dialogueReferences(fact.source_refs, turnId),
      confidence: dialogueConfidence(fact.confidence, "事实"),
      confirmed_by_user: fact.source_kind === "user_answer" ? true : Boolean(fact.confirmed_by_user),
    };
  });
}

function normalizeClarificationAssumptions(
  assumptions: NonNullable<DraftDialogueTurnInput["assumptions"]>,
  turnId: string,
): ClarificationAssumption[] {
  return assumptions.map((assumption) => ({
    statement: requiredDialogueText(
      assumption.statement,
      "draft_dialogue.assumption_required",
      "每条假设都需要清楚说明",
    ),
    source_refs: dialogueReferences(assumption.source_refs, turnId),
    confidence: dialogueConfidence(assumption.confidence, "假设"),
    requires_user_confirmation: true,
  }));
}

function draftTitleFromIdea(roughIdea: string): string {
  const firstLine = roughIdea.split(/\r?\n/, 1)[0]?.trim() || roughIdea.trim();
  return firstLine.length <= 120 ? firstLine : `${firstLine.slice(0, 117)}…`;
}

const GOAL_TREE_PROPOSAL_KINDS = new Set<GoalTreeProposalItemRecord["kind"]>([
  "goal",
  "contract",
  "relation",
  "dependency",
  "risk",
  "policy",
  "candidate",
  "rewire",
]);
const GOAL_TREE_PROPOSAL_OPERATIONS = new Set<GoalTreeProposalItemRecord["operation"]>([
  "create",
  "update",
  "deactivate",
]);
const GOAL_RELATION_TYPES = new Set<GoalRelationRecord["type"]>([
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
const PROPOSAL_AFFECTED_OBJECT_TYPES = new Set<ProposalAffectedObject["object_type"]>([
  "goal",
  "relation",
  "risk",
  "policy",
  "candidate",
  "rewire",
]);

interface NormalizedGoalTreeProposalItem {
  item_id: string;
  kind: GoalTreeProposalItemRecord["kind"];
  operation: GoalTreeProposalItemRecord["operation"];
  payload: Record<string, unknown>;
  source_refs: string[];
  reason: string;
  confidence: number;
  affected_objects: ProposalAffectedObject[];
  requires_user_confirmation: true;
  supersedes_item_id: string | null;
}

function goalTreeProposalRelationPayloads(
  item: GoalTreeProposalItemInput,
  itemIndex: number,
): Record<string, unknown>[] {
  const source = item.payload.relations ?? item.payload.relation ?? item.payload;
  const values = Array.isArray(source) ? source : [source];
  if (values.length === 0) {
    throw new GoalBoardV1Error(
      "goal_tree_proposal.relations_required",
      `第 ${itemIndex + 1} 个 ${item.kind} 条目至少需要一条关系；请在 payload 直接提供关系字段，或使用 relations 数组。`,
    );
  }
  return values.map((value, relationIndex) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.item_payload_invalid",
        `第 ${itemIndex + 1} 个 ${item.kind} 条目的第 ${relationIndex + 1} 条关系必须是结构化对象。`,
      );
    }
    return value as Record<string, unknown>;
  });
}

function validateGoalTreeProposalRelationPayload(
  item: GoalTreeProposalItemInput,
  itemIndex: number,
): void {
  if (item.kind !== "relation" && item.kind !== "dependency") return;
  for (const [relationIndex, relation] of goalTreeProposalRelationPayloads(item, itemIndex).entries()) {
    const location = `第 ${itemIndex + 1} 个 ${item.kind} 条目的第 ${relationIndex + 1} 条关系`;
    const action = String(relation.action ?? (item.operation === "deactivate" ? "deactivate" : "add"));
    if (action !== "add" && action !== "deactivate") {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.relation_action_invalid",
        `${location} 的 action 必须是 add 或 deactivate。`,
      );
    }
    const relationId = String(relation.relation_id ?? "").trim();
    const fromGoalId = String(relation.from_goal_id ?? "").trim();
    const toGoalId = String(relation.to_goal_id ?? "").trim();
    const relationType = String(relation.type ?? "").trim();
    if (item.kind === "dependency" && relationType && relationType !== "depends_on") {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.dependency_type_invalid",
        `${location} 的 type 只能是 depends_on；kind=dependency 已固定该类型。方向是消费方/依赖方 Goal → 提供方/前置 Goal。`,
      );
    }
    if (action === "deactivate" && relationId) continue;
    const missing = [
      ...(!fromGoalId ? ["from_goal_id"] : []),
      ...(!toGoalId ? ["to_goal_id"] : []),
      ...(item.kind === "relation" && !relationType ? ["type"] : []),
    ];
    if (missing.length === 0) continue;
    if (item.kind === "dependency") {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.dependency_required",
        `${location}缺少字段：${missing.join("、")}。规范格式示例：{"from_goal_id":"consumer-goal","to_goal_id":"provider-goal","type":"depends_on"}；方向是消费方/依赖方 Goal → 提供方/前置 Goal。`,
      );
    }
    throw new GoalBoardV1Error(
      "goal_tree_proposal.relation_required",
      `${location}缺少字段：${missing.join("、")}。规范格式示例：{"from_goal_id":"child-goal","to_goal_id":"parent-goal","type":"part_of"}；part_of 方向是子 Goal → 父 Goal。`,
    );
  }
}

interface NormalizedGoalTreeProposalDecision {
  item_id: string;
  decision: GoalTreeProposalItemDecisionInput["decision"];
  reason: string;
  revised_item: NormalizedGoalTreeProposalItem | null;
}

function normalizeGoalTreeProposalDecisionAuthority(
  authority: GoalTreeProposalDecisionAuthority,
): GoalTreeProposalDecisionAuthority {
  if (!authority || authority.actor_kind !== "user") {
    throw new GoalBoardV1Error(
      "goal_tree_proposal.user_authority_required",
      "只有受信用户决定可以物化 Goal Tree 提案",
    );
  }
  if (![
    "runtime_dialogue",
    "web",
    "management",
  ].includes(authority.authority_source)) {
    throw new GoalBoardV1Error(
      "goal_tree_proposal.authority_source_invalid",
      "Goal Tree 决定必须标明可审计的用户确认入口",
    );
  }
  return {
    actor_id: requiredDialogueText(
      authority.actor_id,
      "goal_tree_proposal.user_actor_required",
      "Goal Tree 决定需要用户确认身份",
    ),
    actor_kind: "user",
    authority_source: authority.authority_source,
    conversation_ref: requiredDialogueText(
      authority.conversation_ref,
      "goal_tree_proposal.conversation_ref_required",
      "Goal Tree 决定需要对话引用",
    ),
    message_ref: requiredDialogueText(
      authority.message_ref,
      "goal_tree_proposal.message_ref_required",
      "Goal Tree 决定需要确认消息引用",
    ),
    whole_confirmation_prompted: authority.whole_confirmation_prompted === true,
  };
}

function normalizeGoalTreeProposalDecisions(
  decisions: GoalTreeProposalItemDecisionInput[] | undefined,
  fallbackReason: string | undefined,
): NormalizedGoalTreeProposalDecision[] {
  const ids = new Set<string>();
  return (decisions ?? []).map((decision, index) => {
    const itemId = requiredDialogueText(
      decision.item_id,
      "goal_tree_proposal.decision_item_required",
      `第 ${index + 1} 个决定缺少 item_id`,
    );
    if (ids.has(itemId)) {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.decision_item_duplicate",
        "同一次用户决定不能重复处理同一个提案条目",
      );
    }
    ids.add(itemId);
    if (!["confirm", "reject", "revise"].includes(decision.decision)) {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.decision_invalid",
        `第 ${index + 1} 个条目的决定必须是 confirm、reject 或 revise`,
      );
    }
    const reasonText = (decision.reason || fallbackReason || "").trim();
    if (!reasonText) {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.decision_reason_required",
        `第 ${index + 1} 个条目的用户决定需要说明理由或修改意见`,
      );
    }
    const revisedItem = decision.revised_item
      ? normalizeGoalTreeProposalItems([decision.revised_item])[0] ?? null
      : null;
    if (decision.decision === "revise" && !revisedItem) {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.revision_item_required",
        "修改条目时必须提供完整的新条目内容",
      );
    }
    if (decision.decision !== "revise" && revisedItem) {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.revision_item_unexpected",
        "只有 revise 决定可以包含新的条目内容",
      );
    }
    return {
      item_id: itemId,
      decision: decision.decision,
      reason: reasonText,
      revised_item: revisedItem,
    };
  });
}

function normalizeGoalTreeProposalItems(
  items: GoalTreeProposalItemInput[],
): NormalizedGoalTreeProposalItem[] {
  if (items.length === 0) {
    throw new GoalBoardV1Error("goal_tree_proposal.items_required", "一份 Goal Tree 提案至少需要一个变更条目");
  }
  const ids = new Set<string>();
  return items.map((item, index) => {
    if (!GOAL_TREE_PROPOSAL_KINDS.has(item.kind)) {
      throw new GoalBoardV1Error("goal_tree_proposal.item_kind_invalid", `第 ${index + 1} 个条目的类型无效`);
    }
    if (!GOAL_TREE_PROPOSAL_OPERATIONS.has(item.operation)) {
      throw new GoalBoardV1Error("goal_tree_proposal.item_operation_invalid", `第 ${index + 1} 个条目的操作无效`);
    }
    if (!item.payload || typeof item.payload !== "object" || Array.isArray(item.payload)) {
      throw new GoalBoardV1Error("goal_tree_proposal.item_payload_invalid", `第 ${index + 1} 个条目必须带结构化内容`);
    }
    validateGoalTreeProposalRelationPayload(item, index);
    const itemId = item.item_id?.trim() || `goal-tree-proposal-item-${randomUUID()}`;
    if (ids.has(itemId)) {
      throw new GoalBoardV1Error("goal_tree_proposal.item_id_duplicate", "同一份提案中的 item_id 不能重复");
    }
    ids.add(itemId);
    const sourceRefs = unique(item.source_refs.map((reference) => reference.trim()).filter(Boolean)).sort();
    if (sourceRefs.length === 0) {
      throw new GoalBoardV1Error("goal_tree_proposal.source_required", `第 ${index + 1} 个条目至少需要一个来源引用`);
    }
    const reasonText = item.reason.trim();
    if (!reasonText) {
      throw new GoalBoardV1Error("goal_tree_proposal.reason_required", `第 ${index + 1} 个条目必须说明业务理由`);
    }
    if (!Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) {
      throw new GoalBoardV1Error("goal_tree_proposal.confidence_invalid", `第 ${index + 1} 个条目的置信度必须在 0 到 1 之间`);
    }
    if (item.requires_user_confirmation === false) {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.user_confirmation_required",
        "Goal Tree 提案的每个条目都必须等待用户确认，不能提前物化为正式事实",
      );
    }
    const seenObjects = new Set<string>();
    const affectedObjects = item.affected_objects.map((object, objectIndex) => {
      if (!PROPOSAL_AFFECTED_OBJECT_TYPES.has(object.object_type)) {
        throw new GoalBoardV1Error(
          "goal_tree_proposal.affected_object_type_invalid",
          `第 ${index + 1} 个条目的第 ${objectIndex + 1} 个受影响对象类型无效`,
        );
      }
      const objectId = object.object_id.trim();
      if (!objectId) {
        throw new GoalBoardV1Error(
          "goal_tree_proposal.affected_object_required",
          `第 ${index + 1} 个条目的第 ${objectIndex + 1} 个受影响对象缺少 ID`,
        );
      }
      const key = `${object.object_type}:${objectId}`;
      if (seenObjects.has(key)) return null;
      seenObjects.add(key);
      return { object_type: object.object_type, object_id: objectId };
    }).filter((object): object is ProposalAffectedObject => object != null);
    if (affectedObjects.length === 0) {
      throw new GoalBoardV1Error("goal_tree_proposal.affected_objects_required", `第 ${index + 1} 个条目必须标出受影响对象`);
    }
    return {
      item_id: itemId,
      kind: item.kind,
      operation: item.operation,
      payload: canonicalize(item.payload) as Record<string, unknown>,
      source_refs: sourceRefs,
      reason: reasonText,
      confidence: item.confidence,
      affected_objects: affectedObjects,
      requires_user_confirmation: true,
      supersedes_item_id: item.supersedes_item_id?.trim() || null,
    };
  });
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
    private readonly personalPlanningMethodPacks: readonly PlanningMethodPack[] = [],
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
      this.requireNonTrashedGoalOnBoard(boardId, input.from_goal_id);
      this.requireNonTrashedGoalOnBoard(boardId, input.to_goal_id);
      if (input.from_goal_id === input.to_goal_id) {
        throw new GoalBoardV1Error("relation.self_reference", "Goal 不能关联到自身");
      }
      if (
        (input.state ?? "active") === "active" &&
        ["part_of", "depends_on"].includes(input.type)
      ) {
        const projectedId = "projected:new-relation";
        const snapshot = this.store.snapshot(boardId);
        const issues = validatePlanningGraph(
          snapshot.goals,
          projectPlanningRelations(snapshot.relations, [{
            action: "add",
            relation_id: projectedId,
            from_goal_id: input.from_goal_id,
            to_goal_id: input.to_goal_id,
            type: input.type,
            reason: input.reason,
          }]),
        ).filter((issue) => issue.relation_ids.includes(projectedId));
        if (issues.length) {
          throw new GoalBoardV1Error(issues[0]!.code, issues[0]!.message);
        }
      }
      const relationReason = input.reason.trim();
      if (!relationReason) {
        throw new GoalBoardV1Error("relation.reason_required", "关系必须说明建立原因");
      }
      const alreadyActive = this.store.db
        .prepare(`
          SELECT relation_id FROM goal_relations
          WHERE board_id = ? AND from_goal_id = ? AND to_goal_id = ?
            AND type = ? AND state = ?
          LIMIT 1
        `)
        .get(
          boardId,
          input.from_goal_id,
          input.to_goal_id,
          input.type,
          input.state ?? "active",
        ) as Row | undefined;
      if (alreadyActive) {
        throw new GoalBoardV1Error(
          "relation.already_exists",
          input.state === "proposed" ? "这条待确认关系已经存在" : "这条关系已经生效",
        );
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
          relationReason,
          write.actor_id,
          at,
        );
      let cursor = this.store.appendEvent({
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
        const reopened = this.reopenSatisfiedCompoundParent(
          boardId,
          input.to_goal_id,
          write.actor_id,
          at,
        );
        if (!reopened) {
          cursor = this.reconcileCompoundAncestors(boardId, input.from_goal_id, write.actor_id, at);
        }
      }
      const outcome = { relation_id: relationId, observed_event_cursor: cursor };
      this.remember(boardId, write.actor_id, "add_relation", write.idempotency_key, hash, outcome, at);
      return { ...outcome, replayed: false };
    });
  }

  deactivateRelation(
    boardId: string,
    input: { relation_id: string; reason: string },
    write: ActorWrite,
  ): {
    relation: GoalRelationRecord;
    replayed: boolean;
    observed_event_cursor: number;
  } {
    const reasonText = input.reason.trim();
    if (!reasonText) {
      throw new GoalBoardV1Error("relation.deactivation_reason_required", "解除关系时必须说明原因");
    }
    const hash = requestHash({ board_id: boardId, relation_id: input.relation_id, reason: reasonText });
    return this.store.immediate(() => {
      const replay = this.replay<{
        relation: GoalRelationRecord;
        observed_event_cursor: number;
      }>(boardId, write.actor_id, "deactivate_relation", write.idempotency_key, hash);
      if (replay) return { ...replay, replayed: true };
      this.requireBoard(boardId);
      const row = this.store.db
        .prepare("SELECT * FROM goal_relations WHERE board_id = ? AND relation_id = ?")
        .get(boardId, input.relation_id) as Row | undefined;
      if (!row) {
        throw new GoalBoardV1Error("relation.not_found", `找不到关系: ${input.relation_id}`);
      }
      if (asText(row.state) !== "active") {
        throw new GoalBoardV1Error("relation.not_active", "只有正在生效的关系可以解除");
      }
      const at = this.clock().toISOString();
      this.store.db
        .prepare(`
          UPDATE goal_relations
          SET state = 'inactive', deactivated_at = ?
          WHERE relation_id = ?
        `)
        .run(at, input.relation_id);
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId: write.actor_id,
        type: "relation.deactivated",
        objectType: "relation",
        objectId: input.relation_id,
        reason: reasonText,
        payload: {
          from_goal_id: asText(row.from_goal_id),
          to_goal_id: asText(row.to_goal_id),
          type: asText(row.type),
        },
        at,
      });
      const relation = this.store
        .snapshot(boardId)
        .relations.find((item) => item.relation_id === input.relation_id);
      if (!relation) throw new Error("关系停用后无法读取");
      const outcome = { relation, observed_event_cursor: cursor };
      this.remember(
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

  addImpact(
    boardId: string,
    input: ImpactFactsInput,
    write: ActorWrite,
  ): { binding_id: string; impact: ImpactBindingRecord; replayed: boolean; observed_event_cursor: number } {
    const hash = requestHash({ board_id: boardId, ...input });
    return this.store.immediate(() => {
      const replay = this.replay<{ binding_id: string; impact: ImpactBindingRecord; observed_event_cursor: number }>(
        boardId,
        write.actor_id,
        "add_impact",
        write.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      const facts = this.normalizeImpactFacts(boardId, input);
      const bindingId = `impact-${randomUUID()}`;
      const at = this.clock().toISOString();
      this.store.db
        .prepare(`
          INSERT INTO impact_bindings (
            binding_id, board_id, goal_id, surface, access, input_snapshot,
            state, reason, created_by, created_at, updated_at,
            deactivated_at, deactivation_reason
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
        `)
        .run(
          bindingId,
          boardId,
          facts.goal_id,
          facts.surface,
          facts.access,
          facts.input_snapshot,
          facts.state,
          facts.reason,
          write.actor_id,
          at,
          at,
        );
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId: write.actor_id,
        type: "impact.added",
        objectType: "impact",
        objectId: bindingId,
        reason: facts.reason,
        payload: facts,
        at,
      });
      const outcome = {
        binding_id: bindingId,
        impact: this.readImpact(boardId, bindingId),
        observed_event_cursor: cursor,
      };
      this.remember(boardId, write.actor_id, "add_impact", write.idempotency_key, hash, outcome, at);
      return { ...outcome, replayed: false };
    });
  }

  updateImpact(
    boardId: string,
    input: Omit<ImpactFactsInput, "binding_id"> & { binding_id: string },
    write: ActorWrite,
  ): { impact: ImpactBindingRecord; replayed: boolean; observed_event_cursor: number } {
    const hash = requestHash({ board_id: boardId, ...input, audit_reason: write.reason });
    return this.store.immediate(() => {
      const replay = this.replay<{ impact: ImpactBindingRecord; observed_event_cursor: number }>(
        boardId,
        write.actor_id,
        "update_impact",
        write.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      const auditReason = write.reason?.trim();
      if (!auditReason) throw new GoalBoardV1Error("impact.audit_reason_required", "更新 Impact 时必须说明修改原因");
      const bindingId = input.binding_id.trim();
      const previous = this.store.db
        .prepare("SELECT * FROM impact_bindings WHERE binding_id = ? AND board_id = ?")
        .get(bindingId, boardId) as Row | undefined;
      if (!previous) throw new GoalBoardV1Error("impact.not_found", `Impact 不存在: ${bindingId}`);
      if (asText(previous.state) === "inactive") {
        throw new GoalBoardV1Error("impact.inactive_immutable", "已停用的 Impact 作为历史保留，不能原地修改");
      }
      if (input.goal_id.trim() !== asText(previous.goal_id)) {
        throw new GoalBoardV1Error(
          "impact.goal_immutable",
          "Impact 的归属 Goal 不能通过更新迁移；请在目标 Goal 新建绑定并停用原记录",
        );
      }
      const facts = this.normalizeImpactFacts(boardId, input);
      const at = this.clock().toISOString();
      this.store.db
        .prepare(`
          UPDATE impact_bindings SET
            goal_id = ?, surface = ?, access = ?, input_snapshot = ?, state = ?,
            reason = ?, updated_at = ?
          WHERE binding_id = ? AND board_id = ?
        `)
        .run(
          facts.goal_id,
          facts.surface,
          facts.access,
          facts.input_snapshot,
          facts.state,
          facts.reason,
          at,
          bindingId,
          boardId,
        );
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId: write.actor_id,
        type: "impact.updated",
        objectType: "impact",
        objectId: bindingId,
        reason: auditReason,
        payload: {
          previous: {
            goal_id: asText(previous.goal_id),
            surface: asText(previous.surface),
            access: asText(previous.access),
            input_snapshot: asNullableText(previous.input_snapshot),
            state: asText(previous.state),
            reason: asText(previous.reason),
          },
          current: facts,
        },
        at,
      });
      const outcome = { impact: this.readImpact(boardId, bindingId), observed_event_cursor: cursor };
      this.remember(boardId, write.actor_id, "update_impact", write.idempotency_key, hash, outcome, at);
      return { ...outcome, replayed: false };
    });
  }

  deactivateImpact(
    boardId: string,
    input: { binding_id: string; reason: string },
    write: ActorWrite,
  ): { impact: ImpactBindingRecord; replayed: boolean; observed_event_cursor: number } {
    const hash = requestHash({ board_id: boardId, ...input });
    return this.store.immediate(() => {
      const replay = this.replay<{ impact: ImpactBindingRecord; observed_event_cursor: number }>(
        boardId,
        write.actor_id,
        "deactivate_impact",
        write.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      const reasonText = input.reason.trim();
      if (!reasonText) throw new GoalBoardV1Error("impact.deactivation_reason_required", "停用 Impact 时必须说明原因");
      const bindingId = input.binding_id.trim();
      const row = this.store.db
        .prepare("SELECT * FROM impact_bindings WHERE binding_id = ? AND board_id = ?")
        .get(bindingId, boardId) as Row | undefined;
      if (!row) throw new GoalBoardV1Error("impact.not_found", `Impact 不存在: ${bindingId}`);
      if (asText(row.state) === "inactive") {
        throw new GoalBoardV1Error("impact.already_inactive", "Impact 已经停用");
      }
      const at = this.clock().toISOString();
      this.store.db
        .prepare(`
          UPDATE impact_bindings SET state = 'inactive', updated_at = ?,
            deactivated_at = ?, deactivation_reason = ?
          WHERE binding_id = ? AND board_id = ?
        `)
        .run(at, at, reasonText, bindingId, boardId);
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId: write.actor_id,
        type: "impact.deactivated",
        objectType: "impact",
        objectId: bindingId,
        reason: reasonText,
        payload: {
          goal_id: asText(row.goal_id),
          surface: asText(row.surface),
          access: asText(row.access),
          previous_state: asText(row.state),
        },
        at,
      });
      const outcome = { impact: this.readImpact(boardId, bindingId), observed_event_cursor: cursor };
      this.remember(boardId, write.actor_id, "deactivate_impact", write.idempotency_key, hash, outcome, at);
      return { ...outcome, replayed: false };
    });
  }

  private normalizeImpactFacts(
    boardId: string,
    input: Omit<ImpactFactsInput, "binding_id">,
  ): Required<Pick<ImpactFactsInput, "goal_id" | "surface" | "access" | "state" | "reason">> & {
    input_snapshot: string | null;
  } {
    const goalId = input.goal_id.trim();
    const surface = input.surface.trim();
    const state = input.state ?? "confirmed";
    const reasonText = input.reason.trim();
    this.requireGoalOnBoard(boardId, goalId);
    if (!surface) throw new GoalBoardV1Error("impact.surface_required", "影响面不能为空");
    if (!IMPACT_ACCESSES.has(input.access)) throw new GoalBoardV1Error("impact.access_invalid", "Impact access 无效");
    if (!IMPACT_ACTIVE_STATES.has(state)) throw new GoalBoardV1Error("impact.state_invalid", "Impact 状态必须是提议中或已确认");
    if (!reasonText) throw new GoalBoardV1Error("impact.reason_required", "Impact 必须说明绑定原因");
    return {
      goal_id: goalId,
      surface,
      access: input.access,
      input_snapshot: input.input_snapshot?.trim() || null,
      state,
      reason: reasonText,
    };
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
    input: RiskFactsInput,
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
      const facts = this.normalizeRiskFacts(boardId, input);
      const riskId = input.risk_id?.trim() || `risk-${randomUUID()}`;
      const now = this.clock().toISOString();
      this.store.db
        .prepare(`
          INSERT INTO risks (
            risk_id, board_id, description, probability, impact,
            affected_surfaces_json, trigger, treatment, treatment_plan, blocking_mode,
            revisit_condition, owner, state, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
        `)
        .run(
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
      const link = this.store.db.prepare("INSERT INTO goal_risks (goal_id, risk_id) VALUES (?, ?)");
      for (const goalId of facts.goal_ids) link.run(goalId, riskId);
      const cursor = this.store.appendEvent({
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
      const risk = this.readRisk(boardId, riskId);
      const outcome = { risk, observed_event_cursor: cursor };
      this.remember(boardId, write.actor_id, "add_risk", write.idempotency_key, hash, outcome, now);
      return { ...outcome, replayed: false };
    });
  }

  updateRisk(
    boardId: string,
    input: Omit<RiskFactsInput, "risk_id"> & { risk_id: string },
    write: ActorWrite,
  ): { risk: RiskRecord; replayed: boolean; observed_event_cursor: number } {
    const hash = requestHash({ board_id: boardId, ...input, reason: write.reason });
    return this.store.immediate(() => {
      const replay = this.replay<{ risk: RiskRecord; observed_event_cursor: number }>(
        boardId,
        write.actor_id,
        "update_risk",
        write.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      this.requireBoard(boardId);
      const reasonText = write.reason?.trim();
      if (!reasonText) {
        throw new GoalBoardV1Error("risk.reason_required", "更新 Risk 时必须说明原因");
      }
      const riskId = input.risk_id.trim();
      const previous = this.store.db
        .prepare("SELECT * FROM risks WHERE risk_id = ? AND board_id = ?")
        .get(riskId, boardId) as Row | undefined;
      if (!previous) throw new GoalBoardV1Error("risk.not_found", `Risk 不存在: ${riskId}`);
      const facts = this.normalizeRiskFacts(boardId, input);
      const previousGoalIds = (this.store.db
        .prepare("SELECT goal_id FROM goal_risks WHERE risk_id = ? ORDER BY goal_id")
        .all(riskId) as Row[]).map((item) => asText(item.goal_id));
      const state = asText(previous.state) as RiskRecord["state"];
      const now = this.clock().toISOString();
      this.store.db
        .prepare(`
          UPDATE risks SET
            description = ?, probability = ?, impact = ?, affected_surfaces_json = ?,
            trigger = ?, treatment = ?, treatment_plan = ?, blocking_mode = ?, revisit_condition = ?, owner = ?, updated_at = ?
          WHERE risk_id = ? AND board_id = ?
        `)
        .run(
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
      this.store.db.prepare("DELETE FROM goal_risks WHERE risk_id = ?").run(riskId);
      const link = this.store.db.prepare("INSERT INTO goal_risks (goal_id, risk_id) VALUES (?, ?)");
      for (const goalId of facts.goal_ids) link.run(goalId, riskId);

      const wasInvalidating = asText(previous.blocking_mode) === "invalidate_on_trigger" && state === "triggered";
      const isInvalidating = facts.blocking_mode === "invalidate_on_trigger" && state === "triggered";
      const nextInvalidated = new Set(isInvalidating ? facts.goal_ids : []);
      if (wasInvalidating) {
        for (const goalId of previousGoalIds.filter((item) => !nextInvalidated.has(item))) {
          this.store.db
            .prepare("UPDATE goals SET validity_state = 'needs_revalidation', updated_at = ? WHERE goal_id = ?")
            .run(now, goalId);
        }
      }
      if (isInvalidating) {
        for (const goalId of facts.goal_ids) {
          this.store.db
            .prepare("UPDATE goals SET validity_state = 'invalidated', updated_at = ? WHERE goal_id = ?")
            .run(now, goalId);
        }
      }

      const cursor = this.store.appendEvent({
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
          previous_blocking_mode: asText(previous.blocking_mode),
          blocking_mode: facts.blocking_mode,
          state,
        },
        at: now,
      });
      const risk = this.readRisk(boardId, riskId);
      const outcome = { risk, observed_event_cursor: cursor };
      this.remember(boardId, write.actor_id, "update_risk", write.idempotency_key, hash, outcome, now);
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
      if (!RISK_STATES.has(input.state)) {
        throw new GoalBoardV1Error("risk.state_invalid", "Risk 状态必须是开放、已触发、已解决、已接受或已过期");
      }
      const reasonText = input.reason.trim();
      if (!reasonText) {
        throw new GoalBoardV1Error("risk.reason_required", "变更 Risk 状态时必须说明原因");
      }
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
        const previousState = asText(row.state) as RiskRecord["state"];
        const validity = input.state === "triggered"
          ? "invalidated"
          : previousState === "triggered"
            ? "needs_revalidation"
            : null;
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
        reason: reasonText,
        payload: {
          previous_state: asText(row.state),
          state: input.state,
          blocking_mode: asText(row.blocking_mode),
          linked_goal_ids: linkedGoals.map((item) => asText(item.goal_id)),
        },
        at: now,
      });
      const risk = this.readRisk(boardId, input.risk_id);
      const outcome = { risk, observed_event_cursor: cursor };
      this.remember(boardId, write.actor_id, "set_risk_state", write.idempotency_key, hash, outcome, now);
      return { ...outcome, replayed: false };
    });
  }

  private normalizeRiskFacts(
    boardId: string,
    input: Omit<RiskFactsInput, "risk_id">,
  ): Omit<RiskFactsInput, "risk_id" | "affected_surfaces"> & { affected_surfaces: string[] } {
    const goalIds = unique(input.goal_ids.map((item) => item.trim()).filter(Boolean));
    const description = input.description.trim();
    const probability = input.probability.trim();
    const impact = input.impact.trim();
    const affectedSurfaces = unique((input.affected_surfaces ?? []).map((item) => item.trim()).filter(Boolean));
    const trigger = input.trigger.trim();
    const treatmentPlan = input.treatment_plan?.trim() ?? "";
    const revisitCondition = input.revisit_condition.trim();
    const owner = input.owner.trim();
    if (!goalIds.length) {
      throw new GoalBoardV1Error("risk.goal_required", "Risk 必须关联至少一个 Goal");
    }
    if (!description || !probability || !impact || !trigger || !revisitCondition || !owner) {
      throw new GoalBoardV1Error(
        "risk.required_field_missing",
        "Risk 必须说明描述、概率、影响、触发条件、复查条件和负责人",
      );
    }
    if (!RISK_TREATMENTS.has(input.treatment)) {
      throw new GoalBoardV1Error("risk.treatment_invalid", "Risk 处理方式无效");
    }
    if (!RISK_BLOCKING_MODES.has(input.blocking_mode)) {
      throw new GoalBoardV1Error("risk.blocking_mode_invalid", "Risk 阻塞方式无效");
    }
    for (const goalId of goalIds) this.requireGoalOnBoard(boardId, goalId);
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

  private clearActiveGoalIfMatches(boardId: string, goalId: string, at: string): boolean {
    return this.store.db
      .prepare(`
        UPDATE boards
        SET active_goal_id = NULL, updated_at = ?
        WHERE board_id = ? AND active_goal_id = ?
      `)
      .run(at, boardId, goalId).changes > 0;
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
      if (goal.trashed_at) {
        throw new GoalBoardV1Error("goal.trashed", "回收站中的 Goal 需要先恢复，才能设为当前产品目标");
      }
      if (goal.archived_at) {
        throw new GoalBoardV1Error("goal.archived", "已归档 Goal 需要先恢复，才能设为当前产品目标");
      }
      if (goal.fulfillment_state === "satisfied") {
        throw new GoalBoardV1Error("goal.already_satisfied", "已完成的 Goal 不能成为当前进行中的 Goal");
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
      if (goal.trashed_at) {
        throw new GoalBoardV1Error("goal.trashed", "回收站中的 Goal 需要先恢复，才能变更归档状态");
      }
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
      const activeGoalCleared = input.archived
        ? this.clearActiveGoalIfMatches(boardId, input.goal_id, now)
        : false;
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

  /**
   * The one recoverable-deletion domain operation. UI and MCP adapters may
   * each verify user intent, but both must call this transition instead of
   * maintaining their own Relation or active-work behavior.
   */
  setGoalTrashed(
    boardId: string,
    input: { goal_id: string; trashed: boolean; reason: string },
    write: ActorWrite,
  ): GoalTrashResult & { replayed: boolean; observed_event_cursor: number } {
    const reasonText = input.reason.trim();
    if (!reasonText) {
      throw new GoalBoardV1Error("goal.trash_reason_required", "移入或恢复回收站时必须说明原因");
    }
    const hash = requestHash({ board_id: boardId, ...input, reason: reasonText });
    return this.store.immediate(() => {
      const replay = this.replay<GoalTrashResult & { observed_event_cursor: number }>(
        boardId,
        write.actor_id,
        "set_goal_trashed",
        write.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };

      const goal = this.requireGoalOnBoard(boardId, input.goal_id);
      const emptyResult = (status: GoalTrashResult["status"]): GoalTrashResult => ({
        status,
        goal,
        active_goal_cleared: false,
        deactivated_relation_ids: [],
        restored_relation_ids: [],
        pending_relation_ids: [],
        blocking_claim_ids: [],
        blocking_run_ids: [],
      });

      if (input.trashed && goal.trashed_at) {
        const outcome = { ...emptyResult("already_trashed"), observed_event_cursor: this.store.eventCursor(boardId) };
        this.remember(boardId, write.actor_id, "set_goal_trashed", write.idempotency_key, hash, outcome, this.clock().toISOString());
        return { ...outcome, replayed: false };
      }
      if (!input.trashed && !goal.trashed_at) {
        const outcome = { ...emptyResult("already_active"), observed_event_cursor: this.store.eventCursor(boardId) };
        this.remember(boardId, write.actor_id, "set_goal_trashed", write.idempotency_key, hash, outcome, this.clock().toISOString());
        return { ...outcome, replayed: false };
      }

      const now = this.clock().toISOString();
      if (input.trashed) {
        const blockingClaimRows = this.store.db
          .prepare(`
            SELECT claim_id FROM claims
            WHERE board_id = ? AND goal_id = ? AND state = 'active' AND expires_at > ?
            ORDER BY claim_id
          `)
          .all(boardId, input.goal_id, now) as Row[];
        const blockingRunRows = this.store.db
          .prepare(`
            SELECT run_id FROM runs
            WHERE board_id = ? AND goal_id = ? AND state IN ('started', 'blocked')
            ORDER BY run_id
          `)
          .all(boardId, input.goal_id) as Row[];
        if (blockingClaimRows.length > 0 || blockingRunRows.length > 0) {
          const outcome = {
            ...emptyResult("blocked"),
            blocking_claim_ids: blockingClaimRows.map((row) => asText(row.claim_id)),
            blocking_run_ids: blockingRunRows.map((row) => asText(row.run_id)),
            observed_event_cursor: this.store.eventCursor(boardId),
          };
          this.remember(boardId, write.actor_id, "set_goal_trashed", write.idempotency_key, hash, outcome, now);
          return { ...outcome, replayed: false };
        }

        const activeRelations = this.store.db
          .prepare(`
            SELECT relation_id FROM goal_relations
            WHERE board_id = ? AND state = 'active'
              AND (from_goal_id = ? OR to_goal_id = ?)
            ORDER BY relation_id
          `)
          .all(boardId, input.goal_id, input.goal_id) as Row[];
        const trashRecordId = `trash-${randomUUID()}`;
        this.store.db
          .prepare(`
            INSERT INTO goal_trash_records (
              trash_record_id, board_id, goal_id, trashed_at, trashed_by, trash_reason,
              restored_at, restored_by, restore_reason
            ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
          `)
          .run(trashRecordId, boardId, input.goal_id, now, write.actor_id, reasonText);
        this.store.db
          .prepare(`
            UPDATE goals
            SET trashed_at = ?, trashed_by = ?, updated_at = ?
            WHERE board_id = ? AND goal_id = ?
          `)
          .run(now, write.actor_id, now, boardId, input.goal_id);

        const deactivatedRelationIds: string[] = [];
        for (const relation of activeRelations) {
          const relationId = asText(relation.relation_id);
          this.store.db
            .prepare("UPDATE goal_relations SET state = 'inactive', deactivated_at = ? WHERE relation_id = ?")
            .run(now, relationId);
          this.store.db
            .prepare(`
              INSERT INTO goal_trash_relation_records (
                trash_record_id, relation_id, prior_state, deactivated_at, restored_at
              ) VALUES (?, ?, 'active', ?, NULL)
            `)
            .run(trashRecordId, relationId, now);
          deactivatedRelationIds.push(relationId);
        }

        const activeGoalCleared = this.clearActiveGoalIfMatches(boardId, input.goal_id, now);
        const cursor = this.store.appendEvent({
          eventId: randomUUID(),
          boardId,
          actorId: write.actor_id,
          type: "goal.trashed",
          objectType: "goal",
          objectId: input.goal_id,
          reason: reasonText,
          payload: {
            trash_record_id: trashRecordId,
            deactivated_relation_ids: deactivatedRelationIds,
            active_goal_cleared: activeGoalCleared,
          },
          at: now,
        });
        const outcome = {
          status: "trashed" as const,
          goal: this.requireGoalOnBoard(boardId, input.goal_id),
          active_goal_cleared: activeGoalCleared,
          deactivated_relation_ids: deactivatedRelationIds,
          restored_relation_ids: [],
          pending_relation_ids: [],
          blocking_claim_ids: [],
          blocking_run_ids: [],
          observed_event_cursor: cursor,
        };
        this.remember(boardId, write.actor_id, "set_goal_trashed", write.idempotency_key, hash, outcome, now);
        return { ...outcome, replayed: false };
      }

      const trashRecord = this.store.db
        .prepare(`
          SELECT trash_record_id FROM goal_trash_records
          WHERE board_id = ? AND goal_id = ? AND restored_at IS NULL
          ORDER BY trashed_at DESC, trash_record_id DESC LIMIT 1
        `)
        .get(boardId, input.goal_id) as Row | undefined;
      if (!trashRecord) {
        throw new GoalBoardV1Error("goal.trash_record_missing", "回收站 Goal 缺少可恢复的删除记录");
      }
      this.store.db
        .prepare(`
          UPDATE goals
          SET trashed_at = NULL, trashed_by = NULL, updated_at = ?
          WHERE board_id = ? AND goal_id = ?
        `)
        .run(now, boardId, input.goal_id);
      this.store.db
        .prepare(`
          UPDATE goal_trash_records
          SET restored_at = ?, restored_by = ?, restore_reason = ?
          WHERE trash_record_id = ?
        `)
        .run(now, write.actor_id, reasonText, asText(trashRecord.trash_record_id));

      const recoverableRelations = this.store.db
        .prepare(`
          SELECT DISTINCT relation.relation_id, relation.from_goal_id, relation.to_goal_id
          FROM goal_relations relation
          JOIN goal_trash_relation_records record ON record.relation_id = relation.relation_id
          WHERE relation.board_id = ?
            AND (relation.from_goal_id = ? OR relation.to_goal_id = ?)
            AND relation.state = 'inactive'
            AND record.prior_state = 'active'
            AND record.restored_at IS NULL
          ORDER BY relation.relation_id
        `)
        .all(boardId, input.goal_id, input.goal_id) as Row[];
      const restoredRelationIds: string[] = [];
      const pendingRelationIds: string[] = [];
      const restoredPartOfChildIds: string[] = [];
      for (const relation of recoverableRelations) {
        const relationId = asText(relation.relation_id);
        const availableEndpoints = this.store.db
          .prepare(`
            SELECT goal_id FROM goals
            WHERE board_id = ? AND goal_id IN (?, ?) AND trashed_at IS NULL
          `)
          .all(boardId, asText(relation.from_goal_id), asText(relation.to_goal_id)) as Row[];
        if (availableEndpoints.length !== 2) {
          pendingRelationIds.push(relationId);
          continue;
        }
        this.store.db
          .prepare("UPDATE goal_relations SET state = 'active', deactivated_at = NULL WHERE relation_id = ?")
          .run(relationId);
        this.store.db
          .prepare("UPDATE goal_trash_relation_records SET restored_at = ? WHERE relation_id = ? AND restored_at IS NULL")
          .run(now, relationId);
        restoredRelationIds.push(relationId);
        const type = this.store.db
          .prepare("SELECT type, from_goal_id FROM goal_relations WHERE relation_id = ?")
          .get(relationId) as Row;
        if (asText(type.type) === "part_of") restoredPartOfChildIds.push(asText(type.from_goal_id));
      }
      for (const childGoalId of restoredPartOfChildIds) {
        this.reconcileCompoundAncestors(boardId, childGoalId, write.actor_id, now);
      }
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId: write.actor_id,
        type: "goal.restored_from_trash",
        objectType: "goal",
        objectId: input.goal_id,
        reason: reasonText,
        payload: {
          trash_record_id: asText(trashRecord.trash_record_id),
          restored_relation_ids: restoredRelationIds,
          pending_relation_ids: pendingRelationIds,
        },
        at: now,
      });
      const outcome = {
        status: "restored" as const,
        goal: this.requireGoalOnBoard(boardId, input.goal_id),
        active_goal_cleared: false,
        deactivated_relation_ids: [],
        restored_relation_ids: restoredRelationIds,
        pending_relation_ids: pendingRelationIds,
        blocking_claim_ids: [],
        blocking_run_ids: [],
        observed_event_cursor: cursor,
      };
      this.remember(boardId, write.actor_id, "set_goal_trashed", write.idempotency_key, hash, outcome, now);
      return { ...outcome, replayed: false };
    });
  }

  /** A dedicated read path for a later trash UI/MCP; ordinary work lists exclude these Goals. */
  listTrashedGoals(boardId: string): GoalRecord[] {
    this.requireBoard(boardId);
    return this.store.listTrashedGoals(boardId);
  }

  effectivePlanningMethods(boardId: string): PlanningMethodPack[] {
    this.requireBoard(boardId);
    return resolvePlanningMethodPacks(
      this.personalPlanningMethodPacks,
      this.store.listPlanningMethodPacks(boardId),
    );
  }

  projectPlanningComposition(boardId: string): PlanningMethodComposition {
    return composePlanningMethodPacks(
      this.effectivePlanningMethods(boardId)
        .filter((method) => method.scope === "project" && method.enabled),
    );
  }

  saveProjectPlanningMethod(input: {
    board_id: string;
    method: PlanningMethodPackInput;
    actor_id: string;
    user_confirmed: boolean;
  }): { method: PlanningMethodPack; observed_event_cursor: number } {
    this.requireBoard(input.board_id);
    if (input.user_confirmed !== true) {
      throw new GoalBoardV1Error(
        "planning.user_confirmation_required",
        "项目方法会改变后续 Goal 的拆分和依赖判断，必须由用户确认",
      );
    }
    const current = this.store.listPlanningMethodPacks(input.board_id)
      .find((pack) => pack.method_id === input.method.method_id) ?? null;
    const at = this.clock().toISOString();
    const method = normalizePlanningMethodPack(input.method, "project", current, at);
    return this.store.immediate(() => {
      this.store.putPlanningMethodPack(input.board_id, method);
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId: input.actor_id,
        type: "planning.method_saved",
        objectType: "planning_method",
        objectId: method.method_id,
        reason: `更新项目规划方法：${method.name}`,
        payload: { method_id: method.method_id, version: method.version, enabled: method.enabled },
        at,
      });
      return { method, observed_event_cursor: cursor };
    });
  }

  analyzePlanningChange(input: { board_id: string; changed_goal_ids: string[] }): GoalChangeImpact {
    this.requireBoard(input.board_id);
    const snapshot = this.store.snapshot(input.board_id);
    for (const goalId of input.changed_goal_ids) this.requireGoalOnBoard(input.board_id, goalId);
    return analyzeGoalChangeImpact(snapshot.goals, snapshot.relations, input.changed_goal_ids);
  }

  validatePlanningGraph(boardId: string): { issues: PlanningGraphIssue[]; observed_event_cursor: number } {
    this.requireBoard(boardId);
    const snapshot = this.store.snapshot(boardId);
    return { issues: validatePlanningGraph(snapshot.goals, snapshot.relations), observed_event_cursor: snapshot.cursor };
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

  /**
   * Returns every action this Runtime may take now. Unlike the legacy
   * role-scoped `queryReady`, this is the Runtime's menu, not a dispatcher.
   */
  queryAvailable(input: AvailableQuery): AvailableQueryResult {
    this.requireBoard(input.board_id);
    const now = this.clock().toISOString();
    const snapshot = this.store.snapshot(input.board_id);
    const metrics = planningMetrics(snapshot.goals, snapshot.relations);
    const available: AvailableGoal[] = [];
    const blocked: BlockedAvailableGoal[] = [];
    for (const goal of snapshot.goals) {
      const workState = this.deriveGoalWorkState(input.board_id, goal, snapshot, now);
      if (
        workState.work_state === "completion_blocked" ||
        workState.work_state === "waiting_for_human"
      ) {
        blocked.push({
          goal,
          work_state: workState.work_state,
          next_action: null,
          reasons: workState.reasons,
          priority_hint: goal.priority,
          risk_summary: this.riskSummary(goal.goal_id),
        });
      }
      const requiresParentConfirmation =
        workState.work_state === "clarification_pending" &&
        requiresParentCompletionConfirmation(goal, snapshot);
      for (const action of this.availableActions(goal, snapshot, workState)) {
        const evaluation = this.evaluate({
          boardId: input.board_id,
          goalId: goal.goal_id,
          actorId: input.actor_id,
          role: action.role ?? "executor",
          capabilities: input.capabilities ?? [],
          goalModeAttestation: input.goal_mode_attestation ?? false,
          now,
        });
        if (evaluation.reasons.length > 0 || !evaluation.goal) continue;
        available.push({
          goal: evaluation.goal,
          role: action.role,
          work_state: workState.work_state,
          next_action: action.next_action,
          review_obligation_id: action.review_obligation_id,
          requires_parent_confirmation: requiresParentConfirmation,
          why_now: requiresParentConfirmation
            ? "现有子 Goal 都已完成，但父 Goal 的拆分还没有确认结束；先和用户确认是否已经覆盖整个父目标，再决定收口或继续补充子 Goal"
            : this.workActionMessage(action.next_action),
          priority_hint: evaluation.goal.priority,
          dependency_summary: this.dependencySummary(input.board_id, goal.goal_id),
          risk_summary: this.riskSummary(goal.goal_id),
          resolved_policy: evaluation.policy,
          relevant_surfaces: evaluation.surfaces,
          planning: {
            topological_level: metrics.get(goal.goal_id)?.topological_level ?? 0,
            unlock_count: metrics.get(goal.goal_id)?.unlock_count ?? 0,
            longest_downstream_chain: metrics.get(goal.goal_id)?.longest_downstream_chain ?? 0,
            rationale: this.planningRationale(metrics.get(goal.goal_id)),
          },
        });
      }
    }
    available.sort(
      (left, right) =>
        Number(right.requires_parent_confirmation) - Number(left.requires_parent_confirmation) ||
        right.planning.unlock_count - left.planning.unlock_count ||
        right.planning.longest_downstream_chain - left.planning.longest_downstream_chain ||
        left.planning.topological_level - right.planning.topological_level ||
        right.priority_hint - left.priority_hint ||
        left.goal.goal_id.localeCompare(right.goal.goal_id) ||
        (left.role ?? "").localeCompare(right.role ?? ""),
    );
    blocked.sort(
      (left, right) =>
        right.priority_hint - left.priority_hint || left.goal.goal_id.localeCompare(right.goal.goal_id),
    );
    return {
      observed_event_cursor: snapshot.cursor,
      available,
      blocked,
      parallel_suggestion: this.parallelExecutionSuggestion(available),
    };
  }

  /** Read the canonical work state that Web, MCP and CLI should present. */
  getGoalWorkState(input: { board_id: string; goal_id: string }): GoalWorkStateView {
    this.requireBoard(input.board_id);
    const snapshot = this.store.snapshot(input.board_id);
    const goal = snapshot.goals.find((item) => item.goal_id === input.goal_id);
    if (!goal) throw new GoalBoardV1Error("goal.not_found", `找不到这个 Goal: ${input.goal_id}`);
    return this.deriveGoalWorkState(input.board_id, goal, snapshot, this.clock().toISOString());
  }

  /**
   * Read every canonical Goal work state from one Board snapshot. Web surfaces
   * need the whole navigator, so repeating `getGoalWorkState` would otherwise
   * reload the same Board once per Goal.
   */
  getGoalWorkStates(input: { board_id: string; snapshot?: BoardSnapshot }): GoalWorkStateView[] {
    this.requireBoard(input.board_id);
    const snapshot = input.snapshot ?? this.store.snapshot(input.board_id);
    if (snapshot.board.board_id !== input.board_id) {
      throw new GoalBoardV1Error("board.snapshot_mismatch", "BoardSnapshot 不属于请求的 Board");
    }
    const now = this.clock().toISOString();
    return snapshot.goals.map((goal) =>
      this.deriveGoalWorkState(input.board_id, goal, snapshot, now),
    );
  }

  /** Read the canonical effective policy without running a full readiness evaluation. */
  getResolvedGoalPolicy(input: { board_id: string; goal_id: string }): GoalPolicy {
    this.requireBoard(input.board_id);
    this.requireGoalOnBoard(input.board_id, input.goal_id);
    return this.resolvePolicy(input.board_id, input.goal_id);
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
    const workState = this.getGoalWorkState({ board_id: input.board_id, goal_id: input.goal_id });
    const completionReasons = role === "executor"
      ? this.executorHandoffReasons(workState)
      : workState.work_state === "waiting_for_human" &&
          (role === "self_verifier" || role === "cross_reviewer" || role === "adversarial_reviewer")
        ? workState.reasons
        : [];
    const reasons = [...evaluation.reasons, ...completionReasons]
      .filter(
        (item, index, items) =>
          items.findIndex(
            (candidate) =>
              candidate.code === item.code &&
              candidate.subject_type === item.subject_type &&
              candidate.subject_id === item.subject_id,
          ) === index,
      )
      .sort(compareReasons);
    return {
      goal: evaluation.goal,
      role,
      ready: reasons.length === 0 && evaluation.goal !== null,
      observed_event_cursor: this.store.eventCursor(input.board_id),
      reasons,
      resolved_policy: evaluation.policy,
      relevant_surfaces: evaluation.surfaces,
    };
  }

  readGoalContract(boardId: string, goalId: string): GoalContractView {
    this.requireBoard(boardId);
    const snapshot = this.store.snapshot(boardId);
    const goal = snapshot.goals.find((item) => item.goal_id === goalId);
    if (!goal) throw new GoalBoardV1Error("goal.not_found", `找不到这个 Goal: ${goalId}`);
    const now = this.clock().toISOString();
    const expiredClaims = new Map(
      snapshot.claims
        .filter((item) => item.goal_id === goalId && item.state === "active" && item.expires_at <= now)
        .map((item) => [item.claim_id, item]),
    );
    const claims = snapshot.claims
      .filter((item) => item.goal_id === goalId)
      .map((item) => expiredClaims.has(item.claim_id)
        ? {
            ...item,
            state: "expired" as const,
            released_at: item.expires_at,
            release_reason: "领取租约已到期",
          }
        : item);
    const runs = snapshot.runs
      .filter((item) => item.goal_id === goalId)
      .map((item) => {
        const expiredClaim = expiredClaims.get(item.claim_id);
        if (!expiredClaim || !["started", "blocked"].includes(item.state)) return item;
        return {
          ...item,
          state: "abandoned" as const,
          block_reason: "领取租约已到期，当前 Run 自动中断",
          ended_at: expiredClaim.expires_at,
        };
      });
    const runIds = new Set(runs.map((item) => item.run_id));
    const candidates = snapshot.candidates.filter(
      (item) => item.discovered_in_run_id != null && runIds.has(item.discovered_in_run_id),
    );
    const candidateIds = new Set(candidates.map((item) => item.candidate_id));
    const clarificationSessions = snapshot.clarification_sessions.filter((item) => item.goal_id === goalId);
    const clarificationSessionIds = new Set(clarificationSessions.map((item) => item.session_id));
    const goalTreeProposals = this.listGoalTreeProposals({ board_id: boardId, root_goal_id: goalId }).proposals;
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
      work_state: this.deriveGoalWorkState(boardId, goal, snapshot, now),
      relations: snapshot.relations.filter(
        (item) => item.from_goal_id === goalId || item.to_goal_id === goalId,
      ),
      impacts: snapshot.impacts.filter((item) => item.goal_id === goalId),
      risks: snapshot.risks.filter((item) => riskIds.has(item.risk_id)),
      resolved_policy: this.resolvePolicy(boardId, goalId),
      claims,
      runs,
      evidence: snapshot.evidence.filter((item) => item.goal_id === goalId),
      evidence_corrections: snapshot.evidence_corrections.filter((item) => item.goal_id === goalId),
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
      clarification_sessions: clarificationSessions,
      clarification_turns: snapshot.clarification_turns.filter((item) =>
        clarificationSessionIds.has(item.session_id),
      ),
      goal_tree_proposals: goalTreeProposals,
    };
  }

  /**
   * The Runtime-facing entry point for clarification. With no goal_id it
   * creates the smallest possible Draft and clarifier Claim/Run. For an
   * existing clarification-eligible Goal it keeps that Goal and reuses a
   * clarifier Run already selected by the same Runtime when present.
   */
  startDraftDialogue(
    input: DraftDialogueStartInput,
  ): DraftDialogueView & { replayed: boolean } {
    const roughIdea = requiredDialogueText(input.rough_idea, "draft_dialogue.rough_idea_required", "请先记录用户的粗略想法");
    const actorId = requiredDialogueText(input.actor_id, "draft_dialogue.actor_required", "澄清需要当前 Runtime 的 actor_id");
    const goalId = input.goal_id?.trim() || `draft-${randomUUID()}`;
    const title = (input.draft_title?.trim() || draftTitleFromIdea(roughIdea)).trim();
    const hash = requestHash({
      board_id: input.board_id,
      actor_id: actorId,
      rough_idea: roughIdea,
      draft_title: title,
      goal_id: input.goal_id?.trim() || null,
      capabilities: input.capabilities ?? [],
      goal_mode_attestation: input.goal_mode_attestation ?? false,
      lease_seconds: input.lease_seconds ?? null,
    });
    return this.store.immediate(() => {
      const replay = this.replay<DraftDialogueView>(
        input.board_id,
        actorId,
        "draft_dialogue_start",
        input.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };

      this.requireBoard(input.board_id);
      const existingGoal = input.goal_id?.trim()
        ? this.store.snapshot(input.board_id).goals.find((goal) => goal.goal_id === goalId) ?? null
        : null;
      if (existingGoal && !this.goalNeedsClarification(existingGoal)) {
        throw new GoalBoardV1Error(
          "draft_dialogue.goal_not_clarifiable",
          "只能为仍待澄清的 Goal 开始自然语言对话",
        );
      }
      if (
        existingGoal &&
        this.store.snapshot(input.board_id).clarification_sessions.some(
          (session) => session.goal_id === existingGoal.goal_id && session.state !== "closed",
        )
      ) {
        throw new GoalBoardV1Error(
          "draft_dialogue.already_open",
          "这条 Goal 已有可恢复的澄清对话；请使用 draft_dialogue_resume 而不是创建第二份会话",
        );
      }
      const goal = existingGoal ?? this.createGoal(
        input.board_id,
        {
          goal_id: goalId,
          title,
          outcome: "",
          why: "",
          business_logic: "",
          definition_state: "draft",
          decomposition_state: "abstract",
          acceptance_criteria: [],
        },
        {
          actor_id: actorId,
          idempotency_key: `draft-dialogue-goal:${input.idempotency_key}`,
          reason: "用户在当前 Runtime 中提交了粗略想法，开始自然语言澄清",
        },
      ).goal;
      const currentWorkState = this.getGoalWorkState({
        board_id: input.board_id,
        goal_id: goal.goal_id,
      });
      let claim = currentWorkState.active_claim;
      let run = currentWorkState.active_run;
      if (run) {
        if (run.role !== "clarifier" || run.actor_id !== actorId) {
          throw new GoalBoardV1Error(
            "draft_dialogue.active_elsewhere",
            "这条 Goal 正由另一个 Runtime 推进，不能静默接管其工作",
          );
        }
      } else {
        const selected = this.selectGoalAndStart({
          board_id: input.board_id,
          goal_id: goal.goal_id,
          actor_id: actorId,
          role: "clarifier",
          capabilities: input.capabilities ?? [],
          goal_mode_attestation: input.goal_mode_attestation ?? false,
          lease_seconds: input.lease_seconds,
          idempotency_key: `draft-dialogue-run:${input.idempotency_key}`,
        });
        if (!selected.allowed || !selected.claim || !selected.run) {
          throw new GoalBoardV1Error(
            "draft_dialogue.claim_denied",
            selected.reasons.map((item) => item.message).join("；") || "当前 Goal 暂时不能进入澄清",
          );
        }
        claim = selected.claim;
        run = selected.run;
      }
      if (!claim || !run) {
        throw new GoalBoardV1Error(
          "draft_dialogue.claim_denied",
          "当前 Goal 的澄清工作缺少有效 Claim 或 Run",
        );
      }

      const now = this.clock().toISOString();
      const sessionId = `clarification-session-${randomUUID()}`;
      const initialTurnId = `clarification-turn-${randomUUID()}`;
      this.store.db
        .prepare(`
          INSERT INTO clarification_sessions (
            session_id, board_id, goal_id, claim_id, run_id, rough_idea, state,
            current_understanding, next_question, proposal_summary, created_by,
            created_at, updated_at, closed_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'clarifying', NULL, NULL, NULL, ?, ?, ?, NULL)
        `)
        .run(
          sessionId,
          input.board_id,
          goal.goal_id,
          claim.claim_id,
          run.run_id,
          roughIdea,
          actorId,
          now,
          now,
        );
      this.store.db
        .prepare(`
          INSERT INTO clarification_turns (
            turn_id, session_id, board_id, goal_id, run_id, actor_id, turn_index,
            turn_kind, user_message, current_understanding, known_facts_json,
            assumptions_json, next_question, proposal_summary, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 1, 'rough_idea', ?, NULL, '[]', '[]', NULL, NULL, ?)
        `)
        .run(
          initialTurnId,
          sessionId,
          input.board_id,
          goal.goal_id,
          run.run_id,
          actorId,
          roughIdea,
          now,
        );
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId,
        type: "clarification.started",
        objectType: "clarification_session",
        objectId: sessionId,
        reason: existingGoal
          ? "当前 Runtime 为已有待澄清 Goal 开始自然语言澄清"
          : "当前 Runtime 根据用户粗略想法创建 Draft 并开始澄清",
        payload: {
          goal_id: goal.goal_id,
          claim_id: claim.claim_id,
          run_id: run.run_id,
          initial_turn_id: initialTurnId,
          created_draft: !existingGoal,
        },
        at: now,
      });
      const outcome = this.readDraftDialogueView(input.board_id, goal.goal_id, sessionId, cursor);
      this.remember(
        input.board_id,
        actorId,
        "draft_dialogue_start",
        input.idempotency_key,
        hash,
        outcome,
        now,
      );
      return { ...outcome, replayed: false };
    });
  }

  /** Persist one material user answer and the Runtime's non-canonical reading of it. */
  recordDraftDialogueTurn(
    input: DraftDialogueTurnInput,
  ): DraftDialogueView & { replayed: boolean } {
    const actorId = requiredDialogueText(input.actor_id, "draft_dialogue.actor_required", "澄清需要当前 Runtime 的 actor_id");
    const userMessage = requiredDialogueText(input.user_message, "draft_dialogue.user_message_required", "需要记录用户本轮回答");
    const understanding = requiredDialogueText(
      input.current_understanding,
      "draft_dialogue.understanding_required",
      "Runtime 必须先用人话写下当前理解",
    );
    const nextQuestion = nullableDialogueText(input.next_question);
    const proposalSummary = nullableDialogueText(input.proposal_summary);
    if (nextQuestion && proposalSummary) {
      throw new GoalBoardV1Error(
        "draft_dialogue.next_step_ambiguous",
        "一轮澄清只能继续提出一个关键问题，或标记为准备提交提案，不能同时做两件事",
      );
    }
    if (!nextQuestion && !proposalSummary) {
      throw new GoalBoardV1Error(
        "draft_dialogue.next_step_required",
        "没有关键未知项时请写入待确认提案摘要；否则只提出一个真正影响结果的问题",
      );
    }
    const hash = requestHash({
      board_id: input.board_id,
      goal_id: input.goal_id,
      run_id: input.run_id,
      actor_id: actorId,
      user_message: userMessage,
      current_understanding: understanding,
      known_facts: input.known_facts ?? [],
      assumptions: input.assumptions ?? [],
      next_question: nextQuestion,
      proposal_summary: proposalSummary,
    });
    return this.store.immediate(() => {
      const replay = this.replay<DraftDialogueView>(
        input.board_id,
        actorId,
        "draft_dialogue_turn",
        input.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };

      const active = this.requireActiveClarificationRun(input.board_id, input.goal_id, input.run_id, actorId);
      const session = this.requireOpenClarificationSession(input.board_id, input.goal_id);
      const now = this.clock().toISOString();
      const turnId = `clarification-turn-${randomUUID()}`;
      const knownFacts = normalizeClarificationFacts(input.known_facts ?? [], turnId);
      const assumptions = normalizeClarificationAssumptions(input.assumptions ?? [], turnId);
      const turnIndex = Number(
        (this.store.db
          .prepare("SELECT COALESCE(MAX(turn_index), 0) AS current_turn_index FROM clarification_turns WHERE session_id = ?")
          .get(session.session_id) as Row).current_turn_index ?? 0,
      ) + 1;
      const state = proposalSummary ? "proposal_ready" : "clarifying";
      this.store.db
        .prepare(`
          INSERT INTO clarification_turns (
            turn_id, session_id, board_id, goal_id, run_id, actor_id, turn_index,
            turn_kind, user_message, current_understanding, known_facts_json,
            assumptions_json, next_question, proposal_summary, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'user_answer', ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          turnId,
          session.session_id,
          input.board_id,
          input.goal_id,
          input.run_id,
          actorId,
          turnIndex,
          userMessage,
          understanding,
          sqliteJson(knownFacts),
          sqliteJson(assumptions),
          nextQuestion,
          proposalSummary,
          now,
        );
      this.store.db
        .prepare(`
          UPDATE clarification_sessions
          SET claim_id = ?, run_id = ?, state = ?, current_understanding = ?,
              next_question = ?, proposal_summary = ?, updated_at = ?
          WHERE session_id = ?
        `)
        .run(
          active.claim_id,
          input.run_id,
          state,
          understanding,
          nextQuestion,
          proposalSummary,
          now,
          session.session_id,
        );
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId,
        type: "clarification.turn_recorded",
        objectType: "clarification_turn",
        objectId: turnId,
        reason: proposalSummary
          ? "当前 Runtime 已记录用户回答并准备提交待确认 Goal Tree 提案"
          : "当前 Runtime 已记录用户回答，并提出下一个关键问题",
        payload: {
          session_id: session.session_id,
          goal_id: input.goal_id,
          run_id: input.run_id,
          turn_index: turnIndex,
          state,
          known_fact_count: knownFacts.length,
          assumption_count: assumptions.length,
          next_question: nextQuestion,
        },
        at: now,
      });
      const outcome = this.readDraftDialogueView(input.board_id, input.goal_id, session.session_id, cursor);
      this.remember(
        input.board_id,
        actorId,
        "draft_dialogue_turn",
        input.idempotency_key,
        hash,
        outcome,
        now,
      );
      return { ...outcome, replayed: false };
    });
  }

  /**
   * Reopen a persisted Goal clarification in the current Runtime. If the
   * earlier Run has ended, this atomically takes a new clarifier Claim/Run;
   * an active run held elsewhere remains a real blocker rather than being
   * silently stolen.
   */
  resumeDraftDialogue(
    input: DraftDialogueResumeInput,
  ): DraftDialogueView & { replayed: boolean } {
    const actorId = requiredDialogueText(input.actor_id, "draft_dialogue.actor_required", "澄清需要当前 Runtime 的 actor_id");
    const hash = requestHash({
      board_id: input.board_id,
      goal_id: input.goal_id,
      actor_id: actorId,
      capabilities: input.capabilities ?? [],
      goal_mode_attestation: input.goal_mode_attestation ?? false,
      lease_seconds: input.lease_seconds ?? null,
    });
    return this.store.immediate(() => {
      const replay = this.replay<DraftDialogueView>(
        input.board_id,
        actorId,
        "draft_dialogue_resume",
        input.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };

      const session = this.requireOpenClarificationSession(input.board_id, input.goal_id);
      const goal = this.requireGoalOnBoard(input.board_id, input.goal_id);
      if (!this.goalNeedsClarification(goal)) {
        throw new GoalBoardV1Error(
          "draft_dialogue.not_clarifiable",
          "只有仍待澄清的 Goal 可以恢复自然语言对话",
        );
      }
      const current = this.readDraftDialogueView(input.board_id, input.goal_id, session.session_id);
      if (current.run && current.run.role === "clarifier") {
        if (current.run.actor_id !== actorId) {
          throw new GoalBoardV1Error(
            "draft_dialogue.active_elsewhere",
            "这个 Goal 正由另一个 Runtime 澄清，不能静默抢占；请等待其释放或过期",
          );
        }
        const now = this.clock().toISOString();
        const outcome = this.readDraftDialogueView(input.board_id, input.goal_id, session.session_id);
        this.remember(
          input.board_id,
          actorId,
          "draft_dialogue_resume",
          input.idempotency_key,
          hash,
          outcome,
          now,
        );
        return { ...outcome, replayed: false };
      }

      const selected = this.selectGoalAndStart({
        board_id: input.board_id,
        goal_id: input.goal_id,
        actor_id: actorId,
        role: "clarifier",
        capabilities: input.capabilities ?? [],
        goal_mode_attestation: input.goal_mode_attestation ?? false,
        lease_seconds: input.lease_seconds,
        idempotency_key: `draft-dialogue-resume-run:${input.idempotency_key}`,
      });
      if (!selected.allowed || !selected.claim || !selected.run) {
        throw new GoalBoardV1Error(
          "draft_dialogue.resume_denied",
          selected.reasons.map((item) => item.message).join("；") || "当前 Goal 不能恢复澄清",
        );
      }
      const now = this.clock().toISOString();
      this.store.db
        .prepare(`
          UPDATE clarification_sessions
          SET claim_id = ?, run_id = ?, updated_at = ?
          WHERE session_id = ?
        `)
        .run(selected.claim.claim_id, selected.run.run_id, now, session.session_id);
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId,
        type: "clarification.resumed",
        objectType: "clarification_session",
        objectId: session.session_id,
        reason: "当前 Runtime 从持久化 Goal 澄清记录恢复工作",
        payload: { goal_id: input.goal_id, claim_id: selected.claim.claim_id, run_id: selected.run.run_id },
        at: now,
      });
      const outcome = this.readDraftDialogueView(input.board_id, input.goal_id, session.session_id, cursor);
      this.remember(
        input.board_id,
        actorId,
        "draft_dialogue_resume",
        input.idempotency_key,
        hash,
        outcome,
        now,
      );
      return { ...outcome, replayed: false };
    });
  }

  /**
   * Atomically records one whole, user-confirmable Goal Tree change set. This
   * is intentionally a proposal store: it never creates or edits canonical
   * Goals, relations, Risks, or Policy bindings.
   */
  submitGoalTreeProposal(
    input: GoalTreeProposalSubmitInput,
  ): { proposal: GoalTreeProposalRecord; replayed: boolean; observed_event_cursor: number } {
    const actorId = requiredDialogueText(
      input.actor_id,
      "goal_tree_proposal.actor_required",
      "提交 Goal Tree 提案需要当前 Runtime 的 actor_id",
    );
    const summary = requiredDialogueText(
      input.summary,
      "goal_tree_proposal.summary_required",
      "Goal Tree 提案需要面向用户的自然语言摘要",
    );
    const items = normalizeGoalTreeProposalItems(input.items);
    for (const [index, item] of items.entries()) {
      const issue = goalTreeProposalItemValidationIssues(item)[0];
      if (issue) {
        throw new GoalBoardV1Error(
          issue.code,
          `第 ${index + 1} 个条目中的风险「${goalTreeRiskDescription(item)}」不能提交：${issue.message}${issue.recovery}`,
        );
      }
    }
    const rootGoalId = input.root_goal_id?.trim() || null;
    const supersedesProposalId = input.supersedes_proposal_id?.trim() || null;
    const hash = requestHash({
      board_id: input.board_id,
      actor_id: actorId,
      discovered_in_run_id: input.discovered_in_run_id,
      root_goal_id: rootGoalId,
      summary,
      items: input.items,
      base_event_cursor: input.base_event_cursor ?? null,
      supersedes_proposal_id: supersedesProposalId,
    });
    return this.store.immediate(() => {
      const replay = this.replay<{ proposal: GoalTreeProposalRecord; observed_event_cursor: number }>(
        input.board_id,
        actorId,
        "submit_goal_tree_proposal",
        input.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };

      this.requireBoard(input.board_id);
      this.requireActiveClarificationProposalRun(input.board_id, input.discovered_in_run_id, actorId);
      const decompositionIssue = goalTreeProposalDecompositionIssues(
        items,
        this.store.snapshot(input.board_id),
        this.effectivePlanningMethods(input.board_id),
        this.projectPlanningComposition(input.board_id).method_pack_ids,
      )[0];
      if (decompositionIssue) {
        throw new GoalBoardV1Error(
          decompositionIssue.code,
          `${decompositionIssue.message}${decompositionIssue.recovery}`,
        );
      }
      const currentCursor = this.store.eventCursor(input.board_id);
      const baseEventCursor = input.base_event_cursor ?? currentCursor;
      if (!Number.isInteger(baseEventCursor) || baseEventCursor < 0 || baseEventCursor > currentCursor) {
        throw new GoalBoardV1Error(
          "goal_tree_proposal.base_cursor_invalid",
          "Goal Tree 提案的 base_event_cursor 必须是当前 Board 已观察到的事件游标",
        );
      }

      let previous: GoalTreeProposalRecord | null = null;
      if (supersedesProposalId) {
        previous = this.readNativeGoalTreeProposal(input.board_id, supersedesProposalId);
        if (previous.state !== "pending") {
          throw new GoalBoardV1Error(
            "goal_tree_proposal.revision_not_pending",
            "只能修订仍待用户决定的 Goal Tree 提案",
          );
        }
        if (previous.submitted_by !== actorId) {
          throw new GoalBoardV1Error(
            "goal_tree_proposal.revision_not_owner",
            "只有原提案的当前 Runtime 可以创建它的修订版本",
          );
        }
      }
      const effectiveRootGoalId = rootGoalId ?? previous?.root_goal_id ?? null;
      if (effectiveRootGoalId) this.requireGoalOnBoard(input.board_id, effectiveRootGoalId);
      if (!previous && items.some((item) => item.supersedes_item_id)) {
        throw new GoalBoardV1Error(
          "goal_tree_proposal.item_revision_without_proposal",
          "条目要引用 supersedes_item_id 时，必须同时指定 supersedes_proposal_id",
        );
      }
      if (previous) {
        const priorItemIds = new Set(previous.items.map((item) => item.item_id));
        for (const item of items) {
          if (item.supersedes_item_id && !priorItemIds.has(item.supersedes_item_id)) {
            throw new GoalBoardV1Error(
              "goal_tree_proposal.item_revision_unknown",
              "修订条目只能引用被修订提案中的已有 item_id",
            );
          }
        }
      }

      const proposalId = `goal-tree-proposal-${randomUUID()}`;
      const now = this.clock().toISOString();
      const version = (previous?.version ?? 0) + 1;
      this.store.db
        .prepare(`
          INSERT INTO goal_tree_proposals (
            proposal_id, board_id, root_goal_id, submitted_by, discovered_in_run_id,
            state, version, supersedes_proposal_id, base_event_cursor, summary,
            decision_json, created_at, updated_at, decided_at
          ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, NULL, ?, ?, NULL)
        `)
        .run(
          proposalId,
          input.board_id,
          effectiveRootGoalId,
          actorId,
          input.discovered_in_run_id,
          version,
          supersedesProposalId,
          baseEventCursor,
          summary,
          now,
          now,
        );
      const insertItem = this.store.db.prepare(`
        INSERT INTO goal_tree_proposal_items (
          item_id, proposal_id, board_id, ordinal, kind, operation, payload_json,
          source_refs_json, reason, confidence, affected_objects_json,
          baseline_versions_json, requires_user_confirmation, state, conflict_json,
          supersedes_item_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'pending', NULL, ?, ?, ?)
      `);
      for (const [index, item] of items.entries()) {
        const baselineVersions = item.affected_objects.map((object) =>
          this.proposalObjectVersion(input.board_id, object),
        );
        insertItem.run(
          item.item_id,
          proposalId,
          input.board_id,
          index + 1,
          item.kind,
          item.operation,
          sqliteJson(item.payload),
          sqliteJson(item.source_refs),
          item.reason,
          item.confidence,
          sqliteJson(item.affected_objects),
          sqliteJson(baselineVersions),
          item.supersedes_item_id,
          now,
          now,
        );
      }
      if (previous) {
        this.store.db
          .prepare("UPDATE goal_tree_proposals SET state = 'superseded', updated_at = ? WHERE proposal_id = ?")
          .run(now, previous.proposal_id);
        this.store.db
          .prepare(`
            UPDATE goal_tree_proposal_items
            SET state = 'superseded', updated_at = ?
            WHERE proposal_id = ? AND state IN ('pending', 'conflict')
          `)
          .run(now, previous.proposal_id);
      }
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId,
        type: previous ? "goal_tree_proposal.revised" : "goal_tree_proposal.submitted",
        objectType: "goal_tree_proposal",
        objectId: proposalId,
        reason: previous
          ? "当前 Runtime 提交了保留历史的 Goal Tree 提案修订版本"
          : "当前 Runtime 提交了等待用户确认的统一 Goal Tree 提案",
        payload: {
          root_goal_id: effectiveRootGoalId,
          discovered_in_run_id: input.discovered_in_run_id,
          base_event_cursor: baseEventCursor,
          version,
          supersedes_proposal_id: supersedesProposalId,
          item_ids: items.map((item) => item.item_id),
        },
        at: now,
      });
      const proposal = this.readNativeGoalTreeProposal(input.board_id, proposalId);
      const outcome = { proposal, observed_event_cursor: cursor };
      this.remember(
        input.board_id,
        actorId,
        "submit_goal_tree_proposal",
        input.idempotency_key,
        hash,
        outcome,
        now,
      );
      return { ...outcome, replayed: false };
    });
  }

  /** Read native and legacy proposal history through one compatible view. */
  listGoalTreeProposals(input: GoalTreeProposalListQuery): GoalTreeProposalListResult {
    this.requireBoard(input.board_id);
    if (input.root_goal_id) this.requireGoalOnBoard(input.board_id, input.root_goal_id);
    const snapshot = this.store.snapshot(input.board_id);
    const proposals = [
      ...snapshot.goal_tree_proposals,
      ...(input.include_legacy === false ? [] : this.legacyGoalTreeProposalView(snapshot)),
    ]
      .filter((proposal) => !input.proposal_id || proposal.proposal_id === input.proposal_id)
      .filter((proposal) => !input.root_goal_id || proposal.root_goal_id === input.root_goal_id)
      .sort(
        (left, right) =>
          right.created_at.localeCompare(left.created_at) || left.proposal_id.localeCompare(right.proposal_id),
      );
    return { observed_event_cursor: snapshot.cursor, proposals };
  }

  /**
   * Re-check each native proposal item against its own recorded baseline. A
   * conflict in A never hides or invalidates an unchanged item B.
   */
  checkGoalTreeProposal(input: GoalTreeProposalCheckInput): GoalTreeProposalCheckResult {
    const actorId = requiredDialogueText(
      input.actor_id,
      "goal_tree_proposal.actor_required",
      "检查 Goal Tree 提案需要当前 Runtime 的 actor_id",
    );
    const proposalId = requiredDialogueText(
      input.proposal_id,
      "goal_tree_proposal.id_required",
      "需要指定要检查的 Goal Tree proposal_id",
    );
    const hash = requestHash({ board_id: input.board_id, proposal_id: proposalId, actor_id: actorId });
    return this.store.immediate(() => {
      const replay = this.replay<GoalTreeProposalCheckResult>(
        input.board_id,
        actorId,
        "check_goal_tree_proposal",
        input.idempotency_key,
        hash,
      );
      if (replay) return replay;
      const proposal = this.readNativeGoalTreeProposal(input.board_id, proposalId);
      const now = this.clock().toISOString();
      const conflictItemIds: string[] = [];
      const updateItem = this.store.db.prepare(`
        UPDATE goal_tree_proposal_items
        SET state = ?, conflict_json = ?, updated_at = ?
        WHERE item_id = ? AND proposal_id = ?
      `);
      for (const item of proposal.items) {
        if (item.state !== "pending" && item.state !== "conflict") continue;
        const validationIssue = goalTreeProposalItemValidationIssues(item)[0];
        const baselineConflicts = item.baseline_versions.flatMap((baseline) => {
          const current = this.proposalObjectVersion(input.board_id, baseline);
          return baseline.exists === current.exists && baseline.version === current.version
            ? []
            : [{ object: { object_type: baseline.object_type, object_id: baseline.object_id }, baseline, current }];
        });
        const conflict = validationIssue
          ? {
              code: validationIssue.code,
              field: validationIssue.field,
              message: validationIssue.message,
              recovery: validationIssue.recovery,
            }
          : baselineConflicts.length > 0
            ? { objects: baselineConflicts }
            : null;
        if (conflict) conflictItemIds.push(item.item_id);
        updateItem.run(conflict ? "conflict" : "pending", conflict ? sqliteJson(conflict) : null, now, item.item_id, proposalId);
      }
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId,
        type: "goal_tree_proposal.checked",
        objectType: "goal_tree_proposal",
        objectId: proposalId,
        reason: conflictItemIds.length > 0
          ? "当前 Runtime 检查到部分 Goal Tree 提案条目不再满足当前校验或基准"
          : "当前 Runtime 检查到 Goal Tree 提案的各条目基准仍有效",
        payload: {
          conflict_item_ids: conflictItemIds,
          planning_issue_codes: this.goalTreePlanningIssues(input.board_id, proposal.items).map((issue) => issue.code),
        },
        at: now,
      });
      const outcome: GoalTreeProposalCheckResult = {
        proposal: this.readNativeGoalTreeProposal(input.board_id, proposalId),
        conflict_item_ids: conflictItemIds,
        planning_issues: this.goalTreePlanningIssues(input.board_id, proposal.items),
        observed_event_cursor: cursor,
      };
      this.remember(
        input.board_id,
        actorId,
        "check_goal_tree_proposal",
        input.idempotency_key,
        hash,
        outcome,
        now,
      );
      return outcome;
    });
  }

  /**
   * Applies only the user-confirmed subset of one native Goal Tree proposal.
   * A stale or structurally unsafe item becomes a persisted conflict while
   * independent confirmed items in the same composite decision still land.
   */
  decideGoalTreeProposal(input: GoalTreeProposalDecideInput): GoalTreeProposalDecisionResult {
    const authority = normalizeGoalTreeProposalDecisionAuthority(input.authority);
    const proposalId = requiredDialogueText(
      input.proposal_id,
      "goal_tree_proposal.id_required",
      "需要指定要决定的 Goal Tree proposal_id",
    );
    const runtimeActorId = nullableDialogueText(input.runtime_actor_id);
    const hash = requestHash({
      board_id: input.board_id,
      proposal_id: proposalId,
      runtime_actor_id: runtimeActorId,
      authority,
      decisions: input.decisions ?? [],
      reason: input.reason ?? null,
      confirm_all_pending: input.confirm_all_pending === true,
    });
    return this.store.immediate(() => {
      const replay = this.replay<Omit<GoalTreeProposalDecisionResult, "replayed">>(
        input.board_id,
        authority.actor_id,
        "decide_goal_tree_proposal",
        input.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };

      this.requireBoard(input.board_id);
      const proposal = this.readNativeGoalTreeProposal(input.board_id, proposalId);
      if (proposal.state !== "pending" && proposal.state !== "partially_applied") {
        throw new GoalBoardV1Error(
          "goal_tree_proposal.decision_not_pending",
          "只有仍有待处理条目的 Goal Tree 提案可以继续决定",
        );
      }

      let decisions = normalizeGoalTreeProposalDecisions(input.decisions, input.reason);
      if (input.confirm_all_pending === true) {
        if (decisions.length > 0) {
          throw new GoalBoardV1Error(
            "goal_tree_proposal.whole_confirmation_mixed",
            "整份确认不能同时携带逐项决定；请二选一",
          );
        }
        const activeProposals = this.store
          .snapshot(input.board_id)
          .goal_tree_proposals.filter(
            (candidate) =>
              (candidate.state === "pending" || candidate.state === "partially_applied") &&
              candidate.items.some((item) => item.state === "pending"),
          );
        if (
          authority.whole_confirmation_prompted !== true ||
          activeProposals.length !== 1 ||
          activeProposals[0]?.proposal_id !== proposal.proposal_id ||
          proposal.items.some((item) => item.state === "conflict")
        ) {
          throw new GoalBoardV1Error(
            "goal_tree_proposal.whole_confirmation_ambiguous",
            "简短确认只有在上一问明确请求确认唯一整份提案时才能生效；请说明要确认哪些条目",
          );
        }
        const sharedReason = requiredDialogueText(
          input.reason ?? "",
          "goal_tree_proposal.decision_reason_required",
          "整份确认需要记录用户的确认理由或原始表达",
        );
        decisions = proposal.items
          .filter((item) => item.state === "pending")
          .map((item) => ({ item_id: item.item_id, decision: "confirm" as const, reason: sharedReason, revised_item: null }));
      }
      if (decisions.length === 0) {
        throw new GoalBoardV1Error(
          "goal_tree_proposal.decisions_required",
          "请至少决定一个 Goal Tree 条目，或在明确上下文中确认整份提案",
        );
      }

      const itemsById = new Map(proposal.items.map((item) => [item.item_id, item]));
      for (const decision of decisions) {
        const item = itemsById.get(decision.item_id);
        if (!item) {
          throw new GoalBoardV1Error(
            "goal_tree_proposal.decision_item_not_found",
            `提案中不存在条目: ${decision.item_id}`,
          );
        }
        if (item.state !== "pending" && item.state !== "conflict") {
          throw new GoalBoardV1Error(
            "goal_tree_proposal.decision_item_closed",
            `条目「${decision.item_id}」已经处理，不能再次决定`,
          );
        }
      }

      for (const decision of decisions) {
        if (decision.decision !== "confirm") continue;
        const item = itemsById.get(decision.item_id)!;
        const issue = goalTreeProposalItemValidationIssues(item)[0];
        if (issue) {
          throw new GoalBoardV1Error(
            issue.code,
            `方案中的风险「${goalTreeRiskDescription(item)}」暂时不能采用：${issue.message}${issue.recovery}当前 Goal Tree 没有改变。`,
          );
        }
      }

      const decompositionIssue = goalTreeProposalDecompositionIssues(
        decisions
          .filter((decision) => decision.decision === "confirm")
          .map((decision) => itemsById.get(decision.item_id)!),
        this.store.snapshot(input.board_id),
        this.effectivePlanningMethods(input.board_id),
        this.projectPlanningComposition(input.board_id).method_pack_ids,
      )[0];
      if (decompositionIssue) {
        throw new GoalBoardV1Error(
          decompositionIssue.code,
          `${decompositionIssue.message}${decompositionIssue.recovery}当前 Goal Tree 没有改变。`,
        );
      }

      const planningIssues = this.goalTreePlanningIssues(
        input.board_id,
        decisions
          .filter((decision) => decision.decision === "confirm")
          .map((decision) => itemsById.get(decision.item_id)!),
      );
      const planningConflicts = new Map<string, PlanningGraphIssue>();
      for (const issue of planningIssues) {
        for (const item of itemsById.values()) {
          if (issue.relation_ids.some((relationId) => relationId.startsWith(`proposal:${item.item_id}:`))) {
            planningConflicts.set(item.item_id, issue);
          }
        }
      }

      const now = this.clock().toISOString();
      const appliedItemIds: string[] = [];
      const rejectedItemIds: string[] = [];
      const revisedItemIds: string[] = [];
      const conflictItemIds: string[] = [];
      const confirmed: Array<{ item: GoalTreeProposalItemRecord; decision: NormalizedGoalTreeProposalDecision }> = [];

      for (const decision of decisions) {
        const item = itemsById.get(decision.item_id)!;
        if (decision.decision === "reject") {
          this.recordGoalTreeProposalItemDecision({
            board_id: input.board_id,
            proposal_id: proposal.proposal_id,
            item,
            item_state: "rejected",
            decision: "rejected",
            authority,
            runtime_actor_id: runtimeActorId,
            reason: decision.reason,
            conflict: null,
            materialized_objects: [],
            revision_proposal_id: null,
            at: now,
          });
          rejectedItemIds.push(item.item_id);
          continue;
        }
        if (decision.decision === "revise") continue;
        const planningConflict = planningConflicts.get(item.item_id);
        if (planningConflict) {
          this.recordGoalTreeProposalItemDecision({
            board_id: input.board_id,
            proposal_id: proposal.proposal_id,
            item,
            item_state: "conflict",
            decision: "conflict",
            authority,
            runtime_actor_id: runtimeActorId,
            reason: decision.reason,
            conflict: {
              code: planningConflict.code,
              message: planningConflict.message,
              goal_ids: planningConflict.goal_ids,
              relation_ids: planningConflict.relation_ids,
              path: planningConflict.path,
            },
            materialized_objects: [],
            revision_proposal_id: null,
            at: now,
          });
          conflictItemIds.push(item.item_id);
          continue;
        }
        const conflicts = this.goalTreeProposalItemConflicts(input.board_id, item);
        if (conflicts.length > 0) {
          this.recordGoalTreeProposalItemDecision({
            board_id: input.board_id,
            proposal_id: proposal.proposal_id,
            item,
            item_state: "conflict",
            decision: "conflict",
            authority,
            runtime_actor_id: runtimeActorId,
            reason: decision.reason,
            conflict: { objects: conflicts },
            materialized_objects: [],
            revision_proposal_id: null,
            at: now,
          });
          conflictItemIds.push(item.item_id);
          continue;
        }
        confirmed.push({ item, decision });
      }

      const materializationOrder: GoalTreeProposalItemRecord["kind"][][] = [
        ["goal", "contract", "candidate"],
        ["policy", "risk"],
        ["relation", "dependency", "rewire"],
      ];
      for (const kinds of materializationOrder) {
        for (const entry of confirmed.filter((candidate) => kinds.includes(candidate.item.kind))) {
          const conflict = this.goalTreeProposalMaterializationConflict(input.board_id, entry.item);
          if (conflict) {
            this.recordGoalTreeProposalItemDecision({
              board_id: input.board_id,
              proposal_id: proposal.proposal_id,
              item: entry.item,
              item_state: "conflict",
              decision: "conflict",
              authority,
              runtime_actor_id: runtimeActorId,
              reason: entry.decision.reason,
              conflict,
              materialized_objects: [],
              revision_proposal_id: null,
              at: now,
            });
            conflictItemIds.push(entry.item.item_id);
            continue;
          }
          const materializedObjects = this.materializeGoalTreeProposalItem(
            input.board_id,
            entry.item,
            authority.actor_id,
            entry.decision.reason,
            now,
          );
          this.recordGoalTreeProposalItemDecision({
            board_id: input.board_id,
            proposal_id: proposal.proposal_id,
            item: entry.item,
            item_state: "applied",
            decision: "confirmed",
            authority,
            runtime_actor_id: runtimeActorId,
            reason: entry.decision.reason,
            conflict: null,
            materialized_objects: materializedObjects,
            revision_proposal_id: null,
            at: now,
          });
          appliedItemIds.push(entry.item.item_id);
        }
      }

      if (appliedItemIds.length > 0) {
        this.reconcileAllClosedCompoundGoals(input.board_id, authority.actor_id, now);
      }

      const revisionInputs = decisions.filter(
        (decision): decision is NormalizedGoalTreeProposalDecision & { revised_item: NormalizedGoalTreeProposalItem } =>
          decision.decision === "revise" && decision.revised_item != null,
      );
      const revisionProposals = revisionInputs.length > 0
        ? [
            this.createGoalTreeProposalRevision(
              input.board_id,
              proposal,
              revisionInputs,
              authority,
              runtimeActorId,
              now,
            ),
          ]
        : [];
      const revisionProposal = revisionProposals[0] ?? null;
      for (const decision of revisionInputs) {
        const item = itemsById.get(decision.item_id)!;
        this.recordGoalTreeProposalItemDecision({
          board_id: input.board_id,
          proposal_id: proposal.proposal_id,
          item,
          item_state: "superseded",
          decision: "revised",
          authority,
          runtime_actor_id: runtimeActorId,
          reason: decision.reason,
          conflict: null,
          materialized_objects: [],
          revision_proposal_id: revisionProposal?.proposal_id ?? null,
          at: now,
        });
        revisedItemIds.push(item.item_id);
      }

      this.refreshGoalTreeProposalState(input.board_id, proposal.proposal_id, authority.actor_id, now);
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId: authority.actor_id,
        type: "goal_tree_proposal.decided",
        objectType: "goal_tree_proposal",
        objectId: proposal.proposal_id,
        reason: "用户在当前入口明确决定了 Goal Tree 提案中的部分条目",
        payload: {
          runtime_actor_id: runtimeActorId,
          authority_source: authority.authority_source,
          conversation_ref: authority.conversation_ref,
          message_ref: authority.message_ref,
          applied_item_ids: appliedItemIds,
          rejected_item_ids: rejectedItemIds,
          revised_item_ids: revisedItemIds,
          conflict_item_ids: conflictItemIds,
          revision_proposal_ids: revisionProposals.map((item) => item.proposal_id),
        },
        at: now,
      });
      const outcome: Omit<GoalTreeProposalDecisionResult, "replayed"> = {
        proposal: this.readNativeGoalTreeProposal(input.board_id, proposal.proposal_id),
        revision_proposals: revisionProposals.map((item) => this.readNativeGoalTreeProposal(input.board_id, item.proposal_id)),
        applied_item_ids: appliedItemIds,
        rejected_item_ids: rejectedItemIds,
        revised_item_ids: revisedItemIds,
        conflict_item_ids: conflictItemIds,
        observed_event_cursor: cursor,
      };
      this.remember(
        input.board_id,
        authority.actor_id,
        "decide_goal_tree_proposal",
        input.idempotency_key,
        hash,
        outcome,
        now,
      );
      return { ...outcome, replayed: false };
    });
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
      if (
        role === "executor" ||
        role === "revalidator" ||
        role === "self_verifier" ||
        role === "cross_reviewer" ||
        role === "adversarial_reviewer"
      ) {
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

  renewClaim(input: ClaimRenewRequest): ClaimRenewResult {
    const hash = requestHash({
      board_id: input.board_id,
      claim_id: input.claim_id,
      actor_id: input.actor_id,
      lease_seconds: input.lease_seconds ?? null,
    });
    return this.store.immediate(() => {
      const replay = this.replay<Omit<ClaimRenewResult, "replayed">>(
        input.board_id,
        input.actor_id,
        "renew_claim",
        input.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };

      this.requireBoard(input.board_id);
      const row = this.store.db
        .prepare("SELECT * FROM claims WHERE claim_id = ? AND board_id = ?")
        .get(input.claim_id, input.board_id) as Row | undefined;
      if (!row) throw new GoalBoardV1Error("claim.not_found", `Claim 不存在: ${input.claim_id}`);
      const claim = mapSqliteClaim(row);
      if (claim.actor_id !== input.actor_id) {
        throw new GoalBoardV1Error("claim.not_owner", "只有领取者可以续租 Claim");
      }
      if (claim.state !== "active") {
        throw new GoalBoardV1Error("claim.not_active", "只有 active Claim 可以续租");
      }

      const now = this.clock().toISOString();
      if (claim.expires_at <= now) {
        throw new GoalBoardV1Error(
          "claim.lease_expired",
          "Claim 租约已过期，不能续租；请重新领取 Goal",
          {
            claim_id: claim.claim_id,
            goal_id: claim.goal_id,
            next_action: "select_goal",
            requires_user_confirmation: false,
          },
        );
      }
      const maxLeaseSeconds = claim.resolved_policy.max_lease_seconds;
      const requestedLease = input.lease_seconds ?? maxLeaseSeconds;
      if (!Number.isInteger(requestedLease) || requestedLease <= 0) {
        throw new GoalBoardV1Error(
          "lease.duration_invalid",
          "续租时长必须是正整数秒",
          { requested_lease_seconds: requestedLease },
        );
      }
      if (requestedLease > maxLeaseSeconds) {
        throw new GoalBoardV1Error(
          "lease.duration_exceeds_policy",
          `续租时长不能超过领取时确认的 ${maxLeaseSeconds} 秒`,
          {
            requested_lease_seconds: requestedLease,
            max_lease_seconds: maxLeaseSeconds,
          },
        );
      }

      const requestedExpiry = addSeconds(now, requestedLease);
      const expiresAt = requestedExpiry > claim.expires_at ? requestedExpiry : claim.expires_at;
      this.store.db
        .prepare("UPDATE claims SET expires_at = ?, renewed_at = ? WHERE claim_id = ?")
        .run(expiresAt, now, input.claim_id);
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId: input.actor_id,
        type: "claim.renewed",
        objectType: "claim",
        objectId: input.claim_id,
        reason: "领取者确认工作仍在继续并续租 Claim",
        payload: {
          goal_id: claim.goal_id,
          previous_expires_at: claim.expires_at,
          expires_at: expiresAt,
          lease_seconds: requestedLease,
        },
        at: now,
      });
      const updated = this.store.db
        .prepare("SELECT * FROM claims WHERE claim_id = ?")
        .get(input.claim_id) as Row;
      const outcome = {
        claim: mapSqliteClaim(updated),
        observed_event_cursor: cursor,
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

      if (role === "executor") {
        const snapshot = this.store.snapshot(request.board_id);
        const goal = snapshot.goals.find((item) => item.goal_id === request.goal_id);
        if (goal) {
          const workState = this.deriveGoalWorkState(
            request.board_id,
            goal,
            snapshot,
            this.clock().toISOString(),
          );
          if (
            workState.work_state === "completion_pending" ||
            workState.work_state === "completion_blocked" ||
            workState.work_state === "waiting_for_human"
          ) {
            const reasons = this.executorHandoffReasons(workState);
            const outcome: ClaimRunDecision = {
              allowed: false,
              observed_event_cursor: snapshot.cursor,
              reasons,
              claim: null,
              run: null,
              work_state: workState,
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
        }
      }

      const claimDecision = this.claimGoal({
        ...request,
        role,
        idempotency_key: `select-goal-claim:${request.idempotency_key}`,
      });
      if (!claimDecision.allowed || !claimDecision.claim) {
        const outcome: ClaimRunDecision = {
          allowed: false,
          observed_event_cursor: claimDecision.observed_event_cursor,
          reasons: claimDecision.reasons,
          claim: null,
          run: null,
          work_state: null,
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
      const outcome: ClaimRunDecision = {
        allowed: true,
        observed_event_cursor: started.observed_event_cursor,
        reasons: [],
        claim: claimDecision.claim,
        run: started.run,
        work_state: this.getGoalWorkState({
          board_id: request.board_id,
          goal_id: request.goal_id,
        }),
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
  }): { claim: ClaimRecord; replayed: boolean; observed_event_cursor: number } {
    const hash = requestHash({
      board_id: input.board_id,
      claim_id: input.claim_id,
      actor_id: input.actor_id,
      reason: input.reason,
    });
    const replay = this.replay<{ claim: ClaimRecord; observed_event_cursor: number }>(
      input.board_id,
      input.actor_id,
      "release_claim",
      input.idempotency_key,
      hash,
    );
    if (replay) return { ...replay, replayed: true };
    const leaseRecovery = this.store.immediate(() => {
      this.requireBoard(input.board_id);
      const row = this.store.db
        .prepare("SELECT * FROM claims WHERE claim_id = ? AND board_id = ?")
        .get(input.claim_id, input.board_id) as Row | undefined;
      if (!row) throw new GoalBoardV1Error("claim.not_found", `Claim 不存在: ${input.claim_id}`);
      if (asText(row.actor_id) !== input.actor_id) {
        throw new GoalBoardV1Error("claim.not_owner", "只有领取者可以释放 Claim");
      }
      const at = this.clock().toISOString();
      if (asText(row.state) === "active" && asText(row.expires_at) <= at) {
        this.expirePastClaims(input.board_id, at, input.actor_id);
        return {
          goal_id: asText(row.goal_id),
          claim_id: input.claim_id,
        };
      }
      if (asText(row.state) === "expired") {
        return {
          goal_id: asText(row.goal_id),
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
      this.abandonActiveRunsForClaim(
        input.board_id,
        input.claim_id,
        input.actor_id,
        `Claim 被领取者释放：${input.reason}`,
        at,
      );
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
        "revoke_claim",
        input.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      this.requireBoard(input.board_id);
      const row = this.store.db
        .prepare("SELECT * FROM claims WHERE claim_id = ? AND board_id = ?")
        .get(input.claim_id, input.board_id) as Row | undefined;
      if (!row) throw new GoalBoardV1Error("claim.not_found", `Claim 不存在: ${input.claim_id}`);
      if (asText(row.state) !== "active") {
        throw new GoalBoardV1Error("claim.not_active", "Claim 已经不是 active 状态");
      }
      const at = this.clock().toISOString();
      this.store.db
        .prepare("UPDATE claims SET state = 'revoked', released_at = ?, release_reason = ? WHERE claim_id = ?")
        .run(at, input.reason, input.claim_id);
      this.abandonActiveRunsForClaim(
        input.board_id,
        input.claim_id,
        input.actor_id,
        `Claim 被撤销：${input.reason}`,
        at,
      );
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId: input.actor_id,
        type: "claim.revoked",
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
      if (
        role !== "clarifier" &&
        role !== "executor" &&
        role !== "self_verifier" &&
        role !== "cross_reviewer" &&
        role !== "adversarial_reviewer" &&
        role !== "revalidator"
      ) {
        throw new GoalBoardV1Error("run.role_invalid", "这个 Claim 角色不能启动工作 Run");
      }
      const goal = this.store.getGoal(asText(claim.goal_id));
      if (!goal || goal.validity_state === "invalidated") {
        throw new GoalBoardV1Error("goal.invalidated", "Goal 已失效，不能开始 Run");
      }
      if (goal.trashed_at) {
        throw new GoalBoardV1Error("goal.trashed", "回收站中的 Goal 不能开始 Run");
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
      if (asText(run.claim_state) !== "active" || asText(run.claim_expires_at) <= now) {
        throw new GoalBoardV1Error("revalidation.claim_inactive", "重新验证 Claim 已释放、撤销或过期");
      }
      if (asText(run.state) !== "started") {
        throw new GoalBoardV1Error("revalidation.run_not_started", "重新验证只能由正在执行的 Run 提交");
      }

      const goal = this.requireGoalOnBoard(input.board_id, input.goal_id);
      if (goal.trashed_at) {
        throw new GoalBoardV1Error("goal.trashed", "回收站中的 Goal 不能重新验证");
      }
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
    const replay = this.replay<{ run: RunRecord; observed_event_cursor: number }>(
      input.board_id,
      input.actor_id,
      "report_run",
      input.idempotency_key,
      hash,
    );
    if (replay) return { ...replay, replayed: true };
    const leaseRecovery = this.store.immediate(() => {
      const row = this.store.db
        .prepare(`
          SELECT r.actor_id, r.goal_id, r.claim_id,
                 c.state AS claim_state, c.expires_at AS claim_expires_at
          FROM runs r
          JOIN claims c ON c.claim_id = r.claim_id
          WHERE r.run_id = ? AND r.board_id = ?
        `)
        .get(input.run_id, input.board_id) as Row | undefined;
      if (!row) throw new GoalBoardV1Error("run.not_found", `Run 不存在: ${input.run_id}`);
      if (asText(row.actor_id) !== input.actor_id) {
        throw new GoalBoardV1Error("run.not_owner", "只有执行者可以报告这个 Run");
      }
      const at = this.clock().toISOString();
      if (asText(row.claim_state) === "active" && asText(row.claim_expires_at) <= at) {
        this.expirePastClaims(input.board_id, at, input.actor_id);
        return {
          goal_id: asText(row.goal_id),
          claim_id: asText(row.claim_id),
          run_id: input.run_id,
        };
      }
      if (asText(row.claim_state) === "expired") {
        return {
          goal_id: asText(row.goal_id),
          claim_id: asText(row.claim_id),
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
      if (["failed", "abandoned"].includes(input.state)) {
        const claim = this.store.db
          .prepare("SELECT state FROM claims WHERE claim_id = ?")
          .get(asText(row.claim_id)) as Row | undefined;
        if (claim && asText(claim.state) === "active") {
          const recoveryReason =
            input.state === "abandoned"
              ? "Runtime 已中断或放弃当前 Run，自动释放 Claim"
              : "Run 执行失败，自动释放 Claim 以便其他 Runtime 继续推进";
          this.store.db
            .prepare("UPDATE claims SET state = 'released', released_at = ?, release_reason = ? WHERE claim_id = ?")
            .run(now, recoveryReason, asText(row.claim_id));
          this.store.appendEvent({
            eventId: randomUUID(),
            boardId: input.board_id,
            actorId: input.actor_id,
            type: "claim.released",
            objectType: "claim",
            objectId: asText(row.claim_id),
            reason: recoveryReason,
            payload: { run_id: input.run_id, recovery: true },
            at: now,
          });
        }
      }
      const outcome = {
        run: this.readRun(input.run_id),
        observed_event_cursor:
          input.state === "failed" || input.state === "abandoned"
            ? this.store.eventCursor(input.board_id)
            : cursor,
      };
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
    /** Host-only validation context; Runtime and Web schemas never accept a user-supplied root. */
    locator_context?: { project_root?: string | null; workspace_id?: string | null };
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
      let locatorValidation;
      try {
        locatorValidation = validateEvidenceLocator(input.locator, {
          projectRoot: input.locator_context?.project_root,
          now,
        });
      } catch (error) {
        if (!(error instanceof ProjectReferenceError)) throw error;
        const code = /anchor 不存在/.test(error.message)
          ? "evidence.locator_anchor_missing"
          : /文件不存在/.test(error.message)
            ? "evidence.locator_file_missing"
            : /范围外|跳出项目目录|相对路径/.test(error.message)
              ? "evidence.locator_outside_project"
              : /根目录不可用/.test(error.message)
                ? "evidence.locator_project_unavailable"
                : "evidence.locator_invalid";
        throw new GoalBoardV1Error(code, error.message);
      }
      this.store.db
        .prepare(`
          INSERT INTO evidence (
            evidence_id, board_id, goal_id, criterion_ids_json, producer_actor_id,
            run_id, review_id, kind, locator, locator_status, locator_validation_reason,
            locator_checked_at, locator_workspace_id, locator_workspace_root, digest, captured_at, result
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          locatorValidation.normalized_locator,
          locatorValidation.status,
          locatorValidation.reason,
          locatorValidation.checked_at,
          locatorValidation.status === "verified" ? input.locator_context?.workspace_id ?? null : null,
          locatorValidation.status === "verified" ? input.locator_context?.project_root ?? null : null,
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
  } {
    const hash = requestHash(input);
    return this.store.immediate(() => {
      const replay = this.replay<{
        correction: EvidenceCorrectionRecord;
        target_evidence: EvidenceRecord;
        replacement_evidence: EvidenceRecord | null;
        observed_event_cursor: number;
      }>(input.board_id, input.actor_id, "correct_evidence", input.idempotency_key, hash);
      if (replay) return { ...replay, replayed: true };

      this.requireBoard(input.board_id);
      this.requireGoalOnBoard(input.board_id, input.goal_id);
      const reasonText = input.reason.trim();
      if (!reasonText) {
        throw new GoalBoardV1Error("evidence.correction_reason_required", "更正 Evidence 必须说明原因");
      }
      if (input.action !== "supersede" && input.action !== "retract") {
        throw new GoalBoardV1Error("evidence.correction_action_invalid", "Evidence 更正必须是 supersede 或 retract");
      }

      const target = this.store.db
        .prepare("SELECT * FROM evidence WHERE evidence_id = ? AND board_id = ?")
        .get(input.target_evidence_id, input.board_id) as Row | undefined;
      if (!target || asText(target.goal_id) !== input.goal_id) {
        throw new GoalBoardV1Error("evidence.correction_target_invalid", "待更正的 Evidence 不属于这个 Goal");
      }
      if (asText(target.producer_actor_id) !== input.actor_id) {
        throw new GoalBoardV1Error(
          "evidence.correction_not_owner",
          "Runtime 只能更正自己提交的 Evidence",
        );
      }
      const existingCorrection = this.store.db
        .prepare("SELECT correction_id FROM evidence_corrections WHERE target_evidence_id = ?")
        .get(input.target_evidence_id);
      if (existingCorrection) {
        throw new GoalBoardV1Error(
          "evidence.already_corrected",
          "这条 Evidence 已有不可变更正记录，不能再次改写同一历史节点",
        );
      }

      let replacement: Row | undefined;
      const replacementId = input.replacement_evidence_id?.trim() || null;
      if (input.action === "supersede") {
        if (!replacementId) {
          throw new GoalBoardV1Error(
            "evidence.replacement_required",
            "supersede 必须引用一条已经提交的替代 Evidence",
          );
        }
        if (replacementId === input.target_evidence_id) {
          throw new GoalBoardV1Error("evidence.correction_cycle", "Evidence 不能用自己替代自己");
        }
        replacement = this.store.db
          .prepare("SELECT * FROM evidence WHERE evidence_id = ? AND board_id = ?")
          .get(replacementId, input.board_id) as Row | undefined;
        if (!replacement || asText(replacement.goal_id) !== input.goal_id) {
          throw new GoalBoardV1Error(
            "evidence.replacement_invalid",
            "替代 Evidence 必须属于同一个 Board 和 Goal",
          );
        }
        if (asText(replacement.producer_actor_id) !== input.actor_id) {
          throw new GoalBoardV1Error(
            "evidence.replacement_not_owner",
            "Runtime 只能用自己提交的 Evidence 建立替代关系",
          );
        }

        let cursor: string | null = replacementId;
        const visited = new Set<string>();
        while (cursor) {
          if (cursor === input.target_evidence_id) {
            throw new GoalBoardV1Error("evidence.correction_cycle", "Evidence 更正关系不能形成循环");
          }
          if (visited.has(cursor)) {
            throw new GoalBoardV1Error("evidence.correction_cycle", "现有 Evidence 更正链已经形成循环");
          }
          visited.add(cursor);
          const next = this.store.db
            .prepare("SELECT action, replacement_evidence_id FROM evidence_corrections WHERE target_evidence_id = ?")
            .get(cursor) as Row | undefined;
          if (!next) break;
          cursor = asText(next.action) === "supersede" && next.replacement_evidence_id != null
            ? asText(next.replacement_evidence_id)
            : null;
        }
        const replacementCorrection = this.store.db
          .prepare("SELECT action FROM evidence_corrections WHERE target_evidence_id = ?")
          .get(replacementId) as Row | undefined;
        if (replacementCorrection) {
          throw new GoalBoardV1Error(
            "evidence.replacement_not_effective",
            "替代 Evidence 必须是当前有效记录，不能再引用已被替代或撤销的历史",
          );
        }
      } else if (replacementId) {
        throw new GoalBoardV1Error(
          "evidence.replacement_not_allowed",
          "retract 只撤销当前 Evidence，不能同时指定替代记录",
        );
      }

      const correctionId = `evidence-correction-${randomUUID()}`;
      const now = this.clock().toISOString();
      this.store.db
        .prepare(`
          INSERT INTO evidence_corrections (
            correction_id, board_id, goal_id, target_evidence_id, action,
            replacement_evidence_id, actor_id, reason, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          correctionId,
          input.board_id,
          input.goal_id,
          input.target_evidence_id,
          input.action,
          replacementId,
          input.actor_id,
          reasonText,
          now,
        );
      const eventType = input.action === "supersede" ? "evidence.superseded" : "evidence.retracted";
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId: input.actor_id,
        type: eventType,
        objectType: "evidence_correction",
        objectId: correctionId,
        reason: reasonText,
        payload: {
          goal_id: input.goal_id,
          target_evidence_id: input.target_evidence_id,
          replacement_evidence_id: replacementId,
        },
        at: now,
      });
      const snapshot = this.store.snapshot(input.board_id);
      const correction = snapshot.evidence_corrections.find((item) => item.correction_id === correctionId);
      const targetEvidence = snapshot.evidence.find((item) => item.evidence_id === input.target_evidence_id);
      const replacementEvidence = replacementId
        ? snapshot.evidence.find((item) => item.evidence_id === replacementId) ?? null
        : null;
      if (!correction || !targetEvidence) {
        throw new Error(`Evidence 更正写入后无法读取: ${correctionId}`);
      }
      const outcome = {
        correction,
        target_evidence: targetEvidence,
        replacement_evidence: replacementEvidence,
        observed_event_cursor: cursor,
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
      const reviewGoal = this.requireGoalOnBoard(input.board_id, input.goal_id);
      if (reviewGoal.trashed_at) {
        throw new GoalBoardV1Error("goal.trashed", "回收站中的 Goal 不能提交 Review");
      }
      if (!input.reasoning.trim()) throw new GoalBoardV1Error("review.reasoning_required", "Review 必须说明判断理由");
      const obligation = this.store.db
        .prepare("SELECT * FROM review_obligations WHERE obligation_id = ? AND goal_id = ?")
        .get(input.obligation_id, input.goal_id) as Row | undefined;
      if (!obligation) throw new GoalBoardV1Error("review.obligation_not_found", "找不到这项 Review 要求");
      if (asText(obligation.state) !== "pending") {
        throw new GoalBoardV1Error("review.obligation_closed", "这项 Review 要求已经关闭");
      }
      const latestWorkRun = this.store.db
        .prepare(`
          SELECT state FROM runs
          WHERE board_id = ? AND goal_id = ? AND role IN ('executor', 'revalidator')
          ORDER BY started_at DESC, run_id DESC
          LIMIT 1
        `)
        .get(input.board_id, input.goal_id) as Row | undefined;
      if (!latestWorkRun || asText(latestWorkRun.state) !== "completed") {
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
          const referenced = this.store.db
            .prepare(`
              SELECT evidence.board_id, evidence.goal_id, correction.correction_id
              FROM evidence
              LEFT JOIN evidence_corrections correction
                ON correction.target_evidence_id = evidence.evidence_id
              WHERE evidence.evidence_id = ?
            `)
            .get(evidenceRef) as Row | undefined;
          if (!referenced) continue;
          if (asText(referenced.board_id) !== input.board_id || asText(referenced.goal_id) !== input.goal_id) {
            throw new GoalBoardV1Error(
              "review.evidence_wrong_goal",
              "Review 引用的 Evidence 不属于这个 Goal",
            );
          }
          if (referenced.correction_id != null) {
            throw new GoalBoardV1Error(
              "review.evidence_not_effective",
              "Review 通过只能引用当前有效 Evidence；已被替代或撤销的记录只保留为历史",
            );
          }
        }
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
          sqliteJson(evidenceRefs),
          input.reasoning.trim(),
          now,
        );
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
      if (input.verdict === "needs_changes") {
        this.store.db
          .prepare("UPDATE review_obligations SET state = 'pending' WHERE goal_id = ? AND state = 'satisfied'")
          .run(input.goal_id);
      }
      if (input.verdict === "pass") {
        const passed = this.store.db
          .prepare(`
            SELECT COUNT(DISTINCT review.actor_id) AS count
            FROM reviews review
            JOIN events event
              ON event.object_id = review.review_id
             AND event.type = 'review.submitted'
            WHERE review.obligation_id = ?
              AND review.verdict = 'pass'
              AND event.seq > COALESCE((
                SELECT MAX(work_event.seq)
                FROM events work_event
                JOIN runs run ON run.run_id = work_event.object_id
                WHERE work_event.board_id = ?
                  AND work_event.type = 'run.completed'
                  AND run.goal_id = ?
                  AND run.role IN ('executor', 'revalidator')
              ), 0)
          `)
          .get(input.obligation_id, input.board_id, input.goal_id) as Row;
        if (Number(passed.count ?? 0) >= Number(obligation.required_count ?? 0)) {
          this.store.db
            .prepare("UPDATE review_obligations SET state = 'satisfied' WHERE obligation_id = ?")
            .run(input.obligation_id);
        }
      }
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
      if (goal.trashed_at) {
        reasons.push(reason("goal.trashed", "goal", goal.goal_id, "回收站中的 Goal 不能完成", { trashed_at: goal.trashed_at }));
      }
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
        .prepare(`
          SELECT evidence.criterion_ids_json, evidence.result
          FROM evidence
          LEFT JOIN evidence_corrections correction
            ON correction.target_evidence_id = evidence.evidence_id
          WHERE evidence.goal_id = ? AND correction.correction_id IS NULL
        `)
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
      const activeGoalCleared = this.clearActiveGoalIfMatches(
        input.board_id,
        input.goal_id,
        now,
      );
      this.store.appendEvent({
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
      const cursor = this.reconcileCompoundAncestors(
        input.board_id,
        input.goal_id,
        input.actor_id,
        now,
      );
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
        reason: "目标说明方案已提交，等待用户决定",
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
              state, reason, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?)
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
              affected_surfaces_json, trigger, treatment, treatment_plan, blocking_mode,
              revisit_condition, owner, state, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
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
            risk.treatment_plan?.trim() ?? "",
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
      this.closeOpenClarificationSessions(
        input.board_id,
        goalId,
        input.actor_id,
        `用户批准 Contract Proposal ${input.proposal_id}，Draft 澄清结束`,
        now,
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
      const addedPartOfRelations: Array<{ fromGoalId: string; toGoalId: string }> = [];
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
      const snapshotBeforeRewire = this.store.snapshot(input.board_id);
      const projectedChanges = relations.flatMap((relation, index) => {
        const fromGoalId = String(relation.from_goal_id ?? formalGoalId).replace("$new_goal", formalGoalId);
        const toGoalId = String(relation.to_goal_id ?? "").replace("$new_goal", formalGoalId);
        const type = String(relation.type ?? "part_of") as GoalRelationRecord["type"];
        if (!fromGoalId || !toGoalId || !validTypes.has(type)) return [];
        const action = String(relation.action ?? "add") === "deactivate" ? "deactivate" as const : "add" as const;
        return [{
          action,
          relation_id: action === "add" ? `rewire:${input.rewire_id}:${index}` : null,
          from_goal_id: fromGoalId,
          to_goal_id: toGoalId,
          type,
          reason: String(relation.reason ?? input.reason),
        }];
      });
      const baselinePlanningIssues = new Set(
        validatePlanningGraph(snapshotBeforeRewire.goals, snapshotBeforeRewire.relations)
          .map((issue) => `${issue.code}:${issue.path.join("\u0000")}`),
      );
      const projectedPlanningIssue = validatePlanningGraph(
        snapshotBeforeRewire.goals,
        projectPlanningRelations(snapshotBeforeRewire.relations, projectedChanges),
      ).find((issue) => !baselinePlanningIssues.has(`${issue.code}:${issue.path.join("\u0000")}`));
      if (projectedPlanningIssue) {
        throw new GoalBoardV1Error(projectedPlanningIssue.code, projectedPlanningIssue.message);
      }
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
          this.requireNonTrashedGoalOnBoard(input.board_id, fromGoalId);
          this.requireNonTrashedGoalOnBoard(input.board_id, toGoalId);
          if (type === "part_of" && this.wouldCreatePartOfCycle(input.board_id, fromGoalId, toGoalId)) {
            throw new GoalBoardV1Error(
              "rewire.part_of_cycle",
              "Rewire 会形成循环父子关系，请先调整拆分方向",
            );
          }
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
          if (type === "part_of") addedPartOfRelations.push({ fromGoalId, toGoalId });
        } else {
          throw new GoalBoardV1Error(
            "rewire.action_invalid",
            "Rewire action 必须是 add 或 deactivate",
          );
        }
        if (fromGoalId !== formalGoalId) revalidatedGoals.add(fromGoalId);
      }
      for (const relation of addedPartOfRelations) {
        const reopened = this.reopenSatisfiedCompoundParent(
          input.board_id,
          relation.toGoalId,
          input.actor_id,
          now,
        );
        if (!reopened) {
          this.reconcileCompoundAncestors(
            input.board_id,
            relation.fromGoalId,
            input.actor_id,
            now,
          );
        }
      }
      for (const impact of proposal.impacts ?? []) {
        const surface = String(impact.surface ?? "").trim();
        const access = String(impact.access ?? "read");
        if (!surface || !["read", "write", "decide", "exclusive"].includes(access)) continue;
        this.store.db
          .prepare(`
            INSERT INTO impact_bindings (
              binding_id, board_id, goal_id, surface, access, input_snapshot,
              state, reason, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?)
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
        const treatmentPlan = String(risk.treatment_plan ?? "").trim();
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
              affected_surfaces_json, trigger, treatment, treatment_plan, blocking_mode,
              revisit_condition, owner, state, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
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
            treatmentPlan,
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
    const criteria = this.store.getGoal(goalId)?.acceptance_criteria ?? [];
    const runtimeCriterionIds = criteria
      .filter((criterion) => criterion.decision_method !== "human_decision")
      .map((criterion) => criterion.criterion_id);
    const humanCriterionIds = criteria
      .filter((criterion) => criterion.decision_method === "human_decision")
      .map((criterion) => criterion.criterion_id);
    const allCriterionIds = criteria.map((criterion) => criterion.criterion_id);
    const obligations: Array<{
      role: "self_verifier" | "cross_reviewer" | "adversarial_reviewer" | "human_approver";
      count: number;
      independence: string;
      criterionIds: string[];
    }> = [];
    if (policy.self_verification && runtimeCriterionIds.length > 0) {
      obligations.push({
        role: "self_verifier",
        count: 1,
        independence: "executor_allowed",
        criterionIds: runtimeCriterionIds,
      });
    }
    if (policy.cross_reviewers > 0 && runtimeCriterionIds.length > 0) {
      obligations.push({
        role: "cross_reviewer",
        count: policy.cross_reviewers,
        independence: "actor_must_differ_from_executor",
        criterionIds: runtimeCriterionIds,
      });
    }
    if (policy.adversarial_reviewers > 0 && runtimeCriterionIds.length > 0) {
      obligations.push({
        role: "adversarial_reviewer",
        count: policy.adversarial_reviewers,
        independence: "actor_must_differ_from_executor",
        criterionIds: runtimeCriterionIds,
      });
    }
    if (policy.human_approval || humanCriterionIds.length > 0) {
      obligations.push({
        role: "human_approver",
        count: 1,
        independence: "user_authority",
        criterionIds: policy.human_approval ? allCriterionIds : humanCriterionIds,
      });
    }

    const desiredRoles = new Set(obligations.map((obligation) => obligation.role));
    const existingRuntimeObligations = this.store.db
      .prepare(`
        SELECT obligation_id, role, state
        FROM review_obligations
        WHERE goal_id = ?
          AND role IN ('self_verifier', 'cross_reviewer', 'adversarial_reviewer')
      `)
      .all(goalId) as Row[];
    for (const existing of existingRuntimeObligations) {
      if (desiredRoles.has(asText(existing.role) as typeof obligations[number]["role"])) continue;
      if (asText(existing.state) !== "pending") continue;
      this.store.db
        .prepare("UPDATE review_obligations SET criterion_scope_json = '[]', state = 'waived' WHERE obligation_id = ?")
        .run(asText(existing.obligation_id));
    }

    for (const obligation of obligations) {
      const existing = this.store.db
        .prepare("SELECT obligation_id, criterion_scope_json FROM review_obligations WHERE goal_id = ? AND role = ?")
        .get(goalId, obligation.role) as Row | undefined;
      if (existing) {
        const currentScope = parseJson<string[]>(existing.criterion_scope_json, []);
        if (JSON.stringify(currentScope) !== JSON.stringify(obligation.criterionIds)) {
          this.store.db
            .prepare("UPDATE review_obligations SET criterion_scope_json = ? WHERE obligation_id = ?")
            .run(sqliteJson(obligation.criterionIds), asText(existing.obligation_id));
        }
        continue;
      }
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
          sqliteJson(obligation.criterionIds),
          at,
        );
    }
  }

  private readDraftDialogueView(
    boardId: string,
    goalId: string,
    sessionId: string,
    observedEventCursor?: number,
  ): DraftDialogueView {
    const snapshot = this.store.snapshot(boardId);
    const dialogue = snapshot.clarification_sessions.find((item) => item.session_id === sessionId);
    if (!dialogue || dialogue.goal_id !== goalId) {
      throw new GoalBoardV1Error("draft_dialogue.not_found", "找不到这条 Goal 澄清记录");
    }
    const goal = snapshot.goals.find((item) => item.goal_id === goalId);
    if (!goal) throw new GoalBoardV1Error("goal.not_found", `找不到这个 Goal: ${goalId}`);
    const workState = this.deriveGoalWorkState(boardId, goal, snapshot, this.clock().toISOString());
    return {
      dialogue,
      turns: snapshot.clarification_turns.filter((item) => item.session_id === sessionId),
      goal,
      work_state: workState,
      claim: workState.active_claim,
      run: workState.active_run,
      observed_event_cursor: observedEventCursor ?? snapshot.cursor,
    };
  }

  private requireOpenClarificationSession(
    boardId: string,
    goalId: string,
  ): ClarificationSessionRecord {
    this.requireGoalOnBoard(boardId, goalId);
    const session = this.store
      .snapshot(boardId)
      .clarification_sessions.find((item) => item.goal_id === goalId && item.state !== "closed");
    if (!session) {
      throw new GoalBoardV1Error(
        "draft_dialogue.not_found",
        "这个 Goal 没有可恢复的澄清记录；请先使用 draft_dialogue_start 初始化",
      );
    }
    return session;
  }

  private closeOpenClarificationSessions(
    boardId: string,
    goalId: string,
    actorId: string,
    reason: string,
    at: string,
  ): string[] {
    const sessions = this.store.db
      .prepare(`
        SELECT session_id, state
        FROM clarification_sessions
        WHERE board_id = ? AND goal_id = ? AND state != 'closed'
        ORDER BY session_id
      `)
      .all(boardId, goalId) as Row[];
    for (const session of sessions) {
      const sessionId = asText(session.session_id);
      this.store.db
        .prepare(`
          UPDATE clarification_sessions
          SET state = 'closed', updated_at = ?, closed_at = ?
          WHERE session_id = ? AND state != 'closed'
        `)
        .run(at, at, sessionId);
      this.store.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId,
        type: "clarification.closed",
        objectType: "clarification_session",
        objectId: sessionId,
        reason,
        payload: {
          goal_id: goalId,
          previous_state: asText(session.state),
          definition_state: "accepted",
        },
        at,
      });
    }
    return sessions.map((session) => asText(session.session_id));
  }

  private requireActiveClarificationRun(
    boardId: string,
    goalId: string,
    runId: string,
    actorId: string,
  ): { claim_id: string } {
    const row = this.store.db
      .prepare(`
        SELECT r.claim_id, r.actor_id AS run_actor_id, r.role AS run_role, r.state AS run_state,
               c.actor_id AS claim_actor_id, c.state AS claim_state, c.expires_at AS claim_expires_at
        FROM runs r
        JOIN claims c ON c.claim_id = r.claim_id
        WHERE r.board_id = ? AND r.goal_id = ? AND r.run_id = ?
      `)
      .get(boardId, goalId, runId) as Row | undefined;
    if (!row) throw new GoalBoardV1Error("draft_dialogue.run_not_found", "找不到这条 Goal 澄清 Run");
    if (asText(row.run_actor_id) !== actorId || asText(row.claim_actor_id) !== actorId) {
      throw new GoalBoardV1Error("draft_dialogue.run_not_owner", "只有当前澄清 Runtime 可以写入本轮对话进展");
    }
    if (asText(row.run_role) !== "clarifier") {
      throw new GoalBoardV1Error("draft_dialogue.clarifier_required", "只有 clarifier Run 可以记录 Goal 澄清");
    }
    if (asText(row.run_state) !== "started") {
      throw new GoalBoardV1Error("draft_dialogue.run_not_active", "这条澄清 Run 已不在进行中，请先恢复 Goal 澄清对话");
    }
    if (asText(row.claim_state) !== "active" || asText(row.claim_expires_at) <= this.clock().toISOString()) {
      throw new GoalBoardV1Error("draft_dialogue.claim_not_active", "澄清 Claim 已释放、撤销或过期，请先恢复 Goal 澄清对话");
    }
    return { claim_id: asText(row.claim_id) };
  }

  private requireActiveClarificationProposalRun(
    boardId: string,
    runId: string,
    actorId: string,
  ): void {
    const row = this.store.db
      .prepare(`
        SELECT r.actor_id AS run_actor_id, r.role AS run_role, r.state AS run_state,
               c.actor_id AS claim_actor_id, c.state AS claim_state, c.expires_at AS claim_expires_at
        FROM runs r
        JOIN claims c ON c.claim_id = r.claim_id
        WHERE r.board_id = ? AND r.run_id = ?
      `)
      .get(boardId, runId) as Row | undefined;
    if (!row) {
      throw new GoalBoardV1Error("goal_tree_proposal.run_not_found", "找不到提交 Goal Tree 提案所引用的澄清 Run");
    }
    if (asText(row.run_actor_id) !== actorId || asText(row.claim_actor_id) !== actorId) {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.run_not_owner",
        "只有当前澄清 Runtime 可以提交这份 Goal Tree 提案",
      );
    }
    if (asText(row.run_role) !== "clarifier" || asText(row.run_state) !== "started") {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.clarifier_run_required",
        "统一 Goal Tree 提案必须来自正在进行中的 clarifier Run",
      );
    }
    if (asText(row.claim_state) !== "active" || asText(row.claim_expires_at) <= this.clock().toISOString()) {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.claim_not_active",
        "澄清 Claim 已释放、撤销或过期，不能提交 Goal Tree 提案",
      );
    }
  }

  private readNativeGoalTreeProposal(boardId: string, proposalId: string): GoalTreeProposalRecord {
    this.requireBoard(boardId);
    const proposal = this.store
      .snapshot(boardId)
      .goal_tree_proposals.find((item) => item.proposal_id === proposalId);
    if (!proposal) {
      throw new GoalBoardV1Error("goal_tree_proposal.not_found", `找不到 Goal Tree 提案: ${proposalId}`);
    }
    return proposal;
  }

  private proposalObjectVersion(boardId: string, object: ProposalAffectedObject): ProposalObjectVersion {
    const snapshot = this.store.snapshot(boardId);
    let current: unknown = null;
    switch (object.object_type) {
      case "goal":
        current = snapshot.goals.find((item) => item.goal_id === object.object_id) ?? null;
        break;
      case "relation":
        current = snapshot.relations.find((item) => item.relation_id === object.object_id) ?? null;
        break;
      case "risk":
        current = snapshot.risks.find((item) => item.risk_id === object.object_id) ?? null;
        break;
      case "candidate":
        current = snapshot.candidates.find((item) => item.candidate_id === object.object_id) ?? null;
        break;
      case "rewire":
        current = snapshot.rewires.find((item) => item.rewire_id === object.object_id) ?? null;
        break;
      case "policy":
        current = this.store.db
          .prepare("SELECT * FROM policy_bindings WHERE board_id = ? AND policy_binding_id = ?")
          .get(boardId, object.object_id) ?? null;
        break;
    }
    return {
      object_type: object.object_type,
      object_id: object.object_id,
      exists: current != null,
      version: current == null ? "absent" : requestHash(current),
    };
  }

  private goalTreeProposalItemConflicts(
    boardId: string,
    item: GoalTreeProposalItemRecord,
  ): Array<Record<string, unknown>> {
    return item.baseline_versions.flatMap((baseline) => {
      const current = this.proposalObjectVersion(boardId, baseline);
      return baseline.exists === current.exists && baseline.version === current.version
        ? []
        : [{
            object: { object_type: baseline.object_type, object_id: baseline.object_id },
            baseline,
            current,
          }];
    });
  }

  private wouldCreatePartOfCycle(boardId: string, fromGoalId: string, toGoalId: string): boolean {
    const snapshot = this.store.snapshot(boardId);
    const projectedId = "projected:part-of-cycle-check";
    return validatePlanningGraph(
      snapshot.goals,
      projectPlanningRelations(snapshot.relations, [{
        action: "add",
        relation_id: projectedId,
        from_goal_id: fromGoalId,
        to_goal_id: toGoalId,
        type: "part_of",
      }]),
    ).some((issue) => issue.code === "planning.part_of_cycle" && issue.relation_ids.includes(projectedId));
  }

  private recordGoalTreeProposalItemDecision(input: {
    board_id: string;
    proposal_id: string;
    item: GoalTreeProposalItemRecord;
    item_state: GoalTreeProposalItemRecord["state"];
    decision: GoalTreeProposalDecisionRecord["decision"];
    authority: GoalTreeProposalDecisionAuthority;
    runtime_actor_id: string | null;
    reason: string;
    conflict: Record<string, unknown> | null;
    materialized_objects: ProposalAffectedObject[];
    revision_proposal_id: string | null;
    at: string;
  }): GoalTreeProposalDecisionRecord {
    const decisionId = `goal-tree-decision-${randomUUID()}`;
    this.store.db
      .prepare(`
        INSERT INTO goal_tree_proposal_decisions (
          decision_id, board_id, proposal_id, item_id, decision, actor_id,
          authority_source, runtime_actor_id, conversation_ref, message_ref,
          reason, revision_proposal_id, materialized_objects_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        decisionId,
        input.board_id,
        input.proposal_id,
        input.item.item_id,
        input.decision,
        input.authority.actor_id,
        input.authority.authority_source,
        input.runtime_actor_id,
        input.authority.conversation_ref,
        input.authority.message_ref,
        input.reason,
        input.revision_proposal_id,
        sqliteJson(input.materialized_objects),
        input.at,
      );
    this.store.db
      .prepare(`
        UPDATE goal_tree_proposal_items
        SET state = ?, conflict_json = ?, materialized_objects_json = ?,
            revision_proposal_id = ?, updated_at = ?
        WHERE board_id = ? AND proposal_id = ? AND item_id = ?
      `)
      .run(
        input.item_state,
        input.conflict == null ? null : sqliteJson(input.conflict),
        sqliteJson(input.materialized_objects),
        input.revision_proposal_id,
        input.at,
        input.board_id,
        input.proposal_id,
        input.item.item_id,
      );
    this.store.appendEvent({
      eventId: randomUUID(),
      boardId: input.board_id,
      actorId: input.authority.actor_id,
      type: `goal_tree_proposal.item_${input.decision}`,
      objectType: "goal_tree_proposal_item",
      objectId: input.item.item_id,
      reason: input.reason,
      payload: {
        proposal_id: input.proposal_id,
        item_state: input.item_state,
        authority_source: input.authority.authority_source,
        conversation_ref: input.authority.conversation_ref,
        message_ref: input.authority.message_ref,
        runtime_actor_id: input.runtime_actor_id,
        materialized_objects: input.materialized_objects,
        revision_proposal_id: input.revision_proposal_id,
        conflict: input.conflict,
      },
      at: input.at,
    });
    return {
      decision_id: decisionId,
      board_id: input.board_id,
      proposal_id: input.proposal_id,
      item_id: input.item.item_id,
      decision: input.decision,
      actor_id: input.authority.actor_id,
      authority_source: input.authority.authority_source,
      runtime_actor_id: input.runtime_actor_id,
      conversation_ref: input.authority.conversation_ref,
      message_ref: input.authority.message_ref,
      reason: input.reason,
      revision_proposal_id: input.revision_proposal_id,
      materialized_objects: input.materialized_objects,
      created_at: input.at,
    };
  }

  private refreshGoalTreeProposalState(
    boardId: string,
    proposalId: string,
    actorId: string,
    at: string,
  ): void {
    const proposal = this.readNativeGoalTreeProposal(boardId, proposalId);
    const states = proposal.items.map((item) => item.state);
    const hasOpen = states.some((state) => state === "pending" || state === "conflict");
    const hasApplied = states.includes("applied");
    const hasRejected = states.includes("rejected");
    const hasSuperseded = states.includes("superseded");
    let state: GoalTreeProposalRecord["state"];
    if (hasOpen) {
      state = hasApplied || hasRejected || hasSuperseded ? "partially_applied" : "pending";
    } else if (states.length > 0 && states.every((item) => item === "applied")) {
      state = "approved";
    } else if (states.length > 0 && states.every((item) => item === "rejected")) {
      state = "rejected";
    } else if (states.length > 0 && states.every((item) => item === "superseded")) {
      state = "superseded";
    } else if (hasRejected) {
      state = "closed";
    } else {
      state = "closed";
    }
    this.store.db
      .prepare(`
        UPDATE goal_tree_proposals
        SET state = ?, decision_json = ?, updated_at = ?, decided_at = ?
        WHERE board_id = ? AND proposal_id = ?
      `)
      .run(
        state,
        sqliteJson({
          item_states: Object.fromEntries(proposal.items.map((item) => [item.item_id, item.state])),
          latest_decision_ids: proposal.decisions.map((decision) => decision.decision_id),
        }),
        at,
        hasOpen ? null : at,
        boardId,
        proposalId,
      );
    this.store.appendEvent({
      eventId: randomUUID(),
      boardId,
      actorId,
      type: "goal_tree_proposal.state_updated",
      objectType: "goal_tree_proposal",
      objectId: proposalId,
      reason: "根据逐项用户决定更新统一 Goal Tree 提案状态",
      payload: { state, item_states: Object.fromEntries(proposal.items.map((item) => [item.item_id, item.state])) },
      at,
    });
  }

  private createGoalTreeProposalRevision(
    boardId: string,
    proposal: GoalTreeProposalRecord,
    revisions: Array<NormalizedGoalTreeProposalDecision & { revised_item: NormalizedGoalTreeProposalItem }>,
    authority: GoalTreeProposalDecisionAuthority,
    runtimeActorId: string | null,
    at: string,
  ): GoalTreeProposalRecord {
    const proposalId = `goal-tree-proposal-${randomUUID()}`;
    const itemIds = new Set<string>();
    for (const revision of revisions) {
      if (itemIds.has(revision.revised_item.item_id)) {
        throw new GoalBoardV1Error(
          "goal_tree_proposal.revision_item_id_duplicate",
          "同一份修订提案中的新 item_id 不能重复",
        );
      }
      itemIds.add(revision.revised_item.item_id);
      const existing = this.store.db
        .prepare("SELECT item_id FROM goal_tree_proposal_items WHERE item_id = ?")
        .get(revision.revised_item.item_id);
      if (existing) {
        throw new GoalBoardV1Error(
          "goal_tree_proposal.revision_item_id_exists",
          "修订条目必须使用新的稳定 item_id",
        );
      }
    }
    const version = proposal.version + 1;
    const summary = `用户要求修订 v${proposal.version}：${revisions.map((item) => item.reason).join("；")}`;
    this.store.db
      .prepare(`
        INSERT INTO goal_tree_proposals (
          proposal_id, board_id, root_goal_id, submitted_by, discovered_in_run_id,
          state, version, supersedes_proposal_id, base_event_cursor, summary,
          decision_json, created_at, updated_at, decided_at
        ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, NULL, ?, ?, NULL)
      `)
      .run(
        proposalId,
        boardId,
        proposal.root_goal_id,
        runtimeActorId ?? authority.actor_id,
        proposal.discovered_in_run_id,
        version,
        proposal.proposal_id,
        this.store.eventCursor(boardId),
        summary,
        at,
        at,
      );
    const insertItem = this.store.db.prepare(`
      INSERT INTO goal_tree_proposal_items (
        item_id, proposal_id, board_id, ordinal, kind, operation, payload_json,
        source_refs_json, reason, confidence, affected_objects_json,
        baseline_versions_json, requires_user_confirmation, state, conflict_json,
        materialized_objects_json, revision_proposal_id, supersedes_item_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'pending', NULL, '[]', NULL, ?, ?, ?)
    `);
    for (const [index, revision] of revisions.entries()) {
      const item = revision.revised_item;
      const baselineVersions = item.affected_objects.map((object) => this.proposalObjectVersion(boardId, object));
      insertItem.run(
        item.item_id,
        proposalId,
        boardId,
        index + 1,
        item.kind,
        item.operation,
        sqliteJson(item.payload),
        sqliteJson(item.source_refs),
        item.reason,
        item.confidence,
        sqliteJson(item.affected_objects),
        sqliteJson(baselineVersions),
        revision.item_id,
        at,
        at,
      );
    }
    this.store.appendEvent({
      eventId: randomUUID(),
      boardId,
      actorId: authority.actor_id,
      type: "goal_tree_proposal.revision_requested",
      objectType: "goal_tree_proposal",
      objectId: proposalId,
      reason: "用户在当前对话要求修订部分 Goal Tree 条目",
      payload: {
        supersedes_proposal_id: proposal.proposal_id,
        supersedes_item_ids: revisions.map((item) => item.item_id),
        authority_source: authority.authority_source,
        conversation_ref: authority.conversation_ref,
        message_ref: authority.message_ref,
      },
      at,
    });
    return this.readNativeGoalTreeProposal(boardId, proposalId);
  }

  private goalTreePayloadRecord(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.payload_shape_invalid",
        `${label} 必须是结构化对象`,
      );
    }
    return value as Record<string, unknown>;
  }

  private goalTreeStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? unique(value.map(String).map((item) => item.trim()).filter(Boolean))
      : [];
  }

  private goalTreeGoalInput(item: GoalTreeProposalItemRecord): CreateGoalInput {
    const payload = this.goalTreePayloadRecord(item.payload, "Goal Tree 条目 payload");
    const raw = this.goalTreePayloadRecord(payload.goal ?? payload.proposed_goal ?? payload, "Goal Contract");
    const definitionState = raw.definition_state == null ? undefined : String(raw.definition_state);
    const decompositionState = raw.decomposition_state == null ? undefined : String(raw.decomposition_state);
    if (definitionState != null && definitionState !== "draft" && definitionState !== "accepted") {
      throw new GoalBoardV1Error("goal_tree_proposal.goal_definition_invalid", "Goal definition_state 无效");
    }
    if (
      decompositionState != null &&
      !["abstract", "frontier_open", "closed_leaf", "closed_compound"].includes(decompositionState)
    ) {
      throw new GoalBoardV1Error("goal_tree_proposal.goal_decomposition_invalid", "Goal decomposition_state 无效");
    }
    const acceptance = Array.isArray(raw.acceptance_criteria)
      ? raw.acceptance_criteria.map((criterion) => {
          const value = this.goalTreePayloadRecord(criterion, "验收条件");
          return {
            ...(value.criterion_id == null ? {} : { criterion_id: String(value.criterion_id) }),
            statement: String(value.statement ?? ""),
            decision_method: String(value.decision_method ?? "inspection") as CreateGoalInput["acceptance_criteria"][number]["decision_method"],
            pass_condition: String(value.pass_condition ?? ""),
            target:
              value.target == null || typeof value.target !== "object" || Array.isArray(value.target)
                ? null
                : value.target as Record<string, unknown>,
            required_evidence: this.goalTreeStringArray(value.required_evidence),
          };
        })
      : [];
    const goal: CreateGoalInput = {
      ...(raw.goal_id == null ? {} : { goal_id: String(raw.goal_id) }),
      title: String(raw.title ?? ""),
      outcome: String(raw.outcome ?? ""),
      why: String(raw.why ?? ""),
      business_logic: String(raw.business_logic ?? ""),
      in_scope: this.goalTreeStringArray(raw.in_scope),
      out_of_scope: this.goalTreeStringArray(raw.out_of_scope),
      constraints: this.goalTreeStringArray(raw.constraints),
      required_inputs: this.goalTreeStringArray(raw.required_inputs),
      promised_outputs: this.goalTreeStringArray(raw.promised_outputs),
      ...(definitionState == null ? {} : { definition_state: definitionState as CreateGoalInput["definition_state"] }),
      ...(decompositionState == null
        ? {}
        : { decomposition_state: decompositionState as CreateGoalInput["decomposition_state"] }),
      ...(readDecompositionReview(raw.decomposition_review) == null
        ? {}
        : { decomposition_review: readDecompositionReview(raw.decomposition_review)! }),
      ...(typeof raw.priority === "number" ? { priority: raw.priority } : {}),
      acceptance_criteria: acceptance,
    };
    this.validateGoalInput(goal);
    return goal;
  }

  private goalTreeTargetGoalId(item: GoalTreeProposalItemRecord, goal: CreateGoalInput): string {
    const payload = this.goalTreePayloadRecord(item.payload, "Goal Tree 条目 payload");
    const target = String(payload.goal_id ?? goal.goal_id ?? "").trim();
    if (!target) {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.goal_id_required",
        "物化或更新 Goal 时需要稳定的 goal_id",
      );
    }
    return target;
  }

  private goalTreeRelationEntries(item: GoalTreeProposalItemRecord): Record<string, unknown>[] {
    const payload = this.goalTreePayloadRecord(item.payload, "关系条目 payload");
    const nested = payload.rewire && typeof payload.rewire === "object" && !Array.isArray(payload.rewire)
      ? payload.rewire as Record<string, unknown>
      : payload.proposal && typeof payload.proposal === "object" && !Array.isArray(payload.proposal)
        ? payload.proposal as Record<string, unknown>
        : payload;
    const source = nested.relations ?? nested.relation ?? payload.relations ?? payload.relation ?? nested;
    const values = Array.isArray(source) ? source : [source];
    if (values.length === 0) {
      throw new GoalBoardV1Error("goal_tree_proposal.relations_required", "关系条目至少需要一条关系");
    }
    return values.map((value) => this.goalTreePayloadRecord(value, "关系"));
  }

  private goalTreePlanningIssues(
    boardId: string,
    items: readonly Pick<GoalTreeProposalItemRecord, "item_id" | "kind" | "operation" | "payload">[],
  ): PlanningGraphIssue[] {
    const snapshot = this.store.snapshot(boardId);
    const existing = new Set(
      validatePlanningGraph(snapshot.goals, snapshot.relations)
        .map((issue) => `${issue.code}:${issue.path.join("\u0000")}`),
    );
    return validatePlanningProposalGraph(snapshot.goals, snapshot.relations, items)
      .filter((issue) => !existing.has(`${issue.code}:${issue.path.join("\u0000")}`));
  }

  private normalizeGoalTreeRelation(
    item: GoalTreeProposalItemRecord,
    relation: Record<string, unknown>,
  ): {
    action: "add" | "deactivate";
    relation_id: string | null;
    from_goal_id: string;
    to_goal_id: string;
    type: GoalRelationRecord["type"] | null;
    reason: string;
  } {
    const action = String(relation.action ?? (item.operation === "deactivate" ? "deactivate" : "add"));
    if (action !== "add" && action !== "deactivate") {
      throw new GoalBoardV1Error("goal_tree_proposal.relation_action_invalid", "关系条目的 action 必须是 add 或 deactivate");
    }
    const relationId = String(relation.relation_id ?? "").trim() || null;
    const fromGoalId = String(relation.from_goal_id ?? "").trim();
    const toGoalId = String(relation.to_goal_id ?? "").trim();
    const rawType = item.kind === "dependency" ? "depends_on" : String(relation.type ?? "").trim();
    const type = rawType
      ? rawType as GoalRelationRecord["type"]
      : null;
    if (type && !GOAL_RELATION_TYPES.has(type)) {
      throw new GoalBoardV1Error("goal_tree_proposal.relation_type_invalid", "关系条目的 type 无效");
    }
    if (action === "add" && (!fromGoalId || !toGoalId || !type)) {
      throw new GoalBoardV1Error("goal_tree_proposal.relation_required", "新增关系需要起点、终点和类型");
    }
    if (action === "deactivate" && !relationId && (!fromGoalId || !toGoalId || !type)) {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.relation_required",
        "停用关系需要 relation_id，或完整的起点、终点和类型",
      );
    }
    if (fromGoalId && toGoalId && fromGoalId === toGoalId) {
      throw new GoalBoardV1Error("goal_tree_proposal.relation_self_reference", "Goal 不能关联到自身");
    }
    return {
      action,
      relation_id: relationId,
      from_goal_id: fromGoalId,
      to_goal_id: toGoalId,
      type,
      reason: String(relation.reason ?? "").trim(),
    };
  }

  /**
   * Accepted Goal 的业务 Contract 仍不可变。唯一例外是用户明确确认：
   * 已有子 Goal 的父级不再继续扩展，正式收口为 closed_compound。
   */
  private acceptedCompoundClosureConflict(
    boardId: string,
    item: GoalTreeProposalItemRecord,
    existing: GoalRecord,
    goal: CreateGoalInput,
    goalId: string,
  ): Record<string, unknown> | null {
    const objects = [{ object_type: "goal", object_id: goalId }];
    if (item.operation !== "update" || goal.definition_state !== "accepted") {
      return {
        code: "goal.accepted_compound_closure_invalid",
        message: "已接受父 Goal 的拆分收口只能保留 accepted 状态并更新已有 Goal",
        objects,
      };
    }
    if (
      !["abstract", "frontier_open"].includes(existing.decomposition_state) ||
      goal.decomposition_state !== "closed_compound"
    ) {
      return {
        code: "goal.accepted_compound_closure_invalid",
        message: "已接受父 Goal 只能从 abstract 或 frontier_open 收口为 closed_compound",
        objects,
      };
    }
    if (!this.acceptedGoalBusinessContractMatches(existing, goal)) {
      return {
        code: "goal.accepted_contract_immutable",
        message: "已接受的 Goal 收口时不能修改业务 Contract 或验收条件",
        objects,
      };
    }
    if (this.activePartOfChildren(boardId, goalId).length === 0) {
      return {
        code: "goal.accepted_compound_closure_children_required",
        message: "已接受父 Goal 收口前至少需要一个生效的 part_of 子 Goal",
        objects,
      };
    }
    return null;
  }

  private acceptedGoalBusinessContractMatches(existing: GoalRecord, goal: CreateGoalInput): boolean {
    const existingCriteria = existing.acceptance_criteria.map(({ goal_id: _goalId, ...criterion }) => criterion);
    const existingContract = {
      title: existing.title,
      outcome: existing.outcome,
      why: existing.why,
      business_logic: existing.business_logic,
      in_scope: existing.in_scope,
      out_of_scope: existing.out_of_scope,
      constraints: existing.constraints,
      required_inputs: existing.required_inputs,
      promised_outputs: existing.promised_outputs,
      priority: existing.priority,
      acceptance_criteria: existingCriteria,
    };
    const proposedContract = {
      title: goal.title.trim(),
      outcome: goal.outcome.trim(),
      why: goal.why.trim(),
      business_logic: goal.business_logic.trim(),
      in_scope: goal.in_scope ?? [],
      out_of_scope: goal.out_of_scope ?? [],
      constraints: goal.constraints ?? [],
      required_inputs: goal.required_inputs ?? [],
      promised_outputs: goal.promised_outputs ?? [],
      priority: goal.priority,
      acceptance_criteria: goal.acceptance_criteria,
    };
    return JSON.stringify(canonicalize(existingContract)) === JSON.stringify(canonicalize(proposedContract));
  }

  private activePartOfChildren(boardId: string, parentGoalId: string): Row[] {
    return this.store.db
      .prepare(`
        SELECT g.goal_id, g.fulfillment_state
        FROM goal_relations r
        JOIN goals g ON g.goal_id = r.from_goal_id
        WHERE r.board_id = ? AND r.to_goal_id = ?
          AND r.type = 'part_of' AND r.state = 'active'
        ORDER BY g.goal_id
      `)
      .all(boardId, parentGoalId) as Row[];
  }

  private goalTreeCandidatePromotionRelations(
    payload: Record<string, unknown>,
    goalId: string,
  ): Record<string, unknown>[] {
    if (payload.proposed_relations == null) return [];
    if (!Array.isArray(payload.proposed_relations)) {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.candidate_relations_invalid",
        "Candidate proposed_relations 必须是关系列表",
      );
    }
    return payload.proposed_relations.map((value) => {
      const relation = this.goalTreePayloadRecord(value, "Candidate 关系");
      return {
        ...relation,
        from_goal_id: String(relation.from_goal_id ?? "$new_goal").trim() === "$new_goal"
          ? goalId
          : String(relation.from_goal_id ?? "").trim(),
        to_goal_id: String(relation.to_goal_id ?? "").trim() === "$new_goal"
          ? goalId
          : String(relation.to_goal_id ?? "").trim(),
      };
    });
  }

  private candidateBootstrapProvenanceExists(
    boardId: string,
    candidateId: string,
    goalId: string,
    proposalId: string,
  ): boolean {
    const rows = this.store.db
      .prepare(`
        SELECT item.kind, item.operation, item.affected_objects_json,
          item.baseline_versions_json, item.materialized_objects_json
        FROM goal_tree_proposals proposal
        JOIN goal_tree_proposal_items item ON item.proposal_id = proposal.proposal_id
        WHERE proposal.board_id = ? AND proposal.proposal_id = ? AND item.state = 'applied'
        ORDER BY item.ordinal, item.item_id
      `)
      .all(boardId, proposalId) as Row[];
    return rows.some((row) => {
      if (asText(row.kind) !== "goal" || asText(row.operation) !== "create") return false;
      const affected = parseJson<ProposalAffectedObject[]>(row.affected_objects_json, []);
      const baselines = parseJson<ProposalObjectVersion[]>(row.baseline_versions_json, []);
      const materialized = parseJson<ProposalAffectedObject[]>(row.materialized_objects_json, []);
      return affected.some(
        (object) => object.object_type === "candidate" && object.object_id === candidateId,
      ) && baselines.some(
        (baseline) =>
          baseline.object_type === "candidate" &&
          baseline.object_id === candidateId &&
          baseline.exists,
      ) && materialized.some(
        (object) => object.object_type === "goal" && object.object_id === goalId,
      );
    });
  }

  private goalTreeProposalMaterializationConflict(
    boardId: string,
    item: GoalTreeProposalItemRecord,
  ): Record<string, unknown> | null {
    const missingGoalIds = new Set<string>();
    const missingObject = (objectType: ProposalAffectedObject["object_type"], objectId: string, message: string) => ({
      code: "goal_tree_proposal.reference_unresolved",
      message,
      objects: [{ object_type: objectType, object_id: objectId }],
    });
    const goalExists = (goalId: string) => Boolean(this.store.getGoal(goalId));
    if (item.kind === "goal" || item.kind === "contract") {
      const goal = this.goalTreeGoalInput(item);
      const targetGoalId = this.goalTreeTargetGoalId(item, goal);
      const existing = this.store.getGoal(targetGoalId);
      if (item.operation !== "create" && !existing) {
        return missingObject("goal", targetGoalId, "要更新的 Goal 已不存在或尚未物化");
      }
      if (item.operation === "create" && existing) {
        return missingObject("goal", targetGoalId, "要创建的 Goal 已经存在，需要基于最新事实修订");
      }
      if (item.operation !== "create" && existing?.definition_state === "accepted") {
        return this.acceptedCompoundClosureConflict(boardId, item, existing, goal, targetGoalId);
      }
      return null;
    }
    if (item.kind === "policy") {
      const payload = this.goalTreePayloadRecord(item.payload, "Policy 条目");
      const goalId = String(payload.goal_id ?? "").trim();
      if (goalId && !goalExists(goalId)) return missingObject("goal", goalId, "Policy 关联的 Goal 尚未物化");
      if (item.operation === "deactivate") {
        const bindingId = String(payload.policy_binding_id ?? "").trim();
        const current = bindingId
          ? this.store.db
              .prepare("SELECT policy_binding_id FROM policy_bindings WHERE board_id = ? AND policy_binding_id = ? AND state = 'active'")
              .get(boardId, bindingId)
          : null;
        return current
          ? null
          : missingObject("policy", bindingId || "policy_binding_id", "要停用的 Policy 已不存在或不再生效");
      }
      return null;
    }
    if (item.kind === "risk") {
      const payload = this.goalTreePayloadRecord(item.payload, "Risk 条目");
      const riskId = String(payload.risk_id ?? "").trim();
      const existing = riskId
        ? this.store.db.prepare("SELECT risk_id FROM risks WHERE board_id = ? AND risk_id = ?").get(boardId, riskId)
        : null;
      if (item.operation === "create" && existing) {
        return {
          code: "goal_tree_proposal.risk_exists",
          message: "要创建的 Risk 已存在，需要基于最新事实修订",
          objects: [{ object_type: "risk", object_id: riskId }],
        };
      }
      if (item.operation !== "create" && (!riskId || !existing)) {
        return missingObject("risk", riskId || "risk_id", "要更新或停用的 Risk 不存在");
      }
      for (const goalId of this.goalTreeStringArray(payload.goal_ids)) {
        if (!goalExists(goalId)) missingGoalIds.add(goalId);
      }
      return missingGoalIds.size > 0
        ? {
            code: "goal_tree_proposal.reference_unresolved",
            message: "Risk 关联的 Goal 尚未物化",
            objects: [...missingGoalIds].sort().map((goalId) => ({ object_type: "goal", object_id: goalId })),
          }
        : null;
    }
    if (item.kind === "candidate") {
      const payload = this.goalTreePayloadRecord(item.payload, "Candidate 条目");
      const candidateId = String(payload.candidate_id ?? "").trim();
      const candidateRow = candidateId
        ? this.store.db
            .prepare("SELECT * FROM candidates WHERE board_id = ? AND candidate_id = ?")
            .get(boardId, candidateId) as Row | undefined
        : undefined;
      if (item.operation === "create") {
        if (candidateRow) {
          return {
            code: "goal_tree_proposal.candidate_exists",
            message: "要确认的 Candidate 已存在，需要重新决定",
            objects: [{ object_type: "candidate", object_id: candidateId }],
          };
        }
        const goal = this.goalTreeGoalInput({ ...item, kind: "goal", payload: { goal: payload.proposed_goal ?? payload.goal ?? payload } });
        const goalId = this.goalTreeTargetGoalId(item, goal);
        return goalExists(goalId)
          ? {
              code: "goal_tree_proposal.goal_exists",
              message: "Candidate 对应的 Goal 已存在，需要先修订提案",
              objects: [{ object_type: "goal", object_id: goalId }],
            }
          : null;
      }
      if (item.operation !== "update") {
        return {
          code: "goal_tree_proposal.candidate_operation_invalid",
          message: "已有 Candidate 只能通过 update 晋升，不能停用",
          objects: [{ object_type: "candidate", object_id: candidateId || "candidate_id" }],
        };
      }
      if (!candidateId || !candidateRow) {
        return missingObject("candidate", candidateId || "candidate_id", "要晋升的 Candidate 不存在");
      }
      if (asText(candidateRow.state) !== "pending") {
        return {
          code: "goal_tree_proposal.candidate_not_pending",
          message: "只有仍待用户决定的 Candidate 可以通过统一提案晋升",
          objects: [{ object_type: "candidate", object_id: candidateId }],
        };
      }
      if (
        !payload.proposed_goal ||
        typeof payload.proposed_goal !== "object" ||
        Array.isArray(payload.proposed_goal) ||
        !Array.isArray(payload.proposed_relations) ||
        (payload.proposed_impacts != null && !Array.isArray(payload.proposed_impacts)) ||
        (payload.proposed_risks != null && !Array.isArray(payload.proposed_risks))
      ) {
        return {
          code: "goal_tree_proposal.candidate_final_revision_required",
          message: "Candidate 晋升提案必须明确提供最终 proposed_goal 和 proposed_relations（可以是空列表）",
          objects: [{ object_type: "candidate", object_id: candidateId }],
        };
      }
      const goal = this.goalTreeGoalInput({ ...item, kind: "goal", payload: { goal: payload.proposed_goal ?? payload.goal ?? payload } });
      const goalId = this.goalTreeTargetGoalId(item, goal);
      const requestedFormalGoalId = String(payload.formal_goal_id ?? "").trim();
      if (requestedFormalGoalId && requestedFormalGoalId !== goalId) {
        return {
          code: "goal_tree_proposal.candidate_formal_goal_mismatch",
          message: "Candidate 对账引用的 formal_goal_id 必须与最终 Contract 的稳定 goal_id 一致",
          objects: [
            { object_type: "candidate", object_id: candidateId },
            { object_type: "goal", object_id: requestedFormalGoalId },
          ],
        };
      }
      const originalGoal = parseJson<CreateGoalInput>(candidateRow.proposed_goal_json, {} as CreateGoalInput);
      const originalGoalId = originalGoal.goal_id?.trim() ?? "";
      if (originalGoalId && originalGoalId !== goalId) {
        return {
          code: "goal_tree_proposal.candidate_goal_id_changed",
          message: "修订 Candidate Contract 时不能改成另一条稳定 Goal ID",
          objects: [
            { object_type: "candidate", object_id: candidateId },
            { object_type: "goal", object_id: goalId },
          ],
        };
      }
      if (goal.definition_state !== "accepted") {
        return {
          code: "goal_tree_proposal.candidate_goal_not_accepted",
          message: "Candidate 晋升后的正式 Goal 必须是 accepted",
          objects: [{ object_type: "goal", object_id: goalId }],
        };
      }
      const candidateBaseline = item.baseline_versions.find(
        (baseline) => baseline.object_type === "candidate" && baseline.object_id === candidateId && baseline.exists,
      );
      const goalBaseline = item.baseline_versions.find(
        (baseline) => baseline.object_type === "goal" && baseline.object_id === goalId,
      );
      if (!candidateBaseline || !goalBaseline) {
        return {
          code: "goal_tree_proposal.candidate_baseline_required",
          message: "Candidate 晋升提案必须同时记录原 Candidate 和目标 Goal 的基准，才能安全处理并发变化",
          objects: [
            { object_type: "candidate", object_id: candidateId },
            { object_type: "goal", object_id: goalId },
          ],
        };
      }
      const existingGoal = this.store.getGoal(goalId);
      if (existingGoal) {
        const materializedByProposalId = String(payload.materialized_by_proposal_id ?? "").trim();
        if (
          requestedFormalGoalId !== goalId ||
          !materializedByProposalId ||
          !this.candidateBootstrapProvenanceExists(boardId, candidateId, goalId, materializedByProposalId) ||
          existingGoal.definition_state !== "accepted" ||
          existingGoal.decomposition_state !== goal.decomposition_state ||
          !this.acceptedGoalBusinessContractMatches(
            existingGoal,
            { ...goal, priority: goal.priority ?? existingGoal.priority },
          )
        ) {
          return {
            code: "goal_tree_proposal.candidate_bootstrap_unproven",
            message: "已有正式 Goal 不能自动收编；需要同一 Board 上可追溯的原统一提案和完全一致的最终 Contract",
            objects: [
              { object_type: "candidate", object_id: candidateId },
              { object_type: "goal", object_id: goalId },
            ],
          };
        }
      }
      const relations = this.goalTreeCandidatePromotionRelations(payload, goalId);
      for (const rawRelation of relations) {
        const relation = this.normalizeGoalTreeRelation(
          { ...item, kind: "relation", payload: { relations } },
          rawRelation,
        );
        if (relation.action === "deactivate") {
          const current = relation.relation_id
            ? this.store.snapshot(boardId).relations.find(
                (candidate) => candidate.relation_id === relation.relation_id && candidate.state === "active",
              )
            : this.store.snapshot(boardId).relations.find(
                (candidate) =>
                  candidate.from_goal_id === relation.from_goal_id &&
                  candidate.to_goal_id === relation.to_goal_id &&
                  candidate.type === relation.type &&
                  candidate.state === "active",
              );
          if (!current) {
            return missingObject(
              "relation",
              relation.relation_id ?? `${relation.from_goal_id}:${relation.to_goal_id}:${relation.type}`,
              "Candidate 要停用的关系已不存在或不再生效",
            );
          }
          continue;
        }
        if (relation.from_goal_id !== goalId && !goalExists(relation.from_goal_id)) {
          missingGoalIds.add(relation.from_goal_id);
        }
        if (relation.to_goal_id !== goalId && !goalExists(relation.to_goal_id)) {
          missingGoalIds.add(relation.to_goal_id);
        }
        const duplicate = this.store.snapshot(boardId).relations.find(
          (candidate) =>
            candidate.from_goal_id === relation.from_goal_id &&
            candidate.to_goal_id === relation.to_goal_id &&
            candidate.type === relation.type &&
            candidate.state === "active",
        );
        if (duplicate) {
          return {
            code: "goal_tree_proposal.relation_already_active",
            message: "Candidate 提案中的这条关系已经生效，需要基于最新事实修订",
            objects: [{ object_type: "relation", object_id: duplicate.relation_id }],
          };
        }
      }
      return missingGoalIds.size > 0
        ? {
            code: "goal_tree_proposal.reference_unresolved",
            message: "Candidate 关系引用了不存在的 Goal",
            objects: [...missingGoalIds].sort().map((missingGoalId) => ({
              object_type: "goal" as const,
              object_id: missingGoalId,
            })),
          }
        : null;
    }
    if (item.kind === "rewire") {
      const payload = this.goalTreePayloadRecord(item.payload, "Rewire 条目");
      const nested = payload.rewire && typeof payload.rewire === "object" && !Array.isArray(payload.rewire)
        ? payload.rewire as Record<string, unknown>
        : payload.proposal && typeof payload.proposal === "object" && !Array.isArray(payload.proposal)
          ? payload.proposal as Record<string, unknown>
          : payload;
      const rewireId = String(payload.rewire_id ?? nested.rewire_id ?? "").trim();
      const existing = rewireId
        ? this.store.db.prepare("SELECT rewire_id, state FROM rewires WHERE board_id = ? AND rewire_id = ?").get(boardId, rewireId) as Row | undefined
        : undefined;
      if (item.operation === "create" && existing) {
        return {
          code: "goal_tree_proposal.rewire_exists",
          message: "要创建的 Rewire 已存在，需要基于最新事实修订",
          objects: [{ object_type: "rewire", object_id: rewireId }],
        };
      }
      if (item.operation !== "create" && (!rewireId || !existing)) {
        return missingObject("rewire", rewireId || "rewire_id", "要更新或停用的 Rewire 不存在");
      }
    }
    if (item.kind === "relation" || item.kind === "dependency" || item.kind === "rewire") {
      for (const rawRelation of this.goalTreeRelationEntries(item)) {
        const relation = this.normalizeGoalTreeRelation(item, rawRelation);
        if (relation.action === "deactivate") {
          const current = relation.relation_id
            ? this.store.snapshot(boardId).relations.find(
                (candidate) => candidate.relation_id === relation.relation_id && candidate.state === "active",
              )
            : this.store.snapshot(boardId).relations.find(
                (candidate) =>
                  candidate.from_goal_id === relation.from_goal_id &&
                  candidate.to_goal_id === relation.to_goal_id &&
                  candidate.type === relation.type &&
                  candidate.state === "active",
              );
          if (!current) {
            return missingObject(
              "relation",
              relation.relation_id ?? `${relation.from_goal_id}:${relation.to_goal_id}:${relation.type}`,
              "要停用的关系已不存在或不再生效",
            );
          }
          continue;
        }
        if (!goalExists(relation.from_goal_id)) missingGoalIds.add(relation.from_goal_id);
        if (!goalExists(relation.to_goal_id)) missingGoalIds.add(relation.to_goal_id);
        if (relation.type === "part_of" && this.wouldCreatePartOfCycle(boardId, relation.from_goal_id, relation.to_goal_id)) {
          return {
            code: "goal_tree_proposal.part_of_cycle",
            message: "这条父子关系会形成循环，需先修改拆分方向",
            objects: [
              { object_type: "goal", object_id: relation.from_goal_id },
              { object_type: "goal", object_id: relation.to_goal_id },
            ],
          };
        }
        const duplicate = this.store.snapshot(boardId).relations.find(
          (candidate) =>
            candidate.from_goal_id === relation.from_goal_id &&
            candidate.to_goal_id === relation.to_goal_id &&
            candidate.type === relation.type &&
            candidate.state === "active",
        );
        if (duplicate) {
          return {
            code: "goal_tree_proposal.relation_already_active",
            message: "这条关系已经生效，需要基于最新事实修订",
            objects: [{ object_type: "relation", object_id: duplicate.relation_id }],
          };
        }
      }
      return missingGoalIds.size > 0
        ? {
            code: "goal_tree_proposal.reference_unresolved",
            message: "关系引用了未确认、已拒绝或不存在的 Goal",
            objects: [...missingGoalIds].sort().map((goalId) => ({ object_type: "goal", object_id: goalId })),
          }
        : null;
    }
    return null;
  }

  private materializeGoalTreeProposalItem(
    boardId: string,
    item: GoalTreeProposalItemRecord,
    actorId: string,
    reasonText: string,
    at: string,
  ): ProposalAffectedObject[] {
    switch (item.kind) {
      case "goal":
      case "contract":
        return [this.materializeGoalTreeGoal(boardId, item, actorId, reasonText, at)];
      case "relation":
      case "dependency":
        return this.materializeGoalTreeRelations(boardId, item, actorId, reasonText, at);
      case "policy":
        return [this.materializeGoalTreePolicy(boardId, item, actorId, reasonText, at)];
      case "risk":
        return [this.materializeGoalTreeRisk(boardId, item, actorId, reasonText, at)];
      case "candidate":
        return this.materializeGoalTreeCandidate(boardId, item, actorId, reasonText, at);
      case "rewire":
        return this.materializeGoalTreeRewire(boardId, item, actorId, reasonText, at);
    }
  }

  private materializeGoalTreeGoal(
    boardId: string,
    item: GoalTreeProposalItemRecord,
    actorId: string,
    reasonText: string,
    at: string,
  ): ProposalAffectedObject {
    const goal = this.goalTreeGoalInput(item);
    const goalId = this.goalTreeTargetGoalId(item, goal);
    const existing = this.store.getGoal(goalId);
    if (item.operation === "create") {
      if (existing) throw new GoalBoardV1Error("goal_tree_proposal.goal_exists", `Goal 已存在: ${goalId}`);
      const definitionState = goal.definition_state ?? "draft";
      const decompositionState = goal.decomposition_state ?? "abstract";
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
          goal.title.trim(),
          goal.outcome.trim(),
          goal.why.trim(),
          goal.business_logic.trim(),
          sqliteJson(goal.in_scope ?? []),
          sqliteJson(goal.out_of_scope ?? []),
          sqliteJson(goal.constraints ?? []),
          sqliteJson(goal.required_inputs ?? []),
          sqliteJson(goal.promised_outputs ?? []),
          definitionState,
          decompositionState,
          goal.priority ?? 0,
          definitionState === "accepted" ? actorId : null,
          definitionState === "accepted" ? at : null,
          at,
          at,
        );
      this.replaceGoalTreeAcceptanceCriteria(goalId, goal, at);
      this.store.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId,
        type: "goal.created_from_tree_proposal",
        objectType: "goal",
        objectId: goalId,
        reason: reasonText,
        payload: { definition_state: definitionState, decomposition_state: decompositionState, proposal_item_id: item.item_id },
        at,
      });
      return { object_type: "goal", object_id: goalId };
    }
    if (!existing) throw new GoalBoardV1Error("goal_tree_proposal.goal_not_found", `找不到 Goal: ${goalId}`);
    if (existing.definition_state === "accepted") {
      const conflict = this.acceptedCompoundClosureConflict(boardId, item, existing, goal, goalId);
      if (conflict) {
        throw new GoalBoardV1Error(String(conflict.code), String(conflict.message));
      }
      const children = this.activePartOfChildren(boardId, goalId).map((child) => asText(child.goal_id));
      this.store.db
        .prepare(`
          UPDATE goals
          SET decomposition_state = 'closed_compound', fulfillment_state = 'unmet', updated_at = ?
          WHERE board_id = ? AND goal_id = ?
        `)
        .run(at, boardId, goalId);
      this.store.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId,
        type: "goal.accepted_compound_closed_from_tree_proposal",
        objectType: "goal",
        objectId: goalId,
        reason: reasonText,
        payload: {
          previous_decomposition_state: existing.decomposition_state,
          decomposition_state: "closed_compound",
          child_goal_ids: children,
          proposal_item_id: item.item_id,
        },
        at,
      });
      this.reconcileCompoundGoalAndAncestors(boardId, goalId, actorId, at);
      return { object_type: "goal", object_id: goalId };
    }
    const definitionState = goal.definition_state ?? existing.definition_state;
    const decompositionState = goal.decomposition_state ?? existing.decomposition_state;
    const normalized: CreateGoalInput = {
      ...goal,
      goal_id: goalId,
      definition_state: definitionState,
      decomposition_state: decompositionState,
      in_scope: goal.in_scope?.length ? goal.in_scope : existing.in_scope,
      out_of_scope: goal.out_of_scope?.length ? goal.out_of_scope : existing.out_of_scope,
      constraints: goal.constraints?.length ? goal.constraints : existing.constraints,
      required_inputs: goal.required_inputs?.length ? goal.required_inputs : existing.required_inputs,
      promised_outputs: goal.promised_outputs?.length ? goal.promised_outputs : existing.promised_outputs,
      acceptance_criteria: goal.acceptance_criteria.length ? goal.acceptance_criteria : existing.acceptance_criteria,
    };
    this.validateGoalInput(normalized);
    this.store.db
      .prepare(`
        UPDATE goals SET
          title = ?, outcome = ?, why = ?, business_logic = ?,
          in_scope_json = ?, out_of_scope_json = ?, constraints_json = ?,
          required_inputs_json = ?, promised_outputs_json = ?,
          definition_state = ?, decomposition_state = ?, priority = ?,
          accepted_by = ?, accepted_at = ?, updated_at = ?
        WHERE board_id = ? AND goal_id = ?
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
        definitionState,
        decompositionState,
        normalized.priority ?? existing.priority,
        definitionState === "accepted" ? actorId : null,
        definitionState === "accepted" ? at : null,
        at,
        boardId,
        goalId,
      );
    this.replaceGoalTreeAcceptanceCriteria(goalId, normalized, at);
    this.store.db
      .prepare(`
        UPDATE contract_proposals SET state = 'superseded', decided_at = ?, decision_json = ?
        WHERE board_id = ? AND goal_id = ? AND state = 'pending'
      `)
      .run(
        at,
        sqliteJson({ reason: "用户通过统一 Goal Tree 决定确认了更新后的 Contract", decided_by: actorId }),
        boardId,
        goalId,
      );
    if (definitionState === "accepted") {
      this.closeOpenClarificationSessions(
        boardId,
        goalId,
        actorId,
        `用户通过 Goal Tree Proposal ${item.proposal_id} 接受了 Draft Goal`,
        at,
      );
    }
    this.store.appendEvent({
      eventId: randomUUID(),
      boardId,
      actorId,
      type: "goal.updated_from_tree_proposal",
      objectType: "goal",
      objectId: goalId,
      reason: reasonText,
      payload: { definition_state: definitionState, decomposition_state: decompositionState, proposal_item_id: item.item_id },
      at,
    });
    return { object_type: "goal", object_id: goalId };
  }

  private materializeGoalTreeRelations(
    boardId: string,
    item: GoalTreeProposalItemRecord,
    actorId: string,
    reasonText: string,
    at: string,
  ): ProposalAffectedObject[] {
    const materialized: ProposalAffectedObject[] = [];
    const addedPartOfRelations: Array<{ from_goal_id: string; to_goal_id: string }> = [];
    for (const rawRelation of this.goalTreeRelationEntries(item)) {
      const relation = this.normalizeGoalTreeRelation(item, rawRelation);
      if (relation.action === "deactivate") {
        const current = relation.relation_id
          ? this.store.db
              .prepare("SELECT * FROM goal_relations WHERE board_id = ? AND relation_id = ? AND state = 'active'")
              .get(boardId, relation.relation_id) as Row | undefined
          : this.store.db
              .prepare(`
                SELECT * FROM goal_relations
                WHERE board_id = ? AND from_goal_id = ? AND to_goal_id = ?
                  AND type = ? AND state = 'active'
                ORDER BY relation_id LIMIT 1
              `)
              .get(boardId, relation.from_goal_id, relation.to_goal_id, relation.type) as Row | undefined;
        if (!current) {
          throw new GoalBoardV1Error(
            "goal_tree_proposal.relation_not_active",
            "要停用的关系已不存在或不再生效，请重新决定这项提案",
          );
        }
        const relationId = asText(current.relation_id);
        this.store.db
          .prepare("UPDATE goal_relations SET state = 'inactive', deactivated_at = ? WHERE relation_id = ?")
          .run(at, relationId);
        this.store.appendEvent({
          eventId: randomUUID(),
          boardId,
          actorId,
          type: "relation.deactivated_from_tree_proposal",
          objectType: "relation",
          objectId: relationId,
          reason: relation.reason || reasonText,
          payload: { proposal_item_id: item.item_id },
          at,
        });
        materialized.push({ object_type: "relation", object_id: relationId });
        continue;
      }
      if (!relation.type) {
        throw new GoalBoardV1Error("goal_tree_proposal.relation_type_invalid", "新增关系缺少有效类型");
      }
      this.requireNonTrashedGoalOnBoard(boardId, relation.from_goal_id);
      this.requireNonTrashedGoalOnBoard(boardId, relation.to_goal_id);
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
          boardId,
          relation.from_goal_id,
          relation.to_goal_id,
          relation.type,
          relation.reason || reasonText,
          actorId,
          at,
        );
      this.store.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId,
        type: "relation.added_from_tree_proposal",
        objectType: "relation",
        objectId: relationId,
        reason: relation.reason || reasonText,
        payload: {
          proposal_item_id: item.item_id,
          from_goal_id: relation.from_goal_id,
          to_goal_id: relation.to_goal_id,
          type: relation.type,
        },
        at,
      });
      materialized.push({ object_type: "relation", object_id: relationId });
      if (relation.type === "part_of") addedPartOfRelations.push(relation);
    }
    for (const relation of addedPartOfRelations) {
      const reopened = this.reopenSatisfiedCompoundParent(boardId, relation.to_goal_id, actorId, at);
      if (!reopened) this.reconcileCompoundAncestors(boardId, relation.from_goal_id, actorId, at);
    }
    return materialized;
  }

  private materializeGoalTreePolicy(
    boardId: string,
    item: GoalTreeProposalItemRecord,
    actorId: string,
    reasonText: string,
    at: string,
  ): ProposalAffectedObject {
    if (item.operation === "deactivate") {
      const payload = this.goalTreePayloadRecord(item.payload, "Policy 条目");
      const bindingId = String(payload.policy_binding_id ?? "").trim();
      if (!bindingId) {
        throw new GoalBoardV1Error("goal_tree_proposal.policy_id_required", "停用 Policy 需要 policy_binding_id");
      }
      const result = this.store.db
        .prepare(`
          UPDATE policy_bindings SET state = 'replaced'
          WHERE board_id = ? AND policy_binding_id = ? AND state = 'active'
        `)
        .run(boardId, bindingId);
      if (result.changes !== 1) {
        throw new GoalBoardV1Error("goal_tree_proposal.policy_not_active", "要停用的 Policy 已不存在或不再生效");
      }
      this.store.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId,
        type: "policy.deactivated_from_tree_proposal",
        objectType: "policy",
        objectId: bindingId,
        reason: reasonText,
        payload: { proposal_item_id: item.item_id },
        at,
      });
      return { object_type: "policy", object_id: bindingId };
    }
    const payload = this.goalTreePayloadRecord(item.payload, "Policy 条目");
    const flatPolicy = Object.fromEntries(
      [
        "goal_mode",
        "required_capabilities",
        "self_verification",
        "cross_reviewers",
        "adversarial_reviewers",
        "human_approval",
        "max_lease_seconds",
      ]
        .filter((field) => payload[field] != null)
        .map((field) => [field, payload[field]]),
    );
    const rawPolicy = this.goalTreePayloadRecord(payload.policy ?? flatPolicy, "Goal Policy");
    const goalId = String(payload.goal_id ?? "").trim() || null;
    if (goalId) this.requireGoalOnBoard(boardId, goalId);
    const policy: Partial<GoalPolicy> = {};
    if (rawPolicy.goal_mode != null) {
      const goalMode = String(rawPolicy.goal_mode);
      if (!["disabled", "preferred", "required"].includes(goalMode)) {
        throw new GoalBoardV1Error("goal_tree_proposal.policy_goal_mode_invalid", "Goal Mode 无效");
      }
      policy.goal_mode = goalMode as GoalPolicy["goal_mode"];
    }
    if (rawPolicy.required_capabilities != null) {
      if (!Array.isArray(rawPolicy.required_capabilities)) {
        throw new GoalBoardV1Error("goal_tree_proposal.policy_capabilities_invalid", "required_capabilities 必须是字符串列表");
      }
      policy.required_capabilities = unique(
        rawPolicy.required_capabilities.map(String).map((value) => value.trim()).filter(Boolean),
      ).sort();
    }
    for (const field of ["self_verification", "human_approval"] as const) {
      if (rawPolicy[field] != null) {
        if (typeof rawPolicy[field] !== "boolean") {
          throw new GoalBoardV1Error("goal_tree_proposal.policy_boolean_invalid", `${field} 必须是布尔值`);
        }
        policy[field] = rawPolicy[field] as never;
      }
    }
    for (const field of ["cross_reviewers", "adversarial_reviewers", "max_lease_seconds"] as const) {
      if (rawPolicy[field] != null) {
        const value = rawPolicy[field];
        if (!Number.isInteger(value) || Number(value) < (field === "max_lease_seconds" ? 1 : 0)) {
          throw new GoalBoardV1Error("goal_tree_proposal.policy_number_invalid", `${field} 数值无效`);
        }
        policy[field] = Number(value) as never;
      }
    }
    const scope = goalId ? "goal" : "project_default";
    const replaced = this.store.db
      .prepare(
        goalId
          ? "SELECT policy_binding_id FROM policy_bindings WHERE board_id = ? AND goal_id = ? AND scope = 'goal' AND state = 'active'"
          : "SELECT policy_binding_id FROM policy_bindings WHERE board_id = ? AND goal_id IS NULL AND scope = 'project_default' AND state = 'active'",
      )
      .all(...(goalId ? [boardId, goalId] : [boardId])) as Row[];
    if (goalId) {
      this.store.db
        .prepare("UPDATE policy_bindings SET state = 'replaced' WHERE board_id = ? AND goal_id = ? AND scope = 'goal' AND state = 'active'")
        .run(boardId, goalId);
    } else {
      this.store.db
        .prepare("UPDATE policy_bindings SET state = 'replaced' WHERE board_id = ? AND goal_id IS NULL AND scope = 'project_default' AND state = 'active'")
        .run(boardId);
    }
    const bindingId = String(payload.policy_binding_id ?? "").trim() || `policy-${randomUUID()}`;
    this.store.db
      .prepare(`
        INSERT INTO policy_bindings (
          policy_binding_id, board_id, goal_id, scope, policy_json,
          state, created_by, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
      `)
      .run(bindingId, boardId, goalId, scope, sqliteJson(policy), actorId, reasonText, at);
    this.store.appendEvent({
      eventId: randomUUID(),
      boardId,
      actorId,
      type: "policy.added_from_tree_proposal",
      objectType: "policy",
      objectId: bindingId,
      reason: reasonText,
      payload: {
        proposal_item_id: item.item_id,
        goal_id: goalId,
        scope,
        replaced_binding_ids: replaced.map((row) => asText(row.policy_binding_id)),
      },
      at,
    });
    return { object_type: "policy", object_id: bindingId };
  }

  private materializeGoalTreeRisk(
    boardId: string,
    item: GoalTreeProposalItemRecord,
    actorId: string,
    reasonText: string,
    at: string,
  ): ProposalAffectedObject {
    const payload = this.goalTreePayloadRecord(item.payload, "Risk 条目");
    const riskId = String(payload.risk_id ?? "").trim() || `risk-${randomUUID()}`;
    if (item.operation === "deactivate") {
      const result = this.store.db
        .prepare("UPDATE risks SET state = 'expired', updated_at = ? WHERE board_id = ? AND risk_id = ?")
        .run(at, boardId, riskId);
      if (result.changes !== 1) throw new GoalBoardV1Error("goal_tree_proposal.risk_not_found", "要停用的 Risk 不存在");
      this.store.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId,
        type: "risk.expired_from_tree_proposal",
        objectType: "risk",
        objectId: riskId,
        reason: reasonText,
        payload: { proposal_item_id: item.item_id },
        at,
      });
      return { object_type: "risk", object_id: riskId };
    }
    const facts = this.normalizeRiskFacts(boardId, {
      goal_ids: this.goalTreeStringArray(payload.goal_ids),
      description: String(payload.description ?? ""),
      probability: String(payload.probability ?? ""),
      impact: String(payload.impact ?? ""),
      affected_surfaces: this.goalTreeStringArray(payload.affected_surfaces),
      trigger: String(payload.trigger ?? ""),
      treatment: String(payload.treatment ?? "") as RiskRecord["treatment"],
      treatment_plan: String(payload.treatment_plan ?? ""),
      blocking_mode: String(payload.blocking_mode ?? "") as RiskRecord["blocking_mode"],
      revisit_condition: String(payload.revisit_condition ?? ""),
      owner: String(payload.owner ?? ""),
    });
    const requestedState = String(payload.state ?? "").trim();
    if (requestedState && !RISK_STATES.has(requestedState as RiskRecord["state"])) {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.risk_state_invalid",
        `Risk 生命周期状态“${requestedState}”不受支持；mitigate 是 treatment，降低措施完成后应使用 state=resolved`,
      );
    }
    if (item.operation === "create" && requestedState && requestedState !== "open") {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.risk_state_invalid",
        "新建 Risk 必须从 open 开始；后续状态变化应通过 update 并记录用户确认",
      );
    }
    const previous = item.operation === "create"
      ? undefined
      : this.store.db
          .prepare("SELECT * FROM risks WHERE board_id = ? AND risk_id = ?")
          .get(boardId, riskId) as Row | undefined;
    if (item.operation !== "create" && !previous) {
      throw new GoalBoardV1Error("goal_tree_proposal.risk_not_found", "要更新的 Risk 不存在");
    }
    const previousState = previous ? asText(previous.state) as RiskRecord["state"] : null;
    const state = (requestedState || previousState || "open") as RiskRecord["state"];
    const previousGoalIds = previous
      ? (this.store.db
          .prepare("SELECT goal_id FROM goal_risks WHERE risk_id = ? ORDER BY goal_id")
          .all(riskId) as Row[]).map((row) => asText(row.goal_id))
      : [];
    if (item.operation === "create") {
      this.store.db
        .prepare(`
          INSERT INTO risks (
            risk_id, board_id, description, probability, impact,
            affected_surfaces_json, trigger, treatment, treatment_plan, blocking_mode,
            revisit_condition, owner, state, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
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
          state,
          at,
          at,
        );
    } else {
      const result = this.store.db
        .prepare(`
          UPDATE risks SET description = ?, probability = ?, impact = ?, affected_surfaces_json = ?,
            trigger = ?, treatment = ?, treatment_plan = ?, blocking_mode = ?, revisit_condition = ?, owner = ?, state = ?, updated_at = ?
          WHERE board_id = ? AND risk_id = ?
        `)
        .run(
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
          state,
          at,
          boardId,
          riskId,
        );
      if (result.changes !== 1) throw new GoalBoardV1Error("goal_tree_proposal.risk_not_found", "要更新的 Risk 不存在");
      this.store.db.prepare("DELETE FROM goal_risks WHERE risk_id = ?").run(riskId);
    }
    const link = this.store.db.prepare("INSERT INTO goal_risks (goal_id, risk_id) VALUES (?, ?)");
    for (const goalId of facts.goal_ids) link.run(goalId, riskId);
    if (previous) {
      const wasInvalidating = asText(previous.blocking_mode) === "invalidate_on_trigger" && previousState === "triggered";
      const isInvalidating = facts.blocking_mode === "invalidate_on_trigger" && state === "triggered";
      const nextInvalidated = new Set(isInvalidating ? facts.goal_ids : []);
      if (wasInvalidating) {
        for (const goalId of previousGoalIds.filter((candidate) => !nextInvalidated.has(candidate))) {
          this.store.db
            .prepare("UPDATE goals SET validity_state = 'needs_revalidation', updated_at = ? WHERE goal_id = ?")
            .run(at, goalId);
        }
      }
      if (isInvalidating) {
        for (const goalId of facts.goal_ids) {
          this.store.db
            .prepare("UPDATE goals SET validity_state = 'invalidated', updated_at = ? WHERE goal_id = ?")
            .run(at, goalId);
        }
      }
    }
    this.store.appendEvent({
      eventId: randomUUID(),
      boardId,
      actorId,
      type: item.operation === "create" ? "risk.created_from_tree_proposal" : "risk.updated_from_tree_proposal",
      objectType: "risk",
      objectId: riskId,
      reason: reasonText,
      payload: {
        proposal_item_id: item.item_id,
        previous_goal_ids: previousGoalIds,
        goal_ids: facts.goal_ids,
        previous_blocking_mode: previous ? asText(previous.blocking_mode) : null,
        blocking_mode: facts.blocking_mode,
        previous_state: previousState,
        state,
      },
      at,
    });
    return { object_type: "risk", object_id: riskId };
  }

  private materializeGoalTreeCandidate(
    boardId: string,
    item: GoalTreeProposalItemRecord,
    actorId: string,
    reasonText: string,
    at: string,
  ): ProposalAffectedObject[] {
    const payload = this.goalTreePayloadRecord(item.payload, "Candidate 条目");
    if (item.operation === "update") {
      const candidateId = String(payload.candidate_id ?? "").trim();
      const finalProposedGoal = this.goalTreePayloadRecord(
        payload.proposed_goal ?? payload.goal ?? payload,
        "Candidate 最终 Goal Contract",
      );
      const proposedGoal = this.goalTreeGoalInput({
        ...item,
        kind: "goal",
        payload: { goal: finalProposedGoal },
      });
      const goalId = this.goalTreeTargetGoalId(item, proposedGoal);
      if (!candidateId) {
        throw new GoalBoardV1Error("goal_tree_proposal.candidate_id_required", "晋升已有 Candidate 需要 candidate_id");
      }
      const existingCandidate = this.readCandidate(candidateId);
      const proposedRelations = this.goalTreeCandidatePromotionRelations(payload, goalId);
      const proposedImpacts = Array.isArray(payload.proposed_impacts)
        ? payload.proposed_impacts.map((value) => this.goalTreePayloadRecord(value, "Candidate Impact"))
        : existingCandidate.proposed_impacts;
      const proposedRisks = Array.isArray(payload.proposed_risks)
        ? payload.proposed_risks.map((value) => this.goalTreePayloadRecord(value, "Candidate Risk"))
        : existingCandidate.proposed_risks;
      const blockingMode = String(payload.blocking_mode ?? existingCandidate.blocking_mode);
      if (!["none", "current_run", "dependent_claims"].includes(blockingMode)) {
        throw new GoalBoardV1Error("goal_tree_proposal.candidate_blocking_mode_invalid", "Candidate blocking_mode 无效");
      }
      const existingGoal = this.store.getGoal(goalId);
      this.validateCandidateCoordination(
        boardId,
        proposedGoal,
        proposedRelations,
        proposedImpacts,
        proposedRisks,
        existingGoal ? goalId : undefined,
      );
      const goalObject = existingGoal
        ? { object_type: "goal" as const, object_id: goalId }
        : this.materializeGoalTreeGoal(
            boardId,
            {
              ...item,
              kind: "goal",
              operation: "create",
              payload: { goal: proposedGoal },
            },
            actorId,
            reasonText,
            at,
          );
      const relationObjects = proposedRelations.length === 0
        ? []
        : this.materializeGoalTreeRelations(
            boardId,
            {
              ...item,
              kind: "relation",
              operation: "update",
              payload: { relations: proposedRelations },
            },
            actorId,
            reasonText,
            at,
          );
      const materializedByProposalId = String(payload.materialized_by_proposal_id ?? "").trim() || null;
      const decision = {
        decided_by: actorId,
        reason: reasonText,
        formal_goal_id: goalId,
        proposal_id: item.proposal_id,
        proposal_item_id: item.item_id,
        final_proposed_goal: finalProposedGoal,
        final_proposed_relations: payload.proposed_relations,
        materialized_relations: proposedRelations,
        final_proposed_impacts: proposedImpacts,
        final_proposed_risks: proposedRisks,
        blocking_mode: blockingMode,
        promotion_mode: existingGoal ? "bootstrap_reconciliation" : "goal_tree_proposal",
        ...(materializedByProposalId == null ? {} : { materialized_by_proposal_id: materializedByProposalId }),
      };
      const updated = this.store.db
        .prepare(`
          UPDATE candidates
          SET state = 'approved', decision_json = ?, decided_at = ?
          WHERE board_id = ? AND candidate_id = ? AND state = 'pending'
        `)
        .run(sqliteJson(decision), at, boardId, candidateId);
      if (updated.changes !== 1) {
        throw new GoalBoardV1Error(
          "goal_tree_proposal.candidate_not_pending",
          "Candidate 已不存在或不再待确认，统一晋升未写入",
        );
      }
      this.store.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId,
        type: "candidate.approved_from_tree_proposal",
        objectType: "candidate",
        objectId: candidateId,
        reason: reasonText,
        payload: {
          proposal_id: item.proposal_id,
          proposal_item_id: item.item_id,
          formal_goal_id: goalId,
          materialized_by_proposal_id: materializedByProposalId,
          relation_ids: relationObjects.map((relation) => relation.object_id),
        },
        at,
      });
      return [goalObject, ...relationObjects, { object_type: "candidate", object_id: candidateId }];
    }
    if (item.operation !== "create") {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.candidate_operation_invalid",
        "统一 Goal Tree 中的 Candidate 只支持 create 或晋升已有 Candidate 的 update",
      );
    }
    const candidateId = String(payload.candidate_id ?? "").trim() || `candidate-${randomUUID()}`;
    const existingCandidate = this.store.db
      .prepare("SELECT candidate_id FROM candidates WHERE board_id = ? AND candidate_id = ?")
      .get(boardId, candidateId) as Row | undefined;
    if (existingCandidate) {
      throw new GoalBoardV1Error("goal_tree_proposal.candidate_exists", "要确认的 Candidate 已存在，需要重新决定");
    }
    const goalObject = this.materializeGoalTreeGoal(
      boardId,
      {
        ...item,
        kind: "goal",
        payload: { goal: payload.proposed_goal ?? payload.goal ?? payload },
      },
      actorId,
      reasonText,
      at,
    );
    const proposedGoal = this.goalTreeGoalInput({
      ...item,
      kind: "goal",
      payload: { goal: payload.proposed_goal ?? payload.goal ?? payload },
    });
    const proposedRelations = Array.isArray(payload.proposed_relations)
      ? payload.proposed_relations.map((value) => this.goalTreePayloadRecord(value, "Candidate 关系"))
      : [];
    const proposedImpacts = Array.isArray(payload.proposed_impacts)
      ? payload.proposed_impacts.map((value) => this.goalTreePayloadRecord(value, "Candidate Impact"))
      : [];
    const proposedRisks = Array.isArray(payload.proposed_risks)
      ? payload.proposed_risks.map((value) => this.goalTreePayloadRecord(value, "Candidate Risk"))
      : [];
    const blockingMode = String(payload.blocking_mode ?? "none");
    if (!["none", "current_run", "dependent_claims"].includes(blockingMode)) {
      throw new GoalBoardV1Error("goal_tree_proposal.candidate_blocking_mode_invalid", "Candidate blocking_mode 无效");
    }
    this.store.db
      .prepare(`
        INSERT INTO candidates (
          candidate_id, board_id, submitted_by, discovered_in_run_id,
          proposed_goal_json, proposed_relations_json, proposed_impacts_json,
          proposed_risks_json, blocking_mode, state, decision_json, created_at, decided_at
        ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, 'approved', ?, ?, ?)
      `)
      .run(
        candidateId,
        boardId,
        actorId,
        sqliteJson(proposedGoal),
        sqliteJson(proposedRelations),
        sqliteJson(proposedImpacts),
        sqliteJson(proposedRisks),
        blockingMode,
        sqliteJson({ decided_by: actorId, reason: reasonText, formal_goal_id: goalObject.object_id }),
        at,
        at,
      );
    this.store.appendEvent({
      eventId: randomUUID(),
      boardId,
      actorId,
      type: "candidate.approved_from_tree_proposal",
      objectType: "candidate",
      objectId: candidateId,
      reason: reasonText,
      payload: { proposal_item_id: item.item_id, formal_goal_id: goalObject.object_id },
      at,
    });
    return [goalObject, { object_type: "candidate", object_id: candidateId }];
  }

  private materializeGoalTreeRewire(
    boardId: string,
    item: GoalTreeProposalItemRecord,
    actorId: string,
    reasonText: string,
    at: string,
  ): ProposalAffectedObject[] {
    const payload = this.goalTreePayloadRecord(item.payload, "Rewire 条目");
    const nested = payload.rewire && typeof payload.rewire === "object" && !Array.isArray(payload.rewire)
      ? payload.rewire as Record<string, unknown>
      : payload.proposal && typeof payload.proposal === "object" && !Array.isArray(payload.proposal)
        ? payload.proposal as Record<string, unknown>
        : payload;
    const rewireId = String(payload.rewire_id ?? nested.rewire_id ?? "").trim() || `rewire-${randomUUID()}`;
    if (item.operation === "deactivate") {
      const result = this.store.db
        .prepare("UPDATE rewires SET state = 'rejected', decided_at = ? WHERE board_id = ? AND rewire_id = ? AND state = 'pending'")
        .run(at, boardId, rewireId);
      if (result.changes !== 1) {
        throw new GoalBoardV1Error("goal_tree_proposal.rewire_not_pending", "要停用的 Rewire 不存在或已经处理");
      }
      this.store.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId,
        type: "rewire.rejected_from_tree_proposal",
        objectType: "rewire",
        objectId: rewireId,
        reason: reasonText,
        payload: { proposal_item_id: item.item_id },
        at,
      });
      return [{ object_type: "rewire", object_id: rewireId }];
    }
    if (item.operation !== "create" && item.operation !== "update") {
      throw new GoalBoardV1Error("goal_tree_proposal.rewire_operation_invalid", "Rewire 操作无效");
    }
    const exists = this.store.db
      .prepare("SELECT rewire_id FROM rewires WHERE board_id = ? AND rewire_id = ?")
      .get(boardId, rewireId) as Row | undefined;
    if (exists && item.operation === "create") {
      throw new GoalBoardV1Error("goal_tree_proposal.rewire_exists", "要创建的 Rewire 已存在");
    }
    const proposal = {
      ...nested,
      relations: this.goalTreeRelationEntries(item),
    };
    if (item.operation === "create") {
      this.store.db
        .prepare(`
          INSERT INTO rewires (
            rewire_id, board_id, candidate_id, proposal_json, impact_json,
            state, created_at, decided_at
          ) VALUES (?, ?, NULL, ?, ?, 'applied', ?, ?)
        `)
        .run(
          rewireId,
          boardId,
          sqliteJson(proposal),
          sqliteJson({ proposed_changes_applied: true, decided_by: actorId }),
          at,
          at,
        );
    } else {
      const result = this.store.db
        .prepare("UPDATE rewires SET proposal_json = ?, state = 'applied', decided_at = ? WHERE board_id = ? AND rewire_id = ?")
        .run(sqliteJson(proposal), at, boardId, rewireId);
      if (result.changes !== 1) throw new GoalBoardV1Error("goal_tree_proposal.rewire_not_found", "要更新的 Rewire 不存在");
    }
    const relations = this.materializeGoalTreeRelations(boardId, item, actorId, reasonText, at);
    this.store.appendEvent({
      eventId: randomUUID(),
      boardId,
      actorId,
      type: "rewire.applied_from_tree_proposal",
      objectType: "rewire",
      objectId: rewireId,
      reason: reasonText,
      payload: { proposal_item_id: item.item_id, relation_ids: relations.map((relation) => relation.object_id) },
      at,
    });
    return [{ object_type: "rewire", object_id: rewireId }, ...relations];
  }

  private replaceGoalTreeAcceptanceCriteria(goalId: string, goal: CreateGoalInput, at: string): void {
    this.store.db.prepare("DELETE FROM acceptance_criteria WHERE goal_id = ?").run(goalId);
    const insert = this.store.db.prepare(`
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
    void at;
  }

  private legacyGoalTreeProposalView(
    snapshot: ReturnType<SqliteGoalBoardStore["snapshot"]>,
  ): GoalTreeProposalRecord[] {
    const stateFromLegacy = (state: string): GoalTreeProposalRecord["state"] => {
      if (state === "pending" || state === "superseded" || state === "approved" || state === "rejected" || state === "dismissed") {
        return state;
      }
      if (state === "confirmed") return "approved";
      if (state === "applied") return "partially_applied";
      return "closed";
    };
    const itemStateFromLegacy = (state: string): GoalTreeProposalItemRecord["state"] => {
      if (state === "pending" || state === "superseded" || state === "approved" || state === "rejected" || state === "dismissed") {
        return state;
      }
      if (state === "confirmed") return "approved";
      if (state === "applied") return "applied";
      return "pending";
    };
    const contractProposals = snapshot.contract_proposals.map((proposal): GoalTreeProposalRecord => {
      const sourceRefs = unique(proposal.field_sources.flatMap((field) => field.source_refs)).sort();
      return {
        proposal_id: `legacy-contract-proposal:${proposal.proposal_id}`,
        board_id: proposal.board_id,
        origin: "legacy_contract_proposal",
        root_goal_id: proposal.goal_id,
        submitted_by: proposal.submitted_by,
        discovered_in_run_id: proposal.discovered_in_run_id,
        state: stateFromLegacy(proposal.state),
        version: 1,
        supersedes_proposal_id: null,
        base_event_cursor: 0,
        summary: `历史 Contract Proposal：${proposal.proposed_goal.title || proposal.goal_id}`,
        decision: proposal.decision,
        created_at: proposal.created_at,
        updated_at: proposal.decided_at ?? proposal.created_at,
        decided_at: proposal.decided_at,
        items: [
          {
            item_id: `legacy-contract-proposal-item:${proposal.proposal_id}`,
            proposal_id: `legacy-contract-proposal:${proposal.proposal_id}`,
            board_id: proposal.board_id,
            ordinal: 1,
            kind: "contract",
            operation: "update",
            payload: {
              proposed_goal: proposal.proposed_goal,
              field_sources: proposal.field_sources,
              review_policy: proposal.review_policy,
              proposed_impacts: proposal.proposed_impacts,
              proposed_risks: proposal.proposed_risks,
              dependency_rewire_ids: proposal.dependency_rewire_ids,
            },
            source_refs: sourceRefs.length > 0 ? sourceRefs : [`legacy-contract-proposal:${proposal.proposal_id}`],
            reason: "从历史 Contract Proposal 无损映射",
            confidence: proposal.field_sources.length === 0
              ? 1
              : Math.min(...proposal.field_sources.map((field) => field.confidence)),
            affected_objects: [{ object_type: "goal", object_id: proposal.goal_id }],
            baseline_versions: [],
            requires_user_confirmation: true,
            state: itemStateFromLegacy(proposal.state),
            conflict: null,
            decision: null,
            materialized_objects: [],
            revision_proposal_id: null,
            supersedes_item_id: null,
            created_at: proposal.created_at,
            updated_at: proposal.decided_at ?? proposal.created_at,
          },
        ],
        decisions: [],
      };
    });
    const candidates = snapshot.candidates.map((candidate): GoalTreeProposalRecord => ({
      proposal_id: `legacy-candidate:${candidate.candidate_id}`,
      board_id: candidate.board_id,
      origin: "legacy_candidate",
      root_goal_id: null,
      submitted_by: candidate.submitted_by,
      discovered_in_run_id: candidate.discovered_in_run_id,
      state: stateFromLegacy(candidate.state),
      version: 1,
      supersedes_proposal_id: null,
      base_event_cursor: 0,
      summary: `历史 Candidate：${candidate.proposed_goal.title || candidate.candidate_id}`,
      decision: candidate.decision,
      created_at: candidate.created_at,
      updated_at: candidate.decided_at ?? candidate.created_at,
      decided_at: candidate.decided_at,
      items: [
        {
          item_id: `legacy-candidate-item:${candidate.candidate_id}`,
          proposal_id: `legacy-candidate:${candidate.candidate_id}`,
          board_id: candidate.board_id,
          ordinal: 1,
          kind: "candidate",
          operation: "create",
          payload: {
            proposed_goal: candidate.proposed_goal,
            proposed_relations: candidate.proposed_relations,
            proposed_impacts: candidate.proposed_impacts,
            proposed_risks: candidate.proposed_risks,
            blocking_mode: candidate.blocking_mode,
          },
          source_refs: [`legacy-candidate:${candidate.candidate_id}`],
          reason: "从历史 Candidate 无损映射",
          confidence: 1,
          affected_objects: [{ object_type: "candidate", object_id: candidate.candidate_id }],
          baseline_versions: [],
          requires_user_confirmation: true,
          state: itemStateFromLegacy(candidate.state),
          conflict: null,
          decision: null,
          materialized_objects: [],
          revision_proposal_id: null,
          supersedes_item_id: null,
          created_at: candidate.created_at,
          updated_at: candidate.decided_at ?? candidate.created_at,
        },
      ],
      decisions: [],
    }));
    const rewires = snapshot.rewires.map((rewire): GoalTreeProposalRecord => ({
      proposal_id: `legacy-rewire:${rewire.rewire_id}`,
      board_id: rewire.board_id,
      origin: "legacy_rewire",
      root_goal_id: rewire.proposal.formal_goal_id ?? null,
      submitted_by: String(rewire.proposal.submitted_by ?? "legacy-runtime"),
      discovered_in_run_id: rewire.proposal.discovered_in_run_id ?? null,
      state: stateFromLegacy(rewire.state),
      version: 1,
      supersedes_proposal_id: null,
      base_event_cursor: 0,
      summary: `历史 Rewire：${rewire.rewire_id}`,
      decision: { legacy_state: rewire.state, impact: rewire.impact },
      created_at: rewire.created_at,
      updated_at: rewire.decided_at ?? rewire.created_at,
      decided_at: rewire.decided_at,
      items: [
        {
          item_id: `legacy-rewire-item:${rewire.rewire_id}`,
          proposal_id: `legacy-rewire:${rewire.rewire_id}`,
          board_id: rewire.board_id,
          ordinal: 1,
          kind: "rewire",
          operation: "update",
          payload: rewire.proposal,
          source_refs: [`legacy-rewire:${rewire.rewire_id}`],
          reason: "从历史 Rewire 无损映射",
          confidence: 1,
          affected_objects: [{ object_type: "rewire", object_id: rewire.rewire_id }],
          baseline_versions: [],
          requires_user_confirmation: true,
          state: itemStateFromLegacy(rewire.state),
          conflict: null,
          decision: null,
          materialized_objects: [],
          revision_proposal_id: null,
          supersedes_item_id: null,
          created_at: rewire.created_at,
          updated_at: rewire.decided_at ?? rewire.created_at,
        },
      ],
      decisions: [],
    }));
    return [...contractProposals, ...candidates, ...rewires];
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

  private readImpact(boardId: string, bindingId: string): ImpactBindingRecord {
    const impact = this.store.snapshot(boardId).impacts.find((item) => item.binding_id === bindingId);
    if (!impact) throw new Error(`Impact 写入后无法读取: ${bindingId}`);
    return impact;
  }

  private deriveGoalWorkState(
    boardId: string,
    goal: GoalRecord,
    snapshot: ReturnType<SqliteGoalBoardStore["snapshot"]>,
    now: string,
  ): GoalWorkStateView {
    const childGoalIds = snapshot.relations
      .filter(
        (relation) =>
          relation.state === "active" &&
          relation.type === "part_of" &&
          relation.to_goal_id === goal.goal_id,
      )
      .map((relation) => relation.from_goal_id)
      .sort();
    const activeClaims = snapshot.claims
      .filter(
        (claim) =>
          claim.goal_id === goal.goal_id &&
          claim.state === "active" &&
          claim.expires_at > now,
      )
      .sort((left, right) => left.claimed_at.localeCompare(right.claimed_at));
    const activeClaimById = new Map(activeClaims.map((claim) => [claim.claim_id, claim]));
    const activeRun = snapshot.runs
      .filter(
        (run) =>
          run.goal_id === goal.goal_id &&
          ["started", "blocked"].includes(run.state) &&
          activeClaimById.has(run.claim_id),
      )
      .sort((left, right) => left.started_at.localeCompare(right.started_at))
      .at(-1) ?? null;
    const activeClaim = activeRun
      ? activeClaimById.get(activeRun.claim_id) ?? null
      : activeClaims.at(-1) ?? null;
    const expiredClaim = snapshot.claims
      .filter(
        (claim) =>
          claim.goal_id === goal.goal_id &&
          claim.state === "active" &&
          claim.expires_at <= now,
      )
      .sort((left, right) => left.claimed_at.localeCompare(right.claimed_at))
      .at(-1) ?? null;
    const expiredRun = expiredClaim
      ? snapshot.runs
          .filter(
            (run) =>
              run.claim_id === expiredClaim.claim_id &&
              ["started", "blocked"].includes(run.state),
          )
          .sort((left, right) => left.started_at.localeCompare(right.started_at))
          .at(-1) ?? null
      : null;
    const leaseRecoveryReason: DecisionReason | null = expiredClaim && expiredRun
      ? {
          code: "lease.expired",
          severity: "info",
          subject_type: "claim",
          subject_id: expiredClaim.claim_id,
          message: "上一轮领取租约已到期，旧 Run 不再具有写权限",
          facts: {
            claim_id: expiredClaim.claim_id,
            run_id: expiredRun.run_id,
            expired_at: expiredClaim.expires_at,
            next_action: "select_goal",
          },
          remediation: "直接重新领取这条 Goal；无需释放旧 Claim，也不要继续报告旧 Run。",
        }
      : null;
    const phaseReasons = (blockingReasons: DecisionReason[]): DecisionReason[] =>
      blockingReasons.length > 0
        ? blockingReasons
        : leaseRecoveryReason
          ? [leaseRecoveryReason]
          : [];
    const latestClaimRun = activeClaim
      ? snapshot.runs
          .filter((run) => run.claim_id === activeClaim.claim_id)
          .sort(
            (left, right) =>
              left.started_at.localeCompare(right.started_at) || left.run_id.localeCompare(right.run_id),
          )
          .at(-1) ?? null
      : null;
    const pendingReviewObligations = snapshot.review_obligations.filter(
      (obligation) => obligation.goal_id === goal.goal_id && obligation.state === "pending",
    );
    const pendingReviewRoles = pendingReviewObligations.map((obligation) => obligation.role);
    const reviewReady = this.latestWorkRunState(snapshot, goal.goal_id) === "completed";
    const activeClaimLease = activeClaim
      ? (() => {
          const remainingSeconds = Math.max(
            0,
            Math.ceil((new Date(activeClaim.expires_at).getTime() - new Date(now).getTime()) / 1000),
          );
          const leaseStartedAt = activeClaim.renewed_at ?? activeClaim.claimed_at;
          const currentLeaseSeconds = Math.max(
            1,
            Math.ceil(
              (new Date(activeClaim.expires_at).getTime() - new Date(leaseStartedAt).getTime()) / 1000,
            ),
          );
          const renewalWindowSeconds = Math.max(
            1,
            Math.min(300, Math.ceil(currentLeaseSeconds / 3)),
          );
          const renewRecommended = remainingSeconds <= renewalWindowSeconds;
          return {
            remaining_seconds: remainingSeconds,
            renewal_window_seconds: renewalWindowSeconds,
            renew_recommended: renewRecommended,
            next_action: renewRecommended ? "renew_claim" as const : null,
          };
        })()
      : null;
    const base = {
      goal_id: goal.goal_id,
      active_claim: activeClaim,
      active_claim_lease: activeClaimLease,
      active_run: activeRun,
      pending_review_roles: pendingReviewRoles,
      child_goal_ids: childGoalIds,
    };

    if (goal.trashed_at) {
      return { ...base, work_state: "trashed", next_action: null, reasons: [] };
    }
    if (goal.archived_at) {
      return { ...base, work_state: "archived", next_action: null, reasons: [] };
    }
    if (goal.fulfillment_state === "satisfied") {
      return { ...base, work_state: "satisfied", next_action: null, reasons: [] };
    }
    if (activeClaim && !activeRun) {
      return this.workStateWithoutRun(base, activeClaim, latestClaimRun);
    }

    const needsClarification = this.goalNeedsClarification(goal);
    if (needsClarification) {
      if (activeRun?.role === "clarifier") return this.workStateFromRun(base, activeRun);
      const reasons = this.workStatePhaseReasons(boardId, goal.goal_id, "clarifier", now, snapshot);
      return {
        ...base,
        work_state: reasons.length > 0 ? "clarification_blocked" : "clarification_pending",
        next_action: "clarify",
        reasons: phaseReasons(reasons),
      };
    }

    if (goal.decomposition_state === "closed_compound") {
      if (childGoalIds.length > 0) {
        return { ...base, work_state: "waiting_children", next_action: null, reasons: [] };
      }
      return {
        ...base,
        work_state: "clarification_blocked",
        next_action: "clarify",
        reasons: [
          reason(
            "goal.compound_children_missing",
            "goal",
            goal.goal_id,
            "复合 Goal 已确认，但还没有任何生效的子 Goal",
            undefined,
            "补充子 Goal 或重新进入澄清后再确认拆分",
          ),
        ],
      };
    }

    if (goal.validity_state === "invalidated") {
      return {
        ...base,
        work_state: "invalidated",
        next_action: null,
        reasons: [reason("goal.invalidated", "goal", goal.goal_id, "Goal 已失效，需要重新澄清或替换")],
      };
    }

    if (activeRun) return this.workStateFromRun(base, activeRun);

    if (goal.validity_state === "needs_revalidation") {
      const reasons = this.workStatePhaseReasons(boardId, goal.goal_id, "revalidator", now, snapshot);
      return {
        ...base,
        work_state: reasons.length > 0 ? "revalidation_blocked" : "revalidation_pending",
        next_action: "revalidate",
        reasons: phaseReasons(reasons),
      };
    }

    const reworkRequested = this.hasPostExecutionNeedsChanges(boardId, goal.goal_id);
    const pendingRuntimeReviewObligations = pendingReviewObligations.filter(
      (obligation) => obligation.role !== "human_approver",
    );
    const pendingHumanReviewObligations = pendingReviewObligations.filter(
      (obligation) => obligation.role === "human_approver",
    );
    if (pendingRuntimeReviewObligations.length > 0 && reviewReady && !reworkRequested) {
      const action = pendingRuntimeReviewObligations
        .map((obligation) => this.reviewActionFor(obligation))
        .find((candidate): candidate is AvailableAction => candidate !== null);
      const reasons = action?.role
        ? this.workStatePhaseReasons(boardId, goal.goal_id, action.role, now, snapshot)
        : [];
      return {
        ...base,
        work_state: reasons.length > 0 ? "review_blocked" : "review_pending",
        next_action: "review",
        reasons: phaseReasons(reasons),
      };
    }

    const uncoveredHumanCriterionIds = goal.acceptance_criteria
      .filter((criterion) => criterion.decision_method === "human_decision")
      .filter((criterion) => !snapshot.evidence.some(
        (evidence) =>
          evidence.goal_id === goal.goal_id &&
          evidence.lifecycle_state === "effective" &&
          evidence.result === "passed" &&
          evidence.criterion_ids.includes(criterion.criterion_id),
      ))
      .map((criterion) => criterion.criterion_id);
    if (
      reviewReady &&
      !reworkRequested &&
      (pendingHumanReviewObligations.length > 0 || uncoveredHumanCriterionIds.length > 0)
    ) {
      const criterionIds = unique([
        ...pendingHumanReviewObligations.flatMap((obligation) => obligation.criterion_scope),
        ...uncoveredHumanCriterionIds,
      ]).sort();
      return {
        ...base,
        work_state: "waiting_for_human",
        next_action: null,
        reasons: [
          reason(
            "review.user_approval_required",
            "goal",
            goal.goal_id,
            "Runtime 可承担的检查已经结束，当前只剩用户本人验收与决定",
            {
              criterion_ids: criterionIds,
              obligation_ids: pendingHumanReviewObligations.map((item) => item.obligation_id),
              next_action: "open_goalboard",
            },
            "请用户在 GoalBoard 中完成真实操作、提交决定及相应验收依据；Runtime 不要重复领取 Review。",
          ),
        ],
      };
    }

    if (
      reviewReady &&
      pendingReviewObligations.length === 0 &&
      !reworkRequested &&
      this.acceptanceCriteriaPassed(goal, snapshot)
    ) {
      const completionRiskReasons = this.completionRiskReasons(goal.goal_id);
      if (completionRiskReasons.length > 0) {
        return {
          ...base,
          work_state: "completion_blocked",
          next_action: null,
          reasons: completionRiskReasons,
        };
      }
      return {
        ...base,
        work_state: "completion_pending",
        next_action: "complete",
        reasons: [],
      };
    }

    const reasons = this.workStatePhaseReasons(boardId, goal.goal_id, "executor", now, snapshot);
    return {
      ...base,
      work_state: reasons.length > 0 ? "execution_blocked" : "execution_pending",
      next_action: "execute",
      reasons: phaseReasons(reasons),
    };
  }

  private workStateFromRun(
    base: Omit<GoalWorkStateView, "work_state" | "next_action" | "reasons">,
    run: RunRecord,
  ): GoalWorkStateView {
    const phase =
      run.role === "clarifier"
        ? "clarification"
        : run.role === "revalidator"
          ? "revalidation"
          : run.role === "self_verifier" || run.role === "cross_reviewer" || run.role === "adversarial_reviewer"
            ? "review"
            : "execution";
    const state =
      run.state === "blocked"
        ? (`${phase}_blocked` as GoalWorkState)
        : phase === "clarification"
          ? "clarifying"
          : phase === "revalidation"
            ? "revalidating"
            : phase === "review"
              ? "reviewing"
            : "executing";
    const nextAction: GoalWorkAction =
      phase === "clarification"
        ? "clarify"
        : phase === "revalidation"
          ? "revalidate"
          : phase === "review"
            ? "review"
            : "execute";
    return {
      ...base,
      work_state: state,
      next_action: nextAction,
      reasons:
        run.state === "blocked"
          ? [
              reason(
                "run.blocked",
                "run",
                run.run_id,
                run.block_reason ?? "Runtime 报告当前工作受阻",
              ),
            ]
          : [],
    };
  }

  /**
   * A direct Claim without a Run is an abnormal handoff, while a completed Run
   * whose Claim has not yet been released is a normal, short-lived transition.
   * Keep both unavailable without exposing protocol object names in the default UI.
   */
  private workStateWithoutRun(
    base: Omit<GoalWorkStateView, "work_state" | "next_action" | "reasons">,
    claim: ClaimRecord,
    latestRun: RunRecord | null,
  ): GoalWorkStateView {
    const phase =
      claim.role === "clarifier"
        ? "clarification"
        : claim.role === "revalidator"
          ? "revalidation"
          : claim.role === "self_verifier" ||
              claim.role === "cross_reviewer" ||
              claim.role === "adversarial_reviewer"
            ? "review"
            : "execution";
    const nextAction: GoalWorkAction =
      phase === "clarification"
        ? "clarify"
        : phase === "revalidation"
          ? "revalidate"
          : phase === "review"
            ? "review"
            : "execute";
    if (latestRun?.state === "completed") {
      const enteringReview = phase === "execution" && base.pending_review_roles.length > 0;
      const message = enteringReview
        ? "结果已提交，正在进入检查"
        : phase === "review"
          ? "检查结果已提交，当前检查正在收尾"
          : phase === "clarification"
            ? "目标方案已整理好，当前澄清正在收尾"
            : phase === "revalidation"
              ? "重新核对的结果已提交，当前工作正在收尾"
              : "结果已提交，当前执行正在收尾";
      const remediation = enteringReview
        ? "无需重新提交；当前执行收尾后即可开始检查。"
        : "无需重复操作；收尾完成后系统会继续判断下一步。";
      return {
        ...base,
        work_state: enteringReview ? "review_blocked" : (`${phase}_blocked` as GoalWorkState),
        next_action: enteringReview ? "review" : nextAction,
        reasons: [
          reason(
            "work.handoff_pending",
            "claim",
            claim.claim_id,
            message,
            undefined,
            remediation,
          ),
        ],
      };
    }
    return {
      ...base,
      work_state: `${phase}_blocked` as GoalWorkState,
      next_action: nextAction,
      reasons: [
        reason(
          "run.missing",
          "claim",
          claim.claim_id,
          "这项工作已被接手，但还没有开始推进",
          undefined,
          "开始推进，或者先结束当前接手状态后再交给其他人。",
        ),
      ],
    };
  }

  private latestWorkRunState(
    snapshot: ReturnType<SqliteGoalBoardStore["snapshot"]>,
    goalId: string,
  ): RunRecord["state"] | null {
    return (
      snapshot.runs
        .filter(
          (run) =>
            run.goal_id === goalId &&
            (run.role === "executor" || run.role === "revalidator"),
        )
        .sort(
          (left, right) =>
            left.started_at.localeCompare(right.started_at) || left.run_id.localeCompare(right.run_id),
        )
        .at(-1)?.state ?? null
    );
  }

  private goalNeedsClarification(goal: GoalRecord): boolean {
    return (
      goal.definition_state !== "accepted" ||
      goal.decomposition_state === "abstract" ||
      goal.decomposition_state === "frontier_open" ||
      goal.acceptance_criteria.length === 0
    );
  }

  private acceptanceCriteriaPassed(
    goal: GoalRecord,
    snapshot: ReturnType<SqliteGoalBoardStore["snapshot"]>,
  ): boolean {
    return goal.acceptance_criteria.every((criterion) =>
      snapshot.evidence.some(
        (evidence) =>
          evidence.goal_id === goal.goal_id &&
          evidence.lifecycle_state === "effective" &&
          evidence.result === "passed" &&
          evidence.criterion_ids.includes(criterion.criterion_id),
      ),
    );
  }

  private executorHandoffReasons(workState: GoalWorkStateView): DecisionReason[] {
    if (
      workState.work_state === "completion_blocked" ||
      workState.work_state === "waiting_for_human"
    ) return workState.reasons;
    if (workState.work_state !== "completion_pending") return [];
    return [
      reason(
        "goal.ready_to_complete",
        "goal",
        workState.goal_id,
        "执行、证据和复核已经完成，不应开始新的执行",
        undefined,
        "直接调用完成判定；如果仍有门禁，按返回原因处理后重试。",
      ),
    ];
  }

  private completionRiskReasons(goalId: string): DecisionReason[] {
    const rows = this.store.db
      .prepare(`
        SELECT
          risk.risk_id,
          risk.description,
          risk.blocking_mode,
          risk.state,
          risk.revisit_condition,
          risk.owner
        FROM risks risk
        JOIN goal_risks goal_risk ON goal_risk.risk_id = risk.risk_id
        WHERE goal_risk.goal_id = ?
          AND risk.blocking_mode IN ('completion', 'invalidate_on_trigger')
          AND risk.state IN ('open', 'triggered')
        ORDER BY risk.risk_id
      `)
      .all(goalId) as Row[];
    return rows.map((row) =>
      reason(
        "risk.blocks_completion",
        "risk",
        asText(row.risk_id),
        asText(row.description),
        {
          blocking_mode: asText(row.blocking_mode),
          state: asText(row.state),
          owner: asText(row.owner),
        },
        asText(row.revisit_condition),
      ),
    );
  }

  private hasPostExecutionNeedsChanges(boardId: string, goalId: string): boolean {
    const row = this.store.db
      .prepare(`
        SELECT
          COALESCE((
            SELECT MAX(event.seq)
            FROM events event
            JOIN reviews review ON review.review_id = event.object_id
            WHERE event.board_id = ?
              AND event.type = 'review.submitted'
              AND review.goal_id = ?
              AND review.verdict = 'needs_changes'
          ), 0) AS latest_needs_changes_seq,
          COALESCE((
            SELECT MAX(event.seq)
            FROM events event
            JOIN runs run ON run.run_id = event.object_id
            WHERE event.board_id = ?
              AND event.type = 'run.completed'
              AND run.goal_id = ?
              AND run.role IN ('executor', 'revalidator')
          ), 0) AS latest_work_completed_seq
      `)
      .get(boardId, goalId, boardId, goalId) as Row;
    return Number(row.latest_needs_changes_seq) > Number(row.latest_work_completed_seq);
  }

  private workStatePhaseReasons(
    boardId: string,
    goalId: string,
    role: ClaimRole,
    now: string,
    snapshot?: BoardSnapshot,
  ): DecisionReason[] {
    const policy = this.resolvePolicy(boardId, goalId);
    return this.evaluate({
      boardId,
      goalId,
      actorId: "work-state-observer",
      role,
      capabilities: policy.required_capabilities,
      goalModeAttestation: true,
      now,
      snapshot,
    }).reasons.filter((item) => !item.code.startsWith("claim."));
  }

  private reviewActionFor(obligation: {
    obligation_id: string;
    role: "self_verifier" | "cross_reviewer" | "adversarial_reviewer" | "human_approver";
  }): AvailableAction | null {
    if (obligation.role === "human_approver") return null;
    return {
      role:
        obligation.role === "self_verifier"
          ? "self_verifier"
          : obligation.role === "cross_reviewer"
          ? "cross_reviewer"
          : obligation.role === "adversarial_reviewer"
            ? "adversarial_reviewer"
            : "executor",
      next_action: "review",
      review_obligation_id: obligation.obligation_id,
    };
  }

  private availableActions(
    goal: GoalRecord,
    snapshot: ReturnType<SqliteGoalBoardStore["snapshot"]>,
    workState: GoalWorkStateView,
  ): AvailableAction[] {
    if (workState.work_state === "clarification_pending") {
      return [{ role: "clarifier", next_action: "clarify", review_obligation_id: null }];
    }
    if (workState.work_state === "execution_pending") {
      return [{ role: "executor", next_action: "execute", review_obligation_id: null }];
    }
    if (workState.work_state === "completion_pending") {
      return [{ role: null, next_action: "complete", review_obligation_id: null }];
    }
    if (workState.work_state === "revalidation_pending") {
      return [{ role: "revalidator", next_action: "revalidate", review_obligation_id: null }];
    }
    if (workState.work_state !== "review_pending") return [];
    return snapshot.review_obligations
      .filter((obligation) => obligation.goal_id === goal.goal_id && obligation.state === "pending")
      .map((obligation) => this.reviewActionFor(obligation))
      .filter((action): action is AvailableAction => action !== null);
  }

  private workActionMessage(action: GoalWorkAction): string {
    switch (action) {
      case "clarify":
        return "这条 Goal 仍有会影响范围、拆分或验收的未知项，当前 Runtime 可以继续对话澄清";
      case "revalidate":
        return "前提发生变化，当前 Runtime 可以重新核对 Contract、依赖和风险";
      case "review":
        return "执行结果正在等待所需 Review，当前 Runtime 可以按其角色复核";
      case "execute":
        return "Goal 已澄清为最小闭环，当前 Runtime 可以选择并开始执行";
      case "complete":
        return "执行、证据和复核已经完成；现在应直接重试完成判定，不要开始新的执行";
    }
  }

  private planningRationale(metric: PlanningMetric | undefined): string {
    const unlocks = metric?.unlock_count ?? 0;
    const chain = metric?.longest_downstream_chain ?? 0;
    if (unlocks > 0) {
      return `完成后可解锁 ${unlocks} 个尚未完成的下游 Goal；最长后续链路 ${chain} 层`;
    }
    if ((metric?.topological_level ?? 0) === 0) {
      return "当前没有未完成的前置产出阻挡，可以独立推进";
    }
    return `当前位于依赖图第 ${metric?.topological_level ?? 0} 层，前置产出已经满足`;
  }

  /**
   * Adding a new child to an already completed compound Goal changes the
   * confirmed decomposition. Keep the old fact history, but make the parent
   * a Draft again so the user can confirm the expanded tree instead of
   * silently presenting a completed parent with unfinished children.
   */
  private reopenSatisfiedCompoundParent(
    boardId: string,
    parentGoalId: string,
    actorId: string,
    at: string,
  ): boolean {
    const parent = this.requireGoalOnBoard(boardId, parentGoalId);
    if (
      parent.trashed_at ||
      parent.archived_at ||
      parent.fulfillment_state !== "satisfied" ||
      parent.definition_state !== "accepted" ||
      parent.decomposition_state !== "closed_compound"
    ) {
      return false;
    }
    this.store.db
      .prepare(`
        UPDATE goals SET
          definition_state = 'draft', decomposition_state = 'frontier_open',
          fulfillment_state = 'unmet', accepted_by = NULL, accepted_at = NULL,
          updated_at = ?
        WHERE goal_id = ? AND board_id = ?
      `)
      .run(at, parentGoalId, boardId);
    this.store.appendEvent({
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

  private satisfyClosedCompoundGoalIfReady(
    boardId: string,
    goalId: string,
    actorId: string,
    at: string,
  ): boolean {
    const goal = this.requireGoalOnBoard(boardId, goalId);
    if (
      goal.trashed_at ||
      goal.archived_at ||
      goal.definition_state !== "accepted" ||
      goal.decomposition_state !== "closed_compound" ||
      goal.validity_state !== "valid" ||
      goal.fulfillment_state === "satisfied"
    ) {
      return false;
    }
    const children = this.activePartOfChildren(boardId, goalId);
    if (children.length === 0 || children.some((child) => asText(child.fulfillment_state) !== "satisfied")) {
      return false;
    }
    this.store.db
      .prepare("UPDATE goals SET fulfillment_state = 'satisfied', updated_at = ? WHERE goal_id = ?")
      .run(at, goalId);
    const activeGoalCleared = this.clearActiveGoalIfMatches(boardId, goalId, at);
    this.store.appendEvent({
      eventId: randomUUID(),
      boardId,
      actorId,
      type: "goal.compound_satisfied",
      objectType: "goal",
      objectId: goalId,
      reason: "所有必需子 Goal 已完成，复合父 Goal 自动完成",
      payload: {
        child_goal_ids: children.map((child) => asText(child.goal_id)),
        active_goal_cleared: activeGoalCleared,
      },
      at,
    });
    return true;
  }

  private reconcileCompoundGoalAndAncestors(
    boardId: string,
    goalId: string,
    actorId: string,
    at: string,
  ): number {
    return this.satisfyClosedCompoundGoalIfReady(boardId, goalId, actorId, at)
      ? this.reconcileCompoundAncestors(boardId, goalId, actorId, at)
      : this.store.eventCursor(boardId);
  }

  /**
   * A Goal Tree decision can accept a compound parent after its children have
   * already finished, so there is no later child-completion event to trigger
   * ancestor propagation. Reconcile every eligible parent to a fixed point in
   * the same write transaction, while keeping the completion predicate and
   * audit event in satisfyClosedCompoundGoalIfReady().
   */
  private reconcileAllClosedCompoundGoals(
    boardId: string,
    actorId: string,
    at: string,
  ): number {
    const pendingGoalIds = new Set(
      (this.store.db
        .prepare(`
          SELECT goal_id FROM goals
          WHERE board_id = ?
            AND definition_state = 'accepted'
            AND decomposition_state = 'closed_compound'
            AND validity_state = 'valid'
            AND fulfillment_state = 'unmet'
            AND trashed_at IS NULL
            AND archived_at IS NULL
          ORDER BY goal_id
        `)
        .all(boardId) as Row[])
        .map((row) => asText(row.goal_id)),
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
    return this.store.eventCursor(boardId);
  }

  /** Propagate a completed child through every completed compound ancestor. */
  private reconcileCompoundAncestors(
    boardId: string,
    childGoalId: string,
    actorId: string,
    at: string,
  ): number {
    const pendingChildren = [childGoalId];
    const visitedParents = new Set<string>();
    while (pendingChildren.length > 0) {
      const childId = pendingChildren.shift()!;
      const parentRows = this.store.db
        .prepare(`
          SELECT to_goal_id FROM goal_relations
          WHERE board_id = ? AND from_goal_id = ?
            AND type = 'part_of' AND state = 'active'
          ORDER BY to_goal_id
        `)
        .all(boardId, childId) as Row[];
      for (const row of parentRows) {
        const parentGoalId = asText(row.to_goal_id);
        if (visitedParents.has(parentGoalId)) continue;
        visitedParents.add(parentGoalId);
        if (this.satisfyClosedCompoundGoalIfReady(boardId, parentGoalId, actorId, at)) {
          pendingChildren.push(parentGoalId);
        }
      }
    }
    return this.store.eventCursor(boardId);
  }

  private evaluate(input: EvaluationInput): Evaluation {
    const goal = input.snapshot
      ? input.snapshot.goals.find((item) => item.goal_id === input.goalId) ?? null
      : this.store.getGoal(input.goalId);
    const policy = this.resolvePolicy(input.boardId, input.goalId, input.strengthenPolicy);
    const surfaces = this.goalImpacts(input.boardId, input.goalId, input.snapshot);
    const reasons: DecisionReason[] = [];
    if (!goal || goal.board_id !== input.boardId) {
      reasons.push(reason("goal.not_found", "goal", input.goalId, "找不到这个 Goal"));
      return { goal: null, reasons, policy, surfaces };
    }
    if (goal.trashed_at) {
      reasons.push(
        reason(
          "goal.trashed",
          "goal",
          goal.goal_id,
          "Goal 已移入回收站，当前不接受新的 Runtime 工作",
          { trashed_at: goal.trashed_at },
          "由用户恢复后再查询 Ready",
        ),
      );
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
      const needsClarification = this.goalNeedsClarification(goal);
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
            "目标方案已经整理好，正在等你确认或退回修改",
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
      if (
        input.role === "self_verifier" ||
        input.role === "cross_reviewer" ||
        input.role === "adversarial_reviewer"
      ) {
        const pendingReview = this.store.db
          .prepare(
            "SELECT obligation_id FROM review_obligations WHERE goal_id = ? AND role = ? AND state = 'pending' LIMIT 1",
          )
          .get(input.goalId, input.role) as Row | undefined;
        if (!pendingReview) {
          reasons.push(
            reason(
              "review.not_pending",
              "goal",
              goal.goal_id,
              "当前没有等待此类 Runtime Review 的义务",
            ),
          );
        }
        const latestWorkRun = this.store.db
          .prepare(`
            SELECT state FROM runs
            WHERE board_id = ? AND goal_id = ? AND role IN ('executor', 'revalidator')
            ORDER BY started_at DESC, run_id DESC
            LIMIT 1
          `)
          .get(input.boardId, input.goalId) as Row | undefined;
        if (!latestWorkRun || asText(latestWorkRun.state) !== "completed") {
          reasons.push(
            reason(
              "review.execution_not_completed",
              "goal",
              goal.goal_id,
              "执行 Run 尚未完成，不能开始 Review",
            ),
          );
        }
      }
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

    const sameGoalClaim = this.store.db
      .prepare(`
        SELECT claim_id, actor_id FROM claims
        WHERE goal_id = ? AND state = 'active' AND expires_at > ?
        ORDER BY claim_id LIMIT 1
      `)
      .get(input.goalId, input.now) as Row | undefined;
    if (sameGoalClaim) {
      reasons.push(
        reason(
          "claim.already_active",
          "claim",
          asText(sameGoalClaim.claim_id),
          "这个 Goal 已被另一个 Runtime 领取",
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

  private parallelExecutionSuggestion(
    available: AvailableGoal[],
  ): ParallelExecutionSuggestion | null {
    const selected: Array<{ item: AvailableGoal; surfaces: ImpactBindingRecord[] }> = [];
    for (const item of available) {
      if (item.role !== "executor" || item.next_action !== "execute") continue;
      const surfaces = item.relevant_surfaces.filter((impact) => impact.state === "confirmed");
      if (surfaces.length === 0) continue;
      if (
        selected.some(
          (existing) => !this.impactSetsAllowParallel(existing.surfaces, surfaces),
        )
      ) {
        continue;
      }
      selected.push({ item, surfaces });
    }
    if (selected.length < 2) return null;
    return {
      kind: "safe_parallel_execution",
      advisory_only: true,
      assignments: selected.map(({ item }, index) => ({
        runtime_slot: index === 0 ? "current_runtime" : `additional_runtime_${index}`,
        goal_id: item.goal.goal_id,
        title: item.goal.title,
        role: "executor",
        required_capabilities: item.resolved_policy.required_capabilities,
      })),
    };
  }

  private impactSetsAllowParallel(
    existing: ImpactBindingRecord[],
    requested: ImpactBindingRecord[],
  ): boolean {
    for (const requestedImpact of requested) {
      for (const existingImpact of existing) {
        if (existingImpact.surface !== requestedImpact.surface) continue;
        if (
          !this.isImpactPairSafe(
            existingImpact.access,
            existingImpact.input_snapshot,
            requestedImpact,
          )
        ) {
          return false;
        }
      }
    }
    return true;
  }

  private goalImpacts(
    boardId: string,
    goalId: string,
    snapshot?: BoardSnapshot,
  ): ImpactBindingRecord[] {
    return (snapshot ?? this.store.snapshot(boardId)).impacts.filter(
      (impact) => impact.goal_id === goalId && impact.state !== "inactive",
    );
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
        SELECT claim_id, goal_id, expires_at FROM claims
        WHERE board_id = ? AND state = 'active' AND expires_at <= ?
        ORDER BY claim_id
      `)
      .all(boardId, now) as Row[];
    if (expired.length === 0) return;
    for (const claim of expired) {
      const claimId = asText(claim.claim_id);
      const expiredAt = asText(claim.expires_at);
      this.store.db
        .prepare("UPDATE claims SET state = 'expired', released_at = ?, release_reason = ? WHERE claim_id = ?")
        .run(expiredAt, "领取租约已到期", claimId);
      this.abandonActiveRunsForClaim(
        boardId,
        claimId,
        actorId,
        "领取租约已到期，当前 Run 自动中断",
        expiredAt,
      );
      this.store.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId,
        type: "lease.expired",
        objectType: "claim",
        objectId: claimId,
        reason: "领取期限已到",
        payload: { goal_id: asText(claim.goal_id), expired_at: expiredAt },
        at: now,
      });
    }
  }

  /**
   * A non-terminal Run is meaningful only while its Claim is active. Release,
   * revoke and lease expiry therefore close it in the same transaction instead
   * of leaving a stale `started`/`blocked` record behind.
   */
  private abandonActiveRunsForClaim(
    boardId: string,
    claimId: string,
    actorId: string,
    reasonText: string,
    at: string,
  ): string[] {
    const runs = this.store.db
      .prepare(`
        SELECT run_id, goal_id FROM runs
        WHERE board_id = ? AND claim_id = ? AND state IN ('started', 'blocked')
        ORDER BY run_id
      `)
      .all(boardId, claimId) as Row[];
    for (const run of runs) {
      const runId = asText(run.run_id);
      this.store.db
        .prepare(`
          UPDATE runs SET state = 'abandoned', block_reason = ?, ended_at = ?
          WHERE run_id = ? AND state IN ('started', 'blocked')
        `)
        .run(reasonText, at, runId);
      this.store.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId,
        type: "run.abandoned",
        objectType: "run",
        objectId: runId,
        reason: reasonText,
        payload: { claim_id: claimId, recovery: true, goal_id: asText(run.goal_id) },
        at,
      });
    }
    return runs.map((run) => asText(run.run_id));
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
    const leafReadinessIssue = goalProposalLeafReadinessIssues(
      {
        item_id: `contract-proposal:${goalId}`,
        kind: "contract",
        operation: "update",
        payload: proposedGoal as unknown as Record<string, unknown>,
      },
      proposedGoal as unknown as Record<string, unknown>,
    )[0];
    if (leafReadinessIssue) {
      throw new GoalBoardV1Error(
        leafReadinessIssue.code,
        `${leafReadinessIssue.message}${leafReadinessIssue.recovery}`,
      );
    }
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
      this.requireNonTrashedGoalOnBoard(boardId, dependency.from_goal_id);
      this.requireNonTrashedGoalOnBoard(boardId, dependency.to_goal_id);
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
    allowExistingGoalId?: string,
  ): void {
    this.requireBoard(boardId);
    const proposedGoalId = proposedGoal.goal_id?.trim() ?? "";
    if (
      proposedGoalId &&
      this.store.getGoal(proposedGoalId) &&
      proposedGoalId !== allowExistingGoalId
    ) {
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
      if (!isNewGoal(goalId)) this.requireNonTrashedGoalOnBoard(boardId, goalId);
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

  private requireNonTrashedGoalOnBoard(boardId: string, goalId: string): GoalRecord {
    const goal = this.requireGoalOnBoard(boardId, goalId);
    if (goal.trashed_at) {
      throw new GoalBoardV1Error("goal.trashed", "不能建立或激活指向回收站 Goal 的关系");
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

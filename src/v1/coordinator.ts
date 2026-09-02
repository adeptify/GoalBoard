import { createHash, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  ArtifactsModule,
  type ArtifactsSqliteDatabase,
} from "@adeptify/goalboard-module-artifacts";
import type {
  ArtifactsApplicationApi,
} from "@adeptify/goalboard-contracts/modules/artifacts";
import {
  EvidenceVerificationModule,
  type EvidenceSqliteDatabase,
} from "@adeptify/goalboard-module-evidence-verification";
import type {
  EvidenceVerificationApplicationApi,
} from "@adeptify/goalboard-contracts/modules/evidence-verification";
import {
  ExecutionModule,
  type ExecutionSqliteDatabase,
} from "@adeptify/goalboard-module-execution";
import type { ExecutionApplicationApi } from "@adeptify/goalboard-contracts/modules/execution";
import {
  deriveGoalTreeProposalState,
  GovernanceCollaborationModule,
  type GovernanceSqliteDatabase,
} from "@adeptify/goalboard-module-governance-collaboration";
import type {
  GovernanceApplicationApi,
} from "@adeptify/goalboard-contracts/modules/governance-collaboration";
import {
  GoalsModule,
  goalProposalLeafReadinessIssues,
  goalTreeProposalDecompositionIssues,
  readDecompositionReview,
  recordedContractCoverageBlocksClosure,
  resolveGoalPolicy,
  type GoalChangeImpact,
  type GoalRevisionDependentTransition,
  type GoalsSqliteDatabase,
  type PlanningGraphIssue,
  type PlanningMethodPack,
  type PlanningMetric,
  type SetRiskStateInput as GoalsSetRiskStateInput,
  type UpdateRiskInput as GoalsUpdateRiskInput,
} from "@adeptify/goalboard-module-goals";
import type { GoalsApplicationApi } from "@adeptify/goalboard-contracts/modules/goals";
import {
  compactGoalActionProjection,
  compatibleContractRevisions,
  contractRevisionIsCompatible,
  deriveGoalActionProjection,
  deriveGoalActionProjections,
  requiresParentCompletionConfirmation,
  type ExecutionValidationApplicationApi,
} from "@adeptify/goalboard-plugin-goals";
import { SqliteGoalBoardStore, sqliteJson } from "./store.js";
import {
  type ActionTransitionReceipt,
  type AvailableGoal,
  type BoardSnapshot,
  type BlockedAvailableGoal,
  type BlockedAvailableOverview,
  type ClaimRecord,
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
  type GoalAction,
  type GoalPolicy,
  type GoalContractView,
  type GoalRecord,
  type GoalRelationRecord,
  type GoalTreeProposalItemInput,
  type GoalTreeProposalItemExplanation,
  type GoalTreeProposalItemRecord,
  type GoalTreeProposalCheckInput,
  type GoalTreeProposalDecideInput,
  type GoalTreeProposalDecisionAuthority,
  type GoalTreeProposalItemDecisionInput,
  type GoalTreeProposalDecisionRecord,
  type GoalTreeProposalRecord,
  type GoalTreeProposalNarrative,
  type GoalTreeProposalSubmitInput,
  type ProposalAffectedObject,
  type ProposalObjectVersion,
  type GoalWorkAction,
  type GoalWorkState,
  type GoalWorkStateView,
  type ImpactAccess,
  type ImpactBindingRecord,
  type ParallelExecutionSuggestion,
  type ProjectGuidanceView,
  type ReadyGoal,
  type ReviewRecord,
  type RewireRecord,
  type RiskRecord,
  type RunRecord,
} from "./types.js";
import {
  goalTreeProposalItemValidationIssues,
  goalTreeRiskDescription,
} from "./goal-tree-proposal-validation.js";
import { planGoalLifecycleReconciliation } from "./lifecycle-reconciliation.js";
import { GoalReadApplication } from "./goal-query-application.js";
import { ExecutionValidationApplication } from "./execution-validation-application.js";
import { GoalBoardV1Error } from "./errors.js";
export { GoalBoardV1Error } from "./errors.js";
export type {
  ClaimReleaseHandoff,
  ClaimReleaseResult,
  ReportRunResult as RunReportResult,
} from "@adeptify/goalboard-plugin-goals";

type Row = Record<string, unknown>;

type NormalizedProposedRelation = Record<string, unknown> & {
  from_goal_id: string;
  to_goal_id: string;
  type: string;
  reason: string;
};

export interface ExplainGoalResult {
  goal: GoalRecord | null;
  role: ClaimRole;
  ready: boolean;
  observed_event_cursor: number;
  reasons: DecisionReason[];
  resolved_policy: GoalPolicy;
  relevant_surfaces: ImpactBindingRecord[];
}

export function projectGoalLifecycle(
  snapshot: Pick<BoardSnapshot, "claims" | "runs">,
  goalId: string,
  now: string,
): { claims: ClaimRecord[]; runs: RunRecord[] } {
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
  return { claims, runs };
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
  blocked_overview: BlockedAvailableOverview[];
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
  semantic_review: GoalTreeSemanticReview | null;
  transitions: ActionTransitionReceipt[];
  observed_event_cursor: number;
  replayed: boolean;
}

export interface GoalTreeSemanticReview extends GoalChangeImpact {
  structural_validation: "passed";
  status: "required" | "not_required";
  next_action: "review_affected_subgraph" | "continue";
  review_tool: "goalboard_v1_planning_analyze_change";
  canonical_changes_require_new_user_confirmation: true;
}

interface ActorWrite {
  actor_id: string;
  actor_kind?: "user" | "runtime";
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
  snapshot_index?: SnapshotEvaluationIndex;
  policy_rows?: ReturnType<SqliteGoalBoardStore["activePolicyRowsForBoard"]>;
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

interface SnapshotEvaluationIndex {
  goals_by_id: Map<string, GoalRecord>;
  dependencies_by_goal: Map<string, GoalRecord[]>;
  risks_by_goal: Map<string, RiskRecord[]>;
  claims_by_goal: Map<string, ClaimRecord[]>;
  impacts_by_goal: Map<string, ImpactBindingRecord[]>;
  pending_contract_proposal_by_goal: Map<string, ContractProposalRecord>;
  pending_review_keys: Set<string>;
  latest_work_run_by_goal: Map<string, RunRecord>;
}

const snapshotEvaluationIndexes = new WeakMap<BoardSnapshot, SnapshotEvaluationIndex>();

function pushSnapshotGroup<T>(target: Map<string, T[]>, key: string, value: T): void {
  const current = target.get(key);
  if (current) current.push(value);
  else target.set(key, [value]);
}

function snapshotEvaluationIndex(snapshot: BoardSnapshot): SnapshotEvaluationIndex {
  const cached = snapshotEvaluationIndexes.get(snapshot);
  if (cached) return cached;
  const goalsById = new Map(snapshot.goals.map((goal) => [goal.goal_id, goal]));
  const dependenciesByGoal = new Map<string, GoalRecord[]>();
  for (const relation of snapshot.relations) {
    if (relation.type !== "depends_on" || relation.state !== "active") continue;
    const dependency = goalsById.get(relation.to_goal_id);
    if (dependency) pushSnapshotGroup(dependenciesByGoal, relation.from_goal_id, dependency);
  }
  for (const dependencies of dependenciesByGoal.values()) {
    dependencies.sort((left, right) => left.goal_id.localeCompare(right.goal_id));
  }
  const risksById = new Map(snapshot.risks.map((risk) => [risk.risk_id, risk]));
  const risksByGoal = new Map<string, RiskRecord[]>();
  for (const link of snapshot.goal_risks) {
    const risk = risksById.get(link.risk_id);
    if (risk && (risk.state === "open" || risk.state === "triggered")) {
      pushSnapshotGroup(risksByGoal, link.goal_id, risk);
    }
  }
  for (const risks of risksByGoal.values()) {
    risks.sort((left, right) => left.risk_id.localeCompare(right.risk_id));
  }
  const claimsByGoal = new Map<string, ClaimRecord[]>();
  for (const claim of snapshot.claims) pushSnapshotGroup(claimsByGoal, claim.goal_id, claim);
  const impactsByGoal = new Map<string, ImpactBindingRecord[]>();
  for (const impact of snapshot.impacts) {
    if (impact.state !== "inactive") pushSnapshotGroup(impactsByGoal, impact.goal_id, impact);
  }
  const pendingContractProposalByGoal = new Map<string, ContractProposalRecord>();
  for (const proposal of snapshot.contract_proposals) {
    if (proposal.state !== "pending") continue;
    const current = pendingContractProposalByGoal.get(proposal.goal_id);
    if (!current || proposal.created_at > current.created_at) {
      pendingContractProposalByGoal.set(proposal.goal_id, proposal);
    }
  }
  const pendingReviewKeys = new Set(
    snapshot.review_obligations
      .filter((obligation) => obligation.state === "pending")
      .map((obligation) => `${obligation.goal_id}\u0000${obligation.role}`),
  );
  const latestWorkRunByGoal = new Map<string, RunRecord>();
  for (const run of snapshot.runs) {
    if (run.role !== "executor" && run.role !== "revalidator") continue;
    const current = latestWorkRunByGoal.get(run.goal_id);
    if (
      !current ||
      run.started_at > current.started_at ||
      (run.started_at === current.started_at && run.run_id > current.run_id)
    ) {
      latestWorkRunByGoal.set(run.goal_id, run);
    }
  }
  const index: SnapshotEvaluationIndex = {
    goals_by_id: goalsById,
    dependencies_by_goal: dependenciesByGoal,
    risks_by_goal: risksByGoal,
    claims_by_goal: claimsByGoal,
    impacts_by_goal: impactsByGoal,
    pending_contract_proposal_by_goal: pendingContractProposalByGoal,
    pending_review_keys: pendingReviewKeys,
    latest_work_run_by_goal: latestWorkRunByGoal,
  };
  snapshotEvaluationIndexes.set(snapshot, index);
  return index;
}

const IMPACT_ACCESSES = new Set<ImpactAccess>(["read", "write", "decide", "exclusive"]);
const IMPACT_ACTIVE_STATES = new Set<"proposed" | "confirmed">(["proposed", "confirmed"]);
const RISK_STATES = new Set<RiskRecord["state"]>([
  "open",
  "triggered",
  "resolved",
  "accepted",
  "expired",
]);
const CLAIMABLE_GOAL_ACTION_KINDS = new Set<GoalAction["kind"]>([
  "clarify",
  "execute",
  "submit_evidence",
  "review",
  "revalidate",
  "mitigate_risk",
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

function contractProposalFieldInvalid(path: string, expected: string): never {
  throw new GoalBoardV1Error(
    "contract_proposal.field_invalid",
    `Contract Proposal 字段 ${path} 必须是${expected}。`,
    {
      path,
      expected,
      recovery: `请按 goalboard_v1_contract_propose 工具 schema 修正 ${path}，并使用新的 idempotency_key 重试；失败调用不会创建 Proposal。`,
    },
  );
}

function contractProposalRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    contractProposalFieldInvalid(path, "对象");
  }
  return value as Record<string, unknown>;
}

function contractProposalString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    contractProposalFieldInvalid(path, "非空字符串");
  }
  return value;
}

function contractProposalStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) contractProposalFieldInvalid(path, "字符串数组");
  for (const [index, item] of value.entries()) {
    contractProposalString(item, `${path}[${index}]`);
  }
  return value as string[];
}

function validateContractProposalInputShape(input: SubmitContractProposalInput): void {
  const raw = input as unknown as Record<string, unknown>;
  for (const field of ["board_id", "goal_id", "actor_id", "discovered_in_run_id", "idempotency_key"]) {
    contractProposalString(raw[field], field);
  }

  const goal = contractProposalRecord(raw.proposed_goal, "proposed_goal");
  for (const field of ["goal_id", "title", "outcome", "why", "business_logic", "definition_state", "decomposition_state"]) {
    contractProposalString(goal[field], `proposed_goal.${field}`);
  }
  for (const field of ["in_scope", "out_of_scope", "required_inputs", "promised_outputs"]) {
    contractProposalStringArray(goal[field], `proposed_goal.${field}`);
  }
  if (goal.constraints != null) {
    contractProposalStringArray(goal.constraints, "proposed_goal.constraints");
  }
  if (typeof goal.priority !== "number" || !Number.isFinite(goal.priority)) {
    contractProposalFieldInvalid("proposed_goal.priority", "有限数字");
  }
  contractProposalRecord(goal.leaf_readiness, "proposed_goal.leaf_readiness");
  if (!Array.isArray(goal.acceptance_criteria) || goal.acceptance_criteria.length === 0) {
    contractProposalFieldInvalid("proposed_goal.acceptance_criteria", "至少含一个验收对象的数组");
  }
  for (const [index, value] of goal.acceptance_criteria.entries()) {
    const path = `proposed_goal.acceptance_criteria[${index}]`;
    const criterion = contractProposalRecord(value, path);
    for (const field of ["criterion_id", "statement", "decision_method", "pass_condition"]) {
      contractProposalString(criterion[field], `${path}.${field}`);
    }
    if (criterion.required_evidence != null) {
      contractProposalStringArray(criterion.required_evidence, `${path}.required_evidence`);
    }
    if (
      criterion.target != null &&
      (typeof criterion.target !== "object" || Array.isArray(criterion.target))
    ) {
      contractProposalFieldInvalid(`${path}.target`, "对象或 null");
    }
  }

  if (!Array.isArray(raw.field_sources)) contractProposalFieldInvalid("field_sources", "字段来源对象数组");
  for (const [index, value] of raw.field_sources.entries()) {
    const path = `field_sources[${index}]`;
    const source = contractProposalRecord(value, path);
    for (const field of ["field", "source_kind", "rationale", "status"]) {
      contractProposalString(source[field], `${path}.${field}`);
    }
    contractProposalStringArray(source.source_refs, `${path}.source_refs`);
    if (typeof source.confidence !== "number" || !Number.isFinite(source.confidence)) {
      contractProposalFieldInvalid(`${path}.confidence`, "0 到 1 的数字");
    }
    if (source.requires_user_confirmation !== true) {
      contractProposalFieldInvalid(`${path}.requires_user_confirmation`, "true");
    }
  }

  const policy = contractProposalRecord(raw.review_policy, "review_policy");
  contractProposalString(policy.goal_mode, "review_policy.goal_mode");
  contractProposalStringArray(policy.required_capabilities, "review_policy.required_capabilities");
  for (const field of ["self_verification", "human_approval"]) {
    if (typeof policy[field] !== "boolean") contractProposalFieldInvalid(`review_policy.${field}`, "boolean");
  }
  for (const field of ["cross_reviewers", "adversarial_reviewers", "max_lease_seconds"]) {
    if (typeof policy[field] !== "number" || !Number.isFinite(policy[field])) {
      contractProposalFieldInvalid(`review_policy.${field}`, "数字");
    }
  }

  for (const field of ["proposed_impacts", "proposed_risks"] as const) {
    const values = raw[field];
    if (values == null) continue;
    if (!Array.isArray(values)) contractProposalFieldInvalid(field, "对象数组");
    for (const [index, value] of values.entries()) contractProposalRecord(value, `${field}[${index}]`);
  }
  if (raw.dependency_rewire_ids != null) {
    contractProposalStringArray(raw.dependency_rewire_ids, "dependency_rewire_ids");
  }
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
  explanation: GoalTreeProposalItemExplanation | null;
  confidence: number;
  affected_objects: ProposalAffectedObject[];
  requires_user_confirmation: true;
  supersedes_item_id: string | null;
}

type GoalTreeProposalItemShape = Pick<
  GoalTreeProposalItemRecord,
  "item_id" | "kind" | "operation" | "payload"
>;

const LARGE_GOAL_TREE_PROPOSAL_ITEM_COUNT = 5;

function semanticText(value: unknown, code: string, message: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new GoalBoardV1Error(code, message);
  return normalized;
}

function semanticTextList(value: unknown, code: string, message: string): string[] {
  if (!Array.isArray(value)) throw new GoalBoardV1Error(code, message);
  return unique(value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean));
}

function normalizeGoalTreeProposalNarrative(
  narrative: GoalTreeProposalNarrative | null | undefined,
  itemCount: number,
): GoalTreeProposalNarrative | null {
  if (narrative == null) {
    if (itemCount >= LARGE_GOAL_TREE_PROPOSAL_ITEM_COUNT) {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.narrative_required",
        `包含 ${itemCount} 项变化的大型 Goal Tree 提案必须说明 why_now、problem、main_path、expected_effect 和 non_goals，让用户能在确认前理解“原问题 → 新链路 → 预期效果”；单纯 summary 不足以审批整份变更`,
      );
    }
    return null;
  }
  if (typeof narrative !== "object" || Array.isArray(narrative)) {
    throw new GoalBoardV1Error("goal_tree_proposal.narrative_invalid", "Goal Tree 提案的 narrative 必须是结构化对象");
  }
  const mainPath = semanticTextList(
    narrative.main_path,
    "goal_tree_proposal.narrative_main_path_invalid",
    "Goal Tree 提案的 narrative.main_path 必须是按依赖顺序排列的非空文字数组",
  );
  if (mainPath.length === 0) {
    throw new GoalBoardV1Error(
      "goal_tree_proposal.narrative_main_path_required",
      "Goal Tree 提案必须至少说明一段变更后的主链路",
    );
  }
  return {
    why_now: semanticText(
      narrative.why_now,
      "goal_tree_proposal.narrative_why_now_required",
      "Goal Tree 提案必须说明为什么现在需要改变",
    ),
    problem: semanticText(
      narrative.problem,
      "goal_tree_proposal.narrative_problem_required",
      "Goal Tree 提案必须说明原目标或流程的具体问题",
    ),
    main_path: mainPath,
    expected_effect: semanticText(
      narrative.expected_effect,
      "goal_tree_proposal.narrative_effect_required",
      "Goal Tree 提案必须说明采用后的预期效果",
    ),
    non_goals: semanticTextList(
      narrative.non_goals,
      "goal_tree_proposal.narrative_non_goals_invalid",
      "Goal Tree 提案的 narrative.non_goals 必须是文字数组；没有非目标时传空数组",
    ),
  };
}

function normalizeGoalTreeProposalItemExplanation(
  explanation: GoalTreeProposalItemExplanation | null | undefined,
  index: number,
): GoalTreeProposalItemExplanation | null {
  if (explanation == null) return null;
  if (typeof explanation !== "object" || Array.isArray(explanation)) {
    throw new GoalBoardV1Error(
      "goal_tree_proposal.item_explanation_invalid",
      `第 ${index + 1} 个条目的 explanation 必须是结构化对象`,
    );
  }
  return {
    problem: semanticText(
      explanation.problem,
      "goal_tree_proposal.item_problem_required",
      `第 ${index + 1} 个条目必须说明主要解决什么问题`,
    ),
    expected_effect: semanticText(
      explanation.expected_effect,
      "goal_tree_proposal.item_effect_required",
      `第 ${index + 1} 个条目必须说明会改变什么`,
    ),
    non_goals: semanticTextList(
      explanation.non_goals,
      "goal_tree_proposal.item_non_goals_invalid",
      `第 ${index + 1} 个条目的 explanation.non_goals 必须是文字数组；没有非目标时传空数组`,
    ),
    depends_on_item_ids: semanticTextList(
      explanation.depends_on_item_ids,
      "goal_tree_proposal.item_dependencies_invalid",
      `第 ${index + 1} 个条目的 explanation.depends_on_item_ids 必须是 item_id 数组`,
    ),
  };
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
    prompted_proposal_id: authority.prompted_proposal_id == null
      ? undefined
      : requiredDialogueText(
        authority.prompted_proposal_id,
        "goal_tree_proposal.prompted_proposal_id_required",
        "整份确认需要记录上一问明确指向的 Proposal ID",
      ),
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
  const normalized = items.map((item, index) => {
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
    const affectedObjects: ProposalAffectedObject[] = [];
    const addAffectedObject = (object: ProposalAffectedObject, objectIndex: number): void => {
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
      if (seenObjects.has(key)) return;
      seenObjects.add(key);
      affectedObjects.push({ object_type: object.object_type, object_id: objectId });
    };
    item.affected_objects.forEach(addAffectedObject);
    if (item.kind === "relation" || item.kind === "dependency") {
      for (const relation of goalTreeProposalRelationPayloads(item, index)) {
        const relationId = String(relation.relation_id ?? "").trim();
        const fromGoalId = String(relation.from_goal_id ?? "").trim();
        const toGoalId = String(relation.to_goal_id ?? "").trim();
        if (relationId) addAffectedObject({ object_type: "relation", object_id: relationId }, affectedObjects.length);
        if (fromGoalId) addAffectedObject({ object_type: "goal", object_id: fromGoalId }, affectedObjects.length);
        if (toGoalId) addAffectedObject({ object_type: "goal", object_id: toGoalId }, affectedObjects.length);
      }
    }
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
      explanation: normalizeGoalTreeProposalItemExplanation(item.explanation, index),
      confidence: item.confidence,
      affected_objects: affectedObjects,
      requires_user_confirmation: true as const,
      supersedes_item_id: item.supersedes_item_id?.trim() || null,
    };
  });
  for (const [index, item] of normalized.entries()) {
    if (items.length >= LARGE_GOAL_TREE_PROPOSAL_ITEM_COUNT && !item.explanation) {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.item_explanation_required",
        `包含 ${items.length} 项变化的大型 Goal Tree 提案中，第 ${index + 1} 项必须用 explanation 说明主要问题、预期效果、非目标和与其他 change 的依赖`,
      );
    }
    for (const dependencyId of item.explanation?.depends_on_item_ids ?? []) {
      if (dependencyId === item.item_id) {
        throw new GoalBoardV1Error(
          "goal_tree_proposal.item_dependency_self",
          `第 ${index + 1} 个条目不能把自己列为语义依赖`,
        );
      }
      if (!ids.has(dependencyId)) {
        throw new GoalBoardV1Error(
          "goal_tree_proposal.item_dependency_unknown",
          `第 ${index + 1} 个条目引用了同一提案中不存在的依赖 item_id「${dependencyId}」`,
        );
      }
    }
  }
  return normalized;
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

export class GoalBoardCoordinator {
  readonly artifacts: ArtifactsApplicationApi;
  private readonly evidenceVerificationModule: EvidenceVerificationModule;
  private readonly executionModule: ExecutionModule;
  private readonly goalsModule: GoalsModule<ActionTransitionReceipt>;
  readonly evidenceVerification: EvidenceVerificationApplicationApi;
  readonly execution: ExecutionApplicationApi;
  readonly governance: GovernanceApplicationApi;
  readonly goals: GoalsApplicationApi<ActionTransitionReceipt>;
  readonly goalQueries: GoalReadApplication;
  readonly executionValidation: ExecutionValidationApplicationApi<BoardSnapshot>;

  constructor(
    readonly store: SqliteGoalBoardStore,
    private readonly clock: () => Date = () => new Date(),
    private readonly personalPlanningMethodPacks: readonly PlanningMethodPack[] = [],
  ) {
    const artifactsModule = new ArtifactsModule({
      db: this.store.db as unknown as ArtifactsSqliteDatabase,
      now: () => this.clock().toISOString(),
      errorFactory: (code, message, details) => new GoalBoardV1Error(code, message, details),
      appendEvent: (input) => this.store.appendEvent(input),
    });
    this.artifacts = {
      query: artifactsModule.query,
      commands: artifactsModule.commands,
    };
    this.executionModule = new ExecutionModule({
      db: this.store.db as unknown as ExecutionSqliteDatabase,
      now: () => this.clock().toISOString(),
      errorFactory: (code, message, details) => new GoalBoardV1Error(code, message, details),
      appendEvent: (input) => this.store.appendEvent(input),
      assertRunStartAllowed: (boardId, goalId) => {
        const goal = this.store.getGoal(goalId);
        if (!goal || goal.board_id !== boardId || goal.validity_state === "invalidated") {
          throw new GoalBoardV1Error("goal.invalidated", "Goal 已失效，不能开始 Run");
        }
        if (goal.trashed_at) {
          throw new GoalBoardV1Error("goal.trashed", "回收站中的 Goal 不能开始 Run");
        }
      },
    });
    this.execution = {
      query: this.executionModule.query,
      commands: this.executionModule.commands,
    };
    this.evidenceVerificationModule = new EvidenceVerificationModule({
      db: this.store.db as unknown as EvidenceSqliteDatabase,
      now: () => this.clock().toISOString(),
      errorFactory: (code, message, details) => new GoalBoardV1Error(code, message, details),
      appendEvent: (input) => this.store.appendEvent(input),
    });
    this.evidenceVerification = {
      query: this.evidenceVerificationModule.query,
      commands: this.evidenceVerificationModule.commands,
    };
    const governanceModule = new GovernanceCollaborationModule({
      db: this.store.db as unknown as GovernanceSqliteDatabase,
      now: () => this.clock().toISOString(),
      errorFactory: (code, message, details) => new GoalBoardV1Error(code, message, details),
    });
    this.governance = {
      query: governanceModule.query,
      reviews: governanceModule.reviews,
      records: governanceModule.records,
      decisions: governanceModule.decisions,
    };
    let goalsModule!: GoalsModule<ActionTransitionReceipt>;
    goalsModule = new GoalsModule<ActionTransitionReceipt>(
      this.store.db as unknown as GoalsSqliteDatabase,
      {
        validateRelationGraph: (boardId, input) => {
          const projectedId = "projected:new-relation";
          const snapshot = this.store.snapshot(boardId);
          const issue = goalsModule.planning.validateGraph(
            snapshot.goals,
            goalsModule.planning.projectRelations(snapshot.relations, [{
              action: "add",
              relation_id: projectedId,
              from_goal_id: input.from_goal_id,
              to_goal_id: input.to_goal_id,
              type: input.type,
              reason: input.reason,
            }]),
          ).find((candidate) => candidate.relation_ids.includes(projectedId));
          return issue ? { code: issue.code, message: issue.message } : null;
        },
        clearActiveGoalIfMatches: (boardId, goalId, at) =>
          this.clearActiveGoalIfMatches(boardId, goalId, at),
        blockingWork: (boardId, goalId, now) => ({
          claim_ids: this.executionModule.repository.activeClaimIdsForGoal(boardId, goalId, now),
          run_ids: this.executionModule.repository.activeRunIdsForGoal(boardId, goalId),
        }),
        compoundCoverageBlocksClosure: (boardId, goalId) => {
          const snapshot = this.store.snapshot(boardId);
          const goal = snapshot.goals.find((candidate) => candidate.goal_id === goalId);
          return goal
            ? recordedContractCoverageBlocksClosure(goal, {
                goals: snapshot.goals,
                relations: snapshot.relations,
              })
            : true;
        },
        completionGateReasons: (boardId, goalId) =>
          this.externalCompletionGateReasons(boardId, goalId),
        currentActionProjection: (boardId, goalId) =>
          this.executionValidation.query.getGoalActionProjection({ board_id: boardId, goal_id: goalId }),
        isContractRevisionCompatible: (boardId, goalId, revision) => {
          const goal = this.requireGoalOnBoard(boardId, goalId);
          return contractRevisionIsCompatible(goal, this.store.snapshot(boardId), revision);
        },
        readRevalidationRun: (boardId, runId) => {
          const pair = this.execution.query.getRunWithClaim(boardId, runId);
          return pair ? {
            run_id: pair.run.run_id,
            board_id: pair.run.board_id,
            goal_id: pair.run.goal_id,
            actor_id: pair.run.actor_id,
            role: pair.run.role,
            state: pair.run.state,
            claim_state: pair.claim.state,
            claim_expires_at: pair.claim.expires_at,
            claim_role: pair.claim.role,
            claim_actor_id: pair.claim.actor_id,
            claim_contract_revision: pair.claim.contract_revision,
          } : null;
        },
        completeRevalidationRun: (boardId, _goalId, runId, actorId, _at) => {
          this.executionModule.lifecycle.completeRunForRevalidation(boardId, runId, actorId);
        },
        transitionRevisionDependents: (input) =>
          this.transitionGoalRevisionDependents(input),
        currentActionToken: (boardId, goalId) =>
          this.executionValidation.query.getGoalActionProjection({ board_id: boardId, goal_id: goalId }).action_token,
        authorizeRiskUpdate: (boardId, input, write, current) =>
          this.authorizeGoalRiskUpdate(boardId, input, write, current),
        authorizeRiskState: (
          boardId,
          input,
          write,
          current,
          linkedGoalIds,
          resolutionBasis,
        ) => this.authorizeGoalRiskState(
          boardId,
          input,
          write,
          current,
          linkedGoalIds,
          resolutionBasis,
        ),
        reconcileLifecycle: (
          boardId,
          goalId,
          actorId,
          previousActionToken,
          summary,
          at,
        ) => this.reconcileLifecycle(
          boardId,
          goalId,
          actorId,
          previousActionToken,
          summary,
          at,
        ),
      },
      {
        now: this.clock,
        errorFactory: (code, message, details) => new GoalBoardV1Error(code, message, details),
        personalPlanningMethodPacks: this.personalPlanningMethodPacks,
      },
    );
    this.goalsModule = goalsModule;
    this.goals = {
      commands: goalsModule.commands,
      lifecycle: goalsModule.lifecycle,
      planning: goalsModule.planning,
    };
    this.goalQueries = new GoalReadApplication(goalsModule.query, {
      now: () => this.clock(),
      snapshot: (boardId) => this.store.snapshot(boardId),
      projectGoalLifecycle: (snapshot, goalId, now) =>
        this.projectGoalLifecycle(snapshot, goalId, now),
      workState: (boardId, goal, snapshot, now) =>
        this.deriveGoalWorkState(boardId, goal, snapshot, now),
      actionProjection: (goal, snapshot, now) =>
        deriveGoalActionProjection(goal, snapshot, now),
      goalTreeProposals: (boardId, rootGoalId) =>
        this.listGoalTreeProposals({ board_id: boardId, root_goal_id: rootGoalId }).proposals,
    });
    this.executionValidation = new ExecutionValidationApplication({
      store: this.store,
      executionModule: this.executionModule,
      execution: this.execution,
      evidenceVerification: this.evidenceVerification,
      governance: this.governance,
      goalsModule: this.goalsModule,
      clock: this.clock,
      evaluate: (input) => this.evaluate(input),
      claimRoleForAction: (candidate, snapshot) => this.claimRoleForAction(candidate, snapshot),
      ensureReviewObligations: (boardId, goalId, policy, at) =>
        this.ensureReviewObligations(boardId, goalId, policy, at),
      deriveGoalWorkState: (boardId, goal, snapshot, now) =>
        this.deriveGoalWorkState(boardId, goal, snapshot, now),
      executorHandoffReasons: (workState) => this.executorHandoffReasons(workState),
      reconcileLifecycle: (boardId, goalId, actorId, previousActionToken, summary, at) =>
        this.reconcileLifecycle(boardId, goalId, actorId, previousActionToken, summary, at),
      hasPostExecutionNeedsChanges: (boardId, goalId) =>
        this.hasPostExecutionNeedsChanges(boardId, goalId),
      readRun: (runId) => this.readRun(runId),
      readReview: (boardId, reviewId) => this.readReview(boardId, reviewId),
      requireBoard: (boardId) => this.requireBoard(boardId),
      requireGoalOnBoard: (boardId, goalId) => this.requireGoalOnBoard(boardId, goalId),
      replay: <T>(boardId: string, actorId: string, operation: string, key: string, hash: string) =>
        this.replay<T>(boardId, actorId, operation, key, hash),
      remember: (boardId, actorId, operation, key, hash, outcome, at) =>
        this.remember(boardId, actorId, operation, key, hash, outcome, at),
    });
  }

  projectGoalLifecycle(
    snapshot: Pick<BoardSnapshot, "claims" | "runs">,
    goalId: string,
    now = this.clock().toISOString(),
  ): { claims: ClaimRecord[]; runs: RunRecord[] } {
    return projectGoalLifecycle(snapshot, goalId, now);
  }

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
      let cursor = this.store.appendEvent({
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

  readProjectGuidance(boardId: string): ProjectGuidanceView {
    return this.goalQueries.readProjectGuidance(boardId);
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
      let cursor = this.store.appendEvent({
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

  private authorizeGoalRiskUpdate(
    boardId: string,
    input: GoalsUpdateRiskInput,
    write: ActorWrite,
    _current: RiskRecord,
  ): void {
    const actionContextValues = [
      input.action_goal_id,
      input.contract_revision,
      input.action_id,
      input.action_token,
    ];
    if (!actionContextValues.some((value) => value != null)) return;
    const goal = this.requireGoalOnBoard(boardId, input.action_goal_id!);
    const projection = this.executionValidation.query.getGoalActionProjection({ board_id: boardId, goal_id: goal.goal_id });
    if (!contractRevisionIsCompatible(goal, this.store.snapshot(boardId), input.contract_revision!)) {
      throw new GoalBoardV1Error(
        "contract.revision_stale",
        "Risk 决定属于旧 Contract revision。",
        { current_contract_revision: goal.current_contract_revision, projection },
      );
    }
    if (input.action_token !== projection.action_token) {
      throw new GoalBoardV1Error(
        "action.token_stale",
        "处理 Risk 前 Goal 已变化；旧决定未生效。",
        { projection },
      );
    }
    if (!projection.actions.some((action) =>
      action.action_id === input.action_id &&
      action.actor === "user" &&
      action.kind === "accept_risk" &&
      action.target_type === "risk" &&
      action.target_id === input.risk_id
    )) {
      throw new GoalBoardV1Error(
        "action.not_available",
        "当前用户动作不再指向这条 Risk。",
        { projection },
      );
    }
    if (write.actor_kind !== "user") {
      throw new GoalBoardV1Error(
        "risk.user_acceptance_required",
        "只有用户可以决定是否接受这条 Risk。",
      );
    }
  }

  private authorizeGoalRiskState(
    boardId: string,
    input: GoalsSetRiskStateInput,
    write: ActorWrite,
    _current: RiskRecord,
    linkedGoalIds: string[],
    resolutionBasis: RiskRecord["resolution_basis"],
  ): void {
    const snapshot = this.store.snapshot(boardId);
    const authorizationGoalIds = input.goal_id ? [input.goal_id] : linkedGoalIds;
    for (const goalId of linkedGoalIds) {
      const goal = snapshot.goals.find((candidate) => candidate.goal_id === goalId)!;
      const projection = deriveGoalActionProjection(goal, snapshot, this.clock().toISOString());
      const isActionGoal = goalId === input.goal_id;
      if (
        isActionGoal &&
        !contractRevisionIsCompatible(goal, snapshot, input.contract_revision!)
      ) {
        throw new GoalBoardV1Error(
          "contract.revision_stale",
          "Risk 写入属于旧 Contract revision。",
          { current_contract_revision: goal.current_contract_revision, projection },
        );
      }
      if (isActionGoal && input.action_token !== projection.action_token) {
        throw new GoalBoardV1Error(
          "action.token_stale",
          "处理 Risk 前 Goal 已变化；旧写入未生效。",
          { projection },
        );
      }
      if (isActionGoal && !projection.actions.some((candidate) =>
        candidate.action_id === input.action_id &&
        candidate.target_type === "risk" &&
        candidate.target_id === input.risk_id &&
        candidate.actor === (write.actor_kind === "user" ? "user" : "runtime") &&
        candidate.kind === (write.actor_kind === "user" ? "accept_risk" : "mitigate_risk")
      )) {
        throw new GoalBoardV1Error(
          "action.not_available",
          "当前动作已经变化或不属于这个操作者。",
          { projection },
        );
      }
    }
    if (
      input.state === "resolved" &&
      (write.actor_kind != null ||
        input.action_token != null ||
        input.contract_revision != null ||
        input.goal_id != null)
    ) {
      const evidenceById = new Map(
        snapshot.evidence.map((evidence) => [evidence.evidence_id, evidence]),
      );
      for (const evidenceRef of resolutionBasis?.evidence_refs ?? []) {
        const evidence = evidenceById.get(evidenceRef);
        const goal = evidence
          ? snapshot.goals.find((candidate) => candidate.goal_id === evidence.goal_id)
          : null;
        if (
          !evidence ||
          !goal ||
          !linkedGoalIds.includes(evidence.goal_id) ||
          !contractRevisionIsCompatible(goal, snapshot, evidence.contract_revision) ||
          evidence.lifecycle_state !== "effective" ||
          evidence.historical_unmapped
        ) {
          throw new GoalBoardV1Error(
            "risk.evidence_not_current",
            "Risk resolved 只能引用关联 Goal 当前 Contract revision 的有效 Evidence。",
            { evidence_id: evidenceRef },
          );
        }
      }
    }
    if (write.actor_kind === "runtime") {
      const authorized = authorizationGoalIds.every((goalId) => {
        const goal = snapshot.goals.find((candidate) => candidate.goal_id === goalId)!;
        const claims = snapshot.claims
          .filter((claim) =>
            claim.goal_id === goalId &&
            claim.actor_id === write.actor_id &&
            contractRevisionIsCompatible(goal, snapshot, claim.contract_revision)
          )
          .sort((left, right) => left.claimed_at.localeCompare(right.claimed_at));
        const claim = claims.at(-1);
        if (!claim) return false;
        if (
          claim.state === "active" &&
          claim.action_kind === "mitigate_risk" &&
          claim.action_target_id === input.risk_id
        ) {
          return true;
        }
        const run = snapshot.runs
          .filter((candidate) => candidate.claim_id === claim.claim_id)
          .sort((left, right) => left.started_at.localeCompare(right.started_at))
          .at(-1);
        const newerClaim = snapshot.claims.some((candidate) =>
          candidate.goal_id === goalId && candidate.claimed_at > claim.claimed_at
        );
        return run?.state === "completed" && !newerClaim;
      });
      if (!authorized) {
        throw new GoalBoardV1Error(
          "risk.runtime_authority_missing",
          "Runtime 没有当前 Risk action，也不是刚完成同一 revision 的原执行者。",
        );
      }
    }
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

  /** A dedicated read path for a later trash UI/MCP; ordinary work lists exclude these Goals. */
  listTrashedGoals(boardId: string): GoalRecord[] {
    return this.goalQueries.listTrashedGoals(boardId);
  }

  private goalTreeSemanticReview(boardId: string, changedGoalIds: string[]): GoalTreeSemanticReview | null {
    const changed = unique(changedGoalIds).sort();
    if (changed.length === 0) return null;
    const impact = this.goals.planning.analyzeChange(boardId, changed);
    const required = impact.affected_ancestors.length > 0 ||
      impact.affected_dependents.length > 0 ||
      impact.adjacent_dependencies.length > 0;
    return {
      ...impact,
      structural_validation: "passed",
      status: required ? "required" : "not_required",
      next_action: required ? "review_affected_subgraph" : "continue",
      review_tool: "goalboard_v1_planning_analyze_change",
      canonical_changes_require_new_user_confirmation: true,
    };
  }

  queryReady(input: ReadyQuery): ReadyQueryResult {
    this.requireBoard(input.board_id);
    const now = this.clock().toISOString();
    const role = input.role ?? "executor";
    const ready: ReadyGoal[] = [];
    for (const goal of this.goalsModule.query.listGoals(input.board_id)) {
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
    const snapshotIndex = snapshotEvaluationIndex(snapshot);
    const policyRows = this.store.activePolicyRowsForBoard(input.board_id);
    const metrics = this.goalsModule.planning.metrics(snapshot.goals, snapshot.relations);
    const available: AvailableGoal[] = [];
    const blocked: BlockedAvailableGoal[] = [];
    const blockedOverview: BlockedAvailableOverview[] = [];
    for (const goal of snapshot.goals) {
      const actionProjection = deriveGoalActionProjection(goal, snapshot, now);
      const workState = this.deriveGoalWorkState(input.board_id, goal, snapshot, now);
      const runtimeReadyActions = actionProjection.actions.filter((candidate) =>
        candidate.actor === "runtime" &&
        candidate.status === "ready" &&
        CLAIMABLE_GOAL_ACTION_KINDS.has(candidate.kind)
      );
      if (
        (workState.work_state === "completion_blocked" && runtimeReadyActions.length === 0) ||
        workState.work_state === "waiting_for_human" ||
        workState.work_state === "replaced"
      ) {
        blocked.push({
          goal,
          work_state: workState.work_state,
          next_action: null,
          reasons: workState.work_state === "completion_blocked"
            ? this.executorHandoffReasons(workState)
            : workState.reasons,
          priority_hint: goal.priority,
          risk_summary: this.riskSummary(goal.goal_id, snapshotIndex),
        });
      }
      if (
        workState.work_state === "clarification_blocked" ||
        workState.work_state === "waiting_children" ||
        workState.work_state === "execution_blocked" ||
        workState.work_state === "review_blocked" ||
        workState.work_state === "revalidation_blocked" ||
        workState.work_state === "invalidated"
      ) {
        blockedOverview.push({
          goal,
          work_state: workState.work_state,
          next_action: "explain",
          reasons: workState.reasons.map(({ code, message }) => ({ code, message })),
          priority_hint: goal.priority,
        });
      }
      const requiresParentConfirmation =
        workState.work_state === "clarification_pending" &&
        requiresParentCompletionConfirmation(goal, snapshot);
      for (const projectedAction of runtimeReadyActions) {
        const role = this.claimRoleForAction(projectedAction, snapshot);
        const legacyNextAction: GoalWorkAction = projectedAction.kind === "clarify"
          ? "clarify"
          : projectedAction.kind === "review"
            ? "review"
            : projectedAction.kind === "revalidate"
              ? "revalidate"
              : "execute";
        const evaluation = this.evaluate({
          boardId: input.board_id,
          goalId: goal.goal_id,
          actorId: input.actor_id,
          role,
          capabilities: input.capabilities ?? [],
          goalModeAttestation: input.goal_mode_attestation ?? false,
          now,
          snapshot,
          snapshot_index: snapshotIndex,
          policy_rows: policyRows,
        });
        if (projectedAction.kind === "mitigate_risk") {
          evaluation.reasons = evaluation.reasons.filter((item) =>
            !(item.subject_type === "risk" && item.subject_id === projectedAction.target_id)
          );
        }
        if (evaluation.reasons.length > 0 || !evaluation.goal) continue;
        available.push({
          goal: evaluation.goal,
          action_id: projectedAction.action_id,
          action_token: actionProjection.action_token,
          action_kind: projectedAction.kind,
          action_target_type: projectedAction.target_type,
          action_target_id: projectedAction.target_id,
          role,
          work_state: workState.work_state,
          next_action: legacyNextAction,
          review_obligation_id: projectedAction.kind === "review" ? projectedAction.target_id : null,
          requires_parent_confirmation: requiresParentConfirmation,
          why_now: requiresParentConfirmation
            ? "现有子 Goal 都已完成，但父 Goal 的拆分还没有确认结束；先和用户确认是否已经覆盖整个父目标，再决定收口或继续补充子 Goal"
            : projectedAction.reasons[0]?.message ?? (
              projectedAction.kind === "submit_evidence"
                ? "执行已经完成，当前 Runtime 可以补齐完成依据"
                : projectedAction.kind === "mitigate_risk"
                  ? "这项风险可以由当前 Runtime 按既定方案处理"
                  : this.workActionMessage(legacyNextAction)
            ),
          priority_hint: evaluation.goal.priority,
          dependency_summary: this.dependencySummary(input.board_id, goal.goal_id, snapshotIndex),
          risk_summary: this.riskSummary(goal.goal_id, snapshotIndex),
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
    blockedOverview.sort(
      (left, right) =>
        right.priority_hint - left.priority_hint || left.goal.goal_id.localeCompare(right.goal.goal_id),
    );
    return {
      observed_event_cursor: snapshot.cursor,
      available,
      blocked,
      blocked_overview: blockedOverview,
      parallel_suggestion: this.parallelExecutionSuggestion(available),
    };
  }


  /** Apply mechanical close-out and return the exact state produced by the same transaction. */
  private reconcileLifecycle(
    boardId: string,
    goalId: string,
    actorId: string,
    previousActionToken: string,
    summary: string,
    at: string,
  ): ActionTransitionReceipt {
    const before = this.store.snapshot(boardId);
    const changedGoalIds = new Set<string>([goalId]);
    for (let iteration = 0; iteration < 6; iteration += 1) {
      const snapshot = this.store.snapshot(boardId);
      const goal = snapshot.goals.find((candidate) => candidate.goal_id === goalId);
      if (!goal) throw new GoalBoardV1Error("goal.not_found", `找不到这个 Goal: ${goalId}`);
      const plan = planGoalLifecycleReconciliation(goal, snapshot, at);
      if (plan.release_claim) {
        this.executionModule.repository.updateClaimState(
          plan.release_claim.claim_id,
          "released",
          at,
          plan.release_reason ?? "角色产物齐全，自动释放 Claim",
        );
        this.store.appendEvent({
          eventId: randomUUID(),
          boardId,
          actorId,
          type: "claim.auto_released",
          objectType: "claim",
          objectId: plan.release_claim.claim_id,
          reason: plan.release_reason ?? "角色产物齐全，自动释放 Claim",
          payload: {
            goal_id: goalId,
            contract_revision: plan.release_claim.contract_revision,
            action_kind: plan.release_claim.action_kind,
            action_target_id: plan.release_claim.action_target_id,
          },
          at,
        });
        continue;
      }
      if (plan.reopen_goal && goal.fulfillment_state === "satisfied") {
        this.goalsModule.lifecycle.reopenForLifecycleFacts(
          boardId,
          goalId,
          actorId,
          at,
          plan.reopen_reason ?? "新的当前事实使旧完成结论不再成立",
        );
        continue;
      }
      if (plan.satisfy_goal && goal.fulfillment_state !== "satisfied") {
        this.goalsModule.lifecycle.satisfyForLifecycleFacts(boardId, goalId, actorId, at);
        continue;
      }
      break;
    }

    const after = this.store.snapshot(boardId);
    const beforeById = new Map(before.goals.map((goal) => [goal.goal_id, goal]));
    for (const goal of after.goals) {
      const previous = beforeById.get(goal.goal_id);
      if (
        previous &&
        (previous.fulfillment_state !== goal.fulfillment_state || previous.validity_state !== goal.validity_state)
      ) changedGoalIds.add(goal.goal_id);
    }
    const projections = deriveGoalActionProjections(after, at);
    const projection = projections.find((item) => item.goal_id === goalId);
    if (!projection) throw new GoalBoardV1Error("goal.not_found", `找不到这个 Goal: ${goalId}`);
    return {
      goal_id: goalId,
      previous_action_token: previousActionToken,
      projection,
      affected_goals: projections
        .filter((item) => changedGoalIds.has(item.goal_id))
        .map(compactGoalActionProjection),
      summary,
      observed_event_cursor: after.cursor,
    };
  }


  /** Read the canonical effective policy without running a full readiness evaluation. */
  getResolvedGoalPolicy(input: { board_id: string; goal_id: string }): GoalPolicy {
    return this.goalQueries.getResolvedGoalPolicy(input);
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
    const workState = this.executionValidation.query.getGoalWorkState({ board_id: input.board_id, goal_id: input.goal_id });
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
    return this.goalQueries.readGoalContract(boardId, goalId);
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
      const goal = existingGoal ?? this.goals.commands.createGoal(
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
      const currentWorkState = this.executionValidation.query.getGoalWorkState({
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
        const selected = this.executionValidation.commands.selectGoalAndStart({
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

      const projection = this.executionValidation.query.getGoalActionProjection({
        board_id: input.board_id,
        goal_id: input.goal_id,
      });
      const clarificationAction = projection.primary_action?.actor === "runtime" &&
          projection.primary_action.kind === "clarify"
        ? projection.primary_action
        : projection.actions.filter((action) => action.actor === "runtime" && action.kind === "clarify").length === 1
          ? projection.actions.find((action) => action.actor === "runtime" && action.kind === "clarify")!
          : null;
      const selected = this.executionValidation.commands.selectGoalAndStart({
        board_id: input.board_id,
        goal_id: input.goal_id,
        actor_id: actorId,
        role: "clarifier",
        ...(clarificationAction
          ? { action_id: clarificationAction.action_id, action_token: projection.action_token }
          : {}),
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
    const narrative = normalizeGoalTreeProposalNarrative(input.narrative, items.length);
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
      narrative,
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
      const proposalRun = this.requireActiveGoalTreeProposalRun(
        input.board_id,
        input.discovered_in_run_id,
        actorId,
        rootGoalId,
      );
      const decompositionIssue = goalTreeProposalDecompositionIssues(
        items,
        this.store.snapshot(input.board_id),
        this.goals.planning.effectiveMethods(input.board_id),
        this.goals.planning.projectComposition(input.board_id).method_pack_ids,
      )[0];
      if (decompositionIssue) {
        const { code, message, recovery, ...details } = decompositionIssue;
        throw new GoalBoardV1Error(
          code,
          `${message}${recovery}`,
          details,
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
        previous = this.listGoalTreeProposals({
          board_id: input.board_id,
          proposal_id: supersedesProposalId,
          include_legacy: true,
        }).proposals[0] ?? null;
        if (!previous) {
          throw new GoalBoardV1Error(
            "goal_tree_proposal.not_found",
            `找不到 Goal Tree 提案: ${supersedesProposalId}`,
          );
        }
        if (previous.origin !== "native" && previous.origin !== "legacy_contract_proposal") {
          throw new GoalBoardV1Error(
            "goal_tree_proposal.legacy_supersession_unsupported",
            `supersedes_proposal_id=${supersedesProposalId} 指向 ${previous.origin}；当前只支持修订 native Proposal 或 legacy Contract Proposal。Candidate 请用 candidate item 晋升，Rewire 只会在等价关系变更确认落地后自动关闭。`,
            {
              path: "supersedes_proposal_id",
              received_value: supersedesProposalId,
              resolved_proposal_id: previous.proposal_id,
              origin: previous.origin,
              allowed_origins: ["native", "legacy_contract_proposal"],
              next_action: previous.origin === "legacy_candidate"
                ? "promote_candidate_with_candidate_item"
                : "submit_equivalent_relation_change_without_supersedes_handle",
            },
          );
        }
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
      const canonicalSupersedesProposalId = previous?.proposal_id ?? null;
      const supersedesNativeProposalId = previous?.origin === "native" ? previous.proposal_id : null;
      const supersedesLegacyProposalId = previous?.origin === "legacy_contract_proposal"
        ? previous.proposal_id
        : null;
      const effectiveRootGoalId = rootGoalId ?? previous?.root_goal_id ?? proposalRun.goal_id;
      if (
        items.some((item) => this.isRiskLifecycleChange(input.board_id, item)) &&
        effectiveRootGoalId !== proposalRun.goal_id
      ) {
        throw new GoalBoardV1Error(
          "goal_tree_proposal.root_goal_mismatch",
          "Risk 生命周期提案必须修改发起本轮澄清的同一条 Goal；不能用一条 Goal 的 clarifier Run 代替另一条 Goal 处理 Risk",
        );
      }
      const rootGoal = this.requireGoalOnBoard(input.board_id, effectiveRootGoalId);
      if (proposalRun.role === "executor" || proposalRun.role === "revalidator") {
        if (!items.every((item) => this.isRiskLifecycleChange(input.board_id, item))) {
          const roleLabel = proposalRun.role === "executor" ? "executor" : "revalidator";
          throw new GoalBoardV1Error(
            `goal_tree_proposal.${roleLabel}_scope_invalid`,
            `${roleLabel} Run 只能为自己的同一 Goal 提交 Risk 生命周期条目；Goal、Contract、关系和普通 Risk 事实仍由 clarifier 规划`,
          );
        }
        if (
          rootGoal.definition_state !== "accepted" ||
          rootGoal.decomposition_state !== "closed_leaf"
        ) {
          throw new GoalBoardV1Error(
            "goal_tree_proposal.executor_goal_not_executable",
            "executor 只能从已接受、可直接执行的同一条叶子 Goal 提交 Risk 生命周期结果",
          );
        }
      }
      this.requireDraftRiskLifecycleContract(input.board_id, rootGoal, items);
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

      for (const [index, item] of items.entries()) {
        const existingItem = this.governance.records.findGoalTreeItemOwner(item.item_id);
        if (!existingItem) continue;
        const conflictingProposalId = existingItem.proposal_id;
        throw new GoalBoardV1Error(
          "goal_tree_proposal.item_id_conflict",
          `items[${index}].item_id=${item.item_id} 已被提案 ${conflictingProposalId} 使用；请为修订条目提供新的全局唯一 item_id，并用 supersedes_item_id 保留来源关联。`,
          {
            path: `items[${index}].item_id`,
            received_value: item.item_id,
            conflicting_proposal_id: conflictingProposalId,
            conflicting_board_id: existingItem.board_id,
            next_action: "use_unique_item_id",
            recovery: "生成新的全局唯一 item_id；若这是对旧条目的修订，同时填写 supersedes_proposal_id 和 supersedes_item_id。失败调用不会创建 Proposal。",
          },
        );
      }

      const proposalId = `goal-tree-proposal-${randomUUID()}`;
      const now = this.clock().toISOString();
      const version = (previous?.version ?? 0) + 1;
      this.governance.records.insertGoalTreeProposal({
        proposal_id: proposalId,
        board_id: input.board_id,
        root_goal_id: effectiveRootGoalId,
        submitted_by: actorId,
        discovered_in_run_id: input.discovered_in_run_id,
        state: "pending",
        version,
        supersedes_proposal_id: supersedesNativeProposalId,
        supersedes_legacy_proposal_id: supersedesLegacyProposalId,
        base_event_cursor: baseEventCursor,
        summary,
        narrative,
        created_at: now,
        updated_at: now,
      });
      for (const [index, item] of items.entries()) {
        const baselineVersions = item.affected_objects.map((object) =>
          this.proposalObjectVersion(input.board_id, object, item),
        );
        this.governance.records.insertGoalTreeProposalItem({
          item_id: item.item_id,
          proposal_id: proposalId,
          board_id: input.board_id,
          ordinal: index + 1,
          kind: item.kind,
          operation: item.operation,
          payload: item.payload,
          source_refs: item.source_refs,
          reason: item.reason,
          explanation: item.explanation,
          confidence: item.confidence,
          affected_objects: item.affected_objects,
          baseline_versions: baselineVersions,
          requires_user_confirmation: true,
          state: "pending",
          supersedes_item_id: item.supersedes_item_id,
          created_at: now,
          updated_at: now,
        });
      }
      if (previous) {
        if (previous.origin === "native") {
          this.governance.records.supersedeGoalTreeProposal(previous.proposal_id, now);
        } else {
          const rawLegacyProposalId = previous.proposal_id.slice("legacy-contract-proposal:".length);
          this.governance.records.transitionContractProposal(
            input.board_id,
            rawLegacyProposalId,
            "superseded",
            {
              reason: "clarifier 用新的 native Goal Tree Proposal 修订了这份历史 Contract Proposal",
              superseded_by: actorId,
              superseded_by_goal_tree_proposal_id: proposalId,
            },
            now,
          );
        }
      }
      let cursor = this.store.appendEvent({
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
          supersedes_proposal_id: canonicalSupersedesProposalId,
          item_ids: items.map((item) => item.item_id),
        },
        at: now,
      });
      if (proposalRun.role === "clarifier") {
        this.executionModule.repository.completeRun(input.discovered_in_run_id, now);
        cursor = this.store.appendEvent({
          eventId: randomUUID(),
          boardId: input.board_id,
          actorId,
          type: "run.completed",
          objectType: "run",
          objectId: input.discovered_in_run_id,
          reason: "完整 Proposal 已提交，Clarifier Run 自动结束",
          payload: { goal_id: proposalRun.goal_id, proposal_id: proposalId },
          at: now,
        });
        const beforeRelease = this.executionValidation.query.getGoalActionProjection({
          board_id: input.board_id,
          goal_id: proposalRun.goal_id,
        });
        cursor = this.reconcileLifecycle(
          input.board_id,
          proposalRun.goal_id,
          actorId,
          beforeRelease.action_token,
          "完整 Proposal 已提交，Clarifier 工作已自动释放",
          now,
        ).observed_event_cursor;
      }
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
      .filter((proposal) => {
        if (!input.proposal_id) return true;
        if (proposal.proposal_id === input.proposal_id) return true;
        if (proposal.origin === "native") return false;
        const separator = proposal.proposal_id.indexOf(":");
        return separator >= 0 && proposal.proposal_id.slice(separator + 1) === input.proposal_id;
      })
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
    const proposalView = this.listGoalTreeProposals({
      board_id: input.board_id,
      proposal_id: proposalId,
      include_legacy: true,
    }).proposals[0];
    if (!proposalView) {
      throw new GoalBoardV1Error("goal_tree_proposal.not_found", `找不到 Goal Tree 提案: ${proposalId}`);
    }
    if (proposalView.origin === "legacy_contract_proposal") {
      return this.checkLegacyContractGoalTreeProposal(input, proposalView, actorId);
    }
    if (proposalView.origin !== "native") {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.legacy_check_unsupported",
        "当前历史提案不需要统一预检；请直接使用读取结果中的映射 proposal_id 与 item_id 做决定",
        { proposal_id: proposalView.proposal_id, next_action: "decide_legacy_proposal" },
      );
    }
    const canonicalProposalId = proposalView.proposal_id;
    const hash = requestHash({ board_id: input.board_id, proposal_id: canonicalProposalId, actor_id: actorId });
    return this.store.immediate(() => {
      const replay = this.replay<GoalTreeProposalCheckResult>(
        input.board_id,
        actorId,
        "check_goal_tree_proposal",
        input.idempotency_key,
        hash,
      );
      if (replay) return replay;
      const proposal = this.readNativeGoalTreeProposal(input.board_id, canonicalProposalId);
      const now = this.clock().toISOString();
      const conflictItemIdSet = new Set<string>();
      for (const item of proposal.items) {
        if (item.state !== "pending" && item.state !== "conflict") continue;
        const validationIssue = goalTreeProposalItemValidationIssues(item)[0];
        const baselineConflicts = item.baseline_versions.flatMap((baseline) => {
          const current = this.proposalObjectVersionForBaseline(input.board_id, baseline, item);
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
        if (conflict) conflictItemIdSet.add(item.item_id);
        this.governance.records.setGoalTreeItemCheck(
          canonicalProposalId,
          item.item_id,
          conflict ? "conflict" : "pending",
          conflict,
          now,
        );
      }
      const checkedItems = this.readNativeGoalTreeProposal(input.board_id, canonicalProposalId).items;
      const materializationConflicts = this.preflightGoalTreeProposalMaterialization(
        input.board_id,
        checkedItems.filter((item) => item.state === "pending"),
        actorId,
        now,
      );
      for (const item of checkedItems) {
        const conflict = materializationConflicts.get(item.item_id);
        if (!conflict) continue;
        conflictItemIdSet.add(item.item_id);
        this.governance.records.setGoalTreeItemCheck(
          canonicalProposalId,
          item.item_id,
          "conflict",
          conflict,
          now,
        );
      }
      const conflictItemIds = proposal.items
        .filter((item) => conflictItemIdSet.has(item.item_id))
        .map((item) => item.item_id);
      const planningIssues = this.goalTreePlanningIssues(input.board_id, proposal.items);
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId,
        type: "goal_tree_proposal.checked",
        objectType: "goal_tree_proposal",
        objectId: canonicalProposalId,
        reason: conflictItemIds.length > 0
          ? "当前 Runtime 检查到部分 Goal Tree 提案条目不再满足当前校验或基准"
          : "当前 Runtime 检查到 Goal Tree 提案的各条目基准仍有效",
        payload: {
          conflict_item_ids: conflictItemIds,
          planning_issue_codes: planningIssues.map((issue) => issue.code),
        },
        at: now,
      });
      const outcome: GoalTreeProposalCheckResult = {
        proposal: this.readNativeGoalTreeProposal(input.board_id, canonicalProposalId),
        conflict_item_ids: conflictItemIds,
        planning_issues: planningIssues,
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

  private checkLegacyContractGoalTreeProposal(
    input: GoalTreeProposalCheckInput,
    proposalView: GoalTreeProposalRecord,
    actorId: string,
  ): GoalTreeProposalCheckResult {
    const canonicalProposalId = proposalView.proposal_id;
    const rawProposalId = canonicalProposalId.slice("legacy-contract-proposal:".length);
    const hash = requestHash({
      board_id: input.board_id,
      proposal_id: canonicalProposalId,
      actor_id: actorId,
    });
    return this.store.immediate(() => {
      const replay = this.replay<GoalTreeProposalCheckResult>(
        input.board_id,
        actorId,
        "check_goal_tree_proposal",
        input.idempotency_key,
        hash,
      );
      if (replay) return replay;

      const proposal = this.store
        .snapshot(input.board_id)
        .contract_proposals.find((item) => item.proposal_id === rawProposalId);
      if (!proposal) {
        throw new GoalBoardV1Error(
          "goal_tree_proposal.not_found",
          `找不到 Goal Tree 提案: ${canonicalProposalId}`,
        );
      }
      const now = this.clock().toISOString();
      let conflict: Record<string, unknown> | null = null;
      try {
        if (proposal.state !== "pending") {
          throw new GoalBoardV1Error(
            "contract_proposal.already_decided",
            "Contract Proposal 已经做过决定",
            { state: proposal.state },
          );
        }
        const validationInput: SubmitContractProposalInput = {
          board_id: input.board_id,
          goal_id: proposal.goal_id,
          actor_id: proposal.submitted_by,
          discovered_in_run_id: proposal.discovered_in_run_id,
          proposed_goal: proposal.proposed_goal,
          field_sources: proposal.field_sources,
          review_policy: proposal.review_policy,
          proposed_impacts: proposal.proposed_impacts,
          proposed_risks: proposal.proposed_risks,
          dependency_rewire_ids: proposal.dependency_rewire_ids,
          idempotency_key: `preflight:${rawProposalId}`,
        };
        validateContractProposalInputShape(validationInput);
        const goal = this.requireGoalOnBoard(input.board_id, proposal.goal_id);
        if (goal.definition_state !== "draft") {
          throw new GoalBoardV1Error(
            "contract_proposal.goal_not_draft",
            "这个 Goal 已经不是 Draft，不能再用补全提案改写",
          );
        }
        this.validateContractProposal(
          input.board_id,
          proposal.goal_id,
          proposal.proposed_goal,
          proposal.field_sources,
          proposal.review_policy,
          proposal.proposed_impacts,
          proposal.proposed_risks,
          proposal.dependency_rewire_ids,
          true,
        );
      } catch (error) {
        if (error instanceof GoalBoardV1Error) {
          conflict = {
            code: error.code,
            message: error.message,
            ...(error.details ?? {}),
            recovery:
              error.details?.recovery ??
              "请根据字段路径修订 Contract Proposal；在冲突消失前不要提交用户决定。",
          };
        } else {
          conflict = {
            code: "contract_proposal.preflight_failed",
            message: error instanceof Error ? error.message : String(error),
            recovery: "请重新读取 Contract Proposal 并按工具 schema 修订；预检失败不会改写 canonical Goal。",
          };
        }
      }

      const checkedItem = {
        ...proposalView.items[0]!,
        state: conflict ? "conflict" as const : "pending" as const,
        conflict,
        updated_at: now,
      };
      const checkedProposal: GoalTreeProposalRecord = {
        ...proposalView,
        items: [checkedItem],
        updated_at: now,
      };
      const conflictItemIds = conflict ? [checkedItem.item_id] : [];
      const planningIssues = this.goalTreePlanningIssues(input.board_id, checkedProposal.items);
      const cursor = this.store.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId,
        type: "goal_tree_proposal.checked",
        objectType: "goal_tree_proposal",
        objectId: canonicalProposalId,
        reason: conflict
          ? "当前 Runtime 检查到历史 Contract Proposal 不能安全决定"
          : "当前 Runtime 检查到历史 Contract Proposal 可以安全决定",
        payload: {
          origin: "legacy_contract_proposal",
          raw_proposal_id: rawProposalId,
          conflict_item_ids: conflictItemIds,
          planning_issue_codes: planningIssues.map((issue) => issue.code),
        },
        at: now,
      });
      const outcome: GoalTreeProposalCheckResult = {
        proposal: checkedProposal,
        conflict_item_ids: conflictItemIds,
        planning_issues: planningIssues,
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
   * Applies either an explicitly selected subset or one pristine whole proposal.
   * Subset decisions preserve independent-item conflict handling; whole confirmation
   * is all-or-nothing and rolls the transaction back when any item cannot land.
   */
  decideGoalTreeProposal(input: GoalTreeProposalDecideInput): GoalTreeProposalDecisionResult {
    const authority = normalizeGoalTreeProposalDecisionAuthority(input.authority);
    const wholeConfirmation = input.confirm_all_pending === true;
    const proposalId = requiredDialogueText(
      input.proposal_id,
      "goal_tree_proposal.id_required",
      "需要指定要决定的 Goal Tree proposal_id",
    );
    const runtimeActorId = nullableDialogueText(input.runtime_actor_id);
    if (proposalId.startsWith("legacy-")) {
      return this.decideLegacyGoalTreeProposal(input, proposalId, authority);
    }
    const hash = requestHash({
      board_id: input.board_id,
      proposal_id: proposalId,
      runtime_actor_id: runtimeActorId,
      authority,
      decisions: input.decisions ?? [],
      reason: input.reason ?? null,
      confirm_all_pending: wholeConfirmation,
    });
    return this.governance.decisions.materializeAtomically(() => {
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
      const abortWholeConfirmation = (
        item: GoalTreeProposalItemRecord,
        conflict: Record<string, unknown>,
      ): never => {
        const detail = String(conflict.message ?? conflict.code ?? "当前事实与提案不一致");
        const recovery = String(conflict.recovery ?? this.goalTreeProposalConflictRecovery(conflict));
        throw new GoalBoardV1Error(
          "goal_tree_proposal.whole_confirmation_conflict",
          `整份提案中的条目「${item.item_id}」暂时不能采用：${detail}。本次整份确认没有写入任何变更；${recovery}`,
          {
            item_id: item.item_id,
            original_code: conflict.code ?? null,
            conflict,
            next_action: "check_and_revise",
          },
        );
      };

      let decisions = normalizeGoalTreeProposalDecisions(input.decisions, input.reason);
      if (wholeConfirmation) {
        if (decisions.length > 0) {
          throw new GoalBoardV1Error(
            "goal_tree_proposal.whole_confirmation_mixed",
            "整份确认不能同时携带逐项决定；请二选一",
          );
        }
        if (proposal.state !== "pending") {
          throw new GoalBoardV1Error(
            "goal_tree_proposal.whole_confirmation_requires_pristine_proposal",
            "这份提案已经有条目落地，不能再作为一份完整变更原子确认；请基于当前 Goal Tree 生成只包含未落地内容的修订提案",
            {
              proposal_id: proposal.proposal_id,
              state: proposal.state,
              next_action: "create_revision_from_current_tree",
            },
          );
        }
        if (
          authority.whole_confirmation_prompted !== true ||
          (authority.authority_source === "runtime_dialogue" &&
            authority.prompted_proposal_id !== proposal.proposal_id)
        ) {
          throw new GoalBoardV1Error(
            "goal_tree_proposal.whole_confirmation_ambiguous",
            "简短确认只有在上一问明确点名这一整份提案时才能生效；请绑定准确的 Proposal ID，或逐项说明决定",
            {
              proposal_id: proposal.proposal_id,
              whole_confirmation_prompted: authority.whole_confirmation_prompted === true,
              prompted_proposal_id: authority.prompted_proposal_id ?? null,
              next_action: "bind_confirmation_to_exact_proposal_or_decide_items",
            },
          );
        }
        const existingConflict = proposal.items.find((item) => item.state === "conflict");
        if (existingConflict) {
          abortWholeConfirmation(existingConflict, existingConflict.conflict ?? {
            code: "goal_tree_proposal.item_conflict",
            message: "条目与当前 GoalBoard 事实不一致",
          });
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

      const confirmedItems = decisions
        .filter((decision) => decision.decision === "confirm")
        .map((decision) => itemsById.get(decision.item_id)!);
      if (proposal.root_goal_id) {
        const rootGoal = this.requireGoalOnBoard(input.board_id, proposal.root_goal_id);
        const companionContract = this.requireDraftRiskLifecycleContract(
          input.board_id,
          rootGoal,
          confirmedItems,
        );
        if (companionContract) {
          const dependentItems = [
            companionContract,
            ...confirmedItems.filter((item) => this.isRiskLifecycleChange(input.board_id, item)),
          ];
          for (const item of dependentItems) {
            const baselineConflicts = this.goalTreeProposalItemConflicts(input.board_id, item);
            const materializationConflict = this.goalTreeProposalMaterializationConflict(input.board_id, item);
            if (baselineConflicts.length > 0 || materializationConflict) {
              throw new GoalBoardV1Error(
                "goal_tree_proposal.risk_goal_atomic_conflict",
                "Risk 生命周期变更和承载它的 Goal Contract 必须一起成功；当前事实已经变化，请先刷新并修订整份提案",
              );
            }
          }
        }
      } else if (confirmedItems.some((item) => this.isRiskLifecycleChange(input.board_id, item))) {
        throw new GoalBoardV1Error(
          "goal_tree_proposal.risk_goal_root_required",
          "Risk 生命周期变更必须归属于一条明确的 Goal；请重新提交带 root_goal_id 的提案",
        );
      }

      const decompositionIssue = goalTreeProposalDecompositionIssues(
        confirmedItems,
        this.store.snapshot(input.board_id),
        this.goals.planning.effectiveMethods(input.board_id),
        this.goals.planning.projectComposition(input.board_id).method_pack_ids,
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
          if (wholeConfirmation) {
            abortWholeConfirmation(item, {
              code: planningConflict.code,
              message: planningConflict.message,
              goal_ids: planningConflict.goal_ids,
              relation_ids: planningConflict.relation_ids,
              path: planningConflict.path,
            });
          }
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
          if (wholeConfirmation) {
            abortWholeConfirmation(item, {
              code: "goal_tree_proposal.baseline_changed",
              message: "条目依赖的 GoalBoard 事实已经变化",
              objects: conflicts,
            });
          }
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

      const projectionsBeforeDecision = new Map(
        this.executionValidation.query.getGoalActionProjections({ board_id: input.board_id })
          .map((projection) => [projection.goal_id, projection]),
      );
      const materializationOrder: GoalTreeProposalItemRecord["kind"][][] = [
        ["goal", "contract", "candidate"],
        ["policy", "risk"],
        ["relation", "dependency", "rewire"],
      ];
      for (const kinds of materializationOrder) {
        for (const entry of confirmed.filter((candidate) => kinds.includes(candidate.item.kind))) {
          const conflict = this.goalTreeProposalMaterializationConflict(input.board_id, entry.item);
          if (conflict) {
            if (wholeConfirmation) abortWholeConfirmation(entry.item, conflict);
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
          let materializedObjects: ProposalAffectedObject[];
          try {
            materializedObjects = this.materializeGoalTreeProposalItem(
              input.board_id,
              entry.item,
              authority.actor_id,
              entry.decision.reason,
              now,
            );
          } catch (error) {
            if (wholeConfirmation && error instanceof GoalBoardV1Error) {
              abortWholeConfirmation(entry.item, {
                code: error.code,
                message: error.message,
                ...(error.details ?? {}),
              });
            }
            throw error;
          }
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
        this.reconcileEquivalentLegacyRewires(
          input.board_id,
          proposal.proposal_id,
          confirmed
            .map((entry) => entry.item)
            .filter((item) =>
              appliedItemIds.includes(item.item_id) &&
              (item.kind === "relation" || item.kind === "dependency")),
          authority.actor_id,
          now,
        );
        this.goalsModule.lifecycle.reconcileAllClosedCompoundGoals(input.board_id, authority.actor_id, now);
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

      const changedGoalIds = confirmed
        .filter((entry) => appliedItemIds.includes(entry.item.item_id))
        .flatMap((entry) => entry.item.affected_objects)
        .filter((object) => object.object_type === "goal")
        .map((object) => object.object_id);
      const semanticReview = this.goalTreeSemanticReview(input.board_id, changedGoalIds);
      this.refreshGoalTreeProposalState(
        input.board_id,
        proposal.proposal_id,
        authority.actor_id,
        now,
        semanticReview,
      );
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
          whole_confirmation_prompted: authority.whole_confirmation_prompted === true,
          prompted_proposal_id: authority.prompted_proposal_id ?? null,
          applied_item_ids: appliedItemIds,
          rejected_item_ids: rejectedItemIds,
          revised_item_ids: revisedItemIds,
          conflict_item_ids: conflictItemIds,
          revision_proposal_ids: revisionProposals.map((item) => item.proposal_id),
          semantic_review: semanticReview,
        },
        at: now,
      });
      const projectionsAfterDecision = this.executionValidation.query.getGoalActionProjections({ board_id: input.board_id });
      const changedProjections = projectionsAfterDecision.filter((projection) =>
        projectionsBeforeDecision.get(projection.goal_id)?.action_token !== projection.action_token
      );
      const affectedGoals = changedProjections.map(compactGoalActionProjection);
      const transitions = changedProjections.map((projection): ActionTransitionReceipt => ({
        goal_id: projection.goal_id,
        previous_action_token: projectionsBeforeDecision.get(projection.goal_id)?.action_token ?? "",
        projection,
        affected_goals: affectedGoals,
        summary: "已应用决定并更新下一步",
        observed_event_cursor: cursor,
      }));
      const outcome: Omit<GoalTreeProposalDecisionResult, "replayed"> = {
        proposal: this.readNativeGoalTreeProposal(input.board_id, proposal.proposal_id),
        revision_proposals: revisionProposals.map((item) => this.readNativeGoalTreeProposal(input.board_id, item.proposal_id)),
        applied_item_ids: appliedItemIds,
        rejected_item_ids: rejectedItemIds,
        revised_item_ids: revisedItemIds,
        conflict_item_ids: conflictItemIds,
        semantic_review: semanticReview,
        transitions,
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

  private decideLegacyGoalTreeProposal(
    input: GoalTreeProposalDecideInput,
    proposalId: string,
    authority: GoalTreeProposalDecisionAuthority,
  ): GoalTreeProposalDecisionResult {
    const before = this.listGoalTreeProposals({
      board_id: input.board_id,
      proposal_id: proposalId,
      include_legacy: true,
    }).proposals[0];
    if (!before || before.origin === "native") {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.not_found",
        `找不到 Goal Tree 提案: ${proposalId}`,
      );
    }
    const item = before.items[0];
    if (!item || before.items.length !== 1) {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.legacy_shape_invalid",
        "历史提案无法映射为唯一可决定条目；请使用对应历史决定入口",
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
      if (
        authority.whole_confirmation_prompted !== true ||
        (authority.authority_source === "runtime_dialogue" &&
          authority.prompted_proposal_id !== proposalId)
      ) {
        throw new GoalBoardV1Error(
          "goal_tree_proposal.whole_confirmation_ambiguous",
          "简短确认只有在上一问明确点名这一份历史提案时才能生效",
          {
            proposal_id: proposalId,
            whole_confirmation_prompted: authority.whole_confirmation_prompted === true,
            prompted_proposal_id: authority.prompted_proposal_id ?? null,
            next_action: "bind_confirmation_to_exact_proposal_or_decide_item",
          },
        );
      }
      decisions = [{
        item_id: item.item_id,
        decision: "confirm",
        reason: requiredDialogueText(
          input.reason ?? "",
          "goal_tree_proposal.decision_reason_required",
          "整份确认需要记录用户的确认理由或原始表达",
        ),
        revised_item: null,
      }];
    }
    if (decisions.length !== 1) {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.legacy_single_decision_required",
        "每个历史兼容提案只包含一项，请明确确认或拒绝这一项",
      );
    }
    const decision = decisions[0]!;
    if (decision.item_id !== item.item_id) {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.decision_item_not_found",
        `提案中不存在条目: ${decision.item_id}`,
      );
    }
    if (decision.decision === "revise") {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.legacy_revision_unsupported",
        "历史兼容提案不能在原记录上修订；请创建 native Goal Tree Proposal 并引用这条历史提案",
        { proposal_id: proposalId, next_action: "create_native_revision" },
      );
    }

    let observedEventCursor: number;
    let replayed: boolean;
    if (proposalId.startsWith("legacy-contract-proposal:")) {
      const result = this.decideContractProposal({
        board_id: input.board_id,
        proposal_id: proposalId.slice("legacy-contract-proposal:".length),
        actor_id: authority.actor_id,
        actor_kind: "user",
        decision: decision.decision === "confirm" ? "approved" : "rejected",
        reason: decision.reason,
        idempotency_key: input.idempotency_key,
      });
      observedEventCursor = result.observed_event_cursor;
      replayed = result.replayed;
    } else if (proposalId.startsWith("legacy-candidate:")) {
      const result = this.decideCandidate({
        board_id: input.board_id,
        candidate_id: proposalId.slice("legacy-candidate:".length),
        actor_id: authority.actor_id,
        actor_kind: "user",
        decision: decision.decision === "confirm" ? "approved" : "rejected",
        reason: decision.reason,
        idempotency_key: input.idempotency_key,
      });
      observedEventCursor = result.observed_event_cursor;
      replayed = result.replayed;
    } else if (proposalId.startsWith("legacy-rewire:")) {
      const result = this.confirmRewire({
        board_id: input.board_id,
        rewire_id: proposalId.slice("legacy-rewire:".length),
        actor_id: authority.actor_id,
        actor_kind: "user",
        decision: decision.decision === "confirm" ? "confirmed" : "rejected",
        reason: decision.reason,
        idempotency_key: input.idempotency_key,
      });
      observedEventCursor = result.observed_event_cursor;
      replayed = result.replayed;
    } else {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.legacy_origin_unsupported",
        "这个历史提案类型还不能从统一决定入口处理",
      );
    }

    const proposal = this.listGoalTreeProposals({
      board_id: input.board_id,
      proposal_id: proposalId,
      include_legacy: true,
    }).proposals[0];
    if (!proposal) {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.not_found",
        `决定完成后无法读取 Goal Tree 提案: ${proposalId}`,
      );
    }
    return {
      proposal,
      revision_proposals: [],
      applied_item_ids: decision.decision === "confirm" ? [item.item_id] : [],
      rejected_item_ids: decision.decision === "reject" ? [item.item_id] : [],
      revised_item_ids: [],
      conflict_item_ids: [],
      semantic_review: decision.decision === "confirm"
        ? this.goalTreeSemanticReview(
            input.board_id,
            item.affected_objects
              .filter((object) => object.object_type === "goal")
              .map((object) => object.object_id),
          )
        : null,
      transitions: [],
      observed_event_cursor: observedEventCursor,
      replayed,
    };
  }


  submitContractProposal(input: SubmitContractProposalInput): {
    proposal: ContractProposalRecord;
    replayed: boolean;
    observed_event_cursor: number;
  } {
    validateContractProposalInputShape(input);
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
      const run = this.execution.query.getRun(input.board_id, input.discovered_in_run_id);
      if (!run) {
        throw new GoalBoardV1Error(
          "contract_proposal.run_not_found",
          "Contract Proposal 引用的 clarifier Run 不存在",
        );
      }
      if (
        run.actor_id !== input.actor_id ||
        run.goal_id !== input.goal_id ||
        run.role !== "clarifier"
      ) {
        throw new GoalBoardV1Error(
          "contract_proposal.run_invalid",
          "只有认领这个 Draft 的 clarifier 可以提交它的 Contract Proposal",
        );
      }
      if (["failed", "abandoned"].includes(run.state)) {
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
      this.governance.records.supersedePendingContractProposals(
        input.board_id,
        input.goal_id,
        now,
        { reason: "clarifier 提交了新的完整 Proposal", superseded_by: input.actor_id },
      );
      const proposalId = `contract-proposal-${randomUUID()}`;
      this.governance.records.insertContractProposal({
        proposal_id: proposalId,
        board_id: input.board_id,
        goal_id: input.goal_id,
        submitted_by: input.actor_id,
        discovered_in_run_id: input.discovered_in_run_id,
        proposed_goal: input.proposed_goal,
        field_sources: input.field_sources,
        review_policy: input.review_policy,
        proposed_impacts: input.proposed_impacts ?? [],
        proposed_risks: input.proposed_risks ?? [],
        dependency_rewire_ids: normalizedDependencyIds,
        state: "pending",
        decision: null,
        created_at: now,
        decided_at: null,
      });
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
      const proposal = this.readContractProposal(input.board_id, proposalId);
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
    return this.governance.decisions.materializeAtomically(() => {
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

      const pendingProposal = this.governance.query.getContractProposal(input.board_id, input.proposal_id);
      if (!pendingProposal) {
        throw new GoalBoardV1Error(
          "contract_proposal.not_found",
          "Contract Proposal 不存在",
        );
      }
      if (pendingProposal.state !== "pending") {
        throw new GoalBoardV1Error(
          "contract_proposal.already_decided",
          "Contract Proposal 已经做过决定",
        );
      }
      const goalId = pendingProposal.goal_id;
      const goal = this.requireGoalOnBoard(input.board_id, goalId);
      if (goal.definition_state !== "draft") {
        throw new GoalBoardV1Error(
          "contract_proposal.goal_not_draft",
          "这个 Goal 已经不是 Draft，不能再用补全提案改写",
        );
      }
      const now = this.clock().toISOString();
      if (input.decision === "rejected") {
        this.governance.records.transitionContractProposal(
          input.board_id,
          input.proposal_id,
          "rejected",
          { reason: input.reason, decided_by: input.actor_id },
          now,
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
        const proposal = this.readContractProposal(input.board_id, input.proposal_id);
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

      const proposedGoal = pendingProposal.proposed_goal;
      const fieldSources = pendingProposal.field_sources;
      const reviewPolicy = pendingProposal.review_policy;
      const proposedImpacts = pendingProposal.proposed_impacts;
      const proposedRisks = pendingProposal.proposed_risks;
      const dependencyRewireIds = pendingProposal.dependency_rewire_ids;
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

      this.goalsModule.lifecycle.acceptDraft({
        board_id: input.board_id,
        goal_id: goalId,
        proposed_goal: {
          ...proposedGoal,
          goal_id: goalId,
          definition_state: "accepted",
          decomposition_state: "closed_leaf",
          decomposition_review: undefined,
          priority: proposedGoal.priority ?? goal.priority,
        },
        actor_id: input.actor_id,
        accepted_at: now,
      });

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
      this.governance.records.transitionContractProposal(
        input.board_id,
        input.proposal_id,
        "approved",
        {
            reason: input.reason,
            decided_by: input.actor_id,
            confirmed_fields: confirmedFields,
            policy_binding_id: policyBindingId,
            impact_binding_ids: impactBindingIds,
            risk_ids: riskIds,
            dependency_rewire_ids: dependencyRewireIds,
        },
        now,
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
      const proposal = this.readContractProposal(input.board_id, input.proposal_id);
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
    this.goalsModule.commands.validateGoalInput(input.proposed_goal);
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
        const run = this.execution.query.getRun(input.board_id, input.discovered_in_run_id);
        if (!run) throw new GoalBoardV1Error("candidate.run_not_found", "Candidate 引用的 Run 不存在");
        if (run.actor_id !== input.actor_id) {
          throw new GoalBoardV1Error("candidate.run_not_owner", "只有 Run 执行者可以报告它发现的新工作");
        }
      }
      const candidateId = `candidate-${randomUUID()}`;
      const now = this.clock().toISOString();
      this.governance.records.insertCandidate({
        candidate_id: candidateId,
        board_id: input.board_id,
        submitted_by: input.actor_id,
        discovered_in_run_id: input.discovered_in_run_id ?? null,
        proposed_goal: input.proposed_goal,
        proposed_relations: proposedRelations,
        proposed_impacts: input.proposed_impacts ?? [],
        proposed_risks: input.proposed_risks ?? [],
        blocking_mode: input.blocking_mode ?? "none",
        state: "pending",
        decision: null,
        created_at: now,
        decided_at: null,
      });
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
      const candidate = this.readCandidate(input.board_id, candidateId);
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
      const run = this.execution.query.getRun(input.board_id, input.discovered_in_run_id);
      if (!run) {
        throw new GoalBoardV1Error(
          "dependency_proposal.run_not_found",
          "Dependency Proposal 引用的 Run 不存在",
        );
      }
      if (run.actor_id !== input.actor_id) {
        throw new GoalBoardV1Error(
          "dependency_proposal.run_not_owner",
          "只有 Run 执行者可以提交它发现的依赖",
        );
      }
      this.validateStandaloneDependencies(input.board_id, dependencies);
      if (
        blockingMode === "current_run" &&
        !dependencies.some((dependency) => dependency.from_goal_id === run.goal_id)
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
      const activeRuns = this.executionModule.repository.listNonterminalRuns(input.board_id);
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
          .filter((activeRun) => affectedGoalIds.includes(activeRun.goal_id))
          .map((activeRun) => ({
            run_id: activeRun.run_id,
            goal_id: activeRun.goal_id,
          })),
        proposed_changes_applied: false,
      };
      this.governance.records.insertRewire({
        rewire_id: rewireId,
        board_id: input.board_id,
        candidate_id: null,
        proposal,
        impact,
        state: "pending",
        created_at: now,
        decided_at: null,
      });
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
      const rewire = this.readRewire(input.board_id, rewireId);
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
    return this.governance.decisions.materializeAtomically(() => {
      const replay = this.replay<{ candidate: CandidateGoalRecord; observed_event_cursor: number }>(
        input.board_id,
        input.actor_id,
        "decide_candidate",
        input.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      const pendingCandidate = this.governance.query.getCandidate(input.board_id, input.candidate_id);
      if (!pendingCandidate) throw new GoalBoardV1Error("candidate.not_found", "Candidate Goal 不存在");
      if (pendingCandidate.state !== "pending") {
        throw new GoalBoardV1Error("candidate.already_decided", "Candidate Goal 已经做过决定");
      }
      const now = this.clock().toISOString();
      let decision: Record<string, unknown> = { reason: input.reason, decided_by: input.actor_id };
      if (input.decision === "approved") {
        const proposed = pendingCandidate.proposed_goal;
        const proposedRelations = this.normalizeProposedRelations(
          pendingCandidate.proposed_relations,
          true,
        );
        this.validateCandidateCoordination(
          input.board_id,
          proposed,
          proposedRelations,
          pendingCandidate.proposed_impacts,
          pendingCandidate.proposed_risks,
        );
        const created = this.goals.commands.createGoal(
          input.board_id,
          { ...proposed, definition_state: "accepted" },
          {
            actor_id: input.actor_id,
            idempotency_key: `candidate-goal:${input.candidate_id}`,
            reason: `批准 Candidate Goal ${input.candidate_id}`,
          },
        );
        this.goalsModule.lifecycle.setValidityState(
          input.board_id,
          created.goal.goal_id,
          "needs_revalidation",
          now,
        );
        const rewireId = `rewire-${randomUUID()}`;
        const proposal = {
          formal_goal_id: created.goal.goal_id,
          proposal_kind: "candidate" as const,
          relations: proposedRelations,
          impacts: pendingCandidate.proposed_impacts,
          risks: pendingCandidate.proposed_risks,
        };
        const activeRuns = this.executionModule.repository.listNonterminalRuns(input.board_id);
        const impact = {
          active_runs_protected: activeRuns.map((run) => ({
            run_id: run.run_id,
            goal_id: run.goal_id,
          })),
          new_goal_requires_rewire_confirmation: true,
        };
        this.governance.records.insertRewire({
          rewire_id: rewireId,
          board_id: input.board_id,
          candidate_id: input.candidate_id,
          proposal,
          impact,
          state: "pending",
          created_at: now,
          decided_at: null,
        });
        decision = {
          ...decision,
          formal_goal_id: created.goal.goal_id,
          rewire_id: rewireId,
          next_action: "confirm_rewire",
        };
      }
      this.governance.records.transitionCandidate(
        input.board_id,
        input.candidate_id,
        input.decision,
        decision,
        now,
      );
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
      const candidate = this.readCandidate(input.board_id, input.candidate_id);
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
    return this.governance.decisions.materializeAtomically(() => {
      const replay = this.replay<{ rewire: RewireRecord; observed_event_cursor: number }>(
        input.board_id,
        input.actor_id,
        "confirm_rewire",
        input.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      const pendingRewire = this.governance.query.getRewire(input.board_id, input.rewire_id);
      if (!pendingRewire) throw new GoalBoardV1Error("rewire.not_found", "Rewire 不存在");
      if (pendingRewire.state !== "pending") {
        throw new GoalBoardV1Error("rewire.not_pending", "Rewire 已经做过决定");
      }
      const proposal = pendingRewire.proposal;
      const formalGoalId = String(proposal.formal_goal_id ?? "");
      if (formalGoalId) this.requireGoalOnBoard(input.board_id, formalGoalId);
      const now = this.clock().toISOString();
      if (decision === "rejected") {
        if (formalGoalId) {
          this.goalsModule.lifecycle.setValidityState(input.board_id, formalGoalId, "valid", now);
        }
        const previousImpact = pendingRewire.impact;
        const rejectedImpact = {
          ...previousImpact,
          proposed_changes_applied: false,
          rejection_reason: input.reason,
        };
        this.governance.records.transitionRewire(
          input.board_id,
          input.rewire_id,
          "rejected",
          { impact: rejectedImpact },
          now,
        );
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
        const rewire = this.readRewire(input.board_id, input.rewire_id);
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
        this.goalsModule.planning.validateGraph(snapshotBeforeRewire.goals, snapshotBeforeRewire.relations)
          .map((issue) => `${issue.code}:${issue.path.join("\u0000")}`),
      );
      const projectedPlanningIssue = this.goalsModule.planning.validateGraph(
        snapshotBeforeRewire.goals,
        this.goalsModule.planning.projectRelations(snapshotBeforeRewire.relations, projectedChanges),
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
        const reopened = this.goalsModule.lifecycle.reopenSatisfiedCompoundParent(
          input.board_id,
          relation.toGoalId,
          input.actor_id,
          now,
        );
        if (!reopened) {
          this.goalsModule.lifecycle.reconcileCompoundAncestors(
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
        this.goalsModule.lifecycle.setValidityState(
          input.board_id,
          goalId,
          "needs_revalidation",
          now,
        );
      }
      if (formalGoalId) {
        this.goalsModule.lifecycle.setValidityState(input.board_id, formalGoalId, "valid", now);
      }
      const previousImpact = pendingRewire.impact;
      const appliedImpact = {
        ...previousImpact,
        proposed_changes_applied: true,
        added_relation_ids: addedRelations,
        deactivated_relation_ids: deactivatedRelations,
        added_risk_ids: addedRiskIds,
        goals_needing_revalidation: [...revalidatedGoals].sort(),
      };
      this.governance.records.transitionRewire(
        input.board_id,
        input.rewire_id,
        "applied",
        { impact: appliedImpact },
        now,
      );
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
      const rewire = this.readRewire(input.board_id, input.rewire_id);
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
    const snapshot = this.store.snapshot(boardId);
    const currentGoal = snapshot.goals.find((goal) => goal.goal_id === goalId) ?? null;
    const criteria = currentGoal?.acceptance_criteria ?? [];
    const contractRevision = currentGoal?.current_contract_revision ?? 1;
    const compatibleRevisions = currentGoal
      ? compatibleContractRevisions(currentGoal, snapshot)
      : new Set([contractRevision]);
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

    this.governance.reviews.reconcileObligations({
      board_id: boardId,
      goal_id: goalId,
      contract_revision: contractRevision,
      compatible_contract_revisions: [...compatibleRevisions],
      created_at: at,
      desired: obligations.map((obligation) => ({
        role: obligation.role,
        required_count: obligation.count,
        independence_rule: obligation.independence,
        criterion_scope: obligation.criterionIds,
      })),
    });
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
    const pair = this.execution.query.getRunWithClaim(boardId, runId);
    if (!pair || pair.run.goal_id !== goalId) {
      throw new GoalBoardV1Error("draft_dialogue.run_not_found", "找不到这条 Goal 澄清 Run");
    }
    if (pair.run.actor_id !== actorId || pair.claim.actor_id !== actorId) {
      throw new GoalBoardV1Error("draft_dialogue.run_not_owner", "只有当前澄清 Runtime 可以写入本轮对话进展");
    }
    if (pair.run.role !== "clarifier") {
      throw new GoalBoardV1Error("draft_dialogue.clarifier_required", "只有 clarifier Run 可以记录 Goal 澄清");
    }
    if (pair.run.state !== "started") {
      throw new GoalBoardV1Error("draft_dialogue.run_not_active", "这条澄清 Run 已不在进行中，请先恢复 Goal 澄清对话");
    }
    if (pair.claim.state !== "active" || pair.claim.expires_at <= this.clock().toISOString()) {
      throw new GoalBoardV1Error("draft_dialogue.claim_not_active", "澄清 Claim 已释放、撤销或过期，请先恢复 Goal 澄清对话");
    }
    return { claim_id: pair.claim.claim_id };
  }

  private requireActiveGoalTreeProposalRun(
    boardId: string,
    runId: string,
    actorId: string,
    goalId: string | null = null,
  ): { goal_id: string; role: "clarifier" | "executor" | "revalidator" } {
    const recovery = {
      next_action: "draft_dialogue_resume",
      tool: "goalboard_v1_draft_dialogue_resume",
      ...(goalId == null ? {} : { goal_id: goalId }),
      retry_tool: "goalboard_v1_goal_tree_propose",
      retry_with: "returned run.run_id",
      rejected_run_id: runId,
    };
    const pair = this.execution.query.getRunWithClaim(boardId, runId);
    if (!pair) {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.run_not_found",
        "找不到提交 Goal Tree 提案所引用的澄清 Run。请先调用 goalboard_v1_draft_dialogue_resume 恢复同一 Draft 的澄清生命周期，再用返回的新 run_id 重试 goalboard_v1_goal_tree_propose。",
        recovery,
      );
    }
    if (pair.run.actor_id !== actorId || pair.claim.actor_id !== actorId) {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.run_not_owner",
        "只有当前澄清 Runtime 可以提交这份 Goal Tree 提案",
      );
    }
    const role = pair.run.role;
    if ((role !== "clarifier" && role !== "executor" && role !== "revalidator") || pair.run.state !== "started") {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.active_run_required",
        "Goal Tree 提案必须来自正在进行中的 clarifier Run，或来自同一 Goal 上只提交 Risk 生命周期结果的 executor / revalidator Run",
        recovery,
      );
    }
    if (pair.claim.state !== "active" || pair.claim.expires_at <= this.clock().toISOString()) {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.claim_not_active",
        "澄清 Claim 已释放、撤销或过期。请先调用 goalboard_v1_draft_dialogue_resume 恢复同一 Draft，再用返回的新 run_id 重试。",
        recovery,
      );
    }
    return { goal_id: pair.run.goal_id, role };
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

  private proposalObjectVersion(
    boardId: string,
    object: ProposalAffectedObject,
    item?: Pick<GoalTreeProposalItemRecord, "kind" | "operation">,
  ): ProposalObjectVersion {
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
      version: current == null
        ? "absent"
        : item
          ? `semantic-v1:${requestHash(this.proposalSemanticObject(current, object, item))}`
          : requestHash(current),
    };
  }

  private proposalObjectVersionForBaseline(
    boardId: string,
    baseline: ProposalObjectVersion,
    item: Pick<GoalTreeProposalItemRecord, "kind" | "operation">,
  ): ProposalObjectVersion {
    return this.proposalObjectVersion(
      boardId,
      baseline,
      baseline.version === "absent" || baseline.version.startsWith("semantic-v1:") ? item : undefined,
    );
  }

  private proposalSemanticObject(
    current: unknown,
    object: ProposalAffectedObject,
    item: Pick<GoalTreeProposalItemRecord, "kind" | "operation">,
  ): unknown {
    if (!current || typeof current !== "object" || Array.isArray(current)) return current;
    const record = current as Record<string, unknown>;
    if (object.object_type === "goal" && (item.kind === "goal" || item.kind === "contract")) {
      const fields = [
        "goal_id",
        "board_id",
        "title",
        "outcome",
        "why",
        "business_logic",
        "in_scope",
        "out_of_scope",
        "constraints",
        "required_inputs",
        "promised_outputs",
        "decomposition_review",
        "definition_state",
        "decomposition_state",
        "trashed_at",
        "trashed_by",
        "archived_at",
        "archived_by",
        "priority",
        "acceptance_criteria",
      ];
      return Object.fromEntries(fields.map((field) => [field, record[field]]));
    }
    if (object.object_type === "goal") {
      return {
        goal_id: record.goal_id,
        board_id: record.board_id,
        definition_state: record.definition_state,
        decomposition_state: record.decomposition_state,
        trashed_at: record.trashed_at,
        archived_at: record.archived_at,
      };
    }
    return Object.fromEntries(
      Object.entries(record).filter(([field]) => ![
        "created_at",
        "updated_at",
        "decided_at",
        "deactivated_at",
      ].includes(field)),
    );
  }

  private goalTreeProposalItemConflicts(
    boardId: string,
    item: GoalTreeProposalItemRecord,
  ): Array<Record<string, unknown>> {
    return item.baseline_versions.flatMap((baseline) => {
      const current = this.proposalObjectVersionForBaseline(boardId, baseline, item);
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
    return this.goalsModule.planning.validateGraph(
      snapshot.goals,
      this.goalsModule.planning.projectRelations(snapshot.relations, [{
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
    const decisionRecord: GoalTreeProposalDecisionRecord = {
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
    this.governance.records.insertGoalTreeDecision(decisionRecord);
    this.governance.records.transitionGoalTreeItem({
      proposal_id: input.proposal_id,
      item_id: input.item.item_id,
      state: input.item_state,
      conflict: input.conflict,
      materialized_objects: input.materialized_objects,
      revision_proposal_id: input.revision_proposal_id,
      updated_at: input.at,
    });
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
        whole_confirmation_prompted: input.authority.whole_confirmation_prompted === true,
        prompted_proposal_id: input.authority.prompted_proposal_id ?? null,
        runtime_actor_id: input.runtime_actor_id,
        materialized_objects: input.materialized_objects,
        revision_proposal_id: input.revision_proposal_id,
        conflict: input.conflict,
      },
      at: input.at,
    });
    return decisionRecord;
  }

  private refreshGoalTreeProposalState(
    boardId: string,
    proposalId: string,
    actorId: string,
    at: string,
    semanticReview: GoalTreeSemanticReview | null,
  ): void {
    const proposal = this.readNativeGoalTreeProposal(boardId, proposalId);
    const hasOpen = proposal.items.some((item) => item.state === "pending" || item.state === "conflict");
    const state = deriveGoalTreeProposalState(proposal.items);
    this.governance.records.transitionGoalTreeProposal(
      proposalId,
      state,
      {
          item_states: Object.fromEntries(proposal.items.map((item) => [item.item_id, item.state])),
          latest_decision_ids: proposal.decisions.map((decision) => decision.decision_id),
          semantic_review: semanticReview ?? proposal.decision?.semantic_review ?? null,
      },
      at,
      hasOpen ? null : at,
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
      const existing = this.governance.records.findGoalTreeItemOwner(
        revision.revised_item.item_id,
      );
      if (existing) {
        throw new GoalBoardV1Error(
          "goal_tree_proposal.revision_item_id_exists",
          "修订条目必须使用新的稳定 item_id",
        );
      }
    }
    const version = proposal.version + 1;
    const summary = `用户要求修订 v${proposal.version}：${revisions.map((item) => item.reason).join("；")}`;
    this.governance.records.insertGoalTreeProposal({
      proposal_id: proposalId,
      board_id: boardId,
      root_goal_id: proposal.root_goal_id,
      submitted_by: runtimeActorId ?? authority.actor_id,
      discovered_in_run_id: proposal.discovered_in_run_id,
      state: "pending",
      version,
      supersedes_proposal_id: proposal.proposal_id,
      base_event_cursor: this.store.eventCursor(boardId),
      summary,
      narrative: proposal.narrative,
      created_at: at,
      updated_at: at,
    });
    for (const [index, revision] of revisions.entries()) {
      const item = revision.revised_item;
      const baselineVersions = item.affected_objects.map((object) => this.proposalObjectVersion(boardId, object, item));
      this.governance.records.insertGoalTreeProposalItem({
        item_id: item.item_id,
        proposal_id: proposalId,
        board_id: boardId,
        ordinal: index + 1,
        kind: item.kind,
        operation: item.operation,
        payload: item.payload,
        source_refs: item.source_refs,
        reason: item.reason,
        explanation: item.explanation,
        confidence: item.confidence,
        affected_objects: item.affected_objects,
        baseline_versions: baselineVersions,
        requires_user_confirmation: true,
        state: "pending",
        supersedes_item_id: revision.item_id,
        created_at: at,
        updated_at: at,
      });
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

  private goalTreeGoalInput(
    item: Pick<GoalTreeProposalItemRecord, "kind" | "payload">,
  ): CreateGoalInput {
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
    this.goalsModule.commands.validateGoalInput(goal);
    return goal;
  }

  private goalTreeTargetGoalId(
    item: Pick<GoalTreeProposalItemRecord, "payload">,
    goal: CreateGoalInput,
  ): string {
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

  private isRiskLifecycleChange(boardId: string, item: GoalTreeProposalItemShape): boolean {
    if (item.kind !== "risk" || item.operation === "create") return false;
    const payload = this.goalTreePayloadRecord(item.payload, "Risk 条目");
    const riskId = String(payload.risk_id ?? "").trim();
    const current = riskId
      ? this.store.db
          .prepare("SELECT state FROM risks WHERE board_id = ? AND risk_id = ?")
          .get(boardId, riskId) as Row | undefined
      : undefined;
    const currentState = current ? asText(current.state) : null;
    if (item.operation === "deactivate") return currentState !== "expired";
    const requestedState = String(payload.state ?? "").trim();
    return requestedState.length > 0 && requestedState !== currentState;
  }

  private requireDraftRiskLifecycleContract<T extends GoalTreeProposalItemShape>(
    boardId: string,
    rootGoal: GoalRecord,
    items: T[],
  ): T | null {
    if (
      rootGoal.definition_state !== "draft" ||
      !items.some((item) => this.isRiskLifecycleChange(boardId, item))
    ) {
      return null;
    }
    const companion = items.find((item) => {
      if (!(["goal", "contract"] as GoalTreeProposalItemRecord["kind"][]).includes(item.kind)) return false;
      if (item.operation !== "update") return false;
      const payload = this.goalTreePayloadRecord(item.payload, "Goal Tree 条目 payload");
      const raw = this.goalTreePayloadRecord(payload.goal ?? payload.proposed_goal ?? payload, "Goal Contract");
      const targetGoalId = String(payload.goal_id ?? raw.goal_id ?? "").trim();
      if (targetGoalId !== rootGoal.goal_id) return false;
      const goal = this.goalTreeGoalInput(item);
      return (
        goal.definition_state === "accepted" &&
        goal.decomposition_state === "closed_leaf" &&
        goal.acceptance_criteria.length > 0
      );
    });
    if (!companion) {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.risk_goal_contract_required",
        "处理 Risk 本身就是一条正式 Goal。当前 root Goal 仍是 Draft，提案必须同时补全并接受这条 Goal 的 Contract，不能只改 Risk 后留下空 Draft",
      );
    }
    return companion;
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
      this.goalsModule.planning.validateGraph(snapshot.goals, snapshot.relations)
        .map((issue) => `${issue.code}:${issue.path.join("\u0000")}`),
    );
    return this.goalsModule.planning.validateProposalGraph(snapshot.goals, snapshot.relations, items)
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

  /** Validate the special accepted-parent closure path and reject callers that
   * try to bypass the native same-Goal Contract revision operation. */
  private acceptedCompoundClosureConflict(
    boardId: string,
    item: GoalTreeProposalItemRecord,
    existing: GoalRecord,
    goal: CreateGoalInput,
    goalId: string,
  ): Record<string, unknown> | null {
    const objects = [{ object_type: "goal", object_id: goalId }];
    const sameGoalRevision = {
      objects,
      current_goal: {
        goal_id: existing.goal_id,
        title: existing.title,
        definition_state: existing.definition_state,
        decomposition_state: existing.decomposition_state,
        fulfillment_state: existing.fulfillment_state,
      },
      next_action: "revise_same_goal_contract",
      required_item: { kind: "contract", operation: "update", goal_id: goalId },
      recovery: "把修改改为同一 Goal ID 的 native contract-update 条目；Relation、Impact 和 Risk 变化必须作为独立 Proposal 条目列出。当前 Goal Tree 尚未改变。",
    };
    if (item.operation !== "update" || goal.definition_state !== "accepted") {
      return {
        code: "goal.accepted_compound_closure_invalid",
        message: "已接受 Goal 的受支持收口只能保留 accepted 状态并更新已有 Goal",
        ...sameGoalRevision,
      };
    }
    if (existing.decomposition_state === "closed_leaf") {
      return {
        code: "goal.accepted_contract_update_required",
        message: "已接受叶子 Goal 的需求变化必须使用同一 Goal 的 contract-update revision",
        ...sameGoalRevision,
      };
    }
    if (existing.decomposition_state === "closed_compound") {
      return {
        code: "goal.accepted_contract_update_required",
        message: "已接受复合 Goal 的需求变化必须使用同一 Goal 的 contract-update revision",
        ...sameGoalRevision,
      };
    }
    if (
      !["abstract", "frontier_open"].includes(existing.decomposition_state) ||
      goal.decomposition_state !== "closed_compound"
    ) {
      return {
        code: "goal.accepted_compound_closure_invalid",
        message: "已接受且尚未收口的复合 Goal 只能从 abstract 或 frontier_open 收口为 closed_compound",
        ...sameGoalRevision,
      };
    }
    if (!this.acceptedGoalBusinessContractMatches(existing, goal)) {
      return {
        code: "goal.accepted_contract_immutable",
        message: "已接受的 Goal 收口时不能修改业务 Contract 或验收条件",
        ...sameGoalRevision,
      };
    }
    if (this.activePartOfChildren(boardId, goalId).length === 0) {
      return {
        code: "goal.accepted_compound_closure_children_required",
        message: "已接受父 Goal 收口前至少需要一个生效的 part_of 子 Goal",
        objects,
        next_action: "add_part_of_child",
        recovery: "先在同一提案中创建或关联至少一个生效的 part_of 子 Goal，再重新运行 goal_tree_check；不要创建无子节点的 closed_compound。",
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

  private isAcceptedCompoundClosure(
    existing: GoalRecord,
    goal: CreateGoalInput,
  ): boolean {
    return ["abstract", "frontier_open"].includes(existing.decomposition_state)
      && goal.decomposition_state === "closed_compound"
      && this.acceptedGoalBusinessContractMatches(existing, goal);
  }

  private acceptedContractRevisionStructureConflict(
    boardId: string,
    existing: GoalRecord,
    goal: CreateGoalInput,
  ): Record<string, unknown> | null {
    const nextDecomposition = goal.decomposition_state ?? existing.decomposition_state;
    const children = this.activePartOfChildren(boardId, existing.goal_id);
    if (nextDecomposition === "closed_leaf" && children.length > 0) {
      return {
        code: "contract.revision_structure_conflict",
        message: "这个 Goal 仍有生效的子 Goal，不能把新版本改成叶子 Goal",
        objects: [
          { object_type: "goal", object_id: existing.goal_id },
          ...children.map((child) => ({ object_type: "goal", object_id: asText(child.goal_id) })),
        ],
        next_action: "revise_contract_or_update_relations",
        recovery: "保留 compound 结构，或在同一份 Proposal 中显式调整 part_of 关系后再确认；系统不会从 Contract 文本偷偷删除关系。",
      };
    }
    if (nextDecomposition === "closed_compound" && children.length === 0) {
      return {
        code: "goal.accepted_compound_closure_children_required",
        message: "复合 Goal 收口前至少需要一个生效的 part_of 子 Goal",
        objects: [{ object_type: "goal", object_id: existing.goal_id }],
        next_action: "add_part_of_child",
        recovery: "先在同一份 Proposal 中创建或关联至少一个子 Goal，再确认 Contract revision。",
      };
    }
    return null;
  }

  private activePartOfChildren(boardId: string, parentGoalId: string): Row[] {
    return this.store.db
      .prepare(`
        SELECT g.goal_id, g.fulfillment_state, g.validity_state, g.trashed_at, g.archived_at
        FROM goal_relations r
        JOIN goals g ON g.goal_id = r.from_goal_id
        WHERE r.board_id = ? AND r.to_goal_id = ?
          AND g.board_id = ?
          AND r.type = 'part_of' AND r.state = 'active'
        ORDER BY g.goal_id
      `)
      .all(boardId, parentGoalId, boardId) as Row[];
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
    const proposal = this.governance.query.getGoalTreeProposal(boardId, proposalId);
    return (proposal?.items ?? []).some((item) => {
      if (item.state !== "applied" || item.kind !== "goal" || item.operation !== "create") return false;
      return item.affected_objects.some(
        (object) => object.object_type === "candidate" && object.object_id === candidateId,
      ) && item.baseline_versions.some(
        (baseline) =>
          baseline.object_type === "candidate" &&
          baseline.object_id === candidateId &&
          baseline.exists,
      ) && item.materialized_objects.some(
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
      const payload = this.goalTreePayloadRecord(item.payload, "Goal Tree 条目 payload");
      const criteriaPath = payload.goal && typeof payload.goal === "object" && !Array.isArray(payload.goal)
        ? "payload.goal.acceptance_criteria"
        : payload.proposed_goal && typeof payload.proposed_goal === "object" && !Array.isArray(payload.proposed_goal)
          ? "payload.proposed_goal.acceptance_criteria"
          : "payload.acceptance_criteria";
      const seenCriterionIds = new Map<string, number>();
      for (const [criterionIndex, criterion] of goal.acceptance_criteria.entries()) {
        const criterionId = criterion.criterion_id?.trim() ?? "";
        if (!criterionId) continue;
        const firstIndex = seenCriterionIds.get(criterionId);
        const owner = this.store.db
          .prepare("SELECT goal_id FROM acceptance_criteria WHERE criterion_id = ?")
          .get(criterionId) as Row | undefined;
        const conflictingGoalId = owner == null ? "" : asText(owner.goal_id);
        if (firstIndex == null && (!conflictingGoalId || conflictingGoalId === targetGoalId)) {
          seenCriterionIds.set(criterionId, criterionIndex);
          continue;
        }
        return {
          code: "goal_tree_proposal.acceptance_criterion_id_conflict",
          message: firstIndex == null
            ? `验收条件 ID ${criterionId} 已属于 Goal ${conflictingGoalId}`
            : `同一个 Goal Contract 重复使用验收条件 ID ${criterionId}`,
          objects: [
            { object_type: "goal", object_id: targetGoalId },
            ...(conflictingGoalId && conflictingGoalId !== targetGoalId
              ? [{ object_type: "goal", object_id: conflictingGoalId }]
              : []),
          ],
          field: `${criteriaPath}[${criterionIndex}].criterion_id`,
          received_value: criterionId,
          ...(firstIndex == null ? {} : { conflicting_index: firstIndex }),
          ...(conflictingGoalId ? { conflicting_goal_id: conflictingGoalId } : {}),
          next_action: "use_unique_criterion_id",
          recovery: "为这个验收条件使用新的全局唯一 criterion_id，并同步 leaf_readiness.acceptance_criterion_ids 后重新运行 goal_tree_check；不要复用其他 Goal 的验收条件 ID。",
        };
      }
      if (item.operation !== "create" && existing?.definition_state === "accepted") {
        if (item.kind === "contract" && item.operation === "update") {
          if (this.isAcceptedCompoundClosure(existing, goal)) {
            return this.acceptedCompoundClosureConflict(boardId, item, existing, goal, targetGoalId);
          }
          return this.acceptedContractRevisionStructureConflict(boardId, existing, goal);
        }
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
        ? this.governance.query.getCandidate(boardId, candidateId)
        : null;
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
      if (candidateRow.state !== "pending") {
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
      const originalGoal = candidateRow.proposed_goal;
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
        ? this.governance.query.getRewire(boardId, rewireId)
        : null;
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

  private preflightGoalTreeProposalMaterialization(
    boardId: string,
    items: GoalTreeProposalItemRecord[],
    actorId: string,
    at: string,
  ): Map<string, Record<string, unknown>> {
    const conflicts = new Map<string, Record<string, unknown>>();
    const materializationOrder: GoalTreeProposalItemRecord["kind"][][] = [
      ["goal", "contract", "candidate"],
      ["policy", "risk"],
      ["relation", "dependency", "rewire"],
    ];
    this.store.db.exec("SAVEPOINT goal_tree_materialization_preflight");
    try {
      for (const kinds of materializationOrder) {
        for (const item of items.filter((candidate) => kinds.includes(candidate.kind))) {
          this.store.db.exec("SAVEPOINT goal_tree_item_preflight");
          try {
            const conflict = this.goalTreeProposalMaterializationConflict(boardId, item);
            if (conflict) {
              conflicts.set(item.item_id, {
                ...conflict,
                recovery: conflict.recovery ?? this.goalTreeProposalConflictRecovery(conflict),
              });
              this.store.db.exec("ROLLBACK TO goal_tree_item_preflight");
              this.store.db.exec("RELEASE goal_tree_item_preflight");
              continue;
            }
            this.materializeGoalTreeProposalItem(boardId, item, actorId, "Goal Tree 提案只读预检", at);
            this.store.db.exec("RELEASE goal_tree_item_preflight");
          } catch (error) {
            this.store.db.exec("ROLLBACK TO goal_tree_item_preflight");
            this.store.db.exec("RELEASE goal_tree_item_preflight");
            if (!(error instanceof GoalBoardV1Error)) throw error;
            conflicts.set(item.item_id, {
              code: error.code,
              message: error.message,
              ...(error.details ?? {}),
              recovery: this.goalTreeProposalConflictRecovery({ code: error.code }),
            });
          }
        }
      }
    } finally {
      this.store.db.exec("ROLLBACK TO goal_tree_materialization_preflight");
      this.store.db.exec("RELEASE goal_tree_materialization_preflight");
    }
    return conflicts;
  }

  private goalTreeProposalConflictRecovery(conflict: Record<string, unknown>): string {
    return String(conflict.code ?? "").startsWith("goal.accepted_")
      ? "已接受 Goal 的需求变化必须使用同一 Goal ID 的 native contract-update revision；关系、Impact 和 Risk 变化另列显式条目。当前 Goal Tree 尚未改变。"
      : "请先运行 goal_tree_check 并修订这个条目，再让用户决定整份提案。当前 Goal Tree 尚未改变。";
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
            required_inputs_json, promised_outputs_json, decomposition_review_json,
            definition_state, decomposition_state, validity_state, fulfillment_state,
            priority, accepted_by, accepted_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'valid', 'unmet', ?, ?, ?, ?, ?)
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
          goal.decomposition_review == null ? null : sqliteJson(goal.decomposition_review),
          definitionState,
          decompositionState,
          goal.priority ?? 0,
          definitionState === "accepted" ? actorId : null,
          definitionState === "accepted" ? at : null,
          at,
          at,
        );
      this.replaceGoalTreeAcceptanceCriteria(goalId, goal, at);
      const createdGoal = this.store.getGoal(goalId);
      if (!createdGoal) throw new GoalBoardV1Error("goal.not_found", `找不到这个 Goal: ${goalId}`);
      this.store.db.prepare(`
        INSERT INTO goal_contract_revisions (
          goal_id, board_id, revision, contract_json, effect, source_proposal_id,
          changed_by, reason, created_at
        ) VALUES (?, ?, 1, ?, 'metadata', ?, ?, ?, ?)
      `).run(
        goalId,
        boardId,
        sqliteJson(contractInputFromGoal(createdGoal)),
        item.proposal_id,
        actorId,
        reasonText,
        at,
      );
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
      if (item.kind === "contract" && item.operation === "update") {
        if (this.isAcceptedCompoundClosure(existing, goal)) {
          const conflict = this.acceptedCompoundClosureConflict(boardId, item, existing, goal, goalId);
          if (conflict) {
            throw new GoalBoardV1Error(String(conflict.code), String(conflict.message), conflict);
          }
          this.goalsModule.lifecycle.closeAcceptedCompound({
            board_id: boardId,
            goal_id: goalId,
            decomposition_review: goal.decomposition_review,
            actor_id: actorId,
            reason: reasonText,
            source_item_id: item.item_id,
            at,
          });
          return { object_type: "goal", object_id: goalId };
        }
        const structuralConflict = this.acceptedContractRevisionStructureConflict(boardId, existing, goal);
        if (structuralConflict) {
          throw new GoalBoardV1Error(
            String(structuralConflict.code),
            String(structuralConflict.message),
            structuralConflict,
          );
        }
        return this.materializeAcceptedGoalContractRevision(
          boardId,
          item,
          existing,
          goal,
          actorId,
          reasonText,
          at,
        );
      }
      const conflict = this.acceptedCompoundClosureConflict(boardId, item, existing, goal, goalId);
      if (conflict) {
        throw new GoalBoardV1Error(String(conflict.code), String(conflict.message));
      }
      this.goalsModule.lifecycle.closeAcceptedCompound({
        board_id: boardId,
        goal_id: goalId,
        decomposition_review: goal.decomposition_review,
        actor_id: actorId,
        reason: reasonText,
        source_item_id: item.item_id,
        at,
      });
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
    this.goalsModule.commands.validateGoalInput(normalized);
    if (definitionState === "accepted") {
      this.goalsModule.lifecycle.acceptDraft({
        board_id: boardId,
        goal_id: goalId,
        proposed_goal: normalized,
        actor_id: actorId,
        accepted_at: at,
      });
    } else {
      this.store.db
        .prepare(`
          UPDATE goals SET
            title = ?, outcome = ?, why = ?, business_logic = ?,
            in_scope_json = ?, out_of_scope_json = ?, constraints_json = ?,
            required_inputs_json = ?, promised_outputs_json = ?,
            decomposition_review_json = ?,
            definition_state = ?, decomposition_state = ?, priority = ?,
            accepted_by = NULL, accepted_at = NULL, updated_at = ?
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
          normalized.decomposition_review == null ? null : sqliteJson(normalized.decomposition_review),
          definitionState,
          decompositionState,
          normalized.priority ?? existing.priority,
          at,
          boardId,
          goalId,
        );
      this.replaceGoalTreeAcceptanceCriteria(goalId, normalized, at);
    }
    this.governance.records.supersedePendingContractProposals(
      boardId,
      goalId,
      at,
      { reason: "用户通过统一 Goal Tree 决定确认了更新后的 Contract", decided_by: actorId },
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

  private transitionGoalRevisionDependents(input: GoalRevisionDependentTransition): void {
    const activeClaims = this.executionModule.repository
      .listClaimsForGoal(input.board_id, input.goal_id)
      .filter((claim) => claim.state === "active")
      .sort((left, right) => left.claimed_at.localeCompare(right.claimed_at) || left.claim_id.localeCompare(right.claim_id));
    if (input.effect !== "metadata") {
      for (const claim of activeClaims) {
        const activeRunIds = this.executionModule.repository.activeRunIdsForClaim(claim.claim_id);
        for (const runId of activeRunIds) {
          const run = this.executionModule.repository.getRunById(runId);
          if (!run) continue;
          this.executionModule.repository.updateRun(
            runId,
            "abandoned",
            "abandoned_by_contract_revision",
            run.output_refs,
            run.discovery_refs,
            input.at,
          );
          this.store.appendEvent({
            eventId: randomUUID(),
            boardId: input.board_id,
            actorId: input.actor_id,
            type: "run.abandoned",
            objectType: "run",
            objectId: runId,
            reason: "Contract revision 已确认，旧版本 Run 安全结束",
            payload: {
              goal_id: input.goal_id,
              previous_contract_revision: input.previous_contract_revision,
              contract_revision: input.contract_revision,
            },
            at: input.at,
          });
        }
        this.executionModule.repository.updateClaimState(
          claim.claim_id,
          "revoked",
          input.at,
          "abandoned_by_contract_revision",
        );
        this.store.appendEvent({
          eventId: randomUUID(),
          boardId: input.board_id,
          actorId: input.actor_id,
          type: "claim.revoked_by_contract_revision",
          objectType: "claim",
          objectId: claim.claim_id,
          reason: "Contract revision 已确认，旧版本 Claim 被撤销",
          payload: {
            goal_id: input.goal_id,
            previous_contract_revision: input.previous_contract_revision,
            contract_revision: input.contract_revision,
          },
          at: input.at,
        });
      }
      this.governance.reviews.waivePendingObligationsForRevision(
        input.goal_id,
        input.previous_contract_revision,
      );
      return;
    }
    for (const claim of activeClaims) {
      this.executionModule.repository.updateClaimContractRevision(claim.claim_id, input.contract_revision);
    }
  }

  private materializeAcceptedGoalContractRevision(
    boardId: string,
    item: GoalTreeProposalItemRecord,
    existing: GoalRecord,
    proposed: CreateGoalInput,
    actorId: string,
    reasonText: string,
    at: string,
  ): ProposalAffectedObject {
    const applied = this.goalsModule.lifecycle.applyAcceptedContractRevision({
      board_id: boardId,
      goal_id: existing.goal_id,
      proposed_goal: proposed,
      source_proposal_id: item.proposal_id,
      source_item_id: item.item_id,
      actor_id: actorId,
      reason: reasonText,
      applied_at: at,
    });
    return { object_type: "goal", object_id: applied.goal.goal_id };
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
      const reopened = this.goalsModule.lifecycle.reopenSatisfiedCompoundParent(boardId, relation.to_goal_id, actorId, at);
      if (!reopened) {
        this.goalsModule.lifecycle.reconcileCompoundAncestors(boardId, relation.from_goal_id, actorId, at);
      }
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
    const facts = this.goalsModule.commands.normalizeRiskFacts(boardId, {
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
    const rawResolutionBasis = payload.resolution_basis && typeof payload.resolution_basis === "object" && !Array.isArray(payload.resolution_basis)
      ? payload.resolution_basis as Record<string, unknown>
      : null;
    const previousResolutionBasis = previous
      ? parseJson<RiskRecord["resolution_basis"]>(previous.resolution_basis_json, null)
      : null;
    const resolutionBasis = state !== "resolved"
      ? null
      : rawResolutionBasis
        ? {
            summary: String(rawResolutionBasis.summary ?? "").trim(),
            evidence_refs: this.goalTreeStringArray(rawResolutionBasis.evidence_refs),
            residual_gaps: this.goalTreeStringArray(rawResolutionBasis.residual_gaps),
          }
        : requestedState
          ? null
          : previousResolutionBasis;
    if (requestedState === "resolved" && (
      !resolutionBasis?.summary ||
      resolutionBasis.evidence_refs.length === 0 ||
      !Array.isArray(rawResolutionBasis?.residual_gaps)
    )) {
      throw new GoalBoardV1Error(
        "goal_tree_proposal.risk_resolution_basis_required",
        "Risk 标记为已解决时，必须记录解决摘要、至少一条证据引用和 residual_gaps",
      );
    }
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
            revisit_condition, owner, state, resolution_basis_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          resolutionBasis == null ? null : sqliteJson(resolutionBasis),
          at,
          at,
        );
    } else {
      const result = this.store.db
        .prepare(`
          UPDATE risks SET description = ?, probability = ?, impact = ?, affected_surfaces_json = ?,
            trigger = ?, treatment = ?, treatment_plan = ?, blocking_mode = ?, revisit_condition = ?, owner = ?, state = ?, resolution_basis_json = ?, updated_at = ?
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
          resolutionBasis == null ? null : sqliteJson(resolutionBasis),
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
          this.goalsModule.lifecycle.setValidityState(boardId, goalId, "needs_revalidation", at);
        }
      }
      if (isInvalidating) {
        for (const goalId of facts.goal_ids) {
          this.goalsModule.lifecycle.setValidityState(boardId, goalId, "invalidated", at);
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
        resolution_basis: resolutionBasis,
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
      const existingCandidate = this.readCandidate(boardId, candidateId);
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
      const updated = this.governance.records.transitionCandidate(
        boardId,
        candidateId,
        "approved",
        decision,
        at,
      );
      if (!updated) {
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
    const existingCandidate = this.governance.query.getCandidate(boardId, candidateId);
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
    this.governance.records.insertCandidate({
      candidate_id: candidateId,
      board_id: boardId,
      submitted_by: actorId,
      discovered_in_run_id: null,
      proposed_goal: proposedGoal,
      proposed_relations: proposedRelations,
      proposed_impacts: proposedImpacts,
      proposed_risks: proposedRisks,
      blocking_mode: blockingMode as CandidateGoalRecord["blocking_mode"],
      state: "approved",
      decision: { decided_by: actorId, reason: reasonText, formal_goal_id: goalObject.object_id },
      created_at: at,
      decided_at: at,
    });
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
      const current = this.governance.query.getRewire(boardId, rewireId);
      const changed = current?.state === "pending" && this.governance.records.transitionRewire(
        boardId,
        rewireId,
        "rejected",
        {},
        at,
      );
      if (!changed) {
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
    const exists = this.governance.query.getRewire(boardId, rewireId);
    if (exists && item.operation === "create") {
      throw new GoalBoardV1Error("goal_tree_proposal.rewire_exists", "要创建的 Rewire 已存在");
    }
    const proposal = {
      ...nested,
      relations: this.goalTreeRelationEntries(item),
    };
    if (item.operation === "create") {
      this.governance.records.insertRewire({
        rewire_id: rewireId,
        board_id: boardId,
        candidate_id: null,
        proposal,
        impact: { proposed_changes_applied: true, decided_by: actorId },
        state: "applied",
        created_at: at,
        decided_at: at,
      });
    } else {
      const changed = this.governance.records.transitionRewire(
        boardId,
        rewireId,
        "applied",
        { proposal },
        at,
      );
      if (!changed) throw new GoalBoardV1Error("goal_tree_proposal.rewire_not_found", "要更新的 Rewire 不存在");
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

  private goalTreeRelationChanges(
    boardId: string,
    item: GoalTreeProposalItemRecord,
  ): Array<{
    action: "add" | "deactivate";
    from_goal_id: string;
    to_goal_id: string;
    type: GoalRelationRecord["type"];
    key: string;
  }> {
    const payload = this.goalTreePayloadRecord(item.payload, "关系条目 payload");
    const nested = payload.rewire && typeof payload.rewire === "object" && !Array.isArray(payload.rewire)
      ? payload.rewire as Record<string, unknown>
      : payload.proposal && typeof payload.proposal === "object" && !Array.isArray(payload.proposal)
        ? payload.proposal as Record<string, unknown>
        : payload;
    const formalGoalId = String(nested.formal_goal_id ?? payload.formal_goal_id ?? "").trim();
    return this.goalTreeRelationEntries(item).map((raw) => {
      const normalized = this.normalizeGoalTreeRelation(item, raw);
      const stored = normalized.relation_id
        ? this.store.db
            .prepare(`
              SELECT from_goal_id, to_goal_id, type
              FROM goal_relations
              WHERE board_id = ? AND relation_id = ?
            `)
            .get(boardId, normalized.relation_id) as Row | undefined
        : undefined;
      const replaceFormalGoal = (value: string) => value.replace("$new_goal", formalGoalId);
      const fromGoalId = replaceFormalGoal(normalized.from_goal_id || asText(stored?.from_goal_id));
      const toGoalId = replaceFormalGoal(normalized.to_goal_id || asText(stored?.to_goal_id));
      const type = (normalized.type ?? (stored ? asText(stored.type) : "")) as GoalRelationRecord["type"];
      if (!fromGoalId || !toGoalId || !GOAL_RELATION_TYPES.has(type)) {
        throw new GoalBoardV1Error(
          "goal_tree_proposal.relation_required",
          "关系变更缺少可用于兼容核对的起点、终点或类型",
        );
      }
      return {
        action: normalized.action,
        from_goal_id: fromGoalId,
        to_goal_id: toGoalId,
        type,
        key: JSON.stringify([normalized.action, fromGoalId, toGoalId, type]),
      };
    });
  }

  /**
   * A native proposal can safely retire one legacy Rewire only when both describe
   * the exact same pure relation change set and the canonical graph already
   * reflects every requested relation state. Historical proposal text is kept.
   */
  private reconcileEquivalentLegacyRewires(
    boardId: string,
    nativeProposalId: string,
    appliedRelationItems: GoalTreeProposalItemRecord[],
    actorId: string,
    at: string,
  ): void {
    if (appliedRelationItems.length === 0) return;
    const nativeChanges = appliedRelationItems.flatMap((item) => this.goalTreeRelationChanges(boardId, item));
    const nativeKeys = nativeChanges.map((change) => change.key).sort();
    if (nativeKeys.length === 0) return;
    const snapshot = this.store.snapshot(boardId);
    const legacyViews = new Map(
      this.legacyGoalTreeProposalView(snapshot)
        .filter((proposal) => proposal.origin === "legacy_rewire")
        .map((proposal) => [proposal.proposal_id, proposal]),
    );
    for (const rewire of snapshot.rewires) {
      if (rewire.state !== "pending") continue;
      if ((rewire.proposal.impacts?.length ?? 0) > 0 || (rewire.proposal.risks?.length ?? 0) > 0) continue;
      const legacyView = legacyViews.get(`legacy-rewire:${rewire.rewire_id}`);
      const legacyItem = legacyView?.items[0];
      if (!legacyItem) continue;
      const legacyChanges = this.goalTreeRelationChanges(boardId, legacyItem);
      const legacyKeys = legacyChanges.map((change) => change.key).sort();
      if (legacyKeys.length !== nativeKeys.length || legacyKeys.some((key, index) => key !== nativeKeys[index])) {
        continue;
      }
      const canonicalStateMatches = legacyChanges.every((change) => {
        const active = this.store.db
          .prepare(`
            SELECT relation_id FROM goal_relations
            WHERE board_id = ? AND from_goal_id = ? AND to_goal_id = ?
              AND type = ? AND state = 'active'
            LIMIT 1
          `)
          .get(boardId, change.from_goal_id, change.to_goal_id, change.type) as Row | undefined;
        return change.action === "add" ? active != null : active == null;
      });
      if (!canonicalStateMatches) continue;
      const impact = {
        ...rewire.impact,
        proposed_changes_applied: true,
        superseded_by_goal_tree_proposal_id: nativeProposalId,
        supersession_reason: "同一关系变更已由用户确认的 native Goal Tree Proposal 落地",
      };
      const updated = this.governance.records.transitionRewire(
        boardId,
        rewire.rewire_id,
        "applied",
        { impact },
        at,
      );
      if (!updated) continue;
      this.store.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId,
        type: "rewire.superseded_by_goal_tree_proposal",
        objectType: "rewire",
        objectId: rewire.rewire_id,
        reason: "等价关系变更已通过 native Goal Tree Proposal 落地，关闭重复待确认入口",
        payload: {
          goal_tree_proposal_id: nativeProposalId,
          relation_changes: legacyChanges.map(({ key: _key, ...change }) => change),
        },
        at,
      });
    }
  }

  private legacyGoalTreeProposalView(
    snapshot: ReturnType<SqliteGoalBoardStore["snapshot"]>,
  ): GoalTreeProposalRecord[] {
    const stateFromLegacy = (state: string): GoalTreeProposalRecord["state"] => {
      if (state === "pending" || state === "superseded" || state === "approved" || state === "rejected" || state === "dismissed") {
        return state;
      }
      if (state === "confirmed") return "approved";
      if (state === "applied") return "approved";
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
        narrative: null,
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
            explanation: null,
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
      narrative: null,
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
          explanation: null,
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
      narrative: null,
      decision: {
        legacy_state: rewire.state,
        impact: rewire.impact,
        superseded_by_goal_tree_proposal_id:
          typeof rewire.impact.superseded_by_goal_tree_proposal_id === "string"
            ? rewire.impact.superseded_by_goal_tree_proposal_id
            : null,
      },
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
          explanation: null,
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
    const run = this.executionModule.repository.getRunById(runId);
    if (!run) throw new Error(`Run 写入后无法读取: ${runId}`);
    return run;
  }

  private readReview(boardId: string, reviewId: string): ReviewRecord {
    const review = this.governance.query.listReviews(boardId)
      .find((item) => item.review_id === reviewId);
    if (!review) throw new Error(`Review 写入后无法读取: ${reviewId}`);
    return review;
  }

  private readCandidate(boardId: string, candidateId: string): CandidateGoalRecord {
    const candidate = this.governance.query.getCandidate(boardId, candidateId);
    if (!candidate) throw new Error(`Candidate 写入后无法读取: ${candidateId}`);
    return candidate;
  }

  private readContractProposal(boardId: string, proposalId: string): ContractProposalRecord {
    const proposal = this.governance.query.getContractProposal(boardId, proposalId);
    if (!proposal) throw new Error(`Contract Proposal 写入后无法读取: ${proposalId}`);
    return proposal;
  }

  private readRewire(boardId: string, rewireId: string): RewireRecord {
    const rewire = this.governance.query.getRewire(boardId, rewireId);
    if (!rewire) throw new Error(`Rewire 写入后无法读取: ${rewireId}`);
    return rewire;
  }

  private readImpact(boardId: string, bindingId: string): ImpactBindingRecord {
    const impact = this.store.snapshot(boardId).impacts.find((item) => item.binding_id === bindingId);
    if (!impact) throw new Error(`Impact 写入后无法读取: ${bindingId}`);
    return impact;
  }

  private activeGoalReplacement(
    boardId: string,
    goalId: string,
    snapshot?: ReturnType<SqliteGoalBoardStore["snapshot"]>,
  ): { relation_id: string; replacement_goal_id: string; replacement_goal_title: string } | null {
    if (snapshot) {
      const relation = snapshot.relations
        .filter(
          (item) =>
            item.board_id === boardId &&
            item.to_goal_id === goalId &&
            item.type === "replaces" &&
            item.state === "active",
        )
        .sort(
          (left, right) =>
            right.created_at.localeCompare(left.created_at) ||
            right.relation_id.localeCompare(left.relation_id),
        )[0];
      if (!relation) return null;
      const replacement = snapshot.goals.find((item) => item.goal_id === relation.from_goal_id);
      if (!replacement) return null;
      return {
        relation_id: relation.relation_id,
        replacement_goal_id: replacement.goal_id,
        replacement_goal_title: replacement.title,
      };
    }
    const row = this.store.db
      .prepare(`
        SELECT
          relation.relation_id,
          replacement.goal_id AS replacement_goal_id,
          replacement.title AS replacement_goal_title
        FROM goal_relations relation
        JOIN goals replacement
          ON replacement.board_id = relation.board_id
         AND replacement.goal_id = relation.from_goal_id
        WHERE relation.board_id = ?
          AND relation.to_goal_id = ?
          AND relation.type = 'replaces'
          AND relation.state = 'active'
        ORDER BY relation.created_at DESC, relation.relation_id DESC
        LIMIT 1
      `)
      .get(boardId, goalId) as Row | undefined;
    return row
      ? {
          relation_id: asText(row.relation_id),
          replacement_goal_id: asText(row.replacement_goal_id),
          replacement_goal_title: asText(row.replacement_goal_title),
        }
      : null;
  }

  private goalReplacedReason(
    goalId: string,
    replacement: { relation_id: string; replacement_goal_id: string; replacement_goal_title: string },
  ): DecisionReason {
    return reason(
      "goal.replaced",
      "goal",
      goalId,
      `这条 Goal 已被「${replacement.replacement_goal_title}」替代，不再接受新的 Runtime 工作`,
      replacement,
      "请推进替代 Goal；如果替代关系有误，由用户停用对应的 replaces 关系后再查询 Ready。",
    );
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
    const compatibleRevisions = compatibleContractRevisions(goal, snapshot);
    const pendingReviewObligations = snapshot.review_obligations.filter(
      (obligation) =>
        obligation.goal_id === goal.goal_id &&
        compatibleRevisions.has(obligation.contract_revision) &&
        obligation.state === "pending",
    );
    const pendingReviewRoles = pendingReviewObligations.map((obligation) => obligation.role);
    const reviewReady = this.latestWorkRunState(snapshot, goal) === "completed";
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
    const replacement = this.activeGoalReplacement(boardId, goal.goal_id, snapshot);
    if (replacement) {
      return {
        ...base,
        work_state: "replaced",
        next_action: null,
        reasons: [this.goalReplacedReason(goal.goal_id, replacement)],
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
    if (
      goal.decomposition_state === "closed_compound" &&
      recordedContractCoverageBlocksClosure(goal, {
        goals: snapshot.goals,
        relations: snapshot.relations,
      })
    ) {
      return {
        ...base,
        work_state: "clarification_blocked",
        next_action: "clarify",
        reasons: [
          reason(
            "goal.contract_coverage_incomplete",
            "goal",
            goal.goal_id,
            "父 Goal 记录的承诺结果或完成条件尚未被子 Contract 完整覆盖",
            undefined,
            "继续澄清父子 Contract 映射；部分覆盖、尚未覆盖或仍需父级集成时不能关闭父 Goal",
          ),
        ],
      };
    }
    if (
      goal.decomposition_state !== "closed_compound" &&
      goal.validity_state === "valid" &&
      goal.fulfillment_state === "satisfied"
    ) {
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

    if (goal.validity_state === "needs_revalidation") {
      if (activeRun) return this.workStateFromRun(base, activeRun);
      const reasons = this.workStatePhaseReasons(boardId, goal.goal_id, "revalidator", now, snapshot);
      return {
        ...base,
        work_state: reasons.length > 0 ? "revalidation_blocked" : "revalidation_pending",
        next_action: "revalidate",
        reasons: phaseReasons(reasons),
      };
    }

    if (goal.decomposition_state === "closed_compound") {
      if (childGoalIds.length > 0) {
        const childGoalById = new Map(snapshot.goals.map((child) => [child.goal_id, child]));
        const untrustedChildren = childGoalIds
          .map((childGoalId) => childGoalById.get(childGoalId)!)
          .filter(
            (child) =>
              child.fulfillment_state !== "satisfied" ||
              child.validity_state !== "valid" ||
              child.trashed_at != null ||
              child.archived_at != null,
          );
        if (
          goal.fulfillment_state === "satisfied" &&
          goal.validity_state === "valid" &&
          untrustedChildren.length === 0
        ) {
          return { ...base, work_state: "satisfied", next_action: null, reasons: [] };
        }
        return {
          ...base,
          work_state: "waiting_children",
          next_action: null,
          reasons: untrustedChildren.map((child) =>
            reason(
              "goal.compound_child_not_trusted",
              "goal",
              child.goal_id,
              `子 Goal「${child.title}」当前还不是可信完成`,
              {
                fulfillment_state: child.fulfillment_state,
                validity_state: child.validity_state,
                trashed: child.trashed_at != null,
                archived: child.archived_at != null,
              },
              "先恢复该子 Goal 的可信完成状态",
            ),
          ),
        };
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

    if (activeRun) return this.workStateFromRun(base, activeRun);

    if (goal.fulfillment_state === "satisfied") {
      return { ...base, work_state: "satisfied", next_action: null, reasons: [] };
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
      .filter((criterion) => !this.criterionHasPassingEvidence(goal, criterion.criterion_id))
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
      const singlePendingHumanObligation = pendingHumanReviewObligations.length === 1
        ? pendingHumanReviewObligations[0]
        : null;
      const singleHumanObligation = singlePendingHumanObligation &&
          unique(singlePendingHumanObligation.criterion_scope).sort().length === criterionIds.length &&
          unique(singlePendingHumanObligation.criterion_scope).sort().every(
            (criterionId, index) => criterionId === criterionIds[index],
          )
        ? singlePendingHumanObligation
        : null;
      const conversationApprovalHandoff = singleHumanObligation
        ? {
            requires_single_pending_obligation: true,
            evidence_tool: "goalboard_v1_evidence_submit",
            evidence_kind: "human_verdict",
            evidence_result: "passed",
            criterion_ids: singleHumanObligation.criterion_scope,
            obligation_id: singleHumanObligation.obligation_id,
            locator_scheme: "conversation://",
            digest_source: "exact_user_quote",
            final_action: "open_goalboard_inbox_for_single_user_submit",
            runtime_can_submit_human_review: false,
          }
        : null;
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
              next_action: conversationApprovalHandoff
                ? "record_explicit_user_approval_or_open_goalboard"
                : "open_goalboard",
              ...(conversationApprovalHandoff
                ? { conversation_approval_handoff: conversationApprovalHandoff }
                : {}),
            },
            conversationApprovalHandoff
              ? "若用户在当前对话明确批准这一项唯一待决验收，Runtime 只把用户原话登记为 human_verdict Evidence 并打开已预填 Inbox；最终 Human Review 仍由用户提交。含糊回复、多个待决项或不通过结论继续使用 Inbox。"
              : "请用户在 GoalBoard 中完成真实操作、提交决定及相应验收依据；Runtime 不要重复领取 Review。",
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
      const evidenceIncomplete = phase === "execution";
      return {
        ...base,
        work_state: evidenceIncomplete ? "executing" : (`${phase}_blocked` as GoalWorkState),
        next_action: nextAction,
        reasons: [
          reason(
            evidenceIncomplete ? "action.evidence_incomplete" : "claim.release_repair_required",
            "claim",
            claim.claim_id,
            evidenceIncomplete
              ? "执行已经结束，还需要补齐当前要求对应的完成依据"
              : "本阶段已经结束，但旧 Claim 没有正常自动释放",
            { claim_id: claim.claim_id, run_id: latestRun.run_id },
            evidenceIncomplete
              ? "提交最后一条必要 Evidence；系统会自动释放 Claim 并立即给出下一动作。"
              : "这是旧数据或异常恢复场景，可使用显式 release 修复；正常流程不会到这里。",
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
    goal: GoalRecord,
  ): RunRecord["state"] | null {
    const compatibleRevisions = compatibleContractRevisions(goal, snapshot);
    const compatibleClaimIds = new Set(snapshot.claims
      .filter((claim) =>
        claim.goal_id === goal.goal_id && compatibleRevisions.has(claim.contract_revision)
      )
      .map((claim) => claim.claim_id));
    return (
      snapshot.runs
        .filter(
          (run) =>
            run.goal_id === goal.goal_id &&
            compatibleClaimIds.has(run.claim_id) &&
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
    _snapshot: ReturnType<SqliteGoalBoardStore["snapshot"]>,
  ): boolean {
    return goal.acceptance_criteria.every((criterion) =>
      this.criterionHasPassingEvidence(goal, criterion.criterion_id),
    );
  }

  private criterionHasPassingEvidence(goal: GoalRecord, criterionId: string): boolean {
    const snapshot = this.store.snapshot(goal.board_id);
    return this.evidenceVerification.query.hasPassingEvidence({
      board_id: goal.board_id,
      goal_id: goal.goal_id,
      criterion_id: criterionId,
      compatible_contract_revisions: [...compatibleContractRevisions(goal, snapshot)],
    });
  }

  private executorHandoffReasons(workState: GoalWorkStateView): DecisionReason[] {
    if (workState.work_state === "completion_blocked") {
      return [
        ...workState.reasons,
        reason(
          "goal.execution_finished_rework_required",
          "goal",
          workState.goal_id,
          "这条 Goal 的执行、Evidence 与 Review 已经结束；当前门禁只阻止完成，不是 executor Claim 门禁",
          {
            work_state: workState.work_state,
            completion_gate_only: true,
            recovery_tool: "goalboard_v1_rework_request",
          },
          "如果旧验收前提仍成立，处理返回的完成门禁后重试 complete；如果新反证推翻旧结论，调用 goalboard_v1_rework_request 指明受影响 criterion、反证 Evidence 和理由，再读取 Available 继续同一 Goal。",
        ),
      ].sort(compareReasons);
    }
    if (workState.work_state === "waiting_for_human") return workState.reasons;
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
          risk.owner,
          risk.affected_surfaces_json
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
          scope: "direct_goal",
          goal_id: goalId,
          association: "goal_risks",
          affected_surfaces: parseJson<string[]>(row.affected_surfaces_json, []),
        },
        asText(row.revisit_condition),
      ),
    );
  }

  /**
   * Compatibility port for facts owned by Evidence, Governance and
   * Collaboration while Goal lifecycle rules live in modules/goals.
   */
  private externalCompletionGateReasons(boardId: string, goalId: string): DecisionReason[] {
    const goal = this.requireGoalOnBoard(boardId, goalId);
    const snapshot = this.store.snapshot(boardId);
    const reasons: DecisionReason[] = [];
    for (const criterion of goal.acceptance_criteria) {
      if (!this.criterionHasPassingEvidence(goal, criterion.criterion_id)) {
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
    const pendingReviews = this.governance.query.listReviewObligations(boardId, goalId)
      .filter((obligation) => obligation.state === "pending");
    for (const pending of pendingReviews) {
      reasons.push(
        reason(
          "policy.review_pending",
          "review",
          pending.obligation_id,
          `还缺少 ${pending.role} Review`,
        ),
      );
    }
    const currentRunCandidates = snapshot.candidates.filter((candidate) => {
      const run = snapshot.runs.find((item) => item.run_id === candidate.discovered_in_run_id);
      return run?.goal_id === goalId && candidate.blocking_mode === "current_run";
    });
    const pendingCandidates = currentRunCandidates.filter((candidate) => candidate.state === "pending");
    for (const candidate of pendingCandidates) {
      reasons.push(reason(
        "candidate.user_decision_required",
        "candidate",
        candidate.candidate_id,
        "执行中发现的新工作需要用户决定",
      ));
    }
    const currentRunCandidateIds = new Set(currentRunCandidates.map((candidate) => candidate.candidate_id));
    const pendingRewires = snapshot.rewires.filter(
      (rewire) => rewire.state === "pending" && rewire.candidate_id != null && currentRunCandidateIds.has(rewire.candidate_id),
    );
    for (const pending of pendingRewires) {
      reasons.push(reason(
        "rewire.user_confirmation_required",
        "rewire",
        pending.rewire_id,
        "用户已接受 Candidate Goal，但关系调整尚未确认",
        { candidate_id: pending.candidate_id },
      ));
    }
    const directPendingRewires = snapshot.rewires.filter(
      (rewire) =>
        rewire.candidate_id == null &&
        rewire.state === "pending" &&
        rewire.proposal.proposal_kind === "dependency" &&
        rewire.proposal.blocking_mode === "current_run" &&
        rewire.proposal.discovered_in_run_id != null,
    );
    for (const pending of directPendingRewires) {
      const discoveredRun = snapshot.runs.find(
        (run) => run.run_id === pending.proposal.discovered_in_run_id,
      );
      if (discoveredRun?.goal_id !== goalId) continue;
      reasons.push(reason(
        "rewire.user_confirmation_required",
        "rewire",
        pending.rewire_id,
        "Runtime 提出了依赖调整，等待用户决定",
      ));
    }
    return reasons;
  }

  private hasPostExecutionNeedsChanges(boardId: string, goalId: string): boolean {
    const latestWorkCompletedSeq = this.executionModule.repository.latestCompletedWorkRunEventSeq(
      boardId,
      goalId,
    );
    const latestNeedsChangesSeq = this.governance.query
      .latestNeedsChangesReviewEventSeq(boardId, goalId);
    const latestReworkSeq = this.store.snapshot(boardId).lifecycle_events
      .filter((event) => event.type === "goal.rework_requested" && event.object_id === goalId)
      .reduce((latest, event) => Math.max(latest, event.seq), 0);
    return Math.max(
      latestNeedsChangesSeq,
      latestReworkSeq,
    ) > latestWorkCompletedSeq;
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

  private claimRoleForAction(candidate: GoalAction, snapshot: BoardSnapshot): ClaimRole {
    if (candidate.kind === "clarify") return "clarifier";
    if (candidate.kind === "revalidate") return "revalidator";
    if (candidate.kind === "review") {
      const obligation = snapshot.review_obligations.find(
        (item) => item.obligation_id === candidate.target_id,
      );
      if (obligation && obligation.role !== "human_approver") return obligation.role;
    }
    return "executor";
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
  private evaluate(input: EvaluationInput): Evaluation {
    const snapshotIndex = input.snapshot_index ?? (
      input.snapshot ? snapshotEvaluationIndex(input.snapshot) : undefined
    );
    const goal = snapshotIndex
      ? snapshotIndex.goals_by_id.get(input.goalId) ?? null
      : this.store.getGoal(input.goalId);
    const policy = this.resolvePolicy(
      input.boardId,
      input.goalId,
      input.strengthenPolicy,
      input.policy_rows,
    );
    const surfaces = snapshotIndex
      ? snapshotIndex.impacts_by_goal.get(input.goalId) ?? []
      : this.goalImpacts(input.boardId, input.goalId, input.snapshot);
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
    if (!goal.trashed_at && !goal.archived_at) {
      const replacement = this.activeGoalReplacement(input.boardId, goal.goal_id, input.snapshot);
      if (replacement) reasons.push(this.goalReplacedReason(goal.goal_id, replacement));
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
      const pendingContractProposal = snapshotIndex
        ? snapshotIndex.pending_contract_proposal_by_goal.get(goal.goal_id)
        : this.governance.query.snapshot(input.boardId).contract_proposals
          .find((proposal) => proposal.goal_id === goal.goal_id && proposal.state === "pending");
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
        const pendingReview = snapshotIndex
          ? snapshotIndex.pending_review_keys.has(`${input.goalId}\u0000${input.role}`)
          : this.governance.query.listReviewObligations(input.boardId, input.goalId)
            .some((obligation) => obligation.role === input.role && obligation.state === "pending");
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
        const latestWorkRun = snapshotIndex
          ? snapshotIndex.latest_work_run_by_goal.get(input.goalId)
          : this.executionModule.repository.latestRunForGoal(
              input.boardId,
              input.goalId,
              ["executor", "revalidator"],
            );
        if (!latestWorkRun || latestWorkRun.state !== "completed") {
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

      const dependencies = snapshotIndex
        ? snapshotIndex.dependencies_by_goal.get(input.goalId) ?? []
        : this.store.db
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

      const risks = snapshotIndex
        ? snapshotIndex.risks_by_goal.get(input.goalId) ?? []
        : this.store.db
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

    const sameGoalClaim = snapshotIndex
      ? (snapshotIndex.claims_by_goal.get(input.goalId) ?? [])
        .filter((claim) => claim.state === "active" && claim.expires_at > input.now)
        .sort((left, right) => left.claim_id.localeCompare(right.claim_id))[0]
      : this.executionModule.repository
        .listClaimsForGoal(input.boardId, input.goalId)
        .filter((claim) => claim.state === "active" && claim.expires_at > input.now)
        .sort((left, right) => left.claim_id.localeCompare(right.claim_id))[0];
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
      reasons.push(...this.impactConflicts(
        input.boardId,
        input.goalId,
        surfaces,
        input.now,
        snapshotIndex,
      ));
    }
    return { goal, reasons: reasons.sort(compareReasons), policy, surfaces };
  }

  private resolvePolicy(
    boardId: string,
    goalId: string,
    strengthen?: Partial<GoalPolicy>,
    allActiveRows?: ReturnType<SqliteGoalBoardStore["activePolicyRowsForBoard"]>,
  ): GoalPolicy {
    const rows = allActiveRows
      ? allActiveRows.filter((row) => row.goal_id == null || row.goal_id === goalId)
      : this.store.activePolicyRows(boardId, goalId);
    return resolveGoalPolicy(
      rows as Parameters<typeof resolveGoalPolicy>[0],
      strengthen,
    );
  }

  private impactConflicts(
    boardId: string,
    goalId: string,
    requested: ImpactBindingRecord[],
    now: string,
    snapshotIndex?: SnapshotEvaluationIndex,
  ): DecisionReason[] {
    const rows = snapshotIndex
      ? [...snapshotIndex.claims_by_goal.entries()]
        .filter(([existingGoalId]) => existingGoalId !== goalId)
        .flatMap(([existingGoalId, claims]) => claims
          .filter((claim) => claim.state === "active" && claim.expires_at > now)
          .flatMap((claim) => (snapshotIndex.impacts_by_goal.get(existingGoalId) ?? [])
            .filter((impact) => impact.state === "confirmed")
            .map((impact) => ({
              claim_id: claim.claim_id,
              existing_goal_id: existingGoalId,
              surface: impact.surface,
              access: impact.access,
              input_snapshot: impact.input_snapshot,
            }))))
        .sort((left, right) =>
          left.surface.localeCompare(right.surface) || left.claim_id.localeCompare(right.claim_id)
        )
      : (() => {
          const snapshot = this.store.snapshot(boardId);
          return snapshot.claims
            .filter((claim) =>
              claim.goal_id !== goalId && claim.state === "active" && claim.expires_at > now
            )
            .flatMap((claim) => snapshot.impacts
              .filter((impact) => impact.goal_id === claim.goal_id && impact.state === "confirmed")
              .map((impact) => ({
                claim_id: claim.claim_id,
                existing_goal_id: claim.goal_id,
                surface: impact.surface,
                access: impact.access,
                input_snapshot: impact.input_snapshot,
              })))
            .sort((left, right) =>
              left.surface.localeCompare(right.surface) || left.claim_id.localeCompare(right.claim_id)
            );
        })();
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

  private dependencySummary(
    boardId: string,
    goalId: string,
    snapshotIndex?: SnapshotEvaluationIndex,
  ): string[] {
    if (snapshotIndex) {
      return (snapshotIndex.dependencies_by_goal.get(goalId) ?? []).map((goal) => goal.title);
    }
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

  private riskSummary(goalId: string, snapshotIndex?: SnapshotEvaluationIndex): string[] {
    if (snapshotIndex) {
      return (snapshotIndex.risks_by_goal.get(goalId) ?? []).map((risk) => risk.description);
    }
    return (this.store.db
      .prepare(`
        SELECT r.description FROM risks r
        JOIN goal_risks gr ON gr.risk_id = r.risk_id
        WHERE gr.goal_id = ? AND r.state IN ('open', 'triggered')
        ORDER BY r.risk_id
      `)
      .all(goalId) as Row[]).map((row) => asText(row.description));
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
    this.goalsModule.commands.validateGoalInput(proposedGoal);
    const leafReadinessIssue = goalProposalLeafReadinessIssues(
      {
        item_id: `contract-proposal:${goalId}`,
        kind: "contract",
        operation: "update",
        payload: proposedGoal as unknown as Record<string, unknown>,
      },
      proposedGoal as unknown as Record<string, unknown>,
      "proposed_goal",
    )[0];
    if (leafReadinessIssue) {
      const { code, message, recovery, ...details } = leafReadinessIssue;
      throw new GoalBoardV1Error(
        code,
        `${message}${recovery}`,
        details,
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
      const rewire = this.governance.query.getRewire(boardId, rewireId);
      if (!rewire) {
        throw new GoalBoardV1Error(
          "contract_proposal.dependency_not_found",
          `找不到 Dependency Rewire: ${rewireId}`,
        );
      }
      const proposal = rewire.proposal;
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
        !["applied", "rejected"].includes(rewire.state)
      ) {
        throw new GoalBoardV1Error(
          "contract_proposal.dependency_pending",
          `请先确认或拒绝依赖调整，再接受 Contract: ${rewireId}`,
        );
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
    if (!this.goalsModule.query.getBoard(boardId)) {
      throw new GoalBoardV1Error("board.not_found", `Board 不存在: ${boardId}`);
    }
  }

  private requireGoalOnBoard(boardId: string, goalId: string): GoalRecord {
    const goal = this.goalsModule.query.getGoal(boardId, goalId);
    if (!goal) {
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

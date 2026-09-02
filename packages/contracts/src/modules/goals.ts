import type { ContractDescriptor } from "../platform/package.js";

export const modulesGoalsContract = {
  contractId: "io.goalboard.module.goals.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/modules/goals.md",
} as const satisfies ContractDescriptor;

export type GoalDefinitionState = "draft" | "accepted";
export type GoalDecompositionState =
  | "abstract"
  | "frontier_open"
  | "closed_leaf"
  | "closed_compound";
export type GoalValidityState = "valid" | "needs_revalidation" | "invalidated";
export type GoalFulfillmentState = "unmet" | "satisfied";
export type GoalContractRevisionEffect = "metadata" | "revalidate" | "rework";
export type GoalTaskContext = "game" | "app" | "ai_data" | "content_research" | "operations" | "other";
export type GoalLegacyProductContext = "game" | "app" | "other";
export type GoalRelationType =
  | "part_of"
  | "depends_on"
  | "conflicts_with"
  | "mitigates"
  | "extends"
  | "replaces"
  | "corrects"
  | "invalidates"
  | "migrates_from";

export interface GoalDecompositionReview {
  status: "complete" | "paused";
  method_pack_ids?: string[];
  task_context?: GoalTaskContext;
  product_context?: GoalLegacyProductContext;
  coverage: Array<{
    area: string;
    disposition: "goal" | "owned" | "not_applicable";
    goal_ids: string[];
    reason: string;
  }>;
  open_goal_ids: string[];
  next_step: string;
  contract_coverage?: {
    promised_outputs: Array<{
      parent_promised_output: string;
      status: "complete" | "partial" | "integration_required" | "uncovered";
      child_outputs: Array<{ goal_id: string; promised_output: string; contract_revision?: number }>;
      reason: string;
    }>;
    acceptance_criteria: Array<{
      parent_criterion_id: string;
      status: "complete" | "partial" | "integration_required" | "uncovered";
      child_criteria: Array<{ goal_id: string; criterion_id: string; contract_revision?: number }>;
      reason: string;
    }>;
  };
}

export interface GoalAcceptanceCriterion {
  criterion_id: string;
  goal_id: string;
  statement: string;
  decision_method: "automated_check" | "measurement" | "inspection" | "human_decision";
  pass_condition: string;
  target: Record<string, unknown> | null;
  required_evidence: string[];
}

export interface GoalLeafReadiness {
  verdict: "ready" | "split_required";
  primary_deliverable: string;
  output_coverage: Array<{
    promised_output: string;
    role: "primary" | "supporting" | "independent";
    reason: string;
  }>;
  split_candidates: Array<{
    work_item: string;
    separately_deliverable: boolean;
    separately_acceptable: boolean;
    independently_reworkable: boolean;
    decision: "keep" | "split";
    reason: string;
  }>;
  rationale: string;
  unresolved_decisions: string[];
  independent_deliverables: string[];
  acceptance_criterion_ids: string[];
}

export interface GoalRecord {
  goal_id: string;
  board_id: string;
  title: string;
  outcome: string;
  why: string;
  business_logic: string;
  in_scope: string[];
  out_of_scope: string[];
  constraints: string[];
  required_inputs: string[];
  promised_outputs: string[];
  decomposition_review: GoalDecompositionReview | null;
  definition_state: GoalDefinitionState;
  decomposition_state: GoalDecompositionState;
  validity_state: GoalValidityState;
  fulfillment_state: GoalFulfillmentState;
  current_contract_revision: number;
  trashed_at: string | null;
  trashed_by: string | null;
  archived_at: string | null;
  archived_by: string | null;
  priority: number;
  accepted_by: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
  acceptance_criteria: GoalAcceptanceCriterion[];
}

export interface CreateGoalInput {
  goal_id?: string;
  title: string;
  outcome: string;
  why: string;
  business_logic: string;
  in_scope?: string[];
  out_of_scope?: string[];
  constraints?: string[];
  required_inputs?: string[];
  promised_outputs?: string[];
  leaf_readiness?: GoalLeafReadiness;
  decomposition_review?: GoalDecompositionReview;
  definition_state?: GoalDefinitionState;
  decomposition_state?: GoalDecompositionState;
  priority?: number;
  acceptance_criteria: Array<{
    criterion_id?: string;
    statement: string;
    decision_method: GoalAcceptanceCriterion["decision_method"];
    pass_condition: string;
    target?: Record<string, unknown> | null;
    required_evidence?: string[];
  }>;
}

export interface GoalRelationRecord {
  relation_id: string;
  board_id: string;
  from_goal_id: string;
  to_goal_id: string;
  type: GoalRelationType;
  state: "proposed" | "active" | "inactive";
  reason: string;
  created_by: string;
  created_at: string;
  deactivated_at: string | null;
}

export type PlanningMethodScope = "built_in" | "personal" | "project";
export type PlanningMethodKind =
  | "meta"
  | "work_type"
  | "domain"
  | "industry"
  | "overlay"
  | "custom";

export interface PlanningCoverageRule {
  area: string;
  label: string;
  question: string;
}

export interface PlanningDependencyRule {
  rule_id: string;
  statement: string;
  direction_hint: string;
}

export interface PlanningMethodPack {
  method_id: string;
  version: number;
  scope: PlanningMethodScope;
  kind: PlanningMethodKind;
  name: string;
  summary: string;
  /** Complete Runtime-facing guidance; structured fields support UI and checks. */
  instructions: string;
  applies_to: string[];
  domain_tags: string[];
  steps: string[];
  required_coverage: PlanningCoverageRule[];
  dependency_rules: PlanningDependencyRule[];
  evidence_requirements: string[];
  completion_checks: string[];
  failure_modes: string[];
  source_refs: string[];
  confidence: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type PlanningMethodPackInput = Omit<
  PlanningMethodPack,
  "scope" | "version" | "created_at" | "updated_at" | "instructions"
> & { version?: number; instructions?: string };

export interface ResolvedPlanningMethodPack extends PlanningMethodPack {
  overridden_scopes: PlanningMethodScope[];
}

export interface PlanningMethodPath {
  method_id: string;
  method_name: string;
  kind: PlanningMethodKind;
  steps: string[];
  instructions: string;
}

export interface PlanningMethodComposition {
  method_pack_ids: string[];
  method_names: string[];
  method_paths: PlanningMethodPath[];
  required_coverage: PlanningCoverageRule[];
  dependency_rules: PlanningDependencyRule[];
  evidence_requirements: string[];
  completion_checks: string[];
  failure_modes: string[];
}

/** Structural input only; Proposal and Decision persistence remain Governance-owned. */
export interface PlanningProposalItem {
  item_id?: string;
  kind: string;
  operation: string;
  payload: Record<string, unknown>;
}

export interface PlanningRelationChange {
  action: "add" | "deactivate";
  relation_id?: string | null;
  from_goal_id: string;
  to_goal_id: string;
  type: GoalRelationType;
  reason?: string;
}

export interface PlanningGraphIssue {
  code:
    | "planning.goal_missing"
    | "planning.goal_trashed"
    | "planning.relation_self_reference"
    | "planning.relation_duplicate"
    | "planning.part_of_cycle"
    | "planning.dependency_cycle"
    | "planning.execution_cycle";
  message: string;
  goal_ids: string[];
  relation_ids: string[];
  path: string[];
}

export interface PlanningMetric {
  goal_id: string;
  topological_level: number;
  unlock_count: number;
  longest_downstream_chain: number;
}

export interface GoalChangeImpact {
  changed_goal_ids: string[];
  affected_ancestors: string[];
  affected_dependents: string[];
  adjacent_dependencies: string[];
  reusable_open_goal_ids: string[];
  review_order: string[];
  graph_issues: PlanningGraphIssue[];
}

export interface SaveProjectPlanningMethodInput {
  board_id: string;
  method: PlanningMethodPackInput;
  actor_id: string;
  user_confirmed: boolean;
}

export interface GoalsPlanningApi {
  effectiveMethods(boardId: string): PlanningMethodPack[];
  projectComposition(boardId: string): PlanningMethodComposition;
  saveProjectMethod(input: SaveProjectPlanningMethodInput): {
    method: PlanningMethodPack;
    observed_event_cursor: number;
  };
  analyzeChange(boardId: string, changedGoalIds: readonly string[]): GoalChangeImpact;
  validateBoardGraph(boardId: string): {
    issues: PlanningGraphIssue[];
    observed_event_cursor: number;
  };
}

export interface GoalLifecycleReason {
  code: string;
  severity: "info" | "warning" | "blocker";
  subject_type: string;
  subject_id: string;
  message: string;
  facts?: Record<string, unknown>;
  remediation?: string;
}

export type GoalTrashStatus =
  | "trashed"
  | "restored"
  | "already_trashed"
  | "already_active"
  | "blocked";

export interface GoalTrashResult {
  status: GoalTrashStatus;
  goal: GoalRecord;
  active_goal_cleared: boolean;
  deactivated_relation_ids: string[];
  restored_relation_ids: string[];
  pending_relation_ids: string[];
  blocking_claim_ids: string[];
  blocking_run_ids: string[];
}

export interface GoalArchiveResult {
  goal: GoalRecord;
  active_goal_cleared: boolean;
  observed_event_cursor: number;
  replayed: boolean;
}

export interface GoalRevalidationInput {
  board_id: string;
  goal_id: string;
  run_id: string;
  actor_id: string;
  reason: string;
  evidence_refs: string[];
  contract_revision?: number;
  action_token?: string;
  idempotency_key: string;
}

export interface GoalRevalidationDecision<TTransition = unknown> {
  revalidated: boolean;
  goal: GoalRecord;
  observed_event_cursor: number;
  reasons: GoalLifecycleReason[];
  replayed: boolean;
  transition?: TTransition;
}

export interface GoalCompletionResult {
  satisfied: boolean;
  reasons: GoalLifecycleReason[];
  observed_event_cursor: number;
  replayed: boolean;
}

export interface AddGoalRelationInput {
  from_goal_id: string;
  to_goal_id: string;
  type: GoalRelationType;
  state?: "proposed" | "active";
  reason: string;
}

export interface GoalPolicy {
  goal_mode: "disabled" | "preferred" | "required";
  required_capabilities: string[];
  self_verification: boolean;
  cross_reviewers: number;
  adversarial_reviewers: number;
  human_approval: boolean;
  max_lease_seconds: number;
}

export interface GoalsBoardRecord {
  board_id: string;
  title: string;
  active_goal_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface GoalRiskLinkRecord {
  goal_id: string;
  risk_id: string;
}

export interface GoalPolicyBindingRecord {
  scope: "project_default" | "ancestor_minimum" | "goal_override";
  goal_id: string | null;
  policy: Partial<GoalPolicy>;
}

export type RiskBlockingMode = "none" | "claim" | "completion" | "invalidate_on_trigger";

export interface RiskRecord {
  risk_id: string;
  board_id: string;
  description: string;
  probability: string;
  impact: string;
  affected_surfaces: string[];
  trigger: string;
  treatment: "accept" | "mitigate" | "avoid" | "defer";
  treatment_plan: string;
  blocking_mode: RiskBlockingMode;
  revisit_condition: string;
  owner: string;
  state: "open" | "triggered" | "resolved" | "accepted" | "expired";
  resolution_basis: {
    summary: string;
    evidence_refs: string[];
    residual_gaps: string[];
  } | null;
  created_at: string;
  updated_at: string;
}

export interface RiskFactsInput {
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

export interface UpdateRiskInput extends Omit<RiskFactsInput, "risk_id"> {
  risk_id: string;
  action_goal_id?: string;
  contract_revision?: number;
  action_id?: string;
  action_token?: string;
}

export interface SetRiskStateInput {
  risk_id: string;
  state: RiskRecord["state"];
  reason: string;
  resolution_basis?: NonNullable<RiskRecord["resolution_basis"]>;
  goal_id?: string;
  contract_revision?: number;
  action_id?: string;
  action_token?: string;
}

export type ProjectGuidanceKind =
  | "context"
  | "requirement"
  | "constraint"
  | "convention"
  | "workflow"
  | "quality_bar";

export interface ProjectGuidanceEntryRecord {
  guidance_id: string;
  board_id: string;
  position: number;
  revision: number;
  active: boolean;
  kind: ProjectGuidanceKind;
  content: string;
  content_hash: string;
  source_refs: string[];
  created_by: string;
  confirmation_summary: string;
  reason: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
}

export interface ProjectGuidanceRevisionRecord {
  revision_id: string;
  guidance_id: string;
  board_id: string;
  revision: number;
  kind: ProjectGuidanceKind;
  content: string;
  content_hash: string;
  source_refs: string[];
  active: boolean;
  changed_by: string;
  change_kind: "created" | "edited" | "deactivated" | "restored";
  confirmation_summary: string;
  reason: string;
  created_at: string;
}

export interface ProjectGuidanceView {
  entries: ProjectGuidanceEntryRecord[];
  inactive_entries: ProjectGuidanceEntryRecord[];
  revisions: ProjectGuidanceRevisionRecord[];
  virtual_document: string;
  runtime_prompt_prefix: string;
}

export interface GoalsQuerySnapshot {
  board: GoalsBoardRecord;
  observed_event_cursor: number;
  goals: GoalRecord[];
  relations: GoalRelationRecord[];
  risks: RiskRecord[];
  goal_risks: GoalRiskLinkRecord[];
  policy_bindings: GoalPolicyBindingRecord[];
  planning_method_packs: PlanningMethodPack[];
  project_guidance: ProjectGuidanceEntryRecord[];
}

export interface GoalFactsView {
  board: GoalsBoardRecord;
  observed_event_cursor: number;
  goal_path: string;
  goal: GoalRecord;
  parent_contract_coverage: Array<{
    parent_goal_id: string;
    parent_goal_title: string;
    record_status: "recorded" | "unrecorded";
    promised_outputs: NonNullable<GoalDecompositionReview["contract_coverage"]>["promised_outputs"];
    acceptance_criteria: NonNullable<GoalDecompositionReview["contract_coverage"]>["acceptance_criteria"];
  }>;
  relations: GoalRelationRecord[];
  risks: RiskRecord[];
  resolved_policy: GoalPolicy;
  project_guidance: ProjectGuidanceEntryRecord[];
}

export interface GoalsQueryApi {
  getBoard(boardId: string): GoalsBoardRecord | null;
  getGoal(boardId: string, goalId: string): GoalRecord | null;
  listGoals(
    boardId: string,
    options?: { include_archived?: boolean; include_trashed?: boolean },
  ): GoalRecord[];
  listRelations(boardId: string, goalId?: string): GoalRelationRecord[];
  listTrashedGoals(boardId: string): GoalRecord[];
  snapshot(boardId: string): GoalsQuerySnapshot;
  resolvePolicy(boardId: string, goalId: string, strengthen?: Partial<GoalPolicy>): GoalPolicy;
  readGoal(boardId: string, goalId: string): GoalFactsView;
  readProjectGuidance(boardId: string): ProjectGuidanceView;
}

export interface AddProjectGuidanceInput {
  board_id: string;
  actor_id: string;
  kind: ProjectGuidanceKind;
  content: string;
  source_refs?: string[];
  reason: string;
  confirmation_summary: string;
  user_confirmed: boolean;
  idempotency_key: string;
}

export interface AddProjectGuidanceResult {
  entry: ProjectGuidanceEntryRecord;
  created: boolean;
  observed_event_cursor: number;
  replayed: boolean;
}

export interface UpdateProjectGuidanceInput {
  board_id: string;
  guidance_id: string;
  actor_id: string;
  action: "edit" | "deactivate" | "restore";
  kind?: ProjectGuidanceKind;
  content?: string;
  source_refs?: string[];
  reason: string;
  confirmation_summary: string;
  user_confirmed: boolean;
  idempotency_key: string;
}

export interface UpdateProjectGuidanceResult {
  entry: ProjectGuidanceEntryRecord;
  revision: ProjectGuidanceRevisionRecord;
  observed_event_cursor: number;
  replayed: boolean;
}

export interface GoalsActorWrite {
  actor_id: string;
  actor_kind?: "user" | "runtime";
  idempotency_key: string;
  reason?: string;
}

export interface GoalsCommandApi<TTransition = unknown> {
  createGoal(boardId: string, input: CreateGoalInput, write: GoalsActorWrite): {
    goal: GoalRecord;
    observed_event_cursor: number;
    replayed: boolean;
  };
  updateDraftGoal(boardId: string, goalId: string, input: CreateGoalInput, write: GoalsActorWrite): {
    goal: GoalRecord;
    observed_event_cursor: number;
    replayed: boolean;
  };
  addRelation(boardId: string, input: AddGoalRelationInput, write: GoalsActorWrite): {
    relation_id: string;
    observed_event_cursor: number;
    replayed: boolean;
  };
  deactivateRelation(boardId: string, input: { relation_id: string; reason: string }, write: GoalsActorWrite): {
    relation: GoalRelationRecord;
    observed_event_cursor: number;
    replayed: boolean;
  };
  setPolicy(boardId: string, input: { goal_id?: string | null; policy: Partial<GoalPolicy>; reason: string }, write: GoalsActorWrite): {
    policy_binding_id: string;
    observed_event_cursor: number;
    replayed: boolean;
  };
  addRisk(boardId: string, input: RiskFactsInput, write: GoalsActorWrite): {
    risk: RiskRecord;
    transitions: TTransition[];
    observed_event_cursor: number;
    replayed: boolean;
  };
  updateRisk(boardId: string, input: UpdateRiskInput, write: GoalsActorWrite): {
    risk: RiskRecord;
    transitions: TTransition[];
    observed_event_cursor: number;
    replayed: boolean;
  };
  setRiskState(boardId: string, input: SetRiskStateInput, write: GoalsActorWrite): {
    risk: RiskRecord;
    transitions: TTransition[];
    observed_event_cursor: number;
    replayed: boolean;
  };
  addProjectGuidance(input: AddProjectGuidanceInput): AddProjectGuidanceResult;
  updateProjectGuidance(input: UpdateProjectGuidanceInput): UpdateProjectGuidanceResult;
}

export interface GoalsLifecycleApi<TTransition = unknown> {
  setArchived(
    boardId: string,
    input: { goal_id: string; archived: boolean; reason: string },
    write: GoalsActorWrite,
  ): GoalArchiveResult;
  setTrashed(
    boardId: string,
    input: { goal_id: string; trashed: boolean; reason: string },
    write: GoalsActorWrite,
  ): GoalTrashResult & { observed_event_cursor: number; replayed: boolean };
  listTrashed(boardId: string): GoalRecord[];
  revalidate(input: GoalRevalidationInput): GoalRevalidationDecision<TTransition>;
  evaluateCompletion(input: {
    board_id: string;
    goal_id: string;
    actor_id: string;
    idempotency_key: string;
  }): GoalCompletionResult;
}

/** Public application-facing Goals capabilities; Apps bind this port without owning rules or Stores. */
export interface GoalsApplicationApi<TTransition = unknown> {
  commands: GoalsCommandApi<TTransition>;
  lifecycle: GoalsLifecycleApi<TTransition>;
  planning: GoalsPlanningApi;
}

export type DefinitionState = "draft" | "accepted";
export type DecompositionState =
  | "abstract"
  | "frontier_open"
  | "closed_leaf"
  | "closed_compound";
export type ValidityState = "valid" | "needs_revalidation" | "invalidated";
export type FulfillmentState = "unmet" | "satisfied";
export type ClaimRole =
  | "clarifier"
  | "executor"
  | "self_verifier"
  | "cross_reviewer"
  | "adversarial_reviewer"
  | "revalidator";
export type GoalWorkAction = "clarify" | "execute" | "review" | "revalidate" | "complete";
export type GoalWorkState =
  | "clarification_pending"
  | "clarifying"
  | "clarification_blocked"
  | "waiting_children"
  | "execution_pending"
  | "executing"
  | "execution_blocked"
  | "completion_pending"
  | "completion_blocked"
  | "review_pending"
  | "reviewing"
  | "review_blocked"
  | "waiting_for_human"
  | "revalidation_pending"
  | "revalidating"
  | "revalidation_blocked"
  | "invalidated"
  | "satisfied"
  | "trashed"
  | "archived";
export type ClaimState = "active" | "released" | "expired" | "revoked";
export type ImpactAccess = "read" | "write" | "decide" | "exclusive";
export type RiskBlockingMode =
  | "none"
  | "claim"
  | "completion"
  | "invalidate_on_trigger";
export type GoalMode = "disabled" | "preferred" | "required";

export interface AcceptanceCriterion {
  criterion_id: string;
  goal_id: string;
  statement: string;
  decision_method: "automated_check" | "measurement" | "inspection" | "human_decision";
  pass_condition: string;
  target: Record<string, unknown> | null;
  required_evidence: string[];
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
  /** Canonical user-confirmed decomposition and parent-to-child Contract trace. */
  decomposition_review: DecompositionReview | null;
  definition_state: DefinitionState;
  decomposition_state: DecompositionState;
  validity_state: ValidityState;
  fulfillment_state: FulfillmentState;
  /** A recoverable deletion state. It is distinct from completed-Goal archival. */
  trashed_at: string | null;
  trashed_by: string | null;
  archived_at: string | null;
  archived_by: string | null;
  priority: number;
  accepted_by: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
  acceptance_criteria: AcceptanceCriterion[];
}

export interface GoalRelationRecord {
  relation_id: string;
  board_id: string;
  from_goal_id: string;
  to_goal_id: string;
  type:
    | "part_of"
    | "depends_on"
    | "conflicts_with"
    | "mitigates"
    | "extends"
    | "replaces"
    | "corrects"
    | "invalidates"
    | "migrates_from";
  state: "proposed" | "active" | "inactive";
  reason: string;
  created_by: string;
  created_at: string;
  deactivated_at: string | null;
}

export type GoalTrashStatus = "trashed" | "restored" | "already_trashed" | "already_active" | "blocked";

/**
 * Result from the one shared deletion/recovery domain operation. UI and MCP
 * adapters may add their own confirmation rules, but must not duplicate this
 * state transition or relation-recovery behavior.
 */
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

export interface ImpactBindingRecord {
  binding_id: string;
  board_id: string;
  goal_id: string;
  surface: string;
  access: ImpactAccess;
  input_snapshot: string | null;
  state: "proposed" | "confirmed" | "inactive";
  reason: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  deactivated_at: string | null;
  deactivation_reason: string | null;
}

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

export interface GoalPolicy {
  goal_mode: GoalMode;
  required_capabilities: string[];
  self_verification: boolean;
  cross_reviewers: number;
  adversarial_reviewers: number;
  human_approval: boolean;
  max_lease_seconds: number;
}

export type TaskContext = "game" | "app" | "ai_data" | "content_research" | "operations" | "other";
export type LegacyProductContext = "game" | "app" | "other";

export interface DecompositionReview {
  status: "complete" | "paused";
  /** The effective planning methods used to derive coverage and dependencies. */
  method_pack_ids?: string[];
  /** New proposals use this task-neutral context. */
  task_context?: TaskContext;
  /** Compatibility input for proposals created before task_context existed. */
  product_context?: LegacyProductContext;
  coverage: Array<{
    area: string;
    disposition: "goal" | "owned" | "not_applicable";
    goal_ids: string[];
    reason: string;
  }>;
  open_goal_ids: string[];
  next_step: string;
  /**
   * User-confirmed structural trace from this compound Goal's Contract to
   * descendant Contracts. GoalBoard validates exact references; it does not
   * infer semantic equivalence between differently worded results.
   */
  contract_coverage?: {
    promised_outputs: Array<{
      parent_promised_output: string;
      status: "complete" | "partial" | "integration_required" | "uncovered";
      child_outputs: Array<{ goal_id: string; promised_output: string }>;
      reason: string;
    }>;
    acceptance_criteria: Array<{
      parent_criterion_id: string;
      status: "complete" | "partial" | "integration_required" | "uncovered";
      child_criteria: Array<{ goal_id: string; criterion_id: string }>;
      reason: string;
    }>;
  };
}

/**
 * Runtime-supplied evidence that a proposed executable leaf contains one
 * independently verifiable result. It remains proposal history rather than a
 * second canonical Goal state.
 */
export interface LeafReadiness {
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

export interface ClaimRecord {
  claim_id: string;
  board_id: string;
  goal_id: string;
  actor_id: string;
  role: ClaimRole;
  state: ClaimState;
  capabilities: string[];
  goal_mode_attestation: boolean;
  resolved_policy: GoalPolicy;
  claimed_at: string;
  expires_at: string;
  renewed_at: string | null;
  released_at: string | null;
  release_reason: string | null;
}

export interface RunRecord {
  run_id: string;
  board_id: string;
  goal_id: string;
  claim_id: string;
  actor_id: string;
  role: ClaimRole;
  state: "started" | "blocked" | "completed" | "failed" | "abandoned";
  block_reason: string | null;
  output_refs: string[];
  discovery_refs: string[];
  started_at: string;
  ended_at: string | null;
}

export interface EvidenceRecord {
  evidence_id: string;
  board_id: string;
  goal_id: string;
  criterion_ids: string[];
  producer_actor_id: string;
  run_id: string | null;
  review_id: string | null;
  kind: "test" | "measurement" | "artifact" | "inspection" | "attestation" | "human_verdict";
  locator: string;
  locator_status: "verified" | "unverified";
  locator_validation_reason: string;
  locator_checked_at: string | null;
  /** Opaque catalog identity for the Runtime workspace used by verified project locators. */
  locator_workspace_id: string | null;
  digest: string | null;
  captured_at: string;
  result: "passed" | "failed" | "inconclusive";
  /** Derived from the immutable correction ledger; the Evidence row itself is never rewritten. */
  lifecycle_state: "effective" | "superseded" | "retracted";
  correction: EvidenceCorrectionRecord | null;
}

export interface EvidenceCorrectionRecord {
  correction_id: string;
  board_id: string;
  goal_id: string;
  target_evidence_id: string;
  action: "supersede" | "retract";
  replacement_evidence_id: string | null;
  actor_id: string;
  reason: string;
  created_at: string;
}

export interface ReviewObligationRecord {
  obligation_id: string;
  board_id: string;
  goal_id: string;
  role: "self_verifier" | "cross_reviewer" | "adversarial_reviewer" | "human_approver";
  required_count: number;
  independence_rule: string;
  criterion_scope: string[];
  state: "pending" | "satisfied" | "waived";
  created_at: string;
}

export interface ReviewRecord {
  review_id: string;
  board_id: string;
  goal_id: string;
  obligation_id: string;
  claim_id: string | null;
  actor_id: string;
  verdict: "pass" | "fail" | "needs_changes" | "inconclusive";
  evidence_refs: string[];
  reasoning: string;
  submitted_at: string;
}

export type DependencyProposalBasis =
  | "contract_output"
  | "code_reference"
  | "test_dependency"
  | "business_sequence"
  | "impact_conflict"
  | "risk_policy";

export interface DependencyProposal {
  from_goal_id: string;
  to_goal_id: string;
  type: "depends_on";
  action: "add" | "deactivate";
  reason: string;
  basis: DependencyProposalBasis;
  evidence_refs: string[];
  impact_if_rejected: string;
  confidence: number;
  direction_reason: string;
}

export type ContractFieldName =
  | "title"
  | "outcome"
  | "why"
  | "business_logic"
  | "in_scope"
  | "out_of_scope"
  | "constraints"
  | "required_inputs"
  | "promised_outputs"
  | "priority"
  | "acceptance_criteria"
  | "review_policy";

export interface ContractFieldSource {
  field: ContractFieldName;
  source_kind: "user_answer" | "repository_fact" | "document_fact" | "runtime_inference";
  source_refs: string[];
  confidence: number;
  rationale: string;
  status: "proposed";
  requires_user_confirmation: true;
}

export interface ContractProposalImpact {
  surface: string;
  access: ImpactAccess;
  input_snapshot?: string | null;
  reason: string;
}

export interface ContractProposalRisk {
  risk_id: string;
  description: string;
  probability: string;
  impact: string;
  affected_surfaces: string[];
  trigger: string;
  treatment: RiskRecord["treatment"];
  treatment_plan?: string;
  blocking_mode: RiskBlockingMode;
  revisit_condition: string;
  owner: string;
}

export interface ContractProposalRecord {
  proposal_id: string;
  board_id: string;
  goal_id: string;
  submitted_by: string;
  discovered_in_run_id: string;
  proposed_goal: CreateGoalInput;
  field_sources: ContractFieldSource[];
  review_policy: GoalPolicy;
  proposed_impacts: ContractProposalImpact[];
  proposed_risks: ContractProposalRisk[];
  dependency_rewire_ids: string[];
  state: "pending" | "approved" | "rejected" | "superseded";
  decision: Record<string, unknown> | null;
  created_at: string;
  decided_at: string | null;
}

/**
 * Dialogue facts live beside, rather than inside, the canonical Goal
 * Contract. They let the current Runtime resume a Draft conversation without
 * treating an inference or an unapproved structure as settled Goal truth.
 */
export type ClarificationSessionState = "clarifying" | "proposal_ready" | "closed";

export interface ClarificationFact {
  statement: string;
  source_kind: "user_answer" | "repository_fact" | "document_fact";
  source_refs: string[];
  confidence: number;
  confirmed_by_user: boolean;
}

export interface ClarificationAssumption {
  statement: string;
  source_refs: string[];
  confidence: number;
  requires_user_confirmation: true;
}

export interface ClarificationSessionRecord {
  session_id: string;
  board_id: string;
  goal_id: string;
  claim_id: string | null;
  run_id: string | null;
  rough_idea: string;
  state: ClarificationSessionState;
  current_understanding: string | null;
  next_question: string | null;
  proposal_summary: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface ClarificationTurnRecord {
  turn_id: string;
  session_id: string;
  board_id: string;
  goal_id: string;
  run_id: string | null;
  actor_id: string;
  turn_index: number;
  turn_kind: "rough_idea" | "user_answer";
  user_message: string;
  current_understanding: string | null;
  known_facts: ClarificationFact[];
  assumptions: ClarificationAssumption[];
  next_question: string | null;
  proposal_summary: string | null;
  created_at: string;
}

/**
 * A proposed Goal Tree is deliberately separate from canonical Goals. It can
 * describe a whole family of changes while the user is still deciding what
 * should become real.
 */
export type GoalTreeProposalOrigin =
  | "native"
  | "legacy_contract_proposal"
  | "legacy_candidate"
  | "legacy_rewire";
export type GoalTreeProposalState =
  | "pending"
  | "superseded"
  | "approved"
  | "partially_applied"
  | "rejected"
  | "dismissed"
  | "closed";
export type GoalTreeProposalItemKind =
  | "goal"
  | "contract"
  | "relation"
  | "dependency"
  | "risk"
  | "policy"
  | "candidate"
  | "rewire";
export type GoalTreeProposalOperation = "create" | "update" | "deactivate";
export type GoalTreeProposalItemState =
  | "pending"
  | "conflict"
  | "superseded"
  | "approved"
  | "applied"
  | "rejected"
  | "dismissed";
export type GoalTreeProposalDecisionAction = "confirm" | "reject" | "revise";
export type GoalTreeProposalDecisionState = "confirmed" | "rejected" | "revised" | "conflict";
export type ProposalAffectedObjectType = "goal" | "relation" | "risk" | "policy" | "candidate" | "rewire";

export interface ProposalAffectedObject {
  object_type: ProposalAffectedObjectType;
  object_id: string;
}

export interface ProposalObjectVersion extends ProposalAffectedObject {
  exists: boolean;
  version: string;
}

/**
 * The user decision audit is recorded separately from the Runtime that
 * carried it over MCP. A local Runtime can attest that the user explicitly
 * confirmed in the current dialogue; this is auditable provenance, not a
 * cryptographic trust boundary.
 */
export interface GoalTreeProposalDecisionAuthority {
  actor_id: string;
  actor_kind: "user";
  authority_source: "runtime_dialogue" | "web" | "management";
  conversation_ref: string;
  message_ref: string;
  whole_confirmation_prompted?: boolean;
}

export interface GoalTreeProposalDecisionRecord {
  decision_id: string;
  board_id: string;
  proposal_id: string;
  item_id: string;
  decision: GoalTreeProposalDecisionState;
  actor_id: string;
  authority_source: GoalTreeProposalDecisionAuthority["authority_source"];
  runtime_actor_id: string | null;
  conversation_ref: string;
  message_ref: string;
  reason: string;
  revision_proposal_id: string | null;
  materialized_objects: ProposalAffectedObject[];
  created_at: string;
}

export interface GoalTreeProposalItemRecord {
  item_id: string;
  proposal_id: string;
  board_id: string;
  ordinal: number;
  kind: GoalTreeProposalItemKind;
  operation: GoalTreeProposalOperation;
  payload: Record<string, unknown>;
  source_refs: string[];
  reason: string;
  confidence: number;
  affected_objects: ProposalAffectedObject[];
  baseline_versions: ProposalObjectVersion[];
  requires_user_confirmation: boolean;
  state: GoalTreeProposalItemState;
  conflict: Record<string, unknown> | null;
  decision: GoalTreeProposalDecisionRecord | null;
  materialized_objects: ProposalAffectedObject[];
  revision_proposal_id: string | null;
  supersedes_item_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface GoalTreeProposalRecord {
  proposal_id: string;
  board_id: string;
  origin: GoalTreeProposalOrigin;
  root_goal_id: string | null;
  submitted_by: string;
  discovered_in_run_id: string | null;
  state: GoalTreeProposalState;
  version: number;
  supersedes_proposal_id: string | null;
  base_event_cursor: number;
  summary: string;
  decision: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
  items: GoalTreeProposalItemRecord[];
  decisions: GoalTreeProposalDecisionRecord[];
}

export interface GoalTreeProposalItemInput {
  item_id?: string;
  kind: GoalTreeProposalItemKind;
  operation: GoalTreeProposalOperation;
  payload: Record<string, unknown>;
  source_refs: string[];
  reason: string;
  confidence: number;
  affected_objects: ProposalAffectedObject[];
  requires_user_confirmation?: boolean;
  supersedes_item_id?: string | null;
}

export interface GoalTreeProposalSubmitInput {
  board_id: string;
  actor_id: string;
  discovered_in_run_id: string;
  root_goal_id?: string | null;
  summary: string;
  items: GoalTreeProposalItemInput[];
  base_event_cursor?: number;
  supersedes_proposal_id?: string | null;
  idempotency_key: string;
}

export interface GoalTreeProposalCheckInput {
  board_id: string;
  proposal_id: string;
  actor_id: string;
  idempotency_key: string;
}

export interface GoalTreeProposalItemDecisionInput {
  item_id: string;
  decision: GoalTreeProposalDecisionAction;
  reason: string;
  /** A revised item becomes a new pending proposal version; it is never written as canonical directly. */
  revised_item?: GoalTreeProposalItemInput;
}

export interface GoalTreeProposalDecideInput {
  board_id: string;
  proposal_id: string;
  /** The current Runtime that carried the user message; null for direct Web/management decisions. */
  runtime_actor_id?: string | null;
  authority: GoalTreeProposalDecisionAuthority;
  decisions?: GoalTreeProposalItemDecisionInput[];
  /** Shared reason for a whole-proposal confirmation; item reasons take precedence. */
  reason?: string;
  /** True only when the preceding Runtime prompt named this one whole proposal for confirmation. */
  confirm_all_pending?: boolean;
  idempotency_key: string;
}

export interface CandidateGoalRecord {
  candidate_id: string;
  board_id: string;
  submitted_by: string;
  discovered_in_run_id: string | null;
  proposed_goal: CreateGoalInput;
  proposed_relations: Array<Record<string, unknown>>;
  proposed_impacts: Array<Record<string, unknown>>;
  proposed_risks: Array<Record<string, unknown>>;
  blocking_mode: "none" | "current_run" | "dependent_claims";
  state: "pending" | "approved" | "rejected" | "dismissed" | "superseded";
  decision: Record<string, unknown> | null;
  created_at: string;
  decided_at: string | null;
}

export interface RewireRecord {
  rewire_id: string;
  board_id: string;
  candidate_id: string | null;
  proposal: {
    formal_goal_id?: string;
    proposal_kind?: "candidate" | "dependency";
    submitted_by?: string;
    discovered_in_run_id?: string | null;
    blocking_mode?: "none" | "current_run";
    relations?: Array<Record<string, unknown>>;
    impacts?: Array<Record<string, unknown>>;
    risks?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  impact: Record<string, unknown>;
  state: "pending" | "confirmed" | "rejected" | "applied";
  created_at: string;
  decided_at: string | null;
}

export interface DecisionReason {
  code: string;
  severity: "info" | "warning" | "blocker";
  subject_type: string;
  subject_id: string;
  message: string;
  facts?: Record<string, unknown>;
  remediation?: string;
}

export interface ReadyGoal {
  goal: GoalRecord;
  role: ClaimRole;
  why_now: string;
  priority_hint: number;
  dependency_summary: string[];
  risk_summary: string[];
  resolved_policy: GoalPolicy;
  relevant_surfaces: ImpactBindingRecord[];
}

/**
 * The one user-facing work state for a Goal. It is derived from canonical
 * Goal, relation, Claim, Run and Review facts; it is never a second mutable
 * status field.
 */
export interface GoalWorkStateView {
  goal_id: string;
  work_state: GoalWorkState;
  next_action: GoalWorkAction | null;
  active_claim: ClaimRecord | null;
  active_claim_lease: {
    remaining_seconds: number;
    renewal_window_seconds: number;
    renew_recommended: boolean;
    next_action: "renew_claim" | null;
  } | null;
  active_run: RunRecord | null;
  pending_review_roles: Array<"self_verifier" | "cross_reviewer" | "adversarial_reviewer" | "human_approver">;
  child_goal_ids: string[];
  reasons: DecisionReason[];
}

export interface AvailableGoal extends Omit<ReadyGoal, "role"> {
  /** Null means this action does not require a new Claim or Run. */
  role: ClaimRole | null;
  work_state: GoalWorkState;
  next_action: GoalWorkAction;
  review_obligation_id: string | null;
  /** True when an open parent must return to the user before unrelated work is chosen. */
  requires_parent_confirmation: boolean;
  /** Dependency-derived planning signals used to explain the execution order. */
  planning: {
    topological_level: number;
    unlock_count: number;
    longest_downstream_chain: number;
    rationale: string;
  };
}

/** A Goal that is not claimable because its finished work is waiting on a completion gate. */
export interface BlockedAvailableGoal {
  goal: GoalRecord;
  work_state: "completion_blocked" | "waiting_for_human";
  next_action: null;
  reasons: DecisionReason[];
  priority_hint: number;
  risk_summary: string[];
}

export interface ParallelRuntimeAssignment {
  runtime_slot: "current_runtime" | `additional_runtime_${number}`;
  goal_id: string;
  title: string;
  role: "executor";
  required_capabilities: string[];
}

export interface ParallelExecutionSuggestion {
  kind: "safe_parallel_execution";
  advisory_only: true;
  assignments: ParallelRuntimeAssignment[];
}

export interface BoardSnapshot {
  board: {
    board_id: string;
    title: string;
    active_goal_id: string | null;
    created_at: string;
    updated_at: string;
  };
  cursor: number;
  goals: GoalRecord[];
  relations: GoalRelationRecord[];
  impacts: ImpactBindingRecord[];
  risks: RiskRecord[];
  claims: ClaimRecord[];
  runs: RunRecord[];
  evidence: EvidenceRecord[];
  evidence_corrections: EvidenceCorrectionRecord[];
  review_obligations: ReviewObligationRecord[];
  reviews: ReviewRecord[];
  candidates: CandidateGoalRecord[];
  contract_proposals: ContractProposalRecord[];
  rewires: RewireRecord[];
  clarification_sessions: ClarificationSessionRecord[];
  clarification_turns: ClarificationTurnRecord[];
  goal_tree_proposals: GoalTreeProposalRecord[];
  planning_method_packs: PlanningMethodPack[];
}

export interface GoalContractView {
  board: BoardSnapshot["board"];
  observed_event_cursor: number;
  goal_path: string;
  goal: GoalRecord;
  parent_contract_coverage: Array<{
    parent_goal_id: string;
    parent_goal_title: string;
    record_status: "recorded" | "unrecorded";
    promised_outputs: NonNullable<DecompositionReview["contract_coverage"]>["promised_outputs"];
    acceptance_criteria: NonNullable<DecompositionReview["contract_coverage"]>["acceptance_criteria"];
  }>;
  work_state: GoalWorkStateView;
  relations: GoalRelationRecord[];
  impacts: ImpactBindingRecord[];
  risks: RiskRecord[];
  resolved_policy: GoalPolicy;
  claims: ClaimRecord[];
  runs: RunRecord[];
  evidence: EvidenceRecord[];
  evidence_corrections: EvidenceCorrectionRecord[];
  review_obligations: ReviewObligationRecord[];
  reviews: ReviewRecord[];
  candidates: CandidateGoalRecord[];
  contract_proposals: ContractProposalRecord[];
  rewires: RewireRecord[];
  clarification_sessions: ClarificationSessionRecord[];
  clarification_turns: ClarificationTurnRecord[];
  goal_tree_proposals: GoalTreeProposalRecord[];
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
  /** Runtime proposal evidence; it is retained in proposal history, not as a second Goal state. */
  leaf_readiness?: LeafReadiness;
  /** User-confirmed decomposition evidence and parent-to-child Contract trace. */
  decomposition_review?: DecompositionReview;
  definition_state?: DefinitionState;
  decomposition_state?: DecompositionState;
  priority?: number;
  acceptance_criteria: Array<{
    criterion_id?: string;
    statement: string;
    decision_method: AcceptanceCriterion["decision_method"];
    pass_condition: string;
    target?: Record<string, unknown> | null;
    required_evidence?: string[];
  }>;
}

export interface ClaimRequest {
  board_id: string;
  goal_id: string;
  actor_id: string;
  role?: ClaimRole;
  capabilities?: string[];
  goal_mode_attestation?: boolean;
  lease_seconds?: number;
  strengthen_policy?: Partial<GoalPolicy>;
  idempotency_key: string;
}

export interface ClaimRenewRequest {
  board_id: string;
  claim_id: string;
  actor_id: string;
  lease_seconds?: number;
  idempotency_key: string;
}

export interface ClaimRenewResult {
  claim: ClaimRecord;
  replayed: boolean;
  observed_event_cursor: number;
}

export interface ClaimDecision {
  allowed: boolean;
  observed_event_cursor: number;
  reasons: DecisionReason[];
  claim: ClaimRecord | null;
  replayed: boolean;
}

export interface ClaimRunDecision {
  allowed: boolean;
  observed_event_cursor: number;
  reasons: DecisionReason[];
  claim: ClaimRecord | null;
  run: RunRecord | null;
  work_state: GoalWorkStateView | null;
  replayed: boolean;
}

export interface DraftDialogueStartInput {
  board_id: string;
  actor_id: string;
  rough_idea: string;
  draft_title?: string;
  goal_id?: string;
  capabilities?: string[];
  goal_mode_attestation?: boolean;
  lease_seconds?: number;
  idempotency_key: string;
}

export interface DraftDialogueTurnInput {
  board_id: string;
  goal_id: string;
  run_id: string;
  actor_id: string;
  user_message: string;
  current_understanding: string;
  known_facts?: Array<{
    statement: string;
    source_kind: ClarificationFact["source_kind"];
    source_refs?: string[];
    confidence?: number;
    confirmed_by_user?: boolean;
  }>;
  assumptions?: Array<{
    statement: string;
    source_refs?: string[];
    confidence?: number;
  }>;
  next_question?: string | null;
  proposal_summary?: string | null;
  idempotency_key: string;
}

export interface DraftDialogueResumeInput {
  board_id: string;
  goal_id: string;
  actor_id: string;
  capabilities?: string[];
  goal_mode_attestation?: boolean;
  lease_seconds?: number;
  idempotency_key: string;
}

export interface DraftDialogueView {
  dialogue: ClarificationSessionRecord;
  turns: ClarificationTurnRecord[];
  goal: GoalRecord;
  work_state: GoalWorkStateView;
  claim: ClaimRecord | null;
  run: RunRecord | null;
  observed_event_cursor: number;
}

export interface RevalidationDecision {
  revalidated: boolean;
  goal: GoalRecord;
  observed_event_cursor: number;
  reasons: DecisionReason[];
  replayed: boolean;
}

export const DEFAULT_GOAL_POLICY: GoalPolicy = {
  goal_mode: "preferred",
  required_capabilities: [],
  self_verification: true,
  cross_reviewers: 0,
  adversarial_reviewers: 0,
  human_approval: false,
  max_lease_seconds: 1800,
};
import type { PlanningMethodPack } from "../planning/method-packs.js";

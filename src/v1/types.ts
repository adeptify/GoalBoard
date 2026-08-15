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
  | "cross_reviewer"
  | "adversarial_reviewer"
  | "revalidator";
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
  definition_state: DefinitionState;
  decomposition_state: DecompositionState;
  validity_state: ValidityState;
  fulfillment_state: FulfillmentState;
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
  blocking_mode: RiskBlockingMode;
  revisit_condition: string;
  owner: string;
  state: "open" | "triggered" | "resolved" | "accepted" | "expired";
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
  role: "clarifier" | "executor" | "revalidator";
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
  digest: string | null;
  captured_at: string;
  result: "passed" | "failed" | "inconclusive";
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
  review_obligations: ReviewObligationRecord[];
  reviews: ReviewRecord[];
  candidates: CandidateGoalRecord[];
  contract_proposals: ContractProposalRecord[];
  rewires: RewireRecord[];
}

export interface GoalContractView {
  board: BoardSnapshot["board"];
  observed_event_cursor: number;
  goal_path: string;
  goal: GoalRecord;
  relations: GoalRelationRecord[];
  impacts: ImpactBindingRecord[];
  risks: RiskRecord[];
  resolved_policy: GoalPolicy;
  claims: ClaimRecord[];
  runs: RunRecord[];
  evidence: EvidenceRecord[];
  review_obligations: ReviewObligationRecord[];
  reviews: ReviewRecord[];
  candidates: CandidateGoalRecord[];
  contract_proposals: ContractProposalRecord[];
  rewires: RewireRecord[];
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

export interface ClaimDecision {
  allowed: boolean;
  observed_event_cursor: number;
  reasons: DecisionReason[];
  claim: ClaimRecord | null;
  replayed: boolean;
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

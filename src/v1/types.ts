export type DefinitionState = import("@adeptify/goalboard-contracts/modules/goals").GoalDefinitionState;
export type DecompositionState = import("@adeptify/goalboard-contracts/modules/goals").GoalDecompositionState;
export type ValidityState = import("@adeptify/goalboard-contracts/modules/goals").GoalValidityState;
export type FulfillmentState = import("@adeptify/goalboard-contracts/modules/goals").GoalFulfillmentState;
export type ClaimRole = import("@adeptify/goalboard-contracts/modules/execution").ExecutionClaimRole;
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
  | "replaced"
  | "invalidated"
  | "satisfied"
  | "trashed"
  | "archived";
export type ClaimState = import("@adeptify/goalboard-contracts/modules/execution").ExecutionClaimState;
export type GoalActionActor = "runtime" | "user";
export type GoalActionKind =
  | "clarify"
  | "execute"
  | "submit_evidence"
  | "revise"
  | "review"
  | "revalidate"
  | "mitigate_risk"
  | "accept_risk"
  | "release"
  | "renew"
  | "repair"
  | "wait";
export type GoalActionStatus = "ready" | "active" | "blocked";
export type GoalActionProgress = "not_started" | "in_progress" | "work_recorded" | "verified";
export type GoalDisplayStatus = "continue" | "in_progress" | "waiting_user" | "waiting" | "blocked" | "completed";
export type ImpactAccess = "read" | "write" | "decide" | "exclusive";
export type RiskBlockingMode = import("@adeptify/goalboard-contracts/modules/goals").RiskBlockingMode;
export type GoalMode = import("@adeptify/goalboard-contracts/modules/goals").GoalPolicy["goal_mode"];
export type ProjectGuidanceKind = import("@adeptify/goalboard-contracts/modules/goals").ProjectGuidanceKind;
export type ProjectGuidanceEntryRecord = import("@adeptify/goalboard-contracts/modules/goals").ProjectGuidanceEntryRecord;
export type ProjectGuidanceChangeKind = import("@adeptify/goalboard-contracts/modules/goals").ProjectGuidanceRevisionRecord["change_kind"];
export type ProjectGuidanceRevisionRecord = import("@adeptify/goalboard-contracts/modules/goals").ProjectGuidanceRevisionRecord;
export type ProjectGuidanceView = import("@adeptify/goalboard-contracts/modules/goals").ProjectGuidanceView;
export type AddProjectGuidanceInput = import("@adeptify/goalboard-contracts/modules/goals").AddProjectGuidanceInput;
export type AddProjectGuidanceResult = import("@adeptify/goalboard-contracts/modules/goals").AddProjectGuidanceResult;
export type UpdateProjectGuidanceInput = import("@adeptify/goalboard-contracts/modules/goals").UpdateProjectGuidanceInput;
export type UpdateProjectGuidanceResult = import("@adeptify/goalboard-contracts/modules/goals").UpdateProjectGuidanceResult;
export type AcceptanceCriterion = import("@adeptify/goalboard-contracts/modules/goals").GoalAcceptanceCriterion;
export type GoalRecord = import("@adeptify/goalboard-contracts/modules/goals").GoalRecord;
export type GoalRelationRecord = import("@adeptify/goalboard-contracts/modules/goals").GoalRelationRecord;
export type GoalTrashStatus = import("@adeptify/goalboard-contracts/modules/goals").GoalTrashStatus;
export type GoalTrashResult = import("@adeptify/goalboard-contracts/modules/goals").GoalTrashResult;

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

export type RiskRecord = import("@adeptify/goalboard-contracts/modules/goals").RiskRecord;
export type GoalPolicy = import("@adeptify/goalboard-contracts/modules/goals").GoalPolicy;
export type TaskContext = import("@adeptify/goalboard-contracts/modules/goals").GoalTaskContext;
export type LegacyProductContext = import("@adeptify/goalboard-contracts/modules/goals").GoalLegacyProductContext;
export type DecompositionReview = import("@adeptify/goalboard-contracts/modules/goals").GoalDecompositionReview;
export type LeafReadiness = import("@adeptify/goalboard-contracts/modules/goals").GoalLeafReadiness;
export type ClaimRecord = import("@adeptify/goalboard-contracts/modules/execution").ExecutionClaimRecord;
export type RunRecord = import("@adeptify/goalboard-contracts/modules/execution").ExecutionRunRecord;

export type EvidenceRecord =
  import("@adeptify/goalboard-contracts/modules/evidence-verification").EvidenceRecord;
export type EvidenceCorrectionRecord =
  import("@adeptify/goalboard-contracts/modules/evidence-verification").EvidenceCorrectionRecord;

export type ReviewObligationRecord =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").ReviewObligationRecord;
export type ReviewRecord =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").ReviewRecord;

export type ContractRevisionEffect = import("@adeptify/goalboard-contracts/modules/goals").GoalContractRevisionEffect;

export interface GoalContractRevisionRecord {
  goal_id: string;
  board_id: string;
  revision: number;
  contract: CreateGoalInput;
  effect: ContractRevisionEffect;
  source_proposal_id: string | null;
  changed_by: string;
  reason: string;
  created_at: string;
}

export interface GoalRiskLinkRecord {
  goal_id: string;
  risk_id: string;
}

export interface CoverageContractRevisionRecord {
  parent_goal_id: string;
  child_goal_id: string;
  parent_contract_revision: number;
  child_contract_revision: number;
  recorded_at: string;
}

export interface GoalLifecycleEventRecord {
  seq: number;
  type: string;
  object_type: string;
  object_id: string;
  payload: Record<string, unknown>;
  at: string;
}

export interface GoalAction {
  action_id: string;
  actor: GoalActionActor;
  kind: GoalActionKind;
  status: GoalActionStatus;
  target_type: string;
  target_id: string;
  reasons: DecisionReason[];
}

export interface GoalActionProjection {
  goal_id: string;
  contract_revision: number;
  progress: GoalActionProgress;
  primary_action: GoalAction | null;
  actions: GoalAction[];
  action_token: string;
  display_status: GoalDisplayStatus;
}

export interface CompactGoalActionProjection {
  goal_id: string;
  contract_revision: number;
  progress: GoalActionProgress;
  primary_action: GoalAction | null;
  action_token: string;
  display_status: GoalDisplayStatus;
}

export interface ActionTransitionReceipt {
  goal_id: string;
  previous_action_token: string;
  projection: GoalActionProjection;
  affected_goals: CompactGoalActionProjection[];
  summary: string;
  observed_event_cursor: number;
}

export type DependencyProposalBasis =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").DependencyProposalBasis;
export type DependencyProposal =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").DependencyProposal;

export type ContractFieldName =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").ContractFieldName;
export type ContractFieldSource =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").ContractFieldSource;
export type ContractProposalImpact =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").ContractProposalImpact;
export type ContractProposalRisk =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").ContractProposalRisk;
export type ContractProposalRecord =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").ContractProposalRecord;

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
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").GoalTreeProposalOrigin;
export type GoalTreeProposalState =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").GoalTreeProposalState;
export type GoalTreeProposalItemKind =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").GoalTreeProposalItemKind;
export type GoalTreeProposalOperation =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").GoalTreeProposalOperation;
export type GoalTreeProposalItemState =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").GoalTreeProposalItemState;
export type GoalTreeProposalDecisionAction =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").GoalTreeProposalDecisionAction;
export type GoalTreeProposalDecisionState =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").GoalTreeProposalDecisionState;
export type ProposalAffectedObjectType =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").ProposalAffectedObjectType;
export type ProposalAffectedObject =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").ProposalAffectedObject;
export type ProposalObjectVersion =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").ProposalObjectVersion;

/**
 * The user decision audit is recorded separately from the Runtime that
 * carried it over MCP. A local Runtime can attest that the user explicitly
 * confirmed in the current dialogue; this is auditable provenance, not a
 * cryptographic trust boundary.
 */
export type GoalTreeProposalDecisionAuthority =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").GoalTreeProposalDecisionAuthority;
export type GoalTreeProposalDecisionRecord =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").GoalTreeProposalDecisionRecord;
export type GoalTreeProposalNarrative =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").GoalTreeProposalNarrative;
export type GoalTreeProposalItemExplanation =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").GoalTreeProposalItemExplanation;

export type GoalTreeProposalItemRecord =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").GoalTreeProposalItemRecord;
export type GoalTreeProposalRecord =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").GoalTreeProposalRecord;

export type GoalTreeProposalItemInput =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").GoalTreeProposalItemInput;
export type GoalTreeProposalSubmitInput =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").GoalTreeProposalSubmitInput;
export type GoalTreeProposalCheckInput =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").GoalTreeProposalCheckInput;
export type GoalTreeProposalItemDecisionInput =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").GoalTreeProposalItemDecisionInput;
export type GoalTreeProposalDecideInput =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").GoalTreeProposalDecideInput;

export type CandidateGoalRecord =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").CandidateGoalRecord;
export type RewireRecord =
  import("@adeptify/goalboard-contracts/modules/governance-collaboration").RewireRecord;

export type DecisionReason = import("@adeptify/goalboard-contracts/modules/goals").GoalLifecycleReason;

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
  /** Exact canonical action to submit to select_goal. Null only for a legacy repair action. */
  action_id: string | null;
  action_token: string;
  action_kind: GoalActionKind | null;
  action_target_type: string | null;
  action_target_id: string | null;
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
  work_state: "completion_blocked" | "waiting_for_human" | "replaced";
  next_action: null;
  reasons: DecisionReason[];
  priority_hint: number;
  risk_summary: string[];
}

/** A compact pointer to an ordinary phase blocker that can be expanded with Explain. */
export interface BlockedAvailableOverview {
  goal: GoalRecord;
  work_state:
    | "clarification_blocked"
    | "waiting_children"
    | "execution_blocked"
    | "review_blocked"
    | "revalidation_blocked"
    | "invalidated";
  next_action: "explain" | "release";
  reasons: Array<Pick<DecisionReason, "code" | "message" | "facts" | "remediation">>;
  priority_hint: number;
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
  goal_risks: GoalRiskLinkRecord[];
  claims: ClaimRecord[];
  runs: RunRecord[];
  evidence: EvidenceRecord[];
  evidence_corrections: EvidenceCorrectionRecord[];
  review_obligations: ReviewObligationRecord[];
  reviews: ReviewRecord[];
  goal_contract_revisions: GoalContractRevisionRecord[];
  coverage_contract_revisions: CoverageContractRevisionRecord[];
  lifecycle_events: GoalLifecycleEventRecord[];
  candidates: CandidateGoalRecord[];
  contract_proposals: ContractProposalRecord[];
  rewires: RewireRecord[];
  clarification_sessions: ClarificationSessionRecord[];
  clarification_turns: ClarificationTurnRecord[];
  goal_tree_proposals: GoalTreeProposalRecord[];
  planning_method_packs: PlanningMethodPack[];
  project_guidance: ProjectGuidanceEntryRecord[];
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
  action_projection: GoalActionProjection;
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
  project_guidance: ProjectGuidanceEntryRecord[];
}

export type CreateGoalInput = import("@adeptify/goalboard-contracts/modules/goals").CreateGoalInput;
export interface ClaimRequest {
  board_id: string;
  goal_id: string;
  action_id?: string;
  action_token?: string;
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
  transition: ActionTransitionReceipt;
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
  projection?: GoalActionProjection | null;
  transition?: ActionTransitionReceipt | null;
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

export type RevalidationDecision = import("@adeptify/goalboard-contracts/modules/goals").GoalRevalidationDecision<ActionTransitionReceipt>;

export const DEFAULT_GOAL_POLICY: GoalPolicy = {
  goal_mode: "preferred",
  required_capabilities: [],
  self_verification: true,
  cross_reviewers: 0,
  adversarial_reviewers: 0,
  human_approval: false,
  max_lease_seconds: 1800,
};
import type { PlanningMethodPack } from "@adeptify/goalboard-contracts/modules/goals";

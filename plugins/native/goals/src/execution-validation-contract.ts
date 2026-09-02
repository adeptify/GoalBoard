import type {
  EvidenceCorrectionRecord,
  EvidenceLocatorContext,
  EvidenceRecord,
} from "@adeptify/goalboard-contracts/modules/evidence-verification";
import type {
  ExecutionClaimRecord,
  ExecutionClaimRole,
  ExecutionRunRecord,
  ExecutionRunState,
} from "@adeptify/goalboard-contracts/modules/execution";
import type {
  GoalLifecycleReason,
  GoalPolicy,
  GoalRecord,
  GoalRelationRecord,
  GoalRiskLinkRecord,
  GoalContractRevisionEffect,
  RiskRecord,
} from "@adeptify/goalboard-contracts/modules/goals";
import type {
  CandidateGoalRecord,
  ContractProposalRecord,
  GoalTreeProposalRecord,
  ReviewObligationRecord,
  ReviewRecord,
  RewireRecord,
} from "@adeptify/goalboard-contracts/modules/governance-collaboration";

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

export interface GoalAction {
  action_id: string;
  actor: GoalActionActor;
  kind: GoalActionKind;
  status: GoalActionStatus;
  target_type: string;
  target_id: string;
  reasons: GoalLifecycleReason[];
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

export interface GoalWorkStateView {
  goal_id: string;
  work_state: GoalWorkState;
  next_action: GoalWorkAction | null;
  active_claim: ExecutionClaimRecord | null;
  active_claim_lease: {
    remaining_seconds: number;
    renewal_window_seconds: number;
    renew_recommended: boolean;
    next_action: "renew_claim" | null;
  } | null;
  active_run: ExecutionRunRecord | null;
  pending_review_roles: Array<"self_verifier" | "cross_reviewer" | "adversarial_reviewer" | "human_approver">;
  child_goal_ids: string[];
  reasons: GoalLifecycleReason[];
}

export interface ClaimRequest {
  board_id: string;
  goal_id: string;
  action_id?: string;
  action_token?: string;
  actor_id: string;
  role?: ExecutionClaimRole;
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

export interface ClaimDecision {
  allowed: boolean;
  observed_event_cursor: number;
  reasons: GoalLifecycleReason[];
  claim: ExecutionClaimRecord | null;
  replayed: boolean;
}

export interface ClaimRenewResult {
  claim: ExecutionClaimRecord;
  replayed: boolean;
  observed_event_cursor: number;
  transition: ActionTransitionReceipt;
}

export interface ClaimRunDecision {
  allowed: boolean;
  observed_event_cursor: number;
  reasons: GoalLifecycleReason[];
  claim: ExecutionClaimRecord | null;
  run: ExecutionRunRecord | null;
  work_state: GoalWorkStateView | null;
  projection?: GoalActionProjection | null;
  transition?: ActionTransitionReceipt | null;
  replayed: boolean;
}

export interface ClaimEndInput {
  board_id: string;
  claim_id: string;
  actor_id: string;
  reason: string;
  idempotency_key: string;
}

export interface ClaimReleaseHandoff {
  action: "read_available";
  tool: "goalboard_v1_available";
  read_requires_user_confirmation: false;
  continuation_scope: "current_user_authority";
}

export interface ClaimReleaseResult {
  claim: ExecutionClaimRecord;
  replayed: boolean;
  observed_event_cursor: number;
  handoff: ClaimReleaseHandoff;
  transition: ActionTransitionReceipt;
}

export interface ClaimRevokeResult {
  claim: ExecutionClaimRecord;
  replayed: boolean;
  observed_event_cursor: number;
  transition: ActionTransitionReceipt;
}

export interface StartRunInput {
  board_id: string;
  claim_id: string;
  actor_id: string;
  idempotency_key: string;
}

export interface StartRunResult {
  run: ExecutionRunRecord;
  replayed: boolean;
  observed_event_cursor: number;
}

export interface ReportRunInput {
  board_id: string;
  run_id: string;
  actor_id: string;
  state: ExecutionRunState;
  block_reason?: string | null;
  output_refs?: string[];
  discovery_refs?: string[];
  contract_revision?: number;
  action_token?: string;
  idempotency_key: string;
}

export interface ReportRunResult {
  run: ExecutionRunRecord;
  replayed: boolean;
  observed_event_cursor: number;
  transition?: ActionTransitionReceipt;
}

export interface RequestGoalReworkInput {
  board_id: string;
  goal_id: string;
  actor_id: string;
  criterion_ids: string[];
  reason: string;
  evidence_refs: string[];
  idempotency_key: string;
}

export interface RequestGoalReworkResult {
  goal: GoalRecord;
  rework_request_id: string;
  criterion_ids: string[];
  evidence_refs: string[];
  replayed: boolean;
  observed_event_cursor: number;
  transition: ActionTransitionReceipt;
}

export interface SubmitEvidenceInput {
  board_id: string;
  goal_id: string;
  actor_id: string;
  criterion_ids: string[];
  run_id?: string | null;
  review_id?: string | null;
  kind: EvidenceRecord["kind"];
  locator: string;
  locator_context?: EvidenceLocatorContext;
  digest?: string | null;
  result: EvidenceRecord["result"];
  contract_revision?: number;
  action_token?: string;
  idempotency_key: string;
}

export interface SubmitEvidenceResult {
  evidence: EvidenceRecord;
  replayed: boolean;
  observed_event_cursor: number;
  transition: ActionTransitionReceipt;
}

export interface CorrectEvidenceInput {
  board_id: string;
  goal_id: string;
  actor_id: string;
  target_evidence_id: string;
  action: EvidenceCorrectionRecord["action"];
  replacement_evidence_id?: string | null;
  reason: string;
  idempotency_key: string;
}

export interface CorrectEvidenceResult {
  correction: EvidenceCorrectionRecord;
  target_evidence: EvidenceRecord;
  replacement_evidence: EvidenceRecord | null;
  replayed: boolean;
  observed_event_cursor: number;
  transition: ActionTransitionReceipt;
}

export interface SubmitReviewInput {
  board_id: string;
  goal_id: string;
  obligation_id: string;
  actor_id: string;
  actor_kind?: "user" | "runtime";
  verdict: ReviewRecord["verdict"];
  evidence_refs?: string[];
  reasoning: string;
  contract_revision?: number;
  action_token?: string;
  idempotency_key: string;
}

export interface SubmitReviewResult {
  review: ReviewRecord;
  replayed: boolean;
  observed_event_cursor: number;
  transition: ActionTransitionReceipt;
}

export interface SubmitHumanReviewInput {
  board_id: string;
  goal_id: string;
  obligation_id: string;
  attention_token: string;
  verdict: "approve" | "request_changes";
  exact_user_quote: string;
  user_id: string;
  session_id: string;
  message_id: string;
  idempotency_key: string;
}

export interface SubmitHumanReviewResult {
  evidence: EvidenceRecord;
  review: ReviewRecord;
  transition: ActionTransitionReceipt;
  observed_event_cursor: number;
  replayed: boolean;
}

/** Optional snapshot reuse is host-only and avoids rebuilding the same page projection. */
export interface ExecutionValidationQueryApi<TSnapshot = unknown> {
  getGoalWorkState(input: { board_id: string; goal_id: string }): GoalWorkStateView;
  getGoalWorkStates(input: { board_id: string; snapshot?: TSnapshot }): GoalWorkStateView[];
  getGoalActionProjection(input: { board_id: string; goal_id: string }): GoalActionProjection;
  getGoalActionProjections(input: { board_id: string; snapshot?: TSnapshot }): GoalActionProjection[];
}

export interface ExecutionValidationCommandApi {
  claimGoal(input: ClaimRequest): ClaimDecision;
  renewClaim(input: ClaimRenewRequest): ClaimRenewResult;
  selectGoalAndStart(input: ClaimRequest): ClaimRunDecision;
  releaseClaim(input: ClaimEndInput): ClaimReleaseResult;
  revokeClaim(input: ClaimEndInput): ClaimRevokeResult;
  startRun(input: StartRunInput): StartRunResult;
  requestGoalRework(input: RequestGoalReworkInput): RequestGoalReworkResult;
  reportRun(input: ReportRunInput): ReportRunResult;
  submitEvidence(input: SubmitEvidenceInput): SubmitEvidenceResult;
  correctEvidence(input: CorrectEvidenceInput): CorrectEvidenceResult;
  submitReview(input: SubmitReviewInput): SubmitReviewResult;
  submitHumanReview(input: SubmitHumanReviewInput): SubmitHumanReviewResult;
}

/** Application-level composition over Goals, Execution, Evidence, and Governance public APIs. */
export interface ExecutionValidationApplicationApi<TSnapshot = unknown> {
  readonly query: ExecutionValidationQueryApi<TSnapshot>;
  readonly commands: ExecutionValidationCommandApi;
}

/** Read-only shape used by Action Projection without exposing a Store implementation. */
export interface ExecutionValidationSnapshot {
  cursor: number;
  goals: GoalRecord[];
  relations: GoalRelationRecord[];
  risks: RiskRecord[];
  goal_risks: GoalRiskLinkRecord[];
  claims: ExecutionClaimRecord[];
  runs: ExecutionRunRecord[];
  evidence: EvidenceRecord[];
  review_obligations: ReviewObligationRecord[];
  reviews: ReviewRecord[];
  goal_contract_revisions: Array<{
    goal_id: string;
    revision: number;
    effect: GoalContractRevisionEffect;
  }>;
  coverage_contract_revisions: Array<{
    parent_goal_id: string;
    child_goal_id: string;
    parent_contract_revision: number;
    child_contract_revision: number;
  }>;
  lifecycle_events: Array<{
    seq: number;
    type: string;
    object_type: string;
    object_id: string;
    payload: Record<string, unknown>;
    at: string;
  }>;
  candidates: CandidateGoalRecord[];
  contract_proposals: ContractProposalRecord[];
  rewires: RewireRecord[];
  goal_tree_proposals: GoalTreeProposalRecord[];
}

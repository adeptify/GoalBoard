import type { GoalPolicy } from "./goals.js";
import type { ContractDescriptor } from "../platform/package.js";

export const modulesExecutionContract = {
  contractId: "io.goalboard.module.execution.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/modules/execution.md",
} as const satisfies ContractDescriptor;

export type ExecutionClaimRole =
  | "clarifier"
  | "executor"
  | "self_verifier"
  | "cross_reviewer"
  | "adversarial_reviewer"
  | "revalidator";

export type ExecutionClaimState = "active" | "released" | "expired" | "revoked";
export type ExecutionRunState = "started" | "blocked" | "completed" | "failed" | "abandoned";
export type ExecutionActionKind =
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

export interface ExecutionClaimRecord {
  claim_id: string;
  board_id: string;
  goal_id: string;
  actor_id: string;
  role: ExecutionClaimRole;
  contract_revision: number;
  action_kind: ExecutionActionKind | null;
  action_target_id: string | null;
  state: ExecutionClaimState;
  capabilities: string[];
  goal_mode_attestation: boolean;
  resolved_policy: GoalPolicy;
  claimed_at: string;
  expires_at: string;
  renewed_at: string | null;
  released_at: string | null;
  release_reason: string | null;
}

export interface ExecutionRunRecord {
  run_id: string;
  board_id: string;
  goal_id: string;
  claim_id: string;
  actor_id: string;
  role: ExecutionClaimRole;
  state: ExecutionRunState;
  block_reason: string | null;
  output_refs: string[];
  discovery_refs: string[];
  started_at: string;
  ended_at: string | null;
}

export interface AuthorizedExecutionClaimInput {
  board_id: string;
  goal_id: string;
  actor_id: string;
  role: ExecutionClaimRole;
  contract_revision: number;
  action_id?: string | null;
  action_kind: ExecutionActionKind | null;
  action_target_id: string | null;
  capabilities: string[];
  goal_mode_attestation: boolean;
  resolved_policy: GoalPolicy;
  lease_seconds: number;
  reason: string;
}

export interface RenewExecutionClaimInput {
  board_id: string;
  claim_id: string;
  actor_id: string;
  lease_seconds?: number;
}

export interface EndExecutionClaimInput {
  board_id: string;
  claim_id: string;
  actor_id: string;
  reason: string;
  active_run_reason?: string;
}

export interface StartExecutionRunInput {
  board_id: string;
  claim_id: string;
  actor_id: string;
}

export interface ReportExecutionRunInput {
  board_id: string;
  run_id: string;
  actor_id: string;
  state: ExecutionRunState;
  block_reason?: string | null;
  output_refs?: string[];
  discovery_refs?: string[];
}

export interface ExecutionClaimEndResult {
  claim: ExecutionClaimRecord;
  abandoned_run_ids: string[];
  observed_event_cursor: number;
}

export interface ExecutionRunReportResult {
  run: ExecutionRunRecord;
  released_claim: ExecutionClaimRecord | null;
  observed_event_cursor: number;
}

export interface ExecutionRunWithClaim {
  run: ExecutionRunRecord;
  claim: ExecutionClaimRecord;
}

export interface ExecutionQueryApi {
  getClaim(boardId: string, claimId: string): ExecutionClaimRecord | null;
  getRun(boardId: string, runId: string): ExecutionRunRecord | null;
  getRunWithClaim(boardId: string, runId: string): ExecutionRunWithClaim | null;
  listClaims(boardId: string): ExecutionClaimRecord[];
  listRuns(boardId: string): ExecutionRunRecord[];
}

export interface ExecutionCommandApi {
  createAuthorizedClaim(input: AuthorizedExecutionClaimInput): ExecutionClaimRecord;
  renewClaim(input: RenewExecutionClaimInput): ExecutionClaimRecord;
  releaseClaim(input: EndExecutionClaimInput): ExecutionClaimEndResult;
  revokeClaim(input: EndExecutionClaimInput): ExecutionClaimEndResult;
  startRun(input: StartExecutionRunInput): ExecutionRunRecord;
  reportRun(input: ReportExecutionRunInput): ExecutionRunReportResult;
  expirePastClaims(boardId: string, actorId: string): string[];
}

export interface ExecutionApplicationApi {
  query: ExecutionQueryApi;
  commands: ExecutionCommandApi;
}

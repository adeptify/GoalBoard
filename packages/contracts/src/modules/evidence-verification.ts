import type { ContractDescriptor } from "../platform/package.js";

export const modulesEvidenceVerificationContract = {
  contractId: "io.goalboard.module.evidence-verification.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/modules/evidence-verification.md",
} as const satisfies ContractDescriptor;

export type EvidenceKind =
  | "test"
  | "measurement"
  | "artifact"
  | "inspection"
  | "attestation"
  | "human_verdict";

export type EvidenceResult = "passed" | "failed" | "inconclusive";
export type EvidenceLocatorStatus = "verified" | "unverified";
export type EvidenceLifecycleState = "effective" | "superseded" | "retracted";
export type EvidenceCorrectionAction = "supersede" | "retract";

export interface EvidenceCorrectionRecord {
  correction_id: string;
  board_id: string;
  goal_id: string;
  target_evidence_id: string;
  action: EvidenceCorrectionAction;
  replacement_evidence_id: string | null;
  actor_id: string;
  reason: string;
  created_at: string;
}

export interface EvidenceRecord {
  evidence_id: string;
  board_id: string;
  goal_id: string;
  contract_revision: number;
  criterion_ids: string[];
  producer_actor_id: string;
  run_id: string | null;
  review_id: string | null;
  kind: EvidenceKind;
  locator: string;
  locator_status: EvidenceLocatorStatus;
  locator_validation_reason: string;
  locator_checked_at: string | null;
  /** Opaque catalog identity for the Runtime workspace used by verified project locators. */
  locator_workspace_id: string | null;
  digest: string | null;
  captured_at: string;
  result: EvidenceResult;
  /** Derived from the immutable correction ledger; the Evidence row itself is never rewritten. */
  lifecycle_state: EvidenceLifecycleState;
  correction: EvidenceCorrectionRecord | null;
  /** Old rows that cannot be safely attributed remain readable but do not satisfy a current revision. */
  historical_unmapped: boolean;
}

export interface EvidenceLocatorContext {
  /** Host-only validation root; Runtime and Web request schemas must not expose this field. */
  project_root?: string | null;
  workspace_id?: string | null;
}

export interface AuthorizedEvidenceSubmissionInput {
  board_id: string;
  goal_id: string;
  contract_revision: number;
  criterion_ids: string[];
  producer_actor_id: string;
  run_id?: string | null;
  review_id?: string | null;
  kind: EvidenceKind;
  locator: string;
  locator_context?: EvidenceLocatorContext;
  digest?: string | null;
  result: EvidenceResult;
}

export interface CorrectEvidenceInput {
  board_id: string;
  goal_id: string;
  actor_id: string;
  target_evidence_id: string;
  action: EvidenceCorrectionAction;
  replacement_evidence_id?: string | null;
  reason: string;
}

export interface AttachEvidenceReviewInput {
  board_id: string;
  evidence_id: string;
  review_id: string;
}

export interface EvidenceSubmissionResult {
  evidence: EvidenceRecord;
  observed_event_cursor: number;
}

export interface EvidenceCorrectionResult {
  correction: EvidenceCorrectionRecord;
  target_evidence: EvidenceRecord;
  replacement_evidence: EvidenceRecord | null;
  invalidates_passing_evidence: boolean;
  observed_event_cursor: number;
}

export interface EvidenceCriterionCoverageInput {
  board_id: string;
  goal_id: string;
  criterion_id: string;
  compatible_contract_revisions: number[];
}

export interface EvidenceCriteriaCoverageInput {
  board_id: string;
  goal_id: string;
  criterion_ids: string[];
  compatible_contract_revisions: number[];
}

export interface EvidenceReviewReference {
  evidence: EvidenceRecord;
  submitted_event_seq: number;
}

/** Host-only source needed to reopen a verified project locator without exposing it to Runtime schemas. */
export interface EvidenceProjectReferenceSource {
  evidence_id: string;
  board_id: string;
  locator: string;
  locator_status: EvidenceLocatorStatus;
  locator_workspace_root: string | null;
}

export interface EvidenceCoverageProjectionInput {
  goal_id: string;
  compatible_contract_revisions: number[];
  evidence: EvidenceRecord[];
}

export interface EvidenceCriterionProjectionInput {
  criterion_id: string;
  decision_method: string;
  evidence: EvidenceRecord[];
}

export interface EvidenceQueryApi {
  getEvidence(boardId: string, evidenceId: string): EvidenceRecord | null;
  listEvidence(boardId: string): EvidenceRecord[];
  listCorrections(boardId: string): EvidenceCorrectionRecord[];
  getReviewReference(evidenceId: string): EvidenceReviewReference | null;
  getProjectReferenceSource(boardId: string, evidenceId: string): EvidenceProjectReferenceSource | null;
  latestCriterionReworkSeq(boardId: string, goalId: string, criterionId: string): number;
  hasPassingEvidence(input: EvidenceCriterionCoverageInput): boolean;
  uncoveredCriterionIds(input: EvidenceCriteriaCoverageInput): string[];
}

export interface EvidenceCommandApi {
  submitAuthorizedEvidence(input: AuthorizedEvidenceSubmissionInput): EvidenceSubmissionResult;
  correctEvidence(input: CorrectEvidenceInput): EvidenceCorrectionResult;
  attachReview(input: AttachEvidenceReviewInput): EvidenceRecord;
}

export interface EvidenceVerificationApplicationApi {
  query: EvidenceQueryApi;
  commands: EvidenceCommandApi;
}

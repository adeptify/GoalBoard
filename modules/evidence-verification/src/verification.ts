import type {
  EvidenceCriteriaCoverageInput,
  EvidenceCriterionCoverageInput,
  EvidenceQueryApi,
  EvidenceRecord,
  EvidenceProjectReferenceSource,
  EvidenceReviewReference,
  EvidenceCorrectionRecord,
} from "@adeptify/goalboard-contracts/modules/evidence-verification";

import { EvidenceRepository } from "./repository.js";

export class EvidenceVerificationService implements EvidenceQueryApi {
  constructor(readonly repository: EvidenceRepository) {}

  getEvidence(boardId: string, evidenceId: string): EvidenceRecord | null {
    return this.repository.getEvidence(boardId, evidenceId);
  }

  listEvidence(boardId: string): EvidenceRecord[] {
    return this.repository.listEvidence(boardId);
  }

  listCorrections(boardId: string): EvidenceCorrectionRecord[] {
    return this.repository.listCorrections(boardId);
  }

  getReviewReference(evidenceId: string): EvidenceReviewReference | null {
    return this.repository.getReviewReference(evidenceId);
  }

  getProjectReferenceSource(
    boardId: string,
    evidenceId: string,
  ): EvidenceProjectReferenceSource | null {
    return this.repository.getProjectReferenceSource(boardId, evidenceId);
  }

  latestCriterionReworkSeq(boardId: string, goalId: string, criterionId: string): number {
    return this.repository.latestCriterionReworkSeq(boardId, goalId, criterionId);
  }

  hasPassingEvidence(input: EvidenceCriterionCoverageInput): boolean {
    const compatibleRevisions = new Set(input.compatible_contract_revisions);
    if (compatibleRevisions.size === 0) return false;
    const afterEventSeq = this.latestCriterionReworkSeq(
      input.board_id,
      input.goal_id,
      input.criterion_id,
    );
    return this.repository
      .passingEvidenceSubmissions(input.board_id, input.goal_id, afterEventSeq)
      .some((submission) =>
        compatibleRevisions.has(submission.contract_revision) &&
        submission.criterion_ids.includes(input.criterion_id)
      );
  }

  uncoveredCriterionIds(input: EvidenceCriteriaCoverageInput): string[] {
    return unique(input.criterion_ids).filter((criterionId) =>
      !this.hasPassingEvidence({
        board_id: input.board_id,
        goal_id: input.goal_id,
        criterion_id: criterionId,
        compatible_contract_revisions: input.compatible_contract_revisions,
      })
    );
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

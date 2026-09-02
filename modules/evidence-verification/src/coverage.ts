import type {
  EvidenceCoverageProjectionInput,
  EvidenceCriterionProjectionInput,
  EvidenceRecord,
} from "@adeptify/goalboard-contracts/modules/evidence-verification";

export function currentEffectiveEvidence(
  input: EvidenceCoverageProjectionInput,
): EvidenceRecord[] {
  const compatibleRevisions = new Set(input.compatible_contract_revisions);
  return input.evidence.filter((evidence) =>
    evidence.goal_id === input.goal_id &&
    compatibleRevisions.has(evidence.contract_revision) &&
    evidence.lifecycle_state === "effective" &&
    !evidence.historical_unmapped
  );
}

export function criterionHasPassingResult(
  input: EvidenceCriterionProjectionInput,
): boolean {
  const evidence = input.evidence
    .filter((item) => item.criterion_ids.includes(input.criterion_id))
    .sort((left, right) =>
      left.captured_at.localeCompare(right.captured_at) ||
      left.evidence_id.localeCompare(right.evidence_id)
    );
  if (input.decision_method === "human_decision") {
    return evidence.filter((item) => item.kind === "human_verdict").at(-1)?.result === "passed";
  }
  return evidence.some((item) => item.result === "passed");
}

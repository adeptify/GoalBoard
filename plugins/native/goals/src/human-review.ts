import { createHash } from "node:crypto";
import type { GoalRecord } from "@adeptify/goalboard-contracts/modules/goals";
import type { ReviewObligationRecord } from "@adeptify/goalboard-contracts/modules/governance-collaboration";
import type { ExecutionValidationSnapshot as BoardSnapshot } from "./execution-validation-contract.js";
import { compatibleContractRevisions } from "./contract-revisions.js";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

export function humanReviewAttentionToken(
  goal: GoalRecord,
  obligation: ReviewObligationRecord,
  snapshot: BoardSnapshot,
): string {
  const compatibleRevisions = compatibleContractRevisions(goal, snapshot);
  const evidence = snapshot.evidence
    .filter((item) =>
      item.goal_id === goal.goal_id &&
      compatibleRevisions.has(item.contract_revision) &&
      item.lifecycle_state === "effective"
    )
    .map((item) => ({
      evidence_id: item.evidence_id,
      criterion_ids: item.criterion_ids,
      kind: item.kind,
      result: item.result,
      digest: item.digest,
    }))
    .sort((left, right) => left.evidence_id.localeCompare(right.evidence_id));
  const digest = createHash("sha256").update(JSON.stringify(stable({
    goal_id: goal.goal_id,
    contract_revision: goal.current_contract_revision,
    obligation_id: obligation.obligation_id,
    criterion_scope: [...obligation.criterion_scope].sort(),
    evidence,
  }))).digest("hex").slice(0, 32);
  return `attention-${digest}`;
}

export function dialogueEvidenceDigest(exactUserQuote: string): string {
  return createHash("sha256").update(exactUserQuote).digest("hex");
}

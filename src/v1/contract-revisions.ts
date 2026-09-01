import type { BoardSnapshot, GoalRecord } from "./types.js";

/**
 * Metadata-only revisions change how a Goal is described, not the work that
 * proves it. Return the contiguous revision range that may share work facts.
 * A revalidate or rework revision always starts a new range.
 */
export function compatibleContractRevisions(
  goal: GoalRecord,
  snapshot: BoardSnapshot,
): Set<number> {
  let base = goal.current_contract_revision;
  while (base > 1) {
    const record = snapshot.goal_contract_revisions.find((candidate) =>
      candidate.goal_id === goal.goal_id && candidate.revision === base
    );
    if (!record || record.effect !== "metadata") break;
    base -= 1;
  }
  return new Set(Array.from(
    { length: goal.current_contract_revision - base + 1 },
    (_, index) => base + index,
  ));
}

export function contractRevisionIsCompatible(
  goal: GoalRecord,
  snapshot: BoardSnapshot,
  revision: number,
): boolean {
  return compatibleContractRevisions(goal, snapshot).has(revision);
}

export function actionContractRevision(goal: GoalRecord, snapshot: BoardSnapshot): number {
  return Math.min(...compatibleContractRevisions(goal, snapshot));
}

import type { GoalRecord } from "@adeptify/goalboard-contracts/modules/goals";
import type { ExecutionValidationSnapshot as BoardSnapshot } from "./execution-validation-contract.js";

/**
 * An open parent with all currently known children complete still needs a
 * clarification pass: current children being done does not prove that the
 * user's whole parent outcome has been covered.
 */
export function requiresParentCompletionConfirmation(
  goal: GoalRecord,
  snapshot: BoardSnapshot,
): boolean {
  if (
    goal.fulfillment_state !== "unmet" ||
    (goal.decomposition_state !== "abstract" && goal.decomposition_state !== "frontier_open")
  ) {
    return false;
  }
  const childIds = snapshot.relations
    .filter(
      (relation) =>
        relation.type === "part_of" &&
        relation.state === "active" &&
        relation.to_goal_id === goal.goal_id,
    )
    .map((relation) => relation.from_goal_id);
  if (childIds.length === 0) return false;
  const childrenById = new Map(snapshot.goals.map((candidate) => [candidate.goal_id, candidate]));
  return childIds.every((childId) => childrenById.get(childId)?.fulfillment_state === "satisfied");
}

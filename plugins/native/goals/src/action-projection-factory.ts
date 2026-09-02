import { createHash } from "node:crypto";

import type {
  GoalLifecycleReason as DecisionReason,
  GoalRecord,
} from "@adeptify/goalboard-contracts/modules/goals";

import type {
  GoalAction,
  GoalActionKind,
} from "./execution-validation-contract.js";

const ACTION_PRIORITY: Record<GoalActionKind, number> = {
  repair: 10,
  revise: 20,
  renew: 31,
  execute: 75,
  revalidate: 41,
  clarify: 50,
  review: 60,
  submit_evidence: 70,
  mitigate_risk: 70,
  accept_risk: 70,
  release: 80,
  wait: 90,
};

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)]),
    );
  }
  return value;
}

export function actionProjectionDigest(value: unknown, length = 32): string {
  return createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex")
    .slice(0, length);
}

export function actionProjectionReason(
  code: string,
  subjectType: string,
  subjectId: string,
  message: string,
  remediation?: string,
  facts?: Record<string, unknown>,
): DecisionReason {
  return {
    code,
    severity: code.startsWith("wait.") ? "info" : code.startsWith("action.") ? "warning" : "blocker",
    subject_type: subjectType,
    subject_id: subjectId,
    message,
    ...(facts ? { facts } : {}),
    ...(remediation ? { remediation } : {}),
  };
}

export function createGoalAction(
  goal: GoalRecord,
  actor: GoalAction["actor"],
  kind: GoalActionKind,
  status: GoalAction["status"],
  targetType: string,
  targetId: string,
  reasons: DecisionReason[] = [],
): GoalAction {
  return {
    action_id: `action-${actionProjectionDigest({
      goal_id: goal.goal_id,
      actor,
      kind,
      target_type: targetType,
      target_id: targetId,
    }, 24)}`,
    actor,
    kind,
    status,
    target_type: targetType,
    target_id: targetId,
    reasons,
  };
}

export function compareGoalActions(left: GoalAction, right: GoalAction): number {
  const priority = (item: GoalAction): number => {
    if (item.kind === "revise" || (item.kind === "review" && item.actor === "user")) {
      return ACTION_PRIORITY.revise;
    }
    if (item.status === "active" && item.kind !== "repair") return 30;
    if (
      item.kind === "execute" &&
      item.reasons.some((reason) =>
        reason.code === "action.rework_requested" || reason.code === "action.contract_rework_required"
      )
    ) return 40;
    return ACTION_PRIORITY[item.kind];
  };
  const leftStatus = left.status === "blocked" ? 0 : left.status === "active" ? 1 : 2;
  const rightStatus = right.status === "blocked" ? 0 : right.status === "active" ? 1 : 2;
  return priority(left) - priority(right)
    || leftStatus - rightStatus
    || left.actor.localeCompare(right.actor)
    || left.target_type.localeCompare(right.target_type)
    || left.target_id.localeCompare(right.target_id)
    || left.action_id.localeCompare(right.action_id);
}

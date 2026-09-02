import { createHash } from "node:crypto";
import type {
  ClaimReleaseHandoff,
  GoalAction,
} from "@adeptify/goalboard-plugin-goals";
import type { DecisionReason } from "./types.js";

export const CLAIMABLE_GOAL_ACTION_KINDS = new Set<GoalAction["kind"]>([
  "clarify",
  "execute",
  "submit_evidence",
  "review",
  "revalidate",
  "mitigate_risk",
]);

export const CLAIM_RELEASE_HANDOFF: ClaimReleaseHandoff = Object.freeze({
  action: "read_available",
  tool: "goalboard_v1_available",
  read_requires_user_confirmation: false,
  continuation_scope: "current_user_authority",
});

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function executionValidationRequestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

export function uniqueExecutionValues<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function executionValidationReason(
  code: string,
  subjectType: string,
  subjectId: string,
  message: string,
  facts?: Record<string, unknown>,
  remediation?: string,
): DecisionReason {
  return {
    code,
    severity: "blocker",
    subject_type: subjectType,
    subject_id: subjectId,
    message,
    ...(facts ? { facts } : {}),
    ...(remediation ? { remediation } : {}),
  };
}

export function compareExecutionValidationReasons(
  left: DecisionReason,
  right: DecisionReason,
): number {
  return (
    left.code.localeCompare(right.code) ||
    left.subject_type.localeCompare(right.subject_type) ||
    left.subject_id.localeCompare(right.subject_id)
  );
}

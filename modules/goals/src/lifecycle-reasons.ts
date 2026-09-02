import type {
  GoalLifecycleReason,
} from "@adeptify/goalboard-contracts/modules/goals";

import type { GoalsCommandContext } from "./command-support.js";
import { rowJson, rowText } from "./repository.js";

type Row = Record<string, unknown>;

export function dependencyReasons(
  context: GoalsCommandContext,
  boardId: string,
  goalId: string,
  mode: "revalidate" | "complete",
): GoalLifecycleReason[] {
  const dependencies = context.repository.db.prepare(`
    SELECT g.goal_id, g.title, g.fulfillment_state, g.validity_state
    FROM goal_relations r
    JOIN goals g ON g.goal_id = r.to_goal_id
    WHERE r.board_id = ? AND r.from_goal_id = ?
      AND r.type = 'depends_on' AND r.state = 'active'
    ORDER BY g.goal_id
  `).all(boardId, goalId) as Row[];
  const reasons: GoalLifecycleReason[] = [];
  for (const dependency of dependencies) {
    const dependencyId = rowText(dependency.goal_id);
    if (rowText(dependency.fulfillment_state) !== "satisfied") {
      reasons.push(lifecycleReason(
        "dependency.unsatisfied",
        "dependency",
        dependencyId,
        mode === "revalidate"
          ? `前置 Goal「${rowText(dependency.title)}」还未完成，不能恢复可信状态`
          : `前置 Goal「${rowText(dependency.title)}」尚未完成，不能完成当前 Goal`,
        mode === "revalidate" ? { dependency_goal_id: dependencyId } : undefined,
      ));
    }
    if (rowText(dependency.validity_state) !== "valid") {
      reasons.push(lifecycleReason(
        "dependency.not_valid",
        "dependency",
        dependencyId,
        mode === "revalidate"
          ? `前置 Goal「${rowText(dependency.title)}」当前不可信`
          : `前置 Goal「${rowText(dependency.title)}」当前不可信，不能完成当前 Goal`,
        { validity_state: rowText(dependency.validity_state) },
      ));
    }
  }
  return reasons;
}

export function completionRiskReasons(
  context: GoalsCommandContext,
  goalId: string,
): GoalLifecycleReason[] {
  const rows = context.repository.db.prepare(`
    SELECT risk.risk_id, risk.description, risk.blocking_mode, risk.state,
      risk.revisit_condition, risk.owner, risk.affected_surfaces_json
    FROM risks risk
    JOIN goal_risks goal_risk ON goal_risk.risk_id = risk.risk_id
    WHERE goal_risk.goal_id = ?
      AND risk.blocking_mode IN ('completion', 'invalidate_on_trigger')
      AND risk.state IN ('open', 'triggered')
    ORDER BY risk.risk_id
  `).all(goalId) as Row[];
  return rows.map((row) => lifecycleReason(
    "risk.blocks_completion",
    "risk",
    rowText(row.risk_id),
    rowText(row.description),
    {
      blocking_mode: rowText(row.blocking_mode),
      state: rowText(row.state),
      owner: rowText(row.owner),
      scope: "direct_goal",
      goal_id: goalId,
      association: "goal_risks",
      affected_surfaces: rowJson<string[]>(row.affected_surfaces_json, []),
    },
    rowText(row.revisit_condition),
  ));
}

export function lifecycleReason(
  code: string,
  subjectType: string,
  subjectId: string,
  message: string,
  facts?: Record<string, unknown>,
  remediation?: string,
): GoalLifecycleReason {
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

export function compareLifecycleReasons(
  left: GoalLifecycleReason,
  right: GoalLifecycleReason,
): number {
  return left.code.localeCompare(right.code)
    || left.subject_type.localeCompare(right.subject_type)
    || left.subject_id.localeCompare(right.subject_id);
}


import type {
  GoalAction,
  GoalActionProjection,
  GoalDisplayStatus,
  GoalRecord,
} from "../v1/types.js";
import { L } from "./i18n.js";

export const GOAL_DISPLAY_STATUSES: readonly GoalDisplayStatus[] = [
  "continue",
  "in_progress",
  "waiting_user",
  "waiting",
  "blocked",
  "completed",
];

const STATUS_LABELS: Record<GoalDisplayStatus, string> = {
  continue: "可继续",
  in_progress: "进行中",
  waiting_user: "等你",
  waiting: "等待中",
  blocked: "受阻",
  completed: "已完成",
};

function actionLabel(action: GoalAction | null): string {
  if (!action) return L("查看结果");
  switch (action.kind) {
    case "clarify": return action.target_type === "coverage" ? L("重新核对目标覆盖") : L("继续澄清");
    case "execute":
      return action.reasons.some((reason) => reason.code === "action.rework_requested")
        ? L("继续修改")
        : action.reasons.some((reason) => reason.code === "action.contract_rework_required")
          ? L("按新要求修改")
          : L("开始推进");
    case "submit_evidence": return L("补齐完成依据");
    case "revise":
      return action.target_type === "coverage"
        ? L("确认目标覆盖")
        : action.target_type === "goal_tree_proposal" || action.target_type === "candidate" || action.target_type === "rewire"
          ? L("处理待确认事项")
          : L("确认新要求");
    case "review": return action.actor === "user" ? L("完成验收") : L("开始复核");
    case "revalidate": return L("重新验证");
    case "mitigate_risk": return L("处理风险");
    case "accept_risk": return L("接受或拒绝风险");
    case "release": return L("修复工作交接");
    case "renew": return L("续期当前工作");
    case "repair": return L("修复状态");
    case "wait": return L("查看等待条件");
  }
}

function summary(goal: GoalRecord, projection: GoalActionProjection): string {
  const action = projection.primary_action;
  const reason = action?.reasons[0]?.message;
  if (reason) return reason;
  switch (projection.display_status) {
    case "continue": return L("下一步已经明确：{action}", { action: actionLabel(action) });
    case "in_progress": return L("工作已经开始，当前进度和结果会继续保留");
    case "waiting_user": return L("Runtime 能做的部分已经结束，现在轮到你决定");
    case "waiting": return L("正在等待前置结果，满足后会自动继续计算");
    case "blocked": return L("当前没有安全的继续动作，请先处理状态异常");
    case "completed": return L("{title} 已满足当前要求", { title: goal.title });
  }
}

export interface GoalActionPresentation {
  status: GoalDisplayStatus;
  status_label: string;
  action_label: string;
  summary: string;
}

export function presentGoalAction(
  goal: GoalRecord,
  projection: GoalActionProjection,
): GoalActionPresentation {
  return {
    status: projection.display_status,
    status_label: L(STATUS_LABELS[projection.display_status]),
    action_label: actionLabel(projection.primary_action),
    summary: summary(goal, projection),
  };
}

export function goalDisplayStatusLabel(status: GoalDisplayStatus): string {
  return L(STATUS_LABELS[status]);
}

import type { BoardSnapshot, GoalRecord, GoalWorkState } from "../v1/types.js";
import { requiresParentCompletionConfirmation } from "../v1/parent-completion.js";
import { L } from "./i18n.js";

export type GoalPresentationState =
  | GoalWorkState
  | "clarification_decision_pending"
  | "compound_closure_pending"
  | "handoff_pending";

export interface WorkStateExplanation {
  label: string;
  meaning: string;
  nextAction: string;
  howToContinue: string;
  actionKind:
    | "clarify"
    | "close_parent"
    | "decide"
    | "choose_child"
    | "start"
    | "view_progress"
    | "resolve_blocker"
    | "review"
    | "revalidate"
    | "archive"
    | "restore"
    | "none";
}

interface WorkStateCopy {
  label: string;
  meaning: string;
  nextAction: string;
  howToContinue: string;
  actionKind: WorkStateExplanation["actionKind"];
}

const WORK_STATE_COPY: Record<GoalPresentationState, WorkStateCopy> = {
  clarification_pending: {
    label: "目标待澄清",
    meaning: "这条 Goal 还只是草稿，现在不能开始执行。",
    nextAction: "补全并确认这条 Goal",
    howToContinue: "说明想要的结果、工作范围和怎样才算完成。",
    actionKind: "clarify",
  },
  clarification_decision_pending: {
    label: "待你确认",
    meaning: "方案已经整理好，采用前仍保留原草稿，暂时不能开始。",
    nextAction: "查看并决定这份方案",
    howToContinue: "在待决定中查看会改什么，然后选择采用或退回修改。",
    actionKind: "decide",
  },
  compound_closure_pending: {
    label: "待确认父目标",
    meaning: "现有子 Goal 都完成了，但父 Goal 仍标记为尚未拆完，所以不会自动完成。",
    nextAction: "确认当前拆分是否完整",
    howToContinue: "如果这些子 Goal 已覆盖整个目标，就确认由它们共同完成；否则继续补充遗漏的子 Goal。",
    actionKind: "close_parent",
  },
  handoff_pending: {
    label: "正在收尾",
    meaning: "当前结果已经提交，系统正在结束这一阶段。",
    nextAction: "等待进入下一步",
    howToContinue: "不用重新提交；收尾完成后会进入检查或完成判断。",
    actionKind: "none",
  },
  clarifying: {
    label: "目标澄清中",
    meaning: "这条 Goal 正在补全关键信息，还没有成为可执行工作。",
    nextAction: "继续回答关键问题",
    howToContinue: "补上仍会影响结果、范围或完成标准的信息。",
    actionKind: "clarify",
  },
  clarification_blocked: {
    label: "目标澄清受阻",
    meaning: "缺少必要信息或决定，所以暂时不能完成目标说明。",
    nextAction: "先解决目标说明的卡点",
    howToContinue: "查看被挡住的原因，再补信息或完成对应决定。",
    actionKind: "resolve_blocker",
  },
  waiting_children: {
    label: "等待子 Goal",
    meaning: "这项工作由子 Goal 共同完成，不直接执行这个上层 Goal。",
    nextAction: "选择一个可以开始的子 Goal",
    howToContinue: "进入具体子 Goal，查看它的下一步并从那里打开终端。",
    actionKind: "choose_child",
  },
  execution_pending: {
    label: "待执行",
    meaning: "目标和完成标准已经确认，现在可以开始推进。",
    nextAction: "开始推进这条 Goal",
    howToContinue: "在这条 Goal 下打开终端，或让 Runtime 领取后开始工作。",
    actionKind: "start",
  },
  executing: {
    label: "执行中",
    meaning: "已经有人或 Runtime 在处理这条 Goal。",
    nextAction: "查看最新进展",
    howToContinue: "继续当前工作，或查看最近结果、卡点和完成依据。",
    actionKind: "view_progress",
  },
  execution_blocked: {
    label: "执行受阻",
    meaning: "当前有未解决的依赖、风险或决定，工作不能继续。",
    nextAction: "先解除当前阻塞",
    howToContinue: "查看具体原因，完成前置工作或处理等待你的决定。",
    actionKind: "resolve_blocker",
  },
  completion_pending: {
    label: "待完成",
    meaning: "执行、完成依据和所需复核都已完成，不需要重新执行。",
    nextAction: "运行完成判定",
    howToContinue: "让 Runtime 直接重试完成判定；不要重新领取或重复执行这条 Goal。",
    actionKind: "start",
  },
  completion_blocked: {
    label: "完成受阻",
    meaning: "工作和复核已经完成，但仍有完成门禁没有解除。",
    nextAction: "处理完成门禁",
    howToContinue: "查看具体风险或决定，按恢复条件处理后再运行完成判定；不要重新执行。",
    actionKind: "resolve_blocker",
  },
  review_pending: {
    label: "待复核",
    meaning: "工作结果已经提交，但还没有完成所需检查。",
    nextAction: "检查结果是否达到完成标准",
    howToContinue: "对照完成标准和已有依据，提交通过或需要修改的结论。",
    actionKind: "review",
  },
  reviewing: {
    label: "复核中",
    meaning: "检查者正在判断结果是否达到完成标准。",
    nextAction: "等待或继续完成检查",
    howToContinue: "查看检查进展；如果由你检查，就对照标准提交结论。",
    actionKind: "review",
  },
  review_blocked: {
    label: "复核受阻",
    meaning: "当前缺少检查所需的结果、依据或检查者。",
    nextAction: "补齐检查需要的内容",
    howToContinue: "查看具体卡点，补交结果或依据，再重新检查。",
    actionKind: "resolve_blocker",
  },
  revalidation_pending: {
    label: "待重新验证",
    meaning: "依赖、风险或目标事实发生了变化，旧结论不能直接沿用。",
    nextAction: "重新确认这条 Goal 仍然成立",
    howToContinue: "检查变化后的目标、依赖、风险和已有依据。",
    actionKind: "revalidate",
  },
  revalidating: {
    label: "重新验证中",
    meaning: "当前正在核对变化是否影响这条 Goal 和已有结果。",
    nextAction: "完成变化后的核对",
    howToContinue: "提交新的核对依据，说明这条 Goal 是否仍然有效。",
    actionKind: "revalidate",
  },
  revalidation_blocked: {
    label: "重新验证受阻",
    meaning: "缺少核对变化所需的信息、依赖结果或风险处理。",
    nextAction: "补齐重新确认需要的内容",
    howToContinue: "查看具体卡点，先补信息或处理关联事项。",
    actionKind: "resolve_blocker",
  },
  invalidated: {
    label: "已失效",
    meaning: "新的事实已经让这条 Goal 或已有结果失效。",
    nextAction: "查看失效原因并决定后续处理",
    howToContinue: "确认发生了什么，再创建替代工作或恢复成立条件。",
    actionKind: "resolve_blocker",
  },
  satisfied: {
    label: "已完成",
    meaning: "完成标准和所需检查已经满足。",
    nextAction: "查看结果或归档这条 Goal",
    howToContinue: "确认结果不再需要日常关注后，可以把它归档。",
    actionKind: "archive",
  },
  trashed: {
    label: "回收站",
    meaning: "这条 Goal 已从日常列表移除，但内容和历史仍然保留。",
    nextAction: "按需要恢复这条 Goal",
    howToContinue: "确认仍要继续这项工作后，把它恢复到 Goal Tree。",
    actionKind: "restore",
  },
  archived: {
    label: "已归档",
    meaning: "这条 Goal 已完成并退出日常工作列表，完整记录仍然保留。",
    nextAction: "查看结果或恢复到日常列表",
    howToContinue: "通常不需要操作；需要继续关注时再恢复。",
    actionKind: "restore",
  },
};

function proposalStillNeedsDecision(state: string, itemStates: readonly string[]): boolean {
  return (state === "pending" || state === "partially_applied") &&
    itemStates.some((itemState) => itemState === "pending" || itemState === "conflict");
}

export function goalPresentationState(
  workState: GoalWorkState,
  goal: GoalRecord,
  snapshot: BoardSnapshot,
  reasons: readonly { code: string }[] = [],
): GoalPresentationState {
  const isClarificationState = ["clarification_pending", "clarifying", "clarification_blocked"].includes(workState);
  if (isClarificationState && goal.definition_state === "draft") {
    const hasContractDecision = snapshot.contract_proposals.some(
      (proposal) => proposal.goal_id === goal.goal_id && proposal.state === "pending",
    );
    const hasGoalTreeDecision = snapshot.goal_tree_proposals.some((proposal) => {
      if (
        proposal.origin !== "native" ||
        !proposalStillNeedsDecision(proposal.state, proposal.items.map((item) => item.state))
      ) {
        return false;
      }
      if (proposal.root_goal_id === goal.goal_id) return true;
      if (!proposal.discovered_in_run_id) return false;
      return snapshot.runs.some(
        (run) => run.run_id === proposal.discovered_in_run_id && run.goal_id === goal.goal_id,
      );
    });
    if (hasContractDecision || hasGoalTreeDecision) return "clarification_decision_pending";
  }

  if (
    workState === "clarification_pending" &&
    requiresParentCompletionConfirmation(goal, snapshot)
  ) {
    return "compound_closure_pending";
  }

  if (reasons.some((reason) => reason.code === "work.handoff_pending")) {
    return "handoff_pending";
  }

  return workState;
}

export function explainWorkState(state: GoalPresentationState): WorkStateExplanation {
  const copy = WORK_STATE_COPY[state];
  return {
    label: L(copy.label),
    meaning: L(copy.meaning),
    nextAction: L(copy.nextAction),
    howToContinue: L(copy.howToContinue),
    actionKind: copy.actionKind,
  };
}

export interface ParentCompletionExplanation {
  label: string;
  meaning: string;
  tone: "automatic" | "needs_confirmation" | "conflict";
}

export function explainParentCompletion(
  goal: GoalRecord,
  completedChildren: number,
  totalChildren: number,
): ParentCompletionExplanation {
  if (goal.definition_state === "accepted" && goal.decomposition_state === "closed_compound") {
    return goal.fulfillment_state === "satisfied"
      ? {
          label: L("父 Goal 已自动完成"),
          meaning: L("所有子 Goal 都已完成，这条父 Goal 也已自动完成。"),
          tone: "automatic",
        }
      : {
          label: L("子 Goal 完成后自动完成"),
          meaning: L("还剩 {count} 个子 Goal；全部完成后，这条父 Goal 会自动完成。", {
            count: Math.max(0, totalChildren - completedChildren),
          }),
          tone: "automatic",
        };
  }

  if (goal.decomposition_state === "abstract" || goal.decomposition_state === "frontier_open") {
    return completedChildren === totalChildren
      ? {
          label: L("现有子 Goal 已完成，父目标待确认"),
          meaning: L("当前列出的子 Goal 都完成了，但拆分还没有确认结束。先确认它们是否已经覆盖整个父目标。"),
          tone: "needs_confirmation",
        }
      : {
          label: L("当前拆分尚未确认结束"),
          meaning: L("先推进现有子 Goal；完成后仍要确认是否还有遗漏，父 Goal 不会自动完成。"),
          tone: "needs_confirmation",
        };
  }

  return {
    label: L("父子结构需要确认"),
    meaning: L("这条 Goal 被标记为可以独立完成，却同时包含子 Goal。先确认它应作为叶子，还是改为由子 Goal 共同完成。"),
    tone: "conflict",
  };
}

export type HumanDecisionKind = "contract" | "candidate" | "rewire" | "review" | "risk";

interface DecisionCopy {
  question: string;
  purpose: string;
  insufficientEvidence: string;
}

const DECISION_COPY: Record<HumanDecisionKind, DecisionCopy> = {
  contract: {
    question: "这条 Goal 已经说清楚，可以开始了吗？",
    purpose: "确认后，目标、范围和完成标准会成为正式依据。",
    insufficientEvidence: "现在还不能可靠推荐确认。请先补齐目标、范围、完成标准或字段来源。",
  },
  candidate: {
    question: "要把这项新发现的工作加入 Goal Tree 吗？",
    purpose: "决定它是否需要成为一条独立 Goal，而不是留在当前工作的范围里。",
    insufficientEvidence: "现在还不能可靠推荐加入。请先说明它为什么超出原 Goal，以及独立完成能交付什么。",
  },
  rewire: {
    question: "要调整这些 Goal 的先后或归属关系吗？",
    purpose: "决定 Goal 之间实际的先后顺序或归属，已有执行中的工作不会被改绑。",
    insufficientEvidence: "现在还不能可靠推荐调整。请先补充关系方向、依据和拒绝后的影响。",
  },
  review: {
    question: "这份结果达到完成标准了吗？",
    purpose: "你的结论会决定结果通过、退回修改，还是因为依据不足暂不判断。",
    insufficientEvidence: "现在还不能可靠判断。请先补充与完成标准对应的结果或依据。",
  },
  risk: {
    question: "这个风险要现在处理、接受，还是暂缓？",
    purpose: "你的选择会决定风险是否继续阻止相关 Goal 完成。",
    insufficientEvidence: "现在还不能可靠推荐处理方式。请先补充触发条件、影响和可行的处理办法。",
  },
};

export function explainDecision(kind: HumanDecisionKind): DecisionCopy {
  const copy = DECISION_COPY[kind];
  return {
    question: L(copy.question),
    purpose: L(copy.purpose),
    insufficientEvidence: L(copy.insufficientEvidence),
  };
}

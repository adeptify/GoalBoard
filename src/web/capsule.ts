import type { AvailableGoal, EvidenceRecord, GoalAction, RunRecord } from "../v1/types.js";
import { L, clientI18nScript, htmlLang } from "./i18n.js";
import {
  countGoalDecisions,
  type GoalBoardWebView,
  type WebGoalView,
  type WebProjectNavigation,
} from "./render.js";
import { THEME_BOOTSTRAP_SCRIPT } from "@adeptify/goalboard-design-system";
import { renderDesktopCapsuleShell } from "@adeptify/goalboard-app-desktop";

export type CapsuleStateKind =
  | "working"
  | "checking"
  | "needs_you"
  | "blocked"
  | "complete"
  | "ready"
  | "waiting"
  | "empty";

export interface CapsuleState {
  kind: CapsuleStateKind;
  label: string;
  goal_id: string | null;
  goal_title: string;
  goal_path: string;
  action_label: string;
  action_path: string;
  status_since: string | null;
  why: string;
  just_completed: string;
  current: string;
  blocker: string;
  next: string;
  running_count: number;
  additional_running: number;
  menu_bar_title: string;
  menu_bar_tooltip: string;
}

export type CapsuleTabKind =
  | "waiting_user"
  | "in_progress"
  | "continue"
  | "waiting"
  | "blocked"
  | "completed";

export interface CapsuleGoalItem {
  goal_id: string;
  goal_title: string;
  goal_path: string;
  tab_kind: CapsuleTabKind;
  kind: CapsuleStateKind;
  status_label: string;
  status_since: string | null;
  why: string;
  just_completed: string | null;
  current: string;
  blocker: string | null;
  next_step: string;
  next: string;
  action_label: string;
  action_path: string;
  has_active_run: boolean;
}

export interface CapsuleTab {
  kind: CapsuleTabKind;
  label: string;
  tone: CapsuleStateKind;
  items: CapsuleGoalItem[];
}

export interface CapsuleSnapshot {
  observed_event_cursor: number;
  project: WebProjectNavigation;
  state: CapsuleState;
  tabs: CapsuleTab[];
  default_tab: CapsuleTabKind | null;
  default_goal_id: string | null;
}

function newestRun(item: WebGoalView): RunRecord | null {
  return [...item.runs]
    .filter((run) => run.state === "started" || run.state === "blocked")
    .sort((left, right) => right.started_at.localeCompare(left.started_at))[0] ?? null;
}

function newestPassedEvidence(item: WebGoalView): EvidenceRecord | null {
  return [...item.evidence]
    .filter((evidence) => evidence.result === "passed" && evidence.lifecycle_state === "effective")
    .sort((left, right) => right.captured_at.localeCompare(left.captured_at))[0] ?? null;
}

function evidenceSummary(item: WebGoalView): string | null {
  const evidence = newestPassedEvidence(item);
  if (!evidence) return null;
  return evidence.digest?.trim() || L("一项完成依据已经通过检查");
}

function activeGoalViews(view: GoalBoardWebView): WebGoalView[] {
  return view.goals.filter((item) => item.display_status === "in_progress");
}

function latestGoalActivity(item: WebGoalView): string {
  return [
    item.goal.updated_at,
    ...item.runs
      .filter((run) => run.state === "started" || run.state === "blocked")
      .map((run) => run.started_at),
    ...item.review_obligations
      .filter((obligation) => obligation.state === "pending")
      .map((obligation) => obligation.created_at),
    ...item.events.map((event) => event.at),
  ].sort().at(-1) ?? "";
}

function newestFirst(items: WebGoalView[]): WebGoalView[] {
  return [...items].sort((left, right) =>
    latestGoalActivity(right).localeCompare(latestGoalActivity(left)) ||
    left.goal.goal_id.localeCompare(right.goal.goal_id)
  );
}

function recentCompletedGoal(
  view: GoalBoardWebView,
  now: Date,
  visibleForMs: number,
): { item: WebGoalView; at: string } | null {
  const newestEvents = [...view.events].sort((left, right) => right.seq - left.seq);
  for (const event of newestEvents) {
    if (event.type !== "goal.satisfied") continue;
    const at = Date.parse(event.at);
    if (!Number.isFinite(at) || now.getTime() - at < 0 || now.getTime() - at > visibleForMs) continue;
    const item = [...view.goals, ...view.archived_goals]
      .find((candidate) => candidate.goal.goal_id === event.object_id);
    if (item) return { item, at: event.at };
  }
  return null;
}

function goalPath(view: GoalBoardWebView, goalId: string): string {
  return `${view.route_prefix}/goals/${encodeURIComponent(goalId)}`;
}

function decisionPath(view: GoalBoardWebView, goalId: string): string {
  return `${view.route_prefix}/decisions#decision-goal-${encodeURIComponent(goalId)}`;
}

function projectPath(view: GoalBoardWebView): string {
  return view.route_prefix || "/";
}

function goalWhy(item: WebGoalView): string {
  return item.goal.why.trim() || item.goal.outcome.trim() || L("这项目标还没有补充说明");
}

function primaryBlocker(item: WebGoalView): { message: string; remediation: string | null } {
  const reason = item.reasons.find((candidate) => candidate.severity === "blocker") ?? item.reasons[0];
  const run = item.active_claim == null
    ? null
    : item.runs.find((candidate) =>
        candidate.claim_id === item.active_claim?.claim_id &&
        (candidate.state === "started" || candidate.state === "blocked"),
      ) ?? null;
  return {
    message: reason?.message?.trim() || run?.block_reason?.trim() || L("打开目标详情查看具体原因"),
    remediation: reason?.remediation?.trim() || null,
  };
}

function itemBase(
  view: GoalBoardWebView,
  item: WebGoalView,
  input: Omit<CapsuleGoalItem, "goal_id" | "goal_title" | "goal_path" | "why" | "just_completed">,
): CapsuleGoalItem {
  return {
    goal_id: item.goal.goal_id,
    goal_title: item.goal.title,
    goal_path: goalPath(view, item.goal.goal_id),
    why: goalWhy(item),
    just_completed: evidenceSummary(item),
    ...input,
  };
}

function decisionItem(view: GoalBoardWebView, item: WebGoalView, decisionCount: number): CapsuleGoalItem {
  const actionPath = decisionCount > 0
    ? decisionPath(view, item.goal.goal_id)
    : goalPath(view, item.goal.goal_id);
  return itemBase(view, item, {
    tab_kind: "waiting_user",
    kind: "needs_you",
    status_label: item.status_label,
    status_since: null,
    current: item.action_summary,
    blocker: L("完成这一步前，相关工作不会继续"),
    next_step: item.main_action_label,
    next: decisionCount > 0
      ? L("打开对应事项，确认采用、修改或拒绝")
      : item.action_summary,
    action_label: item.main_action_label,
    action_path: actionPath,
    has_active_run: newestRun(item) !== null,
  });
}

function activeTone(action: GoalAction | null): CapsuleStateKind {
  return action?.kind === "review" || action?.kind === "revalidate" ? "checking" : "working";
}

function activeItem(view: GoalBoardWebView, item: WebGoalView): CapsuleGoalItem {
  const run = newestRun(item);
  return itemBase(view, item, {
    tab_kind: "in_progress",
    kind: activeTone(item.action_projection.primary_action),
    status_label: item.status_label,
    status_since: run?.started_at ?? null,
    current: item.action_summary,
    blocker: null,
    next_step: item.main_action_label,
    next: L("打开这条 Goal，查看最新进展和下一步。"),
    action_label: item.main_action_label,
    action_path: goalPath(view, item.goal.goal_id),
    has_active_run: run !== null,
  });
}

function availableItem(
  view: GoalBoardWebView,
  item: WebGoalView,
): CapsuleGoalItem {
  return itemBase(view, item, {
    tab_kind: "continue",
    kind: "ready",
    status_label: item.status_label,
    status_since: null,
    current: item.action_summary,
    blocker: null,
    next_step: item.main_action_label,
    next: item.action_summary,
    action_label: item.main_action_label,
    action_path: goalPath(view, item.goal.goal_id),
    has_active_run: false,
  });
}

function blockedItem(view: GoalBoardWebView, item: WebGoalView): CapsuleGoalItem {
  const blocker = primaryBlocker(item);
  return itemBase(view, item, {
    tab_kind: "blocked",
    kind: "blocked",
    status_label: item.status_label,
    status_since: null,
    current: item.action_summary,
    blocker: blocker.message,
    next_step: blocker.remediation ?? item.main_action_label,
    next: blocker.remediation ?? item.action_summary,
    action_label: item.main_action_label,
    action_path: goalPath(view, item.goal.goal_id),
    has_active_run: false,
  });
}

function waitingItem(view: GoalBoardWebView, item: WebGoalView): CapsuleGoalItem {
  return itemBase(view, item, {
    tab_kind: "waiting",
    kind: "waiting",
    status_label: item.status_label,
    status_since: null,
    current: item.action_summary,
    blocker: null,
    next_step: item.main_action_label,
    next: item.action_summary,
    action_label: item.main_action_label,
    action_path: goalPath(view, item.goal.goal_id),
    has_active_run: false,
  });
}

function completeItem(view: GoalBoardWebView, item: WebGoalView, at: string): CapsuleGoalItem {
  return itemBase(view, item, {
    tab_kind: "completed",
    kind: "complete",
    status_label: item.status_label,
    status_since: at,
    current: L("这项目标已满足全部完成条件"),
    blocker: null,
    next_step: L("查看完成结果"),
    next: L("确认结果符合预期后，可以继续下一项工作"),
    action_label: L("查看结果"),
    action_path: goalPath(view, item.goal.goal_id),
    has_active_run: false,
  });
}

const TAB_ORDER: CapsuleTabKind[] = [
  "waiting_user",
  "in_progress",
  "continue",
  "waiting",
  "blocked",
  "completed",
];

function tabMeta(kind: CapsuleTabKind): Pick<CapsuleTab, "label" | "tone"> {
  switch (kind) {
    case "waiting_user": return { label: L("等你"), tone: "needs_you" };
    case "in_progress": return { label: L("进行中"), tone: "working" };
    case "continue": return { label: L("可继续"), tone: "ready" };
    case "waiting": return { label: L("等待中"), tone: "waiting" };
    case "blocked": return { label: L("受阻"), tone: "blocked" };
    case "completed": return { label: L("已完成"), tone: "complete" };
  }
}

function menuBarTitle(tabs: CapsuleTab[], selected: CapsuleGoalItem): string {
  const tab = tabs.find((candidate) => candidate.kind === selected.tab_kind);
  const count = tab?.items.length ?? 1;
  return count > 1 ? L("{label} · {count}", { label: tab?.label ?? selected.status_label, count }) : selected.status_label;
}

function stateFromItem(
  view: GoalBoardWebView,
  tabs: CapsuleTab[],
  selected: CapsuleGoalItem,
  runningCount: number,
): CapsuleState {
  const title = menuBarTitle(tabs, selected);
  return {
    kind: selected.kind,
    label: selected.status_label,
    goal_id: selected.goal_id,
    goal_title: selected.goal_title,
    goal_path: selected.goal_path,
    action_label: selected.action_label,
    action_path: selected.action_path,
    status_since: selected.status_since,
    why: selected.why,
    just_completed: selected.just_completed ?? L("还没有新的完成记录"),
    current: selected.current,
    blocker: selected.blocker ?? L("目前没有需要你处理的事项"),
    next: selected.next,
    running_count: runningCount,
    additional_running: Math.max(0, runningCount - (selected.has_active_run ? 1 : 0)),
    menu_bar_title: title,
    menu_bar_tooltip: `${view.project?.display_name ?? L("当前项目")} · ${selected.goal_title} · ${title}`,
  };
}

export function buildCapsuleSnapshot(
  view: GoalBoardWebView,
  available: AvailableGoal[],
  now = new Date(),
  completionDisplayMs = 10_000,
): CapsuleSnapshot {
  if (!view.project) throw new Error("工作胶囊必须从具体项目读取状态");
  const active = activeGoalViews(view);
  const runningCount = active.filter((item) => {
    const run = newestRun(item);
    return run !== null;
  }).length;
  const canonicalFocus = view.snapshot.board.active_goal_id;
  const assigned = new Set<string>();
  const items: CapsuleGoalItem[] = [];
  const decisionCounts = new Map(
    view.goals.map((item) => [item.goal.goal_id, countGoalDecisions(view, item.goal.goal_id)]),
  );
  const decisionItems = newestFirst(
    view.goals.filter((item) => item.display_status === "waiting_user"),
  ).map((item) => {
    assigned.add(item.goal.goal_id);
    return decisionItem(view, item, decisionCounts.get(item.goal.goal_id) ?? 0);
  });
  items.push(...decisionItems);

  const activeOrdered = newestFirst(active.filter((item) => !assigned.has(item.goal.goal_id)));
  if (canonicalFocus) {
    const focusIndex = activeOrdered.findIndex((item) => item.goal.goal_id === canonicalFocus);
    if (focusIndex > 0) activeOrdered.unshift(activeOrdered.splice(focusIndex, 1)[0]!);
  }
  const activeItems = activeOrdered.map((item) => {
    assigned.add(item.goal.goal_id);
    return activeItem(view, item);
  });
  items.push(...activeItems);

  const completed = recentCompletedGoal(view, now, completionDisplayMs);
  const completedItem = completed && !assigned.has(completed.item.goal.goal_id)
    ? completeItem(view, completed.item, completed.at)
    : null;
  if (completedItem) {
    assigned.add(completedItem.goal_id);
    items.push(completedItem);
  }

  const availableOrder = new Map<string, number>();
  available.forEach((candidate, index) => {
    if (!availableOrder.has(candidate.goal.goal_id)) availableOrder.set(candidate.goal.goal_id, index);
  });
  const continueGoals = view.goals
    .filter((item) => item.display_status === "continue" && !assigned.has(item.goal.goal_id))
    .sort((left, right) =>
      (availableOrder.get(left.goal.goal_id) ?? Number.MAX_SAFE_INTEGER) -
        (availableOrder.get(right.goal.goal_id) ?? Number.MAX_SAFE_INTEGER) ||
      right.goal.priority - left.goal.priority ||
      left.goal.goal_id.localeCompare(right.goal.goal_id)
    );
  const availableItems: CapsuleGoalItem[] = [];
  for (const item of continueGoals) {
    assigned.add(item.goal.goal_id);
    const projected = availableItem(view, item);
    availableItems.push(projected);
    items.push(projected);
  }

  const blockedItems = newestFirst(view.goals.filter((item) =>
    !assigned.has(item.goal.goal_id) &&
    item.display_status === "blocked"
  )).map((item) => {
    assigned.add(item.goal.goal_id);
    return blockedItem(view, item);
  });
  items.push(...blockedItems);

  const waitingItems = newestFirst(view.goals.filter((item) =>
    !assigned.has(item.goal.goal_id) && item.display_status === "waiting"
  )).map((item) => {
    assigned.add(item.goal.goal_id);
    return waitingItem(view, item);
  });
  items.push(...waitingItems);

  const grouped = new Map<CapsuleTabKind, CapsuleGoalItem[]>();
  for (const item of items) {
    const group = grouped.get(item.tab_kind) ?? [];
    group.push(item);
    grouped.set(item.tab_kind, group);
  }
  const tabs = TAB_ORDER.flatMap((kind): CapsuleTab[] => {
    const group = grouped.get(kind);
    return group?.length ? [{ kind, ...tabMeta(kind), items: group }] : [];
  });
  const selected = decisionItems[0] ?? activeItems[0] ?? completedItem ?? availableItems[0] ?? blockedItems[0] ?? waitingItems[0] ?? null;
  if (selected) {
    return {
      observed_event_cursor: view.snapshot.cursor,
      project: view.project,
      state: stateFromItem(view, tabs, selected, runningCount),
      tabs,
      default_tab: selected.tab_kind,
      default_goal_id: selected.goal_id,
    };
  }

  const label = L("暂无可开始项");
  return {
    observed_event_cursor: view.snapshot.cursor,
    project: view.project,
    state: {
      kind: "empty",
      label,
      goal_id: null,
      goal_title: L("当前没有聚焦的目标"),
      goal_path: projectPath(view),
      action_label: L("打开 GoalBoard"),
      action_path: projectPath(view),
      status_since: null,
      why: L("当前没有正在执行或可以立即开始的目标"),
      just_completed: L("还没有新的完成记录"),
      current: L("当前没有正在执行的工作"),
      blocker: L("可能仍有前置事项、风险或目标说明需要处理"),
      next: L("打开 GoalBoard 查看哪些条件还没有满足"),
      running_count: 0,
      additional_running: 0,
      menu_bar_title: L("空闲"),
      menu_bar_tooltip: `${view.project.display_name} · ${label}`,
    },
    tabs: [],
    default_tab: null,
    default_goal_id: null,
  };
}


/** Compatibility adapter from the current Web read model into the Desktop-owned shell. */
export function renderCapsuleShell(projects: WebProjectNavigation[]): string {
  return renderDesktopCapsuleShell(projects, {
    translate: L,
    htmlLang: htmlLang(),
    clientI18nScript: clientI18nScript(),
    themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT,
  });
}

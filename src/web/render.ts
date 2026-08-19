import type {
  AcceptanceCriterion,
  BoardSnapshot,
  CandidateGoalRecord,
  ClaimRecord,
  ContractFieldName,
  ContractFieldSource,
  ContractProposalRecord,
  DependencyProposal,
  DecisionReason,
  EvidenceRecord,
  GoalPolicy,
  GoalRecord,
  GoalRelationRecord,
  GoalWorkState,
  ImpactBindingRecord,
  ReviewObligationRecord,
  ReviewRecord,
  RewireRecord,
  RiskRecord,
  RunRecord,
} from "../v1/types.js";
import { DEFAULT_GOAL_POLICY } from "../v1/types.js";
import type { RuntimeIntegrationDetection } from "../install/runtime-integration.js";
import type { GoalBoardWebServiceDetection } from "../install/web-service.js";
import { icon, renderIconSprite, type GoalBoardIcon } from "./icons.js";
import {
  L,
  currentLocale,
  htmlLang,
  dateTimeLocale,
  listJoin,
  renderLocaleSwitch,
  clientI18nScript,
  LOCALE_SWITCH_STYLES,
} from "./i18n.js";
import { appendDesktopQueryToLocalHrefs, withDesktopQuery } from "./desktop-shell.js";

export type WebGoalStatus = GoalWorkState;

export const WEB_GOAL_STATUSES: readonly WebGoalStatus[] = [
  "clarification_pending",
  "clarifying",
  "clarification_blocked",
  "waiting_children",
  "execution_pending",
  "executing",
  "execution_blocked",
  "review_pending",
  "reviewing",
  "review_blocked",
  "revalidation_pending",
  "revalidating",
  "revalidation_blocked",
  "invalidated",
  "satisfied",
  "trashed",
  "archived",
];

export interface WebCoverageItem {
  requirement_id: string;
  statement: string;
  disposition: string;
  owner_goal_id: string | null;
  reason: string | null;
  revisit_condition: string | null;
  blocking: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebInputBinding {
  binding_id: string;
  goal_id: string;
  input_name: string;
  source_type: string;
  source_ref: string;
  snapshot_digest: string | null;
  state: string;
  reason: string;
  created_by: string;
  created_at: string;
}

export interface WebPolicyBinding {
  policy_binding_id: string;
  goal_id: string | null;
  scope: string;
  policy: Partial<GoalPolicy>;
  state: string;
  created_by: string;
  reason: string;
  created_at: string;
}

export interface WebEventRecord {
  seq: number;
  event_id: string;
  actor_id: string;
  type: string;
  object_type: string;
  object_id: string;
  reason: string;
  payload: unknown;
  at: string;
}

export interface WebRiskRecord extends RiskRecord {
  goal_ids: string[];
}

export interface WebGoalView {
  goal: GoalRecord;
  status: WebGoalStatus;
  work_state: GoalWorkState;
  status_label: string;
  reasons: DecisionReason[];
  active_claim_actor: string | null;
  active_claim: ClaimRecord | null;
  claims: ClaimRecord[];
  runs: RunRecord[];
  evidence: EvidenceRecord[];
  review_obligations: ReviewObligationRecord[];
  reviews: ReviewRecord[];
  risks: WebRiskRecord[];
  impacts: ImpactBindingRecord[];
  relations: GoalRelationRecord[];
  coverage: WebCoverageItem[];
  input_bindings: WebInputBinding[];
  policy_bindings: WebPolicyBinding[];
  events: WebEventRecord[];
  resolved_policy: GoalPolicy;
  passed_criteria: string[];
  pending_reviews: string[];
}

export interface WebProjectNavigation {
  project_id: string;
  display_name: string;
  data_class?: "user" | "migrated_user" | "regenerable_demo";
}

export type WebSettingsSection = "runtimes" | "projects" | "diagnostics";

export interface WebSettingsProject extends WebProjectNavigation {
  database_path: string;
  source: "created" | "migrated";
  data_class: "user" | "migrated_user" | "regenerable_demo";
  created_at: string;
}

export interface WebSettingsConnection {
  binding_id: string;
  runtime_id: string;
  runtime_name: string;
  context_label: string;
  project_id: string;
  project_name: string;
  created_at: string;
  updated_at: string;
}

export interface WebSettingsWorkspaceMembership {
  membership_id: string;
  workspace_id: string;
  workspace_name: string;
  realpath_verified: boolean;
  project_id: string;
  project_name: string;
  is_default: boolean;
  updated_at: string;
}

export interface WebInstallationDiagnostics {
  home_directory: string;
  installation_state: "ready" | "missing" | "invalid";
  version: string | null;
  release_directory: string | null;
  project_count: number;
  launchers: Array<{
    name: "CLI" | "MCP" | "Web";
    path: string;
    state: "ready" | "missing";
  }>;
}

export interface GoalBoardSettingsView {
  section: WebSettingsSection;
  runtimes: RuntimeIntegrationDetection[];
  projects: WebSettingsProject[];
  connections: WebSettingsConnection[];
  workspace_memberships: WebSettingsWorkspaceMembership[];
  web_service: GoalBoardWebServiceDetection;
  diagnostics: WebInstallationDiagnostics;
}

export interface GoalBoardWebView {
  snapshot: BoardSnapshot;
  project: WebProjectNavigation | null;
  projects: WebProjectNavigation[];
  /** Empty only for in-process test fixtures; normal Web URLs are project-scoped. */
  route_prefix: string;
  demo: boolean;
  active_goal_id: string | null;
  goals: WebGoalView[];
  archived_goals: WebGoalView[];
  trashed_goals: WebGoalView[];
  counts: Record<WebGoalStatus, number>;
  coverage: WebCoverageItem[];
  input_bindings: WebInputBinding[];
  policy_bindings: WebPolicyBinding[];
  events: WebEventRecord[];
}

const STATUS_LABELS: Record<WebGoalStatus, string> = {
  clarification_pending: "待澄清",
  clarifying: "澄清中",
  clarification_blocked: "澄清受阻",
  waiting_children: "已澄清，等待子 Goal",
  execution_pending: "待执行",
  executing: "执行中",
  execution_blocked: "执行受阻",
  review_pending: "待复核",
  reviewing: "复核中",
  review_blocked: "复核受阻",
  revalidation_pending: "待重新验证",
  revalidating: "重新验证中",
  revalidation_blocked: "重新验证受阻",
  invalidated: "已失效",
  satisfied: "已完成",
  trashed: "已移入回收站",
  archived: "已归档",
};

const STATUS_ICONS: Record<WebGoalStatus, GoalBoardIcon> = {
  clarification_pending: "waiting",
  clarifying: "play",
  clarification_blocked: "blocked",
  waiting_children: "tree",
  execution_pending: "ready",
  executing: "play",
  execution_blocked: "blocked",
  review_pending: "review",
  reviewing: "review",
  review_blocked: "blocked",
  revalidation_pending: "refresh",
  revalidating: "refresh",
  revalidation_blocked: "blocked",
  invalidated: "alert",
  satisfied: "completed",
  trashed: "archive",
  archived: "archive",
};

const RELATION_LABELS: Record<string, { out: string; in: string }> = {
  part_of: { out: "属于", in: "包含" },
  depends_on: { out: "依赖", in: "被依赖" },
  conflicts_with: { out: "冲突于", in: "冲突于" },
  mitigates: { out: "缓解", in: "由此缓解" },
  extends: { out: "扩展", in: "由此扩展" },
  replaces: { out: "替代", in: "被替代" },
  corrects: { out: "修正", in: "被修正" },
  invalidates: { out: "使其失效", in: "被其失效" },
  migrates_from: { out: "迁移自", in: "迁移到" },
};

const RELATION_TYPES: Array<{
  type: GoalRelationRecord["type"];
  label: string;
  description: string;
}> = [
  { type: "part_of", label: "属于 / 包含", description: "只改变 Goal Tree 层级，不要求上级先完成" },
  { type: "depends_on", label: "依赖 / 被依赖", description: "左侧 Goal 必须等待右侧 Goal 完成，是领取与完成门禁" },
  { type: "conflicts_with", label: "冲突", description: "两项工作无法同时成立，或会相互干扰" },
  { type: "mitigates", label: "缓解", description: "左侧 Goal 用来降低右侧风险或负面影响" },
  { type: "extends", label: "扩展", description: "左侧 Goal 在右侧结果上继续增加能力" },
  { type: "replaces", label: "替代", description: "左侧 Goal 将取代右侧 Goal" },
  { type: "corrects", label: "修正", description: "左侧 Goal 修正右侧的错误或偏差" },
  { type: "invalidates", label: "使其失效", description: "左侧 Goal 使右侧事实或结果不再有效" },
  { type: "migrates_from", label: "迁移自", description: "左侧 Goal 从右侧旧实现或旧结构迁移而来" },
];

const REVIEW_LABELS: Record<string, string> = {
  self_verifier: "自检",
  cross_reviewer: "交叉验证",
  adversarial_reviewer: "对抗性验证",
  human_approver: "用户确认",
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function controlTokenMeta(controlToken: string): string {
  return `<meta name="goalboard-control-token" content="${escapeHtml(controlToken)}">`;
}

function dataJson(view: GoalBoardWebView): string {
  const summarize = (items: WebGoalView[]) => items.map((item) => ({
    goal: {
      goal_id: item.goal.goal_id,
      title: item.goal.title,
    },
    status: item.status,
  }));
  return JSON.stringify({
    snapshot: {
      board: { board_id: view.snapshot.board.board_id },
      cursor: view.snapshot.cursor,
    },
    project: view.project,
    active_goal_id: view.active_goal_id,
    goals: summarize(view.goals),
    archived_goals: summarize(view.archived_goals),
    trashed_goals: summarize(view.trashed_goals),
  }).replaceAll("<", "\\u003c");
}

function formatDate(value: string | null | undefined): string {
  if (!value) return L("未记录");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(dateTimeLocale(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function isProjectReference(value: string): boolean {
  const reference = value.trim();
  if (!reference || /^https?:\/\//i.test(reference)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(reference) && !reference.startsWith("project://")) return false;
  const projectPath = reference.startsWith("project://")
    ? reference.slice("project://".length)
    : reference;
  if (!projectPath || /^[\\/]/.test(projectPath)) return false;
  if (projectPath.split(/[\\/]+/).some((segment) => segment === "..")) return false;
  return /[./\\]/.test(reference);
}

function renderReference(value: string, label = value): string {
  if (/^https?:\/\//i.test(value)) {
    return `<a class="inline-ref" href="${escapeHtml(value)}" target="_blank" rel="noreferrer">${icon("external")}<span>${escapeHtml(label)}</span></a>`;
  }
  if (isProjectReference(value)) {
    return `<a class="inline-ref" href="/api/project-references/${encodeURIComponent(value)}" target="_blank" rel="noreferrer" data-project-reference>${icon("external")}<span>${escapeHtml(label)}</span></a>`;
  }
  return `<button class="inline-ref" type="button" data-copy-value="${escapeHtml(value)}" title="${L("复制引用")}">${icon("copy")}<span>${escapeHtml(label)}</span></button>`;
}

function renderList(values: string[], empty: string): string {
  if (values.length === 0) return `<p class="empty-row">${escapeHtml(L(empty))}</p>`;
  return `<ul class="doc-list">${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>`;
}

function renderStatus(status: WebGoalStatus): string {
  return `<span class="goal-status goal-status--${status}">${icon(STATUS_ICONS[status])}<span>${L(STATUS_LABELS[status])}</span></span>`;
}

/** Goal Tree sibling order: work you can pick up, then in-flight, then blocked, then parked. */
export const GOAL_TREE_STATUS_ORDER: readonly WebGoalStatus[] = [
  "execution_pending",
  "executing",
  "review_pending",
  "reviewing",
  "revalidation_pending",
  "revalidating",
  "clarification_pending",
  "clarifying",
  "execution_blocked",
  "review_blocked",
  "revalidation_blocked",
  "clarification_blocked",
  "waiting_children",
  "invalidated",
  "satisfied",
  "archived",
  "trashed",
];

function goalTreeStatusRank(status: string): number {
  const index = (GOAL_TREE_STATUS_ORDER as readonly string[]).indexOf(status);
  return index < 0 ? GOAL_TREE_STATUS_ORDER.length : index;
}

export function sortGoalTreeItems<T extends { status: WebGoalStatus; goal: { priority: number; created_at: string } }>(
  items: T[],
): T[] {
  return [...items].sort(
    (left, right) =>
      goalTreeStatusRank(left.status) - goalTreeStatusRank(right.status) ||
      right.goal.priority - left.goal.priority ||
      left.goal.created_at.localeCompare(right.goal.created_at),
  );
}

function sortGoals(items: WebGoalView[]): WebGoalView[] {
  return sortGoalTreeItems(items);
}

export function activeOutgoingDependsOn(item: WebGoalView): GoalRelationRecord[] {
  return item.relations.filter(
    (relation) =>
      relation.type === "depends_on" &&
      relation.state === "active" &&
      relation.from_goal_id === item.goal.goal_id,
  );
}

export function goalWorkSatisfied(item: WebGoalView): boolean {
  return (
    item.status === "satisfied" ||
    item.status === "archived" ||
    item.goal.fulfillment_state === "satisfied"
  );
}

export function isBlockedWorkStatus(status: WebGoalStatus): boolean {
  return status.endsWith("_blocked") || status === "invalidated";
}

function partOfChildViews(parentId: string, view: GoalBoardWebView): WebGoalView[] {
  return view.snapshot.relations
    .filter(
      (relation) =>
        relation.type === "part_of" &&
        relation.state === "active" &&
        relation.to_goal_id === parentId,
    )
    .map((relation) => findGoalView(view, relation.from_goal_id))
    .filter((item): item is WebGoalView => item != null);
}

export function firstBlockedDescendant(
  item: WebGoalView,
  view: GoalBoardWebView,
  seen = new Set<string>(),
): WebGoalView | null {
  if (seen.has(item.goal.goal_id)) return null;
  seen.add(item.goal.goal_id);
  const children = partOfChildViews(item.goal.goal_id, view);
  const blocked = children.find((child) => isBlockedWorkStatus(child.status));
  if (blocked) return blocked;
  for (const child of children) {
    const nested = firstBlockedDescendant(child, view, seen);
    if (nested) return nested;
  }
  return null;
}

export function unsatisfiedOutgoingDependencies(item: WebGoalView, view: GoalBoardWebView): WebGoalView[] {
  return activeOutgoingDependsOn(item)
    .map((relation) => findGoalView(view, relation.to_goal_id))
    .filter((target): target is WebGoalView => target != null && !goalWorkSatisfied(target));
}

function quotedGoalNames(names: string[]): string {
  const quote = currentLocale() === "en" ? ["“", "”"] as const : ["「", "」"] as const;
  return listJoin(names.map((name) => `${quote[0]}${name}${quote[1]}`));
}

function treeDependencySearchText(item: WebGoalView, view: GoalBoardWebView): string {
  return activeOutgoingDependsOn(item)
    .map((relation) => {
      const target = findGoalView(view, relation.to_goal_id);
      return `${relation.to_goal_id} ${target?.goal.title ?? ""} ${relation.reason}`;
    })
    .join(" ");
}

function renderTreeDependencies(item: WebGoalView, view: GoalBoardWebView): string {
  const relations = activeOutgoingDependsOn(item);
  if (!relations.length) return "";
  return `<div class="tree-deps">${relations
    .map((relation) => {
      const target = findGoalView(view, relation.to_goal_id);
      const title = target?.goal.title ?? relation.to_goal_id;
      const satisfied = target ? goalWorkSatisfied(target) : false;
      const blocked = Boolean(target && isBlockedWorkStatus(target.status));
      const waiters = target && !satisfied ? unsatisfiedOutgoingDependencies(target, view) : [];
      const state = satisfied ? "is-ready" : blocked ? "is-blocked" : "is-waiting";
      const statusLine = satisfied
        ? L("已完成，不再挡住")
        : waiters.length
          ? `${L("还在等它完成")} · ${L("它还要等 {names}", { names: quotedGoalNames(waiters.map((waiter) => waiter.goal.title)) })}`
          : L("还在等它完成");
      return `<button class="tree-dep ${state}" type="button" data-select-goal="${escapeHtml(relation.to_goal_id)}" aria-label="${L("打开依赖")} ${escapeHtml(title)}">
        <span class="tree-dep-mark" aria-hidden="true">${icon("link")}</span>
        <span class="tree-dep-copy"><strong>${escapeHtml(L("依赖"))} → ${escapeHtml(title)}</strong><small>${escapeHtml(relation.reason)}</small><em>${escapeHtml(statusLine)}</em></span>
      </button>`;
    })
    .join("")}</div>`;
}

function renderGoalTree(
  view: GoalBoardWebView,
  selectedGoalId: string,
  items: WebGoalView[] = view.goals,
): string {
  const byId = new Map(items.map((item) => [item.goal.goal_id, item]));
  const children = new Map<string, WebGoalView[]>();
  const parent = new Map<string, string>();
  for (const relation of view.snapshot.relations) {
    if (
      relation.state !== "active" ||
      relation.type !== "part_of" ||
      !byId.has(relation.from_goal_id) ||
      !byId.has(relation.to_goal_id)
    ) continue;
    parent.set(relation.from_goal_id, relation.to_goal_id);
    children.set(relation.to_goal_id, [
      ...(children.get(relation.to_goal_id) ?? []),
      byId.get(relation.from_goal_id)!,
    ]);
  }
  const visited = new Set<string>();
  const renderNode = (item: WebGoalView, depth: number): string => {
    if (visited.has(item.goal.goal_id)) return "";
    visited.add(item.goal.goal_id);
    const nodeChildren = sortGoals(children.get(item.goal.goal_id) ?? []);
    const hasChildren = nodeChildren.length > 0;
    const searchValue = `${item.goal.goal_id} ${item.goal.title} ${treeDependencySearchText(item, view)}`.toLowerCase();
    return `<li class="tree-item${depth > 0 ? "" : " tree-item--root"}" data-tree-item data-goal-id="${escapeHtml(item.goal.goal_id)}" data-goal-search="${escapeHtml(searchValue)}" data-goal-status="${escapeHtml(item.status)}">
      <div class="tree-row">
        ${
          hasChildren
            ? `<button class="tree-toggle" type="button" data-tree-toggle aria-expanded="true" aria-label="${L("折叠")} ${escapeHtml(item.goal.title)}">${icon("chevron-down")}</button>`
            : `<span class="tree-guide" aria-hidden="true"></span>`
        }
        <button class="tree-node${item.goal.goal_id === selectedGoalId ? " is-selected" : ""}" type="button" data-select-goal="${escapeHtml(item.goal.goal_id)}" aria-pressed="${item.goal.goal_id === selectedGoalId}">
          <span class="tree-copy"><strong>${escapeHtml(item.goal.title)}</strong><small>${escapeHtml(item.goal.goal_id)}</small></span>
          ${renderStatus(item.status)}
        </button>
      </div>
      ${renderTreeDependencies(item, view)}
      ${hasChildren ? `<ul class="tree-children">${nodeChildren.map((child) => renderNode(child, depth + 1)).join("")}</ul>` : ""}
    </li>`;
  };
  const roots = sortGoals(items.filter((item) => !parent.has(item.goal.goal_id)));
  const rendered = roots.map((item) => renderNode(item, 0)).join("");
  const leftovers = sortGoals(items.filter((item) => !visited.has(item.goal.goal_id)))
    .map((item) => renderNode(item, 0))
    .join("");
  return `<ul class="goal-tree" data-tree-root>${rendered}${leftovers}</ul>`;
}

function renderTreeStatusFilter(items: readonly WebGoalView[]): string {
  const counts = new Map<WebGoalStatus, number>();
  for (const item of items) counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
  const options = WEB_GOAL_STATUSES.filter((status) => (counts.get(status) ?? 0) > 0);
  return `<section class="tree-filter" id="tree-status-filter" data-tree-filter hidden aria-label="${L("按状态筛选")}">
    <header><strong>${L("按状态筛选")}</strong><button type="button" data-clear-status-filter disabled>${L("清除")}</button></header>
    <p>${L("可同时选择多个状态；会与关键词搜索一起生效。")}</p>
    <div class="tree-filter-options" role="group" aria-label="${L("Goal 状态")}">
      ${options.length ? options.map((status) => `<label class="tree-filter-option"><input type="checkbox" value="${status}" data-status-filter><span>${renderStatus(status)}</span><small>${counts.get(status)}</small></label>`).join("") : `<p class="empty-row">${L("当前没有可筛选的 Goal。")}</p>`}
    </div>
    <p class="tree-filter-summary" data-tree-filter-summary aria-live="polite">${L("显示全部状态")}</p>
  </section>`;
}

function renderTreeChrome(
  view: GoalBoardWebView,
  visibleGoals: readonly WebGoalView[],
  archiveView: boolean,
  trashView: boolean,
  searchPlaceholder: string,
  searchLabel: string,
): string {
  const archiveHref = archiveView ? "/" : "/archive";
  const trashHref = trashView ? "/" : "/trash";
  const archiveLabel = archiveView ? L("返回 Goal Tree") : L("查看已归档 Goal");
  const trashLabel = trashView ? L("返回 Goal Tree") : L("查看回收站");
  const archiveCount = archiveView ? "" : `<small>${view.archived_goals.length}</small>`;
  const trashCount = trashView ? "" : `<small>${view.trashed_goals.length}</small>`;
  const archiveText = archiveView ? L("返回") : L("归档");
  const trashText = trashView ? L("返回") : L("回收站");
  return `<header class="tree-chrome" data-tree-chrome>
    <label class="tree-search">${icon("search")}<input type="search" data-global-search placeholder="${searchPlaceholder}" aria-label="${searchLabel}"><kbd>⌘F</kbd></label>
    <div class="tree-tools">
      <div class="tree-filter-control">
        <button class="tree-tool" type="button" data-tree-filter-trigger aria-expanded="false" aria-controls="tree-status-filter" aria-label="${L("筛选目标")}" title="${L("筛选目标")}">${icon("filter")}<span>${L("状态")}</span></button>
        ${renderTreeStatusFilter(visibleGoals)}
      </div>
        <button class="tree-tool" type="button" data-open-create aria-label="${L("新建目标")}" title="${L("新建目标")}">${icon("plus")}<span>${L("新建")}</span></button>
      <a class="tree-tool${archiveView ? " is-current" : ""}" data-archive-link href="${archiveHref}" aria-label="${archiveLabel}" title="${archiveLabel}"${archiveView ? ' aria-current="page"' : ""}>${icon(archiveView ? "tree" : "archive")}<span>${archiveText}</span>${archiveCount}</a>
      <a class="tree-tool${trashView ? " is-current" : ""}" data-trash-link href="${trashHref}" aria-label="${trashLabel}" title="${trashLabel}"${trashView ? ' aria-current="page"' : ""}>${icon(trashView ? "tree" : "trash")}<span>${trashText}</span>${trashCount}</a>
      <button class="tree-tool" type="button" data-collapse-all aria-label="${L("折叠全部")}" title="${L("折叠全部")}">${icon("tree")}<span>${L("折叠全部")}</span></button>
    </div>
  </header>`;
}

function relationRow(
  relation: GoalRelationRecord,
  item: WebGoalView,
  view: GoalBoardWebView,
): string {
  const outgoing = relation.from_goal_id === item.goal.goal_id;
  const relatedId = outgoing ? relation.to_goal_id : relation.from_goal_id;
  const related = [...view.goals, ...view.archived_goals].find(
    (candidate) => candidate.goal.goal_id === relatedId,
  );
  const relatedName = related?.goal.title ?? relatedId;
  const rawLabels = RELATION_LABELS[relation.type] ?? { out: relation.type, in: relation.type };
  const labels = { out: L(rawLabels.out), in: L(rawLabels.in) };
  const path = outgoing
    ? L("当前 Goal → {type} → {name}", { type: labels.out, name: relatedName })
    : L("{name} → {type} → 当前 Goal", { name: relatedName, type: labels.out });
  const deactivated = item.events.find(
    (event) => event.type === "relation.deactivated" && event.object_id === relation.relation_id,
  );
  const stateLabel = relation.state === "active" ? L("生效") : relation.state === "proposed" ? L("待确认") : L("已解除");
  const deactivateId = `relation-deactivate-${relation.relation_id}`;
  return `<div class="relation-record relation-record--${escapeHtml(relation.state)}" data-relation-id="${escapeHtml(relation.relation_id)}">
    <button class="relation-row" type="button" data-select-goal="${escapeHtml(relatedId)}" aria-label="${L("打开")} ${escapeHtml(relatedName)}">
      <span class="relation-kind">${escapeHtml(outgoing ? labels.out : labels.in)}</span>
      <span class="relation-copy"><strong>${escapeHtml(relatedName)}</strong><small class="relation-goal-id">${escapeHtml(relatedId)}</small><small class="relation-path">${escapeHtml(path)}</small><small class="relation-reason">${L("建立原因：")}${escapeHtml(relation.reason)}${deactivated ? ` · ${L("解除原因：")}${escapeHtml(deactivated.reason)}` : ""}</small></span>
      <span class="relation-state relation-state--${escapeHtml(relation.state)}">${escapeHtml(stateLabel)}</span>
      ${icon("chevron-right")}
    </button>
    ${relation.state === "active" && !item.goal.archived_at ? `<button class="relation-deactivate-open" type="button" data-relation-deactivate-open aria-expanded="false" aria-controls="${escapeHtml(deactivateId)}">${L("解除")}</button>` : ""}
    ${relation.state === "active" && !item.goal.archived_at ? `<form class="relation-deactivate-form" id="${escapeHtml(deactivateId)}" data-relation-deactivate-form data-live-form="relation-deactivate-${escapeHtml(relation.relation_id)}" data-relation-id="${escapeHtml(relation.relation_id)}" hidden>
      <label><span>${L("解除原因")}</span><textarea name="reason" rows="2" required placeholder="${L("说明为什么这条关系不再成立；历史记录会保留")}"></textarea></label>
      <p class="form-error" data-relation-deactivate-error role="alert" hidden></p>
      <footer><button type="button" data-relation-deactivate-cancel>${L("取消")}</button><button class="button-danger" type="submit">${L("确认解除")}</button></footer>
    </form>` : ""}
  </div>`;
}

function relationGroup(
  title: string,
  hint: string,
  relations: GoalRelationRecord[],
  item: WebGoalView,
  view: GoalBoardWebView,
): string {
  return `<section class="relation-group"><header><h3>${escapeHtml(L(title))} <span>${relations.length}</span></h3><p>${escapeHtml(L(hint))}</p></header><div>${
    relations.length
      ? relations.map((relation) => relationRow(relation, item, view)).join("")
      : `<p class="empty-row">${L("暂无关系")}</p>`
  }</div></section>`;
}

function renderRelations(item: WebGoalView, view: GoalBoardWebView): string {
  const relations = item.relations.filter((relation) => relation.state !== "inactive");
  const inactive = item.relations.filter((relation) => relation.state === "inactive");
  const spineTypes = new Set(["depends_on", "part_of"]);
  const upstream = relations.filter(
    (relation) => relation.from_goal_id === item.goal.goal_id && spineTypes.has(relation.type),
  );
  const downstream = relations.filter(
    (relation) => relation.to_goal_id === item.goal.goal_id && spineTypes.has(relation.type),
  );
  const other = relations.filter(
    (relation) => !upstream.includes(relation) && !downstream.includes(relation),
  );
  return `<div class="relation-layout">
    ${relationGroup("上游", "这个 Goal 开始前需要什么", upstream, item, view)}
    ${relationGroup("下游", "哪些 Goal 等待或包含它", downstream, item, view)}
    ${relationGroup("其他关联", "扩展、替代、修正或风险关系", other, item, view)}
  </div>
  ${renderRelationEditor(item, view)}
  ${inactive.length ? `<details class="relation-inactive-history" data-persist-open="inactive-relations-${escapeHtml(item.goal.goal_id)}"><summary><span>${icon("history")}<strong>${L("已解除关系")}</strong><small>${inactive.length} ${L("条，保留方向与变更原因")}</small></span>${icon("chevron-down")}</summary><div>${inactive.map((relation) => relationRow(relation, item, view)).join("")}</div></details>` : ""}
  ${renderResolvedDependencyHistory(item, view)}`;
}

function renderRelationEditor(item: WebGoalView, view: GoalBoardWebView): string {
  if (item.goal.archived_at) return "";
  const targets = sortGoals(view.goals).filter(
    (candidate) => candidate.goal.goal_id !== item.goal.goal_id,
  );
  const editorKey = `relation-editor-${item.goal.goal_id}`;
  if (!targets.length) {
    return `<div class="relation-editor-empty">${icon("link")}<span><strong>${L("还没有可关联的其他 Goal")}</strong><small>${L("先新建另一个 Goal，再回来建立层级、依赖或语义关系。")}</small></span></div>`;
  }
  const targetOptions = targets
    .map(
      (target) =>
        `<option value="${escapeHtml(target.goal.goal_id)}" data-goal-name="${escapeHtml(target.goal.title)}">${escapeHtml(target.goal.title)} · ${escapeHtml(target.goal.goal_id)}</option>`,
    )
    .join("");
  const typeOptions = RELATION_TYPES.map(({ type, label, description }) => {
    const labels = RELATION_LABELS[type];
    return `<option value="${escapeHtml(type)}" data-out-label="${escapeHtml(L(labels.out))}" data-in-label="${escapeHtml(L(labels.in))}" data-description="${escapeHtml(L(description))}">${escapeHtml(L(label))}</option>`;
  }).join("");
  const firstTarget = targets[0]!.goal;
  return `<details class="relation-editor" data-relation-editor data-persist-open="${escapeHtml(editorKey)}" data-live-form="${escapeHtml(editorKey)}">
    <summary><span class="relation-editor-icon">${icon("link")}</span><span><strong>${L("维护关系")}</strong><small>${L("新增关系，或在上方解除已有关系")}</small></span><span class="relation-editor-action">${L("打开编辑器")}</span>${icon("chevron-down")}</summary>
    <form class="relation-form" data-relation-form data-live-form="relation-${escapeHtml(item.goal.goal_id)}" data-goal-id="${escapeHtml(item.goal.goal_id)}" data-current-goal-name="${escapeHtml(item.goal.title)}">
      <div class="relation-authority"><span>${icon("shield")}</span><p><strong>${L("这是用户确认入口")}</strong><small>${L("你在这里提交的关系会直接生效；Runtime 发现的变化仍只能提交 Rewire，并在")}<a href="/decisions">${L("决定中心")}</a>${L("等待你确认。")}</small></p></div>
      <fieldset class="relation-direction-control"><legend>${L("关系从哪里发出")}</legend><div><label><input type="radio" name="direction" value="outgoing" checked><span><strong>${L("当前 Goal → 其他 Goal")}</strong><small>${L("当前 Goal 是关系左侧")}</small></span></label><label><input type="radio" name="direction" value="incoming"><span><strong>${L("其他 Goal → 当前 Goal")}</strong><small>${L("当前 Goal 是关系右侧")}</small></span></label></div></fieldset>
      <div class="relation-builder">
        <label><span>${L("关系类型")}</span><select name="type">${typeOptions}</select></label>
        <label><span>${L("另一个 Goal")}</span><select name="target_goal_id">${targetOptions}</select></label>
      </div>
      <div class="relation-live-preview" data-relation-live-preview><small>${L("方向预览")}</small><strong>${escapeHtml(item.goal.title)} <span>${L("→ 属于 →")}</span> ${escapeHtml(firstTarget.title)}</strong><p>${L("只改变 Goal Tree 层级，不要求上级先完成")}</p></div>
      <label class="relation-reason-field"><span>${L("建立原因")}</span><textarea name="reason" rows="3" required placeholder="${L("说明为什么方向是 A → B，而不是 B → A；这个理由会进入关系历史")}"></textarea></label>
      <p class="form-error" data-relation-error role="alert" hidden></p>
      <footer><p>${L("提交后直接生效并写入事件历史；不会创建或启动 Runtime。")}</p><button class="button-primary" type="submit">${L("建立关系")}</button></footer>
    </form>
  </details>`;
}

function renderClaimCell(item: WebGoalView): string {
  const claim = item.active_claim ?? item.claims.at(-1);
  if (!claim) return `<p class="empty-row">${L("尚未被 Runtime 认领")}</p>`;
  return `<dl class="runtime-facts"><div><dt>Runtime</dt><dd>${escapeHtml(claim.actor_id)}</dd></div><div><dt>${L("角色")}</dt><dd>${escapeHtml(claim.role)}</dd></div><div><dt>${L("状态")}</dt><dd>${escapeHtml(claim.state)}</dd></div><div><dt>Goal Mode</dt><dd>${claim.goal_mode_attestation ? L("已开启") : L("未开启")}</dd></div></dl>`;
}

function renderRunCell(item: WebGoalView): string {
  const run = item.runs.at(-1);
  if (!run) return `<p class="empty-row">${L("认领后可开始执行")}</p>`;
  return `<dl class="runtime-facts"><div><dt>Run</dt><dd>${escapeHtml(run.run_id)}</dd></div><div><dt>${L("状态")}</dt><dd>${escapeHtml(run.state)}</dd></div><div><dt>${L("开始")}</dt><dd>${formatDate(run.started_at)}</dd></div>${
    run.block_reason ? `<div><dt>${L("阻塞")}</dt><dd>${escapeHtml(run.block_reason)}</dd></div>` : ""
  }</dl>${
    run.output_refs.length
      ? `<div class="ref-stack">${run.output_refs.map((ref) => renderReference(ref)).join("")}</div>`
      : ""
  }`;
}

const EVIDENCE_KIND_LABELS: Record<EvidenceRecord["kind"], string> = {
  test: "测试",
  measurement: "测量",
  artifact: "产物",
  inspection: "检查",
  attestation: "人工陈述",
  human_verdict: "人工结论",
};

const EVIDENCE_RESULT_LABELS: Record<EvidenceRecord["result"], string> = {
  passed: "通过",
  failed: "失败",
  inconclusive: "证据不足",
};

function evidenceResultIcon(result: EvidenceRecord["result"]): GoalBoardIcon {
  return result === "passed" ? "completed" : result === "failed" ? "blocked" : "waiting";
}

function renderEvidenceRecord(evidence: EvidenceRecord): string {
  return `<article class="evidence-record">
    <span class="evidence-result evidence-result--${evidence.result}">${icon(evidenceResultIcon(evidence.result))}</span>
    <div><header><strong>${escapeHtml(L(EVIDENCE_KIND_LABELS[evidence.kind]))} · ${escapeHtml(L(EVIDENCE_RESULT_LABELS[evidence.result]))}</strong><button class="record-id" type="button" data-copy-value="${escapeHtml(evidence.evidence_id)}" title="${L("复制 Evidence ID")}">${escapeHtml(evidence.evidence_id)}</button></header>${renderReference(evidence.locator)}<small>${escapeHtml(evidence.producer_actor_id)} · ${formatDate(evidence.captured_at)} · ${escapeHtml(evidence.criterion_ids.join(currentLocale() === "en" ? ", " : "、") || L("未绑定验收项"))}</small>${evidence.digest ? `<p>${escapeHtml(evidence.digest)}</p>` : ""}</div>
  </article>`;
}

function renderEvidenceSubmitForm(item: WebGoalView): string {
  const criteria = item.goal.acceptance_criteria;
  if (item.goal.archived_at || item.goal.trashed_at) return "";
  if (!criteria.length) {
    return `<p class="evidence-submit-note">${L("这条 Goal 还没有验收条件，无法绑定人工 Evidence。请先通过当前 Runtime 或 Draft 流程补齐 Contract。")}</p>`;
  }
  const criterionChoices = criteria
    .map(
      (criterion) =>
        `<label><input type="checkbox" name="criterion_ids" value="${escapeHtml(criterion.criterion_id)}"><span><strong>${escapeHtml(criterion.statement)}</strong><small>${escapeHtml(criterion.criterion_id)}</small></span></label>`,
    )
    .join("");
  const kindChoices = (Object.entries(EVIDENCE_KIND_LABELS) as Array<[EvidenceRecord["kind"], string]>)
    .map(([kind, label]) => `<option value="${kind}"${kind === "attestation" ? " selected" : ""}>${escapeHtml(L(label))}</option>`)
    .join("");
  const resultChoices = (Object.entries(EVIDENCE_RESULT_LABELS) as Array<[EvidenceRecord["result"], string]>)
    .map(([result, label]) => `<option value="${result}"${result === "passed" ? " selected" : ""}>${escapeHtml(L(label))}</option>`)
    .join("");
  return `<details class="evidence-submit" data-persist-open="evidence-submit-${escapeHtml(item.goal.goal_id)}"><summary><span>${icon("evidence")}<strong>${L("提交人工 Evidence")}</strong><small>${L("用户直接记录的验收事实会进入同一完成门禁")}</small></span>${icon("chevron-down")}</summary>
    <form data-evidence-form data-live-form="evidence-${escapeHtml(item.goal.goal_id)}" data-goal-id="${escapeHtml(item.goal.goal_id)}">
      <fieldset class="evidence-criteria"><legend>${L("绑定验收条件")}</legend><div>${criterionChoices}</div></fieldset>
      <div class="evidence-form-row"><label><span>${L("Evidence 类型")}</span><select name="kind">${kindChoices}</select></label><label><span>${L("本次结果")}</span><select name="result">${resultChoices}</select></label></div>
      <label><span>${L("定位引用")}</span><textarea name="locator" rows="2" required placeholder="${L("https://…、project://src/… 或项目内相对路径")}"></textarea><small>${L("HTTP(S) 和安全的项目内相对路径可打开；其他引用会保留为可复制文本。")}</small></label>
      <label><span>${L("补充说明 ")}<small>${L("可选")}</small></span><textarea name="digest" rows="2" placeholder="${L("说明观察到的事实、版本或可复核线索")}"></textarea></label>
      <p class="form-error" data-evidence-error role="alert" hidden></p>
      <footer><span>${L("这条 Evidence 由当前 Web 用户提交，不会伪造 Runtime Run。")}</span><button class="button-primary" type="submit">${L("提交 Evidence")}</button></footer>
    </form>
  </details>`;
}

function renderEvidenceCell(item: WebGoalView): string {
  const records = item.evidence.length
    ? `<div class="evidence-list">${item.evidence.slice().reverse().map(renderEvidenceRecord).join("")}</div>`
    : `<p class="empty-row">${L("尚未提交验收证据")}</p>`;
  return `${records}${renderEvidenceSubmitForm(item)}`;
}

function renderReviewCell(item: WebGoalView): string {
  if (!item.review_obligations.length) return `<p class="empty-row">${L("当前策略不要求额外 Review")}</p>`;
  return `<div class="review-list">${item.review_obligations
    .map((obligation) => {
      const latest = item.reviews
        .filter((review) => review.obligation_id === obligation.obligation_id)
        .at(-1);
      const detail = latest
        ? latest.verdict + " · " + latest.actor_id
        : obligation.state === "waived"
          ? L("已豁免")
          : L("等待提交");
      return `<div class="review-row"><span class="review-state review-state--${obligation.state}"></span><span><strong>${escapeHtml(L(REVIEW_LABELS[obligation.role]) ?? obligation.role)}</strong><small>${escapeHtml(detail)}</small></span></div>`;
    })
    .join("")}</div>`;
}

function renderAcceptance(item: WebGoalView): string {
  if (!item.goal.acceptance_criteria.length) {
    return `<p class="empty-row empty-row--warning">${L("还没有验收条件；这个 Goal 需要继续澄清，暂不能交给执行者。")}</p>`;
  }
  return `<ul class="check-list">${item.goal.acceptance_criteria
    .map((criterion) => {
      const passed = item.passed_criteria.includes(criterion.criterion_id);
      const target = criterion.target == null
        ? L("未设置目标值")
        : Object.keys(criterion.target).length === 1 && "value" in criterion.target
          ? String(criterion.target.value)
          : JSON.stringify(criterion.target);
      return `<li><span class="check-box${passed ? " is-checked" : ""}">${passed ? icon("check") : ""}</span><span><strong>${escapeHtml(criterion.statement)}</strong><small>${L("通过条件：")}${escapeHtml(criterion.pass_condition)}</small><small>${L("判断：")}${escapeHtml(criterion.decision_method)} · ${L("目标：")}${escapeHtml(target)} · ${L("证据：")}${escapeHtml(criterion.required_evidence.join(currentLocale() === "en" ? ", " : "、") || L("未指定"))}</small></span></li>`;
    })
    .join("")}</ul>`;
}

function renderReasons(item: WebGoalView): string {
  const blockers = item.reasons.filter((reason) => reason.severity === "blocker");
  if (!blockers.length) {
    return `<p class="clear-row"><span class="check-box is-checked">${icon("check")}</span>${L("当前没有阻塞项")}</p>`;
  }
  return `<ul class="blocker-list">${blockers
    .map(
      (reason) =>
        `<li>${icon("blocked")}<span><strong>${escapeHtml(reason.message)}</strong>${
          reason.remediation ? `<small>${L("建议：")}${escapeHtml(reason.remediation)}</small>` : ""
        }</span></li>`,
    )
    .join("")}</ul>`;
}

function renderScope(item: WebGoalView): string {
  const blocks = [
    {
      title: L("包含什么"),
      body: renderList(item.goal.in_scope, "尚未记录范围"),
      empty: item.goal.in_scope.length === 0,
    },
    {
      title: L("明确不做"),
      body: renderList(item.goal.out_of_scope, "尚未记录非目标"),
      empty: item.goal.out_of_scope.length === 0,
    },
    {
      title: L("必须遵守"),
      body: renderList(item.goal.constraints, "暂无额外约束"),
      empty: item.goal.constraints.length === 0,
    },
    {
      title: L("需要的输入"),
      body: renderList(item.goal.required_inputs, "暂无前置输入"),
      empty: item.goal.required_inputs.length === 0,
    },
    {
      title: L("承诺的输出"),
      body: renderList(item.goal.promised_outputs, "尚未记录输出"),
      empty: item.goal.promised_outputs.length === 0,
    },
    {
      title: L("绑定资料"),
      body: item.input_bindings.length
        ? `<div class="bound-list">${item.input_bindings.map((binding) => `<article>${renderReference(binding.source_ref, binding.input_name)}<small>${escapeHtml(binding.state)} · ${escapeHtml(binding.reason)}${binding.snapshot_digest ? ` · ${escapeHtml(binding.snapshot_digest)}` : ""}</small></article>`).join("")}</div>`
        : `<p class="empty-row">${L("暂无资料绑定")}</p>`,
      empty: item.input_bindings.length === 0,
    },
    {
      title: L("需求覆盖"),
      body: item.coverage.length
        ? `<div class="bound-list">${item.coverage.map((coverage) => `<article><strong>${escapeHtml(coverage.requirement_id)} · ${escapeHtml(coverage.statement)}</strong><small>${escapeHtml(coverage.disposition)} · ${coverage.blocking ? L("阻塞") : L("非阻塞")}${coverage.reason ? ` · ${escapeHtml(coverage.reason)}` : ""}${coverage.revisit_condition ? ` · ${L("复查：")}${escapeHtml(coverage.revisit_condition)}` : ""}</small></article>`).join("")}</div>`
        : `<p class="empty-row">${L("暂无需求覆盖记录")}</p>`,
      empty: item.coverage.length === 0,
    },
  ];
  const filled = blocks.filter((block) => !block.empty);
  const vacant = blocks.filter((block) => block.empty);
  const sections = (items: typeof blocks) =>
    items.map((block) => `<section><h3>${block.title}</h3>${block.body}</section>`).join("");
  const gaps = vacant.length
    ? `<details class="scope-gaps" data-persist-open="scope-gaps-${escapeHtml(item.goal.goal_id)}"><summary><span><strong>${
        filled.length ? L("还有 {count} 项未写", { count: vacant.length }) : L("范围、输入与输出尚未填写")
      }</strong><small>${escapeHtml(listJoin(vacant.map((block) => block.title)))}</small></span>${icon("chevron-down")}</summary><div class="contract-list">${sections(vacant)}</div></details>`
    : "";
  if (!filled.length) return gaps;
  return `<div class="contract-list">${sections(filled)}</div>${gaps}`;
}

const RISK_STATE_LABELS: Record<RiskRecord["state"], string> = {
  open: "开放",
  triggered: "已触发",
  resolved: "已解决",
  accepted: "已接受",
  expired: "已过期",
};

const RISK_TREATMENT_LABELS: Record<RiskRecord["treatment"], string> = {
  accept: "接受",
  mitigate: "缓解",
  avoid: "规避",
  defer: "延后",
};

const RISK_BLOCKING_LABELS: Record<RiskRecord["blocking_mode"], string> = {
  none: "不阻塞",
  claim: "阻止领取",
  completion: "阻止完成",
  invalidate_on_trigger: "触发后失效",
};

function riskStateEffect(
  blockingMode: RiskRecord["blocking_mode"],
  state: RiskRecord["state"],
): string {
  const active = state === "open" || state === "triggered";
  if (!active) {
    return blockingMode === "invalidate_on_trigger"
      ? L("当前不再使 Goal 失效；若此前触发，关联 Goal 必须重新验证。")
      : L("当前状态不再施加领取或完成门禁。");
  }
  if (blockingMode === "claim") return L("当前会阻止所有关联 Goal 被新的 Runtime 领取。");
  if (blockingMode === "completion") return L("当前会阻止所有关联 Goal 被标记为完成。");
  if (blockingMode === "invalidate_on_trigger") {
    return state === "triggered"
      ? L("Risk 已触发，所有关联 Goal 立即失效。")
      : L("Risk 目前开放；一旦标记为已触发，所有关联 Goal 会失效。");
  }
  return L("这是一条持续观察的事实，不直接阻塞领取或完成。");
}

function riskSelectOptions<T extends string>(
  values: Array<[T, string]>,
  selected: T,
): string {
  return values
    .map(([value, label]) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(L(label))}</option>`)
    .join("");
}

function renderRiskGoalPicker(
  view: GoalBoardWebView,
  selectedGoalIds: string[],
  label: string,
  key: string,
): string {
  const selected = new Set(selectedGoalIds);
  const goals = sortGoals([...view.goals, ...view.archived_goals]);
  return `<details class="risk-goal-picker" data-persist-open="${escapeHtml(key)}">
    <summary><span><strong>${L("受影响 Goal")}</strong><small>${L("{count} 个已选择 · 至少选择一个", { count: selected.size })}</small></span>${icon("chevron-down")}</summary>
    <div><label class="risk-goal-search">${icon("search")}<input type="search" data-risk-goal-filter placeholder="${L("按名称或 ID 筛选")}" aria-label="${L("筛选{label}的受影响 Goal", { label })}"></label>
      <div class="risk-goal-options">${goals.map((item) => `<label data-risk-goal-option data-search="${escapeHtml(`${item.goal.title} ${item.goal.goal_id}`.toLocaleLowerCase())}"><input type="checkbox" name="goal_ids" value="${escapeHtml(item.goal.goal_id)}"${selected.has(item.goal.goal_id) ? " checked" : ""}><span><strong>${escapeHtml(item.goal.title)}</strong><small>${escapeHtml(item.goal.goal_id)}${item.goal.archived_at ? L(" · 已归档") : ""}</small></span></label>`).join("")}</div>
    </div>
  </details>`;
}

function renderRiskFactsForm(
  risk: WebRiskRecord | null,
  currentGoalId: string,
  view: GoalBoardWebView,
): string {
  const treatment = risk?.treatment ?? "mitigate";
  const blockingMode = risk?.blocking_mode ?? "none";
  const formKey = risk?.risk_id ?? `new-${currentGoalId}`;
  return `<label class="risk-form-wide"><span>${L("风险描述")}</span><textarea name="description" rows="2" required placeholder="${L("什么可能使 Goal 无法按 Contract 完成")}">${escapeHtml(risk?.description ?? "")}</textarea></label>
    <label><span>${L("发生概率")}</span><input name="probability" required value="${escapeHtml(risk?.probability ?? "")}" placeholder="${L("低 / 中 / 高，或量化概率")}"></label>
    <label><span>${L("影响程度")}</span><input name="impact" required value="${escapeHtml(risk?.impact ?? "")}" placeholder="${L("低 / 中 / 高，或具体影响")}"></label>
    <label class="risk-form-wide"><span>${L("受影响区域 ")}<small>${L("每行一项")}</small></span><textarea name="affected_surfaces" rows="2" placeholder="${L("例如 src/web 或 onboarding-flow")}">${escapeHtml(risk?.affected_surfaces.join("\n") ?? "")}</textarea></label>
    <label class="risk-form-wide"><span>${L("触发条件")}</span><textarea name="trigger" rows="2" required placeholder="${L("什么事实发生时算 Risk 已触发")}">${escapeHtml(risk?.trigger ?? "")}</textarea></label>
    <label><span>${L("处理方式")}</span><select name="treatment">${riskSelectOptions([["mitigate", "缓解"], ["avoid", "规避"], ["defer", "延后"], ["accept", "接受"]], treatment)}</select></label>
    <label><span>${L("阻塞方式")}</span><select name="blocking_mode" data-risk-blocking-mode>${riskSelectOptions([["none", "不阻塞"], ["claim", "阻止领取"], ["completion", "阻止完成"], ["invalidate_on_trigger", "触发后失效"]], blockingMode)}</select></label>
    <label class="risk-form-wide"><span>${L("复查条件")}</span><textarea name="revisit_condition" rows="2" required placeholder="${L("什么时候需要重新判断这项风险")}">${escapeHtml(risk?.revisit_condition ?? "")}</textarea></label>
    <label><span>${L("负责人")}</span><input name="owner" required value="${escapeHtml(risk?.owner ?? "")}" placeholder="${L("用户、团队或角色")}"></label>
    ${renderRiskGoalPicker(view, risk?.goal_ids ?? [currentGoalId], risk?.description ?? L("新 Risk"), `risk-goals-${formKey}`)}`;
}

function renderRiskGoalLinks(risk: WebRiskRecord, view: GoalBoardWebView): string {
  const goals = risk.goal_ids
    .map((goalId) => [...view.goals, ...view.archived_goals].find((item) => item.goal.goal_id === goalId))
    .filter((item): item is WebGoalView => Boolean(item));
  return goals.length
    ? `<div class="risk-linked-goals">${goals.map((item) => `<a href="${item.goal.archived_at ? "/archive/goals/" : "/goals/"}${encodeURIComponent(item.goal.goal_id)}"><strong>${escapeHtml(item.goal.title)}</strong><small>${escapeHtml(item.goal.goal_id)}</small></a>`).join("")}</div>`
    : '<span class="empty-row">未关联 Goal</span>';
}

function renderRiskRecord(risk: WebRiskRecord, item: WebGoalView, view: GoalBoardWebView): string {
  const readOnly = Boolean(item.goal.archived_at);
  const stateOptions = riskSelectOptions(
    [["open", L("开放")], ["triggered", L("已触发")], ["resolved", L("已解决")], ["accepted", L("已接受")], ["expired", L("已过期")]],
    risk.state,
  );
  return `<article class="risk-record" id="risk-${escapeHtml(risk.risk_id)}">
    <header><span class="risk-record-icon">${icon("risk")}</span><div><span class="risk-state risk-state--${escapeHtml(risk.state)}">${escapeHtml(L(RISK_STATE_LABELS[risk.state]))}</span><h4>${escapeHtml(risk.description)}</h4><small>${escapeHtml(risk.risk_id)} · 更新于 ${formatDate(risk.updated_at)}</small></div></header>
    <dl class="risk-facts">
      <div><dt>${L("概率 / 影响")}</dt><dd>${escapeHtml(risk.probability)} / ${escapeHtml(risk.impact)}</dd></div>
      <div><dt>${L("处理 / 阻塞")}</dt><dd>${escapeHtml(L(RISK_TREATMENT_LABELS[risk.treatment]))} / ${escapeHtml(L(RISK_BLOCKING_LABELS[risk.blocking_mode]))}</dd></div>
      <div class="risk-fact-wide"><dt>${L("触发条件")}</dt><dd>${escapeHtml(risk.trigger)}</dd></div>
      <div class="risk-fact-wide"><dt>${L("复查条件")}</dt><dd>${escapeHtml(risk.revisit_condition)}</dd></div>
      <div><dt>${L("负责人")}</dt><dd>${escapeHtml(risk.owner)}</dd></div>
      <div><dt>${L("受影响区域")}</dt><dd>${risk.affected_surfaces.length ? escapeHtml(risk.affected_surfaces.join(currentLocale() === "en" ? ", " : "、")) : "未单独标记"}</dd></div>
      <div class="risk-fact-wide"><dt>${L("受影响 Goal")}</dt><dd>${renderRiskGoalLinks(risk, view)}</dd></div>
    </dl>
    <p class="risk-effect risk-effect--${escapeHtml(risk.state)}">${icon(risk.state === "triggered" ? "blocked" : "info")}<span><strong>${L("当前影响")}</strong>${escapeHtml(riskStateEffect(risk.blocking_mode, risk.state))}</span></p>
    ${readOnly ? '<p class="risk-readonly">已归档 Goal 中的 Risk 只读展示；恢复 Goal 后可以继续维护。</p>' : `<div class="risk-actions">
      <details data-persist-open="risk-edit-${escapeHtml(risk.risk_id)}"><summary><span>${icon("settings")}<strong>编辑事实</strong></span>${icon("chevron-down")}</summary>
        <form class="risk-form" data-risk-edit-form data-live-form="risk-edit-${escapeHtml(risk.risk_id)}" data-risk-id="${escapeHtml(risk.risk_id)}">
          ${renderRiskFactsForm(risk, item.goal.goal_id, view)}
          <label class="risk-form-wide"><span>${L("修改原因")}</span><textarea name="reason" rows="2" required placeholder="${L("为什么需要更新这项 Risk 的事实或关联 Goal")}"></textarea></label>
          <p class="form-error risk-form-wide" data-risk-error role="alert" hidden></p>
          <footer class="risk-form-wide"><span>状态不会随事实编辑而改变。</span><button class="button-primary" type="submit">保存 Risk 事实</button></footer>
        </form>
      </details>
      <details data-persist-open="risk-state-${escapeHtml(risk.risk_id)}"><summary><span>${icon("history")}<strong>变更状态</strong></span>${icon("chevron-down")}</summary>
        <form class="risk-state-form" data-risk-state-form data-live-form="risk-state-${escapeHtml(risk.risk_id)}" data-risk-id="${escapeHtml(risk.risk_id)}" data-risk-blocking="${escapeHtml(risk.blocking_mode)}">
          <label><span>新状态</span><select name="state" data-risk-state-select>${stateOptions}</select></label>
          <p class="risk-state-preview" data-risk-state-preview>${escapeHtml(riskStateEffect(risk.blocking_mode, risk.state))}</p>
          <label class="risk-form-wide"><span>${L("决定理由")}</span><textarea name="reason" rows="2" required placeholder="${L("说明为什么现在进入这个状态，以及依据是什么")}"></textarea></label>
          <p class="form-error risk-form-wide" data-risk-error role="alert" hidden></p>
          <footer class="risk-form-wide"><button class="button-primary" type="submit">记录状态变化</button></footer>
        </form>
      </details>
    </div>`}
  </article>`;
}

const IMPACT_ACCESS_LABELS: Record<ImpactBindingRecord["access"], string> = {
  read: "读取",
  write: "写入",
  decide: "决策",
  exclusive: "独占",
};

const IMPACT_STATE_LABELS: Record<ImpactBindingRecord["state"], string> = {
  proposed: "提议中",
  confirmed: "已确认",
  inactive: "已停用",
};

function impactStateEffect(impact: ImpactBindingRecord): string {
  if (impact.state === "inactive") return L("这条绑定只作为历史保留，不再参与 Runtime 领取冲突判断。");
  if (impact.state === "proposed") return L("这条绑定尚未确认，不会形成 Runtime 领取门禁。");
  if (impact.access === "exclusive") return L("当前 Goal 独占该区域；其他 active Goal 不能同时读取、写入或作出决策。");
  if (impact.access === "decide") return L("当前 Goal 对该区域作出业务决策；其他 active Goal 的读取、写入或决策会发生冲突。");
  if (impact.access === "write") return L("当前 Goal 会写入该区域；其他写入会冲突，读取方必须固定输入快照。");
  return impact.input_snapshot
    ? L("当前 Goal 只读取该区域，并已固定输入快照，可与写入方并行推进。")
    : L("当前 Goal 只读取该区域，但未固定输入快照；同一区域的 active 写入会阻止领取。");
}

function renderImpactFactsForm(
  impact: ImpactBindingRecord | null,
  goalId: string,
): string {
  const access = impact?.access ?? "read";
  const state = impact?.state === "proposed" ? "proposed" : "confirmed";
  return `<input type="hidden" name="goal_id" value="${escapeHtml(goalId)}">
    <label class="impact-form-wide"><span>${L("影响区域")}</span><input name="surface" required value="${escapeHtml(impact?.surface ?? "")}" placeholder="${L("例如 src/web 或 onboarding-flow")}"></label>
    <label><span>${L("访问类型")}</span><select name="access">${riskSelectOptions([["read", "读取"], ["write", "写入"], ["decide", "决策"], ["exclusive", "独占"]], access)}</select></label>
    <label><span>${L("当前状态")}</span><select name="state">${riskSelectOptions([["confirmed", "已确认"], ["proposed", "提议中"]], state)}</select></label>
    <label class="impact-form-wide"><span>${L("输入快照 ")}<small>${L("读取方可用 commit、文件版本或事实引用固定输入")}</small></span><input name="input_snapshot" value="${escapeHtml(impact?.input_snapshot ?? "")}" placeholder="${L("可选，例如 commit://abc123 或 contract://GOAL-ID")}"></label>
    <label class="impact-form-wide"><span>${L("绑定理由")}</span><textarea name="reason" rows="2" required placeholder="${L("为什么这个 Goal 会影响该区域")}">${escapeHtml(impact?.reason ?? "")}</textarea></label>`;
}

function renderImpactRecord(impact: ImpactBindingRecord, item: WebGoalView): string {
  const inactive = impact.state === "inactive";
  const readOnly = Boolean(item.goal.archived_at);
  return `<article class="impact-record${inactive ? " impact-record--inactive" : ""}" id="impact-${escapeHtml(impact.binding_id)}">
    <header><span class="impact-record-icon">${icon("impact")}</span><div><span class="impact-access impact-access--${escapeHtml(impact.access)}">${escapeHtml(L(IMPACT_ACCESS_LABELS[impact.access]))}</span><h4>${escapeHtml(impact.surface)}</h4><small>${escapeHtml(impact.binding_id)} · ${inactive ? `停用于 ${formatDate(impact.deactivated_at ?? impact.updated_at)}` : `更新于 ${formatDate(impact.updated_at)}`}</small></div><span class="impact-state impact-state--${escapeHtml(impact.state)}">${escapeHtml(L(IMPACT_STATE_LABELS[impact.state]))}</span></header>
    <dl class="impact-facts">
      <div><dt>${L("访问 / 状态")}</dt><dd>${escapeHtml(L(IMPACT_ACCESS_LABELS[impact.access]))} / ${escapeHtml(L(IMPACT_STATE_LABELS[impact.state]))}</dd></div>
      <div><dt>${L("创建者")}</dt><dd>${escapeHtml(impact.created_by)} · ${formatDate(impact.created_at)}</dd></div>
      <div class="impact-fact-wide"><dt>${L("输入快照")}</dt><dd>${impact.input_snapshot ? renderReference(impact.input_snapshot, "输入快照") : "未固定"}</dd></div>
      <div class="impact-fact-wide"><dt>${L("绑定理由")}</dt><dd>${escapeHtml(impact.reason)}</dd></div>
      ${inactive ? `<div class="impact-fact-wide"><dt>停用原因</dt><dd>${escapeHtml(impact.deactivation_reason ?? L("未记录"))}</dd></div>` : ""}
    </dl>
    <p class="impact-effect impact-effect--${escapeHtml(impact.state)}">${icon(inactive ? "history" : "info")}<span><strong>${L("当前影响")}</strong>${escapeHtml(impactStateEffect(impact))}</span></p>
    ${readOnly || inactive ? (readOnly && !inactive ? '<p class="impact-readonly">已归档 Goal 中的 Impact 只读展示；恢复 Goal 后可以继续维护。</p>' : "") : `<div class="impact-actions">
      <details data-persist-open="impact-edit-${escapeHtml(impact.binding_id)}"><summary><span>${icon("settings")}<strong>编辑绑定</strong></span>${icon("chevron-down")}</summary>
        <form class="impact-form" data-impact-edit-form data-live-form="impact-edit-${escapeHtml(impact.binding_id)}" data-impact-id="${escapeHtml(impact.binding_id)}">
          ${renderImpactFactsForm(impact, item.goal.goal_id)}
          <label class="impact-form-wide"><span>${L("修改说明")}</span><textarea name="audit_reason" rows="2" required placeholder="${L("为什么需要更新影响区域、访问方式或状态")}"></textarea></label>
          <p class="form-error impact-form-wide" data-impact-error role="alert" hidden></p>
          <footer class="impact-form-wide"><span>修改会进入事件历史；已停用记录不会原地恢复。</span><button class="button-primary" type="submit">保存 Impact</button></footer>
        </form>
      </details>
      <details class="impact-deactivate" data-persist-open="impact-deactivate-${escapeHtml(impact.binding_id)}"><summary><span>${icon("archive")}<strong>停用绑定</strong></span>${icon("chevron-down")}</summary>
        <form data-impact-deactivate-form data-live-form="impact-deactivate-${escapeHtml(impact.binding_id)}" data-impact-id="${escapeHtml(impact.binding_id)}">
          <p>${L("停用后不再参与领取冲突判断，但完整绑定事实和停用原因会保留在历史中。")}</p>
          <label><span>${L("停用原因")}</span><textarea name="reason" rows="2" required placeholder="${L("为什么这条 Impact 已不再有效")}"></textarea></label>
          <p class="form-error" data-impact-error role="alert" hidden></p>
          <footer><button class="danger-confirm" type="submit">${L("确认停用")}</button></footer>
        </form>
      </details>
    </div>`}
  </article>`;
}

function renderSafety(item: WebGoalView, view: GoalBoardWebView): string {
  const canEdit = !item.goal.archived_at;
  const activeImpacts = item.impacts.filter((impact) => impact.state !== "inactive");
  const inactiveImpacts = item.impacts.filter((impact) => impact.state === "inactive");
  return `<div class="safety-workbench" id="risk-workbench-${escapeHtml(item.goal.goal_id)}">
    <section class="risk-register"><header class="safety-subheading"><div><h3>${L("风险")}</h3><p>${L("记录事实、触发条件、影响范围和处理责任；状态决定是否形成门禁。")}</p></div><span>${L("{count} 项", { count: item.risks.length })}</span></header>
      ${item.risks.length ? `<div class="risk-list">${item.risks.map((risk) => renderRiskRecord(risk, item, view)).join("")}</div>` : `<p class="risk-empty">${L("暂无已登记 Risk。需要持续观察、阻止领取或影响完成的事项，都从这里记录。")}</p>`}
      ${canEdit ? `<details class="risk-create" data-persist-open="risk-create-${escapeHtml(item.goal.goal_id)}"><summary><span class="risk-record-icon">${icon("plus")}</span><span><strong>${L("新增 Risk")}</strong><small>${L("完整记录事实，并明确关联到哪些 Goal")}</small></span>${icon("chevron-down")}</summary>
        <form class="risk-form" data-risk-create-form data-live-form="risk-create-${escapeHtml(item.goal.goal_id)}" data-goal-id="${escapeHtml(item.goal.goal_id)}">
          ${renderRiskFactsForm(null, item.goal.goal_id, view)}
          <label class="risk-form-wide"><span>${L("登记原因")}</span><textarea name="reason" rows="2" required placeholder="${L("为什么现在需要记录这项 Risk")}"></textarea></label>
          <p class="form-error risk-form-wide" data-risk-error role="alert" hidden></p>
          <footer class="risk-form-wide"><span>${L("新 Risk 默认处于“开放”状态。")}</span><button class="button-primary" type="submit">${L("登记 Risk")}</button></footer>
        </form>
      </details>` : ""}
    </section>
    <section class="impact-register" id="impact-workbench-${escapeHtml(item.goal.goal_id)}"><header class="safety-subheading"><div><h3>${L("影响面")}</h3><p>${L("明确这个 Goal 会读取、写入、决策或独占哪些区域，以及它如何影响并行领取。")}</p></div><span>${L("{count} 项生效", { count: activeImpacts.length })}${inactiveImpacts.length ? ` · ${L("{count} 项历史", { count: inactiveImpacts.length })}` : ""}</span></header>
      <div class="impact-ledger">
      ${activeImpacts.length ? `<div class="impact-list">${activeImpacts.map((impact) => renderImpactRecord(impact, item)).join("")}</div>` : `<p class="impact-empty">${L("暂无生效中的 Impact。需要约束并行读取、写入或决策时，从这里登记。")}</p>`}
      ${canEdit ? `<details class="impact-create" data-persist-open="impact-create-${escapeHtml(item.goal.goal_id)}"><summary><span class="impact-record-icon">${icon("plus")}</span><span><strong>${L("新增 Impact")}</strong><small>${L("记录影响区域、访问方式、输入快照和绑定理由")}</small></span>${icon("chevron-down")}</summary>
        <form class="impact-form" data-impact-create-form data-live-form="impact-create-${escapeHtml(item.goal.goal_id)}" data-goal-id="${escapeHtml(item.goal.goal_id)}">
          ${renderImpactFactsForm(null, item.goal.goal_id)}
          <p class="form-error impact-form-wide" data-impact-error role="alert" hidden></p>
          <footer class="impact-form-wide"><span>${L("已确认绑定会立即参与 Runtime 领取冲突判断。")}</span><button class="button-primary" type="submit">${L("登记 Impact")}</button></footer>
        </form>
      </details>` : ""}
      ${inactiveImpacts.length ? `<details class="impact-history" data-persist-open="impact-history-${escapeHtml(item.goal.goal_id)}"><summary><span>${icon("history")}<strong>${L("已停用记录")}</strong><small>${inactiveImpacts.length} ${L("条 · 仍可查看原事实和停用原因")}</small></span>${icon("chevron-down")}</summary><div class="impact-list">${inactiveImpacts.map((impact) => renderImpactRecord(impact, item)).join("")}</div></details>` : ""}
      </div>
    </section>
  </div>`;
}

function activePolicyBinding(
  item: WebGoalView,
  scope: "project_default" | "goal",
): WebPolicyBinding | undefined {
  return item.policy_bindings
    .filter(
      (binding) =>
        binding.state === "active" &&
        binding.scope === scope &&
        (scope === "project_default"
          ? binding.goal_id == null
          : binding.goal_id === item.goal.goal_id),
    )
    .at(-1);
}

function mergePolicy(base: GoalPolicy, binding?: WebPolicyBinding): GoalPolicy {
  const policy = binding?.policy ?? {};
  return {
    ...base,
    ...policy,
    required_capabilities:
      policy.required_capabilities == null
        ? [...base.required_capabilities]
        : [...policy.required_capabilities],
  };
}

const GOAL_MODE_COPY: Record<GoalPolicy["goal_mode"], { label: string; description: string }> = {
  disabled: { label: "关闭", description: "Runtime 不必声明 Goal Mode" },
  preferred: { label: "建议", description: "提醒 Runtime 进入 Goal Mode" },
  required: { label: "强制", description: "未声明时不能领取" },
};

function renderGoalModeChoices(selected: GoalPolicy["goal_mode"]): string {
  return `<div class="policy-mode-options">${(
    Object.entries(GOAL_MODE_COPY) as Array<
      [GoalPolicy["goal_mode"], { label: string; description: string }]
    >
  )
    .map(
      ([value, copy]) => `<label><input type="radio" name="goal_mode" value="${value}"${selected === value ? " checked" : ""}><span><strong>${L(copy.label)}</strong><small>${L(copy.description)}</small></span></label>`,
    )
    .join("")}</div>`;
}

function renderPolicyToggle(
  name: "self_verification" | "human_approval",
  checked: boolean,
  title: string,
  description: string,
): string {
  return `<label class="policy-toggle"><input type="checkbox" name="${name}"${checked ? " checked" : ""}><span class="policy-switch" aria-hidden="true"></span><span class="policy-toggle-copy"><strong>${L(title)}</strong><small>${L(description)}</small></span></label>`;
}

function renderPolicyCounter(
  name: "cross_reviewers" | "adversarial_reviewers",
  value: number,
  title: string,
  description: string,
): string {
  return `<label class="policy-counter"><span><strong>${L(title)}</strong><small>${L(description)}</small></span><span class="policy-counter-input"><input name="${name}" type="number" min="0" step="1" value="${value}" aria-label="${L(title + "人数")}"><span>${L("人")}</span></span></label>`;
}

function policyLeaseDescription(seconds: number): string {
  if (seconds % 3600 === 0) return L("约 {hours} 小时", { hours: seconds / 3600 });
  if (seconds % 60 === 0) return L("约 {minutes} 分钟", { minutes: seconds / 60 });
  return L("到期后其他 Runtime 可以重新领取");
}

function renderPolicyForm(
  item: WebGoalView,
  scope: "project_default" | "goal",
  policy: GoalPolicy,
  binding: WebPolicyBinding | undefined,
): string {
  const goalScope = scope === "goal";
  const scopeLabel = goalScope ? L("当前 Goal 额外规则") : L("项目默认规则");
  const description = goalScope
    ? L("只作用于当前 Goal；可以增加要求，但不能削弱项目默认最低门槛。")
    : L("所有 Goal 的共同基线；修改后影响后续新的领取与 Review。");
  const saved = binding
    ? `${L("已保存 · ")}${formatDate(binding.created_at)} · ${binding.created_by}`
    : goalScope
      ? L("尚未单独设置，当前沿用项目默认")
      : L("尚未单独设置，当前使用系统默认");
  const scopeState = binding ? (goalScope ? L("已设置 Goal 规则") : L("已设置项目基线")) : (goalScope ? L("完全继承") : L("系统默认"));
  const context = goalScope
    ? binding
      ? L("下面是当前 Goal 保存的完整规则。项目默认仍是最低门槛，不能被这里削弱。")
      : L("字段先展示继承后的当前值；只有修改并保存，才会建立这条 Goal 的单独规则。")
    : binding
      ? L("这组规则是所有 Goal 的共同最低门槛；当前 Goal 只能在它之上增加要求。")
      : L("当前仍使用系统默认。保存后，这组规则会成为整个项目的共同最低门槛。");
  return `<details class="policy-source policy-source--${goalScope ? "goal" : "project"}"${goalScope ? " open" : ""}>
    <summary><span class="policy-source-title"><span class="policy-scope-index">${goalScope ? "02" : "01"}</span><span><small>${goalScope ? "GOAL OVERRIDE" : "PROJECT DEFAULT"}</small><strong>${scopeLabel}</strong><span>${escapeHtml(description)}</span></span></span><span class="policy-source-state"><strong>${escapeHtml(scopeState)}</strong><small>${escapeHtml(saved)}</small>${icon("chevron-down")}</span></summary>
    <form class="policy-form" data-policy-form data-live-form="policy-${escapeHtml(scope)}-${escapeHtml(item.goal.goal_id)}">
      <input type="hidden" name="scope" value="${scope}">
      ${goalScope ? `<input type="hidden" name="goal_id" value="${escapeHtml(item.goal.goal_id)}">` : ""}
      <p class="policy-scope-notice">${icon(goalScope ? "target" : "database")}<span>${escapeHtml(context)}</span></p>
      <section class="policy-form-group"><header><span>${icon("workflow")}</span><div><h3>${L("Runtime 领取")}</h3><p>${L("决定 Runtime 以什么方式进入 Goal，以及一次认领能保持多久。")}</p></div></header>
        <fieldset class="policy-control"><legend>Goal Mode</legend><p>${L("这是 Runtime 领取前对工作模式的约束。")}</p>${renderGoalModeChoices(policy.goal_mode)}</fieldset>
        <div class="policy-control policy-control--split"><label class="policy-input"><span><strong>${L("Runtime 必需能力")}</strong><small>${L("必须声明全部能力后才能领取；用逗号分隔。")}</small></span><input name="required_capabilities" value="${escapeHtml(policy.required_capabilities.join(", "))}" placeholder="${L("例如 browser, typescript")}"></label><label class="policy-input"><span><strong>${L("最长领取时间")}</strong><small>${escapeHtml(policyLeaseDescription(policy.max_lease_seconds))}</small></span><span class="policy-with-unit"><input name="max_lease_seconds" type="number" min="1" step="1" value="${policy.max_lease_seconds}"><span>${L("秒")}</span></span></label></div>
      </section>
      <section class="policy-form-group"><header><span>${icon("shield")}</span><div><h3>${L("验证与 Review")}</h3><p>${L("决定执行结果需要经过哪些独立检查，谁拥有最终确认权。")}</p></div></header>
        <div class="policy-toggle-list">${renderPolicyToggle("self_verification", policy.self_verification, "执行者自我验证", "执行者提交结果前先验证自己的 Evidence")}${renderPolicyToggle("human_approval", policy.human_approval, "用户最终确认", "完成前必须由用户提交 Human Review")}</div>
        <div class="policy-review-counts">${renderPolicyCounter("cross_reviewers", policy.cross_reviewers, "交叉验证", "由独立 Reviewer 复核结果与证据")}${renderPolicyCounter("adversarial_reviewers", policy.adversarial_reviewers, "对抗性验证", "主动寻找反例、遗漏和错误假设")}</div>
      </section>
      <section class="policy-form-group policy-form-group--reason"><header><span>${icon("history")}</span><div><h3>${L("变更说明")}</h3><p>${L("Policy 是可审计事实；说明为什么现在需要调整。")}</p></div></header><label class="policy-reason"><span>${L("修改原因")}</span><textarea name="reason" rows="2" required placeholder="${L("例如：这个 Goal 涉及用户数据，需要独立 Review 和最终确认")}"></textarea></label></section>
      <p class="form-error" data-policy-error role="alert" hidden></p>
      <footer><span>${goalScope ? L("保存后会与项目默认合并，并立即成为这条 Goal 的领取门槛。") : L("旧规则会标记为已替换，历史仍保留。")}</span><button class="button-primary" type="submit">${L("保存")}${scopeLabel}</button></footer>
    </form>
  </details>`;
}

function renderPolicyEditor(item: WebGoalView): string {
  const projectBinding = activePolicyBinding(item, "project_default");
  const goalBinding = activePolicyBinding(item, "goal");
  const projectPolicy = mergePolicy(DEFAULT_GOAL_POLICY, projectBinding);
  const goalPolicy = mergePolicy(projectPolicy, goalBinding);
  const policy = item.resolved_policy;
  const mode = GOAL_MODE_COPY[policy.goal_mode];
  return `<div class="policy-workbench">
    <section class="policy-effective"><header><span class="policy-effective-icon">${icon("shield")}</span><div><h3>${L("当前最终生效规则")}</h3><p>${L("Runtime 实际领取和完成这条 Goal 时，必须满足下面这组门槛。")}</p></div></header><dl><div><dt>Goal Mode</dt><dd><strong>${escapeHtml(L(mode.label))}</strong><small>${escapeHtml(L(mode.description))}</small></dd></div><div><dt>${L("执行者自检")}</dt><dd><strong>${policy.self_verification ? L("需要") : L("不需要")}</strong><small>${policy.self_verification ? L("提交前必须验证") : L("不设自检门槛")}</small></dd></div><div><dt>${L("独立 Review")}</dt><dd><strong>${policy.cross_reviewers + policy.adversarial_reviewers} ${L("人")}</strong><small>${L("交叉")} ${policy.cross_reviewers} · ${L("对抗")} ${policy.adversarial_reviewers}</small></dd></div><div><dt>${L("用户确认")}</dt><dd><strong>${policy.human_approval ? L("需要") : L("不需要")}</strong><small>${policy.human_approval ? L("用户拥有最终确认权") : L("无需 Human Review")}</small></dd></div><div><dt>${L("最长领取")}</dt><dd><strong>${policy.max_lease_seconds} ${L("秒")}</strong><small>${escapeHtml(policyLeaseDescription(policy.max_lease_seconds))}</small></dd></div><div><dt>${L("必需能力")}</dt><dd><strong>${escapeHtml(policy.required_capabilities.join(currentLocale() === "en" ? ", " : "、") || L("无"))}</strong><small>${policy.required_capabilities.length ? L("Runtime 必须全部声明") : L("不限制能力标签")}</small></dd></div></dl></section>
    <div class="policy-inheritance" aria-label="${L("Policy 继承关系")}"><span><small>${L("01 · 项目默认")}</small><strong>${projectBinding ? L("项目基线已设置") : L("使用系统默认")}</strong></span>${icon("arrow")}<span><small>${L("02 · 当前 Goal")}</small><strong>${goalBinding ? L("已增加单独规则") : L("完全继承项目")}</strong></span>${icon("arrow")}<span><small>${L("结果")}</small><strong>${L("最终生效门槛")}</strong></span></div>
    ${renderPolicyForm(item, "project_default", projectPolicy, projectBinding)}
    ${renderPolicyForm(item, "goal", goalPolicy, goalBinding)}
  </div>`;
}

function renderHumanReview(item: WebGoalView): string {
  const pending = item.review_obligations.filter(
    (obligation) => obligation.role === "human_approver" && obligation.state === "pending",
  );
  if (!pending.length) return "";
  const evidenceChoices = item.evidence.length
    ? item.evidence
        .slice()
        .reverse()
        .map(
          (evidence) =>
            `<label class="evidence-choice"><input type="checkbox" name="evidence_refs" value="${escapeHtml(evidence.evidence_id)}"><span><strong>${escapeHtml(evidence.kind)} · ${escapeHtml(evidence.result)}</strong><small>${escapeHtml(evidence.locator)}</small></span></label>`,
        )
        .join("")
    : '<p class="empty-row">当前还没有已提交 Evidence；仍可在下方填写外部引用。</p>';
  return `<div class="human-review-list"><header><strong>${L("等待你的最终确认")}</strong><p>${L("请根据 Contract 和 Evidence 给出结论。Human Review 只能由用户入口提交。")}</p></header>${pending
    .map(
      (obligation) => `<form class="human-review-form" data-human-review-form data-live-form="human-review-${escapeHtml(obligation.obligation_id)}" data-goal-id="${escapeHtml(item.goal.goal_id)}" data-obligation-id="${escapeHtml(obligation.obligation_id)}">
        <label class="review-verdict"><span>Review 结论</span><select name="verdict"><option value="pass">通过</option><option value="needs_changes">需要修改</option><option value="fail">不通过</option><option value="inconclusive">证据不足</option></select></label>
        <fieldset><legend>引用已有 Evidence</legend><div class="evidence-choice-list">${evidenceChoices}</div></fieldset>
        <label><span>补充 Evidence 引用 <small>可选，每行一条</small></span><textarea name="evidence_refs_extra" rows="2" placeholder="${L("https://… 或项目内文件引用")}"></textarea></label>
        <label><span>判断理由</span><textarea name="reasoning" rows="3" required placeholder="${L("说明为什么给出这个结论，以及哪些证据支撑判断")}"></textarea></label>
        <p class="form-error" data-review-error role="alert" hidden></p>
        <footer><small>${escapeHtml(obligation.independence_rule)} · ${escapeHtml(obligation.obligation_id)}</small><button class="button-primary" type="submit">提交用户 Review</button></footer>
      </form>`,
    )
    .join("")}</div>`;
}

function renderHistory(item: WebGoalView): string {
  if (!item.events.length) return '<p class="empty-row">暂无事件记录</p>';
  return `<ol class="history-list">${item.events
    .slice(0, 12)
    .map(
      (event) =>
        `<li><time>${formatDate(event.at)}</time><span><strong>${escapeHtml(event.reason || event.type)}</strong><small>${escapeHtml(event.actor_id)} · ${escapeHtml(event.type)} · #${event.seq}</small></span></li>`,
    )
    .join("")}</ol>`;
}

function renderEventPayload(payload: unknown): string {
  if (payload == null) return L("无结构化详情");
  try {
    return JSON.stringify(payload, null, 2) ?? L("无结构化详情");
  } catch {
    return String(payload);
  }
}

function renderFullRecords(item: WebGoalView): string {
  const events = item.events.slice().sort((left, right) => right.seq - left.seq);
  return `<details class="full-records"><summary>${L("查看完整事实记录与事件账本 ")}<span>${L("{count} 条事件", { count: events.length })}</span></summary><div class="record-grid">
    <section><h3>${L("Claim 历史")}</h3>${
      item.claims.length
        ? item.claims.map((claim) => `<p><strong>${escapeHtml(claim.actor_id)}</strong><small>${escapeHtml(claim.claim_id)} · ${escapeHtml(claim.role)} · ${escapeHtml(claim.state)} · ${formatDate(claim.claimed_at)}${claim.release_reason ? ` · ${escapeHtml(claim.release_reason)}` : ""}</small></p>`).join("")
        : `<p class="empty-row">${L("暂无 Claim")}</p>`
    }</section>
    <section><h3>${L("Run 历史")}</h3>${
      item.runs.length
        ? item.runs.map((run) => `<p><strong>${escapeHtml(run.run_id)}</strong><small>${escapeHtml(run.state)} · ${escapeHtml(run.actor_id)} · ${formatDate(run.started_at)}${run.block_reason ? ` · ${escapeHtml(run.block_reason)}` : ""}</small></p>`).join("")
        : `<p class="empty-row">${L("暂无 Run")}</p>`
    }</section>
    <section><h3>${L("Evidence 记录")}</h3>${
      item.evidence.length
        ? item.evidence.map((evidence) => `<p><strong>${escapeHtml(evidence.evidence_id)}</strong><small>${escapeHtml(L(EVIDENCE_KIND_LABELS[evidence.kind]))} · ${escapeHtml(L(EVIDENCE_RESULT_LABELS[evidence.result]))} · ${escapeHtml(evidence.criterion_ids.join(currentLocale() === "en" ? ", " : "、"))} · ${escapeHtml(evidence.producer_actor_id)}</small></p>`).join("")
        : `<p class="empty-row">${L("暂无 Evidence")}</p>`
    }</section>
    <section><h3>${L("Review 记录")}</h3>${
      item.reviews.length
        ? item.reviews.map((review) => `<p><strong>${escapeHtml(review.verdict)}</strong><small>${escapeHtml(review.review_id)} · ${escapeHtml(review.actor_id)} · ${escapeHtml(review.reasoning)}${review.evidence_refs.length ? ` · ${escapeHtml(review.evidence_refs.join(currentLocale() === "en" ? ", " : "、"))}` : ""}</small></p>`).join("")
        : `<p class="empty-row">${L("暂无 Review")}</p>`
    }</section>
    <section><h3>${L("策略绑定")}</h3>${
      item.policy_bindings.length
        ? item.policy_bindings.map((binding) => `<p><strong>${escapeHtml(binding.scope)}</strong><small>${escapeHtml(binding.state)} · ${escapeHtml(binding.reason)} · ${escapeHtml(JSON.stringify(binding.policy))}</small></p>`).join("")
        : `<p class="empty-row">${L("使用默认策略")}</p>`
    }</section>
  </div><section class="event-ledger"><header><h3>${L("完整事件账本")}</h3><p>${L("按时间倒序保留 Claim、Run、Evidence、Review、Policy、Risk、Relation、Candidate、Rewire、Contract/Goal Tree Proposal 和澄清相关事件。")}</p></header>${events.length ? `<ol>${events.map((event) => `<li><details><summary><time>${formatDate(event.at)}</time><span><strong>${escapeHtml(event.type)}</strong><small>${escapeHtml(event.actor_id)} · ${escapeHtml(event.object_type)} · ${escapeHtml(event.object_id)} · #${event.seq}</small></span></summary><dl><div><dt>${L("事件 ID")}</dt><dd>${escapeHtml(event.event_id)}</dd></div><div><dt>${L("理由")}</dt><dd>${escapeHtml(event.reason || L("未记录"))}</dd></div></dl><pre>${escapeHtml(renderEventPayload(event.payload))}</pre></details></li>`).join("")}</ol>` : `<p class="empty-row">${L("暂无与这条 Goal 关联的事件")}</p>`}</section></details>`;
}

const DEPENDENCY_BASIS_LABELS: Record<string, string> = {
  contract_output: "Contract 输出",
  code_reference: "代码引用",
  test_dependency: "测试依赖",
  business_sequence: "业务顺序",
  impact_conflict: "影响面冲突",
  risk_policy: "风险策略",
};

function resolvedProposalGoalId(
  value: unknown,
  rewire: GoalBoardWebView["snapshot"]["rewires"][number],
): string {
  const goalId = String(value ?? "");
  return goalId === "$new_goal" ? String(rewire.proposal.formal_goal_id ?? goalId) : goalId;
}

function renderProposalGoal(goalId: string, view: GoalBoardWebView): string {
  const goal = view.goals.find((item) => item.goal.goal_id === goalId)?.goal;
  if (!goal) return `<span class="dependency-goal"><strong>${escapeHtml(goalId)}</strong></span>`;
  return `<button class="dependency-goal" type="button" data-select-goal="${escapeHtml(goalId)}"><strong>${escapeHtml(goal.title)}</strong><small>${escapeHtml(goalId)}</small></button>`;
}

function dependencyRelations(
  rewire: GoalBoardWebView["snapshot"]["rewires"][number],
): Array<Record<string, unknown>> {
  return (rewire.proposal.relations ?? []).filter(
    (relation) => String(relation.type ?? "") === "depends_on",
  );
}

function renderDependencyProposalList(
  rewire: GoalBoardWebView["snapshot"]["rewires"][number],
  view: GoalBoardWebView,
): string {
  const dependencies = dependencyRelations(rewire);
  if (!dependencies.length) return "";
  return `<div class="dependency-proposal-list">${dependencies.map((relation) => {
    const proposal = relation as unknown as Partial<DependencyProposal>;
    const fromGoalId = resolvedProposalGoalId(proposal.from_goal_id, rewire);
    const toGoalId = resolvedProposalGoalId(proposal.to_goal_id, rewire);
    const evidenceRefs = Array.isArray(proposal.evidence_refs) ? proposal.evidence_refs : [];
    const confidence = typeof proposal.confidence === "number"
      ? `${Math.round(Math.max(0, Math.min(1, proposal.confidence)) * 100)}%`
      : "未记录";
    const stateLabel = rewire.state === "pending"
      ? "等待决定"
      : rewire.state === "applied"
        ? "已应用"
        : rewire.state === "rejected"
          ? "已拒绝"
          : "已确认";
    return `<article class="dependency-proposal">
      <header><span class="dependency-action dependency-action--${escapeHtml(proposal.action ?? "add")}">${proposal.action === "deactivate" ? L("解除依赖") : L("新增依赖")}</span><span class="dependency-state dependency-state--${escapeHtml(rewire.state)}">${escapeHtml(stateLabel)}</span></header>
      <div class="dependency-direction">${renderProposalGoal(fromGoalId, view)}<span>${icon("chevron-right")}<small>依赖</small></span>${renderProposalGoal(toGoalId, view)}</div>
      <dl class="dependency-rationale"><div><dt>为什么需要</dt><dd>${escapeHtml(proposal.reason ?? L("未说明"))}</dd></div><div><dt>为什么是这个方向</dt><dd>${escapeHtml(proposal.direction_reason ?? L("未说明"))}</dd></div><div><dt>如果拒绝</dt><dd>${escapeHtml(proposal.impact_if_rejected ?? L("未说明"))}</dd></div><div><dt>判断依据</dt><dd>${escapeHtml(DEPENDENCY_BASIS_LABELS[proposal.basis ?? ""] ?? proposal.basis ?? L("未记录"))} · 可信度 ${escapeHtml(confidence)}</dd></div></dl>
      <div class="dependency-evidence"><strong>证据</strong>${evidenceRefs.length ? evidenceRefs.map((ref) => renderReference(ref)).join("") : '<span class="empty-row">未提供证据</span>'}</div>
    </article>`;
  }).join("")}</div>`;
}

function renderRewireSummary(
  rewire: GoalBoardWebView["snapshot"]["rewires"][number],
  view: GoalBoardWebView,
): string {
  if (dependencyRelations(rewire).length) return renderDependencyProposalList(rewire, view);
  const relations = rewire.proposal.relations ?? [];
  const impacts = rewire.proposal.impacts ?? [];
  const risks = rewire.proposal.risks ?? [];
  const activeRuns = Array.isArray(rewire.impact.active_runs_protected)
    ? rewire.impact.active_runs_protected.length
    : 0;
  const changeSummary =
    relations.length + impacts.length + risks.length === 0
      ? L("这次提案不新增关系、影响面或风险，只决定新 Goal 是否独立进入后续流程。")
      : `这次提案包含 ${relations.length} 条 Goal 关系、${impacts.length} 个影响面和 ${risks.length} 项风险。`;
  const runSummary = activeRuns
    ? `${activeRuns} 个正在执行的 Run 会保持原目标，不会被改绑。`
    : L("当前没有需要保护的运行中 Run。");
  return `<p>${changeSummary} ${runSummary}</p>`;
}

function renderResolvedDependencyHistory(item: WebGoalView, view: GoalBoardWebView): string {
  const rewires = view.snapshot.rewires.filter(
    (rewire) =>
      rewire.state !== "pending" &&
      dependencyRelations(rewire).some((relation) => {
        const fromGoalId = resolvedProposalGoalId(relation.from_goal_id, rewire);
        const toGoalId = resolvedProposalGoalId(relation.to_goal_id, rewire);
        return fromGoalId === item.goal.goal_id || toGoalId === item.goal.goal_id;
      }),
  );
  if (!rewires.length) return "";
  return `<div class="dependency-history"><h3>${L("依赖提案记录 ")}<span>${rewires.length}</span></h3><p>${L("保留 Runtime 的依据和用户决定，后续事实变化时可以重新检查。")}</p>${rewires.map((rewire) => renderDependencyProposalList(rewire, view)).join("")}</div>`;
}

function renderRewireDecision(
  rewire: GoalBoardWebView["snapshot"]["rewires"][number],
  view: GoalBoardWebView,
): string {
  const hasDependencies = dependencyRelations(rewire).length > 0;
  const note = rewire.candidate_id
    ? L("拒绝关系调整不会删除已经纳入的 Goal。")
    : L("拒绝后现有依赖保持不变；确认后才会新增或解除依赖。");
  return `<form class="decision-record rewire-decision" data-rewire-decision-form data-live-form="rewire-${escapeHtml(rewire.rewire_id)}" data-rewire-id="${escapeHtml(rewire.rewire_id)}">
    <header class="decision-record-heading"><span class="decision-kind decision-kind--rewire">${icon("tree")} Rewire</span><small>${escapeHtml(rewire.rewire_id)}</small></header>
    <div class="decision-record-body"><strong>${hasDependencies ? "依赖调整提案" : "关系调整提案"}</strong>${renderRewireSummary(rewire, view)}<small>${note}</small></div>
    <label class="decision-reason"><span>${L("决定理由或修改意见")}</span><textarea name="reason" rows="2" required placeholder="${L("说明为什么确认或拒绝这次关系变化")}"></textarea></label>
    <p class="form-error" data-decision-error role="alert" hidden></p>
    <footer class="decision-actions"><button type="submit" name="decision" value="rejected">${L("拒绝关系调整")}</button><button class="button-primary" type="submit" name="decision" value="confirmed">${hasDependencies ? "确认依赖调整" : "确认调整"}</button></footer>
  </form>`;
}

const CONTRACT_SOURCE_LABELS: Record<ContractFieldSource["source_kind"], string> = {
  user_answer: "用户回答",
  repository_fact: "代码事实",
  document_fact: "文档事实",
  runtime_inference: "Runtime 推断",
};

function proposalSource(
  proposal: ContractProposalRecord,
  field: ContractFieldName,
): ContractFieldSource | undefined {
  return proposal.field_sources.find((source) => source.field === field);
}

function renderProposalSource(source: ContractFieldSource | undefined): string {
  if (!source) return '<span class="proposal-source">来源待补</span>';
  const confidence = Math.round(source.confidence * 100);
  return `<div class="proposal-source"><span>${escapeHtml(L(CONTRACT_SOURCE_LABELS[source.source_kind]))} · 可信度 ${confidence}% · 待你确认</span><small>${escapeHtml(source.rationale)}</small>${
    source.source_refs.length
      ? `<div class="proposal-refs">${source.source_refs.map((ref) => renderReference(ref)).join("")}</div>`
      : ""
  }</div>`;
}

function contractValue(value: string | number | string[]): string {
  if (Array.isArray(value)) return value.length ? value.join("；") : L("未填写");
  if (typeof value === "number") return String(value);
  return value.trim() || L("未填写");
}

function renderContractDiffRow(
  proposal: ContractProposalRecord,
  field: ContractFieldName,
  label: string,
  current: string | number | string[],
  proposed: string | number | string[],
): string {
  return `<div class="contract-diff-row"><h4>${escapeHtml(label)}</h4><div class="contract-diff-copy"><small>${L("当前")}</small><p>${escapeHtml(contractValue(current))}</p><small>${L("提案")}</small><p>${escapeHtml(contractValue(proposed))}</p></div>${renderProposalSource(proposalSource(proposal, field))}</div>`;
}

function renderContractProposal(
  proposal: ContractProposalRecord,
  current: GoalRecord,
  view: GoalBoardWebView,
): string {
  const proposed = proposal.proposed_goal;
  const acceptance = proposed.acceptance_criteria.map((criterion) => criterion.statement);
  const currentAcceptance = current.acceptance_criteria.map((criterion) => criterion.statement);
  const policy = proposal.review_policy;
  const policyText = [
    `Goal Mode ${policy.goal_mode}`,
    policy.self_verification ? L("需要自检") : L("不要求自检"),
    `交叉验证 ${policy.cross_reviewers} 人`,
    `对抗验证 ${policy.adversarial_reviewers} 人`,
    policy.human_approval ? L("需要用户复核") : L("不要求用户复核"),
  ];
  const linkedRewires = proposal.dependency_rewire_ids
    .map((rewireId) => view.snapshot.rewires.find((rewire) => rewire.rewire_id === rewireId))
    .filter((rewire): rewire is GoalBoardWebView["snapshot"]["rewires"][number] => Boolean(rewire));
  const pendingLinkedRewires = linkedRewires.filter((rewire) => rewire.state === "pending");
  const approvalBlocked = pendingLinkedRewires.length > 0;
  return `<form class="decision-record contract-proposal" data-contract-decision-form data-live-form="contract-${escapeHtml(proposal.proposal_id)}" data-contract-proposal-id="${escapeHtml(proposal.proposal_id)}">
    <header><div><strong>${L("Contract 补全提案")}</strong><p>${L("确认后会更新同一个 Goal，不会创建新 Goal；确认前当前正文保持不变。")}</p></div><span>由 ${escapeHtml(proposal.submitted_by)} 提交</span></header>
    <div class="contract-diff-list">
      ${renderContractDiffRow(proposal, "title", "目标名称", current.title, proposed.title)}
      ${renderContractDiffRow(proposal, "outcome", "要得到的结果", current.outcome, proposed.outcome)}
      ${renderContractDiffRow(proposal, "why", "为什么做", current.why, proposed.why)}
      ${renderContractDiffRow(proposal, "business_logic", "业务逻辑", current.business_logic, proposed.business_logic)}
      ${renderContractDiffRow(proposal, "in_scope", "包含什么", current.in_scope, proposed.in_scope ?? [])}
      ${renderContractDiffRow(proposal, "out_of_scope", "明确不做", current.out_of_scope, proposed.out_of_scope ?? [])}
      ${renderContractDiffRow(proposal, "promised_outputs", "承诺输出", current.promised_outputs, proposed.promised_outputs ?? [])}
      ${renderContractDiffRow(proposal, "acceptance_criteria", "验收条件", currentAcceptance, acceptance)}
      ${renderContractDiffRow(proposal, "review_policy", "Runtime 与 Review 规则", "使用当前默认规则", policyText)}
    </div>
    ${proposal.proposed_impacts.length ? `<div class="proposal-appendix"><strong>确认后登记的影响面</strong>${renderList(proposal.proposed_impacts.map((impact) => `${impact.surface} · ${impact.access} · ${impact.reason}`), "")}</div>` : ""}
    ${proposal.proposed_risks.length ? `<div class="proposal-appendix"><strong>确认后登记的风险</strong>${renderList(proposal.proposed_risks.map((risk) => `${risk.description}；影响：${risk.impact}；复查：${risk.revisit_condition}`), "")}</div>` : ""}
    ${linkedRewires.length ? `<div class="proposal-appendix proposal-prerequisite"><strong>依赖前置决定</strong><div>${renderList(linkedRewires.map((rewire) => `${rewire.state === "pending" ? "等待决定" : rewire.state === "applied" ? "已确认" : "已拒绝"} · ${rewire.rewire_id}`), "")}<p>${approvalBlocked ? L("请先处理上方依赖调整；完成后才可确认 Contract。") : L("依赖决定已经完成，可以确认 Contract。")}</p></div></div>` : ""}
    <label class="decision-reason"><span>${L("决定理由或修改意见")}</span><textarea name="reason" rows="2" required placeholder="${L("确认时说明判断依据；退回时写清需要修改的内容")}"></textarea></label>
    <p class="form-error" data-decision-error role="alert" hidden></p>
    <footer class="decision-actions"><button type="submit" name="decision" value="rejected">${L("退回补全")}</button><button class="button-primary" type="submit" name="decision" value="approved"${approvalBlocked ? ' disabled aria-disabled="true" title="先处理上方依赖调整"' : ""}>${approvalBlocked ? "先处理依赖调整" : "确认并设为可执行"}</button></footer>
  </form>`;
}

interface DecisionGoalGroup {
  item: WebGoalView | null;
  contractProposals: ContractProposalRecord[];
  candidates: CandidateGoalRecord[];
  rewires: RewireRecord[];
  humanReview: boolean;
  risks: RiskRecord[];
}

function allGoalViews(view: GoalBoardWebView): WebGoalView[] {
  return [...view.goals, ...view.archived_goals];
}

function findGoalView(view: GoalBoardWebView, goalId: string | null | undefined): WebGoalView | null {
  return goalId ? allGoalViews(view).find((item) => item.goal.goal_id === goalId) ?? null : null;
}

function candidateOwnerGoalId(candidate: CandidateGoalRecord, view: GoalBoardWebView): string | null {
  if (!candidate.discovered_in_run_id) return null;
  return view.snapshot.runs.find((run) => run.run_id === candidate.discovered_in_run_id)?.goal_id ?? null;
}

function rewireOwnerGoalId(rewire: RewireRecord, view: GoalBoardWebView): string | null {
  if (rewire.candidate_id) {
    const candidate = view.snapshot.candidates.find((item) => item.candidate_id === rewire.candidate_id);
    const owner = candidate ? candidateOwnerGoalId(candidate, view) : null;
    if (owner) return owner;
  }
  if (rewire.proposal.discovered_in_run_id) {
    const run = view.snapshot.runs.find((item) => item.run_id === rewire.proposal.discovered_in_run_id);
    if (run) return run.goal_id;
  }
  if (typeof rewire.proposal.formal_goal_id === "string") return rewire.proposal.formal_goal_id;
  for (const relation of rewire.proposal.relations ?? []) {
    const fromGoalId = resolvedProposalGoalId(relation.from_goal_id, rewire);
    const toGoalId = resolvedProposalGoalId(relation.to_goal_id, rewire);
    if (findGoalView(view, fromGoalId)) return fromGoalId;
    if (findGoalView(view, toGoalId)) return toGoalId;
  }
  return null;
}

function riskNeedsDecision(risk: RiskRecord): boolean {
  return risk.state === "open" || risk.state === "triggered";
}

function buildDecisionGroups(view: GoalBoardWebView): DecisionGoalGroup[] {
  const groups = new Map<string, DecisionGoalGroup>();
  const ensure = (goalId: string | null): DecisionGoalGroup => {
    const key = goalId ?? "$board";
    const existing = groups.get(key);
    if (existing) return existing;
    const created: DecisionGoalGroup = {
      item: findGoalView(view, goalId),
      contractProposals: [],
      candidates: [],
      rewires: [],
      humanReview: false,
      risks: [],
    };
    groups.set(key, created);
    return created;
  };
  view.snapshot.contract_proposals
    .filter((proposal) => proposal.state === "pending")
    .forEach((proposal) => ensure(proposal.goal_id).contractProposals.push(proposal));
  view.snapshot.candidates
    .filter((candidate) => candidate.state === "pending")
    .forEach((candidate) => ensure(candidateOwnerGoalId(candidate, view)).candidates.push(candidate));
  view.snapshot.rewires
    .filter((rewire) => rewire.state === "pending")
    .forEach((rewire) => ensure(rewireOwnerGoalId(rewire, view)).rewires.push(rewire));
  for (const item of allGoalViews(view)) {
    if (item.review_obligations.some((obligation) => obligation.role === "human_approver" && obligation.state === "pending")) {
      ensure(item.goal.goal_id).humanReview = true;
    }
  }
  for (const risk of view.snapshot.risks.filter(riskNeedsDecision)) {
    const owners = allGoalViews(view).filter((item) => item.risks.some((itemRisk) => itemRisk.risk_id === risk.risk_id));
    ensure(owners.length === 1 ? owners[0]!.goal.goal_id : null).risks.push(risk);
  }
  return [...groups.values()].filter((group) =>
    group.contractProposals.length || group.candidates.length || group.rewires.length || group.humanReview || group.risks.length,
  );
}

function pendingDecisionCount(view: GoalBoardWebView): number {
  const riskIds = new Set(
    allGoalViews(view).flatMap((item) => item.risks.filter(riskNeedsDecision).map((risk) => risk.risk_id)),
  );
  return view.snapshot.contract_proposals.filter((item) => item.state === "pending").length +
    view.snapshot.candidates.filter((item) => item.state === "pending").length +
    view.snapshot.rewires.filter((item) => item.state === "pending").length +
    view.snapshot.review_obligations.filter((item) => item.role === "human_approver" && item.state === "pending").length +
    riskIds.size;
}

function renderDecisionGoalLink(item: WebGoalView | null): string {
  if (!item) return '<span class="decision-owner-link"><strong>Board 级事项</strong><small>未关联来源 Goal</small></span>';
  const base = item.goal.archived_at ? "/archive/goals/" : "/goals/";
  return `<a class="decision-owner-link" href="${base}${encodeURIComponent(item.goal.goal_id)}"><strong>${escapeHtml(item.goal.title)}</strong><small>${escapeHtml(item.goal.goal_id)} · 打开 Goal</small></a>`;
}

function renderCandidateList(values: string[] | undefined, empty: string): string {
  return values?.length ? renderList(values, "") : `<p class="empty-row">${escapeHtml(L(empty))}</p>`;
}

function projectDefaultPolicy(view: GoalBoardWebView): GoalPolicy {
  const binding = view.policy_bindings
    .filter((item) => item.scope === "project_default" && item.goal_id == null && item.state === "active")
    .at(-1);
  return mergePolicy(DEFAULT_GOAL_POLICY, binding);
}

function recordSummary(value: Record<string, unknown>, kind: "impact" | "risk"): string {
  if (kind === "impact") {
    return `${String(value.surface ?? "未命名影响面")} · ${String(value.access ?? "access 未记录")} · ${String(value.reason ?? "未说明原因")}`;
  }
  return `${String(value.description ?? "未命名风险")} · 影响 ${String(value.impact ?? "未记录")} · ${String(value.blocking_mode ?? "不阻塞")}`;
}

function renderCandidateDecision(candidate: CandidateGoalRecord, view: GoalBoardWebView): string {
  const proposed = candidate.proposed_goal;
  const owner = findGoalView(view, candidateOwnerGoalId(candidate, view));
  const policy = projectDefaultPolicy(view);
  const acceptance = proposed.acceptance_criteria ?? [];
  const separation = owner
    ? `来源 Goal 的当前范围是「${owner.goal.in_scope.join("；") || owner.goal.outcome || "未记录"}」；Candidate 要独立交付「${proposed.promised_outputs?.join("；") || proposed.outcome}」。请判断它是否确实应越出原 Contract。`
    : L("该 Candidate 没有关联来源 Run；请根据它自己的 Contract 判断是否应该独立进入 Goal Tree。");
  return `<form class="decision-record candidate-decision" data-candidate-decision-form data-live-form="candidate-${escapeHtml(candidate.candidate_id)}" data-candidate-id="${escapeHtml(candidate.candidate_id)}">
    <header class="decision-record-heading"><span class="decision-kind decision-kind--candidate">${icon("plus")} Candidate</span><small>${escapeHtml(candidate.candidate_id)} · ${escapeHtml(candidate.submitted_by)}</small></header>
    <div class="candidate-title"><div><small>${L("候选 Goal")}</small><h3>${escapeHtml(proposed.title)}</h3><p>${escapeHtml(proposed.outcome)}</p></div><span>${escapeHtml(candidate.blocking_mode === "none" ? "不阻塞当前 Run" : candidate.blocking_mode === "current_run" ? "阻塞当前 Run" : "影响下游领取")}</span></div>
    <dl class="candidate-contract">
      <div><dt>${L("为什么做")}</dt><dd>${escapeHtml(proposed.why)}</dd></div>
      <div><dt>${L("业务逻辑")}</dt><dd>${escapeHtml(proposed.business_logic)}</dd></div>
      <div class="candidate-wide"><dt>${L("为什么不能留在当前 Goal")}</dt><dd>${escapeHtml(separation)}</dd></div>
      <div><dt>${L("包含范围")}</dt><dd>${renderCandidateList(proposed.in_scope, "未记录")}</dd></div>
      <div><dt>${L("明确不做")}</dt><dd>${renderCandidateList(proposed.out_of_scope, "未记录")}</dd></div>
      <div class="candidate-wide"><dt>${L("验收条件")}</dt><dd>${acceptance.length ? `<ol class="candidate-acceptance">${acceptance.map((criterion) => `<li><strong>${escapeHtml(criterion.statement)}</strong><small>${escapeHtml(criterion.pass_condition)}</small></li>`).join("")}</ol>` : `<p class="empty-row">${L("未记录验收条件")}</p>`}</dd></div>
      <div><dt>${L("影响面")}</dt><dd>${candidate.proposed_impacts.length ? renderList(candidate.proposed_impacts.map((impact) => recordSummary(impact, "impact")), "") : '<p class="empty-row">未提议影响面</p>'}</dd></div>
      <div><dt>${L("风险")}</dt><dd>${candidate.proposed_risks.length ? renderList(candidate.proposed_risks.map((risk) => recordSummary(risk, "risk")), "") : '<p class="empty-row">未提议风险</p>'}</dd></div>
      <div class="candidate-wide"><dt>Review Policy</dt><dd>采用当前项目基线：Goal Mode ${escapeHtml(policy.goal_mode)}；自检 ${policy.self_verification ? "需要" : "不需要"}；交叉 / 对抗 ${policy.cross_reviewers} / ${policy.adversarial_reviewers} 人；用户确认 ${policy.human_approval ? "需要" : "不需要"}。</dd></div>
    </dl>
    <label class="decision-reason"><span>${L("决定理由或修改意见")}</span><textarea name="reason" rows="3" required placeholder="${L("说明为什么纳入；或写清退回后需要怎样调整")}"></textarea></label>
    <p class="form-error" data-decision-error role="alert" hidden></p>
    <footer class="decision-actions"><button type="submit" name="decision" value="rejected">${L("退回并说明修改")}</button><button class="button-primary" type="submit" name="decision" value="approved">${L("纳入 Goal Tree")}</button></footer>
  </form>`;
}

function renderRiskDecision(risk: RiskRecord, item: WebGoalView | null, view: GoalBoardWebView): string {
  const href = item ? `${item.goal.archived_at ? "/archive/goals/" : "/goals/"}${encodeURIComponent(item.goal.goal_id)}#risk-${encodeURIComponent(risk.risk_id)}` : "#";
  const affectedGoals = allGoalViews(view).filter((goalView) => goalView.risks.some((itemRisk) => itemRisk.risk_id === risk.risk_id));
  return `<article class="decision-record risk-decision">
    <header class="decision-record-heading"><span class="decision-kind decision-kind--risk">${icon("risk")} Risk</span><span class="risk-state risk-state--${escapeHtml(risk.state)}">${escapeHtml(risk.state)}</span></header>
    <div class="decision-record-body"><strong>${escapeHtml(risk.description)}</strong><p>概率 ${escapeHtml(risk.probability)} · 影响 ${escapeHtml(risk.impact)} · ${escapeHtml(risk.blocking_mode)}</p><small>触发：${escapeHtml(risk.trigger)}；复查：${escapeHtml(risk.revisit_condition)}；负责人：${escapeHtml(risk.owner)}</small></div>
    <div class="risk-goal-links"><span>${L("关联 Goal")}</span><div>${affectedGoals.length ? affectedGoals.map((goalView) => renderDecisionGoalLink(goalView)).join("") : "未关联 Goal"}</div></div>
    <footer class="decision-link-row"><span>${L("完整处理方式和生命周期在所属 Goal 中维护。")}</span>${item ? `<a href="${href}">打开 Risk</a>` : ""}</footer>
  </article>`;
}

function renderDecisionCenter(view: GoalBoardWebView): string {
  const groups = buildDecisionGroups(view);
  const count = pendingDecisionCount(view);
  const typeCounts = {
    proposals: view.snapshot.contract_proposals.filter((item) => item.state === "pending").length,
    candidates: view.snapshot.candidates.filter((item) => item.state === "pending").length,
    rewires: view.snapshot.rewires.filter((item) => item.state === "pending").length,
    reviews: view.snapshot.review_obligations.filter((item) => item.role === "human_approver" && item.state === "pending").length,
    risks: view.snapshot.risks.filter(riskNeedsDecision).length,
  };
  return `<article class="decision-center" data-decision-center>
    <header class="decision-center-header"><div><h1>${L("等待你的决定")}</h1><p>${L("Runtime 只能提交事实和提案。这里按所属 Goal 集中呈现上下文，由你给出理由并确认。")}</p></div><strong>${count}<small>${L("项待处理")}</small></strong></header>
    <div class="decision-summary" aria-label="${L("待决定事项统计")}"><span>Contract <strong>${typeCounts.proposals}</strong></span><span>Candidate <strong>${typeCounts.candidates}</strong></span><span>Rewire <strong>${typeCounts.rewires}</strong></span><span>Human Review <strong>${typeCounts.reviews}</strong></span><span>Risk <strong>${typeCounts.risks}</strong></span></div>
    ${groups.length ? `<div class="decision-groups">${groups.map((group) => {
      const goalId = group.item?.goal.goal_id ?? "board";
      return `<section class="decision-goal-group" id="decision-goal-${escapeHtml(goalId)}">
        <header class="decision-owner"><div><span>${L("所属 Goal")}</span>${renderDecisionGoalLink(group.item)}</div><small>${group.contractProposals.length + group.candidates.length + group.rewires.length + group.risks.length + (group.humanReview ? 1 : 0)} 项</small></header>
        <div class="decision-stack">
          ${group.rewires.map((rewire) => renderRewireDecision(rewire, view)).join("")}
          ${group.item ? group.contractProposals.map((proposal) => renderContractProposal(proposal, group.item!.goal, view)).join("") : ""}
          ${group.candidates.map((candidate) => renderCandidateDecision(candidate, view)).join("")}
          ${group.humanReview && group.item ? renderHumanReview(group.item) : ""}
          ${group.risks.map((risk) => renderRiskDecision(risk, group.item, view)).join("")}
        </div>
      </section>`;
    }).join("")}</div>` : `<div class="decision-empty">${icon("check")}<h2>${L("当前没有等待你的决定")}</h2><p>${L("Runtime 提交新的 Contract Proposal、Candidate 或 Rewire 后，会自动出现在这里。")}</p></div>`}
  </article>`;
}

function countGoalDecisions(view: GoalBoardWebView, goalId: string): number {
  const group = buildDecisionGroups(view).find((item) => item.item?.goal.goal_id === goalId);
  if (!group) return 0;
  return group.contractProposals.length + group.candidates.length + group.rewires.length + group.risks.length + (group.humanReview ? 1 : 0);
}

function situationNextStep(
  item: WebGoalView,
  blockedDescendant: WebGoalView | null,
): { label: string; href: string | null; tone?: "blocked" | "ready" } {
  const acceptance = `#acceptance-${item.goal.goal_id}`;
  const execution = `#execution-${item.goal.goal_id}`;
  const relations = `#relations-${item.goal.goal_id}`;
  switch (item.status) {
    case "clarification_pending":
    case "clarifying":
      return { label: L("补全 Draft"), href: acceptance };
    case "clarification_blocked":
    case "execution_blocked":
    case "review_blocked":
    case "revalidation_blocked":
      return { label: L("先处理阻塞"), href: execution, tone: "blocked" };
    case "waiting_children":
      return blockedDescendant
        ? {
            label: L("先处理「{title}」", { title: blockedDescendant.goal.title }),
            href: `/goals/${encodeURIComponent(blockedDescendant.goal.goal_id)}`,
            tone: "blocked",
          }
        : { label: L("先完成子 Goal"), href: relations };
    case "execution_pending":
      return { label: L("可以领取执行"), href: execution };
    case "executing":
      return { label: L("Runtime 正在执行"), href: execution };
    case "review_pending":
    case "reviewing":
      return { label: L("等待复核"), href: execution };
    case "revalidation_pending":
    case "revalidating":
      return { label: L("需要重新验证"), href: execution };
    case "invalidated":
      return { label: L("已失效，先看原因"), href: execution, tone: "blocked" };
    case "satisfied":
      return { label: L("已完成，可以归档"), href: null, tone: "ready" };
    case "archived":
      return { label: L("已归档"), href: null };
    case "trashed":
      return { label: L("已在回收站"), href: null };
  }
}

function renderSituationCell(options: {
  label: string;
  value: string;
  href?: string | null;
  extra?: string;
  tone?: "blocked" | "ready" | "muted";
}): string {
  const classes = ["goal-situation-cell"];
  if (!options.href) classes.push("goal-situation-cell--static");
  if (options.tone) classes.push(`goal-situation-cell--${options.tone}`);
  const body = `<span>${escapeHtml(options.label)}</span><strong>${escapeHtml(options.value)}</strong>${
    options.extra ? `<small>${escapeHtml(options.extra)}</small>` : ""
  }`;
  return options.href
    ? `<a class="${classes.join(" ")}" href="${escapeHtml(options.href)}">${body}</a>`
    : `<div class="${classes.join(" ")}">${body}</div>`;
}

function renderGoalSituationStrip(item: WebGoalView, view: GoalBoardWebView): string {
  const goalId = item.goal.goal_id;
  const ownBlocker = item.reasons.find((reason) => reason.severity === "blocker");
  const blockedDescendant =
    !ownBlocker && item.status === "waiting_children" ? firstBlockedDescendant(item, view) : null;
  const next = situationNextStep(item, blockedDescendant);
  const stuck = ownBlocker
    ? {
        value: ownBlocker.message,
        href: `#execution-${goalId}`,
        extra: undefined as string | undefined,
        tone: "blocked" as const,
      }
    : blockedDescendant
      ? {
          value: L("子 Goal「{title}」{status}", {
            title: blockedDescendant.goal.title,
            status: L(STATUS_LABELS[blockedDescendant.status]),
          }),
          href: `/goals/${encodeURIComponent(blockedDescendant.goal.goal_id)}`,
          extra: blockedDescendant.reasons.find((reason) => reason.severity === "blocker")?.message,
          tone: "blocked" as const,
        }
      : {
          value: L("当前没有阻塞"),
          href: `#execution-${goalId}`,
          extra: undefined,
          tone: "ready" as const,
        };
  const total = item.goal.acceptance_criteria.length;
  const passed = item.passed_criteria.length;
  const remaining = total - passed;
  const decisions = countGoalDecisions(view, goalId);
  const boardPending = pendingDecisionCount(view);
  const completion = !total
    ? { value: L("还没有验收条件"), tone: "muted" as const }
    : remaining === 0
      ? { value: L("已满足 {passed}/{total}", { passed, total }), tone: "ready" as const }
      : { value: L("还缺 {remaining} 条 · {passed}/{total}", { remaining, passed, total }), tone: undefined };
  const decisionCell = decisions
    ? {
        value: L("{count} 项等待你的决定", { count: decisions }),
        href: `/decisions#decision-goal-${goalId}`,
        extra: L("前往处理"),
        tone: undefined as "muted" | undefined,
      }
    : boardPending
      ? {
          value: L("这条没有，项目里还有 {count} 项", { count: boardPending }),
          href: "/decisions",
          extra: L("前往处理"),
          tone: undefined,
        }
      : {
          value: L("没有待你决定的事项"),
          href: null as string | null,
          extra: undefined,
          tone: "muted" as const,
        };
  return `<nav class="goal-situation" aria-label="${L("这条 Goal 现在怎样")}">
    ${renderSituationCell({ label: L("下一步"), value: next.label, href: next.href, tone: next.tone })}
    ${renderSituationCell({
      label: L("卡住"),
      value: stuck.value,
      href: stuck.href,
      extra: stuck.extra,
      tone: stuck.tone,
    })}
    ${renderSituationCell({
      label: L("完成"),
      value: completion.value,
      href: `#acceptance-${goalId}`,
      tone: completion.tone,
    })}
    ${renderSituationCell({
      label: L("待决定"),
      value: decisionCell.value,
      href: decisionCell.href,
      extra: decisionCell.extra,
      tone: decisionCell.tone,
    })}
  </nav>`;
}

function renderDraftGaps(goal: GoalRecord): string {
  if (goal.definition_state !== "draft") return "";
  const gaps = [
    !goal.outcome.trim() ? L("要得到的结果") : "",
    !goal.why.trim() ? L("为什么做") : "",
    !goal.business_logic.trim() ? L("业务逻辑") : "",
    !goal.in_scope.length ? L("包含范围") : "",
    !goal.out_of_scope.length ? L("明确不做") : "",
    !goal.promised_outputs.length ? L("承诺输出") : "",
    !goal.acceptance_criteria.length ? L("验收条件") : "",
  ].filter(Boolean);
  if (!gaps.length) return "";
  return `<div class="draft-gaps"><div><strong>${L("这还是一条待澄清的 Draft")}</strong><p>${L("还需要补全：{gaps}。澄清者可以提交提案，但只有你确认后它才会成为可执行 Goal。", { gaps: gaps.join(currentLocale() === "en" ? ", " : "、") })}</p></div><a href="#acceptance-${escapeHtml(goal.goal_id)}">${L("查看验收")}</a></div>`;
}

const DECOMPOSITION_OPTIONS = [
  ["abstract", "仍需拆分", "方向还比较抽象，需要继续找到可独立交付的结果。"],
  ["frontier_open", "Frontier 开放", "已经有部分可做边界，但拆分工作还没有结束。"],
  ["closed_leaf", "最小可执行叶子", "可独立完成、独立交付，并有自己的可观察验收。"],
  ["closed_compound", "拆分完成的复合 Goal", "自身由一组闭环子 Goal 组成，不作为一个大任务直接执行。"],
] as const;

function renderDecisionMethodOptions(selected: AcceptanceCriterion["decision_method"]): string {
  return ([
    ["automated_check", L("自动检查")],
    ["measurement", L("量化测量")],
    ["inspection", L("人工检查")],
    ["human_decision", L("用户判断")],
  ] as const)
    .map(([value, label]) => `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`)
    .join("");
}

function renderCriterionTarget(target: Record<string, unknown> | null | undefined): string {
  if (target == null) return "";
  if (Object.keys(target).length === 1 && "value" in target) return String(target.value ?? "");
  return JSON.stringify(target);
}

function renderDraftCriterionRow(
  criterion: AcceptanceCriterion | undefined,
  index: number,
): string {
  return `<article class="criterion-editor-row" data-criterion-row>
    <header><strong data-criterion-number>验收条件 ${index}</strong><button type="button" data-remove-criterion aria-label="${L("移除这条验收条件")}">${icon("x")}<span>${L("移除")}</span></button></header>
    <div class="criterion-editor-grid">
      <label class="criterion-statement"><span>${L("检查什么")}</span><input data-criterion-field="statement" value="${escapeHtml(criterion?.statement ?? "")}" placeholder="${L("例如：用户可以保存 Draft 后再次打开")}"></label>
      <label><span>${L("判断方式")}</span><select data-criterion-field="decision_method">${renderDecisionMethodOptions(criterion?.decision_method ?? "inspection")}</select></label>
      <label class="criterion-pass"><span>${L("怎样算通过")}</span><textarea rows="2" data-criterion-field="pass_condition" placeholder="${L("写出明确、可判断的通过条件")}">${escapeHtml(criterion?.pass_condition ?? "")}</textarea></label>
      <label><span>${L("目标值 ")}<small>${L("可选")}</small></span><input data-criterion-field="target" value="${escapeHtml(renderCriterionTarget(criterion?.target))}" placeholder="${L("例如 100%、≤ 2 秒或 JSON")}"></label>
      <label><span>${L("所需证据类型")}</span><input data-criterion-field="required_evidence" value="${escapeHtml(criterion?.required_evidence.join(", ") ?? "")}" placeholder="${L("例如 test, inspection")}"></label>
      <label><span>${L("条件 ID ")}<small>${L("可选，留空自动生成")}</small></span><input data-criterion-field="criterion_id" value="${escapeHtml(criterion?.criterion_id ?? "")}" placeholder="${L("例如 DRAFT-C1")}"></label>
    </div>
  </article>`;
}

function renderDraftEditor(item: WebGoalView): string {
  const goal = item.goal;
  if (goal.definition_state !== "draft") return "";
  const criteria = goal.acceptance_criteria.length
    ? goal.acceptance_criteria.map((criterion, index) => renderDraftCriterionRow(criterion, index + 1)).join("")
    : renderDraftCriterionRow(undefined, 1);
  const listValue = (values: string[]) => escapeHtml(values.join("\n"));
  const decompositionOptions = DECOMPOSITION_OPTIONS.map(
    ([value, label, description]) => `<label class="decomposition-choice"><input type="radio" name="decomposition_state" value="${value}"${goal.decomposition_state === value ? " checked" : ""}><span><strong>${L(label)}</strong><small>${L(description)}</small></span></label>`,
  ).join("");
  return `<div class="draft-editor-section" data-draft-editor data-goal-id="${escapeHtml(goal.goal_id)}">
    ${subsectionHeading("clipboard", "补全 Draft Contract", "只有 Draft 可以直接编辑；accepted Contract 需要通过新 Goal 与 Rewire 变更")}
    <form class="draft-contract-form" data-draft-form data-live-form="draft-${escapeHtml(goal.goal_id)}" data-goal-id="${escapeHtml(goal.goal_id)}">
      <div class="draft-form-row draft-form-row--title"><label><span>${L("Goal 名称")}</span><input name="title" required maxlength="120" value="${escapeHtml(goal.title)}"></label><label><span>${L("优先级")}</span><input name="priority" type="number" min="0" max="100" step="1" value="${goal.priority}"></label></div>
      <label class="draft-field"><span>${L("要得到的结果")}</span><textarea name="outcome" rows="2" placeholder="${L("完成后，用户或系统获得什么可观察结果")}">${escapeHtml(goal.outcome)}</textarea></label>
      <label class="draft-field"><span>${L("为什么现在做")}</span><textarea name="why" rows="2" placeholder="${L("说明问题和这项工作的价值")}">${escapeHtml(goal.why)}</textarea></label>
      <label class="draft-field"><span>${L("业务逻辑")}</span><textarea name="business_logic" rows="3" placeholder="${L("用非技术语言说明事情如何运转、边界在哪里")}">${escapeHtml(goal.business_logic)}</textarea></label>
      <div class="draft-list-grid">
        <label><span>${L("包含范围 ")}<small>${L("每行一项")}</small></span><textarea name="in_scope" rows="4">${listValue(goal.in_scope)}</textarea></label>
        <label><span>${L("明确不做 ")}<small>${L("每行一项")}</small></span><textarea name="out_of_scope" rows="4">${listValue(goal.out_of_scope)}</textarea></label>
        <label><span>${L("约束 ")}<small>${L("每行一项")}</small></span><textarea name="constraints" rows="4">${listValue(goal.constraints)}</textarea></label>
        <label><span>${L("需要的输入 ")}<small>${L("每行一项")}</small></span><textarea name="required_inputs" rows="4">${listValue(goal.required_inputs)}</textarea></label>
        <label><span>${L("承诺输出 ")}<small>${L("每行一项")}</small></span><textarea name="promised_outputs" rows="4">${listValue(goal.promised_outputs)}</textarea></label>
      </div>
      <fieldset class="decomposition-editor"><legend>${L("这条 Goal 现在拆到什么程度？")}</legend><div>${decompositionOptions}</div></fieldset>
      <section class="criteria-editor" aria-labelledby="criteria-editor-${escapeHtml(goal.goal_id)}">
        <header><div><h3 id="criteria-editor-${escapeHtml(goal.goal_id)}">${L("结构化验收条件")}</h3><p>${L("每条条件保留自己的判断方式、目标和证据要求。")}</p></div><button type="button" data-add-criterion>${icon("plus")}<span>${L("添加验收条件")}</span></button></header>
        <div class="criteria-editor-list" data-criteria-list>${criteria}</div>
        <template data-criterion-template>${renderDraftCriterionRow(undefined, 1)}</template>
      </section>
      <label class="draft-field"><span>${L("本次修改原因")}</span><textarea name="reason" rows="2" required placeholder="${L("例如：补充用户确认的范围和验收条件")}"></textarea></label>
      <p class="form-error" data-draft-error role="alert" hidden></p>
      <footer><span>${L("保存会更新同一个 Draft；已有待确认 Proposal 会失效并等待重新提案。")}</span><button class="button-primary" type="submit">${L("保存 Draft Contract")}</button></footer>
    </form>
    <div class="draft-auxiliary">
      <a class="draft-policy-link" href="#risk-workbench-${escapeHtml(goal.goal_id)}">${icon("risk")}<span><strong>${L("继续登记和维护 Risk")}</strong><small>${L("在“风险与影响”中维护完整事实、关联 Goal 与生命周期")}</small></span>${icon("arrow")}</a>
      <a class="draft-policy-link" href="#impact-workbench-${escapeHtml(goal.goal_id)}">${icon("impact")}<span><strong>${L("继续登记和维护 Impact")}</strong><small>${L("在“风险与影响”中维护区域、访问方式、状态与历史")}</small></span>${icon("arrow")}</a>
      <a class="draft-policy-link" href="#policy-${escapeHtml(goal.goal_id)}">${icon("settings")}<span><strong>${L("继续设置 Runtime / Review Policy")}</strong><small>${L("项目默认与当前 Goal 规则在下方独立维护")}</small></span>${icon("arrow")}</a>
    </div>
  </div>`;
}

function sectionHeading(iconName: GoalBoardIcon, title: string, description = ""): string {
  return `<header class="section-heading"><span>${icon(iconName)}</span><div><h2>${escapeHtml(L(title))}</h2>${
    description ? `<p>${escapeHtml(L(description))}</p>` : ""
  }</div></header>`;
}

function subsectionHeading(iconName: GoalBoardIcon, title: string, description = ""): string {
  return `<header class="subsection-heading"><span>${icon(iconName)}</span><div><h3>${escapeHtml(L(title))}</h3>${
    description ? `<p>${escapeHtml(L(description))}</p>` : ""
  }</div></header>`;
}

function renderGoalDocument(item: WebGoalView, view: GoalBoardWebView, selected: boolean): string {
  const goal = item.goal;
  const owner = item.active_claim_actor ?? goal.accepted_by ?? L("未指定");
  const priorityLabel = goal.priority >= 80 ? L("高") : goal.priority >= 40 ? L("中") : L("普通");
  const activeGoalAction =
    goal.definition_state === "accepted" && !goal.archived_at && !goal.trashed_at
      ? view.snapshot.board.active_goal_id === goal.goal_id
        ? `<span class="document-action document-action--current" role="status" title="${L("当前产品聚焦 Goal；不表示 Runtime 正在执行")}">${icon("target")}<span>${L("当前 Goal")}</span></span>`
        : `<button class="document-action document-action--quiet" type="button" data-set-active-goal data-goal-id="${escapeHtml(goal.goal_id)}" title="${L("设为 Board 当前聚焦；不会领取或启动 Runtime 执行")}">${icon("target")}<span>${L("设为当前 Goal")}</span></button>`
      : "";
  const archiveAction = goal.archived_at
    ? `<button class="document-action" type="button" data-goal-archive="false" data-goal-id="${escapeHtml(goal.goal_id)}">${icon("refresh")}<span>${L("恢复")}</span></button>`
    : goal.fulfillment_state === "satisfied"
      ? `<button class="document-action" type="button" data-goal-archive="true" data-goal-id="${escapeHtml(goal.goal_id)}">${icon("archive")}<span>${L("归档")}</span></button>`
      : "";
  const trashAction = `<button class="document-action document-action--danger" type="button" data-open-goal-trash data-goal-id="${escapeHtml(goal.goal_id)}" data-goal-title="${escapeHtml(goal.title)}">${icon("archive")}<span>${L("移入回收站")}</span></button>`;
  const moreActions = `<details class="goal-more"><summary aria-label="${L("更多操作")}">${icon("more")}</summary><div>${archiveAction}${trashAction}</div></details>`;
  return `<article class="goal-document" data-goal-view="${escapeHtml(goal.goal_id)}"${selected ? "" : " hidden"}>
    <header class="goal-header">
      <div class="goal-title-row"><div class="goal-title-copy"><small>${escapeHtml(goal.goal_id)}</small><h1>${escapeHtml(goal.title)}</h1></div><div class="goal-title-actions">${renderStatus(item.status)}${activeGoalAction}${moreActions}</div></div>
      <dl class="goal-meta"><div>${icon("clock")}<dt>${L("创建于")}</dt><dd>${formatDate(goal.created_at)}</dd></div><div>${icon("history")}<dt>${L("更新于")}</dt><dd>${formatDate(goal.updated_at)}</dd></div><div>${icon("user")}<dt>${L("负责人")}</dt><dd>${escapeHtml(owner)}</dd></div><div>${icon("target")}<dt>${L("优先级")}</dt><dd><mark>${priorityLabel} · ${goal.priority}</mark></dd></div>${goal.archived_at ? `<div>${icon("archive")}<dt>${L("归档于")}</dt><dd>${formatDate(goal.archived_at)}</dd></div>` : ""}</dl>
    </header>
    ${renderGoalSituationStrip(item, view)}
    <section class="document-section">
      ${sectionHeading("book", "目标是什么", "先说明用户或项目会得到什么，而不是先讲实现名词")}
      ${renderDraftGaps(goal)}
      <div class="business-copy"><p class="outcome"><strong>${L("要得到的结果：")}</strong>${escapeHtml(goal.outcome || L("待澄清"))}</p><p><strong>${L("为什么做：")}</strong>${escapeHtml(goal.why || L("待澄清"))}</p><p><strong>${L("事情如何运转：")}</strong>${escapeHtml(goal.business_logic || L("待澄清"))}</p></div>
    </section>
    <section class="document-section">
      ${sectionHeading("clipboard", "怎样才算完成", "把验收、范围和依赖放在一起，先明确工作的边界")}
      <div class="document-subsection" id="acceptance-${escapeHtml(goal.goal_id)}">
        ${subsectionHeading("clipboard", "验收标准", "每一条都应该可以明确判断通过或不通过")}
        ${renderAcceptance(item)}
      </div>
      <div class="document-subsection">
        ${subsectionHeading("folder", "范围、输入与输出", "这些内容共同构成 Goal Contract 的执行边界")}
        ${renderScope(item)}
      </div>
      <div class="document-subsection" id="relations-${escapeHtml(goal.goal_id)}">
        ${subsectionHeading("tree", "和其他 Goal 的关系", "区分它属于哪个目标，以及开始前必须等待什么")}
        ${renderRelations(item, view)}
      </div>
      ${renderDraftEditor(item)}
    </section>
    <section class="document-section runtime-section" data-section="execution" id="execution-${escapeHtml(goal.goal_id)}">
      ${sectionHeading("workflow", "现在怎么推进", "集中查看阻塞、认领、执行、证据和复核")}
      <div class="document-subsection">
        ${subsectionHeading("blocked", "当前阻塞", "这些事实决定当前能否继续领取或完成")}
        ${renderReasons(item)}
      </div>
      <div class="document-subsection">
        ${subsectionHeading("workflow", "执行与证明", "GoalBoard 记录事实，Runtime 主动选择并推进")}
        <div class="runtime-grid"><section><h3>Claim <span>${L("认领")}</span></h3>${renderClaimCell(item)}</section><section><h3>Run <span>${L("行动")}</span></h3>${renderRunCell(item)}</section><section><h3>Evidence <span>${L("证据")}</span></h3>${renderEvidenceCell(item)}</section><section><h3>Review <span>${L("复核")}</span></h3>${renderReviewCell(item)}</section></div>
        <p class="runtime-note">${L("这里不会启动或分配 Runtime；Runtime 通过 MCP 主动读取 Available Goal 并认领。")}</p>
      </div>
    </section>
    <section class="document-section">
      ${sectionHeading("shield", "风险与规则", "把可能出问题的地方和执行约束放在同一处")}
      <div class="document-subsection">
        ${subsectionHeading("risk", "风险与影响", "记录触发条件、影响范围、负责人和处理方式")}
        ${renderSafety(item, view)}
      </div>
      <div class="document-subsection" data-section="policy" id="policy-${escapeHtml(goal.goal_id)}">
        ${subsectionHeading("settings", "Runtime 与 Review Policy", "分别维护项目默认和当前 Goal 的额外规则")}
        ${renderPolicyEditor(item)}
      </div>
    </section>
    <section class="document-section">
      ${sectionHeading("history", "历史", "回看发生过什么、用户决策和完整工程记录")}
      ${renderHistory(item)}
      ${renderFullRecords(item)}
    </section>
  </article>`;
}

function renderTrashGoalDocument(item: WebGoalView, selected: boolean): string {
  const goal = item.goal;
  const trashEvent = item.events.find((event) => event.type === "goal.trashed");
  const owner = goal.trashed_by ?? trashEvent?.actor_id ?? L("未记录");
  return `<article class="goal-document trash-goal-document" data-goal-view="${escapeHtml(goal.goal_id)}"${selected ? "" : " hidden"}>
    <header class="goal-header">
      <div class="goal-title-row"><div class="goal-title-copy"><small>${escapeHtml(goal.goal_id)}</small><h1>${escapeHtml(goal.title)}</h1></div><div class="goal-title-actions">${renderStatus("trashed")}<button class="document-action" type="button" data-open-goal-restore data-goal-id="${escapeHtml(goal.goal_id)}" data-goal-title="${escapeHtml(goal.title)}">${icon("refresh")}<span>${L("恢复")}</span></button></div></div>
      <dl class="goal-meta"><div>${icon("archive")}<dt>${L("移入于")}</dt><dd>${formatDate(goal.trashed_at)}</dd></div><div>${icon("user")}<dt>${L("操作人")}</dt><dd>${escapeHtml(owner)}</dd></div><div>${icon("history")}<dt>${L("最近更新")}</dt><dd>${formatDate(goal.updated_at)}</dd></div></dl>
    </header>
    <section class="document-section">
      ${sectionHeading("archive", "回收站状态", "这不是永久删除；恢复后仍是同一个 Goal")}
      <div class="trash-summary"><p><strong>${L("Goal 的 Contract、Run、Evidence 与事件历史都已保留。")}</strong>${L("移入时仍生效的关联关系会临时停止；恢复时，只有两端都不在回收站的关系才会安全恢复。")}</p>${trashEvent ? `<p><strong>移入原因：</strong>${escapeHtml(trashEvent.reason)}</p>` : ""}</div>
    </section>
    <section class="document-section">
      ${sectionHeading("book", "原始目标")}
      <div class="business-copy"><p class="outcome"><strong>${L("要得到的结果：")}</strong>${escapeHtml(goal.outcome || L("待澄清"))}</p><p><strong>${L("为什么做：")}</strong>${escapeHtml(goal.why || L("待澄清"))}</p><p><strong>${L("事情如何运转：")}</strong>${escapeHtml(goal.business_logic || L("待澄清"))}</p></div>
    </section>
    <section class="document-section">
      ${sectionHeading("refresh", "恢复到 Goal Tree", "恢复不会创建新 Goal，也不会自动启动 Runtime")}
      <div class="trash-restore-row"><p>${L("确认恢复后，这条 Goal 会回到原来的日常列表；如果有关联仍不能安全恢复，系统会保留它们为待处理事实。")}</p><button class="button-primary" type="button" data-open-goal-restore data-goal-id="${escapeHtml(goal.goal_id)}" data-goal-title="${escapeHtml(goal.title)}">${icon("refresh")}<span>${L("恢复这个 Goal")}</span></button></div>
    </section>
  </article>`;
}

export type GoalDocumentCollection = "current" | "archive" | "trash";

/**
 * Render one Goal document through the same renderer used by the full page.
 * Tree navigation loads this fragment on demand, so hidden Goal forms never
 * accumulate in the live DOM.
 */
export function renderGoalDocumentFragment(
  view: GoalBoardWebView,
  goalId: string,
  collection: GoalDocumentCollection = "current",
): string | null {
  const items = collection === "trash"
    ? view.trashed_goals
    : collection === "archive"
      ? view.archived_goals
      : view.goals;
  const item = items.find((candidate) => candidate.goal.goal_id === goalId);
  if (!item) return null;
  const html = collection === "trash"
    ? renderTrashGoalDocument(item, true)
    : renderGoalDocument(item, view, true);
  return prefixLocalLinks(html, view.route_prefix);
}

function renderGoalTrashDialog(): string {
  return `<dialog class="create-dialog goal-trash-dialog" data-goal-trash-dialog aria-labelledby="goal-trash-dialog-title">
    <form method="dialog" class="dialog-shell" data-goal-trash-form data-live-form="goal-trash">
      <header><div><span class="dialog-icon dialog-icon--danger" data-goal-trash-icon>${icon("archive")}</span><div><h2 id="goal-trash-dialog-title" data-goal-trash-title>${L("移入回收站")}</h2><p data-goal-trash-description>${L("请先确认这条 Goal 和本次操作原因。")}</p></div></div><button class="icon-button" type="button" data-close-goal-trash aria-label="${L("关闭")}">${icon("x")}</button></header>
      <div class="dialog-body">
        <p class="goal-trash-target"><strong data-goal-trash-target-title>${L("未选择 Goal")}</strong><small data-goal-trash-target-id></small></p>
        <p class="goal-trash-note" data-goal-trash-note>${L("该操作可恢复：Goal 历史会保留，当前仍生效的关联关系会暂时停止。若还有有效 Claim 或执行中的 Run，系统不会改动 Goal，而会告诉你先结束哪项工作。")}</p>
        <label><span data-goal-trash-reason-label>${L("移入原因")}</span><textarea name="reason" rows="3" required maxlength="4000" placeholder="${L("说明为什么暂时不再保留这条 Goal")}"></textarea></label>
        <p class="form-error" data-goal-trash-error role="alert" hidden></p>
      </div>
      <footer><button type="button" data-close-goal-trash>${L("取消")}</button><button class="button-danger" type="submit" data-goal-trash-submit>${L("移入回收站")}</button></footer>
    </form>
  </dialog>`;
}

function renderCreateDialog(view: GoalBoardWebView): string {
  const options = sortGoals(view.goals)
    .map((item) => `<option value="${escapeHtml(item.goal.goal_id)}" data-goal-name="${escapeHtml(item.goal.title)}">${escapeHtml(item.goal.title)} · ${escapeHtml(item.goal.goal_id)}</option>`)
    .join("");
  const dependencyOptions = sortGoals(view.goals)
    .map((item) => `<label class="goal-choice"><input type="checkbox" name="dependency_goal_ids" value="${escapeHtml(item.goal.goal_id)}" data-goal-name="${escapeHtml(item.goal.title)}"><span><strong>${escapeHtml(item.goal.title)}</strong><small>${escapeHtml(item.goal.goal_id)}</small></span></label>`)
    .join("");
  return `<dialog class="create-dialog" data-create-dialog aria-labelledby="create-dialog-title">
    <form method="dialog" class="dialog-shell" data-create-form>
      <header><div><span class="dialog-icon">${icon("plus")}</span><div><h2 id="create-dialog-title">${L("新建目标")}</h2><p>${L("先记录需求事实，再由澄清者补全 Contract 与拆分。")}</p></div></div><button class="icon-button" type="button" data-close-create aria-label="${L("关闭")}">${icon("x")}</button></header>
      <div class="dialog-body">
        <div class="field-row field-row--split"><label><span>Goal ID <small>${L("可选")}</small></span><input name="goal_id" autocomplete="off" placeholder="${L("例如 GOAL-AUTHORING")}"></label><label><span>${L("优先级")}</span><input name="priority" type="number" min="0" max="100" value="50"></label></div>
        <label><span>${L("目标名称")}</span><input name="title" required maxlength="120" placeholder="${L("一句话说明要完成什么")}"></label>
        <label><span>${L("要得到的结果 ")}<small>${L("可稍后补")}</small></span><textarea name="outcome" rows="2" placeholder="${L("完成后，用户或系统获得什么可观察结果")}"></textarea></label>
        <label><span>${L("为什么做 ")}<small>${L("可稍后补")}</small></span><textarea name="why" rows="2" placeholder="${L("这个问题为什么值得现在解决")}"></textarea></label>
        <label><span>${L("业务逻辑 ")}<small>${L("可稍后补")}</small></span><textarea name="business_logic" rows="3" placeholder="${L("用非技术语言说明事情如何运转、边界在哪里")}"></textarea></label>
        <label><span>${L("验收条件 ")}<small>${L("每行一条，可稍后补")}</small></span><textarea name="acceptance_criteria" rows="3" placeholder="${L("例如：可以创建 Goal，并在左侧 Tree 中立即看到")}"></textarea></label>
        <section class="relation-field" aria-labelledby="parent-relation-title">
          <div class="relation-field-heading"><span>${L("目录层级")}</span><div><h3 id="parent-relation-title">${L("它属于哪个更大的 Goal？ ")}<small>${L("可选")}</small></h3><p id="parent-relation-hint">${L("表示“它是这个 Goal 的一部分”，只决定 Tree 中放在哪里，不要求上级 Goal 先完成。")}</p></div></div>
          <label><span>${L("所属上级 Goal")}</span><select name="parent_goal_id" aria-describedby="parent-relation-hint parent-relation-preview"><option value="">${L("作为独立 Goal，不指定上级")}</option>${options}</select></label>
          <p class="relation-preview" id="parent-relation-preview" data-parent-preview>${L("关系预览：新 Goal 将作为独立 Goal 出现在 Tree 中。")}</p>
        </section>
        <fieldset class="relation-field" aria-describedby="dependency-relation-hint dependency-relation-preview">
          <legend><span>${L("执行前置")}</span><div><strong>${L("开始前必须等哪些 Goal 完成？ ")}<small>${L("可选")}</small></strong><small id="dependency-relation-hint">${L("只有确实要消费对方结果时才选择；这会成为领取和完成的硬门禁。")}</small></div></legend>
          <div class="goal-choice-list">${dependencyOptions}</div>
          <p class="relation-preview" id="dependency-relation-preview" data-dependency-preview>${L("关系预览：当前没有执行前置，Goal 可以独立推进。")}</p>
        </fieldset>
        <p class="form-error" data-create-error role="alert" hidden></p>
      </div>
      <footer><button type="button" data-close-create>${L("取消")}</button><button class="button-primary" type="submit">${L("创建草稿 Goal")}</button></footer>
    </form>
  </dialog>`;
}

const STYLES = `
  :root {
    color-scheme: light;
    --page: #eef3fa; --paper: #fff; --ink: #171a21; --muted: #68707d;
    --faint: #9299a4; --line: #dfe3e8; --line-strong: #cdd3da; --rail: #e7eef8;
    --blue: #1677ff; --blue-dark: #0d63d8; --blue-soft: #eaf3ff;
    --green: #168a4b; --green-soft: #eaf7ef; --amber: #b66a00;
    --amber-soft: #fff4dc; --red: #c63838; --red-soft: #fff0f0;
    --terminal: #1b2129; --terminal-ink: #e8edf2;
    --shadow: 0 8px 28px rgba(26, 38, 52, .12);
    --font: Inter, "SF Pro Text", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { margin: 0; overflow: hidden; background: var(--page); color: var(--ink); font: 14px/1.55 var(--font); }
  button, input, textarea, select { font: inherit; }
  button { color: inherit; }
  button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible, a:focus-visible { outline: 2px solid color-mix(in srgb, var(--blue), transparent 30%); outline-offset: 2px; }
  svg { width: 1em; height: 1em; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  [hidden] { display: none !important; }
  .icon-sprite { position: absolute; width: 0; height: 0; overflow: hidden; }
  .app { min-width: 0; height: 100%; overflow: hidden; display: grid; grid-template-rows: 58px minmax(0, 1fr); }
  .topbar { position: relative; min-width: 0; display: flex; align-items: center; border-bottom: 1px solid var(--line-strong); background: color-mix(in srgb, var(--rail) 82%, #fff); box-shadow: 0 1px 2px rgba(18, 28, 40, .06); z-index: 10; }
  .brand { min-width: 182px; height: 100%; padding: 0 28px; display: flex; align-items: center; gap: 11px; border-right: 1px solid var(--line); }
  .brand svg { color: var(--blue); font-size: 22px; stroke-width: 2.4; }
  .brand strong { font-size: 19px; letter-spacing: -.02em; }
  .project-bar { min-width: 0; height: 100%; display: flex; align-items: center; gap: 10px; }
  .project-context { min-width: 0; height: 100%; padding: 0 16px 0 24px; display: flex; align-items: center; gap: 8px; white-space: nowrap; color: #343a44; }
  .project-context small { color: var(--muted); }
  .project-context a { color: var(--blue-dark); font-size: 12px; font-weight: 650; text-decoration: none; }
  .project-context a:hover { text-decoration: underline; }
  .project-decisions { height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 5px; background: #fff; color: #3b434e; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 650; text-decoration: none; flex: 0 0 auto; }
  a.project-decisions { color: #3b434e; text-decoration: none; }
  .project-decisions:hover, a.project-decisions:hover { color: var(--blue-dark); background: var(--blue-soft); border-color: color-mix(in srgb, var(--blue), var(--line) 55%); }
  .project-decisions.is-current, a.project-decisions.is-current { color: var(--blue-dark); background: var(--blue-soft); border-color: #bcd4f2; }
  .project-decisions svg { font-size: 14px; }
  .project-decisions strong { font-variant-numeric: tabular-nums; color: var(--muted); font-size: 12px; }
  .project-decisions.has-pending { border-color: color-mix(in srgb, var(--amber), white 42%); background: var(--amber-soft); }
  .project-decisions.has-pending, a.project-decisions.has-pending { color: #6d4e10; }
  .project-decisions.has-pending:hover, a.project-decisions.has-pending:hover { color: #6d4e10; background: #ffe7b5; border-color: color-mix(in srgb, var(--amber), white 28%); }
  .project-decisions.has-pending.is-current, a.project-decisions.has-pending.is-current { color: #6d4e10; background: var(--amber-soft); border-color: color-mix(in srgb, var(--amber), white 28%); }
  .project-decisions.has-pending strong { color: var(--amber); }
  .project-demo { color: var(--muted); font-size: 12px; white-space: nowrap; }
  .sync-state { margin-left: 2px; padding-left: 11px; border-left: 1px solid var(--line); color: var(--muted); font-size: 11px; }
  .sync-state::before { content: ""; display: inline-block; width: 6px; height: 6px; margin-right: 6px; border-radius: 50%; background: var(--green); }
  .sync-state.is-syncing::before { background: var(--blue); animation: pulse 1s infinite; }
  .sync-state.is-offline::before { background: var(--red); }
  .top-spacer { min-width: 0; flex: 1; }
  .top-action { height: 34px; margin-right: 10px; padding: 0 12px; border: 0; border-radius: 5px; background: transparent; color: #3b434e; display: inline-flex; align-items: center; gap: 8px; font-weight: 650; cursor: pointer; white-space: nowrap; }
  a.top-action { color: #3b434e; text-decoration: none; }
  .top-action:hover, a.top-action:hover { color: var(--blue-dark); background: var(--blue-soft); }
  .top-action.is-current, a.top-action.is-current { color: var(--blue-dark); background: var(--blue-soft); }
  .top-action svg { font-size: 17px; }
  .workspace { position: relative; min-width: 0; min-height: 0; width: 100%; overflow: hidden; display: grid; grid-template-columns: var(--tree-width, clamp(280px, 22vw, 360px)) 5px minmax(0, 1fr); }
  .tree-pane { position: relative; min-width: 0; min-height: 0; overflow: hidden; display: grid; grid-template-rows: auto minmax(0, 1fr) 48px; background: color-mix(in srgb, var(--rail) 36%, #fff); border-right: 1px solid var(--line-strong); container-type: inline-size; }
  .tree-resizer { position: relative; z-index: 3; cursor: col-resize; background: color-mix(in srgb, var(--rail) 36%, #fff); touch-action: none; }
  .tree-resizer::before, .tui-resizer::before { content: ""; position: absolute; inset: 0 -5px; }
  .tree-resizer::after { content: ""; position: absolute; inset: 0 auto 0 2px; width: 1px; background: var(--line-strong); }
  .tree-resizer:hover::after, .tree-resizer:focus-visible::after, .tree-resizer.is-dragging::after { width: 2px; background: var(--blue); }
  .icon-button { width: 32px; height: 32px; padding: 0; border: 0; border-radius: 4px; background: transparent; display: grid; place-items: center; cursor: pointer; }
  .icon-button:hover, .icon-button.is-active { background: var(--blue-soft); color: var(--blue); }
  .tree-chrome { position: relative; z-index: 4; padding: 10px 10px 8px; border-bottom: 1px solid var(--line); background: color-mix(in srgb, var(--rail) 55%, #fff); display: grid; gap: 6px; }
  .tree-search { position: relative; display: flex; align-items: center; }
  .tree-search svg { position: absolute; left: 10px; color: var(--muted); pointer-events: none; }
  .tree-search input { width: 100%; height: 32px; padding: 0 42px 0 32px; border: 1px solid var(--line); border-radius: 5px; background: #fff; }
  .tree-search input:hover, .tree-search input:focus { border-color: color-mix(in srgb, var(--blue), var(--line-strong) 42%); }
  .tree-search kbd { position: absolute; right: 8px; color: var(--faint); border: 1px solid var(--line); border-radius: 4px; padding: 0 5px; font: 12px/20px var(--font); background: #fff; }
  .tree-tools { display: flex; flex-wrap: nowrap; align-items: center; gap: 1px; min-width: 0; }
  .tree-tool { height: 28px; padding: 0 6px; border: 0; border-radius: 4px; background: transparent; color: #4a5260; display: inline-flex; align-items: center; gap: 4px; font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; white-space: nowrap; text-decoration: none; }
  a.tree-tool { color: #4a5260; text-decoration: none; }
  .tree-tool:hover, a.tree-tool:hover { color: var(--blue-dark); background: var(--blue-soft); }
  .tree-tool.is-current, .tree-tool.is-active, a.tree-tool.is-current { color: var(--blue-dark); background: var(--blue-soft); }
  .tree-tool svg { font-size: 14px; }
  .tree-tool small { color: var(--muted); font-variant-numeric: tabular-nums; font-weight: 650; }
  .tree-tool.is-current small { color: var(--blue-dark); }
  @container (max-width: 300px) {
    .tree-tool span, .tree-tool small { display: none; }
    .tree-tool { width: 28px; padding: 0; justify-content: center; }
  }
  .tree-filter-control { position: static; display: flex; align-items: center; }
  .tree-filter { position: absolute; z-index: 12; top: calc(100% + 4px); left: 10px; right: 10px; width: auto; max-height: min(430px, calc(100dvh - 68px)); overflow: auto; padding: 13px 14px 12px; color: var(--ink); background: #fff; box-shadow: 0 9px 24px rgba(25, 34, 45, .14); }
  .tree-filter[hidden] { display: none; }
  .tree-filter > header { display: flex; align-items: baseline; gap: 10px; }
  .tree-filter > header strong { font-size: 13px; }
  .tree-filter > header button { margin-left: auto; padding: 0; border: 0; color: var(--blue-dark); background: transparent; font: inherit; font-size: 12px; cursor: pointer; }
  .tree-filter > header button:disabled { color: var(--faint); cursor: default; }
  .tree-filter > p { margin: 5px 0 10px; color: var(--muted); font-size: 12px; line-height: 1.5; }
  .tree-filter-options { display: grid; max-height: 280px; overflow: auto; scrollbar-width: none; }
  .tree-filter-options::-webkit-scrollbar { display: none; }
  .tree-filter-option { min-width: 0; min-height: 34px; padding: 5px 2px; border-top: 1px solid #edf0f3; display: grid; grid-template-columns: 17px minmax(0, 1fr) auto; align-items: center; gap: 8px; cursor: pointer; }
  .tree-filter-option:first-child { border-top: 0; }
  .tree-filter-option input { width: 15px; height: 15px; margin: 0; accent-color: var(--blue); }
  .tree-filter-option .goal-status { min-width: 0; white-space: normal; font-size: 12px; }
  .tree-filter-option small { color: var(--muted); font-size: 11px; }
  .tree-filter-summary { margin-bottom: 0 !important; padding-top: 9px; border-top: 1px solid var(--line); }
  .tree-scroll { min-height: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; padding: 8px 12px 16px; scrollbar-width: none; -ms-overflow-style: none; }
  .tree-scroll::-webkit-scrollbar { display: none; }
  .tree-filter-empty { margin: 28px 5px; padding: 14px 12px; color: var(--muted); background: #f4f6f8; font-size: 13px; line-height: 1.5; text-align: center; }
  .tree-filter-empty p { margin: 0 0 8px; }
  .tree-filter-empty button { border: 0; color: var(--blue-dark); background: transparent; font: inherit; cursor: pointer; }
  .goal-tree, .tree-children { list-style: none; padding: 0; margin: 0; }
  .tree-item { position: relative; }
  .tree-children { margin-left: 18px; padding-left: 8px; border-left: 1px solid var(--line); }
  .tree-item.is-collapsed > .tree-children { display: none; }
  .tree-item.is-collapsed > .tree-row .tree-toggle svg { transform: rotate(-90deg); }
  .tree-row { min-width: 0; min-height: 38px; display: flex; align-items: center; }
  .tree-toggle, .tree-guide { flex: 0 0 20px; width: 20px; height: 26px; border: 0; padding: 0; background: transparent; display: grid; place-items: center; color: #7b8490; }
  .tree-toggle { cursor: pointer; }
  .tree-toggle:hover { color: var(--blue); }
  .tree-node { min-width: 0; min-height: 34px; flex: 1; padding: 3px 8px; border: 0; border-radius: 4px; background: transparent; display: flex; align-items: center; cursor: pointer; text-align: left; }
  .tree-node:hover { background: color-mix(in srgb, var(--blue-soft) 48%, #fff); }
  .tree-node.is-selected { color: #fff; background: linear-gradient(180deg, #328bff, #1677ed); box-shadow: inset 0 0 0 1px rgba(14, 94, 199, .22); }
  .tree-copy { min-width: 0; flex: 1; display: grid; overflow: hidden; line-height: 1.2; }
  .tree-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 600; }
  .tree-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--faint); font-size: 11px; letter-spacing: .02em; }
  .tree-node.is-selected .tree-copy small { color: rgba(255, 255, 255, .75); }
  .tree-deps { display: grid; gap: 2px; margin: 0 0 8px 20px; }
  .tree-dep { width: 100%; min-width: 0; padding: 2px 8px 5px; border: 0; border-radius: 4px; background: transparent; color: inherit; display: flex; align-items: flex-start; gap: 6px; cursor: pointer; text-align: left; }
  .tree-dep:hover { background: color-mix(in srgb, var(--blue-soft) 42%, #fff); }
  .tree-dep-mark { flex: 0 0 auto; margin-top: 2px; color: var(--faint); }
  .tree-dep-mark svg { width: 12px; height: 12px; }
  .tree-dep-copy { min-width: 0; display: grid; gap: 1px; }
  .tree-dep-copy strong { color: #3b434e; font-size: 11px; font-weight: 600; overflow-wrap: anywhere; }
  .tree-dep-copy small { color: var(--muted); font-size: 11px; font-weight: 400; line-height: 1.35; overflow-wrap: anywhere; }
  .tree-dep-copy em { font-style: normal; font-size: 11px; font-weight: 500; color: var(--muted); }
  .tree-dep.is-waiting em { color: #8a6a24; }
  .tree-dep.is-ready em { color: var(--green); }
  .tree-dep.is-blocked em { color: var(--red); }
  .goal-status { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; font-size: 12px; font-weight: 650; }
  .goal-status svg { font-size: 13px; }
  .goal-status--clarifying, .goal-status--executing, .goal-status--reviewing, .goal-status--revalidating { color: var(--blue); }
  .goal-status--clarification_pending, .goal-status--execution_pending, .goal-status--review_pending, .goal-status--revalidation_pending { color: #1768bf; }
  .goal-status--clarification_blocked, .goal-status--execution_blocked, .goal-status--review_blocked, .goal-status--revalidation_blocked, .goal-status--invalidated { color: var(--red); }
  .goal-status--waiting_children { color: #5c6570; }
  .goal-status--satisfied { color: var(--green); }
  .goal-status--trashed, .goal-status--archived { color: #626b76; }
  .tree-node.is-selected .goal-status { color: #fff; }
  .tree-footer { padding: 0 22px; border-top: 1px solid var(--line); display: flex; align-items: center; color: #3c434d; background: color-mix(in srgb, var(--rail) 55%, #fff); }
  .tree-footer small { margin-left: auto; color: var(--muted); }
  .document-pane { min-width: 0; overflow: auto; background: var(--paper); scrollbar-width: none; -ms-overflow-style: none; }
  .document-pane::-webkit-scrollbar { display: none; }
  .workspace.is-desktop-tui { grid-template-columns: var(--tree-width, clamp(280px, 22vw, 360px)) 5px minmax(0, 1fr) 5px var(--tui-width, 480px); }
  .tui-resizer { position: relative; z-index: 3; cursor: col-resize; background: var(--rail); touch-action: none; }
  .tui-resizer::after { content: ""; position: absolute; inset: 0 2px 0 auto; width: 1px; background: var(--line-strong); }
  .tui-resizer:hover::after, .tui-resizer:focus-visible::after, .tui-resizer.is-dragging::after { width: 2px; background: var(--blue); }
  .tui-pane { position: relative; min-width: 0; min-height: 0; overflow: hidden; display: grid; grid-template-rows: 40px minmax(0, 1fr); background: color-mix(in srgb, var(--rail) 70%, #fff); container-type: inline-size; }
  .tui-tabs { min-width: 0; padding: 0 8px 0 10px; display: flex; align-items: center; gap: 4px; border-bottom: 1px solid var(--line); background: color-mix(in srgb, var(--rail) 70%, #fff); }
  .tui-tab-list { min-width: 0; flex: 1; height: 100%; display: flex; align-items: center; gap: 2px; overflow: auto; scrollbar-width: none; }
  .tui-tab-list::-webkit-scrollbar { display: none; }
  .tui-tab { max-width: 168px; height: 28px; padding: 0 6px 0 10px; border: 0; border-radius: 4px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; font-weight: 650; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; white-space: nowrap; transition: background .16s ease, color .16s ease; }
  .tui-tab:hover { color: var(--blue-dark); background: var(--blue-soft); }
  .tui-tab.is-active { color: var(--ink); background: #fff; box-shadow: inset 0 0 0 1px var(--line); }
  .tui-tab.is-exited { color: var(--faint); }
  .tui-tab-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .tui-tab-close { width: 22px; height: 22px; flex: 0 0 22px; padding: 0; border: 0; border-radius: 3px; background: transparent; color: var(--faint); display: grid; place-items: center; }
  .tui-tab-close svg { width: 12px; height: 12px; }
  .tui-tab-close:hover { color: var(--red); background: var(--red-soft); }
  .tui-add { height: 28px; flex: 0 0 auto; padding: 0 9px; border: 0; border-radius: 4px; background: transparent; color: var(--muted); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px; font: inherit; font-size: 12px; font-weight: 650; white-space: nowrap; transition: background .16s ease, color .16s ease; }
  .tui-add:hover, .tui-add[aria-expanded="true"] { color: var(--blue); background: var(--blue-soft); }
  .tui-collapse { width: 28px; height: 28px; flex: 0 0 auto; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--muted); display: grid; place-items: center; cursor: pointer; transition: background .16s ease, color .16s ease; }
  .tui-collapse:hover { color: var(--blue); background: var(--blue-soft); }
  .tui-collapse svg { width: 14px; height: 14px; }
  .workspace.is-desktop-tui.is-tui-collapsed { grid-template-columns: var(--tree-width, clamp(280px, 22vw, 360px)) 5px minmax(0, 1fr) 0 0; }
  .workspace.is-tui-collapsed .tui-resizer, .workspace.is-tui-collapsed .tui-pane { visibility: hidden; pointer-events: none; }
  .tui-expand { display: none; }
  .workspace.is-tui-collapsed .tui-expand { position: absolute; top: 50%; right: 0; z-index: 8; width: 36px; min-height: 112px; padding: 14px 0; border: 1px solid var(--line-strong); border-right: 0; border-radius: 8px 0 0 8px; background: color-mix(in srgb, var(--rail) 40%, #fff); box-shadow: -4px 2px 16px rgba(26, 38, 52, .1); color: var(--ink); transform: translateY(-50%); cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
  .workspace.is-tui-collapsed .tui-expand:hover { color: var(--blue-dark); background: var(--blue-soft); }
  .workspace.is-tui-collapsed .tui-expand:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
  .workspace.is-tui-collapsed .tui-expand svg { width: 16px; height: 16px; }
  .tui-expand-label { display: none; }
  .workspace.is-tui-collapsed .tui-expand-label { display: block; writing-mode: vertical-rl; font-size: 12px; font-weight: 650; letter-spacing: .12em; line-height: 1; }
  .tui-stage { min-width: 0; min-height: 0; overflow: hidden; padding: 10px 12px 12px; display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 8px; }
  .tui-chrome { min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
  .tui-chrome-actions { min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .tui-chrome button { min-height: 28px; padding: 0 10px; border: 1px solid var(--line-strong); border-radius: 5px; background: #fff; color: var(--ink); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; transition: background .16s ease, border-color .16s ease, color .16s ease, transform .1s ease; }
  .tui-chrome button:hover:not(:disabled) { border-color: #b8d3f5; background: var(--blue-soft); color: var(--blue-dark); }
  .tui-chrome button:active:not(:disabled) { transform: scale(.98); }
  .tui-chrome button:disabled { color: var(--faint); cursor: default; }
  .tui-chrome .tui-advance { border-color: var(--blue); color: #fff; background: var(--blue); }
  .tui-chrome .tui-advance:hover:not(:disabled) { background: var(--blue-dark); color: #fff; }
  .tui-status { margin: 0 0 0 auto; min-width: 8rem; flex: 1 1 12rem; color: var(--muted); font-size: 11px; font-weight: 650; display: flex; align-items: center; gap: 6px; line-height: 1.4; }
  .tui-status:empty { display: none; }
  .tui-status::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--faint); flex: 0 0 auto; }
  .tui-status[data-tone="live"]::before { background: var(--green); }
  .tui-status[data-tone="busy"]::before { background: var(--blue); animation: pulse 1s infinite; }
  .tui-status[data-tone="error"]::before { background: var(--red); }
  .tui-terminal { position: relative; min-width: 0; min-height: 140px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--ink) 55%, var(--terminal)); border-radius: 6px; background: var(--terminal); }
  .tui-terminal .tui-xterm { position: absolute; inset: 10px 12px 12px; opacity: 0; transition: opacity .2s cubic-bezier(.16, 1, .3, 1); }
  .tui-terminal .tui-xterm.is-ready { opacity: 1; }
  .tui-empty { position: absolute; inset: 0; z-index: 1; min-height: 0; padding: 28px 22px; color: color-mix(in srgb, var(--terminal-ink) 72%, var(--terminal)); display: grid; place-content: center; justify-items: center; text-align: center; gap: 6px; }
  .tui-empty-mark { width: 36px; height: 36px; margin-bottom: 4px; border-radius: 6px; color: color-mix(in srgb, var(--terminal-ink) 48%, var(--terminal)); background: color-mix(in srgb, var(--terminal-ink) 8%, var(--terminal)); display: grid; place-items: center; }
  .tui-empty-mark svg { width: 18px; height: 18px; }
  .tui-empty p { margin: 0; max-width: 28ch; font-size: 13px; line-height: 1.5; }
  .tui-empty strong { color: var(--terminal-ink); font-size: 14px; font-weight: 650; }
  .tui-menu { position: absolute; z-index: 20; top: 44px; right: 10px; width: min(320px, calc(100% - 20px)); padding: 14px; border: 1px solid var(--line-strong); border-radius: 8px; background: #fff; box-shadow: 0 8px 28px rgba(26, 38, 52, .12); display: grid; gap: 10px; opacity: 0; visibility: hidden; pointer-events: none; transform: translateY(-6px); transition: opacity .2s cubic-bezier(.16, 1, .3, 1), transform .2s cubic-bezier(.16, 1, .3, 1), visibility .2s; }
  .tui-menu.is-open { opacity: 1; visibility: visible; pointer-events: auto; transform: none; }
  .tui-menu > strong { font-size: 13px; letter-spacing: -.015em; }
  .tui-menu p { margin: 0; color: var(--muted); font-size: 12px; font-weight: 400; line-height: 1.45; }
  .tui-menu label { display: grid; gap: 4px; color: var(--ink); font-size: 12px; font-weight: 650; }
  .tui-menu input, .tui-menu select { min-height: 32px; padding: 0 8px; border: 1px solid var(--line-strong); border-radius: 5px; background: #fff; }
  .tui-runtime-choices { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .tui-runtime-choices button { min-height: 34px; border: 1px solid var(--line-strong); border-radius: 5px; background: #fff; cursor: pointer; text-align: left; padding: 0 10px; font-weight: 650; transition: background .16s ease, border-color .16s ease, color .16s ease; }
  .tui-runtime-choices button[data-tui-kind="generic"] { grid-column: 1 / -1; }
  .tui-runtime-choices button:hover, .tui-runtime-choices button.is-selected { border-color: #b8d3f5; background: var(--blue-soft); color: var(--blue-dark); }
  .tui-runtime-choices button:disabled { border-color: var(--line); background: #f4f6f8; color: var(--faint); cursor: not-allowed; display: grid; }
  .tui-runtime-choices button:disabled small { color: var(--faint); font-size: 10px; font-weight: 500; opacity: .85; }
  .tui-menu-missing { padding: 7px 9px; border-radius: 5px; background: var(--amber-soft); color: #7a5b12; }
  .tui-menu-actions { display: flex; justify-content: flex-end; gap: 6px; }
  .tui-menu-actions button { min-height: 32px; padding: 0 11px; border: 1px solid var(--line-strong); border-radius: 5px; background: #fff; cursor: pointer; font-weight: 650; }
  .tui-menu-actions button[type="submit"] { border-color: var(--blue); color: #fff; background: var(--blue); }
  @container (max-width: 380px) {
    .tui-add span, .tui-chrome [data-tui-copy] span { display: none; }
    .tui-add, .tui-chrome [data-tui-copy] { width: 28px; padding: 0; justify-content: center; }
  }
  .goal-document { width: min(100%, 1080px); margin: 0 auto; padding: 30px 38px 80px; container-type: inline-size; animation: document-in .24s cubic-bezier(.16, 1, .3, 1); }
  .goal-header { padding: 0 0 20px; border-bottom: 1px solid var(--line-strong); }
  .goal-title-row { display: flex; align-items: flex-start; gap: 18px; }
  .goal-title-actions { display: flex; align-items: center; gap: 8px; }
  .goal-title-copy { min-width: 0; flex: 1; display: grid; gap: 2px; }
  .goal-title-copy > small { color: var(--muted); font-size: 11px; font-weight: 600; letter-spacing: .04em; }
  .goal-title-row h1 { margin: 0; font-size: clamp(22px, 2.1vw, 29px); line-height: 1.3; letter-spacing: -.03em; }
  .goal-title-actions > .goal-status { padding: 0; border: 0; background: transparent; font-size: 13px; }
  .document-action { height: 34px; padding: 0 11px; border: 1px solid var(--line); border-radius: 5px; background: #fff; display: inline-flex; align-items: center; gap: 7px; cursor: pointer; }
  .document-action:hover { color: var(--blue); border-color: color-mix(in srgb, var(--blue), var(--line) 60%); }
  .document-action--quiet { border-color: transparent; background: transparent; color: var(--muted); }
  .document-action--quiet:hover { color: var(--blue-dark); background: var(--blue-soft); }
  .document-action--current { color: var(--blue-dark); border-color: #bcd4f2; background: var(--blue-soft); cursor: default; }
  .document-action--danger { color: #a52e2e; }
  .document-action--danger:hover { color: #a52e2e; border-color: #dfbaba; background: var(--red-soft); }
  .document-action:disabled { opacity: .55; cursor: wait; }
  .goal-more { position: relative; }
  .goal-more > summary { width: 34px; height: 34px; border: 1px solid var(--line); border-radius: 5px; background: #fff; display: grid; place-items: center; color: var(--muted); cursor: pointer; list-style: none; }
  .goal-more > summary::-webkit-details-marker { display: none; }
  .goal-more > summary:hover { color: var(--blue-dark); border-color: color-mix(in srgb, var(--blue), var(--line) 60%); }
  .goal-more[open] > summary { color: var(--blue-dark); border-color: #bcd4f2; background: var(--blue-soft); }
  .goal-more > div { position: absolute; z-index: 8; top: calc(100% + 6px); right: 0; min-width: 168px; padding: 6px; border: 1px solid var(--line-strong); border-radius: 6px; background: #fff; box-shadow: 0 8px 28px rgba(26, 38, 52, .12); display: grid; }
  .goal-more .document-action { width: 100%; justify-content: flex-start; border: 0; height: 32px; }
  .goal-situation { margin: 16px 0 0; border: 1px solid color-mix(in srgb, var(--blue), var(--line) 68%); border-radius: 5px; background: color-mix(in srgb, var(--blue-soft) 48%, #fff); display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .goal-situation-cell { min-width: 0; padding: 10px 12px; border-right: 1px solid var(--line); color: inherit; text-decoration: none; display: grid; gap: 2px; }
  .goal-situation-cell:last-child { border-right: 0; }
  .goal-situation-cell:hover { background: #f7faff; }
  .goal-situation-cell span { color: var(--muted); font-size: 11px; font-weight: 650; }
  .goal-situation-cell strong { min-width: 0; overflow-wrap: anywhere; font-size: 13px; }
  .goal-situation-cell small { color: var(--blue-dark); font-size: 11px; font-weight: 650; }
  .goal-situation-cell--static { cursor: default; }
  .goal-situation-cell--static:hover { background: transparent; }
  .goal-situation-cell--blocked strong { color: var(--red); }
  .goal-situation-cell--ready strong { color: var(--green); }
  .goal-situation-cell--muted strong { color: var(--muted); font-weight: 500; }
  .archive-empty { min-height: 100%; padding: 72px 28px; display: grid; place-content: center; justify-items: center; text-align: center; color: var(--muted); }
  .archive-empty svg { width: 30px; height: 30px; margin-bottom: 12px; color: var(--faint); }
  .archive-empty h1 { margin: 0 0 5px; color: var(--ink); font-size: 20px; }
  .archive-empty p { margin: 0 0 18px; }
  .archive-empty a { color: var(--blue); text-decoration: none; }
  .goal-meta { margin: 14px 0 0; display: flex; flex-wrap: wrap; gap: 10px 24px; color: var(--muted); }
  .goal-meta div { display: flex; align-items: center; gap: 6px; }
  .goal-meta svg { font-size: 14px; }
  .goal-meta dt { font-size: 12px; }
  .goal-meta dd { margin: 0; }
  .goal-meta mark { padding: 1px 5px; border-radius: 3px; color: var(--amber); background: var(--amber-soft); }
  .document-section { padding: 18px 0 20px; border-bottom: 1px solid var(--line); scroll-margin-top: 12px; }
  .section-heading { margin: 0 0 10px; display: flex; align-items: flex-start; gap: 9px; }
  .section-heading > span { width: 22px; height: 22px; margin-top: 1px; display: grid; place-items: center; color: var(--blue); }
  .section-heading h2 { margin: 0; font-size: 17px; letter-spacing: -.015em; }
  .section-heading p { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
  .document-subsection { margin: 16px 0 0 31px; padding-top: 16px; border-top: 1px solid var(--line); scroll-margin-top: 12px; }
  .document-subsection:first-of-type { margin-top: 6px; padding-top: 0; border-top: 0; }
  .subsection-heading { margin: 0 0 10px; display: flex; align-items: flex-start; gap: 8px; }
  .subsection-heading > span { width: 20px; height: 20px; display: grid; place-items: center; color: var(--blue-dark); }
  .subsection-heading h3 { margin: 0; font-size: 14px; letter-spacing: -.01em; }
  .subsection-heading p { margin: 1px 0 0; color: var(--muted); font-size: 11px; }
  .business-copy { padding-left: 31px; color: #303641; }
  .business-copy p { margin: 6px 0; }
  .business-copy .outcome { color: var(--ink); }
  .trash-summary { margin-left: 31px; color: #303641; }
  .trash-summary p { margin: 6px 0; }
  .trash-restore-row { margin-left: 31px; display: flex; align-items: center; justify-content: space-between; gap: 18px; color: #303641; }
  .trash-restore-row p { max-width: 62ch; margin: 0; }
  .trash-restore-row .button-primary { min-height: 36px; padding: 0 14px; border: 1px solid var(--blue); border-radius: 4px; display: inline-flex; align-items: center; gap: 7px; cursor: pointer; white-space: nowrap; }
  .draft-gaps { margin: 2px 0 12px 31px; padding: 10px 12px; border: 1px solid var(--line-strong); border-radius: 5px; background: var(--amber-soft); display: flex; align-items: center; gap: 14px; }
  .draft-gaps > div { min-width: 0; flex: 1; }
  .draft-gaps strong { color: var(--amber); }
  .draft-gaps p { margin: 2px 0 0; color: var(--ink); }
  .draft-gaps a { flex: 0 0 auto; color: var(--blue-dark); font-size: 12px; font-weight: 650; text-decoration: none; white-space: nowrap; }
  .draft-gaps a:hover { text-decoration: underline; }
  .doc-list { margin: 7px 0 0; padding-left: 19px; }
  .doc-list li { margin: 3px 0; }
  .empty-row { margin: 8px 0; color: var(--muted); font-size: 13px; }
  .empty-row--warning { padding: 10px 12px; color: var(--amber); background: var(--amber-soft); border-radius: 4px; }
  .clear-row { margin: 8px 0; display: flex; align-items: center; gap: 10px; color: var(--green); }
  .blocker-list, .check-list { list-style: none; padding: 0; margin: 4px 0 0; }
  .blocker-list li, .check-list li { display: flex; align-items: flex-start; gap: 10px; padding: 6px 0; }
  .blocker-list svg { flex: 0 0 auto; margin-top: 3px; color: var(--red); }
  .blocker-list span, .check-list li > span:last-child { display: grid; }
  .blocker-list small, .check-list small { color: var(--muted); }
  .check-box { flex: 0 0 15px; width: 15px; height: 15px; margin-top: 3px; border: 1px solid #aeb5bf; display: grid; place-items: center; }
  .check-box.is-checked { color: #fff; border-color: var(--blue); background: var(--blue); }
  .check-box svg { font-size: 12px; stroke-width: 3; }
`;

const MORE_STYLES = `
  .runtime-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--line-strong); border-radius: 5px; overflow: hidden; }
  .runtime-grid > section { min-width: 0; min-height: 174px; padding: 13px 15px; border-right: 1px solid var(--line-strong); }
  .runtime-grid > section:last-child { border-right: 0; }
  .runtime-grid h3 { margin: -13px -15px 12px; padding: 10px 15px; border-bottom: 1px solid var(--line); background: #fbfcfd; font-size: 14px; }
  .runtime-grid h3 span { color: var(--muted); font-weight: 500; }
  .runtime-facts, .policy-list { margin: 0; }
  .runtime-facts div, .policy-list div { display: grid; grid-template-columns: 66px minmax(0, 1fr); gap: 8px; margin: 5px 0; }
  .runtime-facts dt, .policy-list dt { color: var(--muted); }
  .runtime-facts dd, .policy-list dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
  .runtime-note { margin: 9px 0 0; color: var(--muted); font-size: 12px; }
  .ref-stack, .evidence-list, .review-list { display: grid; gap: 7px; margin-top: 9px; }
  .inline-ref { width: fit-content; max-width: 100%; padding: 0; border: 0; background: transparent; color: var(--blue-dark); display: inline-flex; align-items: center; gap: 5px; cursor: pointer; text-decoration: none; }
  .inline-ref:hover span { text-decoration: underline; }
  .inline-ref svg { flex: 0 0 auto; font-size: 13px; }
  .inline-ref span { min-width: 0; white-space: normal; overflow-wrap: anywhere; }
  .evidence-record, .review-row { display: flex; align-items: flex-start; gap: 8px; }
  .evidence-record > div, .review-row > span:last-child { min-width: 0; display: grid; gap: 3px; }
  .evidence-record header { min-width: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 5px 8px; }
  .evidence-record small, .review-row small { color: var(--muted); overflow-wrap: anywhere; }
  .evidence-record p { margin: 1px 0 0; color: #3c4652; font-size: 12px; overflow-wrap: anywhere; }
  .record-id { min-width: 0; padding: 0; border: 0; background: transparent; color: var(--blue-dark); font: inherit; font-size: 10px; cursor: pointer; overflow-wrap: anywhere; text-align: left; }
  .record-id:hover { text-decoration: underline; }
  .evidence-submit { margin-top: 13px; border-top: 1px solid var(--line-strong); border-bottom: 1px solid var(--line); }
  .evidence-submit > summary { min-height: 54px; padding: 9px 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; list-style: none; cursor: pointer; }
  .evidence-submit > summary::-webkit-details-marker { display: none; }
  .evidence-submit > summary > span { min-width: 0; display: grid; grid-template-columns: 22px minmax(0, 1fr); align-items: center; gap: 0 8px; }
  .evidence-submit > summary > span > svg { grid-row: span 2; color: var(--blue-dark); }
  .evidence-submit > summary strong { font-size: 13px; }
  .evidence-submit > summary small, .evidence-submit-note { color: var(--muted); font-size: 11px; }
  .evidence-submit > summary > svg { color: var(--muted); transition: transform .16s ease; }
  .evidence-submit[open] > summary > svg { transform: rotate(180deg); }
  .evidence-submit form { padding: 12px 0 15px; border-top: 1px solid var(--line); display: grid; gap: 12px; }
  .evidence-submit label { min-width: 0; display: grid; gap: 5px; }
  .evidence-submit label > span, .evidence-submit legend { font-weight: 650; }
  .evidence-submit label small { color: var(--muted); font-weight: 400; }
  .evidence-submit textarea, .evidence-submit select { width: 100%; min-width: 0; padding: 8px 9px; border: 1px solid var(--line-strong); border-radius: 4px; background: #fff; resize: vertical; }
  .evidence-criteria { min-width: 0; margin: 0; padding: 0; border: 0; }
  .evidence-criteria > div { max-height: 154px; overflow: auto; border: 1px solid var(--line); border-radius: 5px; }
  .evidence-criteria label { min-width: 0; padding: 8px 10px; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 8px; border-bottom: 1px solid #edf0f3; cursor: pointer; }
  .evidence-criteria label:last-child { border-bottom: 0; }
  .evidence-criteria input { margin-top: 3px; }
  .evidence-criteria label span { min-width: 0; display: grid; gap: 1px; }
  .evidence-criteria label small { color: var(--muted); font-size: 10px; overflow-wrap: anywhere; }
  .evidence-form-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
  .evidence-submit footer { padding-top: 11px; border-top: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .evidence-submit footer > span { color: var(--muted); font-size: 11px; }
  .evidence-submit footer button { min-height: 34px; padding: 0 12px; border: 1px solid var(--blue); border-radius: 4px; cursor: pointer; }
  .evidence-submit-note { margin: 12px 0 0; }
  .human-review-list { margin-top: 12px; border-top: 1px solid var(--line-strong); border-bottom: 1px solid var(--line-strong); }
  .human-review-list > header { padding: 11px 0; display: flex; align-items: baseline; gap: 12px; }
  .human-review-list > header p { margin: 0; color: var(--muted); font-size: 12px; }
  .human-review-form { padding: 14px 0; border-top: 1px solid var(--line); display: grid; gap: 12px; }
  .human-review-form > label, .human-review-form fieldset { min-width: 0; margin: 0; padding: 0; border: 0; display: grid; grid-template-columns: 170px minmax(0, 1fr); align-items: start; gap: 14px; }
  .human-review-form > label > span, .human-review-form legend { padding-top: 7px; font-weight: 650; }
  .human-review-form input:not([type=checkbox]), .human-review-form textarea, .human-review-form select { width: 100%; min-width: 0; padding: 7px 9px; border: 1px solid var(--line-strong); border-radius: 4px; background: #fff; }
  .evidence-choice-list { min-width: 0; display: grid; gap: 5px; }
  .evidence-choice { min-width: 0; padding: 7px 0; display: flex; align-items: flex-start; gap: 9px; border-bottom: 1px solid #edf0f3; }
  .evidence-choice:last-child { border-bottom: 0; }
  .evidence-choice input { margin-top: 4px; }
  .evidence-choice span { min-width: 0; display: grid; }
  .evidence-choice small { color: var(--muted); overflow-wrap: anywhere; }
  .human-review-form footer { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .human-review-form footer small { min-width: 0; color: var(--muted); overflow-wrap: anywhere; }
  .evidence-result { margin-top: 2px; }
  .evidence-result--passed { color: var(--green); }
  .evidence-result--failed { color: var(--red); }
  .evidence-result--inconclusive { color: var(--amber); }
  .review-state { flex: 0 0 8px; width: 8px; height: 8px; margin-top: 7px; border-radius: 50%; background: var(--amber); }
  .review-state--satisfied { background: var(--green); }
  .review-state--waived { background: var(--faint); }
  .relation-layout { display: grid; grid-template-columns: 1fr; border: 1px solid var(--line); border-radius: 5px; overflow: hidden; }
  .relation-group { min-width: 0; border-bottom: 1px solid var(--line); }
  .relation-group:last-child { border-bottom: 0; }
  .relation-group > header { padding: 9px 12px; border-bottom: 1px solid var(--line); background: #fbfcfd; display: flex; align-items: baseline; gap: 9px; }
  .relation-group h3 { margin: 0; font-size: 13px; }
  .relation-group h3 span { color: var(--muted); font-weight: 500; }
  .relation-group p { margin: 1px 0 0; color: var(--muted); font-size: 11px; }
  .relation-group > div { padding: 5px 7px; }
  .relation-record { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; border-bottom: 1px solid #edf0f3; }
  .relation-record:last-child { border-bottom: 0; }
  .relation-row { width: 100%; min-width: 0; padding: 8px 5px; border: 0; background: transparent; display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 7px; text-align: left; cursor: pointer; }
  .relation-row:hover { background: var(--blue-soft); }
  .relation-kind { padding: 1px 5px; border-radius: 3px; background: #eef1f4; color: #4f5864; font-size: 10px; white-space: nowrap; }
  .relation-copy { min-width: 0; display: grid; gap: 1px; }
  .relation-copy strong, .relation-copy small { white-space: normal; overflow-wrap: anywhere; }
  .relation-copy small { color: var(--muted); font-size: 10px; }
  .relation-copy .relation-goal-id { color: var(--faint); }
  .relation-copy .relation-path { color: #3e4753; }
  .relation-copy .relation-reason { line-height: 1.4; }
  .relation-state { font-size: 10px; color: var(--muted); }
  .relation-state--active { color: var(--green); }
  .relation-state--proposed { color: var(--amber); }
  .relation-state--inactive { color: var(--muted); }
  .relation-row > svg { color: var(--faint); }
  .relation-deactivate-open { align-self: center; margin-right: 5px; padding: 4px 6px; border: 1px solid transparent; color: var(--muted); background: transparent; font-size: 11px; }
  .relation-deactivate-open:hover { border-color: #efcaca; color: var(--red); background: var(--red-soft); }
  .relation-deactivate-form { grid-column: 1 / -1; margin: 0 5px 7px; padding: 10px; border: 1px solid #efcaca; border-radius: 5px; background: var(--red-soft); display: grid; gap: 8px; }
  .relation-deactivate-form[hidden] { display: none; }
  .relation-deactivate-form label { display: grid; gap: 4px; }
  .relation-deactivate-form label > span { color: #743333; font-size: 11px; font-weight: 650; }
  .relation-deactivate-form textarea { width: 100%; min-height: 56px; padding: 7px 8px; border: 1px solid #dfbaba; border-radius: 4px; background: var(--paper); color: var(--ink); resize: vertical; }
  .relation-deactivate-form footer { display: flex; justify-content: flex-end; gap: 7px; }
  .relation-deactivate-form footer button { padding: 6px 10px; }
  .button-danger { border-color: var(--red) !important; color: #fff !important; background: var(--red) !important; }
  .relation-editor { margin-top: 12px; border: 1px solid var(--line-strong); border-radius: 6px; background: #fbfcfd; overflow: hidden; }
  .relation-editor > summary, .relation-inactive-history > summary { min-height: 54px; padding: 10px 12px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 9px; list-style: none; cursor: pointer; }
  .relation-editor > summary::-webkit-details-marker, .relation-inactive-history > summary::-webkit-details-marker { display: none; }
  .relation-editor > summary:hover, .relation-inactive-history > summary:hover { background: #f4f7fa; }
  .relation-editor > summary > svg:last-child, .relation-inactive-history > summary > svg:last-child { width: 14px; height: 14px; color: var(--muted); transition: transform .16s ease; }
  .relation-editor[open] > summary > svg:last-child, .relation-inactive-history[open] > summary > svg:last-child { transform: rotate(180deg); }
  .relation-editor-icon { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 5px; color: var(--blue-dark); background: var(--blue-soft); }
  .relation-editor-icon svg { width: 15px; height: 15px; }
  .relation-editor > summary > span:nth-child(2), .relation-inactive-history > summary > span:first-child { min-width: 0; display: grid; }
  .relation-editor > summary strong, .relation-inactive-history > summary strong { font-size: 13px; }
  .relation-editor > summary small, .relation-inactive-history > summary small { color: var(--muted); font-size: 11px; }
  .relation-editor-action { color: var(--blue-dark); font-size: 11px; font-weight: 650; }
  .relation-form { padding: 14px; border-top: 1px solid var(--line); background: var(--paper); display: grid; gap: 14px; }
  .relation-authority { padding: 10px 11px; border: 1px solid #c9def9; border-radius: 5px; background: #f5f9ff; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 9px; }
  .relation-authority > span { width: 27px; height: 27px; display: grid; place-items: center; border-radius: 4px; color: var(--blue-dark); background: var(--blue-soft); }
  .relation-authority svg { width: 14px; height: 14px; }
  .relation-authority p { margin: 0; display: grid; gap: 2px; }
  .relation-authority strong { font-size: 12px; }
  .relation-authority small { color: #536274; font-size: 11px; line-height: 1.5; }
  .relation-authority a { color: var(--blue-dark); text-underline-offset: 2px; }
  .relation-direction-control { min-width: 0; padding: 0; border: 0; }
  .relation-direction-control legend { margin-bottom: 6px; color: #444d59; font-size: 11px; font-weight: 650; }
  .relation-direction-control > div { padding: 3px; border: 1px solid var(--line-strong); border-radius: 5px; background: #f3f5f7; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px; }
  .relation-direction-control label { position: relative; min-width: 0; cursor: pointer; }
  .relation-direction-control input { position: absolute; opacity: 0; pointer-events: none; }
  .relation-direction-control label > span { min-height: 48px; padding: 7px 9px; border: 1px solid transparent; border-radius: 4px; display: grid; align-content: center; gap: 1px; }
  .relation-direction-control label > span strong { font-size: 12px; }
  .relation-direction-control label > span small { color: var(--muted); font-size: 10px; }
  .relation-direction-control input:checked + span { border-color: #b7d5fa; background: var(--paper); color: var(--blue-dark); }
  .relation-direction-control input:focus-visible + span { outline: 2px solid var(--blue); outline-offset: 1px; }
  .relation-builder { display: grid; grid-template-columns: minmax(180px, .7fr) minmax(0, 1.3fr); gap: 10px; }
  .relation-builder label, .relation-reason-field { min-width: 0; display: grid; gap: 5px; }
  .relation-builder label > span, .relation-reason-field > span { color: #444d59; font-size: 11px; font-weight: 650; }
  .relation-builder select, .relation-reason-field textarea { width: 100%; padding: 8px 9px; border: 1px solid var(--line-strong); border-radius: 5px; background: var(--paper); color: var(--ink); }
  .relation-reason-field textarea { min-height: 72px; resize: vertical; }
  .relation-live-preview { padding: 11px 12px; border: 1px solid #c9def9; border-radius: 5px; background: #f7faff; display: grid; gap: 3px; }
  .relation-live-preview > small { color: var(--blue-dark); font-size: 10px; font-weight: 700; }
  .relation-live-preview > strong { min-width: 0; font-size: 13px; overflow-wrap: anywhere; }
  .relation-live-preview > strong span { color: var(--blue-dark); }
  .relation-live-preview > p { margin: 0; color: #536274; font-size: 11px; }
  .relation-form > footer { padding-top: 10px; border-top: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .relation-form > footer p { margin: 0; color: var(--muted); font-size: 11px; }
  .relation-form > footer button { flex: 0 0 auto; }
  .relation-inactive-history { margin-top: 8px; border: 1px solid var(--line); border-radius: 5px; background: #fbfcfd; }
  .relation-inactive-history > summary { min-height: 44px; grid-template-columns: minmax(0, 1fr) auto; }
  .relation-inactive-history > summary > span { grid-template-columns: auto auto minmax(0, 1fr); align-items: center; gap: 7px; }
  .relation-inactive-history > summary > span svg { width: 14px; height: 14px; color: var(--muted); }
  .relation-inactive-history > div { padding: 5px 7px; border-top: 1px solid var(--line); }
  .relation-editor-empty { margin-top: 10px; padding: 10px 11px; border: 1px dashed var(--line-strong); display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; color: var(--muted); }
  .relation-editor-empty > span { display: grid; }
  .relation-editor-empty svg { width: 15px; height: 15px; }
  .dependency-history { margin-top: 14px; }
  .dependency-history > h3 { margin: 0; font-size: 13px; }
  .dependency-history > h3 span { color: var(--muted); font-weight: 500; }
  .dependency-history > p { margin: 2px 0 8px; color: var(--muted); font-size: 12px; }
  .dependency-proposal-list { width: 100%; min-width: 0; margin-top: 8px; border: 1px solid var(--line); border-radius: 5px; overflow: hidden; }
  .dependency-proposal { min-width: 0; padding: 11px 13px; border-bottom: 1px solid var(--line); background: #fff; }
  .dependency-proposal:last-child { border-bottom: 0; }
  .dependency-proposal > header { display: flex; align-items: center; gap: 8px; }
  .dependency-action, .dependency-state { font-size: 11px; font-weight: 650; }
  .dependency-action { color: var(--blue-dark); }
  .dependency-action--deactivate { color: var(--red); }
  .dependency-state { margin-left: auto; color: var(--muted); }
  .dependency-state--pending { color: var(--amber); }
  .dependency-state--applied { color: var(--green); }
  .dependency-state--rejected { color: var(--red); }
  .dependency-direction { margin: 8px 0 9px; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 10px; }
  .dependency-direction > span { display: grid; justify-items: center; color: var(--muted); font-size: 11px; }
  .dependency-direction > span svg { font-size: 15px; }
  .dependency-goal { min-width: 0; padding: 0; border: 0; background: transparent; display: grid; text-align: left; color: var(--ink); cursor: pointer; }
  .dependency-goal:hover strong { color: var(--blue-dark); text-decoration: underline; }
  .dependency-goal strong, .dependency-goal small { white-space: normal; overflow-wrap: anywhere; }
  .dependency-goal small { color: var(--muted); font-size: 10px; }
  .dependency-rationale { margin: 0; display: grid; grid-template-columns: 1fr 1fr; column-gap: 20px; }
  .dependency-rationale div { min-width: 0; padding: 7px 0; border-top: 1px solid #edf0f3; }
  .dependency-rationale dt { color: var(--muted); font-size: 11px; }
  .dependency-rationale dd { margin: 1px 0 0; overflow-wrap: anywhere; }
  .dependency-evidence { min-width: 0; padding-top: 7px; border-top: 1px solid #edf0f3; display: grid; grid-template-columns: 64px minmax(0, 1fr); align-items: start; gap: 6px 12px; }
  .dependency-evidence > strong { color: var(--muted); font-size: 11px; }
  .dependency-evidence .inline-ref, .dependency-evidence > .empty-row { min-width: 0; width: 100%; max-width: 100%; grid-column: 2; margin: 0; align-items: flex-start; text-align: left; }
  .dependency-evidence .inline-ref span { min-width: 0; overflow: visible; text-overflow: clip; white-space: normal; overflow-wrap: anywhere; }
  .contract-list { border-top: 1px solid var(--line); }
  .contract-list section { min-width: 0; padding: 11px 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 138px minmax(0, 1fr); gap: 14px; align-items: start; }
  .contract-list h3, .safety-workbench h3 { margin: 0; font-size: 13px; }
  .contract-list .doc-list, .contract-list .empty-row { margin-top: 0; }
  .contract-list .doc-list { min-width: 0; overflow-wrap: anywhere; }
  .scope-gaps { margin-top: 10px; border: 1px solid var(--line); border-radius: 5px; background: color-mix(in srgb, var(--blue-soft) 42%, #fff); }
  .scope-gaps > summary { min-height: 46px; padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; list-style: none; cursor: pointer; }
  .scope-gaps > summary::-webkit-details-marker { display: none; }
  .scope-gaps > summary:hover { background: color-mix(in srgb, var(--blue-soft) 70%, #fff); }
  .scope-gaps > summary > span { min-width: 0; display: grid; gap: 2px; }
  .scope-gaps > summary strong { font-size: 13px; }
  .scope-gaps > summary small { color: var(--muted); font-size: 12px; font-weight: 500; }
  .scope-gaps > summary > svg { flex: 0 0 auto; color: var(--blue); transition: transform .16s ease; }
  .scope-gaps[open] > summary > svg { transform: rotate(180deg); }
  .scope-gaps > .contract-list { padding: 0 12px 6px; border-top: 1px solid var(--line); background: #fff; }
  .safety-workbench { border-top: 1px solid var(--line-strong); }
  .risk-register, .impact-register { min-width: 0; padding: 14px 0; border-bottom: 1px solid var(--line); }
  .impact-register { border-bottom: 0; }
  .safety-subheading { margin-bottom: 10px; display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
  .safety-subheading p { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
  .safety-subheading > span { flex: 0 0 auto; color: var(--muted); font-size: 11px; }
  .risk-list { border: 1px solid var(--line-strong); border-radius: 6px; overflow: hidden; }
  .risk-record { scroll-margin-top: 16px; border-bottom: 1px solid var(--line-strong); background: #fff; }
  .risk-record:last-child { border-bottom: 0; }
  .risk-record > header { min-width: 0; padding: 12px 14px 10px; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 10px; }
  .risk-record-icon { width: 30px; height: 30px; border-radius: 5px; color: var(--amber); background: var(--amber-soft); display: grid; place-items: center; }
  .risk-record-icon svg { width: 15px; height: 15px; }
  .risk-record > header > div { min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 2px 8px; }
  .risk-record h4 { min-width: 0; margin: 0; font-size: 14px; line-height: 1.4; overflow-wrap: anywhere; }
  .risk-record header small { grid-column: 1 / -1; color: var(--faint); font-size: 10px; overflow-wrap: anywhere; }
  .risk-record .risk-state { width: fit-content; padding: 2px 6px; border-radius: 3px; color: var(--amber); background: var(--amber-soft); font-size: 10px; white-space: nowrap; }
  .risk-record .risk-state--triggered { color: var(--red); background: var(--red-soft); }
  .risk-record .risk-state--resolved { color: var(--green); background: var(--green-soft); }
  .risk-record .risk-state--accepted, .risk-record .risk-state--expired { color: var(--muted); background: #eef1f4; }
  .risk-facts { margin: 0; padding: 0 14px 8px 54px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 24px; }
  .risk-facts > div { min-width: 0; padding: 8px 0; border-top: 1px solid #edf0f3; display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 9px; }
  .risk-facts dt { color: var(--muted); font-size: 11px; }
  .risk-facts dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
  .risk-fact-wide { grid-column: 1 / -1; }
  .risk-linked-goals { display: flex; flex-wrap: wrap; gap: 5px 16px; }
  .risk-linked-goals a { min-width: min(100%, 210px); display: grid; color: inherit; text-decoration: none; }
  .risk-linked-goals a:hover strong { color: var(--blue-dark); text-decoration: underline; }
  .risk-linked-goals small { color: var(--faint); font-size: 10px; }
  .risk-effect { margin: 0 14px 12px 54px; padding: 8px 10px; border-left: 2px solid var(--blue); background: #f5f9ff; color: var(--muted); display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; }
  .risk-effect--triggered { border-left-color: var(--red); background: var(--red-soft); color: var(--red); }
  .risk-effect > svg { margin-top: 1px; color: inherit; }
  .risk-effect > span { display: grid; gap: 1px; }
  .risk-effect strong { color: var(--ink); font-size: 11px; }
  .risk-readonly { margin: 0 14px 12px 54px; color: var(--muted); font-size: 11px; }
  .risk-actions { border-top: 1px solid var(--line); background: #fbfcfd; }
  .risk-actions > details { border-bottom: 1px solid var(--line); }
  .risk-actions > details:last-child { border-bottom: 0; }
  .risk-actions summary, .risk-create > summary, .risk-goal-picker > summary { list-style: none; cursor: pointer; }
  .risk-actions summary::-webkit-details-marker, .risk-create > summary::-webkit-details-marker, .risk-goal-picker > summary::-webkit-details-marker { display: none; }
  .risk-actions > details > summary { min-height: 43px; padding: 8px 14px 8px 54px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .risk-actions > details > summary:hover, .risk-create > summary:hover { background: #f4f7fa; }
  .risk-actions summary > span { display: inline-flex; align-items: center; gap: 7px; }
  .risk-actions summary > span > svg { color: var(--muted); }
  .risk-actions summary > svg, .risk-create > summary > svg, .risk-goal-picker > summary > svg { color: var(--muted); transition: transform .16s ease; }
  .risk-actions details[open] > summary > svg, .risk-create[open] > summary > svg, .risk-goal-picker[open] > summary > svg { transform: rotate(180deg); }
  .risk-form, .risk-state-form { padding: 13px 14px 15px 54px; border-top: 1px solid var(--line); background: #fff; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px 14px; }
  .risk-form label, .risk-state-form label { min-width: 0; display: grid; gap: 5px; }
  .risk-form label > span, .risk-state-form label > span { color: var(--ink); font-size: 11px; font-weight: 650; }
  .risk-form label small { color: var(--muted); font-weight: 400; }
  .risk-form input:not([type=checkbox]), .risk-form textarea, .risk-form select, .risk-state-form textarea, .risk-state-form select { width: 100%; min-width: 0; padding: 8px 9px; border: 1px solid var(--line-strong); border-radius: 4px; background: #fff; resize: vertical; }
  .risk-form-wide, .risk-goal-picker { grid-column: 1 / -1; }
  .risk-form footer, .risk-state-form footer { padding-top: 10px; border-top: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .risk-form footer > span { color: var(--muted); font-size: 11px; }
  .risk-form button, .risk-state-form button { min-height: 34px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 4px; cursor: pointer; }
  .risk-state-preview { min-width: 0; margin: 0; padding: 8px 10px; border-left: 2px solid var(--blue); background: #f5f9ff; color: var(--muted); font-size: 11px; }
  .risk-goal-picker { border: 1px solid var(--line); border-radius: 5px; background: #fbfcfd; }
  .risk-goal-picker > summary { min-height: 45px; padding: 7px 10px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .risk-goal-picker > summary > span { min-width: 0; display: grid; }
  .risk-goal-picker > summary small { color: var(--muted); font-size: 10px; font-weight: 400; }
  .risk-goal-picker > div { padding: 9px; border-top: 1px solid var(--line); }
  .risk-goal-search { position: relative; display: block !important; }
  .risk-goal-search > svg { position: absolute; left: 9px; top: 9px; z-index: 1; color: var(--muted); pointer-events: none; }
  .risk-goal-search input { padding-left: 31px !important; }
  .risk-goal-options { max-height: 180px; margin-top: 7px; overflow: auto; scrollbar-width: none; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px 8px; }
  .risk-goal-options::-webkit-scrollbar { display: none; }
  .risk-goal-options > label { padding: 6px 7px; border-radius: 4px; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 7px; cursor: pointer; }
  .risk-goal-options > label:hover { background: var(--blue-soft); }
  .risk-goal-options > label[hidden] { display: none; }
  .risk-goal-options input { accent-color: var(--blue); }
  .risk-goal-options span { min-width: 0; display: grid; }
  .risk-goal-options strong, .risk-goal-options small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .risk-goal-options small { color: var(--faint); font-size: 10px; font-weight: 400; }
  .risk-create { margin-top: 10px; border: 1px solid var(--line-strong); border-radius: 6px; background: #fbfcfd; }
  .risk-create > summary { min-height: 52px; padding: 9px 12px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 9px; }
  .risk-create > summary > span:nth-child(2) { min-width: 0; display: grid; }
  .risk-create > summary small { color: var(--muted); font-size: 11px; }
  .risk-create > .risk-form { padding-left: 14px; }
  .risk-empty { margin: 0; padding: 13px 14px; border: 1px dashed var(--line-strong); color: var(--muted); background: #fbfcfd; }
  .impact-ledger { border-top: 1px solid var(--line-strong); border-bottom: 1px solid var(--line-strong); }
  .impact-list { overflow: hidden; }
  .impact-record { scroll-margin-top: 16px; border-bottom: 1px solid var(--line-strong); background: #fff; }
  .impact-record:last-child { border-bottom: 0; }
  .impact-record--inactive { background: #fbfcfd; }
  .impact-record > header { min-width: 0; padding: 12px 14px 10px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: 10px; }
  .impact-record-icon { width: 30px; height: 30px; border-radius: 5px; color: var(--blue-dark); background: var(--blue-soft); display: grid; place-items: center; }
  .impact-record-icon svg { width: 15px; height: 15px; }
  .impact-record > header > div { min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 2px 8px; }
  .impact-record h4 { min-width: 0; margin: 0; font-size: 14px; line-height: 1.4; overflow-wrap: anywhere; }
  .impact-record header small { grid-column: 1 / -1; color: var(--faint); font-size: 10px; overflow-wrap: anywhere; }
  .impact-access, .impact-state { width: fit-content; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 650; white-space: nowrap; }
  .impact-access { color: var(--blue-dark); background: var(--blue-soft); }
  .impact-access--decide { color: var(--rewire-violet); background: #f1edfb; }
  .impact-access--exclusive { color: var(--red); background: var(--red-soft); }
  .impact-state { color: var(--green); background: var(--green-soft); }
  .impact-state--proposed { color: var(--amber); background: var(--amber-soft); }
  .impact-state--inactive { color: var(--muted); background: #eef1f4; }
  .impact-record--inactive .impact-record-icon,
  .impact-record--inactive .impact-access { color: var(--muted); background: #eef1f4; }
  .impact-facts { margin: 0; padding: 0 14px 8px 54px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 24px; }
  .impact-facts > div { min-width: 0; padding: 8px 0; border-top: 1px solid #edf0f3; display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 9px; }
  .impact-facts dt { color: var(--muted); font-size: 11px; }
  .impact-facts dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
  .impact-fact-wide { grid-column: 1 / -1; }
  .impact-effect { margin: 0 14px 12px 54px; padding: 8px 10px; border: 1px solid #c9def9; border-radius: 4px; background: #f5f9ff; color: var(--muted); display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; }
  .impact-effect--proposed { border-color: #ead5a4; background: var(--amber-soft); }
  .impact-effect--inactive { border-color: var(--line); background: #f4f6f8; }
  .impact-record--inactive .impact-effect strong { color: #59616c; }
  .impact-effect > svg { margin-top: 1px; color: inherit; }
  .impact-effect > span { display: grid; gap: 1px; }
  .impact-effect strong { color: var(--ink); font-size: 11px; }
  .impact-readonly { margin: 0 14px 12px 54px; color: var(--muted); font-size: 11px; }
  .impact-actions { border-top: 1px solid var(--line); background: #fbfcfd; }
  .impact-actions > details { border-bottom: 1px solid var(--line); }
  .impact-actions > details:last-child { border-bottom: 0; }
  .impact-actions summary, .impact-create > summary, .impact-history > summary { list-style: none; cursor: pointer; }
  .impact-actions summary::-webkit-details-marker, .impact-create > summary::-webkit-details-marker, .impact-history > summary::-webkit-details-marker { display: none; }
  .impact-actions > details > summary { min-height: 43px; padding: 8px 14px 8px 54px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .impact-actions summary:focus-visible, .impact-create > summary:focus-visible, .impact-history > summary:focus-visible { outline: 2px solid #8ab8ee; outline-offset: -3px; }
  .impact-actions > details > summary:hover, .impact-create > summary:hover, .impact-history > summary:hover { background: #f4f7fa; }
  .impact-actions summary > span { display: inline-flex; align-items: center; gap: 7px; }
  .impact-actions summary > span > svg { color: var(--muted); }
  .impact-actions summary > svg, .impact-create > summary > svg, .impact-history > summary > svg { color: var(--muted); transition: transform .16s ease; }
  .impact-actions details[open] > summary > svg, .impact-create[open] > summary > svg, .impact-history[open] > summary > svg { transform: rotate(180deg); }
  .impact-form { padding: 13px 14px 15px 54px; border-top: 1px solid var(--line); background: #fff; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px 14px; }
  .impact-form label, .impact-deactivate form label { min-width: 0; display: grid; gap: 5px; }
  .impact-form label > span, .impact-deactivate form label > span { color: var(--ink); font-size: 11px; font-weight: 650; }
  .impact-form label small { color: var(--muted); font-weight: 400; }
  .impact-form input, .impact-form textarea, .impact-form select, .impact-deactivate textarea { width: 100%; min-width: 0; padding: 8px 9px; border: 1px solid var(--line-strong); border-radius: 4px; background: #fff; resize: vertical; }
  .impact-form-wide { grid-column: 1 / -1; }
  .impact-form footer { padding-top: 10px; border-top: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .impact-form footer > span { color: var(--muted); font-size: 11px; }
  .impact-form button, .impact-deactivate button { min-height: 34px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 4px; cursor: pointer; }
  .impact-deactivate form { padding: 13px 14px 15px 54px; border-top: 1px solid var(--line); background: #fff; display: grid; gap: 10px; }
  .impact-deactivate form > p { margin: 0; color: var(--muted); font-size: 11px; }
  .impact-deactivate form footer { display: flex; justify-content: flex-end; }
  .impact-deactivate .danger-confirm { color: var(--red); border-color: #e5b9b9; background: var(--red-soft); font-weight: 650; }
  .impact-create, .impact-history { margin: 0; border: 0; border-top: 1px solid var(--line-strong); border-radius: 0; background: #fbfcfd; }
  .impact-create > summary, .impact-history > summary { min-height: 52px; padding: 9px 12px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 9px; }
  .impact-create > summary > span:nth-child(2), .impact-history > summary > span:first-child { min-width: 0; display: grid; }
  .impact-create > summary small, .impact-history > summary small { color: var(--muted); font-size: 11px; }
  .impact-create > .impact-form { padding-left: 14px; }
  .impact-history > .impact-list { border: 0; border-top: 1px solid var(--line); border-radius: 0; }
  .impact-empty { margin: 0; padding: 13px 14px; border: 0; color: var(--muted); background: #fbfcfd; }
  .fact-row { display: flex; gap: 8px; padding: 7px 0; border-bottom: 1px solid #edf0f3; }
  .fact-row:last-child { border-bottom: 0; }
  .fact-icon { flex: 0 0 auto; margin-top: 2px; color: var(--blue); }
  .fact-icon--risk { color: var(--amber); }
  .fact-row > span:last-child { min-width: 0; display: grid; }
  .fact-row small { color: var(--muted); overflow-wrap: anywhere; }
  .policy-list div { grid-template-columns: minmax(0, 1fr) auto; }
  .policy-workbench { padding-top: 2px; border-top: 1px solid var(--line-strong); display: grid; gap: 14px; }
  .policy-effective { margin-top: 14px; padding: 0; border: 1px solid var(--line); border-radius: 5px; background: var(--paper); }
  .policy-effective > header { padding: 12px 14px; display: flex; align-items: flex-start; gap: 8px; }
  .policy-effective-icon { width: 20px; height: 20px; margin-top: 1px; color: #59626f; display: grid; place-items: center; }
  .policy-effective h3 { margin: 0; font-size: 14px; letter-spacing: -.01em; }
  .policy-effective header p { margin: 1px 0 0; color: var(--muted); font-size: 12px; }
  .policy-effective dl { margin: 0; padding: 0 14px 12px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid var(--line); }
  .policy-effective dl div { min-width: 0; padding: 10px 12px 1px 0; display: grid; gap: 1px; }
  .policy-effective dt { color: var(--muted); font-size: 11px; font-weight: 650; }
  .policy-effective dd { min-width: 0; margin: 0; display: grid; overflow-wrap: anywhere; }
  .policy-effective dd strong { font-size: 13px; }
  .policy-effective dd small { color: var(--muted); font-size: 11px; }
  .policy-inheritance { min-width: 0; padding: 10px 13px; border: 1px solid var(--line); border-radius: 5px; background: #f8f9fb; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 10px; }
  .policy-inheritance > span { min-width: 0; display: grid; }
  .policy-inheritance small { color: var(--muted); font-size: 9px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
  .policy-inheritance strong { overflow-wrap: anywhere; font-size: 12px; }
  .policy-inheritance > svg { color: var(--faint); }
  .policy-source { min-width: 0; border: 1px solid var(--line-strong); border-radius: 6px; overflow: hidden; background: #fff; }
  .policy-source--goal { border-color: #b9d2f1; }
  .policy-source > summary { min-height: 76px; padding: 13px 15px; display: flex; align-items: center; justify-content: space-between; gap: 20px; cursor: pointer; list-style: none; background: #f8f9fb; }
  .policy-source--goal > summary { background: #f4f8fe; }
  .policy-source > summary::-webkit-details-marker { display: none; }
  .policy-source-title { min-width: 0; display: flex; align-items: flex-start; gap: 11px; }
  .policy-scope-index { flex: 0 0 auto; width: 29px; height: 29px; border: 1px solid var(--line-strong); border-radius: 4px; display: grid; place-items: center; color: var(--muted); font-size: 10px; font-weight: 750; }
  .policy-source--goal .policy-scope-index { color: var(--blue-dark); border-color: #b7d0ef; background: #fff; }
  .policy-source-title > span:last-child { min-width: 0; display: grid; }
  .policy-source-title small { color: var(--muted); font-size: 9px; font-weight: 750; letter-spacing: .09em; }
  .policy-source-title strong { font-size: 15px; }
  .policy-source-title > span:last-child > span { color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
  .policy-source-state { min-width: 190px; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: 8px; text-align: right; }
  .policy-source-state strong, .policy-source-state small { min-width: 0; overflow-wrap: anywhere; }
  .policy-source-state strong { color: var(--blue-dark); font-size: 11px; }
  .policy-source--project .policy-source-state strong { color: #505965; }
  .policy-source-state small { grid-column: 1; color: var(--muted); font-size: 9px; }
  .policy-source-state svg { grid-column: 2; grid-row: 1 / 3; color: var(--muted); transition: transform .16s ease; }
  .policy-source[open] .policy-source-state svg { transform: rotate(180deg); }
  .policy-form { padding: 0 15px 15px; display: grid; }
  .policy-scope-notice { margin: 0 -15px; padding: 10px 15px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: #fbfcfd; display: flex; align-items: flex-start; gap: 8px; color: #4c5663; font-size: 11px; }
  .policy-scope-notice svg { flex: 0 0 auto; margin-top: 2px; color: var(--blue); }
  .policy-form-group { padding: 16px 0 2px; border-bottom: 1px solid var(--line); }
  .policy-form-group > header { margin-bottom: 13px; display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: start; gap: 9px; }
  .policy-form-group > header > span { width: 28px; height: 28px; border-radius: 4px; color: var(--blue-dark); background: var(--blue-soft); display: grid; place-items: center; }
  .policy-form-group h3 { margin: 0; font-size: 14px; }
  .policy-form-group header p { margin: 1px 0 0; color: var(--muted); font-size: 11px; }
  .policy-control { min-width: 0; margin: 0; padding: 0 0 14px; border: 0; }
  .policy-control > legend { padding: 0; font-weight: 650; }
  .policy-control > p { margin: 0 0 8px; color: var(--muted); font-size: 11px; }
  .policy-mode-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; }
  .policy-mode-options label { min-width: 0; position: relative; cursor: pointer; }
  .policy-mode-options input { position: absolute; opacity: 0; pointer-events: none; }
  .policy-mode-options label > span { min-height: 58px; padding: 9px 10px; border: 1px solid var(--line-strong); border-radius: 5px; background: #fff; display: grid; align-content: center; gap: 1px; }
  .policy-mode-options label:hover > span { border-color: #a8c8ee; background: #fbfdff; }
  .policy-mode-options input:checked + span { border-color: var(--blue); background: var(--blue-soft); box-shadow: inset 0 0 0 1px rgba(22, 119, 255, .08); }
  .policy-mode-options input:focus-visible + span { outline: 2px solid color-mix(in srgb, var(--blue), transparent 30%); outline-offset: 2px; }
  .policy-mode-options strong { font-size: 12px; }
  .policy-mode-options small { color: var(--muted); font-size: 10px; overflow-wrap: anywhere; }
  .policy-control--split { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(180px, .65fr); gap: 12px; }
  .policy-input { min-width: 0; display: grid; gap: 6px; }
  .policy-input > span:first-child { display: grid; }
  .policy-input small { color: var(--muted); font-size: 10px; }
  .policy-input input, .policy-reason textarea { width: 100%; min-width: 0; padding: 8px 9px; border: 1px solid var(--line-strong); border-radius: 4px; background: #fff; resize: vertical; }
  .policy-with-unit { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 7px; }
  .policy-with-unit > span { color: var(--muted); }
  .policy-toggle-list { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .policy-toggle { min-width: 0; padding: 10px 11px; border: 1px solid var(--line); border-radius: 5px; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 9px; cursor: pointer; }
  .policy-toggle:hover { border-color: #b9cee8; background: #fbfdff; }
  .policy-toggle > input { position: absolute; opacity: 0; pointer-events: none; }
  .policy-switch { position: relative; width: 30px; height: 18px; border-radius: 9px; background: #b5bcc6; transition: .16s ease; }
  .policy-switch::after { content: ""; position: absolute; top: 3px; left: 3px; width: 12px; height: 12px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(20, 30, 42, .2); transition: .16s ease; }
  .policy-toggle input:checked + .policy-switch { background: var(--blue); }
  .policy-toggle input:checked + .policy-switch::after { transform: translateX(12px); }
  .policy-toggle input:focus-visible + .policy-switch { outline: 2px solid color-mix(in srgb, var(--blue), transparent 30%); outline-offset: 2px; }
  .policy-toggle-copy { min-width: 0; display: grid; }
  .policy-toggle-copy strong { font-size: 12px; }
  .policy-toggle-copy small { color: var(--muted); font-size: 10px; overflow-wrap: anywhere; }
  .policy-review-counts { margin-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .policy-counter { min-width: 0; padding: 10px 11px; border: 1px solid var(--line); border-radius: 5px; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; }
  .policy-counter > span:first-child { min-width: 0; display: grid; }
  .policy-counter strong { font-size: 12px; }
  .policy-counter small { color: var(--muted); font-size: 10px; overflow-wrap: anywhere; }
  .policy-counter-input { display: grid; grid-template-columns: 56px auto; align-items: center; gap: 5px; color: var(--muted); }
  .policy-counter-input input { width: 56px; min-width: 0; padding: 7px 6px; border: 1px solid var(--line-strong); border-radius: 4px; background: #fff; text-align: center; }
  .policy-form-group--reason { border-bottom: 0; }
  .policy-reason { display: grid; grid-template-columns: 110px minmax(0, 1fr); align-items: start; gap: 10px; }
  .policy-reason > span { padding-top: 7px; font-weight: 650; }
  .policy-form > .form-error { margin: 8px 0 0; }
  .policy-form footer { margin-top: 13px; padding: 12px 0 0; border-top: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .policy-form footer > span { color: var(--muted); font-size: 11px; }
  .draft-editor-section { margin: 18px 0 0 31px; padding-top: 17px; border-top: 1px solid var(--line); background: transparent; scroll-margin-top: 12px; }
  .draft-contract-form { border-top: 1px solid var(--line-strong); display: grid; }
  .draft-contract-form label { min-width: 0; display: grid; gap: 5px; }
  .draft-contract-form label > span, .decomposition-editor legend { font-weight: 650; }
  .draft-contract-form label small { color: var(--muted); font-weight: 400; }
  .draft-contract-form input:not([type=radio]), .draft-contract-form textarea, .draft-contract-form select, .draft-aux-form input, .draft-aux-form textarea, .draft-aux-form select { width: 100%; min-width: 0; padding: 8px 10px; border: 1px solid var(--line-strong); border-radius: 4px; background: #fff; resize: vertical; }
  .draft-form-row { padding: 14px 0 0; display: grid; grid-template-columns: minmax(0, 1fr) 120px; gap: 14px; }
  .draft-field { padding-top: 12px; }
  .draft-list-grid { padding: 14px 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; }
  .draft-list-grid label:last-child { grid-column: 1 / -1; }
  .decomposition-editor { min-width: 0; margin: 0; padding: 15px 0; border: 0; border-bottom: 1px solid var(--line); }
  .decomposition-editor legend { margin-bottom: 9px; }
  .decomposition-editor > div { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border: 1px solid var(--line); border-radius: 5px; overflow: hidden; background: #fff; }
  .decomposition-choice { min-width: 0; padding: 10px 12px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); display: grid !important; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 9px !important; cursor: pointer; }
  .decomposition-choice:nth-child(2n) { border-right: 0; }
  .decomposition-choice:nth-last-child(-n+2) { border-bottom: 0; }
  .decomposition-choice:has(input:checked) { color: var(--blue-dark); background: var(--blue-soft); }
  .decomposition-choice input { margin-top: 4px; accent-color: var(--blue); }
  .decomposition-choice > span { min-width: 0; display: grid; }
  .decomposition-choice small { color: var(--muted); font-size: 12px; font-weight: 400; }
  .criteria-editor { padding: 15px 0; border-bottom: 1px solid var(--line); }
  .criteria-editor > header { margin-bottom: 10px; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .criteria-editor h3 { margin: 0; font-size: 14px; }
  .criteria-editor header p { margin: 1px 0 0; color: var(--muted); font-size: 12px; }
  .criteria-editor button, .draft-aux-form button { min-height: 34px; padding: 0 11px; border: 1px solid var(--line-strong); border-radius: 4px; background: #fff; display: inline-flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; }
  .criteria-editor-list { display: grid; gap: 9px; }
  .criterion-editor-row { border: 1px solid var(--line); border-radius: 5px; overflow: hidden; background: #fff; }
  .criterion-editor-row > header { min-height: 39px; padding: 6px 10px 6px 12px; border-bottom: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; background: #f7f9fb; }
  .criterion-editor-row > header button { min-height: 28px; padding-inline: 7px; border-color: transparent; background: transparent; color: var(--muted); }
  .criterion-editor-row > header button:hover { color: var(--red); background: var(--red-soft); }
  .criterion-editor-grid { padding: 11px 12px 13px; display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(160px, .7fr); gap: 11px 14px; }
  .criterion-pass { grid-column: 1; }
  .draft-contract-form > .form-error { margin-top: 12px; }
  .draft-contract-form > footer { padding-top: 13px; display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .draft-contract-form > footer > span { color: var(--muted); font-size: 12px; }
  .draft-contract-form > footer button { min-height: 36px; padding: 0 14px; border: 1px solid var(--blue); border-radius: 4px; cursor: pointer; }
  .draft-auxiliary { margin-top: 17px; border-top: 1px solid var(--line-strong); }
  .draft-auxiliary > details { border-bottom: 1px solid var(--line); }
  .draft-auxiliary summary { min-height: 55px; padding: 9px 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; cursor: pointer; list-style: none; }
  .draft-auxiliary summary::-webkit-details-marker { display: none; }
  .draft-auxiliary summary > span { min-width: 0; display: grid; grid-template-columns: 22px minmax(0, 1fr); align-items: center; gap: 0 8px; }
  .draft-auxiliary summary > span > svg { grid-row: 1 / 3; color: var(--muted); font-size: 17px; }
  .draft-auxiliary summary small { color: var(--muted); font-size: 12px; }
  .draft-auxiliary summary > svg { color: var(--muted); transition: transform .16s ease; }
  .draft-auxiliary details[open] summary > svg { transform: rotate(180deg); }
  .draft-aux-form { padding: 4px 0 15px 30px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px 14px; }
  .draft-aux-form label { min-width: 0; display: grid; gap: 5px; }
  .draft-aux-form label > span { font-weight: 650; }
  .draft-aux-form label small { color: var(--muted); font-weight: 400; }
  .draft-aux-wide { grid-column: 1 / -1; }
  .draft-aux-form footer { display: flex; justify-content: flex-end; }
  .draft-policy-link { min-height: 61px; padding: 9px 0; color: inherit; display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; gap: 8px; text-decoration: none; }
  .draft-policy-link > svg:first-child { color: var(--muted); font-size: 17px; }
  .draft-policy-link > span { display: grid; }
  .draft-policy-link small { color: var(--muted); font-size: 12px; }
  .draft-policy-link > svg:last-child { color: var(--muted); }
  .draft-policy-link:hover { color: var(--blue-dark); }
  .history-list { list-style: none; margin: 0; padding: 0; }
  .history-list li { display: grid; grid-template-columns: 136px minmax(0, 1fr); gap: 15px; padding: 7px 0; border-bottom: 1px solid #edf0f3; }
  .history-list time { color: var(--muted); font-variant-numeric: tabular-nums; font-size: 12px; }
  .history-list span { min-width: 0; display: grid; }
  .history-list strong, .history-list small { overflow-wrap: anywhere; }
  .history-list small { color: var(--muted); }
  .decision-center { width: min(100%, 1080px); margin: 0 auto; padding: 34px 38px 80px; container-type: inline-size; animation: document-in .24s cubic-bezier(.16, 1, .3, 1); }
  .decision-center-header { padding-bottom: 22px; border-bottom: 1px solid var(--line-strong); display: flex; align-items: flex-end; justify-content: space-between; gap: 26px; }
  .decision-center-header > div { max-width: 710px; }
  .decision-center-header > div > small { color: var(--blue-dark); font-size: 10px; font-weight: 750; letter-spacing: .12em; }
  .decision-center-header h1 { margin: 0 0 5px; font-size: clamp(25px, 2.3vw, 32px); line-height: 1.25; letter-spacing: -.03em; }
  .decision-center-header p { margin: 0; color: var(--muted); }
  .decision-center-header > strong { min-width: 94px; font-size: 34px; line-height: 1; text-align: right; font-variant-numeric: tabular-nums; }
  .decision-center-header > strong small { margin-top: 5px; display: block; color: var(--muted); font-size: 11px; font-weight: 500; }
  .decision-summary { min-height: 48px; border-bottom: 1px solid var(--line); display: flex; align-items: center; flex-wrap: wrap; gap: 8px 24px; color: var(--muted); font-size: 12px; }
  .decision-summary span { display: inline-flex; align-items: center; gap: 6px; }
  .decision-summary strong { color: var(--ink); font-variant-numeric: tabular-nums; }
  .decision-groups { display: grid; }
  .decision-goal-group { padding: 25px 0 30px; border-bottom: 1px solid var(--line-strong); scroll-margin-top: 12px; }
  .decision-owner { margin-bottom: 13px; display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; }
  .decision-owner > div { min-width: 0; display: grid; gap: 3px; }
  .decision-owner > div > span { color: var(--muted); font-size: 11px; font-weight: 650; }
  .decision-owner > small { flex: 0 0 auto; color: var(--muted); }
  .decision-owner-link { min-width: 0; color: inherit; display: grid; text-decoration: none; }
  a.decision-owner-link:hover strong { color: var(--blue-dark); text-decoration: underline; }
  .decision-owner-link strong { font-size: 18px; letter-spacing: -.015em; overflow-wrap: anywhere; }
  .decision-owner-link small { color: var(--muted); font-size: 11px; }
  .decision-stack { display: grid; gap: 12px; }
  .decision-record { min-width: 0; margin: 0; padding: 0; border: 1px solid var(--line-strong); border-radius: 5px; overflow: hidden; background: #fff; }
  .decision-record-heading { min-height: 40px; padding: 8px 13px; border-bottom: 1px solid var(--line); background: #f7f9fb; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .decision-record-heading > small { min-width: 0; color: var(--muted); font-size: 10px; overflow-wrap: anywhere; text-align: right; }
  .decision-kind { display: inline-flex; align-items: center; gap: 6px; color: var(--blue-dark); font-size: 11px; font-weight: 750; letter-spacing: .04em; }
  .decision-kind--rewire { color: #6b4eb6; }
  .decision-kind--risk { color: var(--amber); }
  .decision-record-body { padding: 12px 14px; }
  .decision-record-body p { margin: 3px 0; color: var(--muted); }
  .decision-record-body small { color: var(--muted); overflow-wrap: anywhere; }
  .rewire-decision .dependency-proposal-list { margin-top: 9px; }
  .contract-proposal > header { padding: 13px 15px; display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; background: var(--blue-soft); border-bottom: 1px solid var(--line); }
  .contract-proposal > header strong { font-size: 14px; }
  .contract-proposal > header p { color: var(--muted); }
  .contract-proposal > header > span { color: var(--muted); font-size: 11px; white-space: nowrap; }
  .contract-diff-list { padding: 0 15px; }
  .contract-diff-row { display: grid; grid-template-columns: 130px minmax(0, 1fr) minmax(210px, .72fr); gap: 15px; padding: 13px 0; border-bottom: 1px solid #e7ebf0; align-items: start; }
  .contract-diff-row h4 { margin: 1px 0 0; font-size: 13px; }
  .contract-diff-copy { min-width: 0; }
  .contract-diff-copy small, .proposal-source > span { color: var(--muted); font-size: 11px; }
  .contract-diff-copy p { margin: 0 0 7px; color: var(--ink); overflow-wrap: anywhere; }
  .contract-diff-copy p:last-child { margin-bottom: 0; }
  .proposal-source { min-width: 0; display: grid; gap: 3px; padding-left: 12px; border-left: 1px solid var(--line); color: var(--muted); }
  .proposal-source > span { color: var(--blue-dark); font-weight: 650; }
  .proposal-source > small { overflow-wrap: anywhere; }
  .proposal-refs { min-width: 0; display: flex; flex-wrap: wrap; gap: 3px 10px; }
  .proposal-refs .inline-ref { font-size: 11px; }
  .proposal-appendix { margin: 0 15px; padding: 11px 0; border-bottom: 1px solid #e7ebf0; display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 15px; }
  .proposal-appendix > strong { font-size: 13px; }
  .proposal-appendix .doc-list { margin: 0; }
  .proposal-prerequisite > div { min-width: 0; }
  .proposal-prerequisite p { margin: 5px 0 0; color: var(--muted); font-size: 12px; }
  .candidate-title { padding: 14px 15px; border-bottom: 1px solid var(--line); display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
  .candidate-title > div { min-width: 0; }
  .candidate-title small { color: var(--muted); font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
  .candidate-title h3 { margin: 2px 0 3px; font-size: 17px; line-height: 1.35; letter-spacing: -.015em; }
  .candidate-title p { margin: 0; color: var(--muted); }
  .candidate-title > span { flex: 0 0 auto; padding: 2px 7px; border-radius: 3px; color: var(--amber); background: var(--amber-soft); font-size: 10px; font-weight: 650; }
  .candidate-contract { margin: 0; padding: 0 15px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 24px; }
  .candidate-contract > div { min-width: 0; padding: 11px 0; border-bottom: 1px solid #e7ebf0; }
  .candidate-contract dt { margin-bottom: 2px; color: var(--muted); font-size: 11px; font-weight: 650; }
  .candidate-contract dd { margin: 0; overflow-wrap: anywhere; }
  .candidate-contract .doc-list, .candidate-contract .empty-row { margin: 0; }
  .candidate-wide { grid-column: 1 / -1; }
  .candidate-acceptance { margin: 2px 0 0; padding-left: 19px; }
  .candidate-acceptance li { margin: 4px 0; padding-left: 3px; }
  .candidate-acceptance li small { display: block; color: var(--muted); }
  .decision-reason { padding: 12px 15px; border-top: 1px solid var(--line); background: #fbfcfd; display: grid; grid-template-columns: 170px minmax(0, 1fr); align-items: start; gap: 13px; }
  .decision-reason > span { padding-top: 7px; font-weight: 650; }
  .decision-reason textarea { width: 100%; min-width: 0; padding: 8px 10px; border: 1px solid var(--line-strong); border-radius: 4px; background: #fff; resize: vertical; }
  .decision-record > .form-error { margin: 0 15px 12px; }
  .decision-record > footer.decision-actions { padding: 11px 15px 12px; border-top: 1px solid var(--line); justify-content: flex-end; background: #fbfcfd; }
  .decision-actions { display: flex; gap: 7px; }
  .decision-actions button, .create-dialog footer button { min-height: 34px; padding: 0 13px; border: 1px solid var(--line-strong); border-radius: 5px; background: #fff; cursor: pointer; }
  .button-primary { color: #fff !important; border-color: var(--blue) !important; background: var(--blue) !important; }
  .button-primary:hover { background: var(--blue-dark) !important; }
  .decision-actions button:disabled { color: var(--muted) !important; border-color: var(--line) !important; background: #eef0f3 !important; cursor: not-allowed; }
  .risk-state { color: var(--amber); font-size: 11px; font-weight: 700; }
  .risk-state--triggered { color: var(--red); }
  .risk-goal-links { padding: 10px 14px; border-top: 1px solid var(--line); display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 14px; }
  .risk-goal-links > span { color: var(--muted); font-size: 11px; font-weight: 650; }
  .risk-goal-links > div { min-width: 0; display: flex; flex-wrap: wrap; gap: 8px 18px; }
  .risk-goal-links .decision-owner-link { min-width: min(100%, 220px); }
  .risk-goal-links .decision-owner-link strong { font-size: 13px; }
  .decision-link-row { padding: 10px 14px; border-top: 1px solid var(--line); background: #fbfcfd; display: flex; align-items: center; justify-content: space-between; gap: 18px; }
  .decision-link-row span { color: var(--muted); font-size: 12px; }
  .decision-link-row a { flex: 0 0 auto; color: var(--blue-dark); font-weight: 650; text-decoration: none; }
  .decision-stack > .human-review-list { margin: 0; border: 1px solid var(--line-strong); border-radius: 5px; overflow: hidden; }
  .decision-empty { min-height: 410px; display: grid; place-content: center; justify-items: center; text-align: center; color: var(--muted); }
  .decision-empty > svg { width: 30px; height: 30px; color: var(--green); }
  .decision-empty h2 { margin: 12px 0 3px; color: var(--ink); font-size: 19px; }
  .decision-empty p { margin: 0; }
  .mobile-switch { display: none; }
  .create-dialog { width: min(680px, calc(100vw - 32px)); max-height: calc(100vh - 40px); padding: 0; border: 0; border-radius: 8px; box-shadow: var(--shadow); }
  .create-dialog::backdrop { background: rgba(25, 34, 45, .36); backdrop-filter: blur(2px); }
  .dialog-shell { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; max-height: calc(100vh - 40px); }
  .create-dialog header { padding: 18px 20px; border-bottom: 1px solid var(--line); display: flex; align-items: flex-start; justify-content: space-between; }
  .create-dialog header > div { display: flex; gap: 11px; }
  .dialog-icon { width: 34px; height: 34px; border-radius: 6px; background: var(--blue-soft); color: var(--blue); display: grid; place-items: center; font-size: 18px; }
  .dialog-icon--danger { color: var(--red); background: var(--red-soft); }
  .create-dialog h2 { margin: 0; font-size: 19px; }
  .create-dialog header p { margin: 1px 0 0; color: var(--muted); font-size: 12px; }
  .dialog-body { padding: 18px 20px 22px; overflow: auto; display: grid; gap: 13px; }
  .dialog-body label { display: grid; gap: 5px; }
  .dialog-body label > span, .dialog-body legend { font-weight: 650; }
  .dialog-body small { color: var(--muted); font-weight: 400; }
  .dialog-body input:not([type=checkbox]), .dialog-body textarea, .dialog-body select { width: 100%; border: 1px solid var(--line-strong); border-radius: 5px; padding: 8px 10px; background: #fff; resize: vertical; }
  .goal-trash-dialog { width: min(560px, calc(100vw - 32px)); }
  .goal-trash-dialog .dialog-body { align-content: start; grid-auto-rows: max-content; }
  .goal-trash-target { margin: 0; padding-bottom: 12px; border-bottom: 1px solid var(--line); display: grid; gap: 2px; }
  .goal-trash-target strong { overflow-wrap: anywhere; }
  .goal-trash-target small { font-size: 11px; }
  .goal-trash-note { margin: 0; padding: 10px 12px; border: 1px solid var(--line); border-radius: 5px; color: #39424e; background: #fbfcfd; font-size: 12px; }
  .field-row { display: grid; gap: 12px; }
  .field-row--split { grid-template-columns: 1fr 120px; }
  .dialog-body fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
  .relation-field { min-width: 0; padding: 13px 0 3px; border-top: 1px solid var(--line); }
  .relation-field-heading, .relation-field > legend { width: 100%; margin: 0 0 9px; padding: 0; display: grid; grid-template-columns: 82px minmax(0, 1fr); gap: 12px; text-align: left; }
  .relation-field-heading > span, .relation-field > legend > span { width: fit-content; height: fit-content; padding: 2px 6px; border-radius: 3px; color: #4f5864; background: #eef1f4; font-size: 11px; font-weight: 650; }
  .relation-field-heading h3 { margin: 0; font-size: 14px; }
  .relation-field-heading p, .relation-field > legend small { margin: 2px 0 0; color: var(--muted); font-size: 12px; font-weight: 400; }
  .relation-field > legend strong, .relation-field > legend small { display: block; }
  .relation-preview { margin: 7px 0 0; padding: 7px 9px; border-radius: 4px; color: #39424e; background: #f4f7fa; font-size: 12px; overflow-wrap: anywhere; }
  .goal-choice-list { max-height: 134px; margin-top: 6px; padding: 5px; border: 1px solid var(--line); border-radius: 5px; overflow: auto; display: grid; grid-template-columns: 1fr 1fr; }
  .goal-choice { padding: 6px 7px; display: grid !important; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 8px !important; border-radius: 4px; cursor: pointer; }
  .goal-choice:hover { background: var(--blue-soft); }
  .goal-choice > span { min-width: 0; display: grid; }
  .goal-choice strong, .goal-choice small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .form-error { margin: 0; padding: 9px 11px; border-radius: 4px; color: var(--red); background: var(--red-soft); }
  .create-dialog footer { padding: 13px 20px; border-top: 1px solid var(--line); display: flex; justify-content: flex-end; gap: 8px; }
  .toast { position: fixed; left: 50%; bottom: 24px; z-index: 30; padding: 9px 14px; border-radius: 5px; color: #fff; background: #202632; box-shadow: var(--shadow); transform: translate(-50%, 18px); opacity: 0; pointer-events: none; transition: .16s ease; }
  .toast.is-visible { transform: translate(-50%, 0); opacity: 1; }
  .toast.is-error { background: var(--red); }
  .bound-list { display: grid; gap: 7px; }
  .bound-list article { min-width: 0; display: grid; }
  .bound-list small { color: var(--muted); overflow-wrap: anywhere; }
  .full-records { margin-top: 14px; border: 1px solid var(--line); border-radius: 5px; }
  .full-records > summary { padding: 9px 12px; color: var(--muted); cursor: pointer; background: #fbfcfd; }
  .full-records > summary span { float: right; color: var(--faint); font-size: 11px; }
  .record-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-top: 1px solid var(--line); }
  .record-grid section { min-width: 0; padding: 11px 13px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .record-grid section:nth-child(2n) { border-right: 0; }
  .record-grid section:nth-last-child(-n+2) { border-bottom: 0; }
  .record-grid h3 { margin: 0 0 6px; font-size: 13px; }
  .record-grid p { margin: 5px 0; display: grid; }
  .record-grid small { color: var(--muted); overflow-wrap: anywhere; }
  .event-ledger { padding: 14px 13px; border-top: 1px solid var(--line); }
  .event-ledger > header { margin-bottom: 10px; }
  .event-ledger h3 { margin: 0; font-size: 13px; }
  .event-ledger header p { margin: 2px 0 0; color: var(--muted); font-size: 11px; }
  .event-ledger > ol { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--line); }
  .event-ledger li { border-bottom: 1px solid var(--line); }
  .event-ledger details > summary { min-width: 0; padding: 10px 0; display: grid; grid-template-columns: 126px minmax(0, 1fr); gap: 10px; cursor: pointer; }
  .event-ledger time { color: var(--muted); font-size: 11px; }
  .event-ledger summary span { min-width: 0; display: grid; gap: 1px; }
  .event-ledger summary strong, .event-ledger summary small { overflow-wrap: anywhere; }
  .event-ledger summary small { color: var(--muted); font-size: 10px; }
  .event-ledger dl { margin: 0 0 10px; padding: 9px 10px; border: 1px solid var(--line); border-radius: 4px; background: #fbfcfd; display: grid; gap: 5px; }
  .event-ledger dl div { min-width: 0; display: grid; grid-template-columns: 70px minmax(0, 1fr); gap: 8px; }
  .event-ledger dt { color: var(--muted); font-size: 11px; }
  .event-ledger dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
  .event-ledger pre { max-height: 300px; margin: 0 0 11px; padding: 10px; overflow: auto; border: 1px solid var(--line); border-radius: 4px; background: #f7f9fb; color: #36404c; font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
  @keyframes document-in { from { opacity: .5; transform: translateY(5px); } }
  @keyframes pulse { 50% { opacity: .35; } }
`;

const RESPONSIVE_STYLES = `
  @container (max-width: 660px) {
    .document-subsection, .draft-editor-section { margin-left: 0; }
    .human-review-list > header { display: grid; gap: 2px; }
    .human-review-form > label, .human-review-form fieldset { grid-template-columns: 1fr; gap: 5px; }
    .human-review-form > label > span, .human-review-form legend { padding-top: 0; }
    .human-review-form footer { align-items: stretch; flex-direction: column; }
    .human-review-form footer button { align-self: flex-end; }
    .evidence-form-row { grid-template-columns: 1fr; }
    .evidence-submit footer { align-items: stretch; flex-direction: column; }
    .evidence-submit footer button { align-self: flex-end; }
    .event-ledger details > summary { grid-template-columns: 1fr; gap: 3px; }
    .event-ledger dl div { grid-template-columns: 1fr; gap: 2px; }
    .goal-situation { grid-template-columns: 1fr 1fr; }
    .goal-situation-cell:nth-child(2n) { border-right: 0; }
    .goal-situation-cell:nth-child(-n+2) { border-bottom: 1px solid var(--line); }
    .policy-effective dl { grid-template-columns: 1fr 1fr; }
    .policy-inheritance { grid-template-columns: 1fr; gap: 5px; }
    .policy-inheritance > svg { transform: rotate(90deg); }
    .policy-source > summary { align-items: flex-start; }
    .policy-source-state { min-width: 0; max-width: 42%; }
    .policy-source-title > span:last-child > span, .policy-source-state small { display: none; }
    .policy-mode-options, .policy-control--split, .policy-toggle-list, .policy-review-counts { grid-template-columns: 1fr; }
    .policy-reason { grid-template-columns: 1fr; gap: 5px; }
    .policy-reason > span { padding-top: 0; }
    .policy-form footer { align-items: stretch; flex-direction: column; }
    .policy-form footer button { align-self: flex-end; }
    .draft-form-row, .draft-list-grid, .decomposition-editor > div, .criterion-editor-grid, .draft-aux-form { grid-template-columns: 1fr; }
    .draft-list-grid label:last-child, .criterion-pass, .draft-aux-wide { grid-column: 1; }
    .decomposition-choice { border-right: 0; }
    .decomposition-choice:nth-last-child(2) { border-bottom: 1px solid var(--line); }
    .criteria-editor > header, .draft-contract-form > footer { align-items: stretch; flex-direction: column; }
    .criteria-editor > header button, .draft-contract-form > footer button { align-self: flex-end; }
    .draft-aux-form { padding-left: 0; }
    .relation-direction-control > div, .relation-builder { grid-template-columns: 1fr; }
    .relation-form > footer { align-items: stretch; flex-direction: column; }
    .relation-form > footer button { align-self: flex-end; }
    .relation-editor-action { display: none; }
    .risk-facts, .risk-form, .risk-state-form { grid-template-columns: 1fr; }
    .risk-facts { padding-left: 14px; }
    .risk-fact-wide, .risk-form-wide, .risk-goal-picker { grid-column: 1; }
    .risk-record > header > div { grid-template-columns: 1fr; }
    .risk-record .risk-state { margin-bottom: 2px; }
    .risk-effect, .risk-readonly { margin-left: 14px; }
    .risk-actions > details > summary, .risk-form, .risk-state-form { padding-left: 14px; }
    .risk-goal-options { grid-template-columns: 1fr; }
    .risk-form footer, .risk-state-form footer { align-items: stretch; flex-direction: column; }
    .risk-form footer button, .risk-state-form footer button { align-self: flex-end; }
    .impact-facts, .impact-form { grid-template-columns: 1fr; }
    .impact-facts { padding-left: 14px; }
    .impact-fact-wide, .impact-form-wide { grid-column: 1; }
    .impact-record > header { grid-template-columns: auto minmax(0, 1fr); }
    .impact-record > header > div { grid-template-columns: 1fr; }
    .impact-record > header > .impact-state { grid-column: 2; justify-self: start; }
    .impact-access { margin-bottom: 2px; }
    .impact-effect, .impact-readonly { margin-left: 14px; }
    .impact-actions > details > summary, .impact-form, .impact-deactivate form { padding-left: 14px; }
    .impact-form footer { align-items: stretch; flex-direction: column; }
    .impact-form footer button { align-self: flex-end; }
  }
  @media (max-width: 1500px) {
    .brand { min-width: 160px; padding-inline: 20px; }
    .project-context { min-width: 0; padding-inline: 14px; }
    .project-context > span:not(.sync-state) { max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
    .top-action { padding-inline: 9px; }
  }
  @media (max-width: 1180px) {
    .app, .topbar, .workspace { min-width: 0; }
    .workspace { grid-template-columns: var(--tree-width, 280px) 5px minmax(0, 1fr); }
    .workspace.is-desktop-tui { grid-template-columns: var(--tree-width, 240px) 5px minmax(0, 1fr) 5px var(--tui-width, 400px); }
    .workspace.is-desktop-tui.is-tui-collapsed { grid-template-columns: var(--tree-width, 240px) 5px minmax(0, 1fr) 0 0; }
    .project-context { min-width: 0; padding-inline: 12px; }
    .project-context > span:not(.sync-state) { max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
    .project-decisions span { display: none; }
    .top-action { padding-inline: 8px; }
    .top-action span { display: none; }
    .runtime-grid { grid-template-columns: 1fr 1fr; }
    .runtime-grid > section:nth-child(2) { border-right: 0; }
    .runtime-grid > section:nth-child(-n+2) { border-bottom: 1px solid var(--line-strong); }
  }
  @media (max-width: 900px) {
    .top-spacer { display: none; }
    .project-bar { min-width: 0; flex: 1 1 auto; }
    .project-context { min-width: 0; flex: 1 1 auto; padding-inline: 12px; }
    .project-context > strong, .project-demo, .project-bar > .sync-state { display: none; }
    .project-context > span:not(.sync-state) { min-width: 0; flex: 1 1 auto; max-width: 180px; overflow: hidden; text-overflow: ellipsis; }
    .project-context a { flex: 0 0 auto; }
  }
  @media (max-width: 760px) {
    body { overflow: hidden; }
    .app { grid-template-rows: 52px 42px minmax(0, 1fr); }
    .topbar { grid-row: 1; }
    .brand { min-width: 0; padding: 0 15px; border-right: 0; }
    .brand strong { font-size: 17px; }
    .project-context { padding-inline: 8px; }
    .project-context > span:not(.sync-state) { max-width: 132px; }
    .top-spacer { flex: 1; }
    .top-action { margin-right: 8px; }
    .top-action span { display: none; }
    .tree-search kbd { display: none; }
    .tree-search input { padding-right: 10px; }
    .mobile-switch { grid-row: 2; display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); padding: 5px; border-bottom: 1px solid var(--line); background: var(--rail); }
    .mobile-switch button { border: 0; border-radius: 4px; background: transparent; color: var(--muted); }
    .mobile-switch button.is-active { color: var(--blue-dark); background: #fff; box-shadow: 0 1px 3px rgba(22, 31, 43, .1); }
    .workspace { grid-row: 3; grid-template-columns: 1fr; }
    .tree-resizer, .tui-resizer { display: none; }
    .workspace.is-desktop-tui { grid-template-columns: 1fr; }
    .workspace.is-desktop-tui .tree-resizer, .workspace.is-desktop-tui .tui-resizer { display: none; }
    .workspace[data-mobile-view="tree"] .document-pane,
    .workspace[data-mobile-view="tree"] .tui-pane { display: none; }
    .workspace[data-mobile-view="document"] .tree-pane,
    .workspace[data-mobile-view="document"] .tui-pane { display: none; }
    .workspace[data-mobile-view="tui"] .tree-pane,
    .workspace[data-mobile-view="tui"] .document-pane { display: none; }
    .workspace[data-mobile-view="tui"] .tui-pane { display: grid; }
    .tui-collapse, .tui-expand { display: none !important; }
    .tree-pane { border-right: 0; }
    .goal-document { padding: 20px 18px 64px; }
    .goal-title-row { display: grid; gap: 10px; }
    .goal-title-actions { justify-content: space-between; }
    .goal-meta { gap: 8px 16px; }
    .trash-summary, .trash-restore-row { margin-left: 0; }
    .trash-restore-row { align-items: stretch; flex-direction: column; }
    .trash-restore-row .button-primary { align-self: flex-start; }
    .runtime-grid { grid-template-columns: 1fr; }
    .runtime-grid > section { min-height: 0; border-right: 0 !important; border-bottom: 1px solid var(--line) !important; }
    .runtime-grid > section:last-child { border-bottom: 0 !important; }
    .contract-list section { grid-template-columns: 1fr; gap: 6px; }
    .human-review-list > header { display: grid; gap: 2px; }
    .human-review-form > label, .human-review-form fieldset { grid-template-columns: 1fr; gap: 5px; }
    .human-review-form > label > span, .human-review-form legend { padding-top: 0; }
    .human-review-form footer { align-items: stretch; flex-direction: column; }
    .human-review-form footer button { align-self: flex-end; }
    .evidence-form-row { grid-template-columns: 1fr; }
    .evidence-submit footer { align-items: stretch; flex-direction: column; }
    .evidence-submit footer button { align-self: flex-end; }
    .policy-effective { padding-inline: 14px; }
    .policy-effective dl { grid-template-columns: 1fr 1fr; }
    .policy-inheritance { grid-template-columns: 1fr; gap: 5px; }
    .policy-inheritance > svg { transform: rotate(90deg); }
    .policy-source > summary { align-items: flex-start; }
    .policy-source-state { min-width: 0; max-width: 42%; }
    .policy-source-title > span:last-child > span, .policy-source-state small { display: none; }
    .policy-mode-options, .policy-control--split, .policy-toggle-list, .policy-review-counts { grid-template-columns: 1fr; }
    .policy-reason { grid-template-columns: 1fr; gap: 5px; }
    .policy-reason > span { padding-top: 0; }
    .policy-form footer { align-items: stretch; flex-direction: column; }
    .policy-form footer button { align-self: flex-end; }
    .draft-form-row, .draft-list-grid, .decomposition-editor > div, .criterion-editor-grid, .draft-aux-form { grid-template-columns: 1fr; }
    .draft-list-grid label:last-child, .criterion-pass, .draft-aux-wide { grid-column: 1; }
    .decomposition-choice { border-right: 0; }
    .decomposition-choice:nth-last-child(2) { border-bottom: 1px solid var(--line); }
    .criteria-editor > header, .draft-contract-form > footer { align-items: stretch; flex-direction: column; }
    .criteria-editor > header button, .draft-contract-form > footer button { align-self: flex-end; }
    .draft-aux-form { padding-left: 0; }
    .relation-direction-control > div, .relation-builder { grid-template-columns: 1fr; }
    .relation-form > footer { align-items: stretch; flex-direction: column; }
    .relation-form > footer button { align-self: flex-end; }
    .relation-editor-action { display: none; }
    .history-list li { grid-template-columns: 1fr; gap: 2px; }
    .decision-center { padding-inline: 24px; }
    .decision-center-header, .candidate-title, .decision-owner { align-items: flex-start; }
    .decision-center-header { display: grid; }
    .decision-center-header > strong { text-align: left; }
    .decision-summary { gap: 7px 16px; }
    .decision-record-heading { align-items: flex-start; }
    .candidate-title { display: grid; }
    .candidate-title > span { justify-self: start; }
    .candidate-contract { grid-template-columns: 1fr; }
    .candidate-wide { grid-column: 1; }
    .decision-reason { grid-template-columns: 1fr; gap: 5px; }
    .decision-reason > span { padding-top: 0; }
    .goal-situation { grid-template-columns: 1fr 1fr; }
    .goal-situation-cell:nth-child(2n) { border-right: 0; }
    .goal-situation-cell:nth-child(-n+2) { border-bottom: 1px solid var(--line); }
    .contract-proposal > header { display: grid; }
    .contract-diff-row, .proposal-appendix { grid-template-columns: 1fr; gap: 6px; }
    .proposal-source { padding: 7px 0 0; border-left: 0; border-top: 1px dashed var(--line); }
    .dependency-direction, .dependency-rationale { grid-template-columns: 1fr; }
    .dependency-direction > span { grid-auto-flow: column; justify-content: start; gap: 5px; }
    .dependency-direction > span svg { transform: rotate(90deg); }
    .dependency-evidence { grid-template-columns: 1fr; }
    .dependency-evidence .inline-ref, .dependency-evidence > .empty-row { grid-column: 1; }
    .decision-actions { justify-content: flex-end; }
    .field-row--split, .goal-choice-list { grid-template-columns: 1fr; }
    .relation-field-heading, .relation-field > legend { grid-template-columns: 1fr; gap: 6px; }
    .dialog-body input:not([type=checkbox]), .dialog-body textarea, .dialog-body select, .policy-form input:not([type=checkbox]), .policy-form textarea, .policy-form select, .human-review-form input:not([type=checkbox]), .human-review-form textarea, .human-review-form select, .evidence-submit textarea, .evidence-submit select, .draft-contract-form input:not([type=radio]), .draft-contract-form textarea, .draft-contract-form select, .draft-aux-form input, .draft-aux-form textarea, .draft-aux-form select, .relation-form input, .relation-form textarea, .relation-form select, .relation-deactivate-form textarea, .risk-form input:not([type=checkbox]), .risk-form textarea, .risk-form select, .risk-state-form textarea, .risk-state-form select, .impact-form input, .impact-form textarea, .impact-form select, .impact-deactivate textarea { font-size: 16px; }
    .create-dialog { width: 100vw; max-width: none; height: 100vh; max-height: none; margin: 0; border-radius: 0; }
    .dialog-shell { max-height: 100vh; height: 100%; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; scroll-behavior: auto !important; }
  }
`;

const PROJECT_INDEX_STYLES = `
  body.project-index-page { overflow: auto; background: var(--page); }
  .project-index-page > .topbar { height: 58px; }
  .project-index-page .brand { color: inherit; text-decoration: none; }
  .project-index { min-height: calc(100dvh - 58px); padding: clamp(40px, 10vh, 112px) 24px; display: grid; place-items: start center; }
  .project-index-panel { width: min(100%, 760px); border: 1px solid var(--line-strong); background: var(--paper); box-shadow: var(--shadow); }
  .project-index-heading { padding: 28px 30px 23px; border-bottom: 1px solid var(--line-strong); }
  .project-index-heading h1 { margin: 0; font-size: 25px; letter-spacing: -.03em; }
  .project-index-heading p { max-width: 52ch; margin: 7px 0 0; color: var(--muted); }
  .project-index-desktop-note { max-width: none; margin-top: 14px; padding: 10px 12px; border: 1px solid #bcd4f2; border-radius: 4px; background: var(--blue-soft); color: var(--blue-dark); font-size: 13px; font-weight: 650; }
  .project-list { list-style: none; margin: 0; padding: 0; }
  .project-list li + li { border-top: 1px solid var(--line); }
  .project-list a { min-height: 74px; padding: 16px 24px 16px 30px; color: inherit; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px 18px; text-decoration: none; }
  .project-list a:hover { background: #f7faff; }
  .project-list a:focus-visible { outline-offset: -3px; }
  .project-list a > span { min-width: 0; display: grid; gap: 2px; }
  .project-list strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; }
  .project-list span { color: var(--muted); font-size: 12px; }
  .project-list svg { color: var(--faint); }
  .project-list a:hover svg { color: var(--blue); transform: rotate(-90deg); }
  .project-index-empty { padding: 42px 30px 46px; color: var(--muted); }
  .project-index-empty h2 { margin: 0 0 7px; color: var(--ink); font-size: 18px; }
  .project-index-empty p { max-width: 48ch; margin: 0; }
  .project-index-start { margin-top: 18px; display: flex; flex-wrap: wrap; gap: 9px; }
  .project-index-start a { min-height: 34px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 4px; color: var(--blue-dark); background: #fff; display: inline-flex; align-items: center; font-weight: 650; text-decoration: none; }
  .project-index-start a:first-child { border-color: var(--blue); color: #fff; background: var(--blue); }
  .project-index-start a:hover { border-color: #b8d3f5; background: var(--blue-soft); color: var(--blue-dark); }
  .project-index-migration { padding: 16px 30px; border-top: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: 18px; background: #fbfcfd; }
  .project-index-migration > div { min-width: 0; }
  .project-index-migration strong { display: block; font-size: 13px; }
  .project-index-migration small { display: block; margin-top: 2px; color: var(--muted); }
  .project-index-migrate { min-height: 34px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 4px; color: var(--blue-dark); background: #fff; font-weight: 650; white-space: nowrap; cursor: pointer; }
  .project-index-migrate:hover { border-color: #b8d3f5; background: var(--blue-soft); }
  .project-migration-dialog { width: min(100% - 28px, 580px); padding: 0; border: 1px solid var(--line-strong); border-radius: 6px; color: var(--ink); box-shadow: var(--shadow); }
  .project-migration-dialog::backdrop { background: rgba(27, 35, 45, .32); }
  .project-migration-form { display: grid; }
  .project-migration-form > header { padding: 22px 24px 18px; border-bottom: 1px solid var(--line); display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .project-migration-form h2 { margin: 0; font-size: 19px; letter-spacing: -.02em; }
  .project-migration-form header p { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
  .project-migration-form > .project-migration-body { padding: 20px 24px; display: grid; gap: 15px; }
  .project-migration-form label:not(.project-migration-confirm) { display: grid; gap: 5px; color: #38414d; font-size: 13px; font-weight: 650; }
  .project-migration-form label small { color: var(--muted); font-weight: 400; }
  .project-migration-form input[type=text] { width: 100%; min-height: 36px; padding: 0 10px; border: 1px solid var(--line-strong); border-radius: 4px; background: #fff; color: var(--ink); }
  .project-migration-form input[type=text]:focus { border-color: var(--blue); outline: 0; box-shadow: 0 0 0 2px color-mix(in srgb, var(--blue), transparent 84%); }
  .project-migration-warning { margin: 0; padding: 10px 11px; color: #654300; border: 1px solid #efd49c; background: var(--amber-soft); font-size: 12px; line-height: 1.55; }
  .project-migration-confirm { display: flex; align-items: flex-start; gap: 9px; color: #303944; font-size: 13px; line-height: 1.45; cursor: pointer; }
  .project-migration-confirm input { width: 16px; height: 16px; margin: 2px 0 0; accent-color: var(--blue); }
  .project-migration-error { margin: 0; color: var(--red); font-size: 13px; }
  .project-migration-form > footer { padding: 14px 24px; border-top: 1px solid var(--line); display: flex; justify-content: flex-end; gap: 9px; background: #fbfcfd; }
  .project-migration-form > footer button { min-height: 34px; padding: 0 13px; border: 1px solid var(--line-strong); border-radius: 4px; background: #fff; cursor: pointer; }
  .project-migration-form > footer .project-migration-submit { border-color: var(--blue); color: #fff; background: var(--blue); font-weight: 650; }
  .project-migration-form > footer .project-migration-submit:hover { background: var(--blue-dark); }
  .project-migration-form > footer .project-migration-submit:disabled { opacity: .58; cursor: wait; }
  .project-index-note { margin: 0; padding: 12px 30px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; background: #fbfcfd; }
  @media (max-width: 760px) {
    .project-index-page > .topbar { height: 52px; }
    .project-index { min-height: calc(100dvh - 52px); }
    .project-index-page .project-context small { display: none; }
  }
  @media (max-width: 620px) {
    .project-index { padding: 28px 14px; place-items: start stretch; }
    .project-index-panel { width: 100%; }
    .project-index-heading, .project-index-empty { padding-inline: 20px; }
    .project-list a { padding-inline: 20px; }
    .project-index-migration { padding-inline: 20px; align-items: stretch; flex-direction: column; }
    .project-index-migrate { align-self: flex-start; }
    .project-index-note { padding-inline: 20px; }
    .project-migration-form > header, .project-migration-form > .project-migration-body, .project-migration-form > footer { padding-inline: 18px; }
  }
`;

const CONTROL_CLIENT_SCRIPT = `
  globalThis.goalboardControlHeaders = () => {
    const token = document.querySelector('meta[name="goalboard-control-token"]')?.content || "";
    const requestKey = globalThis.crypto?.randomUUID?.() || (Date.now().toString(36) + "-" + Math.random().toString(36).slice(2));
    return {
      "content-type": "application/json",
      "x-goalboard-control-token": token,
      "x-goalboard-idempotency-key": requestKey,
    };
  };
`;

const PROJECT_INDEX_CLIENT_SCRIPT = `
  (() => {
    const dialog = document.querySelector("[data-project-migration-dialog]");
    const form = document.querySelector("[data-project-migration-form]");
    const errorBox = document.querySelector("[data-project-migration-error]");
    const open = () => {
      if (!dialog) return;
      errorBox.hidden = true;
      errorBox.textContent = "";
      dialog.showModal();
      requestAnimationFrame(() => form?.elements.legacy_database_path?.focus());
    };
    document.querySelectorAll("[data-open-project-migration]").forEach((button) => {
      button.addEventListener("click", open);
    });
    document.querySelectorAll("[data-close-project-migration]").forEach((button) => {
      button.addEventListener("click", () => dialog?.close());
    });
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = new FormData(form);
      const confirmed = values.get("user_confirmed") === "on";
      if (!confirmed) {
        errorBox.textContent = L("请先确认你要迁移这份已有 GoalBoard 数据。");
        errorBox.hidden = false;
        return;
      }
      const submit = form.querySelector("[data-project-migration-submit]");
      submit.disabled = true;
      errorBox.hidden = true;
      try {
        const response = await fetch("/api/projects/migrate", {
          method: "POST",
          headers: goalboardControlHeaders(),
          body: JSON.stringify({
            legacy_database_path: String(values.get("legacy_database_path") || "").trim(),
            display_name: String(values.get("display_name") || "").trim(),
            user_confirmed: true,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || L("迁移失败，请检查来源 DB 后重试"));
        location.assign(result.project_path);
      } catch (error) {
        errorBox.textContent = error.message || L("迁移失败，请检查来源 DB 后重试");
        errorBox.hidden = false;
        submit.disabled = false;
      }
    });
  })();
`;

const SETTINGS_STYLES = `
  body.settings-page { min-height: 100%; overflow: hidden; background: var(--page); }
  .settings-page > .topbar { height: 58px; }
  .settings-page .brand { color: inherit; text-decoration: none; }
  .settings-shell { height: calc(100dvh - 58px); min-width: 0; display: grid; grid-template-columns: 232px minmax(0, 1fr); }
  .settings-navigation { min-height: 0; padding: 18px 10px; border-right: 1px solid var(--line-strong); background: #fbfcfd; display: flex; flex-direction: column; gap: 3px; }
  .settings-navigation a { min-height: 50px; padding: 7px 10px; border-radius: 5px; color: #343b46; display: grid; grid-template-columns: 22px minmax(0, 1fr); align-items: center; gap: 9px; text-decoration: none; }
  .settings-navigation a:hover { background: #f0f3f7; }
  .settings-navigation a[aria-current=page] { color: var(--blue-dark); background: var(--blue-soft); }
  .settings-navigation a > svg { font-size: 17px; }
  .settings-navigation a > span { min-width: 0; display: grid; }
  .settings-navigation strong { font-size: 13px; }
  .settings-navigation small { color: var(--muted); font-size: 11px; }
  .settings-content { min-width: 0; min-height: 0; overflow: auto; background: var(--paper); }
  .settings-document { width: min(100%, 980px); min-height: 100%; padding: 38px 42px 80px; }
  .settings-heading { max-width: 72ch; padding-bottom: 25px; border-bottom: 1px solid var(--line-strong); }
  .settings-heading h1 { margin: 0; font-size: clamp(24px, 2.1vw, 30px); line-height: 1.25; letter-spacing: -.03em; }
  .settings-heading p { margin: 8px 0 0; color: var(--muted); }
  .settings-record-list { border-bottom: 1px solid var(--line-strong); }
  .settings-record { border-bottom: 1px solid var(--line); }
  .settings-record:last-child { border-bottom: 0; }
  .settings-record > header { min-height: 92px; padding: 19px 0; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
  .settings-record-title { min-width: 0; display: flex; align-items: flex-start; gap: 12px; }
  .settings-record-title .record-icon { width: 34px; height: 34px; flex: 0 0 34px; border: 1px solid var(--line); border-radius: 6px; display: grid; place-items: center; color: var(--blue-dark); background: #fbfcfd; }
  .settings-record-title h2, .settings-record-title h3 { margin: 0; font-size: 16px; letter-spacing: -.015em; }
  .settings-record-title p { margin: 3px 0 0; color: var(--muted); font-size: 12px; }
  .settings-record-action { flex: 0 0 auto; display: flex; align-items: center; gap: 12px; }
  .settings-record-action button, .settings-button, .settings-action-section button, .settings-import-row button, .project-record-tools form button { min-height: 34px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 4px; color: var(--blue-dark); background: #fff; font-weight: 650; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
  .settings-record-action button:hover, .settings-button:hover, .settings-action-section button:hover, .settings-import-row button:hover, .project-record-tools form button:hover { border-color: #b8d3f5; background: var(--blue-soft); }
  .settings-record-action button:disabled { color: var(--faint); background: #f5f6f8; cursor: not-allowed; }
  .settings-state { display: inline-flex; align-items: center; white-space: nowrap; font-size: 12px; font-weight: 650; }
  .settings-state--success { color: var(--green); }
  .settings-state--warning { color: #8a5100; }
  .settings-state--danger { color: var(--red); }
  .settings-state--neutral { color: var(--muted); }
  .settings-paths { margin: 0; padding: 0 0 18px 46px; display: grid; gap: 5px; }
  .settings-paths > div { min-width: 0; display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 9px; }
  .settings-paths dt, .project-db-details dt, .diagnostics-summary dt, .runtime-plan-meta dt { color: var(--muted); font-size: 11px; font-weight: 650; }
  .settings-paths dd, .project-db-details dd, .diagnostics-summary dd, .runtime-plan-meta dd { min-width: 0; margin: 0; overflow-wrap: anywhere; color: #3b4350; font-size: 12px; }
  .settings-footnote { max-width: 72ch; margin: 20px 0 0; color: var(--muted); font-size: 12px; }
  .settings-footnote code { padding: 1px 4px; border: 1px solid var(--line); border-radius: 3px; color: #3d4552; background: #fbfcfd; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .settings-empty { padding: 34px 0 38px; color: var(--muted); }
  .settings-empty h2 { margin: 0; color: var(--ink); font-size: 16px; }
  .settings-empty p { margin: 5px 0 0; }
  .settings-action-section, .settings-import-row { padding: 24px 0; border-bottom: 1px solid var(--line-strong); display: grid; grid-template-columns: minmax(220px, .8fr) minmax(320px, 1.2fr); gap: 30px; align-items: start; }
  .settings-action-section h2, .settings-import-row h2, .launcher-section h2, .diagnostics-summary h2 { margin: 0; font-size: 16px; }
  .settings-action-section > div > p, .settings-import-row > div > p { margin: 5px 0 0; color: var(--muted); font-size: 12px; }
  .inline-settings-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: end; }
  .inline-settings-form > label:first-child { min-width: 0; display: grid; gap: 5px; color: #38414d; font-size: 12px; font-weight: 650; }
  .inline-settings-form input[type=text], .project-record-tools input { width: 100%; min-height: 36px; padding: 0 10px; border: 1px solid var(--line-strong); border-radius: 4px; color: var(--ink); background: #fff; }
  .inline-settings-form .inline-confirm { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; cursor: pointer; }
  .inline-settings-form .settings-form-error { grid-column: 1 / -1; }
  .settings-form-error { margin: 0; color: var(--red); font-size: 12px; }
  .project-record-tools { margin: -8px 0 16px 46px; display: flex; gap: 8px; }
  .project-record-tools details { min-width: min(100%, 280px); }
  .project-record-tools summary { min-height: 32px; padding: 0 7px; display: inline-flex; align-items: center; gap: 7px; color: var(--muted); font-size: 12px; font-weight: 650; cursor: pointer; list-style: none; }
  .project-record-tools summary::-webkit-details-marker { display: none; }
  .project-record-tools summary svg:last-child { font-size: 11px; }
  .project-record-tools details[open] summary svg:last-child { transform: rotate(180deg); }
  .project-record-tools form, .project-db-details { width: min(100%, 440px); margin: 5px 0 0; padding: 13px; border: 1px solid var(--line); background: #fbfcfd; }
  .project-record-tools form { display: grid; gap: 9px; }
  .project-record-tools form label { display: grid; gap: 5px; color: #38414d; font-size: 12px; font-weight: 650; }
  .project-record-tools form button { justify-self: end; }
  .project-db-details { display: grid; gap: 7px; }
  .project-db-details > div { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 8px; }
  .connection-settings-section { margin-top: 30px; padding-top: 28px; border-top: 1px solid var(--line-strong); }
  .connection-settings-heading { max-width: 72ch; margin-bottom: 8px; }
  .connection-settings-heading h2 { margin: 0; font-size: 18px; letter-spacing: -.02em; }
  .connection-settings-heading p { margin: 6px 0 0; color: var(--muted); font-size: 12px; }
  .connection-record-list { border-bottom: 1px solid var(--line-strong); }
  .connection-record .settings-record-title p strong { color: #3b4350; }
  .connection-record-tools { margin: -6px 0 17px 46px; display: flex; align-items: flex-start; gap: 10px; }
  .connection-record-tools details { min-width: min(100%, 300px); }
  .connection-record-tools summary { min-height: 32px; padding: 0 7px; display: inline-flex; align-items: center; gap: 7px; color: var(--muted); font-size: 12px; font-weight: 650; cursor: pointer; list-style: none; }
  .connection-record-tools summary::-webkit-details-marker { display: none; }
  .connection-record-tools summary svg:last-child { font-size: 11px; }
  .connection-record-tools details[open] summary svg:last-child { transform: rotate(180deg); }
  .connection-action-form { width: min(100%, 460px); margin-top: 5px; padding: 13px; border: 1px solid var(--line); background: #fbfcfd; display: grid; gap: 10px; }
  .connection-action-form > label:not(.inline-confirm) { display: grid; gap: 5px; color: #38414d; font-size: 12px; font-weight: 650; }
  .connection-action-form select { width: 100%; min-height: 36px; padding: 0 9px; border: 1px solid var(--line-strong); border-radius: 4px; color: var(--ink); background: #fff; }
  .connection-action-form .inline-confirm { display: flex; align-items: flex-start; gap: 8px; color: var(--muted); font-size: 12px; cursor: pointer; }
  .connection-action-form .inline-confirm input { margin-top: 2px; }
  .connection-action-form > button { min-height: 34px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 4px; justify-self: end; color: var(--blue-dark); background: #fff; font-weight: 650; cursor: pointer; }
  .connection-action-form--danger > button { color: var(--red); }
  .workspace-project-list { list-style: none; margin: -4px 0 12px 46px; padding: 0; width: min(100%, 620px); border-top: 1px solid var(--line); }
  .workspace-project-list li { min-height: 46px; padding: 7px 0; border-bottom: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .workspace-project-list li > span { display: flex; align-items: center; gap: 9px; }
  .workspace-project-list form { display: flex; align-items: center; gap: 8px; }
  .workspace-project-list form button { min-height: 30px; padding: 0 9px; border: 1px solid var(--line-strong); border-radius: 4px; color: var(--red); background: #fff; cursor: pointer; }
  .workspace-project-list .settings-form-error { flex-basis: 100%; }
  .settings-import-row { border-top: 1px solid var(--line-strong); margin-top: 24px; }
  .settings-import-row > button { justify-self: end; }
  .diagnostics-summary { padding: 25px 0; border-bottom: 1px solid var(--line-strong); }
  .diagnostics-summary > div { display: flex; justify-content: space-between; gap: 20px; }
  .diagnostics-summary dl { margin: 19px 0 0; display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid var(--line); }
  .diagnostics-summary dl > div { min-width: 0; padding: 12px 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 10px; }
  .diagnostics-summary dl > div:nth-child(odd) { padding-right: 22px; }
  .launcher-section { padding: 25px 0 0; }
  .launcher-section ul { list-style: none; margin: 14px 0 0; padding: 0; border-top: 1px solid var(--line); }
  .launcher-section li { min-height: 60px; padding: 10px 0; border-bottom: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: 18px; }
  .launcher-section li > span:first-child { min-width: 0; display: grid; grid-template-columns: 22px 50px minmax(0, 1fr); align-items: center; gap: 8px; }
  .launcher-section li small { min-width: 0; overflow-wrap: anywhere; color: var(--muted); }
  .service-action-row { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px; }
  .service-action-row button { min-height: 34px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 4px; color: var(--blue-dark); background: #fff; font-weight: 650; cursor: pointer; }
  .runtime-plan-dialog { width: min(680px, calc(100vw - 28px)); max-height: min(760px, calc(100dvh - 28px)); padding: 0; border: 1px solid var(--line-strong); border-radius: 8px; color: var(--ink); box-shadow: var(--shadow); }
  .runtime-plan-dialog::backdrop { background: rgba(27, 35, 45, .34); }
  .runtime-plan-shell { max-height: min(760px, calc(100dvh - 28px)); display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
  .runtime-plan-shell > header { padding: 21px 24px 17px; border-bottom: 1px solid var(--line); display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
  .runtime-plan-shell h2 { margin: 0; font-size: 19px; letter-spacing: -.02em; }
  .runtime-plan-shell header p { margin: 5px 0 0; color: var(--muted); }
  .runtime-plan-body { min-height: 0; overflow: auto; padding: 20px 24px; }
  .runtime-change-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
  .runtime-change-list li { padding: 13px 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 74px minmax(0, 1fr); gap: 8px 12px; }
  .runtime-change-list li > strong { font-size: 12px; }
  .runtime-change-list li > div { min-width: 0; }
  .runtime-change-list li p { margin: 0; overflow-wrap: anywhere; }
  .runtime-change-list li small { display: block; margin-top: 3px; color: var(--muted); overflow-wrap: anywhere; }
  .runtime-plan-meta { margin: 18px 0 0; display: grid; gap: 7px; }
  .runtime-plan-meta > div { display: grid; grid-template-columns: 74px minmax(0, 1fr); gap: 12px; }
  .runtime-plan-confirm { margin-top: 18px; padding: 12px; border: 1px solid #c8d9ef; background: #f5f9ff; display: flex; align-items: flex-start; gap: 9px; cursor: pointer; }
  .runtime-plan-confirm input { width: 16px; height: 16px; margin: 2px 0 0; accent-color: var(--blue); }
  .runtime-plan-shell > footer { padding: 14px 24px; border-top: 1px solid var(--line); background: #fbfcfd; display: flex; justify-content: flex-end; gap: 9px; }
  .runtime-plan-shell > footer button { min-height: 34px; padding: 0 13px; border: 1px solid var(--line-strong); border-radius: 4px; background: #fff; cursor: pointer; }
  .runtime-plan-shell > footer .runtime-plan-apply { border-color: var(--blue); color: #fff; background: var(--blue); font-weight: 650; }
  .runtime-plan-shell > footer .runtime-plan-apply:disabled { opacity: .55; cursor: not-allowed; }
  .settings-page .toast { position: fixed; right: 22px; bottom: 22px; z-index: 30; }
  @media (max-width: 760px) {
    .settings-page > .topbar { height: 52px; }
    .settings-page .project-context small { display: none; }
    .settings-shell { height: calc(100dvh - 52px); grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
    .settings-navigation { padding: 6px 8px; border-right: 0; border-bottom: 1px solid var(--line-strong); flex-direction: row; overflow-x: auto; }
    .settings-navigation a { min-width: max-content; min-height: 40px; grid-template-columns: 18px auto; }
    .settings-navigation small { display: none; }
    .settings-document { padding: 25px 18px 60px; }
    .settings-record > header { align-items: flex-start; }
    .settings-record-action { align-items: flex-end; flex-direction: column; }
    .settings-paths { padding-left: 0; }
    .settings-action-section, .settings-import-row { grid-template-columns: 1fr; gap: 14px; }
    .inline-settings-form { grid-template-columns: 1fr; }
    .inline-settings-form .inline-confirm, .inline-settings-form .settings-form-error { grid-column: 1; }
    .project-record-tools { margin-left: 0; flex-wrap: wrap; }
    .connection-record-tools { margin-left: 0; flex-wrap: wrap; }
    .workspace-project-list { margin-left: 0; }
    .workspace-project-list li { align-items: flex-start; flex-direction: column; }
    .connection-record-tools details { min-width: 100%; }
    .connection-action-form { width: 100%; }
    .connection-action-form select { font-size: 16px; }
    .settings-import-row > button { justify-self: start; }
    .diagnostics-summary dl { grid-template-columns: 1fr; }
    .diagnostics-summary dl > div:nth-child(odd) { padding-right: 0; }
    .runtime-plan-dialog { width: 100vw; max-width: none; height: 100vh; max-height: none; margin: 0; border-radius: 0; }
    .runtime-plan-shell { max-height: 100vh; height: 100%; }
    .runtime-change-list li { grid-template-columns: 1fr; gap: 3px; }
    .launcher-section li > span:first-child { grid-template-columns: 20px 42px minmax(0, 1fr); }
    .inline-settings-form input[type=text], .project-record-tools input { font-size: 16px; }
  }
`;

const SETTINGS_CLIENT_SCRIPT = `
  (() => {
    const dialog = document.querySelector("[data-runtime-plan-dialog]");
    if (!dialog) return;
    const title = dialog.querySelector("[data-runtime-plan-title]");
    const message = dialog.querySelector("[data-runtime-plan-message]");
    const changes = dialog.querySelector("[data-runtime-change-list]");
    const backup = dialog.querySelector("[data-runtime-plan-backup]");
    const restart = dialog.querySelector("[data-runtime-plan-restart]");
    const confirmRow = dialog.querySelector("[data-runtime-confirm-row]");
    const confirmInput = dialog.querySelector("[data-runtime-confirm]");
    const confirmLabel = dialog.querySelector("[data-runtime-confirm-label]");
    const applyButton = dialog.querySelector("[data-runtime-plan-apply]");
    const errorBox = dialog.querySelector("[data-runtime-plan-error]");
    const toast = document.querySelector("[data-settings-toast]");
    let activePlan = null;
    let reloadOnClose = false;
    const showToast = (text) => {
      if (!toast) return;
      toast.textContent = text;
      toast.classList.add("is-visible");
      setTimeout(() => toast.classList.remove("is-visible"), 2600);
    };
    const closeDialog = () => {
      dialog.close();
      if (reloadOnClose) location.reload();
    };
    dialog.querySelectorAll("[data-runtime-plan-close]").forEach((button) => button.addEventListener("click", closeDialog));
    confirmInput?.addEventListener("change", () => {
      applyButton.disabled = !confirmInput.checked || !activePlan || activePlan.status !== "ready";
    });
    document.querySelectorAll("[data-runtime-plan]").forEach((button) => {
      button.addEventListener("click", async () => {
        const runtimeId = button.dataset.runtimePlan;
        const action = button.dataset.runtimeAction;
        activePlan = null;
        reloadOnClose = false;
        title.textContent = L("正在准备接入预览");
        message.textContent = L("GoalBoard 正在只读检查当前 Runtime 配置。");
        changes.innerHTML = "";
        backup.textContent = L("检查中");
        restart.textContent = L("检查中");
        confirmRow.hidden = true;
        confirmInput.checked = false;
        applyButton.disabled = true;
        applyButton.hidden = false;
        applyButton.textContent = L("确认应用");
        errorBox.hidden = true;
        dialog.showModal();
        try {
          const response = await fetch("/api/settings/runtimes/" + encodeURIComponent(runtimeId) + "/plan", {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify({ action }),
          });
          const plan = await response.json();
          if (!response.ok) throw new Error(plan.error || L("无法生成 Runtime 接入预览"));
          activePlan = plan;
          title.textContent = plan.display_name + (plan.action === "remove" ? L(" · 移除预览") : L(" · 接入预览"));
          message.textContent = plan.message;
          changes.innerHTML = (plan.changes || []).map((change) => "<li><strong>" + escapeText(change.operation === "remove" ? L("移除") : change.operation === "replace" ? L("替换") : L("新增")) + "</strong><div><p>" + escapeText(change.target_path) + "</p><small>" + escapeText(change.before) + " → " + escapeText(change.after) + "</small></div></li>").join("") || L("<li><strong>无变更</strong><div><p>当前状态无需写入。</p></div></li>");
          backup.textContent = plan.backup_path || L("当前变更无须备份");
          restart.textContent = (plan.restart_instructions || []).join(" ") || L("无须重启");
          confirmRow.hidden = plan.status !== "ready";
          confirmLabel.textContent = plan.confirmation;
          applyButton.hidden = plan.status !== "ready";
        } catch (error) {
          errorBox.textContent = error.message || L("无法生成 Runtime 接入预览");
          errorBox.hidden = false;
          message.textContent = L("没有修改任何配置。");
        }
      });
    });
    applyButton?.addEventListener("click", async () => {
      if (!activePlan || !confirmInput.checked) return;
      applyButton.disabled = true;
      applyButton.textContent = L("正在验证…");
      errorBox.hidden = true;
      try {
        const response = await fetch("/api/settings/runtimes/" + encodeURIComponent(activePlan.runtime_id) + "/confirm", {
          method: "POST",
          headers: goalboardControlHeaders(),
          body: JSON.stringify({ plan_id: activePlan.plan_id, decision: "confirmed" }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || result.error || L("Runtime 接入未完成"));
        message.textContent = result.message;
        changes.innerHTML = L("<li><strong>完成</strong><div><p>") + escapeText(result.message) + "</p></div></li>";
        confirmRow.hidden = true;
        applyButton.hidden = true;
        reloadOnClose = true;
        showToast(result.message);
      } catch (error) {
        errorBox.textContent = error.message || L("Runtime 接入未完成");
        errorBox.hidden = false;
        applyButton.disabled = false;
        applyButton.textContent = L("重新确认");
      }
    });
    const createForm = document.querySelector("[data-project-create]");
    createForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = new FormData(createForm);
      const error = createForm.querySelector(".settings-form-error");
      if (values.get("user_confirmed") !== "on") {
        error.textContent = L("请先确认创建这个项目。");
        error.hidden = false;
        return;
      }
      const submit = createForm.querySelector("button[type=submit]");
      submit.disabled = true;
      error.hidden = true;
      try {
        const response = await fetch("/api/settings/projects", { method: "POST", headers: goalboardControlHeaders(), body: JSON.stringify({ display_name: String(values.get("display_name") || "").trim(), user_confirmed: true }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || L("项目创建失败"));
        location.assign(result.project_path);
      } catch (caught) {
        error.textContent = caught.message || L("项目创建失败");
        error.hidden = false;
        submit.disabled = false;
      }
    });
    document.querySelectorAll("[data-project-rename]").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const values = new FormData(form);
        const error = form.querySelector(".settings-form-error");
        const submit = form.querySelector("button[type=submit]");
        submit.disabled = true;
        error.hidden = true;
        try {
          const response = await fetch("/api/settings/projects/" + encodeURIComponent(form.dataset.projectRename) + "/rename", { method: "POST", headers: goalboardControlHeaders(), body: JSON.stringify({ display_name: String(values.get("display_name") || "").trim() }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("项目改名失败"));
          showToast(L("项目已改名为“") + result.project.display_name + "”");
          setTimeout(() => location.reload(), 450);
        } catch (caught) {
          error.textContent = caught.message || L("项目改名失败");
          error.hidden = false;
          submit.disabled = false;
        }
      });
    });
    document.querySelectorAll("[data-connection-rebind]").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const values = new FormData(form);
        const error = form.querySelector(".settings-form-error");
        const submit = form.querySelector("button[type=submit]");
        if (values.get("user_confirmed") !== "on") {
          error.textContent = L("请先确认要切换这个 Session 的项目关联。");
          error.hidden = false;
          return;
        }
        submit.disabled = true;
        error.hidden = true;
        try {
          const response = await fetch("/api/settings/connections/" + encodeURIComponent(form.dataset.connectionRebind) + "/rebind", { method: "POST", headers: goalboardControlHeaders(), body: JSON.stringify({ project_id: String(values.get("project_id") || ""), user_confirmed: true }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("Session 项目切换失败"));
          showToast(L("Session 已切换到“") + result.connection.project_name + "”");
          setTimeout(() => location.reload(), 450);
        } catch (caught) {
          error.textContent = caught.message || L("Session 项目切换失败");
          error.hidden = false;
          submit.disabled = false;
        }
      });
    });
    document.querySelectorAll("[data-connection-unbind]").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const values = new FormData(form);
        const error = form.querySelector(".settings-form-error");
        const submit = form.querySelector("button[type=submit]");
        if (values.get("user_confirmed") !== "on") {
          error.textContent = L("请先确认只解绑这个 Session。");
          error.hidden = false;
          return;
        }
        submit.disabled = true;
        error.hidden = true;
        try {
          const response = await fetch("/api/settings/connections/" + encodeURIComponent(form.dataset.connectionUnbind) + "/unbind", { method: "POST", headers: goalboardControlHeaders(), body: JSON.stringify({ user_confirmed: true }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("Session 解绑失败"));
          showToast(L("Session 已解绑；项目和其他关联保持不变"));
          setTimeout(() => location.reload(), 450);
        } catch (caught) {
          error.textContent = caught.message || L("Session 解绑失败");
          error.hidden = false;
          submit.disabled = false;
        }
      });
    });
    document.querySelectorAll("[data-workspace-default]").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const values = new FormData(form);
        const error = form.querySelector(".settings-form-error");
        const submit = form.querySelector("button[type=submit]");
        if (values.get("user_confirmed") !== "on") {
          error.textContent = L("请先确认更改这个目录的默认项目。");
          error.hidden = false;
          return;
        }
        submit.disabled = true;
        error.hidden = true;
        try {
          const response = await fetch("/api/settings/workspaces/" + encodeURIComponent(form.dataset.workspaceDefault) + "/default", { method: "POST", headers: goalboardControlHeaders(), body: JSON.stringify({ project_id: String(values.get("project_id") || ""), user_confirmed: true }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("目录默认项目更新失败"));
          showToast(L("目录默认项目已更新"));
          setTimeout(() => location.reload(), 450);
        } catch (caught) {
          error.textContent = caught.message || L("目录默认项目更新失败");
          error.hidden = false;
          submit.disabled = false;
        }
      });
    });
    document.querySelectorAll("[data-workspace-unlink]").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const values = new FormData(form);
        const error = form.querySelector(".settings-form-error");
        const submit = form.querySelector("button[type=submit]");
        if (values.get("user_confirmed") !== "on") {
          error.textContent = L("请先确认解除这个目录关联。");
          error.hidden = false;
          return;
        }
        submit.disabled = true;
        error.hidden = true;
        try {
          const response = await fetch("/api/settings/workspaces/" + encodeURIComponent(form.dataset.workspaceUnlink) + "/projects/" + encodeURIComponent(form.dataset.workspaceProject) + "/unlink", { method: "POST", headers: goalboardControlHeaders(), body: JSON.stringify({ user_confirmed: true }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("目录关联解除失败"));
          showToast(L("目录关联已解除；GoalBoard 项目仍然保留"));
          setTimeout(() => location.reload(), 450);
        } catch (caught) {
          error.textContent = caught.message || L("目录关联解除失败");
          error.hidden = false;
          submit.disabled = false;
        }
      });
    });
    document.querySelectorAll("[data-demo-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const action = button.dataset.demoAction;
        const error = button.closest("section, details")?.querySelector("[data-demo-error]") || document.querySelector("[data-demo-error]");
        const message = action === "create"
          ? L("创建一份明确标记为可重建数据的示例项目？")
          : action === "reset"
            ? L("重建 demo 会清除其中的所有改动，但不会影响用户项目。确认继续？")
            : L("删除这个可重建 demo？用户项目不会被删除。");
        if (!window.confirm(message)) return;
        button.disabled = true;
        if (error) error.hidden = true;
        try {
          const response = await fetch("/api/settings/demo", { method: "POST", headers: goalboardControlHeaders(), body: JSON.stringify({ action, user_confirmed: true }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("demo 操作失败"));
          showToast(result.message || L("demo 已更新"));
          setTimeout(() => location.reload(), 450);
        } catch (caught) {
          if (error) { error.textContent = caught.message || L("demo 操作失败"); error.hidden = false; }
          button.disabled = false;
        }
      });
    });
    document.querySelectorAll("[data-web-service-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const error = document.querySelector("[data-web-service-error]");
        button.disabled = true;
        if (error) error.hidden = true;
        try {
          const previewResponse = await fetch("/api/settings/web-service/plan", { method: "POST", headers: goalboardControlHeaders(), body: JSON.stringify({ action: button.dataset.webServiceAction }) });
          const plan = await previewResponse.json();
          if (!previewResponse.ok) throw new Error(plan.error || L("无法生成常驻服务预览"));
          if (plan.status === "no_change") {
            showToast(plan.message);
            button.disabled = false;
            return;
          }
          if (plan.status !== "ready") throw new Error(plan.message || L("当前不能执行这项常驻服务操作"));
          const changes = (plan.changes || []).map((change) => "• " + change.operation + "：" + change.target).join("\\n");
          if (!window.confirm(plan.message + "\\n\\n" + changes + "\\n\\n" + plan.confirmation)) {
            await fetch("/api/settings/web-service/confirm", { method: "POST", headers: goalboardControlHeaders(), body: JSON.stringify({ plan_id: plan.plan_id, decision: "declined" }) });
            button.disabled = false;
            return;
          }
          const confirmResponse = await fetch("/api/settings/web-service/confirm", { method: "POST", headers: goalboardControlHeaders(), body: JSON.stringify({ plan_id: plan.plan_id, decision: "confirmed" }) });
          const result = await confirmResponse.json();
          if (!confirmResponse.ok) throw new Error(result.error || L("常驻服务操作失败"));
          showToast(result.message);
          setTimeout(() => location.reload(), 450);
        } catch (caught) {
          if (error) {
            error.textContent = caught.message || L("常驻服务操作失败");
            error.hidden = false;
          }
          button.disabled = false;
        }
      });
    });
    function escapeText(value) {
      return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => {
        if (character === "&") return "&amp;";
        if (character === "<") return "&lt;";
        if (character === ">") return "&gt;";
        if (character === '"') return "&quot;";
        return "&#039;";
      });
    }
  })();
`;

const CLIENT_SCRIPT = `
  (() => {
    let state = JSON.parse(document.querySelector("#goalboard-data").textContent);
    const workspace = document.querySelector("[data-workspace]");
    const documentPane = document.querySelector("[data-document-pane]");
    const treePane = document.querySelector("#goal-tree-pane");
    const treeResizer = document.querySelector("[data-tree-resizer]");
    const tuiResizer = document.querySelector("[data-tui-resizer]");
    const tuiPane = document.querySelector("[data-tui-pane]");
    const treeScroll = document.querySelector("[data-tree-scroll]");
    const globalSearch = document.querySelector("[data-global-search]");
    const treeSearch = globalSearch;
    const treeFilter = document.querySelector("[data-tree-filter]");
    const treeFilterTrigger = document.querySelector("[data-tree-filter-trigger]");
    const dialog = document.querySelector("[data-create-dialog]");
    const form = document.querySelector("[data-create-form]");
    const formError = document.querySelector("[data-create-error]");
    const trashDialog = document.querySelector("[data-goal-trash-dialog]");
    const trashForm = document.querySelector("[data-goal-trash-form]");
    const trashError = document.querySelector("[data-goal-trash-error]");
    const trashSubmit = document.querySelector("[data-goal-trash-submit]");
    const toast = document.querySelector("[data-toast]");
    const syncState = document.querySelector("[data-sync-state]");
    const archiveView = document.body.dataset.boardView === "archive";
    const trashView = document.body.dataset.boardView === "trash";
    const decisionView = document.body.dataset.boardView === "decisions";
    const collectionView = archiveView || trashView;
    const documentCollection = trashView ? "trash" : archiveView ? "archive" : "current";
    const routePrefix = document.body.dataset.routePrefix || "";
    const route = (pathname) => routePrefix + pathname;
    const localPathname = () => routePrefix && location.pathname.startsWith(routePrefix)
      ? location.pathname.slice(routePrefix.length) || "/"
      : location.pathname;
    const visibleGoals = (source = state) => trashView ? source.trashed_goals : archiveView ? source.archived_goals : source.goals;
    const storageKey = "goalboard-ui:" + (state.project?.project_id || state.snapshot.board.board_id);
    let selected = decisionView ? "" : document.querySelector("[data-goal-view]:not([hidden])")?.dataset.goalView || (collectionView ? visibleGoals()[0]?.goal.goal_id : state.active_goal_id || visibleGoals()[0]?.goal.goal_id) || "";
    let trashIntent = null;
    let toastTimer;
    let syncing = false;
    let saveTimer;
    let resizeStartX = 0;
    let resizeStartWidth = 0;
    let selectedStatuses = new Set();
    let goalDocumentRequest = 0;
    let searchBusyUntil = 0;
    let searchComposing = false;
    let deferredRefreshTimer;

    const updateRelationPreviews = () => {
      if (!form) return;
      const parent = form.elements.parent_goal_id?.selectedOptions?.[0];
      const parentPreview = form.querySelector("[data-parent-preview]");
      if (parentPreview) {
        parentPreview.textContent = parent?.value
          ? "关系预览：新 Goal → 属于 → 「" + (parent.dataset.goalName || parent.textContent) + "」。这是目录层级，不需要等待它完成。"
          : "关系预览：新 Goal 将作为独立 Goal 出现在 Tree 中。";
      }
      const dependencies = [...form.querySelectorAll('[name="dependency_goal_ids"]:checked')];
      const dependencyPreview = form.querySelector("[data-dependency-preview]");
      if (dependencyPreview) {
        const names = dependencies.map((input) => "「" + (input.dataset.goalName || input.value) + "」");
        dependencyPreview.textContent = names.length
          ? "关系预览：新 Goal → 依赖 → " + names.join(currentLocale() === "en" ? ", " : "、") + "；这些 Goal 完成前不能领取或完成新 Goal。"
          : "关系预览：当前没有执行前置，Goal 可以独立推进。";
      }
    };

    const updateRelationFormPreview = (relationForm) => {
      if (!relationForm) return;
      const preview = relationForm.querySelector("[data-relation-live-preview]");
      const type = relationForm.elements.type?.selectedOptions?.[0];
      const target = relationForm.elements.target_goal_id?.selectedOptions?.[0];
      const direction = relationForm.elements.direction?.value || "outgoing";
      if (!preview || !type || !target) return;
      const currentName = relationForm.dataset.currentGoalName || relationForm.dataset.goalId;
      const targetName = target.dataset.goalName || target.textContent;
      const left = direction === "outgoing" ? currentName : targetName;
      const right = direction === "outgoing" ? targetName : currentName;
      const label = type.dataset.outLabel || type.textContent;
      preview.querySelector("strong").textContent = left + " → " + label + " → " + right;
      preview.querySelector("p").textContent = type.dataset.description || "关系方向和原因会进入事件历史";
    };

    const updateAllRelationFormPreviews = () => {
      document.querySelectorAll("[data-relation-form]").forEach(updateRelationFormPreview);
    };

    const renumberCriteria = (list) => {
      [...list.querySelectorAll("[data-criterion-row]")].forEach((row, index) => {
        const label = row.querySelector("[data-criterion-number]");
        if (label) label.textContent = "验收条件 " + (index + 1);
      });
    };

    const splitLines = (value) => [...new Set(String(value || "")
      .split("\\n")
      .map((item) => item.trim())
      .filter(Boolean))];

    const readRiskPayload = (values) => ({
      goal_ids: values.getAll("goal_ids").map(String),
      description: String(values.get("description") || "").trim(),
      probability: String(values.get("probability") || "").trim(),
      impact: String(values.get("impact") || "").trim(),
      affected_surfaces: splitLines(values.get("affected_surfaces")),
      trigger: String(values.get("trigger") || "").trim(),
      treatment: values.get("treatment"),
      blocking_mode: values.get("blocking_mode"),
      revisit_condition: String(values.get("revisit_condition") || "").trim(),
      owner: String(values.get("owner") || "").trim(),
      reason: String(values.get("reason") || "").trim(),
    });

    const readImpactPayload = (values) => ({
      goal_id: String(values.get("goal_id") || "").trim(),
      surface: String(values.get("surface") || "").trim(),
      access: values.get("access"),
      input_snapshot: String(values.get("input_snapshot") || "").trim(),
      state: values.get("state"),
      reason: String(values.get("reason") || "").trim(),
      audit_reason: String(values.get("audit_reason") || "").trim(),
    });

    const riskStateEffect = (blockingMode, riskState) => {
      const active = riskState === "open" || riskState === "triggered";
      if (!active) {
        return blockingMode === "invalidate_on_trigger"
          ? "当前不再使 Goal 失效；若此前触发，关联 Goal 必须重新验证。"
          : "当前状态不再施加领取或完成门禁。";
      }
      if (blockingMode === "claim") return "当前会阻止所有关联 Goal 被新的 Runtime 领取。";
      if (blockingMode === "completion") return "当前会阻止所有关联 Goal 被标记为完成。";
      if (blockingMode === "invalidate_on_trigger") {
        return riskState === "triggered"
          ? "Risk 已触发，所有关联 Goal 立即失效。"
          : "Risk 目前开放；一旦标记为已触发，所有关联 Goal 会失效。";
      }
      return "这是一条持续观察的事实，不直接阻塞领取或完成。";
    };

    const updateRiskStatePreview = (riskForm) => {
      const preview = riskForm?.querySelector("[data-risk-state-preview]");
      const stateSelect = riskForm?.querySelector("[data-risk-state-select]");
      if (preview && stateSelect) {
        preview.textContent = riskStateEffect(riskForm.dataset.riskBlocking, stateSelect.value);
      }
    };

    const updateRiskGoalCount = (picker) => {
      const count = picker?.querySelectorAll('[name="goal_ids"]:checked').length || 0;
      const summary = picker?.querySelector("summary small");
      if (summary) summary.textContent = count + " 个已选择 · 至少选择一个";
    };

    const parseCriterionTarget = (value) => {
      const text = String(value || "").trim();
      if (!text) return null;
      try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed
          : { value: parsed };
      } catch {
        return { value: text };
      }
    };

    const readCreateDraft = () => {
      if (!form) return null;
      const values = {};
      [...form.elements].forEach((control) => {
        if (!control.name) return;
        if (control.type === "checkbox") {
          values[control.name] ||= [];
          if (control.checked) values[control.name].push(control.value);
          return;
        }
        values[control.name] = control.value;
      });
      const active = document.activeElement;
      return {
        values,
        focus: active && form.contains(active) && active.name
          ? { name: active.name, value: active.value, start: active.selectionStart, end: active.selectionEnd }
          : null,
      };
    };

    const applyCreateDraft = (draft) => {
      if (!form || !draft) return;
      [...form.elements].forEach((control) => {
        if (!control.name || !(control.name in draft.values)) return;
        if (control.type === "checkbox") {
          control.checked = draft.values[control.name].includes(control.value);
          return;
        }
        control.value = draft.values[control.name];
      });
      updateRelationPreviews();
      if (!draft.focus) return;
      const focused = [...form.elements].find((control) =>
        control.name === draft.focus.name &&
        (control.type !== "checkbox" || control.value === draft.focus.value)
      );
      if (!focused) return;
      focused.focus({ preventScroll: true });
      if (typeof focused.setSelectionRange === "function" && draft.focus.start != null) {
        focused.setSelectionRange(draft.focus.start, draft.focus.end);
      }
    };

    const showToast = (message, error = false) => {
      toast.textContent = message;
      toast.classList.toggle("is-error", error);
      toast.classList.add("is-visible");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
    };

    const goalPageBase = () => route(trashView ? "/trash/goals/" : archiveView ? "/archive/goals/" : "/goals/");

    const openGoalTrashDialog = (trigger, trashed) => {
      if (!trashDialog || !trashForm) return;
      const goalId = String(trigger.dataset.goalId || "").trim();
      const goalTitle = String(trigger.dataset.goalTitle || goalId).trim();
      if (!goalId) return;
      trashIntent = { goalId, goalTitle, trashed };
      trashError.hidden = true;
      trashError.textContent = "";
      trashForm.elements.reason.value = "";
      trashDialog.querySelector("[data-goal-trash-title]").textContent = trashed ? "移入回收站" : "恢复 Goal";
      trashDialog.querySelector("[data-goal-trash-description]").textContent = trashed
        ? "请确认这条 Goal 和本次操作原因。"
        : "请确认把这条 Goal 恢复到日常 Goal Tree。";
      trashDialog.querySelector("[data-goal-trash-target-title]").textContent = goalTitle;
      trashDialog.querySelector("[data-goal-trash-target-id]").textContent = goalId;
      trashDialog.querySelector("[data-goal-trash-note]").textContent = trashed
        ? "该操作可恢复：Goal 历史会保留，当前仍生效的关联关系会暂时停止。若还有有效 Claim 或执行中的 Run，系统不会改动 Goal，而会告诉你先结束哪项工作。"
        : "恢复不会创建新 Goal，也不会自动启动 Runtime。系统只会恢复两端都不在回收站的关联关系；其余关系会保留为待处理事实。";
      trashDialog.querySelector("[data-goal-trash-reason-label]").textContent = trashed ? "移入原因" : "恢复原因";
      trashForm.elements.reason.placeholder = trashed
        ? "说明为什么暂时不再保留这条 Goal"
        : "说明为什么现在要恢复这条 Goal";
      trashSubmit.classList.toggle("button-danger", trashed);
      trashSubmit.classList.toggle("button-primary", !trashed);
      trashSubmit.textContent = trashed ? "移入回收站" : "恢复到 Goal Tree";
      trashDialog.showModal();
      if (!matchMedia("(max-width: 760px)").matches) {
        requestAnimationFrame(() => trashForm.elements.reason.focus());
      }
    };

    const closeGoalTrashDialog = () => {
      if (!trashDialog?.open) return;
      trashDialog.close();
      trashIntent = null;
      refreshBoard();
    };

    const describeTrashBlock = (result) => {
      const claims = Array.isArray(result.blocking_claim_ids) ? result.blocking_claim_ids : [];
      const runs = Array.isArray(result.blocking_run_ids) ? result.blocking_run_ids : [];
      const records = [
        claims.length ? "有效 Claim：" + claims.join(currentLocale() === "en" ? ", " : "、") : "",
        runs.length ? "执行中 Run：" + runs.join(currentLocale() === "en" ? ", " : "、") : "",
      ].filter(Boolean).join("；");
      return "现在无法移入回收站：这条 Goal 仍有正在进行的 Runtime 工作。" +
        (records ? records + "。" : "") +
        "请先结束或释放这些工作，再重新确认。";
    };

    const submitGoalTrashForm = async () => {
      if (!trashIntent || !trashForm || !trashError || !trashSubmit) return;
      const reason = String(new FormData(trashForm).get("reason") || "").trim();
      if (!reason) {
        trashError.textContent = "请说明本次操作原因。";
        trashError.hidden = false;
        trashForm.elements.reason.focus();
        return;
      }
      trashError.hidden = true;
      trashSubmit.disabled = true;
      let redirecting = false;
      try {
        const response = await fetch(route("/api/goals/" + encodeURIComponent(trashIntent.goalId) + "/trash"), {
          method: "POST",
          headers: goalboardControlHeaders(),
          body: JSON.stringify({
            trashed: trashIntent.trashed,
            reason,
            user_confirmed: true,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "操作失败");
        if (result.status === "blocked") {
          trashError.textContent = describeTrashBlock(result);
          trashError.hidden = false;
          return;
        }
        const expected = trashIntent.trashed
          ? ["trashed", "already_trashed"]
          : ["restored", "already_active"];
        if (!expected.includes(result.status)) throw new Error("GoalBoard 返回了无法识别的回收站状态");
        redirecting = true;
        trashDialog.close();
        sessionStorage.removeItem(storageKey);
        location.assign(route((trashIntent.trashed ? "/trash/goals/" : "/goals/") + encodeURIComponent(trashIntent.goalId)));
      } catch (error) {
        trashError.textContent = error.message || "操作失败，请检查后重试";
        trashError.hidden = false;
      } finally {
        if (!redirecting) trashSubmit.disabled = false;
      }
    };

    const setSyncState = (label, mode = "") => {
      syncState.textContent = label;
      syncState.classList.toggle("is-syncing", mode === "syncing");
      syncState.classList.toggle("is-offline", mode === "offline");
    };

    const setMobileView = (view) => {
      workspace.dataset.mobileView = view;
      document.querySelectorAll("[data-mobile-target]").forEach((button) => {
        const active = button.dataset.mobileTarget === view;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", String(active));
      });
    };

    const setTuiWidth = (value, persist = true) => {
      if (!tuiResizer || !workspace.classList.contains("is-desktop-tui")) return;
      const width = Math.round(Math.min(720, Math.max(280, Number(value) || 480)));
      workspace.style.setProperty("--tui-width", width + "px");
      tuiResizer.setAttribute("aria-valuenow", String(width));
      if (persist) queueSave();
    };

    const setTreeWidth = (value, persist = true) => {
      if (matchMedia("(max-width: 760px)").matches && !workspace.classList.contains("is-desktop-tui")) return;
      if (!treeResizer) return;
      const maximum = Math.min(520, Math.max(320, innerWidth * 0.48));
      const width = Math.round(Math.min(maximum, Math.max(260, Number(value) || 320)));
      workspace.style.setProperty("--tree-width", width + "px");
      treeResizer.setAttribute("aria-valuenow", String(width));
      if (persist) queueSave();
    };

    const readUiState = () => ({
      selected,
      collapsed: [...document.querySelectorAll("[data-tree-item].is-collapsed")].map((item) => item.dataset.goalId),
      disclosures: [...document.querySelectorAll("[data-persist-open][open]")].map((item) => item.dataset.persistOpen),
      treeTop: treeScroll.scrollTop,
      documentTop: documentPane.scrollTop,
      treeWidth: treePane.getBoundingClientRect().width,
      tuiWidth: workspace.classList.contains("is-tui-collapsed")
        ? parseFloat(workspace.style.getPropertyValue("--tui-width")) || undefined
        : tuiPane?.getBoundingClientRect().width,
      query: treeSearch.value,
      statuses: [...selectedStatuses],
      mobileView: workspace.dataset.mobileView || "tree",
    });

    const applyUiState = (ui) => {
      if (ui?.treeWidth) setTreeWidth(ui.treeWidth, false);
      if (ui?.tuiWidth) setTuiWidth(ui.tuiWidth, false);
      const collapsed = new Set(ui?.collapsed || []);
      document.querySelectorAll("[data-tree-item]").forEach((item) => {
        const isCollapsed = collapsed.has(item.dataset.goalId);
        item.classList.toggle("is-collapsed", isCollapsed);
        item.querySelector(":scope > .tree-row [data-tree-toggle]")?.setAttribute("aria-expanded", String(!isCollapsed));
      });
      const disclosures = new Set(ui?.disclosures || []);
      document.querySelectorAll("[data-persist-open]").forEach((item) => {
        item.open = disclosures.has(item.dataset.persistOpen);
      });
      treeSearch.value = ui?.query || "";
      setSelectedStatuses(ui?.statuses || []);
      filterTree(ui?.query || "");
      treeScroll.scrollTop = Number(ui?.treeTop || 0);
      documentPane.scrollTop = ui?.selected === selected ? Number(ui?.documentTop || 0) : 0;
      setMobileView(ui?.mobileView || "tree");
    };

    const saveUiState = () => {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(readUiState()));
      } catch {}
    };

    const queueSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveUiState, 120);
    };

    const expandAncestors = (node) => {
      let parent = node?.closest(".tree-item")?.parentElement?.closest(".tree-item");
      while (parent) {
        parent.classList.remove("is-collapsed");
        parent.querySelector(":scope > .tree-row [data-tree-toggle]")?.setAttribute("aria-expanded", "true");
        parent = parent.parentElement?.closest(".tree-item");
      }
    };

    const applySelection = (goalId, resetScroll) => {
      const item = visibleGoals().find((entry) => entry.goal.goal_id === goalId);
      if (!item) return false;
      selected = goalId;
      document.querySelector("[data-tui-pane]")?.setAttribute("data-goal-id", goalId);
      document.dispatchEvent(new CustomEvent("goalboard:goal-changed", { detail: { goalId } }));
      document.querySelectorAll(".tree-node[data-select-goal]").forEach((button) => {
        const active = button.dataset.selectGoal === goalId;
        button.classList.toggle("is-selected", active);
        button.setAttribute("aria-pressed", String(active));
        if (active) expandAncestors(button);
      });
      document.title = item.goal.title + " · GoalBoard";
      if (resetScroll) documentPane.scrollTop = 0;
      return true;
    };

    const replaceGoalDocument = (html) => {
      const template = document.createElement("template");
      template.innerHTML = String(html || "").trim();
      const nextView = template.content.querySelector("[data-goal-view]");
      if (!nextView) throw new Error("Goal 正文响应不完整");
      documentPane.replaceChildren(nextView);
      updateAllRelationFormPreviews();
      document.querySelectorAll("[data-risk-state-form]").forEach(updateRiskStatePreview);
      document.querySelectorAll(".risk-goal-picker").forEach(updateRiskGoalCount);
    };

    const loadGoalDocument = async (goalId) => {
      const requestId = ++goalDocumentRequest;
      documentPane.setAttribute("aria-busy", "true");
      setSyncState("载入 Goal…", "syncing");
      try {
        const response = await fetch(
          route("/api/goals/" + encodeURIComponent(goalId) + "/document?view=" + documentCollection),
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error("无法读取这条 Goal 正文");
        const html = await response.text();
        if (requestId !== goalDocumentRequest) return null;
        replaceGoalDocument(html);
        setSyncState("已同步");
        return true;
      } catch (error) {
        if (requestId !== goalDocumentRequest) return null;
        setSyncState("暂时离线", "offline");
        showToast(error.message || "无法读取这条 Goal 正文", true);
        return false;
      } finally {
        if (requestId === goalDocumentRequest) documentPane.removeAttribute("aria-busy");
      }
    };

    const selectGoal = async (goalId, updateHistory = true) => {
      if (decisionView) {
        location.assign(route("/goals/" + encodeURIComponent(goalId)));
        return;
      }
      const currentView = documentPane.querySelector("[data-goal-view]");
      if (goalId === selected && currentView?.dataset.goalView === goalId) {
        if (matchMedia("(max-width: 760px)").matches) setMobileView("document");
        return;
      }
      const fallbackGoalId = currentView?.dataset.goalView || selected;
      if (!applySelection(goalId, true)) return;
      const loaded = await loadGoalDocument(goalId);
      if (loaded == null) return;
      if (!loaded) {
        if (selected === goalId && fallbackGoalId) applySelection(fallbackGoalId, false);
        return;
      }
      if (updateHistory) {
        history.pushState({ goalId }, "", goalPageBase() + encodeURIComponent(goalId));
      }
      if (matchMedia("(max-width: 760px)").matches) setMobileView("document");
      saveUiState();
    };

    function setSelectedStatuses(values) {
      const available = new Set([...document.querySelectorAll("[data-status-filter]")].map((input) => input.value));
      selectedStatuses = new Set((Array.isArray(values) ? values : []).filter((status) => available.has(status)));
      document.querySelectorAll("[data-status-filter]").forEach((input) => {
        input.checked = selectedStatuses.has(input.value);
      });
      const selectedCount = selectedStatuses.size;
      const summary = treeFilter?.querySelector("[data-tree-filter-summary]");
      const clear = treeFilter?.querySelector("[data-clear-status-filter]");
      if (summary) summary.textContent = selectedCount ? "已选择 " + selectedCount + " 种状态" : "显示全部状态";
      if (clear) clear.disabled = selectedCount === 0;
      treeFilterTrigger?.classList.toggle("is-active", selectedCount > 0);
      treeFilterTrigger?.setAttribute("aria-label", selectedCount ? "筛选目标，已选择 " + selectedCount + " 种状态" : "筛选目标");
    }

    function setTreeFilterOpen(open, focusFirst = false) {
      if (!treeFilter || !treeFilterTrigger) return;
      treeFilter.hidden = !open;
      treeFilterTrigger.setAttribute("aria-expanded", String(open));
      if (open && focusFirst) {
        requestAnimationFrame(() => {
          if (treeFilter.hidden) return;
          const firstStatusFilter = treeFilter.querySelector("[data-status-filter]");
          if (firstStatusFilter instanceof HTMLElement) firstStatusFilter.focus({ preventScroll: true });
        });
      }
    }

    function filterTree(value) {
      const query = value.trim().toLowerCase();
      const items = [...document.querySelectorAll("[data-tree-item]")];
      const matched = items.filter((item) => {
        const matchesQuery = !query || String(item.dataset.goalSearch || "").includes(query);
        const matchesStatus = selectedStatuses.size === 0 || selectedStatuses.has(item.dataset.goalStatus);
        item.hidden = !(matchesQuery && matchesStatus);
        return !item.hidden;
      });
      if (query || selectedStatuses.size) {
        matched.forEach((item) => {
          let parent = item.parentElement?.closest("[data-tree-item]");
          while (parent) {
            parent.hidden = false;
            parent.classList.remove("is-collapsed");
            parent = parent.parentElement?.closest("[data-tree-item]");
          }
        });
      }
      const count = document.querySelector("[data-tree-filter-count]");
      const empty = treeScroll.querySelector("[data-tree-filter-empty]");
      const suffix = count?.dataset.treeSuffix || "";
      if (count) {
        const suffixText = suffix ? suffix + " " : "";
        count.textContent = !query && selectedStatuses.size === 0
          ? L("共 {count} 个{suffix}目标", { count: items.length, suffix: suffixText })
          : L("显示 {shown} / {total} 个{suffix}目标", { shown: matched.length, total: items.length, suffix: suffixText });
      }
      if (empty) empty.hidden = matched.length > 0 || items.length === 0;
    }

    const searchInteractionActive = () => searchComposing || Date.now() < searchBusyUntil;

    const scheduleDeferredRefresh = () => {
      clearTimeout(deferredRefreshTimer);
      const wait = Math.max(80, searchBusyUntil - Date.now() + 40);
      deferredRefreshTimer = setTimeout(() => refreshBoard(), wait);
    };

    const noteSearchActivity = (delay = 900) => {
      searchBusyUntil = Math.max(searchBusyUntil, Date.now() + delay);
      scheduleDeferredRefresh();
    };

    const refreshBoard = async (force = false) => {
      if (syncing || document.hidden) return;
      if (!force && searchInteractionActive()) {
        setSyncState("搜索中");
        scheduleDeferredRefresh();
        return;
      }
      if (!force && document.activeElement?.closest?.("[data-live-form]")) {
        setSyncState("编辑中");
        return;
      }
      syncing = true;
      try {
        const cursorResponse = await fetch(route("/api/board/cursor"), { cache: "no-store" });
        if (!cursorResponse.ok) throw new Error("无法读取 GoalBoard 游标");
        const cursorState = await cursorResponse.json();
        if (Number(cursorState.observed_event_cursor) === Number(state.snapshot.cursor)) {
          setSyncState("已同步");
          return;
        }
        if (!force && searchInteractionActive()) {
          setSyncState("搜索中");
          scheduleDeferredRefresh();
          return;
        }
        setSyncState("同步中", "syncing");
        const ui = readUiState();
        const pageBase = goalPageBase();
        const collectionPath = trashView ? "/trash" : archiveView ? "/archive" : "/";
        const pagePath = decisionView
          ? route("/decisions")
          : selected
            ? pageBase + encodeURIComponent(selected)
            : route(collectionPath);
        let pageResponse = await fetch(pagePath, { cache: "no-store" });
        if (!pageResponse.ok && !decisionView) {
          pageResponse = await fetch(route(collectionPath), { cache: "no-store" });
        }
        if (!pageResponse.ok) throw new Error("无法更新 Goal 页面");
        const parsed = new DOMParser().parseFromString(await pageResponse.text(), "text/html");
        if (parsed.body.dataset.boardView !== document.body.dataset.boardView) {
          location.reload();
          return;
        }
        const nextStateNode = parsed.querySelector("#goalboard-data");
        if (!nextStateNode) throw new Error("页面状态不完整");
        const nextState = JSON.parse(nextStateNode.textContent);
        const nextGoals = visibleGoals(nextState);
        const renderedGoalId = parsed.querySelector("[data-goal-view]")?.dataset.goalView || "";
        const goalStillExists = nextGoals.some((item) => item.goal.goal_id === selected);
        const nextSelected = decisionView
          ? ""
          : renderedGoalId || (goalStillExists ? selected : nextState.active_goal_id || nextGoals[0]?.goal.goal_id || "");
        const nextTree = parsed.querySelector("[data-tree-scroll]");
        const nextDocument = parsed.querySelector("[data-document-pane]");
        const nextFooter = parsed.querySelector("[data-tree-footer]");
        const nextFilter = parsed.querySelector("[data-tree-filter]");
        const nextCount = parsed.querySelector("[data-tree-count]");
        const nextDialog = parsed.querySelector("[data-create-dialog]");
        const nextDecisionsLink = parsed.querySelector("[data-decisions-link]");
        const nextArchiveLink = parsed.querySelector("[data-archive-link]");
        const nextTrashLink = parsed.querySelector("[data-trash-link]");
        if (!nextTree || !nextDocument || !nextFooter) throw new Error("页面数据不完整");
        if (!force && searchInteractionActive()) {
          setSyncState("搜索中");
          scheduleDeferredRefresh();
          return;
        }
        const createDraft = dialog.open ? readCreateDraft() : null;
        documentPane.classList.add("is-syncing");
        treeScroll.innerHTML = nextTree.innerHTML;
        documentPane.replaceChildren(...nextDocument.childNodes);
        if (nextFilter && treeFilter) treeFilter.innerHTML = nextFilter.innerHTML;
        document.querySelector("[data-tree-footer]").innerHTML = nextFooter.innerHTML;
        if (nextCount) document.querySelector("[data-tree-count]").textContent = nextCount.textContent;
        const replaceNavLink = (current, next) => {
          if (!current || !next) return;
          current.innerHTML = next.innerHTML;
          current.className = next.className;
          for (const name of ["href", "aria-label", "aria-current", "title"]) {
            const value = next.getAttribute(name);
            if (value == null) current.removeAttribute(name);
            else current.setAttribute(name, value);
          }
        };
        replaceNavLink(document.querySelector("[data-decisions-link]"), nextDecisionsLink);
        replaceNavLink(document.querySelector("[data-archive-link]"), nextArchiveLink);
        replaceNavLink(document.querySelector("[data-trash-link]"), nextTrashLink);
        if (nextDialog) {
          form.elements.parent_goal_id.innerHTML = nextDialog.querySelector('[name="parent_goal_id"]').innerHTML;
          form.querySelector(".goal-choice-list").innerHTML = nextDialog.querySelector(".goal-choice-list").innerHTML;
          applyCreateDraft(createDraft);
        }
        state = nextState;
        document.querySelector("#goalboard-data").textContent = JSON.stringify(nextState).replaceAll("<", "\\u003c");
        selected = nextSelected;
        if (!decisionView && selected) applySelection(selected, false);
        applyUiState(ui);
        updateAllRelationFormPreviews();
        requestAnimationFrame(() => documentPane.classList.remove("is-syncing"));
        setSyncState("刚刚更新");
      } catch {
        setSyncState("暂时离线", "offline");
      } finally {
        syncing = false;
      }
    };

    const submitDecisionForm = async (decisionForm, endpoint, decision, successMessage) => {
      const buttons = [...decisionForm.querySelectorAll('button[type="submit"]')];
      const errorBox = decisionForm.querySelector("[data-decision-error]");
      const reason = String(new FormData(decisionForm).get("reason") || "").trim();
      buttons.forEach((button) => { button.disabled = true; });
      errorBox.hidden = true;
      try {
        const response = await fetch(route(endpoint), {
          method: "POST",
          headers: goalboardControlHeaders(),
          body: JSON.stringify({ decision, reason }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "决定提交失败");
        await refreshBoard(true);
        showToast(successMessage);
      } catch (error) {
        errorBox.textContent = error.message || "决定提交失败，请检查输入";
        errorBox.hidden = false;
        buttons.forEach((button) => { button.disabled = false; });
      }
    };

    treeSearch?.addEventListener("input", () => {
      noteSearchActivity();
      filterTree(treeSearch.value);
      queueSave();
    });
    treeSearch?.addEventListener("focus", () => noteSearchActivity(500));
    treeSearch?.addEventListener("keydown", () => noteSearchActivity());
    treeSearch?.addEventListener("compositionstart", () => {
      searchComposing = true;
      noteSearchActivity();
    });
    treeSearch?.addEventListener("compositionend", () => {
      searchComposing = false;
      noteSearchActivity(500);
    });
    treeScroll.addEventListener("keydown", (event) => {
      if (event.target !== treeScroll) return;
      const page = Math.max(38, treeScroll.clientHeight - 38);
      const next = {
        ArrowDown: treeScroll.scrollTop + 38,
        ArrowUp: treeScroll.scrollTop - 38,
        PageDown: treeScroll.scrollTop + page,
        PageUp: treeScroll.scrollTop - page,
        Home: 0,
        End: treeScroll.scrollHeight,
      }[event.key];
      if (next == null) return;
      event.preventDefault();
      treeScroll.scrollTop = next;
      queueSave();
    });
    treeScroll.addEventListener("scroll", queueSave, { passive: true });
    documentPane.addEventListener("scroll", queueSave, { passive: true });
    document.addEventListener("toggle", (event) => {
      if (event.target.matches?.("[data-persist-open]")) queueSave();
    }, true);
    document.addEventListener("change", (event) => {
      const changed = event.target instanceof Element ? event.target : null;
      if (!changed) return;
      const statusFilter = changed.closest("[data-status-filter]");
      if (statusFilter) {
        if (statusFilter.checked) selectedStatuses.add(statusFilter.value);
        else selectedStatuses.delete(statusFilter.value);
        setSelectedStatuses([...selectedStatuses]);
        filterTree(treeSearch.value);
        queueSave();
        return;
      }
      const relationForm = changed.closest("[data-relation-form]");
      if (relationForm) updateRelationFormPreview(relationForm);
      const riskStateForm = changed.closest("[data-risk-state-form]");
      if (riskStateForm) updateRiskStatePreview(riskStateForm);
      const riskGoalPicker = changed.closest(".risk-goal-picker");
      if (riskGoalPicker) updateRiskGoalCount(riskGoalPicker);
    });
    document.addEventListener("input", (event) => {
      const filter = event.target.closest?.("[data-risk-goal-filter]");
      if (!filter) return;
      const query = String(filter.value || "").trim().toLocaleLowerCase();
      filter.closest(".risk-goal-picker")?.querySelectorAll("[data-risk-goal-option]").forEach((option) => {
        option.hidden = Boolean(query) && !String(option.dataset.search || "").includes(query);
      });
    });
    treeResizer?.addEventListener("pointerdown", (event) => {
      if (matchMedia("(max-width: 760px)").matches && !workspace.classList.contains("is-desktop-tui")) return;
      resizeStartX = event.clientX;
      resizeStartWidth = treePane.getBoundingClientRect().width;
      treeResizer.classList.add("is-dragging");
      treeResizer.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    treeResizer?.addEventListener("pointermove", (event) => {
      if (!treeResizer.hasPointerCapture(event.pointerId)) return;
      setTreeWidth(resizeStartWidth + event.clientX - resizeStartX);
    });
    const finishTreeResize = (event) => {
      if (treeResizer?.hasPointerCapture(event.pointerId)) treeResizer.releasePointerCapture(event.pointerId);
      treeResizer?.classList.remove("is-dragging");
      saveUiState();
    };
    treeResizer?.addEventListener("pointerup", finishTreeResize);
    treeResizer?.addEventListener("pointercancel", finishTreeResize);
    treeResizer?.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      setTreeWidth(treePane.getBoundingClientRect().width + (event.key === "ArrowRight" ? 16 : -16));
    });
    if (tuiResizer && tuiPane) {
      tuiResizer.addEventListener("pointerdown", (event) => {
        resizeStartX = event.clientX;
        resizeStartWidth = tuiPane.getBoundingClientRect().width;
        tuiResizer.classList.add("is-dragging");
        tuiResizer.setPointerCapture(event.pointerId);
        event.preventDefault();
      });
      tuiResizer.addEventListener("pointermove", (event) => {
        if (!tuiResizer.hasPointerCapture(event.pointerId)) return;
        setTuiWidth(resizeStartWidth - (event.clientX - resizeStartX));
      });
      const finishTuiResize = (event) => {
        if (tuiResizer.hasPointerCapture(event.pointerId)) tuiResizer.releasePointerCapture(event.pointerId);
        tuiResizer.classList.remove("is-dragging");
        saveUiState();
      };
      tuiResizer.addEventListener("pointerup", finishTuiResize);
      tuiResizer.addEventListener("pointercancel", finishTuiResize);
      tuiResizer.addEventListener("dblclick", (event) => {
        event.preventDefault();
        document.dispatchEvent(new CustomEvent("goalboard:tui-collapse"));
      });
      tuiResizer.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        setTuiWidth(tuiPane.getBoundingClientRect().width + (event.key === "ArrowLeft" ? 16 : -16));
      });
    }

    treeFilterTrigger?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setTreeFilterOpen(treeFilter?.hidden !== false, true);
    });

    document.addEventListener("click", async (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
    if (!treeFilter?.hidden && !target.closest("[data-tree-filter], [data-tree-filter-trigger]")) setTreeFilterOpen(false);
      if (target.closest("[data-clear-status-filter]")) {
        setSelectedStatuses([]);
        filterTree(treeSearch.value);
        queueSave();
        return;
      }
      if (target.closest("[data-clear-tree-filter]")) {
        treeSearch.value = "";
        setSelectedStatuses([]);
        filterTree("");
        queueSave();
        return;
      }
      const treeToggle = target.closest("[data-tree-toggle]");
      if (treeToggle) {
        const item = treeToggle.closest("[data-tree-item]");
        const collapsed = item.classList.toggle("is-collapsed");
        treeToggle.setAttribute("aria-expanded", String(!collapsed));
        saveUiState();
        return;
      }
      const goalLink = target.closest("[data-select-goal]");
      if (goalLink) {
        selectGoal(goalLink.dataset.selectGoal);
        return;
      }
      if (target.closest("[data-open-create]")) {
        formError.hidden = true;
        dialog.showModal();
        updateRelationPreviews();
        requestAnimationFrame(() => form.elements.title.focus());
        return;
      }
      if (target.closest("[data-close-create]")) {
        dialog.close();
        refreshBoard();
        return;
      }
      const trashAction = target.closest("[data-open-goal-trash]");
      if (trashAction) {
        openGoalTrashDialog(trashAction, true);
        return;
      }
      const restoreAction = target.closest("[data-open-goal-restore]");
      if (restoreAction) {
        openGoalTrashDialog(restoreAction, false);
        return;
      }
      if (target.closest("[data-close-goal-trash]")) {
        closeGoalTrashDialog();
        return;
      }
      if (target.closest("[data-collapse-all]")) {
        const items = [...document.querySelectorAll("[data-tree-item]")];
        const shouldCollapse = items.some((item) => !item.classList.contains("is-collapsed"));
        items.forEach((item) => item.classList.toggle("is-collapsed", shouldCollapse));
        document.querySelectorAll("[data-tree-toggle]").forEach((button) => {
          button.setAttribute("aria-expanded", String(!shouldCollapse));
        });
        saveUiState();
        return;
      }
      const mobileTarget = target.closest("[data-mobile-target]");
      if (mobileTarget) {
        setMobileView(mobileTarget.dataset.mobileTarget);
        saveUiState();
        return;
      }
      const copy = target.closest("[data-copy-value]");
      if (copy) {
        try {
          await navigator.clipboard.writeText(copy.dataset.copyValue);
          showToast("引用已复制");
        } catch {
          showToast("无法访问剪贴板，请手动复制", true);
        }
        return;
      }
      const openRelationDeactivate = target.closest("[data-relation-deactivate-open]");
      if (openRelationDeactivate) {
        const record = openRelationDeactivate.closest("[data-relation-id]");
        const deactivateForm = record?.querySelector("[data-relation-deactivate-form]");
        if (!deactivateForm) return;
        deactivateForm.hidden = false;
        openRelationDeactivate.hidden = true;
        openRelationDeactivate.setAttribute("aria-expanded", "true");
        deactivateForm.querySelector("textarea")?.focus();
        return;
      }
      const cancelRelationDeactivate = target.closest("[data-relation-deactivate-cancel]");
      if (cancelRelationDeactivate) {
        const record = cancelRelationDeactivate.closest("[data-relation-id]");
        const deactivateForm = record?.querySelector("[data-relation-deactivate-form]");
        const openButton = record?.querySelector("[data-relation-deactivate-open]");
        if (deactivateForm) deactivateForm.hidden = true;
        if (openButton) {
          openButton.hidden = false;
          openButton.setAttribute("aria-expanded", "false");
          openButton.focus();
        }
        return;
      }
      const addCriterion = target.closest("[data-add-criterion]");
      if (addCriterion) {
        const editor = addCriterion.closest("[data-draft-editor]");
        const list = editor?.querySelector("[data-criteria-list]");
        const template = editor?.querySelector("[data-criterion-template]");
        if (list && template) {
          list.append(template.content.cloneNode(true));
          renumberCriteria(list);
          list.lastElementChild?.querySelector('[data-criterion-field="statement"]')?.focus();
        }
        return;
      }
      const removeCriterion = target.closest("[data-remove-criterion]");
      if (removeCriterion) {
        const row = removeCriterion.closest("[data-criterion-row]");
        const list = row?.parentElement;
        if (!row || !list) return;
        if (list.querySelectorAll("[data-criterion-row]").length === 1) {
          row.querySelectorAll("input, textarea").forEach((control) => { control.value = ""; });
          const method = row.querySelector('[data-criterion-field="decision_method"]');
          if (method) method.value = "inspection";
        } else {
          row.remove();
          renumberCriteria(list);
        }
        return;
      }
      const archiveAction = target.closest("[data-goal-archive]");
      const activeGoalAction = target.closest("[data-set-active-goal]");
      if (activeGoalAction) {
        activeGoalAction.disabled = true;
        const goalId = activeGoalAction.dataset.goalId;
        try {
          const response = await fetch(route("/api/goals/" + encodeURIComponent(goalId) + "/active"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify({ reason: "用户在 GoalBoard 设为当前 Goal" }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "无法设为当前 Goal");
          await refreshBoard(true);
          showToast("已设为当前 Goal；Runtime 的执行状态没有改变");
        } catch (error) {
          activeGoalAction.disabled = false;
          showToast(error.message || "无法设为当前 Goal", true);
        }
        return;
      }
      if (archiveAction) {
        archiveAction.disabled = true;
        const archived = archiveAction.dataset.goalArchive === "true";
        const goalId = archiveAction.dataset.goalId;
        try {
          const response = await fetch(route("/api/goals/" + encodeURIComponent(goalId) + "/archive"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify({
              archived,
              reason: archived ? "用户在 GoalBoard 手动归档已完成 Goal" : "用户在 GoalBoard 恢复归档 Goal",
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "操作失败");
          location.assign(route((archived ? "/archive/goals/" : "/goals/") + encodeURIComponent(goalId)));
        } catch (error) {
          archiveAction.disabled = false;
          showToast(error.message || "操作失败", true);
        }
        return;
      }
    });

    document.addEventListener("submit", async (event) => {
      const submittedForm = event.target;
      const goalTrashForm = submittedForm.closest?.("[data-goal-trash-form]");
      if (goalTrashForm) {
        event.preventDefault();
        await submitGoalTrashForm();
        return;
      }
      const contractDecisionForm = submittedForm.closest?.("[data-contract-decision-form]");
      if (contractDecisionForm) {
        event.preventDefault();
        const decision = event.submitter?.value;
        await submitDecisionForm(
          contractDecisionForm,
          "/api/contract-proposals/" + encodeURIComponent(contractDecisionForm.dataset.contractProposalId) + "/decision",
          decision,
          decision === "approved" ? "Contract 已确认，Goal 现在可进入执行" : "提案已退回，Draft 保持不变",
        );
        return;
      }

      const candidateDecisionForm = submittedForm.closest?.("[data-candidate-decision-form]");
      if (candidateDecisionForm) {
        event.preventDefault();
        const decision = event.submitter?.value;
        await submitDecisionForm(
          candidateDecisionForm,
          "/api/candidates/" + encodeURIComponent(candidateDecisionForm.dataset.candidateId) + "/decision",
          decision,
          decision === "approved" ? "Candidate 已纳入 Goal Tree，等待单独确认 Rewire" : "Candidate 已退回并保留你的意见",
        );
        return;
      }

      const rewireDecisionForm = submittedForm.closest?.("[data-rewire-decision-form]");
      if (rewireDecisionForm) {
        event.preventDefault();
        const decision = event.submitter?.value;
        await submitDecisionForm(
          rewireDecisionForm,
          "/api/rewires/" + encodeURIComponent(rewireDecisionForm.dataset.rewireId) + "/decision",
          decision,
          decision === "confirmed" ? "关系调整已确认" : "关系调整已拒绝，已有 Goal 保持不变",
        );
        return;
      }

      const relationForm = submittedForm.closest?.("[data-relation-form]");
      if (relationForm) {
        event.preventDefault();
        const submit = relationForm.querySelector('button[type="submit"]');
        const errorBox = relationForm.querySelector("[data-relation-error]");
        const values = new FormData(relationForm);
        submit.disabled = true;
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/goals/" + encodeURIComponent(relationForm.dataset.goalId) + "/relations"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify({
              direction: values.get("direction"),
              type: values.get("type"),
              target_goal_id: values.get("target_goal_id"),
              reason: String(values.get("reason") || "").trim(),
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "关系建立失败");
          await refreshBoard(true);
          showToast("Goal 关系已建立");
        } catch (error) {
          errorBox.textContent = error.message || "关系建立失败，请检查方向和原因";
          errorBox.hidden = false;
          submit.disabled = false;
        }
        return;
      }

      const relationDeactivateForm = submittedForm.closest?.("[data-relation-deactivate-form]");
      if (relationDeactivateForm) {
        event.preventDefault();
        const submit = relationDeactivateForm.querySelector('button[type="submit"]');
        const errorBox = relationDeactivateForm.querySelector("[data-relation-deactivate-error]");
        const reason = String(new FormData(relationDeactivateForm).get("reason") || "").trim();
        submit.disabled = true;
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/relations/" + encodeURIComponent(relationDeactivateForm.dataset.relationId) + "/deactivate"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify({ reason }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "关系解除失败");
          await refreshBoard(true);
          showToast("Goal 关系已解除，历史记录仍保留");
        } catch (error) {
          errorBox.textContent = error.message || "关系解除失败，请检查原因";
          errorBox.hidden = false;
          submit.disabled = false;
        }
        return;
      }

      const draftForm = submittedForm.closest?.("[data-draft-form]");
      if (draftForm) {
        event.preventDefault();
        const submit = draftForm.querySelector('button[type="submit"]');
        const errorBox = draftForm.querySelector("[data-draft-error]");
        const values = new FormData(draftForm);
        const acceptanceCriteria = [...draftForm.querySelectorAll("[data-criterion-row]")]
          .map((row) => {
            const read = (field) => String(row.querySelector('[data-criterion-field="' + field + '"]')?.value || "").trim();
            const statement = read("statement");
            const passCondition = read("pass_condition");
            if (!statement && !passCondition) return null;
            return {
              criterion_id: read("criterion_id") || undefined,
              statement,
              decision_method: read("decision_method") || "inspection",
              pass_condition: passCondition,
              target: parseCriterionTarget(read("target")),
              required_evidence: [...new Set(read("required_evidence").split(/[,，\\n]/).map((item) => item.trim()).filter(Boolean))],
            };
          })
          .filter(Boolean);
        submit.disabled = true;
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/goals/" + encodeURIComponent(draftForm.dataset.goalId) + "/draft"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify({
              title: String(values.get("title") || "").trim(),
              outcome: String(values.get("outcome") || "").trim(),
              why: String(values.get("why") || "").trim(),
              business_logic: String(values.get("business_logic") || "").trim(),
              in_scope: splitLines(values.get("in_scope")),
              out_of_scope: splitLines(values.get("out_of_scope")),
              constraints: splitLines(values.get("constraints")),
              required_inputs: splitLines(values.get("required_inputs")),
              promised_outputs: splitLines(values.get("promised_outputs")),
              decomposition_state: values.get("decomposition_state"),
              priority: Number(values.get("priority")),
              acceptance_criteria: acceptanceCriteria,
              reason: String(values.get("reason") || "").trim(),
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Draft 保存失败");
          await refreshBoard(true);
          showToast("Draft Contract 已保存");
        } catch (error) {
          errorBox.textContent = error.message || "Draft 保存失败，请检查输入";
          errorBox.hidden = false;
          submit.disabled = false;
        }
        return;
      }

      const riskCreateForm = submittedForm.closest?.("[data-risk-create-form]");
      if (riskCreateForm) {
        event.preventDefault();
        const submit = riskCreateForm.querySelector('button[type="submit"]');
        const errorBox = riskCreateForm.querySelector("[data-risk-error]");
        const values = new FormData(riskCreateForm);
        submit.disabled = true;
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/goals/" + encodeURIComponent(riskCreateForm.dataset.goalId) + "/risks"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify(readRiskPayload(values)),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Risk 登记失败");
          await refreshBoard(true);
          showToast("Risk 已登记");
        } catch (error) {
          errorBox.textContent = error.message || "Risk 登记失败，请检查输入";
          errorBox.hidden = false;
          submit.disabled = false;
        }
        return;
      }

      const riskEditForm = submittedForm.closest?.("[data-risk-edit-form]");
      if (riskEditForm) {
        event.preventDefault();
        const submit = riskEditForm.querySelector('button[type="submit"]');
        const errorBox = riskEditForm.querySelector("[data-risk-error]");
        const values = new FormData(riskEditForm);
        submit.disabled = true;
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/risks/" + encodeURIComponent(riskEditForm.dataset.riskId) + "/update"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify(readRiskPayload(values)),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Risk 更新失败");
          await refreshBoard(true);
          showToast("Risk 事实已更新");
        } catch (error) {
          errorBox.textContent = error.message || "Risk 更新失败，请检查输入";
          errorBox.hidden = false;
          submit.disabled = false;
        }
        return;
      }

      const riskStateForm = submittedForm.closest?.("[data-risk-state-form]");
      if (riskStateForm) {
        event.preventDefault();
        const submit = riskStateForm.querySelector('button[type="submit"]');
        const errorBox = riskStateForm.querySelector("[data-risk-error]");
        const values = new FormData(riskStateForm);
        submit.disabled = true;
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/risks/" + encodeURIComponent(riskStateForm.dataset.riskId) + "/state"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify({
              state: values.get("state"),
              reason: String(values.get("reason") || "").trim(),
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Risk 状态更新失败");
          await refreshBoard(true);
          showToast("Risk 状态已记录");
        } catch (error) {
          errorBox.textContent = error.message || "Risk 状态更新失败，请检查输入";
          errorBox.hidden = false;
          submit.disabled = false;
        }
        return;
      }

      const impactCreateForm = submittedForm.closest?.("[data-impact-create-form]");
      if (impactCreateForm) {
        event.preventDefault();
        const submit = impactCreateForm.querySelector('button[type="submit"]');
        const errorBox = impactCreateForm.querySelector("[data-impact-error]");
        const values = new FormData(impactCreateForm);
        submit.disabled = true;
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/goals/" + encodeURIComponent(impactCreateForm.dataset.goalId) + "/impacts"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify(readImpactPayload(values)),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Impact 登记失败");
          await refreshBoard(true);
          showToast("Impact 已登记");
        } catch (error) {
          errorBox.textContent = error.message || "Impact 登记失败，请检查输入";
          errorBox.hidden = false;
          submit.disabled = false;
        }
        return;
      }

      const impactEditForm = submittedForm.closest?.("[data-impact-edit-form]");
      if (impactEditForm) {
        event.preventDefault();
        const submit = impactEditForm.querySelector('button[type="submit"]');
        const errorBox = impactEditForm.querySelector("[data-impact-error]");
        const values = new FormData(impactEditForm);
        submit.disabled = true;
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/impacts/" + encodeURIComponent(impactEditForm.dataset.impactId) + "/update"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify(readImpactPayload(values)),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Impact 更新失败");
          await refreshBoard(true);
          showToast("Impact 已更新");
        } catch (error) {
          errorBox.textContent = error.message || "Impact 更新失败，请检查输入";
          errorBox.hidden = false;
          submit.disabled = false;
        }
        return;
      }

      const impactDeactivateForm = submittedForm.closest?.("[data-impact-deactivate-form]");
      if (impactDeactivateForm) {
        event.preventDefault();
        const submit = impactDeactivateForm.querySelector('button[type="submit"]');
        const errorBox = impactDeactivateForm.querySelector("[data-impact-error]");
        const values = new FormData(impactDeactivateForm);
        submit.disabled = true;
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/impacts/" + encodeURIComponent(impactDeactivateForm.dataset.impactId) + "/deactivate"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify({ reason: String(values.get("reason") || "").trim() }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Impact 停用失败");
          await refreshBoard(true);
          showToast("Impact 已停用并保留在历史中");
        } catch (error) {
          errorBox.textContent = error.message || "Impact 停用失败，请检查输入";
          errorBox.hidden = false;
          submit.disabled = false;
        }
        return;
      }

      const evidenceForm = submittedForm.closest?.("[data-evidence-form]");
      if (evidenceForm) {
        event.preventDefault();
        const submit = evidenceForm.querySelector('button[type="submit"]');
        const errorBox = evidenceForm.querySelector("[data-evidence-error]");
        const values = new FormData(evidenceForm);
        const criterionIds = [...new Set(values.getAll("criterion_ids").map(String).map((value) => value.trim()).filter(Boolean))];
        if (!criterionIds.length) {
          errorBox.textContent = "至少选择一条验收条件";
          errorBox.hidden = false;
          return;
        }
        submit.disabled = true;
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/goals/" + encodeURIComponent(evidenceForm.dataset.goalId) + "/evidence"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify({
              criterion_ids: criterionIds,
              kind: values.get("kind"),
              result: values.get("result"),
              locator: String(values.get("locator") || "").trim(),
              digest: String(values.get("digest") || "").trim(),
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Evidence 提交失败");
          await refreshBoard(true);
          showToast("人工 Evidence 已记录");
        } catch (error) {
          errorBox.textContent = error.message || "Evidence 提交失败，请检查输入";
          errorBox.hidden = false;
          submit.disabled = false;
        }
        return;
      }

      const policyForm = submittedForm.closest?.("[data-policy-form]");
      if (policyForm) {
        event.preventDefault();
        const submit = policyForm.querySelector('button[type="submit"]');
        const errorBox = policyForm.querySelector("[data-policy-error]");
        const values = new FormData(policyForm);
        submit.disabled = true;
        errorBox.hidden = true;
        const capabilities = String(values.get("required_capabilities") || "")
          .split(/[\\n,，]/)
          .map((item) => item.trim())
          .filter(Boolean);
        try {
          const response = await fetch(route("/api/policy-bindings"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify({
              scope: values.get("scope"),
              goal_id: values.get("goal_id") || undefined,
              reason: String(values.get("reason") || "").trim(),
              policy: {
                goal_mode: values.get("goal_mode"),
                self_verification: values.has("self_verification"),
                cross_reviewers: Number(values.get("cross_reviewers")),
                adversarial_reviewers: Number(values.get("adversarial_reviewers")),
                human_approval: values.has("human_approval"),
                required_capabilities: [...new Set(capabilities)],
                max_lease_seconds: Number(values.get("max_lease_seconds")),
              },
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Policy 保存失败");
          await refreshBoard(true);
          showToast(values.get("scope") === "goal" ? "当前 Goal 规则已保存" : "项目默认规则已保存");
        } catch (error) {
          errorBox.textContent = error.message || "Policy 保存失败，请检查输入";
          errorBox.hidden = false;
          submit.disabled = false;
        }
        return;
      }

      const reviewForm = submittedForm.closest?.("[data-human-review-form]");
      if (reviewForm) {
        event.preventDefault();
        const submit = reviewForm.querySelector('button[type="submit"]');
        const errorBox = reviewForm.querySelector("[data-review-error]");
        const values = new FormData(reviewForm);
        const extraRefs = String(values.get("evidence_refs_extra") || "")
          .split("\\n")
          .map((item) => item.trim())
          .filter(Boolean);
        const evidenceRefs = [...new Set([...values.getAll("evidence_refs").map(String), ...extraRefs])];
        submit.disabled = true;
        errorBox.hidden = true;
        try {
          const response = await fetch(
            route("/api/goals/" + encodeURIComponent(reviewForm.dataset.goalId) +
              "/review-obligations/" + encodeURIComponent(reviewForm.dataset.obligationId) +
              "/review"),
            {
              method: "POST",
              headers: goalboardControlHeaders(),
              body: JSON.stringify({
                verdict: values.get("verdict"),
                evidence_refs: evidenceRefs,
                reasoning: String(values.get("reasoning") || "").trim(),
              }),
            },
          );
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Review 提交失败");
          await refreshBoard(true);
          showToast("用户 Review 已记录");
        } catch (error) {
          errorBox.textContent = error.message || "Review 提交失败，请检查输入";
          errorBox.hidden = false;
          submit.disabled = false;
        }
      }
    });

    form?.addEventListener("change", updateRelationPreviews);

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      formError.hidden = true;
      const values = new FormData(form);
      const payload = {
        goal_id: String(values.get("goal_id") || "").trim() || undefined,
        title: String(values.get("title") || "").trim(),
        outcome: String(values.get("outcome") || "").trim(),
        why: String(values.get("why") || "").trim(),
        business_logic: String(values.get("business_logic") || "").trim(),
        priority: Number(values.get("priority") || 0),
        parent_goal_id: String(values.get("parent_goal_id") || "").trim() || undefined,
        dependency_goal_ids: values.getAll("dependency_goal_ids").map(String),
        acceptance_criteria: String(values.get("acceptance_criteria") || "").split("\\n").map((line) => line.trim()).filter(Boolean),
      };
      try {
        const response = await fetch(route("/api/goals"), {
          method: "POST",
          headers: goalboardControlHeaders(),
          body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "创建失败");
        sessionStorage.removeItem(storageKey);
        location.assign(result.goal_path);
      } catch (error) {
        formError.textContent = error.message || "创建失败，请检查输入后重试";
        formError.hidden = false;
        submit.disabled = false;
      }
    });

    addEventListener("popstate", () => {
      const match = localPathname().match(
        trashView ? /^\\/trash\\/goals\\/(.+)$/ : archiveView ? /^\\/archive\\/goals\\/(.+)$/ : /^\\/goals\\/(.+)$/,
      );
      if (match) void selectGoal(decodeURIComponent(match[1]), false);
    });
    addEventListener("pagehide", saveUiState);
    addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        globalSearch?.focus();
      }
      if (event.key === "Escape" && !treeFilter?.hidden) {
        event.preventDefault();
        setTreeFilterOpen(false);
        treeFilterTrigger?.focus();
        return;
      }
      if (event.key === "Escape" && dialog.open) {
        dialog.close();
        refreshBoard();
      }
      if (event.key === "Escape" && trashDialog?.open) closeGoalTrashDialog();
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshBoard();
    });
    addEventListener("resize", () => setTreeWidth(treePane.getBoundingClientRect().width, false));

    setTreeWidth(treePane.getBoundingClientRect().width, false);
    if (tuiPane) setTuiWidth(tuiPane.getBoundingClientRect().width, false);
    try {
      const stored = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (stored) applyUiState(stored);
    } catch {}
    if (selected && tuiPane) {
      tuiPane.setAttribute("data-goal-id", selected);
      document.dispatchEvent(new CustomEvent("goalboard:goal-changed", { detail: { goalId: selected } }));
    }
    updateRelationPreviews();
    updateAllRelationFormPreviews();
    setInterval(refreshBoard, 4000);
  })();
`;

function renderProjectMigrationDialog(): string {
  return `<dialog class="project-migration-dialog" data-project-migration-dialog aria-labelledby="project-migration-title">
  <form class="project-migration-form" data-project-migration-form>
    <header>
      <div><h2 id="project-migration-title">${L("迁移已有 GoalBoard 数据")}</h2><p>${L("这是一次单独确认的文件迁移，不会绑定或切换任何 Runtime Session。")}</p></div>
      <button class="icon-button" type="button" data-close-project-migration aria-label="${L("关闭迁移窗口")}">${icon("x")}</button>
    </header>
    <div class="project-migration-body">
      <label>${L("已有 GoalBoard DB")}<input name="legacy_database_path" type="text" required autocomplete="off" placeholder="${L("/绝对路径/到/goalboard.db")}"><small>${L("请输入你明确要迁移的本机 GoalBoard 数据库路径。")}</small></label>
      <label>${L("迁移后项目名 ")}<small>${L("可选")}</small><input name="display_name" type="text" maxlength="160" autocomplete="off" placeholder="${L("留空则使用旧 Board 的名称")}"></label>
      <p class="project-migration-warning">${L("确认后，来源 DB 会由 GoalBoard 的受管理项目目录接管，原位置不再保留该 DB；Goal、Claim、Run、Evidence 和审计历史会原样迁入。迁移失败时来源 DB 不会被移动。")}</p>
      <label class="project-migration-confirm"><input name="user_confirmed" type="checkbox"><span>${L("我确认要迁移这份已有 GoalBoard 数据，并理解成功后来源 DB 将移入 GoalBoard 管理目录。")}</span></label>
      <p class="project-migration-error" data-project-migration-error role="alert" hidden></p>
    </div>
    <footer><button type="button" data-close-project-migration>${L("取消")}</button><button class="project-migration-submit" type="submit" data-project-migration-submit>${L("确认迁移")}</button></footer>
  </form>
</dialog>`;
}

export function renderGoalBoardProjectIndex(
  projects: readonly WebProjectNavigation[],
  controlToken = "",
  desktopShell = false,
): string {
  const href = (path: string) => desktopShell ? withDesktopQuery(path) : path;
  const projectRows = projects
    .map(
      (project) => `<li><a href="${href(`/projects/${encodeURIComponent(project.project_id)}`)}"><span><strong>${escapeHtml(project.display_name)}${project.data_class === "regenerable_demo" ? ` <small>${L("演示数据 · 可重建")}</small>` : ""}</strong><span>${L("打开这个项目的 Goal Tree")}</span></span>${icon("chevron-down")}</a></li>`,
    )
    .join("");
  return `<!doctype html>
<html lang="${htmlLang()}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${controlTokenMeta(controlToken)}
  <title>${L("选择项目 · GoalBoard")}</title>
  <style>${STYLES}${PROJECT_INDEX_STYLES}${LOCALE_SWITCH_STYLES}</style>
</head>
<body class="project-index-page"${desktopShell ? ' data-desktop-shell="true"' : ""}>
  ${renderIconSprite()}
  <header class="topbar">
    <a class="brand" href="${href("/")}" aria-label="${L("GoalBoard 项目列表")}">${icon("brand")}<strong>GoalBoard</strong></a>
    <div class="project-context"><strong>${L("项目列表")}</strong><small>${L("打开项目后，Goal 右侧可以添加终端")}</small></div>
    <div class="top-spacer"></div>
    ${renderLocaleSwitch("/")}
    <a class="top-action" href="${href("/settings/runtimes")}">${icon("settings")}<span>${L("设置")}</span></a>
  </header>
  <main class="project-index">
    <section class="project-index-panel" aria-labelledby="project-index-title">
      <header class="project-index-heading">
        <h1 id="project-index-title">${L("选择一个项目")}</h1>
        <p>${L("你可以在网页创建、导入和打开项目，也可以在 Runtime 中通过 GoalBoard Skill 连接。网页选择项目不会自动绑定或切换 Runtime Session。")}</p>
        <p class="project-index-desktop-note">${L("打开项目后，Goal 详情右侧会出现终端栏。点「添加终端」即可在当前 Goal 上打开 TUI。")}</p>
      </header>
      ${projects.length
        ? `<ul class="project-list">${projectRows}</ul>`
        : `<div class="project-index-empty"><h2>${L("从一个真实项目开始")}</h2><p>${L("你可以直接在网页创建项目，也可以先接入当前设备上的 Runtime。两步都可跳过，GoalBoard 不会自动修改任何配置。")}</p><div class="project-index-start"><a href="${href("/settings/projects")}">${L("创建第一个项目")}</a><a href="${href("/settings/runtimes")}">${L("设置 Runtime 接入")}</a></div></div>`}
      <section class="project-index-migration"><div><strong>${L("已有一份旧的 GoalBoard DB？")}</strong><small>${L("只有你明确选择并确认后，才会迁移它并保留已有历史。")}</small></div><button class="project-index-migrate" type="button" data-open-project-migration>${L("迁移已有 GoalBoard 数据")}</button></section>
      <p class="project-index-note">${L("选择项目只影响这次网页浏览；正在对话的 Runtime Session 保持原来的项目关系。")}</p>
    </section>
  </main>
  ${renderProjectMigrationDialog()}
  <script>${clientI18nScript()}${CONTROL_CLIENT_SCRIPT}${PROJECT_INDEX_CLIENT_SCRIPT}</script>
</body>
</html>`;
}

function runtimeStatePresentation(state: RuntimeIntegrationDetection["connection_state"]): {
  label: string;
  tone: "neutral" | "success" | "warning" | "danger";
  description: string;
} {
  if (state === "connected") return { label: L("已接入"), tone: "success", description: L("MCP 与 GoalBoard Skill 都指向当前安装。") };
  if (state === "needs_repair") return { label: L("需要修复"), tone: "warning", description: L("检测到旧版或不完整的 GoalBoard 接入。") };
  if (state === "conflict") return { label: L("存在冲突"), tone: "danger", description: L("同名配置或 Skill 不属于 GoalBoard，不会自动覆盖。") };
  if (state === "goalboard_unavailable") return { label: L("本体不完整"), tone: "danger", description: L("请先查看诊断并修复 GoalBoard 本体安装。") };
  if (state === "not_detected") return { label: L("未检测到"), tone: "neutral", description: L("这台设备上没有找到对应 Runtime。") };
  return { label: L("未接入"), tone: "neutral", description: L("尚未把 GoalBoard MCP 与 Skill 写入这个 Runtime。") };
}

function renderRuntimeSettings(view: GoalBoardSettingsView): string {
  const rows = view.runtimes.map((runtime) => {
    const state = runtimeStatePresentation(runtime.connection_state);
    const unavailable = runtime.connection_state === "not_detected" || runtime.connection_state === "goalboard_unavailable";
    const action = runtime.connection_state === "connected" ? "remove" : "connect";
    const actionLabel = action === "remove" ? L("预览移除") : runtime.connection_state === "needs_repair" ? L("预览修复") : L("查看并接入");
    return `<article class="settings-record runtime-record" data-runtime-row="${escapeHtml(runtime.runtime_id)}">
      <header>
        <div class="settings-record-title"><span class="record-icon">${icon("workflow")}</span><div><h2>${escapeHtml(runtime.display_name)}</h2><p>${escapeHtml(state.description)}</p></div></div>
        <div class="settings-record-action"><span class="settings-state settings-state--${state.tone}">${escapeHtml(state.label)}</span><button type="button" data-runtime-plan="${escapeHtml(runtime.runtime_id)}" data-runtime-action="${action}"${unavailable ? " disabled" : ""}>${escapeHtml(actionLabel)}</button></div>
      </header>
      <dl class="settings-paths"><div><dt>Runtime</dt><dd>${runtime.executable_path ? escapeHtml(runtime.executable_path) : L("未找到可执行文件")}</dd></div><div><dt>${L("配置")}</dt><dd>${escapeHtml(runtime.config_path)}</dd></div><div><dt>Skill</dt><dd>${escapeHtml(runtime.skill_path)}</dd></div></dl>
    </article>`;
  }).join("");
  return `<section class="settings-document" aria-labelledby="settings-title">
    <header class="settings-heading"><h1 id="settings-title">${L("Runtime 接入")}</h1><p>${L("先看清要改什么，再决定是否接入。GoalBoard 不会在安装时自动修改 Runtime 用户配置。")}</p></header>
    <div class="settings-record-list">${rows || `<div class="settings-empty"><h2>${L("没有可探测的 Runtime")}</h2><p>${L("GoalBoard 本体仍可使用；稍后安装 Runtime 后再回来检查。")}</p></div>`}</div>
    <p class="settings-footnote">${L("当前自动适配 Codex、Claude Code、OpenCode、Pi Agent 和 Grok Build。每次确认只对应当前 Runtime 和当前预览；配置在预览后变化时会要求重新生成。")}</p>
  </section>`;
}

function renderConnectionSettings(view: GoalBoardSettingsView): string {
  const rows = view.connections.map((connection) => {
    const alternateProjects = view.projects.filter((project) => project.project_id !== connection.project_id);
    const switchForm = alternateProjects.length
      ? `<form class="connection-action-form" data-connection-rebind="${escapeHtml(connection.binding_id)}"><label>${L("切换到")}<select name="project_id" required>${alternateProjects.map((project) => `<option value="${escapeHtml(project.project_id)}">${escapeHtml(project.display_name)}</option>`).join("")}</select></label><label class="inline-confirm"><input type="checkbox" name="user_confirmed"><span>${L("确认只把这个 Session 从“{name}”切换到所选项目", { name: connection.project_name })}</span></label><p class="settings-form-error" role="alert" hidden></p><button type="submit">${L("确认切换")}</button></form>`
      : `<div class="connection-action-form"><p class="settings-footnote">${L("当前没有其他项目可切换。先创建或导入另一个项目。")}</p></div>`;
    return `<article class="settings-record connection-record" data-connection-row="${escapeHtml(connection.binding_id)}">
      <header><div class="settings-record-title"><span class="record-icon">${icon("workflow")}</span><div><h3>${escapeHtml(connection.context_label)}</h3><p>${escapeHtml(connection.runtime_name)}${L(" · 当前项目 ")}<strong>${escapeHtml(connection.project_name)}</strong></p></div></div><div class="settings-record-action"><span class="settings-state settings-state--success">${L("已关联")}</span></div></header>
      <div class="connection-record-tools"><details><summary>${icon("refresh")}<span>${L("切换项目")}</span>${icon("chevron-down")}</summary>${switchForm}</details><details><summary>${icon("blocked")}<span>${L("解绑")}</span>${icon("chevron-down")}</summary><form class="connection-action-form connection-action-form--danger" data-connection-unbind="${escapeHtml(connection.binding_id)}"><p class="settings-footnote">${L("只停止这个 Session 使用 GoalBoard；不会删除“{name}”或其他 Session 关联。", { name: connection.project_name })}</p><label class="inline-confirm"><input type="checkbox" name="user_confirmed"><span>${L("确认解绑这个 Session")}</span></label><p class="settings-form-error" role="alert" hidden></p><button type="submit">${L("确认解绑")}</button></form></details></div>
    </article>`;
  }).join("");
  return `<section class="connection-settings-section" aria-labelledby="connection-settings-title"><header class="connection-settings-heading"><h2 id="connection-settings-title">${L("已关联的 Runtime Session")}</h2><p>${L("这里只显示你已经在对应 Runtime 对话里确认过的 Session。新 Session 会先询问你要不要关联，不会自动出现在这里。")}</p></header><div class="connection-record-list">${rows || `<div class="settings-empty"><h3>${L("还没有已确认的 Session 关联")}</h3><p>${L("在 Runtime 中使用 GoalBoard Skill 后，当前 Session 会先询问你要连接哪个项目。")}</p></div>`}</div></section>`;
}

function renderWorkspaceSettings(view: GoalBoardSettingsView): string {
  const groups = new Map<string, typeof view.workspace_memberships>();
  for (const membership of view.workspace_memberships) {
    const current = groups.get(membership.workspace_id) ?? [];
    current.push(membership);
    groups.set(membership.workspace_id, current);
  }
  const rows = [...groups.entries()].map(([workspaceId, memberships]) => {
    const workspaceName = memberships[0]?.workspace_name ?? L("未命名目录");
    const defaultMembership = memberships.find((membership) => membership.is_default);
    const defaultChoices = memberships.filter((membership) => !membership.is_default);
    const defaultForm = defaultChoices.length
      ? `<form class="connection-action-form" data-workspace-default="${escapeHtml(workspaceId)}"><label>${L("新 Session 默认使用")}<select name="project_id" required>${defaultChoices.map((membership) => `<option value="${escapeHtml(membership.project_id)}">${escapeHtml(membership.project_name)}</option>`).join("")}</select></label><label class="inline-confirm"><input type="checkbox" name="user_confirmed"><span>${L("确认更改“{name}”的默认项目", { name: workspaceName })}</span></label><p class="settings-form-error" role="alert" hidden></p><button type="submit">${L("设为默认")}</button></form>`
      : `<div class="connection-action-form"><p class="settings-footnote">${L("当前没有其他已关联项目可设为默认。")}</p></div>`;
    const projects = memberships.map((membership) => `<li><span><strong>${escapeHtml(membership.project_name)}</strong>${membership.is_default ? `<span class="settings-state settings-state--success">${L("默认")}</span>` : ""}</span><form data-workspace-unlink="${escapeHtml(workspaceId)}" data-workspace-project="${escapeHtml(membership.project_id)}"><label class="inline-confirm"><input type="checkbox" name="user_confirmed"><span>${L("确认解除关联")}</span></label><p class="settings-form-error" role="alert" hidden></p><button type="submit">${L("解除")}</button></form></li>`).join("");
    return `<article class="settings-record connection-record" data-workspace-row="${escapeHtml(workspaceId)}"><header><div class="settings-record-title"><span class="record-icon">${icon("folder")}</span><div><h3>${escapeHtml(workspaceName)}</h3><p>${defaultMembership ? `${L("新 Session 默认进入 ")}<strong>${escapeHtml(defaultMembership.project_name)}</strong>` : L("已关联多个项目，进入新 Session 时需要选择")}</p></div></div><div class="settings-record-action"><span class="settings-state settings-state--success">${memberships.length}${L("个项目")}</span></div></header><ul class="workspace-project-list">${projects}</ul><div class="connection-record-tools"><details><summary>${icon("refresh")}<span>${L("更改默认项目")}</span>${icon("chevron-down")}</summary>${defaultForm}</details></div></article>`;
  }).join("");
  return `<section class="connection-settings-section" aria-labelledby="workspace-settings-title"><header class="connection-settings-heading"><h2 id="workspace-settings-title">${L("项目目录关联")}</h2><p>${L("一个目录可以关联多个 GoalBoard 项目，并指定新 Session 自动进入的默认项目。这里不展示完整目录路径。")}</p></header><div class="connection-record-list">${rows || `<div class="settings-empty"><h3>${L("还没有目录关联")}</h3><p>${L("在某个项目目录的 Runtime 对话中首次选择 GoalBoard 项目后，这里会出现关联。")}</p></div>`}</div></section>`;
}

function renderProjectSettings(view: GoalBoardSettingsView): string {
  const demo = view.projects.find((project) => project.data_class === "regenerable_demo");
  const rows = view.projects.map((project) => `<article class="settings-record project-record" data-project-row="${escapeHtml(project.project_id)}">
    <header>
      <div class="settings-record-title"><span class="record-icon">${icon("folder")}</span><div><h2>${escapeHtml(project.display_name)}</h2><p>${project.data_class === "regenerable_demo" ? L("演示数据 · 可随时重建，不属于用户项目") : project.source === "migrated" ? L("用户数据 · 由已有 GoalBoard 数据迁入") : L("用户数据 · 在 GoalBoard 中创建")}</p></div></div>
      <div class="settings-record-action">${project.data_class === "regenerable_demo" ? `<span class="settings-state settings-state--warning">${L("可重建 demo")}</span>` : `<span class="settings-state settings-state--success">${L("用户数据")}</span>`}<a class="settings-button" href="/projects/${encodeURIComponent(project.project_id)}/">${L("打开 Goal Tree")}</a></div>
    </header>
    <div class="project-record-tools">
      <details><summary>${icon("settings")}<span>${L("改名")}</span>${icon("chevron-down")}</summary><form data-project-rename="${escapeHtml(project.project_id)}"><label>${L("项目名称")}<input name="display_name" value="${escapeHtml(project.display_name)}" required maxlength="160"></label><p class="settings-form-error" role="alert" hidden></p><button type="submit">${L("保存名称")}</button></form></details>
      <details><summary>${icon("database")}<span>${L("DB 信息")}</span>${icon("chevron-down")}</summary><dl class="project-db-details"><div><dt>${L("项目 ID")}</dt><dd>${escapeHtml(project.project_id)}</dd></div><div><dt>${L("数据库")}</dt><dd>${escapeHtml(project.database_path)}</dd></div></dl></details>
      ${project.data_class === "regenerable_demo" ? `<details><summary>${icon("refresh")}<span>${L("重建或删除 demo")}</span>${icon("chevron-down")}</summary><div class="connection-action-form connection-action-form--danger"><p class="settings-footnote">${L("重建会清除你在 demo 中做的改动；删除只移除这个可重建项目，不影响用户项目。")}</p><p class="settings-form-error" data-demo-error role="alert" hidden></p><div class="service-action-row"><button type="button" data-demo-action="reset">${L("重建 demo")}</button><button type="button" data-demo-action="remove">${L("删除 demo")}</button></div></div></details>` : ""}
    </div>
  </article>`).join("");
  return `<section class="settings-document" aria-labelledby="settings-title">
    <header class="settings-heading"><h1 id="settings-title">${L("项目")}</h1><p>${L("每个项目有独立 DB；项目名称用于识别，DB 路径只是辅助信息。网页项目选择不会改变 Runtime Session 绑定。")}</p></header>
    <section class="settings-action-section" aria-labelledby="create-project-title"><div><h2 id="create-project-title">${L("创建项目")}</h2><p>${L("创建一个空的 GoalBoard 项目，然后直接打开它的 Goal Tree。")}</p></div><form class="inline-settings-form" data-project-create><label>${L("项目名称")}<input name="display_name" required maxlength="160" placeholder="${L("例如：新产品发布")}"></label><label class="inline-confirm"><input type="checkbox" name="user_confirmed"><span>${L("确认创建这个项目")}</span></label><p class="settings-form-error" role="alert" hidden></p><button type="submit">${L("创建并打开")}</button></form></section>
    <section class="settings-action-section" aria-labelledby="demo-project-title"><div><h2 id="demo-project-title">${L("产品示例")}</h2><p>${demo ? L("示例项目已单独标记为可重建数据，可以放心重置或删除。") : L("创建一份明确标记为可重建的示例数据；普通卸载会清理它，但保留用户项目。")}</p></div>${demo ? `<a class="settings-button" href="/projects/${encodeURIComponent(demo.project_id)}/">${L("打开示例")}</a>` : `<button type="button" data-demo-action="create">${L("创建示例项目")}</button>`}<p class="settings-form-error" data-demo-error role="alert" hidden></p></section>
    <div class="settings-record-list project-settings-list">${rows || `<div class="settings-empty"><h2>${L("还没有项目")}</h2><p>${L("在上方创建第一个项目，或从下方迁入一份已有 GoalBoard DB。")}</p></div>`}</div>
    ${renderWorkspaceSettings(view)}
    ${renderConnectionSettings(view)}
    <section class="settings-import-row"><div><h2>${L("导入已有 GoalBoard DB")}</h2><p>${L("明确选择并确认后，来源 DB 会移入 GoalBoard 的项目目录。")}</p></div><button type="button" data-open-project-migration>${L("选择 DB 并预览迁移")}</button></section>
    <p class="settings-footnote">${L("普通用户项目不会被 demo 操作或普通卸载删除；永久清除用户数据需要在 CLI 里单独确认精确目录和项目数量。")}</p>
  </section>`;
}

function renderDiagnosticsSettings(view: GoalBoardSettingsView): string {
  const diagnostics = view.diagnostics;
  const service = view.web_service;
  const installation = diagnostics.installation_state === "ready"
    ? { label: L("安装完整"), tone: "success" }
    : diagnostics.installation_state === "missing"
      ? { label: L("尚未安装本体"), tone: "warning" }
      : { label: L("安装清单无效"), tone: "danger" };
  const launchers = diagnostics.launchers.map((launcher) => `<li><span>${icon(launcher.state === "ready" ? "check" : "blocked")}<strong>${launcher.name}</strong><small>${escapeHtml(launcher.path)}</small></span><span class="settings-state settings-state--${launcher.state === "ready" ? "success" : "danger"}">${launcher.state === "ready" ? L("可用") : L("缺失")}</span></li>`).join("");
  const serviceTone = service.state === "running" ? "success" : service.state === "stopped" || service.state === "absent" || service.state === "unhealthy" ? "warning" : "danger";
  const serviceLabel = service.state === "running" ? L("运行中") : service.state === "stopped" ? L("已安装，未运行") : service.state === "unhealthy" ? L("进程运行中，页面不可用") : service.state === "absent" ? L("未启用") : service.state === "unsupported" ? L("当前系统不支持") : service.state === "conflict" ? L("配置冲突") : L("需要修复");
  const serviceActions = service.state === "running"
    ? [["restart", L("重启")], ["stop", L("停止")], ["remove", L("移除")]]
    : service.state === "stopped"
      ? [["start", L("启动")], ["remove", L("移除")]]
      : service.state === "unhealthy"
        ? [["restart", L("重启并检查")], ["remove", L("移除")]]
      : service.state === "absent" || service.state === "needs_repair"
        ? [["install", L("启用常驻服务")]]
        : [];
  const serviceButtons = serviceActions.map(([action, label]) => `<button type="button" data-web-service-action="${action}">${label}</button>`).join("");
  return `<section class="settings-document" aria-labelledby="settings-title">
    <header class="settings-heading"><h1 id="settings-title">${L("诊断")}</h1><p>${L("这里只读取 GoalBoard 自己的安装状态，不扫描项目内容，也不会自动修复或修改 Runtime。")}</p></header>
    <section class="diagnostics-summary"><div><h2>${L("GoalBoard 本体")}</h2><span class="settings-state settings-state--${installation.tone}">${installation.label}</span></div><dl><div><dt>${L("版本")}</dt><dd>${escapeHtml(diagnostics.version ?? L("未识别"))}</dd></div><div><dt>Home</dt><dd>${escapeHtml(diagnostics.home_directory)}</dd></div><div><dt>Release</dt><dd>${escapeHtml(diagnostics.release_directory ?? L("未找到"))}</dd></div><div><dt>${L("项目数")}</dt><dd>${diagnostics.project_count}</dd></div></dl></section>
    <section class="launcher-section" aria-labelledby="launcher-title"><h2 id="launcher-title">${L("启动入口")}</h2><ul>${launchers}</ul></section>
    <section class="diagnostics-summary" aria-labelledby="web-service-title"><div><div><h2 id="web-service-title">${L("Web 常驻服务")}</h2><p>${escapeHtml(L(service.message))}</p></div><span class="settings-state settings-state--${serviceTone}">${serviceLabel}</span></div><dl><div><dt>${L("方式")}</dt><dd>${service.provider === "macos-launchagent" ? L("macOS 用户级 LaunchAgent") : L("尚未提供")}</dd></div><div><dt>${L("命令")}</dt><dd>${escapeHtml(service.command.join(" "))}</dd></div><div><dt>${L("配置")}</dt><dd>${escapeHtml(service.plist_path)}</dd></div><div><dt>${L("日志")}</dt><dd>${escapeHtml(service.stdout_log)}<br>${escapeHtml(service.stderr_log)}</dd></div></dl><div class="service-action-row">${serviceButtons}</div><p class="settings-form-error" data-web-service-error role="alert" hidden></p></section>
    <p class="settings-footnote">${L("如果本体不完整，请在终端重新运行 ")}<code>goalboard install</code>${L("。常驻服务操作会先展示预览并要求确认；不会在后台使用 nohup。")}</p>
  </section>`;
}

function renderRuntimePlanDialog(): string {
  return `<dialog class="runtime-plan-dialog" data-runtime-plan-dialog aria-labelledby="runtime-plan-title">
    <div class="runtime-plan-shell">
      <header><div><h2 id="runtime-plan-title" data-runtime-plan-title>${L("Runtime 接入预览")}</h2><p data-runtime-plan-message>${L("正在读取变更计划…")}</p></div><button class="icon-button" type="button" data-runtime-plan-close aria-label="${L("关闭预览")}">${icon("x")}</button></header>
      <div class="runtime-plan-body"><ul class="runtime-change-list" data-runtime-change-list></ul><dl class="runtime-plan-meta"><div><dt>${L("备份")}</dt><dd data-runtime-plan-backup>${L("无须备份")}</dd></div><div><dt>${L("完成后")}</dt><dd data-runtime-plan-restart>${L("按页面提示重启 Runtime")}</dd></div></dl><label class="runtime-plan-confirm" data-runtime-confirm-row><input type="checkbox" data-runtime-confirm><span data-runtime-confirm-label>${L("我已查看并确认这份变更")}</span></label><p class="settings-form-error" data-runtime-plan-error role="alert" hidden></p></div>
      <footer><button type="button" data-runtime-plan-close>${L("取消")}</button><button class="runtime-plan-apply" type="button" data-runtime-plan-apply disabled>${L("确认应用")}</button></footer>
    </div>
  </dialog>`;
}

function renderTuiPane(selectedGoalId: string, cliAvailability: Record<string, boolean> = {}): string {
  const runtimeKinds: Array<[string, string]> = [
    ["claude-code", "Claude Code"],
    ["codex", "Codex"],
    ["opencode", "OpenCode"],
    ["pi-agent", "Pi Agent"],
    ["grok-build", "Grok Build"],
  ];
  const runtimeChoices = runtimeKinds.map(([kind, label]) => {
    const available = cliAvailability[kind] !== false;
    return `<button type="button" data-tui-kind="${kind}"${available ? "" : ` disabled title="${escapeHtml(L("需要先安装 CLI"))}"`}>${label}${available ? "" : `<small>${L("未安装")}</small>`}</button>`;
  }).join("");
  const missingKinds = runtimeKinds
    .filter(([kind]) => cliAvailability[kind] === false)
    .map(([, label]) => label);
  const missingHint = missingKinds.length
    ? `<p class="tui-menu-missing">${L("以下 CLI 未安装：{list}。安装后刷新页面即可使用。", { list: missingKinds.join("、") })}</p>`
    : "";
  return `
      <div class="tui-resizer" role="separator" aria-label="${L("调整终端宽度，双击收起")}" aria-orientation="vertical" aria-valuemin="280" aria-valuemax="720" aria-valuenow="480" tabindex="0" data-tui-resizer></div>
      <aside class="tui-pane" id="goal-tui-pane" data-tui-pane data-goal-id="${escapeHtml(selectedGoalId)}" aria-label="${L("终端面板")}">
        <div class="tui-tabs">
          <div class="tui-tab-list" data-tui-tabs></div>
          <button class="tui-add" type="button" data-tui-add aria-expanded="false" aria-controls="tui-open-menu" aria-haspopup="true" aria-label="${L("添加终端")}">${icon("plus")}<span>${L("添加终端")}</span></button>
          <button class="tui-collapse" type="button" data-tui-collapse aria-label="${L("收起终端")}" title="${L("收起终端")}">${icon("panel")}</button>
        </div>
        <div class="tui-stage">
          <div class="tui-chrome">
            <div class="tui-chrome-actions">
              <button class="tui-advance" type="button" data-tui-advance disabled>${icon("play")}<span>${L("推进这个 Goal")}</span></button>
              <button type="button" data-tui-copy>${icon("copy")}<span>${L("复制命令")}</span></button>
              <button type="button" data-tui-fill disabled>${L("填入不发送")}</button>
              <button type="button" data-tui-reopen hidden>${icon("refresh")}<span>${L("重新打开")}</span></button>
            </div>
            <p class="tui-status" data-tui-status role="status"></p>
          </div>
          <div class="tui-terminal" data-tui-terminal>
            <div class="tui-empty" data-tui-empty>
              <span class="tui-empty-mark" aria-hidden="true">${icon("terminal")}</span>
              <p><strong>${L("还没有终端")}</strong></p>
              <p>${L("点右上角「添加终端」，在这个 Goal 上打开常用 Runtime 或自定义命令。")}</p>
            </div>
          </div>
        </div>
        <form class="tui-menu" id="tui-open-menu" data-tui-menu aria-hidden="true" inert>
          <strong>${L("在这个 Goal 上打开终端")}</strong>
          <p>${L("标签只属于当前 Goal。打开不会自动发送或领取。")}</p>
          <div class="tui-runtime-choices">
            ${runtimeChoices}
            <button type="button" data-tui-kind="generic">${L("自定义命令")}</button>
          </div>
          ${missingHint}
          <label data-tui-generic-fields hidden>${L("命令")}<input name="command" type="text" autocomplete="off" placeholder="opencode"></label>
          <label>${L("继续会话 ID（可选）")}<input name="resume_session_id" type="text" autocomplete="off"></label>
          <div class="tui-menu-actions">
            <button type="button" data-tui-menu-cancel>${L("取消")}</button>
            <button type="submit" data-tui-generic-open hidden>${L("打开")}</button>
          </div>
        </form>
      </aside>
      <button class="tui-expand" type="button" data-tui-expand hidden aria-label="${L("展开终端")}" title="${L("展开终端")}">${icon("terminal")}<span class="tui-expand-label">${L("终端")}</span></button>`;
}

export function renderGoalBoardSettings(view: GoalBoardSettingsView, controlToken = ""): string {
  const title = view.section === "runtimes" ? L("Runtime 接入") : view.section === "projects" ? L("项目") : L("诊断");
  const content = view.section === "runtimes"
    ? renderRuntimeSettings(view)
    : view.section === "projects"
      ? renderProjectSettings(view)
      : renderDiagnosticsSettings(view);
  return `<!doctype html>
<html lang="${htmlLang()}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${controlTokenMeta(controlToken)}<title>${title} · ${L("GoalBoard 设置")}</title><style>${STYLES}${PROJECT_INDEX_STYLES}${SETTINGS_STYLES}${LOCALE_SWITCH_STYLES}</style></head>
<body class="settings-page" data-settings-section="${view.section}">
  ${renderIconSprite()}
  <header class="topbar"><a class="brand" href="/" aria-label="${L("返回 GoalBoard 项目列表")}">${icon("brand")}<strong>GoalBoard</strong></a><div class="project-context"><strong>${L("设置")}</strong><small>${L("Runtime、项目与诊断")}</small></div><div class="top-spacer"></div>${renderLocaleSwitch(`/settings/${view.section}`)}<a class="top-action" href="/">${icon("folder")}<span>${L("项目列表")}</span></a></header>
  <main class="settings-shell">
    <nav class="settings-navigation" aria-label="${L("GoalBoard 设置")}"><a href="/settings/runtimes"${view.section === "runtimes" ? ' aria-current="page"' : ""}>${icon("workflow")}<span><strong>${L("Runtime 接入")}</strong><small>${L("MCP 与 Skill")}</small></span></a><a href="/settings/projects"${view.section === "projects" ? ' aria-current="page"' : ""}>${icon("folder")}<span><strong>${L("项目")}</strong><small>${L("创建、导入与改名")}</small></span></a><a href="/settings/diagnostics"${view.section === "diagnostics" ? ' aria-current="page"' : ""}>${icon("activity")}<span><strong>${L("诊断")}</strong><small>${L("安装与启动入口")}</small></span></a></nav>
    <div class="settings-content">${content}</div>
  </main>
  ${renderRuntimePlanDialog()}
  ${renderProjectMigrationDialog()}
  <div class="toast" data-settings-toast role="status" aria-live="polite"></div>
  <script>${clientI18nScript()}${CONTROL_CLIENT_SCRIPT}${PROJECT_INDEX_CLIENT_SCRIPT}${SETTINGS_CLIENT_SCRIPT}</script>
</body></html>`;
}

function prefixLocalLinks(html: string, routePrefix: string, desktopShell = false): string {
  const prefixed = routePrefix
    ? html.replace(/href="\/(?!locale(?:\?|"))/g, `href="${routePrefix}/`)
    : html;
  const resolved = prefixed
    .replaceAll('href="__PROJECT_INDEX__"', 'href="/"')
    .replaceAll('href="__SETTINGS__"', 'href="/settings/runtimes"');
  return desktopShell ? appendDesktopQueryToLocalHrefs(resolved) : resolved;
}

export function renderGoalBoardWeb(
  view: GoalBoardWebView,
  requestedGoalId?: string,
  archiveView = false,
  decisionView = false,
  trashView = false,
  controlToken = "",
  desktopShell = false,
  cliAvailability: Record<string, boolean> = {},
): string {
  const visibleGoals = trashView ? view.trashed_goals : archiveView ? view.archived_goals : view.goals;
  const collectionView = archiveView || trashView;
  const collectionTitle = trashView ? L("回收站") : archiveView ? L("已归档") : "Goal Tree";
  const collectionSuffix = trashView ? L("回收站") : archiveView ? L("归档") : "";
  const selected = decisionView
    ? undefined
    : visibleGoals.find((item) => item.goal.goal_id === requestedGoalId) ??
      (collectionView ? undefined : visibleGoals.find((item) => item.goal.goal_id === view.active_goal_id)) ??
      visibleGoals[0];
  const selectedId = selected?.goal.goal_id ?? "";
  const title = decisionView
    ? L("等待你的决定 · GoalBoard")
    : selected
    ? selected.goal.title + " · GoalBoard"
    : trashView
      ? L("回收站 · GoalBoard")
    : archiveView
      ? L("已归档 Goal · GoalBoard")
      : "GoalBoard";
  const phaseSummary = [
    { label: L("澄清中"), count: view.counts.clarifying },
    { label: L("执行中"), count: view.counts.executing },
    { label: L("复核中"), count: view.counts.reviewing },
    { label: L("重新验证中"), count: view.counts.revalidating },
  ]
    .filter((item) => item.count > 0)
    .map((item) => `${item.label} ${item.count}`)
    .join(" · ");
  const blockedCount =
    view.counts.clarification_blocked +
    view.counts.execution_blocked +
    view.counts.review_blocked +
    view.counts.revalidation_blocked +
    view.counts.invalidated;
  const footerStatus = [phaseSummary, blockedCount > 0 ? L("受阻 {count}", { count: blockedCount }) : ""]
    .filter(Boolean)
    .join(" · ") || L("当前没有进行中的 Goal");
  const collectionNote = trashView
    ? L("可恢复；历史与关联处理记录会保留")
    : archiveView
      ? L("可随时恢复")
      : footerStatus;
  const searchPlaceholder = trashView
    ? L("在回收站内搜索")
    : archiveView
      ? L("在已归档 Goal 中搜索")
      : L("在当前 Goal Tree 内搜索");
  const searchLabel = trashView ? L("搜索回收站") : archiveView ? L("搜索已归档 Goal") : L("搜索 Goal");
  const localeNextPath = decisionView
    ? `${view.route_prefix}/decisions`
    : trashView
      ? selectedId
        ? `${view.route_prefix}/trash/goals/${encodeURIComponent(selectedId)}`
        : `${view.route_prefix}/trash`
    : archiveView
      ? selectedId
        ? `${view.route_prefix}/archive/goals/${encodeURIComponent(selectedId)}`
        : `${view.route_prefix}/archive`
      : selectedId
        ? `${view.route_prefix}/goals/${encodeURIComponent(selectedId)}`
        : view.route_prefix
          ? `${view.route_prefix}/`
          : "/";
  const pendingCount = pendingDecisionCount(view);
  const projectContext = `<div class="project-bar"><div class="project-context"><strong>${L("项目：")}</strong><span>${escapeHtml(view.project?.display_name ?? L("当前项目"))}</span>${view.project ? `<a href="__PROJECT_INDEX__">${L("切换项目")}</a>` : ""}</div><a class="project-decisions${decisionView ? " is-current" : ""}${pendingCount > 0 ? " has-pending" : ""}" data-decisions-link href="/decisions" aria-label="${L("待决定")} ${pendingCount}"${decisionView ? ' aria-current="page"' : ""}>${icon("user")}<span>${L("待决定")}</span><strong>${pendingCount}</strong></a>${view.demo ? `<small class="project-demo">${L("示例数据")}</small>` : ""}<span class="sync-state" data-sync-state>${L("已同步")}</span></div>`;
  const showTui = !decisionView && !archiveView && !trashView;
  const html = `<!--
THESIS: GoalBoard 是人和 Runtime 共享的 Goal 真相源；它不分发任务，只让目标、依赖和完成证据持续可见。
OWN-WORLD: 使用参考图的高密度桌面工作台语言：顶部全局栏、左侧 IDE Goal Tree、右侧连续文档。
STORY: 从 Tree 选择 Goal，按“目标 → 完成标准 → 当前推进 → 风险规则 → 历史”阅读同一份连续事实。
FIRST VIEWPORT: 首屏必须同时看见 Goal Tree、当前 Goal 标题和用人话写出的目标说明。
FORM: Reference-led desktop Goal workbench, pinned screenshot authority, Operate mode.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->
<!doctype html>
<html lang="${htmlLang()}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${controlTokenMeta(controlToken)}
  <title>${escapeHtml(title)}</title>
  <style>${STYLES}${MORE_STYLES}${RESPONSIVE_STYLES}${LOCALE_SWITCH_STYLES}.document-pane.is-syncing .goal-document { animation: none; }</style>
</head>
<body data-board-view="${decisionView ? "decisions" : trashView ? "trash" : archiveView ? "archive" : "current"}" data-route-prefix="${escapeHtml(view.route_prefix)}"${desktopShell ? ' data-desktop-shell="true"' : ""}>
  ${renderIconSprite()}
  <div class="app">
    <header class="topbar">
      <div class="brand">${icon("brand")}<strong>GoalBoard</strong></div>
      ${projectContext}
      <div class="top-spacer"></div>
      ${renderLocaleSwitch(localeNextPath)}
      <a class="top-action" data-settings-link href="__SETTINGS__" aria-label="${L("打开 GoalBoard 设置")}">${icon("settings")}<span>${L("设置")}</span></a>
    </header>
    <nav class="mobile-switch" role="tablist" aria-label="${L("移动端视图")}"><button class="is-active" type="button" role="tab" aria-selected="true" aria-controls="goal-tree-pane" data-mobile-target="tree">Goal Tree</button><button type="button" role="tab" aria-selected="false" aria-controls="goal-document-pane" data-mobile-target="document">${decisionView ? L("决定中心") : L("Goal 正文")}</button>${showTui ? `<button type="button" role="tab" aria-selected="false" aria-controls="goal-tui-pane" data-mobile-target="tui">${L("终端")}</button>` : ""}</nav>
    <main class="workspace${showTui ? " is-desktop-tui" : ""}" data-workspace data-mobile-view="tree">
      <aside class="tree-pane" id="goal-tree-pane">
        ${renderTreeChrome(view, visibleGoals, archiveView, trashView, searchPlaceholder, searchLabel)}
        <div class="tree-scroll" data-tree-scroll tabindex="0" aria-label="${collectionTitle} ${L("目标列表")}">${renderGoalTree(view, selectedId, visibleGoals)}<div class="tree-filter-empty" data-tree-filter-empty hidden><p>${L("没有符合当前筛选条件的 Goal。")}</p><button type="button" data-clear-tree-filter>${L("清除所有筛选")}</button></div></div>
        <footer class="tree-footer" data-tree-footer><span data-tree-filter-count data-tree-suffix="${escapeHtml(collectionSuffix)}">${L("共 {count} 个{suffix}目标", { count: visibleGoals.length, suffix: collectionSuffix ? `${collectionSuffix} ` : "" })}</span><small>${collectionNote}</small></footer>
      </aside>
      <div class="tree-resizer" role="separator" aria-label="${L("调整 Goal Tree 宽度")}" aria-orientation="vertical" aria-valuemin="260" aria-valuemax="520" aria-valuenow="320" tabindex="0" data-tree-resizer></div>
      <section class="document-pane" id="goal-document-pane" data-document-pane>
        ${decisionView ? renderDecisionCenter(view) : selected ? trashView ? renderTrashGoalDocument(selected, true) : renderGoalDocument(selected, view, true) : trashView ? `<div class="archive-empty">${icon("archive")}<h1>${L("回收站是空的")}</h1><p>${L("移入回收站的 Goal 可以在这里恢复；日常 Goal Tree 不会被它们干扰。")}</p><a href="/">${L("返回 Goal Tree")}</a></div>` : `<div class="archive-empty">${icon("archive")}<h1>${L("还没有归档 Goal")}</h1><p>${L("已完成的 Goal 可以在正文顶部手动归档，历史事实不会被删除。")}</p><a href="/">${L("返回 Goal Tree")}</a></div>`}
      </section>
      ${showTui ? renderTuiPane(selectedId, cliAvailability) : ""}
    </main>
  </div>
  ${renderCreateDialog(view)}
  ${renderGoalTrashDialog()}
  <div class="toast" data-toast role="status" aria-live="polite"></div>
  <script id="goalboard-data" type="application/json">${dataJson(view)}</script>
  <script>${clientI18nScript()}${CONTROL_CLIENT_SCRIPT}${CLIENT_SCRIPT}</script>
  ${showTui ? '<script src="/desktop/pty-client.js"></script>' : ""}
</body>
</html>`;
  return prefixLocalLinks(html, view.route_prefix, desktopShell);
}

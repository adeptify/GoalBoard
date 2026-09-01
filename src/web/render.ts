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
  GoalActionProjection,
  GoalDisplayStatus,
  GoalPolicy,
  GoalRecord,
  GoalRelationRecord,
  GoalTreeProposalRecord,
  GoalWorkState,
  GoalWorkStateView,
  ImpactBindingRecord,
  ProjectGuidanceView,
  ReviewObligationRecord,
  ReviewRecord,
  RewireRecord,
  RiskRecord,
  RunRecord,
} from "../v1/types.js";
import { DEFAULT_GOAL_POLICY } from "../v1/types.js";
import {
  composePlanningMethodPacks,
  type PlanningMethodPack,
} from "../planning/method-packs.js";
import type { RuntimeIntegrationDetection } from "../install/runtime-integration.js";
import type { GoalBoardWebServiceDetection } from "../install/web-service.js";
import { icon, renderIconSprite, type GoalBoardIcon } from "./icons.js";
import { ONBOARDING_INTENT_FRAMES } from "./onboarding-intent.js";
import {
  L,
  currentLocale,
  htmlLang,
  dateTimeLocale,
  listJoin,
  localeSwitchHref,
  clientI18nScript,
} from "./i18n.js";
import {
  appendDesktopQueryToLocalHrefs,
  NATIVE_DESKTOP_BOOTSTRAP_SCRIPT,
  withDesktopQuery,
} from "./desktop-shell.js";
import {
  buildGoalMomentumView,
  type GoalMomentumAction,
  type GoalMomentumCadence,
  type GoalMomentumNode,
} from "./goal-momentum.js";
import {
  THEME_BOOTSTRAP_SCRIPT as BASE_THEME_BOOTSTRAP_SCRIPT,
  VISUAL_FOUNDATION_CLIENT_SCRIPT,
  VISUAL_FOUNDATION_STYLES,
} from "./visual-foundation.js";
import {
  explainDecision,
  explainParentCompletion,
  explainWorkState,
  type GoalPresentationState,
} from "./human-language.js";
import {
  goalTreeProposalItemValidationIssues,
  goalTreeRiskDescription,
} from "../v1/goal-tree-proposal-validation.js";
import {
  goalTreeProposalDecompositionIssues,
  PRODUCT_PATH_AREA_LABELS,
  readDecompositionReview,
  readLeafReadiness,
  TASK_CONTEXT_LABELS,
  type GoalDecompositionValidationIssue,
  type ProductPathArea,
} from "../v1/goal-decomposition-validation.js";
import type {
  FeedItemRecord,
  FeedItemType,
  FeedSnapshot,
  FeedSourceRecord,
  FeedSourceRunRecord,
  InboxEntryRecord,
  RelayImportAvailability,
} from "../feed/types.js";
import type { FeedSourceCatalogView } from "../feed/sources/service.js";
import type { ConnectorAuthStatus } from "../feed/connectors/service.js";
import {
  GMAIL_SCOPE_PRESETS,
  parseGmailScope,
} from "../feed/connectors/gmail-scope.js";
import { readRssHttpState } from "../feed/sources/rss-http.js";
import {
  PROJECT_OPERATIONS_CLIENT_SCRIPT,
  PROJECT_OPERATIONS_STYLES,
  renderProjectOperations,
  type ProjectOperationsData,
} from "./project-session-workspaces.js";
import { feedPlainText, renderFeedRichText } from "./feed-rich-content.js";
import {
  GOAL_DISPLAY_STATUSES,
  goalDisplayStatusLabel,
} from "./action-presentation.js";

const THEME_BOOTSTRAP_SCRIPT = `${BASE_THEME_BOOTSTRAP_SCRIPT}${NATIVE_DESKTOP_BOOTSTRAP_SCRIPT}`;

export type WebGoalStatus = GoalPresentationState;

export const WEB_GOAL_STATUSES: readonly WebGoalStatus[] = [
  "clarification_pending",
  "clarification_decision_pending",
  "compound_closure_pending",
  "clarifying",
  "clarification_blocked",
  "waiting_children",
  "execution_pending",
  "executing",
  "execution_blocked",
  "completion_pending",
  "completion_blocked",
  "review_pending",
  "reviewing",
  "review_blocked",
  "waiting_for_human",
  "revalidation_pending",
  "revalidating",
  "revalidation_blocked",
  "replaced",
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
  action_projection: GoalActionProjection;
  display_status: GoalDisplayStatus;
  work_state: GoalWorkState;
  status_label: string;
  main_action_label: string;
  action_summary: string;
  reasons: DecisionReason[];
  active_claim_actor: string | null;
  active_claim: ClaimRecord | null;
  active_claim_lease: GoalWorkStateView["active_claim_lease"];
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

export type WebSettingsSection = "appearance" | "runtimes" | "projects" | "diagnostics";

export interface WebSettingsProject extends WebProjectNavigation {
  database_path: string;
  source: "created" | "migrated";
  data_class: "user" | "migrated_user" | "regenerable_demo";
  created_at: string;
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
  context_project?: WebProjectNavigation | null;
  runtimes: RuntimeIntegrationDetection[];
  projects: WebSettingsProject[];
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
  feed: FeedSnapshot;
  relay_import: RelayImportAvailability;
  feed_source_catalog?: FeedSourceCatalogView[];
  feed_connector_auth?: ConnectorAuthStatus;
}

const STATUS_ICONS: Record<WebGoalStatus, GoalBoardIcon> = {
  clarification_pending: "waiting",
  clarification_decision_pending: "user",
  compound_closure_pending: "tree",
  clarifying: "play",
  clarification_blocked: "blocked",
  waiting_children: "tree",
  execution_pending: "ready",
  executing: "play",
  execution_blocked: "blocked",
  completion_pending: "completed",
  completion_blocked: "blocked",
  review_pending: "review",
  reviewing: "review",
  review_blocked: "blocked",
  waiting_for_human: "user",
  revalidation_pending: "refresh",
  revalidating: "refresh",
  revalidation_blocked: "blocked",
  replaced: "refresh",
  invalidated: "alert",
  satisfied: "completed",
  trashed: "archive",
  archived: "archive",
};

const DISPLAY_STATUS_ICONS: Record<GoalDisplayStatus, GoalBoardIcon> = {
  continue: "ready",
  in_progress: "play",
  waiting_user: "user",
  waiting: "waiting",
  blocked: "blocked",
  completed: "completed",
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

function safeExternalHref(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function controlTokenMeta(controlToken: string): string {
  return `<meta name="goalboard-control-token" content="${escapeHtml(controlToken)}">`;
}

function dataJson(view: GoalBoardWebView): string {
  const summarize = (items: WebGoalView[]) => items.map((item) => {
    const children = partOfChildViews(item.goal.goal_id, view).map((child) => {
      return {
        goal: {
          goal_id: child.goal.goal_id,
          title: child.goal.title,
        },
        status: visibleGoalStatus(child),
        status_label: child.status_label,
        status_meaning: child.action_summary,
        next_action: child.main_action_label,
      };
    });
    return {
      goal: {
        goal_id: item.goal.goal_id,
        title: item.goal.title,
      },
      status: visibleGoalStatus(item),
      status_label: item.status_label,
      status_meaning: item.action_summary,
      status_icon: visibleGoalStatusIcon(item),
      is_waiting_parent: item.display_status === "waiting",
      is_compound_parent: item.goal.decomposition_state === "closed_compound",
      children,
    };
  });
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

function renderReference(value: string, label = value, evidenceId?: string): string {
  if (/^https?:\/\//i.test(value)) {
    return `<a class="inline-ref" href="${escapeHtml(value)}" target="_blank" rel="noreferrer">${icon("external")}<span>${escapeHtml(label)}</span></a>`;
  }
  if (isProjectReference(value)) {
    const evidenceQuery = evidenceId ? `?evidence_id=${encodeURIComponent(evidenceId)}` : "";
    return `<a class="inline-ref" href="/api/project-references/${encodeURIComponent(value)}${evidenceQuery}" target="_blank" rel="noreferrer" data-project-reference>${icon("external")}<span>${escapeHtml(label)}</span></a>`;
  }
  return `<button class="inline-ref" type="button" data-copy-value="${escapeHtml(value)}" title="${L("复制引用")}">${icon("copy")}<span>${escapeHtml(label)}</span></button>`;
}

function renderList(values: string[], empty: string): string {
  if (values.length === 0) return `<p class="empty-row">${escapeHtml(L(empty))}</p>`;
  return `<ul class="doc-list">${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>`;
}

function renderStatus(status: WebGoalStatus, attributes = "", labelAttributes = ""): string {
  const explanation = explainWorkState(status);
  return `<span class="goal-status goal-status--${status}"${attributes ? ` ${attributes}` : ""} title="${escapeHtml(explanation.meaning)}">${icon(STATUS_ICONS[status])}<span${labelAttributes ? ` ${labelAttributes}` : ""}>${escapeHtml(explanation.label)}</span></span>`;
}

function renderActionStatus(status: GoalDisplayStatus, attributes = "", labelAttributes = ""): string {
  const label = goalDisplayStatusLabel(status);
  return `<span class="goal-status goal-status--${status}"${attributes ? ` ${attributes}` : ""} title="${escapeHtml(label)}">${icon(DISPLAY_STATUS_ICONS[status])}<span${labelAttributes ? ` ${labelAttributes}` : ""}>${escapeHtml(label)}</span></span>`;
}

type GoalVisibleStatus = GoalDisplayStatus | "replaced" | "archived" | "trashed";

function visibleGoalStatus(item: WebGoalView): GoalVisibleStatus {
  if (item.status === "replaced" || item.status === "archived" || item.status === "trashed") {
    return item.status;
  }
  return item.display_status;
}

function renderVisibleGoalStatus(
  item: WebGoalView,
  attributes = "",
  labelAttributes = "",
): string {
  const status = visibleGoalStatus(item);
  return status === "replaced" || status === "archived" || status === "trashed"
    ? renderStatus(status, attributes, labelAttributes)
    : renderActionStatus(status, attributes, labelAttributes);
}

function visibleGoalStatusIcon(item: WebGoalView): string {
  const status = visibleGoalStatus(item);
  return icon(status === "replaced" || status === "archived" || status === "trashed"
    ? STATUS_ICONS[status]
    : DISPLAY_STATUS_ICONS[status]);
}

/** Goal Tree sibling order: work you can pick up, then in-flight, then blocked, then parked. */
export const GOAL_TREE_STATUS_ORDER: readonly WebGoalStatus[] = [
  "completion_pending",
  "execution_pending",
  "executing",
  "review_pending",
  "reviewing",
  "waiting_for_human",
  "revalidation_pending",
  "revalidating",
  "clarification_decision_pending",
  "compound_closure_pending",
  "clarification_pending",
  "clarifying",
  "execution_blocked",
  "completion_blocked",
  "review_blocked",
  "revalidation_blocked",
  "clarification_blocked",
  "waiting_children",
  "replaced",
  "invalidated",
  "satisfied",
  "archived",
  "trashed",
];

const GOAL_TREE_DISPLAY_STATUS_ORDER: readonly GoalDisplayStatus[] = [
  "continue",
  "in_progress",
  "waiting_user",
  "blocked",
  "waiting",
  "completed",
];

function goalTreeStatusRank(status: string): number {
  const index = (GOAL_TREE_STATUS_ORDER as readonly string[]).indexOf(status);
  return index < 0 ? GOAL_TREE_STATUS_ORDER.length : index;
}

export function sortGoalTreeItems<T extends {
  status: WebGoalStatus;
  display_status?: GoalDisplayStatus;
  goal: { priority: number; created_at: string };
}>(
  items: T[],
): T[] {
  const rank = (item: T): number => {
    if (item.display_status) {
      const index = GOAL_TREE_DISPLAY_STATUS_ORDER.indexOf(item.display_status);
      if (index >= 0) return index;
    }
    return goalTreeStatusRank(item.status);
  };
  return [...items].sort(
    (left, right) =>
      rank(left) - rank(right) ||
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
    item.display_status === "completed" ||
    item.goal.fulfillment_state === "satisfied"
  );
}

/**
 * Presentation progress follows the authoritative Goal result. Evidence remains
 * a separate fact: a compound Goal can be satisfied through its children and a
 * human decision without producing one direct Evidence row per criterion.
 */
export function displayedPassedCriterionIds(item: WebGoalView): string[] {
  const criterionIds = item.goal.acceptance_criteria.map((criterion) => criterion.criterion_id);
  if (goalWorkSatisfied(item)) return criterionIds;
  const knownCriterionIds = new Set(criterionIds);
  return [...new Set(item.passed_criteria.filter((criterionId) => knownCriterionIds.has(criterionId)))];
}

export function isBlockedWorkStatus(status: WebGoalStatus): boolean {
  return status.endsWith("_blocked") || status === "replaced" || status === "invalidated";
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
  const targets = relations.map((relation) => ({
    relation,
    target: findGoalView(view, relation.to_goal_id),
  }));
  const waiting = targets.filter(({ target }) => !target || !goalWorkSatisfied(target));
  const blocked = waiting.filter(({ target }) => target && isBlockedWorkStatus(target.status));
  const tone = blocked.length ? "is-blocked" : waiting.length ? "is-waiting" : "is-ready";
  const health = blocked.length
    ? L("{count} 个阻塞", { count: blocked.length })
    : waiting.length
      ? L("{count} 个未完成", { count: waiting.length })
      : L("已就绪");
  return `<details class="tree-relations ${tone}" data-tree-relations>
    <summary aria-label="${L("查看 {count} 个前置依赖", { count: relations.length })}">
      <span class="tree-relations-mark" aria-hidden="true">${icon("link")}</span>
      <strong>${L("{count} 个前置", { count: relations.length })}</strong>
      <em>${escapeHtml(health)}</em>
      ${icon("chevron-down")}
    </summary>
    <div class="tree-deps">${targets
    .map(({ relation, target }) => {
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
        <span class="tree-dep-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(relation.reason)}</small></span>
        <em>${escapeHtml(statusLine)}</em>
      </button>`;
    })
    .join("")}</div>
  </details>`;
}

function renderTreeChildProgress(children: readonly WebGoalView[]): string {
  if (!children.length) return "";
  const done = children.filter(goalWorkSatisfied).length;
  const blocked = children.filter((child) => isBlockedWorkStatus(child.status)).length;
  const progress = Math.round((done / children.length) * 100);
  const label = blocked
    ? L("{done}/{total} 完成，{blocked} 个阻塞", { done, total: children.length, blocked })
    : L("{done}/{total} 完成", { done, total: children.length });
  return `<span class="tree-progress${blocked ? " is-blocked" : ""}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
    <span>${done}/${children.length}</span><i aria-hidden="true"><b style="--tree-progress:${progress}%"></b></i>
  </span>`;
}

export function goalTreeReferenceLabel(goalId: string): string | null {
  const normalized = goalId.trim();
  const hierarchicalCode = normalized
    .split(/[-_.:/\s]+/)
    .find((segment) => /^g\d+[a-z]?$/i.test(segment));
  if (hierarchicalCode) return hierarchicalCode.toUpperCase();
  if (/^[a-z]{1,3}\d+[a-z]?$/i.test(normalized)) return normalized.toUpperCase();
  return null;
}

const GOAL_REFERENCE_GENERIC_SUFFIXES = new Set([
  "ai",
  "baseline",
  "goal",
  "kol",
  "list",
  "quality",
  "roster",
]);

function goalTreeReferenceSuffix(goalId: string, referenceLabel: string): { compact: string; full: string } {
  const segments = goalId.trim().split(/[-_.:/\s]+/).filter(Boolean);
  const referenceIndex = segments.findIndex((segment) => segment.toUpperCase() === referenceLabel);
  if (referenceIndex < 0) return { compact: "", full: "" };
  const suffix = segments.slice(referenceIndex + 1);
  return {
    compact: suffix.filter((segment) => !GOAL_REFERENCE_GENERIC_SUFFIXES.has(segment.toLowerCase())).join("-").toUpperCase(),
    full: suffix.join("-").toUpperCase(),
  };
}

export function goalTreeReferenceLabels(goalIds: readonly string[]): Map<string, string> {
  const labels = new Map<string, string>();
  const groups = new Map<string, string[]>();
  for (const goalId of goalIds) {
    const base = goalTreeReferenceLabel(goalId);
    if (!base) continue;
    groups.set(base, [...(groups.get(base) ?? []), goalId]);
  }
  for (const [base, groupedGoalIds] of groups) {
    if (groupedGoalIds.length === 1) {
      labels.set(groupedGoalIds[0]!, base);
      continue;
    }
    const suffixes = groupedGoalIds.map((goalId) => ({ goalId, ...goalTreeReferenceSuffix(goalId, base) }));
    const baseEntry = suffixes
      .filter((entry) => !entry.compact)
      .sort((left, right) => left.full.length - right.full.length || left.goalId.localeCompare(right.goalId))[0];
    if (baseEntry) labels.set(baseEntry.goalId, base);
    const usedDiscriminators = new Set<string>();
    const entriesToDisambiguate = suffixes
      .filter((entry) => entry.goalId !== baseEntry?.goalId)
      .map((entry) => ({ ...entry, source: entry.compact || entry.full || entry.goalId.toUpperCase() }))
      .sort((left, right) => left.source.length - right.source.length || left.source.localeCompare(right.source));
    for (const entry of entriesToDisambiguate) {
      let length = entry.source.length <= 3 ? entry.source.length : 1;
      let discriminator = entry.source.slice(0, length);
      while (usedDiscriminators.has(discriminator) && length < entry.source.length) {
        length += 1;
        discriminator = entry.source.slice(0, length);
      }
      if (usedDiscriminators.has(discriminator)) discriminator = entry.goalId.toUpperCase();
      usedDiscriminators.add(discriminator);
      labels.set(entry.goalId, `${base}/${discriminator}`);
    }
  }
  return labels;
}

function renderGoalTree(
  view: GoalBoardWebView,
  selectedGoalId: string,
  items: WebGoalView[] = view.goals,
): string {
  const referenceLabels = goalTreeReferenceLabels(view.goals.map((item) => item.goal.goal_id));
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
    const selected = item.goal.goal_id === selectedGoalId;
    const referenceLabel = referenceLabels.get(item.goal.goal_id) ?? null;
    const reference = referenceLabel == null
      ? ""
      : `<small title="Goal ID: ${escapeHtml(item.goal.goal_id)}" aria-label="${L("Goal 编号")} ${escapeHtml(referenceLabel)}">${escapeHtml(referenceLabel)}</small>`;
    return `<li class="tree-item${depth > 0 ? "" : " tree-item--root"}" data-tree-item data-goal-id="${escapeHtml(item.goal.goal_id)}" data-goal-search="${escapeHtml(searchValue)}" data-goal-status="${escapeHtml(visibleGoalStatus(item))}">
      <div class="tree-row">
        ${
          hasChildren
            ? `<button class="tree-toggle" type="button" data-tree-toggle aria-expanded="true" aria-label="${L("折叠")} ${escapeHtml(item.goal.title)}">${icon("chevron-down")}</button>`
            : `<span class="tree-guide" aria-hidden="true"></span>`
        }
        <div class="tree-entry directory-list-row${selected ? " is-selected" : ""}">
          <button class="tree-node${selected ? " is-selected" : ""}" type="button" data-select-goal="${escapeHtml(item.goal.goal_id)}" aria-pressed="${selected}">
            <span class="tree-copy"><span class="tree-title-line"><strong title="${escapeHtml(item.goal.title)}">${escapeHtml(item.goal.title)}</strong></span>${reference}</span>
          </button>
          <span class="directory-row-state">${renderVisibleGoalStatus(item)}</span>
          <span class="tree-meta-line">${renderTreeChildProgress(nodeChildren)}${renderTreeDependencies(item, view)}</span>
        </div>
      </div>
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
  const counts = new Map<GoalVisibleStatus, number>();
  for (const item of items) {
    const status = visibleGoalStatus(item);
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  const options = [...GOAL_DISPLAY_STATUSES, "replaced", "archived", "trashed"]
    .filter((status): status is GoalVisibleStatus => (counts.get(status as GoalVisibleStatus) ?? 0) > 0);
  return `<section class="tree-filter" id="tree-status-filter" data-tree-filter hidden aria-label="${L("按状态筛选")}">
    <header><strong>${L("按状态筛选")}</strong><button type="button" data-clear-status-filter disabled>${L("清除")}</button></header>
    <p>${L("可同时选择多个状态；会与关键词搜索一起生效。")}</p>
    <div class="tree-filter-options" role="group" aria-label="${L("Goal 状态")}">
      ${options.length ? options.map((status) => `<label class="tree-filter-option"><input type="checkbox" value="${status}" data-status-filter><span>${status === "replaced" || status === "archived" || status === "trashed" ? renderStatus(status) : renderActionStatus(status)}</span><small>${counts.get(status)}</small></label>`).join("") : `<p class="empty-row">${L("当前没有可筛选的 Goal。")}</p>`}
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
    ${!archiveView && !trashView ? `<div class="navigator-view-switch" role="tablist" aria-label="${L("Goal 视图")}">
      <button class="is-active" type="button" role="tab" aria-selected="true" data-navigator-view="list">${icon("list")}<span>${L("列表")}</span></button>
      <button type="button" role="tab" aria-selected="false" data-navigator-view="graph">${icon("workflow")}<span>${L("推进态势")}</span></button>
    </div>` : ""}
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

function momentumHeadline(cadence: GoalMomentumCadence, bottleneck?: GoalMomentumNode): string {
  const subject = bottleneck
    ? L("{title} 仍影响 {count} 个未完成下游。", { title: bottleneck.title, count: bottleneck.downstream_open_count })
    : L("当前没有形成明显下游瓶颈的 Goal。");
  if (cadence.stalled > cadence.completed) {
    return `${L("停滞多于最近完成，推进节奏正在变慢。")} ${subject}`;
  }
  if (cadence.completed > cadence.started) {
    return `${L("最近完成多于启动，项目正在收口。")} ${subject}`;
  }
  return `${L("推进保持流动，下一步优先处理高影响节点。")} ${subject}`;
}

function renderMomentumCadence(cadence: GoalMomentumCadence, bottleneck?: GoalMomentumNode): string {
  const maxValue = Math.max(
    1,
    ...cadence.buckets.map((bucket) => bucket.started + bucket.completed + bucket.blockers),
  );
  const buckets = cadence.buckets.map((bucket, index) => {
    const showLabel = cadence.days === 7 || index === 0 || index === cadence.buckets.length - 1 || index % 5 === 0;
    const startedHeight = Math.max(bucket.started ? 5 : 1, Math.round(bucket.started / maxValue * 54));
    const completedHeight = Math.max(bucket.completed ? 5 : 1, Math.round(bucket.completed / maxValue * 54));
    const blockerHeight = Math.max(bucket.blockers ? 5 : 1, Math.round(bucket.blockers / maxValue * 54));
    return `<span class="momentum-rail-day" data-momentum-day="${escapeHtml(bucket.date)}" title="${escapeHtml(`${bucket.date} · ${L("启动")} ${bucket.started} · ${L("完成")} ${bucket.completed} · ${L("新阻塞")} ${bucket.blockers}`)}"><i data-tone="started" style="--momentum-bar:${startedHeight}px"></i><i data-tone="completed" style="--momentum-bar:${completedHeight}px"></i><i data-tone="blocked" style="--momentum-bar:${blockerHeight}px"></i>${showLabel ? `<time datetime="${escapeHtml(bucket.date)}">${escapeHtml(bucket.date.slice(5))}</time>` : ""}</span>`;
  }).join("");
  return `<div class="momentum-cadence-panel" data-momentum-period-panel="${cadence.days}"${cadence.days === 7 ? "" : " hidden"}>
    <div class="momentum-cadence-copy">
      <p class="momentum-section-label">${L("推进节奏")}</p>
      <strong>${escapeHtml(momentumHeadline(cadence, bottleneck))}</strong>
      <p class="momentum-metrics"><span><b>${cadence.started}</b>${L("启动")}</span><span data-tone="good"><b>${cadence.completed}</b>${L("完成")}</span><span data-tone="bad"><b>${cadence.new_blockers}</b>${L("新阻塞")}</span><span data-tone="warn"><b>${cadence.stalled}</b>${L("停滞")}</span></p>
    </div>
    <div class="momentum-rail-wrap">
      <div class="momentum-rail-legend"><span data-tone="started"><i></i>${L("启动")}</span><span data-tone="completed"><i></i>${L("完成")}</span><span data-tone="blocked"><i></i>${L("新阻塞")}</span></div>
      <div class="momentum-rail" aria-label="${L("近 {days} 天 Goal 推进事件", { days: cadence.days })}">${buckets}</div>
      <p class="momentum-data-honesty">${icon("info")}<span>${cadence.history_incomplete > 0 ? L("{count} 个 Goal 历史不足，未计入停滞；所有数字均来自当前项目事件事实。", { count: cadence.history_incomplete }) : L("所有数字均来自当前项目事件事实；停滞只统计历史足够的 Goal。")}</span></p>
    </div>
  </div>`;
}

function momentumActionReason(
  action: GoalMomentumAction,
  byId: ReadonlyMap<string, WebGoalView>,
): string {
  const impact = action.downstream_open_count
    ? L("影响 {count} 个未完成下游", { count: action.downstream_open_count })
    : L("没有未完成下游");
  if (action.kind === "decide") return `${L("等待你的决定")} · ${impact}`;
  if (action.kind === "finish") return `${L("已进入执行或验收后段")} · ${impact}`;
  if (action.kind === "start_high_impact") return `${L("没有未满足前置")} · ${impact}`;
  if (action.kind === "start") return `${L("当前可以开始")} · ${impact}`;
  if (action.kind === "revive") return `${L("近 7 天没有推进活动")} · ${impact}`;
  const providers = action.unsatisfied_provider_goal_ids
    .map((goalId) => byId.get(goalId)?.goal.title ?? goalId)
    .join(currentLocale() === "en" ? ", " : "、");
  return providers ? L("仍在等待：{providers}", { providers }) : L("当前还不能直接开始");
}

function renderGoalMomentum(
  view: GoalBoardWebView,
  selectedGoalId: string,
  items: readonly WebGoalView[],
): string {
  const byId = new Map(items.map((item) => [item.goal.goal_id, item]));
  const momentum = buildGoalMomentumView(
    items.map((item) => ({
      goal_id: item.goal.goal_id,
      title: item.goal.title,
      status: item.status,
      work_state: item.work_state,
      display_status: item.display_status,
      priority: item.goal.priority,
      created_at: item.goal.created_at,
      updated_at: item.goal.updated_at,
      completed: item.goal.fulfillment_state === "satisfied" || item.work_state === "archived",
      acceptance_criteria_count: item.goal.acceptance_criteria.length,
      passed_criteria_count: item.passed_criteria.length,
      reasons: item.reasons.map((reason) => ({ code: reason.code })),
      runs: item.runs.map((run) => ({
        role: run.role,
        state: run.state,
        started_at: run.started_at,
        ended_at: run.ended_at,
      })),
      evidence: item.evidence.map((evidence) => ({ captured_at: evidence.captured_at })),
      reviews: item.reviews.map((review) => ({ submitted_at: review.submitted_at })),
      risks: item.risks.map((risk) => ({
        risk_id: risk.risk_id,
        state: risk.state,
        blocking_mode: risk.blocking_mode,
        created_at: risk.created_at,
        updated_at: risk.updated_at,
      })),
      events: item.events.map((event) => ({ type: event.type, at: event.at })),
    })),
    view.snapshot.relations,
    selectedGoalId,
  );
  const bottleneck = [...momentum.nodes]
    .filter((node) => !node.completed && node.downstream_open_count > 0 && (node.blocked || node.stale))
    .sort((left, right) => right.downstream_open_count - left.downstream_open_count || left.title.localeCompare(right.title))[0];
  const edges = momentum.edges.map((edge, edgeIndex) => {
    const provider = byId.get(edge.provider_goal_id)?.goal.title ?? edge.provider_goal_id;
    const consumer = byId.get(edge.consumer_goal_id)?.goal.title ?? edge.consumer_goal_id;
    return `<g class="momentum-edge" data-graph-edge data-edge-index="${edgeIndex}" data-edge-id="${escapeHtml(edge.relation_id)}" data-edge-from="${escapeHtml(edge.provider_goal_id)}" data-edge-to="${escapeHtml(edge.consumer_goal_id)}" data-edge-type="depends_on">
      <path marker-end="url(#momentum-arrow)"></path>
      <title>${escapeHtml(`${provider} → ${consumer} · ${edge.reason}`)}</title>
    </g>`;
  }).join("");
  const groupFirstRowById = new Map(
    momentum.groups.map((group) => [group.group_id, group.row_start]),
  );
  const nodes = momentum.nodes.map((node) => {
    const item = byId.get(node.goal_id)!;
    const selected = node.goal_id === momentum.selected_goal_id;
    const searchValue = `${node.goal_id} ${node.title} ${treeDependencySearchText(item, view)}`.toLowerCase();
    const flags = [
      node.blocked ? L("阻塞") : node.startable ? L("可开始") : "",
      node.downstream_open_count > 1 ? L("影响 {count} 个下游", { count: node.downstream_open_count }) : "",
      !node.history_sufficient ? L("历史不足") : node.stale ? L("近 7 天停滞") : "",
      node.work_state === "waiting_children" ? L("由子 Goal 推进") : "",
    ].filter(Boolean).join(" · ");
    const bottleneck = !node.completed && node.downstream_open_count > 0 && (node.blocked || node.stale);
    const startsGroup = groupFirstRowById.get(node.group_id) === node.row;
    return `<button class="momentum-node momentum-node--${escapeHtml(item.status)}${selected ? " is-selected" : ""}${node.completed ? " is-complete" : ""}${bottleneck ? " is-bottleneck" : ""}${startsGroup ? " is-group-first-row" : ""}" type="button" data-graph-node data-momentum-node data-goal-id="${escapeHtml(node.goal_id)}" data-momentum-group-id="${escapeHtml(node.group_id)}" data-goal-search="${escapeHtml(searchValue)}" data-goal-status="${escapeHtml(visibleGoalStatus(item))}" data-goal-completed="${node.completed}" aria-pressed="${selected}" style="--momentum-column:${node.level + 1};--momentum-row:${node.row + 1}">
      <span class="momentum-node-kicker"><b>L${node.level}</b>${renderVisibleGoalStatus(item)}</span>
      <strong>${escapeHtml(node.title)}</strong>
      <small>${escapeHtml(flags || node.goal_id)}</small>
    </button>`;
  }).join("");
  const levelHeaders = Array.from({ length: momentum.level_count }, (_, level) =>
    `<span class="momentum-level" style="--momentum-column:${level + 1}"><b>L${level}</b>${level === 0 ? L("无前置 / 基础输入") : L("第 {level} 层消费", { level })}</span>`
  ).join("");
  const groups = momentum.groups.map((group) => {
    const title = group.root_goal_id
      ? `<button type="button" data-momentum-select="${escapeHtml(group.root_goal_id)}">${escapeHtml(group.title)}</button>`
      : `<span>${escapeHtml(group.title)}</span>`;
    return `<div class="momentum-group" data-momentum-group="${escapeHtml(group.group_id)}" style="--momentum-column-start:${group.level_start + 1};--momentum-column-end:${group.level_end + 2};--momentum-row-start:${group.row_start + 1};--momentum-row-end:${group.row_end + 2}"><header>${title}<small>${L("{count} 个 Goal", { count: group.goal_count })}</small></header></div>`;
  }).join("");
  const queue = momentum.actions.map((action, index) => {
    const item = byId.get(action.goal_id)!;
    const selected = action.goal_id === momentum.selected_goal_id;
    return `<li><button type="button" class="momentum-queue-item${selected ? " is-selected" : ""}" data-momentum-select="${escapeHtml(action.goal_id)}" data-momentum-action-kind="${action.kind}" aria-pressed="${selected}"><b>${String(index + 1).padStart(2, "0")}</b><span><strong>${escapeHtml(item.goal.title)}</strong><small>${escapeHtml(momentumActionReason(action, byId))}</small></span>${renderVisibleGoalStatus(item)}</button></li>`;
  }).join("");
  const details = momentum.nodes.map((node) => {
    const item = byId.get(node.goal_id)!;
    const providers = node.unsatisfied_provider_goal_ids.map((goalId) => byId.get(goalId)?.goal.title ?? goalId);
    const currentReasons = item.reasons.filter((reason) => reason.severity === "blocker").map((reason) => reason.message);
    const facts = [
      providers.length ? L("仍在等待：{providers}", { providers: providers.join(currentLocale() === "en" ? ", " : "、") }) : L("没有未满足前置"),
      L("可触达 {count} 个未完成下游", { count: node.downstream_open_count }),
      node.history_sufficient ? node.stale ? L("近 7 天没有可追溯推进活动") : L("近 7 天有可追溯推进活动") : L("历史不足，不能判断是否停滞"),
      ...currentReasons,
    ];
    return `<article class="momentum-selection" data-momentum-detail="${escapeHtml(node.goal_id)}"${node.goal_id === momentum.selected_goal_id ? "" : " hidden"}>
      <p class="momentum-section-label">${L("当前选择")}</p>
      <div class="momentum-selection-title"><div><h3>${escapeHtml(item.goal.title)}</h3><small>${escapeHtml(item.goal.goal_id)}</small></div>${renderVisibleGoalStatus(item)}</div>
      <dl><div><dt>${L("拓扑层级")}</dt><dd>L${node.level}</dd></div><div><dt>${L("完成标准")}</dt><dd>${node.passed_criteria_count}/${node.acceptance_criteria_count}</dd></div><div><dt>${L("下游影响")}</dt><dd>${node.downstream_open_count}</dd></div></dl>
      <ul>${facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join("")}</ul>
      <a class="button-primary" href="/goals/${encodeURIComponent(node.goal_id)}">${L("打开 Goal")}${icon("arrow")}</a>
    </article>`;
  }).join("");
  const integrityCount = Object.values(momentum.integrity).reduce((count, values) => count + values.length, 0);
  const integrity = integrityCount
    ? `<p class="momentum-integrity">${icon("risk")}<span>${L("发现 {count} 处关系完整性问题；相关节点已保留并使用确定性降级布局。", { count: integrityCount })}</span></p>`
    : "";
  const empty = momentum.nodes.length === 0
    ? `<div class="momentum-empty">${icon("workflow")}<h2>${L("还没有可分析的 Goal")}</h2><p>${L("创建 Goal 并建立 depends_on 后，这里会显示完整推进拓扑和行动顺序。")}</p></div>`
    : "";
  return `<section class="goal-momentum" id="goal-momentum-pane" data-goal-momentum hidden aria-label="${L("Goal 推进态势")}">
    <header class="momentum-head">
      <div><h1>${L("先看推进是否流动，再决定现在做什么")}</h1><p>${L("时间变化、完整依赖拓扑和行动顺序共用同一份 GoalBoard 事实。")}</p></div>
      <div class="momentum-period-switch" role="group" aria-label="${L("时间窗口")}"><button class="is-active" type="button" data-momentum-period="7" aria-pressed="true">${L("近 7 天")}</button><button type="button" data-momentum-period="30" aria-pressed="false">${L("近 30 天")}</button></div>
    </header>
    <section class="momentum-cadence">${renderMomentumCadence(momentum.cadence[7], bottleneck)}${renderMomentumCadence(momentum.cadence[30], bottleneck)}</section>
    ${integrity}
    ${empty || `<div class="momentum-workbench">
      <section class="momentum-map-panel">
        <header class="momentum-panel-head"><div><h2>${L("完整 Goal 依赖拓扑")}</h2><p>${L("{goals} 个 Goal · {edges} 条 depends_on · 从提供者向消费者展开", { goals: momentum.nodes.length, edges: momentum.edges.length })}</p></div><div class="momentum-map-actions"><div class="momentum-map-filter" role="group" aria-label="${L("拓扑显示范围")}"><button class="is-active" type="button" data-momentum-filter="all" aria-pressed="true">${L("全部 {count}", { count: momentum.nodes.length })}</button><button type="button" data-momentum-filter="open" aria-pressed="false">${L("未完成 {count}", { count: momentum.nodes.filter((node) => !node.completed).length })}</button></div><div class="graph-zoom" role="group" aria-label="${L("拓扑缩放")}"><button type="button" data-graph-zoom="out" aria-label="${L("缩小")}">−</button><output data-graph-zoom-value>100%</output><button type="button" data-graph-zoom="in" aria-label="${L("放大")}">+</button><button type="button" data-graph-zoom="fit" aria-label="${L("适应宽度")}">${icon("maximize")}</button></div></div></header>
        <div class="graph-viewport momentum-map-scroll" data-graph-viewport tabindex="0" aria-label="${L("可缩放、拖动或使用键盘浏览的完整 Goal 依赖拓扑")}"><div class="graph-stage momentum-map" data-graph-stage data-graph-scale="1" style="--momentum-level-count:${Math.max(1, momentum.level_count)};--momentum-grid-rows:${Math.max(1, momentum.grid_rows + 1)}">${levelHeaders}${groups}<svg class="graph-edges momentum-edges" data-graph-edges aria-hidden="true"><defs><marker id="momentum-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z"></path></marker></defs>${edges}</svg>${nodes}</div></div>
        <footer class="momentum-legend"><span><i data-kind="dependency"></i>${L("depends_on：前置提供者 → 消费者")}</span><span><i data-kind="selected"></i>${L("当前选择的一阶依赖")}</span><span><i data-kind="group"></i>${L("分组带表达 part_of")}</span><small>${L("完成节点保留并弱化；瓶颈只是一种状态")}</small></footer>
      </section>
      <section class="momentum-queue-panel"><div class="momentum-queue-column"><header class="momentum-panel-head"><div><h2>${L("行动队列")}</h2><p>${L("排序只使用阻塞、推进阶段、前置与下游影响")}</p></div></header><ol class="momentum-queue-list">${queue}</ol></div><div class="momentum-selection-column">${details}</div></section>
    </div>`}
  </section>`;
}

export function renderGoalBoardMomentumFragment(
  view: GoalBoardWebView,
  selectedGoalId: string,
  collection: GoalDocumentCollection = "current",
): string | null {
  const items = collection === "trash"
    ? view.trashed_goals
    : collection === "archive"
      ? view.archived_goals
      : view.goals;
  if (collection === "trash") return null;
  return prefixLocalLinks(renderGoalMomentum(view, selectedGoalId, items), view.route_prefix);
}

function relationRow(
  relation: GoalRelationRecord,
  item: WebGoalView,
  view: GoalBoardWebView,
  editable = true,
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
  return `<div class="relation-record relation-record--${escapeHtml(relation.state)}" id="relation-${escapeHtml(relation.relation_id)}" data-relation-id="${escapeHtml(relation.relation_id)}">
    <button class="relation-row" type="button" data-select-goal="${escapeHtml(relatedId)}" aria-label="${L("打开")} ${escapeHtml(relatedName)}">
      <span class="relation-kind">${escapeHtml(outgoing ? labels.out : labels.in)}</span>
      <span class="relation-copy"><span class="relation-heading"><strong>${escapeHtml(relatedName)}</strong><small class="relation-goal-id">${escapeHtml(relatedId)}</small></span><small class="relation-path">${escapeHtml(path)}</small><small class="relation-reason">${L("建立原因：")}${escapeHtml(relation.reason)}${deactivated ? ` · ${L("解除原因：")}${escapeHtml(deactivated.reason)}` : ""}</small></span>
      <span class="relation-state relation-state--${escapeHtml(relation.state)}">${escapeHtml(stateLabel)}</span>
      ${icon("chevron-right")}
    </button>
    ${editable && relation.state === "active" && !item.goal.archived_at ? `<button class="relation-deactivate-open" type="button" data-relation-deactivate-open aria-expanded="false" aria-controls="${escapeHtml(deactivateId)}">${L("解除")}</button>` : ""}
    ${editable && relation.state === "active" && !item.goal.archived_at ? `<form class="relation-deactivate-form" id="${escapeHtml(deactivateId)}" data-relation-deactivate-form data-live-form="relation-deactivate-${escapeHtml(relation.relation_id)}" data-relation-id="${escapeHtml(relation.relation_id)}" hidden>
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
  editable = true,
): string {
  return `<section class="relation-group"><header><h3>${escapeHtml(L(title))} <span>${relations.length}</span></h3><p>${escapeHtml(L(hint))}</p></header><div>${
    relations.length
      ? relations.map((relation) => relationRow(relation, item, view, editable)).join("")
      : `<p class="empty-row">${L("暂无关系")}</p>`
  }</div></section>`;
}

function renderRelations(item: WebGoalView, view: GoalBoardWebView, editable = true): string {
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
    ${relationGroup("上游", "这个 Goal 开始前需要什么", upstream, item, view, editable)}
    ${relationGroup("下游", "哪些 Goal 等待或包含它", downstream, item, view, editable)}
    ${relationGroup("其他关联", "扩展、替代、修正或风险关系", other, item, view, editable)}
  </div>
  ${editable ? renderRelationEditor(item, view) : ""}
  ${inactive.length ? `<details class="relation-inactive-history" data-persist-open="inactive-relations-${escapeHtml(item.goal.goal_id)}"><summary><span>${icon("history")}<strong>${L("已解除关系")}</strong><small>${inactive.length} ${L("条，保留方向与变更原因")}</small></span>${icon("chevron-down")}</summary><div>${inactive.map((relation) => relationRow(relation, item, view, false)).join("")}</div></details>` : ""}
  ${renderResolvedDependencyHistory(item, view)}`;
}

function renderRelationForm(item: WebGoalView, view: GoalBoardWebView, variant: "full" | "quick"): string {
  if (item.goal.archived_at) return "";
  const targets = sortGoals(view.goals).filter(
    (candidate) => candidate.goal.goal_id !== item.goal.goal_id,
  );
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
    return `<option value="${escapeHtml(type)}"${type === "depends_on" ? " selected" : ""} data-out-label="${escapeHtml(L(labels.out))}" data-in-label="${escapeHtml(L(labels.in))}" data-description="${escapeHtml(L(description))}">${escapeHtml(L(label))}</option>`;
  }).join("");
  const firstTarget = targets[0]!.goal;
  return `<form class="relation-form${variant === "quick" ? " quick-record-form" : ""}" data-relation-form data-live-form="relation-${variant}-${escapeHtml(item.goal.goal_id)}" data-goal-id="${escapeHtml(item.goal.goal_id)}" data-current-goal-name="${escapeHtml(item.goal.title)}" novalidate>
      <div class="relation-authority"><span>${icon("shield")}</span><p><strong>${L("你正在直接修改 Goal 关系")}</strong><small>${L("保存后立即生效并进入历史。执行工具提出的关系变化仍会先进入")}<a href="/decisions">${L("待决定")}</a>${L("，由你确认后才生效。")}</small></p></div>
      <div class="relation-builder">
        <label><span>${L("这条关系表示什么")}</span><select name="relation_intent"><option value="needs">${L("当前 Goal 开始前需要它完成")}</option><option value="belongs">${L("当前 Goal 属于它")}</option><option value="enables">${L("它开始前需要当前 Goal 完成")}</option><option value="contains">${L("它属于当前 Goal")}</option><option value="other">${L("其他关系")}</option></select></label>
        <label><span>${L("另一个 Goal")}</span><select name="target_goal_id">${targetOptions}</select></label>
      </div>
      <div class="relation-live-preview" data-relation-live-preview><small>${L("保存后会形成")}</small><strong>${escapeHtml(item.goal.title)} <span>${L("→ 依赖 →")}</span> ${escapeHtml(firstTarget.title)}</strong><p>${L("另一个 Goal 完成前，当前 Goal 不能开始或完成")}</p></div>
      <label class="relation-reason-field"><span>${L("为什么需要这条关系")}</span><textarea name="reason" rows="3" required placeholder="${L("写清两条 Goal 为什么需要这样关联，方便之后判断关系是否仍然成立")}"></textarea></label>
      <details class="factor-advanced" data-progressive-fields>
        <summary><span><strong>${L("查看准确方向和关系类型")}</strong><small>${L("只有上面的常用选项不适用时才需要修改")}</small></span>${icon("chevron-down")}</summary>
        <div class="factor-advanced-grid">
          <label><span>${L("准确方向")}</span><select name="direction" required><option value="">${L("请选择方向")}</option><option value="outgoing" selected>${L("当前 Goal → 另一个 Goal")}</option><option value="incoming">${L("另一个 Goal → 当前 Goal")}</option></select></label>
          <label><span>${L("准确关系类型")}</span><select name="type" required><option value="">${L("请选择关系类型")}</option>${typeOptions}</select></label>
        </div>
      </details>
      <p class="form-error" data-relation-error role="alert" hidden></p>
      <footer><p>${L("提交后直接生效并写入事件历史；不会创建或启动 Runtime。")}</p><button class="button-primary" type="submit">${L("建立关系")}</button></footer>
    </form>`;
}

function renderRelationEditor(item: WebGoalView, view: GoalBoardWebView): string {
  const editorKey = `relation-editor-${item.goal.goal_id}`;
  const form = renderRelationForm(item, view, "full");
  if (!form || form.includes("relation-editor-empty")) return form;
  return `<details class="relation-editor" data-relation-editor data-persist-open="${escapeHtml(editorKey)}" data-live-form="${escapeHtml(editorKey)}">
    <summary><span class="relation-editor-icon">${icon("link")}</span><span><strong>${L("维护关系")}</strong><small>${L("新增关系，或在上方解除已有关系")}</small></span><span class="relation-editor-action">${L("打开编辑器")}</span>${icon("chevron-down")}</summary>
    ${form}
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
  const current = item.active_claim?.claim_id === run.claim_id &&
    (run.state === "started" || run.state === "blocked");
  return `<dl class="runtime-facts"><div><dt>Run</dt><dd>${escapeHtml(run.run_id)}</dd></div><div><dt>${L("状态")}</dt><dd>${escapeHtml(run.state)}</dd></div><div><dt>${L("开始")}</dt><dd>${formatDate(run.started_at)}</dd></div>${
    run.block_reason
      ? `<div><dt>${current ? L("当前阻塞") : L("当时报告的阻塞")}</dt><dd>${escapeHtml(run.block_reason)}${current ? "" : `<small>${L("这条历史记录不会自动成为当前阻塞。")}</small>`}</dd></div>`
      : ""
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
  const lifecycleLabel = evidence.lifecycle_state === "superseded"
    ? L("已被替代")
    : evidence.lifecycle_state === "retracted"
      ? L("已撤销")
      : L("当前有效");
  const locatorLabel = evidence.locator_status === "verified" ? L("已验证") : "UNVERIFIED";
  const correctionDetail = evidence.correction
    ? `<small class="evidence-correction">${evidence.correction.action === "supersede" && evidence.correction.replacement_evidence_id
      ? L("替代记录：{id}", { id: evidence.correction.replacement_evidence_id })
      : L("这条记录不再计入完成判断")}${evidence.correction.reason ? ` · ${escapeHtml(evidence.correction.reason)}` : ""}</small>`
    : "";
  const locatorReference = evidence.locator_status === "unverified" && isProjectReference(evidence.locator)
    ? `<button class="inline-ref" type="button" data-copy-value="${escapeHtml(evidence.locator)}" title="${L("复制引用")}">${icon("copy")}<span>${escapeHtml(evidence.locator)}</span></button>`
    : renderReference(evidence.locator, evidence.locator, evidence.evidence_id);
  return `<article class="evidence-record evidence-record--${evidence.lifecycle_state}">
    <span class="evidence-result evidence-result--${evidence.result}">${icon(evidenceResultIcon(evidence.result))}</span>
    <div><header><strong>${escapeHtml(L(EVIDENCE_KIND_LABELS[evidence.kind]))} · ${escapeHtml(L(EVIDENCE_RESULT_LABELS[evidence.result]))}</strong><span class="evidence-lifecycle evidence-lifecycle--${evidence.lifecycle_state}">${escapeHtml(lifecycleLabel)}</span><span class="evidence-locator-status evidence-locator-status--${evidence.locator_status}">${escapeHtml(locatorLabel)}</span><button class="record-id" type="button" data-copy-value="${escapeHtml(evidence.evidence_id)}" title="${L("复制 Evidence ID")}">${escapeHtml(evidence.evidence_id)}</button></header>${locatorReference}<small>${escapeHtml(evidence.producer_actor_id)} · ${formatDate(evidence.captured_at)} · ${escapeHtml(evidence.criterion_ids.join(currentLocale() === "en" ? ", " : "、") || L("未绑定验收项"))}</small><small class="evidence-locator-reason">${escapeHtml(L(evidence.locator_validation_reason))}</small>${evidence.digest ? `<p>${escapeHtml(evidence.digest)}</p>` : ""}${correctionDetail}</div>
  </article>`;
}

function renderEvidenceForm(item: WebGoalView, variant: "full" | "quick"): string {
  const criteria = item.goal.acceptance_criteria;
  if (item.goal.archived_at || item.goal.trashed_at) return "";
  if (!criteria.length) {
    return `<p class="evidence-submit-note">${L("这条 Goal 还没有完成标准，暂时不能添加完成依据。请先补全并确认目标说明。")}</p>`;
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
  return `<form class="${variant === "quick" ? "quick-record-form" : ""}" data-evidence-form data-live-form="evidence-${variant}-${escapeHtml(item.goal.goal_id)}" data-goal-id="${escapeHtml(item.goal.goal_id)}" data-action-token="${escapeHtml(item.action_projection.action_token)}" data-contract-revision="${item.goal.current_contract_revision}">
      <fieldset class="evidence-criteria"><legend>${L("对应哪条完成标准")}</legend><div>${criterionChoices}</div></fieldset>
      <div class="evidence-form-row"><label><span>${L("依据是什么")}</span><select name="kind">${kindChoices}</select></label><label><span>${L("这份依据说明什么")}</span><select name="result">${resultChoices}</select></label></div>
      <label><span>${L("依据位置")}</span><textarea name="locator" rows="2" required placeholder="${L("填写链接、项目内文件路径或可复核的文字说明")}"></textarea><small>${L("链接和安全的项目内路径可以直接打开；其他内容会保留为可复制文本。")}</small></label>
      <label><span>${L("补充说明 ")}<small>${L("可选")}</small></span><textarea name="digest" rows="2" placeholder="${L("说明观察到的事实、版本或可复核线索")}"></textarea></label>
      <p class="form-error" data-evidence-error role="alert" hidden></p>
      <footer><span>${L("保存后，这份内容会作为当前 Goal 的完成依据参与判断。")}</span><button class="button-primary" type="submit">${L("保存完成依据")}</button></footer>
    </form>`;
}

function renderEvidenceSubmitForm(item: WebGoalView): string {
  const form = renderEvidenceForm(item, "full");
  if (!form || form.startsWith('<p class="evidence-submit-note"')) return form;
  return `<details class="evidence-submit" data-persist-open="evidence-submit-${escapeHtml(item.goal.goal_id)}"><summary><span>${icon("evidence")}<strong>${L("补充完成依据")}</strong><small>${L("记录可复核的测试、检查结果或产物")}</small></span>${icon("chevron-down")}</summary>
    ${form}
  </details>`;
}

function renderEvidenceCell(item: WebGoalView, editable = true): string {
  const records = item.evidence.length
    ? `<div class="evidence-list">${item.evidence.slice().reverse().map(renderEvidenceRecord).join("")}</div>`
    : `<p class="empty-row">${L("尚未提交验收证据")}</p>`;
  return `${records}${editable ? renderEvidenceSubmitForm(item) : ""}`;
}

function renderReviewCell(item: WebGoalView): string {
  if (!item.review_obligations.length) return `<p class="empty-row">${L("当前工作规则不要求额外检查")}</p>`;
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
  const passedCriteria = new Set(displayedPassedCriterionIds(item));
  return `<ul class="check-list">${item.goal.acceptance_criteria
    .map((criterion) => {
      const passed = passedCriteria.has(criterion.criterion_id);
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
  open: "待处理",
  triggered: "已发生",
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
  if (blockingMode === "claim") return L("当前会阻止新的执行工具领取所有关联 Goal。");
  if (blockingMode === "completion") return L("当前会阻止所有关联 Goal 被标记为完成。");
  if (blockingMode === "invalidate_on_trigger") {
    return state === "triggered"
      ? L("风险已发生，所有关联 Goal 立即失效。")
      : L("风险仍待处理；一旦标记为已经发生，所有关联 Goal 会失效。");
  }
  return L("这是一条持续观察的事实，不直接阻塞领取或完成。");
}

function riskSelectOptions<T extends string>(
  values: Array<[T, string]>,
  selected: T | null,
  placeholder?: string,
): string {
  const options = values
    .map(([value, label]) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(L(label))}</option>`)
    .join("");
  return placeholder
    ? `<option value="" disabled${selected == null ? " selected" : ""}>${escapeHtml(L(placeholder))}</option>${options}`
    : options;
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
  const treatment = risk?.treatment ?? null;
  const blockingMode = risk?.blocking_mode ?? null;
  const formKey = risk?.risk_id ?? `new-${currentGoalId}`;
  return `<label class="risk-form-wide"><span>${L("可能发生什么")}</span><textarea name="description" rows="2" required placeholder="${L("用一句话写清可能出现的问题")}">${escapeHtml(risk?.description ?? "")}</textarea></label>
    <label class="risk-form-wide"><span>${L("会造成什么影响")}</span><textarea name="impact" rows="2" required placeholder="${L("例如：无法按时完成、结果不可信或会影响其他 Goal")}">${escapeHtml(risk?.impact ?? "")}</textarea></label>
    <details class="factor-advanced risk-form-wide" data-progressive-fields>
      <summary><span><strong>${L("补充判断、处理与责任")}</strong><small>${L("保存前还需要说明触发与复查条件，并选择负责人和它是否阻塞 Goal")}</small></span>${icon("chevron-down")}</summary>
      <div class="factor-advanced-grid">
        <label class="risk-form-wide"><span>${L("什么时候算已经发生")}</span><textarea name="trigger" rows="2" required placeholder="${L("写一个可以观察到的触发条件")}">${escapeHtml(risk?.trigger ?? "")}</textarea></label>
        <label class="risk-form-wide"><span>${L("什么时候重新判断")}</span><textarea name="revisit_condition" rows="2" required placeholder="${L("例如：方案确认后、开始执行前或某个结果出现时")}">${escapeHtml(risk?.revisit_condition ?? "")}</textarea></label>
        <label><span>${L("发生概率")}</span><input name="probability" required value="${escapeHtml(risk?.probability ?? "")}" placeholder="${L("低 / 中 / 高，或量化概率")}"></label>
        <label><span>${L("负责人")}</span><input name="owner" required value="${escapeHtml(risk?.owner ?? "")}" placeholder="${L("谁负责持续关注或处理")}"></label>
        <label><span>${L("准备怎么处理")}</span><select name="treatment" required>${riskSelectOptions([["mitigate", "降低发生概率或影响"], ["avoid", "改变方案以避开"], ["defer", "延后处理并继续观察"], ["accept", "接受风险"]], treatment, "请选择处理方式")}</select></label>
        <label><span>${L("它会阻止什么")}</span><select name="blocking_mode" data-risk-blocking-mode required>${riskSelectOptions([["none", "不直接阻塞"], ["claim", "阻止开始执行"], ["completion", "阻止标记完成"], ["invalidate_on_trigger", "发生后使 Goal 失效"]], blockingMode, "请选择对 Goal 的影响")}</select></label>
        <label class="risk-form-wide"><span>${L("具体准备怎么做")} <small>${L("可选")}</small></span><textarea name="treatment_plan" rows="3" placeholder="${L("例如：先限制导入范围，让用户逐条确认，再允许同步到其他执行工具")}">${escapeHtml(risk?.treatment_plan ?? "")}</textarea></label>
        <label class="risk-form-wide"><span>${L("受影响区域 ")}<small>${L("可选，每行一项")}</small></span><textarea name="affected_surfaces" rows="2" placeholder="${L("可以是流程、文档、系统、团队或代码区域")}">${escapeHtml(risk?.affected_surfaces.join("\n") ?? "")}</textarea></label>
        ${renderRiskGoalPicker(view, risk?.goal_ids ?? [currentGoalId], risk?.description ?? L("新风险"), `risk-goals-${formKey}`)}
      </div>
    </details>`;
}

function renderRiskGoalLinks(risk: WebRiskRecord, view: GoalBoardWebView): string {
  const goals = risk.goal_ids
    .map((goalId) => [...view.goals, ...view.archived_goals].find((item) => item.goal.goal_id === goalId))
    .filter((item): item is WebGoalView => Boolean(item));
  return goals.length
    ? `<div class="risk-linked-goals">${goals.map((item) => `<a href="${item.goal.archived_at ? "/archive/goals/" : "/goals/"}${encodeURIComponent(item.goal.goal_id)}"><strong>${escapeHtml(item.goal.title)}</strong><small>${escapeHtml(item.goal.goal_id)}</small></a>`).join("")}</div>`
    : '<span class="empty-row">未关联 Goal</span>';
}

function renderRiskRecord(
  risk: WebRiskRecord,
  item: WebGoalView,
  view: GoalBoardWebView,
  readOnly = Boolean(item.goal.archived_at),
  idPrefix = "risk",
): string {
  const resolutionBasis = risk.state === "resolved"
    ? risk.resolution_basis == null
      ? `<div class="risk-resolution risk-resolution--unrecorded"><strong>${L("解决依据")}</strong><p>${L("未记录解决依据（历史数据）；这条状态不会被自动改写。")}</p></div>`
      : `<div class="risk-resolution"><strong>${L("解决依据")}</strong><p>${escapeHtml(risk.resolution_basis.summary)}</p><dl><div><dt>${L("证据引用")}</dt><dd>${risk.resolution_basis.evidence_refs.map((reference) => renderReference(reference)).join("")}</dd></div><div><dt>${L("剩余缺口")}</dt><dd>${risk.resolution_basis.residual_gaps.length ? renderList(risk.resolution_basis.residual_gaps, "") : L("没有已知剩余缺口")}</dd></div></dl></div>`
    : "";
  return `<article class="risk-record" id="${escapeHtml(idPrefix)}-${escapeHtml(risk.risk_id)}">
    <header><span class="risk-record-icon">${icon("risk")}</span><div><span class="risk-state risk-state--${escapeHtml(risk.state)}">${escapeHtml(L(RISK_STATE_LABELS[risk.state]))}</span><h4>${escapeHtml(risk.description)}</h4><small>${escapeHtml(risk.risk_id)} · 更新于 ${formatDate(risk.updated_at)}</small></div></header>
    <dl class="risk-facts">
      <div><dt>${L("概率 / 影响")}</dt><dd>${escapeHtml(risk.probability)} / ${escapeHtml(risk.impact)}</dd></div>
      <div><dt>${L("处理方式 / 对 Goal 的影响")}</dt><dd>${escapeHtml(L(RISK_TREATMENT_LABELS[risk.treatment]))} / ${escapeHtml(L(RISK_BLOCKING_LABELS[risk.blocking_mode]))}</dd></div>
      ${risk.treatment_plan ? `<div class="risk-fact-wide"><dt>${L("具体措施")}</dt><dd>${escapeHtml(risk.treatment_plan)}</dd></div>` : ""}
      <div class="risk-fact-wide"><dt>${L("触发条件")}</dt><dd>${escapeHtml(risk.trigger)}</dd></div>
      <div class="risk-fact-wide"><dt>${L("复查条件")}</dt><dd>${escapeHtml(risk.revisit_condition)}</dd></div>
      <div><dt>${L("负责人")}</dt><dd>${escapeHtml(risk.owner)}</dd></div>
      <div><dt>${L("受影响区域")}</dt><dd>${risk.affected_surfaces.length ? escapeHtml(risk.affected_surfaces.join(currentLocale() === "en" ? ", " : "、")) : "未单独标记"}</dd></div>
      <div class="risk-fact-wide"><dt>${L("受影响 Goal")}</dt><dd>${renderRiskGoalLinks(risk, view)}</dd></div>
    </dl>
    ${resolutionBasis}
    <p class="risk-effect risk-effect--${escapeHtml(risk.state)}">${icon(risk.state === "triggered" ? "blocked" : "info")}<span><strong>${L("当前影响")}</strong>${escapeHtml(riskStateEffect(risk.blocking_mode, risk.state))}</span></p>
    ${readOnly ? `<p class="risk-readonly">${L("这是一条只读记录；请到“关联与约束 → 风险”修改当前事实。")}</p>` : `<div class="risk-actions">
      <details data-persist-open="risk-edit-${escapeHtml(risk.risk_id)}"><summary><span>${icon("settings")}<strong>${L("修改风险信息")}</strong></span>${icon("chevron-down")}</summary>
        <form class="risk-form" data-risk-edit-form data-live-form="risk-edit-${escapeHtml(risk.risk_id)}" data-risk-id="${escapeHtml(risk.risk_id)}" novalidate>
          ${renderRiskFactsForm(risk, item.goal.goal_id, view)}
          <label class="risk-form-wide"><span>${L("修改原因")}</span><textarea name="reason" rows="2" required placeholder="${L("为什么需要更新这项风险或它关联的 Goal")}"></textarea></label>
          <p class="form-error risk-form-wide" data-risk-error role="alert" hidden></p>
          <footer class="risk-form-wide"><span>${L("修改风险事实不会同时改变处理状态。")}</span><button class="button-primary" type="submit">${L("保存风险信息")}</button></footer>
        </form>
      </details>
      ${riskHasUserAction(risk, view) ? `<a class="risk-decision-link" href="/decisions#decision-goal-${encodeURIComponent(item.goal.goal_id)}">${icon("user")}<span><strong>${L("去待决定处理这个风险")}</strong><small>${L("只有必须由你接受或拒绝的风险才会出现在待决定中。")}</small></span>${icon("chevron-right")}</a>` : ""}
    </div>`}
  </article>`;
}

const IMPACT_ACCESS_LABELS: Record<ImpactBindingRecord["access"], string> = {
  read: "只读取",
  write: "会修改",
  decide: "会作出决定",
  exclusive: "执行时独占",
};

const IMPACT_STATE_LABELS: Record<ImpactBindingRecord["state"], string> = {
  proposed: "提议中",
  confirmed: "已确认",
  inactive: "已停用",
};

function impactStateEffect(impact: ImpactBindingRecord): string {
  if (impact.state === "inactive") return L("这条记录只作为历史保留，不再参与工作冲突判断。");
  if (impact.state === "proposed") return L("这条记录尚未确认，不会阻止其他工作开始。");
  if (impact.access === "exclusive") return L("当前 Goal 独占该区域；其他正在进行的 Goal 不能同时读取、修改或作出决定。");
  if (impact.access === "decide") return L("当前 Goal 会在该区域作出决定；其他正在进行的 Goal 如果也读取、修改或决策，会发生冲突。");
  if (impact.access === "write") return L("当前 Goal 会写入该区域；其他写入会冲突，读取方必须固定输入快照。");
  return impact.input_snapshot
    ? L("当前 Goal 只读取该区域，并已固定输入快照，可与写入方并行推进。")
    : L("当前 Goal 只读取该区域，但未固定输入版本；同一区域正在进行的修改会阻止领取。");
}

function renderImpactFactsForm(
  impact: ImpactBindingRecord | null,
  goalId: string,
): string {
  const access = impact?.access ?? null;
  const state = impact == null ? null : impact.state === "proposed" ? "proposed" : "confirmed";
  return `<input type="hidden" name="goal_id" value="${escapeHtml(goalId)}">
    <label class="impact-form-wide"><span>${L("会影响哪里")}</span><input name="surface" required value="${escapeHtml(impact?.surface ?? "")}" placeholder="${L("可以是流程、文档、系统、团队、数据或代码区域")}"></label>
    <label class="impact-form-wide"><span>${L("为什么会影响这里")}</span><textarea name="reason" rows="2" required placeholder="${L("说明这条 Goal 会在这里做什么，以及为什么需要记录")}">${escapeHtml(impact?.reason ?? "")}</textarea></label>
    <details class="factor-advanced impact-form-wide" data-progressive-fields>
      <summary><span><strong>${L("补充影响方式")}</strong><small>${L("保存前需要明确会读取、修改、决策还是独占")}</small></span>${icon("chevron-down")}</summary>
      <div class="factor-advanced-grid">
        <label><span>${L("会怎么影响")}</span><select name="access" required>${riskSelectOptions([["read", "只读取或参考"], ["write", "会修改内容"], ["decide", "会在这里作出决定"], ["exclusive", "执行期间需要独占"]], access, "请选择影响方式")}</select></label>
        <label><span>${L("这条记录是否已确认")}</span><select name="state" required>${riskSelectOptions([["confirmed", "已确认，立即参与冲突判断"], ["proposed", "暂未确认，只保留记录"]], state, "请选择记录状态")}</select></label>
        <label class="impact-form-wide"><span>${L("固定的输入版本 ")}<small>${L("可选；只读取时可用文件版本或事实引用固定输入")}</small></span><input name="input_snapshot" value="${escapeHtml(impact?.input_snapshot ?? "")}" placeholder="${L("例如 commit://abc123、文档版本或 Goal 引用")}"></label>
      </div>
    </details>`;
}

function renderImpactRecord(
  impact: ImpactBindingRecord,
  item: WebGoalView,
  readOnly = Boolean(item.goal.archived_at),
  idPrefix = "impact",
): string {
  const inactive = impact.state === "inactive";
  return `<article class="impact-record${inactive ? " impact-record--inactive" : ""}" id="${escapeHtml(idPrefix)}-${escapeHtml(impact.binding_id)}">
    <header><span class="impact-record-icon">${icon("impact")}</span><div><span class="impact-access impact-access--${escapeHtml(impact.access)}">${escapeHtml(L(IMPACT_ACCESS_LABELS[impact.access]))}</span><h4>${escapeHtml(impact.surface)}</h4><small>${escapeHtml(impact.binding_id)} · ${inactive ? `停用于 ${formatDate(impact.deactivated_at ?? impact.updated_at)}` : `更新于 ${formatDate(impact.updated_at)}`}</small></div><span class="impact-state impact-state--${escapeHtml(impact.state)}">${escapeHtml(L(IMPACT_STATE_LABELS[impact.state]))}</span></header>
    <dl class="impact-facts">
      <div><dt>${L("访问 / 状态")}</dt><dd>${escapeHtml(L(IMPACT_ACCESS_LABELS[impact.access]))} / ${escapeHtml(L(IMPACT_STATE_LABELS[impact.state]))}</dd></div>
      <div><dt>${L("创建者")}</dt><dd>${escapeHtml(impact.created_by)} · ${formatDate(impact.created_at)}</dd></div>
      <div class="impact-fact-wide"><dt>${L("输入快照")}</dt><dd>${impact.input_snapshot ? renderReference(impact.input_snapshot, "输入快照") : "未固定"}</dd></div>
      <div class="impact-fact-wide"><dt>${L("绑定理由")}</dt><dd>${escapeHtml(impact.reason)}</dd></div>
      ${inactive ? `<div class="impact-fact-wide"><dt>停用原因</dt><dd>${escapeHtml(impact.deactivation_reason ?? L("未记录"))}</dd></div>` : ""}
    </dl>
    <p class="impact-effect impact-effect--${escapeHtml(impact.state)}">${icon(inactive ? "history" : "info")}<span><strong>${L("当前影响")}</strong>${escapeHtml(impactStateEffect(impact))}</span></p>
    ${readOnly || inactive ? (readOnly && !inactive ? `<p class="impact-readonly">${L("这是一条只读记录；请到“关联与约束 → 影响范围”修改当前事实。")}</p>` : "") : `<div class="impact-actions">
      <details data-persist-open="impact-edit-${escapeHtml(impact.binding_id)}"><summary><span>${icon("settings")}<strong>${L("修改影响范围")}</strong></span>${icon("chevron-down")}</summary>
        <form class="impact-form" data-impact-edit-form data-live-form="impact-edit-${escapeHtml(impact.binding_id)}" data-impact-id="${escapeHtml(impact.binding_id)}" novalidate>
          ${renderImpactFactsForm(impact, item.goal.goal_id)}
          <label class="impact-form-wide"><span>${L("修改说明")}</span><textarea name="audit_reason" rows="2" required placeholder="${L("为什么需要更新影响区域、访问方式或状态")}"></textarea></label>
          <p class="form-error impact-form-wide" data-impact-error role="alert" hidden></p>
          <footer class="impact-form-wide"><span>${L("修改会进入变更历史；已停用记录不会原地恢复。")}</span><button class="button-primary" type="submit">${L("保存影响范围")}</button></footer>
        </form>
      </details>
      <details class="impact-deactivate" data-persist-open="impact-deactivate-${escapeHtml(impact.binding_id)}"><summary><span>${icon("archive")}<strong>${L("停用这条记录")}</strong></span>${icon("chevron-down")}</summary>
        <form data-impact-deactivate-form data-live-form="impact-deactivate-${escapeHtml(impact.binding_id)}" data-impact-id="${escapeHtml(impact.binding_id)}">
          <p>${L("停用后不再参与工作冲突判断，但原记录和停用原因会保留在历史中。")}</p>
          <label><span>${L("停用原因")}</span><textarea name="reason" rows="2" required placeholder="${L("说明这条影响范围为什么不再有效")}"></textarea></label>
          <p class="form-error" data-impact-error role="alert" hidden></p>
          <footer><button class="danger-confirm" type="submit">${L("确认停用")}</button></footer>
        </form>
      </details>
    </div>`}
  </article>`;
}

function renderRiskWorkbench(item: WebGoalView, view: GoalBoardWebView, editable = true, showHeading = true): string {
  const canEdit = editable && !item.goal.archived_at;
  return `<section class="risk-register">${showHeading ? `<header class="safety-subheading"><div><h3>${L("风险")}</h3><p>${L("记录可能影响推进或完成的情况，并说明什么时候需要重新判断。")}</p></div><span>${L("{count} 项", { count: item.risks.length })}</span></header>` : ""}
      ${item.risks.length ? `<div class="risk-list">${item.risks.map((risk) => renderRiskRecord(risk, item, view, !canEdit, editable ? "risk" : "record-risk")).join("")}</div>` : `<p class="risk-empty">${L("当前没有已记录的风险。只有确实需要观察、处理或阻止完成的情况才需要添加。")}</p>`}
      ${canEdit ? `<details class="risk-create" data-persist-open="risk-create-${escapeHtml(item.goal.goal_id)}"><summary><span class="risk-record-icon">${icon("plus")}</span><span><strong>${L("记录风险")}</strong><small>${L("先写清可能发生什么，再设置它如何影响 Goal")}</small></span>${icon("chevron-down")}</summary>
        <form class="risk-form" data-risk-create-form data-live-form="risk-create-${escapeHtml(item.goal.goal_id)}" data-goal-id="${escapeHtml(item.goal.goal_id)}" novalidate>
          ${renderRiskFactsForm(null, item.goal.goal_id, view)}
          <label class="risk-form-wide"><span>${L("登记原因")}</span><textarea name="reason" rows="2" required placeholder="${L("为什么现在需要记录这项风险")}"></textarea></label>
          <p class="form-error risk-form-wide" data-risk-error role="alert" hidden></p>
          <footer class="risk-form-wide"><span>${L("新风险默认处于“开放”状态。")}</span><button class="button-primary" type="submit">${L("记录风险")}</button></footer>
        </form>
      </details>` : ""}
    </section>`;
}

function renderImpactWorkbench(item: WebGoalView, editable = true, showHeading = true): string {
  const canEdit = editable && !item.goal.archived_at;
  const activeImpacts = item.impacts.filter((impact) => impact.state !== "inactive");
  const inactiveImpacts = item.impacts.filter((impact) => impact.state === "inactive");
  return `<section class="impact-register">${showHeading ? `<header class="safety-subheading"><div><h3>${L("影响范围")}</h3><p>${L("说明这条 Goal 会读取、修改或决定哪些区域，以及是否会和其他工作冲突。")}</p></div><span>${L("{count} 项生效", { count: activeImpacts.length })}${inactiveImpacts.length ? ` · ${L("{count} 项历史", { count: inactiveImpacts.length })}` : ""}</span></header>` : ""}
      <div class="impact-ledger">
      ${activeImpacts.length ? `<div class="impact-list">${activeImpacts.map((impact) => renderImpactRecord(impact, item, !canEdit, editable ? "impact" : "record-impact")).join("")}</div>` : `<p class="impact-empty">${L("当前没有已记录的影响范围。需要协调多人、多 Goal 或共享资源时再添加。")}</p>`}
      ${canEdit ? `<details class="impact-create" data-persist-open="impact-create-${escapeHtml(item.goal.goal_id)}"><summary><span class="impact-record-icon">${icon("plus")}</span><span><strong>${L("记录影响范围")}</strong><small>${L("说明影响哪里、会做什么以及为什么")}</small></span>${icon("chevron-down")}</summary>
        <form class="impact-form" data-impact-create-form data-live-form="impact-create-${escapeHtml(item.goal.goal_id)}" data-goal-id="${escapeHtml(item.goal.goal_id)}" novalidate>
          ${renderImpactFactsForm(null, item.goal.goal_id)}
          <p class="form-error impact-form-wide" data-impact-error role="alert" hidden></p>
          <footer class="impact-form-wide"><span>${L("已确认的影响范围会参与并行工作冲突判断。")}</span><button class="button-primary" type="submit">${L("记录影响范围")}</button></footer>
        </form>
      </details>` : ""}
      ${inactiveImpacts.length ? `<details class="impact-history" data-persist-open="impact-history-${escapeHtml(item.goal.goal_id)}"><summary><span>${icon("history")}<strong>${L("已停用记录")}</strong><small>${inactiveImpacts.length} ${L("条 · 仍可查看原事实和停用原因")}</small></span>${icon("chevron-down")}</summary><div class="impact-list">${inactiveImpacts.map((impact) => renderImpactRecord(impact, item, true, editable ? "impact" : "record-impact")).join("")}</div></details>` : ""}
      </div>
    </section>`;
}

function renderSafety(item: WebGoalView, view: GoalBoardWebView, editable = true): string {
  return `<div class="safety-workbench" id="risk-workbench-${escapeHtml(item.goal.goal_id)}">
    ${renderRiskWorkbench(item, view, editable)}
    ${renderImpactWorkbench(item, editable)}
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
  disabled: { label: "不要求", description: "执行工具可以按普通会话工作" },
  preferred: { label: "建议使用", description: "提醒执行工具按当前 Goal 的边界工作" },
  required: { label: "必须使用", description: "未声明按 Goal 工作时不能开始" },
};

const GOAL_MODE_STRENGTH: Record<GoalPolicy["goal_mode"], number> = {
  disabled: 0,
  preferred: 1,
  required: 2,
};

function renderGoalModeChoices(
  selected: GoalPolicy["goal_mode"],
  minimum?: GoalPolicy["goal_mode"],
): string {
  return `<div class="policy-mode-options">${(
    Object.entries(GOAL_MODE_COPY) as Array<
      [GoalPolicy["goal_mode"], { label: string; description: string }]
    >
  )
    .map(
      ([value, copy]) => {
        const locked = minimum != null && GOAL_MODE_STRENGTH[value] < GOAL_MODE_STRENGTH[minimum];
        return `<label><input type="radio" name="goal_mode" value="${value}"${selected === value ? " checked" : ""}${locked ? " disabled" : ""}><span><strong>${L(copy.label)}</strong><small>${locked ? L("低于项目共同规则，不能选择") : L(copy.description)}</small></span></label>`;
      },
    )
    .join("")}</div>`;
}

function renderPolicyToggle(
  name: "self_verification" | "human_approval",
  checked: boolean,
  title: string,
  description: string,
  locked = false,
): string {
  return `<label class="policy-toggle"><input type="checkbox" name="${name}"${checked ? " checked" : ""}${locked ? " disabled" : ""}><span class="policy-switch" aria-hidden="true"></span><span class="policy-toggle-copy"><strong>${L(title)}</strong><small>${locked ? L("项目共同规则已要求，当前 Goal 不能关闭") : L(description)}</small></span></label>`;
}

function renderPolicyCounter(
  name: "cross_reviewers" | "adversarial_reviewers",
  value: number,
  title: string,
  description: string,
  minimum = 0,
): string {
  const minimumCopy = minimum > 0 ? L("项目共同规则至少要求 {count} 人", { count: minimum }) : L(description);
  return `<label class="policy-counter"><span><strong>${L(title)}</strong><small>${minimumCopy}</small></span><span class="policy-counter-input"><input name="${name}" type="number" min="${minimum}" step="1" value="${value}"${minimum > 0 ? ` data-policy-min="${minimum}"` : ""} aria-label="${L(title + "人数")}"><span>${L("人")}</span></span></label>`;
}

function policyLeaseDescription(seconds: number): string {
  if (seconds % 3600 === 0) return L("约 {hours} 小时", { hours: seconds / 3600 });
  if (seconds % 60 === 0) return L("约 {minutes} 分钟", { minutes: seconds / 60 });
  return L("到期后其他执行工具可以重新领取");
}

function renderPolicyForm(
  item: WebGoalView | null,
  scope: "project_default" | "goal",
  policy: GoalPolicy,
  binding: WebPolicyBinding | undefined,
  contextKey = item?.goal.goal_id ?? "project",
  openByDefault = scope === "goal",
  minimumPolicy?: GoalPolicy,
): string {
  const goalScope = scope === "goal";
  if (goalScope && !item) throw new Error("Goal 规则表单必须绑定 Goal");
  const goalId = item?.goal.goal_id ?? "";
  const scopeLabel = goalScope
    ? binding
      ? L("当前 Goal 额外规则")
      : L("为当前 Goal 增加要求")
    : L("项目默认规则");
  const description = goalScope
    ? binding
      ? L("只作用于当前 Goal；可以继续增加要求，但不能削弱项目共同规则。")
      : L("当前完全沿用项目规则；只有需要更严格时才在这里增加要求。")
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
  const additionalCapabilities = goalScope && minimumPolicy
    ? (binding?.policy.required_capabilities ?? []).filter((capability) => !minimumPolicy.required_capabilities.includes(capability))
    : policy.required_capabilities;
  const capabilityHelp = goalScope
    ? minimumPolicy?.required_capabilities.length
      ? L("项目已要求：{list}。这里只填写当前 Goal 额外需要的能力。", { list: minimumPolicy.required_capabilities.join("、") })
      : L("这里只填写当前 Goal 额外需要的能力；没有可以留空。")
    : L("所有能力都满足后才能开始；用逗号分隔。");
  return `<details class="policy-source policy-source--${goalScope ? "goal" : "project"}"${openByDefault ? " open" : ""}>
    <summary><span class="policy-source-title"><span class="policy-scope-index">${goalScope ? "02" : "01"}</span><span><small>${goalScope ? "GOAL OVERRIDE" : "PROJECT DEFAULT"}</small><strong>${scopeLabel}</strong><span>${escapeHtml(description)}</span></span></span><span class="policy-source-state"><strong>${escapeHtml(scopeState)}</strong><small>${escapeHtml(saved)}</small>${icon("chevron-down")}</span></summary>
    <form class="policy-form" data-policy-form data-live-form="policy-${escapeHtml(scope)}-${escapeHtml(contextKey)}" novalidate>
      <input type="hidden" name="scope" value="${scope}">
      ${goalScope ? `<input type="hidden" name="goal_id" value="${escapeHtml(goalId)}">` : ""}
      <p class="policy-scope-notice">${icon(goalScope ? "target" : "database")}<span>${escapeHtml(context)}</span></p>
      ${binding ? `<p class="policy-current-reason"><strong>${L("上次修改原因")}</strong><span>${escapeHtml(binding.reason)}</span></p>` : ""}
      <section class="policy-form-group"><header><span>${icon("shield")}</span><div><h3>${L("开始与完成要求")}</h3><p>${L("先设置最常用的三项：如何按 Goal 工作、是否自检、是否需要你最终确认。")}</p></div></header>
        <fieldset class="policy-control"><legend>${L("执行工具是否必须按 Goal 工作")}</legend><p>${L("按 Goal 工作时，执行工具会遵守当前目标、边界和完成标准。")}</p>${renderGoalModeChoices(policy.goal_mode, minimumPolicy?.goal_mode)}</fieldset>
        <div class="policy-toggle-list">${renderPolicyToggle("self_verification", policy.self_verification, "执行者自我验证", "执行者提交结果前先验证自己的完成依据", Boolean(minimumPolicy?.self_verification))}${renderPolicyToggle("human_approval", policy.human_approval, "用户最终确认", "完成前必须由用户确认工作结果", Boolean(minimumPolicy?.human_approval))}</div>
      </section>
      <details class="factor-advanced policy-advanced" data-progressive-fields><summary><span><strong>${L("高级执行与检查规则")}</strong><small>${L("只有需要指定能力、领取时长或额外检查人数时才修改")}</small></span>${icon("chevron-down")}</summary><div class="factor-advanced-grid">
        <label class="policy-input"><span><strong>${L("执行工具需要的能力")}</strong><small>${capabilityHelp}</small></span><input name="required_capabilities" value="${escapeHtml(additionalCapabilities.join(", "))}" placeholder="${L("例如：浏览器操作、图像处理、数据分析")}"></label>
        <label class="policy-input"><span><strong>${L("一次领取最长多久")}</strong><small>${minimumPolicy ? L("项目最长允许 {seconds} 秒；当前 Goal 只能缩短", { seconds: minimumPolicy.max_lease_seconds }) : escapeHtml(policyLeaseDescription(policy.max_lease_seconds))}</small></span><span class="policy-with-unit"><input name="max_lease_seconds" type="number" min="1"${minimumPolicy ? ` max="${minimumPolicy.max_lease_seconds}" data-policy-max="${minimumPolicy.max_lease_seconds}"` : ""} step="1" value="${policy.max_lease_seconds}"><span>${L("秒")}</span></span></label>
        <div class="policy-review-counts policy-form-wide">${renderPolicyCounter("cross_reviewers", policy.cross_reviewers, "独立复核", "由其他执行者检查结果与依据", minimumPolicy?.cross_reviewers ?? 0)}${renderPolicyCounter("adversarial_reviewers", policy.adversarial_reviewers, "反例检查", "主动寻找遗漏、反例和错误假设", minimumPolicy?.adversarial_reviewers ?? 0)}</div>
      </div></details>
      <section class="policy-form-group policy-form-group--reason"><header><span>${icon("history")}</span><div><h3>${L("变更说明")}</h3><p>${L("工作规则会进入完整记录，请说明为什么现在需要调整。")}</p></div></header><label class="policy-reason"><span>${L("修改原因")}</span><textarea name="reason" rows="2" required placeholder="${L("例如：这个 Goal 涉及用户数据，需要独立检查和最终确认")}"></textarea></label></section>
      <p class="form-error" data-policy-error role="alert" hidden></p>
      <footer><span>${goalScope ? L("保存后会与项目默认合并，并立即成为这条 Goal 的领取门槛。") : L("旧规则会标记为已替换，历史仍保留。")}</span><button class="button-primary" type="submit">${L("保存")}${scopeLabel}</button></footer>
    </form>
  </details>`;
}

function renderPolicyEditor(
  item: WebGoalView,
  options: { editGoal?: boolean; editProject?: boolean } = { editGoal: true, editProject: false },
): string {
  const projectBinding = activePolicyBinding(item, "project_default");
  const goalBinding = activePolicyBinding(item, "goal");
  const projectPolicy = mergePolicy(DEFAULT_GOAL_POLICY, projectBinding);
  const goalPolicy = mergePolicy(projectPolicy, goalBinding);
  const policy = item.resolved_policy;
  const mode = GOAL_MODE_COPY[policy.goal_mode];
  return `<div class="policy-workbench">
    <section class="policy-effective"><header><span class="policy-effective-icon">${icon("shield")}</span><div><h3>${L("当前最终生效规则")}</h3><p>${L("项目默认和当前 Goal 的额外要求已经合并，实际会按下面的结果执行。")}</p></div></header><dl><div><dt>${L("按 Goal 工作")}</dt><dd><strong>${escapeHtml(L(mode.label))}</strong><small>${escapeHtml(L(mode.description))}</small></dd></div><div><dt>${L("执行者自检")}</dt><dd><strong>${policy.self_verification ? L("需要") : L("不需要")}</strong><small>${policy.self_verification ? L("提交前必须验证") : L("不设自检门槛")}</small></dd></div><div><dt>${L("独立检查")}</dt><dd><strong>${policy.cross_reviewers + policy.adversarial_reviewers} ${L("人")}</strong><small>${L("独立复核")} ${policy.cross_reviewers} · ${L("反例检查")} ${policy.adversarial_reviewers}</small></dd></div><div><dt>${L("用户确认")}</dt><dd><strong>${policy.human_approval ? L("需要") : L("不需要")}</strong><small>${policy.human_approval ? L("用户拥有最终确认权") : L("无需用户最终确认")}</small></dd></div><div><dt>${L("一次领取最长")}</dt><dd><strong>${policy.max_lease_seconds} ${L("秒")}</strong><small>${escapeHtml(policyLeaseDescription(policy.max_lease_seconds))}</small></dd></div><div><dt>${L("需要的能力")}</dt><dd><strong>${escapeHtml(policy.required_capabilities.join(currentLocale() === "en" ? ", " : "、") || L("无"))}</strong><small>${policy.required_capabilities.length ? L("执行工具必须全部声明") : L("不限制能力标签")}</small></dd></div></dl></section>
    <div class="policy-inheritance" aria-label="${L("工作规则继承关系")}"><span><small>${L("01 · 项目默认")}</small><strong>${projectBinding ? L("项目基线已设置") : L("使用系统默认")}</strong></span>${icon("arrow")}<span><small>${L("02 · 当前 Goal")}</small><strong>${goalBinding ? L("已增加单独规则") : L("完全继承项目")}</strong></span>${icon("arrow")}<span><small>${L("结果")}</small><strong>${L("最终生效门槛")}</strong></span></div>
    ${options.editProject ? renderPolicyForm(item, "project_default", projectPolicy, projectBinding) : `<p class="policy-scope-note">${icon("folder")}<span><strong>${L("项目默认规则在项目设置中维护")}</strong><small>${L("这里显示合并后的结果；当前 Goal 只能增加自己的要求。")}</small></span><a href="__PROJECT_SETTINGS__">${L("打开项目设置")}</a></p>`}
    ${options.editGoal ? renderPolicyForm(item, "goal", goalPolicy, goalBinding, item.goal.goal_id, Boolean(goalBinding), projectPolicy) : ""}
  </div>`;
}

type DecisionEventKind = "review" | "contract" | "candidate" | "rewire" | "risk" | "goalTree";

const HANDLED_DECISION_EVENT_TYPES: Record<DecisionEventKind, ReadonlySet<string>> = {
  review: new Set(["review.submitted"]),
  contract: new Set(["contract_proposal.approved", "contract_proposal.rejected"]),
  candidate: new Set(["candidate.approved", "candidate.rejected"]),
  rewire: new Set(["rewire.applied", "rewire.rejected"]),
  risk: new Set(["risk.open", "risk.triggered", "risk.resolved", "risk.accepted", "risk.expired"]),
  goalTree: new Set(["goal_tree_proposal.decided"]),
};

function renderNewDecisionBadge(
  createdAt: string,
  view: GoalBoardWebView,
  kind: DecisionEventKind,
  objectId: string,
): string {
  const handledTypes = HANDLED_DECISION_EVENT_TYPES[kind];
  const alreadyHandled = view.events.some(
    (event) => event.object_id === objectId && handledTypes.has(event.type) && event.at >= createdAt,
  );
  if (alreadyHandled) return "";
  const latestHandled = view.events.find((event) => handledTypes.has(event.type));
  return latestHandled && createdAt >= latestHandled.at
    ? `<span class="decision-new" title="${L("这是最近一次处理后新生成的事项")}">${L("新事项")}</span>`
    : "";
}

function riskDecisionCreatedAt(risk: RiskRecord, view: GoalBoardWebView): string {
  return view.events.find(
    (event) => event.object_id === risk.risk_id && (event.type === "risk.open" || event.type === "risk.triggered"),
  )?.at ?? risk.created_at;
}

function renderHumanReviewScenario(item: WebGoalView): string {
  const criteria = item.goal.acceptance_criteria;
  const pendingHumanCriterionIds = new Set(
    item.review_obligations
      .filter((obligation) => obligation.role === "human_approver" && obligation.state === "pending")
      .flatMap((obligation) => obligation.criterion_scope),
  );
  const criterion = criteria.find(
    (entry) =>
      entry.decision_method === "human_decision" &&
      pendingHumanCriterionIds.has(entry.criterion_id) &&
      !item.passed_criteria.includes(entry.criterion_id),
  ) ?? criteria.find((entry) => !item.passed_criteria.includes(entry.criterion_id)) ?? criteria[0];
  const linkedEvidence = criterion
    ? item.evidence.filter((evidence) => evidence.lifecycle_state === "effective" && evidence.criterion_ids.includes(criterion.criterion_id)).slice().reverse()
    : [];
  const evidence = linkedEvidence.find((entry) => entry.result === "passed") ?? linkedEvidence[0];
  let contextLabel = L("目前还缺");
  let contextEffect = L("这条 Goal 还没有完成标准，暂时无法判断结果是否完成。");
  if (criterion?.decision_method === "human_decision") {
    contextLabel = L("需要你判断");
    contextEffect = L("完成标准「{criterion}」只能由你根据实际体验判断。选择“通过”并说明理由后，GoalBoard 会把这次确认同时记录为该标准的人工结论依据。", {
      criterion: criterion.statement,
    });
  } else if (criterion && evidence?.result === "passed") {
    const evidenceSummary = evidence.digest?.trim() || evidence.locator;
    contextLabel = L("当前依据");
    contextEffect = L("完成标准「{criterion}」已有一条通过依据「{evidence}」。这份记录支持该标准，但不等于你已经确认通过。", {
      criterion: criterion.statement,
      evidence: evidenceSummary,
    });
  } else if (criterion && evidence) {
    contextEffect = L("完成标准「{criterion}」现有依据「{evidence}」，记录结果是“{result}”，还不能证明已经达到标准。", {
      criterion: criterion.statement,
      evidence: evidence.digest?.trim() || evidence.locator,
      result: L(EVIDENCE_RESULT_LABELS[evidence.result]),
    });
  } else if (criterion) {
    contextEffect = L("完成标准「{criterion}」还没有对应的通过依据，现在不应选择“通过”。", {
      criterion: criterion.statement,
    });
  }
  const unpassedNonHumanCriterionCount = criteria.filter(
    (entry) => entry.decision_method !== "human_decision" && !item.passed_criteria.includes(entry.criterion_id),
  ).length;
  const hasHumanDecisionCriterion = criteria.some(
    (entry) => entry.decision_method === "human_decision" && pendingHumanCriterionIds.has(entry.criterion_id),
  );
  const otherPendingReviewCount = item.review_obligations.filter(
    (obligation) => obligation.state === "pending" && obligation.role !== "human_approver",
  ).length;
  const blockingRiskCount = item.risks.filter(
    (risk) => (risk.state === "open" || risk.state === "triggered") && risk.blocking_mode !== "none",
  ).length;
  const remainingGateCount = otherPendingReviewCount + blockingRiskCount;
  const confirmEffect = unpassedNonHumanCriterionCount > 0
    ? L("即使选择“通过”，Goal「{title}」仍有 {count} 条由测试或检查判断的完成标准缺少通过依据，不会完成。请先补齐依据。", {
        title: item.goal.title,
        count: unpassedNonHumanCriterionCount,
      })
    : remainingGateCount > 0
      ? L("选择“通过”会记录这次用户检查{humanEvidence}；Goal「{title}」还会等待 {count} 项其他检查或风险处理，不会马上完成。", {
          humanEvidence: hasHumanDecisionCriterion ? L("和对应的人工结论依据") : "",
          title: item.goal.title,
          count: remainingGateCount,
        })
      : L("选择“通过”会记录这次用户检查{humanEvidence}；GoalBoard 会立即再核对全部门槛，都满足后 Goal「{title}」才会完成。", {
          humanEvidence: hasHumanDecisionCriterion ? L("和对应的人工结论依据") : "",
          title: item.goal.title,
        });
  return renderDecisionScenario({
    title: L("拿当前完成标准和依据来说"),
    contextLabel,
    contextEffect,
    confirmLabel: L("如果选择通过"),
    confirmEffect,
    rejectLabel: L("如果需要修改或依据不足"),
    rejectEffect: L("选择“需要修改”会把结果退回补充；选择“证据不足”会让 Goal 继续等待依据。两种情况都不会完成这条 Goal。"),
  });
}

function humanVerdictPrefill(
  item: WebGoalView,
  obligation: ReviewObligationRecord,
): EvidenceRecord | null {
  if (!obligation.criterion_scope.length) return null;
  const obligationCreatedAt = Date.parse(obligation.created_at);
  return item.evidence
    .filter((evidence) =>
      evidence.lifecycle_state === "effective" &&
      evidence.kind === "human_verdict" &&
      evidence.result === "passed" &&
      evidence.locator.startsWith("conversation://") &&
      Boolean(evidence.digest?.trim()) &&
      Number.isFinite(obligationCreatedAt) &&
      Date.parse(evidence.captured_at) >= obligationCreatedAt &&
      obligation.criterion_scope.every((criterionId) => evidence.criterion_ids.includes(criterionId))
    )
    .sort((left, right) => right.captured_at.localeCompare(left.captured_at))[0] ?? null;
}

function renderHumanVerdictPrefill(evidence: EvidenceRecord): string {
  return `<aside class="human-verdict-prefill" data-human-verdict-prefill>
    <span>${icon("user")}</span><div><strong>${L("已找到当前对话中的明确验收")}</strong>
    <p>${L("GoalBoard 已把结论、原话和对话来源预填到下方，但尚未记录为用户验收；请核对后只提交一次。")}</p>
    <dl><div><dt>${L("对话原话")}</dt><dd>${escapeHtml(evidence.digest ?? "")}</dd></div><div><dt>${L("对话来源")}</dt><dd>${escapeHtml(evidence.locator)}</dd></div></dl></div>
  </aside>`;
}

function renderHumanReview(item: WebGoalView, view: GoalBoardWebView): string {
  const pending = item.review_obligations.filter(
    (obligation) => obligation.role === "human_approver" && obligation.state === "pending",
  );
  if (!pending.length) return "";
  const copy = explainDecision("review");
  const allCriteriaPassed = item.goal.acceptance_criteria.length > 0 && item.passed_criteria.length === item.goal.acceptance_criteria.length;
  const hasPendingHumanDecision = pending.some((obligation) => obligation.criterion_scope.some((criterionId) =>
    item.goal.acceptance_criteria.some(
      (criterion) => criterion.criterion_id === criterionId && criterion.decision_method === "human_decision",
    ),
  ));
  const hasReliableRecommendation = !hasPendingHumanDecision && allCriteriaPassed && item.goal.acceptance_criteria.every((criterion) =>
    item.evidence.some((evidence) => evidence.lifecycle_state === "effective" && evidence.result === "passed" && evidence.criterion_ids.includes(criterion.criterion_id)),
  );
  const effectiveEvidence = item.evidence.filter((evidence) => evidence.lifecycle_state === "effective");
  const renderEvidenceChoices = (selectedEvidenceIds = new Set<string>()) => effectiveEvidence.length
    ? effectiveEvidence
        .slice()
        .reverse()
        .map(
          (evidence) =>
            `<label class="evidence-choice"><input type="checkbox" name="evidence_refs" value="${escapeHtml(evidence.evidence_id)}"${selectedEvidenceIds.has(evidence.evidence_id) ? " checked" : ""}><span><strong>${escapeHtml(L(EVIDENCE_KIND_LABELS[evidence.kind]))} · ${escapeHtml(L(EVIDENCE_RESULT_LABELS[evidence.result]))} · ${escapeHtml(evidence.locator_status === "verified" ? L("已验证") : "UNVERIFIED")}</strong><small>${escapeHtml(evidence.locator)}</small></span></label>`,
        )
        .join("")
    : `<p class="empty-row">${L("当前还没有已提交的完成依据。你可以在下方补充外部引用。")}</p>`;
  const evidenceChoices = renderEvidenceChoices();
  return `<div class="decision-record human-review-list"><header class="decision-record-heading"><span class="decision-kind">${icon("user")} ${L("确认工作结果")}${renderNewDecisionBadge(pending[0]!.created_at, view, "review", pending[0]!.obligation_id)}</span></header><div class="decision-record-body"><h3>${escapeHtml(copy.question)}</h3><p>${escapeHtml(copy.purpose)}</p><button class="human-review-jump" type="button" data-human-review-jump><span><strong>${L("填写确认结论")}</strong><small>${L("选择结论并写明判断理由")}</small></span>${icon("chevron-right")}</button>${renderDecisionGuidance({
    whyNow: L("工作结果已经提交，其他必要检查也已走到需要你确认的阶段。"),
    recommendation: hasReliableRecommendation ? L("建议确认通过") : null,
    recommendationBasis: L("{passed}/{total} 条完成标准已有通过依据，共 {evidence} 条当前有效记录。", { passed: item.passed_criteria.length, total: item.goal.acceptance_criteria.length, evidence: effectiveEvidence.length }),
    insufficient: copy.insufficientEvidence,
    consequences: [
      { choice: L("通过"), effect: L("这项用户检查会完成；其他门槛也满足后，Goal 才会完成。") },
      { choice: L("需要修改或不通过"), effect: L("结果不会完成，并会带着你的理由回到后续修改。") },
      { choice: L("证据不足"), effect: L("暂不判断结果，等待补充与完成标准对应的依据。") },
    ],
  })}${renderHumanReviewScenario(item)}<details class="decision-details"><summary>${L("查看完成标准和已有依据")}${icon("chevron-down")}</summary><div class="review-context"><section><h4>${L("完成标准")}</h4>${renderAcceptanceSummary(item)}</section><section><h4>${L("已有依据")}</h4><div class="evidence-choice-list">${evidenceChoices}</div></section></div></details></div>${pending
    .map(
      (obligation) => {
        const prefill = humanVerdictPrefill(item, obligation);
        const preselectedEvidence = prefill ? new Set([prefill.evidence_id]) : new Set<string>();
        const attentionToken = item.action_projection.actions
          .find((action) => action.actor === "user" && action.target_id === obligation.obligation_id)
          ?.reasons[0]?.facts?.attention_token ?? "";
        return `<form class="human-review-form" data-human-review-form data-live-form="human-review-${escapeHtml(obligation.obligation_id)}" data-goal-id="${escapeHtml(item.goal.goal_id)}" data-obligation-id="${escapeHtml(obligation.obligation_id)}" data-attention-token="${escapeHtml(attentionToken)}" data-contract-revision="${item.goal.current_contract_revision}" novalidate>
        ${prefill ? renderHumanVerdictPrefill(prefill) : ""}
        <label class="review-verdict"><span>${L("你的结论")}</span><select name="verdict"><option value=""${prefill ? "" : " selected"} disabled>${L("请选择结论")}</option><option value="pass"${prefill ? " selected" : ""}>${L("通过")}</option><option value="needs_changes">${L("需要修改")}</option></select></label>
        <fieldset><legend>${L("选择支持结论的已有依据")}</legend><div class="evidence-choice-list">${renderEvidenceChoices(preselectedEvidence)}</div></fieldset>
        <label><span>${L("补充依据链接")} <small>${L("可选，每行一条")}</small></span><textarea name="evidence_refs_extra" rows="2" placeholder="${L("https://… 或项目内文件引用")}"></textarea></label>
        <label><span>${L("判断理由")}（${L("必填")}）</span><textarea name="reasoning" rows="3" required placeholder="${L("说明为什么给出这个结论，以及哪些依据支撑判断")}">${escapeHtml(prefill?.digest ?? "")}</textarea></label>
        <p class="form-error" data-review-error role="alert" hidden></p>
        <footer><details class="decision-record-tech"><summary>${L("记录信息")}</summary><small>${escapeHtml(obligation.independence_rule)} · ${escapeHtml(obligation.obligation_id)}</small></details><button class="button-primary" type="submit">${L("提交结果确认")}</button></footer>
      </form>`;
      },
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

export const WEB_GOAL_EVENT_PAGE_SIZE = 40;

function renderEventLedgerItems(events: WebEventRecord[]): string {
  return events.map((event) => `<li data-goal-event-seq="${event.seq}"><details><summary><time>${formatDate(event.at)}</time><span><strong>${escapeHtml(event.type)}</strong><small>${escapeHtml(event.actor_id)} · ${escapeHtml(event.object_type)} · ${escapeHtml(event.object_id)} · #${event.seq}</small></span></summary><dl><div><dt>${L("事件 ID")}</dt><dd>${escapeHtml(event.event_id)}</dd></div><div><dt>${L("理由")}</dt><dd>${escapeHtml(event.reason || L("未记录"))}</dd></div></dl><pre>${escapeHtml(renderEventPayload(event.payload))}</pre></details></li>`).join("");
}

function renderEventLedgerPagination(total: number, shown: number): string {
  if (total === 0) return "";
  const hasMore = shown < total;
  return `<footer class="event-ledger-pagination" data-goal-event-pagination data-total="${total}" data-next-offset="${shown}"><span data-goal-event-progress>${L("已显示 {shown}/{total} 条事件", { shown, total })}</span>${hasMore ? `<button type="button" data-load-more-goal-events>${L("加载更早记录")}</button>` : ""}<p data-goal-event-error role="alert" hidden></p></footer>`;
}

function renderFullRecords(item: WebGoalView): string {
  const events = item.events.slice().sort((left, right) => right.seq - left.seq);
  const initialEvents = events.slice(0, WEB_GOAL_EVENT_PAGE_SIZE);
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
        ? item.evidence.map((evidence) => `<p><strong>${escapeHtml(evidence.evidence_id)}</strong><small>${escapeHtml(L(EVIDENCE_KIND_LABELS[evidence.kind]))} · ${escapeHtml(L(EVIDENCE_RESULT_LABELS[evidence.result]))} · ${escapeHtml(evidence.lifecycle_state === "effective" ? L("当前有效") : evidence.lifecycle_state === "superseded" ? L("已被替代") : L("已撤销"))} · ${escapeHtml(evidence.locator_status === "verified" ? L("已验证") : "UNVERIFIED")} · ${escapeHtml(evidence.criterion_ids.join(currentLocale() === "en" ? ", " : "、"))} · ${escapeHtml(evidence.producer_actor_id)}${evidence.correction ? ` · ${escapeHtml(evidence.correction.reason)}` : ""}</small></p>`).join("")
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
  </div><section class="event-ledger"><header><h3>${L("完整事件账本")}</h3><p>${L("按时间倒序保留 Claim、Run、Evidence、Review、Policy、Risk、Relation、Candidate、Rewire、Contract/Goal Tree Proposal 和澄清相关事件。")}</p></header>${events.length ? `<ol data-goal-event-list>${renderEventLedgerItems(initialEvents)}</ol>${renderEventLedgerPagination(events.length, initialEvents.length)}` : `<p class="empty-row">${L("暂无与这条 Goal 关联的事件")}</p>`}</section></details>`;
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

function renderDecisionGuidance(options: {
  whyNow: string;
  recommendation: string | null;
  recommendationBasis?: string;
  insufficient: string;
  consequences: Array<{ choice: string; effect: string }>;
}): string {
  return `<div class="decision-guidance">
    <section><h4>${L("为什么现在要决定")}</h4><p>${escapeHtml(options.whyNow)}</p></section>
    <section class="decision-recommendation${options.recommendation ? " has-recommendation" : ""}"><h4>${L("建议")}</h4><strong>${escapeHtml(options.recommendation ?? L("现在没有足够依据给出可靠建议"))}</strong><p>${escapeHtml(options.recommendation ? options.recommendationBasis ?? "" : options.insufficient)}</p></section>
    <section class="decision-consequences"><h4>${L("选完会发生什么")}</h4><dl>${options.consequences.map((item) => `<div><dt>${escapeHtml(item.choice)}</dt><dd>${escapeHtml(item.effect)}</dd></div>`).join("")}</dl></section>
  </div>`;
}

function renderDecisionScenario(options: {
  title?: string;
  contextLabel?: string;
  contextEffect?: string;
  confirmLabel: string;
  confirmEffect: string;
  rejectLabel: string;
  rejectEffect: string;
}): string {
  const title = options.title ?? L("放到当前方案里看");
  const context = options.contextLabel && options.contextEffect
    ? `<div><dt>${escapeHtml(options.contextLabel)}</dt><dd>${escapeHtml(options.contextEffect)}</dd></div>`
    : "";
  return `<section class="decision-scenario" aria-label="${escapeHtml(title)}">
    <h4>${escapeHtml(title)}</h4>
    <dl>
      ${context}
      <div><dt>${escapeHtml(options.confirmLabel)}</dt><dd>${escapeHtml(options.confirmEffect)}</dd></div>
      <div><dt>${escapeHtml(options.rejectLabel)}</dt><dd>${escapeHtml(options.rejectEffect)}</dd></div>
    </dl>
  </section>`;
}

function proposedGoalNextStage(goal: Record<string, unknown>): string {
  const definitionState = String(goal.definition_state ?? "draft");
  const decompositionState = String(goal.decomposition_state ?? "abstract");
  if (definitionState !== "accepted") {
    return L("随后仍是草稿，需要继续澄清，不能开始。");
  }
  if (decompositionState === "closed_compound") {
    return L("随后进入“等待子 Goal”，由子 Goal 推进，不会直接开工。");
  }
  return L("随后进入“待执行”，但仍要由 Runtime 领取后才会开始。");
}

function renderRewireDecision(
  rewire: GoalBoardWebView["snapshot"]["rewires"][number],
  view: GoalBoardWebView,
): string {
  const copy = explainDecision("rewire");
  const hasDependencies = dependencyRelations(rewire).length > 0;
  const note = rewire.candidate_id
    ? L("拒绝关系调整不会删除已经纳入的 Goal。")
    : L("拒绝后现有依赖保持不变；确认后才会新增或解除依赖。");
  const dependencies = dependencyRelations(rewire);
  const evidenceCount = dependencies.reduce((count, relation) => count + (Array.isArray(relation.evidence_refs) ? relation.evidence_refs.length : 0), 0);
  const hasReliableRecommendation = dependencies.length > 0 && dependencies.every((relation) =>
    Boolean(relation.reason) && Boolean(relation.direction_reason) && Boolean(relation.impact_if_rejected) &&
    typeof relation.confidence === "number" && relation.confidence >= 0.7 &&
    Array.isArray(relation.evidence_refs) && relation.evidence_refs.length > 0,
  );
  return `<form class="decision-record rewire-decision" data-rewire-decision-form data-live-form="rewire-${escapeHtml(rewire.rewire_id)}" data-rewire-id="${escapeHtml(rewire.rewire_id)}" novalidate>
    <header class="decision-record-heading"><span class="decision-kind decision-kind--rewire">${icon("tree")} ${L("Goal 关系调整")}${renderNewDecisionBadge(rewire.created_at, view, "rewire", rewire.rewire_id)}</span><details class="decision-record-tech"><summary>${L("记录信息")}</summary><small>Rewire · ${escapeHtml(rewire.rewire_id)}</small></details></header>
    <div class="decision-record-body"><h3>${escapeHtml(copy.question)}</h3><p>${escapeHtml(copy.purpose)}</p>${renderDecisionGuidance({
      whyNow: L("这项关系变化会改变哪些 Goal 必须先完成，以及它们在 Goal Tree 中的归属。"),
      recommendation: hasReliableRecommendation ? L("建议应用这次关系调整") : null,
      recommendationBasis: L("提案写清了关系方向、拒绝后的影响，并提供了 {count} 条可查看依据。", { count: evidenceCount }),
      insufficient: copy.insufficientEvidence,
      consequences: [
        { choice: L("应用调整"), effect: L("按提案增加或解除关系；已经在运行的终端和工作不会被改到别的 Goal。") },
        { choice: L("不调整"), effect: note },
      ],
    })}${renderRewireSummary(rewire, view)}</div>
    <label class="decision-reason"><span>${L("决定理由或修改意见")}（${L("必填")}）</span><textarea name="reason" rows="2" required placeholder="${L("说明为什么确认或拒绝这次关系变化")}"></textarea></label>
    <p class="form-error" data-decision-error role="alert" hidden></p>
    <footer class="decision-actions"><button type="submit" name="decision" value="rejected">${L("保持现有关系")}</button><button class="button-primary" type="submit" name="decision" value="confirmed">${hasDependencies ? L("应用这次依赖调整") : L("应用这次关系调整")}</button></footer>
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
  return `<div class="contract-diff-row"><h4>${escapeHtml(L(label))}</h4><div class="contract-diff-copy"><small>${L("当前")}</small><p>${escapeHtml(contractValue(current))}</p><small>${L("提案")}</small><p>${escapeHtml(contractValue(proposed))}</p></div>${renderProposalSource(proposalSource(proposal, field))}</div>`;
}

function renderContractProposal(
  proposal: ContractProposalRecord,
  current: GoalRecord,
  view: GoalBoardWebView,
): string {
  const copy = explainDecision("contract");
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
  const sourceFields: ContractFieldName[] = ["title", "outcome", "why", "business_logic", "acceptance_criteria"];
  const reliableSources = sourceFields.filter((field) => {
    const source = proposalSource(proposal, field);
    return source && source.confidence >= 0.7 && (source.source_kind === "user_answer" || source.source_refs.length > 0);
  });
  const hasCompleteProposal = Boolean(
    proposed.title.trim() && proposed.outcome.trim() && proposed.why.trim() && proposed.business_logic.trim() && acceptance.length,
  );
  const hasReliableRecommendation = hasCompleteProposal && reliableSources.length === sourceFields.length;
  const recommendation = approvalBlocked
    ? L("建议先完成关联的 Goal 关系决定")
    : hasReliableRecommendation
      ? L("建议确认这份目标说明")
      : null;
  const recommendationBasis = approvalBlocked
    ? L("这份说明依赖上方的关系调整；先决定关系，才能知道开始顺序是否正确。")
    : L("目标、原因、实际运转方式和完成标准都有来源，且可信度不低于 70%。");
  const sameTitle = proposed.title.trim() === current.title.trim();
  const confirmEffect = sameTitle
    ? L("不会新建另一条 Goal；现有 Goal「{title}」会采用这版范围和完成标准。{stage}", {
        title: proposed.title,
        stage: proposedGoalNextStage(proposed as unknown as Record<string, unknown>),
      })
    : L("不会新建另一条 Goal；现有 Goal「{current}」会更新为「{proposed}」，并采用这版范围和完成标准。{stage}", {
        current: current.title,
        proposed: proposed.title,
        stage: proposedGoalNextStage(proposed as unknown as Record<string, unknown>),
      });
  return `<form class="decision-record contract-proposal" data-contract-decision-form data-live-form="contract-${escapeHtml(proposal.proposal_id)}" data-contract-proposal-id="${escapeHtml(proposal.proposal_id)}" novalidate>
    <header class="decision-record-heading"><span class="decision-kind">${icon("clipboard")} ${L("确认目标说明")}${renderNewDecisionBadge(proposal.created_at, view, "contract", proposal.proposal_id)}</span><span>${L("由 {name} 提交", { name: proposal.submitted_by })}</span></header>
    <div class="decision-record-body"><h3>${escapeHtml(copy.question)}</h3><p>${escapeHtml(copy.purpose)}</p>${renderDecisionGuidance({
      whyNow: L("这条 Goal 还是草稿；你确认后，下面的目标、范围和完成标准才会成为正式依据。"),
      recommendation,
      recommendationBasis,
      insufficient: copy.insufficientEvidence,
      consequences: [
        { choice: L("确认并允许开始"), effect: L("这份说明会成为正式依据；满足其他前置条件后，工作可以被领取和推进。") },
        { choice: L("退回修改"), effect: L("草稿保持不变，你写下的修改意见会保留，等待提交新版本。") },
      ],
    })}${renderDecisionScenario({
      confirmLabel: L("如果确认"),
      confirmEffect,
      rejectLabel: L("如果退回"),
      rejectEffect: L("Goal「{title}」仍保持当前草稿；这版名称、范围和完成标准都不会写入 GoalBoard。", { title: current.title }),
    })}</div>
    <details class="decision-details"><summary>${L("查看修改前后和每项依据")}${icon("chevron-down")}</summary><div class="contract-diff-list">
      ${renderContractDiffRow(proposal, "title", "目标名称", current.title, proposed.title)}
      ${renderContractDiffRow(proposal, "outcome", "要得到的结果", current.outcome, proposed.outcome)}
      ${renderContractDiffRow(proposal, "why", "为什么现在做", current.why, proposed.why)}
      ${renderContractDiffRow(proposal, "business_logic", "它会怎样运转", current.business_logic, proposed.business_logic)}
      ${renderContractDiffRow(proposal, "in_scope", "这次会做", current.in_scope, proposed.in_scope ?? [])}
      ${renderContractDiffRow(proposal, "out_of_scope", "这次不做", current.out_of_scope, proposed.out_of_scope ?? [])}
      ${renderContractDiffRow(proposal, "promised_outputs", "完成后会交付", current.promised_outputs, proposed.promised_outputs ?? [])}
      ${renderContractDiffRow(proposal, "acceptance_criteria", "完成标准", currentAcceptance, acceptance)}
      ${renderContractDiffRow(proposal, "review_policy", "完成前需要的检查", "使用项目当前规则", policyText)}
    </div>
    ${proposal.proposed_impacts.length ? `<div class="proposal-appendix"><strong>${L("确认后会记录的影响范围")}</strong>${renderList(proposal.proposed_impacts.map((impact) => `${impact.surface} · ${impact.access} · ${impact.reason}`), "")}</div>` : ""}
    ${proposal.proposed_risks.length ? `<div class="proposal-appendix"><strong>${L("确认后会记录的风险")}</strong>${renderList(proposal.proposed_risks.map((risk) => `${risk.description}；${L("影响：")}${risk.impact}；${L("复查：")}${risk.revisit_condition}`), "")}</div>` : ""}
    ${linkedRewires.length ? `<div class="proposal-appendix proposal-prerequisite"><strong>${L("需要先决定的 Goal 关系")}</strong><div>${renderList(linkedRewires.map((rewire) => `${rewire.state === "pending" ? L("等待决定") : rewire.state === "applied" ? L("已确认") : L("已拒绝")} · ${rewire.rewire_id}`), "")}<p>${approvalBlocked ? L("请先处理上方的 Goal 关系调整；完成后才能确认这份目标说明。") : L("关联的 Goal 关系已经决定，现在可以确认目标说明。")}</p></div></div>` : ""}</details>
    <label class="decision-reason"><span>${L("决定理由或修改意见")}（${L("必填")}）</span><textarea name="reason" rows="2" required placeholder="${L("确认时说明判断依据；退回时写清需要修改的内容")}"></textarea></label>
    <p class="form-error" data-decision-error role="alert" hidden></p>
    <footer class="decision-actions"><button type="submit" name="decision" value="rejected">${L("退回修改")}</button><button class="button-primary" type="submit" name="decision" value="approved"${approvalBlocked ? ` disabled aria-disabled="true" title="${L("先处理上方的 Goal 关系调整")}"` : ""}>${approvalBlocked ? L("先处理 Goal 关系") : L("确认并允许开始")}</button></footer>
  </form>`;
}

interface DecisionGoalGroup {
  ownerGoalId: string | null;
  item: WebGoalView | null;
  goalTreeProposals: GoalTreeProposalRecord[];
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

function goalTreeProposalNeedsDecision(proposal: GoalTreeProposalRecord): boolean {
  return (proposal.state === "pending" || proposal.state === "partially_applied") &&
    proposal.items.some((item) => item.state === "pending" || item.state === "conflict");
}

function goalTreeProposalOwnerGoalId(proposal: GoalTreeProposalRecord, view: GoalBoardWebView): string | null {
  if (findGoalView(view, proposal.root_goal_id)) return proposal.root_goal_id;
  if (proposal.discovered_in_run_id) {
    const run = view.snapshot.runs.find((item) => item.run_id === proposal.discovered_in_run_id);
    if (run && findGoalView(view, run.goal_id)) return run.goal_id;
  }
  for (const proposalItem of proposal.items) {
    const payloadGoalIds = [
      proposalItem.payload.goal_id,
      proposalItem.payload.from_goal_id,
      proposalItem.payload.to_goal_id,
    ];
    const owner = payloadGoalIds.find((goalId) => findGoalView(view, String(goalId ?? "")));
    if (owner) return String(owner);
  }
  return null;
}

function riskHasUserAction(risk: RiskRecord, view: GoalBoardWebView): boolean {
  return allGoalViews(view).some((item) =>
    item.action_projection.actions.some((action) =>
      action.actor === "user" && action.target_type === "risk" && action.target_id === risk.risk_id
    )
  );
}

function buildDecisionGroups(view: GoalBoardWebView): DecisionGoalGroup[] {
  const groups = new Map<string, DecisionGoalGroup>();
  const ensure = (goalId: string | null): DecisionGoalGroup => {
    const key = goalId ?? "$board";
    const existing = groups.get(key);
    if (existing) return existing;
    const created: DecisionGoalGroup = {
      ownerGoalId: goalId,
      item: findGoalView(view, goalId),
      goalTreeProposals: [],
      contractProposals: [],
      candidates: [],
      rewires: [],
      humanReview: false,
      risks: [],
    };
    groups.set(key, created);
    return created;
  };
  view.snapshot.goal_tree_proposals
    .filter((proposal) => proposal.origin === "native" && goalTreeProposalNeedsDecision(proposal))
    .forEach((proposal) => ensure(goalTreeProposalOwnerGoalId(proposal, view)).goalTreeProposals.push(proposal));
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
    if (item.action_projection.actions.some((action) =>
      action.actor === "user" && action.kind === "review" && action.target_type === "review_obligation"
    )) {
      ensure(item.goal.goal_id).humanReview = true;
    }
  }
  for (const risk of view.snapshot.risks.filter((risk) => riskHasUserAction(risk, view))) {
    const owners = allGoalViews(view).filter((item) => item.risks.some((itemRisk) => itemRisk.risk_id === risk.risk_id));
    ensure(owners.length === 1 ? owners[0]!.goal.goal_id : null).risks.push(risk);
  }
  const impactScore = (group: DecisionGoalGroup): number =>
    group.risks.reduce((score, risk) => score + (risk.state === "triggered" ? 4 : risk.blocking_mode === "none" ? 1 : 3), 0) +
    group.rewires.length * 3 + group.goalTreeProposals.length * 3 + (group.humanReview ? 2 : 0) + group.contractProposals.length * 2 + group.candidates.length;
  return [...groups.values()]
    .filter((group) => group.goalTreeProposals.length || group.contractProposals.length || group.candidates.length || group.rewires.length || group.humanReview || group.risks.length)
    .sort((left, right) => impactScore(right) - impactScore(left));
}

function pendingDecisionCount(view: GoalBoardWebView): number {
  const riskIds = new Set(
    allGoalViews(view).flatMap((item) => item.risks.filter((risk) => riskHasUserAction(risk, view)).map((risk) => risk.risk_id)),
  );
  return view.snapshot.goal_tree_proposals.filter((item) => item.origin === "native" && goalTreeProposalNeedsDecision(item)).length +
    view.snapshot.contract_proposals.filter((item) => item.state === "pending").length +
    view.snapshot.candidates.filter((item) => item.state === "pending").length +
    view.snapshot.rewires.filter((item) => item.state === "pending").length +
    allGoalViews(view).filter((item) => item.action_projection.actions.some((action) =>
      action.actor === "user" && action.kind === "review" && action.target_type === "review_obligation"
    )).length +
    riskIds.size;
}

function renderDecisionGoalLink(item: WebGoalView | null): string {
  if (!item) return `<span class="decision-owner-link"><strong>${L("整个项目的事项")}</strong><small>${L("没有只属于某一条 Goal")}</small></span>`;
  const base = item.goal.archived_at ? "/archive/goals/" : "/goals/";
  return `<a class="decision-owner-link" href="${base}${encodeURIComponent(item.goal.goal_id)}"><strong>${escapeHtml(item.goal.title)}</strong><small>${L("返回这条 Goal 查看完整信息")}</small></a>`;
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

function proposedGoalName(
  value: unknown,
  view: GoalBoardWebView,
  proposal?: GoalTreeProposalRecord,
): string {
  const goalId = String(value ?? "");
  if (!goalId) return L("未指明 Goal");
  const proposed = proposal?.items
    .filter((item) => item.kind === "goal" || item.kind === "contract" || item.kind === "candidate")
    .map((item) => goalTreeGoalPayload(item.payload))
    .find((goal) => String(goal.goal_id ?? "") === goalId);
  if (proposed?.title) return String(proposed.title);
  return findGoalView(view, goalId)?.goal.title ?? goalId;
}

function goalTreeGoalPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const nested = payload.goal ?? payload.proposed_goal;
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : payload;
}

function goalTreeRelationPayloads(payload: Record<string, unknown>): Record<string, unknown>[] {
  const nested = payload.relations ?? payload.relation ?? payload.proposed_relations;
  const values = Array.isArray(nested) ? nested : nested == null ? [payload] : [nested];
  const proposedGoal = goalTreeGoalPayload(payload);
  const goalId = String(proposedGoal.goal_id ?? "").trim();
  return values
    .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value))
    .map((relation) => ({
      ...relation,
      from_goal_id: relation.from_goal_id === "$new_goal" ? goalId : relation.from_goal_id,
      to_goal_id: relation.to_goal_id === "$new_goal" ? goalId : relation.to_goal_id,
    }));
}

function goalTreeProposalItemCopy(
  item: GoalTreeProposalRecord["items"][number],
  view: GoalBoardWebView,
  proposal: GoalTreeProposalRecord,
): { title: string; detail: string; facts: string[] } {
  const payload = item.payload;
  const operation = item.operation === "create" ? L("新增") : item.operation === "deactivate" ? L("停止使用") : L("更新");
  if (item.kind === "contract" || item.kind === "goal") {
    const goal = goalTreeGoalPayload(payload);
    const title = String(goal.title ?? proposedGoalName(goal.goal_id, view));
    const outcome = String(goal.outcome ?? "").trim();
    const review = readDecompositionReview(goal.decomposition_review);
    const readiness = readLeafReadiness(goal.leaf_readiness);
    const readinessFacts = readiness == null
      ? []
      : [
          readiness.verdict === "ready"
            ? L("为什么可以直接执行：只交付并验收「{deliverable}」。", {
                deliverable: readiness.primary_deliverable || L("尚未写明主要结果"),
              })
            : L("这条 Goal 仍需继续拆分，不能直接开始。"),
          ...readiness.output_coverage.map((entry) => entry.role === "primary"
            ? L("主要结果：{output}。{reason}", { output: entry.promised_output, reason: entry.reason })
            : entry.role === "supporting"
              ? L("配套产物：{output}。{reason}", { output: entry.promised_output, reason: entry.reason })
              : L("需要另拆：{output}。{reason}", { output: entry.promised_output, reason: entry.reason })),
          ...readiness.split_candidates
            .filter((candidate) => candidate.decision === "keep")
            .map((candidate) => L("保留在当前 Goal：{work}。{reason}", {
              work: candidate.work_item,
              reason: candidate.reason,
            })),
        ];
    const reviewFacts = review == null
      ? []
      : [
          ...((review.method_pack_ids ?? []).length
            ? [L("规划方法：{methods}", { methods: review.method_pack_ids!.join("、") })]
            : []),
          ...(review.task_context == null
            ? []
            : [L("任务类型：{context}", { context: L(TASK_CONTEXT_LABELS[review.task_context]) })]),
          review.status === "complete"
            ? L("拆解判断：通用结果链和当前任务的必要路径已交代完整")
            : L("拆解判断：这轮先暂停，后面还要继续拆"),
          ...review.coverage.map((entry) => {
            const area = L(PRODUCT_PATH_AREA_LABELS[entry.area as ProductPathArea] ?? entry.area);
            if (entry.disposition === "not_applicable") {
              return L("{area}：不适用。{reason}", { area, reason: entry.reason });
            }
            const owners = entry.goal_ids
              .map((goalId) => proposedGoalName(goalId, view, proposal))
              .map((name) => `「${name}」`)
              .join("、");
            return L("{area}：由 {owners} 负责。{reason}", {
              area,
              owners: owners || L("尚未指定 Goal"),
              reason: entry.reason,
            });
          }),
          ...(review.status === "paused"
            ? [L("下一步：{nextStep}", { nextStep: review.next_step || L("尚未写明") })]
            : []),
        ];
    return {
      title: L("{operation} Goal「{title}」", { operation, title }),
      detail: outcome || item.reason,
      facts: [...readinessFacts, ...reviewFacts],
    };
  }
  if (item.kind === "relation" || item.kind === "dependency") {
    const relations = goalTreeRelationPayloads(payload);
    const facts = relations.map((relation) => {
      const from = proposedGoalName(relation.from_goal_id, view, proposal);
      const to = proposedGoalName(relation.to_goal_id, view, proposal);
      const relationLabel = RELATION_LABELS[String(relation.type ?? (item.kind === "dependency" ? "depends_on" : ""))]?.out ?? L("建立关系");
      return L("{from} → {relation} → {to}", { from, relation: L(relationLabel), to });
    });
    return {
      title: L("{operation} {count} 条 Goal 关系", { operation, count: facts.length || 1 }),
      detail: item.reason,
      facts,
    };
  }
  if (item.kind === "risk") {
    const description = goalTreeRiskDescription(item);
    const treatmentKey = String(payload.treatment ?? "") as RiskRecord["treatment"];
    const treatment = RISK_TREATMENT_LABELS[treatmentKey] ?? L("处理方式需要修正");
    const submittedPlan = String(payload.treatment_plan ?? "").trim()
      || (RISK_TREATMENT_LABELS[treatmentKey] ? "" : String(payload.treatment ?? "").trim());
    return {
      title: L("{operation}风险「{description}」", { operation, description }),
      detail: L("发生概率：{probability} · 影响：{impact} · 计划：{treatment}", {
        probability: String(payload.probability ?? L("未说明")),
        impact: String(payload.impact ?? L("未说明")),
        treatment: L(treatment),
      }),
      facts: submittedPlan ? [L("具体措施：{plan}", { plan: submittedPlan })] : [],
    };
  }
  if (item.kind === "candidate") {
    const goal = goalTreeGoalPayload(payload);
    const title = String(goal.title ?? goal.goal_id ?? L("未命名 Goal"));
    const candidateId = String(payload.candidate_id ?? "").trim();
    const relations = goalTreeRelationPayloads(payload);
    const relationFacts = relations.map((relation) => {
      const from = proposedGoalName(relation.from_goal_id, view, proposal);
      const to = proposedGoalName(relation.to_goal_id, view, proposal);
      const relationLabel = RELATION_LABELS[String(relation.type ?? "")]?.out ?? L("建立关系");
      return L("{from} → {relation} → {to}", { from, relation: L(relationLabel), to });
    });
    const bootstrapProposalId = String(payload.materialized_by_proposal_id ?? "").trim();
    return {
      title: item.operation === "update"
        ? L("晋升已有 Candidate 为 Goal「{title}」", { title })
        : L("新增 Candidate Goal「{title}」", { title }),
      detail: String(goal.outcome ?? item.reason),
      facts: [
        ...(candidateId ? [L("原 Candidate：{candidateId}", { candidateId })] : []),
        ...(bootstrapProposalId
          ? [L("对账已有 Goal，来源提案：{proposalId}", { proposalId: bootstrapProposalId })]
          : []),
        ...relationFacts,
      ],
    };
  }
  const kindLabels: Record<string, string> = {
    policy: L("执行和检查规则"),
    candidate: L("新发现的工作"),
    rewire: L("Goal 关系"),
  };
  return {
    title: L("{operation}{kind}", { operation, kind: kindLabels[item.kind] ?? item.kind }),
    detail: String(payload.description ?? payload.reason ?? item.reason),
    facts: [],
  };
}

function goalTreeRelationScenario(
  item: GoalTreeProposalRecord["items"][number],
  view: GoalBoardWebView,
  proposal: GoalTreeProposalRecord,
  subjectGoalId?: string,
): string | null {
  const relation = goalTreeRelationPayloads(item.payload)[0];
  if (!relation) return null;
  const fromGoalId = String(relation.from_goal_id ?? "");
  const from = proposedGoalName(relation.from_goal_id, view, proposal);
  const to = proposedGoalName(relation.to_goal_id, view, proposal);
  const type = String(relation.type ?? (item.kind === "dependency" ? "depends_on" : ""));
  if (type === "part_of") {
    if (subjectGoalId && fromGoalId === subjectGoalId) {
      return L("它会成为「{parent}」的子 Goal。", { parent: to });
    }
    return L("Goal「{child}」会成为「{parent}」的子 Goal。", { child: from, parent: to });
  }
  if (type === "depends_on") {
    if (subjectGoalId && fromGoalId === subjectGoalId) {
      return L("它会等待「{dependency}」先完成。", { dependency: to });
    }
    return L("Goal「{goal}」会等待「{dependency}」先完成。", { goal: from, dependency: to });
  }
  const relationLabel = L(RELATION_LABELS[type]?.out ?? "建立关系");
  return L("Goal「{from}」和「{to}」会建立“{relation}”关系。", { from, to, relation: relationLabel });
}

function renderGoalTreeProposalScenario(
  proposal: GoalTreeProposalRecord,
  view: GoalBoardWebView,
  items: GoalTreeProposalRecord["items"],
): string {
  const goalItem = items.find((item) =>
    (item.kind === "goal" || item.kind === "contract") && item.operation === "create",
  ) ?? items.find((item) => item.kind === "goal" || item.kind === "contract" || item.kind === "candidate");
  const relationItem = items.find((item) =>
    item.kind === "relation" || item.kind === "dependency" ||
    (item.kind === "candidate" && goalTreeRelationPayloads(item.payload).length > 0),
  );
  const goal = goalItem ? goalTreeGoalPayload(goalItem.payload) : null;
  const goalTitle = goal
    ? String(goal.title ?? proposedGoalName(goal.goal_id, view, proposal))
    : proposedGoalName(relationItem ? goalTreeRelationPayloads(relationItem.payload)[0]?.from_goal_id : proposal.root_goal_id, view, proposal);
  const goalId = goal ? String(goal.goal_id ?? "") : "";
  const goalEffect = goalItem?.kind === "candidate" && goalItem.operation === "update"
    ? L("会把已有 Candidate 晋升为 Goal「{title}」，并关闭原 Candidate 的待决定状态。", { title: goalTitle })
    : goalItem?.operation === "create"
    ? L("会新增 Goal「{title}」。", { title: goalTitle })
    : goalItem?.operation === "deactivate"
      ? L("会停止使用 Goal「{title}」。", { title: goalTitle })
      : goalItem
        ? L("会更新 Goal「{title}」的目标说明或状态。", { title: goalTitle })
        : L("会按方案更新 Goal「{title}」的关系。", { title: goalTitle });
  const relationEffect = relationItem
    ? goalTreeRelationScenario(relationItem, view, proposal, goalId)
    : L("本次不会自动改变 Goal「{title}」与其他 Goal 的归属或依赖。", { title: goalTitle });
  const nextStage = goal ? proposedGoalNextStage(goal) : L("现有 Goal 是否能开始，仍由各自的状态和前置条件决定。");
  return renderDecisionScenario({
    confirmLabel: L("如果采用"),
    confirmEffect: `${goalEffect}${relationEffect}${nextStage}`,
    rejectLabel: L("如果退回"),
    rejectEffect: L("不会写入上面这些 Goal 和关系变化；当前 Goal Tree 保持不变。"),
  });
}

function goalTreeProposalIssueCopy(
  issue: ReturnType<typeof goalTreeProposalItemValidationIssues>[number],
): { message: string; recovery: string } {
  switch (issue.field) {
    case "goal_ids":
      return {
        message: L("这条风险没有关联任何 Goal。"),
        recovery: L("请退回方案，让 Runtime 补充关联 Goal 后重新提交。"),
      };
    case "risk_facts":
      return {
        message: L("这条风险缺少：{fields}。", { fields: (issue.missing_fields ?? []).map((field) => L(field)).join("、") }),
        recovery: L("请退回方案，让 Runtime 补全后重新提交。"),
      };
    case "treatment":
      return {
        message: L("“处理方式”必须选择“接受风险、降低风险、避开风险、延后处理”之一，不能填写一整段处理措施。"),
        recovery: L("请在下方选择处理方式；原来的整段文字已保留为具体措施。"),
      };
    case "blocking_mode":
      return {
        message: L("“对 Goal 的影响”不是 GoalBoard 支持的选项。"),
        recovery: L("请退回方案，让 Runtime 重新选择是否阻止开始、完成或在发生时让 Goal 失效。"),
      };
    case "state":
      return {
        message: L(issue.message),
        recovery: L(issue.recovery),
      };
    case "resolution_basis":
      return {
        message: L("这条风险要标记为已解决，但没有留下完整的解决依据。"),
        recovery: L("请补充解决摘要、至少一条证据引用，并明确是否还有剩余缺口。"),
      };
  }
}

function goalTreeDecompositionIssueCopy(
  issue: GoalDecompositionValidationIssue,
  view: GoalBoardWebView,
  proposal: GoalTreeProposalRecord,
): { message: string; recovery: string } {
  const goal = proposedGoalName(issue.goal_id, view, proposal);
  switch (issue.code) {
    case "goal_tree_proposal.leaf_readiness_required":
      return {
        message: L("Goal「{goal}」还没有说明唯一要交付的结果，也没有检查哪些工作应该另拆。", { goal }),
        recovery: L("请退回方案，让 Runtime 补充叶子粒度判断后重新提交。"),
      };
    case "goal_tree_proposal.leaf_readiness_invalid":
      return {
        message: L("Goal「{goal}」没有说清它已经可以直接执行，还是仍需继续拆分。", { goal }),
        recovery: L("请让 Runtime 给出明确结论和判断理由。"),
      };
    case "goal_tree_proposal.leaf_scope_incomplete":
      return {
        message: L("Goal「{goal}」还缺少：{fields}。", {
          goal,
          fields: (issue.missing_fields ?? []).join("、"),
        }),
        recovery: L("请先把边界和输入输出写清楚，再判断它能否直接执行。"),
      };
    case "goal_tree_proposal.leaf_output_coverage_invalid":
      return {
        message: L("Goal「{goal}」没有逐项说明每个承诺结果是主要结果、配套产物，还是应当另拆。", { goal }),
        recovery: L("请让 Runtime 按现有承诺结果逐项补全，不能遗漏或重复。"),
      };
    case "goal_tree_proposal.leaf_primary_output_invalid":
      return {
        message: L("Goal「{goal}」没有确定唯一的主要交付结果。", { goal }),
        recovery: L("请只保留一个主要结果；其他结果只能是同一次验收的配套产物。"),
      };
    case "goal_tree_proposal.leaf_split_candidate_invalid":
      return {
        message: L("Goal「{goal}」有候选工作没有说明要留在当前 Goal，还是拆成独立 Goal。", { goal }),
        recovery: L("请让 Runtime 逐项写明判断和理由。"),
      };
    case "goal_tree_proposal.leaf_split_signal_ignored":
      return {
        message: L("Goal「{goal}」仍包含可单独交付、单独验收或独立返工的工作：{items}。", {
          goal,
          items: (issue.affected_work_items ?? []).join("、"),
        }),
        recovery: L("这些工作至少命中两项拆分信号，必须成为独立 Goal。"),
      };
    case "goal_tree_proposal.leaf_split_verdict_required":
      return {
        message: L("Goal「{goal}」已经指出有工作需要另拆，却仍把整条 Goal 判断为可以直接执行。", { goal }),
        recovery: L("请把结论改为仍需拆分，并提交对应的独立 Goal。"),
      };
    case "goal_tree_proposal.leaf_not_ready":
      return {
        message: L("Goal「{goal}」还有未解决的决定或应当拆出的独立结果，暂时不能直接执行。", { goal }),
        recovery: L("请继续澄清或拆分，处理完后再提交。"),
      };
    case "goal_tree_proposal.leaf_acceptance_evidence_required":
      return {
        message: L("Goal「{goal}」有完成条件没有写清需要什么依据。", { goal }),
        recovery: L("请为每条完成条件补充唯一标识和所需依据。"),
      };
    case "goal_tree_proposal.leaf_acceptance_coverage_invalid":
      return {
        message: L("Goal「{goal}」的叶子判断没有覆盖全部完成条件。", { goal }),
        recovery: L("请逐项引用当前 Goal 的全部完成条件，不能遗漏或引用其他 Goal。"),
      };
    case "goal_tree_proposal.decomposition_review_required":
      return {
        message: L("Goal「{goal}」还没有说明这项任务真正完成需要哪些结果和支撑。", { goal }),
        recovery: L("请退回方案，让 Runtime 补充每条路径由哪个 Goal 负责。"),
      };
    case "goal_tree_proposal.decomposition_review_invalid":
      return {
        message: L("Goal「{goal}」没有说清这棵树是已经拆完，还是这轮先暂停。", { goal }),
        recovery: L("请退回方案，让 Runtime 明确当前状态和下一步。"),
      };
    case "goal_tree_proposal.contract_coverage_required":
      return {
        message: L("Goal「{goal}」还没有逐项说明父级承诺由哪些子 Goal Contract 覆盖。", { goal }),
        recovery: L("请退回方案，让 Runtime 补充父级结果和完成条件到子 Contract 的明确映射。"),
      };
    case "goal_tree_proposal.contract_coverage_incomplete":
      return {
        message: L("Goal「{goal}」仍有父级承诺或完成条件只是部分覆盖、尚未覆盖，或仍需父级集成。", { goal }),
        recovery: L("请继续保持父 Goal 开放，直到每一项都由子 Contract 完整覆盖。"),
      };
    case "goal_tree_proposal.contract_coverage_reference_invalid":
      return {
        message: L("Goal「{goal}」的覆盖映射引用了不存在、不是后代或名称不匹配的子级结果。", { goal }),
        recovery: L("请引用当前子树中真实存在的 Goal ID、承诺结果和完成条件 ID。"),
      };
    case "goal_tree_proposal.product_path_incomplete":
      return {
        message: L("Goal「{goal}」还没有交代：{areas}。", {
          goal,
          areas: (issue.missing_areas ?? [])
            .map((area) => L(PRODUCT_PATH_AREA_LABELS[area as ProductPathArea] ?? area))
            .join("、"),
        }),
        recovery: L("请让 Runtime 指定负责的 Goal，或说明为什么不适用。"),
      };
    case "goal_tree_proposal.product_path_entry_invalid":
    case "goal_tree_proposal.product_path_owner_required":
      return {
        message: L("Goal「{goal}」有关键路径没有写清由谁负责。", { goal }),
        recovery: L("请让 Runtime 指定一个实际承担结果的子 Goal，或说明为什么不适用。"),
      };
    case "goal_tree_proposal.product_path_owner_unrelated":
      return {
        message: L("Goal「{goal}」把一条关键路径交给了不属于这棵子树的 Goal。", { goal }),
        recovery: L("请让 Runtime 补上正确的父子关系，或改为真正负责的子 Goal。"),
      };
    case "goal_tree_proposal.foundation_dependency_required":
      return {
        message: L("Goal「{goal}」的核心能力与基础能力之间缺少依赖：{owners}。", {
          goal,
          owners: (issue.affected_work_items ?? []).map((owner) => proposedGoalName(owner, view, proposal)).join("、"),
        }),
        recovery: L("请补上“核心能力 Goal 依赖基础能力 Goal”的关系，并说明依赖原因。"),
      };
    case "goal_tree_proposal.decomposition_pause_invalid":
      return {
        message: L("Goal「{goal}」说这轮先暂停，但没有留下继续拆解的 Goal 和下一步。", { goal }),
        recovery: L("请让 Runtime 写明接下来继续澄清哪条 Goal、要确认什么。"),
      };
    case "goal_tree_proposal.decomposition_not_complete":
      return {
        message: L("Goal「{goal}」还有未完成的拆解，不能标记为已经拆完。", { goal }),
        recovery: L("请继续拆解，或把这轮明确保存为阶段性暂停。"),
      };
    case "goal_tree_proposal.compound_children_required":
      return {
        message: L("Goal「{goal}」下面还没有实际子 Goal，不能称为复合目标。", { goal }),
        recovery: L("请先添加能独立推进的子 Goal。"),
      };
    case "goal_tree_proposal.open_descendants": {
      const openGoals = (issue.open_goal_ids ?? []).map((goalId) => proposedGoalName(goalId, view, proposal));
      return {
        message: L("Goal「{goal}」下面仍有 {count} 条目标没拆完：{openGoals}。", {
          goal,
          count: openGoals.length,
          openGoals: openGoals.join("、"),
        }),
        recovery: L("请继续拆这些目标，或把父 Goal 保持为“仍需拆分”。"),
      };
    }
    default:
      return { message: issue.message, recovery: issue.recovery };
  }
}

function renderGoalTreeRiskRepair(item: GoalTreeProposalRecord["items"][number]): string {
  const payload = item.payload;
  const currentTreatment = String(payload.treatment ?? "") as RiskRecord["treatment"];
  const submittedPlan = String(payload.treatment_plan ?? "").trim()
    || (RISK_TREATMENT_LABELS[currentTreatment] ? "" : String(payload.treatment ?? "").trim());
  const choices: Array<[RiskRecord["treatment"], string, string]> = [
    ["mitigate", "降低风险", "保留方案，同时采取措施降低发生概率或影响"],
    ["avoid", "避开风险", "改变方案或范围，避免风险出现"],
    ["defer", "延后处理", "暂不采取措施，到复查条件出现时再决定"],
    ["accept", "接受风险", "按现有方案继续，并明确承担可能影响"],
  ];
  const groupName = `risk-treatment-${item.item_id}`;
  return `<section class="goal-tree-risk-repair" data-risk-proposal-repair data-risk-item-id="${escapeHtml(item.item_id)}">
    <h4>${L("你需要决定：这条风险怎么处理？")}</h4>
    <p>${L("选择一种处理方式。保存后会生成修订版，不会立即采用整份方案。")}</p>
    <div class="goal-tree-risk-options">${choices.map(([value, label, effect]) => `<label><input type="radio" name="${escapeHtml(groupName)}" value="${value}"${currentTreatment === value ? " checked" : ""}><span><strong>${L(label)}</strong><small>${L(effect)}</small></span></label>`).join("")}</div>
    <details class="goal-tree-risk-plan-editor"><summary><span>${L("查看或修改具体措施")}<small>${submittedPlan ? L("已保留原方案的内容") : L("当前没有具体措施")}</small></span>${icon("chevron-down")}</summary><label class="goal-tree-risk-plan"><span>${L("具体措施")} <small>${L("可以修改，也可以留空")}</small></span><textarea rows="3" data-risk-treatment-plan placeholder="${L("写清准备采取的措施；这和上面的处理方式会分开保存")}">${escapeHtml(submittedPlan)}</textarea></label></details>
    <p class="form-error" data-risk-repair-error role="alert" hidden></p>
  </section>`;
}

function renderGoalTreeProposalDecision(proposal: GoalTreeProposalRecord, view: GoalBoardWebView): string {
  const undecidedItems = proposal.items.filter((item) => item.state === "pending" || item.state === "conflict");
  const riskIssuesByItem = new Map(
    undecidedItems
      .map((item) => [item.item_id, goalTreeProposalItemValidationIssues(item)] as const)
      .filter(([, issues]) => issues.length),
  );
  const decompositionIssues = goalTreeProposalDecompositionIssues(undecidedItems, view.snapshot);
  const decompositionIssuesByItem = new Map<string, GoalDecompositionValidationIssue[]>();
  for (const issue of decompositionIssues) {
    const current = decompositionIssuesByItem.get(issue.item_id) ?? [];
    current.push(issue);
    decompositionIssuesByItem.set(issue.item_id, current);
  }
  const issuesByItem = new Map<string, Array<{ message: string; recovery: string }>>();
  for (const item of undecidedItems) {
    const persistedConflict = item.state === "conflict"
      ? [{
          message: String(item.conflict?.message ?? L("这份方案仍有不能安全写入的内容，需要修正后再确认。")),
          recovery: String(item.conflict?.recovery ?? L("当前 Goal Tree 不会改变；Runtime 会根据你的意见重新整理方案。")),
        }]
      : [];
    const issues = [
      ...persistedConflict,
      ...(riskIssuesByItem.get(item.item_id) ?? []).map(goalTreeProposalIssueCopy),
      ...(decompositionIssuesByItem.get(item.item_id) ?? []).map((issue) =>
        goalTreeDecompositionIssueCopy(issue, view, proposal)),
    ];
    if (issues.length) issuesByItem.set(item.item_id, issues);
  }
  const repairableRiskItemIds = new Set(
    undecidedItems
      .filter((item) => {
        const issues = riskIssuesByItem.get(item.item_id) ?? [];
        return item.kind === "risk" && issues.length > 0 && issues.every((issue) => issue.field === "treatment");
      })
      .map((item) => item.item_id),
  );
  const repairableRiskItemCount = repairableRiskItemIds.size;
  const riskInvalidItemCount = riskIssuesByItem.size;
  const decompositionInvalidItemCount = decompositionIssuesByItem.size;
  const leafIssueFields = new Set<GoalDecompositionValidationIssue["field"]>([
    "leaf_readiness",
    "leaf_scope",
    "output_coverage",
    "split_candidates",
    "acceptance_coverage",
  ]);
  const leafInvalidItemCount = new Set(
    decompositionIssues.filter((issue) => leafIssueFields.has(issue.field)).map((issue) => issue.item_id),
  ).size;
  const compoundInvalidItemCount = new Set(
    decompositionIssues.filter((issue) => !leafIssueFields.has(issue.field)).map((issue) => issue.item_id),
  ).size;
  const leafOnly = leafInvalidItemCount > 0 && compoundInvalidItemCount === 0 && riskInvalidItemCount === 0;
  const invalidItemCount = issuesByItem.size;
  const runtimeInvalidItemCount = [...issuesByItem.keys()].filter((itemId) => !repairableRiskItemIds.has(itemId)).length;
  const actionableItems = undecidedItems.filter((item) => item.state === "pending" && !issuesByItem.has(item.item_id));
  const conflictCount = undecidedItems.filter((item) => item.state === "conflict").length;
  const problemItems = undecidedItems.filter((item) => item.state === "conflict" || issuesByItem.has(item.item_id));
  const otherItems = undecidedItems.filter((item) => !problemItems.includes(item));
  const problemCount = problemItems.length;
  const contractItem = proposal.items.find((item) =>
    (item.kind === "contract" || item.kind === "goal") &&
    String(goalTreeGoalPayload(item.payload).goal_id ?? "") === String(proposal.root_goal_id ?? ""),
  ) ?? proposal.items.find((item) => item.kind === "contract")
    ?? proposal.items.find((item) => item.kind === "goal");
  const contractPayload = contractItem ? goalTreeGoalPayload(contractItem.payload) : null;
  const proposedTitle = String(contractPayload?.title ?? findGoalView(view, proposal.root_goal_id)?.goal.title ?? L("这份 Goal 方案"));
  const proposedOutcome = String(contractPayload?.outcome ?? proposal.summary).trim();
  const acceptance = Array.isArray(contractPayload?.acceptance_criteria)
    ? contractPayload.acceptance_criteria as Array<Record<string, unknown>>
    : [];
  const inScope = Array.isArray(contractPayload?.in_scope) ? contractPayload.in_scope.map(String) : [];
  const outOfScope = Array.isArray(contractPayload?.out_of_scope) ? contractPayload.out_of_scope.map(String) : [];
  const semanticItemCopies = new Map(
    proposal.items.map((item) => [item.item_id, goalTreeProposalItemCopy(item, view, proposal)]),
  );
  const narrative = proposal.narrative;
  const narrativeSummary = narrative
    ? `<section class="goal-tree-proposal-narrative" aria-label="${L("变更说明")}">
        <h4>${L("这次变更主要解决什么？")}</h4>
        <dl>
          <div><dt>${L("为什么现在改")}</dt><dd>${escapeHtml(narrative.why_now)}</dd></div>
          <div><dt>${L("原目标哪里不再成立")}</dt><dd>${escapeHtml(narrative.problem)}</dd></div>
          <div><dt>${L("变更后的主链路")}</dt><dd><ol>${narrative.main_path.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol></dd></div>
          <div><dt>${L("预期效果")}</dt><dd>${escapeHtml(narrative.expected_effect)}</dd></div>
          <div><dt>${L("本次不改变")}</dt><dd>${narrative.non_goals.length ? `<ul>${narrative.non_goals.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : L("没有额外非目标")}</dd></div>
        </dl>
      </section>`
    : proposal.items.length >= 5
      ? `<section class="goal-tree-proposal-narrative is-missing" role="note"><h4>${L("这份历史方案缺少整体验证说明")}</h4><p>${L("它创建于语义摘要成为大型提案必填项之前。请先让 Runtime 补充原问题、变更后的主链路、预期效果和非目标，再决定是否采用。")}</p></section>`
      : "";
  const renderItemRow = (item: GoalTreeProposalRecord["items"][number]): string => {
    const copy = goalTreeProposalItemCopy(item, view, proposal);
    const explanation = item.explanation;
    const dependencyLabels = (explanation?.depends_on_item_ids ?? []).map((itemId) =>
      semanticItemCopies.get(itemId)?.title ?? itemId);
    const semanticExplanation = `<dl class="goal-tree-proposal-item-explanation">
      <div><dt>${L("主要解决")}</dt><dd>${escapeHtml(explanation?.problem ?? item.reason)}</dd></div>
      ${explanation ? `<div><dt>${L("会改变什么")}</dt><dd>${escapeHtml(explanation.expected_effect)}</dd></div>
      <div><dt>${L("明确不改变")}</dt><dd>${explanation.non_goals.length ? escapeHtml(explanation.non_goals.join(L("；"))) : L("没有额外边界")}</dd></div>
      <div><dt>${L("关联变更")}</dt><dd>${dependencyLabels.length ? escapeHtml(dependencyLabels.join(L("；"))) : L("可独立理解，无前置 change")}</dd></div>` : ""}
    </dl>`;
    const issueCopy = issuesByItem.get(item.item_id) ?? [];
    const riskRepair = repairableRiskItemIds.has(item.item_id) ? renderGoalTreeRiskRepair(item) : "";
    const blocked = item.state === "conflict" || issueCopy.length > 0;
    return `<li class="goal-tree-proposal-item${item.state === "conflict" ? " is-conflict" : ""}${issueCopy.length ? " is-invalid" : ""}">
      <input type="hidden" name="item_id" value="${escapeHtml(item.item_id)}">
      <span>${icon(blocked ? "blocked" : "check")}</span><div><strong>${escapeHtml(copy.title)}</strong><small>${escapeHtml(copy.detail)}</small>${semanticExplanation}${copy.facts.length ? `<ul class="goal-tree-proposal-item-facts">${copy.facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join("")}</ul>` : ""}${issueCopy.length ? `<div class="goal-tree-proposal-item-error"><strong>${riskRepair ? L("这项需要你选择处理方式") : L("这项现在不能采用")}</strong>${issueCopy.map((issue) => `<p>${escapeHtml(issue.message)} ${escapeHtml(issue.recovery)}</p>`).join("")}</div>` : ""}${riskRepair}</div>
    </li>`;
  };
  const itemRows = undecidedItems.map(renderItemRow).join("");
  const problemRows = problemItems.map(renderItemRow).join("");
  const otherRows = otherItems.map(renderItemRow).join("");
  const conflictMessage = conflictCount
    ? `<p class="goal-tree-proposal-conflict" role="status">${L("其中 {count} 项已经和当前 GoalBoard 状态不一致。请退回方案，让 Runtime 按最新状态重新整理。", { count: conflictCount })}</p>`
    : "";
  const riskOnly = riskInvalidItemCount > 0 && decompositionInvalidItemCount === 0;
  const decompositionOnly = decompositionInvalidItemCount > 0 && riskInvalidItemCount === 0;
  const invalidHeading = repairableRiskItemCount
    ? runtimeInvalidItemCount
      ? L("这份方案有 {riskCount} 条风险需要你选择，另有 {otherCount} 项需要补全", {
          riskCount: repairableRiskItemCount,
          otherCount: runtimeInvalidItemCount,
        })
      : L("这份方案有 {count} 条风险需要你选择处理方式", { count: repairableRiskItemCount })
    : riskOnly
      ? L("这份方案有 {count} 条风险信息需要修正", { count: invalidItemCount })
      : leafOnly
        ? L("这份方案有 {count} 个 Goal 还没拆到可以直接执行", { count: leafInvalidItemCount })
        : decompositionOnly
        ? L("这份方案有 {count} 个 Goal 的拆解还不完整", { count: invalidItemCount })
        : L("这份方案有 {count} 项内容需要修正", { count: invalidItemCount });
  const invalidSummary = repairableRiskItemCount
    ? runtimeInvalidItemCount
      ? L("先为下面 {riskCount} 条风险选择处理方式并保存。选择不会丢失；保存后仍有 {otherCount} 项需要 Runtime 补全。", {
          riskCount: repairableRiskItemCount,
          otherCount: runtimeInvalidItemCount,
        })
      : L("请为下面 {count} 条风险选择处理方式。原来的具体措施已经保留，你可以修改后一起保存。", { count: repairableRiskItemCount })
    : riskOnly
      ? L("其中 {count} 条风险信息需要 Runtime 修正。这些风险还没有写入 GoalBoard。", { count: invalidItemCount })
      : leafOnly
        ? L("这些 Goal 仍包含多个可独立交付的结果，或没有说明唯一主要结果和完成依据。", { count: leafInvalidItemCount })
        : decompositionOnly
        ? L("其中 {count} 个 Goal 还没有交代通用结果链、当前任务的必要路径，或下面仍有目标没有拆完。", { count: invalidItemCount })
        : L("当前有内容不满足 GoalBoard 的写入规则，修正前不会写入 Goal Tree。");
  const invalidWhy = repairableRiskItemCount
    ? L("风险怎么处理应当由你决定。GoalBoard 会把处理类别和具体措施分开保存，并保留方案的其他内容。")
    : riskOnly
      ? L("Runtime 提交的风险信息不符合 GoalBoard 的记录规则，需要修正后才能采用整份方案。")
      : leafOnly
        ? L("一条可执行 Goal 只能交付一个主要结果；能单独交付、验收或返工的工作需要拆开。")
        : decompositionOnly
        ? L("这份方案还不能证明任务要完成所需的结果、核心能力和支撑基础都有人负责，也不能证明所有子 Goal 已经拆到可执行。")
        : L("这份方案仍有不能安全写入的内容，需要修正后再确认。");
  const invalidBasis = repairableRiskItemCount
    ? runtimeInvalidItemCount
      ? L("你可以先保存 {riskCount} 条风险选择；另外 {otherCount} 项不会被掩盖，仍会明确留在待处理。", {
          riskCount: repairableRiskItemCount,
          otherCount: runtimeInvalidItemCount,
        })
      : L("保存后会生成完整修订版，其他 Goal 和关系内容保持不变。")
    : riskOnly
      ? L("当前有 {count} 条风险无法写入；退回不会改变现有 Goal Tree。", { count: invalidItemCount })
      : leafOnly
        ? L("当前有 {count} 个 Goal 仍需继续拆分；退回不会改变现有 Goal Tree。", { count: leafInvalidItemCount })
        : decompositionOnly
        ? L("当前有 {count} 个 Goal 的结果链、任务路径或开放分支没有交代清楚；退回不会改变现有 Goal Tree。", { count: invalidItemCount })
        : L("当前有 {count} 项内容无法写入；退回不会改变现有 Goal Tree。", { count: invalidItemCount });
  const disabledConfirmLabel = repairableRiskItemCount
    ? runtimeInvalidItemCount ? L("还需补全其余问题") : L("先保存风险处理")
    : riskOnly
      ? L("先修正方案中的风险")
      : leafOnly
        ? L("先拆成可执行 Goal")
        : decompositionOnly
        ? L("先补全 Goal 拆解")
        : L("先修正方案");
  const invalidMessage = invalidItemCount
    ? `<section class="goal-tree-proposal-readiness" role="alert"><div>${icon("blocked")}</div><div><h4>${L("这份方案暂时不能采用")}</h4><p>${invalidSummary}</p><strong>${repairableRiskItemCount ? L("你现在需要做：逐条选择风险处理方式，然后保存选择。") : L("你现在需要做：点击“退回修正”。GoalBoard 会自动附上这些问题。")}</strong></div></section>`
    : "";
  return `<form class="decision-record goal-tree-proposal-decision" data-goal-tree-decision-form data-live-form="goal-tree-${escapeHtml(proposal.proposal_id)}" data-goal-tree-proposal-id="${escapeHtml(proposal.proposal_id)}" data-has-system-issues="${problemCount ? "true" : "false"}" novalidate>
    <header class="decision-record-heading"><span class="decision-kind">${icon("tree")} ${L("目标说明")}${renderNewDecisionBadge(proposal.created_at, view, "goalTree", proposal.proposal_id)}</span><details class="decision-record-tech"><summary>${L("记录信息")}</summary><small>${L("方案版本 {version}", { version: proposal.version })} · ${escapeHtml(proposal.proposal_id)}</small></details></header>
    <div class="decision-record-body"><h3>${invalidItemCount ? invalidHeading : L("这份 Goal 方案要采用，还是退回修改？")}</h3><p>${invalidItemCount ? repairableRiskItemCount ? L("方案中的其他内容仍可查看。先完成下面的风险选择；保存后页面会继续列出剩余问题。") : L("方案中的其他内容仍可查看，但当前不能写入 Goal Tree。请先退回，让 Runtime 修正后重新提交。") : L("Runtime 已经把目标、完成条件和关系变化整理成一份方案。采用后这些内容才会进入 Goal Tree；退回则保持当前内容不变。")}</p>
      <div class="goal-tree-proposal-summary"><small>${L("准备确认的 Goal")}</small><strong>${escapeHtml(proposedTitle)}</strong><p>${escapeHtml(proposedOutcome)}</p></div>
      ${narrativeSummary}
      ${invalidMessage}
      ${renderDecisionGuidance({
        whyNow: invalidItemCount
          ? invalidWhy
          : L("目标已经整理完，现在只差你确认这份方案是否准确。"),
        recommendation: invalidItemCount ? repairableRiskItemCount ? L("先完成风险选择") : L("退回修正") : null,
        recommendationBasis: invalidItemCount ? invalidBasis : undefined,
        insufficient: L("方案是否符合你的真实意图，需要由你判断。"),
        consequences: invalidItemCount
          ? [
              ...(repairableRiskItemCount ? [{
                choice: L("保存风险处理"),
                effect: runtimeInvalidItemCount
                  ? L("风险选择会进入完整修订版；其余 {count} 项仍会留在页面等待补全。", { count: runtimeInvalidItemCount })
                  : L("风险选择会进入完整修订版；其他方案内容保持不变，之后可以确认整份方案。"),
              }] : []),
              { choice: L("退回修正"), effect: L("当前 Goal Tree 保持不变；GoalBoard 会附上上方问题，Runtime 据此提交修正后的新版本。") },
              { choice: L("采用整份方案（当前不可用）"), effect: L("方案修正前，系统不会写入任何变化。") },
            ]
          : [
              { choice: L("采用整份方案"), effect: L("下面列出的目标和关系变化会一起生效，Goal 会进入相应的下一阶段。") },
              { choice: L("退回修改"), effect: L("当前 Goal Tree 不会改变；Runtime 会根据你的意见重新整理方案。") },
            ],
      })}${renderGoalTreeProposalScenario(proposal, view, undecidedItems)}
    </div>
    ${problemCount
      ? `<details class="decision-details goal-tree-proposal-changes" open><summary><span>${L("先处理这 {count} 项", { count: problemCount })}<small>${L("需要你选择或让 Runtime 补全")}</small></span>${icon("chevron-down")}</summary><ol>${problemRows}</ol>${conflictMessage}</details>${otherItems.length ? `<details class="decision-details goal-tree-proposal-changes"><summary><span>${L("查看其余 {count} 项变化", { count: otherItems.length })}<small>${L("这些内容当前不需要你操作")}</small></span>${icon("chevron-down")}</summary><ol>${otherRows}</ol></details>` : ""}`
      : `<details class="decision-details goal-tree-proposal-changes"><summary><span>${L("查看采用后的 {count} 项变化", { count: undecidedItems.length })}<small>${L("展开查看每项变化")}</small></span>${icon("chevron-down")}</summary><ol>${itemRows}</ol></details>`}
    ${(acceptance.length || inScope.length || outOfScope.length) ? `<details class="decision-details"><summary>${L("查看范围和完成条件")}${icon("chevron-down")}</summary><div class="goal-tree-proposal-details">
      ${inScope.length ? `<section><h4>${L("这次会做")}</h4>${renderList(inScope, "")}</section>` : ""}
      ${outOfScope.length ? `<section><h4>${L("这次不做")}</h4>${renderList(outOfScope, "")}</section>` : ""}
      ${acceptance.length ? `<section class="goal-tree-proposal-acceptance"><h4>${L("完成条件")}</h4><ol>${acceptance.map((criterion) => `<li><strong>${escapeHtml(criterion.statement)}</strong><small>${escapeHtml(criterion.pass_condition)}</small></li>`).join("")}</ol></section>` : ""}
    </div></details>` : ""}
    ${problemCount
      ? `<label class="decision-reason"><span>${L("补充说明")}（${L("可选")}）</span><textarea name="reason" rows="3" placeholder="${L("GoalBoard 会自动附上上方问题；只有想补充时才填写")}"></textarea></label>`
      : `<label class="decision-reason"><span>${L("决定理由或修改意见")}（${L("必填")}）</span><textarea name="reason" rows="3" required placeholder="${L("采用时说明为什么方案准确；退回时写清需要修改什么")}"></textarea></label>`}
    <p class="form-error" data-decision-error role="alert" hidden></p>
    <footer class="decision-actions"><button type="submit" name="decision" value="reject">${problemCount ? L("退回修正") : L("退回修改")}</button>${repairableRiskItemCount ? `<button class="button-primary" type="submit" name="decision" value="repair-risks">${L("保存 {count} 条风险处理", { count: repairableRiskItemCount })}</button>` : ""}<button class="${repairableRiskItemCount ? "" : "button-primary"}" type="submit" name="decision" value="confirm"${problemCount || !actionableItems.length ? ` disabled aria-disabled="true"` : ""}>${invalidItemCount ? disabledConfirmLabel : conflictCount ? L("先更新冲突项") : L("采用整份方案")}</button></footer>
  </form>`;
}

function renderCandidateDecision(candidate: CandidateGoalRecord, view: GoalBoardWebView): string {
  const copy = explainDecision("candidate");
  const proposed = candidate.proposed_goal;
  const owner = findGoalView(view, candidateOwnerGoalId(candidate, view));
  const policy = projectDefaultPolicy(view);
  const acceptance = proposed.acceptance_criteria ?? [];
  const separation = owner
    ? L("来源 Goal 当前要做的是「{source}」；这项新工作要独立交付「{output}」。请判断它是否确实不该放在原 Goal 里。", {
        source: owner.goal.in_scope.join("；") || owner.goal.outcome || L("未记录"),
        output: proposed.promised_outputs?.join("；") || proposed.outcome,
      })
    : L("这项新工作没有关联到发现它的推进记录。请先确认来源和独立交付结果，再决定是否加入。");
  const blockingCopy = candidate.blocking_mode === "none"
    ? L("不影响当前工作")
    : candidate.blocking_mode === "current_run"
      ? L("当前工作会等待你的决定")
      : L("后续相关工作会等待你的决定");
  const confirmEffect = owner
    ? L("会新建独立 Goal「{title}」；它不会自动成为「{owner}」的子 Goal，也不会自动开始执行。需要调整归属或依赖时，会作为另一项决定出现。", {
        title: proposed.title,
        owner: owner.goal.title,
      })
    : L("会新建独立 Goal「{title}」；它不会自动和现有 Goal 建立归属或依赖，也不会自动开始执行。", {
        title: proposed.title,
      });
  return `<form class="decision-record candidate-decision" data-candidate-decision-form data-live-form="candidate-${escapeHtml(candidate.candidate_id)}" data-candidate-id="${escapeHtml(candidate.candidate_id)}" novalidate>
    <header class="decision-record-heading"><span class="decision-kind decision-kind--candidate">${icon("plus")} ${L("新发现的工作")}${renderNewDecisionBadge(candidate.created_at, view, "candidate", candidate.candidate_id)}</span><details class="decision-record-tech"><summary>${L("记录信息")}</summary><small>Candidate · ${escapeHtml(candidate.candidate_id)}</small></details></header>
    <div class="decision-record-body"><h3>${escapeHtml(copy.question)}</h3><p>${escapeHtml(copy.purpose)}</p><div class="candidate-title"><div><small>${L("准备加入的新 Goal")}</small><h3>${escapeHtml(proposed.title)}</h3><p>${escapeHtml(proposed.outcome)}</p></div><span>${escapeHtml(blockingCopy)}</span></div><p class="decision-key-fact"><strong>${L("为什么要单独拆出来：")}</strong>${escapeHtml(separation)}</p>${renderDecisionGuidance({
      whyNow: L("推进过程中发现了一项可能超出原 Goal 的工作，需要你决定是否把它单独管理。"),
      recommendation: null,
      insufficient: copy.insufficientEvidence,
      consequences: [
        { choice: L("加入 Goal Tree"), effect: L("创建一条独立 Goal；如果还要调整归属或依赖，会作为下一项决定单独出现。") },
        { choice: L("暂不加入"), effect: L("不会创建新 Goal；你的理由会保留，提交者可以补充后再提。") },
      ],
    })}${renderDecisionScenario({
      confirmLabel: L("如果加入"),
      confirmEffect,
      rejectLabel: L("如果暂不加入"),
      rejectEffect: L("不会创建 Goal「{title}」；当前 Goal Tree 保持不变，你的理由会保留。", { title: proposed.title }),
    })}</div>
    <details class="decision-details"><summary>${L("查看完整范围、完成标准和影响")}${icon("chevron-down")}</summary><dl class="candidate-contract">
      <div><dt>${L("为什么现在做")}</dt><dd>${escapeHtml(proposed.why)}</dd></div>
      <div><dt>${L("它会怎样运转")}</dt><dd>${escapeHtml(proposed.business_logic)}</dd></div>
      <div><dt>${L("这次会做")}</dt><dd>${renderCandidateList(proposed.in_scope, "未记录")}</dd></div>
      <div><dt>${L("这次不做")}</dt><dd>${renderCandidateList(proposed.out_of_scope, "未记录")}</dd></div>
      <div class="candidate-wide"><dt>${L("完成标准")}</dt><dd>${acceptance.length ? `<ol class="candidate-acceptance">${acceptance.map((criterion) => `<li><strong>${escapeHtml(criterion.statement)}</strong><small>${escapeHtml(criterion.pass_condition)}</small></li>`).join("")}</ol>` : `<p class="empty-row">${L("未记录验收条件")}</p>`}</dd></div>
      <div><dt>${L("影响范围")}</dt><dd>${candidate.proposed_impacts.length ? renderList(candidate.proposed_impacts.map((impact) => recordSummary(impact, "impact")), "") : `<p class="empty-row">${L("没有提议影响范围")}</p>`}</dd></div>
      <div><dt>${L("风险")}</dt><dd>${candidate.proposed_risks.length ? renderList(candidate.proposed_risks.map((risk) => recordSummary(risk, "risk")), "") : `<p class="empty-row">${L("没有提议风险")}</p>`}</dd></div>
      <div class="candidate-wide"><dt>${L("完成前需要的检查")}</dt><dd>${L("沿用项目当前规则：推进者自检 {self}；独立检查 {reviews} 次；用户最终确认 {human}。", { self: policy.self_verification ? L("需要") : L("不需要"), reviews: policy.cross_reviewers + policy.adversarial_reviewers, human: policy.human_approval ? L("需要") : L("不需要") })}</dd></div>
    </dl></details>
    <label class="decision-reason"><span>${L("决定理由或修改意见")}（${L("必填")}）</span><textarea name="reason" rows="3" required placeholder="${L("说明为什么纳入；或写清退回后需要怎样调整")}"></textarea></label>
    <p class="form-error" data-decision-error role="alert" hidden></p>
    <footer class="decision-actions"><button type="submit" name="decision" value="rejected">${L("暂不加入")}</button><button class="button-primary" type="submit" name="decision" value="approved">${L("加入 Goal Tree")}</button></footer>
  </form>`;
}

function renderRiskDecision(risk: RiskRecord, item: WebGoalView | null, view: GoalBoardWebView): string {
  const copy = explainDecision("risk");
  const href = item ? `${item.goal.archived_at ? "/archive/goals/" : "/goals/"}${encodeURIComponent(item.goal.goal_id)}#risk-${encodeURIComponent(risk.risk_id)}` : "#";
  const affectedGoals = allGoalViews(view).filter((goalView) => goalView.risks.some((itemRisk) => itemRisk.risk_id === risk.risk_id));
  const riskOwner = affectedGoals.find((goalView) => goalView.action_projection.actions.some((action) =>
    action.actor === "user" && action.target_type === "risk" && action.target_id === risk.risk_id
  )) ?? item;
  const riskAction = riskOwner?.action_projection.actions.find((action) =>
    action.actor === "user" && action.target_type === "risk" && action.target_id === risk.risk_id
  );
  const stateOptions = `<option value="" selected disabled>${L("请选择处理结果")}</option><option value="accepted">${L("接受这项风险")}</option><option value="rejected">${L("不接受，改为继续处理")}</option>`;
  return `<form class="decision-record risk-decision" data-risk-state-form data-live-form="risk-decision-${escapeHtml(risk.risk_id)}" data-risk-id="${escapeHtml(risk.risk_id)}" data-risk-blocking="${escapeHtml(risk.blocking_mode)}" data-goal-id="${escapeHtml(riskOwner?.goal.goal_id ?? "")}" data-action-id="${escapeHtml(riskAction?.action_id ?? "")}" data-action-token="${escapeHtml(riskOwner?.action_projection.action_token ?? "")}" data-contract-revision="${riskOwner?.goal.current_contract_revision ?? 1}" novalidate>
    <header class="decision-record-heading"><span class="decision-kind decision-kind--risk">${icon("risk")} ${L("风险处理")}${renderNewDecisionBadge(riskDecisionCreatedAt(risk, view), view, "risk", risk.risk_id)}</span><span class="risk-state risk-state--${escapeHtml(risk.state)}">${escapeHtml(L(RISK_STATE_LABELS[risk.state]))}</span></header>
    <div class="decision-record-body"><h3>${escapeHtml(copy.question)}</h3><p>${escapeHtml(copy.purpose)}</p><div class="risk-decision-fact"><strong>${escapeHtml(risk.description)}</strong><p>${L("发生概率：")}${escapeHtml(risk.probability)} · ${L("影响程度：")}${escapeHtml(risk.impact)}</p><small>${L("当前计划：")}${escapeHtml(L(RISK_TREATMENT_LABELS[risk.treatment]))}；${L("负责人：")}${escapeHtml(risk.owner)}</small></div>${renderDecisionGuidance({
      whyNow: riskStateEffect(risk.blocking_mode, risk.state),
      recommendation: null,
      insufficient: copy.insufficientEvidence,
      consequences: [
        { choice: L("继续跟踪"), effect: L("风险保持开放，并继续按照当前规则影响关联 Goal。") },
        { choice: L("标记为已处理或接受"), effect: L("风险不再阻止领取或完成；决定理由会保留在记录中。") },
        { choice: L("标记为已经发生"), effect: risk.blocking_mode === "invalidate_on_trigger" ? L("所有关联 Goal 会立即失效并需要重新确认。") : L("风险会进入已触发状态，并继续应用当前阻塞规则。") },
      ],
    })}<details class="decision-details"><summary>${L("查看触发条件和复查条件")}${icon("chevron-down")}</summary><dl class="risk-decision-details"><div><dt>${L("什么情况算已经发生")}</dt><dd>${escapeHtml(risk.trigger)}</dd></div><div><dt>${L("什么时候重新判断")}</dt><dd>${escapeHtml(risk.revisit_condition)}</dd></div></dl></details></div>
    <div class="risk-goal-links"><span>${L("关联 Goal")}</span><div>${affectedGoals.length ? affectedGoals.map((goalView) => renderDecisionGoalLink(goalView)).join("") : "未关联 Goal"}</div></div>
    <div class="risk-decision-choice"><label><span>${L("你决定怎么处理")}</span><select name="state" data-risk-state-select required>${stateOptions}</select></label><p class="risk-state-preview" data-risk-state-preview>${L("选择处理结果后，这里会说明会发生什么。")}</p></div>
    <div class="risk-resolution-fields" data-risk-resolution-basis hidden>
      <label><span>${L("解决摘要")}（${L("必填")}）</span><textarea name="resolution_summary" rows="2" placeholder="${L("说明什么事实证明这条风险已经按当前边界解决")}"></textarea></label>
      <label><span>${L("证据引用")}（${L("每行一条，至少一条")}）</span><textarea name="resolution_evidence_refs" rows="2" placeholder="evidence://...&#10;conversation://..."></textarea></label>
      <label><span>${L("剩余缺口")}（${L("每行一条；没有可留空")}）</span><textarea name="resolution_residual_gaps" rows="2" placeholder="${L("仍需观察或不在本次解决范围内的边界")}"></textarea></label>
    </div>
    <label class="decision-reason"><span>${L("决定理由")}（${L("必填")}）</span><textarea name="reason" rows="2" required placeholder="${L("说明为什么现在这样处理，以及你依据了什么")}"></textarea></label>
    <p class="form-error" data-risk-error role="alert" hidden></p>
    <footer class="decision-actions"><span>${item ? `<a href="${href}">${L("返回 Goal 查看完整风险记录")}</a>` : ""}</span><button class="button-primary" type="submit">${L("保存风险决定")}</button></footer>
  </form>`;
}

interface RecentDecisionResult {
  event: WebEventRecord;
  kind: "risk" | "rewire" | "goalTree" | "contract" | "candidate" | "review";
  kindLabel: string;
  state: string;
  title: string;
  effects: string[];
  links: Array<{ href: string; label: string }>;
  reason?: string;
  reasonLabel?: string;
}

function eventPayload(event: WebEventRecord): Record<string, unknown> {
  return event.payload != null && typeof event.payload === "object" && !Array.isArray(event.payload)
    ? event.payload as Record<string, unknown>
    : {};
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function goalResultHref(item: WebGoalView, anchor: string): string {
  const base = item.goal.trashed_at
    ? "/trash/goals/"
    : item.goal.archived_at
      ? "/archive/goals/"
      : "/goals/";
  return `${base}${encodeURIComponent(item.goal.goal_id)}#${encodeURIComponent(anchor)}`;
}

function recentDecisionResults(view: GoalBoardWebView): RecentDecisionResult[] {
  const results: RecentDecisionResult[] = [];
  const seen = new Set<string>();
  const allGoals = allGoalViews(view);
  const goalById = new Map(allGoals.map((item) => [item.goal.goal_id, item]));
  const relationById = new Map(view.snapshot.relations.map((relation) => [relation.relation_id, relation]));
  const riskById = new Map(view.snapshot.risks.map((risk) => [risk.risk_id, risk]));
  const rewireById = new Map(view.snapshot.rewires.map((rewire) => [rewire.rewire_id, rewire]));
  const contractById = new Map(view.snapshot.contract_proposals.map((proposal) => [proposal.proposal_id, proposal]));
  const candidateById = new Map(view.snapshot.candidates.map((candidate) => [candidate.candidate_id, candidate]));
  const goalTreeById = new Map(view.snapshot.goal_tree_proposals.map((proposal) => [proposal.proposal_id, proposal]));
  const reviewById = new Map(view.snapshot.reviews.map((review) => [review.review_id, review]));
  const reviewObligationById = new Map(
    view.snapshot.review_obligations.map((obligation) => [obligation.obligation_id, obligation]),
  );

  for (const event of view.events) {
    if (results.length >= 6) break;
    const seenKey = `${event.object_type}:${event.object_id}`;
    if (seen.has(seenKey)) continue;
    if (["risk.open", "risk.triggered", "risk.resolved", "risk.accepted", "risk.expired"].includes(event.type)) {
      const risk = riskById.get(event.object_id);
      if (!risk) continue;
      seen.add(seenKey);
      const payload = eventPayload(event);
      const linkedGoalIds = stringList(payload.linked_goal_ids);
      const goalIds = linkedGoalIds.length
        ? linkedGoalIds
        : allGoals.filter((item) => item.risks.some((candidate) => candidate.risk_id === risk.risk_id)).map((item) => item.goal.goal_id);
      const links = goalIds
        .map((goalId) => goalById.get(goalId))
        .filter((item): item is WebGoalView => Boolean(item))
        .map((item) => ({
          href: goalResultHref(item, `risk-${risk.risk_id}`),
          label: L("查看「{title}」中的风险", { title: item.goal.title }),
        }));
      const stateEffect = riskStateEffect(risk.blocking_mode, risk.state);
      results.push({
        event,
        kind: "risk",
        kindLabel: L("风险处理"),
        state: L(RISK_STATE_LABELS[risk.state]),
        title: risk.description,
        effects: [riskHasUserAction(risk, view)
          ? L("当前结果：{state}，仍会留在待决定中。{effect}", {
              state: L(RISK_STATE_LABELS[risk.state]),
              effect: stateEffect,
            })
          : L("当前结果：{state}。{effect}", {
              state: L(RISK_STATE_LABELS[risk.state]),
              effect: stateEffect,
            })],
        links,
      });
      continue;
    }
    if (event.type === "rewire.applied" || event.type === "rewire.rejected") {
      const rewire = rewireById.get(event.object_id);
      if (!rewire) continue;
      seen.add(seenKey);
      const payload = eventPayload(event);
      const addedIds = stringList(rewire.impact.added_relation_ids ?? payload.added_relation_ids);
      const deactivatedIds = stringList(rewire.impact.deactivated_relation_ids ?? payload.deactivated_relation_ids);
      const addedRiskIds = stringList(rewire.impact.added_risk_ids ?? payload.added_risk_ids);
      const added = addedIds.map((id) => relationById.get(id)).filter((item): item is GoalRelationRecord => Boolean(item));
      const deactivated = deactivatedIds.map((id) => relationById.get(id)).filter((item): item is GoalRelationRecord => Boolean(item));
      const relationEffect = (relation: GoalRelationRecord, action: "add" | "deactivate"): string => {
        const from = goalById.get(relation.from_goal_id)?.goal.title ?? relation.from_goal_id;
        const to = goalById.get(relation.to_goal_id)?.goal.title ?? relation.to_goal_id;
        const labels = RELATION_LABELS[relation.type] ?? { out: relation.type, in: relation.type };
        const summary = L("{from} → {type} → {to}", { from, type: L(labels.out), to });
        return action === "add"
          ? L("已新增关系：{relation}", { relation: summary })
          : L("已解除关系：{relation}", { relation: summary });
      };
      const effects = event.type === "rewire.rejected"
        ? [L("这次调整未采用，现有 Goal 关系没有改变。")]
        : [
            ...added.map((relation) => relationEffect(relation, "add")),
            ...deactivated.map((relation) => relationEffect(relation, "deactivate")),
            ...(addedRiskIds.length ? [L("同时新增了 {count} 项风险。", { count: addedRiskIds.length })] : []),
          ];
      if (event.type === "rewire.applied" && effects.length === 0) {
        effects.push(L("这次决定已记录，但没有新增或解除 Goal 关系，也没有新增风险。"));
      }
      const affectedGoalIds = [...new Set([
        ...added.flatMap((relation) => [relation.from_goal_id, relation.to_goal_id]),
        ...deactivated.flatMap((relation) => [relation.from_goal_id, relation.to_goal_id]),
        String(rewire.proposal.formal_goal_id ?? ""),
      ].filter(Boolean))];
      const relationIdsByGoal = new Map<string, string>();
      for (const relation of [...added, ...deactivated]) {
        if (!relationIdsByGoal.has(relation.from_goal_id)) relationIdsByGoal.set(relation.from_goal_id, relation.relation_id);
        if (!relationIdsByGoal.has(relation.to_goal_id)) relationIdsByGoal.set(relation.to_goal_id, relation.relation_id);
      }
      const links = affectedGoalIds
        .map((goalId) => goalById.get(goalId))
        .filter((item): item is WebGoalView => Boolean(item))
        .map((item) => ({
          href: goalResultHref(item, relationIdsByGoal.has(item.goal.goal_id)
            ? `relation-${relationIdsByGoal.get(item.goal.goal_id)}`
            : `goal-factor-panel-relations-${item.goal.goal_id}`),
          label: L("查看「{title}」中的关系", { title: item.goal.title }),
        }));
      results.push({
        event,
        kind: "rewire",
        kindLabel: L("Goal 关系"),
        state: event.type === "rewire.applied" ? L("已应用") : L("未采用"),
        title: event.type === "rewire.applied" ? L("Goal 关系调整已应用") : L("Goal 关系调整未采用"),
        effects,
        links,
      });
      continue;
    }
    if (event.type === "contract_proposal.approved" || event.type === "contract_proposal.rejected") {
      const proposal = contractById.get(event.object_id);
      if (!proposal) continue;
      seen.add(seenKey);
      const goal = goalById.get(proposal.goal_id);
      results.push({
        event,
        kind: "contract",
        kindLabel: L("目标说明"),
        state: event.type.endsWith("approved") ? L("已确认") : L("已退回"),
        title: proposal.proposed_goal.title,
        effects: [event.type.endsWith("approved")
          ? L("目标、范围和完成标准已成为正式依据；满足其他条件后可以开始。")
          : L("这份修改没有写入正式目标；修改意见已保留。")],
        links: goal ? [{ href: goalResultHref(goal, `goal-panel-overview-${goal.goal.goal_id}`), label: L("查看「{title}」的目标说明", { title: goal.goal.title }) }] : [],
      });
      continue;
    }
    if (event.type === "candidate.approved" || event.type === "candidate.rejected") {
      const candidate = candidateById.get(event.object_id);
      if (!candidate) continue;
      seen.add(seenKey);
      const createdGoalId = String(candidate.decision?.formal_goal_id ?? candidate.proposed_goal.goal_id ?? "");
      const goal = goalById.get(createdGoalId);
      results.push({
        event,
        kind: "candidate",
        kindLabel: L("新发现的工作"),
        state: event.type.endsWith("approved") ? L("已加入") : L("未加入"),
        title: candidate.proposed_goal.title,
        effects: [event.type.endsWith("approved")
          ? L("这项工作已经成为独立 Goal；如果还要调整关系，会继续出现在待决定中。")
          : L("这项工作没有加入 Goal Tree；你的意见已保留。")],
        links: goal ? [{ href: goalResultHref(goal, `goal-panel-overview-${goal.goal.goal_id}`), label: L("查看新 Goal「{title}」", { title: goal.goal.title }) }] : [],
      });
      continue;
    }
    if (event.type === "review.submitted") {
      const review = reviewById.get(event.object_id);
      if (!review) continue;
      seen.add(seenKey);
      const goal = goalById.get(review.goal_id);
      const runtimeReview = reviewObligationById.get(review.obligation_id)?.role !== "human_approver";
      const verdictLabels: Record<string, string> = {
        pass: L("已通过"),
        needs_changes: L("需要修改"),
        fail: L("未通过"),
        inconclusive: L("证据不足"),
      };
      results.push({
        event,
        kind: "review",
        kindLabel: runtimeReview ? L("Runtime 复核") : L("结果确认"),
        state: verdictLabels[review.verdict] ?? review.verdict,
        title: goal?.goal.title ?? review.goal_id,
        effects: [runtimeReview
          ? review.verdict === "pass"
            ? L("本次 Runtime 复核已通过；它不能代替用户验收，Goal 是否完成仍由全部完成条件共同决定。")
            : L("本次 Runtime 复核没有通过；后续工作会保留检查者的判断和依据。")
          : review.verdict === "pass"
            ? L("本次用户确认已通过；Goal 是否完成仍由全部完成条件共同决定。")
            : L("本次结果没有确认通过；后续工作会保留你的判断和依据。")],
        links: goal ? [{ href: goalResultHref(goal, `goal-panel-completion-${goal.goal.goal_id}`), label: L("查看「{title}」的完成情况", { title: goal.goal.title }) }] : [],
        reasonLabel: runtimeReview ? L("复核理由") : undefined,
      });
      continue;
    }
    if (event.type === "goal_tree_proposal.decided") {
      const proposal = goalTreeById.get(event.object_id);
      if (!proposal) continue;
      seen.add(seenKey);
      const payload = eventPayload(event);
      const applied = stringList(payload.applied_item_ids).length;
      const rejected = stringList(payload.rejected_item_ids).length;
      const revised = stringList(payload.revised_item_ids).length;
      const conflicts = stringList(payload.conflict_item_ids).length;
      const effects = [
        ...(applied ? [L("已采用 {count} 项变化。", { count: applied })] : []),
        ...(rejected ? [L("已退回 {count} 项变化。", { count: rejected })] : []),
        ...(revised ? [L("有 {count} 项需要重新整理。", { count: revised })] : []),
        ...(conflicts ? [L("有 {count} 项因当前内容已变化而未写入。", { count: conflicts })] : []),
      ];
      const stateLabels: Record<string, string> = {
        approved: L("已采用"),
        partially_applied: L("部分已处理"),
        rejected: L("已退回"),
        closed: L("已处理"),
        pending: L("部分已处理"),
      };
      const root = goalById.get(proposal.root_goal_id ?? "");
      const reasons = [...new Set(proposal.decisions.filter((decision) => decision.created_at === event.at).map((decision) => decision.reason).filter(Boolean))];
      results.push({
        event,
        kind: "goalTree",
        kindLabel: L("Goal 方案"),
        state: stateLabels[proposal.state] ?? L("已处理"),
        title: proposal.summary,
        effects: effects.length ? effects : [L("决定已经记录，当前 Goal Tree 没有产生新的变化。")],
        links: root ? [{ href: goalResultHref(root, `goal-panel-overview-${root.goal.goal_id}`), label: L("查看「{title}」", { title: root.goal.title }) }] : [],
        reason: reasons.join("；") || event.reason,
      });
    }
  }
  return results;
}

function renderRecentDecisionResults(view: GoalBoardWebView): string {
  const results = recentDecisionResults(view);
  if (!results.length) return "";
  return `<section class="decision-results" aria-labelledby="decision-results-title">
    <header><div><h2 id="decision-results-title">${L("最近处理结果")}</h2><p>${L("这些决定已经写入 GoalBoard，可直接打开对应 Goal 核对。")}</p></div><small>${L("最近 {count} 项", { count: results.length })}</small></header>
    <div class="decision-result-list">${results.map((result) => `<article class="decision-result decision-result--${result.kind}">
      <span class="decision-result-icon">${icon(result.kind === "risk" ? "risk" : result.kind === "rewire" ? "link" : result.kind === "review" ? "user" : result.kind === "candidate" ? "plus" : result.kind === "goalTree" ? "tree" : "clipboard")}</span>
      <div class="decision-result-copy"><div><span>${escapeHtml(result.kindLabel)}</span><strong>${escapeHtml(result.state)}</strong><time datetime="${escapeHtml(result.event.at)}">${formatDate(result.event.at)}</time></div><h3>${escapeHtml(result.title)}</h3>${result.effects.map((effect) => `<p>${escapeHtml(effect)}</p>`).join("")}<small>${escapeHtml(result.reasonLabel ? `${result.reasonLabel}：${result.reason ?? result.event.reason}` : L("你的理由：{reason}", { reason: result.reason ?? result.event.reason }))}</small></div>
      ${result.links.length ? `<div class="decision-result-links">${result.links.map((link) => `<a href="${link.href}">${escapeHtml(link.label)}${icon("chevron-right")}</a>`).join("")}</div>` : ""}
    </article>`).join("")}</div>
  </section>`;
}

export function renderDecisionCenter(view: GoalBoardWebView, desktopInbox = false): string {
  const groups = buildDecisionGroups(view);
  const count = pendingDecisionCount(view);
  const nativeGoalTreeProposals = view.snapshot.goal_tree_proposals.filter(
    (item) => item.origin === "native" && goalTreeProposalNeedsDecision(item),
  );
  const typeCounts = {
    proposals: nativeGoalTreeProposals.length + view.snapshot.contract_proposals.filter((item) => item.state === "pending").length,
    candidates: view.snapshot.candidates.filter((item) => item.state === "pending").length,
    rewires: view.snapshot.rewires.filter((item) => item.state === "pending").length,
    reviews: view.snapshot.review_obligations.filter((item) => item.role === "human_approver" && item.state === "pending").length,
    risks: view.snapshot.risks.filter((risk) => riskHasUserAction(risk, view)).length,
  };
  const groupKinds = (group: DecisionGoalGroup) => [
    { count: group.goalTreeProposals.length + group.contractProposals.length, label: L("目标说明"), icon: "clipboard" as GoalBoardIcon },
    { count: group.candidates.length, label: L("新发现的工作"), icon: "plus" as GoalBoardIcon },
    { count: group.rewires.length, label: L("Goal 关系"), icon: "link" as GoalBoardIcon },
    { count: group.humanReview ? 1 : 0, label: L("结果确认"), icon: "user" as GoalBoardIcon },
    { count: group.risks.length, label: L("风险处理"), icon: "risk" as GoalBoardIcon },
  ].filter((item) => item.count > 0);
  if (!desktopInbox) {
    return `<article class="decision-center" data-decision-center>
      <header class="decision-center-header"><div><h1>${L("等待你的决定")}</h1><p>${L("每一项都会说明你在决定什么、为什么现在要决定、有没有可靠建议，以及选择后会发生什么。")}</p></div><strong>${count}<small>${L("项待处理")}</small></strong></header>
      <div class="decision-summary" aria-label="${L("待决定事项统计")}"><span>${L("目标说明")} <strong>${typeCounts.proposals}</strong></span><span>${L("新发现的工作")} <strong>${typeCounts.candidates}</strong></span><span>${L("Goal 关系")} <strong>${typeCounts.rewires}</strong></span><span>${L("结果确认")} <strong>${typeCounts.reviews}</strong></span><span>${L("风险处理")} <strong>${typeCounts.risks}</strong></span></div>
      ${groups.length ? `<div class="decision-groups">${groups.map((group) => {
        const goalId = group.item?.goal.goal_id ?? group.ownerGoalId ?? "board";
        return `<section class="decision-goal-group" id="decision-goal-${escapeHtml(goalId)}">
          <header class="decision-owner"><div><span>${L("这些决定属于")}</span>${renderDecisionGoalLink(group.item)}</div><small>${group.goalTreeProposals.length + group.contractProposals.length + group.candidates.length + group.rewires.length + group.risks.length + (group.humanReview ? 1 : 0)} ${L("项")}</small></header>
          <div class="decision-stack">
            ${group.goalTreeProposals.map((proposal) => renderGoalTreeProposalDecision(proposal, view)).join("")}
            ${group.rewires.map((rewire) => renderRewireDecision(rewire, view)).join("")}
            ${group.item ? group.contractProposals.map((proposal) => renderContractProposal(proposal, group.item!.goal, view)).join("") : ""}
            ${group.candidates.map((candidate) => renderCandidateDecision(candidate, view)).join("")}
            ${group.humanReview && group.item ? renderHumanReview(group.item, view) : ""}
            ${group.risks.map((risk) => renderRiskDecision(risk, group.item, view)).join("")}
          </div>
        </section>`;
      }).join("")}</div>` : `<div class="decision-empty">${icon("check")}<h2>${L("当前没有等待你的决定")}</h2><p>${L("需要你确认目标、工作关系、结果或风险时，会自动出现在这里。")}</p><a href="/">${L("返回 Goal Tree")}</a></div>`}
      ${renderRecentDecisionResults(view)}
    </article>`;
  }
  return `<article class="decision-center inbox-workspace" data-decision-center>
    <header class="decision-center-header inbox-header"><div><h1>Inbox</h1><p>${L("需要你判断后才能继续的事项，都集中在这里。")}</p></div><strong>${count}<small>${L("项待处理")}</small></strong></header>
    <div class="decision-summary" aria-label="${L("待决定事项统计")}"><span>${L("目标说明")} <strong>${typeCounts.proposals}</strong></span><span>${L("新发现的工作")} <strong>${typeCounts.candidates}</strong></span><span>${L("Goal 关系")} <strong>${typeCounts.rewires}</strong></span><span>${L("结果确认")} <strong>${typeCounts.reviews}</strong></span><span>${L("风险处理")} <strong>${typeCounts.risks}</strong></span></div>
    ${groups.length ? `<div class="decision-groups">${groups.map((group) => {
      const goalId = group.item?.goal.goal_id ?? group.ownerGoalId ?? "board";
      const kinds = groupKinds(group);
      const itemCount = kinds.reduce((total, kind) => total + kind.count, 0);
      const primaryKind = kinds[0] ?? { count: itemCount, label: L("待决定"), icon: "input" as GoalBoardIcon };
      const ownerTitle = group.item?.goal.title ?? L("整个项目的事项");
      return `<details class="decision-goal-group inbox-group" id="decision-goal-${escapeHtml(goalId)}">
        <summary class="inbox-item"><span class="inbox-item-icon" aria-hidden="true">${icon(primaryKind.icon)}</span><span class="inbox-item-copy"><strong>${escapeHtml(ownerTitle)}</strong><small>${escapeHtml(kinds.map((kind) => kind.label).join(currentLocale() === "en" ? ", " : " · "))}</small></span><span class="inbox-item-types">${kinds.map((kind) => `<span>${icon(kind.icon)}${escapeHtml(kind.label)}${kind.count > 1 ? `<em>${kind.count}</em>` : ""}</span>`).join("")}</span><b>${itemCount}</b>${icon("chevron-down")}</summary>
        <div class="inbox-item-detail"><header class="decision-owner"><div><span>${L("这些决定属于")}</span>${renderDecisionGoalLink(group.item)}</div><small>${itemCount} ${L("项")}</small></header>
        <div class="decision-stack">
          ${group.goalTreeProposals.map((proposal) => renderGoalTreeProposalDecision(proposal, view)).join("")}
          ${group.rewires.map((rewire) => renderRewireDecision(rewire, view)).join("")}
          ${group.item ? group.contractProposals.map((proposal) => renderContractProposal(proposal, group.item!.goal, view)).join("") : ""}
          ${group.candidates.map((candidate) => renderCandidateDecision(candidate, view)).join("")}
          ${group.humanReview && group.item ? renderHumanReview(group.item, view) : ""}
          ${group.risks.map((risk) => renderRiskDecision(risk, group.item, view)).join("")}
        </div></div>
      </details>`;
    }).join("")}</div>` : `<div class="decision-empty">${icon("check")}<h2>${L("当前没有等待你的决定")}</h2><p>${L("需要你确认目标、工作关系、结果或风险时，会自动出现在这里。")}</p><a href="/">${L("返回 Goal Tree")}</a></div>`}
    ${renderRecentDecisionResults(view)}
  </article>`;
}

interface FeedDirectoryEntry {
  id: string;
  canonicalItemId?: string | null;
  inboxActive?: boolean;
  inboxEntry?: InboxEntryRecord | null;
  source?: FeedSourceRecord | null;
  goalId?: string | null;
  itemType: FeedItemType;
  kindLabel: string;
  sourceLabel: string;
  disposition: string;
  title: string;
  summary: string;
  updatedAt: string;
  icon: GoalBoardIcon;
  item: FeedItemRecord | null;
  decisionGroup: DecisionGoalGroup | null;
  recentResult: RecentDecisionResult | null;
  prototype: {
    reason: string;
    nextAction: string;
    relation: string;
  } | null;
}

function inboxEntryDisposition(status: InboxEntryRecord["status"]): string {
  return ({
    open: "inbox",
    in_progress: "processing",
    done: "saved",
    dismissed: "archived",
  } as const)[status];
}

function inboxEntryReasonLabel(reason: InboxEntryRecord["reason"]): string {
  return ({
    manual: L("你手工加入"),
    source_rule: L("来源规则命中"),
    goal_decision: L("GoalBoard 等待决定"),
    source_fault: L("来源需要人工恢复"),
  } as const)[reason];
}

function inboxEntryStatusLabel(status: InboxEntryRecord["status"]): string {
  return ({
    open: L("待处理"),
    in_progress: L("处理中"),
    done: L("已完成"),
    dismissed: L("已忽略"),
  } as const)[status];
}

function feedDirectoryAttentionRank(entry: FeedDirectoryEntry): number {
  if (entry.itemType !== "inbox_message") return 0;
  if (entry.decisionGroup) return 3;
  if (entry.disposition === "inbox" || entry.disposition === "processing") return 2;
  return 1;
}

function prototypeFeedEntries(view: GoalBoardWebView): FeedDirectoryEntry[] {
  const boardId = view.snapshot.board.board_id;
  const goalPath = `${view.route_prefix}/goals/draft-8f160677-f8f8-4f2b-935d-0881edb3aba3`;
  const createItem = (
    id: string,
    itemType: FeedItemType,
    kind: string,
    sourceId: string,
    sourceLabel: string,
    title: string,
    summary: string,
    body: string,
    updatedAt: string,
    tags: string[],
  ): FeedItemRecord => ({
    board_id: boardId,
    item_id: id,
    source_id: sourceId,
    item_type: itemType,
    kind,
    title,
    summary,
    body,
    source_kind: sourceId.includes("github") ? "github" : sourceId.includes("gmail") ? "gmail" : sourceId.includes("rss") ? "rss" : "goalboard",
    source_label: sourceLabel,
    external_id: id,
    url: null,
    origin_status: "prototype",
    priority: "normal",
    tags,
    author: sourceId.includes("gmail") ? "Mina · Product Partner" : sourceId.includes("github") ? "adeptify/goalboard" : "Latent Space",
    disposition: "inbox",
    linked_goal_id: null,
    read_at: null,
    revision: 1,
    source_created_at: updatedAt,
    source_updated_at: updatedAt,
    imported_at: updatedAt,
    updated_at: updatedAt,
    materials: [],
  });
  const items = [
    {
      item: createItem(
        "prototype-feed-github",
        "feed",
        "github_notification",
        "prototype-source-github",
        "GitHub · adeptify",
        "PR #418 请求你确认 FeedItem 与 InboxEntry 的边界",
        "新的 review request，涉及来源消息如何进入待处理引用。",
        "PR 更新了信息流对象关系：来源负责接入与拉取，Feed 保存完整消息，Inbox 只保留需要人工介入的引用。请重点检查重复入箱与处理完成后的追溯行为。",
        "2026-08-30T14:18:00+08:00",
        ["GitHub", "Review request", "演示数据"],
      ),
      reason: "这是一条来源消息，默认只属于 Feed；只有你明确加入后才进入 Inbox。",
      nextAction: "阅读后决定加入 Inbox、保存为资料、升格 Goal 或忽略。",
      relation: "来源 GitHub · adeptify → Feed Item",
    },
    {
      item: createItem(
        "prototype-feed-gmail",
        "feed",
        "gmail_message",
        "prototype-source-gmail",
        "Gmail · product@adeptify.ai",
        "设计伙伴反馈：Inbox 不应成为第二个 Feed",
        "邮件建议先解释进入原因，再给出下一步，不要重复完整正文。",
        "Mina 走完当前版本后认为 Feed 和 Inbox 的视觉很像。她建议 Inbox 只展示需要决定、回复或修复的事项，并保留回到原消息的路径。",
        "2026-08-30T13:42:00+08:00",
        ["Gmail", "用户反馈", "演示数据"],
      ),
      reason: "这封邮件只是新消息，目前还没有明确要求你介入。",
      nextAction: "先阅读；若需要跟进，再加入 Inbox。",
      relation: "来源 Gmail · product@adeptify.ai → Feed Item",
    },
    {
      item: createItem(
        "prototype-feed-rss",
        "feed",
        "rss_entry",
        "prototype-source-rss",
        "RSS · Latent Space",
        "Designing calm inboxes for agentic products",
        "一篇讨论 agent 产品如何区分事件流与注意力队列的文章。",
        "文章提出：事件流应该完整、可追溯，注意力队列则必须有进入理由、负责人和退出条件。这个模式与 GoalBoard 当前的信息流重构高度相关。",
        "2026-08-30T12:25:00+08:00",
        ["RSS", "产品设计", "演示数据"],
      ),
      reason: "公开来源内容进入完整事实流，不自动占用你的注意力。",
      nextAction: "保存为资料，或在确认要行动时升格为 Goal。",
      relation: "来源 RSS · Latent Space → Feed Item",
    },
    {
      item: createItem(
        "prototype-inbox-feed",
        "inbox_message",
        "feed_attention_reference",
        "prototype-source-github",
        "GitHub · adeptify",
        "确认 PR #418 的对象边界",
        "由 Feed Item 手工加入；需要在合并前给出产品判断。",
        "这条 Inbox Entry 引用 GitHub 的原始 Feed Item，不复制和篡改原消息。完成后会退出默认 Inbox，原消息仍保留在 Feed。",
        "2026-08-30T14:20:00+08:00",
        ["Feed 引用", "需判断", "演示数据"],
      ),
      reason: "你在 Feed 中手工标记为需要处理。",
      nextAction: "检查对象关系并给出 review 结论。",
      relation: "Inbox Entry → 原始 Feed Item · PR #418",
    },
    {
      item: createItem(
        "prototype-inbox-source",
        "inbox_message",
        "source_fault",
        "prototype-source-gmail",
        "Gmail · product@adeptify.ai",
        "Gmail 授权已失效，3 封新邮件尚未拉取",
        "来源故障需要人工重新授权；旧消息和游标仍然保留。",
        "GoalBoard 在 13:06 收到 401。系统没有把失败伪装成空结果，也没有推进 Gmail 游标。重新授权后可以安全补拉。",
        "2026-08-30T13:06:00+08:00",
        ["来源故障", "需重新授权", "演示数据"],
      ),
      reason: "来源无法自行恢复，需要你重新连接账号。",
      nextAction: "打开来源配置并完成重新授权。",
      relation: "Inbox Entry → 来源 Gmail · product@adeptify.ai",
    },
    {
      item: {
        ...createItem(
          "prototype-inbox-goal",
          "inbox_message",
          "goal_decision",
          "prototype-goalboard",
          "GoalBoard",
          "确认高保真是否真正分清来源、Feed 与 Inbox",
          "这是当前 Goal 的人工判断门禁；代码检查不能替代你的产品判断。",
          "请依次进入来源、Feed 和 Inbox，走完模拟同步、加入 Inbox 与完成处理，然后判断三者是否还会被理解成同一种收件箱。",
          "2026-08-30T12:02:00+08:00",
          ["Goal 决定", "人工判断", "演示数据"],
        ),
        url: goalPath,
      },
      reason: "当前 Goal 的验收标准要求一骏亲自判断对象边界。",
      nextAction: "走完原型主路径后，确认或指出仍然混淆的地方。",
      relation: "Inbox Entry → Goal 高保真原型",
    },
  ];
  return items.map(({ item, reason, nextAction, relation }) => ({
    id: item.item_id,
    itemType: item.item_type,
    kindLabel: item.item_type === "feed" ? "Feed Item · 演示" : "Inbox Entry · 演示",
    sourceLabel: item.source_label,
    disposition: item.disposition,
    title: item.title,
    summary: item.summary,
    updatedAt: item.source_updated_at,
    icon: item.kind === "source_fault" ? "risk" : item.kind === "goal_decision" ? "target" : item.item_type === "feed" ? "activity" : "input",
    item,
    decisionGroup: null,
    recentResult: null,
    prototype: { reason, nextAction, relation },
  }));
}

function decisionGroupCount(group: DecisionGoalGroup): number {
  return group.goalTreeProposals.length + group.contractProposals.length + group.candidates.length +
    group.rewires.length + group.risks.length + (group.humanReview ? 1 : 0);
}

function decisionGroupKinds(group: DecisionGoalGroup): string[] {
  return [
    group.goalTreeProposals.length + group.contractProposals.length ? L("目标说明") : "",
    group.candidates.length ? L("新发现的工作") : "",
    group.rewires.length ? L("Goal 关系") : "",
    group.humanReview ? L("结果确认") : "",
    group.risks.length ? L("风险处理") : "",
  ].filter(Boolean);
}

function feedDirectoryEntries(view: GoalBoardWebView): FeedDirectoryEntry[] {
  const activeInboxSubjects = new Set(view.feed.inbox_entries
    .filter((entry) =>
      entry.subject_type === "feed_item" &&
      (entry.status === "open" || entry.status === "in_progress"),
    )
    .map((entry) => entry.subject_id));
  const legacyInboxSubjects = new Set(view.feed.items
    .filter((item) => item.item_type === "inbox_message")
    .map((item) => item.item_id));
  const feedItemsById = new Map(view.feed.feed_items.map((item) => [item.item_id, item]));
  const sourcesById = new Map(view.feed.sources.map((source) => [source.source_id, source]));
  const goalsById = new Map([
    ...view.goals,
    ...view.archived_goals,
    ...view.trashed_goals,
  ].map((goal) => [goal.goal.goal_id, goal]));
  const decisionGroups = buildDecisionGroups(view);
  const liveDecisionGoalIds = new Set(decisionGroups
    .map((group) => group.item?.goal.goal_id ?? group.ownerGoalId)
    .filter((goalId): goalId is string => Boolean(goalId)));
  const persistedFeed = view.feed.feed_items.map((record): FeedDirectoryEntry => {
    const item = { ...record, item_type: "feed" as const };
    const inboxActive = activeInboxSubjects.has(item.item_id) || legacyInboxSubjects.has(item.item_id);
    return {
    id: item.item_id,
    canonicalItemId: item.item_id,
    inboxActive,
    itemType: "feed",
    kindLabel: "Feed",
    sourceLabel: item.source_label || item.source_kind,
    disposition: item.disposition === "inbox" && !inboxActive ? "feed" : item.disposition,
    title: item.title,
    summary: feedPlainText(item.summary || item.body) || L("没有附加摘要"),
    updatedAt: item.source_updated_at || item.updated_at,
    icon: "activity",
    item,
    decisionGroup: null,
    recentResult: null,
    prototype: null,
  };
  });
  const persistedInbox = view.feed.inbox_entries
    .filter((entry) => entry.subject_type !== "goal_decision" || !liveDecisionGoalIds.has(entry.subject_id))
    .map((entry): FeedDirectoryEntry => {
      const disposition = inboxEntryDisposition(entry.status);
      if (entry.subject_type === "feed_item") {
        const record = feedItemsById.get(entry.subject_id) ?? null;
        const item = record ? { ...record, item_type: "inbox_message" as const } : null;
        return {
          id: `inbox:${entry.entry_id}`,
          canonicalItemId: entry.subject_id,
          inboxActive: entry.status === "open" || entry.status === "in_progress",
          inboxEntry: entry,
          itemType: "inbox_message",
          kindLabel: entry.reason === "manual" ? L("Inbox · 手工加入") : L("Inbox · 来源规则"),
          sourceLabel: item?.source_label || item?.source_kind || "Feed",
          disposition,
          title: item?.title || L("原 Feed Item 已不可用"),
          summary: feedPlainText(item?.summary || item?.body) || L("引用仍保留，但原消息已被删除。"),
          updatedAt: entry.updated_at,
          icon: item ? "input" : "alert",
          item,
          decisionGroup: null,
          recentResult: null,
          prototype: null,
        };
      }
      if (entry.subject_type === "source_fault") {
        const source = sourcesById.get(entry.subject_id) ?? null;
        return {
          id: `inbox:${entry.entry_id}`,
          inboxEntry: entry,
          source,
          itemType: "inbox_message",
          kindLabel: L("Inbox · 来源故障"),
          sourceLabel: source?.name || L("其他来源"),
          disposition,
          title: source ? L("来源「{source}」需要处理", { source: source.name }) : L("原来源已不可用"),
          summary: source
            ? L("来源停止自动拉取；完成修复前不会推进可信游标。")
            : L("来源或本地历史已删除；Inbox 只保留这条故障记录。"),
          updatedAt: entry.updated_at,
          icon: "alert",
          item: null,
          decisionGroup: null,
          recentResult: null,
          prototype: null,
          canonicalItemId: null,
          inboxActive: entry.status === "open" || entry.status === "in_progress",
          goalId: null,
        };
      }
      const goal = goalsById.get(entry.subject_id) ?? null;
      return {
        id: `inbox:${entry.entry_id}`,
        inboxEntry: entry,
        goalId: entry.subject_id,
        itemType: "inbox_message",
        kindLabel: L("Inbox · Goal 决定"),
        sourceLabel: "GoalBoard",
        disposition,
        title: goal?.goal.title || L("原 Goal 已不可用"),
        summary: goal
          ? L("GoalBoard 正在等待你完成与这个 Goal 相关的判断。")
          : L("Goal 已归档、删除或当前无法读取；决定引用仍保留。"),
        updatedAt: entry.updated_at,
        icon: "clipboard",
        item: null,
        decisionGroup: null,
        recentResult: null,
        prototype: null,
        inboxActive: entry.status === "open" || entry.status === "in_progress",
      };
    });
  const persistedInboxSubjects = new Set(view.feed.inbox_entries
    .filter((entry) => entry.subject_type === "feed_item")
    .map((entry) => entry.subject_id));
  const legacyInbox = view.feed.items
    .filter((record) => record.item_type === "inbox_message" && !persistedInboxSubjects.has(record.item_id))
    .map((record): FeedDirectoryEntry => {
      const item = { ...record, item_type: "inbox_message" as const };
      return {
        id: `inbox:legacy:${item.item_id}`,
        canonicalItemId: item.item_id,
        inboxActive: true,
        itemType: "inbox_message",
        kindLabel: L("Inbox · 兼容引用"),
        sourceLabel: item.source_label || item.source_kind,
        disposition: "inbox",
        title: item.title,
        summary: feedPlainText(item.summary || item.body) || L("没有附加摘要"),
        updatedAt: item.source_updated_at || item.updated_at,
        icon: "input",
        item,
        decisionGroup: null,
        recentResult: null,
        prototype: null,
      };
    });
  const decisions = decisionGroups.map((group): FeedDirectoryEntry => {
    const count = decisionGroupCount(group);
    const title = group.item?.goal.title ?? L("整个项目的事项");
    const goalId = group.item?.goal.goal_id ?? group.ownerGoalId ?? null;
    const inboxEntry = goalId
      ? view.feed.inbox_entries.find((entry) =>
          entry.subject_type === "goal_decision" && entry.subject_id === goalId &&
          (entry.status === "open" || entry.status === "in_progress"),
        ) ?? null
      : null;
    return {
      id: `decision:${goalId ?? "board"}`,
      inboxEntry,
      goalId,
      itemType: "inbox_message",
      kindLabel: L("Inbox Message · Goal 决定"),
      sourceLabel: "GoalBoard",
      disposition: "inbox",
      title,
      summary: L("{kinds}，共 {count} 项等待判断。", {
        kinds: decisionGroupKinds(group).join(currentLocale() === "en" ? ", " : " · "),
        count,
      }),
      updatedAt: group.item?.goal.updated_at ?? view.events[0]?.at ?? "",
      icon: group.risks.length ? "risk" : group.rewires.length ? "link" : "clipboard",
      item: null,
      decisionGroup: group,
      recentResult: null,
      prototype: null,
    };
  });
  const results = recentDecisionResults(view).map((result): FeedDirectoryEntry => ({
    id: `result:${result.event.event_id}`,
    itemType: "inbox_message",
    kindLabel: L("Inbox Message · 处理结果"),
    sourceLabel: "GoalBoard",
    disposition: "saved",
    title: result.title,
    summary: result.effects.join(currentLocale() === "en" ? " " : "；"),
    updatedAt: result.event.at,
    icon: result.kind === "risk" ? "risk" : result.kind === "rewire" ? "link" : result.kind === "review" ? "user" : result.kind === "candidate" ? "plus" : result.kind === "goalTree" ? "tree" : "clipboard",
    item: null,
    decisionGroup: null,
    recentResult: result,
    prototype: null,
  }));
  return [...persistedFeed, ...persistedInbox, ...legacyInbox, ...(view.demo ? prototypeFeedEntries(view) : []), ...decisions, ...results]
    .sort((left, right) =>
      feedDirectoryAttentionRank(right) - feedDirectoryAttentionRank(left) ||
      right.updatedAt.localeCompare(left.updatedAt),
    );
}

function feedDispositionLabel(value: string, itemType?: FeedItemType): string {
  return ({
    feed: L("仅 Feed"),
    inbox: L("待处理"),
    saved: L("已保存为资料"),
    promoted: L("已升格为 Goal"),
    processing: L("处理中"),
    archived: itemType === "inbox_message" ? L("已归档") : L("已忽略"),
  } as Record<string, string>)[value] ?? value;
}

function feedEntryProviderKey(entry: FeedDirectoryEntry): "github" | "gmail" | "rss" | "other" {
  const value = `${entry.item?.source_kind ?? ""} ${entry.item?.kind ?? ""} ${entry.sourceLabel}`.toLowerCase();
  if (value.includes("github")) return "github";
  if (value.includes("gmail") || value.includes("mail")) return "gmail";
  if (value.includes("rss") || value.includes("atom") || value.includes("feed")) return "rss";
  return "other";
}

function renderFeedDirectory(view: GoalBoardWebView, defaultPreset: FeedItemType): string {
  const entries = feedDirectoryEntries(view);
  const sourceLabels = [...new Set(entries.map((entry) => entry.sourceLabel).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, currentLocale() === "en" ? "en" : "zh-CN"));
  const initiallyVisible = entries.filter((entry) => entry.itemType === defaultPreset);
  const initial = initiallyVisible[0] ?? null;
  const relay = view.relay_import;
  const sourceOptions: readonly (readonly [string, string])[] = [
    ["all", L("全部来源")],
    ...sourceLabels.map((label) => [label, label] as const),
  ];
  const statusOptions = [
    ["active", defaultPreset === "inbox_message" ? L("待处理") : L("未忽略"), "active"],
    ["all", L("全部状态"), ""],
    ["feed", L("仅 Feed"), ""],
    ["inbox", defaultPreset === "inbox_message" ? L("未开始") : L("待处理"), ""],
    ["saved", defaultPreset === "inbox_message" ? L("已完成") : L("已保存"), ""],
    ["promoted", L("已升格"), ""],
    ["processing", L("处理中"), ""],
    ["archived", L("已忽略"), "archived"],
  ] as const;
  const typeOptions = [
    ["all", L("全部类型")],
    ["github", "GitHub"],
    ["gmail", "Gmail"],
    ["rss", "RSS / Atom"],
    ["other", L("其他类型")],
  ] as const;
  const timeOptions = [
    ["all", L("全部时间")],
    ["day", L("最近 24 小时")],
    ["week", L("最近 7 天")],
    ["month", L("最近 30 天")],
  ] as const;
  const sortOptions = [
    ["newest", L("最新在前")],
    ["oldest", L("最早在前")],
    ["source", L("按来源")],
    ["title", L("按标题")],
  ] as const;
  const filterOptions = (
    kind: "source" | "type" | "time" | "status" | "sort",
    options: readonly (readonly [string, string, string?])[],
    selected: string,
  ) => options.map(([value, label, semanticLabel]) => `<button class="feed-filter-option" type="button" role="radio" aria-checked="${value === selected}" data-feed-filter-option="${kind}" data-feed-filter-value="${escapeHtml(value)}"><span${semanticLabel ? ` data-feed-status-${semanticLabel}-label` : ""}>${escapeHtml(label)}</span>${icon("check")}</button>`).join("");
  return `<section class="desktop-directory-panel feed-directory" data-directory-panel="feed" data-feed-directory data-feed-preset="${defaultPreset}" hidden>
    <header class="desktop-directory-heading feed-directory-heading"><button type="button" data-directory-back aria-label="${L("返回上一级")}">${icon("back")}</button><span><strong data-feed-directory-title>${defaultPreset === "feed" ? "Feed" : "Inbox"}</strong><small data-feed-directory-copy>${defaultPreset === "feed" ? L("所有来源消息，完整保留") : L("只保留需要你介入的事情")}</small></span><button class="feed-import-trigger" type="button" data-work-surface-open="sources" aria-label="${L("打开来源")}" title="${L("打开来源")}">${icon("settings")}</button></header>
    <div class="feed-directory-tools">
      <div class="feed-directory-toolbar">
        <label class="feed-directory-search">${icon("search")}<input type="search" data-feed-search aria-label="${L("搜索 Item")}" placeholder="${L("搜索标题、摘要或来源")}" autocomplete="off"></label>
        <div class="feed-filter-control">
          <button class="feed-filter-trigger" type="button" data-feed-filter-trigger aria-expanded="false" aria-haspopup="true" aria-controls="feed-filter-panel" aria-label="${L("筛选与排序")}" title="${L("筛选与排序")}">${icon("filter")}<span data-feed-filter-badge hidden>0</span></button>
          <section class="feed-filter-panel" id="feed-filter-panel" data-feed-filter-panel hidden aria-label="${L("筛选与排序")}">
            <header><strong>${L("筛选与排序")}</strong><button type="button" data-feed-filter-reset>${L("清除筛选")}</button></header>
            <div class="feed-filter-section"><span>${L("来源")}</span><div class="feed-filter-options" role="radiogroup" aria-label="${L("来源")}">${filterOptions("source", sourceOptions, "all")}</div></div>
            <div class="feed-filter-section"><span>${L("类型")}</span><div class="feed-filter-options" role="radiogroup" aria-label="${L("类型")}">${filterOptions("type", typeOptions, "all")}</div></div>
            <div class="feed-filter-section"><span>${L("时间")}</span><div class="feed-filter-options" role="radiogroup" aria-label="${L("时间")}">${filterOptions("time", timeOptions, "all")}</div></div>
            <div class="feed-filter-section"><span>${L("状态")}</span><div class="feed-filter-options" role="radiogroup" aria-label="${L("状态")}">${filterOptions("status", statusOptions, "active")}</div></div>
            <div class="feed-filter-section"><span>${L("排序")}</span><div class="feed-filter-options" role="radiogroup" aria-label="${L("排序")}">${filterOptions("sort", sortOptions, "newest")}</div></div>
            <p class="feed-filter-summary" data-feed-filter-summary aria-live="polite">${escapeHtml([sourceOptions[0][1], typeOptions[0][1], timeOptions[0][1], statusOptions[0][1], sortOptions[0][1]].join(" · "))}</p>
          </section>
        </div>
      </div>
      <select data-feed-source-filter hidden tabindex="-1" aria-hidden="true">${sourceOptions.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("")}</select>
      <select data-feed-type-filter hidden tabindex="-1" aria-hidden="true">${typeOptions.map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join("")}</select>
      <select data-feed-time-filter hidden tabindex="-1" aria-hidden="true">${timeOptions.map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join("")}</select>
      <select data-feed-status-filter hidden tabindex="-1" aria-hidden="true">${statusOptions.map(([value, label, semanticLabel]) => `<option value="${value}"${semanticLabel ? ` data-feed-status-${semanticLabel}` : ""}>${escapeHtml(label)}</option>`).join("")}</select>
      <select data-feed-sort hidden tabindex="-1" aria-hidden="true">${sortOptions.map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join("")}</select>
    </div>
    <div class="feed-item-scroll" data-feed-list role="listbox" aria-label="${L("Item 列表")}">
      ${entries.map((entry) => {
        const selected = entry.id === initial?.id;
        const visible = entry.itemType === defaultPreset;
        const stateLabel = entry.prototype
          ? entry.itemType === "feed" ? L("未安排") : L("需介入")
          : entry.inboxEntry
            ? inboxEntryStatusLabel(entry.inboxEntry.status)
          : feedDispositionLabel(entry.disposition, entry.itemType);
        return `<button class="feed-list-item directory-list-row${selected ? " is-selected" : ""}" type="button" role="option" aria-selected="${selected}" tabindex="${selected ? "0" : "-1"}" data-feed-entry-id="${escapeHtml(entry.id)}" data-feed-item-id="${escapeHtml(entry.canonicalItemId ?? entry.item?.item_id ?? entry.id)}"${entry.inboxEntry ? ` data-inbox-entry-id="${escapeHtml(entry.inboxEntry.entry_id)}" data-inbox-entry-revision="${entry.inboxEntry.revision}" data-inbox-subject-type="${entry.inboxEntry.subject_type}" data-inbox-reason="${entry.inboxEntry.reason}"` : ""} data-feed-entry-type="${entry.itemType}" data-feed-entry-provider="${feedEntryProviderKey(entry)}" data-feed-entry-attention-rank="${feedDirectoryAttentionRank(entry)}" data-feed-entry-persisted="${entry.item && !entry.prototype ? "true" : "false"}"${entry.prototype ? ' data-feed-entry-prototype="true"' : ""} data-feed-entry-read="${entry.item?.read_at ? "read" : "unread"}" data-feed-entry-source="${escapeHtml(entry.sourceLabel)}" data-feed-entry-status="${escapeHtml(entry.disposition)}" data-feed-entry-time="${escapeHtml(entry.updatedAt)}" data-feed-entry-title="${escapeHtml(entry.title)}" data-feed-entry-search="${escapeHtml(`${entry.title} ${entry.summary} ${entry.sourceLabel} ${entry.item?.kind ?? ""} ${entry.inboxEntry ? inboxEntryReasonLabel(entry.inboxEntry.reason) : ""}`.toLocaleLowerCase())}"${visible ? "" : " hidden"}><span class="feed-list-icon">${icon(entry.icon)}</span><span class="feed-list-copy"><span class="feed-list-meta"><em>${escapeHtml(entry.kindLabel)}</em><small>${escapeHtml(entry.sourceLabel)}</small>${entry.itemType === "feed" && entry.item ? `<small class="feed-list-read" data-feed-read-state>${entry.item.read_at ? L("已读") : L("未读")}</small>` : ""}</span><strong title="${escapeHtml(entry.title)}">${escapeHtml(entry.title)}</strong><p>${escapeHtml(entry.summary)}</p><time datetime="${escapeHtml(entry.updatedAt)}">${formatDate(entry.updatedAt)}</time></span><span class="feed-list-state directory-row-state" data-feed-disposition="${escapeHtml(entry.disposition)}">${escapeHtml(stateLabel)}</span></button>`;
      }).join("")}
      <div class="feed-list-empty" data-feed-empty${entries.length ? " hidden" : ""}>${icon("input")}<strong data-feed-empty-title>${L("这里还没有 Item")}</strong><p data-feed-empty-copy>${relay.available ? L("可以接入来源，或把 Relay 数据完整迁入。") : L("接入来源后，消息和 Feed 会出现在这里。")}</p><button type="button" data-feed-clear-filters hidden>${L("清除筛选")}</button>${view.demo ? `<button type="button" data-prototype-feed-restore hidden>${L("恢复列表")}</button>` : ""}<button type="button" data-feed-empty-sources data-work-surface-open="sources">${L("打开来源")}</button></div>
    </div>
    <footer class="feed-directory-footer"><span data-feed-result-count>${L("{count} 个 Item", { count: initiallyVisible.length })}</span><small>${L("选择一项查看详情")}${view.demo ? `<button type="button" data-prototype-feed-empty-state>${L("预览空状态")}</button>` : ""}</small></footer>
  </section>`;
}

function feedSourceStatusLabel(status: string): string {
  return ({
    active: L("已连接"),
    paused: L("已暂停"),
    error: L("需处理"),
    disconnected: L("未连接"),
    imported: L("仅历史数据"),
  } as Record<string, string>)[status] ?? status;
}

function feedSourceErrorLabel(errorCode: string | null): string | null {
  if (!errorCode) return null;
  if (errorCode === "reconciliation_required") {
    return L("上次结果需要重新核对，请再次同步");
  }
  if (["process_interrupted", "provider_interrupted", "feed_source_sync_interrupted"].includes(errorCode)) {
    return L("上次同步中断，请再次同步");
  }
  if (["connector_needs_auth", "auth_required", "unauthorized"].includes(errorCode)) {
    return L("授权已失效，请重新连接账号");
  }
  if (errorCode === "connector_rate_limited") {
    return L("GitHub 已限制轮询频率，将在允许后重试");
  }
  if (["credential_unreadable", "credential_store_unavailable"].includes(errorCode)) {
    return L("本机凭据暂时不可读取，请恢复 SecretStore 后重试");
  }
  if (errorCode === "connector_stale_history") {
    return L("Gmail 同步记录已过期，请重新连接后同步");
  }
  if (errorCode === "fixture_not_live") {
    return L("当前不是实时连接，请完成账号授权");
  }
  return L("上次同步失败，可再次同步");
}

interface SourceWorkbenchEntry {
  id: string;
  name: string;
  description: string;
  kind: "github" | "gmail" | "rss" | "other";
  typeLabel: string;
  accountLabel: string;
  status: "active" | "attention" | "syncing" | "paused";
  statusLabel: string;
  lastFetch: string;
  nextFetch: string;
  schedule: string;
  itemCount: number;
  scope: string;
  endpoint: string;
  configuredEndpoint: string;
  protocolStatus: string | null;
  homeUrl: string | null;
  editableEndpoint: boolean;
  prototype: boolean;
  realSourceId: string | null;
  syncKind: FeedSourceRecord["sync_kind"] | "prototype";
  sourceState: FeedSourceRecord["status"] | "prototype";
  enabled: boolean;
  scheduleMode: "manual" | "interval";
  scheduleEnabled: boolean;
  intervalMinutes: number;
  messages: string[];
  runs: FeedSourceRunRecord[];
}

function sourceKindForRecord(source: FeedSourceRecord): SourceWorkbenchEntry["kind"] {
  if (source.sync_kind === "github") return "github";
  if (source.sync_kind === "gmail") return "gmail";
  if (["rss", "custom_rss"].includes(source.kind) || source.sync_kind === "public_source") return "rss";
  return "other";
}

function sourceWorkbenchEntries(view: GoalBoardWebView): SourceWorkbenchEntry[] {
  const real = view.feed.sources.map((source): SourceWorkbenchEntry => {
    const kind = sourceKindForRecord(source);
    const rssHttp = kind === "rss" ? readRssHttpState(source.cursor) : null;
    const catalogFeedUrl = source.kind === "rss"
      ? view.feed_source_catalog?.find((entry) => entry.id === source.definition_id)?.feed_url
      : undefined;
    const sourceItems = view.feed.feed_items.filter((item) => item.source_id === source.source_id).slice(0, 3);
    const runs = view.feed.runs.filter((run) => run.source_id === source.source_id).slice(0, 8);
    const retryAfterAt = runs.find((run) => run.error_code === "connector_rate_limited")?.receipt?.retry_after_at;
    const running = runs.some((run) => run.phase === "running");
    const attention = source.status === "error" || source.status === "disconnected";
    const schedule = source.schedule;
    const scheduleLabel = schedule.mode === "manual"
      ? L("仅手动拉取")
      : schedule.enabled
        ? L("每 {count} 分钟", { count: schedule.interval_minutes })
        : L("定时拉取已关闭");
    return {
      id: source.source_id,
      name: source.name,
      description: source.description,
      kind,
      typeLabel: kind === "github" ? "GitHub" : kind === "gmail" ? "Gmail" : kind === "rss" ? "RSS / Atom" : L("其他来源"),
      accountLabel: source.account_label ?? rssHttp?.feed_title ?? (kind === "github" || kind === "gmail"
        ? source.status === "disconnected" ? L("未连接账号") : L("已连接账号")
        : L("公开来源")),
      status: running ? "syncing" : attention ? "attention" : source.status === "paused" ? "paused" : "active",
      statusLabel: running ? L("正在拉取") : feedSourceStatusLabel(source.status),
      lastFetch: source.last_sync_at ? formatDate(source.last_sync_at) : L("尚未拉取"),
      nextFetch: !source.enabled || source.status === "paused"
        ? L("已暂停")
        : typeof retryAfterAt === "string" && Number.isFinite(Date.parse(retryAfterAt))
          ? L("限流后 {time} 可重试", { time: formatDate(retryAfterAt) })
        : schedule.mode === "interval" && schedule.enabled && schedule.next_pull_at
          ? formatDate(schedule.next_pull_at)
          : L("等待手动拉取"),
      schedule: scheduleLabel,
      itemCount: source.item_count,
      scope: typeof source.config.scope === "string" && source.config.scope
        ? source.config.scope
        : kind === "github" ? L("通知、PR 与 Review 请求") : kind === "gmail" ? L("指定标签与未读邮件") : L("公开 Feed 更新"),
      endpoint: kind === "gmail"
        ? "gmail.googleapis.com · gmail.readonly"
        : kind === "github"
          ? "api.github.com · notifications"
          : String(rssHttp?.final_url ?? source.config.url ?? source.config.feed_url ?? catalogFeedUrl ?? source.config.query ?? source.account_label ?? source.kind),
      configuredEndpoint: kind === "gmail"
        ? "gmail.googleapis.com · gmail.readonly"
        : kind === "github"
          ? "api.github.com · notifications"
          : String(source.config.url ?? source.config.feed_url ?? catalogFeedUrl ?? source.config.query ?? source.account_label ?? source.kind),
      protocolStatus: rssHttp
        ? rssHttp.etag
          ? L("ETag 条件请求已启用")
          : rssHttp.last_modified
            ? L("Last-Modified 条件请求已启用")
            : rssHttp.last_success_at
              ? L("源站未提供条件校验；使用 Item 身份去重")
              : L("首次拉取后验证 Feed 并记录条件请求")
        : null,
      homeUrl: rssHttp?.home_url ?? null,
      editableEndpoint: source.kind === "custom_rss",
      prototype: false,
      realSourceId: source.source_id,
      syncKind: source.sync_kind,
      sourceState: source.status,
      enabled: source.enabled,
      scheduleMode: schedule.mode,
      scheduleEnabled: schedule.mode === "interval" && schedule.enabled,
      intervalMinutes: schedule.mode === "interval" ? schedule.interval_minutes : 60,
      messages: sourceItems.map((item) => item.title),
      runs,
    };
  });
  const prototype: SourceWorkbenchEntry[] = [
    {
      id: "prototype-source-github",
      name: "GitHub · adeptify",
      description: L("读取分配给你的 PR、Issue 与 Review 请求。"),
      kind: "github",
      typeLabel: "GitHub",
      accountLabel: "yijunwang · adeptify",
      status: "active",
      statusLabel: L("运行正常"),
      lastFetch: L("今天 14:18"),
      nextFetch: L("今天 14:48"),
      schedule: L("每 30 分钟"),
      itemCount: 24,
      scope: L("Notifications · PR · Review requests"),
      endpoint: "github.com/adeptify/*",
      configuredEndpoint: "github.com/adeptify/*",
      protocolStatus: null,
      homeUrl: null,
      editableEndpoint: false,
      prototype: true,
      realSourceId: null,
      syncKind: "prototype",
      sourceState: "prototype",
      enabled: true,
      scheduleMode: "interval",
      scheduleEnabled: true,
      intervalMinutes: 30,
      messages: ["PR #418 请求你确认 FeedItem 与 InboxEntry 的边界", "Issue #412：Gmail 授权恢复说明"],
      runs: [],
    },
    {
      id: "prototype-source-gmail",
      name: "Gmail · product@adeptify.ai",
      description: L("只读取需要关注的产品反馈与合作邮件。"),
      kind: "gmail",
      typeLabel: "Gmail",
      accountLabel: "product@adeptify.ai",
      status: "attention",
      statusLabel: L("需重新授权"),
      lastFetch: L("今天 13:06 · 失败"),
      nextFetch: L("授权恢复后补拉"),
      schedule: L("每小时 · 工作时段"),
      itemCount: 18,
      scope: "label:product OR label:partner",
      endpoint: "gmail.googleapis.com · 只读",
      configuredEndpoint: "gmail.googleapis.com · 只读",
      protocolStatus: null,
      homeUrl: null,
      editableEndpoint: false,
      prototype: true,
      realSourceId: null,
      syncKind: "prototype",
      sourceState: "prototype",
      enabled: true,
      scheduleMode: "interval",
      scheduleEnabled: true,
      intervalMinutes: 60,
      messages: ["设计伙伴反馈：Inbox 不应成为第二个 Feed", "合作方：下周试用安排"],
      runs: [],
    },
    {
      id: "prototype-source-rss",
      name: "RSS · Latent Space",
      description: L("跟踪 agent 产品、模型与工具设计的新文章。"),
      kind: "rss",
      typeLabel: "RSS / Atom",
      accountLabel: L("公开来源"),
      status: "syncing",
      statusLabel: L("正在拉取"),
      lastFetch: L("今天 12:25"),
      nextFetch: L("本次完成后 6 小时"),
      schedule: L("每 6 小时"),
      itemCount: 61,
      scope: L("新文章与更新"),
      endpoint: "latent.space/feed",
      configuredEndpoint: "latent.space/feed",
      protocolStatus: L("ETag 条件请求已启用"),
      homeUrl: "https://www.latent.space/",
      editableEndpoint: false,
      prototype: true,
      realSourceId: null,
      syncKind: "prototype",
      sourceState: "prototype",
      enabled: true,
      scheduleMode: "interval",
      scheduleEnabled: true,
      intervalMinutes: 360,
      messages: ["Designing calm inboxes for agentic products", "Runtime UX beyond chat"],
      runs: [],
    },
  ];
  const realKinds = new Set(real.map((entry) => entry.kind));
  return view.demo ? [...real, ...prototype.filter((entry) => !realKinds.has(entry.kind))] : real;
}

function sourceIconName(kind: SourceWorkbenchEntry["kind"]): GoalBoardIcon {
  return kind === "github" ? "tree" : kind === "gmail" ? "input" : kind === "rss" ? "activity" : "link";
}

function renderSourceDirectory(view: GoalBoardWebView): string {
  const entries = sourceWorkbenchEntries(view);
  return `<section class="desktop-directory-panel source-directory" data-directory-panel="sources" data-source-directory hidden>
    <header class="desktop-directory-heading source-directory-heading"><button type="button" data-directory-back aria-label="${L("返回上一级")}">${icon("back")}</button><span><strong>${L("来源")}</strong><small>${L("账号、接入源与拉取计划")}</small></span><button class="source-add-trigger" type="button" data-feed-sources-open aria-label="${L("添加来源")}" title="${L("添加来源")}">${icon("plus")}</button></header>
    <div class="source-directory-tools">
      <button class="source-mobile-add" type="button" data-feed-sources-open>${icon("plus")}${L("添加来源")}</button>
      <label class="feed-directory-search">${icon("search")}<input type="search" data-source-search aria-label="${L("搜索来源")}" placeholder="${L("搜索账号或来源")}" autocomplete="off"></label>
      <div class="source-filter-row" role="group" aria-label="${L("来源筛选")}"><button class="is-active" type="button" data-source-filter="all">${L("全部")}</button><button type="button" data-source-filter="account">${L("账号")}</button><button type="button" data-source-filter="public">${L("公开 Feed")}</button><button type="button" data-source-filter="attention">${L("需处理")}</button></div>
    </div>
    <div class="source-list" data-source-list role="listbox" aria-label="${L("来源列表")}">${entries.map((entry, index) => `<button class="source-list-item directory-list-row${index === 0 ? " is-selected" : ""}" type="button" role="option" aria-selected="${index === 0}" tabindex="${index === 0 ? "0" : "-1"}" data-source-entry-id="${escapeHtml(entry.id)}" data-source-kind="${escapeHtml(entry.kind)}" data-source-status="${escapeHtml(entry.status)}" data-source-search-value="${escapeHtml(`${entry.name} ${entry.typeLabel} ${entry.accountLabel}`.toLocaleLowerCase())}"><span class="source-list-icon">${icon(sourceIconName(entry.kind))}</span><span class="source-list-copy"><span><em>${escapeHtml(entry.typeLabel)}</em>${entry.prototype ? `<small>${L("演示")}</small>` : ""}</span><strong>${escapeHtml(entry.name)}</strong><p>${escapeHtml(entry.accountLabel)}</p><small>${escapeHtml(`${L("上次")} ${entry.lastFetch} · ${L("下次")} ${entry.nextFetch}`)}</small></span><span class="source-list-state directory-row-state" data-source-status="${escapeHtml(entry.status)}">${escapeHtml(entry.statusLabel)}</span></button>`).join("")}<div class="feed-list-empty source-list-empty" data-source-empty hidden>${icon("search")}<strong>${L("没有符合条件的来源")}</strong><p>${L("换一个关键词或清除筛选，来源仍然保留。")}</p><button type="button" data-source-filter-reset>${L("清除筛选")}</button></div></div>
    <footer class="feed-directory-footer"><span data-source-result-count>${L("{count} 个来源", { count: entries.length })}</span><small>${L("选择来源查看详情与拉取计划")}</small></footer>
  </section>`;
}

function renderSourceRunLedger(entry: SourceWorkbenchEntry): string {
  if (entry.prototype) {
    return `<ol class="source-run-ledger"><li data-run-state="complete"><span>${icon("check")}</span><div><strong>${L("最近一次拉取")}</strong><p>${escapeHtml(entry.status === "attention" ? L("失败 · 授权已失效，游标未推进") : L("完成 · 新增 3，去重 8"))}</p></div><time>${escapeHtml(entry.lastFetch)}</time></li><li data-run-state="scheduled"><span>${icon("waiting")}</span><div><strong>${L("下一次计划")}</strong><p>${escapeHtml(entry.schedule)}</p></div><time>${escapeHtml(entry.nextFetch)}</time></li></ol>`;
  }
  if (!entry.runs.length) {
    return `<div class="source-panel-empty">${icon("waiting")}<strong>${L("还没有运行记录")}</strong><p>${L("手动拉取或计划第一次执行后，会在这里留下可诊断记录。")}</p></div>`;
  }
  return `<ol class="source-run-ledger">${entry.runs.map((run) => {
    const state = run.phase === "running" ? "running" : run.phase === "interrupted" || run.error_code ? "error" : "complete";
    const title = run.phase === "running" ? L("正在拉取") : run.phase === "interrupted" ? L("拉取已中断") : run.error_code ? L("拉取失败") : L("拉取完成");
    const result = run.phase === "running"
      ? L("已开始，等待 Provider 返回")
      : run.error_code
        ? L("错误：{code} · 可安全重试", { code: run.error_code })
        : run.receipt?.rss_http && typeof run.receipt.rss_http === "object" && run.receipt.rss_http !== null && (run.receipt.rss_http as Record<string, unknown>).not_modified === true
          ? L("源站未修改 · 没有重复下载或新增 Item")
        : L("新增 {created} · 去重 {deduped}", { created: run.created_count, deduped: run.deduped_count });
    return `<li data-run-state="${state}"><span>${icon(state === "complete" ? "check" : state === "running" ? "refresh" : "alert")}</span><div><strong>${title}</strong><p>${escapeHtml(result)}</p></div><time>${escapeHtml(formatDate(run.completed_at ?? run.started_at))}</time></li>`;
  }).join("")}</ol>`;
}

function sourceScopeDisplay(entry: SourceWorkbenchEntry): string {
  if (entry.kind !== "gmail") return entry.scope;
  const scope = parseGmailScope(entry.scope);
  const preset = GMAIL_SCOPE_PRESETS.find((candidate) => candidate.value === scope);
  return preset ? `${L(preset.label)} · ${preset.value}` : entry.scope;
}

function renderSourceScopeField(entry: SourceWorkbenchEntry): string {
  if (!entry.prototype && entry.kind === "gmail") {
    const selectedScope = parseGmailScope(entry.scope) ?? GMAIL_SCOPE_PRESETS[0].value;
    return `<label><span>${L("拉取范围")}</span><select data-source-config-field="scope">${GMAIL_SCOPE_PRESETS.map((preset) => `<option value="${escapeHtml(preset.value)}"${selectedScope === preset.value ? " selected" : ""}>${escapeHtml(L(preset.label))} · ${escapeHtml(preset.value)}</option>`).join("")}</select><small class="source-config-help">${L("首次同步和增量同步都会执行同一范围；不做完整邮箱回填。")}</small></label>`;
  }
  if (!entry.prototype && entry.kind === "rss") {
    return `<label><span>${L("拉取范围")}</span><input value="${escapeHtml(L("Feed 中公开发布的最近更新"))}" data-source-config-field="scope" readonly aria-readonly="true"><small class="source-config-help">${L("RSS / Atom 默认全部进入 Feed，不会自动占用 Inbox。")}</small></label>`;
  }
  return `<label><span>${L("拉取范围")}</span><textarea rows="3" ${entry.prototype ? "data-prototype-config-input" : "data-source-config-field=\"scope\""}>${escapeHtml(entry.scope)}</textarea></label>`;
}

function renderSourceWorkbench(view: GoalBoardWebView): string {
  const entries = sourceWorkbenchEntries(view);
  const initial = entries[0] ?? null;
  return `<section class="desktop-work-surface source-workbench" data-work-surface="sources" data-work-surface-label="${L("来源")}" data-source-workbench hidden>
    ${entries.map((entry) => {
      const sourceId = entry.realSourceId ? escapeHtml(entry.realSourceId) : "";
      const canSync = entry.prototype || (entry.enabled && entry.sourceState !== "paused" && entry.sourceState !== "disconnected");
      const connector = entry.syncKind === "github" || entry.syncKind === "gmail";
      return `<article class="source-detail" data-source-detail="${escapeHtml(entry.id)}"${entry.realSourceId ? ` data-real-source-id="${sourceId}"` : ""}${entry.id === initial?.id ? "" : " hidden"}>
      <header class="source-detail-header"><div class="source-detail-identity"><span class="source-detail-mark">${icon(sourceIconName(entry.kind))}</span><div><div class="source-detail-labels"><span>${escapeHtml(entry.typeLabel)}</span>${entry.prototype ? `<em>${L("高保真演示 · 不连接外部服务")}</em>` : `<em>${L("真实本地来源")}</em>`}</div><h1>${escapeHtml(entry.name)}</h1><p>${escapeHtml(entry.description)}</p></div></div><div class="source-detail-health" data-source-status="${escapeHtml(entry.status)}"><strong data-source-health-label>${escapeHtml(entry.statusLabel)}</strong><small>${escapeHtml(entry.prototype ? L("模拟状态") : L("来自数据库与运行记录"))}</small></div></header>
      <nav class="source-detail-tabs" role="tablist" aria-label="${L("来源详情")}"><button class="is-active" type="button" role="tab" aria-selected="true" data-source-detail-tab="overview">${L("概览")}</button><button type="button" role="tab" aria-selected="false" data-source-detail-tab="config">${L("配置")}</button><button type="button" role="tab" aria-selected="false" data-source-detail-tab="schedule">${L("拉取计划")}</button><button type="button" role="tab" aria-selected="false" data-source-detail-tab="messages">${L("来源消息")}</button><button type="button" role="tab" aria-selected="false" data-source-detail-tab="runs">${L("运行状态")}</button></nav>
      <div class="source-detail-panels">
        <section class="source-detail-panel source-detail-panel--overview" data-source-detail-panel="overview"><section class="source-now"><div><h2>${entry.status === "attention" ? L("需要你的处理") : entry.status === "syncing" ? L("正在拉取新消息") : entry.status === "paused" ? L("来源已暂停") : L("来源运行正常")}</h2><p>${entry.status === "attention" ? L("授权或运行状态需要处理；最后可信游标不会被失败结果覆盖。") : entry.status === "syncing" ? L("正在读取新条目；相同计划槽不会重复写入。") : entry.status === "paused" ? L("消息与运行历史仍保留；恢复后按当前计划继续。") : L("手动拉取与后台计划共用同一幂等运行记录。")}</p></div>${entry.prototype ? `<button type="button" data-prototype-source-sync="${escapeHtml(entry.id)}">${icon("refresh")}${L("模拟立即拉取")}</button><p data-prototype-action-status role="status" hidden></p>` : `<button type="button" data-source-runtime-action="sync" data-source-id="${sourceId}"${canSync ? "" : " disabled"}>${icon("refresh")}${L("立即拉取")}</button><p data-source-action-status role="status" hidden></p>`}</section><section class="source-overview-section"><header class="source-panel-heading"><h2>${L("概览")}</h2><p>${L("账号、接入源与拉取计划")}</p></header><dl class="source-overview-ledger"><div><dt>${L("账号 / 接入源")}</dt><dd>${escapeHtml(entry.accountLabel)}</dd></div><div><dt>${L("连接状态")}</dt><dd>${escapeHtml(entry.statusLabel)}</dd></div><div><dt>${L("上次拉取")}</dt><dd>${escapeHtml(entry.lastFetch)}</dd></div><div><dt>${L("下次拉取")}</dt><dd>${escapeHtml(entry.nextFetch)}</dd></div><div><dt>${L("已拉取消息")}</dt><dd>${entry.itemCount}</dd></div><div><dt>${L("范围")}</dt><dd title="${escapeHtml(sourceScopeDisplay(entry))}">${escapeHtml(sourceScopeDisplay(entry))}</dd></div>${entry.kind === "gmail" && !entry.prototype ? `<div><dt>${L("授权")}</dt><dd>gmail.readonly · GET only</dd></div>` : ""}${entry.protocolStatus ? `<div><dt>${L("条件请求")}</dt><dd>${escapeHtml(entry.protocolStatus)}</dd></div>` : ""}${entry.homeUrl ? `<div><dt>${L("订阅站点")}</dt><dd title="${escapeHtml(entry.homeUrl)}">${escapeHtml(entry.homeUrl)}</dd></div>` : ""}</dl></section>${entry.prototype ? "" : `<div class="source-runtime-actions"><button type="button" data-source-runtime-action="${entry.enabled ? "pause" : "resume"}" data-source-id="${sourceId}">${entry.enabled ? L("暂停来源") : L("恢复来源")}</button>${connector ? `<button type="button" data-source-runtime-action="disconnect" data-source-id="${sourceId}">${L("断开账号")}</button>` : ""}<details><summary>${L("删除来源")}</summary><p>${L("请选择历史处理方式。两种操作都会停止后续拉取。")}</p><div><button type="button" data-source-delete="retain_history" data-source-id="${sourceId}">${L("删除来源，保留历史")}</button><button class="is-danger" type="button" data-source-delete="delete_local_history" data-source-id="${sourceId}">${L("连同本地历史删除")}</button></div></details></div>`}</section>
        <section class="source-detail-panel" data-source-detail-panel="config" hidden><header class="source-panel-heading"><h2>${L("配置")}</h2><p>${entry.prototype ? L("不会写入数据库或外部账号") : L("地址与账号身份由 Provider 管理；这里只保存非秘密配置")}</p></header><div class="source-config-sheet"><label><span>${L("来源名称")}</span><input value="${escapeHtml(entry.name)}" ${entry.prototype ? "data-prototype-config-input" : "data-source-config-field=\"name\""}></label><label><span>${L("账号 / 地址")}</span><input value="${escapeHtml(entry.configuredEndpoint)}"${entry.editableEndpoint ? ` data-source-config-field="feed_url"` : " readonly aria-readonly=\"true\""}>${entry.editableEndpoint ? `<small class="source-config-help">${L("修改地址后会清空旧 Feed 的条件请求游标；已有 Item 保留。")}</small>` : ""}</label><label><span>${L("说明")}</span><textarea rows="2" ${entry.prototype ? "data-prototype-config-input" : "data-source-config-field=\"description\""}>${escapeHtml(entry.description)}</textarea></label>${renderSourceScopeField(entry)}<div class="source-config-actions"><button type="button" ${entry.prototype ? "data-prototype-config-save" : `data-source-config-save data-source-id="${sourceId}"`}>${entry.prototype ? L("保存演示配置") : L("保存配置")}</button><small>${entry.prototype ? L("不会写入数据库或外部账号") : entry.editableEndpoint ? L("只接受公开 HTTPS RSS / Atom；保存后请立即拉取验证。") : L("地址与账号身份由 Provider 管理；这里只保存非秘密配置")}</small></div><p ${entry.prototype ? "data-prototype-config-status" : "data-source-action-status"} role="status" hidden></p></div></section>
        <section class="source-detail-panel" data-source-detail-panel="schedule" hidden><div class="source-schedule-sheet"><div class="source-schedule-heading"><div><h2>${L("定时拉取")}</h2><p>${entry.prototype ? L("仅演示计划配置；浏览器关闭后不会继续运行。") : L("计划由本地服务执行；重启或休眠错过时只补拉一次。")}</p></div><label class="source-schedule-toggle"><input type="checkbox" ${entry.scheduleEnabled ? "checked " : ""}${entry.prototype ? "data-prototype-schedule-enabled" : "data-source-schedule-enabled"}><span>${entry.scheduleEnabled ? L("已开启") : L("已暂停")}</span></label></div><label><span>${L("模式")}</span><select ${entry.prototype ? "data-prototype-schedule-frequency" : "data-source-schedule-mode"}><option value="manual"${entry.scheduleMode === "manual" ? " selected" : ""}>${L("仅手动拉取")}</option><option value="interval"${entry.scheduleMode === "interval" ? " selected" : ""}>${L("按固定间隔")}</option></select></label><label><span>${L("频率")}</span><select ${entry.prototype ? "data-prototype-schedule-frequency" : "data-source-schedule-interval"}>${[15, 30, 60, 360, 720, 1440].map((minutes) => `<option value="${minutes}"${entry.intervalMinutes === minutes ? " selected" : ""}>${minutes < 60 ? L("每 {count} 分钟", { count: minutes }) : minutes === 60 ? L("每小时") : minutes === 720 ? L("每天两次") : minutes === 1440 ? L("每天一次") : L("每 {count} 小时", { count: minutes / 60 })}</option>`).join("")}</select></label><div class="source-schedule-actions"><button class="button-primary" type="button" ${entry.prototype ? "data-prototype-schedule-save" : `data-source-schedule-save data-source-id="${sourceId}"`}>${L("保存拉取计划")}</button><small>${L("下一次：{time}", { time: entry.nextFetch })}</small></div><p ${entry.prototype ? "data-prototype-schedule-status" : "data-source-action-status"} role="status" hidden></p></div></section>
        <section class="source-detail-panel" data-source-detail-panel="messages" hidden><div class="source-message-list"><header><div><h2>${L("最近来自此来源")}</h2><p>${L("完整消息仍保存在 Feed，这里只用于来源核对。")}</p></div><button type="button" data-work-surface-open="feed" data-feed-preset="feed" data-feed-source="${escapeHtml(entry.name)}">${L("在 Feed 中查看")}${icon("chevron-right")}</button></header>${entry.messages.length ? `<ul>${entry.messages.map((message) => `<li>${icon("activity")}<span><strong>${escapeHtml(message)}</strong><small>${escapeHtml(entry.name)}</small></span></li>`).join("")}</ul>` : `<div class="source-panel-empty">${icon("archive")}<strong>${L("还没有来源消息")}</strong><p>${L("完成一次拉取后，新消息会先进入 Feed。")}</p></div>`}</div></section>
        <section class="source-detail-panel" data-source-detail-panel="runs" hidden><header class="source-panel-heading"><h2>${L("运行状态")}</h2><p>${L("手动拉取或计划第一次执行后，会在这里留下可诊断记录。")}</p></header>${renderSourceRunLedger(entry)}</section>
      </div>${entry.prototype ? `<p class="prototype-honesty-note source-honesty-note">${icon("alert")}${L("此来源用于验证高保真路径；同步、授权与调度均为页面内模拟。")}</p>` : ""}
    </article>`;
    }).join("")}
    <div class="feed-detail-empty" data-source-detail-empty${initial ? " hidden" : ""}>${icon("settings")}<h1>${entries.length ? L("选择一个来源") : L("还没有可管理的来源")}</h1><p>${entries.length ? L("查看配置、拉取计划、来源消息和运行状态。") : L("从左侧添加 RSS，或连接 GitHub / Gmail 账号。")}</p>${entries.length ? "" : `<button type="button" data-feed-sources-open>${icon("plus")}${L("添加来源")}</button>`}</div>
  </section>`;
}

function renderFeedSourceManager(view: GoalBoardWebView): string {
  const catalog = view.feed_source_catalog ?? [];
  const auth = view.feed_connector_auth;
  const relay = view.relay_import;
  const sources = view.feed.sources;
  const connectorStatus = (kind: "github" | "gmail") => {
    const status = auth?.[kind];
    if (status?.bound) return `${L("已连接")} ${escapeHtml(status.hint ?? "")}`;
    if (status?.problem) return L("凭据不可读取");
    return L("未连接");
  };
  const sourceRows = sources.length
    ? sources.map((source) => {
        const canSync = source.sync_kind !== "manual" && source.enabled && source.status !== "disconnected";
        const lastFact = source.last_sync_at
          ? `${L("上次同步")} ${formatDate(source.last_sync_at)}`
          : L("尚未同步");
        return `<article class="feed-source-row directory-list-row" data-feed-source-row="${escapeHtml(source.source_id)}"><span class="feed-source-mark">${icon(source.sync_kind === "public_source" ? "link" : source.sync_kind === "github" ? "tree" : source.sync_kind === "gmail" ? "input" : "archive")}</span><div class="feed-source-copy"><strong>${escapeHtml(source.name)}</strong><p>${escapeHtml(source.description)}</p><small>${escapeHtml([source.account_label, `${source.item_count} Item`, lastFact, feedSourceErrorLabel(source.last_error_code)].filter(Boolean).join(" · "))}</small></div><div class="feed-source-side"><em class="directory-row-state" data-source-status="${escapeHtml(source.status)}">${escapeHtml(feedSourceStatusLabel(source.status))}</em><div class="feed-source-actions">${source.sync_kind !== "manual" ? `<button type="button" data-feed-source-sync="${escapeHtml(source.source_id)}"${canSync ? "" : " disabled"}>${icon("refresh")}${L("同步")}</button>` : ""}<button type="button" data-feed-source-toggle="${escapeHtml(source.source_id)}" data-feed-source-enabled="${source.enabled ? "true" : "false"}">${source.enabled ? L("暂停") : L("恢复")}</button></div></div></article>`;
      }).join("")
    : `<p class="feed-source-empty">${L("还没有来源。先从下面添加公开 Feed，或连接账号。")}</p>`;
  const catalogOptions = catalog.map((source) =>
    `<option value="${escapeHtml(source.id)}">${escapeHtml(`${source.category_label} · ${source.name}`)}</option>`
  ).join("");
  return `<dialog class="feed-source-dialog" data-feed-sources-dialog aria-labelledby="feed-source-dialog-title"><div class="feed-source-dialog-shell"><header><span>${icon("settings")}</span><div><h2 id="feed-source-dialog-title">${L("来源与连接")}</h2><p>${L("GoalBoard 直接保存来源、凭据、同步游标和正文，不再依赖 Relay 运行。")}</p></div><button type="button" data-feed-sources-close aria-label="${L("关闭")}">${icon("x")}</button></header><div class="feed-source-dialog-scroll">
    <section class="feed-source-section"><div class="feed-source-section-title"><h3>${L("来源与同步状态")}</h3><small>${sources.length} ${L("个来源")}</small></div><div class="feed-source-list">${sourceRows}</div></section>
    <section class="feed-source-section"><div class="feed-source-section-title"><h3>${L("添加一个无需账号的来源")}</h3></div><div class="feed-source-form-grid">
      <div class="feed-source-form"><label><span>${L("RSS 目录")}</span><select data-feed-rss-definition>${catalogOptions}</select></label><button type="button" data-feed-source-register="rss"${catalog.length ? "" : " disabled"}>${L("添加")}</button></div>
      <div class="feed-source-form"><label><span>${L("网页查询")}</span><input data-feed-source-value="web_query" placeholder="AI agent product launch"></label><button type="button" data-feed-source-register="web_query">${L("添加")}</button></div>
      <div class="feed-source-form"><label><span>${L("YouTube Channel ID")}</span><input data-feed-source-value="youtube_channel" placeholder="UC…"></label><button type="button" data-feed-source-register="youtube_channel">${L("添加")}</button></div>
      <div class="feed-source-form"><label><span>${L("自定义 HTTPS RSS / Atom")}</span><input data-feed-source-value="custom_rss" placeholder="https://example.com/feed.xml"></label><button type="button" data-feed-source-register="custom_rss">${L("添加")}</button></div>
    </div></section>
    <section class="feed-source-section"><div class="feed-source-section-title"><h3>${L("连接 Inbox 消息来源")}</h3></div><div class="feed-connector-grid">
      <article class="feed-connector-card"><div><strong>GitHub</strong><em>${connectorStatus("github")}</em></div><p>${L("读取 GitHub 未读通知；直接点名、分配、Review、CI 与安全提醒才进入 Inbox。")}</p><label><span>${L("Classic PAT（notifications scope）")}</span><input type="password" autocomplete="off" data-feed-connector-token="github" placeholder="ghp_…"></label><p class="feed-connector-note">${L("GitHub 的 notifications scope 同时包含通知写权限，但 GoalBoard 只调用 GET；该端点不支持 fine-grained PAT 或 GitHub App token。")}</p><div class="feed-connector-actions"><button type="button" data-feed-connector-bind="github">${L("保存 Token")}</button>${auth?.github.bound ? `<button type="button" data-feed-connector-unbind="github">${L("断开")}</button>` : ""}</div><details><summary>${L("使用 Device Flow（notifications + read:user）")}</summary><label><span>OAuth App Client ID</span><input autocomplete="off" data-feed-github-client-id></label><div class="feed-connector-actions"><button type="button" data-feed-github-device-start>${L("开始授权")}</button><button type="button" data-feed-github-device-poll hidden>${L("我已授权，检查状态")}</button></div><p data-feed-github-device-status hidden></p></details></article>
      <article class="feed-connector-card"><div><strong>Gmail</strong><em>${connectorStatus("gmail")}</em></div><p>${L("只读访问必要的邮件元数据与预览；每个 Gmail 账号建立独立来源、范围和游标。")}</p><label><span>Access token</span><input type="password" autocomplete="off" data-feed-connector-token="gmail" placeholder="ya29.…"></label><div class="feed-connector-actions"><button type="button" data-feed-connector-bind="gmail">${L("保存 Token")}</button>${auth?.gmail.bound ? `<button type="button" data-feed-connector-unbind="gmail">${L("断开")}</button>` : ""}</div><details><summary>${L("使用 Google OAuth")}</summary><p>${L("授权范围：gmail.readonly、openid、email；GoalBoard 不发送、删除或修改 Gmail 邮件。")}</p><label><span>OAuth Client ID</span><input autocomplete="off" data-feed-gmail-client-id></label><label><span>Client secret（可选）</span><input type="password" autocomplete="off" data-feed-gmail-client-secret></label><button type="button" data-feed-gmail-oauth-start>${L("打开授权页面")}</button></details></article>
    </div></section>
    <section class="feed-source-section feed-relay-migration"><div><h3>${L("把 Relay 的 Feed 所有权搬到 GoalBoard")}</h3><p>${relay.available ? L("会迁入来源、Item、正文、游标与可解密的 GitHub/Gmail 凭据；Relay 数据库保持只读。") : escapeHtml(relay.error ?? L("没有找到 Relay 数据库"))}</p></div><button type="button" data-relay-import-open${relay.available ? "" : " disabled"}>${icon("refresh")}${L("迁移 Relay")}</button></section>
    <p class="form-error" data-feed-source-error role="alert" hidden></p><p class="feed-source-progress" data-feed-source-progress role="status" hidden></p>
  </div></div></dialog>`;
}

function renderDecisionFeedDetail(entry: FeedDirectoryEntry, view: GoalBoardWebView, selected: boolean): string {
  const group = entry.decisionGroup!;
  const count = decisionGroupCount(group);
  return `<article class="feed-detail feed-detail--decision" data-feed-detail="${escapeHtml(entry.id)}"${selected ? "" : " hidden"}>
    <header class="feed-detail-header"><div class="feed-detail-kicker"><span>Inbox Message</span><span>${L("Goal 决定")}</span><span>${feedDispositionLabel("inbox")}</span></div><h1>${escapeHtml(entry.title)}</h1><p>${escapeHtml(entry.summary)}</p><div class="feed-detail-meta"><span>${icon("workflow")}GoalBoard</span><time datetime="${escapeHtml(entry.updatedAt)}">${formatDate(entry.updatedAt)}</time></div></header>
    <section class="feed-decision-work"><header><div><span>${L("这些决定属于")}</span>${renderDecisionGoalLink(group.item)}</div><small>${count} ${L("项")}</small></header><div class="decision-stack">
      ${group.goalTreeProposals.map((proposal) => renderGoalTreeProposalDecision(proposal, view)).join("")}
      ${group.rewires.map((rewire) => renderRewireDecision(rewire, view)).join("")}
      ${group.item ? group.contractProposals.map((proposal) => renderContractProposal(proposal, group.item!.goal, view)).join("") : ""}
      ${group.candidates.map((candidate) => renderCandidateDecision(candidate, view)).join("")}
      ${group.humanReview && group.item ? renderHumanReview(group.item, view) : ""}
      ${group.risks.map((risk) => renderRiskDecision(risk, group.item, view)).join("")}
    </div></section>
  </article>`;
}

function renderInboxReferenceDetail(entry: FeedDirectoryEntry, selected: boolean, routePrefix: string): string {
  const inboxEntry = entry.inboxEntry!;
  const historical = inboxEntry.status === "done" || inboxEntry.status === "dismissed";
  const subjectLabel = inboxEntry.subject_type === "source_fault"
    ? entry.source ? L("来源「{source}」", { source: entry.source.name }) : L("已删除的来源")
    : inboxEntry.subject_type === "goal_decision"
      ? entry.goalId ? L("Goal「{goal}」", { goal: entry.title }) : L("已删除的 Goal")
      : L("已删除的 Feed Item");
  const openSubject = inboxEntry.subject_type === "source_fault" && entry.source
    ? `<button class="button-primary" type="button" data-open-source-record="${escapeHtml(entry.source.source_id)}">${icon("settings")}${L("查看来源")}</button>`
    : inboxEntry.subject_type === "goal_decision" && entry.goalId
      ? `<a class="button-primary" href="${escapeHtml(`${routePrefix}/goals/${encodeURIComponent(entry.goalId)}`)}">${icon("target")}${L("查看 Goal")}</a>`
      : `<button type="button" disabled aria-disabled="true">${L("原对象不可用")}</button>`;
  const stateActions = historical
    ? `<button type="button" data-inbox-action="open" data-inbox-entry-id="${escapeHtml(inboxEntry.entry_id)}" data-inbox-entry-revision="${inboxEntry.revision}">${icon("refresh")}${L("重新打开")}</button>`
    : `<button type="button" data-inbox-action="done" data-inbox-entry-id="${escapeHtml(inboxEntry.entry_id)}" data-inbox-entry-revision="${inboxEntry.revision}">${icon("check")}${L("完成")}</button><button class="feed-action-subtle" type="button" data-inbox-action="dismissed" data-inbox-entry-id="${escapeHtml(inboxEntry.entry_id)}" data-inbox-entry-revision="${inboxEntry.revision}">${L("忽略")}</button>`;
  const errorCode = typeof inboxEntry.detail.error_code === "string" ? inboxEntry.detail.error_code : "";
  const userAction = typeof inboxEntry.detail.user_action === "string"
    ? inboxEntry.detail.user_action
    : inboxEntry.subject_type === "source_fault"
      ? L("检查来源配置、授权或拉取范围后重新同步。")
      : L("进入原对象完成判断或处理。")
  return `<article class="feed-detail feed-detail--attention inbox-reference-detail" data-feed-detail="${escapeHtml(entry.id)}" data-inbox-reference-detail data-inbox-subject-type="${inboxEntry.subject_type}"${selected ? "" : " hidden"}>
    <header class="feed-detail-header"><div class="feed-detail-kicker"><span>${escapeHtml(entry.kindLabel)}</span><span>${escapeHtml(entry.sourceLabel)}</span><span>${escapeHtml(inboxEntryStatusLabel(inboxEntry.status))}</span></div><h1>${escapeHtml(entry.title)}</h1><p>${escapeHtml(entry.summary)}</p><div class="feed-detail-meta"><span>${icon("link")}${escapeHtml(subjectLabel)}</span><time datetime="${escapeHtml(inboxEntry.updated_at)}">${formatDate(inboxEntry.updated_at)}</time>${errorCode ? `<span>${escapeHtml(errorCode)}</span>` : ""}</div><div class="feed-detail-actions" data-feed-actions>${openSubject}${stateActions}</div><p class="feed-action-status" data-inbox-action-status role="status" hidden></p></header>
    <section class="inbox-attention-context" aria-label="${L("处理上下文")}"><dl><div><dt>${L("为什么进入 Inbox")}</dt><dd>${escapeHtml(inboxEntryReasonLabel(inboxEntry.reason))}</dd></div><div><dt>${L("关联对象")}</dt><dd>${escapeHtml(subjectLabel)}</dd></div><div><dt>${L("当前状态")}</dt><dd>${escapeHtml(inboxEntryStatusLabel(inboxEntry.status))}</dd></div><div><dt>${L("下一步")}</dt><dd>${escapeHtml(userAction)}</dd></div></dl></section>
    <p class="prototype-honesty-note">${icon("link")}${L("Inbox 只保存这条引用和进入原因；原对象内容没有复制到这里。")}</p>
  </article>`;
}

function renderPersistedFeedDetail(entry: FeedDirectoryEntry, selected: boolean, routePrefix: string): string {
  const item = entry.item!;
  const summary = feedPlainText(item.summary, 420);
  const body = renderFeedRichText(item.body || item.summary || L("这条消息没有可显示的正文。"));
  const itemUrl = safeExternalHref(item.url);
  const isInboxMessage = item.item_type === "inbox_message";
  const inboxEntry = entry.inboxEntry ?? null;
  const effectiveDisposition = item.disposition === "inbox" && !entry.inboxActive
    ? "feed"
    : item.disposition;
  const destinationCopy = ({
    feed: [L("仅保留在 Feed"), L("没有占用 Inbox；原消息和来源保持可追溯")],
    inbox: [L("已加入 Inbox"), L("Inbox 只保存需处理引用；原消息仍在 Feed")],
    saved: [L("已保存为资料"), L("完整消息、来源和已有资料保持关联")],
    promoted: [L("已升格为 Goal"), L("Goal 使用这条消息作为可追溯输入")],
    processing: [L("正在处理"), L("关联 Goal 已打开，原消息仍保留")],
    archived: [isInboxMessage ? L("已归档") : L("已忽略"), L("默认列表不再显示，仍可从状态筛选恢复")],
  } as Record<string, [string, string]>)[effectiveDisposition] ?? [effectiveDisposition, L("原消息仍然保留")];
  const linkedGoal = item.linked_goal_id
    ? `<a class="feed-linked-goal" href="${escapeHtml(`${routePrefix}/goals/${encodeURIComponent(item.linked_goal_id)}`)}">${icon("target")}${L("打开关联 Goal")}${icon("chevron-right")}</a>`
    : "";
  const materialRows = item.materials.length
    ? item.materials.map((material) => {
        const materialUrl = safeExternalHref(material.canonical_url);
        return `<li><span>${icon("link")}</span><div><strong>${escapeHtml(material.title || material.source_name)}</strong><small>${escapeHtml([material.source_name, material.published_at ? formatDate(material.published_at) : ""].filter(Boolean).join(" · "))}</small>${material.preview ? `<p>${escapeHtml(material.preview)}</p>` : ""}${material.content ? `<details class="feed-material-content"><summary>${L("查看保存的正文")}</summary><div>${escapeHtml(material.content)}</div></details>` : material.content_ref && !material.content_available ? `<small class="feed-material-unavailable">${L("正文暂时不可读取")}</small>` : ""}</div>${materialUrl ? `<a href="${escapeHtml(materialUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${L("打开原资料")}">${icon("arrow")}</a>` : ""}</li>`;
      }).join("")
    : `<li class="feed-material-empty">${icon("archive")}<p>${L("这条 Item 没有附带资料；正文和来源信息仍会进入处理上下文。")}</p></li>`;
  const inboxReferenceActions = inboxEntry
    ? inboxEntry.status === "done" || inboxEntry.status === "dismissed"
      ? `<button class="button-primary" type="button" data-inbox-action="open" data-inbox-entry-id="${escapeHtml(inboxEntry.entry_id)}" data-inbox-entry-revision="${inboxEntry.revision}">${icon("refresh")}${L("重新打开")}</button><button type="button" data-inbox-open-feed="${escapeHtml(item.item_id)}">${icon("activity")}${L("查看原消息")}</button>`
      : `<button class="button-primary" type="button" data-inbox-open-feed="${escapeHtml(item.item_id)}">${icon("activity")}${L("查看原消息")}</button><button type="button" data-feed-action="promote" data-feed-item-id="${escapeHtml(item.item_id)}" data-feed-revision="${item.revision}">${icon("target")}${item.linked_goal_id ? L("查看 Goal") : L("升格为 Goal")}</button><button type="button" data-inbox-action="done" data-inbox-entry-id="${escapeHtml(inboxEntry.entry_id)}" data-inbox-entry-revision="${inboxEntry.revision}">${icon("check")}${L("完成")}</button><button class="feed-action-subtle" type="button" data-inbox-action="dismissed" data-inbox-entry-id="${escapeHtml(inboxEntry.entry_id)}" data-inbox-entry-revision="${inboxEntry.revision}">${L("忽略")}</button>`
    : "";
  const activeActions = isInboxMessage && inboxEntry
    ? inboxReferenceActions
    : item.disposition === "archived"
    ? `<button type="button" data-feed-action="restore" data-feed-restore-target="${isInboxMessage ? "inbox" : "feed"}" data-feed-item-id="${escapeHtml(item.item_id)}" data-feed-revision="${item.revision}">${isInboxMessage ? L("恢复到 Inbox") : L("恢复到 Feed")}</button>`
    : isInboxMessage
      ? `<button class="button-primary" type="button" data-feed-action="start" data-feed-item-id="${escapeHtml(item.item_id)}" data-feed-revision="${item.revision}">${icon("play")}${item.disposition === "processing" ? L("继续处理") : L("开始处理")}</button><button type="button" data-feed-action="promote" data-feed-item-id="${escapeHtml(item.item_id)}" data-feed-revision="${item.revision}">${icon("target")}${item.linked_goal_id ? L("查看 Goal") : L("升格为 Goal")}</button><button type="button" data-feed-action="save" data-feed-item-id="${escapeHtml(item.item_id)}" data-feed-revision="${item.revision}"${item.disposition === "saved" ? " disabled" : ""}>${item.disposition === "saved" ? L("已保存为资料") : L("保存为资料")}</button><button class="feed-action-subtle" type="button" data-feed-action="archive" data-feed-item-id="${escapeHtml(item.item_id)}" data-feed-revision="${item.revision}">${L("归档")}</button>`
      : `<button class="button-primary" type="button" data-feed-action="inbox" data-feed-item-id="${escapeHtml(item.item_id)}" data-feed-revision="${item.revision}"${entry.inboxActive ? " disabled" : ""}>${icon("input")}${entry.inboxActive ? L("已加入 Inbox") : L("加入 Inbox")}</button><button type="button" data-feed-action="save" data-feed-item-id="${escapeHtml(item.item_id)}" data-feed-revision="${item.revision}"${item.disposition === "saved" ? " disabled" : ""}>${item.disposition === "saved" ? L("已保存为资料") : L("保存为资料")}</button><button type="button" data-feed-action="promote" data-feed-item-id="${escapeHtml(item.item_id)}" data-feed-revision="${item.revision}">${icon("target")}${item.linked_goal_id ? L("查看 Goal") : L("升格为 Goal")}</button><button class="feed-action-subtle" type="button" data-feed-action="archive" data-feed-item-id="${escapeHtml(item.item_id)}" data-feed-revision="${item.revision}">${L("忽略")}</button>`;
  return `<article class="feed-detail${inboxEntry ? " feed-detail--attention" : ""}" data-feed-detail="${escapeHtml(entry.id)}" data-feed-detail-item-type="${item.item_type}" data-feed-detail-read="${item.read_at ? "read" : "unread"}"${selected ? "" : " hidden"}>
    <header class="feed-detail-header"><div class="feed-detail-kicker"><span>${escapeHtml(entry.kindLabel)}</span><span>${escapeHtml(entry.sourceLabel)}</span>${item.item_type === "feed" ? `<span data-feed-read-state>${item.read_at ? L("已读") : L("未读")}</span>` : ""}<span>${escapeHtml(feedDispositionLabel(effectiveDisposition, item.item_type))}</span></div><h1>${escapeHtml(item.title || L("未命名消息"))}</h1>${summary ? `<p>${escapeHtml(summary)}</p>` : ""}<div class="feed-detail-meta">${item.author ? `<span>${icon("user")}${escapeHtml(item.author)}</span>` : ""}<time datetime="${escapeHtml(item.source_updated_at)}">${formatDate(item.source_updated_at)}</time>${item.source_id ? `<button type="button" data-open-source-record="${escapeHtml(item.source_id)}">${icon("settings")}${L("查看来源")}</button>` : ""}${itemUrl ? `<a href="${escapeHtml(itemUrl)}" target="_blank" rel="noopener noreferrer">${L("打开原文")}${icon("arrow")}</a>` : ""}</div><div class="feed-detail-actions" data-feed-actions>${activeActions}${linkedGoal}</div><p class="feed-action-status" data-feed-action-status role="status" hidden></p></header>
    ${inboxEntry ? `<section class="inbox-attention-context" aria-label="${L("处理上下文")}"><dl><div><dt>${L("为什么进入 Inbox")}</dt><dd>${escapeHtml(inboxEntryReasonLabel(inboxEntry.reason))}</dd></div><div><dt>${L("关联对象")}</dt><dd>${escapeHtml(`${item.source_label || item.source_kind} · ${item.title}`)}</dd></div><div><dt>${L("当前状态")}</dt><dd>${escapeHtml(inboxEntryStatusLabel(inboxEntry.status))}</dd></div><div><dt>${L("下一步")}</dt><dd>${escapeHtml(inboxEntry.status === "done" || inboxEntry.status === "dismissed" ? L("可以重新打开，原消息仍保留在 Feed。") : L("查看原消息并处理，或直接完成 / 忽略这条注意力引用。"))}</dd></div></dl><p class="prototype-honesty-note">${icon("link")}${L("Inbox 只保存这条引用和进入原因；这里展示的是原 Feed Item，内容没有复制进 Inbox。")}</p></section>` : !isInboxMessage ? `<section class="feed-destination-strip" data-destination-state="${escapeHtml(effectiveDisposition)}"><span>${icon("activity")}${L("当前去向")}</span><strong>${escapeHtml(destinationCopy[0])}</strong><small>${escapeHtml(destinationCopy[1])}</small></section>` : ""}
    <section class="feed-detail-body"><h2>${L("内容")}</h2><div class="feed-rich-content">${body}</div></section>
    ${item.tags.length ? `<section class="feed-detail-tags" aria-label="${L("标签")}">${item.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</section>` : ""}
    <section class="feed-materials"><header><div><span>${L("资料")}</span><h2>${L("随 Item 一起保存的来源")}</h2></div><small>${L("{count} 项", { count: item.materials.length })}</small></header><ul>${materialRows}</ul></section>
  </article>`;
}

function renderPrototypeFeedDetail(entry: FeedDirectoryEntry, selected: boolean): string {
  const item = entry.item!;
  const prototype = entry.prototype!;
  const isInbox = item.item_type === "inbox_message";
  const isSourceFault = item.kind === "source_fault";
  const isGoalDecision = item.kind === "goal_decision";
  const primaryAction = isInbox
    ? `<button class="button-primary" type="button" data-prototype-inbox-complete data-prototype-item-id="${escapeHtml(item.item_id)}">${icon("check")}${isSourceFault ? L("重新连接并完成（模拟）") : isGoalDecision ? L("完成判断（模拟）") : L("标记为已处理")}</button>`
    : `<button class="button-primary" type="button" data-prototype-feed-action="inbox" data-prototype-item-id="${escapeHtml(item.item_id)}">${icon("input")}${L("加入 Inbox")}</button>`;
  const secondaryActions = isInbox
    ? isSourceFault
      ? `<button type="button" data-open-prototype-source="prototype-source-gmail" data-open-source-kind="gmail">${icon("settings")}${L("查看来源配置")}</button>`
      : isGoalDecision
        ? `<a class="feed-linked-goal" href="${escapeHtml(item.url ?? "#")}">${icon("target")}${L("打开关联 Goal")}</a>`
        : `<button type="button" data-prototype-inbox-defer>${L("稍后处理")}</button>`
    : `<button type="button" data-prototype-feed-action="save">${L("保存为资料")}</button><button type="button" data-prototype-feed-action="promote">${icon("target")}${L("升格为 Goal")}</button><button class="feed-action-subtle" type="button" data-prototype-feed-action="ignore">${L("忽略")}</button>`;
  return `<article class="feed-detail feed-detail--prototype${isInbox ? " feed-detail--attention" : ""}" data-feed-detail="${escapeHtml(entry.id)}" data-feed-detail-item-type="${item.item_type}" data-prototype-feed-detail${selected ? "" : " hidden"}>
    <header class="feed-detail-header"><div class="feed-detail-kicker"><span>${escapeHtml(entry.kindLabel)}</span><span>${escapeHtml(entry.sourceLabel)}</span><span>${L("仅本页演示")}</span></div><h1>${escapeHtml(item.title)}</h1><p>${escapeHtml(item.summary)}</p><div class="feed-detail-meta"><span>${icon("link")}${escapeHtml(prototype.relation)}</span><time datetime="${escapeHtml(item.source_updated_at)}">${formatDate(item.source_updated_at)}</time></div><div class="feed-detail-actions" data-feed-actions>${primaryAction}${secondaryActions}</div><p class="feed-action-status" data-prototype-action-status role="status" hidden></p></header>
    ${isInbox ? `<section class="inbox-attention-context" aria-label="${L("处理上下文")}"><dl><div><dt>${L("为什么进入 Inbox")}</dt><dd>${escapeHtml(prototype.reason)}</dd></div><div><dt>${L("关联对象")}</dt><dd>${escapeHtml(prototype.relation)}</dd></div><div><dt>${L("下一步")}</dt><dd>${escapeHtml(prototype.nextAction)}</dd></div></dl></section>` : `<section class="feed-destination-strip" data-prototype-destination><span>${icon("activity")}${L("当前去向")}</span><strong>${L("仅保留在 Feed")}</strong><small>${L("尚未占用你的 Inbox")}</small></section>`}
    <section class="feed-detail-body"><h2>${L("内容")}</h2><div class="feed-rich-content">${renderFeedRichText(item.body)}</div></section>
    <section class="feed-detail-tags" aria-label="${L("标签")}">${item.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</section>
    <p class="prototype-honesty-note">${icon("alert")}${L("演示动作只改变当前页面状态，不会连接账号、写入数据库或启动后台任务。")}</p>
  </article>`;
}

export function renderPersistedFeedItemDetail(
  item: FeedItemRecord,
  routePrefix = "",
  options: { entryId?: string; inboxActive?: boolean; inboxEntry?: InboxEntryRecord | null } = {},
): string {
  return renderPersistedFeedDetail({
    id: options.entryId ?? item.item_id,
    canonicalItemId: item.item_id,
    inboxActive: options.inboxActive ?? item.item_type === "inbox_message",
    inboxEntry: options.inboxEntry ?? null,
    itemType: item.item_type,
    kindLabel: item.item_type === "feed" ? "Feed" : "Inbox Message",
    sourceLabel: item.source_label || item.source_kind,
    disposition: item.disposition,
    title: item.title,
    summary: feedPlainText(item.summary || item.body) || L("没有附加摘要"),
    updatedAt: item.source_updated_at || item.updated_at,
    icon: item.item_type === "feed" ? "activity" : "input",
    item,
    decisionGroup: null,
    recentResult: null,
    prototype: null,
  }, true, routePrefix);
}

function renderRecentResultFeedDetail(entry: FeedDirectoryEntry, selected: boolean): string {
  const result = entry.recentResult!;
  return `<article class="feed-detail feed-detail--result" data-feed-detail="${escapeHtml(entry.id)}"${selected ? "" : " hidden"}>
    <header class="feed-detail-header"><div class="feed-detail-kicker"><span>Inbox Message</span><span>${escapeHtml(result.kindLabel)}</span><span>${escapeHtml(result.state)}</span></div><h1>${escapeHtml(result.title)}</h1><p>${escapeHtml(result.effects.join(currentLocale() === "en" ? " " : "；"))}</p><div class="feed-detail-meta"><span>${icon("workflow")}GoalBoard</span><time datetime="${escapeHtml(result.event.at)}">${formatDate(result.event.at)}</time></div></header>
    <section class="decision-results feed-result-record" aria-label="${L("最近处理结果")}"><article class="decision-result decision-result--${result.kind}"><span class="decision-result-icon">${icon(entry.icon)}</span><div class="decision-result-copy"><div><span>${escapeHtml(result.kindLabel)}</span><strong>${escapeHtml(result.state)}</strong><time datetime="${escapeHtml(result.event.at)}">${formatDate(result.event.at)}</time></div><h3>${escapeHtml(result.title)}</h3>${result.effects.map((effect) => `<p>${escapeHtml(effect)}</p>`).join("")}<small>${escapeHtml(result.reasonLabel ? `${result.reasonLabel}：${result.reason ?? result.event.reason}` : L("你的理由：{reason}", { reason: result.reason ?? result.event.reason }))}</small></div>${result.links.length ? `<div class="decision-result-links">${result.links.map((link) => `<a href="${link.href}">${escapeHtml(link.label)}${icon("chevron-right")}</a>`).join("")}</div>` : ""}</article></section>
  </article>`;
}

function renderFeedWorkbenchDetailFragments(
  view: GoalBoardWebView,
  defaultPreset: FeedItemType,
): { html: string; initial: FeedDirectoryEntry | null; initialIsInline: boolean } {
  const entries = feedDirectoryEntries(view).filter((entry) => entry.itemType === defaultPreset);
  const initial = entries[0] ?? null;
  const initialIsInline = Boolean(initial && (!initial.item || initial.prototype));
  const html = entries.map((entry) => entry.decisionGroup
      ? renderDecisionFeedDetail(entry, view, entry.id === initial?.id)
      : entry.recentResult
        ? renderRecentResultFeedDetail(entry, entry.id === initial?.id)
        : entry.inboxEntry && !entry.item
          ? renderInboxReferenceDetail(entry, entry.id === initial?.id, view.route_prefix)
        : entry.prototype
          ? renderPrototypeFeedDetail(entry, entry.id === initial?.id)
        : "").join("");
  return { html, initial, initialIsInline };
}

export function renderFeedWorkbenchFragment(
  view: GoalBoardWebView,
  defaultPreset: FeedItemType,
): string {
  return prefixLocalLinks(renderFeedWorkbenchDetailFragments(view, defaultPreset).html, view.route_prefix);
}

function renderFeedWorkbench(view: GoalBoardWebView, defaultPreset: FeedItemType, active = false): string {
  const details = renderFeedWorkbenchDetailFragments(view, defaultPreset);
  return `<section class="desktop-work-surface feed-workbench" data-work-surface="feed" data-work-surface-label="${defaultPreset === "feed" ? "Feed" : "Inbox"}" data-feed-workbench data-feed-preset="${defaultPreset}" data-loaded="${active}"${active ? ` data-loaded-preset="${defaultPreset}"` : ""}${active ? "" : " hidden"}>
    ${active ? details.html : ""}
    <div class="feed-detail-empty" data-feed-detail-empty${active && details.initialIsInline ? " hidden" : ""}>${icon("input")}<h1 data-feed-detail-empty-title>${details.initial ? L("正在载入 Item…") : L("选择一条 Item")}</h1><p data-feed-detail-empty-copy>${details.initial ? L("只读取当前选择的正文和资料。") : L("左侧目录会保留来源、状态与时间；这里用于阅读完整内容并决定下一步。")}</p><button type="button" data-retry-feed-detail hidden>${L("重试")}</button></div>
  </section>`;
}

function renderFeedOverlays(view: GoalBoardWebView): string {
  const relay = view.relay_import;
  return `${renderFeedSourceManager(view)}
    <dialog class="feed-import-dialog" data-relay-import-dialog><form method="dialog"><header><span>${icon("refresh")}</span><div><h2>${L("迁移 Relay Feed")}</h2><p>${L("把 Feed 的运行所有权完整迁入 GoalBoard，供后续删除 Relay。")}</p></div><button value="cancel" aria-label="${L("取消")}">${icon("x")}</button></header><dl><div><dt>${L("来源")}</dt><dd>${relay.source_count}</dd></div><div><dt>Item</dt><dd>${relay.item_count}</dd></div><div><dt>${L("资料")}</dt><dd>${relay.material_count}</dd></div></dl><p>${L("迁移会读取 Relay 本机加密存储，把公开来源、账号凭据、同步游标和正文重新加密写入 GoalBoard；不会改动 Relay。")}</p><p class="form-error" data-relay-import-error role="alert" hidden></p><footer><button value="cancel">${L("取消")}</button><button class="button-primary" type="button" data-relay-import-confirm${relay.available ? "" : " disabled"}>${L("确认迁移")}</button></footer></form></dialog>`;
}

export function countGoalDecisions(view: GoalBoardWebView, goalId: string): number {
  const group = buildDecisionGroups(view).find((item) => item.item?.goal.goal_id === goalId);
  if (!group) return 0;
  return group.goalTreeProposals.length + group.contractProposals.length + group.candidates.length + group.rewires.length + group.risks.length + (group.humanReview ? 1 : 0);
}

function renderDraftGaps(item: WebGoalView): string {
  const goal = item.goal;
  if (item.status === "clarification_decision_pending") {
    return `<div class="draft-gaps draft-gaps--decision"><div><strong>${L("方案已经整理好")}</strong><p>${L("这条 Goal 不是还要继续澄清，而是在等你确认整理后的结果、范围和子 Goal。采用后才会更新正式内容。")}</p></div><a href="/decisions#decision-goal-${encodeURIComponent(goal.goal_id)}">${L("查看方案并决定")}</a></div>`;
  }
  if (goal.definition_state !== "draft") return "";
  const gaps = [
    !goal.outcome.trim() ? L("要得到的结果") : "",
    !goal.why.trim() ? L("为什么做") : "",
    !goal.business_logic.trim() ? L("实际运转方式") : "",
    !goal.in_scope.length ? L("包含范围") : "",
    !goal.out_of_scope.length ? L("明确不做") : "",
    !goal.promised_outputs.length ? L("承诺输出") : "",
    !goal.acceptance_criteria.length ? L("验收条件") : "",
  ].filter(Boolean);
  if (!gaps.length) return "";
  return `<div class="draft-gaps"><div><strong>${L("这条 Goal 还没说清楚")}</strong><p>${L("还需要补全：{gaps}。保存只会更新说明；确认后才能开始。", { gaps: gaps.join(currentLocale() === "en" ? ", " : "、") })}</p></div><a href="#acceptance-${escapeHtml(goal.goal_id)}">${L("查看完成标准")}</a></div>`;
}

const DECOMPOSITION_OPTIONS = [
  ["abstract", "仍需拆分", "方向还比较抽象，需要继续找到可独立交付的结果。"],
  ["frontier_open", "已经拆出一部分", "已经有部分可以开始，但拆分工作还没有结束。"],
  ["closed_leaf", "可以独立完成", "这条 Goal 可以独立推进、独立交付，并有自己的完成标准。"],
  ["closed_compound", "由子 Goal 共同完成", "这条上层 Goal 不直接执行；完成所有子 Goal 后它会自动完成。"],
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
    ${subsectionHeading("clipboard", "修改目标说明和完成标准", "这里只修改尚未确认的草稿；保存不会让它自动开始。")}
    <form class="draft-contract-form" data-draft-form data-live-form="draft-${escapeHtml(goal.goal_id)}" data-goal-id="${escapeHtml(goal.goal_id)}">
      <div class="draft-form-row draft-form-row--title"><label><span>${L("Goal 名称")}</span><input name="title" required maxlength="120" value="${escapeHtml(goal.title)}"></label><label><span>${L("优先级")}</span><input name="priority" type="number" min="0" max="100" step="1" value="${goal.priority}"></label></div>
      <label class="draft-field"><span>${L("要得到的结果")}</span><textarea name="outcome" rows="2" placeholder="${L("完成后，用户或系统获得什么可观察结果")}">${escapeHtml(goal.outcome)}</textarea></label>
      <label class="draft-field"><span>${L("为什么现在做")}</span><textarea name="why" rows="2" placeholder="${L("说明问题和这项工作的价值")}">${escapeHtml(goal.why)}</textarea></label>
      <label class="draft-field"><span>${L("它会怎样运转")}</span><textarea name="business_logic" rows="3" placeholder="${L("用简单语言说明实际使用方式和边界")}">${escapeHtml(goal.business_logic)}</textarea></label>
      <div class="draft-list-grid">
        <label><span>${L("包含范围 ")}<small>${L("每行一项")}</small></span><textarea name="in_scope" rows="4">${listValue(goal.in_scope)}</textarea></label>
        <label><span>${L("明确不做 ")}<small>${L("每行一项")}</small></span><textarea name="out_of_scope" rows="4">${listValue(goal.out_of_scope)}</textarea></label>
        <label><span>${L("约束 ")}<small>${L("每行一项")}</small></span><textarea name="constraints" rows="4">${listValue(goal.constraints)}</textarea></label>
        <label><span>${L("需要的输入 ")}<small>${L("每行一项")}</small></span><textarea name="required_inputs" rows="4">${listValue(goal.required_inputs)}</textarea></label>
        <label><span>${L("承诺输出 ")}<small>${L("每行一项")}</small></span><textarea name="promised_outputs" rows="4">${listValue(goal.promised_outputs)}</textarea></label>
      </div>
      <fieldset class="decomposition-editor"><legend>${L("这条 Goal 现在拆到什么程度？")}</legend><div>${decompositionOptions}</div></fieldset>
      <section class="criteria-editor" aria-labelledby="criteria-editor-${escapeHtml(goal.goal_id)}">
        <header><div><h3 id="criteria-editor-${escapeHtml(goal.goal_id)}">${L("完成标准详情")}</h3><p>${L("每一条都要写清检查什么、怎样算通过，以及需要什么依据。")}</p></div><button type="button" data-add-criterion>${icon("plus")}<span>${L("添加完成标准")}</span></button></header>
        <div class="criteria-editor-list" data-criteria-list>${criteria}</div>
        <template data-criterion-template>${renderDraftCriterionRow(undefined, 1)}</template>
      </section>
      <label class="draft-field"><span>${L("本次修改原因")}</span><textarea name="reason" rows="2" required placeholder="${L("例如：补充用户确认的范围和验收条件")}"></textarea></label>
      <p class="form-error" data-draft-error role="alert" hidden></p>
      <footer><span>${L("保存只会更新这条草稿。之前等待确认的版本会作废，需要重新确认。")}</span><button class="button-primary" type="submit">${L("保存草稿修改")}</button></footer>
    </form>
    <div class="draft-auxiliary">
      <a class="draft-policy-link" href="#goal-factor-panel-risks-${escapeHtml(goal.goal_id)}">${icon("risk")}<span><strong>${L("登记风险")}</strong><small>${L("记录什么情况会影响推进或完成，以及准备怎样处理。")}</small></span>${icon("arrow")}</a>
      <a class="draft-policy-link" href="#goal-factor-panel-impacts-${escapeHtml(goal.goal_id)}">${icon("impact")}<span><strong>${L("记录影响范围")}</strong><small>${L("说明这项工作会读写哪些区域，以及影响现在是否仍然存在。")}</small></span>${icon("arrow")}</a>
      <a class="draft-policy-link" href="#goal-factor-panel-rules-${escapeHtml(goal.goal_id)}">${icon("settings")}<span><strong>${L("设置执行和检查规则")}</strong><small>${L("设置谁可以推进、需要哪些检查，以及最长可以领取多久。")}</small></span>${icon("arrow")}</a>
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

interface FocusSectionCardOptions {
  key: string;
  iconName: GoalBoardIcon;
  title: string;
  description: string;
  body: string;
  active?: boolean;
  count?: number | null;
  cardClass?: string;
  cardId?: string;
  cardAttributes?: string;
  bodyClass?: string;
  triggerAttributes?: string;
  bodyAttributes?: string;
}

function renderFocusSectionCard(options: FocusSectionCardOptions): string {
  const active = options.active === true;
  const cardId = options.cardId ? ` id="${escapeHtml(options.cardId)}"` : "";
  const cardClass = options.cardClass ? ` ${options.cardClass}` : "";
  const count = options.count == null ? "" : `<small class="focus-section-card-count">${options.count}</small>`;
  return `<article${cardId} class="focus-section-card${cardClass}${active ? " is-active" : ""}" data-focus-section-card="${escapeHtml(options.key)}" ${options.cardAttributes ?? ""}>
    <button class="focus-section-card-trigger" type="button" aria-expanded="${active ? "true" : "false"}" data-focus-section-trigger="${escapeHtml(options.key)}" ${options.triggerAttributes ?? ""}>
      <span class="focus-section-card-icon">${icon(options.iconName)}</span>
      <span class="focus-section-card-copy"><strong>${escapeHtml(options.title)}</strong><small>${escapeHtml(options.description)}</small></span>
      ${count}<span class="focus-section-card-caret">${icon("chevron-right")}</span>
    </button>
  </article>`;
}

function renderFocusSectionBody(options: FocusSectionCardOptions): string {
  const active = options.active === true;
  const bodyClass = `${options.cardClass ? ` ${options.cardClass}` : ""}${options.bodyClass ? ` ${options.bodyClass}` : ""}`;
  return `<div class="focus-section-card-reveal${bodyClass}${active ? " is-active" : ""}" data-focus-section-body="${escapeHtml(options.key)}" aria-hidden="${active ? "false" : "true"}"${active ? "" : " inert"} ${options.bodyAttributes ?? ""}>
    <div class="focus-section-card-content">${options.body}</div>
  </div>`;
}

function renderFocusSectionDeck(cards: FocusSectionCardOptions[], label: string, className = "", attributes = ""): string {
  return `<section class="focus-section-deck${className ? ` ${className}` : ""}" aria-label="${escapeHtml(label)}" data-focus-section-deck>
    <div class="focus-section-card-row" data-focus-section-card-row ${attributes}>${cards.map(renderFocusSectionCard).join("")}</div>
    <div class="focus-section-stage" data-focus-section-stage>${cards.map(renderFocusSectionBody).join("")}</div>
  </section>`;
}

function renderGoalPrimaryAction(item: WebGoalView, view: GoalBoardWebView): string {
  const goalId = item.goal.goal_id;
  const action = item.action_projection.primary_action;
  const decisions = countGoalDecisions(view, goalId);
  if (!action && item.display_status === "completed" && !item.goal.archived_at) {
    return `<button class="goal-primary-action" type="button" data-goal-archive="true" data-goal-id="${escapeHtml(goalId)}" aria-label="${L("归档这条已完成的 Goal")}" title="${L("归档这条已完成的 Goal")}">${icon("archive")}<span>${L("归档 Goal")}</span></button>`;
  }
  if (!action) return "";
  if (action.actor === "user") {
    const href = decisions > 0
      ? `/decisions#decision-goal-${encodeURIComponent(goalId)}`
      : `#acceptance-${encodeURIComponent(goalId)}`;
    return `<a class="goal-primary-action" href="${href}" aria-label="${escapeHtml(item.main_action_label)}" title="${escapeHtml(item.main_action_label)}">${icon("user")}<span>${escapeHtml(item.main_action_label)}</span></a>`;
  }
  if (action.status === "blocked" || action.kind === "wait") {
    return `<a class="goal-primary-action" href="#progress-${encodeURIComponent(goalId)}" aria-label="${escapeHtml(item.main_action_label)}" title="${escapeHtml(item.main_action_label)}">${icon(action.kind === "wait" ? "waiting" : "blocked")}<span>${escapeHtml(item.main_action_label)}</span></a>`;
  }
  if (action.kind === "clarify") {
    return `<button class="goal-primary-action" type="button" data-open-goal-edit aria-label="${escapeHtml(item.main_action_label)}" title="${escapeHtml(item.main_action_label)}">${icon("clipboard")}<span>${escapeHtml(item.main_action_label)}</span></button>`;
  }
  return `<button class="goal-primary-action" type="button" data-open-goal-tui aria-label="${escapeHtml(item.main_action_label)}" title="${escapeHtml(item.main_action_label)}">${icon("terminal")}<span>${escapeHtml(item.main_action_label)}</span></button>`;
}

function renderGoalNow(item: WebGoalView, view: GoalBoardWebView): string {
  const action = item.action_projection.primary_action;
  const blockers = action?.reasons.filter((reason) => reason.severity === "blocker") ?? [];
  const guidance = action?.actor === "user"
    ? L("完成这一个决定后，页面会直接显示新的下一步。")
    : action?.status === "blocked" || action?.kind === "wait"
      ? L("满足这里列出的恢复条件后，状态会自动重新计算。")
      : L("从主按钮继续；已有 Run、Evidence 和 Review 都会保留。")
  return `<section class="goal-now" data-goal-section="now" aria-labelledby="goal-now-${escapeHtml(item.goal.goal_id)}">
    <header><h2 id="goal-now-${escapeHtml(item.goal.goal_id)}">${L("下一步")}</h2></header>
    <div class="goal-now-body"><div><strong>${escapeHtml(item.main_action_label)}</strong><p>${escapeHtml(item.action_summary)}</p><small><b>${L("怎么做：")}</b>${escapeHtml(guidance)}</small></div>${renderGoalPrimaryAction(item, view)}</div>
    ${blockers.length
      ? `<div class="goal-now-blockers"><strong>${L("当前阻塞")}</strong><ul>${blockers.map((reason) => `<li>${escapeHtml(reason.message)}${reason.remediation ? `<small>${L("可以这样处理：")}${escapeHtml(reason.remediation)}</small>` : ""}</li>`).join("")}</ul></div>`
      : ""}
  </section>`;
}

function renderAcceptanceSummary(item: WebGoalView): string {
  if (!item.goal.acceptance_criteria.length) {
    return `<p class="empty-row empty-row--warning">${L("还没有写清怎样才算完成。先补上可判断的完成标准，才能开始工作。")}</p>`;
  }
  const passedCriteria = new Set(displayedPassedCriterionIds(item));
  return `<ul class="check-list check-list--human">${item.goal.acceptance_criteria.map((criterion) => {
    const passed = passedCriteria.has(criterion.criterion_id);
    return `<li><span class="check-box${passed ? " is-checked" : ""}">${passed ? icon("check") : ""}</span><span><strong>${escapeHtml(criterion.statement)}</strong><small>${L("达到下面的结果就算通过：")}${escapeHtml(criterion.pass_condition)}</small></span></li>`;
  }).join("")}</ul>`;
}

function renderGoalFocusOverview(item: WebGoalView, view: GoalBoardWebView): string {
  const criteria = item.goal.acceptance_criteria;
  const preview = criteria.slice(0, 5);
  const passedCriteria = new Set(displayedPassedCriterionIds(item));
  const passed = passedCriteria.size;
  const remaining = Math.max(0, criteria.length - preview.length);
  const owner = workbenchActorLabel(item.active_claim_actor ?? item.goal.accepted_by);
  const dependencies = activeOutgoingDependsOn(item).length;
  const contextRows = [
    [L("负责人"), owner],
    [L("工作范围"), item.goal.in_scope.length ? L("{count} 项", { count: item.goal.in_scope.length }) : L("未记录")],
    [L("前置依赖"), dependencies ? L("{count} 项", { count: dependencies }) : L("无")],
    [L("完成依据"), L("{count} 条", { count: item.evidence.length })],
    [L("最近更新"), formatDate(item.goal.updated_at)],
  ];
  return `${renderDraftGaps(item)}
    <div class="goal-focus-layout">
      <div class="goal-focus-main">
        ${renderGoalNow(item, view)}
        <section class="goal-focus-criteria" aria-labelledby="goal-focus-criteria-${escapeHtml(item.goal.goal_id)}">
          <header><div><h2 id="goal-focus-criteria-${escapeHtml(item.goal.goal_id)}">${L("完成要求")}</h2><p>${criteria.length ? L("这些条件决定这条 Goal 是否真的完成。") : L("还没有可以判断完成的条件。")}</p></div><strong>${passed}/${criteria.length}</strong></header>
          ${preview.length
            ? `<ul>${preview.map((criterion) => {
                const isPassed = passedCriteria.has(criterion.criterion_id);
                return `<li><span class="check-box${isPassed ? " is-checked" : ""}">${isPassed ? icon("check") : ""}</span><span><strong>${escapeHtml(criterion.statement)}</strong>${criterion.pass_condition !== criterion.statement ? `<small>${escapeHtml(criterion.pass_condition)}</small>` : ""}</span></li>`;
              }).join("")}</ul>`
            : `<p class="empty-row empty-row--warning">${L("补全完成标准后，执行和复核才有共同依据。")}</p>`}
          <a href="#acceptance-${escapeHtml(item.goal.goal_id)}">${remaining ? L("查看全部 {count} 条要求", { count: criteria.length }) : L("查看完整要求与边界")}${icon("arrow")}</a>
        </section>
      </div>
      <aside class="goal-focus-aside" aria-label="${L("上下文")}">
        <section class="goal-focus-context" aria-labelledby="goal-focus-context-${escapeHtml(item.goal.goal_id)}">
          <header><h2 id="goal-focus-context-${escapeHtml(item.goal.goal_id)}">${L("上下文")}</h2><p>${L("这条 Goal 当前最需要记住的事实。")}</p></header>
          <dl>${contextRows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>
        </section>
        ${renderCompanionRuntime(item)}
      </aside>
    </div>`;
}

function renderCompanionRuntime(item: WebGoalView): string {
  const claim = item.active_claim;
  const lease = item.active_claim_lease;
  const run = [...item.runs].reverse().find((candidate) => candidate.state === "started" || candidate.state === "blocked") ?? item.runs.at(-1);
  const total = item.goal.acceptance_criteria.length;
  const passed = displayedPassedCriterionIds(item).length;
  const progress = total ? Math.round((passed / total) * 100) : 0;
  const runtime = claim?.actor_id ?? run?.actor_id ?? L("执行会话");
  const state = claim
    ? run?.state === "blocked" ? L("执行受阻") : L("正在推进")
    : run ? L("最近有进展") : L("尚未绑定");
  const leaseNotice = lease
    ? `<p class="companion-runtime-lease${lease.renew_recommended ? " is-warning" : ""}">${icon("clock")}<span>${L("租约还剩 {count} 分钟", { count: Math.max(1, Math.ceil(lease.remaining_seconds / 60)) })} · ${L("到期前续租可保持当前 Claim 和 Run")}</span></p>`
    : "";
  return `<section class="companion-runtime" data-companion-runtime aria-labelledby="companion-runtime-${escapeHtml(item.goal.goal_id)}">
    <header><div><small>Runtime</small><h2 id="companion-runtime-${escapeHtml(item.goal.goal_id)}">${escapeHtml(runtime)}</h2></div><span class="companion-runtime-state${claim ? " is-active" : ""}"><i aria-hidden="true"></i>${escapeHtml(state)}</span></header>
    <p>${escapeHtml(plainRunState(run))}</p>
    ${leaseNotice}
    <div class="companion-runtime-progress" aria-label="${L("完成标准进度 {passed}/{total}", { passed, total })}"><i><b style="--companion-progress:${progress}%"></b></i><span>${passed}/${total}</span></div>
    <dl><div><dt>${L("完成依据")}</dt><dd>${L("{count} 条", { count: item.evidence.length })}</dd></div><div><dt>${L("执行记录")}</dt><dd>${escapeHtml(run?.state ?? L("未开始"))}</dd></div></dl>
    <button type="button" data-companion-runtime-open>${L("在 Runtime 查看会话")}${icon("chevron-right")}</button>
  </section>`;
}

function workbenchActorLabel(actor: string | null | undefined): string {
  if (!actor) return L("未指定");
  const confirmedPrefix = "user-confirmed-via:";
  if (!actor.startsWith(confirmedPrefix)) return actor;
  const runtime = actor.slice(confirmedPrefix.length).trim();
  const runtimeLabel = runtime.toLowerCase() === "codex"
    ? "Codex"
    : runtime.replaceAll("-", " ").replace(/^./, (value) => value.toUpperCase());
  return runtimeLabel ? `${L("用户确认")} · ${runtimeLabel}` : L("用户确认");
}

function renderCompletionBoundaries(item: WebGoalView): string {
  const visible = [
    [L("这次会做"), item.goal.in_scope, L("还没有写清这次会做什么。")],
    [L("这次不做"), item.goal.out_of_scope, L("还没有写清这次不做什么。")],
    [L("完成后会交付"), item.goal.promised_outputs, L("还没有写清完成后会交付什么。")],
  ] as const;
  const supporting = [
    [L("开始前需要"), item.goal.required_inputs, L("没有额外输入要求。")],
    [L("必须遵守"), item.goal.constraints, L("没有额外约束。")],
  ] as const;
  return `<div class="completion-boundaries">${visible.map(([title, values, empty]) => `<section><h3>${escapeHtml(title)}</h3>${renderList(values, empty)}</section>`).join("")}</div>
    <details class="supporting-boundaries"><summary>${L("查看开始前需要的内容和必须遵守的限制")}${icon("chevron-down")}</summary><div>${supporting.map(([title, values, empty]) => `<section><h3>${escapeHtml(title)}</h3>${renderList(values, empty)}</section>`).join("")}</div></details>`;
}

function renderChildProgress(item: WebGoalView, view: GoalBoardWebView): string {
  const children = sortGoals(partOfChildViews(item.goal.goal_id, view));
  if (!children.length) return "";
  const done = children.filter(goalWorkSatisfied).length;
  const completion = explainParentCompletion(item.goal, done, children.length);
  return `<div class="child-progress child-progress--${completion.tone}"><header><div><h3>${L("父 Goal 如何完成")}</h3><p class="child-progress-rule"><strong>${escapeHtml(completion.label)}</strong><span>${escapeHtml(completion.meaning)}</span></p></div><strong>${done}/${children.length}</strong></header><ul>${children.map((child) => {
    const explanation = explainWorkState(child.status);
    return `<li><a href="/goals/${encodeURIComponent(child.goal.goal_id)}"><span><strong>${escapeHtml(child.goal.title)}</strong><small>${escapeHtml(explanation.nextAction)}</small></span><em>${escapeHtml(explanation.label)}</em>${icon("chevron-right")}</a></li>`;
  }).join("")}</ul></div>`;
}

function renderDependencySummary(item: WebGoalView, view: GoalBoardWebView): string {
  const dependencies = activeOutgoingDependsOn(item).map((relation) => ({
    relation,
    target: findGoalView(view, relation.to_goal_id),
  }));
  if (!dependencies.length) return `<p class="clear-row">${icon("check")}${L("开始前不需要等待其他 Goal。")}</p>`;
  return `<div class="dependency-summary"><h3>${L("开始前要先完成")}</h3><ul>${dependencies.map(({ relation, target }) => {
    const done = target ? goalWorkSatisfied(target) : false;
    return `<li><a href="/goals/${encodeURIComponent(relation.to_goal_id)}"><span class="check-box${done ? " is-checked" : ""}">${done ? icon("check") : ""}</span><span><strong>${escapeHtml(target?.goal.title ?? relation.to_goal_id)}</strong><small>${escapeHtml(done ? L("已经完成，不再挡住这条 Goal。") : relation.reason)}</small></span>${icon("chevron-right")}</a></li>`;
  }).join("")}</ul></div>`;
}

function plainRunState(run: RunRecord | undefined): string {
  if (!run) return L("还没有开始推进。")
  if (run.state === "started") return L("最近一次推进正在进行。")
  if (run.state === "blocked") return L("最近一次推进被挡住了。")
  if (run.state === "completed") return L("最近一次推进已经结束并提交了结果。")
  if (run.state === "failed") return L("最近一次推进失败了，需要查看原因后再试。")
  return L("最近一次推进已经停止。")
}

function renderProgressOverview(item: WebGoalView): string {
  const latestRun = item.runs.at(-1);
  const latestRunIsCurrent = latestRun != null &&
    item.active_claim?.claim_id === latestRun.claim_id &&
    (latestRun.state === "started" || latestRun.state === "blocked");
  const latestBlocker = latestRun?.block_reason
    ? latestRunIsCurrent
      ? `<small>${L("当前阻塞：{reason}", { reason: latestRun.block_reason })}</small>`
      : `<small>${L("当时记录：{reason}。这不是当前阻塞；当前状态以“当前阻塞”页为准。", { reason: latestRun.block_reason })}</small>`
    : "";
  const activeRisks = item.risks.filter((risk) => risk.state === "open" || risk.state === "triggered");
  const pendingReviews = item.review_obligations.filter((review) => review.state === "pending").length;
  const independentReviews = item.resolved_policy.cross_reviewers + item.resolved_policy.adversarial_reviewers;
  const stateBody = `<dl class="progress-facts">
      <div><dt>${L("谁在推进")}</dt><dd>${escapeHtml(item.active_claim_actor ? L("{name} 正在推进", { name: item.active_claim_actor }) : L("现在还没有人或工具在推进"))}</dd></div>
      <div><dt>${L("最近进展")}</dt><dd>${escapeHtml(plainRunState(latestRun))}${latestBlocker}</dd></div>
      <div><dt>${L("完成依据")}</dt><dd>${L("已有 {evidence} 条依据，{passed}/{total} 条完成标准通过", { evidence: item.evidence.length, passed: displayedPassedCriterionIds(item).length, total: item.goal.acceptance_criteria.length })}</dd></div>
      <div><dt>${L("还要检查")}</dt><dd>${pendingReviews ? L("还有 {count} 项检查没有完成", { count: pendingReviews }) : L("当前没有未完成的检查")}</dd></div>
    </dl>`;
  const blockerBody = `<div class="progress-blockers"><h3>${L("当前有什么会挡住它")}</h3>${renderReasons(item)}</div>`;
  const riskBody = `<div class="risk-summary"><header><div><h3>${L("需要留意的风险")}</h3><p>${L("这里只显示仍可能影响推进或完成的风险。")}</p></div><strong>${activeRisks.length}</strong></header>${activeRisks.length ? `<ul>${activeRisks.map((risk) => `<li><a href="#risk-${encodeURIComponent(risk.risk_id)}"><span><strong>${escapeHtml(risk.description)}</strong><small>${escapeHtml(riskStateEffect(risk.blocking_mode, risk.state))}</small></span>${icon("chevron-right")}</a></li>`).join("")}</ul>` : `<p class="clear-row">${icon("check")}${L("当前没有需要处理的开放风险。")}</p>`}</div>`;
  const ruleBody = `<div class="rule-summary"><h3>${L("完成前还需要哪些检查")}</h3><ul><li>${item.resolved_policy.self_verification ? L("推进者需要先检查自己的结果。") : L("不要求推进者额外自检。")}</li><li>${independentReviews ? L("还需要 {count} 次独立检查。", { count: independentReviews }) : L("不要求额外的独立检查。")}</li><li>${item.resolved_policy.human_approval ? L("最后需要你确认结果。") : L("不需要你的最终确认。")}</li></ul></div>`;
  return renderFocusSectionDeck([
    { key: "state", iconName: "activity", title: L("推进状态"), description: L("负责人、最近进展、完成依据和待检查项"), body: stateBody, active: true },
    { key: "blockers", iconName: "blocked", title: L("当前阻塞"), description: L("仍会挡住推进或完成的事实"), body: blockerBody },
    { key: "risks", iconName: "risk", title: L("开放风险"), description: L("仍可能改变推进结果的风险"), body: riskBody, count: activeRisks.length },
    { key: "checks", iconName: "check", title: L("完成检查"), description: L("完成前仍需通过的检查规则"), body: ruleBody },
  ], L("进展与阻塞"), "focus-section-deck--progress progress-overview");
}

function renderQuickRiskForm(item: WebGoalView, view: GoalBoardWebView): string {
  if (item.goal.archived_at || item.goal.trashed_at) return "";
  return `<form class="risk-form quick-record-form" data-risk-create-form data-live-form="risk-quick-${escapeHtml(item.goal.goal_id)}" data-goal-id="${escapeHtml(item.goal.goal_id)}" novalidate>
    ${renderRiskFactsForm(null, item.goal.goal_id, view)}
    <label class="risk-form-wide"><span>${L("为什么现在记录")}</span><textarea name="reason" rows="2" required placeholder="${L("说明这项风险为什么需要现在进入 Goal 记录")}"></textarea></label>
    <p class="form-error risk-form-wide" data-risk-error role="alert" hidden></p>
    <footer class="risk-form-wide"><span>${L("保存后会回到当前 Goal，并保留在完整记录中。")}</span><button class="button-primary" type="submit">${L("记录风险")}</button></footer>
  </form>`;
}

function renderQuickImpactForm(item: WebGoalView): string {
  if (item.goal.archived_at || item.goal.trashed_at) return "";
  return `<form class="impact-form quick-record-form" data-impact-create-form data-live-form="impact-quick-${escapeHtml(item.goal.goal_id)}" data-goal-id="${escapeHtml(item.goal.goal_id)}" novalidate>
    ${renderImpactFactsForm(null, item.goal.goal_id)}
    <p class="form-error impact-form-wide" data-impact-error role="alert" hidden></p>
    <footer class="impact-form-wide"><span>${L("保存后会参与并行工作冲突判断。")}</span><button class="button-primary" type="submit">${L("记录影响范围")}</button></footer>
  </form>`;
}

function renderQuickRecordDialog(item: WebGoalView, view: GoalBoardWebView): string {
  const goalId = escapeHtml(item.goal.goal_id);
  const choices = [
    ["evidence", "evidence", L("完成依据"), L("记录能证明完成标准是否达到的事实")],
    ["risk", "risk", L("风险"), L("记录可能影响推进或完成的情况")],
    ["impact", "impact", L("影响范围"), L("记录会读取、修改或决定的区域")],
    ["relation", "link", L("Goal 关系"), L("记录层级、依赖或其他 Goal 关联")],
  ] as const;
  return `<dialog class="create-dialog quick-record-dialog" data-quick-record-dialog data-goal-id="${goalId}" aria-labelledby="quick-record-title-${goalId}">
    <div class="dialog-shell">
      <header><div><span class="dialog-icon">${icon("plus")}</span><div><h2 id="quick-record-title-${goalId}" data-quick-record-title>${L("快速记录")}</h2><p>${L("所有内容都会绑定到当前 Goal：{name}", { name: item.goal.title })}</p></div></div><button class="icon-button" type="button" data-close-quick-record aria-label="${L("关闭")}">${icon("x")}</button></header>
      <div class="dialog-body quick-record-body">
        <div class="quick-record-choices" data-quick-record-choices>
          <p>${L("你要补充哪类事实？")}</p>
          <div>${choices.map(([key, iconName, title, description]) => `<button type="button" data-quick-record-type="${key}">${icon(iconName)}<span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small></span>${icon("chevron-right")}</button>`).join("")}</div>
        </div>
        <section class="quick-record-panel" data-quick-record-panel="evidence" hidden><button class="quick-record-back" type="button" data-quick-record-back>${icon("chevron-right")}${L("换一种记录")}</button>${renderEvidenceForm(item, "quick")}</section>
        <section class="quick-record-panel" data-quick-record-panel="risk" hidden><button class="quick-record-back" type="button" data-quick-record-back>${icon("chevron-right")}${L("换一种记录")}</button>${renderQuickRiskForm(item, view)}</section>
        <section class="quick-record-panel" data-quick-record-panel="impact" hidden><button class="quick-record-back" type="button" data-quick-record-back>${icon("chevron-right")}${L("换一种记录")}</button>${renderQuickImpactForm(item)}</section>
        <section class="quick-record-panel" data-quick-record-panel="relation" hidden><button class="quick-record-back" type="button" data-quick-record-back>${icon("chevron-right")}${L("换一种记录")}</button>${renderRelationForm(item, view, "quick")}</section>
      </div>
    </div>
  </dialog>`;
}

function renderGoalFactors(item: WebGoalView, view: GoalBoardWebView): string {
  const goalId = escapeHtml(item.goal.goal_id);
  const activeRisks = item.risks.filter((risk) => risk.state === "open" || risk.state === "triggered").length;
  const activeImpacts = item.impacts.filter((impact) => impact.state !== "inactive").length;
  return `<section class="goal-factors" data-goal-section="factors">
    <header class="goal-factors-heading"><span>${icon("link")}</span><div><h2>${L("关联与约束")}</h2><p>${L("查看会影响这条 Goal 的关系、风险、范围和完成规则；需要时再修改。")}</p></div></header>
    ${renderFocusSectionDeck([
      {
        key: "relations", iconName: "link", title: L("Goal 关系"), description: L("归属、依赖和对其他 Goal 的影响"), count: item.relations.filter((relation) => relation.state !== "inactive").length, active: true,
        triggerAttributes: `id="goal-factor-tab-relations-${goalId}" role="tab" aria-selected="true" aria-controls="goal-factor-panel-relations-${goalId}" tabindex="0" data-goal-factor-tab="relations"`,
        bodyClass: "goal-factor-panel", bodyAttributes: `id="goal-factor-panel-relations-${goalId}" role="tabpanel" aria-labelledby="goal-factor-tab-relations-${goalId}" data-goal-factor-panel="relations"`,
        body: `<header><h3>${L("Goal 关系")}</h3><p>${L("说明这条 Goal 属于什么、依赖什么，以及会影响哪些其他 Goal。")}</p></header>${renderRelations(item, view)}`,
      },
      {
        key: "risks", iconName: "risk", title: L("风险"), description: L("仍可能改变推进或完成结果的情况"), count: activeRisks,
        triggerAttributes: `id="goal-factor-tab-risks-${goalId}" role="tab" aria-selected="false" aria-controls="goal-factor-panel-risks-${goalId}" tabindex="-1" data-goal-factor-tab="risks"`,
        bodyClass: "goal-factor-panel", bodyAttributes: `id="goal-factor-panel-risks-${goalId}" role="tabpanel" aria-labelledby="goal-factor-tab-risks-${goalId}" data-goal-factor-panel="risks"`,
        body: `<header><h3>${L("风险")} <span>${activeRisks}</span></h3><p>${L("只记录确实需要观察或处理、并可能改变推进结果的情况。")}</p></header>${renderRiskWorkbench(item, view, true, false)}`,
      },
      {
        key: "impacts", iconName: "impact", title: L("影响范围"), description: L("并行工作之间的读取、修改和决定范围"), count: activeImpacts,
        triggerAttributes: `id="goal-factor-tab-impacts-${goalId}" role="tab" aria-selected="false" aria-controls="goal-factor-panel-impacts-${goalId}" tabindex="-1" data-goal-factor-tab="impacts"`,
        bodyClass: "goal-factor-panel", bodyAttributes: `id="goal-factor-panel-impacts-${goalId}" role="tabpanel" aria-labelledby="goal-factor-tab-impacts-${goalId}" data-goal-factor-panel="impacts"`,
        body: `<header><h3>${L("影响范围")} <span>${activeImpacts}</span></h3><p>${L("帮助多人或多个 Goal 判断哪些工作能并行，哪些会互相影响。")}</p></header>${renderImpactWorkbench(item, true, false)}`,
      },
      {
        key: "rules", iconName: "shield", title: L("工作规则"), description: L("执行、检查和完成前必须遵守的规则"),
        triggerAttributes: `id="goal-factor-tab-rules-${goalId}" role="tab" aria-selected="false" aria-controls="goal-factor-panel-rules-${goalId}" tabindex="-1" data-goal-factor-tab="rules"`,
        bodyClass: "goal-factor-panel", bodyAttributes: `id="goal-factor-panel-rules-${goalId}" role="tabpanel" aria-labelledby="goal-factor-tab-rules-${goalId}" data-goal-factor-panel="rules"`,
        body: `<header><h3>${L("工作规则")}</h3><p>${L("说明执行和完成前需要哪些检查；项目默认与当前 Goal 的额外要求会合并生效。")}</p></header>${renderPolicyEditor(item)}`,
      },
    ], L("关联与约束"), "goal-factor-nav", `role="tablist"`)}
  </section>`;
}

function renderGoalTechnicalDetails(item: WebGoalView, view: GoalBoardWebView): string {
  const goal = item.goal;
  const owner = item.active_claim_actor ?? goal.accepted_by ?? L("未指定");
  const state = explainWorkState(item.work_state);
  const basics = `<dl class="technical-meta"><div><dt>Goal ID</dt><dd>${escapeHtml(goal.goal_id)}</dd></div><div><dt>${L("创建时间")}</dt><dd>${formatDate(goal.created_at)}</dd></div><div><dt>${L("更新时间")}</dt><dd>${formatDate(goal.updated_at)}</dd></div><div><dt>${L("记录中的负责人")}</dt><dd>${escapeHtml(owner)}</dd></div><div><dt>${L("优先级")}</dt><dd>${goal.priority}</dd></div><div><dt>${L("当前状态")}</dt><dd><strong>${escapeHtml(state.label)}</strong><small>${escapeHtml(state.meaning)}</small></dd></div></dl><section><h3>${L("完成标准")}</h3>${renderAcceptance(item)}</section><section><h3>${L("完整范围、资料和需求覆盖")}</h3>${renderScope(item)}</section>`;
  const execution = `<div id="execution-${escapeHtml(goal.goal_id)}"><div class="runtime-grid"><section><h3>${L("领取记录")} <span>${L("谁领取了工作")}</span></h3>${renderClaimCell(item)}</section><section><h3>${L("推进记录")} <span>${L("每次推进")}</span></h3>${renderRunCell(item)}</section><section><h3>${L("完成依据")}</h3>${renderEvidenceCell(item, false)}</section><section><h3>${L("检查记录")}</h3>${renderReviewCell(item)}</section></div></div>`;
  const history = `${renderHistory(item)}${renderFullRecords(item)}`;
  const relationships = `<section><h3>${L("Goal 关系")}</h3>${renderRelations(item, view, false)}</section><section><h3>${L("风险与影响范围")}</h3>${renderSafety(item, view, false)}</section><section><h3>${L("工作规则")}</h3>${renderPolicyEditor(item, { editGoal: false, editProject: false })}</section>`;
  return `<section class="goal-technical" data-goal-section="technical">
    <header><span>${icon("history")}</span><span><strong>${L("完整记录")}</strong><small>${L("只读查看这条 Goal 的原始事实和变更历史；修改请去对应功能区。")}</small></span></header>
    <div class="goal-technical-body">${renderFocusSectionDeck([
      { key: "basics", iconName: "clipboard", title: L("基础信息"), description: L("目标标识、负责人、时间、状态和完整工作边界"), body: basics, active: true, cardClass: "goal-record-section" },
      { key: "execution", iconName: "activity", title: L("执行与检查"), description: L("领取、推进、完成依据和检查记录"), body: execution, cardClass: "goal-record-section" },
      { key: "history", iconName: "history", title: L("变更历史"), description: L("按时间查看发生过什么、由谁修改"), body: history, cardClass: "goal-record-section" },
      { key: "rules", iconName: "link", title: L("关联与规则记录"), description: L("关系、风险、影响范围和生效规则的只读记录"), body: relationships, cardClass: "goal-record-section" },
    ], L("完整记录"), "focus-section-deck--records")}</div>
  </section>`;
}

function renderGoalCompletionPanel(item: WebGoalView, view: GoalBoardWebView): string {
  const goal = item.goal;
  const goalId = escapeHtml(goal.goal_id);
  const purposeBody = `${item.status === "clarification_decision_pending" ? "" : `<div class="goal-purpose"><section><h3>${L("完成后会得到什么")}</h3><p>${escapeHtml(goal.outcome || L("还没有写清预期结果。"))}</p></section><section><h3>${L("为什么现在做")}</h3><p>${escapeHtml(goal.why || L("还没有写清为什么要做。"))}</p></section><section><h3>${L("它会怎样运转")}</h3><p>${escapeHtml(goal.business_logic || L("还没有写清实际使用方式。"))}</p></section></div>`}
    ${goal.definition_state === "draft" ? `<details class="goal-edit-disclosure" id="goal-definition-${goalId}"><summary>${icon("settings")}<span><strong>${L("修改这条草稿")}</strong><small>${L("补全目标、范围和完成标准；保存后仍要经过确认才能开始。")}</small></span>${icon("chevron-down")}</summary>${renderDraftEditor(item)}</details>` : ""}`;
  const completionBody = `<div class="document-subsection" id="acceptance-${goalId}">${subsectionHeading("check", "完成标准", "每一条都应该能明确判断是否达到。")}${renderAcceptanceSummary(item)}</div>
    ${renderContractCoverage(item, view)}
    ${renderChildProgress(item, view)}
    <div class="document-subsection">${subsectionHeading("folder", "工作边界", "明确这次做什么、不做什么。")}${renderCompletionBoundaries(item)}</div>
    <div class="document-subsection">${subsectionHeading("link", "前置事项", "未完成的前置事项会阻止这条 Goal 开始。")}${renderDependencySummary(item, view)}</div>`;
  const contextDeck = renderFocusSectionDeck([
    { key: "purpose", iconName: "book", title: L("目标说明"), description: L("结果、原因和实际运转方式"), body: purposeBody, active: true, cardId: `purpose-${goalId}`, cardAttributes: `data-goal-section="purpose"` },
    { key: "completion", iconName: "clipboard", title: L("完成要求"), description: L("完成标准、工作边界、子 Goal 和前置事项"), body: completionBody, cardId: `completion-${goalId}`, cardAttributes: `data-goal-section="completion"` },
  ], L("上下文"), "focus-section-deck--context");
  return `<header class="focus-panel-heading">${icon("book")}<div><h2>${L("目标上下文")}</h2><p>${L("先扫一眼结构，再展开现在需要阅读或修改的部分。")}</p></div></header>${contextDeck}`;
}

function renderGoalProgressPanel(item: WebGoalView): string {
  return `<section class="focus-panel" data-goal-section="progress" id="progress-${escapeHtml(item.goal.goal_id)}">
    <header class="focus-panel-heading">${icon("workflow")}<div><h2>${L("进展与阻塞")}</h2><p>${L("执行情况、依据、检查、阻塞和风险。")}</p></div></header>
    ${renderProgressOverview(item)}
  </section>`;
}

function renderLazyGoalPanelStatus(label: string): string {
  return `<p class="empty-row goal-panel-lazy-status" data-goal-panel-status role="status">${escapeHtml(label)}</p>`;
}

function renderContractCoverage(item: WebGoalView, view: GoalBoardWebView): string {
  const goal = item.goal;
  const satisfaction = goalWorkSatisfied(item)
    ? `<p class="contract-scope-status">${icon("completed")}<strong>${L("本 Goal 按当前 Contract 已满足")}</strong><span>${L("这只表示当前 Goal 自己的承诺和完成条件已满足，不自动等于父 Goal 的完整能力已经实现。")}</span></p>`
    : "";
  const ownCoverage = goal.decomposition_state !== "closed_compound"
    ? ""
    : goal.decomposition_review?.contract_coverage == null
      ? `<p class="empty-row">${L("未记录父子 Contract 覆盖（历史数据）；现有完成状态不会因此被自动改写。")}</p>`
      : `<div class="contract-coverage-group"><h4>${L("父子 Contract 覆盖")}</h4>${[
          ...goal.decomposition_review.contract_coverage.promised_outputs.map((entry) =>
            `<article><strong>${escapeHtml(entry.parent_promised_output)}</strong><small>${escapeHtml(L(entry.status === "complete" ? "完整覆盖" : entry.status === "partial" ? "部分覆盖" : entry.status === "integration_required" ? "仍需父级集成" : "尚未覆盖"))}</small><p>${escapeHtml(entry.reason)}</p><ul>${entry.child_outputs.map((reference) => `<li><button type="button" data-select-goal="${escapeHtml(reference.goal_id)}">${escapeHtml(reference.promised_output)}</button></li>`).join("")}</ul></article>`,
          ),
          ...goal.decomposition_review.contract_coverage.acceptance_criteria.map((entry) =>
            `<article><strong>${escapeHtml(entry.parent_criterion_id)}</strong><small>${escapeHtml(L(entry.status === "complete" ? "完整覆盖" : entry.status === "partial" ? "部分覆盖" : entry.status === "integration_required" ? "仍需父级集成" : "尚未覆盖"))}</small><p>${escapeHtml(entry.reason)}</p><ul>${entry.child_criteria.map((reference) => `<li><button type="button" data-select-goal="${escapeHtml(reference.goal_id)}">${escapeHtml(reference.criterion_id)}</button></li>`).join("")}</ul></article>`,
          ),
        ].join("")}</div>`;
  const parents = view.snapshot.relations
    .filter((relation) => relation.state === "active" && relation.type === "part_of" && relation.from_goal_id === goal.goal_id)
    .map((relation) => findGoalView(view, relation.to_goal_id))
    .filter((parent): parent is WebGoalView => parent != null);
  const parentContributions = parents.length === 0
    ? ""
    : `<div class="contract-coverage-group"><h4>${L("对父 Goal 的贡献")}</h4>${parents.map((parent) => {
        const coverage = parent.goal.decomposition_review?.contract_coverage;
        if (!coverage) {
          return `<article><strong>${escapeHtml(parent.goal.title)}</strong><p>${L("这条历史父 Goal 未记录父子 Contract 覆盖；当前子 Goal 的完成不会被解释成父级完整能力。")}</p></article>`;
        }
        const outputs = coverage.promised_outputs.filter((entry) =>
          entry.child_outputs.some((reference) => reference.goal_id === goal.goal_id),
        );
        const criteria = coverage.acceptance_criteria.filter((entry) =>
          entry.child_criteria.some((reference) => reference.goal_id === goal.goal_id),
        );
        return `<article><strong><button type="button" data-select-goal="${escapeHtml(parent.goal.goal_id)}">${escapeHtml(parent.goal.title)}</button></strong><ul>${[
          ...outputs.map((entry) => `<li>${escapeHtml(entry.parent_promised_output)} · ${escapeHtml(L(entry.status === "complete" ? "完整覆盖" : "尚有缺口"))}</li>`),
          ...criteria.map((entry) => `<li>${escapeHtml(entry.parent_criterion_id)} · ${escapeHtml(L(entry.status === "complete" ? "完整覆盖" : "尚有缺口"))}</li>`),
        ].join("")}</ul></article>`;
      }).join("")}</div>`;
  if (!satisfaction && !ownCoverage && !parentContributions) return "";
  return `<div class="document-subsection contract-coverage-summary">${subsectionHeading("link", "Contract 覆盖边界", "区分当前 Goal 自己满足了什么，以及它是否覆盖父级承诺。")}${satisfaction}${ownCoverage}${parentContributions}</div>`;
}

function renderGoalDocument(item: WebGoalView, view: GoalBoardWebView, selected: boolean): string {
  const goal = item.goal;
  const owner = workbenchActorLabel(item.active_claim_actor ?? goal.accepted_by);
  const activeGoalAction =
    goal.definition_state === "accepted" && !goal.archived_at && !goal.trashed_at
      ? view.snapshot.board.active_goal_id === goal.goal_id
        ? `<span class="document-action document-action--current" role="status" title="${L("当前产品聚焦 Goal；不表示 Runtime 正在执行")}">${icon("target")}<span>${L("当前 Goal")}</span></span>`
        : `<button class="document-action document-action--quiet" type="button" data-set-active-goal data-goal-id="${escapeHtml(goal.goal_id)}" title="${L("设为 Board 当前聚焦；不会领取或启动 Runtime 执行")}">${icon("target")}<span>${L("设为当前 Goal")}</span></button>`
      : "";
  const archiveAction = goal.archived_at
    ? `<button class="document-action" type="button" data-goal-archive="false" data-goal-id="${escapeHtml(goal.goal_id)}">${icon("refresh")}<span>${L("恢复")}</span></button>`
    : "";
  const trashAction = `<button class="document-action document-action--danger" type="button" data-open-goal-trash data-goal-id="${escapeHtml(goal.goal_id)}" data-goal-title="${escapeHtml(goal.title)}">${icon("archive")}<span>${L("移入回收站")}</span></button>`;
  const moreActions = `<details class="goal-more"><summary aria-label="${L("更多操作")}">${icon("more")}</summary><div>${activeGoalAction}${archiveAction}${trashAction}</div></details>`;
  const quickRecordAction = !goal.archived_at && !goal.trashed_at
    ? `<button class="document-action document-action--quick" type="button" data-open-quick-record>${icon("plus")}<span>${L("快速记录")}</span></button>`
    : "";
  const goalModeSwitch = !goal.archived_at && !goal.trashed_at
    ? `<nav class="goal-mode-switch" role="tablist" aria-label="${L("Goal 工作模式")}"><button class="is-active" type="button" role="tab" aria-selected="true" aria-controls="goal-document-pane" data-workbench-view="focus">${icon("target")}<span>${L("聚焦")}</span></button><button type="button" role="tab" aria-selected="false" aria-controls="goal-tui-pane" data-workbench-view="runtime">${icon("terminal")}<span>Runtime</span></button></nav>`
    : "";
  const goalId = escapeHtml(goal.goal_id);
  const tabs = [
    ["overview", "target", L("当前")],
    ["completion", "clipboard", L("上下文")],
    ["progress", "activity", L("进展")],
    ["factors", "link", L("关系")],
    ["records", "history", L("记录")],
  ] as const;
  const tabNavigation = `<nav class="goal-workspace-nav" role="tablist" aria-label="${L("Goal 详情")}">${tabs.map(([key, iconName, label], index) => `<button id="goal-tab-${key}-${goalId}" type="button" role="tab" aria-selected="${index === 0 ? "true" : "false"}" aria-controls="goal-panel-${key}-${goalId}" tabindex="${index === 0 ? "0" : "-1"}" data-goal-tab="${key}">${icon(iconName)}<span>${label}</span></button>`).join("")}</nav>`;
  const goalBrief = `<div class="goal-brief-grid" aria-label="${L("目标说明")}">
    <section class="goal-brief-item goal-brief-item--outcome"><h2>${L("完成后会得到什么")}</h2><p>${escapeHtml(goal.outcome || L("还没有写清预期结果。"))}</p></section>
    <section class="goal-brief-item"><h2>${L("为什么现在做")}</h2><p>${escapeHtml(goal.why || L("还没有写清为什么要做。"))}</p></section>
    <section class="goal-brief-item"><h2>${L("它会怎样运转")}</h2><p>${escapeHtml(goal.business_logic || L("还没有写清实际使用方式。"))}</p></section>
  </div>`;
  return `<!--
THESIS: Goal 正文首先回答“做什么、为什么、怎么运转、下一步”；拒绝让大标题和卡片边距吃掉第一屏。
OWN-WORLD: 连续白色工作面使用紧凑排版、细分隔线、克制钴蓝焦点和结构化 Contract 摘要。
STORY: 先在一个视口读懂 Goal，再进入上下文、进展、关系与记录。
FIRST VIEWPORT: 状态与事实行、紧凑标题、三段 Goal Contract、详情导航、下一步和完成要求连续出现。
FORM: 既有 Goal 工作台的高密度 Operate 重排。
unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
--><article class="goal-document" data-goal-view="${escapeHtml(goal.goal_id)}"${selected ? "" : " hidden"}>
    <section class="goal-hero" aria-labelledby="goal-title-${goalId}">
      <header class="goal-header">
        <div class="goal-title-kicker"><span class="goal-title-status--wide" aria-hidden="true">${renderVisibleGoalStatus(item)}</span><div class="goal-title-facts"><span>${icon("user")}${escapeHtml(owner)}</span><span>${L("优先级")} ${goal.priority}</span><span>${L("最近更新")} ${formatDate(goal.updated_at)}</span></div></div>
        <div class="goal-title-row"><div class="goal-title-copy"><div class="goal-title-heading"><h1 id="goal-title-${goalId}">${escapeHtml(goal.title)}</h1><span class="goal-title-status--narrow">${renderVisibleGoalStatus(item)}</span></div><p class="goal-title-outcome">${escapeHtml(goal.outcome || L("还没有写清预期结果。"))}</p></div><div class="goal-title-actions">${goalModeSwitch}${quickRecordAction}${moreActions}</div></div>
      </header>
      ${goalBrief}
      ${tabNavigation}
    </section>
    <div class="goal-workspace-panels">
      <div id="goal-panel-overview-${goalId}" class="goal-workspace-panel" role="tabpanel" aria-labelledby="goal-tab-overview-${goalId}" data-goal-panel="overview">
        ${renderGoalFocusOverview(item, view)}
      </div>
      <div id="goal-panel-completion-${goalId}" class="goal-workspace-panel" role="tabpanel" aria-labelledby="goal-tab-completion-${goalId}" data-goal-panel="completion" data-loaded="false" hidden>
        ${renderLazyGoalPanelStatus(L("打开“上下文”时载入。"))}
      </div>
      <div id="goal-panel-progress-${goalId}" class="goal-workspace-panel" role="tabpanel" aria-labelledby="goal-tab-progress-${goalId}" data-goal-panel="progress" data-loaded="false" hidden>
        ${renderLazyGoalPanelStatus(L("打开“进展”时载入。"))}
      </div>
      <div id="goal-panel-factors-${goalId}" class="goal-workspace-panel" role="tabpanel" aria-labelledby="goal-tab-factors-${goalId}" data-goal-panel="factors" data-loaded="false" hidden>
        ${renderLazyGoalPanelStatus(L("打开“关系”时载入。"))}
      </div>
      <div id="goal-panel-records-${goalId}" class="goal-workspace-panel" role="tabpanel" aria-labelledby="goal-tab-records-${goalId}" data-goal-panel="records" hidden>
        <div data-goal-records-content data-loaded="false"><p class="empty-row" role="status">${L("正在载入完整记录…")}</p></div>
      </div>
    </div>
  </article>`;
}

function renderTrashGoalDocument(item: WebGoalView, selected: boolean): string {
  const goal = item.goal;
  const trashEvent = item.events.find((event) => event.type === "goal.trashed");
  const owner = goal.trashed_by ?? trashEvent?.actor_id ?? L("未记录");
  return `<article class="goal-document trash-goal-document" data-goal-view="${escapeHtml(goal.goal_id)}"${selected ? "" : " hidden"}>
    <section class="goal-hero trash-goal-hero" aria-labelledby="trash-goal-title-${escapeHtml(goal.goal_id)}">
      <header class="goal-header">
        <div class="goal-title-kicker">${renderStatus("trashed")}<dl class="trash-goal-facts"><div>${icon("archive")}<dt>${L("移入于")}</dt><dd>${formatDate(goal.trashed_at)}</dd></div><div>${icon("user")}<dt>${L("操作人")}</dt><dd>${escapeHtml(owner)}</dd></div><div>${icon("history")}<dt>${L("最近更新")}</dt><dd>${formatDate(goal.updated_at)}</dd></div></dl></div>
        <div class="goal-title-row"><div class="goal-title-copy"><h1 id="trash-goal-title-${escapeHtml(goal.goal_id)}">${escapeHtml(goal.title)}</h1><p class="goal-title-outcome">${L("这条 Goal 已从日常列表移除，但内容和历史仍然保留。")}</p></div><div class="goal-title-actions"><button class="document-action" type="button" data-open-goal-restore data-goal-id="${escapeHtml(goal.goal_id)}" data-goal-title="${escapeHtml(goal.title)}">${icon("refresh")}<span>${L("恢复")}</span></button></div></div>
      </header>
    </section>
    <div class="goal-workspace-panels trash-goal-workspace">
    <section class="trash-goal-panel trash-goal-panel--state">
      ${sectionHeading("archive", "回收站状态", "这不是永久删除；恢复后仍是同一个 Goal")}
      <div class="trash-summary"><p><strong>${L("Goal 的 Contract、Run、Evidence 与事件历史都已保留。")}</strong>${L("移入时仍生效的关联关系会临时停止；恢复时，只有两端都不在回收站的关系才会安全恢复。")}</p>${trashEvent ? `<p><strong>移入原因：</strong>${escapeHtml(trashEvent.reason)}</p>` : ""}</div>
    </section>
    <section class="trash-goal-panel">
      ${sectionHeading("book", "原始目标")}
      <div class="business-copy"><p class="outcome"><strong>${L("要得到的结果：")}</strong>${escapeHtml(goal.outcome || L("待澄清"))}</p><p><strong>${L("为什么做：")}</strong>${escapeHtml(goal.why || L("待澄清"))}</p><p><strong>${L("事情如何运转：")}</strong>${escapeHtml(goal.business_logic || L("待澄清"))}</p></div>
    </section>
    <section class="trash-goal-panel trash-goal-panel--restore">
      ${sectionHeading("refresh", "恢复到 Goal Tree", "恢复不会创建新 Goal，也不会自动启动 Runtime")}
      <div class="trash-restore-row"><p>${L("确认恢复后，这条 Goal 会回到原来的日常列表；如果有关联仍不能安全恢复，系统会保留它们为待处理事实。")}</p><button class="button-primary" type="button" data-open-goal-restore data-goal-id="${escapeHtml(goal.goal_id)}" data-goal-title="${escapeHtml(goal.title)}">${icon("refresh")}<span>${L("恢复这个 Goal")}</span></button></div>
    </section>
    </div>
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

export type LazyGoalPanel = "completion" | "progress" | "factors";

export function renderGoalPanelFragment(
  view: GoalBoardWebView,
  goalId: string,
  panel: LazyGoalPanel,
  collection: GoalDocumentCollection = "current",
): string | null {
  const items = collection === "trash"
    ? view.trashed_goals
    : collection === "archive"
      ? view.archived_goals
      : view.goals;
  const item = items.find((candidate) => candidate.goal.goal_id === goalId);
  if (!item || collection === "trash") return null;
  const html = panel === "completion"
    ? renderGoalCompletionPanel(item, view)
    : panel === "progress"
      ? renderGoalProgressPanel(item)
      : renderGoalFactors(item, view);
  return prefixLocalLinks(html, view.route_prefix);
}

export function renderGoalQuickRecordFragment(
  view: GoalBoardWebView,
  goalId: string,
  collection: GoalDocumentCollection = "current",
): string | null {
  if (collection !== "current") return null;
  const item = view.goals.find((candidate) => candidate.goal.goal_id === goalId);
  if (!item || item.goal.archived_at || item.goal.trashed_at) return null;
  return prefixLocalLinks(renderQuickRecordDialog(item, view), view.route_prefix);
}

/** Render the heavy, read-only record ledger only after its Goal tab is opened. */
export function renderGoalRecordsFragment(
  view: GoalBoardWebView,
  goalId: string,
  collection: GoalDocumentCollection = "current",
): string | null {
  if (collection === "trash") return null;
  const items = collection === "archive" ? view.archived_goals : view.goals;
  const item = items.find((candidate) => candidate.goal.goal_id === goalId);
  if (!item) return null;
  return prefixLocalLinks(renderGoalTechnicalDetails(item, view), view.route_prefix);
}

/** Render one older event page without repeating the surrounding record sections. */
export function renderGoalRecordEventsFragment(
  view: GoalBoardWebView,
  goalId: string,
  collection: GoalDocumentCollection = "current",
  offset = 0,
): string | null {
  if (collection === "trash") return null;
  const items = collection === "archive" ? view.archived_goals : view.goals;
  const item = items.find((candidate) => candidate.goal.goal_id === goalId);
  if (!item) return null;
  const events = item.events.slice().sort((left, right) => right.seq - left.seq);
  const safeOffset = Math.max(0, Math.trunc(offset));
  const page = events.slice(safeOffset, safeOffset + WEB_GOAL_EVENT_PAGE_SIZE);
  const nextOffset = safeOffset + page.length;
  return `<div data-goal-event-page data-next-offset="${nextOffset}" data-total="${events.length}" data-has-more="${nextOffset < events.length}"><ol>${renderEventLedgerItems(page)}</ol></div>`;
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
      <header><div><span class="dialog-icon">${icon("plus")}</span><div><h2 id="create-dialog-title">${L("新建目标")}</h2><p>${L("先记录你的想法，再补全目标说明并拆成可执行工作。")}</p></div></div><button class="icon-button" type="button" data-close-create aria-label="${L("关闭")}">${icon("x")}</button></header>
      <div class="dialog-body">
        <aside class="goal-lifecycle-hint">${icon("info")}<span><strong>${L("Goal 应描述一项有限、可验收、最终能完成的改变。")}</strong><small>${L("能力建立后的重复运行产生 Evidence；发现问题后再提出有限的改进 Goal，不必把原 Goal 永久留在未完成状态。")}</small></span></aside>
        <div class="field-row field-row--split"><label><span>Goal ID <small>${L("可选")}</small></span><input name="goal_id" autocomplete="off" placeholder="${L("例如 GOAL-AUTHORING")}"></label><label><span>${L("优先级")}</span><input name="priority" type="number" min="0" max="100" value="50"></label></div>
        <label><span>${L("目标名称")}</span><input name="title" required maxlength="120" placeholder="${L("一句话说明要完成什么")}"></label>
        <label><span>${L("要得到的结果 ")}<small>${L("可稍后补")}</small></span><textarea name="outcome" rows="2" placeholder="${L("完成后，用户或系统获得什么可观察结果")}"></textarea></label>
        <label><span>${L("为什么做 ")}<small>${L("可稍后补")}</small></span><textarea name="why" rows="2" placeholder="${L("这个问题为什么值得现在解决")}"></textarea></label>
        <label><span>${L("它会怎样运转 ")}<small>${L("可稍后补")}</small></span><textarea name="business_logic" rows="3" placeholder="${L("用简单语言说明实际使用方式和边界")}"></textarea></label>
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
  html { width: 100%; height: 100%; }
  body { width: 100%; height: 100dvh; min-height: 100%; margin: 0; overflow: hidden; background: var(--page); color: var(--ink); font: 14px/1.55 var(--font); }
  button, input, textarea, select { font: inherit; }
  button { color: inherit; }
  button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible, a:focus-visible { outline: 2px solid color-mix(in srgb, var(--blue), transparent 30%); outline-offset: 2px; }
  svg { width: 1em; height: 1em; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  [hidden] { display: none !important; }
  .icon-sprite { position: absolute; width: 0; height: 0; overflow: hidden; }
  .app { min-width: 0; width: 100%; height: 100dvh; min-height: 100%; overflow: hidden; display: grid; grid-template-rows: 58px minmax(0, 1fr); }
  .topbar { position: relative; min-width: 0; display: flex; align-items: center; border-bottom: 1px solid var(--line-strong); background: color-mix(in srgb, var(--rail) 82%, #fff); box-shadow: 0 1px 2px rgba(18, 28, 40, .06); z-index: 10; }
  .brand { min-width: 182px; height: 100%; padding: 0 28px; display: flex; align-items: center; gap: 11px; border-right: 1px solid var(--line); }
  .brand svg { color: var(--blue); font-size: 22px; stroke-width: 2.4; }
  .brand strong { font-size: 19px; letter-spacing: -.02em; }
  .project-context { min-width: 0; height: 100%; padding: 0 16px 0 24px; display: flex; align-items: center; gap: 8px; white-space: nowrap; color: #343a44; }
  .project-context small { color: var(--muted); }
  .project-context a { color: var(--blue-dark); font-size: 12px; font-weight: 650; text-decoration: none; }
  .project-context a:hover { text-decoration: underline; }
  .navigator-project { min-width: 0; padding: 10px 10px 9px; border-bottom: 1px solid var(--line-strong); background: color-mix(in srgb, var(--paper) 62%, var(--rail)); display: grid; gap: 7px; }
  .navigator-project-primary { min-width: 0; display: flex; align-items: center; gap: 7px; }
  .navigator-project-primary > strong { min-width: 0; flex: 1; overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
  .top-spacer { min-width: 0; flex: 1; }
  .top-action { height: 34px; margin-right: 10px; padding: 0 12px; border: 0; border-radius: 5px; background: transparent; color: #3b434e; display: inline-flex; align-items: center; gap: 8px; font-weight: 650; cursor: pointer; white-space: nowrap; }
  a.top-action { color: #3b434e; text-decoration: none; }
  .top-action:hover, a.top-action:hover { color: var(--blue-dark); background: var(--blue-soft); }
  .top-action.is-current, a.top-action.is-current { color: var(--blue-dark); background: var(--blue-soft); }
  .top-action svg { font-size: 17px; }
  .workspace { position: relative; min-width: 0; min-height: 0; width: 100%; height: 100%; overflow: hidden; display: grid; grid-template-columns: var(--tree-width, clamp(280px, 22vw, 360px)) 5px minmax(0, 1fr); }
  .tree-pane { position: relative; min-width: 0; min-height: 0; overflow: hidden; display: grid; grid-template-rows: auto auto minmax(0, 1fr) 48px; background: color-mix(in srgb, var(--rail) 36%, #fff); border-right: 1px solid var(--line-strong); container-type: inline-size; }
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
  .goal-status--clarifying, .goal-status--executing, .goal-status--reviewing, .goal-status--revalidating, .goal-status--in_progress { color: var(--blue); }
  .goal-status--clarification_pending, .goal-status--clarification_decision_pending, .goal-status--compound_closure_pending, .goal-status--execution_pending, .goal-status--completion_pending, .goal-status--review_pending, .goal-status--waiting_for_human, .goal-status--revalidation_pending, .goal-status--continue, .goal-status--waiting_user { color: #1768bf; }
  .goal-status--clarification_blocked, .goal-status--execution_blocked, .goal-status--completion_blocked, .goal-status--review_blocked, .goal-status--revalidation_blocked, .goal-status--invalidated, .goal-status--blocked { color: var(--red); }
  .goal-status--replaced { color: var(--muted); }
  .goal-status--waiting_children, .goal-status--waiting { color: #5c6570; }
  .goal-status--satisfied, .goal-status--completed { color: var(--green); }
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
  .tui-pane { position: relative; min-width: 0; min-height: 0; overflow: hidden; display: grid; grid-template-rows: 56px 40px minmax(0, 1fr); background: color-mix(in srgb, var(--rail) 70%, #fff); container-type: inline-size; }
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
  .tui-tab-readonly { flex: 0 0 auto; color: var(--faint); font-size: 12px; font-weight: 650; }
  .tui-add { height: 28px; flex: 0 0 auto; padding: 0 9px; border: 0; border-radius: 4px; background: transparent; color: var(--muted); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px; font: inherit; font-size: 12px; font-weight: 650; white-space: nowrap; transition: background .16s ease, color .16s ease; }
  .tui-add:hover:not(:disabled), .tui-add[aria-expanded="true"] { color: var(--blue); background: var(--blue-soft); }
  .tui-add:disabled { color: var(--faint); cursor: not-allowed; }
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
  .tui-stage { min-width: 0; min-height: 0; overflow: hidden; padding: 10px 12px 12px; display: grid; grid-template-areas: "guard" "actions" "terminal"; grid-template-rows: auto auto minmax(0, 1fr); gap: 8px; }
  .tui-parent-guard { grid-area: guard; min-width: 0; max-height: min(42vh, 360px); overflow: auto; padding: 12px; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--amber-soft); display: grid; gap: 10px; }
  .tui-parent-guard[hidden] { display: none; }
  .tui-parent-guard-copy { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 8px; align-items: start; }
  .tui-parent-guard-copy > svg { width: 16px; height: 16px; margin-top: 2px; color: var(--amber); }
  .tui-parent-guard-copy > div { min-width: 0; display: grid; gap: 3px; }
  .tui-parent-guard-copy strong { font-size: 14px; }
  .tui-parent-guard-copy p, .tui-child-choices > p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.55; }
  .tui-child-choices { display: grid; gap: 5px; }
  .tui-child-choice { min-width: 0; padding: 8px 9px; border: 1px solid var(--line); border-radius: 5px; background: var(--paper); color: var(--ink); text-decoration: none; display: flex; align-items: center; gap: 10px; }
  .tui-child-choice:hover { border-color: var(--amber); background: var(--paper); }
  .tui-child-choice > span { min-width: 0; flex: 1; display: grid; gap: 2px; }
  .tui-child-choice strong, .tui-child-choice small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tui-child-choice strong { font-size: 12px; }
  .tui-child-choice small { color: var(--muted); font-size: 12px; }
  .tui-child-choice b { flex: 0 0 auto; color: var(--amber); font-size: 12px; display: inline-flex; align-items: center; gap: 3px; }
  .tui-child-choice b svg { width: 11px; height: 11px; }
  .tui-pane[data-tui-read-only="true"] .tui-chrome { opacity: .7; }
  .tui-chrome { grid-area: actions; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
  .tui-chrome-actions { min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .tui-chrome button { min-height: 28px; padding: 0 10px; border: 1px solid var(--line-strong); border-radius: 5px; background: #fff; color: var(--ink); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; transition: background .16s ease, border-color .16s ease, color .16s ease, transform .1s ease; }
  .tui-chrome button:hover:not(:disabled) { border-color: #b8d3f5; background: var(--blue-soft); color: var(--blue-dark); }
  .tui-chrome button:active:not(:disabled) { transform: scale(.98); }
  .tui-chrome button:disabled { color: var(--faint); cursor: default; }
  .tui-chrome .tui-advance { border-color: var(--action); color: var(--action-ink); background: var(--action); }
  .tui-chrome .tui-advance:hover:not(:disabled) { background: color-mix(in srgb, var(--action) 90%, var(--action-ink)); color: var(--action-ink); }
  .tui-status { margin: 0 0 0 auto; min-width: 8rem; flex: 1 1 12rem; color: var(--muted); font-size: 11px; font-weight: 650; display: flex; align-items: center; gap: 6px; line-height: 1.4; }
  .tui-status:empty { display: none; }
  .tui-status::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--faint); flex: 0 0 auto; }
  .tui-status[data-tone="live"]::before { background: var(--green); }
  .tui-status[data-tone="busy"]::before { background: var(--blue); animation: pulse 1s infinite; }
  .tui-status[data-tone="error"]::before { background: var(--red); }
  .tui-terminal { grid-area: terminal; position: relative; min-width: 0; min-height: 140px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--ink) 55%, var(--terminal)); border-radius: 6px; background: var(--terminal); }
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
  .tui-menu-actions button[type="submit"] { border-color: var(--action); color: var(--action-ink); background: var(--action); }
  @container (max-width: 380px) {
    .tui-add span, .tui-chrome [data-tui-copy] span { display: none; }
    .tui-add, .tui-chrome [data-tui-copy] { width: 28px; padding: 0; justify-content: center; }
  }
  .goal-document { width: min(100%, 1080px); min-height: 100%; margin: 0 auto; padding: 26px 38px 64px; container-type: inline-size; animation: document-in .24s cubic-bezier(.16, 1, .3, 1); }
  .goal-header { padding: 0 0 16px; }
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
  .document-action--quick { color: var(--blue-dark); border-color: #bcd4f2; background: var(--blue-soft); font-weight: 650; }
  .document-action--quick:hover { color: var(--blue-dark); border-color: var(--blue); background: var(--blue-soft); }
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
  .goal-workspace-nav { position: sticky; top: 0; z-index: 6; min-width: 0; margin: 0 -10px; padding: 0 10px; border-top: 1px solid var(--line-strong); border-bottom: 1px solid var(--line-strong); background: color-mix(in srgb, var(--paper) 94%, transparent); backdrop-filter: blur(10px); display: flex; align-items: stretch; overflow-x: auto; scrollbar-width: none; }
  .goal-workspace-nav::-webkit-scrollbar { display: none; }
  .goal-workspace-nav button { position: relative; min-width: 0; min-height: 46px; padding: 0 13px; border: 0; background: transparent; color: var(--muted); display: inline-flex; align-items: center; justify-content: center; gap: 7px; font-weight: 650; white-space: nowrap; cursor: pointer; }
  .goal-workspace-nav button::after { content: ""; position: absolute; left: 10px; right: 10px; bottom: -1px; height: 2px; background: transparent; }
  .goal-workspace-nav button:hover { color: var(--ink); background: color-mix(in srgb, var(--blue-soft) 42%, transparent); }
  .goal-workspace-nav button[aria-selected="true"] { color: var(--blue-dark); }
  .goal-workspace-nav button[aria-selected="true"]::after { background: var(--blue); }
  .goal-workspace-nav button svg { width: 15px; height: 15px; flex: 0 0 auto; }
  .goal-factors { padding: 20px 0 26px; }
  .goal-factors-heading { padding: 0 0 16px; border-bottom: 1px solid var(--line-strong); display: grid; grid-template-columns: 22px minmax(0, 1fr); align-items: start; gap: 9px; }
  .goal-factors-heading > span { padding-top: 2px; color: var(--blue); }
  .goal-factors-heading h2 { margin: 0; font-size: 17px; letter-spacing: -.015em; }
  .goal-factors-heading p { max-width: 72ch; margin: 2px 0 0; color: var(--muted); font-size: 12px; }
  .goal-factor-nav { margin: 14px 0 0 31px; border: 1px solid var(--line-strong); border-radius: 6px; background: #f3f5f7; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); overflow: hidden; }
  .goal-factor-nav button { min-width: 0; min-height: 43px; padding: 7px 9px; border: 0; border-right: 1px solid var(--line); background: transparent; color: var(--muted); display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; }
  .goal-factor-nav button:last-child { border-right: 0; }
  .goal-factor-nav button:hover { color: var(--ink); background: #fff; }
  .goal-factor-nav button[aria-selected="true"] { color: var(--blue-dark); background: #fff; box-shadow: 0 2px 8px rgba(28, 53, 81, .08); }
  .goal-factor-nav button svg { width: 14px; height: 14px; }
  .goal-factor-nav button small { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: #e9edf2; color: var(--muted); display: inline-grid; place-items: center; font-size: 10px; font-variant-numeric: tabular-nums; }
  .goal-factor-nav button[aria-selected="true"] small { color: var(--blue-dark); background: var(--blue-soft); }
  .goal-factor-panels { margin: 18px 0 0 31px; }
  .goal-factor-panel > header { margin-bottom: 12px; }
  .goal-factor-panel > header h3 { margin: 0; font-size: 15px; }
  .goal-factor-panel > header h3 span { color: var(--muted); font-size: 12px; font-weight: 500; }
  .goal-factor-panel > header p { max-width: 72ch; margin: 2px 0 0; color: var(--muted); font-size: 12px; }
  .factor-write-receipt { margin: 0 0 14px; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--green), var(--line) 65%); border-radius: 5px; background: var(--green-soft); display: grid; gap: 2px; }
  .factor-write-receipt strong { color: var(--green); font-size: 12px; }
  .factor-write-receipt span { color: var(--muted); font-size: 12px; line-height: 1.5; }
  .factor-write-receipt:focus-visible { outline: 2px solid var(--green); outline-offset: 2px; }
  .policy-scope-note { margin: 0; padding: 11px 12px; border: 1px solid var(--line); border-radius: 5px; background: #fbfcfd; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; }
  .policy-scope-note > svg { color: var(--blue-dark); }
  .policy-scope-note > span { min-width: 0; display: grid; }
  .policy-scope-note small { color: var(--muted); }
  .policy-scope-note a { color: var(--blue-dark); font-weight: 650; text-decoration: none; }
  .goal-workspace-panels { min-width: 0; }
  .goal-workspace-panel { min-width: 0; }
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
  .goal-now { margin: 20px 0 0; padding: 18px 20px; border: 1px solid #bcd4f2; border-radius: 6px; background: color-mix(in srgb, var(--blue-soft) 58%, #fff); scroll-margin-top: 58px; }
  .goal-now > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
  .goal-now > header h2 { margin: 0; font-size: 15px; letter-spacing: -.01em; }
  .goal-now-body { margin-top: 15px; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 18px 28px; }
  .goal-now-body > div { min-width: 0; display: grid; gap: 4px; }
  .goal-now-body > div > strong { font-size: 17px; line-height: 1.4; }
  .goal-now-body p { max-width: 68ch; margin: 0; color: #343b46; }
  .goal-now-body small { color: var(--muted); }
  .goal-now-body small b { margin-right: 4px; color: var(--ink); }
  .goal-primary-action { min-height: 40px; padding: 0 15px; border: 1px solid var(--action); border-radius: 5px; background: var(--action); color: var(--action-ink); display: inline-flex; align-items: center; justify-content: center; gap: 7px; font-weight: 700; text-decoration: none; cursor: pointer; white-space: nowrap; }
  .goal-primary-action:hover { border-color: var(--action); background: color-mix(in srgb, var(--action) 90%, var(--action-ink)); color: var(--action-ink); }
  .goal-primary-action:disabled { opacity: .6; cursor: wait; }
  .goal-now-blockers { margin-top: 14px; padding-top: 12px; border-top: 1px solid #c9dff7; display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 14px; }
  .goal-now-blockers > strong { color: var(--red); font-size: 12px; }
  .goal-now-blockers ul { margin: 0; padding-left: 18px; }
  .goal-now-blockers li + li { margin-top: 5px; }
  .goal-now-blockers small { display: block; color: var(--muted); }
  .goal-purpose { margin-left: 31px; }
  .goal-purpose > section { padding: 12px 0; border-top: 1px solid var(--line); display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 18px; }
  .goal-purpose > section:first-child { border-top: 0; }
  .goal-purpose h3, .completion-boundaries h3, .supporting-boundaries h3 { margin: 0; font-size: 13px; }
  .goal-purpose p { max-width: 72ch; margin: 0; color: #303641; white-space: pre-wrap; }
  .goal-edit-disclosure { margin: 16px 0 0 31px; border-top: 1px solid var(--line); }
  .goal-edit-disclosure > summary { padding: 13px 0; display: grid; grid-template-columns: 20px minmax(0, 1fr) 16px; align-items: center; gap: 9px; cursor: pointer; list-style: none; }
  .goal-edit-disclosure > summary::-webkit-details-marker { display: none; }
  .goal-edit-disclosure > summary > span { display: grid; }
  .goal-edit-disclosure > summary small { color: var(--muted); font-weight: 400; }
  .goal-edit-disclosure[open] > summary > svg:last-child, .supporting-boundaries[open] > summary svg { transform: rotate(180deg); }
  .goal-edit-disclosure .draft-editor-section { margin: 0 0 18px; }
  .completion-boundaries { display: grid; }
  .completion-boundaries > section { padding: 11px 0; border-top: 1px solid var(--line); display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 18px; }
  .completion-boundaries > section:first-child { border-top: 0; }
  .completion-boundaries .doc-list, .completion-boundaries .empty-row, .supporting-boundaries .doc-list, .supporting-boundaries .empty-row { margin-top: 0; }
  .supporting-boundaries { border-top: 1px solid var(--line); }
  .supporting-boundaries > summary { padding: 11px 0; color: var(--blue-dark); display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; font-weight: 650; cursor: pointer; list-style: none; }
  .supporting-boundaries > summary::-webkit-details-marker { display: none; }
  .supporting-boundaries > div > section { padding: 10px 0; display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 18px; }
  .child-progress { margin: 18px 0 0 31px; padding-top: 16px; border-top: 1px solid var(--line); }
  .child-progress > header, .risk-summary > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
  .child-progress h3, .dependency-summary h3, .progress-overview h3, .risk-summary h3, .rule-summary h3 { margin: 0; font-size: 14px; }
  .child-progress header p, .risk-summary header p { margin: 2px 0 0; color: var(--muted); font-size: 11px; }
  .child-progress-rule { max-width: 720px; display: grid; gap: 2px; }
  .child-progress-rule strong { color: var(--ink); font-size: 12px; }
  .child-progress--needs_confirmation .child-progress-rule strong { color: var(--blue-dark); }
  .child-progress--conflict .child-progress-rule strong { color: var(--red); }
  .child-progress > header > strong, .risk-summary > header > strong { color: var(--muted); font-variant-numeric: tabular-nums; }
  .child-progress ul, .dependency-summary ul, .risk-summary ul { list-style: none; margin: 9px 0 0; padding: 0; }
  .child-progress li, .dependency-summary li, .risk-summary li { border-top: 1px solid var(--line); }
  .child-progress a, .dependency-summary a, .risk-summary a { min-height: 48px; padding: 8px 2px; color: inherit; display: flex; align-items: center; gap: 10px; text-decoration: none; }
  .child-progress a:hover strong, .dependency-summary a:hover strong, .risk-summary a:hover strong { color: var(--blue-dark); }
  .child-progress a > span, .dependency-summary a > span, .risk-summary a > span { min-width: 0; flex: 1; display: grid; }
  .child-progress a small, .dependency-summary a small, .risk-summary a small { color: var(--muted); }
  .child-progress a em { color: var(--muted); font-size: 11px; font-style: normal; font-weight: 650; }
  .dependency-summary .check-box { flex: 0 0 15px; }
  .progress-overview { margin-left: 31px; display: grid; gap: 18px; }
  .progress-facts { margin: 0; display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid var(--line); }
  .progress-facts > div { min-width: 0; padding: 11px 12px 11px 0; border-bottom: 1px solid var(--line); display: grid; gap: 2px; }
  .progress-facts > div:nth-child(odd) { padding-right: 20px; border-right: 1px solid var(--line); }
  .progress-facts > div:nth-child(even) { padding-left: 20px; }
  .progress-facts dt { color: var(--muted); font-size: 11px; font-weight: 650; }
  .progress-facts dd { margin: 0; font-weight: 650; }
  .progress-facts dd small { display: block; color: var(--muted); font-weight: 400; }
  .progress-blockers, .risk-summary, .rule-summary { padding-top: 2px; }
  .rule-summary ul { margin: 8px 0 0; padding-left: 19px; }
  .rule-summary li + li { margin-top: 3px; }
  .goal-technical { padding: 20px 0 0; }
  .goal-technical > header { padding: 0 0 16px; border-bottom: 1px solid var(--line-strong); display: grid; grid-template-columns: 22px minmax(0, 1fr); align-items: center; gap: 9px; }
  .goal-technical > header > span:first-child { color: var(--blue); }
  .goal-technical > header > span:nth-child(2) { display: grid; }
  .goal-technical > header strong { font-size: 17px; letter-spacing: -.015em; }
  .goal-technical > header small { color: var(--muted); font-size: 12px; font-weight: 400; }
  .goal-technical-body { padding: 2px 0 24px 31px; }
  .goal-record-section { border-bottom: 1px solid var(--line); }
  .goal-record-section > summary { min-height: 58px; padding: 10px 2px; display: flex; align-items: center; justify-content: space-between; gap: 14px; list-style: none; cursor: pointer; }
  .goal-record-section > summary::-webkit-details-marker { display: none; }
  .goal-record-section > summary:hover { color: var(--blue-dark); }
  .goal-record-section > summary > span { min-width: 0; display: grid; gap: 1px; }
  .goal-record-section > summary strong { font-size: 14px; }
  .goal-record-section > summary small { color: var(--muted); font-size: 11px; font-weight: 400; }
  .goal-record-section > summary > svg { flex: 0 0 auto; color: var(--muted); transition: transform .16s ease; }
  .goal-record-section[open] > summary > svg { transform: rotate(180deg); }
  .goal-record-section > div { padding: 5px 0 20px; }
  .goal-record-section > div > section { padding: 15px 0 0; }
  .goal-record-section > div > section > h3 { margin: 0 0 10px; font-size: 13px; }
  .technical-meta { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; }
  .technical-meta > div { min-width: 0; display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 9px; }
  .technical-meta dt { color: var(--muted); }
  .technical-meta dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
  .technical-meta dd strong, .technical-meta dd small { display: block; }
  .technical-meta dd small { margin-top: 2px; color: var(--muted); font-size: 11px; }
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
  .document-section { padding: 20px 0; border-bottom: 1px solid var(--line); scroll-margin-top: 58px; }
  .section-heading { margin: 0 0 10px; display: flex; align-items: flex-start; gap: 9px; }
  .section-heading > span { width: 22px; height: 22px; margin-top: 1px; display: grid; place-items: center; color: var(--blue); }
  .section-heading h2 { margin: 0; font-size: 17px; letter-spacing: -.015em; }
  .section-heading p { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
  .document-subsection { margin: 16px 0 0 31px; padding-top: 16px; border-top: 1px solid var(--line); scroll-margin-top: 12px; }
  .document-subsection:first-of-type { margin-top: 6px; padding-top: 0; border-top: 0; }
  .contract-scope-status { margin: 10px 0 0; padding: 10px 12px; border-left: 2px solid var(--green); background: var(--green-soft); display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 8px; }
  .contract-scope-status > svg { grid-row: 1 / 3; margin-top: 1px; color: var(--green); }
  .contract-scope-status strong { font-size: 12px; }
  .contract-scope-status span { color: var(--muted); font-size: 11px; }
  .contract-coverage-group { margin-top: 12px; }
  .contract-coverage-group > h4 { margin: 0 0 7px; font-size: 12px; }
  .contract-coverage-group > article { padding: 9px 10px; border: 1px solid var(--line); border-radius: 5px; background: #fbfcfd; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px; }
  .contract-coverage-group > article + article { margin-top: 7px; }
  .contract-coverage-group article > small { color: var(--muted); }
  .contract-coverage-group article > p, .contract-coverage-group article > ul { grid-column: 1 / -1; }
  .contract-coverage-group article > p { margin: 0; color: var(--muted); font-size: 11px; }
  .contract-coverage-group article > ul { margin: 3px 0 0; padding-left: 18px; }
  .contract-coverage-group article button { padding: 0; border: 0; color: var(--blue-dark); background: transparent; text-align: left; cursor: pointer; }
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
  .check-box.is-checked { color: var(--action-ink); border-color: var(--action); background: var(--action); }
  .check-box svg { font-size: 12px; stroke-width: 3; }
`;

const MORE_STYLES = `
  .runtime-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--line-strong); border-radius: 5px; overflow: hidden; }
  .runtime-grid > section { min-width: 0; min-height: 174px; padding: 13px 15px; border-right: 1px solid var(--line-strong); }
  .runtime-grid > section:last-child { border-right: 0; }
  .runtime-grid h3 { margin: -13px -15px 12px; padding: 10px 15px; border-bottom: 1px solid var(--line); background: var(--rail); color: var(--ink); font-size: 14px; }
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
  .evidence-record--superseded, .evidence-record--retracted { opacity: .72; }
  .evidence-lifecycle { padding: 2px 6px; border-radius: 999px; background: var(--rail); color: var(--muted); font-size: 10px; font-weight: 650; }
  .evidence-lifecycle--effective { background: var(--green-soft); color: var(--green); }
  .evidence-locator-status { padding: 2px 6px; border-radius: 999px; color: var(--amber); background: var(--amber-soft); font-size: 10px; font-weight: 700; }
  .evidence-locator-status--verified { color: var(--green); background: var(--green-soft); }
  .evidence-locator-reason { color: var(--muted); }
  .evidence-correction { padding-top: 3px; border-top: 1px dashed var(--line); }
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
  .human-review-jump { width: min(100%, 360px); min-height: 44px; margin: 12px 0 2px; padding: 7px 10px 7px 12px; border: 1px solid var(--action); border-radius: 7px; background: var(--action); color: var(--action-ink); display: flex; align-items: center; justify-content: space-between; gap: 12px; text-align: left; cursor: pointer; }
  .human-review-jump:hover { background: color-mix(in srgb, var(--action) 90%, var(--action-ink)); }
  .human-review-jump:focus-visible { outline: 2px solid color-mix(in srgb, var(--blue), #fff 36%); outline-offset: 2px; }
  .human-review-jump span { min-width: 0; display: grid; gap: 1px; }
  .human-review-jump strong { font-size: 13px; }
  .human-review-jump small { color: color-mix(in srgb, var(--action-ink) 82%, var(--action)); font-size: 11px; font-weight: 500; }
  .human-review-jump svg { flex: 0 0 auto; }
  .human-review-form { padding: 14px 0; border-top: 1px solid var(--line); display: grid; gap: 12px; }
  .human-verdict-prefill { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 10px; padding: 12px; border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--line)); border-radius: 8px; background: color-mix(in srgb, var(--accent) 7%, var(--surface)); }
  .human-verdict-prefill > span { color: var(--accent); }
  .human-verdict-prefill strong { display: block; margin-bottom: 3px; }
  .human-verdict-prefill p { margin: 0; color: var(--muted); }
  .human-verdict-prefill dl { margin: 9px 0 0; display: grid; gap: 6px; }
  .human-verdict-prefill dl div { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 8px; }
  .human-verdict-prefill dt { color: var(--muted); }
  .human-verdict-prefill dd { margin: 0; overflow-wrap: anywhere; }
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
  .button-danger { border-color: var(--danger-action) !important; color: var(--danger-action-ink) !important; background: var(--danger-action) !important; }
  .button-danger:hover { background: color-mix(in srgb, var(--danger-action) 90%, var(--danger-action-ink)) !important; }
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
  .factor-advanced { min-width: 0; margin: 0; border: 1px solid var(--line); border-radius: 5px; background: #fbfcfd; }
  .factor-advanced > summary { min-height: 47px; padding: 8px 10px; display: flex; align-items: center; justify-content: space-between; gap: 10px; list-style: none; cursor: pointer; }
  .factor-advanced > summary::-webkit-details-marker { display: none; }
  .factor-advanced > summary:hover { background: #f4f7fa; }
  .factor-advanced > summary > span { min-width: 0; display: grid; gap: 1px; }
  .factor-advanced > summary strong { font-size: 12px; }
  .factor-advanced > summary small { color: var(--muted); font-size: 10px; font-weight: 400; }
  .factor-advanced > summary > svg { color: var(--muted); transition: transform .16s ease; }
  .factor-advanced[open] > summary > svg { transform: rotate(180deg); }
  .factor-advanced-grid { padding: 11px 10px 12px; border-top: 1px solid var(--line); display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px 14px; }
  .factor-advanced-grid > label { min-width: 0; display: grid; gap: 5px; }
  .factor-advanced-grid > label > span { color: var(--ink); font-size: 11px; font-weight: 650; }
  .policy-form-wide { grid-column: 1 / -1; }
  .factor-advanced-grid input:not([type=checkbox]), .factor-advanced-grid textarea, .factor-advanced-grid select { width: 100%; min-width: 0; padding: 8px 9px; border: 1px solid var(--line-strong); border-radius: 4px; background: #fff; resize: vertical; }
  [aria-invalid="true"] { border-color: var(--red) !important; outline: 2px solid var(--red-soft); outline-offset: 1px; }
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
  .dependency-proposal { min-width: 0; padding: 11px 13px; border-bottom: 1px solid var(--line); background: var(--paper); color: var(--ink); }
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
  .dependency-rationale div { min-width: 0; padding: 7px 0; border-top: 1px solid var(--line); }
  .dependency-rationale dt { color: var(--muted); font-size: 11px; }
  .dependency-rationale dd { margin: 1px 0 0; overflow-wrap: anywhere; }
  .dependency-evidence { min-width: 0; padding-top: 7px; border-top: 1px solid var(--line); display: grid; grid-template-columns: 64px minmax(0, 1fr); align-items: start; gap: 6px 12px; }
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
  .risk-resolution { margin: 0 14px 12px 54px; padding: 9px 10px; border-left: 2px solid var(--green); background: var(--green-soft); }
  .risk-resolution > strong { font-size: 11px; }
  .risk-resolution > p { margin: 2px 0 7px; }
  .risk-resolution dl { margin: 0; display: grid; gap: 6px; }
  .risk-resolution dl > div { display: grid; grid-template-columns: 82px minmax(0, 1fr); gap: 8px; }
  .risk-resolution dt { color: var(--muted); font-size: 10px; }
  .risk-resolution dd { margin: 0; overflow-wrap: anywhere; }
  .risk-resolution--unrecorded { border-left-color: var(--amber); background: var(--amber-soft); }
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
  .risk-resolution-fields { padding: 12px 14px; border-top: 1px solid var(--line); background: #fbfcfd; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .risk-resolution-fields[hidden] { display: none; }
  .risk-resolution-fields label { min-width: 0; display: grid; gap: 5px; }
  .risk-resolution-fields label > span { font-size: 11px; font-weight: 650; }
  .risk-resolution-fields textarea { width: 100%; min-width: 0; padding: 8px 9px; border: 1px solid var(--line-strong); border-radius: 4px; background: #fff; resize: vertical; }
  .risk-decision-link { min-height: 50px; padding: 9px 14px 9px 54px; border-top: 1px solid var(--line); color: var(--blue-dark); display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 9px; text-decoration: none; }
  .risk-decision-link:hover { background: var(--blue-soft); }
  .risk-decision-link > span { min-width: 0; display: grid; }
  .risk-decision-link small { color: var(--muted); }
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
  .policy-inheritance { min-width: 0; padding: 10px 13px; border: 1px solid var(--line); border-radius: 5px; background: var(--rail); display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 10px; }
  .policy-inheritance > span { min-width: 0; display: grid; }
  .policy-inheritance small { color: var(--muted); font-size: 9px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
  .policy-inheritance strong { overflow-wrap: anywhere; font-size: 12px; }
  .policy-inheritance > svg { color: var(--faint); }
  .policy-source { min-width: 0; border: 1px solid var(--line-strong); border-radius: 6px; overflow: hidden; background: var(--paper); }
  .policy-source--goal { border-color: color-mix(in srgb, var(--blue), var(--line-strong) 58%); }
  .policy-source > summary { min-height: 76px; padding: 13px 15px; display: flex; align-items: center; justify-content: space-between; gap: 20px; cursor: pointer; list-style: none; background: color-mix(in srgb, var(--rail) 76%, var(--paper)); }
  .policy-source--goal > summary { background: color-mix(in srgb, var(--blue-soft) 68%, var(--paper)); }
  .policy-source > summary::-webkit-details-marker { display: none; }
  .policy-source-title { min-width: 0; display: flex; align-items: flex-start; gap: 11px; }
  .policy-scope-index { flex: 0 0 auto; width: 29px; height: 29px; border: 1px solid var(--line-strong); border-radius: 4px; display: grid; place-items: center; color: var(--muted); font-size: 10px; font-weight: 750; }
  .policy-source--goal .policy-scope-index { color: var(--blue-dark); border-color: color-mix(in srgb, var(--blue), var(--line-strong) 58%); background: var(--paper); }
  .policy-source-title > span:last-child { min-width: 0; display: grid; }
  .policy-source-title small { color: var(--muted); font-size: 9px; font-weight: 750; letter-spacing: .09em; }
  .policy-source-title strong { font-size: 15px; }
  .policy-source-title > span:last-child > span { color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
  .policy-source-state { min-width: 190px; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: 8px; text-align: right; }
  .policy-source-state strong, .policy-source-state small { min-width: 0; overflow-wrap: anywhere; }
  .policy-source-state strong { color: var(--blue-dark); font-size: 11px; }
  .policy-source--project .policy-source-state strong { color: var(--ink-soft); }
  .policy-source-state small { grid-column: 1; color: var(--muted); font-size: 9px; }
  .policy-source-state svg { grid-column: 2; grid-row: 1 / 3; color: var(--muted); transition: transform .16s ease; }
  .policy-source[open] .policy-source-state svg { transform: rotate(180deg); }
  .policy-form { padding: 0 15px 15px; display: grid; }
  .policy-scope-notice { margin: 0 -15px; padding: 10px 15px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: var(--rail); display: flex; align-items: flex-start; gap: 8px; color: var(--ink-soft); font-size: 11px; }
  .policy-scope-notice svg { flex: 0 0 auto; margin-top: 2px; color: var(--blue); }
  .policy-current-reason { margin: 12px 0 0; padding: 9px 10px; border-left: 2px solid var(--line-strong); color: var(--muted); background: var(--rail); display: grid; gap: 1px; font-size: 11px; }
  .policy-current-reason strong { color: var(--ink-soft); }
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
  .policy-mode-options label > span { min-height: 58px; padding: 9px 10px; border: 1px solid var(--line-strong); border-radius: 5px; background: var(--paper); display: grid; align-content: center; gap: 1px; }
  .policy-mode-options label:hover > span { border-color: color-mix(in srgb, var(--blue), var(--line-strong) 48%); background: color-mix(in srgb, var(--blue-soft) 44%, var(--paper)); }
  .policy-mode-options input:disabled + span { border-color: var(--line); color: var(--faint); background: var(--rail); cursor: not-allowed; }
  .policy-mode-options label:has(input:disabled) { cursor: not-allowed; }
  .policy-mode-options input:checked + span { border-color: var(--blue); background: var(--blue-soft); box-shadow: inset 0 0 0 1px rgba(22, 119, 255, .08); }
  .policy-mode-options input:focus-visible + span { outline: 2px solid color-mix(in srgb, var(--blue), transparent 30%); outline-offset: 2px; }
  .policy-mode-options strong { font-size: 12px; }
  .policy-mode-options small { color: var(--muted); font-size: 10px; overflow-wrap: anywhere; }
  .policy-control--split { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(180px, .65fr); gap: 12px; }
  .policy-input { min-width: 0; display: grid; gap: 6px; }
  .policy-input > span:first-child { display: grid; }
  .policy-input small { color: var(--muted); font-size: 10px; }
  .policy-input input, .policy-reason textarea { width: 100%; min-width: 0; padding: 8px 9px; border: 1px solid var(--line-strong); border-radius: 4px; color: var(--ink); background: var(--paper); resize: vertical; }
  .policy-with-unit { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 7px; }
  .policy-with-unit > span { color: var(--muted); }
  .policy-toggle-list { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .policy-toggle { min-width: 0; padding: 10px 11px; border: 1px solid var(--line); border-radius: 5px; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 9px; cursor: pointer; }
  .policy-toggle:hover { border-color: color-mix(in srgb, var(--blue), var(--line-strong) 56%); background: color-mix(in srgb, var(--blue-soft) 38%, var(--paper)); }
  .policy-toggle:has(input:disabled) { color: var(--faint); background: var(--rail); cursor: not-allowed; }
  .policy-toggle > input { position: absolute; opacity: 0; pointer-events: none; }
  .policy-switch { position: relative; width: 30px; height: 18px; border-radius: 9px; background: var(--faint); transition: .16s ease; }
  .policy-switch::after { content: ""; position: absolute; top: 3px; left: 3px; width: 12px; height: 12px; border-radius: 50%; background: var(--paper); box-shadow: 0 1px 2px rgba(20, 30, 42, .2); transition: .16s ease; }
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
  .policy-counter-input input { width: 56px; min-width: 0; padding: 7px 6px; border: 1px solid var(--line-strong); border-radius: 4px; color: var(--ink); background: var(--paper); text-align: center; }
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
  .decision-new { margin-left: 2px; padding: 2px 6px; border-radius: 9px; color: var(--blue-dark); background: var(--blue-soft); font-size: 10px; font-weight: 700; letter-spacing: 0; }
  .decision-kind--rewire { color: #6b4eb6; }
  .decision-kind--risk { color: var(--amber); }
  .decision-record-body { padding: 12px 14px; }
  .decision-record-body > h3 { margin: 0; font-size: 17px; line-height: 1.4; }
  .decision-record-body p { margin: 3px 0; color: var(--muted); }
  .decision-record-body small { color: var(--muted); overflow-wrap: anywhere; }
  .decision-guidance { margin-top: 13px; border: 1px solid var(--line); background: #fbfcfd; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .decision-guidance > section { min-width: 0; padding: 11px 12px; border-right: 1px solid var(--line); }
  .decision-guidance > section:last-child { border-right: 0; }
  .decision-guidance h4 { margin: 0 0 4px; color: var(--muted); font-size: 11px; }
  .decision-guidance p { margin: 0; overflow-wrap: anywhere; }
  .decision-recommendation strong { display: block; color: var(--muted); font-size: 13px; }
  .decision-recommendation.has-recommendation { background: var(--green-soft); }
  .decision-recommendation.has-recommendation strong { color: var(--green); }
  .decision-recommendation p { margin-top: 3px; font-size: 11px; }
  .decision-consequences dl { margin: 0; display: grid; gap: 6px; }
  .decision-consequences dl div { display: grid; grid-template-columns: minmax(72px, auto) minmax(0, 1fr); gap: 8px; }
  .decision-consequences dt { font-size: 11px; font-weight: 700; }
  .decision-consequences dd { margin: 0; color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
  .decision-scenario { margin-top: 13px; padding-top: 11px; border-top: 1px solid var(--line-strong); }
  .decision-scenario h4 { margin: 0 0 7px; font-size: 12px; }
  .decision-scenario dl { margin: 0; display: grid; gap: 7px; }
  .decision-scenario dl > div { min-width: 0; display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 9px; align-items: start; }
  .decision-scenario dt { color: var(--blue-dark); font-size: 11px; font-weight: 700; }
  .decision-scenario dd { margin: 0; color: var(--ink); overflow-wrap: anywhere; }
  .decision-record-tech { min-width: 0; color: var(--muted); font-size: 10px; text-align: right; }
  .decision-record-tech summary { cursor: pointer; }
  .decision-record-tech small { display: block; margin-top: 3px; overflow-wrap: anywhere; }
  .decision-details { border-top: 1px solid var(--line); }
  .decision-details > summary { min-height: 40px; padding: 9px 14px; color: var(--blue-dark); background: #fbfcfd; display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; font-weight: 650; cursor: pointer; }
  .decision-details > summary svg { transition: transform .16s ease; }
  .decision-details[open] > summary svg { transform: rotate(180deg); }
  .decision-key-fact { margin-top: 10px !important; padding: 9px 10px; border-left: 2px solid var(--blue); background: var(--blue-soft); color: var(--ink) !important; }
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
  .goal-tree-proposal-summary { margin-top: 11px; padding: 11px 12px; border-left: 2px solid var(--blue); background: var(--blue-soft); display: grid; gap: 2px; }
  .goal-tree-proposal-summary > small { color: var(--blue-dark); font-size: 10px; font-weight: 700; }
  .goal-tree-proposal-summary > strong { font-size: 15px; }
  .goal-tree-proposal-summary > p { margin: 2px 0 0; color: var(--ink); overflow-wrap: anywhere; }
  .goal-tree-proposal-narrative { margin-top: 10px; padding: 12px; border: 1px solid var(--line); background: var(--surface); }
  .goal-tree-proposal-narrative.is-missing { border-color: var(--amber); background: var(--amber-soft); }
  .goal-tree-proposal-narrative > h4 { margin: 0 0 8px; font-size: 13px; }
  .goal-tree-proposal-narrative > p { margin: 0; color: var(--ink); }
  .goal-tree-proposal-narrative dl, .goal-tree-proposal-item-explanation { margin: 0; display: grid; gap: 7px; }
  .goal-tree-proposal-narrative dl > div, .goal-tree-proposal-item-explanation > div { display: grid; grid-template-columns: minmax(88px, .3fr) minmax(0, 1fr); gap: 8px; }
  .goal-tree-proposal-narrative dt, .goal-tree-proposal-item-explanation dt { color: var(--muted); font-size: 10px; font-weight: 700; }
  .goal-tree-proposal-narrative dd, .goal-tree-proposal-item-explanation dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
  .goal-tree-proposal-narrative ol, .goal-tree-proposal-narrative ul { margin: 0; padding-left: 18px; }
  .goal-tree-proposal-readiness { margin-top: 11px; padding: 11px 12px; border: 1px solid #efb8b8; background: var(--red-soft); display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 8px; }
  .goal-tree-proposal-readiness > div:first-child { color: var(--red); }
  .goal-tree-proposal-readiness h4 { margin: 0 0 3px; color: var(--red); font-size: 13px; }
  .goal-tree-proposal-readiness p { margin: 0 0 5px; color: var(--ink); }
  .goal-tree-proposal-readiness strong { font-size: 12px; }
  .goal-tree-proposal-changes { padding: 0; }
  .goal-tree-proposal-changes > summary > span { min-width: 0; display: grid; gap: 1px; }
  .goal-tree-proposal-changes > summary small { color: var(--muted); font-size: 10px; font-weight: 500; }
  .goal-tree-proposal-details h4 { margin: 0 0 7px; font-size: 12px; }
  .goal-tree-proposal-changes > ol { list-style: none; margin: 0; padding: 0 14px; border-top: 1px solid var(--line); }
  .goal-tree-proposal-changes > .goal-tree-proposal-conflict { margin: 10px 14px 12px; }
  .goal-tree-proposal-item { min-width: 0; padding: 9px 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 7px; }
  .goal-tree-proposal-item > span { color: var(--green); }
  .goal-tree-proposal-item.is-conflict > span, .goal-tree-proposal-item.is-invalid > span { color: var(--red); }
  .goal-tree-proposal-item > div { min-width: 0; display: grid; gap: 1px; }
  .goal-tree-proposal-item strong, .goal-tree-proposal-item small { overflow-wrap: anywhere; }
  .goal-tree-proposal-item small { color: var(--muted); }
  .goal-tree-proposal-item-explanation { margin-top: 7px; padding: 8px 9px; border-left: 2px solid var(--blue); background: var(--blue-soft); font-size: 11px; }
  .goal-tree-proposal-item-facts { margin: 6px 0 0; padding-left: 18px; color: var(--ink); font-size: 11px; }
  .goal-tree-proposal-item-facts li { margin: 3px 0; overflow-wrap: anywhere; }
  .goal-tree-proposal-item-error { margin-top: 7px; padding: 8px 9px; border: 1px solid #efb8b8; background: var(--red-soft); }
  .goal-tree-proposal-item-error > strong { color: var(--red); font-size: 11px; }
  .goal-tree-proposal-item-error > p { margin: 3px 0 0; color: var(--ink); font-size: 11px; }
  .goal-tree-risk-repair { margin-top: 10px; padding-top: 11px; border-top: 1px solid var(--line); }
  .goal-tree-risk-repair > h4 { margin: 0; color: var(--ink); font-size: 13px; }
  .goal-tree-risk-repair > p { margin: 3px 0 9px; color: var(--muted); font-size: 11px; }
  .goal-tree-risk-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border: 1px solid var(--line); border-radius: 5px; overflow: hidden; background: #fff; }
  .goal-tree-risk-options label { min-width: 0; padding: 9px 10px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 8px; cursor: pointer; }
  .goal-tree-risk-options label:nth-child(2n) { border-right: 0; }
  .goal-tree-risk-options label:nth-last-child(-n+2) { border-bottom: 0; }
  .goal-tree-risk-options label:has(input:checked) { color: var(--blue-dark); background: var(--blue-soft); }
  .goal-tree-risk-options input { margin-top: 3px; accent-color: var(--blue); }
  .goal-tree-risk-options span { min-width: 0; display: grid; }
  .goal-tree-risk-options strong { font-size: 12px; }
  .goal-tree-risk-options small { font-size: 10px; line-height: 1.45; }
  .goal-tree-risk-plan-editor { margin-top: 8px; border-top: 1px solid var(--line); }
  .goal-tree-risk-plan-editor > summary { min-height: 38px; color: var(--blue-dark); display: flex; align-items: center; justify-content: space-between; gap: 12px; cursor: pointer; }
  .goal-tree-risk-plan-editor > summary > span { min-width: 0; display: flex; align-items: baseline; flex-wrap: wrap; gap: 3px 8px; font-size: 11px; font-weight: 650; }
  .goal-tree-risk-plan-editor > summary small { color: var(--muted); font-size: 10px; font-weight: 400; }
  .goal-tree-risk-plan-editor > summary svg { flex: 0 0 auto; transition: transform .16s ease; }
  .goal-tree-risk-plan-editor[open] > summary svg { transform: rotate(180deg); }
  .goal-tree-risk-plan { padding: 2px 0 7px; display: grid; gap: 5px; }
  .goal-tree-risk-plan > span { color: var(--ink); font-size: 12px; font-weight: 650; }
  .goal-tree-risk-plan > span small { margin-left: 4px; font-weight: 400; }
  .goal-tree-risk-plan textarea { width: 100%; min-width: 0; padding: 8px 9px; border: 1px solid var(--line-strong); border-radius: 4px; background: #fff; resize: vertical; }
  .goal-tree-risk-repair > .form-error { margin: 7px 0 0; }
  .goal-tree-proposal-conflict { margin: 10px 0 0; padding: 9px 10px; color: var(--red); background: var(--red-soft); }
  .goal-tree-proposal-details { padding: 0 14px 12px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 22px; }
  .goal-tree-proposal-details > section { min-width: 0; padding-top: 11px; }
  .goal-tree-proposal-details .doc-list { margin: 0; }
  .goal-tree-proposal-acceptance { grid-column: 1 / -1; }
  .goal-tree-proposal-acceptance > ol { margin: 0; padding-left: 19px; }
  .goal-tree-proposal-acceptance li { margin: 5px 0; padding-left: 3px; }
  .goal-tree-proposal-acceptance li small { display: block; color: var(--muted); }
  .candidate-title { padding: 14px 15px; border-bottom: 1px solid var(--line); display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
  .decision-record-body .candidate-title { margin: 11px 0 0; padding: 11px 0; border-top: 1px solid var(--line); }
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
  .button-primary { color: var(--action-ink) !important; border-color: var(--action) !important; background: var(--action) !important; }
  .button-primary:hover { background: color-mix(in srgb, var(--action) 90%, var(--action-ink)) !important; }
  .decision-actions button:disabled { color: var(--muted) !important; border-color: var(--line) !important; background: #eef0f3 !important; cursor: not-allowed; }
  .risk-state { color: var(--amber); font-size: 11px; font-weight: 700; }
  .risk-state--triggered { color: var(--red); }
  .risk-goal-links { padding: 10px 14px; border-top: 1px solid var(--line); display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 14px; }
  .risk-goal-links > span { color: var(--muted); font-size: 11px; font-weight: 650; }
  .risk-goal-links > div { min-width: 0; display: flex; flex-wrap: wrap; gap: 8px 18px; }
  .risk-goal-links .decision-owner-link { min-width: min(100%, 220px); }
  .risk-goal-links .decision-owner-link strong { font-size: 13px; }
  .risk-decision-fact { margin-top: 11px; padding: 10px 11px; border-left: 2px solid var(--amber); background: var(--amber-soft); }
  .risk-decision-fact p, .risk-decision-fact small { display: block; margin: 2px 0 0; color: #65542e; }
  .risk-decision-details { margin: 0; padding: 0 14px; }
  .risk-decision-details > div { padding: 10px 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 170px minmax(0, 1fr); gap: 12px; }
  .risk-decision-details dt { color: var(--muted); font-size: 11px; font-weight: 650; }
  .risk-decision-details dd { margin: 0; overflow-wrap: anywhere; }
  .risk-decision-choice { padding: 12px 14px; border-top: 1px solid var(--line); display: grid; grid-template-columns: minmax(220px, .7fr) minmax(0, 1fr); align-items: end; gap: 14px; }
  .risk-decision-choice label { display: grid; gap: 5px; }
  .risk-decision-choice label > span { font-size: 11px; font-weight: 650; }
  .risk-decision-choice select { width: 100%; min-height: 36px; padding: 6px 9px; border: 1px solid var(--line-strong); border-radius: 4px; background: #fff; }
  .risk-decision-choice select[aria-invalid="true"], .decision-reason textarea[aria-invalid="true"] { border-color: var(--red); outline: 2px solid var(--red-soft); outline-offset: 1px; }
  .risk-decision-choice .risk-state-preview { min-height: 36px; }
  .risk-decision > footer.decision-actions { justify-content: space-between; align-items: center; }
  .risk-decision > footer.decision-actions a { color: var(--blue-dark); font-size: 12px; font-weight: 650; text-decoration: none; }
  .decision-link-row { padding: 10px 14px; border-top: 1px solid var(--line); background: #fbfcfd; display: flex; align-items: center; justify-content: space-between; gap: 18px; }
  .decision-link-row span { color: var(--muted); font-size: 12px; }
  .decision-link-row a { flex: 0 0 auto; color: var(--blue-dark); font-weight: 650; text-decoration: none; }
  .decision-stack > .human-review-list { margin: 0; border: 1px solid var(--line-strong); border-radius: 5px; overflow: hidden; }
  .decision-stack > .human-review-list > .decision-record-heading { padding: 8px 13px; border-bottom: 1px solid var(--line); }
  .review-context { padding: 0 14px 13px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; }
  .review-context h4 { margin: 13px 0 6px; font-size: 12px; }
  .decision-receipt { margin: 18px 0 2px; padding: 13px 15px; border: 1px solid color-mix(in srgb, var(--green), var(--line) 65%); background: var(--green-soft); display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 18px; }
  .decision-receipt strong, .decision-receipt span { display: block; }
  .decision-receipt span { color: var(--muted); font-size: 12px; }
  .decision-receipt a { color: var(--blue-dark); font-weight: 650; text-decoration: none; }
  .decision-results { margin: 18px 0 2px; border: 1px solid var(--line-strong); border-radius: 6px; background: #fff; overflow: hidden; }
  .decision-results > header { padding: 12px 14px; border-bottom: 1px solid var(--line); background: #f7f9fb; display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
  .decision-results > header h2 { margin: 0; font-size: 15px; }
  .decision-results > header p { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
  .decision-results > header > small { flex: 0 0 auto; color: var(--muted); }
  .decision-result-list { display: grid; }
  .decision-result { min-width: 0; padding: 12px 14px; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: auto minmax(0, 1fr) minmax(180px, auto); align-items: start; gap: 11px; }
  .decision-result:last-child { border-bottom: 0; }
  .decision-result-icon { width: 27px; height: 27px; border-radius: 50%; color: var(--green); background: var(--green-soft); display: grid; place-items: center; }
  .decision-result-icon svg { width: 14px; height: 14px; }
  .decision-result-copy { min-width: 0; }
  .decision-result-copy > div { display: flex; align-items: center; flex-wrap: wrap; gap: 5px 8px; color: var(--muted); font-size: 10px; }
  .decision-result-copy > div strong { padding: 1px 5px; border-radius: 3px; color: var(--green); background: var(--green-soft); }
  .decision-result-copy > div time { margin-left: auto; }
  .decision-result-copy h3 { margin: 4px 0 3px; font-size: 13px; line-height: 1.4; overflow-wrap: anywhere; }
  .decision-result-copy p { margin: 2px 0; color: var(--ink-soft); font-size: 12px; overflow-wrap: anywhere; }
  .decision-result-copy > small { display: block; margin-top: 5px; color: var(--muted); overflow-wrap: anywhere; }
  .decision-result-links { min-width: 0; display: grid; justify-items: end; gap: 4px; }
  .decision-result-links a { max-width: 100%; color: var(--blue-dark); font-size: 11px; font-weight: 650; text-decoration: none; display: flex; align-items: center; justify-content: flex-end; gap: 3px; text-align: right; overflow-wrap: anywhere; }
  .decision-result-links a svg { flex: 0 0 auto; width: 12px; height: 12px; }
  .decision-empty { min-height: 410px; display: grid; place-content: center; justify-items: center; text-align: center; color: var(--muted); }
  .decision-empty > svg { width: 30px; height: 30px; color: var(--green); }
  .decision-empty h2 { margin: 12px 0 3px; color: var(--ink); font-size: 19px; }
  .decision-empty p { margin: 0; }
  .decision-empty a { margin-top: 12px; color: var(--blue-dark); font-weight: 650; text-decoration: none; }
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
  .goal-lifecycle-hint { display: flex; align-items: flex-start; gap: 9px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--rail); }
  .goal-lifecycle-hint > svg { flex: 0 0 auto; margin-top: 2px; color: var(--blue); }
  .goal-lifecycle-hint span { display: grid; gap: 2px; }
  .goal-lifecycle-hint small { color: var(--muted); }
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
  .quick-record-dialog { width: min(760px, calc(100vw - 32px)); }
  .quick-record-dialog .dialog-shell { grid-template-rows: auto minmax(0, 1fr); }
  .quick-record-body { align-content: start; }
  .quick-record-choices > p { margin: 0 0 10px; font-weight: 650; }
  .quick-record-choices > div { border-top: 1px solid var(--line); }
  .quick-record-choices button { width: 100%; min-height: 58px; padding: 10px 2px; border: 0; border-bottom: 1px solid var(--line); background: transparent; color: inherit; display: grid; grid-template-columns: 24px minmax(0, 1fr) 16px; align-items: center; gap: 9px; text-align: left; cursor: pointer; }
  .quick-record-choices button:hover { color: var(--blue-dark); background: color-mix(in srgb, var(--blue-soft) 48%, transparent); }
  .quick-record-choices button > svg:first-child { color: var(--blue-dark); }
  .quick-record-choices button > svg:last-child { color: var(--faint); }
  .quick-record-choices button > span { min-width: 0; display: grid; }
  .quick-record-choices button strong { font-size: 13px; }
  .quick-record-choices button small { color: var(--muted); font-size: 11px; }
  .quick-record-panel { min-width: 0; }
  .quick-record-back { margin: 0 0 12px; padding: 4px 0; border: 0; background: transparent; color: var(--blue-dark); display: inline-flex; align-items: center; gap: 5px; font-weight: 650; cursor: pointer; }
  .quick-record-back svg { width: 14px; height: 14px; transform: rotate(180deg); }
  .quick-record-form { padding: 0 !important; border-top: 0 !important; }
  .quick-record-dialog .risk-form footer, .quick-record-dialog .impact-form footer, .quick-record-dialog .relation-form footer { padding: 12px 0 0; }
  .quick-record-form[data-evidence-form] { display: grid; gap: 12px; }
  .quick-record-form[data-evidence-form] fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
  .quick-record-form[data-evidence-form] .evidence-criteria > div { margin-top: 6px; border: 1px solid var(--line); border-radius: 5px; display: grid; }
  .quick-record-form[data-evidence-form] .evidence-criteria label { padding: 8px 9px; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 8px; }
  .quick-record-form[data-evidence-form] .evidence-criteria label:last-child { border-bottom: 0; }
  .quick-record-form[data-evidence-form] .evidence-criteria label > span { display: grid; }
  .quick-record-form[data-evidence-form] .evidence-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .quick-record-form[data-evidence-form] footer { padding: 12px 0 0; border-top: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .quick-record-form[data-evidence-form] footer > span { color: var(--muted); font-size: 11px; }
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
  .event-ledger-pagination { min-height: 42px; padding-top: 10px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .event-ledger-pagination > span { color: var(--muted); font-size: 11px; }
  .event-ledger-pagination button { min-height: 30px; padding: 5px 10px; border: 1px solid var(--line-strong); border-radius: 5px; background: var(--panel); color: var(--text); font-weight: 650; cursor: pointer; }
  .event-ledger-pagination button:hover { border-color: var(--blue); color: var(--blue-dark); }
  .event-ledger-pagination button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .event-ledger-pagination button:disabled { cursor: wait; opacity: .58; }
  .event-ledger-pagination [role="alert"] { flex-basis: 100%; margin: 0; color: var(--red); font-size: 11px; }
  .event-ledger-pagination:has([role="alert"]:not([hidden])) { flex-wrap: wrap; }
  @keyframes document-in { from { opacity: .5; transform: translateY(5px); } }
  @keyframes pulse { 50% { opacity: .35; } }
`;

const RESPONSIVE_STYLES = `
  @container (max-width: 660px) {
    .goal-workspace-nav { margin-inline: -4px; padding-inline: 4px; }
    .goal-workspace-nav button { flex: 1 0 auto; min-height: 42px; padding-inline: 8px; font-size: 12px; }
    .goal-workspace-nav button svg { display: none; }
    .goal-factor-nav, .goal-factor-panels { margin-left: 0; }
    .goal-factor-nav { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .goal-factor-nav button:nth-child(2) { border-right: 0; }
    .goal-factor-nav button:nth-child(-n+2) { border-bottom: 1px solid var(--line); }
    .policy-scope-note { grid-template-columns: auto minmax(0, 1fr); }
    .policy-scope-note a { grid-column: 2; }
    .document-subsection, .draft-editor-section { margin-left: 0; }
    .human-review-list > header { display: grid; gap: 2px; }
    .human-review-form > label, .human-review-form fieldset { grid-template-columns: 1fr; gap: 5px; }
    .human-review-form > label > span, .human-review-form legend { padding-top: 0; }
    .human-review-form footer { align-items: stretch; flex-direction: column; }
    .human-review-form footer button { align-self: flex-end; }
    .evidence-form-row { grid-template-columns: 1fr; }
    .evidence-submit footer { align-items: stretch; flex-direction: column; }
    .evidence-submit footer button { align-self: flex-end; }
    .quick-record-form[data-evidence-form] .evidence-form-row { grid-template-columns: 1fr; }
    .quick-record-form[data-evidence-form] footer { align-items: stretch; flex-direction: column; }
    .quick-record-form[data-evidence-form] footer button { align-self: flex-end; }
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
    .factor-advanced-grid { grid-template-columns: 1fr; }
    .policy-form-wide { grid-column: 1; }
    .relation-form > footer { align-items: stretch; flex-direction: column; }
    .relation-form > footer button { align-self: flex-end; }
    .relation-editor-action { display: none; }
    .risk-facts, .risk-form, .risk-state-form { grid-template-columns: 1fr; }
    .risk-facts { padding-left: 14px; }
    .risk-fact-wide, .risk-form-wide, .risk-goal-picker { grid-column: 1; }
    .risk-record > header > div { grid-template-columns: 1fr; }
    .risk-record .risk-state { margin-bottom: 2px; }
    .risk-effect, .risk-resolution, .risk-readonly { margin-left: 14px; }
    .risk-actions > details > summary, .risk-form, .risk-state-form { padding-left: 14px; }
    .risk-decision-link { padding-left: 14px; }
    .risk-goal-options { grid-template-columns: 1fr; }
    .risk-form footer, .risk-state-form footer { align-items: stretch; flex-direction: column; }
    .risk-form footer button, .risk-state-form footer button { align-self: flex-end; }
    .risk-resolution-fields { grid-template-columns: 1fr; }
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
    .goal-now > header, .goal-now-body { grid-template-columns: 1fr; display: grid; }
    .goal-now > header { gap: 8px; }
    .goal-now > header .goal-status { justify-self: start; }
    .goal-primary-action { justify-self: start; white-space: normal; text-align: left; }
    .goal-now-blockers, .goal-purpose > section, .completion-boundaries > section, .supporting-boundaries > div > section { grid-template-columns: 1fr; gap: 5px; }
    .goal-purpose, .goal-edit-disclosure, .child-progress, .progress-overview, .goal-technical-body { margin-left: 0; padding-left: 0; }
    .progress-facts, .technical-meta { grid-template-columns: 1fr; }
    .progress-facts > div { padding: 10px 0 !important; border-right: 0 !important; }
    .technical-meta > div { grid-template-columns: 1fr; gap: 2px; }
  }
  @media (max-width: 1500px) {
    .brand { min-width: 160px; padding-inline: 20px; }
    .project-context { min-width: 0; padding-inline: 14px; }
    .project-context > span { max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
    .top-action { padding-inline: 9px; }
  }
  @media (max-width: 1180px) {
    .app, .topbar, .workspace { min-width: 0; }
    .workspace { grid-template-columns: var(--tree-width, 280px) 5px minmax(0, 1fr); }
    .workspace.is-desktop-tui { grid-template-columns: var(--tree-width, 240px) 5px minmax(0, 1fr) 5px var(--tui-width, 400px); }
    .workspace.is-desktop-tui.is-tui-collapsed { grid-template-columns: var(--tree-width, 240px) 5px minmax(0, 1fr) 0 0; }
    .project-context { min-width: 0; padding-inline: 12px; }
    .project-context > span { max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
    .top-action { padding-inline: 8px; }
    .top-action span { display: none; }
    .runtime-grid { grid-template-columns: 1fr 1fr; }
    .runtime-grid > section:nth-child(2) { border-right: 0; }
    .runtime-grid > section:nth-child(-n+2) { border-bottom: 1px solid var(--line-strong); }
  }
  @media (max-width: 900px) {
    .top-spacer { display: block; flex: 1 1 auto; }
    .project-context { min-width: 0; flex: 1 1 auto; padding-inline: 12px; }
    .project-context > strong { display: none; }
    .project-context > span { min-width: 0; flex: 1 1 auto; max-width: 180px; overflow: hidden; text-overflow: ellipsis; }
    .project-context a { flex: 0 0 auto; }
  }
  @media (max-width: 760px) {
    body { overflow: hidden; }
    .app { grid-template-rows: 52px 42px minmax(0, 1fr); }
    .topbar { grid-row: 1; }
    .brand { min-width: 0; padding: 0 15px; border-right: 0; }
    .brand strong { font-size: 17px; }
    .project-context { padding-inline: 8px; }
    .project-context > span { max-width: 132px; }
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
    .decision-guidance, .review-context, .risk-decision-choice { grid-template-columns: 1fr; }
    .decision-guidance > section { border-right: 0; border-bottom: 1px solid var(--line); }
    .decision-guidance > section:last-child { border-bottom: 0; }
    .decision-scenario dl > div { grid-template-columns: 1fr; gap: 2px; }
    .risk-decision-details > div { grid-template-columns: 1fr; gap: 3px; }
    .decision-receipt { grid-template-columns: 1fr; }
    .decision-result { grid-template-columns: auto minmax(0, 1fr); }
    .decision-result-links { grid-column: 2; justify-items: start; }
    .decision-result-links a { justify-content: flex-start; text-align: left; }
    .candidate-title { display: grid; }
    .candidate-title > span { justify-self: start; }
    .candidate-contract { grid-template-columns: 1fr; }
    .goal-tree-proposal-details { grid-template-columns: 1fr; }
    .goal-tree-risk-options { grid-template-columns: 1fr; }
    .goal-tree-risk-options label { border-right: 0; }
    .goal-tree-risk-options label:nth-last-child(-n+2) { border-bottom: 1px solid var(--line); }
    .goal-tree-risk-options label:last-child { border-bottom: 0; }
    .goal-tree-risk-plan textarea { font-size: 16px; }
    .candidate-wide { grid-column: 1; }
    .goal-tree-proposal-acceptance { grid-column: 1; }
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
  .project-index-page > .project-directory-topbar { display: flex !important; }
  .project-index-page > .project-directory-topbar > .top-action { display: inline-flex !important; }
  .project-index-page .brand { color: inherit; text-decoration: none; }
  .project-directory-topbar { gap: 8px; }
  .project-primary-directories { height: 34px; padding: 3px; border-radius: 9px; background: var(--rail); display: flex; align-items: center; gap: 2px; }
  .project-primary-directories a { height: 28px; padding: 0 10px; border-radius: 7px; color: var(--muted); display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; text-decoration: none; }
  .project-primary-directories a[aria-current=page] { color: var(--ink); background: var(--paper); box-shadow: 0 2px 9px rgba(34, 48, 64, .08); }
  .project-index { min-height: calc(100dvh - 58px); padding: clamp(28px, 5vh, 52px) clamp(22px, 5vw, 72px) 64px; display: grid; place-items: start center; }
  .project-index-panel { width: min(100%, 1040px); background: transparent; }
  .project-index-heading { padding: 0 0 18px; display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; }
  .project-index-heading h1 { margin: 0; font-size: clamp(27px, 3vw, 38px); letter-spacing: -.04em; }
  .project-index-heading p { max-width: 64ch; margin: 9px 0 0; color: var(--muted); }
  .project-index-actions { display: flex; align-items: center; gap: 8px; }
  .project-index-search { position: relative; display: flex; align-items: center; }
  .project-index-search svg { position: absolute; left: 10px; color: var(--muted); pointer-events: none; }
  .project-index-search input { width: 190px; min-height: 34px; padding: 0 10px 0 31px; border: 1px solid var(--line-strong); border-radius: 7px; color: var(--ink); background: var(--paper); }
  .project-index-search-empty { margin: 12px 0 0; padding: 24px 10px; border: 1px dashed var(--line-strong); border-radius: 12px; color: var(--muted); text-align: center; }
  .project-index-create { min-height: 34px; padding: 0 12px; border: 1px solid var(--action); border-radius: 7px; color: var(--action-ink); background: var(--action); display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; text-decoration: none; white-space: nowrap; }
  .project-index-create:hover { background: color-mix(in srgb, var(--action) 90%, var(--action-ink)); }
  .project-card-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  .project-card { min-width: 0; min-height: 138px; padding: 16px; border: 1px solid var(--line); border-radius: 12px; color: inherit; background: var(--paper); box-shadow: var(--shadow-soft); display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 13px; text-decoration: none; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
  .project-card:hover { border-color: var(--line-strong); box-shadow: var(--shadow-raised); transform: translateY(-1px); }
  .project-card:focus-visible { outline: 2px solid color-mix(in srgb, var(--blue) 62%, transparent); outline-offset: 3px; }
  .project-card > header, .project-card > footer { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .project-card > div { min-width: 0; }
  .project-card-icon { width: 28px; height: 28px; border-radius: 8px; color: var(--ink-soft); background: var(--rail); display: grid; place-items: center; }
  .project-card-icon svg { width: 15px; height: 15px; }
  .project-card-kind { min-width: 0; overflow: hidden; color: var(--faint); font-size: 9px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
  .project-card h2 { margin: 0; overflow: hidden; font-size: 14px; letter-spacing: -.014em; text-overflow: ellipsis; white-space: nowrap; }
  .project-card p { margin: 4px 0 0; overflow: hidden; color: var(--muted); font-size: 10px; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
  .project-card footer { color: var(--ink-soft); font-size: 10px; font-weight: 680; }
  .project-card footer svg { width: 13px; height: 13px; transform: rotate(180deg); transition: transform .16s ease; }
  .project-card:hover footer svg { transform: rotate(180deg) translateX(-2px); }
  .project-index-empty { padding: 42px 30px 46px; color: var(--muted); }
  .project-index-empty h2 { margin: 0 0 7px; color: var(--ink); font-size: 18px; }
  .project-index-empty p { max-width: 48ch; margin: 0; }
  .project-index-start { margin-top: 18px; display: flex; flex-wrap: wrap; gap: 9px; }
  .project-index-start a { min-height: 34px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 7px; color: var(--blue-dark); background: var(--paper); display: inline-flex; align-items: center; font-weight: 650; text-decoration: none; }
  .project-index-start a:first-child { border-color: var(--action); color: var(--action-ink); background: var(--action); }
  .project-index-start a:hover { border-color: color-mix(in srgb, var(--blue), var(--line) 58%); background: var(--blue-soft); color: var(--blue-dark); }
  .project-index-start a:first-child:hover { border-color: var(--action); color: var(--action-ink); background: color-mix(in srgb, var(--action) 90%, var(--action-ink)); }
  .project-index-migration { margin-top: 28px; padding: 18px 20px; border: 0; border-radius: 12px; display: flex; align-items: center; justify-content: space-between; gap: 18px; background: color-mix(in srgb, var(--rail) 78%, var(--page)); }
  .project-index-migration > div { min-width: 0; }
  .project-index-migration strong { display: block; font-size: 13px; }
  .project-index-migration small { display: block; margin-top: 2px; color: var(--muted); }
  .project-index-migrate { min-height: 34px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 7px; color: var(--blue-dark); background: var(--paper); font-weight: 650; white-space: nowrap; cursor: pointer; }
  .project-index-migrate:hover { border-color: color-mix(in srgb, var(--blue), var(--line) 58%); background: var(--blue-soft); }
  .project-migration-dialog { width: min(100% - 28px, 580px); padding: 0; border: 1px solid var(--line-strong); border-radius: 9px; background: var(--paper); color: var(--ink); box-shadow: var(--shadow); }
  .project-migration-dialog::backdrop { background: rgba(27, 35, 45, .32); }
  .project-migration-form { display: grid; }
  .project-migration-form > header { padding: 22px 24px 18px; border-bottom: 1px solid var(--line); display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .project-migration-form h2 { margin: 0; font-size: 19px; letter-spacing: -.02em; }
  .project-migration-form header p { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
  .project-migration-form > .project-migration-body { padding: 20px 24px; display: grid; gap: 15px; }
  .project-migration-form label:not(.project-migration-confirm) { display: grid; gap: 5px; color: var(--ink-soft); font-size: 13px; font-weight: 650; }
  .project-migration-form label small { color: var(--muted); font-weight: 400; }
  .project-migration-form input[type=text] { width: 100%; min-height: 36px; padding: 0 10px; border: 1px solid var(--line-strong); border-radius: 7px; background: var(--paper); color: var(--ink); }
  .project-migration-form input[type=text]:focus { border-color: var(--blue); outline: 0; box-shadow: 0 0 0 2px color-mix(in srgb, var(--blue), transparent 84%); }
  .project-migration-warning { margin: 0; padding: 10px 11px; color: #654300; border: 1px solid #efd49c; background: var(--amber-soft); font-size: 12px; line-height: 1.55; }
  .project-migration-confirm { display: flex; align-items: flex-start; gap: 9px; color: var(--ink-soft); font-size: 13px; line-height: 1.45; cursor: pointer; }
  .project-migration-confirm input { width: 16px; height: 16px; margin: 2px 0 0; accent-color: var(--blue); }
  .project-migration-error { margin: 0; color: var(--red); font-size: 13px; }
  .project-migration-form > footer { padding: 14px 24px; border-top: 1px solid var(--line); display: flex; justify-content: flex-end; gap: 9px; background: var(--rail); }
  .project-migration-form > footer button { min-height: 34px; padding: 0 13px; border: 1px solid var(--line-strong); border-radius: 7px; background: var(--paper); color: var(--ink); cursor: pointer; }
  .project-migration-form > footer .project-migration-submit { border-color: var(--action); color: var(--action-ink); background: var(--action); font-weight: 650; }
  .project-migration-form > footer .project-migration-submit:hover { background: color-mix(in srgb, var(--action) 90%, var(--action-ink)); }
  .project-migration-form > footer .project-migration-submit:disabled { opacity: .58; cursor: wait; }
  .project-index-note { margin: 10px 0 0; padding: 0 2px; border: 0; color: var(--muted); font-size: 11px; background: transparent; }
  @media (max-width: 760px) {
    .project-index-page > .topbar { height: 52px; }
    .project-index { min-height: calc(100dvh - 52px); }
    .project-index-page .project-context small { display: none; }
    .project-card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 1100px) and (min-width: 761px) {
    .project-card-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  @media (max-width: 620px) {
    .project-index { padding: 28px 14px; place-items: start stretch; }
    .project-index-panel { width: 100%; }
    .project-index-heading { align-items: stretch; flex-direction: column; }
    .project-index-heading, .project-index-empty { padding-inline: 0; }
    .project-index-actions { align-items: stretch; }
    .project-index-search { flex: 1; }
    .project-index-search input { width: 100%; min-height: 44px; }
    .project-index-create { min-height: 44px; align-self: stretch; }
    .project-index-migration { padding-inline: 20px; align-items: stretch; flex-direction: column; }
    .project-index-migrate { align-self: flex-start; }
    .project-index-note { padding-inline: 20px; }
    .project-migration-form > header, .project-migration-form > .project-migration-body, .project-migration-form > footer { padding-inline: 18px; }
  }
  @media (max-width: 520px) {
    .project-card-grid { grid-template-columns: minmax(0, 1fr); }
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

const ONBOARDING_CLIENT_SCRIPT = `
  (() => {
    const L = globalThis.L || ((text) => text);
    const form = document.querySelector("[data-onboarding-form]");
    const globalError = document.querySelector("[data-onboarding-error]");
    const dismissButtons = [...document.querySelectorAll("[data-onboarding-dismiss]")];
    const setGlobalError = (message) => {
      if (!globalError) return;
      globalError.textContent = message || "";
      globalError.hidden = !message;
    };
    const dismiss = async (kind) => {
      const mode = document.body.dataset.onboardingMode || "update";
      if (mode === "new_project") {
        location.assign("/");
        return;
      }
      dismissButtons.forEach((button) => { button.disabled = true; });
      setGlobalError("");
      try {
        const response = await fetch("/api/onboarding/dismiss", {
          method: "POST",
          headers: globalThis.goalboardControlHeaders(),
          body: JSON.stringify({ kind, user_confirmed: true }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || L("无法保存引导状态"));
        location.assign("/");
      } catch (error) {
        setGlobalError(error instanceof Error ? error.message : String(error));
        dismissButtons.forEach((button) => { button.disabled = false; });
      }
    };
    dismissButtons.forEach((button) => button.addEventListener("click", () => void dismiss(button.dataset.onboardingDismiss || "first_run")));
    if (!form) return;

    const steps = [...form.querySelectorAll("[data-onboarding-step]")];
    const progress = form.querySelector("[data-onboarding-progress]");
    const back = form.querySelector("[data-onboarding-back]");
    const next = form.querySelector("[data-onboarding-next]");
    const submit = form.querySelector("[data-onboarding-submit]");
    const nextLabel = form.querySelector("[data-onboarding-next-label]");
    const submitLabel = form.querySelector("[data-onboarding-submit-label]");
    const runtimeFrame = form.querySelector("[data-onboarding-runtime-frame]");
    const runtimeStatus = form.querySelector("[data-onboarding-runtime-status]");
    const runtimeRetry = form.querySelector("[data-onboarding-runtime-retry]");
    const intentInput = form.elements.intent_frame;
    const intentPicker = form.querySelector("[data-onboarding-intent]");
    const intentTrigger = form.querySelector("[data-onboarding-intent-trigger]");
    const intentCurrent = form.querySelector("[data-onboarding-intent-current]");
    const intentOptions = [...form.querySelectorAll("[data-onboarding-intent-option]")];
    const outcomeInput = form.elements.outcome;
    let currentStep = 0;
    let transitionTimer = 0;
    let runtimeReady = false;
    let runtimeBootstrap = null;
    let projectDestination = "";
    const meaningful = (value) => /\\p{L}/u.test(String(value || "").trim());
    const values = () => {
      const data = new FormData(form);
      const intentOption = intentOptions.find((option) => option.getAttribute("aria-selected") === "true");
      const intentPrefix = intentOption?.dataset.intentLabel || L("我想");
      const outcome = String(data.get("outcome") || "").trim();
      const sentenceGap = document.documentElement.lang.startsWith("zh") ? "" : " ";
      return {
        outcome,
        outcomeSentence: intentPrefix + sentenceGap + outcome,
        intentFrame: String(data.get("intent_frame") || "open"),
        projectName: String(data.get("project_name") || "").trim(),
        workspacePath: String(data.get("workspace_path") || "").trim(),
        runtimeKind: String(data.get("runtime_kind") || "").trim(),
        confirmed: data.get("user_confirmed") === "on",
      };
    };
    const fieldError = (step, message) => {
      const error = form.querySelector('[data-step-error="' + step + '"]');
      if (error) {
        error.textContent = message || "";
        error.hidden = !message;
      }
      const input = step === 0
        ? form.elements.outcome
        : step === 1
          ? form.elements.project_name
          : step === 2
            ? form.elements.workspace_path
            : form.elements.user_confirmed;
      input?.setAttribute("aria-invalid", message ? "true" : "false");
    };
    const validate = (step) => {
      const data = values();
      fieldError(step, "");
      if (step === 0 && !meaningful(data.outcome)) {
        fieldError(step, L("先告诉我们，你想看到什么变化。"));
        return false;
      }
      if (step === 1 && !meaningful(data.projectName)) {
        fieldError(step, L("给这个项目取个名字吧。"));
        return false;
      }
      if (step === 2 && data.runtimeKind && !data.workspacePath) {
        fieldError(step, L("如果现在打开 TUI，需要先选择一个存在的工作目录；也可以这次先跳过。"));
        return false;
      }
      if (step === 3 && !data.confirmed) {
        fieldError(step, L("确认这些内容没问题后，我们再保存。"));
        return false;
      }
      return true;
    };
    const updateReview = () => {
      const data = values();
      form.querySelectorAll("[data-onboarding-outcome]").forEach((node) => { node.textContent = data.outcomeSentence; });
      form.querySelectorAll("[data-onboarding-project]").forEach((node) => { node.textContent = data.projectName; });
      const runtime = form.querySelector('input[name="runtime_kind"]:checked')?.closest("label")?.querySelector("strong")?.textContent || L("这次先跳过");
      const assignments = [
        ["[data-review-project]", data.projectName],
        ["[data-review-outcome]", data.outcomeSentence],
        ["[data-review-workspace]", data.workspacePath || L("之后再选")],
        ["[data-review-runtime]", data.runtimeKind ? runtime + L(" · 先填入，等你自己发送") : L("先进入 Goal 工作台，之后再打开 TUI")],
      ];
      assignments.forEach(([selector, value]) => {
        const node = form.querySelector(selector);
        if (node) node.textContent = value;
      });
    };
    const updateNavigation = () => {
      const stepLabels = [L("说说想法"), L("取个名字"), L("选择工具"), L("确认一下"), L("一起安排")];
      const hasRuntime = Boolean(values().runtimeKind);
      const visibleStepCount = hasRuntime ? 5 : 4;
      if (progress) {
        progress.textContent = String(currentStep + 1).padStart(2, "0") + " / " + String(visibleStepCount).padStart(2, "0") + " · " + stepLabels[currentStep];
      }
      if (back) back.hidden = currentStep === 0 || currentStep === 4;
      if (next) {
        next.hidden = currentStep === 3;
        next.disabled = currentStep === 4 && !runtimeReady;
      }
      if (submit) submit.hidden = currentStep !== 3;
      if (nextLabel) {
        nextLabel.textContent = currentStep === 4 ? L("安排好了，进入 GoalBoard") : L("下一步");
      }
      document.body.dataset.onboardingTone = String(currentStep);
      if (currentStep === 3) updateReview();
    };
    const showStep = (step) => {
      const targetStep = Math.max(0, Math.min(steps.length - 1, step));
      const previousStep = currentStep;
      const outgoing = steps[previousStep];
      const incoming = steps[targetStep];
      if (!incoming) return;
      window.clearTimeout(transitionTimer);
      currentStep = targetStep;
      updateNavigation();
      if (targetStep === previousStep || !outgoing) {
        steps.forEach((section, index) => {
          section.hidden = index !== currentStep;
          section.classList.toggle("is-current", index === currentStep);
          section.classList.remove("is-entering", "is-leaving");
        });
        requestAnimationFrame(() => incoming.querySelector("h1")?.focus({ preventScroll: true }));
        return;
      }
      const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      form.dataset.stepDirection = targetStep > previousStep ? "forward" : "backward";
      outgoing.classList.remove("is-current", "is-entering");
      incoming.hidden = false;
      incoming.classList.remove("is-leaving");
      incoming.classList.add("is-current");
      if (reducedMotion) {
        outgoing.hidden = true;
        incoming.classList.remove("is-entering");
        requestAnimationFrame(() => incoming.querySelector("h1")?.focus({ preventScroll: true }));
        return;
      }
      form.dataset.transitioning = "true";
      outgoing.classList.add("is-leaving");
      incoming.classList.add("is-entering");
      [back, next, submit].forEach((button) => { if (button) button.disabled = true; });
      transitionTimer = window.setTimeout(() => {
        outgoing.hidden = true;
        outgoing.classList.remove("is-leaving");
        incoming.classList.remove("is-entering");
        delete form.dataset.transitioning;
        [back, next, submit].forEach((button) => { if (button) button.disabled = false; });
        updateNavigation();
        incoming.querySelector("h1")?.focus({ preventScroll: true });
      }, 320);
    };
    next?.addEventListener("click", () => {
      if (currentStep === 4) {
        if (runtimeReady && projectDestination) location.assign(projectDestination);
        return;
      }
      if (!validate(currentStep)) return;
      updateReview();
      showStep(currentStep + 1);
    });
    back?.addEventListener("click", () => showStep(currentStep - 1));
    const closeIntentPicker = (restoreFocus = false) => {
      if (!intentPicker || !intentTrigger) return;
      intentPicker.classList.remove("is-open");
      intentTrigger.setAttribute("aria-expanded", "false");
      if (restoreFocus) intentTrigger.focus();
    };
    const openIntentPicker = () => {
      if (!intentPicker || !intentTrigger) return;
      intentPicker.classList.add("is-open");
      intentTrigger.setAttribute("aria-expanded", "true");
    };
    const selectIntent = (option) => {
      if (!option) return;
      intentOptions.forEach((candidate) => candidate.setAttribute("aria-selected", candidate === option ? "true" : "false"));
      if (intentInput) intentInput.value = option.dataset.onboardingIntentOption || "open";
      if (intentCurrent) intentCurrent.textContent = option.dataset.intentLabel || L("我想");
      if (outcomeInput && option.dataset.placeholder) outcomeInput.placeholder = option.dataset.placeholder;
      closeIntentPicker(true);
    };
    intentTrigger?.addEventListener("click", () => {
      const shouldOpen = intentTrigger.getAttribute("aria-expanded") !== "true";
      if (shouldOpen) openIntentPicker();
      else closeIntentPicker();
    });
    intentTrigger?.addEventListener("keydown", (event) => {
      if (!intentOptions.length || !["ArrowDown", "ArrowUp"].includes(event.key)) return;
      event.preventDefault();
      openIntentPicker();
      const selectedIndex = Math.max(0, intentOptions.findIndex((option) => option.getAttribute("aria-selected") === "true"));
      intentOptions[event.key === "ArrowUp" ? Math.max(0, selectedIndex - 1) : Math.min(intentOptions.length - 1, selectedIndex + 1)]?.focus();
    });
    intentOptions.forEach((option, optionIndex) => {
      option.addEventListener("click", () => selectIntent(option));
      option.addEventListener("keydown", (event) => {
        if (["Enter", " "].includes(event.key)) {
          event.preventDefault();
          selectIntent(option);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          closeIntentPicker(true);
          return;
        }
        if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
        event.preventDefault();
        const offset = event.key === "ArrowDown" ? 1 : -1;
        intentOptions[(optionIndex + offset + intentOptions.length) % intentOptions.length]?.focus();
      });
    });
    document.addEventListener("pointerdown", (event) => {
      if (intentPicker && !intentPicker.contains(event.target)) closeIntentPicker();
    });
    form.addEventListener("keydown", (event) => {
      if (event.target.closest?.("[data-onboarding-intent]")) return;
      if (event.key !== "Enter" || event.shiftKey || event.target instanceof HTMLTextAreaElement) return;
      if (form.dataset.transitioning === "true") return;
      if (currentStep >= 3) return;
      event.preventDefault();
      next?.click();
    });
    const setRuntimeStatus = (message, state = "busy") => {
      if (!runtimeStatus) return;
      runtimeStatus.textContent = message || "";
      runtimeStatus.dataset.state = state;
    };
    const sendRuntimeBootstrap = () => {
      if (!runtimeBootstrap || !runtimeFrame?.contentWindow) return;
      runtimeFrame.contentWindow.postMessage({ type: "goalboard:onboarding-runtime-bootstrap", ...runtimeBootstrap }, location.origin);
    };
    runtimeFrame?.addEventListener("load", () => {
      setRuntimeStatus(L("正在把项目上下文交给 Runtime…"), "busy");
      sendRuntimeBootstrap();
    });
    window.addEventListener("message", (event) => {
      if (event.origin !== location.origin || event.source !== runtimeFrame?.contentWindow) return;
      if (!runtimeBootstrap || event.data?.goalId !== runtimeBootstrap.goalId) return;
      if (event.data?.type === "goalboard:onboarding-runtime-ready") {
        runtimeReady = true;
        setRuntimeStatus(L("提示已经填好。和 Runtime 把项目安排清楚后，再进入 GoalBoard。"), "ready");
        if (runtimeRetry) runtimeRetry.hidden = true;
        updateNavigation();
      }
      if (event.data?.type === "goalboard:onboarding-runtime-waiting") {
        runtimeReady = false;
        setRuntimeStatus(L("先在 Runtime 里完成启动确认；之后会自动填入项目提示。"), "busy");
        if (runtimeRetry) runtimeRetry.hidden = true;
        updateNavigation();
      }
      if (event.data?.type === "goalboard:onboarding-runtime-error") {
        runtimeReady = false;
        setRuntimeStatus(event.data.message || L("Runtime 没有成功打开。"), "error");
        if (runtimeRetry) runtimeRetry.hidden = false;
        updateNavigation();
      }
    });
    runtimeRetry?.addEventListener("click", () => {
      if (!runtimeFrame?.src) return;
      runtimeReady = false;
      runtimeRetry.hidden = true;
      setRuntimeStatus(L("正在重新打开 Runtime…"), "busy");
      updateNavigation();
      runtimeFrame.contentWindow?.location.reload();
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!validate(3)) return;
      const data = values();
      setGlobalError("");
      submit.disabled = true;
      if (submitLabel) submitLabel.textContent = L("正在建立…");
      try {
        const response = await fetch("/api/onboarding/initialize", {
          method: "POST",
          headers: globalThis.goalboardControlHeaders(),
          body: JSON.stringify({
            project_name: data.projectName,
            outcome: data.outcome,
            intent_frame: data.intentFrame,
            workspace_path: data.workspacePath || null,
            runtime_kind: data.runtimeKind || null,
            user_confirmed: true,
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || L("项目初始化失败"));
        if (data.runtimeKind && payload.goal_id) {
          sessionStorage.setItem("goalboard-onboarding-runtime-autofill:" + payload.goal_id, JSON.stringify({
            runtimeKind: data.runtimeKind,
            workspacePath: data.workspacePath,
            at: Date.now(),
          }));
        }
        const destination = new URL(payload.goal_path || payload.project_path || "/", location.origin);
        destination.searchParams.set("onboarding", "1");
        if (document.body.hasAttribute("data-native-desktop")) destination.searchParams.set("desktop", "1");
        projectDestination = destination.pathname + destination.search + destination.hash;
        if (!data.runtimeKind || !payload.goal_id) {
          location.assign(projectDestination);
          return;
        }
        const embeddedDestination = new URL(payload.goal_path || payload.project_path || "/", location.origin);
        embeddedDestination.searchParams.set("onboarding", "1");
        embeddedDestination.searchParams.set("onboarding-runtime", "1");
        embeddedDestination.searchParams.set("onboarding-embed", "1");
        runtimeBootstrap = {
          goalId: payload.goal_id,
          runtimeKind: data.runtimeKind,
          workspacePath: data.workspacePath,
        };
        runtimeReady = false;
        setRuntimeStatus(L("正在打开 Runtime…"), "busy");
        if (runtimeRetry) runtimeRetry.hidden = true;
        showStep(4);
        if (runtimeFrame) runtimeFrame.src = embeddedDestination.pathname + embeddedDestination.search + embeddedDestination.hash;
      } catch (error) {
        setGlobalError(error instanceof Error ? error.message : String(error));
        submit.disabled = false;
        if (submitLabel) submitLabel.textContent = L("创建项目");
      }
    });
    showStep(0);
  })();
`;

const PROJECT_INDEX_CLIENT_SCRIPT = `
  (() => {
    const projectSearch = document.querySelector("[data-project-search]");
    const projectSearchEmpty = document.querySelector("[data-project-search-empty]");
    projectSearch?.addEventListener("input", () => {
      const query = projectSearch.value.trim().toLocaleLowerCase();
      const rows = [...document.querySelectorAll("[data-project-search-row]")];
      let visible = 0;
      rows.forEach((row) => {
        row.hidden = Boolean(query) && !String(row.dataset.projectSearchRow || "").includes(query);
        if (!row.hidden) visible += 1;
      });
      if (projectSearchEmpty) projectSearchEmpty.hidden = visible > 0;
    });
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
        location.assign(globalThis.goalboardNavigationUrl(result.project_path));
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
  body.settings-page[data-desktop-shell="true"] .project-context strong { display: block; }
  body.settings-page[data-desktop-shell="true"] .project-context small { display: none; }
  .settings-shell { height: calc(100dvh - 58px); min-width: 0; overflow: hidden; display: grid; grid-template-columns: 232px minmax(0, 1fr); }
  .settings-shell--standalone { grid-template-columns: minmax(0, 1fr); }
  .settings-shell--standalone .settings-document { margin-inline: auto; }
  .settings-navigation { min-height: 0; overflow-y: auto; padding: 18px 10px; border-right: 1px solid var(--line-strong); background: var(--rail); display: flex; flex-direction: column; gap: 3px; }
  .settings-nav-group { min-width: 0; display: grid; gap: 3px; }
  .settings-nav-group + .settings-nav-group { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--line); }
  .settings-nav-label { min-width: 0; padding: 0 10px 5px; display: grid; gap: 2px; color: var(--faint); }
  .settings-nav-label > span { font-size: 10px; font-weight: 750; letter-spacing: .07em; text-transform: uppercase; }
  .settings-nav-label > small { overflow: hidden; color: var(--muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .settings-navigation a { min-height: 50px; padding: 7px 10px; border-radius: 5px; color: var(--ink-soft); display: grid; grid-template-columns: 22px minmax(0, 1fr); align-items: center; gap: 9px; text-decoration: none; }
  .settings-navigation a:hover { background: color-mix(in srgb, var(--blue-soft) 46%, var(--rail)); }
  .settings-navigation a[aria-current=page] { color: var(--blue-dark); background: color-mix(in srgb, var(--blue-soft) 76%, var(--rail)); box-shadow: inset 2px 0 0 var(--blue); }
  .settings-navigation a > svg { font-size: 17px; }
  .settings-navigation a > span { min-width: 0; display: grid; }
  .settings-navigation strong { font-size: 13px; }
  .settings-navigation small { color: var(--muted); font-size: 11px; }
  .project-settings-back { min-height: 38px !important; margin-bottom: 12px; color: var(--muted) !important; }
  .project-settings-back svg { transform: rotate(180deg); }
  .project-settings-navigation .settings-nav-label { padding-top: 4px; }
  .settings-content { min-width: 0; min-height: 0; overflow: auto; background: var(--paper); }
  .settings-document { width: min(100%, 980px); min-height: 100%; padding: 38px 42px 80px; }
  .settings-heading { max-width: 72ch; padding-bottom: 25px; border-bottom: 1px solid var(--line-strong); }
  .settings-heading h1 { margin: 0; font-size: clamp(24px, 2.1vw, 30px); line-height: 1.25; letter-spacing: -.03em; }
  .settings-heading p { margin: 8px 0 0; color: var(--muted); }
  .appearance-settings { border-bottom: 1px solid var(--line-strong); }
  .preference-section { padding: 25px 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: minmax(190px, .72fr) minmax(360px, 1.28fr); align-items: start; gap: 28px; }
  .preference-section:last-child { border-bottom: 0; }
  .preference-copy h2 { margin: 0; font-size: 16px; letter-spacing: -.015em; }
  .preference-copy p { max-width: 48ch; margin: 5px 0 0; color: var(--muted); font-size: 12px; line-height: 1.55; }
  .preference-options { min-width: 0; display: grid; gap: 8px; }
  .preference-options--density { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .preference-options--language { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .preference-options--theme { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .preference-option {
    position: relative;
    min-width: 0;
    min-height: 84px;
    padding: 12px;
    border: 1px solid var(--line-strong);
    border-radius: 7px;
    background: var(--paper);
    color: var(--ink-soft);
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) 16px;
    align-items: center;
    gap: 11px;
    text-align: left;
    cursor: pointer;
    text-decoration: none;
  }
  .preference-option:hover { border-color: color-mix(in srgb, var(--blue) 44%, var(--line-strong)); background: color-mix(in srgb, var(--blue-soft) 30%, var(--paper)); }
  .preference-option[aria-pressed="true"] { border-color: color-mix(in srgb, var(--blue) 58%, var(--line-strong)); color: var(--blue-dark); background: var(--blue-soft); }
  .preference-option[aria-current="true"] { border-color: color-mix(in srgb, var(--blue) 58%, var(--line-strong)); color: var(--blue-dark); background: var(--blue-soft); }
  .preference-option > span:nth-child(2) { min-width: 0; display: grid; gap: 3px; }
  .preference-option strong { color: var(--ink); font-size: 13px; font-weight: 680; }
  .preference-option small { color: var(--muted); font-size: 10px; line-height: 1.4; }
  .preference-option > svg { width: 16px; height: 16px; }
  .preference-option .preference-check { opacity: 0; color: var(--blue-dark); }
  .preference-option[aria-pressed="true"] .preference-check { opacity: 1; }
  .preference-option[aria-current="true"] .preference-check { opacity: 1; }
  .language-preview { width: 54px; height: 42px; border: 1px solid var(--line); border-radius: 5px; background: var(--rail); color: var(--ink); display: grid; place-items: center; font-size: 12px; font-weight: 700; }
  .density-preview {
    width: 54px;
    height: 42px;
    padding: 5px;
    border: 1px solid var(--line);
    border-radius: 5px;
    background: var(--rail);
    display: grid;
    grid-template-columns: 14px minmax(0, 1fr);
    gap: 4px;
  }
  .density-preview > i { border-right: 1px solid var(--line-strong); }
  .density-preview > span { display: flex; flex-direction: column; justify-content: center; gap: 4px; }
  .density-preview > span > i { height: 2px; border-radius: 1px; background: var(--muted); opacity: .72; }
  .density-preview > span > i:nth-child(2) { width: 82%; }
  .density-preview > span > i:nth-child(3) { width: 68%; }
  .density-preview--compact > span { gap: 2px; }
  .density-preview--compact > span > i { height: 1px; }
  .preference-note { max-width: 72ch; margin: 18px 0 0; color: var(--muted); font-size: 12px; line-height: 1.55; }
  .settings-record-list { border-bottom: 1px solid var(--line-strong); }
  .settings-record { border-bottom: 1px solid var(--line); }
  .settings-record:last-child { border-bottom: 0; }
  .settings-record > header { min-height: 92px; padding: 19px 0; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
  .settings-record-title { min-width: 0; display: flex; align-items: flex-start; gap: 12px; }
  .settings-record-title .record-icon { width: 34px; height: 34px; flex: 0 0 34px; border: 1px solid var(--line); border-radius: 6px; display: grid; place-items: center; color: var(--blue-dark); background: var(--rail); }
  .settings-record-title h2, .settings-record-title h3 { margin: 0; font-size: 16px; letter-spacing: -.015em; }
  .settings-record-title p { margin: 3px 0 0; color: var(--muted); font-size: 12px; }
  .settings-record-action { flex: 0 0 auto; display: flex; align-items: center; gap: 12px; }
  .settings-record-action button, .settings-button, .settings-action-section button, .settings-import-row button, .project-record-tools form button { min-height: 34px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 4px; color: var(--blue-dark); background: var(--paper); font-weight: 650; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
  .settings-record-action button:hover, .settings-button:hover, .settings-action-section button:hover, .settings-import-row button:hover, .project-record-tools form button:hover { border-color: color-mix(in srgb, var(--blue) 44%, var(--line-strong)); background: var(--blue-soft); }
  .settings-record-action button:disabled { color: var(--faint); background: var(--rail); cursor: not-allowed; }
  .settings-state { display: inline-flex; align-items: center; white-space: nowrap; font-size: 12px; font-weight: 650; }
  .settings-state--success { color: var(--green); }
  .settings-state--warning { color: var(--amber); }
  .settings-state--danger { color: var(--red); }
  .settings-state--neutral { color: var(--muted); }
  .settings-paths { margin: 0; padding: 0 0 18px 46px; display: grid; gap: 5px; }
  .settings-paths > div { min-width: 0; display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 9px; }
  .settings-paths dt, .project-db-details dt, .diagnostics-summary dt, .runtime-plan-meta dt { color: var(--muted); font-size: 11px; font-weight: 650; }
  .settings-paths dd, .project-db-details dd, .diagnostics-summary dd, .runtime-plan-meta dd { min-width: 0; margin: 0; overflow-wrap: anywhere; color: var(--ink-soft); font-size: 12px; }
  .settings-footnote { max-width: 72ch; margin: 20px 0 0; color: var(--muted); font-size: 12px; }
  .settings-footnote code { padding: 1px 4px; border: 1px solid var(--line); border-radius: 3px; color: var(--ink-soft); background: var(--rail); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .settings-empty { padding: 34px 0 38px; color: var(--muted); }
  .settings-empty h2 { margin: 0; color: var(--ink); font-size: 16px; }
  .settings-empty p { margin: 5px 0 0; }
  .settings-action-section, .settings-import-row { padding: 24px 0; border-bottom: 1px solid var(--line-strong); display: grid; grid-template-columns: minmax(220px, .8fr) minmax(320px, 1.2fr); gap: 30px; align-items: start; }
  .settings-action-section h2, .settings-import-row h2, .launcher-section h2, .diagnostics-summary h2 { margin: 0; font-size: 16px; }
  .settings-action-section > div > p, .settings-import-row > div > p { margin: 5px 0 0; color: var(--muted); font-size: 12px; }
  .inline-settings-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: end; }
  .inline-settings-form > label:first-child { min-width: 0; display: grid; gap: 5px; color: var(--ink-soft); font-size: 12px; font-weight: 650; }
  .inline-settings-form input[type=text], .project-record-tools input { width: 100%; min-height: 36px; padding: 0 10px; border: 1px solid var(--line-strong); border-radius: 4px; color: var(--ink); background: var(--paper); }
  .inline-settings-form .inline-confirm { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; cursor: pointer; }
  .inline-settings-form .settings-form-error { grid-column: 1 / -1; }
  .settings-form-error { margin: 0; color: var(--red); font-size: 12px; }
  .project-record-tools { margin: -8px 0 16px 46px; display: flex; gap: 8px; }
  .project-record-tools details { min-width: min(100%, 280px); }
  .project-record-tools summary { min-height: 32px; padding: 0 7px; display: inline-flex; align-items: center; gap: 7px; color: var(--muted); font-size: 12px; font-weight: 650; cursor: pointer; list-style: none; }
  .project-record-tools summary::-webkit-details-marker { display: none; }
  .project-record-tools summary svg:last-child { font-size: 11px; }
  .project-record-tools details[open] summary svg:last-child { transform: rotate(180deg); }
  .project-record-tools form, .project-db-details { width: min(100%, 440px); margin: 5px 0 0; padding: 13px; border: 1px solid var(--line); background: var(--rail); }
  .project-record-tools form { display: grid; gap: 9px; }
  .project-record-tools form label { display: grid; gap: 5px; color: var(--ink-soft); font-size: 12px; font-weight: 650; }
  .project-record-tools form button { justify-self: end; }
  .project-db-details { display: grid; gap: 7px; }
  .project-db-details > div { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 8px; }
  .connection-settings-section { margin-top: 30px; padding-top: 28px; border-top: 1px solid var(--line-strong); }
  .connection-settings-heading { max-width: 72ch; margin-bottom: 8px; }
  .connection-settings-heading h2 { margin: 0; font-size: 18px; letter-spacing: -.02em; }
  .connection-settings-heading p { margin: 6px 0 0; color: var(--muted); font-size: 12px; }
  .connection-record-list { border-bottom: 1px solid var(--line-strong); }
  .connection-record .settings-record-title p strong { color: var(--ink-soft); }
  .connection-record-tools { margin: -6px 0 17px 46px; display: flex; align-items: flex-start; gap: 10px; }
  .connection-record-tools details { min-width: min(100%, 300px); }
  .connection-record-tools summary { min-height: 32px; padding: 0 7px; display: inline-flex; align-items: center; gap: 7px; color: var(--muted); font-size: 12px; font-weight: 650; cursor: pointer; list-style: none; }
  .connection-record-tools summary::-webkit-details-marker { display: none; }
  .connection-record-tools summary svg:last-child { font-size: 11px; }
  .connection-record-tools details[open] summary svg:last-child { transform: rotate(180deg); }
  .connection-action-form { width: min(100%, 460px); margin-top: 5px; padding: 13px; border: 1px solid var(--line); background: var(--rail); display: grid; gap: 10px; }
  .connection-action-form > label:not(.inline-confirm) { display: grid; gap: 5px; color: var(--ink-soft); font-size: 12px; font-weight: 650; }
  .connection-action-form select { width: 100%; min-height: 36px; padding: 0 9px; border: 1px solid var(--line-strong); border-radius: 4px; color: var(--ink); background: var(--paper); }
  .connection-action-form .inline-confirm { display: flex; align-items: flex-start; gap: 8px; color: var(--muted); font-size: 12px; cursor: pointer; }
  .connection-action-form .inline-confirm input { margin-top: 2px; }
  .connection-action-form > button { min-height: 34px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 4px; justify-self: end; color: var(--blue-dark); background: var(--paper); font-weight: 650; cursor: pointer; }
  .connection-action-form--danger > button { color: var(--red); }
  .workspace-project-list { list-style: none; margin: -4px 0 12px 46px; padding: 0; width: min(100%, 620px); border-top: 1px solid var(--line); }
  .workspace-project-list li { min-height: 46px; padding: 7px 0; border-bottom: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .workspace-project-list li > span { display: flex; align-items: center; gap: 9px; }
  .workspace-project-list form { display: flex; align-items: center; gap: 8px; }
  .workspace-project-list form button { min-height: 30px; padding: 0 9px; border: 1px solid var(--line-strong); border-radius: 4px; color: var(--red); background: var(--paper); cursor: pointer; }
  .workspace-project-list .settings-form-error { flex-basis: 100%; }
  .settings-import-row { border-top: 1px solid var(--line-strong); margin-top: 24px; }
  .settings-import-row > button { justify-self: end; }
  .diagnostics-summary { padding: 25px 0; border-bottom: 1px solid var(--line-strong); }
  .diagnostics-summary > div:first-child { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
  .diagnostics-summary dl { margin: 19px 0 0; display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid var(--line); }
  .diagnostics-summary dl > div { min-width: 0; padding: 12px 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 10px; }
  .diagnostics-summary dl > div:nth-child(odd) { padding-right: 22px; }
  .launcher-section { padding: 25px 0 0; }
  .launcher-section ul { list-style: none; margin: 14px 0 0; padding: 0; border-top: 1px solid var(--line); }
  .launcher-section li { min-height: 60px; padding: 10px 0; border-bottom: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: 18px; }
  .launcher-section li > span:first-child { min-width: 0; display: grid; grid-template-columns: 22px 50px minmax(0, 1fr); align-items: center; gap: 8px; }
  .launcher-section li small { min-width: 0; overflow-wrap: anywhere; color: var(--muted); }
  .service-action-row { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px; }
  .service-action-row button { min-height: 34px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 4px; color: var(--blue-dark); background: var(--paper); font-weight: 650; cursor: pointer; }
  .runtime-plan-dialog { width: min(680px, calc(100vw - 28px)); max-height: min(760px, calc(100dvh - 28px)); padding: 0; border: 1px solid var(--line-strong); border-radius: 8px; color: var(--ink); background: var(--paper); box-shadow: var(--shadow); }
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
  .runtime-plan-confirm { margin-top: 18px; padding: 12px; border: 1px solid color-mix(in srgb, var(--blue) 36%, var(--line)); background: var(--blue-soft); display: flex; align-items: flex-start; gap: 9px; cursor: pointer; }
  .runtime-plan-confirm input { width: 16px; height: 16px; margin: 2px 0 0; accent-color: var(--blue); }
  .runtime-plan-shell > footer { padding: 14px 24px; border-top: 1px solid var(--line); background: var(--rail); display: flex; justify-content: flex-end; gap: 9px; }
  .runtime-plan-shell > footer button { min-height: 34px; padding: 0 13px; border: 1px solid var(--line-strong); border-radius: 4px; color: var(--ink); background: var(--paper); cursor: pointer; }
  .runtime-plan-shell > footer .runtime-plan-apply { border-color: var(--action); color: var(--action-ink); background: var(--action); font-weight: 650; }
  .runtime-plan-shell > footer .runtime-plan-apply:disabled { opacity: .55; cursor: not-allowed; }
  .settings-page .toast { position: fixed; right: 22px; bottom: 22px; z-index: 30; }
  @media (max-width: 760px) {
    .settings-page > .topbar { height: 52px; }
    .settings-page .top-action { margin-right: 8px; padding-inline: 8px; }
    .settings-page .top-action span { display: none; }
    .settings-page .project-context small { display: none; }
    .settings-shell { height: calc(100dvh - 52px); grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
    .settings-navigation { overflow-x: auto; overflow-y: hidden; padding: 6px 8px; border-right: 0; border-bottom: 1px solid var(--line-strong); flex-direction: row; }
    .settings-desktop-project,
    .settings-desktop-heading,
    .settings-navigation > .personal-sidebar-footer { display: none !important; }
    .settings-nav-body { display: contents; }
    .settings-nav-group { display: contents; }
    .settings-nav-label { display: none; }
    .settings-navigation a { min-width: max-content; min-height: 40px; grid-template-columns: 18px auto; }
    .settings-navigation small { display: none; }
    .settings-document { padding: 25px 18px 60px; }
    .preference-section { grid-template-columns: 1fr; gap: 14px; }
    .preference-options--theme { grid-template-columns: 1fr; }
    .preference-options--language { grid-template-columns: 1fr; }
    .preference-option { min-height: 72px; }
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
  @media (max-width: 520px) {
    .preference-options--density { grid-template-columns: 1fr; }
  }
`;

const PROJECT_GUIDANCE_SETTINGS_STYLES = `
  .project-guidance-page .settings-content { max-width: none; }
  .guidance-document { width: min(100%, 1100px); margin: 0 auto; padding: 38px 42px 64px; }
  .guidance-page-header { padding-bottom: 28px; border-bottom: 1px solid var(--line-strong); display: flex; align-items: flex-end; justify-content: space-between; gap: 28px; }
  .guidance-page-header h1 { margin: 0; color: var(--ink); font-size: 30px; letter-spacing: -.026em; }
  .guidance-page-header p { max-width: 68ch; margin: 9px 0 0; color: var(--muted); font-size: 13px; line-height: 1.65; }
  .guidance-primary-action, .guidance-secondary-action { min-height: 36px; padding: 0 13px; border: 1px solid var(--line-strong); border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; color: var(--ink-soft); background: var(--paper); font: inherit; font-size: 11px; font-weight: 700; white-space: nowrap; cursor: pointer; }
  .guidance-primary-action { border-color: var(--action); color: var(--action-ink); background: var(--action); }
  .guidance-primary-action:hover { background: color-mix(in srgb, var(--action) 90%, var(--action-ink)); }
  .guidance-secondary-action:hover { border-color: var(--blue); color: var(--blue-dark); }
  .guidance-primary-action:focus-visible, .guidance-secondary-action:focus-visible, .guidance-text-action:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
  .guidance-layout { display: grid; grid-template-columns: minmax(0, 1fr) 250px; gap: 56px; align-items: start; }
  .guidance-editor { margin: 28px 0 4px; padding: 22px 24px; border: 1px solid color-mix(in srgb, var(--blue) 32%, var(--line)); border-radius: 14px; background: color-mix(in srgb, var(--blue-soft) 24%, var(--paper)); box-shadow: 0 12px 32px rgba(38, 61, 87, .08); animation: guidance-editor-reveal .22s cubic-bezier(.16, 1, .3, 1); }
  .guidance-editor[hidden] { display: none; }
  .guidance-editor > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
  .guidance-editor h2 { margin: 0; font-size: 17px; letter-spacing: -.015em; }
  .guidance-editor header p { margin: 5px 0 0; color: var(--muted); font-size: 11px; line-height: 1.5; }
  .guidance-editor form { margin-top: 18px; display: grid; gap: 15px; }
  .guidance-editor-fields { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 14px; }
  .guidance-editor-fields[hidden] { display: none; }
  .guidance-editor label { min-width: 0; display: grid; gap: 6px; color: var(--ink-soft); font-size: 11px; font-weight: 680; }
  .guidance-editor select, .guidance-editor textarea { width: 100%; border: 1px solid var(--line-strong); border-radius: 8px; color: var(--ink); background: var(--paper); font: inherit; }
  .guidance-editor select { min-height: 39px; padding: 0 10px; }
  .guidance-editor textarea { min-height: 86px; padding: 10px 11px; resize: vertical; line-height: 1.6; }
  .guidance-editor textarea[name=reason] { min-height: 66px; }
  .guidance-editor select:focus, .guidance-editor textarea:focus { border-color: var(--blue); outline: 2px solid color-mix(in srgb, var(--blue), transparent 80%); outline-offset: 1px; }
  .guidance-editor-preview { margin: 0; padding: 13px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); color: var(--ink-soft); font-size: 13px; line-height: 1.65; white-space: pre-wrap; }
  .guidance-editor-preview[hidden] { display: none; }
  .guidance-editor-error { margin: 0; padding: 10px 12px; border-radius: 8px; color: var(--red); background: var(--red-soft); font-size: 11px; }
  .guidance-editor footer { display: flex; justify-content: flex-end; gap: 9px; }
  .guidance-content { min-width: 0; }
  .guidance-empty { padding: 72px 20px; border-bottom: 1px solid var(--line); text-align: center; }
  .guidance-empty svg { width: 28px; height: 28px; color: var(--blue-dark); }
  .guidance-empty h2 { margin: 15px 0 0; font-size: 18px; }
  .guidance-empty p { max-width: 56ch; margin: 8px auto 18px; color: var(--muted); font-size: 12px; line-height: 1.65; }
  .guidance-section { padding: 31px 0 28px; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 142px minmax(0, 1fr); gap: 28px; }
  .guidance-section-heading { align-self: start; position: sticky; top: 18px; }
  .guidance-section-heading h2 { margin: 0; color: var(--ink); font-size: 13px; }
  .guidance-section-heading p { margin: 5px 0 0; color: var(--faint); font-size: 10px; line-height: 1.5; }
  .guidance-entry-list { min-width: 0; display: grid; }
  .guidance-entry { min-width: 0; padding: 0 0 24px; }
  .guidance-entry + .guidance-entry { padding-top: 24px; border-top: 1px solid var(--line); }
  .guidance-entry:last-child { padding-bottom: 0; }
  .guidance-entry p { max-width: 72ch; margin: 0; color: var(--ink-soft); font-size: 14px; line-height: 1.78; white-space: pre-wrap; overflow-wrap: anywhere; }
  .guidance-entry footer { margin-top: 11px; display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .guidance-entry-meta { color: var(--faint); font-size: 9px; font-variant-numeric: tabular-nums; }
  .guidance-entry-actions { display: flex; gap: 12px; }
  .guidance-text-action { padding: 2px 0; border: 0; color: var(--muted); background: transparent; font: inherit; font-size: 10px; font-weight: 680; text-underline-offset: 3px; cursor: pointer; }
  .guidance-text-action:hover { color: var(--blue-dark); text-decoration: underline; }
  .guidance-text-action--danger:hover { color: var(--red); }
  .guidance-aside { padding-top: 31px; position: sticky; top: 0; }
  .guidance-aside section { padding: 17px 0; border-top: 1px solid var(--line-strong); }
  .guidance-aside h2 { margin: 0; font-size: 12px; }
  .guidance-aside p { margin: 7px 0 0; color: var(--muted); font-size: 11px; line-height: 1.6; }
  .guidance-aside dl { margin: 13px 0 0; display: grid; gap: 8px; }
  .guidance-aside dl div { display: flex; justify-content: space-between; gap: 12px; }
  .guidance-aside dt, .guidance-aside dd { margin: 0; font-size: 10px; }
  .guidance-aside dt { color: var(--muted); }
  .guidance-aside dd { color: var(--ink); font-weight: 700; font-variant-numeric: tabular-nums; }
  .guidance-inactive-list { margin: 12px 0 0; padding: 0; list-style: none; display: grid; gap: 12px; }
  .guidance-inactive-list li { padding-top: 11px; border-top: 1px solid var(--line); }
  .guidance-inactive-list p { margin: 0; display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
  .guidance-inactive-list button { margin-top: 7px; }
  .guidance-history { margin-top: 40px; border-top: 1px solid var(--line-strong); }
  .guidance-history > summary { min-height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 16px; color: var(--ink); font-size: 13px; font-weight: 720; cursor: pointer; list-style: none; }
  .guidance-history > summary::-webkit-details-marker { display: none; }
  .guidance-history > summary span { color: var(--muted); font-size: 10px; font-weight: 500; }
  .guidance-history-list { border-top: 1px solid var(--line); }
  .guidance-history-row { padding: 15px 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 88px minmax(0, 1fr) auto; gap: 16px; }
  .guidance-history-row strong { font-size: 10px; }
  .guidance-history-row p { margin: 3px 0 0; color: var(--ink-soft); font-size: 11px; line-height: 1.55; white-space: pre-wrap; }
  .guidance-history-row time { color: var(--faint); font-size: 9px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .guidance-history-state { margin-top: 3px; color: var(--blue-dark); font-size: 9px; font-weight: 750; }
  .guidance-history-state--inactive { color: var(--muted); }
  .guidance-history-entry { margin-top: 9px; padding-top: 9px; border-top: 1px solid var(--line); }
  .guidance-history-entry > summary { min-height: 30px; color: var(--blue-dark); display: inline-flex; align-items: center; font-size: 10px; font-weight: 700; text-underline-offset: 3px; cursor: pointer; }
  .guidance-history-entry > summary:hover { text-decoration: underline; }
  .guidance-history-entry[open] > summary { margin-bottom: 10px; }
  .guidance-history-full { display: grid; gap: 11px; }
  .guidance-history-full > div { display: grid; gap: 4px; }
  .guidance-history-full dt { color: var(--faint); font-size: 9px; font-weight: 700; }
  .guidance-history-full dd { margin: 0; color: var(--ink-soft); font-size: 10px; line-height: 1.6; overflow-wrap: anywhere; white-space: pre-wrap; }
  @keyframes guidance-editor-reveal {
    from { opacity: .4; transform: translateY(-6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @media (max-width: 1180px) {
    .guidance-layout { grid-template-columns: minmax(0, 1fr); gap: 12px; }
    .guidance-aside { position: static; padding-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
  }
  @media (max-width: 760px) {
    .guidance-document { padding: 25px 18px 48px; }
    .guidance-page-header { align-items: stretch; flex-direction: column; gap: 18px; }
    .guidance-page-header h1 { font-size: 26px; }
    .guidance-primary-action { align-self: flex-start; }
    .guidance-editor { margin-top: 20px; padding: 18px; }
    .guidance-editor-fields { grid-template-columns: 1fr; }
    .guidance-editor select, .guidance-editor textarea { font-size: 16px; }
    .guidance-section { grid-template-columns: 1fr; gap: 15px; }
    .guidance-section-heading { position: static; }
    .guidance-aside { grid-template-columns: 1fr; gap: 0; }
    .guidance-text-action { min-height: 44px; padding: 0 6px; display: inline-flex; align-items: center; justify-content: center; }
    .guidance-entry-actions { gap: 2px; }
    .guidance-inactive-list button { margin-top: 2px; }
    .guidance-history-entry > summary { min-height: 44px; }
    .guidance-history-row { grid-template-columns: 76px minmax(0, 1fr); }
    .guidance-history-row time { grid-column: 2; }
  }
`;

const PROJECT_RULES_SETTINGS_STYLES = `
  .project-rules-page .settings-document { width: min(100%, 900px); }
  .project-rules-receipt { margin: 20px 0 0; padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--green), var(--line) 65%); border-radius: 5px; background: var(--green-soft); display: grid; gap: 2px; }
  .project-rules-receipt strong { color: var(--green); font-size: 12px; }
  .project-rules-receipt span { color: var(--muted); font-size: 12px; line-height: 1.5; }
  .project-rules-receipt:focus-visible { outline: 2px solid var(--green); outline-offset: 2px; }
  .project-rules-intro { margin: 24px 0 20px; padding: 16px 18px; border: 1px solid var(--line); border-radius: 6px; background: var(--rail); }
  .project-rules-intro h2 { margin: 0; font-size: 15px; }
  .project-rules-intro p { max-width: 70ch; margin: 5px 0 0; color: var(--muted); font-size: 12px; }
  .project-rules-intro ol { margin: 14px 0 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; }
  .project-rules-intro li { min-width: 0; padding: 11px 12px; border: 1px solid var(--line); border-radius: 5px; background: var(--paper); display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 8px; }
  .project-rules-intro li > span:first-child { width: 22px; height: 22px; border-radius: 50%; color: var(--blue-dark); background: var(--blue-soft); display: grid; place-items: center; font-size: 10px; font-weight: 750; }
  .project-rules-intro li > span:last-child { min-width: 0; display: grid; }
  .project-rules-intro li strong { font-size: 12px; }
  .project-rules-intro li small { color: var(--muted); font-size: 10px; overflow-wrap: anywhere; }
  .project-rules-page .policy-source { margin-bottom: 18px; }
  .project-rules-page .policy-source-title small { display: none; }
  .project-rules-page .settings-footnote { margin-top: 16px; }
  @media (max-width: 760px) {
    .project-rules-intro ol { grid-template-columns: 1fr; }
    .project-rules-page .policy-source-state { min-width: 0; }
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
        location.assign(globalThis.goalboardNavigationUrl(result.project_path));
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

const PROJECT_RULES_CLIENT_SCRIPT = `
  (() => {
    const form = document.querySelector("[data-policy-form]");
    if (!form) return;
    const routePrefix = document.body.dataset.routePrefix || "";
    const receiptKey = "goalboard-project-rules-receipt:" + routePrefix;
    const receipt = document.querySelector("[data-project-rules-receipt]");
    const errorBox = form.querySelector("[data-policy-error]");
    const submit = form.querySelector('button[type="submit"]');
    try {
      const savedReceipt = JSON.parse(sessionStorage.getItem(receiptKey) || "null");
      sessionStorage.removeItem(receiptKey);
      if (receipt && savedReceipt?.title && savedReceipt?.detail) {
        receipt.querySelector("[data-project-rules-receipt-title]").textContent = savedReceipt.title;
        receipt.querySelector("[data-project-rules-receipt-detail]").textContent = savedReceipt.detail;
        receipt.hidden = false;
        receipt.focus({ preventScroll: true });
      }
    } catch {}
    const reveal = (field) => {
      let parent = field.parentElement;
      while (parent && parent !== form) {
        if (parent.tagName === "DETAILS") parent.open = true;
        parent = parent.parentElement;
      }
    };
    const fail = (field, message) => {
      reveal(field);
      field.setAttribute("aria-invalid", "true");
      errorBox.textContent = message;
      errorBox.hidden = false;
      field.focus();
    };
    form.addEventListener("input", (event) => {
      event.target?.removeAttribute?.("aria-invalid");
      errorBox.hidden = true;
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = new FormData(form);
      const reason = String(values.get("reason") || "").trim();
      if (!reason) {
        fail(form.elements.reason, L("请说明为什么要调整项目默认规则。"));
        return;
      }
      const crossReviewers = Number(values.get("cross_reviewers"));
      const adversarialReviewers = Number(values.get("adversarial_reviewers"));
      const leaseSeconds = Number(values.get("max_lease_seconds"));
      if (!Number.isInteger(crossReviewers) || crossReviewers < 0) {
        fail(form.elements.cross_reviewers, L("独立复核人数需要是 0 或正整数。"));
        return;
      }
      if (!Number.isInteger(adversarialReviewers) || adversarialReviewers < 0) {
        fail(form.elements.adversarial_reviewers, L("反例检查人数需要是 0 或正整数。"));
        return;
      }
      if (!Number.isInteger(leaseSeconds) || leaseSeconds <= 0) {
        fail(form.elements.max_lease_seconds, L("一次领取时长需要是正整数秒数。"));
        return;
      }
      const capabilities = String(values.get("required_capabilities") || "")
        .split(/[\\n,，]/)
        .map((item) => item.trim())
        .filter(Boolean);
      const submitLabel = submit.textContent;
      submit.disabled = true;
      submit.textContent = L("正在保存…");
      errorBox.hidden = true;
      try {
        const response = await fetch(routePrefix + "/api/policy-bindings", {
          method: "POST",
          headers: goalboardControlHeaders(),
          body: JSON.stringify({
            scope: "project_default",
            reason,
            policy: {
              goal_mode: values.get("goal_mode"),
              self_verification: values.has("self_verification"),
              cross_reviewers: crossReviewers,
              adversarial_reviewers: adversarialReviewers,
              human_approval: values.has("human_approval"),
              required_capabilities: [...new Set(capabilities)],
              max_lease_seconds: leaseSeconds,
            },
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || L("项目默认工作规则保存失败"));
        const modeLabels = { disabled: L("不要求"), preferred: L("建议使用"), required: L("必须使用") };
        sessionStorage.setItem(receiptKey, JSON.stringify({
          title: L("项目工作规则已保存"),
          detail: L("这个项目的共同规则已更新：按 Goal 工作“{mode}”，执行者自检“{self}”，用户确认“{human}”。之后开始或重新领取的 Goal 会采用这些规则。", {
            mode: modeLabels[values.get("goal_mode")] || String(values.get("goal_mode") || ""),
            self: values.has("self_verification") ? L("需要") : L("不需要"),
            human: values.has("human_approval") ? L("需要") : L("不需要"),
          }),
        }));
        location.reload();
      } catch (error) {
        errorBox.textContent = error.message || L("项目默认工作规则保存失败，请检查输入后重试");
        errorBox.hidden = false;
        submit.disabled = false;
        submit.textContent = submitLabel;
      }
    });
  })();
`;

const PROJECT_GUIDANCE_CLIENT_SCRIPT = `
  (() => {
    const editor = document.querySelector("[data-guidance-editor]");
    const form = document.querySelector("[data-guidance-form]");
    const dataNode = document.querySelector("#project-guidance-data");
    if (!editor || !form || !dataNode) return;
    const routePrefix = document.body.dataset.routePrefix || "";
    const state = JSON.parse(dataNode.textContent || "{}");
    const entries = [...(state.entries || []), ...(state.inactive_entries || [])];
    const fields = form.querySelector("[data-guidance-editor-fields]");
    const preview = form.querySelector("[data-guidance-editor-preview]");
    const title = editor.querySelector("[data-guidance-editor-title]");
    const description = editor.querySelector("[data-guidance-editor-description]");
    const errorBox = form.querySelector("[data-guidance-editor-error]");
    const submit = form.querySelector('button[type="submit"]');
    const modeInput = form.elements.action;
    const idInput = form.elements.guidance_id;
    const kindInput = form.elements.kind;
    const contentInput = form.elements.content;
    const reasonInput = form.elements.reason;
    let returnFocus = null;
    const labels = {
      add: { title: L("新增项目说明"), description: L("保存后会立即成为所有 Goal 共享的长期上下文。"), submit: L("保存说明") },
      edit: { title: L("修改项目说明"), description: L("原版本会保留在下方的版本记录中。"), submit: L("保存新版本") },
      deactivate: { title: L("停用项目说明"), description: L("停用后 Runtime 不再收到这条说明，历史版本仍会保留。"), submit: L("确认停用") },
      restore: { title: L("恢复项目说明"), description: L("恢复后这条说明会重新进入 Runtime Prompt。"), submit: L("确认恢复") },
    };
    const openEditor = (mode, guidanceId = "", trigger = null) => {
      const entry = entries.find((item) => item.guidance_id === guidanceId);
      const copy = labels[mode] || labels.add;
      returnFocus = trigger instanceof HTMLElement
        ? trigger
        : document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      form.reset();
      modeInput.value = mode;
      idInput.value = guidanceId;
      title.textContent = copy.title;
      description.textContent = copy.description;
      submit.textContent = copy.submit;
      errorBox.hidden = true;
      const editsContent = mode === "add" || mode === "edit";
      fields.hidden = !editsContent;
      kindInput.disabled = !editsContent;
      contentInput.disabled = !editsContent;
      preview.hidden = editsContent;
      if (entry) {
        kindInput.value = entry.kind;
        contentInput.value = entry.content;
        preview.textContent = entry.content;
      } else {
        kindInput.value = "context";
        contentInput.value = "";
        preview.textContent = "";
      }
      reasonInput.value = "";
      editor.hidden = false;
      const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      editor.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      setTimeout(() => (editsContent ? contentInput : reasonInput).focus(), reduceMotion ? 0 : 220);
    };
    const closeEditor = () => {
      const focusTarget = returnFocus;
      editor.hidden = true;
      form.reset();
      errorBox.hidden = true;
      returnFocus = null;
      focusTarget?.focus();
    };
    const bindEditorTrigger = (button, mode, guidanceId = "") => {
      const open = () => openEditor(mode, guidanceId, button);
      button.addEventListener("click", open);
      button.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        open();
      });
    };
    document.querySelectorAll("[data-guidance-new]").forEach((button) => {
      bindEditorTrigger(button, "add");
    });
    document.querySelectorAll("[data-guidance-edit]").forEach((button) => {
      bindEditorTrigger(button, "edit", button.dataset.guidanceEdit);
    });
    document.querySelectorAll("[data-guidance-action]").forEach((button) => {
      bindEditorTrigger(button, button.dataset.guidanceAction, button.dataset.guidanceId);
    });
    editor.querySelectorAll("[data-guidance-editor-close]").forEach((button) => {
      button.addEventListener("click", closeEditor);
    });
    editor.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeEditor();
    });
    form.addEventListener("input", () => { errorBox.hidden = true; });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const mode = modeInput.value;
      const guidanceId = idInput.value;
      const content = String(contentInput.value || "").trim();
      const reason = String(reasonInput.value || "").trim();
      if ((mode === "add" || mode === "edit") && !content) {
        errorBox.textContent = L("请填写项目说明原文。");
        errorBox.hidden = false;
        contentInput.focus();
        return;
      }
      if (!reason) {
        errorBox.textContent = L("请说明为什么要做这次变更。");
        errorBox.hidden = false;
        reasonInput.focus();
        return;
      }
      const submitLabel = submit.textContent;
      submit.disabled = true;
      submit.textContent = L("正在保存…");
      try {
        const isAdd = mode === "add";
        const response = await fetch(
          isAdd ? routePrefix + "/api/project-guidance" : routePrefix + "/api/project-guidance/" + encodeURIComponent(guidanceId),
          {
            method: isAdd ? "POST" : "PATCH",
            headers: goalboardControlHeaders(),
            body: JSON.stringify({
              action: isAdd ? undefined : mode,
              kind: isAdd || mode === "edit" ? kindInput.value : undefined,
              content: isAdd || mode === "edit" ? content : undefined,
              reason,
              user_confirmed: true,
            }),
          },
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || L("项目说明保存失败"));
        sessionStorage.setItem("goalboard-guidance-receipt:" + routePrefix, copyReceipt(mode));
        location.reload();
      } catch (error) {
        errorBox.textContent = error.message || L("项目说明保存失败，请检查输入后重试");
        errorBox.hidden = false;
        submit.disabled = false;
        submit.textContent = submitLabel;
      }
    });
    const receipt = document.querySelector("[data-guidance-receipt]");
    try {
      const saved = sessionStorage.getItem("goalboard-guidance-receipt:" + routePrefix);
      sessionStorage.removeItem("goalboard-guidance-receipt:" + routePrefix);
      if (receipt && saved) {
        receipt.textContent = saved;
        receipt.hidden = false;
      }
    } catch {}
    function copyReceipt(mode) {
      if (mode === "edit") return L("项目说明的新版本已生效。");
      if (mode === "deactivate") return L("项目说明已停用，Runtime 将不再收到它。");
      if (mode === "restore") return L("项目说明已恢复，并重新进入 Runtime Prompt。");
      return L("项目说明已新增，并会用于后续 Goal。");
    }
  })();
`;

export const WORK_TAB_VISIBILITY_CLIENT_SCRIPT = String.raw`
    let workTabsVisibilityFrame = 0;
    const ensureActiveWorkTabVisible = () => {
      if (!workTabs) return;
      if (workTabsVisibilityFrame) cancelAnimationFrame(workTabsVisibilityFrame);
      workTabsVisibilityFrame = requestAnimationFrame(() => {
        workTabsVisibilityFrame = 0;
        const activeTabShell = workTabs.querySelector(".desktop-work-tab.is-selected");
        if (!activeTabShell) return;
        const railRect = workTabs.getBoundingClientRect();
        const tabRect = activeTabShell.getBoundingClientRect();
        if (tabRect.left < railRect.left) {
          workTabs.scrollLeft -= railRect.left - tabRect.left;
        } else if (tabRect.right > railRect.right) {
          workTabs.scrollLeft += tabRect.right - railRect.right;
        }
      });
    };
    const workTabsResizeObserver = workTabs && typeof ResizeObserver === "function"
      ? new ResizeObserver(ensureActiveWorkTabVisible)
      : null;
    workTabsResizeObserver?.observe(workTabs);
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
    const desktopDirectoryPanels = [...document.querySelectorAll("[data-directory-panel]")];
    const desktopWorkSurfaces = [...document.querySelectorAll("[data-work-surface]")];
    const projectMenus = [...document.querySelectorAll("[data-project-menu]")];
    const workTabs = document.querySelector("[data-work-tabs]");
    const feedDirectory = document.querySelector("[data-feed-directory]");
    const feedWorkbench = document.querySelector("[data-feed-workbench]");
    const feedList = document.querySelector("[data-feed-list]");
    const feedSearch = document.querySelector("[data-feed-search]");
    const feedFilterTrigger = document.querySelector("[data-feed-filter-trigger]");
    const feedFilterPanel = document.querySelector("[data-feed-filter-panel]");
    const feedFilterBadge = document.querySelector("[data-feed-filter-badge]");
    const feedFilterSummary = document.querySelector("[data-feed-filter-summary]");
    const feedFilterReset = document.querySelector("[data-feed-filter-reset]");
    const feedSourceFilter = document.querySelector("[data-feed-source-filter]");
    const feedTypeFilter = document.querySelector("[data-feed-type-filter]");
    const feedTimeFilter = document.querySelector("[data-feed-time-filter]");
    const feedStatusFilter = document.querySelector("[data-feed-status-filter]");
    const feedSort = document.querySelector("[data-feed-sort]");
    const feedResultCount = document.querySelector("[data-feed-result-count]");
    const feedEmpty = document.querySelector("[data-feed-empty]");
    const feedDetailEmpty = document.querySelector("[data-feed-detail-empty]");
    const sourceDirectory = document.querySelector("[data-source-directory]");
    const sourceWorkbench = document.querySelector("[data-source-workbench]");
    const sourceList = document.querySelector("[data-source-list]");
    const sourceSearch = document.querySelector("[data-source-search]");
    const sourceResultCount = document.querySelector("[data-source-result-count]");
    const sourceEmpty = document.querySelector("[data-source-empty]");
    const feedSourcesDialog = document.querySelector("[data-feed-sources-dialog]");
    const feedSourceError = feedSourcesDialog?.querySelector("[data-feed-source-error]");
    const feedSourceProgress = feedSourcesDialog?.querySelector("[data-feed-source-progress]");
    const relayImportDialog = document.querySelector("[data-relay-import-dialog]");
    const mobileTreeTab = document.querySelector('[data-mobile-target="tree"]');
    const mobileDocumentTab = document.querySelector('[data-mobile-target="document"]');
    const mobileDirectoryTab = document.querySelector("[data-mobile-directory-root]");
    const defaultMobileTreeLabel = mobileTreeTab?.textContent || L("目标");
    const defaultMobileDocumentLabel = mobileDocumentTab?.textContent || L("聚焦");
    const dialog = document.querySelector("[data-create-dialog]");
    const form = document.querySelector("[data-create-form]");
    const formError = document.querySelector("[data-create-error]");
    const trashDialog = document.querySelector("[data-goal-trash-dialog]");
    const trashForm = document.querySelector("[data-goal-trash-form]");
    const trashError = document.querySelector("[data-goal-trash-error]");
    const trashSubmit = document.querySelector("[data-goal-trash-submit]");
    const toast = document.querySelector("[data-toast]");
    const archiveView = document.body.dataset.boardView === "archive";
    const trashView = document.body.dataset.boardView === "trash";
    const decisionView = document.body.dataset.boardView === "decisions";
    const collectionView = archiveView || trashView;
    const documentCollection = trashView ? "trash" : archiveView ? "archive" : "current";
    const routePrefix = document.body.dataset.routePrefix || "";
    const route = (pathname) => routePrefix + pathname;
    const feedApi = async (pathname, method, body) => {
      const response = await fetch(route(pathname), {
        method,
        headers: goalboardControlHeaders(),
        body: body == null ? undefined : JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || L("来源操作失败"));
      return result;
    };
    const markFeedItemRead = async (row, entryId) => {
      if (
        !row || row.dataset.feedEntryType !== "feed" ||
        row.dataset.feedEntryPersisted !== "true" ||
        row.dataset.feedEntryRead === "read" ||
        row.dataset.feedReadPending === "true"
      ) return;
      const itemId = row.dataset.feedItemId || entryId;
      row.dataset.feedReadPending = "true";
      const detail = feedWorkbench?.querySelector('[data-feed-detail="' + CSS.escape(entryId) + '"]');
      const status = detail?.querySelector("[data-feed-action-status]");
      try {
        await feedApi("/api/feed/items/" + encodeURIComponent(itemId) + "/read", "POST", {});
        row.dataset.feedEntryRead = "read";
        if (detail) detail.dataset.feedDetailRead = "read";
        row.querySelectorAll("[data-feed-read-state]").forEach((label) => { label.textContent = L("已读"); });
        detail?.querySelectorAll("[data-feed-read-state]").forEach((label) => { label.textContent = L("已读"); });
        if (status?.dataset.feedReadError === "true") {
          status.hidden = true;
          delete status.dataset.feedReadError;
        }
      } catch {
        if (status) {
          status.textContent = L("已打开，但未能保存已读状态；重新选择该 Item 即可重试");
          status.dataset.feedReadError = "true";
          status.hidden = false;
        }
      } finally {
        delete row.dataset.feedReadPending;
      }
    };
    const setFeedSourceFeedback = (message, error = false) => {
      if (feedSourceError) feedSourceError.hidden = !error;
      if (feedSourceProgress) feedSourceProgress.hidden = error || !message;
      if (error && feedSourceError) feedSourceError.textContent = message;
      if (!error && feedSourceProgress) feedSourceProgress.textContent = message;
    };
    if (new URLSearchParams(location.search).get("feed-auth") === "gmail") {
      queueMicrotask(() => {
        feedSourcesDialog?.showModal();
        setFeedSourceFeedback(L("Gmail 授权完成，账号已成为独立来源。"));
      });
    }
    const localPathname = () => routePrefix && location.pathname.startsWith(routePrefix)
      ? location.pathname.slice(routePrefix.length) || "/"
      : location.pathname;
    const decisionFeedEntryFromHash = () => {
      const prefix = "#decision-goal-";
      if (!decisionView || !location.hash.startsWith(prefix)) return "";
      return "decision:" + decodeURIComponent(location.hash.slice(prefix.length));
    };
    const visibleGoals = (source = state) => trashView ? source.trashed_goals : archiveView ? source.archived_goals : source.goals;
    const goalUiStorageKey = "goalboard-ui:" + (state.project?.project_id || state.snapshot.board.board_id);
    const currentGoalUiStorageKey = goalUiStorageKey + ":current";
    const storageKey = decisionView
      ? goalUiStorageKey + ":inbox"
      : trashView
        ? goalUiStorageKey + ":trash"
        : archiveView
          ? goalUiStorageKey + ":archive"
          : currentGoalUiStorageKey;
    const goalMoveReceiptKey = "goalboard-goal-move-receipt:" + (state.project?.project_id || state.snapshot.board.board_id);
    const workTabsStorageKey = "goalboard-work-tabs:" + (state.project?.project_id || state.snapshot.board.board_id);
    const desktopNavigationStateVersion = 3;
    let desktopDirectoryOrigin = null;
    let activeDesktopSurface = decisionView ? "feed" : "goal";
    let activeFeedPreset = feedDirectory?.dataset.feedPreset || "inbox_message";
    let selectedFeedItem = feedList?.querySelector("[data-feed-entry-id].is-selected")?.dataset.feedEntryId || "";
    let selectedSource = sourceList?.querySelector("[data-source-entry-id].is-selected")?.dataset.sourceEntryId || "";
    let activeSourceFilter = "all";
    const defaultFeedPresetState = () => ({
      selected: "",
      query: "",
      source: "all",
      type: "all",
      time: "all",
      status: "active",
      sort: "newest",
    });
    let feedPresetState = {
      inbox_message: defaultFeedPresetState(),
      feed: defaultFeedPresetState(),
    };
    let desktopSurfaceScroll = {};
    let goalWorkspaceMode = "focus";
    let selected = decisionView ? "" : document.querySelector("[data-goal-view]:not([hidden])")?.dataset.goalView || (collectionView ? "" : state.active_goal_id || visibleGoals()[0]?.goal.goal_id) || "";
    if (!decisionView) {
      const initialHistoryState = history.state && typeof history.state === "object" ? history.state : {};
      history.replaceState({ ...initialHistoryState, goalId: selected }, "", location.href);
    }
    let trashIntent = null;
    let toastTimer;
    let syncing = false;
    let saveTimer;
    let resizeStartX = 0;
    let resizeStartWidth = 0;
    let selectedStatuses = new Set();
    let goalDocumentRequest = null;
    let goalPanelRequest = null;
    let goalRecordsRequest = null;
    let quickRecordRequest = null;
    let goalGraphRequest = null;
    let feedWorkbenchRequest = null;
    let feedDetailRequest = null;
    let searchBusyUntil = 0;
    let searchComposing = false;
    let deferredRefreshTimer;
    let navigatorView = "list";
    let momentumOpenOnly = false;
    let momentumPeriod = 7;
    let momentumSelected = selected;
    let graphZoom = 1;
    let graphAutoFit = true;
    let graphResizeObserver = null;
    let graphResizeTarget = null;
    let graphResizeFrame = 0;
    let desktopCompanionActive = document.body.dataset.desktopShell === "true" && matchMedia("(max-width: 760px)").matches;
    let openWorkTabs = [];
    const goalPanelKeys = ["overview", "completion", "progress", "factors", "records"];
    const goalFactorKeys = ["relations", "risks", "impacts", "rules"];

    if (workTabs && !decisionView && !collectionView) {
      try {
        const storedTabs = JSON.parse(localStorage.getItem(workTabsStorageKey) || "[]");
        if (Array.isArray(storedTabs)) openWorkTabs = storedTabs.map(String);
      } catch {}
      const available = new Set(visibleGoals().map((item) => item.goal.goal_id));
      openWorkTabs = openWorkTabs.filter((goalId, index, all) => available.has(goalId) && all.indexOf(goalId) === index);
      if (selected && !openWorkTabs.includes(selected)) openWorkTabs.push(selected);
    }

    const persistWorkTabs = () => {
      if (!workTabs || decisionView || collectionView) return;
      try { localStorage.setItem(workTabsStorageKey, JSON.stringify(openWorkTabs)); } catch {}
    };

${WORK_TAB_VISIBILITY_CLIENT_SCRIPT}

    const renderWorkTabs = () => {
      if (!workTabs) return;
      const byId = new Map(visibleGoals().map((item) => [item.goal.goal_id, item]));
      const fragment = document.createDocumentFragment();
      if (!decisionView && !collectionView) {
        openWorkTabs = openWorkTabs.filter((goalId) => byId.has(goalId));
        if (selected && byId.has(selected) && !openWorkTabs.includes(selected)) openWorkTabs.push(selected);
        openWorkTabs.forEach((goalId, index) => {
          const item = byId.get(goalId);
          if (!item) return;
          const selectedTab = activeDesktopSurface === "goal" && goalId === selected;
          const shell = document.createElement("div");
          shell.className = "desktop-work-tab" + (selectedTab ? " is-selected" : "");
          shell.dataset.workTabShell = goalId;
          const tab = document.createElement("button");
          tab.type = "button";
          tab.id = "desktop-work-tab-" + index;
          tab.role = "tab";
          tab.dataset.workTab = goalId;
          tab.setAttribute("aria-selected", String(selectedTab));
          tab.setAttribute("aria-controls", "goal-document-pane");
          tab.tabIndex = selectedTab ? 0 : -1;
          const dot = document.createElement("i");
          dot.dataset.status = item.status;
          dot.setAttribute("aria-hidden", "true");
          const label = document.createElement("span");
          label.textContent = item.goal.title;
          tab.append(dot, label);
          const close = document.createElement("button");
          close.type = "button";
          close.dataset.closeWorkTab = goalId;
          close.setAttribute("aria-label", L("关闭 {title}", { title: item.goal.title }));
          close.textContent = "×";
          shell.append(tab, close);
          fragment.append(shell);
        });
      }
      if (activeDesktopSurface !== "goal" || decisionView || collectionView) {
        const surface = desktopWorkSurfaces.find((candidate) => candidate.dataset.workSurface === activeDesktopSurface);
        if (surface) {
          const utility = document.createElement("div");
          utility.className = "desktop-work-tab is-selected is-utility";
          const label = document.createElement("span");
          label.id = "desktop-work-tab-utility";
          label.role = "tab";
          label.tabIndex = 0;
          label.dataset.utilityWorkTab = activeDesktopSurface;
          label.setAttribute("aria-selected", "true");
          label.setAttribute("aria-controls", "goal-document-pane");
          label.textContent = surface.dataset.workSurfaceLabel || activeDesktopSurface;
          utility.append(label);
          fragment.append(utility);
        }
      }
      workTabs.replaceChildren(fragment);
      const activeTab = workTabs.querySelector('[data-work-tab][aria-selected="true"]');
      const activeUtilityTab = workTabs.querySelector('[data-utility-work-tab][aria-selected="true"]');
      if (activeTab?.id) documentPane.setAttribute("aria-labelledby", activeTab.id);
      else if (activeUtilityTab?.id) documentPane.setAttribute("aria-labelledby", activeUtilityTab.id);
      else documentPane.removeAttribute("aria-labelledby");
      persistWorkTabs();
      ensureActiveWorkTabVisible();
    };

    const ensureWorkTab = (goalId) => {
      if (!workTabs || decisionView || collectionView || !goalId) return;
      if (!openWorkTabs.includes(goalId)) openWorkTabs.push(goalId);
      if (openWorkTabs.length > 8) {
        const removable = openWorkTabs.find((candidate) => candidate !== goalId && candidate !== selected);
        if (removable) openWorkTabs = openWorkTabs.filter((candidate) => candidate !== removable);
        else openWorkTabs = openWorkTabs.slice(-8);
      }
      renderWorkTabs();
    };

    const focusWorkTab = (goalId) => {
      if (!workTabs || !goalId) return;
      requestAnimationFrame(() => {
        const tab = [...workTabs.querySelectorAll("[data-work-tab]")]
          .find((candidate) => candidate.dataset.workTab === goalId);
        tab?.focus();
      });
    };

    const restoreLastGoal = (openGoalsDirectory = false) => {
      let goalId = "";
      try {
        const goalUi = JSON.parse(sessionStorage.getItem(currentGoalUiStorageKey) || sessionStorage.getItem(goalUiStorageKey) || "null");
        goalId = String(goalUi?.selected || "");
        if (openGoalsDirectory) {
          const nextGoalUi = goalUi && typeof goalUi === "object" ? goalUi : {};
          sessionStorage.setItem(currentGoalUiStorageKey, JSON.stringify({
            ...nextGoalUi,
            navigationVersion: desktopNavigationStateVersion,
            directory: "goals",
            workSurface: "goal",
          }));
        }
      } catch {}
      const available = new Set(visibleGoals().map((item) => item.goal.goal_id));
      if (!available.has(goalId)) goalId = state.active_goal_id || visibleGoals()[0]?.goal.goal_id || "";
      location.assign(globalThis.goalboardNavigationUrl(goalId ? route("/goals/" + encodeURIComponent(goalId)) : route("/")));
    };

    const setDesktopWorkSurface = (surface, persist = true, restoreScroll = true) => {
      if (!desktopWorkSurfaces.length) return false;
      const nextSurface = desktopWorkSurfaces.find((candidate) => candidate.dataset.workSurface === surface);
      if (!nextSurface) {
        if (surface === "goal") restoreLastGoal(true);
        return false;
      }
      if (activeDesktopSurface && activeDesktopSurface !== surface) {
        desktopSurfaceScroll[activeDesktopSurface] = documentPane.scrollTop;
        if (activeDesktopSurface === "goal") goalWorkspaceMode = workspace.dataset.workspaceMode || "focus";
      }
      activeDesktopSurface = surface;
      document.body.dataset.desktopSurface = surface;
      if (mobileTreeTab) mobileTreeTab.textContent = surface === "feed"
        ? (activeFeedPreset === "feed" ? "Feed" : "Inbox")
        : surface === "sources"
          ? L("来源")
          : surface === "sessions"
            ? "Sessions"
            : defaultMobileTreeLabel;
      if (mobileDocumentTab) mobileDocumentTab.textContent = surface === "feed" || surface === "sources" || surface === "sessions"
        ? L("详情")
        : defaultMobileDocumentLabel;
      desktopWorkSurfaces.forEach((candidate) => {
        candidate.hidden = candidate !== nextSurface;
      });
      document.querySelectorAll("[data-work-surface-open], [data-work-surface-link]").forEach((item) => {
        const active = (item.dataset.workSurfaceOpen || item.dataset.workSurfaceLink) === surface &&
          (surface !== "feed" || !item.dataset.feedPreset || item.dataset.feedPreset === activeFeedPreset);
        item.classList.toggle("is-current", active);
        if (active) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
      });
      setWorkspaceMode(surface === "goal" ? goalWorkspaceMode : "focus", false);
      renderWorkTabs();
      const label = nextSurface.dataset.workSurfaceLabel || surface;
      documentPane.setAttribute("aria-label", label);
      requestAnimationFrame(() => {
        documentPane.scrollTop = restoreScroll ? Number(desktopSurfaceScroll[surface] || 0) : 0;
      });
      if (surface === "feed") void ensureFeedWorkbenchLoaded();
      if (surface === "sources" && selectedSource) selectSource(selectedSource, false);
      if (persist) queueSave();
      return true;
    };

    const setDesktopDirectory = (directory, persist = true, focusTarget = true, origin = null) => {
      if (!desktopDirectoryPanels.length || !treePane?.dataset.desktopDirectory) return;
      const available = new Set(desktopDirectoryPanels.map((panel) => panel.dataset.directoryPanel));
      const next = available.has(directory) ? directory : "root";
      const current = treePane.dataset.desktopDirectory;
      if (current === "root" && next !== "root" && origin?.closest?.('[data-directory-panel="root"]')) {
        desktopDirectoryOrigin = origin;
      }
      treePane.dataset.desktopDirectory = next;
      desktopDirectoryPanels.forEach((panel) => { panel.hidden = panel.dataset.directoryPanel !== next; });
      if (mobileDirectoryTab) {
        const rootActive = next === "root";
        mobileDirectoryTab.classList.toggle("is-active", rootActive);
        mobileDirectoryTab.setAttribute("aria-selected", String(rootActive));
        if (rootActive) {
          mobileTreeTab?.classList.remove("is-active");
          mobileTreeTab?.setAttribute("aria-selected", "false");
        } else if (workspace?.dataset.mobileView === "tree") {
          mobileTreeTab?.classList.add("is-active");
          mobileTreeTab?.setAttribute("aria-selected", "true");
        }
      }
      if (focusTarget) {
        requestAnimationFrame(() => {
          const nextPanel = desktopDirectoryPanels.find((panel) => panel.dataset.directoryPanel === next);
          const nextFocus = next === "root" && desktopDirectoryOrigin?.isConnected
            ? desktopDirectoryOrigin
            : nextPanel?.querySelector('[data-directory-back], [data-directory-open], a[href], button:not([disabled])');
          nextFocus?.focus();
        });
      }
      if (persist) queueSave();
    };

    const setSourceDetailTab = (detail, tabName, focus = false) => {
      if (!detail) return;
      detail.querySelectorAll("[data-source-detail-tab]").forEach((tab) => {
        const active = tab.dataset.sourceDetailTab === tabName;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
        if (active && focus) tab.focus();
      });
      detail.querySelectorAll("[data-source-detail-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.sourceDetailPanel !== tabName;
      });
    };

    const selectSource = (sourceId, moveToDetail = false) => {
      if (!sourceList || !sourceWorkbench) return false;
      const selectedRow = [...sourceList.querySelectorAll("[data-source-entry-id]")]
        .find((row) => row.dataset.sourceEntryId === sourceId && !row.hidden);
      if (!selectedRow) return false;
      selectedSource = sourceId;
      sourceList.querySelectorAll("[data-source-entry-id]").forEach((row) => {
        const active = row === selectedRow;
        row.classList.toggle("is-selected", active);
        row.setAttribute("aria-selected", String(active));
        row.tabIndex = active ? 0 : -1;
      });
      sourceWorkbench.querySelectorAll("[data-source-detail]").forEach((detail) => {
        detail.hidden = detail.dataset.sourceDetail !== sourceId;
      });
      const selectedDetail = sourceWorkbench.querySelector('[data-source-detail="' + CSS.escape(sourceId) + '"]');
      if (selectedDetail) setSourceDetailTab(selectedDetail, "overview");
      if (moveToDetail && matchMedia("(max-width: 760px)").matches) setMobileView("document");
      queueSave();
      return true;
    };

    const filterSources = (preserveSelection = true) => {
      if (!sourceList) return;
      const query = String(sourceSearch?.value || "").trim().toLocaleLowerCase();
      const rows = [...sourceList.querySelectorAll("[data-source-entry-id]")];
      const visible = rows.filter((row) => {
        const kind = row.dataset.sourceKind;
        const status = row.dataset.sourceStatus;
        const matchesKind = activeSourceFilter === "all" ||
          (activeSourceFilter === "account" && (kind === "github" || kind === "gmail")) ||
          (activeSourceFilter === "public" && kind === "rss") ||
          (activeSourceFilter === "attention" && status === "attention");
        const matchesQuery = !query || String(row.dataset.sourceSearchValue || "").includes(query);
        row.hidden = !(matchesKind && matchesQuery);
        return !row.hidden;
      });
      if (sourceResultCount) sourceResultCount.textContent = L("{count} 个来源", { count: visible.length });
      if (sourceEmpty) sourceEmpty.hidden = visible.length > 0;
      const selectedStillVisible = visible.some((row) => row.dataset.sourceEntryId === selectedSource);
      if (!preserveSelection || !selectedStillVisible) {
        const next = visible[0];
        if (next) selectSource(next.dataset.sourceEntryId, false);
        else {
          sourceWorkbench?.querySelectorAll("[data-source-detail]").forEach((detail) => { detail.hidden = true; });
          const emptyDetail = sourceWorkbench?.querySelector("[data-source-detail-empty]");
          if (emptyDetail) emptyDetail.hidden = false;
        }
      }
      queueSave();
    };

    const showPrototypeStatus = (control, message) => {
      const detail = control.closest("[data-source-detail], [data-prototype-feed-detail]");
      const status = control.closest("[data-source-detail-panel]")?.querySelector("[data-source-action-status], [data-prototype-config-status], [data-prototype-schedule-status], [data-prototype-action-status]") ||
        detail?.querySelector("[data-source-action-status], [data-prototype-config-status], [data-prototype-schedule-status], [data-prototype-action-status]");
      if (!status) return;
      status.textContent = message;
      status.hidden = false;
    };

    const setFeedDetailPlaceholder = (title, copy, retry = false) => {
      if (!feedDetailEmpty) return;
      const titleNode = feedDetailEmpty.querySelector("[data-feed-detail-empty-title]");
      const copyNode = feedDetailEmpty.querySelector("[data-feed-detail-empty-copy]");
      const retryButton = feedDetailEmpty.querySelector("[data-retry-feed-detail]");
      if (titleNode) titleNode.textContent = title;
      if (copyNode) copyNode.textContent = copy;
      if (retryButton) retryButton.hidden = !retry;
      feedDetailEmpty.hidden = false;
    };

    const ensureFeedWorkbenchLoaded = async () => {
      if (!feedWorkbench) return false;
      if (feedWorkbench.dataset.loaded === "true" && feedWorkbench.dataset.loadedPreset === activeFeedPreset) return true;
      if (feedWorkbenchRequest) {
        const pending = feedWorkbenchRequest;
        return pending.then(() => ensureFeedWorkbenchLoaded());
      }
      const requestedPreset = activeFeedPreset;
      setFeedDetailPlaceholder(L("正在打开 Item 工作区…"), L("先载入待判断事项，再读取当前选择的正文和资料。"));
      feedWorkbench.setAttribute("aria-busy", "true");
      feedWorkbenchRequest = (async () => {
        try {
          const response = await fetch(
            route("/api/feed/workbench?preset=" + encodeURIComponent(activeFeedPreset)),
            { cache: "no-store" },
          );
          if (!response.ok) throw new Error(L("无法打开 Item 工作区"));
          const template = document.createElement("template");
          template.innerHTML = (await response.text()).trim();
          if (requestedPreset !== activeFeedPreset) return false;
          feedWorkbench.querySelectorAll(".feed-detail--decision, .feed-detail--result")
            .forEach((detail) => detail.remove());
          for (const detail of [...template.content.querySelectorAll("[data-feed-detail]")]) {
            feedWorkbench.insertBefore(detail, feedDetailEmpty);
          }
          feedWorkbench.dataset.loaded = "true";
          feedWorkbench.dataset.loadedPreset = requestedPreset;
          filterFeedItems(true);
          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : L("无法打开 Item 工作区");
          setFeedDetailPlaceholder(message, L("目录仍然可用，点击重试即可。"), true);
          return false;
        } finally {
          feedWorkbench.removeAttribute("aria-busy");
          feedWorkbenchRequest = null;
        }
      })();
      return feedWorkbenchRequest;
    };

    const loadFeedItemDetail = async (row, entryId) => {
      if (!feedWorkbench || !row || row.dataset.feedEntryPersisted !== "true") return;
      const itemId = row.dataset.feedItemId || entryId;
      const existing = feedWorkbench.querySelector('[data-feed-detail="' + CSS.escape(entryId) + '"]');
      if (existing) {
        existing.hidden = selectedFeedItem !== entryId;
        if (selectedFeedItem === entryId && feedDetailEmpty) feedDetailEmpty.hidden = true;
        return;
      }
      feedDetailRequest?.abort();
      const controller = new AbortController();
      feedDetailRequest = controller;
      feedWorkbench.dataset.feedLoadingItem = entryId;
      setFeedDetailPlaceholder(L("正在载入 Item…"), L("只读取当前选择的正文和资料。"));
      try {
        const inboxEntryQuery = row.dataset.inboxEntryId
          ? "&entry=" + encodeURIComponent(row.dataset.inboxEntryId)
          : "";
        const response = await fetch(
          route("/api/feed/items/" + encodeURIComponent(itemId) + "/detail?preset=" + encodeURIComponent(activeFeedPreset) + inboxEntryQuery),
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error(L("无法读取这条 Item"));
        const template = document.createElement("template");
        template.innerHTML = (await response.text()).trim();
        const detail = template.content.querySelector('[data-feed-detail="' + CSS.escape(entryId) + '"]');
        if (!detail) throw new Error(L("Item 详情响应不完整"));
        if (feedDetailRequest !== controller || !feedWorkbench.isConnected) return;
        feedWorkbench.insertBefore(detail, feedDetailEmpty);
        if (row.dataset.feedEntryRead === "read") {
          detail.dataset.feedDetailRead = "read";
          detail.querySelectorAll("[data-feed-read-state]").forEach((label) => { label.textContent = L("已读"); });
        }
        feedWorkbench.querySelectorAll("[data-feed-detail]").forEach((candidate) => {
          candidate.hidden = candidate.dataset.feedDetail !== selectedFeedItem;
        });
        if (selectedFeedItem === entryId && feedDetailEmpty) feedDetailEmpty.hidden = true;
      } catch (error) {
        if (isAbortError(error) || feedDetailRequest !== controller) return;
        if (selectedFeedItem !== entryId) return;
        const message = error instanceof Error ? error.message : L("无法读取这条 Item");
        setFeedDetailPlaceholder(message, L("这条 Item 仍然保留，点击重试即可。"), true);
      } finally {
        if (feedDetailRequest === controller) {
          feedDetailRequest = null;
          delete feedWorkbench.dataset.feedLoadingItem;
        }
      }
    };

    const selectFeedItem = (itemId, moveToDetail = false, recordRead = false) => {
      if (!feedList || !feedWorkbench) return false;
      const selectedRow = [...feedList.querySelectorAll("[data-feed-entry-id]")]
        .find((row) => row.dataset.feedEntryId === itemId && !row.hidden);
      if (!selectedRow) return false;
      selectedFeedItem = itemId;
      feedList.querySelectorAll("[data-feed-entry-id]").forEach((row) => {
        const active = row === selectedRow;
        row.classList.toggle("is-selected", active);
        row.setAttribute("aria-selected", String(active));
        row.tabIndex = active ? 0 : -1;
      });
      if (feedWorkbench.dataset.loaded !== "true" || feedWorkbench.dataset.loadedPreset !== activeFeedPreset) {
        if (recordRead) void markFeedItemRead(selectedRow, itemId);
        setFeedDetailPlaceholder(L("正在打开 Item 工作区…"), L("只读取当前选择的正文和资料。"));
        return true;
      }
      const existingDetail = feedWorkbench.querySelector('[data-feed-detail="' + CSS.escape(itemId) + '"]');
      feedWorkbench.querySelectorAll("[data-feed-detail]").forEach((detail) => {
        detail.hidden = detail.dataset.feedDetail !== itemId;
      });
      if (existingDetail) {
        feedDetailRequest?.abort();
        if (feedDetailEmpty) feedDetailEmpty.hidden = true;
      } else if (selectedRow.dataset.feedEntryPersisted === "true") {
        void loadFeedItemDetail(selectedRow, itemId);
      } else {
        setFeedDetailPlaceholder(L("无法读取这条 Item"), L("刷新页面后再试。"), true);
      }
      if (moveToDetail && matchMedia("(max-width: 760px)").matches) setMobileView("document");
      if (recordRead) void markFeedItemRead(selectedRow, itemId);
      queueSave();
      return true;
    };

    const filterFeedItems = (preserveSelection = true) => {
      if (!feedList) return;
      const query = String(feedSearch?.value || "").trim().toLocaleLowerCase();
      const type = activeFeedPreset;
      const source = feedSourceFilter?.value || "all";
      const providerType = feedTypeFilter?.value || "all";
      const time = feedTimeFilter?.value || "all";
      const status = feedStatusFilter?.value || "active";
      const sort = feedSort?.value || "newest";
      const rows = [...feedList.querySelectorAll("[data-feed-entry-id]")];
      const presetRows = rows.filter((row) => row.dataset.feedEntryType === type);
      const visible = rows.filter((row) => {
        const matchesType = type === "all" || row.dataset.feedEntryType === type;
        const matchesSource = source === "all" || row.dataset.feedEntrySource === source;
        const matchesProvider = providerType === "all" || row.dataset.feedEntryProvider === providerType;
        const occurredAt = Date.parse(row.dataset.feedEntryTime || "");
        const age = Number.isFinite(occurredAt) ? Date.now() - occurredAt : Number.POSITIVE_INFINITY;
        const matchesTime = time === "all"
          || (time === "day" && age >= 0 && age <= 86_400_000)
          || (time === "week" && age >= 0 && age <= 7 * 86_400_000)
          || (time === "month" && age >= 0 && age <= 30 * 86_400_000);
        const matchesStatus = status === "all"
          ? true
          : status === "active"
            ? type === "inbox_message"
              ? row.dataset.feedEntryStatus === "inbox" || row.dataset.feedEntryStatus === "processing"
              : row.dataset.feedEntryStatus !== "archived"
            : row.dataset.feedEntryStatus === status;
        const matchesQuery = !query || String(row.dataset.feedEntrySearch || "").includes(query);
        row.hidden = !(matchesType && matchesSource && matchesProvider && matchesTime && matchesStatus && matchesQuery);
        return !row.hidden;
      });
      const compare = (left, right) => {
        const attentionDifference = activeFeedPreset === "inbox_message"
          ? Number(right.dataset.feedEntryAttentionRank || 0) - Number(left.dataset.feedEntryAttentionRank || 0)
          : 0;
        if (attentionDifference) return attentionDifference;
        if (sort === "oldest") return String(left.dataset.feedEntryTime || "").localeCompare(String(right.dataset.feedEntryTime || ""));
        if (sort === "source") return String(left.dataset.feedEntrySource || "").localeCompare(String(right.dataset.feedEntrySource || ""));
        if (sort === "title") return String(left.dataset.feedEntryTitle || "").localeCompare(String(right.dataset.feedEntryTitle || ""));
        return String(right.dataset.feedEntryTime || "").localeCompare(String(left.dataset.feedEntryTime || ""));
      };
      rows.sort(compare).forEach((row) => feedList.insertBefore(row, feedEmpty));
      if (feedResultCount) feedResultCount.textContent = L("{count} 个 Item", { count: visible.length });
      const filteredEmpty = visible.length === 0 && presetRows.length > 0;
      if (feedEmpty) {
        const emptyTitle = feedEmpty.querySelector("[data-feed-empty-title]");
        const emptyCopy = feedEmpty.querySelector("[data-feed-empty-copy]");
        const clearFilters = feedEmpty.querySelector("[data-feed-clear-filters]");
        const manageSources = feedEmpty.querySelector("[data-feed-empty-sources]");
        if (emptyTitle) emptyTitle.textContent = filteredEmpty ? L("没有符合当前条件的 Item") : L("这里还没有 Item");
        if (emptyCopy) emptyCopy.textContent = filteredEmpty
          ? L("换一个关键词或清除筛选，原来的 Item 仍然保留。")
          : L("接入来源后，消息和 Feed 会出现在这里。");
        if (clearFilters) clearFilters.hidden = !filteredEmpty;
        if (manageSources) manageSources.hidden = filteredEmpty;
        feedEmpty.hidden = visible.length > 0;
      }
      const selectionVisible = visible.some((row) => row.dataset.feedEntryId === selectedFeedItem);
      if (visible.length) {
        if (!preserveSelection || !selectionVisible) selectedFeedItem = visible[0]?.dataset.feedEntryId || "";
        selectFeedItem(selectedFeedItem);
      } else {
        if (!preserveSelection) selectedFeedItem = "";
        rows.forEach((row) => {
          row.classList.remove("is-selected");
          row.setAttribute("aria-selected", "false");
          row.tabIndex = -1;
        });
        feedWorkbench?.querySelectorAll("[data-feed-detail]").forEach((detail) => { detail.hidden = true; });
        setFeedDetailPlaceholder(
          filteredEmpty ? L("没有符合当前条件的 Item") : L("这里还没有 Item"),
          filteredEmpty
            ? L("换一个关键词或清除筛选，原来的 Item 仍然保留。")
            : L("接入来源后，消息和 Feed 会出现在这里。"),
        );
      }
      queueSave();
    };

    const syncFeedFilterUi = () => {
      if (!feedFilterPanel) return;
      const values = {
        source: feedSourceFilter?.value || "all",
        type: feedTypeFilter?.value || "all",
        time: feedTimeFilter?.value || "all",
        status: feedStatusFilter?.value || "active",
        sort: feedSort?.value || "newest",
      };
      feedFilterPanel.querySelectorAll("[data-feed-filter-option]").forEach((option) => {
        const kind = option.dataset.feedFilterOption;
        const selected = values[kind] === option.dataset.feedFilterValue;
        option.setAttribute("aria-checked", String(selected));
        option.tabIndex = selected ? 0 : -1;
      });
      const labels = [feedSourceFilter, feedTypeFilter, feedTimeFilter, feedStatusFilter, feedSort]
        .map((control) => control?.selectedOptions?.[0]?.textContent?.trim())
        .filter(Boolean);
      const summary = labels.join(" · ");
      if (feedFilterSummary) feedFilterSummary.textContent = summary;
      const activeCount = Number(values.source !== "all") + Number(values.type !== "all") + Number(values.time !== "all") + Number(values.status !== "active") + Number(values.sort !== "newest");
      if (feedFilterBadge) {
        feedFilterBadge.textContent = String(activeCount);
        feedFilterBadge.hidden = activeCount === 0;
      }
      if (feedFilterReset) feedFilterReset.disabled = activeCount === 0;
      feedFilterTrigger?.classList.toggle("is-active", activeCount > 0);
      const label = summary ? L("筛选与排序") + "：" + summary : L("筛选与排序");
      feedFilterTrigger?.setAttribute("aria-label", label);
      feedFilterTrigger?.setAttribute("title", label);
    };

    const setFeedFilterOpen = (open, focusFirst = false) => {
      if (!feedFilterPanel || !feedFilterTrigger) return;
      feedFilterPanel.hidden = !open;
      feedFilterTrigger.setAttribute("aria-expanded", String(open));
      if (open) setTreeFilterOpen(false);
      if (open && focusFirst) {
        requestAnimationFrame(() => {
          if (feedFilterPanel.hidden) return;
          const selectedSource = feedFilterPanel.querySelector('[data-feed-filter-option="source"][aria-checked="true"]');
          (selectedSource instanceof HTMLElement ? selectedSource : feedFilterPanel.querySelector("[data-feed-filter-option]"))?.focus?.({ preventScroll: true });
        });
      }
    };

    const rememberFeedPresetState = () => {
      feedPresetState[activeFeedPreset] = {
        selected: selectedFeedItem,
        query: String(feedSearch?.value || ""),
        source: feedSourceFilter?.value || "all",
        type: feedTypeFilter?.value || "all",
        time: feedTimeFilter?.value || "all",
        status: feedStatusFilter?.value || "active",
        sort: feedSort?.value || "newest",
      };
    };

    const restoreFeedPresetState = (preset) => {
      const saved = feedPresetState[preset] || defaultFeedPresetState();
      selectedFeedItem = String(saved.selected || "");
      if (feedSearch) feedSearch.value = String(saved.query || "");
      if (feedSourceFilter) {
        feedSourceFilter.value = saved.source || "all";
        if (!feedSourceFilter.value) feedSourceFilter.value = "all";
      }
      if (feedTypeFilter) {
        feedTypeFilter.value = saved.type || "all";
        if (!feedTypeFilter.value) feedTypeFilter.value = "all";
      }
      if (feedTimeFilter) {
        feedTimeFilter.value = saved.time || "all";
        if (!feedTimeFilter.value) feedTimeFilter.value = "all";
      }
      if (feedStatusFilter) {
        feedStatusFilter.value = saved.status || "active";
        if (!feedStatusFilter.value) feedStatusFilter.value = "active";
      }
      if (feedSort) {
        feedSort.value = saved.sort || "newest";
        if (!feedSort.value) feedSort.value = "newest";
      }
      syncFeedFilterUi();
    };

    const setFeedStatusOptionLabel = (value, label) => {
      if (feedStatusFilter) {
        const option = [...feedStatusFilter.options].find((candidate) => candidate.value === value);
        if (option) option.textContent = label;
      }
      feedFilterPanel?.querySelectorAll('[data-feed-filter-option="status"]').forEach((option) => {
        if (option.dataset.feedFilterValue !== value) return;
        const copy = option.querySelector("span");
        if (copy) copy.textContent = label;
      });
    };

    const setFeedPreset = (preset, restoreSavedState = true) => {
      const nextPreset = preset === "feed" ? "feed" : "inbox_message";
      if (nextPreset !== activeFeedPreset) rememberFeedPresetState();
      activeFeedPreset = nextPreset;
      if (restoreSavedState) restoreFeedPresetState(activeFeedPreset);
      if (feedDirectory) feedDirectory.dataset.feedPreset = activeFeedPreset;
      if (feedWorkbench) {
        feedWorkbench.dataset.feedPreset = activeFeedPreset;
        feedWorkbench.dataset.workSurfaceLabel = activeFeedPreset === "feed" ? "Feed" : "Inbox";
      }
      const heading = feedDirectory?.querySelector("[data-feed-directory-title]");
      if (heading) heading.textContent = activeFeedPreset === "feed" ? "Feed" : "Inbox";
      const semanticType = activeFeedPreset;
      if (activeDesktopSurface === "feed" && mobileTreeTab) mobileTreeTab.textContent = semanticType === "feed" ? "Feed" : "Inbox";
      const feedDirectoryCopy = feedDirectory?.querySelector("[data-feed-directory-copy]");
      if (feedDirectoryCopy) feedDirectoryCopy.textContent = semanticType === "feed"
        ? L("所有来源消息，完整保留")
        : L("只保留需要你介入的事情");
      setFeedStatusOptionLabel("active", semanticType === "inbox_message" ? L("待处理") : L("未忽略"));
      setFeedStatusOptionLabel("inbox", semanticType === "inbox_message" ? L("未开始") : L("待处理"));
      setFeedStatusOptionLabel("saved", semanticType === "inbox_message" ? L("已完成") : L("已保存"));
      setFeedStatusOptionLabel("archived", L("已忽略"));
      syncFeedFilterUi();
      filterFeedItems(true);
      if (activeDesktopSurface === "feed") {
        setDesktopWorkSurface("feed", false, false);
        renderWorkTabs();
      }
    };

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
      const intent = relationForm.elements.relation_intent?.value || "other";
      const intentMap = {
        needs: ["outgoing", "depends_on"],
        belongs: ["outgoing", "part_of"],
        enables: ["incoming", "depends_on"],
        contains: ["incoming", "part_of"],
      };
      if (intentMap[intent]) {
        relationForm.elements.direction.value = intentMap[intent][0];
        relationForm.elements.type.value = intentMap[intent][1];
      }
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

    const requireFormFacts = (form, errorBox) => {
      const invalid = [...form.querySelectorAll("[required]")].find((control) => {
        if (control.type === "checkbox" || control.type === "radio") return !control.checked;
        return !String(control.value || "").trim();
      });
      if (!invalid) return false;
      let disclosure = invalid.closest("details");
      while (disclosure) {
        disclosure.open = true;
        disclosure = disclosure.parentElement?.closest("details");
      }
      form.querySelectorAll('[aria-invalid="true"]').forEach((control) => control.removeAttribute("aria-invalid"));
      invalid.setAttribute("aria-invalid", "true");
      const label = invalid.closest("label")?.querySelector(":scope > span")?.textContent?.trim() || L("必填信息");
      errorBox.textContent = L("请先补充：{label}", { label });
      errorBox.hidden = false;
      requestAnimationFrame(() => invalid.focus());
      return true;
    };

    const readRiskPayload = (values) => ({
      goal_ids: values.getAll("goal_ids").map(String),
      description: String(values.get("description") || "").trim(),
      probability: String(values.get("probability") || "").trim(),
      impact: String(values.get("impact") || "").trim(),
      affected_surfaces: splitLines(values.get("affected_surfaces")),
      trigger: String(values.get("trigger") || "").trim(),
      treatment: values.get("treatment"),
      treatment_plan: String(values.get("treatment_plan") || "").trim(),
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
      if (!riskState) return L("选择处理结果后，这里会说明会发生什么。");
      const active = riskState === "open" || riskState === "triggered";
      if (!active) {
        return blockingMode === "invalidate_on_trigger"
          ? L("当前不再使 Goal 失效；若此前触发，关联 Goal 必须重新验证。")
          : L("当前状态不再施加领取或完成门禁。");
      }
      if (blockingMode === "claim") return L("当前会阻止所有关联 Goal 被新的 Runtime 领取。");
      if (blockingMode === "completion") return L("当前会阻止所有关联 Goal 被标记为完成。");
      if (blockingMode === "invalidate_on_trigger") {
        return riskState === "triggered"
          ? L("Risk 已触发，所有关联 Goal 立即失效。")
          : L("Risk 目前开放；一旦标记为已触发，所有关联 Goal 会失效。");
      }
      return L("这是一条持续观察的事实，不直接阻塞领取或完成。");
    };

    const updateRiskStatePreview = (riskForm) => {
      const preview = riskForm?.querySelector("[data-risk-state-preview]");
      const stateSelect = riskForm?.querySelector("[data-risk-state-select]");
      if (preview && stateSelect) {
        const effect = riskStateEffect(riskForm.dataset.riskBlocking, stateSelect.value);
        preview.textContent = stateSelect.value === "open" || stateSelect.value === "triggered"
          ? L("保存后仍会留在待决定中。{effect}", { effect })
          : effect;
      }
      const basis = riskForm?.querySelector("[data-risk-resolution-basis]");
      if (basis && stateSelect) basis.hidden = stateSelect.value !== "resolved";
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
    const goalPageUrl = (goalId) => goalPageBase() + encodeURIComponent(goalId) + (document.body.dataset.nativeDesktop === "true" ? "?desktop=1" : "");

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
        location.assign(globalThis.goalboardNavigationUrl(route((trashIntent.trashed ? "/trash/goals/" : "/goals/") + encodeURIComponent(trashIntent.goalId))));
      } catch (error) {
        trashError.textContent = error.message || "操作失败，请检查后重试";
        trashError.hidden = false;
      } finally {
        if (!redirecting) trashSubmit.disabled = false;
      }
    };

    const setMobileView = (view) => {
      workspace.dataset.mobileView = view;
      document.querySelector(".topbar")?.setAttribute("data-mobile-surface", view);
      const directoryRootActive = view === "tree" && treePane?.dataset.desktopDirectory === "root";
      if (mobileDirectoryTab) {
        mobileDirectoryTab.classList.toggle("is-active", directoryRootActive);
        mobileDirectoryTab.setAttribute("aria-selected", String(directoryRootActive));
      }
      document.querySelectorAll("[data-mobile-target]").forEach((button) => {
        const active = button.dataset.mobileTarget === view && !(directoryRootActive && view === "tree");
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", String(active));
      });
    };

    const graphElement = () => workspace.querySelector("[data-goal-momentum]");

    const drawGoalGraph = () => {
      const graph = graphElement();
      const stage = graph?.querySelector("[data-graph-stage]");
      if (!graph || graph.hidden || !stage) return;
      const scale = Number(stage.dataset.graphScale || "1") || 1;
      const stageRect = stage.getBoundingClientRect();
      const nodeById = new Map(
        [...stage.querySelectorAll("[data-graph-node]")]
          .filter((node) => !node.hidden)
          .map((node) => [node.dataset.goalId, node]),
      );
      [...stage.querySelectorAll("[data-graph-edge]")].filter((edge) => !edge.hasAttribute("hidden")).forEach((edge, visibleEdgeIndex) => {
        const from = nodeById.get(edge.dataset.edgeFrom);
        const to = nodeById.get(edge.dataset.edgeTo);
        const path = edge.querySelector("path");
        if (!from || !to || !path) return;
        const fromRect = from.getBoundingClientRect();
        const toRect = to.getBoundingClientRect();
        const fromX = (fromRect.right - stageRect.left) / scale;
        const fromY = (fromRect.top + fromRect.height / 2 - stageRect.top) / scale;
        const toX = (toRect.left - stageRect.left) / scale;
        const toY = (toRect.top + toRect.height / 2 - stageRect.top) / scale;
        const edgeIndex = Number(edge.dataset.edgeIndex || visibleEdgeIndex) || 0;
        if (toX > fromX + 16) {
          const middleX = fromX + (toX - fromX) * .5 + ((edgeIndex % 3) - 1) * 5;
          path.setAttribute("d", "M " + fromX + " " + fromY + " H " + middleX + " V " + toY + " H " + toX);
        } else {
          const routeY = Math.min(fromY, toY) - 24 - edgeIndex % 4 * 7;
          path.setAttribute("d", "M " + fromX + " " + fromY + " H " + (fromX + 16) + " V " + routeY + " H " + (toX - 16) + " V " + toY + " H " + toX);
        }
      });
    };

    const bindGoalGraphViewport = () => {
      const viewport = graphElement()?.querySelector("[data-graph-viewport]");
      if (!viewport) return;
      if (typeof ResizeObserver === "function" && graphResizeTarget !== viewport) {
        graphResizeObserver?.disconnect();
        graphResizeTarget = viewport;
        graphResizeObserver = new ResizeObserver(() => {
          cancelAnimationFrame(graphResizeFrame);
          graphResizeFrame = requestAnimationFrame(() => graphAutoFit ? fitGoalGraph(false) : drawGoalGraph());
        });
        graphResizeObserver.observe(viewport);
      }
      if (viewport.dataset.panBound === "true") return;
      viewport.dataset.panBound = "true";
      let pointerId = null;
      let pointerX = 0;
      let pointerY = 0;
      let scrollLeft = 0;
      let scrollTop = 0;
      viewport.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || event.target.closest("button, a, input, select, textarea")) return;
        pointerId = event.pointerId;
        pointerX = event.clientX;
        pointerY = event.clientY;
        scrollLeft = viewport.scrollLeft;
        scrollTop = viewport.scrollTop;
        viewport.classList.add("is-panning");
        viewport.setPointerCapture(pointerId);
        event.preventDefault();
      });
      viewport.addEventListener("pointermove", (event) => {
        if (pointerId !== event.pointerId || !viewport.hasPointerCapture(pointerId)) return;
        viewport.scrollLeft = scrollLeft - (event.clientX - pointerX);
        viewport.scrollTop = scrollTop - (event.clientY - pointerY);
      });
      const finishPan = (event) => {
        if (pointerId !== event.pointerId) return;
        if (viewport.hasPointerCapture(pointerId)) viewport.releasePointerCapture(pointerId);
        pointerId = null;
        viewport.classList.remove("is-panning");
      };
      viewport.addEventListener("pointerup", finishPan);
      viewport.addEventListener("pointercancel", finishPan);
    };

    const updateMomentumSelection = (goalId, persist = true) => {
      const graph = graphElement();
      if (!graph?.querySelector('[data-momentum-node][data-goal-id="' + CSS.escape(goalId || "") + '"]')) return;
      momentumSelected = goalId;
      const relatedGoalIds = new Set([goalId]);
      const defaultMarker = graph.querySelector("#momentum-arrow");
      if (defaultMarker && !graph.querySelector("#momentum-arrow-selected")) {
        const selectedMarker = defaultMarker.cloneNode(true);
        selectedMarker.id = "momentum-arrow-selected";
        defaultMarker.after(selectedMarker);
      }
      graph.querySelectorAll("[data-graph-edge]").forEach((edge) => {
        const related = edge.dataset.edgeFrom === goalId || edge.dataset.edgeTo === goalId;
        edge.classList.toggle("is-selected-path", related);
        edge.querySelector("path")?.setAttribute(
          "marker-end",
          related ? "url(#momentum-arrow-selected)" : "url(#momentum-arrow)",
        );
        if (related && edge.dataset.edgeFrom) relatedGoalIds.add(edge.dataset.edgeFrom);
        if (related && edge.dataset.edgeTo) relatedGoalIds.add(edge.dataset.edgeTo);
      });
      graph.querySelectorAll("[data-momentum-node]").forEach((node) => {
        const active = node.dataset.goalId === goalId;
        node.classList.toggle("is-selected", active);
        node.classList.toggle("is-connected-path", !active && relatedGoalIds.has(node.dataset.goalId));
        node.setAttribute("aria-pressed", String(active));
      });
      graph.querySelectorAll("[data-momentum-select]").forEach((button) => {
        const active = button.dataset.momentumSelect === goalId;
        button.classList.toggle("is-selected", active);
        if (button.matches(".momentum-queue-item")) button.setAttribute("aria-pressed", String(active));
      });
      graph.querySelectorAll("[data-momentum-detail]").forEach((detail) => {
        detail.hidden = detail.dataset.momentumDetail !== goalId;
      });
      requestAnimationFrame(drawGoalGraph);
      if (persist) queueSave();
    };

    const updateGraphVisibility = () => {
      const graph = graphElement();
      if (!graph) return;
      graph.dataset.filter = momentumOpenOnly ? "open" : "all";
      const query = String(treeSearch.value || "").trim().toLowerCase();
      const visibleNodeIds = new Set();
      graph.querySelectorAll("[data-graph-node]").forEach((node) => {
        const matchesQuery = !query || String(node.dataset.goalSearch || "").includes(query);
        const matchesStatus = selectedStatuses.size === 0 || selectedStatuses.has(node.dataset.goalStatus);
        const matchesCompletion = !momentumOpenOnly || node.dataset.goalCompleted !== "true";
        node.hidden = !(matchesQuery && matchesStatus && matchesCompletion);
        if (!node.hidden) visibleNodeIds.add(node.dataset.goalId);
      });
      graph.querySelectorAll("[data-graph-edge]").forEach((edge) => {
        const hidden = !visibleNodeIds.has(edge.dataset.edgeFrom) ||
          !visibleNodeIds.has(edge.dataset.edgeTo);
        edge.toggleAttribute("hidden", hidden);
      });
      graph.querySelectorAll("[data-momentum-group]").forEach((group) => {
        const hasVisibleNode = [...graph.querySelectorAll("[data-momentum-node]")]
          .some((node) => !node.hidden && node.dataset.momentumGroupId === group.dataset.momentumGroup);
        group.toggleAttribute("hidden", !hasVisibleNode);
      });
      graph.querySelectorAll("[data-momentum-filter]").forEach((button) => {
        const active = button.dataset.momentumFilter === (momentumOpenOnly ? "open" : "all");
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      updateMomentumSelection(momentumSelected || selected, false);
      requestAnimationFrame(() => graphAutoFit ? fitGoalGraph(false) : drawGoalGraph());
    };

    const setMomentumPeriod = (value, persist = true) => {
      const graph = graphElement();
      momentumPeriod = Number(value) === 30 ? 30 : 7;
      graph?.querySelectorAll("[data-momentum-period]").forEach((button) => {
        const active = Number(button.dataset.momentumPeriod) === momentumPeriod;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      graph?.querySelectorAll("[data-momentum-period-panel]").forEach((panel) => {
        panel.hidden = Number(panel.dataset.momentumPeriodPanel) !== momentumPeriod;
      });
      if (persist) queueSave();
    };

    const setGraphZoom = (value, persist = true, autoFit = false) => {
      const graph = graphElement();
      const stage = graph?.querySelector("[data-graph-stage]");
      graphAutoFit = autoFit;
      graphZoom = Math.min(1.25, Math.max(.55, Math.round((Number(value) || 1) * 100) / 100));
      if (stage) {
        stage.dataset.graphScale = String(graphZoom);
        stage.style.zoom = String(graphZoom);
      }
      const output = graph?.querySelector("[data-graph-zoom-value]");
      if (output) output.textContent = Math.round(graphZoom * 100) + "%";
      graph?.querySelector('[data-graph-zoom="out"]')?.toggleAttribute("disabled", graphZoom <= .55);
      graph?.querySelector('[data-graph-zoom="in"]')?.toggleAttribute("disabled", graphZoom >= 1.25);
      requestAnimationFrame(drawGoalGraph);
      if (persist) queueSave();
    };

    const fitGoalGraph = (persist = true) => {
      const graph = graphElement();
      const viewport = graph?.querySelector("[data-graph-viewport]");
      const stage = graph?.querySelector("[data-graph-stage]");
      if (!viewport || !stage) return;
      const availableWidth = Math.max(1, viewport.clientWidth - 24);
      const scale = Math.min(1, availableWidth / stage.offsetWidth);
      setGraphZoom(scale, persist, true);
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    };

    const loadGoalGraph = async (force = false) => {
      const graph = graphElement();
      if (!graph || (!force && graph.dataset.loaded === "true")) return true;
      if (goalGraphRequest) return goalGraphRequest;
      const status = graph.querySelector("[data-goal-momentum-status]");
      const retry = graph.querySelector("[data-retry-goal-momentum]");
      if (status) status.textContent = L("正在载入推进态势…");
      if (retry) retry.hidden = true;
      graph.setAttribute("aria-busy", "true");
      goalGraphRequest = (async () => {
        try {
          const response = await fetch(
            route("/api/board/momentum?view=" + documentCollection + "&goal_id=" + encodeURIComponent(momentumSelected || selected || "")),
            { cache: "no-store" },
          );
          if (!response.ok) throw new Error(L("无法载入推进态势"));
          const template = document.createElement("template");
          template.innerHTML = (await response.text()).trim();
          const nextGraph = template.content.querySelector("[data-goal-momentum]");
          if (!nextGraph) throw new Error(L("推进态势响应不完整"));
          nextGraph.dataset.loaded = "true";
          graph.replaceWith(nextGraph);
          setWorkspaceMode("graph", false);
          bindGoalGraphViewport();
          if (graphAutoFit) requestAnimationFrame(() => fitGoalGraph(false));
          else setGraphZoom(graphZoom, false, false);
          setMomentumPeriod(momentumPeriod, false);
          updateGraphVisibility();
          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : L("无法载入推进态势");
          if (status) status.textContent = message;
          if (retry) retry.hidden = false;
          return false;
        } finally {
          graph.removeAttribute("aria-busy");
          goalGraphRequest = null;
        }
      })();
      return goalGraphRequest;
    };

    const setWorkspaceMode = (view, persist = true) => {
      const graph = graphElement();
      const nextMode = view === "graph" && graph
        ? "graph"
        : view === "runtime" && tuiPane
          ? "runtime"
          : "focus";
      navigatorView = nextMode === "graph" ? "graph" : "list";
      treePane.dataset.navigatorView = navigatorView;
      workspace.dataset.navigatorView = navigatorView;
      workspace.dataset.workspaceMode = nextMode;
      workspace.classList.toggle("is-graph-view", nextMode === "graph");
      documentPane.hidden = nextMode !== "focus";
      if (tuiPane) tuiPane.hidden = nextMode !== "runtime";
      document.querySelectorAll("button[data-navigator-view]").forEach((button) => {
        const active = button.dataset.navigatorView === navigatorView;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", String(active));
      });
      document.querySelectorAll("button[data-workbench-view]").forEach((button) => {
        const active = button.dataset.workbenchView === nextMode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", String(active));
        button.setAttribute("tabindex", active ? "0" : "-1");
      });
      if (graph) graph.hidden = nextMode !== "graph";
      if (nextMode === "graph") {
        if (graph?.dataset.loaded === "true") updateGraphVisibility();
        else void loadGoalGraph();
      }
      if (matchMedia("(max-width: 760px)").matches) setMobileView(nextMode === "runtime" ? "tui" : "document");
      if (persist) queueSave();
    };

    const setNavigatorView = (view, persist = true) => {
      setWorkspaceMode(view === "graph" ? "graph" : "focus", persist);
    };

    const goalPanelFromTargetId = (targetId) => {
      if (!targetId) return "";
      const target = document.getElementById(targetId);
      const renderedPanel = target?.closest?.("[data-goal-panel]")?.dataset.goalPanel;
      if (renderedPanel) return renderedPanel;
      const panelTarget = targetId.match(/^goal-panel-(overview|completion|progress|factors|records)-/);
      if (panelTarget) return panelTarget[1];
      if (targetId.startsWith("completion-") || targetId.startsWith("acceptance-")) return "completion";
      if (targetId.startsWith("progress-")) return "progress";
      if (/^(?:goal-factor-panel|relation|risk|impact)-/.test(targetId)) return "factors";
      return "";
    };

    const goalPanelFromHash = () => {
      const targetId = decodeURIComponent(location.hash.slice(1));
      return goalPanelFromTargetId(targetId);
    };

    const goalFactorFromTargetId = (targetId) => {
      if (!targetId) return "";
      const target = document.getElementById(targetId);
      const renderedFactor = target?.closest?.("[data-goal-factor-panel]")?.dataset.goalFactorPanel;
      if (renderedFactor) return renderedFactor;
      const factorTarget = targetId.match(/^goal-factor-panel-(relations|risks|impacts|rules)-/);
      if (factorTarget) return factorTarget[1];
      if (targetId.startsWith("relation-")) return "relations";
      if (targetId.startsWith("risk-")) return "risks";
      if (targetId.startsWith("impact-")) return "impacts";
      return "";
    };

    const goalFactorFromHash = () => {
      const targetId = decodeURIComponent(location.hash.slice(1));
      return goalFactorFromTargetId(targetId);
    };

    const isAbortError = (error) => error instanceof DOMException && error.name === "AbortError";

    const abortGoalRecordsRequest = () => {
      goalRecordsRequest?.abort();
    };

    const loadGoalRecords = async (article) => {
      const container = article?.querySelector("[data-goal-records-content]");
      if (!container || container.dataset.loaded === "true" || container.dataset.loading === "true") return;
      const goalId = article.dataset.goalView;
      if (!goalId) return;
      abortGoalRecordsRequest();
      const controller = new AbortController();
      goalRecordsRequest = controller;
      container.dataset.loading = "true";
      container.setAttribute("aria-busy", "true");
      try {
        const response = await fetch(
          route("/api/goals/" + encodeURIComponent(goalId) + "/records?view=" + documentCollection),
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error(L("无法读取这条 Goal 的完整记录"));
        const template = document.createElement("template");
        template.innerHTML = (await response.text()).trim();
        const records = template.content.querySelector('[data-goal-section="technical"]');
        if (!records) throw new Error(L("Goal 记录响应不完整"));
        if (!article.isConnected || article.dataset.goalView !== goalId) return;
        container.replaceChildren(records);
        container.dataset.loaded = "true";
        const hashTargetId = decodeURIComponent(location.hash.slice(1));
        if (hashTargetId) void revealDeepLinkFromId(hashTargetId);
      } catch (error) {
        if (isAbortError(error)) return;
        if (!article.isConnected || article.dataset.goalView !== goalId) return;
        const message = error instanceof Error ? error.message : L("无法载入完整记录");
        const errorRow = document.createElement("p");
        errorRow.className = "empty-row";
        errorRow.setAttribute("role", "alert");
        errorRow.textContent = message;
        container.replaceChildren(errorRow);
        showToast(message, true);
      } finally {
        if (goalRecordsRequest === controller) {
          goalRecordsRequest = null;
          container.dataset.loading = "false";
          container.removeAttribute("aria-busy");
        }
      }
    };

    const abortGoalPanelRequest = () => {
      goalPanelRequest?.abort();
    };

    const loadGoalPanel = async (article, panelName) => {
      const panel = article?.querySelector('[data-goal-panel="' + panelName + '"]');
      if (!panel || panel.dataset.loaded === "true" || panel.dataset.loading === "true") return;
      const goalId = article.dataset.goalView;
      if (!goalId || !["completion", "progress", "factors"].includes(panelName)) return;
      abortGoalPanelRequest();
      const controller = new AbortController();
      goalPanelRequest = controller;
      panel.dataset.loading = "true";
      panel.setAttribute("aria-busy", "true");
      const status = panel.querySelector("[data-goal-panel-status]");
      if (status) status.textContent = L("正在载入…");
      try {
        const response = await fetch(
          route("/api/goals/" + encodeURIComponent(goalId) + "/panels/" + panelName + "?view=" + documentCollection),
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error(L("无法读取这个 Goal 区域"));
        const template = document.createElement("template");
        template.innerHTML = (await response.text()).trim();
        if (!template.content.childNodes.length) throw new Error(L("Goal 区域响应不完整"));
        if (!article.isConnected || article.dataset.goalView !== goalId || goalPanelRequest !== controller) return;
        panel.replaceChildren(...template.content.childNodes);
        panel.dataset.loaded = "true";
        updateAllRelationFormPreviews();
        document.querySelectorAll("[data-risk-state-form]").forEach(updateRiskStatePreview);
        document.querySelectorAll(".risk-goal-picker").forEach(updateRiskGoalCount);
        if (panelName === "factors") {
          setGoalFactor(goalFactorFromHash() || article.dataset.activeFactor || "relations", false);
        }
        const hashTarget = document.getElementById(decodeURIComponent(location.hash.slice(1)));
        if (hashTarget) revealFocusTarget(hashTarget);
      } catch (error) {
        if (isAbortError(error) || goalPanelRequest !== controller) return;
        if (!article.isConnected || article.dataset.goalView !== goalId) return;
        const message = error instanceof Error ? error.message : L("无法载入这个 Goal 区域");
        const errorRow = document.createElement("button");
        errorRow.type = "button";
        errorRow.className = "empty-row goal-panel-lazy-retry";
        errorRow.dataset.retryGoalPanel = panelName;
        errorRow.textContent = L("{message}，点击重试", { message });
        panel.replaceChildren(errorRow);
        showToast(message, true);
      } finally {
        if (goalPanelRequest === controller) {
          goalPanelRequest = null;
          panel.dataset.loading = "false";
          panel.removeAttribute("aria-busy");
        }
      }
    };

    const loadMoreGoalEvents = async (button) => {
      const pagination = button.closest("[data-goal-event-pagination]");
      const article = button.closest("[data-goal-view]");
      const eventList = article?.querySelector("[data-goal-event-list]");
      const goalId = article?.dataset.goalView;
      const offset = Number.parseInt(pagination?.dataset.nextOffset || "", 10);
      if (!pagination || !eventList || !goalId || !Number.isSafeInteger(offset) || offset < 0) return;
      abortGoalRecordsRequest();
      const controller = new AbortController();
      goalRecordsRequest = controller;
      const defaultLabel = button.textContent;
      const errorBox = pagination.querySelector("[data-goal-event-error]");
      button.disabled = true;
      button.textContent = L("正在载入…");
      if (errorBox) errorBox.hidden = true;
      try {
        const response = await fetch(
          route("/api/goals/" + encodeURIComponent(goalId) + "/record-events?view=" + documentCollection + "&offset=" + offset),
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error(L("无法读取更早的 Goal 记录"));
        const template = document.createElement("template");
        template.innerHTML = (await response.text()).trim();
        const page = template.content.querySelector("[data-goal-event-page]");
        const pageList = page?.querySelector("ol");
        if (!page || !pageList) throw new Error(L("Goal 事件响应不完整"));
        if (!article.isConnected || article.dataset.goalView !== goalId) return;
        eventList.append(...Array.from(pageList.children));
        const nextOffset = Number.parseInt(page.dataset.nextOffset || "", 10);
        const total = Number.parseInt(page.dataset.total || "", 10);
        if (!Number.isSafeInteger(nextOffset) || !Number.isSafeInteger(total)) throw new Error(L("Goal 事件响应不完整"));
        pagination.dataset.nextOffset = String(nextOffset);
        pagination.dataset.total = String(total);
        const progress = pagination.querySelector("[data-goal-event-progress]");
        if (progress) progress.textContent = L("已显示 {shown}/{total} 条事件", { shown: nextOffset, total });
        if (page.dataset.hasMore !== "true") button.remove();
      } catch (error) {
        if (isAbortError(error)) return;
        if (!article.isConnected || article.dataset.goalView !== goalId) return;
        const message = error instanceof Error ? error.message : L("无法载入更早记录");
        if (errorBox) {
          errorBox.textContent = message;
          errorBox.hidden = false;
        }
      } finally {
        if (goalRecordsRequest === controller) {
          goalRecordsRequest = null;
          if (button.isConnected) {
            button.disabled = false;
            button.textContent = defaultLabel;
          }
        }
      }
    };

    const activateFocusSection = (trigger) => {
      const card = trigger?.closest?.("[data-focus-section-card]");
      const deck = card?.closest?.("[data-focus-section-deck]");
      if (!card || !deck) return false;
      const sectionKey = card.dataset.focusSectionCard;
      deck.dataset.activeSection = sectionKey;
      deck.querySelectorAll("[data-focus-section-card-row] > [data-focus-section-card]").forEach((candidate) => {
        const active = candidate === card;
        candidate.classList.toggle("is-active", active);
        const candidateTrigger = candidate.querySelector(":scope > [data-focus-section-trigger]");
        candidateTrigger?.setAttribute("aria-expanded", String(active));
      });
      deck.querySelectorAll(":scope > [data-focus-section-stage] > [data-focus-section-body]").forEach((body) => {
        const active = body.dataset.focusSectionBody === sectionKey;
        body.classList.toggle("is-active", active);
        body?.setAttribute("aria-hidden", String(!active));
        body?.toggleAttribute("inert", !active);
      });
      return true;
    };

    const revealFocusTarget = (target) => {
      const card = target?.closest?.("[data-focus-section-card]");
      const body = target?.closest?.("[data-focus-section-body]");
      const deck = card?.closest?.("[data-focus-section-deck]") || body?.closest?.("[data-focus-section-deck]");
      const sectionKey = card?.dataset?.focusSectionCard || body?.dataset?.focusSectionBody;
      const trigger = sectionKey ? deck?.querySelector?.('[data-focus-section-trigger="' + CSS.escape(sectionKey) + '"]') : null;
      return trigger ? activateFocusSection(trigger) : false;
    };

    const decisionActionSelector = "[data-human-review-form], [data-goal-tree-decision-form], [data-contract-decision-form], [data-candidate-decision-form], [data-rewire-decision-form], [data-risk-state-form]";

    const activateDecisionFeedItem = (itemId) => {
      setFeedPreset("inbox_message", false);
      setDesktopDirectory("feed", false, false);
      if (desktopWorkSurfaces.length) setDesktopWorkSurface("feed", false, false);
      if (matchMedia("(max-width: 760px)").matches) setMobileView("document");
      let row = [...feedList.querySelectorAll("[data-feed-entry-id]")]
        .find((candidate) => candidate.dataset.feedEntryId === itemId);
      if (row?.hidden) {
        if (feedSearch) feedSearch.value = "";
        if (feedSourceFilter) feedSourceFilter.value = "all";
        if (feedStatusFilter) feedStatusFilter.value = "active";
        filterFeedItems(false);
        row = [...feedList.querySelectorAll("[data-feed-entry-id]")]
          .find((candidate) => candidate.dataset.feedEntryId === itemId);
      }
      if (row && !row.hidden) selectFeedItem(itemId);
      return row;
    };

    const revealDeepLinkTarget = (target) => {
      const decisionDetail = target?.matches?.("[data-feed-detail^='decision:']")
        ? target
        : target?.closest?.("[data-feed-detail^='decision:']");
      let scrollTarget = target;
      if (decisionView && decisionDetail && feedList && feedWorkbench) {
        const itemId = decisionDetail.dataset.feedDetail;
        activateDecisionFeedItem(itemId);
        scrollTarget = decisionDetail.querySelector(decisionActionSelector) || target;
      }
      let disclosure = target?.matches?.("details") ? target : target?.closest?.("details");
      while (disclosure) {
        disclosure.open = true;
        disclosure = disclosure.parentElement?.closest?.("details");
      }
      revealFocusTarget(target);
      return scrollTarget;
    };

    const deepLinkTargetFromId = (targetId) => {
      const directTarget = targetId ? document.getElementById(targetId) : null;
      if (directTarget || !decisionView || !targetId?.startsWith("decision-goal-")) return directTarget;
      const goalId = targetId.slice("decision-goal-".length);
      const itemId = "decision:" + goalId;
      return [...(feedWorkbench?.querySelectorAll("[data-feed-detail]") || [])]
        .find((candidate) => candidate.dataset.feedDetail === itemId) || null;
    };

    const revealDeepLinkFromId = async (targetId, behavior = "auto") => {
      let target = deepLinkTargetFromId(targetId);
      const legacyDecisionGoalId = decisionView && targetId?.startsWith("decision-goal-")
        ? targetId.slice("decision-goal-".length)
        : "";
      if (!target && legacyDecisionGoalId && feedList && feedWorkbench) {
        const itemId = "decision:" + legacyDecisionGoalId;
        activateDecisionFeedItem(itemId);
        if (!(await ensureFeedWorkbenchLoaded())) return null;
        target = [...feedWorkbench.querySelectorAll("[data-feed-detail]")]
          .find((candidate) => candidate.dataset.feedDetail === itemId) || null;
      }
      if (!target) return null;
      const scrollTarget = revealDeepLinkTarget(target);
      requestAnimationFrame(() => {
        scrollTarget.scrollIntoView({ behavior, block: "start" });
        if (scrollTarget.matches?.(decisionActionSelector)) {
          scrollTarget.setAttribute("tabindex", "-1");
          if (!scrollTarget.hasAttribute("aria-label")) {
            scrollTarget.setAttribute(
              "aria-label",
              scrollTarget.querySelector('button[type="submit"]')?.textContent?.trim() || L("待处理决定"),
            );
          }
          scrollTarget.focus({ preventScroll: true });
        }
      });
      return target;
    };

    const setGoalPanel = (panelName, persist = true, updateHash = false, resetScroll = false) => {
      const article = documentPane.querySelector("[data-goal-view]");
      if (!article) return false;
      const panel = goalPanelKeys.includes(panelName) ? panelName : "overview";
      const activePanel = article.querySelector('[data-goal-panel="' + panel + '"]');
      if (!activePanel) return false;
      article.dataset.activePanel = panel;
      article.querySelectorAll("[data-goal-tab]").forEach((button) => {
        const active = button.dataset.goalTab === panel;
        button.setAttribute("aria-selected", String(active));
        button.setAttribute("tabindex", active ? "0" : "-1");
      });
      article.querySelectorAll("[data-goal-panel]").forEach((candidate) => {
        candidate.hidden = candidate !== activePanel;
      });
      if (panel === "records") void loadGoalRecords(article);
      else {
        abortGoalRecordsRequest();
        if (panel !== "overview") void loadGoalPanel(article, panel);
      }
      if (updateHash) history.replaceState(history.state, "", "#" + activePanel.id);
      if (resetScroll) documentPane.scrollTop = 0;
      if (persist) queueSave();
      return true;
    };

    const setGoalFactor = (factorName, persist = true, updateHash = false) => {
      const article = documentPane.querySelector("[data-goal-view]");
      if (!article) return false;
      const factor = goalFactorKeys.includes(factorName) ? factorName : "relations";
      const activePanel = article.querySelector('[data-goal-factor-panel="' + factor + '"]');
      if (!activePanel) {
        article.dataset.activeFactor = factor;
        return false;
      }
      const trigger = article.querySelector('[data-goal-factor-tab="' + factor + '"]');
      if (trigger) activateFocusSection(trigger);
      article.dataset.activeFactor = factor;
      article.querySelectorAll("[data-goal-factor-tab]").forEach((button) => {
        const active = button.dataset.goalFactorTab === factor;
        button.setAttribute("aria-selected", String(active));
        button.setAttribute("tabindex", active ? "0" : "-1");
      });
      if (updateHash) history.replaceState(history.state, "", "#" + activePanel.id);
      if (persist) queueSave();
      return true;
    };

    const resetQuickRecordDialog = (quickDialog) => {
      if (!quickDialog) return;
      const choices = quickDialog.querySelector("[data-quick-record-choices]");
      if (choices) choices.hidden = false;
      quickDialog.querySelectorAll("[data-quick-record-panel]").forEach((panel) => { panel.hidden = true; });
      const title = quickDialog.querySelector("[data-quick-record-title]");
      if (title) title.textContent = L("快速记录");
    };

    const loadAndOpenQuickRecord = async (opener) => {
      const article = opener?.closest?.("[data-goal-view]");
      const goalId = article?.dataset.goalView;
      if (!article || !goalId) return;
      let quickDialog = article.querySelector("[data-quick-record-dialog]");
      if (!quickDialog) {
        quickRecordRequest?.abort();
        const controller = new AbortController();
        quickRecordRequest = controller;
        const original = opener.innerHTML;
        opener.disabled = true;
        opener.setAttribute("aria-busy", "true");
        opener.textContent = L("正在载入…");
        try {
          const response = await fetch(
            route("/api/goals/" + encodeURIComponent(goalId) + "/quick-record?view=" + documentCollection),
            { cache: "no-store", signal: controller.signal },
          );
          if (!response.ok) throw new Error(L("无法打开快速记录"));
          const template = document.createElement("template");
          template.innerHTML = (await response.text()).trim();
          const nextDialog = template.content.querySelector("[data-quick-record-dialog]");
          if (!nextDialog) throw new Error(L("快速记录响应不完整"));
          if (!article.isConnected || article.dataset.goalView !== goalId || quickRecordRequest !== controller) return;
          article.append(nextDialog);
          quickDialog = nextDialog;
          updateAllRelationFormPreviews();
          document.querySelectorAll(".risk-goal-picker").forEach(updateRiskGoalCount);
        } catch (error) {
          if (isAbortError(error) || quickRecordRequest !== controller) return;
          showToast(error instanceof Error ? error.message : L("无法打开快速记录"), true);
          return;
        } finally {
          if (quickRecordRequest === controller) {
            quickRecordRequest = null;
            if (opener.isConnected) {
              opener.disabled = false;
              opener.removeAttribute("aria-busy");
              opener.innerHTML = original;
            }
          }
        }
      }
      if (!quickDialog) return;
      quickDialog._opener = opener;
      resetQuickRecordDialog(quickDialog);
      quickDialog.showModal();
      requestAnimationFrame(() => quickDialog.querySelector("[data-quick-record-type]")?.focus());
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
      requestAnimationFrame(() => graphAutoFit ? fitGoalGraph(false) : drawGoalGraph());
      if (persist) queueSave();
    };

    const setDirectoryCollapsed = (collapsed, persist = true) => {
      const nextCollapsed = Boolean(collapsed);
      if (nextCollapsed && !workspace.classList.contains("is-directory-collapsed")) {
        const currentWidth = Math.round(treePane?.getBoundingClientRect().width || 0);
        if (currentWidth > 44) workspace.style.setProperty("--tree-width", currentWidth + "px");
      }
      workspace.classList.toggle("is-directory-collapsed", nextCollapsed);
      document.querySelectorAll("[data-directory-toggle]").forEach((button) => {
        button.setAttribute("aria-expanded", String(!nextCollapsed));
        button.setAttribute("aria-label", nextCollapsed ? L("展开目录") : L("收起目录"));
        button.setAttribute("title", nextCollapsed ? L("展开目录") : L("收起目录"));
      });
      treeResizer?.setAttribute("aria-hidden", String(nextCollapsed));
      requestAnimationFrame(() => graphAutoFit ? fitGoalGraph(false) : drawGoalGraph());
      if (persist) queueSave();
    };

    const readUiState = () => {
      rememberFeedPresetState();
      return ({
      selected,
      collapsed: [...document.querySelectorAll("[data-tree-item].is-collapsed")].map((item) => item.dataset.goalId),
      disclosures: [...document.querySelectorAll("[data-persist-open][open]")].map((item) => item.dataset.persistOpen),
      treeTop: treeScroll.scrollTop,
      documentTop: activeDesktopSurface === "goal" ? documentPane.scrollTop : Number(desktopSurfaceScroll.goal || 0),
      workSurface: activeDesktopSurface,
      surfaceScroll: { ...desktopSurfaceScroll, [activeDesktopSurface]: documentPane.scrollTop },
      treeWidth: parseFloat(workspace.style.getPropertyValue("--tree-width")) || treePane.getBoundingClientRect().width,
      tuiWidth: workspace.classList.contains("is-tui-collapsed")
        ? parseFloat(workspace.style.getPropertyValue("--tui-width")) || undefined
        : tuiPane?.getBoundingClientRect().width,
      query: treeSearch.value,
      statuses: [...selectedStatuses],
      mobileView: workspace.dataset.mobileView || "tree",
      navigatorView,
      workspaceMode: activeDesktopSurface === "goal" ? workspace.dataset.workspaceMode || "focus" : goalWorkspaceMode,
      momentumOpenOnly,
      momentumPeriod,
      momentumSelected,
      graphZoom,
      graphAutoFit,
      navigationVersion: desktopNavigationStateVersion,
      directory: treePane?.dataset.desktopDirectory || "root",
      directoryCollapsed: workspace.classList.contains("is-directory-collapsed"),
      feedPreset: activeFeedPreset,
      feedSelected: selectedFeedItem,
      feedQuery: feedSearch?.value || "",
      feedSource: feedSourceFilter?.value || "all",
      feedType: feedTypeFilter?.value || "all",
      feedTime: feedTimeFilter?.value || "all",
      feedStatus: feedStatusFilter?.value || "active",
      feedSort: feedSort?.value || "newest",
      feedPresets: feedPresetState,
      sourceSelected: selectedSource,
      sourceQuery: sourceSearch?.value || "",
      sourceFilter: activeSourceFilter,
      sourceDetailTab: sourceWorkbench?.querySelector('[data-source-detail="' + CSS.escape(selectedSource) + '"] [data-source-detail-tab][aria-selected="true"]')?.dataset.sourceDetailTab || "overview",
      goalPanel: documentPane.querySelector('[data-goal-tab][aria-selected="true"]')?.dataset.goalTab || "overview",
      goalFactor: documentPane.querySelector('[data-goal-factor-tab][aria-selected="true"]')?.dataset.goalFactorTab || "relations",
      });
    };

    const applyUiState = (ui) => {
      desktopSurfaceScroll = ui?.surfaceScroll && typeof ui.surfaceScroll === "object" ? { ...ui.surfaceScroll } : {};
      if (ui?.documentTop != null && desktopSurfaceScroll.goal == null) desktopSurfaceScroll.goal = Number(ui.documentTop || 0);
      goalWorkspaceMode = ui?.workspaceMode || "focus";
      const requestedDesktopSurface = ui?.workSurface || (decisionView ? "feed" : "goal");
      const nextDesktopSurface = desktopWorkSurfaces.some((candidate) => candidate.dataset.workSurface === requestedDesktopSurface)
        ? requestedDesktopSurface
        : decisionView ? "feed" : "goal";
      if (ui?.treeWidth) setTreeWidth(ui.treeWidth, false);
      if (ui?.tuiWidth) setTuiWidth(ui.tuiWidth, false);
      setDirectoryCollapsed(ui?.directoryCollapsed === true, false);
      if (desktopDirectoryPanels.length) {
        const restoredDirectory = ui?.navigationVersion === desktopNavigationStateVersion
          ? ui?.directory || (decisionView ? "feed" : "root")
          : decisionView ? "feed" : "root";
        setDesktopDirectory(restoredDirectory, false, false);
      }
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
      momentumOpenOnly = ui?.momentumOpenOnly === true;
      momentumPeriod = Number(ui?.momentumPeriod) === 30 ? 30 : 7;
      momentumSelected = String(ui?.momentumSelected || selected || "");
      graphZoom = Number(ui?.graphZoom) || graphZoom;
      graphAutoFit = ui?.graphAutoFit !== false;
      filterTree(ui?.query || "");
      if (feedDirectory) {
        const deepLinkedDecisionEntry = decisionFeedEntryFromHash();
        activeFeedPreset = deepLinkedDecisionEntry ? "inbox_message" : ui?.feedPreset === "feed" ? "feed" : "inbox_message";
        const persistedPresets = ui?.feedPresets && typeof ui.feedPresets === "object"
          ? ui.feedPresets
          : {};
        feedPresetState = {
          inbox_message: { ...defaultFeedPresetState(), ...(persistedPresets.inbox_message || {}) },
          feed: { ...defaultFeedPresetState(), ...(persistedPresets.feed || {}) },
        };
        if (!ui?.feedPresets) {
          feedPresetState[activeFeedPreset] = {
            selected: String(ui?.feedSelected || selectedFeedItem || ""),
            query: String(ui?.feedQuery || ""),
            source: ui?.feedSource || "all",
            type: ui?.feedType || "all",
            time: ui?.feedTime || "all",
            status: ui?.feedStatus || "active",
            sort: ui?.feedSort || "newest",
          };
        }
        if (deepLinkedDecisionEntry) {
          feedPresetState.inbox_message = {
            ...feedPresetState.inbox_message,
            selected: deepLinkedDecisionEntry,
            query: "",
            source: "all",
            type: "all",
            time: "all",
            status: "active",
          };
        }
        setFeedPreset(activeFeedPreset, true);
      }
      const restoredSourceDetailTab = String(ui?.sourceDetailTab || "overview");
      if (sourceDirectory) {
        const availableSourceFilters = new Set(["all", "account", "public", "attention"]);
        activeSourceFilter = availableSourceFilters.has(ui?.sourceFilter) ? ui.sourceFilter : "all";
        selectedSource = String(ui?.sourceSelected || selectedSource || "");
        if (sourceSearch) sourceSearch.value = String(ui?.sourceQuery || "");
        sourceDirectory.querySelectorAll("[data-source-filter]").forEach((button) => {
          const active = button.dataset.sourceFilter === activeSourceFilter;
          button.classList.toggle("is-active", active);
          button.setAttribute("aria-pressed", String(active));
        });
        filterSources(true);
        if (selectedSource) selectSource(selectedSource, false);
      }
      setWorkspaceMode(ui?.workspaceMode || (ui?.navigatorView === "graph" ? "graph" : "focus"), false);
      if (desktopWorkSurfaces.length) setDesktopWorkSurface(nextDesktopSurface, false, false);
      if (nextDesktopSurface === "feed" && selectedFeedItem) {
        selectFeedItem(selectedFeedItem, false, true);
      }
      if (nextDesktopSurface === "sources" && selectedSource) {
        const selectedDetail = sourceWorkbench?.querySelector('[data-source-detail="' + CSS.escape(selectedSource) + '"]');
        setSourceDetailTab(selectedDetail, restoredSourceDetailTab);
      }
      bindGoalGraphViewport();
      if (graphAutoFit) requestAnimationFrame(() => fitGoalGraph(false));
      else setGraphZoom(graphZoom, false, false);
      setGoalPanel(goalPanelFromHash() || (ui?.selected === selected ? ui?.goalPanel : "overview"), false);
      setGoalFactor(goalFactorFromHash() || (ui?.selected === selected ? ui?.goalFactor : "relations"), false);
      const hashTargetId = decodeURIComponent(location.hash.slice(1));
      const hashTarget = hashTargetId ? document.getElementById(hashTargetId) : null;
      treeScroll.scrollTop = Number(ui?.treeTop || 0);
      documentPane.scrollTop = hashTarget?.matches?.("[data-goal-panel]") && activeDesktopSurface === "goal"
        ? 0
        : activeDesktopSurface === "goal" && ui?.selected === selected
          ? Number(ui?.documentTop || 0)
          : Number(desktopSurfaceScroll[activeDesktopSurface] || 0);
      const restoredMobileView = desktopCompanionActive && selected ? "document" : ui?.mobileView || "tree";
      if (matchMedia("(max-width: 760px)").matches) {
        if (restoredMobileView === "tui") setWorkspaceMode("runtime", false);
        if (restoredMobileView === "document") setWorkspaceMode("focus", false);
      }
      setMobileView(restoredMobileView);
      if (hashTargetId) void revealDeepLinkFromId(hashTargetId);
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
      momentumSelected = goalId;
      document.querySelector("[data-tui-pane]")?.setAttribute("data-goal-id", goalId);
      document.dispatchEvent(new CustomEvent("goalboard:goal-changed", { detail: {
        goalId,
        goalTitle: item.goal.title,
        status: item.status,
        statusLabel: item.status_label,
        statusMeaning: item.status_meaning,
        statusIconMarkup: item.status_icon,
        parentReadOnly: Boolean(item.is_compound_parent),
        children: item.children || [],
      } }));
      document.querySelectorAll(".tree-node[data-select-goal]").forEach((button) => {
        const active = button.dataset.selectGoal === goalId;
        button.classList.toggle("is-selected", active);
        button.setAttribute("aria-pressed", String(active));
        if (active) expandAncestors(button);
      });
      if (navigatorView === "graph") updateGraphVisibility();
      document.title = item.goal.title + " · GoalBoard";
      if (resetScroll && activeDesktopSurface === "goal") documentPane.scrollTop = 0;
      renderWorkTabs();
      return true;
    };

    const replaceGoalDocument = (html) => {
      abortGoalPanelRequest();
      quickRecordRequest?.abort();
      const template = document.createElement("template");
      template.innerHTML = String(html || "").trim();
      const nextView = template.content.querySelector("[data-goal-view]");
      if (!nextView) throw new Error("Goal 正文响应不完整");
      const goalSurface = documentPane.querySelector('[data-work-surface="goal"]');
      const paneHeader = goalSurface ? null : documentPane.querySelector(":scope > .desktop-pane-header");
      if (goalSurface) goalSurface.replaceChildren(nextView);
      else documentPane.replaceChildren(...(paneHeader ? [paneHeader, nextView] : [nextView]));
      updateAllRelationFormPreviews();
      document.querySelectorAll("[data-risk-state-form]").forEach(updateRiskStatePreview);
      document.querySelectorAll(".risk-goal-picker").forEach(updateRiskGoalCount);
      setGoalPanel(goalPanelFromHash() || "overview", false);
      setGoalFactor(goalFactorFromHash() || "relations", false);
    };

    const setGoalDocumentBusy = (busy) => {
      if (busy) documentPane.setAttribute("aria-busy", "true");
      else documentPane.removeAttribute("aria-busy");
      documentPane.querySelector("[data-goal-document-loading]")?.remove();
      if (!busy) return;
      const indicator = document.createElement("div");
      indicator.className = "goal-document-loading";
      indicator.dataset.goalDocumentLoading = "true";
      indicator.setAttribute("role", "status");
      indicator.textContent = L("正在载入 Goal…");
      const goalSurface = documentPane.querySelector('[data-work-surface="goal"]');
      const paneHeader = goalSurface ? null : documentPane.querySelector(":scope > .desktop-pane-header");
      if (paneHeader) paneHeader.after(indicator);
      else (goalSurface || documentPane).prepend(indicator);
    };

    const loadGoalDocument = async (goalId) => {
      goalDocumentRequest?.abort();
      const controller = new AbortController();
      goalDocumentRequest = controller;
      setGoalDocumentBusy(true);
      try {
        const response = await fetch(
          route("/api/goals/" + encodeURIComponent(goalId) + "/document?view=" + documentCollection),
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error("无法读取这条 Goal 正文");
        const html = await response.text();
        if (goalDocumentRequest !== controller) return null;
        replaceGoalDocument(html);
        return true;
      } catch (error) {
        if (isAbortError(error) || goalDocumentRequest !== controller) return null;
        showToast(error.message || "无法读取这条 Goal 正文", true);
        return false;
      } finally {
        if (goalDocumentRequest === controller) {
          goalDocumentRequest = null;
          setGoalDocumentBusy(false);
        }
      }
    };

    const selectGoal = async (goalId, updateHistory = true) => {
      if (decisionView) {
        location.assign(globalThis.goalboardNavigationUrl(route("/goals/" + encodeURIComponent(goalId))));
        return;
      }
      const currentView = documentPane.querySelector("[data-goal-view]");
      if (goalId === selected && currentView?.dataset.goalView === goalId) {
        if (matchMedia("(max-width: 760px)").matches) setWorkspaceMode("focus", false);
        return;
      }
      const fallbackGoalId = currentView?.dataset.goalView || selected;
      if (!applySelection(goalId, true)) return;
      abortGoalRecordsRequest();
      const loaded = await loadGoalDocument(goalId);
      if (loaded == null) return;
      if (!loaded) {
        if (selected === goalId && fallbackGoalId) applySelection(fallbackGoalId, false);
        return;
      }
      ensureWorkTab(goalId);
      document.dispatchEvent(new CustomEvent("goalboard:goal-document-loaded", { detail: { goalId } }));
      if (updateHistory) {
        history.pushState({ goalId }, "", goalPageUrl(goalId));
      }
      if (matchMedia("(max-width: 760px)").matches) setWorkspaceMode("focus", false);
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
      if (summary) summary.textContent = selectedCount ? L("已选择 {count} 种状态", { count: selectedCount }) : L("显示全部状态");
      if (clear) clear.disabled = selectedCount === 0;
      treeFilterTrigger?.classList.toggle("is-active", selectedCount > 0);
      treeFilterTrigger?.setAttribute("aria-label", selectedCount ? L("筛选目标，已选择 {count} 种状态", { count: selectedCount }) : L("筛选目标"));
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
      updateGraphVisibility();
    }

    const searchInteractionActive = () => searchComposing || Date.now() < searchBusyUntil;

    const liveUiInteractionActive = () => {
      const active = document.activeElement;
      if (active?.closest?.("[data-live-form]")) return true;
      const dirtyVisibleForm = [...document.querySelectorAll('[data-live-form][data-live-dirty="true"]')]
        .some((form) => form.getClientRects().length > 0);
      if (dirtyVisibleForm) return true;
      return active?.matches?.('input, textarea, select, [contenteditable="true"]') && Boolean(
        active.closest?.('[data-directory-panel="feed"], [data-directory-panel="sources"], [data-work-surface="feed"], [data-work-surface="sources"]'),
      );
    };

    document.addEventListener("input", (event) => {
      event.target?.closest?.("[data-live-form]")?.setAttribute("data-live-dirty", "true");
    });
    document.addEventListener("change", (event) => {
      event.target?.closest?.("[data-live-form]")?.setAttribute("data-live-dirty", "true");
    });
    document.addEventListener("reset", (event) => {
      const form = event.target?.closest?.("[data-live-form]");
      if (form) requestAnimationFrame(() => form.removeAttribute("data-live-dirty"));
    });

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
        scheduleDeferredRefresh();
        return;
      }
      if (!force && liveUiInteractionActive()) {
        return;
      }
      syncing = true;
      try {
        const cursorResponse = await fetch(route("/api/board/cursor"), { cache: "no-store" });
        if (!cursorResponse.ok) throw new Error("无法读取 GoalBoard 游标");
        const cursorState = await cursorResponse.json();
        if (Number(cursorState.observed_event_cursor) === Number(state.snapshot.cursor)) {
          return;
        }
        if (!force && searchInteractionActive()) {
          scheduleDeferredRefresh();
          return;
        }
        if (!force && liveUiInteractionActive()) return;
        const refreshGoalId = selected;
        const pageBase = goalPageBase();
        const collectionPath = trashView ? "/trash" : archiveView ? "/archive" : "/";
        const pagePath = decisionView
          ? route("/decisions")
          : refreshGoalId
            ? pageBase + encodeURIComponent(refreshGoalId)
            : route(collectionPath);
        const compactRefreshPath = route("/api/board/refresh?view=" + documentCollection +
          (refreshGoalId ? "&goal_id=" + encodeURIComponent(refreshGoalId) : ""));
        let pageResponse = await fetch(decisionView ? pagePath : compactRefreshPath, { cache: "no-store" });
        if (!pageResponse.ok && !decisionView) {
          pageResponse = await fetch(pagePath, { cache: "no-store" });
        }
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
        if (decisionView) {
          const nextFeedList = parsed.querySelector("[data-feed-list]");
          const nextFeedWorkbench = parsed.querySelector("[data-feed-workbench]");
          const nextFeedDetailEmpty = nextFeedWorkbench?.querySelector("[data-feed-detail-empty]");
          if (!feedList || !feedWorkbench || !feedEmpty || !feedDetailEmpty || !nextFeedList || !nextFeedWorkbench || !nextFeedDetailEmpty) {
            throw new Error("待决定页面数据不完整");
          }
          const scrollTop = window.scrollY;
          const nextRows = [...nextFeedList.querySelectorAll("[data-feed-entry-id]")];
          feedList.querySelectorAll("[data-feed-entry-id]").forEach((row) => row.remove());
          nextRows.forEach((row) => feedList.insertBefore(row, feedEmpty));
          feedWorkbench.querySelectorAll("[data-feed-detail]").forEach((detail) => detail.remove());
          [...nextFeedWorkbench.querySelectorAll("[data-feed-detail]")]
            .forEach((detail) => feedWorkbench.insertBefore(detail, feedDetailEmpty));
          feedDetailEmpty.innerHTML = nextFeedDetailEmpty.innerHTML;
          feedDetailEmpty.hidden = nextFeedDetailEmpty.hidden;
          feedWorkbench.dataset.loaded = nextFeedWorkbench.dataset.loaded || "true";
          feedWorkbench.dataset.loadedPreset = nextFeedWorkbench.dataset.loadedPreset || "inbox_message";
          state = nextState;
          document.querySelector("#goalboard-data").textContent = JSON.stringify(nextState).replaceAll("<", "\\u003c");
          const deepLinkedEntry = decisionFeedEntryFromHash();
          if (deepLinkedEntry && !nextRows.some((row) => row.dataset.feedEntryId === deepLinkedEntry)) {
            history.replaceState(null, "", location.pathname + location.search);
          }
          selectedFeedItem = nextRows.find((row) => row.classList.contains("is-selected"))?.dataset.feedEntryId || "";
          filterFeedItems(false);
          window.scrollTo({ top: scrollTop, behavior: "instant" });
          return;
        }
        const nextGoals = visibleGoals(nextState);
        const renderedGoalId = parsed.querySelector("[data-goal-view]")?.dataset.goalView || "";
        const goalStillExists = nextGoals.some((item) => item.goal.goal_id === refreshGoalId);
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
          scheduleDeferredRefresh();
          return;
        }
        if (!decisionView && selected !== refreshGoalId) {
          scheduleDeferredRefresh();
          return;
        }
        if (refreshGoalId && !goalStillExists) {
          const movedToCurrent = nextState.goals.some((item) => item.goal.goal_id === refreshGoalId);
          const movedToArchive = nextState.archived_goals.some((item) => item.goal.goal_id === refreshGoalId);
          const movedToTrash = nextState.trashed_goals.some((item) => item.goal.goal_id === refreshGoalId);
          const movedPath = movedToCurrent
            ? "/goals/" + encodeURIComponent(refreshGoalId)
            : movedToArchive
              ? "/archive/goals/" + encodeURIComponent(refreshGoalId)
              : movedToTrash
                ? "/trash/goals/" + encodeURIComponent(refreshGoalId)
                : collectionPath;
          const message = movedToCurrent
            ? L("这条 Goal 已恢复到当前 Goal，已继续打开同一条 Goal。")
            : movedToArchive
              ? L("这条 Goal 已归档，已继续打开归档中的同一条 Goal。")
              : movedToTrash
                ? L("这条 Goal 已移入回收站，已继续打开同一条 Goal。")
                : L("这条 Goal 已不在当前集合，已返回列表。");
          try {
            sessionStorage.setItem(goalMoveReceiptKey, JSON.stringify({ goalId: refreshGoalId, message }));
          } catch {}
          saveUiState();
          location.replace(globalThis.goalboardNavigationUrl(route(movedPath)));
          return "reloading";
        }
        if (!force && liveUiInteractionActive()) return;
        const ui = readUiState();
        const createDraft = dialog.open ? readCreateDraft() : null;
        documentPane.classList.add("is-syncing");
        treeScroll.innerHTML = nextTree.innerHTML;
        const currentPrimarySurface = documentPane.querySelector('[data-work-surface="' + (decisionView ? "inbox" : "goal") + '"]');
        const nextPrimarySurface = nextDocument.querySelector('[data-work-surface="' + (decisionView ? "inbox" : "goal") + '"]');
        if (currentPrimarySurface && nextPrimarySurface) {
          currentPrimarySurface.replaceChildren(...nextPrimarySurface.childNodes);
        } else {
          documentPane.replaceChildren(...nextDocument.childNodes);
        }
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
        if (selected) ensureWorkTab(selected);
        if (!decisionView && selected) applySelection(selected, false);
        applyUiState(ui);
        updateAllRelationFormPreviews();
        const refreshedGraph = graphElement();
        if (refreshedGraph?.dataset.loaded === "true") {
          if (workspace.dataset.workspaceMode === "graph") void loadGoalGraph(true);
          else refreshedGraph.dataset.loaded = "false";
        }
        requestAnimationFrame(() => documentPane.classList.remove("is-syncing"));
      } catch {
      } finally {
        syncing = false;
      }
    };

    const decisionReceiptContext = (decisionForm) => {
      const ownerLink = decisionForm.closest(".decision-goal-group")?.querySelector("a.decision-owner-link");
      return {
        goalTitle: ownerLink?.querySelector("strong")?.textContent?.trim() || "",
        goalHref: ownerLink?.getAttribute("href") || "",
      };
    };

    const showDecisionReceipt = (message, context) => {
      const center = document.querySelector("[data-decision-center]");
      const activeFeedDetail = feedWorkbench?.querySelector('[data-feed-detail]:not([hidden])');
      const receiptHost = center || activeFeedDetail;
      if (!receiptHost) {
        showToast(message);
        return;
      }
      receiptHost.querySelector("[data-decision-receipt]")?.remove();
      const receipt = document.createElement("aside");
      receipt.className = "decision-receipt";
      receipt.dataset.decisionReceipt = "true";
      receipt.setAttribute("role", "status");
      receipt.setAttribute("tabindex", "-1");
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = L("已记录你的决定");
      const detail = document.createElement("span");
      detail.textContent = message + " " + (receiptHost.querySelector(".decision-record") ? L("下一步：继续处理下面的待决定事项。") : L("下一步：返回 Goal 查看结果。"));
      copy.append(title, detail);
      receipt.append(copy);
      if (context?.goalHref) {
        const link = document.createElement("a");
        link.href = context.goalHref;
        link.textContent = context.goalTitle ? L("返回「{title}」", { title: context.goalTitle }) : L("返回 Goal");
        receipt.append(link);
      }
      const receiptAnchor = receiptHost.querySelector(".decision-center-header, .feed-detail-header");
      if (receiptAnchor) receiptAnchor.after(receipt);
      else receiptHost.prepend(receipt);
      receipt.focus({ preventScroll: true });
    };

    const refreshBoardWithDecisionReceipt = async (message, context) => {
      try {
        sessionStorage.setItem("goalboard-decision-receipt", JSON.stringify({ message, context }));
      } catch {}
      const refreshResult = await refreshBoard(true);
      if (refreshResult === "reloading") return;
      try {
        sessionStorage.removeItem("goalboard-decision-receipt");
      } catch {}
      showDecisionReceipt(message, context);
    };

    const showFactorReceipt = (factor, titleText, detailText) => {
      setGoalPanel("factors", false);
      setGoalFactor(factor, false, true);
      documentPane.querySelector("[data-factor-write-receipt]")?.remove();
      const panel = documentPane.querySelector('[data-goal-factor-panel="' + factor + '"]');
      if (!panel) {
        showToast(titleText);
        return;
      }
      const receipt = document.createElement("aside");
      receipt.className = "factor-write-receipt";
      receipt.dataset.factorWriteReceipt = "true";
      receipt.setAttribute("role", "status");
      receipt.setAttribute("tabindex", "-1");
      const title = document.createElement("strong");
      title.textContent = titleText;
      const detail = document.createElement("span");
      detail.textContent = detailText;
      receipt.append(title, detail);
      const panelContent = panel.querySelector(":scope > .focus-section-card-content") || panel;
      panelContent.querySelector(":scope > header")?.after(receipt);
      receipt.focus({ preventScroll: true });
    };

    const requireDecisionText = (decisionForm, errorBox, fieldName, message) => {
      const field = decisionForm.querySelector('[name="' + fieldName + '"]');
      if (String(field?.value || "").trim()) {
        field?.removeAttribute("aria-invalid");
        return false;
      }
      errorBox.textContent = L(message);
      errorBox.hidden = false;
      field?.setAttribute("aria-invalid", "true");
      field?.focus();
      const clearError = () => {
        if (!String(field?.value || "").trim()) return;
        field.removeAttribute("aria-invalid");
        errorBox.hidden = true;
        field.removeEventListener("input", clearError);
        field.removeEventListener("change", clearError);
      };
      field?.addEventListener("input", clearError);
      field?.addEventListener("change", clearError);
      return true;
    };

    const humanDecisionError = (message, fallback) => String(message || fallback)
      .replaceAll("Contract Proposal", "目标说明")
      .replaceAll("Contract", "目标说明")
      .replaceAll("Candidate Goal", "新发现的工作")
      .replaceAll("Candidate", "新发现的工作")
      .replaceAll("Goal Spine", "Goal Tree")
      .replaceAll("Rewire", "Goal 关系调整")
      .replaceAll("Review", "结果确认")
      .replaceAll("Risk", "风险")
      .replaceAll("Impact", "影响范围")
      .replaceAll("Policy", "工作规则")
      .replaceAll("Runtime", "执行工具");

    const submitDecisionForm = async (decisionForm, submitter, endpoint, decision, successMessage) => {
      const buttons = [...decisionForm.querySelectorAll('button[type="submit"]')];
      const errorBox = decisionForm.querySelector("[data-decision-error]");
      const reason = String(new FormData(decisionForm).get("reason") || "").trim();
      const receiptContext = decisionReceiptContext(decisionForm);
      if (requireDecisionText(decisionForm, errorBox, "reason", "请填写决定理由或修改意见")) return;
      const buttonStates = buttons.map((button) => button.disabled);
      const submitLabel = submitter?.textContent;
      buttons.forEach((button) => { button.disabled = true; });
      if (submitter) submitter.textContent = L("正在保存…");
      errorBox.hidden = true;
      try {
        const response = await fetch(route(endpoint), {
          method: "POST",
          headers: goalboardControlHeaders(),
          body: JSON.stringify({ decision, reason }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "决定提交失败");
        await refreshBoardWithDecisionReceipt(
          typeof successMessage === "function" ? successMessage(result) : successMessage,
          receiptContext,
        );
      } catch (error) {
        errorBox.textContent = humanDecisionError(error.message, "决定提交失败，请检查输入后重试");
        errorBox.hidden = false;
        buttons.forEach((button, index) => { button.disabled = buttonStates[index]; });
        if (submitter) submitter.textContent = submitLabel;
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
      const changedFactorForm = changed.closest("[data-relation-form], [data-risk-create-form], [data-risk-edit-form], [data-impact-create-form], [data-impact-edit-form], [data-policy-form]");
      if (changedFactorForm) {
        changed.removeAttribute("aria-invalid");
        const factorError = changedFactorForm.querySelector("[data-relation-error], [data-risk-error], [data-impact-error], [data-policy-error]");
        if (factorError) factorError.hidden = true;
      }
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
      if (relationForm) {
        if ((changed.name === "direction" || changed.name === "type") && relationForm.elements.relation_intent) {
          relationForm.elements.relation_intent.value = "other";
        } else if (changed.name === "relation_intent" && changed.value === "other") {
          relationForm.elements.direction.value = "";
          relationForm.elements.type.value = "";
          const advanced = relationForm.querySelector("[data-progressive-fields]");
          if (advanced) advanced.open = true;
        }
        updateRelationFormPreview(relationForm);
      }
      const riskStateForm = changed.closest("[data-risk-state-form]");
      if (riskStateForm) updateRiskStatePreview(riskStateForm);
      const riskGoalPicker = changed.closest(".risk-goal-picker");
      if (riskGoalPicker) updateRiskGoalCount(riskGoalPicker);
    });
    document.addEventListener("input", (event) => {
      const changed = event.target instanceof Element ? event.target : null;
      if (!changed) return;
      const changedFactorForm = changed.closest("[data-relation-form], [data-risk-create-form], [data-risk-edit-form], [data-impact-create-form], [data-impact-edit-form], [data-policy-form]");
      if (changedFactorForm) {
        changed.removeAttribute("aria-invalid");
        const factorError = changedFactorForm.querySelector("[data-relation-error], [data-risk-error], [data-impact-error], [data-policy-error]");
        if (factorError) factorError.hidden = true;
      }
      const filter = changed.closest?.("[data-risk-goal-filter]");
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
    feedFilterTrigger?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setFeedFilterOpen(feedFilterPanel?.hidden !== false, true);
    });
    feedSearch?.addEventListener("input", () => {
      noteSearchActivity();
      filterFeedItems();
    });
    sourceSearch?.addEventListener("input", () => {
      noteSearchActivity();
      filterSources();
    });
    [feedSourceFilter, feedTypeFilter, feedTimeFilter, feedStatusFilter, feedSort].forEach((control) => {
      control?.addEventListener("change", () => {
        syncFeedFilterUi();
        filterFeedItems();
      });
    });
    feedFilterPanel?.addEventListener("keydown", (event) => {
      const current = event.target.closest?.("[data-feed-filter-option]");
      if (!current || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      const group = [...current.parentElement.querySelectorAll("[data-feed-filter-option]")];
      const currentIndex = group.indexOf(current);
      const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? group.length - 1
          : (currentIndex + direction + group.length) % group.length;
      event.preventDefault();
      group[nextIndex]?.click();
      group[nextIndex]?.focus();
    });
    feedList?.addEventListener("keydown", (event) => {
      const current = event.target.closest?.("[data-feed-entry-id]");
      if (!current || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const visible = [...feedList.querySelectorAll("[data-feed-entry-id]:not([hidden])")];
      const currentIndex = visible.indexOf(current);
      const next = event.key === "Home" ? visible[0]
        : event.key === "End" ? visible.at(-1)
        : visible[currentIndex + (event.key === "ArrowDown" ? 1 : -1)];
      if (!next) return;
      event.preventDefault();
      selectFeedItem(next.dataset.feedEntryId, false, true);
      next.focus();
    });
    sourceList?.addEventListener("keydown", (event) => {
      const current = event.target.closest?.("[data-source-entry-id]");
      if (!current || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const rows = [...sourceList.querySelectorAll("[data-source-entry-id]")].filter((row) => !row.hidden);
      const index = rows.indexOf(current);
      const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
      event.preventDefault();
      const next = rows[nextIndex];
      if (next) {
        selectSource(next.dataset.sourceEntryId, false);
        next.focus();
      }
    });

    document.addEventListener("click", async (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const humanReviewJump = target.closest("[data-human-review-jump]");
      if (humanReviewJump) {
        const reviewForm = humanReviewJump.closest(".human-review-list")?.querySelector("[data-human-review-form]");
        reviewForm?.scrollIntoView({ block: "start" });
        requestAnimationFrame(() => reviewForm?.querySelector('[name="verdict"]')?.focus({ preventScroll: true }));
        return;
      }
      const activeProjectMenu = target.closest("[data-project-menu]");
      projectMenus.forEach((menu) => {
        if (menu.open && menu !== activeProjectMenu) menu.open = false;
      });
      if (!feedFilterPanel?.hidden && !target.closest("[data-feed-filter-panel], [data-feed-filter-trigger]")) setFeedFilterOpen(false);
      const feedFilterOption = target.closest("[data-feed-filter-option]");
      if (feedFilterOption) {
        const control = {
          source: feedSourceFilter,
          type: feedTypeFilter,
          time: feedTimeFilter,
          status: feedStatusFilter,
          sort: feedSort,
        }[feedFilterOption.dataset.feedFilterOption];
        if (control) control.value = feedFilterOption.dataset.feedFilterValue || "";
        syncFeedFilterUi();
        filterFeedItems();
        return;
      }
      if (target.closest("[data-feed-filter-reset]")) {
        if (feedSourceFilter) feedSourceFilter.value = "all";
        if (feedTypeFilter) feedTypeFilter.value = "all";
        if (feedTimeFilter) feedTimeFilter.value = "all";
        if (feedStatusFilter) feedStatusFilter.value = "active";
        if (feedSort) feedSort.value = "newest";
        syncFeedFilterUi();
        filterFeedItems(false);
        return;
      }
      const sourceFilter = target.closest("[data-source-filter]");
      if (sourceFilter) {
        activeSourceFilter = sourceFilter.dataset.sourceFilter || "all";
        sourceDirectory?.querySelectorAll("[data-source-filter]").forEach((button) => {
          const active = button === sourceFilter;
          button.classList.toggle("is-active", active);
          button.setAttribute("aria-pressed", String(active));
        });
        filterSources(false);
        return;
      }
      if (target.closest("[data-source-filter-reset]")) {
        activeSourceFilter = "all";
        if (sourceSearch) sourceSearch.value = "";
        sourceDirectory?.querySelectorAll("[data-source-filter]").forEach((button) => {
          const active = button.dataset.sourceFilter === "all";
          button.classList.toggle("is-active", active);
          button.setAttribute("aria-pressed", String(active));
        });
        filterSources(false);
        return;
      }
      const sourceEntry = target.closest("[data-source-entry-id]");
      if (sourceEntry) {
        selectSource(sourceEntry.dataset.sourceEntryId, true);
        return;
      }
      const sourceDetailTab = target.closest("[data-source-detail-tab]");
      if (sourceDetailTab) {
        setSourceDetailTab(sourceDetailTab.closest("[data-source-detail]"), sourceDetailTab.dataset.sourceDetailTab || "overview");
        queueSave();
        return;
      }
      const sourceConfigSave = target.closest("[data-source-config-save]");
      if (sourceConfigSave) {
        const detail = sourceConfigSave.closest("[data-source-detail]");
        const sourceId = sourceConfigSave.dataset.sourceId;
        const readField = (name) => detail?.querySelector('[data-source-config-field="' + name + '"]')?.value || "";
        sourceConfigSave.disabled = true;
        showPrototypeStatus(sourceConfigSave, L("正在保存来源配置…"));
        try {
          await feedApi("/api/feed/sources/" + encodeURIComponent(sourceId), "PATCH", {
            name: readField("name"),
            description: readField("description"),
            scope: readField("scope"),
            feed_url: readField("feed_url") || undefined,
          });
          showPrototypeStatus(sourceConfigSave, L("来源配置已保存。地址与秘密凭据没有改变。"));
          globalThis.setTimeout(() => location.reload(), 450);
        } catch (error) {
          showPrototypeStatus(sourceConfigSave, error.message || L("来源配置保存失败，请检查后重试。"));
          sourceConfigSave.disabled = false;
        }
        return;
      }
      const sourceScheduleSave = target.closest("[data-source-schedule-save]");
      if (sourceScheduleSave) {
        const detail = sourceScheduleSave.closest("[data-source-detail]");
        const sourceId = sourceScheduleSave.dataset.sourceId;
        const mode = detail?.querySelector("[data-source-schedule-mode]")?.value || "manual";
        const enabled = Boolean(detail?.querySelector("[data-source-schedule-enabled]")?.checked);
        const intervalMinutes = Number(detail?.querySelector("[data-source-schedule-interval]")?.value || 60);
        sourceScheduleSave.disabled = true;
        showPrototypeStatus(sourceScheduleSave, L("正在保存拉取计划…"));
        try {
          await feedApi("/api/feed/sources/" + encodeURIComponent(sourceId) + "/schedule", "PUT", mode === "manual"
            ? { mode: "manual" }
            : { mode: "interval", enabled, interval_minutes: intervalMinutes });
          showPrototypeStatus(sourceScheduleSave, mode === "manual"
            ? L("已改为仅手动拉取。")
            : enabled ? L("定时拉取已保存；本地服务会在到期后执行。") : L("定时拉取已暂停。"));
          globalThis.setTimeout(() => location.reload(), 450);
        } catch (error) {
          showPrototypeStatus(sourceScheduleSave, error.message || L("拉取计划保存失败，请检查后重试。"));
          sourceScheduleSave.disabled = false;
        }
        return;
      }
      const sourceScheduleEnabled = target.closest("[data-source-schedule-enabled]");
      if (sourceScheduleEnabled) {
        const label = sourceScheduleEnabled.closest("label")?.querySelector("span");
        if (label) label.textContent = sourceScheduleEnabled.checked ? L("已开启") : L("已暂停");
        return;
      }
      const sourceRuntimeAction = target.closest("[data-source-runtime-action]");
      if (sourceRuntimeAction) {
        const sourceId = sourceRuntimeAction.dataset.sourceId;
        const action = sourceRuntimeAction.dataset.sourceRuntimeAction;
        sourceRuntimeAction.disabled = true;
        showPrototypeStatus(sourceRuntimeAction, action === "sync" ? L("正在拉取；失败不会被写成成功…") : L("正在更新来源状态…"));
        try {
          const body = action === "sync"
            ? { idempotency_key: globalThis.crypto?.randomUUID?.() || (Date.now().toString(36) + "-source-sync") }
            : {};
          const result = await feedApi("/api/feed/sources/" + encodeURIComponent(sourceId) + "/" + action, "POST", body);
          const message = action === "sync"
            ? result.run?.error_code
              ? L("拉取失败：{code}。已保留上次成功内容，可按来源提示重试。", { code: result.run.error_code })
              : result.run?.receipt?.rss_http?.not_modified
                ? L("拉取完成：源站未修改，没有新增 Item。")
                : L("拉取完成：新增 {created}，去重 {deduped}", { created: result.created || 0, deduped: result.deduped || 0 })
            : action === "pause" ? L("来源已暂停；消息与历史仍保留。")
              : action === "resume" ? L("来源已恢复。") : L("账号已断开，后续不会再拉取。")
          showPrototypeStatus(sourceRuntimeAction, message);
          globalThis.setTimeout(() => location.reload(), 550);
        } catch (error) {
          showPrototypeStatus(sourceRuntimeAction, error.message || L("来源操作失败，请按提示处理后重试。"));
          sourceRuntimeAction.disabled = false;
        }
        return;
      }
      const sourceDelete = target.closest("[data-source-delete]");
      if (sourceDelete) {
        const sourceId = sourceDelete.dataset.sourceId;
        const historyDecision = sourceDelete.dataset.sourceDelete;
        const warning = historyDecision === "delete_local_history"
          ? L("确认删除这个来源及其本地消息、资料、Inbox 引用和运行记录？此操作无法从 GoalBoard 恢复。")
          : L("确认删除这个来源并停止拉取？已有消息和运行历史会保留。 ");
        if (!globalThis.confirm(warning)) return;
        sourceDelete.disabled = true;
        showPrototypeStatus(sourceDelete, L("正在删除来源…"));
        try {
          await feedApi("/api/feed/sources/" + encodeURIComponent(sourceId), "DELETE", { history_decision: historyDecision });
          showPrototypeStatus(sourceDelete, historyDecision === "delete_local_history" ? L("来源与本地历史已删除。") : L("来源已删除，历史已保留。"));
          globalThis.setTimeout(() => location.reload(), 550);
        } catch (error) {
          showPrototypeStatus(sourceDelete, error.message || L("删除来源失败，请重试。"));
          sourceDelete.disabled = false;
        }
        return;
      }
      const prototypeConfigSave = target.closest("[data-prototype-config-save]");
      if (prototypeConfigSave) {
        showPrototypeStatus(prototypeConfigSave, L("演示配置已保存到当前页面；刷新后恢复，不会写入真实来源。"));
        return;
      }
      const prototypeScheduleSave = target.closest("[data-prototype-schedule-save]");
      if (prototypeScheduleSave) {
        const sheet = prototypeScheduleSave.closest(".source-schedule-sheet");
        const enabled = sheet?.querySelector("[data-prototype-schedule-enabled]")?.checked;
        const frequency = sheet?.querySelector("[data-prototype-schedule-frequency]")?.value || L("当前频率");
        showPrototypeStatus(prototypeScheduleSave, enabled
          ? L("模拟计划已保存：{frequency}。浏览器关闭后不会继续运行。", { frequency })
          : L("模拟计划已暂停。真实后台调度未启动。"));
        return;
      }
      const prototypeScheduleEnabled = target.closest("[data-prototype-schedule-enabled]");
      if (prototypeScheduleEnabled) {
        const label = prototypeScheduleEnabled.closest("label")?.querySelector("span");
        if (label) label.textContent = prototypeScheduleEnabled.checked ? L("已开启") : L("已暂停");
        return;
      }
      const prototypeSourceSync = target.closest("[data-prototype-source-sync]");
      if (prototypeSourceSync) {
        const sourceId = prototypeSourceSync.dataset.prototypeSourceSync;
        const detail = prototypeSourceSync.closest("[data-source-detail]");
        const health = detail?.querySelector("[data-source-health-label]");
        const row = sourceList?.querySelector('[data-source-entry-id="' + CSS.escape(sourceId) + '"]');
        const rowState = row?.querySelector(".source-list-state");
        const original = prototypeSourceSync.innerHTML;
        prototypeSourceSync.disabled = true;
        prototypeSourceSync.setAttribute("aria-busy", "true");
        prototypeSourceSync.innerHTML = L("模拟拉取中…");
        if (health) health.textContent = L("正在拉取");
        if (rowState) rowState.textContent = L("正在拉取");
        if (row) row.dataset.sourceStatus = "syncing";
        globalThis.setTimeout(() => {
          prototypeSourceSync.disabled = false;
          prototypeSourceSync.removeAttribute("aria-busy");
          prototypeSourceSync.innerHTML = original;
          if (health) health.textContent = L("运行正常");
          if (rowState) rowState.textContent = L("运行正常");
          if (row) row.dataset.sourceStatus = "active";
          showPrototypeStatus(prototypeSourceSync, L("模拟拉取完成：新增 3，去重 8；没有访问真实外部服务。"));
        }, 850);
        return;
      }
      const openPrototypeSource = target.closest("[data-open-prototype-source]");
      if (openPrototypeSource) {
        setDesktopDirectory("sources", true, false, openPrototypeSource);
        setDesktopWorkSurface("sources", true, false);
        const requestedSource = openPrototypeSource.dataset.openPrototypeSource;
        const fallbackSource = sourceList?.querySelector('[data-source-kind="' + CSS.escape(openPrototypeSource.dataset.openSourceKind || "") + '"]')?.dataset.sourceEntryId;
        selectSource(sourceList?.querySelector('[data-source-entry-id="' + CSS.escape(requestedSource) + '"]') ? requestedSource : fallbackSource, true);
        return;
      }
      const prototypeFeedAction = target.closest("[data-prototype-feed-action]");
      if (prototypeFeedAction) {
        const detail = prototypeFeedAction.closest("[data-prototype-feed-detail]");
        const destination = detail?.querySelector("[data-prototype-destination]");
        const action = prototypeFeedAction.dataset.prototypeFeedAction;
        const labels = {
          inbox: [L("已进入 Inbox"), L("Inbox 只保存需处理引用；原消息仍在 Feed")],
          save: [L("已保存为资料"), L("当前页面演示状态，不写入数据库")],
          promote: [L("已准备升格 Goal"), L("正式 Goal 创建留给后续功能")],
          ignore: [L("已忽略"), L("消息仍可从 Feed 历史追溯")],
        }[action] || [L("演示状态已更新"), L("没有发生真实写入")];
        if (destination) {
          const strong = destination.querySelector("strong");
          const small = destination.querySelector("small");
          if (strong) strong.textContent = labels[0];
          if (small) small.textContent = labels[1];
          destination.dataset.destinationState = action;
        }
        showPrototypeStatus(prototypeFeedAction, labels[0] + "。" + labels[1] + "。");
        if (action === "inbox") {
          prototypeFeedAction.disabled = true;
          prototypeFeedAction.textContent = L("已加入 Inbox");
        }
        return;
      }
      const prototypeInboxComplete = target.closest("[data-prototype-inbox-complete]");
      if (prototypeInboxComplete) {
        const itemId = prototypeInboxComplete.dataset.prototypeItemId;
        const row = feedList?.querySelector('[data-feed-entry-id="' + CSS.escape(itemId) + '"]');
        if (row) row.dataset.feedEntryStatus = "archived";
        const detail = prototypeInboxComplete.closest("[data-prototype-feed-detail]");
        if (detail) detail.hidden = true;
        setFeedDetailPlaceholder(L("这件事已处理完成"), L("它已退出默认 Inbox；原 Feed Item、来源或 Goal 仍可追溯。"));
        filterFeedItems(false);
        showToast(L("已完成 · 仅本页演示"));
        return;
      }
      const prototypeInboxDefer = target.closest("[data-prototype-inbox-defer]");
      if (prototypeInboxDefer) {
        showPrototypeStatus(prototypeInboxDefer, L("仍保留在 Inbox；稍后处理不会改变进入原因。"));
        return;
      }
      if (target.closest("[data-prototype-feed-empty-state]")) {
        feedList?.querySelectorAll("[data-feed-entry-id]").forEach((row) => {
          if (row.dataset.feedEntryType === activeFeedPreset) row.hidden = true;
        });
        feedWorkbench?.querySelectorAll("[data-feed-detail]").forEach((detail) => { detail.hidden = true; });
        if (feedEmpty) {
          feedEmpty.dataset.prototypeEmptyPreview = "true";
          feedEmpty.hidden = false;
          const title = feedEmpty.querySelector("[data-feed-empty-title]");
          const copy = feedEmpty.querySelector("[data-feed-empty-copy]");
          const restore = feedEmpty.querySelector("[data-prototype-feed-restore]");
          const clear = feedEmpty.querySelector("[data-feed-clear-filters]");
          const sources = feedEmpty.querySelector("[data-feed-empty-sources]");
          if (title) title.textContent = activeFeedPreset === "inbox_message" ? L("Inbox 已经处理完") : L("暂时没有新消息");
          if (copy) copy.textContent = activeFeedPreset === "inbox_message"
            ? L("需要你介入的事情都已退出默认列表；原对象和历史仍可追溯。")
            : L("来源仍按计划拉取；新消息到达后会先进入 Feed。");
          if (restore) restore.hidden = false;
          if (clear) clear.hidden = true;
          if (sources) sources.hidden = true;
        }
        if (feedResultCount) feedResultCount.textContent = L("0 个 Item");
        setFeedDetailPlaceholder(activeFeedPreset === "inbox_message" ? L("Inbox 已处理完") : L("Feed 暂无新消息"), L("这是页面内空状态预览，不会修改真实 Item。"));
        return;
      }
      if (target.closest("[data-prototype-feed-restore]")) {
        if (feedEmpty) delete feedEmpty.dataset.prototypeEmptyPreview;
        const restore = feedEmpty?.querySelector("[data-prototype-feed-restore]");
        const sources = feedEmpty?.querySelector("[data-feed-empty-sources]");
        if (restore) restore.hidden = true;
        if (sources) sources.hidden = false;
        filterFeedItems(false);
        return;
      }
      if (target.closest("[data-feed-sources-open]")) {
        feedSourcesDialog?.showModal();
        setFeedSourceFeedback("");
        return;
      }
      if (target.closest("[data-feed-sources-close]")) {
        feedSourcesDialog?.close();
        return;
      }
      const sourceRegister = target.closest("[data-feed-source-register]");
      if (sourceRegister) {
        const kind = sourceRegister.dataset.feedSourceRegister;
        const value = kind === "rss"
          ? feedSourcesDialog?.querySelector("[data-feed-rss-definition]")?.value
          : feedSourcesDialog?.querySelector('[data-feed-source-value="' + kind + '"]')?.value;
        const body = kind === "rss" ? { kind, definition_id: value }
          : kind === "web_query" ? { kind, query: value }
          : kind === "youtube_channel" ? { kind, channel_id: value }
          : { kind, feed_url: value };
        sourceRegister.disabled = true;
        setFeedSourceFeedback(L("正在添加来源…"));
        try {
          await feedApi("/api/feed/sources", "POST", body);
          saveUiState();
          location.reload();
        } catch (error) {
          setFeedSourceFeedback(error.message || L("添加来源失败"), true);
          sourceRegister.disabled = false;
        }
        return;
      }
      const sourceToggle = target.closest("[data-feed-source-toggle]");
      if (sourceToggle) {
        const sourceId = sourceToggle.dataset.feedSourceToggle;
        const action = sourceToggle.dataset.feedSourceEnabled === "true" ? "pause" : "resume";
        sourceToggle.disabled = true;
        setFeedSourceFeedback(action === "pause" ? L("正在暂停来源…") : L("正在恢复来源…"));
        try {
          await feedApi("/api/feed/sources/" + encodeURIComponent(sourceId) + "/" + action, "POST", {});
          saveUiState();
          location.reload();
        } catch (error) {
          setFeedSourceFeedback(error.message || L("来源状态更新失败"), true);
          sourceToggle.disabled = false;
        }
        return;
      }
      const sourceSync = target.closest("[data-feed-source-sync]");
      if (sourceSync) {
        const sourceId = sourceSync.dataset.feedSourceSync;
        sourceSync.disabled = true;
        setFeedSourceFeedback(L("正在同步来源；失败时不会写成成功…"));
        try {
          const operationKey = globalThis.crypto?.randomUUID?.() || (Date.now().toString(36) + "-feed-sync");
          const result = await feedApi("/api/feed/sources/" + encodeURIComponent(sourceId) + "/sync", "POST", { idempotency_key: operationKey });
          setFeedSourceFeedback(result.run?.error_code
            ? L("同步失败：{code}。已保留上次成功内容，可按来源提示重试。", { code: result.run.error_code })
            : result.run?.receipt?.rss_http?.not_modified
              ? L("同步完成：源站未修改，没有新增 Item。")
              : L("同步完成：新增 {created}，去重 {deduped}", { created: result.created || 0, deduped: result.deduped || 0 }));
          saveUiState();
          location.reload();
        } catch (error) {
          setFeedSourceFeedback(error.message || L("来源同步失败"), true);
          sourceSync.disabled = false;
        }
        return;
      }
      const connectorBind = target.closest("[data-feed-connector-bind]");
      if (connectorBind) {
        const kind = connectorBind.dataset.feedConnectorBind;
        const input = feedSourcesDialog?.querySelector('[data-feed-connector-token="' + kind + '"]');
        connectorBind.disabled = true;
        try {
          await feedApi("/api/feed/connectors/" + kind + "/token", "POST", { token: input?.value || "" });
          if (input) input.value = "";
          saveUiState();
          location.reload();
        } catch (error) {
          setFeedSourceFeedback(error.message || L("账号连接失败"), true);
          connectorBind.disabled = false;
        }
        return;
      }
      const connectorUnbind = target.closest("[data-feed-connector-unbind]");
      if (connectorUnbind) {
        const kind = connectorUnbind.dataset.feedConnectorUnbind;
        connectorUnbind.disabled = true;
        try {
          await feedApi("/api/feed/connectors/" + kind + "/token", "DELETE");
          saveUiState();
          location.reload();
        } catch (error) {
          setFeedSourceFeedback(error.message || L("断开账号失败"), true);
          connectorUnbind.disabled = false;
        }
        return;
      }
      if (target.closest("[data-feed-github-device-start]")) {
        const button = target.closest("[data-feed-github-device-start]");
        const clientId = feedSourcesDialog?.querySelector("[data-feed-github-client-id]")?.value || "";
        const status = feedSourcesDialog?.querySelector("[data-feed-github-device-status]");
        const poll = feedSourcesDialog?.querySelector("[data-feed-github-device-poll]");
        button.disabled = true;
        try {
          const result = await feedApi("/api/feed/connectors/github/device/start", "POST", { client_id: clientId });
          if (status) {
            status.textContent = L("授权码：{code}。已打开 GitHub，完成后回来检查状态。", { code: result.user_code });
            status.dataset.deviceCode = result.device_code;
            status.hidden = false;
          }
          if (poll) poll.hidden = false;
          globalThis.open(result.verification_uri, "_blank", "noopener,noreferrer");
        } catch (error) {
          setFeedSourceFeedback(error.message || L("GitHub 授权启动失败"), true);
          button.disabled = false;
        }
        return;
      }
      if (target.closest("[data-feed-github-device-poll]")) {
        const button = target.closest("[data-feed-github-device-poll]");
        const status = feedSourcesDialog?.querySelector("[data-feed-github-device-status]");
        const clientId = feedSourcesDialog?.querySelector("[data-feed-github-client-id]")?.value || "";
        button.disabled = true;
        try {
          const result = await feedApi("/api/feed/connectors/github/device/poll", "POST", { device_code: status?.dataset.deviceCode || "", client_id: clientId });
          if (result.status === "authorized") {
            saveUiState();
            location.reload();
          } else {
            if (status) status.textContent = result.message || L("GitHub 仍在等待授权。完成后再次检查。");
            button.disabled = false;
          }
        } catch (error) {
          setFeedSourceFeedback(error.message || L("GitHub 授权检查失败"), true);
          button.disabled = false;
        }
        return;
      }
      if (target.closest("[data-feed-gmail-oauth-start]")) {
        const button = target.closest("[data-feed-gmail-oauth-start]");
        const clientId = feedSourcesDialog?.querySelector("[data-feed-gmail-client-id]")?.value || "";
        const clientSecret = feedSourcesDialog?.querySelector("[data-feed-gmail-client-secret]")?.value || "";
        button.disabled = true;
        try {
          const result = await feedApi("/api/feed/connectors/gmail/oauth/start", "POST", {
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: location.origin + route("/api/feed/connectors/gmail/oauth/callback"),
          });
          location.assign(result.authorizationUrl);
        } catch (error) {
          setFeedSourceFeedback(error.message || L("Gmail 授权启动失败"), true);
          button.disabled = false;
        }
        return;
      }
      if (target.closest("[data-relay-import-open]")) {
        feedSourcesDialog?.close();
        relayImportDialog?.showModal();
        return;
      }
      if (target.closest("[data-relay-import-confirm]")) {
        const button = target.closest("[data-relay-import-confirm]");
        const errorBox = relayImportDialog?.querySelector("[data-relay-import-error]");
        const original = button.textContent;
        button.disabled = true;
        button.textContent = L("正在迁移…");
        if (errorBox) errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/feed/import"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify({ user_confirmed: true }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("Relay 迁移失败"));
          saveUiState();
          location.reload();
        } catch (error) {
          if (errorBox) {
            errorBox.textContent = error.message || L("Relay 迁移失败");
            errorBox.hidden = false;
          }
          button.disabled = false;
          button.textContent = original;
        }
        return;
      }
      if (target.closest("[data-feed-clear-filters]")) {
        if (feedSearch) feedSearch.value = "";
        if (feedSourceFilter) feedSourceFilter.value = "all";
        if (feedTypeFilter) feedTypeFilter.value = "all";
        if (feedTimeFilter) feedTimeFilter.value = "all";
        if (feedStatusFilter) feedStatusFilter.value = "active";
        if (feedSort) feedSort.value = "newest";
        syncFeedFilterUi();
        setFeedFilterOpen(false);
        filterFeedItems(false);
        return;
      }
      if (target.closest("[data-retry-feed-detail]")) {
        if (feedWorkbench?.dataset.loaded !== "true") {
          void ensureFeedWorkbenchLoaded();
          return;
        }
        const selectedRow = [...(feedList?.querySelectorAll("[data-feed-entry-id]") || [])]
          .find((row) => row.dataset.feedEntryId === selectedFeedItem);
        if (selectedRow) void loadFeedItemDetail(selectedRow, selectedFeedItem);
        return;
      }
      const openSourceRecord = target.closest("[data-open-source-record]");
      if (openSourceRecord) {
        const sourceId = openSourceRecord.dataset.openSourceRecord;
        if (!sourceId || !sourceList?.querySelector('[data-source-entry-id="' + CSS.escape(sourceId) + '"]')) {
          showToast(L("这个来源已删除或暂时不可用"));
          return;
        }
        setDesktopDirectory("sources", true, false, openSourceRecord);
        setDesktopWorkSurface("sources", true, false);
        selectSource(sourceId, true);
        return;
      }
      const feedEntry = target.closest("[data-feed-entry-id]");
      if (feedEntry) {
        selectFeedItem(feedEntry.dataset.feedEntryId, true, true);
        return;
      }
      const inboxOpenFeed = target.closest("[data-inbox-open-feed]");
      if (inboxOpenFeed) {
        const itemId = inboxOpenFeed.dataset.inboxOpenFeed;
        if (!itemId) return;
        setFeedPreset("feed", true);
        setDesktopDirectory("feed", true, false, inboxOpenFeed);
        setDesktopWorkSurface("feed", true, false);
        selectFeedItem(itemId, true, true);
        return;
      }
      const inboxAction = target.closest("[data-inbox-action]");
      if (inboxAction) {
        const statusValue = inboxAction.dataset.inboxAction;
        const entryId = inboxAction.dataset.inboxEntryId;
        const expectedRevision = Number(inboxAction.dataset.inboxEntryRevision || 0) || undefined;
        if (!statusValue || !entryId || !expectedRevision) return;
        const status = inboxAction.closest("[data-feed-detail]")?.querySelector("[data-inbox-action-status], [data-feed-action-status]");
        const original = inboxAction.innerHTML;
        inboxAction.disabled = true;
        inboxAction.setAttribute("aria-busy", "true");
        if (status) status.hidden = true;
        try {
          await feedApi("/api/inbox/entries/" + encodeURIComponent(entryId) + "/status", "POST", {
            status: statusValue,
            expected_revision: expectedRevision,
          });
          saveUiState();
          location.reload();
        } catch (error) {
          if (status) {
            status.textContent = error.message || L("Inbox 操作失败");
            status.hidden = false;
          }
          inboxAction.disabled = false;
          inboxAction.removeAttribute("aria-busy");
          inboxAction.innerHTML = original;
        }
        return;
      }
      const feedAction = target.closest("[data-feed-action]");
      if (feedAction) {
        const action = feedAction.dataset.feedAction;
        const itemId = feedAction.dataset.feedItemId;
        if (!action || !itemId) return;
        const status = feedAction.closest("[data-feed-detail]")?.querySelector("[data-feed-action-status]");
        const original = feedAction.innerHTML;
        feedAction.disabled = true;
        feedAction.setAttribute("aria-busy", "true");
        if (status) status.hidden = true;
        try {
          const expectedRevision = Number(feedAction.dataset.feedRevision || 0) || undefined;
          const restoreTarget = feedAction.dataset.feedRestoreTarget;
          const response = await fetch(route("/api/feed/items/" + encodeURIComponent(itemId) + "/" + action), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify(expectedRevision
              ? { expected_revision: expectedRevision, ...(restoreTarget ? { restore_target: restoreTarget } : {}) }
              : {}),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("Item 操作失败"));
          if (action === "promote" || action === "start") {
            saveUiState();
            let existing = {};
            try { existing = JSON.parse(sessionStorage.getItem(currentGoalUiStorageKey) || sessionStorage.getItem(goalUiStorageKey) || "null") || {}; } catch {}
            if (action === "start" && result.runtime_autofill && result.goal_id) {
              sessionStorage.setItem("goalboard-feed-runtime-autofill:" + result.goal_id, JSON.stringify({ itemId, at: Date.now() }));
            }
            sessionStorage.setItem(currentGoalUiStorageKey, JSON.stringify({
              ...existing,
              selected: result.goal_id,
              navigationVersion: desktopNavigationStateVersion,
              directory: "goals",
              workSurface: "goal",
              workspaceMode: action === "start" ? "runtime" : "focus",
              mobileView: action === "start" ? "tui" : "document",
            }));
            location.assign(globalThis.goalboardNavigationUrl(result.goal_path + (action === "start" ? "?feed-start=1" : "")));
            return;
          }
          saveUiState();
          location.reload();
        } catch (error) {
          if (status) {
            status.textContent = error.message || L("Item 操作失败");
            status.hidden = false;
          }
          feedAction.disabled = false;
          feedAction.removeAttribute("aria-busy");
          feedAction.innerHTML = original;
        }
        return;
      }
      const surfaceLink = target.closest("[data-work-surface-link]");
      if (surfaceLink) {
        saveUiState();
        const surface = surfaceLink.dataset.workSurfaceLink || "inbox";
        if (desktopWorkSurfaces.some((candidate) => candidate.dataset.workSurface === surface)) {
          event.preventDefault();
          setDesktopDirectory("root", true, false, surfaceLink);
          setDesktopWorkSurface(surface, true, true);
          if (surface === "feed" && selectedFeedItem) selectFeedItem(selectedFeedItem, false, true);
        }
        return;
      }
      const surfaceOpen = target.closest("[data-work-surface-open]");
      if (surfaceOpen) {
        const surface = surfaceOpen.dataset.workSurfaceOpen || "goal";
        if (surface === "feed") {
          setFeedPreset(surfaceOpen.dataset.feedPreset || "inbox_message", true);
          const source = surfaceOpen.dataset.feedSource;
          if (source) {
            if (feedSearch) feedSearch.value = "";
            if (feedSourceFilter) {
              feedSourceFilter.value = source;
              if (!feedSourceFilter.value) feedSourceFilter.value = "all";
            }
            if (feedTypeFilter) feedTypeFilter.value = "all";
            if (feedTimeFilter) feedTimeFilter.value = "all";
            if (feedStatusFilter) feedStatusFilter.value = "active";
            if (feedSort) feedSort.value = "newest";
            syncFeedFilterUi();
            filterFeedItems(false);
          }
        }
        const available = desktopWorkSurfaces.some((candidate) => candidate.dataset.workSurface === surface);
        if (surface === "goal" && (decisionView || !available)) {
          saveUiState();
          restoreLastGoal(true);
          return;
        }
        setDesktopDirectory(surface === "goal"
          ? "goals"
          : surface === "feed" || surface === "sources" || surface === "sessions"
            ? surface
            : "root", true, true, surfaceOpen);
        setDesktopWorkSurface(surface, true, true);
        if (surface === "feed" && selectedFeedItem) selectFeedItem(selectedFeedItem, false, true);
        if (matchMedia("(max-width: 760px)").matches) setMobileView("tree");
        return;
      }
      const directoryOpen = target.closest("[data-directory-open]");
      if (directoryOpen && desktopDirectoryPanels.length) {
        if (directoryOpen.matches("[data-mobile-directory-root]")) setMobileView("tree");
        setDesktopDirectory(directoryOpen.dataset.directoryOpen || "root", true, true, directoryOpen);
        return;
      }
      if (target.closest("[data-directory-back]") && desktopDirectoryPanels.length) {
        setDesktopDirectory("root");
        return;
      }
      const closeWorkTab = target.closest("[data-close-work-tab]");
      if (closeWorkTab && workTabs && !decisionView && !collectionView) {
        const goalId = closeWorkTab.dataset.closeWorkTab;
        const index = openWorkTabs.indexOf(goalId);
        if (index < 0) return;
        if (openWorkTabs.length === 1) {
          showToast(L("至少保留一个打开的 Goal"));
          return;
        }
        openWorkTabs.splice(index, 1);
        persistWorkTabs();
        if (goalId === selected) {
          const nextGoalId = openWorkTabs[Math.min(index, openWorkTabs.length - 1)];
          if (nextGoalId) {
            await selectGoal(nextGoalId);
            focusWorkTab(nextGoalId);
          }
        } else {
          renderWorkTabs();
          focusWorkTab(selected);
        }
        return;
      }
      const workTab = target.closest("[data-work-tab]");
      if (workTab) {
        setDesktopDirectory("goals", true, false, workTab);
        setDesktopWorkSurface("goal", true, true);
        await selectGoal(workTab.dataset.workTab);
        return;
      }
      if (target.closest("[data-personal-search]")) {
        treeSearch?.focus();
        treeSearch?.select();
        return;
      }
      const loadMoreEventsButton = target.closest("[data-load-more-goal-events]");
      if (loadMoreEventsButton) {
        await loadMoreGoalEvents(loadMoreEventsButton);
        return;
      }
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
      if (target.closest("[data-retry-goal-momentum]")) {
        void loadGoalGraph();
        return;
      }
      const navigatorViewButton = target.closest("button[data-navigator-view]");
      if (navigatorViewButton) {
        setNavigatorView(navigatorViewButton.dataset.navigatorView);
        return;
      }
      const workbenchViewButton = target.closest("button[data-workbench-view]");
      if (workbenchViewButton) {
        setWorkspaceMode(workbenchViewButton.dataset.workbenchView);
        return;
      }
      if (target.closest("[data-tui-focus-return]")) {
        setWorkspaceMode("focus");
        return;
      }
      if (target.closest("[data-directory-toggle]")) {
        setDirectoryCollapsed(!workspace.classList.contains("is-directory-collapsed"));
        return;
      }
      const momentumFilterButton = target.closest("[data-momentum-filter]");
      if (momentumFilterButton) {
        momentumOpenOnly = momentumFilterButton.dataset.momentumFilter === "open";
        updateGraphVisibility();
        queueSave();
        return;
      }
      const momentumPeriodButton = target.closest("[data-momentum-period]");
      if (momentumPeriodButton) {
        setMomentumPeriod(momentumPeriodButton.dataset.momentumPeriod);
        return;
      }
      const momentumSelectButton = target.closest("[data-momentum-select], [data-momentum-node]");
      if (momentumSelectButton) {
        updateMomentumSelection(momentumSelectButton.dataset.momentumSelect || momentumSelectButton.dataset.goalId);
        return;
      }
      if (target.closest("[data-companion-runtime-open]")) {
        setWorkspaceMode("runtime");
        return;
      }
      const graphZoomButton = target.closest("[data-graph-zoom]");
      if (graphZoomButton) {
        const action = graphZoomButton.dataset.graphZoom;
        if (action === "fit") {
          fitGoalGraph();
        } else {
          setGraphZoom(action === "in" ? graphZoom + .1 : graphZoom - .1, true, false);
        }
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
        const mobileView = mobileTarget.dataset.mobileTarget;
        if (mobileView === "document") setWorkspaceMode("focus", false);
        if (mobileView === "tui") setWorkspaceMode("runtime", false);
        setMobileView(mobileView);
        saveUiState();
        return;
      }
      const goalTab = target.closest("[data-goal-tab]");
      if (goalTab) {
        setGoalPanel(goalTab.dataset.goalTab, true, true, true);
        return;
      }
      const retryGoalPanel = target.closest("[data-retry-goal-panel]");
      if (retryGoalPanel) {
        const article = retryGoalPanel.closest("[data-goal-view]");
        void loadGoalPanel(article, retryGoalPanel.dataset.retryGoalPanel);
        return;
      }
      const focusSectionTrigger = target.closest("[data-focus-section-trigger]");
      if (focusSectionTrigger) {
        const factor = focusSectionTrigger.dataset.goalFactorTab;
        if (factor) setGoalFactor(factor, true, true);
        else activateFocusSection(focusSectionTrigger);
        return;
      }
      const factorTab = target.closest("[data-goal-factor-tab]");
      if (factorTab) {
        setGoalFactor(factorTab.dataset.goalFactorTab, true, true);
        return;
      }
      const openQuickRecord = target.closest("[data-open-quick-record]");
      if (openQuickRecord) {
        await loadAndOpenQuickRecord(openQuickRecord);
        return;
      }
      const closeQuickRecord = target.closest("[data-close-quick-record]");
      if (closeQuickRecord) {
        const quickDialog = closeQuickRecord.closest("[data-quick-record-dialog]");
        quickDialog?.close();
        resetQuickRecordDialog(quickDialog);
        quickDialog?._opener?.focus();
        return;
      }
      const quickRecordType = target.closest("[data-quick-record-type]");
      if (quickRecordType) {
        const quickDialog = quickRecordType.closest("[data-quick-record-dialog]");
        const choices = quickDialog?.querySelector("[data-quick-record-choices]");
        const panel = quickDialog?.querySelector('[data-quick-record-panel="' + quickRecordType.dataset.quickRecordType + '"]');
        if (!quickDialog || !panel) return;
        if (choices) choices.hidden = true;
        quickDialog.querySelectorAll("[data-quick-record-panel]").forEach((candidate) => { candidate.hidden = candidate !== panel; });
        const title = quickDialog.querySelector("[data-quick-record-title]");
        if (title) title.textContent = quickRecordType.querySelector("strong")?.textContent || L("快速记录");
        requestAnimationFrame(() => panel.querySelector("input:not([type=hidden]), textarea, select")?.focus());
        return;
      }
      const quickRecordBack = target.closest("[data-quick-record-back]");
      if (quickRecordBack) {
        const quickDialog = quickRecordBack.closest("[data-quick-record-dialog]");
        resetQuickRecordDialog(quickDialog);
        requestAnimationFrame(() => quickDialog?.querySelector("[data-quick-record-type]")?.focus());
        return;
      }
      if (target.closest("[data-open-goal-edit]")) {
        setGoalPanel("completion", true, true, true);
        const editor = document.querySelector(".goal-edit-disclosure");
        if (editor) {
          editor.open = true;
          editor.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
          requestAnimationFrame(() => editor.querySelector("input, textarea, select")?.focus());
        }
        return;
      }
      if (target.closest("[data-open-goal-tui]")) {
        setWorkspaceMode("runtime");
        const addTerminal = document.querySelector("[data-tui-add]");
        if (addTerminal) addTerminal.click();
        return;
      }
      const sectionLink = target.closest('a[href^="#"]');
      if (sectionLink) {
        const targetId = sectionLink.getAttribute("href")?.slice(1);
        const targetElement = targetId ? document.getElementById(targetId) : null;
        const targetPanel = targetId ? goalPanelFromTargetId(targetId) : "";
        const targetFactor = targetId ? goalFactorFromTargetId(targetId) : "";
        if (targetId && (targetElement || targetPanel || targetFactor)) {
          event.preventDefault();
          if (targetPanel) setGoalPanel(targetPanel, true);
          if (targetFactor) setGoalFactor(targetFactor, true);
          history.replaceState(null, "", "#" + targetId);
          if (targetElement) {
            const deepLinkScrollTarget = revealDeepLinkTarget(targetElement);
            requestAnimationFrame(() => deepLinkScrollTarget.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
          }
          return;
        }
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
          location.assign(globalThis.goalboardNavigationUrl(route((archived ? "/archive/goals/" : "/goals/") + encodeURIComponent(goalId))));
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
      const goalTreeDecisionForm = submittedForm.closest?.("[data-goal-tree-decision-form]");
      if (goalTreeDecisionForm) {
        event.preventDefault();
        const decision = event.submitter?.value;
        const buttons = [...goalTreeDecisionForm.querySelectorAll('button[type="submit"]')];
        const errorBox = goalTreeDecisionForm.querySelector("[data-decision-error]");
        const values = new FormData(goalTreeDecisionForm);
        const reason = String(values.get("reason") || "").trim();
        const itemIds = values.getAll("item_id").map((value) => String(value));
        const receiptContext = decisionReceiptContext(goalTreeDecisionForm);
        const hasSystemIssues = goalTreeDecisionForm.dataset.hasSystemIssues === "true";
        if (decision === "repair-risks") {
          const repairs = [];
          let firstMissing = null;
          for (const repairGroup of goalTreeDecisionForm.querySelectorAll("[data-risk-proposal-repair]")) {
            const selected = repairGroup.querySelector('input[type="radio"]:checked');
            const localError = repairGroup.querySelector("[data-risk-repair-error]");
            if (!selected) {
              localError.textContent = L("请选择这条风险的处理方式");
              localError.hidden = false;
              firstMissing ||= repairGroup.querySelector('input[type="radio"]');
              continue;
            }
            localError.hidden = true;
            repairs.push({
              item_id: repairGroup.dataset.riskItemId,
              treatment: selected.value,
              treatment_plan: String(repairGroup.querySelector("[data-risk-treatment-plan]")?.value || "").trim(),
            });
          }
          if (firstMissing) {
            firstMissing.focus();
            return;
          }
          if (!repairs.length) {
            errorBox.textContent = L("这份方案已经变化，暂时不能提交。请刷新后重试。");
            errorBox.hidden = false;
            return;
          }
          const submitLabel = event.submitter?.textContent;
          const buttonStates = buttons.map((button) => button.disabled);
          buttons.forEach((button) => { button.disabled = true; });
          if (event.submitter) event.submitter.textContent = L("正在保存…");
          errorBox.hidden = true;
          try {
            const response = await fetch(route("/api/goal-tree-proposals/" + encodeURIComponent(goalTreeDecisionForm.dataset.goalTreeProposalId) + "/decision"), {
              method: "POST",
              headers: goalboardControlHeaders(),
              body: JSON.stringify({ risk_repairs: repairs }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || L("风险处理保存失败"));
            await refreshBoardWithDecisionReceipt(
              L("风险处理已保存。方案的其他内容没有改变，仍需补全的问题会继续显示。"),
              receiptContext,
            );
          } catch (error) {
            errorBox.textContent = humanDecisionError(error.message, L("风险处理保存失败，请重试"));
            errorBox.hidden = false;
            buttons.forEach((button, index) => { button.disabled = buttonStates[index]; });
            if (event.submitter) event.submitter.textContent = submitLabel;
          }
          return;
        }
        if ((decision === "confirm" || (decision === "reject" && !hasSystemIssues)) &&
            requireDecisionText(goalTreeDecisionForm, errorBox, "reason", "请填写决定理由或修改意见")) return;
        if (!itemIds.length) {
          errorBox.textContent = L("这份方案已经变化，暂时不能提交。请让 Runtime 按最新状态重新整理。");
          errorBox.hidden = false;
          return;
        }
        const submitLabel = event.submitter?.textContent;
        const buttonStates = buttons.map((button) => button.disabled);
        buttons.forEach((button) => { button.disabled = true; });
        if (event.submitter) event.submitter.textContent = L("正在保存…");
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/goal-tree-proposals/" + encodeURIComponent(goalTreeDecisionForm.dataset.goalTreeProposalId) + "/decision"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify({
              ...(decision === "confirm"
                ? { confirm_all_pending: true }
                : { decisions: itemIds.map((itemId) => ({ item_id: itemId, decision, reason })) }),
              reason,
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("方案决定提交失败"));
          if (Array.isArray(result.conflict_item_ids) && result.conflict_item_ids.length) {
            throw new Error(L("GoalBoard 已经发生变化。请让 Runtime 更新方案后再决定。"));
          }
          await refreshBoardWithDecisionReceipt(
            decision === "confirm" ? L("这份 Goal 方案已经采用，相关 Goal 和关系已更新。") : L("这份 Goal 方案已退回，当前 Goal Tree 保持不变。"),
            receiptContext,
          );
        } catch (error) {
          errorBox.textContent = humanDecisionError(error.message, L("方案决定提交失败，请重试"));
          errorBox.hidden = false;
          buttons.forEach((button, index) => { button.disabled = buttonStates[index]; });
          if (event.submitter) event.submitter.textContent = submitLabel;
        }
        return;
      }
      const contractDecisionForm = submittedForm.closest?.("[data-contract-decision-form]");
      if (contractDecisionForm) {
        event.preventDefault();
        const decision = event.submitter?.value;
        await submitDecisionForm(
          contractDecisionForm,
          event.submitter,
          "/api/contract-proposals/" + encodeURIComponent(contractDecisionForm.dataset.contractProposalId) + "/decision",
          decision,
          decision === "approved" ? L("目标说明已确认，现在可以进入执行。") : L("目标说明已退回，草稿保持不变。"),
        );
        return;
      }

      const candidateDecisionForm = submittedForm.closest?.("[data-candidate-decision-form]");
      if (candidateDecisionForm) {
        event.preventDefault();
        const decision = event.submitter?.value;
        await submitDecisionForm(
          candidateDecisionForm,
          event.submitter,
          "/api/candidates/" + encodeURIComponent(candidateDecisionForm.dataset.candidateId) + "/decision",
          decision,
          decision === "approved" ? L("新工作已加入 Goal Tree；需要调整关系时会继续出现在这里。") : L("这项新工作暂未加入，你的意见已保留。"),
        );
        return;
      }

      const rewireDecisionForm = submittedForm.closest?.("[data-rewire-decision-form]");
      if (rewireDecisionForm) {
        event.preventDefault();
        const decision = event.submitter?.value;
        await submitDecisionForm(
          rewireDecisionForm,
          event.submitter,
          "/api/rewires/" + encodeURIComponent(rewireDecisionForm.dataset.rewireId) + "/decision",
          decision,
          decision === "confirmed"
            ? (result) => {
                const impact = result?.rewire?.impact || {};
                const added = Array.isArray(impact.added_relation_ids) ? impact.added_relation_ids.length : 0;
                const removed = Array.isArray(impact.deactivated_relation_ids) ? impact.deactivated_relation_ids.length : 0;
                const risks = Array.isArray(impact.added_risk_ids) ? impact.added_risk_ids.length : 0;
                const changes = [];
                if (added) changes.push(L("新增 {count} 条关系", { count: added }));
                if (removed) changes.push(L("解除 {count} 条关系", { count: removed }));
                if (risks) changes.push(L("新增 {count} 项风险", { count: risks }));
                return changes.length
                  ? L("已{changes}。", { changes: changes.join("、") })
                  : L("决定已记录，但这次没有新增或解除 Goal 关系，也没有新增风险。");
              }
            : L("这次调整未采用，现有 Goal 关系没有改变。"),
        );
        return;
      }

      const relationForm = submittedForm.closest?.("[data-relation-form]");
      if (relationForm) {
        event.preventDefault();
        const submit = relationForm.querySelector('button[type="submit"]');
        const errorBox = relationForm.querySelector("[data-relation-error]");
        if (requireFormFacts(relationForm, errorBox)) return;
        const values = new FormData(relationForm);
        const relationSummary = relationForm.querySelector("[data-relation-live-preview] strong")?.textContent?.trim() || L("当前 Goal 的关系");
        const submitLabel = submit.textContent;
        submit.disabled = true;
        submit.textContent = L("正在保存…");
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
          showFactorReceipt(
            "relations",
            L("关系已建立"),
            L("已建立：{relation}。准确方向和建立原因已进入完整记录。", { relation: relationSummary }),
          );
        } catch (error) {
          errorBox.textContent = humanDecisionError(error.message, L("关系建立失败，请检查目标、方向和原因"));
          errorBox.hidden = false;
          submit.disabled = false;
          submit.textContent = submitLabel;
        }
        return;
      }

      const relationDeactivateForm = submittedForm.closest?.("[data-relation-deactivate-form]");
      if (relationDeactivateForm) {
        event.preventDefault();
        const submit = relationDeactivateForm.querySelector('button[type="submit"]');
        const errorBox = relationDeactivateForm.querySelector("[data-relation-deactivate-error]");
        if (requireDecisionText(relationDeactivateForm, errorBox, "reason", "请填写解除原因。说明这条关系为什么不再成立。")) return;
        const reason = String(new FormData(relationDeactivateForm).get("reason") || "").trim();
        const relatedGoal = relationDeactivateForm.closest(".relation-record")?.querySelector(".relation-copy strong")?.textContent?.trim() || L("另一个 Goal");
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
          showFactorReceipt(
            "relations",
            L("关系已解除"),
            L("与「{goal}」的关系已停止生效；原方向和解除原因仍保留在完整记录中。", { goal: relatedGoal }),
          );
        } catch (error) {
          errorBox.textContent = humanDecisionError(error.message, L("关系解除失败，请检查解除原因后重试"));
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
          showToast(L("草稿修改已保存"));
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
        if (requireFormFacts(riskCreateForm, errorBox)) return;
        const values = new FormData(riskCreateForm);
        if (!values.getAll("goal_ids").length) {
          const picker = riskCreateForm.querySelector(".risk-goal-picker");
          if (picker) picker.open = true;
          errorBox.textContent = L("请至少选择一条受影响的 Goal");
          errorBox.hidden = false;
          picker?.querySelector('input[name="goal_ids"]')?.focus();
          return;
        }
        const submitLabel = submit.textContent;
        submit.disabled = true;
        submit.textContent = L("正在保存…");
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/goals/" + encodeURIComponent(riskCreateForm.dataset.goalId) + "/risks"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify(readRiskPayload(values)),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("风险记录失败"));
          await refreshBoard(true);
          const description = result?.risk?.description || String(values.get("description") || "").trim();
          showFactorReceipt(
            "risks",
            L("风险已记录"),
            L("已记录风险「{description}」。它现在保持待处理；需要确认处理结果时，请到待决定。", { description }),
          );
        } catch (error) {
          errorBox.textContent = humanDecisionError(error.message, L("风险记录失败，请检查输入后重试"));
          errorBox.hidden = false;
          submit.disabled = false;
          submit.textContent = submitLabel;
        }
        return;
      }

      const riskEditForm = submittedForm.closest?.("[data-risk-edit-form]");
      if (riskEditForm) {
        event.preventDefault();
        const submit = riskEditForm.querySelector('button[type="submit"]');
        const errorBox = riskEditForm.querySelector("[data-risk-error]");
        if (requireFormFacts(riskEditForm, errorBox)) return;
        const values = new FormData(riskEditForm);
        if (!values.getAll("goal_ids").length) {
          const picker = riskEditForm.querySelector(".risk-goal-picker");
          if (picker) picker.open = true;
          errorBox.textContent = L("请至少选择一条受影响的 Goal");
          errorBox.hidden = false;
          picker?.querySelector('input[name="goal_ids"]')?.focus();
          return;
        }
        const submitLabel = submit.textContent;
        submit.disabled = true;
        submit.textContent = L("正在保存…");
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/risks/" + encodeURIComponent(riskEditForm.dataset.riskId) + "/update"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify(readRiskPayload(values)),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("风险更新失败"));
          await refreshBoard(true);
          const description = result?.risk?.description || String(values.get("description") || "").trim();
          showFactorReceipt(
            "risks",
            L("风险信息已更新"),
            L("已更新风险「{description}」。这次修改没有改变它的处理结果。", { description }),
          );
        } catch (error) {
          errorBox.textContent = humanDecisionError(error.message, L("风险更新失败，请检查输入后重试"));
          errorBox.hidden = false;
          submit.disabled = false;
          submit.textContent = submitLabel;
        }
        return;
      }

      const riskStateForm = submittedForm.closest?.("[data-risk-state-form]");
      if (riskStateForm) {
        event.preventDefault();
        const submit = riskStateForm.querySelector('button[type="submit"]');
        const errorBox = riskStateForm.querySelector("[data-risk-error]");
        const receiptContext = decisionReceiptContext(riskStateForm);
        if (requireDecisionText(riskStateForm, errorBox, "state", "请选择风险处理结果，再保存。")) return;
        if (requireDecisionText(riskStateForm, errorBox, "reason", "请填写决定理由。说明你为什么这样选择，以及依据是什么。")) return;
        const values = new FormData(riskStateForm);
        if (values.get("state") === "resolved") {
          if (requireDecisionText(riskStateForm, errorBox, "resolution_summary", "请写清什么事实证明这条风险已经解决。")) return;
          if (requireDecisionText(riskStateForm, errorBox, "resolution_evidence_refs", "请至少填写一条可追溯的证据引用。")) return;
        }
        const submitLabel = submit.textContent;
        submit.disabled = true;
        submit.textContent = L("正在保存…");
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/risks/" + encodeURIComponent(riskStateForm.dataset.riskId) + "/state"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify({
              state: values.get("state"),
              reason: String(values.get("reason") || "").trim(),
              goal_id: riskStateForm.dataset.goalId,
              action_id: riskStateForm.dataset.actionId,
              action_token: riskStateForm.dataset.actionToken,
              contract_revision: Number(riskStateForm.dataset.contractRevision),
              ...(values.get("state") === "resolved" ? {
                resolution_basis: {
                  summary: String(values.get("resolution_summary") || "").trim(),
                  evidence_refs: String(values.get("resolution_evidence_refs") || "").split(/[\\n]+/).map((value) => value.trim()).filter(Boolean),
                  residual_gaps: String(values.get("resolution_residual_gaps") || "").split(/[\\n]+/).map((value) => value.trim()).filter(Boolean),
                },
              } : {}),
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Risk 状态更新失败");
          const resultState = result?.decision || result?.risk?.state;
          const resultMessages = {
            open: L("风险保持待处理，仍会留在待决定中，并继续按当前规则影响关联 Goal。"),
            triggered: L("风险已标记为发生，仍会留在待决定中，并继续按当前规则影响关联 Goal。"),
            resolved: L("风险已标记为解决，不再阻止关联 Goal。"),
            accepted: L("风险已接受，不再阻止关联 Goal。"),
            expired: L("风险已过期，不再继续跟踪或阻止关联 Goal。"),
            rejected: L("你没有接受这项风险，已改为由 Runtime 继续处理。"),
          };
          await refreshBoardWithDecisionReceipt(
            resultMessages[resultState] || L("风险处理方式已记录。"),
            receiptContext,
          );
        } catch (error) {
          errorBox.textContent = humanDecisionError(error.message, "风险决定保存失败，请检查输入后重试");
          errorBox.hidden = false;
          submit.disabled = false;
          submit.textContent = submitLabel;
        }
        return;
      }

      const impactCreateForm = submittedForm.closest?.("[data-impact-create-form]");
      if (impactCreateForm) {
        event.preventDefault();
        const submit = impactCreateForm.querySelector('button[type="submit"]');
        const errorBox = impactCreateForm.querySelector("[data-impact-error]");
        if (requireFormFacts(impactCreateForm, errorBox)) return;
        const values = new FormData(impactCreateForm);
        const submitLabel = submit.textContent;
        submit.disabled = true;
        submit.textContent = L("正在保存…");
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/goals/" + encodeURIComponent(impactCreateForm.dataset.goalId) + "/impacts"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify(readImpactPayload(values)),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("影响范围记录失败"));
          await refreshBoard(true);
          const surface = result?.impact?.surface || result?.surface || String(values.get("surface") || "").trim();
          showFactorReceipt(
            "impacts",
            L("影响范围已记录"),
            L("已记录「{surface}」。它已绑定当前 Goal，并按保存的确认状态参与工作冲突判断。", { surface }),
          );
        } catch (error) {
          errorBox.textContent = humanDecisionError(error.message, L("影响范围记录失败，请检查输入后重试"));
          errorBox.hidden = false;
          submit.disabled = false;
          submit.textContent = submitLabel;
        }
        return;
      }

      const impactEditForm = submittedForm.closest?.("[data-impact-edit-form]");
      if (impactEditForm) {
        event.preventDefault();
        const submit = impactEditForm.querySelector('button[type="submit"]');
        const errorBox = impactEditForm.querySelector("[data-impact-error]");
        if (requireFormFacts(impactEditForm, errorBox)) return;
        const values = new FormData(impactEditForm);
        const submitLabel = submit.textContent;
        submit.disabled = true;
        submit.textContent = L("正在保存…");
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/impacts/" + encodeURIComponent(impactEditForm.dataset.impactId) + "/update"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify(readImpactPayload(values)),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("影响范围更新失败"));
          await refreshBoard(true);
          const surface = result?.impact?.surface || result?.surface || String(values.get("surface") || "").trim();
          showFactorReceipt(
            "impacts",
            L("影响范围已更新"),
            L("已更新「{surface}」。旧值和修改说明已进入完整记录。", { surface }),
          );
        } catch (error) {
          errorBox.textContent = humanDecisionError(error.message, L("影响范围更新失败，请检查输入后重试"));
          errorBox.hidden = false;
          submit.disabled = false;
          submit.textContent = submitLabel;
        }
        return;
      }

      const impactDeactivateForm = submittedForm.closest?.("[data-impact-deactivate-form]");
      if (impactDeactivateForm) {
        event.preventDefault();
        const submit = impactDeactivateForm.querySelector('button[type="submit"]');
        const errorBox = impactDeactivateForm.querySelector("[data-impact-error]");
        if (requireDecisionText(impactDeactivateForm, errorBox, "reason", "请填写停用原因。说明这条影响范围为什么不再有效。")) return;
        const values = new FormData(impactDeactivateForm);
        const surface = impactDeactivateForm.closest(".impact-record")?.querySelector("h4")?.textContent?.trim() || L("这条影响范围");
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
          showFactorReceipt(
            "impacts",
            L("影响范围已停用"),
            L("「{surface}」不再参与工作冲突判断；原记录和停用原因仍会保留。", { surface }),
          );
        } catch (error) {
          errorBox.textContent = humanDecisionError(error.message, L("影响范围停用失败，请检查停用原因后重试"));
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
        const submitLabel = submit.textContent;
        submit.disabled = true;
        submit.textContent = L("正在保存…");
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
              action_token: evidenceForm.dataset.actionToken,
              contract_revision: Number(evidenceForm.dataset.contractRevision),
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("完成依据记录失败"));
          await refreshBoard(true);
          showToast(result?.transition?.summary || L("完成依据已记录，并已绑定到当前 Goal"));
        } catch (error) {
          errorBox.textContent = error.message || L("完成依据记录失败，请检查输入后重试");
          errorBox.hidden = false;
          submit.disabled = false;
          submit.textContent = submitLabel;
        }
        return;
      }

      const policyForm = submittedForm.closest?.("[data-policy-form]");
      if (policyForm) {
        event.preventDefault();
        const submit = policyForm.querySelector('button[type="submit"]');
        const errorBox = policyForm.querySelector("[data-policy-error]");
        if (requireFormFacts(policyForm, errorBox)) return;
        const minimumViolation = [...policyForm.querySelectorAll("[data-policy-min]")].find((field) => Number(field.value) < Number(field.dataset.policyMin));
        const maximumViolation = [...policyForm.querySelectorAll("[data-policy-max]")].find((field) => Number(field.value) > Number(field.dataset.policyMax));
        const policyLimitViolation = minimumViolation || maximumViolation;
        if (policyLimitViolation) {
          let disclosure = policyLimitViolation.closest("details");
          while (disclosure) {
            disclosure.open = true;
            disclosure = disclosure.parentElement?.closest("details");
          }
          const label = policyLimitViolation.closest("label")?.querySelector("strong")?.textContent?.trim() || L("这项规则");
          errorBox.textContent = minimumViolation
            ? L("{label}不能低于项目共同规则要求的 {value}。", { label, value: minimumViolation.dataset.policyMin })
            : L("{label}不能超过项目共同规则允许的 {value} 秒。", { label, value: maximumViolation.dataset.policyMax });
          errorBox.hidden = false;
          policyLimitViolation.setAttribute("aria-invalid", "true");
          policyLimitViolation.focus();
          return;
        }
        const values = new FormData(policyForm);
        const submitLabel = submit.textContent;
        submit.disabled = true;
        submit.textContent = L("正在保存…");
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
          if (!response.ok) throw new Error(result.error || L("工作规则保存失败"));
          await refreshBoard(true);
          if (values.get("scope") === "goal") {
            const policy = result?.resolved_policy || {
              goal_mode: values.get("goal_mode"),
              self_verification: values.has("self_verification"),
              human_approval: values.has("human_approval"),
            };
            const modeLabels = { disabled: L("不要求"), preferred: L("建议使用"), required: L("必须使用") };
            showFactorReceipt(
              "rules",
              L("工作规则已保存"),
              L("最终生效：按 Goal 工作“{mode}”，推进者自检“{self}”，用户确认“{human}”。", {
                mode: modeLabels[policy.goal_mode] || String(policy.goal_mode || ""),
                self: policy.self_verification ? L("需要") : L("不需要"),
                human: policy.human_approval ? L("需要") : L("不需要"),
              }),
            );
          } else {
            showToast(L("项目默认工作规则已保存"));
          }
        } catch (error) {
          errorBox.textContent = humanDecisionError(error.message, L("工作规则保存失败，请检查输入后重试"));
          errorBox.hidden = false;
          submit.disabled = false;
          submit.textContent = submitLabel;
        }
        return;
      }

      const reviewForm = submittedForm.closest?.("[data-human-review-form]");
      if (reviewForm) {
        event.preventDefault();
        const submit = reviewForm.querySelector('button[type="submit"]');
        const errorBox = reviewForm.querySelector("[data-review-error]");
        const values = new FormData(reviewForm);
        if (requireDecisionText(reviewForm, errorBox, "verdict", "请先选择结论。")) return;
        if (requireDecisionText(reviewForm, errorBox, "reasoning", "请填写判断理由。说明结果为什么达到或没有达到完成标准。")) return;
        const extraRefs = String(values.get("evidence_refs_extra") || "")
          .split("\\n")
          .map((item) => item.trim())
          .filter(Boolean);
        const evidenceRefs = [...new Set([...values.getAll("evidence_refs").map(String), ...extraRefs])];
        const receiptContext = decisionReceiptContext(reviewForm);
        const submitLabel = submit.textContent;
        submit.disabled = true;
        submit.textContent = L("正在保存…");
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
                attention_token: reviewForm.dataset.attentionToken,
                contract_revision: Number(reviewForm.dataset.contractRevision),
              }),
            },
          );
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "结果确认保存失败");
          const resultMessages = {
            pass: L("结果已确认通过；Goal 是否完成仍由全部完成条件共同决定。"),
            needs_changes: L("结果已退回修改；你的理由和依据已保留。"),
            fail: L("结果已确认未通过；你的理由和依据已保留。"),
            inconclusive: L("结果暂未判断；请补充与完成标准对应的依据。"),
          };
          const nextAction = result?.transition?.projection?.primary_action;
          const receiptMessage = (resultMessages[result?.review?.verdict] || L("结果确认已记录。")) +
            (nextAction ? L(" 下一步：{action}。", { action: result.transition.summary || nextAction.kind }) : "");
          await refreshBoardWithDecisionReceipt(receiptMessage, receiptContext);
        } catch (error) {
          errorBox.textContent = humanDecisionError(error.message, "结果确认保存失败，请检查输入后重试");
          errorBox.hidden = false;
          submit.disabled = false;
          submit.textContent = submitLabel;
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
        sessionStorage.removeItem(currentGoalUiStorageKey);
        location.assign(globalThis.goalboardNavigationUrl(result.goal_path));
      } catch (error) {
        formError.textContent = error.message || "创建失败，请检查输入后重试";
        formError.hidden = false;
        submit.disabled = false;
      }
    });

    addEventListener("popstate", (event) => {
      const pathname = localPathname();
      const match = pathname.match(
        trashView ? /^\\/trash\\/goals\\/(.+)$/ : archiveView ? /^\\/archive\\/goals\\/(.+)$/ : /^\\/goals\\/(.+)$/,
      );
      const collectionRoot = trashView ? "/trash" : archiveView ? "/archive" : "/";
      const rootGoalId = pathname === collectionRoot
        ? String(event.state?.goalId || state.active_goal_id || visibleGoals()[0]?.goal.goal_id || "")
        : "";
      const goalId = match ? decodeURIComponent(match[1]) : rootGoalId;
      if (goalId) void selectGoal(goalId, false);
    });
    addEventListener("hashchange", () => {
      const targetId = decodeURIComponent(location.hash.slice(1));
      const panel = goalPanelFromHash();
      if (panel) setGoalPanel(panel, true);
      const factor = goalFactorFromHash();
      if (factor) setGoalFactor(factor, true);
      const target = targetId ? document.getElementById(targetId) : null;
      if (target?.matches?.("[data-goal-panel]")) documentPane.scrollTop = 0;
      if (targetId) void revealDeepLinkFromId(targetId);
    });
    addEventListener("pagehide", saveUiState);
    addEventListener("keydown", (event) => {
      const currentWorkTab = event.target?.closest?.("[data-work-tab]");
      if (currentWorkTab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        const tabs = [...currentWorkTab.closest('[role="tablist"]').querySelectorAll("[data-work-tab]")];
        const currentIndex = tabs.indexOf(currentWorkTab);
        const nextIndex = event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        event.preventDefault();
        const nextTab = tabs[nextIndex];
        const nextGoalId = nextTab.dataset.workTab;
        void selectGoal(nextGoalId).then(() => focusWorkTab(nextGoalId));
        return;
      }
      const currentTab = event.target?.closest?.("[data-goal-tab]");
      if (currentTab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        const tabs = [...currentTab.closest('[role="tablist"]').querySelectorAll("[data-goal-tab]")];
        const currentIndex = tabs.indexOf(currentTab);
        const nextIndex = event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        event.preventDefault();
        const nextTab = tabs[nextIndex];
        setGoalPanel(nextTab.dataset.goalTab, true, true, true);
        nextTab.focus();
        return;
      }
      const currentFocusSection = event.target?.closest?.("[data-focus-section-trigger]:not([data-goal-factor-tab])");
      if (currentFocusSection && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
        const triggers = [...currentFocusSection.closest("[data-focus-section-deck]").querySelectorAll("[data-focus-section-card-row] > [data-focus-section-card] > [data-focus-section-trigger]")];
        const currentIndex = triggers.indexOf(currentFocusSection);
        const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
        const nextIndex = event.key === "Home"
          ? 0
          : event.key === "End"
            ? triggers.length - 1
            : (currentIndex + direction + triggers.length) % triggers.length;
        event.preventDefault();
        const nextTrigger = triggers[nextIndex];
        activateFocusSection(nextTrigger);
        nextTrigger.focus();
        return;
      }
      const currentFactorTab = event.target?.closest?.("[data-goal-factor-tab]");
      if (currentFactorTab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        const tabs = [...currentFactorTab.closest('[role="tablist"]').querySelectorAll("[data-goal-factor-tab]")];
        const currentIndex = tabs.indexOf(currentFactorTab);
        const nextIndex = event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        event.preventDefault();
        const nextTab = tabs[nextIndex];
        setGoalFactor(nextTab.dataset.goalFactorTab, true, true);
        nextTab.focus();
        return;
      }
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
      if (event.key === "Escape" && !feedFilterPanel?.hidden) {
        event.preventDefault();
        setFeedFilterOpen(false);
        feedFilterTrigger?.focus();
        return;
      }
      const quickDialog = document.querySelector("[data-quick-record-dialog][open]");
      if (event.key === "Escape" && quickDialog) {
        event.preventDefault();
        quickDialog.close();
        resetQuickRecordDialog(quickDialog);
        quickDialog._opener?.focus();
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
    addEventListener("resize", () => {
      const nextCompanionActive = document.body.dataset.desktopShell === "true" && matchMedia("(max-width: 760px)").matches;
      if (nextCompanionActive && !desktopCompanionActive && selected) setMobileView("document");
      desktopCompanionActive = nextCompanionActive;
      setTreeWidth(treePane.getBoundingClientRect().width, false);
      requestAnimationFrame(() => graphAutoFit ? fitGoalGraph(false) : drawGoalGraph());
    });

    setTreeWidth(treePane.getBoundingClientRect().width, false);
    if (tuiPane) setTuiWidth(tuiPane.getBoundingClientRect().width, false);
    let restoredUi = false;
    try {
      const stored = JSON.parse(
        sessionStorage.getItem(storageKey) ||
        (!decisionView && !collectionView ? sessionStorage.getItem(goalUiStorageKey) : null) ||
        "null",
      );
      if (stored) {
        applyUiState(stored);
        restoredUi = true;
        sessionStorage.setItem(storageKey, JSON.stringify(stored));
      }
    } catch {}
    if (!restoredUi) {
      setWorkspaceMode("focus", false);
      setGoalPanel(goalPanelFromHash() || "overview", false);
      if (feedDirectory) setFeedPreset("inbox_message", false);
      if (desktopDirectoryPanels.length) {
        setDesktopDirectory(decisionView ? "feed" : treePane?.dataset.desktopDirectory || "root", false, false);
      }
      if (desktopWorkSurfaces.length) setDesktopWorkSurface(decisionView ? "feed" : "goal", false, false);
    }
    const directGoalRequested = /^\\/(?:archive\\/|trash\\/)?goals\\/[^\\/]+\\/?$/.test(localPathname());
    if (directGoalRequested && selected) {
      goalWorkspaceMode = "focus";
      setDesktopDirectory("goals", false, false);
      if (desktopWorkSurfaces.length) setDesktopWorkSurface("goal", false, false);
      setWorkspaceMode("focus", false);
      if (matchMedia("(max-width: 760px)").matches) setMobileView("document");
      saveUiState();
    }
    const feedStartRequested = new URLSearchParams(location.search).get("feed-start") === "1";
    const onboardingRuntimeRequested = new URLSearchParams(location.search).get("onboarding-runtime") === "1";
    if (onboardingRuntimeRequested && selected && tuiPane) {
      goalWorkspaceMode = "runtime";
      setDesktopDirectory("goals", false, false);
      if (desktopWorkSurfaces.length) setDesktopWorkSurface("goal", false, false);
      setWorkspaceMode("runtime", false);
      setMobileView("tui");
      saveUiState();
    }
    if (feedStartRequested && selected && tuiPane) {
      goalWorkspaceMode = "runtime";
      setDesktopDirectory("goals", false, false);
      if (desktopWorkSurfaces.length) setDesktopWorkSurface("goal", false, false);
      setWorkspaceMode("runtime", false);
      setMobileView("tui");
      saveUiState();
    }
    const initialHashTargetId = decodeURIComponent(location.hash.slice(1));
    if (!restoredUi && initialHashTargetId) void revealDeepLinkFromId(initialHashTargetId);
    try {
      const goalMoveReceipt = JSON.parse(sessionStorage.getItem(goalMoveReceiptKey) || "null");
      sessionStorage.removeItem(goalMoveReceiptKey);
      if (goalMoveReceipt?.message) showToast(goalMoveReceipt.message);
    } catch {
      sessionStorage.removeItem(goalMoveReceiptKey);
    }
    try {
      const storedDecisionReceipt = JSON.parse(sessionStorage.getItem("goalboard-decision-receipt") || "null");
      sessionStorage.removeItem("goalboard-decision-receipt");
      if (storedDecisionReceipt?.message) {
        showDecisionReceipt(storedDecisionReceipt.message, storedDecisionReceipt.context);
      }
    } catch {
      sessionStorage.removeItem("goalboard-decision-receipt");
    }
    if (selected && tuiPane) {
      tuiPane.setAttribute("data-goal-id", selected);
      const selectedItem = visibleGoals().find((entry) => entry.goal.goal_id === selected);
      document.dispatchEvent(new CustomEvent("goalboard:goal-changed", { detail: {
        goalId: selected,
        goalTitle: selectedItem?.goal.title || selected,
        status: selectedItem?.status || "",
        statusLabel: selectedItem?.status_label || "",
        statusMeaning: selectedItem?.status_meaning || "",
        statusIconMarkup: selectedItem?.status_icon || "",
        parentReadOnly: Boolean(selectedItem?.is_compound_parent),
        children: selectedItem?.children || [],
      } }));
    }
    if (selected) ensureWorkTab(selected);
    else renderWorkTabs();
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

export interface GoalBoardOnboardingRenderOptions {
  mode: "first_run" | "new_project" | "update";
  currentVersion: string | null;
  controlToken?: string;
  desktopShell?: boolean;
  cliAvailability?: Record<string, boolean>;
}

const ONBOARDING_RUNTIME_CHOICES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "codex", label: "Codex" },
  { id: "claude-code", label: "Claude Code" },
  { id: "opencode", label: "OpenCode" },
  { id: "pi-agent", label: "Pi Agent" },
  { id: "grok-build", label: "Grok Build" },
];

const ONBOARDING_ATMOSPHERE = `<div class="onboarding-atmosphere" aria-hidden="true"></div>`;

export function renderGoalBoardOnboarding(options: GoalBoardOnboardingRenderOptions): string {
  const desktopShell = Boolean(options.desktopShell);
  const href = (target: string) => desktopShell ? withDesktopQuery(target) : target;
  if (options.mode === "update") {
    const version = options.currentVersion ? ` ${escapeHtml(options.currentVersion)}` : "";
    return `<!doctype html>
<html lang="${htmlLang()}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${controlTokenMeta(options.controlToken ?? "")}
  <title>${L("GoalBoard 已更新")}</title>
  <link rel="stylesheet" href="/assets/goalboard-onboarding.css">
</head>
<body class="onboarding-page onboarding-page--update"${desktopShell ? ' data-native-desktop="true"' : ""}>
  ${ONBOARDING_ATMOSPHERE}
  <main class="onboarding-update" aria-labelledby="onboarding-update-title">
    <span class="onboarding-brand">GoalBoard</span>
    <div class="onboarding-update-copy">
      <h1 id="onboarding-update-title">${L("GoalBoard 已更新")}${version}</h1>
      <p>${L("你的 Project、Goal 和工作记录仍保存在本机。更新不会替你接受 Goal，也不会自动修改 Runtime 配置。")}</p>
      <ul>
        <li><strong>${L("新项目可以从一个真实结果开始")}</strong><span>${L("创建 Project 时同时建立根 Draft Goal，后续从同一份事实继续。")}</span></li>
        <li><strong>${L("初始化可以直接交给 TUI")}</strong><span>${L("选择工作目录和 Runtime 后，提示会填入终端，但仍由你检查并发送。")}</span></li>
      </ul>
    </div>
    <div class="onboarding-update-actions">
      <button type="button" data-onboarding-dismiss="update">${L("继续使用 GoalBoard")}</button>
      <a href="${href("/settings/projects")}">${L("查看项目设置")}</a>
    </div>
    <p class="onboarding-error" data-onboarding-error role="alert" hidden></p>
  </main>
  <script>${clientI18nScript()}${CONTROL_CLIENT_SCRIPT}</script>
  <script>${ONBOARDING_CLIENT_SCRIPT}</script>
</body>
</html>`;
  }

  const runtimeAvailability = options.cliAvailability ?? {};
  const availableRuntimes = ONBOARDING_RUNTIME_CHOICES.filter(({ id }) => runtimeAvailability[id] === true);
  const runtimeChoices = [
    `<label class="onboarding-runtime-choice onboarding-runtime-choice--deferred"><input type="radio" name="runtime_kind" value="" checked><span>${icon("clock")}<strong>${L("之后再选")}</strong><i aria-hidden="true"></i></span></label>`,
    ...availableRuntimes.map(({ id, label }) => `<label class="onboarding-runtime-choice onboarding-runtime-choice--available"><input type="radio" name="runtime_kind" value="${id}"><span>${icon("terminal")}<strong>${escapeHtml(label)}</strong><i aria-hidden="true"></i></span></label>`),
  ].join("");
  const runtimeHint = availableRuntimes.length
    ? L("只会填入终端，等你自己发送。")
    : L("没有找到可用工具，可以稍后再选。");
  const intentIcons: Record<(typeof ONBOARDING_INTENT_FRAMES)[number]["id"], GoalBoardIcon> = {
    open: "target",
    build_change: "brand",
    design_plan: "workflow",
    diagnose_fix: "settings",
    analyze_decide: "search",
    migrate_refactor: "switch",
    operate_process: "activity",
    content_communication: "book",
  };
  const intentOptions = ONBOARDING_INTENT_FRAMES
    .map((frame, index) => `<button type="button" role="option" aria-selected="${index === 0 ? "true" : "false"}" data-onboarding-intent-option="${frame.id}" data-intent-label="${escapeHtml(L(frame.label))}" data-placeholder="${escapeHtml(L(frame.placeholder))}"><span>${icon(intentIcons[frame.id])}<b>${escapeHtml(L(frame.label))}</b></span><i aria-hidden="true"></i></button>`)
    .join("");
  const title = options.mode === "first_run" ? L("开始使用 GoalBoard") : L("建立一个新项目");
  return `<!doctype html>
<html lang="${htmlLang()}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${controlTokenMeta(options.controlToken ?? "")}
  <title>${title}</title>
  <link rel="stylesheet" href="/assets/goalboard-onboarding.css">
</head>
<body class="onboarding-page" data-onboarding-mode="${options.mode}" data-onboarding-tone="0"${desktopShell ? ' data-native-desktop="true"' : ""}>
  ${renderIconSprite()}
  ${ONBOARDING_ATMOSPHERE}
  <header class="onboarding-topbar">
    <a class="onboarding-brand" href="${href("/")}">GoalBoard</a>
    <div class="onboarding-topbar-actions"><a href="${href("/settings/projects")}">${L("迁移已有数据")}</a><button type="button" data-onboarding-dismiss="first_run">${options.mode === "first_run" ? L("跳过") : L("返回项目目录")}</button></div>
  </header>
  <main class="onboarding-room">
    <form class="onboarding-flow" data-onboarding-form novalidate>
      <div class="onboarding-flow-header">
        <p class="onboarding-progress" data-onboarding-progress aria-live="polite">01 / 04 · ${L("说说想法")}</p>
        <nav class="onboarding-actions" aria-label="${L("引导步骤导航")}">
          <button class="onboarding-back" type="button" data-onboarding-back hidden>${icon("back")}<span>${L("上一步")}</span></button>
          <button class="onboarding-next" type="button" data-onboarding-next><span data-onboarding-next-label>${L("下一步")}</span>${icon("arrow")}</button>
          <button class="onboarding-submit" type="submit" data-onboarding-submit hidden><span data-onboarding-submit-label>${L("创建项目")}</span>${icon("arrow")}</button>
        </nav>
      </div>
      <div class="onboarding-stage">
      <section class="onboarding-step is-current" data-onboarding-step="0" aria-labelledby="onboarding-question-0">
        <h1 id="onboarding-question-0" tabindex="-1">${L("你希望我们一起做什么？")}</h1>
        <p class="onboarding-intro">${L("先说说你想看到的变化，不用急着想得很完整。")}</p>
        <div class="onboarding-composer">
          <div class="onboarding-intent" data-onboarding-intent>
            <input type="hidden" name="intent_frame" value="open">
            <button type="button" class="onboarding-intent-trigger" data-onboarding-intent-trigger aria-haspopup="listbox" aria-expanded="false"><span data-onboarding-intent-current>${L("我想")}</span>${icon("chevron-down")}</button>
            <div class="onboarding-intent-options" role="listbox" aria-label="${L("这次更像哪一种？")}">${intentOptions}</div>
          </div>
          <label class="onboarding-answer onboarding-answer--plain"><span class="onboarding-visually-hidden">${L("你想推进的事")}</span><textarea name="outcome" rows="1" maxlength="2000" autocomplete="off" aria-describedby="onboarding-error-0" placeholder="${L("例如：把这个想法做成一个真的能用的产品")}" required></textarea></label>
        </div>
        <p class="onboarding-field-error" id="onboarding-error-0" data-step-error="0" role="alert" hidden></p>
      </section>
      <section class="onboarding-step" data-onboarding-step="1" aria-labelledby="onboarding-question-1" hidden>
        <p class="onboarding-echo"><span>${L("我们一起")}</span><strong data-onboarding-outcome></strong></p>
        <h1 id="onboarding-question-1" tabindex="-1">${L("给项目取个名字吧。")}</h1>
        <label class="onboarding-answer onboarding-answer--single"><span>${L("项目叫")}</span><input name="project_name" type="text" maxlength="160" autocomplete="off" aria-describedby="onboarding-error-1" placeholder="${L("例如：GoalBoard 首次体验")}" required></label>
        <p class="onboarding-field-error" id="onboarding-error-1" data-step-error="1" role="alert" hidden></p>
      </section>
      <section class="onboarding-step" data-onboarding-step="2" aria-labelledby="onboarding-question-2" hidden>
        <p class="onboarding-echo"><span>${L("项目叫")}</span><strong data-onboarding-project></strong></p>
        <h1 id="onboarding-question-2" tabindex="-1">${L("接下来，你想在哪里继续？")}</h1>
        <label class="onboarding-workspace"><span>${L("工作目录")}</span><input name="workspace_path" type="text" autocomplete="off" placeholder="/absolute/path/to/project" aria-describedby="onboarding-runtime-hint onboarding-error-2"></label>
        <fieldset class="onboarding-runtime"><legend>${L("想用哪个工具继续？")}</legend>${runtimeChoices}</fieldset>
        <p class="onboarding-hint" id="onboarding-runtime-hint">${runtimeHint}</p>
        <p class="onboarding-field-error" id="onboarding-error-2" data-step-error="2" role="alert" hidden></p>
      </section>
      <section class="onboarding-step onboarding-step--review" data-onboarding-step="3" aria-labelledby="onboarding-question-3" hidden>
        <h1 id="onboarding-question-3" tabindex="-1">${L("这样开始，可以吗？")}</h1>
        <p class="onboarding-intro">${L("我们会先保存项目和第一条目标，不会自动执行。")}</p>
        <dl class="onboarding-review">
          <div><dt>${L("项目名称")}</dt><dd data-review-project></dd></div>
          <div><dt>${L("想看到的结果")}</dt><dd data-review-outcome></dd></div>
          <div><dt>${L("工作目录")}</dt><dd data-review-workspace></dd></div>
          <div><dt>${L("接下来")}</dt><dd data-review-runtime></dd></div>
        </dl>
        <label class="onboarding-confirm"><input type="checkbox" name="user_confirmed"><span>${L("我确认先保存这些内容。如果选择了 Runtime，只把内容填进终端，等我自己发送。")}</span></label>
        <p class="onboarding-field-error" id="onboarding-error-3" data-step-error="3" role="alert" hidden></p>
      </section>
      <section class="onboarding-step onboarding-step--runtime-embedded" data-onboarding-step="4" aria-labelledby="onboarding-question-4" hidden>
        <div class="onboarding-runtime-heading">
          <h1 id="onboarding-question-4" tabindex="-1">${L("我们先把项目安排清楚。")}</h1>
          <p class="onboarding-intro">${L("这个 Runtime 已经绑定刚创建的根目标。它会一次问一个问题，和你一起整理出合适的目标树。")}</p>
        </div>
        <div class="onboarding-runtime-viewport">
          <iframe data-onboarding-runtime-frame title="${L("项目初始化 Runtime")}" allow="clipboard-read; clipboard-write"></iframe>
        </div>
        <div class="onboarding-runtime-state">
          <p data-onboarding-runtime-status data-state="busy" role="status">${L("正在打开 Runtime…")}</p>
          <button type="button" data-onboarding-runtime-retry hidden>${icon("refresh")}<span>${L("重新打开")}</span></button>
        </div>
      </section>
      </div>
      <p class="onboarding-error" data-onboarding-error role="alert" hidden></p>
    </form>
  </main>
  <script>${clientI18nScript()}${CONTROL_CLIENT_SCRIPT}</script>
  <script>${ONBOARDING_CLIENT_SCRIPT}</script>
</body>
</html>`;
}

export function renderGoalBoardProjectIndex(
  projects: readonly WebProjectNavigation[],
  controlToken = "",
  desktopShell = false,
): string {
  const href = (path: string) => desktopShell ? withDesktopQuery(path) : path;
  const projectCards = projects
    .map(
      (project) => `<a class="project-card" role="listitem" href="${href(`/projects/${encodeURIComponent(project.project_id)}`)}" data-project-search-row="${escapeHtml(`${project.display_name} ${project.data_class}`.toLocaleLowerCase())}"><header><span class="project-card-icon">${icon("database")}</span><span class="project-card-kind">${project.data_class === "regenerable_demo" ? L("演示数据") : project.data_class === "migrated_user" ? L("已迁移") : L("本地项目")}</span></header><div><h2>${escapeHtml(project.display_name)}</h2><p>${L("Goals 与 Sessions")}</p></div><footer><span>${L("打开项目")}</span>${icon("arrow")}</footer></a>`,
    )
    .join("");
  return `<!doctype html>
<html lang="${htmlLang()}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${controlTokenMeta(controlToken)}
  <title>${L("选择项目 · GoalBoard")}</title>
  <script>${THEME_BOOTSTRAP_SCRIPT}</script>
  <link rel="stylesheet" href="/assets/goalboard-project-index.css">
</head>
<body class="project-index-page" data-desktop-shell="true"${desktopShell ? ' data-native-desktop="true"' : ""}>
  ${renderIconSprite()}
  <header class="topbar project-directory-topbar">
    <a class="brand" href="${href("/")}" aria-label="${L("GoalBoard 项目目录")}">${icon("brand")}<strong>GoalBoard</strong></a>
    <div class="top-spacer"${desktopShell ? " data-tauri-drag-region" : ""}></div>
    <a class="top-action" href="${href("/settings/appearance")}" aria-label="${L("打开系统设置")}">${icon("settings")}<span>${L("系统设置")}</span></a>
  </header>
  <main class="project-index">
    <section class="project-index-panel" aria-labelledby="project-index-title">
      <header class="project-index-heading"><div><h1 id="project-index-title">${L("选择一个项目")}</h1><p>${L("每个项目管理自己的 Goals 和 Sessions；工作目录在新建或关联 Session 时选择。")}</p></div><div class="project-index-actions">${projects.length ? `<label class="project-index-search">${icon("search")}<input type="search" data-project-search placeholder="${L("搜索项目")}" aria-label="${L("搜索项目")}"></label>` : ""}<a class="project-index-create" href="${href("/onboarding")}">${icon("plus")}${L("引导创建项目")}</a></div></header>
      ${projects.length
        ? `<div class="project-card-grid" role="list">${projectCards}</div><p class="project-index-search-empty" data-project-search-empty hidden>${L("没有匹配的项目，换一个关键词。")}</p>`
        : `<div class="project-index-empty"><h2>${L("从一个真实项目开始")}</h2><p>${L("通过逐步引导建立 Project 和第一条根 Goal；是否关联工作目录、是否打开 Runtime 都由你确认。")}</p><div class="project-index-start"><a href="${href("/onboarding")}">${L("开始建立第一个项目")}</a><a href="${href("/settings/projects")}">${L("直接进入项目设置")}</a></div></div>`}
      <section class="project-index-migration"><div><strong>${L("已有一份旧的 GoalBoard DB？")}</strong><small>${L("只有你明确选择并确认后，才会迁移它并保留已有历史。")}</small></div><button class="project-index-migrate" type="button" data-open-project-migration>${L("迁移已有 GoalBoard 数据")}</button></section>
      <p class="project-index-note">${L("选择项目只影响这次网页浏览；正在对话的 Runtime Session 保持原来的项目关系。")}</p>
    </section>
  </main>
  ${renderProjectMigrationDialog()}
  <script>${clientI18nScript()}${CONTROL_CLIENT_SCRIPT}${PROJECT_INDEX_CLIENT_SCRIPT}${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script>
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

function renderAppearanceSettings(nextPath: string): string {
  const densityPreview = (mode: "standard" | "compact") =>
    `<span class="density-preview density-preview--${mode}" aria-hidden="true"><i></i><span><i></i><i></i><i></i><i></i><i></i></span></span>`;
  const locale = currentLocale();
  const languageOption = (value: "zh" | "en", label: string, description: string) =>
    `<a class="preference-option" href="${localeSwitchHref(value, nextPath)}" hreflang="${value === "zh" ? "zh-CN" : "en"}" lang="${value === "zh" ? "zh-CN" : "en"}" aria-current="${locale === value}"><span class="language-preview" aria-hidden="true">${value === "zh" ? "中" : "EN"}</span><span><strong>${label}</strong><small>${description}</small></span>${icon("check", "preference-check")}</a>`;
  return `<section class="settings-document appearance-document" aria-labelledby="settings-title">
    <header class="settings-heading"><h1 id="settings-title">${L("界面与语言")}</h1><p>${L("集中设置当前设备上的语言、主题、终端外观和信息密度，不会改动项目、Goal 或 Runtime 数据。")}</p></header>
    <div class="appearance-settings">
      <section class="preference-section" aria-labelledby="language-settings-title">
        <div class="preference-copy"><h2 id="language-settings-title">${L("界面语言")}</h2><p>${L("只改变 GoalBoard 的界面文案，不翻译 Goal 名称和正文内容。")}</p></div>
        <div class="preference-options preference-options--language" role="group" aria-label="${L("界面语言")}">
          ${languageOption("zh", "中文", L("使用中文界面。"))}
          ${languageOption("en", "English", L("使用英文界面。"))}
        </div>
      </section>
      <section class="preference-section" aria-labelledby="density-settings-title">
        <div class="preference-copy"><h2 id="density-settings-title">${L("界面密度")}</h2><p>${L("决定桌面 Goal 工作台一次显示多少 Goal 和正文内容。")}</p></div>
        <div class="preference-options preference-options--density" role="group" aria-label="${L("界面密度")}">
          <button class="preference-option" type="button" data-density-option="standard" aria-pressed="true">${densityPreview("standard")}<span><strong>${L("标准")}</strong><small>${L("舒展的间距，适合专注阅读和一般工作量。")}</small></span>${icon("check", "preference-check")}</button>
          <button class="preference-option" type="button" data-density-option="compact" aria-pressed="false">${densityPreview("compact")}<span><strong>${L("紧凑")}</strong><small>${L("减少 Goal 行和正文留白，适合长 Goal Tree 与宽屏。")}</small></span>${icon("check", "preference-check")}</button>
        </div>
      </section>
      <section class="preference-section" aria-labelledby="theme-settings-title">
        <div class="preference-copy"><h2 id="theme-settings-title">${L("主题")}</h2><p>${L("选择固定主题，或让 GoalBoard 跟随当前系统外观。")}</p></div>
        <div class="preference-options preference-options--theme" role="group" aria-label="${L("主题")}">
          <button class="preference-option" type="button" data-theme-option="light" aria-pressed="false">${icon("sun")}<span><strong>${L("浅色")}</strong><small>${L("适合明亮环境。")}</small></span>${icon("check", "preference-check")}</button>
          <button class="preference-option" type="button" data-theme-option="dark" aria-pressed="false">${icon("moon")}<span><strong>${L("深色")}</strong><small>${L("适合低光环境。")}</small></span>${icon("check", "preference-check")}</button>
          <button class="preference-option" type="button" data-theme-option="system" aria-pressed="true">${icon("system")}<span><strong>${L("跟随系统")}</strong><small>${L("随设备主题自动切换。")}</small></span>${icon("check", "preference-check")}</button>
        </div>
      </section>
      <section class="preference-section" aria-labelledby="terminal-theme-settings-title">
        <div class="preference-copy"><h2 id="terminal-theme-settings-title">${L("终端外观")}</h2><p>${L("只改变终端画布的配色；Runtime 导航、Goal 信息和操作继续使用界面主题。")}</p></div>
        <div class="preference-options preference-options--theme" role="group" aria-label="${L("终端外观")}">
          <button class="preference-option" type="button" data-terminal-theme-option="auto" aria-pressed="true">${icon("system")}<span><strong>${L("跟随界面")}</strong><small>${L("终端随 GoalBoard 的浅色或深色主题切换。")}</small></span>${icon("check", "preference-check")}</button>
          <button class="preference-option" type="button" data-terminal-theme-option="light" aria-pressed="false">${icon("sun")}<span><strong>${L("浅色终端")}</strong><small>${L("始终使用浅色终端画布。")}</small></span>${icon("check", "preference-check")}</button>
          <button class="preference-option" type="button" data-terminal-theme-option="dark" aria-pressed="false">${icon("moon")}<span><strong>${L("深色终端")}</strong><small>${L("始终使用深色终端画布。")}</small></span>${icon("check", "preference-check")}</button>
        </div>
      </section>
    </div>
    <p class="preference-note">${L("语言、主题、终端外观和密度只保存在当前设备。紧凑模式仅影响 760px 以上的 Goal 导航和 Goal 正文；Runtime、决定中心、设置页和窄屏布局保持原来的密度。")}</p>
  </section>`;
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
    <header class="settings-heading"><h1 id="settings-title">${L("AI 与执行工具")}</h1><p>${L("不接入也能正常使用 Goal Tree、待决定和记录。只有想让 AI 工具直接读取或推进 Goal 时才需要连接；每次修改前都会先展示变化并由你确认。")}</p></header>
    <div class="settings-record-list">${rows || `<div class="settings-empty"><h2>${L("没有可探测的 Runtime")}</h2><p>${L("GoalBoard 本体仍可使用；稍后安装 Runtime 后再回来检查。")}</p></div>`}</div>
    <p class="settings-footnote">${L("当前自动适配 Codex、Claude Code、OpenCode、Pi Agent 和 Grok Build。每次确认只对应当前 Runtime 和当前预览；配置在预览后变化时会要求重新生成。Session 与运行位置请进入对应项目的 Sessions 管理。")}</p>
  </section>`;
}

function renderProjectSettings(view: GoalBoardSettingsView): string {
  const demo = view.projects.find((project) => project.data_class === "regenerable_demo");
  const rows = view.projects.map((project) => `<article class="settings-record project-record" data-project-row="${escapeHtml(project.project_id)}">
    <header>
      <div class="settings-record-title"><span class="record-icon">${icon("folder")}</span><div><h2>${escapeHtml(project.display_name)}</h2><p>${project.data_class === "regenerable_demo" ? L("演示数据 · 可随时重建，不属于用户项目") : project.source === "migrated" ? L("用户数据 · 由已有 GoalBoard 数据迁入") : L("用户数据 · 在 GoalBoard 中创建")}</p></div></div>
      <div class="settings-record-action">${project.data_class === "regenerable_demo" ? `<span class="settings-state settings-state--warning">${L("可重建 demo")}</span>` : `<span class="settings-state settings-state--success">${L("用户数据")}</span>`}<a class="settings-button" href="/projects/${encodeURIComponent(project.project_id)}/settings/guidance">${L("项目说明")}</a><a class="settings-button" href="/projects/${encodeURIComponent(project.project_id)}/settings/rules">${L("工作规则")}</a><a class="settings-button" href="/projects/${encodeURIComponent(project.project_id)}/settings/planning">${L("工作规划")}</a><a class="settings-button" href="/projects/${encodeURIComponent(project.project_id)}/">${L("打开 Goal Tree")}</a></div>
    </header>
    <div class="project-record-tools">
      <details><summary>${icon("settings")}<span>${L("改名")}</span>${icon("chevron-down")}</summary><form data-project-rename="${escapeHtml(project.project_id)}"><label>${L("项目名称")}<input name="display_name" value="${escapeHtml(project.display_name)}" required maxlength="160"></label><p class="settings-form-error" role="alert" hidden></p><button type="submit">${L("保存名称")}</button></form></details>
      <details><summary>${icon("database")}<span>${L("存储信息")}</span>${icon("chevron-down")}</summary><dl class="project-db-details"><div><dt>${L("项目 ID")}</dt><dd>${escapeHtml(project.project_id)}</dd></div><div><dt>${L("数据文件")}</dt><dd>${escapeHtml(project.database_path)}</dd></div></dl></details>
      ${project.data_class === "regenerable_demo" ? `<details><summary>${icon("refresh")}<span>${L("重建或删除 demo")}</span>${icon("chevron-down")}</summary><div class="connection-action-form connection-action-form--danger"><p class="settings-footnote">${L("重建会清除你在 demo 中做的改动；删除只移除这个可重建项目，不影响用户项目。")}</p><p class="settings-form-error" data-demo-error role="alert" hidden></p><div class="service-action-row"><button type="button" data-demo-action="reset">${L("重建 demo")}</button><button type="button" data-demo-action="remove">${L("删除 demo")}</button></div></div></details>` : ""}
    </div>
  </article>`).join("");
  return `<section class="settings-document" aria-labelledby="settings-title">
    <header class="settings-heading"><h1 id="settings-title">${L("项目设置")}</h1><p>${L("先选择要配置的项目，再进入它的工作规则或工作规划。每个项目单独保存自己的 Goal、记录和项目专用设置。")}</p></header>
    <section class="settings-action-section" aria-labelledby="create-project-title"><div><h2 id="create-project-title">${L("创建项目")}</h2><p>${L("创建一个空的 GoalBoard 项目，然后直接打开它的 Goal Tree。")}</p></div><form class="inline-settings-form" data-project-create><label>${L("项目名称")}<input name="display_name" required maxlength="160" placeholder="${L("例如：新产品发布")}"></label><label class="inline-confirm"><input type="checkbox" name="user_confirmed"><span>${L("确认创建这个项目")}</span></label><p class="settings-form-error" role="alert" hidden></p><button type="submit">${L("创建并打开")}</button></form></section>
    <section class="settings-action-section" aria-labelledby="demo-project-title"><div><h2 id="demo-project-title">${L("产品示例")}</h2><p>${demo ? L("示例项目已单独标记为可重建数据，可以放心重置或删除。") : L("创建一份明确标记为可重建的示例数据；普通卸载会清理它，但保留用户项目。")}</p></div>${demo ? `<a class="settings-button" href="/projects/${encodeURIComponent(demo.project_id)}/">${L("打开示例")}</a>` : `<button type="button" data-demo-action="create">${L("创建示例项目")}</button>`}<p class="settings-form-error" data-demo-error role="alert" hidden></p></section>
    <div class="settings-record-list project-settings-list">${rows || `<div class="settings-empty"><h2>${L("还没有项目")}</h2><p>${L("在上方创建第一个项目，或从下方导入一份已有 GoalBoard 数据。")}</p></div>`}</div>
    <section class="settings-import-row"><div><h2>${L("导入已有 GoalBoard 数据")}</h2><p>${L("选择并确认数据文件后，GoalBoard 会把它作为一个独立项目保存。")}</p></div><button type="button" data-open-project-migration>${L("选择数据文件并预览")}</button></section>
    <p class="settings-footnote">${L("普通用户项目不会被示例操作或普通卸载删除；永久清除用户数据需要单独确认精确数据目录和项目数量。")}</p>
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
      : service.state === "absent"
        ? [["install", L("启用常驻服务")]]
        : service.state === "needs_repair"
          ? [["install", L("修复常驻服务")]]
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

function renderTuiPane(
  selected: WebGoalView | undefined,
  view: GoalBoardWebView,
  cliAvailability: Record<string, boolean> = {},
): string {
  const selectedGoalId = selected?.goal.goal_id ?? "";
  const compoundParent = selected?.goal.decomposition_state === "closed_compound";
  const compoundParentComplete = compoundParent && selected?.goal.fulfillment_state === "satisfied";
  const children = selected ? sortGoals(partOfChildViews(selected.goal.goal_id, view)) : [];
  const childChoices = children.map((child) => {
    const childExplanation = explainWorkState(child.status);
    return `<a class="tui-child-choice" href="/goals/${encodeURIComponent(child.goal.goal_id)}">
      <span><strong>${escapeHtml(child.goal.title)}</strong><small>${escapeHtml(childExplanation.label)} · ${escapeHtml(childExplanation.nextAction)}</small></span>
      <b>${L("打开这个子 Goal")}${icon("chevron-right")}</b>
    </a>`;
  }).join("");
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
      <aside class="tui-pane" id="goal-tui-pane" data-tui-pane data-goal-id="${escapeHtml(selectedGoalId)}" data-tui-parent-read-only="${compoundParent}"${compoundParent ? ' data-tui-read-only="true"' : ""} aria-label="${L("终端面板")}">
        <div class="tui-owner" data-tui-owner>
          <div class="tui-owner-copy">
            <strong data-tui-owner-title>${escapeHtml(selected?.goal.title ?? L("还没有选择 Goal"))}</strong>
            <span class="tui-owner-binding"><i aria-hidden="true"></i><b>${L("绑定到 Goal")}</b></span>
          </div>
          <div class="tui-owner-actions">
            ${selected
              ? renderVisibleGoalStatus(selected, "data-tui-owner-status", "data-tui-owner-status-label")
              : `<span class="goal-status" data-tui-owner-status hidden><span data-tui-owner-status-label></span></span>`}
            <button class="tui-focus-return" type="button" data-tui-focus-return>${icon("target")}<span>${L("返回聚焦")}</span></button>
          </div>
        </div>
        <div class="tui-tabs">
          <span class="tui-mode-label">${L("终端")}</span>
          <div class="tui-tab-list" data-tui-tabs></div>
          <button class="tui-add" type="button" data-tui-add aria-expanded="false" aria-controls="tui-open-menu" aria-haspopup="true" aria-label="${L("添加终端")}"${compoundParent ? ` disabled title="${escapeHtml(L("请进入一个具体的子 Goal"))}"` : ""}>${icon("plus")}<span>${L("添加终端")}</span></button>
        </div>
        <div class="tui-stage">
          <section class="tui-parent-guard" data-tui-parent-guard${compoundParent ? "" : " hidden"}>
            <div class="tui-parent-guard-copy">
              ${icon("tree")}
              <div><strong>${L("这个上层 Goal 不直接使用终端")}</strong><p>${compoundParentComplete
                ? L("这项工作已经由子 Goal 完成，不需要再为上层 Goal 打开终端。要查看或继续具体工作，请进入对应的子 Goal。")
                : L("它会在子 Goal 全部完成后自动完成。请选择具体的子 Goal，再从那里打开终端。")}</p></div>
            </div>
            <div class="tui-child-choices" data-tui-child-choices>${childChoices || `<p>${L("还没有可推进的子 Goal，请先检查 Goal 的拆分。")}</p>`}</div>
          </section>
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
              <p><strong>${compoundParent ? L("这个上层 Goal 不直接使用终端") : L("还没有终端")}</strong></p>
              <p>${compoundParent ? L("请从上方进入一个具体的子 Goal。") : L("点右上角「添加终端」，在这个 Goal 上打开常用 Runtime 或自定义命令。")}</p>
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
      `;
}

type SettingsNavigationActive = WebSettingsSection | "planning";
type ProjectSettingsNavigationActive = "guidance" | "rules" | "planning";

function settingsContextHref(
  path: string,
  project: WebProjectNavigation | null,
  desktopShell: boolean,
): string {
  const separator = path.includes("?") ? "&" : "?";
  const contextualPath = project
    ? `${path}${separator}project=${encodeURIComponent(project.project_id)}`
    : path;
  return desktopShell ? withDesktopQuery(contextualPath) : contextualPath;
}

function renderProjectSwitcher(
  currentProject: WebProjectNavigation | null,
  projects: readonly WebProjectNavigation[],
  desktopShell: boolean,
  className = "navigator-project-menu",
  manageHref = "/",
): string {
  const href = (path: string) => desktopShell ? withDesktopQuery(path) : path;
  const options = projects.length ? projects : currentProject ? [currentProject] : [];
  const currentName = currentProject?.display_name ?? L("选择项目");
  return `<details class="${className} navigator-project-menu" data-project-menu><summary class="navigator-project-selector" aria-label="${L("切换项目")}">${icon("database")}<strong title="${escapeHtml(currentName)}">${escapeHtml(currentName)}</strong>${icon("chevron-down")}</summary><div class="navigator-project-menu-popover"><span>${L("切换项目")}</span><nav>${options.map((project) => `<a class="navigator-project-option${project.project_id === currentProject?.project_id ? " is-current" : ""}" href="${href(`/projects/${encodeURIComponent(project.project_id)}/`)}"${project.project_id === currentProject?.project_id ? ' aria-current="page"' : ""}><span>${icon("database")}<strong>${escapeHtml(project.display_name)}</strong></span>${project.project_id === currentProject?.project_id ? icon("check") : ""}</a>`).join("")}</nav><a class="navigator-project-manage" href="${desktopShell ? withDesktopQuery(manageHref) : manageHref}">${icon("settings")}<span>${L("管理项目")}</span></a></div></details>`;
}

function renderDesktopProjectChrome(
  currentProject: WebProjectNavigation | null,
  projects: readonly WebProjectNavigation[],
  desktopShell: boolean,
  settingsHref: string | null,
  options: {
    switcherClass?: string;
    manageHref?: string;
    settingsCurrent?: boolean;
    directoryToggle?: boolean;
  } = {},
): string {
  const dragAttribute = desktopShell ? " data-tauri-drag-region" : "";
  const directoryToggle = options.directoryToggle
    ? `<button class="navigator-directory-toggle" type="button" data-directory-toggle aria-expanded="true" aria-label="${L("收起目录")}" title="${L("收起目录")}">${icon("panel")}</button>`
    : "";
  const settings = settingsHref
    ? `<a class="navigator-project-settings" href="${settingsHref}"${options.settingsCurrent ? ' aria-current="page"' : ""} aria-label="${options.settingsCurrent ? L("当前项目设置") : L("打开当前项目设置")}" title="${L("项目设置")}">${icon("settings")}</a>`
    : "";
  return `<div class="navigator-native-row">${directoryToggle}<div class="desktop-titlebar-drag desktop-titlebar-drag--left"${dragAttribute} aria-hidden="true"></div></div><div class="navigator-project-primary">${renderProjectSwitcher(currentProject, projects, desktopShell, options.switcherClass, options.manageHref)}<button class="navigator-project-notifications" type="button" disabled aria-label="${L("通知，暂不可用")}" title="${L("通知功能即将开放")}">${icon("bell")}</button>${settings}</div>`;
}

function renderSettingsNavigation(
  active: SettingsNavigationActive,
  project: WebProjectNavigation | null,
  desktopShell = false,
  projects: readonly WebProjectNavigation[] = [],
): string {
  const globalHref = (path: string) => settingsContextHref(path, project, desktopShell);
  const planningHref = settingsContextHref("/settings/planning", null, desktopShell);
  const current = (section: SettingsNavigationActive) => active === section ? ' aria-current="page"' : "";
  const projectHome = project ? `/projects/${encodeURIComponent(project.project_id)}/` : "/";
  const projectSettings = project ? `/projects/${encodeURIComponent(project.project_id)}/settings/guidance` : "/settings/projects";
  const desktopProjectContext = `<div class="settings-desktop-project">${renderDesktopProjectChrome(project, projects, desktopShell, desktopShell ? withDesktopQuery(projectSettings) : projectSettings, { switcherClass: "settings-project-switcher" })}</div><header class="settings-desktop-heading"><a href="${desktopShell ? withDesktopQuery(projectHome) : projectHome}" aria-label="${L("返回项目")}">${icon("arrow")}</a><span><strong>${L("全局设置")}</strong><small>${L("只影响当前设备")}</small></span></header>`;
  const desktopFooter = `<footer class="personal-sidebar-footer"><a class="personal-account" href="${globalHref("/settings/appearance")}" aria-current="page" aria-label="${L("全局设置")}"><span class="personal-account-avatar" aria-hidden="true">${icon("user")}</span><span class="personal-account-copy"><strong>${L("一骏")}</strong><small>${L("本地空间")}</small></span><span class="personal-account-settings" aria-hidden="true">${icon("settings")}</span></a></footer>`;
  return `<nav class="settings-navigation" aria-label="${L("系统设置")}">
    ${desktopProjectContext}<div class="settings-nav-body"><section class="settings-nav-group" aria-labelledby="settings-global-group"><div class="settings-nav-label" id="settings-global-group"><span>${L("全局设置")}</span><small>${L("只影响当前设备")}</small></div>
      <a href="${globalHref("/settings/appearance")}"${current("appearance")}>${icon("system")}<span><strong>${L("界面与语言")}</strong><small>${L("语言、主题、终端与界面密度")}</small></span></a>
      <a href="${globalHref("/settings/runtimes")}"${current("runtimes")}>${icon("workflow")}<span><strong>${L("AI 与执行工具")}</strong><small>${L("连接 Runtime 与会话")}</small></span></a>
      <a href="${planningHref}"${current("planning")}>${icon("tree")}<span><strong>${L("规划方法")}</strong><small>${L("规划方法库")}</small></span></a>
      <a href="${globalHref("/settings/diagnostics")}"${current("diagnostics")}>${icon("activity")}<span><strong>${L("诊断")}</strong><small>${L("安装、服务与环境")}</small></span></a>
    </section></div>${desktopFooter}
  </nav>`;
}

function renderProjectSettingsNavigation(
  active: ProjectSettingsNavigationActive,
  project: WebProjectNavigation,
  desktopShell = false,
  projects: readonly WebProjectNavigation[] = [],
): string {
  const routePrefix = `/projects/${encodeURIComponent(project.project_id)}`;
  const href = (path: string) => desktopShell ? withDesktopQuery(path) : path;
  const current = (section: ProjectSettingsNavigationActive) => active === section ? ' aria-current="page"' : "";
  const desktopProjectContext = `<div class="settings-desktop-project">${renderDesktopProjectChrome(project, projects, desktopShell, href(`${routePrefix}/settings/guidance`), { switcherClass: "settings-project-switcher", settingsCurrent: true })}</div><header class="settings-desktop-heading"><a href="${href(`${routePrefix}/`)}" aria-label="${L("返回 Goal Tree")}">${icon("arrow")}</a><span><strong>${L("项目设置")}</strong><small>${escapeHtml(project.display_name)}</small></span></header>`;
  const globalSettingsHref = settingsContextHref("/settings/appearance", project, desktopShell);
  const desktopFooter = `<footer class="personal-sidebar-footer"><a class="personal-account" href="${globalSettingsHref}" aria-label="${L("打开全局设置")}"><span class="personal-account-avatar" aria-hidden="true">${icon("user")}</span><span class="personal-account-copy"><strong>${L("一骏")}</strong><small>${L("本地空间")}</small></span><span class="personal-account-settings" aria-hidden="true">${icon("settings")}</span></a></footer>`;
  return `<nav class="settings-navigation project-settings-navigation" aria-label="${L("项目设置")}">
    ${desktopProjectContext}<div class="settings-nav-body">
    <section class="settings-nav-group" aria-labelledby="settings-project-group"><div class="settings-nav-label" id="settings-project-group"><span>${L("项目设置")}</span><small>${escapeHtml(project.display_name)}</small></div>
      <a href="${href(`${routePrefix}/settings/guidance`)}"${current("guidance")}>${icon("book")}<span><strong>${L("项目说明")}</strong><small>${L("所有 Goal 共享的长期上下文")}</small></span></a>
      <a href="${href(`${routePrefix}/settings/rules`)}"${current("rules")}>${icon("shield")}<span><strong>${L("工作规则")}</strong><small>${L("执行和复核底线")}</small></span></a>
      <a href="${href(`${routePrefix}/settings/planning`)}"${current("planning")}>${icon("workflow")}<span><strong>${L("工作规划")}</strong><small>${L("选择和调整规划方法")}</small></span></a>
    </section></div>${desktopFooter}
  </nav>`;
}

export function renderGoalBoardProjectSettings(
  view: GoalBoardWebView,
  controlToken = "",
  desktopShell = false,
): string {
  const projectName = view.project?.display_name ?? L("当前项目");
  const settingsProject = view.project ?? null;
  const routePrefix = view.route_prefix;
  const projectReturnHref = desktopShell ? withDesktopQuery(routePrefix || "/") : routePrefix || "/";
  const projectBinding = view.policy_bindings
    .filter((binding) => binding.scope === "project_default" && binding.goal_id == null && binding.state === "active")
    .at(-1);
  const projectPolicy = mergePolicy(DEFAULT_GOAL_POLICY, projectBinding);
  return `<!doctype html>
<html lang="${htmlLang()}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${controlTokenMeta(controlToken)}<title>${L("工作规则")} · ${escapeHtml(projectName)} · GoalBoard</title><script>${THEME_BOOTSTRAP_SCRIPT}</script><link rel="stylesheet" href="/assets/goalboard-settings.css"></head>
<body class="settings-page project-rules-page" data-route-prefix="${escapeHtml(routePrefix)}" data-desktop-shell="true"${desktopShell ? ' data-native-desktop="true"' : ""}>
  ${renderIconSprite()}
  <header class="topbar"><a class="brand" href="${projectReturnHref}" aria-label="${L("返回 Goal Tree")}">${icon("brand")}<strong>GoalBoard</strong></a><div class="project-context"${desktopShell ? " data-tauri-drag-region" : ""}><strong${desktopShell ? " data-tauri-drag-region" : ""}>${escapeHtml(projectName)}</strong><small${desktopShell ? " data-tauri-drag-region" : ""}>${L("项目设置 · 工作规则")}</small></div><div class="top-spacer"${desktopShell ? " data-tauri-drag-region" : ""}></div><a class="top-action" href="${projectReturnHref}" aria-label="${L("关闭项目设置")}">${icon(desktopShell ? "x" : "tree")}<span>${L("Goal Tree")}</span></a></header>
  <main class="settings-shell">
    ${settingsProject ? renderProjectSettingsNavigation("rules", settingsProject, desktopShell, view.projects) : renderSettingsNavigation("projects", null, desktopShell, view.projects)}
    <div class="settings-content"><section class="settings-document" aria-labelledby="project-rules-title">
      <header class="settings-heading"><h1 id="project-rules-title">${L("项目工作规则")}</h1><p>${L("设置这个项目里所有 Goal 共同遵守的最低要求。单个 Goal 可以增加要求，但不能降低这里的规则。")}</p></header>
      <aside class="project-rules-receipt" data-project-rules-receipt role="status" tabindex="-1" hidden><strong data-project-rules-receipt-title></strong><span data-project-rules-receipt-detail></span></aside>
      <section class="project-rules-intro" aria-labelledby="project-rules-how-title"><h2 id="project-rules-how-title">${L("这些规则什么时候生效")}</h2><p>${L("它们只约束之后开始或重新领取的工作，不会改写 Goal 内容，也不会自动启动任何执行工具。")}</p><ol><li><span>1</span><span><strong>${L("项目先定共同底线")}</strong><small>${L("例如必须自检，或完成前需要你确认")}</small></span></li><li><span>2</span><span><strong>${L("Goal 可以增加要求")}</strong><small>${L("涉及特殊风险时，可再要求额外检查")}</small></span></li><li><span>3</span><span><strong>${L("合并后执行")}</strong><small>${L("最终按两边更严格的要求工作")}</small></span></li></ol></section>
      ${renderPolicyForm(null, "project_default", projectPolicy, projectBinding, view.project?.project_id ?? "current-project", true)}
      <p class="settings-footnote">${L("每次保存都会替换当前项目默认规则，但旧版本和修改原因会继续保留在事件记录中。")}</p>
    </section></div>
  </main>
  <div class="toast" data-settings-toast role="status" aria-live="polite"></div>
  <script>${clientI18nScript()}${CONTROL_CLIENT_SCRIPT}${PROJECT_RULES_CLIENT_SCRIPT}${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script>
</body></html>`;
}

export function renderGoalBoardProjectGuidanceSettings(
  view: GoalBoardWebView,
  guidance: ProjectGuidanceView,
  controlToken = "",
  desktopShell = false,
): string {
  const project = view.project;
  const projectName = project?.display_name ?? L("当前项目");
  const routePrefix = view.route_prefix;
  const projectReturnHref = desktopShell ? withDesktopQuery(routePrefix || "/") : routePrefix || "/";
  const kindMeta: Record<string, { label: string; description: string }> = {
    context: { label: L("项目背景"), description: L("项目是什么，以及长期成立的事实") },
    requirement: { label: L("共同要求"), description: L("所有 Goal 都要满足的产品或业务要求") },
    constraint: { label: L("硬约束"), description: L("任何推进都不能越过的边界") },
    convention: { label: L("协作约定"), description: L("命名、表达和协作方式") },
    workflow: { label: L("工作方式"), description: L("项目稳定采用的推进顺序") },
    quality_bar: { label: L("质量标准"), description: L("共同认可的完成质量") },
  };
  const orderedKinds = ["context", "requirement", "constraint", "convention", "workflow", "quality_bar"];
  const sections = orderedKinds.map((kind) => {
    const entries = guidance.entries.filter((entry) => entry.kind === kind);
    if (entries.length === 0) return "";
    const meta = kindMeta[kind]!;
    return `<section class="guidance-section" aria-labelledby="guidance-${kind}"><header class="guidance-section-heading"><h2 id="guidance-${kind}">${meta.label}</h2><p>${meta.description}</p></header><div class="guidance-entry-list">${entries.map((entry) => `<article class="guidance-entry" data-guidance-entry="${escapeHtml(entry.guidance_id)}"><p>${escapeHtml(entry.content)}</p><footer><span class="guidance-entry-meta">${L("第 {revision} 版 · 更新于 {time}", { revision: entry.revision, time: formatDate(entry.updated_at) })}</span><span class="guidance-entry-actions"><button class="guidance-text-action" type="button" data-guidance-edit="${escapeHtml(entry.guidance_id)}">${L("修改")}</button><button class="guidance-text-action guidance-text-action--danger" type="button" data-guidance-action="deactivate" data-guidance-id="${escapeHtml(entry.guidance_id)}">${L("停用")}</button></span></footer></article>`).join("")}</div></section>`;
  }).join("");
  const empty = guidance.entries.length === 0
    ? `<section class="guidance-empty">${icon("book")}<h2>${L("先写下这个项目长期不变的部分")}</h2><p>${L("例如项目要解决什么、哪些边界不能突破、所有 Goal 共同遵守什么质量标准。保存后，后续 Runtime 会先读到这些内容。")}</p><button class="guidance-primary-action" type="button" data-guidance-new>${icon("plus")}${L("新增第一条说明")}</button></section>`
    : "";
  const inactiveItems = guidance.inactive_entries.length > 0
    ? `<ul class="guidance-inactive-list">${guidance.inactive_entries.map((entry) => `<li><p>${escapeHtml(entry.content)}</p><button class="guidance-text-action" type="button" data-guidance-action="restore" data-guidance-id="${escapeHtml(entry.guidance_id)}">${L("恢复这条说明")}</button></li>`).join("")}</ul>`
    : `<p>${L("当前没有停用的说明。")}</p>`;
  const changeLabels: Record<string, string> = {
    created: L("新增"),
    edited: L("修改"),
    deactivated: L("停用"),
    restored: L("恢复"),
  };
  const historyRows = guidance.revisions.map((revision) => {
    const content = revision.content.length > 220 ? `${revision.content.slice(0, 220)}…` : revision.content;
    const stateLabel = revision.active ? L("生效版本") : L("停用版本");
    return `<article class="guidance-history-row"><div><strong>${escapeHtml(changeLabels[revision.change_kind] ?? revision.change_kind)}</strong><div class="guidance-history-state${revision.active ? "" : " guidance-history-state--inactive"}">${L("第 {revision} 版", { revision: revision.revision })} · ${stateLabel}</div></div><div><strong>${escapeHtml(kindMeta[revision.kind]?.label ?? revision.kind)}</strong><p>${escapeHtml(content)}</p><details class="guidance-history-entry"><summary>${L("查看完整版本与变更原因")}</summary><dl class="guidance-history-full"><div><dt>${L("完整原文")}</dt><dd>${escapeHtml(revision.content)}</dd></div><div><dt>${L("变更原因")}</dt><dd>${escapeHtml(revision.reason)}</dd></div><div><dt>${L("操作者")}</dt><dd>${escapeHtml(revision.changed_by)}</dd></div><div><dt>${L("确认记录")}</dt><dd>${escapeHtml(revision.confirmation_summary)}</dd></div></dl></details></div><time datetime="${escapeHtml(revision.created_at)}">${formatDate(revision.created_at)}</time></article>`;
  }).join("");
  const guidanceData = JSON.stringify(guidance).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="${htmlLang()}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${controlTokenMeta(controlToken)}<title>${L("项目说明")} · ${escapeHtml(projectName)} · GoalBoard</title><script>${THEME_BOOTSTRAP_SCRIPT}</script><link rel="stylesheet" href="/assets/goalboard-settings.css"></head>
<body class="settings-page project-guidance-page" data-route-prefix="${escapeHtml(routePrefix)}" data-desktop-shell="true"${desktopShell ? ' data-native-desktop="true"' : ""}><!-- THESIS: The project reads as one maintained document, not a settings grid or suggestion inbox. OWN-WORLD: GoalBoard graphite paper, mineral-blue focus, hairline dividers, and the existing project-settings rail. STORY: read canonical guidance, edit it in place, then verify the immutable history. FIRST VIEWPORT: navigation rail, document title and add action, active guidance leading the page, with Runtime behavior in a right rail only when width preserves readable prose. FORM: established Read/Operate extension, code-led, project-guidance-document-v1. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance. -->
  ${renderIconSprite()}
  <header class="topbar"><a class="brand" href="${projectReturnHref}" aria-label="${L("返回 Goal Tree")}">${icon("brand")}<strong>GoalBoard</strong></a><div class="project-context"${desktopShell ? " data-tauri-drag-region" : ""}><strong${desktopShell ? " data-tauri-drag-region" : ""}>${escapeHtml(projectName)}</strong><small${desktopShell ? " data-tauri-drag-region" : ""}>${L("项目设置 · 项目说明")}</small></div><div class="top-spacer"${desktopShell ? " data-tauri-drag-region" : ""}></div><a class="top-action" href="${projectReturnHref}" aria-label="${L("关闭项目设置")}">${icon(desktopShell ? "x" : "tree")}<span>${L("Goal Tree")}</span></a></header>
  <main class="settings-shell">
    ${project ? renderProjectSettingsNavigation("guidance", project, desktopShell, view.projects) : renderSettingsNavigation("projects", null, desktopShell, view.projects)}
    <div class="settings-content"><section class="guidance-document" aria-labelledby="guidance-title">
      <header class="guidance-page-header"><div><h1 id="guidance-title">${L("项目说明")}</h1><p>${L("这是一份所有 Goal 和未来会话共享的长期说明。这里只显示已经生效的内容；你可以直接维护它，并随时查看每次改动。")}</p></div><button class="guidance-primary-action" type="button" data-guidance-new>${icon("plus")}${L("新增说明")}</button></header>
      <p class="project-rules-receipt" data-guidance-receipt role="status" aria-live="polite" hidden></p>
      <section class="guidance-editor" data-guidance-editor hidden aria-labelledby="guidance-editor-title"><header><div><h2 id="guidance-editor-title" data-guidance-editor-title></h2><p data-guidance-editor-description></p></div><button class="guidance-text-action" type="button" data-guidance-editor-close>${L("取消")}</button></header><form data-guidance-form><input type="hidden" name="action"><input type="hidden" name="guidance_id"><div class="guidance-editor-fields" data-guidance-editor-fields><label>${L("分类")}<select name="kind"><option value="context">${L("项目背景")}</option><option value="requirement">${L("共同要求")}</option><option value="constraint">${L("硬约束")}</option><option value="convention">${L("协作约定")}</option><option value="workflow">${L("工作方式")}</option><option value="quality_bar">${L("质量标准")}</option></select></label><label>${L("说明原文")}<textarea name="content" maxlength="4000" rows="5" placeholder="${L("写成未来 Runtime 可以直接理解和遵守的完整说明")}"></textarea></label></div><p class="guidance-editor-preview" data-guidance-editor-preview hidden></p><label>${L("为什么要做这次变更")}<textarea name="reason" rows="3" required placeholder="${L("这条原因会进入版本记录，方便以后理解当时为什么修改")}"></textarea></label><p class="guidance-editor-error" data-guidance-editor-error role="alert" hidden></p><footer><button class="guidance-secondary-action" type="button" data-guidance-editor-close>${L("取消")}</button><button class="guidance-primary-action" type="submit">${L("保存说明")}</button></footer></form></section>
      <div class="guidance-layout"><div class="guidance-content">${empty}${sections}<details class="guidance-history"><summary>${L("版本记录")}<span>${L("共 {count} 次变更", { count: guidance.revisions.length })}</span></summary><div class="guidance-history-list">${historyRows || `<p class="guidance-empty">${L("还没有版本记录。")}</p>`}</div></details></div><aside class="guidance-aside" aria-label="${L("项目说明状态")}"><section><h2>${L("Runtime 如何使用")}</h2><p>${L("只发送当前生效版本，并放在当前 Goal 和外部内容之前。修改或停用会在下一次 Prompt 中生效。")}</p><dl><div><dt>${L("生效说明")}</dt><dd>${guidance.entries.length}</dd></div><div><dt>${L("已停用")}</dt><dd>${guidance.inactive_entries.length}</dd></div><div><dt>${L("历史版本")}</dt><dd>${guidance.revisions.length}</dd></div></dl></section><section><h2>${L("Runtime 发现新内容时")}</h2><p>${L("它会在当前对话展示精确原文并征求同意；你确认后直接写入这里，不会绑定 Goal，也不会占用 Goal 的决策队列。")}</p></section><section><h2>${L("已停用的说明")}</h2>${inactiveItems}</section></aside></div>
    </section></div>
  </main>
  <script id="project-guidance-data" type="application/json">${guidanceData}</script>
  <script>${clientI18nScript()}${CONTROL_CLIENT_SCRIPT}${PROJECT_GUIDANCE_CLIENT_SCRIPT}${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script>
</body></html>`;
}

const PLANNING_SETTINGS_STYLES = `
  .planning-back svg{transform:rotate(180deg)}
  .planning-page .settings-content{max-width:none}.planning-catalog,.planning-detail,.planning-edit,.work-planning{width:min(100%,1120px);margin:0 auto;padding:36px 38px 56px}
  .planning-page-header{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:26px}.planning-page-header>div{min-width:0}.planning-page-header h1{margin:0;color:var(--ink);font-size:28px;letter-spacing:-.028em}.planning-page-header p{max-width:68ch;margin:9px 0 0;color:var(--muted);font-size:13px;line-height:1.65}
  .planning-primary-action,.planning-secondary-action{min-height:36px;padding:0 13px;border:1px solid var(--line-strong);border-radius:8px;display:inline-flex;align-items:center;justify-content:center;gap:7px;color:var(--ink-soft);background:var(--paper);font-size:12px;font-weight:680;text-decoration:none;white-space:nowrap;cursor:pointer}.planning-primary-action{border-color:var(--action);color:var(--action-ink);background:var(--action)}.planning-primary-action:hover{background:color-mix(in srgb,var(--action) 90%,var(--action-ink))}.planning-secondary-action:hover{border-color:var(--blue);color:var(--blue-dark)}
  .planning-library-note{margin-bottom:22px;padding:14px 16px;border:1px solid color-mix(in srgb,var(--blue) 24%,var(--line));border-radius:12px;background:color-mix(in srgb,var(--blue-soft) 52%,var(--paper));display:flex;align-items:flex-start;gap:11px}.planning-library-note>svg{flex:0 0 auto;margin-top:1px;color:var(--blue-dark)}.planning-library-note strong{display:block;font-size:12px}.planning-library-note p{margin:3px 0 0;color:var(--ink-soft);font-size:12px;line-height:1.55}
  .planning-library-tools{margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;gap:14px}.planning-filters{min-width:0;display:flex;gap:5px;overflow-x:auto}.planning-filters button{min-height:32px;padding:0 11px;border:0;border-radius:8px;color:var(--muted);background:transparent;font-size:11px;font-weight:680;white-space:nowrap;cursor:pointer}.planning-filters button:hover,.planning-filters button[aria-pressed=true]{color:var(--blue-dark);background:var(--blue-soft)}
  .planning-card-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.planning-card{min-height:220px;padding:18px;border:1px solid var(--line);border-radius:14px;color:inherit;background:var(--paper);display:flex;flex-direction:column;gap:14px;text-decoration:none;transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease}.planning-card:hover{border-color:color-mix(in srgb,var(--blue) 54%,var(--line));box-shadow:0 10px 30px color-mix(in srgb,var(--ink) 9%,transparent);transform:translateY(-2px)}.planning-card:focus-visible{outline:2px solid var(--blue);outline-offset:3px}
  .planning-card-top,.planning-card-footer{display:flex;align-items:center;justify-content:space-between;gap:10px}.planning-card-kind{color:var(--blue-dark);font-size:10px;font-weight:750}.planning-card-scope{padding:2px 7px;border-radius:999px;color:var(--muted);background:var(--rail);font-size:9px;font-weight:700}.planning-card-scope--personal{color:var(--green);background:var(--green-soft)}.planning-card-scope--project{color:var(--blue-dark);background:var(--blue-soft)}.planning-card h2{margin:0;color:var(--ink);font-size:17px;letter-spacing:-.018em}.planning-card>div>p{margin:6px 0 0;color:var(--muted);font-size:12px;line-height:1.6}.planning-card-tags{display:flex;flex-wrap:wrap;gap:5px}.planning-card-tags span{padding:3px 7px;border-radius:6px;color:var(--ink-soft);background:var(--rail);font-size:9px;font-weight:650}.planning-card-footer{margin-top:auto;padding-top:13px;border-top:1px solid var(--line);color:var(--faint);font-size:10px}.planning-card-footer svg{color:var(--blue-dark)}.planning-filter-empty{grid-column:1/-1;padding:38px 20px;border:1px dashed var(--line-strong);border-radius:14px;color:var(--muted);text-align:center}
  .planning-back{margin-bottom:22px;display:inline-flex;align-items:center;gap:7px;color:var(--muted);font-size:11px;font-weight:650;text-decoration:none}.planning-back:hover{color:var(--blue-dark)}.planning-detail-header{padding-bottom:28px;border-bottom:1px solid var(--line-strong)}.planning-detail-header-main{display:flex;align-items:flex-start;justify-content:space-between;gap:28px}.planning-detail-header h1{max-width:720px;margin:8px 0 0;color:var(--ink);font-size:32px;letter-spacing:-.032em}.planning-detail-header p{max-width:70ch;margin:10px 0 0;color:var(--muted);font-size:14px;line-height:1.65}.planning-detail-meta,.planning-detail-tags{display:flex;flex-wrap:wrap;gap:7px}.planning-detail-meta span,.planning-detail-tags span{padding:3px 8px;border-radius:7px;color:var(--ink-soft);background:var(--rail);font-size:10px;font-weight:650}.planning-detail-tags{margin-top:16px}
  .planning-detail-section{padding:30px 0;border-bottom:1px solid var(--line)}.planning-detail-section>header{margin-bottom:18px}.planning-detail-section h2{margin:0;color:var(--ink);font-size:18px}.planning-detail-section header p{max-width:66ch;margin:5px 0 0;color:var(--muted);font-size:12px;line-height:1.55}.planning-path{margin:0;padding:0;list-style:none}.planning-path li{min-height:58px;padding:13px 0;display:grid;grid-template-columns:30px minmax(0,1fr);align-items:start;gap:12px;color:var(--ink-soft);font-size:13px;line-height:1.5}.planning-path li:not(:last-child){border-bottom:1px solid var(--line)}.planning-path li span{width:26px;height:26px;border-radius:50%;color:var(--blue-dark);background:var(--blue-soft);display:grid;place-items:center;font-size:10px;font-weight:750}
  .planning-question-list,.planning-dependency-list{display:grid;gap:8px}.planning-question,.planning-dependency{padding:14px 15px;border-radius:11px;background:var(--rail);display:grid;gap:4px}.planning-question strong,.planning-dependency strong{color:var(--ink);font-size:12px}.planning-question p,.planning-dependency p{margin:0;color:var(--muted);font-size:12px;line-height:1.55}.planning-finish-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.planning-finish-grid h3{margin:0 0 9px;color:var(--ink);font-size:12px}.planning-finish-grid ul{margin:0;padding-left:18px;color:var(--muted);font-size:11px;line-height:1.7}
  .planning-instructions{padding:30px 0;border-bottom:1px solid var(--line)}.planning-instructions>header{margin-bottom:16px}.planning-instructions h2{margin:0;color:var(--ink);font-size:18px}.planning-instructions header p{max-width:70ch;margin:5px 0 0;color:var(--muted);font-size:12px;line-height:1.55}.planning-instructions pre{margin:0;padding:22px 24px;border:1px solid var(--line);border-radius:14px;color:var(--ink-soft);background:var(--paper);font:12px/1.75 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}.planning-structured-summary{margin-top:24px;border:1px solid var(--line);border-radius:13px}.planning-structured-summary>summary{min-height:48px;padding:0 15px;display:flex;align-items:center;color:var(--ink-soft);font-size:12px;font-weight:700;cursor:pointer;list-style:none}.planning-structured-summary>summary::-webkit-details-marker{display:none}.planning-structured-summary-body{padding:0 18px 4px;border-top:1px solid var(--line)}.planning-method-body textarea{min-height:360px;font:12px/1.65 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}.planning-method-body>label>small{max-width:76ch}
  .planning-save-context{margin-bottom:24px;padding:13px 15px;border:1px solid color-mix(in srgb,var(--blue) 26%,var(--line));border-radius:11px;background:color-mix(in srgb,var(--blue-soft) 44%,var(--paper));display:flex;align-items:flex-start;gap:10px}.planning-save-context svg{color:var(--blue-dark)}.planning-save-context strong{display:block;font-size:12px}.planning-save-context p{margin:3px 0 0;color:var(--muted);font-size:11px;line-height:1.5}
  .planning-edit-form{display:grid}.planning-edit-section{padding:28px 0;border-bottom:1px solid var(--line)}.planning-edit-section>header{margin-bottom:18px}.planning-edit-section h2{margin:0;color:var(--ink);font-size:17px}.planning-edit-section header p{max-width:66ch;margin:5px 0 0;color:var(--muted);font-size:12px;line-height:1.55}.planning-edit-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.planning-edit-form label{min-width:0;display:grid;gap:6px;color:var(--ink-soft);font-size:11px;font-weight:680}.planning-edit-form label>small{color:var(--muted);font-size:10px;font-weight:400;line-height:1.45}.planning-edit-form input,.planning-edit-form select,.planning-edit-form textarea{width:100%;border:1px solid var(--line-strong);border-radius:8px;color:var(--ink);background:var(--paper);font:inherit}.planning-edit-form input,.planning-edit-form select{min-height:38px;padding:0 10px}.planning-edit-form textarea{min-height:68px;padding:9px 10px;resize:vertical;line-height:1.5}.planning-edit-form input:focus,.planning-edit-form select:focus,.planning-edit-form textarea:focus{border-color:var(--blue);outline:2px solid color-mix(in srgb,var(--blue),transparent 80%);outline-offset:1px}
  .planning-row-list{display:grid;gap:9px}.planning-edit-row{padding:12px;border-radius:11px;background:var(--rail);display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px}.planning-edit-row--structured{grid-template-columns:minmax(150px,.42fr) minmax(0,1fr) auto}.planning-remove-row{width:32px;height:32px;border:0;border-radius:7px;color:var(--muted);background:transparent;cursor:pointer}.planning-remove-row:hover{color:var(--red);background:var(--red-soft)}.planning-add-row{margin-top:10px;min-height:34px;padding:0 11px;border:1px dashed var(--line-strong);border-radius:8px;color:var(--blue-dark);background:transparent;font-size:11px;font-weight:680;cursor:pointer}.planning-add-row:hover{border-style:solid;background:var(--blue-soft)}
  .planning-advanced{margin-top:24px;border:1px solid var(--line);border-radius:11px}.planning-advanced>summary{min-height:46px;padding:0 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--ink-soft);font-size:11px;font-weight:680;cursor:pointer;list-style:none}.planning-advanced>summary::-webkit-details-marker{display:none}.planning-advanced>summary svg{color:var(--faint);transition:transform .16s ease}.planning-advanced[open]>summary svg{transform:rotate(180deg)}.planning-advanced-body{padding:16px;border-top:1px solid var(--line);display:grid;gap:14px}.planning-enabled{margin-top:16px;display:flex!important;align-items:center;gap:8px!important}.planning-enabled input{width:16px;min-height:16px;accent-color:var(--blue)}.planning-form-error{margin:18px 0 0;padding:10px 12px;border-radius:8px;color:var(--red);background:var(--red-soft);font-size:11px}.planning-edit-footer{padding-top:22px;display:flex;align-items:center;justify-content:flex-end;gap:10px}.planning-edit-footer button{min-height:38px;padding:0 15px;border:1px solid var(--action);border-radius:8px;color:var(--action-ink);background:var(--action);font-weight:700;cursor:pointer}.planning-edit-footer button:hover{background:color-mix(in srgb,var(--action) 90%,var(--action-ink))}
  .work-planning-section-header{margin:0 0 16px}.work-planning-section-header h2{margin:0;color:var(--ink);font-size:17px}.work-planning-section-header p{max-width:72ch;margin:5px 0 0;color:var(--muted);font-size:11px;line-height:1.55}.work-planning-empty{padding:28px;border:1px dashed var(--line-strong);border-radius:14px;text-align:center}.work-planning-empty h3{margin:0;color:var(--ink);font-size:14px}.work-planning-empty p{max-width:64ch;margin:7px auto 0;color:var(--muted);font-size:11px;line-height:1.6}
  .planning-composition-section{margin-bottom:36px;padding-bottom:34px;border-bottom:1px solid var(--line)}.planning-composition-overview{padding:16px 18px;border:1px solid color-mix(in srgb,var(--blue) 24%,var(--line));border-radius:14px;background:color-mix(in srgb,var(--blue-soft) 34%,var(--paper));display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:18px}.planning-composition-overview strong{display:block;color:var(--ink);font-size:13px}.planning-composition-overview p{margin:5px 0 0;color:var(--muted);font-size:11px;line-height:1.55}.planning-composition-facts{display:flex;align-items:center;gap:14px;color:var(--ink-soft);font-size:10px;white-space:nowrap}.planning-composition-facts span+span{padding-left:14px;border-left:1px solid var(--line-strong)}.planning-composition-list{margin-top:12px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.planning-composition-row{min-height:70px;padding:11px 4px;display:grid;grid-template-columns:86px minmax(0,1fr) auto;align-items:center;gap:14px;color:inherit;text-decoration:none}.planning-composition-row+.planning-composition-row{border-top:1px solid var(--line)}.planning-composition-row:hover{background:color-mix(in srgb,var(--blue-soft) 32%,transparent)}.planning-composition-row-copy{min-width:0;display:grid;gap:3px}.planning-composition-row-copy strong{color:var(--ink);font-size:13px}.planning-composition-row-copy small{overflow:hidden;color:var(--muted);font-size:10px;text-overflow:ellipsis;white-space:nowrap}.planning-composition-row-meta{display:flex;align-items:center;gap:10px;color:var(--faint);font-size:9px;white-space:nowrap}.planning-composition-row-meta svg{color:var(--blue-dark)}.planning-inactive-section{margin-top:34px;padding-top:30px;border-top:1px solid var(--line)}
  .planning-adoption-section{margin-bottom:36px;padding-bottom:34px;border-bottom:1px solid var(--line)}.planning-adoption-tools{margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:14px}.planning-adoption-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.planning-adoption-card{min-height:168px;padding:15px;border:1px solid var(--line);border-radius:12px;background:var(--paper);display:flex;flex-direction:column;gap:10px}.planning-adoption-card header{display:flex;align-items:center;justify-content:space-between;gap:8px}.planning-adoption-card h3{margin:0;font-size:14px;letter-spacing:-.012em}.planning-adoption-card h3 a{color:var(--ink);text-decoration:none}.planning-adoption-card h3 a:hover{color:var(--blue-dark)}.planning-adoption-card>p{margin:0;color:var(--muted);font-size:11px;line-height:1.55}.planning-adoption-card footer{margin-top:auto;padding-top:10px;border-top:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:8px}.planning-adoption-card footer span{color:var(--faint);font-size:9px}.planning-adoption-card button{min-height:30px;padding:0 10px;border:1px solid var(--line-strong);border-radius:7px;color:var(--blue-dark);background:var(--paper);font-size:10px;font-weight:700;cursor:pointer}.planning-adoption-card button:hover{border-color:var(--blue);background:var(--blue-soft)}.planning-adoption-card button:disabled{cursor:wait;opacity:.62}.planning-adoption-error{margin:12px 0 0;padding:10px 12px;border-radius:8px;color:var(--red);background:var(--red-soft);font-size:11px}
  @media(max-width:1040px){.planning-card-grid,.planning-adoption-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.planning-finish-grid{grid-template-columns:1fr}.planning-composition-overview{grid-template-columns:1fr}.planning-composition-facts{white-space:normal}}@media(max-width:720px){.planning-catalog,.planning-detail,.planning-edit,.work-planning{padding:24px 18px 42px}.planning-page-header,.planning-detail-header-main{align-items:stretch;flex-direction:column}.planning-card-grid,.planning-adoption-grid,.planning-edit-grid{grid-template-columns:1fr}.planning-composition-row{grid-template-columns:76px minmax(0,1fr)}.planning-composition-row-meta{grid-column:2}.planning-edit-row--structured{grid-template-columns:1fr auto}.planning-edit-row--structured label:last-of-type{grid-column:1/-1;grid-row:2}.planning-detail-header h1{font-size:27px}}@media(max-width:480px){.planning-card-grid{grid-template-columns:1fr}.planning-library-tools,.planning-adoption-tools{align-items:stretch;flex-direction:column}.planning-composition-facts{align-items:flex-start;flex-direction:column;gap:6px}.planning-composition-facts span+span{padding-left:0;border-left:0}}
`;

const PLANNING_DEPENDENCY_HINTS: Record<string, string> = {
  "analysis depends_on validated data":"先确认数据可用，再开始分析","commitment depends_on decision":"先完成关键决定，再开始不可逆投入","consumer depends_on provider":"先完成可交付结果，再开始使用它的工作","consumer depends_on provider contract":"先确认提供方契约，再实现使用方","cutover depends_on validation and rollback":"先验证并准备回退，再执行切换","decision depends_on evidence":"先形成可信证据，再做决定","fix depends_on root-cause evidence":"先确认根因证据，再实施修复","full build depends_on validated slice":"先验证最小切片，再扩展完整实现","implementation depends_on validated direction":"先验证方向，再进入实现","production depends_on playable loop":"先验证可玩循环，再扩展生产内容","publication depends_on review":"先完成审核，再发布","recommendation depends_on market evidence":"先取得市场证据，再给出建议","runtime capability depends_on data and evaluation":"先准备数据与评测，再扩展 Runtime 能力","verification depends_on deliverable":"先产生可验收结果，再开始验证",
  "task decomposition depends_on validated method pack":"先验证领域方法，再拆实际任务",
  "capability depends_on consumed foundation":"先完成会被核心能力真实消费的基础，再实现该能力",
  "delivery depends_on validated capability":"先验证核心能力，再进入交付与发布",
  "regression depends_on fix and failure baseline":"先保留失败基线并完成修复，再做回归",
  "evidence plan depends_on decision question":"先明确要支持的决定，再规划证据",
  "validation slice depends_on intent and constraints":"先明确目标与约束，再制作验证切片",
  "legacy cleanup depends_on proven cutover":"先确认切换稳定，再清理旧路径",
  "workflow depends_on roles and permissions":"先明确角色与权限，再运行工作流",
  "improvement depends_on operational evidence":"先取得真实运行证据，再调整流程",
  "claim depends_on audience and product evidence":"先确认受众问题与产品事实，再形成主张",
  "publication depends_on reviewed content":"先完成事实与渠道审核，再发布",
  "technical design depends_on confirmed product plan":"先确认产品计划，再设计技术方案",
  "technical foundation depends_on technical design":"先明确技术方案，再建设被需要的基础能力",
  "product feature depends_on consumed technical design and foundation":"先完成该功能真实消费的技术方案与基础，再实现功能",
  "verification and release depend_on working feature":"先形成可运行功能，再验收与发布",
  "decision delivery depends_on validated analysis":"先完成并验证分析，再交付结论",
  "comparison depends_on market boundary":"先明确市场边界，再比较替代方案",
  "high-fidelity slice depends_on core flow and states":"先明确核心动线与状态，再制作高保真切片",
  "rollout depends_on safety and recovery evidence":"先验证安全与恢复，再真实上线",
  "systems depend_on core loop intent":"先明确玩家动机与核心循环，再设计系统",
  "draft depends_on sources and method":"先确认来源与方法，再形成内容或结论",
  "implementation depends_on product flow":"先确认产品目标与主路径，再实现功能",
  "validation and release depend_on working feature":"先形成可运行功能，再验证与发布",
  "use part_of for hierarchy; keep independent goals parallel":"父子层级使用归属关系；没有产出消费的 Goal 保持并行",
};
function friendlyPlanningDependencyHint(value:string):string{return PLANNING_DEPENDENCY_HINTS[value]??value.replace(" depends_on "," 依赖 ")}
function friendlyPlanningDependencyStatement(value:string):string{return value.replaceAll("depends_on",L("依赖关系"))}
function planningMethodKindLabel(kind:PlanningMethodPack["kind"]):string{return kind==="work_type"?L("工作类型"):kind==="domain"?L("专业领域"):kind==="industry"?L("行业方法"):kind==="overlay"?L("场景叠加层"):kind==="meta"?L("元方法"):L("自定义")}
function planningMethodScopeLabel(scope:PlanningMethodPack["scope"]):string{return scope==="built_in"?L("系统模板"):scope==="personal"?L("我的方法"):L("项目专用")}
function planningSettingsHref(path:string,project:WebProjectNavigation|null,desktop:boolean):string{return settingsContextHref(path,project,desktop)}
function renderPlanningMethodCards(methods:readonly PlanningMethodPack[],basePath:string,project:WebProjectNavigation|null,desktop:boolean):string{
  return methods.map((method)=>{const path=`${basePath}/${encodeURIComponent(method.method_id)}`;const href=path.startsWith("/settings/")?planningSettingsHref(path,project,desktop):desktop?withDesktopQuery(path):path;return `<a class="planning-card" href="${href}" data-planning-method data-kind="${escapeHtml(method.kind)}" data-scope="${escapeHtml(method.scope)}"><div class="planning-card-top"><span class="planning-card-kind">${escapeHtml(planningMethodKindLabel(method.kind))}</span><span class="planning-card-scope planning-card-scope--${escapeHtml(method.scope)}">${escapeHtml(planningMethodScopeLabel(method.scope))}</span></div><div><h2>${escapeHtml(method.name)}</h2><p>${escapeHtml(method.summary)}</p></div>${method.applies_to.length?`<div class="planning-card-tags">${method.applies_to.slice(0,3).map((item)=>`<span>${escapeHtml(item)}</span>`).join("")}</div>`:""}<div class="planning-card-footer"><span>${L("{steps} 个规划阶段 · {checks} 个必答问题",{steps:method.steps.length,checks:method.required_coverage.length})}</span>${icon("arrow")}</div></a>`}).join("")
}
function renderPlanningCompositionRows(methods:readonly PlanningMethodPack[],basePath:string,desktop:boolean):string{
  return methods.map((method)=>{const path=`${basePath}/${encodeURIComponent(method.method_id)}`;const href=desktop?withDesktopQuery(path):path;return `<a class="planning-composition-row" href="${href}"><span class="planning-card-kind">${escapeHtml(planningMethodKindLabel(method.kind))}</span><span class="planning-composition-row-copy"><strong>${escapeHtml(method.name)}</strong><small>${escapeHtml(method.summary)}</small></span><span class="planning-composition-row-meta">${L("{steps} 个阶段 · {checks} 个问题",{steps:method.steps.length,checks:method.required_coverage.length})}${icon("arrow")}</span></a>`}).join("")
}
function renderPlanningAdoptionCards(methods:readonly PlanningMethodPack[],project:WebProjectNavigation,desktop:boolean):string{
  const endpoint=`/projects/${encodeURIComponent(project.project_id)}/api/settings/planning-methods/apply`;
  return methods.map((method)=>{const detailHref=planningSettingsHref(`/settings/planning/${encodeURIComponent(method.method_id)}`,project,desktop);return `<article class="planning-adoption-card" data-planning-method data-kind="${escapeHtml(method.kind)}" data-scope="${escapeHtml(method.scope)}"><header><span class="planning-card-kind">${escapeHtml(planningMethodKindLabel(method.kind))}</span><span class="planning-card-scope planning-card-scope--${escapeHtml(method.scope)}">${escapeHtml(planningMethodScopeLabel(method.scope))}</span></header><div><h3><a href="${detailHref}">${escapeHtml(method.name)}</a></h3></div><p>${escapeHtml(method.summary)}</p><footer><span>${L("{steps} 个阶段 · {checks} 个问题",{steps:method.steps.length,checks:method.required_coverage.length})}</span><button type="button" data-adopt-planning-method="${escapeHtml(method.method_id)}" data-adopt-endpoint="${endpoint}">${L("加入组合")}</button></footer></article>`}).join("")
}
function planningTopbar(title:string,subtitle:string,returnHref:string,_pagePath:string,desktop:boolean):string{return `<header class="topbar"><a class="brand" href="${returnHref}">${icon("brand")}<strong>GoalBoard</strong></a><div class="project-context"${desktop?" data-tauri-drag-region":""}><strong${desktop?" data-tauri-drag-region":""}>${escapeHtml(title)}</strong><small${desktop?" data-tauri-drag-region":""}>${escapeHtml(subtitle)}</small></div><div class="top-spacer"${desktop?" data-tauri-drag-region":""}></div><a class="top-action" href="${returnHref}" aria-label="${L("关闭设置")}">${icon(desktop?"x":returnHref.includes("/projects/")?"tree":"folder")}<span>${returnHref.includes("/projects/")?L("Goal Tree"):L("项目列表")}</span></a></header>`}

const PLANNING_SETTINGS_CLIENT_SCRIPT = `
(()=>{document.querySelectorAll("[data-planning-filter]").forEach((button)=>button.addEventListener("click",()=>{const filter=button.dataset.planningFilter||"all";document.querySelectorAll("[data-planning-filter]").forEach((item)=>item.setAttribute("aria-pressed",String(item===button)));let visible=0;document.querySelectorAll("[data-planning-method]").forEach((item)=>{const matches=filter==="all"||item.dataset.kind===filter||(filter==="mine"&&item.dataset.scope!=="built_in");item.hidden=!matches;if(matches)visible+=1});const empty=document.querySelector("[data-planning-filter-empty]");if(empty)empty.hidden=visible!==0}));const form=document.querySelector("[data-planning-edit-form]");if(!form)return;const error=form.querySelector("[data-planning-method-error]");const cloneRow=(list)=>{const source=list.querySelector("[data-planning-row]");if(!source)return;const row=source.cloneNode(true);row.querySelectorAll("input, textarea").forEach((input)=>{input.value=""});list.append(row);row.querySelector("input, textarea")?.focus({preventScroll:true})};form.addEventListener("click",(event)=>{const add=event.target.closest("[data-add-planning-row]");if(add){const list=form.querySelector('[data-planning-row-list="'+add.dataset.addPlanningRow+'"]');if(list)cloneRow(list);return}const remove=event.target.closest("[data-remove-planning-row]");if(!remove)return;const row=remove.closest("[data-planning-row]");const list=row?.parentElement;if(!row||!list)return;if(list.querySelectorAll("[data-planning-row]").length===1){row.querySelectorAll("input, textarea").forEach((input)=>{input.value=""})}else row.remove()});form.addEventListener("submit",async(event)=>{event.preventDefault();error.hidden=true;error.textContent="";const submit=form.querySelector('button[type="submit"]');submit.disabled=true;const values=(name)=>[...form.querySelectorAll('[name="'+name+'"]')].map((input)=>input.value.trim()).filter(Boolean);const internalId=(prefix,value,index)=>{const readable=String(value||"").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,32);return prefix+"-"+(readable||String(index+1))+"-"+String(index+1)};try{const coverage=[...form.querySelectorAll("[data-coverage-row]")].map((row,index)=>{const label=row.querySelector('[name="coverage_label"]').value.trim();const question=row.querySelector('[name="coverage_question"]').value.trim();return label||question?{area:internalId("coverage",label,index),label,question}:null}).filter(Boolean);const dependencies=[...form.querySelectorAll("[data-dependency-row]")].map((row,index)=>{const statement=row.querySelector('[name="dependency_statement"]').value.trim();const direction=row.querySelector('[name="dependency_direction"]').value.trim();return statement||direction?{rule_id:internalId("dependency",statement,index),statement,direction_hint:direction}:null}).filter(Boolean);const method={method_id:form.elements.method_id.value,kind:form.elements.kind.value,name:form.elements.name.value.trim(),summary:form.elements.summary.value.trim(),instructions:form.elements.instructions.value.trim(),applies_to:String(form.elements.applies_to.value||"").split(",").map((item)=>item.trim()).filter(Boolean),domain_tags:String(form.elements.domain_tags.value||"").split(",").map((item)=>item.trim()).filter(Boolean),steps:values("steps"),required_coverage:coverage,dependency_rules:dependencies,evidence_requirements:values("evidence_requirements"),completion_checks:values("completion_checks"),failure_modes:values("failure_modes"),source_refs:String(form.elements.source_refs.value||"").split(/\\n/).map((item)=>item.trim()).filter(Boolean),confidence:Number(form.elements.confidence.value),enabled:form.elements.enabled.checked};const response=await fetch(form.dataset.apiEndpoint,{method:"POST",headers:globalThis.goalboardControlHeaders(),body:JSON.stringify({scope:form.dataset.saveScope,method})});const payload=await response.json();if(!response.ok)throw new Error(payload.error||L("保存失败"));location.assign(form.dataset.returnHref)}catch(reason){error.textContent=reason instanceof Error?reason.message:String(reason);error.hidden=false;submit.disabled=false}})})();
`;

const PLANNING_ADOPTION_CLIENT_SCRIPT = `
(()=>{
  const errorBox=document.querySelector("[data-planning-adoption-error]");
  document.querySelectorAll("[data-adopt-planning-method]").forEach((button)=>button.addEventListener("click",async()=>{
    const label=button.textContent;
    button.disabled=true;
    button.textContent=L("正在加入…");
    if(errorBox){errorBox.hidden=true;errorBox.textContent=""}
    try{
      const response=await fetch(button.dataset.adoptEndpoint,{method:"POST",headers:globalThis.goalboardControlHeaders(),body:JSON.stringify({method_id:button.dataset.adoptPlanningMethod})});
      const payload=await response.json();
      if(!response.ok)throw new Error(payload.error||L("加入失败"));
      location.reload();
    }catch(reason){
      if(errorBox){errorBox.textContent=reason instanceof Error?reason.message:String(reason);errorBox.hidden=false}
      button.disabled=false;
      button.textContent=label;
    }
  }));
})();
`;

export function renderGoalBoardPlanningLibrary(methods:readonly PlanningMethodPack[],contextProject:WebProjectNavigation|null=null,controlToken="",desktopShell=false,projects:readonly WebProjectNavigation[]=[]):string{
  const pagePath=planningSettingsHref("/settings/planning",contextProject,desktopShell);const returnHref=contextProject?(desktopShell?withDesktopQuery(`/projects/${encodeURIComponent(contextProject.project_id)}`):`/projects/${encodeURIComponent(contextProject.project_id)}`):(desktopShell?withDesktopQuery("/"):"/");const cards=renderPlanningMethodCards(methods,"/settings/planning",contextProject,desktopShell);const newHref=planningSettingsHref("/settings/planning/new",contextProject,desktopShell);const navigation=contextProject?renderProjectSettingsNavigation("planning",contextProject,desktopShell,projects):renderSettingsNavigation("planning",null,desktopShell,projects);
  return `<!doctype html><!-- THESIS: Planning methods are a browsable library, never a settings spreadsheet. OWN-WORLD: Quiet graphite surfaces, mineral-blue focus, information-rich method cards. STORY: scan the library, open one method, understand it, then decide whether to create a personal version. FIRST VIEWPORT: stable settings rail, concise library introduction, three-column method grid. FORM: established Operate settings extension. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md. --><html lang="${htmlLang()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${controlTokenMeta(controlToken)}<title>${L("规划方法")} · GoalBoard</title><script>${THEME_BOOTSTRAP_SCRIPT}</script><link rel="stylesheet" href="/assets/goalboard-settings.css"></head><body class="settings-page planning-page" data-desktop-shell="true"${desktopShell?' data-native-desktop="true"':""}>${renderIconSprite()}${planningTopbar(contextProject?contextProject.display_name:L("规划方法"),L("规划方法库"),returnHref,pagePath,desktopShell)}<main class="settings-shell">${navigation}<div class="settings-content"><section class="planning-catalog"><header class="planning-page-header"><div><h1>${L("规划方法")}</h1><p>${L("这里维护 Runtime 拆分 Goal、判断依赖和检查完成证据时使用的方法。方法本身不属于某个项目；项目如何使用它，请到项目的“工作规划”中设置。")}</p></div><a class="planning-primary-action" href="${newHref}">${icon("plus")}${L("新建我的方法")}</a></header><div class="planning-library-note">${icon("book")}<div><strong>${L("先选方法，再决定是否调整")}</strong><p>${L("点击卡片查看完整规划路径。系统模板不会被直接修改；需要调整时会创建你的个人版本。")}</p></div></div><div class="planning-library-tools"><nav class="planning-filters" aria-label="${L("筛选规划方法")}"><button type="button" data-planning-filter="all" aria-pressed="true">${L("全部")}</button><button type="button" data-planning-filter="work_type" aria-pressed="false">${L("工作类型")}</button><button type="button" data-planning-filter="domain" aria-pressed="false">${L("专业领域")}</button><button type="button" data-planning-filter="industry" aria-pressed="false">${L("行业方法")}</button><button type="button" data-planning-filter="overlay" aria-pressed="false">${L("场景叠加层")}</button><button type="button" data-planning-filter="mine" aria-pressed="false">${L("我的方法")}</button></nav></div><div class="planning-card-grid">${cards}<p class="planning-filter-empty" data-planning-filter-empty hidden>${L("这个分类里还没有方法。")}</p></div></section></div></main><script>${clientI18nScript()}${PLANNING_SETTINGS_CLIENT_SCRIPT}${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script></body></html>`}

function renderPlanningMethodDetailSections(method:PlanningMethodPack):string{return `<section class="planning-instructions"><header><h2>${L("Runtime 方法说明")}</h2><p>${L("这是 Runtime 在拆分或调整 Goal Tree 前完整阅读的方法正文。")}</p></header><pre>${escapeHtml(method.instructions)}</pre></section><details class="planning-structured-summary"><summary>${L("查看用于检索与检查的结构化摘要")}</summary><div class="planning-structured-summary-body"><section class="planning-detail-section"><header><h2>${L("规划路径")}</h2><p>${L("Runtime 会按这个思考顺序组织 Goal，但不会把它机械地当成串行任务清单。")}</p></header><ol class="planning-path">${method.steps.map((step,index)=>`<li><span>${index+1}</span><div>${escapeHtml(step)}</div></li>`).join("")}</ol></section><section class="planning-detail-section"><header><h2>${L("拆分时必须回答")}</h2><p>${L("这些问题必须在 Goal Tree 中得到明确答案、负责人或后续处理位置。")}</p></header><div class="planning-question-list">${method.required_coverage.map((rule)=>`<article class="planning-question"><strong>${escapeHtml(rule.label)}</strong><p>${escapeHtml(rule.question)}</p></article>`).join("")}</div></section><section class="planning-detail-section"><header><h2>${L("依赖判断")}</h2><p>${L("只有下游真的需要消费上游结果时才建立依赖；以下规则帮助 Runtime 判断先后顺序。")}</p></header><div class="planning-dependency-list">${method.dependency_rules.map((rule)=>`<article class="planning-dependency"><strong>${escapeHtml(friendlyPlanningDependencyStatement(rule.statement))}</strong><p>${escapeHtml(friendlyPlanningDependencyHint(rule.direction_hint))}</p></article>`).join("")}</div></section><section class="planning-detail-section"><header><h2>${L("完成与纠偏")}</h2><p>${L("Runtime 会用证据收口工作，并避开这些常见误拆。")}</p></header><div class="planning-finish-grid"><section><h3>${L("完成前要看到")}</h3><ul>${method.evidence_requirements.map((item)=>`<li>${escapeHtml(item)}</li>`).join("")||`<li>${L("没有额外证据要求")}</li>`}</ul></section><section><h3>${L("收口前检查")}</h3><ul>${method.completion_checks.map((item)=>`<li>${escapeHtml(item)}</li>`).join("")||`<li>${L("没有额外检查项")}</li>`}</ul></section><section><h3>${L("避免这样拆")}</h3><ul>${method.failure_modes.map((item)=>`<li>${escapeHtml(item)}</li>`).join("")||`<li>${L("没有额外提醒")}</li>`}</ul></section></div></section></div></details>`}
function renderPlanningSimpleRows(name:string,values:readonly string[],placeholder:string):string{const rows=values.length?values:[""];return `<div class="planning-row-list" data-planning-row-list="${name}">${rows.map((value)=>`<div class="planning-edit-row" data-planning-row><input name="${name}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"><button class="planning-remove-row" type="button" data-remove-planning-row aria-label="${L("删除这一项")}">${icon("trash")}</button></div>`).join("")}</div><button class="planning-add-row" type="button" data-add-planning-row="${name}">${icon("plus")}${L("添加一项")}</button>`}

function renderPlanningEditForm(method:PlanningMethodPack|null,saveScope:"personal"|"project",project:WebProjectNavigation|null,apiEndpoint:string,returnHref:string):string{
  const methodId=method?.method_id??`custom-method-${Date.now().toString(36)}`;const coverage=method?.required_coverage.length?method.required_coverage:[{area:"",label:"",question:""}];const dependencies=method?.dependency_rules.length?method.dependency_rules:[{rule_id:"",statement:"",direction_hint:""}];
  return `<div class="planning-save-context">${icon(saveScope==="project"?"folder":"user")}<div><strong>${saveScope==="project"?L("保存到项目「{name}」",{name:project?.display_name??L("当前项目")}):L("保存到我的方法库")}</strong><p>${saveScope==="project"?L("这个版本只影响当前项目；全局模板和其他项目不会改变。"):L("这里不设置项目。保存后，这套方法可以在各项目的工作规划中使用。")}</p></div></div><form class="planning-edit-form" data-planning-edit-form data-save-scope="${saveScope}" data-api-endpoint="${apiEndpoint}" data-return-href="${returnHref}"><input type="hidden" name="method_id" value="${escapeHtml(methodId)}">
  <section class="planning-edit-section"><header><h2>${L("方法说明")}</h2><p>${L("先说清这套方法适合什么工作，以及它会带来什么规划结果。")}</p></header><div class="planning-edit-grid"><label>${L("方法名称")}<input name="name" required value="${escapeHtml(method?.name??"")}" placeholder="${L("例如：SaaS 功能发布")}"></label><label>${L("适合哪些工作")}<input name="applies_to" value="${escapeHtml(method?.applies_to.join(", ")??"")}" placeholder="${L("例如：新功能、系统改造、版本发布；用逗号分隔")}"></label></div><label>${L("一句话说明这套方法")}<textarea name="summary" rows="2" required placeholder="${L("例如：从用户结果反推实现、验证与发布依赖。")}">${escapeHtml(method?.summary??"")}</textarea></label></section>
  <section class="planning-edit-section planning-method-body"><header><h2>${L("Runtime 方法正文")}</h2><p>${L("像维护一段 Skill 一样，直接告诉 Runtime 应该怎么思考、怎么拆、如何判断依赖、怎样检查完成，以及需求变化后如何调整。")}</p></header><label>${L("完整方法说明")}<textarea name="instructions" rows="18" required placeholder="${L("写清适用边界、规划顺序、依赖方向、完成检查、常见误拆和需求变化处理。")}">${escapeHtml(method?.instructions??"")}</textarea><small>${L("Runtime 会在创建或调整 Goal Tree 前完整阅读这里；普通执行阶段不会反复加载。")}</small></label></section>
  <section class="planning-edit-section"><header><h2>${L("规划路径")}</h2><p>${L("把 Runtime 应该依次想清楚的阶段列出来。它们是规划顺序，不是强制串行的任务。")}</p></header>${renderPlanningSimpleRows("steps",method?.steps??[],L("例如：确认用户结果和边界"))}</section>
  <section class="planning-edit-section"><header><h2>${L("拆分时必须回答")}</h2><p>${L("每一项由“检查主题”和一个清晰问题组成；系统会自动处理内部标识。")}</p></header><div class="planning-row-list" data-planning-row-list="coverage">${coverage.map((rule)=>`<div class="planning-edit-row planning-edit-row--structured" data-planning-row data-coverage-row><label>${L("检查主题")}<input name="coverage_label" value="${escapeHtml(rule.label)}" placeholder="${L("例如：最终结果")}"></label><label>${L("Runtime 必须回答的问题")}<textarea name="coverage_question" placeholder="${L("例如：最终交付什么、由谁使用？")}">${escapeHtml(rule.question)}</textarea></label><button class="planning-remove-row" type="button" data-remove-planning-row aria-label="${L("删除这一项")}">${icon("trash")}</button></div>`).join("")}</div><button class="planning-add-row" type="button" data-add-planning-row="coverage">${icon("plus")}${L("添加一个问题")}</button></section>
  <section class="planning-edit-section"><header><h2>${L("依赖判断")}</h2><p>${L("写清什么时候需要建立依赖，以及谁必须先完成。不要把时间上的先后误当成产出依赖。")}</p></header><div class="planning-row-list" data-planning-row-list="dependencies">${dependencies.map((rule)=>`<div class="planning-edit-row planning-edit-row--structured" data-planning-row data-dependency-row><label>${L("什么时候建立依赖")}<textarea name="dependency_statement" placeholder="${L("例如：下游需要消费上游的可验收结果")}">${escapeHtml(friendlyPlanningDependencyStatement(rule.statement))}</textarea></label><label>${L("谁必须先完成")}<textarea name="dependency_direction" placeholder="${L("例如：先完成提供结果的 Goal，再开始使用它的 Goal")}">${escapeHtml(friendlyPlanningDependencyHint(rule.direction_hint))}</textarea></label><button class="planning-remove-row" type="button" data-remove-planning-row aria-label="${L("删除这一项")}">${icon("trash")}</button></div>`).join("")}</div><button class="planning-add-row" type="button" data-add-planning-row="dependencies">${icon("plus")}${L("添加一条依赖判断")}</button></section>
  <section class="planning-edit-section"><header><h2>${L("完成与纠偏")}</h2><p>${L("分别写清完成证据、收口检查和 Runtime 应避免的误拆。")}</p></header><div class="planning-edit-grid"><div><label>${L("完成前要看到的证据")}</label>${renderPlanningSimpleRows("evidence_requirements",method?.evidence_requirements??[],L("例如：端到端主路径的验证记录"))}</div><div><label>${L("收口前检查")}</label>${renderPlanningSimpleRows("completion_checks",method?.completion_checks??[],L("例如：依赖方向可以由产出消费关系解释"))}</div></div><div><label>${L("提醒 Runtime 避免什么")}</label>${renderPlanningSimpleRows("failure_modes",method?.failure_modes??[],L("例如：按页面或文件夹机械拆 Goal"))}</div><label class="planning-enabled"><input name="enabled" type="checkbox"${method?.enabled===false?"":" checked"}><span>${L("保存后启用这套方法")}</span></label></section>
  <details class="planning-advanced"><summary><span>${L("高级设置")}</span>${icon("chevron-down")}</summary><div class="planning-advanced-body"><div class="planning-edit-grid"><label>${L("方法类型")}<select name="kind"><option value="custom"${method?.kind==="custom"||!method?" selected":""}>${L("自定义")}</option><option value="work_type"${method?.kind==="work_type"?" selected":""}>${L("工作类型")}</option><option value="domain"${method?.kind==="domain"?" selected":""}>${L("专业领域")}</option><option value="industry"${method?.kind==="industry"?" selected":""}>${L("行业方法")}</option><option value="overlay"${method?.kind==="overlay"?" selected":""}>${L("场景叠加层")}</option><option value="meta"${method?.kind==="meta"?" selected":""}>${L("元方法")}</option></select><small>${L("只用于方法库分类。")}</small></label><label>${L("参考成熟度")}<input name="confidence" type="number" min="0" max="1" step="0.05" value="${method?.confidence??0.8}" required><small>${L("0 到 1；不确定时保持 0.8。")}</small></label></div><label>${L("领域标签")}<input name="domain_tags" value="${escapeHtml(method?.domain_tags.join(", ")??"")}" placeholder="${L("用逗号分隔")}"></label><label>${L("可追溯来源")}<textarea name="source_refs" placeholder="${L("每行一个来源")}">${escapeHtml(method?.source_refs.join("\n")??"")}</textarea></label></div></details><p class="planning-form-error" data-planning-method-error role="alert" hidden></p><footer class="planning-edit-footer"><a class="planning-secondary-action" href="${returnHref}">${L("取消")}</a><button type="submit">${saveScope==="project"?L("保存项目方法"):L("保存到我的方法库")}</button></footer></form>`}

export function renderGoalBoardPlanningMethodPage(method:PlanningMethodPack|null,mode:"detail"|"edit"|"new",saveScope:"personal"|"project",project:WebProjectNavigation|null,controlToken="",desktopShell=false,projects:readonly WebProjectNavigation[]=[]):string{
  const projectScope=saveScope==="project";const basePath=projectScope&&project?`/projects/${encodeURIComponent(project.project_id)}/settings/planning`:"/settings/planning";const libraryHref=projectScope?(desktopShell?withDesktopQuery(basePath):basePath):planningSettingsHref(basePath,project,desktopShell);const detailPath=method?`${basePath}/${encodeURIComponent(method.method_id)}`:basePath;const detailHref=projectScope?(desktopShell?withDesktopQuery(detailPath):detailPath):planningSettingsHref(detailPath,project,desktopShell);const editPath=method?`${detailPath}/edit`:`${basePath}/new`;const editHref=projectScope?(desktopShell?withDesktopQuery(editPath):editPath):planningSettingsHref(editPath,project,desktopShell);const apiEndpoint=projectScope&&project?`/projects/${encodeURIComponent(project.project_id)}/api/settings/planning-methods`:"/api/settings/planning-methods";const returnHref=method?detailHref:libraryHref;const title=mode==="new"?(projectScope?L("新建项目方法"):L("新建我的方法")):mode==="edit"?(method?.scope==="built_in"?L("创建「{name}」的个人版本",{name:method.name}):L("编辑「{name}」",{name:method?.name??""})):method?.name??L("规划方法");const pagePath=mode==="detail"?detailHref:editHref;const shellReturn=project?(desktopShell?withDesktopQuery(`/projects/${encodeURIComponent(project.project_id)}`):`/projects/${encodeURIComponent(project.project_id)}`):(desktopShell?withDesktopQuery("/"):"/");const actionLabel=method?.scope==="built_in"?L("创建我的版本"):projectScope?L("编辑项目方法"):L("编辑方法");const navigation=project?renderProjectSettingsNavigation("planning",project,desktopShell,projects):renderSettingsNavigation("planning",null,desktopShell,projects);
  return `<!doctype html><html lang="${htmlLang()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${controlTokenMeta(controlToken)}<title>${escapeHtml(title)} · GoalBoard</title><script>${THEME_BOOTSTRAP_SCRIPT}</script><link rel="stylesheet" href="/assets/goalboard-settings.css"></head><body class="settings-page planning-page" data-desktop-shell="true"${desktopShell?' data-native-desktop="true"':""}>${renderIconSprite()}${planningTopbar(project?.display_name??L("规划方法"),projectScope?L("工作规划"):L("规划方法库"),shellReturn,pagePath,desktopShell)}<main class="settings-shell">${navigation}<div class="settings-content">${mode==="detail"&&method?`<article class="planning-detail"><a class="planning-back" href="${libraryHref}">${icon("arrow")}${projectScope?L("返回工作规划"):L("返回方法库")}</a><header class="planning-detail-header"><div class="planning-detail-header-main"><div><div class="planning-detail-meta"><span>${escapeHtml(planningMethodKindLabel(method.kind))}</span><span>${escapeHtml(planningMethodScopeLabel(method.scope))}</span><span>${L("版本 {version}",{version:method.version})}</span></div><h1>${escapeHtml(method.name)}</h1><p>${escapeHtml(method.summary)}</p></div><a class="planning-primary-action" href="${editHref}">${icon(method.scope==="built_in"?"copy":"settings")}${actionLabel}</a></div>${method.applies_to.length?`<div class="planning-detail-tags">${method.applies_to.map((item)=>`<span>${escapeHtml(item)}</span>`).join("")}</div>`:""}</header>${renderPlanningMethodDetailSections(method)}</article>`:`<section class="planning-edit"><a class="planning-back" href="${returnHref}">${icon("arrow")}${method?L("返回方法详情"):projectScope?L("返回工作规划"):L("返回方法库")}</a><header class="planning-page-header"><div><h1>${escapeHtml(title)}</h1><p>${method?.scope==="built_in"?L("系统模板不会被修改；保存后会生成你自己的版本。"):L("按用户能理解的方式维护规划路径、必答问题和依赖判断。")}</p></div></header>${renderPlanningEditForm(method,saveScope,project,apiEndpoint,returnHref)}</section>`}</div></main><script>${clientI18nScript()}${CONTROL_CLIENT_SCRIPT}${PLANNING_SETTINGS_CLIENT_SCRIPT}${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script></body></html>`}

export function renderGoalBoardPlanningSettings(view:GoalBoardWebView,methods:readonly PlanningMethodPack[],controlToken="",desktopShell=false):string{
  const project=view.project;
  const projectMethods=methods.filter((method)=>method.scope==="project");
  const selectedMethods=projectMethods.filter((method)=>method.enabled);
  const inactiveProjectMethods=projectMethods.filter((method)=>!method.enabled);
  const availableMethods=methods.filter((method)=>method.scope!=="project"&&method.enabled);
  const composition=composePlanningMethodPacks(selectedMethods);
  const basePath=`${view.route_prefix}/settings/planning`;
  const globalLibraryHref=planningSettingsHref("/settings/planning",project,desktopShell);
  const newProjectHref=desktopShell?withDesktopQuery(`${basePath}/new`):`${basePath}/new`;
  const orderedSelectedMethods=composition.method_pack_ids
    .map((methodId)=>selectedMethods.find((method)=>method.method_id===methodId))
    .filter((method):method is PlanningMethodPack=>method!=null);
  const compositionRows=renderPlanningCompositionRows(orderedSelectedMethods,basePath,desktopShell);
  const inactiveRows=renderPlanningCompositionRows(inactiveProjectMethods,basePath,desktopShell);
  const adoptionCards=project?renderPlanningAdoptionCards(availableMethods,project,desktopShell):"";
  const pagePath=desktopShell?withDesktopQuery(basePath):basePath;
  const returnHref=view.route_prefix||"/";
  const projectName=project?.display_name??L("当前项目");
  const navigation=project?renderProjectSettingsNavigation("planning",project,desktopShell,view.projects):renderSettingsNavigation("projects",null,desktopShell,view.projects);
  const compositionContent=selectedMethods.length
    ? `<div class="planning-composition-overview"><div><strong>${L("{count} 套方法共同生效",{count:selectedMethods.length})}</strong><p>${escapeHtml(listJoin(composition.method_names))}</p></div><div class="planning-composition-facts"><span>${L("{count} 个覆盖项",{count:composition.required_coverage.length})}</span><span>${L("{count} 条依赖规则",{count:composition.dependency_rules.length})}</span><span>${L("{count} 项完成检查",{count:composition.completion_checks.length})}</span></div></div><div class="planning-composition-list">${compositionRows}</div>`
    : `<div class="work-planning-empty"><h3>${L("尚未建立项目规划组合")}</h3><p>${L("Runtime 会先检查每个 Goal 的实际工作、专业领域、交付方式和风险，再选用所有相关方法；不预设类型或数量。你也可以把项目长期需要的方法加入组合，作为之后规划的共同基础。")}</p></div>`;
  const inactiveSection=inactiveProjectMethods.length
    ? `<section class="planning-inactive-section" aria-labelledby="planning-inactive-title"><div class="work-planning-section-header"><h2 id="planning-inactive-title">${L("未启用的方法")}</h2><p>${L("这些项目方法仍然保留，但不会参与当前组合；打开后可以重新启用。")}</p></div><div class="planning-composition-list">${inactiveRows}</div></section>`
    : "";
  return `<!doctype html><html lang="${htmlLang()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${controlTokenMeta(controlToken)}<title>${L("工作规划")} · ${escapeHtml(projectName)} · GoalBoard</title><script>${THEME_BOOTSTRAP_SCRIPT}</script><link rel="stylesheet" href="/assets/goalboard-settings.css"></head><body class="settings-page planning-page" data-desktop-shell="true"${desktopShell?' data-native-desktop="true"':""}>${renderIconSprite()}${planningTopbar(projectName,L("工作规划"),returnHref,pagePath,desktopShell)}<main class="settings-shell">${navigation}<div class="settings-content"><section class="work-planning"><header class="planning-page-header"><div><h1>${L("工作规划")}</h1><p>${L("为项目「{name}」组合多套规划方法。它们会共同检查同一棵 Goal Tree，不会被机械拆成串行步骤。",{name:projectName})}</p></div><div><a class="planning-secondary-action" href="${globalLibraryHref}">${L("浏览完整方法库")}</a> <a class="planning-primary-action" href="${newProjectHref}">${icon("plus")}${L("从空白新建")}</a></div></header><section class="planning-composition-section" aria-labelledby="planning-composition-title"><div class="work-planning-section-header"><h2 id="planning-composition-title">${L("当前规划组合")}</h2><p>${L("当前组合是规划下限，不是方法上限。Runtime 必须完整使用这组方法，并根据当前 Goal 的实际工作补充其他相关方法。")}</p></div>${compositionContent}</section><section class="planning-adoption-section" aria-labelledby="planning-adoption-title"><div class="work-planning-section-header"><h2 id="planning-adoption-title">${L("添加规划方法")}</h2><p>${L("可以继续加入多套互补方法。加入后会建立该项目的独立版本，原方法和其他项目不变。")}</p></div><div class="planning-adoption-tools"><nav class="planning-filters" aria-label="${L("筛选已有方法")}"><button type="button" data-planning-filter="all" aria-pressed="true">${L("全部")}</button><button type="button" data-planning-filter="work_type" aria-pressed="false">${L("工作类型")}</button><button type="button" data-planning-filter="domain" aria-pressed="false">${L("专业领域")}</button><button type="button" data-planning-filter="industry" aria-pressed="false">${L("行业方法")}</button><button type="button" data-planning-filter="overlay" aria-pressed="false">${L("场景叠加层")}</button><button type="button" data-planning-filter="mine" aria-pressed="false">${L("我的方法")}</button></nav></div><div class="planning-adoption-grid">${adoptionCards}<p class="planning-filter-empty" data-planning-filter-empty${availableMethods.length?" hidden":""}>${L("这个分类里还没有可加入的方法。")}</p></div><p class="planning-adoption-error" data-planning-adoption-error role="alert" hidden></p></section>${inactiveSection}</section></div></main><script>${clientI18nScript()}${CONTROL_CLIENT_SCRIPT}${PLANNING_SETTINGS_CLIENT_SCRIPT}${PLANNING_ADOPTION_CLIENT_SCRIPT}${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script></body></html>`}

export function renderGoalBoardSettings(view: GoalBoardSettingsView, controlToken = "", desktopShell = false): string {
  const title = view.section === "appearance"
    ? L("界面与语言")
    : view.section === "runtimes"
      ? L("AI 与执行工具")
      : view.section === "projects"
        ? L("项目设置")
        : L("诊断");
  const contextProject = view.context_project ?? null;
  const settingsPath = settingsContextHref(`/settings/${view.section}`, contextProject, desktopShell);
  const rawReturnHref = contextProject ? `/projects/${encodeURIComponent(contextProject.project_id)}/` : "/";
  const returnHref = desktopShell ? withDesktopQuery(rawReturnHref) : rawReturnHref;
  const projectManager = view.section === "projects";
  const content = view.section === "appearance"
    ? renderAppearanceSettings(settingsPath)
    : view.section === "runtimes"
      ? renderRuntimeSettings(view)
      : view.section === "projects"
        ? renderProjectSettings(view)
        : renderDiagnosticsSettings(view);
  return `<!doctype html>
<html lang="${htmlLang()}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${controlTokenMeta(controlToken)}<title>${title} · ${L("GoalBoard 设置")}</title><script>${THEME_BOOTSTRAP_SCRIPT}</script><link rel="stylesheet" href="/assets/goalboard-settings.css"></head>
<body class="settings-page" data-settings-section="${view.section}" data-desktop-shell="true"${desktopShell ? ' data-native-desktop="true"' : ""}>
  ${renderIconSprite()}
  <header class="topbar"><a class="brand" href="${returnHref}" aria-label="${contextProject ? L("返回 Goal Tree") : L("返回 GoalBoard 项目列表")}">${icon("brand")}<strong>GoalBoard</strong></a><div class="project-context"${desktopShell ? " data-tauri-drag-region" : ""}><strong${desktopShell ? " data-tauri-drag-region" : ""}>${projectManager ? L("项目管理") : L("全局设置")}</strong><small${desktopShell ? " data-tauri-drag-region" : ""}>${projectManager ? L("创建、导入和维护项目") : title}</small></div><div class="top-spacer"${desktopShell ? " data-tauri-drag-region" : ""}></div><a class="top-action" href="${returnHref}" aria-label="${L("关闭全局设置")}">${icon(desktopShell ? "x" : contextProject ? "tree" : "folder")}<span>${contextProject ? L("Goal Tree") : L("项目列表")}</span></a></header>
  <main class="settings-shell${projectManager ? " settings-shell--standalone" : ""}">
    ${projectManager ? "" : renderSettingsNavigation(view.section, contextProject, desktopShell, view.projects)}
    <div class="settings-content">${content}</div>
  </main>
  ${renderRuntimePlanDialog()}
  ${renderProjectMigrationDialog()}
  <div class="toast" data-settings-toast role="status" aria-live="polite"></div>
  <script>${clientI18nScript()}${CONTROL_CLIENT_SCRIPT}${PROJECT_INDEX_CLIENT_SCRIPT}${SETTINGS_CLIENT_SCRIPT}${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script>
</body></html>`;
}

function prefixLocalLinks(html: string, routePrefix: string, desktopShell = false): string {
  const prefixed = routePrefix
    ? html.replace(/href="\/(?!locale(?:\?|")|projects\/)/g, `href="${routePrefix}/`)
    : html;
  const resolved = prefixed
    .replaceAll('href="__PROJECT_INDEX__"', 'href="/"')
    .replaceAll('href="__WORKBENCH_CSS__"', 'href="/assets/goalboard-workbench.css"')
    .replaceAll('href="__PROJECT_SETTINGS__"', `href="${routePrefix ? `${routePrefix}/settings/guidance` : "/settings/projects"}"`)
    .replaceAll('href="__SYSTEM_SETTINGS__"', `href="/settings/appearance${routePrefix ? `?project=${routePrefix.slice("/projects/".length)}` : ""}"`);
  return desktopShell ? appendDesktopQueryToLocalHrefs(resolved) : resolved;
}

const TRASH_GOAL_STYLES = String.raw`
  .trash-goal-document .trash-goal-hero { padding-bottom: 30px; }
  .trash-goal-document .goal-header { padding-bottom: 0; }
  .trash-goal-document .goal-title-kicker { align-items: center; gap: 12px; }
  .trash-goal-document .goal-title-kicker .goal-status {
    flex: 0 0 auto;
    align-self: flex-start;
    min-height: 26px;
    margin: 0;
    padding: 2px 9px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--goal-status-tone) 7%, var(--paper));
  }
  .trash-goal-facts {
    min-width: 0;
    margin: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 7px 14px;
    color: var(--muted);
    font-size: 10px;
  }
  .trash-goal-facts > div { min-width: 0; display: inline-flex; align-items: center; gap: 4px; }
  .trash-goal-facts svg { width: 11px; height: 11px; color: var(--faint); }
  .trash-goal-facts dt { color: var(--faint); }
  .trash-goal-facts dd { margin: 0; color: var(--ink-soft); font-variant-numeric: tabular-nums; }
  .trash-goal-workspace {
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: stretch;
    gap: 14px;
  }
  .trash-goal-panel {
    min-width: 0;
    padding: 22px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: color-mix(in srgb, var(--rail) 72%, var(--paper));
  }
  .trash-goal-panel--state { grid-column: 1 / -1; }
  .trash-goal-panel .section-heading { margin-bottom: 14px; }
  .trash-goal-panel .section-heading > span { color: var(--muted); }
  .trash-goal-panel .section-heading h2 { color: var(--ink); font-size: 15px; }
  .trash-goal-panel .section-heading p { max-width: 62ch; color: var(--muted); line-height: 1.5; }
  .trash-goal-panel .trash-summary,
  .trash-goal-panel .business-copy,
  .trash-goal-panel .trash-restore-row { margin: 0; padding: 0; color: var(--ink-soft); }
  .trash-goal-panel .trash-summary p,
  .trash-goal-panel .business-copy p,
  .trash-goal-panel .trash-restore-row p { max-width: 68ch; margin: 0; line-height: 1.65; }
  .trash-goal-panel .trash-summary p + p,
  .trash-goal-panel .business-copy p + p { margin-top: 12px; }
  .trash-goal-panel .trash-summary strong { display: block; margin-bottom: 5px; color: var(--ink); }
  .trash-goal-panel .business-copy strong {
    display: block;
    margin-bottom: 3px;
    color: var(--muted);
    font-size: 10.5px;
    font-weight: 680;
  }
  .trash-goal-panel .business-copy .outcome { color: var(--ink-soft); }
  .trash-goal-panel .trash-restore-row { display: grid; align-content: start; justify-items: start; gap: 18px; }
  .trash-goal-panel .trash-restore-row .button-primary { min-height: 40px; margin: 0; }

  @media (min-width: 761px) {
    body[data-desktop-shell="true"] .trash-goal-document .trash-goal-hero,
    body[data-desktop-shell="true"] .trash-goal-document .trash-goal-workspace {
      border: 0;
      border-radius: 0;
      background: transparent;
      overflow: visible;
    }
    body[data-desktop-shell="true"] .trash-goal-document .trash-goal-hero { padding: 16px 8px 4px; }
    body[data-desktop-shell="true"] .trash-goal-document .trash-goal-workspace { padding: 8px; }
    body[data-desktop-shell="true"] .trash-goal-panel {
      border: 0;
      background: var(--paper);
      box-shadow: var(--shadow-soft);
    }
  }

  @media (max-width: 760px) {
    .trash-goal-document .trash-goal-hero { padding: 25px 18px 24px; }
    .trash-goal-document .goal-title-kicker { align-items: flex-start; flex-direction: column; gap: 9px; }
    .trash-goal-facts { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr); gap: 5px; }
    .trash-goal-document .goal-title-row { display: grid; gap: 12px; }
    .trash-goal-document .goal-title-actions { justify-content: flex-start; }
    .trash-goal-document .goal-title-actions .document-action { min-height: 44px; }
    .trash-goal-workspace { padding: 14px; grid-template-columns: minmax(0, 1fr); gap: 10px; }
    .trash-goal-panel,
    .trash-goal-panel--state { grid-column: 1; padding: 17px; }
    .trash-goal-panel .trash-restore-row .button-primary { min-height: 44px; white-space: normal; }
  }
`;

/** Shared workbench presentation. Kept outside project HTML so the browser can reuse it. */
export function renderGoalBoardWorkbenchStylesheet(): string {
  return `${STYLES}${MORE_STYLES}${RESPONSIVE_STYLES}${VISUAL_FOUNDATION_STYLES}${TRASH_GOAL_STYLES}${PROJECT_OPERATIONS_STYLES}.document-pane.is-syncing .goal-document { animation: none; }`;
}

/** Full-screen first-run and update journey. */
export function renderGoalBoardOnboardingStylesheet(): string {
  return `
  :root {
    color-scheme: light;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", system-ui, sans-serif;
    background: #f1f3f2;
    color: #1f272b;
  }
  * { box-sizing: border-box; }
  html, body { min-height: 100%; margin: 0; }
  body { min-height: 100dvh; overflow-x: hidden; background: transparent; color: #1f272b; isolation: isolate; }
  .onboarding-page:not(.onboarding-page--update) { height: 100dvh; min-height: 0; overflow: hidden; }
  button, input, textarea { font: inherit; }
  button, a { -webkit-tap-highlight-color: transparent; }
  ::selection { background: #c8d2ec; color: #172027; }
  :focus-visible { outline: 2px solid #5068b7; outline-offset: 4px; }
  * { scrollbar-width: thin; scrollbar-color: rgba(91, 105, 113, .38) transparent; }
  *::-webkit-scrollbar { width: 8px; height: 8px; }
  *::-webkit-scrollbar-track { background: transparent; }
  *::-webkit-scrollbar-thumb { border: 2px solid transparent; border-radius: 999px; background: rgba(91, 105, 113, .38); background-clip: padding-box; }
  .icon-sprite { position: absolute; width: 0; height: 0; overflow: hidden; }
  .onboarding-atmosphere {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background: #f1f3f2;
  }
  .onboarding-topbar,
  .onboarding-room,
  .onboarding-update { position: relative; z-index: 1; }
  .onboarding-page [hidden] { display: none !important; }
  .onboarding-topbar {
    position: fixed;
    inset: 0 0 auto;
    min-height: 60px;
    padding: 8px clamp(20px, 3.2vw, 46px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: #465158;
  }
  .onboarding-brand { color: #263036; font-size: 10px; font-weight: 760; letter-spacing: .1em; text-decoration: none; text-transform: uppercase; }
  .onboarding-topbar-actions { display: flex; align-items: center; gap: clamp(8px, 1.4vw, 16px); }
  .onboarding-topbar-actions a { min-height: 44px; display: inline-flex; align-items: center; color: #566268; font-size: 11px; text-decoration: none; transition: color 130ms ease, transform 130ms ease; }
  .onboarding-topbar-actions a:hover { color: #1f272b; transform: translateY(-1px); }
  .onboarding-topbar button {
    min-height: 44px;
    padding: 0 8px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: #4e5a60;
    font-size: 11px;
    cursor: pointer;
    transition: color 130ms ease, transform 130ms ease, background 130ms ease;
  }
  .onboarding-topbar button:hover { background: #e5e8e7; color: #1f272b; transform: translateY(-1px); }
  .onboarding-room { height: 100dvh; min-height: 0; overflow: hidden; }
  .onboarding-flow {
    position: absolute;
    inset: clamp(118px, calc(61.8dvh - 112px), 430px) auto 32px clamp(24px, 9vw, 136px);
    width: min(calc(100% - clamp(48px, 18vw, 272px)), 480px);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    transition: top 280ms cubic-bezier(.16, 1, .3, 1);
    animation: onboarding-session-ready 460ms cubic-bezier(.16, 1, .3, 1) both;
  }
  .onboarding-flow-header {
    width: min(100%, 480px);
    min-height: 44px;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }
  .onboarding-progress {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    color: #59666d;
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
    font-size: 9px;
    font-variant-numeric: tabular-nums;
    font-weight: 620;
    letter-spacing: .08em;
    text-transform: uppercase;
  }
  .onboarding-progress::before { content: ""; width: 5px; height: 5px; flex: none; border-radius: 1px; background: #5068b7; transition: background 130ms ease; }
  .onboarding-stage { position: relative; min-height: 0; }
  .onboarding-step { position: absolute; inset: 0; width: 100%; }
  .onboarding-step.is-current { z-index: 2; }
  .onboarding-step.is-leaving { z-index: 1; pointer-events: none; }
  .onboarding-flow[data-step-direction="forward"] .onboarding-step.is-entering { animation: onboarding-step-in-forward 300ms cubic-bezier(.16, 1, .3, 1) both; }
  .onboarding-flow[data-step-direction="forward"] .onboarding-step.is-leaving { animation: onboarding-step-out-forward 260ms cubic-bezier(.4, 0, 1, 1) both; }
  .onboarding-flow[data-step-direction="backward"] .onboarding-step.is-entering { animation: onboarding-step-in-backward 300ms cubic-bezier(.16, 1, .3, 1) both; }
  .onboarding-flow[data-step-direction="backward"] .onboarding-step.is-leaving { animation: onboarding-step-out-backward 260ms cubic-bezier(.4, 0, 1, 1) both; }
  .onboarding-step h1, .onboarding-update h1 {
    max-width: 22ch;
    margin: 0 0 8px;
    color: #1f272b;
    font-size: clamp(19px, 1.45vw, 21px);
    font-weight: 600;
    letter-spacing: -.025em;
    line-height: 1.3;
    text-wrap: balance;
  }
  .onboarding-step h1:focus { outline: none; }
  .onboarding-intro { max-width: 48ch; margin: 0 0 16px; color: #59656b; font-size: 11.5px; line-height: 1.6; }
  .onboarding-visually-hidden { position: absolute !important; width: 1px !important; height: 1px !important; padding: 0 !important; margin: -1px !important; overflow: hidden !important; clip: rect(0, 0, 0, 0) !important; white-space: nowrap !important; border: 0 !important; }
  .onboarding-composer {
    width: min(100%, 480px);
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: end;
    gap: 12px;
  }
  .onboarding-intent { position: relative; min-width: 0; align-self: stretch; display: flex; }
  .onboarding-intent-trigger {
    min-width: 82px;
    min-height: 46px;
    padding: 0 2px 0 0;
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border: 0;
    border-radius: 0;
    outline: 0;
    background: transparent;
    box-shadow: inset 0 -1px #cbd3d3;
    color: #344148;
    font-size: 12px;
    font-weight: 660;
    cursor: pointer;
    transition: color 140ms ease, box-shadow 140ms ease;
  }
  .onboarding-intent-trigger:hover { color: #1f272b; box-shadow: inset 0 -1px #9aa8a8; }
  .onboarding-intent-trigger:focus-visible,
  .onboarding-intent.is-open .onboarding-intent-trigger { color: #314d9b; box-shadow: inset 0 -1px #5068b7; }
  .onboarding-intent-trigger svg { width: 13px; height: 13px; color: #68757b; stroke-width: 1.7; transition: color 140ms ease, transform 180ms cubic-bezier(.16, 1, .3, 1); }
  .onboarding-intent.is-open .onboarding-intent-trigger svg { color: #405aa1; transform: rotate(180deg); }
  .onboarding-intent-options {
    position: absolute;
    left: -8px;
    bottom: calc(100% + 8px);
    z-index: 8;
    width: 210px;
    padding: 6px;
    display: grid;
    gap: 1px;
    visibility: hidden;
    opacity: 0;
    transform: translateY(5px) scale(.985);
    transform-origin: left bottom;
    pointer-events: none;
    border-radius: 9px;
    background: rgba(247, 249, 248, .98);
    box-shadow: 0 16px 38px rgba(40, 49, 52, .14);
    transition: opacity 150ms ease, transform 180ms cubic-bezier(.16, 1, .3, 1), visibility 0s linear 180ms;
  }
  .onboarding-intent.is-open .onboarding-intent-options { visibility: visible; opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; transition-delay: 0s; }
  .onboarding-intent-options button {
    width: 100%;
    min-height: 38px;
    padding: 0 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #455158;
    font-size: 11px;
    font-weight: 560;
    text-align: left;
    cursor: pointer;
  }
  .onboarding-intent-options button:hover,
  .onboarding-intent-options button:focus-visible { outline: 0; background: #ecefee; color: #20292d; }
  .onboarding-intent-options button[aria-selected="true"] { background: #e3e7e6; color: #20292d; font-weight: 640; }
  .onboarding-intent-options button > span { min-width: 0; display: flex; align-items: center; gap: 8px; }
  .onboarding-intent-options button > span svg { width: 13px; height: 13px; flex: none; color: #718086; stroke-width: 1.5; }
  .onboarding-intent-options button > span b { min-width: 0; font: inherit; }
  .onboarding-intent-options button[aria-selected="true"] > span svg { color: #405aa1; }
  .onboarding-intent-options i { width: 5px; height: 5px; flex: none; border-radius: 50%; background: transparent; }
  .onboarding-intent-options button[aria-selected="true"] i { background: #5068b7; box-shadow: 0 0 0 3px rgba(80, 104, 183, .09); }
  .onboarding-answer {
    position: relative;
    width: min(100%, 360px);
    min-height: 46px;
    padding: 3px 10px;
    display: flex;
    align-items: flex-start;
    gap: 9px;
    overflow: hidden;
    border: 1px solid #d4dad9;
    border-radius: 5px;
    background: #e6eae9;
    color: #546168;
    font-size: 14px;
    transition: background 140ms ease, border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
  }
  .onboarding-answer::before { content: ""; position: absolute; inset: 0; z-index: 0; background: rgba(80, 104, 183, .08); opacity: 0; transform: scaleX(0); transform-origin: left center; pointer-events: none; }
  .onboarding-step.is-current .onboarding-answer::before { animation: onboarding-control-ready 420ms 80ms cubic-bezier(.16, 1, .3, 1) both; }
  .onboarding-answer::after { content: ""; position: absolute; inset: -1px auto -1px -1px; z-index: 2; width: 1px; background: #5068b7; transform: scaleY(0); transform-origin: center; transition: transform 140ms cubic-bezier(.16, 1, .3, 1); }
  .onboarding-answer > span { position: relative; z-index: 1; flex: none; padding-top: 8px; font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; font-size: 9px; font-weight: 650; letter-spacing: .06em; line-height: 1.5; }
  .onboarding-composer .onboarding-answer { width: 100%; }
  .onboarding-answer--plain {
    padding: 3px 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: inset 0 -1px #cbd3d3;
  }
  .onboarding-answer--plain::before,
  .onboarding-answer--plain::after { display: none; }
  .onboarding-answer textarea,
  .onboarding-answer input,
  .onboarding-workspace input {
    width: 100%;
    position: relative;
    z-index: 1;
    padding: 7px 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: #1f272b;
    caret-color: #5068b7;
  }
  .onboarding-answer textarea { min-height: 38px; max-height: 76px; resize: none; line-height: 1.5; }
  .onboarding-answer input { font-size: inherit; }
  .onboarding-answer textarea::placeholder,
  .onboarding-answer input::placeholder,
  .onboarding-workspace input::placeholder { color: #5d696f; opacity: 1; }
  .onboarding-answer:focus-within { background: #fbfcfb; border-color: #7184c6; box-shadow: 0 8px 22px rgba(41, 54, 59, .07); color: #334047; transform: translateY(-1px); }
  .onboarding-answer:focus-within::after { transform: scaleY(1); }
  .onboarding-answer--plain:focus-within { background: transparent; border-color: transparent; box-shadow: inset 0 -1px #5068b7; transform: none; }
  .onboarding-field-error, .onboarding-error { max-width: 56ch; margin: 10px 0 0; color: #8c3e43; font-size: 11px; line-height: 1.5; }
  .onboarding-echo { max-width: 56ch; margin: 0 0 16px; display: inline-flex; align-items: baseline; gap: 7px; color: #5d696f; font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; animation: onboarding-receipt-lock 320ms 60ms cubic-bezier(.16, 1, .3, 1) both; }
  .onboarding-echo::before { content: ""; width: 5px; height: 5px; flex: none; align-self: center; border-radius: 1px; background: #5068b7; animation: onboarding-receipt-confirm 360ms 120ms cubic-bezier(.16, 1, .3, 1) both; }
  .onboarding-echo strong { color: #344047; font-size: 11px; font-weight: 570; }
  .onboarding-echo span + strong::before { content: none; }
  .onboarding-workspace { width: min(100%, 360px); display: grid; gap: 2px; color: #59656b; font-size: 9.5px; }
  .onboarding-workspace input { min-height: 34px; padding: 0; border: 0; border-bottom: 1px solid #cbd3d3; border-radius: 0; background: transparent; font-size: 11.5px; transition: border-color 140ms ease, color 140ms ease; }
  .onboarding-workspace input:focus { border-color: #5068b7; background: transparent; box-shadow: none; }
  .onboarding-runtime { max-width: 360px; margin: 9px 0 0; padding: 0; border: 0; }
  .onboarding-runtime legend { margin-bottom: 3px; color: #59656b; font-size: 9.5px; }
  .onboarding-runtime { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1px; }
  .onboarding-runtime legend { grid-column: 1 / -1; }
  .onboarding-runtime-choice { position: relative; min-width: 0; cursor: pointer; }
  .onboarding-runtime-choice input { position: absolute; opacity: 0; pointer-events: none; }
  .onboarding-runtime-choice > span {
    min-height: 34px;
    padding: 0 8px;
    display: grid;
    grid-template-columns: 13px minmax(0, 1fr) 5px;
    align-items: center;
    gap: 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #3f4a50;
    font-size: 10.5px;
    transition: background 130ms ease, color 130ms ease;
  }
  .onboarding-runtime-choice > span > svg { width: 13px; height: 13px; color: #718086; stroke-width: 1.45; }
  .onboarding-runtime-choice strong { min-width: 0; font-weight: 540; line-height: 1.25; }
  .onboarding-runtime-choice i { width: 5px; height: 5px; border-radius: 50%; background: #b6bfbe; transition: background 130ms ease, box-shadow 130ms ease; }
  .onboarding-runtime-choice:not(:has(input:checked)) i { background: transparent; }
  .onboarding-runtime-choice:hover > span { background: #e9eceb; color: #1f272b; }
  .onboarding-runtime-choice input:checked + span { background: #e2e5e4; color: #1f272b; }
  .onboarding-runtime-choice input:checked + span i { background: #5068b7; }
  .onboarding-runtime-choice input:focus-visible + span { outline: 2px solid #5068b7; outline-offset: 3px; }
  .onboarding-hint { max-width: 360px; margin: 5px 0 0; color: #657177; font-size: 9px; line-height: 1.4; }
  .onboarding-review { max-width: 480px; margin: 1px 0 0; display: grid; gap: 2px; }
  .onboarding-review div { min-height: 34px; padding: 6px 0; display: grid; grid-template-columns: 92px minmax(0, 1fr); align-items: baseline; gap: 14px; }
  .onboarding-review dt { color: #647077; font-size: 10px; }
  .onboarding-review dd { margin: 0; color: #303a3f; font-size: 11.5px; line-height: 1.5; overflow-wrap: anywhere; }
  .onboarding-confirm { max-width: 480px; margin-top: 13px; display: flex; align-items: flex-start; gap: 9px; color: #566168; font-size: 11px; line-height: 1.55; cursor: pointer; }
  .onboarding-confirm input { width: 16px; height: 16px; margin: 1px 0 0; accent-color: #5068b7; }
  body[data-onboarding-tone="4"] .onboarding-flow {
    inset: 72px auto 18px clamp(24px, 6vw, 92px);
    width: min(calc(100% - clamp(48px, 12vw, 184px)), 760px);
  }
  body[data-onboarding-tone="4"] .onboarding-flow-header { width: 100%; margin-bottom: 8px; }
  .onboarding-step--runtime-embedded {
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) 34px;
    gap: 9px;
  }
  .onboarding-runtime-heading { display: grid; grid-template-columns: minmax(0, .75fr) minmax(250px, 1fr); align-items: end; gap: 24px; }
  .onboarding-runtime-heading h1 { max-width: none; margin: 0; }
  .onboarding-runtime-heading .onboarding-intro { max-width: 58ch; margin: 0; font-size: 10.5px; }
  .onboarding-runtime-viewport {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid #c5cccb;
    border-radius: 7px;
    background: #17191c;
  }
  .onboarding-runtime-viewport iframe { width: 100%; height: 100%; display: block; border: 0; background: #17191c; }
  .onboarding-runtime-state { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .onboarding-runtime-state p { min-width: 0; margin: 0; display: flex; align-items: center; gap: 7px; color: #5c686e; font-size: 9.5px; line-height: 1.45; }
  .onboarding-runtime-state p::before { content: ""; width: 5px; height: 5px; flex: none; border-radius: 50%; background: #8d999e; }
  .onboarding-runtime-state p[data-state="ready"]::before { background: #5068b7; }
  .onboarding-runtime-state p[data-state="error"] { color: #8c3e43; }
  .onboarding-runtime-state p[data-state="error"]::before { background: #a64c52; }
  .onboarding-runtime-state button { min-height: 34px; padding: 0; display: inline-flex; align-items: center; gap: 6px; border: 0; background: transparent; color: #405aa1; font-size: 10px; font-weight: 620; cursor: pointer; }
  .onboarding-runtime-state button svg { width: 12px; height: 12px; }
  .onboarding-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 14px;
  }
  .onboarding-actions button {
    min-height: 44px;
    padding: 0 2px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: #344148;
    font-size: 10.5px;
    font-weight: 620;
    cursor: pointer;
    box-shadow: none;
    transition: color 130ms ease, opacity 130ms ease;
  }
  .onboarding-actions button svg { width: 14px; height: 14px; stroke-width: 1.45; transition: transform 140ms cubic-bezier(.16, 1, .3, 1); }
  .onboarding-actions button:hover { color: #314d9b; }
  .onboarding-actions .onboarding-back:hover svg { transform: translateX(-2px); }
  .onboarding-actions .onboarding-next:hover svg,
  .onboarding-actions .onboarding-submit:hover svg { transform: translateX(2px); }
  .onboarding-actions button:active { opacity: .62; }
  .onboarding-actions button:disabled { opacity: .42; cursor: wait; }
  .onboarding-actions .onboarding-back { color: #657177; }
  .onboarding-flow > .onboarding-error { position: absolute; top: calc(100% + 8px); left: 0; max-width: min(420px, calc(100vw - 48px)); margin: 0; }
  .onboarding-update-actions button {
    min-height: 38px;
    padding: 0 13px;
    border: 0;
    border-radius: 5px;
    background: #222b30;
    color: #f7f8f7;
    font-size: 11px;
    font-weight: 650;
    cursor: pointer;
    transition: transform 130ms ease, background 130ms ease;
  }
  .onboarding-update-actions button:hover { transform: translateY(-1px); background: #11181c; }
  .onboarding-update-actions button:disabled { opacity: .55; cursor: wait; transform: none; }
  .onboarding-page--update { color: #1f272b; }
  .onboarding-update { width: min(100% - 48px, 480px); min-height: 100dvh; margin: 0 0 0 clamp(24px, 9vw, 136px); padding: 88px 0 56px; display: grid; align-content: center; gap: 24px; }
  .onboarding-update .onboarding-brand { color: #30393e; }
  .onboarding-update h1 { max-width: none; margin: 0 0 12px; color: #20272b; }
  .onboarding-update-copy > p { max-width: 60ch; margin: 0; color: #566168; font-size: 11.5px; line-height: 1.65; }
  .onboarding-update ul { max-width: 480px; margin: 20px 0 0; padding: 0; display: grid; gap: 14px; list-style: none; }
  .onboarding-update li { display: grid; gap: 5px; }
  .onboarding-update li strong { color: #303a3f; font-size: 11.5px; }
  .onboarding-update li span { color: #5d686e; font-size: 11px; line-height: 1.55; }
  .onboarding-update-actions { display: flex; align-items: center; gap: 16px; }
  .onboarding-update-actions a { min-height: 44px; display: inline-flex; align-items: center; color: #566168; font-size: 12px; text-underline-offset: 4px; }
  .onboarding-update .onboarding-error { color: #913f43; }
  @keyframes onboarding-session-ready {
    from { opacity: .62; }
    to { opacity: 1; }
  }
  @keyframes onboarding-step-in-forward {
    from { opacity: .12; clip-path: inset(0 12% 0 0); transform: translateX(16px); }
    to { opacity: 1; clip-path: inset(0); transform: translateX(0); }
  }
  @keyframes onboarding-step-out-forward {
    from { opacity: 1; clip-path: inset(0); transform: translateX(0); }
    to { opacity: 0; clip-path: inset(0 0 0 8%); transform: translateX(-8px); }
  }
  @keyframes onboarding-step-in-backward {
    from { opacity: .12; clip-path: inset(0 0 0 12%); transform: translateX(-16px); }
    to { opacity: 1; clip-path: inset(0); transform: translateX(0); }
  }
  @keyframes onboarding-step-out-backward {
    from { opacity: 1; clip-path: inset(0); transform: translateX(0); }
    to { opacity: 0; clip-path: inset(0 8% 0 0); transform: translateX(8px); }
  }
  @keyframes onboarding-control-ready {
    0% { opacity: 0; transform: scaleX(0); }
    42% { opacity: 1; }
    100% { opacity: 0; transform: scaleX(1); }
  }
  @keyframes onboarding-receipt-lock {
    from { opacity: .35; clip-path: inset(0 16% 0 0); }
    to { opacity: 1; clip-path: inset(0); }
  }
  @keyframes onboarding-receipt-confirm {
    from { opacity: .2; transform: scale(.4); }
    to { opacity: 1; transform: scale(1); }
  }
  @media (max-width: 760px) {
    .onboarding-topbar { min-height: 60px; padding-inline: 18px; }
    .onboarding-topbar-actions { gap: 8px; }
    .onboarding-topbar-actions a { font-size: 11px; }
    .onboarding-topbar button { padding-inline: 8px; }
    .onboarding-room { height: 100dvh; }
    .onboarding-flow { inset: clamp(116px, calc(61.8dvh - 112px), 430px) 20px 24px; width: auto; }
    .onboarding-flow-header { margin-bottom: 8px; }
    .onboarding-step h1 { font-size: 20px; }
    .onboarding-intro { margin-bottom: 16px; font-size: 11.5px; }
    .onboarding-answer { width: 100%; min-height: 48px; padding: 4px 10px; gap: 8px; font-size: 14px; }
    .onboarding-intent-trigger { min-height: 48px; }
    .onboarding-answer--plain { padding: 4px 0; }
    .onboarding-answer > span { padding-top: 8px; font-size: 9px; }
    .onboarding-answer textarea { min-height: 38px; padding-top: 7px; }
    .onboarding-echo { max-width: 100%; }
    .onboarding-runtime-choice > span { min-height: 38px; }
    .onboarding-review div { grid-template-columns: minmax(0, 1fr); gap: 4px; }
    body[data-onboarding-tone="4"] .onboarding-flow { inset: 62px 14px 10px; width: auto; }
    .onboarding-step--runtime-embedded { grid-template-rows: auto minmax(0, 1fr) 38px; gap: 7px; }
    .onboarding-runtime-heading { grid-template-columns: minmax(0, 1fr); gap: 3px; }
    .onboarding-runtime-heading h1 { font-size: 17px; }
    .onboarding-runtime-heading .onboarding-intro { max-width: none; font-size: 9.5px; line-height: 1.45; }
    .onboarding-runtime-viewport { border-radius: 5px; }
    .onboarding-runtime-state p { font-size: 9px; }
    .onboarding-actions button { min-height: 44px; }
    .onboarding-update { width: calc(100% - 40px); margin: 0 20px; padding-block: 78px 40px; align-content: start; }
    .onboarding-update-actions { align-items: stretch; flex-direction: column; }
    .onboarding-update-actions button, .onboarding-update-actions a { justify-content: center; min-height: 48px; }
  }
  @media (max-width: 460px) {
    .onboarding-topbar-actions a { display: none; }
    .onboarding-flow-header { gap: 12px; }
    .onboarding-actions { gap: 10px; }
  }
  body[data-onboarding-tone="2"] .onboarding-flow { top: clamp(96px, calc(50dvh - 136px), 330px); }
  @media (max-height: 760px) {
    body[data-onboarding-tone="2"] .onboarding-flow { top: max(80px, calc(50dvh - 160px)); }
    body[data-onboarding-tone="3"] .onboarding-flow { top: max(108px, calc(50dvh - 86px)); }
    .onboarding-step--review .onboarding-intro { margin-bottom: 10px; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; animation-delay: 0ms !important; scroll-behavior: auto !important; transition-duration: .01ms !important; }
  }
  `;
}

/** Shared project index presentation. */
export function renderGoalBoardProjectIndexStylesheet(): string {
  return `${STYLES}${PROJECT_INDEX_STYLES}${VISUAL_FOUNDATION_STYLES}`;
}

/** Shared settings presentation, reused across project and global settings routes. */
export function renderGoalBoardSettingsStylesheet(): string {
  return `${STYLES}${MORE_STYLES}${RESPONSIVE_STYLES}${PROJECT_INDEX_STYLES}${SETTINGS_STYLES}${PROJECT_GUIDANCE_SETTINGS_STYLES}${PROJECT_RULES_SETTINGS_STYLES}${PLANNING_SETTINGS_STYLES}${VISUAL_FOUNDATION_STYLES}`;
}

/** Shared workbench behavior. Locale strings and project facts remain page-local. */
export function renderGoalBoardWorkbenchClientScript(): string {
  return `${CONTROL_CLIENT_SCRIPT}${CLIENT_SCRIPT}${VISUAL_FOUNDATION_CLIENT_SCRIPT}${PROJECT_OPERATIONS_CLIENT_SCRIPT}`;
}

export function renderGoalBoardRefreshFragment(
  view: GoalBoardWebView,
  requestedGoalId?: string,
  archiveView = false,
  trashView = false,
): string {
  const visibleGoals = trashView ? view.trashed_goals : archiveView ? view.archived_goals : view.goals;
  const collectionView = archiveView || trashView;
  const selected = visibleGoals.find((item) => item.goal.goal_id === requestedGoalId) ??
    (collectionView ? undefined : visibleGoals.find((item) => item.goal.goal_id === view.active_goal_id)) ??
    visibleGoals[0];
  const selectedId = selected?.goal.goal_id ?? "";
  const collectionSuffix = trashView ? L("回收站") : archiveView ? L("归档") : "";
  const searchPlaceholder = trashView
    ? L("在回收站内搜索")
    : archiveView
      ? L("在已归档 Goal 中搜索")
      : L("在当前 Goal Tree 内搜索");
  const searchLabel = trashView ? L("搜索回收站") : archiveView ? L("搜索已归档 Goal") : L("搜索 Goal");
  const phaseSummary = [
    { label: L("澄清中"), count: view.counts.clarifying },
    { label: L("执行中"), count: view.counts.executing },
    { label: L("复核中"), count: view.counts.reviewing },
    { label: L("重新验证中"), count: view.counts.revalidating },
  ].filter((item) => item.count > 0).map((item) => `${item.label} ${item.count}`).join(" · ");
  const blockedCount = view.counts.clarification_blocked + view.counts.execution_blocked +
    view.counts.completion_blocked + view.counts.review_blocked + view.counts.revalidation_blocked +
    view.counts.invalidated;
  const footerStatus = [phaseSummary, blockedCount > 0 ? L("受阻 {count}", { count: blockedCount }) : ""]
    .filter(Boolean).join(" · ") || L("当前没有进行中的 Goal");
  const collectionNote = trashView
    ? L("可恢复；历史与关联处理记录会保留")
    : archiveView
      ? L("可随时恢复")
      : footerStatus;
  const document = selected
    ? trashView
      ? renderTrashGoalDocument(selected, true)
      : renderGoalDocument(selected, view, true)
    : `<div class="archive-empty">${icon("archive")}<h1>${trashView ? L("回收站是空的") : L("还没有归档 Goal")}</h1></div>`;
  const tree = `${renderGoalTree(view, selectedId, visibleGoals)}<div class="tree-filter-empty" data-tree-filter-empty hidden><p>${L("没有符合当前筛选条件的 Goal。")}</p><button type="button" data-clear-tree-filter>${L("清除所有筛选")}</button></div>`;
  const bodyView = trashView ? "trash" : archiveView ? "archive" : "current";
  const html = `<!doctype html><html><body data-board-view="${bodyView}">
    <div data-refresh-tree-chrome hidden>${renderTreeChrome(view, visibleGoals, archiveView, trashView, searchPlaceholder, searchLabel)}</div>
    <div data-tree-scroll>${tree}</div>
    <footer data-tree-footer><span data-tree-filter-count data-tree-suffix="${escapeHtml(collectionSuffix)}">${L("共 {count} 个{suffix}目标", { count: visibleGoals.length, suffix: collectionSuffix ? `${collectionSuffix} ` : "" })}</span><small>${collectionNote}</small></footer>
    <section data-document-pane><section data-work-surface="goal">${document}</section></section>
    ${renderCreateDialog(view)}
    <script id="goalboard-data" type="application/json">${dataJson(view)}</script>
  </body></html>`;
  return prefixLocalLinks(html, view.route_prefix);
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
  projectOperationsData?: ProjectOperationsData,
): string {
  const visibleGoals = trashView ? view.trashed_goals : archiveView ? view.archived_goals : view.goals;
  const collectionView = archiveView || trashView;
  const collectionTitle = trashView ? L("回收站") : archiveView ? L("已归档") : L("Goal Tree");
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
    view.counts.completion_blocked +
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
  const initialFeedPreset: FeedItemType = "inbox_message";
  const initialDesktopDirectory: string = decisionView ? "feed" : requestedGoalId ? "goals" : "root";
  const projectOptions = view.projects.length ? view.projects : view.project ? [view.project] : [];
  const projectOperations = renderProjectOperations(view.project
    ? { project_id: view.project.project_id, display_name: view.project.display_name }
    : null, projectOperationsData);
  const desktopAccountFooter = `<footer class="personal-sidebar-footer">
    <a class="personal-account" data-settings-link href="__SYSTEM_SETTINGS__" aria-label="${L("打开全局设置")}">
      <span class="personal-account-avatar" aria-hidden="true">${icon("user")}</span>
      <span class="personal-account-copy"><strong>${L("一骏")}</strong><small>${L("本地空间")}</small></span>
      <span class="personal-account-settings" aria-hidden="true">${icon("settings")}</span>
    </a>
  </footer>`;
  const desktopRootDirectory = `<section class="desktop-directory-panel desktop-directory-root" data-directory-panel="root"${initialDesktopDirectory === "root" ? "" : " hidden"}>
    <nav class="desktop-module-list" aria-label="${L("工作台目录")}">
      <button class="desktop-module-item desktop-module-item--inbox${decisionView ? " is-current" : ""}" type="button" data-directory-open="feed" data-work-surface-open="feed" data-feed-preset="inbox_message"${decisionView ? ' aria-current="page"' : ""}>${icon("input")}<span><strong>Inbox</strong><small>${L("只处理需要你介入的事情")}</small></span>${icon("chevron-right")}</button>
      <button class="desktop-module-item${!decisionView ? " is-current" : ""}" type="button" data-directory-open="goals" data-work-surface-open="goal"${!decisionView ? ' aria-current="page"' : ""}>${icon("target")}<span><strong>Goals</strong><small>${L("{count} 个 Goal", { count: visibleGoals.length })}</small></span>${icon("chevron-right")}</button>
      ${projectOperations.rootItems}
      <button class="desktop-module-item" type="button" data-directory-open="feed" data-work-surface-open="feed" data-feed-preset="feed">${icon("activity")}<span><strong>Feed</strong><small>${L("所有来源消息，完整保留")}</small></span>${icon("chevron-right")}</button>
      <button class="desktop-module-item" type="button" data-directory-open="sources" data-work-surface-open="sources">${icon("settings")}<span><strong>${L("来源")}</strong><small>${L("账号、接入源与拉取计划")}</small></span>${icon("chevron-right")}</button>
      <button class="desktop-module-item" type="button" data-work-surface-open="promotion">${icon("arrow")}<span><strong>Promotion</strong><small>${L("把内容升格为 Goal")}</small></span><em>${L("规划中")}</em></button>
      <button class="desktop-module-item" type="button" data-work-surface-open="visual">${icon("workflow")}<span><strong>${L("可视化工作区")}</strong><small>${L("Goal 关系与规划画布")}</small></span><em>${L("规划中")}</em></button>
    </nav>
  </section>`;
  const desktopUtilitySurface = (id: string, label: string, note: string, detail: string, iconName: GoalBoardIcon) => `<section class="desktop-work-surface desktop-utility-surface" data-work-surface="${id}" data-work-surface-label="${escapeHtml(label)}" hidden>
    <div class="desktop-utility-heading">${icon(iconName)}<div><h1>${escapeHtml(label)}</h1><p>${note}</p></div><span>${L("规划中")}</span></div>
    <div class="desktop-utility-note"><strong>${L("工作面已经留好")}</strong><p>${detail}</p></div>
  </section>`;
  const projectNavigatorLayer = `<section class="navigator-project" aria-label="${L("当前项目")}">${renderDesktopProjectChrome(view.project ?? null, projectOptions, desktopShell, view.project ? "__PROJECT_SETTINGS__" : null, { switcherClass: "desktop-project-switcher", manageHref: "__PROJECT_INDEX__", directoryToggle: true })}</section>`;
  const showTui = !decisionView && !archiveView && !trashView;
  const desktopUtilityTitle = decisionView ? "Inbox" : collectionTitle;
  const desktopTabsLabel = decisionView ? "Inbox" : L("已打开的 Goal");
  const compactNavigation = {
    tree: L("目标"),
    focus: decisionView ? L("决定") : L("聚焦"),
    runtime: L("运行"),
  };
  const desktopWorkbenchHeader = `<div class="desktop-workbench-bar">
    <div class="desktop-work-tabs" data-work-tabs role="tablist" aria-label="${escapeHtml(desktopTabsLabel)}">
      ${selected ? `<div class="desktop-work-tab is-selected" data-work-tab-shell="${escapeHtml(selected.goal.goal_id)}"><button type="button" role="tab" data-work-tab="${escapeHtml(selected.goal.goal_id)}" aria-selected="true" aria-controls="goal-document-pane"><i aria-hidden="true"></i><span>${escapeHtml(selected.goal.title)}</span></button><button type="button" data-close-work-tab="${escapeHtml(selected.goal.goal_id)}" aria-label="${L("关闭 {title}", { title: selected.goal.title })}">${icon("x")}</button></div>` : `<div class="desktop-work-tab is-selected is-utility"><span role="tab" aria-selected="true">${escapeHtml(desktopUtilityTitle)}</span></div>`}
    </div>
    <div class="desktop-titlebar-drag"${desktopShell ? " data-tauri-drag-region" : ""} aria-hidden="true"></div>
  </div>`;
  const mobileWebProjectBar = !desktopShell
    ? `<header class="mobile-project-bar" aria-label="${L("当前项目")}">${renderProjectSwitcher(view.project ?? null, projectOptions, false, "mobile-project-switcher", "__PROJECT_INDEX__")}${view.project ? `<a class="mobile-project-settings" href="__PROJECT_SETTINGS__" aria-label="${L("打开当前项目设置")}" title="${L("项目设置")}">${icon("tune")}</a>` : ""}</header>`
    : "";
  const renderedDocumentContent = selected
      ? trashView
        ? renderTrashGoalDocument(selected, true)
        : renderGoalDocument(selected, view, true)
      : trashView
        ? `<div class="archive-empty">${icon("archive")}<h1>${L("回收站是空的")}</h1><p>${L("移入回收站的 Goal 可以在这里恢复；日常 Goal Tree 不会被它们干扰。")}</p><a href="/">${L("返回 Goal Tree")}</a></div>`
        : `<div class="archive-empty">${icon("archive")}<h1>${L("还没有归档 Goal")}</h1><p>${L("已完成的 Goal 可以在正文顶部手动归档，历史事实不会被删除。")}</p><a href="/">${L("返回 Goal Tree")}</a></div>`;
  const desktopDocumentContent = `<section class="desktop-work-surface" data-work-surface="goal" data-work-surface-label="${escapeHtml(collectionTitle)}"${decisionView ? " hidden" : ""}>${renderedDocumentContent}</section>
      ${projectOperations.surfaces}
      ${renderFeedWorkbench(view, initialFeedPreset, decisionView)}
      ${renderSourceWorkbench(view)}
      ${desktopUtilitySurface("promotion", "Promotion", L("把内容升格为 Goal"), L("等候选内容、团队决策和 Goal 创建边界确认后，再在这里接入升格流程；现在不伪造待处理项。"), "arrow")}
      ${desktopUtilitySurface("visual", L("可视化工作区"), L("Goal 关系与规划画布"), L("等画布实体、关系编辑和保存契约确认后，再在这里接入真实可视化工作区。"), "workflow")}`;
  const html = `<!--
THESIS: 只有一个目录入口，项目中的多条 Goal 在右侧复用；拒绝重复侧栏、轻首页大留白和后台管理式线框。
OWN-WORLD: 石墨目录、深浅同源的柔和工作面、克制钴蓝焦点、系统字体、Lucide 图标、阴影与色面区分层级，尽量减少结构线。
STORY: 先选择项目和工作类型；Goals 展开真实 Goal Tree，Inbox / Feed 展开同一套 Item 目录，右侧阅读详情、处理来源或升格为 Goal。
FIRST VIEWPORT: 约 310px 单目录与剩余标签工作面；项目切换位于 macOS 标题栏红黄绿按钮右侧，账户和全局设置贴左下，Goal 详情连续展开，Feed 详情保留清晰阅读列和就近动作。
FORM: Operate 模式的 single-directory project-tab workbench，方向由 2026-08-29 用户确认的交互原型锁定（seed=goalboard-desktop-single-directory-project-tabs-2026-08-29）。
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
-->
<!doctype html>
<html lang="${htmlLang()}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${controlTokenMeta(controlToken)}
  <title>${escapeHtml(title)}</title>
  <script>${THEME_BOOTSTRAP_SCRIPT}</script>
  <script>if(new URLSearchParams(location.search).get("onboarding-embed")==="1"){document.documentElement.dataset.onboardingEmbed="true";document.documentElement.dataset.resolvedTheme="dark";document.documentElement.dataset.resolvedTerminalTheme="dark";}</script>
  <link rel="stylesheet" href="__WORKBENCH_CSS__">
</head>
  <body data-board-view="${decisionView ? "decisions" : trashView ? "trash" : archiveView ? "archive" : "current"}" data-route-prefix="${escapeHtml(view.route_prefix)}" data-desktop-shell="true" data-desktop-surface="${decisionView ? "feed" : "goal"}"${desktopShell ? ' data-native-desktop="true"' : ""}>
  ${renderIconSprite()}
  <div class="app">
    ${mobileWebProjectBar}
    <nav class="mobile-switch" role="tablist" aria-label="${L("移动端视图")}"><button class="${initialDesktopDirectory === "root" ? "is-active" : ""}" type="button" role="tab" aria-selected="${initialDesktopDirectory === "root"}" aria-controls="goal-tree-pane" data-mobile-directory-root data-directory-open="root">${icon("panel")}<span>${L("目录")}</span></button><button class="${initialDesktopDirectory === "root" ? "" : "is-active"}" type="button" role="tab" aria-selected="${initialDesktopDirectory !== "root"}" aria-controls="goal-tree-pane" data-mobile-target="tree">${compactNavigation.tree}</button><button type="button" role="tab" aria-selected="false" aria-controls="goal-document-pane" data-mobile-target="document">${compactNavigation.focus}</button>${showTui ? `<button type="button" role="tab" aria-selected="false" aria-controls="goal-tui-pane" data-mobile-target="tui">${compactNavigation.runtime}</button>` : ""}</nav>
    <main class="workspace${showTui ? " is-desktop-tui" : ""}" data-workspace data-mobile-view="tree" data-workspace-mode="focus">
      <aside class="tree-pane" id="goal-tree-pane" data-desktop-directory="${initialDesktopDirectory}">
        ${projectNavigatorLayer}
        ${desktopRootDirectory}
        <section class="desktop-directory-panel desktop-goal-directory" data-directory-panel="goals"${initialDesktopDirectory === "goals" ? "" : " hidden"}>
          <header class="desktop-directory-heading"><button type="button" data-directory-back aria-label="${L("返回上一级")}">${icon("back")}</button><span><strong>${collectionTitle === L("Goal Tree") ? "Goals" : collectionTitle}</strong><small>${collectionView ? collectionNote : L("Goal Tree")}</small></span></header>
          ${renderTreeChrome(view, visibleGoals, archiveView, trashView, searchPlaceholder, searchLabel)}
          <div class="tree-scroll" data-tree-scroll tabindex="0" aria-label="${collectionTitle} ${L("目标列表")}"><div class="goal-list-view" data-goal-list-view>${renderGoalTree(view, selectedId, visibleGoals)}<div class="tree-filter-empty" data-tree-filter-empty hidden><p>${L("没有符合当前筛选条件的 Goal。")}</p><button type="button" data-clear-tree-filter>${L("清除所有筛选")}</button></div></div></div>
          <footer class="tree-footer" data-tree-footer><span data-tree-filter-count data-tree-suffix="${escapeHtml(collectionSuffix)}">${L("共 {count} 个{suffix}目标", { count: visibleGoals.length, suffix: collectionSuffix ? `${collectionSuffix} ` : "" })}</span><small>${collectionNote}</small></footer>
        </section>
        ${projectOperations.directories}
        ${renderFeedDirectory(view, initialFeedPreset)}
        ${renderSourceDirectory(view)}
        ${desktopAccountFooter}
      </aside>
      <div class="tree-resizer" role="separator" aria-label="${L("调整 Goal Tree 宽度")}" aria-orientation="vertical" aria-valuemin="260" aria-valuemax="520" aria-valuenow="320" tabindex="0" data-tree-resizer></div>
      <header class="workbench-header desktop-pane-header">
        ${desktopWorkbenchHeader}
      </header>
      <section class="document-pane" id="goal-document-pane" data-document-pane role="tabpanel" tabindex="0"${selected ? "" : ` aria-label="${escapeHtml(desktopUtilityTitle)}"`}>
        ${desktopDocumentContent}
      </section>
      ${renderFeedOverlays(view)}
      ${!archiveView && !trashView ? `<section class="goal-momentum" id="goal-momentum-pane" data-goal-momentum data-loaded="false" hidden aria-label="${L("Goal 推进态势")}"><p class="empty-row momentum-lazy-status" data-goal-momentum-status role="status">${L("打开推进态势时载入")}</p><button type="button" data-retry-goal-momentum hidden>${L("重试")}</button></section>` : ""}
      ${showTui ? renderTuiPane(selected, view, cliAvailability) : ""}
    </main>
  </div>
  ${renderCreateDialog(view)}
  ${renderGoalTrashDialog()}
  ${projectOperations.overlays}
  <div class="toast" data-toast role="status" aria-live="polite"></div>
  <script id="goalboard-data" type="application/json">${dataJson(view)}</script>
  <script>${clientI18nScript()}</script>
  <script src="/assets/goalboard-workbench.js"></script>
  ${showTui ? '<script src="/desktop/pty-client.js"></script>' : ""}
</body>
</html>`;
  return prefixLocalLinks(html, view.route_prefix, desktopShell);
}

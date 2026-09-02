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
} from "@adeptify/goalboard-module-goals";
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
} from "@adeptify/goalboard-app-desktop";
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
} from "@adeptify/goalboard-design-system";
import {
  CLIENT_SCRIPT,
  CONTROL_CLIENT_SCRIPT,
  MORE_STYLES,
  ONBOARDING_CLIENT_SCRIPT,
  PROJECT_GUIDANCE_CLIENT_SCRIPT,
  PROJECT_GUIDANCE_SETTINGS_STYLES,
  PROJECT_INDEX_CLIENT_SCRIPT,
  PROJECT_INDEX_STYLES,
  PROJECT_RULES_CLIENT_SCRIPT,
  PROJECT_RULES_SETTINGS_STYLES,
  RESPONSIVE_STYLES,
  SETTINGS_CLIENT_SCRIPT,
  SETTINGS_STYLES,
  STYLES,
  createWorkbenchExecutionValidationRenderer,
  EXECUTION_EVIDENCE_KIND_LABELS as EVIDENCE_KIND_LABELS,
  EXECUTION_EVIDENCE_RESULT_LABELS as EVIDENCE_RESULT_LABELS,
  renderWorkbenchDocument,
} from "@adeptify/goalboard-app-workbench";
export { WORK_TAB_VISIBILITY_CLIENT_SCRIPT } from "@adeptify/goalboard-app-workbench";
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
} from "@adeptify/goalboard-module-goals";
import type {
  FeedItemRecord,
  FeedItemType,
  FeedSnapshot,
  InboxEntryRecord,
  RelayImportAvailability,
} from "../feed/types.js";
import type { FeedSourceCatalogView } from "../feed/sources/service.js";
import type { ConnectorAuthStatus } from "../feed/connectors/service.js";
import {
  PROJECT_OPERATIONS_CLIENT_SCRIPT,
  PROJECT_OPERATIONS_STYLES,
  renderProjectOperations,
  type ProjectOperationsData,
} from "./project-session-workspaces.js";
import {
  renderFeedNativePluginPersistedDetail,
  renderFeedNativePluginSurface,
  type FeedSupplementalEntry,
} from "./feed-native-plugin-ui.js";
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

const {
  renderClaimCell,
  renderRunCell,
  renderEvidenceForm,
  renderEvidenceCell,
  renderReviewCell,
} = createWorkbenchExecutionValidationRenderer({
  translate: L,
  escapeHtml,
  formatDate,
  renderIcon: (name) => icon(name as GoalBoardIcon),
  renderReference,
  isProjectReference,
  currentLocale,
});

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

function decisionGroupCount(group: DecisionGoalGroup): number {
  return group.goalTreeProposals.length + group.contractProposals.length + group.candidates.length +
    group.rewires.length + group.risks.length + (group.humanReview ? 1 : 0);
}

function renderFeedDecisionGroupDetail(
  group: DecisionGoalGroup,
  view: GoalBoardWebView,
  goalId: string,
  title: string,
  summary: string,
  updatedAt: string,
): string {
  const count = decisionGroupCount(group);
  return `<article class="feed-detail feed-detail--decision" data-feed-detail="decision:${escapeHtml(goalId)}">
    <header class="feed-detail-header"><div class="feed-detail-kicker"><span>Inbox Message</span><span>${L("Goal 决定")}</span><span>${L("待处理")}</span></div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(summary)}</p><div class="feed-detail-meta"><span>${icon("workflow")}GoalBoard</span><time datetime="${escapeHtml(updatedAt)}">${formatDate(updatedAt)}</time></div></header>
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

export function renderPersistedFeedItemDetail(
  item: FeedItemRecord,
  routePrefix = "",
  options: { entryId?: string; inboxActive?: boolean; inboxEntry?: InboxEntryRecord | null } = {},
): string {
  return renderFeedNativePluginPersistedDetail(item, routePrefix, options);
}

export function renderFeedWorkbenchFragment(
  view: GoalBoardWebView,
  defaultPreset: FeedItemType,
): string {
  return prefixLocalLinks(renderFeedNativePluginSurface(
    view,
    "workbench-fragment",
    defaultPreset,
    feedNativePluginSupplementalEntries(view),
    true,
  ), view.route_prefix);
}

export function countGoalDecisions(view: GoalBoardWebView, goalId: string): number {
  const group = buildDecisionGroups(view).find((item) => item.item?.goal.goal_id === goalId);
  if (!group) return 0;
  return group.goalTreeProposals.length + group.contractProposals.length + group.candidates.length + group.rewires.length + group.risks.length + (group.humanReview ? 1 : 0);
}

function feedNativePluginSupplementalEntries(view: GoalBoardWebView): FeedSupplementalEntry[] {
  const decisionGroups = buildDecisionGroups(view);
  const decisions = decisionGroups.map((group): FeedSupplementalEntry => {
    const goalId = group.item?.goal.goal_id ?? group.ownerGoalId ?? "board";
    const title = group.item?.goal.title ?? L("整个项目的事项");
    const count = decisionGroupCount(group);
    const inboxEntry = goalId === "board" ? null : view.feed.inbox_entries.find((entry) =>
      entry.subject_type === "goal_decision" && entry.subject_id === goalId &&
      (entry.status === "open" || entry.status === "in_progress"),
    ) ?? null;
    return {
      entry_id: `decision:${goalId}`,
      item_id: null,
      inbox_entry: inboxEntry ? { ...inboxEntry, project_id: inboxEntry.board_id } : null,
      item: null,
      preset: "inbox_message",
      provider: "other",
      kind_label: L("Inbox Message · Goal 决定"),
      source_label: "GoalBoard",
      disposition: "inbox",
      title,
      summary: L("{count} 项等待你判断。", { count }),
      updated_at: group.item?.goal.updated_at ?? view.events[0]?.at ?? "",
      read: true,
      attention_rank: 3,
      detail_slot_html: renderFeedDecisionGroupDetail(
        group,
        view,
        goalId,
        title,
        L("{count} 项等待你判断。", { count }),
        group.item?.goal.updated_at ?? view.events[0]?.at ?? "",
      ),
    };
  });
  const results = recentDecisionResults(view).map((result): FeedSupplementalEntry => ({
    entry_id: `result:${result.event.event_id}`,
    item_id: null,
    inbox_entry: null,
    item: null,
    preset: "inbox_message",
    provider: "other",
    kind_label: L("Inbox Message · 处理结果"),
    source_label: "GoalBoard",
    disposition: "saved",
    title: result.title,
    summary: result.effects.join(currentLocale() === "en" ? " " : "；"),
    updated_at: result.event.at,
    read: true,
    attention_rank: 1,
    detail_slot_html: `<article class="feed-detail feed-detail--result" data-feed-detail="result:${escapeHtml(result.event.event_id)}"><header class="feed-detail-header"><div class="feed-detail-kicker"><span>Inbox Message</span><span>${escapeHtml(result.kindLabel)}</span><span>${escapeHtml(result.state)}</span></div><h1>${escapeHtml(result.title)}</h1><p>${escapeHtml(result.effects.join(currentLocale() === "en" ? " " : "；"))}</p><div class="feed-detail-meta"><span>${icon("workflow")}GoalBoard</span><time datetime="${escapeHtml(result.event.at)}">${formatDate(result.event.at)}</time></div></header><section class="decision-results feed-result-record" aria-label="${L("最近处理结果")}"><article class="decision-result decision-result--${result.kind}"><span class="decision-result-icon">${icon(result.kind === "risk" ? "risk" : result.kind === "rewire" ? "link" : result.kind === "review" ? "user" : result.kind === "candidate" ? "plus" : result.kind === "goalTree" ? "tree" : "clipboard")}</span><div class="decision-result-copy"><div><span>${escapeHtml(result.kindLabel)}</span><strong>${escapeHtml(result.state)}</strong><time datetime="${escapeHtml(result.event.at)}">${formatDate(result.event.at)}</time></div><h3>${escapeHtml(result.title)}</h3>${result.effects.map((effect) => `<p>${escapeHtml(effect)}</p>`).join("")}<small>${escapeHtml(result.reasonLabel ? `${result.reasonLabel}：${result.reason ?? result.event.reason}` : L("你的理由：{reason}", { reason: result.reason ?? result.event.reason }))}</small></div>${result.links.length ? `<div class="decision-result-links">${result.links.map((link) => `<a href="${link.href}">${escapeHtml(link.label)}${icon("chevron-right")}</a>`).join("")}</div>` : ""}</article></section></article>`,
  }));
  return [...decisions, ...results];
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
  const feedSupplementalEntries = feedNativePluginSupplementalEntries(view);
  const desktopDocumentContent = `<section class="desktop-work-surface" data-work-surface="goal" data-work-surface-label="${escapeHtml(collectionTitle)}"${decisionView ? " hidden" : ""}>${renderedDocumentContent}</section>
      ${projectOperations.surfaces}
      ${renderFeedNativePluginSurface(view, "workbench", initialFeedPreset, feedSupplementalEntries, decisionView)}
      ${renderFeedNativePluginSurface(view, "source-workbench", initialFeedPreset)}
      ${desktopUtilitySurface("promotion", "Promotion", L("把内容升格为 Goal"), L("等候选内容、团队决策和 Goal 创建边界确认后，再在这里接入升格流程；现在不伪造待处理项。"), "arrow")}
      ${desktopUtilitySurface("visual", L("可视化工作区"), L("Goal 关系与规划画布"), L("等画布实体、关系编辑和保存契约确认后，再在这里接入真实可视化工作区。"), "workflow")}`;
  const html = renderWorkbenchDocument({
    preamble_html: `<!--
THESIS: 只有一个目录入口，项目中的多条 Goal 在右侧复用；拒绝重复侧栏、轻首页大留白和后台管理式线框。
OWN-WORLD: 石墨目录、深浅同源的柔和工作面、克制钴蓝焦点、系统字体、Lucide 图标、阴影与色面区分层级，尽量减少结构线。
STORY: 先选择项目和工作类型；Goals 展开真实 Goal Tree，Inbox / Feed 展开同一套 Item 目录，右侧阅读详情、处理来源或升格为 Goal。
FIRST VIEWPORT: 约 310px 单目录与剩余标签工作面；项目切换位于 macOS 标题栏红黄绿按钮右侧，账户和全局设置贴左下，Goal 详情连续展开，Feed 详情保留清晰阅读列和就近动作。
FORM: Operate 模式的 single-directory project-tab workbench，方向由 2026-08-29 用户确认的交互原型锁定（seed=goalboard-desktop-single-directory-project-tabs-2026-08-29）。
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
-->\n`,
    lang: htmlLang(),
    title,
    head_before_title_html: controlTokenMeta(controlToken),
    head_html: `<script>${THEME_BOOTSTRAP_SCRIPT}</script>
  <script>if(new URLSearchParams(location.search).get("onboarding-embed")==="1"){document.documentElement.dataset.onboardingEmbed="true";document.documentElement.dataset.resolvedTheme="dark";document.documentElement.dataset.resolvedTerminalTheme="dark";}</script>
  <link rel="stylesheet" href="__WORKBENCH_CSS__">`,
    body_attributes: {
      "data-board-view": decisionView ? "decisions" : trashView ? "trash" : archiveView ? "archive" : "current",
      "data-route-prefix": view.route_prefix,
      "data-desktop-shell": "true",
      "data-desktop-surface": decisionView ? "feed" : "goal",
      "data-native-desktop": desktopShell ? "true" : null,
    },
    body_html: `
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
        ${renderFeedNativePluginSurface(view, "directory", initialFeedPreset, feedSupplementalEntries)}
        ${renderFeedNativePluginSurface(view, "source-directory", initialFeedPreset)}
        ${desktopAccountFooter}
      </aside>
      <div class="tree-resizer" role="separator" aria-label="${L("调整 Goal Tree 宽度")}" aria-orientation="vertical" aria-valuemin="260" aria-valuemax="520" aria-valuenow="320" tabindex="0" data-tree-resizer></div>
      <header class="workbench-header desktop-pane-header">
        ${desktopWorkbenchHeader}
      </header>
      <section class="document-pane" id="goal-document-pane" data-document-pane role="tabpanel" tabindex="0"${selected ? "" : ` aria-label="${escapeHtml(desktopUtilityTitle)}"`}>
        ${desktopDocumentContent}
      </section>
      ${renderFeedNativePluginSurface(view, "overlays", initialFeedPreset)}
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
  ${showTui ? '<script src="/desktop/pty-client.js"></script>' : ""}`,
  });
  return prefixLocalLinks(html, view.route_prefix, desktopShell);
}

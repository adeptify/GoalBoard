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
import { icon, renderIconSprite, type GoalBoardIcon } from "./icons.js";

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

function dataJson(view: GoalBoardWebView): string {
  return JSON.stringify(view).replaceAll("<", "\\u003c");
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
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
  return `<button class="inline-ref" type="button" data-copy-value="${escapeHtml(value)}" title="复制引用">${icon("copy")}<span>${escapeHtml(label)}</span></button>`;
}

function renderList(values: string[], empty: string): string {
  if (values.length === 0) return `<p class="empty-row">${escapeHtml(empty)}</p>`;
  return `<ul class="doc-list">${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>`;
}

function renderStatus(status: WebGoalStatus): string {
  return `<span class="goal-status goal-status--${status}">${icon(STATUS_ICONS[status])}<span>${STATUS_LABELS[status]}</span></span>`;
}

function sortGoals(items: WebGoalView[]): WebGoalView[] {
  return [...items].sort(
    (left, right) =>
      right.goal.priority - left.goal.priority ||
      left.goal.created_at.localeCompare(right.goal.created_at),
  );
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
    const searchValue = (item.goal.goal_id + " " + item.goal.title).toLowerCase();
    return `<li class="tree-item${depth > 0 ? "" : " tree-item--root"}" data-tree-item data-goal-id="${escapeHtml(item.goal.goal_id)}" data-goal-search="${escapeHtml(searchValue)}" data-goal-status="${escapeHtml(item.status)}">
      <div class="tree-row">
        ${
          hasChildren
            ? `<button class="tree-toggle" type="button" data-tree-toggle aria-expanded="true" aria-label="折叠 ${escapeHtml(item.goal.title)}">${icon("chevron-down")}</button>`
            : `<span class="tree-guide" aria-hidden="true"></span>`
        }
        <button class="tree-node${item.goal.goal_id === selectedGoalId ? " is-selected" : ""}" type="button" data-select-goal="${escapeHtml(item.goal.goal_id)}" aria-pressed="${item.goal.goal_id === selectedGoalId}">
          <span class="tree-copy"><strong>${escapeHtml(item.goal.title)}</strong><small>${escapeHtml(item.goal.goal_id)}</small></span>
          ${renderStatus(item.status)}
        </button>
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

function renderTreeStatusFilter(items: WebGoalView[]): string {
  const counts = new Map<WebGoalStatus, number>();
  for (const item of items) counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
  const options = WEB_GOAL_STATUSES.filter((status) => (counts.get(status) ?? 0) > 0);
  return `<section class="tree-filter" id="tree-status-filter" data-tree-filter hidden aria-label="按状态筛选">
    <header><strong>按状态筛选</strong><button type="button" data-clear-status-filter disabled>清除</button></header>
    <p>可同时选择多个状态；会与关键词搜索一起生效。</p>
    <div class="tree-filter-options" role="group" aria-label="Goal 状态">
      ${options.length ? options.map((status) => `<label class="tree-filter-option"><input type="checkbox" value="${status}" data-status-filter><span>${renderStatus(status)}</span><small>${counts.get(status)}</small></label>`).join("") : `<p class="empty-row">当前没有可筛选的 Goal。</p>`}
    </div>
    <p class="tree-filter-summary" data-tree-filter-summary aria-live="polite">显示全部状态</p>
  </section>`;
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
  const labels = RELATION_LABELS[relation.type] ?? { out: relation.type, in: relation.type };
  const path = outgoing
    ? `当前 Goal → ${labels.out} → ${relatedName}`
    : `${relatedName} → ${labels.out} → 当前 Goal`;
  const deactivated = item.events.find(
    (event) => event.type === "relation.deactivated" && event.object_id === relation.relation_id,
  );
  const stateLabel = relation.state === "active" ? "生效" : relation.state === "proposed" ? "待确认" : "已解除";
  const deactivateId = `relation-deactivate-${relation.relation_id}`;
  return `<div class="relation-record relation-record--${escapeHtml(relation.state)}" data-relation-id="${escapeHtml(relation.relation_id)}">
    <button class="relation-row" type="button" data-select-goal="${escapeHtml(relatedId)}" aria-label="打开 ${escapeHtml(relatedName)}">
      <span class="relation-kind">${escapeHtml(outgoing ? labels.out : labels.in)}</span>
      <span class="relation-copy"><strong>${escapeHtml(relatedName)}</strong><small class="relation-goal-id">${escapeHtml(relatedId)}</small><small class="relation-path">${escapeHtml(path)}</small><small class="relation-reason">建立原因：${escapeHtml(relation.reason)}${deactivated ? ` · 解除原因：${escapeHtml(deactivated.reason)}` : ""}</small></span>
      <span class="relation-state relation-state--${escapeHtml(relation.state)}">${escapeHtml(stateLabel)}</span>
      ${icon("chevron-right")}
    </button>
    ${relation.state === "active" && !item.goal.archived_at ? `<button class="relation-deactivate-open" type="button" data-relation-deactivate-open aria-expanded="false" aria-controls="${escapeHtml(deactivateId)}">解除</button>` : ""}
    ${relation.state === "active" && !item.goal.archived_at ? `<form class="relation-deactivate-form" id="${escapeHtml(deactivateId)}" data-relation-deactivate-form data-live-form="relation-deactivate-${escapeHtml(relation.relation_id)}" data-relation-id="${escapeHtml(relation.relation_id)}" hidden>
      <label><span>解除原因</span><textarea name="reason" rows="2" required placeholder="说明为什么这条关系不再成立；历史记录会保留"></textarea></label>
      <p class="form-error" data-relation-deactivate-error role="alert" hidden></p>
      <footer><button type="button" data-relation-deactivate-cancel>取消</button><button class="button-danger" type="submit">确认解除</button></footer>
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
  return `<section class="relation-group"><header><h3>${escapeHtml(title)} <span>${relations.length}</span></h3><p>${escapeHtml(hint)}</p></header><div>${
    relations.length
      ? relations.map((relation) => relationRow(relation, item, view)).join("")
      : '<p class="empty-row">暂无关系</p>'
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
  ${inactive.length ? `<details class="relation-inactive-history" data-persist-open="inactive-relations-${escapeHtml(item.goal.goal_id)}"><summary><span>${icon("history")}<strong>已解除关系</strong><small>${inactive.length} 条，保留方向与变更原因</small></span>${icon("chevron-down")}</summary><div>${inactive.map((relation) => relationRow(relation, item, view)).join("")}</div></details>` : ""}
  ${renderResolvedDependencyHistory(item, view)}`;
}

function renderRelationEditor(item: WebGoalView, view: GoalBoardWebView): string {
  if (item.goal.archived_at) return "";
  const targets = sortGoals(view.goals).filter(
    (candidate) => candidate.goal.goal_id !== item.goal.goal_id,
  );
  const editorKey = `relation-editor-${item.goal.goal_id}`;
  if (!targets.length) {
    return `<div class="relation-editor-empty">${icon("link")}<span><strong>还没有可关联的其他 Goal</strong><small>先新建另一个 Goal，再回来建立层级、依赖或语义关系。</small></span></div>`;
  }
  const targetOptions = targets
    .map(
      (target) =>
        `<option value="${escapeHtml(target.goal.goal_id)}" data-goal-name="${escapeHtml(target.goal.title)}">${escapeHtml(target.goal.title)} · ${escapeHtml(target.goal.goal_id)}</option>`,
    )
    .join("");
  const typeOptions = RELATION_TYPES.map(({ type, label, description }) => {
    const labels = RELATION_LABELS[type];
    return `<option value="${escapeHtml(type)}" data-out-label="${escapeHtml(labels.out)}" data-in-label="${escapeHtml(labels.in)}" data-description="${escapeHtml(description)}">${escapeHtml(label)}</option>`;
  }).join("");
  const firstTarget = targets[0]!.goal;
  return `<details class="relation-editor" data-relation-editor data-persist-open="${escapeHtml(editorKey)}" data-live-form="${escapeHtml(editorKey)}">
    <summary><span class="relation-editor-icon">${icon("link")}</span><span><strong>维护关系</strong><small>新增关系，或在上方解除已有关系</small></span><span class="relation-editor-action">打开编辑器</span>${icon("chevron-down")}</summary>
    <form class="relation-form" data-relation-form data-live-form="relation-${escapeHtml(item.goal.goal_id)}" data-goal-id="${escapeHtml(item.goal.goal_id)}" data-current-goal-name="${escapeHtml(item.goal.title)}">
      <div class="relation-authority"><span>${icon("shield")}</span><p><strong>这是用户确认入口</strong><small>你在这里提交的关系会直接生效；Runtime 发现的变化仍只能提交 Rewire，并在<a href="/decisions">决定中心</a>等待你确认。</small></p></div>
      <fieldset class="relation-direction-control"><legend>关系从哪里发出</legend><div><label><input type="radio" name="direction" value="outgoing" checked><span><strong>当前 Goal → 其他 Goal</strong><small>当前 Goal 是关系左侧</small></span></label><label><input type="radio" name="direction" value="incoming"><span><strong>其他 Goal → 当前 Goal</strong><small>当前 Goal 是关系右侧</small></span></label></div></fieldset>
      <div class="relation-builder">
        <label><span>关系类型</span><select name="type">${typeOptions}</select></label>
        <label><span>另一个 Goal</span><select name="target_goal_id">${targetOptions}</select></label>
      </div>
      <div class="relation-live-preview" data-relation-live-preview><small>方向预览</small><strong>${escapeHtml(item.goal.title)} <span>→ 属于 →</span> ${escapeHtml(firstTarget.title)}</strong><p>只改变 Goal Tree 层级，不要求上级先完成</p></div>
      <label class="relation-reason-field"><span>建立原因</span><textarea name="reason" rows="3" required placeholder="说明为什么方向是 A → B，而不是 B → A；这个理由会进入关系历史"></textarea></label>
      <p class="form-error" data-relation-error role="alert" hidden></p>
      <footer><p>提交后直接生效并写入事件历史；不会创建或启动 Runtime。</p><button class="button-primary" type="submit">建立关系</button></footer>
    </form>
  </details>`;
}

function renderClaimCell(item: WebGoalView): string {
  const claim = item.active_claim ?? item.claims.at(-1);
  if (!claim) return '<p class="empty-row">尚未被 Runtime 认领</p>';
  return `<dl class="runtime-facts"><div><dt>Runtime</dt><dd>${escapeHtml(claim.actor_id)}</dd></div><div><dt>角色</dt><dd>${escapeHtml(claim.role)}</dd></div><div><dt>状态</dt><dd>${escapeHtml(claim.state)}</dd></div><div><dt>Goal Mode</dt><dd>${claim.goal_mode_attestation ? "已开启" : "未开启"}</dd></div></dl>`;
}

function renderRunCell(item: WebGoalView): string {
  const run = item.runs.at(-1);
  if (!run) return '<p class="empty-row">认领后可开始执行</p>';
  return `<dl class="runtime-facts"><div><dt>Run</dt><dd>${escapeHtml(run.run_id)}</dd></div><div><dt>状态</dt><dd>${escapeHtml(run.state)}</dd></div><div><dt>开始</dt><dd>${formatDate(run.started_at)}</dd></div>${
    run.block_reason ? `<div><dt>阻塞</dt><dd>${escapeHtml(run.block_reason)}</dd></div>` : ""
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
    <div><header><strong>${escapeHtml(EVIDENCE_KIND_LABELS[evidence.kind])} · ${escapeHtml(EVIDENCE_RESULT_LABELS[evidence.result])}</strong><button class="record-id" type="button" data-copy-value="${escapeHtml(evidence.evidence_id)}" title="复制 Evidence ID">${escapeHtml(evidence.evidence_id)}</button></header>${renderReference(evidence.locator)}<small>${escapeHtml(evidence.producer_actor_id)} · ${formatDate(evidence.captured_at)} · ${escapeHtml(evidence.criterion_ids.join("、") || "未绑定验收项")}</small>${evidence.digest ? `<p>${escapeHtml(evidence.digest)}</p>` : ""}</div>
  </article>`;
}

function renderEvidenceSubmitForm(item: WebGoalView): string {
  const criteria = item.goal.acceptance_criteria;
  if (item.goal.archived_at || item.goal.trashed_at) return "";
  if (!criteria.length) {
    return '<p class="evidence-submit-note">这条 Goal 还没有验收条件，无法绑定人工 Evidence。请先通过当前 Runtime 或 Draft 流程补齐 Contract。</p>';
  }
  const criterionChoices = criteria
    .map(
      (criterion) =>
        `<label><input type="checkbox" name="criterion_ids" value="${escapeHtml(criterion.criterion_id)}"><span><strong>${escapeHtml(criterion.statement)}</strong><small>${escapeHtml(criterion.criterion_id)}</small></span></label>`,
    )
    .join("");
  const kindChoices = (Object.entries(EVIDENCE_KIND_LABELS) as Array<[EvidenceRecord["kind"], string]>)
    .map(([kind, label]) => `<option value="${kind}"${kind === "attestation" ? " selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");
  const resultChoices = (Object.entries(EVIDENCE_RESULT_LABELS) as Array<[EvidenceRecord["result"], string]>)
    .map(([result, label]) => `<option value="${result}"${result === "passed" ? " selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");
  return `<details class="evidence-submit" data-persist-open="evidence-submit-${escapeHtml(item.goal.goal_id)}"><summary><span>${icon("evidence")}<strong>提交人工 Evidence</strong><small>用户直接记录的验收事实会进入同一完成门禁</small></span>${icon("chevron-down")}</summary>
    <form data-evidence-form data-live-form="evidence-${escapeHtml(item.goal.goal_id)}" data-goal-id="${escapeHtml(item.goal.goal_id)}">
      <fieldset class="evidence-criteria"><legend>绑定验收条件</legend><div>${criterionChoices}</div></fieldset>
      <div class="evidence-form-row"><label><span>Evidence 类型</span><select name="kind">${kindChoices}</select></label><label><span>本次结果</span><select name="result">${resultChoices}</select></label></div>
      <label><span>定位引用</span><textarea name="locator" rows="2" required placeholder="https://…、project://src/… 或项目内相对路径"></textarea><small>HTTP(S) 和安全的项目内相对路径可打开；其他引用会保留为可复制文本。</small></label>
      <label><span>补充说明 <small>可选</small></span><textarea name="digest" rows="2" placeholder="说明观察到的事实、版本或可复核线索"></textarea></label>
      <p class="form-error" data-evidence-error role="alert" hidden></p>
      <footer><span>这条 Evidence 由当前 Web 用户提交，不会伪造 Runtime Run。</span><button class="button-primary" type="submit">提交 Evidence</button></footer>
    </form>
  </details>`;
}

function renderEvidenceCell(item: WebGoalView): string {
  const records = item.evidence.length
    ? `<div class="evidence-list">${item.evidence.slice().reverse().map(renderEvidenceRecord).join("")}</div>`
    : '<p class="empty-row">尚未提交验收证据</p>';
  return `${records}${renderEvidenceSubmitForm(item)}`;
}

function renderReviewCell(item: WebGoalView): string {
  if (!item.review_obligations.length) return '<p class="empty-row">当前策略不要求额外 Review</p>';
  return `<div class="review-list">${item.review_obligations
    .map((obligation) => {
      const latest = item.reviews
        .filter((review) => review.obligation_id === obligation.obligation_id)
        .at(-1);
      const detail = latest
        ? latest.verdict + " · " + latest.actor_id
        : obligation.state === "waived"
          ? "已豁免"
          : "等待提交";
      return `<div class="review-row"><span class="review-state review-state--${obligation.state}"></span><span><strong>${escapeHtml(REVIEW_LABELS[obligation.role] ?? obligation.role)}</strong><small>${escapeHtml(detail)}</small></span></div>`;
    })
    .join("")}</div>`;
}

function renderAcceptance(item: WebGoalView): string {
  if (!item.goal.acceptance_criteria.length) {
    return '<p class="empty-row empty-row--warning">还没有验收条件；这个 Goal 需要继续澄清，暂不能交给执行者。</p>';
  }
  return `<ul class="check-list">${item.goal.acceptance_criteria
    .map((criterion) => {
      const passed = item.passed_criteria.includes(criterion.criterion_id);
      const target = criterion.target == null
        ? "未设置目标值"
        : Object.keys(criterion.target).length === 1 && "value" in criterion.target
          ? String(criterion.target.value)
          : JSON.stringify(criterion.target);
      return `<li><span class="check-box${passed ? " is-checked" : ""}">${passed ? icon("check") : ""}</span><span><strong>${escapeHtml(criterion.statement)}</strong><small>通过条件：${escapeHtml(criterion.pass_condition)}</small><small>判断：${escapeHtml(criterion.decision_method)} · 目标：${escapeHtml(target)} · 证据：${escapeHtml(criterion.required_evidence.join("、") || "未指定")}</small></span></li>`;
    })
    .join("")}</ul>`;
}

function renderReasons(item: WebGoalView): string {
  const blockers = item.reasons.filter((reason) => reason.severity === "blocker");
  if (!blockers.length) {
    return `<p class="clear-row"><span class="check-box is-checked">${icon("check")}</span>当前没有阻塞项</p>`;
  }
  return `<ul class="blocker-list">${blockers
    .map(
      (reason) =>
        `<li>${icon("blocked")}<span><strong>${escapeHtml(reason.message)}</strong>${
          reason.remediation ? `<small>建议：${escapeHtml(reason.remediation)}</small>` : ""
        }</span></li>`,
    )
    .join("")}</ul>`;
}

function renderScope(item: WebGoalView): string {
  return `<div class="contract-list">
    <section><h3>包含什么</h3>${renderList(item.goal.in_scope, "尚未记录范围")}</section>
    <section><h3>明确不做</h3>${renderList(item.goal.out_of_scope, "尚未记录非目标")}</section>
    <section><h3>必须遵守</h3>${renderList(item.goal.constraints, "暂无额外约束")}</section>
    <section><h3>需要的输入</h3>${renderList(item.goal.required_inputs, "暂无前置输入")}</section>
    <section><h3>承诺的输出</h3>${renderList(item.goal.promised_outputs, "尚未记录输出")}</section>
    <section><h3>绑定资料</h3>${
      item.input_bindings.length
        ? `<div class="bound-list">${item.input_bindings.map((binding) => `<article>${renderReference(binding.source_ref, binding.input_name)}<small>${escapeHtml(binding.state)} · ${escapeHtml(binding.reason)}${binding.snapshot_digest ? ` · ${escapeHtml(binding.snapshot_digest)}` : ""}</small></article>`).join("")}</div>`
        : '<p class="empty-row">暂无资料绑定</p>'
    }</section>
    <section><h3>需求覆盖</h3>${
      item.coverage.length
        ? `<div class="bound-list">${item.coverage.map((coverage) => `<article><strong>${escapeHtml(coverage.requirement_id)} · ${escapeHtml(coverage.statement)}</strong><small>${escapeHtml(coverage.disposition)} · ${coverage.blocking ? "阻塞" : "非阻塞"}${coverage.reason ? ` · ${escapeHtml(coverage.reason)}` : ""}${coverage.revisit_condition ? ` · 复查：${escapeHtml(coverage.revisit_condition)}` : ""}</small></article>`).join("")}</div>`
        : '<p class="empty-row">暂无需求覆盖记录</p>'
    }</section>
  </div>`;
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
      ? "当前不再使 Goal 失效；若此前触发，关联 Goal 必须重新验证。"
      : "当前状态不再施加领取或完成门禁。";
  }
  if (blockingMode === "claim") return "当前会阻止所有关联 Goal 被新的 Runtime 领取。";
  if (blockingMode === "completion") return "当前会阻止所有关联 Goal 被标记为完成。";
  if (blockingMode === "invalidate_on_trigger") {
    return state === "triggered"
      ? "Risk 已触发，所有关联 Goal 立即失效。"
      : "Risk 目前开放；一旦标记为已触发，所有关联 Goal 会失效。";
  }
  return "这是一条持续观察的事实，不直接阻塞领取或完成。";
}

function riskSelectOptions<T extends string>(
  values: Array<[T, string]>,
  selected: T,
): string {
  return values
    .map(([value, label]) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`)
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
    <summary><span><strong>受影响 Goal</strong><small>${selected.size} 个已选择 · 至少选择一个</small></span>${icon("chevron-down")}</summary>
    <div><label class="risk-goal-search">${icon("search")}<input type="search" data-risk-goal-filter placeholder="按名称或 ID 筛选" aria-label="筛选${escapeHtml(label)}的受影响 Goal"></label>
      <div class="risk-goal-options">${goals.map((item) => `<label data-risk-goal-option data-search="${escapeHtml(`${item.goal.title} ${item.goal.goal_id}`.toLocaleLowerCase())}"><input type="checkbox" name="goal_ids" value="${escapeHtml(item.goal.goal_id)}"${selected.has(item.goal.goal_id) ? " checked" : ""}><span><strong>${escapeHtml(item.goal.title)}</strong><small>${escapeHtml(item.goal.goal_id)}${item.goal.archived_at ? " · 已归档" : ""}</small></span></label>`).join("")}</div>
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
  return `<label class="risk-form-wide"><span>风险描述</span><textarea name="description" rows="2" required placeholder="什么可能使 Goal 无法按 Contract 完成">${escapeHtml(risk?.description ?? "")}</textarea></label>
    <label><span>发生概率</span><input name="probability" required value="${escapeHtml(risk?.probability ?? "")}" placeholder="低 / 中 / 高，或量化概率"></label>
    <label><span>影响程度</span><input name="impact" required value="${escapeHtml(risk?.impact ?? "")}" placeholder="低 / 中 / 高，或具体影响"></label>
    <label class="risk-form-wide"><span>受影响区域 <small>每行一项</small></span><textarea name="affected_surfaces" rows="2" placeholder="例如 src/web 或 onboarding-flow">${escapeHtml(risk?.affected_surfaces.join("\n") ?? "")}</textarea></label>
    <label class="risk-form-wide"><span>触发条件</span><textarea name="trigger" rows="2" required placeholder="什么事实发生时算 Risk 已触发">${escapeHtml(risk?.trigger ?? "")}</textarea></label>
    <label><span>处理方式</span><select name="treatment">${riskSelectOptions([["mitigate", "缓解"], ["avoid", "规避"], ["defer", "延后"], ["accept", "接受"]], treatment)}</select></label>
    <label><span>阻塞方式</span><select name="blocking_mode" data-risk-blocking-mode>${riskSelectOptions([["none", "不阻塞"], ["claim", "阻止领取"], ["completion", "阻止完成"], ["invalidate_on_trigger", "触发后失效"]], blockingMode)}</select></label>
    <label class="risk-form-wide"><span>复查条件</span><textarea name="revisit_condition" rows="2" required placeholder="什么时候需要重新判断这项风险">${escapeHtml(risk?.revisit_condition ?? "")}</textarea></label>
    <label><span>负责人</span><input name="owner" required value="${escapeHtml(risk?.owner ?? "")}" placeholder="用户、团队或角色"></label>
    ${renderRiskGoalPicker(view, risk?.goal_ids ?? [currentGoalId], risk?.description ?? "新 Risk", `risk-goals-${formKey}`)}`;
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
    [["open", "开放"], ["triggered", "已触发"], ["resolved", "已解决"], ["accepted", "已接受"], ["expired", "已过期"]],
    risk.state,
  );
  return `<article class="risk-record" id="risk-${escapeHtml(risk.risk_id)}">
    <header><span class="risk-record-icon">${icon("risk")}</span><div><span class="risk-state risk-state--${escapeHtml(risk.state)}">${escapeHtml(RISK_STATE_LABELS[risk.state])}</span><h4>${escapeHtml(risk.description)}</h4><small>${escapeHtml(risk.risk_id)} · 更新于 ${formatDate(risk.updated_at)}</small></div></header>
    <dl class="risk-facts">
      <div><dt>概率 / 影响</dt><dd>${escapeHtml(risk.probability)} / ${escapeHtml(risk.impact)}</dd></div>
      <div><dt>处理 / 阻塞</dt><dd>${escapeHtml(RISK_TREATMENT_LABELS[risk.treatment])} / ${escapeHtml(RISK_BLOCKING_LABELS[risk.blocking_mode])}</dd></div>
      <div class="risk-fact-wide"><dt>触发条件</dt><dd>${escapeHtml(risk.trigger)}</dd></div>
      <div class="risk-fact-wide"><dt>复查条件</dt><dd>${escapeHtml(risk.revisit_condition)}</dd></div>
      <div><dt>负责人</dt><dd>${escapeHtml(risk.owner)}</dd></div>
      <div><dt>受影响区域</dt><dd>${risk.affected_surfaces.length ? escapeHtml(risk.affected_surfaces.join("、")) : "未单独标记"}</dd></div>
      <div class="risk-fact-wide"><dt>受影响 Goal</dt><dd>${renderRiskGoalLinks(risk, view)}</dd></div>
    </dl>
    <p class="risk-effect risk-effect--${escapeHtml(risk.state)}">${icon(risk.state === "triggered" ? "blocked" : "info")}<span><strong>当前影响</strong>${escapeHtml(riskStateEffect(risk.blocking_mode, risk.state))}</span></p>
    ${readOnly ? '<p class="risk-readonly">已归档 Goal 中的 Risk 只读展示；恢复 Goal 后可以继续维护。</p>' : `<div class="risk-actions">
      <details data-persist-open="risk-edit-${escapeHtml(risk.risk_id)}"><summary><span>${icon("settings")}<strong>编辑事实</strong></span>${icon("chevron-down")}</summary>
        <form class="risk-form" data-risk-edit-form data-live-form="risk-edit-${escapeHtml(risk.risk_id)}" data-risk-id="${escapeHtml(risk.risk_id)}">
          ${renderRiskFactsForm(risk, item.goal.goal_id, view)}
          <label class="risk-form-wide"><span>修改原因</span><textarea name="reason" rows="2" required placeholder="为什么需要更新这项 Risk 的事实或关联 Goal"></textarea></label>
          <p class="form-error risk-form-wide" data-risk-error role="alert" hidden></p>
          <footer class="risk-form-wide"><span>状态不会随事实编辑而改变。</span><button class="button-primary" type="submit">保存 Risk 事实</button></footer>
        </form>
      </details>
      <details data-persist-open="risk-state-${escapeHtml(risk.risk_id)}"><summary><span>${icon("history")}<strong>变更状态</strong></span>${icon("chevron-down")}</summary>
        <form class="risk-state-form" data-risk-state-form data-live-form="risk-state-${escapeHtml(risk.risk_id)}" data-risk-id="${escapeHtml(risk.risk_id)}" data-risk-blocking="${escapeHtml(risk.blocking_mode)}">
          <label><span>新状态</span><select name="state" data-risk-state-select>${stateOptions}</select></label>
          <p class="risk-state-preview" data-risk-state-preview>${escapeHtml(riskStateEffect(risk.blocking_mode, risk.state))}</p>
          <label class="risk-form-wide"><span>决定理由</span><textarea name="reason" rows="2" required placeholder="说明为什么现在进入这个状态，以及依据是什么"></textarea></label>
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
  if (impact.state === "inactive") return "这条绑定只作为历史保留，不再参与 Runtime 领取冲突判断。";
  if (impact.state === "proposed") return "这条绑定尚未确认，不会形成 Runtime 领取门禁。";
  if (impact.access === "exclusive") return "当前 Goal 独占该区域；其他 active Goal 不能同时读取、写入或作出决策。";
  if (impact.access === "decide") return "当前 Goal 对该区域作出业务决策；其他 active Goal 的读取、写入或决策会发生冲突。";
  if (impact.access === "write") return "当前 Goal 会写入该区域；其他写入会冲突，读取方必须固定输入快照。";
  return impact.input_snapshot
    ? "当前 Goal 只读取该区域，并已固定输入快照，可与写入方并行推进。"
    : "当前 Goal 只读取该区域，但未固定输入快照；同一区域的 active 写入会阻止领取。";
}

function renderImpactFactsForm(
  impact: ImpactBindingRecord | null,
  goalId: string,
): string {
  const access = impact?.access ?? "read";
  const state = impact?.state === "proposed" ? "proposed" : "confirmed";
  return `<input type="hidden" name="goal_id" value="${escapeHtml(goalId)}">
    <label class="impact-form-wide"><span>影响区域</span><input name="surface" required value="${escapeHtml(impact?.surface ?? "")}" placeholder="例如 src/web 或 onboarding-flow"></label>
    <label><span>访问类型</span><select name="access">${riskSelectOptions([["read", "读取"], ["write", "写入"], ["decide", "决策"], ["exclusive", "独占"]], access)}</select></label>
    <label><span>当前状态</span><select name="state">${riskSelectOptions([["confirmed", "已确认"], ["proposed", "提议中"]], state)}</select></label>
    <label class="impact-form-wide"><span>输入快照 <small>读取方可用 commit、文件版本或事实引用固定输入</small></span><input name="input_snapshot" value="${escapeHtml(impact?.input_snapshot ?? "")}" placeholder="可选，例如 commit://abc123 或 contract://GOAL-ID"></label>
    <label class="impact-form-wide"><span>绑定理由</span><textarea name="reason" rows="2" required placeholder="为什么这个 Goal 会影响该区域">${escapeHtml(impact?.reason ?? "")}</textarea></label>`;
}

function renderImpactRecord(impact: ImpactBindingRecord, item: WebGoalView): string {
  const inactive = impact.state === "inactive";
  const readOnly = Boolean(item.goal.archived_at);
  return `<article class="impact-record${inactive ? " impact-record--inactive" : ""}" id="impact-${escapeHtml(impact.binding_id)}">
    <header><span class="impact-record-icon">${icon("impact")}</span><div><span class="impact-access impact-access--${escapeHtml(impact.access)}">${escapeHtml(IMPACT_ACCESS_LABELS[impact.access])}</span><h4>${escapeHtml(impact.surface)}</h4><small>${escapeHtml(impact.binding_id)} · ${inactive ? `停用于 ${formatDate(impact.deactivated_at ?? impact.updated_at)}` : `更新于 ${formatDate(impact.updated_at)}`}</small></div><span class="impact-state impact-state--${escapeHtml(impact.state)}">${escapeHtml(IMPACT_STATE_LABELS[impact.state])}</span></header>
    <dl class="impact-facts">
      <div><dt>访问 / 状态</dt><dd>${escapeHtml(IMPACT_ACCESS_LABELS[impact.access])} / ${escapeHtml(IMPACT_STATE_LABELS[impact.state])}</dd></div>
      <div><dt>创建者</dt><dd>${escapeHtml(impact.created_by)} · ${formatDate(impact.created_at)}</dd></div>
      <div class="impact-fact-wide"><dt>输入快照</dt><dd>${impact.input_snapshot ? renderReference(impact.input_snapshot, "输入快照") : "未固定"}</dd></div>
      <div class="impact-fact-wide"><dt>绑定理由</dt><dd>${escapeHtml(impact.reason)}</dd></div>
      ${inactive ? `<div class="impact-fact-wide"><dt>停用原因</dt><dd>${escapeHtml(impact.deactivation_reason ?? "未记录")}</dd></div>` : ""}
    </dl>
    <p class="impact-effect impact-effect--${escapeHtml(impact.state)}">${icon(inactive ? "history" : "info")}<span><strong>当前影响</strong>${escapeHtml(impactStateEffect(impact))}</span></p>
    ${readOnly || inactive ? (readOnly && !inactive ? '<p class="impact-readonly">已归档 Goal 中的 Impact 只读展示；恢复 Goal 后可以继续维护。</p>' : "") : `<div class="impact-actions">
      <details data-persist-open="impact-edit-${escapeHtml(impact.binding_id)}"><summary><span>${icon("settings")}<strong>编辑绑定</strong></span>${icon("chevron-down")}</summary>
        <form class="impact-form" data-impact-edit-form data-live-form="impact-edit-${escapeHtml(impact.binding_id)}" data-impact-id="${escapeHtml(impact.binding_id)}">
          ${renderImpactFactsForm(impact, item.goal.goal_id)}
          <label class="impact-form-wide"><span>修改说明</span><textarea name="audit_reason" rows="2" required placeholder="为什么需要更新影响区域、访问方式或状态"></textarea></label>
          <p class="form-error impact-form-wide" data-impact-error role="alert" hidden></p>
          <footer class="impact-form-wide"><span>修改会进入事件历史；已停用记录不会原地恢复。</span><button class="button-primary" type="submit">保存 Impact</button></footer>
        </form>
      </details>
      <details class="impact-deactivate" data-persist-open="impact-deactivate-${escapeHtml(impact.binding_id)}"><summary><span>${icon("archive")}<strong>停用绑定</strong></span>${icon("chevron-down")}</summary>
        <form data-impact-deactivate-form data-live-form="impact-deactivate-${escapeHtml(impact.binding_id)}" data-impact-id="${escapeHtml(impact.binding_id)}">
          <p>停用后不再参与领取冲突判断，但完整绑定事实和停用原因会保留在历史中。</p>
          <label><span>停用原因</span><textarea name="reason" rows="2" required placeholder="为什么这条 Impact 已不再有效"></textarea></label>
          <p class="form-error" data-impact-error role="alert" hidden></p>
          <footer><button class="danger-confirm" type="submit">确认停用</button></footer>
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
    <section class="risk-register"><header class="safety-subheading"><div><h3>风险</h3><p>记录事实、触发条件、影响范围和处理责任；状态决定是否形成门禁。</p></div><span>${item.risks.length} 项</span></header>
      ${item.risks.length ? `<div class="risk-list">${item.risks.map((risk) => renderRiskRecord(risk, item, view)).join("")}</div>` : '<p class="risk-empty">暂无已登记 Risk。需要持续观察、阻止领取或影响完成的事项，都从这里记录。</p>'}
      ${canEdit ? `<details class="risk-create" data-persist-open="risk-create-${escapeHtml(item.goal.goal_id)}"><summary><span class="risk-record-icon">${icon("plus")}</span><span><strong>新增 Risk</strong><small>完整记录事实，并明确关联到哪些 Goal</small></span>${icon("chevron-down")}</summary>
        <form class="risk-form" data-risk-create-form data-live-form="risk-create-${escapeHtml(item.goal.goal_id)}" data-goal-id="${escapeHtml(item.goal.goal_id)}">
          ${renderRiskFactsForm(null, item.goal.goal_id, view)}
          <label class="risk-form-wide"><span>登记原因</span><textarea name="reason" rows="2" required placeholder="为什么现在需要记录这项 Risk"></textarea></label>
          <p class="form-error risk-form-wide" data-risk-error role="alert" hidden></p>
          <footer class="risk-form-wide"><span>新 Risk 默认处于“开放”状态。</span><button class="button-primary" type="submit">登记 Risk</button></footer>
        </form>
      </details>` : ""}
    </section>
    <section class="impact-register" id="impact-workbench-${escapeHtml(item.goal.goal_id)}"><header class="safety-subheading"><div><h3>影响面</h3><p>明确这个 Goal 会读取、写入、决策或独占哪些区域，以及它如何影响并行领取。</p></div><span>${activeImpacts.length} 项生效${inactiveImpacts.length ? ` · ${inactiveImpacts.length} 项历史` : ""}</span></header>
      <div class="impact-ledger">
      ${activeImpacts.length ? `<div class="impact-list">${activeImpacts.map((impact) => renderImpactRecord(impact, item)).join("")}</div>` : '<p class="impact-empty">暂无生效中的 Impact。需要约束并行读取、写入或决策时，从这里登记。</p>'}
      ${canEdit ? `<details class="impact-create" data-persist-open="impact-create-${escapeHtml(item.goal.goal_id)}"><summary><span class="impact-record-icon">${icon("plus")}</span><span><strong>新增 Impact</strong><small>记录影响区域、访问方式、输入快照和绑定理由</small></span>${icon("chevron-down")}</summary>
        <form class="impact-form" data-impact-create-form data-live-form="impact-create-${escapeHtml(item.goal.goal_id)}" data-goal-id="${escapeHtml(item.goal.goal_id)}">
          ${renderImpactFactsForm(null, item.goal.goal_id)}
          <p class="form-error impact-form-wide" data-impact-error role="alert" hidden></p>
          <footer class="impact-form-wide"><span>已确认绑定会立即参与 Runtime 领取冲突判断。</span><button class="button-primary" type="submit">登记 Impact</button></footer>
        </form>
      </details>` : ""}
      ${inactiveImpacts.length ? `<details class="impact-history" data-persist-open="impact-history-${escapeHtml(item.goal.goal_id)}"><summary><span>${icon("history")}<strong>已停用记录</strong><small>${inactiveImpacts.length} 条 · 仍可查看原事实和停用原因</small></span>${icon("chevron-down")}</summary><div class="impact-list">${inactiveImpacts.map((impact) => renderImpactRecord(impact, item)).join("")}</div></details>` : ""}
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
      ([value, copy]) => `<label><input type="radio" name="goal_mode" value="${value}"${selected === value ? " checked" : ""}><span><strong>${copy.label}</strong><small>${copy.description}</small></span></label>`,
    )
    .join("")}</div>`;
}

function renderPolicyToggle(
  name: "self_verification" | "human_approval",
  checked: boolean,
  title: string,
  description: string,
): string {
  return `<label class="policy-toggle"><input type="checkbox" name="${name}"${checked ? " checked" : ""}><span class="policy-switch" aria-hidden="true"></span><span class="policy-toggle-copy"><strong>${title}</strong><small>${description}</small></span></label>`;
}

function renderPolicyCounter(
  name: "cross_reviewers" | "adversarial_reviewers",
  value: number,
  title: string,
  description: string,
): string {
  return `<label class="policy-counter"><span><strong>${title}</strong><small>${description}</small></span><span class="policy-counter-input"><input name="${name}" type="number" min="0" step="1" value="${value}" aria-label="${title}人数"><span>人</span></span></label>`;
}

function policyLeaseDescription(seconds: number): string {
  if (seconds % 3600 === 0) return `约 ${seconds / 3600} 小时`;
  if (seconds % 60 === 0) return `约 ${seconds / 60} 分钟`;
  return "到期后其他 Runtime 可以重新领取";
}

function renderPolicyForm(
  item: WebGoalView,
  scope: "project_default" | "goal",
  policy: GoalPolicy,
  binding: WebPolicyBinding | undefined,
): string {
  const goalScope = scope === "goal";
  const scopeLabel = goalScope ? "当前 Goal 额外规则" : "项目默认规则";
  const description = goalScope
    ? "只作用于当前 Goal；可以增加要求，但不能削弱项目默认最低门槛。"
    : "所有 Goal 的共同基线；修改后影响后续新的领取与 Review。";
  const saved = binding
    ? `已保存 · ${formatDate(binding.created_at)} · ${binding.created_by}`
    : goalScope
      ? "尚未单独设置，当前沿用项目默认"
      : "尚未单独设置，当前使用系统默认";
  const scopeState = binding ? (goalScope ? "已设置 Goal 规则" : "已设置项目基线") : (goalScope ? "完全继承" : "系统默认");
  const context = goalScope
    ? binding
      ? "下面是当前 Goal 保存的完整规则。项目默认仍是最低门槛，不能被这里削弱。"
      : "字段先展示继承后的当前值；只有修改并保存，才会建立这条 Goal 的单独规则。"
    : binding
      ? "这组规则是所有 Goal 的共同最低门槛；当前 Goal 只能在它之上增加要求。"
      : "当前仍使用系统默认。保存后，这组规则会成为整个项目的共同最低门槛。";
  return `<details class="policy-source policy-source--${goalScope ? "goal" : "project"}"${goalScope ? " open" : ""}>
    <summary><span class="policy-source-title"><span class="policy-scope-index">${goalScope ? "02" : "01"}</span><span><small>${goalScope ? "GOAL OVERRIDE" : "PROJECT DEFAULT"}</small><strong>${scopeLabel}</strong><span>${escapeHtml(description)}</span></span></span><span class="policy-source-state"><strong>${escapeHtml(scopeState)}</strong><small>${escapeHtml(saved)}</small>${icon("chevron-down")}</span></summary>
    <form class="policy-form" data-policy-form data-live-form="policy-${escapeHtml(scope)}-${escapeHtml(item.goal.goal_id)}">
      <input type="hidden" name="scope" value="${scope}">
      ${goalScope ? `<input type="hidden" name="goal_id" value="${escapeHtml(item.goal.goal_id)}">` : ""}
      <p class="policy-scope-notice">${icon(goalScope ? "target" : "database")}<span>${escapeHtml(context)}</span></p>
      <section class="policy-form-group"><header><span>${icon("workflow")}</span><div><h3>Runtime 领取</h3><p>决定 Runtime 以什么方式进入 Goal，以及一次认领能保持多久。</p></div></header>
        <fieldset class="policy-control"><legend>Goal Mode</legend><p>这是 Runtime 领取前对工作模式的约束。</p>${renderGoalModeChoices(policy.goal_mode)}</fieldset>
        <div class="policy-control policy-control--split"><label class="policy-input"><span><strong>Runtime 必需能力</strong><small>必须声明全部能力后才能领取；用逗号分隔。</small></span><input name="required_capabilities" value="${escapeHtml(policy.required_capabilities.join(", "))}" placeholder="例如 browser, typescript"></label><label class="policy-input"><span><strong>最长领取时间</strong><small>${escapeHtml(policyLeaseDescription(policy.max_lease_seconds))}</small></span><span class="policy-with-unit"><input name="max_lease_seconds" type="number" min="1" step="1" value="${policy.max_lease_seconds}"><span>秒</span></span></label></div>
      </section>
      <section class="policy-form-group"><header><span>${icon("shield")}</span><div><h3>验证与 Review</h3><p>决定执行结果需要经过哪些独立检查，谁拥有最终确认权。</p></div></header>
        <div class="policy-toggle-list">${renderPolicyToggle("self_verification", policy.self_verification, "执行者自我验证", "执行者提交结果前先验证自己的 Evidence")}${renderPolicyToggle("human_approval", policy.human_approval, "用户最终确认", "完成前必须由用户提交 Human Review")}</div>
        <div class="policy-review-counts">${renderPolicyCounter("cross_reviewers", policy.cross_reviewers, "交叉验证", "由独立 Reviewer 复核结果与证据")}${renderPolicyCounter("adversarial_reviewers", policy.adversarial_reviewers, "对抗性验证", "主动寻找反例、遗漏和错误假设")}</div>
      </section>
      <section class="policy-form-group policy-form-group--reason"><header><span>${icon("history")}</span><div><h3>变更说明</h3><p>Policy 是可审计事实；说明为什么现在需要调整。</p></div></header><label class="policy-reason"><span>修改原因</span><textarea name="reason" rows="2" required placeholder="例如：这个 Goal 涉及用户数据，需要独立 Review 和最终确认"></textarea></label></section>
      <p class="form-error" data-policy-error role="alert" hidden></p>
      <footer><span>${goalScope ? "保存后会与项目默认合并，并立即成为这条 Goal 的领取门槛。" : "旧规则会标记为已替换，历史仍保留。"}</span><button class="button-primary" type="submit">保存${scopeLabel}</button></footer>
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
    <section class="policy-effective"><header><span class="policy-effective-icon">${icon("shield")}</span><div><small>EFFECTIVE POLICY</small><h3>当前最终生效规则</h3><p>Runtime 实际领取和完成这条 Goal 时，必须满足下面这组门槛。</p></div><span class="policy-effective-state">已生效</span></header><dl><div><dt>Goal Mode</dt><dd><strong>${escapeHtml(mode.label)}</strong><small>${escapeHtml(mode.description)}</small></dd></div><div><dt>执行者自检</dt><dd><strong>${policy.self_verification ? "需要" : "不需要"}</strong><small>${policy.self_verification ? "提交前必须验证" : "不设自检门槛"}</small></dd></div><div><dt>独立 Review</dt><dd><strong>${policy.cross_reviewers + policy.adversarial_reviewers} 人</strong><small>交叉 ${policy.cross_reviewers} · 对抗 ${policy.adversarial_reviewers}</small></dd></div><div><dt>用户确认</dt><dd><strong>${policy.human_approval ? "需要" : "不需要"}</strong><small>${policy.human_approval ? "用户拥有最终确认权" : "无需 Human Review"}</small></dd></div><div><dt>最长领取</dt><dd><strong>${policy.max_lease_seconds} 秒</strong><small>${escapeHtml(policyLeaseDescription(policy.max_lease_seconds))}</small></dd></div><div><dt>必需能力</dt><dd><strong>${escapeHtml(policy.required_capabilities.join("、") || "无")}</strong><small>${policy.required_capabilities.length ? "Runtime 必须全部声明" : "不限制能力标签"}</small></dd></div></dl></section>
    <div class="policy-inheritance" aria-label="Policy 继承关系"><span><small>01 · 项目默认</small><strong>${projectBinding ? "项目基线已设置" : "使用系统默认"}</strong></span>${icon("arrow")}<span><small>02 · 当前 Goal</small><strong>${goalBinding ? "已增加单独规则" : "完全继承项目"}</strong></span>${icon("arrow")}<span><small>结果</small><strong>最终生效门槛</strong></span></div>
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
  return `<div class="human-review-list"><header><strong>等待你的最终确认</strong><p>请根据 Contract 和 Evidence 给出结论。Human Review 只能由用户入口提交。</p></header>${pending
    .map(
      (obligation) => `<form class="human-review-form" data-human-review-form data-live-form="human-review-${escapeHtml(obligation.obligation_id)}" data-goal-id="${escapeHtml(item.goal.goal_id)}" data-obligation-id="${escapeHtml(obligation.obligation_id)}">
        <label class="review-verdict"><span>Review 结论</span><select name="verdict"><option value="pass">通过</option><option value="needs_changes">需要修改</option><option value="fail">不通过</option><option value="inconclusive">证据不足</option></select></label>
        <fieldset><legend>引用已有 Evidence</legend><div class="evidence-choice-list">${evidenceChoices}</div></fieldset>
        <label><span>补充 Evidence 引用 <small>可选，每行一条</small></span><textarea name="evidence_refs_extra" rows="2" placeholder="https://… 或项目内文件引用"></textarea></label>
        <label><span>判断理由</span><textarea name="reasoning" rows="3" required placeholder="说明为什么给出这个结论，以及哪些证据支撑判断"></textarea></label>
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
  if (payload == null) return "无结构化详情";
  try {
    return JSON.stringify(payload, null, 2) ?? "无结构化详情";
  } catch {
    return String(payload);
  }
}

function renderFullRecords(item: WebGoalView): string {
  const events = item.events.slice().sort((left, right) => right.seq - left.seq);
  return `<details class="full-records"><summary>查看完整事实记录与事件账本 <span>${events.length} 条事件</span></summary><div class="record-grid">
    <section><h3>Claim 历史</h3>${
      item.claims.length
        ? item.claims.map((claim) => `<p><strong>${escapeHtml(claim.actor_id)}</strong><small>${escapeHtml(claim.claim_id)} · ${escapeHtml(claim.role)} · ${escapeHtml(claim.state)} · ${formatDate(claim.claimed_at)}${claim.release_reason ? ` · ${escapeHtml(claim.release_reason)}` : ""}</small></p>`).join("")
        : '<p class="empty-row">暂无 Claim</p>'
    }</section>
    <section><h3>Run 历史</h3>${
      item.runs.length
        ? item.runs.map((run) => `<p><strong>${escapeHtml(run.run_id)}</strong><small>${escapeHtml(run.state)} · ${escapeHtml(run.actor_id)} · ${formatDate(run.started_at)}${run.block_reason ? ` · ${escapeHtml(run.block_reason)}` : ""}</small></p>`).join("")
        : '<p class="empty-row">暂无 Run</p>'
    }</section>
    <section><h3>Evidence 记录</h3>${
      item.evidence.length
        ? item.evidence.map((evidence) => `<p><strong>${escapeHtml(evidence.evidence_id)}</strong><small>${escapeHtml(EVIDENCE_KIND_LABELS[evidence.kind])} · ${escapeHtml(EVIDENCE_RESULT_LABELS[evidence.result])} · ${escapeHtml(evidence.criterion_ids.join("、"))} · ${escapeHtml(evidence.producer_actor_id)}</small></p>`).join("")
        : '<p class="empty-row">暂无 Evidence</p>'
    }</section>
    <section><h3>Review 记录</h3>${
      item.reviews.length
        ? item.reviews.map((review) => `<p><strong>${escapeHtml(review.verdict)}</strong><small>${escapeHtml(review.review_id)} · ${escapeHtml(review.actor_id)} · ${escapeHtml(review.reasoning)}${review.evidence_refs.length ? ` · ${escapeHtml(review.evidence_refs.join("、"))}` : ""}</small></p>`).join("")
        : '<p class="empty-row">暂无 Review</p>'
    }</section>
    <section><h3>策略绑定</h3>${
      item.policy_bindings.length
        ? item.policy_bindings.map((binding) => `<p><strong>${escapeHtml(binding.scope)}</strong><small>${escapeHtml(binding.state)} · ${escapeHtml(binding.reason)} · ${escapeHtml(JSON.stringify(binding.policy))}</small></p>`).join("")
        : '<p class="empty-row">使用默认策略</p>'
    }</section>
  </div><section class="event-ledger"><header><h3>完整事件账本</h3><p>按时间倒序保留 Claim、Run、Evidence、Review、Policy、Risk、Relation、Candidate、Rewire、Contract/Goal Tree Proposal 和澄清相关事件。</p></header>${events.length ? `<ol>${events.map((event) => `<li><details><summary><time>${formatDate(event.at)}</time><span><strong>${escapeHtml(event.type)}</strong><small>${escapeHtml(event.actor_id)} · ${escapeHtml(event.object_type)} · ${escapeHtml(event.object_id)} · #${event.seq}</small></span></summary><dl><div><dt>事件 ID</dt><dd>${escapeHtml(event.event_id)}</dd></div><div><dt>理由</dt><dd>${escapeHtml(event.reason || "未记录")}</dd></div></dl><pre>${escapeHtml(renderEventPayload(event.payload))}</pre></details></li>`).join("")}</ol>` : '<p class="empty-row">暂无与这条 Goal 关联的事件</p>'}</section></details>`;
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
      <header><span class="dependency-action dependency-action--${escapeHtml(proposal.action ?? "add")}">${proposal.action === "deactivate" ? "解除依赖" : "新增依赖"}</span><span class="dependency-state dependency-state--${escapeHtml(rewire.state)}">${escapeHtml(stateLabel)}</span></header>
      <div class="dependency-direction">${renderProposalGoal(fromGoalId, view)}<span>${icon("chevron-right")}<small>依赖</small></span>${renderProposalGoal(toGoalId, view)}</div>
      <dl class="dependency-rationale"><div><dt>为什么需要</dt><dd>${escapeHtml(proposal.reason ?? "未说明")}</dd></div><div><dt>为什么是这个方向</dt><dd>${escapeHtml(proposal.direction_reason ?? "未说明")}</dd></div><div><dt>如果拒绝</dt><dd>${escapeHtml(proposal.impact_if_rejected ?? "未说明")}</dd></div><div><dt>判断依据</dt><dd>${escapeHtml(DEPENDENCY_BASIS_LABELS[proposal.basis ?? ""] ?? proposal.basis ?? "未记录")} · 可信度 ${escapeHtml(confidence)}</dd></div></dl>
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
      ? "这次提案不新增关系、影响面或风险，只决定新 Goal 是否独立进入后续流程。"
      : `这次提案包含 ${relations.length} 条 Goal 关系、${impacts.length} 个影响面和 ${risks.length} 项风险。`;
  const runSummary = activeRuns
    ? `${activeRuns} 个正在执行的 Run 会保持原目标，不会被改绑。`
    : "当前没有需要保护的运行中 Run。";
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
  return `<div class="dependency-history"><h3>依赖提案记录 <span>${rewires.length}</span></h3><p>保留 Runtime 的依据和用户决定，后续事实变化时可以重新检查。</p>${rewires.map((rewire) => renderDependencyProposalList(rewire, view)).join("")}</div>`;
}

function renderRewireDecision(
  rewire: GoalBoardWebView["snapshot"]["rewires"][number],
  view: GoalBoardWebView,
): string {
  const hasDependencies = dependencyRelations(rewire).length > 0;
  const note = rewire.candidate_id
    ? "拒绝关系调整不会删除已经纳入的 Goal。"
    : "拒绝后现有依赖保持不变；确认后才会新增或解除依赖。";
  return `<form class="decision-record rewire-decision" data-rewire-decision-form data-live-form="rewire-${escapeHtml(rewire.rewire_id)}" data-rewire-id="${escapeHtml(rewire.rewire_id)}">
    <header class="decision-record-heading"><span class="decision-kind decision-kind--rewire">${icon("tree")} Rewire</span><small>${escapeHtml(rewire.rewire_id)}</small></header>
    <div class="decision-record-body"><strong>${hasDependencies ? "依赖调整提案" : "关系调整提案"}</strong>${renderRewireSummary(rewire, view)}<small>${note}</small></div>
    <label class="decision-reason"><span>决定理由或修改意见</span><textarea name="reason" rows="2" required placeholder="说明为什么确认或拒绝这次关系变化"></textarea></label>
    <p class="form-error" data-decision-error role="alert" hidden></p>
    <footer class="decision-actions"><button type="submit" name="decision" value="rejected">拒绝关系调整</button><button class="button-primary" type="submit" name="decision" value="confirmed">${hasDependencies ? "确认依赖调整" : "确认调整"}</button></footer>
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
  return `<div class="proposal-source"><span>${escapeHtml(CONTRACT_SOURCE_LABELS[source.source_kind])} · 可信度 ${confidence}% · 待你确认</span><small>${escapeHtml(source.rationale)}</small>${
    source.source_refs.length
      ? `<div class="proposal-refs">${source.source_refs.map((ref) => renderReference(ref)).join("")}</div>`
      : ""
  }</div>`;
}

function contractValue(value: string | number | string[]): string {
  if (Array.isArray(value)) return value.length ? value.join("；") : "未填写";
  if (typeof value === "number") return String(value);
  return value.trim() || "未填写";
}

function renderContractDiffRow(
  proposal: ContractProposalRecord,
  field: ContractFieldName,
  label: string,
  current: string | number | string[],
  proposed: string | number | string[],
): string {
  return `<div class="contract-diff-row"><h4>${escapeHtml(label)}</h4><div class="contract-diff-copy"><small>当前</small><p>${escapeHtml(contractValue(current))}</p><small>提案</small><p>${escapeHtml(contractValue(proposed))}</p></div>${renderProposalSource(proposalSource(proposal, field))}</div>`;
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
    policy.self_verification ? "需要自检" : "不要求自检",
    `交叉验证 ${policy.cross_reviewers} 人`,
    `对抗验证 ${policy.adversarial_reviewers} 人`,
    policy.human_approval ? "需要用户复核" : "不要求用户复核",
  ];
  const linkedRewires = proposal.dependency_rewire_ids
    .map((rewireId) => view.snapshot.rewires.find((rewire) => rewire.rewire_id === rewireId))
    .filter((rewire): rewire is GoalBoardWebView["snapshot"]["rewires"][number] => Boolean(rewire));
  const pendingLinkedRewires = linkedRewires.filter((rewire) => rewire.state === "pending");
  const approvalBlocked = pendingLinkedRewires.length > 0;
  return `<form class="decision-record contract-proposal" data-contract-decision-form data-live-form="contract-${escapeHtml(proposal.proposal_id)}" data-contract-proposal-id="${escapeHtml(proposal.proposal_id)}">
    <header><div><strong>Contract 补全提案</strong><p>确认后会更新同一个 Goal，不会创建新 Goal；确认前当前正文保持不变。</p></div><span>由 ${escapeHtml(proposal.submitted_by)} 提交</span></header>
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
    ${linkedRewires.length ? `<div class="proposal-appendix proposal-prerequisite"><strong>依赖前置决定</strong><div>${renderList(linkedRewires.map((rewire) => `${rewire.state === "pending" ? "等待决定" : rewire.state === "applied" ? "已确认" : "已拒绝"} · ${rewire.rewire_id}`), "")}<p>${approvalBlocked ? "请先处理上方依赖调整；完成后才可确认 Contract。" : "依赖决定已经完成，可以确认 Contract。"}</p></div></div>` : ""}
    <label class="decision-reason"><span>决定理由或修改意见</span><textarea name="reason" rows="2" required placeholder="确认时说明判断依据；退回时写清需要修改的内容"></textarea></label>
    <p class="form-error" data-decision-error role="alert" hidden></p>
    <footer class="decision-actions"><button type="submit" name="decision" value="rejected">退回补全</button><button class="button-primary" type="submit" name="decision" value="approved"${approvalBlocked ? ' disabled aria-disabled="true" title="先处理上方依赖调整"' : ""}>${approvalBlocked ? "先处理依赖调整" : "确认并设为可执行"}</button></footer>
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
  return values?.length ? renderList(values, "") : `<p class="empty-row">${escapeHtml(empty)}</p>`;
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
    : "该 Candidate 没有关联来源 Run；请根据它自己的 Contract 判断是否应该独立进入 Goal Tree。";
  return `<form class="decision-record candidate-decision" data-candidate-decision-form data-live-form="candidate-${escapeHtml(candidate.candidate_id)}" data-candidate-id="${escapeHtml(candidate.candidate_id)}">
    <header class="decision-record-heading"><span class="decision-kind decision-kind--candidate">${icon("plus")} Candidate</span><small>${escapeHtml(candidate.candidate_id)} · ${escapeHtml(candidate.submitted_by)}</small></header>
    <div class="candidate-title"><div><small>候选 Goal</small><h3>${escapeHtml(proposed.title)}</h3><p>${escapeHtml(proposed.outcome)}</p></div><span>${escapeHtml(candidate.blocking_mode === "none" ? "不阻塞当前 Run" : candidate.blocking_mode === "current_run" ? "阻塞当前 Run" : "影响下游领取")}</span></div>
    <dl class="candidate-contract">
      <div><dt>为什么做</dt><dd>${escapeHtml(proposed.why)}</dd></div>
      <div><dt>业务逻辑</dt><dd>${escapeHtml(proposed.business_logic)}</dd></div>
      <div class="candidate-wide"><dt>为什么不能留在当前 Goal</dt><dd>${escapeHtml(separation)}</dd></div>
      <div><dt>包含范围</dt><dd>${renderCandidateList(proposed.in_scope, "未记录")}</dd></div>
      <div><dt>明确不做</dt><dd>${renderCandidateList(proposed.out_of_scope, "未记录")}</dd></div>
      <div class="candidate-wide"><dt>验收条件</dt><dd>${acceptance.length ? `<ol class="candidate-acceptance">${acceptance.map((criterion) => `<li><strong>${escapeHtml(criterion.statement)}</strong><small>${escapeHtml(criterion.pass_condition)}</small></li>`).join("")}</ol>` : '<p class="empty-row">未记录验收条件</p>'}</dd></div>
      <div><dt>影响面</dt><dd>${candidate.proposed_impacts.length ? renderList(candidate.proposed_impacts.map((impact) => recordSummary(impact, "impact")), "") : '<p class="empty-row">未提议影响面</p>'}</dd></div>
      <div><dt>风险</dt><dd>${candidate.proposed_risks.length ? renderList(candidate.proposed_risks.map((risk) => recordSummary(risk, "risk")), "") : '<p class="empty-row">未提议风险</p>'}</dd></div>
      <div class="candidate-wide"><dt>Review Policy</dt><dd>采用当前项目基线：Goal Mode ${escapeHtml(policy.goal_mode)}；自检 ${policy.self_verification ? "需要" : "不需要"}；交叉 / 对抗 ${policy.cross_reviewers} / ${policy.adversarial_reviewers} 人；用户确认 ${policy.human_approval ? "需要" : "不需要"}。</dd></div>
    </dl>
    <label class="decision-reason"><span>决定理由或修改意见</span><textarea name="reason" rows="3" required placeholder="说明为什么纳入；或写清退回后需要怎样调整"></textarea></label>
    <p class="form-error" data-decision-error role="alert" hidden></p>
    <footer class="decision-actions"><button type="submit" name="decision" value="rejected">退回并说明修改</button><button class="button-primary" type="submit" name="decision" value="approved">纳入 Goal Tree</button></footer>
  </form>`;
}

function renderRiskDecision(risk: RiskRecord, item: WebGoalView | null, view: GoalBoardWebView): string {
  const href = item ? `${item.goal.archived_at ? "/archive/goals/" : "/goals/"}${encodeURIComponent(item.goal.goal_id)}#risk-${encodeURIComponent(risk.risk_id)}` : "#";
  const affectedGoals = allGoalViews(view).filter((goalView) => goalView.risks.some((itemRisk) => itemRisk.risk_id === risk.risk_id));
  return `<article class="decision-record risk-decision">
    <header class="decision-record-heading"><span class="decision-kind decision-kind--risk">${icon("risk")} Risk</span><span class="risk-state risk-state--${escapeHtml(risk.state)}">${escapeHtml(risk.state)}</span></header>
    <div class="decision-record-body"><strong>${escapeHtml(risk.description)}</strong><p>概率 ${escapeHtml(risk.probability)} · 影响 ${escapeHtml(risk.impact)} · ${escapeHtml(risk.blocking_mode)}</p><small>触发：${escapeHtml(risk.trigger)}；复查：${escapeHtml(risk.revisit_condition)}；负责人：${escapeHtml(risk.owner)}</small></div>
    <div class="risk-goal-links"><span>关联 Goal</span><div>${affectedGoals.length ? affectedGoals.map((goalView) => renderDecisionGoalLink(goalView)).join("") : "未关联 Goal"}</div></div>
    <footer class="decision-link-row"><span>完整处理方式和生命周期在所属 Goal 中维护。</span>${item ? `<a href="${href}">打开 Risk</a>` : ""}</footer>
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
    <header class="decision-center-header"><div><small>USER AUTHORITY</small><h1>等待你的决定</h1><p>Runtime 只能提交事实和提案。这里按所属 Goal 集中呈现上下文，由你给出理由并确认。</p></div><strong>${count}<small>项待处理</small></strong></header>
    <div class="decision-summary" aria-label="待决定事项统计"><span>Contract <strong>${typeCounts.proposals}</strong></span><span>Candidate <strong>${typeCounts.candidates}</strong></span><span>Rewire <strong>${typeCounts.rewires}</strong></span><span>Human Review <strong>${typeCounts.reviews}</strong></span><span>Risk <strong>${typeCounts.risks}</strong></span></div>
    ${groups.length ? `<div class="decision-groups">${groups.map((group) => {
      const goalId = group.item?.goal.goal_id ?? "board";
      return `<section class="decision-goal-group" id="decision-goal-${escapeHtml(goalId)}">
        <header class="decision-owner"><div><span>所属 Goal</span>${renderDecisionGoalLink(group.item)}</div><small>${group.contractProposals.length + group.candidates.length + group.rewires.length + group.risks.length + (group.humanReview ? 1 : 0)} 项</small></header>
        <div class="decision-stack">
          ${group.rewires.map((rewire) => renderRewireDecision(rewire, view)).join("")}
          ${group.item ? group.contractProposals.map((proposal) => renderContractProposal(proposal, group.item!.goal, view)).join("") : ""}
          ${group.candidates.map((candidate) => renderCandidateDecision(candidate, view)).join("")}
          ${group.humanReview && group.item ? renderHumanReview(group.item) : ""}
          ${group.risks.map((risk) => renderRiskDecision(risk, group.item, view)).join("")}
        </div>
      </section>`;
    }).join("")}</div>` : `<div class="decision-empty">${icon("check")}<h2>当前没有等待你的决定</h2><p>Runtime 提交新的 Contract Proposal、Candidate 或 Rewire 后，会自动出现在这里。</p></div>`}
  </article>`;
}

function renderGoalDecisionNotice(view: GoalBoardWebView, goalId: string): string {
  const group = buildDecisionGroups(view).find((item) => item.item?.goal.goal_id === goalId);
  if (!group) return "";
  const count = group.contractProposals.length + group.candidates.length + group.rewires.length + group.risks.length + (group.humanReview ? 1 : 0);
  return `<aside class="goal-decision-notice"><div><span>${icon("user")}</span><p><strong>${count} 项等待你的决定</strong><small>属于这个 Goal 的提案、Review 或 Risk 已集中到决定中心。</small></p></div><a href="/decisions#decision-goal-${escapeHtml(goalId)}">前往处理</a></aside>`;
}

function renderDraftGaps(goal: GoalRecord): string {
  if (goal.definition_state !== "draft") return "";
  const gaps = [
    !goal.outcome.trim() ? "要得到的结果" : "",
    !goal.why.trim() ? "为什么做" : "",
    !goal.business_logic.trim() ? "业务逻辑" : "",
    !goal.in_scope.length ? "包含范围" : "",
    !goal.out_of_scope.length ? "明确不做" : "",
    !goal.promised_outputs.length ? "承诺输出" : "",
    !goal.acceptance_criteria.length ? "验收条件" : "",
  ].filter(Boolean);
  if (!gaps.length) return "";
  return `<div class="draft-gaps"><div><strong>这还是一条待澄清的 Draft</strong><p>还需要补全：${escapeHtml(gaps.join("、"))}。澄清者可以提交提案，但只有你确认后它才会成为可执行 Goal。</p></div><a href="#acceptance-${escapeHtml(goal.goal_id)}">查看验收</a></div>`;
}

const DECOMPOSITION_OPTIONS = [
  ["abstract", "仍需拆分", "方向还比较抽象，需要继续找到可独立交付的结果。"],
  ["frontier_open", "Frontier 开放", "已经有部分可做边界，但拆分工作还没有结束。"],
  ["closed_leaf", "最小可执行叶子", "可独立完成、独立交付，并有自己的可观察验收。"],
  ["closed_compound", "拆分完成的复合 Goal", "自身由一组闭环子 Goal 组成，不作为一个大任务直接执行。"],
] as const;

function renderDecisionMethodOptions(selected: AcceptanceCriterion["decision_method"]): string {
  return ([
    ["automated_check", "自动检查"],
    ["measurement", "量化测量"],
    ["inspection", "人工检查"],
    ["human_decision", "用户判断"],
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
    <header><strong data-criterion-number>验收条件 ${index}</strong><button type="button" data-remove-criterion aria-label="移除这条验收条件">${icon("x")}<span>移除</span></button></header>
    <div class="criterion-editor-grid">
      <label class="criterion-statement"><span>检查什么</span><input data-criterion-field="statement" value="${escapeHtml(criterion?.statement ?? "")}" placeholder="例如：用户可以保存 Draft 后再次打开"></label>
      <label><span>判断方式</span><select data-criterion-field="decision_method">${renderDecisionMethodOptions(criterion?.decision_method ?? "inspection")}</select></label>
      <label class="criterion-pass"><span>怎样算通过</span><textarea rows="2" data-criterion-field="pass_condition" placeholder="写出明确、可判断的通过条件">${escapeHtml(criterion?.pass_condition ?? "")}</textarea></label>
      <label><span>目标值 <small>可选</small></span><input data-criterion-field="target" value="${escapeHtml(renderCriterionTarget(criterion?.target))}" placeholder="例如 100%、≤ 2 秒或 JSON"></label>
      <label><span>所需证据类型</span><input data-criterion-field="required_evidence" value="${escapeHtml(criterion?.required_evidence.join(", ") ?? "")}" placeholder="例如 test, inspection"></label>
      <label><span>条件 ID <small>可选，留空自动生成</small></span><input data-criterion-field="criterion_id" value="${escapeHtml(criterion?.criterion_id ?? "")}" placeholder="例如 DRAFT-C1"></label>
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
    ([value, label, description]) => `<label class="decomposition-choice"><input type="radio" name="decomposition_state" value="${value}"${goal.decomposition_state === value ? " checked" : ""}><span><strong>${label}</strong><small>${description}</small></span></label>`,
  ).join("");
  return `<section class="document-section draft-editor-section" data-draft-editor data-goal-id="${escapeHtml(goal.goal_id)}">
    ${sectionHeading("clipboard", "补全 Draft Contract", "只有 Draft 可以直接编辑；accepted Contract 需要通过新 Goal 与 Rewire 变更")}
    <form class="draft-contract-form" data-draft-form data-live-form="draft-${escapeHtml(goal.goal_id)}" data-goal-id="${escapeHtml(goal.goal_id)}">
      <div class="draft-form-row draft-form-row--title"><label><span>Goal 名称</span><input name="title" required maxlength="120" value="${escapeHtml(goal.title)}"></label><label><span>优先级</span><input name="priority" type="number" min="0" max="100" step="1" value="${goal.priority}"></label></div>
      <label class="draft-field"><span>要得到的结果</span><textarea name="outcome" rows="2" placeholder="完成后，用户或系统获得什么可观察结果">${escapeHtml(goal.outcome)}</textarea></label>
      <label class="draft-field"><span>为什么现在做</span><textarea name="why" rows="2" placeholder="说明问题和这项工作的价值">${escapeHtml(goal.why)}</textarea></label>
      <label class="draft-field"><span>业务逻辑</span><textarea name="business_logic" rows="3" placeholder="用非技术语言说明事情如何运转、边界在哪里">${escapeHtml(goal.business_logic)}</textarea></label>
      <div class="draft-list-grid">
        <label><span>包含范围 <small>每行一项</small></span><textarea name="in_scope" rows="4">${listValue(goal.in_scope)}</textarea></label>
        <label><span>明确不做 <small>每行一项</small></span><textarea name="out_of_scope" rows="4">${listValue(goal.out_of_scope)}</textarea></label>
        <label><span>约束 <small>每行一项</small></span><textarea name="constraints" rows="4">${listValue(goal.constraints)}</textarea></label>
        <label><span>需要的输入 <small>每行一项</small></span><textarea name="required_inputs" rows="4">${listValue(goal.required_inputs)}</textarea></label>
        <label><span>承诺输出 <small>每行一项</small></span><textarea name="promised_outputs" rows="4">${listValue(goal.promised_outputs)}</textarea></label>
      </div>
      <fieldset class="decomposition-editor"><legend>这条 Goal 现在拆到什么程度？</legend><div>${decompositionOptions}</div></fieldset>
      <section class="criteria-editor" aria-labelledby="criteria-editor-${escapeHtml(goal.goal_id)}">
        <header><div><h3 id="criteria-editor-${escapeHtml(goal.goal_id)}">结构化验收条件</h3><p>每条条件保留自己的判断方式、目标和证据要求。</p></div><button type="button" data-add-criterion>${icon("plus")}<span>添加验收条件</span></button></header>
        <div class="criteria-editor-list" data-criteria-list>${criteria}</div>
        <template data-criterion-template>${renderDraftCriterionRow(undefined, 1)}</template>
      </section>
      <label class="draft-field"><span>本次修改原因</span><textarea name="reason" rows="2" required placeholder="例如：补充用户确认的范围和验收条件"></textarea></label>
      <p class="form-error" data-draft-error role="alert" hidden></p>
      <footer><span>保存会更新同一个 Draft；已有待确认 Proposal 会失效并等待重新提案。</span><button class="button-primary" type="submit">保存 Draft Contract</button></footer>
    </form>
    <div class="draft-auxiliary">
      <a class="draft-policy-link" href="#risk-workbench-${escapeHtml(goal.goal_id)}">${icon("risk")}<span><strong>继续登记和维护 Risk</strong><small>在“风险与影响”中维护完整事实、关联 Goal 与生命周期</small></span>${icon("arrow")}</a>
      <a class="draft-policy-link" href="#impact-workbench-${escapeHtml(goal.goal_id)}">${icon("impact")}<span><strong>继续登记和维护 Impact</strong><small>在“风险与影响”中维护区域、访问方式、状态与历史</small></span>${icon("arrow")}</a>
      <a class="draft-policy-link" href="#policy-${escapeHtml(goal.goal_id)}">${icon("settings")}<span><strong>继续设置 Runtime / Review Policy</strong><small>项目默认与当前 Goal 规则在下方独立维护</small></span>${icon("arrow")}</a>
    </div>
  </section>`;
}

function sectionHeading(iconName: GoalBoardIcon, title: string, description = ""): string {
  return `<header class="section-heading"><span>${icon(iconName)}</span><div><h2>${escapeHtml(title)}</h2>${
    description ? `<p>${escapeHtml(description)}</p>` : ""
  }</div></header>`;
}

function renderGoalDocument(item: WebGoalView, view: GoalBoardWebView, selected: boolean): string {
  const goal = item.goal;
  const owner = item.active_claim_actor ?? goal.accepted_by ?? "未指定";
  const priorityLabel = goal.priority >= 80 ? "高" : goal.priority >= 40 ? "中" : "普通";
  const activeGoalAction =
    goal.definition_state === "accepted" && !goal.archived_at && !goal.trashed_at
      ? view.snapshot.board.active_goal_id === goal.goal_id
        ? `<span class="document-action document-action--current" role="status" title="当前产品聚焦 Goal；不表示 Runtime 正在执行">${icon("target")}<span>当前 Goal</span></span>`
        : `<button class="document-action" type="button" data-set-active-goal data-goal-id="${escapeHtml(goal.goal_id)}" title="设为 Board 当前聚焦；不会领取或启动 Runtime 执行">${icon("target")}<span>设为当前 Goal</span></button>`
      : "";
  const archiveAction = goal.archived_at
    ? `<button class="document-action" type="button" data-goal-archive="false" data-goal-id="${escapeHtml(goal.goal_id)}">${icon("refresh")}<span>恢复</span></button>`
    : goal.fulfillment_state === "satisfied"
      ? `<button class="document-action" type="button" data-goal-archive="true" data-goal-id="${escapeHtml(goal.goal_id)}">${icon("archive")}<span>归档</span></button>`
      : "";
  const trashAction = `<button class="document-action document-action--danger" type="button" data-open-goal-trash data-goal-id="${escapeHtml(goal.goal_id)}" data-goal-title="${escapeHtml(goal.title)}">${icon("archive")}<span>移入回收站</span></button>`;
  return `<article class="goal-document" data-goal-view="${escapeHtml(goal.goal_id)}"${selected ? "" : " hidden"}>
    <header class="goal-header">
      <div class="goal-title-row"><div class="goal-title-copy"><small>${escapeHtml(goal.goal_id)}</small><h1>${escapeHtml(goal.title)}</h1></div><div class="goal-title-actions">${renderStatus(item.status)}${activeGoalAction}${archiveAction}${trashAction}</div></div>
      <dl class="goal-meta"><div>${icon("clock")}<dt>创建于</dt><dd>${formatDate(goal.created_at)}</dd></div><div>${icon("history")}<dt>更新于</dt><dd>${formatDate(goal.updated_at)}</dd></div><div>${icon("user")}<dt>负责人</dt><dd>${escapeHtml(owner)}</dd></div><div>${icon("target")}<dt>优先级</dt><dd><mark>${priorityLabel} · ${goal.priority}</mark></dd></div>${goal.archived_at ? `<div>${icon("archive")}<dt>归档于</dt><dd>${formatDate(goal.archived_at)}</dd></div>` : ""}</dl>
    </header>
    <section class="document-section">
      ${sectionHeading("book", "业务逻辑")}
      ${renderDraftGaps(goal)}
      <div class="business-copy"><p class="outcome"><strong>要得到的结果：</strong>${escapeHtml(goal.outcome || "待澄清")}</p><p><strong>为什么做：</strong>${escapeHtml(goal.why || "待澄清")}</p><p><strong>事情如何运转：</strong>${escapeHtml(goal.business_logic || "待澄清")}</p></div>
    </section>
    ${renderGoalDecisionNotice(view, goal.goal_id)}
    <section class="document-section">
      ${sectionHeading("blocked", "阻塞项", "决定这个 Goal 现在能否被认领或完成")}
      ${renderReasons(item)}
    </section>
    <section class="document-section" id="acceptance-${escapeHtml(goal.goal_id)}">
      ${sectionHeading("clipboard", "验收清单", "最小 Goal 必须有明确、可判断的完成条件")}
      ${renderAcceptance(item)}
    </section>
    ${renderDraftEditor(item)}
    <section class="document-section runtime-section" data-section="execution">
      ${sectionHeading("workflow", "Runtime 工作闭环", "GoalBoard 记录真相，Runtime 主动读取并认领")}
      <div class="runtime-grid"><section><h3>Claim <span>认领</span></h3>${renderClaimCell(item)}</section><section><h3>Run <span>行动</span></h3>${renderRunCell(item)}</section><section><h3>Evidence <span>证据</span></h3>${renderEvidenceCell(item)}</section><section><h3>Review <span>复核</span></h3>${renderReviewCell(item)}</section></div>
      <p class="runtime-note">这里不会启动或分配 Runtime；Runtime 通过 MCP 主动读取 Ready Goal 并认领。</p>
    </section>
    <section class="document-section">
      ${sectionHeading("tree", "Goal 关系", "直接查看当前 Goal 的上游、下游和其他语义关系")}
      ${renderRelations(item, view)}
    </section>
    <section class="document-section">
      ${sectionHeading("folder", "Goal Contract", "范围、输入与输出都是 Runtime 执行时的边界")}
      ${renderScope(item)}
    </section>
    <section class="document-section">
      ${sectionHeading("shield", "风险与影响")}
      ${renderSafety(item, view)}
    </section>
    <section class="document-section" data-section="policy" id="policy-${escapeHtml(goal.goal_id)}">
      ${sectionHeading("settings", "Runtime 与 Review Policy", "分别维护项目默认和当前 Goal 的额外规则")}
      ${renderPolicyEditor(item)}
    </section>
    <section class="document-section">
      ${sectionHeading("history", "事件历史与用户决策")}
      ${renderHistory(item)}
      ${renderFullRecords(item)}
    </section>
  </article>`;
}

function renderTrashGoalDocument(item: WebGoalView, selected: boolean): string {
  const goal = item.goal;
  const trashEvent = item.events.find((event) => event.type === "goal.trashed");
  const owner = goal.trashed_by ?? trashEvent?.actor_id ?? "未记录";
  return `<article class="goal-document trash-goal-document" data-goal-view="${escapeHtml(goal.goal_id)}"${selected ? "" : " hidden"}>
    <header class="goal-header">
      <div class="goal-title-row"><div class="goal-title-copy"><small>${escapeHtml(goal.goal_id)}</small><h1>${escapeHtml(goal.title)}</h1></div><div class="goal-title-actions">${renderStatus("trashed")}<button class="document-action" type="button" data-open-goal-restore data-goal-id="${escapeHtml(goal.goal_id)}" data-goal-title="${escapeHtml(goal.title)}">${icon("refresh")}<span>恢复</span></button></div></div>
      <dl class="goal-meta"><div>${icon("archive")}<dt>移入于</dt><dd>${formatDate(goal.trashed_at)}</dd></div><div>${icon("user")}<dt>操作人</dt><dd>${escapeHtml(owner)}</dd></div><div>${icon("history")}<dt>最近更新</dt><dd>${formatDate(goal.updated_at)}</dd></div></dl>
    </header>
    <section class="document-section">
      ${sectionHeading("archive", "回收站状态", "这不是永久删除；恢复后仍是同一个 Goal")}
      <div class="trash-summary"><p><strong>Goal 的 Contract、Run、Evidence 与事件历史都已保留。</strong>移入时仍生效的关联关系会临时停止；恢复时，只有两端都不在回收站的关系才会安全恢复。</p>${trashEvent ? `<p><strong>移入原因：</strong>${escapeHtml(trashEvent.reason)}</p>` : ""}</div>
    </section>
    <section class="document-section">
      ${sectionHeading("book", "原始目标")}
      <div class="business-copy"><p class="outcome"><strong>要得到的结果：</strong>${escapeHtml(goal.outcome || "待澄清")}</p><p><strong>为什么做：</strong>${escapeHtml(goal.why || "待澄清")}</p><p><strong>事情如何运转：</strong>${escapeHtml(goal.business_logic || "待澄清")}</p></div>
    </section>
    <section class="document-section">
      ${sectionHeading("refresh", "恢复到 Goal Tree", "恢复不会创建新 Goal，也不会自动启动 Runtime")}
      <div class="trash-restore-row"><p>确认恢复后，这条 Goal 会回到原来的日常列表；如果有关联仍不能安全恢复，系统会保留它们为待处理事实。</p><button class="button-primary" type="button" data-open-goal-restore data-goal-id="${escapeHtml(goal.goal_id)}" data-goal-title="${escapeHtml(goal.title)}">${icon("refresh")}<span>恢复这个 Goal</span></button></div>
    </section>
  </article>`;
}

function renderGoalTrashDialog(): string {
  return `<dialog class="create-dialog goal-trash-dialog" data-goal-trash-dialog aria-labelledby="goal-trash-dialog-title">
    <form method="dialog" class="dialog-shell" data-goal-trash-form data-live-form="goal-trash">
      <header><div><span class="dialog-icon dialog-icon--danger" data-goal-trash-icon>${icon("archive")}</span><div><h2 id="goal-trash-dialog-title" data-goal-trash-title>移入回收站</h2><p data-goal-trash-description>请先确认这条 Goal 和本次操作原因。</p></div></div><button class="icon-button" type="button" data-close-goal-trash aria-label="关闭">${icon("x")}</button></header>
      <div class="dialog-body">
        <p class="goal-trash-target"><strong data-goal-trash-target-title>未选择 Goal</strong><small data-goal-trash-target-id></small></p>
        <p class="goal-trash-note" data-goal-trash-note>该操作可恢复：Goal 历史会保留，当前仍生效的关联关系会暂时停止。若还有有效 Claim 或执行中的 Run，系统不会改动 Goal，而会告诉你先结束哪项工作。</p>
        <label><span data-goal-trash-reason-label>移入原因</span><textarea name="reason" rows="3" required maxlength="4000" placeholder="说明为什么暂时不再保留这条 Goal"></textarea></label>
        <p class="form-error" data-goal-trash-error role="alert" hidden></p>
      </div>
      <footer><button type="button" data-close-goal-trash>取消</button><button class="button-danger" type="submit" data-goal-trash-submit>移入回收站</button></footer>
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
      <header><div><span class="dialog-icon">${icon("plus")}</span><div><h2 id="create-dialog-title">新建目标</h2><p>先记录需求事实，再由澄清者补全 Contract 与拆分。</p></div></div><button class="icon-button" type="button" data-close-create aria-label="关闭">${icon("x")}</button></header>
      <div class="dialog-body">
        <div class="field-row field-row--split"><label><span>Goal ID <small>可选</small></span><input name="goal_id" autocomplete="off" placeholder="例如 GOAL-AUTHORING"></label><label><span>优先级</span><input name="priority" type="number" min="0" max="100" value="50"></label></div>
        <label><span>目标名称</span><input name="title" required maxlength="120" placeholder="一句话说明要完成什么"></label>
        <label><span>要得到的结果 <small>可稍后补</small></span><textarea name="outcome" rows="2" placeholder="完成后，用户或系统获得什么可观察结果"></textarea></label>
        <label><span>为什么做 <small>可稍后补</small></span><textarea name="why" rows="2" placeholder="这个问题为什么值得现在解决"></textarea></label>
        <label><span>业务逻辑 <small>可稍后补</small></span><textarea name="business_logic" rows="3" placeholder="用非技术语言说明事情如何运转、边界在哪里"></textarea></label>
        <label><span>验收条件 <small>每行一条，可稍后补</small></span><textarea name="acceptance_criteria" rows="3" placeholder="例如：可以创建 Goal，并在左侧 Tree 中立即看到"></textarea></label>
        <section class="relation-field" aria-labelledby="parent-relation-title">
          <div class="relation-field-heading"><span>目录层级</span><div><h3 id="parent-relation-title">它属于哪个更大的 Goal？ <small>可选</small></h3><p id="parent-relation-hint">表示“它是这个 Goal 的一部分”，只决定 Tree 中放在哪里，不要求上级 Goal 先完成。</p></div></div>
          <label><span>所属上级 Goal</span><select name="parent_goal_id" aria-describedby="parent-relation-hint parent-relation-preview"><option value="">作为独立 Goal，不指定上级</option>${options}</select></label>
          <p class="relation-preview" id="parent-relation-preview" data-parent-preview>关系预览：新 Goal 将作为独立 Goal 出现在 Tree 中。</p>
        </section>
        <fieldset class="relation-field" aria-describedby="dependency-relation-hint dependency-relation-preview">
          <legend><span>执行前置</span><div><strong>开始前必须等哪些 Goal 完成？ <small>可选</small></strong><small id="dependency-relation-hint">只有确实要消费对方结果时才选择；这会成为领取和完成的硬门禁。</small></div></legend>
          <div class="goal-choice-list">${dependencyOptions}</div>
          <p class="relation-preview" id="dependency-relation-preview" data-dependency-preview>关系预览：当前没有执行前置，Goal 可以独立推进。</p>
        </fieldset>
        <p class="form-error" data-create-error role="alert" hidden></p>
      </div>
      <footer><button type="button" data-close-create>取消</button><button class="button-primary" type="submit">创建草稿 Goal</button></footer>
    </form>
  </dialog>`;
}

const STYLES = `
  :root {
    color-scheme: light;
    --page: #f6f7f9; --paper: #fff; --ink: #171a21; --muted: #68707d;
    --faint: #9299a4; --line: #dfe3e8; --line-strong: #cdd3da;
    --blue: #1677ff; --blue-dark: #0d63d8; --blue-soft: #eaf3ff;
    --green: #168a4b; --green-soft: #eaf7ef; --amber: #b66a00;
    --amber-soft: #fff4dc; --red: #c63838; --red-soft: #fff0f0;
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
  .topbar { min-width: 0; display: flex; align-items: center; border-bottom: 1px solid var(--line-strong); background: rgba(250, 251, 252, .97); box-shadow: 0 1px 2px rgba(18, 28, 40, .06); z-index: 10; }
  .brand { min-width: 182px; height: 100%; padding: 0 28px; display: flex; align-items: center; gap: 11px; border-right: 1px solid var(--line); }
  .brand svg { color: var(--blue); font-size: 22px; stroke-width: 2.4; }
  .brand strong { font-size: 19px; letter-spacing: -.02em; }
  .project-context { height: 100%; padding: 0 24px; display: flex; align-items: center; gap: 8px; white-space: nowrap; color: #343a44; }
  .project-context small { color: var(--muted); }
  .project-context a { color: var(--blue-dark); font-size: 12px; font-weight: 650; text-decoration: none; }
  .project-context a:hover { text-decoration: underline; }
  .sync-state { margin-left: 4px; padding-left: 11px; border-left: 1px solid var(--line); color: var(--muted); font-size: 11px; }
  .sync-state::before { content: ""; display: inline-block; width: 6px; height: 6px; margin-right: 6px; border-radius: 50%; background: var(--green); }
  .sync-state.is-syncing::before { background: var(--blue); animation: pulse 1s infinite; }
  .sync-state.is-offline::before { background: var(--red); }
  .top-spacer { min-width: 0; flex: 1; }
  .global-search { display: flex; align-items: center; min-width: 280px; margin-right: 12px; position: relative; }
  .global-search svg { position: absolute; left: 12px; color: var(--muted); }
  .global-search input { width: 100%; height: 34px; padding: 0 58px 0 36px; border: 1px solid transparent; border-radius: 5px; background: transparent; }
  .global-search input:hover, .global-search input:focus { background: #fff; border-color: var(--line); }
  .global-search kbd { position: absolute; right: 9px; color: var(--faint); border: 1px solid var(--line); border-radius: 4px; padding: 0 5px; font: 12px/20px var(--font); background: #fff; }
  .top-action { height: 34px; margin-right: 8px; padding: 0 13px; border: 0; border-left: 1px solid var(--line); background: transparent; display: inline-flex; align-items: center; gap: 8px; font-weight: 650; cursor: pointer; white-space: nowrap; }
  a.top-action { text-decoration: none; }
  .top-action:hover { color: var(--blue); }
  .top-action.is-current { color: var(--blue-dark); background: var(--blue-soft); }
  .top-action svg { font-size: 17px; }
  .workspace { min-width: 0; min-height: 0; width: 100%; overflow: hidden; display: grid; grid-template-columns: var(--tree-width, clamp(280px, 22vw, 360px)) 5px minmax(0, 1fr); }
  .tree-pane { position: relative; min-width: 0; min-height: 0; overflow: hidden; display: grid; grid-template-rows: auto auto minmax(0, 1fr) 48px; background: #fbfcfd; border-right: 1px solid var(--line-strong); }
  .tree-resizer { position: relative; z-index: 3; cursor: col-resize; background: #f7f8fa; touch-action: none; }
  .tree-resizer::after { content: ""; position: absolute; inset: 0 auto 0 2px; width: 1px; background: var(--line-strong); }
  .tree-resizer:hover::after, .tree-resizer:focus-visible::after, .tree-resizer.is-dragging::after { width: 2px; background: var(--blue); }
  .tree-heading { height: 60px; margin: 0 15px; padding: 0 16px; border-bottom: 1px solid var(--line); display: flex; align-items: center; }
  .tree-heading h2 { margin: 0; font-size: 19px; letter-spacing: -.02em; }
  .tree-heading span { margin-left: 8px; color: var(--muted); font-weight: 500; font-size: 12px; }
  .tree-heading-actions { margin-left: auto; display: flex; gap: 4px; }
  .icon-button { width: 32px; height: 32px; padding: 0; border: 0; border-radius: 4px; background: transparent; display: grid; place-items: center; cursor: pointer; }
  .icon-button:hover, .icon-button.is-active { background: #eef1f4; color: var(--blue); }
  .tree-search { margin: 10px 15px; position: relative; }
  .tree-search svg { position: absolute; left: 12px; top: 10px; color: var(--faint); }
  .tree-search input { width: 100%; height: 34px; padding: 0 12px 0 35px; border: 1px solid var(--line); border-radius: 5px; background: #fff; }
  .tree-filter { position: absolute; z-index: 7; top: 112px; right: 15px; left: 15px; max-height: min(430px, calc(100dvh - 166px)); overflow: auto; padding: 13px 14px 12px; color: var(--ink); background: #fff; box-shadow: 0 9px 24px rgba(25, 34, 45, .14); }
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
  .tree-scroll { min-height: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; padding: 0 14px 16px; scrollbar-width: none; -ms-overflow-style: none; }
  .tree-scroll::-webkit-scrollbar { display: none; }
  .tree-filter-empty { margin: 28px 5px; padding: 14px 12px; color: var(--muted); background: #f5f7f9; font-size: 13px; line-height: 1.5; text-align: center; }
  .tree-filter-empty p { margin: 0 0 8px; }
  .tree-filter-empty button { border: 0; color: var(--blue-dark); background: transparent; font: inherit; cursor: pointer; }
  .goal-tree, .tree-children { list-style: none; padding: 0; margin: 0; }
  .tree-item { position: relative; }
  .tree-children { margin-left: 18px; padding-left: 8px; border-left: 1px solid #d9dee5; }
  .tree-item.is-collapsed > .tree-children { display: none; }
  .tree-item.is-collapsed > .tree-row .tree-toggle svg { transform: rotate(-90deg); }
  .tree-row { min-width: 0; min-height: 38px; display: flex; align-items: center; }
  .tree-toggle, .tree-guide { flex: 0 0 20px; width: 20px; height: 26px; border: 0; padding: 0; background: transparent; display: grid; place-items: center; color: #7b8490; }
  .tree-toggle { cursor: pointer; }
  .tree-toggle:hover { color: var(--blue); }
  .tree-node { min-width: 0; min-height: 34px; flex: 1; padding: 3px 8px; border: 0; border-radius: 4px; background: transparent; display: flex; align-items: center; cursor: pointer; text-align: left; }
  .tree-node:hover { background: #edf2f7; }
  .tree-node.is-selected { color: #fff; background: linear-gradient(180deg, #328bff, #1677ed); box-shadow: inset 0 0 0 1px rgba(14, 94, 199, .22); }
  .tree-copy { min-width: 0; flex: 1; display: grid; overflow: hidden; line-height: 1.2; }
  .tree-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 600; }
  .tree-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--faint); font-size: 9px; letter-spacing: .02em; }
  .tree-node.is-selected .tree-copy small { color: rgba(255, 255, 255, .75); }
  .goal-status { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; font-size: 12px; font-weight: 650; }
  .goal-status svg { font-size: 13px; }
  .goal-status--clarifying, .goal-status--executing, .goal-status--reviewing, .goal-status--revalidating { color: var(--blue); }
  .goal-status--clarification_pending, .goal-status--execution_pending, .goal-status--review_pending, .goal-status--revalidation_pending { color: #1768bf; }
  .goal-status--clarification_blocked, .goal-status--execution_blocked, .goal-status--review_blocked, .goal-status--revalidation_blocked, .goal-status--invalidated { color: var(--red); }
  .goal-status--waiting_children { color: #555d68; }
  .goal-status--satisfied { color: var(--green); }
  .goal-status--trashed, .goal-status--archived { color: #626b76; }
  .tree-node.is-selected .goal-status { color: #fff; }
  .tree-footer { padding: 0 22px; border-top: 1px solid var(--line); display: flex; align-items: center; color: #3c434d; }
  .tree-footer small { margin-left: auto; color: var(--muted); }
  .document-pane { min-width: 0; overflow: auto; background: var(--paper); }
  .goal-document { width: min(100%, 1080px); margin: 0 auto; padding: 30px 38px 80px; container-type: inline-size; animation: document-in .24s cubic-bezier(.16, 1, .3, 1); }
  .goal-header { padding: 0 0 20px; border-bottom: 1px solid var(--line-strong); }
  .goal-title-row { display: flex; align-items: flex-start; gap: 18px; }
  .goal-title-actions { display: flex; align-items: center; gap: 8px; }
  .goal-title-copy { min-width: 0; flex: 1; display: grid; gap: 2px; }
  .goal-title-copy > small { color: var(--muted); font-size: 11px; font-weight: 600; letter-spacing: .04em; }
  .goal-title-row h1 { margin: 0; font-size: clamp(22px, 2.1vw, 29px); line-height: 1.3; letter-spacing: -.03em; }
  .goal-title-actions > .goal-status { padding: 7px 12px; border: 1px solid var(--line); border-radius: 5px; background: #fff; font-size: 14px; }
  .document-action { height: 34px; padding: 0 11px; border: 1px solid var(--line); border-radius: 5px; background: #fff; display: inline-flex; align-items: center; gap: 7px; cursor: pointer; }
  .document-action:hover { color: var(--blue); border-color: color-mix(in srgb, var(--blue), var(--line) 60%); }
  .document-action--current { color: var(--blue-dark); border-color: #bcd4f2; background: var(--blue-soft); cursor: default; }
  .document-action--danger { color: #a52e2e; }
  .document-action--danger:hover { color: #a52e2e; border-color: #dfbaba; background: var(--red-soft); }
  .document-action:disabled { opacity: .55; cursor: wait; }
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
  .section-heading > span { width: 22px; height: 22px; margin-top: 1px; display: grid; place-items: center; color: #48515e; }
  .section-heading h2 { margin: 0; font-size: 17px; letter-spacing: -.015em; }
  .section-heading p { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
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
  .policy-effective { margin-top: 14px; padding: 17px 18px 15px; border: 1px solid #bcd4f2; border-left: 3px solid var(--blue); border-radius: 6px; background: linear-gradient(135deg, #f5f9ff 0%, #fbfdff 68%, #f2f7ff 100%); }
  .policy-effective > header { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: 11px; }
  .policy-effective-icon { width: 34px; height: 34px; margin-top: 1px; border-radius: 5px; color: #fff; background: var(--blue); display: grid; place-items: center; font-size: 17px; }
  .policy-effective header > div > small { color: var(--blue-dark); font-size: 9px; font-weight: 800; letter-spacing: .11em; }
  .policy-effective h3 { margin: 0; font-size: 17px; letter-spacing: -.015em; }
  .policy-effective header p { margin: 1px 0 0; color: var(--muted); font-size: 12px; }
  .policy-effective-state { padding: 3px 7px; border-radius: 3px; color: var(--green); background: var(--green-soft); font-size: 10px; font-weight: 700; }
  .policy-effective dl { margin: 15px 0 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid #cfe0f5; }
  .policy-effective dl div { min-width: 0; padding: 10px 12px 1px 0; display: grid; gap: 1px; }
  .policy-effective dt { color: var(--muted); font-size: 10px; font-weight: 650; }
  .policy-effective dd { min-width: 0; margin: 0; display: grid; overflow-wrap: anywhere; }
  .policy-effective dd strong { font-size: 14px; }
  .policy-effective dd small { color: var(--muted); font-size: 10px; }
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
  .draft-editor-section { background: #fbfcfd; }
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
  .goal-decision-notice { margin-top: 14px; padding: 10px 12px; border: 1px solid #c8dcf8; border-left: 3px solid var(--blue); border-radius: 4px; background: #f5f9ff; display: flex; align-items: center; justify-content: space-between; gap: 18px; }
  .goal-decision-notice > div { min-width: 0; display: flex; align-items: flex-start; gap: 9px; }
  .goal-decision-notice > div > span { flex: 0 0 auto; margin-top: 2px; color: var(--blue); }
  .goal-decision-notice p { min-width: 0; margin: 0; display: grid; }
  .goal-decision-notice small { color: var(--muted); }
  .goal-decision-notice a { flex: 0 0 auto; color: var(--blue-dark); font-weight: 650; text-decoration: none; }
  .decision-center { width: min(100%, 1080px); margin: 0 auto; padding: 34px 38px 80px; container-type: inline-size; animation: document-in .24s cubic-bezier(.16, 1, .3, 1); }
  .decision-center-header { padding-bottom: 22px; border-bottom: 1px solid var(--line-strong); display: flex; align-items: flex-end; justify-content: space-between; gap: 26px; }
  .decision-center-header > div { max-width: 710px; }
  .decision-center-header > div > small { color: var(--blue-dark); font-size: 10px; font-weight: 750; letter-spacing: .12em; }
  .decision-center-header h1 { margin: 4px 0 5px; font-size: clamp(25px, 2.3vw, 32px); line-height: 1.25; letter-spacing: -.03em; }
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
  .decision-owner > div > span { color: var(--muted); font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
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
    .policy-effective > header { grid-template-columns: auto minmax(0, 1fr); }
    .policy-effective-state { grid-column: 2; width: fit-content; }
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
  @media (max-width: 1360px) {
    .brand { min-width: 160px; padding-inline: 20px; }
    .project-context { min-width: 0; padding-inline: 14px; }
    .project-context > span:not(.sync-state) { max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
    .global-search { min-width: 180px; max-width: 220px; }
    .top-action { padding-inline: 9px; }
  }
  @media (max-width: 1180px) {
    .app, .topbar, .workspace { min-width: 0; }
    .workspace { grid-template-columns: var(--tree-width, 280px) 5px minmax(0, 1fr); }
    .project-context { min-width: 0; padding-inline: 16px; }
    .project-context > span:not(.sync-state) { max-width: 170px; overflow: hidden; text-overflow: ellipsis; }
    .global-search { min-width: 190px; }
    .top-action { padding-inline: 10px; }
    .runtime-grid { grid-template-columns: 1fr 1fr; }
    .runtime-grid > section:nth-child(2) { border-right: 0; }
    .runtime-grid > section:nth-child(-n+2) { border-bottom: 1px solid var(--line-strong); }
  }
  @media (max-width: 900px) {
    .global-search, .top-action[data-view-action]:not([data-decisions-link]) { display: none; }
    .top-spacer { display: none; }
    .project-context { min-width: 0; flex: 1 1 auto; padding-inline: 12px; }
    .project-context > strong, .project-context small, .project-context .sync-state { display: none; }
    .project-context > span:not(.sync-state) { min-width: 0; flex: 1 1 auto; max-width: 180px; overflow: hidden; text-overflow: ellipsis; }
    .project-context a { flex: 0 0 auto; }
  }
  @media (max-width: 760px) {
    body { overflow: hidden; }
    .app { grid-template-rows: 52px 42px minmax(0, 1fr); }
    .topbar { grid-row: 1; }
    .brand { min-width: 0; padding: 0 15px; border-right: 0; }
    .brand strong { font-size: 17px; }
    .global-search, .top-action[data-view-action]:not([data-decisions-link]) { display: none; }
    .project-context { padding-inline: 8px; }
    .project-context > span:not(.sync-state) { max-width: 132px; }
    .top-spacer { flex: 1; }
    .top-action { margin-right: 8px; border-left: 0; }
    .top-action span { display: none; }
    .mobile-switch { grid-row: 2; display: grid; grid-template-columns: 1fr 1fr; padding: 5px; border-bottom: 1px solid var(--line); background: #f7f8fa; }
    .mobile-switch button { border: 0; border-radius: 4px; background: transparent; color: var(--muted); }
    .mobile-switch button.is-active { color: var(--ink); background: #fff; box-shadow: 0 1px 3px rgba(22, 31, 43, .1); }
    .workspace { grid-row: 3; grid-template-columns: 1fr; }
    .tree-resizer { display: none; }
    .workspace[data-mobile-view="tree"] .document-pane { display: none; }
    .workspace[data-mobile-view="document"] .tree-pane { display: none; }
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
    .goal-decision-notice { align-items: flex-start; }
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
  .project-index { min-height: 100%; padding: clamp(40px, 10vh, 112px) 24px; display: grid; place-items: start center; }
  .project-index-panel { width: min(100%, 760px); border: 1px solid var(--line-strong); background: var(--paper); box-shadow: var(--shadow); }
  .project-index-heading { padding: 28px 30px 23px; border-bottom: 1px solid var(--line-strong); }
  .project-index-heading h1 { margin: 0; font-size: 25px; letter-spacing: -.03em; }
  .project-index-heading p { max-width: 52ch; margin: 7px 0 0; color: var(--muted); }
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
        errorBox.textContent = "请先确认你要迁移这份已有 GoalBoard 数据。";
        errorBox.hidden = false;
        return;
      }
      const submit = form.querySelector("[data-project-migration-submit]");
      submit.disabled = true;
      errorBox.hidden = true;
      try {
        const response = await fetch("/api/projects/migrate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            legacy_database_path: String(values.get("legacy_database_path") || "").trim(),
            display_name: String(values.get("display_name") || "").trim(),
            user_confirmed: true,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "迁移失败，请检查来源 DB 后重试");
        location.assign(result.project_path);
      } catch (error) {
        errorBox.textContent = error.message || "迁移失败，请检查来源 DB 后重试";
        errorBox.hidden = false;
        submit.disabled = false;
      }
    });
  })();
`;

const CLIENT_SCRIPT = `
  (() => {
    let state = JSON.parse(document.querySelector("#goalboard-data").textContent);
    const workspace = document.querySelector("[data-workspace]");
    const documentPane = document.querySelector("[data-document-pane]");
    const treePane = document.querySelector("#goal-tree-pane");
    const treeResizer = document.querySelector("[data-tree-resizer]");
    const treeScroll = document.querySelector("[data-tree-scroll]");
    const treeSearch = document.querySelector("[data-tree-search]");
    const treeFilter = document.querySelector("[data-tree-filter]");
    const treeFilterTrigger = document.querySelector("[data-tree-filter-trigger]");
    const globalSearch = document.querySelector("[data-global-search]");
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
          ? "关系预览：新 Goal → 依赖 → " + names.join("、") + "；这些 Goal 完成前不能领取或完成新 Goal。"
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
        claims.length ? "有效 Claim：" + claims.join("、") : "",
        runs.length ? "执行中 Run：" + runs.join("、") : "",
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
          headers: { "content-type": "application/json" },
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

    const setTreeWidth = (value, persist = true) => {
      if (matchMedia("(max-width: 760px)").matches) return;
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
      query: treeSearch.value,
      statuses: [...selectedStatuses],
      mobileView: workspace.dataset.mobileView || "tree",
    });

    const applyUiState = (ui) => {
      if (ui?.treeWidth) setTreeWidth(ui.treeWidth, false);
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
      globalSearch.value = ui?.query || "";
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
      document.querySelectorAll("[data-goal-view]").forEach((element) => {
        element.hidden = element.dataset.goalView !== goalId;
      });
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

    const selectGoal = (goalId, updateHistory = true) => {
      if (decisionView) {
        location.assign(route("/goals/" + encodeURIComponent(goalId)));
        return;
      }
      if (!applySelection(goalId, true)) return;
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
        count.textContent = !query && selectedStatuses.size === 0
          ? "共 " + items.length + " 个" + suffix + "目标"
          : "显示 " + matched.length + " / " + items.length + " 个" + suffix + "目标";
      }
      if (empty) empty.hidden = matched.length > 0 || items.length === 0;
    }

    const syncGoalViews = (nextDocument) => {
      const currentViews = new Map(
        [...documentPane.querySelectorAll("[data-goal-view]")].map((view) => [view.dataset.goalView, view]),
      );
      const nextViews = [...nextDocument.querySelectorAll("[data-goal-view]")];
      const nextIds = new Set(nextViews.map((view) => view.dataset.goalView));
      currentViews.forEach((view, goalId) => {
        if (!nextIds.has(goalId)) view.remove();
      });
      nextViews.forEach((nextView) => {
        const currentView = currentViews.get(nextView.dataset.goalView);
        if (currentView) currentView.replaceWith(nextView);
        else documentPane.append(nextView);
      });
    };

    const refreshBoard = async (force = false) => {
      if (syncing || document.hidden) return;
      if (!force && document.activeElement?.closest?.("[data-live-form]")) {
        setSyncState("编辑中");
        return;
      }
      syncing = true;
      try {
        const boardResponse = await fetch(route("/api/board"), { cache: "no-store" });
        if (!boardResponse.ok) throw new Error("无法读取 GoalBoard");
        const nextState = await boardResponse.json();
        if (nextState.snapshot.cursor === state.snapshot.cursor) {
          setSyncState("已同步");
          return;
        }
        setSyncState("同步中", "syncing");
        const ui = readUiState();
        const nextGoals = visibleGoals(nextState);
        const goalStillExists = nextGoals.some((item) => item.goal.goal_id === selected);
        const nextSelected = decisionView
          ? ""
          : goalStillExists
            ? selected
            : collectionView
              ? nextGoals[0]?.goal.goal_id
              : nextState.active_goal_id || nextGoals[0]?.goal.goal_id;
        if (!decisionView && !nextSelected) {
          location.assign(route(trashView ? "/trash" : archiveView ? "/archive" : "/"));
          return;
        }
        const pageBase = goalPageBase();
        const pageResponse = await fetch(decisionView ? route("/decisions") : pageBase + encodeURIComponent(nextSelected), { cache: "no-store" });
        if (!pageResponse.ok) throw new Error("无法更新 Goal 页面");
        const parsed = new DOMParser().parseFromString(await pageResponse.text(), "text/html");
        const nextTree = parsed.querySelector("[data-tree-scroll]");
        const nextDocument = parsed.querySelector("[data-document-pane]");
        const nextFooter = parsed.querySelector("[data-tree-footer]");
        const nextFilter = parsed.querySelector("[data-tree-filter]");
        const nextCount = parsed.querySelector("[data-tree-count]");
        const nextDialog = parsed.querySelector("[data-create-dialog]");
        const nextDecisionsLink = parsed.querySelector("[data-decisions-link]");
        if (!nextTree || !nextDocument || !nextFooter) throw new Error("页面数据不完整");
        const createDraft = dialog.open ? readCreateDraft() : null;
        documentPane.classList.add("is-syncing");
        treeScroll.innerHTML = nextTree.innerHTML;
        if (decisionView) documentPane.replaceChildren(...nextDocument.childNodes);
        else syncGoalViews(nextDocument);
        if (nextFilter && treeFilter) treeFilter.innerHTML = nextFilter.innerHTML;
        document.querySelector("[data-tree-footer]").innerHTML = nextFooter.innerHTML;
        if (nextCount) document.querySelector("[data-tree-count]").textContent = nextCount.textContent;
        if (nextDecisionsLink) {
          const decisionsLink = document.querySelector("[data-decisions-link]");
          if (decisionsLink) {
            decisionsLink.innerHTML = nextDecisionsLink.innerHTML;
            decisionsLink.setAttribute("aria-label", nextDecisionsLink.getAttribute("aria-label") || "待决定");
          }
        }
        if (nextDialog) {
          form.elements.parent_goal_id.innerHTML = nextDialog.querySelector('[name="parent_goal_id"]').innerHTML;
          form.querySelector(".goal-choice-list").innerHTML = nextDialog.querySelector(".goal-choice-list").innerHTML;
          applyCreateDraft(createDraft);
        }
        state = nextState;
        document.querySelector("#goalboard-data").textContent = JSON.stringify(nextState).replaceAll("<", "\\u003c");
        selected = nextSelected;
        if (!decisionView) applySelection(selected, false);
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
          headers: { "content-type": "application/json" },
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
      globalSearch.value = treeSearch.value;
      filterTree(treeSearch.value);
      queueSave();
    });
    globalSearch?.addEventListener("input", () => {
      treeSearch.value = globalSearch.value;
      filterTree(globalSearch.value);
      queueSave();
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
    treeResizer.addEventListener("pointerdown", (event) => {
      if (matchMedia("(max-width: 760px)").matches) return;
      resizeStartX = event.clientX;
      resizeStartWidth = treePane.getBoundingClientRect().width;
      treeResizer.classList.add("is-dragging");
      treeResizer.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    treeResizer.addEventListener("pointermove", (event) => {
      if (!treeResizer.hasPointerCapture(event.pointerId)) return;
      setTreeWidth(resizeStartWidth + event.clientX - resizeStartX);
    });
    const finishTreeResize = (event) => {
      if (treeResizer.hasPointerCapture(event.pointerId)) treeResizer.releasePointerCapture(event.pointerId);
      treeResizer.classList.remove("is-dragging");
      saveUiState();
    };
    treeResizer.addEventListener("pointerup", finishTreeResize);
    treeResizer.addEventListener("pointercancel", finishTreeResize);
    treeResizer.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      setTreeWidth(treePane.getBoundingClientRect().width + (event.key === "ArrowRight" ? 16 : -16));
    });

    treeFilterTrigger?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setTreeFilterOpen(treeFilter?.hidden !== false, true);
    });

    document.addEventListener("click", async (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (!treeFilter?.hidden && !target.closest("[data-tree-filter]")) setTreeFilterOpen(false);
      if (target.closest("[data-clear-status-filter]")) {
        setSelectedStatuses([]);
        filterTree(treeSearch.value);
        queueSave();
        return;
      }
      if (target.closest("[data-clear-tree-filter]")) {
        treeSearch.value = "";
        globalSearch.value = "";
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
            headers: { "content-type": "application/json" },
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
            headers: { "content-type": "application/json" },
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
            headers: { "content-type": "application/json" },
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
            headers: { "content-type": "application/json" },
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
            headers: { "content-type": "application/json" },
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
            headers: { "content-type": "application/json" },
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
            headers: { "content-type": "application/json" },
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
            headers: { "content-type": "application/json" },
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
            headers: { "content-type": "application/json" },
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
            headers: { "content-type": "application/json" },
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
            headers: { "content-type": "application/json" },
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
            headers: { "content-type": "application/json" },
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
            headers: { "content-type": "application/json" },
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
              headers: { "content-type": "application/json" },
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
          headers: { "content-type": "application/json" },
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
      if (match) applySelection(decodeURIComponent(match[1]), true);
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
    try {
      const stored = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (stored) applyUiState(stored);
    } catch {}
    updateRelationPreviews();
    updateAllRelationFormPreviews();
    setInterval(refreshBoard, 4000);
  })();
`;

function renderProjectMigrationDialog(): string {
  return `<dialog class="project-migration-dialog" data-project-migration-dialog aria-labelledby="project-migration-title">
  <form class="project-migration-form" data-project-migration-form>
    <header>
      <div><h2 id="project-migration-title">迁移已有 GoalBoard 数据</h2><p>这是一次单独确认的文件迁移，不会绑定或切换任何 Runtime Session。</p></div>
      <button class="icon-button" type="button" data-close-project-migration aria-label="关闭迁移窗口">${icon("x")}</button>
    </header>
    <div class="project-migration-body">
      <label>已有 GoalBoard DB<input name="legacy_database_path" type="text" required autocomplete="off" placeholder="/绝对路径/到/goalboard.db"><small>请输入你明确要迁移的本机 GoalBoard 数据库路径。</small></label>
      <label>迁移后项目名 <small>可选</small><input name="display_name" type="text" maxlength="160" autocomplete="off" placeholder="留空则使用旧 Board 的名称"></label>
      <p class="project-migration-warning">确认后，来源 DB 会由 GoalBoard 的受管理项目目录接管，原位置不再保留该 DB；Goal、Claim、Run、Evidence 和审计历史会原样迁入。迁移失败时来源 DB 不会被移动。</p>
      <label class="project-migration-confirm"><input name="user_confirmed" type="checkbox"><span>我确认要迁移这份已有 GoalBoard 数据，并理解成功后来源 DB 将移入 GoalBoard 管理目录。</span></label>
      <p class="project-migration-error" data-project-migration-error role="alert" hidden></p>
    </div>
    <footer><button type="button" data-close-project-migration>取消</button><button class="project-migration-submit" type="submit" data-project-migration-submit>确认迁移</button></footer>
  </form>
</dialog>`;
}

export function renderGoalBoardProjectIndex(projects: readonly WebProjectNavigation[]): string {
  const projectRows = projects
    .map(
      (project) => `<li><a href="/projects/${encodeURIComponent(project.project_id)}"><span><strong>${escapeHtml(project.display_name)}</strong><span>打开这个项目的 Goal Tree</span></span>${icon("chevron-down")}</a></li>`,
    )
    .join("");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>选择项目 · GoalBoard</title>
  <style>${STYLES}${PROJECT_INDEX_STYLES}</style>
</head>
<body class="project-index-page">
  ${renderIconSprite()}
  <header class="topbar">
    <div class="brand">${icon("brand")}<strong>GoalBoard</strong></div>
    <div class="project-context"><strong>项目列表</strong><small>选择后只改变当前网页浏览位置</small></div>
  </header>
  <main class="project-index">
    <section class="project-index-panel" aria-labelledby="project-index-title">
      <header class="project-index-heading">
        <h1 id="project-index-title">选择一个项目</h1>
        <p>项目由你在当前 Runtime 中通过 GoalBoard Skill 创建、连接或迁移。网页不会创建项目，也不会绑定或切换 Runtime Session。</p>
      </header>
      ${projects.length
        ? `<ul class="project-list">${projectRows}</ul>`
        : `<div class="project-index-empty"><h2>还没有 GoalBoard 项目</h2><p>请在当前 Runtime 使用 GoalBoard Skill 创建、连接或迁移项目。这个页面不会自动创建项目。</p></div>`}
      <section class="project-index-migration"><div><strong>已有一份旧的 GoalBoard DB？</strong><small>只有你明确选择并确认后，才会迁移它并保留已有历史。</small></div><button class="project-index-migrate" type="button" data-open-project-migration>迁移已有 GoalBoard 数据</button></section>
      <p class="project-index-note">选择项目只影响这次网页浏览；正在对话的 Runtime Session 保持原来的项目关系。</p>
    </section>
  </main>
  ${renderProjectMigrationDialog()}
  <script>${PROJECT_INDEX_CLIENT_SCRIPT}</script>
</body>
</html>`;
}

function prefixLocalLinks(html: string, routePrefix: string): string {
  const prefixed = routePrefix ? html.replaceAll('href="/', `href="${routePrefix}/`) : html;
  return prefixed.replaceAll('href="__PROJECT_INDEX__"', 'href="/"');
}

export function renderGoalBoardWeb(
  view: GoalBoardWebView,
  requestedGoalId?: string,
  archiveView = false,
  decisionView = false,
  trashView = false,
): string {
  const visibleGoals = trashView ? view.trashed_goals : archiveView ? view.archived_goals : view.goals;
  const collectionView = archiveView || trashView;
  const collectionTitle = trashView ? "回收站" : archiveView ? "已归档" : "Goal Tree";
  const searchPlaceholder = trashView
    ? "筛选回收站 Goal"
    : archiveView
      ? "筛选已归档 Goal"
      : "筛选 ID 或标题";
  const collectionSuffix = trashView ? "回收站" : archiveView ? "归档" : "";
  const selected = decisionView
    ? undefined
    : visibleGoals.find((item) => item.goal.goal_id === requestedGoalId) ??
      (collectionView ? undefined : visibleGoals.find((item) => item.goal.goal_id === view.active_goal_id)) ??
      visibleGoals[0];
  const selectedId = selected?.goal.goal_id ?? "";
  const title = decisionView
    ? "等待你的决定 · GoalBoard"
    : selected
    ? selected.goal.title + " · GoalBoard"
    : trashView
      ? "回收站 · GoalBoard"
    : archiveView
      ? "已归档 Goal · GoalBoard"
      : "GoalBoard";
  const phaseSummary = [
    { label: "澄清中", count: view.counts.clarifying },
    { label: "执行中", count: view.counts.executing },
    { label: "复核中", count: view.counts.reviewing },
    { label: "重新验证中", count: view.counts.revalidating },
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
  const footerStatus = [phaseSummary, blockedCount > 0 ? `受阻 ${blockedCount}` : ""]
    .filter(Boolean)
    .join(" · ") || "当前没有进行中的 Goal";
  const collectionNote = trashView
    ? "可恢复；历史与关联处理记录会保留"
    : archiveView
      ? "可随时恢复"
      : footerStatus;
  const projectContext = `<div class="project-context"><strong>项目：</strong><span>${escapeHtml(view.project?.display_name ?? "当前项目")}</span>${view.project ? '<a href="__PROJECT_INDEX__">切换项目</a>' : ""}${view.demo ? "<small>示例数据</small>" : ""}<span class="sync-state" data-sync-state>已同步</span></div>`;
  const html = `<!--
THESIS: GoalBoard 是人和 Runtime 共享的 Goal 真相源；它不分发任务，只让目标、依赖和完成证据持续可见。
OWN-WORLD: 使用参考图的高密度桌面工作台语言：顶部全局栏、左侧 IDE Goal Tree、右侧连续文档。
STORY: 从 Tree 选择 Goal，依次读业务逻辑、阻塞、验收、Runtime 闭环、上下游关系与风险历史。
FIRST VIEWPORT: 首屏必须同时看见 Goal Tree、当前 Goal 标题、业务逻辑、阻塞与验收入口。
FORM: Reference-led desktop Goal workbench, pinned screenshot authority, Operate mode.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${STYLES}${MORE_STYLES}${RESPONSIVE_STYLES}.document-pane.is-syncing .goal-document { animation: none; }</style>
</head>
<body data-board-view="${decisionView ? "decisions" : trashView ? "trash" : archiveView ? "archive" : "current"}" data-route-prefix="${escapeHtml(view.route_prefix)}">
  ${renderIconSprite()}
  <div class="app">
    <header class="topbar">
      <div class="brand">${icon("brand")}<strong>GoalBoard</strong></div>
      ${projectContext}
      <div class="top-spacer"></div>
      <label class="global-search">${icon("search")}<input type="search" data-global-search placeholder="${trashView ? "在回收站内搜索" : archiveView ? "在已归档 Goal 中搜索" : "在当前 Goal Tree 内搜索"}" aria-label="${trashView ? "搜索回收站" : archiveView ? "搜索已归档 Goal" : "搜索 Goal"}"><kbd>⌘F</kbd></label>
      <button class="top-action" type="button" data-open-create aria-label="新建目标">${icon("plus")}<span>新建目标</span></button>
      <a class="top-action${decisionView ? " is-current" : ""}" data-view-action data-decisions-link href="/decisions" aria-label="待决定 ${pendingDecisionCount(view)}"${decisionView ? ' aria-current="page"' : ""}>${icon("user")}<span>待决定 ${pendingDecisionCount(view)}</span></a>
      <a class="top-action${archiveView ? " is-current" : ""}" data-view-action href="${archiveView ? "/" : "/archive"}"${archiveView ? ' aria-current="page"' : ""}>${icon(archiveView ? "tree" : "archive")}<span>${archiveView ? "返回 Goal Tree" : `已归档 ${view.archived_goals.length}`}</span></a>
      <a class="top-action${trashView ? " is-current" : ""}" data-view-action href="${trashView ? "/" : "/trash"}"${trashView ? ' aria-current="page"' : ""}>${icon(trashView ? "tree" : "archive")}<span>${trashView ? "返回 Goal Tree" : `回收站 ${view.trashed_goals.length}`}</span></a>
      <button class="top-action" type="button" data-view-action data-collapse-all>${icon("tree")}<span>收起</span></button>
    </header>
    <nav class="mobile-switch" role="tablist" aria-label="移动端视图"><button class="is-active" type="button" role="tab" aria-selected="true" aria-controls="goal-tree-pane" data-mobile-target="tree">Goal Tree</button><button type="button" role="tab" aria-selected="false" aria-controls="goal-document-pane" data-mobile-target="document">${decisionView ? "决定中心" : "Goal 正文"}</button></nav>
    <main class="workspace" data-workspace data-mobile-view="tree">
      <aside class="tree-pane" id="goal-tree-pane">
        <header class="tree-heading"><h2>${collectionTitle}</h2><span data-tree-count>${visibleGoals.length}</span><div class="tree-heading-actions">${collectionView ? `<a class="icon-button" href="/" aria-label="返回 Goal Tree">${icon("tree")}</a>` : `<button class="icon-button" type="button" data-open-create aria-label="新建目标">${icon("plus")}</button>`}${!archiveView ? `<a class="icon-button" href="/archive" aria-label="查看已归档 Goal">${icon("archive")}</a>` : ""}${!trashView ? `<a class="icon-button" href="/trash" aria-label="查看回收站">${icon("archive")}</a>` : ""}<button class="icon-button" type="button" data-tree-filter-trigger aria-expanded="false" aria-controls="tree-status-filter" aria-label="筛选目标">${icon("filter")}</button></div></header>
        <label class="tree-search">${icon("search")}<input type="search" data-tree-search placeholder="${searchPlaceholder}" aria-label="筛选${collectionTitle}"></label>
        ${renderTreeStatusFilter(visibleGoals)}
        <div class="tree-scroll" data-tree-scroll tabindex="0" aria-label="Goal Tree 目标列表">${renderGoalTree(view, selectedId, visibleGoals)}<div class="tree-filter-empty" data-tree-filter-empty hidden><p>没有符合当前筛选条件的 Goal。</p><button type="button" data-clear-tree-filter>清除所有筛选</button></div></div>
        <footer class="tree-footer" data-tree-footer><span data-tree-filter-count data-tree-suffix="${collectionSuffix}">共 ${visibleGoals.length} 个${collectionSuffix}目标</span><small>${collectionNote}</small></footer>
      </aside>
      <div class="tree-resizer" role="separator" aria-label="调整 Goal Tree 宽度" aria-orientation="vertical" aria-valuemin="260" aria-valuemax="520" aria-valuenow="320" tabindex="0" data-tree-resizer></div>
      <section class="document-pane" id="goal-document-pane" data-document-pane>
        ${decisionView ? renderDecisionCenter(view) : visibleGoals.length ? visibleGoals.map((item) => trashView ? renderTrashGoalDocument(item, item.goal.goal_id === selectedId) : renderGoalDocument(item, view, item.goal.goal_id === selectedId)).join("") : trashView ? `<div class="archive-empty">${icon("archive")}<h1>回收站是空的</h1><p>移入回收站的 Goal 可以在这里恢复；日常 Goal Tree 不会被它们干扰。</p><a href="/">返回 Goal Tree</a></div>` : `<div class="archive-empty">${icon("archive")}<h1>还没有归档 Goal</h1><p>已完成的 Goal 可以在正文顶部手动归档，历史事实不会被删除。</p><a href="/">返回 Goal Tree</a></div>`}
      </section>
    </main>
  </div>
  ${renderCreateDialog(view)}
  ${renderGoalTrashDialog()}
  <div class="toast" data-toast role="status" aria-live="polite"></div>
  <script id="goalboard-data" type="application/json">${dataJson(view)}</script>
  <script>${CLIENT_SCRIPT}</script>
</body>
</html>`;
  return prefixLocalLinks(html, view.route_prefix);
}

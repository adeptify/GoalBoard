import type {
  BoardSnapshot,
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
  ImpactBindingRecord,
  ReviewObligationRecord,
  ReviewRecord,
  RiskRecord,
  RunRecord,
} from "../v1/types.js";
import { icon, renderIconSprite, type GoalBoardIcon } from "./icons.js";

export type WebGoalStatus = "ready" | "claimed" | "blocked" | "waiting" | "satisfied";

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

export interface WebGoalView {
  goal: GoalRecord;
  status: WebGoalStatus;
  status_label: string;
  reasons: DecisionReason[];
  active_claim_actor: string | null;
  active_claim: ClaimRecord | null;
  claims: ClaimRecord[];
  runs: RunRecord[];
  evidence: EvidenceRecord[];
  review_obligations: ReviewObligationRecord[];
  reviews: ReviewRecord[];
  risks: RiskRecord[];
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

export interface GoalBoardWebView {
  snapshot: BoardSnapshot;
  source_label: string;
  database_path: string;
  demo: boolean;
  active_goal_id: string | null;
  goals: WebGoalView[];
  counts: Record<WebGoalStatus, number>;
  coverage: WebCoverageItem[];
  input_bindings: WebInputBinding[];
  policy_bindings: WebPolicyBinding[];
  events: WebEventRecord[];
}

const STATUS_LABELS: Record<WebGoalStatus, string> = {
  ready: "可开始",
  claimed: "进行中",
  blocked: "已阻塞",
  waiting: "待澄清",
  satisfied: "已完成",
};

const STATUS_ICONS: Record<WebGoalStatus, GoalBoardIcon> = {
  ready: "ready",
  claimed: "play",
  blocked: "blocked",
  waiting: "waiting",
  satisfied: "completed",
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

function renderReference(value: string, label = value): string {
  if (/^https?:\/\//i.test(value)) {
    return `<a class="inline-ref" href="${escapeHtml(value)}" target="_blank" rel="noreferrer">${icon("external")}<span>${escapeHtml(label)}</span></a>`;
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

function renderGoalTree(view: GoalBoardWebView, selectedGoalId: string): string {
  const byId = new Map(view.goals.map((item) => [item.goal.goal_id, item]));
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
    return `<li class="tree-item${depth > 0 ? "" : " tree-item--root"}" data-tree-item data-goal-id="${escapeHtml(item.goal.goal_id)}" data-goal-search="${escapeHtml(searchValue)}">
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
  const roots = sortGoals(view.goals.filter((item) => !parent.has(item.goal.goal_id)));
  const rendered = roots.map((item) => renderNode(item, 0)).join("");
  const leftovers = sortGoals(view.goals.filter((item) => !visited.has(item.goal.goal_id)))
    .map((item) => renderNode(item, 0))
    .join("");
  return `<ul class="goal-tree" data-tree-root>${rendered}${leftovers}</ul>`;
}

function relationRow(
  relation: GoalRelationRecord,
  item: WebGoalView,
  view: GoalBoardWebView,
): string {
  const outgoing = relation.from_goal_id === item.goal.goal_id;
  const relatedId = outgoing ? relation.to_goal_id : relation.from_goal_id;
  const related = view.goals.find((candidate) => candidate.goal.goal_id === relatedId);
  const labels = RELATION_LABELS[relation.type] ?? { out: relation.type, in: relation.type };
  return `<button class="relation-row" type="button" data-select-goal="${escapeHtml(relatedId)}">
    <span class="relation-kind">${escapeHtml(outgoing ? labels.out : labels.in)}</span>
    <span class="relation-copy"><strong>${escapeHtml(related?.goal.title ?? relatedId)}</strong><small>${escapeHtml(relatedId)} · ${escapeHtml(relation.reason)}</small></span>
    <span class="relation-state relation-state--${escapeHtml(relation.state)}">${escapeHtml(relation.state === "active" ? "生效" : relation.state === "proposed" ? "待确认" : "停用")}</span>
    ${icon("chevron-right")}
  </button>`;
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
  </div>${renderResolvedDependencyHistory(item, view)}`;
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

function renderEvidenceCell(item: WebGoalView): string {
  if (!item.evidence.length) return '<p class="empty-row">尚未提交验收证据</p>';
  return `<div class="evidence-list">${item.evidence
    .slice()
    .reverse()
    .map(
      (evidence) =>
        `<div class="evidence-row"><span class="evidence-result evidence-result--${evidence.result}">${icon(evidence.result === "passed" ? "completed" : evidence.result === "failed" ? "blocked" : "waiting")}</span><span><strong>${escapeHtml(evidence.kind)}</strong>${renderReference(evidence.locator)}<small>${escapeHtml(evidence.criterion_ids.join("、") || "未绑定验收项")}</small></span></div>`,
    )
    .join("")}</div>`;
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
      return `<li><span class="check-box${passed ? " is-checked" : ""}">${passed ? icon("check") : ""}</span><span><strong>${escapeHtml(criterion.statement)}</strong><small>通过条件：${escapeHtml(criterion.pass_condition)} · ${escapeHtml(criterion.decision_method)}</small></span></li>`;
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

function renderSafety(item: WebGoalView): string {
  const policy = item.resolved_policy;
  return `<div class="safety-grid">
    <section><h3>风险</h3>${
      item.risks.length
        ? item.risks.map((risk) => `<article class="fact-row"><span class="fact-icon fact-icon--risk">${icon("risk")}</span><span><strong>${escapeHtml(risk.description)}</strong><small>${escapeHtml(risk.probability)} / ${escapeHtml(risk.impact)} · ${escapeHtml(risk.state)} · ${escapeHtml(risk.blocking_mode)}</small><small>触发：${escapeHtml(risk.trigger)}；处理：${escapeHtml(risk.treatment)}，${escapeHtml(risk.revisit_condition)}</small></span></article>`).join("")
        : '<p class="empty-row">暂无已登记风险</p>'
    }</section>
    <section><h3>影响面</h3>${
      item.impacts.length
        ? item.impacts.map((impact) => `<article class="fact-row"><span class="fact-icon">${icon("impact")}</span><span><strong>${escapeHtml(impact.surface)}</strong><small>${escapeHtml(impact.access)} · ${escapeHtml(impact.state)} · ${escapeHtml(impact.reason)}</small>${impact.input_snapshot ? `<small>输入快照：${escapeHtml(impact.input_snapshot)}</small>` : ""}</span></article>`).join("")
        : '<p class="empty-row">暂无影响面绑定</p>'
    }</section>
    <section><h3>Runtime 策略</h3><dl class="policy-list"><div><dt>Goal Mode</dt><dd>${escapeHtml(policy.goal_mode)}</dd></div><div><dt>自检</dt><dd>${policy.self_verification ? "需要" : "不需要"}</dd></div><div><dt>交叉验证</dt><dd>${policy.cross_reviewers} 人</dd></div><div><dt>对抗验证</dt><dd>${policy.adversarial_reviewers} 人</dd></div><div><dt>用户确认</dt><dd>${policy.human_approval ? "需要" : "不需要"}</dd></div><div><dt>最长认领</dt><dd>${policy.max_lease_seconds} 秒</dd></div></dl></section>
  </div>`;
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

function renderFullRecords(item: WebGoalView): string {
  return `<details class="full-records"><summary>查看完整 Claim、Run、Review 与策略绑定记录</summary><div class="record-grid">
    <section><h3>Claim 历史</h3>${
      item.claims.length
        ? item.claims.map((claim) => `<p><strong>${escapeHtml(claim.actor_id)}</strong><small>${escapeHtml(claim.role)} · ${escapeHtml(claim.state)} · ${formatDate(claim.claimed_at)}</small></p>`).join("")
        : '<p class="empty-row">暂无 Claim</p>'
    }</section>
    <section><h3>Run 历史</h3>${
      item.runs.length
        ? item.runs.map((run) => `<p><strong>${escapeHtml(run.run_id)}</strong><small>${escapeHtml(run.state)} · ${escapeHtml(run.actor_id)} · ${formatDate(run.started_at)}</small></p>`).join("")
        : '<p class="empty-row">暂无 Run</p>'
    }</section>
    <section><h3>Review 记录</h3>${
      item.reviews.length
        ? item.reviews.map((review) => `<p><strong>${escapeHtml(review.verdict)}</strong><small>${escapeHtml(review.actor_id)} · ${escapeHtml(review.reasoning)}</small></p>`).join("")
        : '<p class="empty-row">暂无 Review</p>'
    }</section>
    <section><h3>策略绑定</h3>${
      item.policy_bindings.length
        ? item.policy_bindings.map((binding) => `<p><strong>${escapeHtml(binding.scope)}</strong><small>${escapeHtml(binding.state)} · ${escapeHtml(binding.reason)} · ${escapeHtml(JSON.stringify(binding.policy))}</small></p>`).join("")
        : '<p class="empty-row">使用默认策略</p>'
    }</section>
  </div></details>`;
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
  return `<article class="rewire-decision"><div><strong>${hasDependencies ? "依赖调整提案" : "关系调整提案"}</strong>${renderRewireSummary(rewire, view)}<small>${note}</small></div><div class="decision-actions"><button type="button" data-rewire-decision="rejected" data-rewire-id="${escapeHtml(rewire.rewire_id)}">拒绝关系调整</button><button class="button-primary" type="button" data-rewire-decision="confirmed" data-rewire-id="${escapeHtml(rewire.rewire_id)}">${hasDependencies ? "确认依赖调整" : "确认调整"}</button></div></article>`;
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
  return `<article class="contract-proposal">
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
    <footer class="decision-actions"><button type="button" data-contract-decision="rejected" data-contract-proposal-id="${escapeHtml(proposal.proposal_id)}">退回补全</button><button class="button-primary" type="button" data-contract-decision="approved" data-contract-proposal-id="${escapeHtml(proposal.proposal_id)}"${approvalBlocked ? ' disabled aria-disabled="true" title="先处理上方依赖调整"' : ""}>${approvalBlocked ? "先处理依赖调整" : "确认并设为可执行"}</button></footer>
  </article>`;
}

function renderDecisionInbox(view: GoalBoardWebView, goalId: string): string {
  const contractProposals = view.snapshot.contract_proposals.filter(
    (proposal) => proposal.goal_id === goalId && proposal.state === "pending",
  );
  const candidates = view.snapshot.candidates.filter((candidate) => candidate.state === "pending");
  const rewires = view.snapshot.rewires.filter((rewire) => rewire.state === "pending");
  if (!contractProposals.length && !candidates.length && !rewires.length) return "";
  const current = view.goals.find((item) => item.goal.goal_id === goalId)?.goal;
  return `<section class="document-section decision-section" data-board-inbox>
    <header class="section-heading"><span>${icon("user")}</span><div><h2>等待用户决定</h2><p>Runtime 只能提案；这些变更由你确认。</p></div></header>
    <div class="decision-list">
      ${rewires.map((rewire) => renderRewireDecision(rewire, view)).join("")}
      ${current ? contractProposals.map((proposal) => renderContractProposal(proposal, current, view)).join("") : ""}
      ${candidates.map((candidate) => `<article><div><strong>候选 Goal：${escapeHtml(candidate.proposed_goal.title)}</strong><p>${escapeHtml(candidate.proposed_goal.outcome)}</p></div><div class="decision-actions"><button type="button" data-candidate-decision="rejected" data-candidate-id="${escapeHtml(candidate.candidate_id)}">拒绝</button><button class="button-primary" type="button" data-candidate-decision="approved" data-candidate-id="${escapeHtml(candidate.candidate_id)}">纳入 Goal Tree</button></div></article>`).join("")}
    </div>
  </section>`;
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
  return `<div class="draft-gaps"><strong>这还是一条待澄清的 Draft</strong><p>还需要补全：${escapeHtml(gaps.join("、"))}。澄清者可以提交提案，但只有你确认后它才会成为可执行 Goal。</p></div>`;
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
  return `<article class="goal-document" data-goal-view="${escapeHtml(goal.goal_id)}"${selected ? "" : " hidden"}>
    <header class="goal-header">
      <div class="goal-title-row"><div class="goal-title-copy"><small>${escapeHtml(goal.goal_id)}</small><h1>${escapeHtml(goal.title)}</h1></div>${renderStatus(item.status)}</div>
      <dl class="goal-meta"><div>${icon("clock")}<dt>创建于</dt><dd>${formatDate(goal.created_at)}</dd></div><div>${icon("history")}<dt>更新于</dt><dd>${formatDate(goal.updated_at)}</dd></div><div>${icon("user")}<dt>负责人</dt><dd>${escapeHtml(owner)}</dd></div><div>${icon("target")}<dt>优先级</dt><dd><mark>${priorityLabel} · ${goal.priority}</mark></dd></div></dl>
    </header>
    <section class="document-section">
      ${sectionHeading("book", "业务逻辑")}
      ${renderDraftGaps(goal)}
      <div class="business-copy"><p class="outcome"><strong>要得到的结果：</strong>${escapeHtml(goal.outcome || "待澄清")}</p><p><strong>为什么做：</strong>${escapeHtml(goal.why || "待澄清")}</p><p><strong>事情如何运转：</strong>${escapeHtml(goal.business_logic || "待澄清")}</p></div>
    </section>
    ${renderDecisionInbox(view, goal.goal_id)}
    <section class="document-section">
      ${sectionHeading("blocked", "阻塞项", "决定这个 Goal 现在能否被认领或完成")}
      ${renderReasons(item)}
    </section>
    <section class="document-section">
      ${sectionHeading("clipboard", "验收清单", "最小 Goal 必须有明确、可判断的完成条件")}
      ${renderAcceptance(item)}
    </section>
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
      ${sectionHeading("shield", "风险、影响与规则")}
      ${renderSafety(item)}
    </section>
    <section class="document-section">
      ${sectionHeading("history", "事件历史与用户决策")}
      ${renderHistory(item)}
      ${renderFullRecords(item)}
    </section>
  </article>`;
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
  .app { height: 100%; display: grid; grid-template-rows: 58px minmax(0, 1fr); }
  .topbar { display: flex; align-items: center; border-bottom: 1px solid var(--line-strong); background: rgba(250, 251, 252, .97); box-shadow: 0 1px 2px rgba(18, 28, 40, .06); z-index: 10; }
  .brand { min-width: 182px; height: 100%; padding: 0 28px; display: flex; align-items: center; gap: 11px; border-right: 1px solid var(--line); }
  .brand svg { color: var(--blue); font-size: 22px; stroke-width: 2.4; }
  .brand strong { font-size: 19px; letter-spacing: -.02em; }
  .source { height: 100%; padding: 0 24px; display: flex; align-items: center; gap: 8px; white-space: nowrap; color: #343a44; }
  .source small { color: var(--muted); }
  .sync-state { margin-left: 4px; padding-left: 11px; border-left: 1px solid var(--line); color: var(--muted); font-size: 11px; }
  .sync-state::before { content: ""; display: inline-block; width: 6px; height: 6px; margin-right: 6px; border-radius: 50%; background: var(--green); }
  .sync-state.is-syncing::before { background: var(--blue); animation: pulse 1s infinite; }
  .sync-state.is-offline::before { background: var(--red); }
  .top-spacer { flex: 1; }
  .global-search { display: flex; align-items: center; min-width: 280px; margin-right: 12px; position: relative; }
  .global-search svg { position: absolute; left: 12px; color: var(--muted); }
  .global-search input { width: 100%; height: 34px; padding: 0 58px 0 36px; border: 1px solid transparent; border-radius: 5px; background: transparent; }
  .global-search input:hover, .global-search input:focus { background: #fff; border-color: var(--line); }
  .global-search kbd { position: absolute; right: 9px; color: var(--faint); border: 1px solid var(--line); border-radius: 4px; padding: 0 5px; font: 12px/20px var(--font); background: #fff; }
  .top-action { height: 34px; margin-right: 8px; padding: 0 13px; border: 0; border-left: 1px solid var(--line); background: transparent; display: inline-flex; align-items: center; gap: 8px; font-weight: 650; cursor: pointer; white-space: nowrap; }
  .top-action:hover { color: var(--blue); }
  .top-action svg { font-size: 17px; }
  .workspace { min-height: 0; display: grid; grid-template-columns: var(--tree-width, clamp(280px, 22vw, 360px)) 5px minmax(0, 1fr); }
  .tree-pane { min-width: 0; display: grid; grid-template-rows: auto auto minmax(0, 1fr) 48px; background: #fbfcfd; border-right: 1px solid var(--line-strong); }
  .tree-resizer { position: relative; z-index: 3; cursor: col-resize; background: #f7f8fa; touch-action: none; }
  .tree-resizer::after { content: ""; position: absolute; inset: 0 auto 0 2px; width: 1px; background: var(--line-strong); }
  .tree-resizer:hover::after, .tree-resizer:focus-visible::after, .tree-resizer.is-dragging::after { width: 2px; background: var(--blue); }
  .tree-heading { height: 60px; margin: 0 15px; padding: 0 16px; border-bottom: 1px solid var(--line); display: flex; align-items: center; }
  .tree-heading h2 { margin: 0; font-size: 19px; letter-spacing: -.02em; }
  .tree-heading span { margin-left: 8px; color: var(--muted); font-weight: 500; font-size: 12px; }
  .tree-heading-actions { margin-left: auto; display: flex; gap: 4px; }
  .icon-button { width: 32px; height: 32px; padding: 0; border: 0; border-radius: 4px; background: transparent; display: grid; place-items: center; cursor: pointer; }
  .icon-button:hover { background: #eef1f4; color: var(--blue); }
  .tree-search { margin: 10px 15px; position: relative; }
  .tree-search svg { position: absolute; left: 12px; top: 10px; color: var(--faint); }
  .tree-search input { width: 100%; height: 34px; padding: 0 12px 0 35px; border: 1px solid var(--line); border-radius: 5px; background: #fff; }
  .tree-scroll { min-height: 0; overflow: auto; padding: 0 14px 16px; }
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
  .goal-status--ready, .goal-status--claimed { color: var(--blue); }
  .goal-status--blocked { color: var(--red); }
  .goal-status--waiting { color: #555d68; }
  .goal-status--satisfied { color: var(--green); }
  .tree-node.is-selected .goal-status { color: #fff; }
  .tree-footer { padding: 0 22px; border-top: 1px solid var(--line); display: flex; align-items: center; color: #3c434d; }
  .tree-footer small { margin-left: auto; color: var(--muted); }
  .document-pane { min-width: 0; overflow: auto; background: var(--paper); }
  .goal-document { width: min(100%, 1080px); margin: 0 auto; padding: 30px 38px 80px; animation: document-in .24s cubic-bezier(.16, 1, .3, 1); }
  .goal-header { padding: 0 0 20px; border-bottom: 1px solid var(--line-strong); }
  .goal-title-row { display: flex; align-items: flex-start; gap: 18px; }
  .goal-title-copy { min-width: 0; flex: 1; display: grid; gap: 2px; }
  .goal-title-copy > small { color: var(--muted); font-size: 11px; font-weight: 600; letter-spacing: .04em; }
  .goal-title-row h1 { margin: 0; font-size: clamp(22px, 2.1vw, 29px); line-height: 1.3; letter-spacing: -.03em; }
  .goal-title-row > .goal-status { margin-top: 2px; padding: 7px 12px; border: 1px solid var(--line); border-radius: 5px; background: #fff; font-size: 14px; }
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
  .draft-gaps { margin: 2px 0 12px 31px; padding: 10px 12px; border: 1px solid var(--line-strong); border-radius: 5px; background: var(--amber-soft); }
  .draft-gaps strong { color: var(--amber); }
  .draft-gaps p { margin: 2px 0 0; color: var(--ink); }
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
  .evidence-row, .review-row { display: flex; align-items: flex-start; gap: 8px; }
  .evidence-row > span:last-child, .review-row > span:last-child { min-width: 0; display: grid; }
  .evidence-row small, .review-row small { color: var(--muted); }
  .evidence-result { margin-top: 2px; }
  .evidence-result--passed { color: var(--green); }
  .evidence-result--failed { color: var(--red); }
  .evidence-result--inconclusive { color: var(--amber); }
  .review-state { flex: 0 0 8px; width: 8px; height: 8px; margin-top: 7px; border-radius: 50%; background: var(--amber); }
  .review-state--satisfied { background: var(--green); }
  .review-state--waived { background: var(--faint); }
  .relation-layout { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid var(--line); border-radius: 5px; overflow: hidden; }
  .relation-group { min-width: 0; border-right: 1px solid var(--line); }
  .relation-group:last-child { border-right: 0; }
  .relation-group > header { padding: 10px 12px; border-bottom: 1px solid var(--line); background: #fbfcfd; }
  .relation-group h3 { margin: 0; font-size: 13px; }
  .relation-group h3 span { color: var(--muted); font-weight: 500; }
  .relation-group p { margin: 1px 0 0; color: var(--muted); font-size: 11px; }
  .relation-group > div { padding: 5px 7px; }
  .relation-row { width: 100%; min-width: 0; padding: 7px 5px; border: 0; border-bottom: 1px solid #edf0f3; background: transparent; display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 7px; text-align: left; cursor: pointer; }
  .relation-row:last-child { border-bottom: 0; }
  .relation-row:hover { background: var(--blue-soft); }
  .relation-kind { padding: 1px 5px; border-radius: 3px; background: #eef1f4; color: #4f5864; font-size: 10px; white-space: nowrap; }
  .relation-copy { min-width: 0; display: grid; }
  .relation-copy strong, .relation-copy small { white-space: normal; overflow-wrap: anywhere; }
  .relation-copy small { color: var(--muted); font-size: 10px; }
  .relation-state { font-size: 10px; color: var(--muted); }
  .relation-state--active { color: var(--green); }
  .relation-state--proposed { color: var(--amber); }
  .relation-row > svg { color: var(--faint); }
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
  .contract-list h3, .safety-grid h3 { margin: 0; font-size: 13px; }
  .contract-list .doc-list, .contract-list .empty-row { margin-top: 0; }
  .contract-list .doc-list { min-width: 0; overflow-wrap: anywhere; }
  .safety-grid { display: grid; grid-template-columns: 1.1fr 1fr .8fr; border: 1px solid var(--line); border-radius: 5px; overflow: hidden; }
  .safety-grid > section { min-width: 0; padding: 12px 14px; border-right: 1px solid var(--line); }
  .safety-grid > section:last-child { border-right: 0; }
  .fact-row { display: flex; gap: 8px; padding: 7px 0; border-bottom: 1px solid #edf0f3; }
  .fact-row:last-child { border-bottom: 0; }
  .fact-icon { flex: 0 0 auto; margin-top: 2px; color: var(--blue); }
  .fact-icon--risk { color: var(--amber); }
  .fact-row > span:last-child { min-width: 0; display: grid; }
  .fact-row small { color: var(--muted); overflow-wrap: anywhere; }
  .policy-list div { grid-template-columns: minmax(0, 1fr) auto; }
  .history-list { list-style: none; margin: 0; padding: 0; }
  .history-list li { display: grid; grid-template-columns: 136px minmax(0, 1fr); gap: 15px; padding: 7px 0; border-bottom: 1px solid #edf0f3; }
  .history-list time { color: var(--muted); font-variant-numeric: tabular-nums; font-size: 12px; }
  .history-list span { min-width: 0; display: grid; }
  .history-list strong, .history-list small { overflow-wrap: anywhere; }
  .history-list small { color: var(--muted); }
  .decision-section { border-bottom: 0; }
  .decision-list { display: grid; gap: 8px; }
  .decision-list > article { padding: 12px 14px; border: 1px solid var(--line); border-radius: 5px; display: flex; gap: 18px; align-items: center; }
  .decision-list > article > div:first-child { min-width: 0; flex: 1; }
  .decision-list p { margin: 2px 0 0; color: var(--muted); }
  .decision-list > .contract-proposal { padding: 0; display: block; overflow: hidden; border-color: var(--line-strong); }
  .contract-proposal > header { padding: 13px 15px; display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; background: var(--blue-soft); border-bottom: 1px solid var(--line); }
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
  .contract-proposal > footer { padding: 12px 15px; justify-content: flex-end; background: #fbfcfd; }
  .decision-actions { display: flex; gap: 7px; }
  .rewire-decision { align-items: flex-end !important; }
  .decision-actions button, .create-dialog footer button { min-height: 34px; padding: 0 13px; border: 1px solid var(--line-strong); border-radius: 5px; background: #fff; cursor: pointer; }
  .button-primary { color: #fff !important; border-color: var(--blue) !important; background: var(--blue) !important; }
  .button-primary:hover { background: var(--blue-dark) !important; }
  .decision-actions button:disabled { color: var(--muted) !important; border-color: var(--line) !important; background: #eef0f3 !important; cursor: not-allowed; }
  .mobile-switch { display: none; }
  .create-dialog { width: min(680px, calc(100vw - 32px)); max-height: calc(100vh - 40px); padding: 0; border: 0; border-radius: 8px; box-shadow: var(--shadow); }
  .create-dialog::backdrop { background: rgba(25, 34, 45, .36); backdrop-filter: blur(2px); }
  .dialog-shell { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; max-height: calc(100vh - 40px); }
  .create-dialog header { padding: 18px 20px; border-bottom: 1px solid var(--line); display: flex; align-items: flex-start; justify-content: space-between; }
  .create-dialog header > div { display: flex; gap: 11px; }
  .dialog-icon { width: 34px; height: 34px; border-radius: 6px; background: var(--blue-soft); color: var(--blue); display: grid; place-items: center; font-size: 18px; }
  .create-dialog h2 { margin: 0; font-size: 19px; }
  .create-dialog header p { margin: 1px 0 0; color: var(--muted); font-size: 12px; }
  .dialog-body { padding: 18px 20px 22px; overflow: auto; display: grid; gap: 13px; }
  .dialog-body label { display: grid; gap: 5px; }
  .dialog-body label > span, .dialog-body legend { font-weight: 650; }
  .dialog-body small { color: var(--muted); font-weight: 400; }
  .dialog-body input:not([type=checkbox]), .dialog-body textarea, .dialog-body select { width: 100%; border: 1px solid var(--line-strong); border-radius: 5px; padding: 8px 10px; background: #fff; resize: vertical; }
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
  .full-records summary { padding: 9px 12px; color: var(--muted); cursor: pointer; background: #fbfcfd; }
  .record-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-top: 1px solid var(--line); }
  .record-grid section { min-width: 0; padding: 11px 13px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .record-grid section:nth-child(2n) { border-right: 0; }
  .record-grid section:nth-last-child(-n+2) { border-bottom: 0; }
  .record-grid h3 { margin: 0 0 6px; font-size: 13px; }
  .record-grid p { margin: 5px 0; display: grid; }
  .record-grid small { color: var(--muted); overflow-wrap: anywhere; }
  @keyframes document-in { from { opacity: .5; transform: translateY(5px); } }
  @keyframes pulse { 50% { opacity: .35; } }
`;

const RESPONSIVE_STYLES = `
  @media (max-width: 1180px) {
    .app, .topbar, .workspace { min-width: 0; }
    .workspace { grid-template-columns: var(--tree-width, 280px) 5px minmax(0, 1fr); }
    .source { min-width: 0; padding-inline: 16px; }
    .source > span:not(.sync-state) { max-width: 170px; overflow: hidden; text-overflow: ellipsis; }
    .global-search { min-width: 190px; }
    .top-action { padding-inline: 10px; }
    .runtime-grid { grid-template-columns: 1fr 1fr; }
    .runtime-grid > section:nth-child(2) { border-right: 0; }
    .runtime-grid > section:nth-child(-n+2) { border-bottom: 1px solid var(--line-strong); }
    .relation-layout, .safety-grid { grid-template-columns: 1fr 1fr; }
    .relation-group:nth-child(2), .safety-grid > section:nth-child(2) { border-right: 0; }
    .relation-group:last-child, .safety-grid > section:last-child { grid-column: 1 / -1; border-top: 1px solid var(--line); }
  }
  @media (max-width: 760px) {
    body { overflow: hidden; }
    .app { grid-template-rows: 52px 42px minmax(0, 1fr); }
    .topbar { grid-row: 1; }
    .brand { min-width: 0; padding: 0 15px; border-right: 0; }
    .brand strong { font-size: 17px; }
    .source, .global-search, .top-action[data-view-action] { display: none; }
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
    .goal-title-row > .goal-status { width: fit-content; }
    .goal-meta { gap: 8px 16px; }
    .runtime-grid, .relation-layout, .safety-grid { grid-template-columns: 1fr; }
    .runtime-grid > section, .relation-group, .safety-grid > section { min-height: 0; border-right: 0 !important; border-bottom: 1px solid var(--line) !important; }
    .runtime-grid > section:last-child, .relation-group:last-child, .safety-grid > section:last-child { border-bottom: 0 !important; }
    .relation-group:last-child, .safety-grid > section:last-child { grid-column: auto; border-top: 0; }
    .contract-list section { grid-template-columns: 1fr; gap: 6px; }
    .history-list li { grid-template-columns: 1fr; gap: 2px; }
    .decision-list > article { align-items: stretch; flex-direction: column; }
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
    .dialog-body input:not([type=checkbox]), .dialog-body textarea, .dialog-body select { font-size: 16px; }
    .create-dialog { width: 100vw; max-width: none; height: 100vh; max-height: none; margin: 0; border-radius: 0; }
    .dialog-shell { max-height: 100vh; height: 100%; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; scroll-behavior: auto !important; }
  }
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
    const globalSearch = document.querySelector("[data-global-search]");
    const dialog = document.querySelector("[data-create-dialog]");
    const form = document.querySelector("[data-create-form]");
    const formError = document.querySelector("[data-create-error]");
    const toast = document.querySelector("[data-toast]");
    const syncState = document.querySelector("[data-sync-state]");
    const storageKey = "goalboard-ui:" + state.snapshot.board.board_id;
    let selected = document.querySelector("[data-goal-view]:not([hidden])")?.dataset.goalView || state.active_goal_id || state.goals[0]?.goal.goal_id || "";
    let toastTimer;
    let syncing = false;
    let saveTimer;
    let resizeStartX = 0;
    let resizeStartWidth = 0;

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
      treeTop: treeScroll.scrollTop,
      documentTop: documentPane.scrollTop,
      treeWidth: treePane.getBoundingClientRect().width,
      query: treeSearch.value,
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
      treeSearch.value = ui?.query || "";
      globalSearch.value = ui?.query || "";
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
      const item = state.goals.find((entry) => entry.goal.goal_id === goalId);
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
      if (!applySelection(goalId, true)) return;
      if (updateHistory) history.pushState({ goalId }, "", "/goals/" + encodeURIComponent(goalId));
      if (matchMedia("(max-width: 760px)").matches) setMobileView("document");
      saveUiState();
    };

    function filterTree(value) {
      const query = value.trim().toLowerCase();
      document.querySelectorAll("[data-tree-item]").forEach((item) => {
        item.hidden = Boolean(query && !item.dataset.goalSearch.includes(query));
      });
      if (query) {
        document.querySelectorAll("[data-tree-item]:not([hidden])").forEach((item) => {
          let parent = item.parentElement?.closest("[data-tree-item]");
          while (parent) {
            parent.hidden = false;
            parent.classList.remove("is-collapsed");
            parent = parent.parentElement?.closest("[data-tree-item]");
          }
        });
      }
    }

    const refreshBoard = async () => {
      if (syncing || document.hidden) return;
      syncing = true;
      try {
        const boardResponse = await fetch("/api/board", { cache: "no-store" });
        if (!boardResponse.ok) throw new Error("无法读取 GoalBoard");
        const nextState = await boardResponse.json();
        if (nextState.snapshot.cursor === state.snapshot.cursor) {
          setSyncState("已同步");
          return;
        }
        setSyncState("同步中", "syncing");
        const ui = readUiState();
        const goalStillExists = nextState.goals.some((item) => item.goal.goal_id === selected);
        const nextSelected = goalStillExists ? selected : nextState.active_goal_id || nextState.goals[0]?.goal.goal_id;
        const pageResponse = await fetch("/goals/" + encodeURIComponent(nextSelected), { cache: "no-store" });
        if (!pageResponse.ok) throw new Error("无法更新 Goal 页面");
        const parsed = new DOMParser().parseFromString(await pageResponse.text(), "text/html");
        const nextTree = parsed.querySelector("[data-tree-scroll]");
        const nextDocument = parsed.querySelector("[data-document-pane]");
        const nextFooter = parsed.querySelector("[data-tree-footer]");
        const nextCount = parsed.querySelector("[data-tree-count]");
        const nextDialog = parsed.querySelector("[data-create-dialog]");
        if (!nextTree || !nextDocument || !nextFooter) throw new Error("页面数据不完整");
        const createDraft = dialog.open ? readCreateDraft() : null;
        documentPane.classList.add("is-syncing");
        treeScroll.innerHTML = nextTree.innerHTML;
        documentPane.innerHTML = nextDocument.innerHTML;
        document.querySelector("[data-tree-footer]").innerHTML = nextFooter.innerHTML;
        if (nextCount) document.querySelector("[data-tree-count]").textContent = nextCount.textContent;
        if (nextDialog) {
          form.elements.parent_goal_id.innerHTML = nextDialog.querySelector('[name="parent_goal_id"]').innerHTML;
          form.querySelector(".goal-choice-list").innerHTML = nextDialog.querySelector(".goal-choice-list").innerHTML;
          applyCreateDraft(createDraft);
        }
        state = nextState;
        document.querySelector("#goalboard-data").textContent = JSON.stringify(nextState).replaceAll("<", "\\u003c");
        selected = nextSelected;
        applySelection(selected, false);
        applyUiState(ui);
        requestAnimationFrame(() => documentPane.classList.remove("is-syncing"));
        setSyncState("刚刚更新");
      } catch {
        setSyncState("暂时离线", "offline");
      } finally {
        syncing = false;
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
    treeScroll.addEventListener("scroll", queueSave, { passive: true });
    documentPane.addEventListener("scroll", queueSave, { passive: true });
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

    document.addEventListener("click", async (event) => {
      const target = event.target;
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
      if (target.closest("[data-focus-filter]")) {
        treeSearch.focus();
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
      const contractProposal = target.closest("[data-contract-decision]");
      if (contractProposal) {
        contractProposal.disabled = true;
        try {
          const decision = contractProposal.dataset.contractDecision;
          const response = await fetch("/api/contract-proposals/" + encodeURIComponent(contractProposal.dataset.contractProposalId) + "/decision", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              decision,
              reason: decision === "approved"
                ? "用户在 GoalBoard 确认字段来源、验收、依赖和 Review 规则"
                : "用户在 GoalBoard 退回 Contract 补全提案",
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "操作失败");
          await refreshBoard();
          showToast(decision === "approved" ? "Contract 已确认，Goal 现在可进入执行" : "提案已退回，Draft 保持不变");
        } catch (error) {
          contractProposal.disabled = false;
          showToast(error.message || "操作失败", true);
        }
        return;
      }
      const candidate = target.closest("[data-candidate-decision]");
      if (candidate) {
        candidate.disabled = true;
        try {
          const response = await fetch("/api/candidates/" + encodeURIComponent(candidate.dataset.candidateId) + "/decision", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              decision: candidate.dataset.candidateDecision,
              reason: candidate.dataset.candidateDecision === "approved" ? "用户从 GoalBoard 批准" : "用户从 GoalBoard 拒绝",
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "操作失败");
          await refreshBoard();
        } catch (error) {
          candidate.disabled = false;
          showToast(error.message || "操作失败", true);
        }
        return;
      }
      const rewire = target.closest("[data-rewire-decision]");
      if (rewire) {
        rewire.disabled = true;
        try {
          const decision = rewire.dataset.rewireDecision;
          const response = await fetch("/api/rewires/" + encodeURIComponent(rewire.dataset.rewireId) + "/decision", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              decision,
              reason: decision === "confirmed"
                ? "用户从 GoalBoard 确认关系调整"
                : "用户保留新 Goal，但拒绝这次关系调整",
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "操作失败");
          await refreshBoard();
        } catch (error) {
          rewire.disabled = false;
          showToast(error.message || "操作失败", true);
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
        const response = await fetch("/api/goals", {
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
      const match = location.pathname.match(/^\\/goals\\/(.+)$/);
      if (match) applySelection(decodeURIComponent(match[1]), true);
    });
    addEventListener("pagehide", saveUiState);
    addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        globalSearch?.focus();
      }
      if (event.key === "Escape" && dialog.open) {
        dialog.close();
        refreshBoard();
      }
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
    setInterval(refreshBoard, 4000);
  })();
`;

export function renderGoalBoardWeb(view: GoalBoardWebView, requestedGoalId?: string): string {
  const selected =
    view.goals.find((item) => item.goal.goal_id === requestedGoalId) ??
    view.goals.find((item) => item.goal.goal_id === view.active_goal_id) ??
    view.goals[0];
  const selectedId = selected?.goal.goal_id ?? "";
  const title = selected ? selected.goal.title + " · GoalBoard" : "GoalBoard";
  return `<!--
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
<body>
  ${renderIconSprite()}
  <div class="app">
    <header class="topbar">
      <div class="brand">${icon("brand")}<strong>GoalBoard</strong></div>
      <div class="source"><strong>数据源:</strong> <span>${escapeHtml(view.source_label)}</span> <small>${view.demo ? "示例数据" : "（本地）"}</small> ${icon("chevron-down")}<span class="sync-state" data-sync-state>已同步</span></div>
      <div class="top-spacer"></div>
      <label class="global-search">${icon("search")}<input type="search" data-global-search placeholder="在当前 Goal Tree 内搜索" aria-label="搜索 Goal"><kbd>⌘F</kbd></label>
      <button class="top-action" type="button" data-open-create aria-label="新建目标">${icon("plus")}<span>新建目标</span></button>
      <button class="top-action" type="button" data-view-action data-collapse-all>${icon("tree")}<span>收起</span></button>
    </header>
    <nav class="mobile-switch" role="tablist" aria-label="移动端视图"><button class="is-active" type="button" role="tab" aria-selected="true" aria-controls="goal-tree-pane" data-mobile-target="tree">Goal Tree</button><button type="button" role="tab" aria-selected="false" aria-controls="goal-document-pane" data-mobile-target="document">Goal 正文</button></nav>
    <main class="workspace" data-workspace data-mobile-view="tree">
      <aside class="tree-pane" id="goal-tree-pane">
        <header class="tree-heading"><h2>Goal Tree</h2><span data-tree-count>${view.goals.length}</span><div class="tree-heading-actions"><button class="icon-button" type="button" data-open-create aria-label="新建目标">${icon("plus")}</button><button class="icon-button" type="button" data-focus-filter aria-label="筛选目标">${icon("filter")}</button></div></header>
        <label class="tree-search">${icon("search")}<input type="search" data-tree-search placeholder="筛选 ID 或标题" aria-label="筛选 Goal Tree"></label>
        <div class="tree-scroll" data-tree-scroll>${renderGoalTree(view, selectedId)}</div>
        <footer class="tree-footer" data-tree-footer><span>共 ${view.goals.length} 个目标</span><small>${view.counts.claimed} 进行中 · ${view.counts.blocked} 阻塞</small></footer>
      </aside>
      <div class="tree-resizer" role="separator" aria-label="调整 Goal Tree 宽度" aria-orientation="vertical" aria-valuemin="260" aria-valuemax="520" aria-valuenow="320" tabindex="0" data-tree-resizer></div>
      <section class="document-pane" id="goal-document-pane" data-document-pane>
        ${view.goals.map((item) => renderGoalDocument(item, view, item.goal.goal_id === selectedId)).join("")}
      </section>
    </main>
  </div>
  ${renderCreateDialog(view)}
  <div class="toast" data-toast role="status" aria-live="polite"></div>
  <script id="goalboard-data" type="application/json">${dataJson(view)}</script>
  <script>${CLIENT_SCRIPT}</script>
</body>
</html>`;
}

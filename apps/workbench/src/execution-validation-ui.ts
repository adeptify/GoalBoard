import type {
  ExecutionValidationSnapshot,
  GoalActionProjection,
} from "@adeptify/goalboard-plugin-goals";
import type { GoalRecord } from "@adeptify/goalboard-contracts/modules/goals";

type ClaimRecord = ExecutionValidationSnapshot["claims"][number];
type RunRecord = ExecutionValidationSnapshot["runs"][number];
type EvidenceRecord = ExecutionValidationSnapshot["evidence"][number];
type ReviewObligationRecord = ExecutionValidationSnapshot["review_obligations"][number];
type ReviewRecord = ExecutionValidationSnapshot["reviews"][number];

export interface WorkbenchExecutionGoalView {
  goal: GoalRecord;
  action_projection: GoalActionProjection;
  active_claim: ClaimRecord | null;
  claims: ClaimRecord[];
  runs: RunRecord[];
  evidence: EvidenceRecord[];
  review_obligations: ReviewObligationRecord[];
  reviews: ReviewRecord[];
}

export interface WorkbenchExecutionValidationUiDependencies {
  translate(value: string, replacements?: Record<string, string | number>): string;
  escapeHtml(value: string): string;
  formatDate(value: string): string;
  renderIcon(name: string): string;
  renderReference(value: string, label?: string, evidenceId?: string): string;
  isProjectReference(value: string): boolean;
  currentLocale(): string;
}

export const EXECUTION_EVIDENCE_KIND_LABELS: Record<EvidenceRecord["kind"], string> = {
  test: "测试",
  measurement: "测量",
  artifact: "产物",
  inspection: "检查",
  attestation: "人工陈述",
  human_verdict: "人工结论",
};

export const EXECUTION_EVIDENCE_RESULT_LABELS: Record<EvidenceRecord["result"], string> = {
  passed: "通过",
  failed: "失败",
  inconclusive: "证据不足",
};

export interface WorkbenchExecutionValidationRenderer {
  renderClaimCell(item: WorkbenchExecutionGoalView): string;
  renderRunCell(item: WorkbenchExecutionGoalView): string;
  renderEvidenceRecord(evidence: EvidenceRecord): string;
  renderEvidenceForm(item: WorkbenchExecutionGoalView, variant: "full" | "quick"): string;
  renderEvidenceSubmitForm(item: WorkbenchExecutionGoalView): string;
  renderEvidenceCell(item: WorkbenchExecutionGoalView, editable?: boolean): string;
  renderReviewCell(item: WorkbenchExecutionGoalView): string;
}

/** Own the Workbench presentation for the public execution-validation model. */
export function createWorkbenchExecutionValidationRenderer(
  dependencies: WorkbenchExecutionValidationUiDependencies,
): WorkbenchExecutionValidationRenderer {
  const {
    currentLocale,
    escapeHtml,
    formatDate,
    isProjectReference,
    renderIcon,
    renderReference,
    translate: L,
  } = dependencies;

  const reviewLabels: Record<ReviewObligationRecord["role"], string> = {
    self_verifier: "执行者自检",
    cross_reviewer: "交叉验证",
    adversarial_reviewer: "对抗性验证",
    human_approver: "用户确认",
  };

  const evidenceResultIcon = (result: EvidenceRecord["result"]): string =>
    result === "passed" ? "completed" : result === "failed" ? "blocked" : "waiting";

  const renderClaimCell = (item: WorkbenchExecutionGoalView): string => {
    const claim = item.active_claim ?? item.claims.at(-1);
    if (!claim) return `<p class="empty-row">${L("尚未被 Runtime 认领")}</p>`;
    return `<dl class="runtime-facts"><div><dt>Runtime</dt><dd>${escapeHtml(claim.actor_id)}</dd></div><div><dt>${L("角色")}</dt><dd>${escapeHtml(claim.role)}</dd></div><div><dt>${L("状态")}</dt><dd>${escapeHtml(claim.state)}</dd></div><div><dt>Goal Mode</dt><dd>${claim.goal_mode_attestation ? L("已开启") : L("未开启")}</dd></div></dl>`;
  };

  const renderRunCell = (item: WorkbenchExecutionGoalView): string => {
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
  };

  const renderEvidenceRecord = (evidence: EvidenceRecord): string => {
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
      ? `<button class="inline-ref" type="button" data-copy-value="${escapeHtml(evidence.locator)}" title="${L("复制引用")}">${renderIcon("copy")}<span>${escapeHtml(evidence.locator)}</span></button>`
      : renderReference(evidence.locator, evidence.locator, evidence.evidence_id);
    return `<article class="evidence-record evidence-record--${evidence.lifecycle_state}">
      <span class="evidence-result evidence-result--${evidence.result}">${renderIcon(evidenceResultIcon(evidence.result))}</span>
      <div><header><strong>${escapeHtml(L(EXECUTION_EVIDENCE_KIND_LABELS[evidence.kind]))} · ${escapeHtml(L(EXECUTION_EVIDENCE_RESULT_LABELS[evidence.result]))}</strong><span class="evidence-lifecycle evidence-lifecycle--${evidence.lifecycle_state}">${escapeHtml(lifecycleLabel)}</span><span class="evidence-locator-status evidence-locator-status--${evidence.locator_status}">${escapeHtml(locatorLabel)}</span><button class="record-id" type="button" data-copy-value="${escapeHtml(evidence.evidence_id)}" title="${L("复制 Evidence ID")}">${escapeHtml(evidence.evidence_id)}</button></header>${locatorReference}<small>${escapeHtml(evidence.producer_actor_id)} · ${formatDate(evidence.captured_at)} · ${escapeHtml(evidence.criterion_ids.join(currentLocale() === "en" ? ", " : "、") || L("未绑定验收项"))}</small><small class="evidence-locator-reason">${escapeHtml(L(evidence.locator_validation_reason))}</small>${evidence.digest ? `<p>${escapeHtml(evidence.digest)}</p>` : ""}${correctionDetail}</div>
    </article>`;
  };

  const renderEvidenceForm = (
    item: WorkbenchExecutionGoalView,
    variant: "full" | "quick",
  ): string => {
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
    const kindChoices = (Object.entries(EXECUTION_EVIDENCE_KIND_LABELS) as Array<[EvidenceRecord["kind"], string]>)
      .map(([kind, label]) => `<option value="${kind}"${kind === "attestation" ? " selected" : ""}>${escapeHtml(L(label))}</option>`)
      .join("");
    const resultChoices = (Object.entries(EXECUTION_EVIDENCE_RESULT_LABELS) as Array<[EvidenceRecord["result"], string]>)
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
  };

  const renderEvidenceSubmitForm = (item: WorkbenchExecutionGoalView): string => {
    const form = renderEvidenceForm(item, "full");
    if (!form || form.startsWith('<p class="evidence-submit-note"')) return form;
    return `<details class="evidence-submit" data-persist-open="evidence-submit-${escapeHtml(item.goal.goal_id)}"><summary><span>${renderIcon("evidence")}<strong>${L("补充完成依据")}</strong><small>${L("记录可复核的测试、检查结果或产物")}</small></span>${renderIcon("chevron-down")}</summary>
      ${form}
    </details>`;
  };

  const renderEvidenceCell = (item: WorkbenchExecutionGoalView, editable = true): string => {
    const records = item.evidence.length
      ? `<div class="evidence-list">${item.evidence.slice().reverse().map(renderEvidenceRecord).join("")}</div>`
      : `<p class="empty-row">${L("尚未提交验收证据")}</p>`;
    return `${records}${editable ? renderEvidenceSubmitForm(item) : ""}`;
  };

  const renderReviewCell = (item: WorkbenchExecutionGoalView): string => {
    if (!item.review_obligations.length) {
      return `<p class="empty-row">${L("当前工作规则不要求额外检查")}</p>`;
    }
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
        return `<div class="review-row"><span class="review-state review-state--${obligation.state}"></span><span><strong>${escapeHtml(L(reviewLabels[obligation.role]) ?? obligation.role)}</strong><small>${escapeHtml(detail)}</small></span></div>`;
      })
      .join("")}</div>`;
  };

  return {
    renderClaimCell,
    renderRunCell,
    renderEvidenceRecord,
    renderEvidenceForm,
    renderEvidenceSubmitForm,
    renderEvidenceCell,
    renderReviewCell,
  };
}

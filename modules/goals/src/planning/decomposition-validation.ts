import type {
  GoalDecompositionReview as DecompositionReview,
  GoalLegacyProductContext as LegacyProductContext,
  GoalLeafReadiness as LeafReadiness,
  GoalRecord,
  GoalRelationRecord,
  GoalTaskContext as TaskContext,
  PlanningProposalItem,
} from "@adeptify/goalboard-contracts/modules/goals";

export type ProposalItem = PlanningProposalItem;

export type ProductPathArea =
  | "final_outcome"
  | "operating_flow"
  | "core_capabilities"
  | "foundation_infrastructure"
  | "quality_continuous_delivery"
  | "core_gameplay"
  | "game_systems_content"
  | "player_journey"
  | "interaction_ui"
  | "audiovisual"
  | "technology_data"
  | "quality"
  | "delivery_release"
  | "core_function"
  | "user_journey"
  | "content_information"
  | "ai_data_sources_quality"
  | "ai_evaluation"
  | "ai_runtime_cost"
  | "ai_safety_governance"
  | "source_provenance"
  | "research_content_method"
  | "review_approval"
  | "publication_distribution"
  | "roles_responsibilities"
  | "permissions"
  | "tools_workflow"
  | "exception_handling"
  | "measurement"
  | "user_outcome"
  | "operating_flow"
  | "supporting_foundation"
  | "quality_and_delivery";

export const PRODUCT_PATH_AREAS: Record<LegacyProductContext, readonly ProductPathArea[]> = {
  game: [
    "core_gameplay",
    "game_systems_content",
    "player_journey",
    "interaction_ui",
    "audiovisual",
    "technology_data",
    "quality",
    "delivery_release",
  ],
  app: [
    "core_function",
    "user_journey",
    "interaction_ui",
    "content_information",
    "technology_data",
    "quality",
    "delivery_release",
  ],
  other: ["user_outcome", "operating_flow", "supporting_foundation", "quality_and_delivery"],
};

export const UNIVERSAL_RESULT_CHAIN_AREAS = [
  "final_outcome",
  "operating_flow",
  "core_capabilities",
  "foundation_infrastructure",
  "quality_continuous_delivery",
] as const satisfies readonly ProductPathArea[];

export const TASK_CONTEXT_AREAS: Record<TaskContext, readonly ProductPathArea[]> = {
  game: ["core_gameplay", "game_systems_content", "player_journey", "interaction_ui", "audiovisual"],
  app: ["core_function", "user_journey", "interaction_ui", "content_information"],
  ai_data: ["ai_data_sources_quality", "ai_evaluation", "ai_runtime_cost", "ai_safety_governance"],
  content_research: ["source_provenance", "research_content_method", "review_approval", "publication_distribution"],
  operations: ["roles_responsibilities", "permissions", "tools_workflow", "exception_handling", "measurement"],
  other: [],
};

export const TASK_CONTEXT_LABELS: Record<TaskContext, string> = {
  game: "游戏",
  app: "App",
  ai_data: "AI / 数据",
  content_research: "内容 / 研究",
  operations: "运营流程",
  other: "其他复杂任务",
};

export const PRODUCT_PATH_AREA_LABELS: Record<ProductPathArea, string> = {
  final_outcome: "最终结果",
  operating_flow: "实际流程",
  core_capabilities: "核心能力",
  foundation_infrastructure: "基础能力与基建",
  quality_continuous_delivery: "质量与持续交付",
  core_gameplay: "核心玩法",
  game_systems_content: "游戏系统与内容",
  player_journey: "玩家旅程",
  interaction_ui: "交互与 UI",
  audiovisual: "视听表现",
  technology_data: "技术与数据",
  quality: "质量",
  delivery_release: "交付与发布",
  core_function: "核心功能",
  user_journey: "端到端用户旅程",
  content_information: "内容与信息",
  ai_data_sources_quality: "数据来源与质量",
  ai_evaluation: "评测与效果边界",
  ai_runtime_cost: "运行方式与成本",
  ai_safety_governance: "安全与治理",
  source_provenance: "资料来源与可信度",
  research_content_method: "研究或生产方法",
  review_approval: "审核与批准",
  publication_distribution: "发布与分发",
  roles_responsibilities: "角色与职责",
  permissions: "权限与授权",
  tools_workflow: "工具与工作流",
  exception_handling: "例外处理",
  measurement: "衡量方式",
  user_outcome: "用户结果",
  supporting_foundation: "支撑基础",
  quality_and_delivery: "质量与交付",
};

export interface GoalDecompositionValidationContext {
  goals: Array<
    Pick<GoalRecord, "goal_id" | "decomposition_state"> &
    Partial<Pick<GoalRecord, "promised_outputs" | "acceptance_criteria">>
  >;
  relations: Array<Pick<GoalRelationRecord, "relation_id" | "from_goal_id" | "to_goal_id" | "type" | "state">>;
}

export interface GoalDecompositionValidationIssue {
  code: string;
  item_id: string;
  goal_id: string;
  field:
    | "leaf_readiness"
    | "leaf_scope"
    | "output_coverage"
    | "split_candidates"
    | "acceptance_coverage"
    | "decomposition_review"
    | "contract_coverage"
    | "coverage"
    | "open_frontier";
  message: string;
  recovery: string;
  missing_areas?: string[];
  missing_fields?: string[];
  affected_outputs?: string[];
  affected_work_items?: string[];
  affected_criterion_ids?: string[];
  open_goal_ids?: string[];
  invalid_path?: string;
  received_value?: unknown;
  allowed_values?: string[];
}

export function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

export function goalPayload(item: ProposalItem): Record<string, unknown> | null {
  if (item.kind !== "goal" && item.kind !== "contract") return null;
  const payload = record(item.payload);
  return record(payload?.goal ?? payload?.proposed_goal) ?? payload;
}

export function relationPayloads(item: ProposalItem): Record<string, unknown>[] {
  if (item.kind !== "relation" && item.kind !== "dependency") return [];
  const payload = record(item.payload);
  if (!payload) return [];
  const nested = payload.relations ?? payload.relation;
  const values = Array.isArray(nested) ? nested : nested == null ? [payload] : [nested];
  return values.map(record).filter((value): value is Record<string, unknown> => value != null);
}

export function readDecompositionReview(value: unknown): DecompositionReview | null {
  const raw = record(value);
  if (!raw) return null;
  const coverage = Array.isArray(raw.coverage)
    ? raw.coverage.map(record).filter((item): item is Record<string, unknown> => item != null).map((item) => ({
        area: String(item.area ?? ""),
        disposition: String(item.disposition ?? "") as DecompositionReview["coverage"][number]["disposition"],
        goal_ids: strings(item.goal_ids),
        reason: String(item.reason ?? "").trim(),
      }))
    : [];
  const rawContractCoverage = record(raw.contract_coverage);
  const contractCoverage = rawContractCoverage == null
    ? undefined
    : {
        promised_outputs: Array.isArray(rawContractCoverage.promised_outputs)
          ? rawContractCoverage.promised_outputs
            .map(record)
            .filter((item): item is Record<string, unknown> => item != null)
            .map((item) => ({
              parent_promised_output: String(item.parent_promised_output ?? "").trim(),
              status: String(item.status ?? "") as NonNullable<DecompositionReview["contract_coverage"]>["promised_outputs"][number]["status"],
              child_outputs: Array.isArray(item.child_outputs)
                ? item.child_outputs
                  .map(record)
                  .filter((child): child is Record<string, unknown> => child != null)
                  .map((child) => ({
                    goal_id: String(child.goal_id ?? "").trim(),
                    promised_output: String(child.promised_output ?? "").trim(),
                  }))
                : [],
              reason: String(item.reason ?? "").trim(),
            }))
          : [],
        acceptance_criteria: Array.isArray(rawContractCoverage.acceptance_criteria)
          ? rawContractCoverage.acceptance_criteria
            .map(record)
            .filter((item): item is Record<string, unknown> => item != null)
            .map((item) => ({
              parent_criterion_id: String(item.parent_criterion_id ?? "").trim(),
              status: String(item.status ?? "") as NonNullable<DecompositionReview["contract_coverage"]>["acceptance_criteria"][number]["status"],
              child_criteria: Array.isArray(item.child_criteria)
                ? item.child_criteria
                  .map(record)
                  .filter((child): child is Record<string, unknown> => child != null)
                  .map((child) => ({
                    goal_id: String(child.goal_id ?? "").trim(),
                    criterion_id: String(child.criterion_id ?? "").trim(),
                  }))
                : [],
              reason: String(item.reason ?? "").trim(),
            }))
          : [],
      };
  return {
    status: String(raw.status ?? "") as DecompositionReview["status"],
    method_pack_ids: strings(raw.method_pack_ids),
    ...(raw.task_context == null
      ? {}
      : { task_context: String(raw.task_context) as TaskContext }),
    ...(raw.product_context == null
      ? {}
      : { product_context: String(raw.product_context) as LegacyProductContext }),
    coverage,
    ...(contractCoverage == null ? {} : { contract_coverage: contractCoverage }),
    open_goal_ids: strings(raw.open_goal_ids),
    next_step: String(raw.next_step ?? "").trim(),
  };
}

export function readLeafReadiness(value: unknown): LeafReadiness | null {
  const raw = record(value);
  if (!raw) return null;
  const outputCoverage = Array.isArray(raw.output_coverage)
    ? raw.output_coverage
      .map(record)
      .filter((item): item is Record<string, unknown> => item != null)
      .map((item) => ({
        promised_output: String(item.promised_output ?? "").trim(),
        role: String(item.role ?? "") as LeafReadiness["output_coverage"][number]["role"],
        reason: String(item.reason ?? "").trim(),
      }))
    : [];
  const splitCandidates = Array.isArray(raw.split_candidates)
    ? raw.split_candidates
      .map(record)
      .filter((item): item is Record<string, unknown> => item != null)
      .map((item) => ({
        work_item: String(item.work_item ?? "").trim(),
        separately_deliverable: item.separately_deliverable === true,
        separately_acceptable: item.separately_acceptable === true,
        independently_reworkable: item.independently_reworkable === true,
        decision: String(item.decision ?? "") as LeafReadiness["split_candidates"][number]["decision"],
        reason: String(item.reason ?? "").trim(),
      }))
    : [];
  return {
    verdict: String(raw.verdict ?? "") as LeafReadiness["verdict"],
    primary_deliverable: String(raw.primary_deliverable ?? "").trim(),
    output_coverage: outputCoverage,
    split_candidates: splitCandidates,
    rationale: String(raw.rationale ?? "").trim(),
    unresolved_decisions: strings(raw.unresolved_decisions),
    independent_deliverables: strings(raw.independent_deliverables),
    acceptance_criterion_ids: strings(raw.acceptance_criterion_ids),
  };
}

function textList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(String).map((item) => item.trim()).filter(Boolean)
    : [];
}

export function goalAcceptanceCriteria(goal: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(goal.acceptance_criteria)
    ? goal.acceptance_criteria
      .map(record)
      .filter((item): item is Record<string, unknown> => item != null)
    : [];
}

export function sameStringSet(left: string[], right: string[]): boolean {
  return left.length === right.length && new Set(left).size === left.length &&
    left.every((item) => right.includes(item));
}

function splitSignalCount(candidate: LeafReadiness["split_candidates"][number]): number {
  return [
    candidate.separately_deliverable,
    candidate.separately_acceptable,
    candidate.independently_reworkable,
  ].filter(Boolean).length;
}

function leafIssue(
  item: ProposalItem,
  goalId: string,
  field: GoalDecompositionValidationIssue["field"],
  code: string,
  message: string,
  recovery: string,
  details: Pick<
    GoalDecompositionValidationIssue,
    | "missing_fields"
    | "affected_outputs"
    | "affected_work_items"
    | "affected_criterion_ids"
    | "invalid_path"
    | "received_value"
    | "allowed_values"
  > = {},
): GoalDecompositionValidationIssue {
  return {
    code,
    item_id: item.item_id ?? "",
    goal_id: goalId,
    field,
    message,
    recovery,
    ...details,
  };
}

/**
 * Validate the evidence behind a proposed executable leaf. This runs only on
 * proposal payloads, so historical accepted Goals are not retroactively
 * invalidated.
 */
export function goalProposalLeafReadinessIssues(
  item: ProposalItem,
  goal: Record<string, unknown>,
  payloadPath = "items[].payload",
): GoalDecompositionValidationIssue[] {
  const goalId = String(goal.goal_id ?? item.payload.goal_id ?? "").trim();
  const title = String(goal.title ?? (goalId || "未命名 Goal"));
  const state = String(goal.decomposition_state ?? "");
  const rawReadiness = goal.leaf_readiness;
  if (state !== "closed_leaf" && rawReadiness == null) return [];

  const issues: GoalDecompositionValidationIssue[] = [];
  const readiness = readLeafReadiness(rawReadiness);
  if (!readiness) {
    return [leafIssue(
      item,
      goalId,
      "leaf_readiness",
      "goal_tree_proposal.leaf_readiness_required",
      `Goal「${title}」要直接开始执行，必须先说明它唯一要交付什么，以及哪些工作需要另拆。`,
      `请按工具 schema 补全 ${payloadPath}.leaf_readiness 后重新提交；不要放在 item 顶层。`,
    )];
  }

  const rawReadinessRecord = record(rawReadiness)!;
  const readinessPath = `${payloadPath}.leaf_readiness`;
  const requiredArrayFields = [
    "output_coverage",
    "split_candidates",
    "unresolved_decisions",
    "independent_deliverables",
    "acceptance_criterion_ids",
  ];
  const missingArrays = requiredArrayFields.filter((field) => !Array.isArray(rawReadinessRecord[field]));
  const missingScalarFields = ["verdict", "primary_deliverable", "rationale"].filter((field) =>
    typeof rawReadinessRecord[field] !== "string" || !String(rawReadinessRecord[field]).trim()
  );
  const invalidStringArrays = [
    "unresolved_decisions",
    "independent_deliverables",
    "acceptance_criterion_ids",
  ].filter((field) => Array.isArray(rawReadinessRecord[field]) &&
    (rawReadinessRecord[field] as unknown[]).some((value) => typeof value !== "string" || !value.trim()));
  const rawCandidateEntries = Array.isArray(rawReadinessRecord.split_candidates)
    ? rawReadinessRecord.split_candidates.map((value, index) => ({ index, value: record(value) }))
    : [];
  const rawCandidates = rawCandidateEntries
    .map((entry) => entry.value)
    .filter((value): value is Record<string, unknown> => value != null);
  const hasInvalidCandidateSignals = (
    Array.isArray(rawReadinessRecord.split_candidates) &&
    rawCandidates.length !== rawReadinessRecord.split_candidates.length
  ) || rawCandidates.some((candidate) =>
    typeof candidate.separately_deliverable !== "boolean" ||
    typeof candidate.separately_acceptable !== "boolean" ||
    typeof candidate.independently_reworkable !== "boolean",
  );
  if (
    !["ready", "split_required"].includes(readiness.verdict) ||
    missingScalarFields.length > 0 ||
    missingArrays.length > 0 ||
    invalidStringArrays.length > 0 ||
    hasInvalidCandidateSignals
  ) {
    const invalidPaths = [
      ...missingScalarFields,
      ...missingArrays,
      ...invalidStringArrays,
      ...(hasInvalidCandidateSignals ? ["split_candidates[] 的三个拆分信号"] : []),
    ].map((field) => `${readinessPath}.${field}`);
    issues.push(leafIssue(
      item,
      goalId,
      "leaf_readiness",
      "goal_tree_proposal.leaf_readiness_invalid",
      `Goal「${title}」的叶子粒度判断缺少或包含无效字段：${invalidPaths.join("、")}。`,
      `请按工具 schema 补全 ${readinessPath} 后重新提交；不要把 leaf_readiness 放在 item 顶层。`,
      { missing_fields: invalidPaths },
    ));
  }

  const requiredSections: Array<[string, unknown]> = [
    ["要做的范围", goal.in_scope],
    ["明确不做", goal.out_of_scope],
    ["开始前需要的输入", goal.required_inputs],
    ["会交付的结果", goal.promised_outputs],
  ];
  const missingFields = requiredSections
    .filter(([, value]) => textList(value).length === 0)
    .map(([label]) => label);
  if (missingFields.length) {
    issues.push(leafIssue(
      item,
      goalId,
      "leaf_scope",
      "goal_tree_proposal.leaf_scope_incomplete",
      `Goal「${title}」还缺少：${missingFields.join("、")}。`,
      "请先把边界和输入输出写清楚，再判断它能否成为叶子。",
      { missing_fields: missingFields },
    ));
  }

  const criteria = goalAcceptanceCriteria(goal);
  const criterionIds = criteria
    .map((criterion) => String(criterion.criterion_id ?? "").trim())
    .filter(Boolean);
  const criteriaWithoutEvidence = criteria
    .filter((criterion) => textList(criterion.required_evidence).length === 0)
    .map((criterion) => String(criterion.criterion_id ?? criterion.statement ?? "未命名完成条件").trim());
  if (!criteria.length || criterionIds.length !== criteria.length || criteriaWithoutEvidence.length) {
    const affected = [
      ...(criterionIds.length !== criteria.length ? ["没有 ID 的完成条件"] : []),
      ...criteriaWithoutEvidence,
    ];
    issues.push(leafIssue(
      item,
      goalId,
      "acceptance_coverage",
      "goal_tree_proposal.leaf_acceptance_evidence_required",
      `Goal「${title}」有完成条件没有写清需要什么依据。`,
      "请为每条完成条件提供唯一 ID 和所需依据。",
      { affected_criterion_ids: affected },
    ));
  }

  const promisedOutputs = textList(goal.promised_outputs);
  const coveredOutputs = readiness.output_coverage.map((entry) => entry.promised_output);
  const invalidCoverage = readiness.output_coverage.filter((entry) =>
    !entry.promised_output || !["primary", "supporting", "independent"].includes(entry.role) || !entry.reason,
  );
  const missingOutputs = promisedOutputs.filter((output) => coveredOutputs.filter((item) => item === output).length !== 1);
  const unexpectedOutputs = coveredOutputs.filter((output) => !promisedOutputs.includes(output));
  if (invalidCoverage.length || missingOutputs.length || unexpectedOutputs.length) {
    const affected = [...new Set([
      ...missingOutputs,
      ...unexpectedOutputs,
      ...invalidCoverage.map((entry) => entry.promised_output || "未命名输出"),
    ])];
    issues.push(leafIssue(
      item,
      goalId,
      "output_coverage",
      "goal_tree_proposal.leaf_output_coverage_invalid",
      `Goal「${title}」没有逐项说明每个承诺结果是主要结果、配套产物，还是应当另拆。`,
      "请逐项覆盖“会交付的结果”，不要遗漏、重复或新增另一套名称。",
      { affected_outputs: affected },
    ));
  }

  const primaryEntries = readiness.output_coverage.filter((entry) => entry.role === "primary");
  if (
    !readiness.primary_deliverable ||
    primaryEntries.length !== 1 ||
    primaryEntries[0]?.promised_output !== readiness.primary_deliverable
  ) {
    issues.push(leafIssue(
      item,
      goalId,
      "output_coverage",
      "goal_tree_proposal.leaf_primary_output_invalid",
      `Goal「${title}」没有确定唯一的主要交付结果。`,
      "请从承诺结果中选出且只选出一个主要结果；其他结果只能是同一次验收的配套产物。",
      { affected_outputs: primaryEntries.map((entry) => entry.promised_output) },
    ));
  }

  const invalidCandidateDecisions = rawCandidateEntries.filter((entry) =>
    entry.value != null && !["keep", "split"].includes(String(entry.value.decision ?? "")),
  );
  for (const invalid of invalidCandidateDecisions) {
    const received = invalid.value!.decision;
    const invalidPath = `${readinessPath}.split_candidates[${invalid.index}].decision`;
    issues.push(leafIssue(
      item,
      goalId,
      "split_candidates",
      "goal_tree_proposal.leaf_split_candidate_decision_invalid",
      `${invalidPath}=${String(received ?? "")}；allowed: keep, split。`,
      "decision 只能是 keep 或 split。若该工作本轮明确不做，请把它移出 split_candidates，写入 Goal 的 out_of_scope 或提案叙事中的延后说明；若它应独立交付，请选择 split 并新建独立 Goal。",
      {
        invalid_path: invalidPath,
        received_value: received,
        allowed_values: ["keep", "split"],
        affected_work_items: [String(invalid.value!.work_item ?? "未命名工作").trim() || "未命名工作"],
      },
    ));
  }
  const invalidCandidates = readiness.split_candidates.filter((candidate) =>
    !candidate.work_item || !candidate.reason,
  );
  const shouldSplitButKept = readiness.split_candidates.filter((candidate) =>
    splitSignalCount(candidate) >= 2 && candidate.decision !== "split",
  );
  if (invalidCandidates.length) {
    issues.push(leafIssue(
      item,
      goalId,
      "split_candidates",
      "goal_tree_proposal.leaf_split_candidate_invalid",
      `Goal「${title}」有候选工作没有写清要留在当前 Goal，还是拆成独立 Goal。`,
      "请逐项写明判断和理由。",
      { affected_work_items: invalidCandidates.map((candidate) => candidate.work_item || "未命名工作") },
    ));
  }
  if (shouldSplitButKept.length) {
    issues.push(leafIssue(
      item,
      goalId,
      "split_candidates",
      "goal_tree_proposal.leaf_split_signal_ignored",
      `Goal「${title}」仍包含可以单独交付、单独验收或独立返工的工作：${shouldSplitButKept.map((candidate) => candidate.work_item).join("、")}。`,
      "这些工作至少命中两项拆分信号，必须成为独立 Goal。",
      { affected_work_items: shouldSplitButKept.map((candidate) => candidate.work_item) },
    ));
  }

  const splitItems = readiness.split_candidates
    .filter((candidate) => candidate.decision === "split")
    .map((candidate) => candidate.work_item);
  const independentOutputs = readiness.output_coverage
    .filter((entry) => entry.role === "independent")
    .map((entry) => entry.promised_output);
  const requiresSplit = splitItems.length > 0 || independentOutputs.length > 0 || readiness.independent_deliverables.length > 0;
  if (requiresSplit && readiness.verdict !== "split_required") {
    issues.push(leafIssue(
      item,
      goalId,
      "leaf_readiness",
      "goal_tree_proposal.leaf_split_verdict_required",
      `Goal「${title}」已经指出有工作需要另拆，却仍把整条 Goal 判断为可以直接执行。`,
      "请把结论改为“仍需拆分”，并把这些工作提交为独立 Goal。",
      {
        affected_outputs: [...independentOutputs, ...readiness.independent_deliverables],
        affected_work_items: splitItems,
      },
    ));
  }

  if (state === "closed_leaf") {
    const blockers = [
      ...readiness.unresolved_decisions,
      ...readiness.independent_deliverables,
      ...independentOutputs,
      ...splitItems,
    ];
    if (readiness.verdict !== "ready" || blockers.length) {
      issues.push(leafIssue(
        item,
        goalId,
        "leaf_readiness",
        "goal_tree_proposal.leaf_not_ready",
        `Goal「${title}」还有未解决的决定或应当拆出的独立结果，暂时不能作为叶子开始执行。`,
        "请继续澄清或拆分；处理完后再提交为可执行叶子。",
        {
          affected_outputs: [...readiness.independent_deliverables, ...independentOutputs],
          affected_work_items: [...readiness.unresolved_decisions, ...splitItems],
        },
      ));
    }
    if (!sameStringSet(readiness.acceptance_criterion_ids, criterionIds)) {
      issues.push(leafIssue(
        item,
        goalId,
        "acceptance_coverage",
        "goal_tree_proposal.leaf_acceptance_coverage_invalid",
        `Goal「${title}」的叶子判断没有覆盖全部完成条件。`,
        "请让叶子判断逐项引用这条 Goal 的全部完成条件，不能遗漏或引用其他 Goal。",
        { affected_criterion_ids: [...new Set([...criterionIds, ...readiness.acceptance_criterion_ids])] },
      ));
    }
  }

  return issues;
}


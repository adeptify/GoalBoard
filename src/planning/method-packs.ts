export type PlanningMethodScope = "built_in" | "personal" | "project";
export type PlanningMethodKind = "meta" | "work_type" | "domain" | "custom";

export interface PlanningCoverageRule {
  area: string;
  label: string;
  question: string;
}

export interface PlanningDependencyRule {
  rule_id: string;
  statement: string;
  direction_hint: string;
}

export interface PlanningMethodPack {
  method_id: string;
  version: number;
  scope: PlanningMethodScope;
  kind: PlanningMethodKind;
  name: string;
  summary: string;
  applies_to: string[];
  domain_tags: string[];
  steps: string[];
  required_coverage: PlanningCoverageRule[];
  dependency_rules: PlanningDependencyRule[];
  evidence_requirements: string[];
  completion_checks: string[];
  failure_modes: string[];
  source_refs: string[];
  confidence: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type PlanningMethodPackInput = Omit<
  PlanningMethodPack,
  "scope" | "version" | "created_at" | "updated_at"
> & { version?: number };

export interface ResolvedPlanningMethodPack extends PlanningMethodPack {
  overridden_scopes: PlanningMethodScope[];
}

export interface PlanningMethodPath {
  method_id: string;
  method_name: string;
  kind: PlanningMethodKind;
  steps: string[];
}

export interface PlanningMethodComposition {
  method_pack_ids: string[];
  method_names: string[];
  method_paths: PlanningMethodPath[];
  required_coverage: PlanningCoverageRule[];
  dependency_rules: PlanningDependencyRule[];
  evidence_requirements: string[];
  completion_checks: string[];
  failure_modes: string[];
}

const BUILTIN_AT = "2026-08-22T00:00:00.000Z";

function coverage(area: string, label: string, question: string): PlanningCoverageRule {
  return { area, label, question };
}

function dependency(rule_id: string, statement: string, direction_hint: string): PlanningDependencyRule {
  return { rule_id, statement, direction_hint };
}

function builtin(input: Omit<PlanningMethodPack, "scope" | "version" | "enabled" | "created_at" | "updated_at">): PlanningMethodPack {
  return {
    ...input,
    scope: "built_in",
    version: 1,
    enabled: true,
    created_at: BUILTIN_AT,
    updated_at: BUILTIN_AT,
  };
}

const UNIVERSAL_COVERAGE = [
  coverage("final_outcome", "最终结果", "最终交付什么、由谁使用、成功后发生什么变化？"),
  coverage("operating_flow", "实际流程", "结果如何被产生、使用、维护，关键角色怎样协作？"),
  coverage("core_capabilities", "核心能力", "完成主任务必须具备哪些业务或专业能力？"),
  coverage("foundation_infrastructure", "基础能力与基建", "核心能力消费哪些数据、资产、工具、权限或环境？"),
  coverage("quality_continuous_delivery", "质量与持续交付", "如何验证、交付、监控、恢复并持续改进？"),
] as const;

const COMMON_DEPENDENCIES = [
  dependency("output-consumption", "只有下游 Goal 明确消费上游 Goal 的可验收结果时才建立 depends_on。", "consumer depends_on provider"),
  dependency("decision-before-commitment", "会改变后续范围或方案的决定必须先于不可逆投入。", "commitment depends_on decision"),
  dependency("proof-before-close", "验证 Goal 消费被验证结果和完成标准，而不是反向依赖实现。", "verification depends_on deliverable"),
];

export const BUILTIN_PLANNING_METHOD_PACKS: readonly PlanningMethodPack[] = [
  builtin({
    method_id: "meta-domain-pack-builder",
    kind: "meta",
    name: "陌生领域方法包生成",
    summary: "先弄清领域中的对象、生命周期、产物、证据和专业依赖，再拆实际 Goal。",
    applies_to: ["未知领域", "现有方法包匹配不足"],
    domain_tags: ["meta", "discovery"],
    steps: [
      "界定领域边界、任务结果和主要使用者",
      "识别核心对象、角色、生命周期和价值流",
      "收集权威来源、专业标准与代表性案例",
      "提炼标准产物、证据门槛、依赖模式和失败模式",
      "用至少两个典型案例和一个反例校验方法包",
      "标注来源、适用范围、可信度和重新审查条件",
    ],
    required_coverage: [
      coverage("domain_objects", "领域对象", "领域中哪些对象会改变状态，谁对它们负责？"),
      coverage("domain_lifecycle", "领域生命周期", "工作从输入到结果通常经历哪些阶段？"),
      coverage("domain_artifacts", "专业产物", "每个阶段交付什么可使用、可检查的产物？"),
      coverage("domain_evidence", "证据标准", "专业上凭什么相信结果成立？"),
      coverage("domain_dependencies", "依赖模式", "哪些结果必须先出现，哪些工作可以并行？"),
      coverage("domain_failure_modes", "失败模式", "常见误拆、遗漏和错误顺序是什么？"),
    ],
    dependency_rules: COMMON_DEPENDENCIES,
    evidence_requirements: ["至少一个权威或一手来源", "至少一个可追溯实践来源", "典型案例与反例的校验记录"],
    completion_checks: ["适用边界明确", "依赖方向能用产出消费关系解释", "未知项和低可信判断显式可见"],
    failure_modes: ["直接套用相邻领域模板", "只整理术语而不建立生命周期", "研究尚未完成就开始拆实际 Goal"],
    source_refs: ["GoalBoard planning-engine spec"],
    confidence: 0.9,
  }),
  builtin({
    method_id: "work-build-change",
    kind: "work_type",
    name: "构建与改变",
    summary: "从可观察结果反推能力、基础和交付闭环。",
    applies_to: ["开发产品", "建立能力", "改变现有系统"],
    domain_tags: ["build", "change"],
    steps: ["定义最终结果和使用流程", "分离核心能力与支撑基础", "按独立交付和验收划分 Goal", "补齐验证、发布与恢复"],
    required_coverage: [...UNIVERSAL_COVERAGE],
    dependency_rules: COMMON_DEPENDENCIES,
    evidence_requirements: ["可运行或可使用的产物", "完成条件对应的检查证据"],
    completion_checks: ["用户结果可观察", "每条叶子只有一个主要验收结果", "基础结果被核心能力真实消费"],
    failure_modes: ["按文件或技术层机械拆分", "只列功能不列运行和交付", "把讨论顺序当执行顺序"],
    source_refs: ["GoalBoard universal result chain"],
    confidence: 0.95,
  }),
  builtin({
    method_id: "work-diagnose-fix",
    kind: "work_type",
    name: "诊断与修复",
    summary: "先复现和定位根因，再修复、回归并恢复可信状态。",
    applies_to: ["故障诊断", "缺陷修复", "质量问题"],
    domain_tags: ["diagnose", "fix"],
    steps: ["固定症状与复现条件", "缩小影响面并提出可证伪根因", "实施最小完整修复", "回归原场景和相邻边界"],
    required_coverage: [coverage("symptom", "症状", "什么输入、环境和动作稳定产生问题？"), coverage("root_cause", "根因", "哪个契约或状态转移导致症状？"), coverage("regression", "回归", "如何证明修复且没有破坏相邻路径？")],
    dependency_rules: [dependency("fix-after-cause", "修复依赖已验证的根因，不依赖未经证实的猜测。", "fix depends_on root-cause evidence"), ...COMMON_DEPENDENCIES],
    evidence_requirements: ["修复前失败证据", "修复后通过证据", "相邻路径回归"],
    completion_checks: ["根因能解释全部关键症状", "修复没有靠补丁互相补偿"],
    failure_modes: ["看到报错就加条件", "只消除表面症状", "缺少修复前后对照"],
    source_refs: ["GoalBoard planning-engine spec"], confidence: 0.94,
  }),
  builtin({
    method_id: "work-analyze-decide", kind: "work_type", name: "分析与决策", summary: "从问题、证据和备选方案走到可追溯决定。",
    applies_to: ["数据分析", "市场判断", "方案选择"], domain_tags: ["analysis", "decision"],
    steps: ["定义决策和成功标准", "确认数据与证据边界", "形成可比较选项", "记录决定、理由和复盘触发条件"],
    required_coverage: [coverage("decision_question", "决策问题", "这次分析最终要支持哪个决定？"), coverage("evidence_base", "证据基础", "数据和证据的来源、质量与限制是什么？"), coverage("alternatives", "备选方案", "有哪些真正不同的选项和取舍？")],
    dependency_rules: [dependency("decision-after-evidence", "决定消费分析证据，分析不依赖预设结论。", "decision depends_on evidence"), ...COMMON_DEPENDENCIES],
    evidence_requirements: ["来源和口径", "关键假设", "反证或敏感性检查"], completion_checks: ["结论能追溯到证据", "限制和不确定性可见"],
    failure_modes: ["先有结论再找数据", "堆资料但不形成选项", "把相关性写成因果"], source_refs: ["GoalBoard planning-engine spec"], confidence: 0.94,
  }),
  builtin({
    method_id: "work-design-plan", kind: "work_type", name: "设计与规划", summary: "先固定目标和约束，再形成可验证方案与落地路径。",
    applies_to: ["产品设计", "系统设计", "项目规划"], domain_tags: ["design", "plan"],
    steps: ["建立目标、受众和约束", "形成少量差异明确的方向", "验证关键风险和核心切片", "拆成有依赖的落地计划"],
    required_coverage: [coverage("design_intent", "设计意图", "为谁解决什么问题，什么不做？"), coverage("design_constraints", "关键约束", "哪些现实边界会改变方案？"), coverage("validation_slice", "验证切片", "哪一个小而真的结果能最早验证方向？")],
    dependency_rules: [dependency("implementation-after-direction", "大规模实现依赖关键方向和高风险切片验证。", "implementation depends_on validated direction"), ...COMMON_DEPENDENCIES],
    evidence_requirements: ["可见或可操作的方案", "关键场景验证"], completion_checks: ["方案能指导实际行为", "主要取舍已经明确"],
    failure_modes: ["只有文字没有真实切片", "无限发散不做取舍", "过早进入全面实现"], source_refs: ["GoalBoard planning-engine spec"], confidence: 0.93,
  }),
  builtin({
    method_id: "work-migrate-refactor", kind: "work_type", name: "迁移与重构", summary: "先建立兼容和回退边界，再分段替换并验证。",
    applies_to: ["数据迁移", "架构重构", "系统替换"], domain_tags: ["migration", "refactor"],
    steps: ["盘点现状和兼容契约", "定义目标状态与迁移批次", "准备回退和双向验证", "分段切换并清理旧路径"],
    required_coverage: [coverage("baseline_contract", "现有契约", "哪些行为和数据必须保留？"), coverage("migration_path", "迁移路径", "每一批如何进入、验证和退出？"), coverage("rollback", "回退", "失败时怎样恢复到可信状态？")],
    dependency_rules: [dependency("cutover-after-proof", "切换依赖迁移验证和可用回退。", "cutover depends_on validation and rollback"), ...COMMON_DEPENDENCIES],
    evidence_requirements: ["迁移前后对账", "回退演练或可复现步骤"], completion_checks: ["旧路径明确退出", "没有静默丢失兼容行为"],
    failure_modes: ["边改边迁没有基线", "只迁成功路径", "旧逻辑永久并存"], source_refs: ["GoalBoard planning-engine spec"], confidence: 0.94,
  }),
  builtin({
    method_id: "work-operate-process", kind: "work_type", name: "运营与流程", summary: "围绕角色、触发、交接、例外和度量建立可运行流程。",
    applies_to: ["运营机制", "组织流程", "重复性工作"], domain_tags: ["operations", "process"],
    steps: ["定义触发和服务对象", "明确角色、交接和权限", "设计正常流与例外流", "建立度量和复盘"],
    required_coverage: [coverage("roles_responsibilities", "角色与职责", "谁发起、执行、批准和兜底？"), coverage("exception_handling", "例外处理", "失败、超时和冲突怎样恢复？"), coverage("measurement", "衡量方式", "如何知道流程有效且值得继续？")],
    dependency_rules: COMMON_DEPENDENCIES, evidence_requirements: ["真实流程记录", "例外案例", "结果指标"], completion_checks: ["交接无隐含责任", "异常有恢复入口"],
    failure_modes: ["只画正常流程", "套用全职团队责任制", "没有可观察结果"], source_refs: ["GoalBoard planning-engine spec"], confidence: 0.93,
  }),
  builtin({
    method_id: "work-content-communication", kind: "work_type", name: "内容与传播", summary: "从受众和传播时刻出发，建立主张、证据、载体和反馈闭环。",
    applies_to: ["内容生产", "品牌传播", "推广文案"], domain_tags: ["content", "communication"],
    steps: ["定义受众和传播时刻", "确定核心主张与可信证据", "按渠道设计内容形态", "发布、观察和迭代"],
    required_coverage: [coverage("audience_moment", "受众与时刻", "谁在什么情境下会看到并行动？"), coverage("claim_evidence", "主张与证据", "为什么应该相信这条表达？"), coverage("distribution_feedback", "分发与反馈", "内容如何触达并怎样判断有效？")],
    dependency_rules: COMMON_DEPENDENCIES, evidence_requirements: ["受众问题证据", "产品或事实证据", "传播反馈"], completion_checks: ["一句话能说清独特机制", "表达与真实产品一致"],
    failure_modes: ["只有口号没有证据", "对所有人说同一句话", "发布后没有反馈入口"], source_refs: ["GoalBoard planning-engine spec"], confidence: 0.92,
  }),
  builtin({
    method_id: "domain-software-development", kind: "domain", name: "软件开发", summary: "按用户行为、系统契约、实现、验证和交付组织软件工作。",
    applies_to: ["应用开发", "服务开发", "工程改造"], domain_tags: ["software", "engineering", "app"],
    steps: ["确定用户行为和系统边界", "明确数据、状态和接口契约", "实现最小垂直切片", "测试集成、异常和发布路径"],
    required_coverage: [coverage("core_function", "核心功能", "哪条真实用户或调用路径必须工作？"), coverage("user_journey", "端到端用户旅程", "用户如何进入、完成并从异常中恢复？"), coverage("interaction_ui", "交互与 UI", "人如何观察和控制系统？"), coverage("content_information", "内容与信息", "系统需要呈现和保存哪些信息？")],
    dependency_rules: [dependency("contract-before-consumer", "消费者实现依赖稳定且可验证的提供者契约。", "consumer depends_on provider contract"), ...COMMON_DEPENDENCIES],
    evidence_requirements: ["定向测试", "构建或类型检查", "真实主路径"], completion_checks: ["输入输出和错误路径明确", "发布与恢复可执行"],
    failure_modes: ["按前后端文件夹拆 Goal", "单元测试通过就宣称产品可用", "无异常和迁移路径"], source_refs: ["GoalBoard engineering protocol"], confidence: 0.96,
  }),
  builtin({
    method_id: "domain-data-analysis", kind: "domain", name: "数据分析", summary: "从决策问题、口径和数据质量走到可复现结论。",
    applies_to: ["指标分析", "因果探索", "预测与分群"], domain_tags: ["data", "analysis"],
    steps: ["定义决策问题和分析单位", "固定口径、时间窗和数据来源", "清洗并检查偏差", "分析、敏感性检查和可复现交付"],
    required_coverage: [coverage("data_question", "分析问题", "结果要支持什么决定？"), coverage("data_quality", "数据与口径", "来源、缺失、偏差和定义是什么？"), coverage("analysis_validity", "分析有效性", "哪些假设、对照和敏感性需要检查？"), coverage("decision_delivery", "决策交付", "结论怎样被使用和复现？")],
    dependency_rules: [dependency("analysis-after-quality", "正式分析依赖冻结的口径和通过检查的数据集。", "analysis depends_on validated data"), ...COMMON_DEPENDENCIES],
    evidence_requirements: ["数据来源和口径", "可复现查询或脚本", "质量与敏感性检查"], completion_checks: ["结论回答原决策问题", "限制和外推边界明确"],
    failure_modes: ["先画图再定义问题", "混用口径", "把相关性当因果"], source_refs: ["GoalBoard planning-engine spec"], confidence: 0.94,
  }),
  builtin({
    method_id: "domain-market-analysis", kind: "domain", name: "市场分析", summary: "形成市场格局、差异、选项和待验证假设，而不是堆资料。",
    applies_to: ["市场研究", "竞品分析", "进入策略"], domain_tags: ["market", "competition", "growth"],
    steps: ["定义市场边界和决策", "分层识别用户、替代方案和价值链", "比较关键差异与证据", "形成方向选项和验证计划"],
    required_coverage: [coverage("market_boundary", "市场边界", "在解决什么问题的哪一层竞争？"), coverage("customer_moment", "用户时刻", "谁在什么场景下选择或放弃现有方案？"), coverage("alternatives_competition", "替代与竞争", "真正的替代方案和结构性差异是什么？"), coverage("strategic_options", "方向选项", "对当前项目意味着哪些可选路径？")],
    dependency_rules: [dependency("recommendation-after-landscape", "方向建议依赖市场边界、用户和替代证据。", "recommendation depends_on market evidence"), ...COMMON_DEPENDENCIES],
    evidence_requirements: ["一手或权威市场来源", "真实用户/产品证据", "关键假设的验证方式"], completion_checks: ["选项而非唯一武断结论", "明确对当前项目的含义"],
    failure_modes: ["竞品功能表代替市场分析", "用没有表达需求否定创新", "堆链接没有决策"], source_refs: ["GoalBoard planning-engine spec"], confidence: 0.93,
  }),
  builtin({
    method_id: "domain-product-ux", kind: "domain", name: "产品与 UX", summary: "从用户目标和关键动线验证产品行为，再扩展完整体验。",
    applies_to: ["产品设计", "交互设计", "体验优化"], domain_tags: ["product", "ux"],
    steps: ["定义用户、时刻和现有阻力", "设计核心动线和状态", "制作真实高保真切片", "补齐首次使用、异常和响应式体验"],
    required_coverage: [coverage("user_problem", "用户问题", "用户此刻真正想完成什么？"), coverage("core_flow", "核心动线", "最短闭环怎样自然发生？"), coverage("system_feedback", "状态与反馈", "用户如何知道发生了什么并可干预？"), coverage("edge_experience", "边界体验", "首次、空、错、慢和恢复怎样处理？")],
    dependency_rules: [dependency("scale-after-slice", "全面实现依赖一个真实高保真切片验证。", "full build depends_on validated slice"), ...COMMON_DEPENDENCIES],
    evidence_requirements: ["可见可操作的关键切片", "真实内容和关键状态"], completion_checks: ["无需解释文案也能推进主任务", "信息层级和错误恢复清楚"],
    failure_modes: ["通用 Dashboard 套模板", "只改样式不改动线", "靠大段文案解释交互"], source_refs: ["GoalBoard product protocol"], confidence: 0.95,
  }),
  builtin({
    method_id: "domain-ai-data-product", kind: "domain", name: "AI 与数据产品", summary: "同时覆盖数据、评测、运行成本、安全和用户干预。",
    applies_to: ["AI 功能", "Agent 产品", "数据产品"], domain_tags: ["ai", "data-product"],
    steps: ["定义 AI 角色和消费上下文", "建立数据与评测基线", "设计产物、观察和干预位置", "验证成本、安全、失败与恢复"],
    required_coverage: [coverage("ai_data_sources_quality", "数据来源与质量", "输入来自哪里，质量和许可如何保证？"), coverage("ai_evaluation", "评测与效果边界", "如何衡量好坏和知道不能做什么？"), coverage("ai_runtime_cost", "运行方式与成本", "延迟、成本、超时和重试怎样约束？"), coverage("ai_safety_governance", "安全与治理", "用户怎样观察、干预和恢复低质量结果？")],
    dependency_rules: [dependency("ai-after-eval-baseline", "AI 实现和上线依赖数据与可复现评测基线。", "runtime capability depends_on data and evaluation"), ...COMMON_DEPENDENCIES],
    evidence_requirements: ["代表性评测集", "质量/成本/延迟结果", "失败和恢复演练"], completion_checks: ["AI 产生可用产物或状态变化", "低质量和超时有恢复"],
    failure_modes: ["把 AI 简化成聊天框", "只看演示样例", "没有人类干预位置"], source_refs: ["GoalBoard planning-engine spec"], confidence: 0.94,
  }),
  builtin({
    method_id: "domain-game-design", kind: "domain", name: "游戏设计", summary: "围绕核心循环、系统内容、玩家旅程和反馈建立可玩闭环。",
    applies_to: ["游戏设计", "玩法系统", "游戏内容"], domain_tags: ["game", "design"],
    steps: ["定义幻想、玩家动机和核心循环", "建立系统规则与内容供给", "设计玩家旅程和反馈", "制作可玩切片并测试节奏与平衡"],
    required_coverage: [coverage("core_gameplay", "核心玩法", "玩家反复做什么，为什么愿意继续？"), coverage("game_systems_content", "游戏系统与内容", "规则、资源和内容怎样支持循环？"), coverage("player_journey", "玩家旅程", "学习、成长、挑战和长期目标怎样展开？"), coverage("interaction_ui", "交互与 UI", "输入、反馈和信息怎样保护可玩性？"), coverage("audiovisual", "视听表现", "视听怎样传达状态并强化情绪？")],
    dependency_rules: [dependency("production-after-loop", "大规模内容和视听生产依赖已验证的核心可玩循环。", "production depends_on playable loop"), ...COMMON_DEPENDENCIES],
    evidence_requirements: ["可玩切片", "玩家行为观察", "规则和数值检查"], completion_checks: ["核心循环实际可玩", "内容与系统服务同一体验"],
    failure_modes: ["堆设定不做循环", "先生产大量内容", "只拆技术层不拆体验结果"], source_refs: ["GoalBoard planning-engine spec"], confidence: 0.94,
  }),
  builtin({
    method_id: "domain-research-content", kind: "domain", name: "研究与内容", summary: "确保来源、方法、审核和发布链路可信。",
    applies_to: ["研究报告", "知识内容", "深度文章"], domain_tags: ["research", "content"],
    steps: ["定义研究问题和读者用途", "建立来源与证据层级", "选择分析或生产方法", "审核、发布并保留可追溯引用"],
    required_coverage: [coverage("source_provenance", "资料来源与可信度", "来源是否一手、权威且能追溯？"), coverage("research_content_method", "研究或生产方法", "如何从资料得到结论或内容？"), coverage("review_approval", "审核与批准", "谁检查事实、逻辑和风险？"), coverage("publication_distribution", "发布与分发", "成果怎样到达读者并被正确使用？")],
    dependency_rules: [dependency("publication-after-review", "发布依赖来源、方法和审核完成。", "publication depends_on review"), ...COMMON_DEPENDENCIES],
    evidence_requirements: ["可追溯来源", "方法说明", "审核记录"], completion_checks: ["结论不超出证据", "引用和限制可见"],
    failure_modes: ["二手摘要层层转述", "引用很多但没有方法", "把内容完成当传播完成"], source_refs: ["GoalBoard planning-engine spec"], confidence: 0.94,
  }),
  builtin({
    method_id: "domain-operations-organization", kind: "domain", name: "运营与组织流程", summary: "把角色、权限、工具、例外和度量连成可持续运行闭环。",
    applies_to: ["组织流程", "服务运营", "跨角色协作"], domain_tags: ["operations", "organization"],
    steps: ["定义服务结果与触发", "配置角色、权限和工具", "设计交接与例外", "运行、度量并改进"],
    required_coverage: [coverage("roles_responsibilities", "角色与职责", "真实投入条件下谁负责什么？"), coverage("permissions", "权限与授权", "哪些动作需要谁批准？"), coverage("tools_workflow", "工具与工作流", "事实在哪记录，怎样交接？"), coverage("exception_handling", "例外处理", "阻塞、冲突和失败如何处理？"), coverage("measurement", "衡量方式", "如何观察效率、质量和结果？")],
    dependency_rules: COMMON_DEPENDENCIES, evidence_requirements: ["角色确认", "真实流程演练", "结果指标"], completion_checks: ["流程能在现实投入下运转", "异常有明确负责人和恢复动作"],
    failure_modes: ["照搬大公司流程", "责任与投入不匹配", "记录系统和实际工作脱节"], source_refs: ["GoalBoard planning-engine spec"], confidence: 0.93,
  }),
  builtin({
    method_id: "domain-app-product", kind: "domain", name: "通用 App", summary: "兼容历史 app task context 的产品完整性检查。",
    applies_to: ["通用应用产品"], domain_tags: ["app"],
    steps: ["定义核心功能", "走通端到端旅程", "补齐交互与信息", "验证质量和交付"],
    required_coverage: [coverage("core_function", "核心功能", "App 的主任务是什么？"), coverage("user_journey", "端到端用户旅程", "用户如何完成主任务？"), coverage("interaction_ui", "交互与 UI", "界面怎样引导和反馈？"), coverage("content_information", "内容与信息", "需要呈现和保存什么？")],
    dependency_rules: COMMON_DEPENDENCIES, evidence_requirements: ["端到端主路径"], completion_checks: ["核心功能和旅程闭环"],
    failure_modes: ["只列页面", "功能存在但用户走不通"], source_refs: ["GoalBoard legacy app context"], confidence: 0.96,
  }),
];

const SCOPE_WEIGHT: Record<PlanningMethodScope, number> = { built_in: 0, personal: 1, project: 2 };
const COMPOSITION_KIND_WEIGHT: Record<PlanningMethodKind, number> = {
  work_type: 0,
  domain: 1,
  custom: 2,
  meta: 3,
};

export function validatePlanningMethodPack(input: PlanningMethodPackInput | PlanningMethodPack): string[] {
  const issues: string[] = [];
  if (!input.method_id.trim() || !/^[a-z0-9][a-z0-9._-]*$/i.test(input.method_id)) issues.push("method_id 只能使用字母、数字、点、下划线和短横线");
  if (!input.name.trim()) issues.push("方法名称不能为空");
  if (!input.summary.trim()) issues.push("方法说明不能为空");
  if (!input.steps.length || input.steps.some((item) => !item.trim())) issues.push("至少需要一个有效拆分步骤");
  if (!input.required_coverage.length || input.required_coverage.some((item) => !item.area.trim() || !item.label.trim() || !item.question.trim())) issues.push("至少需要一个完整的必须覆盖项");
  if (!input.dependency_rules.length || input.dependency_rules.some((item) => !item.rule_id.trim() || !item.statement.trim() || !item.direction_hint.trim())) issues.push("至少需要一条完整的依赖规则");
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) issues.push("可信度必须在 0 到 1 之间");
  return issues;
}

export function normalizePlanningMethodPack(
  input: PlanningMethodPackInput,
  scope: Exclude<PlanningMethodScope, "built_in">,
  current: PlanningMethodPack | null,
  at: string,
): PlanningMethodPack {
  const normalized: PlanningMethodPack = {
    ...input,
    method_id: input.method_id.trim(),
    name: input.name.trim(),
    summary: input.summary.trim(),
    applies_to: input.applies_to.map((item) => item.trim()).filter(Boolean),
    domain_tags: input.domain_tags.map((item) => item.trim()).filter(Boolean),
    steps: input.steps.map((item) => item.trim()).filter(Boolean),
    required_coverage: input.required_coverage.map((item) => ({ area: item.area.trim(), label: item.label.trim(), question: item.question.trim() })),
    dependency_rules: input.dependency_rules.map((item) => ({ rule_id: item.rule_id.trim(), statement: item.statement.trim(), direction_hint: item.direction_hint.trim() })),
    evidence_requirements: input.evidence_requirements.map((item) => item.trim()).filter(Boolean),
    completion_checks: input.completion_checks.map((item) => item.trim()).filter(Boolean),
    failure_modes: input.failure_modes.map((item) => item.trim()).filter(Boolean),
    source_refs: input.source_refs.map((item) => item.trim()).filter(Boolean),
    scope,
    version: current ? current.version + 1 : Math.max(1, input.version ?? 1),
    created_at: current?.created_at ?? at,
    updated_at: at,
  };
  const issues = validatePlanningMethodPack(normalized);
  if (issues.length) throw new Error(issues.join("；"));
  return normalized;
}

export function resolvePlanningMethodPacks(
  personal: readonly PlanningMethodPack[] = [],
  project: readonly PlanningMethodPack[] = [],
): ResolvedPlanningMethodPack[] {
  const grouped = new Map<string, PlanningMethodPack[]>();
  for (const pack of [...BUILTIN_PLANNING_METHOD_PACKS, ...personal, ...project]) {
    grouped.set(pack.method_id, [...(grouped.get(pack.method_id) ?? []), pack]);
  }
  return [...grouped.values()].map((versions) => {
    const ordered = [...versions].sort((left, right) => SCOPE_WEIGHT[right.scope] - SCOPE_WEIGHT[left.scope] || right.version - left.version);
    const selected = ordered[0]!;
    return { ...selected, overridden_scopes: ordered.slice(1).map((item) => item.scope) };
  }).sort((left, right) => left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name));
}

export const TASK_CONTEXT_METHOD_IDS: Record<string, string[]> = {
  game: ["work-build-change", "domain-game-design"],
  app: ["work-build-change", "domain-app-product"],
  ai_data: ["work-build-change", "domain-ai-data-product"],
  content_research: ["work-content-communication", "domain-research-content"],
  operations: ["work-operate-process", "domain-operations-organization"],
  other: ["work-build-change"],
};

export function methodPacksForReview(
  available: readonly PlanningMethodPack[],
  methodPackIds: readonly string[],
  taskContext?: string | null,
): { packs: PlanningMethodPack[]; missing_ids: string[] } {
  const ids = methodPackIds.length ? [...new Set(methodPackIds)] : TASK_CONTEXT_METHOD_IDS[taskContext ?? "other"] ?? TASK_CONTEXT_METHOD_IDS.other;
  const byId = new Map(available.filter((pack) => pack.enabled).map((pack) => [pack.method_id, pack]));
  return {
    packs: ids.map((id) => byId.get(id)).filter((pack): pack is PlanningMethodPack => pack != null),
    missing_ids: ids.filter((id) => !byId.has(id)),
  };
}

export function mergedCoverageRules(packs: readonly PlanningMethodPack[]): PlanningCoverageRule[] {
  const rules = new Map<string, PlanningCoverageRule>();
  for (const pack of packs) for (const item of pack.required_coverage) if (!rules.has(item.area)) rules.set(item.area, item);
  return [...rules.values()];
}

/**
 * Builds the project planning lens consumed by a Runtime. Method paths stay
 * separate because multiple methods are complementary reasoning passes, not a
 * single mechanically serial workflow. Omission and completion rules are
 * merged so the Runtime can check the whole project contract in one pass.
 */
export function composePlanningMethodPacks(
  packs: readonly PlanningMethodPack[],
): PlanningMethodComposition {
  const selected = packs
    .filter((pack) => pack.enabled)
    .sort((left, right) => COMPOSITION_KIND_WEIGHT[left.kind] - COMPOSITION_KIND_WEIGHT[right.kind]
      || left.name.localeCompare(right.name)
      || left.method_id.localeCompare(right.method_id));
  const coverage = new Map<string, PlanningCoverageRule>();
  const dependencies = new Map<string, PlanningDependencyRule>();
  const mergeValues = (read: (pack: PlanningMethodPack) => readonly string[]): string[] => {
    const values = new Set<string>();
    for (const pack of selected) {
      for (const raw of read(pack)) {
        const value = raw.trim();
        if (value) values.add(value);
      }
    }
    return [...values];
  };
  for (const pack of selected) {
    for (const rule of pack.required_coverage) {
      const current = coverage.get(rule.area);
      if (!current) {
        coverage.set(rule.area, { ...rule });
        continue;
      }
      const questions = new Set(current.question.split("；").map((item) => item.trim()).filter(Boolean));
      questions.add(rule.question.trim());
      coverage.set(rule.area, { ...current, question: [...questions].join("；") });
    }
    for (const rule of pack.dependency_rules) {
      const key = `${rule.statement.trim()}\u0000${rule.direction_hint.trim()}`;
      if (!dependencies.has(key)) dependencies.set(key, { ...rule });
    }
  }
  return {
    method_pack_ids: selected.map((pack) => pack.method_id),
    method_names: selected.map((pack) => pack.name),
    method_paths: selected.map((pack) => ({
      method_id: pack.method_id,
      method_name: pack.name,
      kind: pack.kind,
      steps: [...pack.steps],
    })),
    required_coverage: [...coverage.values()],
    dependency_rules: [...dependencies.values()],
    evidence_requirements: mergeValues((pack) => pack.evidence_requirements),
    completion_checks: mergeValues((pack) => pack.completion_checks),
    failure_modes: mergeValues((pack) => pack.failure_modes),
  };
}

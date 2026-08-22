# Product

<!-- impeccable:product-schema 1 -->

## Platform

web + desktop

## Users

主要用户是同时使用 Codex、Claude Code、Cursor 等 AI Runtime 推进真实项目的个人开发者、产品负责人和小团队。他们需要在多个 Session 或 Runtime 之间持续工作，但不希望靠聊天记录猜测当前目标、下一步、风险和完成标准。

V1 首先服务单设备、单 Workspace 的本地使用场景。用户在正在对话的 Runtime 中调用统一 Skill；Runtime 通过 MCP 主动选择和领取工作，并在同一对话中澄清与承接用户决定。CLI 是管理和调试入口，Web 是可选查看与确认界面，不是 Runtime 的必经步骤。macOS App 与浏览器打开同一套 loopback Web 工作台；Goal 详情右侧可以托管用户显式打开的本地 TUI 视口。终端栏会持续显示它属于哪条 Goal，切换 Goal 不会改绑已有终端。由子 Goal 共同完成的复合父 Goal 始终不直接开工，而是引导用户进入具体子 Goal；父 Goal 自动完成后也不会重新开放终端。打开页面不会自动绑定 Session，Board 仍不派单。

## Product Purpose

GoalBoard 是 Goal 的权威真相源。它把用户意图逐步整理成可理解、可执行、可验收的 Goal Spine，并清楚显示：

- 最终想实现什么；
- 当前为什么做这一步；
- 哪些叶子 Goal 已经可以执行；
- 哪些依赖、风险或决策正在阻塞；
- 谁正在尝试、提交了什么证据；
- 什么条件满足后才算真正完成。

成功意味着用户不读技术协议也能在几秒内回答“现在目标是什么、接下来做什么、为什么还不能完成”。

## Positioning

GoalBoard 不是另一个 Kanban，也不是 Agent 调度器。它的差异机制是：

- 叶子 Goal 和 Task 是同一真相节点；
- Plan 和 TaskBoard 都是 Goal Spine 的派生视图；
- Runtime 自己查询、选择和领取，Board 不派单；
- 接受后的业务 Goal 不被静默改写；
- 依赖、风险、影响范围、Evidence 和 Review 决定工作是否安全、是否完成；
- 执行发现的新需求先作为 Candidate Goal，由用户确认后进入 Spine。

## Operating Context

V1 在本地 Workspace 中运行，共享 SQLite 保存权威状态。CLI、MCP 和 Web UI 使用同一套应用语义。

安装默认只把自包含程序、共享 Skill 和稳定启动器写入 `~/.goalboard`，不会修改项目或 Runtime 配置，也不会创建项目、关联 Session 或启动服务。Runtime 接入、项目管理和 Session 关联是安装后的独立显式流程，不能再用一个“安装后启用/启动项目”的总动作混在一起。Runtime 接入统一使用 adapter 的 `detect → plan → confirm → apply → validate → remove` 链路；当前配置 adapter 支持 Codex、Claude Code、OpenCode、Pi Agent 和 Grok Build；MCP 会话协议本身仍支持其他 Runtime。Pi 的 MCP 写入 `~/.pi/agent/mcp.json`，供官方推荐的 pi-mcp-adapter 读取。预览不返回用户配置全文，写入同时管理 MCP 与 Skill，失败自动回滚，移除只撤销 GoalBoard ownership receipt 证明仍属于自己的字段和链接。macOS 常驻 Web 同样先预览再确认，使用 LaunchAgent 的 RunAtLoad/KeepAlive 和可诊断日志，并显式提供安装时 Node 的 PATH；“已加载”和“进程正在运行”必须分别判断。用户在当前对话调用 Skill 后，GoalBoard 优先读取单次 MCP 调用元数据中的 Session ID，其次使用 Claude Code 等 adapter 的稳定 Session 信号；工作目录作为独立 workspace 用于查找用户以前明确关联过的项目，不伪装成 Session ID，也不是项目身份。普通选择只记录 workspace 历史；新 Session 仍须询问，即使只有一个候选。只有用户另行明确设置 workspace default 时才自动恢复。用户明确拒绝一个建议时，只在能识别该 Session 时记录本 Session 的拒绝；选择、默认、切换、解绑和删除仍各自需要明确确认。每个 GoalBoard 项目有自己的 SQLite DB，并按 `user`、`migrated_user`、`regenerable_demo` 分类；Web、CLI 和开发脚本共用同一 demo 生命周期。普通卸载先预览，只撤销 ownership receipt 仍能证明属于 GoalBoard 的接入和程序，清理可再生 demo，保留用户项目、catalog、备份与日志；永久清除用户数据必须再确认精确 home 和用户项目数量。Web 可选；Runtime 不因为 Web 未打开而停止澄清或执行。服务或项目连接不可用时，Runtime 报告事实，不自行创建另一个真相源、猜测项目或改写配置。

典型流程：用户在当前 Runtime 提出粗略想法或要求继续工作 → Skill 解析经用户确认的项目 → Runtime 对新想法开启 Draft 对话，或从 Available 自主选择一项并原子领取 → Runtime 回传 Run 和 Evidence，并在当前对话引导用户确认提案 → Board 派生一个工作状态并计算 Goal 是否满足 → 新发现通过 Candidate/Proposal 流程进入 Spine。Web 中，用户先在 Goal 详情的“概览”看到下一步、状态和唯一主操作；需要本人判断时，进入“等待你的决定”，逐项查看问题、现在为什么要决定、是否有可靠建议，以及每个选择会带来什么结果。

## Authority and Proposal Rules

- 用户可以直接手工录入 `draft / abstract` Goal；用户在当前 Runtime 提出粗略想法时，Runtime 可通过复合 MCP 创建最小 Draft 和澄清会话，但不把推断写成 accepted Contract 或 canonical 结构。
- Runtime 发现新需求时只提交 Candidate Goal。用户是否接受 Candidate、是否确认它引起的 Rewire 是两个独立决定；接受新 Goal 不等于同意它阻塞当前 Goal。
- 用户创建 Goal 时亲自指定的 `parent / depends_on` 可以直接成为 active；Runtime 发现的拆分、依赖或关系变化只能先成为 Proposal。
- 依赖 Proposal 不由 GoalBoard 扫描代码自动产生。Runtime 应结合 Contract、代码、文档、测试、数据结构、业务顺序、影响冲突和风险策略给出依据。
- 正式 Dependency Proposal 必须说明 `from_goal_id`、`to_goal_id`、类型、原因、`basis`、`evidence_refs`、`impact_if_rejected`、`confidence`，以及为什么方向是 A → B 而不是 B → A。
- 已确认依赖是 Claim 和完成的硬门禁。代码变化只能触发 revalidation / Rewire Proposal，不能静默删除或反转 active dependency。
- clarifier 认领手工 Draft 后，可以提出 Contract 补全建议；客观代码/文档事实可以标为 proposed/unconfirmed，业务意义、边界、优先级、验收和风险接受必须由用户确认。
- Draft 只有在用户确认 Contract 补全后才成为 accepted/executable。accepted Contract 不原地改写；后续需求创建新 Goal 并重排关系。
- 任何复杂 Goal 在标记为拆解完成前，都必须回到用户原始需求并逐项交代五层通用结果链：最终结果、实际流程、核心能力、基础能力与基建、质量与持续交付；不能因为最近讨论的内容很详细就默认省略支撑工作。随后再按任务补查：游戏关注玩法、玩家旅程、交互和视听；App 关注核心功能、端到端旅程、交互和信息；AI/数据关注数据质量、评测、运行成本与安全；内容/研究关注来源、方法、审核与发布；运营关注角色权限、工具流程、例外与衡量。每一项可以由同一个范围合理的子 Goal 承担，也可以说明不适用；核心能力和基础能力由不同 Goal 承担时，必须明确前者消费后者哪项结果以及依赖方向。
- 一条叶子 Goal 只能承诺一个可独立交付和验收的主要结果。进入决定中心前，Runtime 必须逐项说明承诺输出是主要结果、同一次验收所需的配套结果，还是应独立成 Goal 的结果；候选工作在“可单独交付、可单独验收、可独立返工”三项中满足至少两项时必须继续拆分。范围、非目标、输入、输出、验收证据或重要决定仍未写清时，它保持开放拆分，不能伪装成可直接执行的叶子。
- 一轮对话不必强行拆完整棵树，但阶段性暂停必须保留“仍需拆分”的状态，写明尚未拆完的 Goal 和下一步；只有关键路径都有明确归属且没有开放子树时，父 Goal 才能成为 `closed_compound`。

上述规则是产品 Contract。现阶段已具备 Candidate/Rewire、用户手工或对话初始化的 Draft、完整 Dependency Proposal、同一 Draft 的 Goal Tree 提案与用户原子确认，以及默认 Runtime MCP 暴露面收紧。普通 Runtime 只能读取、选择、认领、执行、提交 Proposal、证据和 Runtime Review，不能自行裁决 canonical Goal；用户确认前，当前 Draft、Policy、Impact 和 Risk 保持不变。用户确认的复合父 Goal 显示“已澄清，等待子 Goal”，确认的叶子显示“待执行”，仍未确认的 Draft 才显示“待澄清”；这是一套派生工作状态，不再另设“澄清完毕”。

父 Goal 的完成规则不能从“有子 Goal”这一事实直接猜测：只有用户已经确认的 `accepted / closed_compound` 才由全部生效子 Goal 自动完成。`abstract / frontier_open` 表示拆分尚未确认结束；即使当前列出的子 Goal 全部完成，父 Goal 也只表示“现有子项已完成，等待确认是否覆盖整个父目标”，不能自动完成。此时 Available 把父目标确认标为优先续办；用户下次要求继续或领取工作时，Runtime 先回到这个父 Goal，确认收口或继续补充子 Goal，不能直接跳过。标为 `closed_leaf` 却同时包含生效子 Goal 属于结构冲突，需要先确认它究竟是独立结果还是复合父 Goal。新增子 Goal 让已完成复合父 Goal 重新打开后，同样必须再次确认扩展后的拆分完整性。

用户或 Runtime 发现结果不符合预期、逻辑错误、体验阻塞或其他会让完成结论失真的问题时，必须把它带回 Goal 生命周期，不得只留在聊天或实现备注中。先查是否已有 Goal 负责：直接影响当前验收时保持未完成，并记录失败依据或真实阻塞；已有 Goal 覆盖时更新其下一步，不重复创建；需要独立交付或验收时提出纠正 Goal 并准确关联原 Goal；只有尚未发生的不确定情况才作为 Risk。该规则适用于代码、设计、内容、研究、运营等所有任务。

依赖或风险变化把 Goal 标记为 `needs_revalidation` 后，executor 继续被阻止；只有有效 revalidator Claim/Run 可以提交核对证据。Coordinator 在 accepted Contract、active dependencies 和 blocking Risks 全部通过时才恢复 `valid`，且该入口不能修改 Contract、关系或完成状态。

## Capabilities and Constraints

- V1 是单设备、单 Workspace、本地优先产品。
- SQLite 是权威真相源；JSON/Markdown 只用于导入、导出和可读快照。
- Goal 必须包含面向人的 `business_logic`，不用技术术语解释业务闭环。
- Goal 逐步拆解，不要求一开始列出所有远端实现任务；但每轮暂停都要保留开放边界，正式收口前必须确认产品关键路径没有被近期讨论主题淹没。
- Runtime-neutral。网页和 App 都可以托管用户显式打开的本地 TUI 视口，仍不派单、不选择谁来做。终端必须持续显示所属 Goal；复合父 Goal 无论正在等待还是已经完成，都只提供子 Goal 入口，不能新建、重新打开或继续写入执行终端。打开页面不等于启动 Runtime，也不自动绑定 Session。
- GoalBoard 是 pull-based 真相源：Runtime 自己读取、认领和回传，不由 Board 分发任务。
- 支持 self、cross、adversarial、human Review Policy，以及 Runtime Goal Mode 要求。
- Goal 详情按“概览 / 完成要求 / 进展与阻塞 / 关联与约束 / 完整记录”组织，一次只显示一个任务区域；概览回答下一步和目标说明，“关联与约束”集中维护关系、风险、影响范围和工作规则，完整记录只读保留原始事实与历史。
- Goal 标题旁提供“快速记录”，只录入完成依据、风险、影响范围或 Goal 关系；普通字段先出现，低频但必需的信息按需展开，保存失败必须明确指出缺什么。
- 项目默认工作规则属于项目设置，不混在单条 Goal 的完整记录里；单条 Goal 只能增加自己的额外要求。全局设置默认先进入项目，不把 AI Runtime 或 coding 工具当成所有项目的默认语境。
- Web UI 必须能查看 Goal Spine、Ready/Blocked、风险、Claim/Run、Evidence/Review 和 Candidate 决策。所有待决定事项先说明用户要回答的问题、为什么现在要回答和各选择的后果；没有可靠依据时不得假装给建议。决定中心在卡片关闭后仍用权威事件展示最近处理结果，并提供回到具体 Goal 记录的入口；没有改变风险状态的“继续待处理”必须明确说明该事项仍会留在决定中心，最近一次处理后才生成的待决定项必须标为新事项。风险处理类别是用户决定，页面必须直接提供选择，不能让 Runtime 用一段措施代替枚举；具体措施与处理类别分别保存。若 GoalBoard 已经判定方案结构无效，页面必须说清哪条 Goal 为什么还不能直接执行，并提供“先拆成可执行 Goal”的单一路径，系统自动记录检测到的问题，用户补充说明可选；只有有效方案被用户主观退回时才要求填写理由。
- V1 不包含云端多租户、复杂权限系统、第三方项目管理同步和完整 Runtime 运维。
- Actor 身份在 V1 可先采用本地声明身份；更强凭据属于后续能力。

## Brand Commitments

产品名使用 GoalBoard。界面默认中文，可切换英文；必要的协议字段保留简短英文。Goal 标题和用户正文保持原文，不随界面语言改写。

语言必须直接、具体、简洁、专业：状态名用“目标澄清中”“执行受阻”“待复核”这类短标签，需要解释时再说完整句子；避免幼稚化、过度解释，也避免“赋能、范式、编排中枢、智能协同”等空泛表达。视觉可以有鲜明个性，但不能牺牲任务、状态和操作的可读性。

目前没有确认的 Logo、品牌字体、客户案例或商业数据，不得虚构。

## Evidence on Hand

- `specs/goalboard-mvp/goalboard.md`：开发 Goal、Coverage、Risk 和 Review 状态。
- `specs/goalboard-mvp/domain-contract.md`：Canonical Domain Contract。
- `specs/goalboard-mvp/coordinator-contract.md`：Coordinator 决策与场景。
- `src/v1/`：SQLite Store、Coordinator、V1 types、管理 CLI 与一次性旧数据导入。
- `src/cli/main.ts` 与 `src/mcp/server.ts`：V1-only CLI/MCP 入口及 Runtime/management audience 边界。
- `src/web/`：读取同一 SQLite 的 Goal Tree 与文档式工作区。
- `desktop/`：可选 macOS App 壳，复用同一套带 TUI 的 Web 工作台。
- `tests/v1.test.ts`、`tests/mcp.test.ts`、`tests/web.test.ts`：状态门禁、权限、迁移和 UI 数据流证据。

## Product Principles

1. 先让人看懂，再让机器执行。
2. 结果和验收优先于活动记录。
3. 一个真相源，多个清晰视图。
4. 只展开眼前需要的 Goal，远端按条件再拆。
5. 所有阻塞和完成判断都要能解释原因。

## Accessibility & Inclusion

Web UI 必须支持键盘操作、清晰焦点、语义化结构、可读对比度、响应式布局和减少动态效果偏好。颜色不能成为区分 Ready、Blocked、Risk 和 Review 状态的唯一方式。

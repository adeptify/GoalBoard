# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

主要用户是同时使用 Codex、Claude Code、Cursor 等 AI Runtime 推进真实项目的个人开发者、产品负责人和小团队。他们需要在多个 Session 或 Runtime 之间持续工作，但不希望靠聊天记录猜测当前目标、下一步、风险和完成标准。

V1 首先服务单设备、单 Workspace 的本地使用场景。用户在正在对话的 Runtime 中调用统一 Skill；Runtime 通过 MCP 主动选择和领取工作，并在同一对话中澄清与承接用户决定。CLI 是管理和调试入口，Web 是可选查看与确认界面，不是 Runtime 的必经步骤。

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

安装默认只把自包含程序、共享 Skill 和稳定启动器写入 `~/.goalboard`，不会修改项目或 Runtime 配置，也不会创建项目、关联 Session 或启动服务。Runtime 接入、项目管理和 Session 关联是安装后的独立显式流程，不能再用一个“安装后启用/启动项目”的总动作混在一起。Runtime 接入统一使用 adapter 的 `detect → plan → confirm → apply → validate → remove` 链路；当前支持 Codex 和 Claude Code。预览不返回用户配置全文，写入同时管理 MCP 与 Skill，失败自动回滚，移除只撤销 GoalBoard ownership receipt 证明仍属于自己的字段和链接。用户在当前对话调用 Skill 后，Runtime 只通过宿主提供的稳定 Session ID 解析已确认的项目绑定；Codex 使用 `CODEX_THREAD_ID`，Claude Code 使用自己的 Session ID 信号，真正的新 Session 因而自然获得新入口 ID。宿主工作目录、会话标题和同 Runtime 历史只能用于建议候选，Runtime 必须先在当前对话问用户是否关联，绝不自动绑定。用户明确拒绝一个建议时，只在该 Session 不再重复该建议；选择、切换、解绑和删除仍各自需要明确确认。每个 GoalBoard 项目有自己的 SQLite DB。Web 可选；Runtime 不因为 Web 未打开而停止澄清或执行。服务或项目连接不可用时，Runtime 报告事实，不自行创建另一个真相源、猜测项目或改写配置。

典型流程：用户在当前 Runtime 提出粗略想法或要求继续工作 → Skill 解析经用户确认的项目 → Runtime 对新想法开启 Draft 对话，或从 Available 自主选择一项并原子领取 → Runtime 回传 Run 和 Evidence，并在当前对话引导用户确认提案 → Board 派生一个工作状态并计算 Goal 是否满足 → 新发现通过 Candidate/Proposal 流程进入 Spine。

## Authority and Proposal Rules

- 用户可以直接手工录入 `draft / abstract` Goal；用户在当前 Runtime 提出粗略想法时，Runtime 可通过复合 MCP 创建最小 Draft 和澄清会话，但不把推断写成 accepted Contract 或 canonical 结构。
- Runtime 发现新需求时只提交 Candidate Goal。用户是否接受 Candidate、是否确认它引起的 Rewire 是两个独立决定；接受新 Goal 不等于同意它阻塞当前 Goal。
- 用户创建 Goal 时亲自指定的 `parent / depends_on` 可以直接成为 active；Runtime 发现的拆分、依赖或关系变化只能先成为 Proposal。
- 依赖 Proposal 不由 GoalBoard 扫描代码自动产生。Runtime 应结合 Contract、代码、文档、测试、数据结构、业务顺序、影响冲突和风险策略给出依据。
- 正式 Dependency Proposal 必须说明 `from_goal_id`、`to_goal_id`、类型、原因、`basis`、`evidence_refs`、`impact_if_rejected`、`confidence`，以及为什么方向是 A → B 而不是 B → A。
- 已确认依赖是 Claim 和完成的硬门禁。代码变化只能触发 revalidation / Rewire Proposal，不能静默删除或反转 active dependency。
- clarifier 认领手工 Draft 后，可以提出 Contract 补全建议；客观代码/文档事实可以标为 proposed/unconfirmed，业务意义、边界、优先级、验收和风险接受必须由用户确认。
- Draft 只有在用户确认 Contract 补全后才成为 accepted/executable。accepted Contract 不原地改写；后续需求创建新 Goal 并重排关系。

上述规则是产品 Contract。现阶段已具备 Candidate/Rewire、用户手工或对话初始化的 Draft、完整 Dependency Proposal、同一 Draft 的 Goal Tree 提案与用户原子确认，以及默认 Runtime MCP 暴露面收紧。普通 Runtime 只能读取、选择、认领、执行、提交 Proposal、证据和 Runtime Review，不能自行裁决 canonical Goal；用户确认前，当前 Draft、Policy、Impact 和 Risk 保持不变。用户确认的复合父 Goal 显示“已澄清，等待子 Goal”，确认的叶子显示“待执行”，仍未确认的 Draft 才显示“待澄清”；这是一套派生工作状态，不再另设“澄清完毕”。

依赖或风险变化把 Goal 标记为 `needs_revalidation` 后，executor 继续被阻止；只有有效 revalidator Claim/Run 可以提交核对证据。Coordinator 在 accepted Contract、active dependencies 和 blocking Risks 全部通过时才恢复 `valid`，且该入口不能修改 Contract、关系或完成状态。

## Capabilities and Constraints

- V1 是单设备、单 Workspace、本地优先产品。
- SQLite 是权威真相源；JSON/Markdown 只用于导入、导出和可读快照。
- Goal 必须包含面向人的 `business_logic`，不用技术术语解释业务闭环。
- Goal 逐步拆解，不要求一开始列出所有远端 Goal。
- Runtime-neutral；不启动、托管、调度或选择 Runtime。
- GoalBoard 是 pull-based 真相源：Runtime 自己读取、认领和回传，不由 Board 分发任务。
- 支持 self、cross、adversarial、human Review Policy，以及 Runtime Goal Mode 要求。
- Web UI 必须能查看 Goal Spine、Ready/Blocked、风险、Claim/Run、Evidence/Review 和 Candidate 决策。
- V1 不包含云端多租户、复杂权限系统、第三方项目管理同步和完整 Runtime 运维。
- Actor 身份在 V1 可先采用本地声明身份；更强凭据属于后续能力。

## Brand Commitments

产品名使用 GoalBoard。界面默认中文，必要的协议字段保留简短英文。

语言必须直接、具体、口语化：优先说“下一步”“为什么被挡住”“完成还缺什么”，避免“赋能、范式、编排中枢、智能协同”等空泛表达。视觉可以有鲜明个性，但不能牺牲任务、状态和操作的可读性。

目前没有确认的 Logo、品牌字体、客户案例或商业数据，不得虚构。

## Evidence on Hand

- `specs/goalboard-mvp/goalboard.md`：开发 Goal、Coverage、Risk 和 Review 状态。
- `specs/goalboard-mvp/domain-contract.md`：Canonical Domain Contract。
- `specs/goalboard-mvp/coordinator-contract.md`：Coordinator 决策与场景。
- `src/v1/`：SQLite Store、Coordinator、V1 types、管理 CLI 与一次性旧数据导入。
- `src/cli/main.ts` 与 `src/mcp/server.ts`：V1-only CLI/MCP 入口及 Runtime/management audience 边界。
- `src/web/`：读取同一 SQLite 的 Goal Tree 与文档式工作区。
- `tests/v1.test.ts`、`tests/mcp.test.ts`、`tests/web.test.ts`：状态门禁、权限、迁移和 UI 数据流证据。

## Product Principles

1. 先让人看懂，再让机器执行。
2. 结果和验收优先于活动记录。
3. 一个真相源，多个清晰视图。
4. 只展开眼前需要的 Goal，远端按条件再拆。
5. 所有阻塞和完成判断都要能解释原因。

## Accessibility & Inclusion

Web UI 必须支持键盘操作、清晰焦点、语义化结构、可读对比度、响应式布局和减少动态效果偏好。颜色不能成为区分 Ready、Blocked、Risk 和 Review 状态的唯一方式。

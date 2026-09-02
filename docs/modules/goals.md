# Goals

**定位：** Goal Contract、关系图、Policy、Risk、Lifecycle、Project Guidance 与 Planning 规则的唯一 owner。

**拥有：** Goal identity/version、outcome/scope/criteria、parent/dependency graph、risk/policy、accepted contract revision、ready/completion lifecycle 和 planning analysis。

**公开面：** 查询列表/详情/关系/ready/read model；创建和修改 Draft、接受 Contract、管理关系/风险/策略、revalidate/complete/archive；发布 Goal 与图变化事件。

**不负责：** Claim/Run 属于 Execution，Evidence 属于 Evidence & Verification，Review/Proposal/Decision 属于 Governance，跨 Module provenance 属于 Context Ledger。Planning 可以提出变化，不能自行确认为正式 Goal 变化。

**特殊边界：** Goal 是官方签名保护的一等 Native Plugin；Module 仍与 UI Plugin 分离。引用使用 `goal_id + version`。

## 当前已经迁入

- `GoalsModule.query`：Board/Goal 列表与详情、关系、Risk link、Policy 合并、Project Guidance、archive/trash 过滤和 Goal-owned snapshot。不存在的 Board/Goal 保持稳定错误。
- Goal read application：`src/v1/goal-query-application.ts` 只组合公开 Goals Query 与其他 owner 的只读 port；Web、MCP、CLI 的 Contract/Policy/Guidance/回收站入口不再调用 Coordinator 查询实现。
- `GoalsModule.commands`：创建 Goal、更新 Draft、建立/解除关系、设置 Policy、登记/更新/处理 Risk、添加/修订/停用/恢复 Project Guidance。
- `GoalsModule.lifecycle`：接受 Draft、按同一 `goal_id` 增加 Contract revision、完成/重新校验、归档、回收站恢复、复合父 Goal 协调。
- Goal lifecycle migrations：归档、回收站、历史 Run/澄清状态、Active Goal 指针和 Contract coverage schema；由旧 Store 启动流程调用公开迁移函数，不保留第二份实现。
- `GoalsModule.planning`：项目规划方法选择与版本递增、完整 Runtime instructions、方法组合、关系图循环检查、执行顺序指标和需求变化影响分析。
- `modules/goals/methods/`：37 个内置规划方法的唯一发布资产；源码、npm package 和本地安装包读取同一目录。Home installer 只在已安装 Runtime Skill 下创建指向该目录的包内兼容链接，不保留第二份源文件。
- Planning decomposition validation：叶子 Goal 粒度检查和复合 Goal 覆盖检查拆成两个文件，均通过 Goals public entrypoint 调用；Proposal/Decision 只作为待检查输入，事实仍归 Governance。
- `GoalsApplicationApi`：把 Command、Lifecycle 与 Planning 组合成一个公开应用端口；Workbench、MCP、CLI 分别用自己的薄 adapter 接入，不导入 Goals implementation、Store 或 Coordinator 实现。
- `GoalsRepository`：上述 Command 使用的 Goal、criteria、relation、policy、risk、goal-risk link、guidance、event 和 idempotency 基础写入。
- 公开错误 Contract：旧 `GoalBoardV1Error` 通过兼容注入保留 `code/message/details`；直接使用 Module 时返回 `GoalsCommandError`。
- Web、MCP、CLI 和 Feed promotion 的 Goal 写入已经切到公开应用端口；旧 `GoalBoardCoordinator` 的写入、Lifecycle、Planning 同名转发方法已经删除，原有 payload、错误与结果保持不变。
- `plugins/native/goals` 的 `ExecutionValidationApplicationApi` 与 action projection 已成为 Claim → Run → Evidence → Review 的组合入口；三个 App adapter 共享同一 Query/Command port，具体事实仍由四个 Module 各自拥有。

## 仍未迁入

- Draft dialogue 与 Goal Tree Proposal/Decision 编排：它们跨 Governance、Execution 和 Goals，不吸收到 Goals Module，也不属于 EX4 的执行验收链；当前仍是后续入口收口范围。
- Query 兼容入口：少量旧 Coordinator 只读委托仍保留到对应 caller 完成切换；不得重新加入 Goal SQL 或业务判断。
- Goals UI 与产品文案：它们属于 `plugins/native/goals`，不是 Goals Module；待用户确认的 GW5 Candidate 负责从旧 renderer、全局 i18n 和 route composition 迁出。

Claims/Runs、Review obligation、Project active Goal 和 Action projection 通过窄 port 由各自 owner 提供；Goals Lifecycle 不跨模块直接读写 Store。Risk 的当前 Action 授权和 Lifecycle reconcile 仍是迁移接缝，后续 Execution/Governance/Query owner 会替换兼容实现。这个 port 不是第二套事实或通用 Event Bus。

**当前来源与 Goal：** Goals Query 与 GW1–GW4 已迁入 `modules/goals` 和三个 App adapter；零 caller 的 `src/planning/` re-export 与旧拆分校验文件已经删除。EX3 已把 Proposal/Decision 事实迁入 Governance；EX4 已迁 action/work projection 和执行验收入口。剩余 Draft Dialogue 与 Goal Tree 决定入口仍需在后续切片收口。

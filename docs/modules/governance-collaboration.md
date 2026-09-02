# Governance & Collaboration

**定位：** “谁提出了什么、谁复核了什么、谁确认了什么”的唯一事实 owner。

**拥有：** Review obligation、Runtime/Human Review、Contract Proposal、Candidate、Rewire、Goal Tree Proposal/Item/Decision、状态迁移，以及用户确认的 actor、来源、对话和消息引用。

## 公开入口

调用方只从 `@adeptify/goalboard-module-governance-collaboration` 进入，并持有 `GovernanceApplicationApi`：

- `query`：读取 Review、Proposal、Candidate、Rewire、Decision 和完整 Governance snapshot。
- `reviews`：提交已经完成授权检查的 Review，对账、重开或作废 obligation。
- `records`：保存已经授权的 Proposal / Candidate / Rewire / Decision，并执行正式状态迁移。
- `decisions.materializeAtomically`：把“记录决定”和“调用目标 owner 修改正式对象”放在同一事务中；任一步失败都会整体回滚。

授权、action token、幂等 Receipt 与跨 owner 用例编排由 EX4 的 `ExecutionValidationApplicationApi` 组合；Web、CLI、MCP 都通过各自 App adapter 进入，不再调用 Coordinator 的 Review/Evidence facade。

## 边界

- Governance 不直接修改 Goal、Artifact 或 Project Store。确认后的变更调用对应 owner 的公开 Command。
- Planning 只分析“可以怎么改”；正式 Proposal 和 Decision 只由 Governance 保存。未确认建议不会进入 canonical Goal graph。
- Evidence 保存证明材料；Governance 保存 Review verdict 和协作决定，两者不复制对方的事实。
- Identity / Team / Access 判断 actor 是否有权操作；Governance 只接收已经验证的授权上下文并保存审计来源。

## 当前实现

- `schema.ts` / `migrations.ts`：接管 Review、Proposal、Candidate、Rewire、Goal Tree Proposal/Decision 的 SQLite schema 与历史迁移。
- `repository.ts` / `mappers.ts`：Query、snapshot、Review 存储与事件序号读取。
- `review-lifecycle.ts`：obligation 对账、不同 reviewer 计数、Review 提交、满足、重开和作废。
- `record-store.ts` / `state-machine.ts`：Proposal、Decision、Candidate 与 Rewire 的正式写入和允许状态转换。
- `src/v1/store.ts` 只组合公开 schema、migration 与 Query；`src/v1/coordinator.ts` 只通过 `GovernanceApplicationApi` 调用 owner，不再持有 Governance 表 SQL。

**迁移 Goal：** EX3 已迁事实、状态机与公开端口；EX4 已切换 Claim → Run → Evidence → Review 入口并删除对应 Coordinator 编排。Goal Tree Proposal/Draft Dialogue 是另一条规划与决定入口，不被执行验收适配器吸收。

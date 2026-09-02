# @adeptify/goalboard-module-governance-collaboration

Status: `partial`  
Workspace path: `modules/governance-collaboration`  
Contract entrypoint: `@adeptify/goalboard-contracts/modules/governance-collaboration`

Review obligation、Review、Proposal、Decision 与用户确认来源的唯一 owner。

公开入口是 `GovernanceCollaborationModule`：调用方通过 `query` 读取正式记录，
通过 `reviews` 提交已经完成调用方授权检查的复核结果，通过 `records` 保存正式
Proposal/Decision，通过 `decisions` 保证跨 owner 物化的原子性。SQLite 表、映射和
状态更新都留在本包内；Planning 只生产分析结果，不直接写这些正式事实。

## Internal boundaries

- `schema.ts` / `migrations.ts`: Governance 自己的 SQLite schema 与历史升级。
- `repository.ts` / `mappers.ts`: 只读 Query、快照和 Review 存储。
- `review-lifecycle.ts`: Review obligation 对账、复核写入和重开。
- `record-store.ts` / `state-machine.ts`: Proposal、Decision、Candidate、Rewire 的正式状态迁移。
- `GovernanceApplicationApi.decisions`: Decision 与目标 owner Command 的原子事务边界。

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-ex3`
- `goal-reorg-ex4`

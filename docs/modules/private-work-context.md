# Private Work Context

**定位：** 用户或 Runtime 为完成工作产生的私人 Session、内容引用、workspace 关联和 handoff 事实的唯一 owner。

大白话说，它保存的是“这次私人工作从哪里开始、现在关联哪个 Project / Goal、私密过程内容放在哪里、换 Runtime 后从哪继续”。这些事实默认只在本机，不会因为进入 Team 就自动同步。

## 本模块拥有

- GoalBoard Session identity、Runtime native identity / correlation、surface identity。
- Session 与 Project、Goal、workspace 的关联和 Goal 历史。
- 本地加密的 Session event / content reference。
- Handoff 草稿、目标 Session、发送状态、重试与恢复事实。
- Runtime context binding、binding event、setup request 和 suggestion rejection。
- 旧 panel / binding 到新 Session Registry 的幂等迁移 receipt。

## 本模块不拥有

- Execution Claim / Run、Goal、Artifact、Project identity 或 workspace membership。
- Runtime 进程、Codex / PTY 协议、resume 调用和实际消息投递；这些由 WK2 的 Runtime Host 和 WK3 的 Work Plugin 编排。
- Desktop panel UI 状态。Panel 只把明确的用户选择写入本模块公开入口。
- Team 同步。私人过程要交换给别人，必须由用户显式发布为 Goal / Artifact 或未来明确选择共享的记录。

## 公开入口与内部拆分

所有业务调用从 `@adeptify/goalboard-module-private-work-context` 进入：

- `GoalBoardSessionRegistry`：兼容期 public facade，不保存混合实现。
- `session-records.ts`：Session、Project / Goal / workspace association。
- `session-events.ts` 与 `content-store.ts`：过滤元数据并本地加密保存内容。
- `session-handoffs.ts`：Handoff 状态、目标关联和中断恢复。
- `session-migration.ts`：旧数据迁移与 receipt。
- `context-bindings.ts`：Runtime context binding 的 schema、mapping 和 Repository。
- `session-schema.ts`：Session 数据库版本和共同校验。

`src/sessions/registry.ts`、`src/sessions/content-store.ts` 和 `src/sessions/types.ts` 只保留旧 caller 的薄兼容入口；Project Catalog 仍编排“选择哪个 Project”，但不再直接保存 Runtime Session binding SQL。

## 兼容与数据位置

- 继续使用 `~/.goalboard/sessions/sessions.db`、schema v3 和原有加密内容目录，不做破坏性搬库。
- 原 owner marker 继续作为数据兼容标识，不代表代码 owner 仍在旧目录。
- WK1 迁移事实 owner；WK2 迁移 Runtime Host，WK3 再清除 Work UI / resume / handoff caller 的兼容入口。

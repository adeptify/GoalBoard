# Execution

**定位：** Claim、Run、attempt、lease 与执行生命周期的唯一 owner。

**拥有：** Claim ownership/role、Run state、attempt、lease、start/report/release/revoke、block/failure/recovery 和 Runtime invocation reference。

**公开面：** `ExecutionModule.query` 查询 Claim、Run 和关联租约；`ExecutionModule.commands` 执行已授权的 claim、start、renew、report、release、revoke 和过期恢复；Repository 与 migration helper 维护唯一 schema。

**不负责：** 不拥有 Goal Contract、Evidence、Review、Session 或 Runtime process。Runtime Host 返回技术 Receipt 后，本 Module 才更新正式 Run；Goal 是否满足由 Goals 与 Evidence/Governance 门禁共同决定。

**当前实现：** EX1 已把 Claim/Run 类型、schema、历史 migration、Repository、状态机、租约过期和未结束 Run 恢复迁入 `modules/execution`。EX4 又把 Web/CLI/MCP 切到同一个 `ExecutionValidationApplicationApi`，并从 Coordinator 删除 Claim、Run、Evidence、Review 的公开编排方法。跨 owner 应用服务只把已授权的请求转给 Execution/Evidence/Governance/Goals 公开端口；Execution Module 本身仍不判断 Goal 是否 ready。

**边界说明：** Execution 接收已经由上层确认可执行的 Goal/Action 引用，不判断 Goal 是否 ready，也不修改 Goal Contract、Evidence、Review、Session 或 Runtime process。Run 完成只代表本次执行结束，不等于 Goal 已验收完成。

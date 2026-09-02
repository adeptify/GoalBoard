# Evidence & Verification

**定位：** Evidence、不可变 Correction、criterion coverage 和自动验证义务的唯一 owner。

**状态：** `partial`。EX2 已迁 Evidence / Correction、文件引用与当前自动门禁；EX3 已迁 Review / Proposal / Decision；EX4 已把 Web/CLI/MCP 的 Evidence/Review 入口切到统一执行验收应用端口。

**拥有：** Evidence identity/kind/locator/result/digest、contract revision、criterion mapping、不可变 correction chain、文件引用预检、criterion coverage 与返工后的 Evidence freshness。

**公开面：** 查询 Evidence / Correction、当前有效覆盖、Review 引用与项目文件来源；submit、supersede、retract、attach review；发布 Evidence 事件。纯 snapshot coverage 函数供 Action Projection 使用，不要求调用方复制判断规则。

**不负责：** 不拥有 Artifact 正文、Goal Contract、Run 或 Review verdict；人工审批只能来自可信用户入口。文件可读取不等于证据结论有效，验证级别必须明确。

**调用边界：** Goals/Execution application layer 先确认 `goal_id + contract_revision + criterion_ids` 与可选 Run ownership，再调用 Evidence Command。Evidence 不读取 Goal Store，也不直接完成 Goal；完成状态仍由跨 owner lifecycle reconciliation 组合。

**当前迁移事实：** Evidence schema、migrations 17–20、migration 30 Evidence columns、Repository、Correction 状态机、locator helper 和 coverage 规则已经迁入；Store 仅保留总迁移顺序。EX4 把 Evidence/Review 授权、Contract revision、action token 与 lifecycle reconcile 拆进独立 application command owner，Coordinator 不再提供对应公开方法。

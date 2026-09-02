# Actions

**定位：** 轻量个人 Action 与对外 Action Request、状态、幂等和结果引用的唯一 owner。Personal 与 External Action 共用一个 Module，区别由 action kind/driver 决定。

**拥有：** Action identity、owner/scope、kind、parameters reference、desired state、attempt、external idempotency、result/receipt reference、retry/cancel 决定。

**公开面：** 查询 Action；create/dispatch/cancel/retry/complete；请求 Connector Driver 执行外部操作；发布 Action 状态事件。

**不负责：** Automation 只产生 Action Request；Scheduler 只做时间唤醒；Connector Host 只执行 provider operation。Actions 不保存 Provider Secret，也不把轻量 Action 自动升级为 Goal。

**当前状态：** 无正式实现。F2 创建 `contract-only` package，未来首个真实用例另立 Spec。

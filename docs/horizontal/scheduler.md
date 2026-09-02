# Scheduler

**白话：** 到指定时间，可靠地叫醒一个已注册 Capability；它不理解为什么要触发。

**提供：** durable one-shot wakeup、cancel/reschedule、lease、并发 claim、missed wakeup catch-up、技术 retry、Clock port 和 delivery Receipt。

**技术状态：** owner capability、opaque object ref、due time、wakeup key、attempt、lease 和 terminal technical status。

**不拥有：** cron/interval 业务定义、Automation rule、Source schedule intent、Action parameters 或 Attention 内容。各 owner 计算下一次时间并重新注册。

**当前来源与 Goal：** Feed scheduler 与 Web timer；由 FD1 建立参考实现，其他 Module 以后按 Contract 接入。

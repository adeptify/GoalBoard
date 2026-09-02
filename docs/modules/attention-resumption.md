# Attention & Resumption

**定位：** “现在值得看什么”和“稍后怎样接着做”的个人事实 owner。

**拥有：** Attention item、reason、priority/cue、seen/dismissed/snoozed、resume target 与用户处置记录。

**公开面：** 查询当前/延后 Attention；create/update/dismiss/snooze/resume；发布 Attention 变化事件。

**不负责：** 不拥有 Feed Item、Action、Goal 或 Session；只保存它们的引用。通知是 Adapter，时间唤醒由 Scheduler 执行，真正恢复 Session 由 Private Work Context/Runtime Host 完成。

**当前来源与 Goal：** `InboxEntry` 的最小行为；由 FD2 迁移，不借机实现完整未来 Attention 产品。

**FD2 当前实现：** `AttentionModule` 已成为 `inbox_entries`、subject/reason 校验、open/in_progress/done/dismissed 状态机和 Attention 事件的唯一写入者。snooze、完整 resume cue 和系统通知仍是未来功能，不在本次迁移中伪造。

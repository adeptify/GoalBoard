# Context Ledger

**白话：** 它是“关系账本”。它记住 Goal、Artifact、Feed、Session 等对象之间是什么关系，以及需要重新拼装一份上下文时应从哪里取；它不复制这些对象本身。

**拥有：** ObjectRef、ContextEdge、publication record、materialization request/status/result reference 与 provenance。

**公开面：** 查询对象关系和 lineage；创建/撤销关系；请求/取消 materialization；发布关系和 materialization 状态事件。

**Materialization：** Ledger 记录“要拼什么、谁来拼、拼到哪”；materializer 通过各 Module Query 读取获准内容，长期结果写成 Artifact。可重建缓存删除后应能恢复。

**不负责：** 不拥有 Goal/Artifact/Feed/Session 内容，不跨 Store Join，不因存在 edge 自动授予内容权限。

**当前来源与 Goal：** Coordinator relation/impact/provenance、Feed link、Session association；由 AR2 迁移。

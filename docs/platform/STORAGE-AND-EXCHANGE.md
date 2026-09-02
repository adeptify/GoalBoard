# Storage and Exchange

## 1. Storage

`packages/storage` 提供 SQLite、Filesystem、Blob、事务、migration 和备份恢复的技术端口。每个 Module/Plugin 逻辑隔离自己的 Store 与 schema；共享 SQLite 进程不等于允许跨 Store 查询。

- Module 是表和字段业务含义的 owner。
- Plugin 私有 Store 不能成为其他 Plugin 的查询接口。
- 跨 owner 写入使用本地事务、Durable Outbox、幂等 Event 和补偿。
- Secret 只存安全引用；日志、Artifact 与普通数据库不保存明文。

## 2. Exchange

`packages/exchange` 提供 Envelope、路由、顺序、CAS、ACK、Cursor、Replay、Blob、Quota、Retention 与审计。Server 只理解官方 Envelope 外壳和平台控制字段，不解释 Plugin payload。

```text
Local Module / Plugin
→ Goals or Artifacts Envelope
→ Exchange client
→ Lightweight Server
→ Exchange client
→ Receiving Local Host
→ compatible Module / Plugin consumer
```

接收方没有兼容 Plugin 时，opaque Artifact 仍可保存、同步和重放；以后安装 consumer 再解释。

## 3. Exchange 与 Sync 分工

- Exchange 拥有传输事实：接受、顺序、重放、Blob、ACK/Cursor、CAS。
- Sync & Replication Module 拥有业务事实：发布意图、replica、冲突、等待 consumer、用户处置和 materialized version。
- Server Receipt 只表示传输结果，不表示本地业务对象已成功 materialize。
- 默认按 Team Project 使用独立数据密钥；Plugin 只声明共享目标，不实现密码学。

当前没有完整 Exchange/Sync 产品实现。F2 只建立 `contract-only` 边界，未来实现需独立 Spec。

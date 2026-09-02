# Contracts and Operations

## Contracts

`packages/contracts` 是唯一公共协议承载包，通过 `modules/*`、`services/*`、`platform/*` subpath 暴露类型和 Schema。一个分发包不代表一个万能协议；每个 owner 保留独立 API/event/schema version。

- 禁止根 barrel 聚合全部类型。
- 破坏性变化保留旧版本解析或明确迁移期。
- Contract 不依赖业务实现、数据库、网络、App 或 Plugin。

## Observability

`packages/observability` 提供结构化日志、trace、metric、diagnostic 和脱敏策略。业务 owner 定义“成功/失败”的含义，平台只提供一致记录和关联；Secret 与私人 Session 内容默认禁止进入日志。

## Test Kit

`packages/test-kit` 提供 deterministic clock、fake capability、临时 storage、contract harness 和通用断言工具。业务 fixture 和业务结论留在对应 Module/Plugin，防止 Test Kit 变成共享业务实现。

## 门禁

F3 已建立 public entrypoint、deep import、跨 Store、Plugin implementation、App DB、循环依赖和 Contract 清单一致性检查。每个垂直 Goal 另外负责真实行为、错误、持久化、恢复和端到端证据。

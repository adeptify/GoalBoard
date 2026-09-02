# GoalBoard 架构 SSOT 索引

状态：已确认（F1）；Goals Query、GW1–GW4、EX1–EX4、AR1 与 AP1–AP4 已迁入  
权威需求书：[`specs/goalboard-architecture-reorganization/spec.md`](../specs/goalboard-architecture-reorganization/spec.md)  
适用范围：GoalBoard、Relay 与 Loreport 相关能力的 Monorepo 重组

这份文件回答三个问题：一项事实由谁负责、代码最终放在哪里、由哪个 Goal 完成迁移。详细规则只在链接的权威文档中维护，其他 README 不再复制一套架构。

## 1. 文档各管什么

| 问题 | 唯一权威来源 |
| --- | --- |
| 产品为什么存在、对用户承诺什么 | [`PRODUCT.md`](../PRODUCT.md) |
| 本次重组的完整决策、范围和逐包 Contract | [`specs/goalboard-architecture-reorganization/spec.md`](../specs/goalboard-architecture-reorganization/spec.md) |
| 分层、部署与端到端调用 | [`docs/system/ARCHITECTURE.md`](system/ARCHITECTURE.md) |
| 允许和禁止的代码依赖 | [`docs/system/PACKAGE-BOUNDARIES.md`](system/PACKAGE-BOUNDARIES.md) |
| 旧路径、迁移状态、兼容出口 | [`docs/system/MIGRATION.md`](system/MIGRATION.md) |
| Huge Class 每块职责的唯一迁移 Goal | [`docs/system/HUGE-CLASS-MIGRATION.md`](system/HUGE-CLASS-MIGRATION.md) |
| 16 个业务事实 owner | [`docs/modules/`](modules/README.md) |
| 4 个横向运行服务 | [`docs/horizontal/`](horizontal/README.md) |
| Plugin、存储、交换、UI 等平台机制 | [`docs/platform/`](platform/README.md) |
| 某次实现具体改什么、如何验收 | 对应 `specs/<task>/spec.md` 或已接受 Goal Contract |
| 可执行类型、Schema 和兼容测试 | `packages/contracts` 的 public subpath；F3 自动门禁与 `packages/test-kit` 边界测试 |

文档冲突时，先以 `PRODUCT.md` 判断产品承诺，再以本索引找到该问题的 owner 文档；实现任务不得在自己的 Spec 中重定义模块所有权。

## 2. 状态词

| 状态 | 含义 |
| --- | --- |
| `legacy-mixed` | 功能真实存在，但仍混在旧单包或 Huge Class 中 |
| `absent` | 目标物理 package 尚未创建 |
| `contract-only` | package 和公开边界存在，但没有注册假 Provider、假 Store 或伪成功功能 |
| `partial` | 一部分真实用例已迁入，迁移矩阵仍列出旧 owner/caller |
| `implemented` | 主路径、错误、持久化、恢复、测试和文档均已通过 |
| `retired` | 旧路径 caller 清零并删除或只留下有时限的兼容入口 |
| `workspace-root + legacy-release` | Monorepo 根已能管理全部 package，但当前产品构建与发布仍由旧根 package 承担 |

F2 已创建完整 package 树。AR1 后有 18 个目标 package 仍为 `contract-only`，30 个 package 已通过真实 Contract → implementation → caller/test 切片成为 `partial`。旧代码仍承载尚未迁完的产品职责；只有完成同样证据链的边界才能升级状态。

## 3. Apps

| 目标 package | 负责什么 | 当前来源 | F2 后初始状态 | 迁移 / 实现 Goal |
| --- | --- | --- | --- | --- |
| `apps/desktop` | macOS 外壳、生命周期、Native Bridge | AP4 已迁启动配方、Panel lifecycle、Capsule presentation 与 Tauri adapter；旧 Desktop/Web 文件只转发，发布配置仍在 `desktop/src-tauri/` | `partial` | AP4 已迁；DV4 完成发布级验证 |
| `apps/workbench` | 本地产品 UI 与页面组合 | AP3 已接管 Shell/Slot/资产；EX4 已接管 Claim、Run、Evidence、Review UI contribution 与公开应用 adapter | `partial` | FD4、GW4、AP3、EX4；其余产品页面继续由对应 Native Plugin Goal 迁移 |
| `apps/local-host` | 本地唯一业务 composition root 和 single writer | AP2 已接 Host Client、Project Runtime discovery、统一关闭/重开；旧业务通过单一兼容 adapter 接入 | `partial` | AP2 已迁初始化；后续各 owner 继续把兼容端口换成正式 Capability |
| `apps/server` | 轻量交换、Team 控制面、Team Plugin Host | 当前无正式 Server 实现 | `contract-only` | F2；未来独立功能 Spec |
| `apps/cli` | 参数、协议和终端展示适配 | GW4 Goal adapter 与 EX4 execution-validation adapter 已接 caller；其余协议仍在 `src/cli/` | `partial` | GW4、EX4；DV1 继续迁移 |
| `apps/mcp` | MCP schema、audience 和 Capability 适配 | GW4 Goal adapter 与 EX4 execution-validation adapter 已接 caller；其余 schema/context 仍在 `src/mcp/` | `partial` | GW4、EX4；DV1、DV2 继续迁移 |

## 4. Foundation packages

| 目标 package | 唯一职责 | 当前来源 | F2 后初始状态 | 迁移 / 实现 Goal |
| --- | --- | --- | --- | --- |
| `packages/contracts` | Module、Service、Platform 的可发布类型与 Schema | `src/v1/types.ts` 及各目录公开类型 | `contract-only` | F2、F3、各业务 Goal |
| `packages/kernel` | Capability 注册、选择、权限与生命周期骨架 | AP2 已实现 versioned Capability registry；grant/provider policy 待各平台 Goal | `partial` | F2、F3、AP2 |
| `packages/plugin-runtime` | Plugin 安装、签名身份、grant、隔离和生命周期 | FD3 本地参考 Runtime；持久 Host/隔离待 AP2/DV3 | `partial` | F2、FD3；DV3/AP2 完成产品化 |
| `packages/plugin-sdk` | 外部 Plugin 作者使用的稳定 API 与测试入口 | FD3 Manifest/definition/polling Integration surface | `partial` | F2、FD3；DV3 补 UI/testing/tooling surface |
| `packages/storage` | SQLite、Filesystem、Blob、事务和 migration 技术能力 | 各 Store 与文件辅助 | `contract-only` | F2、各事实迁移 Goal |
| `packages/exchange` | Envelope、ACK、Cursor、Replay、CAS 与 Blob 交换 | 当前不存在正式 Server/Exchange | `contract-only` | F2；未来独立功能 Spec |
| `packages/ui-host` | UI Contribution、Slot、嵌入、隔离和桥接 | FD4 registry/render 与 AP3 surface/Slot mount 校验已落地；Installed Plugin 隔离与完整安全 bridge 仍待独立实现 | `partial` | F2、FD4、AP3 |
| `packages/design-system` | Token、基础组件、图标和可访问性基线 | AP3 已迁主题偏好、browser bootstrap 与分层视觉样式；旧 `src/web/visual-foundation.ts` 只保留 public re-export | `partial` | F2、AP3 |
| `packages/observability` | 结构化日志、trace、diagnostic 与安全脱敏 | 各入口零散日志 | `contract-only` | F2、F3、保证 Goal |
| `packages/test-kit` | 无业务判断的公共测试工具和 fake capability | F3 boundary policy；测试中的重复 harness 待迁移 | `partial` | F2、F3；后续测试基础设施 Goal |

`packages/contracts/modules`、`services`、`platform` 是同一个发布包的 subpath 分区，不是三个独立 npm package。

## 5. Modules

| 目标 package | 事实 owner | 当前来源 | F2 后初始状态 | 迁移 / 实现 Goal |
| --- | --- | --- | --- | --- |
| `modules/identity-team-access` | User、Team、membership、Access Decision | 当前无完整实现 | `contract-only` | F2；未来独立功能 Spec |
| `modules/projects` | Project 身份、Catalog、workspace membership、`board_id` 兼容与迁移 | AP1 已迁正式事实；AP4 已移出 Desktop Panel 规则和 SQL，Catalog 仅保留文件/Runtime 与旧 Panel 方法转发 | `partial` | AP1 已迁事实与 Repository；AP2/WK1 清剩余兼容 composition，Cutover 删除旧 Panel facade |
| `modules/context-ledger` | ObjectRef、跨模块关系、publication、materialization | Coordinator/Feed/Session 的散落关系 | `contract-only` | AR2 |
| `modules/sync-replication` | 发布意图、replica、冲突和用户可见同步状态 | 当前无完整实现 | `contract-only` | F2；未来独立功能 Spec |
| `modules/sources` | “监听哪里”与用户期望的 Source 配置 | 新 Sources Repository；旧 service caller 待清 | `partial` | FD1；FD3/FD4 清 caller |
| `modules/signals` | 已观察到的外部事件与去重 provenance | 新 Signal/Revision Repository；公开来源待切 | `partial` | FD1；FD2/FD3 完成消费与 provider 切换 |
| `modules/feed` | Feed Item、Signal reference、material、read/archive/disposition 与 promotion provenance | 新 Feed Repository；旧 `FeedStore` 仅转发 | `partial` | FD2 已迁；FD4 清 UI/route facade |
| `modules/actions` | 个人/外部 Action 请求、状态和结果引用 | 当前无正式实现 | `contract-only` | F2；未来独立功能 Spec |
| `modules/attention-resumption` | Attention reference、reason 与最小处置状态 | 新 Attention Repository；旧 Inbox API 仅转发 | `partial` | FD2 已迁；完整 snooze/resume 为未来功能 Spec |
| `modules/goals` | Goal Contract、Graph、Policy、Risk、Lifecycle、Planning | Goals Query 与 GW1–GW4 已迁；EX4 已迁 action/work projection 和执行验收入口；Draft Dialogue/Goal Tree 决定入口仍在兼容路径 | `partial` | Goals Query、GW1–GW4、EX4 已迁；后续入口 Goal 收口 Draft Dialogue |
| `modules/private-work-context` | 私人 Session、内容引用、workspace / Goal 关联、Runtime context binding 与 Handoff 事实 | `src/sessions/`、Project Catalog binding SQL | `partial` | WK1 已迁移事实 owner；WK2 / WK3 清理 Runtime 与 UI caller |
| `modules/execution` | Claim、Run、lease、attempt 与执行生命周期 | EX1 已迁事实与状态机；EX4 已让 Web/CLI/MCP 走统一 application port 并删除 Coordinator 公开 facade | `partial` | EX1、EX4 已迁 |
| `modules/artifacts` | Artifact、版本、类型、内容引用与 provenance | AR1 已建立唯一正式事实；旧代码仅有各 owner 的字符串引用，没有第二套 Artifact Store | `partial` | AR1 已迁 Core；AR3 切换现有结果入口 |
| `modules/evidence-verification` | Evidence、Correction 与验证义务 | EX2 已迁事实与门禁；EX4 已迁入口授权与跨 owner application commands | `partial` | EX2、EX4 已迁 |
| `modules/governance-collaboration` | Review、Proposal、Decision 与确认 provenance | EX3 已迁事实与状态机；EX4 已迁执行链 Review 入口，Proposal/Decision 继续走 Governance public API | `partial` | EX3、EX4 已迁 |
| `modules/automation` | Trigger、Rule、Automation Run 与产生的 Action Request | 当前无正式实现 | `contract-only` | F2；未来独立功能 Spec |

每个 Module 的 API、事件和非职责见 [`docs/modules/`](modules/README.md)。Module 之间只通过公开 Capability Contract 调用，不导入彼此 implementation 或 Store。

## 6. Horizontal services

| 目标 package | 提供的技术能力 | 当前来源 | F2 后初始状态 | 迁移 / 实现 Goal |
| --- | --- | --- | --- | --- |
| `horizontal/connector-host` | Provider 连接、凭据引用和调用 Receipt | Provider-neutral Host；Driver 由官方 Plugin contribution 注册 | `partial` | FD1、FD3；AP2 迁最终 composition caller |
| `horizontal/listener-host` | cursor、lease、重试、Raw Event 到 Signal Draft 投递 | 新 Listener 状态与接收链；Web timer 待迁 | `partial` | FD1；FD4 清入口 caller |
| `horizontal/scheduler` | Durable one-shot wakeup | Feed scheduler 与 Web timer | `contract-only` | FD1；后续消费者按 Contract 接入 |
| `horizontal/runtime-host` | Runtime 启动、恢复、中断、stream 与技术 Receipt | Runtime router、Codex app-server 与 PTY server host 已迁；Work UI transport 待 WK3 | `partial` | WK2 已迁 Host/Adapter；WK3 迁产品编排 |

Horizontal Service 只保存可恢复的技术状态，不拥有 Goal、Signal、Action、Session 或 Run 等业务事实。

## 7. Plugins

| 目标 package | 产品能力 | 当前来源 | F2 后初始状态 | 迁移 / 实现 Goal |
| --- | --- | --- | --- | --- |
| `plugins/native/goals` | Goals 一级入口与组合 UI | EX4 已接管执行验收 Contract、action/work projection；Goals 导航、编辑、Planning 与文案仍在旧 renderer/i18n | `partial` | EX4 已迁执行验收组合；GW5 继续迁 Goals UI/文案 |
| `plugins/native/artifacts` | Artifacts 一级入口、浏览和嵌入 | 旧结果/文件展示 | `contract-only` | AR3 |
| `plugins/native/feed` | Feed 一级入口和处置 UI | Feed/Attention/Source UI 与 HTTP route table 已迁；promotion 已调用公开 Goals Command，Node Host binding 仍是兼容 adapter | `partial` | FD4、GW4；AP2 清最终 Host binding |
| `plugins/native/actions` | Actions 一级入口 | 当前无正式实现 | `contract-only` | F2；未来独立功能 Spec |
| `plugins/native/work` | Session、Runtime、resume、handoff UI | Web/TUI/Session UI | `contract-only` | WK3 |
| `plugins/native/automation` | Automation 一级入口 | 当前无正式实现 | `contract-only` | F2；未来独立功能 Spec |
| `plugins/official-integrations/github` | GitHub connector/listener/signal adapter | Provider 已迁；旧 OAuth/credential 仅 App 接线 | `partial` | FD3；AP2/DV3 清安装接线 |
| `plugins/official-integrations/gmail` | Gmail OAuth/connector/listener/signal adapter | Provider/scope/cursor/error 已迁；旧 OAuth secret lifecycle 由 Host 注入 | `partial` | FD3；AP2/DV3 清安装接线 |
| `plugins/official-integrations/rss` | 官方目录与自定义 RSS provider adapter | Manifest/factory 已迁；当前采集 Provider port 仍由兼容层注入 | `partial` | FD3；公开来源 caller 随 App/Feed cutover 收口 |
| `plugins/official-integrations/web-query` | Web Query provider adapter | Manifest/factory 已迁；当前 Intelligence Provider port 仍由兼容层注入 | `partial` | FD3；公开来源 caller 随 App/Feed cutover 收口 |
| `plugins/official-integrations/youtube` | YouTube Channel provider adapter | Manifest/factory 已迁；当前 Feed Provider port 仍由兼容层注入 | `partial` | FD3；公开来源 caller 随 App/Feed cutover 收口 |

Goals 与 Artifacts 是官方签名保护的一等 Plugin。Plugin 之间不依赖 implementation；可保存、同步和重放的内容用 Goal / Artifact Contract 交换。

## 8. Tooling、入口和发布面

| 目标 / 当前入口 | 最终 owner | 当前状态 | 退出或完成条件 |
| --- | --- | --- | --- |
| `tooling/plugin-cli` | DV3 | `contract-only` | DV3 实现后可在干净环境创建、校验、调试、打包和签名 Plugin |
| `tooling/migrations` | 各迁移 Goal；DV4 维护执行说明 | `absent` | 每个脚本有输入、输出、幂等/回滚说明；目录本身不是 package |
| `examples/plugin-sample` | DV3 | `absent` | SDK 可用后提供首个真实结果；不进生产 workspace |
| `package.json`、`pnpm-workspace.yaml` | F2 建 workspace；DV4 / Cutover 管发布 | `workspace-root + legacy-release` | workspace 已覆盖全部 48 个目标 package；DV4 / Cutover 再切换最终发布清单 |
| `src/index.ts` library entry | F3 / 各 Module；最终 Cutover | `legacy-mixed` | public export 迁入明确 Contract subpath；根入口只保留有期限兼容或删除 |
| 根 `@adeptify/goalboard` export | 最终 Cutover | `legacy-mixed` | public caller 转到新 Contract，旧入口有明确兼容期或删除 |
| `goalboard` bin | `apps/cli` / DV1 | `legacy-mixed` | 只保留参数、显示和 Host Client 调用 |
| `goalboard-mcp` bin | `apps/mcp` / DV1 | `legacy-mixed` | 只保留 MCP schema、audience 与 Capability 适配 |
| `goalboard-web` bin | `apps/local-host` + `apps/workbench` / AP2–AP3 | `legacy-mixed` | Web 不再拥有业务 Store 或判断 |
| Desktop/Tauri bundle | `apps/desktop` / AP4、DV4 | `partial-cutover` | AP4 已让 Native Bridge、Panel 与业务 owner 分离；DV4 完成 DMG、签名、公证、SBOM 与干净安装/升级验证 |
| `skills/goal-advance` | DV2 | `implemented-on-legacy` | 只依赖正式 public Contract 和入口 |
| `scripts/`、CI、DMG/npm 发布 | DV4 | `legacy-mixed` | 干净环境安装/升级/卸载、签名、公证、SBOM 与 provenance 通过 |
| `.github/workflows/` | F2/F3、DV4、最终 Cutover | `partial-boundary-active` | package 门禁已启用；全量测试、签名公证和发布流程仍待 DV4 / Cutover 对齐 |
| `vendor/` | DV4 与实际依赖 owner | `legacy-mixed` | 来源、版本、许可证、hash、SBOM 和发布物可追溯 |
| README 与开发文档 | F1 建基线；各 Goal 同步更新；Cutover 终审 | `partial` | 文档链接、命令、包状态与最终实现一致 |

## 9. 变更规则

1. 新增、删除或改名 package，必须先更新本矩阵与架构 Spec。
2. Module owner、公开 Contract 或依赖方向变化，必须有明确决策，不能在代码搬迁中顺手改变。
3. 每个迁移 Goal 同时更新：目标 package README、对应 Module/Service 文档、本矩阵的状态和 [`MIGRATION.md`](system/MIGRATION.md)。
4. `contract-only` 不得被 UI、CLI、MCP 或 Plugin Runtime 宣称为可用功能。
5. 旧 owner 只有在 caller 清零、行为兼容、数据迁移和回滚证据齐全后才能标为 `retired`。

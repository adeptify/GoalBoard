# Huge Class 职责迁移图

状态：WK1 后更新  
基线日期：2026-09-01  
规则：行数只触发审查，真正的拆分单位是“唯一事实 owner + 一组完整用例 + 独立测试面”。

本文不是要求一次性重写这些文件，而是防止它们被原样搬进新 package。每一行职责只有一个主要迁移 Goal；其他 Goal 如需消费，只能通过该 owner 的 public Contract。

> GW4 实施对账发现 Goals Native Plugin UI/文案未被其 Contract 覆盖。下表以 `GW5` 标出的职责对应待用户确认的 Candidate `candidate-1dbbef41-f270-42d9-bb40-8c643c06687d`，在确认前不视为正式 Goal 或已迁移结果。

## 1. 当前超过 1,000 行的源码

| 文件 | 行数 | 主要风险 |
| --- | ---: | --- |
| `src/v1/coordinator.ts` | 9,770 | EX4 已移出 execution-validation facade，AR1 只增加 Artifact public API 的纯装配；剩余 Draft Dialogue、Goal Tree Decision、Ledger 与最终兼容编排 |
| `src/web/render.ts` | 6,129 | EX4 已移出 Claim/Run/Evidence/Review renderer；Goals/Artifact/Work/App Shell 等后续 owner 的兼容产品 UI 仍混合 |
| `src/web/server.ts` | 4,353 | Host client、剩余 route、PTY、Session 和安装管理混合；Goal 与 execution-validation route 已通过 Workbench adapter 调用公开应用端口 |
| `apps/workbench/src/i18n/en.ts` | 3,574 | AP3 已把 catalog 与语言 runtime 分开，但现有产品文案仍需随各 Native Plugin UI Goal 就近迁出 |
| `src/mcp/server.ts` | 3,443 | MCP transport、工具 schema、项目路由和剩余业务调用混合；execution-validation 已走 MCP adapter |
| `src/projects/catalog.ts` | 1,871 | AP1 已移出 Project facts/SQL，AP4 已移出 Desktop Panel 规则与 SQL，WK1 已移出 Runtime binding schema/SQL；剩余文件 staging 与兼容应用编排 |
| `src/v1/store.ts` | 1,338 | Goals、Execution、Evidence、Governance 与 Artifact schema/Repository/migration 已迁出；当前只组合各 owner 公开 migration，Ledger 与兼容 snapshot 仍待迁移 |
| `src/web/project-session-workspaces.ts` | 1,450 | Project membership、Session 状态和 UI read model 混合 |
| `src/install/runtime-integration.ts` | 1,448 | 安装、Runtime 配置预览、写入、回滚和诊断混合 |
| 原 `src/sessions/registry.ts` | 原 1,324，现 8 | **WK1 已拆分：** 旧文件仅 public package re-export；owner 内 Session、Event、Handoff、Migration、Content、Schema、Context Binding 文件均低于 500 行 |
| `src/web/pty-client.ts` | 1,177 | Runtime stream 客户端、终端 UI 与 Workbench 生命周期混合 |
| `packages/design-system/src/styles/calm-desktop.ts` | 1,539 | 有边界的静态视觉层，不含 Store/API/业务状态；行数触发后续组件化审查，不等于跨 owner Huge Class |
| `packages/design-system/src/styles/personal-workbench-v3.ts` | 1,510 | 有边界的静态视觉层，不含 Store/API/业务状态；行数触发后续组件化审查，不等于跨 owner Huge Class |
| `packages/design-system/src/styles/momentum.ts` | 1,221 | 有边界的静态视觉层，不含 Store/API/业务状态；行数触发后续组件化审查，不等于跨 owner Huge Class |

## 2. `src/v1/coordinator.ts`

| 当前职责 | 目标 owner | 唯一迁移 Goal | 迁移完成证据 |
| --- | --- | --- | --- |
| Goal 只读详情、列表、关系和 Goal-owned snapshot | Goals Query API | `goal-f826dfb8-bf63-4e98-b6b7-57f6b4b7c3b8` | **已完成：** Web/CLI/MCP 详情、Policy、Guidance、回收站查询结果兼容，caller 改走 `goalQueries`；跨 owner work/action projection 明确留给 EX4 |
| Goal Contract、Graph、Policy、Risk、Guidance 写入 | Goals Module | `goal-reorg-gw1` | **已完成：** Command/Repository/Event 独立，公开 API 与 116 项 V1 回归通过；旧转发由 GW4 删除 |
| accept、revalidate、complete、trash/restore、旧数据版本 | Goals Module | `goal-reorg-gw2` | **已完成：** Lifecycle 按职责拆分，migration 可回滚，旧 Store migration 已删除；旧转发由 GW4 删除 |
| planning method、图分析、change impact、拆分校验 | Goals Planning | `goal-reorg-gw3` | **已完成：** Planning Engine、方法资产、图与拆分校验已迁入 Goals，Proposal/Decision 仍归 Governance；旧转发由 GW4 删除 |
| Goals Web/CLI/MCP 写入总入口 | Apps thin adapters | `goal-reorg-gw4` | **已完成：** 所有写/Lifecycle/Planning caller 经 `GoalsApplicationApi`，Coordinator Facade 职责和零 caller Planning re-export 已删除 |
| Artifact identity、version、scope、content/provenance 与 Repository | Artifacts Module | `goal-reorg-ar1` | **已完成：** 正式事实、Contract、Repository 和 migration 31 由 Module 拥有；Coordinator 只组合并暴露 `ArtifactsApplicationApi`，没有 Artifact SQL 或业务规则 |
| relation、impact、provenance、跨对象来源关系 | Context Ledger | `goal-reorg-ar2` | ObjectRef/ContextEdge 唯一存储，旧关系读层可对账 |
| Claim、Run、lease、release、attempt 与恢复 | Execution Module | `goal-reorg-ex1` | **已完成：** Contract、schema/migration、Repository、状态机和兼容 caller 已迁；直接 public module 与 V1 回归覆盖续租、崩溃恢复、幂等及并发 |
| Evidence、Correction、criterion coverage、自动验证门禁 | Evidence & Verification | `goal-reorg-ex2` | **已完成：** Contract、schema/migration、Repository、locator、Correction 与 coverage gate 已迁；Coordinator 只保留授权和跨 owner reconciliation |
| Review obligation、Review、Proposal、Decision、确认来源 | Governance & Collaboration | `goal-reorg-ex3` | **已完成：** Contract、schema/migration、Repository、状态机和原子物化已迁；Coordinator 只经公开 API 传入已授权上下文 |
| 执行、证据、治理到下一步动作与入口编排 | Goals Native Plugin + App adapters | `goal-reorg-ex4` | **已完成：** Web/CLI/MCP 共用 `ExecutionValidationApplicationApi`；旧 projection 与 Coordinator facade 删除；跨入口、权限、恢复测试通过 |

`GoalBoardCoordinator` 在迁移期只允许承载尚未拆出的跨 owner 应用编排。EX4 已删除 Claim/Run/Evidence/Review 与 action/work projection 的公开 facade，并把原 2,000 行组合类拆成 78/874/406/695 行职责文件。AR1 新增的 18 行只负责构造 Artifact Module 和暴露公开端口，不包含事实或判断。剩余 Draft Dialogue、Goal Tree Decision、Ledger 与最终兼容入口由后续 Goal 继续清理；不得把它们重新塞回 execution-validation 或 Artifacts。

## 3. `src/v1/store.ts` 与 `src/v1/types.ts`

| 当前表/类型组 | 目标 owner | 唯一迁移 Goal |
| --- | --- | --- |
| Goal、criteria、policy、risk、guidance | Goals | `goal-reorg-gw1`（Command/Repository 已迁） |
| Goal 生命周期、revision、归档/回收与 migration | Goals | `goal-reorg-gw2`（已迁；旧 Store 只编排公开 migration） |
| planning method、graph analysis 类型 | Goals Planning | `goal-reorg-gw3` |
| artifact identity、version、scope、content/provenance | Artifacts | `goal-reorg-ar1`（已迁；旧 Store 只组合公开 schema/migration，旧 types 从未拥有正式 Artifact 类型） |
| relation、impact、provenance 引用 | Context Ledger | `goal-reorg-ar2` |
| claim、run、lease、attempt | Execution | `goal-reorg-ex1`（已迁；旧 Store 只编排公开 migration / snapshot Query） |
| evidence、correction、criterion coverage | Evidence & Verification | `goal-reorg-ex2`（已迁；旧 Store 只编排公开 migration / snapshot Query） |
| review obligation/review、candidate、proposal/decision | Governance & Collaboration | `goal-reorg-ex3`（已迁；旧 Store 只编排公开 schema/migration/snapshot） |
| clarification session/turn、Goal Tree Proposal/Decision 入口编排 | Goals / Governance 薄应用层 | Candidate `candidate-d7629ad3-8882-40b2-91cf-a75f9ce5c68a`（待用户决定；不属于 EX4） |
| action projection/read model 类型 | 执行验收 Query | `goal-reorg-ex4`（已迁） |
| root public barrel 与旧 Store facade | Contracts / compatibility | `goal-reorg-f3` |

拆分后每个 owner 管自己的 schema、migration 和 Repository。`packages/storage` 提供 SQLite 技术端口，但不拥有表的业务含义；禁止把原 Store 换名后继续跨 Module 查询。

## 4. `src/web/render.ts`、`visual-foundation.ts`、`i18n.ts`

| 当前职责 | 目标 owner | 唯一迁移 Goal |
| --- | --- | --- |
| Workbench Shell、导航、布局、UI Slot、Contribution 装载 | Workbench / UI Host | `goal-reorg-ap3` |
| token、基础组件、图标、可访问性、通用视觉规则 | Design System | `goal-reorg-ap3` |
| Goal 列表、详情、关系与只读投影 UI | Goals Native Plugin | `goal-reorg-gw5`（Query API 已由 Goals Query Goal 完成） |
| Goal 修改、Planning、Risk/Policy 编辑 UI | Goals Native Plugin | `goal-reorg-gw5` |
| Claim/Run、Evidence、Review、Decision 与动作投影 UI | Goals Native Plugin 的执行验收组合 | `goal-reorg-ex4` |
| Feed、Source、Signal、Attention 页面与写入 | Feed Native Plugin | `goal-reorg-fd4` |
| Artifact/结果/文件浏览与嵌入 | Artifacts Native Plugin | `goal-reorg-ar3` |
| Session、Terminal、resume、handoff UI | Work Native Plugin | `goal-reorg-wk3` |
| Project/Settings/Plugin Manager/Onboarding、Desktop 兼容 UI | App Shell | `goal-reorg-ap4` |
| i18n registry、加载机制、fallback 与共享术语 | Workbench i18n platform | `goal-reorg-ap3` |
| Goals 产品文案 | Goals Native Plugin catalog | `goal-reorg-gw5` |
| Feed 产品文案 | Feed Native Plugin catalog | `goal-reorg-fd4` |
| Artifact 产品文案 | Artifacts Native Plugin catalog | `goal-reorg-ar3` |
| Work/Session 产品文案 | Work Native Plugin catalog | `goal-reorg-wk3` |
| Desktop/Settings/Onboarding 产品文案 | Desktop/App Shell catalog | `goal-reorg-ap4` |

`render.ts` 不按页面机械切成多个同样依赖全局 view 的 renderer。每个 Native Plugin 用公开 Query 形成自己的 read model；Workbench 只保留 Shell 和 Contribution 宿主。

AP3 已完成平台 Shell、Slot、Design System 和 browser assets；EX4 又把 Claim、Run、Evidence、Review renderer 迁入 `apps/workbench/src/execution-validation-ui.ts`。`src/web/render.ts` 当前为 6,129 行，仍包含 Goals/Artifact/Work/App Shell 的其他产品页面，不能由 EX4 越权吸收。当前 EN catalog 继续随各产品 UI owner 就近拆出。

因此 Huge renderer 按职责而不是按文件名退出：Shell/平台资产和 execution-validation UI 已迁，剩余 6,129 行继续按上表唯一 owner 迁移；旧 renderer 尚未整体 retired。

## 5. `src/web/server.ts`

| 当前职责 | 目标 owner | 唯一迁移 Goal |
| --- | --- | --- |
| 本地进程装配、single writer、Host Client 与本地授权边界 | Local Host | `goal-reorg-ap2`（已迁初始化与 writer owner；业务 route 继续由各 owner 迁出） |
| Workbench asset/transport/route composition | Workbench App | `goal-reorg-ap3` |
| Project 创建、Catalog、membership、`board_id` 迁移 route | Projects | `goal-reorg-ap1` |
| Feed/Source/Connector route 与 promotion | Feed Native Plugin adapters | `goal-reorg-fd4` |
| Goal Query route | Goals Query adapter | `goal-f826dfb8-bf63-4e98-b6b7-57f6b4b7c3b8` |
| Goal Command/Planning route | Goals Command adapter | `goal-reorg-gw4` |
| Claim/Run/Evidence/Review/Decision route | 执行验收 adapters | `goal-reorg-ex4` |
| Session、resume、handoff route | Work Native Plugin | `goal-reorg-wk3` |
| PTY/runtime process、stream、resource lifecycle | Runtime Host | `goal-reorg-wk2`（server Host 已迁；browser client 待 WK3） |
| Onboarding、settings、installation diagnostics、Desktop bridge | Desktop/App Shell | `goal-reorg-ap4` |

新 route 只把 HTTP 输入翻成 Host Capability 调用。任何 route 直接持有 Module Store 或复制业务判断，都算迁移失败。

## 6. 其他 Huge File

| 文件与职责 | 目标 owner | 唯一迁移 Goal |
| --- | --- | --- |
| `src/mcp/server.ts`：MCP transport、tool schema、audience、项目上下文 | `apps/mcp` | `goal-reorg-dv1` |
| `src/mcp/server.ts`：对旧内部方法/Skill 的假设 | Runtime 集成 | `goal-reorg-dv2` |
| 原 `src/projects/catalog.ts`：Project identity、Catalog、membership、database migration | Projects | `goal-reorg-ap1`（已迁；旧入口只调用公开 Projects API） |
| 原 `src/projects/catalog.ts`：Runtime context/session binding | Private Work Context | `goal-reorg-wk1`（已迁；Catalog 只调用公开 Repository） |
| 原 `src/projects/catalog.ts`：Desktop panel、Capsule lifecycle | Desktop Shell | `goal-reorg-ap4`（已迁；旧 Catalog 方法只转发） |
| 原 `src/projects/catalog.ts`：personal planning method storage | Goals Planning | `goal-reorg-gw3`（已迁；调用公开 Goals Planning API） |
| `src/web/project-session-workspaces.ts`：Project membership read model | Projects | `goal-reorg-ap1` |
| `src/web/project-session-workspaces.ts`：Session/workspace UI composition | Work Native Plugin | `goal-reorg-wk3` |
| `src/install/runtime-integration.ts`：安装变更预览、写入、回滚、诊断 | Installer / release | `goal-reorg-dv4` |
| 原 `src/sessions/registry.ts`：Session、内容引用、关联、恢复、迁移 | Private Work Context | `goal-reorg-wk1`（已迁；旧路径只剩 8 行兼容 re-export） |
| `src/feed/store.ts`：Source 配置与 Signal 事实 | Sources / Signals | `goal-reorg-fd1`（已迁；旧 Source 方法仅兼容转发） |
| `src/feed/store.ts`：Feed Item、InboxEntry/Attention 处置 | Feed / Attention | `goal-reorg-fd2`（已迁；旧方法仅兼容转发） |
| `src/web/pty-client.ts`：终端 UI 和 stream 呈现 | Work Native Plugin | `goal-reorg-wk3` |
| `src/web/pty-client.ts`：PTY transport/reconnect adapter | Runtime Host adapter | `goal-reorg-wk2` |
| 原 `src/feed/connectors/gmail.ts`：Gmail protocol、scope、history cursor、错误归一与字段标准化 | Gmail Integration Plugin 的 `provider.ts`、`scope.ts`、`history-cursor.ts`、`errors.ts` | `goal-reorg-fd3`（已迁；单文件均低于 1,000 行） |
| 原 `src/feed/connectors/gmail.ts`：通用连接/监听技术状态 | Connector/Listener Host Contract | `goal-reorg-fd1`（已迁） |
| 原 `src/v1/goal-decomposition-validation.ts`：coverage、graph、proposal validation | Goals Planning | `goal-reorg-gw3`、`goal-reorg-gw4`（实现已迁，零 caller re-export 已删除） |
| 原 `src/v1/action-projection.ts`：跨执行/证据/治理状态的下一步 read model | Goals Native Plugin | `goal-reorg-ex4`（已删除旧文件；新 projection 901 行，index/factory 分离） |
| 原 `src/web/capsule.ts`：Desktop Capsule CSS/client/HTML presentation | Desktop Shell | `goal-reorg-ap4`（已迁入 `apps/desktop/src/capsule-shell.ts`） |
| `src/web/capsule.ts`：Goal/Run/Session 状态 read model 与 Host 注入 | 对应事实 Query + Web compatibility adapter | `goal-reorg-ex4`、`goal-reorg-wk3`；最终 Cutover 删除兼容 adapter |
| 原 `desktop/src-tauri/src/main.rs`：窗口/Capsule、PTY、本地 Web service、Runtime env | Desktop Tauri adapter | `goal-reorg-ap4`（已按职责拆分并迁入 `apps/desktop/adapters/tauri/src/`） |

## 7. 大型测试文件

测试不是业务 owner，随被验证的行为迁移；共享 helper 才能进入 `packages/test-kit`。

| 文件 | 行数 | 目标测试面 |
| --- | ---: | --- |
| `tests/v1.test.ts` | 12,844 | Goals Query/GW1–GW4、AR1–AR2、EX1–EX4 的 characterization 与 compatibility tests |
| `tests/web.test.ts` | 8,588 | AP2–AP4 与各 Native Plugin UI/route 的兼容和端到端测试 |
| `tests/mcp.test.ts` | 3,817 | DV1/DV2 的 MCP contract、audience 和 Host Client 测试 |
| `tests/desktop-tui.test.ts` | 1,888 | WK3/AP4 的 Desktop、TUI、Capsule 与 Runtime 入口测试 |
| `tests/project-catalog.test.ts` | 1,192 | AP1、WK1 的 Project/Context binding/migration 测试 |

测试拆分时优先按用户行为和 public Contract 分文件，不按旧类的方法名一一复制。

## 7.1 已退出 Huge Class 清单

| 文件 | 当前行数 | 已退出职责 | 剩余退出条件 |
| --- | ---: | --- | --- |
| `src/feed/store.ts` | 744 | FD1 的 Source/Signal/Listener 与 FD2 的 Feed/Attention 表、Repository、状态机和 migration | FD4 清 Web facade；最终 Cutover 删除旧组合入口 |
| `src/feed/connectors/github.ts` | 27 | FD3 已把 GitHub Provider 搬到官方 Plugin；旧文件只注入本地 credential/fixture policy | AP2/DV3 统一安装与 credential Host 后删除兼容入口 |
| `src/feed/connectors/gmail.ts` | 45 | FD3 已把 Gmail Provider 和 Signal Adapter 搬到官方 Plugin；旧文件只注入 Secret/OAuth port | AP2/DV3 统一安装与 credential Host 后删除兼容入口 |
| `src/web/render.ts` | 6,129 | FD4/AP3 已移出 Feed、Shell 与平台资产；EX4 已移出 Claim/Run/Evidence/Review renderer | GW5/AR3/WK3/AP4 按剩余产品 UI owner 继续拆分；最终 Cutover 删除兼容 renderer |
| `src/web/visual-foundation.ts` | 15 | AP3 已把 7,979 行主题、browser bootstrap 和视觉样式迁入 Design System；旧文件只 re-export public entrypoint | 最终 Cutover 删除兼容 import |
| `src/web/i18n.ts` | 140 | AP3 已把 3,710 行聚合文件拆成语言 runtime 与 Workbench EN compatibility catalog | GW5/AR3/WK3/AP4 按产品 owner 迁 catalog；最终 Cutover 删除旧 import |
| `src/web/server.ts` | 4,353 | EX4 execution-validation route 已走 Workbench adapter；无对应业务规则 | GW5/AR3/WK2/WK3/AP4 继续迁剩余 route composition |
| `src/v1/coordinator.ts` | 9,770 | EX4 已删除 16 个 execution-validation facade/query 方法；AR1 正式 Artifact 事实不在此处，仅保留 18 行 public Module 装配 | AR2、Candidate `candidate-d7629ad3-8882-40b2-91cf-a75f9ce5c68a` 与最终 Cutover 继续拆剩余组合 |
| `src/v1/action-projection.ts` | 已删除 | EX4 已迁入 Goals Native Plugin，并拆成 projection/index/factory | 无 |
| `src/v1/goal-decomposition-validation.ts` | 已删除 | GW3 已把 1,126 行拆分覆盖与校验逻辑按职责迁入 Goals Planning；GW4 在旧 import 清零后删除 re-export | 无 |
| `src/v1/types.ts` | 589 | Goal、Execution、Evidence、Governance public types 已切到对应 Contract；AR1 的 Artifact 类型直接存在独立 Contract，没有进入旧聚合文件 | AR2 迁移 Ledger 类型；最终 Cutover 删除旧聚合入口 |
| `src/projects/catalog.ts` | 2,104 | AP1 已移出 Project identity、Event、workspace membership、删除记录、schema 与 migration；AP4 已移出 Desktop Panel 规则和 SQL，旧方法只调用公开 Desktop service | AP2 迁文件 provisioning/composition，WK1 迁 Runtime binding；最终 Cutover 删除零 caller 兼容方法 |
| `src/web/capsule.ts` | 496 | AP4 已把 548 行 Capsule presentation 迁入 Desktop App，旧文件只做状态 read model 和翻译/主题兼容注入 | EX4/WK3 迁跨 owner read model；最终 Cutover 删除 Web adapter |
| `desktop/src-tauri/src/main.rs` | 已删除 | AP4 已把原 1,473 行按窗口/Capsule、PTY、本地 Web service、Runtime env 拆成 812/327/327/36 行并迁到 Desktop adapter | DV4 只继续发布配置、签名、公证与安装验收 |

## 8. 每个职责的退出检查

- 新 owner 的 Contract、实现、Repository、Event 与错误语义可独立验证。
- 所有入口 caller 已切到 public API，没有 deep import 或跨 Store 访问。
- 旧实现中这块逻辑已删除，或只剩记录了 caller、截止点和删除 Goal 的薄转发。
- 迁移前后主要 Query、Command、Event、错误和持久化结果一致。
- 数据 migration、对账和回滚路径有证据。
- 对应 package README、Module/Service 文档和迁移矩阵已同步。

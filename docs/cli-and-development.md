# CLI 与开发

## 一次性 V3 导入

旧 JSON 不是并行运行模式，只能通过显式导入写入一个全新的 V1 Board：

```bash
goalboard v1 import-v3 \
  --db .goalboard/imported.db \
  --board-id imported \
  --actor user \
  --key import-1 \
  --file legacy-goal-board.json
```

导入只保留 Goal 名称和父子结构、inputs/outputs、root constraints、coverage disposition 与来源身份。业务逻辑、验收、accepted/satisfied、依赖、Risk、Policy、Evidence 和 Review 都不会被伪造，导入报告会把它们列入 `regenerate`。目标 Board 已存在时导入会拒绝覆盖。

management MCP 提供同一 Coordinator 上的 `goalboard_v1_import_v3`；Runtime MCP 不暴露导入。

## CLI

公开 CLI 顶层提供本体安装、常驻服务、demo、安全卸载，以及 `goalboard v1 <operation>` 管理接口：

```text
init | create-goal | snapshot | contract | ready | explain | claim | release
run-start | run-report | revalidate | evidence-submit | review-submit | complete
draft-dialogue-start | draft-dialogue-turn | draft-dialogue-resume
goal-tree-propose | goal-tree-read | goal-tree-check | goal-tree-decide
relation-add | impact-add | policy-set | risk-add | risk-state | active-goal
contract-propose | contract-decide | candidate-submit | dependency-propose
candidate-decide | rewire-confirm | import-v3
```

复杂 payload 可以通过 `--json` 或 `--file payload.json` 传入。CLI 是用户/管理和本地调试入口，不是 Runtime 的服务故障回退。

## 项目结构

> 当前仓库已经是 Monorepo：18 个目标 package 保持 `contract-only`，30 个 package 已有真实迁移切片并标记为 `partial`；根 `@adeptify/goalboard` package 暂时继续承载现有产品与发布兼容面。package 存在不代表全部业务都已迁入；真实状态和迁移 owner 见 [架构 SSOT 索引](SSOT-MATRIX.md)。

```text
apps/                        6 个产品入口与 composition root 边界
packages/                    10 个 Foundation package；contracts 暴露 30 个公开 subpath
modules/                     16 个业务事实 owner 边界
horizontal/                  4 个横向运行服务边界
plugins/                     6 个 Native Plugin 与 5 个官方 Integration Plugin 边界
packages/plugin-runtime/     FD3 本地 Plugin 生命周期参考实现
packages/plugin-sdk/         FD3 Manifest 与 Integration Plugin 定义 API
plugins/official-integrations/
                             官方 Manifest、Provider Adapter 与安装 package
apps/workbench/              AP3 Shell/Slot/资产 + FD4/GW4/EX4 产品接线与执行验收 UI
apps/desktop/                AP4 Desktop Shell、Panel、Capsule 与 Tauri native adapter
apps/cli/                    GW4 Goals + EX4 execution-validation adapter；完整协议迁移由 DV1 继续
apps/mcp/                    GW4 Goals + EX4 execution-validation adapter；schema/context 由 DV1/DV2 继续
packages/ui-host/            UI Contribution registry、surface render 与 Slot mount 校验
packages/design-system/      AP3 主题偏好、浏览器视觉基础与分层样式
plugins/native/feed/         FD4 Feed/Attention/Source UI 和 HTTP route table
modules/goals/               Goals Query + GW1–GW4 Command/Lifecycle/Planning 与公开应用端口
modules/governance-collaboration/
                             EX3 Review/Proposal/Decision 事实、状态机与公开应用端口
tooling/plugin-cli/          Plugin CLI 边界；真实开发工具由 DV3 实现
scripts/workspace-packages.mjs
                             48 包清单、manifest、入口、README 与 Contract 接线检查
src/v1/                      SQLite Store、Coordinator、types、CLI 与一次性导入
src/mcp/server.ts            V1-only MCP Server
src/web/                     剩余产品 UI、Goal Tree、本机 PTY 与 Host adapters；Shell/视觉基础/Feed renderer 已迁出
src/desktop/                 AP4 后只保留旧启动配方与推进提示 import 的兼容转发
src/install/                 安装、Runtime 接入、常驻服务与安全卸载
src/cli/main.ts              产品 CLI 与 V1 管理入口
desktop/                     macOS App 的 Cargo/Tauri 发布配置；源码位于 apps/desktop/adapters/tauri
examples/seed-demo.mts       调用产品 demo 生命周期的开发脚本
docs/screenshots/            README 产品截图
skills/goal-advance/         Runtime 工作协议
tests/v1.test.ts             Coordinator、CLI、迁移与协议回归
tests/goals-command-module.test.ts
                             Goals 公开 Command API、幂等与状态副作用回归
tests/goals-app-adapters.test.ts
                             Workbench/MCP/CLI Goal adapter 一致性、幂等与错误回归
tests/execution-validation-app-adapters.test.ts
                             CLI/MCP/Workbench 跨入口执行、权限、恢复与 UI contribution 回归
tests/governance-collaboration-module.test.ts
                             Governance 公开 API、确认来源、状态迁移与原子回滚回归
tests/mcp.test.ts            MCP audience、权限与连接回归
tests/web.test.ts            Web 数据与交互回归
tests/desktop-tui.test.ts    第三栏启动、面板与本机 PTY 回归
tests/i18n.test.ts           界面语言回归
tests/uninstall.test.ts      用户数据保留、强确认与恢复收据回归
PRODUCT.md                   产品定义
DESIGN.md                    shipped UI 设计系统
docs/SSOT-MATRIX.md          架构、包状态和迁移 owner 的权威索引
docs/system/                 分层、依赖、迁移与 Huge Class 退出规则
docs/modules/                16 个 Module 的事实 owner 与 API 边界
docs/horizontal/             4 个横向运行服务的技术边界
docs/platform/               Plugin、Storage、Exchange 与 UI 平台机制
specs/goalboard-architecture-reorganization/spec.md
                             本次重组的完整已确认 Contract
```

### 重组期间的开发规则

- 根 `pnpm` 命令继续验证当前产品；`workspace:*` 命令验证 48 个新 package，`*:all` 命令同时覆盖两者。
- 新代码只能通过 public entrypoint 调用其他 owner；禁止 deep import、跨 Module Store 和 App 直写业务数据库。
- `contract-only` 只表示边界存在，不得注册假 Provider、假 Store、UI 入口或伪成功 API。
- 每个迁移切片同时更新目标 package README、`docs/system/MIGRATION.md` 和对应 Module/Service 文档。
- Huge Class 的职责归属和删除门见 [Huge Class 职责迁移图](system/HUGE-CLASS-MIGRATION.md)。

## 开发验证

```bash
# 目标 package 树
pnpm workspace:check
pnpm boundary:test
pnpm boundary:check
pnpm workspace:verify
pnpm workspace:typecheck
pnpm workspace:build

# 当前产品兼容面 + 目标 package 树
pnpm typecheck:all
pnpm build:all

# 当前产品回归与发布内容
pnpm typecheck
pnpm test
pnpm pack --dry-run --json
```

单独检查某个 package 时使用其正式名称，例如：

```bash
pnpm --filter @adeptify/goalboard-module-goals typecheck
pnpm --filter @adeptify/goalboard-module-goals build
pnpm --filter @adeptify/goalboard-plugin-runtime typecheck
pnpm --filter @adeptify/goalboard-integration-github typecheck
```

`workspace:check` 只核对 F2 包清单；`boundary:check` 扫描真实 import、依赖方向、Contract 入口、依赖环和 Huge Class 临时名单；`workspace:verify` 是本地与 CI 共用的完整 package 门禁。

发行包只包含 GoalBoard V1 的 `dist`、Runtime Skill 和 README，不包含第二套运行时。

上句描述当前发布物。Monorepo 重组完成后的 package、安装和发布命令由 DV4 与最终 Cutover Goal 更新并在干净环境验证。

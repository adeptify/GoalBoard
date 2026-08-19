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

```text
src/v1/                      SQLite Store、Coordinator、types、CLI 与一次性导入
src/mcp/server.ts            V1-only MCP Server
src/web/                     Goal Tree、文档式工作区、本机 PTY 与 i18n
src/desktop/                 第三栏启动配方与推进提示
src/install/                 安装、Runtime 接入、常驻服务与安全卸载
src/cli/main.ts              产品 CLI 与 V1 管理入口
desktop/                     可选 macOS App 壳，复用同一套 Web
examples/seed-demo.mts       调用产品 demo 生命周期的开发脚本
docs/screenshots/            README 产品截图
skills/goal-advance/         Runtime 工作协议
tests/v1.test.ts             Coordinator、CLI、迁移与协议回归
tests/mcp.test.ts            MCP audience、权限与连接回归
tests/web.test.ts            Web 数据与交互回归
tests/desktop-tui.test.ts    第三栏启动、面板与本机 PTY 回归
tests/i18n.test.ts           界面语言回归
tests/uninstall.test.ts      用户数据保留、强确认与恢复收据回归
PRODUCT.md                   产品定义
DESIGN.md                    shipped UI 设计系统
```

## 开发验证

```bash
pnpm typecheck
pnpm test
pnpm pack --dry-run --json
```

发行包只包含 GoalBoard V1 的 `dist`、Runtime Skill 和 README，不包含第二套运行时。

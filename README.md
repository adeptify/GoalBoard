# GoalBoard

GoalBoard 是人和 Agent Runtime 共用的本地 Goal 真相源。它用一份 SQLite 保存 Goal Contract、树与依赖、风险、Claim、Run、Evidence、Review、Candidate 和 Rewire。

GoalBoard 不启动 Runtime，也不分发任务。Runtime 从 Ready Set 自主选择并领取 Goal，用户始终可以通过 Web 查看和确认同一份事实。

```text
用户录入 Goal
→ Runtime 通过 MCP 领取澄清、执行或重新验证
→ Runtime Skill 约束工作方式
→ 用户在 GoalBoard 查看 Contract、依赖、风险和进度
→ Runtime 回传 Evidence 与 Review
→ Coordinator 判定 Goal 是否完成
```

## 快速开始

需要 Node.js 20 或更高版本。

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test

node dist/cli/main.js v1 init --db .goalboard/my-board.db --json '{
  "board_id":"my-board",
  "title":"交付我的产品",
  "actor_id":"user",
  "idempotency_key":"init-1"
}'

node dist/web/server.js --db .goalboard/my-board.db --board-id my-board
```

打开 `http://127.0.0.1:4173`。如果只想查看明确标记的示例数据，可以运行 `pnpm web:demo`。

## Goal Contract

用户可以先手工保存只有标题的 `draft / abstract` Goal。clarifier Runtime 读取项目事实并逐步提出 Outcome、Why、非技术业务逻辑、范围、输入输出、验收、依赖、风险和 Review Policy 的补全建议；这些建议只有在用户确认后才成为 accepted Contract。

最小可执行 Goal 与 Task 是同一粒度：结果在 Goal 内闭环，并且有可观察或可量化的验收条件。例如“设计用户 Domain，并提供可测试的增删改查方法”可以是一个叶子 Goal；“把账号系统做好”仍需继续拆分。

accepted Contract 不原地改版本。后续新需求创建新的 Candidate Goal，由用户分别决定是否接受新 Goal、是否确认 Rewire。

手工创建一个完整叶子 Goal（仓库中也提供了可直接修改的 [Draft 示例](examples/draft-goal.json) 与 [叶子 Goal 示例](examples/leaf-goal.json)）：

```bash
goalboard v1 create-goal --db .goalboard/my-board.db --json '{
  "board_id":"my-board",
  "actor_id":"user",
  "idempotency_key":"goal-1",
  "goal":{
    "goal_id":"user-domain",
    "title":"设计用户 Domain",
    "outcome":"用户数据具备可用的增删改查行为",
    "why":"为账号相关能力提供稳定边界",
    "business_logic":"调用方可以创建、读取、修改和删除用户；找不到用户时返回明确结果，不影响其他领域。",
    "definition_state":"accepted",
    "decomposition_state":"closed_leaf",
    "acceptance_criteria":[{
      "statement":"增删改查和未找到场景都通过测试",
      "decision_method":"automated_check",
      "pass_condition":"用户 Domain 定向测试退出码为 0"
    }]
  }
}'
```

## Runtime 工作流

所有角色都先读取 Ready 和 Contract，再 Claim；Claim 是带时限的占用，不是任务分配。

```text
clarifier:
  ready → contract → claim → run-start
  → contract-propose → 用户确认 → run-report → release

executor:
  ready → contract → claim → run-start → 实现与验证
  → run-report → evidence-submit → review-submit → complete → release

revalidator:
  ready → contract → claim → run-start
  → 核对 Contract、active dependencies、Risks 和证据
  → revalidate → run-report → release
```

普通 Runtime 不能创建 canonical Goal、修改 accepted Contract、激活依赖或替用户决定 Candidate/Rewire。执行中发现的新工作只能提交 Candidate；发现依赖变化只能提交带方向、依据、证据、拒绝影响和置信度的 Dependency Proposal。

## MCP

宿主或管理入口必须先启动并验证 `goalboard-mcp` 与 `goalboard-web`。两者必须使用同一个 SQLite 绝对路径和同一个 `board_id`，MCP 的 Web 地址必须返回能打开同一 Board、同一 Goal 的 `goal_url`。

### 宿主启动同一真相源

先确定唯一的数据库、Board 和 Web 地址。下面两段命令必须使用完全相同的值，且由宿主或管理入口启动，不由 Runtime 启动：

```bash
export GOALBOARD_DATABASE="/absolute/path/to/project/.goalboard/goalboard.db"
export GOALBOARD_BOARD_ID="my-board"
export GOALBOARD_WEB_URL="http://127.0.0.1:4173"

node dist/web/server.js \
  --db "$GOALBOARD_DATABASE" \
  --board-id "$GOALBOARD_BOARD_ID" \
  --port 4173
```

在宿主的另一个进程中启动 Runtime audience MCP：

```bash
GOALBOARD_DATABASE="/absolute/path/to/project/.goalboard/goalboard.db" \
GOALBOARD_BOARD_ID="my-board" \
GOALBOARD_WEB_URL="http://127.0.0.1:4173" \
GOALBOARD_MCP_AUDIENCE="runtime" \
node dist/mcp/server.js
```

宿主完成启动后，应通过 MCP 读取 Contract，确认返回的 `board.board_id` 是 `my-board`，并直接打开其原始 `goal_url`，确认 Web 显示的是同一个 Goal。不要从前端地址反推或改写数据库身份。

```toml
[mcp_servers.goalboard]
command = "node"
args = ["/absolute/path/to/goalboard/dist/mcp/server.js"]
env = {
  GOALBOARD_DATABASE = "/absolute/path/to/project/.goalboard/goalboard.db",
  GOALBOARD_BOARD_ID = "my-board",
  GOALBOARD_WEB_URL = "http://127.0.0.1:4173",
  GOALBOARD_MCP_AUDIENCE = "runtime"
}
```

Runtime audience 只暴露读取、Ready/Claim/Run、Contract/Candidate/Dependency Proposal、重新验证、Evidence、Runtime Review、完成检查和释放。它不能覆盖宿主固定的数据库、Board 或 URL。

受信用户入口需要创建 Goal、维护关系/风险/Policy、决定 Contract/Candidate/Rewire 或导入旧数据时，单独使用 `GOALBOARD_MCP_AUDIENCE=management`。不要把 management MCP 交给自主 Runtime。

Runtime 只检查固定连接是否可用。服务不可用或身份不一致时必须停止，不能自行启动另一实例、切换数据库、替换 `board_id`、改写 URL 或使用 CLI 兜底。完整协议见 [Runtime Skill](skills/goal-advance/SKILL.md)。

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

公开 CLI 只有 `goalboard v1 <operation>`：

```text
init | create-goal | snapshot | contract | ready | explain | claim | release
run-start | run-report | revalidate | evidence-submit | review-submit | complete
relation-add | impact-add | policy-set | risk-add | risk-state | active-goal
contract-propose | contract-decide | candidate-submit | dependency-propose
candidate-decide | rewire-confirm | import-v3
```

复杂 payload 可以通过 `--json` 或 `--file payload.json` 传入。CLI 是用户/管理和本地调试入口，不是 Runtime 的服务故障回退。

## 项目结构

```text
src/v1/                      SQLite Store、Coordinator、types、CLI 与一次性导入
src/mcp/server.ts            V1-only MCP Server
src/web/                     Goal Tree 与文档式 Goal 工作区
src/cli/main.ts              V1-only CLI 入口
skills/goal-advance/         Runtime 工作协议
tests/v1.test.ts             Coordinator、CLI、迁移与协议回归
tests/mcp.test.ts            MCP audience、权限与连接回归
tests/web.test.ts            Web 数据与交互回归
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

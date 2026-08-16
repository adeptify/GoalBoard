# GoalBoard

GoalBoard 是人和 Agent Runtime 共用的本地 Goal 真相源。它用一份 SQLite 保存 Goal Contract、树与依赖、风险、Claim、Run、Evidence、Review、Candidate 和 Rewire。

GoalBoard 不启动 Runtime，也不分发任务。当前 Runtime 从统一 Available 集合自主选择一项，原子地创建 Claim 和 Run；Web 是可选查看与用户确认界面，不是推进 Goal 的必经步骤。

```text
用户在当前 Runtime 输入粗略想法或要求推进已有 Goal
→ Runtime 通过 MCP 创建并自然语言澄清 Draft，或从 Available 自主选择并开始执行、复核或重新验证
→ Runtime Skill 约束工作方式
→ Runtime 在当前对话中解释提案，用户确认、拒绝或修改其中的条目
→ GoalBoard 把已确认部分物化为 Goal Tree，并自动更新工作状态
→ 用户可选地在 GoalBoard 查看 Contract、依赖、风险和进度
→ Runtime 回传 Evidence 与 Review
→ Coordinator 判定 Goal 是否完成
```

## 快速开始

需要 Node.js 20 或更高版本。

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test

# 只安装 GoalBoard 本体；不会修改项目或 Runtime 配置
goalboard install

# Web 只从 GoalBoard 自己的项目目录列出可浏览项目
node dist/web/server.js --home "$HOME/.goalboard"
```

先在当前 Runtime 使用 GoalBoard Skill 创建、连接或迁移项目，再打开 `http://127.0.0.1:4173` 选择项目。这个选择只改变网页浏览位置，不会创建项目、也不会绑定或切换当前 Runtime Session。已有旧 DB 只能从项目列表中的“迁移已有 GoalBoard 数据”入口显式确认后迁入项目。

### 安装边界

`goalboard install` 只维护 `~/.goalboard`：版本化程序与共享 Skill、MCP/Web/CLI 启动入口、项目 DB 根目录、日志和安装清单。它不会创建或启动项目，不会写入用户项目，也不会修改任何 Runtime 的用户级配置。之后若要把 MCP 入口注册到某个 Runtime，必须走用户确认的 Runtime 集成流程。

项目目录使用不可变的 `project_id` 区分项目，显示名称可以改名或重名；每个项目都有自己的 `goalboard.db`。`projects/catalog.db` 保存项目身份、DB 位置，以及用户明确建立的 `Runtime 工作入口 → project_id` 绑定、切换、解绑、当前 Session 的候选拒绝和删除收据历史；不复制 Goal 事实，也不会扫描 Git、目录名或聊天内容来猜项目。宿主可以为新 Session 提供非权威线索，GoalBoard 也可把同一 Runtime 最近确认过的项目作为候选来排序；两者都绝不自动建立绑定。解绑只移除一个当前工作入口的绑定；删除项目及其 DB 必须单独确认，并会拒绝仍有有效 Claim 或未结束 Run 的项目。

### 安装后的项目选择

安装命令会返回一个默认全空的安装后提示：“尚未创建、导入、启用或启动任何项目”。当前 Runtime 的统一 Skill 会在用户明确要设置时用 MCP 询问并逐项执行；不要求用户先打开 Web。

管理入口也可以显式提交同一份选择，不存在“安装即授权”的总开关：

```bash
goalboard project-setup --home "$HOME/.goalboard" --json '{
  "actions": [
    {
      "action_id": "create-novel",
      "kind": "create",
      "display_name": "NovelRPG",
      "actor_id": "user"
    }
  ],
  "confirmed_action_ids": ["create-novel"],
  "idempotency_key": "postinstall-create-novel"
}'
```

只有 `confirmed_action_ids` 中的每个操作会执行；其余操作会明确返回为跳过。`create`、`import`、`enable` 和 `start` 是独立选择，不会互相隐式触发。相同 `idempotency_key` 重试完全相同的已确认选择时会返回原结果，不会重复创建项目或启动服务。CLI 不会偷偷拉起后台服务；`start` 只有在支持它的 Runtime/桌面宿主提供启动器、且该项目已被明确启用后才会执行。未支持时返回失败结果，不会改配置或留下进程。

## Goal Contract

用户可以在当前 Runtime 提出一个粗略想法；GoalBoard Skill 用 MCP 创建只有标题的 `draft / abstract` Goal。clarifier Runtime 读取项目事实并逐步提出 Outcome、Why、非技术业务逻辑、范围、输入输出、验收、依赖、风险和 Review Policy 的补全建议；这些建议只有在用户确认后才成为 accepted Contract。

最小可执行 Goal 与 Task 是同一粒度：结果在 Goal 内闭环，并且有可观察或可量化的验收条件。例如“设计用户 Domain，并提供可测试的增删改查方法”可以是一个叶子 Goal；“把账号系统做好”仍需继续拆分。

accepted Contract 不原地改版本。后续新需求创建新的 Candidate Goal，由用户分别决定是否接受新 Goal、是否确认 Rewire。

## Runtime 工作流

统一 GoalBoard Skill 被用户调用后，先解析当前 Runtime 宿主提供的稳定工作入口：已绑定则恢复该项目的固定 MCP 连接；新 Session 若有宿主线索或同一 Runtime 的已确认项目历史则返回候选项目和通用原因，但仍保持未绑定，当前 Runtime 必须问用户“要关联这个项目吗”；没有候选才在当前对话让用户选择已有项目或明确命名一个新项目。用户明确同意候选或已有项目时才调用 `context-bind`，明确拒绝一个候选时调用 `context-reject-suggestion`，它只停止当前 Session 重复提示该候选，不删除任何数据或影响其他 Session。新建项目才调用 `context-create-and-bind`；只有用户明确选择后才会写入绑定。已有入口切换到其他项目时还必须再次明确确认。用户明确要求“只在这里停用”时调用 `context-unbind`，只移除当前入口绑定；用户明确要求删除某一个命名项目及其数据时才调用 `project-delete`，它会先保护有效 Claim 和未结束 Run。宿主没有提供可靠入口时，Runtime 只能说明不能可靠关联并询问用户，不能从 Git、目录或聊天内容猜测。这个解析不会在 Runtime 启动或普通对话时后台发生。

用户在安装后明确要求项目设置时，Skill 可以调用 `postinstall-project-selection`。它把创建、导入、启用和启动作为带独立 action ID 的选项；只有当前对话中逐项确认的 ID 会执行。这个复合 MCP 用于安装后选择，不取代平常的 `context-create-and-bind` 当前项目入口。

项目连接明确后，当前 Runtime 再读取 `available` 和所选 Goal 的 Contract，并自己决定是否选择其中一项。GoalBoard 不返回“唯一下一份”；Claim 是带时限的占用，不是任务分配。

```text
new rough idea:
  draft-dialogue-start → 当前 Runtime 自然语言澄清
  → 每次实质回答 draft-dialogue-turn → proposal_summary
  → goal-tree-propose / read / check → 当前 Runtime 与用户对话决定条目 → goal-tree-decide

existing Draft:
  contract → 有保存的澄清会话则 draft-dialogue-resume
  → 否则 draft-dialogue-start(goal_id) 复用该 Draft 并开始当前对话澄清
  → proposal / 用户确认 → run-report → release

executor:
  available(next_action=execute) → contract → select-goal → 实现与验证
  → run-report → evidence-submit → review-submit → complete → release

reviewer:
  available(next_action=review) → contract → select-goal
  → review-submit → run-report → release

revalidator:
  available(next_action=revalidate) → contract → select-goal
  → 核对 Contract、active dependencies、Risks 和证据
  → revalidate → run-report → release
```

`select-goal` 在同一个 SQLite 事务中创建 Claim 和 Run；失败不会留下只有 Claim、没有 Run 的假“进行中”。正常 Runtime 工作流使用 `available` 与 `select-goal`；`ready`、`claim` 和 `run-start` 只用于低层管理或测试场景。

对于新想法，Runtime 不必让用户先打开 Web 或逐字段填写 Contract：`draft-dialogue-start` 在一个事务中创建最小 `draft / abstract` Goal、clarifier Claim 和 Run，随后当前对话每产生一次实质澄清进展就调用 `draft-dialogue-turn` 保存用户回答、当前理解、来源事实、假设和唯一下一问；Session 中断后用 `draft-dialogue-resume` 恢复。澄清完成时，当前 Runtime 用 `goal-tree-propose` 一次提交整份可确认的拆分／变更方案，并可通过 `goal-tree-read`、`goal-tree-check` 跨 Session 恢复和检查；推断和建议在用户确认前都不是 canonical Goal、关系、Risk 或 Policy。用户随后仍在当前 Runtime 对话中逐项确认、拒绝或要求修改；Runtime 调用 `goal-tree-decide`，由宿主注入可信用户和消息引用。已确认的安全条目才会物化，过期、悬空或循环条目会保持冲突，不影响其他已确认条目。

物化后不增加第二套“是否澄清完成”状态：确认的复合父 Goal 有子项时显示“已澄清，等待子 Goal”，确认的最小叶子显示“待执行”，仍是 Draft／开放拆分的分支才显示“待澄清”。

普通 Runtime 不能创建 canonical Goal、修改 accepted Contract、激活依赖或替用户决定 Candidate/Rewire。执行中发现的新工作只能提交 Candidate；发现依赖变化只能提交带方向、依据、证据、拒绝影响和置信度的 Dependency Proposal。

## MCP

GoalBoard 通过统一 Skill 的“工作入口绑定”连接项目：Runtime 宿主提供一个明确稳定的入口 ID，Skill 调用 `goalboard_v1_context_resolve` 后才从 `~/.goalboard/projects/catalog.db` 恢复项目连接。Runtime 不把数据库路径或 `board_id` 当作用户要选择的项目身份。

### Runtime 工作入口绑定（推荐）

Runtime 宿主只在自己能保证稳定性的情况下提供入口 ID；它不是 Git 地址、目录名、仓库结构或模型从对话中推断的字符串。复用同一个不透明 ID 只表示恢复同一个宿主 Session／工作入口；真正的新 Session 必须拿到新的 ID。宿主还可以单独提供工作空间、目录、会话标题、最近项目等非权威线索来排序新 Session 的候选；GoalBoard 也只会把同一 Runtime 最近确认的其他 Session 项目作为建议。不能把任何线索当作 ID 或自动绑定。安装不会写入下面任何 Runtime 配置，用户明确同意 Runtime 集成后，宿主才可传入这些值：

```bash
GOALBOARD_HOME="$HOME/.goalboard" \
GOALBOARD_RUNTIME_ID="codex" \
GOALBOARD_WORK_CONTEXT_ID="<宿主提供的稳定工作入口 ID>" \
GOALBOARD_WORK_CONTEXT_STABLE="true" \
GOALBOARD_WEB_URL="http://127.0.0.1:4173" \
GOALBOARD_MCP_AUDIENCE="runtime" \
node dist/mcp/server.js
```

这个 MCP 进程启动时仍是“未连接项目”状态，不会打开某个 Board。统一 Skill 先调用 `goalboard_v1_context_resolve`：

- `bound`：返回唯一 `project_id`、`board_id` 和固定数据库连接；之后普通 GoalBoard MCP 调用只能使用该 `board_id`。
- `suggested`：新 Session 有宿主线索或同一 Runtime 的已确认项目历史。结果只含候选项目和不泄露原始线索的通用原因，没有项目连接；当前 Runtime 必须在同一对话问用户是否关联。
- `unbound`：返回 `missing_stable_context` 或 `unknown_context` 以及 `ask_user_to_select_or_create`，不连接任何项目。
- 用户明确拒绝某个 `suggested` 候选时，Skill 调用 `goalboard_v1_context_reject_suggestion` 并传入 `user_confirmed=true`。它只在这个 Session 不再提示该候选，随后可返回另一个候选或显式的项目列表／新建路径；不会解绑、删除或影响其他 Session。
- 用户在当前对话明确选定已存在项目后，Skill 调用 `goalboard_v1_context_bind` 并传入 `user_confirmed=true`。若该入口原本属于别的项目，必须额外传入 `rebind_confirmed=true`；否则绑定保持不变。
- 用户在当前对话明确要求新建一个命名项目后，Skill 调用 `goalboard_v1_context_create_and_bind` 并传入 `user_confirmed=true`、项目名称和幂等键。它只在 `~/.goalboard` 创建项目 DB 并绑定；失败不会留下孤儿项目。
- 用户要求查看项目时，Skill 调用 `goalboard_v1_context_list_projects`；它不暴露数据库路径，也不改变当前连接。
- 用户明确要求仅解绑当前工作入口时，Skill 调用 `goalboard_v1_context_unbind` 并传入 `user_confirmed=true`。它不删除项目、DB 或其他 Runtime 的绑定。
- 删除项目及其 DB 是另一项单独确认：用户明确点名项目并确认删除后，Skill 调用 `goalboard_v1_project_delete` 并传入 `delete_confirmed=true` 和幂等键。项目有有效 Claim 或未结束 Run 时会被拒绝；成功后返回删除收据，Runtime 不能继续使用旧连接。

Web 是可选查看和用户确认界面。GoalBoard 不会为解析绑定而启动、重启或切换 Web；普通 Web 启动后先显示项目列表，用户选择的只是当前浏览项目，不会读取、创建、解绑或重绑 Runtime Session。网页不会自动创建或启用项目；旧 DB 的迁移必须由用户在项目列表中明确选择并确认，迁移后仍只是打开新的项目页面。

Runtime audience 只暴露工作入口解析/显式绑定、读取、Available/原子选择/Run、Contract/Candidate/Dependency Proposal、Goal Tree Proposal/Decision、重新验证、Evidence、Runtime Review、完成检查和释放。`goal-tree-decide` 不是 Runtime 自己的用户权限：只有宿主提供当前用户对话与消息的可信上下文时，它才能携带用户的决定写入。它不能通过工具参数覆盖已解析的项目连接。

受信用户入口需要创建 Goal、维护关系/风险/Policy、决定 Contract/Candidate/Rewire 或导入旧数据时，单独使用 `GOALBOARD_MCP_AUDIENCE=management`。不要把 management MCP 交给自主 Runtime。

服务不可用或身份不一致时 Runtime 必须停止，不能自行启动另一实例、切换数据库、替换 `board_id`、改写 URL 或使用 CLI 兜底。完整协议见 [Runtime Skill](skills/goal-advance/SKILL.md)。

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

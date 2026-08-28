# MCP 接入

GoalBoard 通过统一 Skill 连接项目：Runtime 可以提供 Session ID，宿主另行提供当前 workspace；Skill 调用 `goalboard_v1_context_resolve` 后才从 `~/.goalboard/projects/catalog.db` 解析 Session 选择、目录历史候选或显式默认项目。Runtime 不把目录、数据库路径或 `board_id` 当作用户要选择的项目身份。

## Runtime 工作入口绑定（推荐）

Runtime 宿主只在自己能保证稳定性的情况下提供 Session ID；它不是 Git 地址、目录名、仓库结构或模型从对话中推断的字符串。GoalBoard 支持任意 MCP Runtime 在每次 `tools/call` 的 `_meta.threadId`、`_meta.sessionId` 或 `_meta["goalboard/sessionId"]` 中提供 Session ID，也支持 Claude Code 等 adapter 的稳定环境信号；普通工具参数不会被当成宿主身份。同一个长驻 MCP 进程收到不同 Session ID 时会清掉前一个 Session 的连接。没有 Session ID 时，GoalBoard 仍可把 canonical workspace 用于查找历史候选，但绝不把目录或 MCP 进程伪装成 Session。一个 workspace 可关联多个 `project_id`；普通选择不自动设默认。

安装本身不会写入 Runtime 配置。Codex 和 Claude Code 应由用户在接入预览中确认后使用稳定 launcher；其他 Runtime host 可以显式提供同一组环境值：

```bash
GOALBOARD_HOME="$HOME/.goalboard" \
GOALBOARD_RUNTIME_ID="<runtime-id>" \
GOALBOARD_WORK_CONTEXT_ID="<宿主提供的稳定工作入口 ID>" \
GOALBOARD_WORK_CONTEXT_STABLE="true" \
GOALBOARD_WEB_URL="http://127.0.0.1:4173" \
GOALBOARD_MCP_AUDIENCE="runtime" \
"$HOME/.goalboard/bin/goalboard-mcp"
```

这个 MCP 进程启动时仍是“未连接项目”状态，不会打开某个 Board。统一 Skill 先调用 `goalboard_v1_context_resolve`：

> **Codex 与通用 Runtime 的回退**：Codex CLI/桌面的 stdio MCP 启动环境不会注入 `CODEX_THREAD_ID`，官方已将该需求标记为不计划修复（[openai/codex#19937](https://github.com/openai/codex/issues/19937)，NOT_PLANNED）。较新的 Codex app-server 调用路径可以在单次工具调用的 `_meta.threadId` 中带入 thread；GoalBoard 会在存在时使用它。没有 Session 信号时仍可用工作目录找到历史候选，但目录不充当 Session ID；当前消息没有明确选择项目时，新对话默认会再次询问。

- `bound`：返回唯一 `project_id`、`board_id` 和固定数据库连接；之后普通 GoalBoard MCP 调用只能使用该 `board_id`。
- `suggested`：新 Session 有 workspace 历史或其他宿主线索。结果只含候选项目和不泄露原始路径的通用原因，没有项目连接。若当前用户消息已经明确要求用 GoalBoard 连接或推进一个已命名项目，且返回的现有项目中只有一个无歧义匹配，Skill 直接调用 `context_bind`；否则才展示候选并询问。
- `unbound`：返回 `missing_stable_context` 或 `unknown_context`，不连接任何项目；同样先复用当前消息中对一个现有项目的明确选择，否则展示项目列表并询问选择或新建。
- 用户明确拒绝某个 `suggested` 候选时，Skill 调用 `goalboard_v1_context_reject_suggestion` 并传入 `user_confirmed=true`。它只在这个 Session 不再提示该候选，随后可返回另一个候选或显式的项目列表／新建路径；不会解绑、删除或影响其他 Session。
- 用户在当前对话明确选定已存在项目后，Skill 调用 `goalboard_v1_context_bind` 并传入 `user_confirmed=true`。普通选择只影响本 Session（若可识别）并记录 workspace 历史；只有用户另行明确要求以后自动进入时才传 `binding_scope=workspace_default`。同一 scope 从别的项目切换时还需 `rebind_confirmed=true`。
- 用户在当前对话明确要求新建一个命名项目后，Skill 调用 `goalboard_v1_context_create_and_bind` 并传入 `user_confirmed=true`、项目名称和幂等键。它只在 `~/.goalboard` 创建项目 DB 并绑定；失败不会留下孤儿项目。
- 用户要求查看项目时，Skill 调用 `goalboard_v1_context_list_projects`；它不暴露数据库路径，也不改变当前连接。
- 用户明确要求仅解绑当前工作入口时，Skill 调用 `goalboard_v1_context_unbind` 并传入 `user_confirmed=true`。它不删除项目、DB 或其他 Runtime 的绑定。
- 删除项目及其 DB 是另一项单独确认：用户明确点名项目并确认删除后，Skill 调用 `goalboard_v1_project_delete` 并传入 `delete_confirmed=true` 和幂等键。项目有有效 Claim 或未结束 Run 时会被拒绝；成功后返回删除收据，Runtime 不能继续使用旧连接。

Web 是可选查看和用户确认界面。GoalBoard 不会为解析关联而要求启动 Web；普通 Web 启动后先显示项目列表，用户选择的只是当前浏览项目。项目设置可管理已经确认过的 Session 关联和 workspace 的多个成员项目，并显式设置默认或解除关联；不会展示完整目录路径。项目创建、Runtime 配置和旧 DB 迁移也都先展示影响或要求单独确认。

Runtime audience 只暴露工作入口解析/显式绑定、读取、Available/原子选择/Run、Contract/Candidate/Dependency Proposal、Goal Tree Proposal/Decision、重新验证、Evidence、Runtime Review、完成检查和释放。`goal-tree-decide` 不是 Runtime 自己随意改树的权限：只有用户刚刚在当前对话明确决定后，Runtime 才能传 `user_confirmed=true`、确认摘要和具体决定；GoalBoard 结合宿主 Session 元数据生成审计引用。Runtime 不能通过普通工具参数伪造 Session 身份或覆盖已解析的项目连接。

受信用户入口需要创建 Goal、维护关系/风险/Policy、决定 Contract/Candidate/Rewire 或导入旧数据时，单独使用 `GOALBOARD_MCP_AUDIENCE=management`。不要把 management MCP 交给自主 Runtime。

服务不可用或身份不一致时 Runtime 必须停止，不能自行启动另一实例、切换数据库、替换 `board_id`、改写 URL 或使用 CLI 兜底。完整协议见 [Runtime Skill](../skills/goal-advance/SKILL.md)。

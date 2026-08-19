# GoalBoard

**中文** | [English](README.en.md)

> 你随口说的想法，会变成 AI 一直记得、不会跑偏、做没做完都看得见的目标。

你是不是也这样过：昨天跟 AI 聊好的方案，今天新开一个对话，它全忘了，背景又得从头讲一遍；聊着聊着需求被悄悄改掉，等你发现已经做歪了；几个子任务谁先谁后全靠 AI 心情，前置没做完后面的就白干；它说“做完了”，你心里却完全没底；Codex 干一半换 Claude Code，两边进度对不上；想法还一团模糊，它就急着开干，回头还得返工；好不容易对齐了输入输出，它又满嘴黑话，你根本看不懂它干了啥；活卡住了不知道在等什么，一堆该你拍板的事也埋没在聊天记录里。

所以我们推出 **GoalBoard**——一个**不侵入**的、提供**丰富 MCP** 的、**不包含自身 AI 功能**的，人和 AI 之间的**目标对账本**：

- **不侵入**：不启动你的 AI，也不把任务硬塞给谁；能做的事摆在列表里，AI 自己挑着做；
- **丰富 MCP**：设置页可自动适配 Codex、Claude Code、OpenCode、Pi Agent、Grok Build；其他 MCP Runtime 也能连上同一套协议。换对话、换 AI，目标都在；
- **没有自己的 AI**：不捆绑任何模型，你的 AI 才是主角；
- **目标对账本**：目标、拆分、进度、完成标准都记在账上——谁在干、做到哪、卡在哪、还差什么、什么在等你决定，打开就清楚，不用靠聊天记录去猜。

```text
你说一个想法 → 当前 AI 和你澄清 → 你确认目标树
→ AI 自主选择可做项 → 实现与验证 → GoalBoard 记下进度和完成情况
```

## 界面速览

![Goal Tree：用业务语言展示目标、状态、下一步和完成依据](docs/screenshots/goalboard-tree.png)

内置示例用一轮完整的新用户体验说明 Goal Tree，而不是用模块名代替用户目标：

```text
让第一次使用的人顺利完成一轮目标协作
├─ 让每项工作都有可信的完成依据               已完成
├─ 让不同 AI 对话看到同一项目进度              进行中
├─ 让用户打开页面就看懂目标和下一步             等待前置工作
└─ 让新用户安装后知道下一步怎么开始             待澄清
```

示例还包含待决定事项、首次接入后忘记新开会话的 Risk，以及一条可在回收站恢复的旧方案。Goal 正文按“目标是什么 → 怎样才算完成 → 现在怎么推进 → 风险与规则 → 历史”阅读。与当前结构或示例内容不一致的旧正文截图不再展示。

浏览器和可选的 macOS App 打开同一套本机页面（`http://127.0.0.1:4173`）。Goal 详情是三栏工作台：左边 Goal Tree，中间连续文档，右边本机终端。点「添加终端」可在**当前这条 Goal** 上打开 Claude Code、Codex、OpenCode、Pi Agent、Grok Build 或自定义命令；标签跟着 Goal 走，切到另一条 Goal 会换文档和那一组标签，原来的终端继续在后台跑。打开页面不会绑定 Session，也不会替你领取工作；只有点开终端才绑定这个工作入口，只有点「推进这个 Goal」才往输入框打字。决定中心、归档和回收站保持两栏。界面默认中文，可切换英文；Goal 标题和正文保持原文。

## 3 分钟体验

需要 Node.js 20+、pnpm，以及 macOS（常驻 Web 服务目前使用 LaunchAgent；其他系统仍可前台启动 Web）。

```bash
git clone https://github.com/adeptify/goalboard.git
cd goalboard
pnpm install --frozen-lockfile

# 唯一本地安装入口：会先构建，再安装到 ~/.goalboard
pnpm install:local

# macOS：明确确认后让 Web 常驻，关闭终端或 Runtime Session 也不会退出
"$HOME/.goalboard/bin/goalboard" service install --home "$HOME/.goalboard" --confirm

# 创建一份与用户数据分开的可重建示例
"$HOME/.goalboard/bin/goalboard" demo create --confirm
```

打开 `http://127.0.0.1:4173`：

1. 进入示例项目，查看 Goal Tree、待决定事项和完成证据；打开一条 Goal 后，右侧可以「添加终端」。
2. 在“设置 → Runtime”中选择 Codex、Claude Code、OpenCode、Pi Agent 或 Grok Build，先看改动预览，再确认接入。
3. **新开一个该 Runtime 的 Session**，说“继续用 GoalBoard”。Runtime 只在 Session 启动时读取 MCP 和 Skill，所以当前对话不会凭空出现刚安装的工具。

接入生效后也可以直接对 Runtime 说“启动 GoalBoard”。它会先检查受管理的服务状态：macOS
首次启用时会说明这是登录后自启、关闭终端后仍运行的用户级后台服务，并在你明确确认后安装；
已经运行时只返回页面地址。只有明确说“临时打开 GoalBoard”，才会使用随当前终端或 Session
结束的前台进程。非 macOS 目前没有系统级常驻服务，Runtime 会如实说明并询问是否临时打开。

想从自己的想法开始时，不需要先在网页里填表。新 Session 接入后直接说：

> 用 GoalBoard 新建一个项目，帮我把“让朋友第一次安装就能顺利用起来”澄清成 Goal Tree。

GoalBoard 会在当前对话里继续问关键问题；只有你确认的提案才会进入正式 Goal Tree。

## 更新已有安装

已经从仓库安装过时，先拉取新内容，再走同一个安装入口。即使版本号没有变化，安装器也会比较实际内容并刷新程序和 Skill；用户项目、Runtime 配置和 demo 都不会被自动改写：

```bash
git pull --ff-only
pnpm install --frozen-lockfile
pnpm install:local

# 正在使用常驻 Web 时，明确重启到刚安装的 release
"$HOME/.goalboard/bin/goalboard" service restart --home "$HOME/.goalboard" --confirm
```

更新 MCP 或 Skill 后也要新开 Runtime Session，因为已经运行的 Session 不会重新加载工具。若要让内置 demo 使用新版示范内容，再单独执行 `goalboard demo reset --confirm`；它会清除 demo 内的改动，但不会影响用户项目。

## 演示数据

安装后的 CLI 和 Web“设置 → 项目”都能创建同一份演示数据。先预览，明确确认后才写入：

```bash
"$HOME/.goalboard/bin/goalboard" demo create
"$HOME/.goalboard/bin/goalboard" demo create --confirm
"$HOME/.goalboard/bin/goalboard" demo reset --confirm
"$HOME/.goalboard/bin/goalboard" demo remove --confirm
```

这份项目在 catalog 中明确标记为 `regenerable_demo`，与 `user`、`migrated_user` 用户数据分开。重复创建会打开已有 demo；重建会清除 demo 内的改动；删除和普通卸载都只清理可再生 demo，不会碰用户项目。仓库开发和截图也可以继续使用 `examples/seed-demo.mts`，它调用的是同一套分类和重建逻辑。

## 启动 Web：常驻或临时

已经接入 GoalBoard Skill 的 Runtime 中，推荐直接说：

> 启动 GoalBoard

Runtime 会先只读检查 `goalboard service status`，不会直接拉起一个容易随 Session 消失的前台
进程。macOS 上，未安装常驻服务时会先说明它将修改用户级 LaunchAgent、登录后自启且关闭终端
后仍运行，得到明确确认后才安装；已停止时启动，已运行时只返回地址，旧配置则先说明修复内容再
确认。服务命令会等到页面健康可访问后才报告成功。

如果只想当前终端临时使用，请明确说：

> 临时打开 GoalBoard

这会运行前台 `goalboard-web`；终端或 Runtime Session 关闭后页面也会停止。非 macOS 当前只支持
这种前台方式，不会用 `nohup` 或普通后台 shell 冒充系统级常驻服务。

## 开发与手动启动

需要 Node.js 20 或更高版本。

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test

# 从仓库安装：固定先构建，再只安装 GoalBoard 本体
pnpm install:local

# Web 只从 GoalBoard 自己的项目目录列出可浏览项目
"$HOME/.goalboard/bin/goalboard-web" --home "$HOME/.goalboard"
```

打开 `http://127.0.0.1:4173` 后，可以在设置中创建、导入、改名和打开项目，也可以先配置 Runtime 接入。选择一个项目只改变网页浏览位置，不会自动绑定或切换当前 Runtime Session；已有旧 DB 只有明确选择并确认后才会迁入项目。macOS 上也可从仓库运行 `pnpm desktop`，App 只是同一套页面的窗口壳。

直接运行 `goalboard-web` 仍是前台模式，适合临时调试；关闭终端会同时关闭页面。macOS 上可改用用户级 LaunchAgent 常驻服务，先预览再确认：
>
> ```bash
> # 只预览，不写任何系统配置
> "$HOME/.goalboard/bin/goalboard" service install --home "$HOME/.goalboard"
>
> # 明确确认后安装并启动；登录自动启动，异常退出自动恢复
> "$HOME/.goalboard/bin/goalboard" service install --home "$HOME/.goalboard" --confirm
>
> "$HOME/.goalboard/bin/goalboard" service status --home "$HOME/.goalboard"
> ```
>
> `stop` 只停止当前服务并保留登录启动；`remove` 才会停止并移除 GoalBoard 自己创建且未被改写的 LaunchAgent。日志位于 `~/.goalboard/logs/web-service.log` 和 `web-service.error.log`。非 macOS 会明确显示暂不支持，不会用普通后台 shell 假装安装成功。也可以在 Web 的“设置 → 诊断”中完成同样的预览和确认。

### 安装边界

`goalboard install` 只维护 `~/.goalboard`：版本化程序与共享 Skill、MCP/Web/CLI 启动入口、项目 DB 根目录、日志和安装清单。它不会创建或启动项目，不会写入用户项目，也不会修改任何 Runtime 的用户级配置。之后若要把 MCP 入口注册到某个 Runtime，必须走用户确认的 Runtime 集成流程。

从仓库本地安装请使用 `pnpm install:local`；这个唯一入口会先重新构建，再安装当前内容。直接对带 `src/` 的仓库执行 `goalboard install --source ...` 时，安装器会核对构建指纹，源码与 `dist` 不一致就停止，不会悄悄复制旧构建。release 同时记录内容摘要：版本相同但程序或 Skill 内容变化时会原子刷新，内容完全相同才返回“已经是最新状态”；刷新失败会恢复上一份 release，项目数据不参与替换。

项目使用不可变的 `project_id` 区分，显示名称可以改名或重名；每个项目都有自己的 `goalboard.db`。`projects/catalog.db` 保存项目身份、DB 位置、可选 Session 绑定、workspace 与多个项目的历史关联、用户显式设置的唯一默认项目，以及删除收据；不复制 Goal 事实，也不依赖 Git。普通项目选择不会自动成为目录默认项，新 Session 会拿到历史候选并询问；只有用户单独设置默认后才会自动恢复。解绑关联不删除项目；删除项目及其 DB 必须单独确认，并会拒绝仍有有效 Claim 或未结束 Run 的项目。

### 安全卸载

普通卸载先生成计划，不带 `--confirm` 不会修改任何文件。确认后只撤销仍由 GoalBoard ownership receipt 证明属于自己的 Runtime 接入、LaunchAgent、启动器和 release，并清理明确标记为可重建的 demo；用户项目、catalog、备份和日志都会保留，重新安装后可继续使用：

```bash
"$HOME/.goalboard/bin/goalboard" uninstall
"$HOME/.goalboard/bin/goalboard" uninstall --confirm
```

永久清除用户数据是另一项独立操作，不能复用普通卸载的一次确认。预览会给出精确 home 和用户项目数量；执行时必须把两者原样再提供一次：

```bash
"$HOME/.goalboard/bin/goalboard" uninstall --purge-user-data
"$HOME/.goalboard/bin/goalboard" uninstall --purge-user-data --confirm \
  --confirm-home "$HOME/.goalboard" --confirm-project-count N
```

如果 Runtime 配置、Skill 链接、LaunchAgent 或启动器已被用户改写，卸载会报告冲突并停止，不会扩大删除范围。执行中失败会在 `~/.goalboard/config/uninstall.json` 留下完成步骤、保留项目和错误，可在修复冲突后重新预览并继续。

### 安装后的下一步

`goalboard install` 只完成 GoalBoard 本体安装，默认输出安装位置、CLI/MCP/Web 启动器和安全边界；自动化可以使用 `goalboard install --json`。安装不会顺带创建项目、关联 Session、启动服务或修改 Runtime 配置。

安装后的 Runtime 接入由同一领域服务完成。当前 adapter 会只读探测 Codex、Claude Code、OpenCode、Pi Agent 和 Grok Build，并按各家官方位置写入：Codex / Grok Build 用 `~/.codex/config.toml` 或 `~/.grok/config.toml` 的 `[mcp_servers.goalboard]`，Claude Code 用 `~/.claude.json` 的 `mcpServers.goalboard`，OpenCode 用 `~/.config/opencode/opencode.json` 的 `mcp.goalboard`，Pi Agent 用 `~/.pi/agent/mcp.json`（供 `pi-mcp-adapter` 读取；Pi 本体没有 MCP）。同时把 `goal-advance` Skill 链到对应 skills 目录。预览包含配置路径、MCP 入口、Skill 链接、备份位置和重启说明；只有用户对当前 Runtime 和当前 plan 明确确认后才会写入。MCP 与 Skill 作为一个事务验证，失败会恢复原配置字节和原 Skill 状态。移除时只撤销 GoalBoard ownership receipt 记录且仍未被用户改写的内容。未知同名配置或 Skill 会显示冲突，不会被覆盖。

接入确认完成后，**必须新开那个 Runtime 的 Session**才会生效：Runtime 只在 Session 启动时读取 MCP 与 Skill 清单，当前对话不会动态出现刚写入的工具。新 Session 可直接复制「继续用 GoalBoard」续接；GoalBoard 会展示当前目录以前使用过的项目并请你确认。若希望以后自动进入某个项目，需要另外明确把它设为目录默认。Pi 若看不到 GoalBoard 工具，先运行一次 `pi install npm:pi-mcp-adapter` 再开新会话。接入预览界面会逐条展示改动内容和这段续接说明。

项目创建和当前 Session 关联是独立操作：用户在当前 Runtime 调用统一 Skill 后，Skill 使用 `context-list-projects`、`context-bind` 或 `context-create-and-bind`，并且只在用户明确选择后写入 GoalBoard 自己的数据目录。Web 可创建、导入、改名和打开项目，也可管理已经确认过的 Session 与 workspace 关联；网页中的项目选择本身不会改变 Runtime 连接，新 Session 默认仍要先询问，除非用户明确设置了目录默认项目。

Web 只监听 loopback 地址。每次启动都会生成只存在于本机页面中的随机控制令牌；所有 Web API 写请求还必须通过同源 Origin、控制令牌和一次性操作键校验。本机终端通道使用同一令牌：WebSocket 在 loopback 上升级，连接后的第一条消息必须带上该令牌。非本机 Host、第三方页面盲发、缺少凭据或重复请求都会在进入项目 catalog、Runtime 配置服务、Goal Coordinator 或 PTY 之前被拒绝。这个浏览器门禁不替代各领域流程原有的用户确认和幂等规则。

## 核心概念

| 概念 | 一句话说明 |
| --- | --- |
| Goal | 最小可执行目标，和 Task 同一粒度，必须有可观察或可量化的验收条件 |
| Goal Tree | 用户确认后的目标拆解结构，Plan 和看板都是它的派生视图 |
| 依赖 | 已确认的前置关系，是领取和完成的硬门禁 |
| Risk | 可能阻碍领取或完成的风险，需要人决定处理方式 |
| Claim | Runtime 对某个 Goal 的带时限占用，不是任务分配 |
| Run | 一次执行、复核或重新验证过程 |
| Evidence | 对应验收条件的证据（测试、检查、人工确认等） |
| Review | 自检、交叉或对抗性复核，通过后才算完成 |
| Candidate | 执行中发现的新工作，只能由用户决定是否接受 |
| Rewire | 用户确认后的目标关系重排 |

普通 Runtime 只能读取、选择、认领、执行、提交提案和证据，不能自行裁决 canonical Goal；所有推断和建议在用户确认前都不是权威事实。

## Goal Contract

用户可以在当前 Runtime 提出一个粗略想法；GoalBoard Skill 用 MCP 创建只有标题的 `draft / abstract` Goal。clarifier Runtime 读取项目事实并逐步提出 Outcome、Why、非技术业务逻辑、范围、输入输出、验收、依赖、风险和 Review Policy 的补全建议；这些建议只有在用户确认后才成为 accepted Contract。

最小可执行 Goal 与 Task 是同一粒度：结果在 Goal 内闭环，并且有可观察或可量化的验收条件。例如“设计用户 Domain，并提供可测试的增删改查方法”可以是一个叶子 Goal；“把账号系统做好”仍需继续拆分。

accepted Contract 不原地改版本。后续新需求创建新的 Candidate Goal，由用户分别决定是否接受新 Goal、是否确认 Rewire。

## Runtime 工作流

统一 GoalBoard Skill 被用户调用后，先解析可选 Session ID 与当前 workspace：同一 Session 已绑定时恢复连接；否则把该目录以前明确用过的项目作为候选，并在当前对话询问，即使只有一个候选也不自动连接。用户明确选择后才调用 `context-bind`；有 Session ID 时保存本 Session 选择，没有时只记录 workspace 历史并让当前 MCP 调用流继续。把项目设为目录默认是另一项明确决定，只有传入 `binding_scope=workspace_default` 后，新 Session 才自动恢复。新建、候选拒绝、切换、Session 解绑、workspace 解除关联和项目删除都有各自的确认。项目删除仍先保护有效 Claim 和未结束 Run。这个解析不会在 Runtime 启动或普通对话时后台发生。

Skill 的正常回复先用用户当前语言说明“我理解了什么、为什么还要确认这一点、接下来只问或做什么”，不会把 MCP 工具名和内部 ID 当作回答。新想法、已有 Draft 恢复和方向变化会显示可修改的结构化 checkpoint，明确区分用户已确认事实、可查项目事实、Runtime 假设和建议；每个实质回答先写入 dialogue turn，再继续下一问。提案就绪时用可读 Goal Tree 汇总结果、非目标、关系依赖、叶子验收、风险和确认后的状态，用户可以整份决定或点名修改条目。

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

对于新想法，Runtime 不必让用户先打开 Web 或逐字段填写 Contract：`draft-dialogue-start` 在一个事务中创建最小 `draft / abstract` Goal、clarifier Claim 和 Run，随后当前对话每产生一次实质澄清进展就调用 `draft-dialogue-turn` 保存用户回答、当前理解、来源事实、假设和唯一下一问；Session 中断后用 `draft-dialogue-resume` 恢复。澄清完成时，当前 Runtime 用 `goal-tree-propose` 一次提交整份可确认的拆分／变更方案，并可通过 `goal-tree-read`、`goal-tree-check` 跨 Session 恢复和检查；推断和建议在用户确认前都不是 canonical Goal、关系、Risk 或 Policy。用户随后仍在当前 Runtime 对话中逐项确认、拒绝或要求修改；用户明确回答后，Runtime 调用 `goal-tree-decide` 并传入 `user_confirmed=true`、确认摘要和具体决定，GoalBoard 再结合宿主 Session 元数据记录审计来源。这是本地对话来源记录，不伪装成密码学身份认证。已确认的安全条目才会物化，过期、悬空或循环条目会保持冲突，不影响其他已确认条目。

物化后不增加第二套“是否澄清完成”状态：确认的复合父 Goal 有子项时显示“已澄清，等待子 Goal”，确认的最小叶子显示“待执行”，仍是 Draft／开放拆分的分支才显示“待澄清”。

普通 Runtime 不能创建 canonical Goal、修改 accepted Contract、激活依赖或替用户决定 Candidate/Rewire。执行中发现的新工作只能提交 Candidate；发现依赖变化只能提交带方向、依据、证据、拒绝影响和置信度的 Dependency Proposal。

## MCP

GoalBoard 通过统一 Skill 连接项目：Runtime 可以提供 Session ID，宿主另行提供当前 workspace；Skill 调用 `goalboard_v1_context_resolve` 后才从 `~/.goalboard/projects/catalog.db` 解析 Session 选择、目录历史候选或显式默认项目。Runtime 不把目录、数据库路径或 `board_id` 当作用户要选择的项目身份。

### Runtime 工作入口绑定（推荐）

Runtime 宿主只在自己能保证稳定性的情况下提供 Session ID；它不是 Git 地址、目录名、仓库结构或模型从对话中推断的字符串。GoalBoard 支持任意 MCP Runtime 在每次 `tools/call` 的 `_meta.threadId`、`_meta.sessionId` 或 `_meta["goalboard/sessionId"]` 中提供 Session ID，也支持 Claude Code 等 adapter 的稳定环境信号；普通工具参数不会被当成宿主身份。同一个长驻 MCP 进程收到不同 Session ID 时会清掉前一个 Session 的连接。没有 Session ID 时，GoalBoard 仍可把 canonical workspace 用于查找历史候选，但绝不把目录或 MCP 进程伪装成 Session。一个 workspace 可关联多个 `project_id`；普通选择不自动设默认。

安装本身不会写入 Runtime 配置。上述五个 Runtime 应由用户在接入预览中确认后使用稳定 launcher；其他 Runtime host 可以显式提供同一组环境值：

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

> **Codex 与通用 Runtime 的回退**：Codex CLI/桌面的 stdio MCP 启动环境不会注入 `CODEX_THREAD_ID`，官方已将该需求标记为不计划修复（[openai/codex#19937](https://github.com/openai/codex/issues/19937)，NOT_PLANNED）。较新的 Codex app-server 调用路径可以在单次工具调用的 `_meta.threadId` 中带入 thread；GoalBoard 会在存在时使用它。没有 Session 信号时仍可用工作目录找到历史候选并让用户选择，但目录不充当 Session ID，新对话默认会再次询问。

- `bound`：返回唯一 `project_id`、`board_id` 和固定数据库连接；之后普通 GoalBoard MCP 调用只能使用该 `board_id`。
- `suggested`：新 Session 有 workspace 历史或其他宿主线索。结果只含候选项目和不泄露原始路径的通用原因，没有项目连接；当前 Runtime 必须在同一对话问用户是否关联。
- `unbound`：返回 `missing_stable_context` 或 `unknown_context` 以及 `ask_user_to_select_or_create`，不连接任何项目。
- 用户明确拒绝某个 `suggested` 候选时，Skill 调用 `goalboard_v1_context_reject_suggestion` 并传入 `user_confirmed=true`。它只在这个 Session 不再提示该候选，随后可返回另一个候选或显式的项目列表／新建路径；不会解绑、删除或影响其他 Session。
- 用户在当前对话明确选定已存在项目后，Skill 调用 `goalboard_v1_context_bind` 并传入 `user_confirmed=true`。普通选择只影响本 Session（若可识别）并记录 workspace 历史；只有用户另行明确要求以后自动进入时才传 `binding_scope=workspace_default`。同一 scope 从别的项目切换时还需 `rebind_confirmed=true`。
- 用户在当前对话明确要求新建一个命名项目后，Skill 调用 `goalboard_v1_context_create_and_bind` 并传入 `user_confirmed=true`、项目名称和幂等键。它只在 `~/.goalboard` 创建项目 DB 并绑定；失败不会留下孤儿项目。
- 用户要求查看项目时，Skill 调用 `goalboard_v1_context_list_projects`；它不暴露数据库路径，也不改变当前连接。
- 用户明确要求仅解绑当前工作入口时，Skill 调用 `goalboard_v1_context_unbind` 并传入 `user_confirmed=true`。它不删除项目、DB 或其他 Runtime 的绑定。
- 删除项目及其 DB 是另一项单独确认：用户明确点名项目并确认删除后，Skill 调用 `goalboard_v1_project_delete` 并传入 `delete_confirmed=true` 和幂等键。项目有有效 Claim 或未结束 Run 时会被拒绝；成功后返回删除收据，Runtime 不能继续使用旧连接。

Web 是可选查看和用户确认界面。GoalBoard 不会为解析关联而要求启动 Web；普通 Web 启动后先显示项目列表，用户选择的只是当前浏览项目。项目设置可管理已经确认过的 Session 关联和 workspace 的多个成员项目，并显式设置默认或解除关联；不会展示完整目录路径。项目创建、Runtime 配置和旧 DB 迁移也都先展示影响或要求单独确认。

Runtime audience 只暴露工作入口解析/显式绑定、读取、Available/原子选择/Run、Contract/Candidate/Dependency Proposal、Goal Tree Proposal/Decision、重新验证、Evidence、Runtime Review、完成检查和释放。`goal-tree-decide` 不是 Runtime 自己随意改树的权限：只有用户刚刚在当前对话明确决定后，Runtime 才能传 `user_confirmed=true`、确认摘要和具体决定；GoalBoard 结合宿主 Session 元数据生成审计引用。Runtime 不能通过普通工具参数伪造 Session 身份或覆盖已解析的项目连接。

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

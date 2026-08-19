# 安装与维护（GoalBoard）

> 详细安装、更新、启动、卸载与演示数据说明。快速上手见 [README](../README.md) 的「3 分钟体验」。

## 安装边界

`goalboard install` 只维护 `~/.goalboard`：版本化程序与共享 Skill、MCP/Web/CLI 启动入口、项目 DB 根目录、日志和安装清单。它不会创建或启动项目，不会写入用户项目，也不会修改任何 Runtime 的用户级配置。之后若要把 MCP 入口注册到某个 Runtime，必须走用户确认的 Runtime 集成流程。

从仓库本地安装请使用 `pnpm install:local`；这个唯一入口会先重新构建，再安装当前内容。直接对带 `src/` 的仓库执行 `goalboard install --source ...` 时，安装器会核对构建指纹，源码与 `dist` 不一致就停止，不会悄悄复制旧构建。release 同时记录内容摘要：版本相同但程序或 Skill 内容变化时会原子刷新，内容完全相同才返回“已经是最新状态”；刷新失败会恢复上一份 release，项目数据不参与替换。

项目使用不可变的 `project_id` 区分，显示名称可以改名或重名；每个项目都有自己的 `goalboard.db`。`projects/catalog.db` 保存项目身份、DB 位置、可选 Session 绑定、workspace 与多个项目的历史关联、用户显式设置的唯一默认项目，以及删除收据；不复制 Goal 事实，也不依赖 Git。普通项目选择不会自动成为目录默认项，新 Session 会拿到历史候选并询问；只有用户单独设置默认后才会自动恢复。解绑关联不删除项目；删除项目及其 DB 必须单独确认，并会拒绝仍有有效 Claim 或未结束 Run 的项目。

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

Runtime 会先只读检查 `goalboard service status`，不会直接拉起一个容易随 Session 消失的前台进程。macOS 上，未安装常驻服务时会先说明它将修改用户级 LaunchAgent、登录后自启且关闭终端后仍运行，得到明确确认后才安装；已停止时启动，已运行时只返回地址，旧配置则先说明修复内容再确认。服务命令会等到页面健康可访问后才报告成功。

如果只想当前终端临时使用，请明确说：

> 临时打开 GoalBoard

这会运行前台 `goalboard-web`；终端或 Runtime Session 关闭后页面也会停止。非 macOS 当前只支持这种前台方式，不会用 `nohup` 或普通后台 shell 冒充系统级常驻服务。

### 手动启动

```bash
# Web 只从 GoalBoard 自己的项目目录列出可浏览项目
"$HOME/.goalboard/bin/goalboard-web" --home "$HOME/.goalboard"
```

打开 `http://127.0.0.1:4173` 后，可以在设置中创建、导入、改名和打开项目，也可以先配置 Runtime 接入。选择一个项目只改变网页浏览位置，不会自动绑定或切换当前 Runtime Session；已有旧 DB 只有明确选择并确认后才会迁入项目。macOS 上也可从仓库运行 `pnpm desktop`，App 只是同一套页面的窗口壳。

直接运行 `goalboard-web` 仍是前台模式，适合临时调试；关闭终端会同时关闭页面。macOS 上可改用用户级 LaunchAgent 常驻服务，先预览再确认：

```bash
# 只预览，不写任何系统配置
"$HOME/.goalboard/bin/goalboard" service install --home "$HOME/.goalboard"

# 明确确认后安装并启动；登录自动启动，异常退出自动恢复
"$HOME/.goalboard/bin/goalboard" service install --home "$HOME/.goalboard" --confirm

"$HOME/.goalboard/bin/goalboard" service status --home "$HOME/.goalboard"
```

`stop` 只停止当前服务并保留登录启动；`remove` 才会停止并移除 GoalBoard 自己创建且未被改写的 LaunchAgent。日志位于 `~/.goalboard/logs/web-service.log` 和 `web-service.error.log`。非 macOS 会明确显示暂不支持，不会用普通后台 shell 假装安装成功。也可以在 Web 的“设置 → 诊断”中完成同样的预览和确认。

## 安全卸载

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

## 安装后的下一步

`goalboard install` 只完成 GoalBoard 本体安装，默认输出安装位置、CLI/MCP/Web 启动器和安全边界；自动化可以使用 `goalboard install --json`。安装不会顺带创建项目、关联 Session、启动服务或修改 Runtime 配置。

安装后的 Runtime 接入由同一领域服务完成。当前 adapter 会只读探测 Codex 和 Claude Code，并先生成包含配置路径、GoalBoard MCP entry、Skill 链接、备份位置和重启说明的预览；只有用户对当前 Runtime 和当前 plan 明确确认后才会写入。MCP 与 Skill 作为一个事务验证，失败会恢复原配置字节和原 Skill 状态。移除时只撤销 GoalBoard ownership receipt 记录且仍未被用户改写的内容。未知同名配置或 Skill 会显示冲突，不会被覆盖。

接入确认完成后，**必须新开 Codex / Claude Code Session**才会生效：Runtime 只在 Session 启动时读取 MCP 与 Skill 清单，当前对话不会动态出现刚写入的工具。新 Session 可直接复制「继续用 GoalBoard」续接；GoalBoard 会展示当前目录以前使用过的项目并请你确认。若希望以后自动进入某个项目，需要另外明确把它设为目录默认。接入预览界面会逐条展示改动内容和这段续接说明。

项目创建和当前 Session 关联是独立操作：用户在当前 Runtime 调用统一 Skill 后，Skill 使用 `context-list-projects`、`context-bind` 或 `context-create-and-bind`，并且只在用户明确选择后写入 GoalBoard 自己的数据目录。Web 可创建、导入、改名和打开项目，也可管理已经确认过的 Session 与 workspace 关联；网页中的项目选择本身不会改变 Runtime 连接，新 Session 默认仍要先询问，除非用户明确设置了目录默认项目。

Web 只监听 loopback 地址。每次启动都会生成只存在于本机页面中的随机控制令牌；所有 Web API 写请求还必须通过同源 Origin、控制令牌和一次性操作键校验。非本机 Host、第三方页面盲发、缺少凭据或重复请求都会在进入项目 catalog、Runtime 配置服务或 Goal Coordinator 前被拒绝。这个浏览器门禁不替代各领域流程原有的用户确认和幂等规则。

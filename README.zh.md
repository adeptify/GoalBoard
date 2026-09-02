# GoalBoard

[English](README.md) | **简体中文**

GoalBoard 是不同 AI Runtime 共用的 Goal 账本和工作台。

长程任务常见的失败很具体：新 Session 看不到上一轮，原目标被局部决定改掉，“完成了”只是一句话、没法核对。缺的不是更聪明的模型，而是一份所有 Runtime 都能对着记账的项目事实：已确认的 Goal、怎么拆的、卡在哪、谁在做、凭什么算完成。

GoalBoard 把这份记录放在本地。Codex、Claude Code、OpenCode 或其他已接入的 Harness，读写的是同一份 Goal。重大变化由你确认。不用追问模型，也能看到事情推进到哪里。

它不捆绑模型，也不调度 Agent 团队。执行仍在你正在用的 Harness 里。

更完整的推导见公众号文章（链接待发布）：*[placeholder — 公众号文章待发布]*。草稿：[从对话态事实到账本态事实](https://github.com/adeptify/article/blob/main/AI%E9%95%BF%E7%A8%8B%E4%BB%BB%E5%8A%A1-%E4%BB%8E%E5%AF%B9%E8%AF%9D%E6%80%81%E4%BA%8B%E5%AE%9E%E5%88%B0%E8%B4%A6%E6%9C%AC%E6%80%81%E4%BA%8B%E5%AE%9E.md)。

## 三种使用方式

同一份项目，三种界面。

### 桌面端

独立的 macOS 窗口：聚焦一条 Goal，再打开始终属于它的终端。GoalBoard 还有一个可点击的 **macOS 顶部菜单栏状态图标**。点一下就能看到当前项目、聚焦的 Goal、状态和下一步。

<p align="center">
  <img src="docs/screenshots/showcase/desktop-focus-zh-dark.jpg" width="32%" alt="GoalBoard 桌面端：在 Goal 导航旁聚焦一条 Goal">
  <img src="docs/screenshots/showcase/harness-runtime-zh-dark.jpg" width="32%" alt="GoalBoard：绑定到当前 Goal 的终端">
  <img src="docs/screenshots/showcase/macos-menu-bar-capsule-zh-dark.jpg" width="32%" alt="从 macOS 状态栏图标打开的 GoalBoard 工作胶囊">
</p>

<p align="center">
  <sub><b>Goal 查看</b> · 这条 Goal 是什么、下一步、卡在哪 &nbsp;·&nbsp; <b>Goal 绑定 TUI</b> · 终端属于这条 Goal &nbsp;·&nbsp; <b>工作胶囊</b> · 从 macOS 状态栏快速查看</sub>
</p>

### Harness 里

把 GoalBoard 放在 Harness 的侧边浏览器里，对话继续在同一个窗口里进行。窄：Goal 列表。宽：当前 Goal 和它的 TUI。

<p align="center">
  <a href="docs/screenshots/showcase/harness-narrow-zh-dark.jpg"><img src="docs/screenshots/showcase/harness-narrow-zh-dark.jpg" width="32%" alt="Harness 侧栏：Goal 列表"></a>
  <a href="docs/screenshots/showcase/harness-runtime-zh-dark.jpg"><img src="docs/screenshots/showcase/harness-runtime-zh-dark.jpg" width="65%" alt="Harness 侧栏：当前 Goal 与绑定 TUI"></a>
</p>

<p align="center">
  <sub><b>窄版</b> · 对话旁边的 Goal 列表 &nbsp;·&nbsp; <b>宽版</b> · 当前 Goal 和绑定到它的 TUI</sub>
</p>

### Web

同一份本地项目也可以在浏览器里打开。Web 和桌面端共用 `~/.goalboard` 里的数据。

![GoalBoard Web：Goal Tree 与 Goal 聚焦](docs/screenshots/showcase/web-workspace-zh-dark.jpg)

内置启动配方覆盖 Codex、Claude Code、OpenCode、Pi Agent、Grok Build。其他 Harness 可以通过 GoalBoard 的 MCP 和共享 Skill 读写同一项目。

## 核心功能

每项都用大白话说：怎么用，解决什么问题。

### 看清目标、下一步，以及为什么还完不成

点开一条 Goal。不翻聊天记录，也应能回答三件事：要得到什么、现在做什么、为什么还不能完成。上层 Goal 只负责组织结果；真正能执行的是具体的叶子 Goal。

### 看清谁依赖谁

列表不够用的时候看关系图。父子是结构；依赖是硬门禁：B 要用 A 的结果，B 就不能提前开工。需求变了，能看见下游哪些工作受影响，而不用把整棵树重新讲一遍。

### 改题要你点头

Runtime 可能发现新工作、新依赖或风险。它可以提案，但不能悄悄改已经确认的 Goal。决定中心把问题、为什么现在要决定、依据或缺口、每个选择会改什么放在同一页。

### 终端跟着 Goal 走

从一条可执行的叶子 Goal 打开 Codex、Claude Code 或自定义命令。这个终端一直属于这条 Goal — 后来再点别的 Goal，不会把它偷偷改绑走。上层 Goal 不会假装自己能执行，而是让你进到具体的子 Goal。

macOS 上，当前这条 Goal 也在 **屏幕顶部菜单栏**。点 GoalBoard 的状态栏图标，可以看到项目、聚焦的 Goal、状态和下一步；点别处，面板就收起来。

### “完成了”得能核对

完成不是对话里的一句话。每条 Goal 有完成标准，证据对上这些标准，该做的复核也要通过。记录里能看到谁做的、产出了什么、为什么算完成。

干活时冒出来的新事实 — 完成依据、风险、影响范围、Goal 关系 — 用 **快速记录** 贴到当前这条 Goal 上，而不是留在聊天里消失。

### 告诉 Runtime 这个项目该怎么拆

规划方法不是任务模板，也不会自动长出一棵树。它是 Runtime 在提出拆分之前必须想清楚的问题：要覆盖什么、谁依赖谁、完成时必须看见什么。一个项目可以同时用工作类型方法和领域方法。结果仍然是提案，要你确认。

### 接入 Runtime 是一次明确操作

不接 Runtime，GoalBoard 也可以当看板用。只有当你希望 Codex、Claude Code 等直接读取和推进 Goal 时，才去接入。每次写入都先预览，你确认后才改配置；失败会回滚。接入之后要 **新开一个 Session** — 工具只在 Session 启动时加载。

## 3 分钟体验

### macOS Desktop（推荐）

从 [GitHub Releases](https://github.com/adeptify/GoalBoard/releases) 下载与你的 Mac 匹配的 DMG：

- Apple Silicon（M1/M2/M3/M4…）：`macos-arm64`
- Intel Mac：`macos-x64`

打开 DMG，把 GoalBoard 拖入 Applications 后直接启动。Desktop 已内置 Node 与 GoalBoard Runtime；首次打开会把 Core 安装到 `~/.goalboard` 并启动同一套本地工作台，不要求先安装 Node、pnpm 或克隆仓库。升级 App 不会改写已有项目和历史。

未使用 Developer ID 签名和 Apple 公证的开发构建仍会触发 Gatekeeper，需要在“系统设置 → 隐私与安全性”中明确允许；正式发布流水线配置证书后会生成签名并公证的同名产物。

### 从源码体验

需要 Node.js 20+、pnpm，以及 macOS（常驻 Web 服务目前使用 LaunchAgent；其他系统可以前台启动 Web）。

```bash
git clone https://github.com/adeptify/goalboard.git
cd goalboard
pnpm install --frozen-lockfile

# 构建并安装到 ~/.goalboard
pnpm install:local

# macOS：安装常驻 Web 服务
"$HOME/.goalboard/bin/goalboard" service install --home "$HOME/.goalboard" --confirm

# 创建与用户数据分开的可重建示例
"$HOME/.goalboard/bin/goalboard" demo create --confirm
```

打开 `http://127.0.0.1:4173`，进入示例项目。然后在“设置 → Runtime”中预览并确认所需接入，再**新开一个 Runtime Session**：

> 使用 GoalBoard 连接示例项目，选择一个当前可执行的 Goal，并告诉我目标、下一步和完成要求。

Runtime 只在 Session 启动时读取 MCP 和 Skill，因此刚完成接入后需要新开 Session。

### 构建、安装和启动 macOS Desktop

```bash
# 开发态源码运行
pnpm desktop

# 构建当前架构的 DMG 与 App zip
pnpm desktop:build:macos

# 安装刚构建的 DMG 到 ~/Applications 并启动
pnpm desktop:install:macos

# 以后直接启动已安装 App
pnpm desktop:start:macos
```

每个架构单独打包，是因为 GoalBoard 的 SQLite 与 PTY native addon 必须和 Node、Mac CPU 架构一致。向 `v*` tag 推送后，GitHub Actions 会分别构建 Apple Silicon 与 Intel DMG；只有签名和公证成功才会发布公开 Release，凭据只从 GitHub Secrets 读取，不进入仓库。

## 产品边界

- 项目的权威状态保存在本地 SQLite；GoalBoard 不捆绑模型。
- 打开页面不会自动绑定 Session、启动 Runtime 或领取工作。
- Runtime 接入、终端启动和正式 Goal 变化都需要明确操作或确认。
- GoalBoard 管理 Goal 事实与执行闭环，不替代 Harness 或 Agent Orchestration。

## 更多文档

- [架构 SSOT 与迁移归属](docs/SSOT-MATRIX.md)
- [安装与维护](docs/installation.md)
- [运行时协议](docs/runtime.md)
- [MCP 接入](docs/mcp.md)
- [CLI 与开发](docs/cli-and-development.md)
- [Runtime Skill](skills/goal-advance/SKILL.md)
- [GoalBoard Bug 卡台账](docs/goalboard-bug-cards.md)

## License

MIT，见 [LICENSE](LICENSE)。

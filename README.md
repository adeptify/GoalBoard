# GoalBoard

**中文** | [English](README.en.md)

## 让长程 Goal 跨 Session、跨 Runtime，仍然目标明确、拆分清楚、进度可核对

### 长程任务为什么容易失控

- 任务跑着跑着偏离原目标，往往到交付前才被发现。
- 换 Runtime 或新开 Session 后，目标、进展和未完成工作需要重新解释。
- 复杂 Goal 被拆成多条执行线后，依赖、占用和阻塞很快失去全貌。
- “已完成”停留在对话结论里，缺少可以核对的依据。
- 人只能等待 Runtime 汇报，无法随时判断正在做什么、为什么停住、还差什么。

### 核心思路

GoalBoard 是一份跨 Session、跨 Runtime 的 Goal 账本，也是一套本地执行工作台。它把目标结果、拆分、依赖、决定、进展和完成依据留在同一份可追溯事实中；Runtime 可以更换，Goal 不随对话消失。人确认正式目标和变化，Runtime 自主选择可执行工作，并把占用、进展和证据写回同一个项目。

### 一套事实，三个工作面

**聚焦**：选中一条 Goal，就看到目标、下一步、完成要求与当前阻塞。

![GoalBoard Desktop：在 Goal Navigator 旁聚焦查看一条 Goal](docs/screenshots/showcase/desktop-workstation-dark.jpg)

**关系图**：在项目层查看父子与依赖网络；圆点是起点，箭头指向终点。

![Goal Graph：项目级父子与依赖网络](docs/screenshots/showcase/goal-graph-dark.jpg)

**Runtime**：从具体 Goal 打开终端，Session 始终与这条 Goal 关联。

![Goal-bound Runtime：在同一桌面工作站内执行当前 Goal](docs/screenshots/showcase/desktop-runtime-dark.jpg)

### Goal 层，不是 Agent Orchestration

GoalBoard 不负责调度一群 Agent，也不替代 Codex、Claude Code 或其他 Harness。

| | 负责什么 |
| --- | --- |
| **GoalBoard** | 明确要得到什么、如何拆分、依赖什么、当前做到哪一步，以及凭什么算完成。 |
| **Agent Orchestration** | 决定哪些 Agent 参与、如何分工、通信和执行。 |

两者可以组合：复杂 Goal 先在 GoalBoard 中形成清楚的结果、子 Goal 和依赖，再交给合适的 Runtime 或 Agent team 执行；不同执行入口继续把进展和证据写回同一份 Goal 事实。

## 从 Goal 到完成的闭环

1. **定义**：写清结果、边界和完成标准，避免执行中偷偷改题。
2. **拆分**：用 Goal Tree 管理层级，用 Graph 看清复杂依赖和阻塞传播。
3. **选择**：Runtime 读取可执行 Goal，自主领取；前置条件不满足时不能提前开始。
4. **执行**：在现有 Harness 中继续工作，或从具体 Goal 打开与它绑定的 Runtime TUI。
5. **核验**：进展、证据和复核写回 Goal；“完成”不只是一句对话总结。
6. **演进**：新工作、依赖调整和风险先成为提案，说明原因与影响，经用户确认后进入正式 Goal Tree。

这套闭环让长程任务保持稳定，但不僵化：已确认的 Goal 不会被 Runtime 静默改写；执行中发现的新事实也有明确入口进入项目。

## 三种使用方式

| 使用方式 | 适合的工作方式 |
| --- | --- |
| **Desktop 工作站** | 把 GoalBoard 作为主工作台，在一个窗口内对照 Goal、关系和 Runtime；全局控制位于原生 TitleBar。 |
| **Harness 同屏** | 把窄版 Desktop 放在 Codex 等桌面 Harness 旁边；对话继续执行，GoalBoard 持续显示同一个 Goal 的下一步、阻塞和完成要求。 |
| **Web 工作台** | 不安装桌面 GUI，直接在浏览器查看同一项目；与 Desktop 共用本地数据。 |

### 在 Codex 内完成同一条闭环

主 Session 管理整棵 Goal Tree：确认目标、调整依赖、判断新需求影响哪些工作。Codex 内置侧边浏览器持续打开同一项目；选中可执行叶子 Goal 后，可以直接选择 Runtime，在与该 Goal 绑定的 TUI 中推进，不必切换窗口。

**窄侧栏：Goal 列表、当前 Goal 与绑定 Runtime**

<p align="center">
  <a href="docs/screenshots/showcase/codex-internal-goals-en.png"><img src="docs/screenshots/showcase/codex-internal-goals-en.png" width="32%" alt="Codex 内部侧栏中的 Goal 列表"></a>
  <a href="docs/screenshots/showcase/codex-internal-focus-en.png"><img src="docs/screenshots/showcase/codex-internal-focus-en.png" width="32%" alt="Codex 内部侧栏中的 Goal Focus"></a>
  <a href="docs/screenshots/showcase/codex-internal-runtime-en.png"><img src="docs/screenshots/showcase/codex-internal-runtime-en.png" width="32%" alt="Codex 内部侧栏中与 Goal 绑定的 Runtime"></a>
</p>

**从选择 Runtime 到进入 Goal 绑定 TUI**

<p align="center">
  <a href="docs/screenshots/showcase/codex-internal-runtime-picker-en.png"><img src="docs/screenshots/showcase/codex-internal-runtime-picker-en.png" width="31%" alt="为当前 Goal 选择 Runtime"></a>
  <a href="docs/screenshots/showcase/codex-internal-focus-main-en.png"><img src="docs/screenshots/showcase/codex-internal-focus-main-en.png" width="65%" alt="主 Session 与 Goal Focus 同屏"></a>
</p>

**展开侧栏：Goal Navigator 与当前工作并排**

<p align="center">
  <a href="docs/screenshots/showcase/codex-internal-navigator-focus-en.png"><img src="docs/screenshots/showcase/codex-internal-navigator-focus-en.png" width="49%" alt="Codex 内部的 Goal Navigator 与 Goal Focus"></a>
  <a href="docs/screenshots/showcase/codex-internal-navigator-runtime-en.png"><img src="docs/screenshots/showcase/codex-internal-navigator-runtime-en.png" width="49%" alt="Codex 内部的 Goal Navigator 与 Goal Runtime"></a>
</p>

所有入口读写同一份 Goal 事实：主 Session 负责规划和复核，叶子 Goal 的 TUI 负责执行，进展与证据再回到 GoalBoard。

### 也可以把 GoalBoard 作为 Desktop 工作站

窄窗口不是压缩后的三栏：可以在 `Goals`、`Focus` 和 `Runtime` 三个状态间切换，适合长期停靠在 Harness 旁边。

<p align="center">
  <img src="docs/screenshots/showcase/companion-goals-dark.jpg" width="31%" alt="GoalBoard Desktop 窄屏 Goals 视图">
  <img src="docs/screenshots/showcase/companion-focus-dark.jpg" width="31%" alt="GoalBoard Desktop 窄屏 Focus 视图">
  <img src="docs/screenshots/showcase/companion-runtime-dark.jpg" width="31%" alt="GoalBoard Desktop 窄屏 Runtime 视图">
</p>

具有 CLI/TUI 的 Runtime 可以直接从可执行叶子 Goal 打开。终端从哪个 Goal 启动，就持续属于哪个 Goal；复合父 Goal 只负责组织结果，不直接启动执行终端。

![GoalBoard Web：浏览器中的 Goal Tree 与 Goal Focus](docs/screenshots/showcase/web-workspace-light.jpg)

当前内置启动配方覆盖 Codex、Claude Code、OpenCode、Pi Agent、Grok Build，也支持自定义命令。其他桌面 Harness 可以通过 GoalBoard 的 MCP 与共享 Skill 读取和更新同一项目。

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

- [安装与维护](docs/installation.md)
- [运行时协议](docs/runtime.md)
- [MCP 接入](docs/mcp.md)
- [CLI 与开发](docs/cli-and-development.md)
- [Runtime Skill](skills/goal-advance/SKILL.md)

## License

MIT，见 [LICENSE](LICENSE)。

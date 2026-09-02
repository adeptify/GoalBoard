# Desktop App 与 Tauri 边界

状态：AP4 已迁入；DV4 继续负责安装、签名和最终发布验证  
公开 package：`@adeptify/goalboard-app-desktop`

## 1. 大白话说明

Desktop 是 GoalBoard 在 macOS 上的“外壳和控制台”。它负责开窗口、启动本地 Runtime、管理终端面板、显示菜单栏 Capsule，并在本地服务暂时不可用时恢复连接。它不判断 Goal 是否完成、不保存 Project 正式事实，也不复制 Feed、Session 或其他 Module 的业务规则。

例如，用户从一个 Goal 打开 Codex 面板时：

1. Desktop 根据 Runtime 类型生成启动命令和环境变量。
2. Desktop Panel Service 检查用户确认、工作目录和面板生命周期。
3. Project/Context port 只负责确认 Project 存在并记录关联；Desktop 不直接读取 Projects Store。
4. Tauri Adapter 启动 PTY、控制窗口，把输出交还给现有 Workbench 页面。

## 2. 代码各管什么

| 路径 | 职责 | 不负责 |
| --- | --- | --- |
| `apps/desktop/src/launch.ts` | Runtime 启动配方与面板环境变量 | 启动进程、保存 Session |
| `apps/desktop/src/advance-prompt.ts` | 当前 Goal 的推进提示，复用 Feed Plugin 的外部内容脱敏 | 解释或保存 Feed 数据 |
| `apps/desktop/src/shell.ts` | 识别原生 Desktop 请求并保持本地链接的 `desktop=1` 上下文 | 页面业务渲染 |
| `apps/desktop/src/panels.ts` | 面板打开、关闭、状态、别名和用户确认规则 | SQLite、Project 事实、PTY |
| `apps/desktop/src/capsule-shell.ts` | Capsule 的 HTML、CSS、浏览器脚本和壳层交互 | Goal/Run 状态组合 |
| `apps/desktop/adapters/tauri/` | 窗口、菜单栏、PTY、本地 Web 服务启动与恢复 | Module 业务规则 |
| `src/projects/desktop-panel-adapter.ts` | 迁移期的 Desktop Panel SQLite Repository | 面板业务判断 |
| `desktop/src-tauri/` | Cargo/Tauri 配置、权限和打包资源 | Desktop 业务源码 |

`src/desktop/launch.ts`、`src/desktop/advance-prompt.ts` 与 `src/web/desktop-shell.ts` 只保留旧 import 的转发；新 caller 必须使用 `@adeptify/goalboard-app-desktop`。

## 3. 与其他边界怎样合作

- Projects Module 只拥有 Project 身份和正式事实；Desktop Panel 是 App control state，不进入 Projects Module。
- Private Work Context 后续拥有 Session 和 Runtime workspace 关联；Desktop 只保存面板到稳定 work context 的别名。
- Runtime Host 后续拥有通用 Runtime stream、重连和中断；当前 Tauri PTY 是本地 Desktop adapter。
- Workbench 提供共享页面壳；Desktop Capsule presentation 由 Desktop App 提供，旧 Web 文件只组合 read model 并调用它。
- Feed Native Plugin 拥有外部内容脱敏规则；Desktop 推进提示直接调用其公开 API，不复制一份规则。

## 4. 当前真实能力

AP4 保持并迁移了以下既有能力：

- Desktop 启动、关闭隐藏、窗口恢复和本地服务重连。
- Codex、Claude Code、OpenCode、Pi、Grok 与自定义命令的启动配方。
- 面板打开/退出/重开/关闭、Session alias、Project 关联和 PTY 生命周期。
- 菜单栏状态、Capsule 定位/显示、项目切换、主题与中英文 locale。
- 内置 GoalBoard Runtime 的版本比较、升级安装与 owned service 配置修复。
- Tauri command 的显式 permission allowlist。

当前产品没有系统级通知实现：界面中的通知按钮原本就是“暂不可用”的禁用占位。Desktop 也没有独立 Keychain adapter；Feed 的现有 credential backend 仍由它自己的 Host 接线管理。AP4 不把不存在的功能伪装成已迁入。将来实现系统通知、Keychain 或 App 自更新时，应作为 `apps/desktop/adapters/tauri/` 的受控 adapter 接入，但权限策略和业务判断仍由调用它的正式 owner 决定。

## 5. 兼容与退出条件

AP4 已把真实 caller 切到公开 Desktop package，并移出 Project Catalog 的面板规则、`src/web/capsule.ts` 的 Capsule presentation 和原 1,473 行 Tauri `main.rs` 的混合实现。剩余兼容面是：

- `GoalBoardProjectCatalog` 的旧 Desktop Panel 方法仅转发到 `DesktopPanelService`，供旧公开调用和回归测试使用；最终 Cutover 删除。
- `src/web/capsule.ts` 只保留状态 read model、现有翻译/主题注入和调用公开 renderer；它不再拥有 Capsule CSS/JS/HTML。
- `desktop/src-tauri/` 继续保存发布配置和资源路径；DV4 负责 DMG、签名、公证、SBOM、干净安装/升级/卸载。
- PTY 的跨产品 Runtime 抽象由 WK2 继续迁入 Runtime Host；AP4 不提前吸收该职责。

完整验收证据见 [`ap4-validation.md`](../../specs/goalboard-architecture-reorganization/ap4-validation.md)。

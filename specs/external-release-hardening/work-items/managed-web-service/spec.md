# macOS 用户级 Web 常驻服务

## 目标

Web 不再依赖某个终端或 Codex Session 活着；用户明确启用后，它在 macOS 登录时启动、异常
退出后恢复，并能从 UI/CLI 查看和移除。

当前实机证据：LaunchAgent 默认 `PATH` 不包含 NVM 的 Node，`#!/usr/bin/env node` 启动器会以
127 退出；`launchctl print` 对崩溃重试中的任务仍返回成功，不能据此宣称 Web 正在运行；
`bootout` 后立即 `bootstrap` 会短暂返回 37，需要只对这个“操作仍在进行”状态做有限重试。

## 范围

- 建立 service provider 接口，首版实现 macOS LaunchAgent。
- plist 只执行 `~/.goalboard/bin/goalboard-web --home ~/.goalboard`，使用稳定 launcher；日志写入
  `~/.goalboard/logs`，监听仍限制 loopback。服务环境显式包含安装时 Node 所在目录，不能依赖
  交互式 shell 的 PATH。
- UI/CLI 提供 detect、preview、confirm install/start/stop/restart/remove 和 status。
- 未确认不写 `~/Library/LaunchAgents`；写入前展示路径、label、命令、日志和恢复行为。
- owned receipt/hash 防止覆盖或删除用户修改的同名服务。
- 状态检测区分“LaunchAgent 已加载”和“Web 进程正在运行”；owned 旧配置可预览修复，修复失败
  恢复原配置。
- 非 macOS 返回明确 unsupported；不使用 nohup 或后台 shell 伪装常驻。

## 验收

- 关闭启动它的终端和 Codex Session 后 Web 仍可访问。
- 进程异常退出会恢复；用户登录/电脑重启后自动启动。
- 重复安装幂等，冲突不覆盖，remove 只删除 owned 配置。
- 崩溃重试中的 LaunchAgent 不显示为运行；服务配置升级后能加载新环境，失败时不丢失旧配置。
- stop 与 remove 语义不同；日志和失败原因可从诊断页看到。

## 修改边界与验证

- 新 service 模块、CLI、Web 设置/诊断、安装 manifest/receipt 和相应测试。

```bash
node --import tsx --test tests/service.test.ts tests/web.test.ts tests/install.test.ts
pnpm typecheck
```

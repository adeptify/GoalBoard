# 信息流工作台内部完整验收

验收日期：2026-08-30
完成等级：4 · 内部完整
验收项目：GoalBoard 信息流工作台重设计
验收范围：Goal、Inbox、Feed、来源与连接、Item 动作、Runtime/TUI、Relay 独立性与安全边界。

## AC1 · 分层自动化校验

- `pnpm typecheck`：通过。
- `node --import tsx --test tests/feed.test.ts tests/feed-sources.test.ts tests/feed-connectors.test.ts tests/feed-security.test.ts tests/web.test.ts tests/desktop-tui.test.ts`：通过。
- `pnpm build`：通过。
- `pnpm test`：295/295 通过；包含安装、打包、Web/Desktop、Goal 生命周期、Feed/Inbox、来源、Connector、加密、PTY 与 E2E。共享写入结束后的独立复跑无失败。
- `git diff --check`：通过。

本轮新增 `Inbox Message save and start survives a Web restart without duplicating its Goal`，单独证明 Inbox Message 可先保存，再进入处理；Web 重启后仍复用同一个 Draft Goal、同一个 confirmed input binding 和原 Material。Feed 路径由 `Feed start reuses one Draft Goal across repeat clicks and a Web restart` 独立覆盖。

## AC2 · 四类目录与视觉矩阵

真实项目中复核了四类目录和长内容详情；所有目标尺寸均满足 `document.scrollWidth === innerWidth`，没有页面级横向溢出。Item 行统一使用“类型/来源/阅读状态 → 标题 → 摘要 → 时间 → 处置状态”的基线，Goal 行继续使用同一密度、状态胶囊和右侧结果列。

### 1440×900 · 深色

- [Inbox 列表与长详情](../../.impeccable/review/internal-qa-inbox-list-dark-1440.png)
- [Feed 列表、已读状态与长详情](../../.impeccable/review/internal-qa-feed-dark-1440.png)
- [13 个真实来源与连接状态](../../.impeccable/review/internal-qa-sources-dark-1440.png)
- [Goal 直达 URL 覆盖上次 Inbox 状态](../../.impeccable/review/internal-qa-goal-direct-route-dark.png)

### 1180×760 · 浅色

- [Goal 列表与当前 Goal](../../.impeccable/review/internal-qa-goals-light-1180.png)
- [Inbox 列表与长详情](../../.impeccable/review/internal-qa-inbox-light-1180.png)
- [Feed 列表与详情](../../.impeccable/review/internal-qa-feed-light-1180.png)
- [来源与连接 Modal](../../.impeccable/review/internal-qa-sources-light-1180.png)

### 720×820 · 深色窄宽

- [Feed Item 列表、可见键盘焦点与截断](../../.impeccable/review/internal-qa-feed-list-dark-720.png)
- [Feed 详情与 2×2 动作](../../.impeccable/review/internal-qa-feed-dark-720.png)
- [来源与连接 Modal、内部滚动且无横向溢出](../../.impeccable/review/internal-qa-sources-dark-720.png)

筛选空态使用真实 Feed 搜索复核：0 条时显示“没有符合当前条件的 Item”，清除筛选后恢复 152 条并保留原 Item。来源错误态在真实 TechCrunch 同步失败后显示“本次没有写成成功；可稍后安全重试”，旧 20 条 Item 未丢失，见 [失败但保留旧数据](../../.impeccable/review/internal-qa-source-sync-progress-light-1180.png)。慢响应期间的产品逻辑先显示“正在同步来源；失败时不会写成成功…”，终态后由服务端事实刷新；错误状态和按钮焦点均可见。

## AC3 · 真实旅程与重启对账

### 浏览器旅程

1. 真实项目从 Feed 目录打开 TechCrunch Item；列表和详情同时显示“已读”，刷新后保持。
2. Item 详情中的开始处理、升格 Goal、保存资料、忽略四个动作在桌面就近可见，在 720px 下排列为 2×2。
3. 隔离项目中执行 Feed → 开始处理 → Goal Runtime → `/bin/sh` Terminal；完整上下文进入输入区但未自动发送，见 [Runtime/TUI 终态](../../.impeccable/review/runtime-tui-autofill-final.jpg)。
4. Feed 与 Inbox 两条自动化旅程都在 Web 重启后再次执行 Start；均返回原 `goal_id`、`created=false`，binding 数为 1。
5. 从 Inbox/Feed 离开后直接打开 `/goals/:goal_id`，Session 中上次目录状态不会再覆盖明确 URL；页面稳定显示 Goals 目录和对应 Goal。`feed-start=1` 仍会进一步进入 Runtime。

### 真实项目数据库/界面对账

- UI：13 个来源；Feed 152 个未忽略 Item；Inbox 左栏 49 项由 43 个持久化 Inbox Item 加 6 个 GoalBoard 决定/结果组成。
- DB：`feed` 为 155 项（152 待处理、3 已忽略），其中 3 项已读；`inbox_message` 为 54 项（42 待处理、1 已保存、11 已归档）。
- DB：155 个 Material，155 个正文引用可用；13 个 Source 全部启用，2 个 Source 持有 credential ref；1 条 Relay ownership receipt。
- UI 与 DB 的差额来自明确的 GoalBoard 决定/处理结果虚拟 Inbox Entry，不是类型串流或数据丢失。

异常恢复由定向测试覆盖：revision conflict、暂停来源、完整失败不推进 cursor、Connector 中断、Gmail stale history、SecretStore key 不可用、content blob 损坏、Relay schema drift、归档 Item 恢复、Item/Goal 解绑和 Runtime 进程重连。

## AC4 · Relay 缺席与安全边界

- `tests/feed-security.test.ts` 在完成 ownership migration 后删除隔离 Relay DB、`secrets.json`、`secrets.key` 和 evidence 目录；GoalBoard 仍能读取迁入的 GitHub credential、Source、Item、Material 全文。
- 生产代码、`package.json`、lockfile 和 vendored SDK metadata 中没有 `/code/relay` 或其他 Relay 仓库绝对路径；active 来源运行只解析 GoalBoard 自己的 `vendor/` 制品。
- Secret 与 retained content 为 AES-256-GCM；Token 不进入 DB、HTML、API response、事件或测试日志。
- Item/TUI 上下文只有一对显式 `UNTRUSTED_FEED_ITEM_DATA` 边界；Authorization、Cookie、Token、API key、client secret、password、私钥、JWT 和常见 Provider token 形态在进入 Terminal 前统一清理。
- 本轮没有向 GitHub、Gmail、RSS 站点或其他 Provider 写回点赞、评论、状态或内容。公开来源只做读取；失败没有伪装成成功。

## 人工门禁与边界

- 本轮没有重新走真实 GitHub Device Flow 或 Gmail OAuth 授权；真实项目中已连接账号、游标和历史同步结果仅做持久化复核。
- 没有删除 `/code/relay` 或 Relay 本机数据。只有用户另行明确授权，且迁移 receipt、账号状态和正文抽查继续通过后，才执行删除。
- 本验收不覆盖安装包、升级链路或外部用户发布，因此结论是“内部完整”，不是“可发布”。

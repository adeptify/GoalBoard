# UI Platform

## 1. 分工

- `apps/workbench`：产品 Shell、导航、页面装配和 Host Client。
- `packages/ui-host`：UI Contribution、Slot、Embed、隔离、权限桥接和生命周期。
- `packages/design-system`：token、基础组件、图标、可访问性、主题和视觉基线。
- Native/Integration Plugin UI：实际产品页面、Inspector、设置和嵌入内容。

Workbench 不直接访问 SQLite、Module implementation、Node-only API 或 Tauri command；用户操作转换为强类型 Capability 调用。

## 2. 嵌入

被插入内容的 Plugin 必须显式开放 Slot，声明接受的 Contribution Contract。贡献方声明自己提供的 view/command 与权限；UI Host 决定是否装载、放在哪里、何时销毁，并隔离错误和权限。

不允许：

- 直接传内部组件实例或 Store handle；
- 通过 Artifact 假装页面 RPC；
- Plugin 修改宿主导航/页面而没有 Slot Contract；
- 页面组合字段反写成新的中央事实。

## 3. 迁移

`src/web/render.ts` 按 Workbench Shell、Design System、UI Host 和 Native Plugin UI 拆分；`src/web/visual-foundation.ts` 迁入 Design System；`src/web/i18n.ts` 建立就近文案目录。AP3 建平台，FD4/AR3/EX4/WK3/AP4 搬各自产品 UI；Goals UI/文案由待用户确认的 GW5 Candidate 补齐。GW4 只完成 Goals 写入口切换，不代替这项 UI 迁移。

### AP3 当前实现

- `apps/workbench` 已拥有稳定 HTML 文档 Shell 和 `workbench.directory`、`workbench.main`、`workbench.overlay` 三个命名 Slot；旧 Web renderer 只提供尚未迁出的产品页面 body。
- `packages/ui-host` 在 mount 时校验 contribution、surface、目标 Slot 与 format；Plugin 不能向未声明或不兼容的 Slot 插入内容。
- Feed Native Plugin 已按 surface 显式声明可装载位置，Workbench 通过 UI Host mount，不直接调用 Plugin renderer。
- `packages/design-system` 已接管主题、密度、browser bootstrap 和分层视觉样式；`src/web/visual-foundation.ts` 只保留 15 行 public compatibility re-export。
- Workbench 浏览器 CSS/JS 按样式层和客户端职责拆分，旧静态内容保持逐字节兼容；全局 i18n runtime 已缩成语言选择/fallback 边界，现有 EN 产品文案暂存于 Workbench compatibility catalog，后续随各 Native Plugin UI Goal 就近迁出。
- AP3 只迁 Shell/UI 平台职责，不替 AR3、EX4、WK3、AP4 或待确认 GW5 搬产品页面。`src/web/render.ts` 当前仍承载这些后续 owner 的兼容 UI，因此不能标记为整体 retired。

### FD4 参考实现

- `packages/ui-host` 已有真实 Contribution registry 和 surface render，不再只是目录占位。
- `apps/workbench` 是 composition root，注册 `io.goalboard.native.feed.ui.v1`；它不读取 Feed Store。
- `plugins/native/feed` 声明 Feed 页面、Source 页面、overlays 和 detail Slot。Goal 决定仍由 Goals owner 生成，再通过 `detail_slot_html` 挂入 Feed 声明的详情位置。
- 当前 `src/web/feed-native-plugin-ui.ts` 只负责把旧 `GoalBoardWebView` 映射成公开 Feed UI model，并提供图标、i18n、安全链接和富文本等 Host primitives；后续 Local Host Query 接通后删除这层旧 View 适配。

# GoalBoard Desktop 单目录个人工作台改版

## 背景与当前证据

当前未提交实现仍是“应用栏 + 项目 Goal 目录 + Goal 内容”的三层结构。真实试用和后续高保真原型确认了它的问题：

- 应用栏和 Goal Tree 都在左侧承担导航，目录重复；
- 顶部项目、应用栏项目和 Goal Tree 项目上下文重复；
- 左侧搜索、分组标题、结构线和固定工具持续占空间，视觉噪声高；
- 主工作面没有项目级 Goal 标签，切换后难以保留多条正在查看的 Goal；
- 项目设置和全局设置入口、作用域与返回路径不统一；
- Goal 详情虽然已补充 Contract 信息，但仍需放进更稳定、更简约的工作台结构。

本 spec 取代上一版“三栏个人工作台”的布局结论。保留已经验证有价值的 Goal Tree、Goal 详情分块、现有真实设置表单和 Runtime 能力；替换重复目录、顶栏和线框表达；忽略 YouMind 的大留白、推荐首页和 AI 输入框。

## 完成等级

本轮目标为 **Level 3：Desktop 工作台核心 UI 功能可用**。

- Goal、决定中心、项目切换、项目设置、全局设置和 Runtime 继续使用真实数据与现有行为；
- Goal 标签按项目保存在当前设备，可打开、复用和关闭；
- Feed、Promotion、Cloud/Team 等尚无领域能力的入口只表达规划位置，不伪装成已接通功能；
- 普通浏览器 Web 和 760px 以下 Companion 不改信息架构。

## 用户结果

用户打开 GoalBoard Desktop 后只面对两个稳定区域：

1. **左侧唯一目录**：原生标题栏内直接选择项目和进入项目设置；标题栏下在工作台根目录、Goals、Goal Tree 或设置目录之间逐级切换；底部固定为本地身份和全局设置。
2. **右侧项目工作面**：顶部是当前项目保存的 Inbox / Goal / 设置标签，下面显示 Inbox 列表、一条 Goal 的完整详情、设置文档或现有 Runtime 工作面。

用户不再判断“该去应用栏还是 Goal Tree”。进入 Goals 后仍能使用原有父子 Goal Tree；返回上一级即可回到工作台根目录。

## 方向 Contract

```text
THESIS: 只有一个目录入口，项目中的多条 Goal 在右侧复用；拒绝重复侧栏、轻首页大留白和后台管理式线框。
OWN-WORLD: 石墨目录、深浅同源的柔和工作面、克制钴蓝焦点、系统字体、Lucide 图标、阴影与色面区分层级，尽量减少结构线。
STORY: 先选择项目和工作类型，再在 Goals 中展开真实 Goal Tree；打开的 Goal 作为项目标签留在右侧，详情首屏直接回答结果、原因、运转和下一步。
FIRST VIEWPORT: 约 310px 单目录与剩余标签工作面；项目切换在 macOS 标题栏红黄绿按钮右侧，账户和全局设置贴左下，Inbox / Goal 标签在右上，Goal 详情以柔和分块连续展开。
FORM: Operate 模式的 single-directory project-tab workbench，方向由 2026-08-29 用户确认的交互原型锁定（seed=goalboard-desktop-single-directory-project-tabs-2026-08-29）。
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
```

## 范围与行为

### 1. 左侧唯一目录

Desktop 宽屏只保留一个目录列：

- macOS Overlay 标题栏高 48px。红黄绿按钮占用左侧约 76px，项目选择器紧接其右侧并在原位打开项目下拉菜单；项目设置按钮紧邻项目选择器，不再另占一行；
- 项目下拉直接列出真实项目，当前项目有可读选中态，选择后进入该项目工作台；菜单同时保留“管理项目”入口。标题栏空白区域仍可拖动窗口，项目选择、设置、Goal 标签、关闭和新建按钮保持纯交互语义；
- 左侧目录从标题栏下方直接开始。普通模块行约 40px，目录标题约 40px，Goal 工具区约 30px；避免标题重复放大和无意义纵向空档；
- 根目录不显示“工作台”“注意力入口”等分组标题，也不显示常驻搜索框；
- 根目录依次提供 Inbox、Goals、Feed、Promotion、可视化工作区；Inbox 与当前 Goal 页面一样是右侧工作面入口，不再替换左栏目录；
- 点击 Inbox 打开或复用右侧 `Inbox` 标签，左栏保持根目录并显示 Inbox 当前态；Inbox 默认展示真实待决定事项列表，列表行通过图标和小型类型标签区分目标说明、新工作、Goal 关系、结果确认和风险。点击一行再展开现有真实处理表单；尚未接通的同步输入和升格流不伪装成数据；
- Goals 进入原有 Goal Tree，保留父子展开、状态筛选、新建、列表/关系视图、归档和回收站；这些工具在目录标题区或按需状态出现，不再占据一整块搜索工具栏；
- Goals 及其二、三级目录仍在左栏原位切换，并有“返回上一级”；Inbox 不进入左栏二级目录；
- 左栏主要依靠背景层次、轻阴影、hover 和 active 色面区分，不为每个 item 或区域画结构线；
- 根目录和 Goal Tree 使用 Codex 式紧凑列表：hover 与 active 只使用克制的中性色面，不使用粗蓝描边、悬浮位移或卡片式大阴影；返回箭头保持小尺寸，并用内收 focus ring 表达键盘焦点；
- 底部账户区始终贴底，显示本地身份；齿轮明确进入全局设置。

### 2. 项目级工作面标签

- 右侧顶部显示项目内已打开的 Inbox 与 Goal 标签；同一入口再次打开时复用，不生成重复标签；
- 标签列表使用项目 ID 隔离并保存在当前设备，切换项目后恢复该项目的标签；
- 关闭非当前标签只移除标签；关闭当前标签后选择相邻标签；至少保留当前可显示 Goal；
- 选择 Goal 继续复用现有异步文档载入、History、Goal-bound Runtime 和写操作，不复制领域状态；
- Inbox 当前使用 `/decisions` 作为真实数据路由，但用户界面统一命名为 `Inbox`；待决定处理仍写入原有 GoalBoard 领域状态，不创建第二份 Inbox 数据；
- 设置页在 Desktop 中也表现为可关闭的工作面标签，关闭或返回后回到项目 Goal；
- 窄屏继续使用现有 Goals / Focus / Runtime Companion，不强行显示桌面标签条。

### 3. Goal 详情

保留并打磨现有分块：

- 状态、标题、负责人、优先级和更新时间；
- 完成后会得到什么、为什么现在做、它会怎样运转；
- 概览 / 完成要求 / 进展与阻塞 / 关联与约束 / 记录；
- 下一步、完成要求和执行上下文必须在常见 1440×900 首屏内可读；
- Desktop 的“当前 / 上下文 / 进展 / 关系 / 记录”内容面板默认占满可用宽度和当前视口的剩余高度；同一 deck 的非活动面板必须叠在同一布局轨道并退出可见布局，不能因为隐藏面板各占一行而挤压当前内容。短内容使用安静的工作面承接剩余空间，且高度不能再被固定的桌面上限截断。760px 以下不强制最小高度；
- 完整记录中的执行表格必须使用主题色面与文字 token；Dark 模式的分组标题、正文和次级说明均保持可读，不允许浅色表头配浅灰文字；
- 使用柔和色面、留白和局部阴影形成层级，避免整页细线分割；
- 不删除任何已有 Goal 写操作、决定、证据、风险、影响范围或 Runtime 能力。

### 3.1 复合父 Goal 的 Runtime

- `closed_compound` 父 Goal 不允许直接打开 AI/Runtime 时，Runtime 面只显示父 Goal 说明和真实子 Goal 入口；
- 界面不显示“添加终端”、终端标签、推进/复制/填入按钮、空终端画布或 Runtime 打开菜单；为支持同页切换到叶子 Goal，必要结构可以保留在 DOM 中，但必须退出布局与可访问性树；
- 子 Goal 入口保留状态与下一步，点击后沿用现有 Goal 切换；没有子 Goal 时只显示拆分异常说明；
- 可执行叶子 Goal 的终端与 Runtime 行为保持不变。

### 4. 双层设置

- **项目设置**入口在项目选择器旁，只包含当前项目的“工作规则 / 工作规划”；保留真实保存、版本与规划方法行为；
- **全局设置**入口在左下账户区，只包含当前设备的“界面与语言 / AI 与执行工具 / 诊断”；
- 两类设置在入口位置、目录标题、右侧标签和页面说明中都明确作用域；
- 项目设置保存需要显式提交；全局外观偏好沿用现有即时保存行为；
- Desktop 设置页使用同一目录和工作面语言，普通 Web 设置页保持现有结构。
- Desktop 项目设置与全局设置沿用相同的 48px 原生标题栏安全带；左栏项目上下文从安全带下方开始，右侧顶部关闭/上下文栏保持在安全带同一行。

### 5. 保留、替换、忽略

**保留**

- 原有 Goal Tree 结构和真实状态；
- 原有 Goal Detail 分块及所有写操作；
- 项目/全局设置真实表单；
- Graph、Decision、Archive、Trash、Runtime、Light/Dark/System、中英文与 Companion。

**替换**

- Desktop 的双左栏/三层导航；
- 顶部重复项目面包屑；
- 常驻搜索区和大块工具栏；
- 大量 1px 分区线与后台式连续平面；
- “个人空间 / 工作台”重复文案。

**忽略**

- YouMind 推荐流、积分、技能、AI 首页输入框；
- 尚未定义实体和工作流的 Feed / Promotion / Cloud / Team 假数据；
- 本轮之外的 Server 同步、账号和团队权限实现。

## 模块与数据边界

### 输入

- `GoalBoardWebView`、当前项目、当前 Goal 和 route flags；
- 现有 Goal Tree、决定数量、设置页面数据；
- 现有 Session UI state 和项目 route prefix。

### 新增本地 UI 状态

- 当前左侧目录（root / goals / placeholder；Inbox 为右侧工作面，不持有左栏二级目录）；
- 每项目打开的 Goal tab ID 列表；
- 当前设置工作面返回目标。

这些状态只进入 `sessionStorage` 或 `localStorage`，不成为 GoalBoard SSOT，也不修改 SQLite。

### 允许修改

- `src/web/render.ts`
- `src/web/visual-foundation.ts`
- `src/web/i18n.ts`
- 相关 Web / Desktop / visual foundation 测试
- 实现验证后的 `DESIGN.md` 与 `.impeccable/surfaces/src-web-render-ts.md`

### 不允许修改

- `src/v1/` 领域、SQLite、Goal 生命周期；
- MCP、CLI、Runtime 绑定协议；
- PTY/WebSocket 数据行为；
- 普通 Web 的主信息架构。

## 交互与无障碍

- 左侧目录和右侧标签均可键盘操作；当前目录、当前 Goal 和当前设置具有可读状态；
- icon-only 按钮必须有具体名称，例如“打开全局设置”“打开当前项目设置”；
- 标签使用 `tablist / tab / tabpanel` 完整语义；关闭按钮不嵌套在 tab button 内；
- 状态不只依赖颜色；hover 之外也保留键盘 focus-visible；
- 动效只表达目录替换、hover 和标签变化，150–220ms，并尊重 reduced motion；
- 1180×760 与 1440×900 无横向页面溢出；760px 以下保持现有 Companion。

## 验收标准

1. Desktop 宽屏只出现一列左侧目录和一列右侧工作面，不再出现应用栏 + Goal Tree 双目录。
2. 根目录、Goals 和 Goal Tree 能在同一左栏逐级进入/返回；Goals 保留原有父子树与主要工具。点击 Inbox 时左栏保持根目录，右侧打开或复用 `Inbox` 标签。
3. 项目选择和项目设置位于 48px 原生标题栏内、红黄绿按钮右侧；项目选择器直接下拉列出真实项目。账户/全局设置贴左下且作用域文案清楚。
4. 打开两个不同 Goal 会生成两个可复用标签；重复打开不重复；刷新后按项目恢复。
5. Goal 详情、异步切换、写操作、Inbox 中的待决定处理和 Runtime 主行为无回归；Inbox 列表用真实类型图标/标签区分内容，展开后可完成现有决定流程。
6. 项目设置和全局设置在 Desktop 中视觉属于同一工作台，并显示正确目录和作用域；真实表单可继续保存。
7. Light / Dark 均依靠色面、阴影与 active 状态建立层级，左栏没有 item 分割线或大块边框。
8. 1440×900、1180×760 无横向溢出；760px 以下与普通 Web 保持既有结构。
9. macOS Desktop 的 traffic lights 不与项目选择器、项目设置或目录内容重叠；项目图标、名称、下拉箭头和设置按钮共用 `trafficLightPosition.y = 16px` 的垂直中心线，目标截图尺度下误差不超过 1px。项目控件位于同一 48px 标题栏并可正常点击，下拉菜单不触发窗口拖动，标题栏剩余空白区域仍可拖动窗口。
10. Dark 模式“完整记录 → 执行与检查”不出现浅色表头配浅灰文字；标题、标签、正文和次级信息均可清楚阅读。
11. Desktop 的当前、上下文、进展、关系和记录标签内容默认撑满可用宽度和剩余视口高度；活动 section 覆盖整个 stage，非活动 section 不额外占用 Grid 行；高窗口不受 `590px / 760px` 一类固定上限截断，短内容不再在卡片下方留下大片无归属空白，窄屏不被强制拉高。
12. 复合父 Goal 的 Runtime 可见界面只保留子 Goal 选择与必要说明，不显示添加终端、终端操作条、空终端画布和 Runtime 菜单；叶子 Goal 仍可正常打开终端。为支持同页切换回叶子 Goal，终端结构可以留在 DOM 中，但必须从布局和可访问树隐藏。

## 验证

- `pnpm typecheck`
- `node --import tsx --test tests/web.test.ts tests/desktop-tui.test.ts tests/visual-foundation.test.ts tests/i18n.test.ts`
- `cargo check --manifest-path desktop/src-tauri/Cargo.toml`
- 真实 Desktop 1440×900 与 1180×760：标题栏项目下拉、目录切换、Inbox 标签与类型列表、两条 Goal 标签、标签关闭/恢复、Light/Dark、项目设置、全局设置、Runtime；
- 真实 Desktop Goal Detail：依次切换上下文、进展、关系、记录，检查 active 内容宽度、最小高度、长内容自然增长、Dark 执行表格对比度；
- 复合父 Goal Runtime：只显示子 Goal 列表且无终端控件或空画布；叶子 Goal Runtime 回归添加终端与现有会话；
- macOS Desktop 真实窗口：用截图测量 traffic lights 与项目图标、名称、下拉箭头、设置按钮的垂直中心误差（≤1px），并检查项目下拉、项目设置点击、空白处拖动窗口；
- 普通 Web 与 720px Companion 回归；
- Impeccable 桌面/窄屏一轮截图审视，批量修复后最多一轮确认和终审。

## 假设与开放问题

- 本轮项目下拉只消费 `GoalBoardWebView.projects` 中的现有项目目录数据，不复制项目 SSOT；未来 Cloud/Team 可在同一项目选择工作流中扩展。
- `/decisions` 是 Inbox 当前真实内容来源；Feed、Promotion 和同步输入的实体与工作流仍需独立设计，本轮不写假数据。

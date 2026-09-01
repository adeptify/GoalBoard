# GoalBoard 北欧冬晨 Onboarding 原型 QA

## 结论

原型达到本阶段约定的 **Level 2：可交互高保真切片**。首次安装不再像功能介绍或配置向导，而是一段从黑夜到晨光的渐进对话：黑屏停顿后只出现“你好，我们今天做点什么？”和一个无边界填空位置；用户逐步说清项目、结果与工作环境，GoalBoard 才显露 TUI 和第一棵 Goal Tree。版本更新沿用同一套视觉语言，但使用独立的短路径，不会重放初装问题。

上一轮完整视觉世界通过了 Impeccable finish review。本轮是在其上完成的窄范围 polish：移除所有装饰线、替换 Hover 反馈并重做 Goal Tree；按 polish playbook 完成两轮内的浏览器检查。这个结论只适用于 Level 2 原型，不表示生产 Runtime 与数据链路已可用。

## 已走通路径

使用本机 Chrome 完整操作并截图检查：

1. 纯黑抵达页缓慢显出第一句问题；
2. 填写第一个项目与四周后的真实结果；
3. 选择已检测 Runtime；
4. 填写 Workspace；
5. 检查交接摘要和安全边界；
6. 打开新 TUI Session，确认提示词为“已填入、尚未发送”；
7. 主动发送后生成 Goal Tree Proposal；
8. 用户确认 Proposal 后进入冬日白色的激活完成态；
9. 使用 `?journey=update` 进入版本更新短路径。

结果：通过。浏览器没有捕获脚本异常或 console error；原型没有自动发送提示词、自动接受 Goal、自动修改代码或覆盖 Runtime 配置。

## 视觉与渐进动效

- 首屏保持 350–500ms 的黑场停顿，再用 900–1200ms 显露冷色冬晨环境光和正文；
- 页面没有中央卡片、功能清单、步骤导航、分隔线或蓝色科技线，第一视口只保留一句问题、一个由光标和柔光定位的填空位置、品牌和跳过入口；
- 每次回答都会成为低调的上文，同时环境光略微增强，但下一步仍只有一个视觉焦点；
- TUI 是流程中第一个明确色块，用深浅与内缩表达“现在进入真实工具”，不使用描边；
- Goal Tree 只在 Proposal 阶段显形；根 Goal、两个结果分支和第一条行动由字号、位置、明暗与依次生长的动效组成，不再绘制连接线或节点卡片；
- Runtime、主次操作、返回和 TUI 按钮的 Hover 改为柔光、轻微抬升、位移与亮度变化，不再使用下划线生长或描边变色；
- `prefers-reduced-motion: reduce` 实测命中：启动等待被取消，房间与环境光动画约为 `0.001ms`，标题直接可见，主路径仍可使用。
- 原型已随包提供 `fonts/Manrope-Variable.ttf` 和 `fonts/OFL.txt`；拉丁字形使用本地 Manrope，中文按 `PingFang SC` → `Noto Sans CJK SC` → `Microsoft YaHei` → `Source Han Sans SC` → 系统无衬线顺序回退。
- quiet、placeholder 和 terminal 辅助文字的对比度已提升，在保留次要层级的同时达到 reviewer 可 ship 基线。
- 滚动条已使用当前表面的 rule 色与透明 track 主题化，深色与成功态不会突然出现浏览器默认滚动槽。

结果：通过。

## 键盘、表单与辅助语义

- Runtime 选择使用 native `fieldset` / `legend` 与 radio，选择控件之后是独立的“继续”按钮；
- 已在真实 Chrome 中验证：标题获得焦点后，`Tab` 到当前 checked radio，再 `Tab` 到“继续”，按 `Enter` 成功进入下一步；
- 项目、结果与 Workspace 输入错误均通过 `aria-describedby` 关联对应的错误文本，校验失败时将 `aria-invalid` 设为 `true`。
- 在当前 in-app browser 中实测项目名和结果输入 `1`：页面停留在原步骤、`aria-invalid=true`，并提示不能只填数字或符号；有效中文输入可继续进入 Proposal。
- Proposal DOM 与截图确认使用 UTF-8，Manrope 已加载；用户文案统一为“目标树、根目标、结果分支、可执行行动”，不再显示 `canonical`、全大写 `GOAL` 或 `Goal和1` 一类内部术语与粘连文本。

结果：通过。

## 响应式与关键画面

### 桌面 1440×900

- 抵达、交接、TUI、Proposal、激活完成和版本更新均已截图检查；
- 页面宽度与 viewport 同为 1440px，无横向溢出；
- 首句在桌面保持单行，正文内容区宽 960px，仍有足够负空间；
- 所有关键状态均在单屏内可读，操作可达。
- 新 Goal Tree Proposal 的 document 与 viewport 同为 1440×900，确认操作无需滚动即可到达。

### 移动端 390×844

- 页面宽度与 viewport 同为 390px，无横向溢出；
- 首句自然折为两行，无边界填空和下一步操作保持清楚；
- 可见交互目标最小高度为 44px。
- Goal Tree Proposal 使用单列层级，页面高度 1159px，由正常纵向滚动承载；没有横向溢出或被遮挡的内容。

### 窄屏 720×900

- 页面宽度与 viewport 同为 720px，无横向溢出；
- 一次一问的结构、留白和低光环境均保留，没有退回卡片列表；
- 文本、输入和操作完整可见。

## 静态与机械检查

执行了内联 JavaScript 语法检查和限定文件的 diff 检查，结果通过。

Impeccable detector 在本机因为缺少 `htmlparser2`、`css-select`、`css-tree` 和 `domutils`，降级为正则扫描。扫描指出四项机械风险：选择项的 `padding` 过渡、两个 `width` 过渡，以及工作状态的无限扫描动画。已分别改为 `transform`、固定宽度配合 `scaleX`，并把无限循环改为一次性动画。按照 Impeccable 的单次扫描约束没有重复运行 detector，因此这里记录为“发现项已修复”，不把降级扫描表述为完整审计通过。

## 未完整验证

- 没有接真实 Runtime、PTY、数据库、文件选择器或 Goal 写入，符合 Level 2 非目标；
- 没有运行仓库生产 typecheck、build 或完整 test，本次只修改独立 Spec 与静态原型；
- 原型已在真实 Chrome 中通过 Runtime 关键键盘路径；未做完整屏幕阅读器走查，生产实现仍需重新验证整体 Tab 顺序与辅助技术体验；
- 动效节奏已经通过桌面、移动端和 Reduce Motion 截图与 DOM 数据检查，最终的情绪质感仍以人工观看为准。

## 本轮 refinement 边界

- **保留：** 北欧冬晨、一次只问一个问题、安全边界、TUI 交接和 Goal Tree 的真实层级；
- **替换：** 输入基线、进度线、列表分隔线、按钮下划线、终端描边和树连接线，改为留白、色块、柔光、明暗与空间层级；
- **重做：** Goal Tree 从机械 SVG 连线图改为无连线的 Goal Grove，先出现根结果，再展开两个结果分支，最后托起第一条行动；
- **忽略：** 旧截图中的机械连线和条目表格语法，不让它继续影响后续实现。

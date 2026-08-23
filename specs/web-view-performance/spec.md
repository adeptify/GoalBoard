# Web 项目与 Goal 切换性能修复

## 背景与目标

GoalBoard 已经按需加载单份 Goal 正文，但服务端的单 Goal 接口仍先构建整张 Board 的完整 Web View。大项目打开或切换 Goal 时，服务端会对每个 Goal 重复读取整张快照、重复执行完整可领取性检查；缓存又把 SQLite WAL 文件时间作为版本，数据库仅被打开和关闭也可能造成无效重建。

本次达到“内部完整”：不改变 Goal 状态、权限、数据结构或已有写入语义，让大项目首次打开和 Goal 连续切换保持轻量，并修复浏览器前进后退时 URL 与选中 Goal 不一致的问题。

## 当前行为与证据

- Footballnia：155 个 Goal、1018 条关系、2596 条事件。
- 单次 `store.snapshot` 约 0.10 秒。
- 对 155 个 Goal 逐个调用 `getGoalWorkState` 约 5.23 秒。
- 对 155 个 Goal 逐个调用 `explainGoal` 约 2.74 秒。
- `buildGoalBoardWebView` 约 8.63 秒，最终 HTML renderer 约 0.07 秒。
- 实际项目请求出现过 13.7–68.8 秒首字节等待。
- `/api/goals/:goal_id/document` 仍调用 `cachedGoalBoardWebView`；缓存键包含数据库和 WAL 的大小、修改时间。
- 服务端缓存优化后，Footballnia 单 Goal 接口已降到约 0.02–0.17 秒，但正文仍有约 0.35–1.33 MB；隐藏的“完整记录”和全部事件 payload 会在普通 Goal 切换时一并生成和解析。
- 从 `/goals/:id` 后退到项目根路径时，客户端没有恢复根历史项对应的 Goal，导致 URL 与页面内容不一致。

## 范围

- Web View 缓存只由 Board 的权威事件游标和影响展示的路由选项失效；不再通过 SQLite 文件时间猜测内容变化。
- Coordinator 提供一次快照内批量派生全部 Goal 工作状态的只读能力。
- Web View 构建不再为了读取 resolved policy 对每个 Goal 执行一次完整 `explainGoal`。
- Web View 构建与批量状态派生共享同一份 BoardSnapshot，避免一次页面读取混用两个时点的事实。
- 普通 Goal 正文不再预渲染“完整记录”；用户打开记录 Tab 时再按需读取同一份只读事实。
- 浏览器根历史项保存初始 Goal，前进后退始终保持 URL、Tree 选中项和正文一致。
- 为缓存稳定性、状态一致性和大 Board 构建路径补充回归测试。

## 非目标

- 不改变 Goal Contract、状态机、依赖、风险、Claim、Run 或 Review 语义。
- 不重新设计页面视觉，不改变已有导航或 URL 结构；只补充记录加载与失败状态。
- 不引入新数据库、后台任务、前端框架或持久化缓存。
- 不把所有 Coordinator 查询一次性重写成新的查询引擎。
- 不承诺兼容绕过 Coordinator、又不追加事件的裸 SQL 写入；这不是 GoalBoard 的正式写入契约。
- 不用脆弱的固定毫秒数作为 CI 成败标准。

## 方案与关键决策

1. 以 Board 事件游标作为 Web View 唯一内容版本。GoalBoard 的规范写入都会在同一事务中追加事件；SQLite 主文件与 WAL 的时间、大小都不是产品事实版本。若未来需要支持外部写入，应增加事务内递增的显式 revision，而不是恢复文件时间兜底。
2. Coordinator 批量只读接口接受已经读取的 BoardSnapshot，并在所有 Goal 状态派生中复用它。单 Goal 接口保持兼容并复用相同内部路径。
3. Web 展示策略仍通过 canonical policy resolver 读取，不再通过 `explainGoal` 顺带执行依赖、风险、Claim 和影响冲突检查。本次不为微小查询耗时扩张新的查询引擎。
4. Goal 正文继续使用现有 renderer；仅把“完整记录”替换成可访问的加载占位，并新增同项目、同 Goal、同 collection 的只读 records fragment。加载完成后仍呈现原来的全部记录，不删减数据。
5. 页面初始化时用 `history.replaceState` 给根历史项记录初始 Goal；`popstate` 对 `/goals/:id` 和项目根路径都调用同一 `selectGoal` 路径。
6. 缓存负责“没有事件时不重算”，单快照批量状态负责“首次构建不重复读 Board”，记录按需加载负责“普通点击不解析不看的历史账本”。

## 输入、输出与依赖

- 输入：项目数据库路径、Board ID、事件游标、Web 路由展示选项、当前 Goal 与记录 collection。
- 输出：与现有 `GoalBoardWebView` 完全兼容的只读视图、单 Goal HTML fragment 和按需 records fragment。
- 依赖：`SqliteGoalBoardStore.snapshot/eventCursor`、Coordinator canonical 状态派生、现有 Web renderer。

## 文件与模块边界

- `src/v1/coordinator.ts`：批量工作状态与只读策略入口；状态规则仍只有一套。
- `src/web/server.ts`：事件游标缓存键、单快照 Web View 组装、records fragment 路由。
- `src/web/render.ts`：浏览器历史一致性、记录按需加载；原有记录 renderer 保持唯一。
- `tests/v1.test.ts`：批量与单 Goal 工作状态一致性。
- `tests/web.test.ts`：缓存无数据变化时保持命中，事件变化后失效；Web 输出不回归。

## 验收标准

1. 同一 Board 无新事件时，重复页面请求和 Goal 文档请求不重建 Web View；SQLite 文件生命周期不参与缓存判断。
2. Board 通过正式写入路径追加事件后，下一次读取会重建并展示新事实。
3. 批量工作状态与逐 Goal 查询对所有状态字段保持一致。
4. Web View 不再逐 Goal 调用 `store.snapshot` 或 `explainGoal`。
5. 普通 Goal 页面和 `/document` fragment 不包含完整记录账本；打开记录 Tab 后仍能看到原有完整内容。
6. 从两个 Goal 连续后退到项目根路径时，URL、Tree 选中项和正文恢复到根历史项的初始 Goal；前进同样一致。
7. Footballnia 的 `buildGoalBoardWebView` 保持 2 秒以内；连续 Goal 文档请求在本机达到接近即时响应，普通正文体积明显下降。
8. `pnpm typecheck`、定向 V1/Web 测试、完整测试和真实浏览器回归通过。

## 验证命令

- `pnpm typecheck`
- `node --import tsx --test tests/v1.test.ts tests/web.test.ts`
- `pnpm test`
- 用 Footballnia 数据库重复测量 `buildGoalBoardWebView`、项目页面 TTFB 和连续 Goal fragment TTFB。

## 假设与风险

- 规范写入必须追加 Board 事件；没有事件的裸 SQL 更新不会触发 Web 缓存失效，也不属于受支持的产品写入路径。
- 批量派生仍可能对部分可执行 Goal 做规则查询；本次先移除重复快照和重复完整解释，不扩张为 Coordinator 全量查询架构重写。
- 记录 Tab 首次打开仍可能读取较大的历史账本；本次先消除日常切换成本，不改变记录完整性或引入分页语义。
- 真实大项目性能用于人工验收，不把机器相关的绝对耗时写成不稳定测试。

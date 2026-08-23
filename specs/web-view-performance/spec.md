# Web 项目与 Goal 切换性能修复

## 背景与目标

GoalBoard 已经按需加载单份 Goal 正文，但服务端的单 Goal 接口仍先构建整张 Board 的完整 Web View。大项目打开或切换 Goal 时，服务端会对每个 Goal 重复读取整张快照、重复执行完整可领取性检查；缓存又把 SQLite WAL 文件时间作为版本，数据库仅被打开和关闭也可能造成无效重建。

本次达到“功能可用”：不改变 Goal 状态、权限、页面结构或已有接口语义，让大项目首次打开明显缩短，并让没有数据变化时的项目重开和 Goal 连续切换直接复用已有视图。

## 当前行为与证据

- Footballnia：155 个 Goal、1018 条关系、2596 条事件。
- 单次 `store.snapshot` 约 0.10 秒。
- 对 155 个 Goal 逐个调用 `getGoalWorkState` 约 5.23 秒。
- 对 155 个 Goal 逐个调用 `explainGoal` 约 2.74 秒。
- `buildGoalBoardWebView` 约 8.63 秒，最终 HTML renderer 约 0.07 秒。
- 实际项目请求出现过 13.7–68.8 秒首字节等待。
- `/api/goals/:goal_id/document` 仍调用 `cachedGoalBoardWebView`；缓存键包含数据库和 WAL 的大小、修改时间。

## 范围

- Web View 缓存由 Board 的权威事件游标、主数据库文件版本和影响展示的路由选项失效；明确忽略 WAL 生命周期。
- Coordinator 提供一次快照内批量派生全部 Goal 工作状态的只读能力。
- Web View 构建不再为了读取 resolved policy 对每个 Goal 执行一次完整 `explainGoal`。
- 将构建阶段反复按 Goal 扫描的数据预先建立索引，避免随项目增长形成不必要的重复扫描。
- 为缓存稳定性、状态一致性和大 Board 构建路径补充回归测试。

## 非目标

- 不改变 Goal Contract、状态机、依赖、风险、Claim、Run 或 Review 语义。
- 不改变页面视觉、文案或客户端路由。
- 不引入新数据库、后台任务、前端框架或持久化缓存。
- 不把所有 Coordinator 查询一次性重写成新的查询引擎。
- 不用脆弱的固定毫秒数作为 CI 成败标准。

## 方案与关键决策

1. 以 Board 事件游标作为首要 Web View 内容版本。GoalBoard 的规范写入都会追加事件；同时保留主数据库文件大小与修改时间，兼容存量的直接 SQLite 写入。WAL 文件是 SQLite 实现细节，不能作为用户数据变更信号。
   请求完成并关闭只读连接后，将缓存记录对齐到检查点后的主数据库版本；该连接已经读取过检查点前的 WAL 内容，因此不需要仅因 WAL 合并到主文件再重建一次。
2. 新增 Coordinator 批量只读接口：一次读取 BoardSnapshot，再为所有 Goal 派生 canonical work state。单 Goal 接口保持兼容并复用相同内部路径。
3. 新增只读 resolved policy 接口，Web 展示策略时不再通过 `explainGoal` 顺带执行依赖、风险、Claim 和影响冲突检查。
4. Web 构建先按 `goal_id`、`risk_id`、对象 ID 建立 Map/Set 索引，再组装各 Goal 的详情。结果结构保持不变。
5. 缓存修复负责“没有变化时不重算”；批量状态与索引负责“首次构建也足够快”。两者缺一不可。

## 输入、输出与依赖

- 输入：项目数据库路径、Board ID、事件游标、Web 路由展示选项。
- 输出：与现有 `GoalBoardWebView` 完全兼容的只读视图和单 Goal HTML fragment。
- 依赖：`SqliteGoalBoardStore.snapshot/eventCursor`、Coordinator canonical 状态派生、现有 Web renderer。

## 文件与模块边界

- `src/v1/coordinator.ts`：批量工作状态与只读策略入口；状态规则仍只有一套。
- `src/web/server.ts`：稳定缓存键、索引化 Web View 组装。
- `tests/v1.test.ts`：批量与单 Goal 工作状态一致性。
- `tests/web.test.ts`：缓存无数据变化时保持命中，事件变化后失效；Web 输出不回归。

## 验收标准

1. 同一 Board 无新事件、主数据库无变化时，重复页面请求和 Goal 文档请求不重建 Web View；仅打开或关闭 WAL 不触发重建。
2. Board 追加事件或存量路径直接更新主数据库后，下一次读取会重建并展示新事实。
3. 批量工作状态与逐 Goal 查询对所有状态字段保持一致。
4. Web View 不再逐 Goal 调用 `store.snapshot` 或 `explainGoal`。
5. Footballnia 的 `buildGoalBoardWebView` 从约 8.63 秒降到 2 秒以内；连续 Goal 文档请求在本机达到接近即时响应。
6. `pnpm typecheck`、定向 V1/Web 测试和完整测试通过。

## 验证命令

- `pnpm typecheck`
- `node --import tsx --test tests/v1.test.ts tests/web.test.ts`
- `pnpm test`
- 用 Footballnia 数据库重复测量 `buildGoalBoardWebView`、项目页面 TTFB 和连续 Goal fragment TTFB。

## 假设与风险

- 规范写入应追加 Board 事件；主数据库文件版本只为存量直接 SQLite 写入提供兼容兜底，不再通过 WAL 时间猜测内容变化。
- 批量派生仍可能对部分可执行 Goal 做规则查询；本次先移除重复快照和重复完整解释，不扩张为 Coordinator 全量查询架构重写。
- 真实大项目性能用于人工验收，不把机器相关的绝对耗时写成不稳定测试。

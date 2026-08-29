# GoalBoard Bug 卡台账

更新时间：2026-08-29

这份台账记录本轮已经分析过的 GoalBoard 体验问题，无论最终是否确认是真 Bug。它是产品判断与验收记录，不以“代码已经改动”代替“产品已经可用”。

## 状态口径

- **Bug 确认**：`已确认`、`非 Bug`、`设计债`、`接入问题`、`误用`、`预期行为`、`证据不足`可以组合使用，但必须说明主要归因。
- **修复决定**：`已批准`、`待审批`、`延后`、`不修`。
- **修复状态**：`未开始`、`实现中`、`源码已实现`、`工程验证通过`、`已安装`、`产品实操通过`、`最终验收通过`逐层推进，不能跨层升级。
- **验收边界**：工程验证、最终交付物上的产品实操和 GoalBoard Owner 最终验收分别报告；真人主观体验或用户本人认可另行标记。

## 总览

| ID | 标题 | 主要归因 | Bug 确认 | 修复决定 | 修复状态 | 优先级 |
| --- | --- | --- | --- | --- | --- | --- |
| GB-20260828-01 | 当前消息已明确项目仍被重复确认 | GoalBoard Skill 授权识别缺陷 | 已确认 | 已批准 | Core 已安装，Codex Skill 待修复 | P1 |
| GB-20260828-02 | 已完成执行被 Available 误导为再次执行 | GoalBoard 派生状态缺陷 | 已确认 | 已批准 | Core/App 已安装，Codex Skill 待修复 | P1 |
| GB-20260828-03 | 项目内绝对路径被误报为项目范围外 | GoalBoard locator 设计缺陷 | 已确认 | 已批准 | Core/App 已安装，Codex Skill 待修复 | P1 |
| GB-20260828-04 | 同一 LaunchAgent PID 被误报为端口冲突 | GoalBoard 服务归属兼容缺陷 | 已确认 | 已批准 | 已安装，产品部分实操 | P1 |
| GB-20260828-05 | 对话使用 G2A/G2B，Goal Tree 隐藏对应 ID | GoalBoard Desktop CSS 回归 | 缺陷 | 已批准 | 已修复待发布 | P2 |
| GB-20260828-06 | 已绑定 Session 的生命周期调用偶发误报未连接 | GoalBoard 连接缓存与恢复语义缺陷 | 已确认 | 已批准 | Core 已安装，Codex Skill 待修复 | P1 |
| GB-20260828-07 | 内嵌 Node 测试把 Homebrew Node 误当成可搬移运行时 | GoalBoard 测试夹具可移植性缺陷 | 非产品 Bug | 已批准 | 发布门禁通过 | P1（发布门禁） |
| GB-20260829-08 | 租约过期后 Contract 同时显示失效与 active/started | GoalBoard 租约派生与物化一致性缺陷 | 已确认 | 已批准 | Core/App 已安装，Codex Skill 待修复 | P1 |
| GB-20260829-09 | `repo:` 项目内 Evidence 被降级且没有可修正格式 | GoalBoard locator 协议可发现性设计债 | 设计债 | 已批准 | Core/App 部分实操，Codex Skill 待修复 | P2 |
| GB-20260829-10 | 升级后的旧服务配置允许 restart 但无法完成修复 | GoalBoard 服务恢复动作缺陷 | 已确认 | 已批准 | 产品主路径通过 | P1 |
| GB-20260829-11 | 活跃长任务无续租入口，执行中静默过期 | GoalBoard 租约续期与可见性设计缺陷 | 已确认 | 已批准 | Core/App 可见，Codex Skill 待修复 | P1 |
| GB-20260829-12 | Runtime 反复领取只剩人工判断的复核 | GoalBoard Review 条件路由与人工等待状态缺陷 | 已确认 | 已批准 | Core/App 已安装，Codex Skill 与真实接棒待修复 | P1 |
| GB-20260829-13 | Opportunity 有引用但看不到研究过程与样本漏斗 | CGS 领域模型与编辑台设计债 | 设计债、接入问题 | 已批准 | 未开始（CGS） | P1（CGS） |
| GB-20260829-14 | Goal Tree 提案 payload 需要查源码才能构造 | GoalBoard MCP 契约自描述缺陷 | 已确认 | 已批准 | MCP 包已安装，Arena 未实操 | P1 |
| GB-20260829-15 | 子 Goal 用样本验收却被理解成父级能力已经具备 | GoalBoard 跨层 Contract 覆盖设计债 + CGS 建模错误 | 设计债、接入问题 | 已批准 | Core/App 部分实操，Codex Skill 待修复 | P1 |
| GB-20260829-16 | Core/App 已升级但 Codex Skill 仍指向旧 Release | 发布与 Runtime 接入验收缺陷 | 已确认 | 已批准 | 发布门禁已补齐，待新包接入 | P1 |

---

## 2026-08-29 v0.1.5 最终产物回归复核

本轮不是复查“有没有修复 commit”，而是从远端 `main`、v0.1.5 Release、本机 Core、App 内嵌 Runtime、常驻服务、Codex 实际 Skill 链接和真实 CGS 页面逐层核对。`pnpm test` 当前覆盖 274/274，但这只支持工程层；下表单独记录最终产物与真实数据看到的结果。

| Bug | 当前证据 | 回归结论 |
| --- | --- | --- |
| GB01 | v0.1.5 包内 Skill 有“当前消息明确选择则不重复确认”，但 Codex 实际 Skill 仍链接 `goalboard-0.1.1`，没有该规则 | 交付未完成，随 GB16 重开 |
| GB02 | v0.1.5 Core 保留 `completion_blocked / completion_pending` 派生与默认回归；Codex 实际执行参考仍是旧版，不认识直接 `complete` 路径 | Core 未回归，消费者交付随 GB16 重开 |
| GB03 | 直接调用 v0.1.5 安装产物的 locator 校验器，项目内绝对 `package.json` 返回 `verified` 并规范化为 `project://package.json`；旧 Skill 未说明该格式 | Core 未回归，协议发现性随 GB16 重开 |
| GB04 | 官方 `service status --json` 在最终服务返回 `running / owned=true`；当前进程已是新版 health，无法再次覆盖旧 health 兼容窗口 | 未发现回归；保留异 PID 安全分支 `UNVERIFIED` |
| GB05 | 真实 CGS HTML 含 `cgs-g2a-opportunity-intelligence` 与 `cgs-g2b-editorial-decision`，但 v0.1.5 Desktop CSS 后置规则把 `.tree-copy small` 隐藏 | 已确认回归；`48a2ca6` 已修复并合入 `main`，待新包实操 |
| GB06 | v0.1.5 MCP 保留 `context_resolve_then_retry / requires_bind=false / retry_same_idempotency_key=true`；Codex 实际项目连接参考仍是旧版 | Core 未回归，恢复指引交付随 GB16 重开 |
| GB07 | 修复提交在 v0.1.5，当前完整默认门禁通过，App/Core/服务可运行 | 未发现回归；仍不把 ad-hoc 包提升为 Apple 公证发布 |
| GB08 | v0.1.5 Core 保留过期 Claim/Run 投影与确定恢复测试；当前真实 G2B 已无原冲突顶层状态，但未重新制造一次过期旅程 | 未发现代码回归；产品恢复旅程仍 `UNVERIFIED`，Skill 随 GB16 更新 |
| GB09 | v0.1.5 locator 对 `repo:package.json` 返回 `verified`；真实 G2B 页面已有四条当前有效、可打开且 anchor 已验证的 Markdown Evidence；旧 Codex Skill 仍缺格式说明 | Core 与真实 Evidence 读取通过，消费者指引随 GB16 重开 |
| GB10 | 当前服务为 `running`；历史真实 `needs_repair → 拒绝 restart → service install` 主路径已记录，未发现后续代码覆盖 | 未发现回归；未知监听者场景仍 `UNVERIFIED` |
| GB11 | 真实 CGS App 显示“租约还剩 28 分钟 · 到期前续租可保持当前 Claim 和 Run”；v0.1.5 MCP 有 `claim_renew`，但 Codex 实际 Skill 没有续租动作 | UI/Core 有效，自动续租交付随 GB16 重开 |
| GB12 | 真实 G2B 仍显示“待复核”；完整记录确认剩余条件是 `human_decision`，但历史 self-verifier verdict 为 `inconclusive`。代码按已记录边界要求再做一次仅覆盖工程项的显式复核后才转人工；旧 Codex Skill 又不认识 `waiting_for_human` | 不是 CSS 回归；历史接棒尚未实操，Skill 随 GB16 更新，不得称产品已修好 |
| GB13 | 归因仍在 CGS；GoalBoard Core 没有对应实现承诺 | 未开始，不属于“已修复”复核集合 |
| GB14 | v0.1.5 安装产物的 MCP schema 已对 8 种 kind 使用条件化 payload，并明确 `part_of / depends_on` 方向 | 未发现包内回归；Arena 新 Session 实操仍 `UNVERIFIED` |
| GB15 | 真实 G2A 的“上下文 → 完成要求”显示“本 Goal 按当前 Contract 已满足，不自动等于父 Goal 完整能力”，并明确历史父 Goal 未记录覆盖 | 防误导文案已在最终 App 可见；新拆树阻断与 CGS Contract 纠偏仍 `UNVERIFIED`，Skill 随 GB16 更新 |

---

## GB-20260828-01：当前消息已明确项目仍被重复确认

**来源**：CGS 新 Session 消费者反馈 1
**Bug 确认**：已确认，属于 GoalBoard Skill 的当前消息授权识别缺陷
**修复决定**：用户已批准
**修复状态**：源码与 v0.1.5 包已包含；Codex 实际 Skill 仍指向 0.1.1，消费者交付未完成，产品实操与最终验收未完成

### 1. 真实场景

用户因为旧 Session 太乱而新开 Session，并在同一句话中明确要求“继续用 GoalBoard 推进 CGS”。`context_resolve` 找到唯一现有项目 `Content Growth Studio`，但仍返回 `suggested`，消费者按协议必须再次询问是否关联，导致用户在读取 Goal 前被打断。

### 2. 事实与归因

可通过“新 Session、无 workspace 默认项目、当前消息明确命名一个现有项目、唯一候选匹配”复现。`suggested` 本身符合 Runtime 安全边界；缺陷在于 Skill 没有把当前消息中已经发生的明确选择转成这一次 `context_bind` 的用户确认。主要归因是 GoalBoard Skill 缺陷，不是 CGS 接入问题，也不是用户误用。

### 3. 现有流程的问题

用户先明确说“用 GoalBoard 推进 CGS”，随后还要回答“是否关联 Content Growth Studio”。多出一次同义确认，并把“新 Session 不继承旧授权”误呈现成“当前消息也没被理解”。

### 4. 设计根因与初衷

原设计把目录历史和唯一候选都视为线索而非授权，防止新 Session 静默进入旧项目、同名项目或错误目录。这条边界是必要的；问题是实现只识别 Runtime 返回的 `suggested` 状态，没有识别当前用户消息已经提供的新授权。

### 5. 当前影响

影响所有新 Session 中“明确命名现有项目并立即继续”的入口。每次多一次阻塞式问答；在用户主动重开干净 Session 时尤其破坏连续性，但不改变数据，也不会越权绑定。

### 6. 复杂度审查

- **当前必须**：仅在当前消息明确命名项目、现有项目唯一无歧义匹配、当前 Session 没有冲突绑定时，直接执行一次 Session 级绑定。
- **可以延后**：自然语言别名管理、模糊匹配、多语言实体解析增强。
- **应当删除**：在上述唯一明确场景中再次要求用户重复选择。

### 7. 修复必要性与优先级

需要修复，P1。它位于所有 Goal 读取和推进之前，出现一次就打断主流程；同时修复可以保持原有授权边界，不需要放宽默认绑定、切换项目或新建项目权限。

### 8. 修复前后体验差异

- **修复前**：用户说“继续用 GoalBoard 推进 CGS” → Runtime 找到唯一 `Content Growth Studio` → 再问一次是否关联 → 用户确认后才继续。
- **修复后**：同一句明确指令直接授权本 Session 绑定唯一匹配项目 → Runtime 继续读取 Available/Contract。遇到多候选、切换项目、新建项目、只说“继续”或没有明确名称时仍会询问。

### 9. 最小修复范围

修改 `goal-advance` 的项目连接规则和项目候选匹配结果，使“当前消息明确命名 + 唯一现有匹配”可直接做 Session 级绑定。没有修改 `suggested` 的底层含义，没有增加自动默认项目，没有绕过 rebind、新建、删除或 workspace default 的独立确认。回滚时可恢复为所有 `suggested` 均询问，不影响 catalog 数据。

### 10. 验收边界

- **工程验证**：项目 catalog 与 MCP 的明确项目选择回归通过；正常本机权限下整仓门禁 261/261、TypeScript 和 Skill 校验通过。
- **产品实操**：`UNVERIFIED`。v0.1.3 已安装；尚未用一个真实新 Session 完整走过“明确命名 → 直接绑定 → 读取 Goal”。
- **Owner 最终验收**：未通过。需在最终安装产物中完成上述主流程，并复测多候选、项目切换和未命名请求仍会确认。

---

## GB-20260828-02：已完成执行被 Available 误导为再次执行

**来源**：CGS 新 Session 消费者反馈 2
**Bug 确认**：已确认，属于 GoalBoard 派生状态和恢复动作表达缺陷
**修复决定**：用户已批准
**修复状态**：v0.1.5 Core/App 已包含；Codex 实际 Skill 仍缺完成门禁动作，消费者交付与产品实操未完成

### 1. 真实场景

G2A 已有 completed executor Run、通过的 Evidence、满足要求的 Review 和完成检查记录，唯一剩余问题是 completion Risk 仍为 `open`。新 Session 读取 Available 时却看到 `role=executor / work_state=execution_pending / next_action=execute`，容易再次领取并重复执行。

### 2. 事实与归因

可用“执行、证据、复核全部完成，但 completion Risk 仍 open”稳定复现。完成判定正确地被 Risk 阻止；错误发生在无活跃 Run/Review 后的派生状态回退，它把剩余门禁误归为 `execution_pending`。主要归因是 GoalBoard 的 Available 派生状态 Bug，不是缺少业务实现，也不是 CGS 误用。历史 Risk 提案物化问题可能解释门禁为何未解除，但不改变 Available 对当前 canonical 事实的错误表达。

### 3. 现有流程的问题

表层动作要求 executor `execute`，真实动作却是处理完成门禁并重试 `complete`。消费者必须深挖 Contract、Run 历史和 release reason 才能发现真相；如果只按 Available 行动，会新增重复 Claim、Run 和 Evidence，并再次撞到同一完成门禁。

### 4. 设计根因与初衷

GoalBoard 原本不持久化第二套工作状态，而是从 canonical Goal、Run、Evidence、Review、Risk 动态派生，这是为了防止状态副本漂移。completion Risk 也有意不阻止初次执行，因为执行结果本身可能消除风险。缺陷是派生器缺少“执行闭环已经结束、只剩完成门禁”和“所有门禁已解除、应直接完成”两个阶段，于是错误落回执行入口。

### 5. 当前影响

影响所有已完成实现但 `complete` 被 Risk 或类似完成门禁拒绝的 Goal。它会阻断自然进入下一 Goal，并污染 Claim/Run/Evidence 历史；对新 Session 和只依赖 Available 的消费者是高频误导，对已经深读 Contract 的消费者仍可人工绕开。

### 6. 复杂度审查

- **当前必须**：从现有 canonical 事实派生 `completion_blocked` 和 `completion_pending`；阻止 executor 再次 select；给出具体门禁原因和直接完成动作。
- **可以延后**：统一所有完成门禁的专属工作台、自动修复历史 Risk 提案、完成阻塞趋势统计。
- **应当删除**：执行已结束后无条件回退到 `execution_pending` 的逻辑；通过重复 Claim/Run 恢复生命周期的路径。

### 7. 修复必要性与优先级

需要修复，P1。它会制造无意义执行历史并持续阻断后续 Goal，且修复只需补齐派生状态和动作路由，不需要新增持久化状态或重构完成判定。

### 8. 修复前后体验差异

- **修复前**：完成检查被 Risk 阻止 → 新 Session 看到“待执行” → 领取 executor → 重复核验与 Evidence → 再次完成失败。
- **修复后**：完成 Risk 仍开放时，Goal 显示“完成受阻”，出现在 Available 的 `blocked` 诊断中并给出恢复条件，不可领取 executor；Risk 被 canonical 地解除后，Goal 显示“待完成”，Available 返回 `next_action=complete / role=null`，Runtime 直接重试完成判定，不创建 Claim、Run 或重复 Evidence。

### 9. 最小修复范围

修改工作状态派生、Available/Explain/select-goal 防线、Web/胶囊状态文案和 Runtime Skill 协议。新增的是派生状态，不增加数据库列；原完成判定和 Risk canonical 状态保持不变。`blocked` 是 Available 的加法字段，旧消费者仍可读取 `available`；回滚可移除新派生分支，不需要迁移数据。

### 10. 验收边界

- **工程验证**：回归先复现 `execution_pending` 错误，再验证 Risk 开放时 `completion_blocked`、解除后 `completion_pending → complete`，且不会增加 Claim/Run；已撤回或替代的 Evidence 也不会被误算为有效。正常本机权限下整仓门禁 261/261、TypeScript 和 Skill 校验通过。
- **产品实操**：`UNVERIFIED`。尚未在安装版用真实 G2A canonical 数据验证 Goal Tree、Available、风险处理和直接完成的完整旅程。
- **Owner 最终验收**：未通过。需安装后确认用户看到的确实是“完成受阻/待完成”，消费者不再创建重复执行记录，并能自然进入 G2B。

---

## GB-20260828-03：项目内绝对路径被误报为项目范围外

**来源**：CGS 新 Session 消费者反馈 3
**Bug 确认**：已确认，属于 GoalBoard Evidence locator 的设计缺陷；不是旧 workspace 关联污染
**修复决定**：用户已批准
**修复状态**：v0.1.5 Core/App locator 已安装并通过安装产物冒烟；Codex 实际 Skill 仍缺规范格式，完整产品实操未完成

### 1. 真实场景

当前 Session 已绑定 `Content Growth Studio`，canonical workspace 是 `/Users/oreal/adeptify-home/repos/Content Growth Studio`。消费者提交这个目录内真实存在的 JSON 和 Markdown 绝对路径作为 Evidence locator，却收到“不能指向项目范围外的本地文件”，无法登记 verified local Evidence。

### 2. 事实与归因

已用安装版 locator 校验器复现。它在检查 `projectRoot` 之前，对所有绝对路径直接抛出同一个“项目范围外”错误；同一文件改成 `project://data/...` 或 `project://docs/...` 后均返回 `verified`。因此当前案例不是项目 workspace 归属不一致，也不是旧关联被选中；主要归因是 GoalBoard 对绝对路径一刀切拒绝，以及错误文案把“绝对路径不被支持”说成“文件在项目外”。消费者没有猜测内部 `project://` 规范，不构成误用。

### 3. 现有流程的问题

Runtime 从 shell 和工具结果自然获得绝对路径，但提交时必须先知道 GoalBoard 的私有相对引用格式并手工改写。失败信息还把正确项目内文件说成项目外，诱导消费者排查错误的 workspace 历史，而不是修正 locator 形式。

### 4. 设计根因与初衷

原设计只允许项目相对引用，并在 realpath 后阻止 `..`、绝对路径和 symlink 越界，目的是避免 GoalBoard 读取或暴露任意本地文件。这项安全边界必要；缺陷是把“输入表示形式”当成了“访问范围”，没有先把绝对路径规范化后再做项目 containment 检查。

### 5. 当前影响

影响所有直接提交项目内绝对文件路径的 Runtime，尤其是从命令输出、编辑器或当前工作目录复制路径的场景。它不会破坏数据，但会阻止 verified Evidence，迫使消费者保留 UNVERIFIED 命令 locator、猜协议或放弃追溯；本次直接影响 G2A 完成证据质量。

### 6. 复杂度审查

- **当前必须**：接受绝对路径的前提是 realpath 后严格位于当前 Session 的 canonical workspace 内；内部规范化为项目相对引用，并继续拒绝项目外路径和 symlink 逃逸。
- **可以延后**：多 workspace root、显式外部文件授权、网络内容抓取与长期可用性验证。
- **应当删除**：在 containment 检查前拒绝全部绝对路径；把“绝对路径格式”误报成“项目范围外”。

### 7. 修复必要性与优先级

需要修复，P1，已批准。Evidence 是完成闭环的核心事实，项目内真实文件不应因表示形式失去 verified 状态。该修复保持安全边界，并减少 Runtime 对 GoalBoard 私有 locator 语法的依赖。

### 8. 修复前后体验差异

- **修复前**：提交项目内绝对路径 → 立即被误报为项目外 → 用户或 Runtime 改查 workspace 关联，或手工猜成 `project://...`。
- **修复后**：提交项目内绝对路径 → GoalBoard 以当前 Session workspace 做 realpath containment → 在项目内则规范化并验证，在项目外或经 symlink 逃逸仍明确拒绝。用户不需要改写路径。

### 9. 最小修复范围

只修改 Evidence locator 规范化和错误分类，并补绝对项目内、绝对项目外、symlink 逃逸、相对路径和 `project://` 的回归测试。不改变 workspace 绑定、项目 catalog 归属、外部 URL 的 UNVERIFIED 策略或历史 Evidence。可通过恢复绝对路径拒绝分支回滚，不涉及数据迁移。

### 10. 验收边界

- **工程验证**：回归先复现项目内绝对路径被拒绝，再验证它可被 verified 并存为 `project://contract.md`；同一测试确认项目外路径和 symlink 逃逸仍被拒绝，既有相对路径、Markdown anchor、外部 URL 和不透明 locator 语义不变。正常本机权限下整仓门禁 261/261、TypeScript 和 Skill 校验通过。
- **产品实操**：`UNVERIFIED`。v0.1.3 已安装；尚未在真实 CGS 新 Session 用反馈中的两个原始绝对路径提交并从项目页面打开记录。
- **Owner 最终验收**：未通过。需在最终安装产物中完成上述真实路径主流程，并再次实测项目外路径和 symlink 逃逸被拒绝。

---

## GB-20260828-04：同一 LaunchAgent PID 被误报为端口冲突

**来源**：CGS 新 Session 消费者反馈 4
**Bug 确认**：已确认，属于 GoalBoard Web 服务归属协议的升级兼容缺陷
**修复决定**：用户已批准
**修复状态**：已安装到 v0.1.3；现场旧受管进程不再误报 `conflict`，完整打开入口与异 PID 安全分支尚未最终验收

### 1. 真实场景

用户明确要求“打开 GoalBoard”。已安装 launcher 的 `service status --json` 返回 `state=conflict`，声称 4173 监听者无法证明属于当前 LaunchAgent；但 `launchctl` 的受管 PID、`lsof` 的 4173 监听 PID 都是 65405，HTTP 页面也健康。

### 2. 事实与归因

当前机器可稳定复现。LaunchAgent receipt/plist 归属已通过，PID 一致，根路径 200；但 `/health` 只返回 `status/project_count/desktop_tui`，缺少当前 status 实现要求的 `service_process_id/process_id`，所以 `healthyOwnedInstance` 为 false，随后只要端口在监听就进入 conflict。主要归因是 GoalBoard 新旧健康协议兼容缺陷，不是第三方占用，也不是 CGS 接管进程。

### 3. 现有流程的问题

普通“打开 GoalBoard”被停止在不存在的所有权冲突上。消费者必须额外运行 `lsof`、`launchctl` 和 HTTP 检查才能证明页面可开；按错误字面操作还可能诱发不必要的停止、重启或修复。

### 4. 设计根因与初衷

原设计要求 LaunchAgent receipt/plist 归属、受管 PID 和 `/health` 返回的服务 PID 一致，防止 GoalBoard 因端口可访问就接管或终止第三方服务。这一防线正确。缺陷是升级后把新版 health identity 当成唯一证明方式，没有处理“受管旧进程仍健康但 health payload 尚无新字段”的兼容窗口，也没有使用已知的 LaunchAgent PID 与监听 PID 精确相等作为安全回退。

### 5. 当前影响

影响安装更新后旧常驻进程仍在运行、但磁盘代码与健康协议已经升级的用户。它阻断普通打开入口，但页面本身仍可用；严格消费者会停止，熟悉系统的消费者可以通过额外只读核验绕过。误判不直接损坏数据，错误修复操作才可能造成可用性中断。

### 6. 复杂度审查

- **当前必须**：把健康检查结果区分为“已证明归属”“已证明不匹配”“旧协议缺身份”；仅在旧协议且 LaunchAgent PID 与实际监听 PID 精确一致时接受安全兼容回退。
- **可以延后**：多端口服务、通用进程证明框架、自动无中断升级常驻进程。
- **应当删除**：把“health 缺新字段 + 端口已监听”直接等同于第三方冲突；在 PID 已精确相同时要求用户人工排查占用者。

### 7. 修复必要性与优先级

需要修复，P1，已批准。它位于“打开 GoalBoard”的高频入口，并且错误信息可能引导用户做不必要的服务变更。修复保持未知监听者不接管、不停止的原安全边界。

### 8. 修复前后体验差异

- **修复前**：受管旧进程健康且监听 PID 等于 LaunchAgent PID → status 仍返回 conflict → 用户无法直接打开。
- **修复后**：新版 health PID 匹配时照常判定 running；旧 health 缺 PID 时，仅在 OS 监听 PID 与受管 PID 精确相等后判定兼容 running，并提示可在后续受控重启升级协议；PID 不同或无法查明时仍返回 conflict。

### 9. 最小修复范围

修改 Web service detection 的健康归属判断，增加只读端口监听 PID 查询和三态结果，补“旧 health + 同 PID”“旧 health + 异 PID”“新 health + 匹配/不匹配”测试。不停止、不重启、不改 LaunchAgent，不把根路径 200 单独当成归属证明。回滚只恢复严格 health identity 检查。

### 10. 验收边界

- **工程验证**：回归先复现“旧 health 缺身份、端口监听、同 PID 仍被判 conflict”，再验证同 PID 为 running、异 PID 仍为 conflict；服务测试 22/22，正常本机权限下整仓门禁 261/261、TypeScript 和 Skill 校验通过。
- **产品实操**：部分通过。v0.1.3 Core 面对现场旧受管进程时把原 `conflict` 正确降为可恢复的 `needs_repair`；受控执行 `service install` 后状态为 `running`，LaunchAgent PID、4173 监听 PID 和 `/health` PID 均为 30070。尚未从真实“打开 GoalBoard”入口走完整旅程，也未制造真实异 PID 监听者做安全实操。
- **Owner 最终验收**：未通过。需在最终安装升级场景确认无需人工 `lsof/launchctl/curl` 即可打开，同时由受控异 PID 场景确认仍安全阻止。

---

## GB-20260828-05：对话使用 G2A/G2B，Goal Tree 隐藏对应 ID

**来源**：用户截图直接反馈
**Bug 确认**：已确认最初是 GoalBoard 可引用性设计债；v0.1.5 隐藏编号，v0.1.6 又把完整内部 ID 塞进窄栏并挤没中文标题，Goal 内容没有丢失
**修复决定**：用户已批准
**修复状态**：再次打开。短编号修正已在源码与真实 CGS 数据的 355 CSS px 窄屏中实操，尚未进入新的最终安装包

### 1. 真实场景

会话里用 “G2A 已完成、G2B 已解锁”讨论下一步；用户打开 Content Growth Studio 的 Goal Tree，只看到自然语言标题，看不到哪一行对应 G2A 或 G2B，无法把会话引用和树中条目对上。

### 2. 事实与归因

最初截图与源码一致。CGS 的 canonical ID 包含 `cgs-g2a-opportunity-intelligence`、`cgs-g2b-editorial-decision`。v0.1.5 的 Desktop CSS 把 renderer 已输出的 ID 隐藏；删除隐藏规则后，v0.1.6 的真实 App 又直接常驻显示完整 canonical ID。用户 2026-08-30 的窄窗口截图复现第二层回归：标题、完整 ID 和右侧状态争夺同一行，深层 Goal 的中文标题只剩一两个字，ID 也被截成 `cgs-g2c-re…`，既不可读也不能直接对应会话中的 `G2C`。归因是同一张 bug 卡的过度修复和最终窄屏验收缺口，不是数据乱码、CGS 标题丢失或编码损坏。

### 3. 现有流程的问题

v0.1.5 时，列表没有可对应编号；v0.1.6 时，编号虽然出现，却以完整内部 slug 抢占标题空间。用户仍看不清 `G2A/G2B`，还会把大量省略号误解成乱码或数据损坏。两种状态都使 Goal Tree 无法承担人和 Runtime 之间的共同索引。

### 4. 设计根因与初衷

Goal Tree 最初为降低视觉噪音和提高窄栏密度而隐藏机器 ID；第一次修复则把“稳定 ID 可见”直接等同于“完整 canonical ID 常驻可读”。两者都忽略了用户真正需要的是会话里正在使用的短引用 `G2A/G2B`，而不是内部 slug。原测试只检查 `<small>` 没被 `display:none`，没有检查真实长中文、深层缩进、状态徽标和 320 至 355 CSS px 窄宽下的信息层级，因此把“元素存在”误报成“体验修好”。

### 5. 当前影响

影响所有在会话、文档或协作中用 Goal ID/简称讨论工作的用户。Goal 数量少时可凭标题猜测，层级变深、标题变长或多个 Goal 语义相近时频率和歧义都会上升。本次未阻断数据闭环，但已经阻断用户快速理解 G2A/G2B 在树中的位置。

### 6. 复杂度审查

- **当前必须**：从既有 canonical ID 中只提取确定的层级短编号，例如 `cgs-g2a-* → G2A`；中文标题保持主视觉，完整 ID 仍可搜索并通过悬停读取；覆盖真实长中文和窄屏。
- **可以延后**：新增可编辑的正式别名字段、编号自动分配、别名历史和跨项目唯一性治理。
- **应当删除**：完整内部 `goal_id` 在 Goal Tree 每一行常驻占位，以及所有密度模式下一律隐藏编号的规则。

### 7. 修复必要性与优先级

需要修复，P1，已批准。v0.1.6 已把核心导航显示成用户认为的“乱码”，直接破坏 Goal Tree 的可理解性；同时不应为当前案例立即引入 schema 迁移。确定性提取现有 `G2A/G2B` 是更小且可回滚的修复。

### 8. 修复前后体验差异

- **修复前（v0.1.5）**：会话说 G2A/G2B → Goal Tree 只有标题 → 用户必须猜或逐条打开。
- **错误修复（v0.1.6）**：每行显示 `cgs-g2b-editorial-decision` → 窄屏中文标题和 ID 都变成省略号，仍无法对应。
- **本次修复后**：每行只显示 `G2A/G2B` 短编号和中文标题；完整 ID 不占主布局，但仍能搜索并在悬停读取。

### 9. 最小修复范围

只新增一个纯展示映射：从 `goal_id` 的独立段中识别 `G数字+可选字母`，短 ID 如 `V1` 原样保留，其余 UUID/slug 不在树中常驻显示；完整 ID 继续进入搜索文本和 `title`。不修改 Goal schema、canonical ID、排序、标题、关系、Runtime 输出或 CGS 数据。回滚只恢复 renderer 的显示内容，不涉及数据迁移。

### 10. 验收边界

- **工程验证**：历史隐藏回归已通过 Web + 视觉测试 56/56、整仓 274/274 和 TypeScript；本次又先以缺少短编号映射稳定失败，再验证 `cgs-g2a-* → G2A`、`cgs-g12f-* → G12F`、`V1 → V1`、`draft-UUID → 不常驻显示`。Web 42/42、英文静态标签 7/7、整仓构建与测试 275/275、TypeScript 与 diff check 均通过。
- **产品实操**：v0.1.6 最终 App 的用户截图已复现完整 ID 挤没中文标题。修正后的源码服务已用真实 Content Growth Studio 数据在约 355 CSS px 宽度实操：13 条 Goal 均保留中文标题，G2、G2A、G2B、G2C、G2D、G2E、G2F 与 G1/G3-G6 可见，完整 ID 仍在搜索和悬停属性中。新的最终 App 尚未打包安装，故最终产物仍为 `UNVERIFIED`。
- **Owner 最终验收**：未通过。最终视觉密度和“G2A/G2B 一眼能对应”需要用户本人在安装产物中确认。

---

## GB-20260828-06：已绑定 Session 的生命周期调用偶发误报未连接

**来源**：CGS 新 Session 消费者反馈 5
**Bug 确认**：已确认 GoalBoard 的连接缓存与恢复语义存在缺陷；现场调用级 Session metadata 的具体断点尚无原始日志
**修复决定**：用户已批准
**修复状态**：v0.1.5 MCP Core 已安装；Codex 实际项目连接参考仍指向 0.1.1，恢复指引交付与产品实操未完成

### 1. 真实场景

同一个 Codex task、同一个 Content Growth Studio 工作目录中，消费者刚成功完成并 release `cgs-g2b-editorial-decision` 的计划 Claim，随即调用 `goalboard_v1_select_goal` 领取同一 Goal 的实现 Run，却收到“尚未连接项目”。消费者没有 bind，只调用一次 `context_resolve`，马上又得到同一项目 `status=bound / next_action=continue`。

### 2. 事实与归因

持久化 Session binding 没有丢失，否则后续只读 resolve 不可能在没有 bind 的情况下返回 bound。源码中，生命周期调用只检查 MCP 进程内单槽 `runtimeConnection`：如果当前调用从 `_meta` 得到的 Session ID 与缓存 key 不同或缺失，就先清空连接并直接报 `mcp.connection_incomplete`；`context_resolve` 则重新读取 catalog 的持久化 binding 并恢复缓存。已用“同一已绑定 Session 的一次调用缺少 threadId，下一次 resolve 恢复 threadId”稳定复现完全相同的 `成功 → 尚未连接 → resolve=bound` 序列。主要归因是 GoalBoard 把“进程连接缓存需要刷新”与“Session 没有项目 binding”混成同一个错误。调用级 metadata 断续可能来自 Codex/MCP transport，现场具体是哪一个 `_meta` 字段缺失或变化仍证据不足，但不影响 GoalBoard 错误结论与恢复表达是缺陷。

### 3. 现有流程的问题

消费者收到的是项目未连接错误，却无法知道持久化授权仍有效。它只能猜测重新 bind、重试、重新 resolve，或者再次询问用户是否选择 Content Growth Studio。多出一次失败和一次恢复调用；更严重的是，错误文案会把安全的“刷新后原样重试”误导成需要新的项目授权。

### 4. 设计根因与初衷

GoalBoard 用调用级 Session key 隔离同一 MCP 进程中的不同 Runtime 会话，并在 key 不匹配时清空最后一个项目连接，原本是为了防止 Session B 误用 Session A 最近打开的数据库。新进程第一次做生命周期写入前必须先 resolve 的边界也防止静默恢复旧项目。这些初衷正确。缺陷是实现只有一个“最近连接”缓存槽，且缓存 miss、Session metadata 不连续、其他 Session 切换和真正未绑定全部落到同一 `connection_incomplete`；错误没有报告缓存层与 catalog 层的差异，也没有提供无需用户授权的恢复动作。

### 5. 当前影响

影响调用级 Session metadata 偶发缺失、字段来源切换，或多个 Session 共享同一 MCP 进程的场景。当前已有一条真实 CGS 连续推进记录和一条确定性源码复现；每次至少阻断一个 lifecycle 调用，并增加一次 resolve/retry。它没有删除 binding 或业务数据，但可能诱导重复 bind、重复向用户确认，或让消费者误判 Session 已失效，从而中断 Goal 的连续推进。

### 6. 复杂度审查

- **当前必须**：区分“持久化 context 未绑定”和“本进程连接缓存/调用身份需要刷新”；后一种返回机器可读的 `context_resolve_then_retry`，明确 `requires_bind=false`、`requires_user_confirmation=false`，并要求用同一 idempotency key 原样重试。继续保持不同 Session 不共享连接。
- **可以延后**：把单槽连接改成有界的 per-context cache、对宿主 `_meta` 字段来源做遥测、为多个并发 Runtime 做通用连接池。
- **应当删除**：在没有检查持久化 binding 是否丢失时宣称“尚未连接项目”；把 cache refresh 指导成重新 bind 或再次询问用户。

### 7. 修复必要性与优先级

已批准修复，P1。它发生在 Goal 生命周期连续切换的主路径，错误恢复若处理不当会重复消耗用户授权。已采用澄清错误分类和安全恢复协议的最小修复，不放宽 Session 隔离、不自动绑定，也不迁移 catalog。

### 8. 修复前后体验差异

- **修复前**：已绑定并刚完成 release → `select_goal` 报“尚未连接” → Runtime 不知道该 bind、问用户还是重试 → 手工 resolve 后才发现原绑定仍在。
- **修复后**：连接缓存与当前调用身份不连续 → 返回“先只读 resolve，再用同一 idempotency key 原样重试；不要 bind、不要再次询问用户”的明确恢复动作 → resolve 若仍为 bound，Runtime 自动继续原生命周期调用；只有 resolve 真正返回 unbound/suggested 时才进入正常项目选择流程。

### 9. 最小修复范围

只修改 Runtime MCP 的连接 guard、错误分类/序列化和 `goal-advance` 恢复说明，并补三类回归：已绑定 Session metadata 短暂缺失后的 resolve/retry、不同 Session 仍不串项目、真正 unbound 仍需项目选择。首版不引入 per-context 连接池，不从 cwd 或 suggestion 自动绑定，不改变 `context_bind` 权限和 catalog schema。可回滚为旧错误分支，不涉及数据迁移。

### 10. 验收边界

- **工程验证**：回归先复现已绑定 Session 身份 metadata 短暂缺失时只返回普通“尚未连接”文本；修复后验证结构化恢复字段、只读 resolve 后原调用可重试、不同 Session 仍不串项目、真正未绑定仍走项目选择。正常本机权限下整仓门禁 261/261、TypeScript 和 Skill 校验通过。
- **产品实操**：`UNVERIFIED`。v0.1.3 已安装；仍需在安装版复现“计划 Claim release → 同 Goal executor select”，确认消费者无需用户介入即可按安全指引恢复，并检查真实换 Session 仍不能继承连接缓存。
- **Owner 最终验收**：未通过。最终需确认真实错误文案和消费者行为不会再让用户误以为要重新授权项目。

---

## GB-20260828-07：内嵌 Node 测试把 Homebrew Node 误当成可搬移运行时

**来源**：本次 v0.1.3 发布前整仓门禁
**Bug 确认**：非产品 Bug；属于 GoalBoard 测试夹具的宿主可移植性缺陷
**修复决定**：作为本次打包的必要发布门禁修复
**修复状态**：已安装到 v0.1.3；CI arm64 包、内嵌 Node 与常驻服务已启动验证

### 1. 真实场景

在当前 macOS 开发机运行整仓测试时，“内嵌 Node 在 PATH 中没有 Node 时仍可启动”用例失败。临时安装目录里的 `runtime/node` 启动时报缺少 `@rpath/libnode.141.dylib`，使本次发布门禁停在 260/261。

### 2. 事实与归因

可稳定复现。测试直接复制当前 `process.execPath`；本机该文件来自 Homebrew Node 25.9.0，`otool -L` 证明它依赖 Homebrew 的 `libnode` 及多项动态库，单独复制后本来就不能运行。GoalBoard 发布脚本实际下载 Node 官方 macOS 归档；当前已准备的官方 Node 22.23.2 运行时只依赖系统 Framework/动态库，并能独立执行。因此这是测试夹具把宿主 Node 错当成可分发 Node 的缺陷，不是新包运行时缺文件，也不是六张体验 Bug 的回归。

### 3. 现有流程的问题

同一份源码在官方 Node 或静态分发 Node 环境可过，在 Homebrew 动态 Node 环境必败。发布者看到的是“新包不自包含”，实际失败发生在测试自行制造的伪运行时，造成一次错误发布阻断，并可能诱导把 Homebrew 动态库复制进正式包。

### 4. 设计根因与初衷

测试原本想同时证明两件事：GoalBoard launcher 使用安装目录内的 Node，而不是依赖 PATH；被复制的 Node 本身也是可搬移的官方运行时。直接复制 `process.execPath` 在当时宿主上碰巧覆盖二者，但把外部 Node 发行方式纳入了 GoalBoard 安装器单测的责任范围。

### 5. 当前影响

影响使用动态链接 Node 的 macOS 开发者和发布机，频率为每次整仓测试一次，直接阻断 release gate；不影响已经由官方 Node 归档构建的用户包。若错误修复为携带 Homebrew 全套依赖，会扩大包体、签名面和宿主耦合。

### 6. 复杂度审查

- **当前必须**：测试只验证 GoalBoard 自己的责任——launcher 在 PATH 没有 Node 时仍调用已安装的 `runtime/node`；正式构建继续实际执行下载并校验过的官方 Node。
- **可以延后**：在 CI 增加 `otool`/签名层面的官方 Node 依赖快照；覆盖更多 Node 发行方式的兼容矩阵。
- **应当删除**：把任意宿主 `process.execPath` 复制后视为可搬移 Node 的测试假设；把 Homebrew 动态库带入正式包的补偿方案。

### 7. 修复必要性与优先级

需要修复，P1（发布门禁）。它不是用户侧功能缺陷，但会稳定阻止当前机器完成可信发布；测试修复局限在夹具，不改变安装器或正式包结构。

### 8. 修复前后体验差异

- **修复前**：发布者运行门禁 → Homebrew Node 被复制到临时 release → 因缺动态库失败 → 被误导为 GoalBoard 新包不可运行。
- **修复后**：夹具用绝对路径 Node 代理模拟已安装 runtime → PATH 中无 Node 时三个 launcher 仍从 release 的 `runtime/node` 入口启动；正式包的自包含性由官方 Node 下载、校验和实际执行链路负责。

### 9. 最小修复范围

只修改一条安装测试的 runtime fixture 和名称，不修改生产安装器、launcher、发布脚本、Node 版本或包内容。回滚只影响测试；正式构建没有数据或兼容迁移。

### 10. 验收边界

- **工程验证**：旧夹具已在本机稳定复现 `libnode.141.dylib` 缺失；最小夹具修复后目标用例 1/1 通过，同一正常本机权限下整仓门禁 261/261 通过。
- **产品实操**：此卡本身不适用用户交互验收；GitHub Actions 的 v0.1.3 arm64 ad-hoc 包已完成安装，内嵌 Core/Node 与服务健康实操通过。Developer ID 签名和 Apple 公证仍因凭证缺失而不在本次证据范围内。
- **Owner 最终验收**：通过本次内部包发布门禁；公开分发包仍需补 Developer ID 签名与 Apple 公证后单独验收。

---

## GB-20260829-08：租约过期后 Contract 同时显示失效与 active/started

**来源**：CGS G2B 主线消费者反馈 6
**Bug 确认**：已确认，属于 GoalBoard 租约派生状态、物化时机与恢复动作不一致
**修复决定**：用户已批准
**修复状态**：v0.1.5 Core/App 已安装；Codex Skill 待随 GB16 更新，真实过期恢复旅程与最终验收未完成

### 1. 真实场景

executor 的 Claim 租约过期后，消费者读取同一 Goal 的 Contract。顶层 `work_state.active_claim=null`、`active_run=null`、`work_state=execution_pending`，但明细 `claims[]` 中旧 Claim 仍为 `state=active`，对应 `runs[]` 中旧 Run 仍为 `state=started`。消费者无法判断应继续上报旧 Run、先释放，还是直接重新领取。

### 2. 事实与归因

源码可确定性复现。`deriveGoalWorkState` 会按 `expires_at > now` 过滤 Claim，所以顶层已经视租约失效；原始 Contract 明细直接返回数据库记录，而 `expirePastClaims` 只在下一次 `claimGoal` 时把旧 Claim 物化为 `expired` 并把 Run 终结为 `abandoned`。更严重的是，`reportRun` 在新领取发生前没有检查 Claim 是否已经超时，旧执行者仍可能提交 `completed`；如果另一执行者先领取，旧 Run 又会先被自动 abandoned。结果取决于调用顺序。主要归因是 GoalBoard 生命周期一致性 Bug，不是 CGS 误用；保留历史 Claim/Run 本身是预期行为，错误在于失效语义和写权限没有在所有接口上统一。

### 3. 现有流程的问题

同一份 Contract 同时告诉消费者“现在没有 active 工作”和“旧 Claim/Run 仍 active/started”，却没有标出哪个状态具有执行权威，也没有确定的 `next_action`。消费者若先 report，可能在租约外提交完成；若先 select，系统会悄然把旧 Run abandoned 并创建新 Run；若先 release，又是在操作一个按顶层已经失效的 Claim。多出的不是单纯一次点击，而是三个会产生不同历史结果的错误分支。

### 4. 设计根因与初衷

租约是为了让失联 Runtime 不会永久占用 Goal；超过 `expires_at` 后，新执行者应能领取。原设计采用惰性物化：派生可用性按当前时间忽略过期 Claim，真正有下一位领取者时再一次性写入 `claim=expired`、`run=abandoned` 和事件，避免后台计时器和无业务调用的数据库写入。这个初衷减少了服务复杂度，但 Contract 展示、旧执行者写权限和下一次领取没有共享同一个“有效租约”判断边界。

### 5. 当前影响

影响所有执行时间超过 lease 的澄清、执行、复核或重验证 Run；短任务不触发。它会阻断消费者的确定性恢复，并可能产生租约外完成、重复 Run 或表面上的孤儿 started Run。当前已有一条真实 CGS 记录，且源码路径可稳定证明；影响不是主观摩擦，而是同一历史可能因调用先后得到不同终态。

### 6. 复杂度审查

- **当前必须**：所有 Contract/Available 展示和 lifecycle 写入共享同一有效租约判断；过期 Claim/Run 对消费者统一呈现为失效，并明确旧 Run 不可再提交业务终态；重新领取时原子终结旧生命周期；错误给出可机器执行的恢复动作。
- **可以延后**：后台定时清扫、租约即将到期提醒、自动续租、通用任务心跳、跨进程租约监控面板。
- **应当删除**：让消费者根据 `expires_at` 自己猜 active 是否有效；允许旧执行者在租约外抢先提交完成；为了清理历史而要求用户手工 release 已失效 Claim。

### 7. 修复必要性与优先级

已批准修复，P1。它直接影响写权限和同一 Goal 的唯一执行者语义，风险高于普通展示不一致。修复没有引入后台服务，而是用读取时规范化展示、写入前统一租约屏障和明确恢复错误形成最小闭环。

### 8. 修复前后体验差异

- **修复前**：租约过期 → Contract 顶层说没有 active，明细仍说 active/started → Runtime 猜测 report、release 或 select → 不同调用顺序得到 completed 或 abandoned 等不同结果。
- **修复后**：租约过期 → Contract 明确旧 Claim 已失效、旧 Run 已中断且没有写权限，`next_action=select_goal` → 原执行者若继续 report，收到“租约已过期，不要重绑；重新 select”这一确定恢复动作 → 新领取原子接管，不留下 started 孤儿记录。

### 9. 最小修复范围

已修改 Contract 的时间派生展示、`reportRun`/`releaseClaim` 的租约有效性屏障和结构化错误，并沿用 `selectGoal` 现有的原子接管。只读 Contract 把已超时但尚未物化的记录投影为 `expired/abandoned`，不写事件；第一次 lifecycle 写入按真实 `expires_at` 物化且只生成一组事件。首版没有增加后台 timer、删除历史记录、自动续租或改变默认 lease 时长。回滚可恢复旧惰性物化逻辑，不需要数据迁移。

### 10. 验收边界

- **工程验证**：可控时钟回归先复现 Contract 明细 `active/started` 与租约外 `reportRun` 可成功；修复后验证 Contract 只读投影、report/release 结构化恢复、`expired/abandoned` 只物化一次、结束时间取真实 `expires_at`、另一 Runtime 可重新 select。V1 回归 80/80 与 TypeScript 检查通过。
- **产品实操**：`UNVERIFIED`。需在最终安装产物中用短 lease 的真实 Goal 覆盖“自然过期后读取、旧执行者上报、另一执行者接管”，确认消费者无需猜测或询问用户。
- **Owner 最终验收**：未通过。需依据最终安装包的实际恢复路径验收；工程回归不能代替产品实操。

---

## GB-20260829-09：`repo:` 项目内 Evidence 被降级且没有可修正格式

**来源**：CGS G2B 主线消费者反馈 7
**Bug 确认**：确认是 GoalBoard locator 协议可发现性和恢复提示设计债；不是现有校验器误判
**修复决定**：用户已批准
**修复状态**：v0.1.5 locator 已安装，`repo:` 安装产物冒烟与真实 G2B 已验证 Evidence 读取通过；Codex Skill 待随 GB16 更新，最终验收未完成

### 1. 真实场景

消费者在 Content Growth Studio 的 executor Run 中提交两条真实存在的 Markdown 证据，locator 分别为 `repo:docs/reviews/2026-08-29-g2b-codex-review.md#engineering-verification` 和 `repo:docs/reviews/2026-08-29-g2b-codex-review.md#browser-assisted-product-checks`。GoalBoard 将二者保存为 `UNVERIFIED`，只返回“不透明或外部 locator”，没有告诉消费者应该改成普通相对路径还是 `project://`。

### 2. 事实与归因

源码可确定性复现。当前校验器明确只把普通相对路径、`project://` 和位于 canonical workspace 内的绝对路径当作可验证项目文件；除 HTTP 和 `project://` 外，任何带 URI scheme 的值都会作为不透明 locator 保留。`repo:` 从未被声明为支持格式，因此不是校验器违反当前协议；但 MCP 工具说明只说“预检当前项目内文件与 Markdown anchor”，没有在 `locator` 参数旁列出支持格式，失败结果也没有返回可修正示例。消费者使用常见的 `repo:` 表达具有合理性。主要归因是 GoalBoard 的协议可发现性与恢复设计债，不是 CGS 误用，也不是 workspace 归属错误。

### 3. 现有流程的问题

Evidence 已经不可变地以 UNVERIFIED 写入后，消费者才知道格式不被识别。它需要猜测绝对路径、`file:`、普通相对路径或 `project://`，重新提交一条 Evidence，再调用 correction 替代原记录。一次格式歧义变成两次额外写入和一条永久历史记录；若不修正，Review 又会把真实工程证据当成未验证。

### 4. 设计根因与初衷

GoalBoard 把未知 scheme 当作不透明外部 locator，是为了不调用任意自定义协议、不把 URL 或命令误当成本地文件，也避免路径逃逸。内部使用 `project://` 是为了让存储记录不暴露机器绝对路径并能稳定跟随 workspace。这个安全边界合理；缺口是输入协议没有就近说明，且对可以安全映射到当前项目的 `repo:` 常见别名没有规范化或修正提示。

### 5. 当前影响

影响采用 `repo:<relative-path>#<anchor>` 表达仓库证据的 Runtime；普通相对路径、`project://` 和已修复的项目内绝对路径不受影响。当前已有两条真实 CGS Evidence 被降级，需要 correction 才能恢复验证等级。它不阻断文件存在，也不越权，但会降低验收可信度并污染 Evidence 历史，属于有明确绕行路径的 P2 体验问题。

### 6. 复杂度审查

- **当前必须**：让工具参数直接列出可验证格式；对安全的 `repo:<relative-path>` 给出确定处理——要么作为输入别名校验并统一存成 `project://`，要么在结果中返回机器可读的规范 locator 和 correction 动作。
- **可以延后**：支持更多宿主自定义 scheme、Git commit/blob 定位、跨仓库 Evidence、自动生成永久内容地址。
- **应当删除**：只返回“不透明或外部”而不区分可修正的当前项目别名；让 Runtime 靠试错猜 `file:`、绝对路径或内部协议。

### 7. 修复必要性与优先级

已批准修复，P2。当前虽已有三种安全格式和人工 correction 绕行，不是闭环硬阻塞；但 locator 是验收可信度基础，格式错误只能在写入后发现且 Evidence 不可变，修复收益明确。实现只接受 `repo:` 作为窄输入别名，仍只存 `project://`，没有新增第二套 canonical 协议。

### 8. 修复前后体验差异

- **修复前**：提交 `repo:docs/review.md#checks` → Evidence 被永久写为 UNVERIFIED → 猜格式并重提 → 再 correction 原记录。
- **修复后**：工具参数明确示例；提交安全的 `repo:docs/review.md#checks` → 按当前 canonical workspace 只读校验文件和 anchor → 存为 `project://docs/review.md#checks` 且返回 verified。项目外、逃逸路径和其他未知 scheme 仍不会被调用。

### 9. 最小修复范围

已修改 Evidence locator 的输入规范化、MCP `locator` 字段说明和 Skill 使用说明；仅接受形如 `repo:<安全相对路径>` 的当前项目别名，复用现有 realpath、范围和 Markdown anchor 校验，并统一存成 `project://`。没有支持 `file:`、访问网络、打开其他自定义协议或自动修改历史 Evidence。回滚时移除输入别名即可，已经规范化存储的记录仍是现有合法格式。

### 10. 验收边界

- **工程验证**：回归先复现真实项目内 `repo:` Markdown 被标为 UNVERIFIED，修复后验证文件和 anchor 成功、统一存成 `project://`、`..` 逃逸被拒绝、其他 scheme 保持 UNVERIFIED，并验证 MCP schema 直接提供相对路径、`repo:`、`project://` 和绝对路径示例。目标 V1/MCP 回归、TypeScript、Skill 校验及整仓门禁 263/263 通过。
- **产品实操**：部分通过。安装版 0.1.3 已对真实仓库文件执行 `repo:package.json`，一次规范化为 `project://package.json` 并返回 `verified`。真实 CGS Markdown anchor 的 MCP 提交与 Web 打开旅程仍为 `UNVERIFIED`。
- **Owner 最终验收**：未通过。需在最终安装包中确认真实消费者无需阅读额外文档或试错即可提交可验证 Evidence。

---

## GB-20260829-10：升级后的旧服务配置允许 restart 但无法完成修复

**来源**：v0.1.3 本机升级与安装实操
**Bug 确认**：已确认，属于 GoalBoard Web 服务恢复动作和状态机不一致
**修复决定**：用户已批准，P1 修复
**修复状态**：已合入远端 `main`，包含在 0.1.4 双架构包中；arm64 App、Core 和服务已安装

### 1. 真实场景

用户把 GoalBoard App/Core 从 0.1.2 升级到 0.1.3。新版 `service status` 正确识别旧 LaunchAgent 归属，但因为 plist 的 PATH 仍引用旧 release，返回 `state=needs_repair`。随后执行安装结果中提供的 `service restart --confirm`，命令先完成受控停止和启动，却因 plist 没有被重写而再次得到 `needs_repair`，最终以失败退出。

### 2. 事实与归因

当前机器已稳定复现。0.1.3 安装前旧服务为受管且健康；Core 升级后 `status=needs_repair`；`service restart` 返回 `service.command_failed`，并自动保持原运行状态；不改其他文件而执行 `service install --confirm` 后，plist 与 receipt 被安全更新，服务进入 `running`，LaunchAgent、监听端口和 health PID 一致。源码也显示 `restart` 对 owned 的 `needs_repair` 返回 `ready`，但实现只重载现有 plist，不会写入 expected plist。主要归因是 GoalBoard 服务状态机缺陷，不是第三方进程冲突，也不是用户误用。

### 3. 现有流程的问题

系统先告诉用户“旧配置，可确认修复”，又允许选择一个无法完成该修复的 restart 动作。用户会经历一次可预见的失败，并需要自行猜测 `service install` 才是修复命令；自动化方还可能把失败理解为端口冲突、服务不健康或需要手工编辑 LaunchAgent。

### 4. 设计根因与初衷

`restart` 原本只负责在不改配置的前提下重载受管实例，避免重写或接管未知 LaunchAgent；`install` 才拥有原子写 plist/receipt、失败回滚和重新启动的权限。这一职责分离合理。缺陷是规划层把“owned”误当成 restart 的充分条件，没有把 `needs_repair` 路由到唯一能物化新配置的 install/repair 路径。

### 5. 当前影响

影响升级后 expected plist 发生变化、而旧 LaunchAgent 仍受管运行的用户。本次 0.1.2 → 0.1.3 必现一次；失败会延迟新 Web runtime 生效，但现有回滚保持旧服务运行，不直接损坏数据。熟悉命令的维护者可用 `service install` 绕行，普通用户和自动化消费者缺少确定恢复动作。

### 6. 复杂度审查

- **当前必须**：`needs_repair` 时拒绝无效 restart，并明确返回 `next_action=service_install`；安装/升级结果若检测到运行中的旧配置，直接给出同一规范修复命令。
- **可以延后**：新增独立 `service repair` 命令、无中断双进程切换、LaunchAgent 配置版本迁移框架。
- **应当删除**：把 `needs_repair + owned` 规划为 restart ready；让用户从一次失败中反推真正命令。

### 7. 修复必要性与优先级

已批准修复，P1。它位于每次升级后的服务切换主路径，当前虽有安全绕行且失败可回滚，但自动化必然多走一次错误动作。最小修复只调整动作规划和恢复提示，不新增服务或迁移用户数据。

### 8. 修复前后体验差异

- **修复前**：升级 Core → status 提示 needs_repair → 执行 restart → 可预见失败 → 猜测并改用 install → 服务才切到新版本。
- **修复后**：升级 Core → status 明确旧配置需要物化 → 直接执行一次 service install/repair → 原子更新配置并启动新版本；普通 running 状态下 restart 行为不变。

### 9. 最小修复范围

修改 `planStatus`、service plan 的机器可读恢复动作，以及安装结果中的服务后续指引；补 `needs_repair + restart` 不再进入无效执行、`needs_repair + install` 成功、普通 running restart 不回归的测试。不手工编辑用户 plist，不放宽进程归属检查，不改变端口冲突策略。回滚只恢复旧动作路由。

### 10. 验收边界

- **工程验证**：通过。新增回归先确认旧实现把 `needs_repair + restart` 错误规划为 `ready`；修复后该计划返回 `conflict`、`next_action=service_install`、零 launchctl 修改，随后 `service install` 可恢复为 `running`。普通 running restart、外部端口冲突、失败回滚、安装升级指引均在整仓 264/264 测试与 TypeScript 检查中通过。
- **产品实操**：通过主场景。真实 0.1.3 常驻服务 PID 30070 保持运行时安装 0.1.4 Core，`status` 返回 `needs_repair`；`service restart --json` 一次返回 `status=conflict / next_action=service_install / changes=[]`，PID 未变化。随后一次 `service install --confirm --json` 进入 `running`；新 LaunchAgent PID、4173 监听 PID 和 `/health` PID 均为 37994，plist PATH 已指向 `goalboard-0.1.4/runtime`。真实未知/异 PID 监听者场景仍为 `UNVERIFIED`，对应保护由工程回归覆盖。
- **Owner 最终验收**：通过 GB10 已批准的主闭环。用户不再经历一次必然失败的 restart；正常 restart、未知进程保护和回滚边界没有改变。最终用户主观验收尚未发生，不把 Owner 验收升级为用户验收。

---

## GB-20260829-11：活跃长任务无续租入口，执行中静默过期

**来源**：CGS G2B executor + Grok 实现 + Codex 独立 review 消费者反馈
**Bug 确认**：已确认，属于 GoalBoard 租约续期与剩余时间可见性的设计缺陷；不是 GB08 的过期后展示冲突重复项
**修复决定**：用户已于 2026-08-29 批准修复
**修复状态**：v0.1.5 Core/App 已安装且真实租约提示可见；Codex 实际 Skill 没有续租动作，消费者交付待随 GB16 修复，完整长任务实操未完成

### 1. 真实场景

消费者领取 `cgs-g2b-editorial-decision` 的 executor Claim 后，委托 Grok 实现，再由 Codex 做独立代码和浏览器 review。整个链路一直有编辑、测试和 review 进展，但超过 `resolved_policy.max_lease_seconds=1800` 后，原 Claim 和 Run 因墙上时间到期失去写权限，Available 又把同一 Goal 显示为 `execution_pending`。原 Run 为 `run-b5cc5419-0564-44ca-826b-dd459282179a`。

### 2. 事实与归因

真实 CGS 流程已发生。当前实现只在领取时写一次 `expires_at`；Claim schema 虽保留 `renewed_at`，但 Coordinator、MCP Runtime surface、Skill 和 Web 都没有续租操作，也没有任何代码写入该字段。Skill 要求省略 `lease_seconds` 以采用动态策略，显式值只能缩短，不能超过当前 `max_lease_seconds`。到期后 Available 按规范把 Goal 重新开放，GB08 已让旧 Claim/Run 清楚投影为 expired/abandoned；因此“过期后怎么恢复”已经修复，本卡缺陷是“持续有真实进展的工作在过期前没有续期和预警路径”。主要归因是 GoalBoard 生命周期设计缺口，不是 CGS 误用，也不是代理停工。

### 3. 现有流程的问题

消费者只能在领取时获得一个固定截止时间，之后没有续租、心跳或临近到期的明确动作。长任务在用户可见层仍然持续推进，GoalBoard 却会静默撤销原 Run 的写权限。为了继续登记 Evidence 和 Review，消费者必须重新领取并创建新 Run；实现产出属于旧 Run，验收记录属于新 Run，连续性被人为切断。更认真地做独立 review 反而更容易跨过租约，形成“执行越完整，历史越割裂”的反向激励。

### 4. 设计根因与初衷

有限租约用于防止 Runtime 崩溃、Session 消失或任务被遗弃后永久占住 Goal，也用于限制多个执行者长期争夺同一写面；默认上限避免消费者通过一次超长 Claim 绕过失活恢复。这一安全边界合理。缺陷是系统只实现了“到期释放”，没有实现租约模型的另一半——原领取者以可审计的活跃信号续期，也没有在 Contract/UI/Runtime 中把剩余时间转成恢复动作。数据库中的 `renewed_at` 表明数据模型已为续期留位，但产品闭环没有完成。

### 5. 当前影响

影响任何超过 30 分钟的实现、构建、委托和独立 review 链路；对需要真实浏览器验收、跨代理协作或慢测试的 Goal 并非罕见边缘情况。到期不会直接丢失仓库产物或已提交 Evidence，但会阻断原 Run 的后续写入、把同一项工作重新显示为待执行，并强迫产生额外 Claim/Run。它不阻断用新 Run 绕行的最终闭环，却降低归属可追溯性并增加重复领取风险。

### 6. 复杂度审查

- **当前必须**：增加仅限原 actor、仅对仍 active 且未过期 Claim 生效的幂等续租；每次续期仍受 Claim 已解析策略约束并记录事件；Contract/Runtime 至少返回剩余时间和临近到期的 `next_action=renew_claim`；Skill 在长耗时委托、构建或 review 的进度检查点调用续租。过期后仍不得复活旧 Claim。
- **可以延后**：后台守护进程自动心跳、根据任务类型预测租期、跨 Runtime 的 Claim 转交、把多个 Run 自动拼成一个逻辑 Run。
- **应当删除**：单纯提高默认 1800 秒来掩盖问题；让消费者预先猜一个更长租期；用重新 `select_goal` 悄悄替代仍有效的 Claim 或把已过期 Run 复活。

### 7. 修复必要性与优先级

批准修复，P1。它已经在正常的高质量执行路径中发生，并直接损害 Claim/Run 作为工作归属和审计边界的可信度。已采用显式、owner-only、可审计的续租和到期前提示，没有新增常驻心跳服务，也未放宽过期后的写权限。

### 8. 修复前后体验差异

- **修复前**：领取 Goal → 持续实现和 review → 无提示跨过 30 分钟 → Goal 再次显示待执行 → 重新领取并产生新 Run → 产出与验收历史分裂。
- **修复后**：领取 Goal → Contract/UI 显示剩余租期 → 长耗时步骤的原 Runtime 在进度检查点执行一次续租 → 同一 Claim/Run 继续承载实现、Evidence 和 Review；若真的失联并过期，仍沿 GB08 的确定恢复路径创建新 Run。

### 9. 最小修复范围

新增 Claim 续租输入/结果、Coordinator 原子校验与 `claim.renewed` 事件、Runtime MCP 工具和 Skill 路由，并在 Contract/Web 的 active work 中显示剩余时间与临期动作。复用现有 `renewed_at` 字段，不改默认 `max_lease_seconds`，不新增数据库真相模型，不做自动后台心跳，不允许换 actor、过期复活或超过已解析策略的单次续期。兼容方式是纯新增 API 和展示字段；回滚后旧客户端仍按原 `expires_at` 工作。

### 10. 验收边界

- **工程验证**：通过本卡定向验证。原 actor 到期前续租保持同一 Claim/Run，`expires_at/renewed_at` 与单一 `claim.renewed` 事件一致，幂等重放不重复写；他人、超策略、过期和释放后续租均被拒绝；Contract 返回剩余秒数、临期窗口和 `next_action=renew_claim`；MCP schema、Skill 与 Web 提示均有回归覆盖；仓库现成 `tsc --noEmit` 通过。分文件回归为 MCP 29/29、Web 38/39、V1 81/83；剩余 3 项均在使用当前 Runtime 已移除的静态 `databasePath/boardId` Server 测试夹具时得到 `SQLITE_CANTOPEN`，与本卡新增续租路径无调用交集，未据此宣称全仓绿灯。
- **安装验证**：v0.1.5 全仓测试在正常文件系统权限下 273/273 通过；GitHub Actions `33256824008` 从 `main@97b971e` 生成 arm64/x64 DMG 与 App ZIP，四个主产物均通过自带 SHA-256 校验。本机已安装云构建 arm64 App 与 0.1.5 Core，修复自有 LaunchAgent 后 `service status=running`、`/health` 正常、根页面 HTTP 200。此层只证明最终二进制与服务已安装并可启动，不代替长任务产品旅程。
- **产品实操**：问题已在真实 G2B 长链路中复现；续租后的同 Run 连续执行、临期提示和掉线后过期恢复均为 `UNVERIFIED`。
- **Owner 最终验收**：未通过。仍需在最终安装产物中，用超过原 30 分钟窗口或可控时钟的完整实现 + review 旅程验证一次；用户本人是否认为提示时机和续租频率不打扰，仍需用户验收。

---

## GB-20260829-12：Runtime 反复领取只剩人工判断的复核

**来源**：CGS G2B self_verifier 消费者反馈；Review `review-ad251867-5c49-4fab-8806-f98fcb9a3d93`
**Bug 确认**：已确认，属于 GoalBoard Review obligation 条件路由与人工等待状态缺陷；不是 CGS 误用，也不是 `inconclusive` verdict 本身的缺陷
**修复决定**：用户已于 2026-08-29 批准修复
**修复状态**：v0.1.5 Core/App 已安装；真实 G2B 历史数据仍处于一次显式 Runtime 复核之前，Codex Skill 又不认识 `waiting_for_human`，消费者接棒待随 GB16 修复，产品实操未完成

### 1. 真实场景

`cgs-g2b-editorial-decision` 的同一个 self_verifier obligation 同时覆盖工程检查条件 `cgs-g2b-handoff-trace` 和只能由王一骏本人决定的 `human_decision` 条件 `cgs-g2b-owner-decision`。Runtime 已确认工程与浏览器证据通过，因此提交 `inconclusive`，明确只剩真实 SELECT/DEFER/REJECT、本人直输和视觉验收；Run 完成、Claim 释放后，Explain 仍返回 `ready=true`，Available 又把同一 self_verifier 列为 `review_pending`。

### 2. 事实与归因

源码可以确定性解释并复现这条路径。`ensureReviewObligations` 会把 Goal 的全部 acceptance criterion ID 原样写进每一种 Review obligation，不区分 `decision_method`；只有独立的 `policy.human_approval=true` 才会创建 `human_approver` obligation，存在 `human_decision` criterion 本身不会创建人工门禁。`inconclusive` 按现有状态机不会满足 obligation，Explain 又只检查同角色是否仍有 pending obligation，不读取 criterion 的决策主体，也不解析上一次 reasoning，于是继续返回 ready。主要归因是 GoalBoard 的 obligation 路由与工作状态派生缺陷，不是 CGS 接入问题。保留 `inconclusive` 的可重试语义属于预期行为。

### 3. 现有流程的问题

Runtime 已完成所有自己有权完成的复核，却没有一个规范动作可以把工作交还给用户。它只能再次领取同一 self_verifier、再次得出 `inconclusive`、再次释放，或者依赖自身记住并解释上一条自由文本 reasoning 后擅自停止。界面仍显示普通“待复核”，既没有指出唯一剩余项由谁完成，也没有给出用户入口，导致自动化循环和用户困惑。

### 4. 设计根因与初衷

原设计用统一 obligation 覆盖整组验收条件，目的是让一次 Review 对完整 Goal 负责，避免复核者只挑容易的条件通过；`inconclusive` 不关闭 obligation，则是为了在证据不足时保留后续补证和重新检查的路径。`human_approval` 另设开关，用于只在明确要求时保留用户最终确认权。这些初衷合理。缺陷是“检查完整性”和“判断权限”没有同时建模：统一 scope 把 Runtime 可检查项与人类专属决定绑定给同一 Runtime 角色，而 `human_decision` 与 `human_approval` 两套表达又没有建立派生关系。

### 5. 当前影响

影响所有同时包含 Runtime 可判定 criterion 和 `human_decision` criterion、且开启自检或独立复核的叶子 Goal。此类 Goal 在工程复核完成后仍会持续出现在 Runtime 的可领取队列，产生重复 Claim、Run 和 Review 记录，并掩盖真正的用户待办。本次已在真实 G2B 闭环发生，直接阻断从工程复核自然转入 Owner 验收；不影响已有工程产物，但会污染审计历史并削弱“谁有权完成哪条验收”的可信度。

### 6. 复杂度审查

- **当前必须**：按 `decision_method` 分离 Runtime 可复核条件与 `human_decision` 条件；当 Runtime 部分已经结束而只剩人工条件时，不再向 Runtime 暴露同一 Review action，并返回结构化的人工等待原因、待办条件和用户入口。历史混合 obligation 需要在读取或物化时兼容收敛，不能要求重建 Goal。
- **可以延后**：独立的人工任务通知中心、多人审批编排、按 criterion 提交不同 verdict、超时催办和自然语言 reasoning 分类。
- **应当删除**：让 Runtime 通过反复 `inconclusive` 表达“我无权判断”；解析自由文本 reasoning 来猜是否只剩人工验收；把用户真实操作自动判成通过或允许 Runtime 代替用户提交 human approval。

### 7. 修复必要性与优先级

已批准修复，P1。它不是文案瑕疵，而是责任边界被错误路由后形成的稳定无效循环，并阻断人类拥有最终决定权的正常闭环。修复依赖结构化的 criterion `decision_method` 和既有用户权限，没有语义分析 reasoning，也没有新增通用工作流引擎。

### 8. 修复前后体验差异

- **修复前**：Runtime 复核工程项 → 因人工项提交 `inconclusive` → 释放 → Available 再次显示同一 self_verifier 可领取 → 重复复核，用户看不到自己才是下一位行动者。
- **修复后**：Runtime 只复核自己有权判断的条件并完成该部分 → Goal 明确显示“等待用户验收”，列出 SELECT/DEFER/REJECT、直输和视觉验收等剩余条件 → Available 不再给 Runtime 返回该 self_verifier action → 用户从 Web/管理入口提交真实决定后，Goal 才进入完成判定。

### 9. 最小修复范围

修改 Review obligation 的 criterion scope 派生、Goal 工作状态与 Available/Explain 的动作路由，并补 Web/MCP/Skill 的人工等待文案和入口说明。复用现有 `human_approver` 权限防线，新增 `waiting_for_human` 工作状态；对外返回机器可读的 `review.user_approval_required`、具体 `criterion_ids`、`obligation_ids` 和 `next_action=open_goalboard`。不解析 reasoning，不自动通过人工条件，不改变普通 `inconclusive` 对 Runtime 可判定条件的重试语义。历史混合 obligation 在下一次安全的 Review 领取点幂等拆分；旧 `inconclusive` 不能从自由文本安全推断为 pass，因此历史数据可能需要一次显式 Runtime 复核后才进入人工等待。不删除既有 Review 记录，回滚不需要还原用户数据。

### 10. 验收边界

- **工程验证**：通过。混合 inspection + `human_decision` Goal 会生成分离的 Runtime 与 `human_approver` obligation；Runtime 部分通过后派生 `waiting_for_human`，Available 不再提供 Runtime Review action，Blocked/Explain 返回 `review.user_approval_required`、criterion、obligation 和 `open_goalboard`；只有 Human Review 而缺少 human-verdict Evidence 时仍等待，两者齐备才进入 `completion_pending`。纯 Runtime criterion 的 `inconclusive` 仍可重试；历史混合 obligation 会在下一次安全选择时拆分。完整回归为 V1 86/86、MCP 29/29、Web 39/39，TypeScript 和 `git diff --check` 通过。受限沙箱的临时目录曾使 MCP/Web 夹具出现位置漂移的 `SQLITE_CANTOPEN`，相同命令在正常文件系统环境全绿，确认不是本卡代码回归。
- **安装验证**：v0.1.5 全仓测试在正常文件系统权限下 273/273 通过；GitHub Actions `33256824008` 的双架构产物与 SHA-256 已复核，本机 0.1.5 App、Core 和 owned Web service 已安装并健康。尚未用真实 mixed Review Goal 完成人工接棒旅程。
- **产品实操**：真实 G2B 已复现修复前循环；修复后的 Web 人工待办、Runtime 停止领取、用户提交真实决定并回到完成判定均为 `UNVERIFIED`。
- **Owner 最终验收**：未通过。仍需在最终安装产物中用真实 G2B Goal 走完“工程复核结束 → 明确等待王一骏 → 本人操作与验收 → Goal 完成”，并确认不会新增重复 Claim、Run 或 Review。用户本人是否认可文案和入口也仍属于用户验收。

---

## GB-20260829-13：Opportunity 有引用但看不到研究过程与样本漏斗

**来源**：CGS 选题编辑台消费者反馈
**Bug 确认**：确认存在可复现的产品体验问题；主要归因是 CGS 的领域模型与编辑台设计债、GoalBoard 接入层信息缺失，不是 GoalBoard Core 缺陷
**修复决定**：已批准纳入 bugfix；GoalBoard 侧只记录归因与边界，实际产品修复应在 CGS 完成
**修复状态**：GoalBoard 归因与卡片已完成；CGS 源码修复未开始，工程验证、产品实操与最终验收均未完成

### 1. 真实场景

用户在 CGS 选题编辑台查看一个 Opportunity，能读到事实、推断、反证、来源链接和粗略来源边界，却无法知道这轮研究使用了哪些查询词、经过哪些检索渠道、看过和淘汰了多少结果、哪些渠道没有覆盖，以及眼前的来源是从较大候选池中筛出，还是研究者只看了这些页面。正式研究候选、团队输入与 Owner 直输因此容易被理解成相同强度的市场研究。

### 2. 事实与归因

当前实现可以稳定复现。GoalBoard Core 的 `EvidenceRecord` 只保存证据种类、定位符、验证状态、摘要、结果、生产者和关联验收条件等跨领域字段；它没有、也不应内置内容研究专用的查询日志和样本漏斗。CGS 的 `OpportunityV1` 已区分 `OPEN_RESEARCH`、`TEAM_INPUT` 与 `SEMI_DIRECTED`，Open Research 也保存时间窗、检索时间、采样表面和 coverage limits，但没有结构化保存查询词、渠道级结果数、筛除数和未覆盖渠道；编辑台详情页甚至没有展示已经存在的 `sourceContext`。主要归因因此是 CGS 领域模型与 UI 设计债，并伴随 GoalBoard 接入层没有把领域证据展开给用户；不是用户误用，也不是 GoalBoard 通用 Evidence 模型缺字段。

### 3. 现有流程的问题

用户若要判断研究是否充分，只能从少量引用和一段自由文本边界反推研究过程，或离开编辑台追问执行者。流程没有明确增加一个按钮点击，而是缺少一个关键判断层：引用的“存在”被视觉上提升为研究覆盖度的“充分”，用户无法发现选择偏差、复现搜索或从缺口处继续研究。

### 4. 设计根因与初衷

GoalBoard 将 Evidence 设计成跨项目的验收与追溯容器，初衷是让不同领域用统一生命周期登记可核验产物，避免 Core 被内容研究、代码测试或运营数据各自的专用字段绑死。CGS 则把 Opportunity 设计成精炼的决策卡，优先展示事实、判断和行动，避免编辑台被研究日志淹没。这两个初衷都合理；缺陷在于 CGS 只收敛了阅读表面，没有保留和渐进展示支撑结论所需的研究过程，导致“简洁”变成“证据强度不可辨认”。

### 5. 当前影响

影响所有需要凭 Opportunity 做 SELECT / DEFER / REJECT 的 Owner、复核者和后续研究者，尤其影响 `OPEN_RESEARCH` 候选。它不会直接破坏数据或发布内容，但会降低选题决定的可信度，阻断研究复现与接续，并可能让普通输入被误判为已充分搜索的市场机会。该问题已在真实 CGS 编辑台阅读中出现，频率随研究候选数量增加而增加。

### 6. 复杂度审查

- **当前必须**：在 CGS 的 Open Research 来源上下文中结构化保存查询词、渠道、搜索时间、可获得的结果浏览/保留/淘汰数量和明确覆盖缺口；编辑台以默认折叠的“研究过程”渐进展示这些信息；候选类型继续显著区分正式研究、团队输入与 Owner 直输；未知数量必须显示为“未记录”，不能伪造精确值。
- **可以延后**：逐条结果的完整淘汰理由、跨轮次差异比较、研究日志导出、自动覆盖评分、渠道排行榜和查询效果分析。
- **应当删除**：在 GoalBoard Core 新建通用研究数据库、爬虫或渠道适配层；为了显得严谨而要求所有渠道都有数字；用一个不透明的综合分数替代查询、覆盖和缺口事实。

### 7. 修复必要性与优先级

需要修复，CGS 侧 P1；GoalBoard Core 不改。它直接影响用户是否能对 Opportunity 的来源强度作出正确判断，并影响长期证据链是否可复现。最小修复可以沿用 CGS 现有 `sourceContext` 与编辑台详情页完成，不需要扩大成跨领域基础设施。

### 8. 修复前后体验差异

- **修复前**：用户看到若干引用和结论 → 无法判断搜索范围与筛选过程 → 只能把“有来源”当作“研究充分”，或离开编辑台追问。
- **修复后**：用户先看到同样精炼的 Opportunity 摘要 → 需要判断可信度时展开“研究过程” → 看到查询词、渠道、时间窗、结果漏斗和明确缺口 → 知道哪些结论来自正式检索、哪些只是团队或 Owner 输入，并能从缺口处继续研究。

### 9. 最小修复范围

只修改 CGS 的 Open Research 数据契约、样本/写入校验和 Opportunity 详情展示：在现有 `sourceContext` 下新增可选且可向后兼容的结构化研究过程，默认折叠展示；旧数据缺字段时明确显示“未记录查询过程”，不补写猜测数据。TEAM_INPUT 与 Owner 直输继续使用各自来源类型，不强行填写搜索漏斗。GoalBoard 的 Evidence schema、Review 状态机和通用 Web 证据卡均不改。回滚时可隐藏新增面板并停止写入可选字段，旧数据仍可读取。

### 10. 验收边界

- **工程验证**：本轮只完成 GoalBoard 与 CGS 源码的只读归因核对；尚无 CGS 代码改动、测试或数据迁移，因此不能报告工程验证通过。
- **产品实操**：已通过当前 CGS 详情页实现与真实代表样本确认修复前的问题存在；修复后的折叠层级、旧数据提示、候选类型区分和研究接续旅程均为 `UNVERIFIED`。
- **Owner 最终验收**：未通过。需 CGS 实现后，由 Owner 用正式研究候选、团队输入和本人直输各一条实操，确认首屏仍简洁、展开后足以判断覆盖度和选择偏差，且不会把“未记录”误呈现为零。

---

## GB-20260829-14：Goal Tree 提案 payload 需要查源码才能构造

**来源**：Arena Goal Tree 拆分消费者反馈
**Bug 确认**：已确认，属于 GoalBoard MCP 工具契约自描述缺陷；不是 Arena 接入误用
**修复决定**：已批准修复
**修复状态**：已包含在 v0.1.5 Preview 并安装到本机 App、Core 与常驻服务；Arena 产品实操与 Owner 最终验收待完成

### 1. 真实场景

Arena 的 clarifier 已把一个 Root Draft 澄清成 7 个一级 Draft Goal，准备通过 `goalboard_v1_goal_tree_propose` 提交整棵待确认树。工具声明只告诉它 item 有 `kind`、`operation` 和任意对象 `payload`，没有说明 goal、relation、dependency 等 kind 的字段、枚举、最小格式和方向。为了不把父子或依赖接反，消费者只能离开 MCP 契约去读 GoalBoard TypeScript 源码。

### 2. 事实与归因

可稳定复现。修复前 `GOAL_TREE_ITEM.payload` 只有 `type=object` 和 Risk 的一段说明，TypeScript 输入也只是 `Record<string, unknown>`；`kind` 枚举虽然完整，却没有与 payload 形成可判别约束。`part_of` 和 `depends_on` 的真实方向只存在于 Coordinator、规划校验和测试里。缺字段的 relation/dependency 还能越过提交入口，被保存为 pending Proposal，直到后续 check/decision/materialization 才可能报“需要起点、终点和类型”。主要归因是 GoalBoard MCP 契约缺陷，而不是 Agent 理解能力、Arena 接入或用户误用。

### 3. 现有流程的问题

基础拆树需要额外执行“定位 GoalBoard 仓库 → 搜索 materializer/测试 → 推断 canonical payload → 返回 Arena 提交”，把实现源码变成隐藏文档。若消费者不查源码，最危险的结果不是立即失败，而是字段形式合法、领域语义错误：例如把 `part_of` 写成父到子，或把 `depends_on` 写成提供者到消费者。缺字段条目进入用户待确认队列还会把本应由机器提前指出的格式错误转嫁给用户决定阶段。

### 4. 设计根因与初衷

统一 Goal Tree Proposal 最初使用开放 `payload`，是为了让 goal、contract、relation、risk、policy、candidate、rewire 在一个原子提案中演进，避免每增加一种条目都复制一套工具；宽松读取也能兼容早期直接 payload、嵌套 `goal`、单条 relation 和 `relations[]` 等历史格式。这个兼容目标合理。缺陷是“运行时可宽松读取”同时变成了“对消费者没有规范写法”：服务端没有另外暴露 canonical 写入契约，也没有在用户决定前验证最常见的关系结构。

### 5. 当前影响

影响所有原生 Goal Tree 提案消费者，首次接入、跨仓库 Agent 和只拿到 MCP declaration 的集成方最明显。每次构造新 kind 都可能产生查源码与试错成本；relation/dependency 方向错误会直接改变 Goal 层级、执行顺序和阻塞关系。本次已真实阻断 Arena 提案提交前的自主推进，但尚未写入错误 canonical 关系，数据未受损。

### 6. 复杂度审查

- **当前必须**：为 8 种现有 kind 暴露可判别的 payload schema、字段枚举和最小示例；明确 `part_of` 是子 Goal → 父 Goal，`depends_on` 是消费方/依赖方 Goal → 提供方/前置 Goal；relation/dependency 缺字段时在 Proposal 入队前返回缺失字段、规范示例和方向，不留下 pending 记录。
- **可以延后**：把所有历史宽松格式迁移成唯一存储格式、为每个 operation 建立完全独立的 TypeScript 判别联合、根据 schema 自动生成 Web 表单和外部 SDK。
- **应当删除**：新建第二套 Goal Tree API；要求消费者继续读取源码；为追求 schema 纯度而拒绝读取已有 pending Proposal；把 planning_methods 当成 payload 字典并复制同一份字段事实。

### 7. 修复必要性与优先级

需要修复，P1。该缺陷让 GoalBoard 的主要原生规划入口无法只凭工具契约安全使用，并可能生成方向相反的 canonical 关系。修复直接发生在现有 MCP schema 与 Proposal 入口，不增加数据库、服务或工作流，收益明确且回滚简单。

### 8. 修复前后体验差异

- **修复前**：读取工具 → 只看到 `payload: object` → 查 GoalBoard 源码或猜字段 → 可能先保存坏 Proposal → 到 check/decision 才遇到泛化错误。
- **修复后**：读取工具 → 按 kind 看到对应字段、枚举和最小示例 → 直接确认父子与依赖方向并提交；若漏写 `to_goal_id` 或 `type`，提交立即指出具体缺失字段、给出可复制格式和方向，用户待确认队列保持干净。

### 9. 最小修复范围

只修改 `goalboard_v1_goal_tree_propose` 的 item schema、relation/dependency 提交前校验和对应回归测试。schema 通过 kind 条件分支覆盖 goal、contract、relation、dependency、risk、policy、candidate、rewire，保留现有宽松读取和数据库格式；不改 Proposal 原子性、用户确认边界、materializer、planning_methods 或已有记录。旧客户端按原格式提交仍可工作，只要 relation/dependency 本身完整；回滚只需还原工具声明和前置校验，不涉及数据迁移。

### 10. 验收边界

- **工程验证**：通过。工具列表真实返回 8 个 kind 的条件化 payload schema；Goal schema 暴露最小字段与验收条件，relation/dependency 暴露枚举、示例和双向语义；缺字段 relation/dependency 会在存储前分别返回 `goal_tree_proposal.relation_required` / `goal_tree_proposal.dependency_required`，指出字段与示例，并保证 pending Proposal 数仍为零。定向 MCP + V1 为 116/116，TypeScript 通过；完整回归在正常本地权限下为 271/271。受限环境首次出现的 12 项失败均为临时 SQLite 与 npm 日志不可写，同一代码在正常权限下全绿。
- **安装验证**：v0.1.5 最终全仓回归为 273/273；GitHub Actions `33256824008` 双架构产物及 SHA-256 已复核，本机 0.1.5 App、Core 与 Web service 已安装并健康。当前 Session 不会热加载新 MCP schema，产品实操仍需新开 Session。
- **产品实操**：修复前已由 Arena 消费者真实复现；修复后的新 MCP declaration 是否足以让一个不读源码的新 Session 构造 7 个一级 Draft Goal、父子关系和依赖关系，仍为 `UNVERIFIED`。
- **Owner 最终验收**：未通过。需要打包安装后新开 Session，在 Arena 仅依赖工具声明提交一次整树提案，并由用户检查 Goal Tree 层级与依赖方向；当前 Session 不会热加载这次 schema 变更。

---

## GB-20260829-15：子 Goal 用样本验收却被理解成父级能力已经具备

**来源**：CGS G2 / G2A 产品实操反馈
**Bug 确认**：确认存在严重误导体验；主要归因是 GoalBoard 跨层 Contract 覆盖与 Risk 解决依据的设计债，同时存在 CGS 把能力目标降成样本验收的建模错误；不是 `satisfied` 状态机计算错误
**修复决定**：Owner 已批准 GoalBoard Core 防误导修复；CGS Contract 纠偏仍需在 CGS 项目中单独推进
**修复状态**：GoalBoard Core/App 已包含在 v0.1.5，真实 G2A 防误导文案已在最终 App 可见；Codex 规划 Skill 待随 GB16 更新，新拆树阻断、CGS Contract 纠偏与 Owner 验收未完成

### 1. 真实场景

CGS 父 Goal G2 承诺把开放研究等来源变成可解释的内容机会。子 Goal G2A 却把完成条件收缩成“开放研究、半命题信号、团队输入各有一个结构化样本”，并只把需求、供给缺口、热点和 KOL 关注保存成标签。样本与 schema 测试通过后，G2A 显示 `satisfied`，来源覆盖 Risk 也被更新为 `resolved`；用户进入真实编辑台才发现多源搜索、需求/供给分析、反证覆盖、研究缺口和机会形成过程并不存在，第一步实际只是 demo / contract spike。

### 2. 事实与归因

CGS 当前 README、G2A 合同和代表性扫描都确认首轮目标是三类来源各一个代表性样本，并明确没有登录态平台搜索、账号后台、搜索量和完整供给样本；这与“具备开放研究到可解释机会的能力”不是同一层结果。GoalBoard 当前叶子检查只验证该叶子自己的 promised outputs、验收条件和 Evidence 是否自洽；复合父 Goal 收口只要求通用路径有子 Goal 归属、没有开放子树，之后 `satisfyClosedCompoundGoalIfReady` 只看全部 active child 是否 `satisfied`。系统没有保存“父 promised output / criterion 由哪些子 output / criterion 覆盖、是完整还是部分覆盖”的 canonical 映射。`setRiskState(... resolved ...)` 也只校验合法状态和非空理由，不要求解决证据或剩余缺口。因而 G2A 对它被批准的样本 Contract 来说确实完成，状态机没有算错；错误来自 CGS Contract 语义降级，以及 GoalBoard 未防止这种降级被当成父级能力证据。

### 3. 现有流程的问题

Runtime 可以把父级能力拆成一个名字相近但验收更窄的子 Goal，用户确认时只看到每条 Contract 本身成立，却看不到父承诺被哪些子结果完整覆盖。执行者随后按较窄 Contract 正确交付，GoalBoard 又用绿色 `satisfied` 和 `resolved` 表达局部事实，界面没有明确“只完成样本合同，不代表父能力具备”。错误直到用户操作最终产品才暴露；此时后续编辑台、制作和策略 Goal 已经可能把假机会当成可信输入。

### 4. 设计根因与初衷

GoalBoard 把自然语言 Contract 的含义与取舍交给用户确认，而不是让系统用模型相似度代替人的业务判断；accepted Contract 保持不可静默修改，closed compound 依赖用户确认“这棵树已经拆完整”，所有子项完成后再自动汇总。这能避免系统擅自发明验收语义。Risk 同样采用显式状态加理由，避免自动化替用户宣称风险已消失。初衷合理。缺陷是用户确认前缺少一层结构化责任链：父承诺和父验收没有逐项委托到子结果，Risk 的 resolved 也没有结构化解决依据，因此“人确认语义”退化成“人只能凭标题猜语义”。

### 5. 当前影响

影响所有通过子 Goal 交付父级能力的复杂工作，尤其是研究、数据、AI 评测和运营能力建设。单个叶子可以在工程上完全通过，却让执行者、Owner 和后续 Goal 误以为更高层能力已经建立；这会污染优先级、依赖和决策输入，并把真实缺口推迟到产品实操阶段。本次已在 CGS 真实使用中发生，阻断可信的机会发现闭环。数据记录本身没有损坏，但状态表达与能力事实之间出现了高风险差距。

### 6. 复杂度审查

- **当前必须**：在父 Goal 收口时，要求每个 parent promised output 和 acceptance criterion 显式映射到一个或多个子 Goal 的具体 promised output / criterion，标明完整、部分或仍需集成验收；存在部分或未覆盖项时不能成为 `closed_compound`。该映射必须成为可读取的 canonical 事实，并在父子详情中显示。子 Goal 的绿色状态要写成“本 Goal 按当前 Contract 已满足”，同时展示对父级的覆盖与剩余差距。Risk 进入 `resolved` 时要提供结构化 resolution basis、Evidence 引用和 residual gaps；不能通过解析风险描述自由文本自动判断。
- **可以延后**：对父子自然语言做相似度提醒、跨多层自动汇总覆盖率、历史 Goal 的批量审计、按行业生成能力模板和对未解决风险自动催办。
- **应当删除**：用 LLM / embedding 分数自动裁定子 Contract 是否语义等价；因为父级仍有缺口就否认子 Goal 对其局部 Contract 的真实完成；自动把历史 `satisfied` 或 `resolved` 改回去；把三个样本、标签数量或测试通过数包装成能力覆盖率。

### 7. 修复必要性与优先级

需要修复，P1，Owner 已批准最小数据模型。GoalBoard Core 已阻止新的跨层静默降级并诚实展示局部完成，但不会替 CGS 自动补齐研究能力。CGS 仍应把当前 G2A 明确定性为“Opportunity 合同与代表样本验证”，并把真实多源研究与机会分析补成新的可执行 Goal，或经用户确认重开原 Contract；原 source coverage Risk 若描述的是完整能力，也应重新判断，而不是由本次迁移自动改写。

### 8. 修复前后体验差异

- **修复前**：用户看到 G2A `satisfied`、Risk `resolved` → 自然理解为机会研究能力已完成 → 进入编辑台才发现只有三个样本和标签。
- **修复后**：三个样本仍可被真实标记为“本 Goal Contract 已满足” → 同一页面明确显示它只覆盖父级的合同/样本验证，真实多源搜索、供需判断和机会形成仍是部分或未覆盖 → 父 Goal 不能收口，Risk 若解决依据不足仍保持 open → 用户可以选择补建研究 Goal，或明确缩小父级承诺后再确认。

### 9. 最小修复范围

GoalBoard 侧复用现有 decomposition review，新增 `contract_coverage`：父级每个 promised output / acceptance criterion 必须精确引用后代 Contract 字段，并标记 `complete / partial / integration_required / uncovered`。仅 `complete` 可确认 `closed_compound`；canonical 映射写入 `goals.decomposition_review_json`，父级自动完成和 Work State 都读取同一事实。Contract 新增 `parent_contract_coverage`，Web 在父子详情分别展示覆盖与贡献，并把绿色文案收窄为“本 Goal 按当前 Contract 已满足”。Risk 的新 `resolved` 写入必须携带 `resolution_basis.summary / evidence_refs / residual_gaps`，存入 `risks.resolution_basis_json`；历史缺失只显示“未记录”，不追溯改状态。schema migration 21 只增加两个可空 JSON 字段。未修改 accepted Contract 的不可变边界、Evidence / Review 机制、历史完成事实、CGS 源码，也未引入语义模型或第二套规划系统。回滚可停止使用新字段并恢复旧派生逻辑，已有 JSON 事实保留且无需删除。

### 10. 验收边界

- **工程验证**：通过。TDD 覆盖缺失映射、部分映射、错误后代引用、完整映射持久化、子 Contract 反向投影、部分覆盖的派生阻断和父级自动完成防线；Risk 覆盖直接状态写入、Goal Tree 提案、Web 表单、readback 与历史无依据展示；migration 21 从缺列旧库恢复。`pnpm test` 完成构建、安装包回归及全部 273/273 测试，`pnpm typecheck` 与 `git diff --check` 通过。
- **安装验证**：GitHub Actions `33256824008` 从 `main@97b971e` 构建 v0.1.5 arm64/x64，四个主产物均通过自带 SHA-256；本机云构建 arm64 App 的 bundle 版本为 0.1.5，Core 安装收据指向 `releases/goalboard-0.1.5`，owned LaunchAgent 与 HTTP 健康检查通过。此层不证明 CGS 的父子 Contract 已经完成真实纠偏。
- **产品实操**：修复前的“样本合同通过但真实研究能力不存在”已由 CGS 编辑台实际使用暴露。修复后的 Web HTML、HTTP 写入和 packed-release 自动化链路已覆盖，但尚未在新安装的最终 GoalBoard App 中由真人走完“部分覆盖阻断 → 补全映射 → 父级收口”旅程，因此仍为 `UNVERIFIED`。
- **Owner 最终验收**：未通过。打包安装后需用两条真实旅程验收：样本 spike 完成但父能力保持开放；所有父承诺确由子树覆盖后父级才收口。同时检查 Risk resolved 是否能看懂解决依据与剩余缺口，并由用户确认状态文案不会再把局部工程完成提升为能力完成。

---

## GB-20260829-16：Core/App 已升级但 Codex Skill 仍指向旧 Release

**来源**：用户要求逐卡复核“已经修复”的最终产物后发现
**Bug 确认**：已确认存在交付缺口；主要归因是发布与验收流程漏掉已连接 Runtime 的独立升级步骤，不是 Core 安装器越权失败
**修复决定**：用户已要求本卡修完并继续复核
**修复状态**：发布验收门禁与卡片口径已补齐并通过工程回归；当前 Codex 接入仍待新包发布后按官方预览/确认流程更新，最终新 Session 验收未完成

### 1. 真实场景

v0.1.5 的 GitHub Release、用户级 App、`~/.goalboard` Core 与常驻 Web service 都已更新，台账因此把多张 Runtime 消费体验卡写成“已安装”。但真实 Codex 使用的 `/Users/oreal/.codex/skills/goal-advance` 仍是一个指向 `goalboard-0.1.1` 的受管符号链接。新 Release 里的当前消息项目选择、完成门禁、Evidence locator、Claim 续租和人工等待说明没有进入 Codex 实际 Skill。

### 2. 事实与归因

可稳定复现。安装清单和 App 内嵌 Runtime 是 0.1.5；v0.1.5 Release 中的 `goal-advance/SKILL.md` 包含 `claim_renew` 与 `waiting_for_human`，其 SHA-256 与 Codex 当前 Skill 不同；`readlink` 明确指向 `~/.goalboard/releases/goalboard-0.1.1/skills/goal-advance`。GoalBoard 的“设置 → AI 与执行工具”已经正确把 Codex 显示为“需要修复”，说明领域服务检测没有失效。`goalboard install` 有意只升级本体，不静默改 Runtime 配置或 Skill，因此主要缺陷是本次发布执行与验收把“本体安装”错误提升成“Runtime 消费改进已安装”。

### 3. 现有流程的问题

发布流程验证了 tag、资产、校验和、App、Core 和 Web service，却没有检查每个已连接 Runtime 的集成状态，也没有在用户已经授权安装全部改进后完成“预览修复 → 确认 → 新 Session”这条独立链路。结果是 MCP 进程通过当前 launcher 使用新 Core，而 Agent 仍按旧 Skill 做决定；同一次会话里出现“工具支持新能力、行为说明却不知道如何使用”的混合版本。

### 4. 设计根因与初衷

本体安装与 Runtime 接入被刻意分开，是为了避免升级 App 时静默改写 `~/.codex/config.toml`、替换用户自定义 Skill 或影响其他 Runtime。受管旧链接可以被领域服务识别为 `managed / needs_repair`，未知同名链接则保持 `conflict`。这条授权和回滚边界正确；问题在于发布验收没有把它当作每次 MCP/Skill 变更后的必要交付层，也没有限制“已安装”结论的适用范围。

### 5. 当前影响

直接影响所有依赖 Skill 决策的修复：GB01 的同句项目授权、GB02 的完成门禁动作、GB03/09 的 locator 可发现性、GB06 的安全重试、GB08 的过期恢复、GB11 的续租时机、GB12 的人工接棒和 GB15 的规划覆盖规则。Core 仍能拒绝部分错误写入，但消费者会继续多问、重试、漏续租或走旧恢复路径。当前机器已经真实处于混合版本，因此不是理论风险。

### 6. 复杂度审查

- **当前必须**：把 Runtime 集成状态加入发布后验收；只有 GoalBoard 管理的旧链接经用户预览并确认更新、状态回到 `connected`，再用新 Session 读取当前 Skill 后，才可把 Runtime 相关修复写成“已安装”。本机最终发布后执行同一流程。
- **可以延后**：在所有页面常驻展示 Runtime 版本横幅、跨机器集中升级、自动通知每个旧 Session。
- **应当删除**：仅凭 Core/App/service 版本一致就宣称消费者协议已安装；为了省一步而让本体安装器静默改 Runtime；覆盖未知同名 Skill。

### 7. 修复必要性与优先级

需要修复，P1。它横跨多张已批准的消费者体验卡，并会使修复在包内存在却在真实 Agent 行为中失效。最小修复不改变安全模型，只补齐发布验收、状态口径和一次受管接入更新。

### 8. 修复前后体验差异

- **修复前**：安装新 App/Core → 服务健康 → 宣称所有改进已安装 → 新 Codex 仍读取旧 Skill → 继续重复确认、漏续租或不认识人工等待。
- **修复后**：安装新 App/Core → 设置页明确显示受管 Runtime 是否需要修复 → 用户确认后同时更新 MCP 配置与 Skill 链接 → 新开 Session 加载同一 Release → 只有真实消费链一致后才报告安装完成。

### 9. 最小修复范围

更新中英文安装文档的发布后最终产物门禁，并修正 Bug 台账中“已安装”的分层口径；最终打包安装后，使用现有 `RuntimeIntegrationService` 的预览与确认事务更新 Codex 受管链接，不直接执行 `ln -sfn`，不修改项目绑定，不热刷新旧 Session，不接管 Claude Code/Grok 等当前显示冲突的未知配置。若确认或验证失败，领域服务恢复原配置和 Skill 链接；文档变更可独立回滚。

### 10. 验收边界

- **工程验证**：通过。当前代码无需新增自动修复；安装 15/15、Runtime integration 12/12、Web 41/41 回归覆盖 managed 旧链接更新、未知链接冲突、MCP + Skill 事务验证、失败回滚、设置页检测和 GB05 最终样式门禁，`git diff --check` 通过。Web 测试在受限沙箱内因 SQLite 临时库不可写出现假失败，相同命令在正常本机权限下 41/41 全绿；不把该环境差异记为产品通过。
- **产品实操**：修复前已在最终 v0.1.5 环境确认：设置页显示 Codex“需要修复”，实际 Skill 链接为 0.1.1。修复后的 `connected` 状态、当前 Release 链接和新 Session 行为尚为 `UNVERIFIED`，将在下一版安装后统一实操。
- **Owner 最终验收**：未通过。需要新包安装后逐项确认 App/Core/service/Runtime Skill 同版，并由新 Codex Session 实际读取续租与人工等待规则；旧 Session 继续使用旧清单属于预期边界，不得拿来反证或冒充新版本验收。

---

## GB-20260830-19：桌面健康恢复与 LaunchAgent 修复互相抢占 4173

**来源**：v0.1.6 最终 App 安装后的服务修复实操
**Bug 确认**：已确认，属于 GoalBoard 桌面端恢复策略缺陷；不是第三方进程占用，也不是用户误用
**修复决定**：需要修复，P1
**修复状态**：源码最小修复、工程回归与源码构建 App 实操已完成；正式 Release 安装与 Owner 验收待完成

### 1. 真实场景

用户安装新 GoalBoard App / Core 后，常驻 LaunchAgent 需要原子修复。官方 `service install --confirm` 先卸载旧实例，再启动并核验新实例；与此同时已打开的桌面 App 每两秒检查一次 4173。切换期间端口短暂不可用，App 在约四秒后自行启动一个 Web 子进程，先占住 4173，导致 LaunchAgent 的新进程无法通过身份健康检查。用户最终看到的是“4173 的监听者无法证明属于当前 GoalBoard LaunchAgent”，但监听者实际上仍是 GoalBoard 自己启动的进程。

### 2. 事实与归因

已在 v0.1.6 最终安装环境真实复现。`lsof`、父子进程和 `/health` 都表明监听者来自 GoalBoard 桌面 App；`launchctl` 的受管 PID 与 HTTP 返回 PID 不一致，且不存在第三方占用。源码确认服务安装最多需要经过旧实例卸载、新实例启动、稳定性核验和失败回滚，而桌面健康监控对所有故障统一使用两次失败阈值。根因是两个 GoalBoard 自有恢复者缺少切换宽限，不是 service ownership 识别规则本身误判。

### 3. 现有流程的问题

用户按官方入口修复服务，却会得到一个貌似需要手工处理的端口冲突。继续重试会重复失败；按错误字面去终止“占用者”又可能误伤正在提供界面的桌面子进程。发布者还需要额外核对 PID、父进程、LaunchAgent 和 HTTP 身份，才能确认这不是外部冲突，正常升级闭环因此被卡住。

### 4. 设计根因与初衷

桌面 App 的自恢复初衷是：Web 子进程意外退出时快速恢复界面，避免用户只看到白屏。LaunchAgent 的严格 PID / 健康身份核验初衷是：不接管第三方监听者，也不把错误进程冒充为受管服务。两条防线都合理；缺陷是桌面端没有区分“自己拥有的子进程刚崩溃”和“外部受管服务正在合法切换”，把同一个四秒阈值用在两个时长与责任边界不同的场景。

### 5. 当前影响

影响在 App 打开期间执行 Core / service 升级、修复或重启的用户，尤其是发布安装后的标准恢复路径。它可以让健康的 GoalBoard 进程被误报为第三方冲突，并使 LaunchAgent 修复和回滚均无法重新占用端口；最终 App 仍可能临时可用，但常驻服务、Runtime 接入与下一次开机恢复无法完成，属于发布闭环阻断，不只是多等一步。

### 6. 复杂度审查

- **当前必须**：保留桌面自有 Web 子进程约四秒的快速恢复；当桌面端没有自有子进程、4173 原本由受管服务负责时，把 fallback 宽限扩大到约二十秒，让 LaunchAgent 的安装、身份稳定检查与回滚先完成。
- **可以延后**：桌面 App 与 CLI 之间的跨进程维护锁、显式 maintenance 状态、多个 App 实例的统一 supervisor 协议和可视化服务切换进度。
- **应当删除**：所有 Web 故障一律两次探测后抢占端口；把 GoalBoard 自有 fallback 进程继续描述成第三方冲突；为本问题新增另一套后台服务。

### 7. 修复必要性与优先级

需要修复，P1。它阻断官方升级 / 修复链路，并会把 GoalBoard 自己制造的竞争呈现成用户需要处理的外部冲突。最小修复只调整已有健康监控的分支阈值，不改变端口、LaunchAgent、安装事务或 ownership 安全边界。

### 8. 修复前后体验差异

- **修复前**：用户安装或修复服务 → LaunchAgent 切换时端口短暂空闲 → App 四秒后抢占 4173 → 官方修复失败并显示冲突 → 用户需要猜该重试、退出 App 还是杀进程。
- **修复后**：用户安装或修复服务 → App 在受管服务切换窗口内保持等待 → LaunchAgent 完成启动与 PID 健康核验 → 页面自动恢复；只有受管服务持续不可用约二十秒后，App 才启动 fallback 保住界面。若 App 自己启动的子进程崩溃，仍在约四秒内恢复。

### 9. 最小修复范围

只修改 Tauri 桌面健康监控：读取已有 `owned_child` 状态，为 App 自有子进程和外部受管服务选择不同失败阈值，并补边界单元测试。读取锁在调用恢复逻辑前释放，不跨进程、不写新状态、不放宽 service PID 身份检查，也不改变首次启动时的立即 bootstrap。回滚只需恢复单一阈值，不涉及数据迁移或 LaunchAgent 配置变化。

### 10. 验收边界

- **工程验证**：通过。TDD 边界覆盖 App 自有子进程在第 2 次失败恢复，受管服务在第 9 次失败仍不抢占、第 10 次才 fallback；Rust 11/11、TypeScript、全仓 275/275、macOS arm64 App / DMG 构建与 `git diff --check` 通过。受限沙箱中的 16 项首次失败均由临时 SQLite / npm 日志目录不可写导致，相同代码在正常本机权限下全绿。`cargo clippy -D warnings` 仍会被本卡范围外既有的两个桌面代码风格告警拦截，本卡没有把它们伪装成回归通过，也没有混入无关清理。
- **产品实操**：源码构建 App 已通过原始失败路径。先加载真实旧受管 LaunchAgent，再保持修正版 App 打开执行官方 `service install --confirm`；修复在约 6.6 秒完成，LaunchAgent PID、4173 监听 PID 与 `/health` PID 均为 26281，App 没有生成竞争子进程。随后停止受管服务，App 经过扩大后的宽限才启动自有 fallback；定点终止该子进程 26444 后，新子进程 26623 由同一 App 重新启动并恢复健康。测试结束后已正常退出 App并用官方 `service start --confirm` 恢复 LaunchAgent。以上证明源码构建产物通过，不等于正式 Release 已安装。
- **Owner 最终验收**：未通过。需把修复打入新的最终 App，保持 App 打开执行一次官方 service 修复，确认没有抢占、错误冲突或白屏；再模拟 App 自有子进程退出，确认快速 fallback 没被本次宽限拖慢。

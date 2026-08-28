# 运行时协议：核心概念、Goal Contract 与工作流

## 核心概念

| 概念 | 一句话说明 |
| --- | --- |
| Goal | 最小可执行目标，和 Task 同一粒度，必须有可观察或可量化的验收条件 |
| Goal Tree | 用户确认后的目标拆解结构，Plan 和看板都是它的派生视图 |
| 依赖 | 已确认的前置关系，是领取和完成的硬门禁 |
| Risk | 可能阻碍领取或完成的风险，需要人决定处理方式 |
| Claim | Runtime 对某个 Goal 的带时限占用，不是任务分配 |
| Run | 一次执行、复核或重新验证过程 |
| Evidence | 对应验收条件的证据（测试、检查、人工确认等） |
| Review | 自检、交叉或对抗性复核，通过后才算完成 |
| Candidate | 执行中发现的新工作，只能由用户决定是否接受 |
| Rewire | 用户确认后的目标关系重排 |

普通 Runtime 只能读取、选择、认领、执行、提交提案和证据，不能自行裁决 canonical Goal；所有推断和建议在用户确认前都不是权威事实。

## Goal Contract

用户可以在当前 Runtime 提出一个粗略想法；GoalBoard Skill 用 MCP 创建只有标题的 `draft / abstract` Goal。clarifier Runtime 读取项目事实并逐步提出 Outcome、Why、非技术业务逻辑、范围、输入输出、验收、依赖、风险和 Review Policy 的补全建议；这些建议只有在用户确认后才成为 accepted Contract。

最小可执行 Goal 与 Task 是同一粒度：结果在 Goal 内闭环，并且有可观察或可量化的验收条件。例如“设计用户 Domain，并提供可测试的增删改查方法”可以是一个叶子 Goal；“把账号系统做好”仍需继续拆分。

accepted Contract 不原地改版本。后续新需求创建新的 Candidate Goal，由用户分别决定是否接受新 Goal、是否确认 Rewire。

## Runtime 工作流

统一 GoalBoard Skill 被用户调用后，先解析可选 Session ID 与当前 workspace：同一 Session 已绑定时恢复连接；否则把该目录以前明确用过的项目作为候选。目录和候选本身永远不会自动授权连接，即使只有一个候选；但若当前用户消息已经明确要求用 GoalBoard 连接或推进一个已命名项目，且返回的现有项目中只有一个无歧义匹配，Skill 会直接调用 `context-bind`，不要求用户重复选择。其他情况才在当前对话询问。有 Session ID 时保存本 Session 选择，没有时只记录 workspace 历史并让当前 MCP 调用流继续。把项目设为目录默认是另一项明确决定，只有传入 `binding_scope=workspace_default` 后，新 Session 才自动恢复。新建、候选拒绝、切换、Session 解绑、workspace 解除关联和项目删除都有各自的确认。项目删除仍先保护有效 Claim 和未结束 Run。这个解析不会在 Runtime 启动或普通对话时后台发生。

Skill 的正常回复先用用户当前语言说明“我理解了什么、为什么还要确认这一点、接下来只问或做什么”，不会把 MCP 工具名和内部 ID 当作回答。新想法、已有 Draft 恢复和方向变化会显示可修改的结构化 checkpoint，明确区分用户已确认事实、可查项目事实、Runtime 假设和建议；每个实质回答先写入 dialogue turn，再继续下一问。提案就绪时用可读 Goal Tree 汇总结果、非目标、关系依赖、叶子验收、风险和确认后的状态，用户可以整份决定或点名修改条目。

项目连接明确后，当前 Runtime 再读取 `available` 和所选 Goal 的 Contract，并自己决定是否选择其中一项。GoalBoard 不返回“唯一下一份”；Claim 是带时限的占用，不是任务分配。

```text
new rough idea:
  draft-dialogue-start → 当前 Runtime 自然语言澄清
  → 每次实质回答 draft-dialogue-turn → proposal_summary
  → goal-tree-propose / read / check → 当前 Runtime 与用户对话决定条目 → goal-tree-decide

existing Draft:
  contract → 有保存的澄清会话则 draft-dialogue-resume
  → 否则 draft-dialogue-start(goal_id) 复用该 Draft 并开始当前对话澄清
  → proposal / 用户确认 → run-report → release

executor:
  available(next_action=execute) → contract → select-goal → 实现与验证
  → run-report → evidence-submit → review-submit → complete → release

reviewer:
  available(next_action=review) → contract → select-goal
  → review-submit → run-report → release

revalidator:
  available(next_action=revalidate) → contract → select-goal
  → 核对 Contract、active dependencies、Risks 和证据
  → revalidate → run-report → release

direct completion:
  available(next_action=complete, role=null) → complete
  → 不再 select-goal，不创建新的 Claim、Run 或重复 Evidence

completion blocker:
  available.blocked(work_state=completion_blocked) → 报告具体完成门禁及恢复条件
  → 门禁被 canonical 地解除后重新读取 available，再直接 complete
```

`select-goal` 在同一个 SQLite 事务中创建 Claim 和 Run；失败不会留下只有 Claim、没有 Run 的假“进行中”。正常 Runtime 工作流使用 `available` 与 `select-goal`；`next_action=complete` 是无需 Claim 的例外，直接调用 `complete`。已完成执行但被完成门禁阻止的 Goal 进入 `available.blocked`，不会再次显示成 `execute`。`ready`、`claim` 和 `run-start` 只用于低层管理或测试场景。

对于新想法，Runtime 不必让用户先打开 Web 或逐字段填写 Contract：`draft-dialogue-start` 在一个事务中创建最小 `draft / abstract` Goal、clarifier Claim 和 Run，随后当前对话每产生一次实质澄清进展就调用 `draft-dialogue-turn` 保存用户回答、当前理解、来源事实、假设和唯一下一问；Session 中断后用 `draft-dialogue-resume` 恢复。澄清完成时，当前 Runtime 用 `goal-tree-propose` 一次提交整份可确认的拆分／变更方案，并可通过 `goal-tree-read`、`goal-tree-check` 跨 Session 恢复和检查；推断和建议在用户确认前都不是 canonical Goal、关系、Risk 或 Policy。用户随后仍在当前 Runtime 对话中逐项确认、拒绝或要求修改；用户明确回答后，Runtime 调用 `goal-tree-decide` 并传入 `user_confirmed=true`、确认摘要和具体决定，GoalBoard 再结合宿主 Session 元数据记录审计来源。这是本地对话来源记录，不伪装成密码学身份认证。已确认的安全条目才会物化，过期、悬空或循环条目会保持冲突，不影响其他已确认条目。

物化后不增加第二套“是否澄清完成”状态：确认的复合父 Goal 有子项时显示“已澄清，等待子 Goal”，确认的最小叶子显示“待执行”，仍是 Draft／开放拆分的分支才显示“待澄清”。

普通 Runtime 不能创建 canonical Goal、修改 accepted Contract、激活依赖或替用户决定 Candidate/Rewire。执行中发现的新工作只能提交 Candidate；发现依赖变化只能提交带方向、依据、证据、拒绝影响和置信度的 Dependency Proposal。

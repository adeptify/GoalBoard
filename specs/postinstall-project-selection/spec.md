# 安装后项目选择

## 背景与目标

GoalBoard 的机器级安装只安装 GoalBoard 自己的程序、Skill 和启动器到 `~/.goalboard`。它不能因此创建、导入、启用或启动任何用户项目，也不能改 Runtime 用户级配置。安装完成后，当前 Runtime 可以发起一个可跳过的项目设置对话；只有用户逐项明确确认的操作才执行。

本 Goal 要交付这条对话背后的唯一复合入口，涵盖创建项目、导入已有 GoalBoard DB、把现有项目绑定到当前 Runtime 工作入口、以及在宿主提供启动器时启动已绑定项目。

## 当前行为与证据

- `src/install/home.ts` 已把零选择的 `post_install` 提示随安装结果返回；安装路径只在 GoalBoard 自有目录写入。
- `src/install/postinstall-project-selection.ts` 已按 `action_id` 和 `confirmed_action_ids` 执行项目动作；未确认动作记录为 `skipped`，而不是默认执行。
- `tests/postinstall-project-selection.test.ts` 已覆盖全跳过、部分确认、先启用才可启动，以及重试幂等。
- Board 中有一条历史 rewire（`rewire-72748875-96fc-4261-9820-a18d0f33f29a`）仍待用户决定；它提议把本 Goal 显式依赖到项目目录和项目生命周期 MCP。现有实现确实消费这两个底层能力，但不能由 Runtime 静默决定该关系。

## 范围

- 返回默认选择为空的安装后项目设置提示。
- 通过同一个服务、CLI 和 Runtime MCP 入口处理 create/import/enable/start。
- 每一个实际动作必须有独立 `action_id`，且只在它出现在 `confirmed_action_ids` 时运行。
- 对每项动作返回 `executed`、`skipped` 或 `failed`，失败不会触及未选择动作。
- 复用既有项目目录、绑定与生命周期逻辑；不复制其底层实现。
- 用由 GoalBoard 自己保存的幂等记录防止重试重复执行已确认动作。

## 非目标

- 默认扫描、创建、导入、启用或启动项目。
- 修改用户项目文件。
- 修改 Runtime 用户级配置或把 Runtime 接入当作项目选择的一部分。
- 未经用户明确确认启动服务。
- 物理删除项目或实现项目目录 / 生命周期底层服务。

## 用户与调用场景

1. 用户安装 GoalBoard：收到“目前没有项目被处理”的提示，可以直接跳过；跳过后项目目录、绑定和服务不变。
2. 用户选择多项动作：Runtime 先展示每项动作，收集明确确认的 action ID，再调用复合入口；未确认项一律跳过。
3. 用户要启动某项目：同一 Runtime 工作入口必须先经明确 `enable` 绑定该项目；宿主没有启动能力时清楚返回失败且不启动任何服务。
4. 用户重新打开设置：可带相同幂等键重试，返回保存的结果而不重复创建、导入或启动。

## 方案与关键决策

- 选择信息以 `confirmed_action_ids` 表达逐项确认，而不是一个笼统的“同意设置”布尔值。
- 服务惰性打开项目目录：全跳过时不创建 `~/.goalboard`、catalog、项目 DB、绑定或服务。
- Runtime MCP 不接受模型提供的工作入口；宿主注入当前 `RuntimeWorkContext`，防止模型伪造或切换入口。
- `start` 只消费已经在该入口绑定的项目和宿主启动器；否则将该已确认项标记为失败，不产生副作用。
- 失败粒度是单个已选动作。创建、导入、绑定和启动各自使用其底层服务的事务 / 失败语义；未选择项目不受影响。

## 输入、输出与依赖

输入：GoalBoard home 目录、可选的项目动作、用户确认的 action ID、幂等键；enable/start 还需要宿主提供的当前工作入口，start 另需宿主启动器。

输出：默认空选择提示，以及带 `executed_action_ids`、`skipped_action_ids`、`failed_action_ids` 和每项详情的结果。

依赖：`GoalBoardProjectCatalog`、项目绑定路由、Runtime MCP 上下文宿主、Home 安装器。历史 rewire 的 canonical 关系是否应用必须等待用户决定，不影响对当前实现的验证。

## 文件边界

- `src/install/postinstall-project-selection.ts`：唯一选择服务与持久化幂等记录。
- `src/install/home.ts`：安装结果中的零选择提示。
- `src/cli/main.ts`：显式 `goalboard project-setup` 入口。
- `src/mcp/server.ts`：受宿主上下文约束的 Runtime MCP 复合入口。
- `tests/postinstall-project-selection.test.ts`、`tests/install.test.ts`、`tests/mcp.test.ts`：行为回归。
- `README.md`、`skills/goal-advance/**`：只描述用户确认流程，不承诺自动操作。

## 验收标准

- `POSTINSTALL-NO-DEFAULT-PROJECTS`：默认跳过时项目目录、绑定和服务均保持安装前状态。
- `POSTINSTALL-SELECTED-ONLY`：多项目部分选择后，只有被明确确认的操作产生对应变化；未选择项目和文件不受影响。
- 运行时入口不能通过模型提供的 context 绕开当前工作入口。
- 失败和重试不会造成未选择动作或已记录动作的重复副作用。

## 验证

```text
node --import tsx --test tests/install.test.ts tests/postinstall-project-selection.test.ts tests/mcp.test.ts
pnpm test
pnpm typecheck
git diff --check
```

## 假设与开放问题

- 用户在当前 Runtime 对话中明确确认 action ID 时，Runtime 才调用该入口；服务本身不把“调用发生”误解为广泛授权。
- 历史 rewire 需要用户在对话中明确决定应用或拒绝；在此之前，这个 Goal 的 Board 完成状态可能仍受该待决定事项影响。

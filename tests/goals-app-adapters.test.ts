import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createCliGoalsAdapter } from "@adeptify/goalboard-app-cli";
import { createMcpGoalsAdapter } from "@adeptify/goalboard-app-mcp";
import { createWorkbenchGoalsAdapter } from "@adeptify/goalboard-app-workbench";

import { GoalBoardCoordinator } from "../src/v1/coordinator.js";
import { SqliteGoalBoardStore } from "../src/v1/store.js";

test("Workbench, MCP, and CLI bind the same public Goals application Contract", () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-goals-app-adapters-"));
  const store = new SqliteGoalBoardStore(join(directory, "goalboard.sqlite"));
  try {
    const coordinator = new GoalBoardCoordinator(store);
    coordinator.initializeBoard({
      board_id: "board-app-adapters",
      title: "Goals App Adapters",
      actor_id: "user-1",
      idempotency_key: "initialize",
    });
    const adapters = [
      ["workbench", createWorkbenchGoalsAdapter(coordinator.goals)],
      ["mcp", createMcpGoalsAdapter(coordinator.goals)],
      ["cli", createCliGoalsAdapter(coordinator.goals)],
    ] as const;

    for (const [, adapter] of adapters) {
      assert.equal(adapter.commands, coordinator.goals.commands);
      assert.equal(adapter.lifecycle, coordinator.goals.lifecycle);
      assert.equal(adapter.planning, coordinator.goals.planning);
    }

    for (const [entrypoint, adapter] of adapters) {
      const result = adapter.commands.createGoal("board-app-adapters", {
        goal_id: `goal-${entrypoint}`,
        title: `${entrypoint} Goal`,
        outcome: "相同公开 Command 产生相同结构的 Goal 事实",
        why: "验证 App 不复制规则",
        business_logic: "App 只绑定公开 Contract。",
        acceptance_criteria: [],
      }, {
        actor_id: "user-1",
        idempotency_key: `create-${entrypoint}`,
      });
      assert.equal(result.goal.goal_id, `goal-${entrypoint}`);
      assert.equal(result.replayed, false);

      const replay = adapter.commands.createGoal("board-app-adapters", {
        goal_id: `goal-${entrypoint}`,
        title: `${entrypoint} Goal`,
        outcome: "相同公开 Command 产生相同结构的 Goal 事实",
        why: "验证 App 不复制规则",
        business_logic: "App 只绑定公开 Contract。",
        acceptance_criteria: [],
      }, {
        actor_id: "user-1",
        idempotency_key: `create-${entrypoint}`,
      });
      assert.equal(replay.replayed, true);
    }

    const errorCodes = adapters.map(([entrypoint, adapter]) => {
      try {
        adapter.commands.createGoal("board-app-adapters", {
          goal_id: `invalid-${entrypoint}`,
          title: "",
          outcome: "无效输入",
          why: "验证错误不被 Adapter 改写",
          business_logic: "公开 Command 负责校验。",
          acceptance_criteria: [],
        }, {
          actor_id: "user-1",
          idempotency_key: `invalid-${entrypoint}`,
        });
        return "missing-error";
      } catch (error) {
        return typeof error === "object" && error != null && "code" in error
          ? String(error.code)
          : "unknown-error";
      }
    });
    assert.deepEqual(errorCodes, ["goal.title_required", "goal.title_required", "goal.title_required"]);

    const snapshot = store.snapshot("board-app-adapters");
    assert.deepEqual(
      snapshot.goals.map((goal) => goal.goal_id).sort(),
      ["goal-cli", "goal-mcp", "goal-workbench"],
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

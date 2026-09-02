import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LocalHost, LocalHostError } from "@adeptify/goalboard-app-local-host";
import type { HostCapabilityDefinition } from "@adeptify/goalboard-contracts/platform/app-host";
import { CapabilityRegistryError } from "@adeptify/goalboard-kernel";

import {
  createGoalBoardLocalHost,
  createGoalCapability,
  goalBoardHostProjectReference,
  snapshotBoardCapability,
} from "../src/local-host/composition.js";
import { GoalBoardServer } from "../src/mcp/server.js";
import { runV1Cli } from "../src/v1/cli.js";
import type { CreateGoalInput } from "../src/v1/types.js";

test("Local Host discovers one runtime and serializes typed capabilities", async () => {
  const increment = {
    capability_id: "test.counter.increment",
    version: 1,
    operation: "command",
  } as HostCapabilityDefinition<{ amount: number }, number>;
  const missing = {
    capability_id: "test.counter.missing",
    version: 1,
    operation: "query",
  } as HostCapabilityDefinition<void, number>;
  let openCount = 0;
  let closeCount = 0;
  const host = new LocalHost<{ value: number }>({
    instanceId: "test-local-host",
    runtimeFactory: {
      open: () => {
        openCount += 1;
        return { value: 0 };
      },
      close: () => { closeCount += 1; },
    },
  });
  host.register(increment, async (runtime, input) => {
    await Promise.resolve();
    runtime.value += input.amount;
    return runtime.value;
  });

  const reference = { project_id: "project-1", board_id: "project-1", storage_key: "memory:project-1" };
  const first = host.client(reference);
  const second = host.client(reference);
  assert.deepEqual(await Promise.all([
    first.invoke(increment, { amount: 1 }),
    second.invoke(increment, { amount: 2 }),
  ]), [1, 3]);
  assert.equal(openCount, 1, "concurrent clients must discover the same runtime");
  assert.equal(host.status().projects.length, 1);
  await assert.rejects(
    () => first.invoke(missing, undefined),
    (error: unknown) => error instanceof CapabilityRegistryError && error.code === "kernel.capability_missing",
  );
  assert.throws(
    () => host.client({ ...reference, project_id: "project-2" }),
    (error: unknown) => error instanceof LocalHostError && error.code === "host.project_identity_conflict",
  );
  await host.close();
  assert.equal(closeCount, 1);
});

async function captureCli(operation: () => Promise<number>): Promise<Record<string, unknown>> {
  const lines: string[] = [];
  const previous = console.log;
  console.log = (...values: unknown[]) => { lines.push(values.map(String).join(" ")); };
  try {
    assert.equal(await operation(), 0);
  } finally {
    console.log = previous;
  }
  return JSON.parse(lines.at(-1) ?? "{}") as Record<string, unknown>;
}

test("CLI, MCP, and Workbench-style client share one writer and recover after restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-local-host-"));
  const databasePath = join(directory, "goalboard.db");
  let openCount = 0;
  const host = createGoalBoardLocalHost({
    instanceId: "shared-entry-host",
    onRuntimeOpen: () => { openCount += 1; },
  });
  const boardId = "shared-host-board";
  const commonGoal: CreateGoalInput = {
    goal_id: "shared-entry-goal",
    title: "共享 Host Goal",
    outcome: "三个入口看到同一个结果",
    why: "验证 Local Host 单写入者",
    business_logic: "同一 typed Command 必须幂等地落到同一份事实。",
    definition_state: "draft",
    decomposition_state: "abstract",
    priority: 50,
    acceptance_criteria: [],
  };
  try {
    await captureCli(() => runV1Cli([
      "init",
      "--db", databasePath,
      "--json", JSON.stringify({
        board_id: boardId,
        title: "Shared Host",
        actor_id: "cli-user",
        idempotency_key: "shared-host-init",
      }),
    ], { localHost: host }));
    const cliCreated = await captureCli(() => runV1Cli([
      "create-goal",
      "--db", databasePath,
      "--json", JSON.stringify({
        board_id: boardId,
        goal: commonGoal,
        actor_id: "shared-user",
        idempotency_key: "shared-goal-command",
      }),
    ], { localHost: host }));

    const mcp = new GoalBoardServer("management", null, null, host);
    const mcpCreated = JSON.parse(await mcp.callTool("goalboard_v1_create_goal", {
      database_path: databasePath,
      board_id: boardId,
      goal: commonGoal,
      actor_id: "shared-user",
      idempotency_key: "shared-goal-command",
    })) as Record<string, unknown>;

    const reference = goalBoardHostProjectReference({ databasePath, boardId });
    const workbenchCreated = await host.client(reference).invoke(createGoalCapability, {
      board_id: boardId,
      goal: commonGoal,
      actor_id: "shared-user",
      idempotency_key: "shared-goal-command",
    });
    assert.deepEqual(mcpCreated.goal, cliCreated.goal, "MCP and CLI must present the same Goal fact");
    assert.equal(mcpCreated.observed_event_cursor, cliCreated.observed_event_cursor);
    assert.equal(mcpCreated.replayed, true);
    assert.deepEqual(workbenchCreated.goal, cliCreated.goal, "Workbench Host Client must see the same Goal fact");
    assert.equal(workbenchCreated.observed_event_cursor, cliCreated.observed_event_cursor);
    assert.equal(workbenchCreated.replayed, true);
    assert.equal(openCount, 1, "all three entries must share one Store/Coordinator runtime");
    const snapshot = await host.client(reference).invoke(snapshotBoardCapability, { board_id: boardId });
    assert.deepEqual(snapshot.goals.map((goal) => goal.goal_id), ["shared-entry-goal"]);

    await host.close();
    const restarted = createGoalBoardLocalHost({ instanceId: "restarted-entry-host" });
    try {
      const restored = await restarted.client(reference).invoke(snapshotBoardCapability, { board_id: boardId });
      assert.deepEqual(restored.goals.map((goal) => goal.goal_id), ["shared-entry-goal"]);
    } finally {
      await restarted.close();
    }
  } finally {
    await host.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("legacy entrypoints no longer construct independent business stores", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const relativePath of ["../src/web/server.ts", "../src/mcp/server.ts", "../src/v1/cli.ts"]) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.doesNotMatch(source, /new\s+(?:SqliteGoalBoardStore|GoalBoardCoordinator)\s*\(/u, relativePath);
    assert.match(source, /GoalBoardLocalHost|localHost/u, relativePath);
  }
  const composition = await readFile(new URL("../src/local-host/composition.ts", import.meta.url), "utf8");
  assert.match(composition, /new SqliteGoalBoardStore\(/u);
  assert.match(composition, /new GoalBoardCoordinator\(/u);
});

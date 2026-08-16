import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyRuntimeConfigChange, prepareRuntimeConfigChange } from "../src/install/runtime-config.js";

async function withTemporaryDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "goalboard-runtime-config-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function planFor(directory: string, runtimeId = "codex") {
  const config = join(directory, "runtime", runtimeId, "config.json");
  const home = join(directory, "home", ".goalboard");
  await mkdir(join(directory, "runtime", runtimeId), { recursive: true });
  await writeFile(config, "{\n  \"mcp_servers\": {}\n}\n");
  return {
    config,
    home,
    plan: await prepareRuntimeConfigChange({
      runtime_id: runtimeId,
      target_path: config,
      next_contents: "{\n  \"mcp_servers\": {\n    \"goalboard\": {\"command\": \"goalboard-mcp\"}\n  }\n}\n",
      changes: [
        {
          path: "mcp_servers.goalboard",
          operation: "add",
          before: null,
          after: '{"command":"goalboard-mcp"}',
        },
      ],
      alternative: "可在当前 Session 使用临时 MCP 连接，或稍后重新发起持久接入。",
      home_directory: home,
    }),
  };
}

test("preview, cancellation, and mismatched Runtime confirmation leave config bytes unchanged", async () => {
  await withTemporaryDirectory(async (directory) => {
    const { config, home, plan } = await planFor(directory);
    const before = await readFile(config);
    const declined = await applyRuntimeConfigChange({
      plan,
      confirmation: { runtime_id: "codex", plan_id: plan.plan_id, decision: "declined" },
      validate: () => {
        throw new Error("declined plans must not validate");
      },
    });
    assert.equal(declined.status, "declined");
    assert.deepEqual(await readFile(config), before);
    await assert.rejects(stat(join(home, "runtime-config-backups")));

    const mismatched = await applyRuntimeConfigChange({
      plan,
      confirmation: { runtime_id: "claude-code", plan_id: plan.plan_id, decision: "confirmed" },
      validate: () => true,
    });
    assert.equal(mismatched.status, "confirmation_mismatch");
    assert.deepEqual(await readFile(config), before);
  });
});

test("confirmed write exactly matches preview, creates a backup, and is idempotent", async () => {
  await withTemporaryDirectory(async (directory) => {
    const { config, plan } = await planFor(directory);
    const before = await readFile(config);
    const applied = await applyRuntimeConfigChange({
      plan,
      confirmation: { runtime_id: plan.runtime_id, plan_id: plan.plan_id, decision: "confirmed" },
      validate: () => true,
    });
    assert.equal(applied.status, "applied");
    assert.equal(await readFile(config, "utf8"), plan.next_contents);
    assert.ok(plan.backup_path);
    assert.deepEqual(await readFile(plan.backup_path!), before);

    const replay = await applyRuntimeConfigChange({
      plan,
      confirmation: { runtime_id: plan.runtime_id, plan_id: plan.plan_id, decision: "confirmed" },
      validate: () => true,
    });
    assert.equal(replay.status, "already_applied");
    assert.equal(await readFile(config, "utf8"), plan.next_contents);
  });
});

test("failed Runtime validation restores the original configuration byte-for-byte", async () => {
  await withTemporaryDirectory(async (directory) => {
    const { config, plan } = await planFor(directory, "claude-code");
    const before = await readFile(config);
    const result = await applyRuntimeConfigChange({
      plan,
      confirmation: { runtime_id: plan.runtime_id, plan_id: plan.plan_id, decision: "confirmed" },
      validate: () => false,
    });
    assert.equal(result.status, "rolled_back");
    assert.deepEqual(await readFile(config), before);
    assert.ok(plan.backup_path);
    assert.deepEqual(await readFile(plan.backup_path!), before);
    assert.ok(result.consent_record_path);
  });
});

test("confirmed plan can create a missing Runtime config and keeps consent state under the requested GoalBoard home", async () => {
  await withTemporaryDirectory(async (directory) => {
    const config = join(directory, "runtime", "cursor", "settings.json");
    const home = join(directory, "custom-home", ".goalboard");
    const plan = await prepareRuntimeConfigChange({
      runtime_id: "cursor",
      target_path: config,
      next_contents: "{\"mcp\":\"goalboard-mcp\"}\n",
      changes: [{ path: "mcp", operation: "add", before: null, after: "goalboard-mcp" }],
      alternative: "使用当前 Session 的临时连接。",
      home_directory: home,
    });
    const applied = await applyRuntimeConfigChange({
      plan,
      confirmation: { runtime_id: "cursor", plan_id: plan.plan_id, decision: "confirmed" },
      validate: () => true,
    });
    assert.equal(applied.status, "applied");
    assert.equal(await readFile(config, "utf8"), plan.next_contents);
    assert.equal(plan.backup_path, null);
    assert.ok(applied.consent_record_path?.startsWith(home));
  });
});

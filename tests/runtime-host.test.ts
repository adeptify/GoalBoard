import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CodexRuntimeSessionAdapter,
  GoalBoardPtyHost,
  RuntimeHostRouter,
  type RuntimeSessionAdapter,
  type RuntimeSessionCapabilities,
} from "@adeptify/goalboard-service-runtime-host";

const ALL_NATIVE: RuntimeSessionCapabilities = {
  create: "native",
  list: "native",
  discover: "native",
  read: "native",
  resume: "native",
  events: "native",
  handoff: "native",
};

test("Runtime Host registers a provider, exposes its matrix, and returns honest unsupported results", async () => {
  const calls: string[] = [];
  const adapter: RuntimeSessionAdapter = {
    runtime_id: "fake",
    capabilities: ALL_NATIVE,
    async invoke(capability, input) {
      calls.push(capability);
      return { status: "ok", source: "native", capability, value: input };
    },
  };
  const host = new RuntimeHostRouter();
  host.register(adapter);

  assert.deepEqual(host.matrix(["fake", "fake"]), [{ runtime_id: "fake", capabilities: ALL_NATIVE }]);
  const started = await host.invoke("fake", "create", { prompt: "go" });
  assert.equal(started.status, "ok");
  assert.deepEqual(calls, ["create"]);

  const missing = await host.invoke("missing", "resume", {});
  assert.equal(missing.status, "unsupported");
  if (missing.status === "unsupported") assert.equal(missing.code, "runtime.capability_unavailable");
});

test("Codex Adapter translates requests and streams events without owning Session facts", async () => {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  let listener: ((event: { method: string; params: unknown }) => void) | null = null;
  const adapter = new CodexRuntimeSessionAdapter({
    async request(method, params) {
      calls.push({ method, params });
      return { accepted: true };
    },
    subscribe(next) {
      listener = next;
      return () => { listener = null; };
    },
  });

  assert.equal((await adapter.invoke("resume", { threadId: "thread-a" })).status, "ok");
  const events = await adapter.invoke("events", { listener: () => undefined });
  assert.equal(events.status, "ok");
  assert.equal(typeof listener, "function");
  assert.deepEqual(calls, [{ method: "thread/resume", params: { threadId: "thread-a" } }]);
});

test("Terminal PTY supports attach, input, process exit cleanup, and a fresh recovery spawn", async () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "goalboard-runtime-host-"));
  const output: string[] = [];
  const exits: string[] = [];
  let wake = () => undefined;
  const changed = () => new Promise<void>((resolve) => { wake = resolve; });
  const host = new GoalBoardPtyHost({
    onData(panelId, data) {
      output.push(`${panelId}:${data}`);
      wake();
    },
    onExit(panelId) {
      exits.push(panelId);
      wake();
    },
  });

  try {
    host.spawn({ panelId: "live", command: "/bin/sh", args: ["-c", "printf ready; exec cat"], cwd });
    await waitUntil(() => output.join("").includes("ready"), changed);
    const attached = host.spawn({ panelId: "live", attachOnly: true, cols: 100, rows: 30 });
    assert.equal(attached.attached, true);
    assert.match(attached.replay, /ready/);
    host.write("live", "hello\n");
    await waitUntil(() => output.join("").includes("hello"), changed);
    host.kill("live");
    assert.equal(host.alive("live"), false);

    host.spawn({ panelId: "recovered", command: "/bin/sh", args: ["-c", "printf recovered"], cwd });
    await waitUntil(() => exits.includes("recovered"), changed);
    assert.equal(host.alive("recovered"), false);
    assert.match(output.join(""), /recovered/);
  } finally {
    host.killAll();
    rmSync(cwd, { recursive: true, force: true });
  }
});

async function waitUntil(
  predicate: () => boolean,
  changed: () => Promise<void>,
  timeoutMs = 8_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Runtime Host test timed out");
    await Promise.race([
      changed(),
      new Promise<void>((resolve) => setTimeout(resolve, 50)),
    ]);
  }
}

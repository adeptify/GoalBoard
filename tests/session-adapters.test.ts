import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertCompleteRuntimeSessionCapabilities,
  CodexRuntimeSessionAdapter,
  RuntimeSessionAdapterRouter,
} from "../src/sessions/adapters.js";
import { GoalBoardSessionRegistry } from "../src/sessions/registry.js";

function definitelyRejected(message: string): Error {
  return Object.assign(new Error(message), { deliveryAccepted: false, retryable: true });
}
import { RUNTIME_SESSION_CAPABILITIES, type RuntimeSessionTransport } from "../src/sessions/types.js";

test("Codex Adapter declares every capability and routes only through verified app-server methods", async () => {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  let eventListener: ((event: { method: string; params: unknown }) => void) | null = null;
  const transport: RuntimeSessionTransport = {
    async request(method, params) {
      calls.push({ method, params });
      return { method, params };
    },
    subscribe(listener) {
      eventListener = listener;
      return () => { eventListener = null; };
    },
  };
  const adapter = new CodexRuntimeSessionAdapter(transport);
  assertCompleteRuntimeSessionCapabilities(adapter.capabilities);
  assert.deepEqual(Object.keys(adapter.capabilities).sort(), [...RUNTIME_SESSION_CAPABILITIES].sort());

  for (const [capability, method] of [
    ["create", "thread/start"],
    ["list", "thread/list"],
    ["discover", "thread/list"],
    ["read", "thread/read"],
    ["resume", "thread/resume"],
  ] as const) {
    const result = await adapter.invoke(capability, { marker: capability });
    assert.equal(result.status, "ok");
    assert.equal(calls.at(-1)?.method, method);
  }
  const handoff = await adapter.invoke("handoff", {
    prompt: "HANDOFF PACKAGE",
    threadStart: { cwd: "/tmp/project" },
  });
  assert.equal(handoff.status, "failed", "the fixture must expose a missing native thread id instead of faking success");
  if (handoff.status === "failed") {
    assert.equal(handoff.recovery?.phase, "create");
    assert.equal(handoff.recovery?.retryable, false);
  }
  assert.equal(calls.at(-1)?.method, "thread/start");
  const events = await adapter.invoke("events", { listener: () => undefined });
  assert.equal(events.status, "ok");
  assert.equal(typeof eventListener, "function");
});

test("unknown Runtime uses honest registry fallback without Runtime-name branching", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "goalboard-session-adapter-"));
  const registry = await GoalBoardSessionRegistry.open({ homeDirectory: path.join(directory, ".goalboard") });
  try {
    const router = new RuntimeSessionAdapterRouter(registry);
    const created = await router.invoke("future-runtime", "create", {
      actor_id: "user",
      user_confirmed: true,
      project_id: "project-a",
      title: "Fallback Session",
    });
    assert.equal(created.status, "ok");
    if (created.status !== "ok") return;
    assert.equal(created.source, "registry");

    const listed = await router.invoke("future-runtime", "list", { project_id: "project-a" });
    assert.equal(listed.status, "ok");
    if (listed.status === "ok") assert.equal((listed.value as unknown[]).length, 1);

    for (const capability of ["discover", "read", "resume", "events", "handoff"] as const) {
      const result = await router.invoke("future-runtime", capability, {});
      assert.equal(result.status, "unsupported");
      if (result.status === "unsupported") assert.equal(result.code, "runtime.capability_unavailable");
    }
  } finally {
    registry.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("Adapter failures stay failed instead of becoming empty native results", async () => {
  const adapter = new CodexRuntimeSessionAdapter({
    async request() { throw new Error("app-server unavailable"); },
    subscribe() { throw new Error("event stream unavailable"); },
  });
  const read = await adapter.invoke("read", { threadId: "thread-a" });
  assert.equal(read.status, "failed");
  if (read.status === "failed") assert.match(read.message, /app-server unavailable/);
  const events = await adapter.invoke("events", { listener: () => undefined });
  assert.equal(events.status, "failed");
});

test("Codex Handoff creates a new thread, delivers the package, and retries delivery without another thread", async () => {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  let failDelivery = true;
  const adapter = new CodexRuntimeSessionAdapter({
    async request(method, params) {
      calls.push({ method, params });
      if (method === "thread/start") return { thread: { id: "thread-handoff-target" } };
      if (method === "turn/start" && failDelivery) throw definitelyRejected("turn unavailable");
      if (method === "turn/start") return { turn: { id: "turn-handoff-target" } };
      throw new Error(`unexpected ${method}`);
    },
    subscribe() { return () => undefined; },
  });

  const first = await adapter.invoke("handoff", {
    prompt: "HANDOFF PACKAGE",
    threadStart: { cwd: "/tmp/project" },
  });
  assert.equal(first.status, "failed");
  if (first.status === "failed") {
    assert.equal(first.recovery?.phase, "deliver");
    assert.equal(first.recovery?.native_runtime_session_id, "thread-handoff-target");
  }
  assert.deepEqual(calls.map((item) => item.method), ["thread/start", "turn/start"]);
  assert.deepEqual(calls[1]?.params.input, [{ type: "text", text: "HANDOFF PACKAGE", text_elements: [] }]);

  failDelivery = false;
  const retried = await adapter.invoke("handoff", {
    prompt: "EDITED PACKAGE",
    existingThreadId: "thread-handoff-target",
    threadStart: { cwd: "/tmp/ignored" },
  });
  assert.equal(retried.status, "ok");
  assert.deepEqual(calls.map((item) => item.method), ["thread/start", "turn/start", "turn/start"]);
  assert.equal(calls[2]?.params.threadId, "thread-handoff-target");
});

test("Codex Handoff does not automatically retry an ambiguous delivery error", async () => {
  const adapter = new CodexRuntimeSessionAdapter({
    async request(method) {
      if (method === "turn/start") throw new Error("connection closed after write");
      throw new Error(`unexpected ${method}`);
    },
    subscribe() { return () => undefined; },
  });
  const result = await adapter.invoke("handoff", {
    prompt: "HANDOFF PACKAGE",
    existingThreadId: "thread-ambiguous-target",
  });
  assert.equal(result.status, "failed");
  if (result.status === "failed") {
    assert.equal(result.recovery?.phase, "deliver");
    assert.equal(result.recovery?.native_runtime_session_id, "thread-ambiguous-target");
    assert.equal(result.recovery?.retryable, false);
  }
});

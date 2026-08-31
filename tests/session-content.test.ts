import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CodexRuntimeSessionAdapter, RuntimeSessionAdapterRouter } from "../src/sessions/adapters.js";
import { searchSessionTimeline, SessionContentService } from "../src/sessions/content.js";
import { GoalBoardSessionRegistry } from "../src/sessions/registry.js";

test("Session content merges native Codex items with explicitly labelled GoalBoard TUI events", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "goalboard-session-content-"));
  const registry = await GoalBoardSessionRegistry.open({ homeDirectory: path.join(directory, ".goalboard") });
  try {
    const session = registry.explicitlyLinkSession({
      runtime_id: "codex",
      native_runtime_session_id: "thread-content",
      actor_id: "user",
      user_confirmed: true,
      project_id: "project-a",
      current_goal_id: "goal-a",
    });
    registry.appendEvent({
      session_id: session.session_id,
      source: "goalboard_tui",
      kind: "terminal_output",
      source_id: "panel-a:output:1",
      source_order: 1,
      occurred_at: "2026-08-30T10:02:00.000Z",
      content: "GoalBoard TUI fallback line",
      metadata: { panel_id: "panel-a", partial_terminal_history: true },
    });
    const router = new RuntimeSessionAdapterRouter(registry);
    router.register(new CodexRuntimeSessionAdapter({
      async request(method, params) {
        assert.equal(method, "thread/read");
        assert.deepEqual(params, { threadId: "thread-content", includeTurns: true });
        return {
          thread: {
            turns: [{
              id: "turn-a",
              startedAt: Date.parse("2026-08-30T10:00:00.000Z") / 1000,
              status: "completed",
              items: [
                { id: "user-a", type: "userMessage", content: [{ type: "text", text: "请检查 Session 时间线" }] },
                { id: "agent-a", type: "agentMessage", text: "我会先读取现有实现。" },
                { id: "tool-a", type: "commandExecution", command: "pnpm typecheck", aggregatedOutput: "Done", status: "completed", durationMs: 32, exitCode: 0 },
                {
                  id: "image-tool-a",
                  type: "mcpToolCall",
                  server: "image",
                  tool: "preview",
                  status: "completed",
                  result: {
                    preview: `data:image/png;base64,${"A".repeat(5_000)}`,
                    content: [{ type: "image", data: "B".repeat(5_000), mimeType: "image/png" }],
                  },
                },
                { id: "file-a", type: "fileChange", changes: [{ path: "src/sessions/content.ts", kind: "update" }], status: "completed" },
              ],
            }],
          },
        };
      },
      subscribe() { return () => undefined; },
    }));
    const result = await new SessionContentService(registry, router).read(session.session_id);
    assert.equal(result.content_mode, "native");
    assert.equal(result.partial_terminal_history, true);
    assert.deepEqual(
      result.events.map((event) => [event.kind, event.source]),
      [
        ["user_message", "runtime_native"],
        ["runtime_message", "runtime_native"],
        ["tool", "runtime_native"],
        ["tool", "runtime_native"],
        ["artifact", "runtime_native"],
        ["terminal_output", "goalboard_tui"],
      ],
    );
    assert.equal(searchSessionTimeline(result.events, "typecheck").length, 1);
    assert.equal(searchSessionTimeline(result.events, "fallback")[0]?.source, "goalboard_tui");
    const imageTool = result.events.find((event) => event.event_id === "native:image-tool-a");
    assert.match(imageTool?.content ?? "", /二进制内容已省略/);
    assert.doesNotMatch(imageTool?.content ?? "", /A{100}|B{100}|data:image\/png;base64/);
  } finally {
    registry.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("unsupported Runtime returns only proven GoalBoard events and never fabricates native history", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "goalboard-session-fallback-"));
  const registry = await GoalBoardSessionRegistry.open({ homeDirectory: path.join(directory, ".goalboard") });
  try {
    const session = registry.explicitlyLinkSession({
      runtime_id: "future-runtime",
      native_runtime_session_id: "future-a",
      actor_id: "user",
      user_confirmed: true,
      project_id: "project-a",
    });
    const empty = await new SessionContentService(registry, new RuntimeSessionAdapterRouter(registry)).read(session.session_id);
    assert.equal(empty.content_mode, "unavailable");
    assert.deepEqual(empty.events, []);
    registry.appendEvent({
      session_id: session.session_id,
      source: "goalboard",
      kind: "status",
      source_id: "goal-link-a",
      content: "已关联 Goal",
    });
    const fallback = await new SessionContentService(registry, new RuntimeSessionAdapterRouter(registry)).read(session.session_id);
    assert.equal(fallback.content_mode, "fallback");
    assert.deepEqual(fallback.events.map((event) => event.source), ["goalboard"]);
  } finally {
    registry.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("an unknown native read shape is a visible failure while proven GoalBoard events remain available", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "goalboard-session-read-shape-"));
  const registry = await GoalBoardSessionRegistry.open({ homeDirectory: path.join(directory, ".goalboard") });
  try {
    const session = registry.explicitlyLinkSession({
      runtime_id: "codex",
      native_runtime_session_id: "thread-shape-changed",
      actor_id: "user",
      user_confirmed: true,
      project_id: "project-a",
    });
    registry.appendEvent({
      session_id: session.session_id,
      source: "goalboard_tui",
      kind: "terminal_output",
      source_id: "shape-fallback",
      content: "仍可验证的本地记录",
    });
    const router = new RuntimeSessionAdapterRouter(registry);
    router.register(new CodexRuntimeSessionAdapter({
      async request() { return { unexpected: [] }; },
      subscribe() { return () => undefined; },
    }));

    const result = await new SessionContentService(registry, router).read(session.session_id);
    assert.equal(result.content_mode, "failed");
    assert.equal(result.native_error?.code, "runtime.read_shape_unknown");
    assert.deepEqual(result.events.map((event) => event.content), ["仍可验证的本地记录"]);
  } finally {
    registry.close();
    await rm(directory, { recursive: true, force: true });
  }
});

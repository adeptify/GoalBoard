import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GoalBoardProjectCatalog } from "../src/projects/catalog.js";
import { GoalBoardSessionRegistry } from "../src/sessions/registry.js";
import type { RuntimeSessionTransport } from "../src/sessions/types.js";
import {
  PROJECT_OPERATIONS_CLIENT_SCRIPT,
  PROJECT_OPERATIONS_STYLES,
  renderProjectOperations,
} from "../src/web/project-session-workspaces.js";
import { createGoalBoardWebServer } from "../src/web/server.js";

const TOKEN = "goalboard-session-web-token-0123456789abcdef";

test("project operation renderer uses real records or an honest empty state without prototype branches", () => {
  const rendered = renderProjectOperations({
    project_id: "project-real-only",
    display_name: "GoalBoard 信息流工作台重设计",
  });
  const html = `${rendered.rootItems}${rendered.directories}${rendered.surfaces}${rendered.overlays}`;
  assert.match(html, /这个项目还没有 Session/);
  assert.match(html, /这个项目还没有工作目录/);
  assert.match(html, /OpenCode/);
  assert.match(html, /Pi Agent/);
  assert.doesNotMatch(html, /option value="running"|option value="failed"/);
  assert.doesNotMatch(html, /codex-0193f6c2|\/Users\/demo|可交互原型|data-live-session|data-operation-archive/);
  assert.doesNotMatch(PROJECT_OPERATIONS_CLIENT_SCRIPT, /dataset\.liveSession|data-operation-archive/);
  assert.match(PROJECT_OPERATIONS_STYLES, /\.project-session-document \.goal-focus-aside \{ display: contents; \}/);
  assert.match(PROJECT_OPERATIONS_STYLES, /\.project-session-document \.operation-goal-history \{ order: 1; \}/);
  assert.match(PROJECT_OPERATIONS_STYLES, /\.project-session-document \.goal-focus-main \{ order: 2; \}/);
  assert.match(PROJECT_OPERATIONS_STYLES, /\.session-content-state > div:only-child \{ grid-column: 1 \/ -1;/);
});

test("project Sessions render real Registry records and content/resume APIs stay project isolated", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "goalboard-session-web-"));
  const home = path.join(directory, ".goalboard");
  const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: home });
  const first = await catalog.createProject({ display_name: "Session 项目 A", actor_id: "user" });
  const second = await catalog.createProject({ display_name: "Session 项目 B", actor_id: "user" });
  catalog.close();

  const registry = await GoalBoardSessionRegistry.open({ homeDirectory: home });
  const sessionA = registry.explicitlyLinkSession({
    runtime_id: "codex",
    native_runtime_session_id: "thread-web-a",
    actor_id: "user",
    user_confirmed: true,
    project_id: first.project_id,
    current_goal_id: "goal-session-a",
    workspace_path: directory,
    title: "真实 Session A",
  });
  const sessionB = registry.explicitlyLinkSession({
    runtime_id: "codex",
    native_runtime_session_id: "thread-web-b",
    actor_id: "user",
    user_confirmed: true,
    project_id: second.project_id,
    title: "不能出现在 A 项目",
  });
  registry.appendEvent({
    session_id: sessionA.session_id,
    source: "goalboard_tui",
    kind: "terminal_output",
    source_id: "panel-web-a:output:0",
    occurred_at: "2026-08-30T10:01:00.000Z",
    content: "TUI-WEB-CONTENT-MARKER",
  });
  registry.close();

  const calls: string[] = [];
  const transport: RuntimeSessionTransport = {
    async request(method, params) {
      calls.push(`${method}:${String(params.threadId)}`);
      if (method === "thread/read") {
        return {
          thread: {
            turns: [{
              id: "turn-web-a",
              startedAt: Date.parse("2026-08-30T10:00:00.000Z") / 1000,
              status: "completed",
              items: [{ id: "agent-web-a", type: "agentMessage", text: "NATIVE-WEB-CONTENT-MARKER" }],
            }],
          },
        };
      }
      return { thread: { id: params.threadId } };
    },
    subscribe() { return () => undefined; },
  };
  const server = createGoalBoardWebServer({
    homeDirectory: home,
    controlToken: TOKEN,
    runtimeSessionTransport: transport,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const firstPrefix = `/projects/${encodeURIComponent(first.project_id)}`;
    const secondPrefix = `/projects/${encodeURIComponent(second.project_id)}`;
    const page = await (await fetch(`${origin}${firstPrefix}/`)).text();
    assert.match(page, /真实 Session A/);
    assert.match(page, new RegExp(sessionA.session_id));
    assert.doesNotMatch(page, /不能出现在 A 项目|codex-0193f6c2/);
    assert.doesNotMatch(page, /可交互原型|data-live-session|data-operation-archive/);
    assert.match(page, /data-open-session-handoff/);
    assert.match(page, /data-session-handoff-dialog/);
    assert.match(page, /data-handoff-content/);
    assert.match(page, /data-handoff-confirm/);
    assert.match(page, /data-session-resume-mode="native"/);
    assert.match(page, /<option value="opencode"/);
    assert.match(page, /<option value="pi-agent"/);

    const listed = await (await fetch(`${origin}${firstPrefix}/api/sessions`)).text();
    assert.match(listed, new RegExp(sessionA.session_id));
    assert.doesNotMatch(listed, new RegExp(`${sessionB.session_id}|TUI-WEB-CONTENT-MARKER`));

    const contentResponse = await fetch(`${origin}${firstPrefix}/api/sessions/${encodeURIComponent(sessionA.session_id)}/content`);
    assert.equal(contentResponse.status, 200);
    const content = await contentResponse.json() as { content_mode: string; events: Array<{ content: string; source: string }> };
    assert.equal(content.content_mode, "native");
    assert.deepEqual(content.events.map((event) => event.source), ["runtime_native", "goalboard_tui"]);
    assert.match(content.events.map((event) => event.content).join("\n"), /NATIVE-WEB-CONTENT-MARKER[\s\S]*TUI-WEB-CONTENT-MARKER/);

    const crossProject = await fetch(`${origin}${secondPrefix}/api/sessions/${encodeURIComponent(sessionA.session_id)}/content`);
    assert.equal(crossProject.status, 404);

    const resumeUrl = `${origin}${firstPrefix}/api/sessions/${encodeURIComponent(sessionA.session_id)}/resume`;
    const resume = await fetch(resumeUrl, {
      method: "POST",
      headers: {
        origin,
        "x-goalboard-control-token": TOKEN,
        "x-goalboard-idempotency-key": "session-web-resume-a",
      },
      body: "{}",
    });
    assert.equal(resume.status, 200);
    assert.deepEqual(calls, ["thread/read:thread-web-a", "thread/resume:thread-web-a"]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

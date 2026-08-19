import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { WebSocket, type RawData } from "ws";
import { desktopAdvancePrompt } from "../src/desktop/advance-prompt.js";
import { desktopLaunchSpec, desktopPanelEnv } from "../src/desktop/launch.js";
import { GoalBoardProjectCatalog } from "../src/projects/catalog.js";
import { GoalBoardCoordinator } from "../src/v1/coordinator.js";
import { DEMO_BOARD_ID, seedDemoBoard } from "../src/v1/demo.js";
import { SqliteGoalBoardStore } from "../src/v1/store.js";
import { buildPtyEnvironment, isPtyCommandAvailable, resolvePtyCommand } from "../src/web/pty-host.js";
import { renderGoalBoardWeb } from "../src/web/render.js";
import {
  buildGoalBoardWebView,
  createGoalBoardWebServer as createBaseGoalBoardWebServer,
} from "../src/web/server.js";

const WEB_TEST_CONTROL_TOKEN = "goalboard-web-test-control-token-0123456789abcdef";
let webRequestSequence = 0;

function createGoalBoardWebServer(
  options: Parameters<typeof createBaseGoalBoardWebServer>[0] = {},
) {
  return createBaseGoalBoardWebServer({ ...options, controlToken: WEB_TEST_CONTROL_TOKEN });
}

function webFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method === "GET" || method === "HEAD") return globalThis.fetch(input, init);
  const target = new URL(input instanceof Request ? input.url : String(input));
  const headers = new Headers(init.headers);
  if (!headers.has("origin")) headers.set("origin", target.origin);
  if (!headers.has("x-goalboard-control-token")) {
    headers.set("x-goalboard-control-token", WEB_TEST_CONTROL_TOKEN);
  }
  if (!headers.has("x-goalboard-idempotency-key")) {
    webRequestSequence += 1;
    headers.set("x-goalboard-idempotency-key", `desktop-tui-request-${webRequestSequence}`);
  }
  return globalThis.fetch(input, { ...init, headers });
}

function waitForPtyMessage(
  socket: WebSocket,
  match: (value: Record<string, unknown>) => boolean,
  label: string,
  timeoutMs = 8_000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const seen: unknown[] = [];
    const timer = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error(`pty message timeout (${label}): ${JSON.stringify(seen)}`));
    }, timeoutMs);
    const onMessage = (raw: RawData) => {
      let value: Record<string, unknown>;
      try {
        value = JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw)) as Record<string, unknown>;
      } catch {
        seen.push(String(raw));
        return;
      }
      seen.push(value);
      if (!match(value)) return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(value);
    };
    socket.on("message", onMessage);
  });
}

function addProjectGoal(
  project: { database_path: string; board_id: string },
  goalId: string,
  title: string,
): void {
  const store = new SqliteGoalBoardStore(project.database_path);
  try {
    new GoalBoardCoordinator(store).createGoal(
      project.board_id,
      {
        goal_id: goalId,
        title,
        outcome: "",
        why: "",
        business_logic: "",
        definition_state: "draft",
        decomposition_state: "abstract",
        acceptance_criteria: [],
      },
      { actor_id: "test-user", idempotency_key: `desktop-tui-goal-${goalId}` },
    );
  } finally {
    store.close();
  }
}

async function catalogFixture() {
  const homeDirectory = mkdtempSync(join(tmpdir(), "goalboard-desktop-tui-"));
  const catalog = await GoalBoardProjectCatalog.open({ homeDirectory });
  try {
    const created = await catalog.createProject({
      display_name: "桌面 TUI 项目",
      actor_id: "test-user",
    });
    const project = catalog.getProject(created.project_id);
    return { homeDirectory, project };
  } finally {
    catalog.close();
  }
}

test("desktop Skill reads GOALBOARD_GOAL_ID and does not auto-claim", () => {
  const skill = readFileSync(join(process.cwd(), "skills/goal-advance/SKILL.md"), "utf8");
  assert.match(skill, /GOALBOARD_GOAL_ID/);
  assert.match(skill, /Do \*\*not\*\* call `select_goal`, `claim`, or `run_start` just because the tab is open/);
  assert.match(skill, /Opening a terminal is not claiming work/);
});

test("advance prompt names the Goal and omits the five-chapter contract", () => {
  const prompt = desktopAdvancePrompt({ goal_id: "LEAF-1", title: "让安装一次就能用" });
  assert.match(prompt, /让安装一次就能用/);
  assert.match(prompt, /LEAF-1/);
  assert.match(prompt, /不要改别的 Goal/);
  assert.doesNotMatch(prompt, /outcome|business_logic|acceptance_criteria|为什么|怎样才算完成/);
});

test("launch recipes resume Codex, Claude, OpenCode, Pi Agent, and Grok Build", () => {
  assert.deepEqual(desktopLaunchSpec({ runtime_kind: "codex" }).args, []);
  assert.deepEqual(
    desktopLaunchSpec({ runtime_kind: "codex", resume_session_id: "thread-abc" }).args,
    ["resume", "thread-abc"],
  );
  assert.deepEqual(
    desktopLaunchSpec({ runtime_kind: "claude-code", resume_session_id: "sess-1" }).args,
    ["--resume", "sess-1"],
  );
  assert.equal(desktopLaunchSpec({ runtime_kind: "opencode" }).command, "opencode");
  assert.deepEqual(
    desktopLaunchSpec({ runtime_kind: "opencode", resume_session_id: "ses_abc" }).args,
    ["--session", "ses_abc"],
  );
  assert.equal(desktopLaunchSpec({ runtime_kind: "pi-agent" }).command, "pi");
  assert.deepEqual(
    desktopLaunchSpec({ runtime_kind: "pi-agent", resume_session_id: "/tmp/pi-session.json" }).args,
    ["--session", "/tmp/pi-session.json"],
  );
  assert.equal(desktopLaunchSpec({ runtime_kind: "grok-build" }).command, "grok");
  assert.deepEqual(
    desktopLaunchSpec({ runtime_kind: "grok-build", resume_session_id: "abc-def-ghi" }).args,
    ["--resume", "abc-def-ghi"],
  );
  const generic = desktopLaunchSpec({ runtime_kind: "generic", command: "cat" });
  assert.equal(generic.command, "cat");
  const env = desktopPanelEnv({
    homeDirectory: "/tmp/goalboard-home",
    runtimeId: "opencode",
    panelId: "panel-1",
    workContextId: "panel-1",
    goalId: "LEAF-1",
  });
  assert.equal(env.GOALBOARD_GOAL_ID, "LEAF-1");
  assert.equal(env.GOALBOARD_PANEL_ID, "panel-1");
  assert.equal(env.GOALBOARD_WORK_CONTEXT_ID, "panel-1");
  assert.equal(env.GOALBOARD_RUNTIME_ID, "opencode");
  assert.doesNotMatch(JSON.stringify(env), /claim|select_goal/i);
});

test("PTY environment keeps GoalBoard identity and drops host Node/editor flags", () => {
  const previousNodeOptions = process.env.NODE_OPTIONS;
  const previousNodePath = process.env.NODE_PATH;
  const previousPath = process.env.PATH;
  process.env.NODE_OPTIONS = "--require /tmp/does-not-exist.js";
  process.env.NODE_PATH = "/tmp/tsx-host-modules";
  process.env.PATH = `./node_modules/.bin:/tmp/cursor-host-bin:${previousPath ?? ""}`;
  process.env.CURSOR_TRACE_ID = "editor-session";
  try {
    const env = buildPtyEnvironment({
      NODE_OPTIONS: "--still-blocked",
      NODE_PATH: "/tmp/overlay-blocked",
      GOALBOARD_GOAL_ID: "LEAF-1",
      GOALBOARD_PANEL_ID: "panel-1",
    });
    assert.equal(env.NODE_OPTIONS, undefined);
    assert.equal(env.NODE_PATH, undefined);
    assert.equal(env.CURSOR_TRACE_ID, undefined);
    assert.equal(env.__CFBundleIdentifier, undefined);
    assert.equal(env.GOALBOARD_GOAL_ID, "LEAF-1");
    assert.equal(env.GOALBOARD_PANEL_ID, "panel-1");
    assert.equal(env.TERM, "xterm-256color");
    assert.match(env.PATH ?? "", /\/bin/);
    assert.doesNotMatch(env.PATH ?? "", /(^|:)(\.\/node_modules\/\.bin|\/tmp\/cursor-host-bin)(:|$)/);
  } finally {
    if (previousNodeOptions === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = previousNodeOptions;
    if (previousNodePath === undefined) delete process.env.NODE_PATH;
    else process.env.NODE_PATH = previousNodePath;
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    delete process.env.CURSOR_TRACE_ID;
  }
});

test("Goal pages include the TUI pane in the browser and the desktop shell", () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-desktop-render-"));
  const databasePath = join(directory, "demo.db");
  seedDemoBoard(databasePath);
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  try {
    const view = buildGoalBoardWebView(store, coordinator, {
      databasePath,
      boardId: DEMO_BOARD_ID,
      demo: true,
    });
    const browser = renderGoalBoardWeb(view);
    const desktop = renderGoalBoardWeb(view, undefined, false, false, false, "", true);
    const decisions = renderGoalBoardWeb(view, undefined, false, true);
    assert.match(browser, /class="tui-pane"/);
    assert.match(browser, /推进这个 Goal/);
    assert.match(browser, /pty-client\.js/);
    assert.match(browser, /class="workspace is-desktop-tui"/);
    assert.doesNotMatch(decisions, /class="tui-pane"|推进这个 Goal|pty-client\.js|data-mobile-target="tui"/);
    assert.match(browser, /data-mobile-target="tui"/);
    assert.match(browser, /aria-controls="goal-tui-pane"/);
    assert.match(browser, /data-tui-kind="claude-code"/);
    assert.match(browser, /data-tui-kind="codex"/);
    assert.match(browser, /data-tui-kind="opencode"/);
    assert.match(browser, /data-tui-kind="pi-agent"/);
    assert.match(browser, /data-tui-kind="grok-build"/);
    assert.match(browser, /data-tui-kind="generic"/);
    assert.match(browser, /常用 Runtime 或自定义命令/);
    assert.match(desktop, /class="tui-pane"/);
    assert.match(desktop, /data-tui-pane/);
    assert.match(desktop, /推进这个 Goal/);
    assert.match(desktop, /填入不发送/);
    assert.match(desktop, /添加终端/);
    assert.match(desktop, /还没有终端/);
    assert.match(desktop, /class="tui-stage"/);
    assert.match(desktop, /\.tui-stage \{[^}]*padding: 10px 12px 12px/);
    assert.match(desktop, /\.tui-terminal \.tui-xterm \{[^}]*inset: 10px 12px 12px/);
    assert.match(desktop, /var\(--tui-width, 480px\)/);
    assert.match(desktop, /data-tui-collapse/);
    assert.match(desktop, /data-tui-expand/);
    assert.match(desktop, /tui-expand-label/);
    assert.match(desktop, /\.workspace\.is-tui-collapsed/);
    assert.match(desktop, /\.tui-pane\.is-collapsed/);
    assert.match(desktop, /\.document-pane::-webkit-scrollbar/);
    assert.match(desktop, /在这个 Goal 上打开终端/);
    assert.match(desktop, /querySelector\("\[data-tree-resizer\]"\)/);
    assert.match(desktop, /\.workspace\.is-desktop-tui \{ grid-template-columns: var\(--tree-width, 240px\)/);
    assert.match(desktop, /class="workspace is-desktop-tui"/);
    assert.match(desktop, /src="\/desktop\/pty-client\.js"/);
    assert.match(desktop, /data-desktop-shell="true"/);
  } finally {
    store.close();
  }
});

test("panel APIs and the TUI pane work without a desktop shell marker", async () => {
  const fixture = await catalogFixture();
  addProjectGoal(fixture.project, "TUI-GOAL", "桌面关联 Goal");
  const server = createGoalBoardWebServer({ homeDirectory: fixture.homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const prefix = `/projects/${encodeURIComponent(fixture.project.project_id)}`;
    const panelsUrl = `${origin}${prefix}/api/goals/TUI-GOAL/panels`;

    const browserPage = await (await webFetch(`${origin}${prefix}/goals/TUI-GOAL`)).text();
    assert.match(browserPage, /class="tui-pane"|data-tui-pane/);
    assert.match(browserPage, /推进这个 Goal/);
    assert.match(browserPage, /pty-client\.js/);

    const index = await webFetch(`${origin}/`);
    const indexHtml = await index.text();
    assert.match(indexHtml, /打开项目后，Goal 详情右侧会出现终端栏/);
    assert.match(indexHtml, new RegExp(`href="${prefix}"`));
    assert.doesNotMatch(indexHtml, /class="tui-pane"|pty-client\.js/);

    const desktopIndex = await webFetch(`${origin}/?desktop=1`);
    assert.match(String(desktopIndex.headers.get("set-cookie")), /goalboard_desktop=1/);
    const desktopIndexHtml = await desktopIndex.text();
    assert.match(desktopIndexHtml, /打开项目后，Goal 详情右侧会出现终端栏/);
    assert.match(desktopIndexHtml, new RegExp(`href="${prefix}\\?desktop=1"`));

    const cookiePage = await (
      await webFetch(`${origin}${prefix}/goals/TUI-GOAL`, {
        headers: { cookie: "goalboard_desktop=1" },
      })
    ).text();
    assert.match(cookiePage, /data-tui-pane/);
    assert.match(cookiePage, /添加终端/);

    const queryPage = await (await webFetch(`${origin}${prefix}/goals/TUI-GOAL?desktop=1`)).text();
    assert.match(queryPage, /data-tui-pane/);

    const desktopPage = await (
      await webFetch(`${origin}${prefix}/goals/TUI-GOAL`, { headers: { "x-goalboard-desktop": "1" } })
    ).text();
    assert.match(desktopPage, /data-tui-pane/);
    assert.match(desktopPage, /推进这个 Goal/);
    assert.match(desktopPage, /添加终端/);

    const opened = await webFetch(panelsUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ runtime_kind: "generic", command: "cat" }),
    });
    assert.equal(opened.status, 200, await opened.clone().text());
    const payload = await opened.json() as {
      panel: { panel_id: string; goal_id: string; work_context_id: string };
      spawn: { env: Record<string, string>; command: string };
    };
    assert.equal(payload.panel.goal_id, "TUI-GOAL");
    assert.equal(payload.spawn.command, "cat");
    assert.equal(payload.spawn.env.GOALBOARD_GOAL_ID, "TUI-GOAL");
    assert.equal(payload.spawn.env.GOALBOARD_PANEL_ID, payload.panel.panel_id);
    assert.equal(payload.spawn.env.GOALBOARD_WORK_CONTEXT_ID, payload.panel.work_context_id);

    const prompt = await webFetch(`${origin}${prefix}/api/goals/TUI-GOAL/advance-prompt`);
    assert.equal(prompt.status, 200);
    const promptBody = await prompt.json() as { prompt: string; title: string };
    assert.equal(promptBody.title, "桌面关联 Goal");
    assert.match(promptBody.prompt, /TUI-GOAL/);
    assert.doesNotMatch(promptBody.prompt, /business_logic/);

    const listed = await webFetch(panelsUrl);
    const listedBody = await listed.json() as { panels: Array<{ panel_id: string }> };
    assert.equal(listedBody.panels.length, 1);

    const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: fixture.homeDirectory });
    try {
      assert.equal(
        catalog.resolveRuntimeContext({
          runtime_id: "generic",
          stable_work_context_id: payload.panel.work_context_id,
          host_declares_stable: true,
        }).status,
        "bound",
      );
      catalog.closeDesktopPanel(payload.panel.panel_id, "test-user");
      assert.equal(
        catalog.resolveRuntimeContext({
          runtime_id: "generic",
          stable_work_context_id: payload.panel.work_context_id,
          host_declares_stable: true,
        }).status,
        "bound",
      );
    } finally {
      catalog.close();
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("TUI menu greys out runtimes whose CLI is missing", () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-desktop-cli-"));
  const databasePath = join(directory, "demo.db");
  seedDemoBoard(databasePath);
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  try {
    const view = buildGoalBoardWebView(store, coordinator, {
      databasePath,
      boardId: DEMO_BOARD_ID,
      demo: true,
    });
    const withMissing = renderGoalBoardWeb(
      view,
      undefined,
      false,
      false,
      false,
      "",
      true,
      { codex: false, "claude-code": true },
    );
    assert.match(withMissing, /data-tui-kind="codex" disabled/);
    assert.match(withMissing, /data-tui-kind="claude-code"/);
    assert.doesNotMatch(withMissing, /data-tui-kind="claude-code" disabled/);
    assert.match(withMissing, /未安装/);
    assert.match(withMissing, /tui-menu-missing/);
    assert.match(withMissing, /需要先安装 CLI/);

    const allAvailable = renderGoalBoardWeb(view);
    assert.doesNotMatch(allAvailable, /data-tui-kind="(claude-code|codex|opencode|pi-agent|grok-build)" disabled/);
  } finally {
    store.close();
  }
});

test("PTY command availability only accepts executable commands", () => {
  assert.equal(isPtyCommandAvailable("/bin/sh"), true);
  assert.equal(isPtyCommandAvailable("goalboard-no-such-command-xyz"), false);
  assert.equal(isPtyCommandAvailable(""), false);
});

test("local PTY socket auths with the page token and can spawn a process", async () => {
  const fixture = await catalogFixture();
  const server = createGoalBoardWebServer({ homeDirectory: fixture.homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const sockets: WebSocket[] = [];
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const ptyUrl = `ws://127.0.0.1:${address.port}/pty`;

    const foreign = new WebSocket(ptyUrl, { origin: "http://example.com" });
    sockets.push(foreign);
    await new Promise<void>((resolve, reject) => {
      foreign.once("error", () => resolve());
      foreign.once("open", () => reject(new Error("cross-origin pty upgrade should fail")));
    });

    const unauthed = new WebSocket(ptyUrl);
    sockets.push(unauthed);
    await new Promise<void>((resolve, reject) => {
      unauthed.once("open", () => resolve());
      unauthed.once("error", (error) => reject(error));
    });
    const denied = waitForPtyMessage(unauthed, (value) => value.type === "error", "unauthed-error");
    unauthed.send(JSON.stringify({ type: "spawn", panelId: "denied", command: "/bin/cat" }));
    assert.match(String((await denied).message), /本地终端通道校验失败/);

    const socket = new WebSocket(ptyUrl);
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", (error) => reject(error));
    });
    const ready = waitForPtyMessage(socket, (value) => value.type === "ready", "auth-ready");
    socket.send(JSON.stringify({ type: "auth", token: WEB_TEST_CONTROL_TOKEN }));
    await ready;
    const spawned = waitForPtyMessage(socket, (value) => value.type === "spawned" && value.panelId === "pty-smoke" && value.attached !== true, "spawned");
    const echoed = waitForPtyMessage(socket, (value) => (
      value.type === "data" && value.panelId === "pty-smoke" && String(value.data).includes("hello")
    ), "echo");
    socket.send(JSON.stringify({
      type: "spawn",
      panelId: "pty-smoke",
      command: "/bin/sh",
      args: ["-c", "printf hello; exec cat"],
      cols: 80,
      rows: 24,
    }));
    await spawned;
    await echoed;
    const attached = waitForPtyMessage(
      socket,
      (value) => value.type === "spawned" && value.panelId === "pty-smoke" && value.attached === true,
      "attached",
    );
    socket.send(JSON.stringify({
      type: "spawn",
      panelId: "pty-smoke",
      command: "/bin/sh",
      args: ["-c", "printf hello"],
      cols: 80,
      rows: 24,
    }));
    const attachedPayload = await attached;
    assert.match(String(attachedPayload.replay), /hello/);
    socket.send(JSON.stringify({ type: "kill", panelId: "pty-smoke" }));
  } finally {
    for (const socket of sockets) socket.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("PTY spawn preflight reports missing commands and missing working directories", async () => {
  const fixture = await catalogFixture();
  const server = createGoalBoardWebServer({ homeDirectory: fixture.homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const sockets: WebSocket[] = [];
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const ptyUrl = `ws://127.0.0.1:${address.port}/pty`;
    const socket = new WebSocket(ptyUrl);
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", (error) => reject(error));
    });
    const ready = waitForPtyMessage(socket, (value) => value.type === "ready", "auth-ready");
    socket.send(JSON.stringify({ type: "auth", token: WEB_TEST_CONTROL_TOKEN }));
    await ready;

    const missing = waitForPtyMessage(
      socket,
      (value) => (
        value.type === "error" &&
        value.panelId === "pty-missing" &&
        /找不到命令/.test(String(value.message ?? ""))
      ),
      "missing-command",
    );
    socket.send(JSON.stringify({
      type: "spawn",
      panelId: "pty-missing",
      command: "goalboard-no-such-command",
      cols: 80,
      rows: 24,
    }));
    await missing;

    const badCwd = waitForPtyMessage(
      socket,
      (value) => (
        value.type === "error" &&
        value.panelId === "pty-bad-cwd" &&
        /工作目录不存在/.test(String(value.message ?? ""))
      ),
      "bad-cwd",
    );
    socket.send(JSON.stringify({
      type: "spawn",
      panelId: "pty-bad-cwd",
      command: "/bin/sh",
      cwd: "/goalboard/definitely/not/here",
      cols: 80,
      rows: 24,
    }));
    await badCwd;
  } finally {
    for (const socket of sockets) socket.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("OpenCode, Pi Agent, and Grok Build panels keep their launch recipes", async () => {
  const fixture = await catalogFixture();
  addProjectGoal(fixture.project, "TUI-RUNTIMES", "多 Runtime Goal");
  const server = createGoalBoardWebServer({ homeDirectory: fixture.homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const panelsUrl = `${origin}/projects/${encodeURIComponent(fixture.project.project_id)}/api/goals/TUI-RUNTIMES/panels`;
    const recipes = [
      { runtime_kind: "opencode", command: "opencode", resume_session_id: "ses_abc", args: ["--session", "ses_abc"] },
      { runtime_kind: "pi-agent", command: "pi", resume_session_id: "pi-sess", args: ["--session", "pi-sess"] },
      { runtime_kind: "grok-build", command: "grok", resume_session_id: "abc-def-ghi", args: ["--resume", "abc-def-ghi"] },
    ];
    for (const recipe of recipes) {
      const opened = await webFetch(panelsUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runtime_kind: recipe.runtime_kind,
          resume_session_id: recipe.resume_session_id,
        }),
      });
      assert.equal(opened.status, 200, await opened.clone().text());
      const payload = await opened.json() as {
        panel: { runtime_kind: string; host_session_id: string | null };
        spawn: { command: string; args: string[]; env: Record<string, string> };
      };
      assert.equal(payload.panel.runtime_kind, recipe.runtime_kind);
      assert.equal(payload.panel.host_session_id, recipe.resume_session_id);
      assert.equal(payload.spawn.command, recipe.command);
      assert.deepEqual(payload.spawn.args, recipe.args);
      assert.equal(payload.spawn.env.GOALBOARD_RUNTIME_ID, recipe.runtime_kind);
      assert.equal(payload.spawn.env.GOALBOARD_GOAL_ID, "TUI-RUNTIMES");
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("isolated PTY PATH can start Grok Build help", async (t) => {
  const env = buildPtyEnvironment();
  const grok = resolvePtyCommand("grok", env.PATH ?? "");
  if (grok === "grok") {
    t.skip("grok CLI 未安装，跳过 Grok Build 启动验证");
    return;
  }
  assert.match(grok, /grok$/);
  assert.notEqual(grok, "grok");

  const fixture = await catalogFixture();
  const server = createGoalBoardWebServer({ homeDirectory: fixture.homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const sockets: WebSocket[] = [];
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const ptyUrl = `ws://127.0.0.1:${address.port}/pty`;
    const socket = new WebSocket(ptyUrl);
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", (error) => reject(error));
    });
    const ready = waitForPtyMessage(socket, (value) => value.type === "ready", "auth-ready");
    socket.send(JSON.stringify({ type: "auth", token: WEB_TEST_CONTROL_TOKEN }));
    await ready;
    const spawned = waitForPtyMessage(
      socket,
      (value) => value.type === "spawned" && value.panelId === "grok-help",
      "grok-spawned",
    );
    const help = waitForPtyMessage(
      socket,
      (value) => value.type === "data" && /(--resume|-r\b|Usage|usage)/i.test(String(value.data)),
      "grok-help",
      12_000,
    );
    socket.send(JSON.stringify({
      type: "spawn",
      panelId: "grok-help",
      command: "grok",
      args: ["--help"],
      cols: 80,
      rows: 24,
    }));
    await spawned;
    await help;
    socket.send(JSON.stringify({ type: "kill", panelId: "grok-help" }));
  } finally {
    for (const socket of sockets) socket.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Codex resume launch records host session on the same Goal panel", async () => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "goalboard-desktop-resume-"));
  const workspace = join(homeDirectory, "repo");
  mkdirSync(workspace);
  const catalog = await GoalBoardProjectCatalog.open({ homeDirectory });
  try {
    const project = await catalog.createProject({ display_name: "resume", actor_id: "user" });
    const panel = catalog.openDesktopPanel({
      project_id: project.project_id,
      goal_id: "GOAL-A",
      runtime_kind: "codex",
      launch_command: desktopLaunchSpec({ runtime_kind: "codex", resume_session_id: "thread-keep" }).command,
      launch_args: desktopLaunchSpec({ runtime_kind: "codex", resume_session_id: "thread-keep" }).args,
      cwd: workspace,
      host_session_id: "thread-keep",
      actor_id: "user",
      user_confirmed: true,
    });
    assert.equal(panel.host_session_id, "thread-keep");
    assert.deepEqual(panel.launch_args, ["resume", "thread-keep"]);
    assert.equal(
      catalog.findDesktopPanelByWorkContext("codex", "thread-keep")?.panel_id,
      panel.panel_id,
    );
    catalog.markDesktopPanelExited(panel.panel_id);
    assert.equal(catalog.getDesktopPanel(panel.panel_id).status, "exited");
    assert.equal(catalog.markDesktopPanelOpen(panel.panel_id).status, "open");
  } finally {
    catalog.close();
  }
});

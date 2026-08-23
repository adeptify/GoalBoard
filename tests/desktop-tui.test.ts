import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { WebSocket, type RawData } from "ws";
import { desktopAdvancePrompt } from "../src/desktop/advance-prompt.js";
import { desktopLaunchSpec, desktopPanelEnv } from "../src/desktop/launch.js";
import { GoalBoardProjectCatalog } from "../src/projects/catalog.js";
import { GoalBoardCoordinator } from "../src/v1/coordinator.js";
import { DEMO_BOARD_ID, seedDemoBoard } from "../src/v1/demo.js";
import { SqliteGoalBoardStore } from "../src/v1/store.js";
import { resolveWebControlToken, WEB_CONTROL_TOKEN_RELATIVE_PATH } from "../src/web/control-token.js";
import {
  GoalBoardPtyHost,
  buildPtyEnvironment,
  isPtyCommandAvailable,
  resolveNvmBinDirectory,
  resolvePtyCommand,
} from "../src/web/pty-host.js";
import {
  renderGoalBoardWeb,
  renderGoalBoardWorkbenchClientScript,
  renderGoalBoardWorkbenchStylesheet,
} from "../src/web/render.js";
import {
  buildGoalBoardWebView,
  createGoalBoardWebServer as createBaseGoalBoardWebServer,
} from "../src/web/server.js";

const WEB_TEST_CONTROL_TOKEN = "goalboard-web-test-control-token-0123456789abcdef";
const PTY_CLIENT_SOURCE = readFileSync(new URL("../src/web/pty-client.ts", import.meta.url), "utf8");
const DESKTOP_CAPABILITIES = JSON.parse(
  readFileSync(new URL("../desktop/src-tauri/capabilities/default.json", import.meta.url), "utf8"),
) as { permissions?: string[] };
let webRequestSequence = 0;

test("Runtime stays available as a workspace view instead of an independently collapsed dock", () => {
  assert.doesNotMatch(PTY_CLIENT_SOURCE, /goalboard:tui:collapsed/);
  assert.doesNotMatch(PTY_CLIENT_SOURCE, /setTuiCollapsed/);
  assert.doesNotMatch(PTY_CLIENT_SOURCE, /initTuiCollapse/);
});

test("desktop capability permits the custom title bar to drag its window", () => {
  assert.ok(DESKTOP_CAPABILITIES.permissions?.includes("core:window:allow-start-dragging"));
});

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

async function openAuthedPty(port: number): Promise<WebSocket> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/pty`);
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", (error) => reject(error));
  });
  const ready = waitForPtyMessage(socket, (value) => value.type === "ready", "auth-ready");
  socket.send(JSON.stringify({ type: "auth", token: WEB_TEST_CONTROL_TOKEN }));
  await ready;
  return socket;
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

function addProjectAcceptedGoal(
  project: { database_path: string; board_id: string },
  goalId: string,
  title: string,
  decompositionState: "closed_leaf" | "closed_compound",
): void {
  const store = new SqliteGoalBoardStore(project.database_path);
  try {
    new GoalBoardCoordinator(store).createGoal(
      project.board_id,
      {
        goal_id: goalId,
        title,
        outcome: `${title} 有明确结果`,
        why: "验证终端始终归属于一条具体 Goal",
        business_logic: decompositionState === "closed_compound"
          ? "上层 Goal 只汇总子 Goal；具体工作在子 Goal 中完成。"
          : "这条 Goal 可以独立推进和交付。",
        definition_state: "accepted",
        decomposition_state: decompositionState,
        acceptance_criteria: [
          {
            criterion_id: `${goalId}-done`,
            statement: `${title} 可以验收`,
            decision_method: "inspection",
            pass_condition: "能明确判断结果是否完成",
          },
        ],
      },
      { actor_id: "test-user", idempotency_key: `desktop-tui-accepted-${goalId}` },
    );
  } finally {
    store.close();
  }
}

function addProjectChildRelation(
  project: { database_path: string; board_id: string },
  childGoalId: string,
  parentGoalId: string,
): void {
  const store = new SqliteGoalBoardStore(project.database_path);
  try {
    new GoalBoardCoordinator(store).addRelation(
      project.board_id,
      {
        from_goal_id: childGoalId,
        to_goal_id: parentGoalId,
        type: "part_of",
        reason: "具体工作在子 Goal 中完成，上层 Goal 只汇总结果",
      },
      { actor_id: "test-user", idempotency_key: `desktop-tui-child-${childGoalId}-${parentGoalId}` },
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
    catalog.bindRuntimeContext({
      context: {
        runtime_id: "generic",
        stable_work_context_id: `desktop-tui-workspace-${created.project_id}`,
        host_declares_stable: true,
        workspace: { canonical_path: homeDirectory, realpath_verified: false },
      },
      project_id: created.project_id,
      actor_id: "test-user",
      user_confirmed: true,
      binding_scope: "workspace_default",
    });
    const project = catalog.getProject(created.project_id);
    return { homeDirectory, project };
  } finally {
    catalog.close();
  }
}

test("desktop Skill reads GOALBOARD_GOAL_ID and does not auto-claim", () => {
  const projectConnection = readFileSync(
    join(process.cwd(), "skills/goal-advance/references/project-connection.md"),
    "utf8",
  );
  assert.match(projectConnection, /GOALBOARD_GOAL_ID/);
  assert.match(projectConnection, /Do not call `select_goal`, `claim`, or `run_start` merely because the terminal exists/);
  assert.match(projectConnection, /opened this Runtime beside that Goal/);
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
  assert.equal(env.GOALBOARD_WEB_URL, "http://127.0.0.1:4173");
  assert.equal(
    desktopPanelEnv({
      homeDirectory: "/tmp/goalboard-home",
      runtimeId: "opencode",
      panelId: "panel-1",
      workContextId: "panel-1",
      goalId: "LEAF-1",
      webUrl: "http://127.0.0.1:4321",
    }).GOALBOARD_WEB_URL,
    "http://127.0.0.1:4321",
  );
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
    const hostNodeDir = dirname(process.execPath).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(env.PATH ?? "", new RegExp(`(^|:)${hostNodeDir}(:|$)`));
    assert.notEqual(resolvePtyCommand("node", env.PATH), "node");
    assert.equal(isPtyCommandAvailable("node", env.PATH), true);
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

test("nvm major-version aliases resolve to an installed Node bin", () => {
  const nvmDir = mkdtempSync(join(tmpdir(), "goalboard-nvm-alias-"));
  mkdirSync(join(nvmDir, "alias", "lts"), { recursive: true });
  mkdirSync(join(nvmDir, "versions", "node", "v24.9.0", "bin"), { recursive: true });
  mkdirSync(join(nvmDir, "versions", "node", "v24.14.0", "bin"), { recursive: true });
  writeFileSync(join(nvmDir, "alias", "default"), "24\n");
  writeFileSync(join(nvmDir, "alias", "lts", "krypton"), "v24.9.0\n");
  const latest = join(nvmDir, "versions", "node", "v24.14.0", "bin", "node");
  const lts = join(nvmDir, "versions", "node", "v24.9.0", "bin", "node");
  writeFileSync(latest, "#!/bin/sh\nexit 0\n");
  writeFileSync(lts, "#!/bin/sh\nexit 0\n");
  chmodSync(latest, 0o755);
  chmodSync(lts, 0o755);

  assert.equal(resolveNvmBinDirectory(nvmDir), join(nvmDir, "versions", "node", "v24.14.0", "bin"));

  writeFileSync(join(nvmDir, "alias", "default"), "lts/krypton\n");
  assert.equal(resolveNvmBinDirectory(nvmDir), join(nvmDir, "versions", "node", "v24.9.0", "bin"));
});

test("PTY PATH still finds node when NVM_BIN is absent", () => {
  const previousNvmBin = process.env.NVM_BIN;
  delete process.env.NVM_BIN;
  try {
    const env = buildPtyEnvironment();
    assert.notEqual(resolvePtyCommand("node", env.PATH), "node");
    assert.equal(isPtyCommandAvailable("node", env.PATH), true);
  } finally {
    if (previousNvmBin === undefined) delete process.env.NVM_BIN;
    else process.env.NVM_BIN = previousNvmBin;
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
    const workbenchAssets = `<style>${renderGoalBoardWorkbenchStylesheet()}</style><script>${renderGoalBoardWorkbenchClientScript()}</script>`;
    const browser = `${renderGoalBoardWeb(view)}${workbenchAssets}`;
    const desktop = `${renderGoalBoardWeb(view, undefined, false, false, false, "", true)}${workbenchAssets}`;
    const decisions = renderGoalBoardWeb(view, undefined, false, true);
    assert.match(browser, /class="tui-pane"/);
    assert.match(browser, /推进这个 Goal/);
    assert.match(browser, /pty-client\.js/);
    assert.match(browser, /class="workspace is-desktop-tui"/);
    assert.doesNotMatch(decisions, /class="tui-pane"|推进这个 Goal|复制命令|pty-client\.js|data-mobile-target="tui"/);
    assert.match(browser, /data-mobile-target="tui"/);
    assert.match(browser, /aria-controls="goal-tui-pane"/);
    assert.match(browser, /data-tui-kind="claude-code"/);
    assert.match(browser, /data-tui-kind="codex"/);
    assert.match(browser, /data-tui-kind="opencode"/);
    assert.match(browser, /data-tui-kind="pi-agent"/);
    assert.match(browser, /data-tui-kind="grok-build"/);
    assert.match(browser, /data-tui-kind="generic"/);
    assert.match(browser, /常用 Runtime 或自定义命令|请选择具体的子 Goal/);
    assert.match(desktop, /class="tui-pane"/);
    assert.match(desktop, /data-tui-pane/);
    assert.match(desktop, /推进这个 Goal/);
    assert.match(desktop, /填入不发送/);
    assert.match(desktop, /添加终端/);
    assert.match(desktop, /还没有终端|上层 Goal 不直接使用终端/);
    assert.match(desktop, /class="tui-stage"/);
    assert.match(desktop, /\.tui-stage \{[^}]*padding: 10px 12px 12px/);
    assert.match(desktop, /grid-template-areas: "guard" "actions" "terminal"/);
    assert.match(desktop, /class="tui-owner"/);
    assert.match(desktop, /<strong data-tui-owner-title>/);
    assert.match(desktop, /<b>绑定到 Goal<\/b>/);
    assert.match(desktop, /class="tui-mode-label">终端<\/span>/);
    assert.match(desktop, /data-navigator-heading>目标导航/);
    assert.match(desktop, /class="workbench-header desktop-pane-header"/);
    assert.match(desktop, /data-workbench-view="focus"/);
    assert.match(desktop, /data-workbench-view="runtime"/);
    assert.doesNotMatch(desktop, /data-workbench-view="graph"/);
    assert.match(desktop, /data-navigator-view="graph"/);
    assert.match(desktop, /if \(mobileView === "document"\) setWorkspaceMode\("focus", false\)/);
    assert.match(desktop, /if \(mobileView === "tui"\) setWorkspaceMode\("runtime", false\)/);
    assert.match(desktop, /if \(matchMedia\("\(max-width: 760px\)"\)\.matches\) setWorkspaceMode\("focus", false\)/);
    assert.match(desktop, /data-tauri-drag-region/);
    assert.match(desktop, /\.tui-terminal \{ grid-area: terminal;/);
    assert.match(desktop, /\.tui-terminal \.tui-xterm \{[^}]*inset: 10px 12px 12px/);
    assert.match(desktop, /var\(--tui-width, 480px\)/);
    assert.doesNotMatch(desktop, /data-tui-collapse/);
    assert.doesNotMatch(desktop, /data-tui-expand/);
    assert.doesNotMatch(desktop, /<span class="tui-expand-label">/);
    assert.match(desktop, /复制命令/);
    assert.match(desktop, /data-tui-copy/);
    assert.doesNotMatch(desktop, /goalboard:tui-collapse/);
    assert.match(desktop, /\.document-pane::-webkit-scrollbar/);
    assert.match(desktop, /在这个 Goal 上打开终端/);
    assert.match(desktop, /querySelector\("\[data-tree-resizer\]"\)/);
    assert.match(desktop, /treeWidth: parseFloat\(workspace\.style\.getPropertyValue\("--tree-width"\)\)/);
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
    assert.equal(payload.spawn.env.GOALBOARD_WEB_URL, origin);
    assert.equal(payload.spawn.cwd, realpathSync.native(fixture.homeDirectory));

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

test("compound parent terminals become read-only and direct execution APIs require a child Goal", async () => {
  const fixture = await catalogFixture();
  addProjectAcceptedGoal(fixture.project, "TUI-PARENT", "交付完整终端体验", "closed_compound");
  addProjectAcceptedGoal(fixture.project, "TUI-CHILD", "实现具体终端交互", "closed_leaf");
  const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: fixture.homeDirectory });
  let historicalPanelId: string;
  try {
    historicalPanelId = catalog.openDesktopPanel({
      project_id: fixture.project.project_id,
      goal_id: "TUI-PARENT",
      runtime_kind: "generic",
      launch_command: "cat",
      launch_args: [],
      cwd: fixture.homeDirectory,
      actor_id: "test-user",
      user_confirmed: true,
    }).panel_id;
  } finally {
    catalog.close();
  }
  addProjectChildRelation(fixture.project, "TUI-CHILD", "TUI-PARENT");
  const server = createGoalBoardWebServer({ homeDirectory: fixture.homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const prefix = `/projects/${encodeURIComponent(fixture.project.project_id)}`;
    const parentPanelsUrl = `${origin}${prefix}/api/goals/TUI-PARENT/panels`;

    const parentPage = await (await webFetch(`${origin}${prefix}/goals/TUI-PARENT`)).text();
    assert.match(parentPage, /data-tui-parent-read-only="true"/);
    assert.match(parentPage, /data-tui-read-only="true"/);
    assert.match(parentPage, /这个上层 Goal 不直接使用终端/);
    assert.match(parentPage, /实现具体终端交互/);
    assert.match(parentPage, /href="\/projects\/[^\"]+\/goals\/TUI-CHILD"/);
    assert.match(parentPage, /data-tui-add[^>]*disabled/);

    const listed = await webFetch(parentPanelsUrl);
    assert.equal(listed.status, 200);
    const listedBody = await listed.json() as { panels: Array<{ panel_id: string }>; read_only: boolean };
    assert.equal(listedBody.read_only, true);
    assert.deepEqual(listedBody.panels.map((panel) => panel.panel_id), [historicalPanelId]);

    const createBlocked = await webFetch(parentPanelsUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runtime_kind: "generic", command: "cat" }),
    });
    assert.equal(createBlocked.status, 409);
    assert.match(await createBlocked.text(), /具体的子 Goal/);

    const promptBlocked = await webFetch(`${origin}${prefix}/api/goals/TUI-PARENT/advance-prompt`);
    assert.equal(promptBlocked.status, 409);
    assert.match(await promptBlocked.text(), /不能直接推进/);

    const reopenBlocked = await webFetch(
      `${origin}${prefix}/api/panels/${encodeURIComponent(historicalPanelId)}/reopen`,
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
    );
    assert.equal(reopenBlocked.status, 409);
    assert.match(await reopenBlocked.text(), /只能查看/);

    const childOpened = await webFetch(`${origin}${prefix}/api/goals/TUI-CHILD/panels`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runtime_kind: "generic", command: "cat" }),
    });
    assert.equal(childOpened.status, 200, await childOpened.clone().text());

    const completionStore = new SqliteGoalBoardStore(fixture.project.database_path);
    try {
      completionStore.db
        .prepare("UPDATE goals SET fulfillment_state = 'satisfied' WHERE goal_id IN (?, ?)")
        .run("TUI-CHILD", "TUI-PARENT");
      // This test-only fixture mutation bypasses the coordinator, so publish a
      // matching cursor event just as every supported product write does.
      completionStore.appendEvent({
        eventId: "desktop-tui-compound-completed",
        boardId: fixture.project.board_id,
        actorId: "test-user",
        type: "test.fixture.updated",
        objectType: "goal",
        objectId: "TUI-PARENT",
        reason: "测试复合 Goal 完成后的只读终端",
        payload: { child_goal_id: "TUI-CHILD" },
        at: new Date().toISOString(),
      });
    } finally {
      completionStore.close();
    }

    const completedParentPage = await (await webFetch(`${origin}${prefix}/goals/TUI-PARENT`)).text();
    assert.match(completedParentPage, /data-tui-parent-read-only="true"/);
    assert.match(completedParentPage, /这项工作已经由子 Goal 完成/);
    assert.match(completedParentPage, /data-tui-add[^>]*disabled/);

    const completedListed = await webFetch(parentPanelsUrl);
    assert.equal(completedListed.status, 200);
    assert.equal((await completedListed.json() as { read_only: boolean }).read_only, true);

    const completedCreateBlocked = await webFetch(parentPanelsUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runtime_kind: "generic", command: "cat" }),
    });
    assert.equal(completedCreateBlocked.status, 409);

    const completedPromptBlocked = await webFetch(`${origin}${prefix}/api/goals/TUI-PARENT/advance-prompt`);
    assert.equal(completedPromptBlocked.status, 409);

    const completedReopenBlocked = await webFetch(
      `${origin}${prefix}/api/panels/${encodeURIComponent(historicalPanelId)}/reopen`,
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
    );
    assert.equal(completedReopenBlocked.status, 409);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("TUI client rejects cross-Goal and parent writes before touching the PTY channel", () => {
  const client = readFileSync(join(process.cwd(), "src/web/pty-client.ts"), "utf8");
  assert.match(client, /const canControlPanel/);
  assert.match(client, /panel\.goal_id === goalId\(\)/);
  assert.match(client, /term\.onData\(\(data\) => \{\s+const panel[\s\S]+if \(!canControlPanel\(panel\)\) return;/);
  assert.match(client, /mode === "start" \|\| mode === "reopen"/);
  assert.match(client, /panelLoadSequence/);
  assert.match(client, /parentReadOnly/);
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

test("PTY host attaches live sessions and refuses to spawn without a working directory", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "goalboard-pty-host-"));
  let resolveHello: (() => void) | undefined;
  const hello = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("PTY host did not emit hello")), 8_000);
    resolveHello = () => {
      clearTimeout(timer);
      resolve();
    };
  });
  const host = new GoalBoardPtyHost({
    onData: (_panelId, data) => {
      if (data.includes("hello")) resolveHello?.();
    },
    onExit: () => undefined,
  });
  try {
    assert.equal(host.alive("p1"), false);
    assert.deepEqual(
      host.spawn({ panelId: "p1", attachOnly: true }),
      { attached: false, started: false, replay: "" },
    );
    assert.throws(
      () => host.spawn({ panelId: "p1", command: "/bin/sh" }),
      /工作目录/,
    );
    const started = host.spawn({
      panelId: "p1",
      command: "/bin/sh",
      args: ["-c", "printf hello; exec cat"],
      cwd,
      cols: 80,
      rows: 24,
    });
    assert.equal(started.started, true);
    assert.equal(started.attached, false);
    await hello;
    const attached = host.spawn({ panelId: "p1", attachOnly: true, cols: 80, rows: 24 });
    assert.equal(attached.attached, true);
    assert.equal(attached.started, false);
    assert.match(attached.replay, /hello/);
    assert.equal(host.alive("p1"), true);
    host.kill("p1");
    assert.equal(host.alive("p1"), false);
    assert.deepEqual(
      host.spawn({ panelId: "p1", attachOnly: true }),
      { attached: false, started: false, replay: "" },
    );
  } finally {
    host.killAll();
  }
});

test("local PTY socket auths with the page token and can spawn a process", async () => {
  const fixture = await catalogFixture();
  const server = createGoalBoardWebServer({ homeDirectory: fixture.homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const sockets: WebSocket[] = [];
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
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

    const socket = await openAuthedPty(address.port);
    sockets.push(socket);
    const spawned = waitForPtyMessage(socket, (value) => value.type === "spawned" && value.panelId === "pty-smoke" && value.attached !== true, "spawned");
    const echoed = waitForPtyMessage(socket, (value) => (
      value.type === "data" && value.panelId === "pty-smoke" && String(value.data).includes("hello")
    ), "echo");
    socket.send(JSON.stringify({
      type: "spawn",
      panelId: "pty-smoke",
      command: "/bin/sh",
      args: ["-c", "printf hello; exec cat"],
      cwd: fixture.homeDirectory,
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
      cwd: fixture.homeDirectory,
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
    const socket = await openAuthedPty(address.port);
    sockets.push(socket);

    const missingPanel = waitForPtyMessage(
      socket,
      (value) => value.type === "error" && /缺少面板/.test(String(value.message ?? "")),
      "missing-panel",
    );
    socket.send(JSON.stringify({ type: "spawn", attachOnly: true }));
    await missingPanel;

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
      cwd: fixture.homeDirectory,
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
    const socket = await openAuthedPty(address.port);
    sockets.push(socket);
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
      cwd: fixture.homeDirectory,
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

test("opening a terminal without a project workspace is rejected", async () => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "goalboard-desktop-nows-"));
  const catalog = await GoalBoardProjectCatalog.open({ homeDirectory });
  let projectId = "";
  try {
    const created = await catalog.createProject({ display_name: "无目录项目", actor_id: "test-user" });
    projectId = created.project_id;
    addProjectGoal(created, "NO-WS", "没有工作目录");
  } finally {
    catalog.close();
  }
  const server = createGoalBoardWebServer({ homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const opened = await webFetch(
      `http://127.0.0.1:${address.port}/projects/${encodeURIComponent(projectId)}/api/goals/NO-WS/panels`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runtime_kind: "generic", command: "/bin/sh" }),
      },
    );
    assert.equal(opened.status, 400);
    assert.match(await opened.text(), /工作目录/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("PTY spawn sets PWD to the working directory and attach-only does not start a new process", async () => {
  const fixture = await catalogFixture();
  const server = createGoalBoardWebServer({ homeDirectory: fixture.homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const sockets: WebSocket[] = [];
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const socket = await openAuthedPty(address.port);
    sockets.push(socket);

    const attachedMiss = waitForPtyMessage(
      socket,
      (value) => value.type === "spawned" && value.panelId === "pty-attach" && value.attached === false && value.started === false,
      "attach-miss",
    );
    socket.send(JSON.stringify({
      type: "spawn",
      panelId: "pty-attach",
      attachOnly: true,
      cols: 80,
      rows: 24,
    }));
    await attachedMiss;

    const cwdPrinted = waitForPtyMessage(
      socket,
      (value) => value.type === "data" && String(value.data).includes(fixture.homeDirectory),
      "pwd",
    );
    socket.send(JSON.stringify({
      type: "spawn",
      panelId: "pty-pwd",
      command: "/bin/sh",
      args: ["-c", 'printf "%s" "$PWD"'],
      cwd: fixture.homeDirectory,
      cols: 80,
      rows: 24,
    }));
    await cwdPrinted;
  } finally {
    for (const socket of sockets) socket.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("deleting a panel kills the PTY on the server", async () => {
  const fixture = await catalogFixture();
  addProjectGoal(fixture.project, "TUI-KILL", "关闭即停");
  const server = createGoalBoardWebServer({ homeDirectory: fixture.homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const sockets: WebSocket[] = [];
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const opened = await webFetch(
      `${origin}/projects/${encodeURIComponent(fixture.project.project_id)}/api/goals/TUI-KILL/panels`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runtime_kind: "generic", command: "/bin/cat" }),
      },
    );
    assert.equal(opened.status, 200, await opened.clone().text());
    const payload = await opened.json() as { panel: { panel_id: string } };
    const socket = await openAuthedPty(address.port);
    sockets.push(socket);
    const spawned = waitForPtyMessage(
      socket,
      (value) => value.type === "spawned" && value.panelId === payload.panel.panel_id && value.started === true,
      "spawned",
    );
    socket.send(JSON.stringify({
      type: "spawn",
      panelId: payload.panel.panel_id,
      command: "/bin/cat",
      cwd: fixture.homeDirectory,
      cols: 80,
      rows: 24,
    }));
    await spawned;
    const closed = await webFetch(
      `${origin}/projects/${encodeURIComponent(fixture.project.project_id)}/api/panels/${encodeURIComponent(payload.panel.panel_id)}`,
      { method: "DELETE" },
    );
    assert.equal(closed.status, 200, await closed.clone().text());
    const writeError = waitForPtyMessage(
      socket,
      (value) => value.type === "error" && /终端进程不存在/.test(String(value.message ?? "")),
      "write-after-delete",
    );
    socket.send(JSON.stringify({ type: "write", panelId: payload.panel.panel_id, data: "x" }));
    await writeError;
  } finally {
    for (const socket of sockets) socket.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("control token persists in the GoalBoard home across server restarts", () => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "goalboard-web-token-"));
  const first = resolveWebControlToken({ homeDirectory });
  const second = resolveWebControlToken({ homeDirectory });
  assert.equal(first, second);
  assert.match(first, /^[A-Za-z0-9_-]{32,}$/);
  const stored = readFileSync(join(homeDirectory, WEB_CONTROL_TOKEN_RELATIVE_PATH), "utf8").trim();
  assert.equal(stored, first);
});

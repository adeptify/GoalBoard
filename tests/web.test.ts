import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Script } from "node:vm";
import { GoalBoardCoordinator } from "../src/v1/coordinator.js";
import { DEMO_BOARD_ID, seedDemoBoard } from "../src/v1/demo.js";
import { SqliteGoalBoardStore } from "../src/v1/store.js";
import { GoalBoardProjectCatalog } from "../src/projects/catalog.js";
import { RuntimeIntegrationService } from "../src/install/runtime-integration.js";
import { GoalBoardWebServiceManager } from "../src/install/web-service.js";
import { GoalBoardServer } from "../src/mcp/server.js";
import {
  GOAL_TREE_STATUS_ORDER,
  activeOutgoingDependsOn,
  displayedPassedCriterionIds,
  firstBlockedDescendant,
  renderGoalRecordEventsFragment,
  renderGoalRecordsFragment,
  renderGoalBoardWorkbenchClientScript,
  renderGoalBoardWorkbenchStylesheet,
  renderGoalBoardWeb,
  sortGoalTreeItems,
  unsatisfiedOutgoingDependencies,
  WEB_GOAL_STATUSES,
  WEB_GOAL_EVENT_PAGE_SIZE,
} from "../src/web/render.js";
import {
  buildGoalBoardWebView,
  cachedGoalBoardWebView,
  createGoalBoardWebServer as createBaseGoalBoardWebServer,
} from "../src/web/server.js";

const WEB_TEST_CONTROL_TOKEN = "goalboard-web-test-control-token-0123456789abcdef";
const WORKBENCH_CLIENT_SCRIPT = renderGoalBoardWorkbenchClientScript();
const WORKBENCH_STYLES = renderGoalBoardWorkbenchStylesheet();
let webRequestSequence = 0;

test("completed Goal presentation closes criteria without inventing Evidence", () => {
  const item = {
    status: "satisfied",
    goal: {
      fulfillment_state: "satisfied",
      acceptance_criteria: [
        { criterion_id: "ROOT-C1" },
        { criterion_id: "ROOT-C2" },
      ],
    },
    passed_criteria: [],
  } as unknown as Parameters<typeof displayedPassedCriterionIds>[0];

  assert.deepEqual(displayedPassedCriterionIds(item), ["ROOT-C1", "ROOT-C2"]);
  assert.deepEqual(item.passed_criteria, [], "presentation must not fabricate canonical Evidence facts");

  item.status = "execution_pending";
  item.goal.fulfillment_state = "unmet";
  item.passed_criteria = ["ROOT-C1", "UNKNOWN"];
  assert.deepEqual(displayedPassedCriterionIds(item), ["ROOT-C1"]);
});

test("Goal Tree sorts ready work before blocked, waiting, and finished Goals", () => {
  assert.deepEqual([...GOAL_TREE_STATUS_ORDER].sort(), [...WEB_GOAL_STATUSES].sort());
  const ordered = sortGoalTreeItems([
    { status: "satisfied", goal: { priority: 9, created_at: "2026-01-01T00:00:00.000Z" } },
    { status: "waiting_children", goal: { priority: 8, created_at: "2026-01-02T00:00:00.000Z" } },
    { status: "execution_blocked", goal: { priority: 7, created_at: "2026-01-03T00:00:00.000Z" } },
    { status: "clarification_pending", goal: { priority: 6, created_at: "2026-01-04T00:00:00.000Z" } },
    { status: "executing", goal: { priority: 1, created_at: "2026-01-06T00:00:00.000Z" } },
    { status: "execution_pending", goal: { priority: 1, created_at: "2026-01-05T00:00:00.000Z" } },
    { status: "execution_pending", goal: { priority: 3, created_at: "2026-01-07T00:00:00.000Z" } },
  ]);
  assert.deepEqual(ordered.map((item) => [item.status, item.goal.priority, item.goal.created_at]), [
    ["execution_pending", 3, "2026-01-07T00:00:00.000Z"],
    ["execution_pending", 1, "2026-01-05T00:00:00.000Z"],
    ["executing", 1, "2026-01-06T00:00:00.000Z"],
    ["clarification_pending", 6, "2026-01-04T00:00:00.000Z"],
    ["execution_blocked", 7, "2026-01-03T00:00:00.000Z"],
    ["waiting_children", 8, "2026-01-02T00:00:00.000Z"],
    ["satisfied", 9, "2026-01-01T00:00:00.000Z"],
  ]);
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
    headers.set("x-goalboard-idempotency-key", `web-test-request-${webRequestSequence}`);
  }
  return globalThis.fetch(input, { ...init, headers });
}

function rawHttpGet(port: number, path: string, hostHeader: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: "127.0.0.1", port, path, headers: { host: hostHeader } }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
    });
    request.on("error", reject);
    request.end();
  });
}

function assertInlineScriptsCompile(html: string): void {
  const scripts = Array.from(html.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/g));
  for (const [, source] of scripts) {
    if (!source.trim() || source.trim().startsWith("{")) continue;
    assert.doesNotThrow(() => new Script(source), "rendered inline script must be valid JavaScript");
  }
}

function webFixture() {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-"));
  const databasePath = join(directory, "demo.db");
  seedDemoBoard(databasePath);
  return { databasePath };
}

test("Web View cache follows canonical Board events instead of SQLite file lifecycle", () => {
  const { databasePath } = webFixture();
  const cache = new Map() as Parameters<typeof cachedGoalBoardWebView>[0];
  const options = { databasePath, boardId: DEMO_BOARD_ID, demo: true };

  const firstStore = new SqliteGoalBoardStore(databasePath);
  const first = cachedGoalBoardWebView(
    cache,
    firstStore,
    new GoalBoardCoordinator(firstStore),
    options,
  );
  firstStore.close();

  const reopenedStore = new SqliteGoalBoardStore(databasePath);
  try {
    const coordinator = new GoalBoardCoordinator(reopenedStore);
    const unchanged = cachedGoalBoardWebView(cache, reopenedStore, coordinator, options);
    assert.strictEqual(unchanged, first, "opening the SQLite WAL must not invalidate an unchanged Board");

    coordinator.createGoal(
      DEMO_BOARD_ID,
      {
        goal_id: "CACHE-EVENT",
        title: "通过事件使 Web View 失效",
        outcome: "",
        why: "",
        business_logic: "",
        definition_state: "draft",
        decomposition_state: "abstract",
        acceptance_criteria: [],
      },
      { actor_id: "test-user", idempotency_key: "web-cache-event" },
    );
    const changed = cachedGoalBoardWebView(cache, reopenedStore, coordinator, options);
    assert.notStrictEqual(changed, first);
    assert.ok(changed.goals.some((item) => item.goal.goal_id === "CACHE-EVENT"));

  } finally {
    reopenedStore.close();
  }
});

async function webProjectCatalogFixture() {
  const homeDirectory = mkdtempSync(join(tmpdir(), "goalboard-web-project-catalog-"));
  const alphaContext = {
    runtime_id: "web-project-test-runtime",
    stable_work_context_id: "web-project-alpha-session",
    host_declares_stable: true,
  };
  const betaContext = {
    runtime_id: "web-project-test-runtime",
    stable_work_context_id: "web-project-beta-session",
    host_declares_stable: true,
  };
  const catalog = await GoalBoardProjectCatalog.open({ homeDirectory });
  try {
    const alphaResolution = await catalog.createProjectAndBindRuntimeContext({
      context: alphaContext,
      display_name: "产品 Alpha",
      actor_id: "test-user",
      user_confirmed: true,
      idempotency_key: "web-project-alpha-create",
    });
    const betaResolution = await catalog.createProjectAndBindRuntimeContext({
      context: betaContext,
      display_name: "产品 Beta",
      actor_id: "test-user",
      user_confirmed: true,
      idempotency_key: "web-project-beta-create",
    });
    assert.ok(alphaResolution.project);
    assert.ok(betaResolution.project);
    return {
      homeDirectory,
      alpha: catalog.getProject(alphaResolution.project.project_id),
      beta: catalog.getProject(betaResolution.project.project_id),
      alphaContext,
      betaContext,
      bindingEvents: catalog.listRuntimeContextBindingEvents(),
    };
  } finally {
    catalog.close();
  }
}

function webRuntimeIntegrationFixture(homeDirectory: string) {
  const userHomeDirectory = join(homeDirectory, "test-user-home");
  const release = join(homeDirectory, "releases", "goalboard-web-test");
  const skill = join(release, "skills", "goal-advance");
  const launcher = join(homeDirectory, "bin", "goalboard-mcp");
  const runtimeBin = join(homeDirectory, "test-runtime-bin");
  mkdirSync(join(homeDirectory, "config"), { recursive: true });
  mkdirSync(skill, { recursive: true });
  mkdirSync(join(homeDirectory, "bin"), { recursive: true });
  mkdirSync(runtimeBin, { recursive: true });
  mkdirSync(userHomeDirectory, { recursive: true });
  writeFileSync(join(homeDirectory, "config", "installation.json"), `${JSON.stringify({
    schema_version: 2,
    installer: "goalboard-home-install-v1",
    version: "web-test",
    release_path: "releases/goalboard-web-test",
  }, null, 2)}\n`);
  writeFileSync(join(skill, "SKILL.md"), "---\nname: goal-advance\n---\n");
  writeFileSync(launcher, "#!/bin/sh\nexit 0\n");
  const codex = join(runtimeBin, "codex");
  const claude = join(runtimeBin, "claude");
  const opencode = join(runtimeBin, "opencode");
  const pi = join(runtimeBin, "pi");
  const grok = join(runtimeBin, "grok");
  for (const file of [codex, claude, opencode, pi, grok]) writeFileSync(file, "#!/bin/sh\nexit 0\n");
  [launcher, codex, claude, opencode, pi, grok].forEach((file) => chmodSync(file, 0o755));
  return {
    userHomeDirectory,
    skill,
    launcher,
    service: new RuntimeIntegrationService({
      homeDirectory,
      userHomeDirectory,
      runtimeExecutables: { codex, "claude-code": claude, opencode, "pi-agent": pi, "grok-build": grok },
      validateConnection: () => true,
    }),
  };
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
      { actor_id: "test-user", idempotency_key: `web-project-goal-${goalId}` },
    );
  } finally {
    store.close();
  }
}

function startProjectClarification(
  project: { database_path: string; board_id: string },
  goalId: string,
  actorId: string,
): void {
  const store = new SqliteGoalBoardStore(project.database_path);
  try {
    new GoalBoardCoordinator(store).selectGoalAndStart({
      board_id: project.board_id,
      goal_id: goalId,
      actor_id: actorId,
      role: "clarifier",
      idempotency_key: `web-project-start-${goalId}`,
    });
  } finally {
    store.close();
  }
}

function boardSnapshot(databasePath: string, boardId: string) {
  const store = new SqliteGoalBoardStore(databasePath);
  try {
    return store.snapshot(boardId);
  } finally {
    store.close();
  }
}

test("Web distinguishes automatic parent completion from decomposition confirmation and structural conflicts", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-parent-completion-"));
  const databasePath = join(directory, "goalboard.db");
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  const boardId = "web-parent-completion-board";
  coordinator.initializeBoard({
    board_id: boardId,
    title: "Parent Completion",
    actor_id: "web-user",
    idempotency_key: "parent-completion-init",
  });

  const createGoal = (
    goalId: string,
    title: string,
    definitionState: "draft" | "accepted",
    decompositionState: "frontier_open" | "closed_leaf" | "closed_compound",
  ) => coordinator.createGoal(
    boardId,
    {
      goal_id: goalId,
      title,
      outcome: `${title}的可检查结果`,
      why: "让父子 Goal 的完成关系可预测",
      business_logic: "子 Goal 交付具体结果，父 Goal 按已经确认的拆分方式汇总。",
      definition_state: definitionState,
      decomposition_state: decompositionState,
      acceptance_criteria: [{
        criterion_id: `${goalId}-done`,
        statement: `${title}达到预期结果`,
        decision_method: "inspection" as const,
        pass_condition: "页面说明和实际状态一致",
        required_evidence: ["test"],
      }],
    },
    { actor_id: "web-user", idempotency_key: `create-${goalId}` },
  ).goal;

  createGoal("OPEN-PARENT", "尚未确认拆分结束的父 Goal", "draft", "frontier_open");
  createGoal("OPEN-CHILD", "已经完成的当前子 Goal", "accepted", "closed_leaf");
  coordinator.addRelation(
    boardId,
    {
      from_goal_id: "OPEN-CHILD",
      to_goal_id: "OPEN-PARENT",
      type: "part_of",
      reason: "当前已知拆分的一部分",
    },
    { actor_id: "web-user", idempotency_key: "open-parent-child" },
  );
  store.db.prepare("UPDATE goals SET fulfillment_state = 'satisfied' WHERE goal_id = ?").run("OPEN-CHILD");

  createGoal("COMPOUND-PARENT", "已确认由子 Goal 完成的父 Goal", "accepted", "closed_compound");
  createGoal("COMPOUND-CHILD", "尚未完成的必要子 Goal", "accepted", "closed_leaf");
  coordinator.addRelation(
    boardId,
    {
      from_goal_id: "COMPOUND-CHILD",
      to_goal_id: "COMPOUND-PARENT",
      type: "part_of",
      reason: "确认由这条子 Goal 共同完成父目标",
    },
    { actor_id: "web-user", idempotency_key: "compound-parent-child" },
  );

  createGoal("LEAF-PARENT", "误标为叶子的父 Goal", "accepted", "closed_leaf");
  createGoal("LEAF-CHILD", "与叶子标记冲突的子 Goal", "accepted", "closed_leaf");
  coordinator.addRelation(
    boardId,
    {
      from_goal_id: "LEAF-CHILD",
      to_goal_id: "LEAF-PARENT",
      type: "part_of",
      reason: "暴露叶子 Goal 同时包含子 Goal 的结构冲突",
    },
    { actor_id: "web-user", idempotency_key: "leaf-parent-child" },
  );
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;

    const openPage = await (await webFetch(`${origin}/goals/OPEN-PARENT`)).text();
    assert.match(openPage, /data-goal-id="OPEN-PARENT"[^>]*data-goal-status="compound_closure_pending"/);
    assert.match(openPage, /goal-status--compound_closure_pending[^>]*[\s\S]*?<span>待确认父目标<\/span>/);
    assert.match(openPage, /现有子 Goal 都完成了，但父 Goal 仍标记为尚未拆完，所以不会自动完成/);
    assert.match(openPage, /data-open-goal-tui[^>]*>[\s\S]*确认当前拆分是否完整/);
    assert.match(openPage, /child-progress--needs_confirmation/);
    assert.match(openPage, /现有子 Goal 已完成，父目标待确认/);
    assert.match(openPage, /先确认它们是否已经覆盖整个父目标/);

    const compoundPage = await (await webFetch(`${origin}/goals/COMPOUND-PARENT`)).text();
    assert.match(compoundPage, /child-progress--automatic/);
    assert.match(compoundPage, /子 Goal 完成后自动完成/);
    assert.match(compoundPage, /还剩 1 个子 Goal；全部完成后，这条父 Goal 会自动完成/);

    const leafPage = await (await webFetch(`${origin}/goals/LEAF-PARENT`)).text();
    assert.match(leafPage, /child-progress--conflict/);
    assert.match(leafPage, /父子结构需要确认/);
    assert.match(leafPage, /被标记为可以独立完成，却同时包含子 Goal/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web view derives understandable Goal states from canonical SQLite facts", () => {
  const { databasePath } = webFixture();
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  const now = new Date().toISOString();
  store.db
    .prepare(`
      INSERT INTO coverage_items (
        requirement_id, board_id, statement, disposition, owner_goal_id,
        reason, revisit_condition, blocking, created_at, updated_at
      ) VALUES (?, ?, ?, 'covered', ?, ?, NULL, 0, ?, ?)
    `)
    .run(
      "REQ-WEB-COVERAGE",
      DEMO_BOARD_ID,
      "所有 Goal 事实都能在 Web 中找到",
      "CORE",
      "由富数据 Web 夹具覆盖",
      now,
      now,
    );
  store.db
    .prepare(`
      INSERT INTO input_bindings (
        binding_id, board_id, goal_id, input_name, source_type, source_ref,
        snapshot_digest, state, reason, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)
    `)
    .run(
      "INPUT-WEB-PROFILE",
      DEMO_BOARD_ID,
      "CORE",
      "产品规则",
      "url",
      "https://example.com/goalboard-contract",
      "sha256:web-fixture",
      "验证 Web 引用跳转",
      "test-user",
      now,
    );
  coordinator.addImpact(
    DEMO_BOARD_ID,
    {
      goal_id: "CORE",
      surface: "src/web/render.ts",
      access: "write",
      input_snapshot: "fixture-snapshot",
      reason: "验证完整 Impact 字段",
    },
    { actor_id: "test-user", idempotency_key: "web-rich-impact" },
  );
  coordinator.addRisk(
    DEMO_BOARD_ID,
    {
      risk_id: "RISK-WEB-OVERLOAD",
      goal_ids: ["CORE"],
      description: "字段过多导致信息过载",
      probability: "medium",
      impact: "high",
      affected_surfaces: ["Goal detail", "mobile"],
      trigger: "首屏成为原始字段墙",
      treatment: "mitigate",
      blocking_mode: "none",
      revisit_condition: "独立复核认为无法找到下一步",
      owner: "test-user",
    },
    { actor_id: "test-user", idempotency_key: "web-rich-risk" },
  );
  coordinator.setPolicy(
    DEMO_BOARD_ID,
    {
      goal_id: "CORE",
      policy: { goal_mode: "required", cross_reviewers: 1 },
      reason: "验证策略来源和 resolved policy",
    },
    { actor_id: "test-user", idempotency_key: "web-rich-policy" },
  );
  for (const [index, type] of [
    "conflicts_with",
    "mitigates",
    "extends",
    "replaces",
    "corrects",
    "invalidates",
    "migrates_from",
  ].entries()) {
    coordinator.addRelation(
      DEMO_BOARD_ID,
      {
        from_goal_id: "CORE",
        to_goal_id: "INTERFACES",
        type: type as "conflicts_with",
        state: "proposed",
        reason: `验证 ${type} 关系的完整呈现`,
      },
      { actor_id: "test-user", idempotency_key: `web-relation-${index}` },
    );
  }
  const coreRun = store.snapshot(DEMO_BOARD_ID).runs.find((run) => run.goal_id === "CORE");
  assert.ok(coreRun);
  coordinator.submitDependencyProposal({
    board_id: DEMO_BOARD_ID,
    actor_id: coreRun.actor_id,
    discovered_in_run_id: coreRun.run_id,
    dependencies: [
      {
        from_goal_id: "CORE",
        to_goal_id: "INTERFACES",
        type: "depends_on",
        action: "add",
        reason: "执行闭环需要先有稳定的 CLI 与 MCP 接口",
        basis: "contract_output",
        evidence_refs: [
          "https://example.com/contracts/interfaces",
          "tests/mcp.test.ts",
        ],
        impact_if_rejected: "接口契约可能在执行闭环完成后发生不兼容变化",
        confidence: 0.88,
        direction_reason: "CORE 消费 INTERFACES 的调用结果，INTERFACES 不消费 CORE 的运行证据",
      },
    ],
    idempotency_key: "web-dependency-proposal",
  });
  const view = buildGoalBoardWebView(store, coordinator, {
    databasePath,
    boardId: DEMO_BOARD_ID,
    demo: true,
  });
  assert.equal(view.active_goal_id, "V1");
  assert.equal(view.counts.satisfied, 1);
  assert.equal(view.counts.executing, 1);
  assert.equal(view.counts.execution_blocked, 4);
  assert.equal(view.counts.clarification_pending, 1);
  assert.equal(view.counts.waiting_children, 4);
  assert.equal(view.goals.find((item) => item.goal.goal_id === "V1")?.status, "waiting_children");
  assert.match(
    view.goals.find((item) => item.goal.goal_id === "WEB")?.reasons[0]?.message ?? "",
    /前置 Goal/,
  );
  assert.equal(view.coverage[0]?.requirement_id, "REQ-WEB-COVERAGE");
  assert.equal(view.input_bindings[0]?.snapshot_digest, "sha256:web-fixture");
  assert.ok(view.policy_bindings.length > 0);
  assert.ok(view.events.length > 0);
  const core = view.goals.find((item) => item.goal.goal_id === "CORE");
  assert.ok(core);
  assert.ok(core.claims.length > 0);
  assert.ok(core.runs.length > 0);
  assert.ok(core.relations.some((item) => item.type === "corrects"));
  assert.equal(core.impacts[0]?.input_snapshot, "fixture-snapshot");
  assert.equal(core.risks[0]?.trigger, "首屏成为原始字段墙");
  assert.equal(core.coverage[0]?.statement, "所有 Goal 事实都能在 Web 中找到");
  assert.equal(core.input_bindings[0]?.source_ref, "https://example.com/goalboard-contract");
  assert.ok(core.events.some((item) => item.object_id === "RISK-WEB-OVERLOAD"));
  assert.ok(core.events.some((item) => item.type === "rewire.proposed"));
  const interfaces = view.goals.find((item) => item.goal.goal_id === "INTERFACES");
  assert.ok(interfaces?.events.some((item) => item.type === "candidate.submitted"));
  const historyDialogue = coordinator.startDraftDialogue({
    board_id: DEMO_BOARD_ID,
    actor_id: "runtime-history-clarifier",
    goal_id: "RELEASE",
    rough_idea: "为发布检查补充一条影响接口交付的拆分建议。",
    idempotency_key: "web-history-dialogue",
  });
  assert.ok(historyDialogue.run);
  coordinator.submitGoalTreeProposal({
    board_id: DEMO_BOARD_ID,
    actor_id: "runtime-history-clarifier",
    discovered_in_run_id: historyDialogue.run.run_id,
    root_goal_id: "RELEASE",
    summary: "从 RELEASE 的澄清上下文中补充 INTERFACES 的一条待确认变更。",
    items: [
      {
        item_id: "web-history-cross-goal-item",
        kind: "goal",
        operation: "update",
        payload: { goal_id: "INTERFACES", priority: 81 },
        source_refs: ["tests/web.test.ts#event-ledger"],
        reason: "验证非根 Goal 也能查到影响它的 Goal Tree Proposal。",
        confidence: 0.9,
        affected_objects: [{ object_type: "goal", object_id: "INTERFACES" }],
      },
    ],
    idempotency_key: "web-history-cross-goal-tree-proposal",
  }).proposal;
  const historyView = buildGoalBoardWebView(store, coordinator, {
    databasePath,
    boardId: DEMO_BOARD_ID,
    demo: true,
  });
  assert.ok(
    historyView.goals
      .find((item) => item.goal.goal_id === "INTERFACES")
      ?.events.some((item) => item.type === "goal_tree_proposal.submitted"),
  );
  const historyDecisionHtml = renderGoalBoardWeb(historyView, undefined, false, true);
  const historyRootHtml = renderGoalBoardWeb(historyView, "RELEASE");
  assert.match(historyDecisionHtml, /data-goal-tree-decision-form/);
  assert.match(historyDecisionHtml, /这份 Goal 方案要采用，还是退回修改/);
  assert.match(historyDecisionHtml, /data-goal-tree-proposal-id=/);
  assert.match(historyDecisionHtml, /name="item_id" value="web-history-cross-goal-item"/);
  assert.match(historyDecisionHtml, /采用整份方案/);
  assert.match(historyDecisionHtml, /<details class="decision-details goal-tree-proposal-changes"><summary><span>查看采用后的 1 项变化/);
  assert.match(historyDecisionHtml, /展开查看每项变化/);
  assert.match(historyRootHtml, /处理 \d+ 项决定/);
  const pageHtml = renderGoalBoardWeb(view);
  const corePageHtml = renderGoalBoardWeb(view, "CORE");
  // Keep this broad presentation contract checking the same assembled workbench
  // surface even though production now serves the shared assets separately.
  const html = `${pageHtml}<style>${WORKBENCH_STYLES}</style><script>${WORKBENCH_CLIENT_SCRIPT}</script>`;
  const coreHtml = `${corePageHtml}<style>${WORKBENCH_STYLES}</style><script>${WORKBENCH_CLIENT_SCRIPT}</script>`;
  const recordsFragment = renderGoalRecordsFragment(view, "V1");
  const coreRecordsFragment = renderGoalRecordsFragment(view, "CORE");
  assert.ok(recordsFragment);
  assert.ok(coreRecordsFragment);
  const decisionPageHtml = renderGoalBoardWeb(view, undefined, false, true);
  const decisionHtml = `${decisionPageHtml}<style>${WORKBENCH_STYLES}</style><script>${WORKBENCH_CLIENT_SCRIPT}</script>`;
  assert.ok(html.startsWith("<!--\nTHESIS:"));
  assert.equal((html.match(/data-goal-view=/g) ?? []).length, 1);
  assert.match(html, /data-goal-view="V1"/);
  assert.doesNotMatch(html, /data-goal-view="CORE"/);
  assert.equal((coreHtml.match(/data-goal-view=/g) ?? []).length, 1);
  assert.match(coreHtml, /data-goal-view="CORE"/);
  assert.match(html, /等待子 Goal/);
  assert.equal((html.match(/data-goal-section=/g) ?? []).length, 6);
  assert.match(html, /role="tablist" aria-label="Goal 详情"/);
  assert.equal((html.match(/data-goal-tab="(?:overview|completion|progress|factors|records)"/g) ?? []).length, 5);
  assert.equal((html.match(/data-goal-panel="(?:overview|completion|progress|factors|records)"/g) ?? []).length, 5);
  assert.match(html, /data-goal-tab="overview"[^>]*aria-selected="true"|aria-selected="true"[^>]*data-goal-tab="overview"/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /setGoalPanel\(goalTab\.dataset\.goalTab, true, true, false\)/);
  assert.match(html, /data-goal-panel="completion" hidden|hidden[^>]*data-goal-panel="completion"/);
  assert.match(html, /aria-controls="goal-panel-overview-V1"/);
  assert.match(html, /aria-labelledby="goal-tab-overview-V1"/);
  assert.match(html, /下一步/);
  assert.match(html, /目标说明/);
  assert.match(html, /完成要求/);
  assert.match(html, /进展与阻塞/);
  assert.match(html, /关联与约束/);
  assert.match(html, /完整记录/);
  assert.ok(html.indexOf('data-goal-panel="overview"') < html.indexOf('data-goal-panel="completion"'));
  assert.ok(html.indexOf('data-goal-panel="completion"') < html.indexOf('data-goal-panel="progress"'));
  assert.ok(html.indexOf('data-goal-panel="progress"') < html.indexOf('data-goal-panel="factors"'));
  assert.ok(html.indexOf('data-goal-panel="factors"') < html.indexOf('data-goal-panel="records"'));
  assert.equal((html.match(/data-goal-factor-tab="(?:relations|risks|impacts|rules)"/g) ?? []).length, 4);
  assert.match(html, /name="direction" required/);
  assert.match(html, /name="type" required/);
  assert.equal((html.match(/data-goal-factor-panel="(?:relations|risks|impacts|rules)"/g) ?? []).length, 4);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /data-factor-write-receipt/);
  assert.match(WORKBENCH_STYLES, /\.factor-write-receipt \{/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /showFactorReceipt\(\s*"relations"/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /showFactorReceipt\(\s*"risks"/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /showFactorReceipt\(\s*"impacts"/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /showFactorReceipt\(\s*"rules"/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /请填写解除原因。说明这条关系为什么不再成立。/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /请填写停用原因。说明这条影响范围为什么不再有效。/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /\.replaceAll\("Impact", "影响范围"\)/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /\.replaceAll\("Policy", "工作规则"\)/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /\.replaceAll\("Runtime", "执行工具"\)/);
  assert.match(html, /data-open-quick-record/);
  assert.match(html, /data-quick-record-type="evidence"/);
  assert.match(html, /data-quick-record-type="risk"/);
  assert.match(html, /data-quick-record-type="impact"/);
  assert.match(html, /data-quick-record-type="relation"/);
  assert.equal((html.match(/class="goal-primary-action"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /<section class="goal-technical"[^>]*>/);
  assert.match(html, /data-goal-records-content data-loaded="false"/);
  assert.match(recordsFragment, /<section class="goal-technical"[^>]*>/);
  assert.doesNotMatch(recordsFragment, /查看执行细节|goal-execution-details/);
  assert.match(recordsFragment, /领取、推进、完成依据和检查记录/);
  assert.match(html, /为什么现在做/);
  assert.match(recordsFragment, /目标标识、负责人、时间、状态和完整工作边界/);
  assert.match(recordsFragment, /当前状态/);
  assert.match(recordsFragment, /class="contract-list"/);
  assert.doesNotMatch(recordsFragment, /class="contract-grid"/);
  assert.match(recordsFragment, /包含什么/);
  assert.match(recordsFragment, /明确不做/);
  assert.match(recordsFragment, /必须遵守/);
  assert.match(recordsFragment, /需要的输入/);
  assert.match(recordsFragment, /承诺的输出/);
  assert.match(html, /Goal 关系/);
  assert.match(html, /上游/);
  assert.match(html, /下游/);
  assert.match(recordsFragment, /Claim 历史/);
  assert.match(recordsFragment, /Run 历史/);
  assert.match(recordsFragment, /风险与影响/);
  const pagedView = structuredClone(view);
  const pagedGoal = pagedView.goals.find((item) => item.goal.goal_id === "V1");
  assert.ok(pagedGoal);
  pagedGoal.events = Array.from({ length: WEB_GOAL_EVENT_PAGE_SIZE * 2 + 5 }, (_, index) => ({
    seq: index + 1,
    event_id: `EVENT-${index + 1}`,
    actor_id: "pagination-test",
    type: `event.type.${index + 1}`,
    object_type: "goal",
    object_id: "V1",
    reason: `事件 ${index + 1}`,
    payload: { index: index + 1 },
    at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
  }));
  const firstEventPage = renderGoalRecordsFragment(pagedView, "V1");
  const secondEventPage = renderGoalRecordEventsFragment(pagedView, "V1", "current", WEB_GOAL_EVENT_PAGE_SIZE);
  const finalEventPage = renderGoalRecordEventsFragment(pagedView, "V1", "current", WEB_GOAL_EVENT_PAGE_SIZE * 2);
  assert.ok(firstEventPage);
  assert.ok(secondEventPage);
  assert.ok(finalEventPage);
  assert.equal((firstEventPage.match(/data-goal-event-seq=/g) ?? []).length, WEB_GOAL_EVENT_PAGE_SIZE);
  assert.match(firstEventPage, new RegExp(`data-next-offset="${WEB_GOAL_EVENT_PAGE_SIZE}"`));
  assert.match(firstEventPage, /加载更早记录/);
  assert.equal((secondEventPage.match(/data-goal-event-seq=/g) ?? []).length, WEB_GOAL_EVENT_PAGE_SIZE);
  assert.match(secondEventPage, new RegExp(`data-next-offset="${WEB_GOAL_EVENT_PAGE_SIZE * 2}"`));
  assert.match(secondEventPage, /data-has-more="true"/);
  assert.equal((finalEventPage.match(/data-goal-event-seq=/g) ?? []).length, 5);
  assert.match(finalEventPage, /data-has-more="false"/);
  const renderedSequences = [firstEventPage, secondEventPage, finalEventPage]
    .flatMap((fragment) => Array.from(fragment.matchAll(/data-goal-event-seq="(\d+)"/g), (match) => Number(match[1])));
  assert.deepEqual(renderedSequences, Array.from({ length: WEB_GOAL_EVENT_PAGE_SIZE * 2 + 5 }, (_, index) => WEB_GOAL_EVENT_PAGE_SIZE * 2 + 5 - index));
  assert.match(html, /工作规则/);
  assert.match(html, /项目默认规则/);
  assert.match(html, /为当前 Goal 增加要求/);
  assert.match(html, /<details class="policy-source policy-source--goal">/);
  assert.match(html, /data-policy-form/);
  assert.doesNotMatch(html, /data-live-form="policy-project_default-/);
  assert.match(html, /data-live-form="policy-goal-/);
  assert.match(html, /name="required_capabilities"/);
  assert.match(html, /name="max_lease_seconds"/);
  assert.doesNotMatch(recordsFragment, /data-(?:relation|risk|impact|evidence|policy)[a-z-]*-form/);
  assert.match(recordsFragment, /基础信息/);
  assert.match(recordsFragment, /执行与检查/);
  assert.match(recordsFragment, /变更历史/);
  assert.match(recordsFragment, /关联与规则记录/);
  assert.match(html, /待决定/);
  assert.match(html, /打开不会自动发送或领取/);
  assert.match(html, /示例数据/);
  assert.match(html, /data-tree-root/);
  assert.match(html, /class="goal-tree" data-tree-root/);
  assert.match(html, /class="tree-children"/);
  assert.match(html, /开始前必须等哪些 Goal 完成[\s\S]*让每项工作都有可信的完成依据/);
  assert.match(coreHtml, /验证 corrects 关系的完整呈现/);
  assert.match(coreHtml, /字段过多导致信息过载/);
  assert.match(coreHtml, /fixture-snapshot/);
  assert.match(coreRecordsFragment, /REQ-WEB-COVERAGE/);
  assert.match(coreRecordsFragment, /sha256:web-fixture/);
  assert.match(coreRecordsFragment, /href="https:\/\/example.com\/goalboard-contract"/);
  assert.match(coreRecordsFragment, /data-copy-value/);
  assert.match(html, /data-select-goal/);
  assert.match(html, /class="tree-chrome"/);
  assert.match(html, /class="tree-search"/);
  assert.match(html, /data-global-search/);
  assert.equal((html.match(/<input type="search" data-global-search/g) ?? []).length, 1);
  assert.match(html, /data-settings-link/);
  assert.match(html, /class="project-bar"/);
  assert.match(html, /class="project-decisions/);
  assert.match(html, /@media \(max-width: 1180px\)[\s\S]*\.top-action span \{ display: none; \}/);
  assert.doesNotMatch(html, /class="tree-heading"|class="global-search"|class="top-filter-control"/);
  assert.equal((html.match(/data-open-create aria-label="新建目标"/g) ?? []).length, 1);
  assert.match(html, /class="tree-filter-control">[\s\S]*data-tree-filter-trigger[\s\S]*id="tree-status-filter"/);
  assert.match(html, /data-tree-filter-trigger aria-expanded="false" aria-controls="tree-status-filter"/);
  assert.match(html, /id="tree-status-filter" data-tree-filter hidden aria-label="按状态筛选"/);
  assert.match(html, /可同时选择多个状态；会与关键词搜索一起生效。/);
  assert.match(html, /data-status-filter/);
  assert.match(html, /data-goal-status="executing"/);
  assert.match(html, /data-clear-status-filter/);
  assert.match(html, /data-clear-tree-filter/);
  assert.match(html, /statuses: \[\.\.\.selectedStatuses\]/);
  assert.match(html, /selectedStatuses\.size === 0 \|\| selectedStatuses\.has\(item\.dataset\.goalStatus\)/);
  assert.match(html, /if \(event\.key === "Escape" && !treeFilter\?\.hidden\)/);
  assert.match(html, /treeFilterTrigger\?\.addEventListener\("click", \(event\) =>/);
  assert.match(html, /event\.stopPropagation\(\);/);
  assert.match(html, /if \(treeFilter\.hidden\) return;/);
  assert.match(html, /firstStatusFilter\.focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(html, /const filterTrigger = target\.closest\("\[data-tree-filter-trigger\]"\)/);
  assert.match(html, /event\.target instanceof Element/);
  assert.doesNotMatch(html, /data-focus-filter/);
  assert.match(html, /data-open-create/);
  assert.match(html, /data-open-create aria-label="新建目标"/);
  assert.match(html, /data-create-dialog/);
  assert.match(html, /它属于哪个更大的 Goal？/);
  assert.match(html, /只决定 Tree 中放在哪里，不要求上级 Goal 先完成/);
  assert.match(html, /开始前必须等哪些 Goal 完成？/);
  assert.match(html, /这会成为领取和完成的硬门禁/);
  assert.match(html, /关系预览：新 Goal 将作为独立 Goal/);
  assert.match(html, /关系预览：当前没有执行前置/);
  assert.match(html, /<option value="V1" data-goal-name="让第一次使用的人顺利完成一轮目标协作">让第一次使用的人顺利完成一轮目标协作 · V1<\/option>/);
  assert.match(html, /role="tablist" aria-label="移动端视图"/);
  assert.match(html, /role="tab" aria-selected="true" aria-controls="goal-tree-pane"/);
  assert.match(html, /button\.setAttribute\("aria-selected", String\(active\)\)/);
  assert.match(html, /data-sync-state/);
  assert.match(html, /setInterval\(refreshBoard, 4000\)/);
  assert.match(html, /fetch\(route\("\/api\/board\/cursor"\)/);
  assert.match(html, /\/document\?view=" \+ documentCollection/);
  assert.match(html, /const setGoalDocumentBusy = \(busy\) =>/);
  assert.match(html, /documentPane\.setAttribute\("aria-busy", "true"\)/);
  assert.match(html, /dataset\.goalDocumentLoading = "true"/);
  assert.match(html, /setGoalDocumentBusy\(true\)[\s\S]*fetch\(/);
  assert.match(html, /\.document-pane\[aria-busy="true"\] > \[data-goal-view\]/);
  assert.match(html, /body\[data-navigation-pending="true"\]::before/);
  assert.match(html, /searchComposing = true/);
  assert.match(html, /noteSearchActivity\(\)/);
  assert.doesNotMatch(html, /fetch\(route\("\/api\/board"\)/);
  assert.doesNotMatch(html, /document\.hidden \|\| dialog\.open/);
  assert.match(html, /const createDraft = dialog\.open \? readCreateDraft\(\) : null/);
  assert.match(html, /applyCreateDraft\(createDraft\)/);
  assert.match(html, /document\.activeElement\?\.closest\?\.\("\[data-live-form\]"\)/);
  assert.match(html, /form\?\.addEventListener\("change", updateRelationPreviews\)/);
  assert.match(html, /sessionStorage\.setItem/);
  assert.match(html, /data-tree-scroll/);
  assert.match(html, /data-tree-scroll tabindex="0" aria-label="Goal Tree 目标列表"/);
  assert.match(html, /\.tree-pane \{[^}]*min-height: 0;[^}]*overflow: hidden;/);
  assert.match(html, /\.tree-scroll \{[^}]*overflow-y: auto;[^}]*scrollbar-width: none;[^}]*-ms-overflow-style: none;/);
  assert.match(html, /\.tree-scroll::\-webkit-scrollbar \{ display: none; \}/);
  assert.match(html, /treeScroll\.addEventListener\("keydown"/);
  assert.match(html, /End: treeScroll\.scrollHeight/);
  assert.match(html, /data-tree-resizer/);
  assert.match(html, /role="separator" aria-label="调整 Goal Tree 宽度"/);
  assert.match(html, /treeWidth: parseFloat\(workspace\.style\.getPropertyValue\("--tree-width"\)\) \|\| treePane\.getBoundingClientRect\(\)\.width/);
  assert.match(html, /querySelector\("\[data-tree-resizer\]"\)/);
  assert.match(html, /treeResizer\??\.addEventListener\("pointermove"/);
  assert.match(html, /treeResizer\??\.addEventListener\("keydown"/);
  assert.match(html, /tree-copy"><strong>让第一次使用的人顺利完成一轮目标协作<\/strong><small>V1<\/small>/);
  assert.match(html, /icon-search/);
  assert.match(html, /data-goal-section="progress"/);
  assert.match(html, /data-goal-section="now"/);
  assert.match(html, /const setGoalPanel =/);
  assert.match(html, /goalPanelFromHash/);
  assert.match(html, /\["ArrowLeft", "ArrowRight", "Home", "End"\]/);
  assert.match(html, /父 Goal 如何完成/);
  assert.match(html, /href="\/goals\/PLATFORM"/);
  assert.match(recordsFragment, /id="execution-V1"/);
  assert.match(html, /id="acceptance-V1"/);
  assert.match(html, /data-collapse-all aria-label="折叠全部"/);
  assert.match(html, /class="tree-dep is-waiting"/);
  assert.match(html, /class="tree-dep is-ready"/);
  assert.match(html, /页面显示必须和不同 Runtime 看到的项目进度一致/);
  assert.match(html, /共享项目进度前，必须先保证每项工作的状态和完成依据可靠/);
  assert.match(html, /还在等它完成/);
  assert.match(html, /已完成，不再挡住/);
  assert.match(html, /data-tree-relations/);
  assert.match(html, /个前置/);
  assert.match(html, /role="tablist" aria-label="Goal 视图"/);
  assert.match(html, /data-navigator-view="list"/);
  assert.match(html, /data-navigator-view="graph"/);
  assert.match(html, /data-goal-graph/);
  assert.match(html, /data-graph-node/);
  assert.match(html, /data-graph-edge/);
  assert.match(html, /data-graph-zoom="in"/);
  assert.match(html, /data-navigator-heading/);
  assert.match(html, /data-companion-runtime/);
  assert.match(html, /data-companion-runtime-open/);
  assert.match(html, /desktopCompanionActive && selected \? "document"/);
  assert.match(html, /const setWorkspaceMode =/);
  assert.match(html, /workspace\.dataset\.workspaceMode = nextMode/);
  assert.doesNotMatch(html, /data-workbench-view="graph"/);
  assert.match(html, /marker-start="url\(#goal-graph-start-part_of\)"/);
  assert.match(html, /marker-start="url\(#goal-graph-start-depends_on\)"/);
  assert.match(html, /graph-orbit--inner/);
  assert.match(html, /graph-orbit--middle/);
  assert.match(html, /graph-orbit--outer/);
  assert.match(html, /data-graph-ring=/);
  assert.match(html, /--graph-x:/);
  assert.match(html, /data-edge-type="part_of"/);
  assert.match(html, /data-edge-type="depends_on"/);
  assert.match(html, /graphRelationTypes = new Set\(\["part_of", "depends_on"\]\)/);
  assert.match(html, /const setNavigatorView =/);
  assert.match(html, /const drawGoalGraph =/);
  assert.match(html, /target\.closest\("button\[data-navigator-view\]"\)/);
  assert.doesNotMatch(html, /api\/goals\/[^"']+\/graph/);
  assert.match(html, /<span class="tree-dep-copy"><strong>让不同 AI 对话看到同一项目进度<\/strong>/);
  assert.match(recordsFragment, /class="scope-gaps"/);
  assert.match(recordsFragment, /还有 \d+ 项未写|范围、输入与输出尚未填写/);
  const webGoal = view.goals.find((item) => item.goal.goal_id === "WEB");
  const v1Goal = view.goals.find((item) => item.goal.goal_id === "V1");
  const interfacesGoal = view.goals.find((item) => item.goal.goal_id === "INTERFACES");
  assert.ok(webGoal && v1Goal && interfacesGoal);
  assert.equal(activeOutgoingDependsOn(webGoal)[0]?.to_goal_id, "INTERFACES");
  assert.deepEqual(
    unsatisfiedOutgoingDependencies(webGoal, view).map((item) => item.goal.goal_id),
    ["INTERFACES"],
  );
  assert.deepEqual(
    unsatisfiedOutgoingDependencies(interfacesGoal, view).map((item) => item.goal.goal_id),
    [],
  );
  const blockedDescendant = firstBlockedDescendant(v1Goal, view);
  assert.ok(blockedDescendant);
  assert.match(blockedDescendant.status, /(?:blocked|invalidated)$/);
  assert.match(html, /class="goal-more"/);
  assert.match(html, /aria-label="更多操作"/);
  assert.ok(html.indexOf("class=\"goal-title-actions\"") < html.indexOf("class=\"goal-more\""));
  assert.doesNotMatch(
    html.slice(html.indexOf("class=\"goal-title-actions\""), html.indexOf("class=\"goal-more\"")),
    /data-open-goal-trash|data-goal-archive/,
  );
  assert.match(html, /data-open-goal-trash/);
  assert.doesNotMatch(html, /EFFECTIVE POLICY/);
  assert.doesNotMatch(html, /class="goal-decision-notice"/);
  assert.match(coreHtml, /href="\/decisions#decision-goal-CORE"/);
  assert.match(coreHtml, /处理 \d+ 项决定/);
  assert.doesNotMatch(html, /<form class="decision-record rewire-decision"/);
  assert.doesNotMatch(decisionHtml, /USER AUTHORITY/);
  assert.match(decisionHtml, /data-board-view="decisions"/);
  assert.match(decisionHtml, /data-goal-graph/);
  assert.match(decisionHtml, /href="\/goals\/CORE"><strong>让每项工作都有可信的完成依据<\/strong>/);
  assert.match(decisionHtml, /decision-kind decision-kind--risk/);
  assert.match(decisionHtml, /风险处理 <strong>2<\/strong>/);
  assert.match(decisionHtml, /用户接入 Runtime 后没有新开会话，误以为安装失败/);
  assert.match(decisionHtml, /字段过多导致信息过载/);
  assert.match(decisionHtml, /risk-goal-links/);
  assert.match(decisionHtml, /保存风险决定/);
  assert.match(decisionHtml, /data-risk-state-form[^>]*novalidate/);
  assert.match(decisionHtml, /<option value="" selected disabled>请选择处理结果<\/option>/);
  assert.doesNotMatch(decisionHtml, /<option value="open" selected/);
  assert.match(decisionHtml, /请选择风险处理结果，再保存。/);
  assert.match(decisionHtml, /决定理由（必填）/);
  assert.match(decisionHtml, /请填写决定理由。说明你为什么这样选择，以及依据是什么。/);
  assert.match(decisionHtml, /submit\.textContent = L\("正在保存…"\)/);
  assert.match(decisionHtml, /要调整这些 Goal 的先后或归属关系吗？/);
  assert.match(decisionHtml, /这些决定属于/);
  assert.match(decisionHtml, /为什么现在要决定/);
  assert.match(decisionHtml, /选完会发生什么/);
  assert.match(decisionHtml, /现在没有足够依据给出可靠建议/);
  assert.match(decisionHtml, /data-decision-receipt/);
  assert.match(decisionHtml, /link\.href = context\.goalHref/);
  assert.doesNotMatch(decisionHtml, /link\.href = route\(context\.goalHref\)/);
  assert.match(decisionHtml, /为什么是这个方向/);
  assert.match(decisionHtml, /CORE 消费 INTERFACES 的调用结果/);
  assert.match(decisionHtml, /可信度 88%/);
  assert.match(decisionHtml, /href="https:\/\/example.com\/contracts\/interfaces"/);
  assert.match(decisionHtml, /href="\/api\/project-references\/tests%2Fmcp.test.ts"[^>]*data-project-reference/);
  assert.match(decisionHtml, /<form class="decision-record rewire-decision"/);
  assert.match(decisionHtml, /name="reason"[\s\S]*决定理由或修改意见|决定理由或修改意见[\s\S]*name="reason"/);
  assert.match(html, /\.decision-record \{ min-width: 0;/);
  assert.match(html, /\.dependency-proposal-list \{ width: 100%; min-width: 0;/);
  assert.match(html, /\.dependency-evidence \.inline-ref span \{[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/);
  assert.match(html, /\.candidate-contract \{ grid-template-columns: 1fr; \}/);
  assert.match(html, /\.create-dialog \{ width: 100vw; max-width: none; height: 100vh; max-height: none; margin: 0; border-radius: 0; \}/);
  assert.doesNotMatch(html, /track-map|class="signal"|signal-box|railway/i);
  assert.match(html, /class="tui-pane"/);
  assert.match(html, /推进这个 Goal/);
  assert.match(html, /复制命令/);
  assert.match(html, /pty-client\.js/);
  assert.match(html, /class="workspace is-desktop-tui"/);
  assert.doesNotMatch(decisionHtml, /class="tui-pane"|推进这个 Goal|复制命令|pty-client\.js|class="workspace is-desktop-tui"/);
  store.close();
});

test("Decision Center keeps canonical risk and rewire results visible after pending cards disappear", () => {
  const { databasePath } = webFixture();
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.addRisk(
    DEMO_BOARD_ID,
    {
      risk_id: "RISK-RESULT-VISIBILITY",
      goal_ids: ["CORE"],
      description: "保存决定后用户无法确认结果是否生效",
      probability: "high",
      impact: "用户会重复操作或放弃当前流程",
      affected_surfaces: ["Decision Center"],
      trigger: "待决定卡片消失且没有可核对结果",
      treatment: "mitigate",
      blocking_mode: "completion",
      revisit_condition: "风险结果能够跨刷新持续显示",
      owner: "test-user",
    },
    { actor_id: "test-user", idempotency_key: "web-result-risk-create" },
  );
  coordinator.setRiskState(
    DEMO_BOARD_ID,
    { risk_id: "RISK-RESULT-VISIBILITY", state: "accepted", reason: "已明确接受影响，继续推进" },
    { actor_id: "test-user", idempotency_key: "web-result-risk-accept" },
  );
  const coreRun = store.snapshot(DEMO_BOARD_ID).runs.find((run) => run.goal_id === "CORE");
  assert.ok(coreRun);
  const rewire = coordinator.submitDependencyProposal({
    board_id: DEMO_BOARD_ID,
    actor_id: coreRun.actor_id,
    discovered_in_run_id: coreRun.run_id,
    dependencies: [
      {
        from_goal_id: "CORE",
        to_goal_id: "RELEASE",
        type: "depends_on",
        action: "add",
        reason: "核心闭环需要先确认发布边界",
        basis: "business_sequence",
        evidence_refs: ["tests/web.test.ts#decision-result-visibility"],
        impact_if_rejected: "核心闭环可能在发布范围不稳定时完成",
        confidence: 0.95,
        direction_reason: "CORE 消费 RELEASE 的发布边界，RELEASE 不消费 CORE 的实现结果",
      },
    ],
    idempotency_key: "web-result-rewire-propose",
  }).rewire;
  const applied = coordinator.confirmRewire({
    board_id: DEMO_BOARD_ID,
    rewire_id: rewire.rewire_id,
    actor_id: "test-user",
    actor_kind: "user",
    decision: "confirmed",
    reason: "关系方向和依据已经核对",
    idempotency_key: "web-result-rewire-confirm",
  }).rewire;
  const relationId = String((applied.impact.added_relation_ids as string[])[0]);
  assert.ok(relationId);
  coordinator.addRisk(
    DEMO_BOARD_ID,
    {
      risk_id: "RISK-RESULT-NOOP",
      goal_ids: ["WEB"],
      description: "风险继续观察，暂时不关闭",
      probability: "medium",
      impact: "后续仍需回来决定",
      affected_surfaces: ["Decision Center"],
      trigger: "观察到新的失败信号",
      treatment: "defer",
      blocking_mode: "none",
      revisit_condition: "下一轮验证完成",
      owner: "test-user",
    },
    { actor_id: "test-user", idempotency_key: "web-result-noop-risk-create" },
  );
  coordinator.setRiskState(
    DEMO_BOARD_ID,
    { risk_id: "RISK-RESULT-NOOP", state: "open", reason: "接受现状，后续再看" },
    { actor_id: "test-user", idempotency_key: "web-result-noop-risk-open" },
  );
  const newRewire = coordinator.submitDependencyProposal({
    board_id: DEMO_BOARD_ID,
    actor_id: coreRun.actor_id,
    discovered_in_run_id: coreRun.run_id,
    dependencies: [
      {
        from_goal_id: "RELEASE",
        to_goal_id: "WEB",
        type: "depends_on",
        action: "add",
        reason: "发布入口需要等待 Web 使用路径稳定",
        basis: "business_sequence",
        evidence_refs: ["tests/web.test.ts#new-decision"],
        impact_if_rejected: "用户可能在页面路径尚未稳定时进入发布流程",
        confidence: 0.9,
        direction_reason: "RELEASE 消费 WEB 的用户操作路径",
      },
    ],
    idempotency_key: "web-result-new-rewire",
  }).rewire;

  const view = buildGoalBoardWebView(store, coordinator, {
    databasePath,
    boardId: DEMO_BOARD_ID,
    routePrefix: "/projects/project-test",
  });
  const decisionHtml = renderGoalBoardWeb(view, undefined, false, true);
  const goalHtml = renderGoalBoardWeb(view, "CORE");
  assert.match(decisionHtml, /class="decision-results"/);
  assert.ok(
    decisionHtml.indexOf('class="decision-groups"') < decisionHtml.indexOf('class="decision-results"'),
    "pending decisions should appear before recent results",
  );
  assert.match(decisionHtml, /最近处理结果/);
  assert.match(decisionHtml, /保存决定后用户无法确认结果是否生效/);
  assert.match(decisionHtml, /当前结果：已接受。当前状态不再施加领取或完成门禁。/);
  assert.match(decisionHtml, /你的理由：已明确接受影响，继续推进/);
  assert.match(decisionHtml, /当前结果：待处理，仍会留在待决定中。/);
  assert.match(decisionHtml, /你的理由：接受现状，后续再看/);
  assert.match(decisionHtml, /让每项工作都有可信的完成依据 → 依赖 → 让新用户安装后知道下一步怎么开始/);
  assert.match(decisionHtml, /你的理由：关系方向和依据已经核对/);
  assert.match(
    decisionHtml,
    /href="\/projects\/project-test\/goals\/CORE#risk-RISK-RESULT-VISIBILITY"/,
  );
  assert.match(
    decisionHtml,
    new RegExp(`href="/projects/project-test/goals/CORE#relation-${relationId}"`),
  );
  assert.doesNotMatch(decisionHtml, /\/projects\/project-test\/projects\/project-test/);
  assert.match(goalHtml, new RegExp(`id="relation-${relationId}"`));
  assert.doesNotMatch(decisionHtml, /data-risk-id="RISK-RESULT-VISIBILITY"/);
  assert.doesNotMatch(decisionHtml, new RegExp(`data-rewire-id="${rewire.rewire_id}"`));
  assert.match(decisionHtml, /data-risk-id="RISK-RESULT-NOOP"/);
  const newRewireForm = decisionHtml.match(
    new RegExp(`<form class="decision-record rewire-decision"[^>]*data-rewire-id="${newRewire.rewire_id}"[\\s\\S]*?</form>`),
  )?.[0];
  assert.ok(newRewireForm);
  assert.match(newRewireForm, /新事项/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /保存后仍会留在待决定中。\{effect\}/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /决定已记录，但这次没有新增或解除 Goal 关系，也没有新增风险。/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /风险保持待处理，仍会留在待决定中，并继续按当前规则影响关联 Goal。/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /风险已接受，不再阻止关联 Goal。/);
  store.close();
});

test("Web project catalog switches browser scope without exposing storage or changing Runtime bindings", async () => {
  const fixture = await webProjectCatalogFixture();
  addProjectGoal(fixture.alpha, "ALPHA-ONLY", "仅 Alpha 可见的 Goal");
  addProjectGoal(fixture.beta, "BETA-ONLY", "仅 Beta 可见的 Goal");
  startProjectClarification(fixture.alpha, "ALPHA-ONLY", "runtime-alpha");
  startProjectClarification(fixture.beta, "BETA-ONLY", "runtime-beta");
  const alphaBeforeSwitch = boardSnapshot(fixture.alpha.database_path, fixture.alpha.board_id);
  const betaBeforeSwitch = boardSnapshot(fixture.beta.database_path, fixture.beta.board_id);

  const server = createGoalBoardWebServer({ homeDirectory: fixture.homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const alphaPrefix = `/projects/${encodeURIComponent(fixture.alpha.project_id)}`;
    const betaPrefix = `/projects/${encodeURIComponent(fixture.beta.project_id)}`;

    const projectIndex = await (await webFetch(`${origin}/`)).text();
    assert.match(projectIndex, /选择一个项目/);
    assert.match(projectIndex, /产品 Alpha/);
    assert.match(projectIndex, /产品 Beta/);
    assert.match(projectIndex, new RegExp(`href="${alphaPrefix}"`));
    assert.match(projectIndex, new RegExp(`href="${betaPrefix}"`));
    assert.doesNotMatch(projectIndex, new RegExp(fixture.alpha.database_path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(projectIndex, /数据源:|board_id/);
    assert.match(projectIndex, /\.project-index-page > \.topbar \{ height: 58px; \}/);
    assert.match(projectIndex, /\.project-index \{ min-height: calc\(100dvh - 58px\)/);
    assert.match(projectIndex, /\.project-list a:hover \{ background: color-mix\(in srgb, var\(--blue-soft\) 58%, var\(--paper\)\); \}/);
    assert.match(projectIndex, /\.project-index-migration \{[^}]*background: var\(--rail\)/);

    const desktopProjectIndex = await (await webFetch(`${origin}/?desktop=1`)).text();
    assert.match(desktopProjectIndex, /<body class="project-index-page" data-desktop-shell="true">/);
    assert.match(desktopProjectIndex, /<header class="topbar" data-tauri-drag-region>/);
    assert.match(desktopProjectIndex, /class="top-spacer" data-tauri-drag-region/);

    const capsulePage = await (await webFetch(`${origin}/desktop/capsule?desktop=1`)).text();
    assert.match(capsulePage, /工作胶囊/);
    assert.match(capsulePage, /产品 Alpha/);
    assert.match(capsulePage, /产品 Beta/);
    assert.match(capsulePage, /data-capsule-project/);
    assert.doesNotMatch(capsulePage, /database_path|goalboard\.db/);
    assertInlineScriptsCompile(capsulePage);

    const missingSelection = await webFetch(`${origin}/api/board`);
    assert.equal(missingSelection.status, 400);
    assert.match(await missingSelection.text(), /请先选择一个 GoalBoard 项目/);

    const alphaPage = await (await webFetch(`${origin}${alphaPrefix}/goals/ALPHA-ONLY`)).text();
    assert.match(alphaPage, /项目：<\/strong><span>产品 Alpha/);
    assert.match(alphaPage, /切换项目/);
    assert.match(alphaPage, /仅 Alpha 可见的 Goal/);
    assert.doesNotMatch(alphaPage, /仅 Beta 可见的 Goal|数据源:|goalboard\.db/);
    assert.match(alphaPage, new RegExp(`data-route-prefix="${alphaPrefix}"`));
    assert.match(alphaPage, new RegExp(`href="${alphaPrefix}/decisions"`));
    assert.match(alphaPage, /href="\/assets\/goalboard-workbench\.css"/);
    assert.match(alphaPage, /src="\/assets\/goalboard-workbench\.js"/);
    assert.doesNotMatch(alphaPage, /<style>/);
    assert.doesNotMatch(alphaPage, /const loadGoalDocument = async/);
    assert.match(WORKBENCH_STYLES, /body \{[^}]*height: 100dvh;/);
    assert.match(WORKBENCH_STYLES, /\.app \{[^}]*height: 100dvh;/);
    assert.match(WORKBENCH_STYLES, /\.workspace \{[^}]*height: 100%;/);
    assert.match(WORKBENCH_STYLES, /\.app \{[^}]*grid-template-rows: 58px minmax\(0, 1fr\)/);
    assert.equal((alphaPage.match(/data-goal-view=/g) ?? []).length, 1);

    const stylesheetResponse = await webFetch(`${origin}/assets/goalboard-workbench.css`);
    assert.equal(stylesheetResponse.status, 200);
    assert.match(stylesheetResponse.headers.get("content-type") ?? "", /text\/css/);
    assert.equal(stylesheetResponse.headers.get("cache-control"), "private, max-age=0, must-revalidate");
    const stylesheetEtag = stylesheetResponse.headers.get("etag");
    assert.ok(stylesheetEtag);
    assert.equal(await stylesheetResponse.text(), WORKBENCH_STYLES);
    const revalidatedStylesheet = await webFetch(`${origin}/assets/goalboard-workbench.css`, {
      headers: { "if-none-match": stylesheetEtag },
    });
    assert.equal(revalidatedStylesheet.status, 304);
    assert.equal(await revalidatedStylesheet.text(), "");

    const clientResponse = await webFetch(`${origin}/assets/goalboard-workbench.js`);
    assert.equal(clientResponse.status, 200);
    assert.match(clientResponse.headers.get("content-type") ?? "", /text\/javascript/);
    assert.ok(clientResponse.headers.get("etag"));
    assert.equal(await clientResponse.text(), WORKBENCH_CLIENT_SCRIPT);
    assert.doesNotThrow(() => new Script(WORKBENCH_CLIENT_SCRIPT));

    const alphaCursorResponse = await webFetch(`${origin}${alphaPrefix}/api/board/cursor`);
    assert.equal(alphaCursorResponse.status, 200);
    const alphaCursorText = await alphaCursorResponse.text();
    assert.ok(alphaCursorText.length < 100);
    assert.equal(typeof (JSON.parse(alphaCursorText) as { observed_event_cursor: number }).observed_event_cursor, "number");

    const alphaCapsuleResponse = await webFetch(`${origin}${alphaPrefix}/api/capsule`);
    assert.equal(alphaCapsuleResponse.status, 200);
    const alphaCapsule = (await alphaCapsuleResponse.json()) as {
      project: { project_id: string; display_name: string };
      state: { kind: string; action_path: string };
    };
    assert.equal(alphaCapsule.project.project_id, fixture.alpha.project_id);
    assert.equal(alphaCapsule.project.display_name, "产品 Alpha");
    assert.match(alphaCapsule.state.action_path, new RegExp(`^${alphaPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

    const betaCapsuleResponse = await webFetch(`${origin}${betaPrefix}/api/capsule`);
    assert.equal(betaCapsuleResponse.status, 200);
    const betaCapsule = (await betaCapsuleResponse.json()) as {
      project: { project_id: string; display_name: string };
      state: { kind: string; action_path: string };
    };
    assert.equal(betaCapsule.project.project_id, fixture.beta.project_id);
    assert.equal(betaCapsule.project.display_name, "产品 Beta");
    assert.match(betaCapsule.state.action_path, new RegExp(`^${betaPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.deepEqual(
      boardSnapshot(fixture.alpha.database_path, fixture.alpha.board_id),
      alphaBeforeSwitch,
      "reading another Project in the capsule must not change Alpha work",
    );
    assert.deepEqual(
      boardSnapshot(fixture.beta.database_path, fixture.beta.board_id),
      betaBeforeSwitch,
      "reading another Project in the capsule must not change Beta work",
    );

    const alphaDocumentResponse = await webFetch(
      `${origin}${alphaPrefix}/api/goals/ALPHA-ONLY/document?view=current`,
    );
    assert.equal(alphaDocumentResponse.status, 200);
    const alphaDocument = await alphaDocumentResponse.text();
    assert.match(alphaDocument, /data-goal-view="ALPHA-ONLY"/);
    assert.match(alphaDocument, /仅 Alpha 可见的 Goal/);
    assert.doesNotMatch(alphaDocument, /<!doctype html>|仅 Beta 可见的 Goal/);
    const alphaEventPage = await webFetch(
      `${origin}${alphaPrefix}/api/goals/ALPHA-ONLY/record-events?view=current&offset=0`,
    );
    assert.equal(alphaEventPage.status, 200);
    assert.match(await alphaEventPage.text(), /data-goal-event-page/);
    assert.equal(
      (await webFetch(`${origin}${alphaPrefix}/api/goals/ALPHA-ONLY/record-events?view=current&offset=-1`)).status,
      400,
    );
    assert.equal(
      (await webFetch(`${origin}${alphaPrefix}/api/goals/ALPHA-ONLY/document?view=trash`)).status,
      404,
    );
    assert.equal(
      (await webFetch(`${origin}${alphaPrefix}/api/goals/ALPHA-ONLY/document?view=unknown`)).status,
      400,
    );

    const betaPage = await (await webFetch(`${origin}${betaPrefix}/goals/BETA-ONLY`)).text();
    assert.match(betaPage, /项目：<\/strong><span>产品 Beta/);
    assert.match(betaPage, /仅 Beta 可见的 Goal/);
    assert.doesNotMatch(betaPage, /仅 Alpha 可见的 Goal/);

    const alphaBoardResponse = await webFetch(`${origin}${alphaPrefix}/api/board`);
    assert.equal(alphaBoardResponse.status, 200);
    const alphaBoardText = await alphaBoardResponse.text();
    assert.doesNotMatch(alphaBoardText, new RegExp(fixture.alpha.database_path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const alphaBoard = JSON.parse(alphaBoardText) as {
      project: { display_name: string } | null;
      snapshot: { board: { board_id: string } };
      goals: Array<{ goal: { goal_id: string } }>;
    };
    assert.equal(alphaBoard.project?.display_name, "产品 Alpha");
    assert.equal(alphaBoard.snapshot.board.board_id, "");
    assert.ok(alphaBoard.goals.some((item) => item.goal.goal_id === "ALPHA-ONLY"));
    assert.ok(!alphaBoard.goals.some((item) => item.goal.goal_id === "BETA-ONLY"));

    const created = await webFetch(`${origin}${alphaPrefix}/api/goals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        goal_id: "ALPHA-WEB-CREATED",
        title: "只在 Alpha 创建的 Draft",
        outcome: "",
        why: "",
        business_logic: "",
      }),
    });
    assert.equal(created.status, 201);
    const createdPayload = (await created.json()) as { goal_path: string };
    assert.equal(createdPayload.goal_path, `${alphaPrefix}/goals/ALPHA-WEB-CREATED`);

    const betaBoard = (await (await webFetch(`${origin}${betaPrefix}/api/board`)).json()) as {
      goals: Array<{ goal: { goal_id: string } }>;
    };
    assert.ok(!betaBoard.goals.some((item) => item.goal.goal_id === "ALPHA-WEB-CREATED"));
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: fixture.homeDirectory });
  try {
    assert.deepEqual(catalog.listRuntimeContextBindingEvents(), fixture.bindingEvents);
    assert.equal(catalog.resolveRuntimeContext(fixture.alphaContext).project?.project_id, fixture.alpha.project_id);
    assert.equal(catalog.resolveRuntimeContext(fixture.betaContext).project?.project_id, fixture.beta.project_id);
  } finally {
    catalog.close();
  }
});

test("Web settings use shared Runtime and project services for confirmed setup flows", async () => {
  const fixture = await webProjectCatalogFixture();
  const runtime = webRuntimeIntegrationFixture(fixture.homeDirectory);
  const server = createGoalBoardWebServer({
    homeDirectory: fixture.homeDirectory,
    runtimeIntegrationService: runtime.service,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;

    const redirect = await webFetch(`${origin}/settings`, { redirect: "manual" });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get("location"), "/settings/projects");

    const runtimePage = await (await webFetch(`${origin}/settings/runtimes`)).text();
    assertInlineScriptsCompile(runtimePage);
    assert.match(runtimePage, /AI 与执行工具/);
    assert.match(runtimePage, /Codex/);
    assert.match(runtimePage, /Claude Code/);
    assert.match(runtimePage, /OpenCode/);
    assert.match(runtimePage, /Pi Agent/);
    assert.match(runtimePage, /Grok Build/);
    assert.match(runtimePage, /未接入/);
    assert.match(runtimePage, /data-runtime-plan="codex"/);
    assert.match(runtimePage, /data-runtime-plan-dialog/);
    assert.match(runtimePage, /我已查看并确认这份变更/);
    assert.match(runtimePage, /已关联的 AI 会话/);
    assert.match(runtimePage, /工作目录关联/);
    assert.match(runtimePage, /不接入也能正常使用 Goal Tree、待决定和记录/);
    assert.match(runtimePage, /.settings-page > \.topbar \{ height: 58px; \}/);
    assert.match(runtimePage, /@media \(max-width: 760px\)[\s\S]*\.settings-page > \.topbar \{ height: 52px; \}/);
    assert.match(runtimePage, /\.settings-page \.top-action span \{ display: none; \}/);
    assert.match(runtimePage, /button:focus-visible[\s\S]*a:focus-visible/);
    assert.doesNotMatch(runtimePage, /兼容模式|自动启用项目|单数据库工作区/);

    const projectPage = await (await webFetch(`${origin}/settings/projects`)).text();
    assert.match(projectPage, /创建项目/);
    assert.match(projectPage, /产品 Alpha/);
    assert.match(projectPage, /产品 Beta/);
    assert.match(projectPage, /存储信息/);
    assert.match(projectPage, /data-project-rename/);
    assert.match(projectPage, /data-project-migration-form/);
    assert.match(projectPage, new RegExp(`/projects/${fixture.alpha.project_id}/settings/rules`));
    assert.match(projectPage, /普通用户项目不会被示例操作或普通卸载删除/);
    const projectContent = projectPage.slice(projectPage.indexOf('<div class="settings-content">'), projectPage.indexOf("</main>"));
    assert.doesNotMatch(projectContent, /Runtime|Session|MCP|CLI|DB 信息|已关联的 AI 会话|工作目录关联/);
    assert.doesNotMatch(projectContent, /data-connection-row|data-workspace-row/);

    const projectRulesPage = await (await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/settings/rules`,
    )).text();
    assertInlineScriptsCompile(projectRulesPage);
    assert.match(projectRulesPage, /项目工作规则/);
    assert.match(projectRulesPage, /所有 Goal 共同遵守的最低要求/);
    const projectRulesNavigation = projectRulesPage.slice(
      projectRulesPage.indexOf('<nav class="settings-navigation'),
      projectRulesPage.indexOf('<div class="settings-content">'),
    );
    assert.match(projectRulesNavigation, /返回所有项目/);
    assert.match(projectRulesNavigation, /项目设置/);
    assert.match(projectRulesNavigation, /产品 Alpha/);
    assert.match(projectRulesNavigation, /工作规则/);
    assert.match(projectRulesNavigation, /工作规划/);
    assert.doesNotMatch(projectRulesNavigation, /全局设置|AI 与执行工具|诊断/);
    assert.doesNotMatch(projectRulesNavigation, />Goal Tree</);
    assert.match(projectRulesPage, /data-route-prefix="\/projects\//);
    assert.match(projectRulesPage, /name="scope" value="project_default"/);
    assert.doesNotMatch(projectRulesPage, /name="goal_id"/);
    assert.match(projectRulesPage, /项目先定共同底线/);
    assert.match(projectRulesPage, /<details class="policy-source policy-source--project" open>/);
    assert.match(projectRulesPage, /<details class="factor-advanced policy-advanced" data-progressive-fields>/);
    assert.match(projectRulesPage, /data-project-rules-receipt/);
    assert.match(projectRulesPage, /goalboard-project-rules-receipt:/);
    assert.match(projectRulesPage, /之后开始或重新领取的 Goal 会采用这些规则/);
    assert.match(projectRulesPage, /\.policy-source \{[^}]*background: var\(--paper\)/);
    assert.match(projectRulesPage, /\.policy-source > summary \{[^}]*background: color-mix\(in srgb, var\(--rail\)/);
    assert.match(projectRulesPage, /\.project-rules-intro \{[^}]*background: var\(--rail\)/);
    assert.match(projectRulesPage, /\.project-rules-intro li \{[^}]*background: var\(--paper\)/);
    assert.match(projectRulesPage, /\.policy-mode-options label:hover > span \{[^}]*var\(--blue-soft\)/);
    assert.match(projectRulesPage, /\.policy-mode-options input:disabled \+ span \{[^}]*background: var\(--rail\)/);
    assert.match(projectRulesPage, /\.policy-input input, \.policy-reason textarea \{[^}]*color: var\(--ink\); background: var\(--paper\)/);

    const savedProjectRules = await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/api/policy-bindings`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: "project_default",
          reason: "验证项目设置页使用同一规则写入入口",
          policy: {
            goal_mode: "preferred",
            required_capabilities: [],
            self_verification: true,
            cross_reviewers: 0,
            adversarial_reviewers: 0,
            human_approval: false,
            max_lease_seconds: 1800,
          },
        }),
      },
    );
    assert.equal(savedProjectRules.status, 200, await savedProjectRules.clone().text());
    const savedProjectRulesPage = await (await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/settings/rules`,
    )).text();
    assert.match(savedProjectRulesPage, /已设置项目基线/);
    assert.match(savedProjectRulesPage, /验证项目设置页使用同一规则写入入口/);

    const workPlanningPage = await (await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/settings/planning`,
    )).text();
    assertInlineScriptsCompile(workPlanningPage);
    assert.match(workPlanningPage, /工作规划/);
    assert.match(workPlanningPage, /浏览完整方法库/);
    assert.match(workPlanningPage, /产品 Alpha/);
    assert.match(workPlanningPage, /当前规划组合/);
    assert.match(workPlanningPage, /尚未建立项目规划组合/);
    assert.match(workPlanningPage, /添加规划方法/);
    assert.match(workPlanningPage, /data-adopt-planning-method="domain-software-development"/);
    assert.match(workPlanningPage, /加入组合/);
    const workPlanningNavigation = workPlanningPage.slice(
      workPlanningPage.indexOf('<nav class="settings-navigation'),
      workPlanningPage.indexOf('<div class="settings-content">'),
    );
    assert.match(workPlanningNavigation, /返回所有项目/);
    assert.match(workPlanningNavigation, /产品 Alpha/);
    assert.match(workPlanningNavigation, /工作规则/);
    assert.match(workPlanningNavigation, /工作规划/);
    assert.doesNotMatch(workPlanningNavigation, /全局设置|AI 与执行工具|诊断/);
    assert.doesNotMatch(workPlanningPage, /class="planning-layout"|class="planning-editor"/);

    const appliedPlanningMethod = await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/api/settings/planning-methods/apply`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method_id: "domain-software-development" }),
      },
    );
    assert.equal(appliedPlanningMethod.status, 200, await appliedPlanningMethod.clone().text());
    const appliedMethodResult = await appliedPlanningMethod.json() as { method: { method_id: string; scope: string } };
    assert.equal(appliedMethodResult.method.method_id, "domain-software-development");
    assert.equal(appliedMethodResult.method.scope, "project");
    const appliedWorkTypeMethod = await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/api/settings/planning-methods/apply`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method_id: "work-build-change" }),
      },
    );
    assert.equal(appliedWorkTypeMethod.status, 200, await appliedWorkTypeMethod.clone().text());
    const workPlanningAfterApply = await (await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/settings/planning`,
    )).text();
    assert.match(workPlanningAfterApply, /2 套方法共同生效/);
    assert.match(workPlanningAfterApply, /构建与改变/);
    assert.match(workPlanningAfterApply, /软件开发/);
    assert.doesNotMatch(workPlanningAfterApply, /data-adopt-planning-method="domain-software-development"/);
    assert.doesNotMatch(workPlanningAfterApply, /data-adopt-planning-method="work-build-change"/);

    const projectPlanningDetail = await (await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/settings/planning/domain-software-development`,
    )).text();
    const projectPlanningDetailNavigation = projectPlanningDetail.slice(
      projectPlanningDetail.indexOf('<nav class="settings-navigation'),
      projectPlanningDetail.indexOf('<div class="settings-content">'),
    );
    assert.match(projectPlanningDetailNavigation, /返回所有项目/);
    assert.match(projectPlanningDetailNavigation, /产品 Alpha/);
    assert.match(projectPlanningDetailNavigation, /工作规则/);
    assert.match(projectPlanningDetailNavigation, /工作规划/);
    assert.doesNotMatch(projectPlanningDetailNavigation, /全局设置|AI 与执行工具|诊断/);

    const planningLibrary = await (await webFetch(
      `${origin}/settings/planning?project=${fixture.alpha.project_id}`,
    )).text();
    assertInlineScriptsCompile(planningLibrary);
    assert.match(planningLibrary, /规划方法库/);
    assert.match(planningLibrary, /class="planning-card"/);
    assert.match(planningLibrary, /陌生领域方法包生成/);
    assert.match(planningLibrary, /软件开发/);
    assert.match(planningLibrary, /data-planning-filter="work_type"/);
    assert.doesNotMatch(planningLibrary, /class="planning-layout"|class="planning-editor"|<form class="planning-edit-form"/);
    const planningNavigation = planningLibrary.slice(
      planningLibrary.indexOf('<nav class="settings-navigation"'),
      planningLibrary.indexOf('<div class="settings-content">'),
    );
    assert.match(planningNavigation, /全局设置/);
    assert.match(planningNavigation, /项目设置/);
    assert.doesNotMatch(planningNavigation, /当前项目|产品 Alpha/);
    assert.doesNotMatch(planningNavigation, />Goal Tree</);

    const planningDetail = await (await webFetch(
      `${origin}/settings/planning/domain-software-development?project=${fixture.alpha.project_id}`,
    )).text();
    assert.match(planningDetail, /Runtime 方法说明/);
    assert.match(planningDetail, /技术方案设计/);
    assert.match(planningDetail, /技术基础能力建设/);
    assert.match(planningDetail, /规划路径/);
    assert.match(planningDetail, /拆分时必须回答/);
    assert.match(planningDetail, /依赖判断/);
    assert.match(planningDetail, /创建我的版本/);
    assert.doesNotMatch(planningDetail, /<form class="planning-edit-form"/);

    const planningEditor = await (await webFetch(
      `${origin}/settings/planning/domain-software-development/edit?project=${fixture.alpha.project_id}`,
    )).text();
    assertInlineScriptsCompile(planningEditor);
    assert.match(planningEditor, /<form class="planning-edit-form"[^>]*data-planning-edit-form/);
    assert.match(planningEditor, /保存到我的方法库/);
    assert.match(planningEditor, /name="instructions"/);
    assert.match(planningEditor, /Runtime 方法正文/);
    assert.match(planningEditor, /data-coverage-row/);
    assert.match(planningEditor, /data-dependency-row/);
    assert.doesNotMatch(planningEditor, /name="scope"|只用于当前项目/);

    const contextualSettingsPage = await (await webFetch(
      `${origin}/settings/projects?project=${fixture.alpha.project_id}`,
    )).text();
    assert.match(contextualSettingsPage, /项目设置/);
    assert.match(contextualSettingsPage, /产品 Alpha/);
    assert.match(contextualSettingsPage, /产品 Beta/);
    assert.doesNotMatch(contextualSettingsPage, /当前项目/);
    assert.match(contextualSettingsPage, new RegExp(`/projects/${fixture.alpha.project_id}/settings/rules`));
    assert.match(contextualSettingsPage, new RegExp(`/projects/${fixture.alpha.project_id}/settings/planning`));
    assert.doesNotMatch(contextualSettingsPage, new RegExp(`/settings/(planning|runtimes)\\?project=${fixture.alpha.project_id}`));
    const method = {
      method_id: "domain-web-test",
      kind: "custom",
      name: "Web 测试方法",
      summary: "验证用户可以输入并保存新的方法。",
      instructions: "# Web 测试方法\n\n先定义结果，再让结论依赖可复核证据。",
      applies_to: ["Web test"],
      domain_tags: ["test"],
      steps: ["定义结果", "检查证据"],
      required_coverage: [{ area: "test_result", label: "测试结果", question: "如何证明结果？" }],
      dependency_rules: [{ rule_id: "proof-first", statement: "结论依赖证据。", direction_hint: "conclusion depends_on evidence" }],
      evidence_requirements: ["测试记录"],
      completion_checks: ["结果可复核"],
      failure_modes: ["只看过程不看结果"],
      source_refs: ["web-test"],
      confidence: 0.8,
      enabled: true,
    };
    const projectMethodResponse = await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/api/settings/planning-methods`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "project", method }) },
    );
    assert.equal(projectMethodResponse.status, 200, await projectMethodResponse.clone().text());
    const personalMethodResponse = await webFetch(
      `${origin}/api/settings/planning-methods`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "personal", method: { ...method, method_id: "domain-web-personal", name: "个人 Web 方法" } }) },
    );
    assert.equal(personalMethodResponse.status, 200, await personalMethodResponse.clone().text());
    const planningMethods = await (await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/api/settings/planning-methods`,
    )).json() as {
      methods: Array<{ method_id: string; scope: string; instructions: string }>;
      composition: { method_pack_ids: string[]; required_coverage: unknown[] };
    };
    assert.equal(planningMethods.methods.find((item) => item.method_id === "domain-web-test")?.scope, "project");
    assert.equal(
      planningMethods.methods.find((item) => item.method_id === "domain-web-test")?.instructions,
      method.instructions,
    );
    assert.equal(planningMethods.methods.find((item) => item.method_id === "domain-web-personal")?.scope, "personal");
    assert.deepEqual(
      planningMethods.composition.method_pack_ids,
      ["work-build-change", "domain-software-development", "domain-web-test"],
    );
    assert.ok(planningMethods.composition.required_coverage.length > 5);

    const diagnosticsPage = await (await webFetch(`${origin}/settings/diagnostics`)).text();
    assert.match(diagnosticsPage, /安装完整/);
    assert.match(diagnosticsPage, /web-test/);
    assert.match(diagnosticsPage, /启动入口/);
    assert.match(diagnosticsPage, /goalboard-mcp/);
    const diagnostics = (await (await webFetch(`${origin}/api/settings/diagnostics`)).json()) as {
      installation_state: string;
      project_count: number;
    };
    assert.equal(diagnostics.installation_state, "ready");
    assert.equal(diagnostics.project_count, 2);

    const codexConfig = join(runtime.userHomeDirectory, ".codex", "config.toml");
    const planResponse = await webFetch(`${origin}/api/settings/runtimes/codex/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "connect" }),
    });
    assert.equal(planResponse.status, 200);
    const plan = (await planResponse.json()) as { plan_id: string; status: string; changes: unknown[]; next_contents?: unknown };
    assert.equal(plan.status, "ready");
    assert.ok(plan.changes.length >= 2);
    assert.equal(plan.next_contents, undefined);
    assert.equal(existsSync(codexConfig), false);

    const incompleteConfirm = await webFetch(`${origin}/api/settings/runtimes/codex/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "confirmed" }),
    });
    assert.equal(incompleteConfirm.status, 400);
    assert.equal(existsSync(codexConfig), false);

    const declined = await webFetch(`${origin}/api/settings/runtimes/codex/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan_id: plan.plan_id, decision: "declined" }),
    });
    assert.equal(declined.status, 200);
    assert.equal(existsSync(codexConfig), false);

    const confirmed = await webFetch(`${origin}/api/settings/runtimes/codex/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan_id: plan.plan_id, decision: "confirmed" }),
    });
    assert.equal(confirmed.status, 200);
    const confirmedResult = (await confirmed.json()) as { status: string };
    assert.equal(confirmedResult.status, "connected");
    assert.match(readFileSync(codexConfig, "utf8"), /GOALBOARD_RUNTIME_ID = "codex"/);
    assert.equal(readlinkSync(join(runtime.userHomeDirectory, ".codex", "skills", "goal-advance")), runtime.skill);

    const beforeCatalog = await GoalBoardProjectCatalog.open({ homeDirectory: fixture.homeDirectory });
    let beforeBindings: ReturnType<GoalBoardProjectCatalog["listRuntimeContextBindingEvents"]>;
    try {
      beforeBindings = beforeCatalog.listRuntimeContextBindingEvents();
    } finally {
      beforeCatalog.close();
    }
    const unconfirmedProject = await webFetch(`${origin}/api/settings/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ display_name: "网页新项目" }),
    });
    assert.equal(unconfirmedProject.status, 400);

    const createdResponse = await webFetch(`${origin}/api/settings/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ display_name: "网页新项目", user_confirmed: true }),
    });
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()) as {
      project: { project_id: string; display_name: string };
      project_path: string;
    };
    assert.equal(created.project.display_name, "网页新项目");
    const renamedResponse = await webFetch(
      `${origin}/api/settings/projects/${encodeURIComponent(created.project.project_id)}/rename`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ display_name: "网页项目已改名" }),
      },
    );
    assert.equal(renamedResponse.status, 200);
    assert.match(await renamedResponse.text(), /网页项目已改名/);
    assert.equal((await webFetch(`${origin}${created.project_path}`)).status, 200);

    const afterCatalog = await GoalBoardProjectCatalog.open({ homeDirectory: fixture.homeDirectory });
    try {
      assert.equal(afterCatalog.getProject(created.project.project_id).display_name, "网页项目已改名");
      assert.deepEqual(afterCatalog.listRuntimeContextBindingEvents(), beforeBindings);
    } finally {
      afterCatalog.close();
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("Web diagnostics previews and confirms the same managed Web service lifecycle", async () => {
  const fixture = await webProjectCatalogFixture();
  const userHome = join(fixture.homeDirectory, "service-user");
  mkdirSync(join(fixture.homeDirectory, "bin"), { recursive: true });
  mkdirSync(userHome, { recursive: true });
  writeFileSync(join(fixture.homeDirectory, "bin", "goalboard-web"), "#!/bin/sh\nexit 0\n");
  let loaded = false;
  let healthy = true;
  const service = new GoalBoardWebServiceManager({
    homeDirectory: fixture.homeDirectory,
    userHomeDirectory: userHome,
    platform: "darwin",
    uid: 501,
    async healthCheck() { return healthy; },
    async runCommand(_file, args) {
      if (args[0] === "print") return { code: loaded ? 0 : 113, stdout: loaded ? "state = running\npid = 4242\n" : "", stderr: loaded ? "" : "not found" };
      if (args[0] === "bootstrap") loaded = true;
      if (args[0] === "bootout") loaded = false;
      return { code: 0, stdout: "", stderr: "" };
    },
  });
  const server = createGoalBoardWebServer({ homeDirectory: fixture.homeDirectory, webServiceManager: service });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const page = await (await webFetch(`${origin}/settings/diagnostics`)).text();
    assertInlineScriptsCompile(page);
    assert.match(page, /Web 常驻服务/);
    assert.match(page, /macOS 用户级 LaunchAgent/);
    assert.match(page, /data-web-service-action="install"/);

    const planResponse = await webFetch(`${origin}/api/settings/web-service/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "install" }),
    });
    assert.equal(planResponse.status, 200);
    const plan = (await planResponse.json()) as { plan_id: string; status: string; changes: unknown[] };
    assert.equal(plan.status, "ready");
    assert.equal(plan.changes.length, 2);
    assert.equal(existsSync(service.plistPath), false);

    const confirmed = await webFetch(`${origin}/api/settings/web-service/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan_id: plan.plan_id, decision: "confirmed" }),
    });
    assert.equal(confirmed.status, 200);
    const result = (await confirmed.json()) as { status: string; detection: { state: string } };
    assert.equal(result.status, "installed");
    assert.equal(result.detection.state, "running");
    assert.equal(existsSync(service.plistPath), true);

    const status = (await (await webFetch(`${origin}/api/settings/web-service`)).json()) as { state: string };
    assert.equal(status.state, "running");

    healthy = false;
    const unhealthyStatus = (await (await webFetch(`${origin}/api/settings/web-service`)).json()) as { state: string };
    assert.equal(unhealthyStatus.state, "unhealthy");
    const unhealthyPage = await (await webFetch(`${origin}/settings/diagnostics`)).text();
    assert.match(unhealthyPage, /进程运行中，页面不可用/);
    assert.match(unhealthyPage, /data-web-service-action="restart"/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("Web clearly separates regenerable demo data from user projects and shares one lifecycle", async () => {
  const fixture = await webProjectCatalogFixture();
  const server = createGoalBoardWebServer({ homeDirectory: fixture.homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const initialPage = await (await webFetch(`${origin}/settings/projects`)).text();
    assertInlineScriptsCompile(initialPage);
    assert.match(initialPage, /data-demo-action="create"/);
    assert.match(initialPage, /用户数据/);

    const unconfirmed = await webFetch(`${origin}/api/settings/demo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create" }),
    });
    assert.equal(unconfirmed.status, 400);

    const createdResponse = await webFetch(`${origin}/api/settings/demo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create", user_confirmed: true }),
    });
    assert.equal(createdResponse.status, 200);
    const created = (await createdResponse.json()) as { project: { project_id: string; data_class: string } };
    assert.equal(created.project.data_class, "regenerable_demo");
    assert.equal((await webFetch(`${origin}/projects/${created.project.project_id}/`)).status, 200);

    const demoPage = await (await webFetch(`${origin}/settings/projects`)).text();
    assert.match(demoPage, /演示数据 · 可随时重建/);
    assert.match(demoPage, /data-demo-action="reset"/);
    assert.match(demoPage, /data-demo-action="remove"/);
    const reset = await webFetch(`${origin}/api/settings/demo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reset", user_confirmed: true }),
    });
    assert.equal(reset.status, 200);
    const removed = await webFetch(`${origin}/api/settings/demo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "remove", user_confirmed: true }),
    });
    assert.equal(removed.status, 200);

    const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: fixture.homeDirectory });
    try {
      assert.equal(catalog.listProjects().length, 2);
      assert.ok(catalog.listProjects().every((project) => project.data_class === "user"));
    } finally {
      catalog.close();
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("Web manages only confirmed Runtime Session bindings without exposing host identities", async () => {
  const fixture = await webProjectCatalogFixture();
  const workspacePath = join(fixture.homeDirectory, "..", "ordinary-workspace");
  mkdirSync(workspacePath, { recursive: true });
  const workspaceCatalog = await GoalBoardProjectCatalog.open({ homeDirectory: fixture.homeDirectory });
  try {
    const context = {
      runtime_id: "codex",
      stable_work_context_id: null,
      host_declares_stable: false,
      workspace: { canonical_path: workspacePath, realpath_verified: false },
    };
    workspaceCatalog.bindRuntimeContext({
      context,
      project_id: fixture.alpha.project_id,
      actor_id: "runtime-codex",
      user_confirmed: true,
    });
    workspaceCatalog.bindRuntimeContext({
      context,
      project_id: fixture.beta.project_id,
      actor_id: "runtime-codex",
      user_confirmed: true,
    });
  } finally {
    workspaceCatalog.close();
  }
  const server = createGoalBoardWebServer({ homeDirectory: fixture.homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;

    const projectPage = await (await webFetch(`${origin}/settings/projects`)).text();
    assertInlineScriptsCompile(projectPage);
    assert.doesNotMatch(projectPage.slice(projectPage.indexOf('<div class="settings-content">'), projectPage.indexOf("</main>")), /data-workspace-default|data-connection-rebind|data-connection-unbind/);

    const page = await (await webFetch(`${origin}/settings/runtimes`)).text();
    assertInlineScriptsCompile(page);
    assert.match(page, /已关联的 AI 会话/);
    assert.match(page, /工作目录关联/);
    assert.match(page, /ordinary-workspace/);
    assert.match(page, /data-workspace-default/);
    assert.match(page, /data-connection-rebind/);
    assert.match(page, /data-connection-unbind/);
    assert.doesNotMatch(page, /web-project-alpha-session|web-project-beta-session/);

    const listed = (await (await webFetch(`${origin}/api/settings/connections`)).json()) as {
      connections: Array<{
        binding_id: string;
        context_label: string;
        project_id: string;
        project_name: string;
      }>;
    };
    assert.equal(listed.connections.length, 2);
    assert.match(listed.connections[0]?.context_label ?? "", /Session · [A-F0-9]{6}$/);
    assert.doesNotMatch(JSON.stringify(listed), /stable_work_context_id|database_path|web-project-alpha-session/);
    const workspaces = (await (await webFetch(`${origin}/api/settings/workspaces`)).json()) as {
      workspace_memberships: Array<{ workspace_id: string; project_id: string; is_default: boolean }>;
    };
    assert.equal(workspaces.workspace_memberships.length, 2);
    assert.equal(workspaces.workspace_memberships.some((membership) => membership.is_default), false);
    assert.doesNotMatch(JSON.stringify(workspaces), /canonical_path|ordinary-workspace\//);
    const workspaceId = workspaces.workspace_memberships[0]!.workspace_id;

    const unconfirmedDefault = await webFetch(
      `${origin}/api/settings/workspaces/${encodeURIComponent(workspaceId)}/default`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ project_id: fixture.beta.project_id }) },
    );
    assert.equal(unconfirmedDefault.status, 400);
    const confirmedDefault = await webFetch(
      `${origin}/api/settings/workspaces/${encodeURIComponent(workspaceId)}/default`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ project_id: fixture.beta.project_id, user_confirmed: true }) },
    );
    assert.equal(confirmedDefault.status, 200);
    const alphaConnection = listed.connections.find((connection) => connection.project_id === fixture.alpha.project_id);
    assert.ok(alphaConnection);

    const unconfirmedRebind = await webFetch(
      `${origin}/api/settings/connections/${encodeURIComponent(alphaConnection.binding_id)}/rebind`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project_id: fixture.beta.project_id }),
      },
    );
    assert.equal(unconfirmedRebind.status, 400);

    const beforeConfirmed = await GoalBoardProjectCatalog.open({ homeDirectory: fixture.homeDirectory });
    try {
      assert.equal(beforeConfirmed.resolveRuntimeContext(fixture.alphaContext).project?.project_id, fixture.alpha.project_id);
    } finally {
      beforeConfirmed.close();
    }

    const reboundResponse = await webFetch(
      `${origin}/api/settings/connections/${encodeURIComponent(alphaConnection.binding_id)}/rebind`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project_id: fixture.beta.project_id, user_confirmed: true }),
      },
    );
    assert.equal(reboundResponse.status, 200);
    const rebound = (await reboundResponse.json()) as { connection: { project_id: string; project_name: string } };
    assert.equal(rebound.connection.project_id, fixture.beta.project_id);
    assert.equal(rebound.connection.project_name, fixture.beta.display_name);
    assert.doesNotMatch(JSON.stringify(rebound), /stable_work_context_id|database_path|web-project-alpha-session/);

    const runtime = new GoalBoardServer("runtime", null, {
      homeDirectory: fixture.homeDirectory,
      runtimeContext: fixture.alphaContext,
      webBaseUrl: origin,
    });
    const runtimeResolution = JSON.parse(await runtime.callTool("goalboard_v1_context_resolve", {})) as {
      project: { project_id: string } | null;
    };
    assert.equal(runtimeResolution.project?.project_id, fixture.beta.project_id);

    const unconfirmedUnbind = await webFetch(
      `${origin}/api/settings/connections/${encodeURIComponent(alphaConnection.binding_id)}/unbind`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    assert.equal(unconfirmedUnbind.status, 400);

    const unboundResponse = await webFetch(
      `${origin}/api/settings/connections/${encodeURIComponent(alphaConnection.binding_id)}/unbind`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_confirmed: true }),
      },
    );
    assert.equal(unboundResponse.status, 200);
    const after = await GoalBoardProjectCatalog.open({ homeDirectory: fixture.homeDirectory });
    try {
      assert.equal(after.resolveRuntimeContext(fixture.alphaContext).status, "unbound");
      assert.equal(after.resolveRuntimeContext(fixture.betaContext).project?.project_id, fixture.beta.project_id);
      assert.equal(after.listProjects().length, 2);
      assert.equal(after.listRuntimeContextBindings().length, 1);
      assert.deepEqual(
        after.listRuntimeContextBindingEvents(fixture.alphaContext).map((event) => event.type),
        ["context.bound", "context.rebound", "context.unbound"],
      );
    } finally {
      after.close();
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("Web local control gate rejects cross-site, missing-credential, hostile-host, and replayed writes", async () => {
  const fixture = await webProjectCatalogFixture();
  const server = createGoalBoardWebServer({ homeDirectory: fixture.homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const pageResponse = await globalThis.fetch(`${origin}/settings/projects`);
    assert.equal(pageResponse.status, 200);
    const page = await pageResponse.text();
    assert.match(page, new RegExp(`<meta name="goalboard-control-token" content="${WEB_TEST_CONTROL_TOKEN}">`));
    const apiText = await (await globalThis.fetch(`${origin}/api/settings/projects`)).text();
    assert.doesNotMatch(apiText, new RegExp(WEB_TEST_CONTROL_TOKEN));

    const hostileHost = await rawHttpGet(address.port, "/settings/projects", `attacker.example:${address.port}`);
    assert.equal(hostileHost.status, 403);
    assert.doesNotMatch(hostileHost.body, /attacker\.example/);

    const missingToken = await globalThis.fetch(`${origin}/api/settings/projects`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        "x-goalboard-idempotency-key": "security-missing-token",
      },
      body: JSON.stringify({ display_name: "不应创建", user_confirmed: true }),
    });
    assert.equal(missingToken.status, 403);

    const crossSite = await globalThis.fetch(`${origin}/api/settings/projects`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.example",
        "x-goalboard-control-token": WEB_TEST_CONTROL_TOKEN,
        "x-goalboard-idempotency-key": "security-cross-site",
      },
      body: JSON.stringify({ display_name: "不应创建", user_confirmed: true }),
    });
    assert.equal(crossSite.status, 403);
    assert.doesNotMatch(await crossSite.text(), /attacker\.example|goalboard-web-test-control-token/);

    const missingRequestKey = await globalThis.fetch(`${origin}/api/settings/projects`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        "x-goalboard-control-token": WEB_TEST_CONTROL_TOKEN,
      },
      body: JSON.stringify({ display_name: "不应创建", user_confirmed: true }),
    });
    assert.equal(missingRequestKey.status, 400);

    const retryKey = "security-failed-request-retry";
    const invalid = await globalThis.fetch(`${origin}/api/settings/projects`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        "x-goalboard-control-token": WEB_TEST_CONTROL_TOKEN,
        "x-goalboard-idempotency-key": retryKey,
      },
      body: JSON.stringify({ display_name: "安全创建" }),
    });
    assert.equal(invalid.status, 400);

    const confirmedRequest = {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        "x-goalboard-control-token": WEB_TEST_CONTROL_TOKEN,
        "x-goalboard-idempotency-key": retryKey,
      },
      body: JSON.stringify({ display_name: "安全创建", user_confirmed: true }),
    } satisfies RequestInit;
    const confirmed = await globalThis.fetch(`${origin}/api/settings/projects`, confirmedRequest);
    assert.equal(confirmed.status, 201);
    const replayed = await globalThis.fetch(`${origin}/api/settings/projects`, confirmedRequest);
    assert.equal(replayed.status, 409);
    assert.match(await replayed.text(), /不会重复执行/);

    const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: fixture.homeDirectory });
    try {
      assert.equal(catalog.listProjects().filter((project) => project.display_name === "安全创建").length, 1);
    } finally {
      catalog.close();
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("Web project catalog empty state does not create a project or Runtime binding", async () => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "goalboard-web-project-empty-"));
  const server = createGoalBoardWebServer({ homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const page = await (await webFetch(`http://127.0.0.1:${address.port}/`)).text();
    assert.match(page, /从一个真实项目开始/);
    assert.match(page, /创建第一个项目/);
    assert.match(page, /设置 Runtime 接入/);
    assert.match(page, /两步都可跳过/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  const catalog = await GoalBoardProjectCatalog.open({ homeDirectory });
  try {
    assert.deepEqual(catalog.listProjects(), []);
    assert.deepEqual(catalog.listRuntimeContextBindingEvents(), []);
  } finally {
    catalog.close();
  }
});

test("Web chrome switches between Chinese and English without translating Goal titles", async () => {
  const fixture = await webProjectCatalogFixture();
  addProjectGoal(fixture.alpha, "GOAL-I18N", "让页面看懂下一步");
  const server = createGoalBoardWebServer({ homeDirectory: fixture.homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const chinese = await (await webFetch(`${origin}/`)).text();
    assert.match(chinese, /lang="zh-CN"/);
    assert.match(chinese, /选择一个项目/);
    assert.match(chinese, /class="locale-switch"/);
    assert.match(chinese, />中文</);
    assert.match(chinese, />EN</);

    const switched = await webFetch(`${origin}/locale?lang=en&next=/`, { redirect: "manual" });
    assert.equal(switched.status, 302);
    assert.match(String(switched.headers.get("set-cookie")), /goalboard_locale=en/);
    assert.equal(switched.headers.get("location"), "/");

    const hostile = await webFetch(`${origin}/locale?lang=en&next=//evil.example`, { redirect: "manual" });
    assert.equal(hostile.headers.get("location"), "/");

    const english = await (await webFetch(`${origin}/`, {
      headers: { cookie: "goalboard_locale=en" },
    })).text();
    assert.match(english, /lang="en"/);
    assert.match(english, /<title>Choose a project · GoalBoard<\/title>/);
    assert.match(english, /<h1 id="project-index-title">Choose a project<\/h1>/);
    assert.match(english, />Settings</);
    assert.doesNotMatch(english, /<h1 id="project-index-title">选择一个项目<\/h1>/);

    const capsuleEnglish = await (await webFetch(`${origin}/desktop/capsule?desktop=1&locale=en`, {
      headers: { cookie: "goalboard_locale=zh" },
    })).text();
    assert.match(capsuleEnglish, /lang="en"/);
    assert.match(capsuleEnglish, /<title>Work capsule · GoalBoard<\/title>/);
    assert.match(capsuleEnglish, />Open GoalBoard</);
    assert.doesNotMatch(capsuleEnglish, /<title>工作胶囊 · GoalBoard<\/title>/);

    const capsuleChinese = await (await webFetch(`${origin}/desktop/capsule?desktop=1&locale=zh`, {
      headers: { cookie: "goalboard_locale=en" },
    })).text();
    assert.match(capsuleChinese, /lang="zh-CN"/);
    assert.match(capsuleChinese, /<title>工作胶囊 · GoalBoard<\/title>/);
    assert.match(capsuleChinese, />打开 GoalBoard</);

    const capsuleApiEnglish = await (await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/api/capsule?locale=en`,
      { headers: { cookie: "goalboard_locale=zh" } },
    )).text();
    assert.match(capsuleApiEnglish, /Needs clarification/);
    assert.doesNotMatch(capsuleApiEnglish, /目标待澄清/);

    const capsuleApiChinese = await (await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/api/capsule?locale=zh`,
      { headers: { cookie: "goalboard_locale=en" } },
    )).text();
    assert.match(capsuleApiChinese, /目标待澄清/);
    assert.doesNotMatch(capsuleApiChinese, /Needs clarification/);

    const accepted = await (await webFetch(`${origin}/`, {
      headers: { "accept-language": "en-US,en;q=0.9" },
    })).text();
    assert.match(accepted, /lang="en"/);
    assert.match(accepted, /Choose a project/);

    const board = await (await webFetch(`${origin}/projects/${fixture.alpha.project_id}/`, {
      headers: { cookie: "goalboard_locale=en" },
    })).text();
    assert.match(board, /lang="en"/);
    assert.match(board, /让页面看懂下一步/);
    assert.match(board, /New Goal/);
    assert.match(board, /aria-label="Filter Goals"/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /L\("筛选目标，已选择 \{count\} 种状态"/);
    assert.match(board, /Settings/);
    assert.match(board, /href="\/locale\?lang=zh/);
    assertInlineScriptsCompile(english);
    assertInlineScriptsCompile(board);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("Web command only starts from the project catalog", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/web/server.ts", "--db", "/tmp/legacy-goalboard.db"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /只按项目启动/);
  assert.match(result.stderr, /--db 已不支持/);
});

test("Web command still starts when its entrypoint is reached through a symlink", () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-entrypoint-"));
  const entrypoint = join(directory, "goalboard-web.ts");
  symlinkSync(join(process.cwd(), "src", "web", "server.ts"), entrypoint);
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", entrypoint, "--db", "/tmp/legacy-goalboard.db"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /只按项目启动/);
  assert.match(result.stderr, /--db 已不支持/);
});

test("Web migrates an explicitly confirmed legacy DB into one project without changing Runtime bindings", async () => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "goalboard-web-project-migration-"));
  const legacyDirectory = join(homeDirectory, "legacy-source");
  const legacyDatabasePath = join(legacyDirectory, "goalboard.db");
  mkdirSync(legacyDirectory, { recursive: true });
  seedDemoBoard(legacyDatabasePath);
  const before = boardSnapshot(legacyDatabasePath, DEMO_BOARD_ID);
  const server = createGoalBoardWebServer({ homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;

    const indexResponse = await webFetch(`${origin}/`);
    assert.match(indexResponse.headers.get("content-security-policy") ?? "", /script-src 'unsafe-inline'/);
    assert.match(indexResponse.headers.get("content-security-policy") ?? "", /connect-src 'self'/);
    const index = await indexResponse.text();
    assert.match(index, /迁移已有 GoalBoard 数据/);
    assert.match(index, /data-project-migration-form/);
    assert.match(index, /data-open-project-migration/);
    assert.match(index, /不会绑定或切换任何 Runtime Session/);
    assert.doesNotMatch(index, /兼容模式|单数据库工作区|显式 --db/);

    const withoutConfirmation = await webFetch(`${origin}/api/projects/migrate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ legacy_database_path: legacyDatabasePath }),
    });
    assert.equal(withoutConfirmation.status, 400);
    assert.match(await withoutConfirmation.text(), /明确确认/);
    assert.equal(existsSync(legacyDatabasePath), true);

    const unconfirmedCatalog = await GoalBoardProjectCatalog.open({ homeDirectory });
    try {
      assert.deepEqual(unconfirmedCatalog.listProjects(), []);
      assert.deepEqual(unconfirmedCatalog.listRuntimeContextBindingEvents(), []);
    } finally {
      unconfirmedCatalog.close();
    }

    const migratedResponse = await webFetch(`${origin}/api/projects/migrate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        legacy_database_path: legacyDatabasePath,
        display_name: "迁移后的产品",
        user_confirmed: true,
      }),
    });
    assert.equal(migratedResponse.status, 201);
    const migrated = (await migratedResponse.json()) as {
      project: { project_id: string; display_name: string };
      project_path: string;
    };
    assert.equal(migrated.project.display_name, "迁移后的产品");
    assert.equal(migrated.project_path, `/projects/${encodeURIComponent(migrated.project.project_id)}/`);
    assert.equal(existsSync(legacyDatabasePath), false);

    const catalog = await GoalBoardProjectCatalog.open({ homeDirectory });
    try {
      const project = catalog.getProject(migrated.project.project_id);
      assert.equal(project.display_name, "迁移后的产品");
      assert.deepEqual(boardSnapshot(project.database_path, project.board_id), before);
      assert.deepEqual(catalog.listRuntimeContextBindingEvents(), []);
    } finally {
      catalog.close();
    }

    const migratedPage = await (await webFetch(`${origin}${migrated.project_path}`)).text();
    assert.match(migratedPage, /项目：<\/strong><span>迁移后的产品/);
    assert.match(migratedPage, /让第一次使用的人顺利完成一轮目标协作/);
    assert.doesNotMatch(migratedPage, new RegExp(legacyDatabasePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web leaves an invalid legacy DB and the project catalog unchanged when migration fails", async () => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "goalboard-web-project-migration-failure-"));
  const invalidDatabasePath = join(homeDirectory, "invalid-goalboard.db");
  writeFileSync(invalidDatabasePath, "not a GoalBoard SQLite database");
  const server = createGoalBoardWebServer({ homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await webFetch(`http://127.0.0.1:${address.port}/api/projects/migrate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        legacy_database_path: invalidDatabasePath,
        user_confirmed: true,
      }),
    });
    assert.equal(response.status, 400);
    assert.match(await response.text(), /GoalBoard DB|数据库|迁移/);
    assert.equal(existsSync(invalidDatabasePath), true);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  const catalog = await GoalBoardProjectCatalog.open({ homeDirectory });
  try {
    assert.deepEqual(catalog.listProjects(), []);
    assert.deepEqual(catalog.listRuntimeContextBindingEvents(), []);
  } finally {
    catalog.close();
  }
});

test("Web lets a user set an accepted Goal as the current Goal without starting Runtime work", async () => {
  const { databasePath } = webFixture();
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.createGoal(
    DEMO_BOARD_ID,
    {
      goal_id: "ACTIVE-GOAL-WEB",
      title: "从 Web 设为当前 Goal",
      outcome: "用户可以聚焦一条已接受 Goal",
      why: "当前 Goal 应由用户在 Board 中维护",
      business_logic: "用户选择当前聚焦 Goal，不会代替 Runtime 领取或启动执行。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [
        {
          criterion_id: "ACTIVE-GOAL-WEB-C1",
          statement: "页面可设为当前 Goal",
          decision_method: "automated_check",
          pass_condition: "Board 保存选择且保持待执行状态",
          required_evidence: ["test"],
        },
      ],
    },
    { actor_id: "test-user", idempotency_key: "create-active-goal-web" },
  );
  coordinator.createGoal(
    DEMO_BOARD_ID,
    {
      goal_id: "ACTIVE-GOAL-DRAFT",
      title: "不能设为当前 Goal 的 Draft",
      outcome: "",
      why: "",
      business_logic: "",
      definition_state: "draft",
      decomposition_state: "abstract",
      acceptance_criteria: [],
    },
    { actor_id: "test-user", idempotency_key: "create-active-goal-draft" },
  );
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: DEMO_BOARD_ID });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const initialPage = await (await webFetch(`${origin}/goals/ACTIVE-GOAL-WEB`)).text();
    const goalDocument = (page: string, goalId: string): string => {
      const marker = `<article class="goal-document" data-goal-view="${goalId}"`;
      const start = page.indexOf(marker);
      assert.ok(start >= 0, `missing Goal document: ${goalId}`);
      const headerEnd = page.indexOf("</header>", start);
      assert.ok(headerEnd >= 0, `missing Goal header: ${goalId}`);
      return page.slice(start, headerEnd);
    };
    const initialDocument = goalDocument(initialPage, "ACTIVE-GOAL-WEB");
    assert.match(initialDocument, /data-set-active-goal/);
    assert.match(initialDocument, /设为当前 Goal/);

    const activate = await webFetch(`${origin}/api/goals/ACTIVE-GOAL-WEB/active`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "用户把这条已接受 Goal 设为当前聚焦" }),
    });
    assert.equal(activate.status, 200);
    const activated = (await activate.json()) as {
      active_goal_id: string;
      replayed: boolean;
      observed_event_cursor: number;
    };
    assert.equal(activated.active_goal_id, "ACTIVE-GOAL-WEB");
    assert.equal(activated.replayed, false);
    assert.ok(activated.observed_event_cursor > 0);

    const board = (await (await webFetch(`${origin}/api/board`)).json()) as {
      active_goal_id: string;
      snapshot: { board: { active_goal_id: string } };
      events: Array<{ type: string; object_id: string }>;
      goals: Array<{ goal: { goal_id: string }; work_state: string }>;
    };
    assert.equal(board.active_goal_id, "ACTIVE-GOAL-WEB");
    assert.equal(board.snapshot.board.active_goal_id, "ACTIVE-GOAL-WEB");
    assert.equal(board.goals.find((item) => item.goal.goal_id === "ACTIVE-GOAL-WEB")?.work_state, "execution_pending");
    assert.ok(
      board.events.some(
        (event) => event.type === "board.active_goal_changed" && event.object_id === "ACTIVE-GOAL-WEB",
      ),
    );
    const currentPage = await (await webFetch(`${origin}/goals/ACTIVE-GOAL-WEB`)).text();
    const currentDocument = goalDocument(currentPage, "ACTIVE-GOAL-WEB");
    assert.match(currentDocument, /当前 Goal/);
    assert.match(currentDocument, /当前产品聚焦 Goal；不表示 Runtime 正在执行/);
    assert.doesNotMatch(currentDocument, /data-set-active-goal/);

    const draftPage = await (await webFetch(`${origin}/goals/ACTIVE-GOAL-DRAFT`)).text();
    assert.doesNotMatch(goalDocument(draftPage, "ACTIVE-GOAL-DRAFT"), /data-set-active-goal/);
    const draftActivation = await webFetch(`${origin}/api/goals/ACTIVE-GOAL-DRAFT/active`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "不能绕过 accepted 校验" }),
    });
    assert.equal(draftActivation.status, 400);
    assert.match(await draftActivation.text(), /只有已接受的 Goal 可以成为当前产品目标/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web optionally uses the same Goal Tree decision path without enabling ambiguous whole confirmation", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-tree-decision-"));
  const databasePath = join(directory, "goalboard.db");
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.initializeBoard({
    board_id: "web-tree-board",
    title: "Web Tree Decision",
    actor_id: "web-user",
    idempotency_key: "web-tree-init",
  });
  const dialogue = coordinator.startDraftDialogue({
    board_id: "web-tree-board",
    actor_id: "runtime-clarifier",
    goal_id: "web-tree-root",
    rough_idea: "用户可以在当前 Runtime 或 Web 选择确认 Goal Tree 项。",
    idempotency_key: "web-tree-dialogue",
  });
  const proposal = coordinator.submitGoalTreeProposal({
    board_id: "web-tree-board",
    actor_id: "runtime-clarifier",
    discovered_in_run_id: dialogue.run!.run_id,
    root_goal_id: "web-tree-root",
    summary: "新增一条仍需继续澄清的子 Goal。",
    items: [
      {
        item_id: "web-tree-child",
        kind: "goal",
        operation: "create",
        payload: { goal_id: "web-tree-child", title: "Web 可选确认的 Draft 子 Goal" },
        source_refs: ["conversation://web-tree"],
        reason: "用户希望保留这个分支，之后继续在 Runtime 里澄清。",
        confidence: 1,
        affected_objects: [{ object_type: "goal", object_id: "web-tree-child" }],
      },
      {
        item_id: "web-tree-child-relation",
        kind: "relation",
        operation: "create",
        payload: {
          from_goal_id: "web-tree-child",
          to_goal_id: "web-tree-root",
          type: "part_of",
          reason: "这条新工作属于当前正在澄清的 Goal。",
        },
        source_refs: ["conversation://web-tree"],
        reason: "把新工作放回当前 Goal 的范围中。",
        confidence: 1,
        affected_objects: [
          { object_type: "relation", object_id: "web-tree-child-part-of-root" },
          { object_type: "goal", object_id: "web-tree-child" },
          { object_type: "goal", object_id: "web-tree-root" },
        ],
      },
    ],
    idempotency_key: "web-tree-propose",
  }).proposal;
  store.close();
  const server = createGoalBoardWebServer({ databasePath, boardId: "web-tree-board" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const decisionPage = await (await webFetch(`${origin}/decisions`)).text();
    const rootPage = await (await webFetch(`${origin}/goals/web-tree-root`)).text();
    assert.match(decisionPage, /data-goal-tree-decision-form/);
    assert.match(decisionPage, /这份 Goal 方案要采用，还是退回修改/);
    assert.match(decisionPage, /data-goal-tree-proposal-id=/);
    assert.match(decisionPage, /采用整份方案/);
    assert.match(decisionPage, /name="item_id" value="web-tree-child"/);
    assert.match(decisionPage, /放到当前方案里看/);
    assert.match(decisionPage, /goal-tree-proposal-decision[\s\S]*<section class="decision-scenario"[\s\S]*<details class="decision-details goal-tree-proposal-changes"/);
    assert.match(decisionPage, /如果采用[\s\S]*会新增 Goal「Web 可选确认的 Draft 子 Goal」/);
    assert.match(decisionPage, /它会成为「用户可以在当前 Runtime 或 Web 选择确认 Goal Tree 项。」的子 Goal/);
    assert.match(decisionPage, /随后仍是草稿，需要继续澄清，不能开始/);
    assert.match(decisionPage, /如果退回[\s\S]*当前 Goal Tree 保持不变/);
    assert.match(decisionPage, /<details class="decision-details goal-tree-proposal-changes"><summary><span>查看采用后的 2 项变化/);
    assert.match(decisionPage, /展开查看每项变化/);
    assert.match(decisionPage, /data-goal-tree-decision-form[\s\S]*novalidate/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /goalTreeDecisionForm[\s\S]*请填写决定理由或修改意见/);
    assert.match(rootPage, /查看并决定这份方案/);
    assert.match(rootPage, /处理 1 项决定/);
    assert.match(rootPage, /goal-status--clarification_decision_pending[^>]*[\s\S]*?<span>待你确认<\/span>/);
    assert.match(rootPage, /draft-gaps draft-gaps--decision[\s\S]*方案已经整理好/);
    assert.match(rootPage, /这条 Goal 不是还要继续澄清，而是在等你确认整理后的结果、范围和子 Goal/);
    assert.doesNotMatch(rootPage, /<div class="draft-gaps"><div><strong>这条 Goal 还没说清楚/);
    assert.doesNotMatch(rootPage, /<div class="goal-purpose">/);
    const ambiguous = await webFetch(
      `${origin}/api/goal-tree-proposals/${encodeURIComponent(proposal.proposal_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm_all_pending: true, reason: "确认" }),
      },
    );
    assert.equal(ambiguous.status, 400);
    assert.match(await ambiguous.text(), /不能验证上一轮/);
    const blankSubjectiveRejection = await webFetch(
      `${origin}/api/goal-tree-proposals/${encodeURIComponent(proposal.proposal_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decisions: [{ item_id: "web-tree-child", decision: "reject", reason: "" }],
          reason: "",
          idempotency_key: "web-tree-blank-reject",
        }),
      },
    );
    assert.equal(blankSubjectiveRejection.status, 400);
    assert.match(await blankSubjectiveRejection.text(), /需要说明理由或修改意见/);
    const decision = await webFetch(
      `${origin}/api/goal-tree-proposals/${encodeURIComponent(proposal.proposal_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decisions: [
            {
              item_id: "web-tree-child",
              decision: "confirm",
              reason: "用户从可选 Web 页面确认保留这个 Draft 分支。",
            },
            {
              item_id: "web-tree-child-relation",
              decision: "confirm",
              reason: "用户确认这条新工作属于当前 Goal。",
            },
          ],
          idempotency_key: "web-tree-decide",
        }),
      },
    );
    assert.equal(decision.status, 200, await decision.text());
    const board = (await (await webFetch(`${origin}/api/board`)).json()) as {
      snapshot: {
        goals: Array<{ goal_id: string; definition_state: string }>;
        relations: Array<{ from_goal_id: string; to_goal_id: string; type: string; state: string }>;
        goal_tree_proposals: Array<{
          proposal_id: string;
          items: Array<{ item_id: string; decision: { authority_source: string; actor_id: string } | null }>;
        }>;
      };
    };
    assert.equal(board.snapshot.goals.find((goal) => goal.goal_id === "web-tree-child")?.definition_state, "draft");
    assert.ok(board.snapshot.relations.some((relation) =>
      relation.from_goal_id === "web-tree-child" &&
      relation.to_goal_id === "web-tree-root" &&
      relation.type === "part_of" &&
      relation.state === "active"));
    const persisted = board.snapshot.goal_tree_proposals.find((item) => item.proposal_id === proposal.proposal_id);
    assert.equal(persisted?.items[0]?.decision?.authority_source, "web");
    assert.equal(persisted?.items[0]?.decision?.actor_id, "web-user");
    const updatedRootPage = await (await webFetch(`${origin}/goals/web-tree-root`)).text();
    assert.match(updatedRootPage, /goal-status--clarifying[^>]*[\s\S]*?<span>目标澄清中<\/span>/);
    assert.doesNotMatch(updatedRootPage, /<span class="goal-status goal-status--clarification_decision_pending"/);
    const resultPage = await (await webFetch(`${origin}/decisions`)).text();
    assert.match(resultPage, /最近处理结果/);
    assert.match(resultPage, /Goal 方案/);
    assert.match(resultPage, /已采用 2 项变化/);
    assert.match(resultPage, /用户从可选 Web 页面确认保留这个 Draft 分支/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web lets the user repair a historical Goal Tree Risk without rewriting the proposal", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-invalid-tree-risk-"));
  const databasePath = join(directory, "goalboard.db");
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.initializeBoard({
    board_id: "web-invalid-risk-board",
    title: "Invalid Risk Proposal",
    actor_id: "web-user",
    idempotency_key: "web-invalid-risk-init",
  });
  const dialogue = coordinator.startDraftDialogue({
    board_id: "web-invalid-risk-board",
    actor_id: "runtime-clarifier",
    goal_id: "web-invalid-risk-root",
    rough_idea: "为发布方案补充一条需要确认的风险。",
    idempotency_key: "web-invalid-risk-dialogue",
  });
  const invalidRiskCases = [
    ["复杂动画可能让低配设备掉帧", "低配设备帧率低于 30", "先接受，后续观察掉帧情况再决定怎么优化"],
    ["自动生成内容可能偏离设计边界", "生成结果连续两次不符合规则", "先限制生成范围，再由用户抽查结果"],
    ["本地存档可能与新版本不兼容", "升级后无法读取旧存档", "发布前验证两个历史版本的迁移"],
    ["多 Runtime 同步可能覆盖用户修改", "同一字段出现不同版本", "逐条确认冲突后再写入"],
  ] as const;
  const proposal = coordinator.submitGoalTreeProposal({
    board_id: "web-invalid-risk-board",
    actor_id: "runtime-clarifier",
    discovered_in_run_id: dialogue.run!.run_id,
    root_goal_id: "web-invalid-risk-root",
    summary: "补充发布后的性能风险。",
    items: [
      {
        item_id: "web-invalid-risk-child",
        kind: "goal",
        operation: "create",
        payload: { goal: { goal_id: "web-invalid-risk-child", title: "第一个子 Goal", outcome: "这是子目标，不是整份方案的标题" } },
        source_refs: ["conversation://web-invalid-risk"],
        reason: "验证页面不会把第一个子 Goal 当成整份方案。",
        confidence: 0.9,
        affected_objects: [{ object_type: "goal", object_id: "web-invalid-risk-child" }],
      },
      {
        item_id: "web-invalid-risk-root-contract",
        kind: "contract",
        operation: "update",
        payload: { goal: { goal_id: "web-invalid-risk-root", title: "完整产品目标", outcome: "这是整份方案真正要确认的目标" } },
        source_refs: ["conversation://web-invalid-risk"],
        reason: "补全根 Goal 的目标说明。",
        confidence: 0.9,
        affected_objects: [{ object_type: "goal", object_id: "web-invalid-risk-root" }],
      },
      ...invalidRiskCases.map(([description, trigger], index) => ({
        item_id: `web-invalid-risk-item-${index + 1}`,
        kind: "risk" as const,
        operation: "create" as const,
        payload: {
          risk_id: `web-invalid-risk-${index + 1}`,
          goal_ids: ["web-invalid-risk-root"],
          description,
          probability: "medium",
          impact: "high",
          trigger,
          treatment: "mitigate",
          blocking_mode: "none",
          revisit_condition: "首轮验证后复查",
          owner: "runtime-clarifier",
        },
        source_refs: ["conversation://web-invalid-risk"],
        reason: "需要在采用方案前明确如何处理这条风险。",
        confidence: 0.9,
        affected_objects: [{ object_type: "risk" as const, object_id: `web-invalid-risk-${index + 1}` }],
      })),
    ],
    idempotency_key: "web-invalid-risk-propose",
  }).proposal;
  for (const [, , treatmentPlan] of invalidRiskCases) {
    const index = invalidRiskCases.findIndex((item) => item[2] === treatmentPlan) + 1;
    const itemId = `web-invalid-risk-item-${index}`;
    const storedPayload = JSON.parse((store.db.prepare(
      "SELECT payload_json FROM goal_tree_proposal_items WHERE item_id = ?",
    ).get(itemId) as { payload_json: string }).payload_json) as Record<string, unknown>;
    store.db.prepare("UPDATE goal_tree_proposal_items SET payload_json = ? WHERE item_id = ?").run(
      JSON.stringify({ ...storedPayload, treatment: treatmentPlan }),
      itemId,
    );
  }
  const storedRootPayload = JSON.parse((store.db.prepare(
    "SELECT payload_json FROM goal_tree_proposal_items WHERE item_id = ?",
  ).get("web-invalid-risk-root-contract") as { payload_json: string }).payload_json) as { goal: Record<string, unknown> };
  store.db.prepare("UPDATE goal_tree_proposal_items SET payload_json = ? WHERE item_id = ?").run(
    JSON.stringify({ ...storedRootPayload, goal: { ...storedRootPayload.goal, decomposition_state: "closed_compound" } }),
    "web-invalid-risk-root-contract",
  );
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: "web-invalid-risk-board" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const decisionPage = await (await webFetch(`${origin}/decisions`)).text();
    assert.match(decisionPage, /这份方案暂时不能采用/);
    assert.match(decisionPage, /准备确认的 Goal[\s\S]*完整产品目标[\s\S]*这是整份方案真正要确认的目标/);
    assert.match(decisionPage, /这份方案有 4 条风险需要你选择，另有 1 项需要补全/);
    assert.match(decisionPage, /你需要决定：这条风险怎么处理/);
    assert.match(decisionPage, /value="mitigate"[\s\S]*降低风险/);
    assert.match(decisionPage, /value="avoid"[\s\S]*避开风险/);
    assert.match(decisionPage, /value="defer"[\s\S]*延后处理/);
    assert.match(decisionPage, /value="accept"[\s\S]*接受风险/);
    assert.match(decisionPage, /data-risk-treatment-plan[\s\S]*先接受，后续观察掉帧情况再决定怎么优化/);
    assert.match(decisionPage, /补充说明[\s\S]*可选/);
    assert.match(decisionPage, /保存 4 条风险处理/);
    assert.match(decisionPage, /采用整份方案（当前不可用）/);
    assert.match(decisionPage, /复杂动画可能让低配设备掉帧/);
    assert.match(decisionPage, /“处理方式”必须选择“接受风险、降低风险、避开风险、延后处理”之一/);
    assert.match(decisionPage, /goal-tree-proposal-changes" open/);
    assert.match(decisionPage, /goal-tree-proposal-item is-invalid/);
    assert.match(decisionPage, /退回修正/);
    assert.match(decisionPage, /value="confirm" disabled aria-disabled="true">还需补全其余问题/);

    const decision = await webFetch(
      `${origin}/api/goal-tree-proposals/${encodeURIComponent(proposal.proposal_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decisions: [
            {
              item_id: "web-invalid-risk-item-1",
              decision: "confirm",
              reason: "直接请求也不能绕过页面校验。",
            },
          ],
          idempotency_key: "web-invalid-risk-confirm",
        }),
      },
    );
    assert.equal(decision.status, 400);
    const error = await decision.text();
    assert.match(error, /复杂动画可能让低配设备掉帧/);
    assert.match(error, /处理方式/);
    assert.match(error, /当前 Goal Tree 没有改变/);

    const repair = await webFetch(
      `${origin}/api/goal-tree-proposals/${encodeURIComponent(proposal.proposal_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          risk_repairs: invalidRiskCases.map(([, , treatmentPlan], index) => ({
            item_id: `web-invalid-risk-item-${index + 1}`,
            treatment: (["mitigate", "avoid", "defer", "accept"] as const)[index],
            treatment_plan: treatmentPlan,
          })),
          idempotency_key: "web-invalid-risk-repair",
        }),
      },
    );
    assert.equal(repair.status, 200, await repair.text());

    const board = (await (await webFetch(`${origin}/api/board`)).json()) as {
      snapshot: {
        risks: Array<{ risk_id: string }>;
        goal_tree_proposals: Array<{
          proposal_id: string;
          version: number;
          state: string;
          items: Array<{
            item_id: string;
            kind: string;
            state: string;
            payload: Record<string, unknown>;
            decision: unknown;
          }>;
        }>;
      };
    };
    assert.equal(board.snapshot.risks.some((risk) => risk.risk_id.startsWith("web-invalid-risk-")), false);
    const superseded = board.snapshot.goal_tree_proposals.find((item) => item.proposal_id === proposal.proposal_id);
    assert.equal(superseded?.items.every((item) => item.state === "superseded"), true);
    const revision = board.snapshot.goal_tree_proposals.find((item) => item.version === 2);
    assert.equal(revision?.items.length, 6);
    assert.equal(revision?.items.every((item) => item.state === "pending"), true);
    const revisedRisk = revision?.items.find((item) => item.kind === "risk");
    assert.equal(revisedRisk?.payload.treatment, "mitigate");
    assert.equal(revisedRisk?.payload.treatment_plan, "先接受，后续观察掉帧情况再决定怎么优化");

    const revisedPage = await (await webFetch(`${origin}/decisions`)).text();
    assert.doesNotMatch(revisedPage, /风险需要你选择/);
    assert.match(revisedPage, /这份方案有 1 个 Goal 的拆解还不完整/);
    assert.match(revisedPage, /value="confirm" disabled aria-disabled="true">先补全 Goal 拆解/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web explains incomplete product decomposition and shows who owns each product path", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-incomplete-decomposition-"));
  const databasePath = join(directory, "goalboard.db");
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.initializeBoard({
    board_id: "web-decomposition-board",
    title: "Product Decomposition",
    actor_id: "web-user",
    idempotency_key: "web-decomposition-init",
  });
  const dialogue = coordinator.startDraftDialogue({
    board_id: "web-decomposition-board",
    actor_id: "runtime-game-planner",
    goal_id: "web-footballnia",
    rough_idea: "做一款内容、玩法和交互都完整的足球游戏。",
    idempotency_key: "web-footballnia-dialogue",
  });
  const productAreas = [
    "core_gameplay",
    "game_systems_content",
    "player_journey",
    "interaction_ui",
    "audiovisual",
    "technology_data",
    "quality",
    "delivery_release",
  ];
  const decompositionProposal = coordinator.submitGoalTreeProposal({
    board_id: "web-decomposition-board",
    actor_id: "runtime-game-planner",
    discovered_in_run_id: dialogue.run!.run_id,
    root_goal_id: "web-footballnia",
    summary: "交代完整游戏需要的关键路径以及负责它们的子 Goal。",
    items: [
      {
        item_id: "web-footballnia-parent",
        kind: "contract",
        operation: "update",
        payload: {
          goal_id: "web-footballnia",
          title: "交付完整可玩的 Footballnia",
          outcome: "玩家可以从进入游戏到完成一轮核心玩法，并获得完整反馈。",
          why: "避免足球资料很详细，但游戏本身无法操作或交付。",
          business_logic: "先确认完整玩家旅程，再让玩法、内容、交互、视听、质量和发布共同支撑它。",
          definition_state: "accepted",
          decomposition_state: "closed_compound",
          acceptance_criteria: [{
            criterion_id: "web-footballnia-complete",
            statement: "完整游戏路径可以体验",
            decision_method: "inspection",
            pass_condition: "玩家可以完成一轮端到端体验",
            required_evidence: ["playtest"],
          }],
          decomposition_review: {
            status: "complete",
            product_context: "game",
            coverage: productAreas.map((area) => ({
              area,
              disposition: "owned",
              goal_ids: ["web-footballnia-product-slice"],
              reason: "这条子 Goal 负责交付完整游戏闭环。",
            })),
            open_goal_ids: [],
            next_step: "等待子 Goal 完成。",
          },
        },
        source_refs: ["conversation://web-footballnia"],
        reason: "把原始游戏需求整理为完整产品目标。",
        confidence: 0.95,
        affected_objects: [{ object_type: "goal", object_id: "web-footballnia" }],
      },
      {
        item_id: "web-footballnia-child",
        kind: "goal",
        operation: "create",
        payload: {
          goal_id: "web-footballnia-product-slice",
          title: "完成 Footballnia 的完整游戏闭环",
          outcome: "产出可独立体验和验收的游戏闭环。",
          why: "让产品路径有明确的执行和验收归属。",
          business_logic: "一次交付串起玩法、交互、反馈和质量检查。",
          in_scope: ["从进入游戏到完成一轮核心玩法的端到端体验"],
          out_of_scope: ["独立扩展第二套玩法模式"],
          required_inputs: ["已经确认的核心玩法规则"],
          promised_outputs: ["可独立体验和验收的游戏闭环"],
          definition_state: "accepted",
          decomposition_state: "closed_leaf",
          acceptance_criteria: [{
            criterion_id: "web-footballnia-slice-complete",
            statement: "游戏闭环可以独立体验",
            decision_method: "inspection",
            pass_condition: "试玩者可以完成核心流程",
            required_evidence: ["playtest"],
          }],
          leaf_readiness: {
            verdict: "ready",
            primary_deliverable: "可独立体验和验收的游戏闭环",
            output_coverage: [{
              promised_output: "可独立体验和验收的游戏闭环",
              role: "primary",
              reason: "这是本 Goal 唯一独立交付和验收的结果。",
            }],
            split_candidates: [],
            rationale: "玩法、交互和反馈共同组成同一次端到端试玩验收。",
            unresolved_decisions: [],
            independent_deliverables: [],
            acceptance_criterion_ids: ["web-footballnia-slice-complete"],
          },
        },
        source_refs: ["conversation://web-footballnia"],
        reason: "由一个范围合理的子 Goal 承担多条紧密相关的产品路径。",
        confidence: 0.9,
        affected_objects: [{ object_type: "goal", object_id: "web-footballnia-product-slice" }],
      },
      {
        item_id: "web-footballnia-relation",
        kind: "relation",
        operation: "create",
        payload: {
          from_goal_id: "web-footballnia-product-slice",
          to_goal_id: "web-footballnia",
          type: "part_of",
          reason: "整款游戏消费这条子 Goal 的可玩闭环结果。",
        },
        source_refs: ["conversation://web-footballnia"],
        reason: "说明子 Goal 为什么属于父 Goal。",
        confidence: 0.95,
        affected_objects: [{ object_type: "relation", object_id: "web-footballnia-part-of" }],
      },
    ],
    idempotency_key: "web-footballnia-proposal",
  }).proposal;
  const storedChildPayload = JSON.parse((store.db.prepare(
    "SELECT payload_json FROM goal_tree_proposal_items WHERE item_id = ?",
  ).get("web-footballnia-child") as { payload_json: string }).payload_json) as Record<string, unknown>;
  store.db.prepare("UPDATE goal_tree_proposal_items SET payload_json = ? WHERE item_id = ?").run(
    JSON.stringify({ ...storedChildPayload, definition_state: "draft", decomposition_state: "abstract" }),
    "web-footballnia-child",
  );
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: "web-decomposition-board" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const decisionPage = await (await webFetch(`${origin}/decisions`)).text();
    assert.match(decisionPage, /这份方案有 1 个 Goal 的拆解还不完整/);
    assert.match(decisionPage, /还没有交代通用结果链、当前任务的必要路径，或下面仍有目标没有拆完/);
    assert.match(decisionPage, /完整可玩的 Footballnia[\s\S]*仍有 1 条目标没拆完：完成 Footballnia 的完整游戏闭环/);
    assert.match(decisionPage, /核心玩法：由 「完成 Footballnia 的完整游戏闭环」 负责/);
    assert.match(decisionPage, /交互与 UI：由 「完成 Footballnia 的完整游戏闭环」 负责/);
    assert.match(decisionPage, /交付与发布：由 「完成 Footballnia 的完整游戏闭环」 负责/);
    assert.match(decisionPage, /完成 Footballnia 的完整游戏闭环 → 属于 → 交付完整可玩的 Footballnia/);
    assert.match(decisionPage, /请继续拆这些目标，或把父 Goal 保持为“仍需拆分”/);
    assert.match(decisionPage, /补充说明[\s\S]*可选/);
    assert.match(decisionPage, /GoalBoard 会自动附上上方问题；只有想补充时才填写/);
    assert.match(decisionPage, /value="reject">退回修正/);
    assert.match(decisionPage, /value="confirm" disabled aria-disabled="true">先补全 Goal 拆解/);

    const rejected = await webFetch(
      `${origin}/api/goal-tree-proposals/${encodeURIComponent(decompositionProposal.proposal_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decisions: decompositionProposal.items.map((item) => ({
            item_id: item.item_id,
            decision: "reject",
            reason: "",
          })),
          reason: "",
          idempotency_key: "web-footballnia-auto-reject",
        }),
      },
    );
    assert.equal(rejected.status, 200, await rejected.text());
    const board = (await (await webFetch(`${origin}/api/board`)).json()) as {
      snapshot: {
        goal_tree_proposals: Array<{
          proposal_id: string;
          state: string;
          items: Array<{ decision: { reason: string } | null }>;
        }>;
      };
    };
    const storedProposal = board.snapshot.goal_tree_proposals.find((item) =>
      item.proposal_id === decompositionProposal.proposal_id);
    assert.equal(storedProposal?.state, "rejected");
    assert.equal(storedProposal?.items.every((item) =>
      item.decision?.reason.includes("GoalBoard 自动退回修正")), true);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web explains why a historical pseudo-leaf must be split before the user can adopt it", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-leaf-readiness-"));
  const databasePath = join(directory, "goalboard.db");
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.initializeBoard({
    board_id: "web-leaf-readiness-board",
    title: "Leaf Readiness",
    actor_id: "web-user",
    idempotency_key: "web-leaf-readiness-init",
  });
  const dialogue = coordinator.startDraftDialogue({
    board_id: "web-leaf-readiness-board",
    actor_id: "runtime-clarifier",
    goal_id: "web-pseudo-leaf",
    rough_idea: "把一组仍然混在一起的工作误当成叶子。",
    idempotency_key: "web-leaf-readiness-dialogue",
  });
  const proposal = coordinator.submitGoalTreeProposal({
    board_id: "web-leaf-readiness-board",
    actor_id: "runtime-clarifier",
    discovered_in_run_id: dialogue.run!.run_id,
    root_goal_id: "web-pseudo-leaf",
    summary: "验证决定中心会阻止没有粒度说明的历史叶子方案。",
    items: [{
      item_id: "web-pseudo-leaf-contract",
      kind: "contract",
      operation: "update",
      payload: {
        goal_id: "web-pseudo-leaf",
        title: "交付一项可以直接验收的结果",
        outcome: "用户拿到一个范围清楚、可直接验收的结果。",
        why: "执行前必须知道唯一主要结果和完成依据。",
        business_logic: "先确认唯一结果，再围绕同一次验收完成必要配套工作。",
        in_scope: ["交付唯一主要结果"],
        out_of_scope: ["可单独交付的第二项结果"],
        required_inputs: ["已经确认的目标边界"],
        promised_outputs: ["可直接验收的主要结果"],
        definition_state: "accepted",
        decomposition_state: "closed_leaf",
        acceptance_criteria: [{
          criterion_id: "web-pseudo-leaf-result",
          statement: "主要结果可以独立验收",
          decision_method: "inspection",
          pass_condition: "用户能根据完成依据确认结果",
          required_evidence: ["inspection"],
        }],
        leaf_readiness: {
          verdict: "ready",
          primary_deliverable: "可直接验收的主要结果",
          output_coverage: [{
            promised_output: "可直接验收的主要结果",
            role: "primary",
            reason: "这是唯一独立交付和验收的结果。",
          }],
          split_candidates: [],
          rationale: "当前只有一个主要结果。",
          unresolved_decisions: [],
          independent_deliverables: [],
          acceptance_criterion_ids: ["web-pseudo-leaf-result"],
        },
      },
      source_refs: ["conversation://web-leaf-readiness"],
      reason: "形成一条可直接执行的 Goal。",
      confidence: 0.9,
      affected_objects: [{ object_type: "goal", object_id: "web-pseudo-leaf" }],
    }],
    idempotency_key: "web-leaf-readiness-proposal",
  }).proposal;
  const storedPayload = JSON.parse((store.db.prepare(
    "SELECT payload_json FROM goal_tree_proposal_items WHERE item_id = ?",
  ).get("web-pseudo-leaf-contract") as { payload_json: string }).payload_json) as Record<string, unknown>;
  const { leaf_readiness: _historicalMissingReadiness, ...historicalPayload } = storedPayload;
  store.db.prepare("UPDATE goal_tree_proposal_items SET payload_json = ? WHERE item_id = ?").run(
    JSON.stringify(historicalPayload),
    "web-pseudo-leaf-contract",
  );
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: "web-leaf-readiness-board" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const decisionPage = await (await webFetch(`http://127.0.0.1:${address.port}/decisions`)).text();
    assert.match(decisionPage, /这份方案有 1 个 Goal 还没拆到可以直接执行/);
    assert.match(decisionPage, /还没有说明唯一要交付的结果，也没有检查哪些工作应该另拆/);
    assert.match(decisionPage, /一条可执行 Goal 只能交付一个主要结果/);
    assert.match(decisionPage, /先拆成可执行 Goal/);
    assert.match(decisionPage, /value="confirm" disabled aria-disabled="true"/);
    assert.doesNotMatch(decisionPage, /采用整份方案<\/button>/);
    assert.ok(proposal.proposal_id);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web presents the shared result chain, AI-specific checks, and foundation dependency in plain language", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-task-chain-"));
  const databasePath = join(directory, "goalboard.db");
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.initializeBoard({
    board_id: "web-task-chain-board",
    title: "Task Chain",
    actor_id: "web-user",
    idempotency_key: "web-task-chain-init",
  });
  const dialogue = coordinator.startDraftDialogue({
    board_id: "web-task-chain-board",
    actor_id: "runtime-task-planner",
    goal_id: "web-ai-parent",
    rough_idea: "做一套能持续运行和评测的 AI 能力。",
    idempotency_key: "web-task-chain-dialogue",
  });
  const coreGoalId = "web-ai-core";
  const foundationGoalId = "web-ai-foundation";
  const taskAreas = [
    "final_outcome",
    "operating_flow",
    "core_capabilities",
    "foundation_infrastructure",
    "quality_continuous_delivery",
    "ai_data_sources_quality",
    "ai_evaluation",
    "ai_runtime_cost",
    "ai_safety_governance",
  ];
  const leafPayload = (goalId: string, title: string, output: string) => ({
    goal_id: goalId,
    title,
    outcome: `${output}可以独立交付和检查。`,
    why: "让整项 AI 工作有清楚的执行归属。",
    business_logic: "围绕一个主要结果完成必要工作，并用同一组依据验收。",
    in_scope: [output],
    out_of_scope: ["另一条可独立交付的结果"],
    required_inputs: ["已确认的 AI 任务边界"],
    promised_outputs: [output],
    definition_state: "accepted",
    decomposition_state: "closed_leaf",
    acceptance_criteria: [{
      criterion_id: `${goalId}-criterion`,
      statement: `${output}可检查`,
      decision_method: "inspection",
      pass_condition: "用户能根据约定依据判断通过或不通过",
      required_evidence: ["inspection"],
    }],
    leaf_readiness: {
      verdict: "ready",
      primary_deliverable: output,
      output_coverage: [{ promised_output: output, role: "primary", reason: "这是唯一主要结果。" }],
      split_candidates: [],
      rationale: "只有一个主要结果。",
      unresolved_decisions: [],
      independent_deliverables: [],
      acceptance_criterion_ids: [`${goalId}-criterion`],
    },
  });
  coordinator.submitGoalTreeProposal({
    board_id: "web-task-chain-board",
    actor_id: "runtime-task-planner",
    discovered_in_run_id: dialogue.run!.run_id,
    root_goal_id: "web-ai-parent",
    summary: "把 AI 最终结果、核心能力、支撑基础、质量交付和专属检查交代完整。",
    items: [
      {
        item_id: "web-ai-parent-contract",
        kind: "contract",
        operation: "update",
        payload: {
          goal_id: "web-ai-parent",
          title: "交付可持续运行和评测的 AI 能力",
          outcome: "使用者能稳定获得 AI 结果，并知道效果、成本和安全边界。",
          why: "不能只确认模型功能而省略数据、评测、运行和治理。",
          business_logic: "核心能力消费准备好的数据与运行基础，再通过评测、监控和治理持续交付。",
          definition_state: "accepted",
          decomposition_state: "closed_compound",
          acceptance_criteria: [{
            criterion_id: "web-ai-parent-complete",
            statement: "AI 结果链可以完整推进",
            decision_method: "inspection",
            pass_condition: "所有承担 Goal 和依赖都清楚",
            required_evidence: ["Goal Tree"],
          }],
          decomposition_review: {
            status: "complete",
            task_context: "ai_data",
            coverage: taskAreas.map((area) => ({
              area,
              disposition: "owned",
              goal_ids: [area === "foundation_infrastructure" ? foundationGoalId : coreGoalId],
              reason: area === "foundation_infrastructure"
                ? "这条 Goal 提供数据、工具和运行环境。"
                : "这条 Goal 负责用户结果、核心能力和 AI 专属检查。",
            })),
            open_goal_ids: [],
            next_step: "按依赖顺序推进基础能力和核心能力。",
          },
        },
        source_refs: ["conversation://web-task-chain"],
        reason: "把通用结果链和 AI 专属检查放回同一方案。",
        confidence: 0.95,
        affected_objects: [{ object_type: "goal", object_id: "web-ai-parent" }],
      },
      ...[
        [coreGoalId, "交付用户直接使用的 AI 核心能力", "可评测的 AI 核心能力"],
        [foundationGoalId, "准备 AI 运行需要的数据和基础环境", "可供核心能力消费的数据与运行基础"],
      ].flatMap(([goalId, title, output]) => [
        {
          item_id: `${goalId}-goal`,
          kind: "goal" as const,
          operation: "create" as const,
          payload: leafPayload(goalId, title, output),
          source_refs: ["conversation://web-task-chain"],
          reason: "形成一个边界清楚的执行结果。",
          confidence: 0.9,
          affected_objects: [{ object_type: "goal" as const, object_id: goalId }],
        },
        {
          item_id: `${goalId}-part-of`,
          kind: "relation" as const,
          operation: "create" as const,
          payload: { from_goal_id: goalId, to_goal_id: "web-ai-parent", type: "part_of" },
          source_refs: ["conversation://web-task-chain"],
          reason: "这条结果属于完整 AI 目标。",
          confidence: 0.95,
          affected_objects: [{ object_type: "relation" as const, object_id: `relation:${goalId}:web-ai-parent` }],
        },
      ]),
      {
        item_id: "web-ai-core-depends-on-foundation",
        kind: "dependency",
        operation: "create",
        payload: {
          from_goal_id: coreGoalId,
          to_goal_id: foundationGoalId,
          type: "depends_on",
          reason: "AI 核心能力要使用基础 Goal 提供的数据和运行环境。",
        },
        source_refs: ["conversation://web-task-chain"],
        reason: "说明核心工作消费哪项基础结果。",
        confidence: 0.98,
        affected_objects: [{ object_type: "relation", object_id: "relation:web-ai-core:web-ai-foundation" }],
      },
    ],
    idempotency_key: "web-task-chain-proposal",
  });
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: "web-task-chain-board" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const page = await (await webFetch(`http://127.0.0.1:${address.port}/decisions`)).text();
    assert.match(page, /任务类型：AI \/ 数据/);
    assert.match(page, /最终结果：由 「交付用户直接使用的 AI 核心能力」 负责/);
    assert.match(page, /核心能力：由 「交付用户直接使用的 AI 核心能力」 负责/);
    assert.match(page, /基础能力与基建：由 「准备 AI 运行需要的数据和基础环境」 负责/);
    assert.match(page, /数据来源与质量：由 「交付用户直接使用的 AI 核心能力」 负责/);
    assert.match(page, /运行方式与成本：由 「交付用户直接使用的 AI 核心能力」 负责/);
    assert.match(page, /交付用户直接使用的 AI 核心能力 → 依赖 → 准备 AI 运行需要的数据和基础环境/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web lets the user add and deactivate every supported Goal relation with explicit direction", async () => {
  const { databasePath } = webFixture();
  const server = createGoalBoardWebServer({ databasePath, boardId: DEMO_BOARD_ID, demo: true });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const initialPage = await (await webFetch(`${origin}/goals/CORE`)).text();
    assert.match(initialPage, /data-relation-editor/);
    assert.match(initialPage, /你正在直接修改 Goal 关系/);
    assert.match(initialPage, /执行工具提出的关系变化仍会先进入/);
    assert.match(initialPage, /name="relation_intent"/);
    assert.match(initialPage, /当前 Goal 开始前需要它完成/);
    assert.match(initialPage, /<select name="direction" required><option value="">请选择方向<\/option><option value="outgoing" selected>/);
    assert.match(initialPage, /<select name="type" required><option value="">请选择关系类型<\/option>/);
    assert.match(initialPage, /<option value="incoming">/);
    assert.match(initialPage, /data-relation-live-preview/);
    for (const type of [
      "part_of",
      "depends_on",
      "conflicts_with",
      "mitigates",
      "extends",
      "replaces",
      "corrects",
      "invalidates",
      "migrates_from",
    ]) {
      assert.match(initialPage, new RegExp(`<option value="${type}"`));
    }

    const missingReason = await webFetch(`${origin}/api/goals/CORE/relations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        direction: "incoming",
        type: "corrects",
        target_goal_id: "INTERFACES",
      }),
    });
    assert.equal(missingReason.status, 400);
    assert.match(await missingReason.text(), /为什么要建立这条关系/);

    const createResponse = await webFetch(`${origin}/api/goals/CORE/relations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        direction: "incoming",
        type: "corrects",
        target_goal_id: "INTERFACES",
        reason: "接口 Goal 修正当前执行闭环中的协议偏差",
        idempotency_key: "web-relation-maintenance-add",
      }),
    });
    assert.equal(createResponse.status, 201);
    const created = (await createResponse.json()) as { relation_id: string };
    const afterCreate = (await (await webFetch(`${origin}/api/board`)).json()) as {
      snapshot: {
        relations: Array<{
          relation_id: string;
          from_goal_id: string;
          to_goal_id: string;
          type: string;
          state: string;
          reason: string;
          deactivated_at: string | null;
        }>;
      };
    };
    const relation = afterCreate.snapshot.relations.find(
      (item) => item.relation_id === created.relation_id,
    );
    assert.deepEqual(
      relation && {
        from_goal_id: relation.from_goal_id,
        to_goal_id: relation.to_goal_id,
        type: relation.type,
        state: relation.state,
        reason: relation.reason,
      },
      {
        from_goal_id: "INTERFACES",
        to_goal_id: "CORE",
        type: "corrects",
        state: "active",
        reason: "接口 Goal 修正当前执行闭环中的协议偏差",
      },
    );
    const activePage = await (await webFetch(`${origin}/goals/CORE`)).text();
    assert.match(activePage, new RegExp(`data-relation-id="${created.relation_id}"`));
    assert.match(activePage, /让不同 AI 对话看到同一项目进度 → 修正 → 当前 Goal/);
    assert.match(activePage, /接口 Goal 修正当前执行闭环中的协议偏差/);
    assert.match(activePage, /data-relation-deactivate-open/);

    const missingDeactivateReason = await webFetch(
      `${origin}/api/relations/${encodeURIComponent(created.relation_id)}/deactivate`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    assert.equal(missingDeactivateReason.status, 400);
    assert.match(await missingDeactivateReason.text(), /必须说明原因/);

    const deactivateResponse = await webFetch(
      `${origin}/api/relations/${encodeURIComponent(created.relation_id)}/deactivate`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reason: "修正工作已经独立完成，这条关系不再成立",
          idempotency_key: "web-relation-maintenance-deactivate",
        }),
      },
    );
    assert.equal(deactivateResponse.status, 200);
    const deactivated = (await deactivateResponse.json()) as {
      relation: { state: string; deactivated_at: string | null };
    };
    assert.equal(deactivated.relation.state, "inactive");
    assert.ok(deactivated.relation.deactivated_at);
    const inactivePage = await (await webFetch(`${origin}/goals/CORE`)).text();
    assert.match(inactivePage, /已解除关系/);
    assert.match(inactivePage, /解除原因：修正工作已经独立完成，这条关系不再成立/);
    assert.doesNotMatch(
      inactivePage.match(
        new RegExp(`<div class="relation-record relation-record--inactive" data-relation-id="${created.relation_id}"[\\s\\S]*?<\\/div>`),
      )?.[0] ?? "",
      /data-relation-deactivate-open/,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web server keeps Candidate and Rewire as separate user decisions", async () => {
  const { databasePath } = webFixture();
  const server = createGoalBoardWebServer({ databasePath, boardId: DEMO_BOARD_ID, demo: true });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const goalPageResponse = await webFetch(`${origin}/goals/CORE`);
    assert.equal(goalPageResponse.status, 200);
    const goalPage = await goalPageResponse.text();
    assert.match(goalPage, /<title>让每项工作都有可信的完成依据 · GoalBoard<\/title>/);
    assert.match(goalPage, /data-goal-view="CORE"/);
    const missingGoalResponse = await webFetch(`${origin}/goals/DOES-NOT-EXIST`);
    assert.equal(missingGoalResponse.status, 404);

    const createResponse = await webFetch(`${origin}/api/goals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        goal_id: "WEB-CREATED",
        title: "从 Web 手动录入 Goal",
        outcome: "新 Goal 进入同一真相源",
        why: "用户需要直接记录新需求",
        business_logic: "用户先录入草稿，再由澄清者补全 Contract；Runtime 不会被自动启动。",
        priority: 55,
        parent_goal_id: "V1",
        dependency_goal_ids: ["CORE"],
        acceptance_criteria: ["页面可以打开新 Goal"],
        idempotency_key: "web-create-test",
      }),
    });
    assert.equal(createResponse.status, 201);
    const created = (await createResponse.json()) as {
      goal: { goal_id: string; definition_state: string; decomposition_state: string };
      goal_path: string;
    };
    assert.equal(created.goal.goal_id, "WEB-CREATED");
    assert.equal(created.goal.definition_state, "draft");
    assert.equal(created.goal.decomposition_state, "abstract");
    assert.equal(created.goal_path, "/goals/WEB-CREATED");
    const createdPage = await webFetch(`${origin}${created.goal_path}`);
    assert.equal(createdPage.status, 200);
    assert.match(await createdPage.text(), /从 Web 手动录入 Goal/);

    const boardResponse = await webFetch(`${origin}/api/board`);
    assert.equal(boardResponse.status, 200);
    const board = (await boardResponse.json()) as {
      snapshot: {
        candidates: Array<{
          candidate_id: string;
          state: string;
          proposed_goal: { title: string };
        }>;
        relations: Array<{ from_goal_id: string; to_goal_id: string; type: string }>;
      };
    };
    assert.ok(
      board.snapshot.relations.some(
        (relation) =>
          relation.from_goal_id === "WEB-CREATED" &&
          relation.to_goal_id === "V1" &&
          relation.type === "part_of",
      ),
    );
    assert.ok(
      board.snapshot.relations.some(
        (relation) =>
          relation.from_goal_id === "WEB-CREATED" &&
          relation.to_goal_id === "CORE" &&
          relation.type === "depends_on",
      ),
    );
    const candidate = board.snapshot.candidates.find((item) => item.state === "pending");
    assert.ok(candidate);

    const decisionCenter = await (await webFetch(`${origin}/decisions`)).text();
    assert.match(decisionCenter, /<title>等待你的决定 · GoalBoard<\/title>/);
    assert.match(decisionCenter, /data-decision-center/);
    assert.match(decisionCenter, /这些决定属于/);
    assert.match(decisionCenter, /<form class="decision-record candidate-decision"/);
    assert.match(decisionCenter, /为什么现在做/);
    assert.match(decisionCenter, /它会怎样运转/);
    assert.match(decisionCenter, /为什么要单独拆出来/);
    assert.match(decisionCenter, /这次会做/);
    assert.match(decisionCenter, /这次不做/);
    assert.match(decisionCenter, /完成标准/);
    assert.match(decisionCenter, /影响范围/);
    assert.match(decisionCenter, /风险/);
    assert.match(decisionCenter, /完成前需要的检查/);
    assert.match(decisionCenter, /放到当前方案里看/);
    assert.match(decisionCenter, /candidate-decision[\s\S]*<section class="decision-scenario"[\s\S]*<details class="decision-details"/);
    assert.match(decisionCenter, /如果加入[\s\S]*会新建独立 Goal「让旧数据升级前先看到安全说明」/);
    assert.match(decisionCenter, /不会自动成为「让不同 AI 对话看到同一项目进度」的子 Goal/);
    assert.match(decisionCenter, /不会自动开始执行/);
    assert.match(decisionCenter, /如果暂不加入[\s\S]*不会创建 Goal「让旧数据升级前先看到安全说明」/);
    assert.match(decisionCenter, /决定理由或修改意见/);
    const unrelatedGoalPage = await (await webFetch(`${origin}/goals/WEB`)).text();
    assert.doesNotMatch(unrelatedGoalPage, /<form class="decision-record candidate-decision"/);

    const unsafeReferenceResponse = await webFetch(`${origin}/api/reference?value=/etc/passwd`);
    assert.equal(unsafeReferenceResponse.status, 404);

    const missingCandidateReason = await webFetch(
      `${origin}/api/candidates/${encodeURIComponent(candidate.candidate_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "approved" }),
      },
    );
    assert.equal(missingCandidateReason.status, 400);
    assert.match(await missingCandidateReason.text(), /请填写决定理由或修改意见/);

    const decisionResponse = await webFetch(
      `${origin}/api/candidates/${encodeURIComponent(candidate.candidate_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: "approved",
          reason: "自动化测试接受示例 Candidate",
          idempotency_key: "web-candidate-test",
        }),
      },
    );
    assert.equal(decisionResponse.status, 200);
    const result = (await decisionResponse.json()) as {
      candidate: { state: string; decision: { reason: string } };
    };
    assert.equal(result.candidate.state, "approved");
    assert.equal(result.candidate.decision.reason, "自动化测试接受示例 Candidate");

    const afterCandidateResponse = await webFetch(`${origin}/api/board`);
    const afterCandidate = (await afterCandidateResponse.json()) as {
      snapshot: {
        rewires: Array<{ rewire_id: string; state: string }>;
        relations: Array<{ from_goal_id: string; to_goal_id: string; type: string }>;
        candidates: Array<{ candidate_id: string; discovered_in_run_id: string | null }>;
        runs: Array<{ run_id: string; goal_id: string }>;
      };
    };
    const rewire = afterCandidate.snapshot.rewires.find((item) => item.state === "pending");
    assert.ok(rewire);
    const pendingDecisionPage = await (await webFetch(`${origin}/decisions`)).text();
    assert.match(pendingDecisionPage, /最近处理结果/);
    assert.match(pendingDecisionPage, /新发现的工作/);
    assert.match(pendingDecisionPage, /这项工作已经成为独立 Goal/);
    assert.match(pendingDecisionPage, /自动化测试接受示例 Candidate/);
    assert.match(pendingDecisionPage, /保持现有关系/);
    assert.match(pendingDecisionPage, /<form class="decision-record rewire-decision"/);
    assert.match(pendingDecisionPage, /name="decision" value="confirmed"/);
    assert.match(pendingDecisionPage, /name="decision" value="rejected"/);
    assert.match(pendingDecisionPage, /已经在运行的终端和工作不会被改到别的 Goal/);
    const rewireForm = pendingDecisionPage.match(
      /<form class="decision-record rewire-decision"[\s\S]*?<\/form>/,
    )?.[0];
    assert.ok(rewireForm);
    assert.doesNotMatch(rewireForm, /active_runs_protected/);
    const candidateAfterApproval = afterCandidate.snapshot.candidates.find(
      (item) => item.candidate_id === candidate.candidate_id,
    );
    const ownerGoalId = afterCandidate.snapshot.runs.find(
      (run) => run.run_id === candidateAfterApproval?.discovered_in_run_id,
    )?.goal_id;
    assert.ok(ownerGoalId);
    const ownerPageWithDecision = await (await webFetch(`${origin}/goals/${encodeURIComponent(ownerGoalId)}`)).text();
    assert.match(ownerPageWithDecision, /处理 \d+ 项决定/);
    assert.doesNotMatch(ownerPageWithDecision, /<form class="decision-record rewire-decision"/);
    const relationCountBefore = afterCandidate.snapshot.relations.length;
    const missingRewireReason = await webFetch(
      `${origin}/api/rewires/${encodeURIComponent(rewire.rewire_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "rejected" }),
      },
    );
    assert.equal(missingRewireReason.status, 400);
    assert.match(await missingRewireReason.text(), /请填写决定理由或修改意见/);
    const rewireResponse = await webFetch(
      `${origin}/api/rewires/${encodeURIComponent(rewire.rewire_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: "rejected",
          reason: "保留新 Goal，但拒绝这次关系调整",
          idempotency_key: "web-rewire-reject-test",
        }),
      },
    );
    assert.equal(rewireResponse.status, 200);
    const rewireResult = (await rewireResponse.json()) as {
      rewire: { state: string; impact: Record<string, unknown> };
    };
    assert.equal(rewireResult.rewire.state, "rejected");
    assert.equal(rewireResult.rewire.impact.proposed_changes_applied, false);
    const afterRewire = (await (await webFetch(`${origin}/api/board`)).json()) as {
      snapshot: { relations: unknown[] };
    };
    assert.equal(afterRewire.snapshot.relations.length, relationCountBefore);
    const finalDecisionPage = await (await webFetch(`${origin}/decisions`)).text();
    assert.match(finalDecisionPage, /Goal 关系调整未采用/);
    assert.match(finalDecisionPage, /这次调整未采用，现有 Goal 关系没有改变/);
    assert.match(finalDecisionPage, /保留新 Goal，但拒绝这次关系调整/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web lets a user save a minimal Draft and confirm a readable Contract Proposal", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-contract-"));
  const databasePath = join(directory, "goalboard.db");
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.initializeBoard({
    board_id: "contract-board",
    title: "Draft Contract",
    actor_id: "web-user",
    idempotency_key: "contract-board-init",
  });
  const draft = coordinator.createGoal(
    "contract-board",
    {
      goal_id: "FIRST-DRAFT",
      title: "记录第一次使用的问题",
      outcome: "",
      why: "",
      business_logic: "",
      definition_state: "draft",
      decomposition_state: "abstract",
      priority: 30,
      acceptance_criteria: [],
    },
    { actor_id: "web-user", idempotency_key: "minimal-draft" },
  ).goal;
  const claim = coordinator.claimGoal({
    board_id: "contract-board",
    goal_id: draft.goal_id,
    actor_id: "clarifier-runtime",
    role: "clarifier",
    idempotency_key: "clarifier-claim",
  }).claim;
  assert.ok(claim);
  const run = coordinator.startRun({
    board_id: "contract-board",
    claim_id: claim.claim_id,
    actor_id: "clarifier-runtime",
    idempotency_key: "clarifier-run",
  }).run;
  coordinator.createGoal(
    "contract-board",
    {
      goal_id: "PRODUCT-ROOT",
      title: "交付完整产品",
      outcome: "产品具备完整可用体验",
      why: "为下游工作提供产品方向",
      business_logic: "各个子 Goal 共同促成产品完成，产品本身不是这些子 Goal 的执行前置。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [
        {
          criterion_id: "product-root-complete",
          statement: "产品完整交付",
          decision_method: "inspection",
          pass_condition: "所有必要体验已经完成",
        },
      ],
    },
    { actor_id: "web-user", idempotency_key: "product-root" },
  );
  coordinator.addRelation(
    "contract-board",
    {
      from_goal_id: draft.goal_id,
      to_goal_id: "PRODUCT-ROOT",
      type: "depends_on",
      reason: "创建 Draft 时误把所属产品选成执行前置",
    },
    { actor_id: "web-user", idempotency_key: "draft-product-dependency" },
  );
  const dependencyRewire = coordinator.submitDependencyProposal({
    board_id: "contract-board",
    actor_id: "clarifier-runtime",
    discovered_in_run_id: run.run_id,
    dependencies: [
      {
        from_goal_id: draft.goal_id,
        to_goal_id: "PRODUCT-ROOT",
        type: "depends_on",
        action: "deactivate",
        reason: "Draft 是产品的一部分，不应等待整个产品先完成",
        basis: "business_sequence",
        evidence_refs: ["contract://FIRST-DRAFT", "contract://PRODUCT-ROOT"],
        impact_if_rejected: "Draft 会被产品根 Goal 持续阻塞",
        confidence: 0.98,
        direction_reason: "Draft 不消费完整产品的输出，因此解除当前方向而不是反转它",
      },
    ],
    idempotency_key: "draft-dependency-proposal",
  }).rewire;
  const sourceFields = [
    "title",
    "outcome",
    "why",
    "business_logic",
    "in_scope",
    "out_of_scope",
    "required_inputs",
    "promised_outputs",
    "priority",
    "acceptance_criteria",
    "review_policy",
  ] as const;
  const proposal = coordinator.submitContractProposal({
    board_id: "contract-board",
    goal_id: draft.goal_id,
    actor_id: "clarifier-runtime",
    discovered_in_run_id: run.run_id,
    proposed_goal: {
      goal_id: draft.goal_id,
      title: "让新用户看懂第一次 Goal 领取",
      outcome: "新用户可以确认 Contract 并看到同一个 Goal 进入可执行状态",
      why: "第一次使用需要建立对 Goal 真相源的信任",
      business_logic: "用户先保存粗略想法，澄清者依据事实补全；用户确认后，执行者才可以领取同一个 Goal。",
      in_scope: ["Draft 补全", "用户确认"],
      out_of_scope: ["自动启动 Runtime"],
      constraints: [],
      required_inputs: ["已经保存的首次 Goal 想法"],
      promised_outputs: ["可确认并进入执行状态的首次 Goal Contract"],
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      priority: 70,
      acceptance_criteria: [
        {
          criterion_id: "first-draft-confirmed",
          statement: "确认后同一个 Goal 成为 accepted",
          decision_method: "automated_check",
          pass_condition: "FIRST-DRAFT 的 definition_state 为 accepted",
          required_evidence: ["test"],
        },
      ],
      leaf_readiness: {
        verdict: "ready",
        primary_deliverable: "可确认并进入执行状态的首次 Goal Contract",
        output_coverage: [{
          promised_output: "可确认并进入执行状态的首次 Goal Contract",
          role: "primary",
          reason: "这是新用户本次流程唯一需要独立确认和验收的结果。",
        }],
        split_candidates: [],
        rationale: "保存、补全和确认共同形成同一份首次 Goal Contract。",
        unresolved_decisions: [],
        independent_deliverables: [],
        acceptance_criterion_ids: ["first-draft-confirmed"],
      },
    },
    field_sources: sourceFields.map((field) => ({
      field,
      source_kind:
        field === "outcome" || field === "why" ? "user_answer" as const : "document_fact" as const,
      source_refs: ["specs/draft-contract-clarification/spec.md"],
      confidence: field === "business_logic" ? 0.82 : 0.95,
      rationale: `${field} 来自用户确认方向和产品需求书`,
      status: "proposed" as const,
      requires_user_confirmation: true as const,
    })),
    review_policy: {
      goal_mode: "required",
      required_capabilities: [],
      self_verification: true,
      cross_reviewers: 0,
      adversarial_reviewers: 0,
      human_approval: false,
      max_lease_seconds: 1800,
    },
    proposed_impacts: [
      { surface: "src/web", access: "write", reason: "补全 Draft 确认入口" },
    ],
    proposed_risks: [],
    dependency_rewire_ids: [dependencyRewire.rewire_id],
    idempotency_key: "contract-proposal",
  }).proposal;
  coordinator.reportRun({
    board_id: "contract-board",
    run_id: run.run_id,
    actor_id: "clarifier-runtime",
    state: "completed",
    output_refs: [proposal.proposal_id],
    idempotency_key: "clarifier-run-completed",
  });
  coordinator.releaseClaim({
    board_id: "contract-board",
    claim_id: claim.claim_id,
    actor_id: "clarifier-runtime",
    reason: "方案已提交，等待用户决定",
    idempotency_key: "clarifier-claim-released",
  });
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: "contract-board" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const page = await (await webFetch(`${origin}/goals/FIRST-DRAFT`)).text();
    assert.match(page, /goal-status--clarification_decision_pending[^>]*[\s\S]*?<span>待你确认<\/span>/);
    assert.match(page, /方案已经整理好/);
    assert.match(page, /查看并决定这份方案/);
    assert.match(page, /目标方案已经整理好，正在等你确认或退回修改/);
    assert.doesNotMatch(page, /clarifier 已提交 Contract/);
    assert.match(page, /href="\/decisions#decision-goal-FIRST-DRAFT"/);
    assert.match(page, /处理 2 项决定/);
    assert.doesNotMatch(page, /<form class="decision-record contract-proposal"/);
    const decisionPage = await (await webFetch(`${origin}/decisions`)).text();
    assert.match(decisionPage, /这条 Goal 已经说清楚，可以开始了吗？/);
    assert.match(decisionPage, /目标、范围和完成标准会成为正式依据/);
    assert.match(decisionPage, /用户回答 · 可信度 95% · 待你确认/);
    assert.match(decisionPage, /文档事实 · 可信度 82% · 待你确认/);
    assert.match(decisionPage, /<form class="decision-record contract-proposal"/);
    assert.match(decisionPage, /放到当前方案里看/);
    assert.match(decisionPage, /contract-proposal[\s\S]*<section class="decision-scenario"[\s\S]*<details class="decision-details"/);
    assert.match(decisionPage, /如果确认[\s\S]*不会新建另一条 Goal/);
    assert.match(decisionPage, /现有 Goal「记录第一次使用的问题」会更新为「让新用户看懂第一次 Goal 领取」/);
    assert.match(decisionPage, /随后进入“待执行”，但仍要由 Runtime 领取后才会开始/);
    assert.match(decisionPage, /如果退回[\s\S]*Goal「记录第一次使用的问题」仍保持当前草稿/);
    assert.match(decisionPage, /请先处理上方的 Goal 关系调整；完成后才能确认这份目标说明/);
    assert.match(decisionPage, /决定理由或修改意见/);
    assert.match(
      decisionPage,
      /name="decision" value="approved"[^>]*disabled[^>]*>先处理 Goal 关系<\/button>/,
    );
    assert.ok(
      decisionPage.indexOf(`data-rewire-id="${dependencyRewire.rewire_id}"`) <
        decisionPage.indexOf(`data-contract-proposal-id="${proposal.proposal_id}"`),
    );

    const rewireDecision = await webFetch(
      `${origin}/api/rewires/${encodeURIComponent(dependencyRewire.rewire_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: "confirmed",
          reason: "先完成 Contract 引用的依赖决定",
          idempotency_key: "web-contract-rewire-confirm",
        }),
      },
    );
    assert.equal(rewireDecision.status, 200, await rewireDecision.text());
    const resolvedPage = await (await webFetch(`${origin}/decisions`)).text();
    assert.match(resolvedPage, /关联的 Goal 关系已经决定，现在可以确认目标说明/);
    assert.match(resolvedPage, /确认并允许开始/);
    assert.doesNotMatch(
      resolvedPage,
      /name="decision" value="approved"[^>]*disabled/,
    );

    const missingContractReason = await webFetch(
      `${origin}/api/contract-proposals/${encodeURIComponent(proposal.proposal_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "approved" }),
      },
    );
    assert.equal(missingContractReason.status, 400);
    assert.match(await missingContractReason.text(), /请填写决定理由或修改意见/);

    const decision = await webFetch(
      `${origin}/api/contract-proposals/${encodeURIComponent(proposal.proposal_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: "approved",
          reason: "测试确认完整 Contract",
          idempotency_key: "web-contract-approve",
        }),
      },
    );
    assert.equal(decision.status, 200, await decision.text());
    const board = (await (await webFetch(`${origin}/api/board`)).json()) as {
      snapshot: { goals: Array<{ goal_id: string; definition_state: string; outcome: string }> };
    };
    const accepted = board.snapshot.goals.find((goal) => goal.goal_id === "FIRST-DRAFT");
    assert.equal(accepted?.definition_state, "accepted");
    assert.equal(accepted?.outcome, "新用户可以确认 Contract 并看到同一个 Goal 进入可执行状态");
    const acceptedPage = await (await webFetch(`${origin}/goals/FIRST-DRAFT`)).text();
    assert.doesNotMatch(acceptedPage, /<form class="decision-record contract-proposal"/);
    assert.match(acceptedPage, /让新用户看懂第一次 Goal 领取/);
    const acceptedDecisionPage = await (await webFetch(`${origin}/decisions`)).text();
    assert.match(acceptedDecisionPage, /最近处理结果/);
    assert.match(acceptedDecisionPage, /目标、范围和完成标准已成为正式依据/);
    assert.match(acceptedDecisionPage, /测试确认完整 Contract/);

    const minimalCreate = await webFetch(`${origin}/api/goals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "只先记录一个想法", idempotency_key: "title-only-web" }),
    });
    const minimalText = await minimalCreate.text();
    assert.equal(minimalCreate.status, 201, minimalText);
    const minimal = JSON.parse(minimalText) as {
      goal: { outcome: string; why: string; business_logic: string; definition_state: string };
    };
    assert.equal(minimal.goal.definition_state, "draft");
    assert.equal(minimal.goal.outcome, "");
    assert.equal(minimal.goal.why, "");
    assert.equal(minimal.goal.business_logic, "");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web maintains a structured Draft Contract and initial Risk and Impact without editing accepted Goals", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-draft-editor-"));
  const databasePath = join(directory, "goalboard.db");
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.initializeBoard({
    board_id: "draft-editor-board",
    title: "Draft Editor",
    actor_id: "web-user",
    idempotency_key: "draft-editor-board-init",
  });
  coordinator.createGoal(
    "draft-editor-board",
    {
      goal_id: "EDIT-ME",
      title: "先记录一个模糊想法",
      outcome: "",
      why: "",
      business_logic: "",
      definition_state: "draft",
      decomposition_state: "abstract",
      acceptance_criteria: [],
    },
    { actor_id: "web-user", idempotency_key: "edit-me-create" },
  );
  coordinator.createGoal(
    "draft-editor-board",
    {
      goal_id: "LOCKED",
      title: "已经接受的 Goal",
      outcome: "Contract 已经固定",
      why: "验证不可变边界",
      business_logic: "新需求创建新 Goal，不原地重写 accepted Contract。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [
        {
          criterion_id: "locked-c1",
          statement: "accepted Goal 无编辑入口",
          decision_method: "automated_check",
          pass_condition: "页面不存在 Draft 编辑表单",
          required_evidence: ["test"],
        },
      ],
    },
    { actor_id: "web-user", idempotency_key: "locked-create" },
  );
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: "draft-editor-board" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const draftPage = await (await webFetch(`${origin}/goals/EDIT-ME`)).text();
    assert.match(draftPage, /data-draft-editor data-goal-id="EDIT-ME"/);
    assert.match(draftPage, /修改目标说明和完成标准/);
    assert.match(draftPage, /href="#acceptance-EDIT-ME">查看完成标准<\/a>/);
    assert.match(draftPage, /value="abstract"/);
    assert.match(draftPage, /value="frontier_open"/);
    assert.match(draftPage, /value="closed_leaf"/);
    assert.match(draftPage, /value="closed_compound"/);
    assert.match(draftPage, /data-criterion-field="decision_method"/);
    assert.match(draftPage, /href="#goal-factor-panel-risks-EDIT-ME"/);
    assert.match(draftPage, /data-risk-create-form/);
    assert.match(draftPage, /href="#goal-factor-panel-impacts-EDIT-ME"/);
    assert.match(draftPage, /data-impact-create-form/);
    assert.match(draftPage, /href="#goal-factor-panel-rules-EDIT-ME"/);
    assert.match(draftPage, /data-policy-form/);
    assert.ok(draftPage.indexOf("完成要求") < draftPage.indexOf("修改目标说明和完成标准"));

    const updateResponse = await webFetch(`${origin}/api/goals/EDIT-ME/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "把完整工作拆成一组闭环子 Goal",
        outcome: "用户可以确认每个子 Goal 的独立交付结果",
        why: "多个结果可以分别失败和 Review",
        business_logic: "复合父 Goal 组织一组最小闭环子 Goal，每个叶子有自己的可观察验收。",
        in_scope: ["Draft Contract 全字段", "结构化验收"],
        out_of_scope: ["自动接受 Runtime 提案"],
        constraints: ["accepted Contract 不原地修改"],
        required_inputs: ["用户确认的业务边界"],
        promised_outputs: ["可执行子 Goal 族"],
        decomposition_state: "closed_compound",
        priority: 72,
        acceptance_criteria: [
          {
            criterion_id: "edit-me-c1",
            statement: "子 Goal 可以分别交付",
            decision_method: "measurement",
            pass_condition: "每个子 Goal 都有独立输出",
            target: { value: "100%" },
            required_evidence: ["test", "inspection"],
          },
          {
            statement: "用户可以确认拆分完成",
            decision_method: "human_decision",
            pass_condition: "用户给出明确通过结论",
            target: null,
            required_evidence: ["review"],
          },
        ],
        reason: "用户补全范围、拆分状态和验收方式",
        idempotency_key: "web-draft-structured-update",
      }),
    });
    assert.equal(updateResponse.status, 200, await updateResponse.text());

    const riskResponse = await webFetch(`${origin}/api/goals/EDIT-ME/risks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        description: "子 Goal 边界仍可能重叠",
        probability: "中",
        impact: "高",
        affected_surfaces: ["src/web", "Goal Tree"],
        trigger: "两个子 Goal 同时修改同一业务决策",
        treatment: "mitigate",
        blocking_mode: "completion",
        revisit_condition: "子 Goal 关系确认后复查",
        owner: "product-owner",
        reason: "Draft 阶段先记录影响拆分的风险",
        idempotency_key: "web-draft-risk",
      }),
    });
    assert.equal(riskResponse.status, 201, await riskResponse.text());

    const impactResponse = await webFetch(`${origin}/api/goals/EDIT-ME/impacts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        surface: "src/web",
        access: "write",
        input_snapshot: "contract://EDIT-ME",
        reason: "Draft 编辑器会写入 Web 工作区",
        idempotency_key: "web-draft-impact",
      }),
    });
    assert.equal(impactResponse.status, 201, await impactResponse.text());

    const board = (await (await webFetch(`${origin}/api/board`)).json()) as {
      snapshot: {
        goals: Array<{
          goal_id: string;
          title: string;
          definition_state: string;
          decomposition_state: string;
          acceptance_criteria: Array<{
            decision_method: string;
            target: Record<string, unknown> | null;
            required_evidence: string[];
          }>;
        }>;
        risks: Array<{ description: string; state: string }>;
        impacts: Array<{ goal_id: string; surface: string; state: string }>;
      };
    };
    const edited = board.snapshot.goals.find((goal) => goal.goal_id === "EDIT-ME");
    assert.equal(edited?.title, "把完整工作拆成一组闭环子 Goal");
    assert.equal(edited?.definition_state, "draft");
    assert.equal(edited?.decomposition_state, "closed_compound");
    const structuredCriterion = edited?.acceptance_criteria.find(
      (criterion) => criterion.decision_method === "measurement",
    );
    assert.deepEqual(structuredCriterion?.target, { value: "100%" });
    assert.deepEqual(structuredCriterion?.required_evidence, ["test", "inspection"]);
    assert.ok(board.snapshot.risks.some((risk) => risk.description === "子 Goal 边界仍可能重叠" && risk.state === "open"));
    assert.ok(board.snapshot.impacts.some((impact) => impact.goal_id === "EDIT-ME" && impact.surface === "src/web" && impact.state === "confirmed"));

    const updatedPage = await (await webFetch(`${origin}/goals/EDIT-ME`)).text();
    const updatedRecords = await (
      await webFetch(`${origin}/api/goals/EDIT-ME/records?view=current`)
    ).text();
    assert.match(updatedRecords, /目标：100%/);
    assert.match(updatedRecords, /证据：test、inspection/);
    assert.match(updatedPage, /子 Goal 边界仍可能重叠/);
    assert.match(updatedPage, /contract:\/\/EDIT-ME/);

    const lockedPage = await (await webFetch(`${origin}/goals/LOCKED`)).text();
    assert.doesNotMatch(lockedPage, /data-draft-editor data-goal-id="LOCKED"/);
    const lockedUpdate = await webFetch(`${origin}/api/goals/LOCKED/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "不允许修改",
        outcome: "不应写入",
        why: "验证边界",
        business_logic: "accepted Contract 不可变。",
        decomposition_state: "closed_leaf",
        priority: 0,
        acceptance_criteria: [
          {
            statement: "接口拒绝",
            decision_method: "inspection",
            pass_condition: "返回 400",
          },
        ],
        reason: "测试不可变边界",
      }),
    });
    assert.equal(lockedUpdate.status, 400);
    assert.match(await lockedUpdate.text(), /accepted Contract 不能原地修改/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web maintains complete Risk facts, linked Goals, lifecycle states, and their visible effect", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-risk-workbench-"));
  const databasePath = join(directory, "goalboard.db");
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.initializeBoard({
    board_id: "risk-workbench-board",
    title: "Risk Workbench",
    actor_id: "web-user",
    idempotency_key: "risk-workbench-init",
  });
  for (const [goalId, title] of [["RISK-A", "交付风险工作台"], ["RISK-B", "验证关联 Goal"]] as const) {
    coordinator.createGoal(
      "risk-workbench-board",
      {
        goal_id: goalId,
        title,
        outcome: `${title}有明确结果`,
        why: "验证 Risk 真相源",
        business_logic: "用户维护事实和状态，GoalBoard 根据阻塞方式解释影响。",
        definition_state: "accepted",
        decomposition_state: "closed_leaf",
        acceptance_criteria: [
          {
            criterion_id: `${goalId}-C1`,
            statement: "Risk 可以完整维护",
            decision_method: "automated_check",
            pass_condition: "页面和接口保存完整 Risk",
            required_evidence: ["test"],
          },
        ],
      },
      { actor_id: "web-user", idempotency_key: `create-${goalId}` },
    );
  }
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: "risk-workbench-board" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const emptyPage = await (await webFetch(`${origin}/goals/RISK-A`)).text();
    assert.match(emptyPage, /data-risk-create-form/);
    assert.match(emptyPage, /name="description"/);
    assert.match(emptyPage, /name="affected_surfaces"/);
    assert.match(emptyPage, /name="blocking_mode"/);
    assert.match(emptyPage, /name="treatment_plan"/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /需要确认处理结果时，请到待决定/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /这次修改没有改变它的处理结果/);
    assert.match(emptyPage, /name="goal_ids" value="RISK-A" checked/);
    assert.match(emptyPage, /验证关联 Goal/);
    assert.match(WORKBENCH_STYLES, /\.risk-facts, \.risk-form, \.risk-state-form \{ grid-template-columns: 1fr; \}/);
    assert.match(WORKBENCH_STYLES, /\.risk-form input:not\(\[type=checkbox\]\).*font-size: 16px/);

    const createResponse = await webFetch(`${origin}/api/goals/RISK-A/risks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        goal_ids: ["RISK-A", "RISK-B"],
        description: "外部规则可能在交付前改变",
        probability: "35%",
        impact: "高",
        affected_surfaces: ["src/web", "Contract"],
        trigger: "规则正式发布新版本",
        treatment: "mitigate",
        treatment_plan: "提前核对外部规则，并保留兼容路径",
        blocking_mode: "completion",
        revisit_condition: "每次规则发布后复查",
        owner: "product-owner",
        reason: "两个 Goal 共享同一个外部规则",
        idempotency_key: "web-risk-create-complete",
      }),
    });
    const created = (await createResponse.json()) as { risk: { risk_id: string } };
    assert.equal(createResponse.status, 201, JSON.stringify(created));

    const populatedPage = await (await webFetch(`${origin}/goals/RISK-A`)).text();
    assert.match(populatedPage, /外部规则可能在交付前改变/);
    assert.match(populatedPage, /35%/);
    assert.match(populatedPage, /具体措施[\s\S]*提前核对外部规则，并保留兼容路径/);
    assert.match(populatedPage, /阻止完成/);
    assert.match(populatedPage, /当前会阻止所有关联 Goal 被标记为完成/);
    assert.match(populatedPage, /data-risk-edit-form/);
    assert.doesNotMatch(populatedPage, /<form class="risk-state-form"/);
    assert.match(populatedPage, /去待决定处理这个风险/);
    const riskDecisionPage = await (await webFetch(`${origin}/decisions`)).text();
    assert.match(riskDecisionPage, /<form class="decision-record risk-decision" data-risk-state-form/);
    assert.match(riskDecisionPage, /<option value="" selected disabled>请选择处理结果<\/option>/);
    assert.match(riskDecisionPage, /保持待处理，继续阻塞完成/);
    assert.doesNotMatch(riskDecisionPage, /<option value="open" selected/);
    for (const state of ["open", "triggered", "resolved", "accepted", "expired"]) {
      assert.match(riskDecisionPage, new RegExp(`option value="${state}"`));
    }

    const updateResponse = await webFetch(`${origin}/api/risks/${encodeURIComponent(created.risk.risk_id)}/update`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        goal_ids: ["RISK-B"],
        description: "外部规则已经进入确认窗口",
        probability: "60%",
        impact: "中高",
        affected_surfaces: ["Contract", "tests"],
        trigger: "规则负责人确认变更",
        treatment: "avoid",
        treatment_plan: "在规则冻结前不接入新的外部字段",
        blocking_mode: "claim",
        revisit_condition: "负责人给出最终版本后复查",
        owner: "risk-owner",
        reason: "缩小影响 Goal，并更新处理责任",
        idempotency_key: "web-risk-update-complete",
      }),
    });
    assert.equal(updateResponse.status, 200, await updateResponse.text());

    for (const state of ["triggered", "resolved", "accepted", "expired", "open"] as const) {
      const stateResponse = await webFetch(`${origin}/api/risks/${encodeURIComponent(created.risk.risk_id)}/state`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          state,
          reason: `用户确认进入 ${state}`,
          idempotency_key: `web-risk-state-${state}`,
        }),
      });
      assert.equal(stateResponse.status, 200, await stateResponse.text());
    }
    const missingReason = await webFetch(`${origin}/api/risks/${encodeURIComponent(created.risk.risk_id)}/state`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: "resolved", reason: "" }),
    });
    assert.equal(missingReason.status, 400);
    assert.match(await missingReason.text(), /必须说明原因/);

    const updatedPage = await (await webFetch(`${origin}/goals/RISK-B`)).text();
    assert.match(updatedPage, /外部规则已经进入确认窗口/);
    assert.match(updatedPage, /60%/);
    assert.match(updatedPage, /规避 \/ 阻止领取/);
    assert.match(updatedPage, /开放/);
    assert.match(updatedPage, /交付风险工作台/);
    const verify = new SqliteGoalBoardStore(databasePath);
    try {
      assert.deepEqual(
        (verify.db.prepare("SELECT goal_id FROM goal_risks WHERE risk_id = ? ORDER BY goal_id").all(created.risk.risk_id) as Array<{ goal_id: string }>).map((row) => row.goal_id),
        ["RISK-B"],
      );
      const stored = verify.snapshot("risk-workbench-board").risks.find((risk) => risk.risk_id === created.risk.risk_id);
      assert.equal(stored?.description, "外部规则已经进入确认窗口");
      assert.deepEqual(stored?.affected_surfaces, ["Contract", "tests"]);
      assert.equal(stored?.owner, "risk-owner");
      assert.equal(stored?.treatment_plan, "在规则冻结前不接入新的外部字段");
      assert.ok(verify.db.prepare("SELECT 1 FROM events WHERE object_id = ? AND type = 'risk.updated'").get(created.risk.risk_id));
    } finally {
      verify.close();
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web maintains Impact facts, access state, deactivation, and retained history", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-impact-workbench-"));
  const databasePath = join(directory, "goalboard.db");
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.initializeBoard({
    board_id: "impact-workbench-board",
    title: "Impact Workbench",
    actor_id: "web-user",
    idempotency_key: "impact-workbench-init",
  });
  coordinator.createGoal(
    "impact-workbench-board",
    {
      goal_id: "IMPACT-A",
      title: "维护并发影响面",
      outcome: "Impact Binding 可以持续维护",
      why: "验证并行领取边界",
      business_logic: "用户记录区域和访问方式，停用后保留历史但不再形成门禁。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [
        {
          criterion_id: "IMPACT-A-C1",
          statement: "Impact 可维护",
          decision_method: "automated_check",
          pass_condition: "页面和接口保存完整 Impact",
          required_evidence: ["test"],
        },
      ],
    },
    { actor_id: "web-user", idempotency_key: "impact-workbench-goal" },
  );
  coordinator.createGoal(
    "impact-workbench-board",
    {
      goal_id: "IMPACT-B",
      title: "另一条 Impact Goal",
      outcome: "用于验证 HTTP 归属边界",
      why: "URL 中的 Goal 必须是新增绑定的唯一归属",
      business_logic: "不能通过请求正文把 Impact 写入另一个 Goal。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [
        {
          criterion_id: "IMPACT-B-C1",
          statement: "可作为边界验证目标",
          decision_method: "inspection",
          pass_condition: "请求正文不能覆盖 URL Goal",
          required_evidence: ["test"],
        },
      ],
    },
    { actor_id: "web-user", idempotency_key: "impact-workbench-second-goal" },
  );
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: "impact-workbench-board" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const emptyPage = await (await webFetch(`${origin}/goals/IMPACT-A`)).text();
    assert.match(emptyPage, /data-impact-create-form/);
    assert.match(emptyPage, /name="surface"/);
    for (const access of ["read", "write", "decide", "exclusive"]) {
      assert.match(emptyPage, new RegExp(`option value="${access}"`));
    }
    assert.match(emptyPage, /option value="confirmed"/);
    assert.match(emptyPage, /option value="proposed"/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /并按保存的确认状态参与工作冲突判断/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /旧值和修改说明已进入完整记录/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /不再参与工作冲突判断；原记录和停用原因仍会保留/);
    assert.match(WORKBENCH_STYLES, /\.impact-facts, \.impact-form \{ grid-template-columns: 1fr; \}/);
    assert.match(WORKBENCH_STYLES, /\.impact-form input.*font-size: 16px/);

    const createResponse = await webFetch(`${origin}/api/goals/IMPACT-A/impacts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        goal_id: "IMPACT-B",
        surface: "src/web/render.ts",
        access: "read",
        input_snapshot: "https://example.com/render-contract",
        state: "confirmed",
        reason: "读取当前渲染 Contract",
        idempotency_key: "web-impact-create-complete",
      }),
    });
    const created = (await createResponse.json()) as { binding_id: string };
    assert.equal(createResponse.status, 201, JSON.stringify(created));
    const afterCreate = new SqliteGoalBoardStore(databasePath);
    try {
      const createdImpact = afterCreate.snapshot("impact-workbench-board").impacts.find((impact) => impact.binding_id === created.binding_id);
      assert.equal(createdImpact?.goal_id, "IMPACT-A", "the URL Goal owns a newly created Impact");
    } finally {
      afterCreate.close();
    }

    const populatedPage = await (await webFetch(`${origin}/goals/IMPACT-A`)).text();
    assert.match(populatedPage, /src\/web\/render\.ts/);
    assert.match(populatedPage, /读取当前渲染 Contract/);
    assert.match(populatedPage, /只读取该区域，并已固定输入快照/);
    assert.match(populatedPage, /data-impact-edit-form/);
    assert.match(populatedPage, /data-impact-deactivate-form/);
    assert.match(populatedPage, /href="https:\/\/example\.com\/render-contract"/);

    const updateResponse = await webFetch(`${origin}/api/impacts/${encodeURIComponent(created.binding_id)}/update`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        goal_id: "IMPACT-A",
        surface: "src/domain/goal.ts",
        access: "exclusive",
        input_snapshot: "contract://IMPACT-A",
        state: "proposed",
        reason: "准备独占修改 Goal 领域模型",
        audit_reason: "实际影响范围从读取渲染改为修改领域模型",
        idempotency_key: "web-impact-update-complete",
      }),
    });
    assert.equal(updateResponse.status, 200, await updateResponse.text());
    const proposedPage = await (await webFetch(`${origin}/goals/IMPACT-A`)).text();
    assert.match(proposedPage, /src\/domain\/goal\.ts/);
    assert.match(proposedPage, /独占 \/ 提议中/);
    assert.match(proposedPage, /尚未确认，不会阻止其他工作开始/);

    const missingAuditReason = await webFetch(`${origin}/api/impacts/${encodeURIComponent(created.binding_id)}/update`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        goal_id: "IMPACT-A",
        surface: "src/domain/goal.ts",
        access: "exclusive",
        state: "confirmed",
        reason: "确认独占修改",
        audit_reason: "",
      }),
    });
    assert.equal(missingAuditReason.status, 400);
    assert.match(await missingAuditReason.text(), /必须说明修改原因/);

    const deactivateResponse = await webFetch(`${origin}/api/impacts/${encodeURIComponent(created.binding_id)}/deactivate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reason: "领域修改已迁移到后续 Goal",
        idempotency_key: "web-impact-deactivate-complete",
      }),
    });
    assert.equal(deactivateResponse.status, 200, await deactivateResponse.text());
    const historyPage = await (await webFetch(`${origin}/goals/IMPACT-A`)).text();
    assert.match(historyPage, /已停用记录/);
    assert.match(historyPage, /领域修改已迁移到后续 Goal/);
    assert.match(historyPage, /只作为历史保留，不再参与工作冲突判断/);
    assert.doesNotMatch(historyPage, /data-impact-edit-form data-live-form=/);

    const verify = new SqliteGoalBoardStore(databasePath);
    try {
      const stored = verify.snapshot("impact-workbench-board").impacts.find((impact) => impact.binding_id === created.binding_id);
      assert.equal(stored?.surface, "src/domain/goal.ts");
      assert.equal(stored?.access, "exclusive");
      assert.equal(stored?.input_snapshot, "contract://IMPACT-A");
      assert.equal(stored?.state, "inactive");
      assert.equal(stored?.deactivation_reason, "领域修改已迁移到后续 Goal");
      assert.ok(verify.db.prepare("SELECT 1 FROM events WHERE object_id = ? AND type = 'impact.updated'").get(created.binding_id));
      assert.ok(verify.db.prepare("SELECT 1 FROM events WHERE object_id = ? AND type = 'impact.deactivated'").get(created.binding_id));
    } finally {
      verify.close();
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web edits project and Goal Policy and submits a user-only Human Review", async () => {
  const { databasePath } = webFixture();
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.createGoal(
    DEMO_BOARD_ID,
    {
      goal_id: "POLICY-WEB",
      title: "维护 Runtime 与 Review Policy",
      outcome: "用户可以配置规则并完成最终确认",
      why: "验证 Policy 和 Human Review 的 Web 闭环",
      business_logic: "项目默认提供基线，当前 Goal 只能增加要求，用户 Review 记录最终判断。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [
        {
          criterion_id: "POLICY-WEB-C1",
          statement: "Policy 与 Review 可以保存",
          decision_method: "automated_check",
          pass_condition: "Web API 和页面均可使用",
          required_evidence: ["test"],
        },
      ],
    },
    { actor_id: "test-user", idempotency_key: "create-policy-web" },
  );
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: DEMO_BOARD_ID });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const projectPolicy = await webFetch(`${origin}/api/policy-bindings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scope: "project_default",
        reason: "设置项目默认规则",
        policy: {
          goal_mode: "required",
          required_capabilities: [],
          self_verification: true,
          cross_reviewers: 0,
          adversarial_reviewers: 0,
          human_approval: false,
          max_lease_seconds: 1800,
        },
      }),
    });
    assert.equal(projectPolicy.status, 200, await projectPolicy.text());
    const goalPolicy = await webFetch(`${origin}/api/policy-bindings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scope: "goal",
        goal_id: "POLICY-WEB",
        reason: "当前 Goal 需要独立验证和用户最终确认",
        policy: {
          goal_mode: "required",
          required_capabilities: ["browser"],
          self_verification: true,
          cross_reviewers: 1,
          adversarial_reviewers: 1,
          human_approval: true,
          max_lease_seconds: 900,
        },
      }),
    });
    assert.equal(goalPolicy.status, 200, await goalPolicy.text());

    const runtimeStore = new SqliteGoalBoardStore(databasePath);
    const runtimeCoordinator = new GoalBoardCoordinator(runtimeStore);
    const claim = runtimeCoordinator.claimGoal({
      board_id: DEMO_BOARD_ID,
      goal_id: "POLICY-WEB",
      actor_id: "runtime-policy-web",
      role: "executor",
      capabilities: ["browser"],
      goal_mode_attestation: true,
      idempotency_key: "claim-policy-web",
    }).claim;
    assert.ok(claim);
    const run = runtimeCoordinator.startRun({
      board_id: DEMO_BOARD_ID,
      goal_id: "POLICY-WEB",
      claim_id: claim.claim_id,
      actor_id: "runtime-policy-web",
      contract_cursor: runtimeStore.eventCursor(DEMO_BOARD_ID),
      idempotency_key: "run-policy-web",
    }).run;
    const evidence = runtimeCoordinator.submitEvidence({
      board_id: DEMO_BOARD_ID,
      goal_id: "POLICY-WEB",
      actor_id: "runtime-policy-web",
      criterion_ids: ["POLICY-WEB-C1"],
      run_id: run.run_id,
      kind: "test",
      locator: "tests/web.test.ts#policy-review",
      result: "passed",
      idempotency_key: "evidence-policy-web",
    }).evidence;
    runtimeCoordinator.reportRun({
      board_id: DEMO_BOARD_ID,
      run_id: run.run_id,
      actor_id: "runtime-policy-web",
      state: "completed",
      idempotency_key: "run-policy-web-completed",
    });
    const handoffPage = await (await webFetch(`${origin}/goals/POLICY-WEB`)).text();
    assert.match(handoffPage, /goal-status--handoff_pending[^>]*[\s\S]*?<span>正在收尾<\/span>/);
    assert.match(handoffPage, /结果已提交，正在进入检查/);
    assert.match(handoffPage, /无需重新提交；当前执行收尾后即可开始检查/);
    assert.doesNotMatch(handoffPage, /这个 Claim 没有未结束的 Run/);
    assert.doesNotMatch(handoffPage, /由领取 Runtime 启动 Run/);
    assert.doesNotMatch(handoffPage, /当前有什么会挡住它[\s\S]*结果已提交，正在进入检查/);
    runtimeCoordinator.releaseClaim({
      board_id: DEMO_BOARD_ID,
      claim_id: claim.claim_id,
      actor_id: "runtime-policy-web",
      reason: "交给 Review 阶段",
      idempotency_key: "claim-policy-web-release",
    });
    const obligation = runtimeStore
      .snapshot(DEMO_BOARD_ID)
      .review_obligations.find(
        (item) => item.goal_id === "POLICY-WEB" && item.role === "human_approver",
      );
    assert.ok(obligation);
    runtimeStore.close();

    const page = await (await webFetch(`${origin}/goals/POLICY-WEB`)).text();
    assert.match(page, /当前最终生效规则/);
    assert.match(page, /项目默认规则/);
    assert.match(page, /当前 Goal 额外规则/);
    assert.doesNotMatch(page, /EFFECTIVE POLICY/);
    assert.match(page, /class="policy-effective"/);
    assert.match(page, /aria-label="工作规则继承关系"/);
    assert.doesNotMatch(page, /PROJECT DEFAULT/);
    assert.match(page, /GOAL OVERRIDE/);
    assert.doesNotMatch(page, /data-live-form="policy-project_default-POLICY-WEB"/);
    assert.match(page, /data-live-form="policy-goal-POLICY-WEB"/);
    assert.doesNotMatch(page, /policy-source policy-source--project/);
    assert.match(page, /policy-source policy-source--goal/);
    assert.match(page, /项目默认规则在项目设置中维护/);
    assert.match(page, /name="goal_mode" value="required" checked/);
    assert.match(page, /name="goal_mode" value="disabled" disabled/);
    assert.match(page, /name="goal_mode" value="preferred" disabled/);
    assert.doesNotMatch(page, /<select name="goal_mode"/);
    assert.match(page, /执行者自我验证/);
    assert.match(page, /用户最终确认/);
    assert.match(page, /name="self_verification" checked disabled/);
    assert.match(page, /低于项目共同规则，不能选择/);
    assert.match(page, /name="cross_reviewers"/);
    assert.match(page, /name="adversarial_reviewers"/);
    assert.match(page, /name="max_lease_seconds"[^>]*max="1800"[^>]*data-policy-max="1800"/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /最终生效：按 Goal 工作/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /const loadGoalDocument = async \(goalId\) =>/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /const paneHeader = documentPane\.querySelector\(":scope > \.desktop-pane-header"\)/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /documentPane\.replaceChildren\(\.\.\.\(paneHeader \? \[paneHeader, nextView\] : \[nextView\]\)\)/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /\/api\/goals\/" \+ encodeURIComponent\(goalId\) \+ "\/document\?view=/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /\/api\/goals\/" \+ encodeURIComponent\(goalId\) \+ "\/records\?view=/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /\/record-events\?view=" \+ documentCollection \+ "&offset=" \+ offset/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /goalDocumentRequest\?\.abort\(\)/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /goalRecordsRequest\?\.abort\(\)/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /\{ cache: "no-store", signal: controller\.signal \}/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /isAbortError\(error\) \|\| goalDocumentRequest !== controller/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /if \(goalRecordsRequest === controller\)/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /history\.replaceState\(\{ \.\.\.initialHistoryState, goalId: selected \}/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /event\.state\?\.goalId \|\| state\.active_goal_id/);
    assert.doesNotMatch(WORKBENCH_CLIENT_SCRIPT, /documentPane\.innerHTML = nextDocument\.innerHTML/);
    assert.match(WORKBENCH_STYLES, /policy-mode-options, \.policy-control--split, \.policy-toggle-list, \.policy-review-counts \{ grid-template-columns: 1fr; \}/);
    assert.match(page, /value="browser"/);
    assert.match(page, /href="\/decisions#decision-goal-POLICY-WEB"/);
    assert.match(page, /处理 \d+ 项决定/);
    assert.doesNotMatch(page, /<form class="human-review-form"/);
    const policyRecords = await (
      await webFetch(`${origin}/api/goals/POLICY-WEB/records?view=current`)
    ).text();
    assert.match(policyRecords, new RegExp(evidence.evidence_id));
    assert.match(page, /data-decisions-link[^>]*aria-label="待决定 [0-9]+"/);
    assert.match(page, /class="project-decisions/);
    assert.match(page, /class="tree-chrome"/);

    const reviewDecisionPage = await (await webFetch(`${origin}/decisions`)).text();
    assert.match(reviewDecisionPage, /等待你的决定/);
    assert.match(reviewDecisionPage, /维护 Runtime 与 Review Policy/);
    assert.match(reviewDecisionPage, /确认工作结果/);
    assert.match(reviewDecisionPage, /<form class="human-review-form"/);
    assert.match(reviewDecisionPage, /<option value="" selected disabled>请选择结论<\/option>/);
    assert.match(reviewDecisionPage, /<option value="pass">通过<\/option>/);
    assert.match(reviewDecisionPage, /<option value="needs_changes">需要修改<\/option>/);
    assert.match(reviewDecisionPage, /<option value="fail">不通过<\/option>/);
    assert.match(reviewDecisionPage, /<option value="inconclusive">证据不足<\/option>/);
    assert.match(reviewDecisionPage, new RegExp(evidence.evidence_id));
    assert.match(reviewDecisionPage, /拿当前完成标准和依据来说/);
    assert.match(reviewDecisionPage, /完成标准「Policy 与 Review 可以保存」已有一条通过依据「tests\/web\.test\.ts#policy-review」/);
    assert.match(reviewDecisionPage, /这份记录支持该标准，但不等于你已经确认通过/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /requireDecisionText\(reviewForm, errorBox, "verdict", "请先选择结论。"\)/);
    assert.match(reviewDecisionPage, /如果选择通过[\s\S]*Goal「维护 Runtime 与 Review Policy」还会等待/);
    assert.match(reviewDecisionPage, /如果需要修改或依据不足[\s\S]*两种情况都不会完成这条 Goal/);
    assert.match(reviewDecisionPage, /human-review-list[\s\S]*<section class="decision-scenario"[\s\S]*<details class="decision-details"/);

    const missingReason = await webFetch(
      `${origin}/api/goals/POLICY-WEB/review-obligations/${obligation.obligation_id}/review`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verdict: "pass", evidence_refs: [evidence.evidence_id] }),
      },
    );
    assert.equal(missingReason.status, 400);
    assert.match(await missingReason.text(), /Review 必须说明判断理由/);

    const reviewed = await webFetch(
      `${origin}/api/goals/POLICY-WEB/review-obligations/${obligation.obligation_id}/review`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          verdict: "needs_changes",
          evidence_refs: [evidence.evidence_id, "https://example.com/human-observation"],
          reasoning: "测试已通过，但人工检查发现说明文案仍需修改",
        }),
      },
    );
    assert.equal(reviewed.status, 200, await reviewed.text());
    const verifiedStore = new SqliteGoalBoardStore(databasePath);
    const savedReview = verifiedStore
      .snapshot(DEMO_BOARD_ID)
      .reviews.find((item) => item.obligation_id === obligation.obligation_id);
    assert.equal(savedReview?.actor_id, "web-user");
    assert.equal(savedReview?.verdict, "needs_changes");
    assert.deepEqual(savedReview?.evidence_refs, [
      evidence.evidence_id,
      "https://example.com/human-observation",
    ]);
    verifiedStore.close();
    const reviewResultPage = await (await webFetch(`${origin}/decisions`)).text();
    assert.match(reviewResultPage, /最近处理结果/);
    assert.match(reviewResultPage, /结果确认/);
    assert.match(reviewResultPage, /需要修改/);
    assert.match(reviewResultPage, /本次结果没有确认通过/);
    assert.match(reviewResultPage, /测试已通过，但人工检查发现说明文案仍需修改/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web result confirmation names the criterion that still lacks passing evidence", async () => {
  const { databasePath } = webFixture();
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.createGoal(
    DEMO_BOARD_ID,
    {
      goal_id: "REVIEW-NO-EVIDENCE",
      title: "让没有依据的结果不会被误判为完成",
      outcome: "用户能看出当前还缺哪条完成依据",
      why: "结果确认不能把 Runtime 的提交冒充用户结论",
      business_logic: "工作结果提交后，用户对照完成标准和依据作出判断；没有通过依据时继续等待补充。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [
        {
          criterion_id: "REVIEW-NO-EVIDENCE-C1",
          statement: "用户能看到保存后的实际结果",
          decision_method: "inspection",
          pass_condition: "页面显示保存回执和结果去向",
        },
      ],
    },
    { actor_id: "test-user", idempotency_key: "create-review-no-evidence" },
  );
  coordinator.setPolicy(
    DEMO_BOARD_ID,
    {
      goal_id: "REVIEW-NO-EVIDENCE",
      policy: {
        goal_mode: "preferred",
        required_capabilities: [],
        self_verification: true,
        cross_reviewers: 0,
        adversarial_reviewers: 0,
        human_approval: true,
        max_lease_seconds: 1800,
      },
      reason: "验证没有通过依据时的结果确认说明",
    },
    { actor_id: "test-user", idempotency_key: "policy-review-no-evidence" },
  );
  const claim = coordinator.claimGoal({
    board_id: DEMO_BOARD_ID,
    goal_id: "REVIEW-NO-EVIDENCE",
    actor_id: "runtime-no-evidence",
    role: "executor",
    goal_mode_attestation: true,
    idempotency_key: "claim-review-no-evidence",
  }).claim;
  assert.ok(claim);
  const run = coordinator.startRun({
    board_id: DEMO_BOARD_ID,
    goal_id: "REVIEW-NO-EVIDENCE",
    claim_id: claim.claim_id,
    actor_id: "runtime-no-evidence",
    contract_cursor: store.eventCursor(DEMO_BOARD_ID),
    idempotency_key: "run-review-no-evidence",
  }).run;
  coordinator.reportRun({
    board_id: DEMO_BOARD_ID,
    run_id: run.run_id,
    actor_id: "runtime-no-evidence",
    state: "completed",
    idempotency_key: "complete-run-review-no-evidence",
  });
  coordinator.releaseClaim({
    board_id: DEMO_BOARD_ID,
    claim_id: claim.claim_id,
    actor_id: "runtime-no-evidence",
    reason: "等待用户检查结果",
    idempotency_key: "release-review-no-evidence",
  });
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: DEMO_BOARD_ID });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const page = await (await webFetch(`http://127.0.0.1:${address.port}/decisions`)).text();
    const group = page.match(
      /<section class="decision-goal-group" id="decision-goal-REVIEW-NO-EVIDENCE"[\s\S]*?(?=<section class="decision-goal-group"|<\/main>)/,
    )?.[0];
    assert.ok(group);
    assert.match(group, /拿当前完成标准和依据来说/);
    assert.match(group, /完成标准「用户能看到保存后的实际结果」还没有对应的通过依据/);
    assert.match(group, /现在不应选择“通过”/);
    assert.match(group, /即使选择“通过”[\s\S]*仍有 1 条完成标准缺少通过依据，不会完成/);
    assert.match(group, /<option value="" selected disabled>请选择结论<\/option>/);
    assert.doesNotMatch(group, /建议确认通过/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web records manual Evidence, safely opens project references, and exposes its full event ledger", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-evidence-"));
  const databasePath = join(directory, "goalboard.db");
  const projectRoot = join(directory, "project");
  const notesDirectory = join(projectRoot, "notes");
  mkdirSync(notesDirectory, { recursive: true });
  writeFileSync(join(notesDirectory, "evidence.txt"), "用户手工检查：页面可以记录并打开人工 Evidence。\n");
  writeFileSync(join(notesDirectory, "binary.bin"), Buffer.from([0, 1, 2]));
  writeFileSync(join(notesDirectory, "large.txt"), "x".repeat(512 * 1024 + 1));
  writeFileSync(join(directory, "outside.txt"), "这个文件不属于项目引用根目录。\n");
  symlinkSync(join(directory, "outside.txt"), join(notesDirectory, "outside-link.txt"));
  seedDemoBoard(databasePath);
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.createGoal(
    DEMO_BOARD_ID,
    {
      goal_id: "EVIDENCE-WEB",
      title: "用户可以提交人工 Evidence",
      outcome: "人工验收事实和 Runtime Evidence 使用同一完成门禁",
      why: "用户需要记录自己验证过的事实，而不是通过伪造 Runtime Run 来绕过模型。",
      business_logic: "Web 只提交 Evidence 事实；GoalBoard 仍依据相同 Criterion、Review 和完成规则判断状态。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [
        {
          criterion_id: "EVIDENCE-WEB-C1",
          statement: "人工 Evidence 可以被记录并回看",
          decision_method: "inspection",
          pass_condition: "用户能在页面提交 Evidence，并从记录打开安全的项目内文本引用",
          required_evidence: ["attestation"],
        },
      ],
    },
    { actor_id: "test-user", idempotency_key: "create-evidence-web" },
  );
  coordinator.addRelation(
    DEMO_BOARD_ID,
    {
      from_goal_id: "EVIDENCE-WEB",
      to_goal_id: "CORE",
      type: "extends",
      reason: "人工 Evidence 使用既有的同一完成门禁",
    },
    { actor_id: "test-user", idempotency_key: "evidence-web-relation" },
  );
  coordinator.addRisk(
    DEMO_BOARD_ID,
    {
      risk_id: "RISK-EVIDENCE-WEB",
      goal_ids: ["EVIDENCE-WEB"],
      description: "项目外文件不能经 Evidence 引用暴露",
      probability: "low",
      impact: "high",
      affected_surfaces: ["Evidence 引用"],
      trigger: "定位引用包含跳出项目目录的路径",
      treatment: "mitigate",
      blocking_mode: "none",
      revisit_condition: "新增引用协议时重新检查路径边界",
      owner: "test-user",
    },
    { actor_id: "test-user", idempotency_key: "evidence-web-risk" },
  );
  coordinator.setPolicy(
    DEMO_BOARD_ID,
    {
      goal_id: "EVIDENCE-WEB",
      policy: { goal_mode: "preferred", self_verification: true },
      reason: "人工 Evidence 不替代现有验证规则",
    },
    { actor_id: "test-user", idempotency_key: "evidence-web-policy" },
  );
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: DEMO_BOARD_ID, projectRoot });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const beforeSubmit = await (await webFetch(`${origin}/goals/EVIDENCE-WEB`)).text();
    assert.match(beforeSubmit, /data-evidence-form/);
    assert.match(beforeSubmit, /保存完成依据/);
    assert.match(beforeSubmit, /data-goal-records-content data-loaded="false"/);
    assert.doesNotMatch(beforeSubmit, /完整事件账本/);
    const recordsBeforeSubmit = await (
      await webFetch(`${origin}/api/goals/EVIDENCE-WEB/records?view=current`)
    ).text();
    assert.match(recordsBeforeSubmit, /完整事件账本/);

    const missingCriterion = await webFetch(`${origin}/api/goals/EVIDENCE-WEB/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "attestation", result: "passed", locator: "notes/evidence.txt" }),
    });
    assert.equal(missingCriterion.status, 400);
    assert.match(await missingCriterion.text(), /至少选择一条验收条件/);

    const submitted = await webFetch(`${origin}/api/goals/EVIDENCE-WEB/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        criterion_ids: ["EVIDENCE-WEB-C1"],
        kind: "attestation",
        result: "passed",
        locator: "notes/evidence.txt",
        digest: "用户在页面中完成检查，并留下可复核的项目内引用。",
      }),
    });
    assert.equal(submitted.status, 201, await submitted.clone().text());
    const submittedResult = (await submitted.json()) as {
      evidence: { evidence_id: string; producer_actor_id: string; run_id: string | null };
    };
    assert.equal(submittedResult.evidence.producer_actor_id, "web-user");
    assert.equal(submittedResult.evidence.run_id, null);

    const externalEvidence = await webFetch(`${origin}/api/goals/EVIDENCE-WEB/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        criterion_ids: ["EVIDENCE-WEB-C1"],
        kind: "inspection",
        result: "passed",
        locator: "https://example.com/manual-evidence",
      }),
    });
    assert.equal(externalEvidence.status, 201, await externalEvidence.text());

    const board = (await (await webFetch(`${origin}/api/board`)).json()) as {
      goals: Array<{
        goal: { goal_id: string };
        evidence: Array<{ evidence_id: string }>;
        passed_criteria: string[];
        events: Array<{ type: string }>;
      }>;
    };
    const evidenceGoal = board.goals.find((item) => item.goal.goal_id === "EVIDENCE-WEB");
    assert.ok(evidenceGoal);
    assert.ok(evidenceGoal.evidence.some((item) => item.evidence_id === submittedResult.evidence.evidence_id));
    assert.deepEqual(evidenceGoal.passed_criteria, ["EVIDENCE-WEB-C1"]);
    for (const type of ["evidence.submitted", "risk.created", "relation.added", "policy.added"]) {
      assert.ok(evidenceGoal.events.some((event) => event.type === type), `missing ${type}`);
    }

    const goalPage = await (await webFetch(`${origin}/goals/EVIDENCE-WEB`)).text();
    assert.doesNotMatch(goalPage, /完整事件账本/);
    const goalRecords = await (
      await webFetch(`${origin}/api/goals/EVIDENCE-WEB/records?view=current`)
    ).text();
    assert.match(goalRecords, new RegExp(submittedResult.evidence.evidence_id));
    assert.match(goalRecords, /href="\/api\/project-references\/notes%2Fevidence\.txt"/);
    assert.match(goalRecords, /data-project-reference/);
    assert.match(goalRecords, /href="https:\/\/example\.com\/manual-evidence"/);
    assert.match(goalRecords, /evidence\.submitted/);
    assert.match(goalRecords, /risk\.created/);
    assert.match(goalRecords, /relation\.added/);
    assert.match(goalRecords, /policy\.added/);

    const opened = await webFetch(`${origin}/api/project-references/${encodeURIComponent("notes/evidence.txt")}`);
    assert.equal(opened.status, 200, await opened.clone().text());
    assert.match(opened.headers.get("content-type") ?? "", /text\/plain/);
    assert.match(await opened.text(), /用户手工检查/);

    const escaped = await webFetch(`${origin}/api/project-references/${encodeURIComponent("project://../outside.txt")}`);
    assert.equal(escaped.status, 400);
    assert.match(await escaped.text(), /不能跳出项目目录/);
    const absolute = await webFetch(`${origin}/api/project-references/${encodeURIComponent("project:///etc/passwd")}`);
    assert.equal(absolute.status, 400);
    assert.match(await absolute.text(), /必须是相对路径/);
    const directoryReference = await webFetch(`${origin}/api/project-references/${encodeURIComponent("notes")}`);
    assert.equal(directoryReference.status, 400);
    assert.match(await directoryReference.text(), /普通文件/);
    const symlinkEscape = await webFetch(`${origin}/api/project-references/${encodeURIComponent("notes/outside-link.txt")}`);
    assert.equal(symlinkEscape.status, 400);
    assert.match(await symlinkEscape.text(), /不能通过链接跳出项目目录/);
    const binary = await webFetch(`${origin}/api/project-references/${encodeURIComponent("notes/binary.bin")}`);
    assert.equal(binary.status, 415);
    assert.match(await binary.text(), /文本引用/);
    const large = await webFetch(`${origin}/api/project-references/${encodeURIComponent("notes/large.txt")}`);
    assert.equal(large.status, 413);
    assert.match(await large.text(), /文件过大/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web normal Tree excludes trashed Goals while the coordinator retains their facts", () => {
  const { databasePath } = webFixture();
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.createGoal(
    DEMO_BOARD_ID,
    {
      goal_id: "TRASHED-WEB",
      title: "不会出现在普通 Tree 的 Goal",
      outcome: "回收站 Goal 不干扰当前工作列表",
      why: "普通导航只应该展示可继续处理的工作",
      business_logic: "移入回收站会保留全部事实，但普通 Web Tree 和 Archive 都不显示它。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [
        {
          criterion_id: "trashed-web-criterion",
          statement: "普通 Tree 不显示回收站 Goal",
          decision_method: "automated_check",
          pass_condition: "Web view goals 与 archived_goals 都没有该 Goal",
        },
      ],
    },
    { actor_id: "test-user", idempotency_key: "create-trashed-web" },
  );
  coordinator.setGoalTrashed(
    DEMO_BOARD_ID,
    { goal_id: "TRASHED-WEB", trashed: true, reason: "验证正常 Web 读取过滤" },
    { actor_id: "test-user", idempotency_key: "trash-web-goal" },
  );
  const view = buildGoalBoardWebView(store, coordinator, {
    databasePath,
    boardId: DEMO_BOARD_ID,
    demo: true,
  });
  assert.equal(view.goals.some((item) => item.goal.goal_id === "TRASHED-WEB"), false);
  assert.equal(view.archived_goals.some((item) => item.goal.goal_id === "TRASHED-WEB"), false);
  assert.equal(view.trashed_goals.some((item) => item.goal.goal_id === "TRASHED-WEB"), true);
  assert.equal(store.snapshot(DEMO_BOARD_ID).goals.find((goal) => goal.goal_id === "TRASHED-WEB")?.trashed_at == null, false);
  assert.deepEqual(coordinator.listTrashedGoals(DEMO_BOARD_ID).map((goal) => goal.goal_id), ["AUTO-CONNECT", "TRASHED-WEB"]);
  store.close();
});

test("Web provides confirmed recoverable trash, blocked-work feedback, and restore", async () => {
  const { databasePath } = webFixture();
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  const createGoal = (goalId: string, title: string) =>
    coordinator.createGoal(
      DEMO_BOARD_ID,
      {
        goal_id: goalId,
        title,
        outcome: "用户可以完成回收站 UI 流程",
        why: "可恢复删除不能干扰日常 Goal Tree",
        business_logic: "用户确认后移入回收站；系统保留历史和安全恢复所需的 Relation 事实。",
        definition_state: "accepted",
        decomposition_state: "closed_leaf",
        acceptance_criteria: [
          {
            criterion_id: `${goalId}-criterion`,
            statement: "回收站流程可验证",
            decision_method: "automated_check",
            pass_condition: "确认、阻止、移入和恢复都走共享服务",
          },
        ],
      },
      { actor_id: "test-user", idempotency_key: `create-${goalId}` },
    );
  createGoal("TRASH-UI-READY", "可移入回收站的 UI Goal");
  createGoal("TRASH-UI-ACTIVE", "有运行中工作的 UI Goal");
  const relationId = coordinator.addRelation(
    DEMO_BOARD_ID,
    {
      from_goal_id: "TRASH-UI-READY",
      to_goal_id: "CORE",
      type: "extends",
      reason: "验证回收站会复用共享 Relation 迁移",
    },
    { actor_id: "test-user", idempotency_key: "trash-ui-relation" },
  ).relation_id;
  const activeDecision = coordinator.selectGoalAndStart({
    board_id: DEMO_BOARD_ID,
    goal_id: "TRASH-UI-ACTIVE",
    actor_id: "runtime-trash-ui",
    goal_mode_attestation: true,
    idempotency_key: "trash-ui-active-work",
  });
  assert.equal(activeDecision.allowed, true);
  assert.ok(activeDecision.claim);
  assert.ok(activeDecision.run);
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: DEMO_BOARD_ID });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const goalPage = await (await webFetch(`${origin}/goals/TRASH-UI-READY`)).text();
    assert.match(goalPage, /data-open-goal-trash/);
    assert.match(goalPage, /移入回收站/);
    assert.match(goalPage, /操作可恢复/);
    assert.match(goalPage, /href="\/trash" aria-label="查看回收站"/);

    const missingConfirmation = await webFetch(`${origin}/api/goals/TRASH-UI-READY/trash`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trashed: true, reason: "没有确认不应修改" }),
    });
    assert.equal(missingConfirmation.status, 400);
    assert.match(await missingConfirmation.text(), /请先在 GoalBoard 中确认此操作/);

    const blocked = await webFetch(`${origin}/api/goals/TRASH-UI-ACTIVE/trash`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trashed: true, user_confirmed: true, reason: "验证活跃工作提示" }),
    });
    assert.equal(blocked.status, 200);
    const blockedResult = (await blocked.json()) as {
      status: string;
      blocking_claim_ids: string[];
      blocking_run_ids: string[];
    };
    assert.equal(blockedResult.status, "blocked");
    assert.deepEqual(blockedResult.blocking_claim_ids, [activeDecision.claim!.claim_id]);
    assert.deepEqual(blockedResult.blocking_run_ids, [activeDecision.run!.run_id]);

    const trashed = await webFetch(`${origin}/api/goals/TRASH-UI-READY/trash`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trashed: true, user_confirmed: true, reason: "暂时从日常列表移出" }),
    });
    assert.equal(trashed.status, 200);
    const trashedResult = (await trashed.json()) as {
      status: string;
      deactivated_relation_ids: string[];
    };
    assert.equal(trashedResult.status, "trashed");
    assert.deepEqual(trashedResult.deactivated_relation_ids, [relationId]);

    const board = (await (await webFetch(`${origin}/api/board`)).json()) as {
      goals: Array<{ goal: { goal_id: string } }>;
      archived_goals: Array<{ goal: { goal_id: string } }>;
      trashed_goals: Array<{ goal: { goal_id: string; trashed_at: string | null } }>;
    };
    assert.equal(board.goals.some((item) => item.goal.goal_id === "TRASH-UI-READY"), false);
    assert.equal(board.archived_goals.some((item) => item.goal.goal_id === "TRASH-UI-READY"), false);
    assert.equal(board.trashed_goals.find((item) => item.goal.goal_id === "TRASH-UI-READY")?.goal.trashed_at == null, false);

    const currentTree = await (await webFetch(`${origin}/`)).text();
    assert.doesNotMatch(currentTree, /data-tree-item data-goal-id="TRASH-UI-READY"/);
    const trashPage = await (await webFetch(`${origin}/trash/goals/TRASH-UI-READY`)).text();
    assert.match(trashPage, /data-board-view="trash"/);
    assert.doesNotMatch(trashPage, /class="tree-heading"/);
    assert.match(trashPage, /data-tree-item data-goal-id="TRASH-UI-READY"/);
    assert.match(trashPage, /data-open-goal-restore/);
    assert.match(trashPage, /Goal 的 Contract、Run、Evidence 与事件历史都已保留/);
    const trashFragment = await (
      await webFetch(`${origin}/api/goals/TRASH-UI-READY/document?view=trash`)
    ).text();
    assert.match(trashFragment, /data-goal-view="TRASH-UI-READY"/);
    assert.match(trashFragment, /data-open-goal-restore/);
    assert.doesNotMatch(trashFragment, /<!doctype html>/);

    const restored = await webFetch(`${origin}/api/goals/TRASH-UI-READY/trash`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trashed: false, user_confirmed: true, reason: "重新纳入日常工作" }),
    });
    assert.equal(restored.status, 200);
    const restoredResult = (await restored.json()) as {
      status: string;
      restored_relation_ids: string[];
    };
    assert.equal(restoredResult.status, "restored");
    assert.deepEqual(restoredResult.restored_relation_ids, [relationId]);
    const restoredGoal = await (await webFetch(`${origin}/goals/TRASH-UI-READY`)).text();
    assert.match(restoredGoal, /data-tree-item data-goal-id="TRASH-UI-READY"/);
    assert.match(restoredGoal, /data-open-goal-trash/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web archives only completed Goals and provides a reversible archive view", async () => {
  const { databasePath } = webFixture();
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  for (const [goalId, title] of [
    ["ARCHIVE-WEB", "可归档的已完成 Goal"],
    ["ARCHIVE-UNMET", "尚未完成的 Goal"],
  ]) {
    coordinator.createGoal(
      DEMO_BOARD_ID,
      {
        goal_id: goalId,
        title,
        outcome: "用户可以验证归档行为",
        why: "保持当前 Tree 简洁且历史可恢复",
        business_logic: "完成 Goal 可以归档，归档只影响日常导航并保留全部事实。",
        definition_state: "accepted",
        decomposition_state: "closed_leaf",
        acceptance_criteria: [
          {
            criterion_id: `${goalId}-criterion`,
            statement: "归档行为可验证",
            decision_method: "automated_check",
            pass_condition: "归档视图和恢复操作可用",
            required_evidence: ["test"],
          },
        ],
      },
      { actor_id: "test-user", idempotency_key: `create-${goalId}` },
    );
  }
  store.db
    .prepare("UPDATE goals SET fulfillment_state = 'satisfied' WHERE goal_id = ?")
    .run("ARCHIVE-WEB");
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: DEMO_BOARD_ID });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const completedPage = await (await webFetch(`${origin}/goals/ARCHIVE-WEB`)).text();
    assert.match(completedPage, /data-goal-archive="true"/);
    assert.match(completedPage, /href="\/archive" aria-label="查看已归档 Goal"/);

    const rejected = await webFetch(`${origin}/api/goals/ARCHIVE-UNMET/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: true, reason: "不应允许" }),
    });
    assert.equal(rejected.status, 400);
    assert.match(await rejected.text(), /只有已完成的 Goal 可以归档/);

    const archived = await webFetch(`${origin}/api/goals/ARCHIVE-WEB/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: true, reason: "整理已完成 Goal" }),
    });
    assert.equal(archived.status, 200, await archived.text());
    const board = (await (await webFetch(`${origin}/api/board`)).json()) as {
      goals: Array<{ goal: { goal_id: string } }>;
      archived_goals: Array<{ goal: { goal_id: string; fulfillment_state: string } }>;
    };
    assert.equal(board.goals.some((item) => item.goal.goal_id === "ARCHIVE-WEB"), false);
    assert.equal(board.archived_goals[0]?.goal.fulfillment_state, "satisfied");
    assert.ok(board.archived_goals.some((item) => item.goal.goal_id === "ARCHIVE-WEB"));

    const currentTree = await (await webFetch(`${origin}/`)).text();
    assert.doesNotMatch(currentTree, /data-tree-item data-goal-id="ARCHIVE-WEB"/);
    const archivePage = await (await webFetch(`${origin}/archive/goals/ARCHIVE-WEB`)).text();
    assert.match(archivePage, /data-board-view="archive"/);
    assert.doesNotMatch(archivePage, /class="tree-heading"/);
    assert.match(archivePage, /data-tree-item data-goal-id="ARCHIVE-WEB"/);
    assert.match(archivePage, /data-goal-archive="false"/);
    assert.match(archivePage, /可归档的已完成 Goal/);
    const archiveFragment = await (
      await webFetch(`${origin}/api/goals/ARCHIVE-WEB/document?view=archive`)
    ).text();
    assert.match(archiveFragment, /data-goal-view="ARCHIVE-WEB"/);
    assert.match(archiveFragment, /data-goal-archive="false"/);
    assert.doesNotMatch(archiveFragment, /<!doctype html>/);

    const restored = await webFetch(`${origin}/api/goals/ARCHIVE-WEB/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: false, reason: "恢复到当前 Tree" }),
    });
    assert.equal(restored.status, 200, await restored.text());
    const restoredTree = await (await webFetch(`${origin}/goals/ARCHIVE-WEB`)).text();
    assert.match(restoredTree, /data-tree-item data-goal-id="ARCHIVE-WEB"/);
    assert.match(restoredTree, /data-goal-archive="true"/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

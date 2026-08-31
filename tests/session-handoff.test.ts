import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GoalBoardProjectCatalog } from "../src/projects/catalog.js";
import { GoalBoardCoordinator } from "../src/v1/coordinator.js";
import { SqliteGoalBoardStore } from "../src/v1/store.js";
import { CodexRuntimeSessionAdapter, RuntimeSessionAdapterRouter } from "../src/sessions/adapters.js";
import { SessionContentService } from "../src/sessions/content.js";
import { SessionDirectoryService } from "../src/sessions/directory.js";
import { SessionHandoffService } from "../src/sessions/handoff.js";
import { GoalBoardSessionRegistry } from "../src/sessions/registry.js";
import { GoalBoardSessionError, type RuntimeSessionTransport } from "../src/sessions/types.js";
import { createGoalBoardWebServer } from "../src/web/server.js";

const WEB_TOKEN = "goalboard-session-handoff-token-0123456789abcdef";

function createContract(databasePath: string, boardId: string, goalId: string) {
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.initializeBoard({
    board_id: boardId,
    title: "Handoff 项目",
    actor_id: "owner",
    idempotency_key: `${boardId}-init`,
  });
  coordinator.createGoal(
    boardId,
    {
      goal_id: goalId,
      title: "交付新的目标 Runtime Session",
      outcome: "目标 Runtime 收到可执行的 Goal Handoff",
      why: "换 Runtime 后仍需保留目标、约束与验收事实",
      business_logic: "用户审阅 package 后创建全新 Session，不复用来源原生身份。",
      in_scope: ["可编辑 package", "新目标 Session"],
      out_of_scope: ["跨 Runtime resume"],
      constraints: ["必须由用户确认"],
      required_inputs: ["当前 Goal Contract"],
      promised_outputs: ["可追溯的目标 Session"],
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [{
        criterion_id: `${goalId}-criterion`,
        statement: "目标 Session 收到 Handoff",
        decision_method: "inspection",
        pass_condition: "新 Session 的第一条消息等于用户确认的 package",
        required_evidence: ["inspection"],
      }],
    },
    { actor_id: "owner", idempotency_key: `${goalId}-create` },
  );
  return { store, contract: coordinator.readGoalContract(boardId, goalId) };
}

test("Handoff package uses the canonical Goal and a minimal Session context, then creates a new Codex Session", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "goalboard-session-handoff-"));
  const home = path.join(directory, ".goalboard");
  const boardId = "project-handoff-native";
  const goalId = "goal-handoff-native";
  const { store, contract } = createContract(path.join(directory, "board.db"), boardId, goalId);
  const registry = await GoalBoardSessionRegistry.open({ homeDirectory: home });
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const transport: RuntimeSessionTransport = {
    async request(method, params) {
      calls.push({ method, params });
      if (method === "thread/read") return { thread: { turns: [] } };
      if (method === "thread/start") return { thread: { id: "thread-native-destination" } };
      if (method === "turn/start") return { turn: { id: "turn-native-destination" } };
      throw new Error(`unexpected ${method}`);
    },
    subscribe() { return () => undefined; },
  };
  try {
    const source = registry.explicitlyLinkSession({
      runtime_id: "codex",
      native_runtime_session_id: "thread-native-source",
      actor_id: "user",
      user_confirmed: true,
      project_id: boardId,
      current_goal_id: goalId,
      workspace_path: directory,
      title: "来源 Session",
    });
    registry.appendEvent({
      session_id: source.session_id,
      source: "goalboard",
      kind: "user_message",
      source_id: "source-user",
      content: "请从当前验收缺口继续。",
    });
    registry.appendEvent({
      session_id: source.session_id,
      source: "goalboard",
      kind: "tool",
      source_id: "source-tool",
      content: "SHOULD-NOT-BE-IN-HANDOFF",
    });
    const router = new RuntimeSessionAdapterRouter(registry);
    router.register(new CodexRuntimeSessionAdapter(transport));
    const content = new SessionContentService(registry, router);
    const service = new SessionHandoffService(
      registry,
      router,
      new SessionDirectoryService(registry, router),
      content,
    );

    const prepared = await service.prepare({
      source_session_id: source.session_id,
      project_id: boardId,
      project_name: "Handoff 项目",
      target_runtime_id: "codex",
      target_workspace_path: directory,
      actor_id: "user",
      goal_contract: contract,
    });
    assert.equal(prepared.reused, false);
    assert.match(prepared.handoff.content ?? "", /目标 Runtime 收到可执行的 Goal Handoff/);
    assert.match(prepared.handoff.content ?? "", /请从当前验收缺口继续/);
    assert.doesNotMatch(prepared.handoff.content ?? "", /SHOULD-NOT-BE-IN-HANDOFF/);
    assert.deepEqual(calls.map((item) => item.method), ["thread/read"]);

    const edited = `${prepared.handoff.content}\n\n用户补充：先运行定向测试。`;
    const sent = await service.send({
      package_id: prepared.handoff.package_id,
      target_runtime_id: "codex",
      target_workspace_path: directory,
      content: edited,
      actor_id: "user",
      user_confirmed: true,
    });
    assert.equal(sent.handoff.state, "sent");
    assert.equal(sent.handoff.delivery_mode, "native");
    assert.ok(sent.destination_session);
    assert.notEqual(sent.destination_session?.session_id, source.session_id);
    assert.equal(sent.destination_session?.native_runtime_session_id, "thread-native-destination");
    assert.equal(sent.destination_session?.current_goal_id, goalId);
    assert.deepEqual(calls.map((item) => item.method), ["thread/read", "thread/start", "turn/start"]);
    assert.equal((calls[2]?.params.input as Array<{ text: string }>)[0]?.text, edited);
    assert.equal(registry.handoffsForSession(source.session_id)[0]?.destination_session_id, sent.destination_session?.session_id);

    const replay = await service.send({
      package_id: prepared.handoff.package_id,
      target_runtime_id: "codex",
      target_workspace_path: directory,
      content: edited,
      actor_id: "user",
      user_confirmed: true,
    });
    assert.equal(replay.destination_session?.session_id, sent.destination_session?.session_id);
    assert.deepEqual(calls.map((item) => item.method), ["thread/read", "thread/start", "turn/start"]);
  } finally {
    registry.close();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("unsupported Runtime receives an honest GoalBoard fallback Session with encrypted package content", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "goalboard-session-handoff-fallback-"));
  const boardId = "project-handoff-fallback";
  const goalId = "goal-handoff-fallback";
  const { store, contract } = createContract(path.join(directory, "board.db"), boardId, goalId);
  const registry = await GoalBoardSessionRegistry.open({ homeDirectory: path.join(directory, ".goalboard") });
  try {
    const source = registry.createSession({
      runtime_id: "runtime-without-read",
      actor_id: "user",
      user_confirmed: true,
      project_id: boardId,
      current_goal_id: goalId,
      title: "Fallback source",
    });
    const router = new RuntimeSessionAdapterRouter(registry);
    const content = new SessionContentService(registry, router);
    const service = new SessionHandoffService(
      registry,
      router,
      new SessionDirectoryService(registry, router),
      content,
    );
    const prepared = await service.prepare({
      source_session_id: source.session_id,
      project_id: boardId,
      project_name: "Fallback Project",
      target_runtime_id: "claude-code",
      actor_id: "user",
      goal_contract: contract,
    });
    const sent = await service.send({
      package_id: prepared.handoff.package_id,
      target_runtime_id: "claude-code",
      content: prepared.handoff.content ?? "",
      actor_id: "user",
      user_confirmed: true,
    });
    assert.equal(sent.handoff.state, "sent");
    assert.equal(sent.handoff.delivery_mode, "goalboard_fallback");
    assert.equal(sent.destination_session?.runtime_id, "claude-code");
    assert.equal(sent.destination_session?.native_runtime_session_id, null);
    const targetContent = await content.read(sent.destination_session!.session_id);
    assert.equal(targetContent.content_mode, "fallback");
    assert.match(targetContent.events.map((event) => event.content).join("\n"), /# Handoff：交付新的目标 Runtime Session/);
  } finally {
    registry.close();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("a source Session without a current Goal cannot prepare a Handoff", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "goalboard-session-handoff-no-goal-"));
  const boardId = "project-handoff-no-goal";
  const goalId = "goal-handoff-no-goal";
  const { store, contract } = createContract(path.join(directory, "board.db"), boardId, goalId);
  const registry = await GoalBoardSessionRegistry.open({ homeDirectory: path.join(directory, ".goalboard") });
  try {
    const source = registry.createSession({
      runtime_id: "unknown",
      actor_id: "user",
      user_confirmed: true,
      project_id: boardId,
    });
    const router = new RuntimeSessionAdapterRouter(registry);
    const service = new SessionHandoffService(
      registry,
      router,
      new SessionDirectoryService(registry, router),
      new SessionContentService(registry, router),
    );
    await assert.rejects(
      () => service.prepare({
        source_session_id: source.session_id,
        project_id: boardId,
        project_name: "No Goal",
        target_runtime_id: "codex",
        actor_id: "user",
        goal_contract: contract,
      }),
      (error: unknown) => error instanceof GoalBoardSessionError && /当前 Goal/.test(error.message),
    );
  } finally {
    registry.close();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("project Handoff web API keeps the editable draft, requires confirmation, and exposes the target Session", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "goalboard-session-handoff-web-"));
  const home = path.join(directory, ".goalboard");
  const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "Handoff Web Project", actor_id: "user" });
  catalog.close();

  const goalId = "goal-handoff-web";
  const store = new SqliteGoalBoardStore(project.database_path);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.createGoal(
    project.board_id,
    {
      goal_id: goalId,
      title: "通过 Web 完成 Handoff",
      outcome: "目标 Session 收到已审阅的交接内容",
      why: "验证页面调用的完整接口链路",
      business_logic: "先生成草稿，编辑并确认后创建目标 Session。",
      in_scope: ["草稿", "确认", "目标 Session"],
      out_of_scope: ["跨 Runtime resume"],
      constraints: ["发送前必须确认"],
      required_inputs: ["当前 Goal"],
      promised_outputs: ["可读取的目标 Session"],
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [{
        criterion_id: "handoff-web-delivery",
        statement: "目标 Session 收到修改后的 package",
        decision_method: "test",
        pass_condition: "目标 Session 内容 API 返回用户保存的文本",
        required_evidence: ["test"],
      }],
    },
    { actor_id: "user", idempotency_key: "goal-handoff-web-create" },
  );
  store.close();

  const registry = await GoalBoardSessionRegistry.open({ homeDirectory: home });
  const source = registry.createSession({
    runtime_id: "codex",
    actor_id: "user",
    user_confirmed: true,
    project_id: project.project_id,
    current_goal_id: goalId,
    workspace_path: directory,
    title: "Web Handoff 来源",
  });
  registry.appendEvent({
    session_id: source.session_id,
    source: "goalboard",
    kind: "user_message",
    source_id: "handoff-web-source-message",
    content: "来源 Session 的最小上下文。",
  });
  registry.close();

  const server = createGoalBoardWebServer({ homeDirectory: home, controlToken: WEB_TOKEN });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const prefix = `/projects/${encodeURIComponent(project.project_id)}`;
    let requestNumber = 0;
    const mutation = (pathname: string, method: string, body: Record<string, unknown>) => fetch(`${origin}${pathname}`, {
      method,
      headers: {
        origin,
        "content-type": "application/json",
        "x-goalboard-control-token": WEB_TOKEN,
        "x-goalboard-idempotency-key": `session-handoff-web-${++requestNumber}`,
      },
      body: JSON.stringify(body),
    });

    const unauthorized = await fetch(
      `${origin}${prefix}/api/sessions/${encodeURIComponent(source.session_id)}/handoffs`,
      { method: "POST" },
    );
    assert.equal(unauthorized.status, 403);

    const preparedResponse = await mutation(
      `${prefix}/api/sessions/${encodeURIComponent(source.session_id)}/handoffs`,
      "POST",
      { target_runtime_id: "claude-code", target_workspace_path: directory },
    );
    assert.equal(preparedResponse.status, 201, await preparedResponse.clone().text());
    const prepared = await preparedResponse.json() as {
      handoff: { package_id: string; state: string; content: string };
      reused: boolean;
    };
    assert.equal(prepared.reused, false);
    assert.equal(prepared.handoff.state, "draft");
    assert.match(prepared.handoff.content, /通过 Web 完成 Handoff/);

    const editedContent = `${prepared.handoff.content}\n\n用户补充：先检查目标 Session 内容。`;
    const savedResponse = await mutation(
      `${prefix}/api/session-handoffs/${encodeURIComponent(prepared.handoff.package_id)}`,
      "PATCH",
      { target_runtime_id: "claude-code", target_workspace_path: directory, content: editedContent },
    );
    assert.equal(savedResponse.status, 200, await savedResponse.clone().text());

    const unconfirmed = await mutation(
      `${prefix}/api/session-handoffs/${encodeURIComponent(prepared.handoff.package_id)}/send`,
      "POST",
      {
        target_runtime_id: "claude-code",
        target_workspace_path: directory,
        content: editedContent,
        user_confirmed: false,
      },
    );
    assert.equal(unconfirmed.status, 400);

    const sentResponse = await mutation(
      `${prefix}/api/session-handoffs/${encodeURIComponent(prepared.handoff.package_id)}/send`,
      "POST",
      {
        target_runtime_id: "claude-code",
        target_workspace_path: directory,
        content: editedContent,
        user_confirmed: true,
      },
    );
    assert.equal(sentResponse.status, 201, await sentResponse.clone().text());
    const sent = await sentResponse.json() as {
      handoff: { state: string; delivery_mode: string; content: string };
      destination_session: { session_id: string; runtime_id: string };
    };
    assert.equal(sent.handoff.state, "sent");
    assert.equal(sent.handoff.delivery_mode, "goalboard_fallback");
    assert.equal(sent.handoff.content, editedContent);
    assert.equal(sent.destination_session.runtime_id, "claude-code");

    const targetContentResponse = await fetch(
      `${origin}${prefix}/api/sessions/${encodeURIComponent(sent.destination_session.session_id)}/content`,
    );
    assert.equal(targetContentResponse.status, 200, await targetContentResponse.clone().text());
    const targetContent = await targetContentResponse.json() as {
      content_mode: string;
      events: Array<{ content: string }>;
    };
    assert.equal(targetContent.content_mode, "fallback");
    assert.match(targetContent.events.map((event) => event.content).join("\n"), /用户补充：先检查目标 Session 内容/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

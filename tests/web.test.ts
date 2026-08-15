import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { GoalBoardCoordinator } from "../src/v1/coordinator.js";
import { DEMO_BOARD_ID, seedDemoBoard } from "../src/v1/demo.js";
import { SqliteGoalBoardStore } from "../src/v1/store.js";
import { renderGoalBoardWeb } from "../src/web/render.js";
import { buildGoalBoardWebView, createGoalBoardWebServer } from "../src/web/server.js";

function webFixture() {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-"));
  const databasePath = join(directory, "demo.db");
  seedDemoBoard(databasePath);
  return { databasePath };
}

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
  assert.equal(view.counts.claimed, 1);
  assert.equal(view.counts.blocked, 1);
  assert.equal(view.counts.waiting, 2);
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
  const html = renderGoalBoardWeb(view);
  const decisionHtml = renderGoalBoardWeb(view, undefined, false, true);
  assert.ok(html.startsWith("<!--\nTHESIS:"));
  assert.match(html, /Runtime 工作闭环/);
  assert.match(html, /为什么做/);
  assert.match(html, /Goal Contract/);
  assert.match(html, /class="contract-list"/);
  assert.doesNotMatch(html, /class="contract-grid"/);
  assert.match(html, /包含什么/);
  assert.match(html, /明确不做/);
  assert.match(html, /必须遵守/);
  assert.match(html, /需要的输入/);
  assert.match(html, /承诺的输出/);
  assert.match(html, /Goal 关系/);
  assert.match(html, /上游/);
  assert.match(html, /下游/);
  assert.match(html, /Claim 历史/);
  assert.match(html, /Run 历史/);
  assert.match(html, /风险与影响/);
  assert.match(html, /Runtime 与 Review Policy/);
  assert.match(html, /项目默认规则/);
  assert.match(html, /当前 Goal 额外规则/);
  assert.match(html, /data-policy-form/);
  assert.match(html, /name="required_capabilities"/);
  assert.match(html, /name="max_lease_seconds"/);
  assert.match(html, /事件历史/);
  assert.match(html, /用户决策/);
  assert.match(html, /这里不会启动或分配 Runtime/);
  assert.match(html, /示例数据/);
  assert.match(html, /data-tree-root/);
  assert.match(html, /class="tree-children"/);
  assert.match(html, /开始前必须等哪些 Goal 完成[\s\S]*跑通 SQLite 执行闭环/);
  assert.match(html, /验证 corrects 关系的完整呈现/);
  assert.match(html, /字段过多导致信息过载/);
  assert.match(html, /fixture-snapshot/);
  assert.match(html, /REQ-WEB-COVERAGE/);
  assert.match(html, /sha256:web-fixture/);
  assert.match(html, /href="https:\/\/example.com\/goalboard-contract"/);
  assert.match(html, /data-copy-value/);
  assert.match(html, /data-select-goal/);
  assert.match(html, /data-tree-search/);
  assert.match(html, /data-open-create/);
  assert.match(html, /data-open-create aria-label="新建目标"/);
  assert.match(html, /data-create-dialog/);
  assert.match(html, /它属于哪个更大的 Goal？/);
  assert.match(html, /只决定 Tree 中放在哪里，不要求上级 Goal 先完成/);
  assert.match(html, /开始前必须等哪些 Goal 完成？/);
  assert.match(html, /这会成为领取和完成的硬门禁/);
  assert.match(html, /关系预览：新 Goal 将作为独立 Goal/);
  assert.match(html, /关系预览：当前没有执行前置/);
  assert.match(html, /<option value="V1" data-goal-name="交付 GoalBoard V1">交付 GoalBoard V1 · V1<\/option>/);
  assert.match(html, /role="tablist" aria-label="移动端视图"/);
  assert.match(html, /role="tab" aria-selected="true" aria-controls="goal-tree-pane"/);
  assert.match(html, /button\.setAttribute\("aria-selected", String\(active\)\)/);
  assert.match(html, /data-sync-state/);
  assert.match(html, /setInterval\(refreshBoard, 4000\)/);
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
  assert.match(html, /treeWidth: treePane\.getBoundingClientRect\(\)\.width/);
  assert.match(html, /treeResizer\.addEventListener\("pointermove"/);
  assert.match(html, /treeResizer\.addEventListener\("keydown"/);
  assert.match(html, /tree-copy"><strong>交付 GoalBoard V1<\/strong><small>V1<\/small>/);
  assert.match(html, /icon-search/);
  assert.match(html, /data-section="execution"/);
  assert.match(html, /href="\/decisions#decision-goal-CORE">前往处理<\/a>/);
  assert.doesNotMatch(html, /<form class="decision-record rewire-decision"/);
  assert.match(decisionHtml, /data-board-view="decisions"/);
  assert.match(decisionHtml, /href="\/goals\/CORE"><strong>跑通 SQLite 执行闭环<\/strong>/);
  assert.match(decisionHtml, /decision-kind decision-kind--risk/);
  assert.match(decisionHtml, /Risk <strong>1<\/strong>/);
  assert.match(decisionHtml, /字段过多导致信息过载/);
  assert.match(decisionHtml, /risk-goal-links/);
  assert.match(decisionHtml, /打开 Risk/);
  assert.match(decisionHtml, /依赖调整提案/);
  assert.match(decisionHtml, /所属 Goal/);
  assert.match(decisionHtml, /为什么是这个方向/);
  assert.match(decisionHtml, /CORE 消费 INTERFACES 的调用结果/);
  assert.match(decisionHtml, /可信度 88%/);
  assert.match(decisionHtml, /href="https:\/\/example.com\/contracts\/interfaces"/);
  assert.match(decisionHtml, /data-copy-value="tests\/mcp.test.ts"/);
  assert.match(decisionHtml, /<form class="decision-record rewire-decision"/);
  assert.match(decisionHtml, /name="reason"[\s\S]*决定理由或修改意见|决定理由或修改意见[\s\S]*name="reason"/);
  assert.match(html, /\.decision-record \{ min-width: 0;/);
  assert.match(html, /\.dependency-proposal-list \{ width: 100%; min-width: 0;/);
  assert.match(html, /\.dependency-evidence \.inline-ref span \{[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/);
  assert.match(html, /\.candidate-contract \{ grid-template-columns: 1fr; \}/);
  assert.match(html, /\.create-dialog \{ width: 100vw; max-width: none; height: 100vh; max-height: none; margin: 0; border-radius: 0; \}/);
  assert.doesNotMatch(html, /track-map|class="signal"|signal-box|railway/i);
  store.close();
});

test("Web lets the user add and deactivate every supported Goal relation with explicit direction", async () => {
  const { databasePath } = webFixture();
  const server = createGoalBoardWebServer({ databasePath, boardId: DEMO_BOARD_ID, demo: true });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const initialPage = await (await fetch(`${origin}/goals/CORE`)).text();
    assert.match(initialPage, /data-relation-editor/);
    assert.match(initialPage, /这是用户确认入口/);
    assert.match(initialPage, /Runtime 发现的变化仍只能提交 Rewire/);
    assert.match(initialPage, /name="direction" value="outgoing" checked/);
    assert.match(initialPage, /name="direction" value="incoming"/);
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

    const missingReason = await fetch(`${origin}/api/goals/CORE/relations`, {
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

    const createResponse = await fetch(`${origin}/api/goals/CORE/relations`, {
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
    const afterCreate = (await (await fetch(`${origin}/api/board`)).json()) as {
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
    const activePage = await (await fetch(`${origin}/goals/CORE`)).text();
    assert.match(activePage, new RegExp(`data-relation-id="${created.relation_id}"`));
    assert.match(activePage, /让 CLI 与 MCP 共用同一真相 → 修正 → 当前 Goal/);
    assert.match(activePage, /接口 Goal 修正当前执行闭环中的协议偏差/);
    assert.match(activePage, /data-relation-deactivate-open/);

    const missingDeactivateReason = await fetch(
      `${origin}/api/relations/${encodeURIComponent(created.relation_id)}/deactivate`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    assert.equal(missingDeactivateReason.status, 400);
    assert.match(await missingDeactivateReason.text(), /必须说明原因/);

    const deactivateResponse = await fetch(
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
    const inactivePage = await (await fetch(`${origin}/goals/CORE`)).text();
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
    const goalPageResponse = await fetch(`${origin}/goals/CORE`);
    assert.equal(goalPageResponse.status, 200);
    const goalPage = await goalPageResponse.text();
    assert.match(goalPage, /<title>跑通 SQLite 执行闭环 · GoalBoard<\/title>/);
    assert.match(goalPage, /data-goal-view="CORE"/);
    const missingGoalResponse = await fetch(`${origin}/goals/DOES-NOT-EXIST`);
    assert.equal(missingGoalResponse.status, 404);

    const createResponse = await fetch(`${origin}/api/goals`, {
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
    const createdPage = await fetch(`${origin}${created.goal_path}`);
    assert.equal(createdPage.status, 200);
    assert.match(await createdPage.text(), /从 Web 手动录入 Goal/);

    const boardResponse = await fetch(`${origin}/api/board`);
    assert.equal(boardResponse.status, 200);
    const board = (await boardResponse.json()) as {
      snapshot: {
        candidates: Array<{ candidate_id: string; state: string }>;
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

    const decisionCenter = await (await fetch(`${origin}/decisions`)).text();
    assert.match(decisionCenter, /<title>等待你的决定 · GoalBoard<\/title>/);
    assert.match(decisionCenter, /data-decision-center/);
    assert.match(decisionCenter, /所属 Goal/);
    assert.match(decisionCenter, /<form class="decision-record candidate-decision"/);
    assert.match(decisionCenter, /为什么做/);
    assert.match(decisionCenter, /业务逻辑/);
    assert.match(decisionCenter, /为什么不能留在当前 Goal/);
    assert.match(decisionCenter, /包含范围/);
    assert.match(decisionCenter, /明确不做/);
    assert.match(decisionCenter, /验收条件/);
    assert.match(decisionCenter, /影响面/);
    assert.match(decisionCenter, /风险/);
    assert.match(decisionCenter, /Review Policy/);
    assert.match(decisionCenter, /决定理由或修改意见/);
    const unrelatedGoalPage = await (await fetch(`${origin}/goals/WEB`)).text();
    assert.doesNotMatch(unrelatedGoalPage, /<form class="decision-record candidate-decision"/);

    const unsafeReferenceResponse = await fetch(`${origin}/api/reference?value=/etc/passwd`);
    assert.equal(unsafeReferenceResponse.status, 404);

    const missingCandidateReason = await fetch(
      `${origin}/api/candidates/${encodeURIComponent(candidate.candidate_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "approved" }),
      },
    );
    assert.equal(missingCandidateReason.status, 400);
    assert.match(await missingCandidateReason.text(), /请填写决定理由或修改意见/);

    const decisionResponse = await fetch(
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

    const afterCandidateResponse = await fetch(`${origin}/api/board`);
    const afterCandidate = (await afterCandidateResponse.json()) as {
      snapshot: {
        rewires: Array<{ rewire_id: string; state: string }>;
        relations: Array<{ from_goal_id: string; to_goal_id: string; type: string }>;
      };
    };
    const rewire = afterCandidate.snapshot.rewires.find((item) => item.state === "pending");
    assert.ok(rewire);
    const pendingDecisionPage = await (await fetch(`${origin}/decisions`)).text();
    assert.match(pendingDecisionPage, /拒绝关系调整/);
    assert.match(pendingDecisionPage, /<form class="decision-record rewire-decision"/);
    assert.match(pendingDecisionPage, /name="decision" value="confirmed"/);
    assert.match(pendingDecisionPage, /name="decision" value="rejected"/);
    assert.match(pendingDecisionPage, /正在执行的 Run 会保持原目标/);
    const rewireForm = pendingDecisionPage.match(
      /<form class="decision-record rewire-decision"[\s\S]*?<\/form>/,
    )?.[0];
    assert.ok(rewireForm);
    assert.doesNotMatch(rewireForm, /active_runs_protected/);
    const corePageWithDecision = await (await fetch(`${origin}/goals/CORE`)).text();
    assert.match(corePageWithDecision, /前往处理/);
    assert.doesNotMatch(corePageWithDecision, /<form class="decision-record rewire-decision"/);
    const relationCountBefore = afterCandidate.snapshot.relations.length;
    const missingRewireReason = await fetch(
      `${origin}/api/rewires/${encodeURIComponent(rewire.rewire_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "rejected" }),
      },
    );
    assert.equal(missingRewireReason.status, 400);
    assert.match(await missingRewireReason.text(), /请填写决定理由或修改意见/);
    const rewireResponse = await fetch(
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
    const afterRewire = (await (await fetch(`${origin}/api/board`)).json()) as {
      snapshot: { relations: unknown[] };
    };
    assert.equal(afterRewire.snapshot.relations.length, relationCountBefore);
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
      required_inputs: [],
      promised_outputs: [],
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
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: "contract-board" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const page = await (await fetch(`${origin}/goals/FIRST-DRAFT`)).text();
    assert.match(page, /这还是一条待澄清的 Draft/);
    assert.match(page, /2 项等待你的决定/);
    assert.match(page, /href="\/decisions#decision-goal-FIRST-DRAFT">前往处理<\/a>/);
    assert.doesNotMatch(page, /<form class="decision-record contract-proposal"/);
    const decisionPage = await (await fetch(`${origin}/decisions`)).text();
    assert.match(decisionPage, /Contract 补全提案/);
    assert.match(decisionPage, /确认后会更新同一个 Goal，不会创建新 Goal/);
    assert.match(decisionPage, /用户回答 · 可信度 95% · 待你确认/);
    assert.match(decisionPage, /文档事实 · 可信度 82% · 待你确认/);
    assert.match(decisionPage, /<form class="decision-record contract-proposal"/);
    assert.match(decisionPage, /请先处理上方依赖调整；完成后才可确认 Contract/);
    assert.match(decisionPage, /决定理由或修改意见/);
    assert.match(
      decisionPage,
      /name="decision" value="approved"[^>]*disabled[^>]*>先处理依赖调整<\/button>/,
    );
    assert.ok(
      decisionPage.indexOf(`data-rewire-id="${dependencyRewire.rewire_id}"`) <
        decisionPage.indexOf(`data-contract-proposal-id="${proposal.proposal_id}"`),
    );

    const rewireDecision = await fetch(
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
    const resolvedPage = await (await fetch(`${origin}/decisions`)).text();
    assert.match(resolvedPage, /依赖决定已经完成，可以确认 Contract/);
    assert.match(resolvedPage, /确认并设为可执行/);
    assert.doesNotMatch(
      resolvedPage,
      /name="decision" value="approved"[^>]*disabled/,
    );

    const missingContractReason = await fetch(
      `${origin}/api/contract-proposals/${encodeURIComponent(proposal.proposal_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "approved" }),
      },
    );
    assert.equal(missingContractReason.status, 400);
    assert.match(await missingContractReason.text(), /请填写决定理由或修改意见/);

    const decision = await fetch(
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
    const board = (await (await fetch(`${origin}/api/board`)).json()) as {
      snapshot: { goals: Array<{ goal_id: string; definition_state: string; outcome: string }> };
    };
    const accepted = board.snapshot.goals.find((goal) => goal.goal_id === "FIRST-DRAFT");
    assert.equal(accepted?.definition_state, "accepted");
    assert.equal(accepted?.outcome, "新用户可以确认 Contract 并看到同一个 Goal 进入可执行状态");
    const acceptedPage = await (await fetch(`${origin}/goals/FIRST-DRAFT`)).text();
    assert.doesNotMatch(acceptedPage, /<form class="decision-record contract-proposal"/);
    assert.match(acceptedPage, /让新用户看懂第一次 Goal 领取/);

    const minimalCreate = await fetch(`${origin}/api/goals`, {
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
    const draftPage = await (await fetch(`${origin}/goals/EDIT-ME`)).text();
    assert.match(draftPage, /data-draft-editor data-goal-id="EDIT-ME"/);
    assert.match(draftPage, /补全 Draft Contract/);
    assert.match(draftPage, /href="#acceptance-EDIT-ME">查看验收<\/a>/);
    assert.match(draftPage, /value="abstract"/);
    assert.match(draftPage, /value="frontier_open"/);
    assert.match(draftPage, /value="closed_leaf"/);
    assert.match(draftPage, /value="closed_compound"/);
    assert.match(draftPage, /data-criterion-field="decision_method"/);
    assert.match(draftPage, /data-draft-risk-form/);
    assert.match(draftPage, /data-draft-impact-form/);
    assert.match(draftPage, /data-policy-form/);
    assert.ok(draftPage.indexOf("验收清单") < draftPage.indexOf("补全 Draft Contract"));

    const updateResponse = await fetch(`${origin}/api/goals/EDIT-ME/draft`, {
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

    const riskResponse = await fetch(`${origin}/api/goals/EDIT-ME/risks`, {
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

    const impactResponse = await fetch(`${origin}/api/goals/EDIT-ME/impacts`, {
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

    const board = (await (await fetch(`${origin}/api/board`)).json()) as {
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

    const updatedPage = await (await fetch(`${origin}/goals/EDIT-ME`)).text();
    assert.match(updatedPage, /目标：100%/);
    assert.match(updatedPage, /证据：test、inspection/);
    assert.match(updatedPage, /子 Goal 边界仍可能重叠/);
    assert.match(updatedPage, /contract:\/\/EDIT-ME/);

    const lockedPage = await (await fetch(`${origin}/goals/LOCKED`)).text();
    assert.doesNotMatch(lockedPage, /data-draft-editor data-goal-id="LOCKED"/);
    const lockedUpdate = await fetch(`${origin}/api/goals/LOCKED/draft`, {
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
    const projectPolicy = await fetch(`${origin}/api/policy-bindings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scope: "project_default",
        reason: "设置项目默认规则",
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
    });
    assert.equal(projectPolicy.status, 200, await projectPolicy.text());
    const goalPolicy = await fetch(`${origin}/api/policy-bindings`, {
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
    const obligation = runtimeStore
      .snapshot(DEMO_BOARD_ID)
      .review_obligations.find(
        (item) => item.goal_id === "POLICY-WEB" && item.role === "human_approver",
      );
    assert.ok(obligation);
    runtimeStore.close();

    const page = await (await fetch(`${origin}/goals/POLICY-WEB`)).text();
    assert.match(page, /当前最终生效规则/);
    assert.match(page, /项目默认规则/);
    assert.match(page, /当前 Goal 额外规则/);
    assert.match(page, /EFFECTIVE POLICY/);
    assert.match(page, /aria-label="Policy 继承关系"/);
    assert.match(page, /PROJECT DEFAULT/);
    assert.match(page, /GOAL OVERRIDE/);
    assert.match(page, /data-live-form="policy-project_default-POLICY-WEB"/);
    assert.match(page, /data-live-form="policy-goal-POLICY-WEB"/);
    assert.match(page, /policy-source policy-source--project/);
    assert.match(page, /policy-source policy-source--goal/);
    assert.match(page, /name="goal_mode" value="required" checked/);
    assert.doesNotMatch(page, /<select name="goal_mode"/);
    assert.match(page, /执行者自我验证/);
    assert.match(page, /用户最终确认/);
    assert.match(page, /name="cross_reviewers"/);
    assert.match(page, /name="adversarial_reviewers"/);
    assert.match(page, /name="max_lease_seconds"/);
    assert.match(page, /const syncGoalViews = \(nextDocument\) =>/);
    assert.match(page, /currentView\.replaceWith\(nextView\)/);
    assert.doesNotMatch(page, /documentPane\.innerHTML = nextDocument\.innerHTML/);
    assert.match(page, /policy-mode-options, \.policy-control--split, \.policy-toggle-list, \.policy-review-counts \{ grid-template-columns: 1fr; \}/);
    assert.match(page, /value="browser"/);
    assert.match(page, /href="\/decisions#decision-goal-POLICY-WEB">前往处理<\/a>/);
    assert.doesNotMatch(page, /<form class="human-review-form"/);
    assert.match(page, new RegExp(evidence.evidence_id));
    assert.match(page, /data-decisions-link[^>]*aria-label="待决定 [0-9]+"/);
    assert.match(page, /\.top-action\[data-view-action\]:not\(\[data-decisions-link\]\) \{ display: none; \}/);

    const reviewDecisionPage = await (await fetch(`${origin}/decisions`)).text();
    assert.match(reviewDecisionPage, /等待你的决定/);
    assert.match(reviewDecisionPage, /维护 Runtime 与 Review Policy/);
    assert.match(reviewDecisionPage, /等待你的最终确认/);
    assert.match(reviewDecisionPage, /<form class="human-review-form"/);
    assert.match(reviewDecisionPage, /<option value="pass">通过<\/option>/);
    assert.match(reviewDecisionPage, /<option value="needs_changes">需要修改<\/option>/);
    assert.match(reviewDecisionPage, /<option value="fail">不通过<\/option>/);
    assert.match(reviewDecisionPage, /<option value="inconclusive">证据不足<\/option>/);
    assert.match(reviewDecisionPage, new RegExp(evidence.evidence_id));

    const missingReason = await fetch(
      `${origin}/api/goals/POLICY-WEB/review-obligations/${obligation.obligation_id}/review`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verdict: "pass", evidence_refs: [evidence.evidence_id] }),
      },
    );
    assert.equal(missingReason.status, 400);
    assert.match(await missingReason.text(), /Review 必须说明判断理由/);

    const reviewed = await fetch(
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
    const completedPage = await (await fetch(`${origin}/goals/ARCHIVE-WEB`)).text();
    assert.match(completedPage, /data-goal-archive="true"/);
    assert.match(completedPage, /href="\/archive" aria-label="查看已归档 Goal"/);

    const rejected = await fetch(`${origin}/api/goals/ARCHIVE-UNMET/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: true, reason: "不应允许" }),
    });
    assert.equal(rejected.status, 400);
    assert.match(await rejected.text(), /只有已完成的 Goal 可以归档/);

    const archived = await fetch(`${origin}/api/goals/ARCHIVE-WEB/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: true, reason: "整理已完成 Goal" }),
    });
    assert.equal(archived.status, 200, await archived.text());
    const board = (await (await fetch(`${origin}/api/board`)).json()) as {
      goals: Array<{ goal: { goal_id: string } }>;
      archived_goals: Array<{ goal: { goal_id: string; fulfillment_state: string } }>;
    };
    assert.equal(board.goals.some((item) => item.goal.goal_id === "ARCHIVE-WEB"), false);
    assert.equal(board.archived_goals[0]?.goal.fulfillment_state, "satisfied");
    assert.ok(board.archived_goals.some((item) => item.goal.goal_id === "ARCHIVE-WEB"));

    const currentTree = await (await fetch(`${origin}/`)).text();
    assert.doesNotMatch(currentTree, /data-tree-item data-goal-id="ARCHIVE-WEB"/);
    const archivePage = await (await fetch(`${origin}/archive/goals/ARCHIVE-WEB`)).text();
    assert.match(archivePage, /<h2>已归档<\/h2>/);
    assert.match(archivePage, /data-tree-item data-goal-id="ARCHIVE-WEB"/);
    assert.match(archivePage, /data-goal-archive="false"/);
    assert.match(archivePage, /可归档的已完成 Goal/);

    const restored = await fetch(`${origin}/api/goals/ARCHIVE-WEB/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: false, reason: "恢复到当前 Tree" }),
    });
    assert.equal(restored.status, 200, await restored.text());
    const restoredTree = await (await fetch(`${origin}/goals/ARCHIVE-WEB`)).text();
    assert.match(restoredTree, /data-tree-item data-goal-id="ARCHIVE-WEB"/);
    assert.match(restoredTree, /data-goal-archive="true"/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

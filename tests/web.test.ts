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
  assert.match(html, /风险、影响与规则/);
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
  assert.match(html, /form\?\.addEventListener\("change", updateRelationPreviews\)/);
  assert.match(html, /sessionStorage\.setItem/);
  assert.match(html, /data-tree-scroll/);
  assert.match(html, /data-tree-resizer/);
  assert.match(html, /role="separator" aria-label="调整 Goal Tree 宽度"/);
  assert.match(html, /treeWidth: treePane\.getBoundingClientRect\(\)\.width/);
  assert.match(html, /treeResizer\.addEventListener\("pointermove"/);
  assert.match(html, /treeResizer\.addEventListener\("keydown"/);
  assert.match(html, /tree-copy"><strong>交付 GoalBoard V1<\/strong><small>V1<\/small>/);
  assert.match(html, /icon-search/);
  assert.match(html, /data-section="execution"/);
  assert.match(html, /依赖调整提案/);
  assert.match(html, /为什么是这个方向/);
  assert.match(html, /CORE 消费 INTERFACES 的调用结果/);
  assert.match(html, /可信度 88%/);
  assert.match(html, /href="https:\/\/example.com\/contracts\/interfaces"/);
  assert.match(html, /data-copy-value="tests\/mcp.test.ts"/);
  assert.match(html, /\.decision-list > article \{/);
  assert.doesNotMatch(html, /\.decision-list article \{/);
  assert.match(html, /\.dependency-proposal-list \{ width: 100%; min-width: 0;/);
  assert.match(html, /\.dependency-evidence \.inline-ref span \{[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/);
  assert.match(html, /\.decision-list > article \{ align-items: stretch; flex-direction: column; \}/);
  assert.match(html, /\.create-dialog \{ width: 100vw; max-width: none; height: 100vh; max-height: none; margin: 0; border-radius: 0; \}/);
  assert.doesNotMatch(html, /track-map|class="signal"|signal-box|railway/i);
  store.close();
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

    const unsafeReferenceResponse = await fetch(`${origin}/api/reference?value=/etc/passwd`);
    assert.equal(unsafeReferenceResponse.status, 404);

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
    const result = (await decisionResponse.json()) as { candidate: { state: string } };
    assert.equal(result.candidate.state, "approved");

    const afterCandidateResponse = await fetch(`${origin}/api/board`);
    const afterCandidate = (await afterCandidateResponse.json()) as {
      snapshot: {
        rewires: Array<{ rewire_id: string; state: string }>;
        relations: Array<{ from_goal_id: string; to_goal_id: string; type: string }>;
      };
    };
    const rewire = afterCandidate.snapshot.rewires.find((item) => item.state === "pending");
    assert.ok(rewire);
    const pendingDecisionPage = await (await fetch(`${origin}/goals/CORE`)).text();
    assert.match(pendingDecisionPage, /拒绝关系调整/);
    assert.match(pendingDecisionPage, /data-rewire-decision="confirmed"/);
    assert.match(pendingDecisionPage, /data-rewire-decision="rejected"/);
    const decisionSection = pendingDecisionPage.match(
      /<section class="document-section decision-section"[\s\S]*?<\/section>/,
    )?.[0];
    assert.ok(decisionSection);
    assert.match(decisionSection, /正在执行的 Run 会保持原目标/);
    assert.doesNotMatch(decisionSection, /active_runs_protected/);
    const relationCountBefore = afterCandidate.snapshot.relations.length;
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
    assert.match(page, /Contract 补全提案/);
    assert.match(page, /确认后会更新同一个 Goal，不会创建新 Goal/);
    assert.match(page, /用户回答 · 可信度 95% · 待你确认/);
    assert.match(page, /文档事实 · 可信度 82% · 待你确认/);
    assert.match(page, /data-contract-decision="approved"/);
    assert.match(page, /请先处理上方依赖调整；完成后才可确认 Contract/);
    assert.match(
      page,
      /data-contract-decision="approved"[^>]*disabled[^>]*>先处理依赖调整<\/button>/,
    );
    assert.ok(
      page.indexOf(`data-rewire-id="${dependencyRewire.rewire_id}"`) <
        page.indexOf(`data-contract-proposal-id="${proposal.proposal_id}"`),
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
    const resolvedPage = await (await fetch(`${origin}/goals/FIRST-DRAFT`)).text();
    assert.match(resolvedPage, /依赖决定已经完成，可以确认 Contract/);
    assert.match(resolvedPage, /确认并设为可执行/);
    assert.doesNotMatch(
      resolvedPage,
      /data-contract-decision="approved"[^>]*disabled/,
    );

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
    assert.doesNotMatch(acceptedPage, /data-contract-decision="approved"/);
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

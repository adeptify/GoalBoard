import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { GoalBoardServer, runtimeContextHostFromEnvironment } from "../src/mcp/server.js";
import { GoalBoardProjectCatalog } from "../src/projects/catalog.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("mcp server", () => {
  it("defaults to a Runtime-only tool surface", async () => {
    const server = new GoalBoardServer();
    const init = await server.handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {} },
    });
    const initialized = init as {
      result: {
        serverInfo: { name: string };
        capabilities: { resources: { subscribe: boolean; listChanged: boolean } };
      };
    };
    assert.equal(initialized.result.serverInfo.name, "goalboard-mcp");
    assert.deepEqual(initialized.result.capabilities.resources, { subscribe: false, listChanged: false });
    const tools = await server.handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    });
    const listedTools = (
      tools as {
        result: {
          tools: Array<{
            name: string;
            description: string;
            inputSchema: {
              properties?: Record<string, { properties?: Record<string, unknown>; required?: string[] }>;
              required?: string[];
            };
          }>;
        };
      }
    ).result.tools;
    const names = listedTools.map((t) => t.name);
    assert.ok(names.includes("goalboard_v1_contract"));
    assert.ok(names.includes("goalboard_v1_context_resolve"));
    assert.ok(names.includes("goalboard_v1_context_list_projects"));
    assert.ok(names.includes("goalboard_v1_context_reject_suggestion"));
    assert.ok(names.includes("goalboard_v1_context_bind"));
    assert.ok(names.includes("goalboard_v1_context_unbind"));
    assert.ok(names.includes("goalboard_v1_context_create_and_bind"));
    assert.ok(names.includes("goalboard_v1_project_delete"));
    assert.ok(!names.includes("goalboard_v1_postinstall_project_selection"));
    assert.ok(names.includes("goalboard_v1_available"));
    assert.ok(names.includes("goalboard_v1_select_goal"));
    assert.ok(names.includes("goalboard_v1_draft_dialogue_start"));
    assert.ok(names.includes("goalboard_v1_draft_dialogue_turn"));
    assert.ok(names.includes("goalboard_v1_draft_dialogue_resume"));
    assert.ok(names.includes("goalboard_v1_goal_tree_propose"));
    const goalTreeProposeTool = listedTools.find((tool) => tool.name === "goalboard_v1_goal_tree_propose");
    assert.match(goalTreeProposeTool?.description ?? "", /晋升已有 pending Candidate/);
    assert.match(goalTreeProposeTool?.description ?? "", /kind=candidate、operation=update/);
    assert.ok(names.includes("goalboard_v1_goal_tree_read"));
    assert.ok(names.includes("goalboard_v1_goal_tree_check"));
    assert.ok(names.includes("goalboard_v1_planning_methods"));
    const planningMethodsTool = listedTools.find((tool) => tool.name === "goalboard_v1_planning_methods");
    assert.match(planningMethodsTool?.description ?? "", /methods\[\].*instructions/);
    assert.match(planningMethodsTool?.description ?? "", /提供者产出与消费者用途/);
    assert.ok(names.includes("goalboard_v1_planning_method_save"));
    const planningMethodSaveTool = listedTools.find((tool) => tool.name === "goalboard_v1_planning_method_save");
    const planningMethodKind = planningMethodSaveTool?.inputSchema.properties?.method.properties?.kind as { enum?: string[] } | undefined;
    assert.deepEqual(planningMethodKind?.enum, ["meta", "work_type", "domain", "industry", "overlay", "custom"]);
    assert.ok(names.includes("goalboard_v1_planning_analyze_change"));
    assert.ok(names.includes("goalboard_v1_planning_graph_check"));
    assert.ok(names.includes("goalboard_v1_goal_tree_decide"));
    assert.ok(names.includes("goalboard_v1_contract_propose"));
    assert.ok(names.includes("goalboard_v1_candidate_submit"));
    assert.ok(names.includes("goalboard_v1_dependency_propose"));
    assert.ok(names.includes("goalboard_v1_evidence_submit"));
    assert.ok(names.includes("goalboard_v1_review_submit"));
    assert.ok(names.includes("goalboard_v1_revalidate"));
    assert.ok(names.includes("goalboard_v1_goal_trash"));
    assert.ok(names.includes("goalboard_v1_goal_trash_list"));
    assert.ok(names.includes("goalboard_v1_goal_restore"));
    assert.ok(!names.includes("goalboard_v1_create_goal"));
    assert.ok(!names.includes("goalboard_v1_candidate_decide"));
    assert.ok(!names.includes("goalboard_v1_contract_decide"));
    assert.ok(!names.includes("goalboard_v1_rewire_confirm"));
    assert.ok(!names.includes("goalboard_v1_relation_add"));
    assert.ok(!names.includes("goalboard_v1_revoke_claim"));
    assert.ok(!names.some((name) => !name.startsWith("goalboard_v1_")));
    assert.ok(
      listedTools.every((tool) => !("database_path" in (tool.inputSchema.properties ?? {}))),
    );
    const contractTool = listedTools.find((tool) => tool.name === "goalboard_v1_contract");
    assert.ok(!("web_base_url" in (contractTool?.inputSchema.properties ?? {})));
    const candidateTool = listedTools.find((tool) => tool.name === "goalboard_v1_candidate_submit");
    assert.ok(candidateTool?.inputSchema.properties?.payload.properties?.proposed_goal);
    assert.ok(candidateTool?.inputSchema.properties?.payload.required?.includes("idempotency_key"));
    const proposalTool = listedTools.find(
      (tool) => tool.name === "goalboard_v1_contract_propose",
    );
    assert.ok(proposalTool?.inputSchema.properties?.payload.properties?.field_sources);
    assert.ok(
      proposalTool?.inputSchema.properties?.payload.required?.includes("review_policy"),
    );
    const dependencyTool = listedTools.find(
      (tool) => tool.name === "goalboard_v1_dependency_propose",
    );
    const dependencyItems = dependencyTool?.inputSchema.properties?.payload.properties
      ?.dependencies as {
      items?: { required?: string[] };
    };
    assert.deepEqual(dependencyItems.items?.required, [
      "from_goal_id",
      "to_goal_id",
      "type",
      "action",
      "reason",
      "basis",
      "evidence_refs",
      "impact_if_rejected",
      "confidence",
      "direction_reason",
    ]);
    const reviewTool = listedTools.find((tool) => tool.name === "goalboard_v1_review_submit");
    assert.deepEqual(
      (reviewTool?.inputSchema.properties?.payload.properties?.actor_kind as { enum: string[] }).enum,
      ["runtime"],
    );
    const revalidateTool = listedTools.find((tool) => tool.name === "goalboard_v1_revalidate");
    assert.ok(revalidateTool?.inputSchema.properties?.payload.properties?.evidence_refs);
    assert.ok(revalidateTool?.inputSchema.properties?.payload.required?.includes("reason"));
    assert.ok(revalidateTool?.inputSchema.properties?.payload.required?.includes("evidence_refs"));
    const trashTool = listedTools.find((tool) => tool.name === "goalboard_v1_goal_trash");
    assert.ok(trashTool?.inputSchema.properties?.payload.properties?.user_confirmed);
    assert.ok(trashTool?.inputSchema.properties?.payload.required?.includes("user_confirmed"));
    assert.ok(trashTool?.inputSchema.properties?.payload.required?.includes("reason"));
    const trashListTool = listedTools.find((tool) => tool.name === "goalboard_v1_goal_trash_list");
    assert.deepEqual(trashListTool?.inputSchema.properties?.payload.required, []);
    const treeDecisionTool = listedTools.find((tool) => tool.name === "goalboard_v1_goal_tree_decide");
    assert.ok(treeDecisionTool?.inputSchema.properties?.runtime_actor_id);
    assert.ok(treeDecisionTool?.inputSchema.properties?.user_confirmed);
    assert.ok(treeDecisionTool?.inputSchema.properties?.confirmation_summary);
    assert.ok(!("authority" in (treeDecisionTool?.inputSchema.properties ?? {})));
    assert.ok(treeDecisionTool?.inputSchema.required?.includes("runtime_actor_id"));
    assert.ok(treeDecisionTool?.inputSchema.required?.includes("user_confirmed"));
    assert.ok(treeDecisionTool?.inputSchema.required?.includes("confirmation_summary"));

    const management = new GoalBoardServer("management");
    const managementTools = await management.handleMessage({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });
    const managementNames = (
      managementTools as { result: { tools: Array<{ name: string }> } }
    ).result.tools.map((tool) => tool.name);
    assert.ok(managementNames.includes("goalboard_v1_create_goal"));
    assert.ok(managementNames.includes("goalboard_v1_contract_decide"));
    assert.ok(managementNames.includes("goalboard_v1_candidate_decide"));
    assert.ok(managementNames.includes("goalboard_v1_rewire_confirm"));
    assert.ok(managementNames.includes("goalboard_v1_goal_tree_decide"));
    assert.ok(managementNames.includes("goalboard_v1_revoke_claim"));
    assert.ok(managementNames.includes("goalboard_v1_import_v3"));
    assert.ok(managementNames.every((name) => name.startsWith("goalboard_v1_")));
  });

  it("returns structured reader-too-old diagnostics without exposing the catalog path", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "goalboard-mcp-reader-too-old-"));
    const home = path.join(directory, "home", ".goalboard");
    try {
      const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: home });
      await catalog.createProject({ display_name: "保留项目", actor_id: "user" });
      catalog.close();
      const databasePath = path.join(home, "projects", "catalog.db");
      const future = new Database(databasePath);
      try {
        future.prepare("UPDATE catalog_meta SET value = '10' WHERE key = 'schema_version'").run();
      } finally {
        future.close();
      }

      const runtime = new GoalBoardServer("runtime", null, {
        homeDirectory: home,
        runtimeContext: {
          runtime_id: "codex",
          stable_work_context_id: "reader-too-old-session",
          host_declares_stable: true,
        },
        webBaseUrl: "http://127.0.0.1:4173",
      });
      const response = await runtime.handleMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "goalboard_v1_context_resolve", arguments: {} },
      }) as { result: { isError: boolean; content: Array<{ text: string }> } };
      const errorText = response.result.content[0]?.text ?? "";
      assert.equal(response.result.isError, true);
      assert.match(errorText, /错误: GoalBoard catalog schema=10/);
      assert.match(errorText, /"code":"catalog\.reader_too_old"/);
      assert.match(errorText, /"actual_schema_version":10/);
      assert.match(errorText, /"supported_schema_max":9/);
      assert.match(errorText, /"recovery":"new_or_fork_session_then_context_resolve"/);
      assert.doesNotMatch(errorText, new RegExp(databasePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("does not restore the removed static Runtime DB connection from environment", () => {
    const keys = [
      "GOALBOARD_DATABASE",
      "GOALBOARD_BOARD_ID",
      "GOALBOARD_WEB_URL",
      "GOALBOARD_RUNTIME_ID",
    ] as const;
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    try {
      process.env.GOALBOARD_DATABASE = "/tmp/legacy-goalboard.db";
      process.env.GOALBOARD_BOARD_ID = "legacy-board";
      process.env.GOALBOARD_WEB_URL = "http://127.0.0.1:4173";
      delete process.env.GOALBOARD_RUNTIME_ID;
      const runtime = new GoalBoardServer("runtime");
      assert.equal(runtime.runtimeConnection, null);
      assert.equal(runtime.runtimeContextHost, null);
    } finally {
      for (const key of keys) {
        const value = previous[key];
        if (value == null) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("exposes one dynamic optional lease contract on every Runtime claim entry", async () => {
    const server = new GoalBoardServer();
    const response = await server.handleMessage({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/list",
      params: {},
    });
    const tools = (response as {
      result: {
        tools: Array<{
          name: string;
          inputSchema: { properties?: Record<string, unknown>; required?: string[] };
        }>;
      };
    }).result.tools;
    const names = [
      "goalboard_v1_claim",
      "goalboard_v1_select_goal",
      "goalboard_v1_draft_dialogue_start",
      "goalboard_v1_draft_dialogue_resume",
    ];

    for (const name of names) {
      const tool = tools.find((item) => item.name === name);
      assert.ok(tool, name);
      const lease = tool.inputSchema.properties?.lease_seconds as {
        type?: string;
        minimum?: number;
        maximum?: number;
        description?: string;
      };
      assert.equal(lease.type, "integer", name);
      assert.equal(lease.minimum, 1, name);
      assert.equal("maximum" in lease, false, name);
      assert.match(lease.description ?? "", /通常省略.*当前动态策略/s, name);
      assert.match(lease.description ?? "", /显式值.*缩短/s, name);
      assert.equal(tool.inputSchema.required?.includes("lease_seconds"), false, name);
    }

    const skill = fs.readFileSync(path.join(ROOT, "skills/goal-advance/SKILL.md"), "utf8");
    assert.match(skill, /Omit `lease_seconds` by default/);
    assert.match(skill, /resolved dynamic policy/);
    assert.match(skill, /explicit value only to shorten/);
  });

  it("Runtime Skill keeps one concise entry and routes conditional work progressively", () => {
    const skillRoot = path.join(ROOT, "skills/goal-advance");
    const skill = fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
    const metadata = fs.readFileSync(path.join(skillRoot, "agents/openai.yaml"), "utf8");
    const references = Object.fromEntries(
      ["protocol", "project-connection", "planning", "execution", "service-start"].map((name) => [
        name,
        fs.readFileSync(path.join(skillRoot, "references", `${name}.md`), "utf8"),
      ]),
    );

    assert.ok(skill.split("\n").length <= 180);
    assert.match(skill, /clarify and plan Goal Trees with relevant professional methods/);
    assert.match(metadata, /组合规划方法、建立依赖并持续推进 Goal/);
    assert.match(metadata, /Use \$goal-advance to connect this conversation to GoalBoard, clarify and plan the Goal/);
    assert.match(skill, /## The GoalBoard loop/);
    assert.match(skill, /## Planning loop — the core reasoning/);
    for (const name of ["protocol", "project-connection", "planning", "execution", "service-start"]) {
      assert.match(skill, new RegExp(`references/${name}\\.md`));
    }
    assert.doesNotMatch(skill, /GOALBOARD_DATABASE/);
    assert.match(references.protocol, /Goal lifecycle uses only host-provided `goalboard_v1_\*` Runtime MCP tools/);
    assert.match(references.protocol, /Confirmation for selecting a project does not authorize/);
    assert.match(references.protocol, /available → select_goal/);
    assert.match(references["project-connection"], /Silence, timeout/);
    assert.match(references["project-connection"], /Recoverable Goal trash/);
    assert.match(references.planning, /Stop only when no required provider theme/);
    assert.match(references.planning, /consumer_goal depends_on provider_goal/);
    assert.match(references.planning, /work type describes the shape of work/);
    assert.match(references.planning, /vertical outcome unit/);
    assert.match(references.planning, /horizontal shared unit/);
    assert.match(references.execution, /GoalBoard does not dispatch one mandatory next task/);
    assert.match(references.execution, /An observed mismatch is Goal information/);
    assert.match(references["service-start"], /service status --home "\$HOME\/\.goalboard" --json/);
    for (const content of Object.values(references)) assert.doesNotMatch(content, /GOALBOARD_DATABASE/);
  });

  it("Runtime opens Web at the bound project or active Goal without changing Runtime state", () => {
    const serviceStart = fs.readFileSync(
      path.join(ROOT, "skills/goal-advance/references/service-start.md"),
      "utf8",
    );

    assert.match(serviceStart, /before opening.*read-only `goalboard_v1_context_resolve`/is);
    assert.match(serviceStart, /explicit current Goal.*`goal_url`/is);
    assert.match(serviceStart, /resolution is `bound`.*`project_url`/is);
    assert.match(serviceStart, /unbound.*unavailable.*browse all projects.*root/is);
    assert.match(serviceStart, /do not construct.*project.*Goal URL/is);
    assert.match(serviceStart, /does not bind or switch.*Claim.*Run.*advance.*Goal/is);
    assert.match(serviceStart, /service health.*navigation target.*separate/is);
  });

  it("Runtime keeps finite Goals separate from recurring operation and feeds operational Evidence into Candidates", () => {
    const skillRoot = path.join(ROOT, "skills/goal-advance");
    const skill = fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
    const planning = fs.readFileSync(path.join(skillRoot, "references/planning.md"), "utf8");
    const execution = fs.readFileSync(path.join(skillRoot, "references/execution.md"), "utf8");

    for (const text of [skill, planning]) {
      assert.match(text, /Goal.*finite.*acceptable.*Done/is);
      assert.match(text, /recurring operation.*Evidence.*Candidate Improvement Goal/is);
      assert.match(text, /permanently unmet Goal.*cyclic `depends_on`/is);
    }
    assert.match(execution, /recurring operation.*does not reopen.*completed capability Goal/is);
    assert.match(execution, /operational Evidence.*Candidate Improvement Goal/is);
    assert.match(execution, /user.*decides.*canonical Goal/is);
  });

  it("Runtime recovery guidance treats a newer catalog as a stale Session, not damaged data", () => {
    const skillRoot = path.join(ROOT, "skills/goal-advance");
    const connection = fs.readFileSync(path.join(skillRoot, "references/project-connection.md"), "utf8");

    assert.match(connection, /`catalog\.reader_too_old`/);
    assert.match(connection, /actual_schema_version.*supported_schema_max/s);
    assert.match(connection, /current Session cannot hot-reload.*MCP/is);
    assert.match(connection, /new or Forked Session.*confirm.*current task focus/is);
    assert.match(connection, /read-only `goalboard_v1_context_resolve`/);
    assert.match(connection, /message still lands in the old task.*do not enter a write path/is);
    assert.match(connection, /Never roll back `catalog\.db`.*SQLite.*CLI.*Web/s);
    assert.match(connection, /host navigation.*does not prove.*task focus/is);
  });

  it("Runtime Skill preserves readable planning, decisions, execution, and correction", () => {
    const skillRoot = path.join(ROOT, "skills/goal-advance");
    const skill = fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
    const planning = fs.readFileSync(path.join(skillRoot, "references/planning.md"), "utf8");
    const execution = fs.readFileSync(path.join(skillRoot, "references/execution.md"), "utf8");

    assert.match(skill, /Ask one question at a time/);
    assert.match(skill, /`business_logic` explains who does what/);
    assert.match(skill, /Treat a user correction as new authority/);
    assert.match(planning, /Persist before asking the next question/);
    assert.match(planning, /selected planning themes and why they apply/);
    assert.match(planning, /Establish right-sized SSOTs and orthogonal work units/);
    assert.match(planning, /Exactly one output is primary/);
    assert.match(planning, /confirm the whole named Proposal, reject it, or revise named items/);
    assert.match(planning, /replan the affected subgraph/);
    assert.match(execution, /Work only inside the selected accepted leaf Contract/);
    assert.match(execution, /evidence_submit mapped to acceptance criterion IDs/);
    assert.match(execution, /A required human approval cannot be replaced by a Runtime review/);
    assert.match(execution, /Do not continue unrelated work while a completion-blocking problem lacks a visible owner/);
  });

  it("unknown method", async () => {
    const server = new GoalBoardServer();
    const result = await server.handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "foo",
      params: {},
    });
    assert.equal((result as { error: { code: number } }).error.code, -32601);
  });

  it("serves empty resource and resource-template lists for clients that enumerate them", async () => {
    const server = new GoalBoardServer();
    const resources = await server.handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "resources/list",
      params: {},
    });
    assert.deepEqual(
      (resources as { result: { resources: unknown[] } }).result.resources,
      [],
    );
    const templates = await server.handleMessage({
      jsonrpc: "2.0",
      id: 2,
      method: "resources/templates/list",
      params: {},
    });
    assert.deepEqual(
      (templates as { result: { resourceTemplates: unknown[] } }).result.resourceTemplates,
      [],
    );
  });

  it("returns one combined project planning composition to the current Runtime", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "goalboard-mcp-planning-composition-"));
    const databasePath = path.join(directory, "goalboard.db");
    const management = new GoalBoardServer("management");
    const runtime = new GoalBoardServer("runtime", {
      databasePath,
      boardId: "planning-composition-board",
      webBaseUrl: "https://goalboard.example/app/",
    });
    const call = async (
      server: GoalBoardServer,
      name: string,
      args: Record<string, unknown>,
    ) =>
      server.handleMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }) as Promise<{ result: { isError: boolean; content: Array<{ text: string }> } }>;
    const method = (methodId: string, name: string, kind: "work_type" | "domain" | "industry" | "overlay") => ({
      method_id: methodId,
      kind,
      name,
      summary: `${name}为项目拆分提供一条独立规划路径。`,
      applies_to: ["复杂项目"],
      domain_tags: [kind],
      steps: [`执行${name}路径`],
      required_coverage: [{
        area: `${methodId}-coverage`,
        label: `${name}覆盖`,
        question: `${name}必须回答什么？`,
      }],
      dependency_rules: [{
        rule_id: `${methodId}-dependency`,
        statement: `${name}产出被消费时才建立依赖。`,
        direction_hint: "consumer depends_on provider",
      }],
      evidence_requirements: [`${name}证据`],
      completion_checks: [`${name}检查完成`],
      failure_modes: [`遗漏${name}路径`],
      source_refs: ["mcp-test"],
      confidence: 0.9,
      enabled: true,
    });

    try {
      const initialized = await call(management, "goalboard_v1_initialize", {
        database_path: databasePath,
        board_id: "planning-composition-board",
        title: "Planning Composition",
        actor_id: "user-1",
        idempotency_key: "planning-composition-init",
      });
      assert.equal(initialized.result.isError, false, initialized.result.content[0]?.text);

      for (const pack of [
        method("work-build", "构建与改变", "work_type"),
        method("domain-software", "软件开发", "domain"),
        method("industry-education", "教育", "industry"),
        method("overlay-minors", "未成年人", "overlay"),
      ]) {
        const saved = await call(runtime, "goalboard_v1_planning_method_save", {
          board_id: "planning-composition-board",
          method: pack,
          actor_id: "user-1",
          user_confirmed: true,
        });
        assert.equal(saved.result.isError, false, saved.result.content[0]?.text);
      }

      const response = await call(runtime, "goalboard_v1_planning_methods", {
        board_id: "planning-composition-board",
      });
      assert.equal(response.result.isError, false, response.result.content[0]?.text);
      const result = JSON.parse(response.result.content[0]?.text ?? "{}") as {
        composition: {
          method_pack_ids: string[];
          method_paths: Array<{ method_id: string; steps: string[]; instructions: string }>;
          required_coverage: unknown[];
          completion_checks: string[];
        };
      };
      assert.deepEqual(result.composition.method_pack_ids, ["work-build", "domain-software", "industry-education", "overlay-minors"]);
      assert.deepEqual(
        result.composition.method_paths.map((path) => path.method_id),
        result.composition.method_pack_ids,
      );
      assert.ok(result.composition.method_paths.every((path) => path.instructions.includes("depends_on")));
      assert.equal(result.composition.required_coverage.length, 4);
      assert.equal(result.composition.completion_checks.length, 4);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("serves a stable Goal Contract and the Available safe-parallel suggestion", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "goalboard-mcp-v1-"));
    const databasePath = path.join(directory, "goalboard.db");
    const management = new GoalBoardServer("management");
    const runtime = new GoalBoardServer("runtime", {
      databasePath,
      boardId: "mcp-board",
      webBaseUrl: "https://goalboard.example/app/",
    });
    const call = async (
      server: GoalBoardServer,
      name: string,
      args: Record<string, unknown>,
    ) =>
      server.handleMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }) as Promise<{ result: { isError: boolean; content: Array<{ text: string }> } }>;
    try {
      const initialized = await call(management, "goalboard_v1_initialize", {
        database_path: databasePath,
        board_id: "mcp-board",
        title: "MCP Contract",
        actor_id: "user-1",
        idempotency_key: "initialize-mcp-board",
      });
      assert.equal(initialized.result.isError, false, initialized.result.content[0]?.text);
      const created = await call(management, "goalboard_v1_create_goal", {
        database_path: databasePath,
        board_id: "mcp-board",
        actor_id: "user-1",
        idempotency_key: "create-mcp-goal",
        goal: {
          goal_id: "goal/with space",
          title: "测试稳定页面地址",
          outcome: "Runtime 获得单 Goal Contract",
          why: "避免每次下载整张 Board",
          business_logic: "Runtime 读取一个 Goal 的全部工作约束，再决定是否认领。",
          definition_state: "accepted",
          decomposition_state: "closed_leaf",
          priority: 20,
          acceptance_criteria: [
            {
              criterion_id: "mcp-contract",
              statement: "MCP 返回稳定地址",
              decision_method: "automated_check",
              pass_condition: "地址包含编码后的 Goal ID",
            },
          ],
        },
      });
      assert.equal(created.result.isError, false, created.result.content[0]?.text);
      const response = await call(runtime, "goalboard_v1_contract", {
        board_id: "mcp-board",
        goal_id: "goal/with space",
      });
      assert.equal(response.result.isError, false, response.result.content[0]?.text);
      const contract = JSON.parse(response.result.content[0].text) as {
        board: { board_id: string };
        goal: { goal_id: string };
        goal_path: string;
        goal_url: string;
        relations: unknown[];
      };
      assert.equal(contract.board.board_id, "mcp-board");
      assert.equal(contract.goal.goal_id, "goal/with space");
      assert.equal(contract.goal_path, "/goals/goal%2Fwith%20space");
      assert.equal(contract.goal_url, "https://goalboard.example/goals/goal%2Fwith%20space");
      assert.deepEqual(contract.relations, []);

      const secondGoal = await call(management, "goalboard_v1_create_goal", {
        database_path: databasePath,
        board_id: "mcp-board",
        actor_id: "user-1",
        idempotency_key: "create-mcp-parallel-goal",
        goal: {
          goal_id: "parallel-guide",
          title: "更新并行执行指南",
          outcome: "Runtime 获得可独立检查的使用说明",
          why: "验证 MCP 能把安全并行建议完整返回给 Runtime。",
          business_logic: "这条 Goal 只更新独立文档，不修改另一个 Goal 的代码范围。",
          definition_state: "accepted",
          decomposition_state: "closed_leaf",
          priority: 10,
          acceptance_criteria: [
            {
              criterion_id: "parallel-guide-contract",
              statement: "并行执行指南可检查",
              decision_method: "inspection",
              pass_condition: "指南说明 Runtime 分配边界",
            },
          ],
        },
      });
      assert.equal(secondGoal.result.isError, false, secondGoal.result.content[0]?.text);
      for (const [goalId, surface, idempotencyKey] of [
        ["goal/with space", "src/runtime/contract.ts", "mcp-primary-impact"],
        ["parallel-guide", "docs/runtime-guide.md", "mcp-parallel-impact"],
      ]) {
        const impact = await call(management, "goalboard_v1_impact_add", {
          database_path: databasePath,
          board_id: "mcp-board",
          payload: {
            impact: {
              goal_id: goalId,
              surface,
              access: "write",
              reason: "确认两个 Goal 的独立修改范围",
            },
            actor_id: "user-1",
            idempotency_key: idempotencyKey,
          },
        });
        assert.equal(impact.result.isError, false, impact.result.content[0]?.text);
      }

      const availableResponse = await call(runtime, "goalboard_v1_available", {
        board_id: "mcp-board",
        actor_id: "runtime-a",
      });
      assert.equal(availableResponse.result.isError, false, availableResponse.result.content[0]?.text);
      const available = JSON.parse(availableResponse.result.content[0].text) as {
        available: Array<{ goal: { goal_id: string }; next_action: string; role: string }>;
        parallel_suggestion: {
          kind: string;
          advisory_only: boolean;
          assignments: Array<{ runtime_slot: string; goal_id: string; role: string }>;
        } | null;
      };
      assert.deepEqual(available.available.map((item) => [item.goal.goal_id, item.next_action, item.role]), [
        ["goal/with space", "execute", "executor"],
        ["parallel-guide", "execute", "executor"],
      ]);
      assert.deepEqual(available.parallel_suggestion, {
        kind: "safe_parallel_execution",
        advisory_only: true,
        assignments: [
          {
            runtime_slot: "current_runtime",
            goal_id: "goal/with space",
            title: "测试稳定页面地址",
            role: "executor",
            required_capabilities: [],
          },
          {
            runtime_slot: "additional_runtime_1",
            goal_id: "parallel-guide",
            title: "更新并行执行指南",
            role: "executor",
            required_capabilities: [],
          },
        ],
      });

      const selectedResponse = await call(runtime, "goalboard_v1_select_goal", {
        board_id: "mcp-board",
        goal_id: "goal/with space",
        actor_id: "runtime-a",
        idempotency_key: "mcp-select-and-start",
      });
      assert.equal(selectedResponse.result.isError, false, selectedResponse.result.content[0]?.text);
      const selected = JSON.parse(selectedResponse.result.content[0].text) as {
        allowed: boolean;
        claim: { claim_id: string } | null;
        run: { run_id: string } | null;
        work_state: { work_state: string } | null;
      };
      assert.equal(selected.allowed, true);
      assert.ok(selected.claim);
      assert.ok(selected.run);
      assert.equal(selected.work_state?.work_state, "executing");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("lets the current Runtime start, persist, and resume Draft clarification without opening Web", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "goalboard-mcp-draft-dialogue-"));
    const databasePath = path.join(directory, "goalboard.db");
    const management = new GoalBoardServer("management");
    const runtime = new GoalBoardServer("runtime", {
      databasePath,
      boardId: "draft-dialogue-board",
      webBaseUrl: "https://goalboard.example/app/",
    });
    const call = async (
      server: GoalBoardServer,
      name: string,
      args: Record<string, unknown>,
    ) =>
      server.handleMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }) as Promise<{ result: { isError: boolean; content: Array<{ text: string }> } }>;
    try {
      const initialized = await call(management, "goalboard_v1_initialize", {
        database_path: databasePath,
        board_id: "draft-dialogue-board",
        title: "Draft Dialogue Board",
        actor_id: "user-1",
        idempotency_key: "draft-dialogue-init",
      });
      assert.equal(initialized.result.isError, false, initialized.result.content[0]?.text);

      const startedResponse = await call(runtime, "goalboard_v1_draft_dialogue_start", {
        board_id: "draft-dialogue-board",
        actor_id: "runtime-current-session",
        rough_idea: "我想梳理一套无需打开网页的 GoalBoard 第一次使用体验。",
        idempotency_key: "mcp-draft-dialogue-start",
      });
      assert.equal(startedResponse.result.isError, false, startedResponse.result.content[0]?.text);
      const started = JSON.parse(startedResponse.result.content[0]?.text ?? "{}") as {
        goal: { goal_id: string; definition_state: string; outcome: string };
        dialogue: { state: string; session_id: string };
        claim: { claim_id: string } | null;
        run: { run_id: string; role: string } | null;
        work_state: { work_state: string };
      };
      assert.equal(started.goal.definition_state, "draft");
      assert.equal(started.goal.outcome, "");
      assert.equal(started.dialogue.state, "clarifying");
      assert.equal(started.run?.role, "clarifier");
      assert.equal(started.work_state.work_state, "clarifying");

      const answeredResponse = await call(runtime, "goalboard_v1_draft_dialogue_turn", {
        board_id: "draft-dialogue-board",
        goal_id: started.goal.goal_id,
        run_id: started.run?.run_id,
        actor_id: "runtime-current-session",
        user_message: "当前 Runtime 要直接用对话提问和保存进度，网页只在用户主动需要时再打开。",
        current_understanding: "首版以 Runtime 内的连续自然语言澄清为主，Web 不是必经页面。",
        known_facts: [
          { statement: "网页不是必经页面。", source_kind: "user_answer" },
        ],
        next_question: "首次完成后，用户最想看到哪一项推进记录？",
        idempotency_key: "mcp-draft-dialogue-turn",
      });
      assert.equal(answeredResponse.result.isError, false, answeredResponse.result.content[0]?.text);
      const answered = JSON.parse(answeredResponse.result.content[0]?.text ?? "{}") as {
        dialogue: { next_question: string | null };
        turns: Array<{ user_message: string; known_facts: Array<{ source_kind: string }> }>;
      };
      assert.equal(answered.dialogue.next_question, "首次完成后，用户最想看到哪一项推进记录？");
      assert.equal(answered.turns.length, 2);
      assert.equal(answered.turns[1]?.known_facts[0]?.source_kind, "user_answer");

      const releasedResponse = await call(runtime, "goalboard_v1_release", {
        board_id: "draft-dialogue-board",
        payload: {
          claim_id: started.claim?.claim_id,
          actor_id: "runtime-current-session",
          reason: "验证下一次 Runtime Session 从持久化记录恢复",
          idempotency_key: "mcp-draft-dialogue-release",
        },
      });
      assert.equal(releasedResponse.result.isError, false, releasedResponse.result.content[0]?.text);
      const resumedResponse = await call(runtime, "goalboard_v1_draft_dialogue_resume", {
        board_id: "draft-dialogue-board",
        goal_id: started.goal.goal_id,
        actor_id: "runtime-current-session",
        idempotency_key: "mcp-draft-dialogue-resume",
      });
      assert.equal(resumedResponse.result.isError, false, resumedResponse.result.content[0]?.text);
      const resumed = JSON.parse(resumedResponse.result.content[0]?.text ?? "{}") as {
        dialogue: { session_id: string; next_question: string | null };
        run: { run_id: string } | null;
      };
      assert.equal(resumed.dialogue.session_id, started.dialogue.session_id);
      assert.equal(resumed.dialogue.next_question, "首次完成后，用户最想看到哪一项推进记录？");
      assert.notEqual(resumed.run?.run_id, started.run?.run_id);

      const proposalResponse = await call(runtime, "goalboard_v1_goal_tree_propose", {
        board_id: "draft-dialogue-board",
        actor_id: "runtime-current-session",
        discovered_in_run_id: resumed.run?.run_id,
        root_goal_id: started.goal.goal_id,
        summary: "建议先保留当前 Draft 作为父 Goal，再拆出 Runtime 内澄清这个子 Goal。",
        items: [
          {
            item_id: "mcp-dialogue-child",
            kind: "goal",
            operation: "create",
            payload: {
              goal_id: "mcp-dialogue-child",
              title: "在当前 Runtime 内持续澄清 Draft",
              parent_goal_id: started.goal.goal_id,
            },
            source_refs: ["conversation://mcp-draft-dialogue"],
            reason: "用户明确要求 Runtime 对话推进，而不是逐字段填写网页。",
            confidence: 1,
            affected_objects: [{ object_type: "goal", object_id: "mcp-dialogue-child" }],
          },
        ],
        idempotency_key: "mcp-goal-tree-propose",
      });
      assert.equal(proposalResponse.result.isError, false, proposalResponse.result.content[0]?.text);
      const proposal = JSON.parse(proposalResponse.result.content[0]?.text ?? "{}") as {
        proposal: { proposal_id: string; state: string; items: Array<{ item_id: string }> };
      };
      assert.equal(proposal.proposal.state, "pending");
      assert.deepEqual(proposal.proposal.items.map((item) => item.item_id), ["mcp-dialogue-child"]);

      const readResponse = await call(runtime, "goalboard_v1_goal_tree_read", {
        board_id: "draft-dialogue-board",
        proposal_id: proposal.proposal.proposal_id,
        include_legacy: false,
      });
      assert.equal(readResponse.result.isError, false, readResponse.result.content[0]?.text);
      const read = JSON.parse(readResponse.result.content[0]?.text ?? "{}") as {
        proposals: Array<{ proposal_id: string; origin: string }>;
      };
      assert.equal(read.proposals.length, 1);
      assert.equal(read.proposals[0]?.proposal_id, proposal.proposal.proposal_id);
      assert.equal(read.proposals[0]?.origin, "native");

      const checkResponse = await call(runtime, "goalboard_v1_goal_tree_check", {
        board_id: "draft-dialogue-board",
        proposal_id: proposal.proposal.proposal_id,
        actor_id: "runtime-current-session",
        idempotency_key: "mcp-goal-tree-check",
      });
      assert.equal(checkResponse.result.isError, false, checkResponse.result.content[0]?.text);
      const check = JSON.parse(checkResponse.result.content[0]?.text ?? "{}") as {
        conflict_item_ids: string[];
        proposal: { state: string };
      };
      assert.deepEqual(check.conflict_item_ids, []);
      assert.equal(check.proposal.state, "pending");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("records an explicit Runtime-dialogue confirmation with host session metadata", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "goalboard-mcp-tree-decision-"));
    const databasePath = path.join(directory, "goalboard.db");
    const connection = {
      databasePath,
      boardId: "tree-decision-board",
      webBaseUrl: "https://goalboard.example/app/",
    };
    const management = new GoalBoardServer("management");
    const runtime = new GoalBoardServer("runtime", connection, {
      runtimeContext: {
        runtime_id: "codex",
        stable_work_context_id: "workspace-fallback",
        host_declares_stable: true,
      },
    });
    const call = async (
      server: GoalBoardServer,
      name: string,
      args: Record<string, unknown>,
      meta?: Record<string, unknown>,
    ) =>
      server.handleMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args, ...(meta ? { _meta: meta } : {}) },
      }) as Promise<{ result: { isError: boolean; content: Array<{ text: string }> } }>;
    try {
      const initialized = await call(management, "goalboard_v1_initialize", {
        database_path: databasePath,
        board_id: "tree-decision-board",
        title: "MCP Tree Decision",
        actor_id: "user-1",
        idempotency_key: "mcp-tree-decision-init",
      });
      assert.equal(initialized.result.isError, false, initialized.result.content[0]?.text);
      const dialogueResponse = await call(runtime, "goalboard_v1_draft_dialogue_start", {
        board_id: "tree-decision-board",
        actor_id: "runtime-current-session",
        goal_id: "mcp-tree-root",
        rough_idea: "在当前 Runtime 中确认提案，不要求用户打开网页。",
        idempotency_key: "mcp-tree-decision-dialogue",
      });
      assert.equal(dialogueResponse.result.isError, false, dialogueResponse.result.content[0]?.text);
      const dialogue = JSON.parse(dialogueResponse.result.content[0]?.text ?? "{}") as {
        run: { run_id: string } | null;
      };
      const proposedResponse = await call(runtime, "goalboard_v1_goal_tree_propose", {
        board_id: "tree-decision-board",
        actor_id: "runtime-current-session",
        discovered_in_run_id: dialogue.run?.run_id,
        root_goal_id: "mcp-tree-root",
        summary: "用户确认后先新增一个仍待澄清的子 Goal。",
        items: [
          {
            item_id: "mcp-tree-child",
            kind: "goal",
            operation: "create",
            payload: { goal_id: "mcp-tree-child", title: "由当前 Runtime 继续澄清的子 Goal" },
            source_refs: ["conversation://mcp-tree-decision"],
            reason: "用户要求把计划保存在 GoalBoard，并在当前 Runtime 里继续推进。",
            confidence: 1,
            affected_objects: [{ object_type: "goal", object_id: "mcp-tree-child" }],
          },
        ],
        idempotency_key: "mcp-tree-decision-propose",
      });
      assert.equal(proposedResponse.result.isError, false, proposedResponse.result.content[0]?.text);
      const proposal = JSON.parse(proposedResponse.result.content[0]?.text ?? "{}") as {
        proposal: { proposal_id: string };
      };
      const request = {
        board_id: "tree-decision-board",
        proposal_id: proposal.proposal.proposal_id,
        runtime_actor_id: "runtime-current-session",
        // The Runtime may try to send this, but the server must ignore it.
        authority: {
          actor_id: "forged-runtime-user",
          actor_kind: "user",
          authority_source: "management",
          conversation_ref: "forged://conversation",
          message_ref: "forged://message",
        },
        thread_id: "forged-thread-in-arguments",
        decisions: [{ item_id: "mcp-tree-child", decision: "confirm", reason: "用户确认保留这条子 Goal。" }],
        idempotency_key: "mcp-tree-decision-apply",
      };
      const noConfirmation = await call(runtime, "goalboard_v1_goal_tree_decide", request, {
        threadId: "codex-thread-from-host",
      });
      assert.equal(noConfirmation.result.isError, true);
      assert.match(noConfirmation.result.content[0]?.text ?? "", /用户刚刚在当前对话中明确确认/);
      const appliedResponse = await call(runtime, "goalboard_v1_goal_tree_decide", {
        ...request,
        user_confirmed: true,
        confirmation_summary: "用户明确确认保留 mcp-tree-child。",
      }, {
        threadId: "codex-thread-from-host",
      });
      assert.equal(appliedResponse.result.isError, false, appliedResponse.result.content[0]?.text);
      const applied = JSON.parse(appliedResponse.result.content[0]?.text ?? "{}") as {
        proposal: {
          items: Array<{
            item_id: string;
            decision: {
              actor_id: string;
              authority_source: string;
              conversation_ref: string;
              message_ref: string;
            } | null;
          }>;
        };
      };
      const child = applied.proposal.items.find((item) => item.item_id === "mcp-tree-child");
      assert.equal(child?.decision?.actor_id, "user-confirmed-via:codex");
      assert.equal(child?.decision?.authority_source, "runtime_dialogue");
      assert.equal(child?.decision?.conversation_ref, "runtime-dialogue:codex:codex-thread-from-host");
      assert.match(child?.decision?.message_ref ?? "", /^runtime-attestation:[0-9a-f]{20}$/);
      assert.doesNotMatch(child?.decision?.conversation_ref ?? "", /forged-thread-in-arguments/);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("promotes an existing Candidate through the Runtime Goal Tree proposal path", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "goalboard-mcp-candidate-promotion-"));
    const databasePath = path.join(directory, "goalboard.db");
    const connection = {
      databasePath,
      boardId: "candidate-promotion-board",
      webBaseUrl: "https://goalboard.example/app/",
    };
    const management = new GoalBoardServer("management");
    const runtime = new GoalBoardServer("runtime", connection, {
      runtimeContext: {
        runtime_id: "codex",
        stable_work_context_id: "candidate-promotion-session",
        host_declares_stable: true,
      },
    });
    const call = async (
      server: GoalBoardServer,
      name: string,
      args: Record<string, unknown>,
      meta?: Record<string, unknown>,
    ) =>
      server.handleMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args, ...(meta ? { _meta: meta } : {}) },
      }) as Promise<{ result: { isError: boolean; content: Array<{ text: string }> } }>;
    try {
      const initialized = await call(management, "goalboard_v1_initialize", {
        database_path: databasePath,
        board_id: "candidate-promotion-board",
        title: "Candidate Promotion",
        actor_id: "user-1",
        idempotency_key: "candidate-promotion-init",
      });
      assert.equal(initialized.result.isError, false, initialized.result.content[0]?.text);
      const dialogueResponse = await call(runtime, "goalboard_v1_draft_dialogue_start", {
        board_id: "candidate-promotion-board",
        actor_id: "runtime-candidate-promotion",
        goal_id: "candidate-promotion-root",
        rough_idea: "把已有 Candidate 在同一份 Goal Tree 提案中修订并晋升。",
        idempotency_key: "candidate-promotion-dialogue",
      });
      assert.equal(dialogueResponse.result.isError, false, dialogueResponse.result.content[0]?.text);
      const dialogue = JSON.parse(dialogueResponse.result.content[0]?.text ?? "{}") as {
        run: { run_id: string } | null;
      };
      const originalGoal = {
        goal_id: "candidate-promotion-child",
        title: "原始 Candidate Contract",
        outcome: "已有 Candidate 可以被用户统一核对",
        why: "避免 Candidate 和正式 Goal 同时悬空",
        business_logic: "先保存候选工作，之后由用户决定是否独立纳入 Goal Tree。",
        definition_state: "accepted",
        decomposition_state: "closed_leaf",
        acceptance_criteria: [{
          criterion_id: "candidate-promotion-child-c1",
          statement: "Candidate 可以干净晋升",
          decision_method: "inspection",
          pass_condition: "原 Candidate 关闭且只生成一条正式 Goal",
        }],
      };
      const candidateResponse = await call(runtime, "goalboard_v1_candidate_submit", {
        board_id: "candidate-promotion-board",
        payload: {
          actor_id: "runtime-candidate-promotion",
          discovered_in_run_id: dialogue.run?.run_id,
          proposed_goal: originalGoal,
          idempotency_key: "candidate-promotion-submit",
        },
      });
      assert.equal(candidateResponse.result.isError, false, candidateResponse.result.content[0]?.text);
      const candidate = JSON.parse(candidateResponse.result.content[0]?.text ?? "{}") as {
        candidate: { candidate_id: string };
      };
      const output = "已有 Candidate 通过统一提案成为唯一正式 Goal";
      const finalGoal = {
        ...originalGoal,
        title: "统一晋升已有 Candidate",
        outcome: output,
        business_logic: "用户确认同一条 Candidate item 后，Goal、关系和 Candidate 决定在一个事务中一起写入。",
        in_scope: [output],
        out_of_scope: ["不自动开始执行正式 Goal"],
        constraints: ["保留原 Candidate 与用户决定历史"],
        required_inputs: ["已有 pending Candidate"],
        promised_outputs: [output],
        leaf_readiness: {
          verdict: "ready",
          primary_deliverable: output,
          output_coverage: [{ promised_output: output, role: "primary", reason: "这是唯一独立验收结果。" }],
          split_candidates: [],
          rationale: "只有一条原子晋升结果。",
          unresolved_decisions: [],
          independent_deliverables: [],
          acceptance_criterion_ids: ["candidate-promotion-child-c1"],
        },
      };
      const proposalResponse = await call(runtime, "goalboard_v1_goal_tree_propose", {
        board_id: "candidate-promotion-board",
        actor_id: "runtime-candidate-promotion",
        discovered_in_run_id: dialogue.run?.run_id,
        root_goal_id: "candidate-promotion-root",
        summary: "修订并晋升已有 Candidate，同时确认它属于当前根 Goal。",
        items: [{
          item_id: "candidate-promotion-item",
          kind: "candidate",
          operation: "update",
          payload: {
            candidate_id: candidate.candidate.candidate_id,
            proposed_goal: finalGoal,
            proposed_relations: [{
              from_goal_id: "$new_goal",
              to_goal_id: "candidate-promotion-root",
              type: "part_of",
              reason: "晋升后的 Goal 属于当前根 Goal。",
            }],
          },
          source_refs: ["conversation://candidate-promotion"],
          reason: "用户需要在同一个确认里核对最终 Contract 和父子关系。",
          confidence: 1,
          affected_objects: [
            { object_type: "candidate", object_id: candidate.candidate.candidate_id },
            { object_type: "goal", object_id: "candidate-promotion-child" },
          ],
        }],
        idempotency_key: "candidate-promotion-proposal",
      });
      assert.equal(proposalResponse.result.isError, false, proposalResponse.result.content[0]?.text);
      const proposal = JSON.parse(proposalResponse.result.content[0]?.text ?? "{}") as {
        proposal: { proposal_id: string };
      };
      const appliedResponse = await call(runtime, "goalboard_v1_goal_tree_decide", {
        board_id: "candidate-promotion-board",
        proposal_id: proposal.proposal.proposal_id,
        runtime_actor_id: "runtime-candidate-promotion",
        decisions: [{
          item_id: "candidate-promotion-item",
          decision: "confirm",
          reason: "用户确认采用修订后的 Candidate Contract 和关系。",
        }],
        user_confirmed: true,
        confirmation_summary: "用户确认晋升这一条已有 Candidate。",
        idempotency_key: "candidate-promotion-decide",
      }, { threadId: "candidate-promotion-thread" });
      assert.equal(appliedResponse.result.isError, false, appliedResponse.result.content[0]?.text);
      const applied = JSON.parse(appliedResponse.result.content[0]?.text ?? "{}") as {
        applied_item_ids: string[];
        conflict_item_ids: string[];
      };
      assert.deepEqual(applied.applied_item_ids, ["candidate-promotion-item"]);
      assert.deepEqual(applied.conflict_item_ids, []);

      const snapshotResponse = await call(management, "goalboard_v1_snapshot", {
        database_path: databasePath,
        board_id: "candidate-promotion-board",
      });
      assert.equal(snapshotResponse.result.isError, false, snapshotResponse.result.content[0]?.text);
      const snapshot = JSON.parse(snapshotResponse.result.content[0]?.text ?? "{}") as {
        candidates: Array<{ candidate_id: string; state: string; decision: { formal_goal_id?: string } | null }>;
        goals: Array<{ goal_id: string }>;
        relations: Array<{ from_goal_id: string; to_goal_id: string; type: string; state: string }>;
      };
      const promoted = snapshot.candidates.find((entry) => entry.candidate_id === candidate.candidate.candidate_id);
      assert.equal(promoted?.state, "approved");
      assert.equal(promoted?.decision?.formal_goal_id, "candidate-promotion-child");
      assert.equal(snapshot.goals.filter((goal) => goal.goal_id === "candidate-promotion-child").length, 1);
      assert.equal(snapshot.candidates.filter((entry) => entry.state === "pending").length, 0);
      assert.ok(snapshot.relations.some((relation) =>
        relation.from_goal_id === "candidate-promotion-child" &&
        relation.to_goal_id === "candidate-promotion-root" &&
        relation.type === "part_of" &&
        relation.state === "active"));
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("resolves the current host work entry only when the Skill calls it, then resumes the same host Session", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "goalboard-mcp-context-"));
    const home = path.join(directory, "home", ".goalboard");
    const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: home });
    const call = async (server: GoalBoardServer, name: string, args: Record<string, unknown>) =>
      server.handleMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }) as Promise<{ result: { isError: boolean; content: Array<{ text: string }> } }>;
    try {
      const first = await catalog.createProject({ display_name: "相同项目名", actor_id: "user" });
      const second = await catalog.createProject({ display_name: "相同项目名", actor_id: "user" });
      const management = new GoalBoardServer("management");
      const created = await call(management, "goalboard_v1_create_goal", {
        database_path: first.database_path,
        board_id: first.board_id,
        actor_id: "user",
        idempotency_key: "context-project-goal",
        goal: {
          goal_id: "project scoped goal",
          title: "打开当前项目里的 Goal",
          outcome: "Runtime 返回可以直接打开的项目页面",
          why: "多项目 Web 没有根级 Goal 页面",
          business_logic: "Runtime 使用用户已经选择的项目身份构造链接。",
          definition_state: "accepted",
          decomposition_state: "closed_leaf",
          acceptance_criteria: [{
            criterion_id: "scoped-url",
            statement: "地址包含项目和 Goal",
            decision_method: "automated_check",
            pass_condition: "URL 使用项目级路由",
          }],
        },
      });
      assert.equal(created.result.isError, false, created.result.content[0]?.text);
      const host = {
        homeDirectory: home,
        runtimeContext: {
          runtime_id: "codex",
          stable_work_context_id: "host-work-entry-42",
          host_declares_stable: true,
        },
        webBaseUrl: "https://goalboard.example/app/",
      };
      const runtime = new GoalBoardServer("runtime", null, host);

      // Constructing a Runtime MCP does not open a Board. The Skill must ask.
      assert.equal(runtime.runtimeConnection, null);
      const notConnected = await call(runtime, "goalboard_v1_snapshot", { board_id: first.board_id });
      assert.equal(notConnected.result.isError, true);
      assert.match(notConnected.result.content[0]?.text ?? "", /尚未连接项目/);

      const unboundResponse = await call(runtime, "goalboard_v1_context_resolve", {});
      assert.equal(unboundResponse.result.isError, false, unboundResponse.result.content[0]?.text);
      const unbound = JSON.parse(unboundResponse.result.content[0]?.text ?? "{}") as {
        status: string;
        reason: string;
        next_action: string;
        connection: unknown;
        available_projects: Array<{ project_id: string }>;
      };
      assert.equal(unbound.status, "unbound");
      assert.equal(unbound.reason, "unknown_context");
      assert.equal(unbound.next_action, "ask_user_to_select_or_create");
      assert.equal(unbound.connection, null);
      assert.deepEqual(unbound.available_projects.map((project) => project.project_id).sort(), [
        first.project_id,
        second.project_id,
      ].sort());

      const boundResponse = await call(runtime, "goalboard_v1_context_bind", {
        project_id: first.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
      });
      assert.equal(boundResponse.result.isError, false, boundResponse.result.content[0]?.text);
      const bound = JSON.parse(boundResponse.result.content[0]?.text ?? "{}") as {
        status: string;
        connection: {
          project_id: string;
          board_id: string;
          database_path: string;
          web_base_url: string;
          project_url: string;
        };
      };
      assert.equal(bound.status, "bound");
      assert.equal(bound.connection.project_id, first.project_id);
      assert.equal(bound.connection.board_id, first.board_id);
      assert.equal(bound.connection.database_path, first.database_path);
      assert.equal(bound.connection.web_base_url, "https://goalboard.example/app/");
      assert.equal(
        bound.connection.project_url,
        `https://goalboard.example/projects/${encodeURIComponent(first.project_id)}`,
      );
      assert.equal(runtime.runtimeConnection?.projectId, first.project_id);

      const contractResponse = await call(runtime, "goalboard_v1_contract", {
        board_id: first.board_id,
        goal_id: "project scoped goal",
      });
      assert.equal(contractResponse.result.isError, false, contractResponse.result.content[0]?.text);
      const contract = JSON.parse(contractResponse.result.content[0]?.text ?? "{}") as { goal_url: string };
      assert.equal(
        contract.goal_url,
        `https://goalboard.example/projects/${encodeURIComponent(first.project_id)}/goals/project%20scoped%20goal`,
      );

      const firstSnapshot = await call(runtime, "goalboard_v1_snapshot", { board_id: first.board_id });
      assert.equal(firstSnapshot.result.isError, false, firstSnapshot.result.content[0]?.text);

      // A new MCP process for the same opaque host Session/work entry has no
      // in-process connection. Its first resolve restores that same
      // user-confirmed binding; a fresh Session must have a fresh host ID.
      const newSession = new GoalBoardServer("runtime", null, host);
      assert.equal(newSession.runtimeConnection, null);
      const restoredResponse = await call(newSession, "goalboard_v1_context_resolve", {});
      assert.equal(restoredResponse.result.isError, false, restoredResponse.result.content[0]?.text);
      const restored = JSON.parse(restoredResponse.result.content[0]?.text ?? "{}") as {
        status: string;
        connection: { project_id: string; board_id: string; project_url: string };
      };
      assert.equal(restored.status, "bound");
      assert.equal(restored.connection.project_id, first.project_id);
      assert.equal(restored.connection.board_id, first.board_id);
      assert.equal(
        restored.connection.project_url,
        `https://goalboard.example/projects/${encodeURIComponent(first.project_id)}`,
      );

      const beforeFocus = await call(newSession, "goalboard_v1_snapshot", { board_id: first.board_id });
      const focusedGoal = await call(newSession, "goalboard_v1_contract", {
        board_id: first.board_id,
        goal_id: "project scoped goal",
      });
      const afterFocus = await call(newSession, "goalboard_v1_snapshot", { board_id: first.board_id });
      assert.equal(focusedGoal.result.isError, false, focusedGoal.result.content[0]?.text);
      assert.equal(afterFocus.result.content[0]?.text, beforeFocus.result.content[0]?.text);

      const deniedRebind = await call(newSession, "goalboard_v1_context_bind", {
        project_id: second.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
      });
      assert.equal(deniedRebind.result.isError, true);
      assert.match(deniedRebind.result.content[0]?.text ?? "", /明确确认/);
      const stillFirst = await call(newSession, "goalboard_v1_context_resolve", {});
      assert.match(stillFirst.result.content[0]?.text ?? "", new RegExp(first.project_id));

      const rebound = await call(newSession, "goalboard_v1_context_bind", {
        project_id: second.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
        rebind_confirmed: true,
      });
      assert.equal(rebound.result.isError, false, rebound.result.content[0]?.text);
      assert.match(rebound.result.content[0]?.text ?? "", new RegExp(second.project_id));
      const secondSnapshot = await call(newSession, "goalboard_v1_snapshot", { board_id: second.board_id });
      assert.equal(secondSnapshot.result.isError, false, secondSnapshot.result.content[0]?.text);

      const lookalike = new GoalBoardServer("runtime", null, {
        ...host,
        runtimeContext: {
          ...host.runtimeContext,
          stable_work_context_id: first.display_name,
        },
      });
      const lookalikeResult = await call(lookalike, "goalboard_v1_context_resolve", {});
      const lookalikePayload = JSON.parse(lookalikeResult.result.content[0]?.text ?? "{}") as {
        status: string;
        connection: unknown;
      };
      // A lookalike ID does not restore a binding. Existing same-Runtime
      // confirmation history may be offered as a suggestion, still unbound.
      assert.equal(lookalikePayload.status, "suggested");
      assert.equal(lookalikePayload.connection, null);

      const missingIdentity = new GoalBoardServer("runtime", null, {
        ...host,
        runtimeContext: {
          ...host.runtimeContext,
          stable_work_context_id: null,
          host_declares_stable: false,
        },
      });
      const missingResult = await call(missingIdentity, "goalboard_v1_context_resolve", {});
      assert.match(missingResult.result.content[0]?.text ?? "", /missing_stable_context/);
    } finally {
      catalog.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("asks again for workspace history until default is explicit, then keeps Session overrides local", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "goalboard-mcp-workspace-routing-"));
    const home = path.join(directory, "home", ".goalboard");
    const workspace = path.join(directory, "ordinary-workspace");
    fs.mkdirSync(workspace, { recursive: true });
    const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: home });
    const host = runtimeContextHostFromEnvironment({
      GOALBOARD_RUNTIME_ID: "codex",
      GOALBOARD_HOME: home,
      PWD: workspace,
    }, workspace)!;
    const runtime = new GoalBoardServer("runtime", null, host);
    const call = async (
      server: GoalBoardServer,
      name: string,
      args: Record<string, unknown>,
      meta?: Record<string, unknown>,
    ) => server.handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args, ...(meta ? { _meta: meta } : {}) },
    }) as Promise<{ result: { isError: boolean; content: Array<{ text: string }> } }>;
    try {
      const first = await catalog.createProject({ display_name: "目录默认项目", actor_id: "user" });
      const second = await catalog.createProject({ display_name: "同目录临时项目", actor_id: "user" });

      const unbound = await call(runtime, "goalboard_v1_context_resolve", {});
      assert.equal(unbound.result.isError, false, unbound.result.content[0]?.text);
      const defaultBound = await call(runtime, "goalboard_v1_context_bind", {
        project_id: first.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
      });
      assert.equal(defaultBound.result.isError, false, defaultBound.result.content[0]?.text);

      const restarted = new GoalBoardServer("runtime", null, host);
      const historyCandidate = await call(restarted, "goalboard_v1_context_resolve", {});
      const candidatePayload = JSON.parse(historyCandidate.result.content[0]?.text ?? "{}") as {
        status: string;
        suggested_projects: Array<{ project_id: string }>;
      };
      assert.equal(candidatePayload.status, "suggested");
      assert.deepEqual(candidatePayload.suggested_projects.map((project) => project.project_id), [first.project_id]);

      const explicitDefault = await call(restarted, "goalboard_v1_context_bind", {
        project_id: first.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
        binding_scope: "workspace_default",
      });
      assert.equal(explicitDefault.result.isError, false, explicitDefault.result.content[0]?.text);
      const afterDefaultRestart = new GoalBoardServer("runtime", null, host);
      const restored = await call(afterDefaultRestart, "goalboard_v1_context_resolve", {});
      assert.match(restored.result.content[0]?.text ?? "", new RegExp(first.project_id));

      const sessionA = { threadId: "codex-thread-a" };
      const sessionB = { threadId: "codex-thread-b" };
      const override = await call(afterDefaultRestart, "goalboard_v1_context_bind", {
        project_id: second.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
        binding_scope: "session",
      }, sessionA);
      assert.equal(override.result.isError, false, override.result.content[0]?.text);
      assert.match(override.result.content[0]?.text ?? "", new RegExp(second.project_id));

      const otherSession = await call(afterDefaultRestart, "goalboard_v1_context_resolve", {}, sessionB);
      assert.match(otherSession.result.content[0]?.text ?? "", new RegExp(first.project_id));
      const restoredOverride = await call(afterDefaultRestart, "goalboard_v1_context_resolve", {}, sessionA);
      assert.match(restoredOverride.result.content[0]?.text ?? "", new RegExp(second.project_id));
    } finally {
      catalog.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("isolates project connections for generic Runtime sessions in one MCP process", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "goalboard-mcp-session-isolation-"));
    const home = path.join(directory, "home", ".goalboard");
    const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: home });
    const host = {
      homeDirectory: home,
      runtimeContext: {
        runtime_id: "generic-mcp-runtime",
        stable_work_context_id: null,
        host_declares_stable: false,
      },
    };
    const runtime = new GoalBoardServer("runtime", null, host);
    const call = async (
      name: string,
      args: Record<string, unknown>,
      meta: Record<string, unknown>,
    ) => runtime.handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args, _meta: meta },
    }) as Promise<{ result: { isError: boolean; content: Array<{ text: string }> } }>;
    const sessionA = { sessionId: "generic-session-a" };
    const sessionB = { "goalboard/sessionId": "generic-session-b" };
    try {
      const first = await catalog.createProject({ display_name: "Generic A", actor_id: "user" });
      const second = await catalog.createProject({ display_name: "Generic B", actor_id: "user" });

      await call("goalboard_v1_context_resolve", {}, sessionA);
      const boundA = await call("goalboard_v1_context_bind", {
        project_id: first.project_id,
        actor_id: "runtime-generic",
        user_confirmed: true,
      }, sessionA);
      assert.equal(boundA.result.isError, false, boundA.result.content[0]?.text);
      const snapshotA = await call("goalboard_v1_snapshot", { board_id: first.board_id }, sessionA);
      assert.equal(snapshotA.result.isError, false, snapshotA.result.content[0]?.text);

      const leakedIntoB = await call("goalboard_v1_snapshot", { board_id: first.board_id }, sessionB);
      assert.equal(leakedIntoB.result.isError, true);
      assert.match(leakedIntoB.result.content[0]?.text ?? "", /尚未连接项目/);

      await call("goalboard_v1_context_resolve", {}, sessionB);
      const boundB = await call("goalboard_v1_context_bind", {
        project_id: second.project_id,
        actor_id: "runtime-generic",
        user_confirmed: true,
      }, sessionB);
      assert.equal(boundB.result.isError, false, boundB.result.content[0]?.text);
      const snapshotB = await call("goalboard_v1_snapshot", { board_id: second.board_id }, sessionB);
      assert.equal(snapshotB.result.isError, false, snapshotB.result.content[0]?.text);

      const leakedBackIntoA = await call("goalboard_v1_snapshot", { board_id: second.board_id }, sessionA);
      assert.equal(leakedBackIntoA.result.isError, true);
      assert.match(leakedBackIntoA.result.content[0]?.text ?? "", /尚未连接项目/);
      const restoredA = await call("goalboard_v1_context_resolve", {}, sessionA);
      assert.equal(restoredA.result.isError, false, restoredA.result.content[0]?.text);
      assert.match(restoredA.result.content[0]?.text ?? "", new RegExp(first.project_id));
    } finally {
      catalog.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("returns host-ranked project suggestions for a fresh Session without auto-binding or repeating a rejection", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "goalboard-mcp-suggestion-"));
    const home = path.join(directory, "home", ".goalboard");
    const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: home });
    const call = async (server: GoalBoardServer, name: string, args: Record<string, unknown>) =>
      server.handleMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }) as Promise<{ result: { isError: boolean; content: Array<{ text: string }> } }>;
    try {
      const primary = await catalog.createProject({ display_name: "Alpha 主项目", actor_id: "user" });
      const related = await catalog.createProject({ display_name: "Alpha 文档", actor_id: "user" });
      await catalog.createProject({ display_name: "Beta 项目", actor_id: "user" });
      const host = {
        homeDirectory: home,
        runtimeContext: {
          runtime_id: "codex",
          stable_work_context_id: "fresh-session-a",
          host_declares_stable: true,
        },
        projectSuggestionClues: [
          { kind: "recent_project" as const, value: primary.project_id },
          { kind: "workspace" as const, value: "/private/host-only-token/alpha" },
        ],
      };
      const firstSession = new GoalBoardServer("runtime", null, host);

      const suggestedResult = await call(firstSession, "goalboard_v1_context_resolve", {});
      assert.equal(suggestedResult.result.isError, false, suggestedResult.result.content[0]?.text);
      const suggested = JSON.parse(suggestedResult.result.content[0]?.text ?? "{}") as {
        status: string;
        next_action: string;
        connection: unknown;
        suggested_projects: Array<{ project_id: string; reasons: string[] }>;
      };
      assert.equal(suggested.status, "suggested");
      assert.equal(suggested.next_action, "ask_user_to_confirm_suggestion");
      assert.equal(suggested.connection, null);
      assert.deepEqual(suggested.suggested_projects.map((project) => project.project_id), [
        primary.project_id,
        related.project_id,
      ]);
      assert.ok(suggested.suggested_projects.every((project) => project.reasons.length > 0));
      assert.doesNotMatch(JSON.stringify(suggested.suggested_projects), /host-only-token/);
      assert.equal(firstSession.runtimeConnection, null);

      const reorderedSession = new GoalBoardServer("runtime", null, {
        ...host,
        runtimeContext: {
          ...host.runtimeContext,
          stable_work_context_id: "fresh-session-ranking-only",
        },
        projectSuggestionClues: [
          { kind: "recent_project" as const, value: related.project_id },
          { kind: "workspace" as const, value: "/private/host-only-token/alpha" },
        ],
      });
      const reorderedResult = await call(reorderedSession, "goalboard_v1_context_resolve", {});
      assert.equal(reorderedResult.result.isError, false, reorderedResult.result.content[0]?.text);
      const reordered = JSON.parse(reorderedResult.result.content[0]?.text ?? "{}") as {
        status: string;
        connection: unknown;
        suggested_projects: Array<{ project_id: string }>;
      };
      assert.equal(reordered.status, "suggested");
      assert.equal(reordered.connection, null);
      assert.equal(reordered.suggested_projects[0]?.project_id, related.project_id);
      assert.equal(reorderedSession.runtimeConnection, null);

      const denied = await call(firstSession, "goalboard_v1_context_reject_suggestion", {
        project_id: primary.project_id,
        actor_id: "runtime-codex",
        user_confirmed: false,
      });
      assert.equal(denied.result.isError, true);
      assert.match(denied.result.content[0]?.text ?? "", /明确拒绝候选项目/);
      assert.equal(firstSession.runtimeConnection, null);

      const rejectedResult = await call(firstSession, "goalboard_v1_context_reject_suggestion", {
        project_id: primary.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
      });
      assert.equal(rejectedResult.result.isError, false, rejectedResult.result.content[0]?.text);
      const rejected = JSON.parse(rejectedResult.result.content[0]?.text ?? "{}") as {
        changed: boolean;
        resolution: { status: string; connection: unknown; suggested_projects: Array<{ project_id: string }> };
      };
      assert.equal(rejected.changed, true);
      assert.equal(rejected.resolution.status, "suggested");
      assert.equal(rejected.resolution.connection, null);
      assert.deepEqual(rejected.resolution.suggested_projects.map((project) => project.project_id), [
        related.project_id,
      ]);
      assert.equal(firstSession.runtimeConnection, null);

      const listed = await call(firstSession, "goalboard_v1_context_list_projects", {});
      assert.equal(listed.result.isError, false, listed.result.content[0]?.text);
      assert.match(listed.result.content[0]?.text ?? "", /"status": "suggested"/);
      assert.doesNotMatch(listed.result.content[0]?.text ?? "", /host-only-token/);

      const firstBound = await call(firstSession, "goalboard_v1_context_bind", {
        project_id: related.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
      });
      assert.equal(firstBound.result.isError, false, firstBound.result.content[0]?.text);
      assert.equal(firstSession.runtimeConnection?.boardId, related.board_id);

      const secondSession = new GoalBoardServer("runtime", null, {
        ...host,
        runtimeContext: {
          ...host.runtimeContext,
          stable_work_context_id: "fresh-session-b",
        },
      });
      const secondSuggested = await call(secondSession, "goalboard_v1_context_resolve", {});
      assert.equal(secondSuggested.result.isError, false, secondSuggested.result.content[0]?.text);
      assert.match(secondSuggested.result.content[0]?.text ?? "", new RegExp(primary.project_id));
      assert.equal(secondSession.runtimeConnection, null);

      const secondBound = await call(secondSession, "goalboard_v1_context_bind", {
        project_id: related.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
      });
      assert.equal(secondBound.result.isError, false, secondBound.result.content[0]?.text);
      assert.equal(secondSession.runtimeConnection?.boardId, related.board_id);
      assert.equal(firstSession.runtimeConnection?.boardId, related.board_id);
      assert.equal(fs.existsSync(related.database_path), true);
      const sharedSnapshot = await call(secondSession, "goalboard_v1_snapshot", { board_id: related.board_id });
      assert.equal(sharedSnapshot.result.isError, false, sharedSnapshot.result.content[0]?.text);
    } finally {
      catalog.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("lets the current Runtime list, unbind, and separately confirm project deletion", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "goalboard-mcp-project-lifecycle-"));
    const home = path.join(directory, "home", ".goalboard");
    const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: home });
    const call = async (server: GoalBoardServer, name: string, args: Record<string, unknown>) =>
      server.handleMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }) as Promise<{ result: { isError: boolean; content: Array<{ text: string }> } }>;
    try {
      const removable = await catalog.createProject({ display_name: "当前要删除的项目", actor_id: "user" });
      const preserved = await catalog.createProject({ display_name: "保留项目", actor_id: "user" });
      const host = {
        homeDirectory: home,
        runtimeContext: {
          runtime_id: "codex",
          stable_work_context_id: "project-lifecycle-entry",
          host_declares_stable: true,
        },
      };
      const runtime = new GoalBoardServer("runtime", null, host);

      const listed = await call(runtime, "goalboard_v1_context_list_projects", {});
      assert.equal(listed.result.isError, false, listed.result.content[0]?.text);
      const listedPayload = JSON.parse(listed.result.content[0]?.text ?? "{}") as {
        current_project: unknown;
        projects: Array<{ project_id: string; database_path?: string }>;
      };
      assert.equal(listedPayload.current_project, null);
      assert.deepEqual(listedPayload.projects.map((project) => project.project_id).sort(), [
        removable.project_id,
        preserved.project_id,
      ].sort());
      assert.ok(listedPayload.projects.every((project) => project.database_path === undefined));

      const bound = await call(runtime, "goalboard_v1_context_bind", {
        project_id: removable.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
      });
      assert.equal(bound.result.isError, false, bound.result.content[0]?.text);
      assert.equal(runtime.runtimeConnection?.boardId, removable.board_id);

      const deniedUnbind = await call(runtime, "goalboard_v1_context_unbind", {
        actor_id: "runtime-codex",
        user_confirmed: false,
      });
      assert.equal(deniedUnbind.result.isError, true);
      assert.match(deniedUnbind.result.content[0]?.text ?? "", /明确要求解除绑定/);
      assert.equal(runtime.runtimeConnection?.boardId, removable.board_id);

      const unbound = await call(runtime, "goalboard_v1_context_unbind", {
        actor_id: "runtime-codex",
        user_confirmed: true,
      });
      assert.equal(unbound.result.isError, false, unbound.result.content[0]?.text);
      const unboundPayload = JSON.parse(unbound.result.content[0]?.text ?? "{}") as {
        changed: boolean;
        unbound_project: { project_id: string } | null;
      };
      assert.equal(unboundPayload.changed, true);
      assert.equal(unboundPayload.unbound_project?.project_id, removable.project_id);
      assert.equal(runtime.runtimeConnection, null);
      assert.equal(fs.existsSync(removable.database_path), true);

      const rebound = await call(runtime, "goalboard_v1_context_bind", {
        project_id: removable.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
      });
      assert.equal(rebound.result.isError, false, rebound.result.content[0]?.text);
      assert.equal(runtime.runtimeConnection?.boardId, removable.board_id);

      const deniedDelete = await call(runtime, "goalboard_v1_project_delete", {
        project_id: removable.project_id,
        actor_id: "runtime-codex",
        delete_confirmed: false,
        idempotency_key: "mcp-delete-current-project",
      });
      assert.equal(deniedDelete.result.isError, true);
      assert.match(deniedDelete.result.content[0]?.text ?? "", /单独明确确认/);
      assert.equal(fs.existsSync(removable.database_path), true);

      const deleted = await call(runtime, "goalboard_v1_project_delete", {
        project_id: removable.project_id,
        actor_id: "runtime-codex",
        delete_confirmed: true,
        idempotency_key: "mcp-delete-current-project",
      });
      assert.equal(deleted.result.isError, false, deleted.result.content[0]?.text);
      const deletedPayload = JSON.parse(deleted.result.content[0]?.text ?? "{}") as {
        replayed: boolean;
        deletion: { project_id: string; deleted_binding_count: number; staged_directory?: string };
      };
      assert.equal(deletedPayload.replayed, false);
      assert.equal(deletedPayload.deletion.project_id, removable.project_id);
      assert.equal(deletedPayload.deletion.deleted_binding_count, 1);
      assert.equal(deletedPayload.deletion.staged_directory, undefined);
      assert.equal(runtime.runtimeConnection, null);
      assert.equal(fs.existsSync(removable.database_path), false);

      const replay = await call(runtime, "goalboard_v1_project_delete", {
        project_id: removable.project_id,
        actor_id: "runtime-codex",
        delete_confirmed: true,
        idempotency_key: "mcp-delete-current-project",
      });
      assert.equal(replay.result.isError, false, replay.result.content[0]?.text);
      assert.equal((JSON.parse(replay.result.content[0]?.text ?? "{}") as { replayed: boolean }).replayed, true);

      const resolved = await call(runtime, "goalboard_v1_context_resolve", {});
      assert.equal(resolved.result.isError, false, resolved.result.content[0]?.text);
      assert.match(resolved.result.content[0]?.text ?? "", /unknown_context/);
      const afterDelete = await call(runtime, "goalboard_v1_context_list_projects", {});
      assert.equal(afterDelete.result.isError, false, afterDelete.result.content[0]?.text);
      assert.match(afterDelete.result.content[0]?.text ?? "", new RegExp(preserved.project_id));
      assert.doesNotMatch(afterDelete.result.content[0]?.text ?? "", new RegExp(removable.project_id));
    } finally {
      catalog.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps project creation, a rough idea, Available selection, and an explicit Goal in one Runtime MCP flow", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "goalboard-mcp-skill-flow-"));
    const home = path.join(directory, "home", ".goalboard");
    const host = {
      homeDirectory: home,
      runtimeContext: {
        runtime_id: "codex",
        stable_work_context_id: "skill-flow-work-entry",
        host_declares_stable: true,
      },
      webBaseUrl: "https://goalboard.example/app/",
    };
    const management = new GoalBoardServer("management");
    const runtime = new GoalBoardServer("runtime", null, host);
    const call = async (server: GoalBoardServer, name: string, args: Record<string, unknown>) =>
      server.handleMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }) as Promise<{ result: { isError: boolean; content: Array<{ text: string }> } }>;
    try {
      const unboundResponse = await call(runtime, "goalboard_v1_context_resolve", {});
      assert.equal(unboundResponse.result.isError, false, unboundResponse.result.content[0]?.text);
      const unbound = JSON.parse(unboundResponse.result.content[0]?.text ?? "{}") as {
        status: string;
        connection: unknown;
        available_projects: unknown[];
      };
      assert.equal(unbound.status, "unbound");
      assert.equal(unbound.connection, null);
      assert.deepEqual(unbound.available_projects, []);

      const setupResponse = await call(runtime, "goalboard_v1_context_create_and_bind", {
        display_name: "Runtime 内的产品项目",
        actor_id: "runtime-codex",
        user_confirmed: true,
        idempotency_key: "skill-flow-create-and-bind",
      });
      assert.equal(setupResponse.result.isError, false, setupResponse.result.content[0]?.text);
      const setup = JSON.parse(setupResponse.result.content[0]?.text ?? "{}") as {
        status: string;
        connection: { project_id: string; board_id: string; database_path: string };
      };
      assert.equal(setup.status, "bound");
      assert.equal(runtime.runtimeConnection?.boardId, setup.connection.board_id);

      const createdLeaf = await call(management, "goalboard_v1_create_goal", {
        database_path: setup.connection.database_path,
        board_id: setup.connection.board_id,
        actor_id: "user-1",
        idempotency_key: "skill-flow-create-explicit-leaf",
        goal: {
          goal_id: "skill-flow-leaf",
          title: "当前 Runtime 可选择的叶子 Goal",
          outcome: "验证统一 Skill 的选择路径",
          why: "用户不应被切换到另一个 Runtime 或页面。",
          business_logic: "当前 Runtime 读取 Available 后直接选择这条可执行工作。",
          definition_state: "accepted",
          decomposition_state: "closed_leaf",
          acceptance_criteria: [
            {
              criterion_id: "skill-flow-leaf-criterion",
              statement: "当前 Runtime 原子领取并启动工作",
              decision_method: "automated_check",
              pass_condition: "select-goal 返回 Claim、Run 和执行中状态",
            },
          ],
        },
      });
      assert.equal(createdLeaf.result.isError, false, createdLeaf.result.content[0]?.text);

      const roughIdea = await call(runtime, "goalboard_v1_draft_dialogue_start", {
        board_id: setup.connection.board_id,
        actor_id: "runtime-codex",
        rough_idea: "我还想在当前 Runtime 里讨论一个新的 Goal。",
        idempotency_key: "skill-flow-rough-idea",
      });
      assert.equal(roughIdea.result.isError, false, roughIdea.result.content[0]?.text);
      const dialogue = JSON.parse(roughIdea.result.content[0]?.text ?? "{}") as {
        goal: { definition_state: string; decomposition_state: string };
        work_state: { work_state: string };
      };
      assert.equal(dialogue.goal.definition_state, "draft");
      assert.equal(dialogue.goal.decomposition_state, "abstract");
      assert.equal(dialogue.work_state.work_state, "clarifying");

      const availableResponse = await call(runtime, "goalboard_v1_available", {
        board_id: setup.connection.board_id,
        actor_id: "runtime-codex",
      });
      assert.equal(availableResponse.result.isError, false, availableResponse.result.content[0]?.text);
      const available = JSON.parse(availableResponse.result.content[0]?.text ?? "{}") as {
        available: Array<{ goal: { goal_id: string }; next_action: string }>;
      };
      assert.deepEqual(available.available.map((item) => [item.goal.goal_id, item.next_action]), [
        ["skill-flow-leaf", "execute"],
      ]);

      const selectedResponse = await call(runtime, "goalboard_v1_select_goal", {
        board_id: setup.connection.board_id,
        goal_id: "skill-flow-leaf",
        actor_id: "runtime-codex",
        idempotency_key: "skill-flow-select-explicit-goal",
      });
      assert.equal(selectedResponse.result.isError, false, selectedResponse.result.content[0]?.text);
      const selected = JSON.parse(selectedResponse.result.content[0]?.text ?? "{}") as {
        allowed: boolean;
        claim: { claim_id: string } | null;
        run: { run_id: string } | null;
        work_state: { work_state: string } | null;
      };
      assert.equal(selected.allowed, true);
      assert.ok(selected.claim);
      assert.ok(selected.run);
      assert.equal(selected.work_state?.work_state, "executing");

      const manualDraft = await call(management, "goalboard_v1_create_goal", {
        database_path: setup.connection.database_path,
        board_id: setup.connection.board_id,
        actor_id: "user-1",
        idempotency_key: "skill-flow-create-existing-draft",
        goal: {
          goal_id: "skill-flow-existing-draft",
          title: "用户手工建立、等待当前 Runtime 澄清的 Draft",
          outcome: "",
          why: "",
          business_logic: "",
          definition_state: "draft",
          decomposition_state: "abstract",
          acceptance_criteria: [],
        },
      });
      assert.equal(manualDraft.result.isError, false, manualDraft.result.content[0]?.text);

      const continuedDraftResponse = await call(runtime, "goalboard_v1_draft_dialogue_start", {
        board_id: setup.connection.board_id,
        goal_id: "skill-flow-existing-draft",
        actor_id: "runtime-codex",
        rough_idea: "用户要求当前 Runtime 直接在这次对话里继续澄清已有 Draft。",
        idempotency_key: "skill-flow-start-existing-draft",
      });
      assert.equal(
        continuedDraftResponse.result.isError,
        false,
        continuedDraftResponse.result.content[0]?.text,
      );
      const continuedDraft = JSON.parse(continuedDraftResponse.result.content[0]?.text ?? "{}") as {
        goal: { goal_id: string };
        dialogue: { session_id: string };
        work_state: { work_state: string };
      };
      assert.equal(continuedDraft.goal.goal_id, "skill-flow-existing-draft");
      assert.equal(continuedDraft.work_state.work_state, "clarifying");

      const resumedDraftResponse = await call(runtime, "goalboard_v1_draft_dialogue_resume", {
        board_id: setup.connection.board_id,
        goal_id: "skill-flow-existing-draft",
        actor_id: "runtime-codex",
        idempotency_key: "skill-flow-resume-existing-draft",
      });
      assert.equal(resumedDraftResponse.result.isError, false, resumedDraftResponse.result.content[0]?.text);
      const resumedDraft = JSON.parse(resumedDraftResponse.result.content[0]?.text ?? "{}") as {
        dialogue: { session_id: string };
      };
      assert.equal(resumedDraft.dialogue.session_id, continuedDraft.dialogue.session_id);

      const nextSession = new GoalBoardServer("runtime", null, host);
      const recoveredResponse = await call(nextSession, "goalboard_v1_context_resolve", {});
      assert.equal(recoveredResponse.result.isError, false, recoveredResponse.result.content[0]?.text);
      assert.match(recoveredResponse.result.content[0]?.text ?? "", new RegExp(setup.connection.project_id));
      assert.equal(nextSession.runtimeConnection?.boardId, setup.connection.board_id);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("lets the current Runtime recoverably trash and restore a Goal only after explicit user intent", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "goalboard-mcp-trash-"));
    const databasePath = path.join(directory, "goalboard.db");
    const boardId = "trash-mcp-board";
    const management = new GoalBoardServer("management");
    const runtime = new GoalBoardServer("runtime", {
      databasePath,
      boardId,
      webBaseUrl: "https://goalboard.example/app/",
    });
    const call = async (server: GoalBoardServer, name: string, args: Record<string, unknown>) =>
      server.handleMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }) as Promise<{ result: { isError: boolean; content: Array<{ text: string }> } }>;
    const goal = (goal_id: string, title: string) => ({
      goal_id,
      title,
      outcome: "当前 Runtime 可以通过 MCP 恢复这条 Goal",
      why: "删除不该让用户离开当前对话或丢失历史。",
      business_logic: "回收站操作复用共享领域服务，并保留原 Goal ID 与历史。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [
        {
          criterion_id: `${goal_id}-criterion`,
          statement: "回收站操作可被读取和恢复",
          decision_method: "automated_check",
          pass_condition: "MCP 返回共享服务的状态与关系摘要",
        },
      ],
    });
    try {
      const initialized = await call(management, "goalboard_v1_initialize", {
        database_path: databasePath,
        board_id: boardId,
        title: "MCP Trash Board",
        actor_id: "user-1",
        idempotency_key: "trash-mcp-init",
      });
      assert.equal(initialized.result.isError, false, initialized.result.content[0]?.text);
      for (const [goalId, title] of [
        ["trash-mcp-target", "可恢复删除目标"],
        ["trash-mcp-peer", "关联目标"],
        ["trash-mcp-busy", "仍在进行工作的 Goal"],
      ]) {
        const created = await call(management, "goalboard_v1_create_goal", {
          database_path: databasePath,
          board_id: boardId,
          actor_id: "user-1",
          idempotency_key: `create-${goalId}`,
          goal: goal(goalId, title),
        });
        assert.equal(created.result.isError, false, created.result.content[0]?.text);
      }
      const related = await call(management, "goalboard_v1_relation_add", {
        database_path: databasePath,
        board_id: boardId,
        payload: {
          relation: {
            from_goal_id: "trash-mcp-target",
            to_goal_id: "trash-mcp-peer",
            type: "extends",
            reason: "恢复后应保留原有 Relation",
          },
          actor_id: "user-1",
          idempotency_key: "trash-mcp-relation",
        },
      });
      assert.equal(related.result.isError, false, related.result.content[0]?.text);
      const relationId = (JSON.parse(related.result.content[0]?.text ?? "{}") as { relation_id: string })
        .relation_id;

      const noIntent = await call(runtime, "goalboard_v1_goal_trash", {
        board_id: boardId,
        payload: {
          goal_id: "trash-mcp-target",
          actor_id: "runtime-trash",
          user_confirmed: false,
          reason: "Runtime 不能猜测用户是否要删除",
          idempotency_key: "trash-mcp-without-intent",
        },
      });
      assert.equal(noIntent.result.isError, true);
      assert.match(noIntent.result.content[0]?.text ?? "", /明确要求移入回收站/);

      const untouched = await call(management, "goalboard_v1_snapshot", {
        database_path: databasePath,
        board_id: boardId,
      });
      const untouchedFacts = JSON.parse(untouched.result.content[0]?.text ?? "{}") as {
        goals: Array<{ goal_id: string; trashed_at: string | null }>;
        relations: Array<{ relation_id: string; state: string }>;
      };
      assert.equal(untouchedFacts.goals.find((item) => item.goal_id === "trash-mcp-target")?.trashed_at, null);
      assert.equal(untouchedFacts.relations.find((item) => item.relation_id === relationId)?.state, "active");

      const busyClaimResponse = await call(management, "goalboard_v1_claim", {
        database_path: databasePath,
        board_id: boardId,
        goal_id: "trash-mcp-busy",
        actor_id: "runtime-busy",
        idempotency_key: "trash-mcp-busy-claim",
      });
      assert.equal(busyClaimResponse.result.isError, false, busyClaimResponse.result.content[0]?.text);
      const busyClaim = JSON.parse(busyClaimResponse.result.content[0]?.text ?? "{}") as {
        claim: { claim_id: string } | null;
      };
      assert.ok(busyClaim.claim);
      const blockedResponse = await call(runtime, "goalboard_v1_goal_trash", {
        board_id: boardId,
        payload: {
          goal_id: "trash-mcp-busy",
          actor_id: "runtime-trash",
          user_confirmed: true,
          reason: "用户明确要求删除，但活动工作应先保护",
          idempotency_key: "trash-mcp-busy-blocked",
        },
      });
      assert.equal(blockedResponse.result.isError, false, blockedResponse.result.content[0]?.text);
      const blocked = JSON.parse(blockedResponse.result.content[0]?.text ?? "{}") as {
        status: string;
        goal: { trashed_at: string | null };
        blocking_claim_ids: string[];
        work_state: { work_state: string };
        next_action: { kind: string } | null;
      };
      assert.equal(blocked.status, "blocked");
      assert.equal(blocked.goal.trashed_at, null);
      assert.deepEqual(blocked.blocking_claim_ids, [busyClaim.claim!.claim_id]);
      assert.equal(blocked.work_state.work_state, "execution_blocked");
      assert.equal(blocked.next_action?.kind, "finish_active_work");

      const trashedResponse = await call(runtime, "goalboard_v1_goal_trash", {
        board_id: boardId,
        payload: {
          goal_id: "trash-mcp-target",
          actor_id: "runtime-trash",
          user_confirmed: true,
          reason: "用户明确要求暂时移入回收站",
          idempotency_key: "trash-mcp-confirmed",
        },
      });
      assert.equal(trashedResponse.result.isError, false, trashedResponse.result.content[0]?.text);
      const trashed = JSON.parse(trashedResponse.result.content[0]?.text ?? "{}") as {
        status: string;
        goal: { goal_id: string; trashed_at: string | null };
        deactivated_relation_ids: string[];
        work_state: { work_state: string };
        next_action: { kind: string } | null;
        replayed: boolean;
      };
      assert.equal(trashed.status, "trashed");
      assert.equal(trashed.goal.goal_id, "trash-mcp-target");
      assert.notEqual(trashed.goal.trashed_at, null);
      assert.deepEqual(trashed.deactivated_relation_ids, [relationId]);
      assert.equal(trashed.work_state.work_state, "trashed");
      assert.equal(trashed.next_action?.kind, "report_recoverable_trash");
      assert.equal(trashed.replayed, false);

      const replayedTrash = await call(runtime, "goalboard_v1_goal_trash", {
        board_id: boardId,
        payload: {
          goal_id: "trash-mcp-target",
          actor_id: "runtime-trash",
          user_confirmed: true,
          reason: "用户明确要求暂时移入回收站",
          idempotency_key: "trash-mcp-confirmed",
        },
      });
      const replayedTrashResult = JSON.parse(replayedTrash.result.content[0]?.text ?? "{}") as {
        status: string;
        replayed: boolean;
      };
      assert.equal(replayedTrash.result.isError, false, replayedTrash.result.content[0]?.text);
      assert.equal(replayedTrashResult.status, "trashed");
      assert.equal(replayedTrashResult.replayed, true);

      const listed = await call(runtime, "goalboard_v1_goal_trash_list", {
        board_id: boardId,
        payload: {},
      });
      assert.equal(listed.result.isError, false, listed.result.content[0]?.text);
      const trashList = JSON.parse(listed.result.content[0]?.text ?? "{}") as {
        goals: Array<{ goal_id: string; trashed_at: string | null }>;
      };
      assert.deepEqual(trashList.goals.map((item) => item.goal_id), ["trash-mcp-target"]);
      assert.notEqual(trashList.goals[0]?.trashed_at, null);

      const wrongBoard = await call(runtime, "goalboard_v1_goal_trash_list", {
        board_id: "another-board",
        payload: {},
      });
      assert.equal(wrongBoard.result.isError, true);
      assert.match(wrongBoard.result.content[0]?.text ?? "", /必须使用宿主固定的 board_id/);

      const restoredResponse = await call(runtime, "goalboard_v1_goal_restore", {
        board_id: boardId,
        payload: {
          goal_id: "trash-mcp-target",
          actor_id: "runtime-trash",
          user_confirmed: true,
          reason: "用户明确要求恢复原 Goal",
          idempotency_key: "trash-mcp-restore",
        },
      });
      assert.equal(restoredResponse.result.isError, false, restoredResponse.result.content[0]?.text);
      const restored = JSON.parse(restoredResponse.result.content[0]?.text ?? "{}") as {
        status: string;
        goal: { goal_id: string; trashed_at: string | null };
        restored_relation_ids: string[];
        pending_relation_ids: string[];
        work_state: { work_state: string };
        next_action: { kind: string } | null;
      };
      assert.equal(restored.status, "restored");
      assert.equal(restored.goal.goal_id, "trash-mcp-target");
      assert.equal(restored.goal.trashed_at, null);
      assert.deepEqual(restored.restored_relation_ids, [relationId]);
      assert.deepEqual(restored.pending_relation_ids, []);
      assert.equal(restored.work_state.work_state, "execution_pending");
      assert.equal(restored.next_action?.kind, "read_goal_contract");

      const restoredContract = await call(runtime, "goalboard_v1_contract", {
        board_id: boardId,
        goal_id: "trash-mcp-target",
      });
      assert.equal(restoredContract.result.isError, false, restoredContract.result.content[0]?.text);
      const contract = JSON.parse(restoredContract.result.content[0]?.text ?? "{}") as {
        goal: { goal_id: string; trashed_at: string | null };
      };
      assert.equal(contract.goal.goal_id, "trash-mcp-target");
      assert.equal(contract.goal.trashed_at, null);

      const alreadyActive = await call(runtime, "goalboard_v1_goal_restore", {
        board_id: boardId,
        payload: {
          goal_id: "trash-mcp-target",
          actor_id: "runtime-trash",
          user_confirmed: true,
          reason: "重复恢复保持幂等",
          idempotency_key: "trash-mcp-restore-repeat",
        },
      });
      const alreadyActiveResult = JSON.parse(alreadyActive.result.content[0]?.text ?? "{}") as {
        status: string;
        next_action: unknown;
      };
      assert.equal(alreadyActive.result.isError, false, alreadyActive.result.content[0]?.text);
      assert.equal(alreadyActiveResult.status, "already_active");
      assert.equal(alreadyActiveResult.next_action, null);

      const finalFacts = await call(management, "goalboard_v1_snapshot", {
        database_path: databasePath,
        board_id: boardId,
      });
      const finalSnapshot = JSON.parse(finalFacts.result.content[0]?.text ?? "{}") as {
        relations: Array<{ relation_id: string; state: string }>;
      };
      assert.equal(finalSnapshot.relations.find((item) => item.relation_id === relationId)?.state, "active");
      const mcpSource = fs.readFileSync(path.join(ROOT, "src/mcp/server.ts"), "utf8");
      assert.match(mcpSource, /coordinator\.setGoalTrashed/);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects user-authority calls even when a Runtime invokes an unlisted tool directly", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "goalboard-mcp-authority-"));
    const databasePath = path.join(directory, "goalboard.db");
    const management = new GoalBoardServer("management");
    const runtime = new GoalBoardServer("runtime", {
      databasePath,
      boardId: "authority-board",
      webBaseUrl: "http://127.0.0.1:4173",
    });
    const call = async (server: GoalBoardServer, name: string, args: Record<string, unknown>) =>
      server.handleMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }) as Promise<{ result: { isError: boolean; content: Array<{ text: string }> } }>;
    try {
      const initialized = await call(management, "goalboard_v1_initialize", {
        database_path: databasePath,
        board_id: "authority-board",
        title: "Authority Board",
        actor_id: "user-1",
        idempotency_key: "authority-init",
      });
      assert.equal(initialized.result.isError, false);

      for (const [name, args] of [
        ["goalboard_v1_create_goal", { goal: {}, actor_id: "runtime-a", idempotency_key: "deny-create" }],
        ["goalboard_v1_relation_add", { payload: {} }],
        ["goalboard_v1_contract_decide", { payload: { actor_kind: "user" } }],
        ["goalboard_v1_candidate_decide", { payload: { actor_kind: "user" } }],
        ["goalboard_v1_rewire_confirm", { payload: { actor_kind: "user" } }],
      ] as Array<[string, Record<string, unknown>]>) {
        const denied = await call(runtime, name, {
          database_path: databasePath,
          board_id: "authority-board",
          ...args,
        });
        assert.equal(denied.result.isError, true, name);
        assert.match(denied.result.content[0]?.text ?? "", /只允许用户或管理入口/);
      }

      const impersonatedReview = await call(runtime, "goalboard_v1_review_submit", {
        board_id: "authority-board",
        payload: { actor_kind: "user" },
      });
      assert.equal(impersonatedReview.result.isError, true);
      assert.match(impersonatedReview.result.content[0]?.text ?? "", /不能声明 actor_kind=user/);

      const databaseOverride = await call(runtime, "goalboard_v1_snapshot", {
        database_path: path.join(directory, "another.db"),
        board_id: "authority-board",
      });
      assert.equal(databaseOverride.result.isError, true);
      assert.match(databaseOverride.result.content[0]?.text ?? "", /不能覆盖宿主固定的 SQLite/);

      const boardOverride = await call(runtime, "goalboard_v1_snapshot", {
        board_id: "another-board",
      });
      assert.equal(boardOverride.result.isError, true);
      assert.match(boardOverride.result.content[0]?.text ?? "", /必须使用宿主固定的 board_id authority-board/);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("links a desktop panel host threadId onto the same project binding", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "goalboard-mcp-panel-"));
    const home = path.join(directory, "home", ".goalboard");
    const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: home });
    const call = async (
      server: GoalBoardServer,
      name: string,
      args: Record<string, unknown>,
      meta?: Record<string, string>,
    ) =>
      server.handleMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args, ...(meta ? { _meta: meta } : {}) },
      }) as Promise<{ result: { isError: boolean; content: Array<{ text: string }> } }>;
    try {
      const project = await catalog.createProject({ display_name: "面板项目", actor_id: "user" });
      const panel = catalog.openDesktopPanel({
        project_id: project.project_id,
        goal_id: "panel-goal",
        runtime_kind: "codex",
        launch_command: "codex",
        actor_id: "user",
        user_confirmed: true,
      });
      const host = {
        homeDirectory: home,
        runtimeContext: {
          runtime_id: "codex",
          stable_work_context_id: panel.work_context_id,
          host_declares_stable: true,
        },
        panelId: panel.panel_id,
      };
      const runtime = new GoalBoardServer("runtime", null, host);
      const resolved = await call(runtime, "goalboard_v1_context_resolve", {}, { threadId: "live-codex-thread" });
      assert.equal(resolved.result.isError, false, resolved.result.content[0]?.text);
      const payload = JSON.parse(resolved.result.content[0]?.text ?? "{}") as {
        status: string;
        connection?: { project_id: string };
      };
      assert.equal(payload.status, "bound");
      assert.equal(payload.connection?.project_id, project.project_id);
      catalog.close();
      const reopened = await GoalBoardProjectCatalog.open({ homeDirectory: home });
      try {
        assert.equal(
          reopened.findDesktopPanelByWorkContext("codex", "live-codex-thread")?.panel_id,
          panel.panel_id,
        );
        assert.equal(
          reopened.resolveRuntimeContext({
            runtime_id: "codex",
            stable_work_context_id: "live-codex-thread",
            host_declares_stable: true,
          }).project?.project_id,
          project.project_id,
        );
      } finally {
        reopened.close();
      }
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});

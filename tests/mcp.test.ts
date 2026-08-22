import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
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
    assert.ok(names.includes("goalboard_v1_goal_tree_read"));
    assert.ok(names.includes("goalboard_v1_goal_tree_check"));
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

  it("Runtime Skill gives the current Runtime one project-aware MCP flow and preserves authority boundaries", () => {
    const skill = fs.readFileSync(path.join(ROOT, "skills/goal-advance/SKILL.md"), "utf8");
    const protocol = fs.readFileSync(
      path.join(ROOT, "skills/goal-advance/references/protocol.md"),
      "utf8",
    );
    const serviceStart = fs.readFileSync(
      path.join(ROOT, "skills/goal-advance/references/service-start.md"),
      "utf8",
    );
    assert.match(skill, /one public GoalBoard entry for the Runtime currently talking with the user/);
    assert.match(skill, /For every Goal lifecycle operation, use only the host-provided `goalboard_v1_\*` Runtime MCP tools/);
    assert.match(skill, /“启动 GoalBoard” or “打开 GoalBoard”/);
    assert.match(skill, /Only use the foreground `goalboard-web` launcher when the user explicitly says “临时打开 GoalBoard”/);
    assert.match(skill, /Starting Web does not select a project or authorize any Goal change/);
    assert.match(skill, /does not open another Runtime, dispatch a separate Session/);
    assert.match(skill, /edit the user's project files/);
    assert.match(skill, /Never infer a project from Git, a directory, a repository name/);
    assert.match(skill, /`goalboard_v1_context_resolve`/);
    assert.match(skill, /`goalboard_v1_context_list_projects`/);
    assert.match(skill, /`goalboard_v1_context_reject_suggestion`/);
    assert.match(skill, /`goalboard_v1_context_bind`/);
    assert.match(skill, /`goalboard_v1_context_unbind`/);
    assert.match(skill, /`goalboard_v1_context_create_and_bind`/);
    assert.match(skill, /`goalboard_v1_project_delete`/);
    assert.doesNotMatch(skill, /goalboard_v1_postinstall_project_selection/);
    assert.match(skill, /rebind_confirmed=true/);
    assert.match(skill, /result is `suggested`/);
    assert.match(skill, /Silence, a timeout, an ambiguous answer, or “not now” is not confirmation/);
    assert.match(skill, /new rough idea/);
    assert.match(skill, /Continue a specified Draft/);
    assert.match(skill, /reuses the existing Draft rather than creating a second Goal/);
    assert.match(skill, /“继续推进” or “领一件能做的”/);
    assert.match(skill, /GoalBoard does not return a unique next task/);
    assert.match(skill, /`available → select_goal`/);
    assert.match(skill, /`requires_parent_confirmation=true`/);
    assert.match(skill, /whether they cover the whole parent/);
    assert.match(skill, /Do not silently close the parent or skip to unrelated work/);
    assert.match(skill, /Put unexpected results back into the Goal lifecycle/);
    assert.match(skill, /do not submit passing Evidence or call `complete`/);
    assert.match(skill, /An observed failure is not a Risk substitute/);
    assert.match(skill, /Candidate or Goal Tree Proposal for a corrective Goal/);
    assert.match(skill, /goalboard_v1_draft_dialogue_start/);
    assert.match(skill, /goalboard_v1_draft_dialogue_turn/);
    assert.match(skill, /goalboard_v1_draft_dialogue_resume/);
    assert.match(skill, /goalboard_v1_goal_tree_propose/);
    assert.match(skill, /goalboard_v1_goal_tree_check/);
    assert.match(skill, /Web is optional/);
    assert.match(skill, /never invent a user identity, Session ID/);
    assert.match(skill, /does not mean a different Runtime or a different Session must take over/);
    assert.match(skill, /child Goal may itself have finer child Goals/);
    assert.match(skill, /return to the user's original outcome/);
    assert.match(skill, /A game also covers gameplay/);
    assert.match(skill, /An App covers its core function/);
    assert.match(skill, /One well-scoped child may own several areas/);
    assert.match(skill, /never present a staged pause as a finished tree/);
    assert.match(skill, /`waiting_children` \(UI: “已澄清，等待子 Goal”\)/);
    assert.match(skill, /`execution_pending` \(“待执行”\)/);
    assert.match(skill, /`clarification_pending` \(“待澄清”\)/);
    assert.match(skill, /second mutable “clarification complete” field/);
    assert.match(skill, /goalboard_v1_revalidate/);
    assert.match(skill, /goalboard_v1_goal_trash/);
    assert.match(skill, /goalboard_v1_goal_trash_list/);
    assert.match(skill, /goalboard_v1_goal_restore/);
    assert.match(skill, /Goal 删除是可恢复的“移入回收站”/);
    assert.match(skill, /cannot substitute for a required human approval/);
    assert.match(protocol, /Project connection: explicit and user-led/);
    assert.match(protocol, /context_reject_suggestion\(project_id, actor_id, user_confirmed=true\)/);
    assert.match(protocol, /host-owned clues changed candidate order, but GoalBoard returns no project connection/);
    assert.match(protocol, /Project lifecycle in the current conversation/);
    assert.match(protocol, /context_unbind\(actor_id, user_confirmed=true\)/);
    assert.match(protocol, /project_delete\(project_id, actor_id, delete_confirmed=true, idempotency_key\)/);
    assert.match(protocol, /valid Claims and unfinished Runs/);
    assert.match(protocol, /context_create_and_bind/);
    assert.match(protocol, /does not write SQLite, call the management CLI, alter project files, or alter Runtime configuration/);
    assert.match(protocol, /reuses the Draft, atomically creates its first clarifier Claim\/Run/);
    assert.match(protocol, /current Runtime chooses one returned item/);
    assert.match(protocol, /A successful result always includes its Claim and started Run/);
    assert.match(protocol, /The tree can include a compound parent, a family of children, and children split more finely again/);
    assert.match(protocol, /perform a result-chain pass/);
    assert.match(protocol, /decomposition_review/);
    assert.match(protocol, /Do not call any plan complete/);
    assert.match(protocol, /GoalBoard has one derived work state, not a second “clarification complete” flag/);
    assert.match(protocol, /a confirmed parent with child Goals must show “已澄清，等待子 Goal”, not “待澄清”/);
    assert.match(protocol, /auditable local provenance, not a cryptographic trust boundary/);
    assert.match(protocol, /Recoverable Goal deletion in the current conversation/);
    assert.match(protocol, /setGoalTrashed\(trashed=true\)/);
    assert.match(protocol, /user_confirmed=true/);
    assert.match(protocol, /pending_relation_ids/);
    assert.match(protocol, /do not create another Board, change configuration, swap databases, or use a CLI fallback/);
    assert.match(serviceStart, /service status --home "\$HOME\/\.goalboard" --json/);
    assert.match(serviceStart, /关闭终端后页面仍会运行，登录后会自动启动/);
    assert.match(serviceStart, /`stopped`.*`service start --confirm`/s);
    assert.match(serviceStart, /`unhealthy`.*`service restart --confirm`/s);
    assert.match(serviceStart, /`needs_repair`.*explicit confirmation/s);
    assert.match(serviceStart, /`unsupported`.*no GoalBoard system-level persistent-service integration/s);
    assert.match(serviceStart, /Do not add `nohup`, `&`, `disown`/);
    assert.match(serviceStart, /Goal lifecycle remains available only through host-provided `goalboard_v1_\*` MCP tools/);
    assert.doesNotMatch(skill, /GOALBOARD_DATABASE/);
    assert.doesNotMatch(protocol, /GOALBOARD_DATABASE/);
    assert.doesNotMatch(serviceStart, /GOALBOARD_DATABASE/);
  });

  it("Runtime Skill defines natural, resumable, and structured forward conversations", () => {
    const skill = fs.readFileSync(path.join(ROOT, "skills/goal-advance/SKILL.md"), "utf8");
    const protocol = fs.readFileSync(
      path.join(ROOT, "skills/goal-advance/references/protocol.md"),
      "utf8",
    );
    assert.ok(skill.split("\n").length <= 500);
    assert.match(skill, /Reply in the user's current language/);
    assert.match(skill, /what you currently understand from the user's words/);
    assert.match(skill, /why the remaining uncertainty matters/);
    assert.match(skill, /Ask only one question at a time/);
    assert.match(skill, /never walk the user through a Contract field checklist/);
    assert.match(skill, /two or three genuinely different options/);
    assert.match(skill, /Write persistent Goal content for the people who will read it later/);
    assert.match(skill, /check every parent, child, and leaf Goal/);
    assert.match(skill, /`business_logic` explains in plain language how the user experience or business process works/);
    assert.match(skill, /Do not use a database, MCP method, Session Resolver, Claim, Run, adapter, class, or internal module name as a substitute/);
    assert.match(skill, /实现 MCP Session Context Resolver/);
    assert.match(skill, /让新用户安装后能在当前对话完成 GoalBoard 配置/);
    assert.match(skill, /A technically precise but user-incomprehensible title or `business_logic` is not proposal-ready/);
    assert.match(skill, /If those business fields still read like implementation shorthand/);
    assert.match(skill, /When reporting progress, lead with the business result, current stage, next owner\/action, and any blocker/);
    assert.match(skill, /Treat a correction as new authority/);
    assert.match(skill, /\*\*已确认\*\*/);
    assert.match(skill, /\*\*项目事实\*\*/);
    assert.match(skill, /\*\*仍是我的假设\*\*/);
    assert.match(skill, /\*\*我的建议\*\*/);
    assert.match(skill, /must remain distinct in both the visible summary and the MCP payload/);
    assert.match(skill, /persist every material answer with `goalboard_v1_draft_dialogue_turn`/);
    assert.match(skill, /它只是候选，还没有关联/);
    assert.match(skill, /上次已确认 \/ 仍待确认 \/ 现在只需要决定的一件事/);
    assert.match(skill, /After selecting from Available, state which Goal you chose, why it fits/);
    assert.match(skill, /user-visible summary must show/);
    assert.match(skill, /what work state each affected Goal will have after confirmation/);
    assert.match(skill, /confirm the whole named proposal, reject it, or revise specific named items/);
    assert.match(skill, /Before proposing any `accepted \/ closed_leaf` Goal/);
    assert.match(skill, /one `primary_deliverable`/);
    assert.match(skill, /separately deliverable, separately acceptable, and independently reworkable/);
    assert.match(skill, /at least two signals are true, split it into another Goal/);
    assert.match(skill, /same five-part result chain for every task/);
    assert.match(skill, /AI or data work covers data sources and quality, evaluation, runtime\/cost, and safety\/governance/);
    assert.match(skill, /Content or research covers source provenance/);
    assert.match(skill, /Operations covers roles, permissions, tools\/workflow, exceptions, and measurement/);
    assert.match(skill, /add a dependency from the core Goal to the foundation Goal/);
    assert.match(skill, /`task_context=game\|app\|ai_data\|content_research\|operations\|other`/);
    assert.match(protocol, /Persist first, then continue the conversation/);
    assert.match(protocol, /Available sets `requires_parent_confirmation=true`/);
    assert.match(protocol, /Unexpected result and corrective work/);
    assert.match(protocol, /The first clarification checkpoint must produce readable values for the existing Goal fields/);
    assert.match(protocol, /Before `goal_tree_propose`, scan every proposed parent, child, and leaf Goal for readability/);
    assert.match(protocol, /lead with the Goal's business problem\/value, expected result, current derived `work_state`, next owner\/action, and blockers or dependencies/);
    assert.match(protocol, /Do not ask a new question and postpone persistence/);
    assert.match(protocol, /If the call fails, say that the progress was not saved and stop/);
    assert.match(protocol, /The immediately preceding proposal message must be decision-complete/);
    assert.match(protocol, /A vague “可以”“继续” is whole confirmation only when/);
    assert.match(protocol, /Every proposed `accepted \/ closed_leaf` Goal also includes an explicit readiness decision/);
    assert.match(protocol, /output_coverage/);
    assert.match(protocol, /split_candidates/);
    assert.match(protocol, /Two or more true signals require `decision=split`/);
    assert.match(protocol, /Every new proposal accounts for `final_outcome`, `operating_flow`, `core_capabilities`, `foundation_infrastructure`, and `quality_continuous_delivery`/);
    assert.match(protocol, /task_context: game \| app \| ai_data \| content_research \| operations \| other/);
    assert.match(protocol, /Historical `product_context=game\|app\|other` remains readable/);
    assert.match(protocol, /Footballnia is one game regression example, not the rule's boundary/);
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

  it("serves one filtered V1 Goal Contract with a stable Web URL", async () => {
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

      const availableResponse = await call(runtime, "goalboard_v1_available", {
        board_id: "mcp-board",
        actor_id: "runtime-a",
      });
      assert.equal(availableResponse.result.isError, false, availableResponse.result.content[0]?.text);
      const available = JSON.parse(availableResponse.result.content[0].text) as {
        available: Array<{ goal: { goal_id: string }; next_action: string; role: string }>;
      };
      assert.deepEqual(available.available.map((item) => [item.goal.goal_id, item.next_action, item.role]), [
        ["goal/with space", "execute", "executor"],
      ]);

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
        connection: { project_id: string; board_id: string; database_path: string; web_base_url: string };
      };
      assert.equal(bound.status, "bound");
      assert.equal(bound.connection.project_id, first.project_id);
      assert.equal(bound.connection.board_id, first.board_id);
      assert.equal(bound.connection.database_path, first.database_path);
      assert.equal(bound.connection.web_base_url, "https://goalboard.example/app/");
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
        connection: { project_id: string; board_id: string };
      };
      assert.equal(restored.status, "bound");
      assert.equal(restored.connection.project_id, first.project_id);
      assert.equal(restored.connection.board_id, first.board_id);

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

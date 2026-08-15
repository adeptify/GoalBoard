import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { GoalBoardServer } from "../src/mcp/server.js";

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
    assert.equal(
      (init as { result: { serverInfo: { name: string } } }).result.serverInfo.name,
      "goalboard-mcp",
    );
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
            };
          }>;
        };
      }
    ).result.tools;
    const names = listedTools.map((t) => t.name);
    assert.ok(names.includes("goalboard_v1_contract"));
    assert.ok(names.includes("goalboard_v1_contract_propose"));
    assert.ok(names.includes("goalboard_v1_candidate_submit"));
    assert.ok(names.includes("goalboard_v1_dependency_propose"));
    assert.ok(names.includes("goalboard_v1_evidence_submit"));
    assert.ok(names.includes("goalboard_v1_review_submit"));
    assert.ok(names.includes("goalboard_v1_revalidate"));
    assert.ok(!names.includes("goalboard_v1_create_goal"));
    assert.ok(!names.includes("goalboard_v1_candidate_decide"));
    assert.ok(!names.includes("goalboard_v1_contract_decide"));
    assert.ok(!names.includes("goalboard_v1_rewire_confirm"));
    assert.ok(!names.includes("goalboard_v1_relation_add"));
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
    assert.ok(managementNames.includes("goalboard_v1_import_v3"));
    assert.ok(managementNames.every((name) => name.startsWith("goalboard_v1_")));
  });

  it("Runtime Skill requires a host-started single truth source and preserves authority boundaries", () => {
    const skill = fs.readFileSync(path.join(ROOT, "skills/goal-advance/SKILL.md"), "utf8");
    const protocol = fs.readFileSync(
      path.join(ROOT, "skills/goal-advance/references/protocol.md"),
      "utf8",
    );
    assert.match(skill, /default MCP audience is `runtime`/);
    assert.match(skill, /Starting GoalBoard is a host responsibility, not Runtime work/);
    assert.match(skill, /same absolute SQLite database and the same `board_id`/);
    assert.match(skill, /open or request the exact returned `goal_url`/);
    assert.match(skill, /If MCP or Web is unavailable.*stop and report the mismatch/);
    assert.match(skill, /Never start or restart GoalBoard services/);
    assert.match(skill, /Do not repair the service pair from inside the Runtime/);
    assert.match(skill, /goalboard_v1_contract_propose/);
    assert.match(skill, /goalboard_v1_contract_decide/);
    assert.match(skill, /use CLI as a fallback/);
    assert.match(skill, /create a canonical Goal, including an initial `draft \/ abstract` Goal/);
    assert.match(skill, /separately confirm\/reject a Rewire/);
    assert.match(skill, /Choose `role=revalidator`/);
    assert.match(skill, /goalboard_v1_revalidate/);
    assert.match(skill, /permits `actor_kind=user`, treat that host as misconfigured/);
    assert.match(protocol, /GOALBOARD_MCP_AUDIENCE=runtime/);
    assert.match(protocol, /MCP process and Web process must use the same absolute SQLite path and `board_id`/);
    assert.match(protocol, /Contract path must equal the returned `goal_url`/);
    assert.match(protocol, /Runtime stops and reports the failed check/);
    assert.match(protocol, /direct override attempts are rejected/);
    assert.match(protocol, /launch a new instance/);
    assert.match(protocol, /field_source/);
    assert.match(protocol, /accept a Candidate Goal and then reject its proposed Rewire/);
    assert.match(protocol, /Only a started Run owned by the active `revalidator` Claim/);
    assert.match(protocol, /leaves the Goal in `needs_revalidation`/);
    assert.doesNotMatch(skill, /If they are unavailable, use the equivalent CLI/);
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
});

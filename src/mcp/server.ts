#!/usr/bin/env node
/** GoalBoard V1 MCP Server：stdio JSON-RPC。 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { GoalBoardCoordinator, GoalBoardV1Error } from "../v1/coordinator.js";
import { SqliteGoalBoardStore } from "../v1/store.js";
import type { ClaimRequest, CreateGoalInput } from "../v1/types.js";
import { importV3Board, type LegacyV3ImportInput } from "../v1/migration.js";

const SERVER_INFO = { name: "goalboard-mcp", version: "1.0.0" };

const V1_COMMON = {
  database_path: { type: "string", description: "共享 SQLite 文件路径；默认读取 GOALBOARD_DATABASE" },
  board_id: { type: "string" },
};

const V1_CLAIM_ROLE = {
  type: "string",
  enum: ["clarifier", "executor", "cross_reviewer", "adversarial_reviewer", "revalidator"],
};

const V1_STRING = { type: "string" };
const V1_STRING_ARRAY = { type: "array", items: V1_STRING };

export type GoalBoardMcpAudience = "runtime" | "management";

export interface GoalBoardRuntimeConnection {
  databasePath: string;
  boardId: string;
  webBaseUrl: string;
}

interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

function v1PayloadTool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
) {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        payload: { type: "object", properties, required },
      },
      required: ["board_id", "payload"],
    },
  };
}

const V1_TOOLS: McpToolDefinition[] = [
  {
    name: "goalboard_v1_initialize",
    description: "初始化 SQLite GoalBoard 真相源。",
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        title: { type: "string" },
        actor_id: { type: "string" },
        idempotency_key: { type: "string" },
      },
      required: ["board_id", "title", "actor_id", "idempotency_key"],
    },
  },
  {
    name: "goalboard_v1_create_goal",
    description: "创建 Goal；所有 Goal 需要业务逻辑，可执行叶子还必须有明确验收条件。",
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        goal: { type: "object" },
        actor_id: { type: "string" },
        reason: { type: "string" },
        idempotency_key: { type: "string" },
      },
      required: ["board_id", "goal", "actor_id", "idempotency_key"],
    },
  },
  {
    name: "goalboard_v1_snapshot",
    description: "读取 GoalBoard 当前真相快照。",
    inputSchema: {
      type: "object",
      properties: V1_COMMON,
      required: ["board_id"],
    },
  },
  {
    name: "goalboard_v1_contract",
    description:
      "读取一个 Goal 的完整 Contract、关系、风险、执行事实和可供用户打开的稳定页面地址。",
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        goal_id: { type: "string" },
        web_base_url: {
          type: "string",
          description: "GoalBoard Web 根地址；默认读取 GOALBOARD_WEB_URL 或 http://127.0.0.1:4173",
        },
      },
      required: ["board_id", "goal_id"],
    },
  },
  {
    name: "goalboard_v1_ready",
    description: "返回 Runtime 可自主选择并领取的 Ready Goals。",
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        actor_id: { type: "string" },
        role: V1_CLAIM_ROLE,
        capabilities: { type: "array", items: { type: "string" } },
        goal_mode_attestation: { type: "boolean" },
      },
      required: ["board_id", "actor_id"],
    },
  },
  {
    name: "goalboard_v1_explain",
    description: "解释一个 Goal 为什么现在可做或被什么阻塞。",
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        goal_id: { type: "string" },
        actor_id: { type: "string" },
        role: V1_CLAIM_ROLE,
        capabilities: { type: "array", items: { type: "string" } },
        goal_mode_attestation: { type: "boolean" },
      },
      required: ["board_id", "goal_id", "actor_id"],
    },
  },
  {
    name: "goalboard_v1_claim",
    description: "Runtime 原子领取自己选择的 Ready Goal；GoalBoard 不分发任务。",
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        goal_id: { type: "string" },
        actor_id: { type: "string" },
        role: V1_CLAIM_ROLE,
        capabilities: { type: "array", items: { type: "string" } },
        goal_mode_attestation: { type: "boolean" },
        lease_seconds: { type: "integer" },
        strengthen_policy: { type: "object" },
        idempotency_key: { type: "string" },
      },
      required: ["board_id", "goal_id", "actor_id", "idempotency_key"],
    },
  },
  v1PayloadTool(
    "goalboard_v1_release",
    "由领取者释放 Claim。",
    { claim_id: V1_STRING, actor_id: V1_STRING, reason: V1_STRING, idempotency_key: V1_STRING },
    ["claim_id", "actor_id", "reason", "idempotency_key"],
  ),
  v1PayloadTool(
    "goalboard_v1_relation_add",
    "登记 Goal 关系；Runtime 发现的新关系应优先随 Candidate 提议。",
    {
      relation: {
        type: "object",
        properties: {
          from_goal_id: V1_STRING,
          to_goal_id: V1_STRING,
          type: {
            type: "string",
            enum: ["part_of", "depends_on", "conflicts_with", "mitigates", "extends", "replaces", "corrects", "invalidates", "migrates_from"],
          },
          state: { type: "string", enum: ["proposed", "active"] },
          reason: V1_STRING,
        },
        required: ["from_goal_id", "to_goal_id", "type", "reason"],
      },
      actor_id: V1_STRING,
      idempotency_key: V1_STRING,
    },
    ["relation", "actor_id", "idempotency_key"],
  ),
  v1PayloadTool(
    "goalboard_v1_impact_add",
    "登记 Goal 的 Impact Surface。",
    {
      impact: {
        type: "object",
        properties: {
          goal_id: V1_STRING,
          surface: V1_STRING,
          access: { type: "string", enum: ["read", "write", "decide", "exclusive"] },
          input_snapshot: { type: ["string", "null"] },
          state: { type: "string", enum: ["proposed", "confirmed"] },
          reason: V1_STRING,
        },
        required: ["goal_id", "surface", "access", "reason"],
      },
      actor_id: V1_STRING,
      idempotency_key: V1_STRING,
    },
    ["impact", "actor_id", "idempotency_key"],
  ),
  v1PayloadTool(
    "goalboard_v1_policy_set",
    "设置 Goal Mode 与 Review Policy。",
    {
      binding: {
        type: "object",
        properties: { goal_id: { type: ["string", "null"] }, policy: { type: "object" }, reason: V1_STRING },
        required: ["policy", "reason"],
      },
      actor_id: V1_STRING,
      idempotency_key: V1_STRING,
    },
    ["binding", "actor_id", "idempotency_key"],
  ),
  v1PayloadTool(
    "goalboard_v1_risk_add",
    "登记并关联 Risk。",
    {
      risk: {
        type: "object",
        properties: {
          risk_id: V1_STRING,
          goal_ids: V1_STRING_ARRAY,
          description: V1_STRING,
          probability: V1_STRING,
          impact: V1_STRING,
          affected_surfaces: V1_STRING_ARRAY,
          trigger: V1_STRING,
          treatment: { type: "string", enum: ["accept", "mitigate", "avoid", "defer"] },
          blocking_mode: { type: "string", enum: ["none", "claim", "completion", "invalidate_on_trigger"] },
          revisit_condition: V1_STRING,
          owner: V1_STRING,
        },
        required: ["goal_ids", "description", "probability", "impact", "trigger", "treatment", "blocking_mode", "revisit_condition", "owner"],
      },
      actor_id: V1_STRING,
      idempotency_key: V1_STRING,
    },
    ["risk", "actor_id", "idempotency_key"],
  ),
  v1PayloadTool(
    "goalboard_v1_risk_state",
    "更新 Risk 状态并执行失效影响。",
    {
      risk: {
        type: "object",
        properties: {
          risk_id: V1_STRING,
          state: { type: "string", enum: ["open", "triggered", "resolved", "accepted", "expired"] },
          reason: V1_STRING,
        },
        required: ["risk_id", "state", "reason"],
      },
      actor_id: V1_STRING,
      idempotency_key: V1_STRING,
    },
    ["risk", "actor_id", "idempotency_key"],
  ),
  v1PayloadTool(
    "goalboard_v1_active_goal",
    "设置当前产品 Goal。",
    { goal_id: V1_STRING, reason: V1_STRING, actor_id: V1_STRING, idempotency_key: V1_STRING },
    ["goal_id", "reason", "actor_id", "idempotency_key"],
  ),
  v1PayloadTool(
    "goalboard_v1_run_start",
    "为有效 Claim 开始 Run。",
    { claim_id: V1_STRING, actor_id: V1_STRING, idempotency_key: V1_STRING },
    ["claim_id", "actor_id", "idempotency_key"],
  ),
  v1PayloadTool(
    "goalboard_v1_revalidate",
    "由正在执行的 revalidator Run 提交核对证据；只有依赖、风险和 Contract 门禁都通过时才恢复 valid。",
    {
      goal_id: V1_STRING,
      run_id: V1_STRING,
      actor_id: V1_STRING,
      reason: V1_STRING,
      evidence_refs: V1_STRING_ARRAY,
      idempotency_key: V1_STRING,
    },
    ["goal_id", "run_id", "actor_id", "reason", "evidence_refs", "idempotency_key"],
  ),
  v1PayloadTool(
    "goalboard_v1_run_report",
    "报告 Run 阻塞或终态。",
    {
      run_id: V1_STRING,
      actor_id: V1_STRING,
      state: { type: "string", enum: ["started", "blocked", "completed", "failed", "abandoned"] },
      block_reason: { type: ["string", "null"] },
      output_refs: V1_STRING_ARRAY,
      discovery_refs: V1_STRING_ARRAY,
      idempotency_key: V1_STRING,
    },
    ["run_id", "actor_id", "state", "idempotency_key"],
  ),
  v1PayloadTool(
    "goalboard_v1_evidence_submit",
    "提交与验收条件绑定的 Evidence。",
    {
      goal_id: V1_STRING,
      actor_id: V1_STRING,
      criterion_ids: V1_STRING_ARRAY,
      run_id: { type: ["string", "null"] },
      review_id: { type: ["string", "null"] },
      kind: { type: "string", enum: ["test", "measurement", "artifact", "inspection", "attestation", "human_verdict"] },
      locator: V1_STRING,
      digest: { type: ["string", "null"] },
      result: { type: "string", enum: ["passed", "failed", "inconclusive"] },
      idempotency_key: V1_STRING,
    },
    ["goal_id", "actor_id", "criterion_ids", "kind", "locator", "result", "idempotency_key"],
  ),
  v1PayloadTool(
    "goalboard_v1_review_submit",
    "提交 Review；human approval 还必须声明 actor_kind=user。",
    {
      goal_id: V1_STRING,
      obligation_id: V1_STRING,
      actor_id: V1_STRING,
      actor_kind: { type: "string", enum: ["user", "runtime"] },
      verdict: { type: "string", enum: ["pass", "fail", "needs_changes", "inconclusive"] },
      evidence_refs: V1_STRING_ARRAY,
      reasoning: V1_STRING,
      idempotency_key: V1_STRING,
    },
    ["goal_id", "obligation_id", "actor_id", "verdict", "reasoning", "idempotency_key"],
  ),
  v1PayloadTool(
    "goalboard_v1_complete",
    "重新检查验收、依赖、风险、Candidate/Rewire 与 Review 后尝试完成叶子 Goal。",
    { goal_id: V1_STRING, actor_id: V1_STRING, idempotency_key: V1_STRING },
    ["goal_id", "actor_id", "idempotency_key"],
  ),
  v1PayloadTool(
    "goalboard_v1_dependency_propose",
    "提交带依据、证据、方向和拒绝影响的 Dependency Proposal；只创建待用户决定的 Rewire。",
    {
      actor_id: V1_STRING,
      discovered_in_run_id: V1_STRING,
      dependencies: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: {
            from_goal_id: V1_STRING,
            to_goal_id: V1_STRING,
            type: { type: "string", enum: ["depends_on"] },
            action: { type: "string", enum: ["add", "deactivate"] },
            reason: V1_STRING,
            basis: {
              type: "string",
              enum: [
                "contract_output",
                "code_reference",
                "test_dependency",
                "business_sequence",
                "impact_conflict",
                "risk_policy",
              ],
            },
            evidence_refs: V1_STRING_ARRAY,
            impact_if_rejected: V1_STRING,
            confidence: { type: "number", minimum: 0, maximum: 1 },
            direction_reason: V1_STRING,
          },
          required: [
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
          ],
        },
      },
      blocking_mode: { type: "string", enum: ["none", "current_run"] },
      idempotency_key: V1_STRING,
    },
    ["actor_id", "discovered_in_run_id", "dependencies", "idempotency_key"],
  ),
  v1PayloadTool(
    "goalboard_v1_contract_propose",
    "clarifier 为同一个 Draft 提交完整 Contract 补全提案；canonical Goal 在用户确认前保持不变。",
    {
      goal_id: V1_STRING,
      actor_id: V1_STRING,
      discovered_in_run_id: V1_STRING,
      proposed_goal: { type: "object" },
      field_sources: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: {
            field: {
              type: "string",
              enum: [
                "title", "outcome", "why", "business_logic", "in_scope", "out_of_scope",
                "constraints", "required_inputs", "promised_outputs", "priority",
                "acceptance_criteria", "review_policy",
              ],
            },
            source_kind: {
              type: "string",
              enum: ["user_answer", "repository_fact", "document_fact", "runtime_inference"],
            },
            source_refs: V1_STRING_ARRAY,
            confidence: { type: "number", minimum: 0, maximum: 1 },
            rationale: V1_STRING,
            status: { type: "string", enum: ["proposed"] },
            requires_user_confirmation: { type: "boolean", enum: [true] },
          },
          required: [
            "field", "source_kind", "source_refs", "confidence", "rationale", "status",
            "requires_user_confirmation",
          ],
        },
      },
      review_policy: { type: "object" },
      proposed_impacts: { type: "array", items: { type: "object" } },
      proposed_risks: { type: "array", items: { type: "object" } },
      dependency_rewire_ids: V1_STRING_ARRAY,
      idempotency_key: V1_STRING,
    },
    [
      "goal_id", "actor_id", "discovered_in_run_id", "proposed_goal", "field_sources",
      "review_policy", "idempotency_key",
    ],
  ),
  v1PayloadTool(
    "goalboard_v1_candidate_submit",
    "提交澄清或执行中发现的 Candidate Goal、关系、影响与 Risk 提案。",
    {
      actor_id: V1_STRING,
      discovered_in_run_id: { type: ["string", "null"] },
      proposed_goal: { type: "object" },
      proposed_relations: { type: "array", items: { type: "object" } },
      proposed_impacts: { type: "array", items: { type: "object" } },
      proposed_risks: { type: "array", items: { type: "object" } },
      blocking_mode: { type: "string", enum: ["none", "current_run", "dependent_claims"] },
      idempotency_key: V1_STRING,
    },
    ["actor_id", "proposed_goal", "idempotency_key"],
  ),
  v1PayloadTool(
    "goalboard_v1_contract_decide",
    "可信用户入口确认或拒绝同一 Draft 的 Contract 补全提案；Runtime 不可调用。",
    {
      proposal_id: V1_STRING,
      actor_id: V1_STRING,
      actor_kind: { type: "string", enum: ["user", "runtime"] },
      decision: { type: "string", enum: ["approved", "rejected"] },
      reason: V1_STRING,
      idempotency_key: V1_STRING,
    },
    ["proposal_id", "actor_id", "actor_kind", "decision", "reason", "idempotency_key"],
  ),
  v1PayloadTool(
    "goalboard_v1_candidate_decide",
    "可信用户调用面决定 Candidate Goal；不要向未受信 Runtime 暴露。",
    {
      candidate_id: V1_STRING,
      actor_id: V1_STRING,
      actor_kind: { type: "string", enum: ["user", "runtime"] },
      decision: { type: "string", enum: ["approved", "rejected", "dismissed"] },
      reason: V1_STRING,
      idempotency_key: V1_STRING,
    },
    ["candidate_id", "actor_id", "actor_kind", "decision", "reason", "idempotency_key"],
  ),
  v1PayloadTool(
    "goalboard_v1_rewire_confirm",
    "可信用户调用面决定是否应用 Candidate 或 Dependency Proposal 引起的关系调整；不要向 Runtime 暴露。",
    {
      rewire_id: V1_STRING,
      actor_id: V1_STRING,
      actor_kind: { type: "string", enum: ["user", "runtime"] },
      decision: { type: "string", enum: ["confirmed", "rejected"] },
      reason: V1_STRING,
      idempotency_key: V1_STRING,
    },
    ["rewire_id", "actor_id", "actor_kind", "reason", "idempotency_key"],
  ),
  v1PayloadTool(
    "goalboard_v1_import_v3",
    "导入 V3 可安全映射字段，并返回必须重新生成的语义。",
    { legacy: { type: "object" }, actor_id: V1_STRING, idempotency_key: V1_STRING },
    ["legacy", "actor_id", "idempotency_key"],
  ),
];

const TOOLS: McpToolDefinition[] = V1_TOOLS;

const RUNTIME_V1_TOOL_NAMES = new Set([
  "goalboard_v1_snapshot",
  "goalboard_v1_contract",
  "goalboard_v1_ready",
  "goalboard_v1_explain",
  "goalboard_v1_claim",
  "goalboard_v1_release",
  "goalboard_v1_run_start",
  "goalboard_v1_revalidate",
  "goalboard_v1_run_report",
  "goalboard_v1_evidence_submit",
  "goalboard_v1_review_submit",
  "goalboard_v1_complete",
  "goalboard_v1_contract_propose",
  "goalboard_v1_candidate_submit",
  "goalboard_v1_dependency_propose",
]);

function runtimeToolDefinition(tool: McpToolDefinition): McpToolDefinition {
  const clone = structuredClone(tool);
  const inputProperties = clone.inputSchema.properties as Record<string, unknown>;
  delete inputProperties.database_path;
  delete inputProperties.web_base_url;
  if (tool.name !== "goalboard_v1_review_submit") return clone;
  const payload = inputProperties.payload as { properties: Record<string, unknown> };
  payload.properties.actor_kind = {
    type: "string",
    enum: ["runtime"],
    description: "Runtime MCP 只能提交 Runtime Review；human approval 由用户入口完成。",
  };
  clone.description = "提交 Runtime 可承担的 Review；human approval 不在 Runtime MCP 中开放。";
  return clone;
}

const RUNTIME_TOOLS = V1_TOOLS
  .filter((tool) => RUNTIME_V1_TOOL_NAMES.has(tool.name))
  .map(runtimeToolDefinition);

export class GoalBoardServer {
  audience: GoalBoardMcpAudience;
  runtimeConnection: GoalBoardRuntimeConnection | null;

  constructor(
    audience?: GoalBoardMcpAudience | null,
    runtimeConnection?: GoalBoardRuntimeConnection | null,
  ) {
    this.audience =
      audience ?? (process.env.GOALBOARD_MCP_AUDIENCE === "management" ? "management" : "runtime");
    this.runtimeConnection =
      runtimeConnection ??
      (process.env.GOALBOARD_DATABASE &&
      process.env.GOALBOARD_BOARD_ID &&
      process.env.GOALBOARD_WEB_URL
        ? {
            databasePath: process.env.GOALBOARD_DATABASE,
            boardId: process.env.GOALBOARD_BOARD_ID,
            webBaseUrl: process.env.GOALBOARD_WEB_URL,
          }
        : null);
  }

  async callTool(name: string, arguments_: Record<string, unknown>): Promise<string> {
    this.assertToolAllowed(name, arguments_);
    return this.callV1Tool(name, arguments_);
  }

  private assertToolAllowed(name: string, arguments_: Record<string, unknown>): void {
    if (this.audience === "management") return;
    if (!RUNTIME_V1_TOOL_NAMES.has(name)) {
      throw new GoalBoardV1Error(
        "mcp.authority_denied",
        `MCP 权限拒绝：${name} 只允许用户或管理入口调用；Runtime 应提交 Candidate 或把决定交给用户`,
      );
    }
    if (name === "goalboard_v1_review_submit") {
      const payload = (arguments_.payload as Record<string, unknown> | undefined) ?? {};
      if (payload.actor_kind === "user") {
        throw new GoalBoardV1Error(
          "mcp.user_impersonation_denied",
          "MCP 权限拒绝：Runtime 不能声明 actor_kind=user 或代替用户提交 human approval Review",
        );
      }
    }
    if (arguments_.database_path != null || arguments_.web_base_url != null) {
      throw new GoalBoardV1Error(
        "mcp.connection_override_denied",
        "MCP 连接拒绝：Runtime 不能覆盖宿主固定的 SQLite 或 goal_url",
      );
    }
    if (!this.runtimeConnection) {
      throw new GoalBoardV1Error(
        "mcp.connection_incomplete",
        "MCP 宿主配置不完整：Runtime 连接必须固定 GOALBOARD_DATABASE、GOALBOARD_BOARD_ID 和 GOALBOARD_WEB_URL",
      );
    }
    if (arguments_.board_id !== this.runtimeConnection.boardId) {
      throw new GoalBoardV1Error(
        "mcp.board_mismatch",
        `MCP 连接拒绝：Runtime 必须使用宿主固定的 board_id ${this.runtimeConnection.boardId}`,
      );
    }
  }

  private callV1Tool(name: string, arguments_: Record<string, unknown>): string {
    const databasePath = path.resolve(
      String(
        this.audience === "runtime"
          ? this.runtimeConnection!.databasePath
          : arguments_.database_path ?? process.env.GOALBOARD_DATABASE ?? ".goalboard/goalboard.db",
      ),
    );
    if (name === "goalboard_v1_initialize" || name === "goalboard_v1_import_v3") {
      fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    } else if (!fs.existsSync(databasePath)) {
      throw new GoalBoardV1Error("store.not_found", `GoalBoard 数据库不存在: ${databasePath}`);
    }
    const store = new SqliteGoalBoardStore(databasePath);
    const coordinator = new GoalBoardCoordinator(store);
    try {
      let result: unknown;
      switch (name) {
        case "goalboard_v1_initialize":
          result = coordinator.initializeBoard({
            board_id: String(arguments_.board_id),
            title: String(arguments_.title),
            actor_id: String(arguments_.actor_id),
            idempotency_key: String(arguments_.idempotency_key),
          });
          break;
        case "goalboard_v1_create_goal":
          result = coordinator.createGoal(
            String(arguments_.board_id),
            arguments_.goal as CreateGoalInput,
            {
              actor_id: String(arguments_.actor_id),
              idempotency_key: String(arguments_.idempotency_key),
              reason: arguments_.reason == null ? undefined : String(arguments_.reason),
            },
          );
          break;
        case "goalboard_v1_snapshot":
          result = store.snapshot(String(arguments_.board_id));
          break;
        case "goalboard_v1_contract": {
          const contract = coordinator.readGoalContract(
            String(arguments_.board_id),
            String(arguments_.goal_id),
          );
          const baseUrl = String(
            this.audience === "runtime"
              ? this.runtimeConnection!.webBaseUrl
              : arguments_.web_base_url ??
                  process.env.GOALBOARD_WEB_URL ??
                  "http://127.0.0.1:4173",
          );
          let goalUrl: string;
          try {
            goalUrl = new URL(contract.goal_path, baseUrl).toString();
          } catch {
            throw new GoalBoardV1Error("web.url_invalid", `无效的 GoalBoard Web 地址: ${baseUrl}`);
          }
          result = { ...contract, goal_url: goalUrl };
          break;
        }
        case "goalboard_v1_ready":
          result = coordinator.queryReady({
            board_id: String(arguments_.board_id),
            actor_id: String(arguments_.actor_id),
            role: arguments_.role as Parameters<GoalBoardCoordinator["queryReady"]>[0]["role"],
            capabilities: (arguments_.capabilities as string[]) ?? [],
            goal_mode_attestation: Boolean(arguments_.goal_mode_attestation),
          });
          break;
        case "goalboard_v1_explain":
          result = coordinator.explainGoal({
            board_id: String(arguments_.board_id),
            goal_id: String(arguments_.goal_id),
            actor_id: String(arguments_.actor_id),
            role: arguments_.role as Parameters<GoalBoardCoordinator["explainGoal"]>[0]["role"],
            capabilities: (arguments_.capabilities as string[]) ?? [],
            goal_mode_attestation: Boolean(arguments_.goal_mode_attestation),
          });
          break;
        case "goalboard_v1_claim":
          result = coordinator.claimGoal(arguments_ as unknown as ClaimRequest);
          break;
        case "goalboard_v1_release":
          result = coordinator.releaseClaim(this.v1Payload(arguments_));
          break;
        case "goalboard_v1_relation_add": {
          const payload = this.v1Payload<{
            board_id: string;
            relation: Parameters<GoalBoardCoordinator["addRelation"]>[1];
            actor_id: string;
            idempotency_key: string;
          }>(arguments_);
          result = coordinator.addRelation(payload.board_id, payload.relation, payload);
          break;
        }
        case "goalboard_v1_impact_add": {
          const payload = this.v1Payload<{
            board_id: string;
            impact: Parameters<GoalBoardCoordinator["addImpact"]>[1];
            actor_id: string;
            idempotency_key: string;
          }>(arguments_);
          result = coordinator.addImpact(payload.board_id, payload.impact, payload);
          break;
        }
        case "goalboard_v1_policy_set": {
          const payload = this.v1Payload<{
            board_id: string;
            binding: Parameters<GoalBoardCoordinator["setPolicy"]>[1];
            actor_id: string;
            idempotency_key: string;
          }>(arguments_);
          result = coordinator.setPolicy(payload.board_id, payload.binding, payload);
          break;
        }
        case "goalboard_v1_risk_add": {
          const payload = this.v1Payload<{
            board_id: string;
            risk: Parameters<GoalBoardCoordinator["addRisk"]>[1];
            actor_id: string;
            idempotency_key: string;
          }>(arguments_);
          result = coordinator.addRisk(payload.board_id, payload.risk, payload);
          break;
        }
        case "goalboard_v1_risk_state": {
          const payload = this.v1Payload<{
            board_id: string;
            risk: Parameters<GoalBoardCoordinator["setRiskState"]>[1];
            actor_id: string;
            idempotency_key: string;
          }>(arguments_);
          result = coordinator.setRiskState(payload.board_id, payload.risk, payload);
          break;
        }
        case "goalboard_v1_active_goal": {
          const payload = this.v1Payload<{
            board_id: string;
            goal_id: string;
            reason: string;
            actor_id: string;
            idempotency_key: string;
          }>(arguments_);
          result = coordinator.setActiveGoal(payload.board_id, payload, payload);
          break;
        }
        case "goalboard_v1_run_start":
          result = coordinator.startRun(this.v1Payload(arguments_));
          break;
        case "goalboard_v1_revalidate":
          result = coordinator.revalidateGoal(this.v1Payload(arguments_));
          break;
        case "goalboard_v1_run_report":
          result = coordinator.reportRun(this.v1Payload(arguments_));
          break;
        case "goalboard_v1_evidence_submit":
          result = coordinator.submitEvidence(this.v1Payload(arguments_));
          break;
        case "goalboard_v1_review_submit":
          result = coordinator.submitReview(this.v1Payload(arguments_));
          break;
        case "goalboard_v1_complete":
          result = coordinator.evaluateLeafCompletion(this.v1Payload(arguments_));
          break;
        case "goalboard_v1_contract_propose":
          result = coordinator.submitContractProposal(this.v1Payload(arguments_));
          break;
        case "goalboard_v1_candidate_submit":
          result = coordinator.submitCandidate(this.v1Payload(arguments_));
          break;
        case "goalboard_v1_dependency_propose":
          result = coordinator.submitDependencyProposal(this.v1Payload(arguments_));
          break;
        case "goalboard_v1_contract_decide":
          result = coordinator.decideContractProposal(this.v1Payload(arguments_));
          break;
        case "goalboard_v1_candidate_decide":
          result = coordinator.decideCandidate(this.v1Payload(arguments_));
          break;
        case "goalboard_v1_rewire_confirm":
          result = coordinator.confirmRewire(this.v1Payload(arguments_));
          break;
        case "goalboard_v1_import_v3": {
          const payload = arguments_.payload as {
            legacy: LegacyV3ImportInput;
            actor_id: string;
            idempotency_key: string;
          };
          result = importV3Board(store, coordinator, payload.legacy, {
            target_board_id: String(arguments_.board_id),
            actor_id: payload.actor_id,
            idempotency_key: payload.idempotency_key,
          });
          break;
        }
        default:
          throw new GoalBoardV1Error("mcp.tool_unknown", `未知 V1 tool: ${name}`);
      }
      return JSON.stringify(result, null, 2);
    } finally {
      store.close();
    }
  }

  private v1Payload<T>(arguments_: Record<string, unknown>): T {
    return {
      ...(arguments_.payload as Record<string, unknown>),
      board_id: String(arguments_.board_id),
    } as T;
  }

  async handleMessage(
    message: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const method = message.method as string;
    const msgId = message.id;
    if (method === "initialize") {
      const params = (message.params as Record<string, unknown>) || {};
      return {
        jsonrpc: "2.0",
        id: msgId,
        result: {
          protocolVersion: params.protocolVersion ?? "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        },
      };
    }
    if (method === "notifications/initialized") return null;
    if (method === "ping") {
      return { jsonrpc: "2.0", id: msgId, result: {} };
    }
    if (method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id: msgId,
        result: { tools: this.audience === "management" ? TOOLS : RUNTIME_TOOLS },
      };
    }
    if (method === "tools/call") {
      try {
        const params = message.params as {
          name: string;
          arguments?: Record<string, unknown>;
        };
        const text = await this.callTool(params.name, params.arguments || {});
        return {
          jsonrpc: "2.0",
          id: msgId,
          result: {
            content: [{ type: "text", text }],
            isError: false,
          },
        };
      } catch (err) {
        return {
          jsonrpc: "2.0",
          id: msgId,
          result: {
            content: [
              {
                type: "text",
                text: `错误: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            isError: true,
          },
        };
      }
    }
    if (method === "resources/list") {
      return { jsonrpc: "2.0", id: msgId, result: { resources: [] } };
    }
    return {
      jsonrpc: "2.0",
      id: msgId,
      error: { code: -32601, message: `Method not found: ${method}` },
    };
  }
}

async function runStdio(): Promise<void> {
  const server = new GoalBoardServer();
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }
    const response = await server.handleMessage(message);
    if (response) process.stdout.write(JSON.stringify(response) + "\n");
  }
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("mcp/server.ts") ||
    process.argv[1].endsWith("mcp/server.js"));

if (isMain) {
  runStdio().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { TOOLS, RUNTIME_TOOLS, SERVER_INFO };

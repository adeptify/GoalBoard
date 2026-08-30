#!/usr/bin/env node
/** GoalBoard V1 MCP Server：stdio JSON-RPC。 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createHash } from "node:crypto";
import {
  GoalBoardProjectCatalogError,
  normalizeRuntimeWorkContext,
  readPersonalPlanningMethodPacks,
  type GoalBoardRuntimeContextResolution,
  type RuntimeProjectSuggestionClue,
  type RuntimeWorkContext,
} from "../projects/catalog.js";
import { withGoalBoardProjectCatalog } from "../projects/catalog-session.js";
import { GoalBoardCoordinator, GoalBoardV1Error } from "../v1/coordinator.js";
import { SqliteGoalBoardStore } from "../v1/store.js";
import type { ClaimRequest, CreateGoalInput, GoalTrashResult } from "../v1/types.js";
import { importV3Board, type LegacyV3ImportInput } from "../v1/migration.js";

const SERVER_INFO = { name: "goalboard-mcp", version: "1.0.0" };

const V1_COMMON = {
  database_path: { type: "string", description: "管理入口使用的共享 SQLite 文件路径" },
  board_id: { type: "string" },
};

const V1_CLAIM_ROLE = {
  type: "string",
  enum: ["clarifier", "executor", "self_verifier", "cross_reviewer", "adversarial_reviewer", "revalidator"],
};

const V1_STRING = { type: "string" };
const V1_STRING_ARRAY = { type: "array", items: V1_STRING };
const V1_LEASE_SECONDS = {
  type: "integer",
  minimum: 1,
  description:
    "可选；通常省略以采用当前动态策略（由项目与 Goal 共同解析）。显式值只用于缩短租约，必须是正整数且不能超过当前 resolved policy 的 max_lease_seconds；不要通过失败调用探测上限。",
};
const V1_RENEW_LEASE_SECONDS = {
  type: "integer",
  minimum: 1,
  description:
    "可选；省略时采用领取时确认的策略上限。显式值必须是正整数且不能超过该 Claim 领取时 resolved policy 的 max_lease_seconds。",
};
const DRAFT_DIALOGUE_FACT = {
  type: "object",
  properties: {
    statement: V1_STRING,
    source_kind: { type: "string", enum: ["user_answer", "repository_fact", "document_fact"] },
    source_refs: V1_STRING_ARRAY,
    confidence: { type: "number", minimum: 0, maximum: 1 },
    confirmed_by_user: { type: "boolean" },
  },
  required: ["statement", "source_kind"],
};
const DRAFT_DIALOGUE_ASSUMPTION = {
  type: "object",
  properties: {
    statement: V1_STRING,
    source_refs: V1_STRING_ARRAY,
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["statement"],
};
const GOAL_TREE_AFFECTED_OBJECT = {
  type: "object",
  properties: {
    object_type: { type: "string", enum: ["goal", "relation", "risk", "policy", "candidate", "rewire"] },
    object_id: V1_STRING,
  },
  required: ["object_type", "object_id"],
};
const GOAL_TREE_ACCEPTANCE_CRITERION = {
  type: "object",
  properties: {
    criterion_id: V1_STRING,
    statement: V1_STRING,
    decision_method: {
      type: "string",
      enum: ["automated_check", "inspection", "measurement", "human_decision"],
    },
    pass_condition: V1_STRING,
    target: { type: ["object", "null"] },
    required_evidence: V1_STRING_ARRAY,
  },
  required: ["statement", "decision_method", "pass_condition", "required_evidence"],
};
const GOAL_TREE_CONTRACT_COVERAGE_STATUS = {
  type: "string",
  enum: ["complete", "partial", "integration_required", "uncovered"],
};
const GOAL_TREE_CONTRACT_COVERAGE = {
  type: "object",
  description:
    "逐项把父 Goal Contract 的 promised_outputs 与 acceptance_criteria 映射到后代 Goal 的真实 Contract 字段。closed_compound 只接受 complete；partial、integration_required 或 uncovered 必须保持父 Goal 开放。",
  properties: {
    promised_outputs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          parent_promised_output: V1_STRING,
          status: GOAL_TREE_CONTRACT_COVERAGE_STATUS,
          child_outputs: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: { goal_id: V1_STRING, promised_output: V1_STRING },
              required: ["goal_id", "promised_output"],
            },
          },
          reason: V1_STRING,
        },
        required: ["parent_promised_output", "status", "child_outputs", "reason"],
      },
    },
    acceptance_criteria: {
      type: "array",
      items: {
        type: "object",
        properties: {
          parent_criterion_id: V1_STRING,
          status: GOAL_TREE_CONTRACT_COVERAGE_STATUS,
          child_criteria: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: { goal_id: V1_STRING, criterion_id: V1_STRING },
              required: ["goal_id", "criterion_id"],
            },
          },
          reason: V1_STRING,
        },
        required: ["parent_criterion_id", "status", "child_criteria", "reason"],
      },
    },
  },
  required: ["promised_outputs", "acceptance_criteria"],
};
const GOAL_TREE_DECOMPOSITION_REVIEW = {
  type: "object",
  description:
    "拆分检查。complete + closed_compound 必须提供 contract_coverage，并逐项覆盖父 Contract；GoalBoard 只验证明确引用，不猜测自然语言语义等价。",
  properties: {
    status: { type: "string", enum: ["complete", "paused"] },
    method_pack_ids: V1_STRING_ARRAY,
    task_context: { type: "string", enum: ["game", "app", "ai_data", "content_research", "operations", "other"] },
    product_context: { type: "string", enum: ["game", "app", "other"] },
    coverage: { type: "array", items: { type: "object" } },
    open_goal_ids: V1_STRING_ARRAY,
    next_step: V1_STRING,
    contract_coverage: GOAL_TREE_CONTRACT_COVERAGE,
  },
  required: ["status", "coverage", "open_goal_ids", "next_step"],
};
const GOAL_TREE_GOAL_PROPERTIES = {
  goal_id: {
    type: "string",
    description: "稳定 Goal ID。新建 Goal 必填；更新 Contract 时用于定位目标 Goal。",
  },
  title: V1_STRING,
  outcome: V1_STRING,
  why: V1_STRING,
  business_logic: V1_STRING,
  in_scope: V1_STRING_ARRAY,
  out_of_scope: V1_STRING_ARRAY,
  constraints: V1_STRING_ARRAY,
  required_inputs: V1_STRING_ARRAY,
  promised_outputs: V1_STRING_ARRAY,
  definition_state: { type: "string", enum: ["draft", "accepted"] },
  decomposition_state: {
    type: "string",
    enum: ["abstract", "frontier_open", "closed_leaf", "closed_compound"],
  },
  decomposition_review: GOAL_TREE_DECOMPOSITION_REVIEW,
  leaf_readiness: { type: "object" },
  priority: { type: "number" },
  acceptance_criteria: { type: "array", items: GOAL_TREE_ACCEPTANCE_CRITERION },
};
const GOAL_TREE_GOAL_PAYLOAD = {
  type: "object",
  description:
    "kind=goal 的规范 payload。Draft 最少提供 goal_id、title；accepted Goal 还应给出完整 Contract 和验收条件。parent_goal_id 不会创建层级，父子关系必须另提 relation 条目。",
  properties: GOAL_TREE_GOAL_PROPERTIES,
  required: ["goal_id", "title"],
  examples: [{ goal_id: "child-goal", title: "交付可验收的子结果", definition_state: "draft" }],
};
const GOAL_TREE_CONTRACT_PAYLOAD = {
  type: "object",
  description:
    "kind=contract 的规范 payload。goal_id 指向现有 Goal，其余字段是待用户确认的 Contract 版本；accepted Contract 需要完整业务与验收字段。",
  properties: GOAL_TREE_GOAL_PROPERTIES,
  required: ["goal_id"],
  examples: [{ goal_id: "existing-goal", title: "更新后的目标标题", definition_state: "draft" }],
};
const GOAL_TREE_RELATION_PROPERTIES = {
  action: { type: "string", enum: ["add", "deactivate"] },
  relation_id: {
    type: "string",
    description: "停用已有关系时可直接提供；新增关系不使用。",
  },
  from_goal_id: V1_STRING,
  to_goal_id: V1_STRING,
  type: {
    type: "string",
    enum: [
      "part_of",
      "depends_on",
      "conflicts_with",
      "mitigates",
      "extends",
      "replaces",
      "corrects",
      "invalidates",
      "migrates_from",
    ],
  },
  reason: V1_STRING,
};
const GOAL_TREE_RELATION_PAYLOAD = {
  type: "object",
  description:
    "kind=relation 的规范 payload。create/update 需要 from_goal_id、to_goal_id、type；deactivate 可用 relation_id，或完整三元组。方向语义：part_of 为子 Goal → 父 Goal；depends_on 为消费方/依赖方 Goal → 提供方/前置 Goal。",
  properties: GOAL_TREE_RELATION_PROPERTIES,
  anyOf: [
    { required: ["from_goal_id", "to_goal_id", "type"] },
    { required: ["relation_id"] },
  ],
  examples: [{ from_goal_id: "child-goal", to_goal_id: "parent-goal", type: "part_of" }],
};
const GOAL_TREE_DEPENDENCY_PAYLOAD = {
  type: "object",
  description:
    "kind=dependency 专用于 depends_on。create/update 需要 from_goal_id、to_goal_id；type 可省略，若提供只能是 depends_on。方向固定为消费方/依赖方 Goal → 提供方/前置 Goal。deactivate 可用 relation_id 或同一方向的端点。",
  properties: {
    ...GOAL_TREE_RELATION_PROPERTIES,
    type: { type: "string", enum: ["depends_on"] },
  },
  anyOf: [
    { required: ["from_goal_id", "to_goal_id"] },
    { required: ["relation_id"] },
  ],
  examples: [{ from_goal_id: "consumer-goal", to_goal_id: "provider-goal", type: "depends_on" }],
};
const GOAL_TREE_RISK_PAYLOAD = {
  type: "object",
  description:
    "kind=risk。create/update 需要关联 Goal 与完整风险事实；update/deactivate 还需要 risk_id。treatment 是处理策略，state 是生命周期。",
  properties: {
    risk_id: V1_STRING,
    goal_ids: V1_STRING_ARRAY,
    description: V1_STRING,
    probability: V1_STRING,
    impact: V1_STRING,
    affected_surfaces: V1_STRING_ARRAY,
    trigger: V1_STRING,
    treatment: { type: "string", enum: ["accept", "mitigate", "avoid", "defer"] },
    treatment_plan: V1_STRING,
    blocking_mode: {
      type: "string",
      enum: ["none", "claim", "completion", "invalidate_on_trigger"],
    },
    revisit_condition: V1_STRING,
    owner: V1_STRING,
    state: { type: "string", enum: ["open", "triggered", "resolved", "accepted", "expired"] },
  },
  examples: [{
    goal_ids: ["goal-a"],
    description: "关键输入可能不可用",
    probability: "medium",
    impact: "high",
    trigger: "输入连续两次读取失败",
    treatment: "mitigate",
    blocking_mode: "completion",
    revisit_condition: "替代输入完成验证后复查",
    owner: "runtime-clarifier",
  }],
};
const GOAL_TREE_POLICY_FIELDS = {
  goal_mode: { type: "string", enum: ["disabled", "preferred", "required"] },
  required_capabilities: V1_STRING_ARRAY,
  self_verification: { type: "boolean" },
  cross_reviewers: { type: "integer", minimum: 0 },
  adversarial_reviewers: { type: "integer", minimum: 0 },
  human_approval: { type: "boolean" },
  max_lease_seconds: { type: "integer", minimum: 1 },
};
const GOAL_TREE_POLICY_PAYLOAD = {
  type: "object",
  description:
    "kind=policy。create/update 可提供 goal_id（省略表示项目默认）和 policy 对象；兼容直接平铺 policy 字段。deactivate 需要 policy_binding_id。",
  properties: {
    goal_id: V1_STRING,
    policy_binding_id: V1_STRING,
    policy: { type: "object", properties: GOAL_TREE_POLICY_FIELDS },
    ...GOAL_TREE_POLICY_FIELDS,
  },
  examples: [{ goal_id: "goal-a", policy: { goal_mode: "required", self_verification: true } }],
};
const GOAL_TREE_CANDIDATE_PAYLOAD = {
  type: "object",
  description:
    "kind=candidate。create 提供 candidate_id（可选）与 proposed_goal；晋升已有 pending Candidate 时使用 update，并提供 candidate_id、最终 proposed_goal、proposed_relations（可为空列表）。",
  properties: {
    candidate_id: V1_STRING,
    proposed_goal: GOAL_TREE_GOAL_PAYLOAD,
    proposed_relations: { type: "array", items: GOAL_TREE_RELATION_PAYLOAD },
    proposed_impacts: { type: "array", items: { type: "object" } },
    proposed_risks: { type: "array", items: { type: "object" } },
    blocking_mode: { type: "string", enum: ["none", "current_run", "dependent_claims"] },
    formal_goal_id: V1_STRING,
    materialized_by_proposal_id: V1_STRING,
  },
  examples: [{
    candidate_id: "candidate-a",
    proposed_goal: { goal_id: "goal-a", title: "晋升后的 Goal" },
    proposed_relations: [],
  }],
};
const GOAL_TREE_REWIRE_PAYLOAD = {
  type: "object",
  description:
    "kind=rewire。create/update 提供 relations 数组；update/deactivate 需要 rewire_id。每条关系沿用 relation 的方向语义。",
  properties: {
    rewire_id: V1_STRING,
    relations: { type: "array", items: GOAL_TREE_RELATION_PAYLOAD },
  },
  examples: [{
    rewire_id: "rewire-a",
    relations: [{ from_goal_id: "child-goal", to_goal_id: "parent-goal", type: "part_of" }],
  }],
};
const GOAL_TREE_PAYLOAD_BY_KIND = [
  ["goal", GOAL_TREE_GOAL_PAYLOAD],
  ["contract", GOAL_TREE_CONTRACT_PAYLOAD],
  ["relation", GOAL_TREE_RELATION_PAYLOAD],
  ["dependency", GOAL_TREE_DEPENDENCY_PAYLOAD],
  ["risk", GOAL_TREE_RISK_PAYLOAD],
  ["policy", GOAL_TREE_POLICY_PAYLOAD],
  ["candidate", GOAL_TREE_CANDIDATE_PAYLOAD],
  ["rewire", GOAL_TREE_REWIRE_PAYLOAD],
] as const;
const GOAL_TREE_ITEM = {
  type: "object",
  properties: {
    item_id: V1_STRING,
    kind: {
      type: "string",
      enum: ["goal", "contract", "relation", "dependency", "risk", "policy", "candidate", "rewire"],
    },
    operation: { type: "string", enum: ["create", "update", "deactivate"] },
    payload: {
      type: "object",
      description:
        "条目正文。kind=risk 时，treatment 只能是 accept|mitigate|avoid|defer；可选 state 只能是 open|triggered|resolved|accepted|expired。mitigate 是处理策略，不是生命周期状态；措施完成后使用 state=resolved。",
    },
    source_refs: V1_STRING_ARRAY,
    reason: V1_STRING,
    confidence: { type: "number", minimum: 0, maximum: 1 },
    affected_objects: { type: "array", items: GOAL_TREE_AFFECTED_OBJECT },
    requires_user_confirmation: { type: "boolean" },
    supersedes_item_id: { type: ["string", "null"] },
  },
  required: ["kind", "operation", "payload", "source_refs", "reason", "confidence", "affected_objects"],
  allOf: GOAL_TREE_PAYLOAD_BY_KIND.map(([kind, payload]) => ({
    if: { properties: { kind: { const: kind } }, required: ["kind"] },
    then: { properties: { payload } },
  })),
};
const GOAL_TREE_ITEM_DECISION = {
  type: "object",
  properties: {
    item_id: V1_STRING,
    decision: { type: "string", enum: ["confirm", "reject", "revise"] },
    reason: V1_STRING,
    revised_item: GOAL_TREE_ITEM,
  },
  required: ["item_id", "decision"],
};
const PLANNING_METHOD_PACK = {
  type: "object",
  properties: {
    method_id: V1_STRING,
    kind: { type: "string", enum: ["meta", "work_type", "domain", "industry", "overlay", "custom"] },
    name: V1_STRING,
    summary: V1_STRING,
    instructions: V1_STRING,
    applies_to: V1_STRING_ARRAY,
    domain_tags: V1_STRING_ARRAY,
    steps: V1_STRING_ARRAY,
    required_coverage: {
      type: "array",
      items: {
        type: "object",
        properties: { area: V1_STRING, label: V1_STRING, question: V1_STRING },
        required: ["area", "label", "question"],
      },
    },
    dependency_rules: {
      type: "array",
      items: {
        type: "object",
        properties: { rule_id: V1_STRING, statement: V1_STRING, direction_hint: V1_STRING },
        required: ["rule_id", "statement", "direction_hint"],
      },
    },
    evidence_requirements: V1_STRING_ARRAY,
    completion_checks: V1_STRING_ARRAY,
    failure_modes: V1_STRING_ARRAY,
    source_refs: V1_STRING_ARRAY,
    confidence: { type: "number", minimum: 0, maximum: 1 },
    enabled: { type: "boolean" },
  },
  required: [
    "method_id", "kind", "name", "summary", "applies_to", "domain_tags", "steps",
    "required_coverage", "dependency_rules", "evidence_requirements", "completion_checks",
    "failure_modes", "source_refs", "confidence", "enabled",
  ],
};

export type GoalBoardMcpAudience = "runtime" | "management";

export interface GoalBoardRuntimeConnection {
  projectId?: string;
  databasePath: string;
  boardId: string;
  webBaseUrl: string;
}

export interface GoalBoardMcpToolCallContext {
  sessionId: string | null;
  sessionIdSource: "threadId" | "sessionId" | "goalboard/sessionId" | null;
}

/**
 * Host-only context for a Runtime MCP process. The model never supplies this
 * identity through a tool argument: it comes from the Runtime host and is used
 * only after the GoalBoard Skill explicitly asks to resolve it.
 */
export interface GoalBoardRuntimeContextHost {
  homeDirectory?: string;
  runtimeContext: RuntimeWorkContext;
  webBaseUrl?: string;
  /**
   * Host-only non-authoritative hints for a fresh Session. They may rank
   * projects, but never establish a binding and are never supplied by a
   * Runtime MCP tool argument.
   */
  projectSuggestionClues?: readonly RuntimeProjectSuggestionClue[];
  /** Desktop TUI panel that launched this MCP process, if any. */
  panelId?: string | null;
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
    name: "goalboard_v1_project_guidance_get",
    description:
      "读取用户已确认的项目长期说明，以及应放在当前 Goal 和外部内容之前的稳定 Runtime Prompt 前缀。",
    inputSchema: {
      type: "object",
      properties: V1_COMMON,
      required: ["board_id"],
    },
  },
  {
    name: "goalboard_v1_project_guidance_add",
    description:
      "直接新增一条已确认的项目长期说明，不创建待确认记录也不绑定 Goal。调用前必须向用户说明为什么值得长期保存，展示精确 kind 和 content，并在当前对话获得明确同意；未经确认的推断或外部未信任内容不得写入。",
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        actor_id: V1_STRING,
        kind: {
          type: "string",
          enum: ["context", "requirement", "constraint", "convention", "workflow", "quality_bar"],
        },
        content: V1_STRING,
        source_refs: V1_STRING_ARRAY,
        reason: V1_STRING,
        confirmation_summary: {
          type: "string",
          description: "用户在当前对话明确同意写入的简短事实摘要",
        },
        user_confirmed: {
          type: "boolean",
          description: "只有已展示精确分类和原文并获得明确同意时才能为 true",
        },
        idempotency_key: V1_STRING,
      },
      required: [
        "board_id",
        "actor_id",
        "kind",
        "content",
        "reason",
        "confirmation_summary",
        "user_confirmed",
        "idempotency_key",
      ],
    },
  },
  {
    name: "goalboard_v1_project_guidance_update",
    description:
      "直接修改、停用或恢复一条已确认的项目长期说明并保留修订历史，不创建待确认记录也不绑定 Goal。Runtime 调用前必须展示精确变更并在当前对话获得明确同意。",
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        guidance_id: V1_STRING,
        actor_id: V1_STRING,
        action: { type: "string", enum: ["edit", "deactivate", "restore"] },
        kind: {
          type: "string",
          enum: ["context", "requirement", "constraint", "convention", "workflow", "quality_bar"],
          description: "action=edit 时必填",
        },
        content: { type: "string", description: "action=edit 时必填" },
        source_refs: V1_STRING_ARRAY,
        reason: V1_STRING,
        confirmation_summary: {
          type: "string",
          description: "用户在当前对话明确同意这次变更的简短事实摘要",
        },
        user_confirmed: {
          type: "boolean",
          description: "只有已展示精确变更并获得明确同意时才能为 true",
        },
        idempotency_key: V1_STRING,
      },
      required: [
        "board_id",
        "guidance_id",
        "actor_id",
        "action",
        "reason",
        "confirmation_summary",
        "user_confirmed",
        "idempotency_key",
      ],
    },
  },
  {
    name: "goalboard_v1_contract",
    description:
      "读取一个 Goal 的完整 Contract、关系、风险、执行事实和可供用户打开的稳定页面地址。parent_contract_coverage 会逐项说明它对父 Goal 承诺结果与完成条件的贡献；record_status=unrecorded 表示历史数据未记录映射，不代表父级能力已被覆盖。",
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
    name: "goalboard_v1_available",
    description:
      "返回当前 Runtime 可推进的统一 Available 集合，覆盖澄清、执行、复核、重新验证和直接完成；初次执行仍可能在 completion Risk 开放时领取，但执行、Evidence 和 Review 已完成后不会再伪装成 executor 工作，而会出现在 blocked 中并附具体原因。next_action=complete 的条目不需要 Claim 或 Run，必须直接调用 complete。需要用户确认是否收口的父 Goal 会明确标记并排在普通工作前。多个 executor Goal 具有已确认且互不冲突的 Impact 时，会附带 advisory_only 的 parallel_suggestion 供 Runtime 主动提议分工，但不会启动 Runtime、领取 Goal 或派发唯一下一份。",
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        actor_id: { type: "string" },
        capabilities: { type: "array", items: { type: "string" } },
        goal_mode_attestation: { type: "boolean" },
      },
      required: ["board_id", "actor_id"],
    },
  },
  {
    name: "goalboard_v1_planning_methods",
    description: "读取当前项目的完整方法库和多方法规划组合。Runtime 在创建、拆分或重连 Goal 前，必须从 methods[] 完整阅读每个已选方法的 instructions，并把多套方法作为互补的规划 Skill 一起使用；composition.method_paths 只重复项目必选组合。项目组合是必须使用的下限，不是方法选择的上限。Runtime 还要检查各主题的提供者产出与消费者用途，召回遗漏的相关方法，并在真实产出消费存在时建立硬依赖；不得按类型、列表顺序、固定数量或一般相关性预设选择和依赖。项目覆盖个人，个人覆盖内置冷启方法。",
    inputSchema: {
      type: "object",
      properties: V1_COMMON,
      required: ["board_id"],
    },
  },
  {
    name: "goalboard_v1_planning_method_save",
    description: "在用户明确确认后保存一条项目级规划方法或覆盖；它会影响此项目后续拆分与依赖判断。",
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        method: PLANNING_METHOD_PACK,
        actor_id: V1_STRING,
        user_confirmed: { type: "boolean" },
      },
      required: ["board_id", "method", "actor_id", "user_confirmed"],
    },
  },
  {
    name: "goalboard_v1_planning_analyze_change",
    description: "用户提出新要求时，只读计算受影响的上层 Goal、下游依赖、可复用工作和重新审查顺序；不会自动改树。",
    inputSchema: {
      type: "object",
      properties: { ...V1_COMMON, changed_goal_ids: V1_STRING_ARRAY },
      required: ["board_id", "changed_goal_ids"],
    },
  },
  {
    name: "goalboard_v1_planning_graph_check",
    description: "只读检查整张 Goal 图的缺失引用、重复关系、父子循环、依赖循环和组合执行循环。",
    inputSchema: {
      type: "object",
      properties: V1_COMMON,
      required: ["board_id"],
    },
  },
  {
    name: "goalboard_v1_explain",
    description: "解释一个 Goal 的当前动作为什么可领取或被什么阻塞；role=executor 的 ready 只表示执行 Claim 就绪，不表示 complete 的验收或 completion Risk 门禁已经通过。",
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
        lease_seconds: V1_LEASE_SECONDS,
        strengthen_policy: { type: "object" },
        idempotency_key: { type: "string" },
      },
      required: ["board_id", "goal_id", "actor_id", "idempotency_key"],
    },
  },
  {
    name: "goalboard_v1_select_goal",
    description:
      "当前 Runtime 从 Available 集合选择一项后，原子创建 Claim 和工作 Run；成功后返回唯一 work_state。",
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        goal_id: { type: "string" },
        actor_id: { type: "string" },
        role: V1_CLAIM_ROLE,
        capabilities: { type: "array", items: { type: "string" } },
        goal_mode_attestation: { type: "boolean" },
        lease_seconds: V1_LEASE_SECONDS,
        strengthen_policy: { type: "object" },
        idempotency_key: { type: "string" },
      },
      required: ["board_id", "goal_id", "actor_id", "idempotency_key"],
    },
  },
  {
    name: "goalboard_v1_draft_dialogue_start",
    description:
      "初始化待澄清 Goal 的自然语言对话：无 goal_id 时原子创建最小 Draft、Claim 和 Run；已有 Goal 时保持原 Goal，并复用当前 Runtime 已选择的 clarifier Run。",
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        rough_idea: V1_STRING,
        draft_title: V1_STRING,
        goal_id: V1_STRING,
        actor_id: V1_STRING,
        capabilities: V1_STRING_ARRAY,
        goal_mode_attestation: { type: "boolean" },
        lease_seconds: V1_LEASE_SECONDS,
        idempotency_key: V1_STRING,
      },
      required: ["board_id", "rough_idea", "actor_id", "idempotency_key"],
    },
  },
  {
    name: "goalboard_v1_draft_dialogue_turn",
    description:
      "持久化用户本轮自然语言回答、当前理解、可追溯事实、明确假设及唯一下一步；没有关键未知项时写入待确认提案摘要。",
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        goal_id: V1_STRING,
        run_id: V1_STRING,
        actor_id: V1_STRING,
        user_message: V1_STRING,
        current_understanding: V1_STRING,
        known_facts: { type: "array", items: DRAFT_DIALOGUE_FACT },
        assumptions: { type: "array", items: DRAFT_DIALOGUE_ASSUMPTION },
        next_question: { type: ["string", "null"] },
        proposal_summary: { type: ["string", "null"] },
        idempotency_key: V1_STRING,
      },
      required: [
        "board_id",
        "goal_id",
        "run_id",
        "actor_id",
        "user_message",
        "current_understanding",
        "idempotency_key",
      ],
    },
  },
  {
    name: "goalboard_v1_draft_dialogue_resume",
    description:
      "在新 Session 中读取已持久化的 Goal 澄清进度；若没有活跃 Run，当前 Runtime 原子恢复 clarifier Claim 和 Run。",
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        goal_id: V1_STRING,
        actor_id: V1_STRING,
        capabilities: V1_STRING_ARRAY,
        goal_mode_attestation: { type: "boolean" },
        lease_seconds: V1_LEASE_SECONDS,
        idempotency_key: V1_STRING,
      },
      required: ["board_id", "goal_id", "actor_id", "idempotency_key"],
    },
  },
  {
    name: "goalboard_v1_goal_tree_propose",
    description:
      "当前 clarifier Runtime 原子提交一份包含多个 Goal Tree 变更条目的待确认提案；已接受叶子 Goal 的 active executor Run 也可以为同一 Goal 提交仅含 Risk 生命周期变更的提案，不能借此修改 Contract、关系或其他 Goal。提交不会提前改写 canonical GoalBoard，可通过 supersedes_proposal_id 创建修订版本。改变已有 Risk 生命周期本身是一条正式 Goal：若 clarifier 的 Goal 仍是 Draft，必须在同一提案中用完整 Contract 把它接受为 closed_leaf，不能只改 Risk 后留下空 Draft。closed_compound 的 decomposition_review 必须用 contract_coverage 逐项映射父 promised_outputs / acceptance_criteria 到后代 Contract，部分覆盖或仍需集成时保持父 Goal 开放。Risk 的 treatment=mitigate 表示降低策略；措施完成后更新为 state=resolved 并提供 resolution_basis，不存在 state=mitigated。晋升已有 pending Candidate 时使用 kind=candidate、operation=update，payload 同时提供 candidate_id、最终 proposed_goal 与 proposed_relations，并把 Candidate 和目标 Goal 都列入 affected_objects；严格启动对账还需 formal_goal_id 与 materialized_by_proposal_id。",
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        actor_id: V1_STRING,
        discovered_in_run_id: V1_STRING,
        root_goal_id: { type: ["string", "null"] },
        summary: V1_STRING,
        items: { type: "array", items: GOAL_TREE_ITEM },
        base_event_cursor: { type: "integer", minimum: 0 },
        supersedes_proposal_id: { type: ["string", "null"] },
        idempotency_key: V1_STRING,
      },
      required: ["board_id", "actor_id", "discovered_in_run_id", "summary", "items", "idempotency_key"],
    },
  },
  {
    name: "goalboard_v1_goal_tree_read",
    description:
      "读取原生 Goal Tree 提案与无损映射的历史 Contract Proposal、Candidate、Rewire；可按 proposal_id 或 root Goal 恢复对话。",
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        proposal_id: V1_STRING,
        root_goal_id: V1_STRING,
        include_legacy: { type: "boolean" },
      },
      required: ["board_id"],
    },
  },
  {
    name: "goalboard_v1_goal_tree_check",
    description:
      "按每个条目真正依赖的 canonical 事实检查并发变化，并在可回滚预检中运行与决定阶段相同的物化不变量；某个条目冲突不会改写 canonical Goal Tree，也不会隐藏其他条目的检查结果。",
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        proposal_id: V1_STRING,
        actor_id: V1_STRING,
        idempotency_key: V1_STRING,
      },
      required: ["board_id", "proposal_id", "actor_id", "idempotency_key"],
    },
  },
  {
    name: "goalboard_v1_goal_tree_decide",
    description:
      "把用户对 Goal Tree 提案的决定物化；逐项决定仍允许互不依赖的安全条目分别落地，confirm_all_pending 则全有或全无，任一冲突都会让整份确认保持未写入。Draft 上的 Risk 生命周期条目不能脱离同一轮确认中的完整 Goal Contract 单独落地；两者任一冲突时 canonical Goal 与 Risk 都不改变。管理入口必须提供可审计的用户与消息引用。",
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        proposal_id: V1_STRING,
        runtime_actor_id: V1_STRING,
        authority: {
          type: "object",
          properties: {
            actor_id: V1_STRING,
            actor_kind: { type: "string", enum: ["user"] },
            authority_source: { type: "string", enum: ["runtime_dialogue", "web", "management"] },
            conversation_ref: V1_STRING,
            message_ref: V1_STRING,
            whole_confirmation_prompted: { type: "boolean" },
          },
          required: ["actor_id", "actor_kind", "authority_source", "conversation_ref", "message_ref"],
        },
        decisions: { type: "array", minItems: 1, items: GOAL_TREE_ITEM_DECISION },
        reason: V1_STRING,
        confirm_all_pending: { type: "boolean" },
        idempotency_key: V1_STRING,
      },
      required: ["board_id", "proposal_id", "authority", "idempotency_key"],
    },
  },
  v1PayloadTool(
    "goalboard_v1_claim_renew",
    "由当前领取者为仍未过期的 active Claim 续租；保持同一个 Claim 和 Run，不会复活过期工作。",
    {
      claim_id: V1_STRING,
      actor_id: V1_STRING,
      lease_seconds: V1_RENEW_LEASE_SECONDS,
      idempotency_key: V1_STRING,
    },
    ["claim_id", "actor_id", "idempotency_key"],
  ),
  v1PayloadTool(
    "goalboard_v1_release",
    "由领取者释放 Claim。",
    { claim_id: V1_STRING, actor_id: V1_STRING, reason: V1_STRING, idempotency_key: V1_STRING },
    ["claim_id", "actor_id", "reason", "idempotency_key"],
  ),
  v1PayloadTool(
    "goalboard_v1_revoke_claim",
    "管理入口或恢复流程撤销失效 Claim，并在同一事务中中断其未结束 Run；不向 Runtime MCP 暴露。",
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
    "更新 Risk 状态并执行失效影响。state=resolved 时必须提供 resolution_basis：解决摘要、至少一条证据引用，以及明确的 residual_gaps（没有时传空数组）。",
    {
      risk: {
        type: "object",
        properties: {
          risk_id: V1_STRING,
          state: { type: "string", enum: ["open", "triggered", "resolved", "accepted", "expired"] },
          reason: V1_STRING,
          resolution_basis: {
            type: "object",
            properties: {
              summary: V1_STRING,
              evidence_refs: { ...V1_STRING_ARRAY, minItems: 1 },
              residual_gaps: V1_STRING_ARRAY,
            },
            required: ["summary", "evidence_refs", "residual_gaps"],
          },
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
    "goalboard_v1_goal_trash",
    "仅在当前用户已明确确认后，把当前项目的一条 Goal 移入可恢复回收站；不会物理删除历史。",
    {
      goal_id: V1_STRING,
      actor_id: V1_STRING,
      user_confirmed: {
        type: "boolean",
        description: "当前对话中的用户已明确要求移入回收站；含糊的“清理一下”不能传 true",
      },
      reason: V1_STRING,
      idempotency_key: V1_STRING,
    },
    ["goal_id", "actor_id", "user_confirmed", "reason", "idempotency_key"],
  ),
  v1PayloadTool(
    "goalboard_v1_goal_trash_list",
    "读取当前项目回收站中的 Goal；只读，不要求用户确认，也不打开 Web。",
    {},
    [],
  ),
  v1PayloadTool(
    "goalboard_v1_goal_restore",
    "仅在当前用户已明确确认后，恢复当前项目回收站中的一条 Goal 及可安全恢复的 Relation。",
    {
      goal_id: V1_STRING,
      actor_id: V1_STRING,
      user_confirmed: {
        type: "boolean",
        description: "当前对话中的用户已明确要求恢复这条 Goal",
      },
      reason: V1_STRING,
      idempotency_key: V1_STRING,
    },
    ["goal_id", "actor_id", "user_confirmed", "reason", "idempotency_key"],
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
    "提交与验收条件绑定的 Evidence；GoalBoard 会只读预检当前项目内文件与 Markdown anchor，外部或不透明 locator 保留但明确标为 UNVERIFIED。",
    {
      goal_id: V1_STRING,
      actor_id: V1_STRING,
      criterion_ids: V1_STRING_ARRAY,
      run_id: { type: ["string", "null"] },
      review_id: { type: ["string", "null"] },
      kind: { type: "string", enum: ["test", "measurement", "artifact", "inspection", "attestation", "human_verdict"] },
      locator: {
        type: "string",
        description:
          "可验证的项目文件格式：普通相对路径 docs/review.md#checks、输入别名 repo:docs/review.md#checks、canonical 格式 project://docs/review.md#checks，或当前 canonical workspace 内的绝对路径。安全的 repo: 输入会统一存为 project://；HTTP 与其他不透明协议保留为 UNVERIFIED。",
      },
      digest: { type: ["string", "null"] },
      result: { type: "string", enum: ["passed", "failed", "inconclusive"] },
      idempotency_key: V1_STRING,
    },
    ["goal_id", "actor_id", "criterion_ids", "kind", "locator", "result", "idempotency_key"],
  ),
  v1PayloadTool(
    "goalboard_v1_evidence_correct",
    "以不可变更正记录替代或撤销当前 Runtime 自己提交的 Evidence；原记录始终保留，完成与 Review 只认当前有效 Evidence。",
    {
      goal_id: V1_STRING,
      actor_id: V1_STRING,
      target_evidence_id: V1_STRING,
      action: { type: "string", enum: ["supersede", "retract"] },
      replacement_evidence_id: { type: ["string", "null"] },
      reason: V1_STRING,
      idempotency_key: V1_STRING,
    },
    ["goal_id", "actor_id", "target_evidence_id", "action", "reason", "idempotency_key"],
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

const CONTEXT_TOOLS: McpToolDefinition[] = [
  {
    name: "goalboard_v1_context_resolve",
    description:
      "由统一 GoalBoard Skill 显式解析当前 Runtime 宿主提供的稳定工作入口；本工具只读，候选、目录和历史本身都不授权绑定。若用户当前消息已经明确要求用 GoalBoard 连接或推进一个已命名项目，且返回的现有项目中只有一个与该指代无歧义匹配，Skill 应直接调用 context_bind，不要让用户重复确认；否则，suggested 时展示候选并询问，unbound 时展示项目列表并询问选择或新建。仅提到项目、含糊表达或宿主线索都不能当成选择。",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "goalboard_v1_context_list_projects",
    description:
      "列出 GoalBoard 自己管理的项目、当前 Runtime 工作入口状态及宿主建议；不暴露数据库路径，也不创建或修改绑定。给用户展示时只显示项目名，不要展示 project_id 或数据库路径。",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "goalboard_v1_context_reject_suggestion",
    description:
      "用户在当前 Runtime 对话明确拒绝一个宿主建议项目后，停止在当前 Session 重复建议它；不绑定、不删除项目，也不影响其他 Session。user_confirmed=true 只能用于用户在当前对话明确说出拒绝（例如「不是这个」）；沉默、超时或含糊回答不能调用本工具。",
    inputSchema: {
      type: "object",
      properties: {
        project_id: V1_STRING,
        actor_id: V1_STRING,
        user_confirmed: { type: "boolean", description: "当前对话中用户已明确拒绝这个候选项目" },
      },
      required: ["project_id", "actor_id", "user_confirmed"],
    },
  },
  {
    name: "goalboard_v1_context_bind",
    description:
      "用户在当前 Runtime 对话明确选择项目后建立关联。普通选择会记录当前目录用过这个项目，但新 Session 仍需询问；有 Session ID 时同时只绑定当前 Session。只有用户另行明确要求设为目录默认时才能传 binding_scope=workspace_default；binding_scope=session 只影响当前 Session。",
    inputSchema: {
      type: "object",
      properties: {
        project_id: V1_STRING,
        actor_id: V1_STRING,
        user_confirmed: { type: "boolean", description: "当前对话中用户已明确选择此项目" },
        rebind_confirmed: { type: "boolean", description: "已有绑定改到其他项目时，用户已明确确认切换" },
        binding_scope: {
          type: "string",
          enum: ["workspace_default", "session"],
          description: "workspace_default 供同目录新 Session 自动恢复；session 只影响当前 Session",
        },
      },
      required: ["project_id", "actor_id", "user_confirmed"],
    },
  },
  {
    name: "goalboard_v1_context_unbind",
    description:
      "用户明确要求后解除关联。默认只移除当前 Session 覆盖；binding_scope=workspace 时移除当前目录与指定项目的长期关联。不会删除项目或数据库。",
    inputSchema: {
      type: "object",
      properties: {
        actor_id: V1_STRING,
        user_confirmed: { type: "boolean", description: "当前对话中用户已明确要求解除当前工作入口的绑定" },
        binding_scope: { type: "string", enum: ["session", "workspace"] },
        project_id: { type: "string", description: "解除 workspace 关联时必填" },
      },
      required: ["actor_id", "user_confirmed"],
    },
  },
  {
    name: "goalboard_v1_context_create_and_bind",
    description:
      "用户在当前 Runtime 对话明确要求新建项目时，在 GoalBoard 自己的数据目录创建项目并绑定当前工作入口；不修改项目文件或 Runtime 配置。调用前必须先向用户复述项目名并取得明确确认。",
    inputSchema: {
      type: "object",
      properties: {
        display_name: V1_STRING,
        actor_id: V1_STRING,
        user_confirmed: { type: "boolean", description: "当前对话中用户已明确要求创建这个项目" },
        rebind_confirmed: { type: "boolean", description: "已有绑定改到新项目时，用户已明确确认切换" },
        binding_scope: {
          type: "string",
          enum: ["workspace_default", "session"],
          description: "新项目成为目录默认，或只在当前 Session 使用",
        },
        idempotency_key: V1_STRING,
      },
      required: ["display_name", "actor_id", "user_confirmed", "idempotency_key"],
    },
  },
  {
    name: "goalboard_v1_project_delete",
    description:
      "在当前对话获得独立删除确认后，删除一个 GoalBoard 托管项目、其绑定和数据库；有有效 Claim 或未结束 Run 时拒绝删除。",
    inputSchema: {
      type: "object",
      properties: {
        project_id: V1_STRING,
        actor_id: V1_STRING,
        delete_confirmed: { type: "boolean", description: "用户已在当前对话单独明确确认删除此项目及其数据库" },
        idempotency_key: V1_STRING,
      },
      required: ["project_id", "actor_id", "delete_confirmed", "idempotency_key"],
    },
  },
];

const TOOLS: McpToolDefinition[] = [...V1_TOOLS, ...CONTEXT_TOOLS];

const RUNTIME_V1_TOOL_NAMES = new Set([
  "goalboard_v1_snapshot",
  "goalboard_v1_contract",
  "goalboard_v1_project_guidance_get",
  "goalboard_v1_project_guidance_add",
  "goalboard_v1_project_guidance_update",
  "goalboard_v1_ready",
  "goalboard_v1_available",
  "goalboard_v1_planning_methods",
  "goalboard_v1_planning_method_save",
  "goalboard_v1_planning_analyze_change",
  "goalboard_v1_planning_graph_check",
  "goalboard_v1_explain",
  "goalboard_v1_claim",
  "goalboard_v1_select_goal",
  "goalboard_v1_draft_dialogue_start",
  "goalboard_v1_draft_dialogue_turn",
  "goalboard_v1_draft_dialogue_resume",
  "goalboard_v1_goal_tree_propose",
  "goalboard_v1_goal_tree_read",
  "goalboard_v1_goal_tree_check",
  "goalboard_v1_goal_tree_decide",
  "goalboard_v1_claim_renew",
  "goalboard_v1_release",
  "goalboard_v1_run_start",
  "goalboard_v1_revalidate",
  "goalboard_v1_run_report",
  "goalboard_v1_evidence_submit",
  "goalboard_v1_evidence_correct",
  "goalboard_v1_review_submit",
  "goalboard_v1_complete",
  "goalboard_v1_goal_trash",
  "goalboard_v1_goal_trash_list",
  "goalboard_v1_goal_restore",
  "goalboard_v1_contract_propose",
  "goalboard_v1_candidate_submit",
  "goalboard_v1_dependency_propose",
]);

const RUNTIME_CONTEXT_TOOL_NAMES = new Set([
  "goalboard_v1_context_resolve",
  "goalboard_v1_context_list_projects",
  "goalboard_v1_context_reject_suggestion",
  "goalboard_v1_context_bind",
  "goalboard_v1_context_unbind",
  "goalboard_v1_context_create_and_bind",
  "goalboard_v1_project_delete",
]);

const RUNTIME_TOOL_NAMES = new Set([...RUNTIME_V1_TOOL_NAMES, ...RUNTIME_CONTEXT_TOOL_NAMES]);

function runtimeToolDefinition(tool: McpToolDefinition): McpToolDefinition {
  const clone = structuredClone(tool);
  const inputProperties = clone.inputSchema.properties as Record<string, unknown>;
  delete inputProperties.database_path;
  delete inputProperties.web_base_url;
  if (tool.name === "goalboard_v1_goal_tree_decide") {
    delete inputProperties.authority;
    inputProperties.user_confirmed = {
      type: "boolean",
      description: "只有用户刚刚在当前对话中明确确认了这次决定时才传 true。",
    };
    inputProperties.confirmation_summary = {
      type: "string",
      description: "简要记录用户确认了什么；这是可审计的 Runtime 对话证明，不是密码学身份凭证。",
    };
    inputProperties.whole_confirmation_prompted = {
      type: "boolean",
      description: "上一问是否明确要求用户确认当前唯一整份提案；仅用于 confirm_all_pending。",
    };
    const required = clone.inputSchema.required as string[];
    clone.inputSchema.required = required
      .filter((field) => field !== "authority")
      .concat(
        required.includes("runtime_actor_id") ? [] : ["runtime_actor_id"],
        ["user_confirmed", "confirmation_summary"],
      );
    clone.description =
      "在当前 Runtime 对话中执行用户已经明确表达的 Goal Tree 决定。必须传 user_confirmed=true 和确认摘要；confirm_all_pending 全有或全无，任一冲突都会保持整份提案未写入，逐项 decisions 才允许独立安全条目分别落地。Draft 上的 Risk 生命周期条目不能脱离同一轮确认中的完整 Goal Contract 单独落地；两者任一冲突时 canonical Goal 与 Risk 都不改变。GoalBoard 结合 MCP 宿主会话元数据记录审计来源，不把 Runtime 声明伪装成密码学证明。";
    return clone;
  }
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

const RUNTIME_TOOLS = TOOLS
  .filter((tool) => RUNTIME_TOOL_NAMES.has(tool.name))
  .map(runtimeToolDefinition);

export function runtimeContextHostFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  currentWorkingDirectory: string = process.cwd(),
): GoalBoardRuntimeContextHost | null {
  const runtimeId = environment.GOALBOARD_RUNTIME_ID;
  if (!runtimeId) return null;
  const explicitContextId = environment.GOALBOARD_WORK_CONTEXT_ID?.trim() || null;
  const runtimeContextId = explicitContextId ?? stableRuntimeSessionId(runtimeId, environment);
  const projectSuggestionClues: RuntimeProjectSuggestionClue[] = [];
  const workspace = environment.PWD?.trim() || currentWorkingDirectory.trim();
  if (workspace && path.isAbsolute(workspace)) {
    projectSuggestionClues.push({ kind: "workspace", value: workspace });
  }
  const sessionTitle = environment.CLAUDE_CODE_SESSION_NAME?.trim();
  if (sessionTitle) projectSuggestionClues.push({ kind: "session_title", value: sessionTitle });
  const workspaceContext = workspace && path.isAbsolute(workspace)
    ? canonicalWorkspaceContext(workspace)
    : null;
  return {
    homeDirectory: environment.GOALBOARD_HOME,
    runtimeContext: {
      runtime_id: runtimeId,
      stable_work_context_id: runtimeContextId,
      host_declares_stable: explicitContextId
        ? environment.GOALBOARD_WORK_CONTEXT_STABLE === "true"
        : runtimeContextId != null,
      workspace: workspaceContext,
    },
    webBaseUrl: environment.GOALBOARD_WEB_URL ?? "http://127.0.0.1:4173",
    panelId: environment.GOALBOARD_PANEL_ID?.trim() || null,
    // The working directory and title are ranking hints only. They can make a
    // fresh Session suggestion useful, but never become identity or a binding.
    projectSuggestionClues,
  };
}

function canonicalWorkspaceContext(workspace: string): NonNullable<RuntimeWorkContext["workspace"]> {
  const normalized = path.resolve(workspace);
  try {
    return { canonical_path: fs.realpathSync.native(normalized), realpath_verified: true };
  } catch {
    return { canonical_path: normalized, realpath_verified: false };
  }
}

function stableRuntimeSessionId(runtimeId: string, environment: NodeJS.ProcessEnv): string | null {
  if (runtimeId === "codex") return environment.CODEX_THREAD_ID?.trim() || null;
  if (runtimeId === "claude-code") {
    return environment.CLAUDE_CODE_SESSION_ID?.trim()
      || environment.CLAUDE_SESSION_ID?.trim()
      || null;
  }
  return null;
}

const EMPTY_TOOL_CALL_CONTEXT: GoalBoardMcpToolCallContext = {
  sessionId: null,
  sessionIdSource: null,
};

function toolCallContextFromParams(params: Record<string, unknown>): GoalBoardMcpToolCallContext {
  const meta = params._meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return EMPTY_TOOL_CALL_CONTEXT;
  const metadata = meta as Record<string, unknown>;
  for (const key of ["goalboard/sessionId", "threadId", "sessionId"] as const) {
    const value = metadata[key];
    if (typeof value !== "string") continue;
    const sessionId = value.trim();
    if (sessionId) return { sessionId, sessionIdSource: key };
  }
  return EMPTY_TOOL_CALL_CONTEXT;
}

function runtimeContextKey(host: GoalBoardRuntimeContextHost): string {
  const context = host.runtimeContext;
  const workspace = context.workspace?.canonical_path ?? "no-workspace";
  return `${context.runtime_id}:${context.stable_work_context_id ?? "no-session"}:${workspace}`;
}

export class GoalBoardServer {
  audience: GoalBoardMcpAudience;
  runtimeConnection: GoalBoardRuntimeConnection | null;
  runtimeContextHost: GoalBoardRuntimeContextHost | null;
  private runtimeConnectionContextKey: string | null;
  private runtimeConnectionRefreshContextKey: string | null;

  constructor(
    audience?: GoalBoardMcpAudience | null,
    runtimeConnection?: GoalBoardRuntimeConnection | null,
    runtimeContextHost?: GoalBoardRuntimeContextHost | null,
  ) {
    this.audience =
      audience ?? (process.env.GOALBOARD_MCP_AUDIENCE === "management" ? "management" : "runtime");
    // Explicit constructor injection is reserved for tests and embedding. A
    // production Runtime never inherits a static project DB from environment.
    this.runtimeConnection = runtimeConnection ?? null;
    this.runtimeConnectionContextKey = runtimeConnection ? "explicit" : null;
    this.runtimeConnectionRefreshContextKey = null;
    this.runtimeContextHost =
      runtimeContextHost ?? (this.runtimeConnection ? null : runtimeContextHostFromEnvironment());
  }

  async callTool(
    name: string,
    arguments_: Record<string, unknown>,
    callContext: GoalBoardMcpToolCallContext = EMPTY_TOOL_CALL_CONTEXT,
  ): Promise<string> {
    this.assertToolAllowed(name, arguments_, callContext);
    await this.linkDesktopPanelHostSession(callContext);
    if (name === "goalboard_v1_context_resolve") return this.resolveRuntimeContext(callContext);
    if (name === "goalboard_v1_context_list_projects") return this.listRuntimeProjects(callContext);
    if (name === "goalboard_v1_context_reject_suggestion") return this.rejectRuntimeContextSuggestion(arguments_, callContext);
    if (name === "goalboard_v1_context_bind") return this.bindRuntimeContext(arguments_, callContext);
    if (name === "goalboard_v1_context_unbind") return this.unbindRuntimeContext(arguments_, callContext);
    if (name === "goalboard_v1_context_create_and_bind") return this.createAndBindRuntimeContext(arguments_, callContext);
    if (name === "goalboard_v1_project_delete") return this.deleteRuntimeProject(arguments_, callContext);
    return this.callV1Tool(
      name,
      arguments_,
      this.audience === "runtime" ? this.runtimeConnection : null,
      callContext,
    );
  }

  private assertToolAllowed(
    name: string,
    arguments_: Record<string, unknown>,
    callContext: GoalBoardMcpToolCallContext,
  ): void {
    if (this.audience === "management") return;
    if (!RUNTIME_TOOL_NAMES.has(name)) {
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
    if (RUNTIME_CONTEXT_TOOL_NAMES.has(name)) {
      this.requireRuntimeContextHost(callContext);
      return;
    }
    if (this.runtimeConnectionContextKey !== "explicit") {
      const host = this.requireRuntimeContextHost(callContext);
      const currentContextKey = runtimeContextKey(host);
      if (this.runtimeConnectionContextKey !== currentContextKey) {
        const invalidatedResolvedConnection = this.runtimeConnection !== null;
        this.runtimeConnection = null;
        this.runtimeConnectionContextKey = null;
        if (invalidatedResolvedConnection) {
          this.runtimeConnectionRefreshContextKey = currentContextKey;
        }
      }
      if (!this.runtimeConnection && this.runtimeConnectionRefreshContextKey === currentContextKey) {
        throw new GoalBoardV1Error(
          "mcp.context_refresh_required",
          "MCP 当前调用的 Session 身份与已解析的项目连接不连续。请只读调用 goalboard_v1_context_resolve；若返回 bound，请使用原 idempotency_key 原样重试失败调用。不要调用 context_bind，也不要再次询问用户；若未返回 bound，则按 context_resolve 的 next_action 处理。",
          {
            next_action: "context_resolve_then_retry",
            requires_bind: false,
            requires_user_confirmation: false,
            retry_same_idempotency_key: true,
            retry_when_context_status: "bound",
          },
        );
      }
    }
    if (!this.runtimeConnection) {
      throw new GoalBoardV1Error(
        "mcp.connection_incomplete",
        "MCP 尚未连接项目：请先由统一 GoalBoard Skill 调用 goalboard_v1_context_resolve，或由宿主提供固定连接",
      );
    }
    if (arguments_.board_id !== this.runtimeConnection.boardId) {
      throw new GoalBoardV1Error(
        "mcp.board_mismatch",
        `MCP 连接拒绝：Runtime 必须使用宿主固定的 board_id ${this.runtimeConnection.boardId}`,
      );
    }
  }

  private async linkDesktopPanelHostSession(
    callContext: GoalBoardMcpToolCallContext,
  ): Promise<void> {
    const host = this.runtimeContextHost;
    const panelId = host?.panelId?.trim() || "";
    const sessionId = callContext.sessionId?.trim() || "";
    if (!host || !panelId || !sessionId) return;
    await withGoalBoardProjectCatalog({ homeDirectory: host.homeDirectory }, (catalog) => {
      catalog.aliasDesktopPanelSession({
        panel_id: panelId,
        runtime_id: host.runtimeContext.runtime_id,
        host_session_id: sessionId,
        actor_id: `desktop-panel:${panelId}`,
      });
    }).catch((error: unknown) => {
      if (error instanceof GoalBoardProjectCatalogError && error.code === "catalog.panel_not_found") {
        return;
      }
      throw error;
    });
  }

  private requireRuntimeContextHost(
    callContext: GoalBoardMcpToolCallContext = EMPTY_TOOL_CALL_CONTEXT,
  ): GoalBoardRuntimeContextHost {
    if (!this.runtimeContextHost) {
      throw new GoalBoardV1Error(
        "mcp.context_host_missing",
        "MCP 宿主没有提供 Runtime 标识；无法解析 Session 或项目目录关联",
      );
    }
    if (!callContext.sessionId) return this.runtimeContextHost;
    return {
      ...this.runtimeContextHost,
      runtimeContext: {
        ...this.runtimeContextHost.runtimeContext,
        stable_work_context_id: callContext.sessionId,
        host_declares_stable: true,
      },
    };
  }

  private async resolveRuntimeContext(callContext: GoalBoardMcpToolCallContext): Promise<string> {
    const host = this.requireRuntimeContextHost(callContext);
    // A later resolve must never keep using an earlier in-process answer.
    this.runtimeConnection = null;
    this.runtimeConnectionContextKey = null;
    return withGoalBoardProjectCatalog({ homeDirectory: host.homeDirectory }, (catalog) => {
      return this.contextResolutionResponse(
        catalog.resolveRuntimeContext(host.runtimeContext, host.projectSuggestionClues),
        host,
      );
    });
  }

  private async listRuntimeProjects(callContext: GoalBoardMcpToolCallContext): Promise<string> {
    const host = this.requireRuntimeContextHost(callContext);
    return withGoalBoardProjectCatalog({ homeDirectory: host.homeDirectory }, (catalog) => {
      const current = catalog.resolveRuntimeContext(host.runtimeContext, host.projectSuggestionClues);
      if (current.status !== "bound") {
        this.runtimeConnection = null;
        this.runtimeConnectionContextKey = null;
        this.runtimeConnectionRefreshContextKey = null;
      }
      return JSON.stringify(
        {
          context: current.context,
          status: current.status,
          reason: current.reason,
          next_action: current.next_action,
          current_project: current.project,
          suggested_projects: current.suggested_projects,
          projects: catalog.listProjects().map((project) => ({
            project_id: project.project_id,
            display_name: project.display_name,
            board_id: project.board_id,
            source: project.source,
          })),
        },
        null,
        2,
      );
    });
  }

  private async rejectRuntimeContextSuggestion(
    arguments_: Record<string, unknown>,
    callContext: GoalBoardMcpToolCallContext,
  ): Promise<string> {
    const host = this.requireRuntimeContextHost(callContext);
    return withGoalBoardProjectCatalog({ homeDirectory: host.homeDirectory }, (catalog) => {
      const result = catalog.rejectRuntimeContextSuggestion({
        context: host.runtimeContext,
        project_id: typeof arguments_.project_id === "string" ? arguments_.project_id : "",
        actor_id: typeof arguments_.actor_id === "string" ? arguments_.actor_id : "",
        user_confirmed: arguments_.user_confirmed === true,
        suggestion_clues: host.projectSuggestionClues ?? [],
      });
      // A rejection only applies while unbound. Do not let an earlier process
      // connection survive a new suggestion-first routing decision.
      this.runtimeConnection = null;
      this.runtimeConnectionContextKey = null;
      this.runtimeConnectionRefreshContextKey = null;
      return JSON.stringify(result, null, 2);
    });
  }

  private async bindRuntimeContext(
    arguments_: Record<string, unknown>,
    callContext: GoalBoardMcpToolCallContext,
  ): Promise<string> {
    const host = this.requireRuntimeContextHost(callContext);
    return withGoalBoardProjectCatalog({ homeDirectory: host.homeDirectory }, (catalog) => {
      const resolution = catalog.bindRuntimeContext({
        context: host.runtimeContext,
        project_id: typeof arguments_.project_id === "string" ? arguments_.project_id : "",
        actor_id: typeof arguments_.actor_id === "string" ? arguments_.actor_id : "",
        user_confirmed: arguments_.user_confirmed === true,
        rebind_confirmed: arguments_.rebind_confirmed === true,
        binding_scope: arguments_.binding_scope === "workspace_default" || arguments_.binding_scope === "session"
          ? arguments_.binding_scope
          : undefined,
      });
      return this.contextResolutionResponse(resolution, host);
    });
  }

  private async unbindRuntimeContext(
    arguments_: Record<string, unknown>,
    callContext: GoalBoardMcpToolCallContext,
  ): Promise<string> {
    const host = this.requireRuntimeContextHost(callContext);
    return withGoalBoardProjectCatalog({ homeDirectory: host.homeDirectory }, (catalog) => {
      const result = catalog.unbindRuntimeContext({
        context: host.runtimeContext,
        actor_id: typeof arguments_.actor_id === "string" ? arguments_.actor_id : "",
        user_confirmed: arguments_.user_confirmed === true,
        binding_scope: arguments_.binding_scope === "workspace" ? "workspace" : "session",
        project_id: typeof arguments_.project_id === "string" ? arguments_.project_id : undefined,
      });
      this.runtimeConnection = null;
      this.runtimeConnectionContextKey = null;
      this.runtimeConnectionRefreshContextKey = null;
      return JSON.stringify(result, null, 2);
    });
  }

  private async createAndBindRuntimeContext(
    arguments_: Record<string, unknown>,
    callContext: GoalBoardMcpToolCallContext,
  ): Promise<string> {
    const host = this.requireRuntimeContextHost(callContext);
    return withGoalBoardProjectCatalog({ homeDirectory: host.homeDirectory }, async (catalog) => {
      const resolution = await catalog.createProjectAndBindRuntimeContext({
        context: host.runtimeContext,
        display_name: typeof arguments_.display_name === "string" ? arguments_.display_name : "",
        actor_id: typeof arguments_.actor_id === "string" ? arguments_.actor_id : "",
        user_confirmed: arguments_.user_confirmed === true,
        rebind_confirmed: arguments_.rebind_confirmed === true,
        binding_scope: arguments_.binding_scope === "workspace_default" || arguments_.binding_scope === "session"
          ? arguments_.binding_scope
          : undefined,
        idempotency_key: typeof arguments_.idempotency_key === "string" ? arguments_.idempotency_key : "",
      });
      return this.contextResolutionResponse(resolution, host);
    });
  }

  private async deleteRuntimeProject(
    arguments_: Record<string, unknown>,
    callContext: GoalBoardMcpToolCallContext,
  ): Promise<string> {
    const host = this.requireRuntimeContextHost(callContext);
    return withGoalBoardProjectCatalog({ homeDirectory: host.homeDirectory }, async (catalog) => {
      const result = await catalog.deleteProject({
        project_id: typeof arguments_.project_id === "string" ? arguments_.project_id : "",
        actor_id: typeof arguments_.actor_id === "string" ? arguments_.actor_id : "",
        delete_confirmed: arguments_.delete_confirmed === true,
        idempotency_key: typeof arguments_.idempotency_key === "string" ? arguments_.idempotency_key : "",
      });
      if (catalog.resolveRuntimeContext(host.runtimeContext, host.projectSuggestionClues).status !== "bound") {
        this.runtimeConnection = null;
        this.runtimeConnectionContextKey = null;
        this.runtimeConnectionRefreshContextKey = null;
      }
      return JSON.stringify(result, null, 2);
    });
  }

  private contextResolutionResponse(
    resolution: GoalBoardRuntimeContextResolution,
    host: GoalBoardRuntimeContextHost,
  ): string {
    const webBaseUrl = host.webBaseUrl ?? "http://127.0.0.1:4173";
    let projectUrl: string | null = null;
    if (resolution.connection) {
      try {
        projectUrl = new URL(
          `/projects/${encodeURIComponent(resolution.connection.project_id)}`,
          webBaseUrl,
        ).toString();
      } catch {
        throw new GoalBoardV1Error("web.url_invalid", `无效的 GoalBoard Web 地址: ${webBaseUrl}`);
      }
    }
    const connection = resolution.connection
      ? { ...resolution.connection, web_base_url: webBaseUrl, project_url: projectUrl }
      : null;
    let projectGuidance: ReturnType<GoalBoardCoordinator["readProjectGuidance"]> | null = null;
    if (connection) {
      const store = new SqliteGoalBoardStore(path.resolve(connection.database_path));
      try {
        projectGuidance = new GoalBoardCoordinator(
          store,
          () => new Date(),
          readPersonalPlanningMethodPacks(host.homeDirectory),
        ).readProjectGuidance(connection.board_id);
      } finally {
        store.close();
      }
    }
    this.runtimeConnectionRefreshContextKey = null;
    if (connection) {
      this.runtimeConnection = {
        projectId: connection.project_id,
        databasePath: connection.database_path,
        boardId: connection.board_id,
        webBaseUrl,
      };
      this.runtimeConnectionContextKey = runtimeContextKey(host);
    } else {
      this.runtimeConnection = null;
      this.runtimeConnectionContextKey = null;
    }
    return JSON.stringify({
      ...resolution,
      connection,
      project_guidance: projectGuidance,
      runtime_prompt_prefix: projectGuidance?.runtime_prompt_prefix ?? null,
    }, null, 2);
  }

  private callV1Tool(
    name: string,
    arguments_: Record<string, unknown>,
    runtimeConnection: GoalBoardRuntimeConnection | null,
    callContext: GoalBoardMcpToolCallContext,
  ): string {
    const databasePath = path.resolve(
      String(
        this.audience === "runtime"
          ? runtimeConnection!.databasePath
          : arguments_.database_path ?? process.env.GOALBOARD_DATABASE ?? ".goalboard/goalboard.db",
      ),
    );
    if (name === "goalboard_v1_initialize" || name === "goalboard_v1_import_v3") {
      fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    } else if (!fs.existsSync(databasePath)) {
      throw new GoalBoardV1Error("store.not_found", `GoalBoard 数据库不存在: ${databasePath}`);
    }
    const store = new SqliteGoalBoardStore(databasePath);
    const coordinator = new GoalBoardCoordinator(
      store,
      () => new Date(),
      readPersonalPlanningMethodPacks(this.runtimeContextHost?.homeDirectory),
    );
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
        case "goalboard_v1_project_guidance_get":
          result = coordinator.readProjectGuidance(String(arguments_.board_id));
          break;
        case "goalboard_v1_project_guidance_add":
          result = coordinator.addProjectGuidance({
            board_id: String(arguments_.board_id),
            actor_id: String(arguments_.actor_id),
            kind: String(arguments_.kind) as Parameters<GoalBoardCoordinator["addProjectGuidance"]>[0]["kind"],
            content: String(arguments_.content),
            source_refs: (arguments_.source_refs as string[]) ?? [],
            reason: String(arguments_.reason),
            confirmation_summary: String(arguments_.confirmation_summary),
            user_confirmed: arguments_.user_confirmed === true,
            idempotency_key: String(arguments_.idempotency_key),
          });
          break;
        case "goalboard_v1_project_guidance_update":
          result = coordinator.updateProjectGuidance({
            board_id: String(arguments_.board_id),
            guidance_id: String(arguments_.guidance_id),
            actor_id: String(arguments_.actor_id),
            action: String(arguments_.action) as Parameters<GoalBoardCoordinator["updateProjectGuidance"]>[0]["action"],
            kind: arguments_.kind == null
              ? undefined
              : String(arguments_.kind) as Parameters<GoalBoardCoordinator["updateProjectGuidance"]>[0]["kind"],
            content: arguments_.content == null ? undefined : String(arguments_.content),
            source_refs: arguments_.source_refs == null ? undefined : arguments_.source_refs as string[],
            reason: String(arguments_.reason),
            confirmation_summary: String(arguments_.confirmation_summary),
            user_confirmed: arguments_.user_confirmed === true,
            idempotency_key: String(arguments_.idempotency_key),
          });
          break;
        case "goalboard_v1_contract": {
          const contract = coordinator.readGoalContract(
            String(arguments_.board_id),
            String(arguments_.goal_id),
          );
          const baseUrl = String(
            this.audience === "runtime"
              ? runtimeConnection!.webBaseUrl
              : arguments_.web_base_url ??
                  process.env.GOALBOARD_WEB_URL ??
                  "http://127.0.0.1:4173",
          );
          let goalUrl: string;
          try {
            const goalPath = this.audience === "runtime" && runtimeConnection?.projectId
              ? `/projects/${encodeURIComponent(runtimeConnection.projectId)}${contract.goal_path}`
              : contract.goal_path;
            goalUrl = new URL(goalPath, baseUrl).toString();
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
        case "goalboard_v1_available":
          result = coordinator.queryAvailable({
            board_id: String(arguments_.board_id),
            actor_id: String(arguments_.actor_id),
            capabilities: (arguments_.capabilities as string[]) ?? [],
            goal_mode_attestation: Boolean(arguments_.goal_mode_attestation),
          });
          break;
        case "goalboard_v1_planning_methods":
          result = {
            methods: coordinator.effectivePlanningMethods(String(arguments_.board_id)),
            composition: coordinator.projectPlanningComposition(String(arguments_.board_id)),
          };
          break;
        case "goalboard_v1_planning_method_save":
          result = coordinator.saveProjectPlanningMethod({
            board_id: String(arguments_.board_id),
            method: arguments_.method as Parameters<GoalBoardCoordinator["saveProjectPlanningMethod"]>[0]["method"],
            actor_id: String(arguments_.actor_id),
            user_confirmed: arguments_.user_confirmed === true,
          });
          break;
        case "goalboard_v1_planning_analyze_change":
          result = coordinator.analyzePlanningChange({
            board_id: String(arguments_.board_id),
            changed_goal_ids: (arguments_.changed_goal_ids as string[]) ?? [],
          });
          break;
        case "goalboard_v1_planning_graph_check":
          result = coordinator.validatePlanningGraph(String(arguments_.board_id));
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
        case "goalboard_v1_select_goal":
          result = coordinator.selectGoalAndStart(arguments_ as unknown as ClaimRequest);
          break;
        case "goalboard_v1_draft_dialogue_start":
          result = coordinator.startDraftDialogue(
            arguments_ as unknown as Parameters<GoalBoardCoordinator["startDraftDialogue"]>[0],
          );
          break;
        case "goalboard_v1_draft_dialogue_turn":
          result = coordinator.recordDraftDialogueTurn(
            arguments_ as unknown as Parameters<GoalBoardCoordinator["recordDraftDialogueTurn"]>[0],
          );
          break;
        case "goalboard_v1_draft_dialogue_resume":
          result = coordinator.resumeDraftDialogue(
            arguments_ as unknown as Parameters<GoalBoardCoordinator["resumeDraftDialogue"]>[0],
          );
          break;
        case "goalboard_v1_goal_tree_propose":
          result = coordinator.submitGoalTreeProposal(
            arguments_ as unknown as Parameters<GoalBoardCoordinator["submitGoalTreeProposal"]>[0],
          );
          break;
        case "goalboard_v1_goal_tree_read":
          result = coordinator.listGoalTreeProposals(
            arguments_ as unknown as Parameters<GoalBoardCoordinator["listGoalTreeProposals"]>[0],
          );
          break;
        case "goalboard_v1_goal_tree_check":
          result = coordinator.checkGoalTreeProposal(
            arguments_ as unknown as Parameters<GoalBoardCoordinator["checkGoalTreeProposal"]>[0],
          );
          break;
        case "goalboard_v1_goal_tree_decide": {
          if (this.audience === "runtime") {
            if (arguments_.user_confirmed !== true) {
              throw new GoalBoardV1Error(
                "mcp.user_confirmation_required",
                "只有用户刚刚在当前对话中明确确认后，Runtime 才能提交 Goal Tree 决定",
              );
            }
            const runtimeActorId = typeof arguments_.runtime_actor_id === "string"
              ? arguments_.runtime_actor_id.trim()
              : "";
            if (!runtimeActorId) {
              throw new GoalBoardV1Error(
                "mcp.runtime_actor_required",
                "当前 Runtime 决定需要稳定的 runtime_actor_id，用于审计和恢复",
              );
            }
            const confirmationSummary = typeof arguments_.confirmation_summary === "string"
              ? arguments_.confirmation_summary.trim()
              : "";
            if (!confirmationSummary) {
              throw new GoalBoardV1Error(
                "mcp.confirmation_summary_required",
                "请简要记录用户在当前对话中确认了什么",
              );
            }
            const host = this.runtimeContextHost
              ? this.requireRuntimeContextHost(callContext)
              : null;
            const runtimeId = host?.runtimeContext.runtime_id ?? "embedded-runtime";
            const workContextId = callContext.sessionId
              ?? host?.runtimeContext.stable_work_context_id
              ?? "session-unavailable";
            const conversationRef = `runtime-dialogue:${runtimeId}:${workContextId}`;
            const attestationDigest = createHash("sha256")
              .update(JSON.stringify({
                runtime_id: runtimeId,
                runtime_actor_id: runtimeActorId,
                work_context_id: workContextId,
                session_id_source: callContext.sessionIdSource,
                confirmation_summary: confirmationSummary,
                idempotency_key: String(arguments_.idempotency_key),
              }))
              .digest("hex")
              .slice(0, 20);
            result = coordinator.decideGoalTreeProposal({
              board_id: String(arguments_.board_id),
              proposal_id: String(arguments_.proposal_id),
              runtime_actor_id: runtimeActorId,
              authority: {
                actor_id: `user-confirmed-via:${runtimeId}`,
                actor_kind: "user",
                authority_source: "runtime_dialogue",
                conversation_ref: conversationRef,
                message_ref: `runtime-attestation:${attestationDigest}`,
                whole_confirmation_prompted: arguments_.whole_confirmation_prompted === true,
              },
              decisions: arguments_.decisions as Parameters<GoalBoardCoordinator["decideGoalTreeProposal"]>[0]["decisions"],
              reason: arguments_.reason == null ? confirmationSummary : String(arguments_.reason),
              confirm_all_pending: arguments_.confirm_all_pending === true,
              idempotency_key: String(arguments_.idempotency_key),
            });
          } else {
            result = coordinator.decideGoalTreeProposal(
              arguments_ as unknown as Parameters<GoalBoardCoordinator["decideGoalTreeProposal"]>[0],
            );
          }
          break;
        }
        case "goalboard_v1_release":
          result = coordinator.releaseClaim(this.v1Payload(arguments_));
          break;
        case "goalboard_v1_claim_renew":
          result = coordinator.renewClaim(this.v1Payload(arguments_));
          break;
        case "goalboard_v1_revoke_claim":
          result = coordinator.revokeClaim(this.v1Payload(arguments_));
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
        case "goalboard_v1_goal_trash": {
          const payload = this.v1Payload<{
            board_id: string;
            goal_id: string;
            actor_id: string;
            user_confirmed: boolean;
            reason: string;
            idempotency_key: string;
          }>(arguments_);
          this.requireGoalTrashUserConfirmation(payload.user_confirmed, "移入回收站");
          // The shared coordinator owns activity checks, Relation transitions,
          // transactionality, history, and idempotency. MCP only adapts the
          // user's confirmed current-conversation request.
          result = this.presentGoalTrashResult(
            coordinator,
            payload.board_id,
            coordinator.setGoalTrashed(
              payload.board_id,
              { goal_id: payload.goal_id, trashed: true, reason: payload.reason },
              { actor_id: payload.actor_id, idempotency_key: payload.idempotency_key },
            ),
          );
          break;
        }
        case "goalboard_v1_goal_trash_list": {
          const boardId = String(arguments_.board_id);
          result = {
            goals: coordinator.listTrashedGoals(boardId),
            observed_event_cursor: store.eventCursor(boardId),
          };
          break;
        }
        case "goalboard_v1_goal_restore": {
          const payload = this.v1Payload<{
            board_id: string;
            goal_id: string;
            actor_id: string;
            user_confirmed: boolean;
            reason: string;
            idempotency_key: string;
          }>(arguments_);
          this.requireGoalTrashUserConfirmation(payload.user_confirmed, "恢复");
          result = this.presentGoalTrashResult(
            coordinator,
            payload.board_id,
            coordinator.setGoalTrashed(
              payload.board_id,
              { goal_id: payload.goal_id, trashed: false, reason: payload.reason },
              { actor_id: payload.actor_id, idempotency_key: payload.idempotency_key },
            ),
          );
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
          {
          const normalizedWorkspace = this.runtimeContextHost
            ? normalizeRuntimeWorkContext(this.runtimeContextHost.runtimeContext).workspace
            : undefined;
          result = coordinator.submitEvidence({
            ...this.v1Payload<Parameters<GoalBoardCoordinator["submitEvidence"]>[0]>(arguments_),
            locator_context: {
              project_root: normalizedWorkspace?.canonical_path ?? null,
              workspace_id: normalizedWorkspace?.workspace_id ?? null,
            },
          });
          break;
          }
        case "goalboard_v1_evidence_correct":
          result = coordinator.correctEvidence(this.v1Payload(arguments_));
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

  private requireGoalTrashUserConfirmation(userConfirmed: boolean, action: "移入回收站" | "恢复"): void {
    if (userConfirmed) return;
    throw new GoalBoardV1Error(
      "mcp.user_confirmation_required",
      `当前 Runtime 只有在用户明确要求${action}指定 Goal 后才能调用；请先在当前对话确认。`,
    );
  }

  private presentGoalTrashResult<T extends GoalTrashResult>(
    coordinator: GoalBoardCoordinator,
    boardId: string,
    result: T,
  ): T & {
    work_state: ReturnType<GoalBoardCoordinator["getGoalWorkState"]>;
    next_action: { kind: string; message: string } | null;
  } {
    const workState = coordinator.getGoalWorkState({
      board_id: boardId,
      goal_id: result.goal.goal_id,
    });
    if (result.status === "blocked") {
      return {
        ...result,
        work_state: workState,
        next_action: {
          kind: "finish_active_work",
          message: "这条 Goal 仍有有效 Claim 或未结束 Run；先在当前工作流结束或释放它，再由用户重新确认删除。",
        },
      };
    }
    if (result.pending_relation_ids.length > 0) {
      return {
        ...result,
        work_state: workState,
        next_action: {
          kind: "restore_related_goal",
          message: "关联 Goal 仍在回收站，相关 Relation 会保持停用；恢复另一端后再查看结果。",
        },
      };
    }
    if (result.status === "trashed") {
      return {
        ...result,
        work_state: workState,
        next_action: {
          kind: "report_recoverable_trash",
          message: "Goal 已移入回收站，历史仍被保留；用户可在当前对话随时请求恢复。",
        },
      };
    }
    if (result.status === "restored") {
      return {
        ...result,
        work_state: workState,
        next_action: {
          kind: "read_goal_contract",
          message: "Goal 已恢复；读取其 Contract 或 Available，继续当前状态允许的工作。",
        },
      };
    }
    return { ...result, work_state: workState, next_action: null };
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
          capabilities: {
            tools: {},
            resources: { subscribe: false, listChanged: false },
          },
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
          _meta?: Record<string, unknown>;
        };
        const text = await this.callTool(
          params.name,
          params.arguments || {},
          toolCallContextFromParams(params as unknown as Record<string, unknown>),
        );
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
                text: formatMcpToolError(err),
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
    if (method === "resources/templates/list") {
      return { jsonrpc: "2.0", id: msgId, result: { resourceTemplates: [] } };
    }
    return {
      jsonrpc: "2.0",
      id: msgId,
      error: { code: -32601, message: `Method not found: ${method}` },
    };
  }
}

function formatMcpToolError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof GoalBoardV1Error && error.details) {
    return `错误: ${message}\n${JSON.stringify({ code: error.code, ...error.details })}`;
  }
  if (!(error instanceof GoalBoardProjectCatalogError)) return `错误: ${message}`;
  return `错误: ${message}\n${JSON.stringify({ code: error.code, ...error.details })}`;
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

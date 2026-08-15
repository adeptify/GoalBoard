#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoalBoardCoordinator } from "../v1/coordinator.js";
import { DEMO_BOARD_ID, seedDemoBoard } from "../v1/demo.js";
import { SqliteGoalBoardStore } from "../v1/store.js";
import type { GoalPolicy } from "../v1/types.js";
import {
  renderGoalBoardWeb,
  type GoalBoardWebView,
  type WebCoverageItem,
  type WebEventRecord,
  type WebGoalStatus,
  type WebInputBinding,
  type WebPolicyBinding,
} from "./render.js";

export interface WebServerOptions {
  databasePath: string;
  boardId: string;
  demo?: boolean;
}

const REVIEW_LABELS: Record<string, string> = {
  self_verifier: "自检",
  cross_reviewer: "交叉验证",
  adversarial_reviewer: "对抗性验证",
  human_approver: "用户确认",
};

type DatabaseRow = Record<string, unknown>;

function rowText(value: unknown): string {
  return value == null ? "" : String(value);
}

function rowOptionalText(value: unknown): string | null {
  return value == null ? null : String(value);
}

function rowJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function buildGoalBoardWebView(
  store: SqliteGoalBoardStore,
  coordinator: GoalBoardCoordinator,
  options: WebServerOptions,
): GoalBoardWebView {
  const snapshot = store.snapshot(options.boardId);
  const coverage = (store.db
    .prepare("SELECT * FROM coverage_items WHERE board_id = ? ORDER BY created_at, requirement_id")
    .all(options.boardId) as DatabaseRow[]).map<WebCoverageItem>((row) => ({
    requirement_id: rowText(row.requirement_id),
    statement: rowText(row.statement),
    disposition: rowText(row.disposition),
    owner_goal_id: rowOptionalText(row.owner_goal_id),
    reason: rowOptionalText(row.reason),
    revisit_condition: rowOptionalText(row.revisit_condition),
    blocking: Boolean(row.blocking),
    created_at: rowText(row.created_at),
    updated_at: rowText(row.updated_at),
  }));
  const inputBindings = (store.db
    .prepare("SELECT * FROM input_bindings WHERE board_id = ? ORDER BY created_at, binding_id")
    .all(options.boardId) as DatabaseRow[]).map<WebInputBinding>((row) => ({
    binding_id: rowText(row.binding_id),
    goal_id: rowText(row.goal_id),
    input_name: rowText(row.input_name),
    source_type: rowText(row.source_type),
    source_ref: rowText(row.source_ref),
    snapshot_digest: rowOptionalText(row.snapshot_digest),
    state: rowText(row.state),
    reason: rowText(row.reason),
    created_by: rowText(row.created_by),
    created_at: rowText(row.created_at),
  }));
  const policyBindings = (store.db
    .prepare("SELECT * FROM policy_bindings WHERE board_id = ? ORDER BY created_at, policy_binding_id")
    .all(options.boardId) as DatabaseRow[]).map<WebPolicyBinding>((row) => ({
    policy_binding_id: rowText(row.policy_binding_id),
    goal_id: rowOptionalText(row.goal_id),
    scope: rowText(row.scope),
    policy: rowJson(row.policy_json, {}),
    state: rowText(row.state),
    created_by: rowText(row.created_by),
    reason: rowText(row.reason),
    created_at: rowText(row.created_at),
  }));
  const events = (store.db
    .prepare("SELECT * FROM events WHERE board_id = ? ORDER BY seq DESC")
    .all(options.boardId) as DatabaseRow[]).map<WebEventRecord>((row) => ({
    seq: Number(row.seq ?? 0),
    event_id: rowText(row.event_id),
    actor_id: rowText(row.actor_id),
    type: rowText(row.type),
    object_type: rowText(row.object_type),
    object_id: rowText(row.object_id),
    reason: rowText(row.reason),
    payload: rowJson(row.payload_json, null),
    at: rowText(row.at),
  }));
  const now = new Date().toISOString();
  const activeClaims = new Map(
    snapshot.claims
      .filter((claim) => claim.state === "active" && claim.expires_at > now)
      .map((claim) => [claim.goal_id, claim]),
  );
  const allGoals = snapshot.goals.map((goal) => {
    const activeClaim = activeClaims.get(goal.goal_id);
    const explanation = coordinator.explainGoal({
      board_id: options.boardId,
      goal_id: goal.goal_id,
      actor_id: "web-observer",
      goal_mode_attestation: true,
    });
    let status: WebGoalStatus;
    if (goal.archived_at) status = "archived";
    else if (goal.fulfillment_state === "satisfied") status = "satisfied";
    else if (activeClaim) status = "claimed";
    else if (goal.definition_state !== "accepted" || goal.decomposition_state !== "closed_leaf") status = "waiting";
    else if (explanation.ready) status = "ready";
    else status = "blocked";
    const passedCriteria = new Set<string>();
    for (const evidence of snapshot.evidence) {
      if (evidence.goal_id !== goal.goal_id || evidence.result !== "passed") continue;
      for (const criterionId of evidence.criterion_ids) passedCriteria.add(criterionId);
    }
    const pendingReviews = snapshot.review_obligations
      .filter((item) => item.goal_id === goal.goal_id && item.state === "pending")
      .map((item) => REVIEW_LABELS[item.role] ?? item.role);
    const riskIds = new Set(
      (store.db
        .prepare("SELECT risk_id FROM goal_risks WHERE goal_id = ? ORDER BY risk_id")
        .all(goal.goal_id) as Array<{ risk_id: string }>).map((item) => item.risk_id),
    );
    const relations = snapshot.relations.filter(
      (item) => item.from_goal_id === goal.goal_id || item.to_goal_id === goal.goal_id,
    );
    const claims = snapshot.claims.filter((item) => item.goal_id === goal.goal_id);
    const runs = snapshot.runs.filter((item) => item.goal_id === goal.goal_id);
    const evidence = snapshot.evidence.filter((item) => item.goal_id === goal.goal_id);
    const reviewObligations = snapshot.review_obligations.filter(
      (item) => item.goal_id === goal.goal_id,
    );
    const reviews = snapshot.reviews.filter((item) => item.goal_id === goal.goal_id);
    const impacts = snapshot.impacts.filter((item) => item.goal_id === goal.goal_id);
    const relatedObjectIds = new Set<string>([
      goal.goal_id,
      ...relations.map((item) => item.relation_id),
      ...impacts.map((item) => item.binding_id),
      ...riskIds,
      ...claims.map((item) => item.claim_id),
      ...runs.map((item) => item.run_id),
      ...evidence.map((item) => item.evidence_id),
      ...reviewObligations.map((item) => item.obligation_id),
      ...reviews.map((item) => item.review_id),
    ]);
    const runIds = new Set(runs.map((item) => item.run_id));
    const candidateIds = snapshot.candidates
      .filter((item) => item.discovered_in_run_id && runIds.has(item.discovered_in_run_id))
      .map((item) => item.candidate_id);
    candidateIds.forEach((id) => relatedObjectIds.add(id));
    snapshot.rewires
      .filter((item) => item.candidate_id && candidateIds.includes(item.candidate_id))
      .forEach((item) => relatedObjectIds.add(item.rewire_id));
    return {
      goal,
      status,
      status_label: status,
      reasons: explanation.reasons.filter((item) => item.code !== "claim.already_active"),
      active_claim_actor: activeClaim?.actor_id ?? null,
      active_claim: activeClaim ?? null,
      claims,
      runs,
      evidence,
      review_obligations: reviewObligations,
      reviews,
      risks: snapshot.risks.filter((item) => riskIds.has(item.risk_id)),
      impacts,
      relations,
      coverage: coverage.filter((item) => item.owner_goal_id === goal.goal_id),
      input_bindings: inputBindings.filter((item) => item.goal_id === goal.goal_id),
      policy_bindings: policyBindings.filter(
        (item) => item.goal_id == null || item.goal_id === goal.goal_id,
      ),
      events: events.filter((item) => relatedObjectIds.has(item.object_id)),
      resolved_policy: explanation.resolved_policy,
      passed_criteria: [...passedCriteria],
      pending_reviews: pendingReviews,
    };
  });
  const goals = allGoals.filter((item) => !item.goal.archived_at);
  const archivedGoals = allGoals.filter((item) => Boolean(item.goal.archived_at));
  const counts: GoalBoardWebView["counts"] = {
    ready: 0,
    claimed: 0,
    blocked: 0,
    waiting: 0,
    satisfied: 0,
    archived: archivedGoals.length,
  };
  for (const goal of goals) counts[goal.status]++;
  const fallback = goals.find((item) => item.status === "claimed") ?? goals.find((item) => item.status === "ready") ?? goals[0];
  const activeGoalId = goals.some((item) => item.goal.goal_id === snapshot.board.active_goal_id)
    ? snapshot.board.active_goal_id
    : null;
  return {
    snapshot,
    source_label: path.basename(options.databasePath),
    database_path: options.databasePath,
    demo: Boolean(options.demo),
    active_goal_id: activeGoalId ?? fallback?.goal.goal_id ?? null,
    goals,
    archived_goals: archivedGoals,
    counts,
    coverage,
    input_bindings: inputBindings,
    policy_bindings: policyBindings,
    events,
  };
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
}

function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 256_000) reject(new Error("请求内容过大"));
    });
    request.on("end", () => {
      try {
        resolve(body ? (JSON.parse(body) as Record<string, unknown>) : {});
      } catch {
        reject(new Error("请求不是有效 JSON"));
      }
    });
    request.on("error", reject);
  });
}

export function createGoalBoardWebServer(options: WebServerOptions): http.Server {
  if (options.demo && !fs.existsSync(options.databasePath)) seedDemoBoard(options.databasePath);
  return http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    try {
      if (!fs.existsSync(options.databasePath)) {
        if (url.pathname.startsWith("/api/")) {
          sendJson(response, 404, { error: "GoalBoard 数据库不存在，请先初始化" });
        } else {
          response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
          response.end("GoalBoard 数据库不存在，请先运行 goalboard v1 init。\n");
        }
        return;
      }
      const store = new SqliteGoalBoardStore(options.databasePath);
      const coordinator = new GoalBoardCoordinator(store);
      try {
        if (request.method === "GET" && url.pathname === "/health") {
          sendJson(response, 200, { status: "ok", board_id: options.boardId });
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/board") {
          sendJson(response, 200, buildGoalBoardWebView(store, coordinator, options));
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/goals") {
          const body = await readBody(request);
          const requiredText = (name: string, maximum = 4_000): string => {
            const result = typeof body[name] === "string" ? body[name].trim() : "";
            if (!result) throw new Error(`${name} 不能为空`);
            if (result.length > maximum) throw new Error(`${name} 内容过长`);
            return result;
          };
          const optionalText = (name: string): string | undefined => {
            const result = typeof body[name] === "string" ? body[name].trim() : "";
            return result || undefined;
          };
          const draftText = (name: string, maximum = 4_000): string => {
            const result = typeof body[name] === "string" ? body[name].trim() : "";
            if (result.length > maximum) throw new Error(`${name} 内容过长`);
            return result;
          };
          const priority = Number(body.priority ?? 50);
          if (!Number.isFinite(priority) || priority < 0 || priority > 100) {
            sendJson(response, 400, { error: "priority 必须是 0 到 100 的数字" });
            return;
          }
          const goalId = optionalText("goal_id");
          const parentGoalId = optionalText("parent_goal_id");
          const dependencyGoalIds = [
            ...new Set(
              (Array.isArray(body.dependency_goal_ids) ? body.dependency_goal_ids : [])
                .filter((value): value is string => typeof value === "string")
                .map((value) => value.trim())
                .filter(Boolean),
            ),
          ];
          const acceptanceStatements = [
            ...new Set(
              (Array.isArray(body.acceptance_criteria) ? body.acceptance_criteria : [])
                .filter((value): value is string => typeof value === "string")
                .map((value) => value.trim())
                .filter(Boolean),
            ),
          ];
          const knownGoalIds = new Set(
            store.snapshot(options.boardId).goals.map((goal) => goal.goal_id),
          );
          const relationTargets = [...(parentGoalId ? [parentGoalId] : []), ...dependencyGoalIds];
          const missingTargets = relationTargets.filter((target) => !knownGoalIds.has(target));
          if (missingTargets.length) {
            sendJson(response, 400, {
              error: `找不到关联 Goal: ${[...new Set(missingTargets)].join("、")}`,
            });
            return;
          }
          if (goalId && relationTargets.includes(goalId)) {
            sendJson(response, 400, { error: "新 Goal 不能依赖或属于自身" });
            return;
          }
          let created;
          try {
            created = coordinator.createGoal(
              options.boardId,
              {
                ...(goalId ? { goal_id: goalId } : {}),
                title: requiredText("title", 120),
                outcome: draftText("outcome"),
                why: draftText("why"),
                business_logic: draftText("business_logic"),
                definition_state: "draft",
                decomposition_state: "abstract",
                priority,
                acceptance_criteria: acceptanceStatements.map((statement) => ({
                  statement,
                  decision_method: "inspection",
                  pass_condition: statement,
                  required_evidence: ["inspection"],
                })),
              },
              {
                actor_id: "web-user",
                idempotency_key: String(body.idempotency_key ?? `web-goal-${randomUUID()}`),
                reason: "用户从 GoalBoard 手动录入 Goal",
              },
            );
          } catch (error) {
            sendJson(response, 400, {
              error: error instanceof Error ? error.message : String(error),
            });
            return;
          }
          if (parentGoalId) {
            coordinator.addRelation(
              options.boardId,
              {
                from_goal_id: created.goal.goal_id,
                to_goal_id: parentGoalId,
                type: "part_of",
                state: "active",
                reason: "用户创建 Goal 时指定上级 Goal",
              },
              {
                actor_id: "web-user",
                idempotency_key: `web-parent-${created.goal.goal_id}-${randomUUID()}`,
              },
            );
          }
          for (const dependencyGoalId of dependencyGoalIds) {
            coordinator.addRelation(
              options.boardId,
              {
                from_goal_id: created.goal.goal_id,
                to_goal_id: dependencyGoalId,
                type: "depends_on",
                state: "active",
                reason: "用户创建 Goal 时指定上游依赖",
              },
              {
                actor_id: "web-user",
                idempotency_key: `web-dependency-${created.goal.goal_id}-${dependencyGoalId}-${randomUUID()}`,
              },
            );
          }
          sendJson(response, 201, {
            goal: created.goal,
            goal_path: `/goals/${encodeURIComponent(created.goal.goal_id)}`,
            observed_event_cursor: store.snapshot(options.boardId).cursor,
          });
          return;
        }
        const draftGoalMatch = url.pathname.match(/^\/api\/goals\/([^/]+)\/draft$/);
        if (request.method === "POST" && draftGoalMatch) {
          const body = await readBody(request);
          const goalId = decodeURIComponent(draftGoalMatch[1]);
          const text = (name: string, maximum = 4_000): string => {
            const value = typeof body[name] === "string" ? body[name].trim() : "";
            if (value.length > maximum) throw new Error(`${name} 内容过长`);
            return value;
          };
          const list = (name: string): string[] => [
            ...new Set(
              (Array.isArray(body[name]) ? body[name] : [])
                .filter((value): value is string => typeof value === "string")
                .map((value) => value.trim())
                .filter(Boolean),
            ),
          ];
          const decompositionState = String(body.decomposition_state ?? "abstract");
          if (!["abstract", "frontier_open", "closed_leaf", "closed_compound"].includes(decompositionState)) {
            sendJson(response, 400, { error: "拆分状态不受支持" });
            return;
          }
          const priority = Number(body.priority ?? 0);
          if (!Number.isInteger(priority) || priority < 0 || priority > 100) {
            sendJson(response, 400, { error: "priority 必须是 0 到 100 的整数" });
            return;
          }
          const criteriaInput = Array.isArray(body.acceptance_criteria)
            ? body.acceptance_criteria
            : [];
          const allowedMethods = new Set([
            "automated_check",
            "measurement",
            "inspection",
            "human_decision",
          ]);
          try {
            const acceptanceCriteria = criteriaInput.map((raw, index) => {
              if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
                throw new Error(`第 ${index + 1} 条验收条件格式无效`);
              }
              const criterion = raw as Record<string, unknown>;
              const decisionMethod = String(criterion.decision_method ?? "inspection");
              if (!allowedMethods.has(decisionMethod)) {
                throw new Error(`第 ${index + 1} 条验收条件的判断方式无效`);
              }
              const target = criterion.target;
              if (
                target != null &&
                (typeof target !== "object" || Array.isArray(target))
              ) {
                throw new Error(`第 ${index + 1} 条验收条件的目标值格式无效`);
              }
              return {
                ...(String(criterion.criterion_id ?? "").trim()
                  ? { criterion_id: String(criterion.criterion_id).trim() }
                  : {}),
                statement: String(criterion.statement ?? "").trim(),
                decision_method: decisionMethod as
                  | "automated_check"
                  | "measurement"
                  | "inspection"
                  | "human_decision",
                pass_condition: String(criterion.pass_condition ?? "").trim(),
                target: (target as Record<string, unknown> | null | undefined) ?? null,
                required_evidence: [
                  ...new Set(
                    (Array.isArray(criterion.required_evidence)
                      ? criterion.required_evidence
                      : [])
                      .map(String)
                      .map((value) => value.trim())
                      .filter(Boolean),
                  ),
                ],
              };
            });
            const title = text("title", 120);
            if (!title) throw new Error("title 不能为空");
            const result = coordinator.updateDraftGoal(
              options.boardId,
              goalId,
              {
                goal_id: goalId,
                title,
                outcome: text("outcome"),
                why: text("why"),
                business_logic: text("business_logic"),
                in_scope: list("in_scope"),
                out_of_scope: list("out_of_scope"),
                constraints: list("constraints"),
                required_inputs: list("required_inputs"),
                promised_outputs: list("promised_outputs"),
                definition_state: "draft",
                decomposition_state: decompositionState as
                  | "abstract"
                  | "frontier_open"
                  | "closed_leaf"
                  | "closed_compound",
                priority,
                acceptance_criteria: acceptanceCriteria,
              },
              {
                actor_id: "web-user",
                idempotency_key: String(body.idempotency_key ?? `web-draft-${randomUUID()}`),
                reason: text("reason", 1_000),
              },
            );
            sendJson(response, 200, result);
          } catch (error) {
            sendJson(response, 400, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
          return;
        }
        const goalRiskMatch = url.pathname.match(/^\/api\/goals\/([^/]+)\/risks$/);
        if (request.method === "POST" && goalRiskMatch) {
          const body = await readBody(request);
          const treatment = String(body.treatment ?? "mitigate");
          const blockingMode = String(body.blocking_mode ?? "none");
          const probability = String(body.probability ?? "").trim();
          const impact = String(body.impact ?? "").trim();
          const owner = String(body.owner ?? "").trim();
          const reason = String(body.reason ?? "").trim();
          if (!["accept", "mitigate", "avoid", "defer"].includes(treatment)) {
            sendJson(response, 400, { error: "Risk 处理方式无效" });
            return;
          }
          if (!["none", "claim", "completion", "invalidate_on_trigger"].includes(blockingMode)) {
            sendJson(response, 400, { error: "Risk 阻塞方式无效" });
            return;
          }
          const affectedSurfaces = Array.isArray(body.affected_surfaces)
            ? [...new Set(body.affected_surfaces.map(String).map((value) => value.trim()).filter(Boolean))]
            : [];
          try {
            if (!probability || !impact || !owner || !reason) {
              throw new Error("Risk 必须填写概率、影响、负责人和登记原因");
            }
            const result = coordinator.addRisk(
              options.boardId,
              {
                goal_ids: [decodeURIComponent(goalRiskMatch[1])],
                description: String(body.description ?? "").trim(),
                probability,
                impact,
                affected_surfaces: affectedSurfaces,
                trigger: String(body.trigger ?? "").trim(),
                treatment: treatment as "accept" | "mitigate" | "avoid" | "defer",
                blocking_mode: blockingMode as
                  | "none"
                  | "claim"
                  | "completion"
                  | "invalidate_on_trigger",
                revisit_condition: String(body.revisit_condition ?? "").trim(),
                owner,
              },
              {
                actor_id: "web-user",
                idempotency_key: String(body.idempotency_key ?? `web-risk-${randomUUID()}`),
                reason,
              },
            );
            sendJson(response, 201, result);
          } catch (error) {
            sendJson(response, 400, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
          return;
        }
        const goalImpactMatch = url.pathname.match(/^\/api\/goals\/([^/]+)\/impacts$/);
        if (request.method === "POST" && goalImpactMatch) {
          const body = await readBody(request);
          const access = String(body.access ?? "read");
          const reason = String(body.reason ?? "").trim();
          if (!["read", "write", "decide", "exclusive"].includes(access)) {
            sendJson(response, 400, { error: "Impact access 无效" });
            return;
          }
          try {
            if (!reason) throw new Error("Impact 必须说明绑定原因");
            const result = coordinator.addImpact(
              options.boardId,
              {
                goal_id: decodeURIComponent(goalImpactMatch[1]),
                surface: String(body.surface ?? "").trim(),
                access: access as "read" | "write" | "decide" | "exclusive",
                input_snapshot: String(body.input_snapshot ?? "").trim() || null,
                state: "confirmed",
                reason,
              },
              {
                actor_id: "web-user",
                idempotency_key: String(body.idempotency_key ?? `web-impact-${randomUUID()}`),
              },
            );
            sendJson(response, 201, result);
          } catch (error) {
            sendJson(response, 400, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/policy-bindings") {
          const body = await readBody(request);
          const scope = String(body.scope ?? "");
          if (scope !== "project_default" && scope !== "goal") {
            sendJson(response, 400, { error: "scope 必须是 project_default 或 goal" });
            return;
          }
          const goalId = scope === "goal" ? String(body.goal_id ?? "").trim() : null;
          if (scope === "goal" && !goalId) {
            sendJson(response, 400, { error: "当前 Goal 规则必须指定 goal_id" });
            return;
          }
          const policyInput = body.policy as Record<string, unknown> | undefined;
          if (!policyInput || typeof policyInput !== "object" || Array.isArray(policyInput)) {
            sendJson(response, 400, { error: "policy 必须是完整规则对象" });
            return;
          }
          const policy: GoalPolicy = {
            goal_mode: String(policyInput.goal_mode) as GoalPolicy["goal_mode"],
            required_capabilities: Array.isArray(policyInput.required_capabilities)
              ? policyInput.required_capabilities.map(String)
              : [],
            self_verification: policyInput.self_verification === true,
            cross_reviewers: Number(policyInput.cross_reviewers),
            adversarial_reviewers: Number(policyInput.adversarial_reviewers),
            human_approval: policyInput.human_approval === true,
            max_lease_seconds: Number(policyInput.max_lease_seconds),
          };
          const reason = String(body.reason ?? "").trim();
          try {
            const result = coordinator.setPolicy(
              options.boardId,
              { goal_id: goalId, policy, reason },
              {
                actor_id: "web-user",
                idempotency_key: String(body.idempotency_key ?? `web-policy-${randomUUID()}`),
              },
            );
            sendJson(response, 200, {
              ...result,
              resolved_policy: goalId
                ? coordinator.readGoalContract(options.boardId, goalId).resolved_policy
                : null,
            });
          } catch (error) {
            sendJson(response, 400, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
          return;
        }
        const humanReviewMatch = url.pathname.match(
          /^\/api\/goals\/([^/]+)\/review-obligations\/([^/]+)\/review$/,
        );
        if (request.method === "POST" && humanReviewMatch) {
          const body = await readBody(request);
          const verdict = String(body.verdict ?? "");
          if (!["pass", "fail", "needs_changes", "inconclusive"].includes(verdict)) {
            sendJson(response, 400, {
              error: "verdict 必须是 pass、fail、needs_changes 或 inconclusive",
            });
            return;
          }
          const evidenceRefs = Array.isArray(body.evidence_refs)
            ? [...new Set(body.evidence_refs.map(String).map((item) => item.trim()).filter(Boolean))]
            : [];
          try {
            const result = coordinator.submitReview({
              board_id: options.boardId,
              goal_id: decodeURIComponent(humanReviewMatch[1]),
              obligation_id: decodeURIComponent(humanReviewMatch[2]),
              actor_id: "web-user",
              actor_kind: "user",
              verdict: verdict as "pass" | "fail" | "needs_changes" | "inconclusive",
              evidence_refs: evidenceRefs,
              reasoning: String(body.reasoning ?? "").trim(),
              idempotency_key: String(body.idempotency_key ?? `web-human-review-${randomUUID()}`),
            });
            sendJson(response, 200, result);
          } catch (error) {
            sendJson(response, 400, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
          return;
        }
        const goalArchiveMatch = url.pathname.match(/^\/api\/goals\/([^/]+)\/archive$/);
        if (request.method === "POST" && goalArchiveMatch) {
          const body = await readBody(request);
          if (typeof body.archived !== "boolean") {
            sendJson(response, 400, { error: "archived 必须是 boolean" });
            return;
          }
          const goalId = decodeURIComponent(goalArchiveMatch[1]);
          try {
            const result = coordinator.setGoalArchived(
              options.boardId,
              {
                goal_id: goalId,
                archived: body.archived,
                reason: String(
                  body.reason ??
                    (body.archived ? "用户从 GoalBoard 归档已完成 Goal" : "用户从 GoalBoard 恢复归档 Goal"),
                ),
              },
              {
                actor_id: "web-user",
                idempotency_key: String(body.idempotency_key ?? `web-archive-${randomUUID()}`),
              },
            );
            sendJson(response, 200, result);
          } catch (error) {
            sendJson(response, 400, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
          return;
        }
        const contractProposalMatch = url.pathname.match(
          /^\/api\/contract-proposals\/([^/]+)\/decision$/,
        );
        if (request.method === "POST" && contractProposalMatch) {
          const body = await readBody(request);
          const decision = String(body.decision);
          if (decision !== "approved" && decision !== "rejected") {
            sendJson(response, 400, { error: "decision 必须是 approved 或 rejected" });
            return;
          }
          const result = coordinator.decideContractProposal({
            board_id: options.boardId,
            proposal_id: decodeURIComponent(contractProposalMatch[1]),
            actor_id: "web-user",
            actor_kind: "user",
            decision,
            reason: String(
              body.reason ??
                (decision === "approved"
                  ? "用户从 GoalBoard 确认完整 Contract"
                  : "用户从 GoalBoard 退回 Contract 补全提案"),
            ),
            idempotency_key: String(body.idempotency_key ?? `web-${randomUUID()}`),
          });
          sendJson(response, 200, result);
          return;
        }
        const candidateMatch = url.pathname.match(/^\/api\/candidates\/([^/]+)\/decision$/);
        if (request.method === "POST" && candidateMatch) {
          const body = await readBody(request);
          const decision = String(body.decision);
          if (decision !== "approved" && decision !== "rejected") {
            sendJson(response, 400, { error: "decision 必须是 approved 或 rejected" });
            return;
          }
          const result = coordinator.decideCandidate({
            board_id: options.boardId,
            candidate_id: decodeURIComponent(candidateMatch[1]),
            actor_id: "web-user",
            actor_kind: "user",
            decision,
            reason: String(body.reason ?? "用户从 Web UI 做出决定"),
            idempotency_key: String(body.idempotency_key ?? `web-${randomUUID()}`),
          });
          sendJson(response, 200, result);
          return;
        }
        const rewireMatch = url.pathname.match(/^\/api\/rewires\/([^/]+)\/(?:decision|confirm)$/);
        if (request.method === "POST" && rewireMatch) {
          const body = await readBody(request);
          const decision = String(body.decision ?? "confirmed");
          if (decision !== "confirmed" && decision !== "rejected") {
            sendJson(response, 400, { error: "decision 必须是 confirmed 或 rejected" });
            return;
          }
          const result = coordinator.confirmRewire({
            board_id: options.boardId,
            rewire_id: decodeURIComponent(rewireMatch[1]),
            actor_id: "web-user",
            actor_kind: "user",
            decision,
            reason: String(
              body.reason ??
                (decision === "confirmed"
                  ? "用户从 Web UI 确认 Goal Spine 线路"
                  : "用户从 Web UI 拒绝这次关系调整"),
            ),
            idempotency_key: String(body.idempotency_key ?? `web-${randomUUID()}`),
          });
          sendJson(response, 200, result);
          return;
        }
        const goalPageMatch = url.pathname.match(/^\/goals\/([^/]+)$/);
        const archivePageMatch = url.pathname.match(/^\/archive\/goals\/([^/]+)$/);
        const archiveIndex = url.pathname === "/archive";
        if (
          request.method === "GET" &&
          (url.pathname === "/" || goalPageMatch || archiveIndex || archivePageMatch)
        ) {
          let requestedGoalId: string | undefined;
          if (goalPageMatch || archivePageMatch) {
            try {
              requestedGoalId = decodeURIComponent((goalPageMatch ?? archivePageMatch)![1]);
            } catch {
              sendJson(response, 404, { error: "Goal 页面不存在" });
              return;
            }
          }
          const view = buildGoalBoardWebView(store, coordinator, options);
          const requestedArchived = requestedGoalId
            ? view.archived_goals.some((item) => item.goal.goal_id === requestedGoalId)
            : false;
          const archiveView = archiveIndex || Boolean(archivePageMatch) || requestedArchived;
          const collection = archiveView ? view.archived_goals : view.goals;
          if (requestedGoalId && !collection.some((item) => item.goal.goal_id === requestedGoalId)) {
            sendJson(response, 404, { error: `找不到这个 Goal: ${requestedGoalId}` });
            return;
          }
          const html = renderGoalBoardWeb(view, requestedGoalId, archiveView);
          response.writeHead(200, {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
          });
          response.end(html);
          return;
        }
        sendJson(response, 404, { error: "页面或接口不存在" });
      } finally {
        store.close();
      }
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const args = process.argv.slice(2);
  const demo = args.includes("--demo");
  const databasePath = path.resolve(flag(args, "--db") ?? (demo ? ".goalboard/demo.db" : ".goalboard/goalboard.db"));
  const boardId = flag(args, "--board-id") ?? (demo ? DEMO_BOARD_ID : "default");
  const port = Number(flag(args, "--port") ?? 4173);
  const server = createGoalBoardWebServer({ databasePath, boardId, demo });
  server.listen(port, "127.0.0.1", () => {
    console.log(`GoalBoard Web: http://127.0.0.1:${port}`);
    console.log(`SQLite: ${databasePath}`);
  });
}

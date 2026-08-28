#!/usr/bin/env node
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoalBoardCoordinator, GoalBoardV1Error } from "../v1/coordinator.js";
import { seedDemoBoard } from "../v1/demo.js";
import { SqliteGoalBoardStore } from "../v1/store.js";
import type { GoalPolicy, GoalRelationRecord, GoalTreeProposalItemInput, RiskRecord } from "../v1/types.js";
import {
  GoalBoardProjectCatalog,
  GoalBoardProjectCatalogError,
  readPersonalPlanningMethodPacks,
} from "../projects/catalog.js";
import { withGoalBoardProjectCatalog } from "../projects/catalog-session.js";
import { desktopAdvancePrompt } from "../desktop/advance-prompt.js";
import { desktopLaunchSpec, desktopPanelEnv, desktopRuntimeTitle, isDesktopRuntimeKind } from "../desktop/launch.js";
import { desktopCookieHeaders, isDesktopShellRequest } from "./desktop-shell.js";
import { goalTreeProposalItemValidationIssues } from "../v1/goal-tree-proposal-validation.js";
import { goalTreeProposalDecompositionIssues } from "../v1/goal-decomposition-validation.js";
import { isPtyCommandAvailable, type GoalBoardPtyHost } from "./pty-host.js";
import { attachGoalBoardPtySocket } from "./pty-socket.js";
import { resolveWebControlToken } from "./control-token.js";
import type {
  GoalBoardProjectRecord,
  GoalBoardRuntimeContextBinding,
  RuntimeWorkContext,
} from "../projects/catalog.js";
import {
  RuntimeIntegrationService,
  isSupportedRuntimeId,
  type SupportedRuntimeId,
} from "../install/runtime-integration.js";
import {
  GoalBoardWebServiceManager,
  type GoalBoardWebServiceAction,
} from "../install/web-service.js";
import {
  renderGoalDocumentFragment,
  renderGoalRecordEventsFragment,
  renderGoalRecordsFragment,
  renderGoalBoardWorkbenchClientScript,
  renderGoalBoardWorkbenchStylesheet,
  renderGoalBoardWeb,
  renderGoalBoardProjectIndex,
  renderGoalBoardProjectSettings,
  renderGoalBoardPlanningLibrary,
  renderGoalBoardPlanningMethodPage,
  renderGoalBoardPlanningSettings,
  renderGoalBoardSettings,
  WEB_GOAL_STATUSES,
  type GoalBoardWebView,
  type WebCoverageItem,
  type WebEventRecord,
  type WebGoalStatus,
  type WebInputBinding,
  type WebInstallationDiagnostics,
  type WebPolicyBinding,
  type WebProjectNavigation,
  type WebRiskRecord,
  type WebSettingsConnection,
  type WebSettingsProject,
  type WebSettingsSection,
  type WebSettingsWorkspaceMembership,
} from "./render.js";
import {
  normalizePlanningMethodPack,
  resolvePlanningMethodPacks,
  type PlanningMethodPackInput,
} from "../planning/method-packs.js";
import {
  L,
  isWebLocale,
  localeSetCookie,
  resolveWebLocale,
  runWithLocale,
  safeNextPath,
} from "./i18n.js";
import { goalPresentationState } from "./human-language.js";
import { buildCapsuleSnapshot, renderCapsuleShell } from "./capsule.js";
import {
  ProjectReferenceError,
  readProjectReference,
} from "../evidence/locator.js";

export { resolveWebControlToken, WEB_CONTROL_TOKEN_RELATIVE_PATH } from "./control-token.js";

export interface WebServerOptions {
  /**
   * In-process fixture input. The public Web command always starts from the
   * GoalBoard project catalog and never accepts a database path.
   */
  databasePath?: string;
  boardId?: string;
  /** GoalBoard-owned catalog directory. Defaults to ~/.goalboard. */
  homeDirectory?: string;
  demo?: boolean;
  /**
   * Read-only root for Evidence locators that name a project-relative file.
   * The server never exposes an arbitrary local path.
   */
  projectRoot?: string;
  /** Shared in-process Runtime integration service. Tests may inject a fixture. */
  runtimeIntegrationService?: RuntimeIntegrationService;
  /** Shared service manager so Web previews and confirmations use one in-memory plan. */
  webServiceManager?: GoalBoardWebServiceManager;
  /** Test-only deterministic local Web control token. Production persists one per GoalBoard home. */
  controlToken?: string;
}

interface ResolvedWebBoardOptions {
  databasePath: string;
  boardId: string;
  demo?: boolean;
  projectRoot?: string;
  project: WebProjectNavigation | null;
  projects: WebProjectNavigation[];
  routePrefix: string;
}

type WebViewOptions = Pick<
  ResolvedWebBoardOptions,
  "databasePath" | "boardId" | "demo" | "projectRoot"
> & Partial<Pick<ResolvedWebBoardOptions, "project" | "projects" | "routePrefix">>;

interface GoalBoardWebViewCacheEntry {
  cursor: number;
  optionsFingerprint: string;
  view: GoalBoardWebView;
}

type GoalBoardWebViewCache = Map<string, GoalBoardWebViewCacheEntry>;

type ResolvedWebRequest =
  | { kind: "catalog_index"; projects: WebProjectNavigation[] }
  | { kind: "project_not_found" }
  | { kind: "board"; pathname: string; options: ResolvedWebBoardOptions };

const REVIEW_LABELS: Record<string, string> = {
  self_verifier: "自检",
  cross_reviewer: "交叉验证",
  adversarial_reviewer: "对抗性验证",
  human_approver: "用户确认",
};

const RELATION_TYPES = new Set<GoalRelationRecord["type"]>([
  "part_of",
  "depends_on",
  "conflicts_with",
  "mitigates",
  "extends",
  "replaces",
  "corrects",
  "invalidates",
  "migrates_from",
]);

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

function uniqueTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))];
}

function webRiskFacts(
  body: Record<string, unknown>,
  fallbackGoalId?: string,
): Omit<Parameters<GoalBoardCoordinator["addRisk"]>[1], "risk_id"> {
  const treatment = String(body.treatment ?? "mitigate") as RiskRecord["treatment"];
  const blockingMode = String(body.blocking_mode ?? "none") as RiskRecord["blocking_mode"];
  if (!["accept", "mitigate", "avoid", "defer"].includes(treatment)) {
    throw new Error("Risk 处理方式无效");
  }
  if (!["none", "claim", "completion", "invalidate_on_trigger"].includes(blockingMode)) {
    throw new Error("Risk 阻塞方式无效");
  }
  const suppliedGoalIds = uniqueTextArray(body.goal_ids);
  return {
    goal_ids: suppliedGoalIds.length ? suppliedGoalIds : fallbackGoalId ? [fallbackGoalId] : [],
    description: String(body.description ?? "").trim(),
    probability: String(body.probability ?? "").trim(),
    impact: String(body.impact ?? "").trim(),
    affected_surfaces: uniqueTextArray(body.affected_surfaces),
    trigger: String(body.trigger ?? "").trim(),
    treatment,
    treatment_plan: String(body.treatment_plan ?? "").trim(),
    blocking_mode: blockingMode,
    revisit_condition: String(body.revisit_condition ?? "").trim(),
    owner: String(body.owner ?? "").trim(),
  };
}

function webImpactFacts(
  body: Record<string, unknown>,
  fallbackGoalId?: string,
): Omit<Parameters<GoalBoardCoordinator["addImpact"]>[1], "binding_id"> {
  const access = String(body.access ?? "read") as Parameters<GoalBoardCoordinator["addImpact"]>[1]["access"];
  const state = String(body.state ?? "confirmed") as "proposed" | "confirmed";
  if (!["read", "write", "decide", "exclusive"].includes(access)) {
    throw new Error("Impact access 无效");
  }
  if (!["proposed", "confirmed"].includes(state)) {
    throw new Error("Impact 状态必须是提议中或已确认");
  }
  return {
    goal_id: String(fallbackGoalId ?? body.goal_id ?? "").trim(),
    surface: String(body.surface ?? "").trim(),
    access,
    input_snapshot: String(body.input_snapshot ?? "").trim() || null,
    state,
    reason: String(body.reason ?? "").trim(),
  };
}

export function buildGoalBoardWebView(
  store: SqliteGoalBoardStore,
  coordinator: GoalBoardCoordinator,
  options: WebViewOptions,
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
  const riskGoalIds = new Map<string, string[]>();
  for (const row of store.db
    .prepare("SELECT risk_id, goal_id FROM goal_risks ORDER BY risk_id, goal_id")
    .all() as DatabaseRow[]) {
    const riskId = rowText(row.risk_id);
    riskGoalIds.set(riskId, [...(riskGoalIds.get(riskId) ?? []), rowText(row.goal_id)]);
  }
  const webRisks: WebRiskRecord[] = snapshot.risks.map((risk) => ({
    ...risk,
    goal_ids: riskGoalIds.get(risk.risk_id) ?? [],
  }));
  const workStates = new Map(
    coordinator.getGoalWorkStates({ board_id: options.boardId, snapshot }).map((state) => [state.goal_id, state]),
  );
  const allGoals = snapshot.goals.map((goal) => {
    const workState = workStates.get(goal.goal_id);
    if (!workState) throw new Error(`Goal 工作状态不存在: ${goal.goal_id}`);
    const activeClaim = workState.active_claim;
    const resolvedPolicy = coordinator.getResolvedGoalPolicy({
      board_id: options.boardId,
      goal_id: goal.goal_id,
    });
    const status: WebGoalStatus = goalPresentationState(
      workState.work_state,
      goal,
      snapshot,
      workState.reasons,
    );
    const passedCriteria = new Set<string>();
    for (const evidence of snapshot.evidence) {
      if (
        evidence.goal_id !== goal.goal_id ||
        evidence.result !== "passed" ||
        evidence.lifecycle_state !== "effective"
      ) continue;
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
    const evidenceCorrectionIds = snapshot.evidence_corrections
      .filter((item) => item.goal_id === goal.goal_id)
      .map((item) => item.correction_id);
    const reviewObligations = snapshot.review_obligations.filter(
      (item) => item.goal_id === goal.goal_id,
    );
    const reviews = snapshot.reviews.filter((item) => item.goal_id === goal.goal_id);
    const impacts = snapshot.impacts.filter((item) => item.goal_id === goal.goal_id);
    const contractProposalIds = snapshot.contract_proposals
      .filter((item) => item.goal_id === goal.goal_id)
      .map((item) => item.proposal_id);
    const clarificationSessionIds = snapshot.clarification_sessions
      .filter((item) => item.goal_id === goal.goal_id)
      .map((item) => item.session_id);
    const clarificationTurnIds = snapshot.clarification_turns
      .filter((item) => item.goal_id === goal.goal_id)
      .map((item) => item.turn_id);
    const goalTreeProposals = snapshot.goal_tree_proposals.filter((proposal) => {
      if (proposal.root_goal_id === goal.goal_id) return true;
      return proposal.items.some((item) => {
        const objectTouchesGoal = [...item.affected_objects, ...item.materialized_objects].some(
          (object) => object.object_type === "goal" && object.object_id === goal.goal_id,
        );
        if (objectTouchesGoal) return true;
        const payloadGoalIds = [
          item.payload.goal_id,
          item.payload.from_goal_id,
          item.payload.to_goal_id,
          ...(Array.isArray(item.payload.goal_ids) ? item.payload.goal_ids : []),
        ].map((value) => String(value ?? ""));
        return payloadGoalIds.includes(goal.goal_id);
      });
    });
    const goalTreeProposalIds = goalTreeProposals.map((item) => item.proposal_id);
    const goalTreeProposalItemIds = goalTreeProposals.flatMap((item) => item.items.map((child) => child.item_id));
    const visiblePolicyBindingIds = policyBindings
      .filter((item) => item.goal_id == null || item.goal_id === goal.goal_id)
      .map((item) => item.policy_binding_id);
    const relatedObjectIds = new Set<string>([
      goal.goal_id,
      ...relations.map((item) => item.relation_id),
      ...impacts.map((item) => item.binding_id),
      ...riskIds,
      ...claims.map((item) => item.claim_id),
      ...runs.map((item) => item.run_id),
      ...evidence.map((item) => item.evidence_id),
      ...evidenceCorrectionIds,
      ...reviewObligations.map((item) => item.obligation_id),
      ...reviews.map((item) => item.review_id),
      ...contractProposalIds,
      ...clarificationSessionIds,
      ...clarificationTurnIds,
      ...goalTreeProposalIds,
      ...goalTreeProposalItemIds,
      ...visiblePolicyBindingIds,
    ]);
    const runIds = new Set(runs.map((item) => item.run_id));
    const candidateIds = new Set(snapshot.candidates
      .filter((item) => item.discovered_in_run_id && runIds.has(item.discovered_in_run_id))
      .map((item) => item.candidate_id));
    candidateIds.forEach((id) => relatedObjectIds.add(id));
    snapshot.rewires
      .filter((item) => {
        if (
          (item.candidate_id != null && candidateIds.has(item.candidate_id)) ||
          item.proposal.formal_goal_id === goal.goal_id
        ) {
          return true;
        }
        const relationTouchesGoal = (item.proposal.relations ?? []).some(
          (relation) =>
            String(relation.from_goal_id ?? "") === goal.goal_id ||
            String(relation.to_goal_id ?? "") === goal.goal_id,
        );
        const impactTouchesGoal = (item.proposal.impacts ?? []).some(
          (impact) => String(impact.goal_id ?? "") === goal.goal_id,
        );
        const riskTouchesGoal = (item.proposal.risks ?? []).some((risk) =>
          Array.isArray(risk.goal_ids) && risk.goal_ids.some((goalId) => String(goalId) === goal.goal_id),
        );
        return relationTouchesGoal || impactTouchesGoal || riskTouchesGoal;
      })
      .forEach((item) => relatedObjectIds.add(item.rewire_id));
    return {
      goal,
      status,
      work_state: workState.work_state,
      status_label: status,
      reasons: workState.reasons,
      active_claim_actor: activeClaim?.actor_id ?? null,
      active_claim: activeClaim ?? null,
      claims,
      runs,
      evidence,
      review_obligations: reviewObligations,
      reviews,
      risks: webRisks.filter((item) => riskIds.has(item.risk_id)),
      impacts,
      relations,
      coverage: coverage.filter((item) => item.owner_goal_id === goal.goal_id),
      input_bindings: inputBindings.filter((item) => item.goal_id === goal.goal_id),
      policy_bindings: policyBindings.filter(
        (item) => item.goal_id == null || item.goal_id === goal.goal_id,
      ),
      events: events.filter((item) => relatedObjectIds.has(item.object_id)),
      resolved_policy: resolvedPolicy,
      passed_criteria: [...passedCriteria],
      pending_reviews: pendingReviews,
    };
  });
  // Trash is intentionally absent from both the ordinary Tree and the
  // completed-only archive. The dedicated trash view selects it through the
  // shared coordinator read service instead of leaking it into normal work.
  const trashedGoalIds = new Set(
    coordinator.listTrashedGoals(options.boardId).map((goal) => goal.goal_id),
  );
  const goals = allGoals.filter((item) => !item.goal.archived_at && !item.goal.trashed_at);
  const archivedGoals = allGoals.filter((item) => Boolean(item.goal.archived_at) && !item.goal.trashed_at);
  const trashedGoals = allGoals.filter((item) => trashedGoalIds.has(item.goal.goal_id));
  const counts = Object.fromEntries(WEB_GOAL_STATUSES.map((status) => [status, 0])) as GoalBoardWebView["counts"];
  for (const goal of goals) counts[goal.status]++;
  const fallback =
    goals.find((item) => ["clarifying", "executing", "reviewing", "revalidating"].includes(item.status)) ??
    goals.find((item) => ["clarification_pending", "execution_pending", "review_pending", "revalidation_pending"].includes(item.status)) ??
    goals[0];
  const activeGoalId = goals.some((item) => item.goal.goal_id === snapshot.board.active_goal_id)
    ? snapshot.board.active_goal_id
    : null;
  return {
    // The browser works with a project name and route. The storage board id is
    // a server-side routing detail, so do not expose it in a project Web view.
    snapshot: options.project
      ? { ...snapshot, board: { ...snapshot.board, board_id: "" } }
      : snapshot,
    project: options.project ?? null,
    projects: options.projects ?? [],
    route_prefix: options.routePrefix ?? "",
    demo: Boolean(options.demo),
    active_goal_id: activeGoalId ?? fallback?.goal.goal_id ?? null,
    goals,
    archived_goals: archivedGoals,
    trashed_goals: trashedGoals,
    counts,
    coverage,
    input_bindings: inputBindings,
    policy_bindings: policyBindings,
    events,
  };
}

export function cachedGoalBoardWebView(
  cache: GoalBoardWebViewCache,
  store: SqliteGoalBoardStore,
  coordinator: GoalBoardCoordinator,
  options: WebViewOptions,
): GoalBoardWebView {
  const cursor = store.eventCursor(options.boardId);
  const optionsFingerprint = JSON.stringify({
    board_id: options.boardId,
    demo: Boolean(options.demo),
    project_root: options.projectRoot ?? "",
    project: options.project ?? null,
    projects: options.projects ?? [],
    route_prefix: options.routePrefix ?? "",
  });
  const cached = cache.get(options.databasePath);
  if (
    cached?.cursor === cursor &&
    cached.optionsFingerprint === optionsFingerprint
  ) return cached.view;
  const view = buildGoalBoardWebView(store, coordinator, options);
  cache.set(options.databasePath, { cursor, optionsFingerprint, view });
  return view;
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
}

function serviceProcessId(): number {
  const inherited = Number(process.env.GOALBOARD_WEB_SERVICE_PROCESS_ID);
  return Number.isSafeInteger(inherited) && inherited > 0 ? inherited : process.pid;
}

function ptyClientFilePath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, "pty-client.js"),
    path.resolve(here, "../../dist/web/pty-client.js"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function servePtyClient(response: ServerResponse): boolean {
  const filePath = ptyClientFilePath();
  if (!fs.existsSync(filePath)) {
    sendJson(response, 404, { error: "desktop pty client missing" });
    return true;
  }
  response.writeHead(200, {
    "content-type": "text/javascript; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(fs.readFileSync(filePath));
  return true;
}

function desktopPanelSpawn(
  catalog: GoalBoardProjectCatalog,
  panel: { panel_id: string; runtime_kind: string; launch_command: string; launch_args: string[]; cwd: string | null; work_context_id: string; goal_id: string },
  webUrl: string,
) {
  return {
    command: panel.launch_command,
    args: panel.launch_args,
    cwd: panel.cwd,
    env: desktopPanelEnv({
      homeDirectory: catalog.homeDirectory,
      runtimeId: panel.runtime_kind,
      panelId: panel.panel_id,
      workContextId: panel.work_context_id,
      goalId: panel.goal_id,
      webUrl,
    }),
  };
}

const PAGE_CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'";

function serveWorkbenchAsset(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const asset = pathname === "/assets/goalboard-workbench.css"
    ? { body: renderGoalBoardWorkbenchStylesheet(), contentType: "text/css; charset=utf-8" }
    : pathname === "/assets/goalboard-workbench.js"
      ? { body: renderGoalBoardWorkbenchClientScript(), contentType: "text/javascript; charset=utf-8" }
      : null;
  if (!asset) return false;
  const etag = `"${createHash("sha256").update(asset.body).digest("base64url")}"`;
  const headers = {
    "content-type": asset.contentType,
    "cache-control": "private, max-age=0, must-revalidate",
    etag,
    "x-content-type-options": "nosniff",
  };
  if (request.headers["if-none-match"] === etag) {
    response.writeHead(304, headers);
    response.end();
    return true;
  }
  response.writeHead(200, headers);
  response.end(request.method === "HEAD" ? undefined : asset.body);
  return true;
}

function loopbackWebOrigin(server: http.Server): string {
  const address = server.address();
  if (address && typeof address === "object") return `http://127.0.0.1:${address.port}`;
  return "http://127.0.0.1:4173";
}

async function handleDesktopPanelApi(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  serverOptions: WebServerOptions,
  projectId: string,
  coordinator: GoalBoardCoordinator,
  boardId: string,
  ptyHost: GoalBoardPtyHost,
  webUrl: string,
): Promise<boolean> {
  const panelsMatch = url.pathname.match(/^\/api\/goals\/([^/]+)\/panels$/);
  const promptMatch = url.pathname.match(/^\/api\/goals\/([^/]+)\/advance-prompt$/);
  const panelMatch = url.pathname.match(/^\/api\/panels\/([^/]+)$/);
  const exitedMatch = url.pathname.match(/^\/api\/panels\/([^/]+)\/exited$/);
  const reopenMatch = url.pathname.match(/^\/api\/panels\/([^/]+)\/reopen$/);
  if (!panelsMatch && !promptMatch && !panelMatch && !exitedMatch && !reopenMatch) return false;

  try {
    return await withGoalBoardProjectCatalog({ homeDirectory: serverOptions.homeDirectory }, async (catalog) => {
      if (request.method === "GET" && promptMatch) {
        const goalId = decodeURIComponent(promptMatch[1]);
        const contract = coordinator.readGoalContract(boardId, goalId);
        if (contract.goal.decomposition_state === "closed_compound") {
          sendJson(response, 409, {
            error: L("这条上层 Goal 由子 Goal 共同完成，不能直接推进。请选择一个具体的子 Goal。"),
          });
          return true;
        }
        sendJson(response, 200, {
          goal_id: goalId,
          title: contract.goal.title,
          prompt: desktopAdvancePrompt({ goal_id: goalId, title: contract.goal.title }),
        });
        return true;
      }
      if (request.method === "GET" && panelsMatch) {
        const goalId = decodeURIComponent(panelsMatch[1]);
        const contract = coordinator.readGoalContract(boardId, goalId);
        sendJson(response, 200, {
          panels: catalog.listDesktopPanels(projectId, goalId).map((panel) => ({
            ...panel,
            spawn: desktopPanelSpawn(catalog, panel, webUrl),
          })),
          read_only: contract.goal.decomposition_state === "closed_compound",
        });
        return true;
      }
      if (request.method === "POST" && panelsMatch) {
        const goalId = decodeURIComponent(panelsMatch[1]);
        const contract = coordinator.readGoalContract(boardId, goalId);
        if (contract.goal.decomposition_state === "closed_compound") {
          sendJson(response, 409, {
            error: L("这条上层 Goal 由子 Goal 共同完成，不能直接开终端。请选择一个具体的子 Goal。"),
          });
          return true;
        }
        const body = await readBody(request);
        const runtimeKind = typeof body.runtime_kind === "string" ? body.runtime_kind : "generic";
        if (!isDesktopRuntimeKind(runtimeKind)) {
          sendJson(response, 400, { error: "不支持的终端类型" });
          return true;
        }
        const resume = typeof body.resume_session_id === "string" ? body.resume_session_id : null;
        const launch = desktopLaunchSpec({
          runtime_kind: runtimeKind,
          command: typeof body.command === "string" ? body.command : undefined,
          args: Array.isArray(body.args) ? body.args.map((item) => String(item)) : undefined,
          resume_session_id: resume,
        });
        const cwd = typeof body.cwd === "string" && body.cwd.trim()
          ? body.cwd.trim()
          : catalog.preferredWorkspacePath(projectId);
        if (!cwd) {
          sendJson(response, 400, { error: L("打开终端需要先把这个项目关联到一个工作目录") });
          return true;
        }
        const panel = catalog.openDesktopPanel({
          project_id: projectId,
          goal_id: goalId,
          runtime_kind: launch.runtime_kind,
          launch_command: launch.command,
          launch_args: launch.args,
          cwd,
          title: launch.title,
          host_session_id: resume,
          actor_id: "desktop-user",
          user_confirmed: true,
        });
        sendJson(response, 200, {
          panel,
          spawn: desktopPanelSpawn(catalog, panel, webUrl),
        });
        return true;
      }
      if (request.method === "DELETE" && panelMatch) {
        const panelId = decodeURIComponent(panelMatch[1]);
        const panel = catalog.getDesktopPanel(panelId);
        if (panel.project_id !== projectId) {
          sendJson(response, 404, { error: "找不到这个终端面板" });
          return true;
        }
        catalog.closeDesktopPanel(panelId, "desktop-user");
        ptyHost.kill(panelId);
        sendJson(response, 200, { closed: true, panel_id: panelId });
        return true;
      }
      if (request.method === "POST" && exitedMatch) {
        const panelId = decodeURIComponent(exitedMatch[1]);
        const panel = catalog.getDesktopPanel(panelId);
        if (panel.project_id !== projectId) {
          sendJson(response, 404, { error: "找不到这个终端面板" });
          return true;
        }
        sendJson(response, 200, { panel: catalog.markDesktopPanelExited(panelId) });
        return true;
      }
      if (request.method === "POST" && reopenMatch) {
        const panelId = decodeURIComponent(reopenMatch[1]);
        const panel = catalog.getDesktopPanel(panelId);
        if (panel.project_id !== projectId) {
          sendJson(response, 404, { error: "找不到这个终端面板" });
          return true;
        }
        const contract = coordinator.readGoalContract(boardId, panel.goal_id);
        if (contract.goal.decomposition_state === "closed_compound") {
          sendJson(response, 409, {
            error: L("这是上层 Goal 的历史终端，只能查看。请到具体的子 Goal 继续。"),
          });
          return true;
        }
        const opened = catalog.markDesktopPanelOpen(panelId);
        sendJson(response, 200, { panel: opened, spawn: desktopPanelSpawn(catalog, opened, webUrl) });
        return true;
      }
      return false;
    });
  } catch (error) {
    if (error instanceof GoalBoardV1Error) {
      sendJson(response, 404, { error: error.message });
      return true;
    }
    if (error instanceof GoalBoardProjectCatalogError) {
      sendJson(response, error.code === "catalog.panel_not_found" ? 404 : 400, { error: error.message });
      return true;
    }
    if (error instanceof Error) {
      sendJson(response, 400, { error: error.message });
      return true;
    }
    throw error;
  }
}

type LocalMutationState = "in_flight" | "complete";

function localHostname(value: string): boolean {
  const hostname = value.toLowerCase();
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]" || hostname === "::1";
}

function requestHost(request: IncomingMessage): string | null {
  const value = request.headers.host?.trim();
  if (!value) return null;
  try {
    const parsed = new URL(`http://${value}`);
    return localHostname(parsed.hostname) ? parsed.host : null;
  } catch {
    return null;
  }
}

function controlTokenMatches(expected: string, actual: string | string[] | undefined): boolean {
  if (typeof actual !== "string") return false;
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

function authorizeLocalWebRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  controlToken: string,
  mutationKeys: Map<string, LocalMutationState>,
): boolean {
  const host = requestHost(request);
  if (!host) {
    sendJson(response, 403, { error: L("本地控制请求校验失败") });
    return false;
  }
  if (!request.method || ["GET", "HEAD"].includes(request.method)) return true;
  if (!url.pathname.startsWith("/api/")) return true;
  const originValue = request.headers.origin;
  let origin: URL;
  try {
    if (typeof originValue !== "string") throw new Error("missing origin");
    origin = new URL(originValue);
  } catch {
    sendJson(response, 403, { error: L("本地控制请求校验失败") });
    return false;
  }
  if (origin.protocol !== "http:" || !localHostname(origin.hostname) || origin.host !== host) {
    sendJson(response, 403, { error: L("本地控制请求校验失败") });
    return false;
  }
  if (!controlTokenMatches(controlToken, request.headers["x-goalboard-control-token"])) {
    sendJson(response, 403, { error: L("本地控制请求校验失败") });
    return false;
  }
  const idempotencyKey = request.headers["x-goalboard-idempotency-key"];
  if (
    typeof idempotencyKey !== "string"
    || idempotencyKey.length < 8
    || idempotencyKey.length > 200
  ) {
    sendJson(response, 400, { error: L("请求缺少有效的一次性操作键") });
    return false;
  }
  if (mutationKeys.has(idempotencyKey)) {
    sendJson(response, 409, { error: "这次操作已经提交，不会重复执行" });
    return false;
  }
  mutationKeys.set(idempotencyKey, "in_flight");
  response.once("finish", () => {
    if (response.statusCode >= 200 && response.statusCode < 400) {
      mutationKeys.set(idempotencyKey, "complete");
      while (mutationKeys.size > 4096) {
        const oldest = mutationKeys.keys().next().value as string | undefined;
        if (!oldest) break;
        mutationKeys.delete(oldest);
      }
    } else {
      mutationKeys.delete(idempotencyKey);
    }
  });
  return true;
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

function projectNavigation(project: GoalBoardProjectRecord): WebProjectNavigation {
  return {
    project_id: project.project_id,
    display_name: project.display_name,
    data_class: project.data_class,
  };
}

function settingsProject(project: GoalBoardProjectRecord): WebSettingsProject {
  return {
    project_id: project.project_id,
    display_name: project.display_name,
    database_path: project.database_path,
    source: project.source,
    data_class: project.data_class,
    created_at: project.created_at,
  };
}

function runtimeDisplayName(runtimeId: string): string {
  return desktopRuntimeTitle(runtimeId);
}

function settingsConnection(
  binding: GoalBoardRuntimeContextBinding,
  projects: Map<string, WebSettingsProject>,
): WebSettingsConnection | null {
  const project = projects.get(binding.project_id);
  if (!project) return null;
  const fingerprint = createHash("sha256")
    .update(`${binding.runtime_id}\0${binding.stable_work_context_id}`)
    .digest("hex")
    .slice(0, 6)
    .toUpperCase();
  const runtimeName = runtimeDisplayName(binding.runtime_id);
  return {
    binding_id: binding.binding_id,
    runtime_id: binding.runtime_id,
    runtime_name: runtimeName,
    context_label: `${runtimeName} Session · ${fingerprint}`,
    project_id: project.project_id,
    project_name: project.display_name,
    created_at: binding.created_at,
    updated_at: binding.updated_at,
  };
}

async function settingsCatalogSnapshot(homeDirectory: string | undefined): Promise<{
  projects: WebSettingsProject[];
  connections: WebSettingsConnection[];
  workspace_memberships: WebSettingsWorkspaceMembership[];
}> {
  return withGoalBoardProjectCatalog({ homeDirectory }, (catalog) => {
    const projects = catalog.listProjects().map(settingsProject);
    const projectMap = new Map(projects.map((project) => [project.project_id, project]));
    return {
      projects,
      connections: catalog.listRuntimeContextBindings()
        .map((binding) => settingsConnection(binding, projectMap))
        .filter((connection): connection is WebSettingsConnection => connection !== null),
      workspace_memberships: catalog.listWorkspaceMemberships()
        .map((membership) => {
          const project = projectMap.get(membership.project_id);
          return project ? {
            membership_id: membership.membership_id,
            workspace_id: membership.workspace_id,
            workspace_name: membership.workspace_name,
            realpath_verified: membership.realpath_verified,
            project_id: project.project_id,
            project_name: project.display_name,
            is_default: membership.is_default,
            updated_at: membership.updated_at,
          } : null;
        })
        .filter((membership): membership is WebSettingsWorkspaceMembership => membership !== null),
    };
  });
}

async function settingsProjects(homeDirectory: string | undefined): Promise<WebSettingsProject[]> {
  return (await settingsCatalogSnapshot(homeDirectory)).projects;
}

function bindingRuntimeContext(binding: GoalBoardRuntimeContextBinding): RuntimeWorkContext {
  return {
    runtime_id: binding.runtime_id,
    stable_work_context_id: binding.stable_work_context_id,
    host_declares_stable: true,
  };
}

function installationDiagnostics(
  homeDirectory: string | undefined,
  projectCount: number,
): WebInstallationDiagnostics {
  const home = path.resolve(homeDirectory ?? path.join(os.homedir(), ".goalboard"));
  const manifestPath = path.join(home, "config", "installation.json");
  let installationState: WebInstallationDiagnostics["installation_state"] = "missing";
  let version: string | null = null;
  let releaseDirectory: string | null = null;
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
        installer?: unknown;
        version?: unknown;
        release_path?: unknown;
      };
      if (
        manifest.installer === "goalboard-home-install-v1"
        && typeof manifest.version === "string"
        && typeof manifest.release_path === "string"
      ) {
        version = manifest.version;
        releaseDirectory = path.resolve(home, manifest.release_path);
        installationState = "ready";
      } else {
        installationState = "invalid";
      }
    } catch {
      installationState = "invalid";
    }
  }
  return {
    home_directory: home,
    installation_state: installationState,
    version,
    release_directory: releaseDirectory,
    project_count: projectCount,
    launchers: ([
      ["CLI", "goalboard"],
      ["MCP", "goalboard-mcp"],
      ["Web", "goalboard-web"],
    ] as const).map(([name, file]) => {
      const launcherPath = path.join(home, "bin", file);
      return { name, path: launcherPath, state: fs.existsSync(launcherPath) ? "ready" : "missing" };
    }),
  };
}

function supportedRuntimeId(value: string): SupportedRuntimeId | null {
  return isSupportedRuntimeId(value) ? value : null;
}

function fixtureWebBoardOptions(options: WebServerOptions): ResolvedWebBoardOptions | null {
  if (!options.databasePath) return null;
  return {
    databasePath: options.databasePath,
    boardId: options.boardId ?? "default",
    demo: options.demo,
    projectRoot: options.projectRoot,
    project: null,
    projects: [],
    routePrefix: "",
  };
}

function webMigrationRequest(body: Record<string, unknown>): {
  legacyDatabasePath: string;
  displayName?: string;
} {
  if (body.user_confirmed !== true) {
    throw new Error("请先明确确认要迁移这份已有 GoalBoard 数据");
  }
  const legacyDatabasePath = typeof body.legacy_database_path === "string"
    ? body.legacy_database_path.trim()
    : "";
  if (!legacyDatabasePath) throw new Error("请选择要迁移的已有 GoalBoard DB");
  if (legacyDatabasePath.length > 4_000) throw new Error("来源 DB 路径过长");
  const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";
  if (displayName.length > 160) throw new Error("迁移后项目名称过长");
  return {
    legacyDatabasePath,
    ...(displayName ? { displayName } : {}),
  };
}

/**
 * Resolving a Web request is deliberately read-only. In particular, opening a
 * project in the browser must not create, bind, or rebind a Runtime Session.
 */
async function resolveWebRequest(
  serverOptions: WebServerOptions,
  pathname: string,
): Promise<ResolvedWebRequest> {
  const fixture = fixtureWebBoardOptions(serverOptions);
  if (fixture) return { kind: "board", pathname, options: fixture };

  return withGoalBoardProjectCatalog({ homeDirectory: serverOptions.homeDirectory }, (catalog) => {
    const records = catalog.listProjects();
    const projects = records.map(projectNavigation);
    if (
      pathname === "/"
      || pathname === "/health"
      || pathname === "/api"
      || pathname.startsWith("/api/")
      || pathname === "/settings"
      || pathname.startsWith("/settings/")
      || pathname.startsWith("/desktop/")
    ) {
      return { kind: "catalog_index", projects };
    }
    const match = pathname.match(/^\/projects\/([^/]+)(\/.*)?$/);
    if (!match) return { kind: "project_not_found" };

    let projectId: string;
    try {
      projectId = decodeURIComponent(match[1]);
    } catch {
      return { kind: "project_not_found" };
    }
    let project: GoalBoardProjectRecord;
    try {
      project = catalog.getProject(projectId);
    } catch {
      return { kind: "project_not_found" };
    }
    return {
      kind: "board",
      pathname: match[2] || "/",
      options: {
        databasePath: project.database_path,
        boardId: project.board_id,
        projectRoot: serverOptions.projectRoot,
        project: projectNavigation(project),
        projects,
        routePrefix: `/projects/${encodeURIComponent(project.project_id)}`,
        demo: project.data_class === "regenerable_demo",
      },
    };
  });
}

export function createGoalBoardWebServer(serverOptions: WebServerOptions = {}): http.Server {
  const fixture = fixtureWebBoardOptions(serverOptions);
  const runtimeIntegrations = serverOptions.runtimeIntegrationService ?? new RuntimeIntegrationService({
    homeDirectory: serverOptions.homeDirectory,
  });
  const webService = serverOptions.webServiceManager ?? new GoalBoardWebServiceManager({
    homeDirectory: serverOptions.homeDirectory,
  });
  const controlToken = resolveWebControlToken(serverOptions);
  const mutationKeys = new Map<string, LocalMutationState>();
  const webViewCache: GoalBoardWebViewCache = new Map();
  if (fixture?.demo && !fs.existsSync(fixture.databasePath)) seedDemoBoard(fixture.databasePath);
  const pty = { host: null as GoalBoardPtyHost | null };
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    try {
      if (request.method === "GET" && url.pathname === "/locale") {
        const requested = url.searchParams.get("lang");
        const nextLocale = isWebLocale(requested)
          ? requested
          : resolveWebLocale(request.headers.cookie, request.headers["accept-language"]);
        response.writeHead(302, {
          location: safeNextPath(url.searchParams.get("next")),
          "set-cookie": localeSetCookie(nextLocale),
          "cache-control": "no-store",
        });
        response.end();
        return;
      }
      const capsuleLocale = request.method === "GET" && (
        url.pathname === "/desktop/capsule" ||
        /^\/projects\/[^/]+\/api\/capsule$/.test(url.pathname)
      )
        ? url.searchParams.get("locale")
        : null;
      const locale = isWebLocale(capsuleLocale)
        ? capsuleLocale
        : resolveWebLocale(request.headers.cookie, request.headers["accept-language"]);
      await runWithLocale(locale, async () => {
        if (!authorizeLocalWebRequest(request, response, url, controlToken, mutationKeys)) return;
        if (serveWorkbenchAsset(request, response, url.pathname)) return;
        if (!pty.host) throw new Error("终端宿主尚未就绪");
        await handleGoalBoardWebRequest(
          request,
          response,
          url,
          serverOptions,
          runtimeIntegrations,
          webService,
          controlToken,
          webViewCache,
          pty.host,
          loopbackWebOrigin(server),
        );
      });
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
  pty.host = attachGoalBoardPtySocket(server, controlToken);
  return server;
}

async function handleGoalBoardWebRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  serverOptions: WebServerOptions,
  runtimeIntegrations: RuntimeIntegrationService,
  webService: GoalBoardWebServiceManager,
  controlToken: string,
  webViewCache: GoalBoardWebViewCache,
  ptyHost: GoalBoardPtyHost,
  webUrl: string,
): Promise<void> {
  const resolved = await resolveWebRequest(serverOptions, url.pathname);
      if (resolved.kind === "catalog_index") {
        if (request.method === "GET" && url.pathname === "/desktop/capsule") {
          response.writeHead(200, {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
            ...desktopCookieHeaders(request, url),
          });
          response.end(renderCapsuleShell(resolved.projects));
          return;
        }
        if (request.method === "GET" && url.pathname === "/settings") {
          response.writeHead(302, {
            location: isDesktopShellRequest(request, url) ? "/settings/appearance?desktop=1" : "/settings/appearance",
            "cache-control": "no-store",
          });
          response.end();
          return;
        }
        const globalPlanningMatch = url.pathname.match(/^\/settings\/planning(?:\/([^/]+))?(?:\/(edit))?$/);
        if (request.method === "GET" && globalPlanningMatch) {
          const methods = resolvePlanningMethodPacks(readPersonalPlanningMethodPacks(serverOptions.homeDirectory));
          const contextProjectId = url.searchParams.get("project");
          const contextProject = contextProjectId
            ? resolved.projects.find((project) => project.project_id === contextProjectId) ?? null
            : null;
          const methodId = globalPlanningMatch[1] ? decodeURIComponent(globalPlanningMatch[1]) : null;
          const method = methodId && methodId !== "new"
            ? methods.find((item) => item.method_id === methodId) ?? null
            : null;
          if (methodId && methodId !== "new" && !method) {
            sendJson(response, 404, { error: L("找不到这套规划方法") });
            return;
          }
          response.writeHead(200, {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
            ...desktopCookieHeaders(request, url),
          });
          response.end(methodId
            ? renderGoalBoardPlanningMethodPage(
                method,
                methodId === "new" ? "new" : globalPlanningMatch[2] === "edit" ? "edit" : "detail",
                "personal",
                contextProject,
                controlToken,
                isDesktopShellRequest(request, url),
              )
            : renderGoalBoardPlanningLibrary(methods, contextProject, controlToken, isDesktopShellRequest(request, url)));
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/settings/planning-methods") {
          sendJson(response, 200, { methods: resolvePlanningMethodPacks(readPersonalPlanningMethodPacks(serverOptions.homeDirectory)) });
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/settings/planning-methods") {
          const body = await readBody(request);
          const method = body.method && typeof body.method === "object" && !Array.isArray(body.method)
            ? body.method as PlanningMethodPackInput
            : null;
          if (body.scope !== "personal" || !method) {
            sendJson(response, 400, { error: L("个人方法内容无效") });
            return;
          }
          try {
            await withGoalBoardProjectCatalog({ homeDirectory: serverOptions.homeDirectory }, (catalog) => {
              const current = catalog.listPersonalPlanningMethodPacks()
                .find((pack) => pack.method_id === method.method_id) ?? null;
              const saved = normalizePlanningMethodPack(method, "personal", current, new Date().toISOString());
              catalog.putPersonalPlanningMethodPack(saved);
              sendJson(response, 200, { method: saved });
            });
          } catch (error) {
            sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
          }
          return;
        }
        const settingsPageMatch = url.pathname.match(/^\/settings\/(appearance|runtimes|projects|diagnostics)$/);
        if (request.method === "GET" && settingsPageMatch) {
          const section = settingsPageMatch[1] as WebSettingsSection;
          const catalogSettings = await settingsCatalogSnapshot(serverOptions.homeDirectory);
          const projects = catalogSettings.projects;
          const contextProjectId = url.searchParams.get("project");
          const contextProject = contextProjectId
            ? projects.find((project) => project.project_id === contextProjectId) ?? null
            : null;
          const runtimes = section === "runtimes" ? await runtimeIntegrations.detectAll() : [];
          response.writeHead(200, {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
            ...desktopCookieHeaders(request, url),
          });
          response.end(renderGoalBoardSettings({
            section,
            context_project: contextProject,
            runtimes,
            projects,
            connections: catalogSettings.connections,
            workspace_memberships: catalogSettings.workspace_memberships,
            web_service: await webService.detect(),
            diagnostics: installationDiagnostics(serverOptions.homeDirectory, projects.length),
          }, controlToken, isDesktopShellRequest(request, url)));
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/settings/runtimes") {
          sendJson(response, 200, { runtimes: await runtimeIntegrations.detectAll() });
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/settings/web-service") {
          sendJson(response, 200, await webService.detect());
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/settings/web-service/plan") {
          const body = await readBody(request);
          const action = typeof body.action === "string"
            && ["install", "start", "stop", "restart", "remove"].includes(body.action)
            ? body.action as GoalBoardWebServiceAction
            : null;
          if (!action) {
            sendJson(response, 400, { error: "常驻服务操作无效" });
            return;
          }
          try {
            sendJson(response, 200, await webService.prepare(action));
          } catch (error) {
            sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
          }
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/settings/web-service/confirm") {
          const body = await readBody(request);
          const planId = typeof body.plan_id === "string" ? body.plan_id : "";
          const decision = body.decision === "confirmed" || body.decision === "declined" ? body.decision : null;
          if (!planId || !decision) {
            sendJson(response, 400, { error: "常驻服务确认缺少 plan 或明确决定" });
            return;
          }
          try {
            sendJson(response, 200, await webService.confirm({ plan_id: planId, decision }));
          } catch (error) {
            sendJson(response, 409, { error: error instanceof Error ? error.message : String(error) });
          }
          return;
        }
        const runtimePlanMatch = url.pathname.match(/^\/api\/settings\/runtimes\/([^/]+)\/plan$/);
        if (request.method === "POST" && runtimePlanMatch) {
          const runtimeId = supportedRuntimeId(decodeURIComponent(runtimePlanMatch[1]));
          const body = await readBody(request);
          const action = body.action === "connect" || body.action === "remove" ? body.action : null;
          if (!runtimeId || !action) {
            sendJson(response, 400, { error: "Runtime 或接入操作无效" });
            return;
          }
          try {
            sendJson(response, 200, await runtimeIntegrations.prepare(runtimeId, action));
          } catch (error) {
            sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
          }
          return;
        }
        const runtimeConfirmMatch = url.pathname.match(/^\/api\/settings\/runtimes\/([^/]+)\/confirm$/);
        if (request.method === "POST" && runtimeConfirmMatch) {
          const runtimeId = supportedRuntimeId(decodeURIComponent(runtimeConfirmMatch[1]));
          const body = await readBody(request);
          const decision = body.decision === "confirmed" || body.decision === "declined" ? body.decision : null;
          const planId = typeof body.plan_id === "string" ? body.plan_id.trim() : "";
          if (!runtimeId || !decision || !planId) {
            sendJson(response, 400, { error: "Runtime 接入确认缺少 plan 或明确决定" });
            return;
          }
          const result = await runtimeIntegrations.confirm({ runtime_id: runtimeId, plan_id: planId, decision });
          const successful = ["connected", "already_connected", "removed", "already_removed", "declined"].includes(result.status);
          sendJson(response, successful ? 200 : 409, result);
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/settings/projects") {
          sendJson(response, 200, { projects: await settingsProjects(serverOptions.homeDirectory) });
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/settings/connections") {
          const catalogSettings = await settingsCatalogSnapshot(serverOptions.homeDirectory);
          sendJson(response, 200, { connections: catalogSettings.connections });
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/settings/workspaces") {
          const catalogSettings = await settingsCatalogSnapshot(serverOptions.homeDirectory);
          sendJson(response, 200, { workspace_memberships: catalogSettings.workspace_memberships });
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/settings/projects") {
          const body = await readBody(request);
          const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";
          if (body.user_confirmed !== true || !displayName) {
            sendJson(response, 400, { error: "请确认并填写项目名称" });
            return;
          }
          try {
            await withGoalBoardProjectCatalog({ homeDirectory: serverOptions.homeDirectory }, async (catalog) => {
              const project = await catalog.createProject({ display_name: displayName, actor_id: "web-user" });
              sendJson(response, 201, {
                project: settingsProject(project),
                project_path: `/projects/${encodeURIComponent(project.project_id)}/`,
              });
            });
          } catch (error) {
            sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
          }
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/settings/demo") {
          const body = await readBody(request);
          const action = body.action === "create" || body.action === "reset" || body.action === "remove"
            ? body.action
            : null;
          if (!action || body.user_confirmed !== true) {
            sendJson(response, 400, { error: "请明确确认要创建、重建或删除演示数据" });
            return;
          }
          try {
            await withGoalBoardProjectCatalog({ homeDirectory: serverOptions.homeDirectory }, async (catalog) => {
              if (action === "create") {
                const result = await catalog.ensureDemoProject({ actor_id: "web-user", user_confirmed: true });
                sendJson(response, 200, {
                  ...result,
                  project: settingsProject(result.project),
                  message: result.status === "existing" ? "示例项目已经存在" : "示例项目已创建",
                });
                return;
              }
              if (action === "reset") {
                const result = await catalog.resetDemoProject({ actor_id: "web-user", user_confirmed: true });
                sendJson(response, 200, {
                  ...result,
                  project: settingsProject(result.project),
                  message: "示例项目已重建；用户项目未修改",
                });
                return;
              }
              const demo = catalog.listProjects().find((project) => project.data_class === "regenerable_demo");
              if (!demo) {
                sendJson(response, 404, { error: "示例项目已经不存在" });
                return;
              }
              const result = await catalog.removeDemoProject({
                project_id: demo.project_id,
                actor_id: "web-user",
                delete_confirmed: true,
                idempotency_key: `web-demo-remove-${randomBytes(16).toString("hex")}`,
              });
              sendJson(response, 200, { ...result, message: "可重建 demo 已删除；用户项目未修改" });
            });
          } catch (error) {
            sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
          }
          return;
        }
        const projectRenameMatch = url.pathname.match(/^\/api\/settings\/projects\/([^/]+)\/rename$/);
        if (request.method === "POST" && projectRenameMatch) {
          const body = await readBody(request);
          const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";
          if (!displayName) {
            sendJson(response, 400, { error: "项目名称不能为空" });
            return;
          }
          try {
            await withGoalBoardProjectCatalog({ homeDirectory: serverOptions.homeDirectory }, (catalog) => {
              const project = catalog.renameProject(decodeURIComponent(projectRenameMatch[1]), displayName, "web-user");
              sendJson(response, 200, { project: settingsProject(project) });
            });
          } catch (error) {
            sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
          }
          return;
        }
        const connectionActionMatch = url.pathname.match(
          /^\/api\/settings\/connections\/([^/]+)\/(rebind|unbind)$/,
        );
        if (request.method === "POST" && connectionActionMatch) {
          const body = await readBody(request);
          if (body.user_confirmed !== true) {
            sendJson(response, 400, { error: "请先明确确认这次 Session 关联变更" });
            return;
          }
          const bindingId = decodeURIComponent(connectionActionMatch[1]);
          const action = connectionActionMatch[2];
          try {
            await withGoalBoardProjectCatalog({ homeDirectory: serverOptions.homeDirectory }, (catalog) => {
              const binding = catalog.listRuntimeContextBindings()
                .find((candidate) => candidate.binding_id === bindingId);
              if (!binding) {
                sendJson(response, 404, { error: "这条 Session 关联已不存在，请刷新页面" });
                return;
              }
              if (action === "rebind") {
                const projectId = typeof body.project_id === "string" ? body.project_id.trim() : "";
                if (!projectId) {
                  sendJson(response, 400, { error: "请选择要切换到的项目" });
                  return;
                }
                catalog.bindRuntimeContext({
                  context: bindingRuntimeContext(binding),
                  project_id: projectId,
                  actor_id: "web-user",
                  user_confirmed: true,
                  rebind_confirmed: true,
                });
                const rebound = catalog.listRuntimeContextBindings()
                  .find((candidate) => candidate.binding_id === bindingId);
                const projects = catalog.listProjects().map(settingsProject);
                const safeConnection = rebound
                  ? settingsConnection(rebound, new Map(projects.map((project) => [project.project_id, project])))
                  : null;
                if (!safeConnection) throw new Error("Session 切换后无法读取关联结果");
                sendJson(response, 200, { connection: safeConnection });
                return;
              }
              const result = catalog.unbindRuntimeContext({
                context: bindingRuntimeContext(binding),
                actor_id: "web-user",
                user_confirmed: true,
              });
              sendJson(response, 200, {
                binding_id: bindingId,
                changed: result.changed,
                unbound_project: result.unbound_project,
              });
            });
          } catch (error) {
            sendJson(response, error instanceof GoalBoardProjectCatalogError && error.code === "catalog.project_not_found" ? 404 : 400, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
          return;
        }
        const workspaceDefaultMatch = url.pathname.match(/^\/api\/settings\/workspaces\/([^/]+)\/default$/);
        if (request.method === "POST" && workspaceDefaultMatch) {
          const body = await readBody(request);
          if (body.user_confirmed !== true || typeof body.project_id !== "string") {
            sendJson(response, 400, { error: "请先明确确认目录默认项目" });
            return;
          }
          const projectId = body.project_id;
          try {
            await withGoalBoardProjectCatalog({ homeDirectory: serverOptions.homeDirectory }, (catalog) => {
              const memberships = catalog.setWorkspaceDefault({
                workspace_id: decodeURIComponent(workspaceDefaultMatch[1]),
                project_id: projectId,
                actor_id: "web-user",
                user_confirmed: true,
              });
              sendJson(response, 200, { changed: true, membership_count: memberships.length });
            });
          } catch (error) {
            sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
          }
          return;
        }
        const workspaceUnlinkMatch = url.pathname.match(
          /^\/api\/settings\/workspaces\/([^/]+)\/projects\/([^/]+)\/unlink$/,
        );
        if (request.method === "POST" && workspaceUnlinkMatch) {
          const body = await readBody(request);
          if (body.user_confirmed !== true) {
            sendJson(response, 400, { error: "请先明确确认解除目录关联" });
            return;
          }
          try {
            await withGoalBoardProjectCatalog({ homeDirectory: serverOptions.homeDirectory }, (catalog) => {
              const memberships = catalog.removeWorkspaceMembership({
                workspace_id: decodeURIComponent(workspaceUnlinkMatch[1]),
                project_id: decodeURIComponent(workspaceUnlinkMatch[2]),
                actor_id: "web-user",
                user_confirmed: true,
              });
              sendJson(response, 200, { changed: true, membership_count: memberships.length });
            });
          } catch (error) {
            sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
          }
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/settings/diagnostics") {
          sendJson(response, 200, installationDiagnostics(serverOptions.homeDirectory, resolved.projects.length));
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/projects/migrate") {
          try {
            const requestInput = webMigrationRequest(await readBody(request));
            await withGoalBoardProjectCatalog({ homeDirectory: serverOptions.homeDirectory }, async (catalog) => {
              const project = await catalog.migrateLegacyDatabase({
                legacy_database_path: requestInput.legacyDatabasePath,
                ...(requestInput.displayName ? { display_name: requestInput.displayName } : {}),
                actor_id: "web-user",
              });
              sendJson(response, 201, {
                project: projectNavigation(project),
                project_path: `/projects/${encodeURIComponent(project.project_id)}/`,
              });
            });
          } catch (error) {
            const message = error instanceof GoalBoardProjectCatalogError
              ? error.message
              : error instanceof Error
                ? `迁移失败：${error.message}`
                : "迁移失败，请检查来源 DB 后重试";
            sendJson(response, 400, { error: message });
          }
          return;
        }
        if (request.method === "GET" && url.pathname === "/desktop/pty-client.js") {
          servePtyClient(response);
          return;
        }
        if (request.method === "GET" && url.pathname === "/health") {
          sendJson(response, 200, {
            status: "ok",
            process_id: process.pid,
            service_process_id: serviceProcessId(),
            project_count: resolved.projects.length,
            desktop_tui: true,
          });
          return;
        }
        if (request.method === "GET" && url.pathname === "/") {
          const desktopShell = isDesktopShellRequest(request, url);
          response.writeHead(200, {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
            ...desktopCookieHeaders(request, url),
          });
          response.end(renderGoalBoardProjectIndex(resolved.projects, controlToken, desktopShell));
          return;
        }
        if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
          sendJson(response, 400, { error: L("请先选择一个 GoalBoard 项目") });
          return;
        }
        sendJson(response, 404, { error: L("页面不存在") });
        return;
      }
      if (resolved.kind === "project_not_found") {
        sendJson(response, 404, { error: L("找不到这个 GoalBoard 项目") });
        return;
      }
      const options = resolved.options;
      url.pathname = resolved.pathname;
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
      const coordinator = new GoalBoardCoordinator(
        store,
        () => new Date(),
        readPersonalPlanningMethodPacks(serverOptions.homeDirectory),
      );
      const readWebView = (): GoalBoardWebView =>
        cachedGoalBoardWebView(webViewCache, store, coordinator, options);
      try {
        if (request.method === "GET" && url.pathname === "/settings/rules") {
          response.writeHead(200, {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
            ...desktopCookieHeaders(request, url),
          });
          response.end(renderGoalBoardProjectSettings(
            readWebView(),
            controlToken,
            isDesktopShellRequest(request, url),
          ));
          return;
        }
        const projectPlanningMethodMatch = url.pathname.match(/^\/settings\/planning\/([^/]+)(?:\/(edit))?$/);
        if (request.method === "GET" && projectPlanningMethodMatch) {
          const view = readWebView();
          const methodId = decodeURIComponent(projectPlanningMethodMatch[1]);
          const method = methodId === "new"
            ? null
            : coordinator.effectivePlanningMethods(options.boardId)
              .find((item) => item.method_id === methodId && item.scope === "project") ?? null;
          if (methodId !== "new" && !method) {
            sendJson(response, 404, { error: L("找不到这个项目方法") });
            return;
          }
          response.writeHead(200, {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
            ...desktopCookieHeaders(request, url),
          });
          response.end(renderGoalBoardPlanningMethodPage(
            method,
            methodId === "new" ? "new" : projectPlanningMethodMatch[2] === "edit" ? "edit" : "detail",
            "project",
            view.project,
            controlToken,
            isDesktopShellRequest(request, url),
          ));
          return;
        }
        if (request.method === "GET" && url.pathname === "/settings/planning") {
          const view = readWebView();
          response.writeHead(200, {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
            ...desktopCookieHeaders(request, url),
          });
          response.end(renderGoalBoardPlanningSettings(
            view,
            coordinator.effectivePlanningMethods(options.boardId),
            controlToken,
            isDesktopShellRequest(request, url),
          ));
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/settings/planning-methods") {
          sendJson(response, 200, {
            methods: coordinator.effectivePlanningMethods(options.boardId),
            composition: coordinator.projectPlanningComposition(options.boardId),
          });
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/settings/planning-methods/apply") {
          const body = await readBody(request);
          const methodId = typeof body.method_id === "string" ? body.method_id.trim() : "";
          const source = methodId
            ? resolvePlanningMethodPacks(readPersonalPlanningMethodPacks(serverOptions.homeDirectory))
              .find((method) => method.method_id === methodId && method.scope !== "project") ?? null
            : null;
          if (!source) {
            sendJson(response, 404, { error: L("找不到可选的规划方法") });
            return;
          }
          const method: PlanningMethodPackInput = {
            method_id: source.method_id,
            version: source.version,
            kind: source.kind,
            name: source.name,
            summary: source.summary,
            instructions: source.instructions,
            applies_to: source.applies_to,
            domain_tags: source.domain_tags,
            steps: source.steps,
            required_coverage: source.required_coverage,
            dependency_rules: source.dependency_rules,
            evidence_requirements: source.evidence_requirements,
            completion_checks: source.completion_checks,
            failure_modes: source.failure_modes,
            source_refs: source.source_refs,
            confidence: source.confidence,
            enabled: true,
          };
          try {
            sendJson(response, 200, coordinator.saveProjectPlanningMethod({
              board_id: options.boardId,
              method,
              actor_id: "web-user",
              user_confirmed: true,
            }));
          } catch (error) {
            sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
          }
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/settings/planning-methods") {
          const body = await readBody(request);
          const scope = body.scope === "personal" ? "personal" : body.scope === "project" ? "project" : null;
          const method = body.method && typeof body.method === "object" && !Array.isArray(body.method)
            ? body.method as PlanningMethodPackInput
            : null;
          if (!scope || !method) {
            sendJson(response, 400, { error: L("保存范围或方法内容无效") });
            return;
          }
          try {
            if (scope === "project") {
              const saved = coordinator.saveProjectPlanningMethod({
                board_id: options.boardId,
                method,
                actor_id: "web-user",
                user_confirmed: true,
              });
              sendJson(response, 200, saved);
            } else {
              await withGoalBoardProjectCatalog({ homeDirectory: serverOptions.homeDirectory }, (catalog) => {
                const current = catalog.listPersonalPlanningMethodPacks()
                  .find((pack) => pack.method_id === method.method_id) ?? null;
                const saved = normalizePlanningMethodPack(method, "personal", current, new Date().toISOString());
                catalog.putPersonalPlanningMethodPack(saved);
                sendJson(response, 200, { method: saved });
              });
            }
          } catch (error) {
            sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
          }
          return;
        }
        if (request.method === "GET" && url.pathname === "/health") {
          sendJson(response, 200, {
            status: "ok",
            process_id: process.pid,
            service_process_id: serviceProcessId(),
            board_id: options.boardId,
            desktop_tui: true,
          });
          return;
        }
        if (request.method === "GET" && url.pathname === "/desktop/pty-client.js") {
          servePtyClient(response);
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/board/cursor") {
          sendJson(response, 200, { observed_event_cursor: store.eventCursor(options.boardId) });
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/board") {
          sendJson(response, 200, readWebView());
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/capsule") {
          if (!options.project) {
            sendJson(response, 400, { error: L("请先选择一个 GoalBoard 项目") });
            return;
          }
          const available = coordinator.queryAvailable({
            board_id: options.boardId,
            actor_id: "capsule-viewer",
          }).available;
          sendJson(response, 200, buildCapsuleSnapshot(readWebView(), available));
          return;
        }
        if (options.project?.project_id) {
          const handled = await handleDesktopPanelApi(
            request,
            response,
            url,
            serverOptions,
            options.project.project_id,
            coordinator,
            options.boardId,
            ptyHost,
            webUrl,
          );
          if (handled) return;
        }
        const goalFragmentMatch = url.pathname.match(/^\/api\/goals\/([^/]+)\/(document|records|record-events)$/);
        if (request.method === "GET" && goalFragmentMatch) {
          let goalId: string;
          try {
            goalId = decodeURIComponent(goalFragmentMatch[1]);
          } catch {
            sendJson(response, 404, { error: "Goal 内容不存在" });
            return;
          }
          const collection = url.searchParams.get("view") ?? "current";
          if (collection !== "current" && collection !== "archive" && collection !== "trash") {
            sendJson(response, 400, { error: "Goal 正文集合无效" });
            return;
          }
          const fragmentKind = goalFragmentMatch[2];
          const offsetText = url.searchParams.get("offset") ?? "0";
          if (fragmentKind === "record-events" && !/^(0|[1-9]\d*)$/.test(offsetText)) {
            sendJson(response, 400, { error: "Goal 事件偏移量无效" });
            return;
          }
          const eventOffset = Number(offsetText);
          if (fragmentKind === "record-events" && !Number.isSafeInteger(eventOffset)) {
            sendJson(response, 400, { error: "Goal 事件偏移量无效" });
            return;
          }
          const view = readWebView();
          const fragment = fragmentKind === "records"
            ? renderGoalRecordsFragment(view, goalId, collection)
            : fragmentKind === "record-events"
              ? renderGoalRecordEventsFragment(view, goalId, collection, eventOffset)
              : renderGoalDocumentFragment(view, goalId, collection);
          if (!fragment) {
            sendJson(response, 404, { error: `找不到这个 Goal: ${goalId}` });
            return;
          }
          response.writeHead(200, {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
          });
          response.end(fragment);
          return;
        }
        const projectReferenceMatch = url.pathname.match(/^\/api\/project-references\/([^/]+)$/);
        if (request.method === "GET" && projectReferenceMatch) {
          try {
            const reference = decodeURIComponent(projectReferenceMatch[1]);
            const evidenceId = url.searchParams.get("evidence_id")?.trim() || null;
            let projectRoot = options.projectRoot;
            if (evidenceId) {
              const evidence = readWebView().snapshot.evidence.find((item) => item.evidence_id === evidenceId);
              if (!evidence || evidence.locator !== reference) {
                throw new ProjectReferenceError(404, "找不到匹配的 Evidence 项目引用");
              }
              if (evidence.locator_status !== "verified") {
                throw new ProjectReferenceError(409, "只有已验证的项目内 Evidence 引用可以直接打开");
              }
              const source = store.db
                .prepare("SELECT locator_workspace_root FROM evidence WHERE evidence_id = ? AND board_id = ?")
                .get(evidenceId, options.boardId) as { locator_workspace_root?: unknown } | undefined;
              if (typeof source?.locator_workspace_root === "string" && source.locator_workspace_root.trim()) {
                projectRoot = source.locator_workspace_root;
              } else if (!projectRoot) {
                throw new ProjectReferenceError(409, "这条历史 Evidence 没有记录原始工作区；请提交新的验证记录并替代它");
              }
            }
            if (!projectRoot) {
              throw new ProjectReferenceError(409, "项目引用没有可确认的原始工作区");
            }
            const opened = readProjectReference(projectRoot, reference);
            response.writeHead(200, {
              "content-type": "text/plain; charset=utf-8",
              "cache-control": "no-store",
              "content-disposition": `inline; filename="${opened.fileName.replaceAll('"', "")}"`,
              "x-content-type-options": "nosniff",
            });
            response.end(opened.content);
          } catch (error) {
            const status = error instanceof ProjectReferenceError ? error.status : 400;
            sendJson(response, status, {
              error: error instanceof Error ? error.message : "项目内引用无法打开",
            });
          }
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
            goal_path: `${options.routePrefix}/goals/${encodeURIComponent(created.goal.goal_id)}`,
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
        const goalRelationMatch = url.pathname.match(/^\/api\/goals\/([^/]+)\/relations$/);
        if (request.method === "POST" && goalRelationMatch) {
          const body = await readBody(request);
          const goalId = decodeURIComponent(goalRelationMatch[1]);
          const targetGoalId = String(body.target_goal_id ?? "").trim();
          const type = String(body.type ?? "") as GoalRelationRecord["type"];
          const direction = String(body.direction ?? "outgoing");
          const reason = String(body.reason ?? "").trim();
          if (!targetGoalId) {
            sendJson(response, 400, { error: "请选择另一个 Goal" });
            return;
          }
          if (!RELATION_TYPES.has(type)) {
            sendJson(response, 400, { error: "关系类型不受支持" });
            return;
          }
          if (direction !== "outgoing" && direction !== "incoming") {
            sendJson(response, 400, { error: "关系方向必须是 outgoing 或 incoming" });
            return;
          }
          if (!reason) {
            sendJson(response, 400, { error: "请说明为什么要建立这条关系" });
            return;
          }
          try {
            const result = coordinator.addRelation(
              options.boardId,
              {
                from_goal_id: direction === "outgoing" ? goalId : targetGoalId,
                to_goal_id: direction === "outgoing" ? targetGoalId : goalId,
                type,
                state: "active",
                reason,
              },
              {
                actor_id: "web-user",
                idempotency_key: String(body.idempotency_key ?? `web-relation-${randomUUID()}`),
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
        const relationDeactivateMatch = url.pathname.match(
          /^\/api\/relations\/([^/]+)\/deactivate$/,
        );
        if (request.method === "POST" && relationDeactivateMatch) {
          const body = await readBody(request);
          const reason = String(body.reason ?? "").trim();
          if (!reason) {
            sendJson(response, 400, { error: "解除关系时必须说明原因" });
            return;
          }
          try {
            const result = coordinator.deactivateRelation(
              options.boardId,
              {
                relation_id: decodeURIComponent(relationDeactivateMatch[1]),
                reason,
              },
              {
                actor_id: "web-user",
                idempotency_key: String(
                  body.idempotency_key ?? `web-relation-deactivate-${randomUUID()}`,
                ),
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
          const reason = String(body.reason ?? "").trim();
          try {
            if (!reason) throw new Error("Risk 必须填写登记原因");
            const result = coordinator.addRisk(
              options.boardId,
              webRiskFacts(body, decodeURIComponent(goalRiskMatch[1])),
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
        const riskUpdateMatch = url.pathname.match(/^\/api\/risks\/([^/]+)\/update$/);
        if (request.method === "POST" && riskUpdateMatch) {
          const body = await readBody(request);
          const reason = String(body.reason ?? "").trim();
          try {
            const result = coordinator.updateRisk(
              options.boardId,
              {
                risk_id: decodeURIComponent(riskUpdateMatch[1]),
                ...webRiskFacts(body),
              },
              {
                actor_id: "web-user",
                idempotency_key: String(body.idempotency_key ?? `web-risk-update-${randomUUID()}`),
                reason,
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
        const riskStateMatch = url.pathname.match(/^\/api\/risks\/([^/]+)\/state$/);
        if (request.method === "POST" && riskStateMatch) {
          const body = await readBody(request);
          const state = String(body.state ?? "") as RiskRecord["state"];
          const reason = String(body.reason ?? "").trim();
          try {
            const result = coordinator.setRiskState(
              options.boardId,
              {
                risk_id: decodeURIComponent(riskStateMatch[1]),
                state,
                reason,
              },
              {
                actor_id: "web-user",
                idempotency_key: String(body.idempotency_key ?? `web-risk-state-${randomUUID()}`),
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
        const goalImpactMatch = url.pathname.match(/^\/api\/goals\/([^/]+)\/impacts$/);
        if (request.method === "POST" && goalImpactMatch) {
          const body = await readBody(request);
          try {
            const result = coordinator.addImpact(
              options.boardId,
              webImpactFacts(body, decodeURIComponent(goalImpactMatch[1])),
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
        const impactUpdateMatch = url.pathname.match(/^\/api\/impacts\/([^/]+)\/update$/);
        if (request.method === "POST" && impactUpdateMatch) {
          const body = await readBody(request);
          try {
            const result = coordinator.updateImpact(
              options.boardId,
              {
                binding_id: decodeURIComponent(impactUpdateMatch[1]),
                ...webImpactFacts(body),
              },
              {
                actor_id: "web-user",
                idempotency_key: String(body.idempotency_key ?? `web-impact-update-${randomUUID()}`),
                reason: String(body.audit_reason ?? "").trim(),
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
        const impactDeactivateMatch = url.pathname.match(/^\/api\/impacts\/([^/]+)\/deactivate$/);
        if (request.method === "POST" && impactDeactivateMatch) {
          const body = await readBody(request);
          try {
            const result = coordinator.deactivateImpact(
              options.boardId,
              {
                binding_id: decodeURIComponent(impactDeactivateMatch[1]),
                reason: String(body.reason ?? "").trim(),
              },
              {
                actor_id: "web-user",
                idempotency_key: String(body.idempotency_key ?? `web-impact-deactivate-${randomUUID()}`),
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
        const goalEvidenceMatch = url.pathname.match(/^\/api\/goals\/([^/]+)\/evidence$/);
        if (request.method === "POST" && goalEvidenceMatch) {
          const body = await readBody(request);
          const criterionIds = uniqueTextArray(body.criterion_ids);
          const kind = String(body.kind ?? "attestation");
          const result = String(body.result ?? "passed");
          const locator = String(body.locator ?? "").trim();
          const digest = typeof body.digest === "string" ? body.digest.trim() : "";
          if (!criterionIds.length) {
            sendJson(response, 400, { error: "至少选择一条验收条件" });
            return;
          }
          if (![
            "test",
            "measurement",
            "artifact",
            "inspection",
            "attestation",
            "human_verdict",
          ].includes(kind)) {
            sendJson(response, 400, { error: "Evidence 类型无效" });
            return;
          }
          if (!["passed", "failed", "inconclusive"].includes(result)) {
            sendJson(response, 400, { error: "Evidence 结果必须是 passed、failed 或 inconclusive" });
            return;
          }
          if (!locator || locator.length > 4_000) {
            sendJson(response, 400, { error: "Evidence 定位引用不能为空且不能超过 4000 个字符" });
            return;
          }
          if (digest.length > 16_000) {
            sendJson(response, 400, { error: "Evidence 摘要不能超过 16000 个字符" });
            return;
          }
          try {
            const resultValue = coordinator.submitEvidence({
              board_id: options.boardId,
              goal_id: decodeURIComponent(goalEvidenceMatch[1]),
              actor_id: "web-user",
              criterion_ids: criterionIds,
              kind: kind as Parameters<GoalBoardCoordinator["submitEvidence"]>[0]["kind"],
              locator,
              locator_context: { project_root: options.projectRoot ?? null },
              digest: digest || null,
              result: result as Parameters<GoalBoardCoordinator["submitEvidence"]>[0]["result"],
              idempotency_key: String(body.idempotency_key ?? `web-evidence-${randomUUID()}`),
            });
            sendJson(response, 201, resultValue);
          } catch (error) {
            sendJson(response, 400, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
          return;
        }
        const activeGoalMatch = url.pathname.match(/^\/api\/goals\/([^/]+)\/active$/);
        if (request.method === "POST" && activeGoalMatch) {
          const body = await readBody(request);
          const goalId = decodeURIComponent(activeGoalMatch[1]);
          const reason = String(body.reason ?? "用户从 GoalBoard 设为当前 Goal").trim();
          if (!reason) {
            sendJson(response, 400, { error: "设为当前 Goal 时必须说明原因" });
            return;
          }
          try {
            const result = coordinator.setActiveGoal(
              options.boardId,
              { goal_id: goalId, reason },
              {
                actor_id: "web-user",
                idempotency_key: String(body.idempotency_key ?? `web-active-goal-${randomUUID()}`),
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
        const goalTrashMatch = url.pathname.match(/^\/api\/goals\/([^/]+)\/trash$/);
        if (request.method === "POST" && goalTrashMatch) {
          const body = await readBody(request);
          if (typeof body.trashed !== "boolean") {
            sendJson(response, 400, { error: "trashed 必须是 boolean" });
            return;
          }
          if (body.user_confirmed !== true) {
            sendJson(response, 400, { error: "请先在 GoalBoard 中确认此操作" });
            return;
          }
          const goalId = decodeURIComponent(goalTrashMatch[1]);
          try {
            const result = coordinator.setGoalTrashed(
              options.boardId,
              {
                goal_id: goalId,
                trashed: body.trashed,
                reason: String(body.reason ?? "").trim(),
              },
              {
                actor_id: "web-user",
                idempotency_key: String(body.idempotency_key ?? `web-trash-${randomUUID()}`),
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
        const goalTreeProposalMatch = url.pathname.match(
          /^\/api\/goal-tree-proposals\/([^/]+)\/decision$/,
        );
        if (request.method === "POST" && goalTreeProposalMatch) {
          const body = await readBody(request);
          if (Array.isArray(body.risk_repairs)) {
            if (body.decisions != null || body.confirm_all_pending === true) {
              sendJson(response, 400, { error: "风险修订不能同时提交采用或退回决定" });
              return;
            }
            const proposalId = decodeURIComponent(goalTreeProposalMatch[1]);
            const proposal = coordinator.listGoalTreeProposals({
              board_id: options.boardId,
              proposal_id: proposalId,
              include_legacy: false,
            }).proposals[0];
            if (!proposal || (proposal.state !== "pending" && proposal.state !== "partially_applied")) {
              sendJson(response, 400, { error: "这份方案已经变化，请刷新后重新处理" });
              return;
            }
            if (proposal.items.some((item) => item.state === "conflict")) {
              sendJson(response, 400, { error: "这份方案和当前 GoalBoard 状态有冲突，请先让 Runtime 更新方案" });
              return;
            }
            const pendingItems = proposal.items.filter((item) => item.state === "pending");
            const allowedTreatments = new Set<RiskRecord["treatment"]>(["accept", "mitigate", "avoid", "defer"]);
            const repairMap = new Map<string, { treatment: RiskRecord["treatment"]; treatment_plan?: string }>();
            for (const raw of body.risk_repairs) {
              if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
                sendJson(response, 400, { error: "风险处理选择格式无效" });
                return;
              }
              const value = raw as Record<string, unknown>;
              const itemId = String(value.item_id ?? "").trim();
              const treatment = String(value.treatment ?? "") as RiskRecord["treatment"];
              if (!itemId || !allowedTreatments.has(treatment) || repairMap.has(itemId)) {
                sendJson(response, 400, { error: "每条风险都必须且只能选择一种处理方式" });
                return;
              }
              repairMap.set(itemId, {
                treatment,
                ...(Object.prototype.hasOwnProperty.call(value, "treatment_plan")
                  ? { treatment_plan: String(value.treatment_plan ?? "").trim() }
                  : {}),
              });
            }
            if (!repairMap.size) {
              sendJson(response, 400, { error: "请至少选择一条风险的处理方式" });
              return;
            }
            for (const [itemId] of repairMap) {
              const item = pendingItems.find((candidate) => candidate.item_id === itemId);
              if (!item || item.kind !== "risk") {
                sendJson(response, 400, { error: "要修订的风险已经变化，请刷新后重试" });
                return;
              }
            }
            const invalidTreatmentItems = pendingItems.filter((item) =>
              item.kind === "risk" && !allowedTreatments.has(String(item.payload.treatment ?? "") as RiskRecord["treatment"]));
            if (invalidTreatmentItems.some((item) => !repairMap.has(item.item_id))) {
              sendJson(response, 400, { error: "请为页面列出的每条风险选择处理方式" });
              return;
            }
            const reason = typeof body.reason === "string" && body.reason.trim()
              ? body.reason.trim()
              : "用户在决定中心为方案中的风险选择处理方式，并确认保留或修改具体措施。";
            const revisionDecisions = pendingItems.map((item) => {
              const repair = repairMap.get(item.item_id);
              const previousTreatment = String(item.payload.treatment ?? "").trim();
              const previousPlan = String(item.payload.treatment_plan ?? "").trim()
                || (allowedTreatments.has(previousTreatment as RiskRecord["treatment"]) ? "" : previousTreatment);
              const payload = repair
                ? {
                    ...item.payload,
                    treatment: repair.treatment,
                    treatment_plan: repair.treatment_plan ?? previousPlan,
                  }
                : { ...item.payload };
              const revisedItem: GoalTreeProposalItemInput = {
                item_id: `${item.item_id}-web-v${proposal.version + 1}-${randomUUID().slice(0, 8)}`,
                kind: item.kind,
                operation: item.operation,
                payload,
                source_refs: [...item.source_refs, `web-risk-repair:${proposal.proposal_id}`],
                reason: item.reason,
                confidence: item.confidence,
                affected_objects: item.affected_objects,
                requires_user_confirmation: true,
                supersedes_item_id: item.item_id,
              };
              return {
                item_id: item.item_id,
                decision: "revise" as const,
                reason,
                revised_item: revisedItem,
              };
            });
            try {
              const result = coordinator.decideGoalTreeProposal({
                board_id: options.boardId,
                proposal_id: proposalId,
                authority: {
                  actor_id: "web-user",
                  actor_kind: "user",
                  authority_source: "web",
                  conversation_ref: `web:${options.boardId}`,
                  message_ref: `web-risk-repair:${randomUUID()}`,
                },
                decisions: revisionDecisions,
                reason,
                idempotency_key: String(body.idempotency_key ?? `web-risk-repair-${randomUUID()}`),
              });
              sendJson(response, 200, result);
            } catch (error) {
              sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
            }
            return;
          }
          if (body.confirm_all_pending === true) {
            sendJson(response, 400, {
              error: "Web 入口不能验证上一轮是否明确请求整份确认；请逐项选择，或在当前 Runtime 对话中确认整份提案。",
            });
            return;
          }
          if (body.decisions != null && !Array.isArray(body.decisions)) {
            sendJson(response, 400, { error: "decisions 必须是条目决定列表" });
            return;
          }
          try {
            const proposalId = decodeURIComponent(goalTreeProposalMatch[1]);
            let decisions = body.decisions as Parameters<GoalBoardCoordinator["decideGoalTreeProposal"]>[0]["decisions"];
            let decisionReason = typeof body.reason === "string" ? body.reason.trim() : "";
            if (Array.isArray(decisions) && decisions.length > 0 && decisions.every((decision) => decision.decision === "reject")) {
              const proposal = coordinator.listGoalTreeProposals({
                board_id: options.boardId,
                proposal_id: proposalId,
                include_legacy: false,
              }).proposals[0];
              const undecidedItems = proposal?.items.filter((item) => item.state === "pending" || item.state === "conflict") ?? [];
              const submittedIds = new Set(decisions.map((decision) => decision.item_id));
              const rejectsWholeOpenProposal = undecidedItems.length > 0 &&
                submittedIds.size === undecidedItems.length &&
                undecidedItems.every((item) => submittedIds.has(item.item_id));
              if (proposal && rejectsWholeOpenProposal) {
                const systemProblems = [
                  ...undecidedItems.flatMap((item) => goalTreeProposalItemValidationIssues(item).map((issue) => issue.message)),
                  ...goalTreeProposalDecompositionIssues(undecidedItems, store.snapshot(options.boardId)).map((issue) => issue.message),
                  ...(undecidedItems.some((item) => item.state === "conflict")
                    ? [`这份方案有 ${undecidedItems.filter((item) => item.state === "conflict").length} 项已和当前 GoalBoard 状态不一致。`]
                    : []),
                ];
                const uniqueProblems = [...new Set(systemProblems)];
                if (uniqueProblems.length > 0) {
                  const automaticReason = `GoalBoard 自动退回修正：${uniqueProblems.join("；")}`;
                  decisionReason = decisionReason
                    ? `${automaticReason}；用户补充：${decisionReason}`
                    : automaticReason;
                  decisions = decisions.map((decision) => ({ ...decision, reason: decisionReason }));
                }
              }
            }
            const result = coordinator.decideGoalTreeProposal({
              board_id: options.boardId,
              proposal_id: proposalId,
              authority: {
                actor_id: "web-user",
                actor_kind: "user",
                authority_source: "web",
                conversation_ref: `web:${options.boardId}`,
                message_ref: `web-decision:${randomUUID()}`,
              },
              decisions,
              reason: decisionReason || undefined,
              idempotency_key: String(body.idempotency_key ?? `web-goal-tree-decision-${randomUUID()}`),
            });
            sendJson(response, 200, result);
          } catch (error) {
            sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
          }
          return;
        }
        if (request.method === "POST" && contractProposalMatch) {
          const body = await readBody(request);
          const decision = String(body.decision);
          if (decision !== "approved" && decision !== "rejected") {
            sendJson(response, 400, { error: "decision 必须是 approved 或 rejected" });
            return;
          }
          const reason = typeof body.reason === "string" ? body.reason.trim() : "";
          if (!reason) {
            sendJson(response, 400, { error: "请填写决定理由或修改意见" });
            return;
          }
          const result = coordinator.decideContractProposal({
            board_id: options.boardId,
            proposal_id: decodeURIComponent(contractProposalMatch[1]),
            actor_id: "web-user",
            actor_kind: "user",
            decision,
            reason,
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
          const reason = typeof body.reason === "string" ? body.reason.trim() : "";
          if (!reason) {
            sendJson(response, 400, { error: "请填写决定理由或修改意见" });
            return;
          }
          const result = coordinator.decideCandidate({
            board_id: options.boardId,
            candidate_id: decodeURIComponent(candidateMatch[1]),
            actor_id: "web-user",
            actor_kind: "user",
            decision,
            reason,
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
          const reason = typeof body.reason === "string" ? body.reason.trim() : "";
          if (!reason) {
            sendJson(response, 400, { error: "请填写决定理由或修改意见" });
            return;
          }
          const result = coordinator.confirmRewire({
            board_id: options.boardId,
            rewire_id: decodeURIComponent(rewireMatch[1]),
            actor_id: "web-user",
            actor_kind: "user",
            decision,
            reason,
            idempotency_key: String(body.idempotency_key ?? `web-${randomUUID()}`),
          });
          sendJson(response, 200, result);
          return;
        }
        const goalPageMatch = url.pathname.match(/^\/goals\/([^/]+)$/);
        const archivePageMatch = url.pathname.match(/^\/archive\/goals\/([^/]+)$/);
        const trashPageMatch = url.pathname.match(/^\/trash\/goals\/([^/]+)$/);
        const archiveIndex = url.pathname === "/archive";
        const trashIndex = url.pathname === "/trash";
        const decisionIndex = url.pathname === "/decisions";
        if (
          request.method === "GET" &&
          (
            url.pathname === "/" ||
            goalPageMatch ||
            archiveIndex ||
            archivePageMatch ||
            trashIndex ||
            trashPageMatch ||
            decisionIndex
          )
        ) {
          let requestedGoalId: string | undefined;
          if (goalPageMatch || archivePageMatch || trashPageMatch) {
            try {
              requestedGoalId = decodeURIComponent((goalPageMatch ?? archivePageMatch ?? trashPageMatch)![1]);
            } catch {
              sendJson(response, 404, { error: "Goal 页面不存在" });
              return;
            }
          }
          const view = readWebView();
          const requestedArchived = requestedGoalId
            ? view.archived_goals.some((item) => item.goal.goal_id === requestedGoalId)
            : false;
          const requestedTrashed = requestedGoalId
            ? view.trashed_goals.some((item) => item.goal.goal_id === requestedGoalId)
            : false;
          const trashView = trashIndex || Boolean(trashPageMatch) || requestedTrashed;
          const archiveView = !trashView && (archiveIndex || Boolean(archivePageMatch) || requestedArchived);
          const collection = trashView ? view.trashed_goals : archiveView ? view.archived_goals : view.goals;
          if (requestedGoalId && !collection.some((item) => item.goal.goal_id === requestedGoalId)) {
            sendJson(response, 404, { error: `找不到这个 Goal: ${requestedGoalId}` });
            return;
          }
          const desktopShell = isDesktopShellRequest(request, url);
          const html = renderGoalBoardWeb(
            view,
            requestedGoalId,
            archiveView,
            decisionIndex,
            trashView,
            controlToken,
            desktopShell,
            {
              "claude-code": isPtyCommandAvailable("claude"),
              codex: isPtyCommandAvailable("codex"),
              opencode: isPtyCommandAvailable("opencode"),
              "pi-agent": isPtyCommandAvailable("pi"),
              "grok-build": isPtyCommandAvailable("grok"),
            },
          );
          const headers: Record<string, string> = {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "content-security-policy": PAGE_CSP,
            ...desktopCookieHeaders(request, url),
          };
          response.writeHead(200, headers);
          response.end(html);
          return;
        }
        sendJson(response, 404, { error: L("页面或接口不存在") });
      } finally {
        store.close();
      }
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const modulePath = fileURLToPath(import.meta.url);
const requestedModulePath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const isMain = requestedModulePath != null && (() => {
  try {
    return fs.realpathSync(modulePath) === fs.realpathSync(requestedModulePath);
  } catch {
    return modulePath === requestedModulePath;
  }
})();
if (isMain) {
  const args = process.argv.slice(2);
  const homeArgument = flag(args, "--home");
  const port = Number(flag(args, "--port") ?? 4173);
  const unsupported = ["--db", "--board-id", "--demo"].find((argument) => args.includes(argument));
  if (unsupported) {
    console.error(`GoalBoard Web 只按项目启动；${unsupported} 已不支持。请先在当前 Runtime 使用 GoalBoard Skill 创建、连接或迁移项目。`);
    process.exitCode = 1;
  } else {
    const server = createGoalBoardWebServer({
      ...(homeArgument ? { homeDirectory: path.resolve(homeArgument) } : {}),
    });
    const shutdown = () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 2000).unref();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    server.listen(port, "127.0.0.1", () => {
      console.log(`GoalBoard Web: http://127.0.0.1:${port}`);
      console.log("项目列表（网页不会修改 Runtime Session 绑定）");
    });
  }
}

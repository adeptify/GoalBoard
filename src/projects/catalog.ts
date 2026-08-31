import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants, realpathSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { PlanningMethodPack } from "../planning/method-packs.js";
import { GoalBoardCoordinator } from "../v1/coordinator.js";
import { DEMO_BOARD_ID, seedDemoBoard } from "../v1/demo.js";
import { SqliteGoalBoardStore } from "../v1/store.js";
import type { BoardSnapshot } from "../v1/types.js";

const CATALOG_SCHEMA_VERSION = 9;
const CATALOG_OWNER = "goalboard-project-catalog-v1";

export interface GoalBoardProjectRecord {
  project_id: string;
  display_name: string;
  board_id: string;
  database_path: string;
  source: "created" | "migrated";
  data_class: "user" | "migrated_user" | "regenerable_demo";
  migrated_from_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface GoalBoardProjectCatalogOptions {
  /** Defaults to ~/.goalboard. */
  homeDirectory?: string;
}

export interface GoalBoardProjectCatalogErrorDetails {
  actual_schema_version?: number;
  supported_schema_min?: number;
  supported_schema_max?: number;
  recovery?: "new_or_fork_session_then_context_resolve";
}

/**
 * An identity supplied by the Runtime host for the work entry the user is
 * currently using. `stable_work_context_id` is deliberately opaque: GoalBoard
 * never derives it from a repository, directory, or conversation. Reusing an
 * ID resumes the same host Session/work entry; a fresh Session must receive a
 * fresh ID from its host.
 */
export interface RuntimeWorkContext {
  runtime_id: string;
  stable_work_context_id: string | null;
  host_declares_stable: boolean;
  /** Canonical host workspace, independent from the optional Session ID. */
  workspace?: RuntimeWorkspaceContext | null;
}

export interface NormalizedRuntimeWorkContext {
  runtime_id: string;
  stable_work_context_id: string | null;
  workspace?: NormalizedRuntimeWorkspaceContext;
}

export interface RuntimeWorkspaceContext {
  canonical_path: string;
  realpath_verified: boolean;
}

export interface NormalizedRuntimeWorkspaceContext extends RuntimeWorkspaceContext {
  workspace_id: string;
  display_name: string;
}

export type GoalBoardProjectBindingScope = "session" | "workspace_default";

export interface GoalBoardWorkspaceMembership {
  membership_id: string;
  workspace_id: string;
  workspace_name: string;
  realpath_verified: boolean;
  project_id: string;
  is_default: boolean;
  bound_by: string;
  created_at: string;
  updated_at: string;
}

export interface GoalBoardWorkspaceDirectoryRecord {
  workspace_id: string;
  canonical_path: string;
  realpath_verified: boolean;
  display_name: string;
  project_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface AddWorkspaceProjectInput {
  canonical_path: string;
  project_id: string;
  actor_id: string;
  user_confirmed: boolean;
}

export interface RepairWorkspaceProjectInput extends AddWorkspaceProjectInput {
  workspace_id: string;
}

export interface ChangeWorkspaceProjectInput {
  workspace_id: string;
  project_id: string;
  actor_id: string;
  user_confirmed: boolean;
}

export interface GoalBoardProjectSelection {
  project_id: string;
  display_name: string;
}

/**
 * A non-authoritative, host-owned clue that can rank existing projects for a
 * fresh Session. It is never an identity and is never accepted from a Runtime
 * MCP tool argument.
 */
export type RuntimeProjectSuggestionClueKind =
  | "workspace"
  | "path"
  | "directory"
  | "repository"
  | "session_title"
  | "runtime"
  | "recent_project"
  | "project_name";

export interface RuntimeProjectSuggestionClue {
  kind: RuntimeProjectSuggestionClueKind;
  value: string;
}

export interface GoalBoardProjectSuggestion extends GoalBoardProjectSelection {
  /** Generic, user-safe explanation; never includes the host clue value. */
  reasons: string[];
}

export interface GoalBoardRuntimeContextBinding {
  binding_id: string;
  runtime_id: string;
  stable_work_context_id: string;
  project_id: string;
  bound_by: string;
  created_at: string;
  updated_at: string;
}

export interface GoalBoardDesktopPanelRecord {
  panel_id: string;
  project_id: string;
  goal_id: string;
  runtime_kind: string;
  launch_command: string;
  launch_args: string[];
  cwd: string | null;
  work_context_id: string;
  host_session_id: string | null;
  tab_index: number;
  title: string;
  status: "open" | "exited";
  created_at: string;
  updated_at: string;
}

export interface OpenGoalBoardDesktopPanelInput {
  project_id: string;
  goal_id: string;
  runtime_kind: string;
  launch_command: string;
  launch_args?: string[];
  cwd?: string | null;
  title?: string;
  actor_id: string;
  host_session_id?: string | null;
  user_confirmed: boolean;
}

export interface AliasGoalBoardDesktopPanelSessionInput {
  panel_id: string;
  runtime_id: string;
  host_session_id: string;
  actor_id: string;
}

export interface GoalBoardRuntimeContextBindingEvent {
  event_id: string;
  binding_id: string;
  runtime_id: string;
  stable_work_context_id: string;
  type: "context.bound" | "context.rebound" | "context.unbound";
  previous_project_id: string | null;
  project_id: string;
  actor_id: string;
  created_at: string;
}

export interface GoalBoardProjectConnection {
  project_id: string;
  board_id: string;
  database_path: string;
}

export interface GoalBoardRuntimeContextResolution {
  status: "bound" | "suggested" | "unbound";
  reason: "missing_stable_context" | "unknown_context" | null;
  next_action:
    | "continue"
    | "use_explicit_existing_selection_or_ask_user_to_confirm_suggestion"
    | "use_explicit_existing_selection_or_ask_user_to_select_or_create";
  context: NormalizedRuntimeWorkContext;
  project: GoalBoardProjectSelection | null;
  connection: GoalBoardProjectConnection | null;
  suggested_projects: GoalBoardProjectSuggestion[];
  available_projects: GoalBoardProjectSelection[];
}

export interface BindRuntimeWorkContextInput {
  context: RuntimeWorkContext;
  project_id: string;
  actor_id: string;
  /** The user selected this project in the current Runtime conversation. */
  user_confirmed: boolean;
  /** Required only when a previously bound entry switches to another project. */
  rebind_confirmed?: boolean;
  /** Omit to record a workspace candidate; `session` only affects the current native Session. */
  binding_scope?: GoalBoardProjectBindingScope;
}

export interface UnbindRuntimeWorkContextInput {
  context: RuntimeWorkContext;
  actor_id: string;
  /** The user explicitly asked to disconnect this current Runtime entry. */
  user_confirmed: boolean;
  /** Session override by default; workspace removes one long-lived membership. */
  binding_scope?: "session" | "workspace";
  project_id?: string;
}

export interface GoalBoardRuntimeContextUnbindResult {
  resolution: GoalBoardRuntimeContextResolution;
  unbound_project: GoalBoardProjectSelection | null;
  changed: boolean;
}

export interface RejectRuntimeContextSuggestionInput {
  context: RuntimeWorkContext;
  project_id: string;
  actor_id: string;
  /** The user explicitly rejected this candidate in the current conversation. */
  user_confirmed: boolean;
  /** Host-only ranking hints. The model never supplies them through MCP. */
  suggestion_clues: readonly RuntimeProjectSuggestionClue[];
}

export interface GoalBoardRuntimeContextSuggestionRejectionResult {
  resolution: GoalBoardRuntimeContextResolution;
  rejected_project: GoalBoardProjectSelection;
  changed: boolean;
}

export interface CreateGoalBoardProjectInput {
  display_name: string;
  actor_id: string;
}

export interface ManageGoalBoardDemoProjectInput {
  actor_id: string;
  user_confirmed: boolean;
  display_name?: string;
}

export interface GoalBoardDemoProjectResult {
  status: "created" | "existing" | "reset";
  project: GoalBoardProjectRecord;
}

export interface DeleteGoalBoardProjectInput {
  project_id: string;
  actor_id: string;
  /** Separate from normal project selection: this is permission to erase its managed DB. */
  delete_confirmed: boolean;
  idempotency_key: string;
}

export interface GoalBoardProjectDeletionRecord {
  deletion_id: string;
  project_id: string;
  display_name: string;
  board_id: string;
  actor_id: string;
  deleted_binding_count: number;
  cleanup_state: "complete" | "pending";
  cleanup_error: string | null;
  deleted_at: string;
  cleaned_at: string | null;
}

export interface GoalBoardProjectDeletionResult {
  deletion: GoalBoardProjectDeletionRecord;
  replayed: boolean;
}

/**
 * Creates a new GoalBoard project and binds it to the host-declared work
 * entry in one recoverable operation. Call this only after the user has
 * explicitly asked for a new project in the current Runtime conversation.
 */
export interface CreateAndBindRuntimeContextInput {
  context: RuntimeWorkContext;
  display_name: string;
  actor_id: string;
  user_confirmed: boolean;
  rebind_confirmed?: boolean;
  binding_scope?: GoalBoardProjectBindingScope;
  idempotency_key: string;
}

export type GoalBoardProjectMigrationStep =
  | "after_copy"
  | "after_validation"
  | "before_catalog_commit";

export interface MigrateGoalBoardProjectInput {
  legacy_database_path: string;
  display_name?: string;
  actor_id: string;
  /** Test-only failure injection used to verify migration rollback. */
  beforeStep?: (step: GoalBoardProjectMigrationStep) => void | Promise<void>;
}

export class GoalBoardProjectCatalogError extends Error {
  constructor(
    readonly code:
      | "catalog.unknown_database"
      | "catalog.unsupported_schema"
      | "catalog.reader_too_old"
      | "catalog.invalid_name"
      | "catalog.project_not_found"
      | "catalog.legacy_missing"
      | "catalog.legacy_invalid"
      | "catalog.legacy_conflict"
      | "catalog.project_storage_invalid"
      | "catalog.project_active_work"
      | "catalog.delete_confirmation_required"
      | "catalog.deletion_idempotency_conflict"
      | "catalog.demo_confirmation_required"
      | "catalog.demo_not_found"
      | "catalog.not_demo"
      | "context.stable_identity_required"
      | "context.identity_required"
      | "context.workspace_required"
      | "context.workspace_membership_not_found"
      | "context.workspace_default_unsupported"
      | "context.user_confirmation_required"
      | "context.rebind_confirmation_required"
      | "context.suggestion_not_available"
      | "context.idempotency_key_required"
      | "context.idempotency_conflict"
      | "catalog.panel_not_found"
      | "catalog.panel_confirmation_required",
    message: string,
    readonly details: GoalBoardProjectCatalogErrorDetails = {},
  ) {
    super(message);
    this.name = "GoalBoardProjectCatalogError";
  }
}

export function catalogSchemaCompatibilityError(
  actualSchemaVersion: number,
  supportedSchemaMax: number = CATALOG_SCHEMA_VERSION,
): GoalBoardProjectCatalogError | null {
  if (Number.isInteger(actualSchemaVersion) && actualSchemaVersion > supportedSchemaMax) {
    return new GoalBoardProjectCatalogError(
      "catalog.reader_too_old",
      `GoalBoard catalog schema=${actualSchemaVersion}，当前 reader 支持 1..${supportedSchemaMax}。`
        + "当前 Session 不会热刷新 MCP；请新建或 Fork 一个 Session，先确认当前任务焦点，再只读调用 context_resolve。"
        + "解析成功后再继续写入；不要回滚 catalog.db，也不要用 SQLite、CLI 或 Web 绕过。",
      {
        actual_schema_version: actualSchemaVersion,
        supported_schema_min: 1,
        supported_schema_max: supportedSchemaMax,
        recovery: "new_or_fork_session_then_context_resolve",
      },
    );
  }
  if (!Number.isInteger(actualSchemaVersion) || actualSchemaVersion < 1) {
    return new GoalBoardProjectCatalogError(
      "catalog.unsupported_schema",
      `GoalBoard 项目目录数据库的 schema 元数据无效；当前 reader 支持 1..${supportedSchemaMax}`,
      { supported_schema_min: 1, supported_schema_max: supportedSchemaMax },
    );
  }
  return null;
}

/**
 * The catalog owns project identity and DB location. It deliberately does not
 * know about Runtime sessions or MCP transport; the lifecycle layer consumes
 * this storage boundary later.
 */
export class GoalBoardProjectCatalog {
  readonly homeDirectory: string;
  readonly projectsDirectory: string;
  readonly databasePath: string;

  private constructor(
    private readonly db: Database.Database,
    homeDirectory: string,
  ) {
    this.homeDirectory = homeDirectory;
    this.projectsDirectory = path.join(homeDirectory, "projects");
    this.databasePath = path.join(this.projectsDirectory, "catalog.db");
  }

  static async open(options: GoalBoardProjectCatalogOptions = {}): Promise<GoalBoardProjectCatalog> {
    const homeDirectory = path.resolve(options.homeDirectory ?? path.join(os.homedir(), ".goalboard"));
    const projectsDirectory = path.join(homeDirectory, "projects");
    await fs.mkdir(projectsDirectory, { recursive: true });
    const databasePath = path.join(projectsDirectory, "catalog.db");
    const existed = await exists(databasePath);
    const db = new Database(databasePath, { timeout: 5000 });
    try {
      db.pragma("journal_mode = WAL");
      db.pragma("synchronous = FULL");
      db.pragma("foreign_keys = ON");
      db.pragma("busy_timeout = 5000");
      if (existed) {
        assertOwnedCatalog(db, databasePath);
        migrateCatalog(db, databasePath);
      } else {
        initializeCatalog(db);
      }
      return new GoalBoardProjectCatalog(db, homeDirectory);
    } catch (error) {
      db.close();
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }

  listProjects(): GoalBoardProjectRecord[] {
    return (this.db
      .prepare("SELECT * FROM projects ORDER BY display_name COLLATE NOCASE, created_at, project_id")
      .all() as Array<Record<string, unknown>>).map(mapProject);
  }

  listPersonalPlanningMethodPacks(): PlanningMethodPack[] {
    return (this.db
      .prepare("SELECT pack_json FROM personal_planning_method_packs ORDER BY method_id")
      .all() as Array<{ pack_json?: unknown }>)
      .map((row) => parsePlanningMethodPack(row.pack_json))
      .filter((pack): pack is PlanningMethodPack => pack != null);
  }

  putPersonalPlanningMethodPack(pack: PlanningMethodPack): void {
    if (pack.scope !== "personal") {
      throw new Error("个人方法库只能保存 scope=personal 的方法包");
    }
    this.db
      .prepare(`
        INSERT INTO personal_planning_method_packs (
          method_id, version, enabled, pack_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(method_id) DO UPDATE SET
          version = excluded.version,
          enabled = excluded.enabled,
          pack_json = excluded.pack_json,
          updated_at = excluded.updated_at
      `)
      .run(
        pack.method_id,
        pack.version,
        pack.enabled ? 1 : 0,
        JSON.stringify(pack),
        pack.created_at,
        pack.updated_at,
      );
  }

  deletePersonalPlanningMethodPack(methodId: string): boolean {
    return this.db.prepare("DELETE FROM personal_planning_method_packs WHERE method_id = ?").run(methodId).changes > 0;
  }

  getProject(projectId: string): GoalBoardProjectRecord {
    const row = this.db
      .prepare("SELECT * FROM projects WHERE project_id = ?")
      .get(projectId) as Record<string, unknown> | undefined;
    if (!row) {
      throw new GoalBoardProjectCatalogError("catalog.project_not_found", `找不到 GoalBoard 项目: ${projectId}`);
    }
    return mapProject(row);
  }

  /** Resolve without mutating state: Session binding first, then workspace members as choices. */
  resolveRuntimeContext(
    context: RuntimeWorkContext,
    suggestionClues: readonly RuntimeProjectSuggestionClue[] = [],
  ): GoalBoardRuntimeContextResolution {
    const normalized = normalizeRuntimeWorkContext(context);
    const availableProjects = this.projectSelections();
    if (!normalized.stable_work_context_id && !normalized.workspace) {
      return unboundResolution(normalized, "missing_stable_context", availableProjects);
    }
    const binding = this.findRuntimeContextBinding(normalized);
    if (binding) {
      return boundResolution(normalized, this.getProject(binding.project_id));
    }
    const workspaceSuggestions = this.workspaceMemberSuggestions(normalized.workspace);
    if (workspaceSuggestions.length > 0) {
      return suggestedResolution(normalized, workspaceSuggestions, availableProjects);
    }
    const suggestedProjects = this.runtimeContextSuggestions(normalized, suggestionClues);
    if (suggestedProjects.length > 0) {
      return suggestedResolution(normalized, suggestedProjects, availableProjects);
    }
    return unboundResolution(normalized, "unknown_context", availableProjects);
  }

  /**
   * Records that the user rejected one host-suggested project for this exact
   * Session/work entry. It never unbinds, deletes, or hides that project from
   * other Sessions or the explicit project list.
   */
  rejectRuntimeContextSuggestion(
    input: RejectRuntimeContextSuggestionInput,
  ): GoalBoardRuntimeContextSuggestionRejectionResult {
    const normalized = requireStableRuntimeWorkContext(input.context);
    const actorId = requiredActorId(input.actor_id);
    const projectId = requiredProjectId(input.project_id);
    if (input.user_confirmed !== true) {
      throw new GoalBoardProjectCatalogError(
        "context.user_confirmation_required",
        "只有用户在当前对话明确拒绝候选项目后才能停止在本 Session 推荐它",
      );
    }

    return this.db.transaction(() => {
      if (this.findRuntimeContextBinding(normalized)) {
        throw new GoalBoardProjectCatalogError(
          "context.suggestion_not_available",
          "当前 Runtime 工作入口已经绑定项目，不能拒绝未绑定 Session 的候选项目",
        );
      }
      const allSuggestions = this.runtimeContextSuggestions(normalized, input.suggestion_clues, true);
      const suggestion = allSuggestions.find((candidate) => candidate.project_id === projectId);
      if (!suggestion) {
        throw new GoalBoardProjectCatalogError(
          "context.suggestion_not_available",
          "这个项目不是当前 Runtime Session 的候选项目，不能把它标记为已拒绝",
        );
      }
      const result = this.db
        .prepare(`
          INSERT OR IGNORE INTO runtime_context_suggestion_rejections (
            runtime_id, stable_work_context_id, project_id, actor_id, created_at
          ) VALUES (?, ?, ?, ?, ?)
        `)
        .run(
          normalized.runtime_id,
          normalized.stable_work_context_id,
          projectId,
          actorId,
          new Date().toISOString(),
        );
      if (result.changes > 0) {
        this.appendEvent(projectId, "project.runtime_context_suggestion_rejected", actorId, {
          runtime_id: normalized.runtime_id,
          stable_work_context_id: normalized.stable_work_context_id,
        });
      }
      return {
        resolution: this.resolveRuntimeContext(input.context, input.suggestion_clues),
        rejected_project: {
          project_id: suggestion.project_id,
          display_name: suggestion.display_name,
        },
        changed: result.changes > 0,
      };
    })();
  }

  /**
   * Persist the user's explicit project choice for the current host-declared
   * stable entry. A target change is rejected unless that rebind was separately
   * confirmed, and the read/change/event sequence is one SQLite transaction.
   */
  bindRuntimeContext(input: BindRuntimeWorkContextInput): GoalBoardRuntimeContextResolution {
    const normalized = requireRoutableRuntimeWorkContext(input.context);
    const actorId = requiredActorId(input.actor_id);
    const projectId = input.project_id.trim();
    if (!projectId) {
      throw new GoalBoardProjectCatalogError("catalog.project_not_found", "绑定时必须选择一个 GoalBoard 项目");
    }
    if (input.user_confirmed !== true) {
      throw new GoalBoardProjectCatalogError(
        "context.user_confirmation_required",
        "只有用户在当前对话明确选择项目后才能建立绑定",
      );
    }
    if (input.binding_scope === "workspace_default") {
      throw new GoalBoardProjectCatalogError(
        "context.workspace_default_unsupported",
        "工作目录不再保存默认项目；请为当前 Session 选择项目",
      );
    }

    return this.db.transaction(() => {
      const bindingScope = input.binding_scope
        ?? (normalized.stable_work_context_id ? "session" : "workspace_member");
      return this.bindRuntimeContextInTransaction({
        normalized,
        projectId,
        actorId,
        rebindConfirmed: input.rebind_confirmed === true,
        bindingScope,
      });
    })();
  }

  /**
   * Removes only the current host-declared work-entry binding. The managed
   * project and its database stay intact and can be bound again later.
   */
  unbindRuntimeContext(input: UnbindRuntimeWorkContextInput): GoalBoardRuntimeContextUnbindResult {
    const normalized = requireRoutableRuntimeWorkContext(input.context);
    const actorId = requiredActorId(input.actor_id);
    if (input.user_confirmed !== true) {
      throw new GoalBoardProjectCatalogError(
        "context.user_confirmation_required",
        "只有用户在当前对话明确要求解除绑定后才能断开当前项目",
      );
    }

    return this.db.transaction(() => {
      if (input.binding_scope === "workspace") {
        if (!normalized.workspace) {
          throw new GoalBoardProjectCatalogError(
            "context.workspace_required",
            "解除目录关联时，Runtime 必须提供当前项目目录",
          );
        }
        const projectId = requiredProjectId(input.project_id ?? "");
        const membership = this.findWorkspaceMembershipByIds(normalized.workspace.workspace_id, projectId);
        if (!membership) {
          return {
            resolution: this.resolveRuntimeContext(input.context),
            unbound_project: null,
            changed: false,
          };
        }
        this.db.prepare(`
          DELETE FROM workspace_project_memberships WHERE workspace_id = ? AND project_id = ?
        `).run(normalized.workspace.workspace_id, projectId);
        this.appendEvent(projectId, "project.workspace_unlinked", actorId, {
          workspace_id: normalized.workspace.workspace_id,
        });
        const project = this.getProject(projectId);
        return {
          resolution: this.resolveRuntimeContext(input.context),
          unbound_project: { project_id: project.project_id, display_name: project.display_name },
          changed: true,
        };
      }
      const current = this.findRuntimeContextBinding(normalized);
      if (!current) {
        return {
          resolution: this.resolveRuntimeContext(input.context),
          unbound_project: null,
          changed: false,
        };
      }
      const project = this.getProject(current.project_id);
      this.removeSessionBinding(current, actorId);
      return {
        resolution: this.resolveRuntimeContext(input.context),
        unbound_project: { project_id: project.project_id, display_name: project.display_name },
        changed: true,
      };
    })();
  }

  /**
   * Create the project requested in the current Runtime conversation and bind
   * it before exposing a Board connection. Failed binding removes the newly
   * provisioned project, and a repeated exact request returns the same project.
   */
  async createProjectAndBindRuntimeContext(
    input: CreateAndBindRuntimeContextInput,
  ): Promise<GoalBoardRuntimeContextResolution> {
    const normalized = requireRoutableRuntimeWorkContext(input.context);
    const actorId = requiredActorId(input.actor_id);
    const displayName = requiredName(input.display_name);
    if (input.user_confirmed !== true) {
      throw new GoalBoardProjectCatalogError(
        "context.user_confirmation_required",
        "只有用户在当前对话明确要求新建项目后才能创建并绑定",
      );
    }
    if (input.binding_scope === "workspace_default") {
      throw new GoalBoardProjectCatalogError(
        "context.workspace_default_unsupported",
        "工作目录不再保存默认项目；请为当前 Session 选择项目",
      );
    }
    const idempotencyKey = requiredContextIdempotencyKey(input.idempotency_key);
    const requestFingerprint = JSON.stringify({
      display_name: displayName,
      actor_id: actorId,
      rebind_confirmed: input.rebind_confirmed === true,
      binding_scope: input.binding_scope ?? null,
    });
    const replay = this.findRuntimeContextSetupRequest(normalized, idempotencyKey);
    if (replay) {
      if (replay.request_fingerprint !== requestFingerprint) {
        throw new GoalBoardProjectCatalogError(
          "context.idempotency_conflict",
          "同一个项目创建请求键不能用于不同的项目名称、执行者或切换决定",
        );
      }
      const current = this.resolveRuntimeContext(input.context);
      const replayMembership = normalized.workspace
        ? this.findWorkspaceMembershipByIds(normalized.workspace.workspace_id, replay.project_id)
        : null;
      if (
        (current.status === "bound" && current.project?.project_id !== replay.project_id)
        || (current.status !== "bound" && !replayMembership)
      ) {
        throw new GoalBoardProjectCatalogError(
          "context.idempotency_conflict",
          "这个项目创建请求已被后续项目切换取代，不能用旧请求恢复连接",
        );
      }
      return boundResolution(normalized, this.getProject(replay.project_id));
    }

    // Refuse a missing rebind confirmation before creating a directory or DB.
    const current = this.resolveRuntimeContext(input.context);
    if (
      current.status === "bound"
      && normalized.stable_work_context_id !== null
      && input.rebind_confirmed !== true
    ) {
      throw new GoalBoardProjectCatalogError(
        "context.rebind_confirmation_required",
        "这个 Runtime 工作入口已绑定其他项目；请在当前对话明确确认后再创建并切换",
      );
    }

    return this.provisionCreatedProject({ displayName, actorId }, (record) =>
      this.db.transaction(() => {
        const racedReplay = this.findRuntimeContextSetupRequest(normalized, idempotencyKey);
        if (racedReplay) {
          throw new GoalBoardProjectCatalogError(
            "context.idempotency_conflict",
            "同一个项目创建请求正在或已经由另一个调用处理，请重新解析当前项目连接",
          );
        }
        this.insertProjectInTransaction(record, "project.created", actorId);
        const resolution = this.bindRuntimeContextInTransaction({
          normalized,
          projectId: record.project_id,
          actorId,
          rebindConfirmed: input.rebind_confirmed === true,
          bindingScope: input.binding_scope
            ?? (normalized.stable_work_context_id ? "session" : "workspace_member"),
        });
        this.db
          .prepare(`
            INSERT INTO runtime_context_setup_requests (
              runtime_id, stable_work_context_id, idempotency_key,
              request_fingerprint, project_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
          `)
          .run(
            normalized.runtime_id,
            runtimeContextPersistenceId(normalized),
            idempotencyKey,
            requestFingerprint,
            record.project_id,
            new Date().toISOString(),
          );
        return resolution;
      })(),
    );
  }

  private bindRuntimeContextInTransaction(input: {
    normalized: NormalizedRuntimeWorkContext;
    projectId: string;
    actorId: string;
    rebindConfirmed: boolean;
    bindingScope: GoalBoardProjectBindingScope | "workspace_member";
  }): GoalBoardRuntimeContextResolution {
    const project = this.getProject(input.projectId);
    if (input.bindingScope === "workspace_default") {
      throw new GoalBoardProjectCatalogError(
        "context.workspace_default_unsupported",
        "工作目录不再保存默认项目；请为当前 Session 选择项目",
      );
    }

    if (input.bindingScope === "workspace_member") {
      if (!input.normalized.workspace) {
        throw new GoalBoardProjectCatalogError(
          "context.workspace_required",
          "当前 Runtime 没有 Session 标识时，必须提供项目目录才能记录本次选择",
        );
      }
      this.upsertWorkspaceMembership(input.normalized.workspace, project.project_id, input.actorId);
      return boundResolution(input.normalized, project);
    }

    if (!input.normalized.stable_work_context_id) {
      throw new GoalBoardProjectCatalogError(
        "context.stable_identity_required",
        "只切换当前 Session 时需要 Runtime 提供稳定 Session 标识",
      );
    }
    if (input.normalized.workspace) {
      this.upsertWorkspaceMembership(input.normalized.workspace, project.project_id, input.actorId);
    }
    const current = this.findRuntimeContextBinding(input.normalized);
    if (!current) {
      const now = new Date().toISOString();
      const binding: GoalBoardRuntimeContextBinding = {
        binding_id: `context-binding-${randomUUID()}`,
        runtime_id: input.normalized.runtime_id,
        stable_work_context_id: input.normalized.stable_work_context_id!,
        project_id: project.project_id,
        bound_by: input.actorId,
        created_at: now,
        updated_at: now,
      };
      this.db
        .prepare(
          `
            INSERT INTO runtime_context_bindings (
              binding_id, runtime_id, stable_work_context_id, project_id,
              bound_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          binding.binding_id,
          binding.runtime_id,
          binding.stable_work_context_id,
          binding.project_id,
          binding.bound_by,
          binding.created_at,
          binding.updated_at,
        );
      this.appendRuntimeContextBindingEvent({
        binding,
        type: "context.bound",
        previousProjectId: null,
        actorId: input.actorId,
        createdAt: now,
      });
      this.appendEvent(project.project_id, "project.runtime_context_bound", input.actorId, {
        binding_id: binding.binding_id,
        runtime_id: binding.runtime_id,
        stable_work_context_id: binding.stable_work_context_id,
      });
      return boundResolution(input.normalized, project);
    }

    if (current.project_id === project.project_id) {
      return boundResolution(input.normalized, project);
    }
    if (!input.rebindConfirmed) {
      throw new GoalBoardProjectCatalogError(
        "context.rebind_confirmation_required",
        "这个 Runtime 工作入口已绑定其他项目；请在当前对话明确确认后再切换",
      );
    }

    const now = new Date().toISOString();
    this.db
      .prepare(
        `
          UPDATE runtime_context_bindings
          SET project_id = ?, bound_by = ?, updated_at = ?
          WHERE binding_id = ?
        `,
      )
      .run(project.project_id, input.actorId, now, current.binding_id);
    const rebound: GoalBoardRuntimeContextBinding = {
      ...current,
      project_id: project.project_id,
      bound_by: input.actorId,
      updated_at: now,
    };
    this.appendRuntimeContextBindingEvent({
      binding: rebound,
      type: "context.rebound",
      previousProjectId: current.project_id,
      actorId: input.actorId,
      createdAt: now,
    });
    this.appendEvent(current.project_id, "project.runtime_context_rebound_from", input.actorId, {
      binding_id: current.binding_id,
      runtime_id: current.runtime_id,
      stable_work_context_id: current.stable_work_context_id,
      next_project_id: project.project_id,
    });
    this.appendEvent(project.project_id, "project.runtime_context_rebound_to", input.actorId, {
      binding_id: current.binding_id,
      runtime_id: current.runtime_id,
      stable_work_context_id: current.stable_work_context_id,
      previous_project_id: current.project_id,
    });
    return boundResolution(input.normalized, project);
  }

  listRuntimeContextBindingEvents(
    context?: RuntimeWorkContext,
  ): GoalBoardRuntimeContextBindingEvent[] {
    const normalized = context ? normalizeRuntimeWorkContext(context) : null;
    if (normalized && !normalized.stable_work_context_id) return [];
    const rows = normalized
      ? this.db
          .prepare(
            `
              SELECT * FROM runtime_context_binding_events
              WHERE runtime_id = ? AND stable_work_context_id = ?
              ORDER BY rowid
            `,
          )
          .all(normalized.runtime_id, normalized.stable_work_context_id)
      : this.db
          .prepare("SELECT * FROM runtime_context_binding_events ORDER BY rowid")
          .all();
    return (rows as Array<Record<string, unknown>>).map(mapRuntimeContextBindingEvent);
  }

  /**
   * Returns only currently active, explicitly confirmed Runtime work-entry
   * bindings. Callers must not treat this list as permission to expose the
   * opaque host identity; Web uses the GoalBoard-owned binding ID instead.
   */
  listRuntimeContextBindings(): GoalBoardRuntimeContextBinding[] {
    const rows = this.db
      .prepare(`
        SELECT * FROM runtime_context_bindings
        ORDER BY updated_at DESC, runtime_id, stable_work_context_id
      `)
      .all();
    return (rows as Array<Record<string, unknown>>).map(mapRuntimeContextBinding);
  }

  openDesktopPanel(input: OpenGoalBoardDesktopPanelInput): GoalBoardDesktopPanelRecord {
    const projectId = requiredProjectId(input.project_id);
    const goalId = input.goal_id.trim();
    const runtimeKind = requiredRuntimeId(input.runtime_kind);
    const command = input.launch_command.trim();
    const actorId = requiredActorId(input.actor_id);
    if (!goalId) {
      throw new GoalBoardProjectCatalogError("catalog.panel_not_found", "打开终端时必须指定 Goal");
    }
    if (!command) {
      throw new GoalBoardProjectCatalogError("catalog.invalid_name", "打开终端时必须提供启动命令");
    }
    if (input.user_confirmed !== true) {
      throw new GoalBoardProjectCatalogError(
        "catalog.panel_confirmation_required",
        "只有在 Goal 详情里点开终端后才能建立这个面板",
      );
    }
    const cwd = normalizeOptionalAbsolutePath(input.cwd);
    const hostSessionId = input.host_session_id?.trim() || null;
    const args = Array.isArray(input.launch_args)
      ? input.launch_args.map((item) => String(item))
      : [];

    return this.db.transaction(() => {
      const project = this.getProject(projectId);
      const now = new Date().toISOString();
      const panelId = `panel-${randomUUID()}`;
      const workContextId = panelId;
      const tabIndexRow = this.db
        .prepare(`
          SELECT COALESCE(MAX(tab_index), -1) AS tab_index
          FROM goal_desktop_panels
          WHERE project_id = ? AND goal_id = ?
        `)
        .get(projectId, goalId) as { tab_index?: unknown };
      const tabIndex = Number(tabIndexRow.tab_index) + 1;
      const record: GoalBoardDesktopPanelRecord = {
        panel_id: panelId,
        project_id: projectId,
        goal_id: goalId,
        runtime_kind: runtimeKind,
        launch_command: command,
        launch_args: args,
        cwd,
        work_context_id: workContextId,
        host_session_id: hostSessionId,
        tab_index: tabIndex,
        title: input.title?.trim() || command,
        status: "open",
        created_at: now,
        updated_at: now,
      };
      const workspace = cwd
        ? normalizeRuntimeWorkspaceContext({ canonical_path: cwd, realpath_verified: false })
        : undefined;
      this.insertDesktopPanel(record);
      this.insertDesktopPanelAlias(panelId, runtimeKind, workContextId, now);
      this.bindRuntimeContextInTransaction({
        normalized: {
          runtime_id: runtimeKind,
          stable_work_context_id: workContextId,
          ...(workspace ? { workspace } : {}),
        },
        projectId,
        actorId,
        rebindConfirmed: true,
        bindingScope: "session",
      });
      if (hostSessionId && hostSessionId !== workContextId) {
        this.insertDesktopPanelAlias(panelId, runtimeKind, hostSessionId, now);
        this.bindRuntimeContextInTransaction({
          normalized: {
            runtime_id: runtimeKind,
            stable_work_context_id: hostSessionId,
          },
          projectId,
          actorId,
          rebindConfirmed: true,
          bindingScope: "session",
        });
      }
      this.appendEvent(project.project_id, "project.desktop_panel_opened", actorId, {
        panel_id: panelId,
        goal_id: goalId,
        runtime_kind: runtimeKind,
      });
      return record;
    })();
  }

  listDesktopPanels(projectId: string, goalId?: string): GoalBoardDesktopPanelRecord[] {
    const id = requiredProjectId(projectId);
    const rows = goalId
      ? this.db
          .prepare(`
            SELECT * FROM goal_desktop_panels
            WHERE project_id = ? AND goal_id = ?
            ORDER BY tab_index, created_at, panel_id
          `)
          .all(id, goalId.trim())
      : this.db
          .prepare(`
            SELECT * FROM goal_desktop_panels
            WHERE project_id = ?
            ORDER BY goal_id, tab_index, created_at, panel_id
          `)
          .all(id);
    return (rows as Array<Record<string, unknown>>).map(mapDesktopPanel);
  }

  getDesktopPanel(panelId: string): GoalBoardDesktopPanelRecord {
    const row = this.db
      .prepare("SELECT * FROM goal_desktop_panels WHERE panel_id = ?")
      .get(panelId.trim()) as Record<string, unknown> | undefined;
    if (!row) {
      throw new GoalBoardProjectCatalogError("catalog.panel_not_found", "找不到这个终端面板");
    }
    return mapDesktopPanel(row);
  }

  markDesktopPanelExited(panelId: string): GoalBoardDesktopPanelRecord {
    return this.db.transaction(() => {
      const current = this.getDesktopPanel(panelId);
      if (current.status === "exited") return current;
      const now = new Date().toISOString();
      this.db
        .prepare("UPDATE goal_desktop_panels SET status = 'exited', updated_at = ? WHERE panel_id = ?")
        .run(now, current.panel_id);
      return { ...current, status: "exited" as const, updated_at: now };
    })();
  }

  markDesktopPanelOpen(panelId: string): GoalBoardDesktopPanelRecord {
    return this.db.transaction(() => {
      const current = this.getDesktopPanel(panelId);
      if (current.status === "open") return current;
      const now = new Date().toISOString();
      this.db
        .prepare("UPDATE goal_desktop_panels SET status = 'open', updated_at = ? WHERE panel_id = ?")
        .run(now, current.panel_id);
      return { ...current, status: "open" as const, updated_at: now };
    })();
  }

  closeDesktopPanel(panelId: string, actorId: string): void {
    const actor = requiredActorId(actorId);
    this.db.transaction(() => {
      const current = this.getDesktopPanel(panelId);
      this.db.prepare("DELETE FROM goal_desktop_panel_aliases WHERE panel_id = ?").run(current.panel_id);
      this.db.prepare("DELETE FROM goal_desktop_panels WHERE panel_id = ?").run(current.panel_id);
      this.appendEvent(current.project_id, "project.desktop_panel_closed", actor, {
        panel_id: current.panel_id,
        goal_id: current.goal_id,
        runtime_kind: current.runtime_kind,
      });
    })();
  }

  aliasDesktopPanelSession(input: AliasGoalBoardDesktopPanelSessionInput): GoalBoardDesktopPanelRecord {
    const panelId = input.panel_id.trim();
    const runtimeId = requiredRuntimeId(input.runtime_id);
    const hostSessionId = input.host_session_id.trim();
    const actorId = requiredActorId(input.actor_id);
    if (!hostSessionId) {
      throw new GoalBoardProjectCatalogError("context.stable_identity_required", "宿主 Session 标识不能为空");
    }
    return this.db.transaction(() => {
      const current = this.getDesktopPanel(panelId);
      const now = new Date().toISOString();
      this.insertDesktopPanelAlias(current.panel_id, runtimeId, hostSessionId, now);
      if (current.host_session_id !== hostSessionId) {
        this.db
          .prepare(`
            UPDATE goal_desktop_panels
            SET host_session_id = ?, updated_at = ?
            WHERE panel_id = ?
          `)
          .run(hostSessionId, now, current.panel_id);
      }
      this.bindRuntimeContextInTransaction({
        normalized: {
          runtime_id: runtimeId,
          stable_work_context_id: hostSessionId,
        },
        projectId: current.project_id,
        actorId,
        rebindConfirmed: true,
        bindingScope: "session",
      });
      return {
        ...current,
        host_session_id: hostSessionId,
        updated_at: current.host_session_id === hostSessionId ? current.updated_at : now,
      };
    })();
  }

  findDesktopPanelByWorkContext(
    runtimeId: string,
    workContextId: string,
  ): GoalBoardDesktopPanelRecord | null {
    const row = this.db
      .prepare(`
        SELECT panels.* FROM goal_desktop_panel_aliases AS aliases
        INNER JOIN goal_desktop_panels AS panels ON panels.panel_id = aliases.panel_id
        WHERE aliases.runtime_id = ? AND aliases.stable_work_context_id = ?
      `)
      .get(requiredRuntimeId(runtimeId), workContextId.trim()) as Record<string, unknown> | undefined;
    return row ? mapDesktopPanel(row) : null;
  }

  preferredWorkspacePath(projectId: string): string | null {
    const row = this.db
      .prepare(`
        SELECT workspace.canonical_path AS canonical_path
        FROM workspace_project_memberships AS membership
        INNER JOIN workspaces AS workspace ON workspace.workspace_id = membership.workspace_id
        WHERE membership.project_id = ?
        ORDER BY membership.is_default DESC, membership.updated_at DESC, membership.membership_id
        LIMIT 1
      `)
      .get(requiredProjectId(projectId)) as { canonical_path?: unknown } | undefined;
    return typeof row?.canonical_path === "string" ? row.canonical_path : null;
  }

  private insertDesktopPanel(record: GoalBoardDesktopPanelRecord): void {
    this.db
      .prepare(`
        INSERT INTO goal_desktop_panels (
          panel_id, project_id, goal_id, runtime_kind, launch_command, launch_args,
          cwd, work_context_id, host_session_id, tab_index, title, status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.panel_id,
        record.project_id,
        record.goal_id,
        record.runtime_kind,
        record.launch_command,
        JSON.stringify(record.launch_args),
        record.cwd,
        record.work_context_id,
        record.host_session_id,
        record.tab_index,
        record.title,
        record.status,
        record.created_at,
        record.updated_at,
      );
  }

  private insertDesktopPanelAlias(
    panelId: string,
    runtimeId: string,
    workContextId: string,
    createdAt: string,
  ): void {
    this.db
      .prepare(`
        INSERT INTO goal_desktop_panel_aliases (
          panel_id, runtime_id, stable_work_context_id, created_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(runtime_id, stable_work_context_id) DO UPDATE SET panel_id = excluded.panel_id
      `)
      .run(panelId, runtimeId, workContextId, createdAt);
  }

  /** Safe Web/settings view: deliberately omits the canonical filesystem path. */
  listWorkspaceMemberships(): GoalBoardWorkspaceMembership[] {
    const rows = this.db
      .prepare(`
        SELECT membership.membership_id, membership.workspace_id,
          workspace.display_name AS workspace_name, workspace.realpath_verified,
          membership.project_id, membership.is_default, membership.bound_by,
          membership.created_at, membership.updated_at
        FROM workspace_project_memberships AS membership
        INNER JOIN workspaces AS workspace ON workspace.workspace_id = membership.workspace_id
        ORDER BY workspace.display_name COLLATE NOCASE, membership.is_default DESC,
          membership.updated_at DESC, membership.project_id
      `)
      .all() as Array<Record<string, unknown>>;
    return rows.map(mapWorkspaceMembership);
  }

  /** Project-scoped management view. The canonical path never enters global settings. */
  listWorkspaceDirectory(projectId?: string): GoalBoardWorkspaceDirectoryRecord[] {
    const normalizedProjectId = projectId ? requiredProjectId(projectId) : null;
    const rows = this.db.prepare(`
      SELECT workspace.workspace_id, workspace.canonical_path,
        workspace.realpath_verified, workspace.display_name,
        workspace.created_at, workspace.updated_at
      FROM workspaces AS workspace
      ${normalizedProjectId ? "INNER JOIN workspace_project_memberships AS selected_membership ON selected_membership.workspace_id = workspace.workspace_id" : ""}
      ${normalizedProjectId ? "WHERE selected_membership.project_id = ?" : ""}
      ORDER BY workspace.display_name COLLATE NOCASE, workspace.canonical_path
    `).all(...(normalizedProjectId ? [normalizedProjectId] : [])) as Array<Record<string, unknown>>;
    const memberships = this.listWorkspaceMemberships();
    return rows.map((row) => ({
      workspace_id: String(row.workspace_id),
      canonical_path: String(row.canonical_path),
      realpath_verified: Number(row.realpath_verified) === 1,
      display_name: String(row.display_name),
      project_ids: memberships
        .filter((membership) => membership.workspace_id === String(row.workspace_id))
        .map((membership) => membership.project_id),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    }));
  }

  addWorkspaceProject(input: AddWorkspaceProjectInput): GoalBoardWorkspaceDirectoryRecord {
    const projectId = requiredProjectId(input.project_id);
    const actorId = requiredActorId(input.actor_id);
    if (input.user_confirmed !== true) {
      throw new GoalBoardProjectCatalogError(
        "context.user_confirmation_required",
        "只有用户明确确认后才能关联工作目录",
      );
    }
    const workspace = normalizeRuntimeWorkspaceContext({
      canonical_path: input.canonical_path,
      realpath_verified: false,
    });
    if (!workspace) {
      throw new GoalBoardProjectCatalogError(
        "context.workspace_required",
        "工作目录必须是绝对路径",
      );
    }
    this.db.transaction(() => {
      this.upsertWorkspaceMembership(workspace, projectId, actorId);
    })();
    return this.requireWorkspaceDirectoryRecord(workspace.workspace_id);
  }

  repairWorkspaceProject(input: RepairWorkspaceProjectInput): GoalBoardWorkspaceDirectoryRecord {
    const workspaceId = requiredWorkspaceId(input.workspace_id);
    const projectId = requiredProjectId(input.project_id);
    const actorId = requiredActorId(input.actor_id);
    if (input.user_confirmed !== true) {
      throw new GoalBoardProjectCatalogError(
        "context.user_confirmation_required",
        "只有用户明确确认后才能修复工作目录路径",
      );
    }
    const current = this.requireWorkspaceDirectoryRecord(workspaceId);
    if (!current.project_ids.includes(projectId)) {
      throw new GoalBoardProjectCatalogError(
        "context.workspace_membership_not_found",
        "这个目录尚未关联当前项目",
      );
    }
    const next = normalizeRuntimeWorkspaceContext({
      canonical_path: input.canonical_path,
      realpath_verified: false,
    });
    if (!next) {
      throw new GoalBoardProjectCatalogError(
        "context.workspace_required",
        "新的工作目录必须是绝对路径",
      );
    }
    this.db.transaction(() => {
      this.upsertWorkspaceMembership(next, projectId, actorId);
      if (next.workspace_id !== workspaceId) {
        this.db.prepare(`
          DELETE FROM workspace_project_memberships
          WHERE workspace_id = ? AND project_id = ?
        `).run(workspaceId, projectId);
        this.db.prepare(`
          DELETE FROM workspaces
          WHERE workspace_id = ?
            AND NOT EXISTS (
              SELECT 1 FROM workspace_project_memberships
              WHERE workspace_project_memberships.workspace_id = workspaces.workspace_id
            )
        `).run(workspaceId);
      }
      this.appendEvent(projectId, "project.workspace_path_repaired", actorId, {
        previous_workspace_id: workspaceId,
        workspace_id: next.workspace_id,
      });
    })();
    return this.requireWorkspaceDirectoryRecord(next.workspace_id);
  }

  setWorkspaceDefault(input: ChangeWorkspaceProjectInput): GoalBoardWorkspaceMembership[] {
    if (input.user_confirmed !== true) {
      throw new GoalBoardProjectCatalogError(
        "context.user_confirmation_required",
        "只有用户明确确认后才能更改目录的默认项目",
      );
    }
    throw new GoalBoardProjectCatalogError(
      "context.workspace_default_unsupported",
      "工作目录不再保存默认项目；请为当前 Session 选择项目",
    );
  }

  removeWorkspaceMembership(input: ChangeWorkspaceProjectInput): GoalBoardWorkspaceMembership[] {
    const workspaceId = requiredWorkspaceId(input.workspace_id);
    const projectId = requiredProjectId(input.project_id);
    const actorId = requiredActorId(input.actor_id);
    if (input.user_confirmed !== true) {
      throw new GoalBoardProjectCatalogError(
        "context.user_confirmation_required",
        "只有用户明确确认后才能解除目录与项目的关联",
      );
    }
    this.db.transaction(() => {
      const result = this.db.prepare(`
        DELETE FROM workspace_project_memberships WHERE workspace_id = ? AND project_id = ?
      `).run(workspaceId, projectId);
      if (result.changes > 0) {
        this.db.prepare(`
          DELETE FROM workspaces
          WHERE workspace_id = ?
            AND NOT EXISTS (
              SELECT 1 FROM workspace_project_memberships
              WHERE workspace_project_memberships.workspace_id = workspaces.workspace_id
            )
        `).run(workspaceId);
        this.appendEvent(projectId, "project.workspace_unlinked", actorId, { workspace_id: workspaceId });
      }
    })();
    return this.listWorkspaceMemberships();
  }

  private requireWorkspaceDirectoryRecord(workspaceId: string): GoalBoardWorkspaceDirectoryRecord {
    const record = this.listWorkspaceDirectory().find((workspace) => workspace.workspace_id === workspaceId);
    if (!record) {
      throw new GoalBoardProjectCatalogError(
        "context.workspace_membership_not_found",
        "找不到这条工作目录记录",
      );
    }
    return record;
  }

  private projectSelections(): GoalBoardProjectSelection[] {
    return this.listProjects().map((project) => ({
      project_id: project.project_id,
      display_name: project.display_name,
    }));
  }

  private workspaceMemberSuggestions(
    workspace: NormalizedRuntimeWorkspaceContext | undefined,
  ): GoalBoardProjectSuggestion[] {
    if (!workspace) return [];
    const rows = this.db.prepare(`
      SELECT project.project_id, project.display_name
      FROM workspace_project_memberships AS membership
      INNER JOIN projects AS project ON project.project_id = membership.project_id
      WHERE membership.workspace_id = ?
      ORDER BY membership.updated_at DESC, project.display_name COLLATE NOCASE
    `).all(workspace.workspace_id) as Array<{ project_id?: unknown; display_name?: unknown }>;
    return rows.map((row) => ({
      project_id: String(row.project_id),
      display_name: String(row.display_name),
      reasons: ["这个项目已经与当前目录关联；新 Session 仍需明确选择"],
    }));
  }

  private findWorkspaceMembershipByIds(
    workspaceId: string,
    projectId: string,
  ): GoalBoardWorkspaceMembership | null {
    return this.listWorkspaceMemberships().find(
      (membership) => membership.workspace_id === workspaceId && membership.project_id === projectId,
    ) ?? null;
  }

  private upsertWorkspaceMembership(
    workspace: NormalizedRuntimeWorkspaceContext,
    projectId: string,
    actorId: string,
  ): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO workspaces (
        workspace_id, canonical_path, realpath_verified, display_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET
        canonical_path = excluded.canonical_path,
        realpath_verified = excluded.realpath_verified,
        display_name = excluded.display_name,
        updated_at = excluded.updated_at
    `).run(
      workspace.workspace_id,
      workspace.canonical_path,
      workspace.realpath_verified ? 1 : 0,
      workspace.display_name,
      now,
      now,
    );
    this.db.prepare(`
      INSERT INTO workspace_project_memberships (
        membership_id, workspace_id, project_id, is_default, bound_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, project_id) DO UPDATE SET
        is_default = 0,
        bound_by = excluded.bound_by,
        updated_at = excluded.updated_at
    `).run(
      `workspace-membership-${randomUUID()}`,
      workspace.workspace_id,
      projectId,
      0,
      actorId,
      now,
      now,
    );
    this.appendEvent(projectId, "project.workspace_member_bound", actorId, {
      workspace_id: workspace.workspace_id,
    });
  }

  private runtimeContextSuggestions(
    context: NormalizedRuntimeWorkContext,
    clues: readonly RuntimeProjectSuggestionClue[],
    includeRejected = false,
  ): GoalBoardProjectSuggestion[] {
    if (!context.stable_work_context_id) return [];
    // An explicit unbind means “stop using GoalBoard in this current Session”.
    // Do not immediately turn a prior Session's history into another prompt.
    if (this.hasRuntimeContextUnboundEvent(context)) return [];
    const normalizedClues = normalizeRuntimeProjectSuggestionClues(clues);
    const recentProjectId = this.latestConfirmedProjectIdForOtherSession(context);
    if (recentProjectId && !normalizedClues.some(
      (clue) => clue.kind === "recent_project" && clue.value === recentProjectId,
    )) {
      normalizedClues.push({ kind: "recent_project", value: recentProjectId });
    }
    if (normalizedClues.length === 0) return [];
    const rejectedProjectIds = includeRejected ? new Set<string>() : this.rejectedSuggestionProjectIds(context);
    return this.listProjects()
      .map((project, index) => {
        const match = scoreProjectSuggestion(project, normalizedClues);
        return match
          ? {
              project_id: project.project_id,
              display_name: project.display_name,
              reasons: match.reasons,
              score: match.score,
              index,
            }
          : null;
      })
      .filter((suggestion): suggestion is GoalBoardProjectSuggestion & { score: number; index: number } =>
        suggestion !== null && !rejectedProjectIds.has(suggestion.project_id),
      )
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .map(({ project_id, display_name, reasons }) => ({ project_id, display_name, reasons }));
  }

  private rejectedSuggestionProjectIds(context: NormalizedRuntimeWorkContext): Set<string> {
    if (!context.stable_work_context_id) return new Set<string>();
    const rows = this.db
      .prepare(`
        SELECT project_id
        FROM runtime_context_suggestion_rejections
        WHERE runtime_id = ? AND stable_work_context_id = ?
      `)
      .all(context.runtime_id, context.stable_work_context_id) as Array<{ project_id?: unknown }>;
    return new Set(rows.map((row) => String(row.project_id)));
  }

  private hasRuntimeContextUnboundEvent(context: NormalizedRuntimeWorkContext): boolean {
    if (!context.stable_work_context_id) return false;
    return this.db
      .prepare(`
        SELECT 1
        FROM runtime_context_binding_events
        WHERE runtime_id = ? AND stable_work_context_id = ? AND type = 'context.unbound'
        LIMIT 1
      `)
      .get(context.runtime_id, context.stable_work_context_id) != null;
  }

  private latestConfirmedProjectIdForOtherSession(context: NormalizedRuntimeWorkContext): string | null {
    if (!context.stable_work_context_id) return null;
    const row = this.db
      .prepare(`
        SELECT event.project_id
        FROM runtime_context_binding_events AS event
        INNER JOIN projects AS project ON project.project_id = event.project_id
        WHERE event.runtime_id = ?
          AND event.stable_work_context_id <> ?
          AND event.type IN ('context.bound', 'context.rebound')
        ORDER BY event.created_at DESC, event.event_id DESC
        LIMIT 1
      `)
      .get(context.runtime_id, context.stable_work_context_id) as { project_id?: unknown } | undefined;
    return row?.project_id == null ? null : String(row.project_id);
  }

  private findRuntimeContextBinding(
    context: NormalizedRuntimeWorkContext,
  ): GoalBoardRuntimeContextBinding | null {
    if (!context.stable_work_context_id) return null;
    const row = this.db
      .prepare(
        `
          SELECT * FROM runtime_context_bindings
          WHERE runtime_id = ? AND stable_work_context_id = ?
        `,
      )
      .get(context.runtime_id, context.stable_work_context_id) as Record<string, unknown> | undefined;
    return row ? mapRuntimeContextBinding(row) : null;
  }

  private removeSessionBinding(binding: GoalBoardRuntimeContextBinding, actorId: string): void {
    const now = new Date().toISOString();
    this.db.prepare("DELETE FROM runtime_context_bindings WHERE binding_id = ?").run(binding.binding_id);
    this.appendRuntimeContextBindingEvent({
      binding,
      type: "context.unbound",
      previousProjectId: binding.project_id,
      actorId,
      createdAt: now,
    });
    this.appendEvent(binding.project_id, "project.runtime_context_unbound", actorId, {
      binding_id: binding.binding_id,
      runtime_id: binding.runtime_id,
      stable_work_context_id: binding.stable_work_context_id,
    });
  }

  private findRuntimeContextSetupRequest(
    context: NormalizedRuntimeWorkContext,
    idempotencyKey: string,
  ): { request_fingerprint: string; project_id: string } | null {
    const persistenceId = runtimeContextPersistenceId(context);
    const row = this.db
      .prepare(`
        SELECT request_fingerprint, project_id
        FROM runtime_context_setup_requests
        WHERE runtime_id = ? AND stable_work_context_id = ? AND idempotency_key = ?
      `)
      .get(context.runtime_id, persistenceId, idempotencyKey) as
        | { request_fingerprint?: unknown; project_id?: unknown }
        | undefined;
    return row
      ? { request_fingerprint: String(row.request_fingerprint), project_id: String(row.project_id) }
      : null;
  }

  private appendRuntimeContextBindingEvent(input: {
    binding: GoalBoardRuntimeContextBinding;
    type: GoalBoardRuntimeContextBindingEvent["type"];
    previousProjectId: string | null;
    actorId: string;
    createdAt: string;
  }): void {
    this.db
      .prepare(
        `
          INSERT INTO runtime_context_binding_events (
            event_id, binding_id, runtime_id, stable_work_context_id, type,
            previous_project_id, project_id, actor_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        `context-binding-event-${randomUUID()}`,
        input.binding.binding_id,
        input.binding.runtime_id,
        input.binding.stable_work_context_id,
        input.type,
        input.previousProjectId,
        input.binding.project_id,
        input.actorId,
        input.createdAt,
      );
  }

  async createProject(input: CreateGoalBoardProjectInput): Promise<GoalBoardProjectRecord> {
    const displayName = requiredName(input.display_name);
    const actorId = requiredActorId(input.actor_id);
    return this.provisionCreatedProject({ displayName, actorId }, (record) => {
      this.insertProject(record, "project.created", actorId);
      return record;
    });
  }

  async ensureDemoProject(input: ManageGoalBoardDemoProjectInput): Promise<GoalBoardDemoProjectResult> {
    this.requireDemoConfirmation(input.user_confirmed);
    const existing = this.listProjects().find((project) => project.data_class === "regenerable_demo");
    if (existing) return { status: "existing", project: existing };
    const actorId = requiredActorId(input.actor_id);
    const displayName = requiredName(input.display_name ?? "GoalBoard 示例项目");
    const projectId = `project-${randomUUID()}`;
    const stagingDirectory = path.join(this.projectsDirectory, `.staging-${projectId}`);
    const projectDirectory = path.join(this.projectsDirectory, projectId);
    const databasePath = path.join(projectDirectory, "goalboard.db");
    let promoted = false;
    try {
      await fs.mkdir(stagingDirectory, { recursive: false });
      const stagedDatabasePath = path.join(stagingDirectory, "goalboard.db");
      seedDemoBoard(stagedDatabasePath);
      validateManagedBoard(stagedDatabasePath, DEMO_BOARD_ID);
      await fs.rename(stagingDirectory, projectDirectory);
      promoted = true;
      const record = projectRecord({
        projectId,
        displayName,
        boardId: DEMO_BOARD_ID,
        databasePath,
        source: "created",
        dataClass: "regenerable_demo",
        migratedFromPath: null,
      });
      this.insertProject(record, "project.demo_created", actorId);
      return { status: "created", project: record };
    } catch (error) {
      await fs.rm(stagingDirectory, { recursive: true, force: true });
      if (promoted) await fs.rm(projectDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  async resetDemoProject(input: ManageGoalBoardDemoProjectInput): Promise<GoalBoardDemoProjectResult> {
    this.requireDemoConfirmation(input.user_confirmed);
    const actorId = requiredActorId(input.actor_id);
    const project = this.listProjects().find((candidate) => candidate.data_class === "regenerable_demo");
    if (!project) throw new GoalBoardProjectCatalogError("catalog.demo_not_found", "没有可重建的 GoalBoard 示例项目");
    const projectDirectory = this.managedProjectDirectory(project);
    const stagingDirectory = path.join(this.projectsDirectory, `.resetting-${project.project_id}-${randomUUID()}`);
    const backupDirectory = path.join(this.projectsDirectory, `.reset-backup-${project.project_id}-${randomUUID()}`);
    let previousMoved = false;
    let resetPromoted = false;
    try {
      await fs.mkdir(stagingDirectory, { recursive: false });
      const stagedDatabasePath = path.join(stagingDirectory, "goalboard.db");
      seedDemoBoard(stagedDatabasePath);
      validateManagedBoard(stagedDatabasePath, DEMO_BOARD_ID);
      await fs.rename(projectDirectory, backupDirectory);
      previousMoved = true;
      await fs.rename(stagingDirectory, projectDirectory);
      resetPromoted = true;
      await fs.rm(backupDirectory, { recursive: true, force: true });
      const updatedAt = new Date().toISOString();
      this.db.prepare("UPDATE projects SET updated_at = ? WHERE project_id = ?").run(updatedAt, project.project_id);
      this.appendEvent(project.project_id, "project.demo_reset", actorId, { board_id: project.board_id });
      return { status: "reset", project: this.getProject(project.project_id) };
    } catch (error) {
      if (resetPromoted) await fs.rm(projectDirectory, { recursive: true, force: true });
      if (previousMoved) await fs.rename(backupDirectory, projectDirectory).catch(() => undefined);
      await fs.rm(stagingDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  async removeDemoProject(input: DeleteGoalBoardProjectInput): Promise<GoalBoardProjectDeletionResult> {
    const project = this.getProject(requiredProjectId(input.project_id));
    if (project.data_class !== "regenerable_demo") {
      throw new GoalBoardProjectCatalogError("catalog.not_demo", "只有明确标记为可重建演示数据的项目能走 demo 删除流程");
    }
    return this.deleteProjectInternal(input, true);
  }

  private requireDemoConfirmation(userConfirmed: boolean): void {
    if (userConfirmed === true) return;
    throw new GoalBoardProjectCatalogError(
      "catalog.demo_confirmation_required",
      "创建、重置或删除演示数据前需要用户明确确认",
    );
  }

  listProjectDeletions(): GoalBoardProjectDeletionRecord[] {
    return (this.db
      .prepare("SELECT * FROM project_deletions ORDER BY deleted_at DESC, deletion_id DESC")
      .all() as Array<Record<string, unknown>>).map((row) => projectDeletionRecord(mapStoredProjectDeletion(row)));
  }

  /**
   * Deletes one GoalBoard-managed project only after a separate explicit
   * confirmation. Bindings are removed with its catalog record, while a
   * deletion receipt preserves audit history and exact retries are safe.
   */
  async deleteProject(input: DeleteGoalBoardProjectInput): Promise<GoalBoardProjectDeletionResult> {
    return this.deleteProjectInternal(input, false);
  }

  private async deleteProjectInternal(
    input: DeleteGoalBoardProjectInput,
    allowActiveDemoWork: boolean,
  ): Promise<GoalBoardProjectDeletionResult> {
    const projectId = requiredProjectId(input.project_id);
    const actorId = requiredActorId(input.actor_id);
    if (input.delete_confirmed !== true) {
      throw new GoalBoardProjectCatalogError(
        "catalog.delete_confirmation_required",
        "删除 GoalBoard 项目及其数据库需要当前对话中的单独明确确认",
      );
    }
    const idempotencyKey = requiredDeletionIdempotencyKey(input.idempotency_key);
    const requestFingerprint = JSON.stringify({ project_id: projectId, delete_confirmed: true });
    const replay = this.findProjectDeletion(actorId, idempotencyKey);
    if (replay) {
      if (replay.request_fingerprint !== requestFingerprint) {
        throw new GoalBoardProjectCatalogError(
          "catalog.deletion_idempotency_conflict",
          "同一个项目删除请求键不能用于不同的项目或删除确认",
        );
      }
      const deletion = await this.finishProjectDeletionCleanup(replay);
      return { deletion, replayed: true };
    }

    const project = this.getProject(projectId);
    const projectDirectory = this.managedProjectDirectory(project);
    if (!allowActiveDemoWork) this.assertProjectHasNoActiveWork(project);
    const stagedDirectory = path.join(this.projectsDirectory, `.deleting-${project.project_id}-${randomUUID()}`);
    await fs.rename(projectDirectory, stagedDirectory);
    let catalogCommitted = false;
    try {
      const deletion = this.db.transaction(() => {
        const racedReplay = this.findProjectDeletion(actorId, idempotencyKey);
        if (racedReplay) {
          throw new GoalBoardProjectCatalogError(
            "catalog.deletion_idempotency_conflict",
            "同一个项目删除请求正在或已经由另一个调用处理，请重新读取项目列表",
          );
        }
        const deletedSessionBindingCount = this.db
          .prepare("DELETE FROM runtime_context_bindings WHERE project_id = ?")
          .run(project.project_id).changes;
        const deletedWorkspaceMembershipCount = this.db
          .prepare("DELETE FROM workspace_project_memberships WHERE project_id = ?")
          .run(project.project_id).changes;
        this.db.prepare("DELETE FROM runtime_context_setup_requests WHERE project_id = ?").run(project.project_id);
        this.db.prepare(`
          DELETE FROM goal_desktop_panel_aliases
          WHERE panel_id IN (SELECT panel_id FROM goal_desktop_panels WHERE project_id = ?)
        `).run(project.project_id);
        this.db.prepare("DELETE FROM goal_desktop_panels WHERE project_id = ?").run(project.project_id);
        this.db.prepare("DELETE FROM projects WHERE project_id = ?").run(project.project_id);
        const now = new Date().toISOString();
        const record: StoredProjectDeletion = {
          deletion_id: `project-deletion-${randomUUID()}`,
          actor_id: actorId,
          idempotency_key: idempotencyKey,
          request_fingerprint: requestFingerprint,
          project_id: project.project_id,
          display_name: project.display_name,
          board_id: project.board_id,
          staged_directory: stagedDirectory,
          deleted_binding_count: deletedSessionBindingCount + deletedWorkspaceMembershipCount,
          cleanup_state: "pending",
          cleanup_error: null,
          deleted_at: now,
          cleaned_at: null,
        };
        this.insertProjectDeletion(record);
        return record;
      })();
      catalogCommitted = true;
      return { deletion: await this.finishProjectDeletionCleanup(deletion), replayed: false };
    } catch (error) {
      if (!catalogCommitted) {
        await restoreMovedProject(projectDirectory, stagedDirectory);
      }
      throw error;
    }
  }

  private managedProjectDirectory(project: GoalBoardProjectRecord): string {
    const directory = path.join(this.projectsDirectory, project.project_id);
    const expectedDatabasePath = path.join(directory, "goalboard.db");
    if (path.resolve(project.database_path) !== expectedDatabasePath) {
      throw new GoalBoardProjectCatalogError(
        "catalog.project_storage_invalid",
        "项目目录记录不指向 GoalBoard 自己管理的项目数据库，拒绝删除",
      );
    }
    return directory;
  }

  private assertProjectHasNoActiveWork(project: GoalBoardProjectRecord): void {
    let projectDb: Database.Database | null = null;
    try {
      projectDb = new Database(project.database_path, { readonly: true, fileMustExist: true });
      const now = new Date().toISOString();
      const activeClaimCount = Number(
        (projectDb
          .prepare("SELECT COUNT(*) AS count FROM claims WHERE board_id = ? AND state = 'active' AND expires_at > ?")
          .get(project.board_id, now) as { count?: unknown } | undefined)?.count ?? 0,
      );
      const unfinishedRunCount = Number(
        (projectDb
          .prepare("SELECT COUNT(*) AS count FROM runs WHERE board_id = ? AND state IN ('started', 'blocked')")
          .get(project.board_id) as { count?: unknown } | undefined)?.count ?? 0,
      );
      if (activeClaimCount > 0 || unfinishedRunCount > 0) {
        throw new GoalBoardProjectCatalogError(
          "catalog.project_active_work",
          "项目存在有效 Claim 或未结束 Run，不能删除项目及其数据库",
        );
      }
    } catch (error) {
      if (error instanceof GoalBoardProjectCatalogError) throw error;
      throw new GoalBoardProjectCatalogError(
        "catalog.project_storage_invalid",
        `无法确认项目是否仍有进行中的工作，拒绝删除: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      projectDb?.close();
    }
  }

  private findProjectDeletion(actorId: string, idempotencyKey: string): StoredProjectDeletion | null {
    const row = this.db
      .prepare("SELECT * FROM project_deletions WHERE actor_id = ? AND idempotency_key = ?")
      .get(actorId, idempotencyKey) as Record<string, unknown> | undefined;
    return row ? mapStoredProjectDeletion(row) : null;
  }

  private insertProjectDeletion(record: StoredProjectDeletion): void {
    this.db
      .prepare(`
        INSERT INTO project_deletions (
          deletion_id, actor_id, idempotency_key, request_fingerprint,
          project_id, display_name, board_id, staged_directory, deleted_binding_count,
          cleanup_state, cleanup_error, deleted_at, cleaned_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.deletion_id,
        record.actor_id,
        record.idempotency_key,
        record.request_fingerprint,
        record.project_id,
        record.display_name,
        record.board_id,
        record.staged_directory,
        record.deleted_binding_count,
        record.cleanup_state,
        record.cleanup_error,
        record.deleted_at,
        record.cleaned_at,
      );
  }

  private async finishProjectDeletionCleanup(record: StoredProjectDeletion): Promise<GoalBoardProjectDeletionRecord> {
    if (record.cleanup_state === "complete") return projectDeletionRecord(record);
    try {
      await fs.rm(record.staged_directory, { recursive: true, force: true });
      const cleanedAt = new Date().toISOString();
      this.db
        .prepare(
          "UPDATE project_deletions SET cleanup_state = 'complete', cleanup_error = NULL, cleaned_at = ? WHERE deletion_id = ?",
        )
        .run(cleanedAt, record.deletion_id);
    } catch (error) {
      this.db
        .prepare("UPDATE project_deletions SET cleanup_state = 'pending', cleanup_error = ? WHERE deletion_id = ?")
        .run(error instanceof Error ? error.message : String(error), record.deletion_id);
    }
    const updated = this.db
      .prepare("SELECT * FROM project_deletions WHERE deletion_id = ?")
      .get(record.deletion_id) as Record<string, unknown> | undefined;
    if (!updated) {
      throw new GoalBoardProjectCatalogError("catalog.project_storage_invalid", "项目删除记录意外丢失");
    }
    return projectDeletionRecord(mapStoredProjectDeletion(updated));
  }

  private async provisionCreatedProject<T>(
    input: { displayName: string; actorId: string },
    commit: (record: GoalBoardProjectRecord) => T,
  ): Promise<T> {
    const projectId = `project-${randomUUID()}`;
    const stagingDirectory = path.join(this.projectsDirectory, `.staging-${projectId}`);
    const projectDirectory = path.join(this.projectsDirectory, projectId);
    const projectDatabasePath = path.join(projectDirectory, "goalboard.db");
    let promoted = false;
    try {
      await fs.mkdir(stagingDirectory, { recursive: false });
      await initializeProjectDatabase(path.join(stagingDirectory, "goalboard.db"), projectId, input.displayName, input.actorId);
      await validateManagedBoard(path.join(stagingDirectory, "goalboard.db"), projectId);
      await fs.rename(stagingDirectory, projectDirectory);
      promoted = true;
      const record = projectRecord({
        projectId,
        displayName: input.displayName,
        boardId: projectId,
        databasePath: projectDatabasePath,
        source: "created",
        dataClass: "user",
        migratedFromPath: null,
      });
      return commit(record);
    } catch (error) {
      await fs.rm(stagingDirectory, { recursive: true, force: true });
      if (promoted) await fs.rm(projectDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  renameProject(projectId: string, displayName: string, actorId: string): GoalBoardProjectRecord {
    const nextName = requiredName(displayName);
    const existing = this.getProject(projectId);
    if (existing.display_name === nextName) return existing;
    const updatedAt = new Date().toISOString();
    this.db.transaction(() => {
      this.db
        .prepare("UPDATE projects SET display_name = ?, updated_at = ? WHERE project_id = ?")
        .run(nextName, updatedAt, projectId);
      this.appendEvent(projectId, "project.renamed", actorId, {
        previous_display_name: existing.display_name,
        display_name: nextName,
      });
    })();
    return this.getProject(projectId);
  }

  async migrateLegacyDatabase(input: MigrateGoalBoardProjectInput): Promise<GoalBoardProjectRecord> {
    const legacyDatabasePath = path.resolve(input.legacy_database_path);
    if (legacyDatabasePath === this.databasePath || isWithin(legacyDatabasePath, this.projectsDirectory)) {
      throw new GoalBoardProjectCatalogError(
        "catalog.legacy_conflict",
        "不能把托管项目目录中的数据库再次作为旧库迁移",
      );
    }
    const sourceState = await statOrNull(legacyDatabasePath);
    if (!sourceState?.isFile()) {
      throw new GoalBoardProjectCatalogError("catalog.legacy_missing", `旧 GoalBoard 数据库不存在: ${legacyDatabasePath}`);
    }

    const source = readManagedBoard(legacyDatabasePath, true);
    const displayName = requiredName(input.display_name ?? source.snapshot.board.title);
    const projectId = `project-${randomUUID()}`;
    const stagingDirectory = path.join(this.projectsDirectory, `.staging-${projectId}`);
    const projectDirectory = path.join(this.projectsDirectory, projectId);
    const projectDatabasePath = path.join(projectDirectory, "goalboard.db");
    let promoted = false;
    let inserted = false;
    try {
      await fs.mkdir(stagingDirectory, { recursive: false });
      const stagedDatabasePath = path.join(stagingDirectory, "goalboard.db");
      await fs.copyFile(legacyDatabasePath, stagedDatabasePath, fsConstants.COPYFILE_EXCL);
      await runStep(input, "after_copy");
      const staged = readManagedBoard(stagedDatabasePath, false);
      if (source.boardId !== staged.boardId || source.serializedSnapshot !== staged.serializedSnapshot) {
        throw new GoalBoardProjectCatalogError("catalog.legacy_invalid", "旧数据库迁移后的事实快照不一致");
      }
      await runStep(input, "after_validation");
      await fs.rename(stagingDirectory, projectDirectory);
      promoted = true;
      await runStep(input, "before_catalog_commit");
      const record = projectRecord({
        projectId,
        displayName,
        boardId: source.boardId,
        databasePath: projectDatabasePath,
        source: "migrated",
        dataClass: "migrated_user",
        migratedFromPath: legacyDatabasePath,
      });
      this.insertProject(record, "project.migrated", input.actor_id);
      inserted = true;
      await Promise.all([
        fs.rm(`${legacyDatabasePath}-wal`, { force: true }),
        fs.rm(`${legacyDatabasePath}-shm`, { force: true }),
      ]);
      await fs.rm(legacyDatabasePath);
      return record;
    } catch (error) {
      if (inserted) this.db.prepare("DELETE FROM projects WHERE project_id = ?").run(projectId);
      await fs.rm(stagingDirectory, { recursive: true, force: true });
      if (promoted) await fs.rm(projectDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  private insertProject(record: GoalBoardProjectRecord, eventType: string, actorId: string): void {
    this.db.transaction(() => this.insertProjectInTransaction(record, eventType, actorId))();
  }

  private insertProjectInTransaction(record: GoalBoardProjectRecord, eventType: string, actorId: string): void {
    this.db
      .prepare(`
          INSERT INTO projects (
            project_id, display_name, board_id, database_path, source,
            data_class, migrated_from_path, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
      .run(
        record.project_id,
        record.display_name,
        record.board_id,
        record.database_path,
        record.source,
        record.data_class,
        record.migrated_from_path,
        record.created_at,
        record.updated_at,
      );
    this.appendEvent(record.project_id, eventType, actorId, {
      board_id: record.board_id,
      database_path: record.database_path,
      source: record.source,
      migrated_from_path: record.migrated_from_path,
    });
  }

  private appendEvent(projectId: string, type: string, actorId: string, payload: Record<string, unknown>): void {
    this.db
      .prepare(`
        INSERT INTO project_events (event_id, project_id, type, actor_id, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(`project-event-${randomUUID()}`, projectId, type, actorId, JSON.stringify(payload), new Date().toISOString());
  }
}

interface StoredProjectDeletion {
  deletion_id: string;
  actor_id: string;
  idempotency_key: string;
  request_fingerprint: string;
  project_id: string;
  display_name: string;
  board_id: string;
  staged_directory: string;
  deleted_binding_count: number;
  cleanup_state: "complete" | "pending";
  cleanup_error: string | null;
  deleted_at: string;
  cleaned_at: string | null;
}

function initializeCatalog(db: Database.Database): void {
  db.exec(`
    CREATE TABLE catalog_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE projects (
      project_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      board_id TEXT NOT NULL,
      database_path TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL CHECK (source IN ('created', 'migrated')),
      data_class TEXT NOT NULL CHECK (data_class IN ('user', 'migrated_user', 'regenerable_demo')),
      migrated_from_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX projects_display_name_idx ON projects(display_name COLLATE NOCASE, project_id);
    CREATE TABLE project_events (
      event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX project_events_project_idx ON project_events(project_id, created_at, event_id);
  `);
  createRuntimeContextBindingTables(db);
  createRuntimeContextSetupRequestTable(db);
  createRuntimeContextSuggestionRejectionTable(db);
  createWorkspaceProjectMembershipTables(db);
  createProjectDeletionTable(db);
  createDesktopPanelTables(db);
  createPersonalPlanningMethodPackTable(db);
  db.prepare("INSERT INTO catalog_meta (key, value) VALUES (?, ?)").run("owner", CATALOG_OWNER);
  db.prepare("INSERT INTO catalog_meta (key, value) VALUES (?, ?)").run("schema_version", String(CATALOG_SCHEMA_VERSION));
}

function assertOwnedCatalog(db: Database.Database, databasePath: string): void {
  const metaTable = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'catalog_meta'")
    .get();
  const owner = metaTable
    ? (db.prepare("SELECT value FROM catalog_meta WHERE key = 'owner'").get() as { value?: unknown } | undefined)?.value
    : null;
  if (owner !== CATALOG_OWNER) {
    throw new GoalBoardProjectCatalogError(
      "catalog.unknown_database",
      `不会复用未知项目目录数据库: ${databasePath}`,
    );
  }
}

function migrateCatalog(db: Database.Database, databasePath: string): void {
  const versionRow = db
    .prepare("SELECT value FROM catalog_meta WHERE key = 'schema_version'")
    .get() as { value?: unknown } | undefined;
  const version = Number(versionRow?.value);
  const compatibilityError = catalogSchemaCompatibilityError(version);
  if (compatibilityError) throw compatibilityError;
  if (version === CATALOG_SCHEMA_VERSION) return;

  db.transaction(() => {
    let current = version;
    if (current === 1) {
      createRuntimeContextBindingTables(db);
      db.prepare("UPDATE catalog_meta SET value = ? WHERE key = 'schema_version'").run("2");
      current = 2;
    }
    if (current === 2) {
      createRuntimeContextSetupRequestTable(db);
      db.prepare("UPDATE catalog_meta SET value = ? WHERE key = 'schema_version'").run("3");
      current = 3;
    }
    if (current === 3) {
      migrateRuntimeContextBindingEventsForUnbind(db);
      createProjectDeletionTable(db);
      db.prepare("UPDATE catalog_meta SET value = ? WHERE key = 'schema_version'").run("4");
      current = 4;
    }
    if (current === 4) {
      createRuntimeContextSuggestionRejectionTable(db);
      db.prepare("UPDATE catalog_meta SET value = ? WHERE key = 'schema_version'").run("5");
      current = 5;
    }
    if (current === 5) {
      createWorkspaceProjectMembershipTables(db);
      db.prepare("UPDATE catalog_meta SET value = ? WHERE key = 'schema_version'").run("6");
      current = 6;
    }
    if (current === 6) {
      if (!tableHasColumn(db, "projects", "data_class")) {
        db.exec(`
          ALTER TABLE projects ADD COLUMN data_class TEXT NOT NULL DEFAULT 'user'
            CHECK (data_class IN ('user', 'migrated_user', 'regenerable_demo'));
        `);
      }
      db.exec(`
        UPDATE projects
        SET data_class = CASE WHEN source = 'migrated' THEN 'migrated_user' ELSE 'user' END
        WHERE data_class <> 'regenerable_demo';
      `);
      db.prepare("UPDATE catalog_meta SET value = ? WHERE key = 'schema_version'").run("7");
      current = 7;
    }
    if (current === 7) {
      createDesktopPanelTables(db);
      db.prepare("UPDATE catalog_meta SET value = ? WHERE key = 'schema_version'").run("8");
      current = 8;
    }
    if (current === 8) {
      createPersonalPlanningMethodPackTable(db);
      db.prepare("UPDATE catalog_meta SET value = ? WHERE key = 'schema_version'").run("9");
      current = 9;
    }
    if (current !== CATALOG_SCHEMA_VERSION) {
      throw new GoalBoardProjectCatalogError(
        "catalog.unsupported_schema",
        `GoalBoard 项目目录数据库无法迁移到版本 ${CATALOG_SCHEMA_VERSION}: ${databasePath}`,
      );
    }
  })();
}

function createPersonalPlanningMethodPackTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS personal_planning_method_packs (
      method_id TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      pack_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function parsePlanningMethodPack(value: unknown): PlanningMethodPack | null {
  if (typeof value !== "string" || !value) return null;
  try {
    return JSON.parse(value) as PlanningMethodPack;
  } catch {
    return null;
  }
}

export function readPersonalPlanningMethodPacks(homeDirectory?: string): PlanningMethodPack[] {
  const databasePath = path.join(
    path.resolve(homeDirectory ?? path.join(os.homedir(), ".goalboard")),
    "projects",
    "catalog.db",
  );
  if (!realpathExists(databasePath)) return [];
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const table = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'personal_planning_method_packs'").get();
    if (!table) return [];
    return (db.prepare("SELECT pack_json FROM personal_planning_method_packs ORDER BY method_id").all() as Array<{ pack_json?: unknown }>)
      .map((row) => parsePlanningMethodPack(row.pack_json))
      .filter((pack): pack is PlanningMethodPack => pack != null);
  } finally {
    db.close();
  }
}

function realpathExists(filePath: string): boolean {
  try {
    realpathSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function tableHasColumn(db: Database.Database, table: string, column: string): boolean {
  return (db.pragma(`table_info(${table})`) as Array<{ name?: unknown }>)
    .some((entry) => entry.name === column);
}

function createWorkspaceProjectMembershipTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      workspace_id TEXT PRIMARY KEY,
      canonical_path TEXT NOT NULL UNIQUE,
      realpath_verified INTEGER NOT NULL CHECK (realpath_verified IN (0, 1)),
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workspace_project_memberships (
      membership_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      is_default INTEGER NOT NULL CHECK (is_default IN (0, 1)),
      bound_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(workspace_id, project_id)
    );
    CREATE INDEX IF NOT EXISTS workspace_project_memberships_project_idx
      ON workspace_project_memberships(project_id, workspace_id);
    CREATE UNIQUE INDEX IF NOT EXISTS workspace_project_memberships_one_default_idx
      ON workspace_project_memberships(workspace_id) WHERE is_default = 1;
  `);
}

function createRuntimeContextBindingTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE runtime_context_bindings (
      binding_id TEXT PRIMARY KEY,
      runtime_id TEXT NOT NULL,
      stable_work_context_id TEXT NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(project_id),
      bound_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(runtime_id, stable_work_context_id)
    );
    CREATE INDEX runtime_context_bindings_project_idx
      ON runtime_context_bindings(project_id, runtime_id, stable_work_context_id);
    CREATE TABLE runtime_context_binding_events (
      event_id TEXT PRIMARY KEY,
      binding_id TEXT NOT NULL,
      runtime_id TEXT NOT NULL,
      stable_work_context_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('context.bound', 'context.rebound', 'context.unbound')),
      previous_project_id TEXT,
      project_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX runtime_context_binding_events_context_idx
      ON runtime_context_binding_events(runtime_id, stable_work_context_id, created_at, event_id);
  `);
}

function createRuntimeContextSetupRequestTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS runtime_context_setup_requests (
      runtime_id TEXT NOT NULL,
      stable_work_context_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_fingerprint TEXT NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(project_id),
      created_at TEXT NOT NULL,
      PRIMARY KEY (runtime_id, stable_work_context_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS runtime_context_setup_requests_project_idx
      ON runtime_context_setup_requests(project_id, created_at);
  `);
}

function createRuntimeContextSuggestionRejectionTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS runtime_context_suggestion_rejections (
      runtime_id TEXT NOT NULL,
      stable_work_context_id TEXT NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (runtime_id, stable_work_context_id, project_id)
    );
    CREATE INDEX IF NOT EXISTS runtime_context_suggestion_rejections_project_idx
      ON runtime_context_suggestion_rejections(project_id, created_at);
  `);
}

function migrateRuntimeContextBindingEventsForUnbind(db: Database.Database): void {
  db.exec(`
    ALTER TABLE runtime_context_binding_events RENAME TO runtime_context_binding_events_v3;
    CREATE TABLE runtime_context_binding_events (
      event_id TEXT PRIMARY KEY,
      binding_id TEXT NOT NULL,
      runtime_id TEXT NOT NULL,
      stable_work_context_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('context.bound', 'context.rebound', 'context.unbound')),
      previous_project_id TEXT,
      project_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    INSERT INTO runtime_context_binding_events (
      event_id, binding_id, runtime_id, stable_work_context_id, type,
      previous_project_id, project_id, actor_id, created_at
    )
    SELECT
      event_id, binding_id, runtime_id, stable_work_context_id, type,
      previous_project_id, project_id, actor_id, created_at
    FROM runtime_context_binding_events_v3;
    DROP TABLE runtime_context_binding_events_v3;
    CREATE INDEX runtime_context_binding_events_context_idx
      ON runtime_context_binding_events(runtime_id, stable_work_context_id, created_at, event_id);
  `);
}

function createProjectDeletionTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_deletions (
      deletion_id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_fingerprint TEXT NOT NULL,
      project_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      board_id TEXT NOT NULL,
      staged_directory TEXT NOT NULL,
      deleted_binding_count INTEGER NOT NULL,
      cleanup_state TEXT NOT NULL CHECK (cleanup_state IN ('complete', 'pending')),
      cleanup_error TEXT,
      deleted_at TEXT NOT NULL,
      cleaned_at TEXT,
      UNIQUE(actor_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS project_deletions_project_idx
      ON project_deletions(project_id, deleted_at, deletion_id);
  `);
}

function createDesktopPanelTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS goal_desktop_panels (
      panel_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(project_id),
      goal_id TEXT NOT NULL,
      runtime_kind TEXT NOT NULL,
      launch_command TEXT NOT NULL,
      launch_args TEXT NOT NULL,
      cwd TEXT,
      work_context_id TEXT NOT NULL,
      host_session_id TEXT,
      tab_index INTEGER NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('open', 'exited')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS goal_desktop_panels_goal_idx
      ON goal_desktop_panels(project_id, goal_id, tab_index);
    CREATE TABLE IF NOT EXISTS goal_desktop_panel_aliases (
      panel_id TEXT NOT NULL REFERENCES goal_desktop_panels(panel_id) ON DELETE CASCADE,
      runtime_id TEXT NOT NULL,
      stable_work_context_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (runtime_id, stable_work_context_id)
    );
  `);
}

async function initializeProjectDatabase(
  databasePath: string,
  boardId: string,
  displayName: string,
  actorId: string,
): Promise<void> {
  const store = new SqliteGoalBoardStore(databasePath);
  try {
    new GoalBoardCoordinator(store).initializeBoard({
      board_id: boardId,
      title: displayName,
      actor_id: actorId,
      idempotency_key: `project-catalog-create-${boardId}`,
    });
    store.db.pragma("wal_checkpoint(TRUNCATE)");
  } finally {
    store.close();
  }
}

function validateManagedBoard(databasePath: string, expectedBoardId: string): void {
  const board = readManagedBoard(databasePath, false);
  if (board.boardId !== expectedBoardId) {
    throw new GoalBoardProjectCatalogError("catalog.legacy_invalid", "新项目数据库的 board_id 与 project_id 不一致");
  }
}

function readManagedBoard(
  databasePath: string,
  checkpoint: boolean,
): { boardId: string; snapshot: BoardSnapshot; serializedSnapshot: string } {
  const store = new SqliteGoalBoardStore(databasePath);
  try {
    const rows = store.db.prepare("SELECT board_id FROM boards ORDER BY board_id").all() as Array<{ board_id?: unknown }>;
    if (rows.length !== 1 || typeof rows[0]?.board_id !== "string" || !rows[0].board_id) {
      throw new GoalBoardProjectCatalogError(
        "catalog.legacy_invalid",
        `旧数据库必须恰好包含一个 GoalBoard: ${databasePath}`,
      );
    }
    const boardId = rows[0].board_id;
    const integrity = store.db.pragma("integrity_check") as Array<Record<string, unknown>>;
    if (integrity.some((row) => Object.values(row).some((value) => value !== "ok"))) {
      throw new GoalBoardProjectCatalogError("catalog.legacy_invalid", `SQLite 完整性校验失败: ${databasePath}`);
    }
    const snapshot = store.snapshot(boardId);
    if (checkpoint) store.db.pragma("wal_checkpoint(TRUNCATE)");
    return { boardId, snapshot, serializedSnapshot: JSON.stringify(snapshot) };
  } finally {
    store.close();
  }
}

function projectRecord(input: {
  projectId: string;
  displayName: string;
  boardId: string;
  databasePath: string;
  source: GoalBoardProjectRecord["source"];
  dataClass: GoalBoardProjectRecord["data_class"];
  migratedFromPath: string | null;
}): GoalBoardProjectRecord {
  const now = new Date().toISOString();
  return {
    project_id: input.projectId,
    display_name: input.displayName,
    board_id: input.boardId,
    database_path: input.databasePath,
    source: input.source,
    data_class: input.dataClass,
    migrated_from_path: input.migratedFromPath,
    created_at: now,
    updated_at: now,
  };
}

function mapProject(row: Record<string, unknown>): GoalBoardProjectRecord {
  return {
    project_id: String(row.project_id),
    display_name: String(row.display_name),
    board_id: String(row.board_id),
    database_path: String(row.database_path),
    source: String(row.source) as GoalBoardProjectRecord["source"],
    data_class: String(row.data_class) as GoalBoardProjectRecord["data_class"],
    migrated_from_path: row.migrated_from_path == null ? null : String(row.migrated_from_path),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapRuntimeContextBinding(row: Record<string, unknown>): GoalBoardRuntimeContextBinding {
  return {
    binding_id: String(row.binding_id),
    runtime_id: String(row.runtime_id),
    stable_work_context_id: String(row.stable_work_context_id),
    project_id: String(row.project_id),
    bound_by: String(row.bound_by),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapWorkspaceMembership(row: Record<string, unknown>): GoalBoardWorkspaceMembership {
  return {
    membership_id: String(row.membership_id),
    workspace_id: String(row.workspace_id),
    workspace_name: String(row.workspace_name),
    realpath_verified: Number(row.realpath_verified) === 1,
    project_id: String(row.project_id),
    is_default: Number(row.is_default) === 1,
    bound_by: String(row.bound_by),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapRuntimeContextBindingEvent(
  row: Record<string, unknown>,
): GoalBoardRuntimeContextBindingEvent {
  return {
    event_id: String(row.event_id),
    binding_id: String(row.binding_id),
    runtime_id: String(row.runtime_id),
    stable_work_context_id: String(row.stable_work_context_id),
    type: String(row.type) as GoalBoardRuntimeContextBindingEvent["type"],
    previous_project_id: row.previous_project_id == null ? null : String(row.previous_project_id),
    project_id: String(row.project_id),
    actor_id: String(row.actor_id),
    created_at: String(row.created_at),
  };
}

function mapDesktopPanel(row: Record<string, unknown>): GoalBoardDesktopPanelRecord {
  let launchArgs: string[] = [];
  try {
    const parsed = JSON.parse(String(row.launch_args ?? "[]")) as unknown;
    if (Array.isArray(parsed)) launchArgs = parsed.map((item) => String(item));
  } catch {
    launchArgs = [];
  }
  return {
    panel_id: String(row.panel_id),
    project_id: String(row.project_id),
    goal_id: String(row.goal_id),
    runtime_kind: String(row.runtime_kind),
    launch_command: String(row.launch_command),
    launch_args: launchArgs,
    cwd: row.cwd == null ? null : String(row.cwd),
    work_context_id: String(row.work_context_id),
    host_session_id: row.host_session_id == null ? null : String(row.host_session_id),
    tab_index: Number(row.tab_index),
    title: String(row.title),
    status: String(row.status) === "exited" ? "exited" : "open",
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function normalizeOptionalAbsolutePath(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (!path.isAbsolute(raw)) {
    throw new GoalBoardProjectCatalogError("catalog.invalid_name", "终端工作目录必须是绝对路径");
  }
  return path.resolve(raw);
}

function mapStoredProjectDeletion(row: Record<string, unknown>): StoredProjectDeletion {
  return {
    deletion_id: String(row.deletion_id),
    actor_id: String(row.actor_id),
    idempotency_key: String(row.idempotency_key),
    request_fingerprint: String(row.request_fingerprint),
    project_id: String(row.project_id),
    display_name: String(row.display_name),
    board_id: String(row.board_id),
    staged_directory: String(row.staged_directory),
    deleted_binding_count: Number(row.deleted_binding_count),
    cleanup_state: String(row.cleanup_state) as StoredProjectDeletion["cleanup_state"],
    cleanup_error: row.cleanup_error == null ? null : String(row.cleanup_error),
    deleted_at: String(row.deleted_at),
    cleaned_at: row.cleaned_at == null ? null : String(row.cleaned_at),
  };
}

function projectDeletionRecord(record: StoredProjectDeletion): GoalBoardProjectDeletionRecord {
  return {
    deletion_id: record.deletion_id,
    project_id: record.project_id,
    display_name: record.display_name,
    board_id: record.board_id,
    actor_id: record.actor_id,
    deleted_binding_count: record.deleted_binding_count,
    cleanup_state: record.cleanup_state,
    cleanup_error: record.cleanup_error,
    deleted_at: record.deleted_at,
    cleaned_at: record.cleaned_at,
  };
}

/** Normalize the optional Session ID and canonicalize the independent workspace. */
export function normalizeRuntimeWorkContext(input: RuntimeWorkContext): NormalizedRuntimeWorkContext {
  const runtimeId = requiredRuntimeId(input.runtime_id);
  const stableWorkContextId = input.host_declares_stable === true
    && typeof input.stable_work_context_id === "string"
    ? input.stable_work_context_id.trim() || null
    : null;
  const workspace = normalizeRuntimeWorkspaceContext(input.workspace);
  return {
    runtime_id: runtimeId,
    stable_work_context_id: stableWorkContextId,
    ...(workspace ? { workspace } : {}),
  };
}

function normalizeRuntimeWorkspaceContext(
  input: RuntimeWorkspaceContext | null | undefined,
): NormalizedRuntimeWorkspaceContext | undefined {
  if (!input || typeof input.canonical_path !== "string") return undefined;
  const suppliedPath = input.canonical_path.trim();
  if (!suppliedPath || !path.isAbsolute(suppliedPath)) return undefined;
  let canonicalPath = path.resolve(suppliedPath);
  let realpathVerified = false;
  try {
    canonicalPath = realpathSync.native(canonicalPath);
    realpathVerified = true;
  } catch {
    realpathVerified = input.realpath_verified === true;
  }
  const workspaceId = `workspace-${createHash("sha256").update(canonicalPath).digest("hex").slice(0, 24)}`;
  return {
    workspace_id: workspaceId,
    canonical_path: canonicalPath,
    realpath_verified: realpathVerified,
    display_name: path.basename(canonicalPath) || canonicalPath,
  };
}

function requireStableRuntimeWorkContext(input: RuntimeWorkContext): NormalizedRuntimeWorkContext {
  const normalized = normalizeRuntimeWorkContext(input);
  if (!normalized.stable_work_context_id) {
    throw new GoalBoardProjectCatalogError(
      "context.stable_identity_required",
      "当前 Runtime 没有宿主明确声明的稳定工作入口，不能建立自动连接绑定",
    );
  }
  return normalized;
}

function requireRoutableRuntimeWorkContext(input: RuntimeWorkContext): NormalizedRuntimeWorkContext {
  const normalized = normalizeRuntimeWorkContext(input);
  if (!normalized.stable_work_context_id && !normalized.workspace) {
    throw new GoalBoardProjectCatalogError(
      "context.stable_identity_required",
      "当前 Runtime 没有 Session 标识或可用的项目目录，不能保存项目关联",
    );
  }
  return normalized;
}

function runtimeContextPersistenceId(context: NormalizedRuntimeWorkContext): string {
  if (context.stable_work_context_id) return context.stable_work_context_id;
  if (context.workspace) return `workspace-request:${context.workspace.workspace_id}`;
  throw new GoalBoardProjectCatalogError(
    "context.identity_required",
    "当前 Runtime 没有可用于保存请求的 Session 或项目目录",
  );
}

function boundResolution(
  context: NormalizedRuntimeWorkContext,
  project: GoalBoardProjectRecord,
): GoalBoardRuntimeContextResolution {
  return {
    status: "bound",
    reason: null,
    next_action: "continue",
    context,
    project: { project_id: project.project_id, display_name: project.display_name },
    connection: {
      project_id: project.project_id,
      board_id: project.board_id,
      database_path: project.database_path,
    },
    suggested_projects: [],
    available_projects: [],
  };
}

function suggestedResolution(
  context: NormalizedRuntimeWorkContext,
  suggestedProjects: GoalBoardProjectSuggestion[],
  availableProjects: GoalBoardProjectSelection[],
): GoalBoardRuntimeContextResolution {
  return {
    status: "suggested",
    reason: null,
    next_action: "use_explicit_existing_selection_or_ask_user_to_confirm_suggestion",
    context,
    project: null,
    connection: null,
    suggested_projects: suggestedProjects,
    available_projects: availableProjects,
  };
}

function unboundResolution(
  context: NormalizedRuntimeWorkContext,
  reason: "missing_stable_context" | "unknown_context",
  availableProjects: GoalBoardProjectSelection[],
): GoalBoardRuntimeContextResolution {
  return {
    status: "unbound",
    reason,
    next_action: "use_explicit_existing_selection_or_ask_user_to_select_or_create",
    context,
    project: null,
    connection: null,
    suggested_projects: [],
    available_projects: availableProjects,
  };
}

const RUNTIME_PROJECT_SUGGESTION_KINDS = new Set<RuntimeProjectSuggestionClueKind>([
  "workspace",
  "path",
  "directory",
  "repository",
  "session_title",
  "runtime",
  "recent_project",
  "project_name",
]);

const RUNTIME_PROJECT_SUGGESTION_REASONS: Record<RuntimeProjectSuggestionClueKind, string> = {
  workspace: "宿主提供的工作空间线索与项目名称相近",
  path: "宿主提供的工作位置线索与项目名称相近",
  directory: "宿主提供的工作位置线索与项目名称相近",
  repository: "宿主提供的工作位置线索与项目名称相近",
  session_title: "宿主提供的会话标题线索与项目名称相近",
  runtime: "宿主提供的 Runtime 线索与项目名称相近",
  recent_project: "最近确认项目线索",
  project_name: "宿主提供的项目名称线索与项目名称相近",
};

function normalizeRuntimeProjectSuggestionClues(
  clues: readonly RuntimeProjectSuggestionClue[],
): RuntimeProjectSuggestionClue[] {
  const normalized: RuntimeProjectSuggestionClue[] = [];
  for (const clue of clues) {
    if (!clue || typeof clue.kind !== "string" || typeof clue.value !== "string") continue;
    if (!RUNTIME_PROJECT_SUGGESTION_KINDS.has(clue.kind as RuntimeProjectSuggestionClueKind)) continue;
    const value = clue.value.trim();
    if (!value) continue;
    normalized.push({ kind: clue.kind as RuntimeProjectSuggestionClueKind, value });
  }
  return normalized;
}

function scoreProjectSuggestion(
  project: GoalBoardProjectRecord,
  clues: readonly RuntimeProjectSuggestionClue[],
): { score: number; reasons: string[] } | null {
  const normalizedProjectName = normalizeSuggestionText(project.display_name);
  if (!normalizedProjectName) return null;
  let score = 0;
  const reasons = new Set<string>();
  for (const clue of clues) {
    const relevance = projectSuggestionRelevance(project, normalizedProjectName, clue);
    if (relevance === 0) continue;
    score += relevance;
    reasons.add(RUNTIME_PROJECT_SUGGESTION_REASONS[clue.kind]);
  }
  return score > 0 ? { score, reasons: [...reasons] } : null;
}

function projectSuggestionRelevance(
  project: GoalBoardProjectRecord,
  normalizedProjectName: string,
  clue: RuntimeProjectSuggestionClue,
): number {
  if (clue.kind === "recent_project") return clue.value.trim() === project.project_id ? 100 : 0;
  const fragments = suggestionTextFragments(clue.value);
  if (fragments.includes(normalizedProjectName)) return 50;
  // A one-character containment match creates too much noise in ordinary
  // titles. Exact one-character project names still work through equality.
  return fragments.some(
    (fragment) =>
      fragment.length >= 2 &&
      normalizedProjectName.length >= 2 &&
      (normalizedProjectName.includes(fragment) || fragment.includes(normalizedProjectName)),
  )
    ? 20
    : 0;
}

function normalizeSuggestionText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function suggestionTextFragments(value: string): string[] {
  const whole = normalizeSuggestionText(value);
  const parts = value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/gu)
    .map(normalizeSuggestionText)
    .filter(Boolean);
  return [...new Set([whole, ...parts].filter(Boolean))];
}

function requiredName(value: string): string {
  const name = value.trim();
  if (!name) throw new GoalBoardProjectCatalogError("catalog.invalid_name", "项目显示名称不能为空");
  return name;
}

function requiredProjectId(value: string): string {
  const projectId = value.trim();
  if (!projectId) {
    throw new GoalBoardProjectCatalogError("catalog.project_not_found", "项目 ID 不能为空");
  }
  return projectId;
}

function requiredWorkspaceId(value: string): string {
  const workspaceId = value.trim();
  if (!workspaceId) {
    throw new GoalBoardProjectCatalogError("context.workspace_required", "必须选择一个项目目录");
  }
  return workspaceId;
}

function requiredRuntimeId(value: string): string {
  const runtimeId = value.trim();
  if (!runtimeId) {
    throw new GoalBoardProjectCatalogError("context.stable_identity_required", "Runtime 标识不能为空");
  }
  return runtimeId;
}

function requiredActorId(value: string): string {
  const actorId = value.trim();
  if (!actorId) {
    throw new GoalBoardProjectCatalogError("context.user_confirmation_required", "绑定操作必须记录执行者");
  }
  return actorId;
}

function requiredContextIdempotencyKey(value: string): string {
  const key = value.trim();
  if (!key) {
    throw new GoalBoardProjectCatalogError(
      "context.idempotency_key_required",
      "创建并绑定项目需要幂等请求键",
    );
  }
  return key;
}

function requiredDeletionIdempotencyKey(value: string): string {
  const key = value.trim();
  if (!key) {
    throw new GoalBoardProjectCatalogError(
      "catalog.deletion_idempotency_conflict",
      "删除项目需要幂等请求键",
    );
  }
  return key;
}

function isWithin(candidate: string, directory: string): boolean {
  const relative = path.relative(directory, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function runStep(input: MigrateGoalBoardProjectInput, step: GoalBoardProjectMigrationStep): Promise<void> {
  await input.beforeStep?.(step);
}

async function restoreMovedProject(projectDirectory: string, stagedDirectory: string): Promise<void> {
  try {
    await fs.rename(stagedDirectory, projectDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}

async function exists(filePath: string): Promise<boolean> {
  return (await statOrNull(filePath)) != null;
}

async function statOrNull(filePath: string) {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

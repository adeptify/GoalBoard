import { randomUUID } from "node:crypto";
import { constants as fsConstants, realpathSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { PlanningMethodPack } from "@adeptify/goalboard-contracts/modules/goals";
import {
  ExecutionRepository,
  type ExecutionSqliteDatabase,
} from "@adeptify/goalboard-module-execution";
import {
  DesktopPanelService,
  type AliasDesktopPanelSessionInput,
  type DesktopPanelRecord,
  type OpenDesktopPanelInput,
} from "@adeptify/goalboard-app-desktop";
import type {
  AddWorkspaceProjectInput,
  ChangeWorkspaceProjectInput,
  DeleteProjectInput,
  MigrateProjectInput,
  ProjectDeletionRecord,
  ProjectDeletionResult,
  ProjectMigrationStep,
  ProjectRecord,
  ProjectSelection,
  ProjectWorkspaceDirectoryRecord,
  ProjectWorkspaceMembership,
  RepairWorkspaceProjectInput,
} from "@adeptify/goalboard-contracts/modules/projects";
import {
  createProjectsSchema,
  migrateProjectDataClassSchema,
  normalizeProjectWorkspace,
  ProjectsModule,
  type StoredProjectDeletion,
} from "@adeptify/goalboard-module-projects";
import type {
  RuntimeContextBindingEventRecord,
  RuntimeContextBindingRecord,
} from "@adeptify/goalboard-contracts/modules/private-work-context";
import {
  RuntimeContextBindingRepository,
  createRuntimeContextBindingTables,
  createRuntimeContextSetupRequestTable,
  createRuntimeContextSuggestionRejectionTable,
  migrateRuntimeContextBindingEventsForUnbind,
} from "@adeptify/goalboard-module-private-work-context";
import { GoalBoardCoordinator } from "../v1/coordinator.js";
import { DEMO_BOARD_ID, seedDemoBoard } from "../v1/demo.js";
import { SqliteGoalBoardStore } from "../v1/store.js";
import type { BoardSnapshot } from "../v1/types.js";
import { createDesktopPanelTables, SqliteDesktopPanelRepository } from "./desktop-panel-adapter.js";

const CATALOG_SCHEMA_VERSION = 9;
const CATALOG_OWNER = "goalboard-project-catalog-v1";

export type GoalBoardProjectRecord = ProjectRecord;

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

export type GoalBoardWorkspaceMembership = ProjectWorkspaceMembership;
export type GoalBoardWorkspaceDirectoryRecord = ProjectWorkspaceDirectoryRecord;
export type { AddWorkspaceProjectInput, RepairWorkspaceProjectInput, ChangeWorkspaceProjectInput };
export type GoalBoardProjectSelection = ProjectSelection;

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

export type GoalBoardRuntimeContextBinding = RuntimeContextBindingRecord;

export type GoalBoardDesktopPanelRecord = DesktopPanelRecord;
export type OpenGoalBoardDesktopPanelInput = OpenDesktopPanelInput;
export type AliasGoalBoardDesktopPanelSessionInput = AliasDesktopPanelSessionInput;

export type GoalBoardRuntimeContextBindingEvent = RuntimeContextBindingEventRecord;

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

export type DeleteGoalBoardProjectInput = DeleteProjectInput;
export type GoalBoardProjectDeletionRecord = ProjectDeletionRecord;
export type GoalBoardProjectDeletionResult = ProjectDeletionResult;

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

export type GoalBoardProjectMigrationStep = ProjectMigrationStep;
export type MigrateGoalBoardProjectInput = MigrateProjectInput;

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
  private readonly projects: ProjectsModule;
  private readonly workContexts: RuntimeContextBindingRepository;
  readonly desktopPanels: DesktopPanelService;

  private constructor(
    private readonly db: Database.Database,
    homeDirectory: string,
  ) {
    this.homeDirectory = homeDirectory;
    this.projectsDirectory = path.join(homeDirectory, "projects");
    this.databasePath = path.join(this.projectsDirectory, "catalog.db");
    this.projects = new ProjectsModule({
      db,
      errorFactory: (code, message) =>
        new GoalBoardProjectCatalogError(code as GoalBoardProjectCatalogError["code"], message),
    });
    this.workContexts = new RuntimeContextBindingRepository(db);
    this.desktopPanels = new DesktopPanelService({
      repository: new SqliteDesktopPanelRepository(db),
      errorFactory: (code, message) => new GoalBoardProjectCatalogError(code, message),
      context: {
        assertProject: (projectId) => { this.getProject(projectId); },
        bind: (input) => {
          const workspace = input.cwd
            ? normalizeRuntimeWorkspaceContext({ canonical_path: input.cwd, realpath_verified: false })
            : undefined;
          this.bindRuntimeContextInTransaction({
            normalized: {
              runtime_id: input.runtime_id,
              stable_work_context_id: input.stable_work_context_id,
              ...(workspace ? { workspace } : {}),
            },
            projectId: input.project_id,
            actorId: input.actor_id,
            rebindConfirmed: true,
            bindingScope: "session",
          });
        },
        appendProjectEvent: (projectId, type, actorId, payload) => {
          this.appendEvent(projectId, type, actorId, payload);
        },
      },
    });
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
    return this.projects.query.listProjects();
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
    return this.projects.query.getProject(projectId);
  }

  /**
   * Resolve without mutating state: an explicit Session binding wins. A fresh
   * Session may reuse one exact, realpath-verified workspace membership, but
   * ambiguous workspace membership and softer host clues remain choices.
   */
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
    if (normalized.workspace?.realpath_verified && workspaceSuggestions.length === 1) {
      return boundResolution(normalized, this.getProject(workspaceSuggestions[0]!.project_id));
    }
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
      const changed = this.workContexts.rejectSuggestion({
        runtime_id: normalized.runtime_id,
        stable_work_context_id: normalized.stable_work_context_id!,
        project_id: projectId,
        actor_id: actorId,
        created_at: new Date().toISOString(),
      });
      if (changed) {
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
        changed,
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
        this.projects.lifecycle.unlinkWorkspaceMembership(
          normalized.workspace.workspace_id,
          projectId,
          actorId,
          false,
        );
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
        this.workContexts.insertSetupRequest({
          runtime_id: normalized.runtime_id,
          persistence_id: runtimeContextPersistenceId(normalized),
          idempotency_key: idempotencyKey,
          request_fingerprint: requestFingerprint,
          project_id: record.project_id,
          created_at: new Date().toISOString(),
        });
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
      this.workContexts.insert(binding);
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
    this.workContexts.updateProject(current.binding_id, project.project_id, input.actorId, now);
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
    return normalized
      ? this.workContexts.listEvents({
          runtime_id: normalized.runtime_id,
          stable_work_context_id: normalized.stable_work_context_id!,
        })
      : this.workContexts.listEvents();
  }

  /**
   * Returns only currently active, explicitly confirmed Runtime work-entry
   * bindings. Callers must not treat this list as permission to expose the
   * opaque host identity; Web uses the GoalBoard-owned binding ID instead.
   */
  listRuntimeContextBindings(): GoalBoardRuntimeContextBinding[] {
    return this.workContexts.list();
  }

  openDesktopPanel(input: OpenGoalBoardDesktopPanelInput): GoalBoardDesktopPanelRecord {
    return this.desktopPanels.open(input);
  }

  listDesktopPanels(projectId: string, goalId?: string): GoalBoardDesktopPanelRecord[] {
    return this.desktopPanels.list(projectId, goalId);
  }

  getDesktopPanel(panelId: string): GoalBoardDesktopPanelRecord {
    return this.desktopPanels.get(panelId);
  }

  markDesktopPanelExited(panelId: string): GoalBoardDesktopPanelRecord {
    return this.desktopPanels.markExited(panelId);
  }

  markDesktopPanelOpen(panelId: string): GoalBoardDesktopPanelRecord {
    return this.desktopPanels.markOpen(panelId);
  }

  closeDesktopPanel(panelId: string, actorId: string): void {
    this.desktopPanels.close(panelId, actorId);
  }

  aliasDesktopPanelSession(input: AliasGoalBoardDesktopPanelSessionInput): GoalBoardDesktopPanelRecord {
    return this.desktopPanels.aliasSession(input);
  }

  findDesktopPanelByWorkContext(
    runtimeId: string,
    workContextId: string,
  ): GoalBoardDesktopPanelRecord | null {
    return this.desktopPanels.findByWorkContext(runtimeId, workContextId);
  }

  preferredWorkspacePath(projectId: string): string | null {
    return this.projects.query.preferredWorkspacePath(projectId);
  }

  /** Safe Web/settings view: deliberately omits the canonical filesystem path. */
  listWorkspaceMemberships(): GoalBoardWorkspaceMembership[] {
    return this.projects.query.listWorkspaceMemberships();
  }

  /** Project-scoped management view. The canonical path never enters global settings. */
  listWorkspaceDirectory(projectId?: string): GoalBoardWorkspaceDirectoryRecord[] {
    return this.projects.query.listWorkspaceDirectory(projectId);
  }

  addWorkspaceProject(input: AddWorkspaceProjectInput): GoalBoardWorkspaceDirectoryRecord {
    return this.projects.commands.addWorkspaceProject(input);
  }

  repairWorkspaceProject(input: RepairWorkspaceProjectInput): GoalBoardWorkspaceDirectoryRecord {
    return this.projects.commands.repairWorkspaceProject(input);
  }

  setWorkspaceDefault(input: ChangeWorkspaceProjectInput): GoalBoardWorkspaceMembership[] {
    return this.projects.commands.setWorkspaceDefault(input);
  }

  removeWorkspaceMembership(input: ChangeWorkspaceProjectInput): GoalBoardWorkspaceMembership[] {
    return this.projects.commands.removeWorkspaceMembership(input);
  }

  private projectSelections(): GoalBoardProjectSelection[] {
    return this.projects.query.selections();
  }

  private workspaceMemberSuggestions(
    workspace: NormalizedRuntimeWorkspaceContext | undefined,
  ): GoalBoardProjectSuggestion[] {
    if (!workspace) return [];
    return this.projects.query.workspaceProjectSelections(workspace.workspace_id).map((project) => ({
      project_id: project.project_id,
      display_name: project.display_name,
      reasons: ["这个项目已经与当前目录精确关联"],
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
    this.projects.lifecycle.upsertWorkspaceMembership(workspace, projectId, actorId);
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
    return this.workContexts.rejectedProjectIds(context.runtime_id, context.stable_work_context_id);
  }

  private hasRuntimeContextUnboundEvent(context: NormalizedRuntimeWorkContext): boolean {
    if (!context.stable_work_context_id) return false;
    return this.workContexts.hasUnboundEvent(context.runtime_id, context.stable_work_context_id);
  }

  private latestConfirmedProjectIdForOtherSession(context: NormalizedRuntimeWorkContext): string | null {
    if (!context.stable_work_context_id) return null;
    const projectIds = this.workContexts.confirmedProjectIdsForOtherSessions(
      context.runtime_id,
      context.stable_work_context_id,
    );
    const currentProjectIds = new Set(this.projects.query.listProjects().map((project) => project.project_id));
    return projectIds.find((projectId) => currentProjectIds.has(projectId)) ?? null;
  }

  private findRuntimeContextBinding(
    context: NormalizedRuntimeWorkContext,
  ): GoalBoardRuntimeContextBinding | null {
    if (!context.stable_work_context_id) return null;
    return this.workContexts.find(context.runtime_id, context.stable_work_context_id);
  }

  private removeSessionBinding(binding: GoalBoardRuntimeContextBinding, actorId: string): void {
    const now = new Date().toISOString();
    this.workContexts.remove(binding.binding_id);
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
    return this.workContexts.findSetupRequest(context.runtime_id, persistenceId, idempotencyKey);
  }

  private appendRuntimeContextBindingEvent(input: {
    binding: GoalBoardRuntimeContextBinding;
    type: GoalBoardRuntimeContextBindingEvent["type"];
    previousProjectId: string | null;
    actorId: string;
    createdAt: string;
  }): void {
    this.workContexts.appendEvent({
      binding: input.binding,
      type: input.type,
      previous_project_id: input.previousProjectId,
      actor_id: input.actorId,
      created_at: input.createdAt,
    });
  }

  async createProject(input: CreateGoalBoardProjectInput): Promise<GoalBoardProjectRecord> {
    const actorId = requiredActorId(input.actor_id);
    return this.provisionCreatedProject({ displayName: input.display_name, actorId }, (record) => {
      this.insertProject(record, "project.created", actorId);
      return record;
    });
  }

  async ensureDemoProject(input: ManageGoalBoardDemoProjectInput): Promise<GoalBoardDemoProjectResult> {
    this.requireDemoConfirmation(input.user_confirmed);
    const existing = this.listProjects().find((project) => project.data_class === "regenerable_demo");
    if (existing) return { status: "existing", project: existing };
    const actorId = requiredActorId(input.actor_id);
    const record = this.projects.lifecycle.prepareRecord({
      display_name: input.display_name ?? "GoalBoard 示例项目",
      board_id: DEMO_BOARD_ID,
      projects_directory: this.projectsDirectory,
      source: "created",
      data_class: "regenerable_demo",
      migrated_from_path: null,
    });
    const stagingDirectory = path.join(this.projectsDirectory, `.staging-${record.project_id}`);
    const projectDirectory = path.dirname(record.database_path);
    let promoted = false;
    try {
      await fs.mkdir(stagingDirectory, { recursive: false });
      const stagedDatabasePath = path.join(stagingDirectory, "goalboard.db");
      seedDemoBoard(stagedDatabasePath);
      validateManagedBoard(stagedDatabasePath, DEMO_BOARD_ID);
      await fs.rename(stagingDirectory, projectDirectory);
      promoted = true;
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
      const updated = this.projects.lifecycle.touch(
        project.project_id,
        "project.demo_reset",
        actorId,
        { board_id: project.board_id },
      );
      return { status: "reset", project: updated };
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
    return this.projects.query.listProjectDeletions();
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
    const replay = this.projects.lifecycle.findDeletion(actorId, idempotencyKey);
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
      const deletion = this.projects.lifecycle.transaction(() => {
        const racedReplay = this.projects.lifecycle.findDeletion(actorId, idempotencyKey);
        if (racedReplay) {
          throw new GoalBoardProjectCatalogError(
            "catalog.deletion_idempotency_conflict",
            "同一个项目删除请求正在或已经由另一个调用处理，请重新读取项目列表",
          );
        }
        const deletedSessionBindingCount = this.workContexts.removeProjectFacts(project.project_id);
        const deletedWorkspaceMembershipCount =
          this.projects.lifecycle.removeWorkspaceMembershipsForProject(project.project_id);
        this.desktopPanels.deleteForProject(project.project_id);
        this.projects.lifecycle.removeFacts(project.project_id);
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
        this.projects.lifecycle.insertDeletion(record);
        return record;
      });
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
      const execution = new ExecutionRepository(projectDb as unknown as ExecutionSqliteDatabase);
      const activeClaimCount = execution.activeClaimCount(project.board_id, now);
      const unfinishedRunCount = execution.nonterminalRunCount(project.board_id);
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

  private async finishProjectDeletionCleanup(record: StoredProjectDeletion): Promise<GoalBoardProjectDeletionRecord> {
    if (record.cleanup_state === "complete") return this.projects.lifecycle.deletionRecord(record);
    try {
      await fs.rm(record.staged_directory, { recursive: true, force: true });
      const cleanedAt = new Date().toISOString();
      record = this.projects.lifecycle.updateDeletionCleanup(record.deletion_id, {
        state: "complete",
        error: null,
        cleaned_at: cleanedAt,
      });
    } catch (error) {
      record = this.projects.lifecycle.updateDeletionCleanup(record.deletion_id, {
        state: "pending",
        error: error instanceof Error ? error.message : String(error),
        cleaned_at: null,
      });
    }
    return this.projects.lifecycle.deletionRecord(record);
  }

  private async provisionCreatedProject<T>(
    input: { displayName: string; actorId: string },
    commit: (record: GoalBoardProjectRecord) => T,
  ): Promise<T> {
    const record = this.projects.lifecycle.prepareRecord({
      display_name: input.displayName,
      board_id: "",
      projects_directory: this.projectsDirectory,
      source: "created",
      data_class: "user",
      migrated_from_path: null,
    });
    const stagingDirectory = path.join(this.projectsDirectory, `.staging-${record.project_id}`);
    const projectDirectory = path.dirname(record.database_path);
    let promoted = false;
    try {
      await fs.mkdir(stagingDirectory, { recursive: false });
      await initializeProjectDatabase(
        path.join(stagingDirectory, "goalboard.db"),
        record.project_id,
        record.display_name,
        input.actorId,
      );
      await validateManagedBoard(path.join(stagingDirectory, "goalboard.db"), record.project_id);
      await fs.rename(stagingDirectory, projectDirectory);
      promoted = true;
      return commit(record);
    } catch (error) {
      await fs.rm(stagingDirectory, { recursive: true, force: true });
      if (promoted) await fs.rm(projectDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  renameProject(projectId: string, displayName: string, actorId: string): GoalBoardProjectRecord {
    return this.projects.commands.renameProject(projectId, displayName, actorId);
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
    const record = this.projects.lifecycle.prepareRecord({
      display_name: input.display_name ?? source.snapshot.board.title,
      board_id: source.boardId,
      projects_directory: this.projectsDirectory,
      source: "migrated",
      data_class: "migrated_user",
      migrated_from_path: legacyDatabasePath,
    });
    const stagingDirectory = path.join(this.projectsDirectory, `.staging-${record.project_id}`);
    const projectDirectory = path.dirname(record.database_path);
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
      this.insertProject(record, "project.migrated", input.actor_id);
      inserted = true;
      await Promise.all([
        fs.rm(`${legacyDatabasePath}-wal`, { force: true }),
        fs.rm(`${legacyDatabasePath}-shm`, { force: true }),
      ]);
      await fs.rm(legacyDatabasePath);
      return record;
    } catch (error) {
      if (inserted) this.projects.lifecycle.rollbackRegistration(record.project_id);
      await fs.rm(stagingDirectory, { recursive: true, force: true });
      if (promoted) await fs.rm(projectDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  private insertProject(record: GoalBoardProjectRecord, eventType: string, actorId: string): void {
    this.projects.lifecycle.register(record, eventType, actorId);
  }

  private insertProjectInTransaction(record: GoalBoardProjectRecord, eventType: string, actorId: string): void {
    this.projects.lifecycle.register(record, eventType, actorId);
  }

  private appendEvent(projectId: string, type: string, actorId: string, payload: Record<string, unknown>): void {
    this.projects.lifecycle.appendEvent(projectId, type, actorId, payload);
  }
}

function initializeCatalog(db: Database.Database): void {
  db.exec(`
    CREATE TABLE catalog_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  createProjectsSchema(db);
  createRuntimeContextBindingTables(db);
  createRuntimeContextSetupRequestTable(db);
  createRuntimeContextSuggestionRejectionTable(db);
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
      createProjectsSchema(db);
      db.prepare("UPDATE catalog_meta SET value = ? WHERE key = 'schema_version'").run("4");
      current = 4;
    }
    if (current === 4) {
      createRuntimeContextSuggestionRejectionTable(db);
      db.prepare("UPDATE catalog_meta SET value = ? WHERE key = 'schema_version'").run("5");
      current = 5;
    }
    if (current === 5) {
      createProjectsSchema(db);
      db.prepare("UPDATE catalog_meta SET value = ? WHERE key = 'schema_version'").run("6");
      current = 6;
    }
    if (current === 6) {
      migrateProjectDataClassSchema(db);
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
  return normalizeProjectWorkspace(input);
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

import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { GoalBoardSessionError } from "./errors.js";
import type {
  CreateGoalBoardSessionInput,
  DiscoverRuntimeSessionInput,
  ExplicitlyLinkRuntimeSessionInput,
  GoalBoardSessionGoalLink,
  GoalBoardSessionRecord,
  GoalBoardSessionStatus,
  LinkNativeRuntimeSessionInput,
  ReassignWorkspaceSessionsInput,
  SessionListFilter,
  SetGoalBoardSessionStatusInput,
  UpdateSessionAssociationsInput,
} from "./contract-aliases.js";
import {
  correlationTtl,
  mapGoalLink,
  mapSession,
  optionalAbsolutePath,
  optionalText,
  requireConfirmation,
  requiredText,
} from "./session-schema.js";

export interface InsertSessionRecordInput {
  sessionId: string;
  runtimeId: string;
  nativeId: string | null;
  correlationToken: string | null;
  correlationExpiresAt: string | null;
  surfaceId: string | null;
  projectId: string | null;
  currentGoalId: string | null;
  workspaceId: string | null;
  workspacePath: string | null;
  title: string | null;
  status: GoalBoardSessionStatus;
  provenance: GoalBoardSessionRecord["provenance"];
  metadata: Record<string, unknown>;
  actorId: string;
  createdAt: string;
  updatedAt: string;
}

export class SessionRecordRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly now: () => Date,
  ) {}

  createSession(input: CreateGoalBoardSessionInput): GoalBoardSessionRecord {
    requireConfirmation(input.user_confirmed);
    const runtimeId = requiredText(input.runtime_id, "Runtime 标识不能为空");
    const actorId = requiredText(input.actor_id, "Session 写入必须记录执行者");
    const nativeId = optionalText(input.native_runtime_session_id);
    const surfaceId = optionalText(input.surface_id);
    const now = this.now().toISOString();
    return this.db.transaction(() => {
      if (nativeId) {
        const existing = this.findByNativeRuntimeSession(runtimeId, nativeId);
        if (existing) return this.updateAssociationsInTransaction(existing, input, actorId, now);
      }
      if (surfaceId) {
        const existing = this.findBySurface(surfaceId);
        if (existing) {
          if (existing.runtime_id !== runtimeId) {
            throw new GoalBoardSessionError("session.runtime_mismatch", "这个 surface 已属于另一个 Runtime Session");
          }
          return this.updateAssociationsInTransaction(existing, input, actorId, now);
        }
      }
      const ttl = correlationTtl(input.correlation_ttl_seconds);
      return this.insertSession({
        sessionId: `session-${randomUUID()}`,
        runtimeId,
        nativeId,
        correlationToken: nativeId ? null : `session-correlation-${randomUUID()}`,
        correlationExpiresAt: nativeId ? null : new Date(this.now().getTime() + ttl * 1000).toISOString(),
        surfaceId,
        projectId: optionalText(input.project_id),
        currentGoalId: optionalText(input.current_goal_id),
        workspaceId: optionalText(input.workspace_id),
        workspacePath: optionalAbsolutePath(input.workspace_path),
        title: optionalText(input.title),
        status: "active",
        provenance: input.provenance ?? "goalboard_created",
        metadata: input.metadata ?? {},
        actorId,
        createdAt: now,
        updatedAt: now,
      });
    })();
  }

  discoverSession(input: DiscoverRuntimeSessionInput): GoalBoardSessionRecord {
    const runtimeId = requiredText(input.runtime_id, "Runtime 标识不能为空");
    const nativeId = requiredText(input.native_runtime_session_id, "Runtime 原生 Session ID 不能为空");
    const now = this.now().toISOString();
    return this.db.transaction(() => {
      const existing = this.findByNativeRuntimeSession(runtimeId, nativeId);
      if (!existing) {
        return this.insertSession({
          sessionId: `session-${randomUUID()}`,
          runtimeId,
          nativeId,
          correlationToken: null,
          correlationExpiresAt: null,
          surfaceId: null,
          projectId: null,
          currentGoalId: null,
          workspaceId: null,
          workspacePath: null,
          title: optionalText(input.title),
          status: "discovered",
          provenance: "runtime_discovered",
          metadata: input.metadata ?? {},
          actorId: "runtime-discovery",
          createdAt: now,
          updatedAt: now,
        });
      }
      this.db.prepare(`
        UPDATE sessions
        SET title = COALESCE(?, title), metadata_json = ?, updated_at = ?
        WHERE session_id = ?
      `).run(
        optionalText(input.title),
        JSON.stringify({ ...existing.metadata, ...(input.metadata ?? {}) }),
        now,
        existing.session_id,
      );
      return this.get(existing.session_id);
    })();
  }

  explicitlyLinkSession(input: ExplicitlyLinkRuntimeSessionInput): GoalBoardSessionRecord {
    requireConfirmation(input.user_confirmed);
    const runtimeId = requiredText(input.runtime_id, "Runtime 标识不能为空");
    const nativeId = requiredText(input.native_runtime_session_id, "Runtime 原生 Session ID 不能为空");
    const actorId = requiredText(input.actor_id, "Session 写入必须记录执行者");
    const now = this.now().toISOString();
    return this.db.transaction(() => {
      const existing = this.findByNativeRuntimeSession(runtimeId, nativeId);
      if (existing) return this.updateAssociationsInTransaction(existing, input, actorId, now);
      return this.insertSession({
        sessionId: `session-${randomUUID()}`,
        runtimeId,
        nativeId,
        correlationToken: null,
        correlationExpiresAt: null,
        surfaceId: null,
        projectId: optionalText(input.project_id),
        currentGoalId: optionalText(input.current_goal_id),
        workspaceId: optionalText(input.workspace_id),
        workspacePath: optionalAbsolutePath(input.workspace_path),
        title: optionalText(input.title),
        status: "active",
        provenance: "explicitly_linked",
        metadata: {},
        actorId,
        createdAt: now,
        updatedAt: now,
      });
    })();
  }

  linkNativeRuntimeSession(input: LinkNativeRuntimeSessionInput): GoalBoardSessionRecord {
    const sessionId = requiredText(input.session_id, "GoalBoard Session ID 不能为空");
    const runtimeId = requiredText(input.runtime_id, "Runtime 标识不能为空");
    const nativeId = requiredText(input.native_runtime_session_id, "Runtime 原生 Session ID 不能为空");
    requiredText(input.actor_id, "Session 写入必须记录执行者");
    const now = this.now().toISOString();
    return this.db.transaction(() => {
      const current = this.get(sessionId);
      if (current.runtime_id !== runtimeId) {
        throw new GoalBoardSessionError("session.runtime_mismatch", "Runtime 与 GoalBoard Session 不匹配");
      }
      if (current.native_runtime_session_id === nativeId) return current;
      if (current.native_runtime_session_id && current.native_runtime_session_id !== nativeId) {
        throw new GoalBoardSessionError("session.identity_conflict", "GoalBoard Session 已连接另一个 Runtime 原生 Session");
      }
      const byNative = this.findByNativeRuntimeSession(runtimeId, nativeId);
      if (byNative && byNative.session_id !== current.session_id) {
        throw new GoalBoardSessionError("session.identity_conflict", "Runtime 原生 Session 已连接另一条 GoalBoard Session");
      }
      const tokenMatches = Boolean(
        current.correlation_token
        && input.correlation_token === current.correlation_token
        && current.correlation_expires_at
        && Date.parse(current.correlation_expires_at) >= this.now().getTime(),
      );
      const surfaceMatches = Boolean(current.surface_id && input.surface_id === current.surface_id);
      if (!tokenMatches && !surfaceMatches) {
        throw new GoalBoardSessionError(
          "session.correlation_invalid",
          "晚到的 Runtime 原生 Session 缺少有效 correlation 或匹配的 surface",
        );
      }
      this.db.prepare(`
        UPDATE sessions
        SET native_runtime_session_id = ?, correlation_token = NULL,
            correlation_expires_at = NULL, status = 'active', updated_at = ?
        WHERE session_id = ?
      `).run(nativeId, now, current.session_id);
      return this.get(current.session_id);
    })();
  }

  updateAssociations(input: UpdateSessionAssociationsInput): GoalBoardSessionRecord {
    requireConfirmation(input.user_confirmed);
    const actorId = requiredText(input.actor_id, "Session 写入必须记录执行者");
    const now = this.now().toISOString();
    return this.db.transaction(() => this.updateAssociationsInTransaction(this.get(input.session_id), input, actorId, now))();
  }

  setStatus(input: SetGoalBoardSessionStatusInput): GoalBoardSessionRecord {
    requireConfirmation(input.user_confirmed);
    requiredText(input.actor_id, "Session 写入必须记录执行者");
    if (input.status !== "active" && input.status !== "closed") {
      throw new GoalBoardSessionError("session.invalid_input", "Session 只能归档或恢复");
    }
    const now = this.now().toISOString();
    return this.db.transaction(() => {
      const current = this.get(input.session_id);
      if (current.status === input.status) return current;
      this.db.prepare("UPDATE sessions SET status = ?, updated_at = ? WHERE session_id = ?")
        .run(input.status, now, current.session_id);
      return this.get(current.session_id);
    })();
  }

  reassignWorkspaceSessions(input: ReassignWorkspaceSessionsInput): GoalBoardSessionRecord[] {
    requireConfirmation(input.user_confirmed);
    const projectId = requiredText(input.project_id, "Project 标识不能为空");
    requiredText(input.actor_id, "工作目录变更必须记录执行者");
    const previousWorkspaceId = optionalText(input.previous_workspace_id);
    const previousWorkspacePath = optionalAbsolutePath(input.previous_workspace_path);
    if (!previousWorkspaceId && !previousWorkspacePath) {
      throw new GoalBoardSessionError("session.invalid_input", "必须提供要修复或解除的工作目录");
    }
    const workspaceId = optionalText(input.workspace_id);
    const workspacePath = optionalAbsolutePath(input.workspace_path);
    const now = this.now().toISOString();
    return this.db.transaction(() => {
      const clauses: string[] = [];
      const values: string[] = [projectId];
      if (previousWorkspaceId) {
        clauses.push("workspace_id = ?");
        values.push(previousWorkspaceId);
      }
      if (previousWorkspacePath) {
        clauses.push("workspace_path = ?");
        values.push(previousWorkspacePath);
      }
      const rows = this.db.prepare(`
        SELECT session_id FROM sessions
        WHERE project_id = ? AND (${clauses.join(" OR ")})
      `).all(...values) as Array<{ session_id: string }>;
      const update = this.db.prepare(`
        UPDATE sessions SET workspace_id = ?, workspace_path = ?, updated_at = ?
        WHERE session_id = ?
      `);
      for (const row of rows) update.run(workspaceId, workspacePath, now, row.session_id);
      return rows.map((row) => this.get(row.session_id));
    })();
  }

  get(sessionId: string): GoalBoardSessionRecord {
    const row = this.db.prepare("SELECT * FROM sessions WHERE session_id = ?").get(sessionId.trim()) as
      | Record<string, unknown>
      | undefined;
    if (!row) throw new GoalBoardSessionError("session.not_found", "找不到这条 GoalBoard Session");
    return mapSession(row);
  }

  findByNativeRuntimeSession(runtimeId: string, nativeId: string): GoalBoardSessionRecord | null {
    const row = this.db.prepare(`
      SELECT * FROM sessions WHERE runtime_id = ? AND native_runtime_session_id = ?
    `).get(runtimeId.trim(), nativeId.trim()) as Record<string, unknown> | undefined;
    return row ? mapSession(row) : null;
  }

  findBySurface(surfaceId: string): GoalBoardSessionRecord | null {
    const row = this.db.prepare("SELECT * FROM sessions WHERE surface_id = ?").get(surfaceId.trim()) as
      | Record<string, unknown>
      | undefined;
    return row ? mapSession(row) : null;
  }

  list(filter: SessionListFilter = {}): GoalBoardSessionRecord[] {
    const conditions: string[] = [];
    const values: string[] = [];
    for (const [column, value] of [
      ["runtime_id", filter.runtime_id],
      ["project_id", filter.project_id],
      ["workspace_id", filter.workspace_id],
      ["status", filter.status],
    ] as const) {
      const normalized = optionalText(value);
      if (!normalized) continue;
      conditions.push(`${column} = ?`);
      values.push(normalized);
    }
    const rows = this.db.prepare(`
      SELECT * FROM sessions
      ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
      ORDER BY updated_at DESC, session_id
    `).all(...values) as Array<Record<string, unknown>>;
    return rows.map(mapSession);
  }

  goalHistory(sessionId: string): GoalBoardSessionGoalLink[] {
    return (this.db.prepare(`
      SELECT * FROM session_goal_links WHERE session_id = ?
      ORDER BY CASE relation WHEN 'current' THEN 0 ELSE 1 END, created_at DESC, link_id DESC
    `).all(sessionId.trim()) as Array<Record<string, unknown>>).map(mapGoalLink);
  }

  insertSession(input: InsertSessionRecordInput): GoalBoardSessionRecord {
    this.db.prepare(`
      INSERT INTO sessions (
        session_id, runtime_id, native_runtime_session_id, correlation_token,
        correlation_expires_at, surface_id, project_id, current_goal_id,
        workspace_id, workspace_path, title, status, provenance, metadata_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.sessionId, input.runtimeId, input.nativeId, input.correlationToken,
      input.correlationExpiresAt, input.surfaceId, input.projectId, input.currentGoalId,
      input.workspaceId, input.workspacePath, input.title, input.status, input.provenance,
      JSON.stringify(input.metadata), input.createdAt, input.updatedAt,
    );
    if (input.currentGoalId) this.insertGoalLink(input.sessionId, input.currentGoalId, input.actorId, input.createdAt);
    return this.get(input.sessionId);
  }

  insertGoalLink(sessionId: string, goalId: string, actorId: string, now: string): void {
    this.db.prepare(`
      INSERT INTO session_goal_links (
        link_id, session_id, goal_id, relation, linked_by, created_at, ended_at
      ) VALUES (?, ?, ?, 'current', ?, ?, NULL)
    `).run(`session-goal-${randomUUID()}`, sessionId, goalId, actorId, now);
  }

  private updateAssociationsInTransaction(
    current: GoalBoardSessionRecord,
    input: Partial<UpdateSessionAssociationsInput> & {
      project_id?: string | null;
      current_goal_id?: string | null;
      workspace_id?: string | null;
      workspace_path?: string | null;
    },
    actorId: string,
    now: string,
  ): GoalBoardSessionRecord {
    const projectId = Object.hasOwn(input, "project_id") ? optionalText(input.project_id) : current.project_id;
    const goalId = Object.hasOwn(input, "current_goal_id") ? optionalText(input.current_goal_id) : current.current_goal_id;
    const workspaceId = Object.hasOwn(input, "workspace_id") ? optionalText(input.workspace_id) : current.workspace_id;
    const workspacePath = Object.hasOwn(input, "workspace_path")
      ? optionalAbsolutePath(input.workspace_path)
      : current.workspace_path;
    if (goalId !== current.current_goal_id) {
      this.db.prepare(`
        UPDATE session_goal_links SET relation = 'history', ended_at = ?
        WHERE session_id = ? AND relation = 'current'
      `).run(now, current.session_id);
      if (goalId) this.insertGoalLink(current.session_id, goalId, actorId, now);
    }
    this.db.prepare(`
      UPDATE sessions
      SET project_id = ?, current_goal_id = ?, workspace_id = ?, workspace_path = ?,
          title = COALESCE(?, title), status = 'active', updated_at = ?
      WHERE session_id = ?
    `).run(
      projectId,
      goalId,
      workspaceId,
      workspacePath,
      optionalText((input as { title?: string | null }).title),
      now,
      current.session_id,
    );
    return this.get(current.session_id);
  }
}

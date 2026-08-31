import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createSessionContentStore, type SessionContentStore } from "./content-store.js";
import {
  GoalBoardSessionError,
  SESSION_EVENT_SOURCES,
  SESSION_TIMELINE_KINDS,
  type AppendGoalBoardSessionEventInput,
  type CreateGoalBoardSessionInput,
  type CreateSessionHandoffDraftInput,
  type DiscoverRuntimeSessionInput,
  type ExplicitlyLinkRuntimeSessionInput,
  type GoalBoardSessionGoalLink,
  type GoalBoardSessionHandoffRecord,
  type GoalBoardSessionEventRecord,
  type GoalBoardSessionRecord,
  type GoalBoardSessionStatus,
  type LegacySessionMigrationInput,
  type LegacySessionMigrationReport,
  type LinkNativeRuntimeSessionInput,
  type ReassignWorkspaceSessionsInput,
  type SessionListFilter,
  type SetGoalBoardSessionStatusInput,
  type UpdateSessionAssociationsInput,
  type UpdateSessionHandoffDraftInput,
} from "./types.js";

const SESSION_REGISTRY_OWNER = "goalboard-session-registry-v1";
const SESSION_REGISTRY_SCHEMA_VERSION = 3;
const DEFAULT_CORRELATION_TTL_SECONDS = 15 * 60;
const HANDOFF_SEND_LEASE_MS = 5 * 60 * 1000;

export interface GoalBoardSessionRegistryOptions {
  homeDirectory?: string;
  now?: () => Date;
}

export class GoalBoardSessionRegistry {
  readonly homeDirectory: string;
  readonly databasePath: string;

  private constructor(
    private readonly db: Database.Database,
    homeDirectory: string,
    private readonly now: () => Date,
    private readonly contentStore: SessionContentStore,
  ) {
    this.homeDirectory = homeDirectory;
    this.databasePath = path.join(homeDirectory, "sessions", "sessions.db");
  }

  static async open(options: GoalBoardSessionRegistryOptions = {}): Promise<GoalBoardSessionRegistry> {
    const homeDirectory = path.resolve(options.homeDirectory ?? path.join(os.homedir(), ".goalboard"));
    const sessionsDirectory = path.join(homeDirectory, "sessions");
    await fs.mkdir(sessionsDirectory, { recursive: true });
    const databasePath = path.join(sessionsDirectory, "sessions.db");
    const db = new Database(databasePath, { timeout: 5000 });
    try {
      db.pragma("journal_mode = WAL");
      db.pragma("synchronous = FULL");
      db.pragma("foreign_keys = ON");
      db.pragma("busy_timeout = 5000");
      initializeOrValidateRegistry(db);
      const registry = new GoalBoardSessionRegistry(
        db,
        homeDirectory,
        options.now ?? (() => new Date()),
        createSessionContentStore(path.join(sessionsDirectory, "content")),
      );
      registry.recoverInterruptedHandoffs();
      return registry;
    } catch (error) {
      db.close();
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }

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
        if (existing) {
          return this.updateAssociationsInTransaction(existing, input, actorId, now);
        }
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
      const record = this.insertSession({
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
      return record;
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
        UPDATE sessions
        SET workspace_id = ?, workspace_path = ?, updated_at = ?
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
      SELECT * FROM sessions
      WHERE runtime_id = ? AND native_runtime_session_id = ?
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
      SELECT * FROM session_goal_links
      WHERE session_id = ?
      ORDER BY CASE relation WHEN 'current' THEN 0 ELSE 1 END,
               created_at DESC, link_id DESC
    `).all(sessionId.trim()) as Array<Record<string, unknown>>).map(mapGoalLink);
  }

  appendEvent(input: AppendGoalBoardSessionEventInput): GoalBoardSessionEventRecord {
    const sessionId = requiredText(input.session_id, "GoalBoard Session ID 不能为空");
    this.get(sessionId);
    if (!SESSION_EVENT_SOURCES.includes(input.source)) {
      throw new GoalBoardSessionError("session.invalid_input", "Session 事件来源无效");
    }
    if (!SESSION_TIMELINE_KINDS.includes(input.kind)) {
      throw new GoalBoardSessionError("session.invalid_input", "Session 事件类型无效");
    }
    const sourceId = requiredText(input.source_id, "Session 事件 source_id 不能为空");
    const content = typeof input.content === "string" ? input.content : "";
    const sourceOrder = Number.isSafeInteger(input.source_order) && (input.source_order ?? 0) >= 0
      ? input.source_order!
      : 0;
    const occurredAt = validIsoTimestamp(input.occurred_at) ?? this.now().toISOString();
    const createdAt = this.now().toISOString();
    const { content_ref: contentRef } = this.contentStore.write(content);
    const metadata = safeEventMetadata(input.metadata);
    return this.db.transaction(() => {
      const existing = this.db.prepare(`
        SELECT event_id FROM session_events
        WHERE session_id = ? AND source = ? AND source_id = ?
      `).get(sessionId, input.source, sourceId) as { event_id?: unknown } | undefined;
      const eventId = existing?.event_id ? String(existing.event_id) : `session-event-${randomUUID()}`;
      this.db.prepare(`
        INSERT INTO session_events (
          event_id, session_id, source, kind, source_id, source_order,
          occurred_at, content_ref, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id, source, source_id) DO UPDATE SET
          kind = excluded.kind,
          source_order = excluded.source_order,
          occurred_at = excluded.occurred_at,
          content_ref = excluded.content_ref,
          metadata_json = excluded.metadata_json
      `).run(
        eventId,
        sessionId,
        input.source,
        input.kind,
        sourceId,
        sourceOrder,
        occurredAt,
        contentRef,
        JSON.stringify(metadata),
        createdAt,
      );
      return this.event(eventId);
    })();
  }

  events(sessionId: string): GoalBoardSessionEventRecord[] {
    this.get(sessionId);
    const rows = this.db.prepare(`
      SELECT * FROM session_events
      WHERE session_id = ?
      ORDER BY occurred_at, source_order, event_id
    `).all(sessionId.trim()) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapEvent(row));
  }

  eventCount(sessionId: string): number {
    this.get(sessionId);
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM session_events WHERE session_id = ?")
      .get(sessionId.trim()) as { count?: unknown } | undefined;
    return Number(row?.count ?? 0);
  }

  createHandoffDraft(input: CreateSessionHandoffDraftInput): GoalBoardSessionHandoffRecord {
    const sourceSessionId = requiredText(input.source_session_id, "来源 Session 不能为空");
    const sourceProjectId = requiredText(input.source_project_id, "来源 Project 不能为空");
    const sourceGoalId = requiredText(input.source_goal_id, "来源 Goal 不能为空");
    const targetRuntimeId = requiredText(input.target_runtime_id, "请选择目标 Runtime");
    const targetProjectId = requiredText(input.target_project_id, "目标 Project 不能为空");
    const actorId = requiredText(input.actor_id, "Handoff 写入必须记录执行者");
    const content = requiredText(input.content, "Handoff 内容不能为空");
    const source = this.get(sourceSessionId);
    if (source.project_id !== sourceProjectId || source.current_goal_id !== sourceGoalId) {
      throw new GoalBoardSessionError("session.invalid_input", "来源 Session 的当前 Project 或 Goal 已经变化，请重新生成 Handoff");
    }
    const targetWorkspacePath = optionalAbsolutePath(input.target_workspace_path);
    const { content_ref: contentRef } = this.contentStore.write(content);
    const contentDigest = createHash("sha256").update(content).digest("hex");
    const packageId = `session-handoff-${randomUUID()}`;
    const now = this.now().toISOString();
    this.db.prepare(`
      INSERT INTO session_handoffs (
        package_id, source_session_id, source_project_id, source_goal_id,
        target_runtime_id, target_project_id, target_workspace_id, target_workspace_path,
        destination_session_id, state, delivery_mode, content_ref, content_digest,
        attempt_count, error_code, error_message, retryable,
        created_by, created_at, updated_at, sent_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'draft', NULL, ?, ?, 0, NULL, NULL, 1, ?, ?, ?, NULL)
    `).run(
      packageId,
      sourceSessionId,
      sourceProjectId,
      sourceGoalId,
      targetRuntimeId,
      targetProjectId,
      optionalText(input.target_workspace_id),
      targetWorkspacePath,
      contentRef,
      contentDigest,
      actorId,
      now,
      now,
    );
    return this.getHandoff(packageId);
  }

  getHandoff(packageId: string): GoalBoardSessionHandoffRecord {
    const row = this.db.prepare("SELECT * FROM session_handoffs WHERE package_id = ?")
      .get(requiredText(packageId, "Handoff package ID 不能为空")) as Record<string, unknown> | undefined;
    if (!row) throw new GoalBoardSessionError("session.handoff_not_found", "找不到这条 Handoff package");
    return this.mapHandoff(row);
  }

  latestPendingHandoff(sourceSessionId: string): GoalBoardSessionHandoffRecord | null {
    this.recoverInterruptedHandoffs();
    const row = this.db.prepare(`
      SELECT * FROM session_handoffs
      WHERE source_session_id = ? AND state IN ('draft', 'sending', 'failed')
      ORDER BY updated_at DESC, package_id DESC
      LIMIT 1
    `).get(requiredText(sourceSessionId, "来源 Session 不能为空")) as Record<string, unknown> | undefined;
    return row ? this.mapHandoff(row) : null;
  }

  handoffsForSession(sessionId: string): GoalBoardSessionHandoffRecord[] {
    this.get(sessionId);
    return (this.db.prepare(`
      SELECT * FROM session_handoffs
      WHERE source_session_id = ? OR destination_session_id = ?
      ORDER BY updated_at DESC, package_id DESC
    `).all(sessionId, sessionId) as Array<Record<string, unknown>>).map((row) => this.mapHandoff(row));
  }

  updateHandoffDraft(input: UpdateSessionHandoffDraftInput): GoalBoardSessionHandoffRecord {
    const current = this.getHandoff(input.package_id);
    if (current.state !== "draft" && current.state !== "failed") {
      throw new GoalBoardSessionError("session.handoff_invalid_state", "只有草稿或失败的 Handoff 可以修改");
    }
    if (current.state === "failed" && !current.retryable) {
      throw new GoalBoardSessionError(
        "session.handoff_invalid_state",
        "这次失败不能安全重试；请取消后重新创建 Handoff",
      );
    }
    requiredText(input.actor_id, "Handoff 修改必须记录执行者");
    const targetRuntimeId = requiredText(input.target_runtime_id, "请选择目标 Runtime");
    const targetProjectId = requiredText(input.target_project_id, "目标 Project 不能为空");
    const targetWorkspaceId = optionalText(input.target_workspace_id);
    const targetWorkspacePath = optionalAbsolutePath(input.target_workspace_path);
    const content = requiredText(input.content, "Handoff 内容不能为空");
    if (current.destination_session_id && (
      current.target_runtime_id !== targetRuntimeId
      || current.target_project_id !== targetProjectId
      || current.target_workspace_id !== targetWorkspaceId
      || current.target_workspace_path !== targetWorkspacePath
    )) {
      throw new GoalBoardSessionError(
        "session.handoff_invalid_state",
        "目标 Session 已经创建；可以修改正文并重试，但不能再改变 Runtime、Project 或工作目录",
      );
    }
    const { content_ref: contentRef } = this.contentStore.write(content);
    const contentDigest = createHash("sha256").update(content).digest("hex");
    const now = this.now().toISOString();
    const updated = this.db.prepare(`
      UPDATE session_handoffs
      SET target_runtime_id = ?, target_project_id = ?, target_workspace_id = ?,
          target_workspace_path = ?, state = 'draft', content_ref = ?, content_digest = ?,
          error_code = NULL, error_message = NULL, retryable = 1, updated_at = ?
      WHERE package_id = ? AND state IN ('draft', 'failed')
    `).run(
      targetRuntimeId,
      targetProjectId,
      targetWorkspaceId,
      targetWorkspacePath,
      contentRef,
      contentDigest,
      now,
      current.package_id,
    );
    if (updated.changes !== 1) {
      throw new GoalBoardSessionError(
        "session.handoff_invalid_state",
        "Handoff 状态已经变化，请刷新后再操作",
      );
    }
    return this.getHandoff(current.package_id);
  }

  markHandoffSending(packageId: string): GoalBoardSessionHandoffRecord {
    const current = this.getHandoff(packageId);
    if (current.state === "sent") return current;
    if (current.state !== "draft" && current.state !== "failed") {
      throw new GoalBoardSessionError("session.handoff_invalid_state", "这条 Handoff 当前不能发送");
    }
    const updated = this.db.prepare(`
      UPDATE session_handoffs
      SET state = 'sending', attempt_count = attempt_count + 1,
          error_code = NULL, error_message = NULL, retryable = 1, updated_at = ?
      WHERE package_id = ? AND state IN ('draft', 'failed')
    `).run(this.now().toISOString(), current.package_id);
    if (updated.changes !== 1) {
      const latest = this.getHandoff(current.package_id);
      if (latest.state === "sent") return latest;
      throw new GoalBoardSessionError(
        "session.handoff_invalid_state",
        "这条 Handoff 已在另一个请求中发送，请等待结果后刷新",
      );
    }
    return this.getHandoff(current.package_id);
  }

  attachHandoffDestination(input: {
    package_id: string;
    destination_session_id: string;
    delivery_mode: NonNullable<GoalBoardSessionHandoffRecord["delivery_mode"]>;
  }): GoalBoardSessionHandoffRecord {
    const current = this.getHandoff(input.package_id);
    if (current.state !== "sending") {
      throw new GoalBoardSessionError(
        "session.handoff_invalid_state",
        "只有发送中的 Handoff 可以记录目标 Session",
      );
    }
    const destination = this.get(input.destination_session_id);
    if (
      destination.session_id === current.source_session_id
      ||
      destination.project_id !== current.target_project_id
      || destination.current_goal_id !== current.source_goal_id
      || destination.runtime_id !== current.target_runtime_id
    ) {
      throw new GoalBoardSessionError(
        "session.identity_conflict",
        "目标 Session 的 Runtime、Project 或 Goal 与 Handoff 不一致",
      );
    }
    if (current.destination_session_id) {
      if (
        current.destination_session_id === destination.session_id
        && current.delivery_mode === input.delivery_mode
      ) return current;
      throw new GoalBoardSessionError("session.identity_conflict", "Handoff 已连接另一个目标 Session");
    }
    const updated = this.db.prepare(`
      UPDATE session_handoffs
      SET destination_session_id = ?, delivery_mode = ?, updated_at = ?
      WHERE package_id = ? AND state = 'sending' AND destination_session_id IS NULL
    `).run(
      destination.session_id,
      input.delivery_mode,
      this.now().toISOString(),
      current.package_id,
    );
    if (updated.changes !== 1) {
      throw new GoalBoardSessionError(
        "session.handoff_invalid_state",
        "Handoff 状态已经变化，不能覆盖目标 Session",
      );
    }
    return this.getHandoff(current.package_id);
  }

  markHandoffFailed(input: {
    package_id: string;
    error_code: string;
    error_message: string;
    retryable: boolean;
    destination_session_id?: string | null;
    delivery_mode?: GoalBoardSessionHandoffRecord["delivery_mode"];
  }): GoalBoardSessionHandoffRecord {
    const current = this.getHandoff(input.package_id);
    if (current.state !== "sending") {
      throw new GoalBoardSessionError("session.handoff_invalid_state", "只有发送中的 Handoff 可以记录失败");
    }
    const destinationSessionId = optionalText(input.destination_session_id) ?? current.destination_session_id;
    if (destinationSessionId) this.get(destinationSessionId);
    const updated = this.db.prepare(`
      UPDATE session_handoffs
      SET state = 'failed', destination_session_id = ?, delivery_mode = ?,
          error_code = ?, error_message = ?, retryable = ?, updated_at = ?
      WHERE package_id = ? AND state = 'sending'
    `).run(
      destinationSessionId,
      input.delivery_mode ?? current.delivery_mode,
      requiredText(input.error_code, "Handoff 失败必须提供错误码"),
      requiredText(input.error_message, "Handoff 失败必须提供恢复说明"),
      input.retryable ? 1 : 0,
      this.now().toISOString(),
      current.package_id,
    );
    if (updated.changes !== 1) {
      throw new GoalBoardSessionError(
        "session.handoff_invalid_state",
        "Handoff 状态已经变化，不能覆盖当前发送结果",
      );
    }
    return this.getHandoff(current.package_id);
  }

  markHandoffSent(input: {
    package_id: string;
    destination_session_id: string;
    delivery_mode: NonNullable<GoalBoardSessionHandoffRecord["delivery_mode"]>;
  }): GoalBoardSessionHandoffRecord {
    const current = this.getHandoff(input.package_id);
    if (current.state === "sent") return current;
    if (current.state !== "sending") {
      throw new GoalBoardSessionError("session.handoff_invalid_state", "只有发送中的 Handoff 可以完成");
    }
    this.get(input.destination_session_id);
    const now = this.now().toISOString();
    const updated = this.db.prepare(`
      UPDATE session_handoffs
      SET state = 'sent', destination_session_id = ?, delivery_mode = ?,
          error_code = NULL, error_message = NULL, retryable = 0,
          updated_at = ?, sent_at = ?
      WHERE package_id = ? AND state = 'sending'
    `).run(input.destination_session_id, input.delivery_mode, now, now, current.package_id);
    if (updated.changes !== 1) {
      const latest = this.getHandoff(current.package_id);
      if (latest.state === "sent") return latest;
      throw new GoalBoardSessionError(
        "session.handoff_invalid_state",
        "Handoff 状态已经变化，不能覆盖当前发送结果",
      );
    }
    return this.getHandoff(current.package_id);
  }

  cancelHandoff(packageId: string): GoalBoardSessionHandoffRecord {
    const current = this.getHandoff(packageId);
    if (current.state === "cancelled") return current;
    if (current.state !== "draft" && current.state !== "failed") {
      throw new GoalBoardSessionError("session.handoff_invalid_state", "发送中或已发送的 Handoff 不能取消");
    }
    const updated = this.db.prepare(`
      UPDATE session_handoffs
      SET state = 'cancelled', retryable = 0, updated_at = ?
      WHERE package_id = ? AND state IN ('draft', 'failed')
    `).run(this.now().toISOString(), current.package_id);
    if (updated.changes !== 1) {
      const latest = this.getHandoff(current.package_id);
      if (latest.state === "cancelled") return latest;
      throw new GoalBoardSessionError(
        "session.handoff_invalid_state",
        "Handoff 状态已经变化，不能取消",
      );
    }
    return this.getHandoff(current.package_id);
  }

  private recoverInterruptedHandoffs(): void {
    const now = this.now().toISOString();
    const staleBefore = new Date(this.now().getTime() - HANDOFF_SEND_LEASE_MS).toISOString();
    this.db.prepare(`
      UPDATE session_handoffs
      SET state = 'failed', error_code = 'handoff.interrupted',
          error_message = 'Handoff 发送租约已过期；请检查目标 Runtime 后重试。',
          retryable = 1, updated_at = ?
      WHERE state = 'sending' AND updated_at <= ?
    `).run(now, staleBefore);
  }

  private mapHandoff(row: Record<string, unknown>): GoalBoardSessionHandoffRecord {
    let content: string | null = null;
    try {
      content = this.contentStore.read(String(row.content_ref));
    } catch {
      content = null;
    }
    return {
      package_id: String(row.package_id),
      source_session_id: String(row.source_session_id),
      source_project_id: String(row.source_project_id),
      source_goal_id: String(row.source_goal_id),
      target_runtime_id: String(row.target_runtime_id),
      target_project_id: String(row.target_project_id),
      target_workspace_id: row.target_workspace_id == null ? null : String(row.target_workspace_id),
      target_workspace_path: row.target_workspace_path == null ? null : String(row.target_workspace_path),
      destination_session_id: row.destination_session_id == null ? null : String(row.destination_session_id),
      state: String(row.state) as GoalBoardSessionHandoffRecord["state"],
      delivery_mode: row.delivery_mode == null
        ? null
        : String(row.delivery_mode) as GoalBoardSessionHandoffRecord["delivery_mode"],
      content,
      content_available: content !== null,
      content_digest: String(row.content_digest),
      attempt_count: Number(row.attempt_count),
      error_code: row.error_code == null ? null : String(row.error_code),
      error_message: row.error_message == null ? null : String(row.error_message),
      retryable: Number(row.retryable) === 1,
      created_by: String(row.created_by),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      sent_at: row.sent_at == null ? null : String(row.sent_at),
    };
  }

  private event(eventId: string): GoalBoardSessionEventRecord {
    const row = this.db.prepare("SELECT * FROM session_events WHERE event_id = ?").get(eventId) as
      | Record<string, unknown>
      | undefined;
    if (!row) throw new GoalBoardSessionError("session.not_found", "找不到这条 Session 事件");
    return this.mapEvent(row);
  }

  private mapEvent(row: Record<string, unknown>): GoalBoardSessionEventRecord {
    let content: string | null = null;
    try {
      content = this.contentStore.read(String(row.content_ref));
    } catch {
      content = null;
    }
    return {
      event_id: String(row.event_id),
      session_id: String(row.session_id),
      source: String(row.source) as GoalBoardSessionEventRecord["source"],
      kind: String(row.kind) as GoalBoardSessionEventRecord["kind"],
      source_id: String(row.source_id),
      source_order: Number(row.source_order),
      occurred_at: String(row.occurred_at),
      content,
      content_available: content !== null,
      metadata: parseMetadata(row.metadata_json),
      created_at: String(row.created_at),
    };
  }

  migrateLegacy(input: LegacySessionMigrationInput): LegacySessionMigrationReport {
    return this.db.transaction(() => {
      let createdSessions = 0;
      let reusedSessions = 0;
      let receiptsWritten = 0;
      const sessionIds = new Set<string>();
      const panelSessions = new Map<string, GoalBoardSessionRecord>();

      for (const panel of input.panels) {
        const sourceId = `panel:${panel.panel_id}`;
        let session = this.sessionForReceipt(sourceId)
          ?? this.findBySurface(panel.panel_id)
          ?? (panel.host_session_id
            ? this.findByNativeRuntimeSession(panel.runtime_id, panel.host_session_id)
            : null);
        if (!session) {
          const now = panel.updated_at || this.now().toISOString();
          session = this.insertSession({
            sessionId: `session-${randomUUID()}`,
            runtimeId: panel.runtime_id,
            nativeId: panel.host_session_id,
            correlationToken: panel.host_session_id ? null : panel.work_context_id,
            correlationExpiresAt: panel.host_session_id
              ? null
              : new Date(this.now().getTime() + DEFAULT_CORRELATION_TTL_SECONDS * 1000).toISOString(),
            surfaceId: panel.panel_id,
            projectId: panel.project_id,
            currentGoalId: panel.goal_id,
            workspaceId: panel.workspace_id,
            workspacePath: panel.workspace_path,
            title: panel.title,
            status: panel.status === "open" ? "active" : "closed",
            provenance: "legacy_migrated",
            metadata: { legacy_work_context_id: panel.work_context_id },
            actorId: "legacy-session-migration",
            createdAt: panel.created_at || now,
            updatedAt: now,
          });
          createdSessions += 1;
        } else {
          session = this.reconcileLegacyPanel(session, panel);
          reusedSessions += 1;
        }
        panelSessions.set(panel.panel_id, session);
        sessionIds.add(session.session_id);
        receiptsWritten += this.writeMigrationReceipt(sourceId, session.session_id, panel);
      }
      input.before_step?.("after_panels");

      for (const binding of input.bindings) {
        const sourceId = `binding:${binding.binding_id}`;
        let session = this.sessionForReceipt(sourceId);
        if (!session) {
          const matchingPanel = input.panels.find((panel) =>
            panel.runtime_id === binding.runtime_id
            && (panel.work_context_id === binding.stable_work_context_id
              || panel.host_session_id === binding.stable_work_context_id));
          session = matchingPanel ? panelSessions.get(matchingPanel.panel_id) ?? null : null;
        }
        session ??= this.findByNativeRuntimeSession(binding.runtime_id, binding.stable_work_context_id);
        if (!session) {
          session = this.insertSession({
            sessionId: `session-${randomUUID()}`,
            runtimeId: binding.runtime_id,
            nativeId: binding.stable_work_context_id,
            correlationToken: null,
            correlationExpiresAt: null,
            surfaceId: null,
            projectId: binding.project_id,
            currentGoalId: null,
            workspaceId: null,
            workspacePath: null,
            title: null,
            status: "active",
            provenance: "legacy_migrated",
            metadata: { legacy_binding_id: binding.binding_id },
            actorId: binding.bound_by || "legacy-session-migration",
            createdAt: binding.created_at,
            updatedAt: binding.updated_at,
          });
          createdSessions += 1;
        } else {
          if (session.project_id && session.project_id !== binding.project_id) {
            throw new GoalBoardSessionError(
              "session.identity_conflict",
              "同一逻辑 Session 的旧 panel 与 binding 指向不同项目，迁移已回滚",
            );
          }
          if (!session.project_id) {
            this.db.prepare("UPDATE sessions SET project_id = ?, updated_at = ? WHERE session_id = ?")
              .run(binding.project_id, binding.updated_at, session.session_id);
            session = this.get(session.session_id);
          }
          reusedSessions += 1;
        }
        sessionIds.add(session.session_id);
        receiptsWritten += this.writeMigrationReceipt(sourceId, session.session_id, binding);
      }
      input.before_step?.("after_bindings");
      input.before_step?.("before_commit");
      return {
        created_sessions: createdSessions,
        reused_sessions: reusedSessions,
        receipts_written: receiptsWritten,
        session_ids: [...sessionIds].sort(),
      };
    })();
  }

  private insertSession(input: {
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
  }): GoalBoardSessionRecord {
    this.db.prepare(`
      INSERT INTO sessions (
        session_id, runtime_id, native_runtime_session_id, correlation_token,
        correlation_expires_at, surface_id, project_id, current_goal_id,
        workspace_id, workspace_path, title, status, provenance, metadata_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.sessionId,
      input.runtimeId,
      input.nativeId,
      input.correlationToken,
      input.correlationExpiresAt,
      input.surfaceId,
      input.projectId,
      input.currentGoalId,
      input.workspaceId,
      input.workspacePath,
      input.title,
      input.status,
      input.provenance,
      JSON.stringify(input.metadata),
      input.createdAt,
      input.updatedAt,
    );
    if (input.currentGoalId) {
      this.insertGoalLink(input.sessionId, input.currentGoalId, input.actorId, input.createdAt);
    }
    return this.get(input.sessionId);
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
        UPDATE session_goal_links
        SET relation = 'history', ended_at = ?
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

  private insertGoalLink(sessionId: string, goalId: string, actorId: string, now: string): void {
    this.db.prepare(`
      INSERT INTO session_goal_links (
        link_id, session_id, goal_id, relation, linked_by, created_at, ended_at
      ) VALUES (?, ?, ?, 'current', ?, ?, NULL)
    `).run(`session-goal-${randomUUID()}`, sessionId, goalId, actorId, now);
  }

  private sessionForReceipt(sourceId: string): GoalBoardSessionRecord | null {
    const row = this.db.prepare(`
      SELECT sessions.*
      FROM session_migration_receipts AS receipts
      INNER JOIN sessions ON sessions.session_id = receipts.session_id
      WHERE receipts.source_id = ?
    `).get(sourceId) as Record<string, unknown> | undefined;
    return row ? mapSession(row) : null;
  }

  private writeMigrationReceipt(sourceId: string, sessionId: string, source: unknown): number {
    const fingerprint = createHash("sha256").update(JSON.stringify(source)).digest("hex");
    const result = this.db.prepare(`
      INSERT INTO session_migration_receipts (source_id, session_id, source_fingerprint, migrated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(source_id) DO UPDATE SET
        session_id = excluded.session_id,
        source_fingerprint = excluded.source_fingerprint,
        migrated_at = excluded.migrated_at
      WHERE session_migration_receipts.session_id <> excluded.session_id
         OR session_migration_receipts.source_fingerprint <> excluded.source_fingerprint
    `).run(sourceId, sessionId, fingerprint, this.now().toISOString());
    return result.changes;
  }

  private reconcileLegacyPanel(
    current: GoalBoardSessionRecord,
    panel: LegacySessionMigrationInput["panels"][number],
  ): GoalBoardSessionRecord {
    if (current.runtime_id !== panel.runtime_id) {
      throw new GoalBoardSessionError("session.runtime_mismatch", "旧 panel 与已有 Session 的 Runtime 不匹配");
    }
    if (current.project_id && current.project_id !== panel.project_id) {
      throw new GoalBoardSessionError("session.identity_conflict", "旧 panel 与已有 Session 指向不同项目");
    }
    if (panel.host_session_id && current.native_runtime_session_id && current.native_runtime_session_id !== panel.host_session_id) {
      throw new GoalBoardSessionError("session.identity_conflict", "旧 panel 已连接另一个 Runtime 原生 Session");
    }
    const now = panel.updated_at || this.now().toISOString();
    if (panel.goal_id !== current.current_goal_id) {
      this.db.prepare(`
        UPDATE session_goal_links SET relation = 'history', ended_at = ?
        WHERE session_id = ? AND relation = 'current'
      `).run(now, current.session_id);
      this.insertGoalLink(current.session_id, panel.goal_id, "legacy-session-migration", now);
    }
    this.db.prepare(`
      UPDATE sessions
      SET native_runtime_session_id = COALESCE(native_runtime_session_id, ?),
          correlation_token = CASE WHEN ? IS NULL THEN correlation_token ELSE NULL END,
          correlation_expires_at = CASE WHEN ? IS NULL THEN correlation_expires_at ELSE NULL END,
          surface_id = COALESCE(surface_id, ?), project_id = COALESCE(project_id, ?),
          current_goal_id = ?, workspace_id = COALESCE(workspace_id, ?),
          workspace_path = COALESCE(workspace_path, ?), title = COALESCE(title, ?),
          status = ?, updated_at = ?
      WHERE session_id = ?
    `).run(
      panel.host_session_id,
      panel.host_session_id,
      panel.host_session_id,
      panel.panel_id,
      panel.project_id,
      panel.goal_id,
      panel.workspace_id,
      panel.workspace_path,
      panel.title,
      panel.status === "open" ? "active" : "closed",
      now,
      current.session_id,
    );
    return this.get(current.session_id);
  }
}

function initializeOrValidateRegistry(db: Database.Database): void {
  const meta = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_meta'").get();
  if (!meta) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE session_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE sessions (
          session_id TEXT PRIMARY KEY,
          runtime_id TEXT NOT NULL,
          native_runtime_session_id TEXT,
          correlation_token TEXT,
          correlation_expires_at TEXT,
          surface_id TEXT,
          project_id TEXT,
          current_goal_id TEXT,
          workspace_id TEXT,
          workspace_path TEXT,
          title TEXT,
          status TEXT NOT NULL CHECK (status IN ('discovered', 'active', 'closed')),
          provenance TEXT NOT NULL CHECK (provenance IN (
            'goalboard_created', 'runtime_discovered', 'explicitly_linked', 'legacy_migrated'
          )),
          metadata_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX sessions_native_identity_idx
          ON sessions(runtime_id, native_runtime_session_id)
          WHERE native_runtime_session_id IS NOT NULL;
        CREATE UNIQUE INDEX sessions_surface_idx
          ON sessions(surface_id) WHERE surface_id IS NOT NULL;
        CREATE UNIQUE INDEX sessions_correlation_idx
          ON sessions(correlation_token) WHERE correlation_token IS NOT NULL;
        CREATE INDEX sessions_project_idx ON sessions(project_id, updated_at, session_id);
        CREATE INDEX sessions_workspace_idx ON sessions(workspace_id, updated_at, session_id);
        CREATE TABLE session_goal_links (
          link_id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
          goal_id TEXT NOT NULL,
          relation TEXT NOT NULL CHECK (relation IN ('current', 'history')),
          linked_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          ended_at TEXT
        );
        CREATE UNIQUE INDEX session_goal_current_idx
          ON session_goal_links(session_id) WHERE relation = 'current';
        CREATE INDEX session_goal_history_idx
          ON session_goal_links(session_id, created_at, link_id);
        CREATE TABLE session_migration_receipts (
          source_id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
          source_fingerprint TEXT NOT NULL,
          migrated_at TEXT NOT NULL
        );
        ${sessionEventsSchema()}
        ${sessionHandoffsSchema()}
      `);
      db.prepare("INSERT INTO session_meta (key, value) VALUES (?, ?)").run("owner", SESSION_REGISTRY_OWNER);
      db.prepare("INSERT INTO session_meta (key, value) VALUES (?, ?)").run(
        "schema_version",
        String(SESSION_REGISTRY_SCHEMA_VERSION),
      );
    })();
    return;
  }
  const owner = (db.prepare("SELECT value FROM session_meta WHERE key = 'owner'").get() as { value?: unknown } | undefined)?.value;
  if (owner !== SESSION_REGISTRY_OWNER) {
    throw new GoalBoardSessionError("session.registry_unknown", "不会复用未知 Session Registry 数据库");
  }
  const version = Number((db.prepare("SELECT value FROM session_meta WHERE key = 'schema_version'").get() as
    | { value?: unknown }
    | undefined)?.value);
  if (version === 1) {
    db.transaction(() => {
      db.exec(sessionEventsSchema());
      db.exec(sessionHandoffsSchema());
      db.prepare("UPDATE session_meta SET value = ? WHERE key = 'schema_version'")
        .run(String(SESSION_REGISTRY_SCHEMA_VERSION));
    })();
    return;
  }
  if (version === 2) {
    db.transaction(() => {
      db.exec(sessionHandoffsSchema());
      db.prepare("UPDATE session_meta SET value = ? WHERE key = 'schema_version'")
        .run(String(SESSION_REGISTRY_SCHEMA_VERSION));
    })();
    return;
  }
  if (version !== SESSION_REGISTRY_SCHEMA_VERSION) {
    throw new GoalBoardSessionError(
      "session.registry_reader_too_old",
      `Session Registry schema=${version}，当前 reader 支持 ${SESSION_REGISTRY_SCHEMA_VERSION}`,
    );
  }
}

function sessionEventsSchema(): string {
  return `
    CREATE TABLE IF NOT EXISTS session_events (
      event_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK (source IN ('goalboard_tui', 'goalboard')),
      kind TEXT NOT NULL CHECK (kind IN (
        'user_message', 'runtime_message', 'tool', 'approval',
        'status', 'artifact', 'terminal_output'
      )),
      source_id TEXT NOT NULL,
      source_order INTEGER NOT NULL,
      occurred_at TEXT NOT NULL,
      content_ref TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(session_id, source, source_id)
    );
    CREATE INDEX IF NOT EXISTS session_events_timeline_idx
      ON session_events(session_id, occurred_at, source_order, event_id);
  `;
}

function sessionHandoffsSchema(): string {
  return `
    CREATE TABLE IF NOT EXISTS session_handoffs (
      package_id TEXT PRIMARY KEY,
      source_session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
      source_project_id TEXT NOT NULL,
      source_goal_id TEXT NOT NULL,
      target_runtime_id TEXT NOT NULL,
      target_project_id TEXT NOT NULL,
      target_workspace_id TEXT,
      target_workspace_path TEXT,
      destination_session_id TEXT REFERENCES sessions(session_id) ON DELETE SET NULL,
      state TEXT NOT NULL CHECK (state IN ('draft', 'sending', 'failed', 'sent', 'cancelled')),
      delivery_mode TEXT CHECK (delivery_mode IS NULL OR delivery_mode IN ('native', 'goalboard_fallback')),
      content_ref TEXT NOT NULL,
      content_digest TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      error_code TEXT,
      error_message TEXT,
      retryable INTEGER NOT NULL DEFAULT 1 CHECK (retryable IN (0, 1)),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sent_at TEXT
    );
    CREATE INDEX IF NOT EXISTS session_handoffs_source_idx
      ON session_handoffs(source_session_id, updated_at, package_id);
    CREATE INDEX IF NOT EXISTS session_handoffs_destination_idx
      ON session_handoffs(destination_session_id, updated_at, package_id);
  `;
}

function mapSession(row: Record<string, unknown>): GoalBoardSessionRecord {
  return {
    session_id: String(row.session_id),
    runtime_id: String(row.runtime_id),
    native_runtime_session_id: row.native_runtime_session_id == null ? null : String(row.native_runtime_session_id),
    correlation_token: row.correlation_token == null ? null : String(row.correlation_token),
    correlation_expires_at: row.correlation_expires_at == null ? null : String(row.correlation_expires_at),
    surface_id: row.surface_id == null ? null : String(row.surface_id),
    project_id: row.project_id == null ? null : String(row.project_id),
    current_goal_id: row.current_goal_id == null ? null : String(row.current_goal_id),
    workspace_id: row.workspace_id == null ? null : String(row.workspace_id),
    workspace_path: row.workspace_path == null ? null : String(row.workspace_path),
    title: row.title == null ? null : String(row.title),
    status: String(row.status) as GoalBoardSessionRecord["status"],
    provenance: String(row.provenance) as GoalBoardSessionRecord["provenance"],
    metadata: parseMetadata(row.metadata_json),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapGoalLink(row: Record<string, unknown>): GoalBoardSessionGoalLink {
  return {
    link_id: String(row.link_id),
    session_id: String(row.session_id),
    goal_id: String(row.goal_id),
    relation: String(row.relation) as GoalBoardSessionGoalLink["relation"],
    linked_by: String(row.linked_by),
    created_at: String(row.created_at),
    ended_at: row.ended_at == null ? null : String(row.ended_at),
  };
}

function parseMetadata(value: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(value ?? "{}")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

function requiredText(value: unknown, message: string): string {
  const text = optionalText(value);
  if (!text) throw new GoalBoardSessionError("session.invalid_input", message);
  return text;
}

function optionalAbsolutePath(value: unknown): string | null {
  const text = optionalText(value);
  if (!text) return null;
  if (!path.isAbsolute(text)) {
    throw new GoalBoardSessionError("session.invalid_input", "Session 工作目录必须是绝对路径");
  }
  return path.resolve(text);
}

function requireConfirmation(value: boolean): void {
  if (value !== true) {
    throw new GoalBoardSessionError(
      "session.confirmation_required",
      "创建或改变 Session 关联前必须获得用户明确确认",
    );
  }
}

function correlationTtl(value: number | undefined): number {
  if (value == null) return DEFAULT_CORRELATION_TTL_SECONDS;
  if (!Number.isSafeInteger(value) || value <= 0 || value > 24 * 60 * 60) {
    throw new GoalBoardSessionError("session.invalid_input", "correlation TTL 必须是 1 秒到 24 小时之间的整数");
  }
  return value;
}

function validIsoTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function safeEventMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const blocked = /authorization|cookie|credential|password|secret|token|body|content|env/i;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (blocked.test(key)) continue;
    if (typeof item === "string") output[key] = item.slice(0, 500);
    else if (typeof item === "number" && Number.isFinite(item)) output[key] = item;
    else if (typeof item === "boolean" || item === null) output[key] = item;
  }
  return output;
}

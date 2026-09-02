import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createSessionContentStore } from "./content-store.js";
import type {
  AppendGoalBoardSessionEventInput,
  CreateGoalBoardSessionInput,
  CreateSessionHandoffDraftInput,
  DiscoverRuntimeSessionInput,
  ExplicitlyLinkRuntimeSessionInput,
  GoalBoardSessionEventRecord,
  GoalBoardSessionGoalLink,
  GoalBoardSessionHandoffRecord,
  GoalBoardSessionRecord,
  LegacySessionMigrationInput,
  LegacySessionMigrationReport,
  LinkNativeRuntimeSessionInput,
  ReassignWorkspaceSessionsInput,
  SessionListFilter,
  SetGoalBoardSessionStatusInput,
  UpdateSessionAssociationsInput,
  UpdateSessionHandoffDraftInput,
} from "./contract-aliases.js";
import { SessionEventRepository } from "./session-events.js";
import { SessionHandoffRepository } from "./session-handoffs.js";
import { LegacySessionMigrator } from "./session-migration.js";
import { SessionRecordRepository } from "./session-records.js";
import { initializeOrValidateSessionSchema } from "./session-schema.js";

export interface GoalBoardSessionRegistryOptions {
  homeDirectory?: string;
  now?: () => Date;
}

/**
 * Compatibility facade for the Private Work Context owner.
 *
 * Persistence, events, handoffs and legacy migration live in separate owner
 * components; callers keep the established API while their imports move to the
 * package public entrypoint.
 */
export class GoalBoardSessionRegistry {
  readonly homeDirectory: string;
  readonly databasePath: string;

  private constructor(
    private readonly db: Database.Database,
    homeDirectory: string,
    private readonly sessions: SessionRecordRepository,
    private readonly eventsRepository: SessionEventRepository,
    private readonly handoffs: SessionHandoffRepository,
    private readonly migration: LegacySessionMigrator,
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
      initializeOrValidateSessionSchema(db);
      const now = options.now ?? (() => new Date());
      const contentStore = createSessionContentStore(path.join(sessionsDirectory, "content"));
      const sessions = new SessionRecordRepository(db, now);
      const handoffs = new SessionHandoffRepository(db, now, contentStore, sessions);
      const registry = new GoalBoardSessionRegistry(
        db,
        homeDirectory,
        sessions,
        new SessionEventRepository(db, now, contentStore, sessions),
        handoffs,
        new LegacySessionMigrator(db, now, sessions),
      );
      handoffs.recoverInterrupted();
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
    return this.sessions.createSession(input);
  }

  discoverSession(input: DiscoverRuntimeSessionInput): GoalBoardSessionRecord {
    return this.sessions.discoverSession(input);
  }

  explicitlyLinkSession(input: ExplicitlyLinkRuntimeSessionInput): GoalBoardSessionRecord {
    return this.sessions.explicitlyLinkSession(input);
  }

  linkNativeRuntimeSession(input: LinkNativeRuntimeSessionInput): GoalBoardSessionRecord {
    return this.sessions.linkNativeRuntimeSession(input);
  }

  updateAssociations(input: UpdateSessionAssociationsInput): GoalBoardSessionRecord {
    return this.sessions.updateAssociations(input);
  }

  setStatus(input: SetGoalBoardSessionStatusInput): GoalBoardSessionRecord {
    return this.sessions.setStatus(input);
  }

  reassignWorkspaceSessions(input: ReassignWorkspaceSessionsInput): GoalBoardSessionRecord[] {
    return this.sessions.reassignWorkspaceSessions(input);
  }

  get(sessionId: string): GoalBoardSessionRecord {
    return this.sessions.get(sessionId);
  }

  findByNativeRuntimeSession(runtimeId: string, nativeId: string): GoalBoardSessionRecord | null {
    return this.sessions.findByNativeRuntimeSession(runtimeId, nativeId);
  }

  findBySurface(surfaceId: string): GoalBoardSessionRecord | null {
    return this.sessions.findBySurface(surfaceId);
  }

  list(filter: SessionListFilter = {}): GoalBoardSessionRecord[] {
    return this.sessions.list(filter);
  }

  goalHistory(sessionId: string): GoalBoardSessionGoalLink[] {
    return this.sessions.goalHistory(sessionId);
  }

  appendEvent(input: AppendGoalBoardSessionEventInput): GoalBoardSessionEventRecord {
    return this.eventsRepository.append(input);
  }

  events(sessionId: string): GoalBoardSessionEventRecord[] {
    return this.eventsRepository.list(sessionId);
  }

  eventCount(sessionId: string): number {
    return this.eventsRepository.count(sessionId);
  }

  createHandoffDraft(input: CreateSessionHandoffDraftInput): GoalBoardSessionHandoffRecord {
    return this.handoffs.createDraft(input);
  }

  getHandoff(packageId: string): GoalBoardSessionHandoffRecord {
    return this.handoffs.get(packageId);
  }

  latestPendingHandoff(sourceSessionId: string): GoalBoardSessionHandoffRecord | null {
    return this.handoffs.latestPending(sourceSessionId);
  }

  handoffsForSession(sessionId: string): GoalBoardSessionHandoffRecord[] {
    return this.handoffs.listForSession(sessionId);
  }

  updateHandoffDraft(input: UpdateSessionHandoffDraftInput): GoalBoardSessionHandoffRecord {
    return this.handoffs.updateDraft(input);
  }

  markHandoffSending(packageId: string): GoalBoardSessionHandoffRecord {
    return this.handoffs.markSending(packageId);
  }

  attachHandoffDestination(input: {
    package_id: string;
    destination_session_id: string;
    delivery_mode: NonNullable<GoalBoardSessionHandoffRecord["delivery_mode"]>;
  }): GoalBoardSessionHandoffRecord {
    return this.handoffs.attachDestination(input);
  }

  markHandoffFailed(input: {
    package_id: string;
    error_code: string;
    error_message: string;
    retryable: boolean;
    destination_session_id?: string | null;
    delivery_mode?: GoalBoardSessionHandoffRecord["delivery_mode"];
  }): GoalBoardSessionHandoffRecord {
    return this.handoffs.markFailed(input);
  }

  markHandoffSent(input: {
    package_id: string;
    destination_session_id: string;
    delivery_mode: NonNullable<GoalBoardSessionHandoffRecord["delivery_mode"]>;
  }): GoalBoardSessionHandoffRecord {
    return this.handoffs.markSent(input);
  }

  cancelHandoff(packageId: string): GoalBoardSessionHandoffRecord {
    return this.handoffs.cancel(packageId);
  }

  migrateLegacy(input: LegacySessionMigrationInput): LegacySessionMigrationReport {
    return this.migration.migrate(input);
  }
}

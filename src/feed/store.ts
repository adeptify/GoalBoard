import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

import {
  AttentionError,
  AttentionModule,
  migrateAttention,
} from "@adeptify/goalboard-module-attention-resumption";
import {
  FeedError,
  FeedModule,
  migrateFeed,
  migrateInfoflowContractV2 as migrateModuleInfoflowContractV2,
} from "@adeptify/goalboard-module-feed";
import { migrateSignals } from "@adeptify/goalboard-module-signals";
import {
  SourcesError,
  SourcesModule,
  migrateSources,
  sourceDeletedAt as moduleSourceDeletedAt,
} from "@adeptify/goalboard-module-sources";
import {
  deleteListenerSourceState,
  getListenerRunByOperationId,
  listListenerRuns,
  migrateListenerHost,
  readListenerCheckpoint,
  recoverInterruptedListenerRuns,
  saveListenerRun,
  writeListenerCursor,
} from "@adeptify/goalboard-service-listener-host";
import type {
  AttentionEntryRecord as ModuleAttentionEntryRecord,
  AttentionReason as ModuleAttentionReason,
  AttentionStatus as ModuleAttentionStatus,
  AttentionSubjectType as ModuleAttentionSubjectType,
} from "@adeptify/goalboard-contracts/modules/attention-resumption";
import type {
  FeedItemRecord as ModuleFeedItemRecord,
  FeedMaterialRecord as ModuleFeedMaterialRecord,
  ImportedFeedItemInput,
  InfoflowContractMigrationReport,
} from "@adeptify/goalboard-contracts/modules/feed";
import type { SourceRecord } from "@adeptify/goalboard-contracts/modules/sources";
import type { ListenerRunRecord } from "@adeptify/goalboard-contracts/services/listener-host";

import type {
  FeedContractMigrationReceiptRecord,
  FeedItemDisposition,
  FeedItemRecord,
  FeedImportReceiptRecord,
  FeedMaterialRecord,
  FeedSnapshot,
  FeedSourceRunRecord,
  FeedSourceRecord,
  InboxEntryReason,
  InboxEntryRecord,
  InboxEntryStatus,
  InboxEntrySubjectType,
  SourceHistoryDecision,
} from "./types.js";
import { assertSourceHistoryDecision } from "./contract.js";

type Row = Record<string, unknown>;

export class FeedStoreError extends Error {
  constructor(
    readonly code:
      | "feed_item_not_found"
      | "inbox_entry_not_found"
      | "feed_source_not_found"
      | "feed_revision_conflict"
      | "feed_invalid_transition"
      | "feed_read_not_supported",
    message: string,
  ) {
    super(message);
    this.name = "FeedStoreError";
  }
}

/** Legacy schema entrypoint. Feed and Attention DDL are owned by their modules. */
export function migrateFeedTables(db: Database.Database): void {
  migrateSources(db);
  migrateSignals(db);
  migrateListenerHost(db);
  migrateAttention(db);
  migrateFeed(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS feed_runtime_blobs (
      namespace TEXT NOT NULL,
      key TEXT NOT NULL,
      opaque TEXT NOT NULL,
      cas_token TEXT NOT NULL,
      PRIMARY KEY (namespace, key)
    );

    CREATE TABLE IF NOT EXISTS feed_import_receipts (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      receipt_id TEXT NOT NULL,
      source_fingerprint TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      credentials_status TEXT NOT NULL CHECK (credentials_status IN ('migrated', 'unavailable', 'not_requested')),
      content_status TEXT NOT NULL CHECK (content_status IN ('migrated', 'partial', 'unavailable', 'not_requested')),
      completed_at TEXT NOT NULL,
      PRIMARY KEY (board_id, receipt_id)
    );
    CREATE INDEX IF NOT EXISTS feed_import_receipts_board_completed_idx
      ON feed_import_receipts(board_id, completed_at DESC);
  `);
}

/** Legacy export retained for schema migration 29 callers. */
export function migrateInfoflowContractV2(db: Database.Database): InfoflowContractMigrationReport {
  migrateFeedTables(db);
  const attention = new AttentionModule(db, { exists: () => true });
  return migrateModuleInfoflowContractV2(db, attention);
}

/**
 * Compatibility facade for callers that still speak the combined FeedStore
 * shape. Every Feed/Attention fact and transition is delegated to a public
 * module API; this class only composes legacy Source/Run/import projections.
 */
export class FeedStore {
  private readonly sources: SourcesModule;
  private readonly attention: AttentionModule;
  private readonly feedItems: FeedModule;

  constructor(readonly db: Database.Database) {
    this.sources = new SourcesModule(db);
    let feedItems!: FeedModule;
    this.attention = new AttentionModule(db, {
      exists: (projectId, subjectType, subjectId) => {
        if (subjectType === "feed_item") return feedItems.query.exists(projectId, subjectId);
        if (subjectType === "source_fault") {
          try {
            this.sources.query.get(projectId, subjectId);
            return true;
          } catch (error) {
            if (error instanceof SourcesError && error.code === "source_not_found") return false;
            throw error;
          }
        }
        return Boolean(this.db.prepare(
          "SELECT 1 FROM goals WHERE board_id = ? AND goal_id = ?",
        ).get(projectId, subjectId));
      },
    }, {
      eventSink: (event) => this.appendLegacyEvent(
        event.project_id,
        "inbox_entry",
        event.entry_id,
        event.type,
        event.reason,
        event.payload,
        event.at,
      ),
    });
    feedItems = new FeedModule(db, this.attention, {
      eventSink: (event) => this.appendLegacyEvent(
        event.project_id,
        "feed_item",
        event.item_id,
        event.type,
        event.reason,
        event.payload,
        event.at,
      ),
    });
    this.feedItems = feedItems;
  }

  snapshot(boardId: string): FeedSnapshot {
    const sources = this.sources.query.list(boardId).map((source) => this.compatibleSource(source));
    const feedItems = this.feedItems.query.list(boardId).map(toLegacyFeedItem);
    const inboxEntries = this.attention.query.list(boardId).map(toLegacyAttentionEntry);
    const activeInboxSubjects = new Set(inboxEntries
      .filter((entry) => entry.subject_type === "feed_item" && isActiveAttention(entry.status))
      .map((entry) => entry.subject_id));
    const items = feedItems.map((item) => activeInboxSubjects.has(item.item_id)
      ? { ...item, item_type: "inbox_message" as const }
      : item);
    const runs = listListenerRuns(this.db, boardId).map(compatibleRun);
    const importReceipts = (this.db.prepare(
      "SELECT * FROM feed_import_receipts WHERE board_id = ? ORDER BY completed_at DESC, receipt_id",
    ).all(boardId) as Row[]).map(mapFeedImportReceipt);
    const contractMigrations = (this.db.prepare(
      "SELECT * FROM feed_contract_migration_receipts ORDER BY schema_version, receipt_id",
    ).all() as Row[]).map(mapFeedContractMigrationReceipt);
    return {
      sources,
      feed_items: feedItems,
      inbox_entries: inboxEntries,
      items,
      runs,
      import_receipts: importReceipts,
      contract_migrations: contractMigrations,
    };
  }

  getItem(boardId: string, itemId: string): FeedItemRecord {
    return this.projectLegacyItem(
      boardId,
      this.callFeed(() => this.feedItems.query.get(boardId, itemId)),
    );
  }

  getFeedItem(boardId: string, itemId: string): FeedItemRecord {
    return toLegacyFeedItem(this.callFeed(() => this.feedItems.query.get(boardId, itemId)));
  }

  findLinkedGoalItem(boardId: string, goalId: string, itemId?: string): FeedItemRecord | null {
    const item = this.feedItems.query.findByLinkedGoal(boardId, goalId, itemId);
    return item ? this.projectLegacyItem(boardId, item) : null;
  }

  listInboxEntries(boardId: string): InboxEntryRecord[] {
    return this.attention.query.list(boardId).map(toLegacyAttentionEntry);
  }

  getInboxEntry(boardId: string, entryId: string): InboxEntryRecord {
    return toLegacyAttentionEntry(this.callAttention(
      () => this.attention.query.get(boardId, entryId),
    ));
  }

  getSource(boardId: string, sourceId: string): FeedSourceRecord {
    try {
      return this.compatibleSource(this.sources.query.get(boardId, sourceId));
    } catch (error) {
      if (error instanceof SourcesError && error.code === "source_not_found") {
        throw new FeedStoreError("feed_source_not_found", "找不到这个来源");
      }
      throw error;
    }
  }

  findSource(
    boardId: string,
    syncKind: FeedSourceRecord["sync_kind"],
    definitionId: string | null,
    configFingerprint?: string,
  ): FeedSourceRecord | null {
    const source = this.sources.query.find(boardId, syncKind, definitionId, configFingerprint);
    return source ? this.compatibleSource(source) : null;
  }

  upsertSource(source: FeedSourceRecord): FeedSourceRecord {
    const saved = this.sources.commands.save({
      project_id: source.board_id,
      source_id: source.source_id,
      kind: source.kind,
      definition_id: source.definition_id,
      sync_kind: source.sync_kind,
      name: source.name,
      description: source.description,
      status: source.status,
      enabled: source.enabled,
      origin: source.origin,
      config: source.config,
      schedule: source.schedule,
      connection_ref: source.credential_ref,
      account_label: source.account_label,
      last_sync_at: source.last_sync_at,
      last_outcome: source.last_outcome,
      last_error_code: source.last_error_code,
      imported_at: source.imported_at,
      updated_at: source.updated_at,
    });
    writeListenerCursor(this.db, source.board_id, source.source_id, source.cursor, source.updated_at);
    return this.compatibleSource(saved);
  }

  setSourceEnabled(boardId: string, sourceId: string, enabled: boolean): FeedSourceRecord {
    try {
      return this.compatibleSource(this.sources.commands.setEnabled(boardId, sourceId, enabled));
    } catch (error) {
      if (error instanceof SourcesError && error.code === "source_not_found") {
        throw new FeedStoreError("feed_source_not_found", "找不到这个来源");
      }
      throw error;
    }
  }

  retireSource(
    boardId: string,
    sourceId: string,
    historyDecision: SourceHistoryDecision,
  ): FeedSourceRecord {
    assertSourceHistoryDecision(historyDecision);
    return this.db.transaction(() => {
      const now = new Date().toISOString();
      if (historyDecision === "delete_local_history") {
        this.feedItems.commands.deleteBySource(boardId, sourceId);
        this.attention.commands.deleteSubject(boardId, "source_fault", sourceId);
        deleteListenerSourceState(this.db, boardId, sourceId);
      }
      const retired = this.compatibleSource(
        this.sources.commands.retire(boardId, sourceId, historyDecision, now),
      );
      this.appendLegacyEvent(
        boardId,
        "feed_source",
        sourceId,
        "feed_source.deleted",
        historyDecision === "delete_local_history"
          ? "来源及本地历史已删除"
          : "来源已删除，本地历史保留",
        { history_decision: historyDecision },
        now,
      );
      return retired;
    }).immediate();
  }

  createInboxEntry(input: {
    boardId: string;
    subjectType: InboxEntrySubjectType;
    subjectId: string;
    reason: InboxEntryReason;
    detail?: Record<string, unknown>;
    entryId?: string;
    at?: string;
  }): { entry: InboxEntryRecord; created: boolean } {
    const result = this.callAttention(() => this.attention.commands.create({
      project_id: input.boardId,
      subject_type: input.subjectType as ModuleAttentionSubjectType,
      subject_id: input.subjectId,
      reason: input.reason as ModuleAttentionReason,
      detail: input.detail,
      entry_id: input.entryId,
      at: input.at,
    }));
    return { entry: toLegacyAttentionEntry(result.entry), created: result.created };
  }

  ensureInboxEntryForFeedItem(
    boardId: string,
    itemId: string,
    reason: Extract<InboxEntryReason, "manual" | "source_rule">,
    detail: Record<string, unknown> = {},
  ): { entry: InboxEntryRecord; created: boolean } {
    const result = this.callAttention(
      () => this.attention.commands.ensureFeedItem(boardId, itemId, reason, detail),
    );
    return { entry: toLegacyAttentionEntry(result.entry), created: result.created };
  }

  setInboxEntryStatus(
    boardId: string,
    entryId: string,
    status: InboxEntryStatus,
    expectedRevision?: number,
  ): InboxEntryRecord {
    return toLegacyAttentionEntry(this.callAttention(
      () => this.attention.commands.setStatus(
        boardId,
        entryId,
        status as ModuleAttentionStatus,
        expectedRevision,
      ),
    ));
  }

  getSourceRunByOperationId(boardId: string, operationId: string): FeedSourceRunRecord | null {
    const run = getListenerRunByOperationId(this.db, boardId, operationId);
    return run ? compatibleRun(run) : null;
  }

  upsertSourceRun(run: FeedSourceRunRecord): FeedSourceRunRecord {
    return compatibleRun(saveListenerRun(this.db, {
      project_id: run.board_id,
      run_id: run.run_id,
      operation_id: run.operation_id,
      source_id: run.source_id,
      phase: run.phase,
      outcome: run.outcome,
      empty: run.empty,
      error_code: run.error_code,
      connector_receipt: run.receipt,
      created_count: run.created_count,
      deduped_count: run.deduped_count,
      recovery_count: run.recovery_count,
      started_at: run.started_at,
      completed_at: run.completed_at,
      updated_at: run.updated_at,
    }));
  }

  recoverInterruptedSourceRuns(boardId: string): number {
    return recoverInterruptedListenerRuns(this.db, boardId);
  }

  ingestItem(input: {
    source: FeedSourceRecord;
    externalId: string;
    signal?: { signal_id: string; revision: number };
    title: string;
    summary: string;
    body?: string | null;
    url?: string | null;
    kind?: string;
    priority?: string;
    tags?: string[];
    author?: string | null;
    occurredAt: string;
    attention?: false | {
      reason: Extract<InboxEntryReason, "manual" | "source_rule">;
      detail?: Record<string, unknown>;
    };
    material?: Omit<FeedMaterialRecord, "board_id" | "item_id" | "imported_at" | "updated_at">;
  }): { item: FeedItemRecord; created: boolean } {
    const result = this.callFeed(() => this.feedItems.commands.ingest({
      project_id: input.source.board_id,
      source_id: input.source.source_id,
      source_kind: input.source.kind,
      source_label: input.source.name,
      external_id: input.externalId,
      signal: input.signal,
      title: input.title,
      summary: input.summary,
      body: input.body,
      url: input.url,
      kind: input.kind,
      priority: input.priority,
      tags: input.tags,
      author: input.author,
      occurred_at: input.occurredAt,
      attention: input.attention,
      material: input.material ? {
        ...input.material,
      } : undefined,
    }));
    return { item: this.projectLegacyItem(input.source.board_id, result.item), created: result.created };
  }

  upsertImportedItem(input: ImportedFeedItemInput): FeedItemRecord {
    return toLegacyFeedItem(this.callFeed(() => this.feedItems.commands.upsertImportedItem(input)));
  }

  upsertMaterial(material: FeedMaterialRecord): FeedMaterialRecord {
    return toLegacyFeedMaterial(this.callFeed(() => this.feedItems.commands.upsertMaterial({
      project_id: material.board_id,
      material_id: material.material_id,
      item_id: material.item_id,
      canonical_url: material.canonical_url,
      title: material.title,
      source_name: material.source_name,
      published_at: material.published_at,
      preview: material.preview,
      content_hash: material.content_hash,
      content_ref: material.content_ref,
      content_available: material.content_available,
      content_type: material.content_type,
      character_count: material.character_count,
      captured_at: material.captured_at,
      provenance: material.provenance,
      selected_for_context: material.selected_for_context,
      imported_at: material.imported_at,
      updated_at: material.updated_at,
    })));
  }

  putImportReceipt(receipt: FeedImportReceiptRecord): void {
    this.db.prepare(`
      INSERT INTO feed_import_receipts (
        board_id, receipt_id, source_fingerprint, summary_json,
        credentials_status, content_status, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(board_id, receipt_id) DO UPDATE SET
        source_fingerprint = excluded.source_fingerprint,
        summary_json = excluded.summary_json,
        credentials_status = excluded.credentials_status,
        content_status = excluded.content_status,
        completed_at = excluded.completed_at
    `).run(
      receipt.board_id,
      receipt.receipt_id,
      receipt.source_fingerprint,
      JSON.stringify(receipt.summary),
      receipt.credentials_status,
      receipt.content_status,
      receipt.completed_at,
    );
  }

  setDisposition(
    boardId: string,
    itemId: string,
    disposition: FeedItemDisposition,
    expectedRevision?: number,
  ): FeedItemRecord {
    const item = this.callFeed(
      () => this.feedItems.commands.setDisposition(boardId, itemId, disposition, expectedRevision),
    );
    return this.projectLegacyItem(boardId, item);
  }

  restoreToFeed(boardId: string, itemId: string, expectedRevision?: number): FeedItemRecord {
    return toLegacyFeedItem(this.callFeed(
      () => this.feedItems.commands.restore(boardId, itemId, expectedRevision),
    ));
  }

  markRead(boardId: string, itemId: string): FeedItemRecord {
    const projected = this.getItem(boardId, itemId);
    return this.projectLegacyItem(boardId, this.callFeed(
      () => this.feedItems.commands.markRead(boardId, itemId, projected.item_type),
    ));
  }

  linkGoal(
    boardId: string,
    itemId: string,
    goalId: string,
    disposition: "promoted" | "processing",
  ): FeedItemRecord {
    const item = this.callFeed(
      () => this.feedItems.commands.linkGoal(boardId, itemId, goalId, disposition),
    );
    return this.projectLegacyItem(boardId, item);
  }

  private compatibleSource(source: SourceRecord): FeedSourceRecord {
    const checkpoint = readListenerCheckpoint(this.db, source.project_id, source.source_id, source.updated_at);
    return {
      board_id: source.project_id,
      source_id: source.source_id,
      kind: source.kind,
      definition_id: source.definition_id,
      sync_kind: source.sync_kind,
      name: source.name,
      description: source.description,
      status: source.status,
      enabled: source.enabled,
      item_count: this.feedItems.query.countBySource(source.project_id, source.source_id),
      origin: source.origin,
      config: source.config,
      schedule: source.schedule,
      cursor: checkpoint.cursor,
      credential_ref: source.connection_ref,
      account_label: source.account_label,
      last_sync_at: source.last_sync_at,
      last_outcome: source.last_outcome,
      last_error_code: source.last_error_code,
      imported_at: source.imported_at,
      updated_at: source.updated_at,
    };
  }

  private projectLegacyItem(boardId: string, item: ModuleFeedItemRecord): FeedItemRecord {
    const inbox = this.attention.query.findActiveForSubject(boardId, "feed_item", item.item_id);
    const legacy = toLegacyFeedItem(item);
    return inbox ? { ...legacy, item_type: "inbox_message" } : legacy;
  }

  private callFeed<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      if (error instanceof FeedError) {
        throw new FeedStoreError(error.code, error.message);
      }
      throw error;
    }
  }

  private callAttention<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      if (error instanceof AttentionError) {
        const code = error.code === "attention_entry_not_found"
          ? "inbox_entry_not_found"
          : error.code === "attention_revision_conflict"
            ? "feed_revision_conflict"
            : "feed_invalid_transition";
        throw new FeedStoreError(code, error.message);
      }
      throw error;
    }
  }

  private appendLegacyEvent(
    boardId: string,
    objectType: string,
    objectId: string,
    type: string,
    reason: string,
    payload: Record<string, unknown>,
    at: string,
  ): void {
    this.db.prepare(`
      INSERT INTO events (
        event_id, board_id, actor_id, type, object_type, object_id, reason, payload_json, at
      ) VALUES (?, ?, 'web-user', ?, ?, ?, ?, ?, ?)
    `).run(
      `event-${randomUUID()}`,
      boardId,
      type,
      objectType,
      objectId,
      reason,
      JSON.stringify(payload),
      at,
    );
  }
}

export function sourceDeletedAt(source: FeedSourceRecord): string | null {
  return moduleSourceDeletedAt({ config: source.config });
}

function toLegacyAttentionEntry(entry: ModuleAttentionEntryRecord): InboxEntryRecord {
  return {
    board_id: entry.project_id,
    entry_id: entry.entry_id,
    subject_type: entry.subject_type,
    subject_id: entry.subject_id,
    reason: entry.reason,
    status: entry.status,
    detail: entry.detail,
    revision: entry.revision,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
    completed_at: entry.completed_at,
  };
}

function toLegacyFeedMaterial(material: ModuleFeedMaterialRecord): FeedMaterialRecord {
  return {
    board_id: material.project_id,
    material_id: material.material_id,
    item_id: material.item_id,
    canonical_url: material.canonical_url,
    title: material.title,
    source_name: material.source_name,
    published_at: material.published_at,
    preview: material.preview,
    content_hash: material.content_hash,
    content_ref: material.content_ref,
    content_available: material.content_available,
    content_type: material.content_type,
    character_count: material.character_count,
    captured_at: material.captured_at,
    provenance: material.provenance,
    selected_for_context: material.selected_for_context,
    imported_at: material.imported_at,
    updated_at: material.updated_at,
  };
}

function toLegacyFeedItem(item: ModuleFeedItemRecord): FeedItemRecord {
  return {
    board_id: item.project_id,
    item_id: item.item_id,
    source_id: item.source_id,
    item_type: "feed",
    kind: item.kind,
    title: item.title,
    summary: item.summary,
    body: item.body,
    source_kind: item.source_kind,
    source_label: item.source_label,
    external_id: item.external_id,
    url: item.url,
    origin_status: item.origin_status,
    priority: item.priority,
    tags: item.tags,
    author: item.author,
    disposition: item.disposition,
    linked_goal_id: item.linked_goal_id,
    read_at: item.read_at,
    revision: item.revision,
    source_created_at: item.source_created_at,
    source_updated_at: item.source_updated_at,
    imported_at: item.imported_at,
    updated_at: item.updated_at,
    materials: item.materials.map(toLegacyFeedMaterial),
  };
}

function compatibleRun(run: ListenerRunRecord): FeedSourceRunRecord {
  return {
    board_id: run.project_id,
    run_id: run.run_id,
    operation_id: run.operation_id,
    source_id: run.source_id,
    phase: run.phase,
    outcome: run.outcome,
    empty: run.empty,
    error_code: run.error_code,
    receipt: run.connector_receipt,
    created_count: run.created_count,
    deduped_count: run.deduped_count,
    recovery_count: run.recovery_count,
    started_at: run.started_at,
    completed_at: run.completed_at,
    updated_at: run.updated_at,
  };
}

function mapFeedImportReceipt(row: Row): FeedImportReceiptRecord {
  return {
    board_id: text(row.board_id),
    receipt_id: text(row.receipt_id),
    source_fingerprint: text(row.source_fingerprint),
    summary: json<Record<string, unknown>>(row.summary_json, {}),
    credentials_status: text(row.credentials_status) as FeedImportReceiptRecord["credentials_status"],
    content_status: text(row.content_status) as FeedImportReceiptRecord["content_status"],
    completed_at: text(row.completed_at),
  };
}

function mapFeedContractMigrationReceipt(row: Row): FeedContractMigrationReceiptRecord {
  return {
    receipt_id: text(row.receipt_id),
    schema_version: Number(row.schema_version ?? 0),
    preflight: json<Record<string, number>>(row.preflight_json, {}),
    postflight: json<Record<string, number>>(row.postflight_json, {}),
    rollback_strategy: "sqlite_immediate_transaction",
    applied_at: text(row.applied_at),
  };
}

function isActiveAttention(status: InboxEntryStatus): boolean {
  return status === "open" || status === "in_progress";
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function json<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export type { InfoflowContractMigrationReport };

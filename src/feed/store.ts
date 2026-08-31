import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

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
import {
  assertFeedSourceSchedule,
  assertInboxEntryReference,
  assertInboxEntryShape,
  assertInboxEntryTransition,
  assertSourceStatusTransition,
  assertSourceHistoryDecision,
  assertSyncRunPhaseTransition,
  INFOFLOW_SCHEMA_MIGRATION_ID,
} from "./contract.js";

type Row = Record<string, unknown>;

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function optionalText(value: unknown): string | null {
  const valueText = text(value);
  return valueText || null;
}

function json<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

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

export function migrateFeedTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS feed_sources (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      source_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      definition_id TEXT,
      sync_kind TEXT NOT NULL DEFAULT 'manual' CHECK (sync_kind IN ('public_source', 'github', 'gmail', 'manual')),
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      item_count INTEGER NOT NULL DEFAULT 0,
      origin TEXT NOT NULL CHECK (origin IN ('relay', 'goalboard')),
      config_json TEXT NOT NULL DEFAULT '{}',
      schedule_json TEXT NOT NULL DEFAULT '{"mode":"manual"}',
      cursor_json TEXT NOT NULL DEFAULT '{}',
      credential_ref TEXT,
      account_label TEXT,
      last_sync_at TEXT,
      last_outcome TEXT,
      last_error_code TEXT,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (board_id, source_id)
    );
    CREATE INDEX IF NOT EXISTS feed_sources_board_updated_idx
      ON feed_sources(board_id, updated_at DESC, source_id);

    CREATE TABLE IF NOT EXISTS feed_items (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      item_id TEXT NOT NULL,
      source_id TEXT,
      item_type TEXT NOT NULL CHECK (item_type IN ('inbox_message', 'feed')),
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      body TEXT,
      source_kind TEXT NOT NULL,
      source_label TEXT NOT NULL,
      external_id TEXT,
      url TEXT,
      origin_status TEXT NOT NULL,
      priority TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      author TEXT,
      disposition TEXT NOT NULL CHECK (disposition IN ('inbox', 'saved', 'promoted', 'processing', 'archived')),
      linked_goal_id TEXT,
      read_at TEXT,
      revision INTEGER NOT NULL DEFAULT 1,
      source_created_at TEXT NOT NULL,
      source_updated_at TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (board_id, item_id)
    );
    CREATE INDEX IF NOT EXISTS feed_items_board_type_updated_idx
      ON feed_items(board_id, item_type, disposition, source_updated_at DESC);
    CREATE INDEX IF NOT EXISTS feed_items_board_goal_idx
      ON feed_items(board_id, linked_goal_id);
    CREATE UNIQUE INDEX IF NOT EXISTS feed_items_board_source_external_idx
      ON feed_items(board_id, source_id, external_id)
      WHERE source_id IS NOT NULL AND external_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS feed_materials (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      material_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      canonical_url TEXT,
      title TEXT NOT NULL,
      source_name TEXT NOT NULL,
      published_at TEXT,
      preview TEXT NOT NULL DEFAULT '',
      content_hash TEXT,
      content_ref TEXT,
      content_available INTEGER NOT NULL DEFAULT 0,
      content_type TEXT,
      character_count INTEGER,
      captured_at TEXT,
      provenance_json TEXT NOT NULL DEFAULT '{}',
      selected_for_context INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (board_id, material_id),
      FOREIGN KEY (board_id, item_id) REFERENCES feed_items(board_id, item_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS feed_materials_board_item_idx
      ON feed_materials(board_id, item_id, updated_at DESC, material_id);

    CREATE TABLE IF NOT EXISTS feed_source_runs (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      run_id TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      phase TEXT NOT NULL CHECK (phase IN ('running', 'terminal', 'interrupted')),
      outcome TEXT,
      empty INTEGER NOT NULL DEFAULT 0,
      error_code TEXT,
      receipt_json TEXT,
      created_count INTEGER NOT NULL DEFAULT 0,
      deduped_count INTEGER NOT NULL DEFAULT 0,
      recovery_count INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (board_id, run_id),
      UNIQUE (board_id, operation_id),
      FOREIGN KEY (board_id, source_id) REFERENCES feed_sources(board_id, source_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS feed_source_runs_board_source_idx
      ON feed_source_runs(board_id, source_id, started_at DESC);

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

    CREATE TABLE IF NOT EXISTS inbox_entries (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL,
      subject_type TEXT NOT NULL CHECK (subject_type IN ('feed_item', 'goal_decision', 'source_fault')),
      subject_id TEXT NOT NULL,
      reason TEXT NOT NULL CHECK (reason IN ('manual', 'source_rule', 'goal_decision', 'source_fault')),
      status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'done', 'dismissed')),
      detail_json TEXT NOT NULL DEFAULT '{}',
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      PRIMARY KEY (board_id, entry_id),
      UNIQUE (board_id, subject_type, subject_id, reason)
    );
    CREATE INDEX IF NOT EXISTS inbox_entries_board_status_idx
      ON inbox_entries(board_id, status, updated_at DESC, entry_id);
    CREATE INDEX IF NOT EXISTS inbox_entries_board_subject_idx
      ON inbox_entries(board_id, subject_type, subject_id);

    CREATE TABLE IF NOT EXISTS feed_contract_migration_receipts (
      receipt_id TEXT PRIMARY KEY,
      schema_version INTEGER NOT NULL,
      preflight_json TEXT NOT NULL,
      postflight_json TEXT NOT NULL,
      rollback_strategy TEXT NOT NULL CHECK (rollback_strategy = 'sqlite_immediate_transaction'),
      applied_at TEXT NOT NULL
    );
  `);
  ensureColumn(db, "feed_sources", "definition_id", "TEXT");
  ensureColumn(db, "feed_sources", "sync_kind", "TEXT NOT NULL DEFAULT 'manual'");
  ensureColumn(db, "feed_sources", "config_json", "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, "feed_sources", "schedule_json", "TEXT NOT NULL DEFAULT '{\"mode\":\"manual\"}'");
  ensureColumn(db, "feed_sources", "cursor_json", "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, "feed_sources", "credential_ref", "TEXT");
  ensureColumn(db, "feed_sources", "account_label", "TEXT");
  ensureColumn(db, "feed_materials", "content_ref", "TEXT");
  ensureColumn(db, "feed_materials", "content_available", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "feed_materials", "content_type", "TEXT");
  ensureColumn(db, "feed_materials", "character_count", "INTEGER");
  ensureColumn(db, "feed_materials", "captured_at", "TEXT");
  ensureColumn(db, "feed_items", "read_at", "TEXT");
}

function ensureColumn(
  db: Database.Database,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export interface InfoflowContractMigrationReport {
  receipt_id: string;
  schema_version: number;
  preflight: {
    feed_items: number;
    legacy_inbox_messages: number;
    inbox_entries: number;
  };
  postflight: {
    feed_items: number;
    legacy_inbox_messages: number;
    inbox_entries: number;
    orphan_feed_item_entries: number;
  };
  rollback_strategy: "sqlite_immediate_transaction";
  applied_at: string;
}

function scalarCount(db: Database.Database, sql: string): number {
  return Number((db.prepare(sql).get() as { count: number }).count);
}

/**
 * Migration 29 separates external message facts from human-attention state.
 * The caller must run this function in the same immediate transaction that
 * writes schema_migrations=29, so any failed reconciliation restores the
 * pre-migration schema and data together.
 */
export function migrateInfoflowContractV2(db: Database.Database): InfoflowContractMigrationReport {
  migrateFeedTables(db);
  const legacyRows = db.prepare(`
    SELECT board_id, item_id, source_kind, disposition, imported_at, updated_at
    FROM feed_items
    WHERE item_type = 'inbox_message'
    ORDER BY board_id, item_id
  `).all() as Array<{
    board_id: string;
    item_id: string;
    source_kind: string;
    disposition: string;
    imported_at: string;
    updated_at: string;
  }>;
  const preflight = {
    feed_items: scalarCount(db, "SELECT COUNT(*) AS count FROM feed_items"),
    legacy_inbox_messages: legacyRows.length,
    inbox_entries: scalarCount(db, "SELECT COUNT(*) AS count FROM inbox_entries"),
  };
  const insertInbox = db.prepare(`
    INSERT OR IGNORE INTO inbox_entries (
      board_id, entry_id, subject_type, subject_id, reason, status,
      detail_json, revision, created_at, updated_at, completed_at
    ) VALUES (?, ?, 'feed_item', ?, ?, ?, ?, 1, ?, ?, ?)
  `);
  for (const row of legacyRows) {
    const reason: InboxEntryReason = row.source_kind === "github" || row.source_kind === "gmail"
      ? "source_rule"
      : "manual";
    const status: InboxEntryStatus = row.disposition === "processing"
      ? "in_progress"
      : row.disposition === "archived"
        ? "dismissed"
        : row.disposition === "saved" || row.disposition === "promoted"
          ? "done"
          : "open";
    insertInbox.run(
      row.board_id,
      `inboxentry-legacy-${row.item_id}`,
      row.item_id,
      reason,
      status,
      JSON.stringify({ migrated_from: "feed_items.item_type", migration_id: INFOFLOW_SCHEMA_MIGRATION_ID }),
      row.imported_at,
      row.updated_at,
      status === "done" || status === "dismissed" ? row.updated_at : null,
    );
  }
  db.prepare("UPDATE feed_items SET item_type = 'feed' WHERE item_type = 'inbox_message'").run();
  db.exec("DROP INDEX IF EXISTS feed_items_board_external_idx");
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS feed_items_board_source_external_idx
    ON feed_items(board_id, source_id, external_id)
    WHERE source_id IS NOT NULL AND external_id IS NOT NULL
  `);

  for (const row of legacyRows) {
    const mapped = db.prepare(`
      SELECT 1 FROM inbox_entries
      WHERE board_id = ? AND subject_type = 'feed_item' AND subject_id = ?
      LIMIT 1
    `).get(row.board_id, row.item_id);
    if (!mapped) throw new Error(`feed_contract_migration_missing_inbox_reference:${row.item_id}`);
  }
  const postflight = {
    feed_items: scalarCount(db, "SELECT COUNT(*) AS count FROM feed_items"),
    legacy_inbox_messages: scalarCount(db, "SELECT COUNT(*) AS count FROM feed_items WHERE item_type = 'inbox_message'"),
    inbox_entries: scalarCount(db, "SELECT COUNT(*) AS count FROM inbox_entries"),
    orphan_feed_item_entries: scalarCount(db, `
      SELECT COUNT(*) AS count
      FROM inbox_entries AS inbox
      LEFT JOIN feed_items AS item
        ON item.board_id = inbox.board_id AND item.item_id = inbox.subject_id
      WHERE inbox.subject_type = 'feed_item' AND item.item_id IS NULL
    `),
  };
  if (postflight.feed_items !== preflight.feed_items) {
    throw new Error("feed_contract_migration_item_count_mismatch");
  }
  if (postflight.legacy_inbox_messages !== 0) {
    throw new Error("feed_contract_migration_legacy_rows_remain");
  }
  if (postflight.orphan_feed_item_entries !== 0) {
    throw new Error("feed_contract_migration_orphan_inbox_reference");
  }
  const report: InfoflowContractMigrationReport = {
    receipt_id: "infoflow-contract-v1",
    schema_version: INFOFLOW_SCHEMA_MIGRATION_ID,
    preflight,
    postflight,
    rollback_strategy: "sqlite_immediate_transaction",
    applied_at: new Date().toISOString(),
  };
  db.prepare(`
    INSERT INTO feed_contract_migration_receipts (
      receipt_id, schema_version, preflight_json, postflight_json,
      rollback_strategy, applied_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(receipt_id) DO UPDATE SET
      schema_version = excluded.schema_version,
      preflight_json = excluded.preflight_json,
      postflight_json = excluded.postflight_json,
      rollback_strategy = excluded.rollback_strategy,
      applied_at = excluded.applied_at
  `).run(
    report.receipt_id,
    report.schema_version,
    JSON.stringify(report.preflight),
    JSON.stringify(report.postflight),
    report.rollback_strategy,
    report.applied_at,
  );
  return report;
}

export class FeedStore {
  constructor(readonly db: Database.Database) {}

  snapshot(boardId: string): FeedSnapshot {
    const sources = (this.db.prepare(
      "SELECT * FROM feed_sources WHERE board_id = ? ORDER BY updated_at DESC, name COLLATE NOCASE, source_id",
    ).all(boardId) as Row[]).map(mapFeedSource).filter((source) => !sourceDeletedAt(source));
    const materials = (this.db.prepare(
      "SELECT * FROM feed_materials WHERE board_id = ? ORDER BY updated_at DESC, material_id",
    ).all(boardId) as Row[]).map(mapFeedMaterial);
    const materialsByItem = new Map<string, FeedMaterialRecord[]>();
    for (const material of materials) {
      materialsByItem.set(material.item_id, [
        ...(materialsByItem.get(material.item_id) ?? []),
        material,
      ]);
    }
    const itemRows = this.db.prepare(
      "SELECT * FROM feed_items WHERE board_id = ? ORDER BY source_updated_at DESC, item_id",
    ).all(boardId) as Row[];
    const feedItems = itemRows.map((row) => ({
      ...mapFeedItem(row, materialsByItem.get(text(row.item_id)) ?? []),
      item_type: "feed" as const,
    }));
    const inboxEntries = (this.db.prepare(
      "SELECT * FROM inbox_entries WHERE board_id = ? ORDER BY updated_at DESC, entry_id",
    ).all(boardId) as Row[]).map(mapInboxEntry);
    const activeInboxSubjects = new Set(inboxEntries
      .filter((entry) => entry.subject_type === "feed_item" && (entry.status === "open" || entry.status === "in_progress"))
      .map((entry) => entry.subject_id));
    const legacyInboxSubjects = new Set(itemRows
      .filter((row) => text(row.item_type) === "inbox_message")
      .map((row) => text(row.item_id)));
    const items = feedItems.map((item) => activeInboxSubjects.has(item.item_id) || legacyInboxSubjects.has(item.item_id)
      ? { ...item, item_type: "inbox_message" as const }
      : item);
    const runs = (this.db.prepare(
      "SELECT * FROM feed_source_runs WHERE board_id = ? ORDER BY started_at DESC, run_id",
    ).all(boardId) as Row[]).map(mapFeedSourceRun);
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
    const item = this.getFeedItem(boardId, itemId);
    const activeInbox = this.db.prepare(`
      SELECT 1 FROM inbox_entries
      WHERE board_id = ? AND subject_type = 'feed_item' AND subject_id = ?
        AND status IN ('open', 'in_progress')
      LIMIT 1
    `).get(boardId, itemId);
    const legacyInbox = this.db.prepare(
      "SELECT 1 FROM feed_items WHERE board_id = ? AND item_id = ? AND item_type = 'inbox_message'",
    ).get(boardId, itemId);
    return activeInbox || legacyInbox ? { ...item, item_type: "inbox_message" } : item;
  }

  getFeedItem(boardId: string, itemId: string): FeedItemRecord {
    const row = this.db.prepare(
      "SELECT * FROM feed_items WHERE board_id = ? AND item_id = ?",
    ).get(boardId, itemId) as Row | undefined;
    if (!row) throw new FeedStoreError("feed_item_not_found", "找不到这个 Feed Item");
    const materials = (this.db.prepare(
      "SELECT * FROM feed_materials WHERE board_id = ? AND item_id = ? ORDER BY updated_at DESC, material_id",
    ).all(boardId, itemId) as Row[]).map(mapFeedMaterial);
    return { ...mapFeedItem(row, materials), item_type: "feed" };
  }

  listInboxEntries(boardId: string): InboxEntryRecord[] {
    return (this.db.prepare(
      "SELECT * FROM inbox_entries WHERE board_id = ? ORDER BY updated_at DESC, entry_id",
    ).all(boardId) as Row[]).map(mapInboxEntry);
  }

  getInboxEntry(boardId: string, entryId: string): InboxEntryRecord {
    const row = this.db.prepare(
      "SELECT * FROM inbox_entries WHERE board_id = ? AND entry_id = ?",
    ).get(boardId, entryId) as Row | undefined;
    if (!row) throw new FeedStoreError("inbox_entry_not_found", "找不到这个 Inbox Entry");
    return mapInboxEntry(row);
  }

  private activeInboxEntryForFeedItem(boardId: string, itemId: string): InboxEntryRecord | null {
    const row = this.db.prepare(`
      SELECT * FROM inbox_entries
      WHERE board_id = ? AND subject_type = 'feed_item' AND subject_id = ?
        AND status IN ('open', 'in_progress')
      ORDER BY CASE reason WHEN 'manual' THEN 0 ELSE 1 END, updated_at DESC, entry_id
      LIMIT 1
    `).get(boardId, itemId) as Row | undefined;
    return row ? mapInboxEntry(row) : null;
  }

  getSource(boardId: string, sourceId: string): FeedSourceRecord {
    const row = this.db.prepare(
      "SELECT * FROM feed_sources WHERE board_id = ? AND source_id = ?",
    ).get(boardId, sourceId) as Row | undefined;
    if (!row) throw new FeedStoreError("feed_source_not_found", "找不到这个来源");
    return mapFeedSource(row);
  }

  findSource(
    boardId: string,
    syncKind: FeedSourceRecord["sync_kind"],
    definitionId: string | null,
    configFingerprint?: string,
  ): FeedSourceRecord | null {
    const rows = this.db.prepare(
      "SELECT * FROM feed_sources WHERE board_id = ? AND sync_kind = ?",
    ).all(boardId, syncKind) as Row[];
    return rows.map(mapFeedSource).filter((source) => !sourceDeletedAt(source)).find((source) => {
      if (definitionId !== null && source.definition_id !== definitionId) return false;
      return configFingerprint == null || source.config.config_fingerprint === configFingerprint;
    }) ?? null;
  }

  upsertSource(source: FeedSourceRecord): FeedSourceRecord {
    assertFeedSourceSchedule(source.schedule);
    const current = this.db.prepare(
      "SELECT status FROM feed_sources WHERE board_id = ? AND source_id = ?",
    ).get(source.board_id, source.source_id) as { status: FeedSourceRecord["status"] } | undefined;
    if (current) assertSourceStatusTransition(current.status, source.status);
    this.db.prepare(`
      INSERT INTO feed_sources (
        board_id, source_id, kind, definition_id, sync_kind, name, description,
        status, enabled, item_count, origin, config_json, schedule_json, cursor_json,
        credential_ref, account_label, last_sync_at, last_outcome,
        last_error_code, imported_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(board_id, source_id) DO UPDATE SET
        kind = excluded.kind,
        definition_id = excluded.definition_id,
        sync_kind = excluded.sync_kind,
        name = excluded.name,
        description = excluded.description,
        status = excluded.status,
        enabled = excluded.enabled,
        item_count = excluded.item_count,
        origin = excluded.origin,
        config_json = excluded.config_json,
        schedule_json = excluded.schedule_json,
        cursor_json = excluded.cursor_json,
        credential_ref = excluded.credential_ref,
        account_label = excluded.account_label,
        last_sync_at = excluded.last_sync_at,
        last_outcome = excluded.last_outcome,
        last_error_code = excluded.last_error_code,
        updated_at = excluded.updated_at
    `).run(
      source.board_id,
      source.source_id,
      source.kind,
      source.definition_id,
      source.sync_kind,
      source.name,
      source.description,
      source.status,
      source.enabled ? 1 : 0,
      source.item_count,
      source.origin,
      JSON.stringify(source.config),
      JSON.stringify(source.schedule),
      JSON.stringify(source.cursor ?? {}),
      source.credential_ref,
      source.account_label,
      source.last_sync_at,
      source.last_outcome,
      source.last_error_code,
      source.imported_at,
      source.updated_at,
    );
    return this.getSource(source.board_id, source.source_id);
  }

  setSourceEnabled(boardId: string, sourceId: string, enabled: boolean): FeedSourceRecord {
    const source = this.getSource(boardId, sourceId);
    if (sourceDeletedAt(source)) throw new FeedStoreError("feed_source_not_found", "找不到这个来源");
    const now = new Date().toISOString();
    return this.upsertSource({
      ...source,
      enabled,
      status: enabled ? "active" : "paused",
      updated_at: now,
    });
  }

  retireSource(
    boardId: string,
    sourceId: string,
    historyDecision: SourceHistoryDecision,
  ): FeedSourceRecord {
    assertSourceHistoryDecision(historyDecision);
    return this.db.transaction(() => {
      const source = this.getSource(boardId, sourceId);
      if (sourceDeletedAt(source)) return source;
      const now = new Date().toISOString();
      if (historyDecision === "delete_local_history") {
        const itemIds = (this.db.prepare(
          "SELECT item_id FROM feed_items WHERE board_id = ? AND source_id = ?",
        ).all(boardId, sourceId) as Array<{ item_id: string }>).map((row) => row.item_id);
        if (itemIds.length) {
          const removeInbox = this.db.prepare(
            "DELETE FROM inbox_entries WHERE board_id = ? AND subject_type = 'feed_item' AND subject_id = ?",
          );
          for (const itemId of itemIds) removeInbox.run(boardId, itemId);
        }
        this.db.prepare(
          "DELETE FROM inbox_entries WHERE board_id = ? AND subject_type = 'source_fault' AND subject_id = ?",
        ).run(boardId, sourceId);
        this.db.prepare("DELETE FROM feed_items WHERE board_id = ? AND source_id = ?")
          .run(boardId, sourceId);
        this.db.prepare("DELETE FROM feed_source_runs WHERE board_id = ? AND source_id = ?")
          .run(boardId, sourceId);
      }
      const lifecycle = {
        deleted_at: now,
        history_decision: historyDecision,
      };
      const retired = this.upsertSource({
        ...source,
        status: "disconnected",
        enabled: false,
        item_count: historyDecision === "delete_local_history" ? 0 : source.item_count,
        config: {
          ...source.config,
          token_refs: undefined,
          _goalboard_lifecycle: lifecycle,
        },
        schedule: { mode: "manual" },
        cursor: historyDecision === "delete_local_history" ? {} : source.cursor,
        credential_ref: null,
        last_error_code: null,
        updated_at: now,
      });
      this.appendEvent(
        boardId,
        sourceId,
        "feed_source.deleted",
        historyDecision === "delete_local_history" ? "来源及本地历史已删除" : "来源已删除，本地历史保留",
        { history_decision: historyDecision },
        "feed_source",
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
    assertInboxEntryReference(input.subjectType, input.subjectId);
    if (input.subjectType === "feed_item") {
      this.getFeedItem(input.boardId, input.subjectId);
      if (input.reason !== "manual" && input.reason !== "source_rule") {
        throw new FeedStoreError("feed_invalid_transition", "Feed Item 只能由手工标记或来源规则进入 Inbox");
      }
    } else if (input.subjectType === "source_fault") {
      this.getSource(input.boardId, input.subjectId);
      if (input.reason !== "source_fault") {
        throw new FeedStoreError("feed_invalid_transition", "来源故障必须使用 source_fault 原因");
      }
    } else {
      const goal = this.db.prepare(
        "SELECT 1 FROM goals WHERE board_id = ? AND goal_id = ?",
      ).get(input.boardId, input.subjectId);
      if (!goal || input.reason !== "goal_decision") {
        throw new FeedStoreError("feed_invalid_transition", "Goal 决定必须引用当前项目内的 Goal");
      }
    }
    const existing = this.db.prepare(`
      SELECT * FROM inbox_entries
      WHERE board_id = ? AND subject_type = ? AND subject_id = ? AND reason = ?
    `).get(input.boardId, input.subjectType, input.subjectId, input.reason) as Row | undefined;
    if (existing) return { entry: mapInboxEntry(existing), created: false };
    const at = input.at ?? new Date().toISOString();
    const entry: InboxEntryRecord = {
      board_id: input.boardId,
      entry_id: input.entryId ?? `inboxentry-${randomUUID()}`,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      reason: input.reason,
      status: "open",
      detail: input.detail ?? {},
      revision: 1,
      created_at: at,
      updated_at: at,
      completed_at: null,
    };
    assertInboxEntryShape(entry);
    this.db.prepare(`
      INSERT INTO inbox_entries (
        board_id, entry_id, subject_type, subject_id, reason, status,
        detail_json, revision, created_at, updated_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.board_id,
      entry.entry_id,
      entry.subject_type,
      entry.subject_id,
      entry.reason,
      entry.status,
      JSON.stringify(entry.detail),
      entry.revision,
      entry.created_at,
      entry.updated_at,
      entry.completed_at,
    );
    this.appendEvent(
      input.boardId,
      entry.entry_id,
      "inbox_entry.created",
      "对象已加入 Inbox",
      { subject_type: entry.subject_type, subject_id: entry.subject_id, reason: entry.reason },
      "inbox_entry",
    );
    return { entry, created: true };
  }

  ensureInboxEntryForFeedItem(
    boardId: string,
    itemId: string,
    reason: Extract<InboxEntryReason, "manual" | "source_rule">,
    detail: Record<string, unknown> = {},
  ): { entry: InboxEntryRecord; created: boolean } {
    return this.createInboxEntry({
      boardId,
      subjectType: "feed_item",
      subjectId: itemId,
      reason,
      detail,
    });
  }

  setInboxEntryStatus(
    boardId: string,
    entryId: string,
    status: InboxEntryStatus,
    expectedRevision?: number,
  ): InboxEntryRecord {
    return this.db.transaction(() => {
      const current = this.getInboxEntry(boardId, entryId);
      if (expectedRevision != null && current.revision !== expectedRevision) {
        throw new FeedStoreError("feed_revision_conflict", "这条 Inbox Entry 已经变化，请刷新后重试");
      }
      assertInboxEntryTransition(current.status, status);
      if (current.status === status) return current;
      const now = new Date().toISOString();
      const completedAt = status === "done" || status === "dismissed" ? now : null;
      this.db.prepare(`
        UPDATE inbox_entries
        SET status = ?, revision = revision + 1, updated_at = ?, completed_at = ?
        WHERE board_id = ? AND entry_id = ?
      `).run(status, now, completedAt, boardId, entryId);
      this.appendEvent(
        boardId,
        entryId,
        `inbox_entry.${status}`,
        `Inbox Entry 已标记为 ${status}`,
        { subject_type: current.subject_type, subject_id: current.subject_id },
        "inbox_entry",
      );
      return this.getInboxEntry(boardId, entryId);
    }).immediate();
  }

  getSourceRunByOperationId(boardId: string, operationId: string): FeedSourceRunRecord | null {
    const row = this.db.prepare(
      "SELECT * FROM feed_source_runs WHERE board_id = ? AND operation_id = ?",
    ).get(boardId, operationId) as Row | undefined;
    return row ? mapFeedSourceRun(row) : null;
  }

  upsertSourceRun(run: FeedSourceRunRecord): FeedSourceRunRecord {
    const current = this.getSourceRunByOperationId(run.board_id, run.operation_id);
    if (current) assertSyncRunPhaseTransition(current.phase, run.phase);
    this.db.prepare(`
      INSERT INTO feed_source_runs (
        board_id, run_id, operation_id, source_id, phase, outcome, empty,
        error_code, receipt_json, created_count, deduped_count, recovery_count,
        started_at, completed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(board_id, run_id) DO UPDATE SET
        phase = excluded.phase,
        outcome = excluded.outcome,
        empty = excluded.empty,
        error_code = excluded.error_code,
        receipt_json = excluded.receipt_json,
        created_count = excluded.created_count,
        deduped_count = excluded.deduped_count,
        recovery_count = excluded.recovery_count,
        completed_at = excluded.completed_at,
        updated_at = excluded.updated_at
    `).run(
      run.board_id,
      run.run_id,
      run.operation_id,
      run.source_id,
      run.phase,
      run.outcome,
      run.empty ? 1 : 0,
      run.error_code,
      run.receipt == null ? null : JSON.stringify(run.receipt),
      run.created_count,
      run.deduped_count,
      run.recovery_count,
      run.started_at,
      run.completed_at,
      run.updated_at,
    );
    return this.getSourceRunByOperationId(run.board_id, run.operation_id)!;
  }

  recoverInterruptedSourceRuns(boardId: string): number {
    const now = new Date().toISOString();
    const sources = this.db.prepare(
      "SELECT DISTINCT source_id FROM feed_source_runs WHERE board_id = ? AND phase = 'running'",
    ).all(boardId) as Array<{ source_id: string }>;
    const result = this.db.prepare(`
      UPDATE feed_source_runs
      SET phase = 'interrupted', error_code = 'process_interrupted', updated_at = ?
      WHERE board_id = ? AND phase = 'running'
    `).run(now, boardId);
    const updateSource = this.db.prepare(`
      UPDATE feed_sources
      SET status = CASE WHEN enabled = 0 THEN 'paused' ELSE 'error' END,
          last_error_code = 'process_interrupted', updated_at = ?
      WHERE board_id = ? AND source_id = ?
    `);
    for (const source of sources) updateSource.run(now, boardId, source.source_id);
    return Number(result.changes);
  }

  ingestItem(input: {
    source: FeedSourceRecord;
    externalId: string;
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
    const existing = this.db.prepare(`
      SELECT item_id FROM feed_items
      WHERE board_id = ? AND source_id = ? AND external_id = ?
    `).get(input.source.board_id, input.source.source_id, input.externalId) as { item_id: string } | undefined;
    const attention = input.attention === false ? null : input.attention ?? null;
    if (existing) {
      if (attention) {
        this.ensureInboxEntryForFeedItem(
          input.source.board_id,
          existing.item_id,
          attention.reason,
          attention.detail,
        );
      }
      return { item: this.getItem(input.source.board_id, existing.item_id), created: false };
    }
    const now = new Date().toISOString();
    const itemId = `feeditem-${randomUUID()}`;
    this.db.prepare(`
      INSERT INTO feed_items (
        board_id, item_id, source_id, item_type, kind, title, summary, body,
        source_kind, source_label, external_id, url, origin_status, priority,
        tags_json, author, disposition, linked_goal_id, revision,
        source_created_at, source_updated_at, imported_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'inbox', ?, ?, ?, 'inbox', NULL, 1, ?, ?, ?, ?)
    `).run(
      input.source.board_id,
      itemId,
      input.source.source_id,
      "feed",
      input.kind ?? "update",
      input.title.trim().slice(0, 300) || "未命名更新",
      input.summary.trim().slice(0, 2_000),
      input.body ?? null,
      input.source.kind,
      input.source.name,
      input.externalId,
      input.url ?? null,
      input.priority ?? "medium",
      JSON.stringify(input.tags ?? [input.source.kind]),
      input.author ?? null,
      input.occurredAt,
      input.occurredAt,
      now,
      now,
    );
    if (input.material) {
      const material = input.material;
      this.db.prepare(`
        INSERT INTO feed_materials (
          board_id, material_id, item_id, canonical_url, title, source_name,
          published_at, preview, content_hash, content_ref, content_available,
          content_type, character_count, captured_at, provenance_json,
          selected_for_context, imported_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.source.board_id,
        material.material_id,
        itemId,
        material.canonical_url,
        material.title,
        material.source_name,
        material.published_at,
        material.preview,
        material.content_hash,
        material.content_ref,
        material.content_available ? 1 : 0,
        material.content_type,
        material.character_count,
        material.captured_at,
        JSON.stringify(material.provenance),
        material.selected_for_context ? 1 : 0,
        now,
        now,
      );
    }
    if (attention) {
      this.ensureInboxEntryForFeedItem(
        input.source.board_id,
        itemId,
        attention.reason,
        attention.detail,
      );
    }
    this.appendEvent(
      input.source.board_id,
      itemId,
      "feed_source.item_ingested",
      `从 ${input.source.name} 导入 Feed Item`,
      { source_id: input.source.source_id },
    );
    return { item: this.getItem(input.source.board_id, itemId), created: true };
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
    return this.db.transaction(() => {
      const current = this.getItem(boardId, itemId);
      if (expectedRevision != null && expectedRevision !== current.revision) {
        throw new FeedStoreError("feed_revision_conflict", "这条 Item 已经变化，请刷新后重试");
      }
      if (current.disposition === disposition) {
        if (disposition === "inbox" && !this.activeInboxEntryForFeedItem(boardId, itemId)) {
          const stored = this.ensureInboxEntryForFeedItem(boardId, itemId, "manual", { added_by: "web_user" });
          if (stored.entry.status === "done" || stored.entry.status === "dismissed") {
            this.setInboxEntryStatus(boardId, stored.entry.entry_id, "open", stored.entry.revision);
          }
          return this.getItem(boardId, itemId);
        }
        return current;
      }
      if (current.disposition === "archived" && disposition !== "inbox") {
        throw new FeedStoreError(
          "feed_invalid_transition",
          current.item_type === "inbox_message"
            ? "请先恢复这条已归档的 Inbox Message"
            : "请先恢复这条已忽略的 Feed Item",
        );
      }
      const now = new Date().toISOString();
      this.db.prepare(`
        UPDATE feed_items
        SET disposition = ?, revision = revision + 1, updated_at = ?
        WHERE board_id = ? AND item_id = ?
      `).run(disposition, now, boardId, itemId);
      if (disposition === "inbox") {
        const stored = this.ensureInboxEntryForFeedItem(boardId, itemId, "manual", { added_by: "web_user" });
        if (stored.entry.status === "done" || stored.entry.status === "dismissed") {
          this.setInboxEntryStatus(boardId, stored.entry.entry_id, "open", stored.entry.revision);
        }
      } else {
        const inbox = this.activeInboxEntryForFeedItem(boardId, itemId);
        if (inbox) {
          const nextStatus: InboxEntryStatus = disposition === "processing"
            ? "in_progress"
            : disposition === "archived"
              ? "dismissed"
              : "done";
          this.setInboxEntryStatus(boardId, inbox.entry_id, nextStatus, inbox.revision);
        }
      }
      this.appendEvent(boardId, itemId, `feed_item.${disposition}`, `Feed Item 已标记为 ${disposition}`);
      return this.getItem(boardId, itemId);
    }).immediate();
  }

  restoreToFeed(
    boardId: string,
    itemId: string,
    expectedRevision?: number,
  ): FeedItemRecord {
    return this.db.transaction(() => {
      const current = this.getFeedItem(boardId, itemId);
      if (expectedRevision != null && expectedRevision !== current.revision) {
        throw new FeedStoreError("feed_revision_conflict", "这条 Item 已经变化，请刷新后重试");
      }
      if (current.disposition !== "archived") return current;
      const now = new Date().toISOString();
      this.db.prepare(`
        UPDATE feed_items
        SET disposition = 'inbox', revision = revision + 1, updated_at = ?
        WHERE board_id = ? AND item_id = ?
      `).run(now, boardId, itemId);
      const inbox = this.activeInboxEntryForFeedItem(boardId, itemId);
      if (inbox) this.setInboxEntryStatus(boardId, inbox.entry_id, "dismissed", inbox.revision);
      this.appendEvent(
        boardId,
        itemId,
        "feed_item.restored",
        "用户把 Feed Item 恢复为仅保留在 Feed",
      );
      return this.getFeedItem(boardId, itemId);
    }).immediate();
  }

  markRead(boardId: string, itemId: string): FeedItemRecord {
    return this.db.transaction(() => {
      const current = this.getItem(boardId, itemId);
      if (current.item_type !== "feed") {
        throw new FeedStoreError(
          "feed_read_not_supported",
          "Inbox Message 使用处理状态，不记录已读状态",
        );
      }
      if (current.read_at) return current;
      const now = new Date().toISOString();
      this.db.prepare(`
        UPDATE feed_items
        SET read_at = ?, updated_at = ?
        WHERE board_id = ? AND item_id = ?
      `).run(now, now, boardId, itemId);
      this.appendEvent(boardId, itemId, "feed_item.read", "用户打开 Feed Item 详情");
      return this.getItem(boardId, itemId);
    }).immediate();
  }

  linkGoal(
    boardId: string,
    itemId: string,
    goalId: string,
    disposition: "promoted" | "processing",
  ): FeedItemRecord {
    return this.db.transaction(() => {
      const current = this.getItem(boardId, itemId);
      if (current.disposition === "archived") {
        throw new FeedStoreError(
          "feed_invalid_transition",
          current.item_type === "inbox_message"
            ? "请先恢复这条已归档的 Inbox Message"
            : "请先恢复这条已忽略的 Feed Item",
        );
      }
      if (current.linked_goal_id === goalId && current.disposition === disposition) return current;
      const now = new Date().toISOString();
      this.db.prepare(`
        UPDATE feed_items
        SET linked_goal_id = ?, disposition = ?, revision = revision + 1, updated_at = ?
        WHERE board_id = ? AND item_id = ?
      `).run(goalId, disposition, now, boardId, itemId);
      const inbox = this.activeInboxEntryForFeedItem(boardId, itemId);
      if (inbox) {
        this.setInboxEntryStatus(
          boardId,
          inbox.entry_id,
          disposition === "processing" ? "in_progress" : "done",
          inbox.revision,
        );
      }
      this.appendEvent(
        boardId,
        itemId,
        disposition === "processing" ? "feed_item.processing_started" : "feed_item.promoted",
        disposition === "processing" ? "用户从 Feed Item 开始处理" : "用户把 Feed Item 升格为 Goal",
        { goal_id: goalId },
      );
      return this.getItem(boardId, itemId);
    }).immediate();
  }

  private appendEvent(
    boardId: string,
    itemId: string,
    type: string,
    reason: string,
    payload: Record<string, unknown> = {},
    objectType = "feed_item",
  ): void {
    this.db.prepare(`
      INSERT INTO events (
        event_id, board_id, actor_id, type, object_type, object_id, reason, payload_json, at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `event-${randomUUID()}`,
      boardId,
      "web-user",
      type,
      objectType,
      itemId,
      reason,
      JSON.stringify(payload),
      new Date().toISOString(),
    );
  }
}

export function sourceDeletedAt(source: FeedSourceRecord): string | null {
  const lifecycle = source.config._goalboard_lifecycle;
  if (!lifecycle || typeof lifecycle !== "object" || Array.isArray(lifecycle)) return null;
  const value = (lifecycle as Record<string, unknown>).deleted_at;
  return typeof value === "string" && value ? value : null;
}

function mapFeedSource(row: Row): FeedSourceRecord {
  const schedule = json<FeedSourceRecord["schedule"]>(row.schedule_json, { mode: "manual" });
  assertFeedSourceSchedule(schedule);
  return {
    board_id: text(row.board_id),
    source_id: text(row.source_id),
    kind: text(row.kind),
    definition_id: optionalText(row.definition_id),
    sync_kind: (text(row.sync_kind) || "manual") as FeedSourceRecord["sync_kind"],
    name: text(row.name),
    description: text(row.description),
    status: text(row.status) as FeedSourceRecord["status"],
    enabled: Number(row.enabled ?? 0) === 1,
    item_count: Number(row.item_count ?? 0),
    origin: text(row.origin) as FeedSourceRecord["origin"],
    config: json<Record<string, unknown>>(row.config_json, {}),
    schedule,
    cursor: json<unknown>(row.cursor_json, {}),
    credential_ref: optionalText(row.credential_ref),
    account_label: optionalText(row.account_label),
    last_sync_at: optionalText(row.last_sync_at),
    last_outcome: optionalText(row.last_outcome),
    last_error_code: optionalText(row.last_error_code),
    imported_at: text(row.imported_at),
    updated_at: text(row.updated_at),
  };
}

function mapInboxEntry(row: Row): InboxEntryRecord {
  const entry: InboxEntryRecord = {
    board_id: text(row.board_id),
    entry_id: text(row.entry_id),
    subject_type: text(row.subject_type) as InboxEntryRecord["subject_type"],
    subject_id: text(row.subject_id),
    reason: text(row.reason) as InboxEntryRecord["reason"],
    status: text(row.status) as InboxEntryRecord["status"],
    detail: json<Record<string, unknown>>(row.detail_json, {}),
    revision: Number(row.revision ?? 0),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
    completed_at: optionalText(row.completed_at),
  };
  assertInboxEntryShape(entry);
  return entry;
}

function mapFeedMaterial(row: Row): FeedMaterialRecord {
  return {
    board_id: text(row.board_id),
    material_id: text(row.material_id),
    item_id: text(row.item_id),
    canonical_url: optionalText(row.canonical_url),
    title: text(row.title),
    source_name: text(row.source_name),
    published_at: optionalText(row.published_at),
    preview: text(row.preview),
    content_hash: optionalText(row.content_hash),
    content_ref: optionalText(row.content_ref),
    content_available: Number(row.content_available ?? 0) === 1,
    content_type: optionalText(row.content_type),
    character_count: row.character_count == null ? null : Number(row.character_count),
    captured_at: optionalText(row.captured_at),
    provenance: json<Record<string, unknown>>(row.provenance_json, {}),
    selected_for_context: Number(row.selected_for_context ?? 0) === 1,
    imported_at: text(row.imported_at),
    updated_at: text(row.updated_at),
  };
}

function mapFeedSourceRun(row: Row): FeedSourceRunRecord {
  return {
    board_id: text(row.board_id),
    run_id: text(row.run_id),
    operation_id: text(row.operation_id),
    source_id: text(row.source_id),
    phase: text(row.phase) as FeedSourceRunRecord["phase"],
    outcome: optionalText(row.outcome),
    empty: Number(row.empty ?? 0) === 1,
    error_code: optionalText(row.error_code),
    receipt: row.receipt_json == null ? null : json<Record<string, unknown>>(row.receipt_json, {}),
    created_count: Number(row.created_count ?? 0),
    deduped_count: Number(row.deduped_count ?? 0),
    recovery_count: Number(row.recovery_count ?? 0),
    started_at: text(row.started_at),
    completed_at: optionalText(row.completed_at),
    updated_at: text(row.updated_at),
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

function mapFeedItem(row: Row, materials: FeedMaterialRecord[]): FeedItemRecord {
  return {
    board_id: text(row.board_id),
    item_id: text(row.item_id),
    source_id: optionalText(row.source_id),
    item_type: text(row.item_type) as FeedItemRecord["item_type"],
    kind: text(row.kind),
    title: text(row.title),
    summary: text(row.summary),
    body: optionalText(row.body),
    source_kind: text(row.source_kind),
    source_label: text(row.source_label),
    external_id: optionalText(row.external_id),
    url: optionalText(row.url),
    origin_status: text(row.origin_status),
    priority: text(row.priority),
    tags: json<string[]>(row.tags_json, []),
    author: optionalText(row.author),
    disposition: text(row.disposition) as FeedItemRecord["disposition"],
    linked_goal_id: optionalText(row.linked_goal_id),
    read_at: optionalText(row.read_at),
    revision: Number(row.revision ?? 0),
    source_created_at: text(row.source_created_at),
    source_updated_at: text(row.source_updated_at),
    imported_at: text(row.imported_at),
    updated_at: text(row.updated_at),
    materials,
  };
}

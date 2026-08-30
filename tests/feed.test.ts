import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import { importRelayData } from "../src/feed/relay-import.js";
import { FeedStore } from "../src/feed/store.js";
import { DEMO_BOARD_ID, seedDemoBoard } from "../src/v1/demo.js";
import { SqliteGoalBoardStore } from "../src/v1/store.js";

function relayFixture(databasePath: string): Database.Database {
  const db = new Database(databasePath);
  db.exec(`
    CREATE TABLE inbox_sources (
      id TEXT PRIMARY KEY, definition_id TEXT, kind TEXT, name TEXT, description TEXT,
      status TEXT, enabled INTEGER, item_count INTEGER, last_sync_at TEXT,
      last_outcome TEXT, last_error_code TEXT, updated_at TEXT
    );
    CREATE TABLE items (
      id TEXT PRIMARY KEY, kind TEXT, title TEXT, summary TEXT, body TEXT, source TEXT,
      source_label TEXT, external_id TEXT, url TEXT, status TEXT, priority TEXT,
      tags_json TEXT, author TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE evidence_refs (
      id TEXT PRIMARY KEY, item_id TEXT, canonical_url TEXT, title TEXT, source_name TEXT,
      published_at TEXT, preview TEXT, content_hash TEXT, provenance_json TEXT,
      selected_for_context INTEGER, last_seen_at TEXT
    );
  `);
  db.prepare(`
    INSERT INTO inbox_sources VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "relay-source-1", "sspai", "rss", "少数派", "公开 RSS", "active", 1, 1,
    "2026-08-29T08:00:00.000Z", "completed", null, "2026-08-29T08:00:00.000Z",
  );
  db.prepare(`
    INSERT INTO items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "relay-item-1", "update", "第一条 Feed", "一个真实摘要", "一段正文", "rss", "少数派",
    "external-1", "https://example.com/item", "inbox", "medium",
    JSON.stringify(["rss", "inbox-source:sspai"]), "作者", "2026-08-29T08:00:00.000Z", "2026-08-29T08:00:00.000Z",
  );
  db.prepare(`
    INSERT INTO evidence_refs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "material-1", "relay-item-1", "https://example.com/material", "来源材料", "少数派",
    "2026-08-29T07:00:00.000Z", "材料预览", "sha256:abc", JSON.stringify({ provider: "rss" }), 1,
    "2026-08-29T08:00:00.000Z",
  );
  return db;
}

test("migration 23 creates Feed runtime tables and persisted read state", () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-feed-schema-"));
  const databasePath = join(directory, "goalboard.sqlite");
  try {
    seedDemoBoard(databasePath);
    const store = new SqliteGoalBoardStore(databasePath);
    try {
      const tables = new Set((store.db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table'",
      ).all() as Array<{ name: string }>).map((row) => row.name));
      assert.ok(tables.has("feed_sources"));
      assert.ok(tables.has("feed_items"));
      assert.ok(tables.has("feed_materials"));
      assert.ok(store.db.prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 21").get());
      assert.ok(store.db.prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 22").get());
      assert.ok(store.db.prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 23").get());
      const feedItemColumns = new Set((store.db.pragma("table_info(feed_items)") as Array<{ name: string }>).map((row) => row.name));
      assert.ok(feedItemColumns.has("read_at"));
      assert.ok(tables.has("feed_source_runs"));
      assert.ok(tables.has("feed_runtime_blobs"));
      assert.ok(tables.has("feed_import_receipts"));
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("opening a Feed item persists read state without invalidating its action revision", () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-feed-read-state-"));
  const goalboardPath = join(directory, "goalboard.sqlite");
  const relayPath = join(directory, "relay.sqlite");
  const relay = relayFixture(relayPath);
  try {
    seedDemoBoard(goalboardPath);
    const store = new SqliteGoalBoardStore(goalboardPath);
    try {
      const feed = new FeedStore(store.db);
      importRelayData(feed, DEMO_BOARD_ID, relayPath);
      const item = feed.getItem(DEMO_BOARD_ID, "relay-item-1");
      assert.equal(item.read_at, null);

      const opened = feed.markRead(DEMO_BOARD_ID, item.item_id);
      assert.ok(opened.read_at);
      assert.equal(opened.revision, item.revision);

      const reopened = feed.markRead(DEMO_BOARD_ID, item.item_id);
      assert.equal(reopened.read_at, opened.read_at);
      assert.equal(feed.snapshot(DEMO_BOARD_ID).items[0]?.read_at, opened.read_at);
      const readEvents = store.db.prepare(`
        SELECT COUNT(*) AS count FROM events
        WHERE board_id = ? AND object_id = ? AND type = 'feed_item.read'
      `).get(DEMO_BOARD_ID, item.item_id) as { count: number };
      assert.equal(readEvents.count, 1);
    } finally {
      store.close();
    }
  } finally {
    relay.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Inbox Message uses disposition state instead of Feed read state", () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-inbox-state-"));
  const goalboardPath = join(directory, "goalboard.sqlite");
  try {
    seedDemoBoard(goalboardPath);
    const store = new SqliteGoalBoardStore(goalboardPath);
    try {
      const now = "2026-08-30T02:00:00.000Z";
      store.db.prepare(`
        INSERT INTO feed_items (
          board_id, item_id, source_id, item_type, kind, title, summary, body,
          source_kind, source_label, external_id, url, origin_status, priority,
          tags_json, author, disposition, linked_goal_id, read_at, revision,
          source_created_at, source_updated_at, imported_at, updated_at
        ) VALUES (?, 'inbox-message-1', NULL, 'inbox_message', 'github_issue', ?, ?, NULL,
          'github', 'GitHub', 'issue-1', 'https://example.com/issues/1', 'open', 'high',
          '[]', 'octocat', 'inbox', NULL, NULL, 1, ?, ?, ?, ?)
      `).run(DEMO_BOARD_ID, "需要处理的 Issue", "这是一条待判断消息", now, now, now, now);
      const feed = new FeedStore(store.db);
      assert.throws(
        () => feed.markRead(DEMO_BOARD_ID, "inbox-message-1"),
        /Inbox Message 使用处理状态，不记录已读状态/,
      );
      const archived = feed.setDisposition(DEMO_BOARD_ID, "inbox-message-1", "archived", 1);
      assert.equal(archived.read_at, null);
      assert.throws(
        () => feed.setDisposition(DEMO_BOARD_ID, "inbox-message-1", "saved", archived.revision),
        /已归档的 Inbox Message/,
      );
      assert.throws(
        () => feed.linkGoal(DEMO_BOARD_ID, "inbox-message-1", "CORE", "processing"),
        /已归档的 Inbox Message/,
      );
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Relay import is idempotent and preserves GoalBoard disposition", () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-relay-import-"));
  const goalboardPath = join(directory, "goalboard.sqlite");
  const relayPath = join(directory, "relay.sqlite");
  const relay = relayFixture(relayPath);
  try {
    seedDemoBoard(goalboardPath);
    const store = new SqliteGoalBoardStore(goalboardPath);
    try {
      const feed = new FeedStore(store.db);
      const first = importRelayData(feed, DEMO_BOARD_ID, relayPath);
      assert.deepEqual(first.sources, { created: 1, updated: 0 });
      assert.deepEqual(first.items, { created: 1, updated: 0 });
      assert.deepEqual(first.materials, { created: 1, updated: 0 });
      const imported = feed.getItem(DEMO_BOARD_ID, "relay-item-1");
      assert.equal(imported.item_type, "feed");
      assert.equal(imported.disposition, "inbox");
      assert.equal(imported.materials.length, 1);
      assert.equal(imported.materials[0]?.selected_for_context, true);

      const saved = feed.setDisposition(DEMO_BOARD_ID, imported.item_id, "saved", imported.revision);
      assert.equal(saved.disposition, "saved");
      const read = feed.markRead(DEMO_BOARD_ID, imported.item_id);
      assert.ok(read.read_at);
      const importedSource = feed.getSource(DEMO_BOARD_ID, "relay-source-1");
      feed.upsertSource({
        ...importedSource,
        status: "paused",
        enabled: false,
        cursor: { local_cursor: "goalboard-cursor" },
        last_sync_at: "2026-08-30T01:00:00.000Z",
        last_outcome: "completed",
        last_error_code: null,
        updated_at: "2026-08-30T01:00:00.000Z",
      });
      relay.prepare(`
        UPDATE inbox_sources
        SET status = ?, enabled = ?, item_count = ?, last_sync_at = ?, last_outcome = ?, updated_at = ?
        WHERE id = ?
      `).run(
        "active", 1, 99, "2026-08-29T08:00:00.000Z", "completed",
        "2026-08-29T09:00:00.000Z", "relay-source-1",
      );
      relay.prepare("UPDATE items SET title = ?, updated_at = ? WHERE id = ?").run(
        "更新后的 Feed", "2026-08-29T09:00:00.000Z", "relay-item-1",
      );
      const second = importRelayData(feed, DEMO_BOARD_ID, relayPath);
      assert.deepEqual(second.sources, { created: 0, updated: 1 });
      assert.deepEqual(second.items, { created: 0, updated: 1 });
      assert.deepEqual(second.materials, { created: 0, updated: 1 });
      const refreshed = feed.getItem(DEMO_BOARD_ID, "relay-item-1");
      assert.equal(refreshed.title, "更新后的 Feed");
      assert.equal(refreshed.disposition, "saved", "source refresh must preserve the local decision");
      assert.equal(refreshed.read_at, read.read_at, "source refresh must preserve local read state");
      const refreshedSource = feed.getSource(DEMO_BOARD_ID, "relay-source-1");
      assert.equal(refreshedSource.status, "paused", "repeat import must preserve local source state");
      assert.equal(refreshedSource.enabled, false);
      assert.deepEqual(refreshedSource.cursor, { local_cursor: "goalboard-cursor" });
      assert.equal(refreshedSource.last_sync_at, "2026-08-30T01:00:00.000Z");
      assert.equal(refreshedSource.item_count, 1, "item count must reconcile from GoalBoard items");
      assert.equal(feed.snapshot(DEMO_BOARD_ID).items.length, 1);
      assert.equal(feed.snapshot(DEMO_BOARD_ID).items[0]?.materials.length, 1);
    } finally {
      store.close();
    }
  } finally {
    relay.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Relay schema drift fails before it can overwrite imported Feed facts", () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-relay-schema-drift-"));
  const goalboardPath = join(directory, "goalboard.sqlite");
  const relayPath = join(directory, "relay.sqlite");
  const relay = relayFixture(relayPath);
  try {
    seedDemoBoard(goalboardPath);
    const store = new SqliteGoalBoardStore(goalboardPath);
    try {
      const feed = new FeedStore(store.db);
      importRelayData(feed, DEMO_BOARD_ID, relayPath);
      relay.prepare("UPDATE items SET title = ? WHERE id = ?").run("不应被导入", "relay-item-1");
      relay.exec("ALTER TABLE items DROP COLUMN body");
      assert.throws(
        () => importRelayData(feed, DEMO_BOARD_ID, relayPath),
        /Relay 数据库缺少列：items\.body/,
      );
      assert.equal(feed.getItem(DEMO_BOARD_ID, "relay-item-1").title, "第一条 Feed");
    } finally {
      store.close();
    }
  } finally {
    relay.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Feed disposition updates reject stale revisions and archived shortcuts", () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-feed-transition-"));
  const goalboardPath = join(directory, "goalboard.sqlite");
  const relayPath = join(directory, "relay.sqlite");
  const relay = relayFixture(relayPath);
  try {
    seedDemoBoard(goalboardPath);
    const store = new SqliteGoalBoardStore(goalboardPath);
    try {
      const feed = new FeedStore(store.db);
      importRelayData(feed, DEMO_BOARD_ID, relayPath);
      const item = feed.getItem(DEMO_BOARD_ID, "relay-item-1");
      const archived = feed.setDisposition(DEMO_BOARD_ID, item.item_id, "archived", item.revision);
      assert.throws(
        () => feed.setDisposition(DEMO_BOARD_ID, item.item_id, "saved", archived.revision),
        /已忽略的 Feed Item/,
      );
      assert.throws(
        () => feed.linkGoal(DEMO_BOARD_ID, item.item_id, "CORE", "processing"),
        /已忽略的 Feed Item/,
      );
      const restored = feed.setDisposition(DEMO_BOARD_ID, item.item_id, "inbox", archived.revision);
      assert.equal(restored.disposition, "inbox");
      assert.throws(
        () => feed.setDisposition(DEMO_BOARD_ID, item.item_id, "saved", item.revision),
        /已经变化/,
      );
    } finally {
      store.close();
    }
  } finally {
    relay.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

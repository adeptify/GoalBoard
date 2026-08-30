import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { FeedConnectorService } from "../src/feed/connectors/service.js";
import { createGithubConnector } from "../src/feed/connectors/github.js";
import { createGmailConnector } from "../src/feed/connectors/gmail.js";
import type {
  ConnectorIngestItem,
  ConnectorPort,
  ConnectorSyncFailure,
  ConnectorSyncSuccess,
} from "../src/feed/connectors/types.js";
import { FeedDomainError } from "../src/feed/errors.js";
import { resetSecretStoreCache } from "../src/feed/security/secret-store.js";
import type { FeedSourceRecord } from "../src/feed/types.js";
import { DEMO_BOARD_ID, seedDemoBoard } from "../src/v1/demo.js";
import { SqliteGoalBoardStore } from "../src/v1/store.js";

async function withBoard<T>(run: (store: SqliteGoalBoardStore) => Promise<T>): Promise<T> {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-feed-connectors-"));
  const databasePath = join(directory, "goalboard.sqlite");
  const oldHome = process.env.GOALBOARD_HOME;
  const oldBackend = process.env.GOALBOARD_SECRET_BACKEND;
  const oldNodeEnv = process.env.NODE_ENV;
  try {
    process.env.GOALBOARD_HOME = join(directory, "home");
    process.env.GOALBOARD_SECRET_BACKEND = "file";
    process.env.NODE_ENV = "test";
    resetSecretStoreCache();
    seedDemoBoard(databasePath);
    const store = new SqliteGoalBoardStore(databasePath);
    try {
      return await run(store);
    } finally {
      store.close();
    }
  } finally {
    resetSecretStoreCache();
    if (oldHome == null) delete process.env.GOALBOARD_HOME;
    else process.env.GOALBOARD_HOME = oldHome;
    if (oldBackend == null) delete process.env.GOALBOARD_SECRET_BACKEND;
    else process.env.GOALBOARD_SECRET_BACKEND = oldBackend;
    if (oldNodeEnv == null) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
    rmSync(directory, { recursive: true, force: true });
  }
}

function success(
  items: ConnectorIngestItem[],
  cursor: unknown,
): ConnectorSyncSuccess {
  return { ok: true, mode: "live", items, cursor };
}

function failure(kind: ConnectorSyncFailure["failure"]): ConnectorSyncFailure {
  return {
    ok: false,
    mode: "live",
    failure: kind,
    message: "Provider request failed safely",
    action: "Reconnect and retry",
    httpStatus: kind === "needs_auth" ? 401 : 503,
  };
}

test("GitHub live adapter returns real Items without exposing its token", async () => {
  const token = "github-live-token-that-must-not-leak";
  let healthCalls = 0;
  let syncCalls = 0;
  const connector = createGithubConnector({
    token,
    fetchImpl: async (url, init) => {
      assert.equal(String(init?.headers && (init.headers as Record<string, string>).Authorization), `Bearer ${token}`);
      if (url.endsWith("/user")) {
        healthCalls += 1;
        return new Response(JSON.stringify({ login: "goalboard-user" }), { status: 200 });
      }
      syncCalls += 1;
      return new Response(JSON.stringify([{
        id: 9,
        number: 99,
        title: "Live issue",
        body: "Provider body",
        html_url: "https://github.com/adeptify/goalboard/issues/99",
        user: { login: "alice" },
      }]), { status: 200 });
    },
  });

  const health = await connector.health();
  assert.deepEqual({ ok: health.ok, status: health.status }, { ok: true, status: "connected" });
  const synced = await connector.sync({ cursor: null });
  assert.equal(synced.ok, true);
  if (synced.ok) {
    assert.equal(synced.mode, "live");
    assert.equal(synced.items[0]?.externalId, "gh-issue-99");
  }
  assert.equal(healthCalls, 1);
  assert.equal(syncCalls, 1);
  assert.equal(JSON.stringify({ health, synced }).includes(token), false);
});

test("Gmail live adapter advances only a provider-backed cursor and redacts failures", async () => {
  const token = "ya29.gmail-token-that-must-not-leak";
  const connector = createGmailConnector({
    accessToken: token,
    fetchImpl: async (url) => {
      if (url.includes("/profile")) {
        return new Response(JSON.stringify({ emailAddress: "user@example.com", historyId: "1234567890" }), { status: 200 });
      }
      if (url.includes("/messages/live-1")) {
        return new Response(JSON.stringify({
          id: "live-1",
          snippet: "Please review this update",
          payload: { headers: [
            { name: "Subject", value: "Live Gmail message" },
            { name: "From", value: "sender@example.com" },
          ] },
        }), { status: 200 });
      }
      if (url.includes("/messages?")) {
        return new Response(JSON.stringify({ messages: [{ id: "live-1" }] }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    },
  });
  const synced = await connector.sync({ cursor: null });
  assert.equal(synced.ok, true);
  if (synced.ok) {
    assert.equal(synced.mode, "live");
    assert.equal(synced.items[0]?.externalId, "gmail-msg-live-1");
    const cursor = synced.cursor as {
      v?: number;
      historyId?: string;
      mode?: string;
      provenance?: string;
      at?: string;
    };
    assert.equal(cursor.v, 1);
    assert.equal(cursor.historyId, "1234567890");
    assert.equal(cursor.mode, "live");
    assert.equal(cursor.provenance, "full_sync");
    assert.equal(typeof cursor.at, "string");
  }
  assert.equal(JSON.stringify(synced).includes(token), false);

  const failed = await createGmailConnector({
    accessToken: token,
    fetchImpl: async () => new Response(JSON.stringify({ access_token: token }), { status: 401 }),
  }).sync({ cursor: null });
  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.failure, "needs_auth");
    assert.equal(failed.httpStatus, 401);
  }
  assert.equal(JSON.stringify(failed).includes(token), false);
});

test("Connector service persists cursor only after success and safely replays or retries", async () => {
  await withBoard(async (store) => {
    let calls = 0;
    let next: ConnectorSyncSuccess | ConnectorSyncFailure = success([{
      externalId: "issue-1",
      title: "First issue",
      summary: "Needs a decision",
      kind: "issue",
      priority: "high",
      tags: ["github"],
      author: "octocat",
    }], { since: "cursor-1" });
    const port: ConnectorPort = {
      type: "github",
      async health() { return { ok: true, status: "connected", message: "stub" }; },
      async sync() { calls += 1; return next; },
    };
    const service = new FeedConnectorService(store.db, DEMO_BOARD_ID, () => port);
    const source = service.ensureSources().find((entry) => entry.sync_kind === "github")!;

    const first = await service.sync(source.source_id, { idempotencyKey: "connector-sync-0001" });
    assert.equal(first.created, 1);
    assert.deepEqual(first.source.cursor, { since: "cursor-1" });
    assert.equal(service.feed.snapshot(DEMO_BOARD_ID).items[0]?.item_type, "inbox_message");

    const replay = await service.sync(source.source_id, { idempotencyKey: "connector-sync-0001" });
    assert.equal(replay.replayed, true);
    assert.equal(calls, 1, "terminal replay must not call the Provider again");

    next = failure("needs_auth");
    await assert.rejects(
      service.sync(source.source_id, { idempotencyKey: "connector-sync-0002" }),
      (error: unknown) => error instanceof FeedDomainError && error.code === "connector_needs_auth",
    );
    assert.deepEqual(service.feed.getSource(DEMO_BOARD_ID, source.source_id).cursor, { since: "cursor-1" });

    next = success([{
      externalId: "issue-2",
      title: "Recovered issue",
      summary: "Retry worked",
      kind: "issue",
      priority: "medium",
      tags: ["github"],
    }], { since: "cursor-2" });
    const recovered = await service.sync(source.source_id, { idempotencyKey: "connector-sync-0003" });
    assert.equal(recovered.created, 1);
    assert.deepEqual(recovered.source.cursor, { since: "cursor-2" });

    service.feed.setSourceEnabled(DEMO_BOARD_ID, source.source_id, false);
    await assert.rejects(
      service.sync(source.source_id, { idempotencyKey: "connector-sync-0004" }),
      (error: unknown) => error instanceof FeedDomainError && error.code === "feed_source_paused",
    );
  });
});

test("Connector interruption is recoverable with the same idempotency key", async () => {
  await withBoard(async (store) => {
    let calls = 0;
    const port: ConnectorPort = {
      type: "github",
      async health() { return { ok: true, status: "connected", message: "stub" }; },
      async sync() {
        calls += 1;
        if (calls === 1) throw Object.assign(new Error("socket failed"), { code: "provider_interrupted" });
        return success([], { since: "cursor-after-retry" });
      },
    };
    const service = new FeedConnectorService(store.db, DEMO_BOARD_ID, () => port);
    const source = service.ensureSources().find((entry) => entry.sync_kind === "github")!;
    await assert.rejects(
      service.sync(source.source_id, { idempotencyKey: "connector-recovery-0001" }),
      (error: unknown) => error instanceof FeedDomainError && error.code === "feed_source_sync_interrupted",
    );
    const interrupted = service.feed.snapshot(DEMO_BOARD_ID).runs[0]!;
    assert.equal(interrupted.phase, "interrupted");
    assert.deepEqual(service.feed.getSource(DEMO_BOARD_ID, source.source_id).cursor, {});

    const retried = await service.sync(source.source_id, { idempotencyKey: "connector-recovery-0001" });
    assert.equal(retried.run.phase, "terminal");
    assert.equal(retried.run.recovery_count, 1);
    assert.deepEqual(retried.source.cursor, { since: "cursor-after-retry" });
    assert.equal(calls, 2);
  });
});

test("Connector Item dedupe is scoped by Source so Gmail accounts never collide", async () => {
  await withBoard(async (store) => {
    const item = {
      externalId: "same-provider-message-id",
      title: "Account-scoped message",
      summary: "same id, different account",
      kind: "message",
      priority: "medium",
      tags: ["gmail"],
    } satisfies ConnectorIngestItem;
    const port: ConnectorPort = {
      type: "gmail",
      async health() { return { ok: true, status: "connected", message: "stub" }; },
      async sync() { return success([item], { historyId: "2" }); },
    };
    const service = new FeedConnectorService(store.db, DEMO_BOARD_ID, () => port);
    const legacy = service.ensureSources().find((entry) => entry.sync_kind === "gmail")!;
    const now = new Date().toISOString();
    const second: FeedSourceRecord = service.feed.upsertSource({
      ...legacy,
      source_id: "feed-source-gmail-account-two",
      name: "Gmail · second@example.com",
      account_label: "second@example.com",
      config: { installation_id: "gmail-account-two" },
      imported_at: now,
      updated_at: now,
    });

    await service.sync(legacy.source_id, { idempotencyKey: "gmail-account-one-0001" });
    await service.sync(second.source_id, { idempotencyKey: "gmail-account-two-0001" });
    const items = service.feed.snapshot(DEMO_BOARD_ID).items;
    assert.equal(items.length, 2);
    assert.equal(new Set(items.map((entry) => entry.source_id)).size, 2);
  });
});

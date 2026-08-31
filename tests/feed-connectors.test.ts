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

test("GitHub live adapter reads notifications, records provider cursor, and separates attention", async () => {
  const token = "github-live-token-that-must-not-leak";
  const at = new Date("2026-08-30T10:00:00.000Z");
  const requests: Array<{ url: string; headers: Record<string, string> }> = [];
  const connector = createGithubConnector({
    token,
    now: () => at,
    fetchImpl: async (url, init) => {
      const headers = init?.headers as Record<string, string>;
      requests.push({ url, headers });
      assert.equal(headers.Authorization, `Bearer ${token}`);
      assert.equal(init?.method, undefined, "GitHub connector must use GET only");
      if (url.endsWith("/user")) {
        return new Response(JSON.stringify({ login: "goalboard-user" }), {
          status: 200,
          headers: { "x-oauth-scopes": "notifications, read:user" },
        });
      }
      return new Response(JSON.stringify([
        {
          id: "thread-review-9",
          repository: {
            full_name: "adeptify/goalboard",
            html_url: "https://github.com/adeptify/goalboard",
          },
          subject: {
            title: "Review the notification connector",
            type: "PullRequest",
            url: "https://api.github.com/repos/adeptify/goalboard/pulls/99",
          },
          reason: "review_requested",
          unread: true,
          updated_at: "2026-08-30T09:58:00Z",
        },
        {
          id: "thread-subscribed-10",
          repository: {
            full_name: "adeptify/goalboard",
            html_url: "https://github.com/adeptify/goalboard",
          },
          subject: {
            title: "Release v1.2.0",
            type: "Release",
            url: "https://api.github.com/repos/adeptify/goalboard/releases/120",
          },
          reason: "subscribed",
          unread: true,
          updated_at: "2026-08-30T09:55:00Z",
        },
      ]), {
        status: 200,
        headers: {
          "last-modified": "Sun, 30 Aug 2026 09:58:00 GMT",
          "x-poll-interval": "120",
        },
      });
    },
  });

  const health = await connector.health();
  assert.deepEqual({ ok: health.ok, status: health.status }, { ok: true, status: "connected" });
  const synced = await connector.sync({ cursor: null });
  assert.equal(synced.ok, true);
  if (synced.ok) {
    assert.equal(synced.mode, "live");
    assert.equal(synced.items.length, 2);
    assert.deepEqual(synced.items[0], {
      externalId: "github-notification-thread-review-9",
      title: "adeptify/goalboard · Review the notification connector",
      summary: "PullRequest · review_requested · adeptify/goalboard",
      body: "Repository: adeptify/goalboard\nReason: review_requested\nSubject type: PullRequest\nUnread: yes",
      url: "https://github.com/adeptify/goalboard/pull/99",
      occurredAt: "2026-08-30T09:58:00.000Z",
      kind: "pr",
      priority: "high",
      tags: ["github", "repository:adeptify/goalboard", "reason:review_requested", "subject:pullrequest"],
      author: "adeptify",
      attention: {
        reason: "source_rule",
        detail: {
          provider_reason: "review_requested",
          repository: "adeptify/goalboard",
          rule: "github_direct_attention_v1",
        },
      },
    });
    assert.equal(synced.items[1]?.attention, false);
    assert.deepEqual(synced.cursor, {
      v: 1,
      provider: "github",
      mode: "live",
      granted_scopes: ["notifications", "read:user"],
      authorization_kind: "classic_pat_or_oauth_notifications",
      poll_interval_seconds: 120,
      next_poll_at: "2026-08-30T10:02:00.000Z",
      synced_at: "2026-08-30T10:00:00.000Z",
      last_modified: "Sun, 30 Aug 2026 09:58:00 GMT",
      last_provider_updated_at: "2026-08-30T09:58:00.000Z",
      account_login: "goalboard-user",
    });
    const callsBeforeEarlyPoll = requests.length;
    const early = await connector.sync({ cursor: synced.cursor });
    assert.equal(early.ok, true);
    assert.equal(requests.length, callsBeforeEarlyPoll, "poll boundary must stop before provider access");
  }
  assert.deepEqual(requests.map((request) => request.url), [
    "https://api.github.com/user",
    "https://api.github.com/user",
    "https://api.github.com/notifications?all=false&participating=false&per_page=50",
  ]);
  assert.equal(JSON.stringify({ health, synced }).includes(token), false);
});

test("GitHub notification adapter revalidates with Last-Modified and accepts 304", async () => {
  const seenHeaders: Record<string, string>[] = [];
  const connector = createGithubConnector({
    token: "github-304-token",
    now: () => new Date("2026-08-30T10:03:00.000Z"),
    fetchImpl: async (url, init) => {
      const headers = init?.headers as Record<string, string>;
      if (url.endsWith("/user")) {
        return new Response(JSON.stringify({ login: "goalboard-user" }), {
          status: 200,
          headers: { "x-oauth-scopes": "notifications, read:user" },
        });
      }
      seenHeaders.push(headers);
      return new Response(null, { status: 304, headers: { "x-poll-interval": "60" } });
    },
  });
  const result = await connector.sync({
    cursor: {
      v: 1,
      provider: "github",
      mode: "live",
      account_login: "goalboard-user",
      granted_scopes: ["notifications", "read:user"],
      authorization_kind: "classic_pat_or_oauth_notifications",
      last_modified: "Sun, 30 Aug 2026 09:58:00 GMT",
      last_provider_updated_at: "2026-08-30T09:58:00.000Z",
      poll_interval_seconds: 120,
      next_poll_at: "2026-08-30T10:02:00.000Z",
      synced_at: "2026-08-30T10:00:00.000Z",
    },
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.items, []);
    assert.equal((result.cursor as { last_modified?: string }).last_modified, "Sun, 30 Aug 2026 09:58:00 GMT");
    assert.equal((result.cursor as { next_poll_at?: string }).next_poll_at, "2026-08-30T10:04:00.000Z");
  }
  assert.equal(seenHeaders[0]?.["If-Modified-Since"], "Sun, 30 Aug 2026 09:58:00 GMT");
});

test("GitHub notification adapter distinguishes auth, scope, network, and rate limit safely", async () => {
  const missingScope = await createGithubConnector({
    token: "github-missing-scope-token",
    fetchImpl: async () => new Response(JSON.stringify({ login: "goalboard-user" }), {
      status: 200,
      headers: { "x-oauth-scopes": "read:user" },
    }),
  }).sync({ cursor: null });
  assert.equal(missingScope.ok, false);
  if (!missingScope.ok) {
    assert.equal(missingScope.failure, "needs_auth");
    assert.equal(missingScope.httpStatus, 403);
  }

  const expiredAuth = await createGithubConnector({
    token: "github-expired-token",
    fetchImpl: async () => new Response("", { status: 401 }),
  }).sync({ cursor: null });
  assert.equal(expiredAuth.ok, false);
  if (!expiredAuth.ok) {
    assert.equal(expiredAuth.failure, "needs_auth");
    assert.equal(expiredAuth.httpStatus, 401);
  }

  const offline = await createGithubConnector({
    token: "github-offline-token",
    fetchImpl: async () => { throw new Error("provider token must not escape"); },
  }).sync({ cursor: null });
  assert.equal(offline.ok, false);
  if (!offline.ok) assert.equal(offline.failure, "network");

  const rateLimited = await createGithubConnector({
    token: "github-rate-token",
    now: () => new Date("2026-08-30T10:00:00.000Z"),
    fetchImpl: async (url) => url.endsWith("/user")
      ? new Response(JSON.stringify({ login: "goalboard-user" }), {
          status: 200,
          headers: { "x-oauth-scopes": "notifications, read:user" },
        })
      : new Response("", {
          status: 403,
          headers: {
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": String(Date.parse("2026-08-30T10:05:00.000Z") / 1_000),
          },
        }),
  }).sync({ cursor: null });
  assert.equal(rateLimited.ok, false);
  if (!rateLimited.ok) {
    assert.equal(rateLimited.failure, "rate_limited");
    assert.equal(rateLimited.retryAfterAt, "2026-08-30T10:05:00.000Z");
  }
  const safeResult = JSON.stringify({ missingScope, expiredAuth, offline, rateLimited });
  for (const secret of ["github-missing-scope-token", "github-expired-token", "github-offline-token", "github-rate-token"]) {
    assert.equal(safeResult.includes(secret), false);
  }
});

test("Gmail live adapter advances only a provider-backed cursor and redacts failures", async () => {
  const token = "ya29.gmail-token-that-must-not-leak";
  const requestedUrls: string[] = [];
  const connector = createGmailConnector({
    accessToken: token,
    getNowMs: () => Date.parse("2026-08-30T10:00:00.000Z"),
    fetchImpl: async (url) => {
      requestedUrls.push(url);
      if (url.includes("/profile")) {
        return new Response(JSON.stringify({ emailAddress: "user@example.com", historyId: "1234567890" }), { status: 200 });
      }
      if (url.includes("/messages/live-1")) {
        return new Response(JSON.stringify({
          id: "live-1",
          internalDate: String(Date.parse("2026-08-30T09:45:00.000Z")),
          labelIds: ["INBOX", "UNREAD", "STARRED"],
          snippet: "Please review this update",
          payload: { headers: [
            { name: "Subject", value: "Live Gmail message" },
            { name: "From", value: "Sender <sender@example.com>" },
            { name: "To", value: "GoalBoard User <user@example.com>" },
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
    assert.deepEqual(synced.items[0], {
      externalId: "gmail-msg-live-1",
      title: "Live Gmail message",
      summary: "Please review this update",
      url: "https://mail.google.com/mail/u/?authuser=user%40example.com#all/live-1",
      occurredAt: "2026-08-30T09:45:00.000Z",
      kind: "message",
      priority: "high",
      tags: ["gmail", "label:inbox", "label:unread", "label:starred"],
      author: "Sender <sender@example.com>",
      attention: {
        reason: "source_rule",
        detail: {
          rule: "gmail_attention_v1",
          matched_by: ["starred", "direct_recipient"],
          system_labels: ["STARRED"],
        },
      },
    });
    const cursor = synced.cursor as {
      v?: number;
      historyId?: string;
      mode?: string;
      provenance?: string;
      at?: string;
      scope?: string;
      account_email?: string;
    };
    assert.equal(cursor.v, 1);
    assert.equal(cursor.historyId, "1234567890");
    assert.equal(cursor.mode, "live");
    assert.equal(cursor.provenance, "full_sync");
    assert.equal(cursor.at, "2026-08-30T10:00:00.000Z");
    assert.equal(cursor.scope, "in:inbox is:unread");
    assert.equal(cursor.account_email, "user@example.com");
  }
  const listUrl = new URL(requestedUrls.find((url) => url.includes("/messages?"))!);
  assert.equal(listUrl.searchParams.get("q"), "in:inbox is:unread");
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

test("Gmail incremental sync enforces the configured range and preserves account metadata", async () => {
  const calls: string[] = [];
  const connector = createGmailConnector({
    accessToken: "gmail-incremental-token",
    scope: "is:starred",
    getNowMs: () => Date.parse("2026-08-30T11:00:00.000Z"),
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.includes("/profile")) {
        return new Response(JSON.stringify({ emailAddress: "owner@example.com", historyId: "200" }));
      }
      if (url.includes("/history?")) {
        return new Response(JSON.stringify({
          historyId: "201",
          history: [{
            messagesAdded: [
              { message: { id: "starred-1" } },
              { message: { id: "ordinary-2" } },
            ],
          }],
        }));
      }
      if (url.includes("/messages/starred-1")) {
        return new Response(JSON.stringify({
          id: "starred-1",
          internalDate: String(Date.parse("2026-08-30T10:50:00.000Z")),
          labelIds: ["INBOX", "STARRED"],
          snippet: "A starred provider update",
          payload: { headers: [
            { name: "Subject", value: "Starred update" },
            { name: "From", value: "provider@example.com" },
            { name: "To", value: "owner@example.com" },
            { name: "Precedence", value: "bulk" },
          ] },
        }));
      }
      if (url.includes("/messages/ordinary-2")) {
        return new Response(JSON.stringify({
          id: "ordinary-2",
          labelIds: ["INBOX", "UNREAD"],
          snippet: "Must remain outside this source range",
          payload: { headers: [
            { name: "Subject", value: "Ordinary update" },
            { name: "From", value: "person@example.com" },
            { name: "To", value: "owner@example.com" },
          ] },
        }));
      }
      return new Response("{}", { status: 404 });
    },
  });

  const result = await connector.sync({
    cursor: {
      v: 1,
      historyId: "199",
      mode: "live",
      at: "2026-08-30T10:00:00.000Z",
      provenance: "full_sync",
      scope: "is:starred",
      account_email: "owner@example.com",
    },
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.items.map((item) => item.externalId), ["gmail-msg-starred-1"]);
    assert.deepEqual(result.items[0]?.attention, {
      reason: "source_rule",
      detail: {
        rule: "gmail_attention_v1",
        matched_by: ["starred"],
        system_labels: ["STARRED"],
      },
    });
    assert.deepEqual(result.cursor, {
      v: 1,
      historyId: "201",
      mode: "live",
      at: "2026-08-30T11:00:00.000Z",
      provenance: "history",
      scope: "is:starred",
      account_email: "owner@example.com",
    });
  }
  assert.equal(calls.some((url) => url.includes("/history?")), true);
  assert.equal(calls.some((url) => url.includes("/messages/ordinary-2")), true, "incremental candidates are checked against labels");
});

test("Gmail range changes force one bounded full sync instead of reusing the old history range", async () => {
  const calls: string[] = [];
  const connector = createGmailConnector({
    accessToken: "gmail-scope-change-token",
    scope: "in:inbox",
    getNowMs: () => Date.parse("2026-08-30T12:00:00.000Z"),
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.includes("/profile")) {
        return new Response(JSON.stringify({ emailAddress: "owner@example.com", historyId: "300" }));
      }
      if (url.includes("/messages?")) {
        return new Response(JSON.stringify({ messages: [] }));
      }
      return new Response("{}", { status: 500 });
    },
  });
  const result = await connector.sync({
    cursor: {
      v: 1,
      historyId: "299",
      mode: "live",
      at: "2026-08-30T11:00:00.000Z",
      provenance: "history",
      scope: "is:starred",
      account_email: "owner@example.com",
    },
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal((result.cursor as { provenance?: string }).provenance, "full_sync");
    assert.equal((result.cursor as { scope?: string }).scope, "in:inbox");
  }
  assert.equal(calls.some((url) => url.includes("/history?")), false);
  const listUrl = new URL(calls.find((url) => url.includes("/messages?"))!);
  assert.equal(listUrl.searchParams.get("q"), "in:inbox");
});

test("Connector service persists cursor only after success and safely replays or retries", async () => {
  await withBoard(async (store) => {
    let calls = 0;
    const cursor1 = {
      v: 1,
      provider: "github",
      mode: "live",
      account_login: "goalboard-user",
      granted_scopes: ["notifications", "read:user"],
      authorization_kind: "classic_pat_or_oauth_notifications",
      next_poll_at: "2026-08-30T10:02:00.000Z",
      synced_at: "2026-08-30T10:00:00.000Z",
    };
    let next: ConnectorSyncSuccess | ConnectorSyncFailure = success([
      {
        externalId: "issue-1",
        title: "First issue",
        summary: "Needs a decision",
        kind: "issue",
        priority: "high",
        tags: ["github"],
        author: "octocat",
        attention: { reason: "source_rule", detail: { provider_reason: "assign" } },
      },
      {
        externalId: "release-1",
        title: "Subscribed release",
        summary: "Feed only",
        kind: "notification",
        priority: "low",
        tags: ["github"],
        attention: false,
      },
    ], cursor1);
    const port: ConnectorPort = {
      type: "github",
      async health() { return { ok: true, status: "connected", message: "stub" }; },
      async sync() { calls += 1; return next; },
    };
    const service = new FeedConnectorService(store.db, DEMO_BOARD_ID, () => port);
    const source = service.feed.upsertSource({
      ...service.ensureSources().find((entry) => entry.sync_kind === "github")!,
      status: "active",
    });

    const first = await service.sync(source.source_id, { idempotencyKey: "connector-sync-0001" });
    assert.equal(first.created, 2);
    assert.deepEqual(first.source.cursor, cursor1);
    assert.equal(first.source.account_label, "@goalboard-user");
    assert.equal(first.source.config.scope, "GitHub 通知 · GoalBoard 只调用 GET · notifications scope");
    const firstItems = service.feed.snapshot(DEMO_BOARD_ID).items.filter((item) => item.source_id === source.source_id);
    assert.equal(firstItems.find((item) => item.external_id.endsWith(":issue-1"))?.item_type, "inbox_message");
    assert.equal(firstItems.find((item) => item.external_id.endsWith(":release-1"))?.item_type, "feed");

    const replay = await service.sync(source.source_id, { idempotencyKey: "connector-sync-0001" });
    assert.equal(replay.replayed, true);
    assert.equal(calls, 1, "terminal replay must not call the Provider again");

    next = failure("needs_auth");
    await assert.rejects(
      service.sync(source.source_id, { idempotencyKey: "connector-sync-0002" }),
      (error: unknown) => error instanceof FeedDomainError && error.code === "connector_needs_auth",
    );
    assert.deepEqual(service.feed.getSource(DEMO_BOARD_ID, source.source_id).cursor, cursor1);
    const fault = service.feed.listInboxEntries(DEMO_BOARD_ID).find(
      (entry) => entry.subject_type === "source_fault" && entry.subject_id === source.source_id,
    );
    assert.equal(fault?.status, "open");

    next = success([{
      externalId: "issue-2",
      title: "Recovered issue",
      summary: "Retry worked",
      kind: "issue",
      priority: "medium",
      tags: ["github"],
    }], { ...cursor1, next_poll_at: "2026-08-30T10:04:00.000Z", synced_at: "2026-08-30T10:02:00.000Z" });
    const recovered = await service.sync(source.source_id, { idempotencyKey: "connector-sync-0003" });
    assert.equal(recovered.created, 1);
    assert.equal((recovered.source.cursor as { next_poll_at?: string }).next_poll_at, "2026-08-30T10:04:00.000Z");
    assert.equal(service.feed.listInboxEntries(DEMO_BOARD_ID).find(
      (entry) => entry.subject_type === "source_fault" && entry.subject_id === source.source_id,
    )?.status, "done");

    service.feed.setSourceEnabled(DEMO_BOARD_ID, source.source_id, false);
    await assert.rejects(
      service.sync(source.source_id, { idempotencyKey: "connector-sync-0004" }),
      (error: unknown) => error instanceof FeedDomainError && error.code === "feed_source_paused",
    );
  });
});

test("Connector service preserves cursor and schedules rate-limit recovery without Inbox noise", async () => {
  await withBoard(async (store) => {
    const retryAfterAt = "2026-08-30T10:05:00.000Z";
    const port: ConnectorPort = {
      type: "github",
      async health() { return { ok: true, status: "connected", message: "stub" }; },
      async sync() {
        return {
          ok: false,
          mode: "live",
          failure: "rate_limited",
          message: "GitHub rate limited",
          action: "Retry later",
          httpStatus: 403,
          retryAfterAt,
        };
      },
    };
    const service = new FeedConnectorService(store.db, DEMO_BOARD_ID, () => port);
    const source = service.feed.upsertSource({
      ...service.ensureSources().find((entry) => entry.sync_kind === "github")!,
      status: "active",
      cursor: { trusted: "cursor" },
      schedule: { mode: "interval", enabled: true, interval_minutes: 30, next_pull_at: null },
    });
    await assert.rejects(
      service.sync(source.source_id, { idempotencyKey: "connector-rate-limit-0001" }),
      (error: unknown) => error instanceof FeedDomainError && error.code === "connector_rate_limited",
    );
    const durable = service.feed.getSource(DEMO_BOARD_ID, source.source_id);
    assert.equal(durable.status, "active");
    assert.deepEqual(durable.cursor, { trusted: "cursor" });
    assert.equal(durable.schedule.mode, "interval");
    if (durable.schedule.mode === "interval") assert.equal(durable.schedule.next_pull_at, retryAfterAt);
    assert.equal(service.feed.listInboxEntries(DEMO_BOARD_ID).some(
      (entry) => entry.subject_type === "source_fault" && entry.subject_id === source.source_id,
    ), false);
  });
});

test("disconnected connector stops before any Provider pull", async () => {
  await withBoard(async (store) => {
    let calls = 0;
    const port: ConnectorPort = {
      type: "github",
      async health() { return { ok: true, status: "connected", message: "stub" }; },
      async sync() {
        calls += 1;
        return success([], {});
      },
    };
    const service = new FeedConnectorService(store.db, DEMO_BOARD_ID, () => port);
    const disconnected = service.ensureSources().find((entry) => entry.sync_kind === "github")!;
    assert.equal(disconnected.status, "disconnected");
    await assert.rejects(
      service.sync(disconnected.source_id, { idempotencyKey: "disconnected-must-not-pull" }),
      (error: unknown) => error instanceof FeedDomainError && error.code === "connector_needs_auth",
    );
    assert.equal(calls, 0);
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
    const source = service.feed.upsertSource({
      ...service.ensureSources().find((entry) => entry.sync_kind === "github")!,
      status: "active",
    });
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
    const legacy = service.feed.upsertSource({
      ...service.ensureSources().find((entry) => entry.sync_kind === "gmail")!,
      status: "active",
    });
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

test("Connector service writes Gmail identity and keeps only explicit Gmail attention in Inbox", async () => {
  await withBoard(async (store) => {
    const port: ConnectorPort = {
      type: "gmail",
      async health() { return { ok: true, status: "connected", message: "stub" }; },
      async sync() {
        return success([
          {
            externalId: "gmail-attention-1",
            title: "Needs a reply",
            summary: "Sensitive preview that must stay on the Feed item",
            tags: ["gmail", "label:important"],
            attention: {
              reason: "source_rule",
              detail: {
                rule: "gmail_attention_v1",
                matched_by: ["important"],
                system_labels: ["IMPORTANT"],
              },
            },
          },
          {
            externalId: "gmail-feed-only-2",
            title: "Newsletter",
            summary: "Feed only",
            tags: ["gmail", "label:unread"],
            attention: false,
          },
        ], {
          v: 1,
          historyId: "400",
          mode: "live",
          at: "2026-08-30T12:00:00.000Z",
          provenance: "history",
          scope: "in:inbox is:unread",
          account_email: "owner@example.com",
        });
      },
    };
    const service = new FeedConnectorService(store.db, DEMO_BOARD_ID, () => port);
    const source = service.feed.upsertSource({
      ...service.ensureSources().find((entry) => entry.sync_kind === "gmail")!,
      status: "active",
    });

    const result = await service.sync(source.source_id, { idempotencyKey: "gmail-attention-service-0001" });
    assert.equal(result.source.account_label, "owner@example.com");
    assert.equal(result.source.config.scope, "in:inbox is:unread");
    assert.deepEqual(result.source.config.authorization, {
      provider: "gmail",
      kind: "oauth_readonly",
      minimum_scopes: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "openid",
        "email",
      ],
      goalboard_http_methods: ["GET"],
    });
    const items = service.feed.snapshot(DEMO_BOARD_ID).items
      .filter((item) => item.source_id === source.source_id);
    assert.equal(items.find((item) => item.external_id.endsWith(":gmail-attention-1"))?.item_type, "inbox_message");
    assert.equal(items.find((item) => item.external_id.endsWith(":gmail-feed-only-2"))?.item_type, "feed");
    const inbox = service.feed.listInboxEntries(DEMO_BOARD_ID)
      .find((entry) => entry.subject_id === items.find((item) => item.external_id.endsWith(":gmail-attention-1"))?.item_id);
    assert.deepEqual(inbox?.detail, {
      rule: "gmail_attention_v1",
      matched_by: ["important"],
      system_labels: ["IMPORTANT"],
    });
    assert.equal(JSON.stringify(inbox).includes("Sensitive preview"), false);
    assert.equal(JSON.stringify(inbox).includes("Needs a reply"), false);
  });
});

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCompletedIntentResultFixtureV1 } from "@adeptify/intelligence-client/testing";

import { FeedSourceService, listFeedSourceCatalog } from "../src/feed/sources/service.js";
import type { FeedSourceRuntime } from "../src/feed/sources/runtime.js";
import type { IntelligenceCollectRequest, IntelligenceCollectResult } from "../src/feed/sources/intelligence-adapter.js";
import { FeedDomainError } from "../src/feed/errors.js";
import { DEMO_BOARD_ID, seedDemoBoard } from "../src/v1/demo.js";
import { SqliteGoalBoardStore } from "../src/v1/store.js";
import { createGoalBoardWebServer } from "../src/web/server.js";
import { resetSecretStoreCache } from "../src/feed/security/secret-store.js";

test("public Feed sources register without network and sync exactly once per idempotency key", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-feed-source-"));
  const databasePath = join(directory, "goalboard.sqlite");
  try {
    seedDemoBoard(databasePath);
    const store = new SqliteGoalBoardStore(databasePath);
    try {
      let runtimeCreated = 0;
      let executeCount = 0;
      let retained = "";
      const runtimeFactory = (): FeedSourceRuntime => {
        runtimeCreated += 1;
        return {
          intelligenceCollect: {
            async executeExact(request: IntelligenceCollectRequest): Promise<IntelligenceCollectResult> {
              executeCount += 1;
              const base = createCompletedIntentResultFixtureV1(request);
              retained = "# Full retained article\n\nEvidence body.";
              return {
                ...base,
                materials: [{
                  id: "material:goalboard-feed-source-test",
                  candidateId: "candidate:test-1",
                  canonicalUrl: "https://example.com/article",
                  title: "公开材料",
                  sourceName: "Example",
                  preview: "可核对摘要",
                  contentRef: "goalboard-feed/sha256/" + "a".repeat(64),
                  contentHash: `sha256:${"a".repeat(64)}`,
                  contentHashProfile: "search-markdown-v1",
                  contentType: "text/markdown",
                  characterCount: retained.length,
                  capturedAt: "2026-08-29T08:00:00.000Z",
                  provenance: {
                    operationId: request.operationId,
                    providerId: "rss",
                    providerVersion: "1.0.0",
                    bindingRevision: 1,
                    retrievedAt: "2026-08-29T08:00:00.000Z",
                    matchedLaneIds: ["intent:exact"],
                    rankProfile: "feed-v1",
                    transportProfileFingerprint: `sha256:${"b".repeat(64)}`,
                  },
                  extractorRef: { providerId: "rss", providerVersion: "1.0.0" },
                  truncated: false,
                  availability: "available",
                }],
              } as IntelligenceCollectResult;
            },
            async shutdown() {},
          },
          content: {
            write() { return { contentRef: "goalboard-feed/sha256/" + "a".repeat(64) }; },
            read() { return retained; },
            has() { return true; },
            inspect() { return { referenced: 1, available: 1, missing: 0, keyAvailable: true }; },
          },
          async shutdown() {},
        };
      };
      const service = new FeedSourceService(store.db, DEMO_BOARD_ID, runtimeFactory);
      const definition = listFeedSourceCatalog()[0]!;
      const firstRegistration = service.register({ kind: "rss", definition_id: definition.id });
      assert.equal(firstRegistration.registered, true);
      assert.equal(runtimeCreated, 0, "registration must not perform network/runtime setup");
      const duplicate = service.register({ kind: "rss", definition_id: definition.id });
      assert.equal(duplicate.registered, false);
      assert.equal(duplicate.source.source_id, firstRegistration.source.source_id);

      const first = await service.sync(firstRegistration.source.source_id, {
        idempotencyKey: "source-sync-test-0001",
      });
      assert.equal(first.created, 1);
      assert.equal(first.run.phase, "terminal");
      assert.equal(first.run.outcome, "completed");
      assert.equal(executeCount, 1);

      const replay = await service.sync(firstRegistration.source.source_id, {
        idempotencyKey: "source-sync-test-0001",
      });
      assert.equal(replay.replayed, true);
      assert.equal(executeCount, 1, "terminal replay must not call the provider again");
      assert.equal(service.feed.snapshot(DEMO_BOARD_ID).items.length, 1);

      service.setEnabled(firstRegistration.source.source_id, false);
      await assert.rejects(
        service.sync(firstRegistration.source.source_id, { idempotencyKey: "source-sync-test-0002" }),
        (error: unknown) => error instanceof FeedDomainError && error.code === "feed_source_paused",
      );
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("custom RSS registration rejects private and catalog-shadowing URLs before network", () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-feed-custom-rss-"));
  const databasePath = join(directory, "goalboard.sqlite");
  try {
    seedDemoBoard(databasePath);
    const store = new SqliteGoalBoardStore(databasePath);
    try {
      const service = new FeedSourceService(store.db, DEMO_BOARD_ID);
      assert.throws(
        () => service.register({ kind: "custom_rss", feed_url: "http://127.0.0.1/feed.xml" }),
        FeedDomainError,
      );
      const catalog = listFeedSourceCatalog()[0]!;
      assert.throws(
        () => service.register({ kind: "custom_rss", feed_url: catalog.feed_url }),
        (error: unknown) => error instanceof FeedDomainError && error.code === "feed_source_use_catalog",
      );
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Feed source Web API manages local sources and encrypted connector bindings", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-feed-source-api-"));
  const databasePath = join(directory, "goalboard.sqlite");
  const controlToken = "goalboard-feed-source-api-control-token";
  const oldHome = process.env.GOALBOARD_HOME;
  const oldBackend = process.env.GOALBOARD_SECRET_BACKEND;
  const oldNodeEnv = process.env.NODE_ENV;
  process.env.GOALBOARD_HOME = join(directory, "home");
  process.env.GOALBOARD_SECRET_BACKEND = "file";
  process.env.NODE_ENV = "test";
  resetSecretStoreCache();
  seedDemoBoard(databasePath);
  const server = createGoalBoardWebServer({
    databasePath,
    boardId: DEMO_BOARD_ID,
    homeDirectory: join(directory, "home"),
    controlToken,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    let mutation = 0;
    const mutate = async (pathname: string, method: string, body?: unknown) => {
      mutation += 1;
      return fetch(`${origin}${pathname}`, {
        method,
        headers: {
          origin,
          "content-type": "application/json",
          "x-goalboard-control-token": controlToken,
          "x-goalboard-idempotency-key": `feed-source-api-${mutation}`,
        },
        body: body == null ? undefined : JSON.stringify(body),
      });
    };
    const page = await (await fetch(origin)).text();
    assert.match(page, /data-feed-sources-dialog/);
    assert.match(page, /GoalBoard 直接保存来源、凭据、同步游标和正文/);
    assert.doesNotMatch(page, /不会迁移账号凭据/);

    const definition = listFeedSourceCatalog()[0]!;
    const registered = await mutate("/api/feed/sources", "POST", {
      kind: "rss",
      definition_id: definition.id,
    });
    assert.equal(registered.status, 201);
    const registeredBody = await registered.json() as { source: { source_id: string; sync_kind: string } };
    assert.equal(registeredBody.source.sync_kind, "public_source");

    const paused = await mutate(
      `/api/feed/sources/${encodeURIComponent(registeredBody.source.source_id)}/pause`,
      "POST",
      {},
    );
    assert.equal(paused.status, 200);
    assert.equal((await paused.json() as { source: { status: string } }).source.status, "paused");

    const bound = await mutate("/api/feed/connectors/github/token", "POST", {
      token: "github-test-token-12345",
    });
    assert.equal(bound.status, 200);
    const feed = await (await fetch(`${origin}/api/feed`)).json() as {
      sources: Array<{ kind: string; status: string }>;
      connector_auth: { github: { bound: boolean; hint?: string } };
      source_catalog: unknown[];
    };
    assert.equal(feed.connector_auth.github.bound, true);
    assert.equal(feed.connector_auth.github.hint, "…2345");
    assert.ok(feed.source_catalog.length > 0);
    assert.ok(feed.sources.some((source) => source.kind === "github" && source.status === "active"));
    assert.equal(JSON.stringify(feed).includes("github-test-token-12345"), false);

    const unbound = await mutate("/api/feed/connectors/github/token", "DELETE");
    assert.equal(unbound.status, 200);
    assert.equal((await unbound.json() as { connector_auth: { github: { bound: boolean } } })
      .connector_auth.github.bound, false);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    resetSecretStoreCache();
    if (oldHome == null) delete process.env.GOALBOARD_HOME;
    else process.env.GOALBOARD_HOME = oldHome;
    if (oldBackend == null) delete process.env.GOALBOARD_SECRET_BACKEND;
    else process.env.GOALBOARD_SECRET_BACKEND = oldBackend;
    if (oldNodeEnv == null) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
    rmSync(directory, { recursive: true, force: true });
  }
});

import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import {
  fingerprintSearchIntentExactV1,
  validateSearchIntentExactV1,
} from "@adeptify/intelligence-client";

import { FeedDomainError } from "../errors.js";
import { FeedStore } from "../store.js";
import type {
  FeedSourceRecord,
  FeedSourceRunRecord,
} from "../types.js";
import { createFeedSourceRuntime, type FeedSourceRuntime } from "./runtime.js";
import {
  FEED_CATEGORY_LABEL,
  listRegisterableFeeds,
} from "./catalog.js";
import {
  CUSTOM_RSS_DEFINITION_ID,
  customRssFeedHost,
  normalizeCustomRssFeedUrl,
} from "./custom-rss.js";
import {
  YOUTUBE_CHANNEL_DEFINITION_ID,
  YOUTUBE_PUBLIC_FEED_HOST,
  normalizeYouTubeChannelId,
  youtubeChannelFeedUrl,
} from "./youtube.js";
import type {
  IntelligenceCollectRequest,
  IntelligenceCollectResult,
} from "./intelligence-adapter.js";

const WEB_QUERY_DEFINITION_ID = "anysearch";
const DEFAULT_MAX_MATERIALS = 20;
const DEFAULT_MAX_BYTES = 1_000_000;
const DEFAULT_DEADLINE_MS = 15_000;

export type RegisterFeedSourceInput =
  | { kind: "rss"; definition_id: string }
  | { kind: "web_query"; query: string; name?: string }
  | { kind: "youtube_channel"; channel_id: string; name?: string }
  | { kind: "custom_rss"; feed_url: string; name?: string };

export interface FeedSourceSyncResult {
  source: FeedSourceRecord;
  run: FeedSourceRunRecord;
  created: number;
  deduped: number;
  replayed: boolean;
}

export interface FeedSourceCatalogView {
  id: string;
  name: string;
  kind: "rss";
  feed_url: string;
  category: string;
  category_label: string;
  limitations: readonly string[];
}

export function listFeedSourceCatalog(): FeedSourceCatalogView[] {
  return listRegisterableFeeds().filter((source) => source.enabled).map((source) => ({
    id: source.sourceId,
    name: source.name,
    kind: "rss" as const,
    feed_url: source.feedUrl,
    category: source.category,
    category_label: FEED_CATEGORY_LABEL[source.category],
    limitations: source.limitations ?? [],
  }));
}

export class FeedSourceService {
  readonly feed: FeedStore;

  constructor(
    readonly db: Database.Database,
    readonly boardId: string,
    private readonly runtimeFactory: (db: Database.Database) => FeedSourceRuntime =
      (database) => createFeedSourceRuntime({ db: database }),
  ) {
    this.feed = new FeedStore(db);
  }

  register(input: RegisterFeedSourceInput): { source: FeedSourceRecord; registered: boolean } {
    const normalized = normalizeRegistration(input);
    const existing = this.feed.findSource(
      this.boardId,
      "public_source",
      normalized.definitionId,
      normalized.configFingerprint,
    );
    if (existing) return { source: existing, registered: false };
    if (normalized.kind === "custom_rss") {
      const catalogHit = listRegisterableFeeds().some(
        (source) => sameHttpsUrl(source.feedUrl, String(normalized.config.feed_url)),
      );
      if (catalogHit) {
        throw new FeedDomainError("这个地址已在 RSS 目录，请直接添加目录来源", "feed_source_use_catalog");
      }
    }
    const now = new Date().toISOString();
    const source = this.feed.upsertSource({
      board_id: this.boardId,
      source_id: stableId("feed-source", `${this.boardId}\u0000${normalized.kind}\u0000${normalized.configFingerprint}`),
      kind: normalized.kind,
      definition_id: normalized.definitionId,
      sync_kind: "public_source",
      name: normalized.name,
      description: normalized.description,
      status: "active",
      enabled: true,
      item_count: 0,
      origin: "goalboard",
      config: { ...normalized.config, config_fingerprint: normalized.configFingerprint },
      cursor: {},
      credential_ref: null,
      account_label: null,
      last_sync_at: null,
      last_outcome: null,
      last_error_code: null,
      imported_at: now,
      updated_at: now,
    });
    appendSourceEvent(this.db, this.boardId, source.source_id, "feed_source.registered", "已注册 Feed 来源；尚未联网读取");
    return { source, registered: true };
  }

  setEnabled(sourceId: string, enabled: boolean): FeedSourceRecord {
    const source = this.feed.setSourceEnabled(this.boardId, sourceId, enabled);
    appendSourceEvent(
      this.db,
      this.boardId,
      sourceId,
      enabled ? "feed_source.resumed" : "feed_source.paused",
      enabled ? "已恢复 Feed 来源" : "已暂停 Feed 来源",
    );
    return source;
  }

  async sync(
    sourceId: string,
    input: { idempotencyKey: string; signal?: AbortSignal },
  ): Promise<FeedSourceSyncResult> {
    const source = this.feed.getSource(this.boardId, sourceId);
    if (source.sync_kind !== "public_source") {
      throw new FeedDomainError("这个来源不是公开 Feed 来源", "feed_source_wrong_sync_kind");
    }
    if (!source.enabled || source.status === "paused") {
      throw new FeedDomainError("来源已暂停，请先恢复", "feed_source_paused");
    }
    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
    const operationId = stableId("feed-operation", `${source.source_id}\u0000${idempotencyKey}`);
    const request = buildExactRequest(source, operationId);
    const planFingerprint = fingerprintSearchIntentExactV1(request);
    const prior = this.feed.getSourceRunByOperationId(this.boardId, operationId);
    if (prior?.phase === "terminal") {
      const storedFingerprint = prior.receipt?.intent_fingerprint;
      if (storedFingerprint && storedFingerprint !== planFingerprint) {
        throw new FeedDomainError("同一幂等键对应的来源配置已经变化", "feed_source_idempotency_conflict");
      }
      return {
        source: this.feed.getSource(this.boardId, sourceId),
        run: prior,
        created: 0,
        deduped: 0,
        replayed: true,
      };
    }

    const startedAt = new Date().toISOString();
    const running: FeedSourceRunRecord = {
      board_id: this.boardId,
      run_id: prior?.run_id ?? stableId("feed-run", operationId),
      operation_id: operationId,
      source_id: source.source_id,
      phase: "running",
      outcome: null,
      empty: false,
      error_code: null,
      receipt: { intent_fingerprint: planFingerprint },
      created_count: 0,
      deduped_count: 0,
      recovery_count: prior ? prior.recovery_count + 1 : 0,
      started_at: startedAt,
      completed_at: null,
      updated_at: startedAt,
    };
    this.feed.upsertSourceRun(running);
    appendSourceEvent(this.db, this.boardId, sourceId, "feed_source.sync_started", "开始同步 Feed 来源", {
      operation_id: operationId,
    });

    const runtime = this.runtimeFactory(this.db);
    try {
      const result = await runtime.intelligenceCollect.executeExact(
        request,
        input.signal ? { signal: input.signal } : undefined,
      );
      return this.commitPublicResult(source, running, result, runtime);
    } catch (error) {
      const current = this.feed.getSourceRunByOperationId(this.boardId, operationId);
      if (current?.phase === "terminal") {
        return {
          source: this.feed.getSource(this.boardId, sourceId),
          run: current,
          created: 0,
          deduped: 0,
          replayed: true,
        };
      }
      const updatedAt = new Date().toISOString();
      const errorCode = safeErrorCode(error);
      const interrupted: FeedSourceRunRecord = {
        ...running,
        phase: "interrupted",
        error_code: errorCode,
        updated_at: updatedAt,
      };
      this.db.transaction(() => {
        this.feed.upsertSourceRun(interrupted);
        const latest = this.feed.getSource(this.boardId, sourceId);
        this.feed.upsertSource({
          ...latest,
          status: latest.enabled ? "error" : "paused",
          last_error_code: errorCode,
          updated_at: updatedAt,
        });
        appendSourceEvent(this.db, this.boardId, sourceId, "feed_source.sync_interrupted", "来源同步未取得终态，可安全重试", {
          operation_id: operationId,
          error_code: errorCode,
        });
      }).immediate();
      throw new FeedDomainError(interruptedMessage(errorCode), "feed_source_sync_interrupted");
    } finally {
      await runtime.shutdown().catch(() => undefined);
    }
  }

  private commitPublicResult(
    entrySource: FeedSourceRecord,
    running: FeedSourceRunRecord,
    result: IntelligenceCollectResult,
    runtime: FeedSourceRuntime,
  ): FeedSourceSyncResult {
    const completedAt = new Date().toISOString();
    const consumable = result.outcome === "completed" || (result.outcome === "partial" && result.requirementMet);
    let created = 0;
    let deduped = 0;
    let durableSource = entrySource;
    let terminal!: FeedSourceRunRecord;
    this.db.transaction(() => {
      const latest = this.feed.getSource(this.boardId, entrySource.source_id);
      if (consumable) {
        for (const material of result.materials) {
          const externalId = `${latest.kind}:${sourceDedupeScope(latest)}:${material.candidateId}`;
          const ingested = this.feed.ingestItem({
            source: latest,
            externalId,
            title: material.title,
            summary: material.preview.replace(/\s+/gu, " ").trim().slice(0, 320),
            body: material.preview.slice(0, 1_600),
            url: material.canonicalUrl,
            kind: "update",
            priority: "medium",
            tags: [latest.kind, `feed-source:${latest.source_id}`],
            author: material.sourceName,
            occurredAt: material.capturedAt,
            material: {
              material_id: material.id,
              canonical_url: material.canonicalUrl,
              title: material.title,
              source_name: material.sourceName,
              published_at: material.publishedAt ?? null,
              preview: material.preview,
              content_hash: material.contentHash,
              content_ref: material.contentRef,
              content_available: runtime.content.has(material.contentRef),
              content_type: material.contentType,
              character_count: material.characterCount,
              captured_at: material.capturedAt,
              provenance: structuredClone(material.provenance) as unknown as Record<string, unknown>,
              selected_for_context: false,
            },
          });
          if (ingested.created) created += 1;
          else deduped += 1;
        }
      }
      const errorCode = terminalErrorCode(result);
      terminal = {
        ...running,
        phase: "terminal",
        outcome: result.outcome,
        empty: result.materials.length === 0,
        error_code: errorCode,
        receipt: {
          schema: "goalboard-feed-collection-receipt-v1",
          intent_fingerprint: result.intentFingerprint,
          requirement_met: result.requirementMet,
          receipts: structuredClone(result.receipts),
          budget: structuredClone(result.budget),
          warnings: [...result.warnings],
        },
        created_count: created,
        deduped_count: deduped,
        completed_at: completedAt,
        updated_at: completedAt,
      };
      durableSource = this.feed.upsertSource({
        ...latest,
        status: latest.enabled
          ? (result.outcome === "failed" || result.outcome === "reconciliation_required" ? "error" : "active")
          : "paused",
        item_count: latest.item_count + created,
        cursor: consumable ? cursorForMaterials(latest.cursor, result.materials) : latest.cursor,
        last_sync_at: consumable ? completedAt : latest.last_sync_at,
        last_outcome: result.outcome,
        last_error_code: errorCode,
        updated_at: completedAt,
      });
      this.feed.upsertSourceRun(terminal);
      appendSourceEvent(this.db, this.boardId, latest.source_id, "feed_source.sync_completed", `来源同步${result.outcome}：新增 ${created}，去重 ${deduped}`, {
        operation_id: running.operation_id,
        outcome: result.outcome,
        created,
        deduped,
      });
    }).immediate();
    return { source: durableSource, run: terminal, created, deduped, replayed: false };
  }
}

function normalizeRegistration(input: RegisterFeedSourceInput): {
  kind: string;
  definitionId: string;
  config: Record<string, unknown>;
  configFingerprint: string;
  name: string;
  description: string;
} {
  if (input.kind === "rss") {
    const definitionId = input.definition_id?.trim();
    const catalog = listRegisterableFeeds().find((source) => source.sourceId === definitionId && source.enabled);
    if (!catalog) throw new FeedDomainError("RSS 目录来源不存在", "feed_source_definition_unavailable");
    return {
      kind: "rss",
      definitionId: catalog.sourceId,
      config: { feed_url: catalog.feedUrl },
      configFingerprint: sha256(catalog.sourceId),
      name: catalog.name,
      description: "公开 RSS 来源；注册不联网，只在手动同步时读取。",
    };
  }
  if (input.kind === "web_query") {
    const query = normalizeQuery(input.query);
    return {
      kind: "web_query",
      definitionId: WEB_QUERY_DEFINITION_ID,
      config: { query },
      configFingerprint: sha256(query),
      name: bounded(input.name?.trim() || `网页查询：${bounded(query, 40)}`, 80),
      description: "固定公开网页查询；每次手动同步重新搜索，失败时不回退 Mock。",
    };
  }
  if (input.kind === "youtube_channel") {
    const channelId = normalizeYouTubeChannelId(input.channel_id);
    return {
      kind: "youtube_channel",
      definitionId: YOUTUBE_CHANNEL_DEFINITION_ID,
      config: { channel_id: channelId },
      configFingerprint: sha256(channelId),
      name: bounded(input.name?.trim() || "YouTube 公开频道", 80),
      description: "YouTube 官方公开频道最近视频；不读取评论、字幕或账号数据。",
    };
  }
  const feedUrl = normalizeCustomRssFeedUrl(input.feed_url);
  return {
    kind: "custom_rss",
    definitionId: CUSTOM_RSS_DEFINITION_ID,
    config: { feed_url: feedUrl },
    configFingerprint: sha256(feedUrl),
    name: bounded(input.name?.trim() || "自定义 RSS", 80),
    description: "自定义 HTTPS RSS/Atom；无凭据、无 Cookie，不跟随跨主机跳转。",
  };
}

function buildExactRequest(source: FeedSourceRecord, operationId: string): IntelligenceCollectRequest {
  const budget = {
    maxProviderCalls: 1,
    maxFetchExtractCalls: source.kind === "web_query" ? 3 : 0,
    maxModelInputTokens: 0,
    maxModelOutputTokens: 0,
    maxMaterials: source.kind === "web_query" ? 5 : DEFAULT_MAX_MATERIALS,
    maxBytes: DEFAULT_MAX_BYTES,
    maxConcurrency: 1,
    deadlineMs: source.kind === "web_query" ? 30_000 : DEFAULT_DEADLINE_MS,
  };
  if (source.kind === "web_query") {
    const query = normalizeQuery(String(source.config.query ?? ""));
    return validateSearchIntentExactV1({
      schema: "search-intent-v1",
      operationId,
      goal: `同步网页查询来源「${source.name}」到 GoalBoard Feed`,
      taskProfile: "latest_monitoring",
      mode: "exact",
      input: { kind: "query", query },
      sourcePolicy: {
        required: [
          { kind: "provider", value: "anysearch" },
          { kind: "channel", value: "web" },
          { kind: "source_definition", namespace: "app", value: WEB_QUERY_DEFINITION_ID },
        ],
        allowed: [
          { kind: "provider", value: "anysearch" },
          { kind: "channel", value: "web" },
          { kind: "source_definition", namespace: "app", value: WEB_QUERY_DEFINITION_ID },
        ],
      },
      budget,
      partialPolicy: "allow_partial",
      resultProfile: "materials_v1",
    });
  }
  let feedUrl: string;
  let definitionId = source.definition_id ?? "";
  if (source.kind === "youtube_channel") {
    feedUrl = youtubeChannelFeedUrl(normalizeYouTubeChannelId(String(source.config.channel_id ?? "")));
    definitionId = YOUTUBE_CHANNEL_DEFINITION_ID;
  } else if (source.kind === "custom_rss") {
    feedUrl = normalizeCustomRssFeedUrl(String(source.config.feed_url ?? ""));
    definitionId = CUSTOM_RSS_DEFINITION_ID;
  } else {
    const catalog = listRegisterableFeeds().find((entry) => entry.sourceId === source.definition_id);
    if (!catalog) throw new FeedDomainError("RSS 目录来源不存在", "feed_source_definition_unavailable");
    feedUrl = catalog.feedUrl;
    definitionId = catalog.sourceId;
  }
  const domain = source.kind === "youtube_channel"
    ? YOUTUBE_PUBLIC_FEED_HOST
    : source.kind === "custom_rss"
      ? customRssFeedHost(feedUrl)
      : new URL(feedUrl).hostname.toLowerCase();
  return validateSearchIntentExactV1({
    schema: "search-intent-v1",
    operationId,
    goal: `同步公开来源「${source.name}」到 GoalBoard Feed`,
    taskProfile: "exact_rss_ingest",
    mode: "exact",
    input: { kind: "feed", url: feedUrl },
    sourcePolicy: {
      required: [
        { kind: "url", value: feedUrl },
        { kind: "source_definition", namespace: "app", value: definitionId },
      ],
      allowed: [
        { kind: "domain", value: domain },
        { kind: "source_definition", namespace: "app", value: definitionId },
      ],
    },
    budget,
    partialPolicy: "allow_partial",
    resultProfile: "materials_v1",
  });
}

function sourceDedupeScope(source: FeedSourceRecord): string {
  return source.kind === "rss" ? (source.definition_id ?? source.source_id) : source.source_id;
}

function cursorForMaterials(current: unknown, materials: IntelligenceCollectResult["materials"]): unknown {
  if (materials.length === 0) return current;
  const newest = [...materials].sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))[0]!;
  return {
    lastCapturedAt: newest.capturedAt,
    ...(newest.publishedAt ? { lastPublishedAt: newest.publishedAt } : {}),
    lastCandidateId: newest.candidateId,
  };
}

function terminalErrorCode(result: IntelligenceCollectResult): string | null {
  if (!["failed", "cancelled", "reconciliation_required"].includes(result.outcome)) return null;
  const stopReason = result.budget.stopReason;
  if (isSafeCode(stopReason)) return stopReason;
  const receiptCode = result.receipts
    .map((receipt) => "errorCode" in receipt ? receipt.errorCode : undefined)
    .find(isSafeCode);
  return receiptCode ?? (result.outcome === "failed" ? "provider_failed" : result.outcome);
}

function safeErrorCode(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
  return isSafeCode(code) ? code : "provider_interrupted";
}

function isSafeCode(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_]{1,63}$/u.test(value);
}

function interruptedMessage(code: string): string {
  if (code === "feed_parse_failed") return "同步失败：源站返回的不是可解析 RSS/Atom，本次未导入内容。";
  if (code === "feed_unavailable") return "同步失败：源站不可用或返回空正文，本机已有内容未被覆盖。";
  if (code === "budget_exhausted") return "同步失败：公开搜索额度已耗尽，没有回退到模拟数据。";
  return "同步未取得可信终态，本次没有写成成功；可稍后安全重试。";
}

function normalizeIdempotencyKey(value: string): string {
  const key = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$/u.test(key)) {
    throw new FeedDomainError("同步需要 8–128 位幂等键", "feed_source_idempotency_required");
  }
  return key;
}

function normalizeQuery(value: string): string {
  const query = value.trim().replace(/\s+/gu, " ");
  const length = Array.from(query).length;
  if (length < 2 || length > 500) {
    throw new FeedDomainError("网页查询需要 2–500 个字符", "feed_source_query_invalid");
  }
  return query;
}

function appendSourceEvent(
  db: Database.Database,
  boardId: string,
  sourceId: string,
  type: string,
  reason: string,
  payload: Record<string, unknown> = {},
): void {
  db.prepare(`
    INSERT INTO events (
      event_id, board_id, actor_id, type, object_type, object_id, reason, payload_json, at
    ) VALUES (?, ?, 'feed-source-service', ?, 'feed_source', ?, ?, ?, ?)
  `).run(
    `event-${stableId("feed", `${sourceId}\u0000${type}\u0000${Date.now()}\u0000${Math.random()}`)}`,
    boardId,
    type,
    sourceId,
    reason,
    JSON.stringify(payload),
    new Date().toISOString(),
  );
}

function stableId(prefix: string, value: string): string {
  return `${prefix}-${sha256(value).slice(0, 32)}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function bounded(value: string, max: number): string {
  const characters = Array.from(value.trim());
  return characters.length <= max ? characters.join("") : `${characters.slice(0, max).join("")}…`;
}

function sameHttpsUrl(left: string, right: string): boolean {
  try {
    const a = new URL(left);
    const b = new URL(right);
    a.hash = "";
    b.hash = "";
    return a.protocol === "https:" && b.protocol === "https:" && a.toString() === b.toString();
  } catch {
    return false;
  }
}

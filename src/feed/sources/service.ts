import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import {
  fingerprintSearchIntentExactV1,
  validateSearchIntentExactV1,
} from "@adeptify/intelligence-client";

import { FeedDomainError } from "../errors.js";
import { FeedStore, sourceDeletedAt } from "../store.js";
import type {
  FeedSourceSchedule,
  FeedSourceRecord,
  FeedSourceRunRecord,
  SourceHistoryDecision,
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
import {
  GMAIL_DEFAULT_SCOPE,
  parseGmailScope,
} from "../connectors/gmail-scope.js";
import {
  isRssSourceKind,
  readRssHttpState,
  withRssHttpFailure,
  withRssHttpSuccess,
  type RssFetchReceipt,
} from "./rss-http.js";
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

export interface UpdateFeedSourceInput {
  name?: string;
  description?: string;
  scope?: string;
  feed_url?: string;
}

export type ConfigureFeedSourceScheduleInput =
  | { mode: "manual" }
  | { mode: "interval"; enabled: boolean; interval_minutes: number };

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
    private readonly runtimeFactory: (db: Database.Database, source?: FeedSourceRecord) => FeedSourceRuntime =
      (database, source) => createFeedSourceRuntime({ db: database, sourceCursor: source?.cursor }),
    private readonly now: () => Date = () => new Date(),
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
      schedule: { mode: "manual" },
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
    this.activeSource(sourceId);
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

  update(sourceId: string, input: UpdateFeedSourceInput): FeedSourceRecord {
    const source = this.activeSource(sourceId);
    const now = this.now().toISOString();
    const name = input.name == null ? source.name : bounded(input.name.trim(), 80);
    if (!name) throw new FeedDomainError("来源名称不能为空", "feed_source_invalid_configuration");
    const description = input.description == null
      ? source.description
      : bounded(input.description.trim(), 320);
    let scope = input.scope == null ? source.config.scope : bounded(input.scope.trim(), 500);
    let config = { ...source.config };
    let cursor = source.cursor;
    if (source.sync_kind === "gmail" && input.scope != null) {
      if (!input.scope.trim()) {
        scope = GMAIL_DEFAULT_SCOPE;
      } else {
        const supported = parseGmailScope(input.scope);
        if (!supported) {
          throw new FeedDomainError(
            "Gmail 拉取范围必须选择未读收件箱、全部收件箱、星标邮件或重要邮件",
            "feed_source_invalid_configuration",
          );
        }
        scope = supported;
      }
    }
    if (input.feed_url != null) {
      if (source.kind !== "custom_rss") {
        throw new FeedDomainError(
          "只有自定义 RSS / Atom 可以修改 Feed 地址",
          "feed_source_invalid_configuration",
        );
      }
      const feedUrl = normalizeCustomRssFeedUrl(input.feed_url);
      if (listRegisterableFeeds().some((entry) => sameHttpsUrl(entry.feedUrl, feedUrl))) {
        throw new FeedDomainError("这个地址已在 RSS 目录，请直接添加目录来源", "feed_source_use_catalog");
      }
      const fingerprint = sha256(feedUrl);
      const existing = this.feed.findSource(this.boardId, "public_source", CUSTOM_RSS_DEFINITION_ID, fingerprint);
      if (existing && existing.source_id !== source.source_id) {
        throw new FeedDomainError("这个自定义 RSS / Atom 已经存在", "feed_source_idempotency_conflict");
      }
      config = { ...config, feed_url: feedUrl, config_fingerprint: fingerprint };
      cursor = {};
    }
    const updated = this.feed.upsertSource({
      ...source,
      name,
      description,
      config: { ...config, ...(scope == null ? {} : { scope }) },
      cursor,
      ...(input.feed_url == null ? {} : { status: source.enabled ? "active" : "paused", last_error_code: null }),
      updated_at: now,
    });
    appendSourceEvent(this.db, this.boardId, sourceId, "feed_source.configuration_updated", "来源配置已更新");
    return updated;
  }

  configureSchedule(
    sourceId: string,
    input: ConfigureFeedSourceScheduleInput,
  ): FeedSourceRecord {
    const source = this.activeSource(sourceId);
    const now = this.now();
    let schedule: FeedSourceSchedule;
    if (input.mode === "manual") {
      schedule = { mode: "manual" };
    } else {
      if (!Number.isInteger(input.interval_minutes) || input.interval_minutes < 5 || input.interval_minutes > 10_080) {
        throw new FeedDomainError("拉取间隔必须在 5 分钟到 7 天之间", "feed_source_invalid_schedule");
      }
      schedule = {
        mode: "interval",
        enabled: input.enabled,
        interval_minutes: input.interval_minutes,
        next_pull_at: input.enabled
          ? new Date(now.getTime() + input.interval_minutes * 60_000).toISOString()
          : null,
      };
    }
    const updated = this.feed.upsertSource({
      ...source,
      schedule,
      updated_at: now.toISOString(),
    });
    appendSourceEvent(this.db, this.boardId, sourceId, "feed_source.schedule_updated", "来源拉取计划已更新", {
      mode: schedule.mode,
      ...(schedule.mode === "interval" ? {
        enabled: schedule.enabled,
        interval_minutes: schedule.interval_minutes,
        next_pull_at: schedule.next_pull_at,
      } : {}),
    });
    return updated;
  }

  dueSources(at: Date = this.now()): FeedSourceRecord[] {
    const timestamp = at.getTime();
    return this.feed.snapshot(this.boardId).sources.filter((source) => {
      const schedule = source.schedule;
      if (!source.enabled || source.status === "paused" || source.status === "disconnected") return false;
      if (schedule.mode !== "interval" || !schedule.enabled || !schedule.next_pull_at) return false;
      const next = Date.parse(schedule.next_pull_at);
      return Number.isFinite(next) && next <= timestamp;
    });
  }

  advanceSchedule(sourceId: string, plannedAt: string, attemptedAt: Date = this.now()): FeedSourceRecord | null {
    const source = this.feed.getSource(this.boardId, sourceId);
    if (sourceDeletedAt(source) || source.schedule.mode !== "interval") return null;
    if (source.schedule.next_pull_at !== plannedAt) return source;
    const intervalMs = source.schedule.interval_minutes * 60_000;
    let next = Date.parse(plannedAt);
    if (!Number.isFinite(next)) next = attemptedAt.getTime();
    do next += intervalMs;
    while (next <= attemptedAt.getTime());
    return this.feed.upsertSource({
      ...source,
      schedule: { ...source.schedule, next_pull_at: new Date(next).toISOString() },
      updated_at: attemptedAt.toISOString(),
    });
  }

  disconnect(sourceId: string): FeedSourceRecord {
    const source = this.activeSource(sourceId);
    const now = this.now().toISOString();
    const disconnected = this.feed.upsertSource({
      ...source,
      status: "disconnected",
      enabled: false,
      schedule: { mode: "manual" },
      cursor: {},
      credential_ref: null,
      config: { ...source.config, token_refs: undefined },
      last_error_code: null,
      updated_at: now,
    });
    appendSourceEvent(this.db, this.boardId, sourceId, "feed_source.disconnected", "来源已断开并停止拉取");
    return disconnected;
  }

  delete(sourceId: string, historyDecision: SourceHistoryDecision): FeedSourceRecord {
    this.activeSource(sourceId);
    return this.feed.retireSource(this.boardId, sourceId, historyDecision);
  }

  async sync(
    sourceId: string,
    input: { idempotencyKey: string; signal?: AbortSignal },
  ): Promise<FeedSourceSyncResult> {
    const source = this.activeSource(sourceId);
    if (source.sync_kind !== "public_source") {
      throw new FeedDomainError("这个来源不是公开 Feed 来源", "feed_source_wrong_sync_kind");
    }
    if (!source.enabled || source.status === "paused" || source.status === "disconnected") {
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

    const runtime = this.runtimeFactory(this.db, source);
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
        const rssFailure = isRssSourceKind(latest.kind)
          ? withRssHttpFailure(latest.cursor)
          : null;
        const actionable = rssFailure
          ? rssFailureAction(errorCode, rssFailure.failures)
          : null;
        this.feed.upsertSource({
          ...latest,
          status: latest.enabled ? (actionable ? "error" : rssFailure ? "active" : "error") : "paused",
          cursor: rssFailure?.cursor ?? latest.cursor,
          last_error_code: errorCode,
          updated_at: updatedAt,
        });
        appendSourceEvent(this.db, this.boardId, sourceId, "feed_source.sync_interrupted", "来源同步未取得终态，可安全重试", {
          operation_id: operationId,
          error_code: errorCode,
        });
      }).immediate();
      const failedSource = this.feed.getSource(this.boardId, sourceId);
      if (isRssSourceKind(failedSource.kind)) {
        const failures = readRssHttpState(failedSource.cursor).consecutive_failures;
        const actionable = rssFailureAction(errorCode, failures);
        if (actionable) this.recordRssSourceFault(failedSource, errorCode, actionable, updatedAt);
      }
      throw new FeedDomainError(interruptedMessage(errorCode), "feed_source_sync_interrupted");
    } finally {
      await runtime.shutdown().catch(() => undefined);
    }
  }

  private activeSource(sourceId: string): FeedSourceRecord {
    const source = this.feed.getSource(this.boardId, sourceId);
    if (sourceDeletedAt(source)) throw new FeedDomainError("找不到这个来源", "feed_source_not_found");
    return source;
  }

  private commitPublicResult(
    entrySource: FeedSourceRecord,
    running: FeedSourceRunRecord,
    result: IntelligenceCollectResult,
    runtime: FeedSourceRuntime,
  ): FeedSourceSyncResult {
    const completedAt = new Date().toISOString();
    const consumable = result.outcome === "completed" || (result.outcome === "partial" && result.requirementMet);
    const rssSource = isRssSourceKind(entrySource.kind);
    const rssReceipt = rssSource ? runtime.publicFeedReceipt?.() ?? null : null;
    let created = 0;
    let deduped = 0;
    let durableSource = entrySource;
    let terminal!: FeedSourceRunRecord;
    let actionableRssFailure: ReturnType<typeof rssFailureAction> = null;
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
      const cursorWithMaterials = consumable
        ? cursorForMaterials(latest.cursor, result.materials)
        : latest.cursor;
      const rssCursor = rssSource
        ? consumable
          ? { cursor: withRssHttpSuccess(cursorWithMaterials, rssReceipt, completedAt), failures: 0 }
          : withRssHttpFailure(cursorWithMaterials)
        : { cursor: cursorWithMaterials, failures: 0 };
      actionableRssFailure = rssSource && !consumable && errorCode
        ? rssFailureAction(errorCode, rssCursor.failures)
        : null;
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
          ...(rssReceipt ? { rss_http: safeRssReceipt(rssReceipt) } : {}),
        },
        created_count: created,
        deduped_count: deduped,
        completed_at: completedAt,
        updated_at: completedAt,
      };
      durableSource = this.feed.upsertSource({
        ...latest,
        status: latest.enabled
          ? (actionableRssFailure
              ? "error"
              : rssSource && !consumable
                ? "active"
                : result.outcome === "failed" || result.outcome === "reconciliation_required"
                  ? "error"
                  : "active")
          : "paused",
        item_count: latest.item_count + created,
        cursor: rssCursor.cursor,
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
    if (rssSource) {
      if (consumable) this.resolveRssSourceFaults(entrySource.source_id);
      else if (actionableRssFailure && terminal.error_code) {
        this.recordRssSourceFault(durableSource, terminal.error_code, actionableRssFailure, completedAt);
      }
    }
    return { source: durableSource, run: terminal, created, deduped, replayed: false };
  }

  private recordRssSourceFault(
    source: FeedSourceRecord,
    errorCode: string,
    action: { category: "configuration" | "provider"; retryable: boolean; user_action: "fix_configuration" | "retry" },
    at: string,
  ): void {
    const stored = this.feed.createInboxEntry({
      boardId: this.boardId,
      subjectType: "source_fault",
      subjectId: source.source_id,
      reason: "source_fault",
      detail: {
        error_code: errorCode,
        category: action.category,
        retryable: action.retryable,
        user_action: action.user_action,
        detected_at: at,
      },
      at,
    });
    if (stored.entry.status === "done" || stored.entry.status === "dismissed") {
      this.feed.setInboxEntryStatus(this.boardId, stored.entry.entry_id, "open", stored.entry.revision);
    }
  }

  private resolveRssSourceFaults(sourceId: string): void {
    for (const entry of this.feed.listInboxEntries(this.boardId)) {
      if (
        entry.subject_type === "source_fault"
        && entry.subject_id === sourceId
        && (entry.status === "open" || entry.status === "in_progress")
      ) {
        this.feed.setInboxEntryStatus(this.boardId, entry.entry_id, "done", entry.revision);
      }
    }
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
    ...(current && typeof current === "object" && !Array.isArray(current) ? current : {}),
    lastCapturedAt: newest.capturedAt,
    ...(newest.publishedAt ? { lastPublishedAt: newest.publishedAt } : {}),
    lastCandidateId: newest.candidateId,
  };
}

function rssFailureAction(
  errorCode: string,
  failures: number,
): { category: "configuration" | "provider"; retryable: boolean; user_action: "fix_configuration" | "retry" } | null {
  if (["feed_parse_failed", "provider_protocol_invalid", "plan_invalid"].includes(errorCode)) {
    return { category: "configuration", retryable: false, user_action: "fix_configuration" };
  }
  if (failures >= 3) {
    return { category: "provider", retryable: true, user_action: "retry" };
  }
  return null;
}

function safeRssReceipt(receipt: RssFetchReceipt): Record<string, unknown> {
  return {
    status: receipt.status,
    not_modified: receipt.not_modified,
    final_url: receipt.final_url,
    validator: receipt.etag ? "etag" : receipt.last_modified ? "last_modified" : "none",
    ...(receipt.feed_title ? { feed_title: receipt.feed_title } : {}),
    ...(receipt.home_url ? { home_url: receipt.home_url } : {}),
  };
}

function terminalErrorCode(result: IntelligenceCollectResult): string | null {
  if (!["failed", "cancelled", "reconciliation_required"].includes(result.outcome)) return null;
  const receiptCode = result.receipts
    .map((receipt) => "errorCode" in receipt ? receipt.errorCode : undefined)
    .find(isSafeCode);
  if (receiptCode) return receiptCode;
  const stopReason = result.budget.stopReason;
  if (isSafeCode(stopReason)) return stopReason;
  return result.outcome === "failed" ? "provider_failed" : result.outcome;
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

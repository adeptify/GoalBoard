import { createHash } from "node:crypto";
import type Database from "better-sqlite3";

import { FeedDomainError } from "../errors.js";
import { createFileSecretStore, peekSealedEntry } from "../security/secret-store.js";
import { FeedStore } from "../store.js";
import type { FeedSourceRecord, FeedSourceRunRecord } from "../types.js";
import {
  bindConnectorToken,
  connectorCredentialStatus,
  GITHUB_AUTH_REF,
  GMAIL_AUTH_REF,
  unbindConnectorToken,
  type ConnectorCredentialKind,
} from "./credentials.js";
import { createGithubConnector } from "./github.js";
import {
  pollGithubDeviceFlow,
  startGithubDeviceFlow,
  storeGithubClientId,
} from "./github-oauth.js";
import { createGmailConnector } from "./gmail.js";
import {
  completeGmailOAuthFlow,
  defaultGmailRedirectUri,
  gmailOAuthConfigured,
  startGmailOAuthFlow,
  storeGmailOAuthClient,
  type GmailOAuthComplete,
} from "./gmail-oauth.js";
import { gmailInstallationSecretRefs } from "./gmail-installations.js";
import type { ConnectorPort, ConnectorSyncMode, ConnectorSyncResult } from "./types.js";

export interface ConnectorAuthStatus {
  github: ReturnType<typeof connectorCredentialStatus>;
  gmail: ReturnType<typeof connectorCredentialStatus>;
  github_client_id_configured: boolean;
  gmail_oauth_configured: boolean;
  gmail_redirect_uri: string;
}

export class FeedConnectorService {
  readonly feed: FeedStore;

  constructor(
    readonly db: Database.Database,
    readonly boardId: string,
    private readonly connectorFactory?: (source: FeedSourceRecord) => ConnectorPort,
  ) {
    this.feed = new FeedStore(db);
  }

  ensureSources(): FeedSourceRecord[] {
    const now = new Date().toISOString();
    const ensure = (
      kind: "github" | "gmail",
      name: string,
      credentialRef: string,
      credential: ReturnType<typeof connectorCredentialStatus>,
    ): FeedSourceRecord => {
      const sourceId = stableId("feed-source", `${this.boardId}\u0000connector\u0000${kind}`);
      try {
        const current = this.feed.getSource(this.boardId, sourceId);
        const nextStatus = current.status === "paused"
          ? "paused"
          : credential.problem
            ? "error"
            : credential.bound
            ? (current.status === "disconnected" ? "active" : current.status)
            : "disconnected";
        const nextError = credential.problem ?? (credential.bound ? current.last_error_code : null);
        if (
          nextStatus !== current.status
          || current.credential_ref !== credentialRef
          || current.last_error_code !== nextError
        ) {
          return this.feed.upsertSource({
            ...current,
            status: nextStatus,
            credential_ref: credentialRef,
            last_error_code: nextError,
            updated_at: now,
          });
        }
        return current;
      } catch {
        return this.feed.upsertSource({
          board_id: this.boardId,
          source_id: sourceId,
          kind,
          definition_id: kind,
          sync_kind: kind,
          name,
          description: kind === "github"
            ? "GitHub Issues、PR 与 Review 请求；仅手动同步。"
            : "Gmail 未读邮件；OAuth 凭据加密保存，仅手动同步。",
          status: credential.problem ? "error" : credential.bound ? "active" : "disconnected",
          enabled: true,
          item_count: 0,
          origin: "goalboard",
          config: {},
          cursor: {},
          credential_ref: credentialRef,
          account_label: null,
          last_sync_at: null,
          last_outcome: null,
          last_error_code: credential.problem ?? null,
          imported_at: now,
          updated_at: now,
        });
      }
    };
    const github = connectorCredentialStatus("github");
    const gmail = connectorCredentialStatus("gmail");
    return [
      ensure("github", "GitHub", GITHUB_AUTH_REF, github),
      ensure("gmail", "Gmail", GMAIL_AUTH_REF, gmail),
    ];
  }

  authStatus(): ConnectorAuthStatus {
    const githubClientIdBound = connectorClientIdBound("github");
    return {
      github: connectorCredentialStatus("github"),
      gmail: connectorCredentialStatus("gmail"),
      github_client_id_configured: Boolean(process.env.GOALBOARD_GITHUB_CLIENT_ID || githubClientIdBound),
      gmail_oauth_configured: gmailOAuthConfigured(),
      gmail_redirect_uri: defaultGmailRedirectUri(),
    };
  }

  bindToken(kind: ConnectorCredentialKind, token: string): ConnectorAuthStatus {
    bindConnectorToken(kind, token);
    this.ensureSources();
    this.markConnectorBound(kind);
    return this.authStatus();
  }

  unbind(kind: ConnectorCredentialKind): ConnectorAuthStatus {
    unbindConnectorToken(kind);
    const now = new Date().toISOString();
    const matching = this.feed.snapshot(this.boardId).sources
      .filter((source) => source.sync_kind === kind);
    if (kind === "gmail") {
      const secrets = createFileSecretStore();
      for (const source of matching) {
        const refs = source.config.token_refs;
        if (isGmailTokenRefs(refs)) {
          for (const ref of Object.values(refs)) secrets.delete(ref);
        }
      }
    }
    for (const source of matching.length ? matching : [this.connectorSource(kind)]) {
      this.feed.upsertSource({
        ...source,
        status: "disconnected",
        enabled: true,
        cursor: {},
        credential_ref: source.credential_ref ?? (kind === "github" ? GITHUB_AUTH_REF : GMAIL_AUTH_REF),
        account_label: kind === "github" ? source.account_label : null,
        updated_at: now,
      });
    }
    return this.authStatus();
  }

  configureGithubClient(clientId: string): ConnectorAuthStatus {
    const value = clientId.trim();
    if (!value) throw new FeedDomainError("GitHub Client ID 不能为空", "connector_invalid_client_id");
    storeGithubClientId(value);
    return this.authStatus();
  }

  async startGithubDevice(clientId?: string) {
    const started = await startGithubDeviceFlow({ clientId });
    return {
      device_code: started.deviceCode,
      user_code: started.userCode,
      verification_uri: started.verificationUri,
      expires_in: started.expiresIn,
      interval: started.interval,
    };
  }

  async pollGithubDevice(deviceCode: string, clientId?: string) {
    const result = await pollGithubDeviceFlow({ deviceCode, clientId });
    if (result.status === "authorized") {
      this.ensureSources();
      this.markConnectorBound("github");
    }
    return { status: result.status, message: result.message };
  }

  configureGmailClient(clientId: string, clientSecret?: string): ConnectorAuthStatus {
    const value = clientId.trim();
    if (!value) throw new FeedDomainError("Gmail Client ID 不能为空", "connector_invalid_client_id");
    storeGmailOAuthClient({ clientId: value, clientSecret: clientSecret?.trim() || undefined });
    return this.authStatus();
  }

  async startGmailOAuth(input: { clientId?: string; clientSecret?: string; redirectUri?: string }) {
    return startGmailOAuthFlow({
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      redirectUri: input.redirectUri,
    });
  }

  async completeGmailOAuth(input: { code: string; state?: string }): Promise<GmailOAuthComplete> {
    let scoped: { installationId: string; email?: string } | undefined;
    const result = await completeGmailOAuthFlow({
      code: input.code,
      state: input.state,
      resolveRefs: (email) => {
        if (!email) return undefined;
        const installationId = stableId("gmail-installation", email.trim().toLowerCase());
        scoped = { installationId, email };
        return gmailInstallationSecretRefs(installationId);
      },
    });
    this.ensureSources();
    const source = this.connectorSource("gmail");
    const now = new Date().toISOString();
    if (scoped) {
      const sourceId = stableId(
        "feed-source",
        `${this.boardId}\u0000connector\u0000gmail\u0000${scoped.installationId}`,
      );
      this.feed.upsertSource({
        ...source,
        source_id: sourceId,
        name: `Gmail · ${scoped.email || "已连接账号"}`,
        status: "active",
        enabled: true,
        origin: "goalboard",
        account_label: scoped.email ?? null,
        config: {
          installation_id: scoped.installationId,
          token_refs: gmailInstallationSecretRefs(scoped.installationId),
        },
        credential_ref: gmailInstallationSecretRefs(scoped.installationId).access,
        imported_at: now,
        updated_at: now,
      });
      // The fixed Gmail source remains only as a compatibility shell. Once an
      // account-scoped source exists, pausing it prevents duplicate reads via
      // the mirrored legacy token.
      this.feed.upsertSource({
        ...source,
        status: "paused",
        enabled: false,
        description: "Gmail 兼容入口；账号已拆分为独立来源，避免重复同步。",
        updated_at: now,
      });
    } else {
      this.feed.upsertSource({
        ...source,
        status: "active",
        account_label: result.email ?? source.account_label,
        updated_at: now,
      });
    }
    return result;
  }

  async sync(
    sourceId: string,
    input: { idempotencyKey: string; mode?: ConnectorSyncMode },
  ): Promise<{ source: FeedSourceRecord; run: FeedSourceRunRecord; created: number; deduped: number; replayed: boolean }> {
    const source = this.feed.getSource(this.boardId, sourceId);
    if (source.sync_kind !== "github" && source.sync_kind !== "gmail") {
      throw new FeedDomainError("这个来源不是账号连接器", "connector_wrong_sync_kind");
    }
    if (!source.enabled || source.status === "paused") {
      throw new FeedDomainError("来源已暂停，请先恢复", "feed_source_paused");
    }
    const key = normalizeIdempotencyKey(input.idempotencyKey);
    const operationId = stableId("connector-operation", `${source.source_id}\u0000${key}\u0000${input.mode ?? "normal"}`);
    const prior = this.feed.getSourceRunByOperationId(this.boardId, operationId);
    if (prior?.phase === "terminal") {
      return { source: this.feed.getSource(this.boardId, sourceId), run: prior, created: 0, deduped: 0, replayed: true };
    }
    const startedAt = new Date().toISOString();
    const running: FeedSourceRunRecord = {
      board_id: this.boardId,
      run_id: prior?.run_id ?? stableId("connector-run", operationId),
      operation_id: operationId,
      source_id: source.source_id,
      phase: "running",
      outcome: null,
      empty: false,
      error_code: null,
      receipt: null,
      created_count: 0,
      deduped_count: 0,
      recovery_count: prior ? prior.recovery_count + 1 : 0,
      started_at: startedAt,
      completed_at: null,
      updated_at: startedAt,
    };
    this.feed.upsertSourceRun(running);
    const port = this.portFor(source);
    let result: ConnectorSyncResult;
    try {
      result = await port.sync({ cursor: source.cursor, mode: input.mode ?? "normal" });
    } catch (error) {
      const updatedAt = new Date().toISOString();
      const errorCode = safeConnectorErrorCode(error);
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
        appendConnectorEvent(
          this.db,
          this.boardId,
          source.source_id,
          "feed_connector.sync_interrupted",
          `${source.name} 同步未取得终态，可安全重试`,
          { operation_id: operationId, error_code: errorCode },
        );
      }).immediate();
      throw new FeedDomainError("连接器同步未取得可信终态，本次没有写成成功；可稍后安全重试。", "feed_source_sync_interrupted");
    }
    const completedAt = new Date().toISOString();
    if (!result.ok) {
      const failed: FeedSourceRunRecord = {
        ...running,
        phase: "terminal",
        outcome: "failed",
        error_code: `connector_${result.failure}`,
        receipt: {
          mode: result.mode,
          failure: result.failure,
          ...(result.httpStatus == null ? {} : { http_status: result.httpStatus }),
          ...(result.action ? { recovery_action: result.action } : {}),
        },
        completed_at: completedAt,
        updated_at: completedAt,
      };
      this.db.transaction(() => {
        this.feed.upsertSourceRun(failed);
        this.feed.upsertSource({
          ...source,
          status: "error",
          last_outcome: "failed",
          last_error_code: failed.error_code,
          updated_at: completedAt,
        });
        appendConnectorEvent(this.db, this.boardId, source.source_id, "feed_connector.sync_failed", `${source.name} 同步失败：${result.message}`, {
          failure: result.failure,
          ...(result.action ? { action: result.action } : {}),
        });
      }).immediate();
      throw new FeedDomainError(
        result.action ? `${result.message} — ${result.action}` : result.message,
        failed.error_code!,
      );
    }

    let created = 0;
    let deduped = 0;
    let durableSource = source;
    let terminal!: FeedSourceRunRecord;
    this.db.transaction(() => {
      const latest = this.feed.getSource(this.boardId, source.source_id);
      for (const raw of result.items) {
        const externalId = `${latest.source_id}:${raw.externalId}`;
        const ingested = this.feed.ingestItem({
          source: latest,
          externalId,
          title: raw.title,
          summary: raw.summary,
          body: raw.body,
          url: raw.url,
          kind: raw.kind,
          priority: raw.priority,
          tags: raw.tags,
          author: raw.author,
          occurredAt: completedAt,
        });
        if (ingested.created) created += 1;
        else deduped += 1;
      }
      terminal = {
        ...running,
        phase: "terminal",
        outcome: "completed",
        empty: result.items.length === 0,
        receipt: { mode: result.mode, sync_mode: input.mode ?? "normal" },
        created_count: created,
        deduped_count: deduped,
        completed_at: completedAt,
        updated_at: completedAt,
      };
      durableSource = this.feed.upsertSource({
        ...latest,
        status: result.mode === "live" ? "active" : "error",
        item_count: latest.item_count + created,
        cursor: result.cursor,
        last_sync_at: completedAt,
        last_outcome: "completed",
        last_error_code: result.mode === "live" ? null : "fixture_not_live",
        updated_at: completedAt,
      });
      this.feed.upsertSourceRun(terminal);
      appendConnectorEvent(this.db, this.boardId, source.source_id, "feed_connector.sync_completed", `${source.name} 同步完成：新增 ${created}，去重 ${deduped}`, {
        created,
        deduped,
      });
    }).immediate();
    return { source: durableSource, run: terminal, created, deduped, replayed: false };
  }

  private connectorSource(kind: "github" | "gmail"): FeedSourceRecord {
    this.ensureSources();
    return this.feed.getSource(
      this.boardId,
      stableId("feed-source", `${this.boardId}\u0000connector\u0000${kind}`),
    );
  }

  private markConnectorBound(kind: "github" | "gmail"): void {
    const source = this.connectorSource(kind);
    this.feed.upsertSource({
      ...source,
      status: "active",
      credential_ref: kind === "github" ? GITHUB_AUTH_REF : GMAIL_AUTH_REF,
      updated_at: new Date().toISOString(),
    });
  }

  private portFor(source: FeedSourceRecord): ConnectorPort {
    if (this.connectorFactory) return this.connectorFactory(source);
    if (source.sync_kind === "github") return createGithubConnector({ allowFixture: false });
    const tokenRefs = source.config.token_refs;
    return createGmailConnector({
      allowFixture: false,
      ...(isGmailTokenRefs(tokenRefs) ? { tokenRefs } : {}),
    });
  }
}

function isGmailTokenRefs(value: unknown): value is { refresh: string; access: string; expiresAt: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return [record.refresh, record.access, record.expiresAt].every((entry) => typeof entry === "string" && entry.length > 0);
}

function connectorClientIdBound(kind: "github"): boolean {
  if (kind !== "github") return false;
  try {
    return Boolean(peekSealedEntry("connector:github:client_id"));
  } catch {
    return false;
  }
}

function normalizeIdempotencyKey(value: string): string {
  const key = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$/u.test(key)) {
    throw new FeedDomainError("同步需要 8–128 位幂等键", "feed_source_idempotency_required");
  }
  return key;
}

function safeConnectorErrorCode(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
  return typeof code === "string" && /^[a-z][a-z0-9_]{1,63}$/u.test(code)
    ? code
    : "provider_interrupted";
}

function appendConnectorEvent(
  db: Database.Database,
  boardId: string,
  sourceId: string,
  type: string,
  reason: string,
  payload: Record<string, unknown>,
): void {
  db.prepare(`
    INSERT INTO events (
      event_id, board_id, actor_id, type, object_type, object_id, reason, payload_json, at
    ) VALUES (?, ?, 'feed-connector-service', ?, 'feed_source', ?, ?, ?, ?)
  `).run(
    `event-${stableId("connector", `${sourceId}\u0000${type}\u0000${Date.now()}\u0000${Math.random()}`)}`,
    boardId,
    type,
    sourceId,
    reason,
    JSON.stringify(payload),
    new Date().toISOString(),
  );
}

function stableId(prefix: string, value: string): string {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}

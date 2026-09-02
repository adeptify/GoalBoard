import {
  createDecipheriv,
  createHash,
  scryptSync,
  randomUUID,
} from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import { createFeedEvidenceContentStore } from "./security/evidence-content-store.js";
import { createFileSecretStore } from "./security/secret-store.js";
import {
  GMAIL_INSTALLATIONS_SETTINGS_KEY,
  gmailInstallationSecretRefs,
  type GmailInstallation,
} from "./connectors/gmail-installations.js";
import {
  feedItemTypeForSource,
  type FeedSourceRecord,
  type RelayImportAvailability,
} from "./types.js";
import { FeedStore } from "./store.js";

type Row = Record<string, unknown>;

const REQUIRED_TABLES = ["items", "inbox_sources", "evidence_refs"] as const;
const REQUIRED_COLUMNS: Record<(typeof REQUIRED_TABLES)[number], readonly string[]> = {
  inbox_sources: [
    "id", "definition_id", "kind", "name", "description", "status", "enabled",
    "item_count", "last_sync_at", "last_outcome", "last_error_code", "updated_at",
  ],
  items: [
    "id", "kind", "title", "summary", "body", "source", "source_label", "external_id",
    "url", "status", "priority", "tags_json", "author", "created_at", "updated_at",
  ],
  evidence_refs: [
    "id", "item_id", "canonical_url", "title", "source_name", "published_at", "preview",
    "content_hash", "provenance_json", "selected_for_context", "last_seen_at",
  ],
};

const RELAY_CONTENT_KEY_REF = "system:evidence:content-key:v1";
const MIGRATABLE_SECRET = /^connector:(?:github|gmail):/u;
const RELAY_CONTENT_REF = /^relay-evidence\/sha256\/([0-9a-f]{64})$/u;

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function optionalText(value: unknown): string | null {
  const valueText = text(value);
  return valueText || null;
}

function parsedJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function parsedTags(value: unknown): string[] {
  const parsed = parsedJson<unknown>(value, []);
  return Array.isArray(parsed) ? parsed.map(String) : [];
}

export function defaultRelayDatabasePath(): string {
  if (process.env.RELAY_DB_PATH?.trim()) return path.resolve(process.env.RELAY_DB_PATH.trim());
  const dataDir = process.env.RELAY_DATA_DIR?.trim()
    ? path.resolve(process.env.RELAY_DATA_DIR.trim())
    : process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Application Support", "Relay")
      : process.platform === "win32"
        ? path.join(process.env.APPDATA || os.homedir(), "Relay")
        : path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "relay");
  return path.join(dataDir, "relay.sqlite");
}

function openRelayDatabase(databasePath: string): Database.Database {
  return new Database(databasePath, { readonly: true, fileMustExist: true, timeout: 5_000 });
}

function tableNames(db: Database.Database): Set<string> {
  return new Set((db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  ).all() as Array<{ name: string }>).map((row) => row.name));
}

function tableColumns(db: Database.Database, table: string): Set<string> {
  return new Set((db.prepare(
    "SELECT name FROM pragma_table_info(?) ORDER BY cid",
  ).all(table) as Array<{ name: string }>).map((row) => row.name));
}

export function detectRelayImport(databasePath = defaultRelayDatabasePath()): RelayImportAvailability {
  const resolved = path.resolve(databasePath);
  if (!fs.existsSync(resolved)) {
    return {
      path: resolved,
      available: false,
      source_count: 0,
      item_count: 0,
      material_count: 0,
      error: "未找到 Relay 数据库",
    };
  }
  let db: Database.Database | null = null;
  try {
    db = openRelayDatabase(resolved);
    const tables = tableNames(db);
    const missing = REQUIRED_TABLES.filter((name) => !tables.has(name));
    if (missing.length) throw new Error(`Relay 数据库缺少表：${missing.join("、")}`);
    const missingColumns = REQUIRED_TABLES.flatMap((table) => {
      const columns = tableColumns(db!, table);
      return REQUIRED_COLUMNS[table]
        .filter((column) => !columns.has(column))
        .map((column) => `${table}.${column}`);
    });
    if (missingColumns.length) throw new Error(`Relay 数据库缺少列：${missingColumns.join("、")}`);
    return {
      path: resolved,
      available: true,
      source_count: Number((db.prepare("SELECT COUNT(*) AS count FROM inbox_sources").get() as { count: number }).count),
      item_count: Number((db.prepare("SELECT COUNT(*) AS count FROM items").get() as { count: number }).count),
      material_count: Number((db.prepare("SELECT COUNT(*) AS count FROM evidence_refs").get() as { count: number }).count),
      error: null,
    };
  } catch (error) {
    return {
      path: resolved,
      available: false,
      source_count: 0,
      item_count: 0,
      material_count: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    db?.close();
  }
}

export interface RelayImportResult {
  path: string;
  receipt_id: string;
  sources: { created: number; updated: number };
  items: { created: number; updated: number };
  materials: { created: number; updated: number };
  runs: { created: number; updated: number };
  cursors: { migrated: number };
  credentials: { status: "migrated" | "unavailable" | "not_requested"; migrated: number };
  content: { status: "migrated" | "partial" | "unavailable" | "not_requested"; migrated: number; missing: number };
}

export function importRelayData(
  target: FeedStore,
  boardId: string,
  databasePath = defaultRelayDatabasePath(),
  options: { migrateOwnership?: boolean } = {},
): RelayImportResult {
  const availability = detectRelayImport(databasePath);
  if (!availability.available) throw new Error(availability.error || "Relay 数据不可用");
  const relay = openRelayDatabase(availability.path);
  const migrateOwnership = options.migrateOwnership !== false;
  try {
    const tables = tableNames(relay);
    const sources = relay.prepare("SELECT * FROM inbox_sources ORDER BY updated_at, id").all() as Row[];
    const items = relay.prepare("SELECT * FROM items ORDER BY updated_at, id").all() as Row[];
    const materials = relay.prepare("SELECT * FROM evidence_refs ORDER BY last_seen_at, id").all() as Row[];
    const sourceRuns = tables.has("inbox_source_runs")
      ? relay.prepare("SELECT * FROM inbox_source_runs ORDER BY created_at, id").all() as Row[]
      : [];
    const connectorRows = tables.has("connectors")
      ? relay.prepare("SELECT * FROM connectors ORDER BY id").all() as Row[]
      : [];
    const cursorRows = tables.has("connector_cursors")
      ? relay.prepare("SELECT * FROM connector_cursors ORDER BY connector_id").all() as Row[]
      : [];
    const gmailInstallations = tables.has("settings")
      ? readRelayGmailInstallations(relay)
      : [];
    const sourceByDefinition = new Map<string, string>();
    const sourceById = new Map<string, string>();
    for (const row of sources) {
      const id = text(row.id);
      sourceById.set(id, id);
      sourceByDefinition.set(text(row.definition_id), id);
    }

    const currentSnapshot = target.snapshot(boardId);
    const existingSources = new Map(
      currentSnapshot.sources.map((source) => [source.source_id, source]),
    );
    const existingSourceIds = new Set(existingSources.keys());
    const isRepeatOwnershipImport = currentSnapshot.import_receipts.length > 0;
    const existingItemIds = new Set(currentSnapshot.feed_items.map((item) => item.item_id));
    const existingMaterialIds = new Set(
      currentSnapshot.feed_items.flatMap((item) => item.materials.map((material) => material.material_id)),
    );
    const existingRunIds = new Set(currentSnapshot.runs.map((run) => run.run_id));
    const relaySecurity = migrateOwnership
      ? openRelaySecurity(path.dirname(availability.path))
      : { entries: new Map<string, string>(), contentKey: null, readable: false };
    const goalboardSecrets = migrateOwnership && relaySecurity.readable
      ? createFileSecretStore()
      : null;
    const goalboardContent = relaySecurity.contentKey && goalboardSecrets
      ? createFeedEvidenceContentStore({ secretStore: goalboardSecrets })
      : null;
    let credentialsMigrated = 0;
    if (migrateOwnership && relaySecurity.readable) {
      for (const [authRef, plaintext] of relaySecurity.entries) {
        if (!MIGRATABLE_SECRET.test(authRef)) continue;
        goalboardSecrets!.put(authRef, plaintext);
        credentialsMigrated += 1;
      }
    }

    const result: RelayImportResult = {
      path: availability.path,
      receipt_id: stableId("feed-import", `${boardId}\u0000${availability.path}`),
      sources: { created: 0, updated: 0 },
      items: { created: 0, updated: 0 },
      materials: { created: 0, updated: 0 },
      runs: { created: 0, updated: 0 },
      cursors: { migrated: 0 },
      credentials: {
        status: !migrateOwnership
          ? "not_requested"
          : relaySecurity.readable
            ? "migrated"
            : "unavailable",
        migrated: credentialsMigrated,
      },
      content: {
        status: !migrateOwnership ? "not_requested" : "migrated",
        migrated: 0,
        missing: 0,
      },
    };

    target.db.transaction(() => {
      const now = new Date().toISOString();
      const sourceForImport = (incoming: FeedSourceRecord): FeedSourceRecord => {
        const existing = existingSources.get(incoming.source_id);
        if (!isRepeatOwnershipImport || !existing) return incoming;
        return {
          ...incoming,
          status: existing.status,
          enabled: existing.enabled,
          item_count: existing.item_count,
          cursor: existing.cursor,
          credential_ref: existing.credential_ref ?? incoming.credential_ref,
          account_label: existing.account_label ?? incoming.account_label,
          last_sync_at: existing.last_sync_at,
          last_outcome: existing.last_outcome,
          last_error_code: existing.last_error_code,
          imported_at: existing.imported_at,
          updated_at: existing.updated_at > incoming.updated_at
            ? existing.updated_at
            : incoming.updated_at,
        };
      };
      for (const row of sources) {
        const sourceId = text(row.id);
        const kind = text(row.kind);
        const config = sourceConfig(row);
        target.upsertSource(sourceForImport({
          board_id: boardId,
          source_id: sourceId,
          kind,
          definition_id: optionalText(row.definition_id),
          sync_kind: "public_source",
          name: text(row.name),
          description: text(row.description),
          status: relaySourceStatus(row),
          enabled: Number(row.enabled ?? 0) === 1,
          item_count: Number(row.item_count ?? 0),
          origin: "relay",
          config,
          schedule: { mode: "manual" },
          cursor: parsedJson(row.cursor_json, {}),
          credential_ref: null,
          account_label: null,
          last_sync_at: optionalText(row.last_sync_at),
          last_outcome: optionalText(row.last_outcome),
          last_error_code: optionalText(row.last_error_code),
          imported_at: now,
          updated_at: text(row.updated_at) || now,
        }));
        if (existingSourceIds.has(sourceId)) result.sources.updated += 1;
        else result.sources.created += 1;
      }

      const connectorSourceIds = new Map<string, string>();
      for (const kind of ["github", "gmail"] as const) {
        const meta = connectorRows.find((row) => text(row.type) === kind);
        const fallbackConnectorId = `conn-${kind}`;
        const cursor = cursorRows.find((row) => text(row.connector_id) === text(meta?.id ?? fallbackConnectorId));
        const hasCredential = [...relaySecurity.entries.keys()].some((ref) =>
          ref === `connector:${kind}:token` || ref.startsWith(`connector:${kind}:inst:`)
        );
        if (!meta && !cursor && !hasCredential) continue;
        const sourceId = stableId("feed-source", `${boardId}\u0000connector\u0000${kind}`);
        connectorSourceIds.set(kind, sourceId);
        const existing = existingSourceIds.has(sourceId);
        target.upsertSource(sourceForImport({
          board_id: boardId,
          source_id: sourceId,
          kind,
          definition_id: kind,
          sync_kind: kind,
          name: text(meta?.name) || (kind === "github" ? "GitHub" : "Gmail"),
          description: text(meta?.description) || `从 Relay 迁移的 ${kind} 账号来源`,
          status: relayConnectorStatus(meta, relaySecurity.entries, kind),
          enabled: true,
          item_count: Number(meta?.item_count ?? 0),
          origin: "relay",
          config: {},
          schedule: { mode: "manual" },
          cursor: parsedJson(cursor?.cursor_json, {}),
          credential_ref: `connector:${kind}:token`,
          account_label: optionalText(meta?.account_label),
          last_sync_at: optionalText(meta?.last_sync_at),
          last_outcome: optionalText(meta?.last_sync_at) ? "completed" : null,
          last_error_code: null,
          imported_at: now,
          updated_at: now,
        }));
        if (cursor) result.cursors.migrated += 1;
        if (existing) result.sources.updated += 1;
        else result.sources.created += 1;
      }

      for (const installation of gmailInstallations) {
        const refs = gmailInstallationSecretRefs(installation.id);
        const sourceId = stableId(
          "feed-source",
          `${boardId}\u0000connector\u0000gmail\u0000${installation.id}`,
        );
        const cursor = cursorRows.find((row) => text(row.connector_id) === installation.id);
        const hasCredential = relaySecurity.entries.has(refs.access)
          || relaySecurity.entries.has(refs.refresh);
        target.upsertSource(sourceForImport({
          board_id: boardId,
          source_id: sourceId,
          kind: "gmail",
          definition_id: "gmail",
          sync_kind: "gmail",
          name: `Gmail · ${installation.email || installation.id}`,
          description: "从 Relay 迁移的独立 Gmail 账号来源；凭据和游标不与其他账号共用。",
          status: installation.status === "error"
            ? "error"
            : hasCredential
              ? "active"
              : "disconnected",
          enabled: installation.status !== "disconnected",
          item_count: installation.itemCount,
          origin: "relay",
          config: { installation_id: installation.id, token_refs: refs },
          schedule: { mode: "manual" },
          cursor: parsedJson(cursor?.cursor_json, {}),
          credential_ref: refs.access,
          account_label: installation.email ?? null,
          last_sync_at: installation.lastSyncAt ?? null,
          last_outcome: installation.lastSyncAt ? "completed" : null,
          last_error_code: installation.status === "error" ? "relay_connector_error" : null,
          imported_at: now,
          updated_at: now,
        }));
        if (cursor) result.cursors.migrated += 1;
        if (existingSourceIds.has(sourceId)) result.sources.updated += 1;
        else result.sources.created += 1;
      }

      if (gmailInstallations.length > 0) {
        const legacyGmailId = connectorSourceIds.get("gmail");
        if (legacyGmailId) {
          const legacyGmail = target.getSource(boardId, legacyGmailId);
          target.upsertSource({
            ...legacyGmail,
            status: "paused",
            enabled: false,
            description: "Gmail 兼容入口；Relay 的账号已拆成独立来源，避免重复同步。",
            updated_at: now,
          });
        }
      }

      const sourceIdForItem = (row: Row, tags: string[]): string => {
        const sourceTag = tags.find((tag) => tag.startsWith("inbox-source:"))?.slice("inbox-source:".length);
        if (sourceTag && sourceById.has(sourceTag)) return sourceById.get(sourceTag)!;
        if (sourceTag && sourceByDefinition.has(sourceTag)) return sourceByDefinition.get(sourceTag)!;
        const kind = text(row.source) || "manual";
        if (connectorSourceIds.has(kind)) return connectorSourceIds.get(kind)!;
        const label = text(row.source_label) || kind;
        const id = stableId("feed-source", `${boardId}\u0000relay-synthetic\u0000${kind}\u0000${label}`);
        if (!existingSourceIds.has(id)) {
          target.upsertSource({
            board_id: boardId,
            source_id: id,
            kind,
            definition_id: kind,
            sync_kind: "manual",
            name: label,
            description: "从 Relay Item 推导的本地来源；没有账号同步能力。",
            status: "imported",
            enabled: true,
            item_count: 0,
            origin: "relay",
            config: {},
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
          existingSourceIds.add(id);
          result.sources.created += 1;
        }
        return id;
      };

      for (const row of items) {
        const tags = parsedTags(row.tags_json);
        const sourceKind = text(row.source) || "manual";
        const sourceId = sourceIdForItem(row, tags);
        const disposition = tags.includes("role:reference")
          ? "saved"
          : text(row.status) === "archived"
            ? "archived"
            : "inbox";
        const itemId = text(row.id);
        target.upsertImportedItem({
          project_id: boardId,
          item_id: itemId,
          source_id: sourceId,
          kind: text(row.kind),
          title: text(row.title),
          summary: text(row.summary),
          body: optionalText(row.body),
          source_kind: sourceKind,
          source_label: text(row.source_label) || sourceKind,
          external_id: optionalText(row.external_id),
          url: optionalText(row.url),
          origin_status: text(row.status),
          priority: text(row.priority) || "medium",
          tags,
          author: optionalText(row.author),
          disposition,
          source_created_at: text(row.created_at) || now,
          source_updated_at: text(row.updated_at) || now,
          imported_at: now,
          updated_at: now,
        });
        if (feedItemTypeForSource(sourceKind) === "inbox_message") {
          target.ensureInboxEntryForFeedItem(boardId, itemId, "source_rule", {
            source_id: sourceId,
            imported_from: "relay",
          });
        }
        if (existingItemIds.has(itemId)) result.items.updated += 1;
        else result.items.created += 1;
      }

      for (const row of materials) {
        const itemId = text(row.item_id);
        if (!itemId || !items.some((item) => text(item.id) === itemId)) continue;
        const migrated = migrateRelayContent(
          row,
          path.dirname(availability.path),
          relaySecurity.contentKey,
          goalboardContent,
        );
        if (migrated.available) result.content.migrated += 1;
        else if (optionalText(row.content_ref)) result.content.missing += 1;
        const materialId = text(row.id);
        target.upsertMaterial({
          board_id: boardId,
          material_id: materialId,
          item_id: itemId,
          canonical_url: optionalText(row.canonical_url),
          title: text(row.title),
          source_name: text(row.source_name),
          published_at: optionalText(row.published_at),
          preview: text(row.preview),
          content_hash: optionalText(row.content_hash),
          content_ref: migrated.contentRef,
          content_available: migrated.available,
          content_type: optionalText(row.content_type),
          character_count: row.character_count == null ? null : Number(row.character_count),
          captured_at: optionalText(row.captured_at) ?? optionalText(row.last_seen_at),
          provenance: parsedJson(row.provenance_json, {}),
          selected_for_context: Number(row.selected_for_context ?? 0) === 1,
          imported_at: now,
          updated_at: text(row.last_seen_at) || now,
        });
        if (existingMaterialIds.has(materialId)) result.materials.updated += 1;
        else result.materials.created += 1;
      }

      for (const row of sourceRuns) {
        const runId = text(row.id);
        const sourceId = text(row.inbox_source_id);
        if (!sourceById.has(sourceId)) continue;
        target.upsertSourceRun({
          board_id: boardId,
          run_id: runId,
          operation_id: text(row.operation_id),
          source_id: sourceId,
          phase: normalizeRunPhase(row.phase),
          outcome: optionalText(row.outcome),
          empty: Number(row.empty ?? 0) === 1,
          error_code: optionalText(row.error_code),
          receipt: parsedJson(row.collection_receipt_json, null),
          created_count: 0,
          deduped_count: 0,
          recovery_count: Number(row.recovery_count ?? 0),
          started_at: text(row.started_at) || now,
          completed_at: optionalText(row.completed_at),
          updated_at: text(row.updated_at) || now,
        });
        if (existingRunIds.has(runId)) result.runs.updated += 1;
        else result.runs.created += 1;
      }

      if (result.content.missing > 0) {
        result.content.status = result.content.migrated > 0 ? "partial" : "unavailable";
      } else if (!migrateOwnership) {
        result.content.status = "not_requested";
      }

      target.putImportReceipt({
        board_id: boardId,
        receipt_id: result.receipt_id,
        source_fingerprint: sourceFingerprint(availability.path),
        summary: {
          sources: result.sources,
          items: result.items,
          materials: result.materials,
          runs: result.runs,
          cursors: result.cursors,
          credentials: result.credentials,
          content: result.content,
        },
        credentials_status: result.credentials.status,
        content_status: result.content.status,
        completed_at: now,
      });
      target.db.prepare(`
        INSERT INTO events (
          event_id, board_id, actor_id, type, object_type, object_id, reason, payload_json, at
        ) VALUES (?, ?, 'web-user', 'feed.relay_ownership_migrated', 'board', ?, ?, ?, ?)
      `).run(
        `event-${randomUUID()}`,
        boardId,
        boardId,
        "用户把 Relay Feed 数据与可用本机所有权迁入 GoalBoard",
        JSON.stringify({
          receipt_id: result.receipt_id,
          sources: result.sources,
          items: result.items,
          materials: result.materials,
          runs: result.runs,
          credentials: result.credentials,
          content: result.content,
        }),
        now,
      );
    }).immediate();
    return result;
  } finally {
    relay.close();
  }
}

function sourceConfig(row: Row): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  if (optionalText(row.query)) config.query = text(row.query);
  if (optionalText(row.channel_id)) config.channel_id = text(row.channel_id);
  if (optionalText(row.feed_url)) config.feed_url = text(row.feed_url);
  const fingerprint = optionalText(row.query_fingerprint)
    ?? createHash("sha256").update(JSON.stringify(config)).digest("hex");
  config.config_fingerprint = fingerprint;
  return config;
}

function readRelayGmailInstallations(db: Database.Database): GmailInstallation[] {
  const row = db.prepare("SELECT value_json FROM settings WHERE key = ?")
    .get(GMAIL_INSTALLATIONS_SETTINGS_KEY) as { value_json?: unknown } | undefined;
  const raw = parsedJson<unknown>(row?.value_json, []);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): GmailInstallation[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const id = optionalText(record.id);
    const status = text(record.status);
    if (!id || !["connected", "error", "disconnected", "mock"].includes(status)) return [];
    return [{
      id,
      ...(optionalText(record.email) ? { email: text(record.email) } : {}),
      status: status as GmailInstallation["status"],
      ...(optionalText(record.lastSyncAt) ? { lastSyncAt: text(record.lastSyncAt) } : {}),
      itemCount: Number.isFinite(Number(record.itemCount)) ? Number(record.itemCount) : 0,
      createdAt: optionalText(record.createdAt) ?? new Date(0).toISOString(),
    }];
  });
}

function relaySourceStatus(row: Row): "active" | "paused" | "error" {
  if (Number(row.enabled ?? 0) !== 1 || text(row.status) === "paused") return "paused";
  return text(row.status) === "error" ? "error" : "active";
}

function relayConnectorStatus(
  row: Row | undefined,
  entries: Map<string, string>,
  kind: "github" | "gmail",
): "active" | "error" | "disconnected" {
  if (entries.has(`connector:${kind}:token`)) return "active";
  return text(row?.status) === "error" ? "error" : "disconnected";
}

function normalizeRunPhase(value: unknown): "running" | "terminal" | "interrupted" {
  return value === "terminal" ? "terminal" : value === "running" ? "interrupted" : "interrupted";
}

interface RelaySecuritySnapshot {
  entries: Map<string, string>;
  contentKey: Buffer | null;
  readable: boolean;
}

function openRelaySecurity(dataDirectory: string): RelaySecuritySnapshot {
  const secretsPath = path.join(dataDirectory, "secrets.json");
  if (!fs.existsSync(secretsPath)) return { entries: new Map(), contentKey: null, readable: false };
  try {
    const raw = JSON.parse(fs.readFileSync(secretsPath, "utf8")) as unknown;
    const sealedEntries = extractSealedEntries(raw);
    const key = resolveRelayMasterKey(dataDirectory);
    if (!key) return { entries: new Map(), contentKey: null, readable: false };
    const entries = new Map<string, string>();
    for (const [authRef, sealed] of Object.entries(sealedEntries)) {
      const plaintext = openRelaySealed(sealed, key);
      if (plaintext != null) entries.set(authRef, plaintext);
    }
    const contentKeyRaw = entries.get(RELAY_CONTENT_KEY_REF);
    const contentKey = contentKeyRaw ? Buffer.from(contentKeyRaw, "base64") : null;
    return {
      entries,
      contentKey: contentKey?.length === 32 ? contentKey : null,
      readable: entries.size > 0 || Object.keys(sealedEntries).length === 0,
    };
  } catch {
    return { entries: new Map(), contentKey: null, readable: false };
  }
}

function extractSealedEntries(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid Relay secrets file");
  const record = value as Record<string, unknown>;
  const candidate = record.entries && typeof record.entries === "object" && !Array.isArray(record.entries)
    ? record.entries as Record<string, unknown>
    : record;
  const entries: Record<string, string> = {};
  for (const [key, sealed] of Object.entries(candidate)) {
    if (typeof sealed === "string") entries[key] = sealed;
  }
  return entries;
}

function resolveRelayMasterKey(dataDirectory: string): Buffer | null {
  const envValue = process.env.RELAY_ENCRYPTION_KEY?.trim();
  if (envValue) {
    if (/^[0-9a-fA-F]{64}$/u.test(envValue)) return Buffer.from(envValue, "hex");
    const base64 = Buffer.from(envValue, "base64");
    if (base64.length === 32) return base64;
    return scryptSync(envValue, "relay-secretstore-v2", 32);
  }
  if (process.platform === "darwin") {
    try {
      const value = execFileSync(
        "security",
        [
          "find-generic-password",
          "-a",
          "install-master-key",
          "-s",
          "com.relay.local.secretstore",
          "-w",
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 3_000 },
      ).trim();
      const key = Buffer.from(value, "base64");
      if (key.length === 32) return key;
    } catch {
      // Fall back to the install key file.
    }
  }
  const keyPath = path.join(dataDirectory, "secrets.key");
  if (!fs.existsSync(keyPath)) return null;
  const raw = fs.readFileSync(keyPath, "utf8").trim();
  const base64 = Buffer.from(raw, "base64");
  if (base64.length === 32) return base64;
  return /^[0-9a-fA-F]{64}$/u.test(raw) ? Buffer.from(raw, "hex") : null;
}

function openRelaySealed(sealed: string, key: Buffer): string | null {
  try {
    const payload = JSON.parse(Buffer.from(sealed, "base64").toString("utf8")) as Record<string, unknown>;
    if (payload.v === 2 && payload.alg === "aes-256-gcm") {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(String(payload.iv), "base64"));
      decipher.setAuthTag(Buffer.from(String(payload.tag), "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(String(payload.ct), "base64")),
        decipher.final(),
      ]).toString("utf8");
    }
    if (typeof payload.v === "string") return Buffer.from(payload.v, "base64").toString("utf8");
    return null;
  } catch {
    return null;
  }
}

function migrateRelayContent(
  row: Row,
  dataDirectory: string,
  key: Buffer | null,
  target: ReturnType<typeof createFeedEvidenceContentStore> | null,
): { contentRef: string | null; available: boolean } {
  const contentRef = optionalText(row.content_ref);
  if (!contentRef || !key || !target) return { contentRef: null, available: false };
  const match = RELAY_CONTENT_REF.exec(contentRef);
  if (!match) return { contentRef: null, available: false };
  const sourcePath = path.join(dataDirectory, "evidence", "blobs", match[1]!.slice(0, 2), `${match[1]}.blob`);
  if (!fs.existsSync(sourcePath)) return { contentRef: null, available: false };
  try {
    const payload = JSON.parse(fs.readFileSync(sourcePath, "utf8")) as {
      v?: unknown;
      alg?: unknown;
      iv?: unknown;
      tag?: unknown;
      ct?: unknown;
    };
    if (
      payload.v !== 1 ||
      payload.alg !== "aes-256-gcm" ||
      typeof payload.iv !== "string" ||
      typeof payload.tag !== "string" ||
      typeof payload.ct !== "string"
    ) return { contentRef: null, available: false };
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64"));
    decipher.setAAD(Buffer.from(contentRef, "utf8"));
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ct, "base64")),
      decipher.final(),
    ]).toString("utf8");
    const expected = match[1]!;
    if (createHash("sha256").update(plaintext).digest("hex") !== expected) {
      return { contentRef: null, available: false };
    }
    const written = target.write(plaintext);
    return { contentRef: written.contentRef, available: target.has(written.contentRef) };
  } catch {
    return { contentRef: null, available: false };
  }
}

function sourceFingerprint(databasePath: string): string {
  const stat = fs.statSync(databasePath);
  return `sha256:${createHash("sha256")
    .update(`${path.resolve(databasePath)}\u0000${stat.size}\u0000${stat.mtimeMs}`)
    .digest("hex")}`;
}

function stableId(prefix: string, value: string): string {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}

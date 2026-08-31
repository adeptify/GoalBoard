export type FeedItemType = "inbox_message" | "feed";

export type FeedSourceSyncKind = "public_source" | "github" | "gmail" | "manual";
export type FeedSourceStatus = "active" | "paused" | "error" | "disconnected" | "imported";
export type FeedSourceRunPhase = "running" | "terminal" | "interrupted";
export type FeedSourceSchedule =
  | { mode: "manual" }
  | {
      mode: "interval";
      enabled: boolean;
      interval_minutes: number;
      next_pull_at: string | null;
    };

export type InboxEntrySubjectType = "feed_item" | "goal_decision" | "source_fault";
export type InboxEntryReason = "manual" | "source_rule" | "goal_decision" | "source_fault";
export type InboxEntryStatus = "open" | "in_progress" | "done" | "dismissed";
export type SourceHistoryDecision = "retain_history" | "delete_local_history";

export type FeedItemDisposition =
  | "inbox"
  | "saved"
  | "promoted"
  | "processing"
  | "archived";

export interface FeedSourceRecord {
  board_id: string;
  source_id: string;
  kind: string;
  definition_id: string | null;
  sync_kind: FeedSourceSyncKind;
  name: string;
  description: string;
  status: FeedSourceStatus;
  enabled: boolean;
  item_count: number;
  origin: "relay" | "goalboard";
  config: Record<string, unknown>;
  schedule: FeedSourceSchedule;
  cursor: unknown;
  credential_ref: string | null;
  account_label: string | null;
  last_sync_at: string | null;
  last_outcome: string | null;
  last_error_code: string | null;
  imported_at: string;
  updated_at: string;
}

export interface FeedSourceRunRecord {
  board_id: string;
  run_id: string;
  operation_id: string;
  source_id: string;
  phase: FeedSourceRunPhase;
  outcome: string | null;
  empty: boolean;
  error_code: string | null;
  receipt: Record<string, unknown> | null;
  created_count: number;
  deduped_count: number;
  recovery_count: number;
  started_at: string;
  completed_at: string | null;
  updated_at: string;
}

export interface FeedImportReceiptRecord {
  board_id: string;
  receipt_id: string;
  source_fingerprint: string;
  summary: Record<string, unknown>;
  credentials_status: "migrated" | "unavailable" | "not_requested";
  content_status: "migrated" | "partial" | "unavailable" | "not_requested";
  completed_at: string;
}

export interface FeedContractMigrationReceiptRecord {
  receipt_id: string;
  schema_version: number;
  preflight: Record<string, number>;
  postflight: Record<string, number>;
  rollback_strategy: "sqlite_immediate_transaction";
  applied_at: string;
}

export interface InboxEntryRecord {
  board_id: string;
  entry_id: string;
  subject_type: InboxEntrySubjectType;
  subject_id: string;
  reason: InboxEntryReason;
  status: InboxEntryStatus;
  detail: Record<string, unknown>;
  revision: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface FeedMaterialRecord {
  board_id: string;
  material_id: string;
  item_id: string;
  canonical_url: string | null;
  title: string;
  source_name: string;
  published_at: string | null;
  preview: string;
  content_hash: string | null;
  content_ref: string | null;
  content_available: boolean;
  /** Decrypted only for the local detail/TUI view; never stored in SQLite. */
  content?: string | null;
  content_type: string | null;
  character_count: number | null;
  captured_at: string | null;
  provenance: Record<string, unknown>;
  selected_for_context: boolean;
  imported_at: string;
  updated_at: string;
}

export interface FeedItemRecord {
  board_id: string;
  item_id: string;
  source_id: string | null;
  item_type: FeedItemType;
  kind: string;
  title: string;
  summary: string;
  body: string | null;
  source_kind: string;
  source_label: string;
  external_id: string | null;
  url: string | null;
  origin_status: string;
  priority: string;
  tags: string[];
  author: string | null;
  disposition: FeedItemDisposition;
  linked_goal_id: string | null;
  read_at: string | null;
  revision: number;
  source_created_at: string;
  source_updated_at: string;
  imported_at: string;
  updated_at: string;
  materials: FeedMaterialRecord[];
}

export interface FeedSnapshot {
  sources: FeedSourceRecord[];
  /** Canonical external facts. Every record is a FeedItem, including items with Inbox references. */
  feed_items: FeedItemRecord[];
  /** Canonical attention state; entries reference facts or internal objects and never copy message bodies. */
  inbox_entries: InboxEntryRecord[];
  /** Temporary compatibility projection for the current combined Inbox/Feed Web workbench. */
  items: FeedItemRecord[];
  runs: FeedSourceRunRecord[];
  import_receipts: FeedImportReceiptRecord[];
  contract_migrations: FeedContractMigrationReceiptRecord[];
}

export interface RelayImportAvailability {
  path: string;
  available: boolean;
  source_count: number;
  item_count: number;
  material_count: number;
  error: string | null;
}

const FEED_SOURCE_KINDS = new Set([
  "rss",
  "web_query",
  "youtube_channel",
  "custom_rss",
]);

export function feedItemTypeForSource(sourceKind: string): FeedItemType {
  return FEED_SOURCE_KINDS.has(sourceKind) ? "feed" : "inbox_message";
}

function bounded(value: string, maximum: number): string {
  const normalized = value.trim();
  return normalized.length > maximum ? `${normalized.slice(0, maximum - 1)}…` : normalized;
}

/**
 * Feed content can legitimately contain copied request headers, OAuth payloads,
 * or credentials pasted into an issue or email. Keep those values out of the
 * Runtime input even though the whole context is also marked as untrusted.
 */
export function redactFeedContextSecrets(value: string): string {
  return value
    .replace(
      /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)? PRIVATE KEY-----/gi,
      "[REDACTED PRIVATE KEY]",
    )
    .replace(
      /\b(authorization|proxy-authorization|cookie|set-cookie)\s*:\s*[^\r\n]*/gi,
      "$1: [REDACTED]",
    )
    .replace(
      /((?:"|')?(?:(?:access|refresh|id)[_-]?token|token|client[_-]?secret|api[_-]?key|password|passwd|credential|secret)(?:"|')?)(\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s&,;]+)/gi,
      "$1$2[REDACTED]",
    )
    .replace(
      /\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|ya29\.[A-Za-z0-9._-]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16})\b/g,
      "[REDACTED TOKEN]",
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "[REDACTED TOKEN]",
    );
}

export function feedItemContext(item: FeedItemRecord): string {
  const materials = item.materials
    .filter((material) => material.selected_for_context || item.materials.length <= 4)
    .slice(0, 6)
    .map((material, index) => {
      const location = material.canonical_url ? `\n   链接：${material.canonical_url}` : "";
      const preview = material.preview ? `\n   摘要：${bounded(material.preview, 900)}` : "";
      const content = material.content ? `\n   正文：${bounded(material.content, 6_000)}` : "";
      return `${index + 1}. ${material.title || material.source_name}${location}${preview}${content}`;
    })
    .join("\n");
  return redactFeedContextSecrets([
    `来源类型：${item.item_type === "feed" ? "Feed" : "Inbox Message"}`,
    `来源：${item.source_label || item.source_kind}`,
    item.author ? `作者/发送者：${item.author}` : "",
    item.url ? `原链接：${item.url}` : "",
    `标题：${item.title}`,
    item.summary ? `摘要：${bounded(item.summary, 2_000)}` : "",
    item.body ? `正文：\n${bounded(item.body, 6_000)}` : "",
    materials ? `可引用资料：\n${materials}` : "",
  ].filter(Boolean).join("\n\n"));
}

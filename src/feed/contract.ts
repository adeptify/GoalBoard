import type {
  FeedSourceRunPhase,
  FeedSourceSchedule,
  FeedSourceStatus,
  InboxEntryRecord,
  InboxEntryStatus,
  InboxEntrySubjectType,
  SourceHistoryDecision,
} from "./types.js";
import {
  ATTENTION_STATUS_TRANSITIONS,
  assertAttentionEntryShape,
  assertAttentionTransition,
} from "@adeptify/goalboard-module-attention-resumption";

export const INFOFLOW_CONTRACT_VERSION = 1 as const;
export const INFOFLOW_SCHEMA_MIGRATION_ID = 29 as const;

export const INFOFLOW_MODULE_OWNERSHIP = {
  Source: {
    owner: "modules/sources",
    writes: ["configuration", "credential_ref", "connection_state", "schedule", "cursor"],
    does_not_write: ["message_body", "attention_status"],
  },
  SyncRun: {
    owner: "horizontal/listener-host",
    writes: ["operation_id", "phase", "outcome", "safe_error", "receipt", "counts"],
    does_not_write: ["provider_secret", "source_configuration"],
  },
  FeedItem: {
    owner: "modules/feed",
    identity: ["board_id", "source_id", "external_id"],
    writes: ["external_fact_snapshot", "local_destination", "linked_goal", "read_state"],
    does_not_write: ["attention_reason", "attention_status"],
  },
  InboxEntry: {
    owner: "modules/attention-resumption",
    writes: ["subject_reference", "attention_reason", "attention_status", "resolution_metadata"],
    does_not_write: ["title", "summary", "body", "provider_cursor", "credential"],
  },
} as const;

export const INFOFLOW_PROVIDER_ACCESS = {
  github: {
    credential_store: "goalboard_secret_store",
    preferred_authorization: "classic_pat_or_oauth_app_notifications_scope",
    minimum_permissions: [
      "notifications",
      "read:user",
    ],
    oauth_device_default_scopes: ["notifications", "read:user"],
    limitation: "GitHub notifications currently reject fine-grained PAT and GitHub App tokens. The notifications scope is the narrowest supported scope but also grants notification writes; GoalBoard only calls GET and never requests classic repo by default.",
    disconnect: "stop_pull_and_delete_local_tokens",
    source_refs: [
      "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps",
      "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/best-practices-for-creating-an-oauth-app",
      "https://docs.github.com/en/rest/activity/notifications",
      "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps",
    ],
  },
  gmail: {
    credential_store: "goalboard_secret_store",
    authorization_flow: "authorization_code_pkce",
    minimum_scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "openid",
      "email",
    ],
    restricted_scope: true,
    disconnect: "stop_pull_revoke_when_possible_and_delete_local_tokens",
    source_refs: [
      "https://developers.google.com/workspace/gmail/api/auth/scopes",
      "https://developers.google.com/identity/protocols/oauth2/resources/best-practices",
    ],
  },
  rss: {
    credential_store: "none",
    minimum_scopes: [],
    transport: "https_with_ssrf_guard",
    trust: "untrusted_external_content",
    disconnect: "stop_pull",
    source_refs: [],
  },
} as const;

export const INBOX_ENTRY_STATUS_TRANSITIONS: Readonly<Record<InboxEntryStatus, readonly InboxEntryStatus[]>> =
  ATTENTION_STATUS_TRANSITIONS;

export const SOURCE_STATUS_TRANSITIONS: Readonly<Record<FeedSourceStatus, readonly FeedSourceStatus[]>> = {
  active: ["paused", "error", "disconnected"],
  paused: ["active", "error", "disconnected"],
  error: ["active", "paused", "disconnected"],
  disconnected: ["active", "paused", "error"],
  imported: ["active", "paused", "error", "disconnected"],
};

export const SYNC_RUN_PHASE_TRANSITIONS: Readonly<Record<FeedSourceRunPhase, readonly FeedSourceRunPhase[]>> = {
  running: ["terminal", "interrupted"],
  interrupted: ["running"],
  terminal: [],
};

export function assertFeedSourceSchedule(value: unknown): asserts value is FeedSourceSchedule {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("feed_contract_invalid_schedule");
  }
  const schedule = value as Record<string, unknown>;
  if (schedule.mode === "manual") return;
  if (
    schedule.mode !== "interval"
    || typeof schedule.enabled !== "boolean"
    || !Number.isInteger(schedule.interval_minutes)
    || Number(schedule.interval_minutes) < 5
    || (schedule.next_pull_at !== null && typeof schedule.next_pull_at !== "string")
  ) {
    throw new Error("feed_contract_invalid_schedule");
  }
}

export function assertInboxEntryReference(
  subjectType: InboxEntrySubjectType,
  subjectId: string,
): void {
  const reason = subjectType === "feed_item"
    ? "manual"
    : subjectType === "source_fault"
      ? "source_fault"
      : "goal_decision";
  try {
    assertAttentionEntryShape({
      project_id: "compatibility-check",
      entry_id: "compatibility-check",
      subject_type: subjectType,
      subject_id: subjectId,
      reason,
      status: "open",
      detail: {},
      revision: 1,
      created_at: "1970-01-01T00:00:00.000Z",
      updated_at: "1970-01-01T00:00:00.000Z",
      completed_at: null,
    });
  } catch {
    throw new Error("feed_contract_invalid_inbox_reference");
  }
}

export function assertInboxEntryShape(entry: InboxEntryRecord): void {
  assertAttentionEntryShape({
    project_id: entry.board_id,
    entry_id: entry.entry_id,
    subject_type: entry.subject_type,
    subject_id: entry.subject_id,
    reason: entry.reason,
    status: entry.status,
    detail: entry.detail,
    revision: entry.revision,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
    completed_at: entry.completed_at,
  });
}

export function assertInboxEntryTransition(from: InboxEntryStatus, to: InboxEntryStatus): void {
  assertAttentionTransition(from, to);
}

export function assertSourceStatusTransition(from: FeedSourceStatus, to: FeedSourceStatus): void {
  if (from === to) return;
  if (!SOURCE_STATUS_TRANSITIONS[from].includes(to)) {
    throw new Error(`feed_contract_invalid_source_transition:${from}:${to}`);
  }
}

export function assertSyncRunPhaseTransition(from: FeedSourceRunPhase, to: FeedSourceRunPhase): void {
  if (from === to) return;
  if (!SYNC_RUN_PHASE_TRANSITIONS[from].includes(to)) {
    throw new Error(`feed_contract_invalid_sync_run_transition:${from}:${to}`);
  }
}

export function assertSourceHistoryDecision(value: unknown): asserts value is SourceHistoryDecision {
  if (value !== "retain_history" && value !== "delete_local_history") {
    throw new Error("feed_contract_source_history_decision_required");
  }
}

export type FeedPublicErrorCategory =
  | "auth"
  | "configuration"
  | "network"
  | "provider"
  | "rate_limit"
  | "stale_cursor"
  | "conflict"
  | "not_found"
  | "invalid_state"
  | "interrupted"
  | "unknown";

export interface FeedPublicError {
  code: string;
  category: FeedPublicErrorCategory;
  retryable: boolean;
  user_action: "reconnect" | "fix_configuration" | "retry" | "refresh" | "resume" | "contact_support";
  safe_message: string;
}

export function toFeedPublicError(error: unknown): FeedPublicError {
  const value = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
  const code = typeof value.code === "string" && value.code ? value.code : "feed_unknown";
  const message = typeof value.message === "string" && value.message
    ? value.message.slice(0, 400)
    : "信息流操作失败";
  if (code.includes("needs_auth") || code.includes("credential")) {
    return { code, category: "auth", retryable: false, user_action: "reconnect", safe_message: message };
  }
  if (code.includes("stale")) {
    return { code, category: "stale_cursor", retryable: false, user_action: "refresh", safe_message: message };
  }
  if (code.includes("network")) {
    return { code, category: "network", retryable: true, user_action: "retry", safe_message: message };
  }
  if (code.includes("rate_limited")) {
    return { code, category: "rate_limit", retryable: true, user_action: "retry", safe_message: message };
  }
  if (code.includes("provider")) {
    return { code, category: "provider", retryable: true, user_action: "retry", safe_message: message };
  }
  if (code.includes("interrupted")) {
    return { code, category: "interrupted", retryable: true, user_action: "retry", safe_message: message };
  }
  if (code.includes("conflict")) {
    return { code, category: "conflict", retryable: false, user_action: "refresh", safe_message: message };
  }
  if (code.includes("not_found")) {
    return { code, category: "not_found", retryable: false, user_action: "refresh", safe_message: message };
  }
  if (code.includes("paused")) {
    return { code, category: "invalid_state", retryable: false, user_action: "resume", safe_message: message };
  }
  if (code.includes("invalid") || code.includes("configuration") || code.includes("wrong_sync_kind")) {
    return { code, category: "configuration", retryable: false, user_action: "fix_configuration", safe_message: message };
  }
  return { code, category: "unknown", retryable: false, user_action: "contact_support", safe_message: message };
}

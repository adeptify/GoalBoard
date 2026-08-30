export type ItemKind = "message" | "notification" | "issue" | "pr" | "mention" | "update";
export type Priority = "low" | "medium" | "high" | "urgent";

export interface ConnectorIngestItem {
  externalId: string;
  title: string;
  summary: string;
  body?: string;
  url?: string;
  kind?: ItemKind;
  priority?: Priority;
  tags?: string[];
  author?: string;
}

/**
 * Closed live-mode failure classes — no provider body, stack, or secrets.
 * `stale_history` signals a typed full-resync requirement (e.g. HTTP 404 on
 * users.history.list with an expired startHistoryId). Application never
 * auto-loops; Main/UI must request one explicit rebuild_cursor sync.
 */
export type ConnectorSyncFailureKind =
  | "needs_auth"
  | "configuration"
  | "network"
  | "provider"
  | "stale_history";

/**
 * Closed sync intent from client/API/application — never provider cursor JSON.
 * - normal (default/legacy): provider decides incremental vs full from cursor
 * - rebuild_cursor: Gmail-only bounded full resync; other providers ignore
 */
export type ConnectorSyncMode = "normal" | "rebuild_cursor";

/** Adapter sync input. Application preserves the persisted cursor until success. */
export type ConnectorSyncRequest = {
  cursor: unknown;
  /** Default and legacy callers: normal. */
  mode?: ConnectorSyncMode;
};

export type ConnectorSyncSuccess = {
  ok: true;
  /** live = real provider items; fixture = explicit demo (no usable credential). */
  mode: "live" | "fixture";
  items: ConnectorIngestItem[];
  cursor: unknown;
};

export type ConnectorSyncFailure = {
  ok: false;
  /** Failures only occur in live mode; fixture is never a silent fallback. */
  mode: "live";
  failure: ConnectorSyncFailureKind;
  message: string;
  action?: string;
  /** HTTP status when known — never a response body. */
  httpStatus?: number;
};

/**
 * Discriminated connector sync result.
 * Live success, explicit fixture success, or closed live failure.
 */
export type ConnectorSyncResult = ConnectorSyncSuccess | ConnectorSyncFailure;

export interface ConnectorHealth {
  ok: boolean;
  status: "connected" | "disconnected" | "error" | "mock" | "needs_auth";
  message: string;
  action?: string;
}

export interface ConnectorPort {
  readonly type: string;
  health(): Promise<ConnectorHealth>;
  sync(input: ConnectorSyncRequest): Promise<ConnectorSyncResult>;
}

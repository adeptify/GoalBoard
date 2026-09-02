import type { ContractDescriptor } from "../platform/package.js";

export const modulesSourcesContract = {
  contractId: "io.goalboard.module.sources.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/modules/sources.md",
} as const satisfies ContractDescriptor;

export type SourceStatus = "active" | "paused" | "error" | "disconnected" | "imported";
export type SourceSyncKind = "public_source" | "github" | "gmail" | "manual";
export type SourceHistoryDecision = "retain_history" | "delete_local_history";
export type SourceSchedule =
  | { mode: "manual" }
  | {
      mode: "interval";
      enabled: boolean;
      interval_minutes: number;
      next_pull_at: string | null;
    };

/** Durable desired state. Listener cursor, lease and retry state are deliberately absent. */
export interface SourceRecord {
  project_id: string;
  source_id: string;
  kind: string;
  definition_id: string | null;
  sync_kind: SourceSyncKind;
  name: string;
  description: string;
  status: SourceStatus;
  enabled: boolean;
  origin: "relay" | "goalboard";
  config: Record<string, unknown>;
  schedule: SourceSchedule;
  connection_ref: string | null;
  account_label: string | null;
  last_sync_at: string | null;
  last_outcome: string | null;
  last_error_code: string | null;
  imported_at: string;
  updated_at: string;
}

export interface SourceQuery {
  list(projectId: string): SourceRecord[];
  get(projectId: string, sourceId: string): SourceRecord;
  find(
    projectId: string,
    syncKind: SourceSyncKind,
    definitionId: string | null,
    configFingerprint?: string,
  ): SourceRecord | null;
}

export interface SourceCommands {
  save(source: SourceRecord): SourceRecord;
  setEnabled(projectId: string, sourceId: string, enabled: boolean, at?: string): SourceRecord;
  retire(
    projectId: string,
    sourceId: string,
    historyDecision: SourceHistoryDecision,
    at?: string,
  ): SourceRecord;
}

export interface SourceEvent {
  event_id: string;
  project_id: string;
  source_id: string;
  type: "source.created" | "source.updated" | "source.status_changed" | "source.retired";
  payload: Record<string, unknown>;
  at: string;
}

export interface SourceEvents {
  list(projectId: string, sourceId?: string): SourceEvent[];
}

export interface SourcesApi {
  readonly query: SourceQuery;
  readonly commands: SourceCommands;
  readonly events: SourceEvents;
}

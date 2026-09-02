/**
 * Runtime-facing compatibility types.
 *
 * Session facts and commands are owned by the Private Work Context Contract;
 * this file only retains Runtime adapter and UI result shapes until WK2/WK3.
 */
export {
  WORK_SESSION_EVENT_KINDS as SESSION_TIMELINE_KINDS,
  WORK_SESSION_EVENT_SOURCES as SESSION_EVENT_SOURCES,
  WORK_SESSION_HANDOFF_STATES as SESSION_HANDOFF_STATES,
} from "@adeptify/goalboard-contracts/modules/private-work-context";

export type {
  AppendWorkSessionEventInput as AppendGoalBoardSessionEventInput,
  CreateWorkSessionInput as CreateGoalBoardSessionInput,
  CreateWorkSessionHandoffDraftInput as CreateSessionHandoffDraftInput,
  DiscoverWorkSessionInput as DiscoverRuntimeSessionInput,
  ExplicitlyLinkWorkSessionInput as ExplicitlyLinkRuntimeSessionInput,
  LegacyRuntimeContextBindingInput as LegacySessionBindingInput,
  LegacyWorkSessionMigrationInput as LegacySessionMigrationInput,
  LegacyWorkSessionMigrationReport as LegacySessionMigrationReport,
  LegacyWorkSessionPanelInput as LegacySessionPanelInput,
  LinkNativeWorkSessionInput as LinkNativeRuntimeSessionInput,
  ReassignWorkSessionWorkspaceInput as ReassignWorkspaceSessionsInput,
  SetWorkSessionStatusInput as SetGoalBoardSessionStatusInput,
  UpdateWorkSessionAssociationsInput as UpdateSessionAssociationsInput,
  UpdateWorkSessionHandoffDraftInput as UpdateSessionHandoffDraftInput,
  WorkSessionEventKind as SessionTimelineKind,
  WorkSessionEventRecord as GoalBoardSessionEventRecord,
  WorkSessionEventSource as SessionEventSource,
  WorkSessionGoalLink as GoalBoardSessionGoalLink,
  WorkSessionHandoffDeliveryMode as SessionHandoffDeliveryMode,
  WorkSessionHandoffRecord as GoalBoardSessionHandoffRecord,
  WorkSessionHandoffState as SessionHandoffState,
  WorkSessionListFilter as SessionListFilter,
  WorkSessionProvenance as GoalBoardSessionProvenance,
  WorkSessionRecord as GoalBoardSessionRecord,
  WorkSessionStatus as GoalBoardSessionStatus,
} from "@adeptify/goalboard-contracts/modules/private-work-context";

export { GoalBoardSessionError } from "@adeptify/goalboard-module-private-work-context";

import type {
  WorkSessionEventKind as SessionTimelineKind,
  WorkSessionEventSource as SessionEventSource,
  WorkSessionRecord as GoalBoardSessionRecord,
} from "@adeptify/goalboard-contracts/modules/private-work-context";

export { RUNTIME_SESSION_CAPABILITIES } from "@adeptify/goalboard-contracts/services/runtime-host";
export type {
  RuntimeHostApi,
  RuntimeProviderDescriptor,
  RuntimeSessionAdapter,
  RuntimeSessionAdapterResult,
  RuntimeSessionCapabilities,
  RuntimeSessionCapability,
  RuntimeSessionCapabilityMode,
  RuntimeSessionTransport,
} from "@adeptify/goalboard-contracts/services/runtime-host";

export interface SessionTimelineEvent {
  event_id: string;
  session_id: string;
  source: "runtime_native" | SessionEventSource;
  kind: SessionTimelineKind;
  label: string;
  content: string;
  occurred_at: string;
  source_order: number;
  runtime_id: string;
  metadata: Record<string, unknown>;
}

export type SessionContentMode = "native" | "fallback" | "unavailable" | "failed";

export interface SessionContentResult {
  session: GoalBoardSessionRecord;
  content_mode: SessionContentMode;
  events: SessionTimelineEvent[];
  native_error: { code: string; message: string } | null;
  native_history: {
    mode: "summary";
    turn_count: number;
    has_earlier: boolean;
  } | null;
  partial_terminal_history: boolean;
}

export type SessionResumeResult =
  | {
      status: "ok";
      runtime_id: string;
      native_runtime_session_id: string;
      value: unknown;
    }
  | {
      status: "unsupported" | "failed";
      runtime_id: string;
      code: string;
      message: string;
      next_action: "create_handoff" | "retry";
    };

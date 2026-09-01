export const RUNTIME_SESSION_CAPABILITIES = [
  "create",
  "list",
  "discover",
  "read",
  "resume",
  "events",
  "handoff",
] as const;

export type RuntimeSessionCapability = (typeof RUNTIME_SESSION_CAPABILITIES)[number];
export type RuntimeSessionCapabilityMode = "native" | "registry" | "unsupported";
export type RuntimeSessionCapabilities = Record<RuntimeSessionCapability, RuntimeSessionCapabilityMode>;

export type GoalBoardSessionProvenance =
  | "goalboard_created"
  | "runtime_discovered"
  | "explicitly_linked"
  | "legacy_migrated";

export type GoalBoardSessionStatus = "discovered" | "active" | "closed";

export interface GoalBoardSessionRecord {
  /** GoalBoard-owned business identity. */
  session_id: string;
  /** Adapter namespace. */
  runtime_id: string;
  /** Runtime-owned identity, meaningful only inside runtime_id. */
  native_runtime_session_id: string | null;
  /** Short-lived proof used before a native identity is available. */
  correlation_token: string | null;
  correlation_expires_at: string | null;
  /** UI/host surface identity. Never a Runtime identity. */
  surface_id: string | null;
  project_id: string | null;
  current_goal_id: string | null;
  workspace_id: string | null;
  workspace_path: string | null;
  title: string | null;
  status: GoalBoardSessionStatus;
  provenance: GoalBoardSessionProvenance;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface GoalBoardSessionGoalLink {
  link_id: string;
  session_id: string;
  goal_id: string;
  relation: "current" | "history";
  linked_by: string;
  created_at: string;
  ended_at: string | null;
}

export const SESSION_HANDOFF_STATES = ["draft", "sending", "failed", "sent", "cancelled"] as const;
export type SessionHandoffState = (typeof SESSION_HANDOFF_STATES)[number];
export type SessionHandoffDeliveryMode = "native" | "goalboard_fallback";

export interface GoalBoardSessionHandoffRecord {
  package_id: string;
  source_session_id: string;
  source_project_id: string;
  source_goal_id: string;
  target_runtime_id: string;
  target_project_id: string;
  target_workspace_id: string | null;
  target_workspace_path: string | null;
  destination_session_id: string | null;
  state: SessionHandoffState;
  delivery_mode: SessionHandoffDeliveryMode | null;
  content: string | null;
  content_available: boolean;
  content_digest: string;
  attempt_count: number;
  error_code: string | null;
  error_message: string | null;
  retryable: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
}

export interface CreateSessionHandoffDraftInput {
  source_session_id: string;
  source_project_id: string;
  source_goal_id: string;
  target_runtime_id: string;
  target_project_id: string;
  target_workspace_id?: string | null;
  target_workspace_path?: string | null;
  content: string;
  actor_id: string;
}

export interface UpdateSessionHandoffDraftInput {
  package_id: string;
  target_runtime_id: string;
  target_project_id: string;
  target_workspace_id?: string | null;
  target_workspace_path?: string | null;
  content: string;
  actor_id: string;
}

export const SESSION_EVENT_SOURCES = ["goalboard_tui", "goalboard"] as const;
export type SessionEventSource = (typeof SESSION_EVENT_SOURCES)[number];

export const SESSION_TIMELINE_KINDS = [
  "user_message",
  "runtime_message",
  "tool",
  "approval",
  "status",
  "artifact",
  "terminal_output",
] as const;
export type SessionTimelineKind = (typeof SESSION_TIMELINE_KINDS)[number];

export interface AppendGoalBoardSessionEventInput {
  session_id: string;
  source: SessionEventSource;
  kind: SessionTimelineKind;
  source_id: string;
  source_order?: number;
  occurred_at?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface GoalBoardSessionEventRecord {
  event_id: string;
  session_id: string;
  source: SessionEventSource;
  kind: SessionTimelineKind;
  source_id: string;
  source_order: number;
  occurred_at: string;
  content: string | null;
  content_available: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

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

export interface CreateGoalBoardSessionInput {
  runtime_id: string;
  actor_id: string;
  user_confirmed: boolean;
  native_runtime_session_id?: string | null;
  surface_id?: string | null;
  project_id?: string | null;
  current_goal_id?: string | null;
  workspace_id?: string | null;
  workspace_path?: string | null;
  title?: string | null;
  provenance?: Exclude<GoalBoardSessionProvenance, "runtime_discovered" | "legacy_migrated">;
  metadata?: Record<string, unknown>;
  correlation_ttl_seconds?: number;
}

export interface DiscoverRuntimeSessionInput {
  runtime_id: string;
  native_runtime_session_id: string;
  title?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ExplicitlyLinkRuntimeSessionInput {
  runtime_id: string;
  native_runtime_session_id: string;
  actor_id: string;
  user_confirmed: boolean;
  project_id?: string | null;
  current_goal_id?: string | null;
  workspace_id?: string | null;
  workspace_path?: string | null;
  title?: string | null;
}

export interface LinkNativeRuntimeSessionInput {
  session_id: string;
  runtime_id: string;
  native_runtime_session_id: string;
  actor_id: string;
  correlation_token?: string | null;
  surface_id?: string | null;
}

export interface UpdateSessionAssociationsInput {
  session_id: string;
  actor_id: string;
  user_confirmed: boolean;
  project_id?: string | null;
  current_goal_id?: string | null;
  workspace_id?: string | null;
  workspace_path?: string | null;
}

export interface SetGoalBoardSessionStatusInput {
  session_id: string;
  actor_id: string;
  user_confirmed: boolean;
  status: Extract<GoalBoardSessionStatus, "active" | "closed">;
}

export interface ReassignWorkspaceSessionsInput {
  project_id: string;
  actor_id: string;
  user_confirmed: boolean;
  previous_workspace_id?: string | null;
  previous_workspace_path?: string | null;
  workspace_id: string | null;
  workspace_path: string | null;
}

export interface SessionListFilter {
  runtime_id?: string;
  project_id?: string;
  workspace_id?: string;
  status?: GoalBoardSessionStatus;
}

export interface LegacySessionPanelInput {
  panel_id: string;
  project_id: string;
  goal_id: string;
  runtime_id: string;
  work_context_id: string;
  host_session_id: string | null;
  workspace_id: string | null;
  workspace_path: string | null;
  title: string;
  status: "open" | "exited";
  created_at: string;
  updated_at: string;
}

export interface LegacySessionBindingInput {
  binding_id: string;
  runtime_id: string;
  stable_work_context_id: string;
  project_id: string;
  bound_by: string;
  created_at: string;
  updated_at: string;
}

export interface LegacySessionMigrationInput {
  panels: LegacySessionPanelInput[];
  bindings: LegacySessionBindingInput[];
  before_step?: (step: "after_panels" | "after_bindings" | "before_commit") => void;
}

export interface LegacySessionMigrationReport {
  created_sessions: number;
  reused_sessions: number;
  receipts_written: number;
  session_ids: string[];
}

export type RuntimeSessionAdapterResult<T = unknown> =
  | { status: "ok"; source: "native" | "registry"; capability: RuntimeSessionCapability; value: T }
  | {
      status: "unsupported";
      capability: RuntimeSessionCapability;
      code: "runtime.capability_unavailable";
      message: string;
    }
  | {
      status: "failed";
      capability: RuntimeSessionCapability;
      code: "runtime.operation_failed" | "runtime.response_too_large";
      message: string;
      recovery?: {
        phase: "create" | "deliver";
        native_runtime_session_id?: string;
        retryable: boolean;
      };
    };

export interface RuntimeSessionTransport {
  request(method: string, params: Record<string, unknown>): Promise<unknown>;
  subscribe(listener: (event: { method: string; params: unknown }) => void): () => void;
}

export interface RuntimeSessionAdapter {
  readonly runtime_id: string;
  readonly capabilities: RuntimeSessionCapabilities;
  invoke(
    capability: RuntimeSessionCapability,
    input: Record<string, unknown>,
  ): Promise<RuntimeSessionAdapterResult>;
}

export class GoalBoardSessionError extends Error {
  constructor(
    readonly code:
      | "session.not_found"
      | "session.confirmation_required"
      | "session.identity_conflict"
      | "session.runtime_mismatch"
      | "session.correlation_invalid"
      | "session.invalid_input"
      | "session.handoff_not_found"
      | "session.handoff_invalid_state"
      | "session.registry_unknown"
      | "session.registry_reader_too_old",
    message: string,
  ) {
    super(message);
    this.name = "GoalBoardSessionError";
  }
}

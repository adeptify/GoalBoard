import fs from "node:fs";
import path from "node:path";
import {
  GoalBoardProjectCatalog,
  normalizeRuntimeWorkContext,
  type RuntimeProjectSuggestionClue,
  type RuntimeWorkContext,
} from "../projects/catalog.js";
import { GoalBoardSessionRegistry } from "./registry.js";
import type {
  GoalBoardSessionRecord,
  LegacySessionMigrationReport,
} from "./types.js";

export interface RuntimeSessionHostSignals {
  runtime_id: string;
  goalboard_session_id: string | null;
  native_runtime_session_id: string | null;
  legacy_work_context_id: string | null;
  surface_id: string | null;
  goal_id: string | null;
  runtime_context: RuntimeWorkContext;
  project_suggestion_clues: RuntimeProjectSuggestionClue[];
}

/**
 * The only production boundary that consumes legacy GoalBoard panel/work-context
 * variables. Callers receive separated Session, Runtime, surface, Goal and
 * workspace identities instead of interpreting the old variables themselves.
 */
export function runtimeSessionHostSignalsFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  currentWorkingDirectory: string = process.cwd(),
): RuntimeSessionHostSignals | null {
  const runtimeId = environment.GOALBOARD_RUNTIME_ID?.trim() || null;
  if (!runtimeId) return null;
  const goalBoardSessionId = environment.GOALBOARD_SESSION_ID?.trim() || null;
  const legacyWorkContextId = environment.GOALBOARD_WORK_CONTEXT_ID?.trim() || null;
  const nativeRuntimeSessionId = stableRuntimeSessionId(runtimeId, environment);
  const projectSuggestionClues: RuntimeProjectSuggestionClue[] = [];
  const workspace = environment.PWD?.trim() || currentWorkingDirectory.trim();
  if (workspace && path.isAbsolute(workspace)) {
    projectSuggestionClues.push({ kind: "workspace", value: workspace });
  }
  const sessionTitle = environment.CLAUDE_CODE_SESSION_NAME?.trim();
  if (sessionTitle) projectSuggestionClues.push({ kind: "session_title", value: sessionTitle });
  return {
    runtime_id: runtimeId,
    goalboard_session_id: goalBoardSessionId,
    native_runtime_session_id: nativeRuntimeSessionId,
    legacy_work_context_id: legacyWorkContextId,
    surface_id: environment.GOALBOARD_PANEL_ID?.trim() || null,
    goal_id: environment.GOALBOARD_GOAL_ID?.trim() || null,
    runtime_context: {
      runtime_id: runtimeId,
      // Preserve legacy project-routing behavior while the Session Registry is
      // additive. Native identity is carried separately above.
      stable_work_context_id: legacyWorkContextId ?? nativeRuntimeSessionId,
      host_declares_stable: legacyWorkContextId
        ? environment.GOALBOARD_WORK_CONTEXT_STABLE === "true"
        : nativeRuntimeSessionId != null,
      workspace: workspace && path.isAbsolute(workspace) ? canonicalWorkspaceContext(workspace) : null,
    },
    project_suggestion_clues: projectSuggestionClues,
  };
}

export function reconcileLegacySessionCatalog(
  catalog: GoalBoardProjectCatalog,
  registry: GoalBoardSessionRegistry,
  beforeStep?: (step: "after_panels" | "after_bindings" | "before_commit") => void,
): LegacySessionMigrationReport {
  const panels = catalog.listProjects().flatMap((project) =>
    catalog.listDesktopPanels(project.project_id).map((panel) => {
      const normalized = panel.cwd
        ? normalizeRuntimeWorkContext({
            runtime_id: panel.runtime_kind,
            stable_work_context_id: null,
            host_declares_stable: false,
            workspace: { canonical_path: panel.cwd, realpath_verified: false },
          }).workspace
        : undefined;
      return {
        panel_id: panel.panel_id,
        project_id: panel.project_id,
        goal_id: panel.goal_id,
        runtime_id: panel.runtime_kind,
        work_context_id: panel.work_context_id,
        host_session_id: panel.host_session_id,
        workspace_id: normalized?.workspace_id ?? null,
        workspace_path: normalized?.canonical_path ?? null,
        title: panel.title,
        status: panel.status,
        created_at: panel.created_at,
        updated_at: panel.updated_at,
      };
    }),
  );
  return registry.migrateLegacy({
    panels,
    bindings: catalog.listRuntimeContextBindings().map((binding) => ({
      binding_id: binding.binding_id,
      runtime_id: binding.runtime_id,
      stable_work_context_id: binding.stable_work_context_id,
      project_id: binding.project_id,
      bound_by: binding.bound_by,
      created_at: binding.created_at,
      updated_at: binding.updated_at,
    })),
    before_step: beforeStep,
  });
}

export function findSessionForHostSignals(
  registry: GoalBoardSessionRegistry,
  signals: RuntimeSessionHostSignals,
  nativeRuntimeSessionId?: string | null,
): GoalBoardSessionRecord | null {
  const nativeId = nativeRuntimeSessionId?.trim() || signals.native_runtime_session_id;
  if (signals.goalboard_session_id) {
    try {
      const session = registry.get(signals.goalboard_session_id);
      if (
        session.runtime_id === signals.runtime_id
        && (!nativeId || !session.native_runtime_session_id || session.native_runtime_session_id === nativeId)
      ) return session;
    } catch {
      // A stale new-path ID may still be recovered through native or surface identity.
    }
  }
  if (nativeId) {
    const native = registry.findByNativeRuntimeSession(signals.runtime_id, nativeId);
    if (native) return native;
  }
  if (signals.surface_id) {
    const surface = registry.findBySurface(signals.surface_id);
    if (
      surface?.runtime_id === signals.runtime_id
      && (!nativeId || !surface.native_runtime_session_id || surface.native_runtime_session_id === nativeId)
    ) return surface;
  }
  if (
    signals.runtime_context.stable_work_context_id
    && (!nativeId || signals.runtime_context.stable_work_context_id === nativeId)
  ) {
    return registry.findByNativeRuntimeSession(
      signals.runtime_id,
      signals.runtime_context.stable_work_context_id,
    );
  }
  return null;
}

function stableRuntimeSessionId(runtimeId: string, environment: NodeJS.ProcessEnv): string | null {
  if (runtimeId === "codex") return environment.CODEX_THREAD_ID?.trim() || null;
  if (runtimeId === "claude-code") {
    return environment.CLAUDE_CODE_SESSION_ID?.trim()
      || environment.CLAUDE_SESSION_ID?.trim()
      || null;
  }
  return null;
}

function canonicalWorkspaceContext(workspace: string): NonNullable<RuntimeWorkContext["workspace"]> {
  const normalized = path.resolve(workspace);
  try {
    return { canonical_path: fs.realpathSync.native(normalized), realpath_verified: true };
  } catch {
    return { canonical_path: normalized, realpath_verified: false };
  }
}

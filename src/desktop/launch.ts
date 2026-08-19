import {
  isDesktopRuntimeKind,
  isSupportedRuntimeId,
  RUNTIME_DISPLAY_NAMES,
  runtimeDisplayName,
  type DesktopRuntimeKind,
  type SupportedRuntimeId,
} from "../runtimes.js";

export { isDesktopRuntimeKind, runtimeDisplayName as desktopRuntimeTitle, type DesktopRuntimeKind };

export interface DesktopLaunchSpec {
  runtime_kind: DesktopRuntimeKind;
  command: string;
  args: string[];
  title: string;
}

interface DesktopRuntimeRecipe {
  command: string;
  resumeArgs: (sessionId: string) => string[];
}

const DESKTOP_RUNTIME_RECIPES: Record<SupportedRuntimeId, DesktopRuntimeRecipe> = {
  codex: {
    command: "codex",
    resumeArgs: (sessionId) => ["resume", sessionId],
  },
  "claude-code": {
    command: "claude",
    resumeArgs: (sessionId) => ["--resume", sessionId],
  },
  opencode: {
    command: "opencode",
    resumeArgs: (sessionId) => ["--session", sessionId],
  },
  "pi-agent": {
    command: "pi",
    resumeArgs: (sessionId) => ["--session", sessionId],
  },
  "grok-build": {
    command: "grok",
    resumeArgs: (sessionId) => ["--resume", sessionId],
  },
};

export function desktopLaunchSpec(input: {
  runtime_kind: string;
  command?: string;
  args?: string[];
  resume_session_id?: string | null;
}): DesktopLaunchSpec {
  const resume = input.resume_session_id?.trim() || null;
  if (isSupportedRuntimeId(input.runtime_kind)) {
    const recipe = DESKTOP_RUNTIME_RECIPES[input.runtime_kind];
    const title = RUNTIME_DISPLAY_NAMES[input.runtime_kind];
    return {
      runtime_kind: input.runtime_kind,
      command: input.command?.trim() || recipe.command,
      args: resume ? recipe.resumeArgs(resume) : [...(input.args ?? [])],
      title: resume ? `${title} · ${resume.slice(0, 8)}` : title,
    };
  }
  const command = input.command?.trim();
  if (!command) {
    throw new Error("自定义终端需要提供启动命令");
  }
  return {
    runtime_kind: "generic",
    command,
    args: [...(input.args ?? [])],
    title: command,
  };
}

export function desktopPanelEnv(input: {
  homeDirectory: string;
  runtimeId: string;
  panelId: string;
  workContextId: string;
  goalId: string;
}): Record<string, string> {
  return {
    GOALBOARD_HOME: input.homeDirectory,
    GOALBOARD_MCP_AUDIENCE: "runtime",
    GOALBOARD_RUNTIME_ID: input.runtimeId,
    GOALBOARD_WORK_CONTEXT_ID: input.workContextId,
    GOALBOARD_WORK_CONTEXT_STABLE: "true",
    GOALBOARD_PANEL_ID: input.panelId,
    GOALBOARD_GOAL_ID: input.goalId,
    GOALBOARD_WEB_URL: "http://127.0.0.1:4173",
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
  };
}

export function desktopPanelSpawnPayload(input: {
  homeDirectory: string;
  panel: {
    panel_id: string;
    runtime_kind: string;
    launch_command: string;
    launch_args: string[];
    cwd: string | null;
    work_context_id: string;
    goal_id: string;
  };
}): { command: string; args: string[]; cwd: string | null; env: Record<string, string> } {
  return {
    command: input.panel.launch_command,
    args: input.panel.launch_args,
    cwd: input.panel.cwd,
    env: desktopPanelEnv({
      homeDirectory: input.homeDirectory,
      runtimeId: input.panel.runtime_kind,
      panelId: input.panel.panel_id,
      workContextId: input.panel.work_context_id,
      goalId: input.panel.goal_id,
    }),
  };
}

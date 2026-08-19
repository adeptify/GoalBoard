export const SUPPORTED_RUNTIME_IDS = ["codex", "claude-code", "opencode", "pi-agent", "grok-build"] as const;
export type SupportedRuntimeId = (typeof SUPPORTED_RUNTIME_IDS)[number];

export const RUNTIME_DISPLAY_NAMES = {
  codex: "Codex",
  "claude-code": "Claude Code",
  opencode: "OpenCode",
  "pi-agent": "Pi Agent",
  "grok-build": "Grok Build",
} as const satisfies Record<SupportedRuntimeId, string>;

export const DESKTOP_RUNTIME_KINDS = [...SUPPORTED_RUNTIME_IDS, "generic"] as const;
export type DesktopRuntimeKind = (typeof DESKTOP_RUNTIME_KINDS)[number];

/** Named runtimes in the add-terminal menu; order is visual, not identity. */
export const DESKTOP_TUI_MENU_RUNTIME_IDS = [
  "claude-code",
  "codex",
  "opencode",
  "pi-agent",
  "grok-build",
] as const satisfies readonly SupportedRuntimeId[];

export function isSupportedRuntimeId(value: string): value is SupportedRuntimeId {
  return (SUPPORTED_RUNTIME_IDS as readonly string[]).includes(value);
}

export function isDesktopRuntimeKind(value: string): value is DesktopRuntimeKind {
  return (DESKTOP_RUNTIME_KINDS as readonly string[]).includes(value);
}

export function runtimeDisplayName(runtimeId: string): string {
  if (runtimeId === "generic") return "自定义命令";
  return isSupportedRuntimeId(runtimeId) ? RUNTIME_DISPLAY_NAMES[runtimeId] : runtimeId;
}

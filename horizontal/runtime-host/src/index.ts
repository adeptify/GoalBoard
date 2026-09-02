export const packageDescriptor = {
  packageName: "@adeptify/goalboard-service-runtime-host",
  packagePath: "horizontal/runtime-host",
  kind: "horizontal",
  maturity: "partial",
  contract: "@adeptify/goalboard-contracts/services/runtime-host",
  migrationGoals: ["goal-reorg-f2","goal-reorg-wk2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["runtime.host.v1", "runtime.codex.v1", "runtime.terminal-pty.v1"],
} as const;

export type GoalBoardPackageDescriptor = typeof packageDescriptor;

export {
  RuntimeHostRouter,
  assertCompleteRuntimeSessionCapabilities,
  type RuntimeAdapterFallback,
} from "./runtime-router.js";
export {
  CodexRuntimeSessionAdapter,
} from "./adapters/codex-session.js";
export {
  CodexAppServerTransport,
  CodexAppServerTransportError,
  type CodexAppServerTransportOptions,
} from "./adapters/codex-app-server.js";
export {
  GoalBoardPtyHost,
  buildPtyEnvironment,
  isBlockedPtyEnvKey,
  isPtyCommandAvailable,
  resolveNvmBinDirectory,
  resolvePtyCommand,
  type PtyHostHandlers,
  type PtySpawnRequest,
  type PtySpawnResult,
} from "./adapters/terminal-pty.js";
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

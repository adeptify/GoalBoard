export * from "@adeptify/goalboard-contracts/modules/private-work-context";
export { createSessionContentStore, type SessionContentStore } from "./content-store.js";
export {
  RuntimeContextBindingRepository,
  createRuntimeContextBindingTables,
  createRuntimeContextSetupRequestTable,
  createRuntimeContextSuggestionRejectionTable,
  migrateRuntimeContextBindingEventsForUnbind,
  type RuntimeContextSetupRequestRecord,
} from "./context-bindings.js";
export { GoalBoardSessionError, PrivateWorkContextError } from "./errors.js";
export {
  GoalBoardSessionRegistry,
  type GoalBoardSessionRegistryOptions,
} from "./session-registry.js";

export const packageDescriptor = {
  packageName: "@adeptify/goalboard-module-private-work-context",
  packagePath: "modules/private-work-context",
  kind: "module",
  maturity: "partial",
  contract: "@adeptify/goalboard-contracts/modules/private-work-context",
  migrationGoals: ["goal-reorg-f2","goal-reorg-wk1"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [
    "private-session-registry",
    "encrypted-content-store",
    "session-events",
    "session-handoff-facts",
    "legacy-session-migration",
    "runtime-context-bindings",
  ],
} as const;

export type GoalBoardPackageDescriptor = typeof packageDescriptor;

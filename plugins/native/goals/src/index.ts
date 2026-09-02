export * from "./execution-validation-contract.js";
export * from "./action-projection.js";
export * from "./contract-revisions.js";
export * from "./human-review.js";
export * from "./parent-completion.js";

export const packageDescriptor = {
  packageName: "@adeptify/goalboard-plugin-goals",
  packagePath: "plugins/native/goals",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@adeptify/goalboard-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2","goal-f826dfb8-bf63-4e98-b6b7-57f6b4b7c3b8","goal-reorg-gw4","goal-reorg-ex4"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["goals.execution-validation-application.v1"],
} as const;

export type GoalBoardPackageDescriptor = typeof packageDescriptor;

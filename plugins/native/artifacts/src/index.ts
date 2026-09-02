/** Generated as the F2 contract-only workspace boundary. */
export const packageDescriptor = {
  packageName: "@adeptify/goalboard-plugin-artifacts",
  packagePath: "plugins/native/artifacts",
  kind: "native-plugin",
  maturity: "contract-only",
  contract: "@adeptify/goalboard-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-ar1", "goal-reorg-ar3"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [],
} as const;

export type GoalBoardPackageDescriptor = typeof packageDescriptor;

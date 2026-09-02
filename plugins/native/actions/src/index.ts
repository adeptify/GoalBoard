/** Generated as the F2 contract-only workspace boundary. */
export const packageDescriptor = {
  packageName: "@adeptify/goalboard-plugin-actions",
  packagePath: "plugins/native/actions",
  kind: "native-plugin",
  maturity: "contract-only",
  contract: "@adeptify/goalboard-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [],
} as const;

export type GoalBoardPackageDescriptor = typeof packageDescriptor;

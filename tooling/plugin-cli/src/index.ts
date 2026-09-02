/** Generated as the F2 contract-only workspace boundary. */
export const packageDescriptor = {
  packageName: "@adeptify/goalboard-plugin-cli",
  packagePath: "tooling/plugin-cli",
  kind: "tooling",
  maturity: "contract-only",
  contract: "@adeptify/goalboard-contracts/platform/tooling",
  migrationGoals: ["goal-reorg-f2","goal-reorg-dv3"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [],
} as const;

export type GoalBoardPackageDescriptor = typeof packageDescriptor;

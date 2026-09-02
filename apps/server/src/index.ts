/** Generated as the F2 contract-only workspace boundary. */
export const packageDescriptor = {
  packageName: "@adeptify/goalboard-app-server",
  packagePath: "apps/server",
  kind: "app",
  maturity: "contract-only",
  contract: "@adeptify/goalboard-contracts/platform/app-host",
  migrationGoals: ["goal-reorg-f2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [],
} as const;

export type GoalBoardPackageDescriptor = typeof packageDescriptor;

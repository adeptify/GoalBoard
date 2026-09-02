/** Generated as the F2 contract-only workspace boundary. */
export const packageDescriptor = {
  packageName: "@adeptify/goalboard-storage",
  packagePath: "packages/storage",
  kind: "foundation",
  maturity: "contract-only",
  contract: "@adeptify/goalboard-contracts/platform/storage",
  migrationGoals: ["goal-reorg-f2","goal-reorg-ap2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [],
} as const;

export type GoalBoardPackageDescriptor = typeof packageDescriptor;

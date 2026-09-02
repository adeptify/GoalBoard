export {
  evaluateImportBoundary,
  extractImportSpecifiers,
  findDependencyCycles,
} from "./boundaries.js";
export type {
  BoundaryPackage,
  BoundaryPackageKind,
  BoundaryViolation,
  BoundaryViolationCode,
  ImportObservation,
} from "./boundaries.js";

/** F2 created the package boundary; F3 adds the first real, business-neutral capability. */
export const packageDescriptor = {
  packageName: "@adeptify/goalboard-test-kit",
  packagePath: "packages/test-kit",
  kind: "foundation",
  maturity: "partial",
  contract: "@adeptify/goalboard-contracts/platform/testing",
  migrationGoals: ["goal-reorg-f2","goal-reorg-f3"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["workspace-boundary-policy"],
} as const;

export type GoalBoardPackageDescriptor = typeof packageDescriptor;

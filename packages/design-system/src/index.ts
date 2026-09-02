export const packageDescriptor = {
  packageName: "@adeptify/goalboard-design-system",
  packagePath: "packages/design-system",
  kind: "foundation",
  maturity: "partial",
  contract: "@adeptify/goalboard-contracts/platform/ui",
  migrationGoals: ["goal-reorg-f2","goal-reorg-ap3"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [
    "design-system.theme.v1",
    "design-system.tokens.v1",
    "design-system.accessibility.v1",
  ],
} as const;

export type GoalBoardPackageDescriptor = typeof packageDescriptor;

export {
  GOALBOARD_DENSITY_STORAGE_KEY,
  GOALBOARD_TERMINAL_THEME_STORAGE_KEY,
  GOALBOARD_THEME_STORAGE_KEY,
  THEME_BOOTSTRAP_SCRIPT,
  VISUAL_FOUNDATION_CLIENT_SCRIPT,
  VISUAL_FOUNDATION_STYLES,
  type GoalBoardDensity,
  type GoalBoardTerminalTheme,
  type GoalBoardTheme,
} from "./visual-foundation.js";

import type { AttentionApi } from "@adeptify/goalboard-contracts/modules/attention-resumption";
import type { FeedApi } from "@adeptify/goalboard-contracts/modules/feed";
import type { SourcesApi } from "@adeptify/goalboard-contracts/modules/sources";

export const packageDescriptor = {
  packageName: "@adeptify/goalboard-plugin-feed",
  packagePath: "plugins/native/feed",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@adeptify/goalboard-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2","goal-reorg-fd4"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [
    "feed.native-plugin.contract.v1",
    "feed.ui-contribution.v1",
    "feed.http-routes.v1",
  ],
} as const;

/**
 * FD2 fixes the native Plugin's module-facing boundary. FD4 will add the UI
 * contribution without giving the Plugin ownership of either fact store.
 */
export interface FeedNativePluginModules {
  readonly feed: FeedApi;
  readonly attention: AttentionApi;
  readonly sources: SourcesApi;
}

export type GoalBoardPackageDescriptor = typeof packageDescriptor;

export * from "./routes.js";
export * from "./ui.js";
export * from "./context.js";

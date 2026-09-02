import type {
  IntegrationProviderPort,
  PluginDefinition,
  PluginManifest,
} from "@adeptify/goalboard-contracts/platform/plugin";
import { definePollingIntegrationPlugin } from "@adeptify/goalboard-plugin-sdk";

export {
  classifyGmailForbiddenPayload,
  createGmailProvider,
  resolveStaleHistoryRecovery,
  type GmailFetch,
  type GmailForbiddenDisposition,
  type GmailTokenRefs,
  type GmailUsableTokenResult,
} from "./provider.js";

export const packageDescriptor = {
  packageName: "@adeptify/goalboard-integration-gmail",
  packagePath: "plugins/official-integrations/gmail",
  kind: "integration-plugin",
  maturity: "partial",
  contract: "@adeptify/goalboard-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-fd3"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["connector.gmail.v1", "signal-adapter.gmail.v1"],
} as const;

export const gmailIntegrationManifest = {
  schema_version: 1,
  plugin_id: "io.goalboard.integration.gmail",
  version: "1.0.0",
  name: "Gmail",
  kind: "integration",
  publisher: { publisher_id: "io.adeptify", signature: "adeptify-official-signature-v1" },
  host_api_version: 1,
  entrypoints: [{ deployment: "local", entrypoint: "./dist/index.js" }],
  permissions: [
    { permission: "network:googleapis.com", required: true, reason: "读取 Gmail profile、history 和 message" },
    { permission: "secret:gmail", required: true, reason: "使用按账号隔离的 OAuth credential reference" },
  ],
  capabilities: {
    provides: ["connector.driver.gmail.v1", "signal.adapter.gmail.v1"],
    consumes: ["connector.host.v1", "listener.host.v1", "signals.command.v1"],
  },
  artifacts: { produces: [], consumes: [] },
  ui: { contributions: ["settings.integration.gmail"] },
} as const satisfies PluginManifest;

export function createGmailIntegrationPlugin(input: {
  provider: IntegrationProviderPort;
  now?: () => Date;
}): PluginDefinition {
  return definePollingIntegrationPlugin({
    manifest: gmailIntegrationManifest,
    createProvider(context) {
      context.requireGrant("network:googleapis.com");
      context.requireGrant("secret:gmail");
      return input.provider;
    },
    now: input.now,
  });
}

export type GoalBoardPackageDescriptor = typeof packageDescriptor;

import { createHash } from "node:crypto";

import type {
  IntegrationProviderPort,
  PluginDefinition,
  PluginManifest,
  PluginStartContext,
} from "@adeptify/goalboard-contracts/platform/plugin";

export const packageDescriptor = {
  packageName: "@adeptify/goalboard-plugin-sdk",
  packagePath: "packages/plugin-sdk",
  kind: "foundation",
  maturity: "partial",
  contract: "@adeptify/goalboard-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-fd3", "goal-reorg-dv3"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["plugin.define.v1", "integration.polling.v1"],
} as const;

export class PluginDefinitionError extends Error {
  constructor(
    readonly code:
      | "plugin_manifest_invalid"
      | "plugin_entrypoint_missing"
      | "plugin_permission_invalid",
    message: string,
  ) {
    super(message);
    this.name = "PluginDefinitionError";
  }
}

export function definePlugin(definition: PluginDefinition): PluginDefinition {
  assertManifest(definition.manifest);
  return Object.freeze(definition);
}

export function definePollingIntegrationPlugin(input: {
  manifest: PluginManifest;
  createProvider(context: PluginStartContext): IntegrationProviderPort;
  now?: () => Date;
}): PluginDefinition {
  if (input.manifest.kind !== "integration") {
    throw new PluginDefinitionError("plugin_manifest_invalid", "Polling Provider 必须声明为 Integration Plugin");
  }
  return definePlugin({
    manifest: input.manifest,
    async start(context) {
      const provider = input.createProvider(context);
      const now = input.now ?? (() => new Date());
      return {
        kind: "integration",
        connector_driver: {
          driver_id: `${input.manifest.plugin_id}:connector`,
          async health() {
            const health = await provider.health();
            return {
              ok: health.ok,
              status: health.status === "mock" ? "error" : health.status,
              message: health.message,
              ...(health.action ? { action: health.action } : {}),
            };
          },
          async poll(request) {
            const mode = request.intent?.sync_mode === "rebuild_cursor"
              ? "rebuild_cursor"
              : "normal";
            const result = await provider.sync({ cursor: request.cursor, mode });
            if (!result.ok) {
              return {
                ok: false,
                mode: "live",
                failure: result.failure,
                message: result.message,
                ...(result.action ? { action: result.action } : {}),
                ...(result.httpStatus == null ? {} : { http_status: result.httpStatus }),
                ...(result.retryAfterAt ? { retry_after_at: result.retryAfterAt } : {}),
              };
            }
            const observedAt = now().toISOString();
            return {
              ok: true,
              mode: result.mode,
              cursor_after: structuredClone(result.cursor),
              events: result.items.map((item, index) => ({
                raw_event_id: `raw-event-${digest(`${input.manifest.plugin_id}\u0000${item.externalId}\u0000${JSON.stringify(item)}`)}`,
                provider_dedupe_id: item.externalId,
                occurred_at: normalizeDate(item.occurredAt, observedAt),
                observed_at: observedAt,
                payload: structuredClone(item) as unknown as Record<string, unknown>,
                ...(index === result.items.length - 1
                  ? { cursor_after: structuredClone(result.cursor) }
                  : {}),
              })),
            };
          },
        },
        signal_adapter: {
          adapter: {
            plugin_id: input.manifest.plugin_id,
            version: input.manifest.version,
          },
          toSignalDraft(event, source) {
            const payload = structuredClone(event.payload);
            const kind = typeof payload.kind === "string" && payload.kind.trim()
              ? payload.kind
              : "update";
            return {
              kind,
              occurred_at: event.occurred_at,
              observed_at: event.observed_at,
              payload,
              content_refs: [],
              provenance: {
                provider_plugin_id: input.manifest.plugin_id,
                provider_plugin_version: input.manifest.version,
                project_id: source.project_id,
                source_id: source.source_id,
              },
            };
          },
        },
      };
    },
  });
}

export function assertManifest(manifest: PluginManifest): void {
  if (
    manifest.schema_version !== 1
    || manifest.host_api_version !== 1
    || !/^io\.goalboard\.[a-z0-9][a-z0-9.-]*$/u.test(manifest.plugin_id)
    || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(manifest.version)
    || !manifest.publisher.publisher_id.trim()
    || !manifest.publisher.signature.trim()
  ) {
    throw new PluginDefinitionError("plugin_manifest_invalid", "Plugin Manifest 身份或版本不合法");
  }
  if (manifest.entrypoints.length === 0) {
    throw new PluginDefinitionError("plugin_entrypoint_missing", "Plugin 至少需要一个 entrypoint");
  }
  const entrypoints = new Set<string>();
  for (const entrypoint of manifest.entrypoints) {
    if (!entrypoint.entrypoint.trim() || entrypoints.has(entrypoint.deployment)) {
      throw new PluginDefinitionError("plugin_entrypoint_missing", "同一部署环境只能声明一个有效 entrypoint");
    }
    entrypoints.add(entrypoint.deployment);
  }
  const permissions = new Set<string>();
  for (const permission of manifest.permissions) {
    if (!permission.permission.trim() || !permission.reason.trim() || permissions.has(permission.permission)) {
      throw new PluginDefinitionError("plugin_permission_invalid", "Plugin permission 必须唯一并说明用途");
    }
    permissions.add(permission.permission);
  }
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function normalizeDate(value: string | undefined, fallback: string): string {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : fallback;
}

export type GoalBoardPackageDescriptor = typeof packageDescriptor;

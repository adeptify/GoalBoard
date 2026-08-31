/**
 * Embedded Intelligence Client exact path over the shared RSS SearchRuntime.
 *
 * Storage foundation is created lazily on first executeExact so Relay bootstrap
 * stays synchronous. Trusted caller context is fixed here — never from the body.
 */
import {
  createIntelligenceIntentClientV1,
  type IntelligenceIntentClientV1,
  type SearchIntentExactResultV1,
} from "@adeptify/intelligence-client";
import { createEmbeddedIntelligenceIntentTransportV1 } from "@adeptify/intelligence-client/embedded";
import {
  createSearchIntentRuntimeV1,
  type SearchIntentRouteResolverV1,
  type SearchIntentRuntimeV1,
} from "@adeptify/search-evidence-layer/intent";
import {
  createSearchIntentPersistenceV1,
  createSearchIntentScopeAuthorityV1,
  createSearchStorageFoundation,
  type SearchStorageFoundationHandle,
} from "@adeptify/search-evidence-layer/host/node";
import { SearchError, type SearchRuntime } from "@adeptify/search-evidence-layer";
import type Database from "better-sqlite3";

import { createFileSecretStore, type SecretStore } from "../security/secret-store.js";
import {
  YOUTUBE_CHANNEL_DEFINITION_ID,
  YOUTUBE_PUBLIC_FEED_HOST,
  isYouTubePublicFeedUrl,
} from "./youtube.js";
import {
  CUSTOM_RSS_DEFINITION_ID,
  customRssFeedHost,
  isCustomRssFeedUrl,
} from "./custom-rss.js";
import {
  listRegisterableFeeds,
  type FeedSourceCatalogEntry,
} from "./catalog.js";
import {
  createFeedSearchAead,
  createFeedSearchOpaqueBlobStore,
  createFeedSearchSecretStore,
} from "./search-storage.js";

const APP_ID = "goalboard";
// v2 intentionally leaves the old opaque v1 ledger untouched. Some migrated
// project databases contain v1 control state without the matching local
// SecretStore key, which must not make public Feed sync permanently unusable.
const KEY_NAMESPACE = "feed-intent-v2";
const TENANT_ID = "solo";
const PRINCIPAL_REF = "goalboard:local";
const ROUTE_MAX_DEADLINE_MS = 60_000;
const ROUTE_MAX_MATERIALS = 20;

/** Composition-root only. Never accept identity from request bodies. */
const GOALBOARD_TRUSTED_CALLER_CONTEXT = Object.freeze({
  kind: "goalboard-composition-root" as const,
  appId: APP_ID,
});

export type IntelligenceCollectRequest = Parameters<IntelligenceIntentClientV1["executeExact"]>[0];
export type IntelligenceCollectResult = Readonly<
  Pick<SearchIntentExactResultV1, "operationId" | "intentFingerprint" | "outcome" | "requirementMet" | "materials" | "receipts" | "warnings" | "budget">
>;

export interface IntelligenceCollectAdapter {
  executeExact(request: IntelligenceCollectRequest, options?: { signal?: AbortSignal }): Promise<IntelligenceCollectResult>;
  shutdown(): Promise<void>;
}

export function createIntelligenceCollectAdapter(options: {
  readonly db: Database.Database;
  readonly secretStore?: SecretStore;
  readonly searchRuntime: SearchRuntime;
  /** Optional AnySearch runtime for exact web-query Inbox Sources. */
  readonly querySearchRuntime?: SearchRuntime;
}): IntelligenceCollectAdapter {
  let ready: Promise<ReadyState> | null = null;
  let shutDown = false;

  const ensureReady = (): Promise<ReadyState> => {
    if (shutDown) {
      return Promise.reject(new Error("intelligence collect adapter shut down"));
    }
    if (!ready) {
      ready = bootstrapReady(
        options.db,
        options.secretStore ?? createFileSecretStore(),
        options.searchRuntime,
        options.querySearchRuntime,
      ).catch((error) => {
        ready = null;
        throw error;
      });
    }
    return ready;
  };

  return {
    async executeExact(request, executeOptions) {
      assertExactRequestHasNoCallerIdentity(request);
      const state = await ensureReady();
      const result = await state.client.executeExact(
        request as IntelligenceCollectRequest,
        executeOptions,
      );
      return toPublicResult(result);
    },

    async shutdown() {
      shutDown = true;
      if (!ready) return;
      try {
        const state = await ready;
        await state.foundation.shutdown();
      } finally {
        ready = null;
      }
    },
  };
}

interface ReadyState {
  readonly client: IntelligenceIntentClientV1;
  readonly foundation: SearchStorageFoundationHandle;
  readonly intentRuntime: SearchIntentRuntimeV1;
}

async function bootstrapReady(
  db: Database.Database,
  secretStore: SecretStore,
  searchRuntime: SearchRuntime,
  querySearchRuntime?: SearchRuntime,
): Promise<ReadyState> {
  const blobStore = createFeedSearchOpaqueBlobStore(db);
  const foundation = await createSearchStorageFoundation({
    appId: APP_ID,
    keyNamespace: KEY_NAMESPACE,
    aead: createFeedSearchAead(),
    secretStore: createFeedSearchSecretStore(secretStore),
    operationStore: blobStore,
    contentStore: blobStore,
  });
  const persistence = createSearchIntentPersistenceV1(foundation);
  const scopeAuthority = createSearchIntentScopeAuthorityV1({
    appId: APP_ID,
    resolver: {
      async resolve(callerContext) {
        if (!isTrustedCallerContext(callerContext)) {
          throw new Error("untrusted caller context");
        }
        return Object.freeze({
          appId: APP_ID,
          tenantId: TENANT_ID,
          principalRef: PRINCIPAL_REF,
        });
      },
    },
  });
  const intentRuntime = createSearchIntentRuntimeV1({
    searchRuntime: multiplexExactSearchRuntime(searchRuntime, querySearchRuntime),
    routeResolver: createFeedExactRouteResolver(),
    persistence,
    scopeAuthority,
  });
  const client = createIntelligenceIntentClientV1({
    transport: createEmbeddedIntelligenceIntentTransportV1({
      runtime: intentRuntime,
      callerContext: GOALBOARD_TRUSTED_CALLER_CONTEXT,
    }),
  });
  return { client, foundation, intentRuntime };
}

/**
 * Catalog RSS exact routes, pinned YouTube official feeds, pinned custom
 * HTTPS RSS/Atom URLs, and pinned AnySearch web-query exact routes. Fail
 * closed before network unless the matching selector set is present.
 */
export function createFeedExactRouteResolver(): SearchIntentRouteResolverV1 {
  return {
    async resolveExact(input) {
      if (input.input.kind === "query") {
        return resolveExactWebQuery({
          input: input.input,
          sourcePolicy: input.sourcePolicy,
        });
      }
      if (input.input.kind !== "feed") {
        throw routeUnavailable();
      }
      const feedUrl = normalizeCatalogUrl(input.input.url);
      if (isYouTubePublicFeedUrl(feedUrl)) {
        return resolveExactYouTubeChannel({
          feedUrl,
          sourcePolicy: input.sourcePolicy,
        });
      }
      const catalog = listRegisterableFeeds().filter((source) => source.enabled);
      const byUrl = catalog.find(
        (source) => normalizeCatalogUrl(source.feedUrl) === feedUrl,
      );
      if (byUrl) {
        return resolveExactCatalogRss({
          source: byUrl,
          feedUrl,
          sourcePolicy: input.sourcePolicy,
        });
      }
      if (isCustomRssFeedUrl(feedUrl)) {
        return resolveExactCustomRss({
          feedUrl,
          sourcePolicy: input.sourcePolicy,
        });
      }
      throw routeUnavailable();
    },
  };
}

const WEB_QUERY_PROVIDER_ID = "anysearch";
const WEB_QUERY_DEFINITION_ID = "anysearch";

function resolveExactCatalogRss(input: {
  readonly source: FeedSourceCatalogEntry;
  readonly feedUrl: string;
  readonly sourcePolicy: {
    readonly required?: readonly {
      kind: string;
      value?: string;
      namespace?: string;
    }[];
    readonly allowed?: readonly {
      kind: string;
      value?: string;
      namespace?: string;
    }[];
  };
}): Awaited<ReturnType<SearchIntentRouteResolverV1["resolveExact"]>> {
  const domain = domainOf(input.source);
  const required = input.sourcePolicy.required ?? [];
  const allowed = input.sourcePolicy.allowed ?? [];
  const requiredUrl = required.find((selector) => selector.kind === "url");
  if (
    requiredUrl?.kind !== "url"
    || typeof requiredUrl.value !== "string"
    || normalizeCatalogUrl(requiredUrl.value) !== input.feedUrl
  ) {
    throw routeUnavailable();
  }
  const requiredDef = required.find(
    (selector) =>
      selector.kind === "source_definition"
      && selector.namespace === "app"
      && selector.value === input.source.sourceId,
  );
  if (!requiredDef) throw routeUnavailable();

  const allowedDomain = allowed.find(
    (selector) =>
      selector.kind === "domain"
      && (selector.value === domain || domain.endsWith(`.${selector.value}`)),
  );
  if (!allowedDomain) throw routeUnavailable();

  const allowedDef = allowed.find(
    (selector) =>
      selector.kind === "source_definition"
      && selector.namespace === "app"
      && selector.value === input.source.sourceId,
  );
  if (!allowedDef) throw routeUnavailable();

  const matchedSelectors = Object.freeze([
    Object.freeze({ kind: "url" as const, value: input.source.feedUrl }),
    Object.freeze({
      kind: "source_definition" as const,
      namespace: "app" as const,
      value: input.source.sourceId,
    }),
    Object.freeze({ kind: "domain" as const, value: domain }),
  ]);

  return Object.freeze({
    providerId: "rss",
    routeKind: "feed" as const,
    channel: "rss" as const,
    matchedSelectors,
    capabilities: Object.freeze({
      hardDomainFilter: false,
      hardUrlPin: true,
      maxDeadlineMs: ROUTE_MAX_DEADLINE_MS,
      maxMaterials: ROUTE_MAX_MATERIALS,
      sourceDefinition: Object.freeze({
        namespace: "app" as const,
        id: input.source.sourceId,
      }),
    }),
    decisionReason: "required_route" as const,
  });
}

function resolveExactCustomRss(input: {
  readonly feedUrl: string;
  readonly sourcePolicy: {
    readonly required?: readonly {
      kind: string;
      value?: string;
      namespace?: string;
    }[];
    readonly allowed?: readonly {
      kind: string;
      value?: string;
      namespace?: string;
    }[];
  };
}): Awaited<ReturnType<SearchIntentRouteResolverV1["resolveExact"]>> {
  const domain = customRssFeedHost(input.feedUrl);
  const required = input.sourcePolicy.required ?? [];
  const allowed = input.sourcePolicy.allowed ?? [];
  const requiredUrl = required.find((selector) => selector.kind === "url");
  if (
    requiredUrl?.kind !== "url"
    || typeof requiredUrl.value !== "string"
    || normalizeCatalogUrl(requiredUrl.value) !== input.feedUrl
  ) {
    throw routeUnavailable();
  }
  const requiredDef = required.find(
    (selector) =>
      selector.kind === "source_definition" &&
      selector.namespace === "app" &&
      selector.value === CUSTOM_RSS_DEFINITION_ID,
  );
  if (!requiredDef) throw routeUnavailable();

  const allowedDomain = allowed.find(
    (selector) =>
      selector.kind === "domain" &&
      (selector.value === domain || domain.endsWith(`.${selector.value}`)),
  );
  if (!allowedDomain) throw routeUnavailable();

  const allowedDef = allowed.find(
    (selector) =>
      selector.kind === "source_definition" &&
      selector.namespace === "app" &&
      selector.value === CUSTOM_RSS_DEFINITION_ID,
  );
  if (!allowedDef) throw routeUnavailable();

  const matchedSelectors = Object.freeze([
    Object.freeze({ kind: "url" as const, value: input.feedUrl }),
    Object.freeze({
      kind: "source_definition" as const,
      namespace: "app" as const,
      value: CUSTOM_RSS_DEFINITION_ID,
    }),
    Object.freeze({ kind: "domain" as const, value: domain }),
  ]);

  return Object.freeze({
    providerId: "rss",
    routeKind: "feed" as const,
    channel: "rss" as const,
    matchedSelectors,
    capabilities: Object.freeze({
      hardDomainFilter: false,
      hardUrlPin: true,
      maxDeadlineMs: ROUTE_MAX_DEADLINE_MS,
      maxMaterials: ROUTE_MAX_MATERIALS,
      sourceDefinition: Object.freeze({
        namespace: "app" as const,
        id: CUSTOM_RSS_DEFINITION_ID,
      }),
    }),
    decisionReason: "required_route" as const,
  });
}

function resolveExactYouTubeChannel(input: {
  readonly feedUrl: string;
  readonly sourcePolicy: {
    readonly required?: readonly {
      kind: string;
      value?: string;
      namespace?: string;
    }[];
    readonly allowed?: readonly {
      kind: string;
      value?: string;
      namespace?: string;
    }[];
  };
}): Awaited<ReturnType<SearchIntentRouteResolverV1["resolveExact"]>> {
  const required = input.sourcePolicy.required ?? [];
  const allowed = input.sourcePolicy.allowed ?? [];
  const requiredUrl = required.find((selector) => selector.kind === "url");
  if (
    requiredUrl?.kind !== "url"
    || typeof requiredUrl.value !== "string"
    || normalizeCatalogUrl(requiredUrl.value) !== input.feedUrl
  ) {
    throw routeUnavailable();
  }
  const requiredDef = required.find(
    (selector) =>
      selector.kind === "source_definition" &&
      selector.namespace === "app" &&
      selector.value === YOUTUBE_CHANNEL_DEFINITION_ID,
  );
  if (!requiredDef) throw routeUnavailable();

  const allowedDomain = allowed.find(
    (selector) =>
      selector.kind === "domain" &&
      (selector.value === YOUTUBE_PUBLIC_FEED_HOST ||
        YOUTUBE_PUBLIC_FEED_HOST.endsWith(`.${selector.value}`)),
  );
  if (!allowedDomain) throw routeUnavailable();

  const allowedDef = allowed.find(
    (selector) =>
      selector.kind === "source_definition" &&
      selector.namespace === "app" &&
      selector.value === YOUTUBE_CHANNEL_DEFINITION_ID,
  );
  if (!allowedDef) throw routeUnavailable();

  const matchedSelectors = Object.freeze([
    Object.freeze({ kind: "url" as const, value: input.feedUrl }),
    Object.freeze({
      kind: "source_definition" as const,
      namespace: "app" as const,
      value: YOUTUBE_CHANNEL_DEFINITION_ID,
    }),
    Object.freeze({ kind: "domain" as const, value: YOUTUBE_PUBLIC_FEED_HOST }),
  ]);

  return Object.freeze({
    providerId: "rss",
    routeKind: "feed" as const,
    channel: "rss" as const,
    matchedSelectors,
    capabilities: Object.freeze({
      hardDomainFilter: false,
      hardUrlPin: true,
      maxDeadlineMs: ROUTE_MAX_DEADLINE_MS,
      maxMaterials: ROUTE_MAX_MATERIALS,
      sourceDefinition: Object.freeze({
        namespace: "app" as const,
        id: YOUTUBE_CHANNEL_DEFINITION_ID,
      }),
    }),
    decisionReason: "required_route" as const,
  });
}

function resolveExactWebQuery(input: {
  readonly input: { kind: "query"; query: string };
  readonly sourcePolicy: {
    readonly required?: readonly {
      kind: string;
      value?: string;
      namespace?: string;
    }[];
    readonly allowed?: readonly {
      kind: string;
      value?: string;
      namespace?: string;
    }[];
  };
}): Awaited<ReturnType<SearchIntentRouteResolverV1["resolveExact"]>> {
  const query = input.input.query.trim();
  if (query.length < 2) throw routeUnavailable();

  const required = input.sourcePolicy.required ?? [];
  const allowed = input.sourcePolicy.allowed ?? [];
  if (!hasPinnedWebQuerySelector(required) || !hasPinnedWebQuerySelector(allowed)) {
    throw routeUnavailable();
  }

  const matchedSelectors = Object.freeze([
    Object.freeze({ kind: "provider" as const, value: WEB_QUERY_PROVIDER_ID }),
    Object.freeze({ kind: "channel" as const, value: "web" as const }),
    Object.freeze({
      kind: "source_definition" as const,
      namespace: "app" as const,
      value: WEB_QUERY_DEFINITION_ID,
    }),
  ]);

  return Object.freeze({
    providerId: WEB_QUERY_PROVIDER_ID,
    routeKind: "query" as const,
    channel: "web" as const,
    matchedSelectors,
    capabilities: Object.freeze({
      hardDomainFilter: false,
      hardUrlPin: false,
      maxDeadlineMs: ROUTE_MAX_DEADLINE_MS,
      maxMaterials: ROUTE_MAX_MATERIALS,
      sourceDefinition: Object.freeze({
        namespace: "app" as const,
        id: WEB_QUERY_DEFINITION_ID,
      }),
    }),
    decisionReason: "required_route" as const,
  });
}

function hasPinnedWebQuerySelector(
  selectors: readonly { kind: string; value?: string; namespace?: string }[],
): boolean {
  const provider = selectors.some(
    (selector) =>
      selector.kind === "provider" && selector.value === WEB_QUERY_PROVIDER_ID,
  );
  const channel = selectors.some(
    (selector) => selector.kind === "channel" && selector.value === "web",
  );
  const definition = selectors.some(
    (selector) =>
      selector.kind === "source_definition" &&
      selector.namespace === "app" &&
      selector.value === WEB_QUERY_DEFINITION_ID,
  );
  return provider && channel && definition;
}

function multiplexExactSearchRuntime(
  feedRuntime: SearchRuntime,
  queryRuntime?: SearchRuntime,
): SearchRuntime {
  if (!queryRuntime) return feedRuntime;
  if (queryRuntime.app.id !== feedRuntime.app.id) {
    throw new Error("exact SearchRuntime app ids must match");
  }
  return {
    app: feedRuntime.app,
    providers: {
      doctor: (providerId) =>
        providerId === WEB_QUERY_PROVIDER_ID
          ? queryRuntime.providers.doctor(providerId)
          : feedRuntime.providers.doctor(providerId),
    },
    operations: {
      create: (plan, options) =>
        (plan as { providerId?: string }).providerId === WEB_QUERY_PROVIDER_ID
          ? queryRuntime.operations.create(plan, options)
          : feedRuntime.operations.create(plan, options),
    },
    shutdown: async () => {
      // Parent composition owns lifecycle of both runtimes.
    },
  };
}

function domainOf(source: FeedSourceCatalogEntry): string {
  return new URL(source.feedUrl).hostname.toLowerCase();
}

function normalizeCatalogUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.hash
  ) {
    throw routeUnavailable();
  }
  return url.toString();
}

function isTrustedCallerContext(value: unknown): boolean {
  if (value === GOALBOARD_TRUSTED_CALLER_CONTEXT) return true;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.kind === GOALBOARD_TRUSTED_CALLER_CONTEXT.kind
    && record.appId === APP_ID
  );
}

function routeUnavailable(): SearchError {
  return new SearchError({
    code: "provider_unavailable",
    retryable: false,
    sideEffectState: "none",
    recoveryAction: "change_provider",
  });
}

/** Project Client result onto the frozen GoalBoard public field whitelist. */
function toPublicResult(result: SearchIntentExactResultV1): IntelligenceCollectResult {
  return Object.freeze({
    operationId: result.operationId,
    intentFingerprint: result.intentFingerprint,
    outcome: result.outcome,
    requirementMet: result.requirementMet,
    materials: result.materials,
    receipts: result.receipts,
    warnings: result.warnings,
    budget: result.budget,
  });
}

const FORBIDDEN_CALLER_KEYS = ["appId", "tenantId", "principalRef"] as const;

function assertExactRequestHasNoCallerIdentity(
  request: unknown,
): asserts request is IntelligenceCollectRequest {
  if (request === null || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("exact request must be a plain object without caller identity");
  }
  const record = request as Record<string, unknown>;
  for (const key of FORBIDDEN_CALLER_KEYS) {
    if (Object.prototype.hasOwnProperty.call(record, key) || key in record) {
      throw new Error(`exact request must not include ${key}`);
    }
  }
}

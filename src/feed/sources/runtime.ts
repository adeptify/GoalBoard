import type Database from "better-sqlite3";
import {
  createSearchRuntime,
  SearchError,
  type SearchRuntime,
} from "@adeptify/search-evidence-layer";
import {
  createPortBackedNodeSearchHost,
  createNodePinnedSearchHost,
  type PortBackedNodeSearchHost,
  type SearchHostContentPort,
  type SearchHostTransportPort,
  type SearchTransportProfileInput,
} from "@adeptify/search-evidence-layer/host/node";
import { createAnySearchProvider } from "@adeptify/search-evidence-layer/providers/anysearch";
import { createRssProvider } from "@adeptify/search-evidence-layer/providers/rss";

import { createFeedEvidenceContentStore, type FeedEvidenceContentStore } from "../security/evidence-content-store.js";
import { createFileSecretStore, type SecretStore } from "../security/secret-store.js";
import { classifyFeedBody } from "./feed-body.js";
import { createIntelligenceCollectAdapter, type IntelligenceCollectAdapter } from "./intelligence-adapter.js";
import { listFeedUrls } from "./catalog.js";
import { isYouTubePublicFeedUrl } from "./youtube.js";
import { isCustomRssFeedUrl, isDisallowedResolvedAddress } from "./custom-rss.js";
import {
  extractRssDocumentMetadata,
  readRssHttpState,
  type RssFetchReceipt,
} from "./rss-http.js";

const APP_ID = "goalboard";
const APP_VERSION = "0.1.14";
const MAX_FEED_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 2;

type FetchPort = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface FeedSourceRuntime {
  intelligenceCollect: IntelligenceCollectAdapter;
  content: FeedEvidenceContentStore;
  publicFeedReceipt?(): RssFetchReceipt | null;
  shutdown(): Promise<void>;
}

const ANYSEARCH_PROFILE: SearchTransportProfileInput = {
  schema: "search-transport-profile-v1",
  id: "anysearch-mcp-v1",
  providerId: "anysearch",
  protocol: "https",
  origin: "https://api.anysearch.com",
  pathname: "/mcp",
  method: "POST",
  rpcProtocol: "jsonrpc-2.0-tools-call",
  authMode: "optional-bearer",
  redirectPolicy: "reject-all",
  requestByteLimit: 65_536,
  responseByteLimit: 1_048_576,
};

export function createFeedSourceRuntime(options: {
  db: Database.Database;
  fetch?: FetchPort;
  secretStore?: SecretStore;
  content?: FeedEvidenceContentStore;
  sourceCursor?: unknown;
}): FeedSourceRuntime {
  const secretStore = options.secretStore ?? createFileSecretStore();
  const content = options.content ?? createFeedEvidenceContentStore({ secretStore });
  const hostContent = createEncryptedContentPort(content);
  const httpState = readRssHttpState(options.sourceCursor);
  let publicFeedReceipt: RssFetchReceipt | null = null;
  const rssHost = createPortBackedNodeSearchHost({
    appId: APP_ID,
    transport: createAllowlistedRssTransport(
      listFeedUrls(),
      options.fetch ?? globalThis.fetch,
      {
        allowYouTubePublicFeeds: true,
        allowCustomPublicFeeds: true,
        conditional: { etag: httpState.etag, lastModified: httpState.last_modified },
        onReceipt(receipt) { publicFeedReceipt = receipt; },
      },
    ),
    content: hostContent,
  });
  const rssRuntime = createRssRuntime(rssHost);
  const queryHost = createNodePinnedSearchHost({
    appId: APP_ID,
    transportProfiles: [ANYSEARCH_PROFILE],
    content: hostContent,
  });
  const queryRuntime = createAnySearchRuntime(queryHost.host);
  const intelligenceCollect = createIntelligenceCollectAdapter({
    db: options.db,
    secretStore,
    searchRuntime: rssRuntime,
    querySearchRuntime: queryRuntime,
  });
  return {
    intelligenceCollect,
    content,
    publicFeedReceipt() { return publicFeedReceipt; },
    async shutdown() {
      const results = await Promise.allSettled([
        intelligenceCollect.shutdown(),
        rssRuntime.shutdown(),
        queryRuntime.shutdown(),
      ]);
      const failure = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      if (failure) throw failure.reason;
    },
  };
}

function createRssRuntime(hostBundle: PortBackedNodeSearchHost): SearchRuntime {
  return createSearchRuntime({
    app: { id: APP_ID, version: APP_VERSION, dataCompatibilityVersion: 1 },
    host: hostBundle.host,
    providers: [
      {
        revision: 1,
        provider: createRssProvider({ appId: APP_ID }),
        transportProfileId: "goalboard-rss-allowlist-v1",
      },
    ],
  });
}

function createAnySearchRuntime(
  host: Parameters<typeof createSearchRuntime>[0]["host"],
): SearchRuntime {
  return createSearchRuntime({
    app: { id: APP_ID, version: APP_VERSION, dataCompatibilityVersion: 1 },
    host,
    providers: [
      {
        revision: 1,
        provider: createAnySearchProvider(),
        transportProfileId: ANYSEARCH_PROFILE.id,
      },
    ],
  });
}

export function createAllowlistedRssTransport(
  feedUrls: readonly string[],
  fetchPort: FetchPort,
  options: {
    allowYouTubePublicFeeds?: boolean;
    allowCustomPublicFeeds?: boolean;
    lookup?: (hostname: string) => Promise<readonly string[]>;
    conditional?: { etag?: string; lastModified?: string };
    onReceipt?: (receipt: RssFetchReceipt) => void;
  } = {},
): SearchHostTransportPort {
  const allowedUrls = new Set(feedUrls.map(normalizeFeedUrl));
  const lookupHost = options.lookup ?? lookupPublicAddresses;
  return {
    async execute(call) {
      if (
        call.binding.providerId !== "rss" ||
        call.request.providerId !== "rss" ||
        call.request.operation !== "ingest"
      ) {
        throw searchPolicyError();
      }
      const feedUrl = readFeedUrl(call.request.body);
      let current = normalizeFeedUrl(feedUrl);
      const staticFeed = allowedUrls.has(current);
      const youtubePublicFeed = options.allowYouTubePublicFeeds === true && isYouTubePublicFeedUrl(current);
      const customPublicFeed =
        options.allowCustomPublicFeeds === true &&
        !staticFeed &&
        !youtubePublicFeed &&
        isCustomRssFeedUrl(current);
      if (!staticFeed && !youtubePublicFeed && !customPublicFeed) {
        throw searchPolicyError();
      }
      const initialHost = new URL(current).hostname.toLowerCase();
      if (customPublicFeed) await assertResolvedHostIsPublic(initialHost, lookupHost);

      for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
        const headers: Record<string, string> = {
          Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9",
          "User-Agent": `GoalBoard/${APP_VERSION} (+local feed ingest)`,
        };
        if (options.conditional?.etag) headers["If-None-Match"] = options.conditional.etag;
        if (options.conditional?.lastModified) headers["If-Modified-Since"] = options.conditional.lastModified;
        const response = await fetchPort(current, {
          method: "GET",
          redirect: "manual",
          signal: call.signal,
          headers,
        });
        if (isRedirect(response.status)) {
          const location = response.headers.get("location");
          if (!location || redirect === MAX_REDIRECTS) return { status: response.status, body: "" };
          const next = normalizeFeedUrl(new URL(location, current).toString());
          const nextHost = new URL(next).hostname.toLowerCase();
          if (staticFeed && nextHost !== initialHost) throw searchPolicyError();
          if (youtubePublicFeed && !isYouTubePublicFeedUrl(next)) throw searchPolicyError();
          if (customPublicFeed) {
            if (nextHost !== initialHost || !isCustomRssFeedUrl(next)) throw searchPolicyError();
            await assertResolvedHostIsPublic(nextHost, lookupHost);
          }
          current = next;
          continue;
        }
        if (response.status === 304) {
          options.onReceipt?.({
            status: 304,
            not_modified: true,
            final_url: current,
            ...(response.headers.get("etag") ? { etag: response.headers.get("etag")! } : {}),
            ...(response.headers.get("last-modified") ? { last_modified: response.headers.get("last-modified")! } : {}),
          });
          return {
            status: 200,
            body: { body: "<rss version=\"2.0\"><channel><title>Not modified</title><link>https://example.invalid/</link></channel></rss>" },
          };
        }
        if (!response.ok) return { status: response.status, body: "" };
        const bodyText = await readBoundedResponse(response, MAX_FEED_BYTES);
        const classification = classifyFeedBody(bodyText, response.headers.get("content-type"));
        if (classification.class !== "rss_xml") {
          throw new SearchError({
            code: classification.class === "empty" ? "feed_unavailable" : "feed_parse_failed",
            retryable: false,
            sideEffectState: "none",
            recoveryAction: "none",
            safeContext: { providerId: "rss" },
          });
        }
        options.onReceipt?.({
          status: response.status,
          not_modified: false,
          final_url: current,
          ...(response.headers.get("etag") ? { etag: response.headers.get("etag")! } : {}),
          ...(response.headers.get("last-modified") ? { last_modified: response.headers.get("last-modified")! } : {}),
          ...extractRssDocumentMetadata(bodyText, current),
        });
        return { status: response.status, body: { body: bodyText } };
      }
      return { status: 508, body: "" };
    },
  };
}

function createEncryptedContentPort(store: FeedEvidenceContentStore): SearchHostContentPort {
  return {
    async write({ appId, markdown }) {
      if (appId !== APP_ID || typeof markdown !== "string") {
        throw new Error("feed evidence content rejected");
      }
      return store.write(markdown);
    },
    async read({ appId, contentRef }) {
      if (appId !== APP_ID || !/^goalboard-feed\/sha256\/[0-9a-f]{64}$/u.test(contentRef)) {
        throw new Error("feed evidence content reference rejected");
      }
      return store.read(contentRef);
    },
  };
}

function readFeedUrl(body: unknown): string {
  if (body === null || typeof body !== "object" || Array.isArray(body)) throw searchPolicyError();
  const feedUrl = (body as { feedUrl?: unknown }).feedUrl;
  if (typeof feedUrl !== "string") throw searchPolicyError();
  return feedUrl;
}

function normalizeFeedUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw searchPolicyError();
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw searchPolicyError();
  }
  url.hash = "";
  return url.toString();
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

async function lookupPublicAddresses(hostname: string): Promise<readonly string[]> {
  const dns = await import("node:dns/promises");
  return (await dns.lookup(hostname, { all: true, verbatim: true })).map((record) => record.address);
}

async function assertResolvedHostIsPublic(
  hostname: string,
  lookup: (hostname: string) => Promise<readonly string[]>,
): Promise<void> {
  let addresses: readonly string[];
  try {
    addresses = await lookup(hostname);
  } catch {
    throw feedUnavailableError();
  }
  if (addresses.length === 0 || addresses.some(isDisallowedResolvedAddress)) {
    throw searchPolicyError();
  }
}

async function readBoundedResponse(response: Response, limit: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new Error("feed response exceeds local ingest limit");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new Error("feed response exceeds local ingest limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}

function searchPolicyError(): SearchError {
  return new SearchError({
    code: "provider_protocol_invalid",
    retryable: false,
    sideEffectState: "none",
    recoveryAction: "none",
  });
}

function feedUnavailableError(): SearchError {
  return new SearchError({
    code: "feed_unavailable",
    retryable: false,
    sideEffectState: "none",
    recoveryAction: "none",
    safeContext: { providerId: "rss" },
  });
}

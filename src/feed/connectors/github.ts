/**
 * GitHub Connector — live mode by default.
 * Fixture mode is available only in an explicit test/fixture process.
 * Tokens never written to Item rows.
 * Live failures are closed typed results (no silent fixture fallback).
 */
import type {
  ConnectorHealth,
  ConnectorIngestItem,
  ConnectorPort,
  ConnectorSyncFailure,
  ConnectorSyncResult,
  ConnectorSyncSuccess,
} from "./types.js";
import { resolveGithubToken } from "./credentials.js";
import { connectorFixtureAllowed } from "../execution-mode.js";

const FIXTURE_ISSUES: ConnectorIngestItem[] = [
  {
    externalId: "gh-issue-1001",
    title: "Bug: null pointer in auth middleware",
    summary: "Production 500s when Authorization header is missing",
    body: "## Report\nStack trace in api-gateway logs after deploy.",
    url: "https://github.com/example/relay/issues/1001",
    kind: "issue",
    priority: "high",
    tags: ["github", "bug"],
    author: "octocat",
  },
  {
    externalId: "gh-pr-88",
    title: "PR #88: harden rate limiter",
    summary: "Add token bucket + tests for concurrent requests",
    url: "https://github.com/example/relay/pull/88",
    kind: "pr",
    priority: "medium",
    tags: ["github", "pr"],
    author: "dev-alice",
  },
  {
    externalId: "gh-mention-12",
    title: "@you mentioned in discussion #12",
    summary: "Design review for connector architecture",
    url: "https://github.com/example/relay/discussions/12",
    kind: "mention",
    priority: "low",
    tags: ["github", "mention"],
    author: "team-lead",
  },
];

export type GithubFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

function fixtureSuccess(items: ConnectorIngestItem[]): ConnectorSyncSuccess {
  return {
    ok: true,
    mode: "fixture",
    items: items.slice(0),
    cursor: {
      index: items.length,
      mode: "fixture",
      syncedAt: new Date().toISOString(),
    },
  };
}

function liveFailure(
  failure: ConnectorSyncFailure["failure"],
  message: string,
  opts?: { action?: string; httpStatus?: number },
): ConnectorSyncFailure {
  return {
    ok: false,
    mode: "live",
    failure,
    message,
    action: opts?.action,
    httpStatus: opts?.httpStatus,
  };
}

export function createGithubConnector(opts?: {
  fixture?: ConnectorIngestItem[];
  token?: string;
  /** Explicitly allow deterministic fixture responses (tests only). */
  allowFixture?: boolean;
  /** Injectable for tests — defaults to global fetch */
  fetchImpl?: GithubFetch;
}): ConnectorPort {
  const fixture = opts?.fixture ?? FIXTURE_ISSUES;
  const allowFixture = opts?.allowFixture ?? connectorFixtureAllowed();
  const resolveToken = () =>
    opts?.token ?? resolveGithubToken() ?? undefined;
  const fetchImpl = opts?.fetchImpl ?? globalThis.fetch?.bind(globalThis);

  return {
    type: "github",
    async health(): Promise<ConnectorHealth> {
      const token = resolveToken();
      if (!token) {
        if (!allowFixture) {
          return {
            ok: false,
            status: "disconnected",
            message: "GitHub 未绑定凭据",
            action: "在设置中绑定 GitHub Token 或完成 Device Flow",
          };
        }
        return {
          ok: true,
          status: "mock",
          message:
            "Fixture mode — bind token in Settings or set GOALBOARD_GITHUB_TOKEN",
          action: "Settings → Connectors · PAT / Device Flow",
        };
      }
      if (!fetchImpl) {
        return {
          ok: true,
          status: "connected",
          message: "Token present but fetch unavailable",
        };
      }
      try {
        const res = await fetchImpl("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "goalboard-feed-connector",
          },
        });
        if (res.status === 401 || res.status === 403) {
          return {
            ok: false,
            status: "error",
            message: `GitHub auth failed HTTP ${res.status}`,
            action: "Rotate GOALBOARD_GITHUB_TOKEN",
          };
        }
        if (!res.ok) {
          return {
            ok: false,
            status: "error",
            message: `GitHub health HTTP ${res.status}`,
          };
        }
        let user: { login?: string };
        try {
          user = (await res.json()) as { login?: string };
        } catch {
          return {
            ok: false,
            status: "error",
            message: "GitHub health returned malformed response",
          };
        }
        return {
          ok: true,
          status: "connected",
          message: `GitHub live as @${user.login || "user"}`,
        };
      } catch {
        return {
          ok: false,
          status: "error",
          message: "GitHub health network error",
        };
      }
    },
    async sync({ cursor }): Promise<ConnectorSyncResult> {
      void cursor;
      const token = resolveToken();
      if (!token) {
        if (!allowFixture) {
          return liveFailure(
            "needs_auth",
            "GitHub 未绑定凭据",
            { action: "在设置中绑定 GitHub Token 或完成 Device Flow" },
          );
        }
        return fixtureSuccess(fixture);
      }
      if (!fetchImpl) {
        return liveFailure("provider", "GitHub fetch unavailable", {
          action: "Rotate GOALBOARD_GITHUB_TOKEN",
        });
      }
      try {
        const items = await liveSyncIssues(fetchImpl, token);
        return {
          ok: true,
          mode: "live",
          items,
          cursor: {
            mode: "live",
            since: new Date().toISOString(),
            count: items.length,
          },
        };
      } catch (e) {
        return classifyGithubLiveError(e);
      }
    },
  };
}

function classifyGithubLiveError(e: unknown): ConnectorSyncFailure {
  if (e && typeof e === "object" && "kind" in e) {
    const err = e as {
      kind: "needs_auth" | "provider" | "network";
      status?: number;
    };
    if (err.kind === "needs_auth") {
      return liveFailure(
        "needs_auth",
        `GitHub reauth required HTTP ${err.status ?? 401}`,
        {
          action: "Rotate GOALBOARD_GITHUB_TOKEN",
          httpStatus: err.status,
        },
      );
    }
    if (err.kind === "provider") {
      return liveFailure(
        "provider",
        `GitHub issues HTTP ${err.status ?? 0}`.replace(/ HTTP 0$/, " error"),
        { httpStatus: err.status, action: "Retry sync later" },
      );
    }
    return liveFailure("network", "GitHub issues network error", {
      action: "Retry sync when the network is available",
    });
  }
  return liveFailure("network", "GitHub issues network error", {
    action: "Retry sync when the network is available",
  });
}

class GithubLiveError extends Error {
  constructor(
    readonly kind: "needs_auth" | "provider" | "network",
    readonly status?: number,
  ) {
    super(kind);
    this.name = "GithubLiveError";
  }
}

async function liveSyncIssues(
  fetchImpl: GithubFetch,
  token: string,
): Promise<ConnectorIngestItem[]> {
  let res: Response;
  try {
    res = await fetchImpl(
      "https://api.github.com/issues?filter=all&state=open&per_page=20",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "goalboard-feed-connector",
        },
      },
    );
  } catch {
    throw new GithubLiveError("network");
  }
  if (res.status === 401 || res.status === 403) {
    throw new GithubLiveError("needs_auth", res.status);
  }
  if (!res.ok) {
    throw new GithubLiveError("provider", res.status);
  }
  let raw: Array<{
    id: number;
    number: number;
    title: string;
    body?: string | null;
    html_url?: string;
    pull_request?: unknown;
    user?: { login?: string };
  }>;
  try {
    raw = (await res.json()) as typeof raw;
  } catch {
    throw new GithubLiveError("provider");
  }
  if (!Array.isArray(raw)) {
    throw new GithubLiveError("provider");
  }
  return raw.map((issue) => {
    const isPr = Boolean(issue.pull_request);
    return {
      externalId: isPr ? `gh-pr-${issue.number}` : `gh-issue-${issue.number}`,
      title: isPr ? `PR #${issue.number}: ${issue.title}` : issue.title,
      summary: (issue.body || "").slice(0, 200) || issue.title,
      body: issue.body || undefined,
      url: issue.html_url,
      kind: isPr ? ("pr" as const) : ("issue" as const),
      priority: "medium" as const,
      tags: ["github", isPr ? "pr" : "issue"],
      author: issue.user?.login,
    };
  });
}

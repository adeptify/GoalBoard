/**
 * Gmail OAuth 2.0 Authorization Code + PKCE — in-app browser wizard path.
 * Tokens land only in SecretStore via bindConnectorToken; never on Item rows.
 *
 * Flow:
 *  1. startGmailOAuthFlow → authorizationUrl (+ pending PKCE session in SecretStore)
 *  2. User authorizes in browser; Google redirects to loopback callback or user pastes code
 *  3. completeGmailOAuthFlow → validate exact pending session, exchange code, bind tokens
 *  4. resolveUsableGmailAccessToken → reuse fresh access or refresh once near expiry
 *
 * Config: GOALBOARD_GMAIL_CLIENT_ID / GOALBOARD_GMAIL_CLIENT_SECRET or Sources-bound client.
 * @see https://developers.google.com/identity/protocols/oauth2/native-app
 */
import { createHash, randomBytes } from "node:crypto";
import {
  GMAIL_AUTH_REF,
  bindConnectorToken,
  resolveGmailToken,
} from "./credentials.js";
import { createFileSecretStore, peekSealedEntry } from "../security/secret-store.js";

export const GMAIL_CLIENT_ID_REF = "connector:gmail:client_id";
export const GMAIL_CLIENT_SECRET_REF = "connector:gmail:client_secret";
export const GMAIL_REFRESH_REF = "connector:gmail:refresh";
/** Private ISO expiry for the bound access token — not a credential value. */
export const GMAIL_TOKEN_EXPIRES_AT_REF = "connector:gmail:token_expires_at";
export const GMAIL_OAUTH_PENDING_REF = "connector:gmail:oauth:pending";

/** Pending PKCE sessions expire after this many milliseconds (10 minutes). */
export const GMAIL_OAUTH_PENDING_TTL_MS = 10 * 60 * 1000;

/** Refresh this many ms before access-token expiry to avoid edge races. */
export const GMAIL_ACCESS_TOKEN_SKEW_MS = 60 * 1000;

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Exact OAuth callback path (loopback host + port are separate). */
export const GMAIL_OAUTH_CALLBACK_PATH =
  "/api/feed/connectors/gmail/oauth/callback";

/**
 * Scopes requested by the shipped browser OAuth start.
 * Keep docs/PROJECT.md / .env.example / contract tests aligned with this list.
 */
export const GMAIL_OAUTH_DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "openid",
  "email",
] as const;

const DEFAULT_SCOPES = GMAIL_OAUTH_DEFAULT_SCOPES.join(" ");

const RESTART_HINT =
  "Restart Gmail authorization from GoalBoard Sources and complete the fresh callback.";

const REAUTH_ACTION =
  "Settings → Connectors · Restart Gmail authorization";

export type OAuthFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface GmailOAuthStart {
  authorizationUrl: string;
  state: string;
  redirectUri: string;
  /** True when client secret is configured (confidential client). */
  confidential: boolean;
}

export interface GmailOAuthComplete {
  authRef: string;
  hasRefreshToken: boolean;
  email?: string;
}

/**
 * Result of the single Gmail usable-token resolver.
 * Secrets stay private — only the adapter may read `accessToken` for an immediate request.
 */
export type GmailUsableTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; status: "none" }
  | {
      ok: false;
      status: "needs_auth";
      message: string;
      action: string;
    };

/** Minimum private facts for access-token reuse / refresh (never on Item/UI). */
interface GmailTokenLifecycle {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch ms when access token expires; null = unknown (reuse until API rejects). */
  expiresAtMs: number | null;
}

/**
 * Validated inputs for the Google token exchange — produced only after
 * exact pending-session checks pass (before any network or secret mutation).
 */
export interface GmailOAuthExchangeInput {
  code: string;
  state: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
}

interface PendingSession {
  codeVerifier: string;
  state: string;
  redirectUri: string;
  clientId: string;
  createdAt: string;
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateCodeVerifier(): string {
  return b64url(randomBytes(32));
}

function codeChallengeS256(verifier: string): string {
  return b64url(createHash("sha256").update(verifier).digest());
}

function generateState(): string {
  return b64url(randomBytes(16));
}

export function defaultGmailRedirectUri(port?: string | number): string {
  const p = port ?? process.env.PORT ?? process.env.GOALBOARD_WEB_PORT ?? "3000";
  const host = process.env.GOALBOARD_WEB_HOST || "127.0.0.1";
  return `http://${host}:${p}${GMAIL_OAUTH_CALLBACK_PATH}`;
}

/**
 * Relay Gmail OAuth must complete on a local loopback HTTP origin only.
 * Rejects https, non-loopback hosts, and non-callback paths.
 * Kept strict for the legacy single-account local path.
 */
export function assertLoopbackGmailRedirectUri(redirectUri: string): void {
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    throw new Error(
      `Gmail OAuth redirect URI is not a valid URL — ${RESTART_HINT}`,
    );
  }
  if (url.protocol !== "http:") {
    throw new Error(
      `Gmail OAuth redirect must use http:// on loopback (got ${url.protocol}) — ${RESTART_HINT}`,
    );
  }
  const host = url.hostname.toLowerCase();
  // URL.hostname strips brackets: http://[::1] → "::1"
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error(
      `Gmail OAuth redirect must target loopback (127.0.0.1 / localhost), not ${host} — ${RESTART_HINT}`,
    );
  }
  // A catalog-backed GoalBoard URL is project-scoped. Accept exactly the
  // callback itself or one encoded project segment followed by the callback;
  // reject every other prefix/suffix.
  if (!isGoalBoardGmailCallbackPath(url.pathname)) {
    throw new Error(
      `Gmail OAuth redirect path must target the GoalBoard project callback — ${RESTART_HINT}`,
    );
  }
}

/**
 * Public HTTPS callback for server deployments (CONN-002): when
 * GOALBOARD_PUBLIC_BASE_URL is configured, members authorize from their own
 * browsers and Google redirects back to the shared instance's domain.
 */
export function publicGmailCallbackUri(): string | null {
  const base = process.env.GOALBOARD_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  if (!base) return null;
  return `${base}${GMAIL_OAUTH_CALLBACK_PATH}`;
}

/**
 * Deployment-aware redirect gate: loopback (local single-account path) OR the
 * exact configured public HTTPS callback (shared-instance path). Anything else
 * is rejected before any pending session or token exists.
 */
export function assertAllowedGmailRedirectUri(redirectUri: string): void {
  const pub = publicGmailCallbackUri();
  if (pub) {
    try {
      const expected = new URL(pub);
      const candidate = new URL(redirectUri);
      if (
        candidate.protocol === "https:"
        && candidate.origin === expected.origin
        && isGoalBoardGmailCallbackPath(candidate.pathname)
      ) return;
    } catch {
      /* falls through to loopback check for a precise error */
    }
  }
  assertLoopbackGmailRedirectUri(redirectUri);
}

function isGoalBoardGmailCallbackPath(pathname: string): boolean {
  return pathname === GMAIL_OAUTH_CALLBACK_PATH
    || /^\/projects\/[^/]+\/api\/feed\/connectors\/gmail\/oauth\/callback$/u.test(pathname);
}

export function resolveGmailClientId(override?: string): string | null {  if (override?.trim()) return override.trim();
  try {
    const s = peekSealedEntry(GMAIL_CLIENT_ID_REF)
      ? createFileSecretStore().get(GMAIL_CLIENT_ID_REF)
      : null;
    if (s?.trim()) return s.trim();
  } catch {
    /* ignore */
  }
  return process.env.GOALBOARD_GMAIL_CLIENT_ID?.trim() || null;
}

export function resolveGmailClientSecret(override?: string): string | null {
  if (override?.trim()) return override.trim();
  try {
    const s = peekSealedEntry(GMAIL_CLIENT_SECRET_REF)
      ? createFileSecretStore().get(GMAIL_CLIENT_SECRET_REF)
      : null;
    if (s?.trim()) return s.trim();
  } catch {
    /* ignore */
  }
  return process.env.GOALBOARD_GMAIL_CLIENT_SECRET?.trim() || null;
}

export function storeGmailOAuthClient(opts: {
  clientId: string;
  clientSecret?: string;
}): void {
  const store = createFileSecretStore();
  store.put(GMAIL_CLIENT_ID_REF, opts.clientId.trim());
  if (opts.clientSecret?.trim()) {
    store.put(GMAIL_CLIENT_SECRET_REF, opts.clientSecret.trim());
  }
}

export function gmailOAuthConfigured(): boolean {
  return Boolean(resolveGmailClientId());
}

function savePending(session: PendingSession): void {
  const store = createFileSecretStore();
  // Multi-flow: each authorization attempt gets its own ref keyed by state so
  // several members can start logins concurrently without clobbering.
  store.put(pendingRefFor(session.state), JSON.stringify(session));
  // Compatibility slot keeps pre-multi-flow observers (paste UX retry,
  // doctor output) working; it always mirrors the most recent attempt.
  store.put(GMAIL_OAUTH_PENDING_REF, JSON.stringify(session));
  const alive = prunePendingIndex(store).filter(
    (e) => e.state !== session.state,
  );
  alive.push({ state: session.state, createdAt: session.createdAt });
  store.put(GMAIL_OAUTH_PENDING_INDEX_REF, JSON.stringify(alive));
}

const GMAIL_OAUTH_PENDING_INDEX_REF = "connector:gmail:oauth:pending:index";

interface PendingIndexEntry {
  state: string;
  createdAt: string;
}

function pendingRefFor(state: string): string {
  return `${GMAIL_OAUTH_PENDING_REF}:${state}`;
}

/** Drops expired entries (and their refs) from the bounded pending index. */
function prunePendingIndex(
  store: ReturnType<typeof createFileSecretStore>,
): PendingIndexEntry[] {
  let entries: PendingIndexEntry[] = [];
  try {
    const raw = store.get(GMAIL_OAUTH_PENDING_INDEX_REF);
    entries = raw ? (JSON.parse(raw) as PendingIndexEntry[]) : [];
  } catch {
    entries = [];
  }
  if (!Array.isArray(entries)) entries = [];
  const nowMs = Date.now();
  const alive = entries.filter((e) => {
    if (!e || typeof e.state !== "string" || typeof e.createdAt !== "string") {
      return false;
    }
    const createdMs = Date.parse(e.createdAt);
    return (
      Number.isFinite(createdMs) && nowMs - createdMs <= GMAIL_OAUTH_PENDING_TTL_MS
    );
  });
  for (const gone of entries) {
    if (gone && !alive.includes(gone)) {
      try {
        store.delete(pendingRefFor(gone.state));
      } catch {
        /* ignore */
      }
    }
  }
  if (alive.length !== entries.length) {
    store.put(GMAIL_OAUTH_PENDING_INDEX_REF, JSON.stringify(alive));
  }
  return alive;
}

function parsePending(raw: string): PendingSession | null {
  try {
    const parsed = JSON.parse(raw) as PendingSession;
    if (
      !parsed?.codeVerifier ||
      !parsed?.state ||
      !parsed?.redirectUri ||
      !parsed?.clientId ||
      !parsed?.createdAt
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function loadPendingByState(state: string): PendingSession | null {
  if (!state) return null;
  try {
    const raw = createFileSecretStore().get(pendingRefFor(state));
    return raw ? parsePending(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Legacy single-slot fallback for sessions started before multi-flow storage —
 * kept read-only here; new writes always go to state-keyed refs.
 */
function loadLegacyPending(): PendingSession | null {
  try {
    const raw = createFileSecretStore().get(GMAIL_OAUTH_PENDING_REF);
    return raw ? parsePending(raw) : null;
  } catch {
    return null;
  }
}

function clearPending(): void {
  try {
    createFileSecretStore().delete(GMAIL_OAUTH_PENDING_REF);
  } catch {
    /* ignore */
  }
}

function clearPendingByState(state: string): void {
  if (!state) return;
  try {
    const store = createFileSecretStore();
    store.delete(pendingRefFor(state));
    const alive = prunePendingIndex(store).filter((e) => e.state !== state);
    store.put(GMAIL_OAUTH_PENDING_INDEX_REF, JSON.stringify(alive));
  } catch {
    /* ignore */
  }
}

function loadRefreshToken(refs?: GmailTokenRefs): string | null {
  try {
    const t = createFileSecretStore().get(refs?.refresh ?? GMAIL_REFRESH_REF);
    return t?.trim() || null;
  } catch {
    return null;
  }
}

function loadExpiresAtMs(): number | null {
  try {
    const raw = createFileSecretStore().get(GMAIL_TOKEN_EXPIRES_AT_REF);
    if (!raw?.trim()) return null;
    const ms = Date.parse(raw.trim());
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

function needsAuthResult(message: string): GmailUsableTokenResult {
  return {
    ok: false,
    status: "needs_auth",
    message,
    action: REAUTH_ACTION,
  };
}

/**
 * Per-installation credential scope (CONN-002c). When provided, every token
 * read/write targets exactly these refs — no env fallback, so one member's
 * sync can never silently use another account's credentials.
 */
export interface GmailTokenRefs {
  access: string;
  refresh: string;
  expiresAt: string;
}

/**
 * Persist rotated private access facts after exchange or refresh.
 * Refresh token is updated only when Google returns a new one.
 * Scoped refs isolate writes to one installation; the default path keeps the
 * legacy single-account behaviour.
 */
function persistGmailAccessLifecycle(opts: {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  nowMs?: number;
  refs?: GmailTokenRefs;
  /** Keep the legacy fixed refs mirrored for pre-multi-account readers. */
  mirrorLegacy?: boolean;
}): void {
  const store = createFileSecretStore();
  if (opts.refs) {
    store.put(opts.refs.access, opts.accessToken);
    if (opts.mirrorLegacy) {
      store.put(GMAIL_AUTH_REF, opts.accessToken);
    }
  } else {
    bindConnectorToken("gmail", opts.accessToken);
  }
  if (opts.refreshToken?.trim()) {
    if (opts.mirrorLegacy) {
      store.put(GMAIL_REFRESH_REF, opts.refreshToken.trim());
    }
    store.put(
      opts.refs?.refresh ?? GMAIL_REFRESH_REF,
      opts.refreshToken.trim(),
    );
  }
  const expiresIn =
    typeof opts.expiresIn === "number" &&
    Number.isFinite(opts.expiresIn) &&
    opts.expiresIn > 0
      ? opts.expiresIn
      : 3600;
  const nowMs = opts.nowMs ?? Date.now();
  store.put(
    opts.refs?.expiresAt ?? GMAIL_TOKEN_EXPIRES_AT_REF,
    new Date(nowMs + expiresIn * 1000).toISOString(),
  );
}

function loadGmailTokenLifecycle(refs?: GmailTokenRefs): GmailTokenLifecycle | null {
  if (refs) {
    // Scoped resolution is store-only by design: never borrow another
    // account's tokens via env or shared refs.
    try {
      const store = createFileSecretStore();
      const accessToken = store.get(refs.access)?.trim() || null;
      if (!accessToken) return null;
      const refreshRaw = store.get(refs.refresh)?.trim() || null;
      let expiresAtMs: number | null = null;
      const rawExpiry = store.get(refs.expiresAt)?.trim();
      if (rawExpiry) {
        const parsed = Date.parse(rawExpiry);
        expiresAtMs = Number.isFinite(parsed) ? parsed : null;
      }
      return { accessToken, refreshToken: refreshRaw, expiresAtMs };
    } catch {
      return null;
    }
  }
  const accessToken = resolveGmailToken();
  if (!accessToken) return null;
  return {
    accessToken,
    refreshToken: loadRefreshToken(),
    expiresAtMs: loadExpiresAtMs(),
  };
}

/**
 * Single adapter-owned usable-token resolver for Gmail health and sync.
 * Reuses a still-fresh access token, or refreshes exactly once when near/past expiry.
 * Never returns secrets in failure payloads.
 */
export async function resolveUsableGmailAccessToken(opts?: {
  fetchImpl?: OAuthFetch;
  /** Deterministic clock for tests (epoch ms). */
  nowMs?: number;
  /** Per-installation credential scope (CONN-002c). */
  tokenRefs?: GmailTokenRefs;
}): Promise<GmailUsableTokenResult> {
  const lifecycle = loadGmailTokenLifecycle(opts?.tokenRefs);
  if (!lifecycle) {
    return { ok: false, status: "none" };
  }

  const nowMs = opts?.nowMs ?? Date.now();
  const expiresAtMs = lifecycle.expiresAtMs;
  // Unknown expiry (env paste / legacy bind): reuse until Gmail HTTP rejects.
  const stillFresh =
    expiresAtMs == null || nowMs < expiresAtMs - GMAIL_ACCESS_TOKEN_SKEW_MS;
  if (stillFresh) {
    return { ok: true, accessToken: lifecycle.accessToken };
  }

  const refreshToken = lifecycle.refreshToken;
  const clientId = resolveGmailClientId();
  if (!refreshToken || !clientId) {
    return needsAuthResult(
      `Gmail access expired and cannot be refreshed — ${RESTART_HINT}`,
    );
  }

  const fetchImpl = opts?.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) {
    return needsAuthResult(
      `Gmail access expired and fetch is unavailable for refresh — ${RESTART_HINT}`,
    );
  }

  const clientSecret = resolveGmailClientSecret();
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  if (clientSecret) {
    body.set("client_secret", clientSecret);
  }

  let res: Response;
  try {
    res = await fetchImpl(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });
  } catch {
    return needsAuthResult(
      `Gmail token refresh failed (network) — ${RESTART_HINT}`,
    );
  }

  let json: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    return needsAuthResult(
      `Gmail token refresh returned a malformed response — ${RESTART_HINT}`,
    );
  }

  if (!res.ok || !json.access_token?.trim()) {
    // Never echo Google error bodies that might carry token fragments.
    return needsAuthResult(
      `Gmail token refresh rejected — ${RESTART_HINT}`,
    );
  }

  persistGmailAccessLifecycle({
    accessToken: json.access_token.trim(),
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
    nowMs,
    refs: opts?.tokenRefs,
  });

  return { ok: true, accessToken: json.access_token.trim() };
}

/**
 * Canonical pending-session validator used by every completion path.
 * Rejects missing/mismatched state, expired sessions, identity drift, and
 * non-loopback redirects before any token exchange or secret mutation.
 */
export function validatePendingGmailOAuthSession(opts: {
  code: string;
  state?: string;
  /** Deterministic clock for tests (epoch ms). */
  nowMs?: number;
  /**
   * Optional client id override for identity check only.
   * Exchange always uses the pending session's client id.
   */
  clientId?: string;
}): GmailOAuthExchangeInput {
  const code = opts.code.trim();
  if (!code) {
    throw new Error("authorization code required");
  }

  const state = opts.state?.trim();
  if (!state) {
    throw new Error(
      `OAuth state required — paste the full callback URL or ${RESTART_HINT}`,
    );
  }

  // Multi-flow lookup first; the legacy slot then distinguishes a real
  // mismatch (a live session exists, state doesn't fit it) from no session.
  let pending = loadPendingByState(state);
  if (!pending) {
    const legacy = loadLegacyPending();
    if (legacy && legacy.state === state) {
      pending = legacy;
    } else if (legacy) {
      throw new Error(`OAuth state mismatch — ${RESTART_HINT}`);
    }
  }
  if (!pending) {
    throw new Error(
      `No pending Gmail OAuth session — ${RESTART_HINT}`,
    );
  }

  const nowMs = opts.nowMs ?? Date.now();
  const createdMs = Date.parse(pending.createdAt);
  if (!Number.isFinite(createdMs) || nowMs - createdMs > GMAIL_OAUTH_PENDING_TTL_MS) {
    clearPendingByState(state);
    clearPending();
    throw new Error(
      `Gmail OAuth session expired — ${RESTART_HINT}`,
    );
  }
  if (nowMs < createdMs) {
    clearPendingByState(state);
    clearPending();
    throw new Error(
      `Gmail OAuth session clock invalid — ${RESTART_HINT}`,
    );
  }

  if (state !== pending.state) {
    throw new Error(
      `OAuth state mismatch — ${RESTART_HINT}`,
    );
  }

  assertAllowedGmailRedirectUri(pending.redirectUri);

  // Bind identity to the session that started; reject store/env drift.
  const currentClientId =
    resolveGmailClientId(opts.clientId) || pending.clientId;
  if (currentClientId !== pending.clientId) {
    clearPendingByState(state);
    clearPending();
    throw new Error(
      `Gmail OAuth client identity changed since start — ${RESTART_HINT}`,
    );
  }

  return {
    code,
    state: pending.state,
    codeVerifier: pending.codeVerifier,
    redirectUri: pending.redirectUri,
    clientId: pending.clientId,
  };
}

export async function startGmailOAuthFlow(opts?: {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  scope?: string;
  /** Deterministic creation time for tests (ISO string). */
  createdAt?: string;
}): Promise<GmailOAuthStart> {
  const clientId = resolveGmailClientId(opts?.clientId);
  if (!clientId) {
    throw new Error(
      "GOALBOARD_GMAIL_CLIENT_ID required for Gmail OAuth (or bind client id in Sources)",
    );
  }
  if (opts?.clientId?.trim()) {
    storeGmailOAuthClient({
      clientId: opts.clientId.trim(),
      clientSecret: opts.clientSecret,
    });
  } else if (opts?.clientSecret?.trim()) {
    createFileSecretStore().put(
      GMAIL_CLIENT_SECRET_REF,
      opts.clientSecret.trim(),
    );
  }

  const redirectUri =
    opts?.redirectUri?.trim() ||
    publicGmailCallbackUri() ||
    defaultGmailRedirectUri();
  assertAllowedGmailRedirectUri(redirectUri);

  const codeVerifier = generateCodeVerifier();
  const challenge = codeChallengeS256(codeVerifier);
  const state = generateState();
  const secret = resolveGmailClientSecret();

  savePending({
    codeVerifier,
    state,
    redirectUri,
    clientId,
    createdAt: opts?.createdAt ?? new Date().toISOString(),
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: opts?.scope || DEFAULT_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  });

  return {
    authorizationUrl: `${AUTH_ENDPOINT}?${params.toString()}`,
    state,
    redirectUri,
    confidential: Boolean(secret),
  };
}

/**
 * Exchange authorization code for tokens and bind access token to SecretStore.
 * Requires one fresh pending PKCE session with exact callback state.
 * Validation runs before any network call or credential write.
 */
export async function completeGmailOAuthFlow(opts: {
  code: string;
  state?: string;
  clientSecret?: string;
  /** Deterministic clock for tests (epoch ms). */
  nowMs?: number;
  /** Optional client id for identity-drift checks only. */
  clientId?: string;
  fetchImpl?: OAuthFetch;
  /**
   * CONN-002 concurrency fix: resolved from the verified email BEFORE any
   * credential write, so each account's tokens land in its own refs in one
   * synchronous pass. Concurrent completions can never copy another
   * account's material out of the shared legacy slot.
   */
  resolveRefs?: (email: string | undefined) => GmailTokenRefs | undefined;
}): Promise<GmailOAuthComplete> {
  // Canonical gate: exact state, TTL, loopback redirect, session-bound identity.
  const exchange = validatePendingGmailOAuthSession({
    code: opts.code,
    state: opts.state,
    nowMs: opts.nowMs,
    clientId: opts.clientId,
  });

  const clientSecret = resolveGmailClientSecret(opts.clientSecret);
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) throw new Error("fetch unavailable");

  const body = new URLSearchParams({
    code: exchange.code,
    client_id: exchange.clientId,
    redirect_uri: exchange.redirectUri,
    grant_type: "authorization_code",
    code_verifier: exchange.codeVerifier,
  });
  if (clientSecret) {
    body.set("client_secret", clientSecret);
  }

  const res = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description ||
        json.error ||
        `Gmail token exchange HTTP ${res.status}`,
    );
  }

  // Identity first (uses the in-memory access token), then ONE synchronous
  // persist — never an await between identity resolution and credential write.
  let email: string | undefined;
  try {
    const profileRes = await fetchImpl(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      { headers: { Authorization: `Bearer ${json.access_token}` } },
    );
    if (profileRes.ok) {
      const profile = (await profileRes.json()) as { emailAddress?: string };
      email = profile.emailAddress;
    }
  } catch {
    /* optional */
  }

  const scopedRefs = opts.resolveRefs?.(email);
  persistGmailAccessLifecycle({
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
    nowMs: opts.nowMs,
    refs: scopedRefs,
    mirrorLegacy: true,
  });
  const authRef = scopedRefs?.access ?? GMAIL_AUTH_REF;
  const hasRefreshToken = Boolean(
    json.refresh_token || loadRefreshToken(scopedRefs),
  );
  clearPendingByState(opts.state?.trim() || "");
  // Legacy slot is transitional; always sweep it so stale sessions cannot linger.
  clearPending();

  return { authRef, hasRefreshToken, email };
}

/**
 * Parse a redirect URL or raw code from the user pasting the browser bar.
 * Accepts full `http://127.0.0.1:3000/...?code=...&state=...` or bare code.
 * Bare code alone cannot satisfy exact-state completion — prefer full URL.
 */
export function parseGmailOAuthCallbackInput(input: string): {
  code: string;
  state?: string;
} {
  const raw = input.trim();
  if (!raw) throw new Error("empty OAuth callback input");
  if (raw.includes("code=") || raw.startsWith("http")) {
    try {
      const url = new URL(raw);
      const code = url.searchParams.get("code");
      if (!code) throw new Error("redirect URL missing code");
      const state = url.searchParams.get("state") || undefined;
      return { code, state };
    } catch (e) {
      if (e instanceof Error && e.message.includes("missing code")) throw e;
      // fallback: query-string only
      const q = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : raw;
      const params = new URLSearchParams(q);
      const code = params.get("code");
      if (!code) throw new Error("could not parse authorization code");
      return {
        code,
        state: params.get("state") || undefined,
      };
    }
  }
  return { code: raw };
}

/** Test/helper: read whether access token is bound (never returns secret). */
export function gmailAccessBound(): boolean {
  try {
    return Boolean(createFileSecretStore().get(GMAIL_AUTH_REF)?.trim());
  } catch {
    return false;
  }
}

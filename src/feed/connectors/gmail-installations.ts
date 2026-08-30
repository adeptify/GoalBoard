/**
 * Gmail multi-installation storage (CONN-002 slice 1).
 * One installation = one member's bound Gmail account on a shared instance.
 * Installations are non-secret metadata persisted under one settings key;
 * tokens/cursors stay isolated per installation:
 *   secrets  → connector:gmail:inst:<id>:{refresh,access,token_expires_at}
 *   cursor   → connector_cursors(installationId) (existing table)
 *
 * Legacy compatibility: a pre-multi-installation binding lives under the fixed
 * `connector:gmail:*` refs and projects as the implicit default installation
 * until it is re-authorized into an explicit row.
 */
export const GMAIL_INSTALLATIONS_SETTINGS_KEY =
  "connector:gmail:installations";

export const LEGACY_GMAIL_INSTALLATION_ID = "inst_gmail_default";

export interface GmailInstallation {
  id: string;
  /** Account identity captured at OAuth consent time. */
  email?: string;
  /** "mock" = last sync came from an explicit test fixture, never live data. */
  status: "connected" | "error" | "disconnected" | "mock";
  lastSyncAt?: string;
  itemCount: number;
  createdAt: string;
}
export interface InstallationSettingsStore {
  getSetting<T>(key: string, fallback: T): T;
  setSetting(key: string, value: unknown): void;
}

export interface InstallationSecretStore {
  get(ref: string): string | null | undefined;
  delete(ref: string): void;
}

export function gmailInstallationSecretRefs(installationId: string): {
  refresh: string;
  access: string;
  expiresAt: string;
} {
  const base = `connector:gmail:inst:${installationId}`;
  return {
    refresh: `${base}:refresh`,
    access: `${base}:access`,
    expiresAt: `${base}:token_expires_at`,
  };
}

function sanitize(raw: unknown): GmailInstallation[] {
  if (!Array.isArray(raw)) return [];
  const out: GmailInstallation[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id) continue;
    if (
      r.status !== "connected" &&
      r.status !== "error" &&
      r.status !== "disconnected" &&
      r.status !== "mock"
    ) {
      continue;
    }
    out.push({
      id: r.id,
      ...(typeof r.email === "string" && r.email ? { email: r.email } : {}),
      status: r.status,
      ...(typeof r.lastSyncAt === "string" ? { lastSyncAt: r.lastSyncAt } : {}),
      itemCount: typeof r.itemCount === "number" ? r.itemCount : 0,
      createdAt:
        typeof r.createdAt === "string"
          ? r.createdAt
          : new Date(0).toISOString(),
    });
  }
  return out;
}

export function listGmailInstallations(
  store: InstallationSettingsStore,
): GmailInstallation[] {
  return sanitize(store.getSetting(GMAIL_INSTALLATIONS_SETTINGS_KEY, []));
}

export function findGmailInstallation(
  store: InstallationSettingsStore,
  installationId: string,
): GmailInstallation | null {
  return (
    listGmailInstallations(store).find((i) => i.id === installationId) ?? null
  );
}

/**
 * Upsert one installation. When another row already holds the same email, the
 * incoming record is adopted INTO that row — keeping its stable id (and thus
 * its cursor) so re-authorizing an existing account never duplicates or forks.
 */
export function upsertGmailInstallation(
  store: InstallationSettingsStore,
  installation: GmailInstallation,
): GmailInstallation[] {
  let list = listGmailInstallations(store);
  const email = installation.email?.trim().toLowerCase() || undefined;

  if (email) {
    const existing = list.find(
      (i) => i.email?.toLowerCase() === email && i.id !== installation.id,
    );
    if (existing) {
      const adopted: GmailInstallation = {
        ...installation,
        id: existing.id,
        createdAt: existing.createdAt,
      };
      list = [
        ...list.filter(
          (i) => i.id !== installation.id && i.id !== existing.id,
        ),
        adopted,
      ];
      store.setSetting(GMAIL_INSTALLATIONS_SETTINGS_KEY, list);
      return list;
    }
  }

  const idx = list.findIndex((i) => i.id === installation.id);
  if (idx >= 0) list[idx] = installation;
  else list.push(installation);
  store.setSetting(GMAIL_INSTALLATIONS_SETTINGS_KEY, list);
  return list;
}

export function findGmailInstallationByEmail(
  store: InstallationSettingsStore,
  email: string,
): GmailInstallation | null {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  return (
    listGmailInstallations(store).find(
      (i) => i.email?.toLowerCase() === normalized,
    ) ?? null
  );
}

export function deleteGmailInstallation(
  store: InstallationSettingsStore,
  installationId: string,
): boolean {
  const list = listGmailInstallations(store);
  const next = list.filter((i) => i.id !== installationId);
  if (next.length === list.length) return false;
  store.setSetting(GMAIL_INSTALLATIONS_SETTINGS_KEY, next);
  return true;
}

function legacyBindingPresent(
  secrets: Pick<InstallationSecretStore, "get">,
): boolean {
  return Boolean(secrets.get("connector:gmail:refresh")?.trim());
}
/**
 * The implicit default installation exists only while the legacy single-account
 * refs are present and no explicit row took over. It is read-only metadata:
 * revoking it means deleting the legacy refs themselves.
 */
export function resolveLegacyDefaultInstallation(
  secrets: Pick<InstallationSecretStore, "get">,
): GmailInstallation | null {
  if (!legacyBindingPresent(secrets)) return null;
  return {
    id: LEGACY_GMAIL_INSTALLATION_ID,
    status: "connected",
    itemCount: 0,
    createdAt: new Date(0).toISOString(),
  };
}

/**
 * Effective view: explicit rows plus the legacy default when applicable.
 * Consumers must treat the legacy row as non-upsertable metadata.
 */
export function listEffectiveGmailInstallations(
  settings: InstallationSettingsStore,
  secrets: Pick<InstallationSecretStore, "get">,
): GmailInstallation[] {
  const rows = listGmailInstallations(settings);
  if (rows.length > 0) return rows;
  const legacy = resolveLegacyDefaultInstallation(secrets);
  return legacy ? [legacy] : [];
}

/** Removes every per-installation credential ref. Never throws on absence. */
export function deleteGmailInstallationCredentials(
  secrets: InstallationSecretStore,
  installationId: string,
): void {
  const refs = gmailInstallationSecretRefs(installationId);
  for (const ref of Object.values(refs)) {
    try {
      secrets.delete(ref);
    } catch {
      /* absent ref stays absent */
    }
  }
}

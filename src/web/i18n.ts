import { AsyncLocalStorage } from "node:async_hooks";
import { EN } from "@adeptify/goalboard-app-workbench";

export { EN } from "@adeptify/goalboard-app-workbench";

export type WebLocale = "zh" | "en";

export const LOCALE_COOKIE = "goalboard_locale";
export const WEB_LOCALES = ["zh", "en"] as const;

const localeStore = new AsyncLocalStorage<WebLocale>();

export function isWebLocale(value: unknown): value is WebLocale {
  return value === "zh" || value === "en";
}

export function runWithLocale<T>(locale: WebLocale, fn: () => T): T {
  return localeStore.run(locale, fn);
}

export function currentLocale(): WebLocale {
  return localeStore.getStore() ?? "zh";
}

export function htmlLang(locale: WebLocale = currentLocale()): string {
  return locale === "en" ? "en" : "zh-CN";
}

export function dateTimeLocale(locale: WebLocale = currentLocale()): string {
  return locale === "en" ? "en-US" : "zh-CN";
}

export function listJoin(values: readonly string[], locale: WebLocale = currentLocale()): string {
  return values.join(locale === "en" ? ", " : "、");
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.split("=");
    if (rawName?.trim() !== name) continue;
    return rest.join("=").trim();
  }
  return undefined;
}

export function resolveWebLocale(
  cookieHeader?: string | string[] | null,
  acceptLanguage?: string | string[] | null,
): WebLocale {
  const cookie = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader;
  const fromCookie = cookieValue(cookie ?? undefined, LOCALE_COOKIE);
  if (isWebLocale(fromCookie)) return fromCookie;

  const accept = Array.isArray(acceptLanguage) ? acceptLanguage.join(",") : acceptLanguage;
  for (const part of String(accept ?? "").split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase();
    if (!tag) continue;
    if (tag === "en" || tag.startsWith("en-")) return "en";
    if (tag === "zh" || tag.startsWith("zh-")) return "zh";
  }
  return "zh";
}

export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    return "/";
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\r\n]/.test(value)) {
    return "/";
  }
  return value;
}

export function localeSetCookie(locale: WebLocale): string {
  return `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function localeSwitchHref(locale: WebLocale, nextPath: string): string {
  return `/locale?lang=${locale}&next=${encodeURIComponent(safeNextPath(nextPath))}`;
}

export function L(zh: string, vars?: Record<string, string | number>): string {
  const locale = currentLocale();
  let text = locale === "en" ? (EN[zh] ?? zh) : zh;
  if (vars) {
    for (const [key, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${key}}`, String(value));
    }
  }
  return text;
}

export function renderLocaleSwitch(nextPath: string): string {
  const locale = currentLocale();
  return `<nav class="locale-switch" aria-label="${escapeAttr(L("界面语言"))}">
    <a href="${localeSwitchHref("zh", nextPath)}" hreflang="zh-CN" lang="zh-CN"${locale === "zh" ? ' aria-current="true"' : ""}>中文</a>
    <a href="${localeSwitchHref("en", nextPath)}" hreflang="en" lang="en"${locale === "en" ? ' aria-current="true"' : ""}>EN</a>
  </nav>`;
}

export function englishCatalogJson(): string {
  return JSON.stringify(EN).replaceAll("<", "\\u003c");
}

export function clientI18nScript(): string {
  const catalog = currentLocale() === "en" ? englishCatalogJson() : "{}";
  return `globalThis.GOALBOARD_EN = ${catalog};
  globalThis.L = function L(zh, vars) {
    const useEn = !String(document.documentElement.lang || "zh").toLowerCase().startsWith("zh");
    let text = useEn && globalThis.GOALBOARD_EN && globalThis.GOALBOARD_EN[zh] ? globalThis.GOALBOARD_EN[zh] : zh;
    if (vars) {
      for (const key of Object.keys(vars)) text = text.split("{" + key + "}").join(String(vars[key]));
    }
    return text;
  };`;
}

export const LOCALE_SWITCH_STYLES = `
  .locale-switch { height: 28px; margin-right: 10px; padding: 2px; border: 1px solid var(--line); border-radius: 5px; background: #fff; display: inline-flex; align-items: center; flex: 0 0 auto; }
  .locale-switch a { min-width: 36px; height: 24px; padding: 0 8px; border-radius: 3px; display: grid; place-items: center; color: var(--muted); font-size: 12px; font-weight: 650; text-decoration: none; }
  .locale-switch a:hover { color: var(--blue-dark); background: var(--blue-soft); }
  .locale-switch a[aria-current=true] { color: var(--blue-dark); background: var(--blue-soft); }
  @media (max-width: 760px) {
    .locale-switch { margin-right: 6px; }
    .locale-switch a { min-width: 32px; padding: 0 6px; }
  }
`;

function escapeAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

import type { IncomingMessage } from "node:http";

export const DESKTOP_COOKIE = "goalboard_desktop";

function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.split("=");
    if (rawName?.trim() !== name) continue;
    return rest.join("=").trim();
  }
  return undefined;
}

export function isDesktopShellRequest(request: IncomingMessage, url: URL): boolean {
  const header = request.headers["x-goalboard-desktop"];
  if (header === "1" || (Array.isArray(header) && header.includes("1"))) return true;
  if (url.searchParams.get("desktop") === "1") return true;
  const cookie = Array.isArray(request.headers.cookie)
    ? request.headers.cookie.join("; ")
    : request.headers.cookie;
  return cookieValue(cookie, DESKTOP_COOKIE) === "1";
}

export function desktopShellSetCookie(): string {
  return `${DESKTOP_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function desktopCookieHeaders(request: IncomingMessage, url: URL): Record<string, string> {
  if (!isDesktopShellRequest(request, url)) return {};
  return { "set-cookie": desktopShellSetCookie() };
}

export function withDesktopQuery(href: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  if (/(?:[?&])desktop=1(?:&|#|$)/.test(href)) return href;
  const hashIndex = href.indexOf("#");
  const beforeHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  return `${beforeHash}${beforeHash.includes("?") ? "&" : "?"}desktop=1${hash}`;
}

export function appendDesktopQueryToLocalHrefs(html: string): string {
  return html.replace(/href="(\/[^"]*)"/g, (_match, href: string) => `href="${withDesktopQuery(href)}"`);
}

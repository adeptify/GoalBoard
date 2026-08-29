import type { IncomingMessage } from "node:http";

export function isDesktopShellRequest(request: IncomingMessage, url: URL): boolean {
  const header = request.headers["x-goalboard-desktop"];
  if (header === "1" || (Array.isArray(header) && header.includes("1"))) return true;
  return url.searchParams.get("desktop") === "1";
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

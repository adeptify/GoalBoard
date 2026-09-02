import type { IncomingMessage } from "node:http";

export const NATIVE_DESKTOP_BOOTSTRAP_SCRIPT = `(()=>{
  const native=Boolean(globalThis.__TAURI_INTERNALS__||globalThis.__TAURI__);
  globalThis.goalboardNavigationUrl=(value)=>{
    const input=String(value);
    if(!native)return input;
    try{
      const next=new URL(input,location.href);
      if(next.origin!==location.origin)return input;
      next.searchParams.set("desktop","1");
      return next.href;
    }catch{return input}
  };
  if(!native)return;
  document.documentElement.dataset.nativeDesktop="true";
  document.documentElement.style.setProperty("--desktop-native-project-safe-inline-start","88px");
  document.documentElement.style.setProperty("--desktop-native-settings-safe-inline-start","80px");
  document.documentElement.style.setProperty("--desktop-native-titlebar-control-offset-y","-8px");
  const normalized=globalThis.goalboardNavigationUrl(location.href);
  if(normalized!==location.href)location.replace(normalized);
})();`;

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
  return html.replace(/href="(\/[^\"]*)"/g, (_match, href: string) => `href="${withDesktopQuery(href)}"`);
}

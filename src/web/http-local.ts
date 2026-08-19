import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

export function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.split("=");
    if (rawName?.trim() !== name) continue;
    return rest.join("=").trim();
  }
  return undefined;
}

export function isLoopbackHostname(hostname: string): boolean {
  const value = hostname.toLowerCase();
  return value === "127.0.0.1" || value === "localhost" || value === "[::1]" || value === "::1";
}

export function requestHost(request: IncomingMessage): string | null {
  const value = request.headers.host?.trim();
  if (!value) return null;
  try {
    const parsed = new URL(`http://${value}`);
    return isLoopbackHostname(parsed.hostname) ? parsed.host : null;
  } catch {
    return null;
  }
}

export function timingSafeTokenEquals(expected: string, actual: string | string[] | null | undefined): boolean {
  if (typeof actual !== "string") return false;
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

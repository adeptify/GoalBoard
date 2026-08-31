#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const packageVersion = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8")).version;
const tauriVersion = JSON.parse(
  readFileSync(resolve(repoRoot, "desktop/src-tauri/tauri.conf.json"), "utf8"),
).version;
const cargoToml = readFileSync(resolve(repoRoot, "desktop/src-tauri/Cargo.toml"), "utf8");
const cargoLock = readFileSync(resolve(repoRoot, "desktop/src-tauri/Cargo.lock"), "utf8");
const feedRuntime = readFileSync(resolve(repoRoot, "src/feed/sources/runtime.ts"), "utf8");
const codexTransport = readFileSync(resolve(repoRoot, "src/sessions/codex-transport.ts"), "utf8");
const cargoTomlVersion = cargoToml.match(/^version = "([^"]+)"$/m)?.[1];
const cargoLockVersion = cargoLock.match(
  /\[\[package\]\]\nname = "goalboard-desktop"\nversion = "([^"]+)"/,
)?.[1];
const feedRuntimeVersion = feedRuntime.match(/^const APP_VERSION = "([^"]+)";$/m)?.[1];
const codexTransportVersion = codexTransport.match(
  /clientInfo: \{ name: "goalboard-session-browser", title: "GoalBoard", version: "([^"]+)" \}/,
)?.[1];

const versions = {
  "package.json": packageVersion,
  "desktop/src-tauri/tauri.conf.json": tauriVersion,
  "desktop/src-tauri/Cargo.toml": cargoTomlVersion,
  "desktop/src-tauri/Cargo.lock#goalboard-desktop": cargoLockVersion,
  "src/feed/sources/runtime.ts#APP_VERSION": feedRuntimeVersion,
  "src/sessions/codex-transport.ts#clientInfo.version": codexTransportVersion,
};
const mismatches = Object.entries(versions).filter(([, version]) => version !== packageVersion);
if (mismatches.length > 0) {
  const details = Object.entries(versions)
    .map(([source, version]) => `${source}=${version ?? "missing"}`)
    .join(", ");
  throw new Error(`GoalBoard release versions are inconsistent: ${details}`);
}

console.log(`GoalBoard release version sources agree: ${packageVersion}`);

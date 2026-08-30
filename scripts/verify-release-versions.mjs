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
const cargoTomlVersion = cargoToml.match(/^version = "([^"]+)"$/m)?.[1];
const cargoLockVersion = cargoLock.match(
  /\[\[package\]\]\nname = "goalboard-desktop"\nversion = "([^"]+)"/,
)?.[1];

const versions = {
  "package.json": packageVersion,
  "desktop/src-tauri/tauri.conf.json": tauriVersion,
  "desktop/src-tauri/Cargo.toml": cargoTomlVersion,
  "desktop/src-tauri/Cargo.lock#goalboard-desktop": cargoLockVersion,
};
const mismatches = Object.entries(versions).filter(([, version]) => version !== packageVersion);
if (mismatches.length > 0) {
  const details = Object.entries(versions)
    .map(([source, version]) => `${source}=${version ?? "missing"}`)
    .join(", ");
  throw new Error(`GoalBoard release versions are inconsistent: ${details}`);
}

console.log(`GoalBoard release version sources agree: ${packageVersion}`);

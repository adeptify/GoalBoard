import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { spawn, type IPty } from "node-pty";

export interface PtySpawnRequest {
  panelId: string;
  command: string;
  args?: string[];
  cwd?: string | null;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

export interface PtySpawnResult {
  attached: boolean;
  replay: string;
}

export interface PtyHostHandlers {
  onData: (panelId: string, data: string) => void;
  onExit: (panelId: string, exit: { exitCode: number; signal: number }) => void;
}

const REPLAY_LIMIT = 200_000;
const UNIX_PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";

const BLOCKED_ENV_KEYS = new Set([
  "CI",
  "CLAUDECODE",
  "CONTINUOUS_INTEGRATION",
  "ELECTRON_NO_ASAR",
  "ELECTRON_RUN_AS_NODE",
  "NODE_CHANNEL_FD",
  "NODE_COMPILE_CACHE",
  "NODE_DEBUG",
  "NODE_OPTIONS",
  "NODE_PATH",
  "NODE_PENDING_DEPRECATION",
  "NODE_SKIP_PLATFORM_CHECK",
  "NODE_UNIQUE_ID",
  "VSCODE_INSPECTOR_OPTIONS",
  "XPC_SERVICE_NAME",
  "__CFBundleIdentifier",
]);

const BLOCKED_ENV_PREFIXES = [
  "VSCODE_",
  "CURSOR_",
  "ELECTRON_",
  "NPM_",
  "PNPM_",
  "BUN_",
  "DENO_",
  "VITE_",
  "NODE_",
  "COMPOSER_",
  "CLAUDE",
  "CODEX_",
];

let cachedLoginEnv: Record<string, string> | null = null;

function ensureMacosSpawnHelperExecutable(): void {
  if (process.platform !== "darwin") return;
  let ptyRoot: string;
  try {
    ptyRoot = path.dirname(createRequire(import.meta.url).resolve("node-pty/package.json"));
  } catch {
    return;
  }
  const helpers = [
    path.join(ptyRoot, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper"),
    path.join(ptyRoot, "build", "Release", "spawn-helper"),
  ];
  for (const helper of helpers) {
    try {
      const stat = fs.statSync(helper);
      if (!stat.isFile()) continue;
      if ((stat.mode & 0o111) === 0) fs.chmodSync(helper, 0o755);
    } catch {
      // Prebuild vs source layouts differ; spawn will fail later if the helper is missing.
    }
  }
}

ensureMacosSpawnHelperExecutable();

export function isBlockedPtyEnvKey(key: string): boolean {
  if (BLOCKED_ENV_KEYS.has(key)) return true;
  if (key.startsWith("__CURSOR")) return true;
  const upper = key.toUpperCase();
  return upper.startsWith("__NEXT") || BLOCKED_ENV_PREFIXES.some((prefix) => upper.startsWith(prefix));
}

function parseNulEnv(raw: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const chunk of raw.split("\0")) {
    if (!chunk) continue;
    const separator = chunk.indexOf("=");
    if (separator <= 0) continue;
    const key = chunk.slice(0, separator);
    if (isBlockedPtyEnvKey(key)) continue;
    env[key] = chunk.slice(separator + 1);
  }
  return env;
}

function loginProbeEnvironment(): NodeJS.ProcessEnv {
  const username = os.userInfo().username;
  const lang = process.env.LANG?.trim();
  return {
    HOME: os.homedir(),
    USER: username,
    LOGNAME: username,
    SHELL: "/bin/zsh",
    TERM: "dumb",
    PATH: UNIX_PATH,
    LANG: lang && !isBlockedPtyEnvKey("LANG") ? lang : "C.UTF-8",
  };
}

function loginShellEnvironment(): Record<string, string> {
  if (cachedLoginEnv) return cachedLoginEnv;
  try {
    const result = spawnSync("/bin/zsh", ["-l", "-c", "env -0"], {
      env: loginProbeEnvironment(),
      timeout: 8000,
      maxBuffer: 1024 * 1024,
    });
    if (result.status === 0 && result.stdout.length > 0) {
      cachedLoginEnv = parseNulEnv(result.stdout.toString("utf8"));
      return cachedLoginEnv;
    }
  } catch {
    // Fall through to a minimal environment.
  }
  cachedLoginEnv = {};
  return cachedLoginEnv;
}

function nvmBinDirectory(): string | undefined {
  const nvmDir = process.env.NVM_DIR?.trim() || path.join(os.homedir(), ".nvm");
  const fromEnv = process.env.NVM_BIN?.trim();
  let fromAlias: string | undefined;
  try {
    const alias = fs.readFileSync(path.join(nvmDir, "alias", "default"), "utf8").trim();
    if (alias) {
      const version = alias.startsWith("v") ? alias : `v${alias}`;
      fromAlias = path.join(nvmDir, "versions", "node", version, "bin");
    }
  } catch {
    // nvm is optional.
  }
  for (const directory of [fromEnv, fromAlias]) {
    if (!directory) continue;
    const resolved = path.resolve(directory);
    if (!resolved.startsWith(os.homedir())) continue;
    if (isExecutableFile(path.join(resolved, "node"))) return resolved;
  }
  return undefined;
}

function userToolchainPath(): string {
  return mergePath(
    path.join(os.homedir(), ".local", "bin"),
    path.join(os.homedir(), ".grok", "bin"),
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    path.join(os.homedir(), ".cargo", "bin"),
    nvmBinDirectory(),
  );
}

function currentSshAuthSock(): string | undefined {
  const value = process.env.SSH_AUTH_SOCK?.trim();
  if (!value) return undefined;
  if (value.includes("cursor-sandbox")) return undefined;
  return value;
}

function currentTmpdir(): string | undefined {
  const value = process.env.TMPDIR?.trim();
  if (!value || /cursor-sandbox/i.test(value)) return undefined;
  return value;
}

function mergePath(...parts: Array<string | undefined>): string {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    for (const directory of part.split(":")) {
      if (!directory || seen.has(directory)) continue;
      seen.add(directory);
      merged.push(directory);
    }
  }
  return merged.join(":");
}

function isExecutableFile(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function resolveCommand(command: string, pathEnv: string): string {
  if (!command || command.includes("/") || command.includes("\\")) return command;
  for (const directory of pathEnv.split(":")) {
    if (!directory) continue;
    const candidate = path.join(directory, command);
    if (isExecutableFile(candidate)) return candidate;
  }
  return command;
}

export function resolvePtyCommand(command: string, pathEnv = buildPtyEnvironment().PATH ?? ""): string {
  return resolveCommand(command, pathEnv);
}

export function isPtyCommandAvailable(command: string, pathEnv = buildPtyEnvironment().PATH ?? ""): boolean {
  if (!command?.trim()) return false;
  return isExecutableFile(resolveCommand(command.trim(), pathEnv));
}

export function buildPtyEnvironment(overlay: Record<string, string> = {}): Record<string, string> {
  const login = loginShellEnvironment();
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(login)) {
    if (isBlockedPtyEnvKey(key)) continue;
    env[key] = value;
  }
  env.HOME ||= os.homedir();
  env.USER ||= os.userInfo().username;
  env.LOGNAME ||= env.USER;
  env.SHELL ||= "/bin/zsh";
  env.PATH = mergePath(userToolchainPath(), login.PATH, UNIX_PATH);
  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";
  const sshAuthSock = currentSshAuthSock();
  if (sshAuthSock) env.SSH_AUTH_SOCK = sshAuthSock;
  const tmpdir = currentTmpdir();
  if (tmpdir) env.TMPDIR = tmpdir;
  delete env.TERM_PROGRAM;
  delete env.TERM_PROGRAM_VERSION;
  delete env.NODE_PATH;
  delete env.NODE_OPTIONS;
  for (const [key, value] of Object.entries(overlay)) {
    if (isBlockedPtyEnvKey(key)) continue;
    env[key] = value;
  }
  for (const key of Object.keys(env)) {
    if (isBlockedPtyEnvKey(key)) delete env[key];
  }
  return env;
}

function clipReplay(value: string): string {
  return value.length > REPLAY_LIMIT ? value.slice(value.length - REPLAY_LIMIT) : value;
}

export class GoalBoardPtyHost {
  private readonly sessions = new Map<string, IPty>();
  private readonly replay = new Map<string, string>();
  private readonly handlers: PtyHostHandlers;

  constructor(handlers: PtyHostHandlers) {
    this.handlers = handlers;
  }

  alive(panelId: string): boolean {
    return this.sessions.has(panelId);
  }

  spawn(request: PtySpawnRequest): PtySpawnResult {
    const cols = Math.max(20, Math.floor(request.cols ?? 80));
    const rows = Math.max(8, Math.floor(request.rows ?? 24));
    const existing = this.sessions.get(request.panelId);
    if (existing) {
      existing.resize(cols, rows);
      return { attached: true, replay: this.replay.get(request.panelId) ?? "" };
    }
    const commandName = request.command?.trim();
    if (!commandName) throw new Error("缺少启动命令");
    const env = buildPtyEnvironment(request.env ?? {});
    const command = resolveCommand(commandName, env.PATH);
    if (!isExecutableFile(command)) {
      throw new Error(`找不到命令：${commandName}，请先安装，或确认它在 PATH 中。`);
    }
    const cwd = request.cwd?.trim() || os.homedir();
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
      throw new Error(`工作目录不存在：${cwd}，请检查项目绑定的目录。`);
    }
    const proc = spawn(command, request.args ?? [], {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env,
    });
    this.replay.set(request.panelId, "");
    proc.onData((data) => {
      this.replay.set(request.panelId, clipReplay((this.replay.get(request.panelId) ?? "") + data));
      this.handlers.onData(request.panelId, data);
    });
    proc.onExit(({ exitCode, signal }) => {
      this.sessions.delete(request.panelId);
      this.handlers.onExit(request.panelId, { exitCode: exitCode ?? -1, signal: signal ?? 0 });
    });
    this.sessions.set(request.panelId, proc);
    return { attached: false, replay: "" };
  }

  write(panelId: string, data: string): void {
    const session = this.sessions.get(panelId);
    if (!session) throw new Error("终端进程不存在");
    session.write(data);
  }

  resize(panelId: string, cols: number, rows: number): void {
    const session = this.sessions.get(panelId);
    if (!session) return;
    session.resize(Math.max(20, Math.floor(cols)), Math.max(8, Math.floor(rows)));
  }

  kill(panelId: string): void {
    const session = this.sessions.get(panelId);
    this.sessions.delete(panelId);
    this.replay.delete(panelId);
    if (!session) return;
    try {
      session.kill();
    } catch {
      // Process may already have exited.
    }
  }

  killAll(): void {
    for (const panelId of [...this.sessions.keys()]) this.kill(panelId);
  }
}

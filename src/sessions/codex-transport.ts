import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import type { RuntimeSessionTransport } from "./types.js";

export interface CodexAppServerTransportOptions {
  command?: string;
  args?: string[];
  requestTimeoutMs?: number;
  spawnProcess?: typeof spawn;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Minimal, private app-server client used only for Session read/resume.
 * It deliberately keeps request bodies out of logs and public errors.
 */
export class CodexAppServerTransport implements RuntimeSessionTransport {
  private child: ChildProcessWithoutNullStreams | null = null;
  private startPromise: Promise<void> | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly listeners = new Set<(event: { method: string; params: unknown }) => void>();
  private closed = false;

  constructor(private readonly options: CodexAppServerTransportOptions = {}) {}

  async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (this.closed) throw new Error("Codex Session transport 已关闭");
    await this.ensureStarted();
    return this.requestRaw(method, params);
  }

  subscribe(listener: (event: { method: string; params: unknown }) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.closed = true;
    const child = this.child;
    this.child = null;
    this.startPromise = null;
    this.failAll(new Error("Codex Session transport 已关闭"));
    if (child && !child.killed) child.kill("SIGTERM");
  }

  private ensureStarted(): Promise<void> {
    if (this.child) return Promise.resolve();
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.start().catch((error) => {
      this.startPromise = null;
      throw error;
    });
    return this.startPromise;
  }

  private async start(): Promise<void> {
    const spawnProcess = this.options.spawnProcess ?? spawn;
    const command = this.options.command?.trim() || process.env.GOALBOARD_CODEX_PATH?.trim() || "codex";
    const args = this.options.args ?? ["app-server", "--stdio"];
    const child = spawnProcess(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
      shell: false,
    });
    this.child = child;
    const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on("line", (line) => this.handleLine(line));
    child.once("error", () => this.handleExit("Codex app-server 无法启动"));
    child.once("exit", () => this.handleExit("Codex app-server 已退出"));
    // Drain stderr without copying potentially sensitive Runtime diagnostics.
    child.stderr.on("data", () => undefined);

    await this.requestRaw("initialize", {
      clientInfo: { name: "goalboard-session-browser", title: "GoalBoard", version: "0.1.8" },
      capabilities: {
        experimentalApi: false,
        requestAttestation: false,
        optOutNotificationMethods: [],
      },
    });
    this.write({ method: "initialized" });
  }

  private requestRaw(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    const timeoutMs = Math.max(1_000, this.options.requestTimeoutMs ?? 15_000);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex ${method} 请求超时`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.write({ id, method, params });
      } catch {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error(`Codex ${method} 请求发送失败`));
      }
    });
  }

  private write(message: Record<string, unknown>): void {
    if (!this.child?.stdin.writable) throw new Error("Codex app-server 不可写");
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    if (typeof message.id === "number") {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) {
        pending.reject(new Error(publicCodexErrorMessage(message.error)));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (typeof message.method !== "string") return;
    const event = { method: message.method, params: message.params };
    for (const listener of this.listeners) listener(event);
  }

  private handleExit(message: string): void {
    this.child = null;
    this.startPromise = null;
    this.failAll(new Error(message));
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function publicCodexErrorMessage(value: unknown): string {
  const error = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const message = typeof error.message === "string" ? error.message : "";
  if (/active writer/i.test(message)) {
    return "Codex Session 已经在另一个 Runtime 实例中运行。";
  }
  if (/thread.+not found|not found.+thread/i.test(message)) {
    return "Codex 找不到这条 Session。";
  }
  return "Codex app-server 请求失败";
}

import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SERVICE_OWNER = "goalboard-web-service-v1";
const SERVICE_LABEL = "com.adeptify.goalboard.web";

export type GoalBoardWebServiceAction = "install" | "start" | "stop" | "restart" | "remove";
export type GoalBoardWebServiceState =
  | "unsupported"
  | "unavailable"
  | "absent"
  | "stopped"
  | "running"
  | "unhealthy"
  | "needs_repair"
  | "conflict";

export interface GoalBoardWebServiceDetection {
  provider: "macos-launchagent" | "unsupported";
  state: GoalBoardWebServiceState;
  supported: boolean;
  owned: boolean;
  running: boolean;
  label: string;
  plist_path: string;
  command: string[];
  stdout_log: string;
  stderr_log: string;
  message: string;
}

export interface GoalBoardWebServicePlan {
  plan_id: string;
  action: GoalBoardWebServiceAction;
  status: "ready" | "no_change" | "unsupported" | "conflict";
  detection: GoalBoardWebServiceDetection;
  changes: Array<{ operation: "create" | "start" | "stop" | "restart" | "remove"; target: string }>;
  confirmation: string;
  message: string;
}

export interface GoalBoardWebServiceResult {
  status: "installed" | "started" | "stopped" | "restarted" | "removed" | "unchanged" | "declined";
  action: GoalBoardWebServiceAction;
  detection: GoalBoardWebServiceDetection;
  message: string;
}

export interface GoalBoardWebServiceManagerOptions {
  homeDirectory?: string;
  userHomeDirectory?: string;
  nodeExecutablePath?: string;
  platform?: NodeJS.Platform;
  uid?: number;
  runCommand?: (file: string, args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;
  /** Returns true only after the managed Web endpoint can serve requests. */
  healthCheck?: () => Promise<boolean>;
  /** Tests may remove the real launchd transition wait without changing retry behavior. */
  transitionDelayMilliseconds?: number;
}

interface WebServiceReceipt {
  schema_version: 1;
  owner: typeof SERVICE_OWNER;
  label: string;
  plist_path: string;
  plist_hash: string;
  installed_at: string;
}

interface PreparedServicePlan {
  publicPlan: GoalBoardWebServicePlan;
  snapshotHash: string;
  expectedPlist: string;
}

export class GoalBoardWebServiceError extends Error {
  constructor(
    readonly code: "service.unsupported" | "service.conflict" | "service.plan_missing" | "service.plan_stale" | "service.command_failed",
    message: string,
  ) {
    super(message);
    this.name = "GoalBoardWebServiceError";
  }
}

export class GoalBoardWebServiceManager {
  readonly homeDirectory: string;
  readonly userHomeDirectory: string;
  readonly plistPath: string;
  readonly receiptPath: string;
  readonly stdoutLog: string;
  readonly stderrLog: string;
  private readonly platform: NodeJS.Platform;
  private readonly uid: number;
  private readonly nodeExecutablePath: string;
  private readonly runCommand: NonNullable<GoalBoardWebServiceManagerOptions["runCommand"]>;
  private readonly healthCheck: NonNullable<GoalBoardWebServiceManagerOptions["healthCheck"]>;
  private readonly transitionDelayMilliseconds: number;
  private readonly plans = new Map<string, PreparedServicePlan>();

  constructor(options: GoalBoardWebServiceManagerOptions = {}) {
    this.homeDirectory = path.resolve(options.homeDirectory ?? path.join(os.homedir(), ".goalboard"));
    this.userHomeDirectory = path.resolve(
      options.userHomeDirectory
        ?? (options.homeDirectory ? path.dirname(this.homeDirectory) : os.homedir()),
    );
    this.platform = options.platform ?? process.platform;
    this.uid = options.uid ?? (typeof process.getuid === "function" ? process.getuid() : 0);
    this.nodeExecutablePath = path.resolve(options.nodeExecutablePath ?? process.execPath);
    this.plistPath = path.join(this.userHomeDirectory, "Library", "LaunchAgents", `${SERVICE_LABEL}.plist`);
    this.receiptPath = path.join(this.homeDirectory, "config", "web-service.json");
    this.stdoutLog = path.join(this.homeDirectory, "logs", "web-service.log");
    this.stderrLog = path.join(this.homeDirectory, "logs", "web-service.error.log");
    this.runCommand = options.runCommand ?? runCommand;
    this.healthCheck = options.healthCheck ?? goalBoardWebHealthCheck;
    this.transitionDelayMilliseconds = Math.max(0, options.transitionDelayMilliseconds ?? 250);
  }

  async detect(): Promise<GoalBoardWebServiceDetection> {
    const command = this.command();
    if (this.platform !== "darwin") {
      return this.detection("unsupported", false, false, false, command, "当前系统尚未提供 GoalBoard 常驻服务集成");
    }
    const launcherAvailable = await fileExists(command[0]);
    const plist = await readText(this.plistPath);
    const receipt = await readReceipt(this.receiptPath);
    if (plist == null) {
      const receiptOwned = Boolean(receipt && receipt.owner === SERVICE_OWNER && receipt.label === SERVICE_LABEL);
      if (receiptOwned) {
        return launcherAvailable
          ? this.detection("needs_repair", true, true, false, command, "LaunchAgent 文件缺失，可重新安装或移除残留记录")
          : this.detection("unavailable", true, true, false, command, "GoalBoard Web 启动器和 LaunchAgent 文件均缺失；可移除残留记录，或先修复 GoalBoard 安装");
      }
      return launcherAvailable
        ? this.detection("absent", true, false, false, command, "尚未启用常驻 Web 服务")
        : this.detection("unavailable", true, false, false, command, "GoalBoard Web 启动器不存在，请先安装或修复 GoalBoard");
    }
    const owned = Boolean(
      receipt
      && receipt.owner === SERVICE_OWNER
      && receipt.label === SERVICE_LABEL
      && path.resolve(receipt.plist_path) === this.plistPath
      && receipt.plist_hash === digest(plist),
    );
    if (!owned) {
      return this.detection("conflict", true, false, false, command, "同名 LaunchAgent 不属于 GoalBoard 或已被修改，不会覆盖");
    }
    const status = await this.launchctl(["print", this.serviceTarget()]);
    const running = launchAgentIsRunning(status);
    if (!launcherAvailable) {
      return this.detection("unavailable", true, true, running, command, "GoalBoard Web 启动器缺失；可移除服务或先修复 GoalBoard 安装");
    }
    if (plist !== this.plistSource()) {
      return this.detection("needs_repair", true, true, running, command, "GoalBoard Web 常驻服务使用旧配置，可预览并确认修复");
    }
    if (!running) {
      return this.detection("stopped", true, true, false, command, status.code === 0
        ? "GoalBoard Web 常驻服务已加载但进程未运行，请查看错误日志"
        : "GoalBoard Web 常驻服务已安装但当前未运行");
    }
    return await this.healthCheck()
      ? this.detection("running", true, true, true, command, "GoalBoard Web 常驻服务正在运行，页面已可访问")
      : this.detection("unhealthy", true, true, true, command, "GoalBoard Web 进程正在运行，但页面暂时不可访问；可受控重启并查看错误日志");
  }

  async prepare(action: GoalBoardWebServiceAction): Promise<GoalBoardWebServicePlan> {
    const detection = await this.detect();
    const expectedPlist = this.plistSource();
    const status = planStatus(action, detection);
    const plan: GoalBoardWebServicePlan = {
      plan_id: `web-service-plan-${randomUUID()}`,
      action,
      status,
      detection,
      changes: serviceChanges(action, detection, status, this.plistPath),
      confirmation: confirmationFor(action),
      message: planMessage(action, status, detection),
    };
    this.plans.set(plan.plan_id, {
      publicPlan: plan,
      snapshotHash: await this.snapshotHash(),
      expectedPlist,
    });
    return plan;
  }

  async confirm(input: { plan_id: string; decision: "confirmed" | "declined" }): Promise<GoalBoardWebServiceResult> {
    const prepared = this.plans.get(input.plan_id);
    if (!prepared) throw new GoalBoardWebServiceError("service.plan_missing", "常驻服务预览不存在或已失效，请重新预览");
    this.plans.delete(input.plan_id);
    if (input.decision === "declined") {
      return { status: "declined", action: prepared.publicPlan.action, detection: await this.detect(), message: "已取消，没有修改常驻服务" };
    }
    if (prepared.publicPlan.status === "unsupported") throw new GoalBoardWebServiceError("service.unsupported", prepared.publicPlan.message);
    if (prepared.publicPlan.status === "conflict") throw new GoalBoardWebServiceError("service.conflict", prepared.publicPlan.message);
    if (await this.snapshotHash() !== prepared.snapshotHash) {
      throw new GoalBoardWebServiceError("service.plan_stale", "LaunchAgent 状态在预览后发生变化，请重新预览");
    }
    if (prepared.publicPlan.status === "no_change") {
      return { status: "unchanged", action: prepared.publicPlan.action, detection: await this.detect(), message: prepared.publicPlan.message };
    }
    const action = prepared.publicPlan.action;
    if (action === "install") await this.install(prepared.expectedPlist);
    if (action === "start") await this.start();
    if (action === "stop") await this.stop();
    if (action === "restart") await this.restart();
    if (action === "remove") await this.remove();
    const status = ({ install: "installed", start: "started", stop: "stopped", restart: "restarted", remove: "removed" } as const)[action];
    return { status, action, detection: await this.detect(), message: resultMessage(action) };
  }

  private command(): string[] {
    return [path.join(this.homeDirectory, "bin", "goalboard-web"), "--home", this.homeDirectory];
  }

  private plistSource(): string {
    const args = this.command().map((value) => `      <string>${escapeXml(value)}</string>`).join("\n");
    const servicePath = [
      path.dirname(this.nodeExecutablePath),
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
    ].filter((value, index, all) => all.indexOf(value) === index).join(":");
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${SERVICE_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${escapeXml(servicePath)}</string>
  </dict>
  <key>StandardOutPath</key><string>${escapeXml(this.stdoutLog)}</string>
  <key>StandardErrorPath</key><string>${escapeXml(this.stderrLog)}</string>
</dict>
</plist>
`;
  }

  private async install(plist: string): Promise<void> {
    const previousPlist = await readText(this.plistPath);
    const previousReceipt = await readText(this.receiptPath);
    const detection = await this.detect();
    if (detection.owned) await this.stop();
    await fs.mkdir(path.dirname(this.plistPath), { recursive: true });
    await fs.mkdir(path.dirname(this.receiptPath), { recursive: true });
    await fs.mkdir(path.dirname(this.stdoutLog), { recursive: true });
    await writeAtomic(this.plistPath, plist);
    await writeAtomic(this.receiptPath, `${JSON.stringify({
      schema_version: 1,
      owner: SERVICE_OWNER,
      label: SERVICE_LABEL,
      plist_path: this.plistPath,
      plist_hash: digest(plist),
      installed_at: new Date().toISOString(),
    } satisfies WebServiceReceipt, null, 2)}\n`);
    try {
      await this.start();
    } catch (error) {
      await this.stop().catch(() => undefined);
      if (previousPlist == null) await fs.rm(this.plistPath, { force: true });
      else await writeAtomic(this.plistPath, previousPlist);
      if (previousReceipt == null) await fs.rm(this.receiptPath, { force: true });
      else await writeAtomic(this.receiptPath, previousReceipt);
      if (previousPlist != null && previousReceipt != null) {
        await this.start().catch(() => undefined);
      }
      throw error;
    }
  }

  private async start(): Promise<void> {
    let bootstrap = await this.launchctl(["bootstrap", this.domainTarget(), this.plistPath]);
    for (let attempt = 1; bootstrap.code === 37 && attempt < 25; attempt += 1) {
      await delay(this.transitionDelayMilliseconds);
      bootstrap = await this.launchctl(["bootstrap", this.domainTarget(), this.plistPath]);
    }
    if (bootstrap.code !== 0) {
      if (!/already loaded|service already loaded|Input\/output error/i.test(bootstrap.stderr)) throw commandError("启动", bootstrap);
      const kickstart = await this.launchctl(["kickstart", "-k", this.serviceTarget()]);
      if (kickstart.code !== 0) throw commandError("启动", kickstart);
    }
    await this.waitForRunning();
    await this.waitForReady();
  }

  private async stop(): Promise<void> {
    const result = await this.launchctl(["bootout", this.serviceTarget()]);
    if (result.code !== 0 && !/could not find service|no such process/i.test(result.stderr)) {
      throw commandError("停止", result);
    }
    if (result.code === 0) await this.waitForUnloaded();
  }

  private async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  private async remove(): Promise<void> {
    const detection = await this.detect();
    if (!detection.owned) throw new GoalBoardWebServiceError("service.conflict", "LaunchAgent 不属于 GoalBoard，拒绝移除");
    await this.stop();
    await fs.rm(this.plistPath, { force: true });
    await fs.rm(this.receiptPath, { force: true });
  }

  private async waitForUnloaded(): Promise<void> {
    let status = await this.launchctl(["print", this.serviceTarget()]);
    for (let attempt = 1; status.code === 0 && attempt < 25; attempt += 1) {
      await delay(this.transitionDelayMilliseconds);
      status = await this.launchctl(["print", this.serviceTarget()]);
    }
    if (status.code === 0) {
      throw new GoalBoardWebServiceError(
        "service.command_failed",
        "launchctl 停止超时：旧 GoalBoard Web 服务仍在卸载中，请稍后重试",
      );
    }
  }

  private async waitForRunning(): Promise<void> {
    let status = await this.launchctl(["print", this.serviceTarget()]);
    for (let attempt = 1; !launchAgentIsRunning(status) && attempt < 25; attempt += 1) {
      await delay(this.transitionDelayMilliseconds);
      status = await this.launchctl(["print", this.serviceTarget()]);
    }
    if (!launchAgentIsRunning(status)) {
      throw new GoalBoardWebServiceError(
        "service.command_failed",
        `launchctl 启动后未进入运行状态（${status.code}）：${status.stderr.trim() || "请查看 GoalBoard Web 错误日志"}`,
      );
    }
  }

  private async waitForReady(): Promise<void> {
    let ready = await this.healthCheck();
    for (let attempt = 1; !ready && attempt < 25; attempt += 1) {
      await delay(this.transitionDelayMilliseconds);
      ready = await this.healthCheck();
    }
    if (!ready) {
      throw new GoalBoardWebServiceError(
        "service.command_failed",
        `GoalBoard Web 进程已经启动，但页面健康检查仍未通过；请查看错误日志：${this.stderrLog}`,
      );
    }
  }

  private async launchctl(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    return this.runCommand("/bin/launchctl", args);
  }

  private domainTarget(): string { return `gui/${this.uid}`; }
  private serviceTarget(): string { return `${this.domainTarget()}/${SERVICE_LABEL}`; }

  private detection(
    state: GoalBoardWebServiceState,
    supported: boolean,
    owned: boolean,
    running: boolean,
    command: string[],
    message: string,
  ): GoalBoardWebServiceDetection {
    return {
      provider: supported ? "macos-launchagent" : "unsupported",
      state,
      supported,
      owned,
      running,
      label: SERVICE_LABEL,
      plist_path: this.plistPath,
      command,
      stdout_log: this.stdoutLog,
      stderr_log: this.stderrLog,
      message,
    };
  }

  private async snapshotHash(): Promise<string> {
    return digest(JSON.stringify({ plist: await readText(this.plistPath), receipt: await readText(this.receiptPath) }));
  }
}

function planStatus(action: GoalBoardWebServiceAction, detection: GoalBoardWebServiceDetection): GoalBoardWebServicePlan["status"] {
  if (!detection.supported) return "unsupported";
  if (detection.state === "conflict") return "conflict";
  if (detection.state === "unavailable") {
    if (action === "remove" && detection.owned) return "ready";
    if (action === "remove" && !detection.owned) return "no_change";
    if (action === "stop" && detection.running) return "ready";
    return "conflict";
  }
  if (action === "install") return detection.state === "running" ? "no_change" : "ready";
  if (action === "start") {
    if (detection.state === "absent" || detection.state === "needs_repair") return "conflict";
    return detection.state === "running" ? "no_change" : "ready";
  }
  if (action === "stop") return detection.running ? "ready" : "no_change";
  if (action === "restart") return detection.owned ? "ready" : "conflict";
  return detection.state === "absent" ? "no_change" : detection.owned ? "ready" : "conflict";
}

function serviceChanges(
  action: GoalBoardWebServiceAction,
  detection: GoalBoardWebServiceDetection,
  status: GoalBoardWebServicePlan["status"],
  plistPath: string,
): GoalBoardWebServicePlan["changes"] {
  if (status !== "ready") return [];
  if (action === "install") return [
    ...(detection.state === "absent" || detection.state === "needs_repair" ? [{ operation: "create" as const, target: plistPath }] : []),
    { operation: detection.state === "unhealthy" ? "restart" : "start", target: SERVICE_LABEL },
  ];
  return [{ operation: action, target: action === "remove" ? plistPath : SERVICE_LABEL }];
}

function confirmationFor(action: GoalBoardWebServiceAction): string {
  if (action === "install") return "确认安装并启动 macOS 用户级常驻 Web 服务";
  if (action === "remove") return "确认停止并移除 GoalBoard 创建的 LaunchAgent（项目数据和日志保留）";
  return `确认${({ start: "启动", stop: "停止", restart: "重启" } as const)[action]} GoalBoard Web 常驻服务`;
}

function planMessage(action: GoalBoardWebServiceAction, status: GoalBoardWebServicePlan["status"], detection: GoalBoardWebServiceDetection): string {
  if (status === "unsupported" || status === "conflict") return detection.message;
  if (status === "no_change") return `无需操作：${detection.message}`;
  return `准备${({ install: "安装并启动", start: "启动", stop: "停止", restart: "重启", remove: "移除" } as const)[action]} GoalBoard Web 常驻服务`;
}

function resultMessage(action: GoalBoardWebServiceAction): string {
  if (action === "install") return "GoalBoard Web 已作为 macOS 用户级服务运行；关闭终端或 Runtime Session 不会使它退出";
  if (action === "remove") return "GoalBoard Web 常驻服务已移除；项目数据和日志仍保留";
  return `GoalBoard Web 常驻服务已${({ start: "启动", stop: "停止", restart: "重启" } as const)[action]}`;
}

async function runCommand(file: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(file, args, { encoding: "utf8" });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as Error & { code?: number | string; stdout?: string; stderr?: string };
    return { code: typeof failure.code === "number" ? failure.code : 1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? failure.message };
  }
}

async function goalBoardWebHealthCheck(): Promise<boolean> {
  try {
    const response = await fetch("http://127.0.0.1:4173/health", {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(1_000),
    });
    if (!response.ok) return false;
    const body = await response.json() as { status?: unknown };
    return body.status === "ok";
  } catch {
    return false;
  }
}

function commandError(action: string, result: { code: number; stderr: string }): GoalBoardWebServiceError {
  return new GoalBoardWebServiceError("service.command_failed", `launchctl ${action}失败（${result.code}）：${result.stderr.trim() || "未知错误"}`);
}

function launchAgentIsRunning(result: { code: number; stdout: string }): boolean {
  if (result.code !== 0) return false;
  return /(?:^|\n)\s*state\s*=\s*running\s*(?:\n|$)/i.test(result.stdout)
    || /(?:^|\n)\s*pid\s*=\s*\d+\s*(?:\n|$)/i.test(result.stdout);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fileExists(filePath: string): Promise<boolean> {
  try { return (await fs.stat(filePath)).isFile(); } catch { return false; }
}

async function readText(filePath: string): Promise<string | null> {
  try { return await fs.readFile(filePath, "utf8"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function readReceipt(filePath: string): Promise<WebServiceReceipt | null> {
  const text = await readText(filePath);
  if (!text) return null;
  try { return JSON.parse(text) as WebServiceReceipt; } catch { return null; }
}

async function writeAtomic(filePath: string, content: string): Promise<void> {
  const temporary = `${filePath}.tmp-${randomUUID()}`;
  await fs.writeFile(temporary, content, { encoding: "utf8", mode: 0o644 });
  await fs.rename(temporary, filePath);
}

function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}

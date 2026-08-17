import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const INTEGRATION_OWNER = "goalboard-runtime-integration-v1";
const INSTALLER_OWNER = "goalboard-home-install-v1";

export type SupportedRuntimeId = "codex" | "claude-code";
export type RuntimeIntegrationAction = "connect" | "remove";
export type RuntimeConnectionState =
  | "not_detected"
  | "goalboard_unavailable"
  | "not_connected"
  | "needs_repair"
  | "connected"
  | "conflict";

export interface RuntimeIntegrationDetection {
  runtime_id: SupportedRuntimeId;
  display_name: string;
  executable_path: string | null;
  config_path: string;
  skill_path: string;
  connection_state: RuntimeConnectionState;
  message: string;
}

export interface RuntimeIntegrationChange {
  kind: "runtime_config" | "skill_link" | "ownership_receipt";
  target_path: string;
  operation: "add" | "replace" | "remove";
  before: string;
  after: string;
}

export interface RuntimeIntegrationPlan {
  schema_version: 1;
  plan_id: string;
  plan_hash: string;
  runtime_id: SupportedRuntimeId;
  display_name: string;
  action: RuntimeIntegrationAction;
  status: "ready" | "no_change" | "conflict" | "unavailable";
  changes: RuntimeIntegrationChange[];
  backup_path: string | null;
  confirmation: string;
  alternative: string;
  restart_instructions: string[];
  message: string;
}

export interface RuntimeIntegrationConfirmation {
  runtime_id: SupportedRuntimeId;
  plan_id: string;
  decision: "confirmed" | "declined";
}

export type RuntimeIntegrationResultStatus =
  | "declined"
  | "confirmation_mismatch"
  | "plan_not_found"
  | "unavailable"
  | "conflict"
  | "stale"
  | "connected"
  | "already_connected"
  | "removed"
  | "already_removed"
  | "rolled_back";

export interface RuntimeIntegrationResult {
  status: RuntimeIntegrationResultStatus;
  runtime_id: SupportedRuntimeId;
  plan_id: string;
  backup_path: string | null;
  receipt_path: string | null;
  message: string;
}

export interface RuntimeIntegrationValidationContext {
  runtime_id: SupportedRuntimeId;
  launcher_path: string;
  home_directory: string;
  plan_id: string;
}

export interface RuntimeIntegrationServiceOptions {
  /** GoalBoard-owned home. Defaults to ~/.goalboard. */
  homeDirectory?: string;
  /** User home containing Runtime configuration. Defaults to os.homedir(). */
  userHomeDirectory?: string;
  /** Executable lookup path. Defaults to process.env.PATH. */
  pathEnvironment?: string;
  /** Deterministic executable paths for hosts and tests. null means not installed. */
  runtimeExecutables?: Partial<Record<SupportedRuntimeId, string | null>>;
  /** Defaults to a real MCP initialize/tools-list smoke test. */
  validateConnection?: (context: RuntimeIntegrationValidationContext) => boolean | Promise<boolean>;
}

interface InstalledArtifacts {
  launcherPath: string;
  skillSourcePath: string;
}

interface DesiredConnection {
  runtimeId: SupportedRuntimeId;
  launcherPath: string;
  goalboardHome: string;
}

interface ConfigInspection {
  state: "absent" | "current" | "legacy" | "conflict";
  summary: string;
  entryFingerprint: string | null;
}

interface SkillSnapshot {
  state: "absent" | "current" | "managed" | "conflict";
  signature: string;
  rawLinkTarget: string | null;
  resolvedLinkTarget: string | null;
}

interface RuntimeSnapshot {
  adapter: RuntimeAdapter;
  executablePath: string | null;
  runtimeDetected: boolean;
  artifacts: InstalledArtifacts | null;
  configText: string | null;
  configHash: string | null;
  configInspection: ConfigInspection;
  skill: SkillSnapshot;
}

interface RuntimeAdapter {
  id: SupportedRuntimeId;
  displayName: string;
  executableNames: readonly string[];
  detectionPaths(userHome: string): readonly string[];
  configPath(userHome: string): string;
  skillPath(userHome: string): string;
  desiredConnection(artifacts: InstalledArtifacts, goalboardHome: string): DesiredConnection;
  inspectConfig(contents: string | null, desired: DesiredConnection): ConfigInspection;
  connectConfig(contents: string | null, desired: DesiredConnection): string;
  removeConfig(contents: string | null): string | null;
  restartInstructions: readonly string[];
}

interface IntegrationReceipt {
  schema_version: 1;
  owner: typeof INTEGRATION_OWNER;
  runtime_id: SupportedRuntimeId;
  config_path: string;
  config_entry_fingerprint: string;
  skill_path: string;
  skill_target: string;
  connected_at: string;
}

interface PreparedPlan {
  publicPlan: RuntimeIntegrationPlan;
  adapter: RuntimeAdapter;
  beforeConfigText: string | null;
  beforeConfigHash: string | null;
  beforeSkill: SkillSnapshot;
  nextConfigText: string | null;
  artifacts: InstalledArtifacts | null;
  receipt: IntegrationReceipt | null;
}

export class RuntimeIntegrationError extends Error {
  constructor(
    readonly code:
      | "runtime.unsupported"
      | "runtime.installation_invalid"
      | "runtime.config_invalid"
      | "runtime.plan_invalid"
      | "runtime.receipt_invalid",
    message: string,
  ) {
    super(message);
    this.name = "RuntimeIntegrationError";
  }
}

const CODEX_ADAPTER: RuntimeAdapter = {
  id: "codex",
  displayName: "Codex",
  executableNames: ["codex"],
  detectionPaths: (userHome) => [path.join(userHome, ".codex")],
  configPath: (userHome) => path.join(userHome, ".codex", "config.toml"),
  skillPath: (userHome) => path.join(userHome, ".codex", "skills", "goal-advance"),
  desiredConnection: (artifacts, goalboardHome) => ({
    runtimeId: "codex",
    launcherPath: artifacts.launcherPath,
    goalboardHome,
  }),
  inspectConfig: inspectCodexConfig,
  connectConfig: connectCodexConfig,
  removeConfig: removeCodexConfig,
  restartInstructions: [
    "请新开一个 Codex Session：Codex 只在 Session 启动时读取 MCP 与 Skill 清单，所以当前对话不会动态出现 GoalBoard 工具。",
    "新 Session 可直接复制这句继续：「继续用 GoalBoard」。GoalBoard 会列出当前目录以前用过的项目并请你确认；若要以后自动进入某个项目，请另外明确说“设为这个目录的默认项目”。",
  ],
};

const CLAUDE_CODE_ADAPTER: RuntimeAdapter = {
  id: "claude-code",
  displayName: "Claude Code",
  executableNames: ["claude"],
  detectionPaths: (userHome) => [path.join(userHome, ".claude"), path.join(userHome, ".claude.json")],
  configPath: (userHome) => path.join(userHome, ".claude.json"),
  skillPath: (userHome) => path.join(userHome, ".claude", "skills", "goal-advance"),
  desiredConnection: (artifacts, goalboardHome) => ({
    runtimeId: "claude-code",
    launcherPath: artifacts.launcherPath,
    goalboardHome,
  }),
  inspectConfig: inspectClaudeConfig,
  connectConfig: connectClaudeConfig,
  removeConfig: removeClaudeConfig,
  restartInstructions: [
    "请新开一个 Claude Code Session：Claude Code 只在 Session 启动时读取 MCP 与 Skill 清单，所以当前对话不会动态出现 GoalBoard 工具。",
    "新 Session 可直接复制这句继续：「继续用 GoalBoard」。GoalBoard 会列出当前目录以前用过的项目并请你确认；若要以后自动进入某个项目，请另外明确说“设为这个目录的默认项目”。",
  ],
};

const ADAPTERS: readonly RuntimeAdapter[] = [CODEX_ADAPTER, CLAUDE_CODE_ADAPTER];

/**
 * One shared, in-process control service for Web, MCP, and CLI callers.
 * Prepared plans intentionally live only in memory so public previews never
 * need to contain the user's full Runtime configuration.
 */
export class RuntimeIntegrationService {
  readonly homeDirectory: string;
  readonly userHomeDirectory: string;
  private readonly options: RuntimeIntegrationServiceOptions;
  private readonly preparedPlans = new Map<string, PreparedPlan>();

  constructor(options: RuntimeIntegrationServiceOptions = {}) {
    this.homeDirectory = path.resolve(options.homeDirectory ?? path.join(os.homedir(), ".goalboard"));
    this.userHomeDirectory = path.resolve(options.userHomeDirectory ?? os.homedir());
    this.options = options;
  }

  async detectAll(): Promise<RuntimeIntegrationDetection[]> {
    return Promise.all(ADAPTERS.map((adapter) => this.detect(adapter.id)));
  }

  async detect(runtimeId: SupportedRuntimeId): Promise<RuntimeIntegrationDetection> {
    const snapshot = await this.snapshot(adapterFor(runtimeId));
    const connectionState = connectionStateFor(snapshot);
    return {
      runtime_id: snapshot.adapter.id,
      display_name: snapshot.adapter.displayName,
      executable_path: snapshot.executablePath,
      config_path: snapshot.adapter.configPath(this.userHomeDirectory),
      skill_path: snapshot.adapter.skillPath(this.userHomeDirectory),
      connection_state: connectionState,
      message: detectionMessage(connectionState, snapshot.adapter.displayName),
    };
  }

  async prepare(runtimeId: SupportedRuntimeId, action: RuntimeIntegrationAction): Promise<RuntimeIntegrationPlan> {
    const adapter = adapterFor(runtimeId);
    const snapshot = await this.snapshot(adapter);
    const receipt = await this.readReceipt(adapter.id);
    const prepared = action === "connect"
      ? this.prepareConnect(snapshot, receipt)
      : this.prepareRemove(snapshot, receipt);
    this.preparedPlans.set(prepared.publicPlan.plan_id, prepared);
    return structuredClone(prepared.publicPlan);
  }

  async confirm(confirmation: RuntimeIntegrationConfirmation): Promise<RuntimeIntegrationResult> {
    const prepared = this.preparedPlans.get(confirmation.plan_id);
    if (!prepared) {
      return integrationResult(
        "plan_not_found",
        confirmation.runtime_id,
        confirmation.plan_id,
        null,
        null,
        "找不到这份预览。它可能来自另一个服务进程，请重新生成预览。",
      );
    }
    const plan = prepared.publicPlan;
    if (confirmation.runtime_id !== plan.runtime_id || confirmation.plan_id !== plan.plan_id) {
      return integrationResult(
        "confirmation_mismatch",
        confirmation.runtime_id,
        confirmation.plan_id,
        null,
        null,
        "确认与当前 Runtime 或当前预览不匹配，没有修改配置。",
      );
    }
    if (confirmation.decision === "declined") {
      return integrationResult(
        "declined",
        plan.runtime_id,
        plan.plan_id,
        null,
        null,
        `没有修改 ${plan.display_name}。${plan.alternative}`,
      );
    }
    if (plan.status === "unavailable") {
      return integrationResult("unavailable", plan.runtime_id, plan.plan_id, null, null, plan.message);
    }
    if (plan.status === "conflict") {
      return integrationResult("conflict", plan.runtime_id, plan.plan_id, null, null, plan.message);
    }

    const current = await this.snapshot(prepared.adapter);
    const replay = await this.replayedResult(prepared, current);
    if (replay) return replay;
    if (current.configHash !== prepared.beforeConfigHash || current.skill.signature !== prepared.beforeSkill.signature) {
      return integrationResult(
        "stale",
        plan.runtime_id,
        plan.plan_id,
        null,
        this.receiptPath(plan.runtime_id),
        "Runtime 配置或 Skill 在预览后发生了变化。没有写入，请重新生成预览。",
      );
    }
    if (plan.status === "no_change") {
      const status = plan.action === "connect" ? "already_connected" : "already_removed";
      return integrationResult(status, plan.runtime_id, plan.plan_id, null, this.receiptPath(plan.runtime_id), plan.message);
    }

    const configPath = prepared.adapter.configPath(this.userHomeDirectory);
    const skillPath = prepared.adapter.skillPath(this.userHomeDirectory);
    const backupPath = plan.backup_path;
    let configMutated = false;
    let skillMutated = false;
    try {
      if (prepared.nextConfigText !== prepared.beforeConfigText) {
        if (prepared.beforeConfigText != null && backupPath) {
          await fs.mkdir(path.dirname(backupPath), { recursive: true });
          await writeAtomic(backupPath, prepared.beforeConfigText, await fileModeOrUndefined(configPath));
        }
        await replaceTextFile(configPath, prepared.nextConfigText, await fileModeOrUndefined(configPath));
        configMutated = true;
      }

      if (plan.action === "connect") {
        if (!prepared.artifacts) throw new RuntimeIntegrationError("runtime.installation_invalid", "GoalBoard 安装不可用");
        await replaceSkillLink(skillPath, prepared.artifacts.skillSourcePath, this.homeDirectory);
        skillMutated = prepared.beforeSkill.state !== "current";
      } else {
        await removeExpectedSkillLink(skillPath, prepared.receipt?.skill_target ?? "");
        skillMutated = prepared.beforeSkill.state !== "absent";
      }

      const valid = await this.validateAppliedPlan(prepared);
      if (!valid) throw new Error("Runtime 接入验证未通过");

      if (plan.action === "connect") {
        if (!prepared.artifacts) throw new RuntimeIntegrationError("runtime.installation_invalid", "GoalBoard 安装不可用");
        const inspection = prepared.adapter.inspectConfig(
          prepared.nextConfigText,
          prepared.adapter.desiredConnection(prepared.artifacts, this.homeDirectory),
        );
        if (!inspection.entryFingerprint) throw new Error("无法生成 GoalBoard 配置所有权指纹");
        await this.writeReceipt({
          schema_version: 1,
          owner: INTEGRATION_OWNER,
          runtime_id: plan.runtime_id,
          config_path: configPath,
          config_entry_fingerprint: inspection.entryFingerprint,
          skill_path: skillPath,
          skill_target: prepared.artifacts.skillSourcePath,
          connected_at: new Date().toISOString(),
        });
        return integrationResult(
          "connected",
          plan.runtime_id,
          plan.plan_id,
          backupPath,
          this.receiptPath(plan.runtime_id),
          `${plan.display_name} 已接入 GoalBoard。${plan.restart_instructions.join(" ")}`,
        );
      }

      await fs.rm(this.receiptPath(plan.runtime_id), { force: true });
      return integrationResult(
        "removed",
        plan.runtime_id,
        plan.plan_id,
        backupPath,
        null,
        `${plan.display_name} 的 GoalBoard 接入已移除，其他 Runtime 配置保持不变。`,
      );
    } catch (error) {
      if (configMutated) await replaceTextFile(configPath, prepared.beforeConfigText, await fileModeOrUndefined(configPath));
      if (skillMutated) await restoreSkillSnapshot(skillPath, prepared.beforeSkill);
      const message = error instanceof Error ? error.message : String(error);
      await this.writeAttempt(plan, "rolled_back", message);
      return integrationResult(
        "rolled_back",
        plan.runtime_id,
        plan.plan_id,
        backupPath,
        null,
        `验证失败，已恢复原配置和 Skill：${message}`,
      );
    }
  }

  private prepareConnect(snapshot: RuntimeSnapshot, receipt: IntegrationReceipt | null): PreparedPlan {
    const { adapter } = snapshot;
    const common = this.planCommon(snapshot, "connect");
    if (!snapshot.runtimeDetected) {
      return preparedWithStatus(common, snapshot, receipt, "unavailable", `没有检测到 ${adapter.displayName}，不会修改配置。`);
    }
    if (!snapshot.artifacts) {
      return preparedWithStatus(common, snapshot, receipt, "unavailable", "GoalBoard 本体安装不完整，请先修复安装。" );
    }
    if (snapshot.configInspection.state === "conflict" || snapshot.skill.state === "conflict") {
      return preparedWithStatus(
        common,
        snapshot,
        receipt,
        "conflict",
        "发现同名但不属于 GoalBoard 的配置或 Skill。为避免覆盖用户内容，本次不会写入。",
      );
    }

    const desired = adapter.desiredConnection(snapshot.artifacts, this.homeDirectory);
    const nextConfig = adapter.connectConfig(snapshot.configText, desired);
    const alreadyConnected = snapshot.configInspection.state === "current" && snapshot.skill.state === "current";
    const backupPath = snapshot.configText !== null && nextConfig !== snapshot.configText
      ? this.backupPath(adapter.id, common.planId)
      : null;
    const changes: RuntimeIntegrationChange[] = [];
    if (nextConfig !== snapshot.configText) {
      changes.push({
        kind: "runtime_config",
        target_path: adapter.configPath(this.userHomeDirectory),
        operation: snapshot.configInspection.state === "absent" ? "add" : "replace",
        before: snapshot.configInspection.summary,
        after: `GoalBoard MCP（命令 ${snapshot.artifacts.launcherPath}；环境仅含 GOALBOARD_HOME、GOALBOARD_MCP_AUDIENCE、GOALBOARD_RUNTIME_ID）`,
      });
    }
    if (snapshot.skill.state !== "current") {
      changes.push({
        kind: "skill_link",
        target_path: adapter.skillPath(this.userHomeDirectory),
        operation: snapshot.skill.state === "absent" ? "add" : "replace",
        before: skillSummary(snapshot.skill),
        after: `链接到 ${snapshot.artifacts.skillSourcePath}`,
      });
    }
    if (!alreadyConnected || !receipt) {
      changes.push({
        kind: "ownership_receipt",
        target_path: this.receiptPath(adapter.id),
        operation: receipt ? "replace" : "add",
        before: receipt ? "已有 GoalBoard 所有权收据" : "无",
        after: "记录 GoalBoard 写入的字段指纹和 Skill 链接，不保存用户配置内容",
      });
    }

    const publicPlan = this.publicPlan(common, alreadyConnected && receipt ? "no_change" : "ready", changes, backupPath,
      alreadyConnected && receipt ? `${adapter.displayName} 已经接入，无需重复写入。` : `准备接入 ${adapter.displayName}。`);
    return {
      publicPlan,
      adapter,
      beforeConfigText: snapshot.configText,
      beforeConfigHash: snapshot.configHash,
      beforeSkill: snapshot.skill,
      nextConfigText: nextConfig,
      artifacts: snapshot.artifacts,
      receipt,
    };
  }

  private prepareRemove(snapshot: RuntimeSnapshot, receipt: IntegrationReceipt | null): PreparedPlan {
    const { adapter } = snapshot;
    const common = this.planCommon(snapshot, "remove");
    const hasGoalBoardState = snapshot.configInspection.state !== "absent" || snapshot.skill.state !== "absent";
    if (!receipt) {
      const status = hasGoalBoardState ? "conflict" : "no_change";
      const message = hasGoalBoardState
        ? "现有 GoalBoard 配置没有统一接入服务的所有权收据，不能自动删除。可先完成一次接入修复，再从同一入口移除。"
        : `${adapter.displayName} 没有由 GoalBoard 管理的接入。`;
      return preparedWithStatus(common, snapshot, receipt, status, message);
    }
    if (
      receipt.config_path !== adapter.configPath(this.userHomeDirectory)
      || receipt.skill_path !== adapter.skillPath(this.userHomeDirectory)
      || snapshot.configInspection.entryFingerprint !== receipt.config_entry_fingerprint
      || snapshot.skill.resolvedLinkTarget !== path.resolve(receipt.skill_target)
    ) {
      return preparedWithStatus(
        common,
        snapshot,
        receipt,
        "conflict",
        "GoalBoard 接入后相关配置或 Skill 已被改动。为避免删除用户修改，本次不会移除。",
      );
    }

    const nextConfig = adapter.removeConfig(snapshot.configText);
    const backupPath = snapshot.configText !== null && nextConfig !== snapshot.configText
      ? this.backupPath(adapter.id, common.planId)
      : null;
    const changes: RuntimeIntegrationChange[] = [
      {
        kind: "runtime_config",
        target_path: adapter.configPath(this.userHomeDirectory),
        operation: "remove",
        before: snapshot.configInspection.summary,
        after: "只移除 GoalBoard MCP entry，保留其他 Runtime 配置",
      },
      {
        kind: "skill_link",
        target_path: adapter.skillPath(this.userHomeDirectory),
        operation: "remove",
        before: skillSummary(snapshot.skill),
        after: "移除 GoalBoard 创建的 Skill 链接",
      },
      {
        kind: "ownership_receipt",
        target_path: this.receiptPath(adapter.id),
        operation: "remove",
        before: "GoalBoard 所有权收据",
        after: "无",
      },
    ];
    return {
      publicPlan: this.publicPlan(common, "ready", changes, backupPath, `准备移除 ${adapter.displayName} 的 GoalBoard 接入。`),
      adapter,
      beforeConfigText: snapshot.configText,
      beforeConfigHash: snapshot.configHash,
      beforeSkill: snapshot.skill,
      nextConfigText: nextConfig,
      artifacts: snapshot.artifacts,
      receipt,
    };
  }

  private planCommon(snapshot: RuntimeSnapshot, action: RuntimeIntegrationAction): {
    planId: string;
    planHash: string;
    adapter: RuntimeAdapter;
    action: RuntimeIntegrationAction;
  } {
    const payload = {
      owner: INTEGRATION_OWNER,
      runtime_id: snapshot.adapter.id,
      action,
      config_path: snapshot.adapter.configPath(this.userHomeDirectory),
      config_hash: snapshot.configHash,
      skill_path: snapshot.adapter.skillPath(this.userHomeDirectory),
      skill_signature: snapshot.skill.signature,
      launcher_path: snapshot.artifacts?.launcherPath ?? null,
      skill_source_path: snapshot.artifacts?.skillSourcePath ?? null,
    };
    const planHash = digest(JSON.stringify(payload));
    return {
      planId: `runtime-integration-${planHash.slice(0, 24)}`,
      planHash,
      adapter: snapshot.adapter,
      action,
    };
  }

  private publicPlan(
    common: { planId: string; planHash: string; adapter: RuntimeAdapter; action: RuntimeIntegrationAction },
    status: RuntimeIntegrationPlan["status"],
    changes: RuntimeIntegrationChange[],
    backupPath: string | null,
    message: string,
  ): RuntimeIntegrationPlan {
    const verb = common.action === "connect" ? "接入" : "移除接入";
    return {
      schema_version: 1,
      plan_id: common.planId,
      plan_hash: common.planHash,
      runtime_id: common.adapter.id,
      display_name: common.adapter.displayName,
      action: common.action,
      status,
      changes,
      backup_path: backupPath,
      confirmation: `确认${verb} ${common.adapter.displayName}`,
      alternative: "可以保持当前状态，稍后再从设置页操作；GoalBoard 本体和已有项目不会受影响。",
      restart_instructions: [...common.adapter.restartInstructions],
      message,
    };
  }

  private async snapshot(adapter: RuntimeAdapter): Promise<RuntimeSnapshot> {
    const executablePath = await this.findRuntimeExecutable(adapter);
    const runtimeDetected = executablePath != null || await anyPathExists(adapter.detectionPaths(this.userHomeDirectory));
    const artifacts = await this.installedArtifacts();
    const configPath = adapter.configPath(this.userHomeDirectory);
    const configText = await readTextOrNull(configPath);
    const inspectionArtifacts = artifacts ?? {
      launcherPath: path.join(this.homeDirectory, "bin", "goalboard-mcp"),
      skillSourcePath: path.join(this.homeDirectory, "releases", "missing", "skills", "goal-advance"),
    };
    const desired = adapter.desiredConnection(inspectionArtifacts, this.homeDirectory);
    let configInspection: ConfigInspection;
    try {
      configInspection = adapter.inspectConfig(configText, desired);
    } catch (error) {
      configInspection = {
        state: "conflict",
        summary: error instanceof Error ? error.message : String(error),
        entryFingerprint: null,
      };
    }
    const skill = await inspectSkillLink(adapter.skillPath(this.userHomeDirectory), artifacts?.skillSourcePath ?? null, this.homeDirectory);
    return {
      adapter,
      executablePath,
      runtimeDetected,
      artifacts,
      configText,
      configHash: configText == null ? null : digest(configText),
      configInspection,
      skill,
    };
  }

  private async installedArtifacts(): Promise<InstalledArtifacts | null> {
    const manifestPath = path.join(this.homeDirectory, "config", "installation.json");
    const text = await readTextOrNull(manifestPath);
    if (text == null) return null;
    try {
      const manifest = JSON.parse(text) as { installer?: unknown; release_path?: unknown };
      if (manifest.installer !== INSTALLER_OWNER || typeof manifest.release_path !== "string") return null;
      const releasePath = path.resolve(this.homeDirectory, manifest.release_path);
      if (!isInside(this.homeDirectory, releasePath)) return null;
      const launcherPath = path.join(this.homeDirectory, "bin", "goalboard-mcp");
      const skillSourcePath = path.join(releasePath, "skills", "goal-advance");
      const [launcher, skill] = await Promise.all([pathState(launcherPath), pathState(skillSourcePath)]);
      if (!launcher?.isFile() || !skill?.isDirectory()) return null;
      return { launcherPath, skillSourcePath };
    } catch {
      return null;
    }
  }

  private async findRuntimeExecutable(adapter: RuntimeAdapter): Promise<string | null> {
    if (Object.prototype.hasOwnProperty.call(this.options.runtimeExecutables ?? {}, adapter.id)) {
      const configured = this.options.runtimeExecutables?.[adapter.id];
      if (!configured) return null;
      return await canExecute(configured) ? path.resolve(configured) : null;
    }
    const pathEnvironment = this.options.pathEnvironment ?? process.env.PATH ?? "";
    for (const directory of pathEnvironment.split(path.delimiter).filter(Boolean)) {
      for (const executable of adapter.executableNames) {
        const candidate = path.resolve(directory, executable);
        if (await canExecute(candidate)) return candidate;
      }
    }
    return null;
  }

  private async validateAppliedPlan(prepared: PreparedPlan): Promise<boolean> {
    const plan = prepared.publicPlan;
    const current = await this.snapshot(prepared.adapter);
    if (plan.action === "remove") {
      return current.configInspection.state === "absent" && current.skill.state === "absent";
    }
    if (!prepared.artifacts || current.configInspection.state !== "current" || current.skill.state !== "current") {
      return false;
    }
    const validate = this.options.validateConnection ?? validateGoalBoardMcpLauncher;
    return Boolean(await validate({
      runtime_id: plan.runtime_id,
      launcher_path: prepared.artifacts.launcherPath,
      home_directory: this.homeDirectory,
      plan_id: plan.plan_id,
    }));
  }

  private async replayedResult(prepared: PreparedPlan, current: RuntimeSnapshot): Promise<RuntimeIntegrationResult | null> {
    const plan = prepared.publicPlan;
    const receipt = await this.readReceipt(plan.runtime_id);
    if (plan.action === "connect") {
      if (current.configInspection.state === "current" && current.skill.state === "current" && receipt) {
        return integrationResult(
          "already_connected",
          plan.runtime_id,
          plan.plan_id,
          null,
          this.receiptPath(plan.runtime_id),
          `${plan.display_name} 已经接入，无重复写入。`,
        );
      }
      return null;
    }
    if (current.configInspection.state === "absent" && current.skill.state === "absent" && !receipt) {
      return integrationResult("already_removed", plan.runtime_id, plan.plan_id, null, null, `${plan.display_name} 接入已经移除。`);
    }
    return null;
  }

  private receiptPath(runtimeId: SupportedRuntimeId): string {
    return path.join(this.homeDirectory, "runtime-integrations", `${runtimeId}.json`);
  }

  private backupPath(runtimeId: SupportedRuntimeId, planId: string): string {
    return path.join(this.homeDirectory, "runtime-config-backups", runtimeId, `${planId}.bak`);
  }

  private async readReceipt(runtimeId: SupportedRuntimeId): Promise<IntegrationReceipt | null> {
    const filePath = this.receiptPath(runtimeId);
    const text = await readTextOrNull(filePath);
    if (text == null) return null;
    try {
      const receipt = JSON.parse(text) as IntegrationReceipt;
      if (receipt.owner !== INTEGRATION_OWNER || receipt.schema_version !== 1 || receipt.runtime_id !== runtimeId) {
        throw new Error("owner mismatch");
      }
      return receipt;
    } catch {
      throw new RuntimeIntegrationError("runtime.receipt_invalid", `GoalBoard 接入收据无法解析: ${filePath}`);
    }
  }

  private async writeReceipt(receipt: IntegrationReceipt): Promise<void> {
    await writeAtomic(this.receiptPath(receipt.runtime_id), `${JSON.stringify(receipt, null, 2)}\n`);
  }

  private async writeAttempt(plan: RuntimeIntegrationPlan, status: "rolled_back", message: string): Promise<void> {
    const filePath = path.join(this.homeDirectory, "runtime-integration-attempts", `${plan.plan_id}-${randomUUID()}.json`);
    await writeAtomic(filePath, `${JSON.stringify({
      schema_version: 1,
      owner: INTEGRATION_OWNER,
      plan_id: plan.plan_id,
      runtime_id: plan.runtime_id,
      action: plan.action,
      status,
      message,
      recorded_at: new Date().toISOString(),
    }, null, 2)}\n`);
  }
}

function adapterFor(runtimeId: SupportedRuntimeId): RuntimeAdapter {
  const adapter = ADAPTERS.find((candidate) => candidate.id === runtimeId);
  if (!adapter) throw new RuntimeIntegrationError("runtime.unsupported", `尚未支持 Runtime: ${runtimeId}`);
  return adapter;
}

function connectionStateFor(snapshot: RuntimeSnapshot): RuntimeConnectionState {
  if (!snapshot.runtimeDetected) return "not_detected";
  if (!snapshot.artifacts) return "goalboard_unavailable";
  if (snapshot.configInspection.state === "conflict" || snapshot.skill.state === "conflict") return "conflict";
  if (snapshot.configInspection.state === "current" && snapshot.skill.state === "current") return "connected";
  if (snapshot.configInspection.state === "absent" && snapshot.skill.state === "absent") return "not_connected";
  return "needs_repair";
}

function detectionMessage(state: RuntimeConnectionState, displayName: string): string {
  if (state === "not_detected") return `未检测到 ${displayName}`;
  if (state === "goalboard_unavailable") return "GoalBoard 本体安装不完整";
  if (state === "not_connected") return `${displayName} 未接入`;
  if (state === "needs_repair") return `${displayName} 接入需要修复`;
  if (state === "connected") return `${displayName} 已接入`;
  return `${displayName} 存在同名配置冲突`;
}

function preparedWithStatus(
  common: { planId: string; planHash: string; adapter: RuntimeAdapter; action: RuntimeIntegrationAction },
  snapshot: RuntimeSnapshot,
  receipt: IntegrationReceipt | null,
  status: RuntimeIntegrationPlan["status"],
  message: string,
): PreparedPlan {
  const verb = common.action === "connect" ? "接入" : "移除接入";
  return {
    publicPlan: {
      schema_version: 1,
      plan_id: common.planId,
      plan_hash: common.planHash,
      runtime_id: common.adapter.id,
      display_name: common.adapter.displayName,
      action: common.action,
      status,
      changes: [],
      backup_path: null,
      confirmation: `确认${verb} ${common.adapter.displayName}`,
      alternative: "可以保持当前状态，稍后再从设置页操作；GoalBoard 本体和已有项目不会受影响。",
      restart_instructions: [...common.adapter.restartInstructions],
      message,
    },
    adapter: common.adapter,
    beforeConfigText: snapshot.configText,
    beforeConfigHash: snapshot.configHash,
    beforeSkill: snapshot.skill,
    nextConfigText: snapshot.configText,
    artifacts: snapshot.artifacts,
    receipt,
  };
}

function integrationResult(
  status: RuntimeIntegrationResultStatus,
  runtimeId: SupportedRuntimeId,
  planId: string,
  backupPath: string | null,
  receiptPath: string | null,
  message: string,
): RuntimeIntegrationResult {
  return { status, runtime_id: runtimeId, plan_id: planId, backup_path: backupPath, receipt_path: receiptPath, message };
}

function skillSummary(skill: SkillSnapshot): string {
  if (skill.state === "absent") return "未安装 GoalBoard Skill";
  if (skill.state === "current") return "当前 GoalBoard Skill 链接";
  if (skill.state === "managed") return "旧版 GoalBoard Skill 链接";
  return "同名但不属于 GoalBoard 的 Skill";
}

async function inspectSkillLink(targetPath: string, desiredTarget: string | null, goalboardHome: string): Promise<SkillSnapshot> {
  let state: Awaited<ReturnType<typeof fs.lstat>> | null;
  try {
    state = await fs.lstat(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { state: "absent", signature: "absent", rawLinkTarget: null, resolvedLinkTarget: null };
    }
    throw error;
  }
  if (!state.isSymbolicLink()) {
    return { state: "conflict", signature: `conflict:${state.mode}:${state.size}`, rawLinkTarget: null, resolvedLinkTarget: null };
  }
  const rawLinkTarget = await fs.readlink(targetPath);
  const resolvedLinkTarget = path.resolve(path.dirname(targetPath), rawLinkTarget);
  const current = desiredTarget != null && resolvedLinkTarget === path.resolve(desiredTarget);
  const managed = isInside(goalboardHome, resolvedLinkTarget)
    && path.basename(resolvedLinkTarget) === "goal-advance"
    && path.basename(path.dirname(resolvedLinkTarget)) === "skills";
  return {
    state: current ? "current" : managed ? "managed" : "conflict",
    signature: `symlink:${rawLinkTarget}`,
    rawLinkTarget,
    resolvedLinkTarget,
  };
}

async function replaceSkillLink(targetPath: string, sourcePath: string, goalboardHome: string): Promise<void> {
  const current = await inspectSkillLink(targetPath, sourcePath, goalboardHome);
  if (current.state === "current") return;
  if (current.state === "conflict") throw new Error(`不会覆盖未知 Skill: ${targetPath}`);
  if (current.state === "managed") await fs.unlink(targetPath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.symlink(sourcePath, targetPath, "dir");
}

async function removeExpectedSkillLink(targetPath: string, expectedTarget: string): Promise<void> {
  const snapshot = await inspectSkillLink(targetPath, expectedTarget, path.dirname(path.dirname(expectedTarget)));
  if (snapshot.state === "absent") return;
  if (snapshot.state !== "current") throw new Error(`Skill 已被用户修改，不会删除: ${targetPath}`);
  await fs.unlink(targetPath);
}

async function restoreSkillSnapshot(targetPath: string, snapshot: SkillSnapshot): Promise<void> {
  try {
    const state = await fs.lstat(targetPath);
    if (state.isSymbolicLink()) await fs.unlink(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (snapshot.rawLinkTarget != null) {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.symlink(snapshot.rawLinkTarget, targetPath, "dir");
  }
}

function desiredCodexFamily(desired: DesiredConnection): string {
  return [
    "[mcp_servers.goalboard]",
    `command = ${tomlString(desired.launcherPath)}`,
    "",
    "[mcp_servers.goalboard.env]",
    `GOALBOARD_HOME = ${tomlString(desired.goalboardHome)}`,
    `GOALBOARD_MCP_AUDIENCE = ${tomlString("runtime")}`,
    `GOALBOARD_RUNTIME_ID = ${tomlString(desired.runtimeId)}`,
  ].join("\n");
}

function inspectCodexConfig(contents: string | null, desired: DesiredConnection): ConfigInspection {
  if (contents == null) return { state: "absent", summary: "未配置 GoalBoard MCP", entryFingerprint: null };
  const family = extractTomlFamily(contents, "mcp_servers.goalboard");
  if (!family) return { state: "absent", summary: "未配置 GoalBoard MCP", entryFingerprint: null };
  const expected = desiredCodexFamily(desired);
  if (normalizeBlock(family.text) === normalizeBlock(expected)) {
    return { state: "current", summary: "当前 GoalBoard MCP 配置", entryFingerprint: digest(normalizeBlock(expected)) };
  }
  const familyBody = family.text.replace(/^\s*\[[^\]\r\n]+\]\s*(?:#.*)?$/gm, "");
  if (/GOALBOARD_|(?:command|args)\s*=.*goalboard/i.test(familyBody)) {
    return { state: "legacy", summary: "旧版 GoalBoard MCP 配置", entryFingerprint: digest(normalizeBlock(family.text)) };
  }
  return { state: "conflict", summary: "同名 MCP entry 不属于 GoalBoard", entryFingerprint: digest(normalizeBlock(family.text)) };
}

function connectCodexConfig(contents: string | null, desired: DesiredConnection): string {
  return replaceTomlFamily(contents ?? "", "mcp_servers.goalboard", desiredCodexFamily(desired));
}

function removeCodexConfig(contents: string | null): string | null {
  if (contents == null) return null;
  return replaceTomlFamily(contents, "mcp_servers.goalboard", null);
}

function extractTomlFamily(contents: string, familyName: string): { text: string; ranges: Array<[number, number]> } | null {
  const header = /^\s*\[([^\]\r\n]+)\]\s*(?:#.*)?$/gm;
  const matches = [...contents.matchAll(header)];
  const ranges: Array<[number, number]> = [];
  for (let index = 0; index < matches.length; index += 1) {
    const name = matches[index][1].trim();
    if (name !== familyName && !name.startsWith(`${familyName}.`)) continue;
    ranges.push([matches[index].index!, matches[index + 1]?.index ?? contents.length]);
  }
  if (ranges.length === 0) return null;
  return { text: ranges.map(([start, end]) => contents.slice(start, end)).join("\n"), ranges };
}

function replaceTomlFamily(contents: string, familyName: string, replacement: string | null): string {
  const family = extractTomlFamily(contents, familyName);
  let next = contents;
  let insertionIndex = contents.length;
  if (family) {
    insertionIndex = family.ranges[0][0];
    for (const [start, end] of [...family.ranges].reverse()) next = next.slice(0, start) + next.slice(end);
  }
  if (replacement == null) return normalizeTrailingNewline(next);
  const before = next.slice(0, insertionIndex).replace(/[ \t]+$/gm, "").replace(/\s*$/, "");
  const after = next.slice(insertionIndex).replace(/^\s*/, "");
  return `${before}${before ? "\n\n" : ""}${replacement.trim()}${after ? `\n\n${after}` : "\n"}`;
}

function desiredClaudeEntry(desired: DesiredConnection): Record<string, unknown> {
  return {
    type: "stdio",
    command: desired.launcherPath,
    args: [],
    env: {
      GOALBOARD_HOME: desired.goalboardHome,
      GOALBOARD_MCP_AUDIENCE: "runtime",
      GOALBOARD_RUNTIME_ID: desired.runtimeId,
    },
  };
}

function inspectClaudeConfig(contents: string | null, desired: DesiredConnection): ConfigInspection {
  if (contents == null) return { state: "absent", summary: "未配置 GoalBoard MCP", entryFingerprint: null };
  const root = parseJsonObject(contents, "Claude Code 用户配置");
  const servers = objectOrEmpty(root.mcpServers);
  const entry = servers.goalboard;
  if (entry == null) return { state: "absent", summary: "未配置 GoalBoard MCP", entryFingerprint: null };
  const expected = desiredClaudeEntry(desired);
  if (canonicalJson(entry) === canonicalJson(expected)) {
    return { state: "current", summary: "当前 GoalBoard MCP 配置", entryFingerprint: digest(canonicalJson(expected)) };
  }
  if (/goalboard|GOALBOARD_/i.test(canonicalJson(entry))) {
    return { state: "legacy", summary: "旧版 GoalBoard MCP 配置", entryFingerprint: digest(canonicalJson(entry)) };
  }
  return { state: "conflict", summary: "同名 MCP entry 不属于 GoalBoard", entryFingerprint: digest(canonicalJson(entry)) };
}

function connectClaudeConfig(contents: string | null, desired: DesiredConnection): string {
  const root = contents == null ? {} : parseJsonObject(contents, "Claude Code 用户配置");
  const servers = { ...objectOrEmpty(root.mcpServers), goalboard: desiredClaudeEntry(desired) };
  return replaceTopLevelJsonProperty(contents, root, "mcpServers", servers);
}

function removeClaudeConfig(contents: string | null): string | null {
  if (contents == null) return null;
  const root = parseJsonObject(contents, "Claude Code 用户配置");
  const servers = { ...objectOrEmpty(root.mcpServers) };
  delete servers.goalboard;
  return replaceTopLevelJsonProperty(contents, root, "mcpServers", servers);
}

function replaceTopLevelJsonProperty(
  original: string | null,
  root: Record<string, unknown>,
  key: string,
  value: unknown,
): string {
  if (original == null) return `${JSON.stringify({ ...root, [key]: value }, null, 2)}\n`;
  const span = findTopLevelJsonValueSpan(original, key);
  if (span) return original.slice(0, span[0]) + JSON.stringify(value) + original.slice(span[1]);
  return `${JSON.stringify({ ...root, [key]: value }, null, detectJsonIndent(original))}${original.endsWith("\n") ? "\n" : ""}`;
}

function findTopLevelJsonValueSpan(contents: string, requestedKey: string): [number, number] | null {
  let index = skipWhitespace(contents, 0);
  if (contents[index] !== "{") return null;
  index += 1;
  while (index < contents.length) {
    index = skipWhitespace(contents, index);
    if (contents[index] === "}") return null;
    if (contents[index] !== '"') return null;
    const keyEnd = scanJsonString(contents, index);
    const key = JSON.parse(contents.slice(index, keyEnd)) as string;
    index = skipWhitespace(contents, keyEnd);
    if (contents[index] !== ":") return null;
    const valueStart = skipWhitespace(contents, index + 1);
    const valueEnd = scanJsonValue(contents, valueStart);
    if (key === requestedKey) return [valueStart, valueEnd];
    index = skipWhitespace(contents, valueEnd);
    if (contents[index] === ",") {
      index += 1;
      continue;
    }
    if (contents[index] === "}") return null;
    return null;
  }
  return null;
}

function scanJsonString(contents: string, start: number): number {
  let escaped = false;
  for (let index = start + 1; index < contents.length; index += 1) {
    const character = contents[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') return index + 1;
  }
  throw new RuntimeIntegrationError("runtime.config_invalid", "JSON 字符串没有结束");
}

function scanJsonValue(contents: string, start: number): number {
  const first = contents[start];
  if (first === '"') return scanJsonString(contents, start);
  if (first === "{" || first === "[") {
    const stack = [first];
    let inString = false;
    let escaped = false;
    for (let index = start + 1; index < contents.length; index += 1) {
      const character = contents[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{" || character === "[") stack.push(character);
      else if (character === "}" || character === "]") {
        stack.pop();
        if (stack.length === 0) return index + 1;
      }
    }
    throw new RuntimeIntegrationError("runtime.config_invalid", "JSON 值没有结束");
  }
  let index = start;
  while (index < contents.length && !/[\s,}]/.test(contents[index])) index += 1;
  return index;
}

function parseJsonObject(contents: string, label: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(contents) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return parsed as Record<string, unknown>;
  } catch {
    throw new RuntimeIntegrationError("runtime.config_invalid", `${label}不是有效 JSON，不会修改`);
  }
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function detectJsonIndent(contents: string): number {
  const match = contents.match(/\n( +)"/);
  return match ? Math.min(match[1].length, 8) : 2;
}

function skipWhitespace(contents: string, start: number): number {
  let index = start;
  while (index < contents.length && /\s/.test(contents[index])) index += 1;
  return index;
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function normalizeBlock(value: string): string {
  return value.trim().replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

function normalizeTrailingNewline(value: string): string {
  const trimmed = value.replace(/[ \t]+$/gm, "").replace(/\s+$/, "");
  return trimmed ? `${trimmed}\n` : "";
}

async function validateGoalBoardMcpLauncher(context: RuntimeIntegrationValidationContext): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(context.launcher_path, [], {
      env: {
        ...process.env,
        GOALBOARD_HOME: context.home_directory,
        GOALBOARD_MCP_AUDIENCE: "runtime",
        GOALBOARD_RUNTIME_ID: context.runtime_id,
        GOALBOARD_WORK_CONTEXT_ID: `integration-validation-${context.plan_id}`,
        GOALBOARD_WORK_CONTEXT_STABLE: "true",
      },
      stdio: ["pipe", "pipe", "ignore"],
    });
    let settled = false;
    let buffer = "";
    const finish = (valid: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      resolve(valid);
    };
    const timer = setTimeout(() => finish(false), 3_000);
    child.on("error", () => finish(false));
    child.on("exit", () => finish(false));
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines.filter(Boolean)) {
        try {
          const message = JSON.parse(line) as { id?: number; result?: { tools?: unknown[] } };
          if (message.id === 1) {
            child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`);
          } else if (message.id === 2 && Array.isArray(message.result?.tools)) {
            finish(true);
          }
        } catch {
          finish(false);
        }
      }
    });
    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "goalboard-validator", version: "1" } },
    })}\n`);
  });
}

async function replaceTextFile(filePath: string, contents: string | null, mode?: number): Promise<void> {
  if (contents == null) {
    await fs.rm(filePath, { force: true });
    return;
  }
  await writeAtomic(filePath, contents, mode);
}

async function writeAtomic(filePath: string, contents: string, mode?: number): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${randomUUID()}`;
  await fs.writeFile(temporaryPath, contents, mode == null ? undefined : { mode });
  try {
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
}

async function readTextOrNull(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function fileModeOrUndefined(filePath: string): Promise<number | undefined> {
  try {
    return (await fs.stat(filePath)).mode;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function pathState(filePath: string): Promise<Awaited<ReturnType<typeof fs.stat>> | null> {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function anyPathExists(paths: readonly string[]): Promise<boolean> {
  const states = await Promise.all(paths.map((filePath) => pathState(filePath)));
  return states.some((state) => state != null);
}

async function canExecute(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

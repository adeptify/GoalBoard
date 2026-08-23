import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { GoalBoardProjectRecord } from "../projects/catalog.js";
import { withGoalBoardProjectCatalog } from "../projects/catalog-session.js";
import {
  RuntimeIntegrationService,
  SUPPORTED_RUNTIME_IDS,
  type RuntimeIntegrationPlan,
} from "./runtime-integration.js";
import {
  GoalBoardWebServiceManager,
  type GoalBoardWebServicePlan,
} from "./web-service.js";
import { WEB_CONTROL_TOKEN_RELATIVE_PATH } from "../web/control-token.js";

const HOME_OWNER = "goalboard-home-install-v1";
const OWNED_LAUNCHER_HEADERS = [
  "#!/usr/bin/env node\n// goalboard-home-launcher-v1",
  "#!/bin/sh\n# goalboard-home-launcher-v2",
] as const;
const UNINSTALL_OWNER = "goalboard-uninstall-v1";

export interface GoalBoardUninstallChange {
  kind: "runtime" | "web_service" | "demo" | "launcher" | "release" | "install_manifest" | "user_data";
  target: string;
  description: string;
}

export interface GoalBoardUninstallPlan {
  plan_id: string;
  status: "ready" | "no_change" | "conflict";
  home_directory: string;
  purge_user_data: boolean;
  user_project_count: number;
  demo_project_count: number;
  changes: GoalBoardUninstallChange[];
  preserved_paths: string[];
  conflicts: string[];
  confirmation: string;
  message: string;
}

export interface GoalBoardUninstallResult {
  status: "uninstalled" | "purged" | "unchanged" | "declined";
  home_directory: string;
  removed_paths: string[];
  preserved_paths: string[];
  receipt_path: string | null;
  message: string;
}

export interface GoalBoardUninstallServiceOptions {
  homeDirectory?: string;
  runtimeIntegrationService?: RuntimeIntegrationService;
  webServiceManager?: GoalBoardWebServiceManager;
}

interface PreparedUninstallPlan {
  publicPlan: GoalBoardUninstallPlan;
  snapshotHash: string;
  runtimePlans: RuntimeIntegrationPlan[];
  webPlan: GoalBoardWebServicePlan;
  ownedPaths: string[];
  purgeDataPaths: string[];
  snapshotPaths: string[];
  demoProjectIds: string[];
}

interface CatalogInspection {
  projects: GoalBoardProjectRecord[];
  conflict: string | null;
}

interface UninstallReceipt {
  schema_version: 1;
  owner: typeof UNINSTALL_OWNER;
  plan_id: string;
  home_directory: string;
  purge_user_data: boolean;
  preserved_projects: Array<{ project_id: string; display_name: string; data_class: string }>;
  completed_steps: string[];
  removed_paths: string[];
  state: "in_progress" | "complete" | "failed";
  error: string | null;
  updated_at: string;
}

export class GoalBoardUninstallError extends Error {
  constructor(
    readonly code:
      | "uninstall.plan_missing"
      | "uninstall.plan_stale"
      | "uninstall.conflict"
      | "uninstall.purge_confirmation_required"
      | "uninstall.step_failed",
    message: string,
  ) {
    super(message);
    this.name = "GoalBoardUninstallError";
  }
}

export class GoalBoardUninstallService {
  readonly homeDirectory: string;
  readonly receiptPath: string;
  private readonly runtimeIntegrations: RuntimeIntegrationService;
  private readonly webService: GoalBoardWebServiceManager;
  private readonly plans = new Map<string, PreparedUninstallPlan>();

  constructor(options: GoalBoardUninstallServiceOptions = {}) {
    this.homeDirectory = path.resolve(options.homeDirectory ?? path.join(os.homedir(), ".goalboard"));
    this.receiptPath = path.join(this.homeDirectory, "config", "uninstall.json");
    this.runtimeIntegrations = options.runtimeIntegrationService
      ?? new RuntimeIntegrationService({ homeDirectory: this.homeDirectory });
    this.webService = options.webServiceManager
      ?? new GoalBoardWebServiceManager({ homeDirectory: this.homeDirectory });
  }

  async prepare(options: { purge_user_data?: boolean } = {}): Promise<GoalBoardUninstallPlan> {
    const purgeUserData = options.purge_user_data === true;
    const catalog = await inspectCatalog(this.homeDirectory);
    const runtimePlans = await Promise.all(
      SUPPORTED_RUNTIME_IDS
        .map((runtimeId) => this.runtimeIntegrations.prepare(runtimeId, "remove")),
    );
    const webPlan = await this.webService.prepare("remove");
    const assets = await inspectOwnedHomeAssets(this.homeDirectory);
    const conflicts = [
      ...(catalog.conflict ? [catalog.conflict] : []),
      ...assets.conflicts,
      ...runtimePlans.filter((plan) => plan.status === "conflict").map((plan) => plan.message),
      ...(webPlan.status === "conflict" ? [webPlan.message] : []),
    ];
    const demos = catalog.projects.filter((project) => project.data_class === "regenerable_demo");
    const userProjects = catalog.projects.filter((project) => project.data_class !== "regenerable_demo");
    const purgeDataPaths = purgeUserData
      ? await existingPaths([
        path.join(this.homeDirectory, "projects"),
        path.join(this.homeDirectory, "backups"),
        path.join(this.homeDirectory, "logs"),
        path.join(this.homeDirectory, "runtime-config-backups"),
        path.join(this.homeDirectory, "runtime-integrations"),
      ])
      : [];
    const changes: GoalBoardUninstallChange[] = [
      ...runtimePlans.flatMap((plan) => plan.status === "ready"
        ? [{ kind: "runtime" as const, target: plan.display_name, description: `移除 GoalBoard 创建的 ${plan.display_name} 接入` }]
        : []),
      ...(webPlan.status === "ready"
        ? [{ kind: "web_service" as const, target: webPlan.detection.plist_path, description: "停止并移除 GoalBoard 常驻 Web 服务" }]
        : []),
      ...demos.map((project) => ({ kind: "demo" as const, target: project.project_id, description: `删除可重建演示项目：${project.display_name}` })),
      ...assets.ownedPaths.map((ownedPath) => ({
        kind: assetKind(ownedPath),
        target: ownedPath,
        description: `移除 GoalBoard 自有${assetKindLabel(assetKind(ownedPath))}`,
      })),
      ...purgeDataPaths.map((dataPath) => ({
        kind: "user_data" as const,
        target: dataPath,
        description: dataPath === path.join(this.homeDirectory, "projects")
          ? `永久删除 ${userProjects.length} 个用户项目及 catalog`
          : `永久删除 GoalBoard 生成的 ${path.basename(dataPath)}`,
      })),
    ];
    const preservedPaths = purgeUserData
      ? []
      : [path.join(this.homeDirectory, "projects"), path.join(this.homeDirectory, "backups"), path.join(this.homeDirectory, "logs")];
    const status = conflicts.length > 0 ? "conflict" : changes.length > 0 ? "ready" : "no_change";
    const plan: GoalBoardUninstallPlan = {
      plan_id: `uninstall-plan-${randomUUID()}`,
      status,
      home_directory: this.homeDirectory,
      purge_user_data: purgeUserData,
      user_project_count: userProjects.length,
      demo_project_count: demos.length,
      changes,
      preserved_paths: preservedPaths,
      conflicts,
      confirmation: purgeUserData
        ? `永久清除 ${this.homeDirectory} 中的 ${userProjects.length} 个用户项目；必须再次提供完全相同的目录和项目数量`
        : "卸载 GoalBoard 程序和自有接入；保留用户项目、catalog、备份与日志",
      message: status === "conflict"
        ? "发现不再符合 GoalBoard 所有权收据的配置；没有执行卸载"
        : status === "no_change"
          ? "没有需要卸载的 GoalBoard 程序或接入"
          : purgeUserData
            ? "已生成永久清除预览；这与普通卸载是两次不同的确认"
            : "已生成安全卸载预览；用户数据会保留",
    };
    const snapshotPaths = [...assets.snapshotPaths, path.join(this.homeDirectory, "projects", "catalog.db"), ...purgeDataPaths];
    this.plans.set(plan.plan_id, {
      publicPlan: plan,
      snapshotHash: await this.snapshotHash(snapshotPaths),
      runtimePlans,
      webPlan,
      ownedPaths: assets.ownedPaths,
      purgeDataPaths,
      snapshotPaths,
      demoProjectIds: demos.map((project) => project.project_id),
    });
    return plan;
  }

  async confirm(input: {
    plan_id: string;
    decision: "confirmed" | "declined";
    purge_confirmation?: { home_directory: string; user_project_count: number };
  }): Promise<GoalBoardUninstallResult> {
    const prepared = this.plans.get(input.plan_id);
    if (!prepared) throw new GoalBoardUninstallError("uninstall.plan_missing", "卸载预览不存在或已失效，请重新预览");
    this.plans.delete(input.plan_id);
    const plan = prepared.publicPlan;
    if (input.decision === "declined") {
      return { status: "declined", home_directory: this.homeDirectory, removed_paths: [], preserved_paths: plan.preserved_paths, receipt_path: null, message: "已取消，没有修改 GoalBoard 安装或数据" };
    }
    if (plan.status === "conflict") throw new GoalBoardUninstallError("uninstall.conflict", plan.message);
    if (await this.snapshotHash(prepared.snapshotPaths) !== prepared.snapshotHash) {
      throw new GoalBoardUninstallError("uninstall.plan_stale", "GoalBoard 安装内容在预览后发生变化，请重新预览");
    }
    if (plan.purge_user_data) this.requirePurgeConfirmation(plan, input.purge_confirmation);
    if (plan.status === "no_change") {
      return { status: "unchanged", home_directory: this.homeDirectory, removed_paths: [], preserved_paths: plan.preserved_paths, receipt_path: null, message: plan.message };
    }

    const catalogInspection = await inspectCatalog(this.homeDirectory);
    const receipt: UninstallReceipt = {
      schema_version: 1,
      owner: UNINSTALL_OWNER,
      plan_id: plan.plan_id,
      home_directory: this.homeDirectory,
      purge_user_data: plan.purge_user_data,
      preserved_projects: catalogInspection.projects
        .filter((project) => project.data_class !== "regenerable_demo")
        .map((project) => ({ project_id: project.project_id, display_name: project.display_name, data_class: project.data_class })),
      completed_steps: [],
      removed_paths: [],
      state: "in_progress",
      error: null,
      updated_at: new Date().toISOString(),
    };
    await this.writeReceipt(receipt);
    try {
      for (const runtimePlan of prepared.runtimePlans) {
        if (runtimePlan.status !== "ready") continue;
        const result = await this.runtimeIntegrations.confirm({ runtime_id: runtimePlan.runtime_id, plan_id: runtimePlan.plan_id, decision: "confirmed" });
        if (!['removed', 'already_removed'].includes(result.status)) throw new Error(result.message);
        receipt.completed_steps.push(`runtime:${runtimePlan.runtime_id}`);
        await this.writeReceipt(receipt);
      }
      if (prepared.webPlan.status === "ready") {
        await this.webService.confirm({ plan_id: prepared.webPlan.plan_id, decision: "confirmed" });
        receipt.completed_steps.push("web-service");
        await this.writeReceipt(receipt);
      }
      if (prepared.demoProjectIds.length > 0) {
        await withGoalBoardProjectCatalog({ homeDirectory: this.homeDirectory }, async (catalog) => {
          for (const projectId of prepared.demoProjectIds) {
            await catalog.removeDemoProject({
              project_id: projectId,
              actor_id: "goalboard-uninstaller",
              delete_confirmed: true,
              idempotency_key: `${plan.plan_id}:${projectId}`,
            });
          }
        });
        receipt.completed_steps.push("regenerable-demo-data");
        await this.writeReceipt(receipt);
      }
      for (const ownedPath of prepared.ownedPaths) {
        await fs.rm(ownedPath, { recursive: true, force: true });
        receipt.removed_paths.push(ownedPath);
      }
      receipt.completed_steps.push("owned-program-files");
      if (plan.purge_user_data) {
        for (const dataPath of prepared.purgeDataPaths) {
          await fs.rm(dataPath, { recursive: true, force: true });
          receipt.removed_paths.push(dataPath);
        }
        receipt.completed_steps.push("user-data-purged");
      }
      receipt.state = "complete";
      receipt.updated_at = new Date().toISOString();
      if (!plan.purge_user_data) await this.writeReceipt(receipt);
      else {
        await fs.rm(this.receiptPath, { force: true });
        for (const directory of [
          path.join(this.homeDirectory, "config"),
          path.join(this.homeDirectory, "bin"),
          path.join(this.homeDirectory, "releases"),
          this.homeDirectory,
        ]) {
          if (await removeEmptyDirectory(directory)) receipt.removed_paths.push(directory);
        }
      }
      return {
        status: plan.purge_user_data ? "purged" : "uninstalled",
        home_directory: this.homeDirectory,
        removed_paths: receipt.removed_paths,
        preserved_paths: plan.preserved_paths,
        receipt_path: plan.purge_user_data ? null : this.receiptPath,
        message: plan.purge_user_data
          ? "GoalBoard 程序、接入和用户数据已按强确认永久清除"
          : "GoalBoard 程序和自有接入已卸载；用户项目、catalog、备份与日志仍保留",
      };
    } catch (error) {
      receipt.state = "failed";
      receipt.error = error instanceof Error ? error.message : String(error);
      receipt.updated_at = new Date().toISOString();
      await this.writeReceipt(receipt).catch(() => undefined);
      throw new GoalBoardUninstallError("uninstall.step_failed", `卸载未完成，进度收据已保留：${receipt.error}`);
    }
  }

  private requirePurgeConfirmation(
    plan: GoalBoardUninstallPlan,
    confirmation: { home_directory: string; user_project_count: number } | undefined,
  ): void {
    if (
      confirmation
      && path.resolve(confirmation.home_directory) === this.homeDirectory
      && confirmation.user_project_count === plan.user_project_count
    ) return;
    throw new GoalBoardUninstallError(
      "uninstall.purge_confirmation_required",
      `永久清除还需要再次确认精确目录 ${this.homeDirectory} 和用户项目数量 ${plan.user_project_count}`,
    );
  }

  private async writeReceipt(receipt: UninstallReceipt): Promise<void> {
    await fs.mkdir(path.dirname(this.receiptPath), { recursive: true });
    const temporary = `${this.receiptPath}.tmp-${randomUUID()}`;
    await fs.writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await fs.rename(temporary, this.receiptPath);
  }

  private async snapshotHash(paths: string[]): Promise<string> {
    const values = await Promise.all([...new Set(paths)].sort().map(async (target) => ({ target, value: await pathFingerprint(target) })));
    return digest(JSON.stringify(values));
  }
}

async function inspectCatalog(homeDirectory: string): Promise<CatalogInspection> {
  const databasePath = path.join(homeDirectory, "projects", "catalog.db");
  if (!(await pathExists(databasePath))) return { projects: [], conflict: null };
  let db: Database.Database | null = null;
  try {
    db = new Database(databasePath, { readonly: true, fileMustExist: true });
    const owner = (db.prepare("SELECT value FROM catalog_meta WHERE key = 'owner'").get() as { value?: unknown } | undefined)?.value;
    if (owner !== "goalboard-project-catalog-v1") return { projects: [], conflict: `项目 catalog 不属于 GoalBoard：${databasePath}` };
    const hasDataClass = (db.pragma("table_info(projects)") as Array<{ name?: unknown }>).some((column) => column.name === "data_class");
    const rows = db.prepare(`
      SELECT project_id, display_name, board_id, database_path, source,
        ${hasDataClass ? "data_class" : "CASE WHEN source = 'migrated' THEN 'migrated_user' ELSE 'user' END AS data_class"},
        migrated_from_path, created_at, updated_at
      FROM projects ORDER BY created_at, project_id
    `).all() as Array<Record<string, unknown>>;
    return {
      projects: rows.map((row) => ({
        project_id: String(row.project_id),
        display_name: String(row.display_name),
        board_id: String(row.board_id),
        database_path: String(row.database_path),
        source: String(row.source) as GoalBoardProjectRecord["source"],
        data_class: String(row.data_class) as GoalBoardProjectRecord["data_class"],
        migrated_from_path: row.migrated_from_path == null ? null : String(row.migrated_from_path),
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
      })),
      conflict: null,
    };
  } catch (error) {
    return { projects: [], conflict: `无法安全读取项目 catalog：${error instanceof Error ? error.message : String(error)}` };
  } finally {
    db?.close();
  }
}

async function inspectOwnedHomeAssets(homeDirectory: string): Promise<{
  ownedPaths: string[];
  snapshotPaths: string[];
  conflicts: string[];
}> {
  const ownedPaths: string[] = [];
  const snapshotPaths: string[] = [];
  const conflicts: string[] = [];
  const manifestPath = path.join(homeDirectory, "config", "installation.json");
  const controlTokenPath = path.join(homeDirectory, WEB_CONTROL_TOKEN_RELATIVE_PATH);
  const manifestText = await readText(manifestPath);
  snapshotPaths.push(manifestPath);
  snapshotPaths.push(controlTokenPath);
  if (manifestText != null) {
    const manifest = parseOwnedJson(manifestText);
    if (manifest?.installer === HOME_OWNER) ownedPaths.push(manifestPath);
    else conflicts.push(`安装清单不属于 GoalBoard：${manifestPath}`);
  }
  const controlToken = await readText(controlTokenPath);
  if (controlToken != null) {
    const token = controlToken.trim();
    if (token.length >= 32 && token.length <= 512 && !/[\r\n]/.test(token)) ownedPaths.push(controlTokenPath);
    else conflicts.push(`Web 控制令牌文件已被修改，不会删除：${controlTokenPath}`);
  }
  for (const launcher of ["goalboard", "goalboard-mcp", "goalboard-web"].map((name) => path.join(homeDirectory, "bin", name))) {
    const text = await readText(launcher);
    snapshotPaths.push(launcher);
    if (text == null) continue;
    if (OWNED_LAUNCHER_HEADERS.some((header) => text.startsWith(header))) ownedPaths.push(launcher);
    else conflicts.push(`启动器已被修改，不会删除：${launcher}`);
  }
  const releasesDirectory = path.join(homeDirectory, "releases");
  const entries = await fs.readdir(releasesDirectory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const releasePath = path.join(releasesDirectory, entry.name);
    const releaseManifestPath = path.join(releasePath, "release.json");
    const releaseManifestText = entry.isDirectory() ? await readText(releaseManifestPath) : null;
    snapshotPaths.push(releaseManifestPath);
    const manifest = releaseManifestText == null ? null : parseOwnedJson(releaseManifestText);
    if (entry.isDirectory() && manifest?.installer === HOME_OWNER) ownedPaths.push(releasePath);
    else conflicts.push(`release 不属于 GoalBoard 或已损坏，不会删除：${releasePath}`);
  }
  return { ownedPaths, snapshotPaths, conflicts };
}

function assetKind(target: string): GoalBoardUninstallChange["kind"] {
  if (target.endsWith("installation.json")) return "install_manifest";
  if (target.includes(`${path.sep}releases${path.sep}`)) return "release";
  return "launcher";
}

function assetKindLabel(kind: GoalBoardUninstallChange["kind"]): string {
  if (kind === "install_manifest") return "安装清单";
  if (kind === "release") return "程序 release";
  return "启动器";
}

async function pathFingerprint(target: string): Promise<string | null> {
  try {
    const state = await fs.stat(target);
    if (state.isDirectory()) {
      const entries = await fs.readdir(target);
      return `directory:${state.mtimeMs}:${entries.sort().join("\0")}`;
    }
    return `file:${digest(await fs.readFile(target))}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function readText(target: string): Promise<string | null> {
  try { return await fs.readFile(target, "utf8"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function pathExists(target: string): Promise<boolean> {
  try { await fs.stat(target); return true; } catch { return false; }
}

async function existingPaths(paths: string[]): Promise<string[]> {
  const checks = await Promise.all(paths.map(async (target) => ({ target, exists: await pathExists(target) })));
  return checks.filter((item) => item.exists).map((item) => item.target);
}

async function removeEmptyDirectory(target: string): Promise<boolean> {
  try {
    await fs.rmdir(target);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTEMPTY" || code === "EEXIST") return false;
    throw error;
  }
}

function parseOwnedJson(text: string): { installer?: unknown } | null {
  try { return JSON.parse(text) as { installer?: unknown }; } catch { return null; }
}

function digest(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

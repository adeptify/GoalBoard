import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const INSTALLER_ID = "goalboard-home-install-v1";
const SCHEMA_VERSION = 2;
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LAUNCHER_HEADER = "#!/usr/bin/env node\n// goalboard-home-launcher-v1";

export type GoalBoardHomeInstallStatus = "installed" | "upgraded" | "repaired" | "unchanged";

export type GoalBoardHomeInstallStep =
  | "before_stage_release"
  | "before_activate_release"
  | "before_write_install_manifest";

export interface GoalBoardHomeInstallOptions {
  /** Defaults to ~/.goalboard. Tests and host integrations may supply another absolute path. */
  homeDirectory?: string;
  /** Package root containing dist/, skills/, package.json and node_modules/. */
  sourceDirectory?: string;
  /** Defaults to the source package version. Intended for controlled release builds. */
  version?: string;
  /** Test-only failure injection used to verify rollback behavior. */
  beforeStep?: (step: GoalBoardHomeInstallStep) => void | Promise<void>;
}

export interface GoalBoardHomeInstallResult {
  status: GoalBoardHomeInstallStatus;
  runtime_layout: "self_contained";
  home_directory: string;
  version: string;
  release_directory: string;
  program_directory: string;
  skill_directory: string;
  project_directory: string;
  logs_directory: string;
  launchers: {
    cli: string;
    mcp: string;
    web: string;
  };
  next_steps: {
    message: string;
    web_command: string[];
  };
  written_paths: string[];
  preserved_paths: string[];
  removed_paths: string[];
}

interface ReleaseManifest {
  schema_version: number;
  installer: string;
  version: string;
  dependencies?: "embedded";
  /** Present only in the obsolete schema-1 linked layout. */
  source_directory?: string;
  created_at: string;
}

interface InstallManifest {
  schema_version: number;
  installer: string;
  version: string;
  release_path: string;
  updated_at: string;
}

interface PromotedRelease {
  releaseDirectory: string;
  created: boolean;
  backupDirectory: string | null;
}

interface RuntimeDependencyPackage {
  name: string;
  version: string;
  directory: string;
}

interface TextMutation {
  filePath: string;
  previous: string | null;
}

export class GoalBoardHomeInstallError extends Error {
  constructor(
    readonly code:
      | "home.not_directory"
      | "source.invalid"
      | "source.asset_missing"
      | "version.invalid"
      | "home.unknown_file"
      | "release.conflict",
    message: string,
  ) {
    super(message);
    this.name = "GoalBoardHomeInstallError";
  }
}

/**
 * Installs only GoalBoard-owned files below ~/.goalboard.
 *
 * Runtime configuration and user project directories are intentionally outside
 * this boundary. The generated MCP launcher is available for a later, explicitly
 * confirmed Runtime integration step, but this operation never registers it.
 */
export async function installGoalBoardHome(
  options: GoalBoardHomeInstallOptions = {},
): Promise<GoalBoardHomeInstallResult> {
  const homeDirectory = path.resolve(options.homeDirectory ?? path.join(os.homedir(), ".goalboard"));
  const sourceDirectory = path.resolve(options.sourceDirectory ?? PACKAGE_ROOT);
  const source = await inspectSource(sourceDirectory, options.version);
  const releaseName = safeReleaseName(source.version);
  const releasesDirectory = path.join(homeDirectory, "releases");
  const releaseDirectory = path.join(releasesDirectory, releaseName);
  const configDirectory = path.join(homeDirectory, "config");
  const binDirectory = path.join(homeDirectory, "bin");
  const projectDirectory = path.join(homeDirectory, "projects");
  const logsDirectory = path.join(homeDirectory, "logs");
  const installManifestPath = path.join(configDirectory, "installation.json");
  const writtenPaths: string[] = [];
  const preservedPaths: string[] = [];
  const removedPaths: string[] = [];
  const mutations: TextMutation[] = [];
  let promoted: PromotedRelease | null = null;

  try {
    await ensureDirectory(homeDirectory);
    await Promise.all(
      [releasesDirectory, configDirectory, binDirectory, projectDirectory, logsDirectory].map(ensureDirectory),
    );

    const existingRelease = await inspectRelease(releaseDirectory, source.version);
    let releaseChanged = false;
    if (existingRelease === "valid") {
      preservedPaths.push(releaseDirectory);
    } else {
      await runStep(options, "before_stage_release");
      const stagingDirectory = path.join(releasesDirectory, `.staging-${releaseName}-${randomUUID()}`);
      try {
        await createRelease(stagingDirectory, source, source.version);
        await runStep(options, "before_activate_release");
        promoted = await promoteRelease(stagingDirectory, releaseDirectory, existingRelease === "repairable");
        releaseChanged = true;
        writtenPaths.push(releaseDirectory);
      } catch (error) {
        await fs.rm(stagingDirectory, { recursive: true, force: true });
        throw error;
      }
    }

    const launchers = {
      cli: path.join(binDirectory, "goalboard"),
      mcp: path.join(binDirectory, "goalboard-mcp"),
      web: path.join(binDirectory, "goalboard-web"),
    };
    for (const [name, launcherPath] of Object.entries(launchers)) {
      const changed = await writeOwnedText(
        launcherPath,
        launcherSource(name as keyof typeof launchers),
        mutations,
      );
      if (changed) writtenPaths.push(launcherPath);
      else preservedPaths.push(launcherPath);
    }

    const previousInstall = await readOwnedJson<InstallManifest>(installManifestPath);
    const releasePath = path.relative(homeDirectory, releaseDirectory);
    const installChanged =
      !previousInstall ||
      previousInstall.version !== source.version ||
      previousInstall.release_path !== releasePath;
    if (installChanged) {
      await runStep(options, "before_write_install_manifest");
      await replaceOwnedJson(
        installManifestPath,
        {
          schema_version: SCHEMA_VERSION,
          installer: INSTALLER_ID,
          version: source.version,
          release_path: releasePath,
          updated_at: new Date().toISOString(),
        } satisfies InstallManifest,
        mutations,
      );
      writtenPaths.push(installManifestPath);
    } else {
      preservedPaths.push(installManifestPath);
    }

    if (promoted?.backupDirectory) {
      await fs.rm(promoted.backupDirectory, { recursive: true, force: true });
    }

    const obsoletePostInstallSelections = path.join(configDirectory, "postinstall-project-selections");
    const obsoleteState = await pathState(obsoletePostInstallSelections);
    if (obsoleteState?.isDirectory()) {
      try {
        await fs.rm(obsoletePostInstallSelections, { recursive: true, force: true });
        removedPaths.push(obsoletePostInstallSelections);
      } catch {
        preservedPaths.push(obsoletePostInstallSelections);
      }
    } else if (obsoleteState) {
      preservedPaths.push(obsoletePostInstallSelections);
    }

    const status: GoalBoardHomeInstallStatus = releaseChanged
      ? promoted?.backupDirectory
        ? "repaired"
        : previousInstall
          ? "upgraded"
          : "installed"
      : installChanged
        ? "repaired"
        : "unchanged";

    return {
      status,
      runtime_layout: "self_contained",
      home_directory: homeDirectory,
      version: source.version,
      release_directory: releaseDirectory,
      program_directory: path.join(releaseDirectory, "dist"),
      skill_directory: path.join(releaseDirectory, "skills"),
      project_directory: projectDirectory,
      logs_directory: logsDirectory,
      launchers,
      next_steps: {
        message:
          "GoalBoard 只完成了本体安装；没有创建项目，也没有修改 Runtime 配置或用户项目文件。Runtime 接入和项目设置必须通过后续单独的显式流程完成。两个常见坑：goalboard-web 是前台进程，关掉运行它的终端窗口前端就会关闭；接入 Codex / Claude Code 后必须重开会话，MCP 和 Skill 才会生效。重开后在对话里明确说「继续用 GoalBoard」并告诉我关联哪个项目——Runtime 不会自动关联项目，必须等你的明确指令。",
        web_command: [launchers.web, "--home", homeDirectory],
      },
      written_paths: writtenPaths,
      preserved_paths: preservedPaths,
      removed_paths: removedPaths,
    };
  } catch (error) {
    await rollbackTextMutations(mutations);
    if (promoted) await rollbackPromotedRelease(promoted);
    throw error;
  }
}

async function inspectSource(
  sourceDirectory: string,
  requestedVersion: string | undefined,
): Promise<{ directory: string; version: string; runtimeDependencies: RuntimeDependencyPackage[] }> {
  const sourceState = await pathState(sourceDirectory);
  if (!sourceState?.isDirectory()) {
    throw new GoalBoardHomeInstallError("source.invalid", `GoalBoard 安装源不存在或不是目录: ${sourceDirectory}`);
  }
  const packageJson = path.join(sourceDirectory, "package.json");
  const packageText = await readText(packageJson, "source.asset_missing");
  let packageMetadata: {
    version?: unknown;
    dependencies?: Record<string, unknown>;
    optionalDependencies?: Record<string, unknown>;
  };
  try {
    packageMetadata = JSON.parse(packageText) as typeof packageMetadata;
  } catch {
    throw new GoalBoardHomeInstallError("source.invalid", `GoalBoard 安装源 package.json 无法解析: ${packageJson}`);
  }
  const packageVersion = String(packageMetadata.version ?? "").trim();
  const version = (requestedVersion ?? packageVersion).trim();
  safeReleaseName(version);

  for (const asset of [
    "dist/cli/main.js",
    "dist/mcp/server.js",
    "dist/web/server.js",
    "skills/goal-advance/SKILL.md",
  ]) {
    const assetPath = path.join(sourceDirectory, asset);
    if (!(await pathState(assetPath))) {
      throw new GoalBoardHomeInstallError("source.asset_missing", `GoalBoard 安装源缺少 ${asset}: ${assetPath}`);
    }
  }
  const runtimeDependencies = await collectRuntimeDependencies(packageJson, packageMetadata);
  return { directory: sourceDirectory, version, runtimeDependencies };
}

async function collectRuntimeDependencies(
  rootPackageJson: string,
  rootMetadata: {
    dependencies?: Record<string, unknown>;
    optionalDependencies?: Record<string, unknown>;
  },
): Promise<RuntimeDependencyPackage[]> {
  const packages = new Map<string, RuntimeDependencyPackage>();
  const pending: Array<{ name: string; fromPackageJson: string; optional: boolean }> = [];
  const enqueue = (
    metadata: { dependencies?: Record<string, unknown>; optionalDependencies?: Record<string, unknown> },
    fromPackageJson: string,
  ) => {
    for (const name of Object.keys(metadata.dependencies ?? {})) {
      pending.push({ name, fromPackageJson, optional: false });
    }
    for (const name of Object.keys(metadata.optionalDependencies ?? {})) {
      if (!(name in (metadata.dependencies ?? {}))) {
        pending.push({ name, fromPackageJson, optional: true });
      }
    }
  };
  enqueue(rootMetadata, rootPackageJson);

  while (pending.length > 0) {
    const candidate = pending.shift()!;
    let resolvedPackageJson: string;
    try {
      resolvedPackageJson = await resolveDependencyPackageJson(candidate.name, candidate.fromPackageJson);
    } catch (error) {
      if (candidate.optional) continue;
      throw new GoalBoardHomeInstallError(
        "source.asset_missing",
        `GoalBoard 安装源缺少运行时依赖 ${candidate.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    let metadata: {
      name?: unknown;
      version?: unknown;
      dependencies?: Record<string, unknown>;
      optionalDependencies?: Record<string, unknown>;
    };
    try {
      metadata = JSON.parse(await fs.readFile(resolvedPackageJson, "utf8")) as typeof metadata;
    } catch {
      throw new GoalBoardHomeInstallError(
        "source.invalid",
        `运行时依赖 package.json 无法解析: ${resolvedPackageJson}`,
      );
    }
    const name = String(metadata.name ?? candidate.name);
    const version = String(metadata.version ?? "").trim();
    if (name !== candidate.name || !version) {
      throw new GoalBoardHomeInstallError(
        "source.invalid",
        `运行时依赖身份无效: ${candidate.name} (${resolvedPackageJson})`,
      );
    }
    const existing = packages.get(name);
    if (existing) {
      if (existing.version !== version) {
        throw new GoalBoardHomeInstallError(
          "source.invalid",
          `运行时依赖存在无法平铺的版本冲突: ${name}@${existing.version} / ${name}@${version}`,
        );
      }
      continue;
    }
    packages.set(name, {
      name,
      version,
      directory: path.dirname(resolvedPackageJson),
    });
    enqueue(metadata, resolvedPackageJson);
  }

  return [...packages.values()].sort((left, right) => left.name.localeCompare(right.name));
}

async function resolveDependencyPackageJson(name: string, fromPackageJson: string): Promise<string> {
  const resolver = createRequire(fromPackageJson);
  try {
    return resolver.resolve(`${name}/package.json`);
  } catch (packageJsonError) {
    let resolvedEntry: string;
    try {
      resolvedEntry = resolver.resolve(name);
    } catch {
      throw packageJsonError;
    }
    let directory = path.dirname(resolvedEntry);
    while (true) {
      const candidate = path.join(directory, "package.json");
      try {
        const metadata = JSON.parse(await fs.readFile(candidate, "utf8")) as { name?: unknown };
        if (metadata.name === name) return candidate;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
      }
      const parent = path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
    throw packageJsonError;
  }
}

function safeReleaseName(version: string): string {
  if (!version || !/^[0-9A-Za-z][0-9A-Za-z._+-]*$/.test(version)) {
    throw new GoalBoardHomeInstallError("version.invalid", `GoalBoard 版本不能用于安装目录: ${version || "(empty)"}`);
  }
  return `goalboard-${version}`;
}

async function createRelease(
  stagingDirectory: string,
  source: { directory: string; version: string; runtimeDependencies: RuntimeDependencyPackage[] },
  version: string,
): Promise<void> {
  await fs.mkdir(stagingDirectory, { recursive: false });
  const embeddedNodeModules = path.join(stagingDirectory, "node_modules");
  await fs.mkdir(embeddedNodeModules, { recursive: true });
  await Promise.all([
    fs.cp(path.join(source.directory, "dist"), path.join(stagingDirectory, "dist"), {
      recursive: true,
      force: false,
      errorOnExist: true,
      dereference: true,
    }),
    fs.cp(path.join(source.directory, "skills"), path.join(stagingDirectory, "skills"), {
      recursive: true,
      force: false,
      errorOnExist: true,
      dereference: true,
    }),
  ]);
  for (const dependency of source.runtimeDependencies) {
    const target = path.join(embeddedNodeModules, dependency.name);
    await assertContainedDependencyLinks(dependency.directory);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.cp(dependency.directory, target, {
      recursive: true,
      force: false,
      errorOnExist: true,
      dereference: true,
    });
  }
  await assertContainedDependencyLinks(embeddedNodeModules);
  await writeAtomic(
    path.join(stagingDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: "@adeptify/goalboard-home-runtime",
        private: true,
        type: "module",
        version,
        dependencies: Object.fromEntries(
          source.runtimeDependencies.map((dependency) => [dependency.name, dependency.version]),
        ),
      },
      null,
      2,
    )}\n`,
  );
  await writeAtomic(
    path.join(stagingDirectory, "release.json"),
    `${JSON.stringify(
      {
        schema_version: SCHEMA_VERSION,
        installer: INSTALLER_ID,
        version,
        dependencies: "embedded",
        created_at: new Date().toISOString(),
      } satisfies ReleaseManifest,
      null,
      2,
    )}\n`,
  );
}

async function assertContainedDependencyLinks(rootDirectory: string): Promise<void> {
  const pending = [rootDirectory];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      if (!entry.isSymbolicLink()) continue;
      const target = await fs.readlink(entryPath);
      const resolved = path.resolve(path.dirname(entryPath), target);
      const relative = path.relative(rootDirectory, resolved);
      if (path.isAbsolute(target) || relative === ".." || relative.startsWith(`..${path.sep}`)) {
        throw new GoalBoardHomeInstallError(
          "source.invalid",
          `GoalBoard 依赖链接指向安装 release 外部，无法生成自包含安装: ${entryPath}`,
        );
      }
    }
  }
}

async function inspectRelease(
  releaseDirectory: string,
  version: string,
): Promise<"missing" | "valid" | "repairable"> {
  const state = await pathState(releaseDirectory);
  if (!state) return "missing";
  if (!state.isDirectory()) {
    throw new GoalBoardHomeInstallError("release.conflict", `已存在未知 GoalBoard release 文件: ${releaseDirectory}`);
  }
  const manifest = await readJsonIfPresent<ReleaseManifest>(path.join(releaseDirectory, "release.json"));
  if (!manifest || manifest.installer !== INSTALLER_ID || manifest.version !== version) {
    throw new GoalBoardHomeInstallError("release.conflict", `已存在未知 GoalBoard release 目录: ${releaseDirectory}`);
  }
  if (manifest.schema_version !== SCHEMA_VERSION || manifest.dependencies !== "embedded") {
    return "repairable";
  }
  const required = [
    "dist/cli/main.js",
    "dist/mcp/server.js",
    "dist/web/server.js",
    "skills/goal-advance/SKILL.md",
    "node_modules",
    "package.json",
  ];
  const states = await Promise.all(required.map((item) => pathState(path.join(releaseDirectory, item))));
  if (!states.every(Boolean)) return "repairable";
  const nodeModulesState = states[4];
  return nodeModulesState?.isDirectory() && !nodeModulesState.isSymbolicLink() ? "valid" : "repairable";
}

async function promoteRelease(
  stagingDirectory: string,
  releaseDirectory: string,
  repairing: boolean,
): Promise<PromotedRelease> {
  if (!repairing) {
    await fs.rename(stagingDirectory, releaseDirectory);
    return { releaseDirectory, created: true, backupDirectory: null };
  }
  const backupDirectory = `${releaseDirectory}.backup-${randomUUID()}`;
  await fs.rename(releaseDirectory, backupDirectory);
  try {
    await fs.rename(stagingDirectory, releaseDirectory);
    return { releaseDirectory, created: false, backupDirectory };
  } catch (error) {
    await fs.rename(backupDirectory, releaseDirectory);
    throw error;
  }
}

async function rollbackPromotedRelease(promoted: PromotedRelease): Promise<void> {
  try {
    if (promoted.created) {
      await fs.rm(promoted.releaseDirectory, { recursive: true, force: true });
      return;
    }
    if (promoted.backupDirectory) {
      await fs.rm(promoted.releaseDirectory, { recursive: true, force: true });
      await fs.rename(promoted.backupDirectory, promoted.releaseDirectory);
    }
  } catch {
    // Preserve the original error. A later repair can recover this owned release.
  }
}

async function ensureDirectory(directory: string): Promise<void> {
  const state = await pathState(directory);
  if (state?.isDirectory()) return;
  if (state) {
    throw new GoalBoardHomeInstallError("home.not_directory", `GoalBoard 安装路径不是目录: ${directory}`);
  }
  await fs.mkdir(directory, { recursive: true });
}

async function writeOwnedText(filePath: string, content: string, mutations: TextMutation[]): Promise<boolean> {
  const previous = await readTextIfPresent(filePath);
  if (previous === content) return false;
  if (previous != null && !previous.startsWith(LAUNCHER_HEADER)) {
    throw new GoalBoardHomeInstallError("home.unknown_file", `不会覆盖未知用户文件: ${filePath}`);
  }
  mutations.push({ filePath, previous });
  await writeAtomic(filePath, content, 0o755);
  return true;
}

async function replaceOwnedJson(
  filePath: string,
  value: InstallManifest,
  mutations: TextMutation[],
): Promise<void> {
  const previous = await readTextIfPresent(filePath);
  if (previous != null) {
    const parsed = parseJson(previous, filePath);
    if (parsed.installer !== INSTALLER_ID) {
      throw new GoalBoardHomeInstallError("home.unknown_file", `不会覆盖未知用户文件: ${filePath}`);
    }
  }
  mutations.push({ filePath, previous });
  await writeAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function readOwnedJson<T extends { installer: string }>(filePath: string): Promise<T | null> {
  const text = await readTextIfPresent(filePath);
  if (text == null) return null;
  const parsed = parseJson(text, filePath) as T;
  if (parsed.installer !== INSTALLER_ID) {
    throw new GoalBoardHomeInstallError("home.unknown_file", `不会读取或覆盖未知用户文件: ${filePath}`);
  }
  return parsed;
}

async function rollbackTextMutations(mutations: TextMutation[]): Promise<void> {
  for (const mutation of [...mutations].reverse()) {
    try {
      if (mutation.previous == null) await fs.rm(mutation.filePath, { force: true });
      else await writeAtomic(mutation.filePath, mutation.previous);
    } catch {
      // Preserve the original error. The next explicit install can repair owned files.
    }
  }
}

function launcherSource(entry: "cli" | "mcp" | "web"): string {
  const target =
    entry === "cli"
      ? "dist/cli/main.js"
      : entry === "mcp"
        ? "dist/mcp/server.js"
        : "dist/web/server.js";
  return `${LAUNCHER_HEADER}
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const homeDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installation = JSON.parse(readFileSync(path.join(homeDirectory, "config", "installation.json"), "utf8"));
const entry = path.resolve(homeDirectory, installation.release_path, "${target}");
const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
  cwd: path.dirname(entry),
  env: process.env,
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}
child.once("exit", (code, signal) => {
  if (signal) {
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
  }
  else process.exitCode = code ?? 1;
});
`;
}

async function runStep(options: GoalBoardHomeInstallOptions, step: GoalBoardHomeInstallStep): Promise<void> {
  await options.beforeStep?.(step);
}

async function pathState(filePath: string) {
  try {
    return await fs.lstat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function readText(filePath: string, code: "source.asset_missing"): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    throw new GoalBoardHomeInstallError(code, `GoalBoard 安装源缺少文件: ${filePath}`);
  }
}

async function readTextIfPresent(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function readJsonIfPresent<T>(filePath: string): Promise<T | null> {
  const text = await readTextIfPresent(filePath);
  return text == null ? null : (parseJson(text, filePath) as T);
}

function parseJson(text: string, filePath: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new GoalBoardHomeInstallError("release.conflict", `GoalBoard 安装文件无法解析: ${filePath}`);
  }
}

async function writeAtomic(filePath: string, content: string, mode?: number): Promise<void> {
  const temporaryPath = `${filePath}.tmp-${randomUUID()}`;
  await fs.writeFile(temporaryPath, content, mode == null ? undefined : { mode });
  try {
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
}

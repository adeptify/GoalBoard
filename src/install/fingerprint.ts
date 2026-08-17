import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface GoalBoardBuildManifest {
  schema_version: 1;
  source_digest: string;
  created_at: string;
}

const BUILD_INPUTS = ["package.json", "tsconfig.json", "src"] as const;

export async function computeBuildSourceDigest(packageRoot: string): Promise<string> {
  return digestPaths(packageRoot, BUILD_INPUTS);
}

export async function writeGoalBoardBuildManifest(packageRoot: string): Promise<GoalBoardBuildManifest> {
  const manifest: GoalBoardBuildManifest = {
    schema_version: 1,
    source_digest: await computeBuildSourceDigest(packageRoot),
    created_at: new Date().toISOString(),
  };
  const target = path.join(packageRoot, "dist", ".goalboard-build.json");
  await fs.writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

export async function digestPaths(root: string, entries: readonly string[]): Promise<string> {
  const hash = createHash("sha256");
  for (const entry of [...entries].sort()) {
    await appendPath(hash, root, path.join(root, entry));
  }
  return hash.digest("hex");
}

async function appendPath(hash: ReturnType<typeof createHash>, root: string, target: string): Promise<void> {
  const relative = path.relative(root, target).split(path.sep).join("/");
  const state = await fs.lstat(target);
  if (state.isDirectory()) {
    hash.update(`directory\0${relative}\0`);
    const children = (await fs.readdir(target)).sort();
    for (const child of children) await appendPath(hash, root, path.join(target, child));
    return;
  }
  if (state.isSymbolicLink()) {
    hash.update(`symlink\0${relative}\0${await fs.readlink(target)}\0`);
    return;
  }
  if (!state.isFile()) return;
  hash.update(`file\0${relative}\0${state.mode & 0o777}\0`);
  hash.update(await fs.readFile(target));
  hash.update("\0");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const packageRoot = path.resolve(process.argv[2] ?? process.cwd());
  writeGoalBoardBuildManifest(packageRoot).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

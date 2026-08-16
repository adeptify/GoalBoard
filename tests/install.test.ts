import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { GoalBoardHomeInstallError, installGoalBoardHome } from "../src/install/home.js";

const execFileAsync = promisify(execFile);

async function fixtureSource(root: string, version: string): Promise<string> {
  const source = join(root, `source-${version}`);
  await Promise.all([
    mkdir(join(source, "dist", "cli"), { recursive: true }),
    mkdir(join(source, "dist", "mcp"), { recursive: true }),
    mkdir(join(source, "dist", "web"), { recursive: true }),
    mkdir(join(source, "skills", "goal-advance"), { recursive: true }),
    mkdir(join(source, "node_modules"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(source, "package.json"), JSON.stringify({ name: "fixture-goalboard", version, type: "module" })),
    writeFile(join(source, "dist", "cli", "main.js"), "export {};\n"),
    writeFile(join(source, "dist", "mcp", "server.js"), "export {};\n"),
    writeFile(join(source, "dist", "web", "server.js"), "export {};\n"),
    writeFile(join(source, "skills", "goal-advance", "SKILL.md"), "# Fixture Skill\n"),
  ]);
  return source;
}

async function withTemporaryDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "goalboard-install-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("home install is scoped, idempotent, and produces an owned release layout", async () => {
  await withTemporaryDirectory(async (directory) => {
    const source = await fixtureSource(directory, "1.0.0");
    const home = join(directory, "home", ".goalboard");
    const projectFile = join(directory, "project", "important.txt");
    const runtimeConfig = join(directory, "runtime", "config.json");
    await mkdir(join(directory, "project"), { recursive: true });
    await mkdir(join(directory, "runtime"), { recursive: true });
    await writeFile(projectFile, "do-not-touch");
    await writeFile(runtimeConfig, "{\"runtime\":\"unchanged\"}");
    await mkdir(home, { recursive: true });
    await writeFile(join(home, "notes.txt"), "user-owned");

    const first = await installGoalBoardHome({ homeDirectory: home, sourceDirectory: source });
    assert.equal(first.status, "installed");
    assert.deepEqual(first.post_install.default_selected_action_ids, []);
    assert.match(first.post_install.question, /还没有创建、导入、启用或启动任何项目/);
    assert.equal(await readFile(projectFile, "utf8"), "do-not-touch");
    assert.equal(await readFile(runtimeConfig, "utf8"), "{\"runtime\":\"unchanged\"}");
    assert.equal(await readFile(join(home, "notes.txt"), "utf8"), "user-owned");
    assert.ok((await stat(join(first.release_directory, "dist", "mcp", "server.js"))).isFile());
    assert.ok((await stat(join(first.skill_directory, "goal-advance", "SKILL.md"))).isFile());
    assert.ok((await stat(first.launchers.mcp)).isFile());

    const second = await installGoalBoardHome({ homeDirectory: home, sourceDirectory: source });
    assert.equal(second.status, "unchanged");
    assert.deepEqual(second.written_paths, []);
  });
});

test("upgrade failure rolls back the new release and leaves project data and current release intact", async () => {
  await withTemporaryDirectory(async (directory) => {
    const sourceOne = await fixtureSource(directory, "1.0.0");
    const sourceTwo = await fixtureSource(directory, "2.0.0");
    const home = join(directory, "home", ".goalboard");
    await installGoalBoardHome({ homeDirectory: home, sourceDirectory: sourceOne });
    const database = join(home, "projects", "existing.db");
    await writeFile(database, "existing-project-data");

    await assert.rejects(
      () =>
        installGoalBoardHome({
          homeDirectory: home,
          sourceDirectory: sourceTwo,
          beforeStep(step) {
            if (step === "before_write_install_manifest") throw new Error("injected failure");
          },
        }),
      /injected failure/,
    );

    const current = JSON.parse(await readFile(join(home, "config", "installation.json"), "utf8")) as { version: string };
    assert.equal(current.version, "1.0.0");
    assert.equal(await readFile(database, "utf8"), "existing-project-data");
    await assert.rejects(stat(join(home, "releases", "goalboard-2.0.0")));

    const upgraded = await installGoalBoardHome({ homeDirectory: home, sourceDirectory: sourceTwo });
    assert.equal(upgraded.status, "upgraded");
    assert.equal(
      (JSON.parse(await readFile(join(home, "config", "installation.json"), "utf8")) as { version: string }).version,
      "2.0.0",
    );
  });
});

test("repair replaces a broken owned release without changing its current version", async () => {
  await withTemporaryDirectory(async (directory) => {
    const source = await fixtureSource(directory, "1.0.0");
    const home = join(directory, "home", ".goalboard");
    const first = await installGoalBoardHome({ homeDirectory: home, sourceDirectory: source });
    await rm(join(first.release_directory, "dist", "cli", "main.js"));

    const repaired = await installGoalBoardHome({ homeDirectory: home, sourceDirectory: source });
    assert.equal(repaired.status, "repaired");
    assert.ok((await stat(join(repaired.release_directory, "dist", "cli", "main.js"))).isFile());
    assert.equal(
      (JSON.parse(await readFile(join(home, "config", "installation.json"), "utf8")) as { version: string }).version,
      "1.0.0",
    );
  });
});

test("home install refuses to overwrite unknown launcher files", async () => {
  await withTemporaryDirectory(async (directory) => {
    const source = await fixtureSource(directory, "1.0.0");
    const home = join(directory, "home", ".goalboard");
    const unknownLauncher = join(home, "bin", "goalboard-mcp");
    await mkdir(join(home, "bin"), { recursive: true });
    await writeFile(unknownLauncher, "user launcher");

    await assert.rejects(
      () => installGoalBoardHome({ homeDirectory: home, sourceDirectory: source }),
      (error: unknown) => error instanceof GoalBoardHomeInstallError && error.code === "home.unknown_file",
    );
    assert.equal(await readFile(unknownLauncher, "utf8"), "user launcher");
  });
});

test("installed CLI launcher can run from the home release", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home", ".goalboard");
    const result = await installGoalBoardHome({ homeDirectory: home, sourceDirectory: process.cwd() });
    const output = await execFileAsync(process.execPath, [result.launchers.cli, "--help"], { cwd: directory });
    assert.match(output.stdout, /goalboard v1/);
  });
});

test("public install command writes only the requested GoalBoard home", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "custom-home", ".goalboard");
    const projectFile = join(directory, "project", "unchanged.txt");
    await mkdir(join(directory, "project"), { recursive: true });
    await writeFile(projectFile, "unchanged");

    const output = await execFileAsync(
      process.execPath,
      [join(process.cwd(), "dist", "cli", "main.js"), "install", "--home", home],
      { cwd: directory },
    );
    const result = JSON.parse(output.stdout) as {
      home_directory: string;
      status: string;
      post_install: { default_selected_action_ids: string[] };
    };
    assert.equal(result.home_directory, home);
    assert.equal(result.status, "installed");
    assert.deepEqual(result.post_install.default_selected_action_ids, []);
    assert.equal(await readFile(projectFile, "utf8"), "unchanged");
  });
});

test("public project-setup command requires explicit action IDs and can skip all", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home", ".goalboard");
    const output = await execFileAsync(
      process.execPath,
      [
        join(process.cwd(), "dist", "cli", "main.js"),
        "project-setup",
        "--home",
        home,
        "--json",
        JSON.stringify({
          actions: [
            {
              action_id: "not-confirmed",
              kind: "create",
              display_name: "不会被默认创建",
              actor_id: "user-1",
            },
          ],
          confirmed_action_ids: [],
          idempotency_key: "cli-project-setup-skip-all",
        }),
      ],
      { cwd: directory },
    );
    const result = JSON.parse(output.stdout) as {
      executed_action_ids: string[];
      skipped_action_ids: string[];
    };
    assert.deepEqual(result.executed_action_ids, []);
    assert.deepEqual(result.skipped_action_ids, ["not-confirmed"]);
    await assert.rejects(stat(join(home, "projects", "catalog.db")));
  });
});

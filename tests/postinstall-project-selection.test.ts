import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  applyPostInstallProjectSelection,
  postInstallProjectPrompt,
} from "../src/install/postinstall-project-selection.js";
import { GoalBoardProjectCatalog, type RuntimeWorkContext } from "../src/projects/catalog.js";

async function withTemporaryDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "goalboard-postinstall-projects-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function stableContext(id: string): RuntimeWorkContext {
  return {
    runtime_id: "codex",
    stable_work_context_id: id,
    host_declares_stable: true,
  };
}

test("post-install project setup defaults to skip-all without creating catalog, bindings, or services", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home", ".goalboard");
    const prompt = postInstallProjectPrompt(home);
    assert.deepEqual(prompt.default_selected_action_ids, []);
    assert.match(prompt.question, /还没有创建、导入、启用或启动任何项目/);

    const result = await applyPostInstallProjectSelection({
      home_directory: home,
      actions: [
        {
          action_id: "create-if-user-confirms",
          kind: "create",
          display_name: "不应创建的项目",
          actor_id: "user-1",
        },
      ],
      confirmed_action_ids: [],
      idempotency_key: "postinstall-skip-all",
    });
    assert.deepEqual(result.executed_action_ids, []);
    assert.deepEqual(result.skipped_action_ids, ["create-if-user-confirms"]);
    await assert.rejects(stat(join(home, "projects", "catalog.db")));
    await assert.rejects(stat(home));
  });
});

test("post-install setup executes only individually confirmed project actions", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home", ".goalboard");
    const context = stableContext("postinstall-selection-entry");
    const initialCatalog = await GoalBoardProjectCatalog.open({ homeDirectory: home });
    const existing = await initialCatalog.createProject({ display_name: "已存在项目", actor_id: "user-1" });
    initialCatalog.close();
    const unselectedLegacy = join(directory, "legacy-not-selected.db");
    await writeFile(unselectedLegacy, "do-not-touch");
    const startedProjectIds: string[] = [];

    const result = await applyPostInstallProjectSelection({
      home_directory: home,
      actions: [
        {
          action_id: "create-selected",
          kind: "create",
          display_name: "用户明确创建的项目",
          actor_id: "user-1",
        },
        {
          action_id: "create-not-selected",
          kind: "create",
          display_name: "不能被默认创建的项目",
          actor_id: "user-1",
        },
        {
          action_id: "enable-existing",
          kind: "enable",
          project_id: existing.project_id,
          context,
          actor_id: "user-1",
        },
        {
          action_id: "start-existing",
          kind: "start",
          project_id: existing.project_id,
          context,
          actor_id: "user-1",
        },
        {
          action_id: "import-not-selected",
          kind: "import",
          legacy_database_path: unselectedLegacy,
          actor_id: "user-1",
        },
      ],
      confirmed_action_ids: ["create-selected", "enable-existing", "start-existing"],
      idempotency_key: "postinstall-selected-only",
      starter: {
        startProject({ project }) {
          startedProjectIds.push(project.project_id);
          return { started: true, message: `已启动 ${project.display_name}` };
        },
      },
    });

    assert.deepEqual(result.executed_action_ids, ["create-selected", "enable-existing", "start-existing"]);
    assert.deepEqual(result.skipped_action_ids, ["create-not-selected", "import-not-selected"]);
    assert.deepEqual(result.failed_action_ids, []);
    assert.deepEqual(startedProjectIds, [existing.project_id]);
    assert.equal(await readFile(unselectedLegacy, "utf8"), "do-not-touch");

    const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: home });
    try {
      const names = catalog.listProjects().map((project) => project.display_name);
      assert.deepEqual(names, ["已存在项目", "用户明确创建的项目"]);
      assert.equal(catalog.resolveRuntimeContext(context).connection?.project_id, existing.project_id);
    } finally {
      catalog.close();
    }
  });
});

test("a selected start never launches a project that has not first been explicitly enabled", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home", ".goalboard");
    const context = stableContext("unbound-start-entry");
    const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: home });
    const project = await catalog.createProject({ display_name: "未启用项目", actor_id: "user-1" });
    catalog.close();
    let started = false;

    const result = await applyPostInstallProjectSelection({
      home_directory: home,
      actions: [
        {
          action_id: "start-without-enable",
          kind: "start",
          project_id: project.project_id,
          context,
          actor_id: "user-1",
        },
      ],
      confirmed_action_ids: ["start-without-enable"],
      idempotency_key: "postinstall-start-without-enable",
      starter: {
        startProject() {
          started = true;
          return { started: true, message: "不应调用" };
        },
      },
    });
    assert.equal(started, false);
    assert.deepEqual(result.executed_action_ids, []);
    assert.deepEqual(result.failed_action_ids, ["start-without-enable"]);
    assert.match(result.action_results[0]?.message ?? "", /先确认 enable 操作/);
  });
});

test("a confirmed post-install selection replays exactly once and rejects a changed reuse", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home", ".goalboard");
    const input = {
      home_directory: home,
      actions: [
        {
          action_id: "create-once",
          kind: "create" as const,
          display_name: "只创建一次的项目",
          actor_id: "user-1",
        },
      ],
      confirmed_action_ids: ["create-once"],
      idempotency_key: "postinstall-create-once",
    };
    const first = await applyPostInstallProjectSelection(input);
    const replay = await applyPostInstallProjectSelection(input);
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.executed_action_ids, ["create-once"]);

    const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: home });
    try {
      assert.equal(catalog.listProjects().length, 1);
    } finally {
      catalog.close();
    }

    await assert.rejects(
      () =>
        applyPostInstallProjectSelection({
          ...input,
          actions: [{ ...input.actions[0], display_name: "不能复用同一请求键创建" }],
        }),
      (error: unknown) =>
        error instanceof Error && /幂等键不能用于不同的操作/.test(error.message),
    );
  });
});

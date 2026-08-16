import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import {
  GoalBoardProjectCatalog,
  GoalBoardProjectCatalogError,
  type RuntimeWorkContext,
} from "../src/projects/catalog.js";
import { GoalBoardCoordinator } from "../src/v1/coordinator.js";
import { SqliteGoalBoardStore } from "../src/v1/store.js";

async function withTemporaryDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "goalboard-project-catalog-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function createLegacyBoard(databasePath: string): void {
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  try {
    coordinator.initializeBoard({
      board_id: "legacy-board",
      title: "旧项目",
      actor_id: "user",
      idempotency_key: "legacy-init",
    });
    for (const goalId of ["legacy-a", "legacy-b"]) {
      coordinator.createGoal(
        "legacy-board",
        {
          goal_id: goalId,
          title: goalId,
          outcome: `${goalId} outcome`,
          why: "migration fixture",
          business_logic: "保留已有 GoalBoard 事实。",
          definition_state: "accepted",
          decomposition_state: "closed_leaf",
          acceptance_criteria: [
            {
              criterion_id: `${goalId}-criterion`,
              statement: "fixture acceptance",
              decision_method: "automated_check",
              pass_condition: "fixture passes",
            },
          ],
        },
        { actor_id: "user", idempotency_key: `create-${goalId}` },
      );
    }
    coordinator.addRelation(
      "legacy-board",
      {
        from_goal_id: "legacy-b",
        to_goal_id: "legacy-a",
        type: "depends_on",
        state: "active",
        reason: "legacy relation",
      },
      { actor_id: "user", idempotency_key: "legacy-relation" },
    );
    const claim = coordinator.claimGoal({
      board_id: "legacy-board",
      goal_id: "legacy-a",
      actor_id: "runtime",
      role: "executor",
      idempotency_key: "legacy-claim",
    }).claim;
    assert.ok(claim);
    const run = coordinator.startRun({
      board_id: "legacy-board",
      claim_id: claim.claim_id,
      actor_id: "runtime",
      idempotency_key: "legacy-run",
    }).run;
    coordinator.reportRun({
      board_id: "legacy-board",
      run_id: run.run_id,
      actor_id: "runtime",
      state: "completed",
      output_refs: ["fixture://legacy"],
      idempotency_key: "legacy-report",
    });
  } finally {
    store.db.pragma("wal_checkpoint(TRUNCATE)");
    store.close();
  }
}

function snapshot(databasePath: string) {
  const store = new SqliteGoalBoardStore(databasePath);
  try {
    return store.snapshot("legacy-board");
  } finally {
    store.close();
  }
}

function stableContext(runtimeId: string, workContextId: string): RuntimeWorkContext {
  return {
    runtime_id: runtimeId,
    stable_work_context_id: workContextId,
    host_declares_stable: true,
  };
}

test("managed projects have immutable identities, duplicate names, and isolated SQLite facts", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home", ".goalboard");
    const userProjectFile = join(directory, "user-project", "note.txt");
    await mkdir(join(directory, "user-project"), { recursive: true });
    await writeFile(userProjectFile, "untouched");
    const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: home });
    try {
      const first = await catalog.createProject({ display_name: "同名项目", actor_id: "user" });
      const second = await catalog.createProject({ display_name: "同名项目", actor_id: "user" });
      assert.notEqual(first.project_id, second.project_id);
      assert.notEqual(first.database_path, second.database_path);
      assert.equal(first.board_id, first.project_id);
      assert.equal(second.board_id, second.project_id);
      assert.equal(catalog.listProjects().length, 2);

      const firstStore = new SqliteGoalBoardStore(first.database_path);
      try {
        new GoalBoardCoordinator(firstStore).createGoal(
          first.board_id,
          {
            goal_id: "only-first",
            title: "只在第一个项目",
            outcome: "项目隔离",
            why: "测试隔离",
            business_logic: "第一个项目的 Goal 不应出现在第二个项目。",
            definition_state: "accepted",
            decomposition_state: "closed_leaf",
            acceptance_criteria: [
              {
                criterion_id: "only-first-criterion",
                statement: "fixture",
                decision_method: "automated_check",
                pass_condition: "fixture",
              },
            ],
          },
          { actor_id: "user", idempotency_key: "first-only" },
        );
      } finally {
        firstStore.close();
      }
      const secondStore = new SqliteGoalBoardStore(second.database_path);
      try {
        assert.equal(secondStore.snapshot(second.board_id).goals.length, 0);
      } finally {
        secondStore.close();
      }

      const renamed = catalog.renameProject(first.project_id, "重命名后", "user");
      assert.equal(renamed.project_id, first.project_id);
      assert.equal(renamed.database_path, first.database_path);
      assert.equal(await readFile(userProjectFile, "utf8"), "untouched");
    } finally {
      catalog.close();
    }
  });
});

test("legacy GoalBoard DB migrates to one managed source with complete facts", async () => {
  await withTemporaryDirectory(async (directory) => {
    const legacyDirectory = join(directory, "legacy");
    const legacyDatabase = join(legacyDirectory, "goalboard.db");
    await mkdir(legacyDirectory, { recursive: true });
    createLegacyBoard(legacyDatabase);
    const before = snapshot(legacyDatabase);
    const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: join(directory, "home", ".goalboard") });
    try {
      const migrated = await catalog.migrateLegacyDatabase({ legacy_database_path: legacyDatabase, actor_id: "user" });
      assert.equal(migrated.source, "migrated");
      assert.equal(migrated.board_id, "legacy-board");
      await assert.rejects(stat(legacyDatabase));
      assert.deepEqual(snapshot(migrated.database_path), before);
      assert.equal(catalog.listProjects()[0]?.project_id, migrated.project_id);
    } finally {
      catalog.close();
    }
  });
});

test("failed legacy migration keeps the old DB and does not leave a project record", async () => {
  await withTemporaryDirectory(async (directory) => {
    const legacyDirectory = join(directory, "legacy");
    const legacyDatabase = join(legacyDirectory, "goalboard.db");
    await mkdir(legacyDirectory, { recursive: true });
    createLegacyBoard(legacyDatabase);
    const before = snapshot(legacyDatabase);
    const home = join(directory, "home", ".goalboard");
    const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: home });
    try {
      await assert.rejects(
        () =>
          catalog.migrateLegacyDatabase({
            legacy_database_path: legacyDatabase,
            actor_id: "user",
            beforeStep(step) {
              if (step === "before_catalog_commit") throw new Error("injected migration failure");
            },
          }),
        /injected migration failure/,
      );
      assert.deepEqual(snapshot(legacyDatabase), before);
      assert.deepEqual(catalog.listProjects(), []);
      assert.equal((await stat(join(home, "projects", "catalog.db"))).isFile(), true);
    } finally {
      catalog.close();
    }
  });
});

test("runtime Session/work-entry contexts reconnect only after an explicit binding and require a separate rebind confirmation", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home", ".goalboard");
    const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: home });
    try {
      const first = await catalog.createProject({ display_name: "同名项目", actor_id: "user" });
      const second = await catalog.createProject({ display_name: "同名项目", actor_id: "user" });
      const codexEntry = stableContext("codex", "workspace-entry-01");
      const claudeEntry = stableContext("claude-code", "workspace-entry-01");

      assert.deepEqual(catalog.resolveRuntimeContext(codexEntry), {
        status: "unbound",
        reason: "unknown_context",
        next_action: "ask_user_to_select_or_create",
        context: { runtime_id: "codex", stable_work_context_id: "workspace-entry-01" },
        project: null,
        connection: null,
        suggested_projects: [],
        available_projects: [
          { project_id: first.project_id, display_name: "同名项目" },
          { project_id: second.project_id, display_name: "同名项目" },
        ],
      });
      assert.equal(
        catalog.resolveRuntimeContext({
          runtime_id: "codex",
          stable_work_context_id: "workspace-entry-01",
          host_declares_stable: false,
        }).reason,
        "missing_stable_context",
      );
      assert.equal(
        catalog.resolveRuntimeContext(stableContext("codex", "same-name-as-project")).status,
        "unbound",
      );

      assert.throws(
        () =>
          catalog.bindRuntimeContext({
            context: codexEntry,
            project_id: first.project_id,
            actor_id: "runtime",
            user_confirmed: false,
          }),
        (error: unknown) =>
          error instanceof GoalBoardProjectCatalogError && error.code === "context.user_confirmation_required",
      );
      const initial = catalog.bindRuntimeContext({
        context: codexEntry,
        project_id: first.project_id,
        actor_id: "runtime",
        user_confirmed: true,
      });
      assert.equal(initial.status, "bound");
      assert.equal(initial.connection?.project_id, first.project_id);
      assert.equal(initial.connection?.database_path, first.database_path);

      const secondRuntime = catalog.bindRuntimeContext({
        context: claudeEntry,
        project_id: first.project_id,
        actor_id: "runtime",
        user_confirmed: true,
      });
      assert.equal(secondRuntime.connection?.board_id, initial.connection?.board_id);
      assert.equal(secondRuntime.connection?.database_path, initial.connection?.database_path);

      assert.throws(
        () =>
          catalog.bindRuntimeContext({
            context: codexEntry,
            project_id: second.project_id,
            actor_id: "runtime",
            user_confirmed: true,
          }),
        (error: unknown) =>
          error instanceof GoalBoardProjectCatalogError && error.code === "context.rebind_confirmation_required",
      );
      assert.equal(catalog.resolveRuntimeContext(codexEntry).connection?.project_id, first.project_id);
      assert.equal(catalog.resolveRuntimeContext(claudeEntry).connection?.project_id, first.project_id);

      const rebound = catalog.bindRuntimeContext({
        context: codexEntry,
        project_id: second.project_id,
        actor_id: "runtime",
        user_confirmed: true,
        rebind_confirmed: true,
      });
      assert.equal(rebound.connection?.project_id, second.project_id);
      assert.equal(catalog.resolveRuntimeContext(claudeEntry).connection?.project_id, first.project_id);
      assert.deepEqual(
        catalog.listRuntimeContextBindingEvents(codexEntry).map((event) => [
          event.type,
          event.previous_project_id,
          event.project_id,
        ]),
        [
          ["context.bound", null, first.project_id],
          ["context.rebound", first.project_id, second.project_id],
        ],
      );

      catalog.renameProject(second.project_id, "改过显示名也不影响绑定", "user");
      assert.equal(catalog.resolveRuntimeContext(codexEntry).connection?.project_id, second.project_id);
    } finally {
      catalog.close();
    }

    const reopened = await GoalBoardProjectCatalog.open({ homeDirectory: home });
    try {
      assert.equal(
        reopened.resolveRuntimeContext(stableContext("codex", "workspace-entry-01")).status,
        "bound",
      );
      assert.equal(
        reopened.resolveRuntimeContext(stableContext("claude-code", "workspace-entry-01")).status,
        "bound",
      );
    } finally {
      reopened.close();
    }
  });
});

test("a fresh Runtime Session receives host suggestions but needs confirmation, and rejection stays local", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home", ".goalboard");
    const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: home });
    try {
      const primary = await catalog.createProject({ display_name: "Alpha 主项目", actor_id: "user" });
      const related = await catalog.createProject({ display_name: "Alpha 文档", actor_id: "user" });
      const unrelated = await catalog.createProject({ display_name: "Beta 项目", actor_id: "user" });
      const firstSession = stableContext("codex", "new-session-a");
      const clues = [
        { kind: "recent_project" as const, value: primary.project_id },
        { kind: "workspace" as const, value: "/private/secret-token-987/alpha" },
      ];

      const suggested = catalog.resolveRuntimeContext(firstSession, clues);
      assert.equal(suggested.status, "suggested");
      assert.equal(suggested.reason, null);
      assert.equal(suggested.next_action, "ask_user_to_confirm_suggestion");
      assert.equal(suggested.project, null);
      assert.equal(suggested.connection, null);
      assert.deepEqual(suggested.suggested_projects.map((project) => project.project_id), [
        primary.project_id,
        related.project_id,
      ]);
      assert.ok(suggested.suggested_projects.every((project) => project.reasons.length > 0));
      assert.doesNotMatch(JSON.stringify(suggested.suggested_projects), /secret-token-987/);
      assert.deepEqual(suggested.available_projects.map((project) => project.project_id).sort(), [
        primary.project_id,
        related.project_id,
        unrelated.project_id,
      ].sort());
      assert.equal(catalog.listRuntimeContextBindingEvents(firstSession).length, 0);

      assert.throws(
        () =>
          catalog.rejectRuntimeContextSuggestion({
            context: firstSession,
            project_id: primary.project_id,
            actor_id: "runtime-codex",
            user_confirmed: false,
            suggestion_clues: clues,
          }),
        (error: unknown) =>
          error instanceof GoalBoardProjectCatalogError && error.code === "context.user_confirmation_required",
      );
      const rejected = catalog.rejectRuntimeContextSuggestion({
        context: firstSession,
        project_id: primary.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
        suggestion_clues: clues,
      });
      assert.equal(rejected.changed, true);
      assert.equal(rejected.rejected_project.project_id, primary.project_id);
      assert.equal(rejected.resolution.status, "suggested");
      assert.equal(rejected.resolution.connection, null);
      assert.deepEqual(rejected.resolution.suggested_projects.map((project) => project.project_id), [
        related.project_id,
      ]);
      assert.ok(rejected.resolution.available_projects.some((project) => project.project_id === primary.project_id));

      const replayedRejection = catalog.rejectRuntimeContextSuggestion({
        context: firstSession,
        project_id: primary.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
        suggestion_clues: clues,
      });
      assert.equal(replayedRejection.changed, false);
      assert.equal(replayedRejection.resolution.suggested_projects[0]?.project_id, related.project_id);

      const distinctSession = stableContext("codex", "new-session-b");
      const distinctResolution = catalog.resolveRuntimeContext(distinctSession, clues);
      assert.equal(distinctResolution.status, "suggested");
      assert.equal(distinctResolution.connection, null);
      assert.equal(distinctResolution.suggested_projects[0]?.project_id, primary.project_id);

      const bound = catalog.bindRuntimeContext({
        context: firstSession,
        project_id: related.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
      });
      assert.equal(bound.status, "bound");
      assert.equal(bound.connection?.project_id, related.project_id);
      assert.equal(catalog.resolveRuntimeContext(firstSession, clues).connection?.project_id, related.project_id);
      assert.equal(catalog.resolveRuntimeContext(distinctSession, clues).connection, null);

      const historyOnlySession = stableContext("codex", "new-session-from-confirmed-history");
      const historyOnlySuggestion = catalog.resolveRuntimeContext(historyOnlySession);
      assert.equal(historyOnlySuggestion.status, "suggested");
      assert.equal(historyOnlySuggestion.connection, null);
      assert.equal(historyOnlySuggestion.suggested_projects[0]?.project_id, related.project_id);
    } finally {
      catalog.close();
    }
  });
});

test("current Runtime can create and bind one new project without orphaning data on a rejected switch", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home", ".goalboard");
    const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: home });
    const context = stableContext("codex", "create-and-bind-entry");
    try {
      const created = await catalog.createProjectAndBindRuntimeContext({
        context,
        display_name: "当前 Runtime 项目",
        actor_id: "runtime-codex",
        user_confirmed: true,
        idempotency_key: "create-current-runtime-project",
      });
      assert.equal(created.status, "bound");
      assert.equal(created.project?.display_name, "当前 Runtime 项目");
      assert.equal(catalog.listProjects().length, 1);
      assert.ok(created.connection);
      assert.equal((await stat(created.connection.database_path)).isFile(), true);

      const replay = await catalog.createProjectAndBindRuntimeContext({
        context,
        display_name: "当前 Runtime 项目",
        actor_id: "runtime-codex",
        user_confirmed: true,
        idempotency_key: "create-current-runtime-project",
      });
      assert.equal(replay.connection?.project_id, created.connection?.project_id);
      assert.equal(catalog.listProjects().length, 1);

      await assert.rejects(
        () =>
          catalog.createProjectAndBindRuntimeContext({
            context,
            display_name: "同一个请求却换了名称",
            actor_id: "runtime-codex",
            user_confirmed: true,
            idempotency_key: "create-current-runtime-project",
          }),
        (error: unknown) =>
          error instanceof GoalBoardProjectCatalogError && error.code === "context.idempotency_conflict",
      );

      await assert.rejects(
        () =>
          catalog.createProjectAndBindRuntimeContext({
            context,
            display_name: "未经确认的切换项目",
            actor_id: "runtime-codex",
            user_confirmed: true,
            idempotency_key: "create-without-rebind-confirmation",
          }),
        (error: unknown) =>
          error instanceof GoalBoardProjectCatalogError && error.code === "context.rebind_confirmation_required",
      );
      assert.equal(catalog.listProjects().length, 1);

      await assert.rejects(
        () =>
          catalog.createProjectAndBindRuntimeContext({
            context: {
              runtime_id: "codex",
              stable_work_context_id: null,
              host_declares_stable: false,
            },
            display_name: "没有稳定入口的项目",
            actor_id: "runtime-codex",
            user_confirmed: true,
            idempotency_key: "create-without-stable-context",
          }),
        (error: unknown) =>
          error instanceof GoalBoardProjectCatalogError && error.code === "context.stable_identity_required",
      );
      assert.equal(catalog.listProjects().length, 1);
    } finally {
      catalog.close();
    }
  });
});

test("existing GoalBoard project catalogs migrate context-binding storage without touching project facts", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home", ".goalboard");
    const created = await GoalBoardProjectCatalog.open({ homeDirectory: home });
    const project = await created.createProject({ display_name: "迁移项目", actor_id: "user" });
    created.close();

    const databasePath = join(home, "projects", "catalog.db");
    const legacy = new Database(databasePath);
    try {
      legacy.exec("DROP TABLE runtime_context_binding_events; DROP TABLE runtime_context_bindings;");
      legacy.prepare("UPDATE catalog_meta SET value = '1' WHERE key = 'schema_version'").run();
    } finally {
      legacy.close();
    }

    const migrated = await GoalBoardProjectCatalog.open({ homeDirectory: home });
    try {
      assert.equal(migrated.getProject(project.project_id).database_path, project.database_path);
      const resolution = migrated.bindRuntimeContext({
        context: stableContext("codex", "migration-entry"),
        project_id: project.project_id,
        actor_id: "user",
        user_confirmed: true,
      });
      assert.equal(resolution.connection?.project_id, project.project_id);
      assert.equal(migrated.listRuntimeContextBindingEvents().length, 1);
    } finally {
      migrated.close();
    }
  });
});

test("v3 catalogs retain binding history while upgrading for unbind, deletion receipts, and suggestion rejection", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home", ".goalboard");
    const context = stableContext("codex", "v3-history-entry");
    const created = await GoalBoardProjectCatalog.open({ homeDirectory: home });
    const project = await created.createProject({ display_name: "V3 历史项目", actor_id: "user" });
    created.bindRuntimeContext({
      context,
      project_id: project.project_id,
      actor_id: "runtime-codex",
      user_confirmed: true,
    });
    created.close();

    const databasePath = join(home, "projects", "catalog.db");
    const legacy = new Database(databasePath);
    try {
      legacy.exec(`
        ALTER TABLE runtime_context_binding_events RENAME TO runtime_context_binding_events_v4;
        CREATE TABLE runtime_context_binding_events (
          event_id TEXT PRIMARY KEY,
          binding_id TEXT NOT NULL,
          runtime_id TEXT NOT NULL,
          stable_work_context_id TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('context.bound', 'context.rebound')),
          previous_project_id TEXT,
          project_id TEXT NOT NULL,
          actor_id TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        INSERT INTO runtime_context_binding_events (
          event_id, binding_id, runtime_id, stable_work_context_id, type,
          previous_project_id, project_id, actor_id, created_at
        )
        SELECT
          event_id, binding_id, runtime_id, stable_work_context_id, type,
          previous_project_id, project_id, actor_id, created_at
        FROM runtime_context_binding_events_v4;
        DROP TABLE runtime_context_binding_events_v4;
        CREATE INDEX runtime_context_binding_events_context_idx
          ON runtime_context_binding_events(runtime_id, stable_work_context_id, created_at, event_id);
        DROP TABLE project_deletions;
        DROP TABLE runtime_context_suggestion_rejections;
        UPDATE catalog_meta SET value = '3' WHERE key = 'schema_version';
      `);
    } finally {
      legacy.close();
    }

    const migrated = await GoalBoardProjectCatalog.open({ homeDirectory: home });
    try {
      assert.equal(migrated.resolveRuntimeContext(context).connection?.project_id, project.project_id);
      assert.deepEqual(migrated.listRuntimeContextBindingEvents(context).map((event) => event.type), ["context.bound"]);
      const unbound = migrated.unbindRuntimeContext({
        context,
        actor_id: "runtime-codex",
        user_confirmed: true,
      });
      assert.equal(unbound.changed, true);
      assert.deepEqual(
        migrated.listRuntimeContextBindingEvents(context).map((event) => event.type),
        ["context.bound", "context.unbound"],
      );
      const suggestionContext = stableContext("codex", "v3-new-session");
      const suggested = migrated.resolveRuntimeContext(suggestionContext, [
        { kind: "recent_project", value: project.project_id },
      ]);
      assert.equal(suggested.status, "suggested");
      const rejected = migrated.rejectRuntimeContextSuggestion({
        context: suggestionContext,
        project_id: project.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
        suggestion_clues: [{ kind: "recent_project", value: project.project_id }],
      });
      assert.equal(rejected.resolution.status, "unbound");
      assert.equal(migrated.getProject(project.project_id).board_id, project.board_id);
    } finally {
      migrated.close();
    }
  });
});

test("unbinding removes only the current Runtime entry and preserves the managed project", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home", ".goalboard");
    const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: home });
    const context = stableContext("codex", "unbind-current-entry");
    try {
      const project = await catalog.createProject({ display_name: "保留数据的项目", actor_id: "user" });
      catalog.bindRuntimeContext({
        context,
        project_id: project.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
      });

      assert.throws(
        () =>
          catalog.unbindRuntimeContext({
            context,
            actor_id: "runtime-codex",
            user_confirmed: false,
          }),
        (error: unknown) =>
          error instanceof GoalBoardProjectCatalogError && error.code === "context.user_confirmation_required",
      );
      assert.equal(catalog.resolveRuntimeContext(context).connection?.project_id, project.project_id);

      const unbound = catalog.unbindRuntimeContext({
        context,
        actor_id: "runtime-codex",
        user_confirmed: true,
      });
      assert.equal(unbound.changed, true);
      assert.equal(unbound.unbound_project?.project_id, project.project_id);
      assert.equal(unbound.resolution.status, "unbound");
      assert.equal((await stat(project.database_path)).isFile(), true);
      assert.equal(catalog.getProject(project.project_id).display_name, "保留数据的项目");

      const rebound = catalog.bindRuntimeContext({
        context,
        project_id: project.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
      });
      assert.equal(rebound.connection?.project_id, project.project_id);
      assert.deepEqual(
        catalog.listRuntimeContextBindingEvents(context).map((event) => event.type),
        ["context.bound", "context.unbound", "context.bound"],
      );
    } finally {
      catalog.close();
    }
  });
});

test("project deletion needs separate confirmation, protects active work, and records an idempotent receipt", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home", ".goalboard");
    const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: home });
    const context = stableContext("codex", "delete-current-entry");
    try {
      const project = await catalog.createProject({ display_name: "可删除项目", actor_id: "user" });
      catalog.bindRuntimeContext({
        context,
        project_id: project.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
      });
      const deletionInput = {
        project_id: project.project_id,
        actor_id: "runtime-codex",
        delete_confirmed: true,
        idempotency_key: "delete-managed-project-once",
      };

      await assert.rejects(
        () => catalog.deleteProject({ ...deletionInput, delete_confirmed: false }),
        (error: unknown) =>
          error instanceof GoalBoardProjectCatalogError && error.code === "catalog.delete_confirmation_required",
      );

      const store = new SqliteGoalBoardStore(project.database_path);
      let runId = "";
      try {
        const coordinator = new GoalBoardCoordinator(store);
        coordinator.createGoal(
          project.board_id,
          {
            goal_id: "active-project-work",
            title: "删除保护测试",
            outcome: "删除期间不能丢失进行中的工作",
            why: "验证项目删除门禁",
            business_logic: "有有效 Claim 或未结束 Run 时，删除必须被拒绝。",
            definition_state: "accepted",
            decomposition_state: "closed_leaf",
            acceptance_criteria: [
              {
                criterion_id: "active-project-work-check",
                statement: "删除被拒绝",
                decision_method: "automated_check",
                pass_condition: "删除调用返回 active-work 拒绝",
              },
            ],
          },
          { actor_id: "user", idempotency_key: "create-active-project-work" },
        );
        const claim = coordinator.claimGoal({
          board_id: project.board_id,
          goal_id: "active-project-work",
          actor_id: "runtime-codex",
          idempotency_key: "claim-active-project-work",
        }).claim;
        assert.ok(claim);
        runId = coordinator.startRun({
          board_id: project.board_id,
          claim_id: claim.claim_id,
          actor_id: "runtime-codex",
          idempotency_key: "start-active-project-work",
        }).run.run_id;
      } finally {
        store.close();
      }

      await assert.rejects(
        () => catalog.deleteProject(deletionInput),
        (error: unknown) =>
          error instanceof GoalBoardProjectCatalogError && error.code === "catalog.project_active_work",
      );
      assert.equal(catalog.getProject(project.project_id).project_id, project.project_id);

      const cleanupStore = new SqliteGoalBoardStore(project.database_path);
      try {
        new GoalBoardCoordinator(cleanupStore).reportRun({
          board_id: project.board_id,
          run_id: runId,
          actor_id: "runtime-codex",
          state: "abandoned",
          block_reason: "测试结束，允许删除",
          idempotency_key: "finish-active-project-work",
        });
      } finally {
        cleanupStore.close();
      }

      const deleted = await catalog.deleteProject(deletionInput);
      assert.equal(deleted.replayed, false);
      assert.equal(deleted.deletion.project_id, project.project_id);
      assert.equal(deleted.deletion.deleted_binding_count, 1);
      assert.equal(deleted.deletion.cleanup_state, "complete");
      assert.equal(catalog.resolveRuntimeContext(context).status, "unbound");
      assert.deepEqual(catalog.listProjects(), []);
      await assert.rejects(stat(join(home, "projects", project.project_id, "goalboard.db")));
      assert.equal(catalog.listProjectDeletions()[0]?.deletion_id, deleted.deletion.deletion_id);

      const replay = await catalog.deleteProject(deletionInput);
      assert.equal(replay.replayed, true);
      assert.equal(replay.deletion.deletion_id, deleted.deletion.deletion_id);

      const other = await catalog.createProject({ display_name: "不应被同键删除", actor_id: "user" });
      await assert.rejects(
        () => catalog.deleteProject({ ...deletionInput, project_id: other.project_id }),
        (error: unknown) =>
          error instanceof GoalBoardProjectCatalogError && error.code === "catalog.deletion_idempotency_conflict",
      );
      assert.equal(catalog.getProject(other.project_id).project_id, other.project_id);
    } finally {
      catalog.close();
    }
  });
});

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GoalBoardProjectCatalog } from "../src/projects/catalog.js";
import { reconcileLegacySessionCatalog } from "../src/sessions/compatibility.js";
import { GoalBoardSessionRegistry } from "../src/sessions/registry.js";

async function fixture(): Promise<{ directory: string; home: string; workspace: string }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "goalboard-session-migration-"));
  const home = path.join(directory, ".goalboard");
  const workspace = path.join(directory, "repo");
  await mkdir(workspace, { recursive: true });
  return { directory, home, workspace };
}

test("legacy bindings and panels reconcile idempotently without deleting compatibility facts", async () => {
  const data = await fixture();
  const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: data.home });
  const registry = await GoalBoardSessionRegistry.open({ homeDirectory: data.home });
  try {
    const project = await catalog.createProject({ display_name: "迁移项目", actor_id: "user" });
    const first = catalog.openDesktopPanel({
      project_id: project.project_id,
      goal_id: "goal-a",
      runtime_kind: "codex",
      launch_command: "codex",
      cwd: data.workspace,
      actor_id: "user",
      user_confirmed: true,
    });
    catalog.aliasDesktopPanelSession({
      panel_id: first.panel_id,
      runtime_id: "codex",
      host_session_id: "thread-a",
      actor_id: "panel",
    });
    catalog.openDesktopPanel({
      project_id: project.project_id,
      goal_id: "goal-b",
      runtime_kind: "codex",
      launch_command: "codex",
      cwd: data.workspace,
      actor_id: "user",
      user_confirmed: true,
    });
    catalog.bindRuntimeContext({
      context: {
        runtime_id: "claude-code",
        stable_work_context_id: "claude-external",
        host_declares_stable: true,
      },
      project_id: project.project_id,
      actor_id: "user",
      user_confirmed: true,
    });
    const panelCount = catalog.listDesktopPanels(project.project_id).length;
    const bindingCount = catalog.listRuntimeContextBindings().length;

    const firstReport = reconcileLegacySessionCatalog(catalog, registry);
    assert.equal(registry.list().length, 3);
    assert.equal(new Set(firstReport.session_ids).size, 3);
    assert.equal(registry.findByNativeRuntimeSession("codex", "thread-a")?.surface_id, first.panel_id);
    assert.equal(registry.list({ workspace_id: registry.list().find((item) => item.surface_id === first.panel_id)?.workspace_id ?? "" }).length, 2);

    const secondReport = reconcileLegacySessionCatalog(catalog, registry);
    assert.equal(registry.list().length, 3);
    assert.equal(secondReport.created_sessions, 0);
    assert.equal(catalog.listDesktopPanels(project.project_id).length, panelCount);
    assert.equal(catalog.listRuntimeContextBindings().length, bindingCount);
  } finally {
    registry.close();
    catalog.close();
    await rm(data.directory, { recursive: true, force: true });
  }
});

test("legacy reconciliation rolls back the whole Registry batch on failure", async () => {
  const data = await fixture();
  const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: data.home });
  const registry = await GoalBoardSessionRegistry.open({ homeDirectory: data.home });
  try {
    const project = await catalog.createProject({ display_name: "回滚项目", actor_id: "user" });
    catalog.openDesktopPanel({
      project_id: project.project_id,
      goal_id: "goal-a",
      runtime_kind: "codex",
      launch_command: "codex",
      cwd: data.workspace,
      actor_id: "user",
      user_confirmed: true,
    });
    assert.throws(
      () => reconcileLegacySessionCatalog(catalog, registry, (step) => {
        if (step === "after_panels") throw new Error("injected migration failure");
      }),
      /injected migration failure/,
    );
    assert.equal(registry.list().length, 0);
    assert.equal(catalog.listDesktopPanels(project.project_id).length, 1);
    assert.ok(catalog.listRuntimeContextBindings().length > 0);
  } finally {
    registry.close();
    catalog.close();
    await rm(data.directory, { recursive: true, force: true });
  }
});

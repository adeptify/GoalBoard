import assert from "node:assert/strict";
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, readdir, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

async function withTemporaryDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "goalboard-e2e-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForWeb(origin: string, child: ChildProcessWithoutNullStreams): Promise<string> {
  const deadline = Date.now() + 10_000;
  let lastError = "尚未响应";
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`GoalBoard Web 提前退出: ${child.exitCode}`);
    try {
      const response = await fetch(`${origin}/settings/diagnostics`);
      if (response.ok) return await response.text();
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`等待 GoalBoard Web 超时: ${lastError}`);
}

async function stopChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode != null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill("SIGTERM");
  await Promise.race([
    exited,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("子进程未在 SIGTERM 后退出")), 5_000)),
  ]);
}

function controlTokenFrom(html: string): string {
  const token = html.match(/<meta name="goalboard-control-token" content="([^"]+)">/)?.[1];
  assert.ok(token, "设置页必须包含本地控制 token");
  return token;
}

let webMutationSequence = 0;
function securePost(origin: string, token: string, pathname: string, body: Record<string, unknown>): Promise<Response> {
  webMutationSequence += 1;
  return fetch(`${origin}${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "x-goalboard-control-token": token,
      "x-goalboard-idempotency-key": `goalboard-e2e-web-${webMutationSequence}`,
    },
    body: JSON.stringify(body),
  });
}

interface McpToolResult {
  isError: boolean;
  content: Array<{ type: string; text: string }>;
}

class McpClient {
  private nextId = 1;
  private buffer = "";
  private readonly pending = new Map<number, { resolve(value: Record<string, unknown>): void; reject(error: Error): void }>();
  private readonly stderr: string[] = [];

  constructor(readonly child: ChildProcessWithoutNullStreams) {
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      this.buffer += chunk;
      while (true) {
        const boundary = this.buffer.indexOf("\n");
        if (boundary < 0) break;
        const line = this.buffer.slice(0, boundary).trim();
        this.buffer = this.buffer.slice(boundary + 1);
        if (!line) continue;
        const message = JSON.parse(line) as { id?: number } & Record<string, unknown>;
        if (typeof message.id !== "number") continue;
        const waiter = this.pending.get(message.id);
        if (!waiter) continue;
        this.pending.delete(message.id);
        waiter.resolve(message);
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => this.stderr.push(chunk));
    child.once("exit", (code) => {
      if (code === 0 || this.pending.size === 0) return;
      const error = new Error(`MCP 提前退出 (${code}): ${this.stderr.join("")}`);
      for (const waiter of this.pending.values()) waiter.reject(error);
      this.pending.clear();
    });
  }

  request(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    const response = new Promise<Record<string, unknown>>((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return response;
  }

  async initialize(): Promise<void> {
    const response = await this.request("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "goalboard-e2e", version: "1.0.0" },
    });
    assert.ok(response.result);
  }

  async call(
    name: string,
    args: Record<string, unknown>,
    meta?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const response = await this.request("tools/call", {
      name,
      arguments: args,
      ...(meta ? { _meta: meta } : {}),
    });
    const result = (response.result ?? {}) as McpToolResult;
    assert.equal(result.isError, false, result.content?.[0]?.text);
    return JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
  }

  async close(): Promise<void> {
    if (this.child.exitCode != null) return;
    const exited = new Promise<void>((resolve) => this.child.once("exit", () => resolve()));
    this.child.stdin.end();
    await exited;
  }
}

test("packed release completes fresh install, Web setup, Runtime dialogue, restart, removal, and upgrade", async () => {
  await withTemporaryDirectory(async (directory) => {
    const repository = process.cwd();
    const artifacts = join(directory, "artifacts");
    const runtimeRoot = join(directory, "runtime");
    const packageDirectory = join(runtimeRoot, "node_modules", "@adeptify", "goalboard");
    const goalboardHome = join(directory, "user", ".goalboard");
    const userHome = join(directory, "user");
    const fakeBin = join(directory, "fake-bin");
    await Promise.all([mkdir(artifacts, { recursive: true }), mkdir(dirname(packageDirectory), { recursive: true }), mkdir(fakeBin, { recursive: true })]);

    await execFileAsync("npm", ["pack", "--ignore-scripts", "--pack-destination", artifacts], { cwd: repository });
    const tarballName = (await readdir(artifacts)).find((name) => name.endsWith(".tgz"));
    assert.ok(tarballName, "npm pack 必须生成 tarball");
    await execFileAsync("tar", ["-xzf", join(artifacts, tarballName), "-C", dirname(packageDirectory)]);
    await rename(join(dirname(packageDirectory), "package"), packageDirectory);
    const packageMetadata = JSON.parse(await readFile(join(repository, "package.json"), "utf8")) as {
      version: string;
      dependencies?: Record<string, string>;
    };
    for (const dependency of Object.keys(packageMetadata.dependencies ?? {})) {
      await symlink(await realpath(join(repository, "node_modules", dependency)), join(runtimeRoot, "node_modules", dependency), "dir");
    }
    const fakeCodex = join(fakeBin, "codex");
    const fakeClaude = join(fakeBin, "claude");
    await writeFile(fakeCodex, "#!/bin/sh\nexit 0\n");
    await writeFile(fakeClaude, "#!/bin/sh\nexit 0\n");
    await chmod(fakeCodex, 0o755);
    await chmod(fakeClaude, 0o755);
    const unrelatedCodexConfig = "[features]\nnetwork_access = false\n";
    const unrelatedClaudeConfig = `${JSON.stringify({ privateNote: "keep", mcpServers: { other: { command: "other-mcp" } } }, null, 2)}\n`;
    await mkdir(join(userHome, ".codex"), { recursive: true });
    await writeFile(join(userHome, ".codex", "config.toml"), unrelatedCodexConfig);
    await writeFile(join(userHome, ".claude.json"), unrelatedClaudeConfig);
    const environment = {
      ...process.env,
      HOME: userHome,
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
    };

    assert.deepEqual(await readdir(dirname(goalboardHome)), [".claude.json", ".codex"]);
    const installOutput = await execFileAsync(
      process.execPath,
      [join(packageDirectory, "dist", "cli", "main.js"), "install", "--home", goalboardHome, "--source", packageDirectory, "--json"],
      { cwd: directory, env: environment, maxBuffer: 10 * 1024 * 1024 },
    );
    const installation = JSON.parse(installOutput.stdout) as {
      status: string;
      release_directory: string;
      launchers: { cli: string; mcp: string; web: string };
    };
    assert.equal(installation.status, "installed");
    assert.deepEqual(await readdir(join(goalboardHome, "projects")), []);
    assert.equal(await readFile(join(userHome, ".codex", "config.toml"), "utf8"), unrelatedCodexConfig);

    const packedReadme = await readFile(join(packageDirectory, "README.md"), "utf8");
    const packedChineseReadme = await readFile(join(packageDirectory, "README.zh.md"), "utf8");
    assert.match(packedReadme, /README\.zh\.md/);
    assert.match(packedReadme, /docs\/screenshots\/showcase\/desktop-focus-en-dark\.jpg/);
    assert.match(packedReadme, /docs\/screenshots\/showcase\/harness-narrow-en-dark\.jpg/);
    assert.match(packedReadme, /docs\/screenshots\/showcase\/harness-runtime-en-dark\.jpg/);
    assert.match(packedReadme, /docs\/screenshots\/showcase\/macos-menu-bar-capsule-en-dark\.jpg/);
    assert.match(packedReadme, /docs\/screenshots\/showcase\/web-workspace-en-dark\.jpg/);
    assert.doesNotMatch(packedReadme, /(?:-zh\.jpg|-zh\.png|light\.jpg|codex-internal)/);
    assert.match(packedChineseReadme, /docs\/screenshots\/showcase\/desktop-focus-zh-dark\.jpg/);
    assert.match(packedChineseReadme, /docs\/screenshots\/showcase\/harness-narrow-zh-dark\.jpg/);
    assert.match(packedChineseReadme, /docs\/screenshots\/showcase\/harness-runtime-zh-dark\.jpg/);
    assert.match(packedChineseReadme, /docs\/screenshots\/showcase\/macos-menu-bar-capsule-zh-dark\.jpg/);
    assert.match(packedChineseReadme, /docs\/screenshots\/showcase\/web-workspace-zh-dark\.jpg/);
    assert.doesNotMatch(packedChineseReadme, /(?:-en\.jpg|-en\.png|light\.jpg|codex-internal)/);
    assert.match(packedReadme, /pnpm install:local/);
    assert.match(packedReadme, /service install/);
    assert.match(packedReadme, /http:\/\/127\.0\.0\.1:4173/);
    assert.match(packedReadme, /docs\/installation\.en\.md/);
    assert.match(packedReadme, /docs\/runtime\.en\.md/);
    assert.match(packedReadme, /docs\/mcp\.en\.md/);
    assert.match(packedReadme, /skills\/goal-advance\/SKILL\.md/);
    assert.match(packedReadme, /MIT, see \[LICENSE\]/);
    assert.doesNotMatch(packedReadme, /postinstall-project|兼容模式|GOALBOARD_DATABASE=/);

    await rm(runtimeRoot, { recursive: true, force: true });
    await rm(artifacts, { recursive: true, force: true });
    const cliHelp = await execFileAsync(process.execPath, [installation.launchers.cli, "--help"], { cwd: directory, env: environment });
    assert.match(cliHelp.stdout, /goalboard v1 <operation>/);

    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    const web = spawn(process.execPath, [installation.launchers.web, "--home", goalboardHome, "--port", String(port)], {
      cwd: directory,
      env: environment,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let token: string;
    try {
      token = controlTokenFrom(await waitForWeb(origin, web));
      const diagnostics = await (await fetch(`${origin}/api/settings/diagnostics`)).json() as {
        installation_state: string;
        version: string;
        project_count: number;
      };
      assert.deepEqual(diagnostics, {
        installation_state: "ready",
        version: packageMetadata.version,
        project_count: 0,
        home_directory: goalboardHome,
        release_directory: installation.release_directory,
        launchers: [
          { name: "CLI", path: installation.launchers.cli, state: "ready" },
          { name: "MCP", path: installation.launchers.mcp, state: "ready" },
          { name: "Web", path: installation.launchers.web, state: "ready" },
        ],
      });

      const runtimePlanResponse = await securePost(origin, token, "/api/settings/runtimes/codex/plan", { action: "connect" });
      assert.equal(runtimePlanResponse.status, 200);
      const runtimePlan = await runtimePlanResponse.json() as { plan_id: string; status: string };
      assert.equal(runtimePlan.status, "ready");
      assert.equal(await readFile(join(userHome, ".codex", "config.toml"), "utf8"), unrelatedCodexConfig);
      const runtimeConfirm = await securePost(origin, token, "/api/settings/runtimes/codex/confirm", {
        plan_id: runtimePlan.plan_id,
        decision: "confirmed",
      });
      assert.equal(runtimeConfirm.status, 200, await runtimeConfirm.text());
      assert.match(await readFile(join(userHome, ".codex", "config.toml"), "utf8"), /GOALBOARD_RUNTIME_ID = "codex"/);
      const installedServiceStart = await readFile(
        join(userHome, ".codex", "skills", "goal-advance", "references", "service-start.md"),
        "utf8",
      );
      assert.match(installedServiceStart, /service status/);
      assert.match(installedServiceStart, /临时打开 GoalBoard/);
      const installedPlanning = await readFile(
        join(userHome, ".codex", "skills", "goal-advance", "references", "planning.md"),
        "utf8",
      );
      assert.match(installedPlanning, /The planning loop/);
      assert.match(installedPlanning, /consumer_goal depends_on provider_goal/);

      const claudePlanResponse = await securePost(origin, token, "/api/settings/runtimes/claude-code/plan", { action: "connect" });
      assert.equal(claudePlanResponse.status, 200);
      const claudePlan = await claudePlanResponse.json() as { plan_id: string; status: string };
      assert.equal(claudePlan.status, "ready");
      assert.equal(await readFile(join(userHome, ".claude.json"), "utf8"), unrelatedClaudeConfig);
      const claudeConfirm = await securePost(origin, token, "/api/settings/runtimes/claude-code/confirm", {
        plan_id: claudePlan.plan_id,
        decision: "confirmed",
      });
      assert.equal(claudeConfirm.status, 200, await claudeConfirm.text());
      const claudeConfig = JSON.parse(await readFile(join(userHome, ".claude.json"), "utf8") as string) as {
        privateNote: string;
        mcpServers: Record<string, { env?: Record<string, string> }>;
      };
      assert.equal(claudeConfig.privateNote, "keep");
      assert.ok(claudeConfig.mcpServers.other);
      assert.equal(claudeConfig.mcpServers.goalboard.env?.GOALBOARD_RUNTIME_ID, "claude-code");

      const projectResponse = await securePost(origin, token, "/api/settings/projects", {
        display_name: "全新安装项目",
        user_confirmed: true,
      });
      assert.equal(projectResponse.status, 201, await projectResponse.clone().text());
      const created = await projectResponse.json() as { project: { project_id: string } };

      const mcpEnvironment = {
        ...environment,
        GOALBOARD_HOME: goalboardHome,
        GOALBOARD_MCP_AUDIENCE: "runtime",
        GOALBOARD_RUNTIME_ID: "codex",
        CODEX_THREAD_ID: "fresh-install-e2e-session",
        GOALBOARD_WEB_URL: origin,
        PWD: directory,
      };
      const firstMcp = new McpClient(spawn(process.execPath, [installation.launchers.mcp], {
        cwd: directory,
        env: mcpEnvironment,
        stdio: ["pipe", "pipe", "pipe"],
      }));
      await firstMcp.initialize();
      const templates = await firstMcp.request("resources/templates/list", {});
      assert.deepEqual((templates.result as { resourceTemplates: unknown[] }).resourceTemplates, []);
      const unresolved = await firstMcp.call("goalboard_v1_context_resolve", {});
      assert.equal(unresolved.status, "unbound");
      assert.equal(unresolved.connection, null);
      const bound = await firstMcp.call("goalboard_v1_context_bind", {
        project_id: created.project.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
      }) as { connection: { board_id: string } };
      const started = await firstMcp.call("goalboard_v1_draft_dialogue_start", {
        board_id: bound.connection.board_id,
        actor_id: "runtime-codex",
        rough_idea: "让用户在当前 Runtime 中通过自然语言维护 GoalBoard。",
        idempotency_key: "fresh-install-draft-start",
      }) as { goal: { goal_id: string }; run: { run_id: string }; work_state: { work_state: string } };
      assert.equal(started.work_state.work_state, "clarifying");
      const contract = await firstMcp.call("goalboard_v1_contract", {
        board_id: bound.connection.board_id,
        goal_id: started.goal.goal_id,
      }) as { goal_url: string };
      assert.equal(
        contract.goal_url,
        `${origin}/projects/${encodeURIComponent(created.project.project_id)}/goals/${encodeURIComponent(started.goal.goal_id)}`,
      );
      const turn = await firstMcp.call("goalboard_v1_draft_dialogue_turn", {
        board_id: bound.connection.board_id,
        goal_id: started.goal.goal_id,
        run_id: started.run.run_id,
        actor_id: "runtime-codex",
        user_message: "Goal 只派发任务，当前 Runtime 负责继续对话并持久化澄清结果。",
        current_understanding: "当前 Runtime 在对话内推进 Draft，Web 不是必经步骤。",
        known_facts: [{ statement: "Web 不是必经步骤。", source_kind: "user_answer", confirmed_by_user: true }],
        next_question: "澄清完成后需要拆成哪些叶子 Goal？",
        idempotency_key: "fresh-install-draft-turn",
      }) as { dialogue: { next_question: string } };
      assert.match(turn.dialogue.next_question, /叶子 Goal/);
      await firstMcp.close();

      const restartedMcp = new McpClient(spawn(process.execPath, [installation.launchers.mcp], {
        cwd: directory,
        env: mcpEnvironment,
        stdio: ["pipe", "pipe", "pipe"],
      }));
      await restartedMcp.initialize();
      const restored = await restartedMcp.call("goalboard_v1_context_resolve", {}) as {
        status: string;
        connection: { project_id: string; board_id: string };
      };
      assert.equal(restored.status, "bound");
      assert.equal(restored.connection.project_id, created.project.project_id);
      const resumed = await restartedMcp.call("goalboard_v1_draft_dialogue_resume", {
        board_id: restored.connection.board_id,
        goal_id: started.goal.goal_id,
        actor_id: "runtime-codex",
        idempotency_key: "fresh-install-draft-resume",
      }) as { dialogue: { next_question: string } };
      assert.match(resumed.dialogue.next_question, /叶子 Goal/);
      await restartedMcp.close();

      const genericEnvironment = {
        ...environment,
        GOALBOARD_HOME: goalboardHome,
        GOALBOARD_MCP_AUDIENCE: "runtime",
        GOALBOARD_RUNTIME_ID: "generic-mcp-host",
        GOALBOARD_WEB_URL: origin,
        PWD: directory,
      };
      const genericMcp = new McpClient(spawn(process.execPath, [installation.launchers.mcp], {
        cwd: directory,
        env: genericEnvironment,
        stdio: ["pipe", "pipe", "pipe"],
      }));
      await genericMcp.initialize();
      const genericSessionA = { sessionId: "generic-session-a" };
      const genericSuggested = await genericMcp.call("goalboard_v1_context_resolve", {}, genericSessionA);
      assert.equal(genericSuggested.status, "suggested");
      assert.equal(genericSuggested.connection, null);
      const genericBound = await genericMcp.call("goalboard_v1_context_bind", {
        project_id: created.project.project_id,
        actor_id: "runtime-generic",
        user_confirmed: true,
      }, genericSessionA) as { status: string };
      assert.equal(genericBound.status, "bound");
      const freshGenericSession = await genericMcp.call(
        "goalboard_v1_context_resolve",
        {},
        { sessionId: "generic-session-b" },
      );
      assert.equal(freshGenericSession.status, "suggested");
      assert.equal(freshGenericSession.connection, null);
      await genericMcp.close();

      const removePlanResponse = await securePost(origin, token, "/api/settings/runtimes/codex/plan", { action: "remove" });
      assert.equal(removePlanResponse.status, 200);
      const removePlan = await removePlanResponse.json() as { plan_id: string; status: string };
      assert.equal(removePlan.status, "ready");
      const removeResponse = await securePost(origin, token, "/api/settings/runtimes/codex/confirm", {
        plan_id: removePlan.plan_id,
        decision: "confirmed",
      });
      assert.equal(removeResponse.status, 200, await removeResponse.text());
      assert.equal(await readFile(join(userHome, ".codex", "config.toml"), "utf8"), unrelatedCodexConfig);
      await assert.rejects(readFile(join(userHome, ".codex", "skills", "goal-advance", "SKILL.md"), "utf8"));

      const removeClaudePlanResponse = await securePost(origin, token, "/api/settings/runtimes/claude-code/plan", { action: "remove" });
      assert.equal(removeClaudePlanResponse.status, 200);
      const removeClaudePlan = await removeClaudePlanResponse.json() as { plan_id: string; status: string };
      assert.equal(removeClaudePlan.status, "ready");
      const removeClaudeResponse = await securePost(origin, token, "/api/settings/runtimes/claude-code/confirm", {
        plan_id: removeClaudePlan.plan_id,
        decision: "confirmed",
      });
      assert.equal(removeClaudeResponse.status, 200, await removeClaudeResponse.text());
      assert.deepEqual(
        JSON.parse(await readFile(join(userHome, ".claude.json"), "utf8")),
        JSON.parse(unrelatedClaudeConfig),
      );
      await assert.rejects(readFile(join(userHome, ".claude", "skills", "goal-advance", "SKILL.md"), "utf8"));
    } finally {
      await stopChild(web);
    }

    const upgradeVersion = `${packageMetadata.version}-upgrade-test`;
    const upgradeOutput = await execFileAsync(
      process.execPath,
      [installation.launchers.cli, "install", "--home", goalboardHome, "--source", installation.release_directory, "--version", upgradeVersion, "--json"],
      { cwd: directory, env: environment, maxBuffer: 10 * 1024 * 1024 },
    );
    const upgrade = JSON.parse(upgradeOutput.stdout) as { status: string; version: string; release_directory: string };
    assert.equal(upgrade.status, "upgraded");
    assert.equal(upgrade.version, upgradeVersion);
    assert.notEqual(upgrade.release_directory, installation.release_directory);
    const upgradedHelp = await execFileAsync(process.execPath, [installation.launchers.cli, "--help"], { cwd: directory, env: environment });
    assert.match(upgradedHelp.stdout, /goalboard v1 <operation>/);
  });
});

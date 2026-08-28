import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  GoalBoardWebServiceError,
  GoalBoardWebServiceManager,
  type GoalBoardWebServiceManagerOptions,
} from "../src/install/web-service.js";

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "goalboard-web-service-"));
  const userHome = join(directory, "user");
  const home = join(userHome, ".goalboard");
  await mkdir(join(home, "bin"), { recursive: true });
  await writeFile(join(home, "bin", "goalboard-web"), "#!/usr/bin/env node\n");
  let loaded = false;
  let printOutput = "state = running\npid = 4242\n";
  let bootstrapInProgressCount = 0;
  let bootstrapFailureCount = 0;
  let bootoutTransitionPrintCount = 0;
  let healthCheckFailuresRemaining = 0;
  let healthCheckCount = 0;
  let endpointProcessId: number | null = 4242;
  let portInUse = false;
  let healthCheckHook: ((expectedProcessId: number | undefined, count: number) => void) | null = null;
  const healthCheckExpectedProcessIds: Array<number | undefined> = [];
  const commands: string[][] = [];
  const managerOptions = {
    homeDirectory: home,
    userHomeDirectory: userHome,
    platform: "darwin",
    uid: 501,
    transitionDelayMilliseconds: 0,
    async healthCheck(expectedProcessId?: number) {
      healthCheckCount += 1;
      healthCheckExpectedProcessIds.push(expectedProcessId);
      healthCheckHook?.(expectedProcessId, healthCheckCount);
      if (healthCheckFailuresRemaining > 0) {
        healthCheckFailuresRemaining -= 1;
        return false;
      }
      return expectedProcessId == null || expectedProcessId === endpointProcessId;
    },
    async portCheck() { return portInUse; },
    async runCommand(file, args) {
      commands.push([file, ...args]);
      if (args[0] === "print") {
        if (bootoutTransitionPrintCount > 0) {
          bootoutTransitionPrintCount -= 1;
          if (bootoutTransitionPrintCount === 0) loaded = false;
          return { code: 0, stdout: "state = exited\n", stderr: "" };
        }
        return { code: loaded ? 0 : 113, stdout: loaded ? printOutput : "", stderr: loaded ? "" : "Could not find service" };
      }
      if (args[0] === "bootstrap") {
        if (bootstrapFailureCount > 0) {
          bootstrapFailureCount -= 1;
          return { code: 1, stdout: "", stderr: "injected bootstrap failure" };
        }
        if (bootstrapInProgressCount > 0) {
          bootstrapInProgressCount -= 1;
          return { code: 37, stdout: "", stderr: "" };
        }
        if (loaded) return { code: 5, stdout: "", stderr: "Bootstrap failed: 5: Input/output error" };
        loaded = true;
        printOutput = "state = running\npid = 4242\n";
        return { code: 0, stdout: "", stderr: "" };
      }
      if (args[0] === "kickstart") {
        if (loaded) printOutput = "state = running\npid = 4242\n";
        return { code: loaded ? 0 : 1, stdout: "", stderr: loaded ? "" : "not loaded" };
      }
      if (args[0] === "bootout") {
        if (bootoutTransitionPrintCount === 0) loaded = false;
        return { code: 0, stdout: "", stderr: "" };
      }
      return { code: 1, stdout: "", stderr: "unexpected" };
    },
  } satisfies GoalBoardWebServiceManagerOptions & { portCheck: () => Promise<boolean> };
  const manager = new GoalBoardWebServiceManager(managerOptions);
  return {
    directory,
    userHome,
    home,
    manager,
    commands,
    setLoaded: (value: boolean) => { loaded = value; },
    setPrintOutput: (value: string) => { printOutput = value; },
    setBootstrapInProgressCount: (value: number) => { bootstrapInProgressCount = value; },
    setBootstrapFailureCount: (value: number) => { bootstrapFailureCount = value; },
    setBootoutTransitionPrintCount: (value: number) => { bootoutTransitionPrintCount = value; },
    setHealthCheckFailures: (value: number) => { healthCheckFailuresRemaining = value; },
    setEndpointProcessId: (value: number | null) => { endpointProcessId = value; },
    setPortInUse: (value: boolean) => { portInUse = value; },
    setHealthCheckHook: (value: typeof healthCheckHook) => { healthCheckHook = value; },
    healthCheckCount: () => healthCheckCount,
    healthCheckExpectedProcessIds,
    isLoaded: () => loaded,
  };
}

async function makeOwnedConfigNeedRepair(item: Awaited<ReturnType<typeof fixture>>) {
  const outdatedPlist = (await readFile(item.manager.plistPath, "utf8"))
    .replace("<key>ThrottleInterval</key><integer>5</integer>", "<key>ThrottleInterval</key><integer>7</integer>");
  const outdatedReceipt = JSON.parse(await readFile(item.manager.receiptPath, "utf8")) as Record<string, unknown>;
  outdatedReceipt.plist_hash = createHash("sha256").update(outdatedPlist).digest("hex");
  const outdatedReceiptText = `${JSON.stringify(outdatedReceipt, null, 2)}\n`;
  await writeFile(item.manager.plistPath, outdatedPlist);
  await writeFile(item.manager.receiptPath, outdatedReceiptText);
  return { outdatedPlist, outdatedReceiptText };
}

test("macOS LaunchAgent preview is read-only and confirmed install is persistent and idempotent", async () => {
  const item = await fixture();
  try {
    const before = await item.manager.prepare("install");
    assert.equal(before.status, "ready");
    await assert.rejects(stat(item.manager.plistPath));
    assert.deepEqual(before.changes.map((change) => change.operation), ["create", "start"]);

    const installed = await item.manager.confirm({ plan_id: before.plan_id, decision: "confirmed" });
    assert.equal(installed.status, "installed");
    assert.equal(installed.detection.state, "running");
    const plist = await readFile(item.manager.plistPath, "utf8");
    assert.match(plist, /<key>RunAtLoad<\/key><true\/>/);
    assert.match(plist, /<key>KeepAlive<\/key><true\/>/);
    assert.match(plist, /<key>EnvironmentVariables<\/key>/);
    assert.match(plist, new RegExp(dirname(process.execPath).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(plist, new RegExp(item.home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(plist, /web-service\.log/);
    assert.match(plist, /web-service\.error\.log/);

    const repeated = await item.manager.prepare("install");
    assert.equal(repeated.status, "no_change");
    assert.equal((await item.manager.confirm({ plan_id: repeated.plan_id, decision: "confirmed" })).status, "unchanged");
  } finally {
    await rm(item.directory, { recursive: true, force: true });
  }
});

test("a loaded LaunchAgent whose process crashed is not reported as running", async () => {
  const item = await fixture();
  try {
    const install = await item.manager.prepare("install");
    await item.manager.confirm({ plan_id: install.plan_id, decision: "confirmed" });
    item.setPrintOutput("state = spawn scheduled\nactive count = 0\nlast exit code = 127\n");

    const detection = await item.manager.detect();
    assert.equal(detection.state, "stopped");
    assert.equal(detection.running, false);
    assert.match(detection.message, /进程未运行/);
    const start = await item.manager.prepare("start");
    const started = await item.manager.confirm({ plan_id: start.plan_id, decision: "confirmed" });
    assert.equal(started.detection.state, "running");
    assert.equal(item.commands.filter((command) => command[1] === "kickstart").length, 1);
  } finally {
    await rm(item.directory, { recursive: true, force: true });
  }
});

test("start waits for the Web health endpoint and never reports a process-only success", async () => {
  const delayed = await fixture();
  try {
    delayed.setHealthCheckFailures(3);
    const install = await delayed.manager.prepare("install");
    const installed = await delayed.manager.confirm({ plan_id: install.plan_id, decision: "confirmed" });
    assert.equal(installed.status, "installed");
    assert.equal(installed.detection.state, "running");
    assert.equal(delayed.healthCheckCount(), 6);
  } finally {
    await rm(delayed.directory, { recursive: true, force: true });
  }

  const unavailable = await fixture();
  try {
    unavailable.setHealthCheckFailures(30);
    const install = await unavailable.manager.prepare("install");
    await assert.rejects(
      () => unavailable.manager.confirm({ plan_id: install.plan_id, decision: "confirmed" }),
      (error: unknown) => error instanceof GoalBoardWebServiceError
        && error.code === "service.command_failed"
        && /健康检查仍未通过/.test(error.message),
    );
    assert.equal(unavailable.healthCheckCount(), 25);
    await assert.rejects(stat(unavailable.manager.plistPath));
    await assert.rejects(stat(unavailable.manager.receiptPath));
  } finally {
    await rm(unavailable.directory, { recursive: true, force: true });
  }
});

test("an occupied Web port blocks install before persistent files or launchctl mutations", async () => {
  for (const endpointProcessId of [9999, null]) {
    const item = await fixture();
    try {
      item.setPortInUse(true);
      item.setEndpointProcessId(endpointProcessId);

      const plan = await item.manager.prepare("install");

      assert.equal(plan.status, "conflict");
      assert.match(plan.message, /4173|端口|监听/);
      await assert.rejects(
        () => item.manager.confirm({ plan_id: plan.plan_id, decision: "confirmed" }),
        (error: unknown) => error instanceof GoalBoardWebServiceError
          && error.code === "service.conflict",
      );
      assert.equal(await exists(item.manager.plistPath), false);
      assert.equal(await exists(item.manager.receiptPath), false);
      assert.equal(
        item.commands.some((command) => ["bootstrap", "kickstart", "bootout"].includes(command[1]!)),
        false,
      );
    } finally {
      await rm(item.directory, { recursive: true, force: true });
    }
  }
});

test("an unrelated Web port listener does not block removing an absent GoalBoard service", async () => {
  const item = await fixture();
  try {
    item.setPortInUse(true);
    item.setEndpointProcessId(9999);

    const plan = await item.manager.prepare("remove");

    assert.equal(plan.status, "no_change");
    assert.equal((await item.manager.confirm({ plan_id: plan.plan_id, decision: "confirmed" })).status, "unchanged");
    assert.equal(
      item.commands.some((command) => ["bootstrap", "kickstart", "bootout"].includes(command[1]!)),
      false,
    );
  } finally {
    await rm(item.directory, { recursive: true, force: true });
  }
});

test("a port occupied after preview still blocks confirm before mutations", async () => {
  const item = await fixture();
  try {
    const plan = await item.manager.prepare("install");
    assert.equal(plan.status, "ready");
    item.setPortInUse(true);

    await assert.rejects(
      () => item.manager.confirm({ plan_id: plan.plan_id, decision: "confirmed" }),
      (error: unknown) => error instanceof GoalBoardWebServiceError
        && error.code === "service.conflict",
    );

    assert.equal(await exists(item.manager.plistPath), false);
    assert.equal(await exists(item.manager.receiptPath), false);
    assert.equal(
      item.commands.some((command) => ["bootstrap", "kickstart", "bootout"].includes(command[1]!)),
      false,
    );
  } finally {
    await rm(item.directory, { recursive: true, force: true });
  }
});

test("owned repair and unhealthy restart detect an external listener before bootout", async () => {
  for (const state of ["needs_repair", "unhealthy"] as const) {
    const item = await fixture();
    try {
      const install = await item.manager.prepare("install");
      await item.manager.confirm({ plan_id: install.plan_id, decision: "confirmed" });
      if (state === "needs_repair") await makeOwnedConfigNeedRepair(item);
      item.setEndpointProcessId(9999);
      item.setPortInUse(true);
      const mutationsBefore = item.commands.filter((command) =>
        ["bootstrap", "kickstart", "bootout"].includes(command[1]!),
      ).length;

      const plan = await item.manager.prepare(state === "needs_repair" ? "install" : "start");

      assert.equal(plan.status, "conflict");
      await assert.rejects(
        () => item.manager.confirm({ plan_id: plan.plan_id, decision: "confirmed" }),
        (error: unknown) => error instanceof GoalBoardWebServiceError
          && error.code === "service.conflict",
      );
      assert.equal(
        item.commands.filter((command) => ["bootstrap", "kickstart", "bootout"].includes(command[1]!)).length,
        mutationsBefore,
      );
      assert.equal(item.isLoaded(), true);
    } finally {
      await rm(item.directory, { recursive: true, force: true });
    }
  }
});

test("a loaded owned service with a missing plist is never stopped by automatic repair", async () => {
  const item = await fixture();
  try {
    const install = await item.manager.prepare("install");
    await item.manager.confirm({ plan_id: install.plan_id, decision: "confirmed" });
    await rm(item.manager.plistPath);
    const mutationsBefore = item.commands.filter((command) =>
      ["bootstrap", "kickstart", "bootout"].includes(command[1]!),
    ).length;

    const detection = await item.manager.detect();
    const repair = await item.manager.prepare("install");

    assert.equal(detection.running, true);
    assert.equal(repair.status, "conflict");
    assert.match(repair.message, /plist|配置|回滚|运行/);
    assert.equal(
      item.commands.filter((command) => ["bootstrap", "kickstart", "bootout"].includes(command[1]!)).length,
      mutationsBefore,
    );
    assert.equal(item.isLoaded(), true);
  } finally {
    await rm(item.directory, { recursive: true, force: true });
  }
});

test("install rejects another process health response and rolls back only its own files", async () => {
  const item = await fixture();
  try {
    item.setEndpointProcessId(9999);
    const plan = await item.manager.prepare("install");

    await assert.rejects(
      () => item.manager.confirm({ plan_id: plan.plan_id, decision: "confirmed" }),
      (error: unknown) => error instanceof GoalBoardWebServiceError
        && error.code === "service.command_failed"
        && /实例|进程|健康/.test(error.message),
    );

    assert.ok(item.healthCheckExpectedProcessIds.some((processId) => processId === 4242));
    assert.equal(await exists(item.manager.plistPath), false);
    assert.equal(await exists(item.manager.receiptPath), false);
  } finally {
    await rm(item.directory, { recursive: true, force: true });
  }
});

test("readiness follows the current LaunchAgent pid across a KeepAlive restart", async () => {
  const item = await fixture();
  try {
    item.setEndpointProcessId(9999);
    item.setHealthCheckHook((expectedProcessId, count) => {
      if (count !== 1 || expectedProcessId !== 4242) return;
      item.setPrintOutput("state = running\npid = 4343\n");
      item.setEndpointProcessId(4343);
    });
    const plan = await item.manager.prepare("install");

    const result = await item.manager.confirm({ plan_id: plan.plan_id, decision: "confirmed" });

    assert.equal(result.status, "installed");
    assert.equal(result.detection.state, "running");
    assert.ok(item.healthCheckExpectedProcessIds.includes(4242));
    assert.ok(item.healthCheckExpectedProcessIds.includes(4343));
  } finally {
    await rm(item.directory, { recursive: true, force: true });
  }
});

test("install does not report success when final owned-instance verification is lost", async () => {
  const item = await fixture();
  try {
    item.setHealthCheckHook((_expectedProcessId, count) => {
      if (count === 3) item.setEndpointProcessId(9999);
    });
    const plan = await item.manager.prepare("install");

    await assert.rejects(
      () => item.manager.confirm({ plan_id: plan.plan_id, decision: "confirmed" }),
      (error: unknown) => error instanceof GoalBoardWebServiceError
        && error.code === "service.command_failed"
        && /实例|运行状态/.test(error.message),
    );

    assert.equal(await exists(item.manager.plistPath), false);
    assert.equal(await exists(item.manager.receiptPath), false);
  } finally {
    await rm(item.directory, { recursive: true, force: true });
  }
});

test("a failed owned repair restores the prior files and running state", async () => {
  for (const previouslyRunning of [false, true]) {
    const item = await fixture();
    try {
      const firstInstall = await item.manager.prepare("install");
      await item.manager.confirm({ plan_id: firstInstall.plan_id, decision: "confirmed" });
      if (!previouslyRunning) {
        const stop = await item.manager.prepare("stop");
        await item.manager.confirm({ plan_id: stop.plan_id, decision: "confirmed" });
      }

      const { outdatedPlist, outdatedReceiptText } = await makeOwnedConfigNeedRepair(item);
      const projectSentinel = join(item.home, "projects", "keep.txt");
      const logSentinel = join(item.home, "logs", "web-service.log");
      await mkdir(dirname(projectSentinel), { recursive: true });
      await mkdir(dirname(logSentinel), { recursive: true });
      await writeFile(projectSentinel, "project data stays\n");
      await writeFile(logSentinel, "existing log stays\n");
      assert.equal((await item.manager.detect()).state, "needs_repair");

      item.setBootstrapFailureCount(1);
      const repair = await item.manager.prepare("install");
      await assert.rejects(
        () => item.manager.confirm({ plan_id: repair.plan_id, decision: "confirmed" }),
        (error: unknown) => error instanceof GoalBoardWebServiceError
          && error.code === "service.command_failed",
      );

      assert.equal(await readFile(item.manager.plistPath, "utf8"), outdatedPlist);
      assert.equal(await readFile(item.manager.receiptPath, "utf8"), outdatedReceiptText);
      assert.equal(item.isLoaded(), previouslyRunning);
      assert.equal(await readFile(projectSentinel, "utf8"), "project data stays\n");
      assert.equal(await readFile(logSentinel, "utf8"), "existing log stays\n");
    } finally {
      await rm(item.directory, { recursive: true, force: true });
    }
  }
});

test("failed start and restart restore the prior launchctl running state", async () => {
  for (const failure of ["bootstrap", "health"] as const) {
    for (const previouslyRunning of [false, true]) {
      const item = await fixture();
      try {
        const install = await item.manager.prepare("install");
        await item.manager.confirm({ plan_id: install.plan_id, decision: "confirmed" });
        if (!previouslyRunning) {
          const stop = await item.manager.prepare("stop");
          await item.manager.confirm({ plan_id: stop.plan_id, decision: "confirmed" });
        }
        if (failure === "bootstrap") item.setBootstrapFailureCount(1);
        else item.setEndpointProcessId(9999);

        const action = await item.manager.prepare(previouslyRunning ? "restart" : "start");
        await assert.rejects(
          () => item.manager.confirm({ plan_id: action.plan_id, decision: "confirmed" }),
          (error: unknown) => error instanceof GoalBoardWebServiceError
            && error.code === "service.command_failed",
        );

        assert.equal(item.isLoaded(), previouslyRunning, `${failure}/${previouslyRunning}`);
      } finally {
        await rm(item.directory, { recursive: true, force: true });
      }
    }
  }
});

test("service status reports a running process with an unavailable page as unhealthy and start repairs it", async () => {
  const item = await fixture();
  try {
    const install = await item.manager.prepare("install");
    await item.manager.confirm({ plan_id: install.plan_id, decision: "confirmed" });

    item.setHealthCheckFailures(1);
    const start = await item.manager.prepare("start");
    assert.equal(start.detection.state, "unhealthy");
    assert.equal(start.status, "ready");
    assert.match(start.detection.message, /页面暂时不可访问/);

    const started = await item.manager.confirm({ plan_id: start.plan_id, decision: "confirmed" });
    assert.equal(started.status, "started");
    assert.equal(started.detection.state, "running");
    assert.ok(item.commands.some((command) => command[1] === "bootout"));
    assert.ok(item.commands.some((command) => command[1] === "bootstrap"));
  } finally {
    await rm(item.directory, { recursive: true, force: true });
  }
});

test("stop, start, restart, and remove have distinct owned behavior", async () => {
  const item = await fixture();
  try {
    const install = await item.manager.prepare("install");
    await item.manager.confirm({ plan_id: install.plan_id, decision: "confirmed" });

    const stop = await item.manager.prepare("stop");
    assert.equal((await item.manager.confirm({ plan_id: stop.plan_id, decision: "confirmed" })).status, "stopped");
    assert.equal((await item.manager.detect()).state, "stopped");
    assert.ok((await stat(item.manager.plistPath)).isFile());

    const start = await item.manager.prepare("start");
    assert.equal((await item.manager.confirm({ plan_id: start.plan_id, decision: "confirmed" })).status, "started");
    const bootstrapCountBeforeRestart = item.commands.filter((command) => command[1] === "bootstrap").length;
    const restart = await item.manager.prepare("restart");
    item.setBootoutTransitionPrintCount(4);
    item.setBootstrapInProgressCount(8);
    assert.equal((await item.manager.confirm({ plan_id: restart.plan_id, decision: "confirmed" })).status, "restarted");
    assert.equal(
      item.commands.filter((command) => command[1] === "bootstrap").length - bootstrapCountBeforeRestart,
      9,
    );
    assert.equal(item.commands.filter((command) => command[1] === "kickstart").length, 0);

    const remove = await item.manager.prepare("remove");
    const removed = await item.manager.confirm({ plan_id: remove.plan_id, decision: "confirmed" });
    assert.equal(removed.status, "removed");
    assert.equal(removed.detection.state, "absent");
    await assert.rejects(stat(item.manager.plistPath));
    await assert.rejects(stat(item.manager.receiptPath));
    assert.ok(item.commands.some((command) => command.includes("bootout")));
  } finally {
    await rm(item.directory, { recursive: true, force: true });
  }
});

test("an owned service can be removed safely after its launcher disappears", async () => {
  const item = await fixture();
  try {
    const install = await item.manager.prepare("install");
    await item.manager.confirm({ plan_id: install.plan_id, decision: "confirmed" });
    await rm(join(item.home, "bin", "goalboard-web"));

    const detection = await item.manager.detect();
    assert.equal(detection.state, "unavailable");
    assert.equal(detection.owned, true);
    assert.equal((await item.manager.prepare("install")).status, "conflict");

    const remove = await item.manager.prepare("remove");
    assert.equal(remove.status, "ready");
    assert.equal((await item.manager.confirm({ plan_id: remove.plan_id, decision: "confirmed" })).status, "removed");
    await assert.rejects(stat(item.manager.plistPath));
    await assert.rejects(stat(item.manager.receiptPath));
  } finally {
    await rm(item.directory, { recursive: true, force: true });
  }
});

test("remove is already complete when neither service files nor launcher remain", async () => {
  const item = await fixture();
  try {
    await rm(join(item.home, "bin", "goalboard-web"));
    const detection = await item.manager.detect();
    assert.equal(detection.state, "unavailable");
    assert.equal(detection.owned, false);
    const remove = await item.manager.prepare("remove");
    assert.equal(remove.status, "no_change");
    assert.equal((await item.manager.confirm({ plan_id: remove.plan_id, decision: "confirmed" })).status, "unchanged");
  } finally {
    await rm(item.directory, { recursive: true, force: true });
  }
});

test("unknown or changed LaunchAgents are never overwritten or removed", async () => {
  const item = await fixture();
  try {
    const install = await item.manager.prepare("install");
    await item.manager.confirm({ plan_id: install.plan_id, decision: "confirmed" });
    await writeFile(item.manager.plistPath, "user changed this plist\n");
    assert.equal((await item.manager.detect()).state, "conflict");
    const remove = await item.manager.prepare("remove");
    assert.equal(remove.status, "conflict");
    await assert.rejects(
      () => item.manager.confirm({ plan_id: remove.plan_id, decision: "confirmed" }),
      (error: unknown) => error instanceof GoalBoardWebServiceError && error.code === "service.conflict",
    );
    assert.equal(await readFile(item.manager.plistPath, "utf8"), "user changed this plist\n");
  } finally {
    await rm(item.directory, { recursive: true, force: true });
  }
});

test("stale plans and failed launchctl installs leave no owned service files", async () => {
  const item = await fixture();
  try {
    const stale = await item.manager.prepare("install");
    await mkdir(join(item.userHome, "Library", "LaunchAgents"), { recursive: true });
    await writeFile(item.manager.plistPath, "external plist\n");
    await assert.rejects(
      () => item.manager.confirm({ plan_id: stale.plan_id, decision: "confirmed" }),
      (error: unknown) => error instanceof GoalBoardWebServiceError && error.code === "service.plan_stale",
    );
  } finally {
    await rm(item.directory, { recursive: true, force: true });
  }

  const failed = await fixture();
  try {
    const manager = new GoalBoardWebServiceManager({
      homeDirectory: failed.home,
      userHomeDirectory: failed.userHome,
      platform: "darwin",
      uid: 501,
      async portCheck() { return false; },
      async runCommand() { return { code: 1, stdout: "", stderr: "injected launch failure" }; },
    });
    const plan = await manager.prepare("install");
    await assert.rejects(
      () => manager.confirm({ plan_id: plan.plan_id, decision: "confirmed" }),
      (error: unknown) => error instanceof GoalBoardWebServiceError && error.code === "service.command_failed",
    );
    await assert.rejects(stat(manager.plistPath));
    await assert.rejects(stat(manager.receiptPath));
  } finally {
    await rm(failed.directory, { recursive: true, force: true });
  }
});

test("non-macOS reports unsupported without pretending to install", async () => {
  const item = await fixture();
  try {
    const manager = new GoalBoardWebServiceManager({
      homeDirectory: item.home,
      userHomeDirectory: item.userHome,
      platform: "linux",
    });
    const detection = await manager.detect();
    assert.equal(detection.state, "unsupported");
    assert.equal((await manager.prepare("install")).status, "unsupported");
  } finally {
    await rm(item.directory, { recursive: true, force: true });
  }
});

test("public CLI service command previews without writing until --confirm", async () => {
  const item = await fixture();
  try {
    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), "dist", "cli", "main.js"), "service", "install", "--home", item.home, "--json"],
      { encoding: "utf8" },
    );
    assert.ok(
      process.platform === "darwin" ? result.status === 0 || result.status === 1 : result.status === 1,
      result.stderr,
    );
    const plan = JSON.parse(result.stdout) as { action: string; status: string; changes: unknown[] };
    assert.equal(plan.action, "install");
    if (process.platform === "darwin") {
      assert.ok(plan.status === "ready" || plan.status === "conflict");
      assert.equal(result.status, plan.status === "ready" ? 0 : 1);
    } else {
      assert.equal(plan.status, "unsupported");
    }
    assert.equal(await exists(item.manager.plistPath), false);
  } finally {
    await rm(item.directory, { recursive: true, force: true });
  }
});

async function exists(filePath: string): Promise<boolean> {
  try { await stat(filePath); return true; } catch { return false; }
}

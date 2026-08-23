#!/usr/bin/env node
import { installGoalBoardHome, type GoalBoardHomeInstallResult } from "../install/home.js";
import { GoalBoardUninstallService, type GoalBoardUninstallPlan } from "../install/uninstall.js";
import {
  GoalBoardWebServiceManager,
  type GoalBoardWebServiceAction,
  type GoalBoardWebServicePlan,
} from "../install/web-service.js";
import { printV1Help, runV1Cli } from "../v1/cli.js";
import { withGoalBoardProjectCatalog } from "../projects/catalog-session.js";

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function printInstallHelp(): void {
  console.log(`goalboard install [--home PATH] [--source PATH] [--version VERSION] [--json]

默认只把 GoalBoard 自身写入 ~/.goalboard，不创建或启动项目，也不修改任何 Runtime 配置。`);
}

function printServiceHelp(): void {
  console.log(`goalboard service status [--home PATH] [--json]
goalboard service <install|start|stop|restart|remove> [--home PATH] [--confirm] [--json]

写操作默认只显示预览；只有显式传入 --confirm 才会修改 macOS 用户级 LaunchAgent。`);
}

function printUninstallHelp(): void {
  console.log(`goalboard uninstall [--home PATH] [--confirm] [--json]
goalboard uninstall --purge-user-data --confirm --confirm-home PATH --confirm-project-count N [--home PATH] [--json]

普通卸载保留用户项目、catalog、备份和日志。永久清除用户数据是独立操作，必须再次提供精确目录和项目数量。`);
}

function printDemoHelp(): void {
  console.log(`goalboard demo <create|reset|remove> [--home PATH] [--confirm] [--json]

不带 --confirm 只显示将发生什么；demo 明确标记为可重建数据，不会与用户项目混淆。`);
}

function installStatusLabel(status: GoalBoardHomeInstallResult["status"]): string {
  if (status === "installed") return "安装完成";
  if (status === "upgraded") return "升级完成";
  if (status === "refreshed") return "同版本内容已刷新";
  if (status === "repaired") return "修复完成";
  return "已经是最新状态";
}

function displayCommand(args: string[]): string {
  return args.map((value) => (/^[0-9A-Za-z_./:+-]+$/.test(value) ? value : JSON.stringify(value))).join(" ");
}

function printInstallResult(result: GoalBoardHomeInstallResult): void {
  console.log(`GoalBoard ${installStatusLabel(result.status)}（${result.version}）`);
  console.log(`安装目录：${result.home_directory}`);
  console.log(`CLI：${result.launchers.cli}`);
  console.log(`MCP：${result.launchers.mcp}`);
  console.log(`Web：${result.launchers.web}`);
  console.log(result.next_steps.message);
  console.log(`可选打开 Web：${displayCommand(result.next_steps.web_command)}`);
  console.log(`可选启用常驻 Web：${displayCommand(result.next_steps.service_install_command)}`);
  if (result.status === "refreshed") {
    console.log(`若常驻 Web 正在运行，请确认重启：${displayCommand(result.next_steps.service_restart_command)}`);
  }
}

function printServicePlan(plan: GoalBoardWebServicePlan): void {
  console.log(plan.message);
  console.log(`状态：${plan.status}`);
  console.log(`LaunchAgent：${plan.detection.plist_path}`);
  console.log(`命令：${displayCommand(plan.detection.command)}`);
  console.log(`日志：${plan.detection.stdout_log} / ${plan.detection.stderr_log}`);
  for (const change of plan.changes) console.log(`- ${change.operation}: ${change.target}`);
  if (plan.status === "ready") console.log(`未执行。确认后重新运行并加 --confirm：${plan.confirmation}`);
}

function printUninstallPlan(plan: GoalBoardUninstallPlan): void {
  console.log(plan.message);
  console.log(`状态：${plan.status}`);
  console.log(`用户项目：${plan.user_project_count}（${plan.purge_user_data ? "将永久删除" : "保留"}）`);
  console.log(`可重建 demo：${plan.demo_project_count}`);
  for (const change of plan.changes) console.log(`- ${change.description}: ${change.target}`);
  for (const conflict of plan.conflicts) console.log(`冲突：${conflict}`);
  console.log(plan.confirmation);
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  try {
    if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
      console.log("GoalBoard commands: goalboard install | goalboard service <operation> | goalboard demo <operation> | goalboard uninstall | goalboard v1 <operation>\n");
      printV1Help();
      return 0;
    }
    if (args[0] === "install") {
      if (args.includes("--help") || args.includes("-h")) {
        printInstallHelp();
        return 0;
      }
      const result = await installGoalBoardHome({
        homeDirectory: flag(args, "--home"),
        sourceDirectory: flag(args, "--source"),
        version: flag(args, "--version"),
      });
      if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
      else printInstallResult(result);
      return 0;
    }
    if (args[0] === "service") {
      if (args.includes("--help") || args.includes("-h") || !args[1]) {
        printServiceHelp();
        return 0;
      }
      const manager = new GoalBoardWebServiceManager({ homeDirectory: flag(args, "--home") });
      if (args[1] === "status") {
        const detection = await manager.detect();
        if (args.includes("--json")) console.log(JSON.stringify(detection, null, 2));
        else {
          console.log(detection.message);
          console.log(`状态：${detection.state}`);
          console.log(`LaunchAgent：${detection.plist_path}`);
          console.log(`日志：${detection.stdout_log} / ${detection.stderr_log}`);
        }
        return 0;
      }
      const action = args[1] as GoalBoardWebServiceAction;
      if (!["install", "start", "stop", "restart", "remove"].includes(action)) {
        throw new Error(`未知常驻服务操作: ${args[1]}`);
      }
      const plan = await manager.prepare(action);
      if (!args.includes("--confirm")) {
        if (args.includes("--json")) console.log(JSON.stringify(plan, null, 2));
        else printServicePlan(plan);
        return plan.status === "conflict" || plan.status === "unsupported" ? 1 : 0;
      }
      const result = await manager.confirm({ plan_id: plan.plan_id, decision: "confirmed" });
      if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
      else console.log(result.message);
      return 0;
    }
    if (args[0] === "demo") {
      if (args.includes("--help") || args.includes("-h") || !args[1]) {
        printDemoHelp();
        return 0;
      }
      const action = args[1];
      if (!["create", "reset", "remove"].includes(action)) throw new Error(`未知 demo 操作: ${action}`);
      const homeDirectory = flag(args, "--home");
      return await withGoalBoardProjectCatalog({ homeDirectory }, async (catalog) => {
        const demo = catalog.listProjects().find((project) => project.data_class === "regenerable_demo") ?? null;
        if (!args.includes("--confirm")) {
          const preview = {
            action,
            status: action === "create" && demo ? "no_change" : action !== "create" && !demo ? "unavailable" : "ready",
            demo_project: demo,
            confirmation: action === "create"
              ? "确认创建明确标记为可重建数据的示例项目"
              : action === "reset"
                ? "确认用内置示例重新生成 demo；其中的改动会被清除"
                : "确认删除这个可重建 demo；用户项目不受影响",
          };
          if (args.includes("--json")) console.log(JSON.stringify(preview, null, 2));
          else console.log(`${preview.confirmation}\n未执行；确认后重新运行并加 --confirm。`);
          return preview.status === "unavailable" ? 1 : 0;
        }
        const result = action === "create"
          ? await catalog.ensureDemoProject({ actor_id: "goalboard-cli", user_confirmed: true })
          : action === "reset"
            ? await catalog.resetDemoProject({ actor_id: "goalboard-cli", user_confirmed: true })
            : demo
              ? await catalog.removeDemoProject({
                  project_id: demo.project_id,
                  actor_id: "goalboard-cli",
                  delete_confirmed: true,
                  idempotency_key: `demo-remove-${randomId()}`,
                })
              : null;
        if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
        else console.log(action === "remove" ? "可重建 demo 已删除；用户项目未修改" : `demo ${action === "create" ? "已创建或打开" : "已重置"}`);
        return result == null ? 1 : 0;
      });
    }
    if (args[0] === "uninstall") {
      if (args.includes("--help") || args.includes("-h")) {
        printUninstallHelp();
        return 0;
      }
      const service = new GoalBoardUninstallService({ homeDirectory: flag(args, "--home") });
      const purgeUserData = args.includes("--purge-user-data");
      const plan = await service.prepare({ purge_user_data: purgeUserData });
      if (!args.includes("--confirm")) {
        if (args.includes("--json")) console.log(JSON.stringify(plan, null, 2));
        else printUninstallPlan(plan);
        return plan.status === "conflict" ? 1 : 0;
      }
      const projectCountFlag = flag(args, "--confirm-project-count");
      const result = await service.confirm({
        plan_id: plan.plan_id,
        decision: "confirmed",
        ...(purgeUserData ? {
          purge_confirmation: {
            home_directory: flag(args, "--confirm-home") ?? "",
            user_project_count: projectCountFlag == null ? Number.NaN : Number(projectCountFlag),
          },
        } : {}),
      });
      if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
      else console.log(result.message);
      return 0;
    }
    if (args[0] !== "v1") {
      throw new Error(`未知命令: ${args[0]}。GoalBoard 提供 install、service、demo、uninstall 和 v1 <operation>。`);
    }
    return await runV1Cli(args.slice(1));
  } catch (error) {
    console.error(`错误: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

function randomId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("cli/main.ts") ||
    process.argv[1].endsWith("cli/main.js") ||
    process.argv[1].endsWith("goalboard"));

if (isMain) {
  main().then((code) => process.exit(code));
}

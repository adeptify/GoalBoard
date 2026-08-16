#!/usr/bin/env node
import { installGoalBoardHome, type GoalBoardHomeInstallResult } from "../install/home.js";
import { printV1Help, runV1Cli } from "../v1/cli.js";

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function printInstallHelp(): void {
  console.log(`goalboard install [--home PATH] [--source PATH] [--version VERSION] [--json]

默认只把 GoalBoard 自身写入 ~/.goalboard，不创建或启动项目，也不修改任何 Runtime 配置。`);
}

function installStatusLabel(status: GoalBoardHomeInstallResult["status"]): string {
  if (status === "installed") return "安装完成";
  if (status === "upgraded") return "升级完成";
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
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  try {
    if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
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
    if (args[0] !== "v1") {
      throw new Error(`未知命令: ${args[0]}。GoalBoard 只提供 goalboard install 和 goalboard v1 <operation>。`);
    }
    return await runV1Cli(args.slice(1));
  } catch (error) {
    console.error(`错误: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("cli/main.ts") ||
    process.argv[1].endsWith("cli/main.js") ||
    process.argv[1].endsWith("goalboard"));

if (isMain) {
  main().then((code) => process.exit(code));
}

#!/usr/bin/env node
import { installGoalBoardHome } from "../install/home.js";
import {
  applyPostInstallProjectSelection,
  type GoalBoardPostInstallProjectAction,
} from "../install/postinstall-project-selection.js";
import { printV1Help, runV1Cli } from "../v1/cli.js";
import fs from "node:fs";

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function printInstallHelp(): void {
  console.log(`goalboard install [--home PATH] [--source PATH] [--version VERSION]

默认只把 GoalBoard 自身写入 ~/.goalboard，不创建或启动项目，也不修改任何 Runtime 配置。`);
}

function printProjectSetupHelp(): void {
  console.log(`goalboard project-setup [--home PATH] --json '{...}'

读取一份由用户在当前对话逐项确认的项目操作。JSON 形状：
{
  "actions": [{ "action_id": "...", "kind": "create|import|enable|start", ... }],
  "confirmed_action_ids": ["每一项已明确确认的 action_id"],
  "idempotency_key": "本次已确认选择的稳定请求键"
}

默认没有已选择操作。未出现在 confirmed_action_ids 中的操作必定跳过；不会创建、导入、启用、启动项目，也不会修改 Runtime 配置。start 只在支持的 Runtime 或桌面宿主提供启动器时执行；CLI 不会偷偷启动后台服务。`);
}

function projectSetupPayload(args: string[]): {
  actions: GoalBoardPostInstallProjectAction[];
  confirmed_action_ids: string[];
  idempotency_key: string;
} {
  const inline = flag(args, "--json");
  const file = flag(args, "--file");
  if (inline && file) throw new Error("project-setup 只能使用 --json 或 --file 其中一个。");
  if (!inline && !file) throw new Error("project-setup 需要包含 actions 和 confirmed_action_ids 的 --json 或 --file。");
  const text = inline ?? fs.readFileSync(file!, "utf8");
  const parsed = JSON.parse(text) as { actions?: unknown; confirmed_action_ids?: unknown; idempotency_key?: unknown };
  if (
    !Array.isArray(parsed.actions) ||
    !Array.isArray(parsed.confirmed_action_ids) ||
    typeof parsed.idempotency_key !== "string" ||
    !parsed.idempotency_key.trim()
  ) {
    throw new Error("project-setup JSON 必须包含 actions 数组、confirmed_action_ids 数组和 idempotency_key。");
  }
  return {
    actions: parsed.actions as GoalBoardPostInstallProjectAction[],
    confirmed_action_ids: parsed.confirmed_action_ids as string[],
    idempotency_key: parsed.idempotency_key,
  };
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
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (args[0] === "project-setup") {
      if (args.includes("--help") || args.includes("-h")) {
        printProjectSetupHelp();
        return 0;
      }
      const payload = projectSetupPayload(args);
      const result = await applyPostInstallProjectSelection({
        home_directory: flag(args, "--home"),
        ...payload,
      });
      console.log(JSON.stringify(result, null, 2));
      return result.failed_action_ids.length > 0 ? 1 : 0;
    }
    if (args[0] !== "v1") {
      throw new Error(`未知命令: ${args[0]}。GoalBoard 只提供 goalboard v1 <operation> 及显式 goalboard install。`);
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

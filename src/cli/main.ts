#!/usr/bin/env node
import { printV1Help, runV1Cli } from "../v1/cli.js";

export async function main(args = process.argv.slice(2)): Promise<number> {
  try {
    if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
      printV1Help();
      return 0;
    }
    if (args[0] !== "v1") {
      throw new Error(`未知命令: ${args[0]}。GoalBoard 只提供 goalboard v1 <operation>。`);
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

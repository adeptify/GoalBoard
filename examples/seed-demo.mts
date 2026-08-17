#!/usr/bin/env node
/**
 * 创建或重建 GoalBoard 自带的可再生演示项目。
 *
 * 这个脚本保留给仓库开发和截图流程；产品用户应优先使用：
 *   goalboard demo create --confirm
 *   goalboard demo reset --confirm
 */
import os from "node:os";
import path from "node:path";
import { GoalBoardProjectCatalog } from "../src/projects/catalog.js";

const force = process.argv.includes("--force");
const homeIndex = process.argv.indexOf("--home");
const homeDirectory = path.resolve(
  homeIndex >= 0 && process.argv[homeIndex + 1]
    ? process.argv[homeIndex + 1]
    : process.env.GOALBOARD_HOME ?? path.join(os.homedir(), ".goalboard"),
);

const catalog = await GoalBoardProjectCatalog.open({ homeDirectory });
try {
  const existing = catalog.listProjects().find((project) => project.data_class === "regenerable_demo");
  const result = force && existing
    ? await catalog.resetDemoProject({ actor_id: "demo-script", user_confirmed: true })
    : await catalog.ensureDemoProject({ actor_id: "demo-script", user_confirmed: true });
  console.log(`${result.status === "created" ? "已创建" : result.status === "reset" ? "已重建" : "已存在"}：${result.project.display_name}`);
  console.log(`分类：${result.project.data_class}（普通卸载可以清理，用户项目不受影响）`);
  console.log(`打开：http://127.0.0.1:4173/projects/${encodeURIComponent(result.project.project_id)}/`);
} finally {
  catalog.close();
}

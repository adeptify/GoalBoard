import os from "node:os";
import path from "node:path";

export function resolveGoalBoardHome(): string {
  const configured = process.env.GOALBOARD_HOME?.trim();
  return path.resolve(configured || path.join(os.homedir(), ".goalboard"));
}

export function resolveFeedSecurityDirectory(): string {
  return path.join(resolveGoalBoardHome(), "feed");
}

import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  GoalBoardProjectCatalog,
  type GoalBoardProjectRecord,
  type RuntimeWorkContext,
} from "../projects/catalog.js";

export type GoalBoardPostInstallProjectAction =
  | {
      action_id: string;
      kind: "create";
      display_name: string;
      actor_id: string;
    }
  | {
      action_id: string;
      kind: "import";
      legacy_database_path: string;
      display_name?: string;
      actor_id: string;
    }
  | {
      action_id: string;
      kind: "enable";
      project_id: string;
      context: RuntimeWorkContext;
      actor_id: string;
      rebind_confirmed?: boolean;
    }
  | {
      action_id: string;
      kind: "start";
      project_id: string;
      context: RuntimeWorkContext;
      actor_id: string;
    };

export interface GoalBoardPostInstallProjectPrompt {
  home_directory: string;
  default_selected_action_ids: [];
  question: string;
  actions: Array<GoalBoardPostInstallProjectAction["kind"]>;
}

export interface GoalBoardPostInstallProjectStarter {
  startProject(input: {
    project: GoalBoardProjectRecord;
    context: RuntimeWorkContext;
    actor_id: string;
  }): Promise<{ started: boolean; message: string }> | { started: boolean; message: string };
}

export interface ApplyGoalBoardPostInstallProjectSelectionInput {
  home_directory?: string;
  actions: GoalBoardPostInstallProjectAction[];
  /** Each selected action ID is one explicit user confirmation, never a broad setup consent. */
  confirmed_action_ids: string[];
  /** Repeating the exact confirmed selection returns its recorded result without re-running actions. */
  idempotency_key: string;
  /** A Runtime or desktop host may provide the actual selected service-start operation. */
  starter?: GoalBoardPostInstallProjectStarter;
}

export interface GoalBoardPostInstallProjectActionResult {
  action_id: string;
  kind: GoalBoardPostInstallProjectAction["kind"];
  status: "executed" | "skipped" | "failed";
  project: Pick<GoalBoardProjectRecord, "project_id" | "display_name" | "board_id"> | null;
  message: string;
}

export interface GoalBoardPostInstallProjectSelectionResult {
  home_directory: string;
  replayed: boolean;
  selected_action_ids: string[];
  action_results: GoalBoardPostInstallProjectActionResult[];
  executed_action_ids: string[];
  skipped_action_ids: string[];
  failed_action_ids: string[];
}

export class GoalBoardPostInstallProjectSelectionError extends Error {
  constructor(
    readonly code:
      | "selection.action_invalid"
      | "selection.duplicate_action"
      | "selection.confirmation_invalid"
      | "selection.idempotency_conflict",
    message: string,
  ) {
    super(message);
    this.name = "GoalBoardPostInstallProjectSelectionError";
  }
}

interface StoredSelectionResult {
  owner: "goalboard-postinstall-project-selection-v1";
  request_fingerprint: string;
  result: GoalBoardPostInstallProjectSelectionResult;
}

/**
 * The installer returns this prompt rather than creating, enabling, importing,
 * or starting any project. A host presents it in its own user interaction.
 */
export function postInstallProjectPrompt(homeDirectory?: string): GoalBoardPostInstallProjectPrompt {
  return {
    home_directory: resolvedHomeDirectory(homeDirectory),
    default_selected_action_ids: [],
    question:
      "GoalBoard 已安装，但还没有创建、导入、启用或启动任何项目。要在当前 Runtime 中选择已有项目、创建新项目、导入指定 DB，还是暂时跳过？",
    actions: ["create", "import", "enable", "start"],
  };
}

/**
 * Applies only the action IDs the user explicitly confirmed. It opens the
 * project catalog lazily, so an all-skip response leaves catalog, bindings,
 * project databases, and services untouched.
 */
export async function applyPostInstallProjectSelection(
  input: ApplyGoalBoardPostInstallProjectSelectionInput,
): Promise<GoalBoardPostInstallProjectSelectionResult> {
  const homeDirectory = resolvedHomeDirectory(input.home_directory);
  const actions = input.actions.map(validateAction);
  const idempotencyKey = requiredText(input.idempotency_key, "安装后项目设置幂等键");
  const actionIds = new Set<string>();
  for (const action of actions) {
    if (actionIds.has(action.action_id)) {
      throw new GoalBoardPostInstallProjectSelectionError(
        "selection.duplicate_action",
        `安装后项目设置中重复了操作 ID: ${action.action_id}`,
      );
    }
    actionIds.add(action.action_id);
  }

  const selectedIds = uniqueIds(input.confirmed_action_ids, "确认操作 ID");
  for (const actionId of selectedIds) {
    if (!actionIds.has(actionId)) {
      throw new GoalBoardPostInstallProjectSelectionError(
        "selection.confirmation_invalid",
        `不能确认不存在的安装后项目操作: ${actionId}`,
      );
    }
  }
  const selected = new Set(selectedIds);
  const requestFingerprint = selectionFingerprint(homeDirectory, actions, selectedIds);
  if (selectedIds.length > 0) {
    const replay = await readSelectionResult(homeDirectory, idempotencyKey);
    if (replay) {
      if (replay.request_fingerprint !== requestFingerprint) {
        throw new GoalBoardPostInstallProjectSelectionError(
          "selection.idempotency_conflict",
          "同一个安装后项目设置幂等键不能用于不同的操作、确认项或项目上下文。",
        );
      }
      return { ...replay.result, replayed: true };
    }
  }
  const results: GoalBoardPostInstallProjectActionResult[] = [];
  let catalog: GoalBoardProjectCatalog | null = null;
  const getCatalog = async () => {
    if (!catalog) catalog = await GoalBoardProjectCatalog.open({ homeDirectory });
    return catalog;
  };

  try {
    for (const action of actions) {
      if (!selected.has(action.action_id)) {
        results.push(actionResult(action, "skipped", null, "用户未明确选择这项操作，未做任何修改。"));
        continue;
      }
      try {
        const executed = await executeSelectedAction(action, getCatalog, input.starter);
        results.push(actionResult(action, "executed", executed.project, executed.message));
      } catch (error) {
        results.push(
          actionResult(
            action,
            "failed",
            null,
            `这项已确认操作未完成：${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      }
    }
  } finally {
    (catalog as GoalBoardProjectCatalog | null)?.close();
  }

  const result: GoalBoardPostInstallProjectSelectionResult = {
    home_directory: homeDirectory,
    replayed: false,
    selected_action_ids: selectedIds,
    action_results: results,
    executed_action_ids: results.filter((result) => result.status === "executed").map((result) => result.action_id),
    skipped_action_ids: results.filter((result) => result.status === "skipped").map((result) => result.action_id),
    failed_action_ids: results.filter((result) => result.status === "failed").map((result) => result.action_id),
  };
  if (selectedIds.length > 0) {
    await writeSelectionResult(homeDirectory, idempotencyKey, requestFingerprint, result);
  }
  return result;
}

async function executeSelectedAction(
  action: GoalBoardPostInstallProjectAction,
  getCatalog: () => Promise<GoalBoardProjectCatalog>,
  starter: GoalBoardPostInstallProjectStarter | undefined,
): Promise<{ project: GoalBoardProjectRecord; message: string }> {
  const catalog = await getCatalog();
  if (action.kind === "create") {
    const project = await catalog.createProject({ display_name: action.display_name, actor_id: action.actor_id });
    return { project, message: `已创建 GoalBoard 项目「${project.display_name}」。它尚未自动绑定或启动。` };
  }
  if (action.kind === "import") {
    const project = await catalog.migrateLegacyDatabase({
      legacy_database_path: action.legacy_database_path,
      display_name: action.display_name,
      actor_id: action.actor_id,
    });
    return { project, message: `已导入 GoalBoard 项目「${project.display_name}」。它尚未自动绑定或启动。` };
  }
  if (action.kind === "enable") {
    const resolution = catalog.bindRuntimeContext({
      context: action.context,
      project_id: action.project_id,
      actor_id: action.actor_id,
      user_confirmed: true,
      rebind_confirmed: action.rebind_confirmed === true,
    });
    const project = catalog.getProject(resolution.connection!.project_id);
    return { project, message: `已为当前 Runtime 工作入口启用项目「${project.display_name}」。` };
  }

  const resolution = catalog.resolveRuntimeContext(action.context);
  if (resolution.status !== "bound" || resolution.connection?.project_id !== action.project_id) {
    throw new GoalBoardPostInstallProjectSelectionError(
      "selection.action_invalid",
      "只能启动已经为这个 Runtime 工作入口明确启用的项目。请先确认 enable 操作。",
    );
  }
  if (!starter) {
    throw new GoalBoardPostInstallProjectSelectionError(
      "selection.action_invalid",
      "当前入口没有提供项目服务启动器；没有启动任何服务。可在支持的 Runtime 或桌面宿主中重新执行这项已确认操作。",
    );
  }
  const project = catalog.getProject(action.project_id);
  const startResult = await starter.startProject({
    project,
    context: action.context,
    actor_id: action.actor_id,
  });
  if (!startResult.started) {
    throw new GoalBoardPostInstallProjectSelectionError(
      "selection.action_invalid",
      startResult.message || "项目服务没有启动。",
    );
  }
  return { project, message: startResult.message || `已启动项目「${project.display_name}」的已确认服务。` };
}

function validateAction(action: GoalBoardPostInstallProjectAction): GoalBoardPostInstallProjectAction {
  if (!action || typeof action !== "object") {
    throw new GoalBoardPostInstallProjectSelectionError("selection.action_invalid", "安装后项目操作不能为空。");
  }
  const actionId = requiredText(action.action_id, "操作 ID");
  const actorId = requiredText(action.actor_id, "执行者");
  if (action.kind === "create") {
    return { ...action, action_id: actionId, actor_id: actorId, display_name: requiredText(action.display_name, "项目名称") };
  }
  if (action.kind === "import") {
    return {
      ...action,
      action_id: actionId,
      actor_id: actorId,
      legacy_database_path: requiredText(action.legacy_database_path, "要导入的数据库路径"),
      display_name: action.display_name?.trim() || undefined,
    };
  }
  if (action.kind === "enable") {
    return { ...action, action_id: actionId, actor_id: actorId, project_id: requiredText(action.project_id, "项目 ID") };
  }
  if (action.kind === "start") {
    return { ...action, action_id: actionId, actor_id: actorId, project_id: requiredText(action.project_id, "项目 ID") };
  }
  throw new GoalBoardPostInstallProjectSelectionError("selection.action_invalid", "安装后项目操作类型无法识别。");
}

function actionResult(
  action: GoalBoardPostInstallProjectAction,
  status: GoalBoardPostInstallProjectActionResult["status"],
  project: GoalBoardProjectRecord | null,
  message: string,
): GoalBoardPostInstallProjectActionResult {
  return {
    action_id: action.action_id,
    kind: action.kind,
    status,
    project: project
      ? { project_id: project.project_id, display_name: project.display_name, board_id: project.board_id }
      : null,
    message,
  };
}

function resolvedHomeDirectory(homeDirectory: string | undefined): string {
  return path.resolve(homeDirectory ?? path.join(os.homedir(), ".goalboard"));
}

function requiredText(value: string, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    throw new GoalBoardPostInstallProjectSelectionError("selection.action_invalid", `${label}不能为空。`);
  }
  return text;
}

function uniqueIds(values: string[], label: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const id = requiredText(value, label);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function selectionFingerprint(
  homeDirectory: string,
  actions: GoalBoardPostInstallProjectAction[],
  selectedIds: string[],
): string {
  return JSON.stringify({ home_directory: homeDirectory, actions, confirmed_action_ids: selectedIds });
}

function selectionResultPath(homeDirectory: string, idempotencyKey: string): string {
  return path.join(
    homeDirectory,
    "config",
    "postinstall-project-selections",
    `${createHash("sha256").update(idempotencyKey).digest("hex")}.json`,
  );
}

async function readSelectionResult(homeDirectory: string, idempotencyKey: string): Promise<StoredSelectionResult | null> {
  const filePath = selectionResultPath(homeDirectory, idempotencyKey);
  let text: string;
  try {
    text = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  try {
    const parsed = JSON.parse(text) as Partial<StoredSelectionResult>;
    if (
      parsed.owner !== "goalboard-postinstall-project-selection-v1" ||
      typeof parsed.request_fingerprint !== "string" ||
      !parsed.result ||
      typeof parsed.result !== "object"
    ) {
      throw new Error("not an owned selection record");
    }
    return parsed as StoredSelectionResult;
  } catch (error) {
    throw new GoalBoardPostInstallProjectSelectionError(
      "selection.idempotency_conflict",
      `不会覆盖无法识别的安装后项目设置记录: ${filePath} (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

async function writeSelectionResult(
  homeDirectory: string,
  idempotencyKey: string,
  requestFingerprint: string,
  result: GoalBoardPostInstallProjectSelectionResult,
): Promise<void> {
  const filePath = selectionResultPath(homeDirectory, idempotencyKey);
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
  const temporaryPath = `${filePath}.tmp-${randomUUID()}`;
  const contents = `${JSON.stringify(
    {
      owner: "goalboard-postinstall-project-selection-v1",
      request_fingerprint: requestFingerprint,
      result,
    } satisfies StoredSelectionResult,
    null,
    2,
  )}\n`;
  await fs.writeFile(temporaryPath, contents);
  try {
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
}

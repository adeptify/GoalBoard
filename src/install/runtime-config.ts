import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const CONSENT_OWNER = "goalboard-runtime-config-consent-v1";

export interface RuntimeConfigChange {
  path: string;
  operation: "add" | "replace" | "remove";
  before: string | null;
  after: string | null;
}

export interface RuntimeConfigChangePlan {
  schema_version: 1;
  plan_id: string;
  plan_hash: string;
  runtime_id: string;
  home_directory: string;
  target_path: string;
  target_existed: boolean;
  before_sha256: string | null;
  after_sha256: string;
  next_contents: string;
  changes: RuntimeConfigChange[];
  backup_path: string | null;
  alternative: string;
}

export interface PrepareRuntimeConfigChangeInput {
  runtime_id: string;
  target_path: string;
  next_contents: string;
  changes: RuntimeConfigChange[];
  alternative: string;
  home_directory?: string;
}

export interface RuntimeConfigConfirmation {
  runtime_id: string;
  plan_id: string;
  decision: "confirmed" | "declined";
}

export interface ApplyRuntimeConfigChangeInput {
  plan: RuntimeConfigChangePlan;
  confirmation: RuntimeConfigConfirmation;
  /** Verifies the requested Runtime connection after the exact previewed write. */
  validate: (context: { runtime_id: string; target_path: string; plan_id: string }) => boolean | Promise<boolean>;
}

export type RuntimeConfigChangeResultStatus =
  | "declined"
  | "confirmation_mismatch"
  | "stale"
  | "unchanged"
  | "applied"
  | "already_applied"
  | "rolled_back";

export interface RuntimeConfigChangeResult {
  status: RuntimeConfigChangeResultStatus;
  runtime_id: string;
  target_path: string;
  backup_path: string | null;
  consent_record_path: string | null;
  message: string;
}

interface ConsentRecord {
  owner: string;
  plan_hash: string;
  status: "applied" | "rolled_back";
  runtime_id: string;
  target_path: string;
  before_sha256: string | null;
  after_sha256: string;
  backup_path: string | null;
  message: string;
  applied_at: string;
}

export class RuntimeConfigConsentError extends Error {
  constructor(
    readonly code: "runtime.invalid" | "runtime.target_invalid" | "runtime.plan_invalid" | "runtime.consent_conflict",
    message: string,
  ) {
    super(message);
    this.name = "RuntimeConfigConsentError";
  }
}

/**
 * Builds a read-only, user-visible change plan. Calling this function never
 * creates a directory, backup, consent record, or Runtime configuration file.
 */
export async function prepareRuntimeConfigChange(
  input: PrepareRuntimeConfigChangeInput,
): Promise<RuntimeConfigChangePlan> {
  const runtimeId = requiredRuntimeId(input.runtime_id);
  const targetPath = absoluteTargetPath(input.target_path);
  const existing = await readFileOrNull(targetPath);
  const homeDirectory = path.resolve(input.home_directory ?? path.join(os.homedir(), ".goalboard"));
  const normalizedChanges = input.changes.map(normalizeChange);
  const alternative = input.alternative.trim();
  if (!alternative) {
    throw new RuntimeConfigConsentError("runtime.plan_invalid", "配置预览必须说明拒绝后的替代路径");
  }
  const beforeSha256 = existing == null ? null : digest(existing);
  const afterSha256 = digest(Buffer.from(input.next_contents));
  const planPayload = {
    owner: CONSENT_OWNER,
    runtime_id: runtimeId,
    home_directory: homeDirectory,
    target_path: targetPath,
    before_sha256: beforeSha256,
    after_sha256: afterSha256,
    changes: normalizedChanges,
    alternative,
  };
  const planHash = digest(Buffer.from(JSON.stringify(planPayload)));
  const planId = `runtime-config-${planHash.slice(0, 24)}`;
  const backupPath = existing == null ? null : path.join(homeDirectory, "runtime-config-backups", safeSegment(runtimeId), `${planId}.bak`);
  return {
    schema_version: 1,
    plan_id: planId,
    plan_hash: planHash,
    runtime_id: runtimeId,
    home_directory: homeDirectory,
    target_path: targetPath,
    target_existed: existing != null,
    before_sha256: beforeSha256,
    after_sha256: afterSha256,
    next_contents: input.next_contents,
    changes: normalizedChanges,
    backup_path: backupPath,
    alternative,
  };
}

/**
 * Applies exactly one previously previewed plan after an explicit confirmation.
 * A failed post-write validation restores the original bytes automatically.
 */
export async function applyRuntimeConfigChange(
  input: ApplyRuntimeConfigChangeInput,
): Promise<RuntimeConfigChangeResult> {
  const plan = validatePlan(input.plan);
  const confirmation = input.confirmation;
  if (confirmation.decision === "declined") {
    return result("declined", plan, null, null, `未修改 ${plan.runtime_id} 配置。${plan.alternative}`);
  }
  if (confirmation.runtime_id !== plan.runtime_id || confirmation.plan_id !== plan.plan_id) {
    return result("confirmation_mismatch", plan, null, null, "确认只能用于当前 Runtime 和当前预览，不会写入配置。");
  }

  const homeDirectory = plan.home_directory;
  const consentRecordPath = path.join(homeDirectory, "runtime-config-consents", `${plan.plan_id}.json`);
  const existingRecord = await readConsentRecord(consentRecordPath);
  const current = await readFileOrNull(plan.target_path);
  const currentDigest = current == null ? null : digest(current);

  if (existingRecord) {
    if (existingRecord.plan_hash !== plan.plan_hash) {
      throw new RuntimeConfigConsentError("runtime.consent_conflict", `确认记录冲突: ${consentRecordPath}`);
    }
    if (existingRecord.status === "applied" && currentDigest === plan.after_sha256) {
      return result("already_applied", plan, existingRecord.backup_path, consentRecordPath, "相同确认已应用，无重复写入。");
    }
    if (existingRecord.status === "rolled_back" && currentDigest === plan.before_sha256) {
      return result("rolled_back", plan, existingRecord.backup_path, consentRecordPath, "此前验证失败，原配置已保持恢复状态。");
    }
    return result("stale", plan, existingRecord.backup_path, consentRecordPath, "目标配置已不再符合这份确认记录，未写入。");
  }

  if (currentDigest !== plan.before_sha256) {
    return result("stale", plan, null, null, "目标配置已在预览后变化，未写入。请重新生成预览。");
  }
  if (currentDigest === plan.after_sha256) {
    return result("unchanged", plan, null, null, "目标配置已与预览一致，无需写入。");
  }

  if (current != null && plan.backup_path) {
    await fs.mkdir(path.dirname(plan.backup_path), { recursive: true });
    await writeAtomic(plan.backup_path, current);
  }
  await fs.mkdir(path.dirname(plan.target_path), { recursive: true });
  await writeAtomic(plan.target_path, Buffer.from(plan.next_contents));

  let validationMessage = "验证通过。";
  try {
    const valid = await input.validate({
      runtime_id: plan.runtime_id,
      target_path: plan.target_path,
      plan_id: plan.plan_id,
    });
    if (!valid) throw new Error("Runtime 接入验证未通过");
  } catch (error) {
    validationMessage = error instanceof Error ? error.message : String(error);
    await restoreOriginal(plan.target_path, current);
    const record = consentRecord(plan, "rolled_back", validationMessage);
    await writeConsentRecord(consentRecordPath, record);
    return result("rolled_back", plan, plan.backup_path, consentRecordPath, `验证失败，已恢复原配置：${validationMessage}`);
  }

  const record = consentRecord(plan, "applied", validationMessage);
  await writeConsentRecord(consentRecordPath, record);
  return result("applied", plan, plan.backup_path, consentRecordPath, "已按预览写入并通过验证。");
}

function validatePlan(plan: RuntimeConfigChangePlan): RuntimeConfigChangePlan {
  if (plan.schema_version !== 1 || !plan.plan_id || !plan.plan_hash || !plan.runtime_id || !plan.home_directory || !plan.target_path) {
    throw new RuntimeConfigConsentError("runtime.plan_invalid", "Runtime 配置计划不完整");
  }
  if (!path.isAbsolute(plan.target_path)) {
    throw new RuntimeConfigConsentError("runtime.target_invalid", "Runtime 配置目标必须是绝对路径");
  }
  if (!path.isAbsolute(plan.home_directory)) {
    throw new RuntimeConfigConsentError("runtime.plan_invalid", "GoalBoard 配置目录必须是绝对路径");
  }
  const expectedHash = digest(
    Buffer.from(
      JSON.stringify({
        owner: CONSENT_OWNER,
        runtime_id: plan.runtime_id,
        home_directory: plan.home_directory,
        target_path: plan.target_path,
        before_sha256: plan.before_sha256,
        after_sha256: plan.after_sha256,
        changes: plan.changes,
        alternative: plan.alternative,
      }),
    ),
  );
  if (expectedHash !== plan.plan_hash || plan.plan_id !== `runtime-config-${plan.plan_hash.slice(0, 24)}`) {
    throw new RuntimeConfigConsentError("runtime.plan_invalid", "Runtime 配置计划已被篡改或不完整");
  }
  return plan;
}

function consentRecord(
  plan: RuntimeConfigChangePlan,
  status: ConsentRecord["status"],
  message: string,
): ConsentRecord {
  return {
    owner: CONSENT_OWNER,
    plan_hash: plan.plan_hash,
    status,
    runtime_id: plan.runtime_id,
    target_path: plan.target_path,
    before_sha256: plan.before_sha256,
    after_sha256: plan.after_sha256,
    backup_path: plan.backup_path,
    message,
    applied_at: new Date().toISOString(),
  };
}

function result(
  status: RuntimeConfigChangeResultStatus,
  plan: RuntimeConfigChangePlan,
  backupPath: string | null,
  consentRecordPath: string | null,
  message: string,
): RuntimeConfigChangeResult {
  return {
    status,
    runtime_id: plan.runtime_id,
    target_path: plan.target_path,
    backup_path: backupPath,
    consent_record_path: consentRecordPath,
    message,
  };
}

function requiredRuntimeId(value: string): string {
  const runtimeId = value.trim();
  if (!runtimeId) throw new RuntimeConfigConsentError("runtime.invalid", "Runtime 名称不能为空");
  return runtimeId;
}

function absoluteTargetPath(value: string): string {
  if (!value.trim() || !path.isAbsolute(value)) {
    throw new RuntimeConfigConsentError("runtime.target_invalid", "Runtime 配置目标必须是绝对路径");
  }
  return path.resolve(value);
}

function normalizeChange(change: RuntimeConfigChange): RuntimeConfigChange {
  const fieldPath = change.path.trim();
  if (!fieldPath) throw new RuntimeConfigConsentError("runtime.plan_invalid", "配置预览缺少字段路径");
  return { path: fieldPath, operation: change.operation, before: change.before, after: change.after };
}

function safeSegment(value: string): string {
  return /^[A-Za-z0-9._-]+$/.test(value) ? value : `runtime-${digest(Buffer.from(value)).slice(0, 16)}`;
}

function digest(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function readFileOrNull(filePath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function restoreOriginal(targetPath: string, original: Buffer | null): Promise<void> {
  if (original == null) {
    await fs.rm(targetPath, { force: true });
    return;
  }
  await writeAtomic(targetPath, original);
}

async function writeAtomic(filePath: string, contents: Buffer): Promise<void> {
  const temporaryPath = `${filePath}.tmp-${randomUUID()}`;
  await fs.writeFile(temporaryPath, contents);
  try {
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
}

async function readConsentRecord(filePath: string): Promise<ConsentRecord | null> {
  const contents = await readFileOrNull(filePath);
  if (contents == null) return null;
  try {
    const parsed = JSON.parse(contents.toString("utf8")) as ConsentRecord;
    if (parsed.owner !== CONSENT_OWNER) {
      throw new RuntimeConfigConsentError("runtime.consent_conflict", `不会覆盖未知确认记录: ${filePath}`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof RuntimeConfigConsentError) throw error;
    throw new RuntimeConfigConsentError("runtime.consent_conflict", `确认记录无法解析: ${filePath}`);
  }
}

async function writeConsentRecord(filePath: string, record: ConsentRecord): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await writeAtomic(filePath, Buffer.from(`${JSON.stringify(record, null, 2)}\n`));
}

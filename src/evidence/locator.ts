import fs from "node:fs";
import path from "node:path";

export const MAX_PROJECT_REFERENCE_BYTES = 512 * 1024;

export class ProjectReferenceError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ProjectReferenceError";
  }
}

export interface EvidenceLocatorValidation {
  status: "verified" | "unverified";
  reason: string;
  checked_at: string;
  normalized_locator: string;
}

function isWithinDirectory(candidate: string, directory: string): boolean {
  const relative = path.relative(directory, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function splitProjectLocator(locator: string): { path: string; anchor: string | null } {
  const hashIndex = locator.indexOf("#");
  const locatorPath = hashIndex >= 0 ? locator.slice(0, hashIndex) : locator;
  const encodedAnchor = hashIndex >= 0 ? locator.slice(hashIndex + 1) : "";
  let anchor: string | null = null;
  if (hashIndex >= 0) {
    try {
      anchor = decodeURIComponent(encodedAnchor);
    } catch {
      throw new ProjectReferenceError(400, "Markdown anchor 编码无效");
    }
  }
  return { path: locatorPath, anchor };
}

function normalizeAbsoluteProjectLocator(projectRoot: string, locator: string): string {
  const { path: locatorPath, anchor } = splitProjectLocator(locator);
  let realRoot: string;
  try {
    realRoot = fs.realpathSync(path.resolve(projectRoot));
  } catch {
    throw new ProjectReferenceError(404, "项目引用根目录不可用");
  }
  let realFile: string;
  try {
    realFile = fs.realpathSync(locatorPath);
  } catch {
    throw new ProjectReferenceError(404, "项目内引用文件不存在");
  }
  if (!isWithinDirectory(realFile, realRoot)) {
    throw new ProjectReferenceError(400, "Evidence locator 不能指向当前项目范围外的本地文件");
  }
  const relativePath = path.relative(realRoot, realFile).split(path.sep).join("/");
  const anchorSuffix = anchor === null ? "" : `#${encodeURIComponent(anchor)}`;
  return `project://${relativePath}${anchorSuffix}`;
}

export function projectReferenceSegments(locator: string): string[] {
  const { path: locatorPath } = splitProjectLocator(locator.trim());
  const encodedPath = locatorPath.startsWith("project://")
    ? locatorPath.slice("project://".length)
    : locatorPath;
  if (!locatorPath) throw new ProjectReferenceError(400, "项目内引用不能为空");
  if (locatorPath.startsWith("project://") && /^[/\\]/.test(encodedPath)) {
    throw new ProjectReferenceError(400, "项目内引用必须是相对路径");
  }
  if (!locatorPath.startsWith("project://") && /^[a-z][a-z0-9+.-]*:/i.test(locatorPath)) {
    throw new ProjectReferenceError(400, "只有项目内相对路径可以在 GoalBoard 中打开");
  }
  if (path.isAbsolute(encodedPath) || encodedPath.includes("\0")) {
    throw new ProjectReferenceError(400, "项目内引用必须是安全的相对路径");
  }
  const segments = encodedPath
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment && segment !== ".");
  if (!segments.length || segments.some((segment) => segment === "..")) {
    throw new ProjectReferenceError(400, "项目内引用不能跳出项目目录");
  }
  return segments;
}

export function readProjectReference(
  projectRoot: string,
  locator: string,
): { content: Buffer; fileName: string; realFile: string; anchor: string | null } {
  const root = path.resolve(projectRoot);
  let realRoot: string;
  try {
    realRoot = fs.realpathSync(root);
  } catch {
    throw new ProjectReferenceError(404, "项目引用根目录不可用");
  }
  const candidate = path.resolve(realRoot, ...projectReferenceSegments(locator));
  if (!isWithinDirectory(candidate, realRoot)) {
    throw new ProjectReferenceError(400, "项目内引用不能跳出项目目录");
  }
  let realFile: string;
  try {
    realFile = fs.realpathSync(candidate);
  } catch {
    throw new ProjectReferenceError(404, "项目内引用文件不存在");
  }
  if (!isWithinDirectory(realFile, realRoot)) {
    throw new ProjectReferenceError(400, "项目内引用不能通过链接跳出项目目录");
  }
  const stat = fs.statSync(realFile);
  if (!stat.isFile()) throw new ProjectReferenceError(400, "项目内引用必须指向普通文件");
  if (stat.size > MAX_PROJECT_REFERENCE_BYTES) {
    throw new ProjectReferenceError(413, "项目内引用文件过大，不能在 GoalBoard 中打开");
  }
  const content = fs.readFileSync(realFile);
  if (content.includes(0) || content.toString("utf8").includes("\uFFFD")) {
    throw new ProjectReferenceError(415, "GoalBoard 只能打开项目内的文本引用");
  }
  return {
    content,
    fileName: (path.basename(realFile) || "evidence.txt").replace(/[\r\n"]/g, ""),
    realFile,
    anchor: splitProjectLocator(locator).anchor,
  };
}

function markdownSlug(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/<[^>]*>/g, "")
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function markdownAnchors(markdown: string): Set<string> {
  const anchors = new Set<string>();
  const counts = new Map<string, number>();
  const lines = markdown.split(/\r?\n/);
  const add = (heading: string) => {
    const base = markdownSlug(heading);
    if (!base) return;
    let duplicateIndex = counts.get(base) ?? 0;
    let candidate = duplicateIndex === 0 ? base : `${base}-${duplicateIndex}`;
    while (anchors.has(candidate)) {
      duplicateIndex += 1;
      candidate = `${base}-${duplicateIndex}`;
    }
    anchors.add(candidate);
    counts.set(base, duplicateIndex + 1);
  };
  for (let index = 0; index < lines.length; index += 1) {
    const atx = lines[index]?.match(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (atx) {
      add(atx[1] ?? "");
      continue;
    }
    if (index + 1 < lines.length && /^ {0,3}(?:=+|-+)\s*$/.test(lines[index + 1] ?? "")) {
      add(lines[index] ?? "");
      index += 1;
    }
  }
  return anchors;
}

export function validateEvidenceLocator(
  locator: string,
  options: { projectRoot?: string | null; now?: string } = {},
): EvidenceLocatorValidation {
  const value = locator.trim();
  const checkedAt = options.now ?? new Date().toISOString();
  if (/^https?:\/\//i.test(value)) {
    return {
      status: "unverified",
      reason: "外部 URL 已保留，但 GoalBoard 不会发起网络请求或保证长期可用性",
      checked_at: checkedAt,
      normalized_locator: value,
    };
  }
  if (/^file:\/\//i.test(value) || /^[a-z]:[\\/]/i.test(value)) {
    throw new ProjectReferenceError(400, "Evidence locator 不能指向项目范围外的本地文件");
  }
  let normalizedLocator = value;
  if (path.isAbsolute(splitProjectLocator(value).path)) {
    if (!options.projectRoot) {
      throw new ProjectReferenceError(404, "项目引用根目录不可用");
    }
    normalizedLocator = normalizeAbsoluteProjectLocator(options.projectRoot, value);
  }
  const isOpaqueProtocol =
    /^[a-z][a-z0-9+.-]*:/i.test(normalizedLocator) && !normalizedLocator.startsWith("project://");
  if (isOpaqueProtocol) {
    return {
      status: "unverified",
      reason: "不透明或外部 locator 已保留为 UNVERIFIED；GoalBoard 不会调用自定义协议",
      checked_at: checkedAt,
      normalized_locator: normalizedLocator,
    };
  }
  if (!options.projectRoot) {
    return {
      status: "unverified",
      reason: "当前入口没有可用的项目目录，项目内 locator 尚未验证",
      checked_at: checkedAt,
      normalized_locator: normalizedLocator,
    };
  }

  const reference = readProjectReference(options.projectRoot, normalizedLocator);
  if (reference.anchor !== null) {
    if (!/\.(?:md|markdown)$/i.test(reference.realFile)) {
      throw new ProjectReferenceError(400, "只有 Markdown 文件可以校验章节 anchor");
    }
    const requestedAnchor = markdownSlug(reference.anchor);
    if (!requestedAnchor || !markdownAnchors(reference.content.toString("utf8")).has(requestedAnchor)) {
      throw new ProjectReferenceError(400, `Markdown anchor 不存在: #${reference.anchor}`);
    }
    return {
      status: "verified",
      reason: "项目内 Markdown 文件与 anchor 已完成只读预检",
      checked_at: checkedAt,
      normalized_locator: normalizedLocator,
    };
  }
  return {
    status: "verified",
    reason: "项目内文本文件已完成只读预检",
    checked_at: checkedAt,
    normalized_locator: normalizedLocator,
  };
}

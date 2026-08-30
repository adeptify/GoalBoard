import fs from "node:fs";
import path from "node:path";

export function atomicWriteFileSync(
  targetPath: string,
  data: string | Buffer,
  options: { mode?: number } = {},
): void {
  const mode = options.mode ?? 0o600;
  const directory = path.dirname(targetPath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = path.join(
    directory,
    `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    fs.writeFileSync(temporaryPath, data, { mode });
    fs.renameSync(temporaryPath, targetPath);
    fs.chmodSync(targetPath, mode);
  } catch (error) {
    try {
      fs.unlinkSync(temporaryPath);
    } catch {
      // Best effort only; the target was never replaced.
    }
    throw error;
  }
}

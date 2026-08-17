/**
 * Atomic JSON write helpers for historical raw archive (M17a.1).
 * Validates parse before promoting temp → final.
 */
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
  access,
} from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Write UTF-8 JSON atomically: temp → JSON.parse validate → rename. */
export async function writeJsonAtomic(
  filePath: string,
  data: unknown
): Promise<{ bytes: number; sha256: string }> {
  await ensureDir(path.dirname(filePath));
  const serialized =
    typeof data === "string" ? data : JSON.stringify(data);
  // Validate before write.
  JSON.parse(serialized);
  const sha256 = createHash("sha256").update(serialized).digest("hex");
  const tmp = `${filePath}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(tmp, serialized, "utf8");
    const check = await readFile(tmp, "utf8");
    JSON.parse(check);
    await rename(tmp, filePath);
  } catch (e) {
    try {
      await unlink(tmp);
    } catch {
      /* ignore */
    }
    throw e;
  }
  return { bytes: Buffer.byteLength(serialized, "utf8"), sha256 };
}

/** True if file exists and parses as JSON. Truncated/corrupt → false. */
export async function isValidJsonFile(filePath: string): Promise<boolean> {
  try {
    if (!(await fileExists(filePath))) return false;
    const raw = await readFile(filePath, "utf8");
    if (!raw.trim()) return false;
    JSON.parse(raw);
    return true;
  } catch {
    return false;
  }
}

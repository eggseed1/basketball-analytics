/**
 * Historical import process lock (M17a.1).
 * Prevents overlapping bulk importers against the same raw archive.
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";

export const IMPORT_LOCK_PATH = path.join(
  process.cwd(),
  "data",
  "drbl",
  "raw",
  ".historical_import.lock"
);

export type ImportLock = {
  pid: number;
  startedAt: string;
  command: string;
  from: string;
  to: string;
  rawOnly: boolean;
};

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readImportLock(): ImportLock | null {
  if (!existsSync(IMPORT_LOCK_PATH)) return null;
  try {
    const raw = readFileSync(IMPORT_LOCK_PATH, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw) as ImportLock;
  } catch {
    return null;
  }
}

/**
 * Acquire lock. If another live importer holds it → throw IMPORT_ALREADY_RUNNING.
 * Stale locks (dead PID) are replaced.
 */
export function acquireImportLock(lock: Omit<ImportLock, "pid" | "startedAt">): ImportLock {
  const existing = readImportLock();
  if (existing && existing.pid !== process.pid && pidAlive(existing.pid)) {
    throw new Error(
      `STOP IMPORT_ALREADY_RUNNING pid=${existing.pid} startedAt=${existing.startedAt}`
    );
  }
  const full: ImportLock = {
    ...lock,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(IMPORT_LOCK_PATH, JSON.stringify(full, null, 2) + "\n", "utf8");
  return full;
}

export function releaseImportLock(): void {
  const existing = readImportLock();
  if (existing && existing.pid === process.pid) {
    try {
      unlinkSync(IMPORT_LOCK_PATH);
    } catch {
      /* ignore */
    }
  }
}

export function observeImportLock(): {
  state: "NONE" | "ACTIVE" | "STALE";
  lock: ImportLock | null;
} {
  const lock = readImportLock();
  if (!lock) return { state: "NONE", lock: null };
  if (pidAlive(lock.pid)) return { state: "ACTIVE", lock };
  return { state: "STALE", lock };
}

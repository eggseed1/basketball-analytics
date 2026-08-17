import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";

import { DRBL_PARSER_VERSION } from "../constants";
import { writeJsonAtomic, isValidJsonFile } from "./atomic-json";

const DEFAULT_ROOT = path.join(process.cwd(), "data", "drbl", "raw");

export function drblRawRoot(): string {
  return process.env.DRBL_DATA_ROOT?.trim() || DEFAULT_ROOT;
}

export function rawPath(...parts: string[]): string {
  return path.join(drblRawRoot(), ...parts);
}

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

export interface DrblRawCacheMeta {
  endpoint: string;
  retrievedAt: string;
  schemaHash: string;
  parserVersion: string;
  byteLength: number;
  fromCache: boolean;
}

export function schemaHashOf(data: unknown): string {
  const json = typeof data === "string" ? data : JSON.stringify(data);
  return createHash("sha256").update(json).digest("hex").slice(0, 16);
}

function metaPathFor(filePath: string): string {
  return `${filePath}.meta.json`;
}

async function writeMeta(
  filePath: string,
  meta: DrblRawCacheMeta
): Promise<void> {
  await writeJson(metaPathFor(filePath), meta);
}

/**
 * Read JSON from disk cache, or fetch + write.
 * Immutable raw NBA responses — never overwrite unless `force`.
 * Atomic temp→rename write; corrupt/truncated files are treated as missing.
 */
export async function readOrFetchJson<T>(
  filePath: string,
  fetcher: () => Promise<T>,
  options: {
    force?: boolean;
    endpoint?: string;
  } = {}
): Promise<{ data: T; fromCache: boolean; meta: DrblRawCacheMeta }> {
  const endpoint = options.endpoint ?? "unknown";

  if (!options.force && (await isValidJsonFile(filePath))) {
    const raw = await readFile(filePath, "utf8");
    const data = JSON.parse(raw) as T;
    let meta: DrblRawCacheMeta = {
      endpoint,
      retrievedAt: "",
      schemaHash: schemaHashOf(raw),
      parserVersion: DRBL_PARSER_VERSION,
      byteLength: Buffer.byteLength(raw, "utf8"),
      fromCache: true,
    };
    try {
      const existing = JSON.parse(
        await readFile(metaPathFor(filePath), "utf8")
      ) as DrblRawCacheMeta;
      meta = { ...existing, fromCache: true };
    } catch {
      await writeMeta(filePath, meta);
    }
    return { data, fromCache: true, meta };
  }

  const data = await fetcher();
  const serialized = JSON.stringify(data);
  // Immutable: only write body when missing/invalid or force.
  if (options.force || !(await isValidJsonFile(filePath))) {
    await writeJsonAtomic(filePath, serialized);
  }
  const meta: DrblRawCacheMeta = {
    endpoint,
    retrievedAt: new Date().toISOString(),
    schemaHash: schemaHashOf(serialized),
    parserVersion: DRBL_PARSER_VERSION,
    byteLength: Buffer.byteLength(serialized, "utf8"),
    fromCache: false,
  };
  await writeMeta(filePath, meta);
  return { data, fromCache: false, meta };
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

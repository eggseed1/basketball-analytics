/**
 * Node-safe PBP corpus attach boundary.
 * No shot/clock/zone/possession query execution.
 *
 * Safe for CLI / tsx: filesystem + PBP_DATA_PATH, no `server-only`.
 * Next.js application code must import `@/pbp/corpus.server` instead so
 * client bundles cannot pull this module.
 *
 * Keep `@/pbp` (index) free of this module — Turbopack will otherwise pull
 * `node:fs` into any client chunk that imports `@/pbp` via `@/analytics`.
 */

import { access, readFile } from "node:fs/promises";
import path from "node:path";

import type { PbpCorpusManifest, PbpCorpusStatus } from "./types";

export const DEFAULT_PBP_DATA_DIR = "data/pbp";
export const MANIFEST_FILENAME = "manifest.json";

const MANIFEST_REQUIRED_KEYS = [
  "source",
  "version",
  "path",
  "importedAt",
  "games",
  "events",
  "seasons",
  "earliestSeason",
  "latestSeason",
  "fileCount",
  "format",
] as const;

type PbpEnv = {
  PBP_DATA_PATH?: string | undefined;
  [key: string]: string | undefined;
};

/** Resolve corpus root. Prefer PBP_DATA_PATH; else repo-local data/pbp. */
export function resolvePbpDataPath(
  env: PbpEnv = process.env,
  cwd: string = process.cwd()
): { dataPath: string; envPath: string | null } {
  const raw = env.PBP_DATA_PATH?.trim();
  if (raw) {
    const dataPath = path.isAbsolute(raw) ? raw : path.resolve(cwd, raw);
    return { dataPath, envPath: raw };
  }
  return {
    dataPath: path.resolve(cwd, DEFAULT_PBP_DATA_DIR),
    envPath: null,
  };
}

function isNonNegInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}

function isSeasonList(v: unknown): v is string[] {
  return (
    Array.isArray(v) && v.every((s) => typeof s === "string" && s.length > 0)
  );
}

/**
 * Validate manifest shape without scanning event files.
 * Returns errors; empty array means structurally usable.
 */
export function validatePbpCorpusManifest(
  value: unknown
): { ok: true; manifest: PbpCorpusManifest } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["manifest must be a JSON object"] };
  }
  const o = value as Record<string, unknown>;
  for (const key of MANIFEST_REQUIRED_KEYS) {
    if (!(key in o)) errors.push(`missing field: ${key}`);
  }
  if (typeof o.source !== "string" || !o.source.trim()) {
    errors.push("source must be a non-empty string");
  }
  if (typeof o.version !== "string" || !o.version.trim()) {
    errors.push("version must be a non-empty string");
  }
  if (typeof o.path !== "string" || !o.path.trim()) {
    errors.push("path must be a non-empty string");
  }
  if (typeof o.importedAt !== "string" || !o.importedAt.trim()) {
    errors.push("importedAt must be a non-empty ISO string");
  }
  if (typeof o.format !== "string" || !o.format.trim()) {
    errors.push("format must be a non-empty string");
  }
  if (!isNonNegInt(o.games)) errors.push("games must be a non-negative integer");
  if (!isNonNegInt(o.events)) errors.push("events must be a non-negative integer");
  if (!isNonNegInt(o.fileCount)) {
    errors.push("fileCount must be a non-negative integer");
  }
  if (!isSeasonList(o.seasons)) {
    errors.push("seasons must be an array of strings");
  }
  if (
    o.earliestSeason != null &&
    typeof o.earliestSeason !== "string"
  ) {
    errors.push("earliestSeason must be string or null");
  }
  if (o.latestSeason != null && typeof o.latestSeason !== "string") {
    errors.push("latestSeason must be string or null");
  }
  if (o.notes != null) {
    if (
      !Array.isArray(o.notes) ||
      !o.notes.every((n) => typeof n === "string")
    ) {
      errors.push("notes must be an array of strings when present");
    }
  }
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    manifest: {
      source: String(o.source).trim(),
      version: String(o.version).trim(),
      path: String(o.path).trim(),
      importedAt: String(o.importedAt).trim(),
      games: o.games as number,
      events: o.events as number,
      seasons: o.seasons as string[],
      earliestSeason:
        o.earliestSeason == null ? null : String(o.earliestSeason),
      latestSeason: o.latestSeason == null ? null : String(o.latestSeason),
      fileCount: o.fileCount as number,
      format: String(o.format).trim(),
      notes: Array.isArray(o.notes) ? (o.notes as string[]) : undefined,
    },
  };
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Read-only corpus status. Never flips ASK/Game Lab capability. */
export async function getPbpCorpusStatus(options?: {
  env?: PbpEnv;
  cwd?: string;
}): Promise<PbpCorpusStatus> {
  const { dataPath, envPath } = resolvePbpDataPath(
    options?.env ?? process.env,
    options?.cwd
  );
  const manifestPath = path.join(dataPath, MANIFEST_FILENAME);
  const base = {
    dataPath,
    manifestPath,
    envPath,
    executable: false as const,
  };

  if (!(await pathExists(dataPath))) {
    return {
      ...base,
      attachment: "missing",
      manifestPresent: false,
      manifest: null,
      errors: [
        `PBP corpus root not found at ${dataPath}. Set PBP_DATA_PATH or place manifest.json under data/pbp/.`,
      ],
    };
  }

  if (!(await pathExists(manifestPath))) {
    return {
      ...base,
      attachment: "missing",
      manifestPresent: false,
      manifest: null,
      errors: [
        `No ${MANIFEST_FILENAME} under ${dataPath}. Import must write a corpus manifest before coverage can run.`,
      ],
    };
  }

  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch (e) {
    return {
      ...base,
      attachment: "unreadable",
      manifestPresent: true,
      manifest: null,
      errors: [
        `Unable to read ${manifestPath}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      ],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return {
      ...base,
      attachment: "malformed",
      manifestPresent: true,
      manifest: null,
      errors: [
        `Invalid JSON in ${manifestPath}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      ],
    };
  }

  const validated = validatePbpCorpusManifest(parsed);
  if (!validated.ok) {
    return {
      ...base,
      attachment: "malformed",
      manifestPresent: true,
      manifest: null,
      errors: validated.errors,
    };
  }

  return {
    ...base,
    attachment: "attached",
    manifestPresent: true,
    manifest: validated.manifest,
    errors: [],
  };
}

/** Manifest only; null when absent/malformed/unreadable. */
export async function getPbpCorpusManifest(options?: {
  env?: PbpEnv;
  cwd?: string;
}): Promise<PbpCorpusManifest | null> {
  const status = await getPbpCorpusStatus(options);
  return status.manifest;
}

/**
 * Future: load one game’s raw/normalized record.
 * Deferred until the real corpus format is observed — always null today.
 */
export async function getPbpGameRecord(
  _gameId: string,
  options?: { env?: PbpEnv; cwd?: string }
): Promise<null> {
  void _gameId;
  void options;
  return null;
}

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { DrblSeasonArtifact } from "../../../../drbl/models/compute-season";
import type { DrblPlayerSeasonRow } from "../../../../drbl/models/player-value";
import {
  extractBoardProvenance,
  sha256Hex,
  type BoardProvenance,
} from "../../../../drbl/models/board-provenance";
import { isDrblSeason } from "../../../../drbl/historical/season-registry";
import {
  CACHE_TTL_MS,
  isCurrentCanonicalSeason,
} from "./cache-policy";

export type DrblPlayerRow = DrblPlayerSeasonRow;

type CacheEntry = {
  freshUntil: number;
  value: DrblPlayerRow[];
};

const memoryCache = new Map<string, CacheEntry>();
const artifactCache = new Map<string, DrblSeasonArtifact>();

/** Disk paths for known seasons — loaded once per process (not webpack-bundled). */
const BUNDLED_PATH: Record<string, string> = {
  "2024-25": "src/data/drbl/precomputed/2024-25.json",
  "2025-26": "src/data/drbl/precomputed/2025-26.json",
};

/**
 * Prefer process-cached disk JSON for known seasons (avoids bundling ~2.5MB
 * of DRBL artifacts into the webpack graph / every client shared chunk).
 * Disk is consulted once per season per process.
 */
async function readPrecomputed(
  season: string
): Promise<DrblSeasonArtifact | null> {
  const cachedArtifact = artifactCache.get(season);
  if (cachedArtifact?.players?.length) return cachedArtifact;

  const candidates = [
    BUNDLED_PATH[season]
      ? path.join(process.cwd(), BUNDLED_PATH[season])
      : null,
    path.join(
      process.cwd(),
      "src",
      "data",
      "drbl",
      "precomputed",
      `${season}.json`
    ),
    path.join(
      process.cwd(),
      "data",
      "drbl",
      "normalized",
      season,
      "player_season.json"
    ),
  ].filter(Boolean) as string[];
  for (const file of candidates) {
    try {
      const raw = await readFile(file, "utf8");
      const parsed = JSON.parse(raw) as DrblSeasonArtifact;
      if (parsed?.players?.length) {
        artifactCache.set(season, parsed);
        return parsed;
      }
    } catch {
      // try next
    }
  }
  return null;
}

/** Full season artifact (not just player rows) for provenance diagnostics. */
export async function fetchDrblSeasonArtifact(
  season: string
): Promise<DrblSeasonArtifact | null> {
  const cached = artifactCache.get(season);
  if (cached?.players?.length) return cached;
  return readPrecomputed(season);
}

/** Programmatic board provenance for a season's live site artifact. */
export async function fetchDrblBoardProvenance(
  season: string
): Promise<BoardProvenance | null> {
  const artifact = await fetchDrblSeasonArtifact(season);
  if (!artifact?.players?.length) return null;
  const artifactPath =
    BUNDLED_PATH[season] ?? `src/data/drbl/precomputed/${season}.json`;
  let hash = "unknown";
  try {
    const raw = await readFile(path.join(process.cwd(), artifactPath), "utf8");
    hash = sha256Hex(raw);
  } catch {
    hash = sha256Hex(JSON.stringify(artifact));
  }
  return extractBoardProvenance(artifact as unknown as Parameters<typeof extractBoardProvenance>[0], {
    artifactPath,
    artifactHash: hash,
  });
}

/**
 * Load DRBL-Core player rows for a season (precomputed artifact).
 * Returns [] when the season has not been computed yet.
 */
export async function fetchDrblSeason(season: string): Promise<DrblPlayerRow[]> {
  // Registry gate: never fabricate DRBL rows for seasons outside the registry.
  if (!isDrblSeason(season)) {
    return [];
  }

  const now = Date.now();
  const cached = memoryCache.get(season);
  const ttl = isCurrentCanonicalSeason(season)
    ? CACHE_TTL_MS.darkoCurrent
    : CACHE_TTL_MS.darkoHistorical;

  if (cached && cached.freshUntil > now && cached.value.length > 0) {
    return cached.value;
  }

  const artifact = await readPrecomputed(season);
  const rows = artifact?.players ?? [];
  // Do not sticky-cache empty loads — precomputed files may appear mid-session.
  if (rows.length > 0) {
    memoryCache.set(season, {
      value: rows,
      freshUntil: now + ttl,
    });
  } else {
    memoryCache.delete(season);
  }
  return rows;
}

export function peekDrblSeason(season: string): DrblPlayerRow[] | null {
  return memoryCache.get(season)?.value ?? null;
}

export function clearDrblCache(): void {
  memoryCache.clear();
  artifactCache.clear();
}

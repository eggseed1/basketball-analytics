import { mkdir, readFile, writeFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import {
  sharedGetOrSet,
  sharedPeek,
  sharedWriteThrough,
} from "@/data/cache/shared-ttl-cache";
import type { Game } from "@/data/types";
import { ensureGameTeamIdentity } from "@/lib/game-team-identity";
import { startYearFromCanonicalSeason } from "@/data/providers/historical/season-range";

const CACHE_DIR = path.join(process.cwd(), "data", "cache", "games");

/** Historical season archives change rarely — share across Vercel instances. */
const GAMES_SHARED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type GamesCacheMeta = {
  season: string;
  fetchedAt: string;
  count: number;
  source: "balldontlie";
};

export type GamesCachePayload = GamesCacheMeta & {
  games: Game[];
};

export function gamesCachePath(season: string): string {
  return path.join(CACHE_DIR, `${season}.json`);
}

function sharedGamesKey(season: string): string {
  return `games-archive:${season}`;
}

async function readGamesCacheDisk(
  season: string
): Promise<GamesCachePayload | null> {
  try {
    const raw = await readFile(gamesCachePath(season), "utf8");
    const parsed = JSON.parse(raw) as GamesCachePayload;
    if (!Array.isArray(parsed.games) || parsed.games.length === 0) return null;
    return {
      ...parsed,
      games: parsed.games.map((g) => ensureGameTeamIdentity(g, "bdl")),
    };
  } catch {
    return null;
  }
}

/**
 * Prefer Next Data Cache (shared on Vercel), then local disk (dev machines
 * that ran prefetch), then null.
 */
export async function readGamesCache(
  season: string
): Promise<GamesCachePayload | null> {
  const mem = sharedPeek<GamesCachePayload>(sharedGamesKey(season));
  if (mem && mem.games.length > 0) return mem;

  try {
    return await sharedGetOrSet(
      sharedGamesKey(season),
      {
        ttlMs: GAMES_SHARED_TTL_MS,
        tags: ["games-archive", `games:${season}`],
      },
      async () => {
        const disk = await readGamesCacheDisk(season);
        if (disk) return disk;
        // Signal miss without caching empty forever — throw so unstable_cache
        // does not store a null payload across instances.
        throw new Error(`games-cache-miss:${season}`);
      }
    );
  } catch {
    return readGamesCacheDisk(season);
  }
}

export async function writeGamesCache(
  season: string,
  games: Game[]
): Promise<GamesCachePayload> {
  const payload: GamesCachePayload = {
    season,
    fetchedAt: new Date().toISOString(),
    count: games.length,
    source: "balldontlie",
    games,
  };

  // Warm shared + process cache so other Vercel instances can reuse this pull.
  await sharedWriteThrough(
    sharedGamesKey(season),
    {
      ttlMs: GAMES_SHARED_TTL_MS,
      tags: ["games-archive", `games:${season}`],
    },
    payload
  );

  // Best-effort disk write — succeeds locally / CI; ignored on read-only FS.
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(gamesCachePath(season), JSON.stringify(payload), "utf8");
  } catch {
    // Ephemeral serverless filesystem.
  }

  return payload;
}

export async function listCachedSeasons(): Promise<
  Array<{ season: string; count: number; fetchedAt: string }>
> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const files = await readdir(CACHE_DIR);
    const rows: Array<{ season: string; count: number; fetchedAt: string }> =
      [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const season = file.replace(/\.json$/, "");
      const cached = await readGamesCache(season);
      if (cached) {
        rows.push({
          season,
          count: cached.count,
          fetchedAt: cached.fetchedAt,
        });
      }
    }
    return rows.sort((a, b) => b.season.localeCompare(a.season));
  } catch {
    return [];
  }
}

export async function cacheExists(season: string): Promise<boolean> {
  try {
    const info = await stat(gamesCachePath(season));
    return info.isFile() && info.size > 50;
  } catch {
    return false;
  }
}

/**
 * Disk season archives are "adequate" when they look like a full regular-season
 * slate (not a thin smoke-test scrape). Historical seasons legitimately have
 * fewer games than modern ones.
 */
export function isAdequateSeasonGamesCache(
  season: string,
  count: number
): boolean {
  try {
    const start = startYearFromCanonicalSeason(season);
    const minExpected = start >= 2000 ? 1000 : 200;
    return count >= minExpected;
  } catch {
    return count >= 200;
  }
}

/**
 * Resolve a single game id from season disk caches (normalized on read).
 * Prefer newer seasons first. Sync identity only — no network.
 */
export async function findCachedGame(gameId: string): Promise<Game | null> {
  const id = String(gameId).trim();
  if (!id) return null;
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const files = await readdir(CACHE_DIR);
    const seasons = files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort((a, b) => b.localeCompare(a));
    for (const season of seasons) {
      const cached = await readGamesCache(season);
      const hit = cached?.games.find((g) => g.id === id);
      if (hit) return hit;
    }
  } catch {
    return null;
  }
  return null;
}

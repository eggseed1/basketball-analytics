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
import {
  getRuntimeSnapshotGames,
  runtimeGameSnapshotMeta,
} from "@/data/runtime/game-snapshot";

const CACHE_DIR = path.join(process.cwd(), "data", "cache", "games");
const GAMES_SHARED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type GamesCacheMeta = {
  season: string;
  fetchedAt: string;
  count: number;
  source: "balldontlie" | "runtime_snapshot";
};

export type GamesCachePayload = GamesCacheMeta & { games: Game[] };

export function gamesCachePath(season: string): string {
  return path.join(CACHE_DIR, `${season}.json`);
}

function sharedGamesKey(season: string): string {
  return `games-archive:${season}`;
}

function runtimeArchive(season: string): GamesCachePayload | null {
  const games = getRuntimeSnapshotGames(season);
  if (!isAdequateSeasonGamesCache(season, games.length)) return null;
  const meta = runtimeGameSnapshotMeta();
  return {
    season,
    fetchedAt: meta.generatedAt ?? new Date(0).toISOString(),
    count: games.length,
    source: "runtime_snapshot",
    games,
  };
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
 * Deployed build snapshot is a first-class season archive. Cursor may have a
 * larger ignored `data/cache/games` directory, but production must never lose
 * modern season discovery solely because that developer cache is absent.
 */
export async function readGamesCache(
  season: string
): Promise<GamesCachePayload | null> {
  const bundled = runtimeArchive(season);
  if (bundled) return bundled;

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

  await sharedWriteThrough(
    sharedGamesKey(season),
    {
      ttlMs: GAMES_SHARED_TTL_MS,
      tags: ["games-archive", `games:${season}`],
    },
    payload
  );

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
  const bySeason = new Map<
    string,
    { season: string; count: number; fetchedAt: string }
  >();
  for (const game of getRuntimeSnapshotGames()) {
    const existing = bySeason.get(game.season);
    if (existing) existing.count += 1;
    else {
      bySeason.set(game.season, {
        season: game.season,
        count: 1,
        fetchedAt:
          runtimeGameSnapshotMeta().generatedAt ?? new Date(0).toISOString(),
      });
    }
  }

  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const files = await readdir(CACHE_DIR);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const season = file.replace(/\.json$/, "");
      if (bySeason.has(season)) continue;
      const cached = await readGamesCache(season);
      if (cached) {
        bySeason.set(season, {
          season,
          count: cached.count,
          fetchedAt: cached.fetchedAt,
        });
      }
    }
  } catch {
    // no local cache
  }
  return [...bySeason.values()].sort((a, b) => b.season.localeCompare(a.season));
}

export async function cacheExists(season: string): Promise<boolean> {
  if (runtimeArchive(season)) return true;
  try {
    const info = await stat(gamesCachePath(season));
    return info.isFile() && info.size > 50;
  } catch {
    return false;
  }
}

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

export async function findCachedGame(gameId: string): Promise<Game | null> {
  const id = String(gameId).trim();
  if (!id) return null;

  for (const game of getRuntimeSnapshotGames()) {
    if (game.id === id) return game;
  }

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

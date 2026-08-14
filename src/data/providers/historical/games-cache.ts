import { mkdir, readFile, writeFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import type { Game } from "@/data/types";

const CACHE_DIR = path.join(process.cwd(), "data", "cache", "games");

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

export async function readGamesCache(
  season: string
): Promise<GamesCachePayload | null> {
  try {
    const raw = await readFile(gamesCachePath(season), "utf8");
    const parsed = JSON.parse(raw) as GamesCachePayload;
    if (!Array.isArray(parsed.games) || parsed.games.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeGamesCache(
  season: string,
  games: Game[]
): Promise<GamesCachePayload> {
  await mkdir(CACHE_DIR, { recursive: true });
  const payload: GamesCachePayload = {
    season,
    fetchedAt: new Date().toISOString(),
    count: games.length,
    source: "balldontlie",
    games,
  };
  await writeFile(gamesCachePath(season), JSON.stringify(payload), "utf8");
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

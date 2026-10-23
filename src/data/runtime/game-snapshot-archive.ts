/**
 * Older schedule seasons for Cloudflare Workers.
 * Current+prior stay inlined in game-snapshot.json; prior years ship as
 * Static Assets under /runtime/game-seasons/{season}.json.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Game } from "@/data/types";
import {
  getRuntimeSnapshotGames,
  primeRuntimeSnapshotSeason,
} from "@/data/runtime/game-snapshot";

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

type SeasonFile = {
  season?: string;
  games?: Game[];
};

const memory = new Map<string, Game[]>();

function cloudflareAssets(): AssetsFetcher | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: () => { env?: { ASSETS?: AssetsFetcher } };
    };
    return getCloudflareContext()?.env?.ASSETS ?? null;
  } catch {
    return null;
  }
}

function loadFromPublicDir(season: string): Game[] | null {
  try {
    const file = path.join(
      process.cwd(),
      "public",
      "runtime",
      "game-seasons",
      `${season}.json`
    );
    if (!existsSync(file)) return null;
    const parsed = JSON.parse(readFileSync(file, "utf8")) as SeasonFile;
    return Array.isArray(parsed.games) ? parsed.games : null;
  } catch {
    return null;
  }
}

async function loadFromAssets(season: string): Promise<Game[] | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(
      `https://assets.local/runtime/game-seasons/${encodeURIComponent(season)}.json`
    );
    if (!response.ok) return null;
    const parsed = (await response.json()) as SeasonFile;
    return Array.isArray(parsed.games) ? parsed.games : null;
  } catch {
    return null;
  }
}

/**
 * Schedule games for a season: Worker lite snapshot first, then ASSETS/disk
 * archive for older years.
 */
export async function getRuntimeSnapshotGamesAsync(
  season?: string
): Promise<Game[]> {
  if (!season) return getRuntimeSnapshotGames();
  const inline = getRuntimeSnapshotGames(season);
  if (inline.length > 0) return inline;

  const cached = memory.get(season);
  if (cached) return cached;

  const fromDisk = loadFromPublicDir(season);
  if (fromDisk?.length) {
    memory.set(season, fromDisk);
    primeRuntimeSnapshotSeason(season, fromDisk);
    return fromDisk;
  }

  const fromAssets = await loadFromAssets(season);
  if (fromAssets?.length) {
    memory.set(season, fromAssets);
    primeRuntimeSnapshotSeason(season, fromAssets);
    return fromAssets;
  }

  return [];
}

/** Ensure older seasons are primed before sync snapshot helpers run. */
export async function ensureRuntimeSnapshotSeason(season: string): Promise<void> {
  await getRuntimeSnapshotGamesAsync(season);
}

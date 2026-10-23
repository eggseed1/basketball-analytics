/**
 * Build-time ESPN schedule snapshot (current + prior season).
 * Lives under public/runtime (ASSETS) so the ~1.4MB lite JSON stays off the
 * Worker isolate; Node can also merge game-snapshot-full.json for tests.
 *
 * Older seasons: public/runtime/game-seasons/{season}.json via game-snapshot-archive.
 */
import type { Game } from "@/data/types";

export type RuntimeGameSnapshot = {
  generatedAt: string | null;
  source: string;
  seasons?: string[];
  games: Game[];
};

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/game-snapshot.json";

let primed = false;
let liteSeasons: string[] = [];
let generatedAt: string | null = null;
let source = "espn-build-snapshot";
let usingNodeArchive = false;

const byId = new Map<string, Game>();
const bySeason = new Map<string, Game[]>();
const playoffsBySeason = new Map<string, Game[]>();
let allGames: Game[] = [];

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

function loadLiteFromPublicDir(): RuntimeGameSnapshot | null {
  try {
    if (process.env.NEXT_RUNTIME === "edge") return null;
    // eslint-disable-next-line no-eval
    const req = eval("require") as NodeRequire;
    const fs = req("node:fs") as typeof import("node:fs");
    const path = req("node:path") as typeof import("node:path");
    const file = path.join(
      process.cwd(),
      "public",
      "runtime",
      "game-snapshot.json"
    );
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as RuntimeGameSnapshot;
  } catch {
    return null;
  }
}

async function loadLiteFromAssets(): Promise<RuntimeGameSnapshot | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${ASSET_PATH}`);
    if (!response.ok) return null;
    return (await response.json()) as RuntimeGameSnapshot;
  } catch {
    return null;
  }
}

function loadNodeArchiveGames(): Game[] | null {
  try {
    if (process.env.NEXT_RUNTIME === "edge") return null;
    if (typeof (globalThis as { EdgeRuntime?: string }).EdgeRuntime === "string") {
      return null;
    }
    // eslint-disable-next-line no-eval
    const req = eval("require") as NodeRequire;
    const fs = req("node:fs") as typeof import("node:fs");
    const path = req("node:path") as typeof import("node:path");
    const file = path.join(
      process.cwd(),
      "src/data/runtime/game-snapshot-full.json"
    );
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as RuntimeGameSnapshot;
    return Array.isArray(parsed.games) ? parsed.games : null;
  } catch {
    return null;
  }
}

function indexGames(games: Game[]): void {
  byId.clear();
  bySeason.clear();
  playoffsBySeason.clear();
  allGames = games;
  for (const game of games) {
    byId.set(String(game.id), game);
    const season = String(game.season ?? "");
    if (!season) continue;
    const list = bySeason.get(season);
    if (list) list.push(game);
    else bySeason.set(season, [game]);
    if (game.gameType === "playoff" || game.gameType === "play-in") {
      const po = playoffsBySeason.get(season);
      if (po) po.push(game);
      else playoffsBySeason.set(season, [game]);
    }
  }
}

/** Load lite (+ Node full archive when present) once. */
export async function ensureGameSnapshotLite(): Promise<void> {
  if (primed) return;

  const fromDisk = loadLiteFromPublicDir();
  const lite = fromDisk ?? (await loadLiteFromAssets());
  const archiveGames = loadNodeArchiveGames();

  if (archiveGames?.length) {
    usingNodeArchive = true;
    generatedAt = lite?.generatedAt ?? null;
    source = lite?.source ?? source;
    liteSeasons = lite?.seasons ?? [];
    indexGames(archiveGames);
  } else if (lite && Array.isArray(lite.games)) {
    generatedAt = lite.generatedAt ?? null;
    source = lite.source ?? source;
    liteSeasons = lite.seasons ?? [];
    indexGames(lite.games);
  } else {
    indexGames([]);
  }

  primed = true;
}

export function runtimeGameSnapshotMeta() {
  return {
    generatedAt,
    source,
    gameCount: allGames.length,
    liteSeasons,
    usingNodeArchive,
    primed,
  };
}

export function getRuntimeSnapshotGame(gameId: string): Game | null {
  return byId.get(String(gameId ?? "").trim()) ?? null;
}

export function getRuntimeSnapshotGames(season?: string): Game[] {
  if (!season) return allGames;
  return bySeason.get(season) ?? [];
}

/** Playoff + play-in only — avoids scanning the full season schedule on CF. */
export function getRuntimeSnapshotPlayoffGames(season: string): Game[] {
  return playoffsBySeason.get(season) ?? [];
}

/**
 * Merge an ASSETS/disk archive season into the in-memory indexes so existing
 * sync helpers (team tabs, standings-from-games) can read older years on Workers.
 */
export function primeRuntimeSnapshotSeason(season: string, seasonGames: Game[]): void {
  const key = String(season ?? "").trim();
  if (!key || !seasonGames.length) return;
  if ((bySeason.get(key)?.length ?? 0) > 0) return;
  bySeason.set(key, seasonGames);
  for (const game of seasonGames) {
    byId.set(String(game.id), game);
    allGames.push(game);
    if (game.gameType === "playoff" || game.gameType === "play-in") {
      const po = playoffsBySeason.get(key);
      if (po) po.push(game);
      else playoffsBySeason.set(key, [game]);
    }
  }
}

export function getRuntimeSnapshotWindow(options: {
  season?: string;
  fromDate?: string;
  toDate?: string;
  status?: Game["status"] | Game["status"][];
} = {}): Game[] {
  const statuses = options.status
    ? new Set(Array.isArray(options.status) ? options.status : [options.status])
    : null;
  return allGames.filter((game) => {
    if (options.season && game.season !== options.season) return false;
    if (options.fromDate && game.gameDate < options.fromDate) return false;
    if (options.toDate && game.gameDate > options.toDate) return false;
    if (statuses && !statuses.has(game.status)) return false;
    return true;
  });
}

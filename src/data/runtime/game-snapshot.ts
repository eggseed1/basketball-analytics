import snapshot from "./game-snapshot.json";

import type { Game } from "@/data/types";

export type RuntimeGameSnapshot = {
  generatedAt: string | null;
  source: string;
  seasons?: string[];
  games: Game[];
};

/**
 * Build-time ESPN schedule snapshot.
 *
 * IMPORTANT (Cloudflare Workers / OpenNext): do NOT load the full archive via
 * `node:fs` on the Worker. Workers' virtual FS is ephemeral, so keep the
 * current+prior season JSON on the module graph (≈100 KiB gzip).
 *
 * Older seasons live in `game-snapshot-full.json` and are merged only on Node
 * (tests, local `next dev`) so team/history fixtures keep working without
 * bloating the Worker bundle.
 */
const lite = snapshot as RuntimeGameSnapshot;

function loadNodeArchiveGames(): Game[] | null {
  try {
    if (process.env.NEXT_RUNTIME === "edge") return null;
    if (typeof (globalThis as { EdgeRuntime?: string }).EdgeRuntime === "string") {
      return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path") as typeof import("node:path");
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

const archiveGames = loadNodeArchiveGames();
const data: RuntimeGameSnapshot = archiveGames
  ? {
      generatedAt: lite.generatedAt,
      source: lite.source,
      seasons: [
        ...new Set([
          ...(lite.seasons ?? []),
          ...archiveGames.map((g) => String(g.season ?? "")).filter(Boolean),
        ]),
      ].sort(),
      games: archiveGames,
    }
  : lite;

const games = Array.isArray(data.games) ? data.games : [];
const byId = new Map(games.map((game) => [String(game.id), game] as const));
const bySeason = new Map<string, Game[]>();
const playoffsBySeason = new Map<string, Game[]>();

for (const game of games) {
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

export function runtimeGameSnapshotMeta() {
  return {
    generatedAt: data.generatedAt,
    source: data.source,
    gameCount: games.length,
    liteSeasons: lite.seasons ?? [],
    usingNodeArchive: Boolean(archiveGames),
  };
}

export function getRuntimeSnapshotGame(gameId: string): Game | null {
  return byId.get(String(gameId ?? "").trim()) ?? null;
}

export function getRuntimeSnapshotGames(season?: string): Game[] {
  if (!season) return games;
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
  return games.filter((game) => {
    if (options.season && game.season !== options.season) return false;
    if (options.fromDate && game.gameDate < options.fromDate) return false;
    if (options.toDate && game.gameDate > options.toDate) return false;
    if (statuses && !statuses.has(game.status)) return false;
    return true;
  });
}

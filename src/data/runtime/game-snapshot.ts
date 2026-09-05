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
 * IMPORTANT (Cloudflare Workers / OpenNext): do NOT load this via `node:fs`.
 * Workers' virtual FS is ephemeral and does not mount OpenNext traced files, so
 * `readFileSync(process.cwd()/...)` silently returns empty and empties Scores /
 * Upcoming / player schedule surfaces. Keep the JSON on the module graph so it
 * is inlined into the Worker script (≈100 KiB gzip).
 */
const data = snapshot as RuntimeGameSnapshot;
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

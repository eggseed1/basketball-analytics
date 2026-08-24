import snapshot from "./game-snapshot.json";

import type { Game } from "@/data/types";

export type RuntimeGameSnapshot = {
  generatedAt: string | null;
  source: string;
  seasons?: string[];
  aliases?: Record<string, string>;
  games: Game[];
};

const data = snapshot as RuntimeGameSnapshot;
const games = Array.isArray(data.games) ? data.games : [];
const aliases = data.aliases ?? {};
const byId = new Map(games.map((game) => [String(game.id), game] as const));

export function runtimeGameSnapshotMeta() {
  return {
    generatedAt: data.generatedAt,
    source: data.source,
    gameCount: games.length,
    aliasCount: Object.keys(aliases).length,
  };
}

export function resolveRuntimeSnapshotGameId(gameId: string): string {
  const raw = String(gameId ?? "").trim();
  return aliases[raw] ?? raw;
}

export function getRuntimeSnapshotGame(gameId: string): Game | null {
  return byId.get(resolveRuntimeSnapshotGameId(gameId)) ?? null;
}

export function getRuntimeSnapshotGames(season?: string): Game[] {
  if (!season) return games;
  return games.filter((game) => game.season === season);
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

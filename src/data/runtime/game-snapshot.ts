/**
 * Build-time ESPN schedule snapshot.
 *
 * JSON lives under src/data/runtime for bake scripts and is copied to
 * public/runtime before OpenNext so Workers serve it via ASSETS. Do not
 * static-import the file — that inlined ~7 MiB into the origin Worker script.
 */
import type { Game } from "@/data/types";

import { loadRuntimeJson } from "./load-runtime-json";

export type RuntimeGameSnapshot = {
  generatedAt: string | null;
  source: string;
  seasons?: string[];
  games: Game[];
};

type Indexes = {
  data: RuntimeGameSnapshot;
  games: Game[];
  byId: Map<string, Game>;
  bySeason: Map<string, Game[]>;
  playoffsBySeason: Map<string, Game[]>;
};

let indexes: Indexes | null = null;
let loadPromise: Promise<Indexes> | null = null;

function buildIndexes(data: RuntimeGameSnapshot): Indexes {
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

  return { data, games, byId, bySeason, playoffsBySeason };
}

const EMPTY: RuntimeGameSnapshot = {
  generatedAt: null,
  source: "missing",
  games: [],
};

async function ensureIndexes(): Promise<Indexes> {
  if (indexes) return indexes;
  if (!loadPromise) {
    loadPromise = (async () => {
      const raw =
        (await loadRuntimeJson<RuntimeGameSnapshot>("game-snapshot.json")) ??
        EMPTY;
      indexes = buildIndexes(raw);
      return indexes;
    })();
  }
  return loadPromise;
}

export async function ensureRuntimeGameSnapshot(): Promise<void> {
  await ensureIndexes();
}

export async function runtimeGameSnapshotMeta() {
  const { data, games } = await ensureIndexes();
  return {
    generatedAt: data.generatedAt,
    source: data.source,
    gameCount: games.length,
  };
}

export async function getRuntimeSnapshotGame(
  gameId: string
): Promise<Game | null> {
  const { byId } = await ensureIndexes();
  return byId.get(String(gameId ?? "").trim()) ?? null;
}

export async function getRuntimeSnapshotGames(
  season?: string
): Promise<Game[]> {
  const { games, bySeason } = await ensureIndexes();
  if (!season) return games;
  return bySeason.get(season) ?? [];
}

/** Playoff + play-in only — avoids scanning the full season schedule on CF. */
export async function getRuntimeSnapshotPlayoffGames(
  season: string
): Promise<Game[]> {
  const { playoffsBySeason } = await ensureIndexes();
  return playoffsBySeason.get(season) ?? [];
}

export async function getRuntimeSnapshotWindow(options: {
  season?: string;
  fromDate?: string;
  toDate?: string;
  status?: Game["status"] | Game["status"][];
} = {}): Promise<Game[]> {
  const { games } = await ensureIndexes();
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

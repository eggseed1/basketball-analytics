/**
 * Historical player career / season / game-log product loaders (P18B).
 * Disk-backed — no raw archive scans.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { HISTORY_VERSION } from "@/lib/history/capabilities";
import type {
  HistoryCareerSummary,
  HistoryPlayerGame,
  HistoryPlayerSeason,
} from "@/data/history/player-career-types";

export type {
  HistoryCareerSummary,
  HistoryPlayerGame,
  HistoryPlayerSeason,
} from "@/data/history/player-career-types";
export { historySeasonSupportsDrbl } from "@/data/history/player-career-types";

const HISTORY_ROOT = path.join(
  process.cwd(),
  "data",
  "drbl",
  "history",
  HISTORY_VERSION
);

function readJson<T>(p: string): T | null {
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
}

let seasonsCache: HistoryPlayerSeason[] | null = null;
let careersCache: HistoryCareerSummary[] | null = null;

/** Bounded season → rows cache. Avoids re-parsing 9–16MB player-games.json per request. */
const PLAYER_GAMES_CACHE_MAX = 6;
const playerGamesBySeason = new Map<string, HistoryPlayerGame[]>();

function getSeasonPlayerGameRows(season: string): HistoryPlayerGame[] {
  const cached = playerGamesBySeason.get(season);
  if (cached) return cached;
  const p = path.join(HISTORY_ROOT, season, "player-games.json");
  const data = readJson<{ rows: HistoryPlayerGame[] }>(p);
  const rows = data?.rows ?? [];
  if (playerGamesBySeason.size >= PLAYER_GAMES_CACHE_MAX) {
    const oldest = playerGamesBySeason.keys().next().value;
    if (oldest !== undefined) playerGamesBySeason.delete(oldest);
  }
  playerGamesBySeason.set(season, rows);
  return rows;
}

/** Test / sync helper — clears memoized career + game-log season caches. */
export function clearHistoryCareerCaches() {
  seasonsCache = null;
  careersCache = null;
  playerGamesBySeason.clear();
}

export function getHistoryPlayerSeasons(): HistoryPlayerSeason[] {
  if (seasonsCache) return seasonsCache;
  const data = readJson<{ rows: HistoryPlayerSeason[] }>(
    path.join(HISTORY_ROOT, "players", "player-seasons.json")
  );
  seasonsCache = data?.rows ?? [];
  return seasonsCache;
}

export function getHistoryCareerSummaries(): HistoryCareerSummary[] {
  if (careersCache) return careersCache;
  const data = readJson<{ players: HistoryCareerSummary[] }>(
    path.join(HISTORY_ROOT, "players", "career-summaries.json")
  );
  careersCache = data?.players ?? [];
  return careersCache;
}

export function getHistoryCareerForPlayer(
  playerId: string
): HistoryCareerSummary | null {
  return (
    getHistoryCareerSummaries().find((p) => p.playerId === playerId) ?? null
  );
}

export function getHistorySeasonsForPlayer(
  playerId: string
): HistoryPlayerSeason[] {
  return getHistoryPlayerSeasons()
    .filter((r) => r.playerId === playerId)
    .sort((a, b) => b.season.localeCompare(a.season));
}

/**
 * Player game log for one season from precomputed player-games.json.
 */
export function getHistoryPlayerGames(
  playerId: string,
  season: string,
  opts?: {
    homeAway?: "home" | "away";
    result?: "W" | "L";
    opponentId?: string;
    limit?: number;
    offset?: number;
  }
): HistoryPlayerGame[] {
  let rows = getSeasonPlayerGameRows(season).filter(
    (r) => r.playerId === playerId
  );
  if (opts?.homeAway) rows = rows.filter((r) => r.homeAway === opts.homeAway);
  if (opts?.result) rows = rows.filter((r) => r.result === opts.result);
  if (opts?.opponentId)
    rows = rows.filter((r) => r.opponentId === opts.opponentId);
  rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const offset = opts?.offset ?? 0;
  const limit = opts?.limit ?? 200;
  return rows.slice(offset, offset + limit);
}

export function listHistoryTopGames(
  playerId: string,
  sortKey: "points" | "assists" | "rebounds" | "threePm",
  limit = 10
): HistoryPlayerGame[] {
  const seasons = getHistorySeasonsForPlayer(playerId).map((s) => s.season);
  const all: HistoryPlayerGame[] = [];
  for (const season of seasons) {
    all.push(...getHistoryPlayerGames(playerId, season, { limit: 5000 }));
  }
  return all
    .slice()
    .sort((a, b) => (b[sortKey] as number) - (a[sortKey] as number))
    .slice(0, limit);
}

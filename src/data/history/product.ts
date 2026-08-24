/**
 * Historical product data loaders (P18A).
 *
 * Precomputed deep artifacts remain the richest source, but season/game
 * discovery must not disappear merely because a developer's ignored local
 * history directory is absent on Vercel. Modern seasons fall back to the
 * canonical build snapshot, whose NBA GameIDs unlock the same on-demand
 * box/PBP/Game Lab pipeline used in Cursor.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { HISTORY_VERSION } from "@/lib/history/capabilities";
import {
  getRuntimeSnapshotGames,
  runtimeGameSnapshotMeta,
} from "@/data/runtime/game-snapshot";
import type { Game } from "@/data/types";
import type {
  HistoricalGameArtifact,
  HistoricalGameSummary,
} from "@/data/history/types";

export type {
  HistoricalGameArtifact,
  HistoricalGameSummary,
  HistoricalPlayerGame,
} from "@/data/history/types";

const HISTORY_ROOT = path.join(
  process.cwd(),
  "data",
  "drbl",
  "history",
  HISTORY_VERSION
);

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

const SUMMARY_CACHE_MAX = 8;
const GAME_CACHE_MAX = 48;
const summariesBySeason = new Map<string, HistoricalGameSummary[]>();
const productGameByKey = new Map<string, HistoricalGameArtifact | null>();

function rememberSummary(season: string, games: HistoricalGameSummary[]) {
  if (summariesBySeason.size >= SUMMARY_CACHE_MAX) {
    const oldest = summariesBySeason.keys().next().value;
    if (oldest !== undefined) summariesBySeason.delete(oldest);
  }
  summariesBySeason.set(season, games);
}

function rememberProductGame(key: string, game: HistoricalGameArtifact | null) {
  if (productGameByKey.size >= GAME_CACHE_MAX) {
    const oldest = productGameByKey.keys().next().value;
    if (oldest !== undefined) productGameByKey.delete(oldest);
  }
  productGameByKey.set(key, game);
}

function snapshotSummary(game: Game): HistoricalGameSummary {
  const completed = game.status === "final";
  const nbaGameId = /^00\d{8}$/.test(game.id);
  const periodCount = Math.max(
    game.homePeriodScores?.length ?? 0,
    game.awayPeriodScores?.length ?? 0,
    completed ? 4 : 0
  );
  const winnerTeamId =
    completed && game.homeScore !== game.awayScore
      ? game.homeScore > game.awayScore
        ? game.homeTeamId
        : game.awayTeamId
      : null;
  return {
    historyVersion: HISTORY_VERSION,
    season: game.season,
    gameId: game.id,
    provider: game.teamIdProvider ?? "nba",
    seasonType:
      game.gameType === "playoff"
        ? "Playoffs"
        : game.gameType === "preseason"
          ? "Preseason"
          : "Regular Season",
    date: game.gameDate,
    homeTeamId: game.homeProviderTeamId ?? game.homeTeamId,
    awayTeamId: game.awayProviderTeamId ?? game.awayTeamId,
    homeTricode: game.homeTeamAbbr ?? null,
    awayTricode: game.awayTeamAbbr ?? null,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    winnerTeamId,
    periodCount,
    // NBA liveData exposes traditional box + PBP by NBA GameID for completed
    // modern games. Deep derived features are computed on demand by Game Lab.
    boxAvailable: completed && nbaGameId,
    pbpAvailable: completed && nbaGameId,
    scoreTimelineAvailable: completed && nbaGameId,
    drblAvailable: completed && nbaGameId,
    largestHomeLead: null,
    largestAwayLead: null,
    largestDeficitOvercomeByWinner: null,
    leadChanges: null,
    ties: null,
    largestStrictRunHome: null,
    largestStrictRunAway: null,
  };
}

function snapshotSeasons(): string[] {
  const seasons = new Set<string>();
  for (const game of getRuntimeSnapshotGames()) seasons.add(game.season);
  return [...seasons].sort();
}

export function listHistoryProductSeasons(): string[] {
  const seasons = new Set(snapshotSeasons());
  if (existsSync(HISTORY_ROOT)) {
    for (const entry of readdirSync(HISTORY_ROOT, { withFileTypes: true })) {
      if (entry.isDirectory()) seasons.add(entry.name);
    }
  }
  return [...seasons].sort();
}

export function getHistorySeasonManifest(season: string) {
  const disk = readJsonFile<Record<string, unknown>>(
    path.join(HISTORY_ROOT, season, "season-manifest.json")
  );
  if (disk) return disk;
  const games = getRuntimeSnapshotGames(season);
  if (!games.length) return null;
  const completed = games.filter((game) => game.status === "final").length;
  return {
    historyVersion: HISTORY_VERSION,
    season,
    source: runtimeGameSnapshotMeta().source,
    generatedAt: runtimeGameSnapshotMeta().generatedAt,
    gameCount: games.length,
    scoreTimelineSupported: completed,
    runtimeDerived: true,
  };
}

export function getHistoricalGameSummaries(
  season: string
): HistoricalGameSummary[] {
  const cached = summariesBySeason.get(season);
  if (cached) return cached;
  const data = readJsonFile<{ games: HistoricalGameSummary[] }>(
    path.join(HISTORY_ROOT, season, "game-summaries.json")
  );
  const games =
    data?.games?.length
      ? data.games
      : getRuntimeSnapshotGames(season).map(snapshotSummary);
  rememberSummary(season, games);
  return games;
}

export function getHistoricalProductGame(
  gameId: string,
  seasonHint?: string
): HistoricalGameArtifact | null {
  const cacheKey = `${seasonHint ?? ""}:${gameId}`;
  if (productGameByKey.has(cacheKey)) {
    return productGameByKey.get(cacheKey) ?? null;
  }

  if (seasonHint) {
    const p = path.join(HISTORY_ROOT, seasonHint, "games", `${gameId}.json`);
    const hit = readJsonFile<HistoricalGameArtifact>(p);
    rememberProductGame(cacheKey, hit);
    return hit;
  }
  const m = /^002(\d{2})/.exec(gameId);
  if (m) {
    const yy = Number(m[1]);
    const start = yy >= 50 ? 1900 + yy : 2000 + yy;
    const season = `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
    const p = path.join(HISTORY_ROOT, season, "games", `${gameId}.json`);
    const hit = readJsonFile<HistoricalGameArtifact>(p);
    if (hit) {
      rememberProductGame(cacheKey, hit);
      return hit;
    }
  }
  for (const season of listHistoryProductSeasons()) {
    const p = path.join(HISTORY_ROOT, season, "games", `${gameId}.json`);
    const hit = readJsonFile<HistoricalGameArtifact>(p);
    if (hit) {
      rememberProductGame(cacheKey, hit);
      return hit;
    }
  }
  rememberProductGame(cacheKey, null);
  return null;
}

export function searchHistoricalProductGames(params: {
  season: string;
  teamId?: string;
  playerId?: string;
  date?: string;
}): HistoricalGameSummary[] {
  const { season, teamId, playerId, date } = params;
  let ids: string[] | null = null;
  let usedDiskIndex = false;

  if (teamId) {
    const idx = readJsonFile<Record<string, string[]>>(
      path.join(HISTORY_ROOT, season, "index-by-team.json")
    );
    if (idx) {
      ids = idx[teamId] ?? [];
      usedDiskIndex = true;
    }
  }
  if (playerId) {
    const idx = readJsonFile<Record<string, string[]>>(
      path.join(HISTORY_ROOT, season, "index-by-player.json")
    );
    if (idx) {
      const playerIds = idx[playerId] ?? [];
      ids = ids ? ids.filter((id) => playerIds.includes(id)) : playerIds;
      usedDiskIndex = true;
    }
  }
  if (date) {
    const idx = readJsonFile<Record<string, string[]>>(
      path.join(HISTORY_ROOT, season, "index-by-date.json")
    );
    if (idx) {
      const dateIds = idx[date] ?? [];
      ids = ids ? ids.filter((id) => dateIds.includes(id)) : dateIds;
      usedDiskIndex = true;
    }
  }

  let all = getHistoricalGameSummaries(season);
  if (ids) {
    const set = new Set(ids);
    all = all.filter((g) => set.has(g.gameId));
  }
  // Runtime snapshot has no materialized indexes, so retain useful team/date
  // filtering from the compact game rows themselves. Player filtering requires
  // the precomputed player index and is left to the full player/game surfaces.
  if (!usedDiskIndex && teamId) {
    all = all.filter(
      (g) => g.homeTeamId === teamId || g.awayTeamId === teamId
    );
  }
  if (!usedDiskIndex && date) all = all.filter((g) => g.date === date);
  if (!usedDiskIndex && playerId) return [];
  return all;
}

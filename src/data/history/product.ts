/**
 * Historical product data loaders (P18A).
 * Reads compact precomputed artifacts — never walks the raw archive at request time.
 * On Cloudflare (no disk history tree), falls back to the ESPN runtime game snapshot.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { HISTORY_VERSION } from "@/lib/history/capabilities";
import type {
  HistoricalGameArtifact,
  HistoricalGameSummary,
} from "@/data/history/types";
import type { Game } from "@/data/types";
import {
  getRuntimeSnapshotGames,
  runtimeGameSnapshotMeta,
} from "@/data/runtime/game-snapshot";
import { looksLikeEspnEventId } from "@/data/identity/game-id";
import {
  getCanonicalTeamById,
  getCanonicalTeamFromProvider,
  resolveCanonicalTeam,
} from "@/data/identity/team-map";

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

function winnerTeamId(game: Game): string | null {
  if (game.status !== "final") return null;
  if (game.homeScore === game.awayScore) return null;
  return game.homeScore > game.awayScore ? game.homeTeamId : game.awayTeamId;
}

function periodCount(game: Game): number {
  const home = game.homePeriodScores?.length ?? 0;
  const away = game.awayPeriodScores?.length ?? 0;
  const fromLines = Math.max(home, away);
  if (fromLines > 0) return fromLines;
  if (typeof game.period === "number" && game.period > 0) return game.period;
  return 4;
}

/** Convert a schedule Game into a history-product summary row. */
export function historicalSummaryFromGame(game: Game): HistoricalGameSummary {
  const espn = looksLikeEspnEventId(game.id);
  return {
    historyVersion: HISTORY_VERSION,
    season: game.season,
    gameId: game.id,
    provider: game.teamIdProvider ?? (espn ? "espn" : "unknown"),
    seasonType:
      game.gameType === "playoff"
        ? "Playoffs"
        : game.gameType === "preseason"
          ? "Preseason"
          : "Regular Season",
    date: game.gameDate,
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    homeTricode: game.homeTeamAbbr ?? null,
    awayTricode: game.awayTeamAbbr ?? null,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    winnerTeamId: winnerTeamId(game),
    periodCount: periodCount(game),
    boxAvailable: espn || game.status === "final",
    pbpAvailable: espn,
    scoreTimelineAvailable: espn,
    drblAvailable: false,
    largestHomeLead: null,
    largestAwayLead: null,
    largestDeficitOvercomeByWinner: null,
    leadChanges: null,
    ties: null,
    largestStrictRunHome: null,
    largestStrictRunAway: null,
  };
}

function summariesFromRuntimeSnapshot(season: string): HistoricalGameSummary[] {
  return getRuntimeSnapshotGames(season)
    .map(historicalSummaryFromGame)
    .sort((a, b) =>
      a.date === b.date
        ? b.gameId.localeCompare(a.gameId)
        : b.date.localeCompare(a.date)
    );
}

function diskHistorySeasons(): string[] {
  if (!existsSync(HISTORY_ROOT)) return [];
  return readdirSync(HISTORY_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "indexes" && d.name !== "players")
    .map((d) => d.name)
    .sort();
}

export function listHistoryProductSeasons(): string[] {
  const seasons = new Set<string>(diskHistorySeasons());
  const meta = runtimeGameSnapshotMeta();
  // Prefer explicit seasons list from the snapshot when present.
  if (meta.gameCount > 0) {
    for (const game of getRuntimeSnapshotGames()) {
      if (game.season) seasons.add(game.season);
    }
  }
  return [...seasons].sort();
}

export function getHistorySeasonManifest(season: string) {
  const disk = readJsonFile<Record<string, unknown>>(
    path.join(HISTORY_ROOT, season, "season-manifest.json")
  );
  if (disk) return disk;
  const games = summariesFromRuntimeSnapshot(season);
  if (!games.length) return null;
  return {
    season,
    historyVersion: HISTORY_VERSION,
    source: "runtime-game-snapshot",
    gameCount: games.length,
    generatedAt: runtimeGameSnapshotMeta().generatedAt,
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
  const diskGames = data?.games ?? [];
  if (diskGames.length > 0) {
    rememberSummary(season, diskGames);
    return diskGames;
  }

  const snapGames = summariesFromRuntimeSnapshot(season);
  rememberSummary(season, snapGames);
  return snapGames;
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
  for (const season of diskHistorySeasons()) {
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

  const teamTokens = (() => {
    if (!teamId) return [] as string[];
    const resolved = resolveCanonicalTeam(teamId);
    const team =
      resolved.status === "resolved"
        ? resolved.team
        : getCanonicalTeamById(teamId) ??
          getCanonicalTeamFromProvider("espn", teamId) ??
          getCanonicalTeamFromProvider("nba", teamId);
    if (!team) return [teamId];
    return [
      team.canonicalTeamId,
      team.providerIds.espn,
      team.providerIds.nba,
    ].filter((v): v is string => Boolean(v));
  })();

  if (teamId) {
    const idx = readJsonFile<Record<string, string[]>>(
      path.join(HISTORY_ROOT, season, "index-by-team.json")
    );
    if (idx) {
      const hit = teamTokens.flatMap((token) => idx[token] ?? []);
      ids = hit.length ? [...new Set(hit)] : [];
    }
  }
  if (playerId) {
    const idx = readJsonFile<Record<string, string[]>>(
      path.join(HISTORY_ROOT, season, "index-by-player.json")
    );
    if (idx) {
      const playerIds = idx?.[playerId] ?? [];
      ids = ids ? ids.filter((id) => playerIds.includes(id)) : playerIds;
    } else if (ids == null) {
      // No player index on edge — cannot filter by player without disk product.
      return [];
    }
  }
  if (date) {
    const idx = readJsonFile<Record<string, string[]>>(
      path.join(HISTORY_ROOT, season, "index-by-date.json")
    );
    if (idx) {
      const dateIds = idx?.[date] ?? [];
      ids = ids ? ids.filter((id) => dateIds.includes(id)) : dateIds;
    }
  }

  let all = getHistoricalGameSummaries(season);

  // When disk indexes are missing, filter the schedule snapshot in memory.
  if (ids == null && (teamId || date)) {
    const teamSet = new Set(teamTokens);
    return all.filter((g) => {
      if (
        teamId &&
        !teamSet.has(g.homeTeamId) &&
        !teamSet.has(g.awayTeamId)
      ) {
        return false;
      }
      if (date && g.date !== date) return false;
      return true;
    });
  }

  if (ids) {
    const set = new Set(ids);
    return all.filter((g) => set.has(g.gameId));
  }
  return all;
}

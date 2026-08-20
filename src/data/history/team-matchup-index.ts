/**
 * Compact team / matchup game loaders from historical product indexes.
 * Never scans raw PBP corpus.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  getHistoricalGameSummaries,
  listHistoryProductSeasons,
} from "@/data/history/product";
import type { HistoricalGameSummary } from "@/data/history/types";
import { HISTORY_VERSION } from "@/lib/history/capabilities";
import {
  getCanonicalTeamById,
  getCanonicalTeamFromProvider,
  resolveCanonicalTeam,
} from "@/data/identity/team-map";
import type { GameSummary } from "@/data/types";

const HISTORY_ROOT = path.join(
  process.cwd(),
  "data",
  "drbl",
  "history",
  HISTORY_VERSION
);
const MATCHUP_INDEX_DIR = path.join(HISTORY_ROOT, "indexes");

export const TEAM_GAMES_PAGE_SIZE = 40;
export const MATCHUP_GAMES_PAGE_SIZE = 40;
export const MATCHUP_SCOPE_LABEL = "Since 1996-97" as const;

export type CompactTeamGameRow = {
  gameId: string;
  season: string;
  date: string;
  homeTeamId: string;
  awayTeamId: string;
  homeCanonicalId: string;
  awayCanonicalId: string;
  homeTricode: string;
  awayTricode: string;
  homeScore: number;
  awayScore: number;
  ot: boolean;
  homeAway: "home" | "away";
  result: "W" | "L" | null;
  seasonType: string;
};

export type CompactMatchupGame = {
  gameId: string;
  season: string;
  date: string;
  homeNbaId: string;
  awayNbaId: string;
  homeCanonicalId: string;
  awayCanonicalId: string;
  homeTricode: string;
  awayTricode: string;
  homeScore: number;
  awayScore: number;
  ot: boolean;
  seasonType: string;
};

export type MatchupSummary = {
  pairKey: string;
  franchiseA: string;
  franchiseB: string;
  scope: typeof MATCHUP_SCOPE_LABEL;
  games: number;
  winsA: number;
  winsB: number;
  playoffGames: number;
  otGames: number;
  seasonFrom: string | null;
  seasonTo: string | null;
};

export type MatchupPageResult = {
  summary: MatchupSummary;
  rows: CompactMatchupGame[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  filter: "ALL" | "Regular Season" | "Playoffs";
};

function readJson<T>(p: string): T | null {
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
}

function nbaIdForCanonical(canonicalTeamId: string): string | null {
  return getCanonicalTeamById(canonicalTeamId)?.providerIds.nba ?? null;
}

function resolveCanonical(token: string): string | null {
  const r = resolveCanonicalTeam(token);
  if (r.status === "resolved") return r.team.canonicalTeamId;
  return getCanonicalTeamFromProvider("nba", token)?.canonicalTeamId ?? null;
}

function canonicalFromNba(nbaId: string): string | null {
  return getCanonicalTeamFromProvider("nba", nbaId)?.canonicalTeamId ?? null;
}

function makePairKey(a: string, b: string): string {
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

function compactFromSummary(
  g: HistoricalGameSummary,
  teamNbaId: string
): CompactTeamGameRow {
  const isHome = g.homeTeamId === teamNbaId;
  const won =
    g.winnerTeamId == null
      ? null
      : g.winnerTeamId === teamNbaId
        ? ("W" as const)
        : ("L" as const);
  return {
    gameId: g.gameId,
    season: g.season,
    date: g.date,
    homeTeamId: g.homeTeamId,
    awayTeamId: g.awayTeamId,
    homeCanonicalId: canonicalFromNba(g.homeTeamId) ?? g.homeTeamId,
    awayCanonicalId: canonicalFromNba(g.awayTeamId) ?? g.awayTeamId,
    homeTricode: g.homeTricode ?? "HOME",
    awayTricode: g.awayTricode ?? "AWAY",
    homeScore: g.homeScore,
    awayScore: g.awayScore,
    ot: g.periodCount > 4,
    homeAway: isHome ? "home" : "away",
    result: won,
    seasonType: g.seasonType ?? "Regular Season",
  };
}

/** True when season has product game indexes (1996-97+ history product). */
export function hasHistoryTeamGameIndex(season: string): boolean {
  return existsSync(path.join(HISTORY_ROOT, season, "index-by-team.json"));
}

/**
 * Compact team game log for one season via index-by-team + game-summaries.
 */
export function getCompactTeamSeasonGames(
  teamToken: string,
  season: string
): CompactTeamGameRow[] {
  const canonical = resolveCanonical(teamToken);
  if (!canonical) return [];
  const nbaId = nbaIdForCanonical(canonical);
  if (!nbaId) return [];

  const idx = readJson<Record<string, string[]>>(
    path.join(HISTORY_ROOT, season, "index-by-team.json")
  );
  const ids = new Set(idx?.[nbaId] ?? []);
  if (!ids.size) return [];

  const summaries = getHistoricalGameSummaries(season);
  return summaries
    .filter((g) => ids.has(g.gameId))
    .map((g) => compactFromSummary(g, nbaId))
    .sort((a, b) =>
      a.date === b.date
        ? b.gameId.localeCompare(a.gameId)
        : b.date.localeCompare(a.date)
    );
}

export function paginateCompactTeamGames(
  rows: CompactTeamGameRow[],
  page: number,
  pageSize = TEAM_GAMES_PAGE_SIZE
) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), pageCount);
  return {
    rows: rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    total: rows.length,
    page: safePage,
    pageSize,
    pageCount,
  };
}

/** Map compact historical rows into GameSummary for existing team UI helpers. */
export function compactRowsToGameSummaries(
  rows: CompactTeamGameRow[]
): GameSummary[] {
  return rows.map((r) => {
    const totalPoints = r.homeScore + r.awayScore;
    const margin = r.homeScore - r.awayScore;
    const gameType = r.seasonType.toLowerCase().includes("playoff")
      ? ("playoff" as const)
      : ("regular" as const);
    return {
      id: r.gameId,
      season: r.season,
      gameDate: r.date,
      homeTeamId: r.homeCanonicalId,
      awayTeamId: r.awayCanonicalId,
      homeTeamAbbr: r.homeTricode,
      awayTeamAbbr: r.awayTricode,
      homeProviderTeamId: r.homeTeamId,
      awayProviderTeamId: r.awayTeamId,
      teamIdProvider: "nba" as const,
      homeScore: r.homeScore,
      awayScore: r.awayScore,
      gameType,
      status: "final" as const,
      totalPoints,
      margin,
      absMargin: Math.abs(margin),
    };
  });
}

export type TeamSeasonGamesPage = {
  rows: CompactTeamGameRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  source: "history_product" | "unavailable";
};

export function getTeamSeasonGamesPage(options: {
  teamToken: string;
  season: string;
  page?: number;
  pageSize?: number;
}): TeamSeasonGamesPage {
  const all = getCompactTeamSeasonGames(options.teamToken, options.season);
  if (!all.length) {
    return {
      rows: [],
      total: 0,
      page: 1,
      pageSize: options.pageSize ?? TEAM_GAMES_PAGE_SIZE,
      pageCount: 1,
      source: "unavailable",
    };
  }
  const paged = paginateCompactTeamGames(
    all,
    options.page ?? 1,
    options.pageSize ?? TEAM_GAMES_PAGE_SIZE
  );
  return { ...paged, source: "history_product" };
}

function filterMatchupGames(
  games: CompactMatchupGame[],
  seasonType: "ALL" | "Regular Season" | "Playoffs"
): CompactMatchupGame[] {
  if (seasonType === "ALL") return games;
  if (seasonType === "Playoffs") {
    return games.filter((g) => g.seasonType.toLowerCase().includes("playoff"));
  }
  return games.filter((g) => !g.seasonType.toLowerCase().includes("playoff"));
}

function summarizeFiltered(
  franchiseA: string,
  franchiseB: string,
  games: CompactMatchupGame[]
): MatchupSummary {
  let winsA = 0;
  let winsB = 0;
  let playoffGames = 0;
  let otGames = 0;
  for (const g of games) {
    if (g.ot) otGames += 1;
    if (g.seasonType.toLowerCase().includes("playoff")) playoffGames += 1;
    const winner =
      g.homeScore > g.awayScore ? g.homeCanonicalId : g.awayCanonicalId;
    if (winner === franchiseA) winsA += 1;
    else if (winner === franchiseB) winsB += 1;
  }
  return {
    pairKey: makePairKey(franchiseA, franchiseB),
    franchiseA,
    franchiseB,
    scope: MATCHUP_SCOPE_LABEL,
    games: games.length,
    winsA,
    winsB,
    playoffGames,
    otGames,
    seasonFrom: games.at(-1)?.season ?? null,
    seasonTo: games[0]?.season ?? null,
  };
}

/**
 * Franchise-vs-franchise matchup page from precomputed pair artifact.
 * Falls back to building from season indexes only if artifact missing.
 */
export function getFranchiseMatchupPage(options: {
  teamA: string;
  teamB: string;
  page?: number;
  seasonType?: "ALL" | "Regular Season" | "Playoffs";
}): MatchupPageResult | null {
  const a = resolveCanonical(options.teamA);
  const b = resolveCanonical(options.teamB);
  if (!a || !b || a === b) return null;

  const key = makePairKey(a, b);
  const filter = options.seasonType ?? "ALL";
  const artifact = readJson<MatchupSummary & { games: CompactMatchupGame[] }>(
    path.join(MATCHUP_INDEX_DIR, "matchups", `${key}.json`)
  );

  let games: CompactMatchupGame[] = artifact?.games ?? [];
  let franchiseA = artifact?.franchiseA ?? (a < b ? a : b);
  let franchiseB = artifact?.franchiseB ?? (a < b ? b : a);

  if (!games.length) {
    // Fallback: intersect season indexes (still no raw PBP). Prefer artifact.
    games = buildMatchupGamesFallback(a, b);
    franchiseA = a < b ? a : b;
    franchiseB = a < b ? b : a;
  }

  const filtered = filterMatchupGames(games, filter);
  const summary = summarizeFiltered(franchiseA, franchiseB, filtered);
  const pageSize = MATCHUP_GAMES_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize) || 1);
  const page = Math.min(Math.max(1, options.page ?? 1), pageCount);
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);

  return {
    summary,
    rows,
    total: filtered.length,
    page,
    pageSize,
    pageCount,
    filter,
  };
}

function buildMatchupGamesFallback(
  a: string,
  b: string
): CompactMatchupGame[] {
  const nbaA = nbaIdForCanonical(a);
  const nbaB = nbaIdForCanonical(b);
  if (!nbaA || !nbaB) return [];
  const seasons = listHistoryProductSeasons().filter((s) => s >= "1996-97");
  const out: CompactMatchupGame[] = [];
  const seen = new Set<string>();
  for (const season of seasons) {
    const idx = readJson<Record<string, string[]>>(
      path.join(HISTORY_ROOT, season, "index-by-team.json")
    );
    if (!idx) continue;
    const setA = new Set(idx[nbaA] ?? []);
    const setB = new Set(idx[nbaB] ?? []);
    const shared = [...setA].filter((id) => setB.has(id));
    if (!shared.length) continue;
    const sharedSet = new Set(shared);
    for (const g of getHistoricalGameSummaries(season)) {
      if (!sharedSet.has(g.gameId) || seen.has(g.gameId)) continue;
      seen.add(g.gameId);
      out.push({
        gameId: g.gameId,
        season: g.season,
        date: g.date,
        homeNbaId: g.homeTeamId,
        awayNbaId: g.awayTeamId,
        homeCanonicalId: canonicalFromNba(g.homeTeamId) ?? g.homeTeamId,
        awayCanonicalId: canonicalFromNba(g.awayTeamId) ?? g.awayTeamId,
        homeTricode: g.homeTricode ?? "HOME",
        awayTricode: g.awayTricode ?? "AWAY",
        homeScore: g.homeScore,
        awayScore: g.awayScore,
        ot: g.periodCount > 4,
        seasonType: g.seasonType ?? "Regular Season",
      });
    }
  }
  return out.sort((x, y) =>
    x.date === y.date
      ? y.gameId.localeCompare(x.gameId)
      : y.date.localeCompare(x.date)
  );
}

export function listMatchupPairSummaries(): MatchupSummary[] {
  const data = readJson<{
    pairs: Record<string, MatchupSummary>;
  }>(path.join(MATCHUP_INDEX_DIR, "matchup-pair-summaries.json"));
  if (!data?.pairs) return [];
  return Object.values(data.pairs).sort((x, y) => y.games - x.games);
}

export function matchupHref(
  teamA: string,
  teamB: string,
  opts?: { page?: number; seasonType?: string }
): string {
  const q = new URLSearchParams();
  if (opts?.page && opts.page > 1) q.set("gamesPage", String(opts.page));
  if (opts?.seasonType && opts.seasonType !== "ALL") {
    q.set("seasonType", opts.seasonType);
  }
  const qs = q.toString();
  return `/teams/${encodeURIComponent(teamA)}/vs/${encodeURIComponent(teamB)}${qs ? `?${qs}` : ""}`;
}

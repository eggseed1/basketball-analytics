/**
 * Compact player-game log helpers (P18C.1 / P18C.1.3).
 * Uses precomputed player-games artifacts — no PBP / raw corpus.
 * Falls back to the live data provider when history has no rows for a season.
 */

import {
  getHistoryPlayerGames,
  getHistorySeasonsForPlayer,
  type HistoryPlayerGame,
} from "@/data/history/player-career";
import { getCanonicalTeamFromProvider } from "@/data/identity/team-map";
import type { PlayerGame } from "@/data/types/player-game";
import { parseBasketballMinutes } from "@/lib/parse-basketball-minutes";
import {
  PLAYER_GAME_LOG_PAGE_SIZE,
  PLAYER_GAME_LOG_SUPPORTED_START,
  efgPct,
  fgPct,
  seasonSupportsGameLogs,
  tsPct,
} from "@/lib/player-page-contract";

export type CompactPlayerGameLogRow = {
  gameId: string;
  season: string;
  date: string;
  teamNbaId: string;
  opponentNbaId: string;
  teamAbbr: string;
  opponentAbbr: string;
  homeAway: "home" | "away";
  result: "W" | "L" | string;
  starter: boolean | null;
  minutes: string | null;
  minutesNum: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fgm: number;
  fga: number;
  threePm: number;
  threePa: number;
  ftm: number;
  fta: number;
  orb: number | null;
  drb: number | null;
  pf: number | null;
  plusMinus: number | null;
  /** Present on deploy-baked CF assets. */
  seasonType?: "regular" | "playoffs" | string;
};

export type PlayerGameLogPage = {
  rows: CompactPlayerGameLogRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  supported: boolean;
};

function parseMinutes(m: string | null): number {
  return parseBasketballMinutes(m);
}

function abbrForNba(nbaId: string): string {
  const team = getCanonicalTeamFromProvider("nba", nbaId);
  return team?.abbr ?? nbaId.slice(-3);
}

function toCompact(r: HistoryPlayerGame): CompactPlayerGameLogRow {
  return {
    gameId: r.gameId,
    season: r.season,
    date: r.date,
    teamNbaId: r.teamId,
    opponentNbaId: r.opponentId,
    teamAbbr: abbrForNba(r.teamId),
    opponentAbbr: abbrForNba(r.opponentId),
    homeAway: r.homeAway === "home" ? "home" : "away",
    result: r.result,
    starter: r.starter,
    minutes: r.minutes,
    minutesNum: parseMinutes(r.minutes),
    points: r.points,
    rebounds: r.rebounds,
    assists: r.assists,
    steals: r.steals,
    blocks: r.blocks,
    turnovers: r.turnovers,
    fgm: r.fgm,
    fga: r.fga,
    threePm: r.threePm,
    threePa: r.threePa,
    ftm: r.ftm,
    fta: r.fta,
    orb: null,
    drb: null,
    pf: null,
    plusMinus: null,
  };
}

export function toCompactFromProviderGame(
  r: PlayerGame
): CompactPlayerGameLogRow {
  const starter =
    r.startPosition != null && String(r.startPosition).trim() !== ""
      ? true
      : r.startPosition === "" || r.startPosition == null
        ? false
        : null;
  return {
    gameId: r.gameId,
    season: r.season,
    date: r.gameDate,
    teamNbaId: r.teamId,
    opponentNbaId: r.opponentTeamId,
    teamAbbr: abbrForNba(r.teamId),
    opponentAbbr: abbrForNba(r.opponentTeamId),
    homeAway: r.isHome ? "home" : "away",
    result: "—",
    starter,
    minutes: r.minutes > 0 ? r.minutes.toFixed(1) : null,
    minutesNum: r.minutes,
    points: r.points,
    rebounds: r.rebounds,
    assists: r.assists,
    steals: r.steals,
    blocks: r.blocks,
    turnovers: r.turnovers,
    fgm: r.fieldGoalsMade,
    fga: r.fieldGoalsAttempted,
    threePm: r.threePointersMade,
    threePa: r.threePointersAttempted,
    ftm: r.freeThrowsMade,
    fta: r.freeThrowsAttempted,
    orb: r.offensiveRebounds ?? null,
    drb: r.defensiveRebounds ?? null,
    pf: r.personalFouls ?? null,
    plusMinus: Number.isFinite(r.plusMinus) ? r.plusMinus : null,
  };
}

export type GameLogFilter =
  | "ALL"
  | "home"
  | "away"
  | "W"
  | "L"
  | "starter"
  | "bench";

function applyGameLogFilter(
  all: CompactPlayerGameLogRow[],
  filter: GameLogFilter | string | undefined
): CompactPlayerGameLogRow[] {
  const f = filter ?? "ALL";
  if (f === "home" || f === "away") {
    return all.filter((r) => r.homeAway === f);
  }
  if (f === "W" || f === "L") {
    return all.filter((r) => r.result === f);
  }
  if (f === "starter") {
    return all.filter((r) => r.starter === true);
  }
  if (f === "bench") {
    return all.filter((r) => r.starter === false);
  }
  return all;
}

function sortNewestFirst(all: CompactPlayerGameLogRow[]) {
  return all
    .slice()
    .sort((a, b) =>
      a.date === b.date
        ? b.gameId.localeCompare(a.gameId)
        : b.date.localeCompare(a.date)
    );
}

/** Sync: history artifact only. */
export function listHistoryCompactGames(
  playerId: string,
  season: string
): CompactPlayerGameLogRow[] {
  if (!seasonSupportsGameLogs(season)) return [];
  return sortNewestFirst(
    getHistoryPlayerGames(playerId, season, { limit: 5000 }).map(toCompact)
  );
}

/**
 * History first; then deploy-baked Static Assets (Cloudflare-safe);
 * finally live ESPN / provider game log.
 */
export async function loadCompactSeasonGames(
  playerId: string,
  season: string
): Promise<CompactPlayerGameLogRow[]> {
  const hist = listHistoryCompactGames(playerId, season);
  if (hist.length > 0) return hist;
  if (!seasonSupportsGameLogs(season)) return [];

  try {
    const { resolvePlayerSeasonGameLog } = await import(
      "@/data/runtime/player-game-logs-store"
    );
    const { resolveNbaIdForDrbl } = await import(
      "@/data/identity/player-identity"
    );
    const nbaId = await resolveNbaIdForDrbl(playerId).catch(() => null);
    const baked = await resolvePlayerSeasonGameLog({
      season,
      playerId,
      nbaId,
    });
    if (baked.length > 0) return baked;
  } catch {
    /* fall through to live */
  }

  // Slim edge only (SLIM_EDGE_PRODUCT=1): skip live ESPN game-log fan-out.
  const { slimEdgeProductEnabled } = await import(
    "@/data/providers/nba/runtime-policy"
  );
  if (slimEdgeProductEnabled()) return [];
  const { getPlayerGameLogCached } = await import(
    "@/data/queries/request-cache"
  );
  const providerGames = await getPlayerGameLogCached(playerId, season);
  return sortNewestFirst(providerGames.map(toCompactFromProviderGame));
}

export function paginateCompactGames(
  allNewestFirst: CompactPlayerGameLogRow[],
  options: {
    page?: number;
    pageSize?: number;
    filter?: GameLogFilter | string;
    supported?: boolean;
  }
): PlayerGameLogPage {
  const pageSize = options.pageSize ?? PLAYER_GAME_LOG_PAGE_SIZE;
  const supported = options.supported ?? true;
  const all = applyGameLogFilter(allNewestFirst, options.filter);
  const pageCount = Math.max(1, Math.ceil(all.length / pageSize) || 1);
  const page = Math.min(Math.max(1, options.page ?? 1), pageCount);
  const rows = all.slice((page - 1) * pageSize, page * pageSize);
  return {
    rows,
    total: all.length,
    page,
    pageSize,
    pageCount,
    supported,
  };
}

export function getCompactPlayerGameLog(options: {
  playerId: string;
  season: string;
  page?: number;
  pageSize?: number;
  filter?: GameLogFilter | string;
}): PlayerGameLogPage {
  const pageSize = options.pageSize ?? PLAYER_GAME_LOG_PAGE_SIZE;
  if (!seasonSupportsGameLogs(options.season)) {
    return {
      rows: [],
      total: 0,
      page: 1,
      pageSize,
      pageCount: 1,
      supported: false,
    };
  }
  const all = listHistoryCompactGames(options.playerId, options.season);
  return paginateCompactGames(all, {
    page: options.page,
    pageSize,
    filter: options.filter,
    supported: true,
  });
}

export async function getCompactPlayerGameLogAsync(options: {
  playerId: string;
  season: string;
  page?: number;
  pageSize?: number;
  filter?: GameLogFilter | string;
}): Promise<PlayerGameLogPage & { allFiltered: CompactPlayerGameLogRow[] }> {
  const pageSize = options.pageSize ?? PLAYER_GAME_LOG_PAGE_SIZE;
  if (!seasonSupportsGameLogs(options.season)) {
    return {
      rows: [],
      total: 0,
      page: 1,
      pageSize,
      pageCount: 1,
      supported: false,
      allFiltered: [],
    };
  }
  const all = await loadCompactSeasonGames(options.playerId, options.season);
  const filtered = applyGameLogFilter(all, options.filter);
  const page = paginateCompactGames(all, {
    page: options.page,
    pageSize,
    filter: options.filter,
    supported: true,
  });
  return { ...page, allFiltered: filtered };
}

export type SplitAggregate = {
  label: string;
  games: number;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fgm: number;
  fga: number;
  threePm: number;
  threePa: number;
  ftm: number;
  fta: number;
};

function emptySplit(label: string): SplitAggregate {
  return {
    label,
    games: 0,
    minutes: 0,
    points: 0,
    rebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    fgm: 0,
    fga: 0,
    threePm: 0,
    threePa: 0,
    ftm: 0,
    fta: 0,
  };
}

function addGame(s: SplitAggregate, g: CompactPlayerGameLogRow) {
  s.games += 1;
  s.minutes += g.minutesNum;
  s.points += g.points;
  s.rebounds += g.rebounds;
  s.assists += g.assists;
  s.steals += g.steals;
  s.blocks += g.blocks;
  s.turnovers += g.turnovers;
  s.fgm += g.fgm;
  s.fga += g.fga;
  s.threePm += g.threePm;
  s.threePa += g.threePa;
  s.ftm += g.ftm;
  s.fta += g.fta;
}

export function computePlayerSeasonSplits(
  playerId: string,
  season: string
): {
  supported: boolean;
  primary: SplitAggregate[];
  byMonth: SplitAggregate[];
  byOpponent: SplitAggregate[];
  seasonBaseline: SplitAggregate;
} {
  if (!seasonSupportsGameLogs(season)) {
    return {
      supported: false,
      primary: [],
      byMonth: [],
      byOpponent: [],
      seasonBaseline: emptySplit("Season"),
    };
  }
  const games = listHistoryCompactGames(playerId, season);
  return splitsFromGames(games);
}

export function splitsFromGames(games: CompactPlayerGameLogRow[]): {
  supported: boolean;
  primary: SplitAggregate[];
  byMonth: SplitAggregate[];
  byOpponent: SplitAggregate[];
  seasonBaseline: SplitAggregate;
} {
  const home = emptySplit("Home");
  const away = emptySplit("Away");
  const wins = emptySplit("Wins");
  const losses = emptySplit("Losses");
  const starter = emptySplit("Starter");
  const bench = emptySplit("Bench");
  const seasonBaseline = emptySplit("Season");
  const months = new Map<string, SplitAggregate>();
  const opps = new Map<string, SplitAggregate>();

  for (const g of games) {
    addGame(seasonBaseline, g);
    if (g.homeAway === "home") addGame(home, g);
    else addGame(away, g);
    if (g.result === "W") addGame(wins, g);
    else if (g.result === "L") addGame(losses, g);
    if (g.starter === true) addGame(starter, g);
    else if (g.starter === false) addGame(bench, g);

    const month = g.date.slice(0, 7);
    if (!months.has(month)) months.set(month, emptySplit(month));
    addGame(months.get(month)!, g);

    if (!opps.has(g.opponentAbbr)) {
      opps.set(g.opponentAbbr, emptySplit(g.opponentAbbr));
    }
    addGame(opps.get(g.opponentAbbr)!, g);
  }

  return {
    supported: true,
    primary: [home, away, wins, losses, starter, bench].filter(
      (s) => s.games > 0
    ),
    byMonth: [...months.values()].sort((a, b) =>
      a.label.localeCompare(b.label)
    ),
    byOpponent: [...opps.values()].sort((a, b) => b.games - a.games),
    seasonBaseline,
  };
}

export async function computePlayerSeasonSplitsAsync(
  playerId: string,
  season: string
) {
  if (!seasonSupportsGameLogs(season)) {
    return {
      supported: false as const,
      primary: [] as SplitAggregate[],
      byMonth: [] as SplitAggregate[],
      byOpponent: [] as SplitAggregate[],
      seasonBaseline: emptySplit("Season"),
    };
  }
  const games = await loadCompactSeasonGames(playerId, season);
  return splitsFromGames(games);
}

export type GameHigh = {
  key: string;
  label: string;
  value: number;
  gameId: string;
  date: string;
  season: string;
  opponentAbbr: string;
  result: string;
  minutesNum: number;
  line: string;
  tied: number;
  tiedGames: Array<{ gameId: string; date: string; season: string }>;
};

function highLine(g: CompactPlayerGameLogRow): string {
  return `${g.points} PTS · ${g.rebounds} REB · ${g.assists} AST`;
}

export function computePlayerGameHighs(
  playerId: string,
  opts?: { sinceSeason?: string; extraGames?: CompactPlayerGameLogRow[] }
): GameHigh[] {
  const since = opts?.sinceSeason ?? PLAYER_GAME_LOG_SUPPORTED_START;
  const seasons = getHistorySeasonsForPlayer(playerId)
    .map((s) => s.season)
    .filter((s) => s >= since);
  const cats: Array<{
    key: keyof CompactPlayerGameLogRow;
    label: string;
  }> = [
    { key: "points", label: "PTS" },
    { key: "rebounds", label: "REB" },
    { key: "assists", label: "AST" },
    { key: "steals", label: "STL" },
    { key: "blocks", label: "BLK" },
    { key: "threePm", label: "3PM" },
    { key: "fgm", label: "FGM" },
    { key: "ftm", label: "FTM" },
    { key: "minutesNum", label: "MIN" },
  ];

  const best = new Map<
    string,
    { value: number; games: CompactPlayerGameLogRow[] }
  >();

  const ingest = (games: CompactPlayerGameLogRow[]) => {
    for (const g of games) {
      for (const cat of cats) {
        const v = g[cat.key];
        if (typeof v !== "number" || !Number.isFinite(v)) continue;
        const cur = best.get(cat.key);
        if (!cur || v > cur.value) {
          best.set(cat.key, { value: v, games: [g] });
        } else if (v === cur.value) {
          cur.games.push(g);
        }
      }
    }
  };

  for (const season of seasons) {
    ingest(listHistoryCompactGames(playerId, season));
  }
  if (opts?.extraGames?.length) ingest(opts.extraGames);

  return cats
    .map((cat) => {
      const hit = best.get(cat.key);
      if (!hit || !hit.games.length) return null;
      const sorted = hit.games
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date));
      const top = sorted[0]!;
      const row: GameHigh = {
        key: cat.key,
        label: cat.label,
        value: hit.value,
        gameId: top.gameId,
        date: top.date,
        season: top.season,
        opponentAbbr: top.opponentAbbr,
        result: top.result,
        minutesNum: top.minutesNum,
        line: highLine(top),
        tied: hit.games.length - 1,
        tiedGames: sorted.slice(0, 8).map((g) => ({
          gameId: g.gameId,
          date: g.date,
          season: g.season,
        })),
      };
      return row;
    })
    .filter((x): x is GameHigh => x != null);
}

export async function computePlayerGameHighsAsync(
  playerId: string,
  selectedSeason: string
): Promise<GameHigh[]> {
  const extra = await loadCompactSeasonGames(playerId, selectedSeason);
  return computePlayerGameHighs(playerId, { extraGames: extra });
}

export function shootingFromGames(games: CompactPlayerGameLogRow[]) {
  const totals = emptySplit("Season");
  for (const g of games) addGame(totals, g);
  return {
    ...totals,
    fgPct: fgPct(totals.fgm, totals.fga),
    threePct: fgPct(totals.threePm, totals.threePa),
    ftPct: fgPct(totals.ftm, totals.fta),
    efg: efgPct(totals.fgm, totals.fga, totals.threePm),
    ts: tsPct(totals.points, totals.fga, totals.fta),
    twoPm: totals.fgm - totals.threePm,
    twoPa: totals.fga - totals.threePa,
  };
}

export function sumGameLogBox(games: CompactPlayerGameLogRow[]) {
  const t = emptySplit("sum");
  for (const g of games) addGame(t, g);
  return t;
}

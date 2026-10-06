/**
 * Savant-style game preview: team season profiles, rotation averages with
 * league percentiles, and recent head-to-head results for both sides.
 *
 * Uses the game's own season once both teams have a real sample; before that
 * it falls back to the prior regular season and says so.
 */

import type { Game } from "@/data/types";
import type { PlayerSeason } from "@/data/types/player-season";
import type { TeamSeasonStats } from "@/data/types/team-season";
import type { StandingRow } from "@/data/types/standings";
import { getFilteredPlayerSeasonsCached } from "@/data/queries/request-cache";
import { getTeamSeasonBoard } from "@/data/queries/team-seasons";
import { canonicalSeasonFromStartYear } from "@/data/providers/historical/season-range";
import {
  bundledCurrentRosterMeta,
  bundledRosterPlayerIds,
  getBundledCurrentRosterEntry,
} from "@/data/runtime/current-roster-snapshot";
import { getRuntimeSnapshotGames } from "@/data/runtime/game-snapshot";
import { getRuntimeStandings } from "@/data/runtime/standings-snapshot";
import { gameSideBrandKey } from "@/lib/game-team-identity";
import { resolveTeamBrand } from "@/lib/nba-brand";

/** Both teams need this many games before the game's own season is used. */
export const PREVIEW_MIN_TEAM_GAMES = 10;
/** Percentile peers: enough games and minutes that per-game rates mean something. */
export const PREVIEW_PEER_MIN_GAMES = 20;
export const PREVIEW_PEER_MIN_MPG = 15;
const ROTATION_LIMIT = 15;

export type PreviewSide = "away" | "home";

export type PreviewTeamRow = {
  id: string;
  label: string;
  format: "num1" | "pct1" | "signed1" | "num2";
  higherIsBetter: boolean;
  away: number | null;
  home: number | null;
  awayRank: number | null;
  homeRank: number | null;
};

export type PreviewTeam = {
  abbr: string;
  name: string;
  brandKey: string;
  record: string | null;
  gamesPlayed: number | null;
};

export type PreviewPlayerStat = {
  value: number | null;
  /** 0-100, direction-adjusted (100 = best). Null when the value is missing. */
  pct: number | null;
};

export type PreviewPlayer = {
  id: string;
  name: string;
  pos: string | null;
  /** Team the stats were posted for, when it differs from the current side. */
  statTeam: string | null;
  games: number;
  mpg: number;
  qualified: boolean;
  stats: Record<PreviewPlayerStatId, PreviewPlayerStat>;
};

export type PreviewPlayerStatId =
  | "ppg"
  | "rpg"
  | "apg"
  | "spg"
  | "bpg"
  | "tov"
  | "ts"
  | "fg3"
  | "usg"
  | "bpm"
  | "darko";

export type PreviewMeeting = {
  id: string;
  date: string;
  gameType: Game["gameType"];
  awayAbbr: string;
  homeAbbr: string;
  awayScore: number;
  homeScore: number;
};

export type GamePreviewData = {
  statsSeason: string;
  gameSeason: string;
  usesPriorSeason: boolean;
  /** Current roster joined to prior-season stats (offseason / early season). */
  rosterIsCurrent: boolean;
  teams: Record<PreviewSide, PreviewTeam>;
  teamRows: PreviewTeamRow[];
  players: Record<PreviewSide, PreviewPlayer[]>;
  /** Rostered players with no stats row for the stats season. */
  noStats: Record<PreviewSide, string[]>;
  meetings: PreviewMeeting[];
  peerCount: number;
};

const STAT_DEFS: Array<{
  id: PreviewPlayerStatId;
  higherIsBetter: boolean;
  read: (p: PlayerSeason) => number | null;
}> = [
  { id: "ppg", higherIsBetter: true, read: (p) => perGame(p, p.points) },
  { id: "rpg", higherIsBetter: true, read: (p) => perGame(p, p.rebounds) },
  { id: "apg", higherIsBetter: true, read: (p) => perGame(p, p.assists) },
  { id: "spg", higherIsBetter: true, read: (p) => perGame(p, p.steals) },
  { id: "bpg", higherIsBetter: true, read: (p) => perGame(p, p.blocks) },
  { id: "tov", higherIsBetter: false, read: (p) => perGame(p, p.turnovers) },
  { id: "ts", higherIsBetter: true, read: (p) => finite(p.trueShootingPct) },
  {
    id: "fg3",
    higherIsBetter: true,
    read: (p) => (p.threePointersAttempted > 0 ? finite(p.threePointPct) : null),
  },
  { id: "usg", higherIsBetter: true, read: (p) => finite(p.usagePct) },
  { id: "bpm", higherIsBetter: true, read: (p) => finite(p.bpm) },
  {
    id: "darko",
    higherIsBetter: true,
    read: (p) => finite((p as PlayerSeason & { darkoDpm?: number }).darkoDpm),
  },
];

function finite(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function perGame(p: PlayerSeason, total: number): number | null {
  return p.gamesPlayed > 0 && Number.isFinite(total) ? total / p.gamesPlayed : null;
}

function priorSeason(season: string): string | null {
  const start = Number(season.slice(0, 4));
  return Number.isFinite(start) ? canonicalSeasonFromStartYear(start - 1) : null;
}

function espnTeamKey(game: Game, side: PreviewSide): string {
  const abbr = side === "away" ? game.awayTeamAbbr : game.homeTeamAbbr;
  const id = side === "away" ? game.awayTeamId : game.homeTeamId;
  return resolveTeamBrand(abbr ?? id)?.espnTeamId ?? id;
}

function matchBoardRow(
  board: TeamSeasonStats[],
  espnId: string,
  abbr: string | undefined
): TeamSeasonStats | null {
  return (
    board.find((r) => r.teamId === espnId) ??
    (abbr ? board.find((r) => r.abbreviation === abbr) : undefined) ??
    null
  );
}

function standingFor(
  season: string,
  espnId: string,
  abbr: string | undefined
): StandingRow | null {
  const rows = getRuntimeStandings(season)?.conferences.flatMap((c) => c.rows) ?? [];
  return (
    rows.find((r) => r.teamId === espnId) ??
    (abbr ? rows.find((r) => r.abbreviation === abbr) : undefined) ??
    null
  );
}

const TEAM_ROW_DEFS: Array<{
  id: string;
  label: string;
  format: PreviewTeamRow["format"];
  higherIsBetter: boolean;
  read: (r: TeamSeasonStats) => number | null;
}> = [
  { id: "diff", label: "Point diff", format: "signed1", higherIsBetter: true, read: (r) => finite(r.avgDiff) },
  { id: "ppg", label: "Points", format: "num1", higherIsBetter: true, read: (r) => finite(r.ppg) },
  { id: "opp", label: "Opp points", format: "num1", higherIsBetter: false, read: (r) => finite(r.oppPpg) },
  { id: "ts", label: "True shooting", format: "pct1", higherIsBetter: true, read: (r) => finite(r.trueShootingPct) },
  { id: "fg", label: "Field goal %", format: "pct1", higherIsBetter: true, read: (r) => finite(r.fieldGoalPct) },
  { id: "fg3", label: "3-point %", format: "pct1", higherIsBetter: true, read: (r) => finite(r.threePointPct) },
  {
    id: "fg3a",
    label: "3PA per game",
    format: "num1",
    higherIsBetter: true,
    read: (r) => (r.gamesPlayed > 0 ? r.threePointersAttempted / r.gamesPlayed : null),
  },
  { id: "ft", label: "Free throw %", format: "pct1", higherIsBetter: true, read: (r) => finite(r.freeThrowPct) },
  { id: "reb", label: "Rebounds", format: "num1", higherIsBetter: true, read: (r) => finite(r.rpg) },
  { id: "orb", label: "Off. rebound %", format: "pct1", higherIsBetter: true, read: (r) => finite(r.offensiveReboundPct) },
  { id: "ast", label: "Assists", format: "num1", higherIsBetter: true, read: (r) => finite(r.apg) },
  { id: "tov", label: "Turnovers", format: "num1", higherIsBetter: false, read: (r) => finite(r.topg) },
  { id: "asttov", label: "AST/TO", format: "num2", higherIsBetter: true, read: (r) => finite(r.assistToTurnover) },
  { id: "stl", label: "Steals", format: "num1", higherIsBetter: true, read: (r) => finite(r.spg) },
  { id: "blk", label: "Blocks", format: "num1", higherIsBetter: true, read: (r) => finite(r.bpg) },
];

/** League rank, 1 = best. Ties share the better rank. */
function rankOf(
  value: number | null,
  all: number[],
  higherIsBetter: boolean
): number | null {
  if (value == null) return null;
  const better = all.filter((v) => (higherIsBetter ? v > value : v < value)).length;
  return better + 1;
}

/** Share of peers this value beats or ties, direction-adjusted, 0-100. */
function percentileOf(
  value: number | null,
  sorted: number[],
  higherIsBetter: boolean
): number | null {
  if (value == null || sorted.length === 0) return null;
  let below = 0;
  let equal = 0;
  for (const v of sorted) {
    if (v < value) below += 1;
    else if (v === value) equal += 1;
  }
  const share = (below + equal / 2) / sorted.length;
  const pct = higherIsBetter ? share : 1 - share;
  return Math.max(0, Math.min(100, Math.round(pct * 100)));
}

function buildPlayers(
  rows: PlayerSeason[],
  sideAbbr: string,
  peerSorted: Map<PreviewPlayerStatId, number[]>
): PreviewPlayer[] {
  return [...rows]
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, ROTATION_LIMIT)
    .map((p) => {
      const stats = {} as PreviewPlayer["stats"];
      for (const def of STAT_DEFS) {
        const value = def.read(p);
        stats[def.id] = {
          value,
          pct: percentileOf(value, peerSorted.get(def.id) ?? [], def.higherIsBetter),
        };
      }
      const mpg = p.gamesPlayed > 0 ? p.minutes / p.gamesPlayed : 0;
      const team = p.teamAbbreviation ?? null;
      return {
        id: p.playerId,
        name: p.playerName,
        pos: p.position ?? null,
        statTeam: team && team !== sideAbbr ? team : null,
        games: p.gamesPlayed,
        mpg,
        qualified: p.gamesPlayed >= PREVIEW_PEER_MIN_GAMES && mpg >= PREVIEW_PEER_MIN_MPG,
        stats,
      };
    });
}

function meetingsBetween(
  game: Game,
  seasons: string[],
  sides: Record<string, string>
): PreviewMeeting[] {
  const seen = new Set<string>();
  const out: PreviewMeeting[] = [];
  for (const season of seasons) {
    for (const g of getRuntimeSnapshotGames(season)) {
      if (g.id === game.id || seen.has(g.id)) continue;
      if (g.status !== "final" || g.gameType === "preseason") continue;
      const a = sides[espnTeamKey(g, "away")];
      const h = sides[espnTeamKey(g, "home")];
      if (!a || !h || a === h) continue;
      if (typeof g.awayScore !== "number" || typeof g.homeScore !== "number") continue;
      if (game.gameDate && g.gameDate && g.gameDate >= game.gameDate) continue;
      seen.add(g.id);
      out.push({
        id: g.id,
        date: g.gameDate,
        gameType: g.gameType,
        awayAbbr: a,
        homeAbbr: h,
        awayScore: g.awayScore,
        homeScore: g.homeScore,
      });
    }
  }
  return out.sort((x, y) => y.date.localeCompare(x.date)).slice(0, 5);
}

export async function getGamePreview(game: Game): Promise<GamePreviewData | null> {
  const gameSeason = game.season;
  const prior = priorSeason(gameSeason);
  const awayEspn = espnTeamKey(game, "away");
  const homeEspn = espnTeamKey(game, "home");
  const awayAbbr = game.awayTeamAbbr ?? awayEspn;
  const homeAbbr = game.homeTeamAbbr ?? homeEspn;

  const current = await getTeamSeasonBoard(gameSeason).catch(() => null);
  const currentRows = current?.status === "ok" ? current.rows : [];
  const curAway = matchBoardRow(currentRows, awayEspn, game.awayTeamAbbr);
  const curHome = matchBoardRow(currentRows, homeEspn, game.homeTeamAbbr);
  const currentReady =
    (curAway?.gamesPlayed ?? 0) >= PREVIEW_MIN_TEAM_GAMES &&
    (curHome?.gamesPlayed ?? 0) >= PREVIEW_MIN_TEAM_GAMES;

  const usesPriorSeason = !currentReady && prior != null;
  const statsSeason = usesPriorSeason ? prior! : gameSeason;
  const board = usesPriorSeason
    ? await getTeamSeasonBoard(statsSeason)
        .then((b) => (b.status === "ok" ? b.rows : []))
        .catch(() => [] as TeamSeasonStats[])
    : currentRows;

  const pool = await getFilteredPlayerSeasonsCached(statsSeason, 1);
  if (!board.length && !pool.length) return null;

  const awayRow = matchBoardRow(board, awayEspn, game.awayTeamAbbr);
  const homeRow = matchBoardRow(board, homeEspn, game.homeTeamAbbr);

  const teamRows: PreviewTeamRow[] = TEAM_ROW_DEFS.map((def) => {
    const all = board.map(def.read).filter((v): v is number => v != null);
    const away = awayRow ? def.read(awayRow) : null;
    const home = homeRow ? def.read(homeRow) : null;
    return {
      id: def.id,
      label: def.label,
      format: def.format,
      higherIsBetter: def.higherIsBetter,
      away,
      home,
      awayRank: rankOf(away, all, def.higherIsBetter),
      homeRank: rankOf(home, all, def.higherIsBetter),
    };
  }).filter((r) => r.away != null || r.home != null);

  const teamFor = (side: PreviewSide): PreviewTeam => {
    const espn = side === "away" ? awayEspn : homeEspn;
    const abbr = side === "away" ? awayAbbr : homeAbbr;
    const row = side === "away" ? awayRow : homeRow;
    const standing = standingFor(statsSeason, espn, abbr);
    return {
      abbr,
      name: (side === "away" ? game.awayTeamName : game.homeTeamName) ?? row?.fullName ?? abbr,
      brandKey: gameSideBrandKey(game, side),
      record: standing ? `${standing.wins}-${standing.losses}` : null,
      gamesPlayed: row?.gamesPlayed ?? null,
    };
  };

  const peers = pool.filter(
    (p) =>
      p.gamesPlayed >= PREVIEW_PEER_MIN_GAMES &&
      p.minutes / p.gamesPlayed >= PREVIEW_PEER_MIN_MPG
  );
  const peerSorted = new Map<PreviewPlayerStatId, number[]>();
  for (const def of STAT_DEFS) {
    peerSorted.set(
      def.id,
      peers.map(def.read).filter((v): v is number => v != null)
    );
  }

  const byId = new Map<string, PlayerSeason>();
  for (const p of pool) {
    const prev = byId.get(p.playerId);
    if (!prev || p.minutes > prev.minutes) byId.set(p.playerId, p);
  }

  const rosterIsCurrent =
    usesPriorSeason && bundledCurrentRosterMeta().season === gameSeason;
  const sideRows = (side: PreviewSide) => {
    const espn = side === "away" ? awayEspn : homeEspn;
    const abbr = side === "away" ? awayAbbr : homeAbbr;
    if (!rosterIsCurrent) {
      return {
        rows: pool.filter((p) => p.teamId === espn || p.teamAbbreviation === abbr),
        missing: [] as string[],
      };
    }
    const rows: PlayerSeason[] = [];
    const missing: string[] = [];
    for (const id of bundledRosterPlayerIds(espn)) {
      const hit = byId.get(id);
      if (hit) rows.push(hit);
      else {
        const name = getBundledCurrentRosterEntry(id)?.name;
        if (name) missing.push(name);
      }
    }
    return { rows, missing };
  };

  const away = sideRows("away");
  const home = sideRows("home");

  return {
    statsSeason,
    gameSeason,
    usesPriorSeason,
    rosterIsCurrent,
    teams: { away: teamFor("away"), home: teamFor("home") },
    teamRows,
    players: {
      away: buildPlayers(away.rows, awayAbbr, peerSorted),
      home: buildPlayers(home.rows, homeAbbr, peerSorted),
    },
    noStats: { away: away.missing, home: home.missing },
    meetings: meetingsBetween(
      game,
      usesPriorSeason ? [gameSeason, statsSeason] : [gameSeason, prior ?? gameSeason],
      { [awayEspn]: awayAbbr, [homeEspn]: homeAbbr }
    ),
    peerCount: peers.length,
  };
}

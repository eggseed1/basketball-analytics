/**
 * Box-score Level-2 context - deterministic, season-aware, no PBP.
 *
 * Primary lens: player-self vs season average (when a season board row exists).
 * Secondary: in-game rank / percentile among players who played (minutes > 0).
 * Optional: percentile among this player's own games when a game-log pool is passed.
 *
 * Missing data stays missing. See docs notes in methodology constants.
 */

import { buildStatContext } from "@/analytics/context";
import type { StatContext } from "@/analytics/types";
import type { PlayerGame, PlayerSeason } from "@/data/types";
import type { TeamSeasonStats } from "@/data/types/team-season";
import { formatNumber, formatOrdinal, formatPct } from "@/lib/format";

/** Season board row must have at least this many GP for vs-average lines. */
export const BOX_SCORE_MIN_SEASON_GAMES = 5;
/** Need this many players with minutes > 0 to report in-game percentiles. */
export const BOX_SCORE_MIN_IN_GAME_POOL = 5;
/** Need this many qualifying log games for player-self game percentiles. */
export const BOX_SCORE_MIN_SELF_GAMES = 8;
/** Game-log rows count toward self-percentile only with this many minutes. */
export const BOX_SCORE_MIN_LOG_MINUTES = 5;

export type BoxScoreStatId =
  | "points"
  | "rebounds"
  | "assists"
  | "minutes"
  | "trueShootingPct"
  | "plusMinus";

export type BoxScoreStatLine = {
  id: BoxScoreStatId;
  label: string;
  gameDisplay: string;
  gameValue: number;
  seasonAvg?: number;
  seasonAvgDisplay?: string;
  vsSeason?: number;
  vsSeasonDisplay?: string;
  /** Among this player's qualifying games (when log pool provided). */
  playerGamePercentile?: number;
  playerGameSampleSize?: number;
  /** 1 = highest among players who played in this game. */
  inGameRank?: number;
  inGamePoolSize?: number;
  inGamePercentile?: number;
  context: StatContext;
};

export type BoxScorePlayerContext = {
  playerId: string;
  playerName: string;
  season: string;
  gameId: string;
  teamId: string;
  lines: BoxScoreStatLine[];
  playerHref: string;
  /** Present when no contextual lines could be built. */
  limitedReason?: string;
};

export type BoxScoreTeamContext = {
  teamId: string;
  season: string;
  points: number;
  pointsDisplay: string;
  seasonPpg?: number;
  seasonPpgDisplay?: string;
  vsSeason?: number;
  vsSeasonDisplay?: string;
  context: StatContext;
};

export type BoxScoreGameContextIndex = {
  season: string;
  gameId: string;
  /** playerId → context (plain object for RSC → client serialization). */
  byPlayerId: Record<string, BoxScorePlayerContext>;
  teams: BoxScoreTeamContext[];
};

function percentileOf(value: number, pool: number[]): number {
  if (!pool.length || !Number.isFinite(value)) return 50;
  const below = pool.filter((v) => v < value).length;
  return (below / pool.length) * 100;
}

function rankDescending(value: number, pool: number[]): number {
  const better = pool.filter((v) => v > value).length;
  return better + 1;
}

function signedDelta(d: number, digits = 1): string {
  const sign = d > 0 ? "+" : "";
  return `${sign}${formatNumber(d, digits)}`;
}

function perGame(total: number, gp: number): number {
  return total / Math.max(1, gp);
}

type StatDef = {
  id: BoxScoreStatId;
  label: string;
  pickGame: (g: PlayerGame) => number | null;
  pickSeasonAvg: (s: PlayerSeason) => number | null;
  formatGame: (v: number) => string;
  formatAvg: (v: number) => string;
  formatDelta: (d: number) => string;
  unit?: StatContext["unit"];
  digits?: number;
};

const STAT_DEFS: StatDef[] = [
  {
    id: "points",
    label: "Points",
    pickGame: (g) => g.points,
    pickSeasonAvg: (s) => perGame(s.points, s.gamesPlayed),
    formatGame: (v) => formatNumber(v, 0),
    formatAvg: (v) => `${formatNumber(v, 1)} PPG`,
    formatDelta: (d) => signedDelta(d, 1),
  },
  {
    id: "rebounds",
    label: "Rebounds",
    pickGame: (g) => g.rebounds,
    pickSeasonAvg: (s) => perGame(s.rebounds, s.gamesPlayed),
    formatGame: (v) => formatNumber(v, 0),
    formatAvg: (v) => `${formatNumber(v, 1)} RPG`,
    formatDelta: (d) => signedDelta(d, 1),
  },
  {
    id: "assists",
    label: "Assists",
    pickGame: (g) => g.assists,
    pickSeasonAvg: (s) => perGame(s.assists, s.gamesPlayed),
    formatGame: (v) => formatNumber(v, 0),
    formatAvg: (v) => `${formatNumber(v, 1)} APG`,
    formatDelta: (d) => signedDelta(d, 1),
  },
  {
    id: "minutes",
    label: "Minutes",
    pickGame: (g) => (g.minutes > 0 ? g.minutes : null),
    pickSeasonAvg: (s) => perGame(s.minutes, s.gamesPlayed),
    formatGame: (v) => formatNumber(v, 0),
    formatAvg: (v) => `${formatNumber(v, 1)} MPG`,
    formatDelta: (d) => signedDelta(d, 1),
  },
  {
    id: "trueShootingPct",
    label: "True shooting",
    pickGame: (g) =>
      g.trueShootingPct != null && g.trueShootingPct > 0
        ? g.trueShootingPct
        : null,
    pickSeasonAvg: (s) =>
      s.trueShootingPct != null && s.trueShootingPct > 0
        ? s.trueShootingPct
        : null,
    formatGame: (v) => formatPct(v),
    formatAvg: (v) => formatPct(v),
    formatDelta: (d) => {
      const pts = d * 100;
      const sign = pts > 0 ? "+" : "";
      return `${sign}${pts.toFixed(1)} pts`;
    },
    unit: "pct",
  },
  {
    id: "plusMinus",
    label: "Plus/minus",
    pickGame: (g) => g.plusMinus,
    pickSeasonAvg: () => null, // not on PlayerSeason
    formatGame: (v) => `${v > 0 ? "+" : ""}${formatNumber(v, 0)}`,
    formatAvg: (v) => formatNumber(v, 1),
    formatDelta: (d) => signedDelta(d, 0),
  },
];

function buildLine(options: {
  def: StatDef;
  player: PlayerGame;
  gameValue: number;
  seasonRow: PlayerSeason | null | undefined;
  inGamePool: number[];
  selfPool: number[] | null;
}): BoxScoreStatLine | null {
  const { def, player, gameValue, seasonRow, inGamePool, selfPool } = options;
  if (!Number.isFinite(gameValue)) return null;

  const line: BoxScoreStatLine = {
    id: def.id,
    label: def.label,
    gameDisplay: def.formatGame(gameValue),
    gameValue,
    context: buildStatContext({
      display: def.formatGame(gameValue),
      value: gameValue,
      unit: def.unit,
      timeframe: player.season,
      sourceLabel: def.label,
    }),
  };

  if (
    seasonRow &&
    seasonRow.season === player.season &&
    seasonRow.gamesPlayed >= BOX_SCORE_MIN_SEASON_GAMES
  ) {
    const avg = def.pickSeasonAvg(seasonRow);
    if (avg != null && Number.isFinite(avg)) {
      const delta = gameValue - avg;
      line.seasonAvg = avg;
      line.seasonAvgDisplay = def.formatAvg(avg);
      line.vsSeason = delta;
      line.vsSeasonDisplay = def.formatDelta(delta);
      line.context = buildStatContext({
        display: def.formatGame(gameValue),
        value: gameValue,
        unit: def.unit,
        vsPrior: delta,
        population: "career_self",
        populationLabel: "vs this player's season average",
        sampleSize: seasonRow.gamesPlayed,
        timeframe: player.season,
        sourceLabel: def.label,
      });
    }
  }

  if (inGamePool.length >= BOX_SCORE_MIN_IN_GAME_POOL) {
    line.inGameRank = rankDescending(gameValue, inGamePool);
    line.inGamePoolSize = inGamePool.length;
    line.inGamePercentile = percentileOf(gameValue, inGamePool);
  }

  if (selfPool && selfPool.length >= BOX_SCORE_MIN_SELF_GAMES) {
    line.playerGamePercentile = percentileOf(gameValue, selfPool);
    line.playerGameSampleSize = selfPool.length;
    line.context = buildStatContext({
      ...line.context,
      percentile: line.playerGamePercentile,
      population: "career_self",
      populationLabel: "this player's qualifying games this season",
      sampleSize: selfPool.length,
      timeframe: player.season,
    });
  }

  return line;
}

/**
 * Context for one box-score row.
 * Pure - no network. Pass season board row / optional log for richer lines.
 */
export function buildBoxScorePlayerContext(options: {
  player: PlayerGame;
  /** All box players in the game (both teams) for in-game ranks. */
  gamePlayers: PlayerGame[];
  seasonRow?: PlayerSeason | null;
  /** Same-season game log for this player (optional; enables self percentiles). */
  playerGameLog?: PlayerGame[];
}): BoxScorePlayerContext {
  const { player, gamePlayers, seasonRow, playerGameLog } = options;
  const played = gamePlayers.filter((p) => p.minutes > 0);
  const lines: BoxScoreStatLine[] = [];

  for (const def of STAT_DEFS) {
    const gameValue = def.pickGame(player);
    if (gameValue == null) continue;

    const inGamePool = played
      .map((p) => def.pickGame(p))
      .filter((v): v is number => v != null && Number.isFinite(v));

    let selfPool: number[] | null = null;
    if (playerGameLog?.length) {
      const sameSeason = playerGameLog.filter(
        (g) =>
          g.season === player.season &&
          g.minutes >= BOX_SCORE_MIN_LOG_MINUTES
      );
      const values = sameSeason
        .map((g) => def.pickGame(g))
        .filter((v): v is number => v != null && Number.isFinite(v));
      if (values.length >= BOX_SCORE_MIN_SELF_GAMES) selfPool = values;
    }

    // Season mismatch → ignore board row
    const row =
      seasonRow && seasonRow.season === player.season ? seasonRow : null;

    const line = buildLine({
      def,
      player,
      gameValue,
      seasonRow: row,
      inGamePool,
      selfPool,
    });
    if (line) lines.push(line);
  }

  const hasSeason =
    seasonRow != null &&
    seasonRow.season === player.season &&
    seasonRow.gamesPlayed >= BOX_SCORE_MIN_SEASON_GAMES;

  let limitedReason: string | undefined;
  if (!lines.length) {
    limitedReason = "No contextual stats available for this row.";
  } else if (!hasSeason && !playerGameLog?.length) {
    limitedReason = `Season average needs ≥${BOX_SCORE_MIN_SEASON_GAMES} GP on the season board.`;
  }

  return {
    playerId: player.playerId,
    playerName: player.playerName ?? player.playerId,
    season: player.season,
    gameId: player.gameId,
    teamId: player.teamId,
    lines,
    playerHref: `/players/${player.playerId}?season=${encodeURIComponent(player.season)}`,
    limitedReason,
  };
}

export function buildBoxScoreTeamContext(options: {
  teamId: string;
  season: string;
  /** Team's points in this game. */
  points: number;
  seasonTeam?: TeamSeasonStats | null;
}): BoxScoreTeamContext {
  const { teamId, season, points, seasonTeam } = options;
  const ctx: BoxScoreTeamContext = {
    teamId,
    season,
    points,
    pointsDisplay: formatNumber(points, 0),
    context: buildStatContext({
      display: formatNumber(points, 0),
      value: points,
      timeframe: season,
      sourceLabel: "Team points",
    }),
  };

  if (
    seasonTeam &&
    seasonTeam.season === season &&
    seasonTeam.gamesPlayed >= BOX_SCORE_MIN_SEASON_GAMES &&
    seasonTeam.ppg > 0
  ) {
    const delta = points - seasonTeam.ppg;
    ctx.seasonPpg = seasonTeam.ppg;
    ctx.seasonPpgDisplay = `${formatNumber(seasonTeam.ppg, 1)} PPG`;
    ctx.vsSeason = delta;
    ctx.vsSeasonDisplay = signedDelta(delta, 1);
    ctx.context = buildStatContext({
      display: formatNumber(points, 0),
      value: points,
      vsPrior: delta,
      population: "custom",
      populationLabel: "vs this team's season average",
      sampleSize: seasonTeam.gamesPlayed,
      timeframe: season,
      sourceLabel: "Team points",
    });
  }

  return ctx;
}

/**
 * Build context for every box-score player (+ optional team scoring context).
 * One season board map + optional per-player logs - no fabricated values.
 */
export function buildBoxScoreGameContext(options: {
  gameId: string;
  season: string;
  players: PlayerGame[];
  /** playerId → season board row for the game's season. */
  seasonByPlayerId?: Map<string, PlayerSeason>;
  /** Optional playerId → same-season game log. Prefer omitting on SSR to avoid N+1. */
  logsByPlayerId?: Map<string, PlayerGame[]>;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  homeSeasonTeam?: TeamSeasonStats | null;
  awaySeasonTeam?: TeamSeasonStats | null;
}): BoxScoreGameContextIndex {
  const {
    gameId,
    season,
    players,
    seasonByPlayerId,
    logsByPlayerId,
    homeTeamId,
    awayTeamId,
    homeScore,
    awayScore,
    homeSeasonTeam,
    awaySeasonTeam,
  } = options;

  const byPlayerId: Record<string, BoxScorePlayerContext> = {};
  for (const player of players) {
    // Enforce season identity - skip attaching wrong-season averages.
    const seasonRow = seasonByPlayerId?.get(player.playerId);
    const safeRow =
      seasonRow && seasonRow.season === season ? seasonRow : null;
    const log = logsByPlayerId?.get(player.playerId);
    byPlayerId[player.playerId] = buildBoxScorePlayerContext({
      player: { ...player, season: player.season || season, gameId },
      gamePlayers: players,
      seasonRow: safeRow,
      playerGameLog: log,
    });
  }

  const teams = [
    buildBoxScoreTeamContext({
      teamId: awayTeamId,
      season,
      points: awayScore,
      seasonTeam:
        awaySeasonTeam && awaySeasonTeam.season === season
          ? awaySeasonTeam
          : null,
    }),
    buildBoxScoreTeamContext({
      teamId: homeTeamId,
      season,
      points: homeScore,
      seasonTeam:
        homeSeasonTeam && homeSeasonTeam.season === season
          ? homeSeasonTeam
          : null,
    }),
  ];

  return { season, gameId, byPlayerId, teams };
}

export function formatBoxScorePercentile(p: number): string {
  return `${formatOrdinal(Math.round(p))} pct`;
}

/** Primary line for compact disclosure - prefer PTS, else first line. */
export function primaryBoxScoreLine(
  ctx: BoxScorePlayerContext
): BoxScoreStatLine | null {
  return ctx.lines.find((l) => l.id === "points") ?? ctx.lines[0] ?? null;
}

/**
 * Game Lab v1 — deterministic game-level analysis from box score + season boards.
 *
 * No PBP, possessions, lineups, shot maps, win probability, or DRBL.
 * Period flow only when the Game carries linescores.
 * Team totals are summed from player box lines (no fabricated team rows).
 */

import {
  BOX_SCORE_MIN_SEASON_GAMES,
  buildBoxScoreGameContext,
  type BoxScoreGameContextIndex,
} from "@/analytics/box-score-context";
import { buildStatContext } from "@/analytics/context";
import type { StatContext } from "@/analytics/types";
import type { Game, PlayerGame } from "@/data/types";
import type { TeamSeasonStats } from "@/data/types/team-season";
import { formatNumber, formatPct } from "@/lib/format";
import { getPbpCapability } from "@/pbp";

export const GAME_LAB_VERSION = 1;

export const GAME_LAB_METHODOLOGY = {
  version: GAME_LAB_VERSION,
  scope: "Regular / final box scores with optional period linescores",
  teamTotalsRule:
    "Team game totals are the sum of player box-score lines for that team. Missing OREB on every line means offensive rebounds are unavailable (not zero).",
  winningFactorsRule:
    "Each metric compares home vs away totals (or rates). A difference counts only when |delta| meets the metric tolerance. Overall edge is a plurality of meaningful advantages — not an opaque game score.",
  teamContextRule:
    `Team game values compare to that team's same-season board averages when gamesPlayed ≥ ${BOX_SCORE_MIN_SEASON_GAMES}. Wrong-season boards are never used.`,
  flowRule:
    "Period flow uses ESPN linescores when present. End-of-period cumulative scores and period scoring margins are reported; mid-period largest lead / possession runs are not inferred.",
  playerHighlightsRule:
    "Player sections rank transparent dimensions (points, gameScore when present, plus/minus, vs-season deltas from Level-2 box context). No universal player-of-the-game grade.",
  missingDataRule:
    "Absent metrics stay absent. Historical thin boxes degrade to partial/minimal coverage. PBP layers stay blocked until capability reports true.",
  setLimits:
    "Pace, lead changes, mid-game largest lead, transition points, and possession runs require data this branch does not yet expose.",
} as const;

/** Absolute tolerances — tiny edges are not “winning factors.” */
export const GAME_LAB_TOLERANCE = {
  points: 3,
  /** Fraction points (0.02 = 2 percentage points). */
  shootingPct: 0.02,
  turnovers: 2,
  rebounds: 3,
  offensiveRebounds: 2,
  assists: 3,
  steals: 2,
  blocks: 2,
  freeThrowsMade: 3,
  freeThrowsAttempted: 4,
  threePointersMade: 2,
  threePointersAttempted: 4,
  threePointPct: 0.04,
} as const;

export type GameLabDepth = "minimal" | "partial" | "full";

export type GameLabSide = "home" | "away" | "even" | "unavailable";

export type GameTeamTotals = {
  teamId: string;
  side: "home" | "away";
  label: string;
  points: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threePointersMade: number;
  threePointersAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  rebounds: number;
  /** Present only when at least one player line reports OREB. */
  offensiveRebounds?: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  effectiveFieldGoalPct: number | null;
  trueShootingPct: number | null;
  threePointPct: number | null;
  freeThrowPct: number | null;
};

export type GameWinningFactor = {
  id: string;
  label: string;
  /** Side that is stronger on this metric. */
  edge: "home" | "away";
  homeValue: number;
  awayValue: number;
  /** home − away (rate metrics use fraction units). */
  delta: number;
  deltaDisplay: string;
  homeDisplay: string;
  awayDisplay: string;
  /** Higher = more decisive among meaningful factors. */
  strength: number;
};

export type GameTeamContextMetric = {
  id: string;
  label: string;
  side: "home" | "away";
  gameValue: number;
  gameDisplay: string;
  seasonAvg?: number;
  seasonAvgDisplay?: string;
  vsSeason?: number;
  vsSeasonDisplay?: string;
  context: StatContext;
};

export type GameFlowPeriod = {
  periodIndex: number;
  label: string;
  homePoints: number;
  awayPoints: number;
  homeCumulative: number;
  awayCumulative: number;
  leader: GameLabSide;
  margin: number;
};

export type GameFlowSummary = {
  available: boolean;
  periods: GameFlowPeriod[];
  /** Largest |home−away| cumulative lead observed at a period boundary. */
  largestEndOfPeriodLead?: {
    side: "home" | "away";
    margin: number;
    afterPeriodLabel: string;
  };
  /** Period with the largest scoring differential (home − away). */
  biggestPeriodSwing?: {
    periodLabel: string;
    edge: "home" | "away";
    homePoints: number;
    awayPoints: number;
    delta: number;
    summary: string;
  };
  notes: string[];
};

export type GamePlayerHighlight = {
  playerId: string;
  playerName: string;
  teamId: string;
  side: "home" | "away";
  teamLabel: string;
  value: number;
  display: string;
  detail?: string;
  playerHref: string;
};

export type GamePlayerHighlights = {
  scoring: GamePlayerHighlight[];
  allAround: GamePlayerHighlight[];
  plusMinus: GamePlayerHighlight[];
  vsSeason: GamePlayerHighlight[];
};

export type GameLabDataCoverage = {
  depth: GameLabDepth;
  hasBoxScore: boolean;
  hasTeamTotals: boolean;
  hasPeriodScores: boolean;
  hasHomeSeasonContext: boolean;
  hasAwaySeasonContext: boolean;
  pbpAvailable: boolean;
  notes: string[];
};

export type GameAnalysisSummary = {
  version: number;
  gameId: string;
  season: string;
  gameDate: string;
  status: string;
  outcome: {
    homeLabel: string;
    awayLabel: string;
    homeName: string;
    awayName: string;
    homeScore: number;
    awayScore: number;
    winner: GameLabSide;
    margin: number;
    marginDisplay: string;
    totalPoints: number;
    summaryLine: string;
  };
  heroMetrics: Array<{
    id: string;
    label: string;
    display: string;
  }>;
  home: GameTeamTotals | null;
  away: GameTeamTotals | null;
  flow: GameFlowSummary;
  whatChanged: string[];
  winningFactors: GameWinningFactor[];
  homeAdvantages: GameWinningFactor[];
  awayAdvantages: GameWinningFactor[];
  overallEdge: GameLabSide;
  overallEdgeDisplay: string;
  overallReason: string;
  teamContext: GameTeamContextMetric[];
  playerHighlights: GamePlayerHighlights;
  boxScoreContext: BoxScoreGameContextIndex;
  coverage: GameLabDataCoverage;
  methodology: typeof GAME_LAB_METHODOLOGY;
};

function periodLabel(index: number, total: number): string {
  if (index < 4) return `Q${index + 1}`;
  if (total === 5 && index === 4) return "OT";
  return `OT${index - 3}`;
}

function signed(n: number, digits = 0): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${formatNumber(n, digits)}`;
}

function pctPointsDisplay(deltaFraction: number): string {
  const pts = deltaFraction * 100;
  return `${signed(pts, 1)} percentage points`;
}

export function sumTeamTotals(
  players: PlayerGame[],
  teamId: string,
  side: "home" | "away",
  label: string
): GameTeamTotals | null {
  const rows = players.filter((p) => p.teamId === teamId);
  if (!rows.length) return null;

  let points = 0;
  let fgm = 0;
  let fga = 0;
  let tpm = 0;
  let tpa = 0;
  let ftm = 0;
  let fta = 0;
  let reb = 0;
  let oreb = 0;
  let orebReported = false;
  let assists = 0;
  let steals = 0;
  let blocks = 0;
  let turnovers = 0;

  for (const p of rows) {
    points += p.points;
    fgm += p.fieldGoalsMade;
    fga += p.fieldGoalsAttempted;
    tpm += p.threePointersMade;
    tpa += p.threePointersAttempted;
    ftm += p.freeThrowsMade;
    fta += p.freeThrowsAttempted;
    reb += p.rebounds;
    assists += p.assists;
    steals += p.steals;
    blocks += p.blocks;
    turnovers += p.turnovers;
    if (p.offensiveRebounds != null && Number.isFinite(p.offensiveRebounds)) {
      orebReported = true;
      oreb += p.offensiveRebounds;
    }
  }

  const efg = fga > 0 ? (fgm + 0.5 * tpm) / fga : null;
  const tsDenom = 2 * (fga + 0.44 * fta);
  const ts = tsDenom > 0 ? points / tsDenom : null;
  const fg3 = tpa > 0 ? tpm / tpa : null;
  const ft = fta > 0 ? ftm / fta : null;

  return {
    teamId,
    side,
    label,
    points,
    fieldGoalsMade: fgm,
    fieldGoalsAttempted: fga,
    threePointersMade: tpm,
    threePointersAttempted: tpa,
    freeThrowsMade: ftm,
    freeThrowsAttempted: fta,
    rebounds: reb,
    ...(orebReported ? { offensiveRebounds: oreb } : {}),
    assists,
    steals,
    blocks,
    turnovers,
    effectiveFieldGoalPct: efg,
    trueShootingPct: ts,
    threePointPct: fg3,
    freeThrowPct: ft,
  };
}

type FactorDef = {
  id: string;
  label: string;
  pick: (t: GameTeamTotals) => number | null;
  tolerance: number;
  /** When true, lower values are better (e.g. turnovers). */
  invert?: boolean;
  /** Rate metrics stored as 0–1 fractions. */
  isPct?: boolean;
  formatValue: (v: number) => string;
  formatDelta: (d: number) => string;
  /** Strength scale: absolute delta / tolerance. */
};

const FACTOR_DEFS: FactorDef[] = [
  {
    id: "efg",
    label: "Effective FG%",
    pick: (t) => t.effectiveFieldGoalPct,
    tolerance: GAME_LAB_TOLERANCE.shootingPct,
    isPct: true,
    formatValue: (v) => formatPct(v),
    formatDelta: pctPointsDisplay,
  },
  {
    id: "ts",
    label: "True shooting",
    pick: (t) => t.trueShootingPct,
    tolerance: GAME_LAB_TOLERANCE.shootingPct,
    isPct: true,
    formatValue: (v) => formatPct(v),
    formatDelta: pctPointsDisplay,
  },
  {
    id: "tov",
    label: "Turnovers",
    pick: (t) => t.turnovers,
    tolerance: GAME_LAB_TOLERANCE.turnovers,
    invert: true,
    formatValue: (v) => formatNumber(v, 0),
    formatDelta: (d) => signed(d, 0),
  },
  {
    id: "oreb",
    label: "Offensive rebounds",
    pick: (t) => t.offensiveRebounds ?? null,
    tolerance: GAME_LAB_TOLERANCE.offensiveRebounds,
    formatValue: (v) => formatNumber(v, 0),
    formatDelta: (d) => signed(d, 0),
  },
  {
    id: "reb",
    label: "Rebounds",
    pick: (t) => t.rebounds,
    tolerance: GAME_LAB_TOLERANCE.rebounds,
    formatValue: (v) => formatNumber(v, 0),
    formatDelta: (d) => signed(d, 0),
  },
  {
    id: "ftm",
    label: "Free throws made",
    pick: (t) => t.freeThrowsMade,
    tolerance: GAME_LAB_TOLERANCE.freeThrowsMade,
    formatValue: (v) => formatNumber(v, 0),
    formatDelta: (d) => signed(d, 0),
  },
  {
    id: "fta",
    label: "Free throw attempts",
    pick: (t) => t.freeThrowsAttempted,
    tolerance: GAME_LAB_TOLERANCE.freeThrowsAttempted,
    formatValue: (v) => formatNumber(v, 0),
    formatDelta: (d) => signed(d, 0),
  },
  {
    id: "fg3a",
    label: "3-point attempts",
    pick: (t) => t.threePointersAttempted,
    tolerance: GAME_LAB_TOLERANCE.threePointersAttempted,
    formatValue: (v) => formatNumber(v, 0),
    formatDelta: (d) => signed(d, 0),
  },
  {
    id: "fg3m",
    label: "Threes made",
    pick: (t) => t.threePointersMade,
    tolerance: GAME_LAB_TOLERANCE.threePointersMade,
    formatValue: (v) => formatNumber(v, 0),
    formatDelta: (d) => signed(d, 0),
  },
  {
    id: "fg3pct",
    label: "3P%",
    pick: (t) => t.threePointPct,
    tolerance: GAME_LAB_TOLERANCE.threePointPct,
    isPct: true,
    formatValue: (v) => formatPct(v),
    formatDelta: pctPointsDisplay,
  },
  {
    id: "ast",
    label: "Assists",
    pick: (t) => t.assists,
    tolerance: GAME_LAB_TOLERANCE.assists,
    formatValue: (v) => formatNumber(v, 0),
    formatDelta: (d) => signed(d, 0),
  },
  {
    id: "stl",
    label: "Steals",
    pick: (t) => t.steals,
    tolerance: GAME_LAB_TOLERANCE.steals,
    formatValue: (v) => formatNumber(v, 0),
    formatDelta: (d) => signed(d, 0),
  },
  {
    id: "blk",
    label: "Blocks",
    pick: (t) => t.blocks,
    tolerance: GAME_LAB_TOLERANCE.blocks,
    formatValue: (v) => formatNumber(v, 0),
    formatDelta: (d) => signed(d, 0),
  },
  {
    id: "pts",
    label: "Points",
    pick: (t) => t.points,
    tolerance: GAME_LAB_TOLERANCE.points,
    formatValue: (v) => formatNumber(v, 0),
    formatDelta: (d) => signed(d, 0),
  },
];

export function computeWinningFactors(
  home: GameTeamTotals,
  away: GameTeamTotals
): GameWinningFactor[] {
  const out: GameWinningFactor[] = [];
  for (const def of FACTOR_DEFS) {
    const hv = def.pick(home);
    const av = def.pick(away);
    if (hv == null || av == null) continue;
    if (!Number.isFinite(hv) || !Number.isFinite(av)) continue;
    const rawDelta = hv - av;
    const signedForEdge = def.invert ? -rawDelta : rawDelta;
    if (Math.abs(signedForEdge) < def.tolerance) continue;
    const edge: "home" | "away" = signedForEdge > 0 ? "home" : "away";
    // Display delta from the advantaged team's point of view
    // (e.g. away +23 FTM, home −4 turnovers).
    const edgeViewDelta = edge === "home" ? rawDelta : -rawDelta;
    out.push({
      id: def.id,
      label: def.label,
      edge,
      homeValue: hv,
      awayValue: av,
      delta: rawDelta,
      deltaDisplay: def.formatDelta(edgeViewDelta),
      homeDisplay: def.formatValue(hv),
      awayDisplay: def.formatValue(av),
      strength: Math.abs(signedForEdge) / def.tolerance,
    });
  }
  return out.sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id));
}

export function buildGameFlow(game: Game): GameFlowSummary {
  const homeP = game.homePeriodScores;
  const awayP = game.awayPeriodScores;
  if (
    !homeP?.length ||
    !awayP?.length ||
    homeP.length !== awayP.length ||
    homeP.every((n) => n === 0) && awayP.every((n) => n === 0)
  ) {
    return {
      available: false,
      periods: [],
      notes: [
        "Period scoring is unavailable for this game — score-over-time and quarter swings cannot be shown yet.",
      ],
    };
  }

  const periods: GameFlowPeriod[] = [];
  let homeCum = 0;
  let awayCum = 0;
  let largest: GameFlowSummary["largestEndOfPeriodLead"];
  let biggestSwing: GameFlowSummary["biggestPeriodSwing"];

  for (let i = 0; i < homeP.length; i++) {
    const hp = homeP[i]!;
    const ap = awayP[i]!;
    homeCum += hp;
    awayCum += ap;
    const label = periodLabel(i, homeP.length);
    const margin = homeCum - awayCum;
    const leader: GameLabSide =
      margin > 0 ? "home" : margin < 0 ? "away" : "even";
    periods.push({
      periodIndex: i,
      label,
      homePoints: hp,
      awayPoints: ap,
      homeCumulative: homeCum,
      awayCumulative: awayCum,
      leader,
      margin,
    });

    const absMargin = Math.abs(margin);
    if (absMargin > 0 && (!largest || absMargin > largest.margin)) {
      largest = {
        side: margin > 0 ? "home" : "away",
        margin: absMargin,
        afterPeriodLabel: label,
      };
    }

    const periodDelta = hp - ap;
    if (
      !biggestSwing ||
      Math.abs(periodDelta) > Math.abs(biggestSwing.delta)
    ) {
      const edge: "home" | "away" = periodDelta >= 0 ? "home" : "away";
      biggestSwing = {
        periodLabel: label,
        edge,
        homePoints: hp,
        awayPoints: ap,
        delta: periodDelta,
        summary: "", // filled after labels known by caller optionally
      };
    }
  }

  return {
    available: true,
    periods,
    largestEndOfPeriodLead: largest,
    biggestPeriodSwing: biggestSwing,
    notes: [
      "Lead figures are end-of-period only — mid-period largest lead needs play-by-play.",
    ],
  };
}

function teamContextMetrics(
  side: "home" | "away",
  totals: GameTeamTotals,
  season: TeamSeasonStats | null | undefined,
  seasonId: string
): GameTeamContextMetric[] {
  if (
    !season ||
    season.season !== seasonId ||
    season.gamesPlayed < BOX_SCORE_MIN_SEASON_GAMES
  ) {
    return [];
  }

  const defs: Array<{
    id: string;
    label: string;
    game: number | null;
    avg: number | null;
    formatGame: (v: number) => string;
    formatAvg: (v: number) => string;
    formatDelta: (d: number) => string;
    unit?: StatContext["unit"];
  }> = [
    {
      id: "points",
      label: "Points",
      game: totals.points,
      avg: season.ppg,
      formatGame: (v) => formatNumber(v, 0),
      formatAvg: (v) => `${formatNumber(v, 1)} PPG`,
      formatDelta: (d) => signed(d, 1),
    },
    {
      id: "efg",
      label: "Effective FG%",
      game: totals.effectiveFieldGoalPct,
      avg: season.effectiveFieldGoalPct,
      formatGame: (v) => formatPct(v),
      formatAvg: (v) => formatPct(v),
      formatDelta: pctPointsDisplay,
      unit: "pct",
    },
    {
      id: "ts",
      label: "True shooting",
      game: totals.trueShootingPct,
      avg: season.trueShootingPct,
      formatGame: (v) => formatPct(v),
      formatAvg: (v) => formatPct(v),
      formatDelta: pctPointsDisplay,
      unit: "pct",
    },
    {
      id: "tov",
      label: "Turnovers",
      game: totals.turnovers,
      avg: season.topg,
      formatGame: (v) => formatNumber(v, 0),
      formatAvg: (v) => `${formatNumber(v, 1)} TPG`,
      formatDelta: (d) => signed(d, 1),
    },
    {
      id: "reb",
      label: "Rebounds",
      game: totals.rebounds,
      avg: season.rpg,
      formatGame: (v) => formatNumber(v, 0),
      formatAvg: (v) => `${formatNumber(v, 1)} RPG`,
      formatDelta: (d) => signed(d, 1),
    },
  ];

  const out: GameTeamContextMetric[] = [];
  for (const def of defs) {
    if (def.game == null || def.avg == null) continue;
    if (!Number.isFinite(def.game) || !Number.isFinite(def.avg)) continue;
    const delta = def.game - def.avg;
    out.push({
      id: `${side}-${def.id}`,
      label: def.label,
      side,
      gameValue: def.game,
      gameDisplay: def.formatGame(def.game),
      seasonAvg: def.avg,
      seasonAvgDisplay: def.formatAvg(def.avg),
      vsSeason: delta,
      vsSeasonDisplay: def.formatDelta(delta),
      context: buildStatContext({
        display: def.formatGame(def.game),
        value: def.game,
        unit: def.unit,
        vsPrior: delta,
        population: "custom",
        populationLabel: `${totals.label} ${seasonId} season average`,
        sampleSize: season.gamesPlayed,
        timeframe: seasonId,
        sourceLabel: def.label,
      }),
    });
  }
  return out;
}

function buildPlayerHighlights(options: {
  players: PlayerGame[];
  game: Game;
  homeLabel: string;
  awayLabel: string;
  boxContext: BoxScoreGameContextIndex;
}): GamePlayerHighlights {
  const { players, game, homeLabel, awayLabel, boxContext } = options;
  const active = players.filter((p) => p.minutes > 0);
  const sideOf = (teamId: string): "home" | "away" =>
    teamId === game.homeTeamId ? "home" : "away";
  const labelOf = (teamId: string) =>
    teamId === game.homeTeamId ? homeLabel : awayLabel;

  const toHighlight = (
    p: PlayerGame,
    value: number,
    display: string,
    detail?: string
  ): GamePlayerHighlight => ({
    playerId: p.playerId,
    playerName: p.playerName ?? p.playerId,
    teamId: p.teamId,
    side: sideOf(p.teamId),
    teamLabel: labelOf(p.teamId),
    value,
    display,
    detail,
    playerHref: `/players/${p.playerId}?season=${encodeURIComponent(game.season)}`,
  });

  const scoring = [...active]
    .sort((a, b) => b.points - a.points || b.minutes - a.minutes)
    .slice(0, 5)
    .filter((p) => p.points > 0)
    .map((p) =>
      toHighlight(
        p,
        p.points,
        `${formatNumber(p.points, 0)} PTS`,
        `${formatNumber(p.assists, 0)} AST · ${formatNumber(p.rebounds, 0)} REB`
      )
    );

  const hasGameScore = active.some(
    (p) => p.gameScore != null && Number.isFinite(p.gameScore)
  );
  const allAround = hasGameScore
    ? [...active]
        .filter((p) => p.gameScore != null)
        .sort(
          (a, b) =>
            (b.gameScore ?? 0) - (a.gameScore ?? 0) || b.minutes - a.minutes
        )
        .slice(0, 5)
        .map((p) =>
          toHighlight(
            p,
            p.gameScore!,
            `Game Score ${formatNumber(p.gameScore!, 1)}`,
            `${formatNumber(p.points, 0)} / ${formatNumber(p.rebounds, 0)} / ${formatNumber(p.assists, 0)}`
          )
        )
    : [...active]
        .map((p) => ({
          p,
          // Transparent stand-in: counting box contribution — not a universal grade.
          composite: p.points + p.rebounds + p.assists,
        }))
        .sort((a, b) => b.composite - a.composite)
        .slice(0, 5)
        .filter((x) => x.composite > 0)
        .map(({ p, composite }) =>
          toHighlight(
            p,
            composite,
            `${formatNumber(p.points, 0)}+${formatNumber(p.rebounds, 0)}+${formatNumber(p.assists, 0)}`,
            "Points + rebounds + assists (no composite grade)"
          )
        );

  const plusMinus = [...active]
    .sort((a, b) => b.plusMinus - a.plusMinus || b.minutes - a.minutes)
    .slice(0, 5)
    .filter((p) => p.plusMinus !== 0)
    .map((p) =>
      toHighlight(
        p,
        p.plusMinus,
        `${p.plusMinus > 0 ? "+" : ""}${formatNumber(p.plusMinus, 0)} +/-`,
        `${formatNumber(p.minutes, 0)} MIN`
      )
    );

  const vsSeason: GamePlayerHighlight[] = [];
  for (const p of active) {
    const ctx = boxContext.byPlayerId[p.playerId];
    const pts = ctx?.lines.find((l) => l.id === "points");
    if (pts?.vsSeason != null && pts.vsSeason >= 5) {
      vsSeason.push(
        toHighlight(
          p,
          pts.vsSeason,
          `${pts.gameDisplay} PTS (${pts.vsSeasonDisplay} vs season)`,
          pts.seasonAvgDisplay
            ? `Season avg ${pts.seasonAvgDisplay}`
            : undefined
        )
      );
    }
  }
  vsSeason.sort((a, b) => b.value - a.value);
  vsSeason.splice(5);

  return { scoring, allAround, plusMinus, vsSeason };
}

export function analyzeGame(options: {
  game: Game;
  players: PlayerGame[];
  homeLabel: string;
  awayLabel: string;
  homeName: string;
  awayName: string;
  homeSeason?: TeamSeasonStats | null;
  awaySeason?: TeamSeasonStats | null;
  seasonByPlayerId?: Map<string, import("@/data/types").PlayerSeason>;
}): GameAnalysisSummary {
  const {
    game,
    players,
    homeLabel,
    awayLabel,
    homeName,
    awayName,
    homeSeason = null,
    awaySeason = null,
    seasonByPlayerId = new Map(),
  } = options;

  const margin = game.homeScore - game.awayScore;
  const winner: GameLabSide =
    margin > 0 ? "home" : margin < 0 ? "away" : "even";
  const winnerLabel =
    winner === "home" ? homeLabel : winner === "away" ? awayLabel : "Tie";

  const home = sumTeamTotals(players, game.homeTeamId, "home", homeLabel);
  const away = sumTeamTotals(players, game.awayTeamId, "away", awayLabel);

  const flow = buildGameFlow(game);
  if (flow.biggestPeriodSwing) {
    const swing = flow.biggestPeriodSwing;
    const edgeLabel = swing.edge === "home" ? homeLabel : awayLabel;
    swing.summary = `${edgeLabel} outscored the opponent ${
      swing.edge === "home" ? swing.homePoints : swing.awayPoints
    }–${swing.edge === "home" ? swing.awayPoints : swing.homePoints} in ${swing.periodLabel}.`;
  }

  const whatChanged: string[] = [];
  if (flow.biggestPeriodSwing?.summary) {
    whatChanged.push(flow.biggestPeriodSwing.summary);
  }
  if (flow.largestEndOfPeriodLead) {
    const sideLabel =
      flow.largestEndOfPeriodLead.side === "home" ? homeLabel : awayLabel;
    whatChanged.push(
      `Largest end-of-period lead: ${sideLabel} by ${flow.largestEndOfPeriodLead.margin} after ${flow.largestEndOfPeriodLead.afterPeriodLabel}.`
    );
  }
  for (const period of flow.periods) {
    const d = period.homePoints - period.awayPoints;
    if (Math.abs(d) >= 10) {
      const edgeLabel = d > 0 ? homeLabel : awayLabel;
      const hi = d > 0 ? period.homePoints : period.awayPoints;
      const lo = d > 0 ? period.awayPoints : period.homePoints;
      const line = `${edgeLabel} outscored the opponent ${hi}–${lo} in ${period.label}.`;
      if (!whatChanged.includes(line)) whatChanged.push(line);
    }
  }

  const winningFactors =
    home && away ? computeWinningFactors(home, away) : [];
  const homeAdvantages = winningFactors.filter((f) => f.edge === "home");
  const awayAdvantages = winningFactors.filter((f) => f.edge === "away");

  let overallEdge: GameLabSide = "unavailable";
  let overallReason: string;
  if (!home || !away) {
    overallReason =
      "Not enough box-score team totals to compare statistical advantages.";
  } else if (!winningFactors.length) {
    overallEdge = "even";
    overallReason =
      "No metric cleared its meaningful-difference tolerance — the statistical profile is essentially even.";
  } else if (homeAdvantages.length === awayAdvantages.length) {
    overallEdge = "even";
    overallReason = `Each side holds ${homeAdvantages.length} meaningful statistical advantage${homeAdvantages.length === 1 ? "" : "s"}.`;
  } else if (homeAdvantages.length > awayAdvantages.length) {
    overallEdge = "home";
    overallReason = `${homeLabel} holds more meaningful statistical advantages (${homeAdvantages.length}–${awayAdvantages.length}).`;
  } else {
    overallEdge = "away";
    overallReason = `${awayLabel} holds more meaningful statistical advantages (${awayAdvantages.length}–${homeAdvantages.length}).`;
  }

  const overallEdgeDisplay =
    overallEdge === "home"
      ? homeLabel
      : overallEdge === "away"
        ? awayLabel
        : overallEdge === "even"
          ? "Even"
          : "Unavailable";

  const teamContext = [
    ...(home ? teamContextMetrics("home", home, homeSeason, game.season) : []),
    ...(away ? teamContextMetrics("away", away, awaySeason, game.season) : []),
  ];

  const boxScoreContext = buildBoxScoreGameContext({
    gameId: game.id,
    season: game.season,
    players,
    seasonByPlayerId,
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    homeSeasonTeam: homeSeason,
    awaySeasonTeam: awaySeason,
  });

  const playerHighlights = buildPlayerHighlights({
    players,
    game,
    homeLabel,
    awayLabel,
    boxContext: boxScoreContext,
  });

  const pbp = getPbpCapability();
  const hasBoxScore = players.some((p) => p.minutes > 0 || p.points > 0);
  const hasTeamTotals = Boolean(home && away);
  const hasPeriodScores = flow.available;
  const hasHomeSeasonContext = teamContext.some((m) => m.side === "home");
  const hasAwaySeasonContext = teamContext.some((m) => m.side === "away");

  let depth: GameLabDepth = "minimal";
  if (hasTeamTotals && (hasHomeSeasonContext || hasAwaySeasonContext)) {
    depth = "full";
  } else if (hasTeamTotals || hasBoxScore) {
    depth = "partial";
  }

  const coverageNotes: string[] = [];
  if (!hasBoxScore) {
    coverageNotes.push("No usable player box-score lines for this game.");
  }
  if (!hasPeriodScores) {
    coverageNotes.push("Period linescores unavailable — game flow is limited.");
  }
  if (!hasHomeSeasonContext && !hasAwaySeasonContext) {
    coverageNotes.push(
      "Team season averages unavailable or below the minimum games threshold."
    );
  }
  if (!pbp.possessionsDerived) {
    coverageNotes.push(
      "Deeper possession analysis will appear when possession-level data is available."
    );
  }

  const heroMetrics: GameAnalysisSummary["heroMetrics"] = [
    {
      id: "margin",
      label: `${winner === "even" ? "Final" : winnerLabel} margin`,
      display:
        winner === "even" ? "0" : signed(Math.abs(margin), 0),
    },
    {
      id: "total",
      label: "Total points",
      display: formatNumber(game.homeScore + game.awayScore, 0),
    },
  ];
  if (home?.effectiveFieldGoalPct != null && away?.effectiveFieldGoalPct != null) {
    heroMetrics.push({
      id: "efg",
      label: "eFG% (H / A)",
      display: `${formatPct(home.effectiveFieldGoalPct)} / ${formatPct(away.effectiveFieldGoalPct)}`,
    });
  }
  if (home && away) {
    heroMetrics.push({
      id: "tov",
      label: "Turnovers (H / A)",
      display: `${formatNumber(home.turnovers, 0)} / ${formatNumber(away.turnovers, 0)}`,
    });
    heroMetrics.push({
      id: "reb",
      label: "Rebounds (H / A)",
      display: `${formatNumber(home.rebounds, 0)} / ${formatNumber(away.rebounds, 0)}`,
    });
  }
  if (flow.largestEndOfPeriodLead) {
    const side =
      flow.largestEndOfPeriodLead.side === "home" ? homeLabel : awayLabel;
    heroMetrics.push({
      id: "lead",
      label: "Largest end-of-period lead",
      display: `${side} +${flow.largestEndOfPeriodLead.margin}`,
    });
  }

  const summaryLine =
    winner === "even"
      ? `${awayLabel} ${game.awayScore} — ${homeLabel} ${game.homeScore} (tie)`
      : `${winnerLabel} ${
          winner === "home" ? game.homeScore : game.awayScore
        } — ${
          winner === "home" ? awayLabel : homeLabel
        } ${winner === "home" ? game.awayScore : game.homeScore}`;

  return {
    version: GAME_LAB_VERSION,
    gameId: game.id,
    season: game.season,
    gameDate: game.gameDate,
    status: game.status ?? "final",
    outcome: {
      homeLabel,
      awayLabel,
      homeName,
      awayName,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      winner,
      margin,
      marginDisplay: signed(margin, 0),
      totalPoints: game.homeScore + game.awayScore,
      summaryLine,
    },
    heroMetrics,
    home,
    away,
    flow,
    whatChanged,
    winningFactors,
    homeAdvantages,
    awayAdvantages,
    overallEdge,
    overallEdgeDisplay,
    overallReason,
    teamContext,
    playerHighlights,
    boxScoreContext,
    coverage: {
      depth,
      hasBoxScore,
      hasTeamTotals,
      hasPeriodScores,
      hasHomeSeasonContext,
      hasAwaySeasonContext,
      pbpAvailable: pbp.possessionsDerived,
      notes: coverageNotes,
    },
    methodology: GAME_LAB_METHODOLOGY,
  };
}

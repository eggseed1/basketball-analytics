/**
 * Game Lab V1.1 — Game vs Season Context.
 *
 * Descriptive: how unusual was this game vs each team's same-season board?
 * Not a new game score, not causal, not PBP.
 *
 * Points / opponent points use the scoreboard (Game scores).
 * Shooting / turnovers / rebounds use summed player box lines when present.
 */

import { BOX_SCORE_MIN_SEASON_GAMES } from "@/analytics/box-score-context";
import type { GameTeamTotals } from "@/analytics/game-lab";
import type { Game } from "@/data/types";
import type { TeamSeasonStats } from "@/data/types/team-season";
import { formatNumber, formatPct } from "@/lib/format";
import { isFinalStatus, type GameStatusKind } from "@/lib/game-status";

export const GAME_SEASON_CONTEXT_VERSION = "1.1";

/**
 * Absolute tolerances for game value vs same-season team average.
 * Inside tolerance → near normal (not highlighted).
 * Inspired by GAME_LAB_TOLERANCE / team-season compare floors, widened for
 * single-game noise vs a season mean.
 */
export const GAME_SEASON_CONTEXT_TOLERANCE = {
  /** Points scored vs team PPG. */
  points: 5,
  /** Opponent points vs team opp PPG (lower is better defensively). */
  opponentPoints: 5,
  /** Fraction units (0.025 = 2.5 percentage points) for eFG% / TS%. */
  shootingPct: 0.025,
  turnovers: 2.5,
  rebounds: 4,
  assists: 3.5,
} as const;

/** |delta| ≥ unusualMultiple × tolerance → “unusually …” */
export const GAME_SEASON_CONTEXT_UNUSUAL_MULTIPLE = 2;

export const GAME_SEASON_CONTEXT_METHODOLOGY = {
  version: GAME_SEASON_CONTEXT_VERSION,
  scope:
    "Final games with same-season team boards (games gamesPlayed ≥ minimum).",
  baselineRule: `Season baseline = that team's ESPN board averages for the game's season when gamesPlayed ≥ ${BOX_SCORE_MIN_SEASON_GAMES}. Wrong-season boards are never used.`,
  pointsRule:
    "Team points and opponent points come from the official scoreboard scores on the Game row — not summed player lines.",
  boxRule:
    "eFG%, TS%, turnovers, and rebounds compare only when team box totals exist for that side.",
  directionRule:
    "Higher-is-better metrics (points, eFG, TS, rebounds, assists): positive delta favors the team. Lower-is-better (opponent points, turnovers): negative delta favors the team.",
  toleranceRule:
    "Inside tolerance → near normal. Between 1× and 2× → above/below normal. At/above 2× → unusually high/low (or unusually strong/weak for defense).",
  liveRule:
    "Hidden while the game is not final — in-progress scores are not compared to completed-game season averages as if final.",
  languageRule:
    "Findings are descriptive (“scored well above its normal level”). No causal win claims.",
  setLimits:
    "No percentiles, z-scores, pace, possessions, ORB%, or lineup context in this layer.",
} as const;

export type GameSeasonMetricId =
  | "points"
  | "opponent_points"
  | "efg"
  | "ts"
  | "turnovers"
  | "rebounds"
  | "assists";

export type MetricDirection = "higher_better" | "lower_better";

export type UnusualBand =
  | "near_normal"
  | "above_normal"
  | "below_normal"
  | "unusually_high"
  | "unusually_low";

/** Performance-oriented label after applying direction. */
export type PerformanceBand =
  | "near_normal"
  | "above_normal"
  | "below_normal"
  | "unusually_strong"
  | "unusually_weak";

export type FingerprintDimensionId =
  | "offense"
  | "shooting"
  | "ball_security"
  | "rebounding"
  | "defense";

export type FingerprintLabel =
  | "near normal"
  | "above normal"
  | "below normal"
  | "unusually high"
  | "unusually low"
  | "unusually strong"
  | "unusually weak"
  | "unavailable";

export type GameSeasonMetricComparison = {
  id: GameSeasonMetricId;
  label: string;
  /** Learn concept id when available. */
  conceptId: string | null;
  direction: MetricDirection;
  gameValue: number;
  gameDisplay: string;
  seasonAvg: number;
  seasonAvgDisplay: string;
  /** Raw game − season (fraction units for rates). */
  delta: number;
  deltaDisplay: string;
  band: UnusualBand;
  performance: PerformanceBand;
  /** True when |delta| meets tolerance (highlight candidate). */
  meaningful: boolean;
};

export type GameSeasonTeamContext = {
  side: "home" | "away";
  teamId: string;
  label: string;
  name: string;
  seasonId: string;
  seasonGamesPlayed: number;
  available: boolean;
  unavailableReason?: string;
  metrics: GameSeasonMetricComparison[];
  /** Compact highlight rows (meaningful only, capped). */
  highlightMetrics: GameSeasonMetricComparison[];
  fingerprint: Array<{
    id: FingerprintDimensionId;
    label: string;
    band: FingerprintLabel;
    conceptId: string | null;
  }>;
};

export type GameSeasonFinding = {
  id: string;
  side: "home" | "away";
  teamLabel: string;
  metricId: GameSeasonMetricId;
  text: string;
  performance: PerformanceBand;
};

export type GameSeasonContextDepth = "none" | "minimal" | "partial" | "full";

export type GameSeasonContextAvailability =
  | "ready"
  | "hidden_live"
  | "hidden_incomplete"
  | "unavailable";

export type GameSeasonContext = {
  version: string;
  gameId: string;
  season: string;
  availability: GameSeasonContextAvailability;
  availabilityNote: string | null;
  depth: GameSeasonContextDepth;
  home: GameSeasonTeamContext | null;
  away: GameSeasonTeamContext | null;
  findings: GameSeasonFinding[];
  methodology: typeof GAME_SEASON_CONTEXT_METHODOLOGY;
};

function signed(n: number, digits = 1): string {
  const v = formatNumber(n, digits);
  if (n > 0) return `+${v}`;
  return v;
}

function pctPointsDisplay(deltaFraction: number): string {
  const pp = deltaFraction * 100;
  return `${signed(pp, 1)} pp`;
}

function classifyBand(
  delta: number,
  tolerance: number,
  unusualMultiple: number
): UnusualBand {
  const abs = Math.abs(delta);
  if (abs < tolerance) return "near_normal";
  const unusual = tolerance * unusualMultiple;
  if (delta > 0) {
    return abs >= unusual ? "unusually_high" : "above_normal";
  }
  return abs >= unusual ? "unusually_low" : "below_normal";
}

/**
 * Map raw unusual band → performance band using metric direction.
 * Lower opponent points / turnovers = stronger performance.
 */
export function performanceFromBand(
  band: UnusualBand,
  direction: MetricDirection
): PerformanceBand {
  if (band === "near_normal") return "near_normal";
  if (direction === "higher_better") {
    if (band === "above_normal") return "above_normal";
    if (band === "unusually_high") return "unusually_strong";
    if (band === "below_normal") return "below_normal";
    return "unusually_weak";
  }
  // lower_better: low game value is strong
  if (band === "below_normal") return "above_normal";
  if (band === "unusually_low") return "unusually_strong";
  if (band === "above_normal") return "below_normal";
  return "unusually_weak";
}

export function fingerprintLabelFromPerformance(
  performance: PerformanceBand,
  style: "level" | "strength" = "level"
): FingerprintLabel {
  switch (performance) {
    case "near_normal":
      return "near normal";
    case "above_normal":
      return style === "strength" ? "above normal" : "above normal";
    case "below_normal":
      return "below normal";
    case "unusually_strong":
      return style === "strength" ? "unusually strong" : "unusually high";
    case "unusually_weak":
      return style === "strength" ? "unusually weak" : "unusually low";
  }
}

type MetricDef = {
  id: GameSeasonMetricId;
  label: string;
  conceptId: string | null;
  direction: MetricDirection;
  tolerance: number;
  gameValue: number | null | undefined;
  seasonAvg: number | null | undefined;
  formatGame: (v: number) => string;
  formatAvg: (v: number) => string;
  formatDelta: (d: number) => string;
};

function buildMetric(def: MetricDef): GameSeasonMetricComparison | null {
  if (def.gameValue == null || def.seasonAvg == null) return null;
  if (!Number.isFinite(def.gameValue) || !Number.isFinite(def.seasonAvg)) {
    return null;
  }
  const delta = def.gameValue - def.seasonAvg;
  const band = classifyBand(
    delta,
    def.tolerance,
    GAME_SEASON_CONTEXT_UNUSUAL_MULTIPLE
  );
  const performance = performanceFromBand(band, def.direction);
  return {
    id: def.id,
    label: def.label,
    conceptId: def.conceptId,
    direction: def.direction,
    gameValue: def.gameValue,
    gameDisplay: def.formatGame(def.gameValue),
    seasonAvg: def.seasonAvg,
    seasonAvgDisplay: def.formatAvg(def.seasonAvg),
    delta,
    deltaDisplay: def.formatDelta(delta),
    band,
    performance,
    meaningful: band !== "near_normal",
  };
}

function findingText(
  teamLabel: string,
  metric: GameSeasonMetricComparison
): string | null {
  if (!metric.meaningful) return null;
  const strong =
    metric.performance === "unusually_strong" ||
    metric.performance === "unusually_weak";
  switch (metric.id) {
    case "points":
      if (metric.performance === "unusually_strong") {
        return `${teamLabel} scored well above its normal level.`;
      }
      if (metric.performance === "above_normal") {
        return `${teamLabel} scored above its season norm.`;
      }
      if (metric.performance === "unusually_weak") {
        return `${teamLabel} scored well below its normal level.`;
      }
      return `${teamLabel} scored below its season norm.`;
    case "opponent_points":
      if (metric.performance === "unusually_strong") {
        return `The opponent scored substantially below ${teamLabel}'s normal allowed level.`;
      }
      if (metric.performance === "above_normal") {
        return `Opponent scoring was below ${teamLabel}'s season norm.`;
      }
      if (metric.performance === "unusually_weak") {
        return `The opponent scored substantially above ${teamLabel}'s normal allowed level.`;
      }
      return `Opponent scoring was above ${teamLabel}'s season norm.`;
    case "efg":
    case "ts": {
      const what =
        metric.id === "efg" ? "Effective FG%" : "True shooting";
      if (metric.performance === "unusually_strong") {
        return `${what} was well above ${teamLabel}'s season norm.`;
      }
      if (metric.performance === "above_normal") {
        return `Shooting efficiency was above ${teamLabel}'s season norm.`;
      }
      if (metric.performance === "unusually_weak") {
        return `${what} was well below ${teamLabel}'s season norm.`;
      }
      return `Shooting efficiency was below ${teamLabel}'s season norm.`;
    }
    case "turnovers":
      if (metric.performance === "unusually_strong") {
        return `${teamLabel} turned the ball over well below its season norm.`;
      }
      if (metric.performance === "above_normal") {
        return `${teamLabel} was more careful with the ball than usual.`;
      }
      if (metric.performance === "unusually_weak") {
        return `${teamLabel} turned the ball over well above its season norm.`;
      }
      return `${teamLabel} turned the ball over more than usual.`;
    case "rebounds":
      if (
        metric.performance === "unusually_strong" ||
        metric.performance === "above_normal"
      ) {
        return strong
          ? `${teamLabel}'s rebounding was well above its season norm.`
          : `${teamLabel}'s rebounding was above its season norm.`;
      }
      return strong
        ? `${teamLabel}'s rebounding was well below its season norm.`
        : `${teamLabel}'s rebounding was below its season norm.`;
    case "assists":
      if (
        metric.performance === "unusually_strong" ||
        metric.performance === "above_normal"
      ) {
        return strong
          ? `${teamLabel}'s assist total was well above its season norm.`
          : `${teamLabel}'s assist total was above its season norm.`;
      }
      return strong
        ? `${teamLabel}'s assist total was well below its season norm.`
        : `${teamLabel}'s assist total was below its season norm.`;
    default:
      return null;
  }
}

function buildFingerprint(
  metrics: GameSeasonMetricComparison[]
): GameSeasonTeamContext["fingerprint"] {
  const byId = new Map(metrics.map((m) => [m.id, m]));
  const dims: Array<{
    id: FingerprintDimensionId;
    label: string;
    metricIds: GameSeasonMetricId[];
    style: "level" | "strength";
    conceptId: string | null;
  }> = [
    {
      id: "offense",
      label: "Offense",
      metricIds: ["points"],
      style: "level",
      conceptId: null,
    },
    {
      id: "shooting",
      label: "Shooting",
      metricIds: ["efg", "ts"],
      style: "level",
      conceptId: "efg",
    },
    {
      id: "ball_security",
      label: "Ball security",
      metricIds: ["turnovers"],
      style: "strength",
      conceptId: null,
    },
    {
      id: "rebounding",
      label: "Rebounding",
      metricIds: ["rebounds"],
      style: "level",
      conceptId: null,
    },
    {
      id: "defense",
      label: "Defense",
      metricIds: ["opponent_points"],
      style: "strength",
      conceptId: null,
    },
  ];

  return dims.map((d) => {
    const present = d.metricIds
      .map((id) => byId.get(id))
      .filter((m): m is GameSeasonMetricComparison => Boolean(m));
    if (!present.length) {
      return {
        id: d.id,
        label: d.label,
        band: "unavailable" as const,
        conceptId: d.conceptId,
      };
    }
    // Prefer the most extreme meaningful performance; else first metric.
    const ranked = [...present].sort((a, b) => {
      const rank = (p: PerformanceBand) =>
        p === "unusually_strong" || p === "unusually_weak"
          ? 2
          : p === "above_normal" || p === "below_normal"
            ? 1
            : 0;
      return rank(b.performance) - rank(a.performance);
    });
    const pick = ranked[0]!;
    return {
      id: d.id,
      label: d.label,
      band: fingerprintLabelFromPerformance(pick.performance, d.style),
      conceptId: pick.conceptId ?? d.conceptId,
    };
  });
}

function emptyTeam(
  side: "home" | "away",
  teamId: string,
  label: string,
  name: string,
  seasonId: string,
  reason: string
): GameSeasonTeamContext {
  return {
    side,
    teamId,
    label,
    name,
    seasonId,
    seasonGamesPlayed: 0,
    available: false,
    unavailableReason: reason,
    metrics: [],
    highlightMetrics: [],
    fingerprint: [],
  };
}

function buildTeamContext(options: {
  side: "home" | "away";
  teamId: string;
  label: string;
  name: string;
  seasonId: string;
  /** Scoreboard points for this team. */
  teamPoints: number;
  /** Scoreboard points allowed. */
  opponentPoints: number;
  totals: GameTeamTotals | null;
  season: TeamSeasonStats | null | undefined;
}): GameSeasonTeamContext {
  const { side, teamId, label, name, seasonId, season, totals } = options;

  if (!season) {
    return emptyTeam(
      side,
      teamId,
      label,
      name,
      seasonId,
      "Same-season team board unavailable."
    );
  }
  if (season.season !== seasonId) {
    return emptyTeam(
      side,
      teamId,
      label,
      name,
      seasonId,
      "Season board does not match this game's season."
    );
  }
  if (season.gamesPlayed < BOX_SCORE_MIN_SEASON_GAMES) {
    return emptyTeam(
      side,
      teamId,
      label,
      name,
      seasonId,
      `Season board below minimum games (${BOX_SCORE_MIN_SEASON_GAMES}).`
    );
  }

  const defs: MetricDef[] = [
    {
      id: "points",
      label: "Points",
      conceptId: null,
      direction: "higher_better",
      tolerance: GAME_SEASON_CONTEXT_TOLERANCE.points,
      gameValue: options.teamPoints,
      seasonAvg: season.ppg,
      formatGame: (v) => formatNumber(v, 0),
      formatAvg: (v) => `${formatNumber(v, 1)} PPG`,
      formatDelta: (d) => `${signed(d, 1)} vs season average`,
    },
    {
      id: "opponent_points",
      label: "Opponent points",
      conceptId: null,
      direction: "lower_better",
      tolerance: GAME_SEASON_CONTEXT_TOLERANCE.opponentPoints,
      gameValue: options.opponentPoints,
      seasonAvg: season.oppPpg,
      formatGame: (v) => formatNumber(v, 0),
      formatAvg: (v) => `${formatNumber(v, 1)} opp PPG`,
      formatDelta: (d) => `${signed(d, 1)} vs season average`,
    },
    {
      id: "efg",
      label: "Effective FG%",
      conceptId: "efg",
      direction: "higher_better",
      tolerance: GAME_SEASON_CONTEXT_TOLERANCE.shootingPct,
      gameValue: totals?.effectiveFieldGoalPct,
      seasonAvg: season.effectiveFieldGoalPct,
      formatGame: (v) => formatPct(v),
      formatAvg: (v) => formatPct(v),
      formatDelta: (d) => `${pctPointsDisplay(d)} vs season average`,
    },
    {
      id: "ts",
      label: "True shooting",
      conceptId: "true_shooting",
      direction: "higher_better",
      tolerance: GAME_SEASON_CONTEXT_TOLERANCE.shootingPct,
      gameValue: totals?.trueShootingPct,
      seasonAvg: season.trueShootingPct,
      formatGame: (v) => formatPct(v),
      formatAvg: (v) => formatPct(v),
      formatDelta: (d) => `${pctPointsDisplay(d)} vs season average`,
    },
    {
      id: "turnovers",
      label: "Turnovers",
      conceptId: null,
      direction: "lower_better",
      tolerance: GAME_SEASON_CONTEXT_TOLERANCE.turnovers,
      gameValue: totals?.turnovers,
      seasonAvg: season.topg,
      formatGame: (v) => formatNumber(v, 0),
      formatAvg: (v) => `${formatNumber(v, 1)} TPG`,
      formatDelta: (d) => `${signed(d, 1)} vs season average`,
    },
    {
      id: "rebounds",
      label: "Rebounds",
      conceptId: null,
      direction: "higher_better",
      tolerance: GAME_SEASON_CONTEXT_TOLERANCE.rebounds,
      gameValue: totals?.rebounds,
      seasonAvg: season.rpg,
      formatGame: (v) => formatNumber(v, 0),
      formatAvg: (v) => `${formatNumber(v, 1)} RPG`,
      formatDelta: (d) => `${signed(d, 1)} vs season average`,
    },
    {
      id: "assists",
      label: "Assists",
      conceptId: null,
      direction: "higher_better",
      tolerance: GAME_SEASON_CONTEXT_TOLERANCE.assists,
      gameValue: totals?.assists,
      seasonAvg: season.apg,
      formatGame: (v) => formatNumber(v, 0),
      formatAvg: (v) => `${formatNumber(v, 1)} APG`,
      formatDelta: (d) => `${signed(d, 1)} vs season average`,
    },
  ];

  const metrics = defs
    .map(buildMetric)
    .filter((m): m is GameSeasonMetricComparison => Boolean(m));

  // Compact surface: points, opp points, then one shooting (prefer eFG), reb, tov.
  const preferredOrder: GameSeasonMetricId[] = [
    "points",
    "opponent_points",
    "efg",
    "ts",
    "rebounds",
    "turnovers",
  ];
  const highlightMetrics: GameSeasonMetricComparison[] = [];
  let sawShooting = false;
  for (const id of preferredOrder) {
    const m = metrics.find((x) => x.id === id);
    if (!m) continue;
    if (id === "efg" || id === "ts") {
      if (sawShooting) continue;
      sawShooting = true;
    }
    highlightMetrics.push(m);
    if (highlightMetrics.length >= 5) break;
  }

  return {
    side,
    teamId,
    label,
    name,
    seasonId,
    seasonGamesPlayed: season.gamesPlayed,
    available: metrics.length > 0,
    metrics,
    highlightMetrics,
    fingerprint: buildFingerprint(metrics),
  };
}

function depthFromTeams(
  home: GameSeasonTeamContext | null,
  away: GameSeasonTeamContext | null
): GameSeasonContextDepth {
  const sides = [home, away].filter(Boolean) as GameSeasonTeamContext[];
  if (!sides.length) return "none";
  const metricCounts = sides.map((s) => s.metrics.length);
  const max = Math.max(...metricCounts, 0);
  if (max === 0) return "none";
  if (max <= 2) return "minimal"; // score only
  if (max < 5) return "partial";
  return "full";
}

function collectFindings(
  home: GameSeasonTeamContext | null,
  away: GameSeasonTeamContext | null
): GameSeasonFinding[] {
  const out: GameSeasonFinding[] = [];
  for (const team of [home, away]) {
    if (!team?.available) continue;
    for (const m of team.metrics) {
      const text = findingText(team.label, m);
      if (!text) continue;
      out.push({
        id: `${team.side}-${m.id}`,
        side: team.side,
        teamLabel: team.label,
        metricId: m.id,
        text,
        performance: m.performance,
      });
    }
  }
  const strength = (p: PerformanceBand) =>
    p === "unusually_strong" || p === "unusually_weak"
      ? 2
      : p === "above_normal" || p === "below_normal"
        ? 1
        : 0;
  out.sort((a, b) => strength(b.performance) - strength(a.performance));
  return out.slice(0, 8);
}

/**
 * Pure analyzer — no I/O. Call from Game Lab with already-loaded boards.
 */
export function buildGameSeasonContext(options: {
  game: Game;
  homeLabel: string;
  awayLabel: string;
  homeName: string;
  awayName: string;
  homeTotals: GameTeamTotals | null;
  awayTotals: GameTeamTotals | null;
  homeSeason: TeamSeasonStats | null | undefined;
  awaySeason: TeamSeasonStats | null | undefined;
}): GameSeasonContext {
  const {
    game,
    homeLabel,
    awayLabel,
    homeName,
    awayName,
    homeTotals,
    awayTotals,
    homeSeason,
    awaySeason,
  } = options;

  const status = (game.status ?? "unknown") as GameStatusKind;
  const base = {
    version: GAME_SEASON_CONTEXT_VERSION,
    gameId: game.id,
    season: game.season,
    methodology: GAME_SEASON_CONTEXT_METHODOLOGY,
  };

  if (!isFinalStatus(status)) {
    const liveLike =
      status === "in_progress" ||
      status === "halftime" ||
      status === "period_break" ||
      status === "delayed";
    return {
      ...base,
      availability: liveLike ? "hidden_live" : "hidden_incomplete",
      availabilityNote: liveLike
        ? "Game vs season context appears after the game is final — live scores are not compared to completed-game averages as if finished."
        : "Game vs season context is available for final games.",
      depth: "none",
      home: null,
      away: null,
      findings: [],
    };
  }

  const home = buildTeamContext({
    side: "home",
    teamId: game.homeTeamId,
    label: homeLabel,
    name: homeName,
    seasonId: game.season,
    teamPoints: game.homeScore,
    opponentPoints: game.awayScore,
    totals: homeTotals,
    season: homeSeason,
  });
  const away = buildTeamContext({
    side: "away",
    teamId: game.awayTeamId,
    label: awayLabel,
    name: awayName,
    seasonId: game.season,
    teamPoints: game.awayScore,
    opponentPoints: game.homeScore,
    totals: awayTotals,
    season: awaySeason,
  });

  const anyReady = home.available || away.available;
  return {
    ...base,
    availability: anyReady ? "ready" : "unavailable",
    availabilityNote: anyReady
      ? null
      : home.unavailableReason ??
        away.unavailableReason ??
        "Season baselines unavailable for this game.",
    depth: depthFromTeams(home, away),
    home,
    away,
    findings: collectFindings(home, away),
  };
}

/** Season Evidence → Game Lab arrival labels. */
export const SEASON_EVIDENCE_ARRIVAL_LABELS: Record<string, string> = {
  largest_win: "Largest win",
  largest_loss: "Largest defeat",
  highest_scoring: "Highest-scoring game",
  lowest_scoring: "Lowest-scoring game",
  best_defense: "Best defensive result",
};

export function parseSeasonEvidenceArrival(search: {
  from?: string | string[] | undefined;
  evidence?: string | string[] | undefined;
}): { from: "evidence"; evidenceId: string; label: string } | null {
  const from = Array.isArray(search.from) ? search.from[0] : search.from;
  const evidence = Array.isArray(search.evidence)
    ? search.evidence[0]
    : search.evidence;
  if (from !== "evidence" || !evidence) return null;
  const label = SEASON_EVIDENCE_ARRIVAL_LABELS[evidence];
  if (!label) return null;
  return { from: "evidence", evidenceId: evidence, label };
}

export function seasonEvidenceGameLabHref(
  gameId: string,
  evidenceCategory?: string | null
): string {
  const path = `/games/${encodeURIComponent(gameId)}`;
  if (!evidenceCategory || !SEASON_EVIDENCE_ARRIVAL_LABELS[evidenceCategory]) {
    return path;
  }
  const q = new URLSearchParams({
    from: "evidence",
    evidence: evidenceCategory,
  });
  return `${path}?${q.toString()}`;
}

/**
 * Game Flow score-timeline resolution.
 *
 * Hierarchy:
 *   A. validated provider linescores
 *   B. PBP-derived timeline with exact final-score conservation (finals)
 *   C. unavailable
 *
 * No synthetic guesses. No approximation.
 */

import type { Game } from "@/data/types";
import type { GamePlayByPlay, PlayByPlayEvent } from "@/data/types/play-by-play";
import {
  computeGameFlowStats,
  elapsedGameTimeSeconds,
  validateTimelineFinalScore,
  type GameFlowStats,
  type ScoreTimelinePoint,
} from "@/lib/history/score-flow";
import { isFinalStatus, type GameStatusKind } from "@/lib/game-status";

export type ScoreTimelineSource =
  | "PROVIDER_LINESCORE"
  | "PBP_DERIVED"
  | "UNAVAILABLE";

export type QuarterScoreSource =
  | "PROVIDER_LINESCORE"
  | "PBP_DERIVED"
  | "UNAVAILABLE";

export type ResolvedPeriodScore = {
  periodIndex: number;
  label: string;
  homePoints: number;
  awayPoints: number;
  homeCumulative: number;
  awayCumulative: number;
  leader: "home" | "away" | "even";
  margin: number;
};

export type ResolvedGameFlowTimeline = {
  available: boolean;
  scoreTimelineSource: ScoreTimelineSource;
  quarterScoreSource: QuarterScoreSource;
  periods: ResolvedPeriodScore[];
  timeline: ScoreTimelinePoint[];
  flowStats: GameFlowStats | null;
  notes: string[];
  /** Internal diagnostic — not for casual UI. */
  internalReason?: string;
};

function periodLabel(index: number, total: number): string {
  if (index < 4) return `Q${index + 1}`;
  if (total === 5 && index === 4) return "OT";
  return `OT${index - 3}`;
}

function periodsFromLinescores(
  homeP: number[],
  awayP: number[]
): ResolvedPeriodScore[] {
  const periods: ResolvedPeriodScore[] = [];
  let homeCum = 0;
  let awayCum = 0;
  for (let i = 0; i < homeP.length; i++) {
    const hp = homeP[i]!;
    const ap = awayP[i]!;
    homeCum += hp;
    awayCum += ap;
    const margin = homeCum - awayCum;
    periods.push({
      periodIndex: i,
      label: periodLabel(i, homeP.length),
      homePoints: hp,
      awayPoints: ap,
      homeCumulative: homeCum,
      awayCumulative: awayCum,
      leader: margin > 0 ? "home" : margin < 0 ? "away" : "even",
      margin,
    });
  }
  return periods;
}

function validateProviderLinescores(
  homeP: number[] | undefined,
  awayP: number[] | undefined,
  officialHome: number,
  officialAway: number,
  requireFinalConservation: boolean
): ResolvedPeriodScore[] | null {
  if (
    !homeP?.length ||
    !awayP?.length ||
    homeP.length !== awayP.length ||
    (homeP.every((n) => n === 0) && awayP.every((n) => n === 0))
  ) {
    return null;
  }
  const periods = periodsFromLinescores(homeP, awayP);
  const last = periods[periods.length - 1]!;
  if (requireFinalConservation) {
    if (
      last.homeCumulative !== officialHome ||
      last.awayCumulative !== officialAway
    ) {
      return null;
    }
  }
  return periods;
}

/**
 * Build a score timeline from canonical PlayByPlayEvent rows.
 * Order is deterministic (array order / actionNumber).
 */
export function timelineFromPlayByPlayEvents(
  events: PlayByPlayEvent[],
  opts: { homeTeamId: string; awayTeamId: string }
): ScoreTimelinePoint[] {
  const sorted = [...events].sort((a, b) => {
    if (a.orderNumber !== b.orderNumber) return a.orderNumber - b.orderNumber;
    return a.actionNumber - b.actionNumber;
  });

  const points: ScoreTimelinePoint[] = [];
  let prevH = 0;
  let prevA = 0;

  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i]!;
    const homeScore = e.scoreHome;
    const awayScore = e.scoreAway;
    const dh = homeScore - prevH;
    const da = awayScore - prevA;

    // Sync corrections that rewind score without emitting a scoring point.
    if (dh === 0 && da === 0) continue;

    const scoredPoints =
      e.points > 0 ? e.points : Math.max(0, dh) + Math.max(0, da);

    // Pure rewinds (negative only) update baseline without a timeline row.
    if (scoredPoints <= 0 && dh <= 0 && da <= 0) {
      prevH = homeScore;
      prevA = awayScore;
      continue;
    }

    // Net scoring progress (including same-clock multi-events).
    if (homeScore === prevH && awayScore === prevA) continue;

    const scoringTeamId =
      dh > 0
        ? opts.homeTeamId
        : da > 0
          ? opts.awayTeamId
          : e.teamId ?? "";

    points.push({
      period: e.period || 1,
      clock: e.clock,
      elapsedGameTime: elapsedGameTimeSeconds(e.period || 1, e.clockSeconds),
      homeScore,
      awayScore,
      margin: homeScore - awayScore,
      scoringTeamId,
      scorerId: e.playerId,
      points: scoredPoints > 0 ? scoredPoints : Math.abs(dh) + Math.abs(da),
      eventIndex: i,
    });

    prevH = homeScore;
    prevA = awayScore;
  }

  return points;
}

/** Flip home/away on a timeline so it matches a game object with inverted sides. */
export function flipTimelineHomeAway(
  timeline: ScoreTimelinePoint[],
  opts: { homeTeamId: string; awayTeamId: string }
): ScoreTimelinePoint[] {
  return timeline.map((p) => {
    let scoringTeamId = p.scoringTeamId;
    if (scoringTeamId === opts.homeTeamId) scoringTeamId = opts.awayTeamId;
    else if (scoringTeamId === opts.awayTeamId) scoringTeamId = opts.homeTeamId;
    return {
      ...p,
      homeScore: p.awayScore,
      awayScore: p.homeScore,
      margin: -p.margin,
      scoringTeamId,
    };
  });
}

/** End-of-period cumulative → per-period points. Exact only. */
export function deriveQuarterScoresFromTimeline(
  timeline: ScoreTimelinePoint[]
): { home: number[]; away: number[] } | null {
  if (!timeline.length) return null;
  const maxPeriod = Math.max(...timeline.map((p) => p.period), 4);
  const home: number[] = [];
  const away: number[] = [];
  let prevH = 0;
  let prevA = 0;

  for (let period = 1; period <= maxPeriod; period++) {
    const inPeriod = timeline.filter((p) => p.period === period);
    const end = inPeriod[inPeriod.length - 1];
    // Empty period → flat cumulative (exact 0-0 period scoring).
    const h = end?.homeScore ?? prevH;
    const a = end?.awayScore ?? prevA;
    home.push(h - prevH);
    away.push(a - prevA);
    prevH = h;
    prevA = a;
  }

  // Trim trailing empty OT slots with no timeline presence
  while (
    home.length > 4 &&
    home[home.length - 1] === 0 &&
    away[away.length - 1] === 0
  ) {
    const lastPeriod = home.length;
    const hadEvents = timeline.some((p) => p.period === lastPeriod);
    if (hadEvents) break;
    home.pop();
    away.pop();
  }

  if (!home.length) return null;
  return { home, away };
}

function emptyUnavailable(
  internalReason: string,
  notes: string[]
): ResolvedGameFlowTimeline {
  return {
    available: false,
    scoreTimelineSource: "UNAVAILABLE",
    quarterScoreSource: "UNAVAILABLE",
    periods: [],
    timeline: [],
    flowStats: null,
    notes,
    internalReason,
  };
}

/** Align Game home/away with NBA PBP scoreHome/scoreAway when the box is inverted. */
export function alignGameWithPbpHomeAway<T extends Game>(
  game: T,
  playByPlay: GamePlayByPlay | null | undefined
): T {
  const events = playByPlay?.events;
  if (!events?.length) return game;
  let maxH = 0;
  let maxA = 0;
  for (const e of events) {
    if (e.scoreHome > maxH) maxH = e.scoreHome;
    if (e.scoreAway > maxA) maxA = e.scoreAway;
  }
  if (maxH === game.homeScore && maxA === game.awayScore) return game;
  if (maxH === game.awayScore && maxA === game.homeScore) {
    return {
      ...game,
      homeTeamId: game.awayTeamId,
      awayTeamId: game.homeTeamId,
      homeTeamAbbr: game.awayTeamAbbr,
      awayTeamAbbr: game.homeTeamAbbr,
      homeTeamName: game.awayTeamName,
      awayTeamName: game.homeTeamName,
      homeProviderTeamId: game.awayProviderTeamId,
      awayProviderTeamId: game.homeProviderTeamId,
      homeScore: game.awayScore,
      awayScore: game.homeScore,
      homePeriodScores: game.awayPeriodScores,
      awayPeriodScores: game.homePeriodScores,
    };
  }
  return game;
}

/**
 * Resolve Game Flow for a game shell + optional PBP.
 * Final games require exact final-score conservation for PBP path.
 * Partial/live streams skip final conservation (caller sets requireFinalConservation=false).
 */
export function resolveGameFlowTimeline(options: {
  game: Pick<
    Game,
    | "homeScore"
    | "awayScore"
    | "homeTeamId"
    | "awayTeamId"
    | "homePeriodScores"
    | "awayPeriodScores"
    | "status"
  >;
  playByPlay?: GamePlayByPlay | null;
  /** Override: when false, skip final conservation (partial streams). */
  requireFinalConservation?: boolean;
}): ResolvedGameFlowTimeline {
  const { game, playByPlay } = options;
  const status = game.status as GameStatusKind | undefined;
  const requireFinal =
    options.requireFinalConservation ??
    (status == null || isFinalStatus(status));

  const linescorePeriods = validateProviderLinescores(
    game.homePeriodScores,
    game.awayPeriodScores,
    game.homeScore,
    game.awayScore,
    requireFinal
  );

  if (linescorePeriods) {
    // Provider path — period table only; margin timeline still prefers PBP when present.
    let timeline: ScoreTimelinePoint[] = [];
    let flowStats: GameFlowStats | null = null;
    if (playByPlay?.events?.length) {
      timeline = timelineFromPlayByPlayEvents(playByPlay.events, {
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
      });
      const conserves =
        !requireFinal ||
        validateTimelineFinalScore(timeline, game.homeScore, game.awayScore);
      if (conserves && timeline.length) {
        const winnerTeamId =
          game.homeScore >= game.awayScore
            ? game.homeTeamId
            : game.awayTeamId;
        flowStats = computeGameFlowStats(timeline, {
          homeTeamId: game.homeTeamId,
          awayTeamId: game.awayTeamId,
          winnerTeamId,
        });
      } else {
        timeline = [];
      }
    }

    return {
      available: true,
      scoreTimelineSource: "PROVIDER_LINESCORE",
      quarterScoreSource: "PROVIDER_LINESCORE",
      periods: linescorePeriods,
      timeline,
      flowStats,
      notes: timeline.length
        ? ["Period scores from provider linescores; margin path from PBP."]
        : ["Period scores from provider linescores."],
    };
  }

  const events = playByPlay?.events ?? [];
  if (!events.length) {
    return emptyUnavailable("PROVIDER_LINESCORE_MISSING_AND_NO_PBP", [
      "Game flow isn't available for this game.",
      "The scoring timeline is incomplete.",
    ]);
  }

  const timeline = timelineFromPlayByPlayEvents(events, {
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
  });

  if (!timeline.length) {
    return emptyUnavailable("PBP_NO_SCORING_EVENTS", [
      "Game flow isn't available for this game.",
      "The scoring timeline is incomplete.",
    ]);
  }

  let oriented = timeline;

  if (requireFinal) {
    if (
      !validateTimelineFinalScore(oriented, game.homeScore, game.awayScore)
    ) {
      // Box/schedule home-away sometimes inverted vs NBA PBP scoreHome/scoreAway.
      if (
        validateTimelineFinalScore(oriented, game.awayScore, game.homeScore)
      ) {
        oriented = flipTimelineHomeAway(oriented, {
          homeTeamId: game.homeTeamId,
          awayTeamId: game.awayTeamId,
        });
      } else {
        return emptyUnavailable("PBP_SCORE_CONSERVATION_FAIL", [
          "Game flow unavailable",
          "Play-by-play scoring for this game isn't complete enough to reconstruct the score timeline.",
        ]);
      }
    }
  }

  const quarters = deriveQuarterScoresFromTimeline(oriented);
  if (!quarters) {
    return emptyUnavailable("PBP_QUARTER_DERIVATION_FAIL", [
      "Game flow isn't available for this game.",
      "The scoring timeline is incomplete.",
    ]);
  }

  if (requireFinal) {
    const sumH = quarters.home.reduce((a, b) => a + b, 0);
    const sumA = quarters.away.reduce((a, b) => a + b, 0);
    if (sumH !== game.homeScore || sumA !== game.awayScore) {
      return emptyUnavailable("PBP_QUARTER_SUM_MISMATCH", [
        "Game flow unavailable",
        "Play-by-play scoring for this game isn't complete enough to reconstruct the score timeline.",
      ]);
    }
  }

  const periods = periodsFromLinescores(quarters.home, quarters.away);
  const winnerTeamId =
    game.homeScore > game.awayScore
      ? game.homeTeamId
      : game.awayScore > game.homeScore
        ? game.awayTeamId
        : game.homeTeamId;
  const flowStats = computeGameFlowStats(oriented, {
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    winnerTeamId,
  });

  return {
    available: true,
    scoreTimelineSource: "PBP_DERIVED",
    quarterScoreSource: "PBP_DERIVED",
    periods,
    timeline: oriented,
    flowStats,
    notes: [
      "Score timeline derived from play-by-play with exact final-score conservation.",
    ],
  };
}

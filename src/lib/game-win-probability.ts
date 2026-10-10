/**
 * Home win probability from scoreboard state and a pregame expectation.
 * Descriptive normal model fit to NBA play-by-play (scripts/fit-win-probability.ts),
 * not Vegas or NBA.com WP.
 */

import { elapsedGameTimeSeconds, type ScoreTimelinePoint } from "@/lib/history/score-flow";
import winProbFit from "@/lib/win-prob-params.json";

const REGULATION_SECONDS = 4 * 12 * 60;

export type WinProbParams = {
  /** Spread of the remaining margin over a full game, in points. Shrinks with the square root of time left. */
  marginSd: number;
  /** Spread that doesn't shrink with the clock, from late fouls and free throws, in points. */
  endSd: number;
  /** Home-court edge in points, for the pregame expectation. */
  homeCourt: number;
  /** Prior weight, in games, on a team's carried-over rating before its own games take over. */
  priorGames: number;
  /** Share of last season's rating carried into the new season. */
  carryover: number;
  /** Points the next possession is worth to the team that gets it. */
  ballValue: number;
};

/** Which side has the ball next: 1 home, -1 away, 0 unknown. */
export type BallSide = 1 | -1 | 0;

type ScoringPlay = { period: number; clock: string | number; homeScored: boolean };

/**
 * Ball after a score: the other team inbounds, unless the same team scores again
 * at the same clock (more free throws or an and-one), so its trip isn't over.
 */
export function nextBall(play: ScoringPlay, next?: ScoringPlay): BallSide {
  const sameTrip =
    next != null &&
    next.homeScored === play.homeScored &&
    next.period === play.period &&
    remainingSeconds(next.period, next.clock) === remainingSeconds(play.period, play.clock);
  return play.homeScored === sameTrip ? 1 : -1;
}

/** Refit each July by .github/workflows/win-probability-refit.yml; see `fit` in the JSON for seasons. */
export const WIN_PROB_PARAMS: WinProbParams = winProbFit.params;

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, error under 1.5e-7). */
function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly =
    t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Game seconds left. Overtime counts only the current period, since another one may never come. */
export function remainingSeconds(period: number, clock: string | number): number {
  let clockSec = 0;
  if (typeof clock === "number") {
    clockSec = clock;
  } else {
    const parts = clock.split(":").map((n) => Number(n));
    if (parts.length === 2 && parts.every((n) => Number.isFinite(n))) {
      clockSec = parts[0]! * 60 + parts[1]!;
    } else if (parts.length === 1 && Number.isFinite(parts[0])) {
      clockSec = parts[0]!;
    }
  }
  clockSec = Math.max(0, clockSec);
  if (period <= 4) {
    return (4 - period) * 12 * 60 + clockSec;
  }
  return clockSec;
}

/**
 * Home win probability with `remSec` game seconds left. `pregameMargin` is the
 * expected full-game home margin; the share of it still to come shrinks with the clock.
 */
export function homeWinProbabilityFromState(
  margin: number,
  remSec: number,
  pregameMargin = 0,
  params: WinProbParams = WIN_PROB_PARAMS,
  ball: BallSide = 0
): number {
  const share = Math.max(0, remSec) / REGULATION_SECONDS;
  if (share === 0 && margin !== 0) return margin > 0 ? 1 : 0;
  const sd = Math.sqrt(params.marginSd ** 2 * share + params.endSd ** 2);
  if (sd <= 0) return margin > 0 ? 1 : margin < 0 ? 0 : 0.5;
  return normalCdf((margin + pregameMargin * share + (share > 0 ? ball * params.ballValue : 0)) / sd);
}

export function homeWinProbabilityAt(
  homeScore: number,
  awayScore: number,
  period: number,
  clock: string,
  pregameMargin = 0,
  params: WinProbParams = WIN_PROB_PARAMS
): number {
  return homeWinProbabilityFromState(
    homeScore - awayScore,
    remainingSeconds(period, clock),
    pregameMargin,
    params
  );
}

/** One finished game, by any consistent team id. */
export type WinProbGameResult = {
  date: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
};

/** Each team's average margin with the home-court edge taken out. */
export function teamRatings(games: readonly WinProbGameResult[], homeCourt: number): Map<string, { sum: number; n: number }> {
  const out = new Map<string, { sum: number; n: number }>();
  const add = (team: string, margin: number) => {
    const row = out.get(team) ?? { sum: 0, n: 0 };
    row.sum += margin;
    row.n += 1;
    out.set(team, row);
  };
  for (const g of games) {
    const homeMargin = g.homeScore - g.awayScore - homeCourt;
    add(g.homeTeamId, homeMargin);
    add(g.awayTeamId, -homeMargin);
  }
  return out;
}

/**
 * Expected home margin before tip-off: home court plus the gap between the two teams'
 * ratings. A rating is the season's average margin so far, blended with last season's
 * carried-over rating weighted as `priorGames` games. Only games before `date` count.
 */
export function pregameHomeMargin(
  input: {
    homeTeamId: string;
    awayTeamId: string;
    date: string;
    seasonGames: readonly WinProbGameResult[];
    priorSeasonGames?: readonly WinProbGameResult[];
  },
  params: WinProbParams = WIN_PROB_PARAMS
): number {
  const before = input.seasonGames.filter((g) => g.date < input.date);
  const now = teamRatings(before, params.homeCourt);
  const prior = input.priorSeasonGames?.length ? teamRatings(input.priorSeasonGames, params.homeCourt) : null;
  const rating = (team: string) => {
    const cur = now.get(team) ?? { sum: 0, n: 0 };
    const p = prior?.get(team);
    const carried = p && p.n > 0 ? (p.sum / p.n) * params.carryover : 0;
    const weight = prior ? params.priorGames : 0;
    const denom = cur.n + weight;
    return denom > 0 ? (cur.sum + carried * weight) / denom : 0;
  };
  return params.homeCourt + rating(input.homeTeamId) - rating(input.awayTeamId);
}

export type WinProbPoint = {
  elapsedGameTime: number;
  period: number;
  clock: string;
  homeScore: number;
  awayScore: number;
  /** Home win probability in [0, 1]. */
  homeWp: number;
  eventIndex: number;
  scorerName?: string | null;
  points: number;
  scoringTeamId: string;
};

export function buildWinProbabilitySeries(
  timeline: ScoreTimelinePoint[],
  options?: {
    finalHomeScore?: number;
    finalAwayScore?: number;
    final?: boolean;
    /** Expected full-game home margin before tip-off. Omitted means an even matchup. */
    pregameMargin?: number;
  }
): WinProbPoint[] {
  if (!timeline.length) return [];
  const pregame = options?.pregameMargin ?? 0;
  const plays = timeline.map((p, i) => {
    const prev = i > 0 ? timeline[i - 1]!.homeScore - timeline[i - 1]!.awayScore : 0;
    const margin = p.homeScore - p.awayScore;
    return margin === prev ? null : { period: p.period, clock: p.clock, homeScored: margin > prev };
  });
  const points: WinProbPoint[] = timeline.map((p, i) => {
    const margin = p.homeScore - p.awayScore;
    const play = plays[i];
    const ball: BallSide = play ? nextBall(play, plays[i + 1] ?? undefined) : 0;
    return {
      elapsedGameTime: p.elapsedGameTime,
      period: p.period,
      clock: p.clock,
      homeScore: p.homeScore,
      awayScore: p.awayScore,
      homeWp: homeWinProbabilityFromState(margin, remainingSeconds(p.period, p.clock), pregame, WIN_PROB_PARAMS, ball),
      eventIndex: p.eventIndex,
      scorerName: p.scorerName,
      points: p.points,
      scoringTeamId: p.scoringTeamId,
    };
  });

  // Force terminal WP to the known winner at the final horn, but only once the game is over.
  const last = points[points.length - 1]!;
  const fh = options?.finalHomeScore ?? last.homeScore;
  const fa = options?.finalAwayScore ?? last.awayScore;
  if (options?.final !== false && fh !== fa) {
    points.push({
      ...last,
      elapsedGameTime: Math.max(elapsedGameTimeSeconds(last.period, 0), last.elapsedGameTime + 1),
      homeWp: fh > fa ? 1 : 0,
      points: 0,
      scorerName: null,
    });
  }

  // Seed tip-off at the pregame estimate when the series starts mid-game.
  const tip = homeWinProbabilityFromState(0, REGULATION_SECONDS, pregame);
  if (points[0]!.elapsedGameTime > 0 || points[0]!.homeWp !== tip) {
    points.unshift({
      elapsedGameTime: 0,
      period: 1,
      clock: "12:00",
      homeScore: 0,
      awayScore: 0,
      homeWp: tip,
      eventIndex: -1,
      scorerName: null,
      points: 0,
      scoringTeamId: "",
    });
  }

  return points;
}

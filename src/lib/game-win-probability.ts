/**
 * Approximate home win probability from scoreboard state.
 * Descriptive logistic model — not Vegas / NBA.com WP.
 */

import type { ScoreTimelinePoint } from "@/lib/history/score-flow";

const SECONDS_PER_POSSESSION = 14.4;
const REGULATION_SECONDS = 4 * 12 * 60;

function remainingSeconds(period: number, clock: string): number {
  const parts = clock.split(":").map((n) => Number(n));
  let clockSec = 0;
  if (parts.length === 2 && parts.every((n) => Number.isFinite(n))) {
    clockSec = parts[0]! * 60 + parts[1]!;
  } else if (parts.length === 1 && Number.isFinite(parts[0])) {
    clockSec = parts[0]!;
  }
  clockSec = Math.max(0, clockSec);
  if (period <= 4) {
    return (4 - period) * 12 * 60 + clockSec;
  }
  return clockSec;
}

function homeWinProbabilityAt(
  homeScore: number,
  awayScore: number,
  period: number,
  clock: string
): number {
  const remSec = Math.max(1, remainingSeconds(period, clock));
  const remPoss = Math.max(0.5, remSec / SECONDS_PER_POSSESSION);
  const scoreDiff = homeScore - awayScore;
  const kappa = 0.35;
  const z = (kappa * scoreDiff) / Math.sqrt(remPoss);
  const ez = Math.exp(Math.max(-20, Math.min(20, z)));
  return ez / (1 + ez);
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
  options?: { finalHomeScore?: number; finalAwayScore?: number }
): WinProbPoint[] {
  if (!timeline.length) return [];
  const points: WinProbPoint[] = timeline.map((p) => ({
    elapsedGameTime: p.elapsedGameTime,
    period: p.period,
    clock: p.clock,
    homeScore: p.homeScore,
    awayScore: p.awayScore,
    homeWp: homeWinProbabilityAt(
      p.homeScore,
      p.awayScore,
      p.period,
      p.clock
    ),
    eventIndex: p.eventIndex,
    scorerName: p.scorerName,
    points: p.points,
    scoringTeamId: p.scoringTeamId,
  }));

  // Force terminal WP to the known winner when final scores are provided.
  const last = points[points.length - 1]!;
  const fh = options?.finalHomeScore ?? last.homeScore;
  const fa = options?.finalAwayScore ?? last.awayScore;
  if (fh !== fa) {
    points.push({
      ...last,
      elapsedGameTime: last.elapsedGameTime + 1,
      homeWp: fh > fa ? 1 : 0,
      points: 0,
      scorerName: null,
    });
  }

  // Seed tip-off at 50% when the series starts mid-game.
  if (points[0]!.elapsedGameTime > 0 || points[0]!.homeWp !== 0.5) {
    points.unshift({
      elapsedGameTime: 0,
      period: 1,
      clock: "12:00",
      homeScore: 0,
      awayScore: 0,
      homeWp: 0.5,
      eventIndex: -1,
      scorerName: null,
      points: 0,
      scoringTeamId: "",
    });
  }

  void REGULATION_SECONDS;
  return points;
}

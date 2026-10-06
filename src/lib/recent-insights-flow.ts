import type { ScoreTimelinePoint } from "@/lib/history/score-flow";
import type { SlateFlowPlay, SlateGameFlow } from "@/lib/recent-insights";

function periodLength(period: number): number {
  return period <= 4 ? 720 : 300;
}

function periodStart(period: number): number {
  let t = 0;
  for (let p = 1; p < period; p++) t += periodLength(p);
  return t;
}

function clockLabel(secondsLeft: number): string {
  const whole = Math.max(0, Math.floor(secondsLeft));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * Scoring plays for the insight engine, in the slate's home/away orientation.
 * `flipped` when the play log's home side is the slate's away team. Returns
 * null unless the last play matches the official final exactly.
 */
export function slateFlowFromTimeline(
  timeline: ScoreTimelinePoint[],
  opts: {
    homeTeamId: string;
    flipped: boolean;
    periods: number;
    finalHome: number;
    finalAway: number;
  }
): SlateGameFlow | null {
  const plays: SlateFlowPlay[] = timeline.map((p) => {
    const home = opts.flipped ? p.awayScore : p.homeScore;
    const away = opts.flipped ? p.homeScore : p.awayScore;
    const left = periodLength(p.period) - (p.elapsedGameTime - periodStart(p.period));
    return {
      t: p.elapsedGameTime,
      period: p.period,
      clock: clockLabel(left),
      home,
      away,
      side: p.scoringTeamId === opts.homeTeamId ? "home" : "away",
      points: p.points,
      scorerId: p.scorerId,
      scorerName: p.scorerName ?? null,
    };
  });
  // Feeds that stall log the missing plays later, all stamped with one clock.
  // Both teams scoring, or more than an and-one plus a free throw, at the same
  // second means that clock is not when the plays happened.
  const atSecond = new Map<number, SlateFlowPlay[]>();
  for (const play of plays) atSecond.set(play.t, [...(atSecond.get(play.t) ?? []), play]);
  for (const group of atSecond.values()) {
    const sides = new Set(group.map((p) => p.side));
    const points = group.reduce((s, p) => s + p.points, 0);
    if (sides.size > 1 || points > 4) for (const p of group) p.clockKnown = false;
  }
  const last = plays.at(-1);
  if (!last || last.home !== opts.finalHome || last.away !== opts.finalAway) return null;
  return { plays, periods: Math.max(4, opts.periods, ...plays.map((p) => p.period)) };
}

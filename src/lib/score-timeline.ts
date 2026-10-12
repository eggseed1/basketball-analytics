import type { PlayByPlayEvent } from "@/data/types/play-by-play";
import type { Game, GameSummary } from "@/data/types";

/** The game as it stood right after one play, stamped with when the play happened. */
export type ScorePoint = {
  at: number;
  status: "pregame" | "in_progress" | "halftime" | "period_break" | "final";
  period: number;
  clock: string;
  detail: string;
  away: number;
  home: number;
  awayPeriods: number[];
  homePeriods: number[];
};

const QUARTERS = ["1st", "2nd", "3rd", "4th"];

function periodName(period: number): string {
  if (period <= 4) return `${QUARTERS[period - 1]} Quarter`;
  return period === 5 ? "OT" : `${period - 4}OT`;
}

function finalDetail(period: number): string {
  if (period <= 4) return "Final";
  return period === 5 ? "Final/OT" : `Final/${period - 4}OT`;
}

function samePoint(a: ScorePoint, b: ScorePoint): boolean {
  return (
    a.status === b.status &&
    a.detail === b.detail &&
    a.away === b.away &&
    a.home === b.home
  );
}

/**
 * One point per play that changes what a scoreboard shows. Play times only
 * move forward here: a play stamped earlier than the one before it (the
 * opening tip often is) takes the earlier play's time.
 */
export function scoreTimeline(events: readonly PlayByPlayEvent[]): ScorePoint[] {
  const out: ScorePoint[] = [];
  let at = -Infinity;
  let period = 0;
  let away = 0;
  let home = 0;
  let awayStart = 0;
  let homeStart = 0;
  const awayDone: number[] = [];
  const homeDone: number[] = [];

  for (const e of events) {
    if (e.wallMs != null && e.wallMs > at) at = e.wallMs;
    if (!Number.isFinite(at)) continue;
    if (!out.length) {
      out.push({
        at: at - 1,
        status: "pregame",
        period: 0,
        clock: "",
        detail: "Pregame",
        away: 0,
        home: 0,
        awayPeriods: [],
        homePeriods: [],
      });
    }
    while (e.period > period) {
      if (period > 0) {
        awayDone[period - 1] = away - awayStart;
        homeDone[period - 1] = home - homeStart;
      }
      awayStart = away;
      homeStart = home;
      period += 1;
    }
    away = Math.max(away, e.scoreAway);
    home = Math.max(home, e.scoreHome);

    const text = e.description.toLowerCase();
    let status: ScorePoint["status"] = "in_progress";
    let detail = `${e.clock} - ${periodName(period)}`;
    let clock = e.clock;
    if (e.actionType === "period" && /^end of (the )?game/.test(text)) {
      status = "final";
      detail = finalDetail(period);
      clock = "0:00";
    } else if (e.actionType === "period" && text.startsWith("end of")) {
      status = period === 2 ? "halftime" : "period_break";
      detail = period === 2 ? "Halftime" : `End of ${periodName(period)}`;
      clock = "0:00";
    }

    const point: ScorePoint = {
      at,
      status,
      period,
      clock,
      detail,
      away,
      home,
      awayPeriods: [...awayDone.slice(0, period - 1), away - awayStart],
      homePeriods: [...homeDone.slice(0, period - 1), home - homeStart],
    };
    const last = out[out.length - 1]!;
    if (samePoint(last, point)) continue;
    if (last.at === point.at && last.status !== "pregame") out[out.length - 1] = point;
    else out.push(point);
  }
  return out;
}

/** Points from `sinceMs` on, plus the one before so any cutoff after `sinceMs` resolves. */
export function recentPoints(points: readonly ScorePoint[], sinceMs: number): ScorePoint[] {
  let start = points.findIndex((p) => p.at >= sinceMs);
  if (start === -1) start = points.length;
  return points.slice(Math.max(0, start - 1));
}

/** Adds fetched points to what the viewer already holds, in time order without repeats. */
export function mergePoints(held: readonly ScorePoint[], fresh: readonly ScorePoint[]): ScorePoint[] {
  if (!held.length) return [...fresh];
  if (!fresh.length) return [...held];
  const from = fresh[0]!.at;
  return [...held.filter((p) => p.at < from), ...fresh];
}

/** The newest point at or before `cutoff`, and when the next one becomes due. */
export function pointAt(
  points: readonly ScorePoint[],
  cutoff: number
): { point: ScorePoint | null; nextAt: number | null } {
  let i = -1;
  while (i + 1 < points.length && points[i + 1]!.at <= cutoff) i++;
  return { point: i >= 0 ? points[i]! : null, nextAt: points[i + 1]?.at ?? null };
}

/**
 * `game` shown as it stood at `point`. Records stay only while they can't
 * give away the result: before the final, a finished game's records already count it.
 */
export function gameAtPoint<T extends Game>(game: T, point: ScorePoint | null): T {
  const status = point?.status ?? "pregame";
  const keepRecords = status === "final" || game.status !== "final";
  const away = point?.away ?? 0;
  const home = point?.home ?? 0;
  const shown: T = {
    ...game,
    status,
    period: point && point.period > 0 ? point.period : undefined,
    displayClock: point?.clock || undefined,
    statusDetail: point?.detail ?? "Pregame",
    awayScore: away,
    homeScore: home,
    awayPeriodScores: point?.awayPeriods.length ? point.awayPeriods : undefined,
    homePeriodScores: point?.homePeriods.length ? point.homePeriods : undefined,
    awayRecord: keepRecords ? game.awayRecord : undefined,
    homeRecord: keepRecords ? game.homeRecord : undefined,
  };
  if ("margin" in shown) {
    const summary = shown as T & GameSummary;
    summary.totalPoints = away + home;
    summary.margin = home - away;
    summary.absMargin = Math.abs(home - away);
  }
  return shown;
}

/**
 * Plays that had happened by `cutoff`, using the same forward-only play times
 * as `scoreTimeline`. Null when no play carries a time, so callers can't cut.
 */
export function eventsThrough<E extends Pick<PlayByPlayEvent, "wallMs">>(
  events: readonly E[],
  cutoff: number
): E[] | null {
  let at = -Infinity;
  const out: E[] = [];
  for (const e of events) {
    if (e.wallMs != null && e.wallMs > at) at = e.wallMs;
    if (at > cutoff) break;
    out.push(e);
  }
  return Number.isFinite(at) ? out : null;
}

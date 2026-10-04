/**
 * Turns play-by-play into located court events and a time-stamped stat log
 * for the game page's shot chart / game chart.
 *
 * Locations come only from the feed (feet from the attacked rim). Rebounds
 * have no spot of their own, so they ride on the miss they followed. Free
 * throws have no spot and appear only in the stat log.
 */

import type { PlayByPlayEvent } from "@/data/types/play-by-play";

export type Side = "home" | "away";

export type CourtKind = "make" | "miss" | "steal" | "turnover" | "foul";

export interface CourtEvent {
  id: string;
  kind: CourtKind;
  /** Team credited with the marker (stealer for steals, fouler for fouls). */
  side: Side;
  /** Team attacking the basket the location is measured from. */
  attack: Side;
  x: number;
  y: number;
  t: number;
  period: number;
  clock: string;
  description: string;
  /** Player credited with the marker: shooter, stealer, ball handler on a turnover, or fouler. */
  playerId: string | null;
  /** Passer on an assisted make. */
  assistId: string | null;
  /** Blocker on a blocked miss. */
  blockId: string | null;
  /** Player who lost the ball on a steal. */
  stolenFromId: string | null;
  three: boolean;
  assisted: boolean;
  blockedBy: Side | null;
  rebound: { side: Side; offensive: boolean; playerId: string | null } | null;
}

export type StatKey =
  | "fgm"
  | "fga"
  | "tpm"
  | "tpa"
  | "ftm"
  | "fta"
  | "oreb"
  | "dreb"
  | "ast"
  | "stl"
  | "blk"
  | "tov"
  | "pf";

export interface StatTick {
  t: number;
  period: number;
  side: Side;
  stat: StatKey;
  playerId: string | null;
}

export interface ScoreMark {
  t: number;
  home: number;
  away: number;
  period: number;
  clock: string;
}

export type SideTally = Record<StatKey, number>;

export function elapsedSeconds(period: number, clockSeconds: number): number {
  if (period <= 4) return (period - 1) * 720 + (720 - clockSeconds);
  return 2880 + (period - 5) * 300 + (300 - clockSeconds);
}

export function periodStart(period: number): number {
  return period <= 4 ? (period - 1) * 720 : 2880 + (period - 5) * 300;
}

export function periodName(period: number): string {
  if (period <= 4) return `Q${period}`;
  return period === 5 ? "OT" : `${period - 4}OT`;
}

const other = (s: Side): Side => (s === "home" ? "away" : "home");

/** Learn which feed team id is home/away from who the scoreboard credits. */
export function teamSides(
  events: PlayByPlayEvent[],
  homeLabel: string,
  awayLabel: string
): Map<string, Side> {
  const votes = new Map<string, { home: number; away: number }>();
  let home = 0;
  let away = 0;
  for (const e of events) {
    const key = e.teamId ?? e.teamTricode;
    if (key && (e.scoreHome !== home || e.scoreAway !== away)) {
      const v = votes.get(key) ?? { home: 0, away: 0 };
      if (e.scoreHome > home && e.scoreAway === away) v.home++;
      if (e.scoreAway > away && e.scoreHome === home) v.away++;
      votes.set(key, v);
    }
    if (e.scoreHome + e.scoreAway >= home + away) {
      home = e.scoreHome;
      away = e.scoreAway;
    }
  }
  const sides = new Map<string, Side>();
  for (const [key, v] of votes) {
    if (v.home !== v.away) sides.set(key, v.home > v.away ? "home" : "away");
  }
  for (const e of events) {
    const key = e.teamId ?? e.teamTricode;
    if (!key || sides.has(key)) continue;
    if (e.teamTricode === homeLabel) sides.set(key, "home");
    else if (e.teamTricode === awayLabel) sides.set(key, "away");
  }
  return sides;
}

export function buildCourtEvents(
  events: PlayByPlayEvent[],
  homeLabel: string,
  awayLabel: string
): { court: CourtEvent[]; ticks: StatTick[]; marks: ScoreMark[]; fga: number } {
  const sides = teamSides(events, homeLabel, awayLabel);
  const court: CourtEvent[] = [];
  const ticks: StatTick[] = [];
  const marks: ScoreMark[] = [];
  let fga = 0;
  let offense: Side | null = null;
  let lastMiss: CourtEvent | null = null;
  let missPending = false;

  for (const e of events) {
    if (!e.period) continue;
    const t = elapsedSeconds(e.period, e.clockSeconds);
    marks.push({ t, home: e.scoreHome, away: e.scoreAway, period: e.period, clock: e.clock });
    const side = sides.get(e.teamId ?? e.teamTricode ?? "");
    const d = e.description;
    const hasLoc = e.locX != null && e.locY != null;
    const base = {
      id: e.id,
      x: e.locX ?? 0,
      y: e.locY ?? 0,
      t,
      period: e.period,
      clock: e.clock,
      description: d,
      playerId: e.playerId || null,
      assistId: null,
      blockId: null,
      stolenFromId: null,
      three: false,
      assisted: false,
      blockedBy: null,
      rebound: null,
    };
    const second = e.secondPlayerId || null;
    const tick = (s: Side, stat: StatKey, playerId: string | null = e.playerId || null) =>
      ticks.push({ t, period: e.period, side: s, stat, playerId });

    if (e.isFieldGoal && e.shotResult) {
      fga++;
      if (!side) continue;
      const made = e.shotResult === "Made";
      const three = e.actionType === "3pt";
      const assisted = made && /\bassists?\)/i.test(d);
      const blocked = !made && /\bblocks\b/i.test(d);
      tick(side, "fga");
      if (made) tick(side, "fgm");
      if (three) tick(side, "tpa");
      if (three && made) tick(side, "tpm");
      if (assisted) tick(side, "ast", second);
      if (blocked) tick(other(side), "blk", second);
      lastMiss = null;
      missPending = !made;
      if (hasLoc) {
        const ev: CourtEvent = {
          ...base,
          kind: made ? "make" : "miss",
          side,
          attack: side,
          assistId: assisted ? second : null,
          blockId: blocked ? second : null,
          three,
          assisted,
          blockedBy: blocked ? other(side) : null,
        };
        court.push(ev);
        if (!made) lastMiss = ev;
      }
      offense = made ? other(side) : side;
      continue;
    }

    if (e.actionType === "freethrow" && e.shotResult) {
      if (!side) continue;
      tick(side, "fta");
      if (e.shotResult === "Made") tick(side, "ftm");
      const set = /(\d)\s+of\s+(\d)/i.exec(d);
      const lastOfSet = !set || set[1] === set[2];
      lastMiss = null;
      missPending = e.shotResult !== "Made" && lastOfSet;
      if (e.shotResult === "Made" && lastOfSet) offense = other(side);
      continue;
    }

    if (/\brebound\b/i.test(d)) {
      if (!side) continue;
      const offensive = /\boffensive\b/i.test(d);
      if (!/\bteam rebound\b/i.test(d)) tick(side, offensive ? "oreb" : "dreb");
      if (lastMiss && missPending) lastMiss.rebound = { side, offensive, playerId: e.playerId || null };
      lastMiss = null;
      missPending = false;
      offense = side;
      continue;
    }

    if (/\bturnover\b/i.test(d)) {
      if (!side) continue;
      tick(side, "tov");
      const stolen = /\bsteals?\)/i.test(d);
      if (stolen) tick(other(side), "stl", second);
      if (hasLoc) {
        court.push(
          stolen
            ? { ...base, kind: "steal", side: other(side), attack: side, playerId: second, stolenFromId: base.playerId }
            : { ...base, kind: "turnover", side, attack: side }
        );
      }
      offense = other(side);
      continue;
    }

    if (/\bfoul\b/i.test(d) && !/\btechnical\b/i.test(d)) {
      if (!side) continue;
      tick(side, "pf");
      if (hasLoc) {
        const attack = /\bshooting foul\b/i.test(d)
          ? other(side)
          : /\boffensive (foul|charge)\b/i.test(d)
            ? side
            : (offense ?? other(side));
        court.push({ ...base, kind: "foul", side, attack });
      }
    }
  }

  court.sort((a, b) => a.t - b.t);
  return { court, ticks, marks, fga };
}

const EMPTY: SideTally = {
  fgm: 0,
  fga: 0,
  tpm: 0,
  tpa: 0,
  ftm: 0,
  fta: 0,
  oreb: 0,
  dreb: 0,
  ast: 0,
  stl: 0,
  blk: 0,
  tov: 0,
  pf: 0,
};

export function tallyAt(
  ticks: StatTick[],
  cutoff: number | null,
  keep: (tick: StatTick) => boolean = () => true
): Record<Side, SideTally> {
  const out = { home: { ...EMPTY }, away: { ...EMPTY } };
  for (const k of ticks) {
    if (cutoff != null && k.t > cutoff) continue;
    if (!keep(k)) continue;
    out[k.side][k.stat]++;
  }
  return out;
}

export function playerTally(
  ticks: StatTick[],
  cutoff: number | null,
  playerId: string,
  keep: (tick: StatTick) => boolean = () => true
): SideTally {
  const out = { ...EMPTY };
  for (const k of ticks) {
    if (cutoff != null && k.t > cutoff) continue;
    if (k.playerId !== playerId || !keep(k)) continue;
    out[k.stat]++;
  }
  return out;
}

export type ShotZone = "rim" | "paint" | "mid" | "corner3" | "arc3";

export const SHOT_ZONES: { id: ShotZone; label: string }[] = [
  { id: "rim", label: "Restricted area" },
  { id: "paint", label: "Paint" },
  { id: "mid", label: "Mid-range" },
  { id: "corner3", label: "Corner 3" },
  { id: "arc3", label: "Above the break 3" },
];

/**
 * Zone from the feed's spot. Two or three comes from the feed's own shot
 * value, so a spot logged a foot off the line never flips a shot's value.
 */
export function shotZone(c: CourtEvent): ShotZone | null {
  if (c.kind !== "make" && c.kind !== "miss") return null;
  if (c.three) return Math.abs(c.x) >= 21 && c.y <= 9 ? "corner3" : "arc3";
  if (Math.hypot(c.x, c.y) <= 4) return "rim";
  if (Math.abs(c.x) <= 8 && c.y <= 13.75) return "paint";
  return "mid";
}

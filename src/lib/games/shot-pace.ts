/**
 * Average game-clock seconds from the start of a possession until the first
 * field-goal attempt. Possessions that never take an FGA are left out. Free
 * throws do not count as the first shot.
 */

import type { PlayByPlayEvent } from "@/data/types/play-by-play";

import { teamSides, type Side } from "./court-events";

const other = (s: Side): Side => (s === "home" ? "away" : "home");

function periodLengthSeconds(period: number): number {
  return period <= 4 ? 720 : 300;
}

function isLastFreeThrow(description: string): boolean {
  const set = /(\d)\s+of\s+(\d)/i.exec(description);
  return !set || set[1] === set[2];
}

export type ShotPace = {
  /** Mean game-clock seconds to first FGA; null when no sample. */
  averageSeconds: number | null;
  home: number | null;
  away: number | null;
  samples: number;
  homeSamples: number;
  awaySamples: number;
};

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Walk play-by-play, open a possession on change-of-possession events, and
 * record clock elapsed until that side's first field-goal attempt.
 */
export function computeShotPace(
  events: PlayByPlayEvent[],
  homeLabel: string,
  awayLabel: string
): ShotPace {
  const sides = teamSides(events, homeLabel, awayLabel);
  const all: number[] = [];
  const bySide: Record<Side, number[]> = { home: [], away: [] };

  let pending: { side: Side; startClock: number; period: number } | null = null;
  let shotTaken = false;
  let lastPeriod = 0;

  const begin = (side: Side, startClock: number, period: number) => {
    pending = { side, startClock, period };
    shotTaken = false;
  };

  const recordIfReady = (side: Side, clockSeconds: number, period: number) => {
    if (!pending || shotTaken) return;
    if (pending.side !== side || pending.period !== period) return;
    const delta = pending.startClock - clockSeconds;
    if (delta < 0 || !Number.isFinite(delta)) return;
    all.push(delta);
    bySide[side].push(delta);
    shotTaken = true;
  };

  for (const e of events) {
    if (!e.period) continue;
    if (e.period !== lastPeriod) {
      pending = null;
      shotTaken = false;
      lastPeriod = e.period;
    }

    const d = e.description ?? "";
    if (e.actionType === "period" || /^end of\b/i.test(d)) {
      pending = null;
      shotTaken = false;
      continue;
    }

    const side = sides.get(e.teamId ?? e.teamTricode ?? "");
    if (!side) continue;
    const opp = other(side);

    if (e.isFieldGoal && e.shotResult) {
      if (!pending) {
        // Tip / inbound missing from the feed: treat period open as the start.
        begin(side, periodLengthSeconds(e.period), e.period);
      }
      recordIfReady(side, e.clockSeconds, e.period);
      if (e.shotResult === "Made") begin(opp, e.clockSeconds, e.period);
      continue;
    }

    if (e.actionType === "freethrow" && e.shotResult) {
      if (e.shotResult === "Made" && isLastFreeThrow(d)) {
        begin(opp, e.clockSeconds, e.period);
      }
      continue;
    }

    if (/\brebound\b/i.test(d)) {
      if (/\boffensive\b/i.test(d)) continue;
      begin(side, e.clockSeconds, e.period);
      continue;
    }

    if (/\bturnover\b/i.test(d)) {
      begin(opp, e.clockSeconds, e.period);
      continue;
    }

    if (e.actionType === "jumpball" || /\bjump\s*ball\b/i.test(d)) {
      begin(side, e.clockSeconds, e.period);
    }
  }

  return {
    averageSeconds: mean(all),
    home: mean(bySide.home),
    away: mean(bySide.away),
    samples: all.length,
    homeSamples: bySide.home.length,
    awaySamples: bySide.away.length,
  };
}

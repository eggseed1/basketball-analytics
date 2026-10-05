/**
 * Quarter standouts and the possession battle, built only from play-by-play
 * that has already happened. A quarter counts as finished when the feed logs
 * its "End of" marker or the game is final; anything else is "so far".
 */

import type { PlayByPlayEvent } from "@/data/types/play-by-play";

import { periodName, teamSides, type Side } from "./court-events";

const other = (s: Side): Side => (s === "home" ? "away" : "home");

export interface PlayerLine {
  playerId: string;
  name: string;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fgm: number;
  fga: number;
  ftm: number;
  fta: number;
  /** NBA efficiency: PTS + REB + AST + STL + BLK - missed FG - missed FT - TOV. */
  eff: number;
}

export interface QuarterStandouts {
  period: number;
  label: string;
  finished: boolean;
  home: PlayerLine | null;
  away: PlayerLine | null;
  homePoints: number;
  awayPoints: number;
}

export interface SideBattle {
  oreb: number;
  dreb: number;
  tov: number;
  stl: number;
  fga: number;
  fta: number;
  /** Own offensive rebounds plus opponent turnovers. */
  extraChances: number;
  secondChancePoints: number;
  pointsOffTurnovers: number;
}

export interface PossessionBattle {
  home: SideBattle;
  away: SideBattle;
  /** Positive favors home: (home extra chances) - (away extra chances). */
  net: number;
  byPeriod: { period: number; label: string; finished: boolean; net: number }[];
}

export interface LiveInsights {
  quarters: QuarterStandouts[];
  battle: PossessionBattle | null;
}

const emptyLine = (playerId: string, name: string): PlayerLine => ({
  playerId,
  name,
  pts: 0,
  reb: 0,
  ast: 0,
  stl: 0,
  blk: 0,
  tov: 0,
  fgm: 0,
  fga: 0,
  ftm: 0,
  fta: 0,
  eff: 0,
});

const emptyBattle = (): SideBattle => ({
  oreb: 0,
  dreb: 0,
  tov: 0,
  stl: 0,
  fga: 0,
  fta: 0,
  extraChances: 0,
  secondChancePoints: 0,
  pointsOffTurnovers: 0,
});

function efficiency(l: PlayerLine): number {
  return l.pts + l.reb + l.ast + l.stl + l.blk - (l.fga - l.fgm) - (l.fta - l.ftm) - l.tov;
}

/** Best line by efficiency, then points. Nobody qualifies with eff <= 0 or no points. */
function standout(lines: PlayerLine[]): PlayerLine | null {
  let best: PlayerLine | null = null;
  for (const l of lines) {
    if (l.eff <= 0 && l.pts <= 0) continue;
    if (!best || l.eff > best.eff || (l.eff === best.eff && l.pts > best.pts)) best = l;
  }
  return best;
}

export function buildLiveInsights(
  events: PlayByPlayEvent[],
  options: {
    homeLabel: string;
    awayLabel: string;
    final: boolean;
    names?: Map<string, string>;
  }
): LiveInsights {
  const { homeLabel, awayLabel, final, names } = options;
  const sides = teamSides(events, homeLabel, awayLabel);
  const ended = new Set<number>();
  const perPeriod = new Map<number, { lines: Map<string, { side: Side; line: PlayerLine }>; pts: Record<Side, number>; chances: Record<Side, number> }>();
  const battle = { home: emptyBattle(), away: emptyBattle() };
  let sawStat = false;

  // Possession flags, per side, cleared once the other side has the ball.
  const secondChance: Record<Side, boolean> = { home: false, away: false };
  const offTurnover: Record<Side, boolean> = { home: false, away: false };
  const clear = (s: Side) => {
    secondChance[s] = false;
    offTurnover[s] = false;
  };

  const periodBucket = (p: number) => {
    let b = perPeriod.get(p);
    if (!b) {
      b = { lines: new Map(), pts: { home: 0, away: 0 }, chances: { home: 0, away: 0 } };
      perPeriod.set(p, b);
    }
    return b;
  };
  const lineFor = (p: number, side: Side, playerId: string | null | undefined, fallbackName: string | null) => {
    if (!playerId) return null;
    const b = periodBucket(p);
    let row = b.lines.get(playerId);
    if (!row) {
      row = { side, line: emptyLine(playerId, names?.get(playerId) ?? fallbackName ?? playerId) };
      b.lines.set(playerId, row);
    }
    return row.line;
  };
  const score = (side: Side, period: number, points: number) => {
    if (points <= 0) return;
    periodBucket(period).pts[side] += points;
    if (secondChance[side]) battle[side].secondChancePoints += points;
    if (offTurnover[side]) battle[side].pointsOffTurnovers += points;
  };

  let lastPeriod = 0;
  for (const e of events) {
    if (!e.period) continue;
    if (e.period !== lastPeriod) {
      clear("home");
      clear("away");
      lastPeriod = e.period;
    }
    const d = e.description ?? "";
    if (e.actionType === "period" || /^end of\b/i.test(d)) {
      if (/^end of\b/i.test(d)) ended.add(e.period);
      continue;
    }
    const side = sides.get(e.teamId ?? e.teamTricode ?? "");
    if (!side) continue;
    const opp = other(side);
    const second = e.secondPlayerId || null;

    if (e.isFieldGoal && e.shotResult) {
      sawStat = true;
      clear(opp);
      const made = e.shotResult === "Made";
      battle[side].fga++;
      const me = lineFor(e.period, side, e.playerId, e.playerName);
      if (me) {
        me.fga++;
        if (made) {
          me.fgm++;
          me.pts += e.points;
        }
      }
      if (made) {
        score(side, e.period, e.points);
        if (/\bassists?\)/i.test(d)) {
          const a = lineFor(e.period, side, second, null);
          if (a) a.ast++;
        }
      } else if (/\bblocks\b/i.test(d)) {
        const b = lineFor(e.period, opp, second, null);
        if (b) b.blk++;
      }
      continue;
    }

    if (e.actionType === "freethrow" && e.shotResult) {
      sawStat = true;
      clear(opp);
      const made = e.shotResult === "Made";
      battle[side].fta++;
      const me = lineFor(e.period, side, e.playerId, e.playerName);
      if (me) {
        me.fta++;
        if (made) {
          me.ftm++;
          me.pts += e.points;
        }
      }
      if (made) score(side, e.period, e.points);
      const set = /(\d)\s+of\s+(\d)/i.exec(d);
      if (made && (!set || set[1] === set[2])) clear(side);
      continue;
    }

    if (/\brebound\b/i.test(d)) {
      sawStat = true;
      const offensive = /\boffensive\b/i.test(d);
      if (offensive) secondChance[side] = true;
      else clear(opp);
      // Team rebounds move the ball but aren't in box score rebound totals.
      if (/\bteam rebound\b/i.test(d)) continue;
      if (offensive) {
        battle[side].oreb++;
        periodBucket(e.period).chances[side]++;
      } else {
        battle[side].dreb++;
      }
      const me = lineFor(e.period, side, e.playerId, e.playerName);
      if (me) me.reb++;
      continue;
    }

    if (/\bturnover\b/i.test(d)) {
      sawStat = true;
      battle[side].tov++;
      periodBucket(e.period).chances[opp]++;
      clear(side);
      offTurnover[opp] = true;
      secondChance[opp] = false;
      const me = lineFor(e.period, side, e.playerId, e.playerName);
      if (me) me.tov++;
      if (/\bsteals?\)/i.test(d)) {
        battle[opp].stl++;
        const s = lineFor(e.period, opp, second, null);
        if (s) s.stl++;
      }
    }
  }

  const periods = [...perPeriod.keys()].sort((a, b) => a - b);
  const maxPeriod = periods.at(-1) ?? 0;
  const isFinished = (p: number) => final || ended.has(p) || p < maxPeriod;

  const quarters: QuarterStandouts[] = periods.map((p) => {
    const b = perPeriod.get(p)!;
    const home: PlayerLine[] = [];
    const away: PlayerLine[] = [];
    for (const { side, line } of b.lines.values()) {
      line.eff = efficiency(line);
      (side === "home" ? home : away).push(line);
    }
    return {
      period: p,
      label: periodName(p),
      finished: isFinished(p),
      home: standout(home),
      away: standout(away),
      homePoints: b.pts.home,
      awayPoints: b.pts.away,
    };
  });

  if (!sawStat) return { quarters, battle: null };
  battle.home.extraChances = battle.home.oreb + battle.away.tov;
  battle.away.extraChances = battle.away.oreb + battle.home.tov;
  return {
    quarters,
    battle: {
      ...battle,
      net: battle.home.extraChances - battle.away.extraChances,
      byPeriod: periods.map((p) => {
        const c = perPeriod.get(p)!.chances;
        return { period: p, label: periodName(p), finished: isFinished(p), net: c.home - c.away };
      }),
    },
  };
}

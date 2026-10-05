import {
  K,
  SHOT_ZONES,
  addVec,
  compareOnOff,
  fourFactors,
  offSplit,
  ratings,
  shotZone,
  subVec,
  type FourFactors,
  type LeagueRates,
  type OnOffComparison,
  type OnOffSplit,
  type OnOffView,
  type Ratings,
  type ShotZone,
} from "@/lib/on-off/metrics";
import type { LeagueOnOffFile, TeamOnOffFile, TeamOnOffPlayer } from "@/lib/on-off/types";

/** About 500 minutes on the floor. Below this, league ranks are left blank. */
export const PERCENTILE_MIN_POSS = 2000;
/** Under this, a split mostly reflects noise and gets a small-sample tag. */
export const SMALL_SAMPLE_POSS = 1000;
/** Two-sided 95% range from one standard error. */
export const Z95 = 1.96;

const VIEW_INDEX: Record<OnOffView, 0 | 1 | 2> = { clean: 0, all: 1, clutch: 2 };

const possOf = (s: OnOffSplit) => s.o[K.poss]! + s.d[K.poss]!;
const minutesOf = (s: OnOffSplit) => (s.o[K.sec]! + s.d[K.sec]!) / 60;
const oppStartersAvg = (s: OnOffSplit) => {
  const n = possOf(s);
  return n > 0 ? (s.o[K.oppStarters]! + s.d[K.oppStarters]!) / n : null;
};
const both = (s: OnOffSplit, key: keyof typeof K) => s.o[K[key]]! + s.d[K[key]]!;
const avgOf = (sum: number, n: number) => (n >= 1 ? sum / n : null);

/** Average season DRBL/100 of the players around him, and of the opponents. */
export type QualityContext = {
  teammatesOn: number | null;
  teammatesOff: number | null;
  opponentsOn: number | null;
  opponentsOff: number | null;
};

function qualityContext(on: OnOffSplit, off: OnOffSplit, rating: number | null): QualityContext {
  const onPoss = possOf(on);
  const ownOn = both(on, "ownQ");
  const ownOnN = both(on, "ownQN");
  return {
    teammatesOn:
      rating == null ? avgOf(ownOn, ownOnN) : avgOf(ownOn - rating * onPoss, ownOnN - onPoss),
    teammatesOff: avgOf(both(off, "ownQ"), both(off, "ownQN")),
    opponentsOn: avgOf(both(on, "oppQ"), both(on, "oppQN")),
    opponentsOff: avgOf(both(off, "oppQ"), both(off, "oppQN")),
  };
}

export type OnOffPlayerRow = {
  id: string;
  name: string;
  gp: number;
  starts: number;
  poss: number;
  minutes: number;
  /** Share of team possessions with the player on the floor. */
  onShare: number | null;
  cmp: OnOffComparison;
  oppStartersOn: number | null;
  oppStartersOff: number | null;
  quality: QualityContext;
  /** League percentile of the on-minus-off net gap, 0 to 100. */
  netDiffPercentile: number | null;
  smallSample: boolean;
};

function percentileOf(
  league: LeagueOnOffFile | null,
  view: OnOffView,
  value: number | null,
  poss: number
): number | null {
  if (!league || value == null || poss < PERCENTILE_MIN_POSS) return null;
  const i = VIEW_INDEX[view];
  const pool = league.players
    .filter((p) => p.poss[i] >= PERCENTILE_MIN_POSS && p.netDiff[i] != null)
    .map((p) => p.netDiff[i]!);
  if (pool.length < 20) return null;
  const below = pool.filter((x) => x < value).length;
  const equal = pool.filter((x) => x === value).length;
  return Math.round(((below + equal / 2) / pool.length) * 100);
}

export function leagueRates(league: LeagueOnOffFile | null, view: OnOffView): LeagueRates {
  return league?.rates[view] ?? { fg3Pct: 0.36, ftPct: 0.78, pppVar: 1.4 };
}

export function playerRow(
  file: TeamOnOffFile,
  league: LeagueOnOffFile | null,
  player: TeamOnOffPlayer,
  view: OnOffView
): OnOffPlayerRow {
  const team = file.team[view];
  const on = player[view];
  const off = offSplit(team, on);
  const cmp = compareOnOff(team, on, leagueRates(league, view));
  const poss = possOf(on);
  const teamPoss = possOf(team);
  return {
    id: player.id,
    name: player.name,
    gp: player.gp,
    starts: player.starts,
    poss,
    minutes: minutesOf(on),
    onShare: teamPoss > 0 ? poss / teamPoss : null,
    cmp,
    oppStartersOn: oppStartersAvg(on),
    oppStartersOff: oppStartersAvg(off),
    quality: qualityContext(on, off, player.rating),
    netDiffPercentile: percentileOf(league, view, cmp.netDiff, poss),
    smallSample: poss < SMALL_SAMPLE_POSS || possOf(off) < SMALL_SAMPLE_POSS,
  };
}

export function teamPlayerRows(
  file: TeamOnOffFile,
  league: LeagueOnOffFile | null,
  view: OnOffView
): OnOffPlayerRow[] {
  return file.players
    .filter((p) => possOf(p[view]) > 0)
    .map((p) => playerRow(file, league, p, view));
}

export type ZoneRow = { zone: ShotZone; label: string; freq: number | null; pct: number | null };

export type SideDetail = {
  on: FourFactors;
  off: FourFactors;
  shotsOn: ZoneRow[];
  shotsOff: ZoneRow[];
};

const zones = (v: number[]): ZoneRow[] =>
  SHOT_ZONES.map(({ zone, label }) => ({ zone, label, ...shotZone(v, zone) }));

export type WowyStates = {
  both: Ratings;
  aOnly: Ratings;
  bOnly: Ratings;
  neither: Ratings;
};

export function wowy(
  file: TeamOnOffFile,
  league: LeagueOnOffFile | null,
  a: string,
  b: string,
  view: OnOffView
): WowyStates | null {
  const pa = file.players.find((p) => p.id === a);
  const pb = file.players.find((p) => p.id === b);
  const pair = file.pairs.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
  if (!pa || !pb || !pair) return null;
  const rates = leagueRates(league, view);
  const both = pair[view];
  const aOnly = offSplit(pa[view], both);
  const bOnly = offSplit(pb[view], both);
  const team = file.team[view];
  const neither: OnOffSplit = {
    o: subVec(subVec(team.o, pa[view].o), pb[view].o),
    d: subVec(subVec(team.d, pa[view].d), pb[view].d),
  };
  addVec(neither.o, both.o);
  addVec(neither.d, both.d);
  return {
    both: ratings(both, rates),
    aOnly: ratings(aOnly, rates),
    bOnly: ratings(bOnly, rates),
    neither: ratings(neither, rates),
  };
}

export type TeammateRow = {
  id: string;
  name: string;
  sharedPoss: number;
  states: WowyStates;
};

export type LineupRow = {
  ids: string[];
  names: string[];
  poss: number;
  minutes: number;
  ratings: Ratings;
  offense: FourFactors;
  defense: FourFactors;
};

/** Clutch lineup samples are tiny; below this a lineup row is noise. */
export const CLUTCH_LINEUP_MIN_POSS = 20;

export function lineupRows(
  file: TeamOnOffFile,
  league: LeagueOnOffFile | null,
  view: OnOffView
): LineupRow[] {
  const names = new Map(file.players.map((p) => [p.id, p.name]));
  const rates = leagueRates(league, view);
  const minPoss = view === "clutch" ? CLUTCH_LINEUP_MIN_POSS : 1;
  return file.lineups
    .filter((l) => possOf(l[view]) >= minPoss)
    .map((l) => ({
      ids: l.ids,
      names: l.ids.map((id) => names.get(id) ?? id),
      poss: possOf(l[view]),
      minutes: minutesOf(l[view]),
      ratings: ratings(l[view], rates),
      offense: fourFactors(l[view].o),
      defense: fourFactors(l[view].d),
    }))
    .sort((a, b) => b.poss - a.poss);
}

export type PlayerOnOffDetail = {
  row: OnOffPlayerRow;
  offense: SideDetail;
  defense: SideDetail;
  teammates: TeammateRow[];
  lineups: LineupRow[];
};

export function playerDetail(
  file: TeamOnOffFile,
  league: LeagueOnOffFile | null,
  playerId: string,
  view: OnOffView,
  options: { teammates?: number; lineups?: number } = {}
): PlayerOnOffDetail | null {
  const player = file.players.find((p) => p.id === playerId);
  if (!player || possOf(player[view]) === 0) return null;
  const on = player[view];
  const off = offSplit(file.team[view], on);
  const names = new Map(file.players.map((p) => [p.id, p.name]));

  const teammates = file.pairs
    .filter((p) => p.a === playerId || p.b === playerId)
    .map((p) => {
      const mate = p.a === playerId ? p.b : p.a;
      const states = wowy(file, league, playerId, mate, view);
      return states
        ? { id: mate, name: names.get(mate) ?? mate, sharedPoss: possOf(p[view]), states }
        : null;
    })
    .filter((x): x is TeammateRow => x != null)
    .sort((a, b) => b.sharedPoss - a.sharedPoss)
    .slice(0, options.teammates ?? 8);

  return {
    row: playerRow(file, league, player, view),
    offense: { on: fourFactors(on.o), off: fourFactors(off.o), shotsOn: zones(on.o), shotsOff: zones(off.o) },
    defense: { on: fourFactors(on.d), off: fourFactors(off.d), shotsOn: zones(on.d), shotsOff: zones(off.d) },
    teammates,
    lineups: lineupRows(file, league, view)
      .filter((l) => l.ids.includes(playerId))
      .slice(0, options.lineups ?? 5),
  };
}

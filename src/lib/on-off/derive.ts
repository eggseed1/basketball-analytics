import {
  K,
  SHOT_ZONES,
  addVec,
  compareOnOff,
  fourFactors,
  fromRatingVec,
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
import type { LeagueOnOffFile, OnOffViews, TeamOnOffFile, TeamOnOffPlayer } from "@/lib/on-off/types";

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
  // Playoff teams play 4 to 28 games, so a league pool would compare unlike samples.
  if (league.phase === "playoffs") return null;
  const i = VIEW_INDEX[view];
  const pool = league.players
    .filter((p) => p.poss[i] >= PERCENTILE_MIN_POSS && p.netDiff[i] != null)
    .map((p) => p.netDiff[i]!);
  if (pool.length < 20) return null;
  // The pool is stored to one decimal; compare at the same precision so ties count as ties.
  const v = Math.round(value * 10) / 10;
  const below = pool.filter((x) => x < v).length;
  const equal = pool.filter((x) => x === v).length;
  return Math.round(((below + equal / 2) / pool.length) * 100);
}

export function leagueRates(league: LeagueOnOffFile | null, view: OnOffView): LeagueRates {
  return league?.rates[view] ?? { fg3Pct: 0.36, ftPct: 0.78, pppVar: 1.4 };
}

/** Team totals over his first to last game with the team, so off never counts games he wasn't there. */
export function stintTeam(file: TeamOnOffFile, player: TeamOnOffPlayer, view: OnOffView): OnOffSplit {
  return (player.stint?.team ?? file.team)[view];
}

export function playerRow(
  file: TeamOnOffFile,
  league: LeagueOnOffFile | null,
  player: TeamOnOffPlayer,
  view: OnOffView
): OnOffPlayerRow {
  const team = stintTeam(file, player, view);
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

function sharedSplit(views: OnOffViews | undefined, view: OnOffView): OnOffSplit | null {
  const s = views?.[view];
  return s ? { o: fromRatingVec(s.o), d: fromRatingVec(s.d) } : null;
}

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
  const swapped = pair.a !== a;
  const aShared = sharedSplit(swapped ? pair.shared?.b : pair.shared?.a, view) ?? pa[view];
  const bShared = sharedSplit(swapped ? pair.shared?.a : pair.shared?.b, view) ?? pb[view];
  const aOnly = offSplit(aShared, both);
  const bOnly = offSplit(bShared, both);
  const team = sharedSplit(pair.shared?.team, view) ?? file.team[view];
  const neither: OnOffSplit = {
    o: subVec(subVec(team.o, aShared.o), bShared.o),
    d: subVec(subVec(team.d, aShared.d), bShared.d),
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

/** A teammate whose share of the floor changes when the player sits. */
export type ReplacementRow = {
  id: string;
  name: string;
  /** Share of team possessions he played while the player was on. */
  shareWith: number;
  /** Share of team possessions he played while the player sat. */
  shareWithout: number;
  /** Possessions he played while the player sat. */
  possWithout: number;
};

/**
 * Who plays more when he sits, from exact pair counts. Only teammates with a
 * pair row (both above the pair minimum) can appear.
 */
export function replacements(
  file: TeamOnOffFile,
  playerId: string,
  view: OnOffView,
  limit = 5
): ReplacementRow[] {
  const player = file.players.find((p) => p.id === playerId);
  if (!player) return [];
  const onPoss = possOf(player[view]);
  const offPoss = possOf(stintTeam(file, player, view)) - onPoss;
  if (onPoss <= 0 || offPoss <= 0) return [];
  const byId = new Map(file.players.map((p) => [p.id, p]));
  return file.pairs
    .filter((p) => p.a === playerId || p.b === playerId)
    .map((pair) => {
      const mateIsA = pair.a !== playerId;
      const mate = byId.get(mateIsA ? pair.a : pair.b);
      if (!mate) return null;
      const together = possOf(pair[view]);
      const mateInStint = sharedSplit(mateIsA ? pair.shared?.a : pair.shared?.b, view) ?? mate[view];
      const without = possOf(mateInStint) - together;
      return {
        id: mate.id,
        name: mate.name,
        shareWith: together / onPoss,
        shareWithout: without / offPoss,
        possWithout: without,
      };
    })
    .filter((r): r is ReplacementRow => r != null && r.shareWithout > r.shareWith)
    .sort((a, b) => b.shareWithout - b.shareWith - (a.shareWithout - a.shareWith))
    .slice(0, limit);
}

export type TrendPoint = {
  /** Game number in the team's schedule, from 1. */
  game: number;
  date: string;
  opp: string;
  home: boolean;
  played: boolean;
  /** Season-to-date on net minus off net, once both sides have possessions. */
  swing: number | null;
  onPoss: number;
  offPoss: number;
};

/** The season-to-date line starts once both sides pass this; earlier values swing wildly. */
export const TREND_MIN_POSS = 250;

const net100 = (oPoss: number, oPts: number, dPoss: number, dPts: number) =>
  oPoss > 0 && dPoss > 0 ? (100 * oPts) / oPoss - (100 * dPts) / dPoss : null;

/** Season-to-date swing after each team game. Clutch has no game log. */
export function onOffTrend(
  file: TeamOnOffFile,
  playerId: string,
  view: OnOffView
): TrendPoint[] {
  if (view === "clutch") return [];
  const player = file.players.find((p) => p.id === playerId);
  if (!player) return [];
  const mine = new Map(player.log[view].map((r) => [r[0], r]));
  const first = player.stint?.first ?? 0;
  const last = player.stint?.last ?? file.schedule.length - 1;
  const on = [0, 0, 0, 0];
  const team = [0, 0, 0, 0];
  const out: TrendPoint[] = [];
  for (const row of file.teamLog[view]) {
    if (row[0] < first || row[0] > last) continue;
    const game = file.schedule[row[0]];
    if (!game) continue;
    const p = mine.get(row[0]);
    for (let k = 0; k < 4; k++) {
      team[k]! += row[k + 1]!;
      if (p) on[k]! += p[k + 1]!;
    }
    const off = team.map((x, k) => x - on[k]!);
    const onPoss = on[0]! + on[2]!;
    const offPoss = off[0]! + off[2]!;
    const onNet = net100(on[0]!, on[1]!, on[2]!, on[3]!);
    const offNet = net100(off[0]!, off[1]!, off[2]!, off[3]!);
    const enough = onPoss >= TREND_MIN_POSS && offPoss >= TREND_MIN_POSS;
    out.push({
      game: row[0] + 1,
      date: game.date,
      opp: game.opp,
      home: game.home,
      played: p != null,
      swing: enough && onNet != null && offNet != null ? onNet - offNet : null,
      onPoss,
      offPoss,
    });
  }
  return out;
}

export type PlayerOnOffDetail = {
  row: OnOffPlayerRow;
  offense: SideDetail;
  defense: SideDetail;
  teammates: TeammateRow[];
  lineups: LineupRow[];
  replacements: ReplacementRow[];
  trend: TrendPoint[];
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
  const off = offSplit(stintTeam(file, player, view), on);
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
    replacements: replacements(file, playerId, view),
    trend: onOffTrend(file, playerId, view),
  };
}

export type OnOffSeasonView = {
  poss: number;
  offPoss: number;
  swing: number | null;
  range: [number, number] | null;
  luckAdj: number | null;
  percentile: number | null;
  smallSample: boolean;
};

/** One team-season of a player's on/off, read from the league summary file. */
export type OnOffSeasonRow = {
  season: string;
  phase: LeagueOnOffFile["phase"];
  teamId: string;
  gp: number;
  views: Record<OnOffView, OnOffSeasonView>;
};

const VIEWS: readonly OnOffView[] = ["clean", "all", "clutch"];

export function leagueSeasonRows(league: LeagueOnOffFile, ids: ReadonlySet<string>): OnOffSeasonRow[] {
  return league.players
    .filter((p) => ids.has(p.id))
    .sort((a, b) => b.poss[1] - a.poss[1])
    .map((p) => ({
      season: league.season,
      phase: league.phase,
      teamId: p.teamId,
      gp: p.gp,
      views: Object.fromEntries(
        VIEWS.map((view) => {
          const i = VIEW_INDEX[view];
          const poss = p.poss[i];
          const offPoss = p.offPoss[i];
          return [
            view,
            {
              poss,
              offPoss,
              swing: p.netDiff[i],
              range: p.netDiffRange[i],
              luckAdj: p.netLuckAdjDiff[i],
              percentile: percentileOf(league, view, p.netDiff[i], poss),
              smallSample: poss < SMALL_SAMPLE_POSS || offPoss < SMALL_SAMPLE_POSS,
            },
          ];
        })
      ) as Record<OnOffView, OnOffSeasonView>,
    }));
}

import type { Game } from "@/data/types";
import type { TeamGameBox } from "@/lib/team-game-box";

export type TeamVizView =
  | "race"
  | "margin"
  | "ratings"
  | "pace"
  | "shooting"
  | "possessions"
  | "defense"
  | "luck"
  | "homeroad"
  | "close"
  | "quarters";

export const TEAM_VIZ_VIEWS: Array<{ id: TeamVizView; label: string }> = [
  { id: "race", label: "Race tracker" },
  { id: "margin", label: "Scoring margin" },
  { id: "ratings", label: "Offense vs defense" },
  { id: "pace", label: "Pace vs net rating" },
  { id: "shooting", label: "Three-point diet" },
  { id: "possessions", label: "Possession battle" },
  { id: "defense", label: "Defensive pressure" },
  { id: "luck", label: "Luck" },
  { id: "homeroad", label: "Home vs road" },
  { id: "close", label: "Close games" },
  { id: "quarters", label: "Quarter by quarter" },
];

export const TEAM_VIZ_DEFAULT_VIEW: TeamVizView = "race";

export function parseTeamVizView(raw: string | null | undefined): TeamVizView {
  return TEAM_VIZ_VIEWS.some((v) => v.id === raw) ? (raw as TeamVizView) : TEAM_VIZ_DEFAULT_VIEW;
}

export type TeamVizConference = "East" | "West";

export function parseTeamVizConference(raw: string | null | undefined): TeamVizConference | null {
  const v = raw?.toLowerCase();
  return v === "east" ? "East" : v === "west" ? "West" : null;
}

/** ESPN team ids. Conference alignment has been fixed since 2004-05. */
const EAST_ESPN_IDS = new Set(["1", "2", "4", "5", "8", "11", "14", "15", "17", "18", "19", "20", "27", "28", "30"]);

/** The 30 franchises use ESPN ids 1–30; All-Star and exhibition sides use others. */
const NBA_ESPN_ID = /^([1-9]|[12]\d|30)$/;

export function conferenceForEspnTeamId(id: string): TeamVizConference {
  return EAST_ESPN_IDS.has(id) ? "East" : "West";
}

export type TeamVizBoxStats = {
  games: number;
  /** Possessions per 48 minutes. */
  pace: number;
  ortg: number;
  drtg: number;
  net: number;
  efg: number;
  oppEfg: number;
  tovPct: number;
  oppTovPct: number;
  orebPct: number;
  drebPct: number;
  ftRate: number;
  threeRate: number;
  oppThreeRate: number;
};

export type TeamVizRow = {
  teamId: string;
  abbr: string;
  name: string;
  conference: TeamVizConference;
  games: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  homeWins: number;
  homeLosses: number;
  roadWins: number;
  roadLosses: number;
  closeWins: number;
  closeLosses: number;
  /** Average net points per game in Q1–Q4 over games with linescores. Overtime excluded. */
  quarterNet: [number, number, number, number] | null;
  quarterGames: number;
  /** Null when no game in the season has archived team box totals. */
  box: TeamVizBoxStats | null;
};

export const CLOSE_GAME_MARGIN = 5;
/** Morey's exponent for basketball Pythagorean win expectation. */
const PYTHAG_EXPONENT = 13.91;

type BoxAccumulator = {
  games: number;
  poss: number;
  minutes: number;
  pts: number;
  oppPts: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  fta: number;
  oreb: number;
  dreb: number;
  tov: number;
  oppFgm: number;
  oppFga: number;
  oppTpm: number;
  oppTpa: number;
  oppFta: number;
  oppOreb: number;
  oppDreb: number;
  oppTov: number;
};

function emptyBox(): BoxAccumulator {
  return {
    games: 0, poss: 0, minutes: 0, pts: 0, oppPts: 0,
    fgm: 0, fga: 0, tpm: 0, tpa: 0, fta: 0, oreb: 0, dreb: 0, tov: 0,
    oppFgm: 0, oppFga: 0, oppTpm: 0, oppTpa: 0, oppFta: 0, oppOreb: 0, oppDreb: 0, oppTov: 0,
  };
}

/** Basketball-Reference's team possession estimate. */
function possessions(own: TeamGameBox, opp: TeamGameBox): number {
  const glass = own.oreb + opp.dreb;
  const orebShare = glass > 0 ? own.oreb / glass : 0;
  return own.fga + 0.4 * own.fta - 1.07 * orebShare * (own.fga - own.fgm) + own.tov;
}

function addBox(acc: BoxAccumulator, own: TeamGameBox, opp: TeamGameBox, minutes: number) {
  acc.games += 1;
  acc.poss += (possessions(own, opp) + possessions(opp, own)) / 2;
  acc.minutes += minutes;
  acc.pts += own.pts;
  acc.oppPts += opp.pts;
  acc.fgm += own.fgm;
  acc.fga += own.fga;
  acc.tpm += own.tpm;
  acc.tpa += own.tpa;
  acc.fta += own.fta;
  acc.oreb += own.oreb;
  acc.dreb += own.dreb;
  acc.tov += own.tov;
  acc.oppFgm += opp.fgm;
  acc.oppFga += opp.fga;
  acc.oppTpm += opp.tpm;
  acc.oppTpa += opp.tpa;
  acc.oppFta += opp.fta;
  acc.oppOreb += opp.oreb;
  acc.oppDreb += opp.dreb;
  acc.oppTov += opp.tov;
}

function finishBox(a: BoxAccumulator): TeamVizBoxStats | null {
  if (!a.games || a.poss <= 0 || a.fga <= 0 || a.oppFga <= 0) return null;
  const ortg = (100 * a.pts) / a.poss;
  const drtg = (100 * a.oppPts) / a.poss;
  return {
    games: a.games,
    pace: (48 * a.poss) / a.minutes,
    ortg,
    drtg,
    net: ortg - drtg,
    efg: (a.fgm + 0.5 * a.tpm) / a.fga,
    oppEfg: (a.oppFgm + 0.5 * a.oppTpm) / a.oppFga,
    tovPct: a.tov / (a.fga + 0.44 * a.fta + a.tov),
    oppTovPct: a.oppTov / (a.oppFga + 0.44 * a.oppFta + a.oppTov),
    orebPct: a.oreb / (a.oreb + a.oppDreb),
    drebPct: a.dreb / (a.dreb + a.oppOreb),
    ftRate: a.fta / a.fga,
    threeRate: a.tpa / a.fga,
    oppThreeRate: a.oppTpa / a.oppFga,
  };
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Box rows are keyed by Eastern date; snapshot game dates can sit a day off
 * for late tips. A box only counts when both teams' points match the score.
 */
function boxPair(
  game: Game,
  home: Map<string, TeamGameBox>,
  away: Map<string, TeamGameBox>
): [TeamGameBox, TeamGameBox] | null {
  for (const offset of [0, -1, 1]) {
    const date = shiftDate(game.gameDate, offset);
    const h = home.get(date);
    const a = away.get(date);
    if (h && a && h.pts === game.homeScore && a.pts === game.awayScore) return [h, a];
  }
  return null;
}

type Tally = {
  teamId: string;
  abbr: string;
  name: string;
  games: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  homeWins: number;
  homeLosses: number;
  roadWins: number;
  roadLosses: number;
  closeWins: number;
  closeLosses: number;
  quarterSum: [number, number, number, number];
  quarterGames: number;
  box: BoxAccumulator;
};

/** Regular-season finals only; Cup final and play-in don't count toward records. */
export function buildTeamVizRows(
  games: readonly Game[],
  boxesFor: (espnTeamId: string) => Map<string, TeamGameBox>
): TeamVizRow[] {
  const tallies = new Map<string, Tally>();
  const boxCache = new Map<string, Map<string, TeamGameBox>>();
  const boxes = (id: string) => {
    let m = boxCache.get(id);
    if (!m) {
      m = boxesFor(id);
      boxCache.set(id, m);
    }
    return m;
  };
  const tally = (id: string, abbr: string | undefined, name: string | undefined): Tally => {
    let t = tallies.get(id);
    if (!t) {
      t = {
        teamId: id, abbr: abbr ?? id, name: name ?? abbr ?? id,
        games: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0,
        homeWins: 0, homeLosses: 0, roadWins: 0, roadLosses: 0, closeWins: 0, closeLosses: 0,
        quarterSum: [0, 0, 0, 0], quarterGames: 0, box: emptyBox(),
      };
      tallies.set(id, t);
    }
    return t;
  };

  for (const g of games) {
    if (g.gameType !== "regular" || g.status !== "final" || g.cupChampionship) continue;
    if (!NBA_ESPN_ID.test(g.homeTeamId) || !NBA_ESPN_ID.test(g.awayTeamId)) continue;
    if (g.homeScore === g.awayScore) continue;

    const home = tally(g.homeTeamId, g.homeTeamAbbr, g.homeTeamName);
    const away = tally(g.awayTeamId, g.awayTeamAbbr, g.awayTeamName);
    const homeWon = g.homeScore > g.awayScore;
    const close = Math.abs(g.homeScore - g.awayScore) <= CLOSE_GAME_MARGIN;

    for (const [t, own, opp, won, isHome] of [
      [home, g.homeScore, g.awayScore, homeWon, true],
      [away, g.awayScore, g.homeScore, !homeWon, false],
    ] as const) {
      t.games += 1;
      t.pointsFor += own;
      t.pointsAgainst += opp;
      if (won) t.wins += 1;
      else t.losses += 1;
      if (isHome) {
        if (won) t.homeWins += 1;
        else t.homeLosses += 1;
      } else if (won) t.roadWins += 1;
      else t.roadLosses += 1;
      if (close) {
        if (won) t.closeWins += 1;
        else t.closeLosses += 1;
      }
    }

    const hq = g.homePeriodScores;
    const aq = g.awayPeriodScores;
    if (hq && aq && hq.length >= 4 && hq.length === aq.length) {
      for (let q = 0; q < 4; q++) {
        home.quarterSum[q] += hq[q]! - aq[q]!;
        away.quarterSum[q] += aq[q]! - hq[q]!;
      }
      home.quarterGames += 1;
      away.quarterGames += 1;
    }

    const pair = boxPair(g, boxes(g.homeTeamId), boxes(g.awayTeamId));
    if (pair) {
      const periods = Math.max(4, hq?.length ?? 4, aq?.length ?? 4);
      const minutes = 48 + 5 * (periods - 4);
      addBox(home.box, pair[0], pair[1], minutes);
      addBox(away.box, pair[1], pair[0], minutes);
    }
  }

  return [...tallies.values()].map((t) => ({
    teamId: t.teamId,
    abbr: t.abbr,
    name: t.name,
    conference: conferenceForEspnTeamId(t.teamId),
    games: t.games,
    wins: t.wins,
    losses: t.losses,
    pointsFor: t.pointsFor,
    pointsAgainst: t.pointsAgainst,
    homeWins: t.homeWins,
    homeLosses: t.homeLosses,
    roadWins: t.roadWins,
    roadLosses: t.roadLosses,
    closeWins: t.closeWins,
    closeLosses: t.closeLosses,
    quarterNet: t.quarterGames
      ? (t.quarterSum.map((v) => v / t.quarterGames) as [number, number, number, number])
      : null,
    quarterGames: t.quarterGames,
    box: finishBox(t.box),
  }));
}

function ratio(w: number, l: number): number | null {
  return w + l > 0 ? w / (w + l) : null;
}

export function expectedWins(row: TeamVizRow): number | null {
  if (!row.games || row.pointsFor <= 0 || row.pointsAgainst <= 0) return null;
  const pf = row.pointsFor ** PYTHAG_EXPONENT;
  const pa = row.pointsAgainst ** PYTHAG_EXPONENT;
  return (row.games * pf) / (pf + pa);
}

export type TeamVizAxis = {
  label: string;
  value: (row: TeamVizRow) => number | null;
  format: (v: number) => string;
  /** Lower is better: the axis is flipped so better always points up or right. */
  invert?: boolean;
};

export type TeamVizScatterSpec = {
  title: string;
  blurb: string;
  x: TeamVizAxis;
  y: TeamVizAxis;
  needsBox: boolean;
  /** "average" draws league-average crosshairs; "diagonal" draws y = x. */
  reference: "average" | "diagonal";
  /** Sidebar ranking. */
  rank: TeamVizAxis & { higherIsBetter: boolean };
  quadrants?: { topRight: string; topLeft: string; bottomRight: string; bottomLeft: string };
};

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const winPct = (v: number) => v.toFixed(3).replace(/^0/, "");
const one = (v: number) => v.toFixed(1);
const signed = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`;

export const TEAM_VIZ_SCATTERS: Partial<Record<TeamVizView, TeamVizScatterSpec>> = {
  ratings: {
    title: "Offense vs defense",
    blurb: "Points scored and allowed per 100 possessions. Up and to the right is good at both ends.",
    x: { label: "Offensive rating", value: (r) => r.box?.ortg ?? null, format: one },
    y: { label: "Defensive rating (lower is better)", value: (r) => r.box?.drtg ?? null, format: one, invert: true },
    needsBox: true,
    reference: "average",
    rank: { label: "Net rating", value: (r) => r.box?.net ?? null, format: signed, higherIsBetter: true },
    quadrants: { topRight: "Two-way", topLeft: "Defense first", bottomRight: "Offense first", bottomLeft: "Struggling" },
  },
  pace: {
    title: "Pace vs net rating",
    blurb: "Possessions per 48 minutes against net rating. Fast teams aren't automatically good ones.",
    x: { label: "Pace (possessions per 48)", value: (r) => r.box?.pace ?? null, format: one },
    y: { label: "Net rating", value: (r) => r.box?.net ?? null, format: signed },
    needsBox: true,
    reference: "average",
    rank: { label: "Pace", value: (r) => r.box?.pace ?? null, format: one, higherIsBetter: true },
    quadrants: { topRight: "Fast and good", topLeft: "Slow and good", bottomRight: "Fast and losing", bottomLeft: "Slow and losing" },
  },
  shooting: {
    title: "Three-point diet",
    blurb: "Share of shots taken from three against effective field goal percentage.",
    x: { label: "3PA rate (share of FGA from three)", value: (r) => r.box?.threeRate ?? null, format: pct },
    y: { label: "Effective FG%", value: (r) => r.box?.efg ?? null, format: pct },
    needsBox: true,
    reference: "average",
    rank: { label: "3PA rate", value: (r) => r.box?.threeRate ?? null, format: pct, higherIsBetter: true },
  },
  possessions: {
    title: "Possession battle",
    blurb: "Teams that protect the ball and crash the offensive glass get extra shots. Right means fewer turnovers.",
    x: { label: "Turnover % (lower is better)", value: (r) => r.box?.tovPct ?? null, format: pct, invert: true },
    y: { label: "Offensive rebound %", value: (r) => r.box?.orebPct ?? null, format: pct },
    needsBox: true,
    reference: "average",
    rank: { label: "Offensive rebound %", value: (r) => r.box?.orebPct ?? null, format: pct, higherIsBetter: true },
  },
  defense: {
    title: "Defensive pressure",
    blurb: "How well opponents shoot against how often they turn it over. Up and to the right is the stingiest defense.",
    x: { label: "Opponent turnover %", value: (r) => r.box?.oppTovPct ?? null, format: pct },
    y: { label: "Opponent effective FG% (lower is better)", value: (r) => r.box?.oppEfg ?? null, format: pct, invert: true },
    needsBox: true,
    reference: "average",
    rank: { label: "Opponent eFG%", value: (r) => r.box?.oppEfg ?? null, format: pct, higherIsBetter: false },
  },
  luck: {
    title: "Luck",
    blurb: "Actual wins against the wins expected from points scored and allowed. Above the line won more than the margin suggests.",
    x: { label: "Expected wins (from point margin)", value: expectedWins, format: one },
    y: { label: "Actual wins", value: (r) => (r.games ? r.wins : null), format: (v) => String(Math.round(v)) },
    needsBox: false,
    reference: "diagonal",
    rank: {
      label: "Wins above expected",
      value: (r) => {
        const e = expectedWins(r);
        return e == null ? null : r.wins - e;
      },
      format: signed,
      higherIsBetter: true,
    },
  },
  homeroad: {
    title: "Home vs road",
    blurb: "Win percentage at home against on the road. Distance above the line is the size of the home edge.",
    x: { label: "Road win %", value: (r) => ratio(r.roadWins, r.roadLosses), format: winPct },
    y: { label: "Home win %", value: (r) => ratio(r.homeWins, r.homeLosses), format: winPct },
    needsBox: false,
    reference: "diagonal",
    rank: {
      label: "Home minus road",
      value: (r) => {
        const h = ratio(r.homeWins, r.homeLosses);
        const a = ratio(r.roadWins, r.roadLosses);
        return h == null || a == null ? null : h - a;
      },
      format: (v) => `${v < 0 ? "-" : "+"}${winPct(Math.abs(v))}`,
      higherIsBetter: true,
    },
  },
  close: {
    title: "Close games",
    blurb: `Record in games decided by ${CLOSE_GAME_MARGIN} points or fewer against overall win percentage. Small samples swing a lot.`,
    x: { label: "Overall win %", value: (r) => ratio(r.wins, r.losses), format: winPct },
    y: { label: `Win % in games decided by ≤${CLOSE_GAME_MARGIN}`, value: (r) => ratio(r.closeWins, r.closeLosses), format: winPct },
    needsBox: false,
    reference: "diagonal",
    rank: { label: "Close-game win %", value: (r) => ratio(r.closeWins, r.closeLosses), format: winPct, higherIsBetter: true },
  },
};

export function teamVizNeedsBox(view: TeamVizView): boolean {
  return TEAM_VIZ_SCATTERS[view]?.needsBox ?? false;
}

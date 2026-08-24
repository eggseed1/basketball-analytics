import type { PlayerSeason } from "@/data/types";
import { formatNumber, formatPct } from "@/lib/format";
import {
  canonicalSeasonFromEspnYear,
  espnYearFromCanonicalSeason,
} from "@/data/providers/nba/season";
import { hasValidDrblEstimate } from "@/data/queries/percentiles";
import {
  cardStintsForSeason,
  type PlayerCardStint,
} from "@/lib/player-team-context";

export type StatComp = {
  playerId: string;
  playerName: string;
  season: string;
  teamName?: string;
  teamKey?: string;
  stints?: PlayerCardStint[];
  value: number;
  display: string;
  /** Comp value minus focal value. */
  delta: number;
  /** 0-100 vs the same peer pool as the ranking (inverted when lower is better). */
  percentile: number;
};

/**
 * Structural row shape for leaderboard / percentile pickers.
 * Accepts full PlayerSeason and slim ExplorePlayerBoardRow alike.
 */
export type StatCompRow = {
  playerId: string;
  playerName: string;
  season: string;
  gamesPlayed: number;
  points: number;
  assists: number;
  rebounds: number;
  offensiveRebounds?: number;
  defensiveRebounds?: number;
  steals?: number;
  blocks?: number;
  turnovers?: number;
  minutes?: number;
  personalFouls?: number;
  plusMinus?: number;
  gamesStarted?: number;
  fieldGoalsAttempted?: number;
  threePointersAttempted?: number;
  freeThrowsAttempted?: number;
  sdv100?: number;
  shotMaking100?: number;
  fieldGoalPct?: number;
  twoPointPct?: number;
  threePointPct?: number;
  freeThrowPct?: number;
  trueShootingPct?: number;
  effectiveFieldGoalPct?: number;
  threePointAttemptRate?: number;
  freeThrowRate?: number;
  usagePct?: number;
  assistPct?: number;
  turnoverPct?: number;
  offensiveReboundPct?: number;
  defensiveReboundPct?: number;
  reboundPct?: number;
  stealPct?: number;
  blockPct?: number;
  pie?: number;
  per?: number;
  ows?: number;
  dws?: number;
  winShares?: number;
  winSharesPer48?: number;
  obpm?: number;
  dbpm?: number;
  bpm?: number;
  vorp?: number;
  offensiveRating?: number;
  defensiveRating?: number;
  netRating?: number;
  darkoDpm?: number;
  darkoOff?: number;
  darkoDef?: number;
  dpm?: number;
  oDpm?: number;
  dDpm?: number;
  lebron?: number;
  oLebron?: number;
  dLebron?: number;
  winsAdded?: number;
  drbl100?: number;
  rawAbilityRate?: number;
  drblPossessions?: number;
  r1Points?: number | null;
  r1WinEquivalents?: number | null;
  drblO?: number;
  drblD?: number;
  drblP?: number;
  drblLn?: number;
  drblB?: number;
  hustleDeflections?: number;
  hustleContestedShots?: number;
  hustleScreenAssists?: number;
  hustleChargesDrawn?: number;
  hustleLooseBallsRecovered?: number;
  hustleBoxOuts?: number;
};

export function shiftCanonicalSeason(season: string, deltaYears: number): string {
  return canonicalSeasonFromEspnYear(
    espnYearFromCanonicalSeason(season) + deltaYears
  );
}

function perGame(row: StatCompRow, key: keyof StatCompRow): number {
  const raw = row[key];
  const total = typeof raw === "number" ? raw : 0;
  return total / Math.max(1, row.gamesPlayed);
}

function hustleCompPerGame(
  row: StatCompRow,
  key:
    | "hustleDeflections"
    | "hustleContestedShots"
    | "hustleScreenAssists"
    | "hustleChargesDrawn"
    | "hustleLooseBallsRecovered"
    | "hustleBoxOuts"
): number | null {
  const total = row[key];
  if (total == null || !Number.isFinite(total)) return null;
  return total / Math.max(1, row.gamesPlayed);
}

type MetricPicker = {
  pick: (row: StatCompRow) => number | null;
  format: (value: number) => string;
};

/** Value extractors keyed by percentile metric id. */
export const METRIC_PICKERS: Record<string, MetricPicker> = {
  drbl100: {
    pick: (r) =>
      hasValidDrblEstimate(r as PlayerSeason) && Number.isFinite(r.drbl100)
        ? (r.drbl100 as number)
        : null,
    format: (v) => formatNumber(v, 2),
  },
  r1Points: {
    pick: (r) =>
      hasValidDrblEstimate(r as PlayerSeason) &&
      r.r1Points != null &&
      Number.isFinite(r.r1Points)
        ? r.r1Points
        : null,
    format: (v) => formatNumber(v, 1),
  },
  r1WinEq: {
    pick: (r) =>
      hasValidDrblEstimate(r as PlayerSeason) &&
      r.r1WinEquivalents != null &&
      Number.isFinite(r.r1WinEquivalents)
        ? r.r1WinEquivalents
        : null,
    format: (v) => formatNumber(v, 1),
  },
  drblO: {
    pick: (r) =>
      hasValidDrblEstimate(r as PlayerSeason) && Number.isFinite(r.drblO)
        ? (r.drblO as number)
        : null,
    format: (v) => formatNumber(v, 2),
  },
  drblD: {
    pick: (r) =>
      hasValidDrblEstimate(r as PlayerSeason) && Number.isFinite(r.drblD)
        ? (r.drblD as number)
        : null,
    format: (v) => formatNumber(v, 2),
  },
  darko: {
    pick: (r) => {
      if (r.darkoDpm != null && Number.isFinite(r.darkoDpm)) return r.darkoDpm;
      if (r.dpm != null && Number.isFinite(r.dpm) && r.dpm !== 0) return r.dpm;
      return null;
    },
    format: (v) => formatNumber(v, 2),
  },
  lebron: {
    pick: (r) => (r.lebron != null && Number.isFinite(r.lebron) ? r.lebron : null),
    format: (v) => formatNumber(v, 2),
  },
  wins: {
    pick: (r) => (r.winsAdded != null ? r.winsAdded : null),
    format: (v) => formatNumber(v, 2),
  },
  net: {
    pick: (r) =>
      r.netRating != null && Number.isFinite(r.netRating) ? r.netRating : null,
    format: (v) => formatNumber(v, 1),
  },
  pts: {
    pick: (r) => perGame(r, "points"),
    format: (v) => `${formatNumber(v, 1)} PPG`,
  },
  ast: {
    pick: (r) => perGame(r, "assists"),
    format: (v) => `${formatNumber(v, 1)} APG`,
  },
  reb: {
    pick: (r) => perGame(r, "rebounds"),
    format: (v) => `${formatNumber(v, 1)} RPG`,
  },
  "darko-off": {
    pick: (r) => {
      if (r.darkoOff != null && Number.isFinite(r.darkoOff)) return r.darkoOff;
      if (r.oDpm != null && Number.isFinite(r.oDpm) && r.oDpm !== 0) return r.oDpm;
      return null;
    },
    format: (v) => formatNumber(v, 2),
  },
  olebron: {
    pick: (r) =>
      r.oLebron != null && Number.isFinite(r.oLebron) ? r.oLebron : null,
    format: (v) => formatNumber(v, 2),
  },
  ortg: {
    pick: (r) =>
      r.offensiveRating != null &&
      Number.isFinite(r.offensiveRating) &&
      r.offensiveRating > 0
        ? r.offensiveRating
        : null,
    format: (v) => formatNumber(v, 1),
  },
  ts: {
    pick: (r) =>
      r.trueShootingPct != null && r.trueShootingPct > 0
        ? r.trueShootingPct
        : null,
    format: (v) => formatPct(v),
  },
  efg: {
    pick: (r) =>
      r.effectiveFieldGoalPct != null && r.effectiveFieldGoalPct > 0
        ? r.effectiveFieldGoalPct
        : null,
    format: (v) => formatPct(v),
  },
  fg: {
    pick: (r) =>
      r.fieldGoalPct != null && r.fieldGoalPct > 0 ? r.fieldGoalPct : null,
    format: (v) => formatPct(v),
  },
  fg3: {
    pick: (r) =>
      r.threePointPct != null && r.threePointPct > 0 ? r.threePointPct : null,
    format: (v) => formatPct(v),
  },
  ft: {
    pick: (r) =>
      r.freeThrowPct != null && r.freeThrowPct > 0 ? r.freeThrowPct : null,
    format: (v) => formatPct(v),
  },
  stl: {
    pick: (r) => perGame(r, "steals"),
    format: (v) => `${formatNumber(v, 1)} SPG`,
  },
  blk: {
    pick: (r) => perGame(r, "blocks"),
    format: (v) => `${formatNumber(v, 1)} BPG`,
  },
  hustleDefl: {
    pick: (r) => hustleCompPerGame(r, "hustleDeflections"),
    format: (v) => `${formatNumber(v, 1)} defl`,
  },
  hustleContest: {
    pick: (r) => hustleCompPerGame(r, "hustleContestedShots"),
    format: (v) => `${formatNumber(v, 1)} contest`,
  },
  hustleScrAst: {
    pick: (r) => hustleCompPerGame(r, "hustleScreenAssists"),
    format: (v) => `${formatNumber(v, 1)} scr ast`,
  },
  hustleChrg: {
    pick: (r) => hustleCompPerGame(r, "hustleChargesDrawn"),
    format: (v) => `${formatNumber(v, 1)} chrg`,
  },
  hustleLoose: {
    pick: (r) => hustleCompPerGame(r, "hustleLooseBallsRecovered"),
    format: (v) => `${formatNumber(v, 1)} loose`,
  },
  hustleBoxOut: {
    pick: (r) => hustleCompPerGame(r, "hustleBoxOuts"),
    format: (v) => `${formatNumber(v, 1)} box`,
  },
  "darko-def": {
    pick: (r) => {
      if (r.darkoDef != null && Number.isFinite(r.darkoDef)) return r.darkoDef;
      if (r.dDpm != null && Number.isFinite(r.dDpm) && r.dDpm !== 0) return r.dDpm;
      return null;
    },
    format: (v) => formatNumber(v, 2),
  },
  dlebron: {
    pick: (r) =>
      r.dLebron != null && Number.isFinite(r.dLebron) ? r.dLebron : null,
    format: (v) => formatNumber(v, 2),
  },
  drtg: {
    pick: (r) =>
      r.defensiveRating != null && Number.isFinite(r.defensiveRating)
        ? r.defensiveRating
        : null,
    format: (v) => formatNumber(v, 1),
  },
  usg: {
    pick: (r) =>
      r.usagePct != null && r.usagePct > 0 ? r.usagePct : null,
    format: (v) => formatPct(v),
  },
  min: {
    pick: (r) => {
      const m = perGame(r, "minutes");
      return m > 0 ? m : null;
    },
    format: (v) => `${formatNumber(v, 1)} MPG`,
  },
  tov: {
    pick: (r) => {
      const t = perGame(r, "turnovers");
      return t > 0 ? t : null;
    },
    format: (v) => `${formatNumber(v, 1)} TPG`,
  },
  atr: {
    pick: (r) => {
      const a = perGame(r, "assists");
      const t = perGame(r, "turnovers");
      return t > 0 ? a / t : null;
    },
    format: (v) => formatNumber(v, 2),
  },
  gp: {
    pick: (r) => (r.gamesPlayed > 0 ? r.gamesPlayed : null),
    format: (v) => `${Math.round(v)} GP`,
  },
  orb: {
    pick: (r) => perGame(r, "offensiveRebounds"),
    format: (v) => `${formatNumber(v, 1)} ORPG`,
  },
  drb: {
    pick: (r) => perGame(r, "defensiveRebounds"),
    format: (v) => `${formatNumber(v, 1)} DRPG`,
  },
  astPct: {
    pick: (r) => (r.assistPct != null && r.assistPct > 0 ? r.assistPct : null),
    format: (v) => formatPct(v),
  },
  tovPct: {
    pick: (r) =>
      r.turnoverPct != null && r.turnoverPct > 0 ? r.turnoverPct : null,
    format: (v) => formatPct(v),
  },
  orbPct: {
    pick: (r) =>
      r.offensiveReboundPct != null && r.offensiveReboundPct > 0
        ? r.offensiveReboundPct
        : null,
    format: (v) => formatPct(v),
  },
  drbPct: {
    pick: (r) =>
      r.defensiveReboundPct != null && r.defensiveReboundPct > 0
        ? r.defensiveReboundPct
        : null,
    format: (v) => formatPct(v),
  },
  trbPct: {
    pick: (r) =>
      r.reboundPct != null && r.reboundPct > 0 ? r.reboundPct : null,
    format: (v) => formatPct(v),
  },
  stlPct: {
    pick: (r) => (r.stealPct != null && r.stealPct > 0 ? r.stealPct : null),
    format: (v) => formatPct(v),
  },
  blkPct: {
    pick: (r) => (r.blockPct != null && r.blockPct > 0 ? r.blockPct : null),
    format: (v) => formatPct(v),
  },
  fg2: {
    pick: (r) =>
      r.twoPointPct != null && r.twoPointPct > 0 ? r.twoPointPct : null,
    format: (v) => formatPct(v),
  },
  fg3a: {
    pick: (r) =>
      r.threePointAttemptRate != null && r.threePointAttemptRate > 0
        ? r.threePointAttemptRate
        : null,
    format: (v) => formatPct(v),
  },
  ftr: {
    pick: (r) =>
      r.freeThrowRate != null && r.freeThrowRate > 0 ? r.freeThrowRate : null,
    format: (v) => formatNumber(v, 3),
  },
  ows: {
    pick: (r) =>
      r.ows != null && Number.isFinite(r.ows) && r.ows !== 0 ? r.ows : null,
    format: (v) => formatNumber(v, 1),
  },
  dws: {
    pick: (r) =>
      r.dws != null && Number.isFinite(r.dws) && r.dws !== 0 ? r.dws : null,
    format: (v) => formatNumber(v, 1),
  },
  obpm: {
    pick: (r) => (r.obpm != null && Number.isFinite(r.obpm) ? r.obpm : null),
    format: (v) => formatNumber(v, 1),
  },
  dbpm: {
    pick: (r) => (r.dbpm != null && Number.isFinite(r.dbpm) ? r.dbpm : null),
    format: (v) => formatNumber(v, 1),
  },
  per: {
    pick: (r) =>
      r.per != null && Number.isFinite(r.per) && r.per !== 0 ? r.per : null,
    format: (v) => formatNumber(v, 1),
  },
  ws: {
    pick: (r) =>
      r.winShares != null && Number.isFinite(r.winShares) && r.winShares !== 0
        ? r.winShares
        : null,
    format: (v) => formatNumber(v, 1),
  },
  ws48: {
    pick: (r) =>
      r.winSharesPer48 != null &&
      Number.isFinite(r.winSharesPer48) &&
      r.winSharesPer48 !== 0
        ? r.winSharesPer48
        : null,
    format: (v) => formatNumber(v, 3),
  },
  bpm: {
    pick: (r) => (r.bpm != null && Number.isFinite(r.bpm) ? r.bpm : null),
    format: (v) => formatNumber(v, 1),
  },
  vorp: {
    pick: (r) =>
      r.vorp != null && Number.isFinite(r.vorp) && r.vorp !== 0 ? r.vorp : null,
    format: (v) => formatNumber(v, 1),
  },
  pie: {
    pick: (r) => (r.pie != null && r.pie > 0 ? r.pie : null),
    format: (v) => formatPct(v),
  },
  r1WinEquivalents: {
    pick: (r) =>
      hasValidDrblEstimate(r as PlayerSeason) &&
      r.r1WinEquivalents != null &&
      Number.isFinite(r.r1WinEquivalents)
        ? r.r1WinEquivalents
        : null,
    format: (v) => formatNumber(v, 1),
  },
  drblP: {
    pick: (r) =>
      hasValidDrblEstimate(r as PlayerSeason) && Number.isFinite(r.drblP)
        ? (r.drblP as number)
        : null,
    format: (v) => formatNumber(v, 2),
  },
  drblLn: {
    pick: (r) =>
      hasValidDrblEstimate(r as PlayerSeason) && Number.isFinite(r.drblLn)
        ? (r.drblLn as number)
        : null,
    format: (v) => formatNumber(v, 2),
  },
  drblB: {
    pick: (r) =>
      hasValidDrblEstimate(r as PlayerSeason) && Number.isFinite(r.drblB)
        ? (r.drblB as number)
        : null,
    format: (v) => formatNumber(v, 2),
  },
  fga: {
    pick: (r) => {
      const v = perGame(r, "fieldGoalsAttempted");
      return v > 0 ? v : null;
    },
    format: (v) => `${formatNumber(v, 1)} FGA`,
  },
  fg3aVol: {
    pick: (r) => {
      const v = perGame(r, "threePointersAttempted");
      return v > 0 ? v : null;
    },
    format: (v) => `${formatNumber(v, 1)} 3PA`,
  },
  fta: {
    pick: (r) => {
      const v = perGame(r, "freeThrowsAttempted");
      return v > 0 ? v : null;
    },
    format: (v) => `${formatNumber(v, 1)} FTA`,
  },
  sdv100: {
    pick: (r) =>
      r.sdv100 != null && Number.isFinite(r.sdv100) && r.sdv100 !== 0
        ? r.sdv100
        : null,
    format: (v) => formatNumber(v, 1),
  },
  shotMaking100: {
    pick: (r) =>
      r.shotMaking100 != null &&
      Number.isFinite(r.shotMaking100) &&
      r.shotMaking100 !== 0
        ? r.shotMaking100
        : null,
    format: (v) => formatNumber(v, 1),
  },
  gs: {
    pick: (r) =>
      r.gamesStarted != null && Number.isFinite(r.gamesStarted)
        ? r.gamesStarted
        : null,
    format: (v) => `${Math.round(v)} GS`,
  },
  startRate: {
    pick: (r) => {
      if (!(r.gamesPlayed > 0) || r.gamesStarted == null) return null;
      return r.gamesStarted / r.gamesPlayed;
    },
    format: (v) => formatPct(v),
  },
  pf: {
    pick: (r) => {
      const v = perGame(r, "personalFouls");
      return v > 0 ? v : null;
    },
    format: (v) => `${formatNumber(v, 1)} PF`,
  },
  plusMinus: {
    pick: (r) => {
      const v = perGame(r, "plusMinus");
      return Number.isFinite(v) ? v : null;
    },
    format: (v) => formatNumber(v, 1),
  },
};

function toCandidates(
  rows: PlayerSeason[],
  pick: (row: PlayerSeason) => number | null
) {
  const out: Array<{
    playerId: string;
    playerName: string;
    season: string;
    teamName: string;
    teamKey: string;
    value: number;
  }> = [];
  for (const row of rows) {
    const value = pick(row);
    if (value == null || !Number.isFinite(value)) continue;
    out.push({
      playerId: row.playerId,
      playerName: row.playerName,
      season: row.season,
      teamName: row.teamName,
      teamKey: row.teamId,
      value,
    });
  }
  return out;
}

function percentileAmong(value: number, pool: number[]): number {
  if (!pool.length || !Number.isFinite(value)) return 50;
  const below = pool.filter((v) => v < value).length;
  return (below / pool.length) * 100;
}

/** Closest players on a single metric (by absolute distance). */
export function findSimilarForMetric(options: {
  metricId: string;
  focalPlayerId: string;
  focalValue: number;
  leagueRows: PlayerSeason[];
  historicalRows: PlayerSeason[];
  limit?: number;
  invert?: boolean;
}): { leagueComps: StatComp[]; historicalComps: StatComp[] } {
  const picker = METRIC_PICKERS[options.metricId];
  if (!picker) return { leagueComps: [], historicalComps: [] };
  const limit = options.limit ?? 6;
  const invert = Boolean(options.invert);

  const nearest = (rows: PlayerSeason[]): StatComp[] => {
    const stintsByPlayerSeason = new Map<string, PlayerCardStint[]>();
    const grouped = new Map<string, PlayerSeason[]>();
    for (const row of rows) {
      const key = `${row.playerId}|${row.season}`;
      const list = grouped.get(key);
      if (list) list.push(row);
      else grouped.set(key, [row]);
    }
    for (const [key, list] of grouped) {
      const season = key.slice(key.indexOf("|") + 1);
      stintsByPlayerSeason.set(key, cardStintsForSeason(list, season));
    }

    const candidates = toCandidates(rows, picker.pick);
    const poolValues = candidates.map((c) => c.value);
    const toPercentile = (value: number) => {
      const raw = percentileAmong(value, poolValues);
      return invert ? 100 - raw : raw;
    };

    return candidates
      .filter((c) => c.playerId !== options.focalPlayerId)
      .map((c) => {
        const stints =
          stintsByPlayerSeason.get(`${c.playerId}|${c.season}`) ?? [];
        const last = stints.at(-1);
        return {
          playerId: c.playerId,
          playerName: c.playerName,
          season: c.season,
          teamName: last?.teamLabel ?? c.teamName,
          teamKey: last?.teamKey ?? c.teamKey,
          stints: stints.length > 0 ? stints : undefined,
          value: c.value,
          display: picker.format(c.value),
          delta: c.value - options.focalValue,
          percentile: toPercentile(c.value),
          distance: Math.abs(c.value - options.focalValue),
        };
      })
      .sort(
        (a, b) =>
          a.distance - b.distance || a.playerName.localeCompare(b.playerName)
      )
      .slice(0, limit)
      .map(({ distance: _d, ...rest }) => rest);
  };

  return {
    leagueComps: nearest(options.leagueRows),
    historicalComps: nearest(options.historicalRows),
  };
}

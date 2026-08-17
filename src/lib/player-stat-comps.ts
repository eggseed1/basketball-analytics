import type { PlayerSeason } from "@/data/types";
import { formatNumber, formatPct } from "@/lib/format";
import {
  canonicalSeasonFromEspnYear,
  espnYearFromCanonicalSeason,
} from "@/data/providers/nba/season";
import { hasValidDrblEstimate } from "@/data/queries/percentiles";

export type StatComp = {
  playerId: string;
  playerName: string;
  season: string;
  teamName?: string;
  teamKey?: string;
  value: number;
  display: string;
  /** Comp value minus focal value. */
  delta: number;
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
  steals?: number;
  blocks?: number;
  turnovers?: number;
  minutes?: number;
  fieldGoalPct?: number;
  threePointPct?: number;
  freeThrowPct?: number;
  trueShootingPct?: number;
  effectiveFieldGoalPct?: number;
  usagePct?: number;
  offensiveRating?: number;
  defensiveRating?: number;
  netRating?: number;
  darkoDpm?: number;
  darkoOff?: number;
  darkoDef?: number;
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
    format: (v) => formatNumber(v, 2),
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
    pick: (r) => (r.darkoDpm != null ? r.darkoDpm : null),
    format: (v) => formatNumber(v, 2),
  },
  lebron: {
    pick: (r) => (r.lebron != null ? r.lebron : null),
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
    pick: (r) => (r.darkoOff != null ? r.darkoOff : null),
    format: (v) => formatNumber(v, 2),
  },
  olebron: {
    pick: (r) => (r.oLebron != null ? r.oLebron : null),
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
  "darko-def": {
    pick: (r) => (r.darkoDef != null ? r.darkoDef : null),
    format: (v) => formatNumber(v, 2),
  },
  dlebron: {
    pick: (r) => (r.dLebron != null ? r.dLebron : null),
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

/** Closest players on a single metric (by absolute distance). */
export function findSimilarForMetric(options: {
  metricId: string;
  focalPlayerId: string;
  focalValue: number;
  leagueRows: PlayerSeason[];
  historicalRows: PlayerSeason[];
  limit?: number;
}): { leagueComps: StatComp[]; historicalComps: StatComp[] } {
  const picker = METRIC_PICKERS[options.metricId];
  if (!picker) return { leagueComps: [], historicalComps: [] };
  const limit = options.limit ?? 6;

  const nearest = (
    candidates: ReturnType<typeof toCandidates>
  ): StatComp[] =>
    candidates
      .filter((c) => c.playerId !== options.focalPlayerId)
      .map((c) => ({
        playerId: c.playerId,
        playerName: c.playerName,
        season: c.season,
        teamName: c.teamName,
        teamKey: c.teamKey,
        value: c.value,
        display: picker.format(c.value),
        delta: c.value - options.focalValue,
        distance: Math.abs(c.value - options.focalValue),
      }))
      .sort((a, b) => a.distance - b.distance || a.playerName.localeCompare(b.playerName))
      .slice(0, limit)
      .map(({ distance: _d, ...rest }) => rest);

  return {
    leagueComps: nearest(toCandidates(options.leagueRows, picker.pick)),
    historicalComps: nearest(
      toCandidates(options.historicalRows, picker.pick)
    ),
  };
}

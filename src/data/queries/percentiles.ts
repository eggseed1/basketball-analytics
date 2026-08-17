import type { PlayerSeason } from "@/data/types";
import {
  VALIDATED_PERCENTILE_PRODUCT_MIN_MINUTES,
  VALIDATED_PERCENTILE_ELIGIBILITY_VERSION,
  hasValidatedDrblEstimate,
  existingProductQualification,
  qualifiesForValidatedDrblPercentile,
} from "../../../drbl/models/validated-percentile-eligibility-v1";

export type PercentileDirection = "higherBetter" | "lowerBetter";

/** High-level bucket for player-profile offense / defense tabs. */
export type PercentileSide = "offense" | "defense" | "overall";

export interface PercentileMetricDef {
  key: string;
  label: string;
  shortLabel: string;
  direction: PercentileDirection;
  /** Extract comparable numeric value from a player-season row. */
  value: (row: PlayerSeason) => number;
  format: (value: number) => string;
  group: "scoring" | "usage" | "playmaking" | "defense" | "overall";
  /** Defaults from `group` when omitted. */
  side?: PercentileSide;
  /**
   * When set, only rows for which this returns true enter the comparison
   * universe. Model-derived DRBL metrics must require a valid estimate —
   * metadata-only default zeros must not silently enter the pool.
   */
  eligible?: (row: PlayerSeason) => boolean;
  /** Explicit percentile field identity (never infer from label). */
  percentileField?: string;
}

/**
 * Canonical validated DRBL estimate availability for PlayerSeason rows.
 * Replaces legacy `drblUncertainty > 0` validity proxy (M16k1).
 *
 * Requires explicit raw + N (wired from precomputed overlay). Zero DRBL is valid.
 * Percentile population still applies minutes >= 500 via computePlayerPercentiles.
 */
export function hasValidDrblEstimate(row: PlayerSeason): boolean {
  const N = Number(row.drblPossessions ?? 0);
  const raw = Number(row.rawAbilityRate);
  if (!Number.isFinite(raw) || !Number.isFinite(N) || N <= 0) return false;
  if (!Number.isFinite(row.drbl100)) return false;
  return hasValidatedDrblEstimate({
    validatedDRBL100: row.drbl100,
    validatedRawP100: raw,
    validatedActualPossessions: N,
  });
}

export {
  VALIDATED_PERCENTILE_PRODUCT_MIN_MINUTES,
  VALIDATED_PERCENTILE_ELIGIBILITY_VERSION,
  hasValidatedDrblEstimate,
  existingProductQualification,
  qualifiesForValidatedDrblPercentile,
};
function assistRate(row: PlayerSeason): number {
  if (row.minutes <= 0) return 0;
  return row.assists / (row.minutes / 36);
}

function turnoverRate(row: PlayerSeason): number {
  return row.turnoverPct;
}

function reboundRate(row: PlayerSeason): number {
  if (row.minutes <= 0) return 0;
  return row.rebounds / (row.minutes / 36);
}

function stealRate(row: PlayerSeason): number {
  if (row.minutes <= 0) return 0;
  return row.steals / (row.minutes / 36);
}

function blockRate(row: PlayerSeason): number {
  if (row.minutes <= 0) return 0;
  return row.blocks / (row.minutes / 36);
}

function pointsPer36(row: PlayerSeason): number {
  if (row.minutes <= 0) return 0;
  return row.points / (row.minutes / 36);
}

/**
 * Core percentile tiles shown on player profiles.
 */
export const PLAYER_PERCENTILE_METRICS: PercentileMetricDef[] = [
  {
    key: "trueShootingPct",
    label: "True Shooting %",
    shortLabel: "TS%",
    direction: "higherBetter",
    value: (r) => r.trueShootingPct,
    format: (v) => `${(v * 100).toFixed(1)}%`,
    group: "scoring",
  },
  {
    key: "effectiveFieldGoalPct",
    label: "Effective FG %",
    shortLabel: "eFG%",
    direction: "higherBetter",
    value: (r) => r.effectiveFieldGoalPct,
    format: (v) => `${(v * 100).toFixed(1)}%`,
    group: "scoring",
  },
  {
    key: "fieldGoalPct",
    label: "Field Goal %",
    shortLabel: "FG%",
    direction: "higherBetter",
    value: (r) => r.fieldGoalPct,
    format: (v) => `${(v * 100).toFixed(1)}%`,
    group: "scoring",
  },
  {
    key: "threePointPct",
    label: "Three Point %",
    shortLabel: "3P%",
    direction: "higherBetter",
    value: (r) => r.threePointPct,
    format: (v) => `${(v * 100).toFixed(1)}%`,
    group: "scoring",
  },
  {
    key: "freeThrowPct",
    label: "Free Throw %",
    shortLabel: "FT%",
    direction: "higherBetter",
    value: (r) => r.freeThrowPct,
    format: (v) => `${(v * 100).toFixed(1)}%`,
    group: "scoring",
  },
  {
    key: "pointsPer36",
    label: "Points / 36",
    shortLabel: "PTS/36",
    direction: "higherBetter",
    value: pointsPer36,
    format: (v) => v.toFixed(1),
    group: "scoring",
  },
  {
    key: "pointsPerGame",
    label: "Points / Game",
    shortLabel: "PTS/G",
    direction: "higherBetter",
    value: (r) => (r.gamesPlayed > 0 ? r.points / r.gamesPlayed : 0),
    format: (v) => v.toFixed(1),
    group: "scoring",
  },
  {
    key: "usagePct",
    label: "Usage %",
    shortLabel: "USG%",
    direction: "higherBetter",
    value: (r) => r.usagePct,
    format: (v) => `${(v * 100).toFixed(1)}%`,
    group: "usage",
  },
  {
    key: "threePointAttemptRate",
    label: "3P Attempt Rate",
    shortLabel: "3PAr",
    direction: "higherBetter",
    value: (r) => r.threePointAttemptRate,
    format: (v) => `${(v * 100).toFixed(1)}%`,
    group: "usage",
  },
  {
    key: "freeThrowRate",
    label: "Free Throw Rate",
    shortLabel: "FTr",
    direction: "higherBetter",
    value: (r) => r.freeThrowRate,
    format: (v) => v.toFixed(3),
    group: "usage",
  },
  {
    key: "offensiveRating",
    label: "Offensive Rating",
    shortLabel: "ORtg",
    direction: "higherBetter",
    value: (r) => r.offensiveRating,
    format: (v) => v.toFixed(1),
    group: "scoring",
    side: "offense",
  },
  {
    key: "defensiveRating",
    label: "Defensive Rating",
    shortLabel: "DRtg",
    direction: "lowerBetter",
    value: (r) => r.defensiveRating,
    format: (v) => v.toFixed(1),
    group: "defense",
    side: "defense",
  },
  {
    key: "netRating",
    label: "Net Rating",
    shortLabel: "NRtg",
    direction: "higherBetter",
    value: (r) => r.netRating,
    format: (v) => v.toFixed(1),
    group: "overall",
    side: "overall",
  },
  {
    key: "assistRate",
    label: "Assist Rate / 36",
    shortLabel: "AST/36",
    direction: "higherBetter",
    value: assistRate,
    format: (v) => v.toFixed(1),
    group: "playmaking",
  },
  {
    key: "turnoverRate",
    label: "Turnover %",
    shortLabel: "TOV%",
    direction: "lowerBetter",
    value: turnoverRate,
    format: (v) => `${(v * 100).toFixed(1)}%`,
    group: "playmaking",
  },
  {
    key: "reboundRate",
    label: "Rebound Rate / 36",
    shortLabel: "REB/36",
    direction: "higherBetter",
    value: reboundRate,
    format: (v) => v.toFixed(1),
    group: "defense",
  },
  {
    key: "stealRate",
    label: "Steal Rate / 36",
    shortLabel: "STL/36",
    direction: "higherBetter",
    value: stealRate,
    format: (v) => v.toFixed(1),
    group: "defense",
  },
  {
    key: "blockRate",
    label: "Block Rate / 36",
    shortLabel: "BLK/36",
    direction: "higherBetter",
    value: blockRate,
    format: (v) => v.toFixed(1),
    group: "defense",
  },
  {
    key: "per",
    label: "Player Efficiency Rating",
    shortLabel: "PER",
    direction: "higherBetter",
    value: (r) => r.per,
    format: (v) => v.toFixed(1),
    group: "overall",
  },
  {
    key: "winShares",
    label: "Win Shares",
    shortLabel: "WS",
    direction: "higherBetter",
    value: (r) => r.winShares,
    format: (v) => v.toFixed(1),
    group: "overall",
  },
  {
    key: "bpm",
    label: "Box Plus/Minus",
    shortLabel: "BPM",
    direction: "higherBetter",
    value: (r) => r.bpm,
    format: (v) => v.toFixed(1),
    group: "overall",
  },
  {
    key: "vorp",
    label: "Value Over Replacement",
    shortLabel: "VORP",
    direction: "higherBetter",
    value: (r) => r.vorp,
    format: (v) => v.toFixed(1),
    group: "overall",
  },
  {
    key: "dpm",
    label: "DARKO DPM",
    shortLabel: "DPM",
    direction: "higherBetter",
    value: (r) => r.dpm,
    format: (v) => v.toFixed(1),
    group: "overall",
    side: "overall",
  },
  {
    key: "oDpm",
    label: "DARKO Offensive DPM",
    shortLabel: "O-DPM",
    direction: "higherBetter",
    value: (r) => r.oDpm,
    format: (v) => v.toFixed(1),
    group: "scoring",
    side: "offense",
  },
  {
    key: "dDpm",
    label: "DARKO Defensive DPM",
    shortLabel: "D-DPM",
    direction: "higherBetter",
    value: (r) => r.dDpm,
    format: (v) => v.toFixed(1),
    group: "defense",
    side: "defense",
  },
  {
    key: "r1Points",
    label: "R1 Points",
    shortLabel: "R1 Points",
    direction: "higherBetter",
    value: (r) => r.r1Points ?? Number.NaN,
    format: (v) => v.toFixed(1),
    group: "overall",
    side: "overall",
    eligible: (r) => hasValidDrblEstimate(r) && r.r1Points != null,
    percentileField: "r1PointsPercentile",
  },
  {
    key: "r1WinEquivalents",
    label: "R1 Win Equivalents",
    shortLabel: "R1 Win Eq.",
    direction: "higherBetter",
    value: (r) => r.r1WinEquivalents ?? Number.NaN,
    format: (v) => v.toFixed(2),
    group: "overall",
    side: "overall",
    eligible: (r) => hasValidDrblEstimate(r) && r.r1WinEquivalents != null,
    percentileField: "r1WinEquivalentsPercentile",
  },
  {
    key: "drbl100",
    label: "DRBL ability /100",
    shortLabel: "DRBL/100",
    direction: "higherBetter",
    value: (r) => r.drbl100,
    format: (v) => v.toFixed(1),
    group: "overall",
    side: "overall",
    eligible: hasValidDrblEstimate,
    percentileField: "drbl100Percentile",
  },
  {
    key: "drblP",
    label: "DRBL Possession",
    shortLabel: "DRBL-P",
    direction: "higherBetter",
    value: (r) => r.drblP,
    format: (v) => v.toFixed(1),
    group: "overall",
    side: "overall",
    eligible: hasValidDrblEstimate,
    percentileField: "drblPPercentile",
  },
  {
    key: "drblLn",
    label: "DRBL Lineup",
    shortLabel: "DRBL-LN",
    direction: "higherBetter",
    value: (r) => r.drblLn,
    format: (v) => v.toFixed(1),
    group: "overall",
    side: "overall",
    eligible: hasValidDrblEstimate,
    percentileField: "drblLnPercentile",
  },
  {
    key: "drblB",
    label: "DRBL Behavior",
    shortLabel: "DRBL-B",
    direction: "higherBetter",
    value: (r) => r.drblB,
    format: (v) => v.toFixed(1),
    group: "overall",
    side: "overall",
    eligible: hasValidDrblEstimate,
    percentileField: "drblBPercentile",
  },
  {
    key: "drblO",
    label: "DRBL Offense",
    shortLabel: "DRBL-O",
    direction: "higherBetter",
    value: (r) => r.drblO,
    format: (v) => v.toFixed(1),
    group: "scoring",
    side: "offense",
    eligible: hasValidDrblEstimate,
    percentileField: "drblOPercentile",
  },
  {
    key: "drblD",
    label: "DRBL Defense",
    shortLabel: "DRBL-D",
    direction: "higherBetter",
    value: (r) => r.drblD,
    format: (v) => v.toFixed(1),
    group: "defense",
    side: "defense",
    eligible: hasValidDrblEstimate,
    percentileField: "drblDPercentile",
  },
  {
    key: "obpm",
    label: "Offensive Box Plus/Minus",
    shortLabel: "OBPM",
    direction: "higherBetter",
    value: (r) => r.obpm,
    format: (v) => v.toFixed(1),
    group: "scoring",
    side: "offense",
  },
  {
    key: "dbpm",
    label: "Defensive Box Plus/Minus",
    shortLabel: "DBPM",
    direction: "higherBetter",
    value: (r) => r.dbpm,
    format: (v) => v.toFixed(1),
    group: "defense",
    side: "defense",
  },
  {
    key: "ows",
    label: "Offensive Win Shares",
    shortLabel: "OWS",
    direction: "higherBetter",
    value: (r) => r.ows,
    format: (v) => v.toFixed(1),
    group: "scoring",
    side: "offense",
  },
  {
    key: "dws",
    label: "Defensive Win Shares",
    shortLabel: "DWS",
    direction: "higherBetter",
    value: (r) => r.dws,
    format: (v) => v.toFixed(1),
    group: "defense",
    side: "defense",
  },
  {
    key: "assistPct",
    label: "Assist %",
    shortLabel: "AST%",
    direction: "higherBetter",
    value: (r) => r.assistPct,
    format: (v) => `${(v * 100).toFixed(1)}%`,
    group: "playmaking",
  },
];

export function percentileSide(
  metric: Pick<PercentileMetricDef, "group" | "side">
): PercentileSide {
  if (metric.side) return metric.side;
  if (metric.group === "defense") return "defense";
  if (metric.group === "overall") return "overall";
  return "offense";
}

export interface PlayerPercentile {
  key: string;
  label: string;
  shortLabel: string;
  group: PercentileMetricDef["group"];
  side: PercentileSide;
  value: number;
  displayValue: string;
  percentile: number;
  /** 0–1 for bar fill / color scale after direction adjustment. */
  quality: number;
}

function percentileRank(
  values: number[],
  target: number,
  direction: PercentileDirection
): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  let below = 0;
  for (const v of sorted) {
    if (v < target) below += 1;
    else if (v === target) below += 0.5;
  }
  const raw = (below / sorted.length) * 100;
  const pct = direction === "higherBetter" ? raw : 100 - raw;
  return Math.max(1, Math.min(100, Math.round(pct)));
}

/**
 * League percentile rankings for one player-season.
 *
 * Each metric uses its own comparison universe. When `eligible` is set
 * (DRBL metrics), metadata-only default zeros are excluded from the pool.
 * Missing percentile → omitted from result (callers render "—").
 */
export function computePlayerPercentiles(
  player: PlayerSeason,
  league: PlayerSeason[],
  minimumMinutes = 500
): PlayerPercentile[] {
  const cohort = league.filter((row) => row.minutes >= minimumMinutes);
  const minutePool = cohort.length >= 30 ? cohort : league;

  const out: PlayerPercentile[] = [];
  for (const metric of PLAYER_PERCENTILE_METRICS) {
    const pool = metric.eligible
      ? minutePool.filter((row) => metric.eligible!(row))
      : minutePool;

    if (metric.eligible && !metric.eligible(player)) {
      continue;
    }
    if (pool.length === 0) continue;

    const value = metric.value(player);
    const values = pool.map((row) => metric.value(row));
    const percentile = percentileRank(values, value, metric.direction);
    out.push({
      key: metric.key,
      label: metric.label,
      shortLabel: metric.shortLabel,
      group: metric.group,
      side: percentileSide(metric),
      value,
      displayValue: metric.format(value),
      percentile,
      quality: percentile / 100,
    });
  }
  return out;
}

/** Bar marker position from a displayed percentile (0–100). */
export function barPositionPercent(percentile: number | null | undefined): number | null {
  if (percentile == null || !Number.isFinite(percentile)) return null;
  return Math.max(0, Math.min(100, percentile));
}

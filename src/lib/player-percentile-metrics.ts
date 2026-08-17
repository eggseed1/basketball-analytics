/**
 * Player-page percentile metric definitions and peer ranking.
 * Classification / display semantics only — does not invent stats.
 */

import type { PlayerSeason } from "@/data/types";
import { hasValidDrblEstimate } from "@/data/queries/percentiles";
import { formatNumber, formatPct } from "@/lib/format";
import { teamChartColor } from "@/lib/nba-brand";
import { findSimilarForMetric } from "@/lib/player-stat-comps";

export type PercentileCategory =
  | "value"
  | "offense"
  | "shooting"
  | "defense"
  | "role"
  | "advanced";

export type MetricInterpretation =
  | "higher_is_better"
  | "lower_is_better"
  | "descriptive"
  | "role";

export type PercentileMetric = {
  id: string;
  category: PercentileCategory;
  label: string;
  percentile: number;
  display: string;
  value: number;
  series?: Array<{
    season: string;
    value: number;
    teamId: string;
    teamAbbr: string;
    color: string;
  }>;
  leagueComps: import("@/lib/player-stat-comps").StatComp[];
  historicalComps: import("@/lib/player-stat-comps").StatComp[];
  interpretation: MetricInterpretation;
  showPercentile: boolean;
  showGrade: boolean;
};

function percentileOf(value: number, pool: number[]): number {
  if (!pool.length || !Number.isFinite(value)) return 50;
  const below = pool.filter((v) => v < value).length;
  return (below / pool.length) * 100;
}

function perGame(row: PlayerSeason, key: keyof PlayerSeason): number {
  const raw = row[key];
  const total = typeof raw === "number" ? raw : 0;
  return total / Math.max(1, row.gamesPlayed);
}

export const PLAYER_PERCENTILE_QUALIFY = {
  minGames: 15,
  minMpg: 12,
} as const;

/** Metrics allowed in the Advanced category (normalized / efficiency / ratings). */
export const ADVANCED_PERCENTILE_METRIC_IDS = new Set([
  "ortg",
  "drtg",
  "net",
]);

export function isQualifiedPeer(row: PlayerSeason): boolean {
  return (
    row.gamesPlayed >= PLAYER_PERCENTILE_QUALIFY.minGames &&
    row.minutes / Math.max(1, row.gamesPlayed) >= PLAYER_PERCENTILE_QUALIFY.minMpg
  );
}

type CareerPoint = {
  season: string;
  value: number;
  teamId: string;
  teamAbbr: string;
  color: string;
};

/**
 * Build season percentile metrics for the player page.
 * Peer population: same season, GP/MPG qualification, missing values excluded.
 */
export function buildPlayerPercentileMetrics(
  seasonStats: PlayerSeason | null,
  career: PlayerSeason[],
  peers: PlayerSeason[],
  historicalPeers: PlayerSeason[],
  focalPlayerId: string
): PercentileMetric[] {
  if (!seasonStats) return [];

  const qualified = peers.filter(isQualifiedPeer);
  const pool = qualified.length ? qualified : peers;
  const historicalPool = historicalPeers.filter(isQualifiedPeer);

  const careerSeries = (
    pick: (row: PlayerSeason) => number | null | undefined,
    options?: { rejectFlatOverlay?: boolean }
  ): CareerPoint[] => {
    const bySeason = new Map<string, PlayerSeason>();
    for (const r of career) {
      const existing = bySeason.get(r.season);
      if (!existing || r.gamesPlayed > existing.gamesPlayed) {
        bySeason.set(r.season, r);
      }
    }
    const points = [...bySeason.values()]
      .sort((a, b) => a.season.localeCompare(b.season))
      .map((r) => {
        const v = pick(r);
        if (v == null || !Number.isFinite(v)) return null;
        const { color, abbr } = teamChartColor(r.teamId);
        return {
          season: r.season.slice(2),
          value: v,
          teamId: r.teamId,
          teamAbbr: abbr,
          color,
        };
      })
      .filter((x): x is CareerPoint => x != null);

    if (options?.rejectFlatOverlay && points.length > 1) {
      const first = points[0]!.value;
      const allSame = points.every((p) => Math.abs(p.value - first) < 1e-6);
      if (allSame) return [];
    }
    return points;
  };

  const metrics: PercentileMetric[] = [];

  const push = (opts: {
    id: string;
    category: PercentileCategory;
    label: string;
    value: number;
    values: number[];
    display: string;
    series: CareerPoint[];
    interpretation: MetricInterpretation;
    /** When true, lower raw values rank higher. */
    invert?: boolean;
    showPercentile?: boolean;
    showGrade?: boolean;
  }) => {
    if (!Number.isFinite(opts.value) || opts.values.length === 0) return;

    const interpretation = opts.interpretation;
    const showPercentile =
      opts.showPercentile ??
      (interpretation === "higher_is_better" ||
        interpretation === "lower_is_better" ||
        interpretation === "role");
    const showGrade =
      opts.showGrade ??
      (interpretation === "higher_is_better" ||
        interpretation === "lower_is_better");

    const raw = percentileOf(opts.value, opts.values);
    const percentile = opts.invert ? 100 - raw : raw;
    const comps = findSimilarForMetric({
      metricId: opts.id,
      focalPlayerId,
      focalValue: opts.value,
      leagueRows: pool,
      historicalRows: historicalPool,
      limit: 6,
    });

    metrics.push({
      id: opts.id,
      category: opts.category,
      label: opts.label,
      percentile,
      display: opts.display,
      value: opts.value,
      series: opts.series,
      leagueComps: comps.leagueComps,
      historicalComps: comps.historicalComps,
      interpretation,
      showPercentile,
      showGrade,
    });
  };

  // --- Value (impact) — DRBL/100 first when valid; O/D are halves of P, not of DRBL/100 ---
  if (hasValidDrblEstimate(seasonStats)) {
    const drblPool = pool
      .filter(hasValidDrblEstimate)
      .map((p) => p.drbl100)
      .filter((n): n is number => Number.isFinite(n));
    if (drblPool.length) {
      push({
        id: "drbl100",
        category: "value",
        label: "DRBL/100",
        value: seasonStats.drbl100,
        values: drblPool,
        display: formatNumber(seasonStats.drbl100, 1),
        series: careerSeries(
          (r) => (hasValidDrblEstimate(r) ? r.drbl100 : null),
          { rejectFlatOverlay: true }
        ),
        interpretation: "higher_is_better",
      });
    }
    if (
      seasonStats.r1WinEquivalents != null &&
      Number.isFinite(seasonStats.r1WinEquivalents)
    ) {
      const winEqPool = pool
        .filter(
          (p) =>
            hasValidDrblEstimate(p) &&
            p.r1WinEquivalents != null &&
            Number.isFinite(p.r1WinEquivalents)
        )
        .map((p) => p.r1WinEquivalents as number);
      if (winEqPool.length) {
        push({
          id: "r1WinEquivalents",
          category: "value",
          label: "Wins Above R1",
          value: seasonStats.r1WinEquivalents,
          values: winEqPool,
          display: formatNumber(seasonStats.r1WinEquivalents, 1),
          series: careerSeries((r) =>
            r.r1WinEquivalents != null && Number.isFinite(r.r1WinEquivalents)
              ? r.r1WinEquivalents
              : null
          ),
          interpretation: "higher_is_better",
        });
      }
    }
    if (Number.isFinite(seasonStats.drblO)) {
      const oPool = pool
        .filter(hasValidDrblEstimate)
        .map((p) => p.drblO)
        .filter((n): n is number => Number.isFinite(n));
      if (oPool.length) {
        push({
          id: "drblO",
          category: "value",
          label: "DRBL-O",
          value: seasonStats.drblO,
          values: oPool,
          display: formatNumber(seasonStats.drblO, 1),
          series: careerSeries((r) =>
            hasValidDrblEstimate(r) ? r.drblO : null
          ),
          interpretation: "higher_is_better",
        });
      }
    }
    if (Number.isFinite(seasonStats.drblD)) {
      const dPool = pool
        .filter(hasValidDrblEstimate)
        .map((p) => p.drblD)
        .filter((n): n is number => Number.isFinite(n));
      if (dPool.length) {
        push({
          id: "drblD",
          category: "value",
          label: "DRBL-D",
          value: seasonStats.drblD,
          values: dPool,
          display: formatNumber(seasonStats.drblD, 1),
          series: careerSeries((r) =>
            hasValidDrblEstimate(r) ? r.drblD : null
          ),
          interpretation: "higher_is_better",
        });
      }
    }
  }

  // --- Value (external impact) ---
  if (seasonStats.darkoDpm != null) {
    const darkoPool = pool
      .map((p) => p.darkoDpm)
      .filter((n): n is number => n != null && Number.isFinite(n));
    if (darkoPool.length) {
      push({
        id: "darko",
        category: "value",
        label: "DARKO DPM",
        value: seasonStats.darkoDpm,
        values: darkoPool,
        display: formatNumber(seasonStats.darkoDpm, 2),
        series: careerSeries((r) => r.darkoDpm, { rejectFlatOverlay: true }),
        interpretation: "higher_is_better",
      });
    }
  }
  if (seasonStats.lebron != null) {
    const lebronPool = pool
      .map((p) => p.lebron)
      .filter((n): n is number => n != null && Number.isFinite(n));
    if (lebronPool.length) {
      push({
        id: "lebron",
        category: "value",
        label: "LEBRON",
        value: seasonStats.lebron,
        values: lebronPool,
        display: formatNumber(seasonStats.lebron, 2),
        series: careerSeries((r) => r.lebron, { rejectFlatOverlay: true }),
        interpretation: "higher_is_better",
      });
    }
  }
  if (seasonStats.winsAdded != null) {
    const waPool = pool
      .map((p) => p.winsAdded)
      .filter((n): n is number => n != null && Number.isFinite(n));
    if (waPool.length) {
      push({
        id: "wins",
        category: "value",
        label: "Wins added",
        value: seasonStats.winsAdded,
        values: waPool,
        display: formatNumber(seasonStats.winsAdded, 2),
        series: careerSeries((r) => r.winsAdded, { rejectFlatOverlay: true }),
        interpretation: "higher_is_better",
      });
    }
  }

  // --- Offense (volume + creation) ---
  const ppg = perGame(seasonStats, "points");
  push({
    id: "pts",
    category: "offense",
    label: "Points",
    value: ppg,
    values: pool.map((p) => perGame(p, "points")),
    display: `${formatNumber(ppg, 1)} PPG`,
    series: careerSeries((r) => perGame(r, "points")),
    interpretation: "higher_is_better",
  });

  const apg = perGame(seasonStats, "assists");
  push({
    id: "ast",
    category: "offense",
    label: "Assists",
    value: apg,
    values: pool.map((p) => perGame(p, "assists")),
    display: `${formatNumber(apg, 1)} APG`,
    series: careerSeries((r) => perGame(r, "assists")),
    interpretation: "higher_is_better",
  });

  const rpg = perGame(seasonStats, "rebounds");
  push({
    id: "reb",
    category: "offense",
    label: "Rebounds",
    value: rpg,
    values: pool.map((p) => perGame(p, "rebounds")),
    display: `${formatNumber(rpg, 1)} RPG`,
    series: careerSeries((r) => perGame(r, "rebounds")),
    interpretation: "higher_is_better",
  });

  // Assist / turnover — playmaking efficiency (not raw turnover volume).
  const tpg = perGame(seasonStats, "turnovers");
  if (tpg > 0 && apg > 0) {
    const atr = apg / tpg;
    push({
      id: "atr",
      category: "offense",
      label: "Assist / turnover",
      value: atr,
      values: pool
        .map((p) => {
          const a = perGame(p, "assists");
          const t = perGame(p, "turnovers");
          return t > 0 ? a / t : null;
        })
        .filter((n): n is number => n != null),
      display: formatNumber(atr, 2),
      series: careerSeries((r) => {
        const a = perGame(r, "assists");
        const t = perGame(r, "turnovers");
        return t > 0 ? a / t : null;
      }),
      interpretation: "higher_is_better",
    });
  }

  if (seasonStats.darkoOff != null) {
    const offPool = pool
      .map((p) => p.darkoOff)
      .filter((n): n is number => n != null && Number.isFinite(n));
    if (offPool.length) {
      push({
        id: "darko-off",
        category: "offense",
        label: "DARKO offense",
        value: seasonStats.darkoOff,
        values: offPool,
        display: formatNumber(seasonStats.darkoOff, 2),
        series: careerSeries((r) => r.darkoOff, { rejectFlatOverlay: true }),
        interpretation: "higher_is_better",
      });
    }
  }
  if (seasonStats.oLebron != null) {
    const oPool = pool
      .map((p) => p.oLebron)
      .filter((n): n is number => n != null && Number.isFinite(n));
    if (oPool.length) {
      push({
        id: "olebron",
        category: "offense",
        label: "O-LEBRON",
        value: seasonStats.oLebron,
        values: oPool,
        display: formatNumber(seasonStats.oLebron, 2),
        series: careerSeries((r) => r.oLebron, { rejectFlatOverlay: true }),
        interpretation: "higher_is_better",
      });
    }
  }

  // --- Shooting ---
  if (seasonStats.trueShootingPct != null && seasonStats.trueShootingPct > 0) {
    push({
      id: "ts",
      category: "shooting",
      label: "True shooting",
      value: seasonStats.trueShootingPct,
      values: pool
        .map((p) => p.trueShootingPct)
        .filter((n): n is number => n != null && n > 0),
      display: formatPct(seasonStats.trueShootingPct),
      series: careerSeries((r) =>
        r.trueShootingPct != null && r.trueShootingPct > 0
          ? r.trueShootingPct * 100
          : null
      ),
      interpretation: "higher_is_better",
    });
  }
  if (
    seasonStats.effectiveFieldGoalPct != null &&
    seasonStats.effectiveFieldGoalPct > 0
  ) {
    push({
      id: "efg",
      category: "shooting",
      label: "Effective FG%",
      value: seasonStats.effectiveFieldGoalPct,
      values: pool
        .map((p) => p.effectiveFieldGoalPct)
        .filter((n): n is number => n != null && n > 0),
      display: formatPct(seasonStats.effectiveFieldGoalPct),
      series: careerSeries((r) =>
        r.effectiveFieldGoalPct != null && r.effectiveFieldGoalPct > 0
          ? r.effectiveFieldGoalPct * 100
          : null
      ),
      interpretation: "higher_is_better",
    });
  }
  if (seasonStats.fieldGoalPct > 0) {
    push({
      id: "fg",
      category: "shooting",
      label: "Field goal %",
      value: seasonStats.fieldGoalPct,
      values: pool.map((p) => p.fieldGoalPct).filter((n) => n > 0),
      display: formatPct(seasonStats.fieldGoalPct),
      series: careerSeries((r) =>
        r.fieldGoalPct > 0 ? r.fieldGoalPct * 100 : null
      ),
      interpretation: "higher_is_better",
    });
  }
  if (seasonStats.threePointPct > 0) {
    push({
      id: "fg3",
      category: "shooting",
      label: "Three-point %",
      value: seasonStats.threePointPct,
      values: pool.map((p) => p.threePointPct).filter((n) => n > 0),
      display: formatPct(seasonStats.threePointPct),
      series: careerSeries((r) =>
        r.threePointPct > 0 ? r.threePointPct * 100 : null
      ),
      interpretation: "higher_is_better",
    });
  }
  if (seasonStats.freeThrowPct > 0) {
    push({
      id: "ft",
      category: "shooting",
      label: "Free-throw %",
      value: seasonStats.freeThrowPct,
      values: pool.map((p) => p.freeThrowPct).filter((n) => n > 0),
      display: formatPct(seasonStats.freeThrowPct),
      series: careerSeries((r) =>
        r.freeThrowPct > 0 ? r.freeThrowPct * 100 : null
      ),
      interpretation: "higher_is_better",
    });
  }

  // --- Defense ---
  const spg = perGame(seasonStats, "steals");
  push({
    id: "stl",
    category: "defense",
    label: "Steals",
    value: spg,
    values: pool.map((p) => perGame(p, "steals")),
    display: `${formatNumber(spg, 1)} SPG`,
    series: careerSeries((r) => perGame(r, "steals")),
    interpretation: "higher_is_better",
  });
  const bpg = perGame(seasonStats, "blocks");
  push({
    id: "blk",
    category: "defense",
    label: "Blocks",
    value: bpg,
    values: pool.map((p) => perGame(p, "blocks")),
    display: `${formatNumber(bpg, 1)} BPG`,
    series: careerSeries((r) => perGame(r, "blocks")),
    interpretation: "higher_is_better",
  });
  if (seasonStats.darkoDef != null) {
    const defPool = pool
      .map((p) => p.darkoDef)
      .filter((n): n is number => n != null && Number.isFinite(n));
    if (defPool.length) {
      push({
        id: "darko-def",
        category: "defense",
        label: "DARKO defense",
        value: seasonStats.darkoDef,
        values: defPool,
        display: formatNumber(seasonStats.darkoDef, 2),
        series: careerSeries((r) => r.darkoDef, { rejectFlatOverlay: true }),
        interpretation: "higher_is_better",
      });
    }
  }
  if (seasonStats.dLebron != null) {
    const dPool = pool
      .map((p) => p.dLebron)
      .filter((n): n is number => n != null && Number.isFinite(n));
    if (dPool.length) {
      push({
        id: "dlebron",
        category: "defense",
        label: "D-LEBRON",
        value: seasonStats.dLebron,
        values: dPool,
        display: formatNumber(seasonStats.dLebron, 2),
        series: careerSeries((r) => r.dLebron, { rejectFlatOverlay: true }),
        interpretation: "higher_is_better",
      });
    }
  }

  // --- Role / availability ---
  if (seasonStats.usagePct != null && seasonStats.usagePct > 0) {
    push({
      id: "usg",
      category: "role",
      label: "Usage",
      value: seasonStats.usagePct,
      values: pool
        .map((p) => p.usagePct)
        .filter((n): n is number => n != null && n > 0),
      display: formatPct(seasonStats.usagePct),
      series: careerSeries((r) =>
        r.usagePct != null && r.usagePct > 0 ? r.usagePct * 100 : null
      ),
      interpretation: "role",
      showPercentile: true,
      showGrade: false,
    });
  }

  const mpg = perGame(seasonStats, "minutes");
  if (mpg > 0) {
    push({
      id: "min",
      category: "role",
      label: "Minutes",
      value: mpg,
      values: pool.map((p) => perGame(p, "minutes")).filter((n) => n > 0),
      display: `${formatNumber(mpg, 1)} MPG`,
      series: careerSeries((r) => {
        const m = perGame(r, "minutes");
        return m > 0 ? m : null;
      }),
      interpretation: "descriptive",
      showPercentile: false,
      showGrade: false,
    });
  }

  if (seasonStats.gamesPlayed > 0) {
    push({
      id: "gp",
      category: "role",
      label: "Games",
      value: seasonStats.gamesPlayed,
      values: pool.map((p) => p.gamesPlayed).filter((n) => n > 0),
      display: `${seasonStats.gamesPlayed} GP`,
      series: careerSeries((r) => (r.gamesPlayed > 0 ? r.gamesPlayed : null)),
      interpretation: "descriptive",
      showPercentile: false,
      showGrade: false,
    });
  }

  // --- Advanced (normalized rates / ratings only) ---
  // ORtg: include only when present (ESPN approx when derived). Missing stays missing.
  if (
    seasonStats.offensiveRating != null &&
    seasonStats.offensiveRating > 0
  ) {
    push({
      id: "ortg",
      category: "advanced",
      label: "Offensive rating",
      value: seasonStats.offensiveRating,
      values: pool
        .map((p) => p.offensiveRating)
        .filter((n): n is number => n != null && n > 0),
      display: formatNumber(seasonStats.offensiveRating, 1),
      series: careerSeries((r) =>
        r.offensiveRating != null && r.offensiveRating > 0
          ? r.offensiveRating
          : null
      ),
      interpretation: "higher_is_better",
    });
  }

  // DRtg / NET: only when a real value exists (not fabricated).
  if (
    seasonStats.defensiveRating != null &&
    Number.isFinite(seasonStats.defensiveRating)
  ) {
    push({
      id: "drtg",
      category: "advanced",
      label: "Defensive rating",
      value: seasonStats.defensiveRating,
      values: pool
        .map((p) => p.defensiveRating)
        .filter((n): n is number => n != null && Number.isFinite(n)),
      display: formatNumber(seasonStats.defensiveRating, 1),
      series: careerSeries((r) =>
        r.defensiveRating != null && Number.isFinite(r.defensiveRating)
          ? r.defensiveRating
          : null
      ),
      invert: true,
      interpretation: "lower_is_better",
    });
  }

  if (seasonStats.netRating != null && Number.isFinite(seasonStats.netRating)) {
    push({
      id: "net",
      category: "advanced",
      label: "Net rating",
      value: seasonStats.netRating,
      values: pool
        .map((p) => p.netRating)
        .filter((n): n is number => n != null && Number.isFinite(n)),
      display: formatNumber(seasonStats.netRating, 1),
      series: careerSeries((r) =>
        r.netRating != null && Number.isFinite(r.netRating) ? r.netRating : null
      ),
      interpretation: "higher_is_better",
    });
  }

  return metrics;
}

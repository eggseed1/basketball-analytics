/**
 * Player-page percentile metric definitions and peer ranking.
 * Classification / display semantics only — does not invent stats.
 */

import type { PlayerSeason } from "@/data/types";
import { hasValidDrblEstimate } from "@/data/queries/percentiles";
import { hustlePerGame } from "@/data/transformers/hustle-stats";
import { formatNumber, formatPct } from "@/lib/format";
import { teamChartColor } from "@/lib/nba-brand";
import { findSimilarForMetric } from "@/lib/player-stat-comps";
import type { PercentileCategory } from "@/lib/player-stat-sheet-registry";

export type { PercentileCategory } from "@/lib/player-stat-sheet-registry";

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
    fullSeason?: string;
    /** Raw metric for tooltips. */
    value: number;
    /** League percentile vs that season's qualified peers (0–100). */
    percentile?: number;
    teamId: string;
    teamAbbr: string;
    color: string;
  }>;
  leagueComps: import("@/lib/player-stat-comps").StatComp[];
  historicalComps: import("@/lib/player-stat-comps").StatComp[];
  interpretation: MetricInterpretation;
  showPercentile: boolean;
  showGrade: boolean;
  /** Present for left-rail snapshot; omit from Analytical Profile lists. */
  profileHidden?: boolean;
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

/** Metrics in the Advanced percentile tab (BRef box + ratings). */
export const ADVANCED_PERCENTILE_METRIC_IDS = new Set([
  "ortg",
  "drtg",
  "net",
  "per",
  "ws",
  "ows",
  "dws",
  "ws48",
  "bpm",
  "obpm",
  "dbpm",
  "vorp",
  "pie",
]);

export function isQualifiedPeer(row: PlayerSeason): boolean {
  return (
    row.gamesPlayed >= PLAYER_PERCENTILE_QUALIFY.minGames &&
    row.minutes / Math.max(1, row.gamesPlayed) >= PLAYER_PERCENTILE_QUALIFY.minMpg
  );
}

/**
 * Advanced box ratings exist only when the season was enriched with ORtg/DRtg.
 * Missing seasons are stored as 0 — do not chart those as real Net/DRtg.
 */
function hasTrackedAdvancedRatings(
  row: Pick<PlayerSeason, "offensiveRating" | "defensiveRating">
): boolean {
  return (
    row.offensiveRating != null &&
    row.offensiveRating > 0 &&
    row.defensiveRating != null &&
    row.defensiveRating > 0
  );
}

/** Prefer live DARKO overlay; fall back to canonical dpm when non-zero. */
function darkoImpact(
  row: Pick<PlayerSeason, "darkoDpm" | "dpm">
): number | null {
  if (row.darkoDpm != null && Number.isFinite(row.darkoDpm)) return row.darkoDpm;
  if (row.dpm != null && Number.isFinite(row.dpm) && row.dpm !== 0) return row.dpm;
  return null;
}

function darkoOffense(
  row: Pick<PlayerSeason, "darkoOff" | "oDpm">
): number | null {
  if (row.darkoOff != null && Number.isFinite(row.darkoOff)) return row.darkoOff;
  if (row.oDpm != null && Number.isFinite(row.oDpm) && row.oDpm !== 0)
    return row.oDpm;
  return null;
}

function darkoDefense(
  row: Pick<PlayerSeason, "darkoDef" | "dDpm">
): number | null {
  if (row.darkoDef != null && Number.isFinite(row.darkoDef)) return row.darkoDef;
  if (row.dDpm != null && Number.isFinite(row.dDpm) && row.dDpm !== 0)
    return row.dDpm;
  return null;
}

type CareerPoint = {
  /** Short axis label, e.g. "16-17". */
  season: string;
  /** Canonical season id, e.g. "2016-17". */
  fullSeason: string;
  value: number;
  percentile: number;
  teamId: string;
  teamAbbr: string;
  color: string;
};

/**
 * Build season percentile metrics for the player page.
 * Peer population: same season, GP/MPG qualification, missing values excluded.
 *
 * @param peersBySeason Optional map of season → peer board. When present,
 * career series percentiles are ranked vs each season's own peers; otherwise
 * each career value is ranked against the view-season peer pool.
 */
export function buildPlayerPercentileMetrics(
  seasonStats: PlayerSeason | null,
  career: PlayerSeason[],
  peers: PlayerSeason[],
  historicalPeers: PlayerSeason[],
  focalPlayerId: string,
  peersBySeason?: Map<string, PlayerSeason[]>
): PercentileMetric[] {
  if (!seasonStats) return [];

  const qualified = peers.filter(isQualifiedPeer);
  const pool = qualified.length ? qualified : peers;

  const historicalPool = (() => {
    const byKey = new Map<string, PlayerSeason>();
    const add = (rows: PlayerSeason[]) => {
      for (const row of rows) {
        if (row.season === seasonStats.season) continue;
        if (!isQualifiedPeer(row)) continue;
        byKey.set(`${row.playerId}|${row.season}`, row);
      }
    };
    if (peersBySeason?.size) {
      for (const board of peersBySeason.values()) add(board);
    }
    add(historicalPeers);
    const rows = [...byKey.values()];
    return rows.length ? rows : historicalPeers.filter(isQualifiedPeer);
  })();

  const peerValuesForSeason = (
    season: string,
    pick: (row: PlayerSeason) => number | null | undefined
  ): number[] => {
    const seasonPeers = peersBySeason?.get(season);
    const seasonBoard =
      seasonPeers && seasonPeers.length > 0 ? seasonPeers : peers;
    const q = seasonBoard.filter(isQualifiedPeer);
    const board = q.length ? q : seasonBoard;
    return board
      .map(pick)
      .filter((n): n is number => n != null && Number.isFinite(n));
  };

  const careerSeries = (
    pick: (row: PlayerSeason) => number | null | undefined,
    options?: { rejectFlatOverlay?: boolean; invert?: boolean }
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
        const values = peerValuesForSeason(r.season, pick);
        const rawPct = percentileOf(v, values);
        const percentile = options?.invert ? 100 - rawPct : rawPct;
        const { color, abbr } = teamChartColor(r.teamId);
        return {
          season: r.season.slice(2),
          fullSeason: r.season,
          value: v,
          percentile,
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
    profileHidden?: boolean;
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
      invert: opts.invert,
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
      profileHidden: opts.profileHidden,
    });
  };

  // --- Value (impact) — DRBL/100 + WAR1 + O/D for peer exploration in Overview.
  if (hasValidDrblEstimate(seasonStats)) {
    const drblPool = pool
      .filter(hasValidDrblEstimate)
      .map((p) => p.drbl100)
      .filter((n): n is number => Number.isFinite(n));
    if (drblPool.length) {
      push({
        id: "drbl100",
        category: "impact",
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
          category: "impact",
          label: "WAR1",
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
          category: "impact",
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
          category: "impact",
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
    // Diagnostics live under Advanced — not first-view Value/Overview.
    if (Number.isFinite(seasonStats.drblP)) {
      const pPool = pool
        .filter(hasValidDrblEstimate)
        .map((p) => p.drblP)
        .filter((n): n is number => Number.isFinite(n));
      if (pPool.length) {
        push({
          id: "drblP",
          category: "impact",
          label: "DRBL-P",
          value: seasonStats.drblP,
          values: pPool,
          display: formatNumber(seasonStats.drblP, 1),
          series: careerSeries((r) =>
            hasValidDrblEstimate(r) ? r.drblP : null
          ),
          interpretation: "higher_is_better",
        });
      }
    }
    if (Number.isFinite(seasonStats.drblLn)) {
      const lnPool = pool
        .filter(hasValidDrblEstimate)
        .map((p) => p.drblLn)
        .filter((n): n is number => Number.isFinite(n));
      if (lnPool.length) {
        push({
          id: "drblLn",
          category: "impact",
          label: "DRBL-LN",
          value: seasonStats.drblLn,
          values: lnPool,
          display: formatNumber(seasonStats.drblLn, 1),
          series: careerSeries((r) =>
            hasValidDrblEstimate(r) ? r.drblLn : null
          ),
          interpretation: "higher_is_better",
        });
      }
    }
    if (Number.isFinite(seasonStats.drblB)) {
      const bPool = pool
        .filter(hasValidDrblEstimate)
        .map((p) => p.drblB)
        .filter((n): n is number => Number.isFinite(n));
      if (bPool.length) {
        push({
          id: "drblB",
          category: "impact",
          label: "DRBL-B",
          value: seasonStats.drblB,
          values: bPool,
          display: formatNumber(seasonStats.drblB, 1),
          series: careerSeries((r) =>
            hasValidDrblEstimate(r) ? r.drblB : null
          ),
          interpretation: "higher_is_better",
        });
      }
    }
  }

  // --- Value (external impact) ---
  {
    const darkoValue = darkoImpact(seasonStats);
    if (darkoValue != null) {
      const darkoPool = pool
        .map(darkoImpact)
        .filter((n): n is number => n != null);
      if (darkoPool.length) {
        push({
          id: "darko",
          category: "impact",
          label: "DARKO",
          value: darkoValue,
          values: darkoPool,
          display: formatNumber(darkoValue, 2),
          series: careerSeries(darkoImpact, { rejectFlatOverlay: true }),
          interpretation: "higher_is_better",
        });
      }
    }
  }
  if (seasonStats.lebron != null && Number.isFinite(seasonStats.lebron)) {
    const lebronPool = pool
      .map((p) => p.lebron)
      .filter((n): n is number => n != null && Number.isFinite(n));
    if (lebronPool.length) {
      push({
        id: "lebron",
        category: "impact",
        label: "LEBRON",
        value: seasonStats.lebron,
        values: lebronPool,
        display: formatNumber(seasonStats.lebron, 2),
        series: careerSeries(
          (r) =>
            r.lebron != null && Number.isFinite(r.lebron) ? r.lebron : null,
          { rejectFlatOverlay: true }
        ),
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
        category: "impact",
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
    category: "counting",
    label: "PTS",
    value: ppg,
    values: pool.map((p) => perGame(p, "points")),
    display: `${formatNumber(ppg, 1)} PPG`,
    series: careerSeries((r) => perGame(r, "points")),
    interpretation: "higher_is_better",
  });

  const apg = perGame(seasonStats, "assists");
  push({
    id: "ast",
    category: "counting",
    label: "AST",
    value: apg,
    values: pool.map((p) => perGame(p, "assists")),
    display: `${formatNumber(apg, 1)} APG`,
    series: careerSeries((r) => perGame(r, "assists")),
    interpretation: "higher_is_better",
  });

  const rpg = perGame(seasonStats, "rebounds");
  push({
    id: "trb",
    category: "counting",
    label: "TRB",
    value: rpg,
    values: pool.map((p) => perGame(p, "rebounds")),
    display: `${formatNumber(rpg, 1)} RPG`,
    series: careerSeries((r) => perGame(r, "rebounds")),
    interpretation: "higher_is_better",
  });

  const tpg = perGame(seasonStats, "turnovers");
  push({
    id: "tov",
    category: "counting",
    label: "TOV",
    value: tpg,
    values: pool.map((p) => perGame(p, "turnovers")),
    display: `${formatNumber(tpg, 1)} TPG`,
    series: careerSeries((r) => perGame(r, "turnovers"), { invert: true }),
    invert: true,
    interpretation: "lower_is_better",
  });

  const orpg = perGame(seasonStats, "offensiveRebounds");
  if (orpg > 0) {
    push({
      id: "orb",
      category: "counting",
      label: "ORB",
      value: orpg,
      values: pool.map((p) => perGame(p, "offensiveRebounds")),
      display: `${formatNumber(orpg, 1)} ORPG`,
      series: careerSeries((r) => perGame(r, "offensiveRebounds")),
      interpretation: "higher_is_better",
    });
  }

  // Assist / turnover — playmaking efficiency (not raw turnover volume).
  if (tpg > 0 && apg > 0) {
    const atr = apg / tpg;
    push({
      id: "atr",
      category: "rates",
      label: "AST/TO",
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

  if (seasonStats.assistPct > 0) {
    push({
      id: "astPct",
      category: "rates",
      label: "AST%",
      value: seasonStats.assistPct,
      values: pool.map((p) => p.assistPct).filter((n) => n > 0),
      display: formatPct(seasonStats.assistPct),
      series: careerSeries((r) => (r.assistPct > 0 ? r.assistPct * 100 : null)),
      interpretation: "higher_is_better",
    });
  }

  if (seasonStats.turnoverPct > 0) {
    push({
      id: "tovPct",
      category: "rates",
      label: "TOV%",
      value: seasonStats.turnoverPct,
      values: pool.map((p) => p.turnoverPct).filter((n) => n > 0),
      display: formatPct(seasonStats.turnoverPct),
      series: careerSeries(
        (r) => (r.turnoverPct > 0 ? r.turnoverPct * 100 : null),
        { invert: true }
      ),
      invert: true,
      interpretation: "lower_is_better",
    });
  }

  if (seasonStats.offensiveReboundPct > 0) {
    push({
      id: "orbPct",
      category: "rates",
      label: "ORB%",
      value: seasonStats.offensiveReboundPct,
      values: pool.map((p) => p.offensiveReboundPct).filter((n) => n > 0),
      display: formatPct(seasonStats.offensiveReboundPct),
      series: careerSeries((r) =>
        r.offensiveReboundPct > 0 ? r.offensiveReboundPct * 100 : null
      ),
      interpretation: "higher_is_better",
    });
  }

  if (seasonStats.ows !== 0 && Number.isFinite(seasonStats.ows)) {
    const owsPool = pool
      .map((p) => p.ows)
      .filter((n) => Number.isFinite(n) && n !== 0);
    if (owsPool.length) {
      push({
        id: "ows",
        category: "advanced",
        label: "OWS",
        value: seasonStats.ows,
        values: owsPool,
        display: formatNumber(seasonStats.ows, 1),
        series: careerSeries((r) =>
          Number.isFinite(r.ows) && r.ows !== 0 ? r.ows : null
        ),
        interpretation: "higher_is_better",
      });
    }
  }

  if (seasonStats.obpm !== 0 && Number.isFinite(seasonStats.obpm)) {
    const obpmPool = pool
      .map((p) => p.obpm)
      .filter((n) => Number.isFinite(n));
    if (obpmPool.length) {
      push({
        id: "obpm",
        category: "advanced",
        label: "OBPM",
        value: seasonStats.obpm,
        values: obpmPool,
        display: formatNumber(seasonStats.obpm, 1),
        series: careerSeries((r) =>
          Number.isFinite(r.obpm) ? r.obpm : null
        ),
        interpretation: "higher_is_better",
      });
    }
  }

  if (seasonStats.darkoOff != null || darkoOffense(seasonStats) != null) {
    const darkoOffValue = darkoOffense(seasonStats);
    if (darkoOffValue != null) {
      const offPool = pool
        .map(darkoOffense)
        .filter((n): n is number => n != null);
      if (offPool.length) {
        push({
          id: "darko-off",
          category: "impact",
          label: "DARKO-O",
          value: darkoOffValue,
          values: offPool,
          display: formatNumber(darkoOffValue, 2),
          series: careerSeries(darkoOffense, { rejectFlatOverlay: true }),
          interpretation: "higher_is_better",
        });
      }
    }
  }
  if (seasonStats.oLebron != null) {
    const oPool = pool
      .map((p) => p.oLebron)
      .filter((n): n is number => n != null && Number.isFinite(n));
    if (oPool.length) {
      push({
        id: "olebron",
        category: "impact",
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
      label: "TS%",
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
      label: "eFG%",
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
      id: "fgPct",
      category: "shooting",
      label: "FG%",
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
      id: "fg3Pct",
      category: "shooting",
      label: "3P%",
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
      id: "ftPct",
      category: "shooting",
      label: "FT%",
      value: seasonStats.freeThrowPct,
      values: pool.map((p) => p.freeThrowPct).filter((n) => n > 0),
      display: formatPct(seasonStats.freeThrowPct),
      series: careerSeries((r) =>
        r.freeThrowPct > 0 ? r.freeThrowPct * 100 : null
      ),
      interpretation: "higher_is_better",
    });
  }
  if (seasonStats.twoPointPct > 0) {
    push({
      id: "fg2Pct",
      category: "shooting",
      label: "2P%",
      value: seasonStats.twoPointPct,
      values: pool.map((p) => p.twoPointPct).filter((n) => n > 0),
      display: formatPct(seasonStats.twoPointPct),
      series: careerSeries((r) =>
        r.twoPointPct > 0 ? r.twoPointPct * 100 : null
      ),
      interpretation: "higher_is_better",
    });
  }

  const fgm = perGame(seasonStats, "fieldGoalsMade");
  if (fgm > 0) {
    push({
      id: "fg",
      category: "shooting",
      label: "FG",
      value: fgm,
      values: pool.map((p) => perGame(p, "fieldGoalsMade")),
      display: `${formatNumber(fgm, 1)} FG`,
      series: careerSeries((r) => perGame(r, "fieldGoalsMade")),
      interpretation: "role",
      showPercentile: true,
      showGrade: false,
    });
  }
  const fg3m = perGame(seasonStats, "threePointersMade");
  if (fg3m > 0) {
    push({
      id: "fg3",
      category: "shooting",
      label: "3P",
      value: fg3m,
      values: pool.map((p) => perGame(p, "threePointersMade")),
      display: `${formatNumber(fg3m, 1)} 3P`,
      series: careerSeries((r) => perGame(r, "threePointersMade")),
      interpretation: "role",
      showPercentile: true,
      showGrade: false,
    });
  }
  const fg2m = fgm - fg3m;
  const fg2a =
    perGame(seasonStats, "fieldGoalsAttempted") -
    perGame(seasonStats, "threePointersAttempted");
  if (fg2m > 0) {
    push({
      id: "fg2",
      category: "shooting",
      label: "2P",
      value: fg2m,
      values: pool.map(
        (p) =>
          perGame(p, "fieldGoalsMade") - perGame(p, "threePointersMade")
      ),
      display: `${formatNumber(fg2m, 1)} 2P`,
      series: careerSeries(
        (r) => perGame(r, "fieldGoalsMade") - perGame(r, "threePointersMade")
      ),
      interpretation: "role",
      showPercentile: true,
      showGrade: false,
    });
  }
  if (fg2a > 0) {
    push({
      id: "fg2a",
      category: "shooting",
      label: "2PA",
      value: fg2a,
      values: pool.map(
        (p) =>
          perGame(p, "fieldGoalsAttempted") -
          perGame(p, "threePointersAttempted")
      ),
      display: `${formatNumber(fg2a, 1)} 2PA`,
      series: careerSeries(
        (r) =>
          perGame(r, "fieldGoalsAttempted") -
          perGame(r, "threePointersAttempted")
      ),
      interpretation: "role",
      showPercentile: true,
      showGrade: false,
    });
  }
  const ftm = perGame(seasonStats, "freeThrowsMade");
  if (ftm > 0) {
    push({
      id: "ft",
      category: "shooting",
      label: "FT",
      value: ftm,
      values: pool.map((p) => perGame(p, "freeThrowsMade")),
      display: `${formatNumber(ftm, 1)} FT`,
      series: careerSeries((r) => perGame(r, "freeThrowsMade")),
      interpretation: "role",
      showPercentile: true,
      showGrade: false,
    });
  }

  if (seasonStats.threePointAttemptRate > 0) {
    push({
      id: "threePar",
      category: "rates",
      label: "3PAr",
      value: seasonStats.threePointAttemptRate,
      values: pool.map((p) => p.threePointAttemptRate).filter((n) => n > 0),
      display: formatPct(seasonStats.threePointAttemptRate),
      series: careerSeries((r) =>
        r.threePointAttemptRate > 0 ? r.threePointAttemptRate * 100 : null
      ),
      interpretation: "role",
      showPercentile: true,
      showGrade: false,
    });
  }
  if (seasonStats.freeThrowRate > 0) {
    push({
      id: "ftr",
      category: "rates",
      label: "FTr",
      value: seasonStats.freeThrowRate,
      values: pool.map((p) => p.freeThrowRate).filter((n) => n > 0),
      display: formatNumber(seasonStats.freeThrowRate, 3),
      series: careerSeries((r) =>
        r.freeThrowRate > 0 ? r.freeThrowRate : null
      ),
      interpretation: "higher_is_better",
    });
  }

  // Volume attempts (BRef Per Game FGA / 3PA / FTA)
  const fga = perGame(seasonStats, "fieldGoalsAttempted");
  if (fga > 0) {
    push({
      id: "fga",
      category: "shooting",
      label: "FGA",
      value: fga,
      values: pool.map((p) => perGame(p, "fieldGoalsAttempted")),
      display: `${formatNumber(fga, 1)} FGA`,
      series: careerSeries((r) => perGame(r, "fieldGoalsAttempted")),
      interpretation: "role",
      showPercentile: true,
      showGrade: false,
    });
  }
  const fg3a = perGame(seasonStats, "threePointersAttempted");
  if (fg3a > 0) {
    push({
      id: "fg3aVol",
      category: "shooting",
      label: "3PA",
      value: fg3a,
      values: pool.map((p) => perGame(p, "threePointersAttempted")),
      display: `${formatNumber(fg3a, 1)} 3PA`,
      series: careerSeries((r) => perGame(r, "threePointersAttempted")),
      interpretation: "role",
      showPercentile: true,
      showGrade: false,
    });
  }
  const fta = perGame(seasonStats, "freeThrowsAttempted");
  if (fta > 0) {
    push({
      id: "fta",
      category: "shooting",
      label: "FTA",
      value: fta,
      values: pool.map((p) => perGame(p, "freeThrowsAttempted")),
      display: `${formatNumber(fta, 1)} FTA`,
      series: careerSeries((r) => perGame(r, "freeThrowsAttempted")),
      interpretation: "role",
      showPercentile: true,
      showGrade: false,
    });
  }

  if (seasonStats.sdv100 !== 0 && Number.isFinite(seasonStats.sdv100)) {
    const sdvPool = pool
      .map((p) => p.sdv100)
      .filter((n) => Number.isFinite(n) && n !== 0);
    if (sdvPool.length) {
      push({
        id: "sdv100",
        category: "shooting",
        label: "Shot-decision value",
        value: seasonStats.sdv100,
        values: sdvPool,
        display: formatNumber(seasonStats.sdv100, 1),
        series: careerSeries((r) =>
          Number.isFinite(r.sdv100) && r.sdv100 !== 0 ? r.sdv100 : null
        ),
        interpretation: "higher_is_better",
      });
    }
  }
  if (
    seasonStats.shotMaking100 !== 0 &&
    Number.isFinite(seasonStats.shotMaking100)
  ) {
    const smPool = pool
      .map((p) => p.shotMaking100)
      .filter((n) => Number.isFinite(n) && n !== 0);
    if (smPool.length) {
      push({
        id: "shotMaking100",
        category: "shooting",
        label: "Shot-making",
        value: seasonStats.shotMaking100,
        values: smPool,
        display: formatNumber(seasonStats.shotMaking100, 1),
        series: careerSeries((r) =>
          Number.isFinite(r.shotMaking100) && r.shotMaking100 !== 0
            ? r.shotMaking100
            : null
        ),
        interpretation: "higher_is_better",
      });
    }
  }

  // --- Defense ---
  const spg = perGame(seasonStats, "steals");
  push({
    id: "stl",
    category: "counting",
    label: "STL",
    value: spg,
    values: pool.map((p) => perGame(p, "steals")),
    display: `${formatNumber(spg, 1)} SPG`,
    series: careerSeries((r) => perGame(r, "steals")),
    interpretation: "higher_is_better",
  });
  const bpg = perGame(seasonStats, "blocks");
  push({
    id: "blk",
    category: "counting",
    label: "BLK",
    value: bpg,
    values: pool.map((p) => perGame(p, "blocks")),
    display: `${formatNumber(bpg, 1)} BPG`,
    series: careerSeries((r) => perGame(r, "blocks")),
    interpretation: "higher_is_better",
  });

  const drpg = perGame(seasonStats, "defensiveRebounds");
  if (drpg > 0) {
    push({
      id: "drb",
      category: "counting",
      label: "DRB",
      value: drpg,
      values: pool.map((p) => perGame(p, "defensiveRebounds")),
      display: `${formatNumber(drpg, 1)} DRPG`,
      series: careerSeries((r) => perGame(r, "defensiveRebounds")),
      interpretation: "higher_is_better",
    });
  }

  if (seasonStats.stealPct > 0) {
    push({
      id: "stlPct",
      category: "rates",
      label: "STL%",
      value: seasonStats.stealPct,
      values: pool.map((p) => p.stealPct).filter((n) => n > 0),
      display: formatPct(seasonStats.stealPct),
      series: careerSeries((r) => (r.stealPct > 0 ? r.stealPct * 100 : null)),
      interpretation: "higher_is_better",
    });
  }
  if (seasonStats.blockPct > 0) {
    push({
      id: "blkPct",
      category: "rates",
      label: "BLK%",
      value: seasonStats.blockPct,
      values: pool.map((p) => p.blockPct).filter((n) => n > 0),
      display: formatPct(seasonStats.blockPct),
      series: careerSeries((r) => (r.blockPct > 0 ? r.blockPct * 100 : null)),
      interpretation: "higher_is_better",
    });
  }
  if (seasonStats.defensiveReboundPct > 0) {
    push({
      id: "drbPct",
      category: "rates",
      label: "DRB%",
      value: seasonStats.defensiveReboundPct,
      values: pool.map((p) => p.defensiveReboundPct).filter((n) => n > 0),
      display: formatPct(seasonStats.defensiveReboundPct),
      series: careerSeries((r) =>
        r.defensiveReboundPct > 0 ? r.defensiveReboundPct * 100 : null
      ),
      interpretation: "higher_is_better",
    });
  }

  const hustleMetrics: Array<{
    id: string;
    label: string;
    key: keyof Pick<
      PlayerSeason,
      | "hustleDeflections"
      | "hustleContestedShots"
      | "hustleScreenAssists"
      | "hustleChargesDrawn"
      | "hustleLooseBallsRecovered"
      | "hustleBoxOuts"
    >;
    suffix: string;
  }> = [
    { id: "hustleDefl", label: "Deflections", key: "hustleDeflections", suffix: " defl" },
    {
      id: "hustleContest",
      label: "Contested shots",
      key: "hustleContestedShots",
      suffix: " contest",
    },
    {
      id: "hustleScrAst",
      label: "Screen assists",
      key: "hustleScreenAssists",
      suffix: " scr ast",
    },
    {
      id: "hustleChrg",
      label: "Charges drawn",
      key: "hustleChargesDrawn",
      suffix: " chrg",
    },
    {
      id: "hustleLoose",
      label: "Loose balls",
      key: "hustleLooseBallsRecovered",
      suffix: " loose",
    },
    { id: "hustleBoxOut", label: "Box outs", key: "hustleBoxOuts", suffix: " box" },
  ];

  for (const metric of hustleMetrics) {
    const value = hustlePerGame(seasonStats, metric.key);
    if (value == null) continue;
    const values = pool
      .map((p) => hustlePerGame(p, metric.key))
      .filter((n): n is number => n != null);
    if (!values.length) continue;
    push({
      id: metric.id,
      category: "hustle",
      label: metric.label,
      value,
      values,
      display: `${formatNumber(value, 1)}${metric.suffix}`,
      series: careerSeries((r) => hustlePerGame(r, metric.key)),
      interpretation: "higher_is_better",
    });
  }

  if (seasonStats.dws !== 0 && Number.isFinite(seasonStats.dws)) {
    const dwsPool = pool
      .map((p) => p.dws)
      .filter((n) => Number.isFinite(n) && n !== 0);
    if (dwsPool.length) {
      push({
        id: "dws",
        category: "advanced",
        label: "DWS",
        value: seasonStats.dws,
        values: dwsPool,
        display: formatNumber(seasonStats.dws, 1),
        series: careerSeries((r) =>
          Number.isFinite(r.dws) && r.dws !== 0 ? r.dws : null
        ),
        interpretation: "higher_is_better",
      });
    }
  }

  if (Number.isFinite(seasonStats.dbpm)) {
    const dbpmPool = pool.map((p) => p.dbpm).filter((n) => Number.isFinite(n));
    if (dbpmPool.length) {
      push({
        id: "dbpm",
        category: "advanced",
        label: "DBPM",
        value: seasonStats.dbpm,
        values: dbpmPool,
        display: formatNumber(seasonStats.dbpm, 1),
        series: careerSeries((r) =>
          Number.isFinite(r.dbpm) ? r.dbpm : null
        ),
        interpretation: "higher_is_better",
      });
    }
  }
  {
    const darkoDefValue = darkoDefense(seasonStats);
    if (darkoDefValue != null) {
      const defPool = pool
        .map(darkoDefense)
        .filter((n): n is number => n != null);
      if (defPool.length) {
        push({
          id: "darko-def",
          category: "impact",
          label: "DARKO-D",
          value: darkoDefValue,
          values: defPool,
          display: formatNumber(darkoDefValue, 2),
          series: careerSeries(darkoDefense, { rejectFlatOverlay: true }),
          interpretation: "higher_is_better",
        });
      }
    }
  }
  if (seasonStats.dLebron != null) {
    const dPool = pool
      .map((p) => p.dLebron)
      .filter((n): n is number => n != null && Number.isFinite(n));
    if (dPool.length) {
      push({
        id: "dlebron",
        category: "impact",
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
      category: "rates",
      label: "USG%",
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
      category: "counting",
      label: "MP",
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
      category: "counting",
      label: "G",
      value: seasonStats.gamesPlayed,
      values: pool.map((p) => p.gamesPlayed).filter((n) => n > 0),
      display: `${seasonStats.gamesPlayed} GP`,
      series: careerSeries((r) => (r.gamesPlayed > 0 ? r.gamesPlayed : null)),
      interpretation: "descriptive",
      showPercentile: false,
      showGrade: false,
    });
  }

  if (seasonStats.gamesStarted > 0 || seasonStats.gamesPlayed > 0) {
    push({
      id: "gs",
      category: "counting",
      label: "GS",
      value: seasonStats.gamesStarted,
      values: pool.map((p) => p.gamesStarted),
      display: `${seasonStats.gamesStarted} GS`,
      series: careerSeries((r) => r.gamesStarted),
      interpretation: "descriptive",
      showPercentile: false,
      showGrade: false,
    });
    if (seasonStats.gamesPlayed > 0) {
      const startRate = seasonStats.gamesStarted / seasonStats.gamesPlayed;
      push({
        id: "startRate",
        category: "rates",
        label: "Start rate",
        value: startRate,
        values: pool
          .filter((p) => p.gamesPlayed > 0)
          .map((p) => p.gamesStarted / p.gamesPlayed),
        display: formatPct(startRate, 0),
        series: careerSeries((r) =>
          r.gamesPlayed > 0 ? (r.gamesStarted / r.gamesPlayed) * 100 : null
        ),
        interpretation: "role",
        showPercentile: true,
        showGrade: false,
      });
    }
  }

  const pf = perGame(seasonStats, "personalFouls");
  push({
    id: "pf",
    category: "counting",
    label: "PF",
    value: pf,
    values: pool.map((p) => perGame(p, "personalFouls")),
    display: `${formatNumber(pf, 1)} PF`,
    series: careerSeries((r) => perGame(r, "personalFouls"), { invert: true }),
    invert: true,
    interpretation: "lower_is_better",
  });

  if (seasonStats.reboundPct > 0) {
    push({
      id: "trbPct",
      category: "rates",
      label: "TRB%",
      value: seasonStats.reboundPct,
      values: pool.map((p) => p.reboundPct).filter((n) => n > 0),
      display: formatPct(seasonStats.reboundPct),
      series: careerSeries((r) =>
        r.reboundPct > 0 ? r.reboundPct * 100 : null
      ),
      interpretation: "role",
      showPercentile: true,
      showGrade: false,
    });
  }

  // --- Advanced (BRef box + ratings) ---
  if (Number.isFinite(seasonStats.plusMinus)) {
    const pm = perGame(seasonStats, "plusMinus");
    const pmPool = pool.map((p) => perGame(p, "plusMinus"));
    push({
      id: "plusMinus",
      category: "counting",
      label: "+/-",
      value: pm,
      values: pmPool,
      display: `${pm >= 0 ? "+" : ""}${formatNumber(pm, 1)}`,
      series: careerSeries((r) => perGame(r, "plusMinus")),
      interpretation: "higher_is_better",
    });
  }

  if (Number.isFinite(seasonStats.per) && seasonStats.per !== 0) {
    const perPool = pool
      .map((p) => p.per)
      .filter((n) => Number.isFinite(n) && n !== 0);
    if (perPool.length) {
      push({
        id: "per",
        category: "advanced",
        label: "PER",
        value: seasonStats.per,
        values: perPool,
        display: formatNumber(seasonStats.per, 1),
        series: careerSeries((r) =>
          Number.isFinite(r.per) && r.per !== 0 ? r.per : null
        ),
        interpretation: "higher_is_better",
      });
    }
  }

  if (Number.isFinite(seasonStats.winShares) && seasonStats.winShares !== 0) {
    const wsPool = pool
      .map((p) => p.winShares)
      .filter((n) => Number.isFinite(n) && n !== 0);
    if (wsPool.length) {
      push({
        id: "ws",
        category: "advanced",
        label: "WS",
        value: seasonStats.winShares,
        values: wsPool,
        display: formatNumber(seasonStats.winShares, 1),
        series: careerSeries((r) =>
          Number.isFinite(r.winShares) && r.winShares !== 0 ? r.winShares : null
        ),
        interpretation: "higher_is_better",
      });
    }
  }

  if (
    Number.isFinite(seasonStats.winSharesPer48) &&
    seasonStats.winSharesPer48 !== 0
  ) {
    const ws48Pool = pool
      .map((p) => p.winSharesPer48)
      .filter((n) => Number.isFinite(n) && n !== 0);
    if (ws48Pool.length) {
      push({
        id: "ws48",
        category: "advanced",
        label: "WS/48",
        value: seasonStats.winSharesPer48,
        values: ws48Pool,
        display: formatNumber(seasonStats.winSharesPer48, 3),
        series: careerSeries((r) =>
          Number.isFinite(r.winSharesPer48) && r.winSharesPer48 !== 0
            ? r.winSharesPer48
            : null
        ),
        interpretation: "higher_is_better",
      });
    }
  }

  if (Number.isFinite(seasonStats.bpm)) {
    const bpmPool = pool.map((p) => p.bpm).filter((n) => Number.isFinite(n));
    if (bpmPool.length) {
      push({
        id: "bpm",
        category: "advanced",
        label: "BPM",
        value: seasonStats.bpm,
        values: bpmPool,
        display: formatNumber(seasonStats.bpm, 1),
        series: careerSeries((r) => (Number.isFinite(r.bpm) ? r.bpm : null)),
        interpretation: "higher_is_better",
      });
    }
  }

  if (Number.isFinite(seasonStats.vorp) && seasonStats.vorp !== 0) {
    const vorpPool = pool
      .map((p) => p.vorp)
      .filter((n) => Number.isFinite(n) && n !== 0);
    if (vorpPool.length) {
      push({
        id: "vorp",
        category: "advanced",
        label: "VORP",
        value: seasonStats.vorp,
        values: vorpPool,
        display: formatNumber(seasonStats.vorp, 1),
        series: careerSeries((r) =>
          Number.isFinite(r.vorp) && r.vorp !== 0 ? r.vorp : null
        ),
        interpretation: "higher_is_better",
      });
    }
  }

  if (Number.isFinite(seasonStats.pie) && seasonStats.pie > 0) {
    const piePool = pool.map((p) => p.pie).filter((n) => n > 0);
    if (piePool.length) {
      push({
        id: "pie",
        category: "advanced",
        label: "PIE",
        value: seasonStats.pie,
        values: piePool,
        display: formatPct(seasonStats.pie),
        series: careerSeries((r) => (r.pie > 0 ? r.pie * 100 : null)),
        interpretation: "higher_is_better",
      });
    }
  }

  // ORtg: include only when present (ESPN approx when derived). Missing stays missing.
  if (
    seasonStats.offensiveRating != null &&
    seasonStats.offensiveRating > 0
  ) {
    push({
      id: "ortg",
      category: "advanced",
      label: "ORtg",
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

  // DRtg / NET: only when advanced ratings were actually tracked (not default 0).
  if (
    hasTrackedAdvancedRatings(seasonStats) &&
    seasonStats.defensiveRating != null &&
    Number.isFinite(seasonStats.defensiveRating)
  ) {
    push({
      id: "drtg",
      category: "advanced",
      label: "DRtg",
      value: seasonStats.defensiveRating,
      values: pool
        .filter(hasTrackedAdvancedRatings)
        .map((p) => p.defensiveRating)
        .filter((n): n is number => n != null && Number.isFinite(n) && n > 0),
      display: formatNumber(seasonStats.defensiveRating, 1),
      series: careerSeries(
        (r) =>
          hasTrackedAdvancedRatings(r) &&
          r.defensiveRating != null &&
          Number.isFinite(r.defensiveRating)
            ? r.defensiveRating
            : null,
        { invert: true }
      ),
      invert: true,
      interpretation: "lower_is_better",
    });
  }

  if (
    hasTrackedAdvancedRatings(seasonStats) &&
    seasonStats.netRating != null &&
    Number.isFinite(seasonStats.netRating)
  ) {
    push({
      id: "net",
      category: "advanced",
      label: "NET",
      value: seasonStats.netRating,
      values: pool
        .filter(hasTrackedAdvancedRatings)
        .map((p) => p.netRating)
        .filter((n): n is number => n != null && Number.isFinite(n)),
      display: formatNumber(seasonStats.netRating, 1),
      series: careerSeries((r) =>
        hasTrackedAdvancedRatings(r) &&
        r.netRating != null &&
        Number.isFinite(r.netRating)
          ? r.netRating
          : null
      ),
      interpretation: "higher_is_better",
    });
  }

  return metrics;
}

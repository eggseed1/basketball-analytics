/**
 * Team season / team-vs-team comparison.
 *
 * Same product philosophy as Player Season Compare:
 * metric tolerances → category plurality → overall category plurality.
 * No opaque universal team score.
 *
 * Does not modify analyzeTeamProfile or Player Season Compare.
 */

import type { ComparisonDimension } from "@/analytics/types";
import type { TeamSeasonStats } from "@/data/types/team-season";
import { formatNumber, formatPct } from "@/lib/format";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";

export const TEAM_SEASON_COMPARE_VERSION = "1.0";

/**
 * Absolute tolerances - align with Team Arc / analyzeTeamProfile noise floors
 * where those exist; otherwise documented team-board deltas.
 */
export const TEAM_SEASON_COMPARE_TOLERANCE = {
  /** Point differential (matches analyzeTeamProfile). */
  diff: 0.8,
  ppg: 1.0,
  oppPpg: 1.0,
  /** Fraction scale - 0.008 ≈ 0.8 percentage points (matches analyzeTeamProfile). */
  pct: 0.008,
  asttov: 0.15,
  tov: 0.4,
  stl: 0.4,
  blk: 0.4,
  gp: 3,
} as const;

/** Below this GP → limited sample / not eligible for overall verdict. */
export const TEAM_COMPARE_MIN_GAMES = 20;

export type TeamCompareEdge = "a" | "b" | "even" | "unavailable";

export type TeamCompareCategoryId =
  | "performance"
  | "efficiency"
  | "shooting"
  | "rebounding"
  | "possession";

export type TeamCompareMetricRow = ComparisonDimension & {
  category: TeamCompareCategoryId;
  edge: TeamCompareEdge;
  higherIsBetter: boolean;
};

export type TeamCompareCategoryWinner = {
  id: TeamCompareCategoryId;
  label: string;
  edge: TeamCompareEdge;
  evidenceIds: string[];
  note?: string;
};

export type TeamCompareSideCoverage = {
  teamId: string;
  abbreviation: string;
  fullName: string;
  season: string;
  gamesPlayed: number;
  qualifying: boolean;
  incomplete: boolean;
  thin: boolean;
};

export type TeamSeasonCompareMethodology = {
  version: string;
  scope: "regular_season";
  qualifyingRule: string;
  toleranceNote: string;
  categoryRule: string;
  overallRule: string;
  incompleteNote: string;
  continuityNote: string;
};

export type TeamSeasonComparison = {
  mode: "same_team" | "cross_team";
  sideA: {
    teamId: string;
    abbreviation: string;
    fullName: string;
    season: string;
  };
  sideB: {
    teamId: string;
    abbreviation: string;
    fullName: string;
    season: string;
  };
  scope: "regular_season";
  metrics: TeamCompareMetricRow[];
  categories: TeamCompareCategoryWinner[];
  overall: {
    edge: TeamCompareEdge;
    reason: string;
  };
  howDifferent: {
    aStronger: string[];
    bStronger: string[];
    notes: string[];
  };
  coverage: {
    a: TeamCompareSideCoverage;
    b: TeamCompareSideCoverage;
  };
  methodology: TeamSeasonCompareMethodology;
  insufficientReason: string | null;
};

export const TEAM_SEASON_COMPARE_METHODOLOGY: TeamSeasonCompareMethodology = {
  version: TEAM_SEASON_COMPARE_VERSION,
  scope: "regular_season",
  qualifyingRule: `Each side needs ≥${TEAM_COMPARE_MIN_GAMES} GP for an overall verdict. Thin seasons still show metric rows when present.`,
  toleranceNote:
    "Each metric has a documented absolute tolerance (aligned with Team Arc / analyzeTeamProfile floors where applicable). Inside the tolerance → essentially even.",
  categoryRule:
    "Category winner = plurality of decisive metric edges in that category. Ties or no decisive metrics → essentially even / unavailable.",
  overallRule:
    "Overall = plurality of decisive category winners among available categories. No opaque universal team score.",
  incompleteNote:
    "Current in-progress seasons are flagged incomplete. They remain comparable as snapshots.",
  continuityNote:
    "Sides are identified by ESPN team id + season. No franchise merges.",
};

const CATEGORY_LABELS: Record<TeamCompareCategoryId, string> = {
  performance: "Performance",
  efficiency: "Efficiency",
  shooting: "Shooting",
  rebounding: "Rebounding",
  possession: "Possessions",
};

function finitePositivePct(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  return n;
}

function finiteNumber(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return n;
}

function threePointAttemptRate(row: TeamSeasonStats): number | null {
  if (!(row.fieldGoalsAttempted > 0)) return null;
  const rate = row.threePointersAttempted / row.fieldGoalsAttempted;
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function edgeFromDelta(
  deltaAMinusB: number,
  tolerance: number
): TeamCompareEdge {
  if (!Number.isFinite(deltaAMinusB)) return "unavailable";
  if (Math.abs(deltaAMinusB) < tolerance) return "even";
  return deltaAMinusB > 0 ? "a" : "b";
}

function pushMetric(
  out: TeamCompareMetricRow[],
  options: {
    id: string;
    label: string;
    category: TeamCompareCategoryId;
    aRaw: number | null;
    bRaw: number | null;
    format: (v: number) => string;
    tolerance: number;
    higherIsBetter?: boolean;
    note?: string;
  }
) {
  const higherIsBetter = options.higherIsBetter !== false;
  const { aRaw, bRaw } = options;
  if (aRaw == null && bRaw == null) return;
  if (aRaw == null || bRaw == null) {
    out.push({
      id: options.id,
      label: options.label,
      category: options.category,
      aDisplay: aRaw != null ? options.format(aRaw) : "-",
      bDisplay: bRaw != null ? options.format(bRaw) : "-",
      aValue: aRaw ?? undefined,
      bValue: bRaw ?? undefined,
      edge: "unavailable",
      higherIsBetter,
      note:
        options.note ??
        "Metric missing for one side - excluded from head-to-head edge.",
      delta: undefined,
    });
    return;
  }

  const signed = higherIsBetter ? aRaw - bRaw : bRaw - aRaw;
  const edge = edgeFromDelta(signed, options.tolerance);
  out.push({
    id: options.id,
    label: options.label,
    category: options.category,
    aDisplay: options.format(aRaw),
    bDisplay: options.format(bRaw),
    aValue: aRaw,
    bValue: bRaw,
    edge,
    higherIsBetter,
    delta:
      edge === "even"
        ? 0
        : edge === "a"
          ? Math.abs(signed)
          : -Math.abs(signed),
    note: options.note,
  });
}

function coverageFor(
  row: TeamSeasonStats,
  nowSeason: string
): TeamCompareSideCoverage {
  const thin = row.gamesPlayed > 0 && row.gamesPlayed < TEAM_COMPARE_MIN_GAMES;
  return {
    teamId: row.teamId,
    abbreviation: row.abbreviation,
    fullName: row.fullName,
    season: row.season,
    gamesPlayed: row.gamesPlayed,
    qualifying: row.gamesPlayed >= TEAM_COMPARE_MIN_GAMES,
    incomplete: row.season === nowSeason && row.gamesPlayed < 50,
    thin,
  };
}

function categoryWinner(
  id: TeamCompareCategoryId,
  metrics: TeamCompareMetricRow[]
): TeamCompareCategoryWinner | null {
  const rows = metrics.filter((m) => m.category === id);
  if (!rows.length) return null;
  const decisive = rows.filter((m) => m.edge === "a" || m.edge === "b");
  if (!decisive.length) {
    const anyHeadToHead = rows.some((m) => m.edge === "even");
    return {
      id,
      label: CATEGORY_LABELS[id],
      edge: anyHeadToHead ? "even" : "unavailable",
      evidenceIds: rows.map((r) => r.id),
      note: anyHeadToHead
        ? "Available metrics are essentially even."
        : "No head-to-head metrics in this category.",
    };
  }
  let a = 0;
  let b = 0;
  for (const m of decisive) {
    if (m.edge === "a") a += 1;
    else b += 1;
  }
  const edge: TeamCompareEdge = a === b ? "even" : a > b ? "a" : "b";
  return {
    id,
    label: CATEGORY_LABELS[id],
    edge,
    evidenceIds: decisive.map((d) => d.id),
    note:
      edge === "even"
        ? `Split ${a}-${b} among decisive metrics.`
        : `Leads ${Math.max(a, b)}-${Math.min(a, b)} among decisive metrics.`,
  };
}

function overallFromCategories(
  categories: TeamCompareCategoryWinner[],
  coverage: TeamSeasonComparison["coverage"]
): { edge: TeamCompareEdge; reason: string } {
  if (!coverage.a.qualifying || !coverage.b.qualifying) {
    return {
      edge: "unavailable",
      reason:
        "Overall verdict withheld - at least one side lacks a qualifying sample (≥20 GP).",
    };
  }

  const decisive = categories.filter((c) => c.edge === "a" || c.edge === "b");
  if (!decisive.length) {
    return {
      edge: "even",
      reason:
        "No decisive category edges among available regular-season team-board metrics.",
    };
  }
  let a = 0;
  let b = 0;
  for (const c of decisive) {
    if (c.edge === "a") a += 1;
    else b += 1;
  }
  if (a === b) {
    return {
      edge: "even",
      reason: `Categories split ${a}-${b} (${decisive
        .map((c) => c.label)
        .join(", ")}). Mixed profile.`,
    };
  }
  const edge: TeamCompareEdge = a > b ? "a" : "b";
  const winners = decisive
    .filter((c) => c.edge === edge)
    .map((c) => c.label);
  return {
    edge,
    reason: `Leads ${Math.max(a, b)}-${Math.min(a, b)} categories (${winners.join(", ")}).`,
  };
}

function howDifferentLines(
  labelA: string,
  labelB: string,
  metrics: TeamCompareMetricRow[]
): TeamSeasonComparison["howDifferent"] {
  const aStronger: string[] = [];
  const bStronger: string[] = [];
  const notes: string[] = [];
  for (const m of metrics) {
    if (m.edge === "a") aStronger.push(`${m.label} (${m.aDisplay} vs ${m.bDisplay})`);
    else if (m.edge === "b")
      bStronger.push(`${m.label} (${m.bDisplay} vs ${m.aDisplay})`);
    else if (m.edge === "unavailable")
      notes.push(`${m.label}: comparison unavailable`);
  }
  if (!aStronger.length && !bStronger.length && !notes.length) {
    notes.push("All compared metrics are essentially even within tolerance.");
  }
  return {
    aStronger: aStronger.slice(0, 8),
    bStronger: bStronger.slice(0, 8),
    notes: notes.slice(0, 6),
  };
}

function sideLabel(row: TeamSeasonStats): string {
  return `${row.abbreviation} ${row.season}`;
}

export function compareTeamSeasons(options: {
  teamA: TeamSeasonStats;
  teamB: TeamSeasonStats;
  nowSeason?: string;
}): TeamSeasonComparison {
  const a = options.teamA;
  const b = options.teamB;
  const nowSeason =
    options.nowSeason ??
    canonicalSeasonFromStartYear(currentNbaStartYear());

  const mode: TeamSeasonComparison["mode"] =
    a.teamId === b.teamId ? "same_team" : "cross_team";

  const coverage = {
    a: coverageFor(a, nowSeason),
    b: coverageFor(b, nowSeason),
  };

  const metrics: TeamCompareMetricRow[] = [];

  // --- Performance ---
  pushMetric(metrics, {
    id: "diff",
    label: "Point differential",
    category: "performance",
    aRaw: finiteNumber(a.avgDiff),
    bRaw: finiteNumber(b.avgDiff),
    format: (v) => `${v >= 0 ? "+" : ""}${formatNumber(v, 1)}`,
    tolerance: TEAM_SEASON_COMPARE_TOLERANCE.diff,
  });
  pushMetric(metrics, {
    id: "ppg",
    label: "PPG",
    category: "performance",
    aRaw: a.ppg > 0 ? a.ppg : null,
    bRaw: b.ppg > 0 ? b.ppg : null,
    format: (v) => formatNumber(v, 1),
    tolerance: TEAM_SEASON_COMPARE_TOLERANCE.ppg,
  });
  pushMetric(metrics, {
    id: "opp",
    label: "Opponent PPG",
    category: "performance",
    aRaw: a.oppPpg > 0 ? a.oppPpg : null,
    bRaw: b.oppPpg > 0 ? b.oppPpg : null,
    format: (v) => formatNumber(v, 1),
    tolerance: TEAM_SEASON_COMPARE_TOLERANCE.oppPpg,
    higherIsBetter: false,
  });

  // --- Efficiency ---
  pushMetric(metrics, {
    id: "ts",
    label: "TS%",
    category: "efficiency",
    aRaw: finitePositivePct(a.trueShootingPct),
    bRaw: finitePositivePct(b.trueShootingPct),
    format: (v) => formatPct(v),
    tolerance: TEAM_SEASON_COMPARE_TOLERANCE.pct,
  });
  pushMetric(metrics, {
    id: "efg",
    label: "eFG%",
    category: "efficiency",
    aRaw: finitePositivePct(a.effectiveFieldGoalPct),
    bRaw: finitePositivePct(b.effectiveFieldGoalPct),
    format: (v) => formatPct(v),
    tolerance: TEAM_SEASON_COMPARE_TOLERANCE.pct,
  });

  // --- Shooting ---
  pushMetric(metrics, {
    id: "fg3",
    label: "3P%",
    category: "shooting",
    aRaw: finitePositivePct(a.threePointPct),
    bRaw: finitePositivePct(b.threePointPct),
    format: (v) => formatPct(v),
    tolerance: TEAM_SEASON_COMPARE_TOLERANCE.pct,
  });
  pushMetric(metrics, {
    id: "3par",
    label: "3P volume",
    category: "shooting",
    aRaw: threePointAttemptRate(a),
    bRaw: threePointAttemptRate(b),
    format: (v) => formatPct(v),
    tolerance: TEAM_SEASON_COMPARE_TOLERANCE.pct,
    note: "3PA / FGA",
  });

  // --- Rebounding ---
  pushMetric(metrics, {
    id: "orb",
    label: "Offensive rebound %",
    category: "rebounding",
    aRaw: finitePositivePct(a.offensiveReboundPct),
    bRaw: finitePositivePct(b.offensiveReboundPct),
    format: (v) => formatPct(v),
    tolerance: TEAM_SEASON_COMPARE_TOLERANCE.pct,
  });

  // --- Possession profile ---
  pushMetric(metrics, {
    id: "tov",
    label: "Turnovers / game",
    category: "possession",
    aRaw: finiteNumber(a.topg),
    bRaw: finiteNumber(b.topg),
    format: (v) => formatNumber(v, 1),
    tolerance: TEAM_SEASON_COMPARE_TOLERANCE.tov,
    higherIsBetter: false,
  });
  pushMetric(metrics, {
    id: "asttov",
    label: "Assist / turnover",
    category: "possession",
    aRaw: finiteNumber(a.assistToTurnover),
    bRaw: finiteNumber(b.assistToTurnover),
    format: (v) => formatNumber(v, 2),
    tolerance: TEAM_SEASON_COMPARE_TOLERANCE.asttov,
  });

  const categoryOrder: TeamCompareCategoryId[] = [
    "performance",
    "efficiency",
    "shooting",
    "rebounding",
    "possession",
  ];
  const categories = categoryOrder
    .map((id) => categoryWinner(id, metrics))
    .filter((c): c is TeamCompareCategoryWinner => c != null);

  let insufficientReason: string | null = null;
  if (!coverage.a.qualifying || !coverage.b.qualifying) {
    insufficientReason =
      "At least one side is below the qualifying sample floor (≥20 GP) for overall verdicts.";
  }
  if (coverage.a.incomplete || coverage.b.incomplete) {
    insufficientReason = [
      insufficientReason,
      "At least one side is an in-progress current-season snapshot.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  const overall = overallFromCategories(categories, coverage);
  const howDifferent = howDifferentLines(sideLabel(a), sideLabel(b), metrics);

  return {
    mode,
    sideA: {
      teamId: a.teamId,
      abbreviation: a.abbreviation,
      fullName: a.fullName,
      season: a.season,
    },
    sideB: {
      teamId: b.teamId,
      abbreviation: b.abbreviation,
      fullName: b.fullName,
      season: b.season,
    },
    scope: "regular_season",
    metrics,
    categories,
    overall,
    howDifferent,
    coverage,
    methodology: TEAM_SEASON_COMPARE_METHODOLOGY,
    insufficientReason,
  };
}

export function teamComparePath(options: {
  teamA: string;
  teamB: string;
  seasonA: string;
  seasonB: string;
}): string {
  const params = new URLSearchParams({
    mode: "teams",
    teamA: options.teamA,
    teamB: options.teamB,
    seasonA: options.seasonA,
    seasonB: options.seasonB,
  });
  return `/compare?${params.toString()}`;
}

export function teamCompareEdgeLabel(
  edge: TeamCompareEdge,
  labelA: string,
  labelB: string
): string {
  switch (edge) {
    case "a":
      return `${labelA} stronger`;
    case "b":
      return `${labelB} stronger`;
    case "even":
      return "Essentially even";
    case "unavailable":
      return "Insufficient evidence";
  }
}

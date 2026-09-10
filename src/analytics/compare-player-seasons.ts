/**
 * Same-player season comparison ("Best Season Lab").
 *
 * Answers "which version of this player was better?" by dimension -
 * never a single opaque universal score.
 *
 * CPI is production only (careerProductionIndex). Impact only when
 * season-true observations exist for BOTH seasons.
 */

import {
  CAREER_RESUME_MIN_GAMES,
  careerProductionIndex,
  isCareerQualifyingSeason,
} from "@/analytics/career-resume";
import type { ComparisonDimension } from "@/analytics/types";
import type { PlayerSeason } from "@/data/types";
import type { TeamSeasonStats } from "@/data/types/team-season";
import { formatNumber, formatPct } from "@/lib/format";
import { METRIC_PICKERS } from "@/lib/player-stat-comps";
import { hasValidDrblEstimate } from "@/data/queries/percentiles";
import { NON_ADDITIVE_COMPONENT_WARNING } from "@/query-engine/drbl-vocabulary";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";

export const PLAYER_SEASON_COMPARE_VERSION = "1.0";

/** Absolute tolerances: |Δ| below → "essentially even". */
export const SEASON_COMPARE_TOLERANCE = {
  ppg: 0.5,
  apg: 0.4,
  rpg: 0.4,
  spg: 0.15,
  bpg: 0.15,
  tov: 0.25,
  pct: 0.01, // 1 percentage point on [0,1] fractions
  rating: 1.5,
  usage: 0.015,
  mpg: 1.5,
  gp: 3,
  cpi: 1.25,
  impact: 0.2,
  teamDiff: 1.5,
} as const;

export type SeasonCompareEdge = "a" | "b" | "even" | "unavailable";

export type SeasonCompareCategoryId =
  | "production"
  | "efficiency"
  | "role"
  | "offense"
  | "defense"
  | "playmaking"
  | "rebounding"
  | "shooting"
  | "impact"
  | "ability"
  | "realized_value"
  | "diagnostic"
  | "team_context"
  | "availability";

export type SeasonImpactSnapshot = {
  metricId: string;
  label: string;
  value: number;
  source: string;
};

export type SeasonCoverageSnapshot = {
  season: string;
  teamId: string;
  teamName: string;
  gamesPlayed: number;
  minutes: number;
  mpg: number;
  qualifying: boolean;
  incomplete: boolean;
  production: boolean;
  efficiency: boolean;
  historicalImpact: boolean;
  teamContext: boolean;
};

export type SeasonMetricRow = ComparisonDimension & {
  category: SeasonCompareCategoryId;
  edge: SeasonCompareEdge;
  higherIsBetter: boolean;
};

export type SeasonCategoryWinner = {
  id: SeasonCompareCategoryId;
  label: string;
  edge: SeasonCompareEdge;
  evidenceIds: string[];
  note?: string;
};

export type PlayerSeasonCompareMethodology = {
  version: string;
  scope: "regular_season";
  qualifyingRule: string;
  toleranceNote: string;
  categoryRule: string;
  overallRule: string;
  impactRule: string;
  cpiNote: string;
  incompleteNote: string;
};

export type PlayerSeasonComparison = {
  playerId: string;
  playerName: string;
  seasonA: string;
  seasonB: string;
  scope: "regular_season";
  metrics: SeasonMetricRow[];
  categories: SeasonCategoryWinner[];
  overall: {
    edge: SeasonCompareEdge;
    reason: string;
  };
  howDifferent: {
    aStronger: string[];
    bStronger: string[];
    notes: string[];
  };
  coverage: {
    a: SeasonCoverageSnapshot;
    b: SeasonCoverageSnapshot;
  };
  methodology: PlayerSeasonCompareMethodology;
  insufficientReason: string | null;
};

export const PLAYER_SEASON_COMPARE_METHODOLOGY: PlayerSeasonCompareMethodology =
  {
    version: PLAYER_SEASON_COMPARE_VERSION,
    scope: "regular_season",
    qualifyingRule: `A season needs Career Resume qualification (≥${CAREER_RESUME_MIN_GAMES} GP / 15 MPG, or shortened-season accommodation) for an overall verdict. Under-qualified seasons can still show metric rows but overall is "insufficient sample."`,
    toleranceNote:
      "Each metric has a documented absolute tolerance. Differences inside the tolerance are labeled essentially even - not forced edges.",
    categoryRule:
      "Category winner = plurality of decisive metric edges in that category. Ties or no decisive metrics → essentially even / unavailable.",
    overallRule:
      "Overall = plurality of decisive category winners among available categories. Impact and team context participate only when covered for both seasons. No opaque universal season score.",
    impactRule:
      "DRBL/100 participates when both seasons have valid estimates (registry seasons only). Otherwise historical impact participates only when the same season-true metric (DARKO or RAPTOR) exists for BOTH seasons. Live DARKO stamped on one year is never compared to a year without it. CPI is never substituted for missing impact. Diagnostic P/LN/B are disclosed separately and are not additive into DRBL/100.",
    cpiNote:
      "CPI (Career Production Index) is a documented box-score production composite - not impact, WAR, or true value.",
    incompleteNote:
      "Current in-progress seasons are flagged. They remain comparable as snapshots but are marked incomplete.",
  };

const CATEGORY_LABELS: Record<SeasonCompareCategoryId, string> = {
  production: "Production",
  efficiency: "Efficiency",
  role: "Role",
  offense: "Offense",
  defense: "Defense",
  playmaking: "Playmaking",
  rebounding: "Rebounding",
  shooting: "Shooting",
  impact: "Impact",
  ability: "Rate / ability",
  realized_value: "Realized value",
  diagnostic: "Diagnostic (non-additive)",
  team_context: "Team context",
  availability: "Availability",
};

function perGame(row: PlayerSeason, key: keyof PlayerSeason): number {
  const raw = row[key];
  const total = typeof raw === "number" ? raw : 0;
  return total / Math.max(1, row.gamesPlayed);
}

function isIncompleteSeason(row: PlayerSeason, nowSeason: string): boolean {
  return row.season === nowSeason && row.gamesPlayed < CAREER_RESUME_MIN_GAMES;
}

function edgeFromDelta(
  deltaAMinusB: number,
  tolerance: number
): SeasonCompareEdge {
  if (!Number.isFinite(deltaAMinusB)) return "unavailable";
  if (Math.abs(deltaAMinusB) < tolerance) return "even";
  return deltaAMinusB > 0 ? "a" : "b";
}

function pushMetric(
  out: SeasonMetricRow[],
  options: {
    id: string;
    label: string;
    category: SeasonCompareCategoryId;
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
        "Metric missing for one season - excluded from head-to-head edge.",
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
    delta: edge === "even" ? 0 : edge === "a" ? Math.abs(signed) : -Math.abs(signed),
    note: options.note,
  });
}

function coverageFor(
  row: PlayerSeason,
  impact: SeasonImpactSnapshot | null | undefined,
  team: Pick<TeamSeasonStats, "avgDiff"> | null | undefined,
  nowSeason: string
): SeasonCoverageSnapshot {
  return {
    season: row.season,
    teamId: row.teamId,
    teamName: row.teamName,
    gamesPlayed: row.gamesPlayed,
    minutes: row.minutes,
    mpg: perGame(row, "minutes"),
    qualifying: isCareerQualifyingSeason(row),
    incomplete: isIncompleteSeason(row, nowSeason),
    production: row.gamesPlayed > 0 && row.points >= 0,
    efficiency:
      (row.trueShootingPct != null && row.trueShootingPct > 0) ||
      (row.effectiveFieldGoalPct != null && row.effectiveFieldGoalPct > 0),
    historicalImpact: impact != null && Number.isFinite(impact.value),
    teamContext: team != null && Number.isFinite(team.avgDiff),
  };
}

function categoryWinner(
  id: SeasonCompareCategoryId,
  metrics: SeasonMetricRow[]
): SeasonCategoryWinner | null {
  const rows = metrics.filter((m) => m.category === id);
  if (!rows.length) return null;
  const decisive = rows.filter(
    (m) => m.edge === "a" || m.edge === "b"
  );
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
  const edge: SeasonCompareEdge =
    a === b ? "even" : a > b ? "a" : "b";
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
  categories: SeasonCategoryWinner[],
  coverage: PlayerSeasonComparison["coverage"]
): { edge: SeasonCompareEdge; reason: string } {
  if (!coverage.a.qualifying || !coverage.b.qualifying) {
    return {
      edge: "unavailable",
      reason:
        "Overall verdict withheld - at least one season lacks a qualifying sample.",
    };
  }

  const decisive = categories.filter(
    (c) => c.edge === "a" || c.edge === "b"
  );
  if (!decisive.length) {
    return {
      edge: "even",
      reason:
        "No decisive category edges among available regular-season metrics.",
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
        .join(", ")}).`,
    };
  }
  const edge: SeasonCompareEdge = a > b ? "a" : "b";
  const winners = decisive
    .filter((c) => c.edge === edge)
    .map((c) => c.label.toLowerCase());
  return {
    edge,
    reason: `${edge === "a" ? coverage.a.season : coverage.b.season} leads on ${winners.join(
      ", "
    )} (${Math.max(a, b)}-${Math.min(a, b)} category edges).`,
  };
}

function howDifferentLines(
  seasonA: string,
  seasonB: string,
  metrics: SeasonMetricRow[]
): PlayerSeasonComparison["howDifferent"] {
  const aStronger = metrics
    .filter((m) => m.edge === "a")
    .sort((x, y) => Math.abs(y.delta ?? 0) - Math.abs(x.delta ?? 0))
    .slice(0, 5)
    .map((m) => `${m.label} (${m.aDisplay} vs ${m.bDisplay})`);
  const bStronger = metrics
    .filter((m) => m.edge === "b")
    .sort((x, y) => Math.abs(y.delta ?? 0) - Math.abs(x.delta ?? 0))
    .slice(0, 5)
    .map((m) => `${m.label} (${m.bDisplay} vs ${m.aDisplay})`);
  const notes: string[] = [
    "Edges use absolute tolerances - small gaps are labeled essentially even.",
    "Regular season only. Playoffs are not mixed in.",
  ];
  if (!aStronger.length && !bStronger.length) {
    notes.unshift(
      "Available metrics are close across seasons; differences may be noise."
    );
  }
  return { aStronger, bStronger, notes };
}

/**
 * Deterministic same-player season comparison (regular season).
 */
export function comparePlayerSeasons(options: {
  playerId: string;
  playerName: string;
  seasonA: PlayerSeason;
  seasonB: PlayerSeason;
  impactA?: SeasonImpactSnapshot | null;
  impactB?: SeasonImpactSnapshot | null;
  teamA?: Pick<TeamSeasonStats, "avgDiff" | "abbreviation"> | null;
  teamB?: Pick<TeamSeasonStats, "avgDiff" | "abbreviation"> | null;
  nowSeason?: string;
}): PlayerSeasonComparison {
  const {
    playerId,
    playerName,
    seasonA: a,
    seasonB: b,
    impactA,
    impactB,
    teamA,
    teamB,
  } = options;
  const nowSeason =
    options.nowSeason ??
    canonicalSeasonFromStartYear(currentNbaStartYear());

  const coverage = {
    a: coverageFor(a, impactA, teamA, nowSeason),
    b: coverageFor(b, impactB, teamB, nowSeason),
  };

  const metrics: SeasonMetricRow[] = [];

  // --- Production ---
  pushMetric(metrics, {
    id: "ppg",
    label: "PPG",
    category: "production",
    aRaw: perGame(a, "points"),
    bRaw: perGame(b, "points"),
    format: (v) => formatNumber(v, 1),
    tolerance: SEASON_COMPARE_TOLERANCE.ppg,
  });
  pushMetric(metrics, {
    id: "rpg",
    label: "RPG",
    category: "production",
    aRaw: perGame(a, "rebounds"),
    bRaw: perGame(b, "rebounds"),
    format: (v) => formatNumber(v, 1),
    tolerance: SEASON_COMPARE_TOLERANCE.rpg,
  });
  pushMetric(metrics, {
    id: "apg",
    label: "APG",
    category: "production",
    aRaw: perGame(a, "assists"),
    bRaw: perGame(b, "assists"),
    format: (v) => formatNumber(v, 1),
    tolerance: SEASON_COMPARE_TOLERANCE.apg,
  });
  pushMetric(metrics, {
    id: "spg",
    label: "SPG",
    category: "production",
    aRaw: perGame(a, "steals"),
    bRaw: perGame(b, "steals"),
    format: (v) => formatNumber(v, 1),
    tolerance: SEASON_COMPARE_TOLERANCE.spg,
  });
  pushMetric(metrics, {
    id: "bpg",
    label: "BPG",
    category: "production",
    aRaw: perGame(a, "blocks"),
    bRaw: perGame(b, "blocks"),
    format: (v) => formatNumber(v, 1),
    tolerance: SEASON_COMPARE_TOLERANCE.bpg,
  });
  pushMetric(metrics, {
    id: "tov",
    label: "TOV/G",
    category: "production",
    aRaw: perGame(a, "turnovers"),
    bRaw: perGame(b, "turnovers"),
    format: (v) => formatNumber(v, 1),
    tolerance: SEASON_COMPARE_TOLERANCE.tov,
    higherIsBetter: false,
  });
  pushMetric(metrics, {
    id: "cpi",
    label: "CPI (production)",
    category: "production",
    aRaw: careerProductionIndex(a),
    bRaw: careerProductionIndex(b),
    format: (v) => formatNumber(v, 1),
    tolerance: SEASON_COMPARE_TOLERANCE.cpi,
    note: "Box-score production index - not impact.",
  });

  // --- Efficiency / shooting ---
  const pct = (row: PlayerSeason, key: keyof typeof METRIC_PICKERS) =>
    METRIC_PICKERS[key]?.pick(row) ?? null;

  pushMetric(metrics, {
    id: "ts",
    label: "TS%",
    category: "efficiency",
    aRaw: pct(a, "ts"),
    bRaw: pct(b, "ts"),
    format: (v) => formatPct(v),
    tolerance: SEASON_COMPARE_TOLERANCE.pct,
  });
  pushMetric(metrics, {
    id: "efg",
    label: "eFG%",
    category: "efficiency",
    aRaw: pct(a, "efg"),
    bRaw: pct(b, "efg"),
    format: (v) => formatPct(v),
    tolerance: SEASON_COMPARE_TOLERANCE.pct,
  });
  pushMetric(metrics, {
    id: "fg",
    label: "FG%",
    category: "shooting",
    aRaw: pct(a, "fg"),
    bRaw: pct(b, "fg"),
    format: (v) => formatPct(v),
    tolerance: SEASON_COMPARE_TOLERANCE.pct,
  });
  pushMetric(metrics, {
    id: "fg3",
    label: "3P%",
    category: "shooting",
    aRaw: pct(a, "fg3"),
    bRaw: pct(b, "fg3"),
    format: (v) => formatPct(v),
    tolerance: SEASON_COMPARE_TOLERANCE.pct,
  });
  pushMetric(metrics, {
    id: "ft",
    label: "FT%",
    category: "shooting",
    aRaw: pct(a, "ft"),
    bRaw: pct(b, "ft"),
    format: (v) => formatPct(v),
    tolerance: SEASON_COMPARE_TOLERANCE.pct,
  });

  // --- Role / availability ---
  pushMetric(metrics, {
    id: "usg",
    label: "Usage",
    category: "role",
    aRaw: pct(a, "usg"),
    bRaw: pct(b, "usg"),
    format: (v) => formatPct(v),
    tolerance: SEASON_COMPARE_TOLERANCE.usage,
  });
  pushMetric(metrics, {
    id: "mpg",
    label: "MPG",
    category: "role",
    aRaw: pct(a, "min"),
    bRaw: pct(b, "min"),
    format: (v) => formatNumber(v, 1),
    tolerance: SEASON_COMPARE_TOLERANCE.mpg,
  });
  pushMetric(metrics, {
    id: "gp",
    label: "Games",
    category: "availability",
    aRaw: a.gamesPlayed,
    bRaw: b.gamesPlayed,
    format: (v) => formatNumber(v, 0),
    tolerance: SEASON_COMPARE_TOLERANCE.gp,
  });

  // --- Offense / defense ratings (box) ---
  pushMetric(metrics, {
    id: "ortg",
    label: "Offensive rating",
    category: "offense",
    aRaw: pct(a, "ortg"),
    bRaw: pct(b, "ortg"),
    format: (v) => formatNumber(v, 1),
    tolerance: SEASON_COMPARE_TOLERANCE.rating,
  });
  pushMetric(metrics, {
    id: "drtg",
    label: "Defensive rating",
    category: "defense",
    aRaw: pct(a, "drtg"),
    bRaw: pct(b, "drtg"),
    format: (v) => formatNumber(v, 1),
    tolerance: SEASON_COMPARE_TOLERANCE.rating,
    higherIsBetter: false,
  });
  pushMetric(metrics, {
    id: "net",
    label: "Net rating",
    category: "offense",
    aRaw: pct(a, "net"),
    bRaw: pct(b, "net"),
    format: (v) => formatNumber(v, 1),
    tolerance: SEASON_COMPARE_TOLERANCE.rating,
  });

  // Playmaking / rebounding mirrors
  pushMetric(metrics, {
    id: "ast_play",
    label: "APG",
    category: "playmaking",
    aRaw: perGame(a, "assists"),
    bRaw: perGame(b, "assists"),
    format: (v) => formatNumber(v, 1),
    tolerance: SEASON_COMPARE_TOLERANCE.apg,
  });
  pushMetric(metrics, {
    id: "atr",
    label: "AST/TO",
    category: "playmaking",
    aRaw: pct(a, "atr"),
    bRaw: pct(b, "atr"),
    format: (v) => formatNumber(v, 2),
    tolerance: 0.15,
  });
  pushMetric(metrics, {
    id: "reb_cat",
    label: "RPG",
    category: "rebounding",
    aRaw: perGame(a, "rebounds"),
    bRaw: perGame(b, "rebounds"),
    format: (v) => formatNumber(v, 1),
    tolerance: SEASON_COMPARE_TOLERANCE.rpg,
  });

  // --- DRBL ability / realized (primary when valid; Unavailable not 0) ---
  const aDrbl = hasValidDrblEstimate(a);
  const bDrbl = hasValidDrblEstimate(b);
  const pushDrblOrUnavailable = (
    id: string,
    label: string,
    category: SeasonCompareCategoryId,
    aRaw: number | null,
    bRaw: number | null,
    tolerance: number,
    note?: string
  ) => {
    if (aRaw != null && bRaw != null) {
      pushMetric(metrics, {
        id,
        label,
        category,
        aRaw,
        bRaw,
        format: (v) => formatNumber(v, 2),
        tolerance,
        note,
      });
    } else if (aRaw != null || bRaw != null || aDrbl || bDrbl) {
      metrics.push({
        id,
        label,
        category,
        aDisplay: aRaw != null ? formatNumber(aRaw, 2) : "Unavailable",
        bDisplay: bRaw != null ? formatNumber(bRaw, 2) : "Unavailable",
        aValue: aRaw ?? undefined,
        bValue: bRaw ?? undefined,
        edge: "unavailable",
        higherIsBetter: true,
        note:
          note ??
          "Unavailable for at least one season - never shown as 0.",
      });
    }
  };

  pushDrblOrUnavailable(
    "drbl100",
    "DRBL/100",
    "ability",
    aDrbl ? a.drbl100 : null,
    bDrbl ? b.drbl100 : null,
    SEASON_COMPARE_TOLERANCE.impact,
    "Canonical validated ability rate."
  );
  pushDrblOrUnavailable(
    "drbl_o",
    "DRBL-O",
    "ability",
    aDrbl && Number.isFinite(a.drblO) ? a.drblO : null,
    bDrbl && Number.isFinite(b.drblO) ? b.drblO : null,
    SEASON_COMPARE_TOLERANCE.impact
  );
  pushDrblOrUnavailable(
    "drbl_d",
    "DRBL-D",
    "ability",
    aDrbl && Number.isFinite(a.drblD) ? a.drblD : null,
    bDrbl && Number.isFinite(b.drblD) ? b.drblD : null,
    SEASON_COMPARE_TOLERANCE.impact
  );
  pushDrblOrUnavailable(
    "r1_win_eq",
    "WAR1",
    "realized_value",
    aDrbl &&
      a.r1WinEquivalents != null &&
      Number.isFinite(a.r1WinEquivalents)
      ? a.r1WinEquivalents
      : null,
    bDrbl &&
      b.r1WinEquivalents != null &&
      Number.isFinite(b.r1WinEquivalents)
      ? b.r1WinEquivalents
      : null,
    0.15,
    "Not traditional WAR. Same ordering as R1 Points (÷ P1)."
  );

  // Optional diagnostic disclosure (non-additive).
  if (aDrbl || bDrbl) {
    pushDrblOrUnavailable(
      "drbl_p",
      "DRBL-P",
      "diagnostic",
      aDrbl && Number.isFinite(a.drblP) ? a.drblP : null,
      bDrbl && Number.isFinite(b.drblP) ? b.drblP : null,
      SEASON_COMPARE_TOLERANCE.impact,
      NON_ADDITIVE_COMPONENT_WARNING
    );
    pushDrblOrUnavailable(
      "drbl_ln",
      "DRBL-LN",
      "diagnostic",
      aDrbl && Number.isFinite(a.drblLn) ? a.drblLn : null,
      bDrbl && Number.isFinite(b.drblLn) ? b.drblLn : null,
      SEASON_COMPARE_TOLERANCE.impact,
      NON_ADDITIVE_COMPONENT_WARNING
    );
    pushDrblOrUnavailable(
      "drbl_b",
      "DRBL-B",
      "diagnostic",
      aDrbl && Number.isFinite(a.drblB) ? a.drblB : null,
      bDrbl && Number.isFinite(b.drblB) ? b.drblB : null,
      SEASON_COMPARE_TOLERANCE.impact,
      NON_ADDITIVE_COMPONENT_WARNING
    );
  }

  // --- Impact (both seasons, same metric only) ---
  if (
    impactA &&
    impactB &&
    impactA.metricId === impactB.metricId &&
    Number.isFinite(impactA.value) &&
    Number.isFinite(impactB.value) &&
    // Avoid duplicating DRBL/100 when already shown under ability.
    impactA.metricId !== "drbl100"
  ) {
    pushMetric(metrics, {
      id: "impact",
      label: impactA.label,
      category: "impact",
      aRaw: impactA.value,
      bRaw: impactB.value,
      format: (v) => formatNumber(v, 2),
      tolerance: SEASON_COMPARE_TOLERANCE.impact,
      note: `Season-true ${impactA.source} · ${impactA.metricId}`,
    });
  } else if (
    (impactA || impactB) &&
    impactA?.metricId !== "drbl100" &&
    impactB?.metricId !== "drbl100"
  ) {
    metrics.push({
      id: "impact",
      label: "Historical impact",
      category: "impact",
      aDisplay: impactA ? formatNumber(impactA.value, 2) : "Unavailable",
      bDisplay: impactB ? formatNumber(impactB.value, 2) : "Unavailable",
      aValue: impactA?.value,
      bValue: impactB?.value,
      edge: "unavailable",
      higherIsBetter: true,
      note: "Impact excluded - season-true observation missing for at least one season (or metrics differ).",
    });
  }

  // --- Team context ---
  if (teamA && teamB) {
    pushMetric(metrics, {
      id: "team_diff",
      label: "Team point diff",
      category: "team_context",
      aRaw: teamA.avgDiff,
      bRaw: teamB.avgDiff,
      format: (v) => formatNumber(v, 1),
      tolerance: SEASON_COMPARE_TOLERANCE.teamDiff,
      note: "Team board avg point differential (not playoff result).",
    });
  } else if (teamA || teamB) {
    metrics.push({
      id: "team_diff",
      label: "Team point diff",
      category: "team_context",
      aDisplay:
        teamA != null ? formatNumber(teamA.avgDiff, 1) : "Unavailable",
      bDisplay:
        teamB != null ? formatNumber(teamB.avgDiff, 1) : "Unavailable",
      edge: "unavailable",
      higherIsBetter: true,
      note: "Team context excluded - board missing for one season.",
    });
  }

  const categoryOrder: SeasonCompareCategoryId[] = [
    "ability",
    "realized_value",
    "diagnostic",
    "production",
    "efficiency",
    "shooting",
    "offense",
    "defense",
    "playmaking",
    "rebounding",
    "role",
    "availability",
    "impact",
    "team_context",
  ];
  const categories = categoryOrder
    .map((id) => categoryWinner(id, metrics))
    .filter((c): c is SeasonCategoryWinner => c != null);

  let insufficientReason: string | null = null;
  if (!coverage.a.qualifying || !coverage.b.qualifying) {
    insufficientReason =
      "At least one season is below the qualifying sample floor used for overall verdicts.";
  }
  if (coverage.a.incomplete || coverage.b.incomplete) {
    insufficientReason = [
      insufficientReason,
      "At least one season is an in-progress current season snapshot.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  const overall = overallFromCategories(categories, coverage);
  const howDifferent = howDifferentLines(a.season, b.season, metrics);

  return {
    playerId,
    playerName,
    seasonA: a.season,
    seasonB: b.season,
    scope: "regular_season",
    metrics,
    categories,
    overall,
    howDifferent,
    coverage,
    methodology: PLAYER_SEASON_COMPARE_METHODOLOGY,
    insufficientReason,
  };
}

export function seasonComparePath(
  playerId: string,
  seasonA: string,
  seasonB: string
): string {
  const params = new URLSearchParams({
    a: seasonA,
    b: seasonB,
  });
  return `/players/${playerId}/season-compare?${params.toString()}`;
}

export function edgeLabel(
  edge: SeasonCompareEdge,
  seasonA: string,
  seasonB: string
): string {
  switch (edge) {
    case "a":
      return `${seasonA} stronger`;
    case "b":
      return `${seasonB} stronger`;
    case "even":
      return "Essentially even";
    case "unavailable":
      return "Unavailable";
  }
}

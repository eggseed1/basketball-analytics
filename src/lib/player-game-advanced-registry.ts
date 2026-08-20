/**
 * Advanced game-level metrics registry (P18C.1.3).
 * Only SOURCE_PROVIDED or VALIDATED metrics may surface in Advanced mode.
 */

export type AdvancedMetricValidationStatus =
  | "VALIDATED"
  | "SOURCE_PROVIDED"
  | "BLOCKED_DENOMINATOR"
  | "BLOCKED_SOURCE"
  | "UNSUPPORTED";

export type PlayerGameAdvancedMetric = {
  metricId: string;
  name: string;
  formula: string;
  source: string;
  unit: string;
  denominator: string;
  eraCoverage: string;
  validationStatus: AdvancedMetricValidationStatus;
  publicStatus: "PUBLIC" | "HIDDEN";
};

export const PLAYER_GAME_ADVANCED_METRIC_REGISTRY: PlayerGameAdvancedMetric[] = [
  {
    metricId: "tsPct",
    name: "TS%",
    formula: "PTS / (2 * (FGA + 0.44 * FTA))",
    source: "derived_box",
    unit: "pct",
    denominator: "FGA + 0.44*FTA",
    eraCoverage: "1996-97+",
    validationStatus: "VALIDATED",
    publicStatus: "PUBLIC",
  },
  {
    metricId: "efgPct",
    name: "eFG%",
    formula: "(FGM + 0.5 * 3PM) / FGA",
    source: "derived_box",
    unit: "pct",
    denominator: "FGA",
    eraCoverage: "1996-97+",
    validationStatus: "VALIDATED",
    publicStatus: "PUBLIC",
  },
  {
    metricId: "threePAr",
    name: "3PAr",
    formula: "3PA / FGA",
    source: "derived_box",
    unit: "pct",
    denominator: "FGA",
    eraCoverage: "1996-97+",
    validationStatus: "VALIDATED",
    publicStatus: "PUBLIC",
  },
  {
    metricId: "ftr",
    name: "FTr",
    formula: "FTA / FGA",
    source: "derived_box",
    unit: "rate",
    denominator: "FGA",
    eraCoverage: "1996-97+",
    validationStatus: "VALIDATED",
    publicStatus: "PUBLIC",
  },
  {
    metricId: "usgPct",
    name: "USG%",
    formula: "team possession share (requires team FGA/FTA/TOV/MIN)",
    source: "provider_optional",
    unit: "pct",
    denominator: "team possessions × minutes",
    eraCoverage: "provider-dependent",
    validationStatus: "BLOCKED_DENOMINATOR",
    publicStatus: "HIDDEN",
  },
  {
    metricId: "astPct",
    name: "AST%",
    formula: "requires teammate FGM while on floor",
    source: "provider_optional",
    unit: "pct",
    denominator: "teammate FGM",
    eraCoverage: "provider-dependent",
    validationStatus: "BLOCKED_DENOMINATOR",
    publicStatus: "HIDDEN",
  },
  {
    metricId: "tovPct",
    name: "TOV%",
    formula: "TOV / (FGA + 0.44*FTA + TOV)",
    source: "derived_box",
    unit: "pct",
    denominator: "FGA + 0.44*FTA + TOV",
    eraCoverage: "1996-97+",
    validationStatus: "VALIDATED",
    publicStatus: "PUBLIC",
  },
  {
    metricId: "orbPct",
    name: "ORB%",
    formula: "requires team/opponent rebound pool",
    source: "unavailable",
    unit: "pct",
    denominator: "available ORB",
    eraCoverage: "n/a",
    validationStatus: "BLOCKED_DENOMINATOR",
    publicStatus: "HIDDEN",
  },
  {
    metricId: "drbPct",
    name: "DRB%",
    formula: "requires team/opponent rebound pool",
    source: "unavailable",
    unit: "pct",
    denominator: "available DRB",
    eraCoverage: "n/a",
    validationStatus: "BLOCKED_DENOMINATOR",
    publicStatus: "HIDDEN",
  },
  {
    metricId: "trbPct",
    name: "TRB%",
    formula: "requires team/opponent rebound pool",
    source: "unavailable",
    unit: "pct",
    denominator: "available TRB",
    eraCoverage: "n/a",
    validationStatus: "BLOCKED_DENOMINATOR",
    publicStatus: "HIDDEN",
  },
  {
    metricId: "stlPct",
    name: "STL%",
    formula: "requires opponent possessions",
    source: "unavailable",
    unit: "pct",
    denominator: "opponent possessions",
    eraCoverage: "n/a",
    validationStatus: "BLOCKED_DENOMINATOR",
    publicStatus: "HIDDEN",
  },
  {
    metricId: "blkPct",
    name: "BLK%",
    formula: "requires opponent 2PA",
    source: "unavailable",
    unit: "pct",
    denominator: "opponent 2PA",
    eraCoverage: "n/a",
    validationStatus: "BLOCKED_DENOMINATOR",
    publicStatus: "HIDDEN",
  },
  {
    metricId: "ortg",
    name: "ORtg",
    formula: "provider box advanced when present",
    source: "provider_optional",
    unit: "rating",
    denominator: "possessions",
    eraCoverage: "provider-dependent",
    validationStatus: "SOURCE_PROVIDED",
    publicStatus: "PUBLIC",
  },
  {
    metricId: "drtg",
    name: "DRtg",
    formula: "provider box advanced when present",
    source: "provider_optional",
    unit: "rating",
    denominator: "possessions",
    eraCoverage: "provider-dependent",
    validationStatus: "SOURCE_PROVIDED",
    publicStatus: "PUBLIC",
  },
  {
    metricId: "plusMinus",
    name: "+/-",
    formula: "box score plus/minus when provided",
    source: "provider_optional",
    unit: "points",
    denominator: "n/a",
    eraCoverage: "provider-dependent",
    validationStatus: "SOURCE_PROVIDED",
    publicStatus: "PUBLIC",
  },
];

export function publicValidatedGameAdvancedMetrics() {
  return PLAYER_GAME_ADVANCED_METRIC_REGISTRY.filter(
    (m) =>
      m.publicStatus === "PUBLIC" &&
      (m.validationStatus === "VALIDATED" ||
        m.validationStatus === "SOURCE_PROVIDED")
  );
}

/** Season-level advanced metrics for Advanced tab registry. */
export const PLAYER_SEASON_ADVANCED_METRIC_REGISTRY: PlayerGameAdvancedMetric[] =
  [
    {
      metricId: "drbl100",
      name: "DRBL/100",
      formula: "Approach-B season impact rate",
      source: "drbl_model",
      unit: "rate",
      denominator: "100 possessions (model)",
      eraCoverage: "2020-21+",
      validationStatus: "VALIDATED",
      publicStatus: "PUBLIC",
    },
    {
      metricId: "war1",
      name: "WAR1",
      formula: "r1WinEquivalents realized season value",
      source: "drbl_model",
      unit: "wins",
      denominator: "season",
      eraCoverage: "2020-21+",
      validationStatus: "VALIDATED",
      publicStatus: "PUBLIC",
    },
    {
      metricId: "tsPct",
      name: "TS%",
      formula: "PTS / (2 * (FGA + 0.44 * FTA))",
      source: "derived_box",
      unit: "pct",
      denominator: "FGA + 0.44*FTA",
      eraCoverage: "all box eras",
      validationStatus: "VALIDATED",
      publicStatus: "PUBLIC",
    },
    {
      metricId: "efgPct",
      name: "eFG%",
      formula: "(FGM + 0.5 * 3PM) / FGA",
      source: "derived_box",
      unit: "pct",
      denominator: "FGA",
      eraCoverage: "all box eras",
      validationStatus: "VALIDATED",
      publicStatus: "PUBLIC",
    },
    {
      metricId: "threePAr",
      name: "3PAr",
      formula: "3PA / FGA",
      source: "derived_box",
      unit: "pct",
      denominator: "FGA",
      eraCoverage: "all box eras",
      validationStatus: "VALIDATED",
      publicStatus: "PUBLIC",
    },
    {
      metricId: "ftr",
      name: "FTr",
      formula: "FTA / FGA",
      source: "derived_box",
      unit: "rate",
      denominator: "FGA",
      eraCoverage: "all box eras",
      validationStatus: "VALIDATED",
      publicStatus: "PUBLIC",
    },
    {
      metricId: "usgPct",
      name: "USG%",
      formula: "requires team possession denominators",
      source: "provider_optional",
      unit: "pct",
      denominator: "team possessions",
      eraCoverage: "provider-dependent",
      validationStatus: "BLOCKED_DENOMINATOR",
      publicStatus: "HIDDEN",
    },
  ];

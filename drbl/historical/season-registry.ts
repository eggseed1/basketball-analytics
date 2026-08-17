/**
 * Canonical season registry — single source for website season selection.
 * Historical seasons are added only after M17a support-tier gates pass.
 */
export type HistoricalSupportTier =
  | "A_FULL_SOURCE_SUPPORT"
  | "B_CANONICAL_WITH_DOCUMENTED_SOURCE_LIMITATION"
  | "C_PARTIAL_NONCANONICAL"
  | "D_UNSUPPORTED"
  | "NOT_IN_ARCHIVE"
  // Legacy aliases kept for M17a artifacts
  | "A_FULL_CANONICAL"
  | "B_CANONICAL_WITH_LIMITATIONS"
  | "C_PARTIAL_ONLY";

export type ModelProductStatus =
  | "CANONICAL_PRODUCTION"
  | "RETROSPECTIVE_FROZEN_V1"
  | "UNAVAILABLE";

export type SeasonRegistryEntry = {
  season: string;
  label: string;
  regularSeasonAvailable: boolean;
  postseasonAvailable: boolean;
  drblAvailable: boolean;
  r1PointsAvailable: boolean;
  r1WinEqAvailable: boolean;
  stintsAvailable: boolean;
  /** Source/reconstruction quality (historical archive classification). */
  historicalSourceQualityTier: HistoricalSupportTier;
  /** Product publication status — independent of raw lineup % gate. */
  modelProductStatus: ModelProductStatus;
  /** @deprecated Prefer historicalSourceQualityTier; retained for callers. */
  supportTier: HistoricalSupportTier;
  dataQualityNote: string;
  abilityModelVersion: string | null;
  r1PointValueVersion: string | null;
  r1WinEquivalentVersion: string | null;
  normalizationVersion: string | null;
  qualityFlags?: string[];
};

/** Frozen v1 versions for published canonical seasons. */
export const DRBL_V1_ABILITY_VERSION = "drbl-ability-eb1600-r1-v1";
export const DRBL_V1_R1_POINTS_VERSION = "drbl-r1-points-v1";
export const DRBL_V1_R1_WINEQ_VERSION = "drbl-r1-wineq-v1";
export const HISTORICAL_NORMALIZATION_VERSION = "historical-pbp-normalized-v1";
export const HISTORICAL_SUPPORT_CONTRACT_VERSION =
  "historical-support-contract-v2";

/**
 * Single source of truth for season availability.
 * Do not duplicate season lists in UI components.
 */
export const SEASON_REGISTRY: readonly SeasonRegistryEntry[] = [
  {
    season: "2020-21",
    label: "2020-21",
    regularSeasonAvailable: true,
    postseasonAvailable: false,
    drblAvailable: true,
    r1PointsAvailable: true,
    r1WinEqAvailable: true,
    stintsAvailable: true,
    historicalSourceQualityTier: "B_CANONICAL_WITH_DOCUMENTED_SOURCE_LIMITATION",
    modelProductStatus: "RETROSPECTIVE_FROZEN_V1",
    supportTier: "B_CANONICAL_WITH_DOCUMENTED_SOURCE_LIMITATION",
    dataQualityNote:
      "Retrospective frozen-v1 (M17a.2). CDN-era source; raw lineup completeness ~99.1% (below strict 99.9% Tier-A gate). Scoreboard exact. Same k=1600 / P1 as current production.",
    abilityModelVersion: DRBL_V1_ABILITY_VERSION,
    r1PointValueVersion: DRBL_V1_R1_POINTS_VERSION,
    r1WinEquivalentVersion: DRBL_V1_R1_WINEQ_VERSION,
    normalizationVersion: HISTORICAL_NORMALIZATION_VERSION,
    qualityFlags: ["SOURCE_LINEUP_INCOMPLETE_RAW", "RETROSPECTIVE_FROZEN_V1"],
  },
  {
    season: "2021-22",
    label: "2021-22",
    regularSeasonAvailable: true,
    postseasonAvailable: false,
    drblAvailable: true,
    r1PointsAvailable: true,
    r1WinEqAvailable: true,
    stintsAvailable: true,
    historicalSourceQualityTier: "B_CANONICAL_WITH_DOCUMENTED_SOURCE_LIMITATION",
    modelProductStatus: "RETROSPECTIVE_FROZEN_V1",
    supportTier: "B_CANONICAL_WITH_DOCUMENTED_SOURCE_LIMITATION",
    dataQualityNote:
      "Retrospective frozen-v1 (M17a.2). CDN-era source; raw lineup completeness ~98.9%. Scoreboard exact. Frozen v1 formulas unchanged.",
    abilityModelVersion: DRBL_V1_ABILITY_VERSION,
    r1PointValueVersion: DRBL_V1_R1_POINTS_VERSION,
    r1WinEquivalentVersion: DRBL_V1_R1_WINEQ_VERSION,
    normalizationVersion: HISTORICAL_NORMALIZATION_VERSION,
    qualityFlags: ["SOURCE_LINEUP_INCOMPLETE_RAW", "RETROSPECTIVE_FROZEN_V1"],
  },
  {
    season: "2022-23",
    label: "2022-23",
    regularSeasonAvailable: true,
    postseasonAvailable: false,
    drblAvailable: true,
    r1PointsAvailable: true,
    r1WinEqAvailable: true,
    stintsAvailable: true,
    historicalSourceQualityTier: "B_CANONICAL_WITH_DOCUMENTED_SOURCE_LIMITATION",
    modelProductStatus: "RETROSPECTIVE_FROZEN_V1",
    supportTier: "B_CANONICAL_WITH_DOCUMENTED_SOURCE_LIMITATION",
    dataQualityNote:
      "Retrospective frozen-v1 (M17a.2). CDN-era source; raw lineup completeness ~98.6%. Scoreboard exact. Frozen v1 formulas unchanged.",
    abilityModelVersion: DRBL_V1_ABILITY_VERSION,
    r1PointValueVersion: DRBL_V1_R1_POINTS_VERSION,
    r1WinEquivalentVersion: DRBL_V1_R1_WINEQ_VERSION,
    normalizationVersion: HISTORICAL_NORMALIZATION_VERSION,
    qualityFlags: ["SOURCE_LINEUP_INCOMPLETE_RAW", "RETROSPECTIVE_FROZEN_V1"],
  },
  {
    season: "2023-24",
    label: "2023-24",
    regularSeasonAvailable: true,
    postseasonAvailable: false,
    drblAvailable: true,
    r1PointsAvailable: true,
    r1WinEqAvailable: true,
    stintsAvailable: true,
    historicalSourceQualityTier: "B_CANONICAL_WITH_DOCUMENTED_SOURCE_LIMITATION",
    modelProductStatus: "RETROSPECTIVE_FROZEN_V1",
    supportTier: "B_CANONICAL_WITH_DOCUMENTED_SOURCE_LIMITATION",
    dataQualityNote:
      "Retrospective frozen-v1 (M17a.2). CDN-era source; raw lineup completeness ~98.6%. Scoreboard exact. Frozen v1 formulas unchanged.",
    abilityModelVersion: DRBL_V1_ABILITY_VERSION,
    r1PointValueVersion: DRBL_V1_R1_POINTS_VERSION,
    r1WinEquivalentVersion: DRBL_V1_R1_WINEQ_VERSION,
    normalizationVersion: HISTORICAL_NORMALIZATION_VERSION,
    qualityFlags: ["SOURCE_LINEUP_INCOMPLETE_RAW", "RETROSPECTIVE_FROZEN_V1"],
  },
  {
    season: "2024-25",
    label: "2024-25",
    regularSeasonAvailable: true,
    postseasonAvailable: false,
    drblAvailable: true,
    r1PointsAvailable: true,
    r1WinEqAvailable: true,
    stintsAvailable: true,
    historicalSourceQualityTier: "B_CANONICAL_WITH_DOCUMENTED_SOURCE_LIMITATION",
    modelProductStatus: "CANONICAL_PRODUCTION",
    supportTier: "B_CANONICAL_WITH_DOCUMENTED_SOURCE_LIMITATION",
    dataQualityNote:
      "Canonical production season (M16l3). Source/reconstruction metadata notes raw lineup completeness below a strict 99.9% historical Tier-A gate; product remains canonical. Frozen v1 formulas unchanged.",
    abilityModelVersion: DRBL_V1_ABILITY_VERSION,
    r1PointValueVersion: DRBL_V1_R1_POINTS_VERSION,
    r1WinEquivalentVersion: DRBL_V1_R1_WINEQ_VERSION,
    normalizationVersion: HISTORICAL_NORMALIZATION_VERSION,
    qualityFlags: ["SOURCE_LINEUP_INCOMPLETE_RAW"],
  },
  {
    season: "2025-26",
    label: "2025-26",
    regularSeasonAvailable: true,
    postseasonAvailable: false,
    drblAvailable: true,
    r1PointsAvailable: true,
    r1WinEqAvailable: true,
    stintsAvailable: true,
    historicalSourceQualityTier: "B_CANONICAL_WITH_DOCUMENTED_SOURCE_LIMITATION",
    modelProductStatus: "CANONICAL_PRODUCTION",
    supportTier: "B_CANONICAL_WITH_DOCUMENTED_SOURCE_LIMITATION",
    dataQualityNote:
      "Canonical production season; reserved outcomes consumed once in M16l2. Source-quality metadata only — model product status remains CANONICAL_PRODUCTION.",
    abilityModelVersion: DRBL_V1_ABILITY_VERSION,
    r1PointValueVersion: DRBL_V1_R1_POINTS_VERSION,
    r1WinEquivalentVersion: DRBL_V1_R1_WINEQ_VERSION,
    normalizationVersion: HISTORICAL_NORMALIZATION_VERSION,
    qualityFlags: ["SOURCE_LINEUP_INCOMPLETE_RAW"],
  },
] as const;

export function getSeasonEntry(
  season: string
): SeasonRegistryEntry | undefined {
  return SEASON_REGISTRY.find((s) => s.season === season);
}

export function listDrblSeasons(): string[] {
  return SEASON_REGISTRY.filter((s) => s.drblAvailable).map((s) => s.season);
}

export function listCanonicalR1Seasons(): string[] {
  return SEASON_REGISTRY.filter(
    (s) => s.r1PointsAvailable && s.r1WinEqAvailable
  ).map((s) => s.season);
}

export function isDrblSeason(season: string): boolean {
  return listDrblSeasons().includes(season);
}

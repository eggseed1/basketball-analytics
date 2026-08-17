/**
 * Season-true advanced player stats — diagnostic / admission types only.
 *
 * Distinct from:
 * - HistoricalPlayerImpact (DARKO / LEBRON)
 * - PlayerSeason production fields (ESPN / current methodology)
 * - AdvancedPlayerGameStats (per-game grain)
 *
 * Do not expose these metrics to UI until production readiness is YES.
 */

/** Candidate advanced metrics under audit (not product-frozen). */
export type AdvancedSeasonMetricId =
  | "ortg"
  | "drtg"
  | "net"
  | "usg_pct"
  | "ts_pct"
  | "efg_pct";

export type AdvancedSeasonSourceId =
  | "espn_approx"
  | "bdl_game_advanced"
  | "bdl_season_averages_advanced"
  | "nba_stats_placeholder"
  | "local_sample";

/** Observation grain. Game grain is not season-true without an approved rollup. */
export type AdvancedStatGrain = "player_season" | "player_game";

/**
 * Semantic meaning of the rating fields.
 * On-court team ratings must not be labeled as individual ORtg/DRtg.
 */
export type AdvancedRatingSemantics =
  | "individual"
  | "on_court_team"
  | "derived_approx"
  | "unknown";

export type AdvancedStatIdentityMatch =
  | "espn_id"
  | "nba_id"
  | "bdl_id"
  | "alias"
  | "normalized_name"
  | "unmatched";

export type AdvancedStatProvenance = {
  dataset: string;
  importedAt: string;
  /** Optional retrieval path / endpoint / file. */
  retrieval?: string;
  notes?: string;
};

/**
 * One candidate advanced observation.
 * Missing metrics are absent rows — never zero-filled.
 */
export type AdvancedSeasonObservation = {
  /** ESPN / site player id when confidently mapped. */
  playerId: string | null;
  nbaPlayerId?: string;
  bdlPlayerId?: string;
  playerName: string;
  /** Canonical season YYYY-YY. */
  season: string;
  metric: AdvancedSeasonMetricId;
  value: number;
  source: AdvancedSeasonSourceId;
  grain: AdvancedStatGrain;
  semantics: AdvancedRatingSemantics;
  /** regular | playoffs | unknown */
  seasonType: "regular" | "playoffs" | "unknown";
  methodologyVersion: string;
  sourceVersion: string;
  identityMatch: AdvancedStatIdentityMatch;
  provenance: AdvancedStatProvenance;
};

export type AdvancedMetricCoverage = {
  metric: AdvancedSeasonMetricId;
  source: AdvancedSeasonSourceId;
  status: "insufficient" | "candidate" | "production-ready";
  earliestSeason: string | null;
  latestSeason: string | null;
  seasonCount: number;
  playerSeasonRows: number;
  uniquePlayers: number;
  /** Null when league denominator is unknown (diagnostic fixtures). */
  leaguePlayerSeasonCoveragePct: number | null;
  identityResolutionRate: number;
  missingValueRate: number;
  duplicateRate: number;
  provenanceCompleteness: number;
  grain: AdvancedStatGrain;
  semantics: AdvancedRatingSemantics;
  blockers: string[];
};

export type AdvancedSourceInventoryEntry = {
  source: AdvancedSeasonSourceId;
  label: string;
  metricsClaimed: AdvancedSeasonMetricId[];
  grain: AdvancedStatGrain;
  semantics: AdvancedRatingSemantics;
  seasonRangeClaimed: { earliest: string | null; latest: string | null };
  playerIdentitySystem: string;
  seasonTrue: boolean;
  regularSeasonOnly: boolean | "unknown";
  playerLevel: boolean;
  provenanceAvailable: boolean;
  historicalCoverageContinuous: boolean | "unknown";
  reliabilityConcerns: string[];
  wiredInRepo: boolean;
  liveAccess: "ok" | "unauthorized" | "untested" | "n/a";
};

export type AdvancedStatsProductionReadiness = {
  productionReady: boolean;
  /**
   * Primary gate label for diagnostics.
   * productionReady is YES only when gate === "productionReady".
   */
  gate:
    | "accessBlocked"
    | "schemaUnknown"
    | "semanticsUnverified"
    | "semanticsIncompatible"
    | "identityBlocked"
    | "insufficientCoverage"
    | "productionReady";
  reasons: string[];
  requiredMetricsReady: Record<"ortg" | "drtg" | "net", boolean>;
  access?: string;
  semantics?: string;
  identity?: string;
  coverage?: string;
};

export type AdvancedStatsCoverageReport = {
  generatedAt: string;
  methodologyVersion: string;
  productionReady: boolean;
  readiness: AdvancedStatsProductionReadiness;
  inventory: AdvancedSourceInventoryEntry[];
  byMetric: AdvancedMetricCoverage[];
  totalObservations: number;
  /** Optional embedded season_averages probe summary. */
  seasonAveragesProbe?: {
    access: string;
    endpoint: string;
    seasonsProbed: number[];
    admittedObservationCount: number;
    ratingSemantics: string;
    identityLimitation: string;
  };
  notes: string[];
};

/** Diagnostic methodology version for this audit layer (not product analytics). */
export const ADVANCED_STATS_AUDIT_METHODOLOGY_VERSION = "1.0";

import type { DrblEvent, DrblPossession } from "../../drbl/types";

/** Product-facing PBP source labels (distinct from GamePlayByPlay.source). */
export type PbpProductSource =
  | "nba_cdn"
  | "stats_nba"
  | "espn"
  | "disk_cache"
  | "sample";

export type GamePbpCapabilityStatus =
  | "unavailable"
  | "raw_available"
  | "possessions_available"
  | "lineups_available";

export type PbpProvenance = {
  playByPlay: PbpProductSource;
  boxScore: PbpProductSource;
  /** Advanced box used for provider-reported possession totals (optional). */
  advancedBoxScore?: PbpProductSource | null;
};

export type OfficialPossessionSource =
  | "nba_cdn"
  | "stats_nba"
  | "disk_cache"
  | "fixture";

export type OfficialPossessionUnavailableReason =
  | "endpoint_unavailable"
  | "game_not_supported"
  | "field_missing"
  | "response_invalid"
  | "fetch_failed";

/**
 * Provider-reported team possession totals — never estimated from reconstruction.
 */
export type OfficialPossessionResult =
  | {
      status: "available";
      source: OfficialPossessionSource;
      home: number;
      away: number;
      definition: "provider_reported";
    }
  | {
      status: "unavailable";
      reason: OfficialPossessionUnavailableReason;
      attemptedSources: string[];
    };

export type ReconstructedPossessionResult =
  | {
      status: "available";
      home: number;
      away: number;
      possessionCount: number;
      definition: "reconstructed_from_pbp";
    }
  | {
      status: "unavailable";
      reason:
        | "pbp_fetch_failed"
        | "pbp_empty"
        | "normalization_failed"
        | "validation_failed";
    };

/**
 * Explicit separation: official aggregates ≠ reconstructed sequences.
 * Do not derive public pace/PPP from reconstructed row counts.
 */
export type GamePossessionData = {
  officialAggregates: OfficialPossessionResult;
  reconstructedSequences: ReconstructedPossessionResult;
};

export type PossessionCalibrationGrade =
  | "exact"
  | "within_one"
  | "outside_tolerance"
  | "not_comparable";

/**
 * Explicit per-game PBP capability — raw fetch and derived layers are separate.
 * `possessionsDerived` means reconstruction validated; it is NOT official totals.
 */
export type GamePbpCapability = {
  rawPbpAvailable: boolean;
  rawEventCount: number;
  scoreTimelineAvailable: boolean;
  /** Reconstructed possession sequences validated (not official aggregates). */
  possessionsDerived: boolean;
  /** Alias clarity: same as possessionsDerived. */
  reconstructedPossessionsAvailable: boolean;
  /** Provider-reported advanced-box possessions available. */
  officialPossessionTotalsAvailable: boolean;
  possessionCalibrationGrade: PossessionCalibrationGrade;
  lineupsDerived: boolean;
  source: PbpProductSource | null;
  provenance: PbpProvenance | null;
  status: GamePbpCapabilityStatus;
};

export type PbpDataQuality = {
  grade: "complete" | "partial" | "unavailable";
  notes: string[];
};

export type GamePbpProduct = {
  gameId: string;
  events: DrblEvent[];
  possessions: DrblPossession[];
  capability: GamePbpCapability;
  provenance: PbpProvenance | null;
  quality: PbpDataQuality;
};

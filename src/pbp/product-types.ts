import type { DrblEvent, DrblPossession } from "../../drbl/types";

/** Product-facing PBP source labels (distinct from GamePlayByPlay.source). */
export type PbpProductSource =
  | "nba_cdn"
  | "stats_nba"
  | "espn"
  | "disk_cache"
  | "sample"
  | "balldontlie";

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
  | "fixture"
  | "balldontlie";

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
  /** Primary PBP source (backward compatible). */
  source: PbpProductSource | null;
  provenance: PbpProvenance | null;
  status: GamePbpCapabilityStatus;
};

export type PossessionValidationReport = {
  rawEventCount: number;
  normalizedEventCount: number;
  derivedPossessionCount: number;
  periodsObserved: number[];
  teamsObserved: string[];
  unknownEventCount: number;
  eventsDroppedDuringNormalization: number;
  duplicateActionNumbers: number;
  duplicateOrderNumbers: number;
  nonMonotonicOrdering: boolean;
  possessionOwnershipFailures: number;
  unresolvedFreeThrowSequences: number;
  finalPbpScore: { home: number; away: number } | null;
  officialFinalScore: { home: number; away: number } | null;
  scoreConservationOk: boolean | null;
  warnings: string[];
  fatalErrors: string[];
};

export type LineupValidationReport = {
  lineupSnapshotCount: number;
  startersResolvedHome: boolean;
  startersResolvedAway: boolean;
  invalidStintCount: number;
  dualTeamPlayerCount: number;
  substitutionOutInactiveCount: number;
  substitutionInActiveCount: number;
  unresolvedSubstitutions: number;
  negativeStintDurationCount: number;
  nonMonotonicStintOrdering: boolean;
  regulationCoverageOk: boolean;
  overtimeCoverageOk: boolean;
  uncoveredGameClockSeconds: number;
  periodsObserved: number[];
  warnings: string[];
  fatalErrors: string[];
};

export type OfficialPossessionComparison =
  | "matched"
  | "within_tolerance"
  | "mismatched"
  | "unavailable";

/** Server-only diagnostics — never render in public Possession Explorer UI. */
export type PossessionPipelineDiagnostics = {
  advancedBoxAttempts: Array<{
    source: string;
    outcome: string;
    detail?: string;
  }>;
  officialPossessionResult: OfficialPossessionResult;
  elapsedMs: number;
};

export type GamePossessionAvailable = {
  status: "available";
  gameId: string;
  source: PbpProductSource;
  provenance: PbpProvenance;
  events: DrblEvent[];
  possessions: DrblPossession[];
  validation: PossessionValidationReport;
  lineupValidation: LineupValidationReport;
  capability: GamePbpCapability;
  /** Structured official vs reconstructed boundary. */
  possessionData: GamePossessionData;
  officialPossessions: { home: number; away: number } | null;
  derivedPossessions: { home: number; away: number };
  possessionDelta: { home: number; away: number } | null;
  officialPossessionComparison: OfficialPossessionComparison;
  possessionCalibrationGrade: PossessionCalibrationGrade;
  /** Internal diagnostics; omit from public UI adapters. */
  diagnostics?: PossessionPipelineDiagnostics;
};

export type GamePossessionUnavailable = {
  status: "unavailable";
  gameId: string;
  reason:
    | "pbp_fetch_failed"
    | "pbp_empty"
    | "normalization_failed"
    | "validation_failed";
  message: string;
  capability: GamePbpCapability;
  possessionData?: GamePossessionData;
  validation?: PossessionValidationReport;
  lineupValidation?: LineupValidationReport;
  diagnostics?: PossessionPipelineDiagnostics;
};

export type GamePossessionResult =
  | GamePossessionAvailable
  | GamePossessionUnavailable;

export function scoreTimelineAvailableFromEvents(events: DrblEvent[]): boolean {
  if (!events.length) return false;
  return events.some(
    (e) =>
      e.scoreHome > 0 ||
      e.scoreAway > 0 ||
      e.actionType === "2pt" ||
      e.actionType === "3pt" ||
      e.actionType === "freethrow"
  );
}

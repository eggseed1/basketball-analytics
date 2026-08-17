/**
 * Season-true historical player impact — canonical product types.
 *
 * Distinct from live provider DTOs (`DarkoRating` / `LebronRating`) and from
 * Career Resume CPI (production). See docs/historical-impact.md.
 */

/** Known season-true impact metric identifiers. */
export type HistoricalImpactMetricId =
  | "darko_dpm"
  | "darko_off"
  | "darko_def"
  | "lebron"
  | "olebron"
  | "dlebron"
  | "wins_added";

export type HistoricalImpactSourceId = "darko" | "lebron";

/**
 * How the observation was linked to a site player identity.
 * Unmatched observations stay in the store but are not returned by ESPN-id lookups
 * unless the caller also supplies a name / NBA id.
 */
export type HistoricalImpactIdentityMatch =
  | "espn_id"
  | "nba_id"
  | "alias"
  | "normalized_name"
  | "unmatched";

export type HistoricalImpactProvenance = {
  /** Human-readable dataset label. */
  dataset: string;
  /** ISO timestamp when this observation entered the index. */
  importedAt: string;
  /** Optional free-text caveat (e.g. live snapshot, seed fallback). */
  notes?: string;
};

/**
 * One season-true impact observation for one metric.
 * Missing seasons are absent — never interpolated.
 */
export type HistoricalPlayerImpact = {
  /**
   * Canonical site player id (ESPN athlete id on public routes) when confidently mapped.
   * Null when only an NBA id / name is known.
   */
  playerId: string | null;
  /** NBA.com person id when known. */
  nbaPlayerId?: string;
  playerName: string;
  /** Canonical season YYYY-YY. */
  season: string;
  metric: HistoricalImpactMetricId;
  value: number;
  source: HistoricalImpactSourceId;
  /** Impact-layer methodology version (not Career Resume CPI version). */
  methodologyVersion: string;
  /** Source dataset / scrape / CSV revision marker. */
  sourceVersion: string;
  identityMatch: HistoricalImpactIdentityMatch;
  provenance: HistoricalImpactProvenance;
};

export type HistoricalImpactLookupKey = {
  /** ESPN / site player id. */
  playerId?: string;
  nbaPlayerId?: string;
  /** Used only for medium-confidence name joins when ids do not match. */
  playerName?: string;
  season?: string;
  metric?: HistoricalImpactMetricId;
  source?: HistoricalImpactSourceId;
};

export type HistoricalImpactMetricCoverage = {
  metric: HistoricalImpactMetricId;
  source: HistoricalImpactSourceId;
  observationCount: number;
  playerKeyCount: number;
  seasons: string[];
  earliestSeason: string | null;
  latestSeason: string | null;
  invalidValueCount: number;
  duplicateKeyCount: number;
  unmatchedIdentityCount: number;
};

export type HistoricalImpactCoverageReport = {
  generatedAt: string;
  methodologyVersion: string;
  totalObservations: number;
  byMetric: HistoricalImpactMetricCoverage[];
  seasonsRepresented: string[];
  notes: string[];
};

/** Impact foundation methodology version. Bump when admission rules change. */
export const HISTORICAL_IMPACT_METHODOLOGY_VERSION = "1.0";

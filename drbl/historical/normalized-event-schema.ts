/**
 * Canonical normalized historical PBP event schema (M17a).
 * Version: historical-pbp-normalized-v1
 *
 * Adapters emit this shape. Model logic does not live here.
 * Unknown/missing fields stay null — never coerce to fake known values.
 */
export const HISTORICAL_NORMALIZATION_VERSION =
  "historical-pbp-normalized-v1" as const;

export type NormalizedHistoricalEvent = {
  season: string;
  gameId: string;
  eventIndex: number;
  period: number | null;
  clockSecondsRemaining: number | null;
  eventType: string | null;
  subType: string | null;

  offenseTeamId: string | null;
  defenseTeamId: string | null;

  primaryPlayerId: string | null;
  secondaryPlayerId: string | null;
  tertiaryPlayerId: string | null;

  points: number | null;
  scoreHome: number | null;
  scoreAway: number | null;

  shotMade: boolean | null;
  shotValue: number | null;
  shotX: number | null;
  shotY: number | null;

  freeThrowNumber: number | null;
  freeThrowTotal: number | null;

  reboundType: string | null;
  turnoverType: string | null;
  foulType: string | null;

  substitutionInPlayerId: string | null;
  substitutionOutPlayerId: string | null;

  sourceProvider: string;
  sourceEventId: string | null;

  normalizationVersion: typeof HISTORICAL_NORMALIZATION_VERSION;
  /** Relative pointer into immutable raw archive. */
  rawSourcePointer: string;
};

export type NormalizedHistoricalGame = {
  season: string;
  gameId: string;
  gameDate: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  events: NormalizedHistoricalEvent[];
  normalizationVersion: typeof HISTORICAL_NORMALIZATION_VERSION;
  rawSourcePointers: string[];
  missingnessFlags: string[];
};

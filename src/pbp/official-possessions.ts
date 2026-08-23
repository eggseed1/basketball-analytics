import type { DrblPossession } from "../../drbl/types";

import type {
  OfficialPossessionComparison,
  OfficialPossessionResult,
  OfficialPossessionSource,
  OfficialPossessionUnavailableReason,
  PossessionCalibrationGrade,
  PbpProductSource,
} from "./product-types";

/**
 * NBA stats.nba.com boxscoreadvancedv3 reports team possessions in
 * `boxScoreAdvanced.{home,away}Team.statistics.possessions`.
 *
 * Provider possessions use NBA's official counting conventions (possession
 * boundaries may differ from DRBL event-reconstruction heuristics). We treat
 * these as upstream-reported totals, not recomputed estimates.
 */

export function mapAdvancedBoxSourceToProduct(
  source: "cdn" | "stats" | "disk" | "fixture"
): OfficialPossessionSource {
  if (source === "stats") return "stats_nba";
  if (source === "disk") return "disk_cache";
  if (source === "fixture") return "fixture";
  return "nba_cdn";
}

export function mapProductSourceToOfficial(
  source: PbpProductSource | null | undefined
): OfficialPossessionSource | null {
  if (!source) return null;
  if (source === "stats_nba") return "stats_nba";
  if (source === "disk_cache") return "disk_cache";
  if (source === "nba_cdn") return "nba_cdn";
  return null;
}

/**
 * Extract provider-reported possessions from an advanced-box envelope.
 * Shared by live responses and recorded fixtures — one normalization path.
 */
export function extractOfficialTeamPossessions(
  advancedRaw: unknown
): { home: number; away: number } | null {
  const root = advancedRaw as {
    boxScoreAdvanced?: {
      homeTeam?: { statistics?: { possessions?: number } };
      awayTeam?: { statistics?: { possessions?: number } };
    };
  };
  const home = root.boxScoreAdvanced?.homeTeam?.statistics?.possessions;
  const away = root.boxScoreAdvanced?.awayTeam?.statistics?.possessions;
  if (
    typeof home !== "number" ||
    typeof away !== "number" ||
    !Number.isFinite(home) ||
    !Number.isFinite(away)
  ) {
    return null;
  }
  return { home, away };
}

/**
 * Build a discriminated OfficialPossessionResult from a fetched payload.
 * Never converts missing totals to zero. Never labels estimates as official.
 */
export function resolveOfficialPossessionResult(input: {
  advancedRaw: unknown | null;
  source: "cdn" | "stats" | "disk" | "fixture" | null;
  attemptedSources: string[];
  fetchReason?: OfficialPossessionUnavailableReason;
}): OfficialPossessionResult {
  if (!input.advancedRaw || !input.source) {
    return {
      status: "unavailable",
      reason: input.fetchReason ?? "fetch_failed",
      attemptedSources: input.attemptedSources,
    };
  }

  const root = input.advancedRaw as { boxScoreAdvanced?: unknown };
  if (!root.boxScoreAdvanced) {
    return {
      status: "unavailable",
      reason: "response_invalid",
      attemptedSources: input.attemptedSources,
    };
  }

  const totals = extractOfficialTeamPossessions(input.advancedRaw);
  if (!totals) {
    return {
      status: "unavailable",
      reason: "field_missing",
      attemptedSources: input.attemptedSources,
    };
  }

  return {
    status: "available",
    source: mapAdvancedBoxSourceToProduct(input.source),
    home: totals.home,
    away: totals.away,
    definition: "provider_reported",
  };
}

export function countDerivedTeamPossessions(
  possessions: DrblPossession[],
  homeTeamId: string,
  awayTeamId: string
): { home: number; away: number } {
  let home = 0;
  let away = 0;
  for (const possession of possessions) {
    if (possession.offenseTeamId === homeTeamId) home += 1;
    else if (possession.offenseTeamId === awayTeamId) away += 1;
  }
  return { home, away };
}

const POSSESSION_TOLERANCE = 1;

export function calibrationGradeFromDeltas(input: {
  official: { home: number; away: number } | null;
  derived: { home: number; away: number };
}): PossessionCalibrationGrade {
  if (!input.official) return "not_comparable";
  const absHome = Math.abs(input.derived.home - input.official.home);
  const absAway = Math.abs(input.derived.away - input.official.away);
  if (absHome === 0 && absAway === 0) return "exact";
  if (absHome <= POSSESSION_TOLERANCE && absAway <= POSSESSION_TOLERANCE) {
    return "within_one";
  }
  return "outside_tolerance";
}

export function comparisonFromCalibrationGrade(
  grade: PossessionCalibrationGrade
): OfficialPossessionComparison {
  switch (grade) {
    case "exact":
      return "matched";
    case "within_one":
      return "within_tolerance";
    case "outside_tolerance":
      return "mismatched";
    case "not_comparable":
      return "unavailable";
    default: {
      const _exhaustive: never = grade;
      return _exhaustive;
    }
  }
}

export function compareOfficialDerivedPossessions(input: {
  official: { home: number; away: number } | null;
  derived: { home: number; away: number };
}): {
  officialPossessions: { home: number; away: number } | null;
  derivedPossessions: { home: number; away: number };
  possessionDelta: { home: number; away: number } | null;
  officialPossessionComparison: OfficialPossessionComparison;
  possessionCalibrationGrade: PossessionCalibrationGrade;
} {
  const derivedPossessions = input.derived;
  const grade = calibrationGradeFromDeltas(input);
  if (!input.official) {
    return {
      officialPossessions: null,
      derivedPossessions,
      possessionDelta: null,
      officialPossessionComparison: "unavailable",
      possessionCalibrationGrade: grade,
    };
  }

  const possessionDelta = {
    home: derivedPossessions.home - input.official.home,
    away: derivedPossessions.away - input.official.away,
  };

  return {
    officialPossessions: input.official,
    derivedPossessions,
    possessionDelta,
    officialPossessionComparison: comparisonFromCalibrationGrade(grade),
    possessionCalibrationGrade: grade,
  };
}

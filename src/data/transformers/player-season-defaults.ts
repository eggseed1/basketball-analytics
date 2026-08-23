import type { PlayerSeason } from "@/data/types";

/**
 * Runtime sentinel for numeric statistics that the source did not publish.
 *
 * Keep the canonical interface numeric for compatibility, but never use 0 as
 * the absence marker: zero is a real basketball value. Non-finite values are
 * filtered by shared presentation/aggregation helpers and serialize as null in
 * JSON, while explicitly supplied zeroes remain zero.
 */
export const MISSING_PLAYER_STAT = Number.NaN;

/**
 * Fill analytics-required PlayerSeason fields for slim ESPN/career adapters.
 *
 * Callers must explicitly provide every statistic they actually observed.
 * Omitted numeric fields become MISSING_PLAYER_STAT, not 0. R1 fields remain
 * null when absent because their public contract already models availability.
 */
export function withPlayerSeasonDefaults(
  partial: Partial<PlayerSeason> &
    Pick<
      PlayerSeason,
      "playerId" | "playerName" | "teamId" | "teamName" | "season"
    >
): PlayerSeason {
  const missing = MISSING_PLAYER_STAT;
  const out: PlayerSeason = {
    gamesPlayed: missing,
    gamesStarted: missing,
    minutes: missing,
    fieldGoalsMade: missing,
    fieldGoalsAttempted: missing,
    threePointersMade: missing,
    threePointersAttempted: missing,
    freeThrowsMade: missing,
    freeThrowsAttempted: missing,
    offensiveRebounds: missing,
    defensiveRebounds: missing,
    rebounds: missing,
    assists: missing,
    steals: missing,
    blocks: missing,
    turnovers: missing,
    personalFouls: missing,
    points: missing,
    plusMinus: missing,
    fieldGoalPct: missing,
    twoPointPct: missing,
    threePointPct: missing,
    freeThrowPct: missing,
    threePointAttemptRate: missing,
    freeThrowRate: missing,
    turnoverPct: missing,
    assistPct: missing,
    offensiveReboundPct: missing,
    defensiveReboundPct: missing,
    reboundPct: missing,
    stealPct: missing,
    blockPct: missing,
    pie: missing,
    per: missing,
    ows: missing,
    dws: missing,
    winShares: missing,
    winSharesPer48: missing,
    obpm: missing,
    dbpm: missing,
    bpm: missing,
    vorp: missing,
    dpm: missing,
    oDpm: missing,
    dDpm: missing,
    boxDpm: missing,
    onOffDpm: missing,
    drbl100: missing,
    drblP: missing,
    drblLn: missing,
    drblB: missing,
    drblO: missing,
    drblD: missing,
    sdv100: missing,
    shotMaking100: missing,
    epvShootMean: missing,
    vContMean: missing,
    r1Points: null,
    r1WinEquivalents: null,
    r1PointValueVersion: null,
    r1WinEquivalentVersion: null,
    drblWar: missing,
    drblSeasonalImpact: missing,
    drblL: missing,
    drblMeanLeverage: missing,
    drblDisagreement: missing,
    drblUncertainty: missing,
    drblIntervalLo: missing,
    drblIntervalHi: missing,
    ...partial,
  };

  // Preserve null R1 semantics if partial omitted the fields.
  out.r1Points = partial.r1Points ?? null;
  out.r1WinEquivalents = partial.r1WinEquivalents ?? null;

  // Optional provider-published fields remain absent rather than NaN so older
  // consumers using nullish checks continue to behave correctly.
  const optionalKeys = [
    "trueShootingPct",
    "effectiveFieldGoalPct",
    "usagePct",
    "offensiveRating",
    "defensiveRating",
    "netRating",
  ] as const;
  for (const key of optionalKeys) {
    if (!Object.prototype.hasOwnProperty.call(partial, key)) {
      delete out[key];
    }
  }

  return out;
}

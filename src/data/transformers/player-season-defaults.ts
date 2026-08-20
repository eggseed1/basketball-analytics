import type { PlayerSeason } from "@/data/types";

/**
 * Fill analytics-required PlayerSeason fields for slim ESPN/career adapters.
 * R1 fields stay null when absent - never coerce missing R1 to 0.
 */
export function withPlayerSeasonDefaults(
  partial: Partial<PlayerSeason> &
    Pick<
      PlayerSeason,
      "playerId" | "playerName" | "teamId" | "teamName" | "season"
    >
): PlayerSeason {
  const out: PlayerSeason = {
    gamesPlayed: 0,
    gamesStarted: 0,
    minutes: 0,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    threePointersMade: 0,
    threePointersAttempted: 0,
    freeThrowsMade: 0,
    freeThrowsAttempted: 0,
    offensiveRebounds: 0,
    defensiveRebounds: 0,
    rebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    personalFouls: 0,
    points: 0,
    plusMinus: 0,
    fieldGoalPct: 0,
    twoPointPct: 0,
    threePointPct: 0,
    freeThrowPct: 0,
    threePointAttemptRate: 0,
    freeThrowRate: 0,
    turnoverPct: 0,
    assistPct: 0,
    offensiveReboundPct: 0,
    defensiveReboundPct: 0,
    reboundPct: 0,
    stealPct: 0,
    blockPct: 0,
    pie: 0,
    per: 0,
    ows: 0,
    dws: 0,
    winShares: 0,
    winSharesPer48: 0,
    obpm: 0,
    dbpm: 0,
    bpm: 0,
    vorp: 0,
    dpm: 0,
    oDpm: 0,
    dDpm: 0,
    boxDpm: 0,
    onOffDpm: 0,
    drbl100: 0,
    drblP: 0,
    drblLn: 0,
    drblB: 0,
    drblO: 0,
    drblD: 0,
    sdv100: 0,
    shotMaking100: 0,
    epvShootMean: 0,
    vContMean: 0,
    r1Points: null,
    r1WinEquivalents: null,
    r1PointValueVersion: null,
    r1WinEquivalentVersion: null,
    drblWar: 0,
    drblSeasonalImpact: 0,
    drblL: 0,
    drblMeanLeverage: 0,
    drblDisagreement: 0,
    drblUncertainty: 0,
    drblIntervalLo: 0,
    drblIntervalHi: 0,
    ...partial,
  };
  // Preserve null R1 semantics if partial omitted the fields.
  out.r1Points = partial.r1Points ?? null;
  out.r1WinEquivalents = partial.r1WinEquivalents ?? null;
  // Do not invent zeros for optional provider-published rates.
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

import type { PlayerSeason } from "@/data/types";

/**
 * First season the NBA recorded each stat. Providers (ESPN, NBA Stats) send 0
 * for earlier seasons, which reads as "had none" instead of "not recorded".
 */
const FIRST_RECORDED_SEASON: Partial<Record<keyof PlayerSeason, string>> = {
  steals: "1973-74",
  blocks: "1973-74",
  offensiveRebounds: "1973-74",
  defensiveRebounds: "1973-74",
  stealPct: "1973-74",
  blockPct: "1973-74",
  offensiveReboundPct: "1973-74",
  defensiveReboundPct: "1973-74",
  bpm: "1973-74",
  obpm: "1973-74",
  dbpm: "1973-74",
  vorp: "1973-74",
  turnovers: "1977-78",
  turnoverPct: "1977-78",
  usagePct: "1977-78",
  threePointersMade: "1979-80",
  threePointersAttempted: "1979-80",
  threePointPct: "1979-80",
  threePointAttemptRate: "1979-80",
  gamesStarted: "1982-83",
  plusMinus: "1996-97",
};

/**
 * Turn zeros that predate a stat's first recorded season into NaN (blank).
 * Positive values stay: some sources did log partial data (e.g. starts).
 */
export function maskUnrecordedEraStats<T extends PlayerSeason>(row: T): T {
  const season = row?.season;
  if (!season || season >= "1996-97") return row;
  let out: T | null = null;
  for (const [key, first] of Object.entries(FIRST_RECORDED_SEASON) as [
    keyof PlayerSeason,
    string,
  ][]) {
    if (season >= first) continue;
    const value = row[key];
    if (value === 0) {
      out ??= { ...row };
      (out as Record<string, unknown>)[key] = Number.NaN;
    }
  }
  return out ?? row;
}

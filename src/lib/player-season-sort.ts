/** Shared sort keys for player-season tables (server + client safe). */

export const PLAYER_SEASON_SORT_KEYS = [
  "playerName",
  "teamName",
  "position",
  "gamesPlayed",
  "mpg",
  "ppg",
  "rpg",
  "apg",
  "spg",
  "bpg",
  "tov",
  "personalFouls",
  "plusMinus",
  "fieldGoalsMade",
  "fieldGoalsAttempted",
  "fieldGoalPct",
  "threePointersMade",
  "threePointPct",
  "twoPointersMade",
  "twoPointersAttempted",
  "freeThrowsMade",
  "freeThrowPct",
  "effectiveFieldGoalPct",
  "trueShootingPct",
  "relativeTrueShootingPct",
  "usagePct",
  "age",
  "twoPointPct",
  "turnoverPct",
  "threePointersAttempted",
  "freeThrowsAttempted",
  "offensiveRebounds",
  "defensiveRebounds",
  "stealPct",
  "blockPct",
  "defensiveReboundPct",
  "offensiveReboundPct",
  "reboundPct",
  "assistPct",
  "threePointAttemptRate",
  "freeThrowRate",
  "assistToTurnover",
  "offensiveRating",
  "defensiveRating",
  "netRating",
  "pie",
  "per",
  "ows",
  "dws",
  "winShares",
  "winSharesPer48",
  "obpm",
  "dbpm",
  "bpm",
  "vorp",
  "darkoDpm",
  "darkoOff",
  "darkoDef",
  "raptor",
  "oRaptor",
  "dRaptor",
  "winsAdded",
  "drbl100",
  "drblO",
  "drblD",
  "r1Points",
  "r1WinEquivalents",
  "hustleDeflections",
  "hustleContestedShots",
  "hustleScreenAssists",
  "hustleChargesDrawn",
  "hustleLooseBallsRecovered",
  "hustleBoxOuts",
] as const;

export type PlayerSeasonSortKey = (typeof PLAYER_SEASON_SORT_KEYS)[number];

const SORT_KEYS = new Set<string>(PLAYER_SEASON_SORT_KEYS);

export function parsePlayerSeasonSortKey(
  value: string | string[] | undefined
): PlayerSeasonSortKey | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  // R1 Points / war1 sort bookmarks → r1WinEquivalents (identical ordering).
  const normalized =
    raw === "r1Points" || raw === "war1" ? "r1WinEquivalents" : raw;
  if (!SORT_KEYS.has(normalized)) return undefined;
  return normalized as PlayerSeasonSortKey;
}

export function defaultPlayerSeasonSortDir(
  key: PlayerSeasonSortKey
): "asc" | "desc" {
  if (key === "playerName" || key === "teamName" || key === "position") {
    return "asc";
  }
  if (
    key === "defensiveRating" ||
    key === "tov" ||
    key === "turnoverPct" ||
    key === "personalFouls"
  ) {
    return "asc";
  }
  // DRBL/100 and WAR1 default to descending.
  return "desc";
}

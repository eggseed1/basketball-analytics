/** Shared sort keys for player-season tables (server + client safe). */

export type PlayerSeasonSortKey =
  | "playerName"
  | "teamName"
  | "position"
  | "gamesPlayed"
  | "mpg"
  | "ppg"
  | "rpg"
  | "apg"
  | "spg"
  | "bpg"
  | "tov"
  | "fieldGoalPct"
  | "threePointPct"
  | "freeThrowPct"
  | "effectiveFieldGoalPct"
  | "trueShootingPct"
  | "relativeTrueShootingPct"
  | "usagePct"
  | "age"
  | "twoPointPct"
  | "turnoverPct"
  | "threePointersAttempted"
  | "freeThrowsAttempted"
  | "offensiveRebounds"
  | "defensiveRebounds"
  | "offensiveRating"
  | "defensiveRating"
  | "netRating"
  | "darkoDpm"
  | "darkoOff"
  | "darkoDef"
  | "lebron"
  | "drbl100"
  | "r1Points"
  | "r1WinEquivalents";

const SORT_KEYS = new Set<string>([
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
  "fieldGoalPct",
  "threePointPct",
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
  "offensiveRating",
  "defensiveRating",
  "netRating",
  "darkoDpm",
  "darkoOff",
  "darkoDef",
  "lebron",
  "drbl100",
  "r1Points",
  "r1WinEquivalents",
]);

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
  if (key === "defensiveRating" || key === "tov" || key === "turnoverPct") {
    return "asc";
  }
  // DRBL/100 and WAR1 default to descending.
  return "desc";
}

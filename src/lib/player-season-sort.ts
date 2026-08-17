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
  | "usagePct"
  | "offensiveRating"
  | "defensiveRating"
  | "netRating"
  | "darkoDpm"
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
  "usagePct",
  "offensiveRating",
  "defensiveRating",
  "netRating",
  "darkoDpm",
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
  // R1 Points sort bookmarks → Wins Above R1 (identical ordering).
  const normalized = raw === "r1Points" ? "r1WinEquivalents" : raw;
  if (!SORT_KEYS.has(normalized)) return undefined;
  return normalized as PlayerSeasonSortKey;
}

export function defaultPlayerSeasonSortDir(
  key: PlayerSeasonSortKey
): "asc" | "desc" {
  if (key === "playerName" || key === "teamName" || key === "position") {
    return "asc";
  }
  if (key === "defensiveRating" || key === "tov") return "asc";
  // DRBL/100 and Wins Above R1 default to descending.
  return "desc";
}

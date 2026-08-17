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
  if (!raw || !SORT_KEYS.has(raw)) return undefined;
  return raw as PlayerSeasonSortKey;
}

export function defaultPlayerSeasonSortDir(
  key: PlayerSeasonSortKey
): "asc" | "desc" {
  if (key === "playerName" || key === "teamName" || key === "position") {
    return "asc";
  }
  if (key === "defensiveRating" || key === "tov") return "asc";
  // DRBL/100, R1 Points, R1 Win Equivalents default to descending.
  return "desc";
}

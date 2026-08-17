import type { TeamSeason } from "@/data/types";
import { formatNumber, formatPct } from "@/lib/format";

export type TeamSortKey =
  | "teamName"
  | "wins"
  | "winPct"
  | "pointsPerGame"
  | "netRating"
  | "offensiveRating"
  | "defensiveRating"
  | "trueShootingPct"
  | "pace"
  | "assistsPerGame"
  | "reboundsPerGame"
  | "plusMinus";

export type SortDir = "asc" | "desc";

export interface TeamSortOption {
  key: TeamSortKey;
  label: string;
  defaultDir: SortDir;
  value: (row: TeamSeason) => string | number;
  format: (row: TeamSeason) => string;
  numeric?: boolean;
}

export const TEAM_SORT_OPTIONS: TeamSortOption[] = [
  {
    key: "teamName",
    label: "Team",
    defaultDir: "asc",
    value: (r) => r.teamName,
    format: (r) => r.teamName,
  },
  {
    key: "wins",
    label: "W",
    defaultDir: "desc",
    numeric: true,
    value: (r) => r.wins,
    format: (r) => formatNumber(r.wins),
  },
  {
    key: "winPct",
    label: "W%",
    defaultDir: "desc",
    numeric: true,
    value: (r) => r.winPct,
    format: (r) => formatPct(r.winPct),
  },
  {
    key: "pointsPerGame",
    label: "PTS/G",
    defaultDir: "desc",
    numeric: true,
    value: (r) => r.pointsPerGame,
    format: (r) => formatNumber(r.pointsPerGame, 1),
  },
  {
    key: "netRating",
    label: "NRtg",
    defaultDir: "desc",
    numeric: true,
    value: (r) => r.netRating,
    format: (r) => formatNumber(r.netRating, 1),
  },
  {
    key: "offensiveRating",
    label: "ORtg",
    defaultDir: "desc",
    numeric: true,
    value: (r) => r.offensiveRating,
    format: (r) => formatNumber(r.offensiveRating, 1),
  },
  {
    key: "defensiveRating",
    label: "DRtg",
    defaultDir: "asc",
    numeric: true,
    value: (r) => r.defensiveRating,
    format: (r) => formatNumber(r.defensiveRating, 1),
  },
  {
    key: "trueShootingPct",
    label: "TS%",
    defaultDir: "desc",
    numeric: true,
    value: (r) => r.trueShootingPct,
    format: (r) => formatPct(r.trueShootingPct),
  },
  {
    key: "pace",
    label: "Pace",
    defaultDir: "desc",
    numeric: true,
    value: (r) => r.pace,
    format: (r) => formatNumber(r.pace, 1),
  },
  {
    key: "assistsPerGame",
    label: "AST/G",
    defaultDir: "desc",
    numeric: true,
    value: (r) => r.assistsPerGame,
    format: (r) => formatNumber(r.assistsPerGame, 1),
  },
  {
    key: "reboundsPerGame",
    label: "REB/G",
    defaultDir: "desc",
    numeric: true,
    value: (r) => r.reboundsPerGame,
    format: (r) => formatNumber(r.reboundsPerGame, 1),
  },
  {
    key: "plusMinus",
    label: "+/-",
    defaultDir: "desc",
    numeric: true,
    value: (r) => r.plusMinus,
    format: (r) => formatNumber(r.plusMinus, 1),
  },
];

const BY_KEY = new Map(TEAM_SORT_OPTIONS.map((o) => [o.key, o] as const));

export function getTeamSortOption(key: string | null | undefined): TeamSortOption {
  if (key && BY_KEY.has(key as TeamSortKey)) return BY_KEY.get(key as TeamSortKey)!;
  return BY_KEY.get("netRating")!;
}

export function parseSortDir(value: string | null | undefined): SortDir {
  return value === "asc" ? "asc" : "desc";
}

export function sortTeamSeasons(
  rows: TeamSeason[],
  sortKey: TeamSortKey,
  sortDir: SortDir
): TeamSeason[] {
  const option = getTeamSortOption(sortKey);
  return [...rows].sort((a, b) => {
    const av = option.value(a);
    const bv = option.value(b);
    if (typeof av === "string" && typeof bv === "string") {
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    const an = Number(av);
    const bn = Number(bv);
    return sortDir === "asc" ? an - bn : bn - an;
  });
}

export const TEAM_TABLE_COLUMNS: TeamSortKey[] = [
  "teamName",
  "wins",
  "winPct",
  "pointsPerGame",
  "netRating",
  "offensiveRating",
  "defensiveRating",
  "trueShootingPct",
  "pace",
  "assistsPerGame",
  "reboundsPerGame",
];

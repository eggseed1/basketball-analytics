import { perGame } from "@/data/providers/nba/compute-advanced";
import type { PlayerSeason } from "@/data/types";
import { hasValidDrblEstimate } from "@/data/queries/percentiles";
import { formatMinutes, formatNumber, formatPct } from "@/lib/format";
import { nbaTeamAbbr } from "@/data/providers/nba/nba-team-meta";

export type PlayerSortKey =
  | "playerName"
  | "team"
  | "pointsPerGame"
  | "assistsPerGame"
  | "reboundsPerGame"
  | "usagePct"
  | "trueShootingPct"
  | "effectiveFieldGoalPct"
  | "per"
  | "netRating"
  | "assistPct"
  | "vorp"
  | "dpm"
  | "r1Points"
  | "r1WinEquivalents"
  | "drbl100"
  | "minutes"
  | "gamesPlayed"
  | "points";

export type SortDir = "asc" | "desc";

export interface PlayerSortOption {
  key: PlayerSortKey;
  label: string;
  /** Default direction when this sort is first selected. */
  defaultDir: SortDir;
  value: (row: PlayerSeason) => string | number;
  format: (row: PlayerSeason) => string;
  /** Right-align numeric columns. */
  numeric?: boolean;
}

export const PLAYER_SORT_OPTIONS: PlayerSortOption[] = [
  {
    key: "playerName",
    label: "Player",
    defaultDir: "asc",
    value: (r) => r.playerName,
    format: (r) => r.playerName,
  },
  {
    key: "team",
    label: "Team",
    defaultDir: "asc",
    value: (r) => nbaTeamAbbr(r.teamId, r.teamAbbreviation),
    format: (r) => nbaTeamAbbr(r.teamId, r.teamAbbreviation),
  },
  {
    key: "pointsPerGame",
    label: "PTS/G",
    defaultDir: "desc",
    numeric: true,
    value: (r) => perGame(r.points, r.gamesPlayed),
    format: (r) => formatNumber(perGame(r.points, r.gamesPlayed), 1),
  },
  {
    key: "assistsPerGame",
    label: "AST/G",
    defaultDir: "desc",
    numeric: true,
    value: (r) => perGame(r.assists, r.gamesPlayed),
    format: (r) => formatNumber(perGame(r.assists, r.gamesPlayed), 1),
  },
  {
    key: "reboundsPerGame",
    label: "REB/G",
    defaultDir: "desc",
    numeric: true,
    value: (r) => perGame(r.rebounds, r.gamesPlayed),
    format: (r) => formatNumber(perGame(r.rebounds, r.gamesPlayed), 1),
  },
  {
    key: "usagePct",
    label: "USG%",
    defaultDir: "desc",
    numeric: true,
    value: (r) => r.usagePct,
    format: (r) => formatPct(r.usagePct),
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
    key: "effectiveFieldGoalPct",
    label: "eFG%",
    defaultDir: "desc",
    numeric: true,
    value: (r) => r.effectiveFieldGoalPct,
    format: (r) => formatPct(r.effectiveFieldGoalPct),
  },
  {
    key: "per",
    label: "PER",
    defaultDir: "desc",
    numeric: true,
    value: (r) => r.per,
    format: (r) => formatNumber(r.per, 1),
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
    key: "assistPct",
    label: "AST%",
    defaultDir: "desc",
    numeric: true,
    value: (r) => r.assistPct,
    format: (r) => formatPct(r.assistPct),
  },
  {
    key: "vorp",
    label: "VORP",
    defaultDir: "desc",
    numeric: true,
    value: (r) => r.vorp,
    format: (r) => formatNumber(r.vorp, 1),
  },
  {
    key: "dpm",
    label: "DPM",
    defaultDir: "desc",
    numeric: true,
    value: (r) => r.dpm,
    format: (r) => formatNumber(r.dpm, 1),
  },
  {
    key: "r1Points",
    label: "R1 Points",
    defaultDir: "desc",
    numeric: true,
    value: (r) => r.r1Points ?? Number.NEGATIVE_INFINITY,
    format: (r) =>
      r.r1Points == null ? "—" : formatNumber(r.r1Points, 1),
  },
  {
    key: "r1WinEquivalents",
    label: "R1 Win Eq.",
    defaultDir: "desc",
    numeric: true,
    value: (r) => r.r1WinEquivalents ?? Number.NEGATIVE_INFINITY,
    format: (r) =>
      r.r1WinEquivalents == null
        ? "—"
        : formatNumber(r.r1WinEquivalents, 2),
  },
  {
    key: "drbl100",
    label: "DRBL/100",
    defaultDir: "desc",
    numeric: true,
    value: (r) =>
      hasValidDrblEstimate(r) ? r.drbl100 : Number.NEGATIVE_INFINITY,
    format: (r) =>
      hasValidDrblEstimate(r) ? formatNumber(r.drbl100, 1) : "—",
  },
  {
    key: "minutes",
    label: "MIN",
    defaultDir: "desc",
    numeric: true,
    value: (r) => r.minutes,
    format: (r) => formatMinutes(r.minutes),
  },
  {
    key: "gamesPlayed",
    label: "GP",
    defaultDir: "desc",
    numeric: true,
    value: (r) => r.gamesPlayed,
    format: (r) => formatNumber(r.gamesPlayed),
  },
  {
    key: "points",
    label: "PTS",
    defaultDir: "desc",
    numeric: true,
    value: (r) => r.points,
    format: (r) => formatNumber(r.points),
  },
];

const OPTION_BY_KEY = new Map(
  PLAYER_SORT_OPTIONS.map((opt) => [opt.key, opt] as const)
);

export function getPlayerSortOption(key: string | null | undefined): PlayerSortOption {
  // Old ?sort=drblWar bookmarks redirect to R1 Win Equivalents (not a field alias).
  const normalized =
    key === "drblWar" ? "r1WinEquivalents" : key;
  if (normalized && OPTION_BY_KEY.has(normalized as PlayerSortKey)) {
    return OPTION_BY_KEY.get(normalized as PlayerSortKey)!;
  }
  return OPTION_BY_KEY.get("pointsPerGame")!;
}

export function parseSortDir(value: string | null | undefined): SortDir {
  return value === "asc" ? "asc" : "desc";
}

export function sortPlayerSeasons(
  players: PlayerSeason[],
  sortKey: PlayerSortKey,
  sortDir: SortDir
): PlayerSeason[] {
  const option = getPlayerSortOption(sortKey);
  return [...players].sort((a, b) => {
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

/** Columns shown in the explore table (subset of sort options). */
export const PLAYER_TABLE_COLUMNS: PlayerSortKey[] = [
  "playerName",
  "team",
  "drbl100",
  "r1Points",
  "r1WinEquivalents",
  "pointsPerGame",
  "assistsPerGame",
  "reboundsPerGame",
  "usagePct",
  "trueShootingPct",
  "per",
  "netRating",
  "minutes",
  "gamesPlayed",
];

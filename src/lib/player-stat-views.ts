import type { PlayerSeason } from "@/data/types";
import { formatMinutes, formatNumber, formatPct } from "@/lib/format";
import { perGame } from "@/data/providers/nba/compute-advanced";
import { nbaTeamAbbr } from "@/data/providers/nba/nba-team-meta";
import {
  SHEET_STAT_DEFS,
  formatSheetStatValue,
  getSheetStatValue,
  type SheetRateMode,
  type SheetStatCategory,
  type SheetStatId,
} from "@/lib/player-stat-sheet-registry";

/** BRef-style table modes on the player page. */
export type BrefTableMode = "perGame" | "totals" | "per36" | "advanced";

export interface BrefColumn {
  key: string;
  label: string;
  align?: "left" | "right";
  format: (row: PlayerSeason) => string;
}

const identityCols: BrefColumn[] = [
  {
    key: "season",
    label: "Season",
    align: "left",
    format: (r) => r.season,
  },
  {
    key: "team",
    label: "Tm",
    align: "left",
    format: (r) =>
      nbaTeamAbbr(r.teamId, r.teamAbbreviation) ||
      r.teamAbbreviation ||
      "-",
  },
  {
    key: "pos",
    label: "Pos",
    align: "left",
    format: (r) => r.position ?? "-",
  },
  {
    key: "g",
    label: "G",
    format: (r) => formatNumber(r.gamesPlayed),
  },
  {
    key: "gs",
    label: "GS",
    format: (r) => formatNumber(r.gamesStarted),
  },
];

function sheetCols(
  categories: SheetStatCategory[],
  mode: SheetRateMode
): BrefColumn[] {
  const allow = new Set(categories);
  return SHEET_STAT_DEFS.filter((d) => allow.has(d.category)).map((d) => ({
    key: d.id,
    label: d.label,
    format: (r: PlayerSeason) =>
      formatSheetStatValue(getSheetStatValue(r, d.id as SheetStatId, mode), d, mode),
  }));
}

const BOX_CATEGORIES: SheetStatCategory[] = ["profile", "shooting", "defense"];
const ADV_CATEGORIES: SheetStatCategory[] = [
  "advanced",
  "impact",
];

/** Per-game box + shooting + defense — catalog Profile → Shooting → Defense. */
export const BREF_PER_GAME_COLUMNS: BrefColumn[] = [
  ...identityCols,
  ...sheetCols(BOX_CATEGORIES, "perGame"),
];

export const BREF_TOTALS_COLUMNS: BrefColumn[] = [
  ...identityCols,
  ...sheetCols(BOX_CATEGORIES, "totals"),
];

export const BREF_PER_36_COLUMNS: BrefColumn[] = [
  ...identityCols,
  ...sheetCols(BOX_CATEGORIES, "per36"),
];

/**
 * Advanced + impact (catalog Advanced sheet pack).
 * MP totals for context.
 */
export const BREF_ADVANCED_COLUMNS: BrefColumn[] = [
  ...identityCols,
  {
    key: "mp",
    label: "MP",
    format: (r) => formatMinutes(r.minutes),
  },
  ...sheetCols(ADV_CATEGORIES, "perGame"),
];

export function columnsForMode(mode: BrefTableMode): BrefColumn[] {
  switch (mode) {
    case "totals":
      return BREF_TOTALS_COLUMNS;
    case "per36":
      return BREF_PER_36_COLUMNS;
    case "advanced":
      return BREF_ADVANCED_COLUMNS;
    case "perGame":
    default:
      return BREF_PER_GAME_COLUMNS;
  }
}

export interface SeasonSummaryStat {
  key: string;
  label: string;
  value: string;
  hint?: string;
}

/** BRef SUMMARY strip analog for the selected season. */
export function buildSeasonSummary(row: PlayerSeason): SeasonSummaryStat[] {
  return [
    {
      key: "g",
      label: "G",
      value: formatNumber(row.gamesPlayed),
    },
    {
      key: "pts",
      label: "PTS",
      value: formatNumber(perGame(row.points, row.gamesPlayed), 1),
      hint: "Per game",
    },
    {
      key: "trb",
      label: "TRB",
      value: formatNumber(perGame(row.rebounds, row.gamesPlayed), 1),
    },
    {
      key: "ast",
      label: "AST",
      value: formatNumber(perGame(row.assists, row.gamesPlayed), 1),
    },
    {
      key: "fg",
      label: "FG%",
      value: formatPct(row.fieldGoalPct),
    },
    {
      key: "fg3",
      label: "3P%",
      value: formatPct(row.threePointPct),
    },
    {
      key: "ft",
      label: "FT%",
      value: formatPct(row.freeThrowPct),
    },
    {
      key: "efg",
      label: "eFG%",
      value: formatPct(row.effectiveFieldGoalPct ?? 0),
    },
    {
      key: "ts",
      label: "TS%",
      value: formatPct(row.trueShootingPct ?? 0),
    },
    {
      key: "usg",
      label: "USG%",
      value: formatPct(row.usagePct ?? 0),
    },
  ];
}

export interface ShotDietSlice {
  key: string;
  label: string;
  attempts: number;
  share: number;
}

/** Attempt mix by shot type / zone share. */
export function buildShotDiet(row: PlayerSeason): ShotDietSlice[] {
  const twoA = Math.max(0, row.fieldGoalsAttempted - row.threePointersAttempted);
  const threeA = Math.max(0, row.threePointersAttempted);
  const fta = Math.max(0, row.freeThrowsAttempted);
  const total = twoA + threeA + fta;
  if (total <= 0) {
    return [
      { key: "2pa", label: "2PA", attempts: 0, share: 0 },
      { key: "3pa", label: "3PA", attempts: 0, share: 0 },
      { key: "fta", label: "FTA", attempts: 0, share: 0 },
    ];
  }
  return [
    { key: "2pa", label: "2PA", attempts: twoA, share: twoA / total },
    { key: "3pa", label: "3PA", attempts: threeA, share: threeA / total },
    { key: "fta", label: "FTA", attempts: fta, share: fta / total },
  ];
}

export interface EfficiencyProfileMetric {
  key: string;
  label: string;
  value: number;
  display: string;
}

export function buildEfficiencyProfile(
  row: PlayerSeason
): EfficiencyProfileMetric[] {
  return [
    {
      key: "fg",
      label: "FG%",
      value: row.fieldGoalPct,
      display: formatPct(row.fieldGoalPct),
    },
    {
      key: "2p",
      label: "2P%",
      value: row.twoPointPct,
      display: formatPct(row.twoPointPct),
    },
    {
      key: "3p",
      label: "3P%",
      value: row.threePointPct,
      display: formatPct(row.threePointPct),
    },
    {
      key: "efg",
      label: "eFG%",
      value: row.effectiveFieldGoalPct ?? 0,
      display: formatPct(row.effectiveFieldGoalPct ?? 0),
    },
    {
      key: "ts",
      label: "TS%",
      value: row.trueShootingPct ?? 0,
      display: formatPct(row.trueShootingPct ?? 0),
    },
    {
      key: "ft",
      label: "FT%",
      value: row.freeThrowPct,
      display: formatPct(row.freeThrowPct),
    },
  ];
}

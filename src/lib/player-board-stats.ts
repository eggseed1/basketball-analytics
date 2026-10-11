/**
 * Players board cell values: one source for what a cell shows and how the
 * server sorts that column. Client and server safe.
 */

import type { ExplorePlayerBoardRow } from "@/data/queries/explore-players-board-pure";
import type { PlayerBoardRate } from "@/lib/explore-players-display";
import { formatCountingRate, formatNumber, formatPct } from "@/lib/format";
import type { PlayerSeasonSortKey } from "@/lib/player-season-sort";
import {
  SHEET_STAT_BY_ID,
  sheetStatIdFor,
} from "@/lib/player-stat-sheet-registry";

type Row = ExplorePlayerBoardRow;

function finite(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) ? n : null;
}

function difference(
  a: number | undefined,
  b: number | undefined
): number | undefined {
  return a != null && b != null ? a - b : undefined;
}

/** Season totals behind each counting column; scaled by the rate toggle. */
const COUNT_TOTALS: Partial<
  Record<PlayerSeasonSortKey, (row: Row) => number | null | undefined>
> = {
  ppg: (r) => r.points,
  rpg: (r) => r.rebounds,
  offensiveRebounds: (r) => r.offensiveRebounds,
  defensiveRebounds: (r) => r.defensiveRebounds,
  apg: (r) => r.assists,
  tov: (r) => r.turnovers,
  personalFouls: (r) => r.personalFouls,
  plusMinus: (r) => r.plusMinus,
  fieldGoalsMade: (r) => r.fieldGoalsMade,
  fieldGoalsAttempted: (r) => r.fieldGoalsAttempted,
  threePointersMade: (r) => r.threePointersMade,
  threePointersAttempted: (r) => r.threePointersAttempted,
  twoPointersMade: (r) => difference(r.fieldGoalsMade, r.threePointersMade),
  twoPointersAttempted: (r) =>
    difference(r.fieldGoalsAttempted, r.threePointersAttempted),
  freeThrowsMade: (r) => r.freeThrowsMade,
  freeThrowsAttempted: (r) => r.freeThrowsAttempted,
  spg: (r) => r.steals,
  bpg: (r) => r.blocks,
  hustleDeflections: (r) => r.hustleDeflections,
  hustleContestedShots: (r) => r.hustleContestedShots,
  hustleScreenAssists: (r) => r.hustleScreenAssists,
  hustleChargesDrawn: (r) => r.hustleChargesDrawn,
  hustleLooseBallsRecovered: (r) => r.hustleLooseBallsRecovered,
  hustleBoxOuts: (r) => r.hustleBoxOuts,
};

function scaleCount(
  total: number | null | undefined,
  row: Row,
  rate: PlayerBoardRate
): number | null {
  const t = finite(total);
  if (t == null) return null;
  if (rate === "totals") return t;
  if (rate === "per100") {
    return row.possessions != null && row.possessions > 0
      ? (t * 100) / row.possessions
      : null;
  }
  return row.gamesPlayed > 0 ? t / row.gamesPlayed : null;
}

export function isBoardCountColumn(key: PlayerSeasonSortKey): boolean {
  return key in COUNT_TOTALS;
}

/** Numeric value for a board column under the active rate; null when missing. */
export function boardStatValue(
  row: Row,
  key: PlayerSeasonSortKey,
  rate: PlayerBoardRate
): number | null {
  const total = COUNT_TOTALS[key];
  if (total) return scaleCount(total(row), row, rate);
  switch (key) {
    case "mpg":
      if (rate === "per100") return scaleCount(row.minutes, row, rate);
      return finite(rate === "totals" ? row.minutes : row.mpg);
    case "assistToTurnover":
      return row.turnovers > 0 ? row.assists / row.turnovers : null;
    case "playerName":
    case "teamName":
    case "position":
      return null;
    default: {
      const v = row[key as keyof Row];
      return typeof v === "number" ? finite(v) : null;
    }
  }
}

/** Column header text: the sheet abbreviation wherever the sheet has one. */
export function boardColumnLabel(key: PlayerSeasonSortKey): string {
  switch (key) {
    case "playerName":
      return "Player";
    case "teamName":
      return "Team";
    case "position":
      return "Pos";
    case "gamesPlayed":
      return "GP";
    case "age":
      return "Age";
    case "relativeTrueShootingPct":
      return "rTS%";
    default: {
      const id = sheetStatIdFor(key);
      return id ? SHEET_STAT_BY_ID[id].label : key;
    }
  }
}

type BoardStatFormat =
  | "int"
  | "minutes"
  | "count"
  | "signedCount"
  | "pct"
  | "fixed1"
  | "fixed2"
  | "fixed3"
  | "signed1"
  | "signed2"
  | "relativePct";

const FORMAT: Partial<Record<PlayerSeasonSortKey, BoardStatFormat>> = {
  gamesPlayed: "int",
  age: "int",
  mpg: "minutes",
  plusMinus: "signedCount",
  fieldGoalPct: "pct",
  threePointPct: "pct",
  twoPointPct: "pct",
  freeThrowPct: "pct",
  effectiveFieldGoalPct: "pct",
  trueShootingPct: "pct",
  relativeTrueShootingPct: "relativePct",
  usagePct: "pct",
  turnoverPct: "pct",
  stealPct: "pct",
  blockPct: "pct",
  defensiveReboundPct: "pct",
  offensiveReboundPct: "pct",
  reboundPct: "pct",
  assistPct: "pct",
  threePointAttemptRate: "pct",
  pie: "pct",
  freeThrowRate: "fixed3",
  assistToTurnover: "fixed2",
  offensiveRating: "fixed1",
  defensiveRating: "fixed1",
  netRating: "signed1",
  per: "fixed1",
  ows: "fixed1",
  dws: "fixed1",
  winShares: "fixed1",
  winSharesPer48: "fixed3",
  obpm: "signed1",
  dbpm: "signed1",
  bpm: "signed1",
  vorp: "fixed1",
  darkoDpm: "signed2",
  darkoOff: "signed2",
  darkoDef: "signed2",
  raptor: "signed2",
  oRaptor: "signed2",
  dRaptor: "signed2",
  winsAdded: "fixed1",
  drbl100: "fixed1",
  drblO: "fixed1",
  drblD: "fixed1",
  r1Points: "fixed1",
  r1WinEquivalents: "fixed1",
};

function signed(n: number, digits: number): string {
  return `${n > 0 ? "+" : ""}${formatNumber(n, digits)}`;
}

/** Cell text for a board column. Missing values show "-", never 0. */
export function formatBoardStat(
  key: PlayerSeasonSortKey,
  value: number | null,
  rate: PlayerBoardRate
): string {
  if (value == null) return "-";
  const format = FORMAT[key] ?? (isBoardCountColumn(key) ? "count" : "fixed1");
  switch (format) {
    case "int":
      return formatNumber(value, 0);
    case "minutes":
      return formatNumber(value, rate === "totals" ? 0 : 1);
    case "count":
      return rate === "totals"
        ? formatNumber(value, 0)
        : formatCountingRate(value);
    case "signedCount":
      return signed(value, rate === "totals" ? 0 : 1);
    case "pct":
      return formatPct(value);
    case "fixed1":
      return formatNumber(value, 1);
    case "fixed2":
      return formatNumber(value, 2);
    case "fixed3":
      return formatNumber(value, 3);
    case "signed1":
      return signed(value, 1);
    case "signed2":
      return signed(value, 2);
    case "relativePct":
      return signed(value * 100, 1);
  }
}

/**
 * Canonical player spreadsheet taxonomy (docs/player-stats-catalog.md).
 * Labels, categories, and order for Statistics / Career / BRef packs.
 */

import type { PlayerSeason } from "@/data/types";
import { formatNumber, formatPct } from "@/lib/format";

export type SheetStatCategory =
  | "counting"
  | "hustle"
  | "shooting"
  | "rates"
  | "advanced"
  | "impact";

export type SheetRateMode = "perGame" | "totals" | "per100" | "per36";

export type SheetStatKind = "meta" | "count" | "pct" | "rate";

export type SheetStatId =
  | "mp"
  | "pts"
  | "trb"
  | "orb"
  | "drb"
  | "ast"
  | "stl"
  | "blk"
  | "tov"
  | "pf"
  | "plusMinus"
  | "fg"
  | "fga"
  | "fgPct"
  | "fg3"
  | "fg3a"
  | "fg3Pct"
  | "fg2"
  | "fg2a"
  | "fg2Pct"
  | "ft"
  | "fta"
  | "ftPct"
  | "efg"
  | "ts"
  | "threePar"
  | "ftr"
  | "usg"
  | "tovPct"
  | "astPct"
  | "orbPct"
  | "drbPct"
  | "trbPct"
  | "stlPct"
  | "blkPct"
  | "atr"
  | "ortg"
  | "drtg"
  | "net"
  | "pie"
  | "per"
  | "ows"
  | "dws"
  | "ws"
  | "ws48"
  | "obpm"
  | "dbpm"
  | "bpm"
  | "vorp"
  | "darko"
  | "darkoOff"
  | "darkoDef"
  | "lebron"
  | "oLebron"
  | "dLebron"
  | "winsAdded"
  | "war1"
  | "drbl100"
  | "drblO"
  | "drblD"
  | "hustleDefl"
  | "hustleContest"
  | "hustleScrAst"
  | "hustleChrg"
  | "hustleLoose"
  | "hustleBoxOut";

export type SheetStatDef = {
  id: SheetStatId;
  label: string;
  category: SheetStatCategory;
  kind: SheetStatKind;
  digits?: number;
};

/** Category chips shared by Statistics / Career boards. */
export const SHEET_STAT_CATEGORY_CHIPS: Array<{
  id: "all" | SheetStatCategory;
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "counting", label: "Counting" },
  { id: "hustle", label: "Hustle" },
  { id: "shooting", label: "Shooting" },
  { id: "rates", label: "Rates" },
  { id: "advanced", label: "Advanced" },
  { id: "impact", label: "Impact" },
];

/**
 * Percentile panel uses the same five categories (no All).
 * Impact is first — replaces legacy Overview/Value tab.
 */
export const PERCENTILE_CATEGORY_ORDER: SheetStatCategory[] = [
  "impact",
  "counting",
  "hustle",
  "shooting",
  "rates",
  "advanced",
];

export const PERCENTILE_CATEGORY_CHIPS: Array<{
  id: SheetStatCategory;
  label: string;
}> = PERCENTILE_CATEGORY_ORDER.map((id) => ({
  id,
  label:
    SHEET_STAT_CATEGORY_CHIPS.find((c) => c.id === id)?.label ??
    id.charAt(0).toUpperCase() + id.slice(1),
}));

/** Longer percentile labels where sheets use abbreviations. */
export const PERCENTILE_LABEL_BY_SHEET_ID: Partial<Record<SheetStatId, string>> =
  {
    drbl100: "DRBL/100",
    mp: "MPG",
    pts: "PTS",
    trb: "TRB",
    ast: "AST",
    stl: "STL",
    blk: "BLK",
    tov: "TOV",
    pf: "PF",
    orb: "ORB",
    drb: "DRB",
    usg: "USG%",
    atr: "AST/TO",
    ortg: "ORtg",
    drtg: "DRtg",
    net: "NET",
    plusMinus: "+/-",
    hustleDefl: "Deflections",
    hustleContest: "Contested shots",
    hustleScrAst: "Screen assists",
    hustleChrg: "Charges drawn",
    hustleLoose: "Loose balls",
    hustleBoxOut: "Box outs",
  };

export type PercentileCategory = SheetStatCategory;

/** Canonical All-order metric columns (identity excluded). */
export const SHEET_STAT_DEFS: SheetStatDef[] = [
  { id: "mp", label: "MP", category: "counting", kind: "count", digits: 1 },
  { id: "pts", label: "PTS", category: "counting", kind: "count" },
  { id: "trb", label: "TRB", category: "counting", kind: "count" },
  { id: "orb", label: "ORB", category: "counting", kind: "count" },
  { id: "drb", label: "DRB", category: "counting", kind: "count" },
  { id: "ast", label: "AST", category: "counting", kind: "count" },
  { id: "stl", label: "STL", category: "counting", kind: "count" },
  { id: "blk", label: "BLK", category: "counting", kind: "count" },
  { id: "tov", label: "TOV", category: "counting", kind: "count" },
  { id: "pf", label: "PF", category: "counting", kind: "count" },
  { id: "plusMinus", label: "+/-", category: "counting", kind: "count" },
  { id: "fg", label: "FG", category: "shooting", kind: "count" },
  { id: "fga", label: "FGA", category: "shooting", kind: "count" },
  { id: "fgPct", label: "FG%", category: "shooting", kind: "pct" },
  { id: "fg3", label: "3P", category: "shooting", kind: "count" },
  { id: "fg3a", label: "3PA", category: "shooting", kind: "count" },
  { id: "fg3Pct", label: "3P%", category: "shooting", kind: "pct" },
  { id: "fg2", label: "2P", category: "shooting", kind: "count" },
  { id: "fg2a", label: "2PA", category: "shooting", kind: "count" },
  { id: "fg2Pct", label: "2P%", category: "shooting", kind: "pct" },
  { id: "ft", label: "FT", category: "shooting", kind: "count" },
  { id: "fta", label: "FTA", category: "shooting", kind: "count" },
  { id: "ftPct", label: "FT%", category: "shooting", kind: "pct" },
  { id: "efg", label: "eFG%", category: "shooting", kind: "pct" },
  { id: "ts", label: "TS%", category: "shooting", kind: "pct" },
  { id: "threePar", label: "3PAr", category: "rates", kind: "pct" },
  { id: "ftr", label: "FTr", category: "rates", kind: "rate", digits: 3 },
  { id: "usg", label: "USG%", category: "rates", kind: "pct" },
  { id: "tovPct", label: "TOV%", category: "rates", kind: "pct" },
  { id: "astPct", label: "AST%", category: "rates", kind: "pct" },
  { id: "orbPct", label: "ORB%", category: "rates", kind: "pct" },
  { id: "drbPct", label: "DRB%", category: "rates", kind: "pct" },
  { id: "trbPct", label: "TRB%", category: "rates", kind: "pct" },
  { id: "stlPct", label: "STL%", category: "rates", kind: "pct" },
  { id: "blkPct", label: "BLK%", category: "rates", kind: "pct" },
  { id: "atr", label: "AST/TO", category: "rates", kind: "rate", digits: 2 },
  { id: "ortg", label: "ORtg", category: "advanced", kind: "rate" },
  { id: "drtg", label: "DRtg", category: "advanced", kind: "rate" },
  { id: "net", label: "NET", category: "advanced", kind: "rate" },
  { id: "pie", label: "PIE", category: "advanced", kind: "pct" },
  { id: "per", label: "PER", category: "advanced", kind: "rate" },
  { id: "ows", label: "OWS", category: "advanced", kind: "rate" },
  { id: "dws", label: "DWS", category: "advanced", kind: "rate" },
  { id: "ws", label: "WS", category: "advanced", kind: "rate" },
  { id: "ws48", label: "WS/48", category: "advanced", kind: "rate", digits: 3 },
  { id: "obpm", label: "OBPM", category: "advanced", kind: "rate" },
  { id: "dbpm", label: "DBPM", category: "advanced", kind: "rate" },
  { id: "bpm", label: "BPM", category: "advanced", kind: "rate" },
  { id: "vorp", label: "VORP", category: "advanced", kind: "rate" },
  { id: "darko", label: "DARKO", category: "impact", kind: "rate", digits: 2 },
  {
    id: "darkoOff",
    label: "DARKO-O",
    category: "impact",
    kind: "rate",
    digits: 2,
  },
  {
    id: "darkoDef",
    label: "DARKO-D",
    category: "impact",
    kind: "rate",
    digits: 2,
  },
  { id: "lebron", label: "LEBRON", category: "impact", kind: "rate", digits: 2 },
  {
    id: "oLebron",
    label: "O-LEBRON",
    category: "impact",
    kind: "rate",
    digits: 2,
  },
  {
    id: "dLebron",
    label: "D-LEBRON",
    category: "impact",
    kind: "rate",
    digits: 2,
  },
  {
    id: "winsAdded",
    label: "Wins added",
    category: "impact",
    kind: "rate",
    digits: 2,
  },
  { id: "war1", label: "WAR1", category: "impact", kind: "rate" },
  { id: "drbl100", label: "DRBL", category: "impact", kind: "rate" },
  { id: "drblO", label: "DRBL-O", category: "impact", kind: "rate" },
  { id: "drblD", label: "DRBL-D", category: "impact", kind: "rate" },
  { id: "hustleDefl", label: "Defl", category: "hustle", kind: "count" },
  { id: "hustleContest", label: "Contest", category: "hustle", kind: "count" },
  { id: "hustleScrAst", label: "ScrAst", category: "hustle", kind: "count" },
  { id: "hustleChrg", label: "Chrg", category: "hustle", kind: "count" },
  { id: "hustleLoose", label: "Loose", category: "hustle", kind: "count" },
  { id: "hustleBoxOut", label: "BoxOut", category: "hustle", kind: "count" },
];

export const SHEET_STAT_BY_ID = Object.fromEntries(
  SHEET_STAT_DEFS.map((d) => [d.id, d])
) as Record<SheetStatId, SheetStatDef>;

export function sheetStatsForCategory(
  category: "all" | SheetStatCategory
): SheetStatDef[] {
  if (category === "all") return SHEET_STAT_DEFS;
  return SHEET_STAT_DEFS.filter((d) => d.category === category);
}

export function finiteNum(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) ? n : null;
}

/**
 * Rate fields that career totals zero-fill when unpublished.
 * Treat non-positive as missing so sheets show "-" not "0.0%".
 */
export function publishedRate(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * BRef / impact box fields zero-filled on career totals until overlay.
 * Exact 0 is treated as unpublished (matches percentile panel).
 */
export function publishedAdvanced(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) && n !== 0 ? n : null;
}

export function rateFrac(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) ? n : null;
}

export function twoMade(row: PlayerSeason): number {
  return row.fieldGoalsMade - row.threePointersMade;
}

export function twoAttempted(row: PlayerSeason): number {
  return row.fieldGoalsAttempted - row.threePointersAttempted;
}

export function darkoTotal(row: PlayerSeason): number | null {
  if (row.darkoDpm != null && Number.isFinite(row.darkoDpm)) return row.darkoDpm;
  if (row.dpm != null && Number.isFinite(row.dpm) && row.dpm !== 0) return row.dpm;
  return null;
}

export function darkoOffense(row: PlayerSeason): number | null {
  if (row.darkoOff != null && Number.isFinite(row.darkoOff)) return row.darkoOff;
  if (row.oDpm != null && Number.isFinite(row.oDpm) && row.oDpm !== 0)
    return row.oDpm;
  return null;
}

export function darkoDefense(row: PlayerSeason): number | null {
  if (row.darkoDef != null && Number.isFinite(row.darkoDef)) return row.darkoDef;
  if (row.dDpm != null && Number.isFinite(row.dDpm) && row.dDpm !== 0)
    return row.dDpm;
  return null;
}

export function estimatePossessions(row: PlayerSeason): number | null {
  if (row.drblPossessions != null && row.drblPossessions > 0) {
    return row.drblPossessions;
  }
  if (row.offensiveRating != null && row.offensiveRating > 0 && row.points > 0) {
    return (row.points / row.offensiveRating) * 100;
  }
  const est =
    row.fieldGoalsAttempted +
    0.44 * row.freeThrowsAttempted +
    row.turnovers -
    row.offensiveRebounds;
  return est > 0 ? est : null;
}

export function scaleCount(
  total: number,
  row: PlayerSeason,
  mode: SheetRateMode
): number | null {
  if (!Number.isFinite(total)) return null;
  if (mode === "totals") return total;
  if (mode === "perGame") {
    return row.gamesPlayed > 0 ? total / row.gamesPlayed : null;
  }
  if (mode === "per36") {
    return row.minutes > 0 ? (total / row.minutes) * 36 : null;
  }
  const poss = estimatePossessions(row);
  return poss != null && poss > 0 ? (total / poss) * 100 : null;
}

export function scaleMinutes(
  total: number,
  row: PlayerSeason,
  mode: SheetRateMode
): number | null {
  if (!Number.isFinite(total)) return null;
  if (mode === "totals") return total;
  if (mode === "perGame") {
    return row.gamesPlayed > 0 ? total / row.gamesPlayed : null;
  }
  if (mode === "per36") return 36;
  const poss = estimatePossessions(row);
  if (poss == null || poss <= 0 || row.gamesPlayed <= 0) return null;
  return (total / Math.max(1, row.gamesPlayed) / (poss / row.gamesPlayed)) * 100;
}

/** Raw numeric for a sheet column (null when unavailable). */
export function getSheetStatValue(
  row: PlayerSeason,
  id: SheetStatId,
  mode: SheetRateMode = "perGame"
): number | null {
  const count = (n: number) => scaleCount(n, row, mode);
  switch (id) {
    case "mp":
      return scaleMinutes(row.minutes, row, mode);
    case "pts":
      return count(row.points);
    case "trb":
      return count(row.rebounds);
    case "orb":
      return count(row.offensiveRebounds);
    case "drb":
      return count(row.defensiveRebounds);
    case "ast":
      return count(row.assists);
    case "stl":
      return count(row.steals);
    case "blk":
      return count(row.blocks);
    case "tov":
      return count(row.turnovers);
    case "pf":
      return count(row.personalFouls);
    case "plusMinus":
      return count(row.plusMinus);
    case "fg":
      return count(row.fieldGoalsMade);
    case "fga":
      return count(row.fieldGoalsAttempted);
    case "fgPct":
      return rateFrac(row.fieldGoalPct);
    case "fg3":
      return count(row.threePointersMade);
    case "fg3a":
      return count(row.threePointersAttempted);
    case "fg3Pct":
      return rateFrac(row.threePointPct);
    case "fg2":
      return count(twoMade(row));
    case "fg2a":
      return count(twoAttempted(row));
    case "fg2Pct":
      return rateFrac(row.twoPointPct);
    case "ft":
      return count(row.freeThrowsMade);
    case "fta":
      return count(row.freeThrowsAttempted);
    case "ftPct":
      return rateFrac(row.freeThrowPct);
    case "efg":
      return rateFrac(row.effectiveFieldGoalPct);
    case "ts":
      return rateFrac(row.trueShootingPct);
    case "threePar":
      return rateFrac(row.threePointAttemptRate);
    case "ftr":
      return rateFrac(row.freeThrowRate);
    case "usg":
      return publishedRate(row.usagePct);
    case "tovPct":
      return publishedRate(row.turnoverPct);
    case "astPct":
      return publishedRate(row.assistPct);
    case "orbPct":
      return publishedRate(row.offensiveReboundPct);
    case "drbPct":
      return publishedRate(row.defensiveReboundPct);
    case "trbPct":
      return publishedRate(row.reboundPct);
    case "stlPct":
      return publishedRate(row.stealPct);
    case "blkPct":
      return publishedRate(row.blockPct);
    case "atr": {
      const a = row.assists;
      const t = row.turnovers;
      return t > 0 ? a / t : null;
    }
    case "ortg":
      return row.offensiveRating != null && row.offensiveRating > 0
        ? finiteNum(row.offensiveRating)
        : null;
    case "drtg":
      return row.defensiveRating != null &&
        Number.isFinite(row.defensiveRating) &&
        row.defensiveRating > 0
        ? finiteNum(row.defensiveRating)
        : null;
    case "net":
      return row.offensiveRating != null &&
        row.offensiveRating > 0 &&
        row.defensiveRating != null &&
        row.defensiveRating > 0
        ? finiteNum(row.netRating)
        : null;
    case "pie":
      return publishedRate(row.pie);
    case "per":
      return publishedAdvanced(row.per);
    case "ows":
      return publishedAdvanced(row.ows);
    case "dws":
      return publishedAdvanced(row.dws);
    case "ws":
      return publishedAdvanced(row.winShares);
    case "ws48":
      return publishedAdvanced(row.winSharesPer48);
    case "obpm":
      return publishedAdvanced(row.obpm);
    case "dbpm":
      return publishedAdvanced(row.dbpm);
    case "bpm":
      return publishedAdvanced(row.bpm);
    case "vorp":
      return publishedAdvanced(row.vorp);
    case "darko":
      return darkoTotal(row);
    case "darkoOff":
      return darkoOffense(row);
    case "darkoDef":
      return darkoDefense(row);
    case "lebron":
      return finiteNum(row.lebron);
    case "oLebron":
      return finiteNum(row.oLebron);
    case "dLebron":
      return finiteNum(row.dLebron);
    case "winsAdded":
      return finiteNum(row.winsAdded);
    case "war1":
      return finiteNum(row.r1WinEquivalents);
    case "drbl100":
      return row.drbl100 !== 0 ? finiteNum(row.drbl100) : null;
    case "drblO":
      return row.drblO !== 0 ? finiteNum(row.drblO) : null;
    case "drblD":
      return row.drblD !== 0 ? finiteNum(row.drblD) : null;
    case "hustleDefl":
      return row.hustleDeflections != null
        ? count(row.hustleDeflections)
        : null;
    case "hustleContest":
      return row.hustleContestedShots != null
        ? count(row.hustleContestedShots)
        : null;
    case "hustleScrAst":
      return row.hustleScreenAssists != null
        ? count(row.hustleScreenAssists)
        : null;
    case "hustleChrg":
      return row.hustleChargesDrawn != null
        ? count(row.hustleChargesDrawn)
        : null;
    case "hustleLoose":
      return row.hustleLooseBallsRecovered != null
        ? count(row.hustleLooseBallsRecovered)
        : null;
    case "hustleBoxOut":
      return row.hustleBoxOuts != null ? count(row.hustleBoxOuts) : null;
    default:
      return null;
  }
}

export function formatSheetStatValue(
  value: number | null,
  def: SheetStatDef,
  mode: SheetRateMode = "perGame"
): string {
  if (value == null) return "-";
  if (def.kind === "pct") return formatPct(value);
  const digits =
    def.digits ??
    (def.kind === "meta"
      ? 0
      : mode === "totals" && def.kind === "count"
        ? 0
        : 1);
  return formatNumber(value, digits);
}

/** True if any row has a finite value for this column (hide empty impact cols). */
export function sheetStatHasAnyValue(
  rows: PlayerSeason[],
  id: SheetStatId,
  mode: SheetRateMode = "perGame"
): boolean {
  return rows.some((r) => getSheetStatValue(r, id, mode) != null);
}

export function visibleSheetStats(
  rows: PlayerSeason[],
  category: "all" | SheetStatCategory,
  mode: SheetRateMode = "perGame"
): SheetStatDef[] {
  return sheetStatsForCategory(category).filter((def) => {
    if (def.category !== "impact" && def.category !== "hustle") return true;
    return sheetStatHasAnyValue(rows, def.id, mode);
  });
}

/**
 * Pure explore-players board row transforms — safe for Node fixture tests.
 * No server-only imports; no query-layer fetching.
 */

import { getPlayerMedia } from "@/data/media/get-player-media";
import { hasValidDrblEstimate } from "@/data/queries/percentiles";
import type { PlayerSeason } from "@/data/types";
import {
  defaultPlayerSeasonSortDir,
  type PlayerSeasonSortKey,
} from "@/lib/player-season-sort";
import { boardStatValue } from "@/lib/player-board-stats";
import type { PlayerBoardRate } from "@/lib/explore-players-display";
import {
  getSheetStatValue,
  type SheetStatId,
} from "@/lib/player-stat-sheet-registry";

/** Display + Level-2 context fields only - not the full canonical PlayerSeason. */
export type ExplorePlayerBoardRow = {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  teamAbbreviation?: string;
  season: string;
  position?: string;
  gamesPlayed: number;
  minutes: number;
  points: number;
  assists: number;
  rebounds: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fieldGoalPct: number;
  threePointPct: number;
  freeThrowPct: number;
  trueShootingPct?: number;
  effectiveFieldGoalPct?: number;
  usagePct?: number;
  offensiveRating?: number;
  defensiveRating?: number;
  netRating?: number;
  darkoDpm?: number;
  darkoOff?: number;
  darkoDef?: number;
  raptor?: number;
  oRaptor?: number;
  dRaptor?: number;
  winsAdded?: number;
  bpm?: number;
  /** Unrounded validated DRBL/100 when overlay present; omit when missing. */
  drbl100?: number;
  /** null/omitted when DRBL overlay absent - never coerce missing to 0. */
  r1Points?: number | null;
  /** null/omitted when DRBL overlay absent - never coerce missing to 0. */
  r1WinEquivalents?: number | null;
  mpg: number;
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  tov: number;
  age?: number;
  twoPointPct?: number;
  turnoverPct?: number;
  threePointersAttempted?: number;
  freeThrowsAttempted?: number;
  offensiveRebounds?: number;
  defensiveRebounds?: number;
  /** Player TS% minus board mean TS% (fraction). */
  relativeTrueShootingPct?: number;
  /** NBA hustle season totals when overlay present. */
  hustleDeflections?: number;
  hustleContestedShots?: number;
  hustleScreenAssists?: number;
  hustleChargesDrawn?: number;
  hustleLooseBallsRecovered?: number;
  hustleBoxOuts?: number;
  /** Season totals and published rates; omitted when the source lacks them. */
  personalFouls?: number;
  plusMinus?: number;
  fieldGoalsMade?: number;
  fieldGoalsAttempted?: number;
  threePointersMade?: number;
  freeThrowsMade?: number;
  stealPct?: number;
  blockPct?: number;
  defensiveReboundPct?: number;
  offensiveReboundPct?: number;
  reboundPct?: number;
  assistPct?: number;
  threePointAttemptRate?: number;
  freeThrowRate?: number;
  pie?: number;
  per?: number;
  ows?: number;
  dws?: number;
  winShares?: number;
  winSharesPer48?: number;
  obpm?: number;
  dbpm?: number;
  vorp?: number;
  drblO?: number;
  drblD?: number;
  portraitUrl?: string | null;
};

/** Board fields filled straight from the sheet registry (totals mode). */
const SHEET_BACKED_FIELDS = [
  ["personalFouls", "pf"],
  ["plusMinus", "plusMinus"],
  ["fieldGoalsMade", "fg"],
  ["fieldGoalsAttempted", "fga"],
  ["threePointersMade", "fg3"],
  ["freeThrowsMade", "ft"],
  ["stealPct", "stlPct"],
  ["blockPct", "blkPct"],
  ["defensiveReboundPct", "drbPct"],
  ["offensiveReboundPct", "orbPct"],
  ["reboundPct", "trbPct"],
  ["assistPct", "astPct"],
  ["threePointAttemptRate", "threePar"],
  ["freeThrowRate", "ftr"],
  ["pie", "pie"],
  ["per", "per"],
  ["ows", "ows"],
  ["dws", "dws"],
  ["winShares", "ws"],
  ["winSharesPer48", "ws48"],
  ["obpm", "obpm"],
  ["dbpm", "dbpm"],
  ["vorp", "vorp"],
] as const satisfies ReadonlyArray<
  readonly [keyof ExplorePlayerBoardRow, SheetStatId]
>;

function perGame(total: number, gp: number): number {
  if (!gp) return 0;
  return total / gp;
}

export function toExplorePlayerBoardRow(p: PlayerSeason): ExplorePlayerBoardRow {
  const gp = p.gamesPlayed || 0;
  const row: ExplorePlayerBoardRow = {
    playerId: p.playerId,
    playerName: p.playerName,
    teamId: p.teamId,
    teamName: p.teamName,
    teamAbbreviation: p.teamAbbreviation,
    season: p.season,
    position: p.position,
    gamesPlayed: p.gamesPlayed,
    minutes: p.minutes,
    points: p.points,
    assists: p.assists,
    rebounds: p.rebounds,
    steals: p.steals,
    blocks: p.blocks,
    turnovers: p.turnovers,
    fieldGoalPct: p.fieldGoalPct,
    threePointPct: p.threePointPct,
    freeThrowPct: p.freeThrowPct,
    mpg: perGame(p.minutes, gp),
    ppg: perGame(p.points, gp),
    rpg: perGame(p.rebounds, gp),
    apg: perGame(p.assists, gp),
    spg: perGame(p.steals, gp),
    bpg: perGame(p.blocks, gp),
    tov: perGame(p.turnovers, gp),
  };
  if (p.trueShootingPct != null) row.trueShootingPct = p.trueShootingPct;
  if (p.effectiveFieldGoalPct != null) {
    row.effectiveFieldGoalPct = p.effectiveFieldGoalPct;
  }
  if (p.usagePct != null) row.usagePct = p.usagePct;
  if (p.offensiveRating != null) row.offensiveRating = p.offensiveRating;
  if (p.defensiveRating != null) row.defensiveRating = p.defensiveRating;
  if (p.netRating != null) row.netRating = p.netRating;
  if (p.darkoDpm != null) row.darkoDpm = p.darkoDpm;
  if (p.darkoOff != null) row.darkoOff = p.darkoOff;
  else if (p.oDpm) row.darkoOff = p.oDpm;
  if (p.darkoDef != null) row.darkoDef = p.darkoDef;
  else if (p.dDpm) row.darkoDef = p.dDpm;
  if (row.darkoDpm == null && p.dpm) row.darkoDpm = p.dpm;
  if (p.raptor != null) row.raptor = p.raptor;
  if (p.oRaptor != null) row.oRaptor = p.oRaptor;
  if (p.dRaptor != null) row.dRaptor = p.dRaptor;
  if (p.winsAdded != null) row.winsAdded = p.winsAdded;
  if (p.bpm != null && Number.isFinite(p.bpm)) row.bpm = p.bpm;
  if (p.age != null && p.age > 0) row.age = p.age;
  const media = getPlayerMedia([p.playerId]).get(p.playerId);
  row.portraitUrl = media?.sourceUrl ?? null;
  if (p.twoPointPct) row.twoPointPct = p.twoPointPct;
  if (p.turnoverPct) row.turnoverPct = p.turnoverPct;
  row.threePointersAttempted = p.threePointersAttempted;
  row.freeThrowsAttempted = p.freeThrowsAttempted;
  if (p.offensiveRebounds != null && Number.isFinite(p.offensiveRebounds)) {
    row.offensiveRebounds = p.offensiveRebounds;
  }
  if (p.defensiveRebounds != null && Number.isFinite(p.defensiveRebounds)) {
    row.defensiveRebounds = p.defensiveRebounds;
  }
  for (const [field, sheetId] of SHEET_BACKED_FIELDS) {
    const value = getSheetStatValue(p, sheetId, "totals");
    if (value != null) row[field] = value;
  }
  if (hasValidDrblEstimate(p)) {
    row.drbl100 = p.drbl100;
    row.r1Points = p.r1Points ?? null;
    row.r1WinEquivalents = p.r1WinEquivalents ?? null;
    const drblO = getSheetStatValue(p, "drblO");
    const drblD = getSheetStatValue(p, "drblD");
    if (drblO != null) row.drblO = drblO;
    if (drblD != null) row.drblD = drblD;
  }
  if (p.hustleDeflections != null) row.hustleDeflections = p.hustleDeflections;
  if (p.hustleContestedShots != null) {
    row.hustleContestedShots = p.hustleContestedShots;
  }
  if (p.hustleScreenAssists != null) {
    row.hustleScreenAssists = p.hustleScreenAssists;
  }
  if (p.hustleChargesDrawn != null) row.hustleChargesDrawn = p.hustleChargesDrawn;
  if (p.hustleLooseBallsRecovered != null) {
    row.hustleLooseBallsRecovered = p.hustleLooseBallsRecovered;
  }
  if (p.hustleBoxOuts != null) row.hustleBoxOuts = p.hustleBoxOuts;
  return row;
}

const TEXT_SORT_KEYS = new Set<PlayerSeasonSortKey>([
  "playerName",
  "teamName",
  "position",
]);

/** Missing values sort last in both directions; they never count as 0. */
function sortValue(
  row: ExplorePlayerBoardRow,
  key: PlayerSeasonSortKey,
  sortDir: "asc" | "desc",
  rate: PlayerBoardRate
): string | number {
  if (TEXT_SORT_KEYS.has(key)) {
    const v = row[key as keyof ExplorePlayerBoardRow];
    return typeof v === "string" ? v : "";
  }
  const v = boardStatValue(row, key, rate);
  if (v == null) {
    return sortDir === "asc"
      ? Number.POSITIVE_INFINITY
      : Number.NEGATIVE_INFINITY;
  }
  return v;
}

export function sortExplorePlayerRows(
  rows: ExplorePlayerBoardRow[],
  sortKey: PlayerSeasonSortKey,
  sortDir: "asc" | "desc",
  rate: PlayerBoardRate = "perGame"
): ExplorePlayerBoardRow[] {
  return [...rows].sort((a, b) => {
    const av = sortValue(a, sortKey, sortDir, rate);
    const bv = sortValue(b, sortKey, sortDir, rate);
    if (typeof av === "string" && typeof bv === "string") {
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    const an = Number(av);
    const bn = Number(bv);
    if (an === bn) return a.playerName.localeCompare(b.playerName);
    return sortDir === "asc" ? an - bn : bn - an;
  });
}

export function parseExplorePlayersSortDir(
  value: string | string[] | undefined,
  sortKey: PlayerSeasonSortKey
): "asc" | "desc" {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "asc" || raw === "desc") return raw;
  return defaultPlayerSeasonSortDir(sortKey);
}

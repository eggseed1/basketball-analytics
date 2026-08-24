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
  lebron?: number;
  oLebron?: number;
  dLebron?: number;
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
  portraitUrl?: string | null;
};

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
  if (p.lebron != null) row.lebron = p.lebron;
  if (p.oLebron != null) row.oLebron = p.oLebron;
  if (p.dLebron != null) row.dLebron = p.dLebron;
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
  if (hasValidDrblEstimate(p)) {
    row.drbl100 = p.drbl100;
    row.r1Points = p.r1Points ?? null;
    row.r1WinEquivalents = p.r1WinEquivalents ?? null;
  }
  return row;
}

function sortKeyIsImpact(key: PlayerSeasonSortKey): boolean {
  return (
    key === "darkoDpm" ||
    key === "darkoOff" ||
    key === "darkoDef" ||
    key === "lebron"
  );
}

function sortKeyIsDrbl(key: PlayerSeasonSortKey): boolean {
  return (
    key === "drbl100" || key === "r1Points" || key === "r1WinEquivalents"
  );
}

function sortKeyIsOptionalRating(key: PlayerSeasonSortKey): boolean {
  return (
    key === "offensiveRating" ||
    key === "defensiveRating" ||
    key === "netRating" ||
    key === "trueShootingPct" ||
    key === "effectiveFieldGoalPct" ||
    key === "usagePct" ||
    key === "age" ||
    key === "twoPointPct" ||
    key === "turnoverPct" ||
    key === "relativeTrueShootingPct" ||
    sortKeyIsImpact(key) ||
    sortKeyIsDrbl(key)
  );
}

function sortValue(
  row: ExplorePlayerBoardRow,
  key: PlayerSeasonSortKey,
  sortDir: "asc" | "desc"
): string | number {
  const v = row[key as keyof ExplorePlayerBoardRow];
  if (v == null || (typeof v === "number" && Number.isNaN(v))) {
    if (typeof v === "string") return "";
    if (
      sortKeyIsOptionalRating(key) ||
      sortKeyIsImpact(key) ||
      sortKeyIsDrbl(key)
    ) {
      return sortDir === "asc"
        ? Number.POSITIVE_INFINITY
        : Number.NEGATIVE_INFINITY;
    }
    return 0;
  }
  return v as string | number;
}

export function sortExplorePlayerRows(
  rows: ExplorePlayerBoardRow[],
  sortKey: PlayerSeasonSortKey,
  sortDir: "asc" | "desc"
): ExplorePlayerBoardRow[] {
  return [...rows].sort((a, b) => {
    const av = sortValue(a, sortKey, sortDir);
    const bv = sortValue(b, sortKey, sortDir);
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

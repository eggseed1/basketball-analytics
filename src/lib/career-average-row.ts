import type { PlayerSeason } from "@/data/types";
import { withPlayerSeasonDefaults } from "@/data/transformers/player-season-defaults";

/** URL / picker sentinel for career-average compare mode. */
export const CAREER_COMPARE_KEY = "career";

export function isCareerCompareKey(value: string | null | undefined): boolean {
  return String(value ?? "").trim().toLowerCase() === CAREER_COMPARE_KEY;
}

function finite(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) ? n : null;
}

function sumOptional(
  rows: PlayerSeason[],
  pick: (r: PlayerSeason) => number | null | undefined
): number | undefined {
  let total = 0;
  let any = false;
  for (const row of rows) {
    const v = pick(row);
    if (v != null && Number.isFinite(v)) {
      total += v;
      any = true;
    }
  }
  return any ? total : undefined;
}

function sumField(
  rows: PlayerSeason[],
  pick: (r: PlayerSeason) => number | null | undefined
): number {
  return sumOptional(rows, pick) ?? 0;
}

/** Minutes-weighted mean of rate fields (skip missing). */
function weightedMean(
  rows: PlayerSeason[],
  pick: (r: PlayerSeason) => number | null | undefined
): number | undefined {
  let num = 0;
  let den = 0;
  for (const row of rows) {
    const v = pick(row);
    const w = finite(row.minutes);
    if (v == null || !Number.isFinite(v) || w == null || w <= 0) continue;
    num += v * w;
    den += w;
  }
  return den > 0 ? num / den : undefined;
}

/**
 * Collapse multi-season rows into one career per-game average row.
 * Counting totals are summed then expressed as season totals on a synthetic
 * row so sheet `perGame` scaling still works (totals / GP).
 */
export function buildCareerAverageRow(
  seasons: PlayerSeason[]
): PlayerSeason | null {
  // One row per season: prefer TOT aggregate when present.
  const bySeason = new Map<string, PlayerSeason[]>();
  for (const row of seasons) {
    if (!(row.gamesPlayed > 0) || !Number.isFinite(row.gamesPlayed)) continue;
    if (!/^\d{4}-\d{2}$/.test(row.season)) continue;
    const list = bySeason.get(row.season) ?? [];
    list.push(row);
    bySeason.set(row.season, list);
  }
  const pool: PlayerSeason[] = [];
  for (const [, list] of bySeason) {
    const tot = list.find((r) => String(r.teamId).toUpperCase() === "TOT");
    pool.push(tot ?? list[0]!);
  }
  if (!pool.length) return null;

  const first = pool[0]!;
  const gp = sumField(pool, (r) => r.gamesPlayed);
  const gs = sumField(pool, (r) => r.gamesStarted);
  const minutes = sumField(pool, (r) => r.minutes);
  if (gp <= 0) return null;

  return withPlayerSeasonDefaults({
    playerId: first.playerId,
    playerName: first.playerName,
    teamId: "CAREER",
    teamName: "Career",
    teamAbbreviation: "CAR",
    season: CAREER_COMPARE_KEY,
    position: first.position,
    gamesPlayed: gp,
    gamesStarted: gs,
    minutes,
    fieldGoalsMade: sumField(pool, (r) => r.fieldGoalsMade),
    fieldGoalsAttempted: sumField(pool, (r) => r.fieldGoalsAttempted),
    threePointersMade: sumField(pool, (r) => r.threePointersMade),
    threePointersAttempted: sumField(pool, (r) => r.threePointersAttempted),
    freeThrowsMade: sumField(pool, (r) => r.freeThrowsMade),
    freeThrowsAttempted: sumField(pool, (r) => r.freeThrowsAttempted),
    offensiveRebounds: sumField(pool, (r) => r.offensiveRebounds),
    defensiveRebounds: sumField(pool, (r) => r.defensiveRebounds),
    rebounds: sumField(pool, (r) => r.rebounds),
    assists: sumField(pool, (r) => r.assists),
    steals: sumField(pool, (r) => r.steals),
    blocks: sumField(pool, (r) => r.blocks),
    turnovers: sumField(pool, (r) => r.turnovers),
    personalFouls: sumField(pool, (r) => r.personalFouls),
    points: sumField(pool, (r) => r.points),
    plusMinus: sumField(pool, (r) => r.plusMinus),
    fieldGoalPct: weightedMean(pool, (r) => r.fieldGoalPct) ?? Number.NaN,
    twoPointPct: weightedMean(pool, (r) => r.twoPointPct) ?? Number.NaN,
    threePointPct: weightedMean(pool, (r) => r.threePointPct) ?? Number.NaN,
    freeThrowPct: weightedMean(pool, (r) => r.freeThrowPct) ?? Number.NaN,
    effectiveFieldGoalPct: weightedMean(pool, (r) => r.effectiveFieldGoalPct),
    trueShootingPct: weightedMean(pool, (r) => r.trueShootingPct),
    threePointAttemptRate:
      weightedMean(pool, (r) => r.threePointAttemptRate) ?? Number.NaN,
    freeThrowRate: weightedMean(pool, (r) => r.freeThrowRate) ?? Number.NaN,
    turnoverPct: weightedMean(pool, (r) => r.turnoverPct) ?? Number.NaN,
    usagePct: weightedMean(pool, (r) => r.usagePct),
    assistPct: weightedMean(pool, (r) => r.assistPct) ?? Number.NaN,
    offensiveReboundPct:
      weightedMean(pool, (r) => r.offensiveReboundPct) ?? Number.NaN,
    defensiveReboundPct:
      weightedMean(pool, (r) => r.defensiveReboundPct) ?? Number.NaN,
    reboundPct: weightedMean(pool, (r) => r.reboundPct) ?? Number.NaN,
    stealPct: weightedMean(pool, (r) => r.stealPct) ?? Number.NaN,
    blockPct: weightedMean(pool, (r) => r.blockPct) ?? Number.NaN,
    pie: weightedMean(pool, (r) => r.pie) ?? Number.NaN,
    offensiveRating: weightedMean(pool, (r) => r.offensiveRating),
    defensiveRating: weightedMean(pool, (r) => r.defensiveRating),
    netRating: weightedMean(pool, (r) => r.netRating),
    per: weightedMean(pool, (r) => r.per) ?? Number.NaN,
    ows: sumField(pool, (r) => r.ows),
    dws: sumField(pool, (r) => r.dws),
    winShares: sumField(pool, (r) => r.winShares),
    winSharesPer48: weightedMean(pool, (r) => r.winSharesPer48) ?? Number.NaN,
    obpm: weightedMean(pool, (r) => r.obpm) ?? Number.NaN,
    dbpm: weightedMean(pool, (r) => r.dbpm) ?? Number.NaN,
    bpm: weightedMean(pool, (r) => r.bpm) ?? Number.NaN,
    vorp: sumField(pool, (r) => r.vorp),
    dpm: weightedMean(pool, (r) => r.dpm) ?? Number.NaN,
    oDpm: weightedMean(pool, (r) => r.oDpm) ?? Number.NaN,
    dDpm: weightedMean(pool, (r) => r.dDpm) ?? Number.NaN,
    boxDpm: weightedMean(pool, (r) => r.boxDpm) ?? Number.NaN,
    onOffDpm: weightedMean(pool, (r) => r.onOffDpm) ?? Number.NaN,
    darkoDpm: weightedMean(pool, (r) => r.darkoDpm),
    darkoOff: weightedMean(pool, (r) => r.darkoOff),
    darkoDef: weightedMean(pool, (r) => r.darkoDef),
    raptor: weightedMean(pool, (r) => r.raptor),
    oRaptor: weightedMean(pool, (r) => r.oRaptor),
    dRaptor: weightedMean(pool, (r) => r.dRaptor),
    winsAdded: sumOptional(pool, (r) => r.winsAdded),
    drbl100: weightedMean(pool, (r) => r.drbl100) ?? Number.NaN,
    drblO: weightedMean(pool, (r) => r.drblO) ?? Number.NaN,
    drblD: weightedMean(pool, (r) => r.drblD) ?? Number.NaN,
    r1WinEquivalents: sumOptional(pool, (r) => r.r1WinEquivalents) ?? null,
    draftYear: first.draftYear,
  });
}

export function careerSpanLabel(seasons: PlayerSeason[]): string {
  const keys = [
    ...new Set(
      seasons
        .filter((r) => r.gamesPlayed > 0)
        .map((r) => r.season)
        .filter((s) => /^\d{4}-\d{2}$/.test(s))
    ),
  ].sort();
  if (!keys.length) return "Career";
  if (keys.length === 1) return keys[0]!;
  return `${keys[0]}–${keys[keys.length - 1]}`;
}

/**
 * Teams ordered by career minutes (longest first). Skips TOT aggregates.
 * Used for compare identity chips under career averages.
 */
export function careerTeamKeysByTenure(seasons: PlayerSeason[]): string[] {
  const minutesByKey = new Map<string, number>();
  for (const row of seasons) {
    if (!(row.gamesPlayed > 0)) continue;
    const tid = String(row.teamId ?? "").toUpperCase();
    if (!tid || tid === "TOT" || tid === "CAREER") continue;
    const key = (row.teamAbbreviation || tid).trim();
    if (!key || key.toUpperCase() === "TOT") continue;
    minutesByKey.set(
      key,
      (minutesByKey.get(key) ?? 0) + Math.max(0, row.minutes || 0)
    );
  }
  return [...minutesByKey.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key]) => key);
}

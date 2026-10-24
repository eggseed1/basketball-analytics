/**
 * Map PlayerSeason rows → CareerBoardRow for the career table/chart.
 * Shared by SSR Career island and client overview fetch (no server-only imports).
 */
import { careerProductionIndex, dedupeCareerSeasons } from "@/analytics/career-resume";
import type { CareerBoardRow } from "@/components/players/player-career-board";
// type-only — keep this module free of client component imports
import { hasValidDrblEstimate } from "@/data/queries/percentiles";
import type { PlayerSeason } from "@/data/types";
import {
  isMultiTeamSeasonRow,
  multiTeamSeasonLabel,
} from "@/lib/player-team-context";
import {
  darkoDefense,
  darkoOffense,
  darkoTotal,
  finiteNum,
  publishedAdvanced,
} from "@/lib/player-stat-sheet-registry";

function perGame(total: number, games: number) {
  return games > 0 ? total / games : 0;
}

function rate(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
}

/** Drop null metric fields — RSC still ships `"raptor":null` otherwise. */
function omitNullMetrics(row: CareerBoardRow): CareerBoardRow {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== null) out[key] = value;
  }
  return out as CareerBoardRow;
}

export function toCareerBoardRows(career: PlayerSeason[]): CareerBoardRow[] {
  return dedupeCareerSeasons(career).map((row) => {
    const gp = row.gamesPlayed;
    const apg = perGame(row.assists, gp);
    const tpg = perGame(row.turnovers, gp);
    const drbl = hasValidDrblEstimate(row);
    return omitNullMetrics({
      season: row.season,
      teamId: row.teamId,
      teamAbbr: isMultiTeamSeasonRow(row)
        ? multiTeamSeasonLabel(row, career)
        : (row.teamAbbreviation ?? ""),
      gamesPlayed: gp,
      mpg: gp > 0 ? perGame(row.minutes, gp) : null,
      ppg: perGame(row.points, gp),
      apg,
      rpg: perGame(row.rebounds, gp),
      orpg: finiteNum(perGame(row.offensiveRebounds, gp)),
      drpg: finiteNum(perGame(row.defensiveRebounds, gp)),
      spg: finiteNum(perGame(row.steals, gp)),
      bpg: finiteNum(perGame(row.blocks, gp)),
      tov: finiteNum(tpg),
      pf: finiteNum(perGame(row.personalFouls, gp)),
      atr: tpg > 0 ? apg / tpg : null,
      fgPct: rate(row.fieldGoalPct),
      twoPct: rate(row.twoPointPct),
      threePct: rate(row.threePointPct),
      ftPct: rate(row.freeThrowPct),
      efg: rate(row.effectiveFieldGoalPct),
      ts: rate(row.trueShootingPct),
      usg: rate(row.usagePct),
      threePar: rate(row.threePointAttemptRate),
      ftr: rate(row.freeThrowRate),
      ortg: rate(row.offensiveRating),
      drtg:
        rate(row.offensiveRating) != null &&
        row.defensiveRating != null &&
        row.defensiveRating > 0
          ? finiteNum(row.defensiveRating)
          : null,
      net:
        rate(row.offensiveRating) != null &&
        row.defensiveRating != null &&
        row.defensiveRating > 0
          ? finiteNum(row.netRating)
          : null,
      per: publishedAdvanced(row.per),
      bpm: publishedAdvanced(row.bpm),
      vorp: publishedAdvanced(row.vorp),
      ws: publishedAdvanced(row.winShares),
      cpi: careerProductionIndex(row),
      darko: darkoTotal(row),
      darkoOff: darkoOffense(row),
      darkoDef: darkoDefense(row),
      raptor: finiteNum(row.raptor),
      oRaptor: finiteNum(row.oRaptor),
      dRaptor: finiteNum(row.dRaptor),
      winsAdded: finiteNum(row.winsAdded),
      war1: finiteNum(row.r1WinEquivalents),
      drbl100: drbl ? finiteNum(row.drbl100) : null,
      drblO: drbl ? finiteNum(row.drblO) : null,
      drblD: drbl ? finiteNum(row.drblD) : null,
    });
  });
}

export function pickCareerCompareSeason(
  seasons: string[],
  season: string,
  requested?: string
) {
  if (requested && requested !== season && seasons.includes(requested)) {
    return requested;
  }
  return seasons.find((option) => option !== season) ?? season;
}

/** Drop empty / zero-only seasons the career board should not list. */
export function filterCareerBoardSource(career: PlayerSeason[]): PlayerSeason[] {
  return career.filter((row) => {
    if (row.gamesPlayed > 0) return true;
    return Boolean(
      row.per ||
        row.vorp ||
        row.winShares ||
        row.points ||
        row.offensiveRating
    );
  });
}

import { careerProductionIndex, dedupeCareerSeasons } from "@/analytics/career-resume";
import {
  PlayerCareerBoard,
  type CareerBoardRow,
} from "@/components/players/player-career-board";
import { getPlayerPlayoffCareerSeasons } from "@/data/queries";
import { enrichPlayerCareerAdvancedCached } from "@/data/queries/request-cache";
import { hasValidDrblEstimate } from "@/data/queries/percentiles";
import type { PlayerSeason } from "@/data/types";
import { type PlayerSeasonKind } from "@/lib/player-destination";
import {
  darkoDefense,
  darkoOffense,
  darkoTotal,
  finiteNum,
  publishedAdvanced,
} from "@/lib/player-stat-sheet-registry";
import type { ThemeMode } from "@/themes/era-theme";

function perGame(total: number, games: number) {
  return games > 0 ? total / games : 0;
}

function rate(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
}

function toBoardRows(career: PlayerSeason[]): CareerBoardRow[] {
  return dedupeCareerSeasons(career).map((row) => {
    const gp = row.gamesPlayed;
    const apg = perGame(row.assists, gp);
    const tpg = perGame(row.turnovers, gp);
    const drbl = hasValidDrblEstimate(row);
    return {
      season: row.season,
      teamId: row.teamId,
      teamAbbr: row.teamAbbreviation ?? "",
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
      // Career totals zero-fill BRef/Advanced until overlay — never show fake 0.0
      per: publishedAdvanced(row.per),
      bpm: publishedAdvanced(row.bpm),
      vorp: publishedAdvanced(row.vorp),
      ws: publishedAdvanced(row.winShares),
      cpi: careerProductionIndex(row),
      darko: darkoTotal(row),
      darkoOff: darkoOffense(row),
      darkoDef: darkoDefense(row),
      lebron: finiteNum(row.lebron),
      oLebron: finiteNum(row.oLebron),
      dLebron: finiteNum(row.dLebron),
      winsAdded: finiteNum(row.winsAdded),
      war1: finiteNum(row.r1WinEquivalents),
      drbl100: drbl ? finiteNum(row.drbl100) : null,
      drblO: drbl ? finiteNum(row.drblO) : null,
      drblD: drbl ? finiteNum(row.drblD) : null,
    };
  });
}

function pickCompare(seasons: string[], season: string, requested?: string) {
  if (requested && requested !== season && seasons.includes(requested)) {
    return requested;
  }
  return seasons.find((option) => option !== season) ?? season;
}

export async function PlayerCareerIsland({
  playerId,
  season,
  seasonType,
  career,
  compareSeason,
  teamKey,
  fromHistory = false,
  themeMode = "historical",
}: {
  playerId: string;
  season: string;
  seasonType: PlayerSeasonKind;
  career: PlayerSeason[];
  compareSeason?: string;
  teamKey?: string | null;
  fromHistory?: boolean;
  themeMode?: ThemeMode;
}) {
  const source =
    seasonType === "playoffs"
      ? await getPlayerPlayoffCareerSeasons(playerId)
      : await enrichPlayerCareerAdvancedCached(playerId, career).catch(
          () => career
        );
  const rows = toBoardRows(source);
  const seasons = rows.map((row) => row.season);
  const compare = pickCompare(seasons, season, compareSeason);

  return (
    <PlayerCareerBoard
      playerId={playerId}
      season={season}
      seasonType={seasonType}
      rows={rows}
      compareSeason={compare}
      teamKey={teamKey}
      fromHistory={fromHistory}
      themeMode={themeMode}
    />
  );
}

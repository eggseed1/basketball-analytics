import { careerProductionIndex, dedupeCareerSeasons } from "@/analytics/career-resume";
import {
  PlayerCareerBoard,
  type CareerBoardRow,
} from "@/components/players/player-career-board";
import { getPlayerPlayoffCareerSeasons } from "@/data/queries";
import { hasValidDrblEstimate } from "@/data/queries/percentiles";
import type { PlayerSeason } from "@/data/types";
import { type PlayerSeasonKind } from "@/lib/player-destination";
import type { ThemeMode } from "@/themes/era-theme";

function perGame(total: number, games: number) {
  return games > 0 ? total / games : 0;
}

function finite(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) ? n : null;
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
      orpg: finite(perGame(row.offensiveRebounds, gp)),
      drpg: finite(perGame(row.defensiveRebounds, gp)),
      spg: finite(perGame(row.steals, gp)),
      bpg: finite(perGame(row.blocks, gp)),
      tov: finite(tpg),
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
      ortg: finite(row.offensiveRating),
      drtg: finite(row.defensiveRating),
      net: finite(row.netRating),
      per: finite(row.per),
      bpm: finite(row.bpm),
      vorp: finite(row.vorp),
      ws: finite(row.winShares),
      cpi: careerProductionIndex(row),
      war1: finite(row.r1WinEquivalents),
      drbl100: drbl ? finite(row.drbl100) : null,
      drblO: drbl ? finite(row.drblO) : null,
      drblD: drbl ? finite(row.drblD) : null,
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
      : career;
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

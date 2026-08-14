/**
 * Game Lab query — assemble box score + same-season team/player boards once.
 */

import { analyzeGame, type GameAnalysisSummary } from "@/analytics/game-lab";
import { getGameBoxScore } from "@/data/queries/games";
import { getFilteredPlayerSeasons } from "@/data/queries/players";
import { getTeam } from "@/data/queries/teams";
import { getTeamSeasonStats } from "@/data/queries/team-seasons";
import type { Game, PlayerGame, PlayerSeason } from "@/data/types";
import type { TeamSeasonStats } from "@/data/types/team-season";
import { resolveTeamBrand } from "@/lib/nba-brand";

export type { GameAnalysisSummary };

export type GameAnalysisPayload = {
  analysis: GameAnalysisSummary;
  game: Game;
  players: PlayerGame[];
};

function matchTeamSeason(
  rows: TeamSeasonStats[],
  teamId: string,
  abbr?: string | null
): TeamSeasonStats | null {
  const brand = resolveTeamBrand(teamId) ?? resolveTeamBrand(abbr);
  return (
    rows.find(
      (r) =>
        r.teamId === teamId ||
        (brand &&
          (r.abbreviation.toLowerCase() === brand.abbr.toLowerCase() ||
            r.teamId === brand.id ||
            r.teamId === brand.espnTeamId))
    ) ??
    rows.find(
      (r) => abbr && r.abbreviation.toLowerCase() === abbr.toLowerCase()
    ) ??
    null
  );
}

/**
 * Build Game Lab analysis for one game.
 * Returns null when the box score itself is missing.
 */
export async function getGameAnalysis(
  gameId: string
): Promise<GameAnalysisPayload | null> {
  const box = await getGameBoxScore(gameId);
  if (!box) return null;

  const { game, players } = box;

  const [homeTeam, awayTeam, seasonBoard, teamBoard] = await Promise.all([
    getTeam(game.homeTeamId).catch(() => null),
    getTeam(game.awayTeamId).catch(() => null),
    getFilteredPlayerSeasons({
      season: game.season,
      minimumGames: 5,
    }).catch(() => [] as PlayerSeason[]),
    getTeamSeasonStats(game.season).catch(() => [] as TeamSeasonStats[]),
  ]);

  const seasonByPlayerId = new Map<string, PlayerSeason>();
  for (const row of seasonBoard) {
    if (row.season !== game.season) continue;
    const existing = seasonByPlayerId.get(row.playerId);
    if (!existing || row.gamesPlayed > existing.gamesPlayed) {
      seasonByPlayerId.set(row.playerId, row);
    }
  }

  const homeLabel =
    game.homeTeamAbbr ?? homeTeam?.abbreviation ?? game.homeTeamId;
  const awayLabel =
    game.awayTeamAbbr ?? awayTeam?.abbreviation ?? game.awayTeamId;
  const homeName =
    game.homeTeamName ?? homeTeam?.fullName ?? homeLabel;
  const awayName =
    game.awayTeamName ?? awayTeam?.fullName ?? awayLabel;

  const analysis = analyzeGame({
    game,
    players,
    homeLabel,
    awayLabel,
    homeName,
    awayName,
    homeSeason: matchTeamSeason(teamBoard, game.homeTeamId, game.homeTeamAbbr),
    awaySeason: matchTeamSeason(teamBoard, game.awayTeamId, game.awayTeamAbbr),
    seasonByPlayerId,
  });

  return { analysis, game, players };
}

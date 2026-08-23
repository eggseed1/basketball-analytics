import { fetchLeagueSchedule } from "@/data/providers/nba/schedule-client";
import { getHistoricalGames } from "@/data/queries/historical";
import { getLeagueStandings } from "@/data/queries/standings";
import { getTeamSeasonStats } from "@/data/queries/team-seasons";
import type { Game } from "@/data/types/game";
import type { LeagueStandings } from "@/data/types/standings";
import type { TeamSeasonStats } from "@/data/types/team-season";
import { buildPlayoffBracket, type PlayoffBracketModel } from "@/lib/playoff-bracket";

async function loadPlayoffGames(season: string): Promise<Game[]> {
  const historical = await getHistoricalGames({ season }).catch(() => [] as Game[]);
  const fromHistory = historical.filter(
    (g) => g.gameType === "playoff" || g.gameType === "play-in"
  );
  if (fromHistory.length) return fromHistory;

  try {
    const schedule = await fetchLeagueSchedule(season);
    return schedule
      .map((row) => row.game)
      .filter((g) => g.gameType === "playoff" || g.gameType === "play-in");
  } catch {
    return [];
  }
}

export async function getPlayoffBracketModel(season: string): Promise<{
  model: PlayoffBracketModel;
  standings: LeagueStandings | null;
  teams: TeamSeasonStats[];
}> {
  const [standings, teams, games] = await Promise.all([
    getLeagueStandings(season).catch(() => null),
    getTeamSeasonStats(season).catch(() => [] as TeamSeasonStats[]),
    loadPlayoffGames(season),
  ]);

  const model = buildPlayoffBracket({
    season,
    standings,
    teams,
    games,
  });

  return { model, standings, teams };
}

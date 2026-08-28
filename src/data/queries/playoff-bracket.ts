import { fetchLeagueSchedule } from "@/data/providers/nba/schedule-client";
import { getHistoricalGames } from "@/data/queries/historical";
import { getLeagueStandings } from "@/data/queries/standings";
import { getTeamSeasonStats } from "@/data/queries/team-seasons";
import type { Game } from "@/data/types/game";
import type { LeagueStandings } from "@/data/types/standings";
import type { TeamSeasonStats } from "@/data/types/team-season";
import { buildPlayoffBracket, type PlayoffBracketModel } from "@/lib/playoff-bracket";
import { isPreseasonRosterSeason } from "@/data/providers/nba/espn-roster-client";
import { withBudget } from "@/data/queries/budget";

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
  // Preseason: skip standings/schedule upstream (often blocked on CF) — teams board only.
  if (isPreseasonRosterSeason(season)) {
    const teams = await getTeamSeasonStats(season).catch(() => [] as TeamSeasonStats[]);
    const model = buildPlayoffBracket({
      season,
      standings: null,
      teams,
      games: [],
    });
    return { model, standings: null, teams };
  }

  const [standingsRes, teams, gamesRes] = await Promise.all([
    withBudget(getLeagueStandings(season).catch(() => null), 3_000, null),
    getTeamSeasonStats(season).catch(() => [] as TeamSeasonStats[]),
    withBudget(loadPlayoffGames(season), 3_000, [] as Game[]),
  ]);

  const standings = standingsRes.value;
  const games = gamesRes.value;

  const model = buildPlayoffBracket({
    season,
    standings,
    teams,
    games,
  });

  return { model, standings, teams };
}

import { PlayerUpcomingGames } from "@/components/players/player-upcoming-games";
import { getCurrentFrontOfficeSeason } from "@/data/front-office/load-team-front-office";
import { getUpcomingGameSummaries } from "@/data/queries";
import { teamSeasonStub } from "@/lib/team-season-stub";
import { resolveTeamBrand } from "@/lib/nba-brand";

/** Current-season upcoming tip-offs for the player's team. */
export async function PlayerUpcomingGamesIsland({
  playerId,
  scheduleTeamKey: scheduleTeamKeyProp,
}: {
  playerId: string;
  scheduleTeamKey?: string | null;
}) {
  const { resolvePlayerCurrentSeasonTeamKey } = await import(
    "@/data/queries/player-current-team"
  );
  const scheduleTeamKey =
    (await resolvePlayerCurrentSeasonTeamKey(playerId)) ?? scheduleTeamKeyProp;
  if (!scheduleTeamKey) return null;

  const season = getCurrentFrontOfficeSeason();
  const team = teamSeasonStub(scheduleTeamKey, season);
  if (!team) return null;

  const brand = resolveTeamBrand(scheduleTeamKey);
  const upcomingBundle = await getUpcomingGameSummaries({
    season,
    limit: 40,
  }).catch(() => ({ games: [] as const }));

  return (
    <PlayerUpcomingGames
      season={season}
      team={team}
      brand={brand}
      games={[...upcomingBundle.games]}
      className="pt-1"
    />
  );
}

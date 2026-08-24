import { PlayerUpcomingGames } from "@/components/players/player-upcoming-games";
import { getCurrentFrontOfficeSeason } from "@/data/front-office/load-team-front-office";
import {
  getPlayerCareerSeasonsCached,
  getUpcomingGameSummaries,
} from "@/data/queries";
import { teamSeasonStub } from "@/lib/team-season-stub";
import { brandableTeamKey } from "@/lib/player-team-context";
import { resolveTeamBrand } from "@/lib/nba-brand";

/** Current-season upcoming tip-offs for the player's team. */
export async function PlayerUpcomingGamesIsland({
  playerId,
  scheduleTeamKey: scheduleTeamKeyProp,
}: {
  playerId: string;
  scheduleTeamKey?: string | null;
}) {
  // The parent already derived a team from player/career context. Use that
  // immediately instead of making an optional roster lookup a prerequisite.
  let scheduleTeamKey = brandableTeamKey(scheduleTeamKeyProp) ?? null;

  if (!scheduleTeamKey) {
    const { resolvePlayerCurrentSeasonTeamKey } = await import(
      "@/data/queries/player-current-team"
    );
    scheduleTeamKey = await resolvePlayerCurrentSeasonTeamKey(playerId).catch(
      () => null
    );
  }

  // During the offseason a current-season roster shell may not exist yet.
  // Fall back to the most recent factual career franchise rather than rendering
  // a permanently blank schedule card. This is only used when no current-team
  // source resolved above.
  if (!scheduleTeamKey) {
    const career = await getPlayerCareerSeasonsCached(playerId).catch(() => []);
    const latest = [...career]
      .sort((a, b) => b.season.localeCompare(a.season))
      .find((row) => brandableTeamKey(row.teamId));
    scheduleTeamKey = brandableTeamKey(latest?.teamId) ?? null;
  }

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

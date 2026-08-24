import { PlayerUpcomingGames } from "@/components/players/player-upcoming-games";
import {
  getPlayerCareerSeasonsCached,
} from "@/data/queries";
import { upcomingScheduleSeason } from "@/data/providers/nba/scoreboard-client";
import { getRuntimeSnapshotGames } from "@/data/runtime/game-snapshot";
import { toGameSummary } from "@/data/queries/filter-utils";
import type { GameSummary } from "@/data/types";
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
  let scheduleTeamKey = brandableTeamKey(scheduleTeamKeyProp) ?? null;

  if (!scheduleTeamKey) {
    const career = await getPlayerCareerSeasonsCached(playerId).catch(() => []);
    const latest = [...career]
      .sort((a, b) => b.season.localeCompare(a.season))
      .find((row) => brandableTeamKey(row.teamId));
    scheduleTeamKey = brandableTeamKey(latest?.teamId) ?? null;
  }

  if (!scheduleTeamKey) {
    const { resolvePlayerCurrentSeasonTeamKey } = await import(
      "@/data/queries/player-current-team"
    );
    scheduleTeamKey = await resolvePlayerCurrentSeasonTeamKey(playerId).catch(
      () => null
    );
  }

  if (!scheduleTeamKey) return null;

  const season = upcomingScheduleSeason();
  const team = teamSeasonStub(scheduleTeamKey, season);
  if (!team) return null;

  const brand = resolveTeamBrand(scheduleTeamKey);
  const today = new Date().toISOString().slice(0, 10);

  // Production schedules are generated during the Vercel build while upstream
  // access is healthy and bundled with the server output. Request-time Vercel
  // egress is therefore not required to render this card.
  const games: GameSummary[] = getRuntimeSnapshotGames(season)
    .filter(
      (game) =>
        game.gameDate >= today &&
        (game.status === "scheduled" ||
          game.status === "pregame" ||
          game.status === "delayed" ||
          game.status === "in_progress")
    )
    .sort((a, b) =>
      (a.tipOffAt ?? a.gameDate).localeCompare(b.tipOffAt ?? b.gameDate)
    )
    .map(toGameSummary);

  return (
    <PlayerUpcomingGames
      season={season}
      team={team}
      brand={brand}
      games={games}
      className="pt-1"
    />
  );
}

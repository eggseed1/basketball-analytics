import { PlayerUpcomingGames } from "@/components/players/player-upcoming-games";
import { getPlayerCareerSeasonsCached } from "@/data/queries";
import { upcomingScheduleSeason } from "@/data/providers/nba/scoreboard-client";
import { toGameSummary } from "@/data/queries/filter-utils";
import type { GameSummary } from "@/data/types";
import { teamSeasonStub } from "@/lib/team-season-stub";
import { brandableTeamKey } from "@/lib/player-team-context";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { gameInvolvesTeam } from "@/lib/team-explorer";

async function upcomingGamesForTeam(
  scheduleTeamKey: string,
  season = upcomingScheduleSeason()
): Promise<GameSummary[]> {
  // Dynamic import keeps the ~6.7MB game-snapshot JSON off the player-page
  // module graph until this Suspense island runs (CF 1102 mitigation).
  const { getRuntimeSnapshotGames } = await import(
    "@/data/runtime/game-snapshot"
  );
  const today = new Date().toISOString().slice(0, 10);
  const team = teamSeasonStub(scheduleTeamKey, season);
  const brand = resolveTeamBrand(scheduleTeamKey);
  if (!team) return [];
  return getRuntimeSnapshotGames(season)
    .filter(
      (game) =>
        game.gameDate >= today &&
        (game.status === "scheduled" ||
          game.status === "pregame" ||
          game.status === "delayed" ||
          game.status === "in_progress")
    )
    .map(toGameSummary)
    .filter((game) => gameInvolvesTeam(game, team, brand))
    .sort((a, b) =>
      (a.tipOffAt ?? a.gameDate).localeCompare(b.tipOffAt ?? b.gameDate)
    );
}

/** Snapshot-only schedule card — deferred import; safe behind Suspense on CF. */
export async function PlayerUpcomingGamesFromSnapshot({
  scheduleTeamKey,
  season = upcomingScheduleSeason(),
  className,
}: {
  scheduleTeamKey: string;
  season?: string;
  className?: string;
}) {
  const team = teamSeasonStub(scheduleTeamKey, season);
  if (!team) return null;

  const brand = resolveTeamBrand(scheduleTeamKey);
  const games = await upcomingGamesForTeam(scheduleTeamKey, season);
  return (
    <PlayerUpcomingGames
      season={season}
      team={team}
      brand={brand}
      games={games}
      className={className}
    />
  );
}

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

  return (
    <PlayerUpcomingGamesFromSnapshot
      scheduleTeamKey={scheduleTeamKey}
      className="pt-1"
    />
  );
}

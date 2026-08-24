import { PlayerUpcomingGames } from "@/components/players/player-upcoming-games";
import { getCurrentFrontOfficeSeason } from "@/data/front-office/load-team-front-office";
import { espnFetchJson } from "@/data/providers/nba/espn-client";
import { espnYearFromCanonicalSeason } from "@/data/providers/nba/season";
import {
  transformEspnScheduleEvent,
  type EspnScheduleEvent,
} from "@/data/transformers/espn";
import {
  getPlayerCareerSeasonsCached,
  getUpcomingGameSummaries,
} from "@/data/queries";
import { toGameSummary } from "@/data/queries/filter-utils";
import type { GameSummary } from "@/data/types";
import { teamSeasonStub } from "@/lib/team-season-stub";
import { brandableTeamKey } from "@/lib/player-team-context";
import { resolveTeamBrand } from "@/lib/nba-brand";

async function fetchTeamScheduleFallback(
  teamId: string,
  season: string
): Promise<GameSummary[]> {
  const endYear = espnYearFromCanonicalSeason(season);
  const payload = await espnFetchJson<{ events?: EspnScheduleEvent[] }>(
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${encodeURIComponent(teamId)}/schedule?season=${endYear}`,
    { ttlMs: 1000 * 60 * 30, retries: 1 }
  );
  const today = new Date().toISOString().slice(0, 10);
  return (payload.events ?? [])
    .map((event) => transformEspnScheduleEvent(event, season))
    .filter((game): game is NonNullable<typeof game> => Boolean(game))
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
    const { resolvePlayerCurrentSeasonTeamKey } = await import(
      "@/data/queries/player-current-team"
    );
    scheduleTeamKey = await resolvePlayerCurrentSeasonTeamKey(playerId).catch(
      () => null
    );
  }

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
  }).catch(() => ({ games: [] as GameSummary[] }));

  let games = [...upcomingBundle.games];
  if (games.length === 0) {
    games = await fetchTeamScheduleFallback(scheduleTeamKey, season).catch(
      () => []
    );
  }

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

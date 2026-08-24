import { PlayerUpcomingGames } from "@/components/players/player-upcoming-games";
import { getCurrentFrontOfficeSeason } from "@/data/front-office/load-team-front-office";
import { espnFetchJson } from "@/data/providers/nba/espn-client";
import { runtimeTimeoutMs } from "@/data/providers/nba/runtime-policy";
import { espnYearFromCanonicalSeason } from "@/data/providers/nba/season";
import {
  transformEspnScheduleEvent,
  type EspnScheduleEvent,
} from "@/data/transformers/espn";
import {
  getPlayerCareerSeasonsCached,
  getUpcomingGameSummaries,
} from "@/data/queries";
import { withBudget } from "@/data/queries/budget";
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

  // The critical career rows are request-cached and usually already loaded by
  // the page. Prefer that deterministic team context over another roster call.
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

  const season = getCurrentFrontOfficeSeason();
  const team = teamSeasonStub(scheduleTeamKey, season);
  if (!team) return null;

  const brand = resolveTeamBrand(scheduleTeamKey);

  // Player cards need one team's next games, not a league-wide month crawl.
  // One ESPN team-schedule request is the primary path; a two-month league
  // scoreboard is only a bounded fallback.
  const targeted = await withBudget(
    fetchTeamScheduleFallback(scheduleTeamKey, season).catch(() => []),
    runtimeTimeoutMs(5_000, 3_000),
    [] as GameSummary[]
  );
  let games = targeted.value;

  if (games.length === 0) {
    const fallback = await withBudget(
      getUpcomingGameSummaries({
        season,
        limit: 12,
        monthCount: 2,
      })
        .then((bundle) => bundle.games)
        .catch(() => []),
      runtimeTimeoutMs(5_000, 3_000),
      [] as GameSummary[]
    );
    games = fallback.value;
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

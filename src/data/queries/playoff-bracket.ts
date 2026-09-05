import { fetchLeagueSchedule } from "@/data/providers/nba/schedule-client";
import { getHistoricalGames } from "@/data/queries/historical";
import { getLeagueStandings } from "@/data/queries/standings";
import { getTeamSeasonStats } from "@/data/queries/team-seasons";
import type { Game } from "@/data/types/game";
import type { LeagueStandings } from "@/data/types/standings";
import type { TeamSeasonStats } from "@/data/types/team-season";
import {
  buildPlayoffBracket,
  type PlayoffBracketModel,
} from "@/lib/playoff-bracket";
import { computeStandingsFromGameArchive } from "@/lib/standings-from-games";
import { isPreseasonRosterSeason } from "@/data/providers/nba/espn-roster-client";
import { withBudget } from "@/data/queries/budget";
import { standingsHaveResults } from "@/data/providers/nba/standings-client";
import { preferBundledProductDataOnEdge } from "@/data/providers/nba/runtime-policy";

function withPlayoffSeeds(standings: LeagueStandings): LeagueStandings {
  return {
    ...standings,
    conferences: standings.conferences.map((conference) => ({
      ...conference,
      rows: conference.rows.map((row, index) => ({
        ...row,
        playoffSeed:
          row.playoffSeed && row.playoffSeed > 0
            ? row.playoffSeed
            : row.rank || index + 1,
      })),
    })),
  };
}

/** Prefer bundled snapshot (CF-safe), then history disk, then live schedule. */
async function loadPlayoffGames(season: string): Promise<Game[]> {
  try {
    const { getRuntimeSnapshotPlayoffGames } = await import(
      "@/data/runtime/game-snapshot"
    );
    const fromSnap = getRuntimeSnapshotPlayoffGames(season);
    if (fromSnap.length) return fromSnap;
  } catch {
    /* optional on non-bundled runtimes */
  }

  // Cloudflare: never fall through to disk/history/live ESPN (multi-second hangs).
  if (preferBundledProductDataOnEdge()) return [];

  const historical = await getHistoricalGames({ season }).catch(
    () => [] as Game[]
  );
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

async function loadBracketStandings(
  season: string
): Promise<LeagueStandings | null> {
  // Prefer bake / archive first so Workers never stall on live ESPN.
  try {
    const { getRuntimeStandings } = await import(
      "@/data/runtime/standings-snapshot"
    );
    const bundled = getRuntimeStandings(season);
    if (bundled && standingsHaveResults(bundled)) {
      return withPlayoffSeeds(bundled);
    }
  } catch {
    /* optional */
  }

  try {
    const { getRuntimeSnapshotGames } = await import(
      "@/data/runtime/game-snapshot"
    );
    const seasonGames = getRuntimeSnapshotGames(season);
    const fromArchive = computeStandingsFromGameArchive(season, seasonGames);
    if (fromArchive && standingsHaveResults(fromArchive)) {
      return withPlayoffSeeds(fromArchive);
    }
  } catch {
    /* optional */
  }

  if (preferBundledProductDataOnEdge()) return null;

  const liveRes = await withBudget(
    getLeagueStandings(season).catch(() => null),
    3_000,
    null as LeagueStandings | null
  );
  const live = liveRes.value;
  return live ? withPlayoffSeeds(live) : null;
}

export async function getPlayoffBracketModel(season: string): Promise<{
  model: PlayoffBracketModel;
  standings: LeagueStandings | null;
  teams: TeamSeasonStats[];
}> {
  const edge = preferBundledProductDataOnEdge();

  // Preseason upcoming year: still show completed prior playoffs when baked.
  if (isPreseasonRosterSeason(season)) {
    const games = await loadPlayoffGames(season);
    if (games.length) {
      const [standings, teams] = await Promise.all([
        loadBracketStandings(season),
        getTeamSeasonStats(season).catch(() => [] as TeamSeasonStats[]),
      ]);
      const model = buildPlayoffBracket({
        season,
        standings,
        teams,
        games,
      });
      return { model, standings, teams };
    }

    const teams = await getTeamSeasonStats(season).catch(
      () => [] as TeamSeasonStats[]
    );
    const model = buildPlayoffBracket({
      season,
      standings: null,
      teams,
      games: [],
    });
    return { model, standings: null, teams };
  }

  const [teams, games, standings] = await Promise.all([
    getTeamSeasonStats(season).catch(() => [] as TeamSeasonStats[]),
    edge
      ? loadPlayoffGames(season)
      : withBudget(loadPlayoffGames(season), 4_000, [] as Game[]).then(
          (r) => r.value
        ),
    loadBracketStandings(season),
  ]);

  const model = buildPlayoffBracket({
    season,
    standings,
    teams,
    games,
  });

  return { model, standings, teams };
}

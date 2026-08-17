/**
 * Query wrapper for Rank Team Seasons.
 * Loads each season board once via getTeamSeasonArc; ranks with rankTeamSeasons.
 */

import {
  TEAM_SEASON_RANK_MAX,
  TEAM_SEASON_RANK_MIN,
  defaultTeamRankSeasons,
  rankTeamSeasons,
  type TeamSeasonRanking,
} from "@/analytics/rank-team-seasons";
import { getTeamSeasonArc } from "@/data/queries/team-arc";
import { getTeamExploreSeasons } from "@/data/queries/team-seasons";
import { parseSeasonListParam } from "@/data/queries/player-season-rank";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { resolveTeamBrand } from "@/lib/nba-brand";

export { parseSeasonListParam };

export async function getTeamSeasonRanking(options: {
  teamId: string;
  seasons?: string[];
}): Promise<{
  ranking: TeamSeasonRanking | null;
  availableSeasons: string[];
  error: string | null;
}> {
  const brand = resolveTeamBrand(options.teamId);
  const espnId = brand?.espnTeamId ?? options.teamId;
  const abbreviation = brand?.abbr;
  const nowSeason = canonicalSeasonFromStartYear(currentNbaStartYear());

  const explore = await getTeamExploreSeasons().catch(() => [] as string[]);
  const candidatePool =
    explore.length > 0 ? explore.filter((s) => s >= "2001-02") : [];

  const bootstrapSeasons =
    candidatePool.length > 0
      ? [...candidatePool].sort((a, b) => b.localeCompare(a)).slice(0, 12)
      : [
          nowSeason,
          ...Array.from({ length: 11 }, (_, i) =>
            canonicalSeasonFromStartYear(currentNbaStartYear() - 1 - i)
          ),
        ];

  const bootstrap = await getTeamSeasonArc({
    teamId: espnId,
    abbreviation,
    seasons: bootstrapSeasons,
  });

  const availableSeasons = bootstrap.rows
    .map((r) => r.season)
    .sort((a, b) => b.localeCompare(a));

  const displayName =
    bootstrap.rows[0]?.fullName ??
    (abbreviation ? abbreviation.toUpperCase() : options.teamId);

  let selected = options.seasons?.length
    ? options.seasons
    : defaultTeamRankSeasons(bootstrap.rows, { nowSeason });

  if (selected.length < TEAM_SEASON_RANK_MIN) {
    return {
      ranking: null,
      availableSeasons,
      error: `Need at least ${TEAM_SEASON_RANK_MIN} seasons with team-board rows to rank.`,
    };
  }
  if (selected.length > TEAM_SEASON_RANK_MAX) {
    selected = selected.slice(0, TEAM_SEASON_RANK_MAX);
  }

  const needFetch = selected.filter(
    (s) => !bootstrap.rows.some((r) => r.season === s)
  );
  const fresh =
    needFetch.length > 0
      ? await getTeamSeasonArc({
          teamId: espnId,
          abbreviation,
          seasons: needFetch,
        })
      : {
          rows: [] as typeof bootstrap.rows,
          missingSeasons: [] as string[],
          failedSeasons: [] as string[],
        };

  const bySeason = new Map(
    [...bootstrap.rows, ...fresh.rows].map((r) => [r.season, r])
  );

  const rows = [];
  for (const season of selected) {
    const row = bySeason.get(season);
    if (!row) {
      return {
        ranking: null,
        availableSeasons,
        error: `No team-board row for ${displayName} in ${season}.`,
      };
    }
    rows.push(row);
  }

  const ranking = rankTeamSeasons({
    teamId: espnId,
    abbreviation: rows[0]?.abbreviation ?? abbreviation ?? espnId,
    fullName: rows[0]?.fullName ?? displayName,
    seasons: rows,
    nowSeason,
  });

  return {
    ranking: ranking.error ? null : ranking,
    availableSeasons,
    error: ranking.error,
  };
}

/**
 * Query: team season evidence from lightweight game summaries.
 * Does NOT call getGameAnalysis / getGameBoxScore during selection.
 *
 * Identity: canonical team for matching; historical schedule filter may still
 * use provider ids at the boundary. After transform normalization, game rows
 * carry canonical homeTeamId/awayTeamId plus provider ids for traceability.
 */

import {
  buildTeamSeasonEvidence,
  type TeamSeasonEvidence,
  SEASON_EVIDENCE_METHODOLOGY,
  SEASON_EVIDENCE_CATEGORIES,
  SEASON_EVIDENCE_UNSUPPORTED,
} from "@/analytics/season-evidence";
import { getFilteredGames } from "@/data/queries/games";
import {
  HISTORICAL_SCHEDULE_TEAM_PROVIDER,
  getProviderTeamId,
  resolveCanonicalTeam,
} from "@/data/identity/team-map";
import { teamMatchIds } from "@/lib/team-identity";

export async function getTeamSeasonEvidence(options: {
  teamId: string;
  season: string;
  abbreviation?: string;
  fullName?: string;
}): Promise<TeamSeasonEvidence> {
  const resolved = resolveCanonicalTeam(options.teamId);
  if (resolved.status !== "resolved") {
    const abbreviation =
      options.abbreviation ?? options.teamId ?? "—";
    return {
      subject: {
        kind: "team",
        teamId: options.teamId,
        abbreviation,
        fullName: options.fullName ?? abbreviation,
        matchTeamIds: [],
        matchAbbrs: options.abbreviation
          ? [options.abbreviation.toUpperCase()]
          : [],
      },
      season: options.season,
      findings: [],
      games: [],
      methodology: SEASON_EVIDENCE_METHODOLOGY,
      coverage: {
        gameCount: 0,
        categories: SEASON_EVIDENCE_CATEGORIES.map((c) => ({
          id: c.id,
          label: c.label,
          available: false,
          note: "Provider identity unavailable",
        })),
        unsupported: [...SEASON_EVIDENCE_UNSUPPORTED],
      },
      error: `PROVIDER IDENTITY UNAVAILABLE: ${resolved.reason}`,
    };
  }

  const team = resolved.team;
  const abbreviation =
    options.abbreviation?.toUpperCase() ?? team.abbr;
  const fullName = options.fullName ?? team.displayName;

  const scheduleProvider = HISTORICAL_SCHEDULE_TEAM_PROVIDER;
  const scheduleTeamId = getProviderTeamId(
    scheduleProvider,
    team.canonicalTeamId
  );

  // Match both canonical and provider ids so pre- and post-normalization rows work.
  const matchTeamIds = teamMatchIds(team);
  const matchAbbrs = Array.from(
    new Set([abbreviation, team.abbr].map((a) => a.toUpperCase()))
  );

  let games = await getFilteredGames({
    season: options.season,
    team: team.canonicalTeamId,
    teamAbbr: abbreviation,
  }).catch(() => []);

  // Legacy path: provider-scoped id filter when abbr filter returned nothing.
  if (games.length === 0 && scheduleTeamId) {
    games = await getFilteredGames({
      season: options.season,
      team: scheduleTeamId,
    }).catch(() => []);
  }

  if (games.length === 0) {
    games = await getFilteredGames({ season: options.season }).catch(() => []);
  }

  return buildTeamSeasonEvidence({
    subject: {
      teamId: team.canonicalTeamId,
      abbreviation,
      fullName,
      matchTeamIds,
      matchAbbrs,
    },
    season: options.season,
    games,
  });
}

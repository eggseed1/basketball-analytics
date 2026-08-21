/**
 * Query: team season evidence from lightweight game summaries.
 * Does NOT call getGameAnalysis / getGameBoxScore during selection.
 *
 * Prefers the local season game archive shared with the Games island.
 * Does not rediscover schedules via BallDontLie when the archive is present
 * or when a pre-modern season has no local cache.
 */

import {
  buildTeamSeasonEvidence,
  type TeamSeasonEvidence,
  SEASON_EVIDENCE_METHODOLOGY,
  SEASON_EVIDENCE_CATEGORIES,
  SEASON_EVIDENCE_UNSUPPORTED,
} from "@/analytics/season-evidence";
import { getTeamSeasonGamesCached } from "@/data/queries/request-cache";
import {
  resolveCanonicalTeam,
} from "@/data/identity/team-map";
import { teamMatchIds } from "@/lib/team-identity";

function emptyEvidence(options: {
  teamId: string;
  season: string;
  abbreviation: string;
  fullName: string;
  matchTeamIds?: string[];
  matchAbbrs?: string[];
  error: string;
}): TeamSeasonEvidence {
  return {
    subject: {
      kind: "team",
      teamId: options.teamId,
      abbreviation: options.abbreviation,
      fullName: options.fullName,
      matchTeamIds: options.matchTeamIds ?? [],
      matchAbbrs: options.matchAbbrs ?? [options.abbreviation.toUpperCase()],
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
        note: options.error,
      })),
      unsupported: [...SEASON_EVIDENCE_UNSUPPORTED],
    },
    error: options.error,
  };
}

/** @deprecated Budget retained for tests; archive path is sync/disk-bound. */
export const TEAM_SEASON_EVIDENCE_BUDGET_MS = 8_000;

export async function getTeamSeasonEvidence(options: {
  teamId: string;
  season: string;
  abbreviation?: string;
  fullName?: string;
  /** Override budget (tests) - unused when archive path returns immediately. */
  budgetMs?: number;
}): Promise<TeamSeasonEvidence> {
  const resolved = resolveCanonicalTeam(options.teamId);
  if (resolved.status !== "resolved") {
    return emptyEvidence({
      teamId: options.teamId,
      season: options.season,
      abbreviation: options.abbreviation ?? options.teamId ?? "-",
      fullName: options.fullName ?? options.abbreviation ?? options.teamId,
      error: `PROVIDER IDENTITY UNAVAILABLE: ${resolved.reason}`,
    });
  }

  const team = resolved.team;
  const abbreviation =
    options.abbreviation?.toUpperCase() ?? team.abbr;
  const fullName = options.fullName ?? team.displayName;
  const matchTeamIds = teamMatchIds(team);
  const matchAbbrs = Array.from(
    new Set([abbreviation, team.abbr].map((a) => a.toUpperCase()))
  );

  const loaded = await getTeamSeasonGamesCached(
    team.canonicalTeamId,
    options.season,
    abbreviation
  );

  if (loaded.games.length === 0) {
    return emptyEvidence({
      teamId: team.canonicalTeamId,
      season: options.season,
      abbreviation,
      fullName,
      matchTeamIds,
      matchAbbrs,
      error:
        loaded.source === "unavailable"
          ? `Historical evidence unavailable for ${options.season}.`
          : loaded.warning ??
            "Season evidence unavailable for this team-season (no schedule sample).",
    });
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
    games: loaded.games,
  });
}

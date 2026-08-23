import { resolveCanonicalTeam } from "@/data/identity/team-map";
import { ESPN_TEAM_META } from "@/data/providers/nba/team-meta";
import type { TeamSeasonStats } from "@/data/types";

/** Minimal team row for schedule filtering when season stats are not on the board yet. */
export function teamSeasonStub(
  teamId: string,
  season: string
): TeamSeasonStats | null {
  const resolved = resolveCanonicalTeam(teamId);
  if (resolved.status !== "resolved") return null;
  const meta = ESPN_TEAM_META[resolved.team.canonicalTeamId];
  return {
    season,
    teamId: resolved.team.canonicalTeamId,
    abbreviation: resolved.team.abbr,
    fullName: resolved.team.displayName,
    conference: meta?.conference ?? "East",
    gamesPlayed: 0,
    ppg: 0,
    oppPpg: 0,
    avgDiff: 0,
    rpg: 0,
    apg: 0,
    spg: 0,
    bpg: 0,
    topg: 0,
    fieldGoalPct: 0,
    threePointPct: 0,
    freeThrowPct: 0,
    assistToTurnover: 0,
    offensiveReboundPct: 0,
    points: 0,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    threePointersMade: 0,
    threePointersAttempted: 0,
    freeThrowsMade: 0,
    freeThrowsAttempted: 0,
    assists: 0,
    turnovers: 0,
  };
}

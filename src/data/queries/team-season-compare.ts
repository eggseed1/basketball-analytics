/**
 * Load two team-season board rows and run compareTeamSeasons.
 */

import { compareTeamSeasons } from "@/analytics/compare-team-seasons";
import type { TeamSeasonComparison } from "@/analytics/compare-team-seasons";
import { getTeamSeasonStats } from "@/data/queries/team-seasons";
import type { TeamSeasonStats } from "@/data/types/team-season";
import { parseSeasonParam } from "@/data/providers/historical/season-range";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { resolveTeamFromBoard } from "@/lib/team-explorer";

function matchTeam(
  board: TeamSeasonStats[],
  key: string
): TeamSeasonStats | null {
  const brand = resolveTeamBrand(key);
  const candidates = [
    key,
    brand?.espnTeamId,
    brand?.id,
    brand?.abbr,
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    const hit = resolveTeamFromBoard(board, c);
    if (hit) return hit;
  }
  return null;
}

export async function getTeamSeasonComparison(options: {
  teamA: string;
  teamB: string;
  seasonA: string;
  seasonB: string;
}): Promise<{
  comparison: TeamSeasonComparison | null;
  error: string | null;
}> {
  let seasonA: string;
  let seasonB: string;
  try {
    seasonA = parseSeasonParam(options.seasonA)!;
    seasonB = parseSeasonParam(options.seasonB)!;
  } catch {
    return {
      comparison: null,
      error: "Invalid season. Use YYYY-YY (e.g. 2024-25).",
    };
  }

  const sameSeason = seasonA === seasonB;
  const [boardA, boardB] = await Promise.all([
    getTeamSeasonStats(seasonA).catch(() => [] as TeamSeasonStats[]),
    sameSeason
      ? Promise.resolve(null)
      : getTeamSeasonStats(seasonB).catch(() => [] as TeamSeasonStats[]),
  ]);

  const leagueA = boardA;
  const leagueB = boardB ?? boardA;

  if (!leagueA.length) {
    return {
      comparison: null,
      error: `No team board for ${seasonA}.`,
    };
  }
  if (!leagueB.length) {
    return {
      comparison: null,
      error: `No team board for ${seasonB}.`,
    };
  }

  const rowA = matchTeam(leagueA, options.teamA);
  const rowB = matchTeam(leagueB, options.teamB);
  if (!rowA || !rowB) {
    return {
      comparison: null,
      error: !rowA
        ? `Could not resolve team A (${options.teamA}) in ${seasonA}.`
        : `Could not resolve team B (${options.teamB}) in ${seasonB}.`,
    };
  }

  // Ensure season stamps match requested seasons (board row carries season).
  const a = { ...rowA, season: seasonA };
  const b = { ...rowB, season: seasonB };

  return {
    comparison: compareTeamSeasons({ teamA: a, teamB: b }),
    error: null,
  };
}

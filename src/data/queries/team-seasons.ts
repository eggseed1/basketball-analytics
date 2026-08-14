import { fetchTeamSeasonStats } from "@/data/providers/nba/team-season-client";
import type { TeamSeasonStats } from "@/data/types/team-season";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { getAvailableSeasons } from "@/data/queries/players";

export async function getTeamSeasonStats(
  season?: string
): Promise<TeamSeasonStats[]> {
  const resolved =
    season ?? canonicalSeasonFromStartYear(currentNbaStartYear());
  const rows = await fetchTeamSeasonStats(resolved);
  return [...rows].sort((a, b) => b.avgDiff - a.avgDiff);
}

export async function getTeamExploreSeasons(): Promise<string[]> {
  return getAvailableSeasons();
}

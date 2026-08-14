import { fetchLeagueStandings } from "@/data/providers/nba/standings-client";
import type { LeagueStandings } from "@/data/types/standings";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";

export async function getLeagueStandings(
  season?: string
): Promise<LeagueStandings> {
  const resolved =
    season ?? canonicalSeasonFromStartYear(currentNbaStartYear());
  return fetchLeagueStandings(resolved);
}

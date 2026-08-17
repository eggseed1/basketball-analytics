import { getDataProvider } from "@/data/providers";
import type { BasketballFilters, Team, TeamSeason } from "@/data/types";

export async function getTeams(): Promise<Team[]> {
  return getDataProvider().getTeams();
}

export async function getTeam(teamId: string): Promise<Team | null> {
  return getDataProvider().getTeam(teamId);
}

export async function getTeamSeasons(season?: string): Promise<TeamSeason[]> {
  const provider = getDataProvider();
  if (typeof provider.getTeamSeasons === "function") {
    return provider.getTeamSeasons(season);
  }
  return [];
}

export async function getTeamSeason(
  teamId: string,
  season: string
): Promise<TeamSeason | null> {
  const provider = getDataProvider();
  if (typeof provider.getTeamSeason === "function") {
    return provider.getTeamSeason(teamId, season);
  }
  const rows = await getTeamSeasons(season);
  return rows.find((r) => r.teamId === teamId) ?? null;
}

export async function getFilteredTeamSeasons(
  filters: Pick<BasketballFilters, "season" | "team"> & {
    conference?: "East" | "West" | "ALL";
  } = {}
): Promise<TeamSeason[]> {
  const rows = await getTeamSeasons(filters.season);
  return rows.filter((row) => {
    if (filters.season && row.season !== filters.season) return false;
    if (filters.team && row.teamId !== filters.team) return false;
    if (
      filters.conference &&
      filters.conference !== "ALL" &&
      row.conference !== filters.conference
    ) {
      return false;
    }
    return true;
  });
}

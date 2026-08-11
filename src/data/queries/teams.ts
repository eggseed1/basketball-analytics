import { getDataProvider } from "@/data/providers";
import type { Team } from "@/data/types";

export async function getTeams(): Promise<Team[]> {
  return getDataProvider().getTeams();
}

export async function getTeam(teamId: string): Promise<Team | null> {
  return getDataProvider().getTeam(teamId);
}

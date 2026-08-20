import { getDataProvider } from "@/data/providers";
import type { Team } from "@/data/types";
import {
  getTeamsCatalog,
  type TeamsCatalogResult,
} from "./teams-catalog";

export type { TeamCatalogSource, TeamsCatalogResult } from "./teams-catalog";
export {
  getTeamsCatalog,
  teamsFromCanonicalIdentity,
  resolveTeamFilterAgainstCatalog,
} from "./teams-catalog";

/**
 * Soft-fail team list for Explore filters and related UI.
 * Prefer getTeamsCatalog() when source/warnings are needed.
 */
export async function getTeams(): Promise<Team[]> {
  return (await getTeamsCatalog()).teams;
}

export async function getTeam(teamId: string): Promise<Team | null> {
  const catalog = await getTeamsCatalog();
  const hit = catalog.teams.find((t) => t.id === teamId);
  if (hit) return hit;
  // Preserve prior provider lookup semantics for non-catalog ids when live works;
  // when catalog is fallback, provider may still throw - catch.
  try {
    return await getDataProvider().getTeam(teamId);
  } catch {
    return null;
  }
}

/** Explicit catalog helper for pages that show fallback diagnostics. */
export async function getTeamsWithSource(): Promise<TeamsCatalogResult> {
  return getTeamsCatalog();
}

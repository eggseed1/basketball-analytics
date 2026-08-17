/**
 * Team destination identity when season board is missing.
 * Never fabricates PPG/diff — identity only from canonical + era maps.
 */

import { ESPN_TEAM_META } from "@/data/providers/nba/team-meta";
import {
  resolveCanonicalTeam,
  type CanonicalTeam,
} from "@/data/identity/team-map";
import { resolveTeamEra } from "@/data/identity/team-era";
import {
  resolveHistoricalTeamBrand,
  type HistoricalBrandPresentation,
  type HistoricalTeamBrand,
} from "@/lib/historical-team-brand";

export type TeamIdentityFallback = {
  teamId: string;
  abbreviation: string;
  fullName: string;
  conference: "East" | "West";
  historicalBrand: HistoricalTeamBrand | null;
  canonical: CanonicalTeam;
};

/**
 * Resolve franchise identity without a season board row.
 * Used for historical Time Machine destinations when ESPN by-team fails.
 */
export function resolveTeamIdentityFallback(
  teamKey: string,
  season: string,
  presentation: HistoricalBrandPresentation = "era"
): TeamIdentityFallback | null {
  const resolved = resolveCanonicalTeam(teamKey);
  if (resolved.status !== "resolved") return null;
  const canonical = resolved.team;
  const era = resolveTeamEra(canonical.canonicalTeamId, season);
  const historicalBrand = resolveHistoricalTeamBrand(
    canonical.canonicalTeamId,
    season,
    presentation
  );
  const meta = ESPN_TEAM_META[canonical.canonicalTeamId];
  return {
    teamId: canonical.canonicalTeamId,
    abbreviation:
      historicalBrand?.abbreviation ??
      era?.abbr ??
      canonical.abbr,
    fullName:
      historicalBrand?.displayName ??
      era?.displayName ??
      canonical.displayName,
    conference: meta?.conference ?? "West",
    historicalBrand,
    canonical,
  };
}

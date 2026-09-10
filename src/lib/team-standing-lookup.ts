/**
 * Client-safe standings lookup for team hover previews.
 */
import { defaultCanonicalSeasons } from "@/data/providers/nba/season";
import {
  getRuntimeStandings,
  runtimeStandingsMeta,
} from "@/data/runtime/standings-snapshot";
import type { StandingRow } from "@/data/types";
import { getCanonicalTeamOrUndefined } from "@/lib/team-identity";
import { resolveTeamBrand } from "@/lib/nba-brand";

export type TeamStandingPreview = {
  season: string;
  row: StandingRow;
};

function seasonCandidates(preferred?: string | null): string[] {
  const preferredKey = preferred?.trim() || "";
  const known = runtimeStandingsMeta().seasons;
  const defaults = defaultCanonicalSeasons(3);
  const ordered = [
    preferredKey,
    ...defaults,
    ...[...known].sort((a, b) => b.localeCompare(a)),
  ].filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const season of ordered) {
    if (seen.has(season)) continue;
    seen.add(season);
    out.push(season);
  }
  return out;
}

function matchesTeam(row: StandingRow, teamKey: string): boolean {
  const key = teamKey.trim().toLowerCase();
  if (!key) return false;
  const canonical = getCanonicalTeamOrUndefined(teamKey);
  const brand = resolveTeamBrand(teamKey);
  const tokens = new Set(
    [
      key,
      row.teamId,
      row.abbreviation,
      row.displayName,
      canonical?.canonicalTeamId,
      canonical?.abbr,
      canonical?.displayName,
      brand?.abbr,
      brand?.espnTeamId,
      brand?.id,
    ]
      .filter(Boolean)
      .map((v) => String(v).trim().toLowerCase())
  );
  return (
    tokens.has(row.teamId.toLowerCase()) ||
    tokens.has(row.abbreviation.toLowerCase()) ||
    tokens.has(row.displayName.toLowerCase())
  );
}

/** Latest available standings row for a team key (abbr / id / name). */
export function lookupTeamStanding(
  teamKey: string,
  season?: string | null
): TeamStandingPreview | null {
  for (const candidate of seasonCandidates(season)) {
    const league = getRuntimeStandings(candidate);
    if (!league) continue;
    for (const conference of league.conferences) {
      const row = conference.rows.find((entry) => matchesTeam(entry, teamKey));
      if (row) return { season: league.season, row };
    }
  }
  return null;
}

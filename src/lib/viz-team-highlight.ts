/**
 * Shared team highlight for Explore visualizations (`?team=BOS` or `?team=BOS,NYK`).
 */

import { listCanonicalTeams } from "@/data/identity/team-map";
import { resolveTeamBrand } from "@/lib/nba-brand";

export type VizTeamOption = {
  /** Canonical URL value (uppercase abbr). */
  value: string;
  label: string;
  brandId: string;
};

/** Soft cap so URLs stay short and charts stay readable. */
export const VIZ_TEAM_HIGHLIGHT_MAX = 6;

/** Static 30-team dropdown options, sorted by display name. */
export const VIZ_TEAM_OPTIONS: VizTeamOption[] = listCanonicalTeams()
  .map((team) => ({
    value: team.abbr.toUpperCase(),
    label: `${team.displayName} (${team.abbr})`,
    brandId: team.brandId,
  }))
  .sort((a, b) => a.label.localeCompare(b.label));

export function parseVizTeamKey(
  raw: string | null | undefined
): string | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  const brand = resolveTeamBrand(trimmed);
  if (!brand) return null;
  return brand.abbr.toUpperCase();
}

/** Parse one or more teams from `team=BOS` / `team=BOS,NYK`. */
export function parseVizTeamKeys(
  raw: string | null | undefined
): string[] {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  const parts = text.split(/[,+|/\s]+/).map((part) => part.trim()).filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const key = parseVizTeamKey(part);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= VIZ_TEAM_HIGHLIGHT_MAX) break;
  }
  return out;
}

export function vizTeamParam(keys: readonly string[]): string | null {
  const cleaned = parseVizTeamKeys(keys.join(","));
  return cleaned.length ? cleaned.join(",") : null;
}

/** Match tokens for a selected viz team (abbr, brand id, ESPN id). */
export function vizTeamMatchTokens(
  teamKey: string | null | undefined
): Set<string> {
  const brand = resolveTeamBrand(teamKey);
  if (!brand) return new Set();
  return new Set(
    [brand.id, brand.abbr, brand.espnTeamId, brand.logoSlug]
      .map((token) => String(token).trim().toUpperCase())
      .filter(Boolean)
  );
}

export function playerMatchesVizTeam(
  player: {
    teamId?: string | null;
    teamAbbr?: string | null;
    teamAbbreviation?: string | null;
  },
  teamKey: string | null | undefined
): boolean {
  const tokens = vizTeamMatchTokens(teamKey);
  if (!tokens.size) return false;
  const candidates = [
    player.teamId,
    player.teamAbbr,
    player.teamAbbreviation,
  ]
    .map((value) => String(value ?? "").trim().toUpperCase())
    .filter(Boolean);
  for (const candidate of candidates) {
    if (tokens.has(candidate)) return true;
    const resolved = resolveTeamBrand(candidate);
    if (
      resolved &&
      (tokens.has(resolved.abbr.toUpperCase()) ||
        tokens.has(resolved.id.toUpperCase()) ||
        tokens.has(resolved.espnTeamId))
    ) {
      return true;
    }
  }
  return false;
}

export function playerMatchesAnyVizTeam(
  player: {
    teamId?: string | null;
    teamAbbr?: string | null;
    teamAbbreviation?: string | null;
  },
  teamKeys: readonly string[]
): boolean {
  if (!teamKeys.length) return false;
  return teamKeys.some((key) => playerMatchesVizTeam(player, key));
}

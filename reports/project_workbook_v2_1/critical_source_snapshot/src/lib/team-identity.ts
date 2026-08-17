/**
 * Client-safe team identity helpers for URL params, links, and filters.
 * Sync / in-memory only — never import data queries or Node modules.
 *
 * Policy:
 * - Canonical team id = ESPN team id string (see `@/data/identity/team-map`)
 * - Public `?team=` / `/teams/[teamId]` accept canonical id, abbr, brand slug,
 *   or namespaced `espn:` / `bdl:` / `nba:` keys — all normalize at the boundary
 * - Provider-specific ids belong at provider/query boundaries only
 */

import {
  getCanonicalTeamById,
  resolveCanonicalTeam,
  type CanonicalTeam,
  type CanonicalTeamId,
} from "@/data/identity/team-map";

export type NormalizedTeamParam = {
  canonicalTeamId: CanonicalTeamId;
  abbr: string;
  displayName: string;
  /** ESPN + BDL + NBA Stats (and any future) provider ids for schedule matching. */
  matchIds: string[];
  team: CanonicalTeam;
};

/** Expand a canonical team into every known provider id (deduped). */
export function teamMatchIds(team: CanonicalTeam): string[] {
  const ids = new Set<string>();
  ids.add(team.canonicalTeamId);
  if (team.providerIds.espn) ids.add(team.providerIds.espn);
  if (team.providerIds.bdl) ids.add(team.providerIds.bdl);
  if (team.providerIds.nba) ids.add(team.providerIds.nba);
  return [...ids];
}

/**
 * IDs that appear on PlayerSeason.teamId:
 * ESPN canonical numeric id, plus local-sample brand slug / abbr.
 * Never includes BallDontLie ids — those collide with ESPN (BDL OKC 21 = ESPN PHX).
 */
export function playerSeasonTeamMatchIds(team: CanonicalTeam): string[] {
  const ids = new Set<string>();
  ids.add(team.canonicalTeamId);
  if (team.providerIds.espn) ids.add(team.providerIds.espn);
  ids.add(team.brandId);
  ids.add(team.abbr.toLowerCase());
  return [...ids];
}

/**
 * Normalize loose URL / UI team input to canonical identity.
 * Returns null for empty / ALL / unresolved.
 */
export function normalizeTeamParam(
  raw?: string | null
): NormalizedTeamParam | null {
  if (!raw?.trim() || raw.trim().toUpperCase() === "ALL") return null;
  const resolved = resolveCanonicalTeam(raw);
  if (resolved.status !== "resolved") return null;
  const team = resolved.team;
  return {
    canonicalTeamId: team.canonicalTeamId,
    abbr: team.abbr,
    displayName: team.displayName,
    matchIds: teamMatchIds(team),
    team,
  };
}

/** Match ids for any loose input (falls back to raw token when unresolved). */
export function expandTeamFilterMatchIds(raw?: string | null): string[] {
  const normalized = normalizeTeamParam(raw);
  if (normalized) return normalized.matchIds;
  const token = raw?.trim();
  return token ? [token] : [];
}

/** Player-season board filters: ESPN/local ids only, never BDL (numeric collision). */
export function expandPlayerSeasonTeamMatchIds(raw?: string | null): string[] {
  const normalized = normalizeTeamParam(raw);
  if (normalized) return playerSeasonTeamMatchIds(normalized.team);
  const token = raw?.trim();
  return token ? [token] : [];
}

/** `/teams/{canonicalTeamId}` — never brand slug as the public id. */
export function teamProfileHref(
  teamKey: string,
  season?: string | null
): string {
  const normalized = normalizeTeamParam(teamKey);
  const id = normalized?.canonicalTeamId ?? teamKey.trim();
  const base = `/teams/${encodeURIComponent(id)}`;
  if (!season?.trim()) return base;
  return `${base}?season=${encodeURIComponent(season.trim())}`;
}

/** Leaderboard deep link — always writes canonical ESPN id into `?team=`. */
export function playersExploreTeamHref(teamKey: string): string {
  const normalized = normalizeTeamParam(teamKey);
  const id = normalized?.canonicalTeamId ?? teamKey.trim();
  return `/explore/players?team=${encodeURIComponent(id)}`;
}

/** Games explore deep link — canonical id + abbr handled by filtersFromSearchParams. */
export function gamesExploreTeamHref(
  teamKey: string,
  season?: string | null
): string {
  const normalized = normalizeTeamParam(teamKey);
  const id = normalized?.canonicalTeamId ?? teamKey.trim();
  const params = new URLSearchParams({ team: id });
  if (season?.trim()) params.set("season", season.trim());
  return `/explore/games?${params.toString()}`;
}

/** Offseason filter link — canonical ESPN id (archive is ESPN-scoped). */
export function offseasonTeamHref(teamKey: string): string {
  const normalized = normalizeTeamParam(teamKey);
  const id = normalized?.canonicalTeamId ?? teamKey.trim();
  return `/offseason?team=${encodeURIComponent(id)}`;
}

export function getCanonicalTeamOrUndefined(
  teamKey?: string | null
): CanonicalTeam | undefined {
  if (!teamKey?.trim()) return undefined;
  const byId = getCanonicalTeamById(teamKey);
  if (byId) return byId;
  const resolved = resolveCanonicalTeam(teamKey);
  return resolved.status === "resolved" ? resolved.team : undefined;
}

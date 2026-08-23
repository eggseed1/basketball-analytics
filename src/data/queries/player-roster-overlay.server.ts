import "server-only";

import { cache } from "react";

import { resolvePlayerIdentityCached } from "@/data/identity/player-identity-cache";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import {
  fetchEspnLeagueRosterPlayers,
  fetchEspnTeamRosterPlayers,
  isPreseasonRosterSeason,
} from "@/data/providers/nba/espn-roster-client";
import { leagueRosterDiscoveryEnabled } from "@/data/providers/nba/runtime-policy";
import { normalizePlayerName } from "@/data/providers/salaries/salary-store";
import type { PlayerSeason } from "@/data/types";
import { brandableTeamKey } from "@/lib/player-team-context";

const leagueRosterCache = cache(async (season: string): Promise<PlayerSeason[]> => {
  return fetchEspnLeagueRosterPlayers(season).catch(() => []);
});

const teamRosterCache = cache(
  async (espnTeamId: string, season: string): Promise<PlayerSeason[]> => {
    return fetchEspnTeamRosterPlayers(espnTeamId, season).catch(() => []);
  }
);

function playerIdSet(
  playerId: string,
  identity: Awaited<ReturnType<typeof resolvePlayerIdentityCached>> | null
): Set<string> {
  const ids = new Set<string>([playerId]);
  if (identity?.nbaId) ids.add(identity.nbaId);
  if (identity?.espnId) ids.add(identity.espnId);
  return ids;
}

function findInRoster(
  roster: PlayerSeason[],
  ids: Set<string>,
  nameKeys: Set<string>
): PlayerSeason | null {
  const byId = roster.find((row) => ids.has(row.playerId));
  if (byId) return byId;
  if (nameKeys.size === 0) return null;
  return (
    roster.find((row) => nameKeys.has(normalizePlayerName(row.playerName))) ??
    null
  );
}

/** ESPN roster row for a player in the given season (identity-aware). */
export async function resolveRosterSeasonRow(
  playerId: string,
  season: string,
  options?: { preferTeamId?: string | null }
): Promise<PlayerSeason | null> {
  if (!isPreseasonRosterSeason(season)) return null;
  const identity = await resolvePlayerIdentityCached(playerId).catch(() => null);
  const ids = playerIdSet(playerId, identity);
  const nameKeys = new Set<string>();
  if (identity?.displayName) {
    nameKeys.add(normalizePlayerName(identity.displayName));
  }

  const preferTeam = brandableTeamKey(options?.preferTeamId);
  if (preferTeam) {
    const teamRoster = await teamRosterCache(preferTeam, season);
    const hit = findInRoster(teamRoster, ids, nameKeys);
    if (hit) return hit;
  }

  // A miss on the player's previous team used to trigger 30 parallel roster
  // requests before the player page could render. On Vercel, fail open with the
  // existing career/profile identity instead; a durable roster cache can opt in.
  if (!leagueRosterDiscoveryEnabled()) return null;

  const roster = await leagueRosterCache(season);
  return findInRoster(roster, ids, nameKeys);
}

function mergeRosterTeamOntoRow(
  row: PlayerSeason,
  rosterRow: PlayerSeason
): PlayerSeason {
  return {
    ...row,
    teamId: rosterRow.teamId,
    teamName: rosterRow.teamName,
    teamAbbreviation: rosterRow.teamAbbreviation,
    teamIdProvider: rosterRow.teamIdProvider ?? "espn",
    providerTeamId: rosterRow.providerTeamId ?? rosterRow.teamId,
    playerName: rosterRow.playerName || row.playerName,
    position: rosterRow.position ?? row.position,
    age: rosterRow.age ?? row.age,
  };
}

/**
 * During preseason, ESPN roster is source of truth for franchise identity when
 * the season hasn't started (GP = 0 or row missing).
 */
export async function overlayPreseasonRosterOnCareer(
  playerId: string,
  seasons: PlayerSeason[]
): Promise<PlayerSeason[]> {
  const season = canonicalSeasonFromStartYear(currentNbaStartYear());
  if (!isPreseasonRosterSeason(season)) return seasons;

  const existingIdx = seasons.findIndex((row) => row.season === season);
  const existing = existingIdx >= 0 ? seasons[existingIdx]! : null;

  // Already have live counting stats — leave franchise as-is.
  if (existing && existing.gamesPlayed > 0) return seasons;
  // Brandable current-season team already present — skip league crawl.
  if (existing && brandableTeamKey(existing.teamId)) return seasons;

  const preferTeamId =
    brandableTeamKey(existing?.teamId) ??
    brandableTeamKey(
      [...seasons].sort((a, b) => b.season.localeCompare(a.season))[0]?.teamId
    );

  const rosterRow = await resolveRosterSeasonRow(playerId, season, {
    preferTeamId,
  });
  if (!rosterRow) return seasons;

  const row = existing
    ? mergeRosterTeamOntoRow(existing, rosterRow)
    : rosterRow;

  if (existingIdx >= 0) {
    const next = [...seasons];
    next[existingIdx] = row;
    return next.sort((a, b) => b.season.localeCompare(a.season));
  }
  return [row, ...seasons].sort((a, b) => b.season.localeCompare(a.season));
}

export async function overlayPreseasonRosterOnSeasonRow(
  playerId: string,
  season: string,
  row: PlayerSeason | null
): Promise<PlayerSeason | null> {
  if (!isPreseasonRosterSeason(season)) return row;
  const rosterRow = await resolveRosterSeasonRow(playerId, season);
  if (!rosterRow) return row;
  if (row && row.gamesPlayed > 0) return row;
  return row ? mergeRosterTeamOntoRow(row, rosterRow) : rosterRow;
}

export async function resolvePlayerCurrentSeasonTeamKey(
  playerId: string
): Promise<string | null> {
  const season = canonicalSeasonFromStartYear(currentNbaStartYear());
  const row = await resolveRosterSeasonRow(playerId, season);
  return brandableTeamKey(row?.teamId) ?? null;
}

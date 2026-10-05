import "server-only";

import { cache } from "react";

import { resolvePlayerIdentityCached } from "@/data/identity/player-identity-cache";
import {
  bundledContractTeamIds,
  bundledTeamContracts,
  type BrefContractRow,
  type BrefTeamContracts,
} from "@/data/runtime/bref-team-contracts";
import { getBundledPlayerIdAliasIndex } from "@/data/runtime/player-id-aliases-snapshot";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { normalizePlayerName } from "@/lib/player-name";

export type PlayerContractYearView = {
  season: string;
  /** Integer USD; a season with no salary is omitted, never 0. */
  salary: number;
  option: "player" | "team" | null;
  notGuaranteed: boolean;
};

export type PlayerContractSnapshot = {
  franchiseId: string;
  brefId: string;
  teamAbbr: string;
  capSeason: string;
  years: PlayerContractYearView[];
  guaranteed: number | null;
  note: string | null;
};

function toSnapshot(
  teamId: string,
  team: BrefTeamContracts,
  row: BrefContractRow
): PlayerContractSnapshot | null {
  const years: PlayerContractYearView[] = [];
  row.years.forEach((cell, i) => {
    const season = team.seasons[i];
    if (!cell || !season || !Number.isFinite(cell.amount)) return;
    years.push({
      season,
      salary: cell.amount,
      option: cell.option ?? null,
      notGuaranteed: cell.notGuaranteed === true,
    });
  });
  if (!years.length) return null;
  return {
    franchiseId: teamId,
    brefId: row.brefId,
    teamAbbr: resolveTeamBrand(teamId)?.abbr ?? team.code,
    capSeason: team.capSeason ?? team.seasons[0] ?? years[0].season,
    years,
    guaranteed: row.guaranteed,
    note: team.notes[row.brefId] ?? null,
  };
}

/**
 * Current multi-year contract for a player from the baked team payrolls.
 *
 * Rows are keyed by BRef id. Match on the id crosswalk across every team so a
 * traded player still finds his deal; fall back to a name match when exactly
 * one player on any payroll has that name.
 */
export const getPlayerContractSnapshot = cache(
  async (
    playerId: string,
    teamKey?: string | null,
    playerName?: string | null
  ): Promise<PlayerContractSnapshot | null> => {
    const routeId = String(playerId ?? "").trim();
    if (!routeId) return null;

    const identity = await resolvePlayerIdentityCached(routeId).catch(() => null);
    const candidateIds = new Set(
      [routeId, identity?.nbaId, identity?.espnId]
        .map((v) => String(v ?? "").trim())
        .filter(Boolean)
    );
    const aliases = getBundledPlayerIdAliasIndex();
    const matchesId = (row: BrefContractRow) => {
      const alias = aliases.byBref?.get(row.brefId.toLowerCase());
      return Boolean(
        alias && (candidateIds.has(alias.espnPlayerId) || candidateIds.has(alias.nbaPlayerId))
      );
    };

    const homeTeamId = resolveTeamBrand(teamKey)?.espnTeamId ?? null;
    const teamIds = bundledContractTeamIds();
    const ordered = homeTeamId
      ? [homeTeamId, ...teamIds.filter((id) => id !== homeTeamId)]
      : teamIds;
    for (const teamId of ordered) {
      const team = bundledTeamContracts(teamId);
      const row = team?.rows.find(matchesId);
      if (team && row) return toSnapshot(teamId, team, row);
    }

    const name = normalizePlayerName(playerName ?? identity?.displayName ?? "");
    if (!name) return null;
    const named = ordered.flatMap((teamId) => {
      const team = bundledTeamContracts(teamId);
      return (team?.rows ?? [])
        .filter((row) => normalizePlayerName(row.name) === name)
        .map((row) => ({ teamId, team: team!, row }));
    });
    // Only when one player in the league has the name; he may appear on two
    // payrolls after a waiver, and the home team (listed first) wins.
    if (!named.length || new Set(named.map((hit) => hit.row.brefId)).size !== 1) return null;
    return toSnapshot(named[0].teamId, named[0].team, named[0].row);
  }
);

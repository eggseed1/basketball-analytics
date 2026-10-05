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
 * traded player still finds his deal; fall back to a name match only inside
 * the team the page already places him on, where a namesake is unlikely.
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
    if (!homeTeamId || !name) return null;
    const home = bundledTeamContracts(homeTeamId);
    const named = home?.rows.filter((row) => normalizePlayerName(row.name) === name) ?? [];
    return home && named.length === 1 ? toSnapshot(homeTeamId, home, named[0]) : null;
  }
);

import "server-only";

import { cache } from "react";

import { resolvePlayerIdentityCached } from "@/data/identity/player-identity-cache";
import {
  loadTeamFrontOfficeSlice,
  resolveFrontOfficeFranchiseId,
  resolveTeamFrontOfficeSlice,
} from "@/data/front-office/load-team-front-office";
import type { TeamContractRow } from "@/data/types/front-office";

export type PlayerContractSnapshot = {
  row: TeamContractRow;
  franchiseId: string;
  teamAbbr: string;
  teamDisplayName: string;
  snapshotSeason: string;
};

function uniqueIds(...values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    ),
  ];
}

/**
 * Player salary snapshot for the selected/current franchise. Public routes use
 * ESPN athlete ids while financial artifacts use NBA PERSON_ID, so both are
 * resolved before lookup. The exact same lookup/refresh semantics run locally
 * and in production.
 */
export const getPlayerContractSnapshot = cache(
  async (
    playerId: string,
    teamKey?: string | null
  ): Promise<PlayerContractSnapshot | null> => {
    const routeId = String(playerId ?? "").trim();
    if (!routeId) return null;

    const identity = await resolvePlayerIdentityCached(routeId).catch(() => null);
    const candidateIds = new Set(
      uniqueIds(routeId, identity?.nbaId, identity?.espnId)
    );

    const fromSlice = (
      slice: ReturnType<typeof loadTeamFrontOfficeSlice>
    ): PlayerContractSnapshot | null => {
      if (!slice) return null;
      const row = slice.team.payroll.contractRows.find((contract) =>
        candidateIds.has(String(contract.playerId).trim())
      );
      if (!row) return null;
      return {
        row: {
          ...row,
          href: `/players/${encodeURIComponent(routeId)}`,
        },
        franchiseId: slice.team.franchiseId,
        teamAbbr: slice.team.abbr,
        teamDisplayName: slice.team.displayName,
        snapshotSeason: slice.meta.season,
      };
    };

    const franchiseId = teamKey
      ? resolveFrontOfficeFranchiseId(teamKey)
      : null;
    if (!franchiseId) return null;

    const cached = fromSlice(loadTeamFrontOfficeSlice(franchiseId));
    if (cached) return cached;

    const live = await resolveTeamFrontOfficeSlice(franchiseId).catch(() => null);
    return fromSlice(live);
  }
);

import "server-only";

import { cache } from "react";

import { resolvePlayerIdentityCached } from "@/data/identity/player-identity-cache";
import { isVercelRuntime } from "@/data/providers/nba/runtime-policy";
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

function livePlayerFrontOfficeEnabled(): boolean {
  return (
    !isVercelRuntime() ||
    process.env.ALLOW_LIVE_FRONT_OFFICE_ON_VERCEL === "1"
  );
}

/**
 * Player salary snapshot for the selected/current franchise.
 *
 * Contract artifacts are keyed by NBA PERSON_ID, while public player routes are
 * commonly ESPN athlete ids. Resolve both namespaces before looking up a row.
 * Never discover a missing team by requesting every NBA roster: without a
 * verified team context the salary card simply stays unavailable.
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
        // Keep the validated financial row, but preserve the public route id in
        // any player-page link emitted by the card.
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

    // The committed, validated snapshot is deterministic and already contains
    // the NBA-id row for ESPN-id routes such as 4278073 -> 1628983.
    const cached = fromSlice(loadTeamFrontOfficeSlice(franchiseId));
    if (cached) return cached;

    // Live roster synthesis is useful locally, but an optional salary card must
    // never put Vercel player renders behind an ESPN request. Operators may opt
    // back in after providing durable upstream egress/cache coverage.
    if (!livePlayerFrontOfficeEnabled()) return null;

    const live = await resolveTeamFrontOfficeSlice(franchiseId).catch(() => null);
    return fromSlice(live);
  }
);
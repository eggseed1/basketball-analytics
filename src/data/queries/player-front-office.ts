import "server-only";

import { cache } from "react";

import {
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

/** Current salary snapshot from live roster or validated front-office slice. */
export const getPlayerContractSnapshot = cache(
  async (
    playerId: string,
    teamKey?: string | null
  ): Promise<PlayerContractSnapshot | null> => {
    const id = String(playerId ?? "").trim();
    if (!id) return null;

    const fromSlice = async (
      franchiseId: string
    ): Promise<PlayerContractSnapshot | null> => {
      const slice = await resolveTeamFrontOfficeSlice(franchiseId);
      if (!slice) return null;
      const row = slice.team.payroll.contractRows.find((r) => r.playerId === id);
      if (!row) return null;
      return {
        row,
        franchiseId: slice.team.franchiseId,
        teamAbbr: slice.team.abbr,
        teamDisplayName: slice.team.displayName,
        snapshotSeason: slice.meta.season,
      };
    };

    if (teamKey) {
      const fid = resolveFrontOfficeFranchiseId(teamKey);
      if (fid) {
        const hit = await fromSlice(fid);
        if (hit) return hit;
      }
    }

    const { listCanonicalTeams } = await import("@/data/identity/team-map");
    for (const team of listCanonicalTeams()) {
      const hit = await fromSlice(team.canonicalTeamId);
      if (hit) return hit;
    }
    return null;
  }
);

import "server-only";

import { cache } from "react";

import { resolvePlayerIdentityCached } from "@/data/identity/player-identity-cache";
import {
  buildPlayerMovementBundle,
  buildTeamMovementFeed,
  getMovementFeed,
  getMovementCluster,
} from "@/movement-center/load-curated";

async function playerIdSet(playerId: string): Promise<Set<string>> {
  const identity = await resolvePlayerIdentityCached(playerId);
  const ids = new Set<string>([playerId]);
  if (identity.nbaId) ids.add(identity.nbaId);
  if (identity.espnId) ids.add(identity.espnId);
  return ids;
}

export const getPlayerMovementBundle = cache(
  async (playerId: string) => {
    const ids = await playerIdSet(playerId);
    return buildPlayerMovementBundle(ids);
  }
);

export const getTeamMovementFeed = cache(
  async (teamId: string, options?: { activeOnly?: boolean }) =>
    buildTeamMovementFeed(teamId, options)
);

export {
  getMovementFeed,
  getMovementCluster,
};

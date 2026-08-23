/**
 * Player accolades for identity UI — resolves NBA id then loads awards.
 */

import { cache } from "react";

import { resolvePlayerIdentityCached } from "@/data/identity/player-identity-cache";
import {
  fetchPlayerAwardsRaw,
  summarizePlayerAccolades,
  type PlayerAccoladeBadge,
} from "@/data/providers/nba/player-awards";

export type { PlayerAccoladeBadge };

export const getPlayerAccolades = cache(async function getPlayerAccolades(
  playerId: string
): Promise<PlayerAccoladeBadge[]> {
  const identity = await resolvePlayerIdentityCached(playerId);
  const nbaId =
    identity.nbaId ??
    (/^\d+$/.test(playerId.trim()) ? playerId.trim() : null);
  if (!nbaId) return [];

  try {
    const rows = await fetchPlayerAwardsRaw(nbaId);
    return summarizePlayerAccolades(rows);
  } catch {
    return [];
  }
});

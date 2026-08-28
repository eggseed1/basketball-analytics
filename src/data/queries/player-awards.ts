/**
 * Player accolades for identity UI — resolves NBA id then loads awards.
 * On Cloudflare, prefer the baked BRef snapshot (live stats.nba is blocked).
 */

import { cache } from "react";

import { resolvePlayerIdentityCached } from "@/data/identity/player-identity-cache";
import { preferBundledProductDataOnEdge } from "@/data/providers/nba/runtime-policy";
import {
  fetchPlayerAwardsRaw,
  summarizePlayerAccolades,
  type PlayerAccoladeBadge,
} from "@/data/providers/nba/player-awards";
import {
  getBundledPlayerAwardsRaw,
  hasBundledPlayerAwards,
} from "@/data/runtime/player-awards-snapshot";

export type { PlayerAccoladeBadge };

export const getPlayerAccolades = cache(async function getPlayerAccolades(
  playerId: string
): Promise<PlayerAccoladeBadge[]> {
  const identity = await resolvePlayerIdentityCached(playerId);
  const nbaId =
    identity.nbaId ??
    (/^\d+$/.test(playerId.trim()) ? playerId.trim() : null);
  if (!nbaId) return [];

  if (preferBundledProductDataOnEdge() && hasBundledPlayerAwards(nbaId)) {
    return summarizePlayerAccolades(getBundledPlayerAwardsRaw(nbaId));
  }

  try {
    const rows = await fetchPlayerAwardsRaw(nbaId);
    if (rows.length > 0) return summarizePlayerAccolades(rows);
  } catch {
    /* fall through to bundle */
  }

  if (hasBundledPlayerAwards(nbaId)) {
    return summarizePlayerAccolades(getBundledPlayerAwardsRaw(nbaId));
  }
  return [];
});

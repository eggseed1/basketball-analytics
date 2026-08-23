/**
 * Resolve retired jersey honors for a player route id.
 */

import { cache } from "react";

import { resolvePlayerIdentityCached } from "@/data/identity/player-identity-cache";
import { getRetiredJerseysByNbaId } from "@/content/awards/retired-jerseys";
import {
  resolveRetiredJerseyPalette,
  type RetiredJerseyBadge,
} from "@/lib/retired-jersey-palette";
import { resolveTeamBrand } from "@/lib/nba-brand";

export type { RetiredJerseyBadge };

export const getPlayerRetiredJerseys = cache(
  async function getPlayerRetiredJerseys(
    playerId: string
  ): Promise<RetiredJerseyBadge[]> {
    const identity = await resolvePlayerIdentityCached(playerId);
    const nbaId =
      identity.nbaId ??
      (/^\d+$/.test(playerId.trim()) ? playerId.trim() : null);
    if (!nbaId) return [];

    return getRetiredJerseysByNbaId(nbaId).map((row) => {
      const brand = resolveTeamBrand(row.teamKey);
      return {
        ...row,
        palette: resolveRetiredJerseyPalette(row.teamKey),
        teamAbbr: brand?.abbr ?? row.teamKey.toUpperCase(),
        teamHrefId: brand?.espnTeamId ?? row.teamKey,
      };
    });
  }
);

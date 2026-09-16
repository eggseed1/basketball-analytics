/**
 * Resolve retired jersey honors for a player route id.
 */

import { cache } from "react";

import { displayAliasNbaId } from "@/data/identity/artifact-join";
import { getPlayerIdAliasIndex } from "@/data/identity/player-identity";
import { resolvePlayerIdentityCached } from "@/data/identity/player-identity-cache";
import { getRetiredJerseysByNbaId } from "@/content/awards/retired-jerseys";
import { nbaPersonIdFromPlayerRoute } from "@/data/runtime/legend-nba-to-bref";
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
    const aliases = await getPlayerIdAliasIndex().catch(() => null);
    const aliasNba = aliases
      ? displayAliasNbaId(playerId, aliases, identity.displayName)
      : null;
    // Legend pages remap to bref:{slug}; retirements stay keyed by NBA PERSON_ID.
    const nbaId =
      nbaPersonIdFromPlayerRoute(identity.nbaId) ??
      nbaPersonIdFromPlayerRoute(aliasNba) ??
      nbaPersonIdFromPlayerRoute(playerId) ??
      nbaPersonIdFromPlayerRoute(identity.routeId);
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

/**
 * Resolve retired jersey honors for a player route id.
 */

import { cache } from "react";

import { displayAliasNbaId } from "@/data/identity/artifact-join";
import { getPlayerIdAliasIndex } from "@/data/identity/player-identity";
import { resolvePlayerIdentityCached } from "@/data/identity/player-identity-cache";
import {
  getRetiredJerseysByName,
  getRetiredJerseysByNbaId,
  normalizeRetiredName,
  type RetiredJerseyRecord,
} from "@/content/awards/retired-jerseys";
import {
  displayNameForBrefSlug,
  nbaPersonIdFromPlayerRoute,
} from "@/data/runtime/legend-nba-to-bref";
import {
  resolveRetiredJerseyPalette,
  type RetiredJerseyBadge,
} from "@/lib/retired-jersey-palette";
import { resolveTeamBrand } from "@/lib/nba-brand";

export type { RetiredJerseyBadge };

/** Banner sets for defunct brands keep their own label. */
const HISTORICAL_BANNER_ABBR: Record<string, string> = { sea: "SEA" };

function nameFromBrefRoute(routeId: string): string | null {
  const lower = routeId.trim().toLowerCase();
  if (!lower.startsWith("bref:")) return null;
  const slug = lower.slice(5).split("|")[0]?.trim() ?? "";
  if (!slug) return null;
  // `bref:zach randolph` routes carry the name; `bref:randoza01` needs the bake.
  return slug.includes(" ") ? slug : displayNameForBrefSlug(slug);
}

function resolveRows(
  playerId: string,
  identity: { nbaId?: string | null; routeId?: string | null; displayName?: string | null },
  aliasNba: string | null,
  pageName: string | null
): RetiredJerseyRecord[] {
  for (const id of [identity.nbaId, aliasNba]) {
    if (!id || id === playerId) continue;
    const rows = getRetiredJerseysByNbaId(nbaPersonIdFromPlayerRoute(id));
    if (rows.length) return rows;
  }

  // A bare numeric route may be an ESPN athlete id, so require the name to agree.
  const name =
    identity.displayName?.trim() || pageName?.trim() || nameFromBrefRoute(playerId);
  for (const id of [playerId, identity.routeId]) {
    const rows = getRetiredJerseysByNbaId(nbaPersonIdFromPlayerRoute(id));
    if (!rows.length) continue;
    const bySlug = String(id ?? "").toLowerCase().startsWith("bref:");
    if (bySlug || (name && normalizeRetiredName(name) === normalizeRetiredName(rows[0].playerName))) {
      return rows;
    }
  }

  return getRetiredJerseysByName(name);
}

export const getPlayerRetiredJerseys = cache(
  async function getPlayerRetiredJerseys(
    playerId: string,
    /** Name the player page settled on; used when identity has none. */
    pageName?: string | null
  ): Promise<RetiredJerseyBadge[]> {
    const identity = await resolvePlayerIdentityCached(playerId);
    const aliases = await getPlayerIdAliasIndex().catch(() => null);
    const aliasNba = aliases
      ? displayAliasNbaId(playerId, aliases, identity.displayName)
      : null;

    return resolveRows(playerId, identity, aliasNba, pageName ?? null).map((row) => {
      const brand = resolveTeamBrand(row.teamKey);
      return {
        ...row,
        palette: resolveRetiredJerseyPalette(row.teamKey),
        teamAbbr:
          HISTORICAL_BANNER_ABBR[row.teamKey] ??
          brand?.abbr ??
          row.teamKey.toUpperCase(),
        teamHrefId: brand?.espnTeamId ?? row.teamKey,
      };
    });
  }
);

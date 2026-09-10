/**
 * ESPN athlete id ↔ NBA Stats PLAYER_ID resolution for DRBL overlays.
 *
 * Uses optional aliases from data/impact/player-id-aliases.json only —
 * never invents mappings and never accepts ambiguous name matches at runtime.
 *
 * Production auto-join policy (P17.1):
 * - ONLY aliases with productionApproved=true OR confidence in
 *   EXACT_PROVIDER_MAPPING | VERIFIED_MULTI_FIELD | HIGH_CONFIDENCE_MULTI_FIELD
 *   are used by resolveNbaIdForDrbl / resolvePlayerIdentity by default.
 * - UNIQUE_NAME_ONLY / AMBIGUOUS / UNRESOLVED stay in the alias file for audit
 *   but are NOT used for silent DRBL overlay unless opts.allowNonProductionAliases.
 * - Product code must NOT pass allowNonProductionAliases.
 */

import { looksLikeEspnAthleteId } from "@/data/providers/nba/athlete-bio";
import {
  isProductionApprovedPlayerAlias,
  loadPlayerIdAliases,
  type PlayerIdAlias,
  type PlayerIdAliasIndex,
} from "@/data/providers/impact/player-id-aliases";

export type PlayerIdentityMatchMethod =
  | "alias_espn_to_nba"
  | "alias_nba_to_espn"
  | "passthrough_nba"
  | "unresolved";

export type PlayerIdentityConfidence =
  | "EXACT_PROVIDER_MAPPING"
  | "VERIFIED_MULTI_FIELD"
  | "HIGH_CONFIDENCE_MULTI_FIELD"
  | "UNIQUE_NAME_ONLY"
  | "EXACT_MULTI_FIELD"
  | "HIGH_CONFIDENCE_UNIQUE_NAME"
  | "ALIAS_FILE"
  | "UNRESOLVED"
  | "AMBIGUOUS";

export type PlayerIdentityResolution = {
  routeId: string;
  espnId: string | null;
  nbaId: string | null;
  displayName?: string;
  matchMethod: PlayerIdentityMatchMethod;
  confidence: PlayerIdentityConfidence;
  ambiguous: boolean;
  resolved: boolean;
};

export type PlayerIdentityResolveOptions = {
  /**
   * Opt-in for audit / research scripts only.
   * When true, UNIQUE_NAME_ONLY (and other non-production) aliases may resolve.
   * Product / DRBL overlay paths must leave this false/undefined.
   */
  allowNonProductionAliases?: boolean;
};

export { looksLikeEspnAthleteId };

/** Confidence classes approved for silent production ESPN↔NBA joins. */
export const PRODUCTION_APPROVED_ALIAS_CONFIDENCE = [
  "EXACT_PROVIDER_MAPPING",
  "VERIFIED_MULTI_FIELD",
  "HIGH_CONFIDENCE_MULTI_FIELD",
] as const;

let aliasIndexPromise: Promise<PlayerIdAliasIndex> | null = null;

export async function getPlayerIdAliasIndex(): Promise<PlayerIdAliasIndex> {
  aliasIndexPromise ??= loadPlayerIdAliases();
  return aliasIndexPromise;
}

/** Test / script helper — clears memoized alias load. */
export function clearPlayerIdAliasCache(): void {
  aliasIndexPromise = null;
}

function aliasAllowedForAutoJoin(
  alias: PlayerIdAlias,
  opts?: PlayerIdentityResolveOptions
): boolean {
  if (opts?.allowNonProductionAliases) return true;
  return isProductionApprovedPlayerAlias(alias);
}

function fromAlias(
  routeId: string,
  alias: PlayerIdAlias,
  method: PlayerIdentityMatchMethod
): PlayerIdentityResolution {
  const confidence =
    (alias.confidence as PlayerIdentityConfidence | undefined) ?? "ALIAS_FILE";
  return {
    routeId,
    espnId: alias.espnPlayerId,
    nbaId: alias.nbaPlayerId,
    displayName: alias.playerName,
    matchMethod: method,
    confidence,
    ambiguous: false,
    resolved: true,
  };
}

/**
 * Resolve dual identity for a route / board player id.
 * Alias by ESPN → NBA; by NBA → ESPN; else unresolved dual (both null sides unknown).
 * Non-production aliases are ignored unless allowNonProductionAliases.
 */
export async function resolvePlayerIdentity(
  id: string,
  opts?: PlayerIdentityResolveOptions
): Promise<PlayerIdentityResolution> {
  const routeId = String(id ?? "").trim();
  if (!routeId) {
    return {
      routeId: "",
      espnId: null,
      nbaId: null,
      matchMethod: "unresolved",
      confidence: "UNRESOLVED",
      ambiguous: false,
      resolved: false,
    };
  }

  const index = await getPlayerIdAliasIndex();
  const byEspn = index.byEspn.get(routeId);
  if (byEspn && aliasAllowedForAutoJoin(byEspn, opts)) {
    return fromAlias(routeId, byEspn, "alias_espn_to_nba");
  }

  const byNba = index.byNba.get(routeId);
  if (byNba && aliasAllowedForAutoJoin(byNba, opts)) {
    return fromAlias(routeId, byNba, "alias_nba_to_espn");
  }

  // No production-approved alias: treat ESPN-looking ids as espn-only;
  // otherwise nba candidate only (passthrough for NBA-id boards).
  if (looksLikeEspnAthleteId(routeId)) {
    return {
      routeId,
      espnId: routeId,
      nbaId: null,
      matchMethod: "unresolved",
      confidence: "UNRESOLVED",
      ambiguous: false,
      resolved: false,
    };
  }

  // Name-shaped BRef search ids (`bref:michael jordan`) — surface a display
  // name so the player page doesn't 404 before career rows attach.
  // When the route is a remapped legend (`bref:piercpa01`), keep the real NBA
  // PERSON_ID on `nbaId` so awards / jersey retirement / HOF lookups work.
  if (routeId.toLowerCase().startsWith("bref:")) {
    let displayName: string | undefined;
    try {
      const { displayNameFromBrefRouteId } = await import(
        "@/data/providers/nba/bref-career-from-page"
      );
      displayName = displayNameFromBrefRouteId(routeId) ?? undefined;
    } catch {
      displayName = undefined;
    }
    let nbaPersonId: string | null = null;
    try {
      const { nbaPersonIdFromPlayerRoute } = await import(
        "@/data/runtime/legend-nba-to-bref"
      );
      nbaPersonId = nbaPersonIdFromPlayerRoute(routeId);
    } catch {
      nbaPersonId = null;
    }
    return {
      routeId,
      espnId: null,
      nbaId: nbaPersonId ?? routeId,
      displayName,
      matchMethod: "passthrough_nba",
      confidence: "UNRESOLVED",
      ambiguous: false,
      resolved: Boolean(displayName || nbaPersonId),
    };
  }

  return {
    routeId,
    espnId: null,
    nbaId: routeId,
    matchMethod: "passthrough_nba",
    confidence: "UNRESOLVED",
    ambiguous: false,
    resolved: false,
  };
}

/**
 * NBA Stats / DRBL map lookup id when known via production-approved alias.
 * Callers should still try the raw route id (boards may already use NBA ids).
 *
 * UNIQUE_NAME_ONLY is rejected unless opts.allowNonProductionAliases.
 * When the route id is itself an NBA id present in the alias file, returns that
 * id only if the alias is production-approved (or opt-in) — ESPN→NBA mapping
 * is never taken from non-approved rows on the default path.
 */
export async function resolveNbaIdForDrbl(
  id: string,
  opts?: PlayerIdentityResolveOptions
): Promise<string | null> {
  const routeId = String(id ?? "").trim();
  if (!routeId) return null;
  const index = await getPlayerIdAliasIndex();
  const byEspn = index.byEspn.get(routeId);
  if (byEspn?.nbaPlayerId && aliasAllowedForAutoJoin(byEspn, opts)) {
    return byEspn.nbaPlayerId;
  }
  // NBA-id board / passthrough: if this id is already an NBA Stats id with an
  // approved alias row, return it. Non-approved byNba rows do not authorize
  // ESPN joins; for bare NBA ids already on an NBA board, callers use raw id.
  const byNba = index.byNba.get(routeId);
  if (byNba && aliasAllowedForAutoJoin(byNba, opts)) {
    return routeId;
  }
  return null;
}

/**
 * Client-safe game-side team identity helpers.
 * Sync / in-memory only — no queries, no Node/fs.
 *
 * After historical transforms, Game.homeTeamId / awayTeamId are canonical
 * (ESPN string). Provider ids live in homeProviderTeamId / awayProviderTeamId
 * with teamIdProvider naming the namespace.
 */

import type { Game } from "@/data/types";
import {
  getCanonicalTeamFromProvider,
  resolveCanonicalTeam,
  type TeamDataProviderId,
} from "@/data/identity/team-map";
import { resolveTeamBrand } from "@/lib/nba-brand";

export type GameTeamProvider = Extract<TeamDataProviderId, "espn" | "bdl">;

export type NormalizedGameTeamSide = {
  /** Canonical DRBL team id (ESPN string) when resolved; else raw provider id. */
  canonicalTeamId: string;
  providerTeamId: string;
  provider: GameTeamProvider;
  abbr?: string;
  name?: string;
  resolved: boolean;
};

/**
 * Normalize one side at the provider → canonical boundary.
 * Never guesses across providers for bare numerics.
 */
export function normalizeGameTeamSide(input: {
  provider: GameTeamProvider;
  providerTeamId: string;
  abbr?: string | null;
  name?: string | null;
}): NormalizedGameTeamSide {
  const providerTeamId = String(input.providerTeamId ?? "").trim();
  const fromProvider = providerTeamId
    ? getCanonicalTeamFromProvider(input.provider, providerTeamId)
    : null;

  // Abbr can confirm / fill when provider id maps cleanly.
  const fromAbbr = input.abbr?.trim()
    ? resolveCanonicalTeam(input.abbr.trim())
    : null;
  const abbrTeam =
    fromAbbr?.status === "resolved" ? fromAbbr.team : null;

  const team = fromProvider ?? abbrTeam ?? null;
  const abbr =
    (input.abbr?.trim() || team?.abbr || undefined)?.toUpperCase() ||
    undefined;
  const name = input.name?.trim() || team?.displayName || undefined;

  if (!team) {
    return {
      canonicalTeamId: providerTeamId,
      providerTeamId,
      provider: input.provider,
      abbr,
      name,
      resolved: false,
    };
  }

  return {
    canonicalTeamId: team.canonicalTeamId,
    providerTeamId: providerTeamId || team.providerIds[input.provider] || team.canonicalTeamId,
    provider: input.provider,
    abbr: abbr ?? team.abbr,
    name,
    resolved: true,
  };
}

type GameTeamFields = Pick<
  Game,
  | "homeTeamId"
  | "awayTeamId"
  | "homeTeamAbbr"
  | "awayTeamAbbr"
  | "homeTeamName"
  | "awayTeamName"
  | "teamIdProvider"
  | "homeProviderTeamId"
  | "awayProviderTeamId"
>;

/**
 * Branding / logo key: abbreviation first, then canonical id.
 * Never treat an unknown bare provider id as ESPN via resolveTeamBrand alone
 * when teamIdProvider is explicitly "bdl".
 */
export function gameSideBrandKey(
  game: GameTeamFields,
  side: "home" | "away"
): string {
  const abbr = side === "home" ? game.homeTeamAbbr : game.awayTeamAbbr;
  if (abbr?.trim()) return abbr.trim();

  const canonicalId = side === "home" ? game.homeTeamId : game.awayTeamId;
  const fromCanonical = resolveCanonicalTeam(canonicalId);
  if (fromCanonical.status === "resolved") return fromCanonical.team.abbr;

  // Explicit BDL leftover: map via provider namespace, never ESPN-guess.
  if (game.teamIdProvider === "bdl") {
    const raw =
      side === "home"
        ? game.homeProviderTeamId ?? game.homeTeamId
        : game.awayProviderTeamId ?? game.awayTeamId;
    const mapped = getCanonicalTeamFromProvider("bdl", raw);
    if (mapped) return mapped.abbr;
    return raw;
  }

  const brand = resolveTeamBrand(canonicalId);
  return brand?.abbr ?? canonicalId;
}

export function gameSideCanonicalTeamId(
  game: GameTeamFields,
  side: "home" | "away"
): string {
  const id = side === "home" ? game.homeTeamId : game.awayTeamId;
  const resolved = resolveCanonicalTeam(id);
  if (resolved.status === "resolved") return resolved.team.canonicalTeamId;

  if (game.teamIdProvider === "bdl") {
    const raw =
      side === "home"
        ? game.homeProviderTeamId ?? game.homeTeamId
        : game.awayProviderTeamId ?? game.awayTeamId;
    return (
      getCanonicalTeamFromProvider("bdl", raw)?.canonicalTeamId ?? id
    );
  }
  return id;
}

/**
 * Cheap, sync upgrade for legacy cache rows and mixed provider shells.
 * Idempotent when already normalized. Requires an explicit provider namespace
 * (on the row or as fallback) — never guesses ESPN vs BDL from bare numbers.
 */
export function ensureGameTeamIdentity(
  game: Game,
  fallbackProvider?: GameTeamProvider
): Game {
  const provider = game.teamIdProvider ?? fallbackProvider;
  if (!provider) return game;

  const home = normalizeGameTeamSide({
    provider,
    providerTeamId: game.homeProviderTeamId ?? game.homeTeamId,
    abbr: game.homeTeamAbbr,
    name: game.homeTeamName,
  });
  const away = normalizeGameTeamSide({
    provider,
    providerTeamId: game.awayProviderTeamId ?? game.awayTeamId,
    abbr: game.awayTeamAbbr,
    name: game.awayTeamName,
  });
  if (
    game.teamIdProvider === provider &&
    game.homeTeamId === home.canonicalTeamId &&
    game.awayTeamId === away.canonicalTeamId &&
    game.homeProviderTeamId === home.providerTeamId &&
    game.awayProviderTeamId === away.providerTeamId &&
    game.homeTeamAbbr === home.abbr &&
    game.awayTeamAbbr === away.abbr
  ) {
    return game;
  }
  return {
    ...game,
    homeTeamId: home.canonicalTeamId,
    awayTeamId: away.canonicalTeamId,
    homeTeamAbbr: home.abbr ?? game.homeTeamAbbr,
    awayTeamAbbr: away.abbr ?? game.awayTeamAbbr,
    homeTeamName: home.name ?? game.homeTeamName,
    awayTeamName: away.name ?? game.awayTeamName,
    teamIdProvider: provider,
    homeProviderTeamId: home.providerTeamId,
    awayProviderTeamId: away.providerTeamId,
  };
}

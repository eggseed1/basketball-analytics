/**
 * Client-safe game-side team identity helpers.
 * Sync / in-memory only — no queries, no Node/fs.
 *
 * After historical transforms, Game.homeTeamId / awayTeamId are canonical
 * (ESPN string). Provider ids live in homeProviderTeamId / awayProviderTeamId
 * with teamIdProvider naming the namespace.
 *
 * Display abbr/name must use team-era identity for the game season when known —
 * never current franchise branding alone (e.g. 1969 SEA ≠ OKC Thunder).
 */

import type { Game } from "@/data/types";
import {
  getCanonicalTeamFromProvider,
  resolveCanonicalTeam,
  type TeamDataProviderId,
} from "@/data/identity/team-map";
import { teamEraDisplay } from "@/data/identity/team-era";
import { resolveTeamBrand } from "@/lib/nba-brand";

export type GameTeamProvider = Extract<TeamDataProviderId, "espn" | "bdl">;

/**
 * Infer provider namespace for legacy rows that lack `teamIdProvider`.
 * Numeric non-ESPN ids are treated as BallDontLie (historical cache / schedule).
 */
export function inferGameTeamProvider(
  game: Pick<Game, "id" | "teamIdProvider">
): GameTeamProvider | undefined {
  if (game.teamIdProvider === "espn" || game.teamIdProvider === "bdl") {
    return game.teamIdProvider;
  }
  const id = String(game.id ?? "").trim();
  if (/^40\d{6,}$/.test(id)) return "espn";
  if (/^\d+$/.test(id)) return "bdl";
  return undefined;
}

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
 * Does not apply team-era (call applyHistoricalTeamEraToGame with season).
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

  // Abbr can confirm / fill when provider id maps cleanly (incl. historical SEA→OKC).
  const fromAbbr = input.abbr?.trim()
    ? resolveCanonicalTeam(input.abbr.trim())
    : null;
  const abbrTeam =
    fromAbbr?.status === "resolved" ? fromAbbr.team : null;

  const team = fromProvider ?? abbrTeam ?? null;

  if (!team) {
    const abbr = input.abbr?.trim()?.toUpperCase() || undefined;
    const name = input.name?.trim() || undefined;
    return {
      canonicalTeamId: providerTeamId,
      providerTeamId,
      provider: input.provider,
      abbr,
      name,
      resolved: false,
    };
  }

  // Prefer provider-supplied labels only when they do not look like a known
  // current-franchise anachronism for this canonical id — era stamping fixes
  // that next. Keep raw abbr when it resolves to the same franchise.
  const rawAbbr = input.abbr?.trim()?.toUpperCase();
  const rawName = input.name?.trim();

  return {
    canonicalTeamId: team.canonicalTeamId,
    providerTeamId:
      providerTeamId || team.providerIds[input.provider] || team.canonicalTeamId,
    provider: input.provider,
    abbr: rawAbbr || team.abbr,
    name: rawName || team.displayName,
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
  | "season"
>;

/**
 * Stamp season-aware team-era display onto a game row.
 * Canonical ids unchanged — only abbr/name for historical truth.
 *
 * Requires `teamIdProvider` so we know homeTeamId/awayTeamId are canonical
 * ESPN franchise ids (never stamp eras onto ambiguous bare BDL numerics).
 */
export function applyHistoricalTeamEraToGame(game: Game): Game {
  if (!game.season || !game.teamIdProvider) return game;

  const home = teamEraDisplay(game.homeTeamId, game.season, {
    abbr: game.homeTeamAbbr,
    displayName: game.homeTeamName,
  });
  const away = teamEraDisplay(game.awayTeamId, game.season, {
    abbr: game.awayTeamAbbr,
    displayName: game.awayTeamName,
  });

  if (
    game.homeTeamAbbr === home.abbr &&
    game.awayTeamAbbr === away.abbr &&
    game.homeTeamName === home.displayName &&
    game.awayTeamName === away.displayName
  ) {
    return game;
  }

  return {
    ...game,
    homeTeamAbbr: home.abbr,
    awayTeamAbbr: away.abbr,
    homeTeamName: home.displayName,
    awayTeamName: away.displayName,
  };
}

/**
 * Branding / logo key: era abbreviation first, then canonical id.
 * Historical abbrs (SEA, NJN, …) intentionally do not resolve to modern logos
 * via TEAM_BRANDS — UI should show text identity rather than anachronistic marks.
 */
export function gameSideBrandKey(
  game: GameTeamFields,
  side: "home" | "away"
): string {
  const abbr = side === "home" ? game.homeTeamAbbr : game.awayTeamAbbr;
  if (abbr?.trim()) return abbr.trim();

  const canonicalId = side === "home" ? game.homeTeamId : game.awayTeamId;
  if (game.season) {
    const era = teamEraDisplay(canonicalId, game.season);
    if (era.fromEra) return era.abbr;
  }

  const fromCanonical = resolveCanonicalTeam(canonicalId);
  if (fromCanonical.status === "resolved") return fromCanonical.team.abbr;

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

/** Season-aware display label for cards / tables / Game Lab. */
export function gameSideDisplayName(
  game: GameTeamFields,
  side: "home" | "away"
): string {
  const stored = side === "home" ? game.homeTeamName : game.awayTeamName;
  if (stored?.trim()) return stored.trim();
  const id = gameSideCanonicalTeamId(game, side);
  if (game.season) {
    return teamEraDisplay(id, game.season).displayName;
  }
  const resolved = resolveCanonicalTeam(id);
  return resolved.status === "resolved" ? resolved.team.displayName : id;
}

/**
 * Cheap, sync upgrade for legacy cache rows and mixed provider shells.
 * Idempotent when already normalized. Requires an explicit provider namespace
 * (on the row or as fallback) — never guesses ESPN vs BDL from bare numbers.
 * Always applies team-era display for the game season.
 */
export function ensureGameTeamIdentity(
  game: Game,
  fallbackProvider?: GameTeamProvider
): Game {
  const provider =
    game.teamIdProvider ?? fallbackProvider ?? inferGameTeamProvider(game);
  let next = game;

  if (provider) {
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
      !(
        game.teamIdProvider === provider &&
        game.homeTeamId === home.canonicalTeamId &&
        game.awayTeamId === away.canonicalTeamId &&
        game.homeProviderTeamId === home.providerTeamId &&
        game.awayProviderTeamId === away.providerTeamId
      )
    ) {
      next = {
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
  }

  return applyHistoricalTeamEraToGame(next);
}

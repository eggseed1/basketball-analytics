/**
 * Safe transaction → player linking.
 * Links only when a trusted canonical playerId is present.
 * Never name-matches ESPN free text.
 */

import {
  getPlayerPageHref,
  playerPageHref,
} from "@/lib/player-season-resolve";

/**
 * Sync href when season is already known, or playerId alone (season optional).
 * Returns null when playerId is missing — caller must not invent an id.
 */
export function transactionPlayerHref(options: {
  playerId?: string | null;
  season?: string | null;
}): string | null {
  const id = options.playerId?.trim();
  if (!id) return null;
  return playerPageHref(id, options.season);
}

/** Async variant that fills default season when omitted. */
export async function resolveTransactionPlayerHref(options: {
  playerId?: string | null;
  season?: string | null;
}): Promise<string | null> {
  const id = options.playerId?.trim();
  if (!id) return null;
  return getPlayerPageHref(id, options.season);
}

/** True only when a canonical id is present — gate for PlayerIdentity. */
export function canLinkTransactionPlayer(
  playerId?: string | null
): boolean {
  return Boolean(playerId?.trim());
}

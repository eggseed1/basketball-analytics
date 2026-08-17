/**
 * Game ID namespaces — ESPN event ids and BallDontLie game ids do not share a space.
 *
 * Existing routes `/games/[gameId]` accept either opaque string:
 * - ESPN scoreboard / event ids typically look like `40########`
 * - BDL / historical cache ids are often shorter numerics (e.g. `15908541`)
 *
 * `getGameShell` / `getGameAnalysis` already try the correct provider by shape
 * and fallback. This module documents the distinction; it is not a full
 * cross-provider game unification framework.
 */

export type GameDataProviderId = "espn" | "bdl" | (string & {});

export type ProviderGameKey = `${string}:${string}`;

export function providerGameKey(
  provider: GameDataProviderId | string,
  providerGameId: string
): ProviderGameKey {
  return `${String(provider).toLowerCase()}:${String(providerGameId).trim()}` as ProviderGameKey;
}

/**
 * Heuristic only for routing hints — never treat as proof of identity.
 * ESPN NBA event ids commonly start with `40`.
 */
export function guessGameProvider(
  gameId: string
): GameDataProviderId | "unknown" {
  const id = gameId.trim();
  if (!id) return "unknown";
  // ESPN NBA event ids commonly start with `40` (typically 9+ digits total).
  if (/^40\d{6,}$/.test(id)) return "espn";
  if (/^\d+$/.test(id)) return "bdl";
  return "unknown";
}

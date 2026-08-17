/**
 * Game ID namespaces — ESPN event ids, NBA Stats GameIDs, and BallDontLie
 * game ids do not share a space.
 *
 * Public routes `/games/[gameId]` accept provider-native ids when the lookup
 * contract matches the link generator:
 * - ESPN scoreboard / event ids: `40########` (typically 9+ digits)
 * - NBA Stats GameID: `00########` (10 digits; 001/002/004/005 prefixes)
 * - BDL / historical cache ids: shorter numerics (e.g. `15908541`)
 *
 * Never treat a bare numeric as interchangeable across providers.
 */

export type GameDataProviderId = "espn" | "bdl" | "nba" | (string & {});

export type ProviderGameKey = `${string}:${string}`;

export function providerGameKey(
  provider: GameDataProviderId | string,
  providerGameId: string
): ProviderGameKey {
  return `${String(provider).toLowerCase()}:${String(providerGameId).trim()}` as ProviderGameKey;
}

/** ESPN NBA event ids commonly start with `40` (typically 9+ digits total). */
export function looksLikeEspnEventId(gameId: string): boolean {
  return /^40\d{7,}$/.test(String(gameId).trim());
}

/**
 * NBA Stats GameID: 10 digits starting with `00`.
 * Format-inferred as `nba` only — never query BDL/ESPN with this id.
 */
export function looksLikeNbaStatsGameId(gameId: string): boolean {
  return /^00\d{8}$/.test(String(gameId).trim());
}

/**
 * Heuristic only for routing hints — never treat as proof of identity.
 */
export function guessGameProvider(
  gameId: string
): GameDataProviderId | "unknown" {
  const id = gameId.trim();
  if (!id) return "unknown";
  if (looksLikeEspnEventId(id)) return "espn";
  if (looksLikeNbaStatsGameId(id)) return "nba";
  if (/^\d+$/.test(id)) return "bdl";
  return "unknown";
}

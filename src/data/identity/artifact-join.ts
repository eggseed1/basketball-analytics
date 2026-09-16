/**
 * Display joins for artifacts keyed by NBA id.
 *
 * UNIQUE_NAME_ONLY aliases stay blocked from silent model resolution
 * (`resolveNbaIdForDrbl`). They may attach a published row only when that NBA
 * id is already in the artifact and the board name does not contradict the
 * alias name. That is how Anthony Davis gets DRBL without opening every
 * unique-name mapping to automatic joins.
 */
import { isProductionApprovedPlayerAlias } from "@/data/providers/impact/player-id-aliases";
import type { PlayerIdAliasIndex } from "@/data/providers/impact/player-id-aliases";
import { normalizeEspnLookupName } from "@/data/runtime/espn-name-index";

function nameKey(name: string): string {
  return normalizeEspnLookupName(name)
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when both names are present and clearly not the same player. */
export function artifactNamesConflict(
  boardName: string | null | undefined,
  aliasName: string | null | undefined
): boolean {
  const board = boardName?.trim();
  const alias = aliasName?.trim();
  if (!board || !alias) return false;
  return nameKey(board) !== nameKey(alias);
}

/**
 * NBA id to read from an artifact map, or null when there is no safe join.
 */
export function nbaIdForKnownArtifact(
  row: { playerId: string; playerName?: string | null },
  artifactHas: (id: string) => boolean,
  aliases: PlayerIdAliasIndex
): string | null {
  const playerId = String(row.playerId ?? "").trim();
  if (playerId && artifactHas(playerId)) return playerId;

  const alias = playerId ? aliases.byEspn.get(playerId) : undefined;
  const nbaId = alias?.nbaPlayerId?.trim();
  if (!nbaId || nbaId === playerId || !artifactHas(nbaId)) return null;
  if (
    !isProductionApprovedPlayerAlias(alias!) &&
    artifactNamesConflict(row.playerName, alias?.playerName)
  ) {
    return null;
  }
  return nbaId;
}

/** ESPN→NBA id from the alias file for display lookups (awards, shots, contracts). */
export function displayAliasNbaId(
  playerId: string,
  aliases: PlayerIdAliasIndex,
  displayName?: string | null
): string | null {
  const alias = aliases.byEspn.get(String(playerId ?? "").trim());
  const nbaId = alias?.nbaPlayerId?.trim();
  if (!nbaId) return null;
  if (artifactNamesConflict(displayName, alias?.playerName)) return null;
  return nbaId;
}

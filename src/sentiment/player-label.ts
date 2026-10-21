/**
 * Resolve human labels for sentiment player rows when the snapshot fell back
 * to a raw ESPN/NBA id (common for waived / off-roster ingest-only subjects).
 */

import { getBundledPlayerIdAliasIndex } from "@/data/runtime/player-id-aliases-snapshot";

export function isRawPlayerIdLabel(
  label: string | undefined | null,
  playerIds: string[] = []
): boolean {
  const t = String(label ?? "").trim();
  if (!t) return true;
  if (playerIds.includes(t)) return true;
  return /^\d{5,}$/.test(t);
}

export function sentimentPlayerLabel(
  playerId: string,
  displayName?: string | null
): string {
  const id = String(playerId ?? "").trim();
  if (!id) return String(displayName ?? "").trim();
  if (!isRawPlayerIdLabel(displayName, [id])) return String(displayName).trim();
  const aliases = getBundledPlayerIdAliasIndex();
  return (
    aliases.byEspn.get(id)?.playerName?.trim() ||
    aliases.byNba.get(id)?.playerName?.trim() ||
    String(displayName ?? "").trim() ||
    id
  );
}

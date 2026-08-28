/**
 * Bundled ESPN ↔ NBA player id aliases for Cloudflare Workers (no node:fs).
 */
import snapshot from "./player-id-aliases-snapshot.json";
import type {
  PlayerIdAlias,
  PlayerIdAliasIndex,
} from "@/data/providers/impact/player-id-aliases";

type AliasFile = {
  version?: number;
  aliases?: PlayerIdAlias[];
};

const rows = Array.isArray((snapshot as AliasFile)?.aliases)
  ? ((snapshot as AliasFile).aliases as PlayerIdAlias[])
  : [];

let cached: PlayerIdAliasIndex | null = null;

export function getBundledPlayerIdAliasIndex(): PlayerIdAliasIndex {
  if (cached) return cached;
  const byEspn = new Map<string, PlayerIdAlias>();
  const byNba = new Map<string, PlayerIdAlias>();
  for (const row of rows) {
    if (!row?.espnPlayerId || !row?.nbaPlayerId) continue;
    const normalized: PlayerIdAlias = {
      espnPlayerId: String(row.espnPlayerId).trim(),
      nbaPlayerId: String(row.nbaPlayerId).trim(),
      playerName: row.playerName?.trim() || undefined,
      matchMethod: row.matchMethod?.trim() || undefined,
      confidence: row.confidence?.trim() || undefined,
      productionApproved:
        typeof row.productionApproved === "boolean"
          ? row.productionApproved
          : undefined,
    };
    if (!normalized.espnPlayerId || !normalized.nbaPlayerId) continue;
    byEspn.set(normalized.espnPlayerId, normalized);
    byNba.set(normalized.nbaPlayerId, normalized);
  }
  cached = { byEspn, byNba };
  return cached;
}

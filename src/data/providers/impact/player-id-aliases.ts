import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Optional ESPN ↔ NBA player id aliases for high-confidence historical impact joins.
 * File: data/impact/player-id-aliases.json
 *
 * {
 *   "aliases": [
 *     { "espnPlayerId": "3112335", "nbaPlayerId": "203999", "playerName": "Nikola Jokic" }
 *   ]
 * }
 */
export type PlayerIdAlias = {
  espnPlayerId: string;
  nbaPlayerId: string;
  playerName?: string;
};

export type PlayerIdAliasIndex = {
  byEspn: Map<string, PlayerIdAlias>;
  byNba: Map<string, PlayerIdAlias>;
};

const ALIAS_RELATIVE = path.join("data", "impact", "player-id-aliases.json");

export async function loadPlayerIdAliases(): Promise<PlayerIdAliasIndex> {
  const empty: PlayerIdAliasIndex = {
    byEspn: new Map(),
    byNba: new Map(),
  };
  const filePath = path.join(process.cwd(), ALIAS_RELATIVE);
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    return empty;
  }

  try {
    const parsed = JSON.parse(text) as { aliases?: PlayerIdAlias[] };
    const aliases = Array.isArray(parsed.aliases) ? parsed.aliases : [];
    for (const row of aliases) {
      if (!row?.espnPlayerId || !row?.nbaPlayerId) continue;
      const normalized: PlayerIdAlias = {
        espnPlayerId: String(row.espnPlayerId).trim(),
        nbaPlayerId: String(row.nbaPlayerId).trim(),
        playerName: row.playerName?.trim() || undefined,
      };
      if (!normalized.espnPlayerId || !normalized.nbaPlayerId) continue;
      empty.byEspn.set(normalized.espnPlayerId, normalized);
      empty.byNba.set(normalized.nbaPlayerId, normalized);
    }
  } catch {
    return empty;
  }
  return empty;
}

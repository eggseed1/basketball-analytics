import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Optional ESPN ↔ NBA player id aliases for high-confidence historical impact joins.
 * File: data/impact/player-id-aliases.json
 *
 * P17.1 production auto-join uses only productionApproved aliases (or confidence
 * in EXACT_PROVIDER_MAPPING | VERIFIED_MULTI_FIELD | HIGH_CONFIDENCE_MULTI_FIELD).
 * UNIQUE_NAME_ONLY rows remain in the file for audit but are not silent-joined.
 *
 * {
 *   "aliases": [
 *     {
 *       "espnPlayerId": "3112335",
 *       "nbaPlayerId": "203999",
 *       "playerName": "Nikola Jokic",
 *       "confidence": "HIGH_CONFIDENCE_MULTI_FIELD",
 *       "productionApproved": true
 *     }
 *   ]
 * }
 */
export type PlayerIdAlias = {
  espnPlayerId: string;
  nbaPlayerId: string;
  playerName?: string;
  matchMethod?: string;
  confidence?: string;
  /** When true, safe for silent production ESPN↔NBA DRBL joins. */
  productionApproved?: boolean;
};

export type PlayerIdAliasIndex = {
  byEspn: Map<string, PlayerIdAlias>;
  byNba: Map<string, PlayerIdAlias>;
};

/** Confidence classes approved for silent production joins (P17.1). */
export const PRODUCTION_APPROVED_ALIAS_CONFIDENCE = new Set([
  "EXACT_PROVIDER_MAPPING",
  "VERIFIED_MULTI_FIELD",
  "HIGH_CONFIDENCE_MULTI_FIELD",
]);

export function isProductionApprovedPlayerAlias(
  alias: Pick<PlayerIdAlias, "productionApproved" | "confidence">
): boolean {
  if (alias.productionApproved === true) return true;
  if (alias.productionApproved === false) return false;
  return PRODUCTION_APPROVED_ALIAS_CONFIDENCE.has(
    String(alias.confidence ?? "").trim()
  );
}

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
        matchMethod: row.matchMethod?.trim() || undefined,
        confidence: row.confidence?.trim() || undefined,
        productionApproved:
          typeof row.productionApproved === "boolean"
            ? row.productionApproved
            : undefined,
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

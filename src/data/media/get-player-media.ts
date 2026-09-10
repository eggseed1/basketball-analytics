/**
 * Server-side bulk player media loader (precomputed registry).
 * Keys may be NBA PERSON_ID, ESPN athlete id, or bref:{slug} (dual-indexed).
 */

import { lookupApprovedPortraitUrl } from "@/data/media/portrait-lookup-store";
import { getBundledPlayerIdAliasIndex } from "@/data/runtime/player-id-aliases-snapshot";
import { LEGEND_NBA_TO_BREF } from "@/data/runtime/legend-nba-to-bref";

export type PlayerMediaState =
  | "VERIFIED_EXACT_ERA"
  | "VERIFIED_PLAYING_ERA"
  | "VERIFIED_PLAYER_GENERIC"
  | "SAFE_PLACEHOLDER";

export type PlayerMediaResult = {
  playerId: string;
  state: PlayerMediaState;
  sourceUrl: string | null;
  source: string | null;
};

function expandPortraitIds(playerId: string): string[] {
  const id = String(playerId ?? "").trim();
  if (!id) return [];
  const ids: string[] = [id];
  try {
    const index = getBundledPlayerIdAliasIndex();
    const alias =
      index.byEspn.get(id) ??
      index.byNba.get(id) ??
      (id.startsWith("bref:") ? index.byBref?.get(id.slice(5)) : undefined);
    if (alias) {
      ids.push(alias.nbaPlayerId, alias.espnPlayerId);
      if (alias.brefSlug) ids.push(`bref:${alias.brefSlug}`);
      ids.push(`espn:${alias.espnPlayerId}`);
    }
  } catch {
    /* bundled alias optional in some harnesses */
  }
  if (/^\d+$/.test(id)) {
    ids.push(`espn:${id}`);
    const bref = LEGEND_NBA_TO_BREF[id];
    if (bref) ids.push(bref);
  }
  return [...new Set(ids.filter(Boolean))];
}

/** Bulk-friendly portrait resolution — no network. Season falls through to generic. */
export function getPlayerMedia(
  playerIds: string[],
  _season?: string | null
): Map<string, PlayerMediaResult> {
  const out = new Map<string, PlayerMediaResult>();
  for (const id of playerIds) {
    const url = lookupApprovedPortraitUrl(...expandPortraitIds(id));
    if (url) {
      out.set(id, {
        playerId: id,
        state: "VERIFIED_PLAYER_GENERIC",
        sourceUrl: url,
        source: url.includes("espncdn.com")
          ? "a.espncdn.com"
          : url.includes("cdn.nba.com")
            ? "cdn.nba.com"
            : url.includes("basketball-reference.com")
              ? "basketball-reference.com"
              : "registry",
      });
    } else {
      out.set(id, {
        playerId: id,
        state: "SAFE_PLACEHOLDER",
        sourceUrl: null,
        source: null,
      });
    }
  }
  return out;
}

export function getPlayerPortraitUrl(playerId: string): string | null {
  return getPlayerMedia([playerId]).get(playerId)?.sourceUrl ?? null;
}

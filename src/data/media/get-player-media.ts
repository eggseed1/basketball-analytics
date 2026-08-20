/**
 * Server-side bulk player media loader (precomputed registry).
 * Keys may be NBA PERSON_ID or ESPN athlete id (dual-indexed).
 */

import { lookupApprovedPortraitUrl } from "@/data/media/portrait-lookup-store";

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

/** Bulk-friendly portrait resolution — no network. Season falls through to generic. */
export function getPlayerMedia(
  playerIds: string[],
  _season?: string | null
): Map<string, PlayerMediaResult> {
  const out = new Map<string, PlayerMediaResult>();
  for (const id of playerIds) {
    const url = lookupApprovedPortraitUrl(id);
    if (url) {
      out.set(id, {
        playerId: id,
        state: "VERIFIED_PLAYER_GENERIC",
        sourceUrl: url,
        source: url.includes("espncdn.com")
          ? "a.espncdn.com"
          : url.includes("cdn.nba.com")
            ? "cdn.nba.com"
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

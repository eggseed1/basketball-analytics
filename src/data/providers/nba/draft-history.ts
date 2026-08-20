/**
 * NBA Stats draft history → playerId → calendar draft year.
 * One league-wide snapshot; cache for hours (the table changes once a year).
 */

import { CACHE_TTL_MS } from "@/data/providers/nba/cache-policy";
import {
  getResultSet,
  resultSetToObjects,
  statsNbaFetch,
} from "@/data/providers/nba/stats-nba-client";
import type { PlayerSeason } from "@/data/types";

let cached: { freshUntil: number; map: Map<string, number> } | null = null;
const FRESH_MS = CACHE_TTL_MS.historicalSeasonStats;
const EMPTY = new Map<string, number>();

export async function getDraftYearByPlayerId(): Promise<Map<string, number>> {
  const now = Date.now();
  if (cached && cached.freshUntil > now && cached.map.size > 0) {
    return cached.map;
  }
  try {
    const response = await statsNbaFetch(
      "drafthistory",
      { LeagueID: "00" },
      { ttlMs: FRESH_MS, staleMs: FRESH_MS * 2, retries: 2 }
    );
    const set = getResultSet(response);
    if (!set) return cached?.map ?? EMPTY;
    const map = new Map<string, number>();
    for (const row of resultSetToObjects(set)) {
      const id = String(row.PERSON_ID ?? "").trim();
      const year = Number(row.SEASON);
      if (!id || !Number.isFinite(year) || year < 1947) continue;
      map.set(id, year);
    }
    if (map.size > 0) {
      cached = { map, freshUntil: now + FRESH_MS };
    }
    return map.size > 0 ? map : (cached?.map ?? EMPTY);
  } catch {
    return cached?.map ?? EMPTY;
  }
}

export function overlayDraftYears(
  rows: PlayerSeason[],
  draftById: Map<string, number>
): PlayerSeason[] {
  if (!draftById.size) return rows;
  return rows.map((row) => {
    const draftYear = draftById.get(row.playerId);
    return draftYear != null ? { ...row, draftYear } : row;
  });
}

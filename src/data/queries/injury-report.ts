import "server-only";

import { sharedGetOrSet } from "@/data/cache/shared-ttl-cache";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { parseInjuryFeed, rankInjuries, type InjuryEntry } from "@/lib/injury-report";
import { priorSeasonForStats } from "@/lib/player-board-season";

const FEED_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries";
const FEED_TIMEOUT_MS = 4500;
const CACHE_TTL_MS = 1000 * 60 * 15;
const CACHE_STALE_MS = 1000 * 60 * 60 * 6;
/** Games before the current season's scoring line replaces last season's. */
const MIN_GAMES = 10;

export type InjuryReport = { entries: InjuryEntry[]; fetchedAt: string };

async function scoringIndex(): Promise<(id: string) => { ppg: number; season: string } | null> {
  const { getBundledBrefPeerBoard } = await import("@/data/runtime/bref-advanced-snapshot");
  const season = canonicalSeasonFromStartYear(currentNbaStartYear());
  const prior = priorSeasonForStats(season);
  const index = (s: string) => {
    const map = new Map<string, { ppg: number; season: string; games: number }>();
    for (const row of getBundledBrefPeerBoard(s)) {
      if (row.gamesPlayed > 0) {
        map.set(row.playerId, { ppg: row.points / row.gamesPlayed, season: s, games: row.gamesPlayed });
      }
    }
    return map;
  };
  const current = index(season);
  const previous = prior !== season ? index(prior) : new Map();
  return (id) => {
    const now = current.get(id);
    if (now && now.games >= MIN_GAMES) return now;
    return previous.get(id) ?? null;
  };
}

/** Every listed player, biggest scorers first. */
export async function getInjuryReport(): Promise<InjuryReport> {
  return sharedGetOrSet("injury-report:v2", { ttlMs: CACHE_TTL_MS, staleMs: CACHE_STALE_MS }, async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FEED_TIMEOUT_MS);
    try {
      const res = await fetch(FEED_URL, { signal: ctrl.signal, next: { revalidate: 60 * 15 } } as RequestInit);
      if (!res.ok) throw new Error(`injury feed ${res.status}`);
      const entries = parseInjuryFeed(await res.json());
      const scoring = await scoringIndex().catch(() => () => null);
      for (const e of entries) {
        const s = scoring(e.athleteId);
        if (s) {
          e.ppg = s.ppg;
          e.ppgSeason = s.season;
        }
      }
      return { entries: rankInjuries(entries), fetchedAt: new Date().toISOString() };
    } finally {
      clearTimeout(timer);
    }
  });
}

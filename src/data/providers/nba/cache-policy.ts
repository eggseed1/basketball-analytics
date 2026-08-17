/**
 * Cache lifetimes for live NBA data.
 * Current-season entries use short fresh TTL + longer stale window (SWR).
 */
import { defaultCanonicalSeasons } from "./season";

export const CACHE_TTL_MS = {
  currentSeasonStats: 5 * 60 * 1000,
  /** Extra time to serve stale current-season data while refreshing. */
  currentSeasonStale: 30 * 60 * 1000,
  historicalSeasonStats: 12 * 60 * 60 * 1000,
  gameLog: 3 * 60 * 1000,
  games: 2 * 60 * 1000,
  shots: 10 * 60 * 1000,
  boxScore: 5 * 60 * 1000,
  brefCurrent: 15 * 60 * 1000,
  brefCurrentStale: 6 * 60 * 60 * 1000,
  brefHistorical: 24 * 60 * 60 * 1000,
  darkoCurrent: 15 * 60 * 1000,
  darkoCurrentStale: 6 * 60 * 60 * 1000,
  darkoHistorical: 24 * 60 * 60 * 1000,
  career: 30 * 60 * 1000,
} as const;

/** How often client pages call router.refresh() to pull fresh RSC data. */
export const CLIENT_REFRESH_MS = 5 * 60 * 1000;

/** Next.js segment revalidate window (seconds). */
export const PAGE_REVALIDATE_SECONDS = 60;

/** Max wait for Basketball-Reference on the critical path (ms). */
export const BREF_CRITICAL_PATH_BUDGET_MS = 1200;

/** Max wait for DARKO (darko.app) on the critical path (ms). */
export const DARKO_CRITICAL_PATH_BUDGET_MS = 1200;

export function currentCanonicalSeason(): string {
  return defaultCanonicalSeasons(1)[0];
}

export function isCurrentCanonicalSeason(season: string): boolean {
  return season === currentCanonicalSeason();
}

export function seasonStatsTtlMs(season: string): number {
  return isCurrentCanonicalSeason(season)
    ? CACHE_TTL_MS.currentSeasonStats
    : CACHE_TTL_MS.historicalSeasonStats;
}

/** Extra stale window after fresh TTL expires. */
export function seasonStatsStaleMs(season: string): number {
  return isCurrentCanonicalSeason(season)
    ? CACHE_TTL_MS.currentSeasonStale
    : 0;
}

export function brefTtlMs(season: string): number {
  return isCurrentCanonicalSeason(season)
    ? CACHE_TTL_MS.brefCurrent
    : CACHE_TTL_MS.brefHistorical;
}

export function brefStaleMs(season: string): number {
  return isCurrentCanonicalSeason(season)
    ? CACHE_TTL_MS.brefCurrentStale
    : 0;
}

export function darkoTtlMs(season: string): number {
  return isCurrentCanonicalSeason(season)
    ? CACHE_TTL_MS.darkoCurrent
    : CACHE_TTL_MS.darkoHistorical;
}

export function darkoStaleMs(season: string): number {
  return isCurrentCanonicalSeason(season)
    ? CACHE_TTL_MS.darkoCurrentStale
    : 0;
}

type CacheEntry<T> = {
  /** When the value is considered fresh. */
  freshUntil: number;
  /** When the value must be dropped entirely. */
  staleUntil: number;
  value: Promise<T>;
  refreshing?: boolean;
};

export interface TtlCacheOptions {
  /** Extra time to serve stale data while a background refresh runs. */
  staleMs?: number;
}

/**
 * In-process promise cache with TTL + stale-while-revalidate.
 * Expired-but-stale hits return immediately and refresh in the background.
 */
export class TtlPromiseCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();

  getOrSet(
    key: string,
    ttlMs: number,
    factory: () => Promise<T>,
    options: TtlCacheOptions = {}
  ): Promise<T> {
    const now = Date.now();
    const staleMs = options.staleMs ?? 0;
    const hit = this.store.get(key);

    if (hit && hit.freshUntil > now) {
      return hit.value;
    }

    if (hit && hit.staleUntil > now) {
      if (!hit.refreshing) {
        hit.refreshing = true;
        const refresh = factory()
          .then((resolved) => {
            this.store.set(key, {
              value: Promise.resolve(resolved),
              freshUntil: Date.now() + ttlMs,
              staleUntil: Date.now() + ttlMs + staleMs,
            });
            return resolved;
          })
          .catch(() => {
            // Keep serving the stale entry on refresh failure.
          })
          .finally(() => {
            const current = this.store.get(key);
            if (current) current.refreshing = false;
          });
        void refresh;
      }
      return hit.value;
    }

    const value = factory().catch((error) => {
      this.store.delete(key);
      throw error;
    });
    this.store.set(key, {
      value,
      freshUntil: now + ttlMs,
      staleUntil: now + ttlMs + staleMs,
    });
    return value;
  }

  /** Live (non-expired) promises currently in the cache. */
  liveValues(): Promise<T>[] {
    const now = Date.now();
    const out: Promise<T>[] = [];
    for (const entry of this.store.values()) {
      if (entry.staleUntil > now) out.push(entry.value);
    }
    return out;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * Shared client fetches for Comparisons panes.
 * Overview warms Impact / Trajectory early so flips and first paint stay snappy.
 */

import type { PercentileMetric } from "@/lib/player-percentile-metrics";
import type { StatComp } from "@/lib/player-stat-comps";
import {
  COMP_METRICS,
  type CompFutures,
  type CompFuturesBundle,
  type CompMetricId,
} from "@/lib/player-comp-futures-shared";

export type SimilarModesPayload = {
  metrics?: PercentileMetric[];
  profileComps?: StatComp[];
  profileHistoricalComps?: StatComp[];
};

const similarPending = new Map<string, Promise<SimilarModesPayload | null>>();
const similarReady = new Map<string, SimilarModesPayload | null>();
const futuresPending = new Map<string, Promise<CompFuturesBundle | null>>();
const futuresReady = new Map<string, CompFuturesBundle | null>();

function cacheKey(playerId: string, season: string, espnId?: string | null) {
  return `${playerId}|${season}|${espnId ?? ""}`;
}

export function peekSimilarModes(options: {
  playerId: string;
  season: string;
  espnId?: string | null;
}): SimilarModesPayload | null | undefined {
  const key = cacheKey(options.playerId, options.season, options.espnId);
  if (!similarReady.has(key)) return undefined;
  return similarReady.get(key) ?? null;
}

export function peekCompFuturesBundle(options: {
  playerId: string;
  season: string;
  espnId?: string | null;
}): CompFuturesBundle | null | undefined {
  const key = cacheKey(options.playerId, options.season, options.espnId);
  if (!futuresReady.has(key)) return undefined;
  return futuresReady.get(key) ?? null;
}

export function fetchSimilarModes(options: {
  playerId: string;
  season: string;
  espnId?: string | null;
}): Promise<SimilarModesPayload | null> {
  const key = cacheKey(options.playerId, options.season, options.espnId);
  if (similarReady.has(key)) {
    return Promise.resolve(similarReady.get(key) ?? null);
  }
  const hit = similarPending.get(key);
  if (hit) return hit;

  const pending = (async () => {
    const load = async (mode: "fast" | "full") => {
      const params = new URLSearchParams({
        season: options.season,
        mode,
        comps: "1",
      });
      if (options.espnId) params.set("espnId", options.espnId);
      const res = await fetch(
        `/api/players/${encodeURIComponent(options.playerId)}/percentiles?${params}`
      );
      if (!res.ok) return null;
      return (await res.json()) as SimilarModesPayload;
    };

    const hasComps = (body: SimilarModesPayload | null) => {
      if (!body) return false;
      if ((body.profileComps?.length ?? 0) > 0) return true;
      if ((body.profileHistoricalComps?.length ?? 0) > 0) return true;
      return (body.metrics ?? []).some(
        (m) =>
          (m.leagueComps?.length ?? 0) > 0 ||
          (m.historicalComps?.length ?? 0) > 0
      );
    };

    try {
      let body = await load("fast");
      // Empty fast board (thin peers / light path) — one full retry.
      if (!hasComps(body)) {
        const full = await load("full");
        if (hasComps(full)) body = full;
      }
      similarReady.set(key, body);
      return body;
    } catch {
      similarReady.set(key, null);
      return null;
    } finally {
      similarPending.delete(key);
    }
  })();

  similarPending.set(key, pending);
  return pending;
}

export function seedCompFuturesBundle(
  options: {
    playerId: string;
    season: string;
    espnId?: string | null;
  },
  bundle: CompFuturesBundle | null
) {
  const key = cacheKey(options.playerId, options.season, options.espnId);
  futuresReady.set(key, bundle);
  futuresPending.delete(key);
}

export function fetchCompFuturesBundle(options: {
  playerId: string;
  season: string;
  espnId?: string | null;
}): Promise<CompFuturesBundle | null> {
  const key = cacheKey(options.playerId, options.season, options.espnId);
  if (futuresReady.has(key)) {
    return Promise.resolve(futuresReady.get(key) ?? null);
  }
  const hit = futuresPending.get(key);
  if (hit) return hit;

  const pending = (async () => {
    // One round trip: server picks the first available metric (primaryOnly).
    // The old path probed COMP_METRICS sequentially and often burned 2–3
    // failed requests before DARKO on early-season boards.
    const params = new URLSearchParams({
      season: options.season,
      primary: "1",
    });
    if (options.espnId) params.set("espnId", options.espnId);
    try {
      const res = await fetch(
        `/api/players/${encodeURIComponent(options.playerId)}/comp-futures?${params}`
      );
      if (!res.ok) return null;
      const body = (await res.json()) as {
        bundle?: CompFuturesBundle;
        item?: CompFutures;
      };
      if (body.bundle?.items?.length) return body.bundle;
      if (!body.item) return null;
      return {
        defaultId: body.item.metricId,
        items: [body.item],
        availableMetrics: COMP_METRICS.map((m) => ({
          id: m.id as CompMetricId,
          label: m.label,
        })),
      } satisfies CompFuturesBundle;
    } catch {
      return null;
    }
  })().then((body) => {
    futuresReady.set(key, body);
    futuresPending.delete(key);
    return body;
  });

  futuresPending.set(key, pending);
  return pending;
}

/** Warm Impact + Trajectory data (call when Comparisons is near the viewport). */
export function warmComparisonsFetches(options: {
  playerId: string;
  season: string;
  espnId?: string | null;
  /** Skip Trajectory when SSR already seeded the cache. */
  skipTrajectory?: boolean;
}) {
  if (!options.skipTrajectory) {
    void fetchCompFuturesBundle(options);
  }
  void fetchSimilarModes(options);
}

"use client";

import { useEffect, useState } from "react";

import { PlayerCompFuturesChartLazy as PlayerCompFuturesChart } from "@/components/charts/recharts-lazy";
import { SectionFrame } from "@/components/layout/section-frame";
import {
  COMP_METRICS,
  type CompFutures,
  type CompFuturesBundle,
  type CompMetricId,
} from "@/lib/player-comp-futures-shared";
import type { PlayerSeason } from "@/data/types";

/**
 * Client-fetched comps/futures. SSR used to call getBundledCompPool inside the
 * player HTML path and tip Workers over the 128MB limit (exceededMemory).
 */
export function PlayerCompFuturesPanel({
  focal,
  teamKey,
  espnId,
}: {
  focal: PlayerSeason | null;
  /** Kept for call-site compatibility; pool load no longer needs career SSR. */
  career?: PlayerSeason[];
  teamKey?: string | null;
  espnId?: string | null;
}) {
  const [bundle, setBundle] = useState<CompFuturesBundle | null>(null);
  const [failed, setFailed] = useState(false);
  const playerId = focal?.playerId;
  const season = focal?.season;

  useEffect(() => {
    if (!playerId || !season) {
      setBundle(null);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setBundle(null);
    setFailed(false);

    (async () => {
      const params = new URLSearchParams({ season });
      if (espnId) params.set("espnId", espnId);
      for (const metric of COMP_METRICS) {
        params.set("metric", metric.id);
        try {
          const res = await fetch(
            `/api/players/${encodeURIComponent(playerId)}/comp-futures?${params}`
          );
          if (!res.ok) continue;
          const body = (await res.json()) as { item?: CompFutures };
          if (!body.item || cancelled) return;
          setBundle({
            defaultId: body.item.metricId,
            items: [body.item],
            availableMetrics: COMP_METRICS.map((m) => ({
              id: m.id as CompMetricId,
              label: m.label,
            })),
          });
          return;
        } catch {
          // try next metric
        }
      }
      if (!cancelled) setFailed(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [espnId, playerId, season]);

  if (!playerId || !season) return null;
  if (failed) return null;

  if (!bundle) {
    return (
      <SectionFrame
        id="comps-futures"
        density="supporting"
        title="Comps and futures"
        description="Loading same-age comps…"
      >
        <div className="loading-shimmer h-56 w-full rounded-lg" aria-hidden />
      </SectionFrame>
    );
  }

  const first =
    bundle.items.find((item) => item.metricId === bundle.defaultId) ??
    bundle.items[0]!;

  return (
    <SectionFrame
      id="comps-futures"
      density="supporting"
      title="Comps and futures"
      description={`${first.focalName}'s line runs through ${first.focalSeason}. After that age, each faint line is a comp's actual rating. The dashed line starts on his mark and follows the weighted median of how those comps changed.`}
    >
      <PlayerCompFuturesChart
        bundle={bundle}
        teamKey={teamKey ?? focal?.teamId}
        playerId={playerId}
        season={season}
        espnId={espnId}
      />
    </SectionFrame>
  );
}

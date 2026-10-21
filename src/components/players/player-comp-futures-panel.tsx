"use client";

import { useEffect, useState } from "react";

import {
  PlayerCompFuturesChartLazy as PlayerCompFuturesChart,
  preloadPlayerPageCharts,
} from "@/components/charts/recharts-lazy";
import { SectionFrame } from "@/components/layout/section-frame";
import {
  fetchCompFuturesBundle,
  peekCompFuturesBundle,
  seedCompFuturesBundle,
} from "@/lib/player-comparisons-fetch";
import type { CompFuturesBundle } from "@/lib/player-comp-futures-shared";
import type { PlayerSeason } from "@/data/types";

/**
 * Client-fetched comps/futures. Shared cache lets Comparisons warm Trajectory
 * while Style is on screen, so the first flip can paint ready. SSR can pass
 * `initialBundle` so the default metric paints with the page.
 */
export function PlayerCompFuturesPanel({
  focal,
  playerId: playerIdProp,
  season: seasonProp,
  teamKey,
  espnId,
  initialBundle = null,
  embedded = false,
}: {
  focal?: PlayerSeason | null;
  playerId?: string;
  season?: string;
  career?: PlayerSeason[];
  teamKey?: string | null;
  espnId?: string | null;
  initialBundle?: CompFuturesBundle | null;
  embedded?: boolean;
}) {
  const playerId = playerIdProp ?? focal?.playerId;
  const season = seasonProp ?? focal?.season;

  const [bundle, setBundle] = useState<CompFuturesBundle | null>(() => {
    if (!playerId || !season) return null;
    if (initialBundle) return initialBundle;
    const peeked = peekCompFuturesBundle({ playerId, season, espnId });
    return peeked === undefined ? null : peeked;
  });
  const [failed, setFailed] = useState(() => {
    if (!playerId || !season) return false;
    if (initialBundle) return false;
    return peekCompFuturesBundle({ playerId, season, espnId }) === null;
  });

  useEffect(() => {
    preloadPlayerPageCharts();
  }, []);

  useEffect(() => {
    if (!playerId || !season) {
      setBundle(null);
      setFailed(false);
      return;
    }
    if (initialBundle) {
      seedCompFuturesBundle({ playerId, season, espnId }, initialBundle);
      setBundle(initialBundle);
      setFailed(false);
      return;
    }
    let cancelled = false;
    const peeked = peekCompFuturesBundle({ playerId, season, espnId });
    if (peeked !== undefined) {
      setBundle(peeked);
      setFailed(peeked == null);
      return;
    }
    setBundle(null);
    setFailed(false);
    void fetchCompFuturesBundle({ playerId, season, espnId }).then((next) => {
      if (cancelled) return;
      if (!next) setFailed(true);
      else setBundle(next);
    });
    return () => {
      cancelled = true;
    };
  }, [espnId, initialBundle, playerId, season]);

  if (!playerId || !season) {
    if (embedded) {
      return (
        <p className="text-[13px] text-muted-foreground">
          Trajectory comps need a season with minutes.
        </p>
      );
    }
    return null;
  }
  if (failed) {
    if (embedded) {
      return (
        <p className="text-[13px] text-muted-foreground">
          No same-age trajectory comps for {season}.
        </p>
      );
    }
    return null;
  }

  if (!bundle) {
    if (embedded) {
      return (
        <div
          data-skeleton
          className="loading-shimmer h-56 w-full rounded-lg"
          aria-hidden
        />
      );
    }
    return (
      <SectionFrame
        id="comps-futures"
        density="supporting"
        title="Comps and futures"
        description="Loading same-age comps…"
      >
        <div
          data-skeleton
          className="loading-shimmer h-56 w-full rounded-lg"
          aria-hidden
        />
      </SectionFrame>
    );
  }

  const first =
    bundle.items.find((item) => item.metricId === bundle.defaultId) ??
    bundle.items[0]!;
  const chart = (
    <PlayerCompFuturesChart
      bundle={bundle}
      teamKey={teamKey ?? focal?.teamId}
      playerId={playerId}
      season={season}
      espnId={espnId}
      compact={embedded}
    />
  );

  if (embedded) {
    return <div className="flex flex-col gap-2">{chart}</div>;
  }

  return (
    <SectionFrame
      id="comps-futures"
      density="supporting"
      title="Comps and futures"
      description={`${first.focalName} · age ${first.focalAge} · ${first.metricLabel} ranks ${first.rank} of ${first.poolSize} same-age seasons.`}
    >
      {chart}
    </SectionFrame>
  );
}

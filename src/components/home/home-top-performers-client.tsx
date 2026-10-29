"use client";

import { useEffect, useState } from "react";

import {
  LoadingStatus,
  SkeletonBlock,
} from "@/components/continuity/destination-loading-frame";
import { LoadingPhrase } from "@/components/continuity/loading-phrase";
import { TopPerformersPanel } from "@/components/home/top-performers-panel";
import type { HomeDarkoLeader, HomeRaptorLeader } from "@/data/queries/home";
import type { HomePerformersPayload } from "@/lib/home-performers-slim";
import { initialLoadingPhrase } from "@/lib/loading-phrases";

/**
 * Top Performers desk module — client fetch so leader rows stay out of first HTML.
 */
export function HomeTopPerformersClient() {
  const [data, setData] = useState<HomePerformersPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/home/performers", { signal: ac.signal });
        if (!res.ok) throw new Error(`performers ${res.status}`);
        const json = (await res.json()) as HomePerformersPayload;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData(null);
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, []);

  if (!data) {
    return (
      <div
        className="sports-card flex h-72 flex-col gap-3 p-4"
        aria-busy="true"
        aria-live="polite"
        aria-label={initialLoadingPhrase("home")}
      >
        <LoadingStatus>
          <LoadingPhrase context="home" />
        </LoadingStatus>
        <div aria-hidden className="flex flex-1 flex-col gap-2">
          <SkeletonBlock className="h-8 w-40 rounded-md" />
          <SkeletonBlock className="min-h-0 flex-1 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <TopPerformersPanel
      season={data.season}
      drblLeaders={data.drblLeaders}
      darkoLeaders={data.darkoLeaders as HomeDarkoLeader[]}
      raptorLeaders={data.raptorLeaders as HomeRaptorLeader[]}
      tsLeaders={data.tsLeaders}
      usageStars={data.usageStars}
      drblOverlayOk={data.drblOverlayOk}
      drblFallbackNote={data.drblFallbackNote}
    />
  );
}

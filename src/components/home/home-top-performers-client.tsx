"use client";

import { useEffect, useState } from "react";

import { TopPerformersPanel } from "@/components/home/top-performers-panel";
import type { HomeDarkoLeader, HomeRaptorLeader } from "@/data/queries/home";
import type { HomePerformersPayload } from "@/lib/home-performers-slim";

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
        className="sports-card h-72 animate-pulse p-4"
        aria-busy="true"
        aria-label="Loading top performers"
      />
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

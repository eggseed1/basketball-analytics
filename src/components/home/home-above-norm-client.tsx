"use client";

import { useEffect, useState } from "react";

import { AboveNormPanel } from "@/components/home/above-norm-panel";
import type { RecentInsight } from "@/lib/recent-insights";

/**
 * Above-their-norm sidebar — shares /api/home/insights with findings.
 */
export function HomeAboveNormClient() {
  const [nights, setNights] = useState<RecentInsight[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/home/insights", { signal: ac.signal });
        if (!res.ok) throw new Error(`insights ${res.status}`);
        const json = (await res.json()) as { aboveNorm?: RecentInsight[] };
        if (!cancelled) setNights(json.aboveNorm ?? []);
      } catch {
        if (!cancelled) setNights([]);
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, []);

  if (nights == null) {
    return (
      <div
        className="sports-card h-48 animate-pulse p-4"
        aria-busy="true"
        aria-label="Loading above their norm"
      />
    );
  }

  return <AboveNormPanel nights={nights} />;
}

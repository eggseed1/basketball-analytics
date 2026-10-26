"use client";

import { useEffect, useState } from "react";

import { AboveNormPanel } from "@/components/home/above-norm-panel";
import { fetchHomeInsightsPayload } from "@/lib/home-insights-client";
import type { RecentInsight } from "@/lib/recent-insights";

/**
 * Above-their-norm sidebar — paint bundled nights first, soft-refresh after.
 * Shares the insights fetch with HomeFindingsClient.
 */
export function HomeAboveNormClient({
  initial,
}: {
  initial: RecentInsight[];
}) {
  const [nights, setNights] = useState<RecentInsight[]>(initial);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await fetchHomeInsightsPayload();
        if (!cancelled) setNights(json.aboveNorm);
      } catch {
        /* keep initial */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <AboveNormPanel nights={nights} />;
}

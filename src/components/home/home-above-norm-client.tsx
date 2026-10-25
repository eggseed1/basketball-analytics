"use client";

import { useEffect, useState } from "react";

import { AboveNormPanel } from "@/components/home/above-norm-panel";
import type { RecentInsight } from "@/lib/recent-insights";

/**
 * Above-their-norm sidebar — paint bundled nights first, soft-refresh after.
 */
export function HomeAboveNormClient({
  initial,
}: {
  initial: RecentInsight[];
}) {
  const [nights, setNights] = useState<RecentInsight[]>(initial);

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
        /* keep initial */
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, []);

  return <AboveNormPanel nights={nights} />;
}

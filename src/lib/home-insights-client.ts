/**
 * Shared client fetch for `/api/home/insights` so findings + above-norm
 * share one round trip on the homepage.
 */

import type { RecentInsight } from "@/lib/recent-insights";

export type HomeInsightsPayload = {
  insights: RecentInsight[];
  aboveNorm: RecentInsight[];
  empty: boolean;
};

let inflight: Promise<HomeInsightsPayload> | null = null;

export function fetchHomeInsightsPayload(): Promise<HomeInsightsPayload> {
  if (!inflight) {
    inflight = (async () => {
      const res = await fetch("/api/home/insights");
      if (!res.ok) throw new Error(`insights ${res.status}`);
      const json = (await res.json()) as {
        insights?: RecentInsight[];
        aboveNorm?: RecentInsight[];
        empty?: boolean;
      };
      return {
        insights: json.insights ?? [],
        aboveNorm: json.aboveNorm ?? [],
        empty: Boolean(json.empty),
      };
    })().finally(() => {
      // Drop after settle so a later soft-refresh can re-fetch.
      inflight = null;
    });
  }
  return inflight;
}

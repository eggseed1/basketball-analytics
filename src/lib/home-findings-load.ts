import "server-only";

import { cache } from "react";

import {
  getBundledAboveNorm,
  getBundledRecentInsights,
  recentInsightsSnapshotMeta,
} from "@/data/runtime/recent-insights-snapshot";
import type { RecentInsight } from "@/lib/recent-insights";

export type HomeInsightsDesk = {
  insights: RecentInsight[];
  aboveNorm: RecentInsight[];
  empty: boolean;
  source: "bundled";
  generatedAt: string | null;
};

/**
 * Recent Insights + above-norm for the homepage desk.
 * Full card payloads (moments, period bars, lead worms, trends) stay intact so
 * InsightCard can render the same charts as /findings.
 * Prepared snapshot only — never runs live analysis on the request path.
 * Cached per request so findings + above-norm share one load.
 */
export const loadHomeInsightsDesk = cache(async (): Promise<HomeInsightsDesk> => {
  const meta = recentInsightsSnapshotMeta();
  const insights = getBundledRecentInsights();
  const aboveNorm = getBundledAboveNorm();
  return {
    insights,
    aboveNorm,
    empty: insights.length === 0,
    source: "bundled",
    generatedAt: meta.generatedAt,
  };
});

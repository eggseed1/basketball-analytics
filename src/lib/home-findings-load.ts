import "server-only";

import { cache } from "react";

import {
  getBundledAboveNorm,
  getBundledRecentInsights,
  recentInsightsSnapshotMeta,
} from "@/data/runtime/recent-insights-snapshot";
import { projectHomeFindings } from "@/lib/home-findings-project";
import { stripInsightFlowsForHome } from "@/lib/home-insights-slim";
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
 * Prepared snapshot only — never runs live analysis on the request path.
 * Cached per request so findings + above-norm share one load.
 * Live refresh stays on `/api/home/insights` and the nightly bake.
 */
export const loadHomeInsightsDesk = cache(async (): Promise<HomeInsightsDesk> => {
  const meta = recentInsightsSnapshotMeta();
  const insights = projectHomeFindings(
    stripInsightFlowsForHome(getBundledRecentInsights())
  );
  const aboveNorm = projectHomeFindings(getBundledAboveNorm());
  return {
    insights,
    aboveNorm,
    empty: insights.length === 0,
    source: "bundled",
    generatedAt: meta.generatedAt,
  };
});

import snapshot from "./recent-insights-snapshot.json";

import type { RecentInsight } from "@/lib/recent-insights";

type SnapshotFile = {
  version?: number;
  generatedAt?: string | null;
  season?: string;
  slateDates?: string[];
  insights?: RecentInsight[];
  aboveNorm?: RecentInsight[];
};

const data = snapshot as SnapshotFile;

export function recentInsightsSnapshotMeta() {
  return {
    version: data.version ?? 0,
    generatedAt: data.generatedAt ?? null,
    season: data.season ?? null,
    slateDates: data.slateDates ?? [],
    count: Array.isArray(data.insights) ? data.insights.length : 0,
  };
}

/** Baked homepage Recent Insights cards (completed games). */
export function getBundledRecentInsights(): RecentInsight[] {
  return Array.isArray(data.insights) ? data.insights : [];
}

/** Baked sidebar "above their norm" nights; older snapshots kept them among the cards. */
export function getBundledAboveNorm(): RecentInsight[] {
  if (Array.isArray(data.aboveNorm)) return data.aboveNorm;
  return getBundledRecentInsights().filter((x) => x.focus === "surprise");
}

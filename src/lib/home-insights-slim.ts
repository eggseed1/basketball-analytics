import type { RecentInsight } from "@/lib/recent-insights";

/**
 * @deprecated Homepage and /api/home/insights keep scoring-flow charts.
 * Identity kept so older imports do not strip visuals.
 */
export function stripInsightFlowsForHome(
  insights: RecentInsight[]
): RecentInsight[] {
  return insights;
}

import type { RecentInsight } from "@/lib/recent-insights";

/**
 * Drop scoring-flow polylines from homepage insight cards. The margin worm is
 * the heavy SVG in Flight; period bars and other marks still render. Full flow
 * charts remain on /findings.
 */
export function stripInsightFlowsForHome(
  insights: RecentInsight[]
): RecentInsight[] {
  return insights.map((insight) => {
    if (!insight.game?.flow) return insight;
    const { flow: _flow, ...game } = insight.game;
    return { ...insight, game };
  });
}

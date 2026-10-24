import type { RecentInsight } from "@/lib/recent-insights";

/**
 * @deprecated Homepage cards keep full chart payloads again.
 * Left as an identity so older call sites do not strip visuals.
 */
export function projectHomeFindings(
  insights: RecentInsight[]
): RecentInsight[] {
  return insights;
}

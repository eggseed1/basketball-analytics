import "server-only";

import archive from "@/data/runtime/findings-archive.json";
import { getBundledRecentInsights } from "@/data/runtime/recent-insights-snapshot";
import type { FindingsArchive } from "@/lib/findings-archive";
import type { RecentInsight } from "@/lib/recent-insights";

function byId(insights: RecentInsight[] | undefined, id: string): RecentInsight | null {
  return insights?.find((insight) => insight.id === id) ?? null;
}

/** The card the home grid is showing, then older nights, then the saved copy. */
export async function loadFinding(id: string): Promise<RecentInsight | null> {
  const decoded = decodeURIComponent(id);
  const saved =
    (archive as FindingsArchive).findings.find((finding) => finding.id === decoded) ?? null;
  const bundled = byId(getBundledRecentInsights(), decoded);
  try {
    const { getLiveRecentInsights, getRecentInsightDays } = await import(
      "@/data/queries/recent-insights-live"
    );
    const [home, days] = await Promise.all([
      getLiveRecentInsights().catch(() => null),
      getRecentInsightDays().catch(() => null),
    ]);
    const live =
      byId(home?.insights, decoded) ??
      byId(
        days?.days.flatMap((day) => day.insights),
        decoded
      );
    if (live) return live;
  } catch {
    // The saved copy still opens.
  }
  return saved ?? bundled;
}

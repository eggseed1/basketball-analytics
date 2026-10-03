import Link from "next/link";

import { StatDetectiveDivergenceLazy } from "@/components/charts/recharts-lazy";
import { StatDetectiveLists } from "@/components/explore/stat-detective-panel";
import { PageHeader } from "@/components/layout/page-header";
import { MoreInfo } from "@/components/ui/more-info";
import {
  STAT_DETECTIVE_METRICS,
  isStatDetectiveMetricId,
} from "@/analytics/stat-detective-windows";
import { type } from "@/lib/design-system";
import {
  isStatWindowId,
  statDetectiveSeason,
  statDetectiveWindow,
  statDetectiveWindows,
} from "@/data/runtime/stat-detective-windows";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Stat Detective",
  description:
    "Find NBA players whose recent points, true shooting, or rebounds are way up or way down compared with their own usual rate (not the league's).",
};

const METRIC_ORDER = ["ppg", "ts", "rpg"] as const;

export default async function StatDetectivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawWindow = Array.isArray(params.window)
    ? params.window[0]
    : params.window;
  const rawMetric = Array.isArray(params.metric)
    ? params.metric[0]
    : params.metric;
  const metric = isStatDetectiveMetricId(rawMetric) ? rawMetric : "ppg";
  const windows = statDetectiveWindows(metric);
  const active = statDetectiveWindow(
    isStatWindowId(rawWindow) ? rawWindow : "last5",
    metric
  );
  const season = statDetectiveSeason();
  const metricMeta = STAT_DETECTIVE_METRICS[metric];

  return (
    <main className="site-shell flex flex-col gap-6 py-6 sm:py-8">
      <PageHeader
        eyebrow="Players"
        title="Stat Detective"
        subtitle={
          season
            ? `Who's way above or below their own usual ${metricMeta.shortLabel} in ${season}? Compared to each player's baseline, not the league.`
            : "No baked game logs for a window comparison yet."
        }
      />

      <div
        role="tablist"
        aria-label="Stat metric"
        className="flex flex-wrap gap-2"
      >
        {METRIC_ORDER.map((id) => {
          const selected = id === metric;
          const meta = STAT_DETECTIVE_METRICS[id];
          return (
            <Link
              key={id}
              href={`/explore/players/windows?window=${active.id}&metric=${id}`}
              role="tab"
              aria-selected={selected}
              className={cn(
                type.caption,
                "rounded-md border px-3 py-1.5 font-semibold transition-colors",
                selected
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              )}
            >
              {meta.label}
            </Link>
          );
        })}
      </div>

      <div
        role="tablist"
        aria-label="Comparison window"
        className="grid gap-2 sm:grid-cols-3"
      >
        {windows.map((window) => {
          const selected = window.id === active.id;
          return (
            <Link
              key={window.id}
              href={`/explore/players/windows?window=${window.id}&metric=${metric}`}
              role="tab"
              aria-selected={selected}
              className={cn(
                "rounded-lg border px-3 py-3 transition-colors",
                selected
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-foreground hover:border-foreground/40"
              )}
            >
              <p className={cn(type.bodySm, "font-semibold")}>
                {window.question}
              </p>
              <p
                className={cn(
                  type.caption,
                  "mt-1",
                  selected ? "text-background/75" : "text-muted-foreground"
                )}
              >
                {window.label}
              </p>
            </Link>
          );
        })}
      </div>

      <section className="sports-card flex flex-col gap-6 p-4 sm:p-5">
        <div>
          <h2 className={type.heading}>{active.question}</h2>
          <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
            {active.note} {metricMeta.honesty}
          </p>
          {season ? (
            <MoreInfo className="mt-1.5">
              <p>
                Needs 20 games and 18 mpg on both sides of the comparison in {season}. Playoffs
                are left out, and players with thin samples stay off the board.
              </p>
            </MoreInfo>
          ) : null}
        </div>

        <StatDetectiveDivergenceLazy
          risers={active.risers}
          fallers={active.fallers}
          metric={metric}
        />

        <StatDetectiveLists
          risers={active.risers}
          fallers={active.fallers}
          baselineLabel={active.baselineLabel}
          windowLabel={active.windowLabel}
          metric={metric}
        />
      </section>
    </main>
  );
}

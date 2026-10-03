import { HotColdColumns } from "@/components/explore/hot-cold-board";
import { PageHeader } from "@/components/layout/page-header";
import { SegmentedLinks } from "@/components/ui/segmented-links";
import {
  STAT_DETECTIVE_METRICS,
  isStatDetectiveMetricId,
} from "@/analytics/stat-detective-windows";
import {
  isStatWindowId,
  statDetectiveSeason,
  statDetectiveThroughDate,
  statDetectiveWindow,
  statDetectiveWindows,
} from "@/data/runtime/stat-detective-windows";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Hot & Cold",
  description:
    "NBA players running well above or below their own usual points, true shooting, or rebounds over a recent stretch of games. Each player is measured against himself, not the league.",
};

const METRIC_ORDER = ["ppg", "ts", "rpg"] as const;
const BASE_PATH = "/explore/players/hot-cold";

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function HotColdPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawWindow = one(params.window);
  const rawMetric = one(params.metric);
  const metric = isStatDetectiveMetricId(rawMetric) ? rawMetric : "ppg";
  const windows = statDetectiveWindows(metric);
  const active = statDetectiveWindow(isStatWindowId(rawWindow) ? rawWindow : "last5", metric);
  const season = statDetectiveSeason();
  const throughDate = statDetectiveThroughDate();
  const metricMeta = STAT_DETECTIVE_METRICS[metric];
  const href = (window: string, nextMetric: string) =>
    `${BASE_PATH}?window=${window}&metric=${nextMetric}`;

  return (
    <main className="site-shell flex flex-col gap-6 py-6 sm:py-8">
      <PageHeader
        eyebrow={season ? `Players · ${season}` : "Players"}
        title="Hot & Cold"
        subtitle={
          season
            ? "Players running well above or below their own usual numbers over a recent stretch of games. Each player is measured against himself, not the league."
            : "No game logs are loaded for a comparison yet."
        }
        meta={
          season ? (
            <span>
              {season} regular season
              {throughDate ? `, games through ${formatDate(throughDate)}` : ""}
            </span>
          ) : null
        }
        about={
          season ? (
            <p>
              Players need 20 games and 18 minutes a game on both sides of the comparison.
              Playoffs are left out, and players with thin samples stay off the board.{" "}
              {metricMeta.honesty}
            </p>
          ) : null
        }
        aboutLabel="How this works"
      />

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedLinks
          label="Stat"
          value={metric}
          options={METRIC_ORDER.map((id) => ({
            id,
            label: STAT_DETECTIVE_METRICS[id].label,
            href: href(active.id, id),
          }))}
        />
        <SegmentedLinks
          label="Games compared"
          value={active.id}
          options={windows.map((window) => ({
            id: window.id,
            label: window.label,
            href: href(window.id, metric),
          }))}
        />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className={cn(type.bodySm, "font-bold")}>{active.question}</h2>
          <p className={cn(type.caption, "text-muted-foreground")}>
            {active.note} Rows read {active.baselineLabel.toLowerCase()} →{" "}
            {active.windowLabel.toLowerCase()}.
          </p>
        </div>
        <div className="sports-card p-4 sm:p-5">
          <HotColdColumns risers={active.risers} fallers={active.fallers} metric={metric} />
        </div>
      </section>
    </main>
  );
}

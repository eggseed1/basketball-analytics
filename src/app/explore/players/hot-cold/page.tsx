import { getLocale, getTranslations } from "next-intl/server";
import { MotionReveal } from "@/components/continuity/motion-reveal";
import { HotColdColumns } from "@/components/explore/hot-cold-board";
import { PageHeader } from "@/components/layout/page-header";
import { SegmentedLinks } from "@/components/ui/segmented-links";
import { formatGameCalendarDate } from "@/i18n/format-date";
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
  alternates: { canonical: "/explore/players/hot-cold" },
  title: "NBA hot and cold streaks",
  description:
    "DRBL tracks NBA players running above or below their own usual points, true shooting, or rebounds over a recent stretch. Each player is measured against himself, not the league.",
};

const METRIC_ORDER = ["ppg", "ts", "rpg"] as const;
const BASE_PATH = "/explore/players/hot-cold";

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(iso: string, locale: string): string {
  return formatGameCalendarDate(iso, locale, "monthDayYear") ?? iso;
}

export default async function HotColdPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("Explore");
  const locale = await getLocale();
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
    <main data-motion-page className="site-shell flex flex-col gap-6 py-6 sm:py-8">
      <MotionReveal />
      <PageHeader
        title={t("hotColdTitle")}
        subtitle={season ? t("hotColdSubtitle") : t("hotColdEmpty")}
        meta={
          season ? (
            <span className={cn(type.bodySm, "text-foreground")}>
              {throughDate
                ? t("hotColdMetaThrough", {
                    season,
                    date: formatDate(throughDate, locale),
                  })
                : t("hotColdMeta", { season })}
            </span>
          ) : null
        }
        about={
          season ? (
            <p>
              {t("hotColdAbout")}{" "}
              {metricMeta.honesty}
            </p>
          ) : null
        }
        aboutLabel={t("howThisWorks")}
      />

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedLinks
          label={t("statLabel")}
          value={metric}
          options={METRIC_ORDER.map((id) => ({
            id,
            label: STAT_DETECTIVE_METRICS[id].label,
            href: href(active.id, id),
          }))}
        />
        <SegmentedLinks
          label={t("gamesCompared")}
          value={active.id}
          options={windows.map((window) => ({
            id: window.id,
            label: window.label,
            href: href(window.id, metric),
          }))}
        />
      </div>

      <section className="flex flex-col gap-3">
        <div className="sports-card p-4 sm:p-5">
          <HotColdColumns risers={active.risers} fallers={active.fallers} metric={metric} />
        </div>
      </section>
    </main>
  );
}

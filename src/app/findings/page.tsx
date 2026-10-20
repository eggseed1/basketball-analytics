import { getTranslations } from "next-intl/server";

import { MotionReveal } from "@/components/continuity/motion-reveal";
import { FindingsArchiveView, type FindingsNight } from "@/components/home/findings-archive-view";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import archive from "@/data/runtime/findings-archive.json";
import { groupFindingsByDate, type FindingsArchive } from "@/lib/findings-archive";

export async function generateMetadata() {
  const t = await getTranslations("Findings");
  return {
    title: t("title"),
    description: t("metaDescription"),
    alternates: {
      canonical: "/findings",
      types: { "application/rss+xml": [{ url: "/findings/feed.xml", title: t("rssTitle") }] },
    },
  };
}

type Day = FindingsNight;

export default async function FindingsPage() {
  const t = await getTranslations("Findings");
  const saved = groupFindingsByDate((archive as FindingsArchive).findings);
  const days: Day[] = saved.map((group) => ({
    date: group.date,
    preseason: group.findings[0]?.preseason ?? false,
    season: group.findings[0]?.season ?? "",
    insights: group.findings,
  }));

  try {
    const { getRecentInsightDays } = await import("@/data/queries/recent-insights-live");
    const live = await getRecentInsightDays();
    if (live) {
      const seen = new Set(live.days.map((d) => d.date));
      const older = days.filter((d) => !seen.has(d.date));
      days.splice(
        0,
        days.length,
        ...live.days.map((d) => ({
          date: d.date,
          preseason: live.preseason,
          season: live.season,
          insights: d.insights,
        })),
        ...older
      );
    }
  } catch {
    // The saved nights still render.
  }

  return (
    <main data-motion-page className="site-shell flex flex-col gap-6 py-6 sm:py-8">
      <MotionReveal />
      <PageHeader
        title={t("title")}
        actions={
          <a href="/findings/feed.xml" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            {t("rssFeed")}
          </a>
        }
      />
      {days.length ? (
        <FindingsArchiveView days={days} />
      ) : (
        <p className="type-body-sm text-muted-foreground">
          {t("empty")}
        </p>
      )}
    </main>
  );
}

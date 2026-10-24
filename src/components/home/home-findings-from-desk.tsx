"use client";

import { useTranslations } from "next-intl";

import {
  InsightCard,
  orderByHeight,
} from "@/components/home/findings-section";
import { SectionLink } from "@/components/ui/section-link";
import type { RecentInsight } from "@/lib/recent-insights";

function todayIsoDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());
}

/**
 * Homepage Recent Insights with chart cards, fed from the SSR desk snapshot.
 */
export function HomeFindingsFromDesk({
  insights,
  empty = false,
}: {
  insights: RecentInsight[];
  empty?: boolean;
}) {
  const t = useTranslations("Home");
  const tCommon = useTranslations("Common");
  const stories = insights.filter((x) => x.focus !== "surprise");
  const even =
    stories.length > 1 && stories.length % 2 ? stories.slice(0, -1) : stories;
  const cards = orderByHeight(even, 2);
  const asOf = todayIsoDate();

  return (
    <section className="sports-card flex flex-col gap-3 p-4 sm:p-[21px]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="type-heading">{t("recentInsights")}</h2>
        <SectionLink href="/findings">{tCommon("seeAll")}</SectionLink>
      </div>
      {empty ? (
        <p className="type-caption text-muted-foreground">{t("insightsEmpty")}</p>
      ) : null}
      {cards.length ? (
        <div
          data-motion-list
          className="grid min-w-0 items-stretch gap-4 sm:grid-cols-2"
        >
          {cards.map((insight) => (
            <InsightCard key={insight.id} insight={insight} asOf={asOf} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

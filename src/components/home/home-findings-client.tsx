"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import {
  InsightCard,
  orderByHeight,
} from "@/components/home/findings-section";
import { SectionLink } from "@/components/ui/section-link";
import type { RecentInsight } from "@/lib/recent-insights";

type Payload = {
  insights: RecentInsight[];
  empty: boolean;
};

function todayIsoDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());
}

function pairByHeight(items: RecentInsight[]): RecentInsight[] {
  return orderByHeight(items, 2);
}

/**
 * Homepage Recent Insights — paint bundled cards in the first HTML, then soft-
 * refresh from `/api/home/insights` without blanking the section.
 */
export function HomeFindingsClient({ initial }: { initial: Payload }) {
  const t = useTranslations("Home");
  const tCommon = useTranslations("Common");
  const [data, setData] = useState<Payload>(initial);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/home/insights", { signal: ac.signal });
        if (!res.ok) throw new Error(`insights ${res.status}`);
        const json = (await res.json()) as Payload & {
          aboveNorm?: RecentInsight[];
        };
        if (!cancelled) {
          setData({ insights: json.insights ?? [], empty: Boolean(json.empty) });
        }
      } catch {
        /* keep initial */
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, []);

  const stories = data.insights.filter((x) => x.focus !== "surprise");
  const even =
    stories.length > 1 && stories.length % 2
      ? stories.slice(0, -1)
      : stories;
  const cards = pairByHeight(even);
  const asOf = todayIsoDate();

  return (
    <section className="sports-card flex flex-col gap-3 p-4 sm:p-[21px]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="type-heading">{t("recentInsights")}</h2>
        <SectionLink href="/findings">{tCommon("seeAll")}</SectionLink>
      </div>
      {data.empty ? (
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

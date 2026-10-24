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
 * Homepage Recent Insights — client fetch so card SVGs stay out of first HTML.
 */
export function HomeFindingsClient() {
  const t = useTranslations("Home");
  const tCommon = useTranslations("Common");
  const [data, setData] = useState<Payload | null>(null);

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
        if (!cancelled) setData({ insights: [], empty: true });
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, []);

  if (!data) {
    return (
      <div
        className="sports-card h-80 animate-pulse p-4 sm:p-[21px]"
        aria-busy="true"
        aria-label="Loading recent insights"
      />
    );
  }

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

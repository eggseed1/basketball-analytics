import Link from "next/link";

import type { ComputedInsight } from "@/data/queries/home";
import { AppLink } from "@/components/ui/app-link";

export { AnalyticsDesk } from "@/components/home/analytics-desk";

/** Homepage insight cards from season boards + YoY DARKO movers. */
const SHOW_HOME_FINDINGS = true;

export function FindingsSection({ insights }: { insights: ComputedInsight[] }) {
  if (!SHOW_HOME_FINDINGS || !insights.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="type-heading">What the board is saying</h2>
        <p className="type-body-sm text-muted-foreground">
          Data-first takeaways from this season&apos;s boards — leaders, gaps,
          and same-metric YoY movers (DARKO / BPM) when both seasons are baked.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </section>
  );
}

function InsightCard({ insight }: { insight: ComputedInsight }) {
  return (
    <article className="sports-card flex flex-col gap-1.5 p-4">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        {insight.eyebrow}
      </p>
      {insight.players?.length ? (
        <h3 className="text-[16px] font-bold leading-snug tracking-tight">
          {insight.players.map((p, i) => (
            <span key={p.id}>
              {i > 0 ? (
                <span className="font-semibold text-muted-foreground">
                  {insight.id === "gap" ||
                  insight.id === "drbl-gap"
                    ? " over "
                    : " · "}
                </span>
              ) : null}
              <Link
                href={`/players/${p.id}`}
                className="underline-offset-2 hover:underline"
              >
                {p.name}
              </Link>
            </span>
          ))}
          {insight.title ? (
            <span className="text-muted-foreground">
              {" · "}
              {insight.title}
            </span>
          ) : null}
        </h3>
      ) : (
        <h3 className="text-[16px] font-bold leading-snug tracking-tight">
          {insight.title}
        </h3>
      )}
      <p className="text-[14px] leading-relaxed text-muted-foreground">
        {insight.body}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {insight.boardHref ? (
          <AppLink
            href={insight.boardHref}
            className="text-[12px] font-semibold text-foreground underline-offset-4 hover:underline"
          >
            Full board
          </AppLink>
        ) : null}
        {insight.learnHref ? (
          <AppLink
            href={insight.learnHref}
            className="text-[12px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
          >
            How it works
          </AppLink>
        ) : null}
      </div>
    </article>
  );
}

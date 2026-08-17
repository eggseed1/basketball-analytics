import Link from "next/link";

import type { ComputedInsight } from "@/data/queries/home";
import type { AnalyticsArticle } from "@/data/providers/insights/analytics-news";
import { AppLink } from "@/components/ui/app-link";

export function FindingsSection({ insights }: { insights: ComputedInsight[] }) {
  if (!insights.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-[17px] font-bold tracking-tight">
          What the board is saying right now
        </h2>
        <p className="text-[13px] text-muted-foreground">
          Live takeaways from this season&apos;s DRBL ability, impact, and
          efficiency boards.
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

/** NBA / analytics news desk - credited outlet + byline. */
export function AnalyticsDesk({
  articles,
  embedded = false,
}: {
  articles: AnalyticsArticle[];
  /** Card shell for homepage grid (wireframe “recent news”). */
  embedded?: boolean;
}) {
  const body = (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">
            {embedded ? "Recent news" : "Analytics desk"}
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Recent NBA analytics coverage - credited to the outlet and writer.
          </p>
        </div>
      </div>

      {articles.length === 0 ? (
        <div className="rounded-md border border-dashed border-black/10 px-4 py-8 text-center text-[13px] text-muted-foreground">
          No fresh headlines right now.
        </div>
      ) : (
        <ul
          className={
            embedded
              ? "flex flex-col gap-px overflow-hidden rounded-xl border border-black/5 bg-black/5"
              : "grid gap-px overflow-hidden rounded-md border border-black/5 bg-black/5 sm:grid-cols-2 lg:grid-cols-3"
          }
        >
          {articles.map((a) => (
            <li key={a.id} className="bg-card">
              <AppLink
                href={a.url}
                className="flex h-full flex-col gap-2 px-4 py-3.5 transition-colors hover:bg-secondary/40"
              >
                <div className="flex flex-col gap-0.5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-foreground">
                    {a.publication}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {a.author ?? "Byline pending"}
                  </p>
                </div>
                <h3 className="text-[14px] font-semibold leading-snug tracking-tight text-foreground">
                  {a.title}
                </h3>
                {a.publishedAt ? (
                  <p className="mt-auto pt-1 text-[11px] tabular-nums text-muted-foreground">
                    {a.publishedAt}
                  </p>
                ) : null}
              </AppLink>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  if (embedded) {
    return (
      <section className="sports-card flex flex-col gap-3 p-4 sm:p-5">
        {body}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 border-t border-black/5 pt-8 pb-4">
      {body}
    </section>
  );
}

function InsightCard({ insight }: { insight: ComputedInsight }) {
  return (
    <article className="sports-card flex flex-col gap-1.5 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {insight.eyebrow}
      </p>
      {insight.players?.length ? (
        <h3 className="text-[16px] font-bold leading-snug tracking-tight">
          {insight.players.map((p, i) => (
            <span key={p.id}>
              {i > 0 ? (
                <span className="font-semibold text-muted-foreground">
                  {insight.id === "gap" ? " over " : " · "}
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

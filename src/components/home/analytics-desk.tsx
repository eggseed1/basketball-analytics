"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { AnalyticsArticle } from "@/data/providers/insights/analytics-news";
import { AppLink } from "@/components/ui/app-link";

type NewsApiResponse = {
  retrievedAt?: string;
  data?: AnalyticsArticle[];
  error?: string;
};

/** NBA / analytics news desk - credited outlet + byline, with manual refresh. */
export function AnalyticsDesk({
  articles: initialArticles,
  embedded = false,
}: {
  articles: AnalyticsArticle[];
  /** Card shell for homepage grid (wireframe “recent news”). */
  embedded?: boolean;
}) {
  const [articles, setArticles] = useState(initialArticles);
  const [retrievedAt, setRetrievedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(initialArticles.length > 0);
  const loadStarted = useRef(false);

  const initialFingerprint = initialArticles.map((a) => a.id).join("|");
  useEffect(() => {
    if (initialArticles.length === 0) return;
    setArticles(initialArticles);
    setHasLoaded(true);
  }, [initialFingerprint, initialArticles]);

  const loadNews = async (fresh: boolean) => {
    setError(null);
    setIsPending(true);
    try {
      const qs = fresh
        ? "/api/news/analytics?limit=6&fresh=1"
        : "/api/news/analytics?limit=6";
      const res = await fetch(qs, { cache: fresh ? "no-store" : "default" });
      const json = (await res.json()) as NewsApiResponse;
      if (!res.ok) {
        throw new Error(json.error ?? "Could not load news");
      }
      setArticles(json.data ?? []);
      setRetrievedAt(
        json.retrievedAt ? new Date(json.retrievedAt) : new Date()
      );
      setHasLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load news");
      setHasLoaded(true);
    } finally {
      setIsPending(false);
    }
  };

  // Homepage ships empty SSR; pull cached desk after paint.
  useEffect(() => {
    if (!embedded || initialArticles.length > 0 || loadStarted.current) return;
    loadStarted.current = true;
    void loadNews(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once bootstrap
  }, [embedded, initialArticles.length]);

  const refresh = () => {
    if (isPending) return;
    void loadNews(true);
  };

  const updatedLabel = retrievedAt
    ? `Updated ${retrievedAt.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })}`
    : null;

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="type-heading">
          {embedded ? "Recent News" : "Analytics desk"}
        </h2>
        {embedded ? (
          <p className="type-body-sm text-muted-foreground">
            {updatedLabel ??
              (isPending && !hasLoaded
                ? "Loading analytics coverage…"
                : "Analytics coverage · refresh for newer takes")}
          </p>
        ) : (
          <p className="type-body-sm text-muted-foreground">
            Recent NBA analytics coverage - credited to the outlet and writer.
            {updatedLabel ? ` · ${updatedLabel}` : ""}
          </p>
        )}
        {error ? (
          <p className="type-body-sm mt-1 text-destructive" role="status">
            {error}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={refresh}
        disabled={isPending}
        className="sports-pill shrink-0 text-[12px] font-semibold disabled:pointer-events-none disabled:opacity-50"
        aria-label="Refresh recent news"
      >
        <RefreshCw
          className={`size-3.5 ${isPending ? "animate-spin" : ""}`}
          aria-hidden
        />
        {isPending ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );

  const list =
    !hasLoaded || (articles.length === 0 && isPending) ? (
      <div
        className="flex flex-col gap-px overflow-hidden rounded-[9px] border border-black/5 bg-black/5"
        aria-busy="true"
        aria-label="Loading recent news"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card px-4 py-3.5">
                    <div className="mb-2 h-4 w-[80%] animate-pulse rounded bg-secondary" />
            <div className="h-3 w-[40%] animate-pulse rounded bg-secondary" />
          </div>
        ))}
      </div>
    ) : articles.length === 0 ? (
      <div className="type-body-sm rounded-md border border-dashed border-black/10 px-4 py-8 text-center text-muted-foreground">
        No fresh headlines right now.
        {!isPending ? (
          <>
            {" "}
            <button
              type="button"
              onClick={refresh}
              className="font-semibold text-foreground underline-offset-2 hover:underline"
            >
              Try refresh
            </button>
          </>
        ) : null}
      </div>
    ) : (
      <ul
        className={
          embedded
            ? `flex flex-col gap-px overflow-hidden rounded-[9px] border border-black/5 bg-black/5 ${
                isPending ? "opacity-70" : ""
              }`
            : `grid gap-px overflow-hidden rounded-md border border-black/5 bg-black/5 sm:grid-cols-2 lg:grid-cols-3 ${
                isPending ? "opacity-70" : ""
              }`
        }
        aria-busy={isPending}
      >
        {articles.map((a) => (
          <li key={a.id} className="bg-card">
            <AppLink
              href={a.url}
              className="flex h-full flex-col gap-2 px-4 py-3.5 transition-colors hover:bg-secondary/40"
            >
              {embedded ? (
                <>
                  <h3 className="text-[18px] font-semibold leading-snug tracking-tight text-foreground">
                    {a.title}
                  </h3>
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-[12px] text-muted-foreground">
                      {a.publication}
                      {a.author ? ` · ${a.author}` : ""}
                    </p>
                    {a.publishedAt ? (
                      <p className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                        {a.publishedAt}
                      </p>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-0.5">
                    <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-foreground">
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
                    <p className="mt-auto pt-1 text-[12px] tabular-nums text-muted-foreground">
                      {a.publishedAt}
                    </p>
                  ) : null}
                </>
              )}
            </AppLink>
          </li>
        ))}
      </ul>
    );

  const body = (
    <>
      {header}
      {list}
    </>
  );

  if (embedded) {
    return (
      <section className="sports-card flex flex-col gap-3 p-4 sm:p-[21px]">
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

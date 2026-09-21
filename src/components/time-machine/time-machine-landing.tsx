"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import { GlassSurface } from "@/components/brand/glass-surface";
import type { LandmarkGameCard } from "@/content/history/landmark-games";
import { HISTORY_LANDMARKS } from "@/content/history/landmarks";
import {
  canonicalSeasonFromStartYear,
  startYearFromCanonicalSeason,
} from "@/data/providers/historical/season-range";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";
import { historyHref } from "@/themes/history-url";
import {
  ERA_THEMES,
  defaultTimeMachineSeason,
  resolveEraThemeForSeason,
  type EraTheme,
} from "@/themes/era-theme";

/** Map free text ("2024", "24-25", "2015-16") onto an available season. */
function resolveSeasonInput(
  raw: string,
  seasons: string[]
): string | null {
  const t = raw.trim();
  if (!t) return null;
  const byExact = seasons.find((s) => s.toLowerCase() === t.toLowerCase());
  if (byExact) return byExact;

  const dashed = /^(\d{4})\s*[-/–]\s*(\d{2}|\d{4})$/.exec(t);
  if (dashed) {
    const start = Number(dashed[1]);
    try {
      const canonical = canonicalSeasonFromStartYear(start);
      if (seasons.includes(canonical)) return canonical;
    } catch {
      /* ignore */
    }
  }

  if (/^\d{4}$/.test(t)) {
    const start = Number(t);
    try {
      const canonical = canonicalSeasonFromStartYear(start);
      if (seasons.includes(canonical)) return canonical;
    } catch {
      /* ignore */
    }
    // Typing an end calendar year (e.g. 2025 during 2024-25) → prior start.
    try {
      const prior = canonicalSeasonFromStartYear(start - 1);
      if (seasons.includes(prior)) return prior;
    } catch {
      /* ignore */
    }
  }

  if (/^\d{2}$/.test(t)) {
    const yy = Number(t);
    const hit = seasons.find((s) => {
      try {
        return startYearFromCanonicalSeason(s) % 100 === yy;
      } catch {
        return false;
      }
    });
    if (hit) return hit;
  }

  return null;
}

/** Newest available season whose start year falls in the era. */
function seasonForEra(era: EraTheme, seasons: string[]): string | null {
  let best: string | null = null;
  let bestYear = -Infinity;
  for (const s of seasons) {
    try {
      const y = startYearFromCanonicalSeason(s);
      if (y < era.startYear || y > era.endYear) continue;
      if (y > bestYear) {
        bestYear = y;
        best = s;
      }
    } catch {
      /* skip */
    }
  }
  return best;
}

function filterSeasons(query: string, seasons: string[]): string[] {
  const t = query.trim().toLowerCase();
  if (!t) return seasons;
  // Exact match in the field — keep the full list so the menu stays browsable.
  if (seasons.some((s) => s.toLowerCase() === t)) return seasons;
  return seasons.filter((s) => {
    if (s.toLowerCase().includes(t)) return true;
    try {
      const start = String(startYearFromCanonicalSeason(s));
      const end = String(startYearFromCanonicalSeason(s) + 1);
      return start.includes(t) || end.includes(t) || start.endsWith(t);
    } catch {
      return false;
    }
  });
}

export function TimeMachineLanding({
  seasons,
  landmarkGames = [],
}: {
  seasons: string[];
  landmarkGames?: LandmarkGameCard[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const listId = useId();
  const inputId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const initial = defaultTimeMachineSeason(seasons);
  const [query, setQuery] = useState(initial);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const suggestions = useMemo(
    () => filterSeasons(query, seasons),
    [query, seasons]
  );
  const showList = open && suggestions.length > 0;

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const exact = seasons.findIndex(
      (s) => s.toLowerCase() === query.trim().toLowerCase()
    );
    setActiveIndex(exact >= 0 ? exact : 0);
  }, [query, open, seasons]);

  useEffect(() => {
    if (!showList) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-season-opt="${CSS.escape(suggestions[activeIndex] ?? "")}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, showList, suggestions]);

  const enterSeason = (raw: string) => {
    const resolved = resolveSeasonInput(raw, seasons);
    if (!resolved) {
      setError("Pick a season from the list, or type a year like 2016.");
      setOpen(true);
      return;
    }
    setError(null);
    setQuery(resolved);
    setOpen(false);
    startTransition(() => {
      router.push(historyHref({ season: resolved, theme: "modern" }));
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    enterSeason(query);
  };

  const landmarks = HISTORY_LANDMARKS.filter((l) =>
    seasons.length === 0 ? true : seasons.includes(l.season)
  );

  const erasWithSeasons = useMemo(
    () =>
      ERA_THEMES.filter((era) => seasonForEra(era, seasons) != null).map(
        (era) => ({
          era,
          season: seasonForEra(era, seasons)!,
        })
      ),
    [seasons]
  );

  const landmarksByEra = useMemo(() => {
    const groups: Array<{ era: EraTheme; items: typeof landmarks }> = [];
    for (const era of ERA_THEMES) {
      const items = landmarks.filter(
        (l) => resolveEraThemeForSeason(l.season).id === era.id
      );
      if (items.length) groups.push({ era, items });
    }
    return groups;
  }, [landmarks]);

  const archiveSeason =
    landmarks.find((l) => seasons.includes(l.season))?.season ??
    seasons.find((s) => s.startsWith("2015")) ??
    seasons[0] ??
    initial;

  return (
    <main className="site-shell flex flex-1 flex-col gap-10 py-10 sm:py-14">
      <header className="mx-auto w-full max-w-2xl text-center">
        <p
          className={cn(
            type.caption,
            "font-bold uppercase tracking-[0.14em] text-muted-foreground"
          )}
        >
          Time Machine
        </p>
        <h1 className={cn(type.title1, "mt-3")}>
          Enter the NBA
          <br />
          Time Machine
        </h1>
        <p
          className={cn(
            type.body,
            "mx-auto mt-3 max-w-xl text-muted-foreground"
          )}
        >
          Pick a season for a day-by-day snapshot, open landmark eras with
          period atmosphere, or jump into the season games archive — then drill
          into era-true teams and players.
        </p>
      </header>

      <section className="mx-auto grid w-full max-w-3xl gap-3 sm:grid-cols-3">
        {(
          [
            {
              title: "Season snapshot",
              body: "Choose a year below — standings, leaders, and that day’s games.",
            },
            {
              title: "Landmark eras",
              body: "Curated seasons and Finals closes already in the archive.",
            },
            {
              title: "Season games hub",
              body: "Full schedule for a season — separate from the date snapshot.",
              href: `/history/${encodeURIComponent(archiveSeason)}`,
            },
          ] as const
        ).map((card) => (
          <div
            key={card.title}
            className="sports-card flex flex-col gap-1.5 p-4 text-left"
          >
            <p className={cn(type.bodySm, "font-bold tracking-tight")}>
              {"href" in card && card.href ? (
                <Link
                  href={card.href}
                  className="underline-offset-2 hover:underline"
                >
                  {card.title}
                </Link>
              ) : (
                card.title
              )}
            </p>
            <p className={cn(type.caption, "text-muted-foreground")}>
              {card.body}
            </p>
          </div>
        ))}
      </section>

      <form
        onSubmit={onSubmit}
        className="mx-auto flex w-full max-w-md flex-col gap-3 px-0"
      >
        <label
          htmlFor={inputId}
          className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground"
        >
          Select a season
        </label>
        {erasWithSeasons.length ? (
          <div
            className="flex flex-wrap justify-center gap-1.5"
            role="group"
            aria-label="Jump to era"
          >
            {erasWithSeasons.map(({ era, season }) => (
              <button
                key={era.id}
                type="button"
                onClick={() => {
                  setQuery(season);
                  setError(null);
                  enterSeason(season);
                }}
                className={cn(
                  type.caption,
                  "rounded-md border border-border bg-card px-2.5 py-1 font-semibold text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                )}
                title={`${era.name}: ${era.description}`}
              >
                {era.shortLabel}
              </button>
            ))}
          </div>
        ) : null}
        <div ref={rootRef} className="relative flex w-full items-stretch gap-2">
          <GlassSurface
            effect="liquid"
            backdropBlur={18}
            overflowVisible
            className="relative min-w-0 flex-1"
          >
            <input
              id={inputId}
              role="combobox"
              aria-expanded={showList}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                showList && suggestions[activeIndex]
                  ? `${listId}-opt-${suggestions[activeIndex]}`
                  : undefined
              }
              value={query}
              placeholder="Type a year (e.g. 2016 or 2015-16)"
              autoComplete="off"
              spellCheck={false}
              inputMode="numeric"
              onChange={(e) => {
                setQuery(e.target.value);
                setError(null);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setOpen(false);
                  return;
                }
                if (!showList) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveIndex((i) =>
                    Math.min(i + 1, Math.max(suggestions.length - 1, 0))
                  );
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveIndex((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter" && suggestions[activeIndex]) {
                  const pick = suggestions[activeIndex];
                  if (
                    resolveSeasonInput(query, seasons) == null ||
                    query.trim() !== pick
                  ) {
                    e.preventDefault();
                    setQuery(pick);
                    setOpen(false);
                  }
                }
              }}
              className="h-12 w-full bg-transparent px-4 text-[16px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/70"
            />
            {showList ? (
              <GlassSurface
                effect="css"
                backdropBlur={20}
                overflowVisible
                className="absolute inset-x-0 top-[calc(100%+6px)] z-20 shadow-[var(--shadow-overlay)]"
              >
                <div
                  ref={listRef}
                  className="max-h-64 overflow-y-auto overscroll-contain py-1 [-webkit-overflow-scrolling:touch]"
                >
                  <ul id={listId} role="listbox" className="flex flex-col">
                    {suggestions.map((s, index) => (
                      <li key={s} role="presentation">
                        <button
                          type="button"
                          id={`${listId}-opt-${s}`}
                          data-season-opt={s}
                          role="option"
                          aria-selected={index === activeIndex}
                          className={cn(
                            "flex w-full px-4 py-2.5 text-left text-[15px] font-semibold transition-colors",
                            index === activeIndex
                              ? "bg-foreground/10 text-foreground"
                              : "text-foreground/90 hover:bg-foreground/6"
                          )}
                          onMouseEnter={() => setActiveIndex(index)}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => enterSeason(s)}
                        >
                          {s}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </GlassSurface>
            ) : null}
          </GlassSurface>

          <button
            type="submit"
            disabled={pending}
            className="shrink-0 disabled:opacity-60"
          >
            <GlassSurface
              effect="liquid"
              backdropBlur={18}
              className="inline-flex h-12 items-center justify-center px-5 text-[15px] font-semibold text-foreground"
            >
              {pending ? "Entering…" : "Enter"}
            </GlassSurface>
          </button>
        </div>
        {error ? (
          <p className="text-[13px] font-medium text-destructive" role="alert">
            {error}
          </p>
        ) : (
          <p className="text-[12px] text-muted-foreground">
            Type a start year or full season code, then Enter — or tap an era
            chip.
          </p>
        )}
      </form>

      {landmarksByEra.length ? (
        <section className="mx-auto w-full max-w-3xl">
          <h2
            className={cn(
              type.caption,
              "text-center font-bold uppercase tracking-[0.12em] text-muted-foreground"
            )}
          >
            Landmark seasons
          </h2>
          <p
            className={cn(
              type.caption,
              "mt-1 text-center text-muted-foreground"
            )}
          >
            Curated eras with product coverage — open the snapshot or a related
            board.
          </p>
          <div className="mt-5 flex flex-col gap-6">
            {landmarksByEra.map(({ era, items }) => (
              <div key={era.id}>
                <p
                  className={cn(
                    type.micro,
                    "mb-2 font-bold uppercase tracking-[0.12em] text-muted-foreground"
                  )}
                >
                  {era.name}
                </p>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {items.map((l) => (
                    <li
                      key={l.id}
                      className="sports-card flex flex-col gap-2 p-4 text-left"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {l.season}
                      </p>
                      <Link
                        href={l.historyHref}
                        className="text-[15px] font-bold tracking-tight underline-offset-2 hover:underline"
                      >
                        {l.title}
                      </Link>
                      <p className="text-[13px] leading-relaxed text-muted-foreground">
                        {l.blurb}
                      </p>
                      {l.boardHref && l.boardLabel ? (
                        <Link
                          href={l.boardHref}
                          className="text-[12px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
                        >
                          {l.boardLabel} →
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {landmarkGames.length ? (
        <section className="mx-auto w-full max-w-3xl">
          <h2
            className={cn(
              type.caption,
              "text-center font-bold uppercase tracking-[0.12em] text-muted-foreground"
            )}
          >
            Landmark games
          </h2>
          <p
            className={cn(
              type.caption,
              "mt-1 text-center text-muted-foreground"
            )}
          >
            Finals closes that match the schedule archive. Missing scores stay
            off this list.
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {landmarkGames.map((game) => (
              <li
                key={game.id}
                className="sports-card flex flex-col gap-2 p-4 text-left"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {game.date}
                </p>
                <Link
                  href={game.gameHref}
                  className="text-[15px] font-bold tracking-tight underline-offset-2 hover:underline"
                >
                  {game.title}
                </Link>
                <p className="text-[13px] font-semibold tabular-nums">
                  {game.scoreLine}
                </p>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  {game.blurb}
                </p>
                <Link
                  href={game.historyHref}
                  className="text-[12px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
                >
                  Open that date →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="sports-card mx-auto w-full max-w-md p-5 text-left">
        <h2 className="text-[15px] font-semibold tracking-tight">
          Keep exploring
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          From {archiveSeason} into boards, franchises, and the trophy case.
        </p>
        <ul className="mt-3 flex flex-col gap-2 text-[14px] font-semibold">
          <li>
            <Link
              href={`/history/${encodeURIComponent(archiveSeason)}`}
              className="underline-offset-4 hover:underline"
            >
              Season games · {archiveSeason} →
            </Link>
          </li>
          <li>
            <Link
              href={`/explore/players?season=${encodeURIComponent(archiveSeason)}`}
              className="underline-offset-4 hover:underline"
            >
              Players board · {archiveSeason} →
            </Link>
          </li>
          <li>
            <Link
              href={`/explore/teams?season=${encodeURIComponent(archiveSeason)}`}
              className="underline-offset-4 hover:underline"
            >
              Teams · {archiveSeason} →
            </Link>
          </li>
          <li>
            <Link
              href="/awards"
              className="underline-offset-4 hover:underline"
            >
              Trophy case →
            </Link>
          </li>
          <li>
            <Link
              href="/franchises"
              className="underline-offset-4 hover:underline"
            >
              Franchises →
            </Link>
          </li>
        </ul>
      </section>

      <p className="mx-auto max-w-md text-center text-[13px] text-muted-foreground">
        Prefer franchise scrapbooks?{" "}
        <Link href="/franchises" className="underline underline-offset-4">
          Franchise History
        </Link>
        {" · "}
        <Link href="/explore/teams" className="underline underline-offset-4">
          Live teams
        </Link>
      </p>
    </main>
  );
}

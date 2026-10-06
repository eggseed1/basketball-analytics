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

function eraYears(era: EraTheme): string {
  const short = (y: number) => String(y).slice(2);
  if (era.endYear >= 2100) return `${era.startYear}–`;
  return `${era.startYear}–${short(era.endYear)}`;
}

function SectionTitle({ title, note }: { title: string; note?: string }) {
  return (
    <div className="text-center">
      <h2
        className={cn(
          type.caption,
          "font-bold uppercase tracking-[0.12em] text-muted-foreground"
        )}
      >
        {title}
      </h2>
      {note ? (
        <p className={cn(type.caption, "mt-1 text-muted-foreground")}>{note}</p>
      ) : null}
    </div>
  );
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

  const archiveSeason =
    landmarks.find((l) => seasons.includes(l.season))?.season ??
    seasons.find((s) => s.startsWith("2015")) ??
    seasons[0] ??
    initial;

  const pickedSeason = resolveSeasonInput(query, seasons);
  const pickedEra = pickedSeason ? resolveEraThemeForSeason(pickedSeason).id : null;

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
        <h1 className={cn(type.title1, "mt-3 text-balance")}>
          Enter the NBA Time Machine
        </h1>
        <p
          className={cn(
            type.body,
            "mx-auto mt-3 max-w-xl text-muted-foreground"
          )}
        >
          Pick a season to see its standings, leaders and games on any day.
        </p>
      </header>

      <div className="mx-auto w-full max-w-2xl">
        <form
          onSubmit={onSubmit}
          className="sports-card flex w-full flex-col gap-4 p-4 sm:p-5"
        >
          <label
            htmlFor={inputId}
            className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground"
          >
            Select a season
          </label>
          {erasWithSeasons.length ? (
            <div
              className="grid grid-cols-3 gap-1.5 sm:grid-cols-6"
              role="group"
              aria-label="Jump to era"
            >
              {erasWithSeasons.map(({ era, season }) => {
                const active = era.id === pickedEra;
                return (
                  <button
                    key={era.id}
                    type="button"
                    onClick={() => {
                      setQuery(season);
                      setError(null);
                      enterSeason(season);
                    }}
                    aria-pressed={active}
                    className={cn(
                      "flex flex-col items-start gap-0.5 rounded-[10px] px-3 py-2 text-left ring-1 ring-inset transition-colors",
                      active
                        ? "bg-foreground text-background ring-foreground"
                        : "bg-foreground/[0.03] ring-foreground/[0.08] hover:bg-foreground/[0.07]"
                    )}
                    title={`${era.name}: ${era.description}`}
                  >
                    <span className="text-[14px] font-bold leading-tight tracking-tight">
                      {era.shortLabel}
                    </span>
                    <span
                      className={cn(
                        "text-[11px] tabular-nums",
                        active ? "text-background/70" : "text-muted-foreground"
                      )}
                    >
                      {eraYears(era)}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
          <div ref={rootRef} className="relative flex w-full items-stretch gap-2">
            <div className="relative min-w-0 flex-1">
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
                className="h-12 w-full rounded-[10px] bg-foreground/[0.03] px-4 text-[16px] font-semibold tabular-nums text-foreground outline-none ring-1 ring-inset ring-foreground/[0.08] transition-shadow placeholder:font-medium placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-foreground/25"
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
                              "flex w-full px-4 py-2.5 text-left text-[15px] font-semibold tabular-nums transition-colors",
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
            </div>

            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-12 shrink-0 items-center justify-center rounded-[10px] bg-foreground px-6 text-[15px] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Entering…" : "Enter"}
            </button>
          </div>
          {error ? (
            <p className="text-[13px] font-medium text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </div>

      {landmarks.length ? (
        <section className="mx-auto w-full max-w-4xl">
          <SectionTitle title="Landmark seasons" />
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {landmarks.map((l) => (
              <li
                key={l.id}
                className="sports-card relative flex flex-col gap-1.5 p-4 text-left transition-transform hover:-translate-y-0.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[22px] font-black leading-none tabular-nums tracking-tight">
                    {l.season}
                  </span>
                  <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    {resolveEraThemeForSeason(l.season).name}
                  </span>
                </div>
                <Link
                  href={l.historyHref}
                  className="mt-1 text-[15px] font-bold tracking-tight after:absolute after:inset-0 after:rounded-[inherit]"
                >
                  {l.title}
                </Link>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  {l.blurb}
                </p>
                {l.boardHref && l.boardLabel ? (
                  <Link
                    href={l.boardHref}
                    className="relative z-[1] mt-auto pt-1 text-[12px] font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    {l.boardLabel} →
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {landmarkGames.length ? (
        <section className="mx-auto w-full max-w-4xl">
          <SectionTitle
            title="Landmark games"
            note="Finals closes that match the schedule archive. Missing scores stay off this list."
          />
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {landmarkGames.map((game) => (
              <li
                key={game.id}
                className="sports-card relative flex flex-col gap-1.5 p-4 text-left transition-transform hover:-translate-y-0.5"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {game.date}
                </p>
                <Link
                  href={game.gameHref}
                  className="text-[15px] font-bold tracking-tight after:absolute after:inset-0 after:rounded-[inherit]"
                >
                  {game.title}
                </Link>
                <p className="text-[18px] font-black tabular-nums tracking-tight">
                  {game.scoreLine}
                </p>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  {game.blurb}
                </p>
                <Link
                  href={game.historyHref}
                  className="relative z-[1] mt-auto pt-1 text-[12px] font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Open that date →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mx-auto w-full max-w-4xl">
        <SectionTitle
          title="Keep exploring"
          note={`From ${archiveSeason} into boards, franchises and the trophy case.`}
        />
        <ul className="mt-4 flex flex-wrap justify-center gap-2">
          {[
            { href: `/history/${encodeURIComponent(archiveSeason)}`, label: `Season games · ${archiveSeason}` },
            { href: `/explore/players?season=${encodeURIComponent(archiveSeason)}`, label: `Players board · ${archiveSeason}` },
            { href: `/explore/teams?season=${encodeURIComponent(archiveSeason)}`, label: `Teams · ${archiveSeason}` },
            { href: "/awards", label: "Trophy case" },
            { href: "/franchises", label: "Franchises" },
          ].map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="inline-flex items-center gap-1 rounded-full bg-card px-3.5 py-2 text-[13px] font-semibold ring-1 ring-inset ring-foreground/[0.08] transition-colors hover:bg-foreground/[0.05]"
              >
                {link.label} <span aria-hidden>→</span>
              </Link>
            </li>
          ))}
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

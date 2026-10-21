"use client";

import { useTranslations } from "next-intl";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  FormEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import { GlassSurface } from "@/components/brand/glass-surface";
import { MotionReveal } from "@/components/continuity/motion-reveal";
import type { LandmarkGameCard } from "@/content/history/landmark-games";
import { HISTORY_LANDMARKS } from "@/content/history/landmarks";
import {
  canonicalSeasonFromStartYear,
  startYearFromCanonicalSeason,
} from "@/data/providers/historical/season-range";
import { type } from "@/lib/design-system";
import { standingsHref } from "@/lib/standings-routes";
import { cn } from "@/lib/utils";
import { historyHref } from "@/themes/history-url";
import { LinkCue } from "@/components/ui/link-cue";
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

/** Decorative era tints for the landing page only. */
const ERA_ACCENT: Record<EraTheme["id"], string> = {
  early: "#c4925a",
  "1980s": "#ef6a3a",
  "1990s": "#9d6bf2",
  "2000s": "#3b8fea",
  "2010s": "#22b07d",
  modern: "#e8b23a",
};

const ERA_NUMERAL_FONT: Record<EraTheme["id"], string> = {
  early: 'Georgia, "Times New Roman", serif',
  "1980s": '"Helvetica Neue", Helvetica, Arial, sans-serif',
  "1990s": '"Arial Narrow", "Roboto Condensed", Arial, sans-serif',
  "2000s": "Tahoma, Geneva, Verdana, sans-serif",
  "2010s": "system-ui, -apple-system, sans-serif",
  modern: "var(--font-sans)",
};

function startYearOr(season: string, fallback: number): number {
  try {
    return startYearFromCanonicalSeason(season);
  } catch {
    return fallback;
  }
}

function SectionTitle({ title, note }: { title: string; note?: string }) {
  return (
    <div className="text-center">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-foreground/15" />
        <h2
          className={cn(
            type.caption,
            "font-bold uppercase tracking-[0.18em] text-foreground/80"
          )}
        >
          {title}
        </h2>
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-foreground/15" />
      </div>
      {note ? (
        <p className={cn(type.caption, "mt-1.5 text-muted-foreground")}>{note}</p>
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
  const t = useTranslations("History");
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

  const ascending = useMemo(
    () =>
      [...seasons].sort(
        (a, b) => startYearOr(a, 0) - startYearOr(b, 0)
      ),
    [seasons]
  );
  const presentSeason = ascending[ascending.length - 1] ?? initial;
  const dialSeason = pickedSeason ?? initial;
  const dialIndex = Math.max(ascending.indexOf(dialSeason), 0);
  const dialEra = resolveEraThemeForSeason(dialSeason);

  const eraSpans = useMemo(
    () =>
      ERA_THEMES.map((era) => ({
        era,
        count: ascending.filter((s) => {
          const y = startYearOr(s, -1);
          return y >= era.startYear && y <= era.endYear;
        }).length,
      })).filter((span) => span.count > 0),
    [ascending]
  );

  const firstYear = startYearOr(ascending[0] ?? initial, 1946);
  const lastYear = startYearOr(presentSeason, firstYear);
  const tickYears = [firstYear, 1960, 1980, 2000, lastYear].filter(
    (y, i, all) => y >= firstYear && y <= lastYear && all.indexOf(y) === i
  );

  return (
    <main data-motion-page className="site-shell flex flex-1 flex-col gap-12 py-8 sm:py-12">
      <MotionReveal />
      <section className="sports-card relative z-[2] mx-auto w-full max-w-4xl p-4 sm:p-5">
        <header>
          <h1 className="type-title-1 text-balance">{t("enterTitle")}</h1>
          <p className="mt-2 max-w-md type-body-sm text-muted-foreground">
            {t("enterSubtitle")}
          </p>
          <p
            className="mt-2 type-caption font-medium text-muted-foreground"
            aria-live="polite"
          >
            {dialEra.name}
            <span className="text-muted-foreground/50"> · </span>
            <span className="tabular-nums">{dialSeason}</span>
          </p>
        </header>

        <div className="mt-6">
          <div className="relative h-3">
            <div
              aria-hidden
              className="absolute inset-0 flex gap-[2px] overflow-hidden rounded-full"
            >
              {eraSpans.map(({ era, count }) => (
                <span
                  key={era.id}
                  className={cn(
                    "h-full transition-opacity",
                    era.id === dialEra.id ? "opacity-100" : "opacity-45"
                  )}
                  style={{ flexGrow: count, background: ERA_ACCENT[era.id] }}
                />
              ))}
            </div>
            {ascending.length > 1 ? (
              <input
                type="range"
                min={0}
                max={ascending.length - 1}
                step={1}
                value={dialIndex}
                aria-label={t("scrubSeasonsAria")}
                aria-valuetext={dialSeason}
                onChange={(e) => {
                  const next = ascending[Number(e.target.value)];
                  if (!next) return;
                  setQuery(next);
                  setError(null);
                  setOpen(false);
                }}
                className="tm-range absolute inset-x-0 top-1/2 h-3 w-full -translate-y-1/2"
              />
            ) : null}
          </div>
          <div
            aria-hidden
            className="relative mt-2 h-4 type-micro font-semibold tabular-nums text-muted-foreground"
          >
            {tickYears.map((y) => {
              const pct =
                lastYear > firstYear
                  ? ((y - firstYear) / (lastYear - firstYear)) * 100
                  : 0;
              return (
                <span
                  key={y}
                  className="absolute top-0"
                  style={{
                    left: `${pct}%`,
                    transform:
                      pct === 0 ? "none" : pct === 100 ? "translateX(-100%)" : "translateX(-50%)",
                  }}
                >
                  {y}
                </span>
              );
            })}
          </div>
        </div>

        {eraSpans.length ? (
          <div
            className="mt-5 grid grid-cols-3 gap-1.5 sm:grid-cols-6"
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
                    setOpen(false);
                  }}
                  aria-pressed={active}
                  className={cn(
                    "group flex flex-col items-start gap-1 rounded-[8px] px-3 py-2 text-left ring-1 ring-inset transition",
                    active
                      ? "bg-foreground/[0.06] ring-[color:var(--era)]"
                      : "bg-foreground/[0.03] ring-foreground/10 hover:bg-foreground/[0.06]"
                  )}
                  style={{ "--era": ERA_ACCENT[era.id] } as CSSProperties}
                  title={`${era.name}: ${era.description}`}
                >
                  <span className="flex items-center gap-1.5 type-body-sm font-semibold leading-tight tracking-tight">
                    <span
                      aria-hidden
                      className="size-2 rounded-full bg-[color:var(--era)]"
                    />
                    {era.shortLabel}
                  </span>
                  <span className="type-micro tabular-nums text-muted-foreground">
                    {eraYears(era)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="mt-5">
          <label htmlFor={inputId} className="sr-only">
            Select a season
          </label>
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
                className="h-12 w-full rounded-[8px] bg-foreground/[0.035] px-4 type-body font-semibold tabular-nums text-foreground outline-none ring-1 ring-inset ring-foreground/10 transition-shadow placeholder:font-medium placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/50"
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
                              "flex w-full items-center justify-between px-4 py-2.5 text-left text-[15px] font-semibold tabular-nums transition-colors",
                              index === activeIndex
                                ? "bg-foreground/10 text-foreground"
                                : "text-foreground/90 hover:bg-foreground/6"
                            )}
                            onMouseEnter={() => setActiveIndex(index)}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => enterSeason(s)}
                          >
                            {s}
                            <span
                              aria-hidden
                              className="size-2 rounded-full"
                              style={{
                                background:
                                  ERA_ACCENT[resolveEraThemeForSeason(s).id],
                              }}
                            />
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
              className={cn(
                "sports-pill inline-flex h-12 shrink-0 items-center justify-center gap-1.5 px-5 text-[14px] font-semibold",
                "bg-foreground text-background hover:bg-foreground/90",
                "disabled:opacity-60 sm:px-6"
              )}
            >
              {pending ? "Traveling…" : "Travel"}
              {pending ? null : <LinkCue />}
            </button>
          </div>
          {error ? (
            <p className="mt-2 type-caption font-medium text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </section>

      <section className="mx-auto w-full max-w-5xl">
        <SectionTitle
          title={t("recordBookTitle")}
          note="Single-game, season, career, and team marks back to 1946-47."
        />
        <Link
          href="/history/records"
          className="sports-card mt-5 flex flex-col gap-1 p-4 transition-transform duration-200 hover:-translate-y-1"
        >
          <span className="text-[16px] font-bold tracking-tight">Open the record book</span>
          <span className="text-[13px] leading-relaxed text-muted-foreground">
            Points, rebounds, assists, threes, and streaks. Lists that end in 1996-97 say so.
          </span>
        </Link>
      </section>

      {landmarkGames.length ? (
        <section className="mx-auto w-full max-w-5xl">
          <SectionTitle
            title="Landmark games"
            note="Finals closes in the schedule archive."
          />
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {landmarkGames.map((game) => (
              <li
                key={game.id}
                className="sports-card relative flex flex-col gap-2 p-4 text-left transition-transform duration-200 hover:-translate-y-1"
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
                <p
                  className="tm-led self-start rounded-[8px] px-3 py-1.5 type-title font-bold tabular-nums tracking-tight"
                >
                  <span className="tm-led-digits">{game.scoreLine}</span>
                </p>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  {game.blurb}
                </p>
                <Link
                  href={game.historyHref}
                  className="relative z-[1] mt-auto pt-1 text-[12px] font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Open that date <LinkCue />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {landmarks.length ? (
        <section className="mx-auto w-full max-w-5xl">
          <SectionTitle title="Landmark seasons" />
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {landmarks.map((l) => {
              const era = resolveEraThemeForSeason(l.season);
              return (
                <li
                  key={l.id}
                  className="sports-card group relative flex flex-col overflow-hidden text-left transition-transform duration-200 hover:-translate-y-1"
                >
                  <div
                    className="tm-poster relative h-28 text-white"
                    style={{ "--era": ERA_ACCENT[era.id] } as CSSProperties}
                  >
                    <span className="absolute right-3 top-3 rounded-full bg-black/25 px-2 py-0.5 text-[11px] font-semibold backdrop-blur-sm">
                      {era.name}
                    </span>
                    <span
                      className="absolute bottom-3 left-4 text-[40px] font-black leading-none tabular-nums tracking-tight drop-shadow-[0_2px_8px_rgb(0_0_0/0.35)] transition-transform duration-300 group-hover:scale-[1.04]"
                      style={{ fontFamily: ERA_NUMERAL_FONT[era.id] }}
                    >
                      {l.season}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5 p-4">
                    <Link
                      href={l.historyHref}
                      className="text-[16px] font-bold tracking-tight after:absolute after:inset-0 after:rounded-[inherit]"
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
                        {l.boardLabel} <LinkCue />
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="mx-auto w-full max-w-4xl">
        <SectionTitle
          title="Keep exploring"
          note={`Boards, franchises, and the trophy case from ${archiveSeason}.`}
        />
        <ul className="mt-5 flex flex-wrap justify-center gap-2">
          {[
            { href: `/history/${encodeURIComponent(archiveSeason)}`, label: `Season archive · ${archiveSeason}` },
            { href: `/explore/players?season=${encodeURIComponent(archiveSeason)}`, label: `Players board · ${archiveSeason}` },
            { href: standingsHref(archiveSeason, "team-stats"), label: `Teams · ${archiveSeason}` },
            { href: "/franchises", label: "Franchise History" },
            { href: "/awards", label: "Trophy case" },
          ].map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="inline-flex items-center gap-1 rounded-full bg-card px-3.5 py-2 text-[13px] font-semibold ring-1 ring-inset ring-foreground/[0.08] transition hover:-translate-y-0.5 hover:bg-foreground/[0.05]"
              >
                {link.label} <LinkCue />
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
        <Link href="/standings#team-stats" className="underline underline-offset-4">
          Live teams
        </Link>
      </p>
    </main>
  );
}

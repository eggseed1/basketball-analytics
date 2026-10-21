"use client";

import { FormEvent, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  TransitionLink,
  useQueryNavOptional,
} from "@/components/continuity/query-nav";
import { historyHref } from "@/themes/history-url";
import { seasonWeekNumber, type ThemeMode } from "@/themes/era-theme";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";
import { LinkCue } from "@/components/ui/link-cue";

export function SeasonExplorer({
  season,
  seasons,
  prevSeason,
  nextSeason,
  theme,
  date,
}: {
  season: string;
  seasons: string[];
  prevSeason: string | null;
  nextSeason: string | null;
  theme: ThemeMode;
  date?: string;
}) {
  const router = useRouter();
  const queryNav = useQueryNavOptional();
  const [localPending, startLocalTransition] = useTransition();
  const pending = Boolean(queryNav?.pending || localPending);

  const base = { theme, date };

  const onSelect = (e: FormEvent<HTMLSelectElement>) => {
    const value = e.currentTarget.value;
    const href = historyHref({ ...base, season: value, date: undefined });
    if (queryNav) queryNav.pushHref(href);
    else startLocalTransition(() => router.push(href));
  };

  return (
    <nav
      aria-label="Season explorer"
      className={cn(
        "relative flex flex-wrap items-center gap-3",
        pending && "opacity-80"
      )}
      data-updating={pending ? "true" : "false"}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
        <h1
          className={cn(
            type.heading,
            "tm-heading shrink-0 tabular-nums tracking-tight"
          )}
        >
          {season}
        </h1>

        <label className="inline-flex items-center gap-2">
          <span
            className={cn(
              type.caption,
              "font-semibold uppercase tracking-wide text-muted-foreground"
            )}
          >
            Season
          </span>
          <select
            id="tm-season"
            value={season}
            onChange={onSelect}
            aria-label="Season"
            className={cn(
              type.caption,
              "glass-pill h-8 min-w-[7.5rem] cursor-pointer rounded-md border-0 px-2.5 font-semibold tabular-nums text-foreground outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring"
            )}
          >
            {seasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-2">
          {prevSeason ? (
            <TransitionLink
              href={historyHref({
                ...base,
                season: prevSeason,
                date: undefined,
              })}
              className="sports-pill inline-flex shrink-0 items-center text-[14px]"
              prefetch={false}
            >
              <LinkCue direction="back" />
              <span className="hidden sm:inline">{prevSeason}</span>
            </TransitionLink>
          ) : (
            <span className="sports-pill inline-flex shrink-0 items-center text-[14px] opacity-40">
              <LinkCue direction="back" />
            </span>
          )}

          {nextSeason ? (
            <TransitionLink
              href={historyHref({
                ...base,
                season: nextSeason,
                date: undefined,
              })}
              className="sports-pill inline-flex shrink-0 items-center text-[14px]"
              prefetch={false}
            >
              <span className="hidden sm:inline">{nextSeason}</span> <LinkCue />
            </TransitionLink>
          ) : (
            <span className="sports-pill inline-flex shrink-0 items-center text-[14px] opacity-40">
              <LinkCue />
            </span>
          )}
        </div>
      </div>
    </nav>
  );
}

export function DateExplorer({
  season,
  date,
  prevDate,
  nextDate,
  theme,
}: {
  season: string;
  date: string;
  prevDate: string | null;
  nextDate: string | null;
  theme: ThemeMode;
}) {
  const router = useRouter();
  const queryNav = useQueryNavOptional();
  const [localPending, startLocalTransition] = useTransition();
  const pending = Boolean(queryNav?.pending || localPending);

  const onChange = (e: FormEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    const href = historyHref({ season, theme, date: value });
    if (queryNav) queryNav.pushHref(href);
    else startLocalTransition(() => router.push(href));
  };

  return (
    <nav
      aria-label="Date explorer"
      className={cn(
        "flex flex-wrap items-center gap-2",
        pending && "opacity-80"
      )}
      data-updating={pending ? "true" : "false"}
    >
      {prevDate ? (
        <TransitionLink
          href={historyHref({ season, theme, date: prevDate })}
          className="sports-pill text-[14px]"
          prefetch={false}
        >
          <LinkCue direction="back" />
          Prev day
        </TransitionLink>
      ) : (
        <span className="sports-pill inline-flex items-center gap-0.5 text-[14px] opacity-40">
          <LinkCue direction="back" />
          Prev day
        </span>
      )}

      <label className="sr-only" htmlFor="tm-date">
        Date
      </label>
      <input
        id="tm-date"
        type="date"
        value={date}
        onChange={onChange}
        className="rounded-md border border-border bg-card px-3 py-2 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      {nextDate ? (
        <TransitionLink
          href={historyHref({ season, theme, date: nextDate })}
          className="sports-pill text-[14px]"
          prefetch={false}
        >
          Next day <LinkCue />
        </TransitionLink>
      ) : (
        <span className="sports-pill text-[14px] opacity-40">Next day <LinkCue /></span>
      )}
    </nav>
  );
}

export function WeekExplorer({
  season,
  weekStart,
  weekEnd,
  prevWeekAnchor,
  nextWeekAnchor,
  theme,
}: {
  season: string;
  weekStart: string;
  weekEnd: string;
  prevWeekAnchor: string | null;
  nextWeekAnchor: string | null;
  theme: ThemeMode;
}) {
  const pending = Boolean(useQueryNavOptional()?.pending);
  const weekNumber = seasonWeekNumber(season, weekStart);
  const rangeLabel =
    weekStart === weekEnd ? weekStart : `${weekStart} – ${weekEnd}`;

  return (
    <nav
      aria-label="Week explorer"
      className={cn(
        "flex flex-wrap items-center gap-2",
        pending && "opacity-80"
      )}
      data-updating={pending ? "true" : "false"}
    >
      {prevWeekAnchor ? (
        <TransitionLink
          href={historyHref({ season, theme, date: prevWeekAnchor })}
          className="sports-pill text-[14px]"
          prefetch={false}
        >
          <LinkCue direction="back" />
          Prev week
        </TransitionLink>
      ) : (
        <span className="sports-pill inline-flex items-center gap-0.5 text-[14px] opacity-40">
          <LinkCue direction="back" />
          Prev week
        </span>
      )}

      <div className="flex flex-col gap-0.5 rounded-md border border-border bg-card px-3 py-1.5">
        <p className={cn(type.bodySm, "font-semibold tabular-nums")}>
          Week {weekNumber}
        </p>
        <p
          className={cn(
            type.caption,
            "tabular-nums text-muted-foreground"
          )}
        >
          {rangeLabel}
        </p>
      </div>

      {nextWeekAnchor ? (
        <TransitionLink
          href={historyHref({ season, theme, date: nextWeekAnchor })}
          className="sports-pill text-[14px]"
          prefetch={false}
        >
          Next week <LinkCue />
        </TransitionLink>
      ) : (
        <span className="sports-pill text-[14px] opacity-40">
          Next week <LinkCue />
        </span>
      )}
    </nav>
  );
}

export function ThemeModeControl({
  season,
  date,
  theme,
}: {
  season: string;
  date?: string;
  theme: ThemeMode;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Theme"
    >
      <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        Theme
      </span>
      <TransitionLink
        href={historyHref({ season, date, theme: "historical" })}
        className={cn(
          "sports-pill text-[14px]",
          theme === "historical" &&
            "bg-foreground text-background hover:bg-foreground"
        )}
        prefetch={false}
      >
        Historical
      </TransitionLink>
      <TransitionLink
        href={historyHref({ season, date, theme: "modern" })}
        className={cn(
          "sports-pill text-[14px]",
          theme === "modern" &&
            "bg-foreground text-background hover:bg-foreground"
        )}
        prefetch={false}
      >
        Modern
      </TransitionLink>
    </div>
  );
}

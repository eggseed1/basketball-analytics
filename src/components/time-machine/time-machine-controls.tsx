"use client";

import { FormEvent, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  TransitionLink,
  useQueryNavOptional,
} from "@/components/continuity/query-nav";
import { historyHref } from "@/themes/history-url";
import type { ThemeMode } from "@/themes/era-theme";
import { cn } from "@/lib/utils";

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
        "relative flex flex-wrap items-center justify-between gap-3",
        pending && "opacity-80"
      )}
      data-updating={pending ? "true" : "false"}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {prevSeason ? (
          <TransitionLink
            href={historyHref({ ...base, season: prevSeason, date: undefined })}
            className="sports-pill shrink-0 text-[13px]"
            prefetch={false}
          >
            ← {prevSeason}
          </TransitionLink>
        ) : (
          <span className="sports-pill shrink-0 text-[13px] opacity-40">←</span>
        )}

        <label className="sr-only" htmlFor="tm-season">
          Season
        </label>
        <select
          id="tm-season"
          value={season}
          onChange={onSelect}
          className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-2 text-[15px] font-semibold tm-heading outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {seasons.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {nextSeason ? (
          <TransitionLink
            href={historyHref({ ...base, season: nextSeason, date: undefined })}
            className="sports-pill shrink-0 text-[13px]"
            prefetch={false}
          >
            {nextSeason} →
          </TransitionLink>
        ) : (
          <span className="sports-pill shrink-0 text-[13px] opacity-40">→</span>
        )}
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
          className="sports-pill text-[13px]"
          prefetch={false}
        >
          ← Prev day
        </TransitionLink>
      ) : (
        <span className="sports-pill text-[13px] opacity-40">← Prev day</span>
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
          className="sports-pill text-[13px]"
          prefetch={false}
        >
          Next day →
        </TransitionLink>
      ) : (
        <span className="sports-pill text-[13px] opacity-40">Next day →</span>
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
          "sports-pill text-[13px]",
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
          "sports-pill text-[13px]",
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

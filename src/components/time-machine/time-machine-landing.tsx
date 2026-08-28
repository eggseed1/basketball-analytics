"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

import { HISTORY_LANDMARKS } from "@/content/history/landmarks";
import { historyHref } from "@/themes/history-url";
import { defaultTimeMachineSeason } from "@/themes/era-theme";

export function TimeMachineLanding({ seasons }: { seasons: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const initial = defaultTimeMachineSeason(seasons);
  const [season, setSeason] = useState(initial);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    startTransition(() => {
      router.push(historyHref({ season, theme: "historical" }));
    });
  };

  const landmarks = HISTORY_LANDMARKS.filter((l) =>
    seasons.length === 0 ? true : seasons.includes(l.season)
  );

  return (
    <main className="site-shell flex flex-1 flex-col justify-center gap-8 py-16 sm:py-24">
      <header className="mx-auto max-w-xl text-center">
        <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          History
        </p>
        <h1 className="mt-3 text-[32px] font-bold tracking-tight sm:text-[40px]">
          Enter the NBA Time Machine
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          Choose a season. The data, team identities, and site atmosphere travel
          with you.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="mx-auto flex w-full max-w-md flex-col gap-4"
      >
        <label className="flex flex-col gap-2 text-left">
          <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Select a season
          </span>
          <select
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="rounded-md border border-border bg-card px-4 py-3 text-[16px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {seasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-3 text-[15px] font-semibold text-background transition hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Entering…" : "Enter"}
        </button>
      </form>

      {landmarks.length ? (
        <section className="mx-auto w-full max-w-2xl">
          <h2 className="text-center text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Landmark seasons
          </h2>
          <p className="mt-1 text-center text-[13px] text-muted-foreground">
            Curated discovery jumps — not a full historical census.
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {landmarks.map((l) => (
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
        </section>
      ) : null}

      <section className="sports-card mx-auto w-full max-w-md p-5 text-left">
        <h2 className="text-[15px] font-semibold tracking-tight">
          Explore NBA History
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          Seasons, players, teams, and games - start small, then go deeper.
        </p>
        <ul className="mt-3 flex flex-col gap-2 text-[14px] font-semibold">
          <li>
            <Link
              href="/history/2005-06"
              className="underline-offset-4 hover:underline"
            >
              Seasons · 2005-06 games →
            </Link>
          </li>
          <li>
            <Link
              href="/explore/players?season=2005-06"
              className="underline-offset-4 hover:underline"
            >
              Players directory →
            </Link>
          </li>
          <li>
            <Link
              href="/explore/teams?season=2005-06"
              className="underline-offset-4 hover:underline"
            >
              Teams · 2005-06 →
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

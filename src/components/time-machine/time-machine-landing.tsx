"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

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

  return (
    <main className="site-shell flex flex-1 flex-col justify-center gap-8 py-16 sm:py-24">
      <header className="mx-auto max-w-xl text-center">
        <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          History
        </p>
        <h1 className="mt-3 text-[32px] font-bold tracking-tight sm:text-[40px]">
          Enter the NBA Time Machine
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">
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
          className="rounded-md bg-foreground px-4 py-3 text-[16px] font-semibold text-background transition hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Entering…" : "Enter"}
        </button>
      </form>

      <p className="mx-auto max-w-md text-center text-[14px] text-muted-foreground">
        Prefer franchise scrapbooks?{" "}
        <Link href="/franchises" className="underline underline-offset-4">
          Franchise History
        </Link>
      </p>
    </main>
  );
}

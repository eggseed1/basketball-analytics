import Link from "next/link";
import { Suspense } from "react";

import { StandingsConferenceTable } from "@/components/standings/standings-conference-table";
import { getLeagueStandings } from "@/data/queries";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";

export const metadata = {
  title: "Standings",
  description: "NBA conference standings with point differential and scoring.",
};

async function StandingsBody({ season }: { season: string }) {
  const data = await getLeagueStandings(season);
  const east = data.conferences.find((c) => c.conference === "East")?.rows ?? [];
  const west = data.conferences.find((c) => c.conference === "West")?.rows ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <StandingsConferenceTable title="Eastern Conference" rows={east} />
      <StandingsConferenceTable title="Western Conference" rows={west} />
    </div>
  );
}

export default async function StandingsPage() {
  const season = canonicalSeasonFromStartYear(currentNbaStartYear());

  return (
    <main className="site-shell flex flex-1 flex-col gap-5 py-6 sm:py-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Teams
          </p>
          <h1 className="mt-1 text-[28px] font-bold tracking-tight sm:text-[32px]">
            Standings
          </h1>
          <p className="mt-1 max-w-xl text-[16px] text-muted-foreground">
            {season} conference race - W/L, games back, and scoring margin.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/explore/teams"
            className="rounded-full bg-foreground px-4 py-2 text-[14px] font-semibold text-background"
          >
            Team boards
          </Link>
          <Link
            href="/explore/players"
            className="rounded-full bg-secondary px-4 py-2 text-[14px] font-semibold"
          >
            Players
          </Link>
        </div>
      </header>

      <Suspense
        fallback={
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="h-80 animate-pulse rounded-md bg-secondary" />
            <div className="h-80 animate-pulse rounded-md bg-secondary" />
          </div>
        }
      >
        <StandingsBody season={season} />
      </Suspense>
    </main>
  );
}

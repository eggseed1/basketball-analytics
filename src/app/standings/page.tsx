import Link from "next/link";
import { Suspense } from "react";

import { StandingsConferenceTable } from "@/components/standings/standings-conference-table";
import {
  StandingsTrackerIsland,
} from "@/components/standings/standings-tracker-island";
import { StandingsViewTabs } from "@/components/standings/standings-view-tabs";
import { getLeagueStandings } from "@/data/queries";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import {
  getStandingsTrackerSeasonOptions,
} from "@/data/queries/standings-tracker";

export const metadata = {
  title: "Standings",
  description:
    "NBA conference standings and seasonal win-loss tracker — games above .500 over time.",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(
  sp: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

async function StandingsBody({ season }: { season: string }) {
  let data;
  try {
    data = await getLeagueStandings(season);
  } catch {
    return (
      <div className="rounded-md border border-border bg-secondary/40 px-4 py-8 text-center text-[14px] text-muted-foreground">
        Standings are temporarily unavailable. Try again shortly.
      </div>
    );
  }

  const east = data.conferences.find((c) => c.conference === "East")?.rows ?? [];
  const west = data.conferences.find((c) => c.conference === "West")?.rows ?? [];

  if (!east.length && !west.length) {
    return (
      <div className="rounded-md border border-border bg-secondary/40 px-4 py-8 text-center text-[14px] text-muted-foreground">
        No standings rows for {season} yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {data.season !== season ? (
        <p className="text-[13px] text-muted-foreground">
          Showing {data.season} final standings — {season} season has not
          started.
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <StandingsConferenceTable title="Eastern Conference" rows={east} />
        <StandingsConferenceTable title="Western Conference" rows={west} />
      </div>
    </div>
  );
}

export default async function StandingsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const view = one(sp, "view") === "tracker" ? "tracker" : "table";
  const seasonOptions = getStandingsTrackerSeasonOptions();
  const currentSeason = canonicalSeasonFromStartYear(currentNbaStartYear());
  const trackerDefault =
    seasonOptions.find((option) => option !== "2026-27") ??
    seasonOptions[0] ??
    currentSeason;
  const seasonParam = one(sp, "season");
  const season =
    seasonParam && /^\d{4}-\d{2}$/.test(seasonParam)
      ? seasonParam
      : view === "tracker"
        ? trackerDefault
        : currentSeason;

  return (
    <main className="site-shell flex flex-1 flex-col gap-5 py-6 sm:py-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Teams
            </p>
            <h1 className="mt-1 text-[28px] font-bold tracking-tight sm:text-[32px]">
              Standings
            </h1>
            <p className="mt-1 max-w-xl text-[16px] text-muted-foreground">
              {view === "tracker"
                ? `${season} race tracker — games above .500 over the regular season.`
                : `${season} conference race — W/L, games back, and scoring margin.`}
            </p>
          </div>
          <StandingsViewTabs active={view} season={season} />
        </div>
        <div className="flex flex-wrap gap-2">
          {view === "table" ? (
            <Link
              href={`/standings?view=tracker&season=${encodeURIComponent(season)}`}
              className="rounded-full bg-foreground px-4 py-2 text-[14px] font-semibold text-background"
            >
              Open tracker
            </Link>
          ) : (
            <Link
              href={`/standings?season=${encodeURIComponent(season)}`}
              className="rounded-full bg-secondary px-4 py-2 text-[14px] font-semibold"
            >
              Table view
            </Link>
          )}
          <Link
            href="/explore/teams"
            className="rounded-full bg-secondary px-4 py-2 text-[14px] font-semibold"
          >
            Team boards
          </Link>
        </div>
      </header>

      {view === "tracker" ? (
        <Suspense
          fallback={
            <div className="sports-card h-[480px] animate-pulse bg-secondary/40" />
          }
        >
          <StandingsTrackerIsland season={season} />
        </Suspense>
      ) : (
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
      )}
    </main>
  );
}

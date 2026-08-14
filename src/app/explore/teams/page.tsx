import Link from "next/link";
import { Suspense } from "react";

import { TeamSeasonTable } from "@/components/explore/team-season-table";
import { TeamSeasonToolbar } from "@/components/explore/team-season-toolbar";
import { BrowseCircles } from "@/components/sports/browse-circles";
import {
  getAvailableSeasons,
  getTeamSeasonStats,
} from "@/data/queries";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";

export const metadata = {
  title: "Teams",
  description:
    "NBA team advanced stats - differential, true shooting, eFG%, and more.",
};

interface ExploreTeamsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ExploreTeamsPage({
  searchParams,
}: ExploreTeamsPageProps) {
  const params = await searchParams;
  const seasons = await getAvailableSeasons();
  const defaultSeason =
    seasons[0] ?? canonicalSeasonFromStartYear(currentNbaStartYear());
  const seasonParam = params.season;
  const season =
    typeof seasonParam === "string" && seasonParam.length
      ? seasonParam
      : defaultSeason;

  const teams = await getTeamSeasonStats(season).catch(() => []);

  return (
    <main className="site-shell flex flex-1 flex-col gap-5 py-6 sm:py-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Teams
          </p>
          <h1 className="mt-1 text-[28px] font-bold tracking-tight sm:text-[32px]">
            Team boards
          </h1>
          <p className="mt-1 max-w-xl text-[15px] text-muted-foreground">
            Team efficiency board for {season} - sorted by point differential by
            default. Click a team to open its analytical profile.
          </p>
        </div>
        <Link
          href="/standings"
          className="rounded-full bg-secondary px-4 py-2 text-[13px] font-semibold"
        >
          Standings
        </Link>
      </header>

      <Suspense
        fallback={
          <div className="h-12 w-40 animate-pulse rounded-xl bg-secondary" />
        }
      >
        <TeamSeasonToolbar seasons={seasons} defaultSeason={defaultSeason} />
      </Suspense>

      <section className="sports-card px-4 py-4">
        <h2 className="mb-3 text-[15px] font-bold">Jump to team profile</h2>
        <BrowseCircles mode="teams" />
      </section>

      <div className="pb-8">
        <TeamSeasonTable teams={teams} />
      </div>
    </main>
  );
}

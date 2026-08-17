import { Suspense } from "react";

import { TeamFilterToolbar } from "@/components/explore/team-filter-toolbar";
import { TeamSeasonTable } from "@/components/explore/team-season-table";
import { AutoRefresh } from "@/components/system/auto-refresh";
import {
  getAvailableSeasons,
  getFilteredTeamSeasons,
} from "@/data/queries";

export const revalidate = 60;

export const metadata = {
  title: "Explore Teams | Basketball Analytics",
  description:
    "Team standings, ratings, and efficiency — filter by conference and sort by net rating, offense, defense, and more.",
};

interface ExploreTeamsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ExploreTeamsPage({
  searchParams,
}: ExploreTeamsPageProps) {
  const params = await searchParams;
  const seasons = await getAvailableSeasons();
  const defaultSeason = seasons[0] ?? "2024-25";
  const seasonParam = Array.isArray(params.season)
    ? params.season[0]
    : params.season;
  const conferenceRaw = Array.isArray(params.conference)
    ? params.conference[0]
    : params.conference;
  const season = seasonParam ?? defaultSeason;
  const conference =
    conferenceRaw === "East" || conferenceRaw === "West"
      ? conferenceRaw
      : "ALL";

  const teams = await getFilteredTeamSeasons({ season, conference });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Explore</p>
        <h1 className="text-3xl font-semibold tracking-tight">Teams</h1>
        <p className="max-w-2xl text-muted-foreground">
          League team stats — record, points, offensive/defensive rating, true
          shooting, and pace. Click a team for roster detail.
        </p>
        <AutoRefresh />
      </header>

      <Suspense
        fallback={
          <div className="h-24 animate-pulse rounded-xl border border-border bg-muted/40" />
        }
      >
        <TeamFilterToolbar seasons={seasons} defaultSeason={defaultSeason} />
      </Suspense>

      <Suspense
        fallback={
          <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/40" />
        }
      >
        <TeamSeasonTable teams={teams} />
      </Suspense>
    </main>
  );
}

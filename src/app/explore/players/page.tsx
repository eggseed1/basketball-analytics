import { Suspense } from "react";

import { PlayerUsageTsScatter } from "@/components/charts/player-usage-ts-scatter";
import { PlayerFilterToolbar } from "@/components/explore/player-filter-toolbar";
import { PlayerSeasonTable } from "@/components/explore/player-season-table";
import {
  getAvailableSeasons,
  getFilteredPlayerSeasons,
  getTeams,
} from "@/data/queries";
import { filtersFromSearchParams } from "@/lib/search-params";

export const metadata = {
  title: "Explore Players | Basketball Analytics",
  description:
    "Filterable player exploration with usage vs true shooting scatter and searchable table.",
};

interface ExplorePlayersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ExplorePlayersPage({
  searchParams,
}: ExplorePlayersPageProps) {
  const params = await searchParams;
  const seasons = await getAvailableSeasons();
  const defaultSeason = seasons[0] ?? "2024-25";

  const filters = filtersFromSearchParams({
    ...params,
    season: params.season ?? defaultSeason,
  });

  const [players, teams] = await Promise.all([
    getFilteredPlayerSeasons(filters),
    getTeams(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Explore</p>
        <h1 className="text-3xl font-semibold tracking-tight">Players</h1>
        <p className="max-w-2xl text-muted-foreground">
          Compare player efficiency and usage. Filters run once in the data
          layer and drive both the chart and the table.
        </p>
      </header>

      <Suspense
        fallback={
          <div className="h-28 animate-pulse rounded-xl border border-border bg-muted/40" />
        }
      >
        <PlayerFilterToolbar
          seasons={seasons}
          teams={teams}
          defaultSeason={defaultSeason}
        />
      </Suspense>

      <PlayerUsageTsScatter players={players} />
      <PlayerSeasonTable players={players} />
    </main>
  );
}

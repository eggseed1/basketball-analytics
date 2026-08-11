import { Suspense } from "react";

import { GameScoringScatter } from "@/components/charts/game-scoring-scatter";
import { GameFilterToolbar } from "@/components/explore/game-filter-toolbar";
import { GameSeasonTable } from "@/components/explore/game-season-table";
import {
  getAvailableSeasons,
  getFilteredGames,
  getTeams,
} from "@/data/queries";
import { filtersFromSearchParams } from "@/lib/search-params";

export const metadata = {
  title: "Explore Games | Basketball Analytics",
  description:
    "Filterable game exploration with scoring vs margin scatter and searchable table.",
};

interface ExploreGamesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ExploreGamesPage({
  searchParams,
}: ExploreGamesPageProps) {
  const params = await searchParams;
  const seasons = await getAvailableSeasons();
  const defaultSeason = seasons[0] ?? "2024-25";

  const filters = filtersFromSearchParams({
    ...params,
    season: params.season ?? defaultSeason,
  });

  const [games, teams] = await Promise.all([
    getFilteredGames(filters),
    getTeams(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Explore</p>
        <h1 className="text-3xl font-semibold tracking-tight">Games</h1>
        <p className="max-w-2xl text-muted-foreground">
          Analyze completed games by total scoring and home margin. Filters run
          once in the data layer and drive both the chart and the table.
        </p>
      </header>

      <Suspense
        fallback={
          <div className="h-28 animate-pulse rounded-xl border border-border bg-muted/40" />
        }
      >
        <GameFilterToolbar
          seasons={seasons}
          teams={teams}
          defaultSeason={defaultSeason}
        />
      </Suspense>

      <GameScoringScatter games={games} />
      <GameSeasonTable games={games} />
    </main>
  );
}

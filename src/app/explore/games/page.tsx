import { Suspense } from "react";

import { GameScoringScatter } from "@/components/charts/game-scoring-scatter";
import { ExploreGamesClientShell } from "@/components/explore/explore-games-client-shell";
import { GameSeasonTable } from "@/components/explore/game-season-table";
import { TeamCatalogFallbackNotice } from "@/components/explore/team-catalog-fallback-notice";
import { DecadeChips } from "@/components/sports/decade-chips";
import { GameScoreCard } from "@/components/sports/game-score-card";
import {
  getAvailableSeasons,
  getFilteredGames,
  getTeamsCatalog,
} from "@/data/queries";
import { filtersFromSearchParams } from "@/lib/search-params";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Games",
  description: "NBA games from 1960 to present with score cards and filters.",
};

interface ExploreGamesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ExploreGamesPage({
  searchParams,
}: ExploreGamesPageProps) {
  const params = await searchParams;
  const seasons = await getAvailableSeasons();
  const defaultSeason =
    seasons.find((s) => s.startsWith("1969")) ??
    seasons.find((s) => s.startsWith("1960")) ??
    seasons[0] ??
    canonicalSeasonFromStartYear(currentNbaStartYear());

  const filters = filtersFromSearchParams({
    ...params,
    season: params.season ?? defaultSeason,
  });

  const [games, teamCatalog] = await Promise.all([
    getFilteredGames(filters),
    getTeamsCatalog(),
  ]);
  const { teams, source, warnings } = teamCatalog;

  const cards = games.slice(0, 12);
  const TABLE_CAP = 200;
  const SCATTER_CAP = 400;
  const tableGames = games.slice(0, TABLE_CAP);
  const scatterGames =
    games.length <= SCATTER_CAP
      ? games
      : games.filter(
          (_, i) => i % Math.ceil(games.length / SCATTER_CAP) === 0
        );
  const truncated = games.length > TABLE_CAP;

  return (
    <main className="site-shell flex flex-1 flex-col gap-5 py-6 sm:py-8">
      <header className="flex flex-col gap-1">
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Games
        </p>
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
          Explore
        </h1>
      </header>

      <TeamCatalogFallbackNotice source={source} warnings={warnings} />

      <Suspense fallback={null}>
        <DecadeChips seasons={seasons} />
      </Suspense>

      <Suspense
        fallback={
          <div className="h-20 animate-pulse rounded-md bg-secondary" />
        }
      >
        <ExploreGamesClientShell
          seasons={seasons}
          teams={teams}
          defaultSeason={defaultSeason}
        >
          <section className="flex flex-col gap-1">
            {cards.length === 0 ? (
              <div className="sports-card px-4 py-8 text-center text-sm text-muted-foreground">
                No games for this season filter.
              </div>
            ) : (
              cards.map((game) => <GameScoreCard key={game.id} game={game} />)
            )}
          </section>

          <div className="pb-8">
            <GameScoringScatter games={scatterGames} />
            <div className="mt-4">
              <GameSeasonTable games={tableGames} />
              {truncated ? (
                <p className="mt-2 text-[12px] text-muted-foreground">
                  Showing {tableGames.length} of {games.length} games. Narrow the
                  season or date filters for the full set.
                </p>
              ) : null}
            </div>
          </div>
        </ExploreGamesClientShell>
      </Suspense>
    </main>
  );
}

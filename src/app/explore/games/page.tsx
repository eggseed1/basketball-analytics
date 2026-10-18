import { Suspense } from "react";

import { GameScoringScatterLazy as GameScoringScatter } from "@/components/charts/recharts-lazy";
import { ExploreGamesClientShell } from "@/components/explore/explore-games-client-shell";
import { GameSeasonTable } from "@/components/explore/game-season-table";
import { TeamCatalogFallbackNotice } from "@/components/explore/team-catalog-fallback-notice";
import { MotionReveal } from "@/components/continuity/motion-reveal";
import { PageHeader } from "@/components/layout/page-header";
import { DecadeChips } from "@/components/sports/decade-chips";
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
  alternates: { canonical: "/explore/games" },
  title: "NBA game archive",
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
    <main data-motion-page className="site-shell flex flex-1 flex-col gap-5 py-6 sm:py-8">
      <MotionReveal />
      <PageHeader title="Explore" />

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
          <GameSeasonTable games={tableGames} />
          {truncated ? (
            <p className="text-[12px] text-muted-foreground">
              Showing {tableGames.length} of {games.length} games. Narrow the
              season or date filters for the full set.
            </p>
          ) : null}
          <GameScoringScatter games={scatterGames} />
        </ExploreGamesClientShell>
      </Suspense>
    </main>
  );
}

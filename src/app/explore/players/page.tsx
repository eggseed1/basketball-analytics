import { Suspense } from "react";

import { PlayerFilterToolbar } from "@/components/explore/player-filter-toolbar";
import { PlayerBoardHealthBanner } from "@/components/explore/player-board-health-banner";
import { TeamCatalogFallbackNotice } from "@/components/explore/team-catalog-fallback-notice";
import { parsePlayerSeasonSortKey } from "@/lib/player-season-sort";
import { PlayerSeasonTable } from "@/components/explore/player-season-table";
import { getAvailableSeasons, getTeamsCatalog } from "@/data/queries";
import { getPlayerSeasonBoardSnapshot } from "@/data/queries/player-data-health";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { filtersFromSearchParams } from "@/lib/search-params";

export const metadata = {
  title: "Players",
  description: "NBA player leaderboard with seasons from 1960 to present.",
};

interface ExplorePlayersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ExplorePlayersPage({
  searchParams,
}: ExplorePlayersPageProps) {
  const params = await searchParams;
  const seasons = await getAvailableSeasons();
  const defaultSeason =
    seasons[0] ?? canonicalSeasonFromStartYear(currentNbaStartYear());

  const filters = filtersFromSearchParams({
    ...params,
    season: params.season ?? defaultSeason,
  });
  const initialSortKey = parsePlayerSeasonSortKey(params.sort);

  const [board, teamCatalog] = await Promise.all([
    getPlayerSeasonBoardSnapshot(filters),
    getTeamsCatalog(),
  ]);
  const { rows: players, health } = board;
  const { teams, source, warnings } = teamCatalog;

  return (
    <main className="site-shell flex flex-1 flex-col gap-5 py-6 sm:py-8">
      <header className="flex flex-col gap-1">
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Players
        </p>
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
          Leaderboard
        </h1>
        {initialSortKey ? (
          <p className="text-[13px] text-muted-foreground">
            Sorted by {initialSortKey} - change any column header to re-rank.
          </p>
        ) : null}
      </header>

      <PlayerBoardHealthBanner health={health} />
      <TeamCatalogFallbackNotice source={source} warnings={warnings} />

      <Suspense
        fallback={
          <div className="h-20 animate-pulse rounded-md bg-secondary" />
        }
      >
        <PlayerFilterToolbar
          seasons={seasons}
          teams={teams}
          defaultSeason={defaultSeason}
        />
      </Suspense>

      <div className="pb-8">
        {players.length === 0 ? (
          <section className="sports-card px-4 py-8 text-center text-[14px] text-muted-foreground">
            {health.status === "provider_failure"
              ? "Live NBA player data could not be loaded."
              : health.status === "sample_dataset"
                ? "This environment is using the local sample dataset."
                : health.status === "season_unsupported"
                  ? "Player-season board data is unavailable for this season from the current provider."
                  : "No qualifying player-season rows found."}
          </section>
        ) : (
          <PlayerSeasonTable
            players={players}
            initialSortKey={initialSortKey}
          />
        )}
      </div>
    </main>
  );
}

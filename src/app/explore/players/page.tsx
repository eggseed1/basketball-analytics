import { Suspense } from "react";

import { SeasonNotStartedNotice } from "@/components/explore/season-not-started-notice";
import { ExplorePlayersClientShell } from "@/components/explore/explore-players-client-shell";
import { PlayerBoardHealthBanner } from "@/components/explore/player-board-health-banner";
import { TeamCatalogFallbackNotice } from "@/components/explore/team-catalog-fallback-notice";
import { PageHeader } from "@/components/layout/page-header";
import { parsePlayerSeasonSortKey } from "@/lib/player-season-sort";
import { PlayerSeasonTable } from "@/components/explore/player-season-table";
import { getAvailableSeasons, getTeamsCatalog } from "@/data/queries";
import {
  getExplorePlayersBoardView,
  parseExplorePlayersSortDir,
} from "@/data/queries/explore-players-board";
import { defaultExplorePlayersSeason } from "@/lib/player-board-season";
import { filtersFromSearchParams, isAllSeasonsParam } from "@/lib/search-params";
import { DEFAULT_PLAYER_MINIMUM_MINUTES } from "@/data/types";

export const metadata = {
  title: "Players",
  description:
    "NBA player leaderboard with seasons from 1960 to present. DRBL/100 and WAR1 for registry seasons.",
};

interface ExplorePlayersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function TableSkeleton() {
  return (
    <div
      className="sports-card h-[28rem] animate-pulse bg-secondary/60"
      aria-hidden
    />
  );
}

async function ExplorePlayersBoard({
  searchParams,
  defaultSeason,
}: {
  searchParams: Record<string, string | string[] | undefined>;
  defaultSeason: string;
}) {
  const filters = filtersFromSearchParams({
    ...searchParams,
    season: isAllSeasonsParam(searchParams.season)
      ? "ALL"
      : searchParams.season ?? defaultSeason,
    minimumMinutes:
      searchParams.minimumMinutes ?? String(DEFAULT_PLAYER_MINIMUM_MINUTES),
  });
  const season = isAllSeasonsParam(filters.season)
    ? "ALL"
    : filters.season ?? defaultSeason;
  const initialSortKey = parsePlayerSeasonSortKey(searchParams.sort);
  const sortKey = initialSortKey;
  const sortDir = sortKey
    ? parseExplorePlayersSortDir(searchParams.dir, sortKey)
    : undefined;

  const view = await getExplorePlayersBoardView({
    filters,
    sortKey,
    sortDir,
    page: 1,
  });

  if (view.totalCount === 0) {
    return (
      <div className="query-updating-content flex flex-col gap-3">
        <PlayerBoardHealthBanner health={view.health} />
        <section className="sports-card px-4 py-8 text-center text-[14px] text-muted-foreground">
          {view.health.status === "provider_failure"
            ? "Live player data is temporarily unavailable. Please try again shortly."
            : view.health.status === "sample_dataset"
              ? "This environment is using the local sample dataset."
              : view.health.status === "season_unsupported"
                ? "Player-season board data is unavailable for this season from the current provider."
                : view.health.status === "board_unavailable"
                  ? "Live player data could not be loaded for this season."
                  : "No qualifying player-season rows found."}
        </section>
      </div>
    );
  }

  return (
    <div className="query-updating-content flex flex-col gap-3">
      {view.seasonAwaitingGames ? (
        <SeasonNotStartedNotice
          season={view.requestSeason || season}
          statsSeason={view.usingPriorSeasonStats ? view.statsSeason : undefined}
        />
      ) : null}
      <PlayerSeasonTable
        players={view.rows}
        season={season}
        totalCount={view.totalCount}
        pageSize={view.pageSize}
        pageCount={view.pageCount}
        sortKey={view.sortKey}
        sortDir={view.sortDir}
        hasDarko={view.hasDarko}
        hasRaptor={view.hasRaptor}
        hasDrbl={view.hasDrbl}
        seasonAwaitingGames={view.seasonAwaitingGames}
      />
    </div>
  );
}

export default async function ExplorePlayersPage({
  searchParams,
}: ExplorePlayersPageProps) {
  const params = await searchParams;
  const [seasons, teamCatalog] = await Promise.all([
    getAvailableSeasons(),
    getTeamsCatalog(),
  ]);
  const defaultSeason = defaultExplorePlayersSeason(seasons);
  const { teams, source, warnings } = teamCatalog;

  return (
    <main className="site-shell flex min-w-0 max-w-full flex-1 flex-col gap-5 overflow-x-clip py-6 sm:py-8">
      <PageHeader
        title="Players"
        subtitle={
          parsePlayerSeasonSortKey(params.sort)
            ? `Sorted by ${parsePlayerSeasonSortKey(params.sort)} - change any column header to re-rank.`
            : undefined
        }
      />

      <TeamCatalogFallbackNotice source={source} warnings={warnings} />

      <Suspense
        fallback={
          <div className="flex flex-col gap-5">
            <div className="h-20 animate-pulse rounded-md bg-secondary" />
            <TableSkeleton />
          </div>
        }
      >
        <ExplorePlayersClientShell
          seasons={seasons}
          teams={teams}
          defaultSeason={defaultSeason}
        >
          {/*
            No remount key: during startTransition navigations React keeps the
            already-revealed board visible instead of flashing the skeleton.
          */}
          <Suspense fallback={<TableSkeleton />}>
            <ExplorePlayersBoard
              searchParams={params}
              defaultSeason={defaultSeason}
            />
          </Suspense>
        </ExplorePlayersClientShell>
      </Suspense>
    </main>
  );
}

import { Suspense } from "react";

import { DrblSeasonSupportNotice } from "@/components/explore/drbl-season-support-notice";
import { ExplorePlayersClientShell } from "@/components/explore/explore-players-client-shell";
import { PlayerBoardHealthBanner } from "@/components/explore/player-board-health-banner";
import { TeamCatalogFallbackNotice } from "@/components/explore/team-catalog-fallback-notice";
import { parsePlayerSeasonSortKey } from "@/lib/player-season-sort";
import { PlayerSeasonTable } from "@/components/explore/player-season-table";
import { listDrblSeasons } from "@/data/drbl/season-registry";
import { getAvailableSeasons, getTeamsCatalog } from "@/data/queries";
import {
  getExplorePlayersBoardView,
  parseExplorePlayersSortDir,
} from "@/data/queries/explore-players-board";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { filtersFromSearchParams } from "@/lib/search-params";
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
    season: searchParams.season ?? defaultSeason,
    minimumMinutes:
      searchParams.minimumMinutes ?? String(DEFAULT_PLAYER_MINIMUM_MINUTES),
  });
  const season = filters.season ?? defaultSeason;
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
        <DrblSeasonSupportNotice season={season} />
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
      <DrblSeasonSupportNotice season={season} />
      <PlayerSeasonTable
        players={view.rows}
        season={season}
        totalCount={view.totalCount}
        pageSize={view.pageSize}
        pageCount={view.pageCount}
        sortKey={view.sortKey}
        sortDir={view.sortDir}
        hasDarko={view.hasDarko}
        hasLebron={view.hasLebron}
        hasDrbl={view.hasDrbl}
      />
    </div>
  );
}

export default async function ExplorePlayersPage({
  searchParams,
}: ExplorePlayersPageProps) {
  const params = await searchParams;
  const seasons = await getAvailableSeasons();
  const defaultSeason =
    seasons[0] ?? canonicalSeasonFromStartYear(currentNbaStartYear());
  const drblSeasons = listDrblSeasons();

  const teamCatalog = await getTeamsCatalog();
  const { teams, source, warnings } = teamCatalog;

  return (
    <main className="site-shell flex flex-1 flex-col gap-5 py-6 sm:py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
          Players
        </h1>
        <p className="max-w-2xl text-[14px] text-muted-foreground">
          Box-score exploration spans the archive. Canonical DRBL/100 and WAR1
          appear only for DRBL registry seasons ({drblSeasons.join(", ")}
          ).
        </p>
        {parsePlayerSeasonSortKey(params.sort) ? (
          <p className="text-[14px] text-muted-foreground">
            Sorted by {parsePlayerSeasonSortKey(params.sort)} - change any
            column header to re-rank.
          </p>
        ) : null}
      </header>

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

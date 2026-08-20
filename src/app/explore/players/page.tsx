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
  parseExplorePlayersPage,
  parseExplorePlayersSortDir,
} from "@/data/queries/explore-players-board";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { filtersFromSearchParams } from "@/lib/search-params";

export const metadata = {
  title: "Players",
  description:
    "NBA player directory from 1946-47. DRBL/100 and WAR1 for registry seasons from 2020-21.",
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
  });
  const season = filters.season ?? defaultSeason;
  const initialSortKey = parsePlayerSeasonSortKey(searchParams.sort);
  const sortKey = initialSortKey;
  const sortDir = sortKey
    ? parseExplorePlayersSortDir(searchParams.dir, sortKey)
    : undefined;
  const page = parseExplorePlayersPage(searchParams.page);

  const view = await getExplorePlayersBoardView({
    filters,
    sortKey,
    sortDir,
    page,
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
      <PlayerBoardHealthBanner health={view.health} />
      <PlayerSeasonTable
        players={view.rows}
        totalCount={view.totalCount}
        page={view.page}
        pageSize={view.pageSize}
        pageCount={view.pageCount}
        sortKey={view.sortKey}
        sortDir={view.sortDir}
        hasDarko={view.hasDarko}
        hasLebron={view.hasLebron}
        hasDrbl={view.hasDrbl}
        boardSampleSize={view.boardSampleSize}
        contextPools={view.contextPools}
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
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Players
        </p>
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
          All Players
        </h1>
        <p className="max-w-2xl text-[13px] text-muted-foreground">
          Season directory of every player with factual game participation
          (1996-97+ archive). This is not the DRBL leaderboard — DRBL/100 and
          WAR1 appear only for supported seasons ({drblSeasons.join(", ")}) via
          left join and never decide who is listed.
        </p>
        {parsePlayerSeasonSortKey(params.sort) ? (
          <p className="text-[13px] text-muted-foreground">
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

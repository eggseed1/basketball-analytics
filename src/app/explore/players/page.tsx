import { Suspense } from "react";

import { MotionReveal } from "@/components/continuity/motion-reveal";
import { SeasonNotStartedNotice } from "@/components/explore/season-not-started-notice";
import { ExplorePlayersClientShell } from "@/components/explore/explore-players-client-shell";
import { PlayerBoardHealthBanner } from "@/components/explore/player-board-health-banner";
import { TeamCatalogFallbackNotice } from "@/components/explore/team-catalog-fallback-notice";
import { PageHeader } from "@/components/layout/page-header";
import {
  parsePlayerSeasonSortKey,
  type PlayerSeasonSortKey,
} from "@/lib/player-season-sort";
import { PlayerSeasonTable } from "@/components/explore/player-season-table";
import { getAvailableSeasons, getTeamsCatalog } from "@/data/queries";
import {
  getExplorePlayersBoardView,
  parseExplorePlayersSortDir,
} from "@/data/queries/explore-players-board";
import { parsePlayerBoardRate } from "@/lib/explore-players-display";
import { boardColumnLabel } from "@/lib/player-board-stats";
import { defaultExplorePlayersSeason } from "@/lib/player-board-season";
import { filtersFromSearchParams, isAllSeasonsParam } from "@/lib/search-params";
import { DEFAULT_PLAYER_MINIMUM_MINUTES } from "@/data/types";

export const metadata = {
  alternates: { canonical: "/explore/players" },
  title: "NBA player stats leaderboard",
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

type BoardLoad = {
  view: Awaited<ReturnType<typeof getExplorePlayersBoardView>>;
  season: string;
};

async function loadBoard(
  searchParams: Record<string, string | string[] | undefined>,
  defaultSeason: string
): Promise<BoardLoad> {
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
  const sortKey = parsePlayerSeasonSortKey(searchParams.sort);
  const sortDir = sortKey
    ? parseExplorePlayersSortDir(searchParams.dir, sortKey)
    : undefined;

  const view = await getExplorePlayersBoardView({
    filters,
    sortKey,
    sortDir,
    rate: parsePlayerBoardRate([searchParams.rate].flat()[0] ?? null),
    page: 1,
  });
  return { view, season };
}

function sortSubtitle(label: string): string {
  return `Sorted by ${label}. Click any column header to re-rank.`;
}

/** The board falls back to its default sort when the asked-for column is empty. */
async function SortSubtitle({
  requested,
  load,
}: {
  requested: PlayerSeasonSortKey;
  load: Promise<BoardLoad>;
}) {
  const { view } = await load;
  if (view.sortKey === requested) return sortSubtitle(boardColumnLabel(requested));
  return `No ${boardColumnLabel(requested)} for this season, so the board is sorted by ${boardColumnLabel(view.sortKey)}.`;
}

async function ExplorePlayersBoard({ load }: { load: Promise<BoardLoad> }) {
  const { view, season } = await load;

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
        emptyColumns={view.emptyColumns}
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
  const subtitleSort = parsePlayerSeasonSortKey(params.sort);
  const load = loadBoard(params, defaultSeason);

  return (
    <main data-motion-page className="site-shell flex min-w-0 max-w-full flex-1 flex-col gap-5 overflow-x-clip py-6 sm:py-8">
      <MotionReveal />
      <PageHeader
        title="Players"
        subtitle={
          subtitleSort ? (
            <Suspense fallback={sortSubtitle(boardColumnLabel(subtitleSort))}>
              <SortSubtitle requested={subtitleSort} load={load} />
            </Suspense>
          ) : undefined
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
            <ExplorePlayersBoard load={load} />
          </Suspense>
        </ExplorePlayersClientShell>
      </Suspense>
    </main>
  );
}

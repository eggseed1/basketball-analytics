import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

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
import { teamsFromCanonicalIdentity } from "@/data/queries/teams-catalog";
import { listCanonicalSeasons } from "@/data/providers/historical/season-range";
import {
  parsePlayerBoardRate,
  parsePlayerBoardViews,
} from "@/lib/explore-players-display";
import { boardColumnLabel } from "@/lib/player-board-stats";
import {
  defaultExploreMinimumMinutes,
  defaultExplorePlayersSeason,
} from "@/lib/player-board-season";
import { filtersFromSearchParams, isAllSeasonsParam } from "@/lib/search-params";

export const metadata = {
  alternates: { canonical: "/explore/players" },
  title: "NBA advanced stats leaderboard",
  description:
    "NBA advanced stats leaderboard on DRBL: DRBL/100, WAR1, efficiency, and counting stats from 1960 to the current season.",
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
  view: Awaited<
    ReturnType<
      typeof import("@/data/queries/explore-players-board").getExplorePlayersBoardView
    >
  >;
  season: string;
};

async function loadBoard(
  searchParams: Record<string, string | string[] | undefined>,
  defaultSeason: string
): Promise<BoardLoad> {
  const {
    explorePlayersFirstPageMeta,
    getExplorePlayersFirstPageSnapshot,
    matchesExplorePlayersFirstPage,
  } = await import("@/data/runtime/explore-players-first-page");
  const bakeKey = explorePlayersFirstPageMeta().key;

  const seasonForMinutes = isAllSeasonsParam(searchParams.season)
    ? "ALL"
    : String(
        (Array.isArray(searchParams.season)
          ? searchParams.season[0]
          : searchParams.season) ?? defaultSeason
      );
  const defaultMinutes =
    bakeKey?.season === seasonForMinutes && bakeKey.minimumMinutes != null
      ? bakeKey.minimumMinutes
      : defaultExploreMinimumMinutes(seasonForMinutes);
  const filters = filtersFromSearchParams({
    ...searchParams,
    season: isAllSeasonsParam(searchParams.season)
      ? "ALL"
      : searchParams.season ?? defaultSeason,
    minimumMinutes:
      searchParams.minimumMinutes ?? String(defaultMinutes),
  });
  const season = isAllSeasonsParam(filters.season)
    ? "ALL"
    : filters.season ?? defaultSeason;
  const sortKey = parsePlayerSeasonSortKey(searchParams.sort);
  const rate = parsePlayerBoardRate([searchParams.rate].flat()[0] ?? null);
  const boardViews = parsePlayerBoardViews(
    [searchParams.view].flat()[0] ?? null
  );

  // Hit the 35KB first-page bake before importing the board query module
  // (pulls players.ts + season-tables). Cold default /explore/players stays thin.
  const bakeOpts = {
    filters,
    sortKey,
    rate,
    boardViews,
    page: 1 as const,
  };
  if (matchesExplorePlayersFirstPage(bakeOpts)) {
    const baked = getExplorePlayersFirstPageSnapshot();
    if (baked) return { view: baked.view as BoardLoad["view"], season };
  }

  const { getExplorePlayersBoardView, parseExplorePlayersSortDir } =
    await import("@/data/queries/explore-players-board");
  const sortDir = sortKey
    ? parseExplorePlayersSortDir(searchParams.dir, sortKey)
    : undefined;

  const view = await getExplorePlayersBoardView({
    filters,
    sortKey,
    sortDir,
    rate,
    boardViews,
    page: 1,
    // Context pools are unused on this page (no row-context panel wired).
    includeContext: false,
  });
  return { view, season };
}

/** The board falls back to its default sort when the asked-for column is empty. */
async function SortSubtitle({
  requested,
  load,
}: {
  requested: PlayerSeasonSortKey;
  load: Promise<BoardLoad>;
}) {
  const t = await getTranslations("Players");
  const { view } = await load;
  const requestedLabel = boardColumnLabel(requested);
  if (view.sortKey === requested) {
    return t("sortedBy", { label: requestedLabel });
  }
  return t("sortFallbackNoColumn", {
    requested: requestedLabel,
    actual: boardColumnLabel(view.sortKey),
  });
}

async function ExplorePlayersBoard({ load }: { load: Promise<BoardLoad> }) {
  const t = await getTranslations("Players");
  const { view, season } = await load;

  if (view.totalCount === 0) {
    const emptyMessage =
      view.health.status === "provider_failure"
        ? t("emptyProviderFailure")
        : view.health.status === "sample_dataset"
          ? t("emptySampleDataset")
          : view.health.status === "season_unsupported"
            ? t("emptySeasonUnsupported")
            : view.health.status === "board_unavailable"
              ? t("emptyBoardUnavailable")
              : t("emptyNoRows");
    return (
      <div className="query-updating-content flex flex-col gap-3">
        <PlayerBoardHealthBanner health={view.health} />
        <section className="sports-card px-4 py-8 text-center text-[14px] text-muted-foreground">
          {emptyMessage}
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
  const t = await getTranslations("Players");
  // Sync shell only — never touch season-tables / board-ready (pulls ~9MB JSON)
  // before header + Suspense can flush. Prefer the baked first-page season so
  // cold /explore/players hits the 35KB snapshot instead of a live board miss.
  const seasons = [...listCanonicalSeasons()].reverse();
  const teams = teamsFromCanonicalIdentity();
  const { explorePlayersFirstPageMeta } = await import(
    "@/data/runtime/explore-players-first-page"
  );
  const bakedSeason = explorePlayersFirstPageMeta().key?.season?.trim();
  const defaultSeason =
    bakedSeason || defaultExplorePlayersSeason(seasons, new Date());
  const subtitleSort = parsePlayerSeasonSortKey(params.sort);
  const load = loadBoard(params, defaultSeason);

  return (
    <main data-motion-page className="site-shell flex min-w-0 max-w-full flex-1 flex-col gap-5 overflow-x-clip py-6 sm:py-8">
      <MotionReveal />
      <PageHeader
        title={t("title")}
        subtitle={
          subtitleSort ? (
            <Suspense
              fallback={t("sortedBy", {
                label: boardColumnLabel(subtitleSort),
              })}
            >
              <SortSubtitle requested={subtitleSort} load={load} />
            </Suspense>
          ) : undefined
        }
      />

      <TeamCatalogFallbackNotice source="canonical-fallback" warnings={[]} />

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
    </main>
  );
}

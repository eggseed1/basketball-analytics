import { Suspense } from "react";

import { PlayerUsageTsScatterLazy } from "@/components/charts/player-usage-ts-scatter-lazy";
import { BoardProvenanceDebug } from "@/components/explore/board-provenance-debug";
import { DrblSeasonSupportNotice } from "@/components/explore/drbl-season-support-notice";
import { PlayerFilterToolbar } from "@/components/explore/player-filter-toolbar";
import { PlayerSeasonTable } from "@/components/explore/player-season-table";
import { AutoRefresh } from "@/components/system/auto-refresh";
import { listDrblSeasons } from "@/data/drbl/season-registry";
import {
  getAvailableSeasons,
  getFilteredPlayerSeasons,
  getTeams,
} from "@/data/queries";
import { filtersFromSearchParams } from "@/lib/search-params";

/** Historical explore data; rely on provider caches rather than 60s ISR churn. */
export const revalidate = 300;

export const metadata = {
  title: "Explore Players | Basketball Analytics",
  description:
    "Filterable player exploration with DRBL/100 ability, R1 Points, and R1 Win Equivalents.",
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

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Explore</p>
        <h1 className="text-3xl font-semibold tracking-tight">Players</h1>
        <p className="max-w-2xl text-muted-foreground">
          Pick any season back to 1951-52 for box-score exploration. Canonical
          DRBL/100 and R1 value fields are published only for seasons in the
          DRBL registry ({listDrblSeasons().join(", ")}).
        </p>
        <AutoRefresh enabled={false} />
      </header>

      <Suspense
        fallback={
          <div className="h-28 animate-pulse rounded-xl border border-border bg-muted/40" />
        }
      >
        <ExploreToolbarShell seasons={seasons} defaultSeason={defaultSeason} />
      </Suspense>

      <Suspense
        fallback={
          <div className="flex flex-col gap-6">
            <div className="h-80 animate-pulse rounded-xl border border-border bg-muted/40" />
            <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/40" />
          </div>
        }
      >
        <ExplorePlayersBody filters={filters} />
      </Suspense>
    </main>
  );
}

async function ExploreToolbarShell({
  seasons,
  defaultSeason,
}: {
  seasons: string[];
  defaultSeason: string;
}) {
  const teams = await getTeams();
  return (
    <PlayerFilterToolbar
      seasons={seasons}
      teams={teams}
      defaultSeason={defaultSeason}
    />
  );
}

async function ExplorePlayersBody({
  filters,
}: {
  filters: Parameters<typeof getFilteredPlayerSeasons>[0];
}) {
  const players = await getFilteredPlayerSeasons(filters);
  const season = filters?.season ?? "2025-26";
  return (
    <>
      <DrblSeasonSupportNotice season={season} />
      <Suspense fallback={null}>
        <BoardProvenanceDebug season={season} />
      </Suspense>
      <PlayerUsageTsScatterLazy players={players} />
      <PlayerSeasonTable players={players} pageSize={50} />
    </>
  );
}

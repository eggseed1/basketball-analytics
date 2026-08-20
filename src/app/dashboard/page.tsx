import Link from "next/link";
import { Suspense } from "react";

import { DashboardWorkspace } from "@/components/dashboard/dashboard-workspace";
import { PlayerSeasonSelect } from "@/components/player/player-season-select";
import { AutoRefresh } from "@/components/system/auto-refresh";
import {
  getAvailableSeasons,
  getFilteredPlayerSeasons,
} from "@/data/queries";
import { toDashboardPlayer } from "@/lib/dashboard-player";

export const revalidate = 60;

export const metadata = {
  title: "Dashboard",
  description:
    "Contour/Quiver-style multi-board dashboard with chart-to-chart filtering.",
};

/**
 * P17.1 classification: SECONDARY_LAB / DEFER_DRBL (INTENTIONALLY_DEFERRED).
 * Not a primary DRBL hierarchy surface - box Contour boards only for now.
 */

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const DASHBOARD_MIN_MINUTES = 500;

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const sp = await searchParams;
  // Instant - no league fetch.
  const seasons = await getAvailableSeasons();
  const seasonParam = Array.isArray(sp.season) ? sp.season[0] : sp.season;
  const season = seasonParam ?? seasons[0] ?? "2024-25";

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">
            Analytical results · Contour / Quiver-style boards
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Histograms, categorical bars, and scatters with chart-to-chart
            filtering - click bars to keep matching players across every board.
          </p>
          <AutoRefresh />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Suspense fallback={null}>
            <PlayerSeasonSelect seasons={seasons} current={season} />
          </Suspense>
          <Link
            href={`/explore/players?season=${season}`}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Open explore table →
          </Link>
        </div>
      </header>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardBoards season={season} />
      </Suspense>
    </main>
  );
}

async function DashboardBoards({ season }: { season: string }) {
  const players = await getFilteredPlayerSeasons({
    season,
    minimumMinutes: DASHBOARD_MIN_MINUTES,
  });
  const slim = players.map(toDashboardPlayer);
  return <DashboardWorkspace players={slim} season={season} />;
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
      <div className="h-9 animate-pulse rounded border border-border bg-muted/40" />
      <div className="grid gap-3 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[220px] animate-pulse rounded border border-border bg-muted/30"
          />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="h-[280px] animate-pulse rounded border border-border bg-muted/30" />
        <div className="h-[280px] animate-pulse rounded border border-border bg-muted/30" />
      </div>
      <p className="text-xs text-muted-foreground">Loading league boards…</p>
    </div>
  );
}

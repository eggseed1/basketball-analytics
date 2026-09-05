import { Suspense } from "react";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { StandingsConferenceTable } from "@/components/standings/standings-conference-table";
import { EmptyState, Skeleton } from "@/components/ui/empty-state";
import { getLeagueStandings } from "@/data/queries";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Standings",
  description:
    "NBA conference standings — W/L, games back, and scoring margin.",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(
  sp: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

async function StandingsBody({ season }: { season: string }) {
  let data;
  try {
    data = await getLeagueStandings(season);
  } catch {
    return (
      <EmptyState
        title="Standings temporarily unavailable"
        description="Try again shortly."
      />
    );
  }

  const east = data.conferences.find((c) => c.conference === "East")?.rows ?? [];
  const west = data.conferences.find((c) => c.conference === "West")?.rows ?? [];

  if (!east.length && !west.length) {
    return (
      <EmptyState
        title={`No standings for ${season}`}
        description="Rows appear once the season schedule is live."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {data.season !== season ? (
        <p
          className={cn(
            type.bodySm,
            "w-fit max-w-full rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-muted-foreground"
          )}
          role="status"
        >
          Showing {data.season} final standings — {season} season has not
          started.
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <StandingsConferenceTable title="Eastern Conference" rows={east} />
        <StandingsConferenceTable title="Western Conference" rows={west} />
      </div>
    </div>
  );
}

export default async function StandingsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const seasonParam = one(sp, "season");

  // Legacy query-param tracker → dedicated page.
  if (one(sp, "view") === "tracker") {
    const qs = new URLSearchParams();
    if (seasonParam) qs.set("season", seasonParam);
    const suffix = qs.toString();
    redirect(suffix ? `/standings/tracker?${suffix}` : "/standings/tracker");
  }

  const currentSeason = canonicalSeasonFromStartYear(currentNbaStartYear());
  const season =
    seasonParam && /^\d{4}-\d{2}$/.test(seasonParam)
      ? seasonParam
      : currentSeason;

  return (
    <main className="site-shell flex flex-1 flex-col gap-5 py-6 sm:py-8">
      <PageHeader
        eyebrow="Standings"
        title="Standings"
        subtitle={`${season} conference race — W/L, games back, and scoring margin.`}
      />

      <Suspense
        fallback={
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-80 w-full" />
            <Skeleton className="h-80 w-full" />
          </div>
        }
      >
        <StandingsBody season={season} />
      </Suspense>
    </main>
  );
}

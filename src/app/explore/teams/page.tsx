import { Suspense } from "react";

import { TeamSeasonTable } from "@/components/explore/team-season-table";
import { TeamSeasonToolbar } from "@/components/explore/team-season-toolbar";
import { PageHeader } from "@/components/layout/page-header";
import { getAvailableSeasons } from "@/data/queries";
import { getTeamSeasonStats } from "@/data/queries/team-seasons";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { isPreseasonRosterSeason } from "@/data/providers/nba/espn-roster-client";
import { preferBundledProductDataOnEdge } from "@/data/providers/nba/runtime-policy";
import { shiftCanonicalSeason } from "@/lib/player-stat-comps";
import { withBudget } from "@/data/queries/budget";
import type { TeamSeasonStats } from "@/data/types/team-season";

export const metadata = {
  title: "Teams",
  description:
    "NBA team advanced stats - differential, true shooting, eFG%, and more.",
};

interface ExploreTeamsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function resolveExploreTeamsSeason(
  seasons: string[],
  seasonParam: string | string[] | undefined
): string {
  const current = canonicalSeasonFromStartYear(currentNbaStartYear());
  if (typeof seasonParam === "string" && seasonParam.length) {
    return seasonParam;
  }
  // Prefer a completed board season during preseason so metrics are populated.
  if (isPreseasonRosterSeason(current)) {
    const prior = shiftCanonicalSeason(current, -1);
    if (seasons.includes(prior)) return prior;
  }
  return seasons[0] ?? current;
}

function BoardFallback() {
  return (
    <div className="flex flex-col gap-6 pb-8" aria-busy="true">
      <div className="h-72 animate-pulse rounded-xl bg-secondary" />
    </div>
  );
}

async function TeamsBoard({ season }: { season: string }) {
  const budgetMs = preferBundledProductDataOnEdge() ? 1_500 : 6_000;
  const result = await withBudget(
    getTeamSeasonStats(season).catch(() => [] as TeamSeasonStats[]),
    budgetMs,
    [] as TeamSeasonStats[]
  );
  const teams = result.value;

  return (
    <div className="flex flex-col gap-6 pb-8">
      <TeamSeasonTable teams={teams} />
    </div>
  );
}

export default async function ExploreTeamsPage({
  searchParams,
}: ExploreTeamsPageProps) {
  const params = await searchParams;
  const seasons = await getAvailableSeasons();
  const defaultSeason = resolveExploreTeamsSeason(seasons, undefined);
  const season = resolveExploreTeamsSeason(seasons, params.season);

  return (
    <main className="site-shell flex flex-1 flex-col gap-5 py-6 sm:py-8">
      <PageHeader
        title="Teams"
        subtitle={`Efficiency board for ${season} — sorted by point differential by default. Click a team to open its profile.`}
      />

      <Suspense
        fallback={
          <div className="h-24 animate-pulse rounded-md bg-secondary" />
        }
      >
        <TeamSeasonToolbar seasons={seasons} defaultSeason={defaultSeason} />
      </Suspense>

      <Suspense fallback={<BoardFallback />}>
        <TeamsBoard season={season} />
      </Suspense>
    </main>
  );
}

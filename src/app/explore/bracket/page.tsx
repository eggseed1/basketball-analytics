import { Suspense } from "react";

import { PlayoffBracket } from "@/components/explore/playoff-bracket";
import { TeamSeasonToolbar } from "@/components/explore/team-season-toolbar";
import { PageHeader } from "@/components/layout/page-header";
import { getPlayoffBracketModel } from "@/data/queries/playoff-bracket";
import { getAvailableSeasons } from "@/data/queries";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { isPreseasonRosterSeason } from "@/data/providers/nba/espn-roster-client";
import { preferBundledProductDataOnEdge } from "@/data/providers/nba/runtime-policy";
import { shiftCanonicalSeason } from "@/lib/player-stat-comps";
import { withBudget } from "@/data/queries/budget";

export const metadata = {
  title: "Playoff bracket",
  description:
    "NBA playoff bracket — projected and completed postseason matchups by season.",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function resolveBracketSeason(
  seasons: string[],
  seasonParam: string | string[] | undefined
): string {
  const current = canonicalSeasonFromStartYear(currentNbaStartYear());
  if (typeof seasonParam === "string" && seasonParam.length) {
    return seasonParam;
  }
  if (isPreseasonRosterSeason(current)) {
    const prior = shiftCanonicalSeason(current, -1);
    if (seasons.includes(prior)) return prior;
  }
  return seasons[0] ?? current;
}

function BracketFallback() {
  return (
    <div className="h-72 animate-pulse rounded-xl bg-secondary" aria-busy="true" />
  );
}

async function BracketBody({ season }: { season: string }) {
  const budgetMs = preferBundledProductDataOnEdge() ? 1_500 : 6_000;
  const result = await withBudget(
    getPlayoffBracketModel(season).catch(() => null),
    budgetMs,
    null
  );
  const bracket = result.value?.model ?? null;

  if (!bracket) {
    return (
      <div className="rounded-md border border-border bg-secondary/40 px-4 py-8 text-center text-[14px] text-muted-foreground">
        Playoff bracket is temporarily unavailable for {season}.
      </div>
    );
  }

  return <PlayoffBracket model={bracket} />;
}

export default async function ExploreBracketPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const seasons = await getAvailableSeasons();
  const defaultSeason = resolveBracketSeason(seasons, undefined);
  const season = resolveBracketSeason(seasons, params.season);

  return (
    <main className="site-shell flex flex-1 flex-col gap-5 py-6 sm:py-8">
      <PageHeader
        eyebrow="Standings"
        title="Playoff bracket"
        subtitle={`${season} postseason bracket — projected seeds and series results.`}
      />

      <Suspense
        fallback={
          <div className="h-12 w-40 animate-pulse rounded-xl bg-secondary" />
        }
      >
        <TeamSeasonToolbar seasons={seasons} defaultSeason={defaultSeason} />
      </Suspense>

      <Suspense fallback={<BracketFallback />}>
        <BracketBody season={season} />
      </Suspense>
    </main>
  );
}

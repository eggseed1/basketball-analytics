import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { StandingsTrackerIsland } from "@/components/standings/standings-tracker-island";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { getStandingsTrackerSeasonOptions } from "@/data/queries/standings-tracker";

export const metadata = {
  title: "Standings tracker",
  description:
    "NBA standings race tracker — games above .500 over the regular season.",
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

export default async function StandingsTrackerPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const seasonOptions = getStandingsTrackerSeasonOptions();
  const currentSeason = canonicalSeasonFromStartYear(currentNbaStartYear());
  const defaultSeason =
    seasonOptions.find((option) => option !== "2026-27") ??
    seasonOptions[0] ??
    currentSeason;
  const seasonParam = one(sp, "season");
  const season =
    seasonParam && /^\d{4}-\d{2}$/.test(seasonParam)
      ? seasonParam
      : defaultSeason;

  return (
    <main className="site-shell flex flex-1 flex-col gap-5 py-6 sm:py-8">
      <PageHeader
        eyebrow="Standings"
        title="Standings tracker"
        subtitle={`${season} race tracker — games above .500 over the regular season.`}
      />

      <Suspense
        fallback={
          <div className="sports-card h-[480px] animate-pulse bg-secondary/40" />
        }
      >
        <StandingsTrackerIsland season={season} />
      </Suspense>
    </main>
  );
}

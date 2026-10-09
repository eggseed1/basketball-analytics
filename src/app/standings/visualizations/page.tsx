import { Suspense } from "react";

import { StandingsDiffBoard } from "@/components/charts/standings-diff-board";
import { HashAnchorScroll } from "@/components/continuity/hash-anchor-scroll";
import { MotionReveal } from "@/components/continuity/motion-reveal";
import { PageHeader } from "@/components/layout/page-header";
import { StandingsMarginSkeleton } from "@/components/standings/standings-body-skeleton";
import { StandingsTrackerIsland } from "@/components/standings/standings-tracker-island";
import { getLeagueStandings } from "@/data/queries";
import { resolveStandingsSeason } from "@/data/queries/standings-season";
import { getStandingsTrackerSeasonOptions } from "@/data/queries/standings-tracker";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Team visualizations",
  description:
    "NBA standings race tracker (games above .500 over the season) and team scoring margin chart.",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function MarginBody({ season }: { season: string }) {
  let data;
  try {
    data = await getLeagueStandings(season);
  } catch {
    return null;
  }
  const east = data.conferences.find((c) => c.conference === "East")?.rows ?? [];
  const west = data.conferences.find((c) => c.conference === "West")?.rows ?? [];
  if (!east.length && !west.length) return null;

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
          Scoring margin shows {data.season} because the {season} season has
          not started.
        </p>
      ) : null}
      <StandingsDiffBoard season={data.season} east={east} west={west} />
    </div>
  );
}

export default async function TeamVisualizationsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const season = resolveStandingsSeason(getStandingsTrackerSeasonOptions(), sp.season);

  return (
    <main data-motion-page className="site-shell flex flex-1 flex-col gap-5 py-6 sm:py-8">
      <MotionReveal />
      <HashAnchorScroll />
      <PageHeader
        eyebrow="Teams"
        title="Visualizations"
        subtitle={`${season} race tracker (games above .500 over the regular season) and scoring margin for every team.`}
      />

      <section id="tracker" className="scroll-mt-48">
        <StandingsTrackerIsland season={season} />
      </section>

      <section id="margin" className="scroll-mt-48 pb-8">
        <Suspense fallback={<StandingsMarginSkeleton />}>
          <MarginBody season={season} />
        </Suspense>
      </section>
    </main>
  );
}

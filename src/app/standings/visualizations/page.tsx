import { Suspense } from "react";

import { StandingsDiffBoard } from "@/components/charts/standings-diff-board";
import { MotionReveal } from "@/components/continuity/motion-reveal";
import { PageHeader } from "@/components/layout/page-header";
import { StandingsMarginSkeleton } from "@/components/standings/standings-body-skeleton";
import { StandingsTrackerIsland } from "@/components/standings/standings-tracker-island";
import { TeamVizHub } from "@/components/standings/team-viz-hub";
import { TeamVizQuarters } from "@/components/standings/team-viz-quarters";
import { TeamVizScatter } from "@/components/standings/team-viz-scatter";
import { EmptyState } from "@/components/ui/empty-state";
import { getLeagueStandings } from "@/data/queries";
import { resolveStandingsSeason } from "@/data/queries/standings-season";
import { getStandingsTrackerSeasonOptions } from "@/data/queries/standings-tracker";
import { getTeamVizRows, teamVizBoxSeasons } from "@/data/queries/team-visualizations";
import { type } from "@/lib/design-system";
import {
  parseTeamVizConference,
  parseTeamVizView,
  TEAM_VIZ_SCATTERS,
  TEAM_VIZ_VIEWS,
  type TeamVizConference,
  type TeamVizRow,
  type TeamVizView,
} from "@/lib/team-viz";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Team visualizations",
  description:
    "NBA team charts: standings race, scoring margin, offense vs defense, pace, shot diet, possession battle, luck, home and road splits, close games, and quarter-by-quarter scoring.",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p
      className={cn(
        type.bodySm,
        "w-fit max-w-full rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-muted-foreground"
      )}
      role="status"
    >
      {children}
    </p>
  );
}

async function MarginBody({
  season,
  conference,
}: {
  season: string;
  conference: TeamVizConference | null;
}) {
  let data;
  try {
    data = await getLeagueStandings(season);
  } catch {
    return <EmptyState title="Scoring margin temporarily unavailable" description="Try again shortly." />;
  }
  const east = data.conferences.find((c) => c.conference === "East")?.rows ?? [];
  const west = data.conferences.find((c) => c.conference === "West")?.rows ?? [];
  if (!east.length && !west.length) {
    return <EmptyState title={`No standings for ${season}`} description="Rows appear once the season schedule is live." />;
  }

  return (
    <div className="flex flex-col gap-3">
      {data.season !== season ? (
        <Note>
          Scoring margin shows {data.season} because the {season} season has not started.
        </Note>
      ) : null}
      <StandingsDiffBoard
        season={data.season}
        east={conference === "West" ? [] : east}
        west={conference === "East" ? [] : west}
      />
    </div>
  );
}

function boxCoverage(rows: TeamVizRow[]): { covered: number; total: number } {
  const total = rows.reduce((s, r) => s + r.games, 0) / 2;
  const covered = rows.reduce((s, r) => s + (r.box?.games ?? 0), 0) / 2;
  return { covered: Math.round(covered), total: Math.round(total) };
}

function GameBasedBody({ view, season }: { view: TeamVizView; season: string }) {
  const rows = getTeamVizRows(season);
  if (!rows.length) {
    return (
      <EmptyState
        title={`No final games in ${season} yet`}
        description="These charts fill in once regular-season games are played."
      />
    );
  }

  if (view === "quarters") return <TeamVizQuarters rows={rows} season={season} />;

  const spec = TEAM_VIZ_SCATTERS[view]!;
  if (spec.needsBox) {
    const { covered, total } = boxCoverage(rows);
    if (!covered) {
      const boxSeasons = teamVizBoxSeasons();
      return (
        <EmptyState
          title={`${spec.title} isn't available for ${season}`}
          description={`It needs team box-score totals, which are archived for ${boxSeasons.at(-1)} through ${boxSeasons[0]}. Luck, Home vs road, Close games, and Quarter by quarter work for every season.`}
        />
      );
    }
    return (
      <div className="flex flex-col gap-3">
        <TeamVizScatter view={view} rows={rows} season={season} />
        {covered < total ? (
          <Note>
            {`${covered.toLocaleString()} of ${total.toLocaleString()} ${season} games have box-score stats. ${
              total - covered === 1
                ? "The missing game isn't in the archive yet and is left out of this chart."
                : `The other ${(total - covered).toLocaleString()} aren't in the archive yet and are left out of this chart.`
            }`}
          </Note>
        ) : null}
      </div>
    );
  }

  return <TeamVizScatter view={view} rows={rows} season={season} />;
}

export default async function TeamVisualizationsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const seasonOptions = getStandingsTrackerSeasonOptions();
  const season = resolveStandingsSeason(seasonOptions, sp.season);
  const view = parseTeamVizView(one(sp, "view"));
  const conference = parseTeamVizConference(one(sp, "conf"));
  const viewLabel = TEAM_VIZ_VIEWS.find((v) => v.id === view)?.label ?? "Race tracker";

  return (
    <main data-motion-page className="site-shell flex flex-1 flex-col gap-5 py-6 sm:py-8">
      <MotionReveal />
      <PageHeader
        eyebrow="Teams"
        title="Visualizations"
        subtitle={`${season} · ${viewLabel}. Every chart is built from regular-season games. Pick a view, filter by conference, or highlight teams.`}
      />

      <Suspense fallback={<div className="h-20 animate-pulse rounded-xl bg-secondary" />}>
        <TeamVizHub view={view} season={season} seasonOptions={seasonOptions} />
      </Suspense>

      <section className="pb-8">
        {view === "race" ? (
          <StandingsTrackerIsland season={season} embedded conference={conference ?? "All"} />
        ) : view === "margin" ? (
          <Suspense fallback={<StandingsMarginSkeleton />}>
            <MarginBody season={season} conference={conference} />
          </Suspense>
        ) : (
          <Suspense fallback={<div className="sports-card h-[480px] animate-pulse bg-secondary/40" />}>
            <GameBasedBody view={view} season={season} />
          </Suspense>
        )}
      </section>
    </main>
  );
}

import { Suspense } from "react";
import { redirect } from "next/navigation";

import { HashAnchorScroll } from "@/components/continuity/hash-anchor-scroll";
import { MotionReveal } from "@/components/continuity/motion-reveal";
import { PlayoffBracket } from "@/components/explore/playoff-bracket";
import { TeamSeasonTable } from "@/components/explore/team-season-table";
import { TeamSeasonToolbar } from "@/components/explore/team-season-toolbar";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";
import { StandingsConferenceTable } from "@/components/standings/standings-conference-table";
import { EmptyState } from "@/components/ui/empty-state";
import { StandingsBodySkeleton } from "@/components/standings/standings-body-skeleton";
import { getAvailableSeasons, getLeagueStandings } from "@/data/queries";
import { withBudget } from "@/data/queries/budget";
import { getPlayoffBracketModel } from "@/data/queries/playoff-bracket";
import {
  defaultStandingsSeason,
  resolveStandingsSeason,
} from "@/data/queries/standings-season";
import { getTeamSeasonStats } from "@/data/queries/team-seasons";
import { preferBundledProductDataOnEdge } from "@/data/providers/nba/runtime-policy";
import type { TeamSeasonStats } from "@/data/types/team-season";
import { type } from "@/lib/design-system";
import { standingsVisualizationsHref } from "@/lib/standings-routes";
import { cn } from "@/lib/utils";
import { yieldForStreaming } from "@/lib/stream-yield";

export const metadata = {
  title: "Standings",
  description:
    "NBA conference standings, playoff bracket, and team efficiency stats by season.",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type ConferenceFilter = "East" | "West" | null;

function one(
  sp: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function parseConference(raw: string | undefined): ConferenceFilter {
  const v = raw?.toLowerCase();
  return v === "east" ? "East" : v === "west" ? "West" : null;
}

function edgeBudgetMs(): number {
  return preferBundledProductDataOnEdge() ? 1_500 : 6_000;
}

async function ConferenceTables({
  season,
  conference,
}: {
  season: string;
  conference: ConferenceFilter;
}) {
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
          Showing {data.season} final standings because the {season} season
          has not started.
        </p>
      ) : null}
      <div className={cn("grid gap-4", !conference && "lg:grid-cols-2")}>
        {conference !== "West" ? (
          <StandingsConferenceTable title="Eastern Conference" rows={east} />
        ) : null}
        {conference !== "East" ? (
          <StandingsConferenceTable title="Western Conference" rows={west} />
        ) : null}
      </div>
    </div>
  );
}

async function BracketBody({ season }: { season: string }) {
  const result = await withBudget(
    getPlayoffBracketModel(season).catch(() => null),
    edgeBudgetMs(),
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

async function TeamStatsBody({ season }: { season: string }) {
  const result = await withBudget(
    getTeamSeasonStats(season).catch(() => [] as TeamSeasonStats[]),
    edgeBudgetMs(),
    [] as TeamSeasonStats[]
  );
  return <TeamSeasonTable teams={result.value} />;
}

export default async function StandingsPage({ searchParams }: PageProps) {
  await yieldForStreaming();
  const sp = await searchParams;

  if (one(sp, "view") === "tracker") {
    redirect(standingsVisualizationsHref(one(sp, "season")));
  }

  const seasons = await getAvailableSeasons();
  const defaultSeason = defaultStandingsSeason(seasons);
  const season = resolveStandingsSeason(seasons, sp.season);
  const conference = parseConference(one(sp, "conference"));

  return (
    <main data-motion-page className="site-shell flex flex-1 flex-col gap-5 py-6 sm:py-8">
      <MotionReveal />
      <HashAnchorScroll />
      <PageHeader
        eyebrow="Teams"
        title="Standings"
        subtitle={`${season} conference standings, playoff bracket, and team efficiency. Click a team to open its profile.`}
      />

      <Suspense fallback={<div className="h-12 animate-pulse rounded-xl bg-secondary" />}>
        <TeamSeasonToolbar seasons={seasons} defaultSeason={defaultSeason} />
      </Suspense>

      <section id="conferences" className="scroll-mt-48">
        <Suspense fallback={<StandingsBodySkeleton />}>
          <ConferenceTables season={season} conference={conference} />
        </Suspense>
      </section>

      <section id="bracket" className="scroll-mt-48">
        <Suspense
          fallback={<div className="h-72 animate-pulse rounded-xl bg-secondary" aria-busy="true" />}
        >
          <BracketBody season={season} />
        </Suspense>
      </section>

      <section id="team-stats" className="flex scroll-mt-48 flex-col gap-3 pb-8">
        <SectionHeader
          title="Team stats"
          description="Point differential, shooting, and per-game box stats for every team. Sort any column."
        />
        <Suspense
          fallback={<div className="h-72 animate-pulse rounded-xl bg-secondary" aria-busy="true" />}
        >
          <TeamStatsBody season={season} />
        </Suspense>
      </section>
    </main>
  );
}

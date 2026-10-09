import { Suspense } from "react";
import { notFound } from "next/navigation";

import { GlassSurface, GlassTintScaleProvider } from "@/components/brand/glass-surface";
import { PageAtmosphere } from "@/components/brand/page-atmosphere";
import { TeamLogo } from "@/components/brand/team-logo";
import { DestinationClientShell } from "@/components/continuity/destination-client-shell";
import { DestinationSectionSkeleton } from "@/components/continuity/destination-loading-frame";
import { MotionReveal } from "@/components/continuity/motion-reveal";
import { TransitionLink } from "@/components/continuity/query-nav";
import { FranchiseTimeline } from "@/components/teams/franchise-timeline";
import { TeamArcIsland } from "@/components/teams/team-arc-island";
import { TeamFranchiseHistoryIsland } from "@/components/teams/team-franchise-history-island";
import { TeamMatchupPreview } from "@/components/teams/team-matchup-preview";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { getTeamSeasonBoardCached } from "@/data/queries/request-cache";
import { type } from "@/lib/design-system";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { isSeasonAwaitingFirstGame } from "@/lib/nba-season-status";
import { shiftCanonicalSeason } from "@/lib/player-stat-comps";
import { resolveTeamIdentityFallback, teamPageHref } from "@/lib/team-destination";
import { resolveTeamFromBoard } from "@/lib/team-explorer";
import { yieldForStreaming } from "@/lib/stream-yield";
import { cn } from "@/lib/utils";

const TEAM_CARD_TINT_SCALE = 0.3;

interface TeamHistoryPageProps {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function resolveHistoryTeam(teamId: string, season: string) {
  const board = await getTeamSeasonBoardCached(season);
  const boardTeam = resolveTeamFromBoard(board.rows, teamId);
  const fallback = boardTeam ? null : resolveTeamIdentityFallback(teamId, season, "modern_surface");
  if (!boardTeam && !fallback) return null;
  return {
    board: board.rows,
    teamId: boardTeam?.teamId ?? fallback!.teamId,
    abbreviation: boardTeam?.abbreviation ?? fallback!.abbreviation,
    fullName: boardTeam?.fullName ?? fallback!.fullName,
  };
}

export async function generateMetadata({ params, searchParams }: TeamHistoryPageProps) {
  await yieldForStreaming();
  const { teamId } = await params;
  const season = first((await searchParams).season) ?? canonicalSeasonFromStartYear(currentNbaStartYear());
  const team = await resolveHistoryTeam(teamId, season);
  return {
    title: team ? `${team.fullName} history` : "Franchise history",
    alternates: { canonical: `/teams/${encodeURIComponent(team?.teamId ?? teamId)}/history` },
    description: team
      ? `${team.fullName} titles, retired numbers, franchise timeline, season arc, and head-to-head records.`
      : undefined,
  };
}

export default async function TeamHistoryPage({ params, searchParams }: TeamHistoryPageProps) {
  await yieldForStreaming();
  const { teamId } = await params;
  const sp = await searchParams;
  const seasonParam = first(sp.season);
  const currentSeason = canonicalSeasonFromStartYear(currentNbaStartYear());
  const season = seasonParam ?? currentSeason;
  const priorSeason = shiftCanonicalSeason(season, -1);
  const showingFullArc = first(sp.arc) === "full";

  const team = await resolveHistoryTeam(teamId, season);
  if (!team) notFound();

  const priorBoard = isSeasonAwaitingFirstGame(season, team.board)
    ? []
    : (await getTeamSeasonBoardCached(priorSeason)).rows;
  const brand = resolveTeamBrand(team.abbreviation);
  const askTeamId = brand?.espnTeamId ?? team.teamId;
  const atmosphere = brandAtmosphereColors(brand?.primary, brand?.secondary);
  const backHref = teamPageHref(teamId, { season });

  return (
    <DestinationClientShell>
      <PageAtmosphere colorA={atmosphere?.colorA} colorB={atmosphere?.colorB} />
      <GlassTintScaleProvider scale={TEAM_CARD_TINT_SCALE}>
        <main data-motion-page className="site-shell relative z-[1] flex flex-col gap-4 py-5 sm:gap-5 sm:py-7">
          <MotionReveal />
          <GlassSurface
            as="header"
            effect="css"
            backdropBlur={16}
            accentColor={atmosphere?.colorA}
            accentColorB={atmosphere?.colorB}
            className="px-4 py-5 sm:px-5"
          >
            <div className="flex flex-wrap items-center gap-4">
              <TeamLogo teamKey={team.abbreviation} size="xl" priority />
              <div className="min-w-0 flex-1 basis-[10rem]">
                <p className={cn(type.caption, "font-semibold uppercase tracking-[0.12em] text-muted-foreground")}>
                  <TransitionLink href={backHref} className="underline-offset-2 hover:underline">
                    <span aria-hidden>←</span> {team.abbreviation} {season}
                  </TransitionLink>
                </p>
                <h1 className={cn(type.display, "mt-0.5")}>{team.fullName} history</h1>
                <p className={cn(type.caption, "mt-1.5 text-muted-foreground")}>
                  Titles, retired numbers, the franchise timeline, a season-by-season arc, and head-to-head records.
                </p>
              </div>
            </div>
          </GlassSurface>

          <div data-motion-stack className="flex flex-col gap-4">
            <TeamFranchiseHistoryIsland
              abbreviation={team.abbreviation}
              franchiseToken={brand?.id}
            />
            <FranchiseTimeline canonicalTeamId={team.teamId} />
            <Suspense fallback={<DestinationSectionSkeleton label="Loading Team Arc…" />}>
              <TeamArcIsland
                teamRouteKey={teamId}
                teamId={team.teamId}
                teamName={team.fullName}
                abbreviation={team.abbreviation}
                season={season}
                priorSeason={priorSeason}
                showingFullArc={showingFullArc}
                teamEspnId={askTeamId}
                currentBoard={team.board}
                priorBoard={priorBoard}
              />
            </Suspense>
            <TeamMatchupPreview canonicalTeamId={team.teamId} />
          </div>
        </main>
      </GlassTintScaleProvider>
    </DestinationClientShell>
  );
}

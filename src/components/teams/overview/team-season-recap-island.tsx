import { analyzeTeamProfile } from "@/analytics";
import { TransitionLink } from "@/components/continuity/query-nav";
import { TeamOverviewVisuals } from "@/components/teams/overview/team-overview-visuals";
import { withBudget } from "@/data/queries/budget";
import { getTeamSeasonBoardCached } from "@/data/queries/request-cache";
import { type } from "@/lib/design-system";
import { teamPageHref } from "@/lib/team-destination";
import { resolveTeamFromBoard } from "@/lib/team-explorer";
import { buildTeamRankedMetrics } from "@/lib/team-page-metrics";
import { cn } from "@/lib/utils";

/** Preseason overview: the full visual board for the season that just ended. */
export async function TeamSeasonRecapIsland({
  routeTeamId,
  season,
}: {
  routeTeamId: string;
  season: string;
}) {
  const board = (await withBudget(getTeamSeasonBoardCached(season), 6_000, null)).value;
  const league = board?.rows ?? [];
  const team = resolveTeamFromBoard(league, routeTeamId);
  if (!team) return null;

  const analysis = analyzeTeamProfile({ team, league, prior: null });
  const ranked = buildTeamRankedMetrics({ team, league, prior: null, standing: null, traits: analysis.traits });

  return (
    <section className="flex flex-col gap-4" aria-label={`${season} in review`}>
      <div className="flex flex-wrap items-end justify-between gap-2 pt-2">
        <div>
          <h2 className={cn(type.title2, "font-bold tracking-tight")}>{season} in review</h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            Last season&apos;s results and league ranks, shown until the new season has games.
          </p>
        </div>
        <TransitionLink
          href={teamPageHref(routeTeamId, { season })}
          className={cn(type.caption, "font-semibold underline")}
        >
          Open the {season} page <span data-motion-arrow aria-hidden>→</span>
        </TransitionLink>
      </div>
      <TeamOverviewVisuals
        team={team}
        league={league}
        ranked={ranked}
        traits={analysis.traits}
        howTheyWin={analysis.howTheyWin}
        season={season}
      />
    </section>
  );
}

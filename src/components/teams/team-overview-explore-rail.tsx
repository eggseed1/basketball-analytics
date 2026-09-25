import { GlassSurface } from "@/components/brand/glass-surface";
import { TransitionLink } from "@/components/continuity/query-nav";
import { type } from "@/lib/design-system";
import {
  teamPageHref,
  type TeamPageHrefOpts,
  type TeamPageTab,
} from "@/lib/team-destination";
import { cn } from "@/lib/utils";

const RAIL: Array<{
  tab: TeamPageTab;
  title: string;
  blurb: string;
}> = [
  {
    tab: "players",
    title: "Players",
    blurb: "Roster board and season lines",
  },
  {
    tab: "lineups",
    title: "Rotation",
    blurb: "Starter / bench minutes ladder",
  },
  {
    tab: "offense",
    title: "Offense",
    blurb: "Scoring, usage, and efficiency",
  },
  {
    tab: "defense",
    title: "Defense",
    blurb: "Hustle tracking and stocks",
  },
  {
    tab: "games",
    title: "Games",
    blurb: "Schedule and recent results",
  },
  {
    tab: "stats",
    title: "All Stats",
    blurb: "Full trait ledger and evidence",
  },
  {
    tab: "organization",
    title: "Organization",
    blurb: "Front office, cap, movement",
  },
];

/** Overview hub links — one job per destination tab. */
export function TeamOverviewExploreRail({
  teamId,
  hrefOpts,
}: {
  teamId: string;
  hrefOpts: TeamPageHrefOpts;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {RAIL.map((item) => (
        <GlassSurface
          key={item.tab}
          effect="css"
          className="flex flex-col gap-1 p-3.5 sm:p-4"
        >
          <TransitionLink
            href={teamPageHref(teamId, { ...hrefOpts, tab: item.tab })}
            className={cn(
              type.bodySm,
              "font-semibold text-foreground underline-offset-2 hover:underline"
            )}
          >
            {item.title}
          </TransitionLink>
          <p className={cn(type.caption, "text-muted-foreground")}>
            {item.blurb}
          </p>
        </GlassSurface>
      ))}
    </div>
  );
}

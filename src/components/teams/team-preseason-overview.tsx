import Link from "next/link";

import { SeasonNotStartedNotice } from "@/components/explore/season-not-started-notice";
import { GlassSurface } from "@/components/brand/glass-surface";
import { type } from "@/lib/design-system";
import { formatPct } from "@/lib/format";
import type { TeamStandingsDisplay } from "@/lib/team-standings-context";
import { cn } from "@/lib/utils";

export function TeamPreseasonOverview({
  season,
  teamName,
  teamId,
  standings,
}: {
  season: string;
  teamName: string;
  teamId: string;
  standings: TeamStandingsDisplay;
}) {
  const prior = standings.priorSeasonStanding;
  const division = standings.divisionMeta;

  return (
    <div className="flex flex-col gap-4">
      <SeasonNotStartedNotice season={season} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {prior ? (
          <GlassSurface effect="css" className="flex flex-col gap-2 p-4">
            <p
              className={cn(
                type.caption,
                "font-semibold uppercase tracking-wide text-muted-foreground"
              )}
            >
              Prior season
            </p>
            <p className={cn(type.page, "tabular-nums")}>
              {prior.wins}-{prior.losses}
            </p>
            <p className={cn(type.caption, "text-muted-foreground")}>
              {standings.priorSeasonLabel} final
              {prior.winPct != null
                ? ` · ${formatPct(prior.winPct, 0)}`
                : ""}
              {prior.rank ? ` · #${prior.rank} ${prior.conference}` : ""}
            </p>
          </GlassSurface>
        ) : null}

        {division ? (
          <GlassSurface effect="css" className="flex flex-col gap-2 p-4">
            <p
              className={cn(
                type.caption,
                "font-semibold uppercase tracking-wide text-muted-foreground"
              )}
            >
              Division
            </p>
            <p className={cn(type.page)}>{division.division}</p>
            <p className={cn(type.caption, "text-muted-foreground")}>
              {division.conference} · {division.divisionSize} teams
            </p>
          </GlassSurface>
        ) : null}

        <GlassSurface effect="css" className="flex flex-col gap-2 p-4">
          <p
            className={cn(
              type.caption,
              "font-semibold uppercase tracking-wide text-muted-foreground"
            )}
          >
            What&apos;s live now
          </p>
          <ul className={cn(type.bodySm, "flex flex-col gap-1.5 text-muted-foreground")}>
            <li>
              <Link
                href={`/teams/${teamId}?tab=players&season=${encodeURIComponent(season)}`}
                className="font-semibold text-foreground underline-offset-2 hover:underline"
              >
                Roster
              </Link>{" "}
              — ESPN preseason lists
            </li>
            <li>
              <Link
                href={`/teams/${teamId}?tab=organization&season=${encodeURIComponent(season)}`}
                className="font-semibold text-foreground underline-offset-2 hover:underline"
              >
                Organization
              </Link>{" "}
              — cap, movement, transactions
            </li>
            <li>
              <Link
                href={`/teams/${teamId}?tab=games&season=${encodeURIComponent(season)}`}
                className="font-semibold text-foreground underline-offset-2 hover:underline"
              >
                Schedule
              </Link>{" "}
              — upcoming tip-offs when posted
            </li>
          </ul>
        </GlassSurface>
      </div>

      <GlassSurface effect="css" className="flex flex-col gap-2 p-4 sm:p-5">
        <h2 className={type.heading}>Board analytics after tip-off</h2>
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          Strengths, weaknesses, and league percentiles for {teamName} need
          regular-season games. Overview metrics will populate once{" "}
          {season} stats exist on the team board.
        </p>
      </GlassSurface>
    </div>
  );
}

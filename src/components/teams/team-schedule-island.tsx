import type { ReactNode } from "react";

import { TeamScheduleView } from "@/components/teams/team-schedule-view";
import { type } from "@/lib/design-system";
import { teamPageHref } from "@/lib/team-destination";
import { buildTeamSchedule, regularSeasonGapNote } from "@/lib/team-schedule";
import { TransitionLink } from "@/components/continuity/query-nav";
import { cn } from "@/lib/utils";
import { ScheduleCalendar } from "@/components/teams/viz/schedule-calendar";
import { LocalTipTime } from "@/components/sports/local-tip-time";

const TILE =
  "frost-surface rounded-lg px-3 py-2.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.55)] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.07)]";

function SummaryTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
}) {
  return (
    <div className={TILE}>
      <p
        className={cn(
          type.micro,
          "font-bold uppercase tracking-[0.12em] text-muted-foreground"
        )}
      >
        {label}
      </p>
      <p className="mt-1 text-lg font-bold tabular-nums tracking-tight">
        {value}
      </p>
      {hint ? (
        <p className={cn(type.caption, "text-muted-foreground")}>{hint}</p>
      ) : null}
    </div>
  );
}

export function TeamScheduleIsland({
  teamId,
  season,
  teamKey,
}: {
  teamId: string;
  season: string;
  teamKey?: string;
}) {
  const { rows, summary } = buildTeamSchedule(teamId, season);

  if (rows.length === 0) {
    return (
      <section id="schedule" className="scroll-mt-16" aria-label="Schedule">
        <h2 className="text-[20px] font-bold tracking-tight">Schedule</h2>
        <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
          No schedule on file for {season}. Results from older seasons are on
          the{" "}
          <TransitionLink
            href={teamPageHref(teamId, { season, tab: "games" })}
            className="font-semibold underline underline-offset-2"
          >
            Games tab
          </TransitionLink>
          .
        </p>
      </section>
    );
  }

  const played = summary.wins + summary.losses;
  const next = summary.nextGame;
  const gapNote = regularSeasonGapNote(summary.regularSet);

  return (
    <section
      id="schedule"
      className="scroll-mt-16 flex flex-col gap-3"
      aria-label="Schedule"
    >
      <div>
        <h2 className="text-[20px] font-bold tracking-tight">Schedule</h2>
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          Every game on the {season} calendar, with results once they are
          final. Tip times are Eastern.
        </p>
      </div>
      <ScheduleCalendar rows={rows} season={season} teamKey={teamKey ?? teamId} />
      <div className="sports-card flex flex-col gap-5 p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <SummaryTile
            label={played > 0 ? "Record" : "Regular season"}
            value={
              played > 0
                ? `${summary.wins}-${summary.losses}`
                : `${summary.regularSet} games`
            }
            hint={
              played > 0
                ? summary.regularSet > played
                  ? `${summary.regularSet - played} games left`
                  : "Regular season complete"
                : summary.preseasonSet > 0
                  ? `Plus ${summary.preseasonSet} preseason`
                  : undefined
            }
          />
          <SummaryTile
            label="Home / away"
            value={`${summary.regularHome} / ${summary.regularAway}`}
            hint="Regular season"
          />
          <SummaryTile
            label="Back-to-backs"
            value={String(summary.backToBacks)}
            hint="Regular season"
          />
          <SummaryTile
            label="Next game"
            value={
              next ? `${next.home ? "vs" : "@"} ${next.oppAbbr}` : "—"
            }
            hint={
              next
                ? (
                    <>
                      <LocalTipTime tipOffAt={next.tipOffAt} style="date" fallback={next.dateLabel} />
                      {next.tipOffAt || next.timeLabel ? " · " : null}
                      <LocalTipTime tipOffAt={next.tipOffAt} style="clockZone" fallback={next.timeLabel} />
                    </>
                  )
                : "No upcoming games on file"
            }
          />
        </div>
        {gapNote ? (
          <p className={cn(type.caption, "-mt-2 text-muted-foreground")}>
            {gapNote}
          </p>
        ) : null}
        <TeamScheduleView rows={rows} />
        <p className={cn(type.caption, "text-muted-foreground")}>
          B2B marks the second night of a back-to-back. Play-In and NBA Cup
          final games are listed but sit outside the 82-game record. Each game
          opens in Game Lab.
        </p>
      </div>
    </section>
  );
}

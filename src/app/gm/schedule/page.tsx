"use client";

import { GmShell } from "@/gm/ui/gm-shell";
import { GmSeasonCalendar } from "@/gm/ui/gm-season-calendar";
import { GmCupBoard } from "@/gm/ui/gm-cup";
import { GmAllStarBoard } from "@/gm/ui/gm-allstar";
import { GmPlayoffBracket } from "@/gm/ui/gm-playoff-bracket";
import { GmPlayInSchedule } from "@/gm/ui/gm-play-in";
import { useGmStore } from "@/gm/state/gm-store";

export default function GmSchedulePage() {
  return (
    <GmShell>
      <ScheduleBody />
    </GmShell>
  );
}

function ScheduleBody() {
  const league = useGmStore((s) => s.league);
  if (!league) return null;

  const postseason = league.phase === "play_in" || league.phase === "playoffs" || Boolean(league.playoffBracket?.length);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-[28px] font-bold tracking-tight">
          {league.phase === "play_in" ? "Play-in" : league.phase === "playoffs" || league.playoffBracket?.length ? "Playoffs" : "Schedule"}
        </h1>
        <p className="text-[16px] text-muted-foreground">
          {league.phase === "play_in"
            ? "The 7 seed hosts the 8. The 9 seed hosts the 10. The last game fills the 8 seed."
            : league.phase === "playoffs" || league.playoffBracket?.length
              ? "The bracket is the schedule. Simulate a night and the scores land on the series."
              : "Real NBA tips for your franchise, with home and away marked on the calendar."}
        </p>
      </header>
      {league.phase === "play_in" && league.playIn ? <GmPlayInSchedule league={league} /> : null}
      {league.playoffBracket?.length ? <GmPlayoffBracket league={league} controls /> : null}
      {postseason ? null : (
        <>
          <GmSeasonCalendar league={league} />
          <GmCupBoard league={league} />
          <GmAllStarBoard league={league} />
        </>
      )}
    </div>
  );
}

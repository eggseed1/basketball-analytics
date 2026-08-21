"use client";

import { GmShell } from "@/gm/ui/gm-shell";
import { GmSeasonCalendar } from "@/gm/ui/gm-season-calendar";
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

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-[28px] font-bold tracking-tight">Schedule</h1>
        <p className="text-[16px] text-muted-foreground">
          Real NBA tips for your franchise - home and away marked on the
          calendar.
        </p>
      </header>
      <GmSeasonCalendar league={league} />
    </div>
  );
}

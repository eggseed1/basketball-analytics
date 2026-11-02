"use client";

import { useTranslations } from "next-intl";

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
  const t = useTranslations("GmUi");
  const league = useGmStore((s) => s.league);
  if (!league) return null;

  const postseason = league.phase === "play_in" || league.phase === "playoffs" || Boolean(league.playoffBracket?.length);
  const playoffs = league.phase === "playoffs" || Boolean(league.playoffBracket?.length);
  const pageKey = league.phase === "play_in" ? "PlayIn" : playoffs ? "Playoffs" : "Schedule";

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-[28px] font-bold tracking-tight">
          {t(`page${pageKey}Title`)}
        </h1>
        <p className="text-[16px] text-muted-foreground">{t(`page${pageKey}Blurb`)}</p>
      </header>
      {league.phase === "play_in" ? <GmPlayInSchedule league={league} /> : null}
      {league.playoffBracket?.length ? <GmPlayoffBracket league={league} controls /> : null}
      {league.playIn && league.phase !== "play_in" ? <details className="rounded-xl border border-border p-3">
        <summary className="cursor-pointer text-sm font-semibold">Play-in results</summary>
        <div className="mt-4"><GmPlayInSchedule league={league} /></div>
      </details> : null}
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


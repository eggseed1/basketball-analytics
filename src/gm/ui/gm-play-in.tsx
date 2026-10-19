"use client";

import { TeamLogo } from "@/components/brand/team-logo";
import { Button } from "@/components/ui/button";
import { useGmStore } from "@/gm/state/gm-store";
import type { GmLeagueState, GmPlayInConference } from "@/gm/types";

function abbr(league: GmLeagueState, id: string): string {
  return league.teams.find((team) => team.id === id)?.abbr ?? id.toUpperCase();
}

export function GmPlayInSchedule({ league }: { league: GmLeagueState }) {
  const board = league.playIn;
  const simPlayInNight = useGmStore((state) => state.simPlayInNight);
  const finishPlayIn = useGmStore((state) => state.finishPlayIn);
  if (!board) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => simPlayInNight()}>Sim tonight</Button>
        <Button variant="outline" onClick={() => finishPlayIn()}>
          Finish the play-in
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {board.conferences.map((conf) => (
          <Conference key={conf.conf} league={league} conf={conf} />
        ))}
      </div>
    </section>
  );
}

function Conference({ league, conf }: { league: GmLeagueState; conf: GmPlayInConference }) {
  const results = conf.results ?? [];
  return (
    <div className="rounded-xl border border-border">
      <p className="border-b border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground">{conf.conf}</p>
      <ul className="flex flex-col gap-2 px-3 py-2 text-sm">
        <Match
          league={league}
          homeId={conf.sevenId}
          awayId={conf.eightId}
          label="7 vs 8"
          winnerId={conf.sevenSeedId}
          result={results.find((game) => game.slot === "seven")}
        />
        <Match
          league={league}
          homeId={conf.nineId}
          awayId={conf.tenId}
          label="9 vs 10"
          winnerId={conf.nineWinnerId}
          result={results.find((game) => game.slot === "nine")}
        />
        <Match
          league={league}
          homeId={conf.sevenLoserId}
          awayId={conf.nineWinnerId}
          label="8 seed"
          winnerId={conf.eightSeedId}
          result={results.find((game) => game.slot === "eight")}
        />
      </ul>
    </div>
  );
}

function Match({
  league,
  homeId,
  awayId,
  label,
  winnerId,
  result,
}: {
  league: GmLeagueState;
  homeId?: string;
  awayId?: string;
  label: string;
  winnerId?: string;
  result?: { homeScore: number; awayScore: number; homeId: string; awayId: string };
}) {
  if (!homeId || !awayId) {
    return (
      <li className="text-muted-foreground">
        {label}: —
      </li>
    );
  }
  const score =
    result && result.homeId === homeId
      ? `${result.awayScore}-${result.homeScore}`
      : result
        ? `${result.homeScore}-${result.awayScore}`
        : "";
  return (
    <li className="flex flex-wrap items-center gap-2">
      <span className="w-14 text-xs text-muted-foreground">{label}</span>
      <TeamLogo teamKey={awayId} size="xs" />
      <span className={winnerId === awayId ? "font-semibold" : undefined}>{abbr(league, awayId)}</span>
      <span className="text-muted-foreground">at</span>
      <TeamLogo teamKey={homeId} size="xs" />
      <span className={winnerId === homeId ? "font-semibold" : undefined}>{abbr(league, homeId)}</span>
      {score ? <span className="tabular-nums text-muted-foreground">{score}</span> : null}
      {winnerId ? <span className="text-xs text-muted-foreground">{abbr(league, winnerId)} advances</span> : null}
    </li>
  );
}

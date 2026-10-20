"use client";

import type { ReactNode } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
import { Button } from "@/components/ui/button";
import { useGmStore } from "@/gm/state/gm-store";
import { seriesHosts } from "@/gm/engine/standings";
import type { GmLeagueState, GmPlayoffSeries } from "@/gm/types";
import { cn } from "@/lib/utils";

const ROUND_LABEL = ["First round", "Semifinals", "Conference finals"];

function abbr(league: GmLeagueState, id: string | undefined): string {
  if (!id) return "—";
  return league.teams.find((team) => team.id === id)?.abbr ?? id.toUpperCase();
}

function byRound(series: GmPlayoffSeries[], conf: GmPlayoffSeries["conf"], round: number): GmPlayoffSeries[] {
  return series.filter((entry) => entry.conf === conf && entry.round === round);
}

export function GmPlayoffBracket({
  league,
  controls = false,
}: {
  league: GmLeagueState;
  controls?: boolean;
}) {
  const series = league.playoffBracket ?? [];
  const simPlayoffDay = useGmStore((state) => state.simPlayoffDay);
  const finishPlayoffRound = useGmStore((state) => state.finishPlayoffRound);
  const simRestOfPlayoffs = useGmStore((state) => state.simRestOfPlayoffs);
  const finals = series.find((entry) => entry.conf === "Finals");
  const champion = finals?.done ? finals.winnerId : undefined;
  const live = league.phase === "playoffs";

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Playoff bracket</h2>
          <p className="text-sm text-muted-foreground">
            {champion
              ? `${abbr(league, champion)} won the Finals.`
              : "Best of seven. The next round fills in when a series ends, and each game lands on the matchup as it is played."}
          </p>
        </div>
        {controls && live ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => simPlayoffDay()}>Sim game</Button>
            <Button variant="outline" onClick={() => finishPlayoffRound()}>
              Sim series / round
            </Button>
            <Button variant="outline" onClick={() => simRestOfPlayoffs()}>
              Sim whole playoffs
            </Button>
          </div>
        ) : null}
      </header>
      <div className="grid gap-4 xl:grid-cols-2">
        <Conference title="East" series={series} league={league} />
        <Conference title="West" series={series} league={league} />
      </div>
      <div className="mx-auto w-full max-w-sm">
        <p className="mb-1 text-xs font-semibold text-muted-foreground">Finals</p>
        <SeriesCard series={finals} league={league} pending="Conference winners" />
      </div>
    </section>
  );
}

function Conference({
  title,
  series,
  league,
}: {
  title: "East" | "West";
  series: GmPlayoffSeries[];
  league: GmLeagueState;
}) {
  const first = byRound(series, title, 1);
  const semis = byRound(series, title, 2);
  const finals = byRound(series, title, 3);
  return (
    <section aria-label={`${title} bracket`}>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="grid grid-cols-3 gap-2">
        <Round label={ROUND_LABEL[0]!}>
          {Array.from({ length: 4 }, (_, index) => (
            <SeriesCard key={index} series={first[index]} league={league} pending="Seed" />
          ))}
        </Round>
        <Round label={ROUND_LABEL[1]!}>
          {Array.from({ length: 2 }, (_, index) => (
            <SeriesCard
              key={index}
              series={semis[index]}
              league={league}
              pending={feeder(first, index, league)}
            />
          ))}
        </Round>
        <Round label={ROUND_LABEL[2]!}>
          <SeriesCard series={finals[0]} league={league} pending={feeder(semis, 0, league)} />
        </Round>
      </div>
    </section>
  );
}

function feeder(previous: GmPlayoffSeries[], slot: number, league: GmLeagueState): string {
  const left = previous[slot * 2];
  const right = previous[slot * 2 + 1];
  if (!left || !right) return "Winners";
  const a = left.winnerId ? abbr(league, left.winnerId) : "—";
  const b = right.winnerId ? abbr(league, right.winnerId) : "—";
  return `${a} / ${b}`;
}

function Round({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex flex-1 flex-col justify-around gap-2">{children}</div>
    </div>
  );
}

function SeriesCard({
  series,
  league,
  pending,
}: {
  series?: GmPlayoffSeries;
  league: GmLeagueState;
  pending: string;
}) {
  if (!series) {
    return (
      <div className="rounded-lg border border-dashed border-border px-2 py-2 text-[11px] text-muted-foreground">
        {pending}
      </div>
    );
  }
  const you = league.userTeamId;
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card px-2 py-1.5",
        (series.teamAId === you || series.teamBId === you) && "border-[var(--team-primary)]"
      )}
    >
      <TeamLine
        league={league}
        teamId={series.teamAId}
        seed={series.seedA}
        wins={series.winsA}
        won={series.done && series.winnerId === series.teamAId}
        lost={series.done && series.winnerId !== series.teamAId}
      />
      <TeamLine
        league={league}
        teamId={series.teamBId}
        seed={series.seedB}
        wins={series.winsB}
        won={series.done && series.winnerId === series.teamBId}
        lost={series.done && series.winnerId !== series.teamBId}
      />
      <GamePips series={series} league={league} />
      {series.done ? null : (
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          Next at {abbr(league, seriesHosts(series).homeTeamId)}
        </p>
      )}
    </div>
  );
}

function TeamLine({
  league,
  teamId,
  seed,
  wins,
  won,
  lost,
}: {
  league: GmLeagueState;
  teamId: string;
  seed?: number;
  wins: number;
  won: boolean;
  lost: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-1.5 text-[12px]", lost && "opacity-50")}>
      <span className="w-3 tabular-nums text-muted-foreground">{seed ?? ""}</span>
      <TeamLogo teamKey={teamId} size="xs" />
      <span className={cn("min-w-0 flex-1 truncate font-semibold", won && "text-[var(--team-primary)]")}>
        {abbr(league, teamId)}
      </span>
      <span className="tabular-nums font-semibold">{wins}</span>
    </div>
  );
}

function GamePips({ series, league }: { series: GmPlayoffSeries; league: GmLeagueState }) {
  const games = series.games ?? [];
  if (!games.length && !series.done) {
    return <p className="mt-1 text-[10px] text-muted-foreground">Series not started</p>;
  }
  return (
    <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
      {games
        .map((game) => {
          const homeWon = game.homeScore > game.awayScore;
          const winner = homeWon ? game.homeTeamId : game.awayTeamId;
          const high = Math.max(game.homeScore, game.awayScore);
          const low = Math.min(game.homeScore, game.awayScore);
          return `${abbr(league, winner)} ${high}-${low}`;
        })
        .join(", ")}
    </p>
  );
}

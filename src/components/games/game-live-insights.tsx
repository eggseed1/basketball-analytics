"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";

import { MatchupWashCard } from "@/components/brand/team-wash-card";
import { HalfBar, SideValue, TeamDot } from "@/components/games/game-story";
import { MoreInfo } from "@/components/ui/more-info";
import type { PlayByPlayEvent, PlayerGame } from "@/data/types";
import { type } from "@/lib/design-system";
import { periodName } from "@/lib/games/court-events";
import {
  buildLiveInsights,
  buildRightNow,
  DROUGHT_MIN_SECONDS,
  foulTroubleThreshold,
  RUN_MIN,
  type GameMoment,
  type PlayerLine,
  type PossessionBattle,
  type QuarterStandouts,
  type RightNow,
} from "@/lib/games/live-insights";
import { cn } from "@/lib/utils";

type Side = "home" | "away";
type TeamColors = { away: string; home: string };
type Labels = { away: string; home: string };

const PBP_NOTE =
  "Counts come from play-by-play and can differ slightly from the official box score.";

function statLine(l: PlayerLine): string {
  const parts = [`${l.pts} PTS`, `${l.reb} REB`, `${l.ast} AST`];
  if (l.stl) parts.push(`${l.stl} STL`);
  if (l.blk) parts.push(`${l.blk} BLK`);
  return parts.join(" · ");
}

function Standout({
  line,
  season,
  color,
  align,
}: {
  line: PlayerLine | null;
  season: string;
  color: string;
  align: "start" | "end";
}) {
  if (!line) {
    return (
      <span className={cn(type.caption, "text-muted-foreground", align === "end" && "text-right")}>
        —
      </span>
    );
  }
  return (
    <div className={cn("flex min-w-0 flex-col", align === "end" ? "items-end text-right" : "items-start")}>
      <Link
        href={`/players/${encodeURIComponent(line.playerId)}?season=${encodeURIComponent(season)}`}
        className={cn(type.bodySm, "flex max-w-full items-center gap-1.5 font-semibold hover:underline")}
      >
        {align === "start" ? <TeamDot color={color} /> : null}
        <span className="truncate">{line.name}</span>
        {align === "end" ? <TeamDot color={color} /> : null}
      </Link>
      <span className={cn(type.caption, "tabular-nums text-muted-foreground")}>{statLine(line)}</span>
    </div>
  );
}

function QuarterStandoutsCard({
  quarters,
  labels,
  colors,
  season,
  live,
  teamKeys,
}: {
  quarters: QuarterStandouts[];
  labels: Labels;
  colors: TeamColors;
  season: string;
  live: boolean;
  teamKeys: { away: string; home: string };
}) {
  const rows = live ? [...quarters].reverse() : quarters;
  return (
    <MatchupWashCard
      awayTeamKey={teamKeys.away}
      homeTeamKey={teamKeys.home}
      intensity="subtle"
      className="flex h-full flex-col gap-4 p-4 sm:p-5"
    >
      <div>
        <h2 className={type.heading}>Quarter standouts</h2>
        <p className={cn(type.caption, "mt-0.5 text-muted-foreground")}>
          The top player on each side in every quarter{live ? " played so far" : ""}.
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-border/50">
        {rows.map((q) => (
          <li key={q.period} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
            <div className={cn(type.micro, "flex items-center justify-between font-bold uppercase tracking-[0.1em] text-muted-foreground")}>
              <span>
                {q.label}
                {q.finished ? "" : " so far"}
              </span>
              <span className="tabular-nums">
                {labels.away} {q.awayPoints} · {labels.home} {q.homePoints}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Standout line={q.away} season={season} color={colors.away} align="start" />
              <Standout line={q.home} season={season} color={colors.home} align="end" />
            </div>
          </li>
        ))}
      </ul>
      <MoreInfo>
        <p>
          Ranked by NBA efficiency: points, rebounds, assists, steals and blocks, minus missed
          shots, missed free throws and turnovers. {PBP_NOTE}
        </p>
      </MoreInfo>
    </MatchupWashCard>
  );
}

function PossessionBattleCard({
  battle,
  labels,
  colors,
  live,
  teamKeys,
}: {
  battle: PossessionBattle;
  labels: Labels;
  colors: TeamColors;
  live: boolean;
  teamKeys: { away: string; home: string };
}) {
  const leader: Side | null = battle.net > 0 ? "home" : battle.net < 0 ? "away" : null;
  const rows: { id: string; label: string; away: number; home: number; lowerIsBetter?: boolean }[] = [
    { id: "extra", label: "Extra chances", away: battle.away.extraChances, home: battle.home.extraChances },
    { id: "oreb", label: "Offensive rebounds", away: battle.away.oreb, home: battle.home.oreb },
    { id: "tov", label: "Turnovers", away: battle.away.tov, home: battle.home.tov, lowerIsBetter: true },
    { id: "fga", label: "Shot attempts", away: battle.away.fga, home: battle.home.fga },
    { id: "fta", label: "Free throw attempts", away: battle.away.fta, home: battle.home.fta },
    { id: "second", label: "Second-chance points", away: battle.away.secondChancePoints, home: battle.home.secondChancePoints },
    { id: "offtov", label: "Points off turnovers", away: battle.away.pointsOffTurnovers, home: battle.home.pointsOffTurnovers },
  ];
  const sideLabel = (s: Side) => labels[s];

  return (
    <MatchupWashCard
      awayTeamKey={teamKeys.away}
      homeTeamKey={teamKeys.home}
      intensity="subtle"
      className="flex h-full flex-col gap-4 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div>
          <h2 className={type.heading}>Possession battle</h2>
          <p className={cn(type.caption, "mt-0.5 text-muted-foreground")}>
            Extra chances are offensive rebounds plus the other side&apos;s turnovers.
          </p>
        </div>
        <span
          className={cn(
            type.caption,
            "glass-pill inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold tabular-nums"
          )}
        >
          {leader ? (
            <>
              <TeamDot color={colors[leader]} />
              {sideLabel(leader)} +{Math.abs(battle.net)}
              {live ? " so far" : ""}
            </>
          ) : (
            "Even"
          )}
        </span>
      </div>

      <ul className="flex flex-col gap-3">
        {rows.map((row) => {
          const better: Side | null =
            row.away === row.home
              ? null
              : (row.lowerIsBetter ? row.away < row.home : row.away > row.home)
                ? "away"
                : "home";
          const emph = (s: Side) => (better == null ? "even" : better === s ? "edge" : "trail");
          const max = Math.max(row.away, row.home);
          return (
            <li
              key={row.id}
              className="grid grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] items-center gap-x-2"
              aria-label={`${row.label}: ${labels.away} ${row.away}, ${labels.home} ${row.home}`}
            >
              <SideValue display={String(row.away)} strong={better === "away"} align="start" />
              <div className="flex min-w-0 flex-col items-center gap-1">
                <span className={cn(type.caption, "truncate font-semibold")}>
                  {row.label}
                  {row.lowerIsBetter ? (
                    <span className="font-normal text-muted-foreground"> · fewer is better</span>
                  ) : null}
                </span>
                <div className="flex w-full gap-0.5">
                  <HalfBar value={row.away} max={max} color={colors.away} emphasis={emph("away")} side="away" />
                  <HalfBar value={row.home} max={max} color={colors.home} emphasis={emph("home")} side="home" />
                </div>
              </div>
              <SideValue display={String(row.home)} strong={better === "home"} align="end" />
            </li>
          );
        })}
      </ul>

      {battle.byPeriod.length > 1 || (live && battle.byPeriod.length) ? (
        <div className="flex flex-col gap-1.5 border-t border-border/50 pt-3">
          <p className={cn(type.micro, "font-bold uppercase tracking-[0.1em] text-muted-foreground")}>
            Extra chances by quarter
          </p>
          <ul className={cn(type.caption, "flex flex-wrap gap-x-4 gap-y-1 tabular-nums")}>
            {battle.byPeriod.map((p) => {
              const s: Side | null = p.net > 0 ? "home" : p.net < 0 ? "away" : null;
              return (
                <li key={p.period} className="inline-flex items-center gap-1.5">
                  <span className="font-semibold text-muted-foreground">
                    {p.label}
                    {p.finished ? "" : " so far"}
                  </span>
                  {s ? (
                    <>
                      <TeamDot color={colors[s]} />
                      {sideLabel(s)} +{Math.abs(p.net)}
                    </>
                  ) : (
                    "Even"
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <MoreInfo>
        <p>
          Second-chance points are scored after an offensive rebound, before the other team gets the
          ball. Points off turnovers are scored on the possession after the other team turns it
          over. Team rebounds move the ball but don&apos;t count as rebounds. {PBP_NOTE}
        </p>
      </MoreInfo>
    </MatchupWashCard>
  );
}

function RightNowCard({
  now,
  players,
  labels,
  colors,
  teamKeys,
  season,
}: {
  now: RightNow;
  players: PlayerGame[];
  labels: Labels;
  colors: TeamColors;
  teamKeys: { away: string; home: string };
  season: string;
}) {
  const threshold = foulTroubleThreshold(now.period);
  const trouble = players
    .filter((p) => !p.didNotPlay && (p.personalFouls ?? 0) >= threshold)
    .map((p) => ({
      p,
      side: (p.teamId === teamKeys.home || (p.isHome && p.teamId !== teamKeys.away) ? "home" : "away") as Side,
      fouls: p.personalFouls ?? 0,
    }))
    .sort((a, b) => b.fouls - a.fouls);
  const moment = (m: GameMoment | null) => (m ? `${periodName(m.period)} ${m.clock}` : null);

  const items: { id: string; title: string; body: ReactNode }[] = [];
  if (now.run) {
    const { side, points, since } = now.run;
    items.push({
      id: "run",
      title: "Run",
      body: (
        <p className={cn(type.bodySm, "flex items-center gap-1.5")}>
          <TeamDot color={colors[side]} />
          <span>
            <span className="font-semibold">
              {labels[side]} on a {points}-0 run
            </span>
            <span className="text-muted-foreground"> since {moment(since)}</span>
          </span>
        </p>
      ),
    });
  }
  if (now.droughts.length) {
    items.push({
      id: "drought",
      title: "Cold stretch",
      body: (
        <ul className="flex flex-col gap-1">
          {now.droughts.map((d) => (
            <li key={d.side} className={cn(type.bodySm, "flex items-center gap-1.5")}>
              <TeamDot color={colors[d.side]} />
              <span>
                <span className="font-semibold">{labels[d.side]}</span>
                <span className="text-muted-foreground">
                  {d.since ? ` no field goal since ${moment(d.since)}` : " no field goal yet"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ),
    });
  }
  if (trouble.length) {
    items.push({
      id: "fouls",
      title: "Foul trouble",
      body: (
        <ul className="flex flex-col gap-1">
          {trouble.slice(0, 4).map(({ p, side, fouls }) => (
            <li key={p.playerId} className={cn(type.bodySm, "flex items-center gap-1.5")}>
              <TeamDot color={colors[side]} />
              <Link
                href={`/players/${encodeURIComponent(p.playerId)}?season=${encodeURIComponent(season)}`}
                className="truncate font-semibold hover:underline"
              >
                {p.playerName ?? p.playerId}
              </Link>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {fouls >= 6 ? "fouled out" : `${fouls} fouls`}
              </span>
            </li>
          ))}
        </ul>
      ),
    });
  }
  if (!items.length) return null;

  return (
    <MatchupWashCard
      awayTeamKey={teamKeys.away}
      homeTeamKey={teamKeys.home}
      intensity="subtle"
      className="flex flex-col gap-3 p-4 sm:p-5"
    >
      <h2 className={type.heading}>Right now</h2>
      <div className="grid gap-4 sm:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]">
        {items.map((item) => (
          <div key={item.id} className="flex min-w-0 flex-col gap-1.5">
            <p className={cn(type.micro, "font-bold uppercase tracking-[0.1em] text-muted-foreground")}>
              {item.title}
            </p>
            {item.body}
          </div>
        ))}
      </div>
      <MoreInfo>
        <p>
          A run counts points in a row by one side, shown from {RUN_MIN}. A cold stretch is{" "}
          {DROUGHT_MIN_SECONDS / 60} or more minutes of game time without a made field goal, up to the
          latest logged play. Foul trouble means {threshold} or more personal fouls in{" "}
          {periodName(now.period)}, about where coaches start sitting players.
        </p>
      </MoreInfo>
    </MatchupWashCard>
  );
}

export function GameLiveInsights({
  events,
  players,
  labels,
  colors,
  teamKeys,
  season,
  status,
}: {
  events: PlayByPlayEvent[];
  players: PlayerGame[];
  labels: Labels;
  colors: TeamColors;
  teamKeys: { away: string; home: string };
  season: string;
  status: string;
}) {
  const final = status === "final";
  const insights = useMemo(() => {
    const names = new Map<string, string>();
    for (const p of players) if (p.playerName) names.set(p.playerId, p.playerName);
    return buildLiveInsights(events, {
      homeLabel: labels.home,
      awayLabel: labels.away,
      final,
      names,
    });
  }, [events, players, labels.home, labels.away, final]);

  const now = useMemo(
    () => (final ? null : buildRightNow(events, { homeLabel: labels.home, awayLabel: labels.away })),
    [events, labels.home, labels.away, final]
  );

  const hasQuarters = insights.quarters.some((q) => q.home || q.away);
  if (!hasQuarters && !insights.battle) return null;
  return (
    <div className="flex flex-col gap-5">
    {now ? (
      <RightNowCard
        now={now}
        players={players}
        labels={labels}
        colors={colors}
        teamKeys={teamKeys}
        season={season}
      />
    ) : null}
    <div className="grid gap-5 lg:grid-cols-2">
      {insights.battle ? (
        <PossessionBattleCard
          battle={insights.battle}
          labels={labels}
          colors={colors}
          live={!final}
          teamKeys={teamKeys}
        />
      ) : null}
      {hasQuarters ? (
        <QuarterStandoutsCard
          quarters={insights.quarters}
          labels={labels}
          colors={colors}
          season={season}
          live={!final}
          teamKeys={teamKeys}
        />
      ) : null}
    </div>
    </div>
  );
}

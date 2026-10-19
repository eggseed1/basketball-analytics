"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DEFENSE_OPTIONS,
  OFFENSE_OPTIONS,
  TEMPO_OPTIONS,
  coachingOf,
  injured,
  rotationChart,
} from "@/gm/engine/coaching";
import { positionalMinuteTargets } from "@/gm/engine/lineup";
import { displayPlayerName, userPlayers, userTeam } from "@/gm/lib/selectors";
import { useGmStore } from "@/gm/state/gm-store";
import type { GmPlayer, GmPosition } from "@/gm/types";

const POS: GmPosition[] = ["PG", "SG", "SF", "PF", "C"];
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

function rosterOrder(players: GmPlayer[], starters: Record<GmPosition, string | null>, minutes: Record<string, number>) {
  const starterIds = POS.map((pos) => starters[pos]).filter((id): id is string => !!id);
  const used = new Set(starterIds);
  const rest = players
    .filter((player) => !used.has(player.id))
    .sort((a, b) => (minutes[b.id] ?? 0) - (minutes[a.id] ?? 0));
  const byId = new Map(players.map((player) => [player.id, player]));
  return [
    ...starterIds.map((id) => byId.get(id)).filter((player): player is GmPlayer => !!player),
    ...rest,
  ];
}

export function GmCoaching() {
  const league = useGmStore((s) => s.league);
  const setStarter = useGmStore((s) => s.setStarter);
  const setCoaching = useGmStore((s) => s.setCoaching);
  const setRotationMinutes = useGmStore((s) => s.setRotationMinutes);
  const resetRotation = useGmStore((s) => s.resetRotation);
  if (!league) return null;

  const team = userTeam(league);
  const players = userPlayers(league);
  const plan = coachingOf(team);
  const saved = team.coaching?.minutes;
  const starterIds = new Set(POS.map((pos) => team.starters[pos]).filter((id): id is string => !!id));
  const targets = positionalMinuteTargets(
    players.filter((player) => !injured(player)),
    team.starters
  );
  const painted = rotationChart(
    players.map((player) => ({
      id: player.id,
      minutes: injured(player) ? 0 : (saved?.[player.id] ?? targets[player.id] ?? 0),
      starter: starterIds.has(player.id),
      position: player.position,
    })),
    plan
  );
  const paintedMinutes = new Map(painted.map((row) => [row.id, row.minutes]));
  const minutes: Record<string, number> = {};
  for (const player of players) {
    minutes[player.id] = injured(player)
      ? 0
      : saved
        ? (saved[player.id] ?? 0)
        : (paintedMinutes.get(player.id) ?? 0);
  }
  const total = Object.values(minutes).reduce((sum, value) => sum + value, 0);
  const ordered = rosterOrder(players, team.starters, minutes);
  const chart = new Map(painted.map((row) => [row.id, row.on]));
  const offense = OFFENSE_OPTIONS.find((option) => option.id === plan.offense);
  const defense = DEFENSE_OPTIONS.find((option) => option.id === plan.defense);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Coaching</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            A system changes the next box score. Minutes lock in when you move a slider.
            Until then the chart is the game. Starters open and close each quarter. One or two sit about five minutes in, and the star stays through that change.
            A faster system makes the first change sooner. A slower one waits. The backup at that position takes the minutes. Injuries sit someone either way.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => resetRotation()}>
          Reset rotation
        </Button>
      </div>

      <section className="sports-card flex flex-col gap-3 p-4">
        <h3 className="font-semibold">Offense</h3>
        <div className="flex flex-wrap gap-2">
          {OFFENSE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={option.id === plan.offense ? "gm-nav__link is-active" : "gm-nav__link"}
              onClick={() => setCoaching({ offense: option.id })}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{offense?.detail}</p>
        <div className="flex flex-wrap gap-3">
          <PlayThrough
            label="First option"
            value={plan.playThrough[0]}
            players={players}
            onChange={(id) => setCoaching({ playThrough: [id, plan.playThrough[1]] })}
          />
          <PlayThrough
            label="Second option"
            value={plan.playThrough[1]}
            players={players}
            onChange={(id) => setCoaching({ playThrough: [plan.playThrough[0], id] })}
          />
        </div>
        <h3 className="font-semibold">Tempo</h3>
        <div className="flex flex-wrap gap-2">
          {TEMPO_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={option.id === plan.tempo ? "gm-nav__link is-active" : "gm-nav__link"}
              onClick={() => setCoaching({ tempo: option.id })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="sports-card flex flex-col gap-3 p-4">
        <h3 className="font-semibold">Defense</h3>
        <div className="flex flex-wrap gap-2">
          {DEFENSE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={option.id === plan.defense ? "gm-nav__link is-active" : "gm-nav__link"}
              onClick={() => setCoaching({ defense: option.id })}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{defense?.detail}</p>
      </section>

      <section className="sports-card flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">Minutes</h3>
          <p className="text-sm tabular-nums">
            {total} / 240
            {total > 240
              ? ". The night trims the group to 240."
              : total < 230
                ? ". Open minutes stay unused."
                : ""}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {POS.map((pos) => (
            <label key={pos} className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-semibold text-muted-foreground">{pos}</span>
              <select
                className="rounded-md border border-border bg-background px-2 py-2"
                value={team.starters[pos] ?? ""}
                onChange={(event) => setStarter(pos, event.target.value || null)}
              >
                <option value="">Empty</option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {displayPlayerName(player)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div className="gm-rot gm-rot--head" aria-hidden>
          <span />
          <span />
          <div className="gm-chart">
            {QUARTERS.map((quarter) => (
              <span key={quarter} className="gm-chart__q">
                {quarter}
              </span>
            ))}
          </div>
        </div>
        <ul className="flex flex-col gap-2">
          {ordered.map((player) => {
            const value = minutes[player.id] ?? 0;
            const out = injured(player);
            const on = chart.get(player.id) ?? [];
            return (
              <li key={player.id} className="gm-rot">
                <div className="gm-rot__name">
                  <Link href={`/gm/player/${encodeURIComponent(player.id)}`}>
                    {displayPlayerName(player)}
                  </Link>
                  <span>
                    {player.position}
                    {starterIds.has(player.id) ? " · Starter" : ""}
                    {out ? " · Out" : ""}
                  </span>
                </div>
                <label className="gm-rot__slider">
                  <input
                    type="range"
                    min={0}
                    max={40}
                    step={1}
                    value={value}
                    disabled={out}
                    aria-label={`${displayPlayerName(player)} minutes`}
                    onChange={(event) => setRotationMinutes(player.id, Number(event.target.value))}
                  />
                  <span className="tabular-nums">{value}</span>
                </label>
                <div className="gm-chart" aria-hidden>
                  {QUARTERS.map((quarter) => (
                    <span key={quarter} className="gm-chart__slice">
                      {[0, 1, 2, 3, 4, 5].map((offset) => {
                        const index = QUARTERS.indexOf(quarter) * 6 + offset;
                        return (
                          <span
                            key={offset}
                            className={on[index] ? "gm-chart__cell is-on" : "gm-chart__cell"}
                          />
                        );
                      })}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function PlayThrough({
  label,
  value,
  players,
  onChange,
}: {
  label: string;
  value: string | null;
  players: GmPlayer[];
  onChange: (id: string | null) => void;
}) {
  return (
    <label className="flex min-w-52 flex-1 flex-col gap-1 text-sm">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <select
        className="rounded-md border border-border bg-background px-2 py-2"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">No one</option>
        {players.map((player) => (
          <option key={player.id} value={player.id}>
            {displayPlayerName(player)}
          </option>
        ))}
      </select>
    </label>
  );
}

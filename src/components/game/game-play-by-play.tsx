"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { PlayByPlayEvent } from "@/data/types";
import { cn } from "@/lib/utils";

function periodLabel(period: number): string {
  if (period <= 4) return `Q${period}`;
  return `OT${period - 4}`;
}

function PlayDescription({ event }: { event: PlayByPlayEvent }) {
  const text =
    event.description.trim() ||
    `${event.actionType}${event.subType ? ` · ${event.subType}` : ""}`;

  if (!event.playerId || !event.playerName) {
    return <>{text}</>;
  }

  const idx = text.indexOf(event.playerName);
  if (idx === -1) {
    return (
      <>
        <Link
          href={`/players/${event.playerId}`}
          className="underline-offset-4 hover:underline"
        >
          {event.playerName}
        </Link>
        {text ? ` — ${text}` : null}
      </>
    );
  }

  return (
    <>
      {text.slice(0, idx)}
      <Link
        href={`/players/${event.playerId}`}
        className="underline-offset-4 hover:underline"
      >
        {event.playerName}
      </Link>
      {text.slice(idx + event.playerName.length)}
    </>
  );
}

export function GamePlayByPlayPanel({
  events,
  awayTricode,
  homeTricode,
  source,
}: {
  events: PlayByPlayEvent[];
  awayTricode: string;
  homeTricode: string;
  source?: string;
}) {
  const periods = useMemo(() => {
    const set = new Set(events.map((e) => e.period));
    return [...set].sort((a, b) => a - b);
  }, [events]);

  const [period, setPeriod] = useState<number | "all">("all");

  const visible = useMemo(() => {
    if (period === "all") return events;
    return events.filter((e) => e.period === period);
  }, [events, period]);

  if (events.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Play-by-play</h2>
        <p className="rounded-xl border border-border px-4 py-6 text-sm text-muted-foreground">
          No play-by-play available for this game.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="play-by-play-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="play-by-play-heading" className="text-lg font-semibold">
            Play-by-play
          </h2>
          <p className="text-sm text-muted-foreground">
            {events.length.toLocaleString()} events
            {source ? ` · ${source}` : null}
          </p>
        </div>
        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Period filter"
        >
          <PeriodChip
            active={period === "all"}
            onClick={() => setPeriod("all")}
            label="All"
          />
          {periods.map((p) => (
            <PeriodChip
              key={p}
              active={period === p}
              onClick={() => setPeriod(p)}
              label={periodLabel(p)}
            />
          ))}
        </div>
      </div>

      <div className="max-h-[32rem] overflow-auto rounded-xl border border-border">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Q</th>
              <th className="px-3 py-2 font-medium">Clock</th>
              <th className="px-3 py-2 font-medium">Team</th>
              <th className="px-3 py-2 font-medium">Play</th>
              <th className="px-3 py-2 text-right font-medium">{awayTricode}</th>
              <th className="px-3 py-2 text-right font-medium">{homeTricode}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((event) => (
              <tr
                key={event.id}
                className={cn(
                  "border-b border-border/70 last:border-0",
                  event.points > 0 && "bg-muted/40"
                )}
              >
                <td className="px-3 py-1.5 tabular-nums text-muted-foreground">
                  {periodLabel(event.period)}
                </td>
                <td className="px-3 py-1.5 tabular-nums text-muted-foreground">
                  {event.clock}
                </td>
                <td className="px-3 py-1.5 font-mono text-xs uppercase text-muted-foreground">
                  {event.teamTricode ?? "—"}
                </td>
                <td
                  className={cn(
                    "px-3 py-1.5",
                    event.points > 0
                      ? "text-foreground"
                      : event.shotResult === "Missed" ||
                          event.actionType === "turnover"
                        ? "text-muted-foreground"
                        : "text-foreground"
                  )}
                >
                  <PlayDescription event={event} />
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {event.scoreAway}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {event.scoreHome}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PeriodChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:bg-muted"
      )}
    >
      {label}
    </button>
  );
}

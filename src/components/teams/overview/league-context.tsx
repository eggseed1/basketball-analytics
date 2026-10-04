"use client";

import { useState } from "react";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { useChartTheme } from "@/lib/chart-theme";
import { type } from "@/lib/design-system";
import { formatNumber, formatOrdinal } from "@/lib/format";
import {
  formatStripValue,
  type LadderRow,
  type LeagueStripData,
} from "@/lib/team-overview-types";
import { cn } from "@/lib/utils";

const WIN = "var(--accent-positive)";
const LOSS = "var(--accent-negative)";

export function NetLadder({
  rows,
  teamId,
  teamKey,
  conference,
  season,
}: {
  rows: LadderRow[];
  teamId: string;
  teamKey: string;
  conference: string;
  season: string;
}) {
  const chartTheme = useChartTheme();
  const accent = chartTheme.teamColor(teamKey).color;
  const [scope, setScope] = useState<"conf" | "league">(conference ? "conf" : "league");
  const [hover, setHover] = useState<string | null>(null);
  const shown = scope === "conf" ? rows.filter((r) => r.conference === conference) : rows;
  if (shown.length < 2) return null;
  const max = Math.max(1, ...shown.map((r) => Math.abs(r.net)));
  const ownIndex = shown.findIndex((r) => r.teamId === teamId);
  const focus = shown.find((r) => r.teamId === hover) ?? shown[ownIndex];

  return (
    <section className="sports-card flex flex-col gap-3 p-4 sm:p-5" aria-label="Net margin ladder">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={type.heading}>Where they stand</h2>
          <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
            Average point margin per game in {season}, best to worst. Not adjusted for schedule.
          </p>
        </div>
        {conference ? (
          <SegmentedControl
            size="sm"
            value={scope}
            onChange={setScope}
            options={[
              { id: "conf", label: conference },
              { id: "league", label: "League" },
            ]}
          />
        ) : null}
      </div>

      {focus ? (
        <p className={cn(type.bodySm, "tabular-nums")}>
          <span className="font-bold">{focus.abbr}</span>{" "}
          <span className="text-muted-foreground">
            {formatOrdinal(shown.indexOf(focus) + 1)} of {shown.length} · {focus.net > 0 ? "+" : ""}
            {formatNumber(focus.net, 1)} per game
          </span>
        </p>
      ) : null}

      <div className="flex h-44 items-stretch gap-[3px]" onPointerLeave={() => setHover(null)}>
        {shown.map((r) => {
          const own = r.teamId === teamId;
          const h = (Math.abs(r.net) / max) * 50;
          const on = hover === r.teamId;
          return (
            <button
              key={r.teamId}
              type="button"
              className="relative flex min-w-0 flex-1 flex-col"
              onPointerEnter={() => setHover(r.teamId)}
              onFocus={() => setHover(r.teamId)}
              onClick={() => setHover(r.teamId)}
              aria-label={`${r.abbr} ${r.net > 0 ? "+" : ""}${formatNumber(r.net, 1)}`}
            >
              <span className="relative block flex-1">
                <span className="absolute inset-x-0 top-1/2 h-px bg-foreground/25" aria-hidden />
                <span
                  className="absolute inset-x-[12%] rounded-[3px] transition-opacity"
                  style={{
                    background: own ? accent : r.net >= 0 ? WIN : LOSS,
                    opacity: own || on ? 1 : hover ? 0.35 : 0.55,
                    height: `${Math.max(1.5, h)}%`,
                    ...(r.net >= 0 ? { bottom: "50%" } : { top: "50%" }),
                    boxShadow: own ? `0 0 0 2px var(--background), 0 0 0 3.5px ${accent}` : undefined,
                  }}
                />
              </span>
              <span
                className={cn(
                  "mt-1 self-center whitespace-nowrap text-center text-[9px] tabular-nums sm:text-[10px]",
                  own ? "font-bold text-foreground" : "text-muted-foreground"
                )}
              >
                {scope === "league" && !own && !on ? "" : r.abbr}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function LeagueStrips({
  strips,
  teamKey,
  season,
}: {
  strips: LeagueStripData[];
  teamKey: string;
  season: string;
}) {
  const chartTheme = useChartTheme();
  const accent = chartTheme.teamColor(teamKey).color;
  const [hover, setHover] = useState<{ strip: string; teamId: string } | null>(null);
  if (!strips.length) return null;

  return (
    <section className="sports-card flex flex-col gap-3 p-4 sm:p-5" aria-label="Against the league">
      <div>
        <h2 className={type.heading}>Against the league</h2>
        <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
          Each dot is a team&apos;s {season} average. Better is always to the right, and the tick marks the league
          average.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {strips.map((s) => {
          const values = s.points.map((p) => p.value);
          const lo = Math.min(...values);
          const hi = Math.max(...values);
          const span = hi - lo || 1;
          const pos = (v: number) => {
            const t = (v - lo) / span;
            return `${(s.lowerIsBetter ? 1 - t : t) * 100}%`;
          };
          const hovered = hover?.strip === s.key ? s.points.find((p) => p.teamId === hover.teamId) : null;
          return (
            <li
              key={s.key}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 sm:grid-cols-[minmax(6.5rem,8.5rem)_minmax(0,1fr)_4.5rem]"
            >
              <span className={cn(type.caption, "col-start-1 row-start-1 font-semibold")}>{s.label}</span>
              <span
                className="relative col-span-2 row-start-2 h-7 sm:col-span-1 sm:col-start-2 sm:row-start-1"
                onPointerLeave={() => setHover(null)}
              >
                <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground/15" aria-hidden />
                <span
                  className="absolute top-1 bottom-1 w-px bg-foreground/45"
                  style={{ left: pos(s.average) }}
                  title={`League average ${formatStripValue(s.format, s.average)}`}
                  aria-hidden
                />
                {s.points.map((p) => (
                  <span
                    key={p.teamId}
                    className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/25 transition hover:scale-150 hover:bg-foreground/60"
                    style={{ left: pos(p.value) }}
                    onPointerEnter={() => setHover({ strip: s.key, teamId: p.teamId })}
                    aria-hidden
                  />
                ))}
                <span
                  className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background"
                  style={{ left: pos(s.team.value), background: accent }}
                  aria-hidden
                />
                {hovered ? (
                  <span
                    className="pointer-events-none absolute -top-5 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background tabular-nums"
                    style={{ left: pos(hovered.value) }}
                  >
                    {hovered.abbr} {formatStripValue(s.format, hovered.value)}
                  </span>
                ) : null}
              </span>
              <span className="col-start-2 row-start-1 text-right sm:col-start-3">
                <span className={cn(type.bodySm, "font-bold tabular-nums sm:block")}>{formatStripValue(s.format, s.team.value)}</span>
                <span className={cn(type.micro, "ml-1.5 text-muted-foreground tabular-nums sm:ml-0 sm:block")}>
                  {formatOrdinal(s.rank)} of {s.points.length}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

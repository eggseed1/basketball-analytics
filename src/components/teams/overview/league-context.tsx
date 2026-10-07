"use client";

import { useState, type CSSProperties } from "react";

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

const WIN = "var(--data-positive)";
const LOSS = "var(--data-negative)";
const WIN_SOFT = "var(--accent-positive-soft)";
const LOSS_SOFT = "var(--accent-negative-soft)";

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

      <div data-hover-group className="flex h-44 items-stretch gap-[3px]" onPointerLeave={() => setHover(null)}>
        {shown.map((r, i) => {
          const own = r.teamId === teamId;
          const h = (Math.abs(r.net) / max) * 50;
          const on = hover === r.teamId;
          return (
            <button
              key={r.teamId}
              type="button"
              className="relative flex min-w-0 flex-1 flex-col"
              data-hover-item
              data-tip={r.abbr}
              data-tip-sub={`${r.net > 0 ? "+" : ""}${formatNumber(r.net, 1)} per game`}
              style={{ "--i": Math.round((i / Math.max(1, shown.length - 1)) * 16) } as CSSProperties}
              onPointerEnter={() => setHover(r.teamId)}
              onFocus={() => setHover(r.teamId)}
              onClick={() => setHover(r.teamId)}
              aria-label={`${r.abbr} ${r.net > 0 ? "+" : ""}${formatNumber(r.net, 1)}`}
            >
              <span className="relative block flex-1">
                <span className="absolute inset-x-0 top-1/2 h-px bg-foreground/25" aria-hidden />
                <span
                  data-motion-bar="y"
                  data-tip-anchor
                  className="absolute inset-x-[12%] rounded-[3px]"
                  style={{
                    transformOrigin: r.net >= 0 ? "bottom" : "top",
                    background: own ? accent : on ? (r.net >= 0 ? WIN : LOSS) : r.net >= 0 ? WIN_SOFT : LOSS_SOFT,
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
      <ul data-hover-group className="flex flex-col gap-3">
        {strips.map((s) => {
          const values = s.points.map((p) => p.value);
          const lo = Math.min(...values);
          const hi = Math.max(...values);
          const span = hi - lo || 1;
          const pos = (v: number) => {
            const t = (v - lo) / span;
            return `${(s.lowerIsBetter ? 1 - t : t) * 100}%`;
          };
          return (
            <li
              key={s.key}
              data-hover-item
              className="group/strip grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 sm:grid-cols-[minmax(6.5rem,8.5rem)_minmax(0,1fr)_4.5rem]"
            >
              <span className={cn(type.caption, "col-start-1 row-start-1 font-semibold")}>{s.label}</span>
              <span
                data-hover-svg
                className="relative col-span-2 row-start-2 h-7 sm:col-span-1 sm:col-start-2 sm:row-start-1"
              >
                <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground/15" aria-hidden />
                <span
                  className="absolute top-1 bottom-1 w-px bg-foreground/45 transition-colors group-hover/strip:bg-foreground/80"
                  style={{ left: pos(s.average) }}
                  title={`League average ${formatStripValue(s.format, s.average)}`}
                  aria-hidden
                />
                {s.points.map((p, i) => (
                  <span
                    key={p.teamId}
                    data-motion-dot
                    data-hover-point
                    data-tip={p.abbr}
                    data-tip-sub={formatStripValue(s.format, p.value)}
                    className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/25 hover:bg-foreground/60"
                    style={{ left: pos(p.value), "--i": i } as CSSProperties}
                  />
                ))}
                <span
                  data-motion-mark
                  data-hover-point
                  data-tip={s.team.abbr}
                  data-tip-sub={`${formatStripValue(s.format, s.team.value)} · league avg ${formatStripValue(s.format, s.average)}`}
                  className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background"
                  style={{ left: pos(s.team.value), background: accent, "--mark-from": pos(s.average) } as CSSProperties}
                />
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

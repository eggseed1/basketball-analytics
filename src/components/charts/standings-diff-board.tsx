import Link from "next/link";
import { useId, type CSSProperties } from "react";

import type { StandingRow } from "@/data/types";
import { type } from "@/lib/design-system";
import { formatNumber } from "@/lib/format";
import { teamBrandCompareBarFill } from "@/lib/nba-brand";
import { teamProfileHref } from "@/lib/team-identity";
import { cn } from "@/lib/utils";

const ROW = "grid grid-cols-[2.5rem_minmax(0,1fr)_3rem] items-center gap-2";

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${formatNumber(value, 1)}`;
}

/** Ticks for a symmetric axis, at most three per side. */
function axisTicks(peak: number): number[] {
  const raw = peak / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
  const out: number[] = [];
  for (let v = -Math.floor(peak / step) * step; v <= peak + 1e-9; v += step) {
    out.push(Number(v.toPrecision(12)));
  }
  return out;
}

/**
 * Point-differential board for standings: who is actually outscoring opponents.
 * Plain HTML bars, so the board renders on the server at its final size and
 * hovering a row lifts its bar like the other team boards.
 */
export function StandingsDiffBoard({
  season,
  east,
  west,
  className,
}: {
  season: string;
  east: StandingRow[];
  west: StandingRow[];
  className?: string;
}) {
  const chartId = useId();
  const data = [...east, ...west].sort((a, b) => b.differential - a.differential);

  if (data.length < 8) return null;

  const peak = Math.max(...data.map((d) => Math.abs(d.differential)), 0.5);
  const ticks = axisTicks(peak);
  const pct = (v: number) => `${((v + peak) / (2 * peak)) * 100}%`;

  return (
    <figure
      aria-labelledby={`${chartId}-title`}
      aria-describedby={`${chartId}-desc`}
      className={cn("sports-card flex flex-col gap-2 p-3 sm:p-4", className)}
    >
      <div>
        <p id={`${chartId}-title`} className={cn(type.heading)}>
          Scoring margin · {season}
        </p>
        <p id={`${chartId}-desc`} className={cn(type.caption, "text-muted-foreground")}>
          Average point differential per game for all 30 teams. A better guide
          to team strength than W/L alone.
        </p>
      </div>

      <div className="relative">
        <div aria-hidden className={cn(ROW, "pointer-events-none absolute inset-0")}>
          <span />
          <span className="relative h-full">
            {ticks.map((t) => (
              <span
                key={t}
                className={cn(
                  "absolute inset-y-0 w-px",
                  t === 0 ? "bg-foreground/40" : "border-l border-dashed border-border/70"
                )}
                style={{ left: pct(t) }}
              />
            ))}
          </span>
          <span />
        </div>

        <ol className="relative flex flex-col" aria-label="Teams by average point differential">
          {data.map((row, i) => {
            const positive = row.differential >= 0;
            return (
              <li
                key={row.teamId}
                data-hover-item
                data-tip={row.displayName}
                data-tip-sub={`${row.conference} · ${signed(row.differential)} points per game`}
                className={cn(ROW, "h-[18px] rounded-sm transition-colors hover:bg-foreground/[0.05]")}
              >
                <Link
                  href={teamProfileHref(row.abbreviation, season)}
                  className={cn(type.caption, "font-semibold tabular-nums underline-offset-2 hover:underline")}
                >
                  {row.abbreviation}
                </Link>
                <span className="relative h-3">
                  <span
                    data-tip-anchor
                    data-motion-bar="x"
                    className="absolute inset-y-0 rounded-[2px]"
                    style={{
                      ...({ "--i": Math.min(i, 16) } as CSSProperties),
                      transformOrigin: positive ? "left" : "right",
                      ...(positive
                        ? { left: "50%", width: `calc(${pct(row.differential)} - 50%)` }
                        : { right: "50%", width: `calc(50% - ${pct(row.differential)})` }),
                      background: teamBrandCompareBarFill(row.abbreviation),
                    }}
                  />
                </span>
                <span
                  className={cn(
                    type.caption,
                    "text-right font-semibold tabular-nums",
                    positive ? "text-[var(--data-positive)]" : "text-[var(--data-negative)]"
                  )}
                >
                  {signed(row.differential)}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div aria-hidden className={cn(ROW, type.micro, "text-muted-foreground")}>
        <span />
        <span className="relative h-4">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute -translate-x-1/2 tabular-nums"
              style={{ left: pct(t) }}
            >
              {Number.isInteger(t) ? `${t > 0 ? "+" : ""}${t}` : signed(t)}
            </span>
          ))}
        </span>
        <span />
      </div>
    </figure>
  );
}

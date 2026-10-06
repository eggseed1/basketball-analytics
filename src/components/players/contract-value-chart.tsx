"use client";

import { useState } from "react";

import { type } from "@/lib/design-system";
import { formatUsdCompact } from "@/lib/format-money";
import { cn } from "@/lib/utils";

export type ContractValueChartYear = {
  season: string;
  salary: number;
  worthLow: number;
  worth: number;
  worthHigh: number;
  surplus: number;
  note: string | null;
};

const STEPS = [5e6, 10e6, 20e6, 25e6, 50e6, 100e6];

function gridStep(max: number): number {
  return STEPS.find((s) => max / s <= 4) ?? STEPS[STEPS.length - 1]!;
}

function signedUsd(dollars: number): string {
  if (Math.abs(dollars) < 50_000) return "$0.0M";
  const text = formatUsdCompact(Math.abs(dollars));
  return dollars > 0 ? `+${text}` : `-${text}`;
}

const SURPLUS_TONE = (d: number) =>
  Math.abs(d) < 50_000 ? "text-muted-foreground" : d > 0 ? "text-[var(--chart-3)]" : "text-destructive";

/** Salary against the projected worth range, one column per contract season. */
export function ContractValueChart({ years }: { years: ContractValueChartYear[] }) {
  const [selected, setSelected] = useState(years[0]?.season ?? null);
  if (!years.length) return null;

  const top = Math.max(...years.map((y) => Math.max(y.worthHigh, y.salary)));
  const step = gridStep(top);
  const max = Math.ceil((top * 1.04) / step) * step;
  const at = (d: number) => `${(Math.max(0, d) / max) * 100}%`;
  const lines: number[] = [];
  for (let v = step; v < max; v += step) lines.push(v);
  const active = years.find((y) => y.season === selected) ?? years[0]!;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative pl-12">
        <div className="relative h-48">
          {[0, ...lines].map((v) => (
            <div
              key={v}
              aria-hidden
              className={cn("absolute inset-x-0 border-t", v === 0 ? "border-border" : "border-dashed border-border/60")}
              style={{ bottom: at(v) }}
            >
              <span className={cn(type.micro, "absolute -left-12 w-10 -translate-y-1/2 text-right tabular-nums text-muted-foreground")}>
                {v === 0 ? "$0" : formatUsdCompact(v).replace(".0M", "M")}
              </span>
            </div>
          ))}
          <div className="absolute inset-0 flex gap-2 sm:gap-4">
            {years.map((y) => {
              const isActive = y.season === active.season;
              return (
                <button
                  key={y.season}
                  type="button"
                  onClick={() => setSelected(y.season)}
                  onMouseEnter={() => setSelected(y.season)}
                  onFocus={() => setSelected(y.season)}
                  aria-pressed={isActive}
                  aria-label={`${y.season}: salary ${formatUsdCompact(y.salary)}, estimated worth ${formatUsdCompact(y.worth)}, 80% range ${formatUsdCompact(y.worthLow)} to ${formatUsdCompact(y.worthHigh)}, surplus ${signedUsd(y.surplus)}`}
                  className={cn(
                    "relative h-full min-w-0 flex-1 rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive ? "bg-foreground/[0.05]" : "hover:bg-foreground/[0.03]"
                  )}
                >
                  <span
                    aria-hidden
                    className="absolute bottom-0 left-[18%] right-[18%] rounded-t-sm bg-foreground/20"
                    style={{ height: at(y.salary) }}
                  />
                  <span
                    aria-hidden
                    className="absolute left-[34%] right-[34%] rounded-sm bg-[var(--chart-3)]/25 ring-1 ring-inset ring-[var(--chart-3)]/50"
                    style={{ bottom: at(y.worthLow), height: `calc(${at(y.worthHigh)} - ${at(y.worthLow)})` }}
                  />
                  <span
                    aria-hidden
                    className="absolute left-[26%] right-[26%] h-[3px] -translate-y-1/2 rounded-full bg-[var(--chart-3)]"
                    style={{ top: `calc(100% - ${at(y.worth)})` }}
                  />
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-1.5 flex gap-2 sm:gap-4">
          {years.map((y) => (
            <span
              key={y.season}
              className={cn(
                type.micro,
                "min-w-0 flex-1 truncate text-center tabular-nums",
                y.season === active.season ? "font-semibold text-foreground" : "text-muted-foreground"
              )}
            >
              {y.season}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md bg-foreground/[0.04] px-3 py-2" aria-live="polite">
        <span className={cn(type.bodySm, "font-semibold tabular-nums")}>{active.season}</span>
        <span className={cn(type.bodySm, "tabular-nums")}>
          Paid {formatUsdCompact(active.salary)}, worth about {formatUsdCompact(active.worth)} (likely{" "}
          {formatUsdCompact(active.worthLow)} to {formatUsdCompact(active.worthHigh)})
        </span>
        <span className={cn(type.bodySm, "font-semibold tabular-nums", SURPLUS_TONE(active.surplus))}>
          {signedUsd(active.surplus)} surplus
        </span>
        {active.note ? <span className={cn(type.caption, "text-muted-foreground")}>{active.note}</span> : null}
        {Math.abs(active.surplus - (active.worth - active.salary)) > 500_000 ? (
          <span className={cn(type.caption, "basis-full text-muted-foreground")}>
            Surplus here isn&apos;t simply worth minus salary, because the option or guarantee terms decide who
            keeps the upside.
          </span>
        ) : null}
      </div>

      <ul className={cn(type.caption, "flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground")}>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-foreground/20" />
          Salary
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-[3px] w-3 rounded-full bg-[var(--chart-3)]" />
          Estimated worth
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-[var(--chart-3)]/25 ring-1 ring-inset ring-[var(--chart-3)]/50" />
          80% range
        </li>
      </ul>
    </div>
  );
}

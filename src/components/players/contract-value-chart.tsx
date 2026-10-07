"use client";

import { useState, type CSSProperties } from "react";

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
  /** Option or guarantee terms, shown under the season. */
  terms?: string | null;
};

const STEPS = [5e6, 10e6, 20e6, 25e6, 50e6, 100e6];
/** Surplus this small reads as even. */
const EVEN = 50_000;
/** A trend smaller than this over the deal isn't worth calling out. */
const TREND_MIN = 5e6;

function gridStep(max: number): number {
  return STEPS.find((s) => max / s <= 4) ?? STEPS[STEPS.length - 1]!;
}

function signedUsd(dollars: number): string {
  if (Math.abs(dollars) < EVEN) return "$0.0M";
  const text = formatUsdCompact(Math.abs(dollars));
  return dollars > 0 ? `+${text}` : `-${text}`;
}

function sign(d: number): -1 | 0 | 1 {
  return Math.abs(d) < EVEN ? 0 : d > 0 ? 1 : -1;
}

const SURPLUS_TONE = (d: number) =>
  sign(d) === 0 ? "text-muted-foreground" : d > 0 ? "text-[var(--chart-3)]" : "text-destructive";

/** One plain sentence on how the whole deal looks. */
function headline(years: ContractValueChartYear[]): string {
  const n = years.length;
  const ahead = years.filter((y) => sign(y.surplus) > 0).length;
  const behind = years.filter((y) => sign(y.surplus) < 0).length;
  let lead: string;
  if (n === 1) {
    lead =
      ahead === 1
        ? "Projected to be worth more than his salary this season."
        : behind === 1
          ? "Projected to be worth less than his salary this season."
          : "Projected to be worth about his salary this season.";
  } else if (ahead === n) lead = "Worth more than his salary in every season of the deal.";
  else if (behind === n) lead = "Paid more than he's projected to be worth in every season.";
  else lead = `Worth more than his salary in ${ahead} of ${n} seasons.`;

  if (n < 2) return lead;
  const first = years[0]!;
  const last = years[n - 1]!;
  const change = last.surplus - first.surplus;
  if (Math.abs(change) < TREND_MIN) return lead;
  const salaryRises = last.salary > first.salary + TREND_MIN;
  const overall = years.reduce((s, y) => s + y.surplus, 0);
  const shrinking = change < 0;
  const tail = shrinking && salaryRises ? " as his salary rises" : " over the deal";
  if (overall >= 0) return `${lead} The edge ${shrinking ? "shrinks" : "grows"}${tail}.`;
  return `${lead} The loss ${shrinking ? "grows" : "narrows"}${tail}.`;
}

/** Paid vs worth, one row per contract season, with the gap between them filled in. */
export function ContractValueChart({ years }: { years: ContractValueChartYear[] }) {
  const [selected, setSelected] = useState(years[0]?.season ?? null);
  if (!years.length) return null;

  const top = Math.max(...years.map((y) => Math.max(y.worthHigh, y.salary)));
  const step = gridStep(top);
  const max = Math.ceil((top * 1.04) / step) * step;
  const pct = (d: number) => (Math.max(0, Math.min(d, max)) / max) * 100;
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  const active = years.find((y) => y.season === selected) ?? years[0]!;

  return (
    <div className="flex flex-col gap-3">
      <p className={cn(type.body, "font-semibold leading-snug")}>{headline(years)}</p>

      <div data-hover-group className="flex flex-col">
        {years.map((y, i) => {
          const isActive = y.season === active.season;
          const lo = Math.min(y.salary, y.worth);
          const hi = Math.max(y.salary, y.worth);
          // Options can flip who keeps the upside, so the gap only takes a color when it agrees with the surplus.
          const agrees = sign(y.worth - y.salary) === sign(y.surplus);
          const gapColor = !agrees || sign(y.surplus) === 0
            ? "var(--muted-foreground)"
            : y.surplus > 0
              ? "var(--chart-3)"
              : "var(--destructive)";
          return (
            <button
              key={y.season}
              type="button"
              data-hover-item
              style={{ "--i": i } as CSSProperties}
              onClick={() => setSelected(y.season)}
              onMouseEnter={() => setSelected(y.season)}
              onFocus={() => setSelected(y.season)}
              aria-pressed={isActive}
              aria-label={`${y.season}: salary ${formatUsdCompact(y.salary)}, estimated worth ${formatUsdCompact(y.worth)}, likely ${formatUsdCompact(y.worthLow)} to ${formatUsdCompact(y.worthHigh)}, surplus ${signedUsd(y.surplus)}`}
              className={cn(
                "grid grid-cols-[4.25rem_1fr_4.75rem] items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive ? "bg-foreground/[0.05]" : "hover:bg-foreground/[0.03]"
              )}
            >
              <span className="flex min-w-0 flex-col">
                <span
                  className={cn(
                    type.bodySm,
                    "tabular-nums",
                    isActive ? "font-semibold text-foreground" : "text-muted-foreground"
                  )}
                >
                  {y.season}
                </span>
                {y.terms ? (
                  <span className={cn(type.micro, "truncate text-muted-foreground")}>{y.terms}</span>
                ) : null}
              </span>
              <span aria-hidden className="relative h-7">
                <span className="absolute inset-x-0 top-1/2 h-px bg-border/70" />
                <span
                  data-motion-bar="x"
                  className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-[var(--chart-3)]/15"
                  style={{ left: `${pct(y.worthLow)}%`, width: `${pct(y.worthHigh) - pct(y.worthLow)}%` }}
                />
                <span
                  data-motion-bar="x"
                  className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
                  style={{
                    transformOrigin: y.worth >= y.salary ? "left" : "right",
                    left: `${pct(lo)}%`,
                    width: `${pct(hi) - pct(lo)}%`,
                    background: gapColor,
                    opacity: agrees ? 0.85 : 0.4,
                  }}
                />
                <span
                  data-motion-dot
                  className="absolute top-1/2 h-5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
                  style={{ left: `${pct(y.salary)}%` }}
                />
                <span
                  data-motion-mark
                  className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--card)] bg-[var(--chart-3)]"
                  style={{ left: `${pct(y.worth)}%`, "--mark-from": `${pct(y.salary)}%` } as CSSProperties}
                />
              </span>
              <span
                className={cn(
                  type.bodySm,
                  "text-right font-bold tabular-nums",
                  SURPLUS_TONE(y.surplus)
                )}
              >
                {signedUsd(y.surplus)}
              </span>
            </button>
          );
        })}

        <div className="grid grid-cols-[4.25rem_1fr_4.75rem] gap-3 px-2 pt-1">
          <span />
          <span aria-hidden className={cn(type.micro, "relative h-4 text-muted-foreground")}>
            {ticks.map((v, i) => (
              <span
                key={v}
                className={cn(
                  "absolute tabular-nums",
                  i === 0 ? "" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2",
                  ticks.length > 3 && i % 2 === 1 && "max-sm:hidden"
                )}
                style={{ left: `${pct(v)}%` }}
              >
                {v === 0 ? "$0" : formatUsdCompact(v).replace(".0M", "M")}
              </span>
            ))}
          </span>
          <span className={cn(type.micro, "text-right text-muted-foreground")}>Surplus</span>
        </div>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg bg-foreground/[0.04] px-3 py-2" aria-live="polite">
        <span className={cn(type.bodySm, "font-semibold tabular-nums")}>{active.season}</span>
        <span className={cn(type.bodySm, "tabular-nums")}>
          Paid {formatUsdCompact(active.salary)}, worth about {formatUsdCompact(active.worth)} (likely{" "}
          {formatUsdCompact(active.worthLow)} to {formatUsdCompact(active.worthHigh)})
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
          <span aria-hidden className="h-3.5 w-[3px] rounded-full bg-foreground" />
          Salary
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full bg-[var(--chart-3)]" />
          Estimated worth
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-4 rounded-full bg-[var(--chart-3)]/15" />
          Likely range (80%)
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-1.5 w-4 rounded-full bg-[var(--chart-3)]" />
          <span aria-hidden className="-ml-1 h-1.5 w-4 rounded-full bg-[var(--destructive)]" />
          Gain or loss
        </li>
        {years.some((y) => sign(y.worth - y.salary) !== sign(y.surplus)) ? (
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-1.5 w-4 rounded-full bg-muted-foreground/40" />
            Grey where option terms flip the surplus
          </li>
        ) : null}
      </ul>
    </div>
  );
}

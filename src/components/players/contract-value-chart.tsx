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

/** Surplus this small reads as even. */
const EVEN = 50_000;

function signedUsd(dollars: number): string {
  if (Math.abs(dollars) < EVEN) return "$0";
  const text = formatUsdCompact(Math.abs(dollars));
  return dollars > 0 ? `+${text}` : `-${text}`;
}

const SURPLUS_TONE = (d: number) =>
  Math.abs(d) < EVEN
    ? "text-muted-foreground"
    : d > 0
      ? "text-[var(--chart-3)]"
      : "text-destructive";

/**
 * One row per season: surplus as a diverging bar, paid and worth as plain numbers.
 * Options can make surplus differ from worth − salary, so the bar follows surplus.
 */
function ContractValueChartBody({
  years,
  initialSeason,
}: {
  years: ContractValueChartYear[];
  /** Prefer this season when present (Salary tab follows the page season). */
  initialSeason?: string | null;
}) {
  const [selected, setSelected] = useState(
    () =>
      (initialSeason && years.some((y) => y.season === initialSeason)
        ? initialSeason
        : years[0]?.season) ?? null
  );

  if (!years.length) return null;

  const max = Math.max(...years.map((y) => Math.abs(y.surplus)), 1);
  const width = (dollars: number) => `${(Math.abs(dollars) / max) * 50}%`;
  const active = years.find((y) => y.season === selected) ?? years[0]!;

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          type.micro,
          "grid grid-cols-[5.5rem_minmax(0,1fr)_4.5rem] items-center gap-3 px-0.5 font-semibold uppercase tracking-wide text-muted-foreground sm:grid-cols-[6.5rem_minmax(0,1fr)_4.75rem_4.75rem_4.75rem]"
        )}
      >
        <span>Season</span>
        <span aria-hidden />
        <span className="hidden text-right sm:block">Worth</span>
        <span className="hidden text-right sm:block">Paid</span>
        <span className="text-right">Surplus</span>
      </div>

      <div data-hover-group className="flex flex-col gap-1.5">
        {years.map((y, i) => {
          const isActive = y.season === active.season;
          const positive = y.surplus > EVEN;
          const negative = y.surplus < -EVEN;
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
              aria-label={`${y.season}: paid ${formatUsdCompact(y.salary)}, worth ${formatUsdCompact(y.worth)}, surplus ${signedUsd(y.surplus)}`}
              className={cn(
                "grid grid-cols-[5.5rem_minmax(0,1fr)_4.5rem] items-center gap-3 rounded-[11px] px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[6.5rem_minmax(0,1fr)_4.75rem_4.75rem_4.75rem]",
                isActive ? "bg-foreground/[0.06]" : "hover:bg-foreground/[0.03]"
              )}
            >
              <span className="min-w-0">
                <span
                  className={cn(
                    type.bodySm,
                    "block tabular-nums",
                    isActive ? "font-semibold text-foreground" : "text-muted-foreground"
                  )}
                >
                  {y.season}
                </span>
                {y.terms ? (
                  <span className={cn(type.micro, "block truncate text-muted-foreground")}>
                    {y.terms}
                  </span>
                ) : null}
                <span className={cn(type.micro, "mt-0.5 block tabular-nums text-muted-foreground sm:hidden")}>
                  Worth {formatUsdCompact(y.worth)} · Paid {formatUsdCompact(y.salary)}
                </span>
              </span>

              <span className="relative h-5 rounded-full bg-foreground/[0.05]" aria-hidden>
                <span className="absolute inset-y-0 left-1/2 w-px bg-foreground/30" />
                {positive || negative ? (
                  <span
                    data-motion-bar="x"
                    className={cn(
                      "absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full",
                      positive
                        ? "left-1/2 bg-[var(--chart-3)]"
                        : "right-1/2 bg-destructive"
                    )}
                    style={{ width: width(y.surplus) }}
                  />
                ) : (
                  <span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground" />
                )}
              </span>

              <span
                className={cn(
                  type.caption,
                  "hidden text-right tabular-nums text-muted-foreground sm:block"
                )}
              >
                {formatUsdCompact(y.worth)}
              </span>
              <span
                className={cn(
                  type.caption,
                  "hidden text-right tabular-nums text-muted-foreground sm:block"
                )}
              >
                {formatUsdCompact(y.salary)}
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
      </div>

    </div>
  );
}

export function ContractValueChart(props: Parameters<typeof ContractValueChartBody>[0]) {
  const key = [props.initialSeason ?? "", ...props.years.map(y => y.season)].join("|");
  return <ContractValueChartBody key={key} {...props} />;
}

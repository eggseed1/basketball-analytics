"use client";

import { useState, type CSSProperties } from "react";

import { type } from "@/lib/design-system";
import { formatUsdCompact } from "@/lib/format-money";
import { cn } from "@/lib/utils";

import { lastName, LegendSwatch } from "./viz-kit";

export type SalaryStackRow = {
  id: string;
  name: string;
  cells: Array<{ amount: number; option?: "player" | "team"; notGuaranteed?: boolean } | null>;
};

const OPTION_STRIPES =
  "repeating-linear-gradient(135deg, transparent 0 5px, color-mix(in oklab, var(--background) 45%, transparent) 5px 8px)";

/**
 * Payroll tab hero: one stacked column per season, one block per contract.
 * Hovering a player outlines his salary in every season he is signed for.
 */
export function PayrollSalaryStack({
  seasons: allSeasons,
  rows,
  salaryCap,
  capSeason,
}: {
  seasons: string[];
  rows: SalaryStackRow[];
  salaryCap: number | null;
  capSeason: string | null;
}) {
  const [focus, setFocus] = useState<string | null>(null);
  const filled = allSeasons.map((_, si) => rows.some((r) => (r.cells[si]?.amount ?? 0) > 0));
  const seasons = allSeasons.slice(0, filled.lastIndexOf(true) + 1);
  const totals = seasons.map((_, si) => rows.reduce((s, r) => s + (r.cells[si]?.amount ?? 0), 0));
  const max = Math.max(...totals, salaryCap ?? 0, 1);
  const capIndex = capSeason ? seasons.indexOf(capSeason) : 0;
  const shade = (i: number) => `color-mix(in oklab, var(--viz-accent) ${Math.max(28, 92 - (i % 8) * 9)}%, var(--muted))`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <LegendSwatch color="var(--viz-accent)" label="Guaranteed salary" />
        <span className={cn(type.caption, "inline-flex items-center gap-1.5 text-muted-foreground")}>
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: `${OPTION_STRIPES}, var(--viz-accent)` }} />
          Player or team option
        </span>
        <LegendSwatch color="var(--viz-accent)" outline label="Not guaranteed" />
        {salaryCap ? <LegendSwatch color="var(--foreground)" shape="line" label={`Cap ${formatUsdCompact(salaryCap)}`} /> : null}
      </div>
      <div className="relative flex h-[340px] items-end gap-2 sm:h-[400px] sm:gap-4" onMouseLeave={() => setFocus(null)}>
        {seasons.map((season, si) => {
          const total = totals[si]!;
          const present = rows
            .map((r, ri) => ({ r, ri, cell: r.cells[si] }))
            .filter((x) => x.cell != null && x.cell.amount > 0);
          return (
            <div key={season} className="flex h-full min-w-0 flex-1 flex-col items-stretch justify-end gap-1">
              <span className={cn(type.caption, "text-center font-bold tabular-nums")}>
                {total > 0 ? formatUsdCompact(total) : "—"}
              </span>
              <div className="relative flex flex-col-reverse" style={{ height: `${(total / max) * 88}%` }}>
                {si === capIndex && salaryCap ? (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-[-6px] z-10 border-t-2 border-dashed border-foreground"
                    style={{ bottom: `${(salaryCap / total) * 100}%` }}
                  />
                ) : null}
                {present.map(({ r, ri, cell }, idx) => {
                  if (!cell) return null;
                  const share = cell.amount / total;
                  const on = focus === r.id;
                  return (
                    <span
                      key={r.id}
                      data-viz-bar
                      data-motion-bar="y"
                      tabIndex={0}
                      onMouseEnter={() => setFocus(r.id)}
                      onFocus={() => setFocus(r.id)}
                      data-tip={`${r.name} · ${season}`}
                      data-tip-sub={[
                        formatUsdCompact(cell.amount),
                        cell.option ? `${cell.option} option` : null,
                        cell.notGuaranteed ? "not guaranteed" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      className="relative flex items-center justify-center overflow-hidden border-t border-background"
                      style={
                        {
                          height: `${share * 100}%`,
                          background: cell.notGuaranteed
                            ? "color-mix(in oklab, var(--viz-accent) 12%, var(--background))"
                            : cell.option
                              ? `${OPTION_STRIPES}, ${shade(ri)}`
                              : shade(ri),
                          boxShadow: on
                            ? "inset 0 0 0 2px var(--foreground)"
                            : cell.notGuaranteed
                              ? "inset 0 0 0 1.5px var(--viz-accent)"
                              : undefined,
                          color: ri % 8 < 4 && !cell.notGuaranteed ? "var(--background)" : "var(--foreground)",
                          zIndex: on ? 5 : undefined,
                          "--i": si * 3 + Math.min(idx, 10),
                        } as CSSProperties
                      }
                    >
                      {share * (total / max) * 400 > 18 ? (
                        <span className={cn(type.micro, "truncate px-1 font-bold")}>{lastName(r.name)}</span>
                      ) : null}
                    </span>
                  );
                })}
              </div>
              <span className={cn(type.caption, "text-center font-semibold text-muted-foreground")}>{season}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

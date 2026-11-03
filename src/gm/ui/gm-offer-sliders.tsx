"use client";

import { cn } from "@/lib/utils";

type Signal = "unlikely" | "possible" | "strong";

const colors: Record<Signal,string> = {
  unlikely: "#e1645f", possible: "#db9c37", strong: "#2caa73",
};

/**
 * Shared annual-salary / contract-term controls for FA, re-signing and
 * extensions. Values never go beyond the legal ceiling supplied by the
 * contract engine. Colored progress indicates the *current offer's* agent
 * interest; it is not a guaranteed outcome.
 */
export function GmOfferSliders({
  salaryM, setSalaryM, minM, maxM, years, setYears, minYears, maxYears,
  chance, status, prefix, disabled = false, interestLabel = "Agent interest forecast",
}: {
  salaryM: number; setSalaryM: (value: number) => void;
  minM: number; maxM: number;
  years: number; setYears: (value: number) => void;
  minYears: number; maxYears: number;
  chance: number; status: Signal; prefix: string; disabled?: boolean; interestLabel?: string;
}) {
  const enabled = !disabled && maxM >= minM && minM > 0;
  const min = Math.max(.01, minM);
  const max = Math.max(min, maxM);
  const salary = Math.max(min, Math.min(max, salaryM));
  const progress = max > min ? Math.max(0, Math.min(100, (salary - min) / (max - min) * 100)) : 100;
  const color = colors[status];
  const track = `linear-gradient(to right, ${color} 0%, ${color} ${progress}%, var(--border) ${progress}%, var(--border) 100%)`;
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-end justify-between gap-3">
          <label htmlFor={prefix + "-salary"} className="text-sm font-semibold">Annual salary</label>
          <div className="text-right"><span className="text-3xl font-bold tabular-nums">${salary.toFixed(2)}M</span>
            <p className="text-xs text-muted-foreground">per season</p></div>
        </div>
        <input id={prefix + "-salary"} aria-label="Annual salary offer" type="range" min={min} max={max}
          step="0.01" value={salary} disabled={!enabled} onChange={event => setSalaryM(Number(event.target.value))}
          className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: track, accentColor: color }} />
        <div className="mt-2 flex justify-between gap-4 text-xs text-muted-foreground">
          <span>Minimum ${min.toFixed(2)}M</span><span>Max you can offer ${maxM.toFixed(2)}M</span>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={prefix + "-years"} className="text-sm font-semibold">Contract length</label>
          <span className="text-lg font-bold tabular-nums">{years} {years === 1 ? "year" : "years"}</span>
        </div>
        <input id={prefix + "-years"} aria-label="Contract length" type="range"
          min={minYears} max={maxYears} step="1" value={years} disabled={!enabled || minYears >= maxYears}
          onChange={event => setYears(Number(event.target.value))}
          className="mt-3 w-full cursor-pointer accent-foreground disabled:cursor-not-allowed disabled:opacity-50" />
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>{minYears} year{minYears === 1 ? "" : "s"}</span>
          <span>{maxYears} year{maxYears === 1 ? "" : "s"}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/50 p-3">
        <div>
          <p className="text-xs text-muted-foreground">Total contract value</p>
          <p className="text-xl font-bold tabular-nums">${(salary * years).toFixed(2)}M</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">{interestLabel}</p>
          <p className="text-lg font-bold tabular-nums" style={{ color }}>{chance}% · <span className="capitalize">{status}</span></p>
        </div>
      </div>
      <div role="img" aria-label={`Offer interest: ${chance}% ${status}`}
        className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className={cn("h-full rounded-full transition-[width] duration-100")}
          style={{ width: `${chance}%`, background: color }} />
      </div>
      <p className="text-xs text-muted-foreground">Agent interest is an estimate; competing offers, roster fit, and contract rules still determine the result.</p>
    </div>
  );
}

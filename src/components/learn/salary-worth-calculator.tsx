"use client";

import { useId, useState } from "react";

import { type } from "@/lib/design-system";
import { formatUsdCompact, formatUsdSignedCompact } from "@/lib/format-money";
import { cn } from "@/lib/utils";

const POSITIVE = "var(--chart-3)";
const NEGATIVE = "var(--destructive)";

const TRY: Array<{ label: string; wins: number; salary: number }> = [
  { label: "Cheap bench piece", wins: 0.5, salary: 2.5e6 },
  { label: "Paid starter", wins: 2, salary: 30e6 },
  { label: "Star on a max", wins: 6, salary: 55e6 },
  { label: "Rookie-scale breakout", wins: 4, salary: 9e6 },
];

export function SalaryWorthCalculator({
  season,
  pricePerWin,
  minimum,
}: {
  season: string;
  pricePerWin: number;
  minimum: number;
}) {
  const winsId = useId();
  const salaryId = useId();
  const [wins, setWins] = useState(2);
  const [salary, setSalary] = useState(20e6);

  const winValue = wins * pricePerWin;
  const worth = minimum + winValue;
  const surplus = worth - salary;
  const paidOff = (worth / salary) * 100;
  const scale = Math.max(worth, salary) * 1.08;
  const pct = (v: number) => `${(v / scale) * 100}%`;
  const good = surplus >= 0;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border/70 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label htmlFor={winsId} className="flex flex-col gap-1.5">
          <span className={cn(type.caption, "flex justify-between font-semibold")}>
            Wins above replacement
            <span className="tabular-nums">{wins.toFixed(1)}</span>
          </span>
          <input
            id={winsId}
            type="range"
            min={0}
            max={14}
            step={0.1}
            value={wins}
            onChange={(e) => setWins(Number(e.target.value))}
            className="accent-foreground"
          />
        </label>
        <label htmlFor={salaryId} className="flex flex-col gap-1.5">
          <span className={cn(type.caption, "flex justify-between font-semibold")}>
            Salary
            <span className="tabular-nums">{formatUsdCompact(salary)}</span>
          </span>
          <input
            id={salaryId}
            type="range"
            min={1e6}
            max={65e6}
            step={0.5e6}
            value={salary}
            onChange={(e) => setSalary(Number(e.target.value))}
            className="accent-foreground"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className={cn(type.caption, "mr-1 self-center text-muted-foreground")}>Try</span>
        {TRY.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => {
              setWins(t.wins);
              setSalary(t.salary);
            }}
            className="rounded-full border border-border px-2.5 py-1 text-[12px] font-semibold hover:bg-secondary"
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2" aria-live="polite">
        <div className="grid grid-cols-[4rem_minmax(0,1fr)_4.5rem] items-center gap-2">
          <span className={cn(type.caption, "font-semibold")}>Worth</span>
          <span className="flex h-6 overflow-hidden rounded-sm bg-secondary/50">
            <span
              data-tip="League minimum"
              data-tip-sub={`${formatUsdCompact(minimum)}: what a replacement player costs`}
              className="h-full transition-[width] duration-200"
              style={{ width: pct(minimum), background: "color-mix(in oklab, var(--foreground) 30%, transparent)" }}
            />
            <span
              data-tip={`${wins.toFixed(1)} wins × ${formatUsdCompact(pricePerWin)}`}
              data-tip-sub={formatUsdCompact(winValue)}
              className="h-full transition-[width] duration-200"
              style={{ width: pct(winValue), background: POSITIVE, opacity: 0.85 }}
            />
          </span>
          <span className={cn(type.caption, "text-right font-semibold tabular-nums")}>{formatUsdCompact(worth)}</span>
        </div>
        <div className="grid grid-cols-[4rem_minmax(0,1fr)_4.5rem] items-center gap-2">
          <span className={cn(type.caption, "font-semibold")}>Salary</span>
          <span className="flex h-6 overflow-hidden rounded-sm bg-secondary/50">
            <span
              className="h-full bg-foreground/70 transition-[width] duration-200"
              style={{ width: pct(salary) }}
            />
          </span>
          <span className={cn(type.caption, "text-right font-semibold tabular-nums")}>{formatUsdCompact(salary)}</span>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 border-t border-border/60 pt-3">
        <div>
          <dt className={cn(type.caption, "text-muted-foreground")}>Surplus for the season</dt>
          <dd className="text-[20px] font-bold tabular-nums" style={{ color: good ? POSITIVE : NEGATIVE }}>
            {formatUsdSignedCompact(surplus)}
          </dd>
        </div>
        <div>
          <dt className={cn(type.caption, "text-muted-foreground")}>Salary paid off</dt>
          <dd className="text-[20px] font-bold tabular-nums">{Math.round(paidOff)}%</dd>
        </div>
      </dl>
      <p className={cn(type.caption, "text-muted-foreground")}>
        {season} prices: {formatUsdCompact(minimum)} for a replacement player and {formatUsdCompact(pricePerWin)} for
        each win above replacement. The light segment is the minimum, the colored one is the wins.
      </p>
    </div>
  );
}

"use client";

import type { FutureCommitmentBar } from "@/data/types/front-office";
import { formatUsdCompact, formatUsdDollars } from "@/lib/format-money";

export function PayrollCommitmentsChart({
  bars,
}: {
  bars: FutureCommitmentBar[];
}) {
  if (!bars.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Future commitment visualization unavailable — no known salaries for this
        franchise snapshot.
      </p>
    );
  }

  const max = Math.max(...bars.map((b) => b.totalSalaryDollars), 1);

  return (
    <div className="space-y-3" role="img" aria-label="Salary commitments by season">
      <p className="text-sm text-muted-foreground">
        How much salary is this team committed to, and for how long? Known
        player salary commitments by season (current source horizon).
      </p>
      <ul className="space-y-3">
        {bars.map((bar) => {
          const pct = Math.max(4, Math.round((bar.totalSalaryDollars / max) * 100));
          return (
            <li key={bar.season} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-semibold tabular-nums">{bar.season}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatUsdDollars(bar.totalSalaryDollars)} ·{" "}
                  {bar.playersUnderContract} players under contract
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-sm bg-secondary">
                <div
                  className="h-full rounded-sm bg-foreground/80"
                  style={{ width: `${pct}%` }}
                  title={formatUsdCompact(bar.totalSalaryDollars)}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

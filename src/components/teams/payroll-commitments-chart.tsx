"use client";

import type { CSSProperties } from "react";

import type { FutureCommitmentBar } from "@/data/types/front-office";
import { formatUsdDollars } from "@/lib/format-money";

export function PayrollCommitmentsChart({
  bars,
}: {
  bars: FutureCommitmentBar[];
}) {
  if (!bars.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Future commitments are unavailable because this franchise snapshot has
        no known salaries.
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
      <ul data-hover-group className="space-y-3">
        {bars.map((bar, i) => {
          const pct = Math.max(4, Math.round((bar.totalSalaryDollars / max) * 100));
          return (
            <li key={bar.season} data-hover-item className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-semibold tabular-nums">{bar.season}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatUsdDollars(bar.totalSalaryDollars)} ·{" "}
                  {bar.playersUnderContract} players under contract
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-sm bg-secondary">
                <div
                  data-motion-bar="x"
                  className="h-full rounded-sm bg-foreground/80"
                  style={{ width: `${pct}%`, "--i": i * 2 } as CSSProperties}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

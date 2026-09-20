import Link from "next/link";

import type { StatDetectiveRow } from "@/data/runtime/stat-detective-windows";
import { formatNumber } from "@/lib/format";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function signed(value: number, digits: number): string {
  const text = formatNumber(value, digits);
  return value > 0 ? `+${text}` : text;
}

/** Mini before → after scoring bar for one mover. */
function BeforeAfterBar({
  baseline,
  window,
  rising,
}: {
  baseline: number;
  window: number;
  rising: boolean;
}) {
  const max = Math.max(baseline, window, 1);
  const basePct = Math.max(6, (baseline / max) * 100);
  const winPct = Math.max(6, (window / max) * 100);
  return (
    <div
      className="flex w-full max-w-[9.5rem] flex-col gap-1"
      aria-hidden
    >
      <div className="flex items-center gap-1.5">
        <span className="w-8 shrink-0 text-[10px] text-muted-foreground">
          Base
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-muted-foreground/45"
            style={{ width: `${basePct}%` }}
          />
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-8 shrink-0 text-[10px] text-muted-foreground">
          Now
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
          <div
            className={cn(
              "h-full rounded-full",
              rising ? "bg-[var(--accent-positive)]" : "bg-[var(--accent-negative)]"
            )}
            style={{ width: `${winPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function MoverList({
  title,
  description,
  rows,
  limit,
  rising,
  baselineLabel,
  windowLabel,
}: {
  title: string;
  description: string;
  rows: StatDetectiveRow[];
  limit?: number;
  rising: boolean;
  baselineLabel: string;
  windowLabel: string;
}) {
  const shown = limit ? rows.slice(0, limit) : rows;
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3
          className={cn(
            type.caption,
            "font-bold uppercase tracking-wide",
            rising ? "text-[var(--accent-positive)]" : "text-[var(--accent-negative)]"
          )}
        >
          {title}
        </h3>
        <p className={cn(type.caption, "mt-0.5 text-muted-foreground")}>
          {description}
        </p>
      </div>
      {shown.length ? (
        <ul className="flex flex-col gap-3">
          {shown.map((row) => (
            <li
              key={`${title}-${row.playerId}`}
              className="flex min-w-0 items-center justify-between gap-3 border-b border-border/50 pb-3 last:border-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/players/${encodeURIComponent(row.playerId)}`}
                  className={cn(
                    type.bodySm,
                    "font-semibold underline-offset-2 hover:underline"
                  )}
                >
                  {row.playerName}
                </Link>
                <p className={cn(type.caption, "mt-0.5 text-muted-foreground")}>
                  {row.teamAbbr ? `${row.teamAbbr} · ` : ""}
                  {windowLabel} {formatNumber(row.windowPpg, 1)} PPG
                  {" · "}
                  {baselineLabel} {formatNumber(row.baselinePpg, 1)}
                  {row.deltaTs == null
                    ? ""
                    : ` · TS ${signed(row.deltaTs * 100, 1)}`}
                </p>
              </div>
              <div className="hidden shrink-0 sm:block">
                <BeforeAfterBar
                  baseline={row.baselinePpg}
                  window={row.windowPpg}
                  rising={rising}
                />
              </div>
              <span
                className={cn(
                  type.body,
                  "shrink-0 font-semibold tabular-nums",
                  rising
                    ? "text-[var(--accent-positive)]"
                    : "text-[var(--accent-negative)]"
                )}
              >
                {signed(row.deltaPpg, 1)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          No qualified movers in this window.
        </p>
      )}
    </div>
  );
}

export function StatDetectiveLists({
  risers,
  fallers,
  limit,
  baselineLabel = "Season avg",
  windowLabel = "Window",
}: {
  risers: StatDetectiveRow[];
  fallers: StatDetectiveRow[];
  limit?: number;
  baselineLabel?: string;
  windowLabel?: string;
}) {
  return (
    <div className="grid gap-8 sm:grid-cols-2">
      <MoverList
        title="Heating up"
        description="Scoring more than their own usual rate"
        rows={risers}
        limit={limit}
        rising
        baselineLabel={baselineLabel}
        windowLabel={windowLabel}
      />
      <MoverList
        title="Cooling off"
        description="Scoring less than their own usual rate"
        rows={fallers}
        limit={limit}
        rising={false}
        baselineLabel={baselineLabel}
        windowLabel={windowLabel}
      />
    </div>
  );
}

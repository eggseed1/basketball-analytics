import Link from "next/link";

import type {
  StatDetectiveMetricId,
  StatDetectiveRow,
} from "@/data/runtime/stat-detective-windows";
import { formatNumber } from "@/lib/format";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function signed(value: number, digits: number): string {
  const text = formatNumber(value, digits);
  return value > 0 ? `+${text}` : text;
}

function metricValues(
  row: StatDetectiveRow,
  metric: StatDetectiveMetricId
): { baseline: number; window: number; delta: number; deltaLabel: string } | null {
  if (metric === "ppg") {
    return {
      baseline: row.baselinePpg,
      window: row.windowPpg,
      delta: row.deltaPpg,
      deltaLabel: signed(row.deltaPpg, 1),
    };
  }
  if (metric === "ts") {
    if (
      row.windowTs == null ||
      row.baselineTs == null ||
      row.deltaTs == null
    ) {
      return null;
    }
    return {
      baseline: row.baselineTs * 100,
      window: row.windowTs * 100,
      delta: row.deltaTs * 100,
      deltaLabel: `${signed(row.deltaTs * 100, 1)}`,
    };
  }
  if (
    row.windowRpg == null ||
    row.baselineRpg == null ||
    row.deltaRpg == null
  ) {
    return null;
  }
  return {
    baseline: row.baselineRpg,
    window: row.windowRpg,
    delta: row.deltaRpg,
    deltaLabel: signed(row.deltaRpg, 1),
  };
}

function unitLabel(metric: StatDetectiveMetricId): string {
  if (metric === "ppg") return "PPG";
  if (metric === "ts") return "TS%";
  return "RPG";
}

/** Mini before → after bar for one mover. */
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
  metric,
}: {
  title: string;
  description: string;
  rows: StatDetectiveRow[];
  limit?: number;
  rising: boolean;
  baselineLabel: string;
  windowLabel: string;
  metric: StatDetectiveMetricId;
}) {
  const shown = limit ? rows.slice(0, limit) : rows;
  const unit = unitLabel(metric);
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
          {shown.map((row) => {
            const values = metricValues(row, metric);
            if (!values) return null;
            return (
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
                    {windowLabel}{" "}
                    {metric === "ts"
                      ? formatNumber(values.window, 1)
                      : formatNumber(values.window, 1)}{" "}
                    {unit}
                    {" · "}
                    {baselineLabel} {formatNumber(values.baseline, 1)}
                    {metric === "ppg" && row.deltaTs != null
                      ? ` · TS ${signed(row.deltaTs * 100, 1)}`
                      : ""}
                  </p>
                </div>
                <div className="hidden shrink-0 sm:block">
                  <BeforeAfterBar
                    baseline={values.baseline}
                    window={values.window}
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
                  {values.deltaLabel}
                </span>
              </li>
            );
          })}
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
  metric = "ppg",
}: {
  risers: StatDetectiveRow[];
  fallers: StatDetectiveRow[];
  limit?: number;
  baselineLabel?: string;
  windowLabel?: string;
  metric?: StatDetectiveMetricId;
}) {
  const risingCopy =
    metric === "ppg"
      ? "Scoring more than their own usual rate"
      : metric === "ts"
        ? "Shooting more efficiently than their own usual rate"
        : "Rebounding more than their own usual rate";
  const fallingCopy =
    metric === "ppg"
      ? "Scoring less than their own usual rate"
      : metric === "ts"
        ? "Shooting less efficiently than their own usual rate"
        : "Rebounding less than their own usual rate";

  return (
    <div className="grid gap-8 sm:grid-cols-2">
      <MoverList
        title="Heating up"
        description={risingCopy}
        rows={risers}
        limit={limit}
        rising
        baselineLabel={baselineLabel}
        windowLabel={windowLabel}
        metric={metric}
      />
      <MoverList
        title="Cooling off"
        description={fallingCopy}
        rows={fallers}
        limit={limit}
        rising={false}
        baselineLabel={baselineLabel}
        windowLabel={windowLabel}
        metric={metric}
      />
    </div>
  );
}

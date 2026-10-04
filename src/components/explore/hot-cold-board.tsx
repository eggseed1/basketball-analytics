import { PlayerIdentity } from "@/components/players/player-identity";
import type {
  StatDetectiveMetricId,
  StatDetectiveRow,
} from "@/data/runtime/stat-detective-windows";
import { formatNumber } from "@/lib/format";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

type RowValues = { baseline: number; window: number; delta: number };

function signed(value: number, digits = 1): string {
  const text = formatNumber(value, digits);
  return value > 0 ? `+${text}` : text;
}

function rowValues(row: StatDetectiveRow, metric: StatDetectiveMetricId): RowValues | null {
  if (metric === "ppg") {
    return { baseline: row.baselinePpg, window: row.windowPpg, delta: row.deltaPpg };
  }
  if (metric === "ts") {
    if (row.windowTs == null || row.baselineTs == null || row.deltaTs == null) return null;
    return {
      baseline: row.baselineTs * 100,
      window: row.windowTs * 100,
      delta: row.deltaTs * 100,
    };
  }
  if (row.windowRpg == null || row.baselineRpg == null || row.deltaRpg == null) return null;
  return { baseline: row.baselineRpg, window: row.windowRpg, delta: row.deltaRpg };
}

const UNIT: Record<StatDetectiveMetricId, string> = { ppg: "PPG", ts: "TS%", rpg: "RPG" };

const COPY: Record<StatDetectiveMetricId, { hot: string; cold: string }> = {
  ppg: { hot: "Scoring more than usual", cold: "Scoring less than usual" },
  ts: { hot: "Shooting more efficiently than usual", cold: "Shooting less efficiently than usual" },
  rpg: { hot: "Rebounding more than usual", cold: "Rebounding less than usual" },
};

function formatValue(value: number, metric: StatDetectiveMetricId): string {
  return metric === "ts" ? `${formatNumber(value, 1)}%` : formatNumber(value, 1);
}

function Column({
  hot,
  rows,
  metric,
  scale,
}: {
  hot: boolean;
  rows: StatDetectiveRow[];
  metric: StatDetectiveMetricId;
  scale: number;
}) {
  const shown = rows.flatMap((row) => {
    const values = rowValues(row, metric);
    return values ? [{ row, values }] : [];
  });
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-col gap-0.5 pb-1">
        <h3
          className={cn(
            type.caption,
            "flex items-center gap-1.5 font-semibold uppercase tracking-wide",
            hot ? "text-delta-up" : "text-delta-down"
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              hot ? "bg-data-positive" : "bg-data-negative"
            )}
            aria-hidden
          />
          {hot ? "Running hot" : "Running cold"}
        </h3>
        <p className={cn(type.caption, "text-muted-foreground")}>
          {hot ? COPY[metric].hot : COPY[metric].cold}
        </p>
      </div>
      {shown.length ? (
        <ol className="flex flex-col">
          {shown.map(({ row, values }, i) => (
            <li
              key={row.playerId}
              className="flex items-center gap-3 border-t border-border/50 py-2.5 first:border-t-0"
            >
              <span
                className={cn(
                  type.caption,
                  "w-4 shrink-0 text-right tabular-nums text-muted-foreground"
                )}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <PlayerIdentity
                  playerId={row.playerId}
                  name={row.playerName}
                  teamKey={row.teamAbbr || undefined}
                  teamLabel={row.teamAbbr || undefined}
                  variant="compact"
                  className="min-w-0"
                  nameClassName="gap-2 font-semibold no-underline hover:underline"
                />
                <p
                  className={cn(
                    type.caption,
                    "mt-0.5 flex flex-wrap gap-x-1.5 pl-9 tabular-nums text-muted-foreground"
                  )}
                >
                  {[
                    row.teamAbbr || null,
                    `${formatValue(values.baseline, metric)} → ${formatValue(values.window, metric)}${metric === "ts" ? "" : ` ${UNIT[metric]}`}`,
                    metric === "ppg" && row.deltaTs != null
                      ? `TS% ${signed(row.deltaTs * 100)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .map((part, idx) => (
                      <span key={idx} className="whitespace-nowrap">
                        {idx > 0 ? <span aria-hidden className="mr-1.5">·</span> : null}
                        {part}
                      </span>
                    ))}
                </p>
              </div>
              <div className="flex w-14 shrink-0 flex-col items-end gap-1">
                <span
                  className={cn(
                    type.bodySm,
                    "font-bold tabular-nums",
                    hot ? "text-delta-up" : "text-delta-down"
                  )}
                >
                  {signed(values.delta)}
                </span>
                <span className="h-1 w-full overflow-hidden rounded-full bg-foreground/10" aria-hidden>
                  <span
                    className={cn(
                      "ml-auto block h-full rounded-full",
                      hot ? "bg-data-positive" : "bg-data-negative"
                    )}
                    style={{ width: `${Math.max(8, (Math.abs(values.delta) / scale) * 100)}%` }}
                  />
                </span>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className={cn(type.bodySm, "py-4 text-muted-foreground")}>
          No qualified players moved enough in this window.
        </p>
      )}
    </div>
  );
}

/** Hot and cold columns on one shared bar scale. Unframed so callers pick the surface. */
export function HotColdColumns({
  risers,
  fallers,
  limit,
  metric = "ppg",
}: {
  risers: StatDetectiveRow[];
  fallers: StatDetectiveRow[];
  limit?: number;
  metric?: StatDetectiveMetricId;
}) {
  const hot = limit ? risers.slice(0, limit) : risers;
  const cold = limit ? fallers.slice(0, limit) : fallers;
  const scale = Math.max(
    1e-6,
    ...[...hot, ...cold].map((row) => Math.abs(rowValues(row, metric)?.delta ?? 0))
  );
  return (
    <div className="grid gap-6 md:grid-cols-2 md:gap-8">
      <Column hot rows={hot} metric={metric} scale={scale} />
      <Column hot={false} rows={cold} metric={metric} scale={scale} />
    </div>
  );
}

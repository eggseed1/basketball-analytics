"use client";

import { useId, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { PlayerSeason } from "@/data/types";
import {
  CAREER_TIMELINE_METRICS,
  type CareerTimelineMetric,
} from "@/lib/player-savant";
import { cn } from "@/lib/utils";

export function PlayerCareerTimeline({
  seasons,
  playerName,
}: {
  seasons: PlayerSeason[];
  playerName: string;
}) {
  const chartId = useId();
  const [metricKey, setMetricKey] = useState(CAREER_TIMELINE_METRICS[0]?.key ?? "dpm");

  const metric: CareerTimelineMetric =
    CAREER_TIMELINE_METRICS.find((m) => m.key === metricKey) ??
    CAREER_TIMELINE_METRICS[0];

  const chronological = useMemo(
    () => [...seasons].sort((a, b) => a.season.localeCompare(b.season)),
    [seasons]
  );

  const data = useMemo(() => {
    return chronological
      .map((row) => {
        const value = metric.value(row);
        // Drop seasons with no signal for impact metrics that stay at 0
        // when DARKO/BRef never merged (e.g. pre-coverage).
        const impact = [
          "dpm",
          "oDpm",
          "dDpm",
          "r1Points",
          "r1WinEquivalents",
          "drbl100",
          "per",
          "vorp",
          "bpm",
          "usagePct",
        ].includes(metric.key);
        if (impact && value === 0) return null;
        return {
          season: row.season,
          short: row.season.slice(2), // 24-25
          value: Number(value.toFixed(2)),
          team: row.teamAbbreviation ?? row.teamName,
          games: row.gamesPlayed,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);
  }, [chronological, metric]);

  const yDomain = useMemo((): [number | string, number | string] => {
    if (data.length === 0) return [0, 1];
    const values = data.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (metric.kind === "rate") {
      return [Math.max(0, Math.floor(min - 5)), Math.min(100, Math.ceil(max + 5))];
    }
    if (metric.kind === "plusMinus") {
      const pad = Math.max(0.5, (max - min) * 0.15 || 1);
      return [Number((min - pad).toFixed(1)), Number((max + pad).toFixed(1))];
    }
    const pad = Math.max(1, (max - min) * 0.12 || 2);
    return [Math.max(0, Number((min - pad).toFixed(1))), Number((max + pad).toFixed(1))];
  }, [data, metric.kind]);

  return (
    <figure
      aria-labelledby={`${chartId}-title`}
      aria-describedby={`${chartId}-desc`}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <div className="flex flex-col gap-3">
        <div>
          <h2 id={`${chartId}-title`} className="text-lg font-semibold">
            Career timeline
          </h2>
          <p id={`${chartId}-desc`} className="text-sm text-muted-foreground">
            {playerName}&apos;s growth by season — pick a stat to track over
            time.
          </p>
        </div>

        <div
          className="flex flex-wrap gap-1"
          role="tablist"
          aria-label="Career timeline metric"
        >
          {CAREER_TIMELINE_METRICS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={metricKey === item.key}
              onClick={() => setMetricKey(item.key)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium",
                metricKey === item.key
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background hover:bg-muted"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[280px] w-full sm:h-[340px]">
        {data.length < 2 ? (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {data.length === 0
              ? `No ${metric.label} history available yet.`
              : "Need at least two seasons to chart growth."}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 8, right: 12, bottom: 8, left: 4 }}
              role="img"
              aria-label={`${metric.label} over ${playerName} career`}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="short"
                tick={{ fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={yDomain}
                tick={{ fontSize: 11 }}
                width={48}
                tickFormatter={(v) =>
                  metric.kind === "rate" ? `${v}` : String(v)
                }
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as (typeof data)[number];
                  return (
                    <div
                      role="tooltip"
                      className="rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-md"
                    >
                      <p className="font-medium">{row.season}</p>
                      <p>
                        {metric.label} {metric.format(row.value)}
                      </p>
                      <p className="text-muted-foreground">
                        {row.team} · {row.games} GP
                      </p>
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                name={metric.label}
                stroke="currentColor"
                strokeWidth={2.5}
                dot={{ r: 3.5, strokeWidth: 0, fill: "currentColor" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </figure>
  );
}

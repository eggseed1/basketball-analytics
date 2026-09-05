"use client";

import { useId, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  FrostRechartsTooltip,
  rechartsFrostWrapperStyle,
} from "@/components/brand/frost-recharts-tooltip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { type } from "@/lib/design-system";
import { formatNumber } from "@/lib/format";
import {
  NBA_SCHEDULE_GAMES,
  type AvailabilityPoint,
} from "@/lib/player-availability";
import { cn } from "@/lib/utils";

type Mode = "games" | "minutes";

export function PlayerAvailabilityChart({
  points,
  accentColor,
}: {
  points: AvailabilityPoint[];
  accentColor?: string;
}) {
  const chartId = useId();
  const [mode, setMode] = useState<Mode>("games");
  const accent = accentColor?.trim() || "currentColor";

  const data = useMemo(
    () =>
      points.map((p) => ({
        ...p,
        mpgDisplay: Number(p.mpg.toFixed(1)),
      })),
    [points]
  );

  const totals = useMemo(() => {
    if (!data.length) return null;
    const gp = data.reduce((a, p) => a + p.gamesPlayed, 0);
    const missed = data.reduce((a, p) => a + p.gamesMissed, 0);
    const minutes = data.reduce((a, p) => a + p.minutes, 0);
    return { gp, missed, minutes, seasons: data.length };
  }, [data]);

  return (
    <figure
      aria-labelledby={`${chartId}-title`}
      aria-describedby={`${chartId}-desc`}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${chartId}-title`} className={type.heading}>
            Availability
          </h2>
          <p
            id={`${chartId}-desc`}
            className={cn(type.bodySm, "mt-1 text-muted-foreground")}
          >
            Games played, games missed vs an {NBA_SCHEDULE_GAMES}-game schedule,
            and minute load across the career.
          </p>
        </div>
        <SegmentedControl
          size="sm"
          label="View"
          value={mode}
          onChange={setMode}
          options={[
            { id: "games", label: "Games" },
            { id: "minutes", label: "Minutes" },
          ]}
        />
      </div>

      {totals ? (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["Seasons", formatNumber(totals.seasons, 0)],
              ["Games", formatNumber(totals.gp, 0)],
              ["Missed (proxy)", formatNumber(totals.missed, 0)],
              ["Minutes", formatNumber(totals.minutes, 0)],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              className="rounded-md border border-border/70 px-3 py-2"
            >
              <dt
                className={cn(
                  type.micro,
                  "font-semibold uppercase tracking-wide text-muted-foreground"
                )}
              >
                {label}
              </dt>
              <dd className={cn(type.body, "mt-0.5 font-bold tabular-nums")}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="h-[280px] w-full sm:h-[320px]">
        {data.length === 0 ? (
          <p
            className={cn(
              type.bodySm,
              "flex h-full items-center justify-center text-muted-foreground"
            )}
          >
            No career seasons available for availability.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 8, right: 12, bottom: 8, left: 0 }}
              role="img"
              aria-label={
                mode === "games"
                  ? "Games played and missed by season"
                  : "Minutes and MPG by season"
              }
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="short" tick={{ fontSize: 11 }} />
              {mode === "games" ? (
                <>
                  <YAxis
                    tick={{ fontSize: 11 }}
                    width={32}
                    domain={[0, NBA_SCHEDULE_GAMES]}
                  />
                  <Tooltip
                    wrapperStyle={rechartsFrostWrapperStyle}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0]?.payload as AvailabilityPoint;
                      return (
                        <FrostRechartsTooltip active={active}>
                          <p className="font-medium">{row.season}</p>
                          <p className="text-muted-foreground">{row.teamAbbr}</p>
                          <p>
                            {row.gamesPlayed} GP · {row.gamesStarted} GS
                          </p>
                          <p>
                            {row.gamesMissed} missed (vs {NBA_SCHEDULE_GAMES})
                          </p>
                        </FrostRechartsTooltip>
                      );
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey="gamesPlayed"
                    name="Played"
                    fill={accent}
                    fillOpacity={0.85}
                    radius={[3, 3, 0, 0]}
                  />
                  <Bar
                    dataKey="gamesMissed"
                    name="Missed"
                    fill="currentColor"
                    fillOpacity={0.22}
                    radius={[3, 3, 0, 0]}
                  />
                </>
              ) : (
                <>
                  <YAxis
                    yAxisId="min"
                    tick={{ fontSize: 11 }}
                    width={40}
                    label={{
                      value: "MIN",
                      angle: -90,
                      position: "insideLeft",
                      style: { fontSize: 11, textAnchor: "middle" },
                    }}
                  />
                  <YAxis
                    yAxisId="mpg"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    width={36}
                    domain={[0, 48]}
                    label={{
                      value: "MPG",
                      angle: 90,
                      position: "insideRight",
                      style: { fontSize: 11, textAnchor: "middle" },
                    }}
                  />
                  <Tooltip
                    wrapperStyle={rechartsFrostWrapperStyle}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0]
                        ?.payload as AvailabilityPoint & { mpgDisplay: number };
                      return (
                        <FrostRechartsTooltip active={active}>
                          <p className="font-medium">{row.season}</p>
                          <p className="text-muted-foreground">{row.teamAbbr}</p>
                          <p>{formatNumber(row.minutes, 0)} minutes</p>
                          <p>{formatNumber(row.mpg, 1)} MPG</p>
                        </FrostRechartsTooltip>
                      );
                    }}
                  />
                  <Legend />
                  <Bar
                    yAxisId="min"
                    dataKey="minutes"
                    name="Minutes"
                    fill={accent}
                    fillOpacity={0.75}
                    radius={[3, 3, 0, 0]}
                  />
                  <Line
                    yAxisId="mpg"
                    type="monotone"
                    dataKey="mpgDisplay"
                    name="MPG"
                    stroke="currentColor"
                    strokeWidth={2}
                    dot={false}
                  />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className={cn(type.caption, "text-muted-foreground")}>
        Missed games are a schedule proxy ({NBA_SCHEDULE_GAMES} − GP), not an
        injury ledger. Multi-team seasons use the TOT aggregate when present.
      </p>
    </figure>
  );
}

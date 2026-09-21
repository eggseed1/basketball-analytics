"use client";

import { useId, useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  FrostRechartsTooltip,
  rechartsFrostWrapperStyle,
} from "@/components/brand/frost-recharts-tooltip";
import { useChartTheme } from "@/lib/chart-theme";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export type AwardDynastyBar = {
  name: string;
  count: number;
  href?: string;
};

/**
 * Career / franchise accumulation for award history — who owns this award.
 */
export function AwardDynastyBars({
  title,
  unitLabel,
  bars,
  className,
}: {
  title: string;
  /** e.g. "MVPs", "selections", "titles" */
  unitLabel: string;
  bars: AwardDynastyBar[];
  className?: string;
}) {
  const chartId = useId();
  const theme = useChartTheme();
  const data = useMemo(() => bars.slice(0, 10), [bars]);

  if (data.length < 3) return null;
  const peak = data[0]?.count ?? 0;
  if (peak < 2) return null;

  return (
    <figure
      aria-labelledby={`${chartId}-title`}
      aria-describedby={`${chartId}-desc`}
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border/70 p-3 sm:p-4",
        className
      )}
    >
      <div>
        <p id={`${chartId}-title`} className={cn(type.heading)}>
          {title}
        </p>
        <p
          id={`${chartId}-desc`}
          className={cn(type.caption, "text-muted-foreground")}
        >
          Most {unitLabel} in this history list — click a bar (or tooltip name)
          when linked to open the player.
        </p>
      </div>
      <div
        className="w-full min-w-0"
        style={{ height: Math.max(200, data.length * 28 + 24) }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-border"
              horizontal={false}
              strokeOpacity={theme.gridOpacity()}
            />
            <XAxis type="number" hide domain={[0, peak]} />
            <YAxis
              type="category"
              dataKey="name"
              width={108}
              tick={{ fontSize: 11 }}
              className="fill-muted-foreground"
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: string) =>
                v.length > 14 ? `${v.slice(0, 13)}…` : v
              }
            />
            <Tooltip
              cursor={{ fill: "currentColor", fillOpacity: 0.04 }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as
                  | AwardDynastyBar
                  | undefined;
                if (!active || !row) return null;
                return (
                  <FrostRechartsTooltip active={active}>
                    {row.href ? (
                      <a
                        href={row.href}
                        className="text-[12px] font-semibold underline-offset-2 hover:underline"
                      >
                        {row.name}
                      </a>
                    ) : (
                      <p className="text-[12px] font-semibold">{row.name}</p>
                    )}
                    <p className="mt-1 text-[12px] tabular-nums">
                      {row.count} {unitLabel}
                    </p>
                  </FrostRechartsTooltip>
                );
              }}
              wrapperStyle={rechartsFrostWrapperStyle}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={18}>
              {data.map((row, i) => (
                <Cell
                  key={row.name}
                  fill={theme.semantic.info}
                  fillOpacity={1 - i * 0.06}
                  cursor={row.href ? "pointer" : undefined}
                  onClick={() => {
                    if (row.href) window.location.assign(row.href);
                  }}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

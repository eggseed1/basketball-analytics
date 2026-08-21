"use client";

import { useId } from "react";
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

import { AnalysisBoard } from "@/components/dashboard/analysis-board";
import type { HistogramBin } from "@/lib/dashboard-aggregates";
import { cn } from "@/lib/utils";
import {
  FrostRechartsTooltip,
  rechartsFrostWrapperStyle,
} from "@/components/brand/frost-recharts-tooltip";

export function HistogramBoard({
  title,
  subtitle,
  bins,
  selectedIds,
  onToggle,
}: {
  title: string;
  subtitle?: string;
  bins: HistogramBin[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const chartId = useId();
  const selected = new Set(selectedIds);
  const active = selected.size > 0;

  return (
    <AnalysisBoard
      title={title}
      subtitle={subtitle ?? "Click bars to filter · Contour-style histogram"}
      active={active}
      footer={
        active ? (
          <span>
            Keep rows in {selected.size} selected bin
            {selected.size === 1 ? "" : "s"}
          </span>
        ) : (
          <span>No bin filter</span>
        )
      }
    >
      <div className="h-[180px] w-full" aria-labelledby={`${chartId}-title`}>
        <span id={`${chartId}-title`} className="sr-only">
          {title}
        </span>
        {bins.length === 0 ? (
          <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No distribution for current selection
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={bins}
              margin={{ top: 4, right: 4, bottom: 0, left: -12 }}
            >
              <CartesianGrid
                strokeDasharray="2 2"
                vertical={false}
                className="stroke-border"
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9 }}
                interval="preserveStartEnd"
                height={28}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10 }}
                width={28}
                label={{
                  value: "Players",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 10, textAnchor: "middle" },
                }}
              />
              <Tooltip
                cursor={{ fill: "currentColor", opacity: 0.06 }}
                wrapperStyle={rechartsFrostWrapperStyle}
                content={({ active: tipActive, payload }) => {
                  if (!tipActive || !payload?.length) return null;
                  const bin = payload[0].payload as HistogramBin;
                  return (
                    <FrostRechartsTooltip active={tipActive}>
                      <p className="font-medium">{bin.label}</p>
                      <p>{bin.count} players</p>
                      <p className="text-muted-foreground">Click to filter</p>
                    </FrostRechartsTooltip>
                  );
                }}
              />
              <Bar
                dataKey="count"
                name="Players"
                radius={[1, 1, 0, 0]}
                cursor="pointer"
                onClick={(data) => {
                  const bin = data as unknown as HistogramBin;
                  if (bin?.id) onToggle(bin.id);
                }}
              >
                {bins.map((bin) => (
                  <Cell
                    key={bin.id}
                    className={cn(
                      selected.size === 0 || selected.has(bin.id)
                        ? "fill-foreground"
                        : "fill-muted-foreground/30"
                    )}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </AnalysisBoard>
  );
}

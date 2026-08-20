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
import type { CategoryBar } from "@/lib/dashboard-aggregates";
import { cn } from "@/lib/utils";
import {
  FrostRechartsTooltip,
  rechartsFrostWrapperStyle,
} from "@/components/brand/frost-recharts-tooltip";

export function CategoryBarBoard({
  title,
  subtitle,
  bars,
  selectedIds,
  onToggle,
  valueLabel,
  formatValue,
  layout = "vertical",
}: {
  title: string;
  subtitle?: string;
  bars: CategoryBar[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  valueLabel: string;
  formatValue: (value: number) => string;
  layout?: "vertical" | "horizontal";
}) {
  const chartId = useId();
  const selected = new Set(selectedIds);
  const active = selected.size > 0;
  const horizontal = layout === "horizontal";

  return (
    <AnalysisBoard
      title={title}
      subtitle={subtitle ?? "Click categories to cross-filter"}
      active={active}
      footer={
        active ? (
          <span>
            Keep {selected.size} categor{selected.size === 1 ? "y" : "ies"}
          </span>
        ) : (
          <span>No category filter</span>
        )
      }
    >
      <div
        className={cn("w-full", horizontal ? "h-[240px]" : "h-[180px]")}
        aria-labelledby={`${chartId}-title`}
      >
        <span id={`${chartId}-title`} className="sr-only">
          {title}
        </span>
        {bars.length === 0 ? (
          <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No categories for current selection
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={bars}
              layout={horizontal ? "vertical" : "horizontal"}
              margin={
                horizontal
                  ? { top: 4, right: 12, bottom: 4, left: 8 }
                  : { top: 4, right: 4, bottom: 0, left: -8 }
              }
            >
              <CartesianGrid
                strokeDasharray="2 2"
                horizontal={!horizontal}
                vertical={horizontal}
                className="stroke-border"
              />
              {horizontal ? (
                <>
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => formatValue(Number(v))}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={36}
                    tick={{ fontSize: 10 }}
                  />
                </>
              ) : (
                <>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    width={36}
                    tickFormatter={(v) => formatValue(Number(v))}
                  />
                </>
              )}
              <Tooltip
                cursor={{ fill: "currentColor", opacity: 0.06 }}
                wrapperStyle={rechartsFrostWrapperStyle}
                content={({ active: tipActive, payload }) => {
                  if (!tipActive || !payload?.length) return null;
                  const bar = payload[0].payload as CategoryBar;
                  return (
                    <FrostRechartsTooltip active={tipActive}>
                      <p className="font-medium">{bar.label}</p>
                      <p>
                        {valueLabel}: {formatValue(bar.value)}
                      </p>
                      <p className="text-muted-foreground">
                        {bar.count} players · click to filter
                      </p>
                    </FrostRechartsTooltip>
                  );
                }}
              />
              <Bar
                dataKey="value"
                name={valueLabel}
                radius={[1, 1, 0, 0]}
                cursor="pointer"
                onClick={(data) => {
                  const bar = data as unknown as CategoryBar;
                  if (bar?.id) onToggle(bar.id);
                }}
              >
                {bars.map((bar) => (
                  <Cell
                    key={bar.id}
                    className={cn(
                      selected.size === 0 || selected.has(bar.id)
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

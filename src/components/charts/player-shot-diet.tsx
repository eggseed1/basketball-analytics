"use client";

import { useId } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { ShotDietSlice } from "@/lib/player-stat-views";
import { useChartTheme } from "@/lib/chart-theme";
import { type } from "@/lib/design-system";
import { formatNumber, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  FrostRechartsTooltip,
  rechartsFrostWrapperStyle,
} from "@/components/brand/frost-recharts-tooltip";

const SLICE_LABEL: Record<string, string> = {
  "2pa": "Twos",
  "3pa": "Threes",
  fta: "Free throws",
};

/**
 * Attempt mix: twos, threes and free throws, in the player's team colors,
 * with the league's mix alongside for scale.
 */
export function PlayerShotDiet({
  slices,
  teamKey,
  season,
  leagueShares,
}: {
  slices: ShotDietSlice[];
  teamKey?: string | null;
  season?: string;
  /** League share of attempts per slice key, from the same season's player pool. */
  leagueShares?: Record<string, number> | null;
}) {
  const chartId = useId();
  const { teamPalette } = useChartTheme();
  const colors = teamPalette(teamKey, slices.length);
  const data = slices.map((s, i) => ({ ...s, value: s.attempts, fill: colors[i]! }));
  const total = slices.reduce((a, s) => a + s.attempts, 0);

  return (
    <figure
      aria-labelledby={`${chartId}-title`}
      aria-describedby={`${chartId}-desc`}
      className="flex flex-col gap-4 rounded-xl border border-border/70 frost-surface p-4 sm:p-5"
    >
      <div>
        <h2 id={`${chartId}-title`} className={type.heading}>
          Shot diet
        </h2>
        <p id={`${chartId}-desc`} className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
          Where the scoring attempts came from{season ? ` in ${season}` : ""}: twos, threes and
          free throws.
        </p>
      </div>

      {total === 0 ? (
        <p className={cn(type.bodySm, "flex h-48 items-center justify-center text-muted-foreground")}>
          No attempt data for this season.
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:items-center">
          <div className="relative mx-auto h-[200px] w-full max-w-[15rem]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="64%"
                  outerRadius="92%"
                  paddingAngle={2.5}
                  cornerRadius={4}
                  stroke="none"
                  startAngle={90}
                  endAngle={-270}
                  isAnimationActive={false}
                >
                  {data.map((slice) => (
                    <Cell key={slice.key} fill={slice.fill} />
                  ))}
                </Pie>
                <Tooltip
                  wrapperStyle={rechartsFrostWrapperStyle}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as ShotDietSlice;
                    return (
                      <FrostRechartsTooltip active={active}>
                        <p className="font-medium">{SLICE_LABEL[row.key] ?? row.label}</p>
                        <p>{formatNumber(row.attempts)} attempts</p>
                        <p>{formatPct(row.share)} of attempts</p>
                      </FrostRechartsTooltip>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold tabular-nums">{formatNumber(total, 0)}</span>
              <span className={cn(type.caption, "text-muted-foreground")}>attempts</span>
            </div>
          </div>

          <ul className="flex flex-col gap-3.5">
            {data.map((slice) => {
              const league = leagueShares?.[slice.key];
              return (
                <li key={slice.key} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={cn(type.bodySm, "inline-flex items-center gap-2 font-semibold")}>
                      <span aria-hidden className="size-2.5 rounded-full" style={{ background: slice.fill }} />
                      {SLICE_LABEL[slice.key] ?? slice.label}
                    </span>
                    <span className={cn(type.caption, "tabular-nums text-muted-foreground")}>
                      {formatNumber(slice.attempts, 0)} ·{" "}
                      <span className="font-semibold text-foreground">{formatPct(slice.share)}</span>
                    </span>
                  </div>
                  <div className="relative h-2 rounded-full bg-foreground/[0.07]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${slice.share * 100}%`, background: slice.fill }}
                    />
                    {league != null ? (
                      <span
                        className="absolute -top-1 h-4 w-0.5 rounded-full bg-foreground/70"
                        style={{ left: `calc(${league * 100}% - 1px)` }}
                        title={`League ${formatPct(league)}`}
                      />
                    ) : null}
                  </div>
                  {league != null ? (
                    <span className={cn(type.caption, "text-muted-foreground")}>
                      League {formatPct(league)}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {leagueShares ? (
        <p className={cn(type.caption, "text-muted-foreground")}>
          The tick on each bar marks the league-wide share, from season totals.
        </p>
      ) : null}
    </figure>
  );
}

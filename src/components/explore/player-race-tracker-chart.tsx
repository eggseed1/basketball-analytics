"use client";

import { memo, useMemo, useRef } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import { TeamLogo } from "@/components/brand/team-logo";
import {
  useHoverLinkTarget,
  useHoverStore,
  type HoverLink,
} from "@/components/charts/hover-layer";
import {
  chartSvg,
  linePath,
  plotBox,
  plotY,
  pointerSvgY,
  raceLineClass,
  RaceHoverLayer,
  sameRaceHover,
  type RaceHover,
} from "@/components/charts/race-hover-layer";
import type {
  PlayerRaceChartRow,
  PlayerRaceMetric,
  PlayerRacePlayer,
} from "@/lib/player-race-tracker";
import {
  formatPlayerRaceValue,
  formatPlayerRaceYTick,
  nearestPlayerRaceAtPointer,
  playerRaceAxisTitle,
  playerRaceMetricShort,
  playerRaceNeighborsAt,
  playerRaceYAxisTicks,
} from "@/lib/player-race-tracker";
import {
  chartLineStrokeOpacity,
  useChartTheme,
  type ChartLineEmphasis,
} from "@/lib/chart-theme";
import { teamLeagueChartColor } from "@/lib/nba-brand";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function gapLabel(gap: number, metric: PlayerRaceMetric) {
  const n = Math.abs(gap);
  const unit = playerRaceMetricShort(metric).toLowerCase();
  const formatted = formatPlayerRaceValue(n, metric);
  return `${formatted} ${unit}`;
}

function lastPoint(d: string): { x: number; y: number } | null {
  const nums = d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi);
  if (!nums || nums.length < 2) return null;
  return { x: Number(nums[nums.length - 2]), y: Number(nums[nums.length - 1]) };
}

/**
 * The field of lines. It only changes with the field or the selection; hover
 * is drawn by RaceHoverLayer on top, so pointer moves never touch these.
 */
const PlayerRaceLines = memo(function PlayerRaceLines({
  players,
  selectedPlayerIds,
  colors,
  isDark,
}: {
  players: PlayerRacePlayer[];
  selectedPlayerIds: Set<string>;
  colors: Map<string, string>;
  isDark: boolean;
}) {
  const hasSelection = selectedPlayerIds.size > 0;
  const dense = players.length > 48;
  const lineType = dense ? "linear" : "monotone";

  const { background, foreground } = useMemo(() => {
    const bg: PlayerRacePlayer[] = [];
    const fg: PlayerRacePlayer[] = [];
    for (const player of players) {
      if (selectedPlayerIds.has(player.playerId)) fg.push(player);
      else bg.push(player);
    }
    return { background: bg, foreground: fg };
  }, [players, selectedPlayerIds]);

  const renderLine = (player: PlayerRacePlayer, selected: boolean) => {
    const emphasis: ChartLineEmphasis = selected
      ? "selected"
      : hasSelection
        ? "muted"
        : "default";
    const baseOpacity = chartLineStrokeOpacity(emphasis, isDark);
    return (
      <Line
        key={player.playerId}
        className={raceLineClass(player.playerId)}
        yAxisId="right"
        type={lineType}
        dataKey={player.playerId}
        name={player.shortName}
        stroke={colors.get(player.playerId) ?? "#8e8e93"}
        strokeWidth={selected ? 2.75 : dense ? 0.85 : 1.15}
        strokeOpacity={dense && emphasis === "default" ? baseOpacity * 0.45 : baseOpacity}
        dot={false}
        activeDot={false}
        connectNulls
        isAnimationActive={false}
      />
    );
  };

  return (
    <>
      {background.map((player) => renderLine(player, false))}
      {foreground.map((player) => renderLine(player, true))}
    </>
  );
});

export function PlayerRaceTrackerChart({
  rows,
  players,
  selectedPlayerIds,
  onSelectPlayer,
  yDomain,
  metric,
  hoverLink,
}: {
  rows: PlayerRaceChartRow[];
  players: PlayerRacePlayer[];
  selectedPlayerIds: Set<string>;
  onSelectPlayer: (playerId: string) => void;
  yDomain: [number, number];
  metric: PlayerRaceMetric;
  /** Lets the leader list beside the chart light up a line. */
  hoverLink?: HoverLink;
}) {
  const chartTheme = useChartTheme();
  const chartRootRef = useRef<HTMLDivElement>(null);
  const hover = useHoverStore<RaceHover>(sameRaceHover);

  const playerById = useMemo(
    () => new Map(players.map((player) => [player.playerId, player])),
    [players]
  );
  const rowByLabel = useMemo(
    () => new Map(rows.map((row) => [row.label, row])),
    [rows]
  );
  const colors = useMemo(() => {
    const surface = chartTheme.isDark ? "dark" : "light";
    return new Map(
      players.map((player) => [
        player.playerId,
        teamLeagueChartColor(player.teamId, { surface }).color,
      ])
    );
  }, [chartTheme.isDark, players]);

  const ticks = useMemo(() => playerRaceYAxisTicks(yDomain), [yDomain]);
  const showZeroLine = yDomain[0] < -1e-9 && yDomain[1] > 1e-9;
  const pinnedId =
    selectedPlayerIds.size === 1 ? [...selectedPlayerIds][0]! : null;
  const lastRow = rows[rows.length - 1] ?? null;

  const hoverAt = (
    playerId: string,
    row: PlayerRaceChartRow,
    at: { x: number } | null
  ): RaceHover | null => {
    const root = chartRootRef.current;
    const svg = chartSvg(root);
    const plot = svg ? plotBox(svg) : null;
    const value = row[playerId];
    if (!root || !svg || !plot || typeof value !== "number") return null;
    const previous = hover.get();
    const d = previous?.id === playerId ? previous.d : linePath(svg, playerId);
    const end = at ? { x: at.x, y: plotY(plot, yDomain, value) } : d ? lastPoint(d) : null;
    if (!end) return null;
    const { above, below } = playerRaceNeighborsAt(players, playerId, row);
    return {
      key: `${playerId}|${row.label}`,
      id: playerId,
      label: row.label,
      x: end.x,
      y: end.y,
      width: root.clientWidth,
      height: root.clientHeight,
      color: colors.get(playerId) ?? "#8e8e93",
      d,
      plot,
      guides: [above, below]
        .filter((n) => n != null)
        .map((n) => plotY(plot, yDomain, n.value)),
    };
  };

  useHoverLinkTarget(hoverLink, {
    show(playerId) {
      const row = [...rows].reverse().find((r) => typeof r[playerId] === "number");
      hover.set(row ? hoverAt(playerId, row, null) : null);
    },
    clear: () => hover.set(null),
  });

  if (!rows.length || !players.length) {
    return (
      <div className="flex h-[min(420px,58vw)] items-center justify-center rounded-lg border border-dashed border-border/70 bg-secondary/30 px-4 text-center">
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          No regular-season game logs to chart for this window yet.
        </p>
      </div>
    );
  }

  const pinnedPlayer = pinnedId ? (playerById.get(pinnedId) ?? null) : null;
  const pinnedNeighbors = pinnedPlayer
    ? playerRaceNeighborsAt(players, pinnedPlayer.playerId, lastRow)
    : null;
  const pinnedValue = pinnedPlayer ? lastRow?.[pinnedPlayer.playerId] : null;

  return (
    <div className="relative flex h-full min-h-[280px] w-full flex-col">
      <div
        ref={chartRootRef}
        className="relative h-[min(460px,70vw)] min-h-[280px] w-full sm:h-[min(400px,54vw)] sm:min-h-[260px]"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            margin={{ top: 12, right: 12, bottom: 8, left: 8 }}
            style={{ cursor: "pointer" }}
            onMouseMove={(state, event) => {
              const row =
                state.activeLabel != null
                  ? rowByLabel.get(String(state.activeLabel))
                  : undefined;
              const svg = chartSvg(chartRootRef.current);
              const plot = svg ? plotBox(svg) : null;
              const x = state.activeCoordinate?.x;
              const pointerY =
                svg && plot ? pointerSvgY(svg, event.clientX, event.clientY) : null;
              if (!row || !plot || x == null || pointerY == null) {
                hover.set(null);
                return;
              }
              const playerId = nearestPlayerRaceAtPointer(players, row, pointerY, yDomain, plot);
              hover.set(playerId ? hoverAt(playerId, row, { x }) : null);
            }}
            onClick={() => {
              const current = hover.get();
              if (current) onSelectPlayer(current.id);
            }}
            onMouseLeave={() => hover.set(null)}
          >
            <CartesianGrid
              strokeDasharray="3 6"
              vertical={players.length <= 48}
              className="stroke-border/50"
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              minTickGap={28}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={yDomain}
              ticks={ticks}
              interval={0}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              width={52}
              tickFormatter={formatPlayerRaceYTick}
              label={{
                value: playerRaceAxisTitle(metric),
                angle: 90,
                position: "insideRight",
                offset: 8,
                style: {
                  fill: "var(--muted-foreground)",
                  fontSize: 10,
                  fontWeight: 600,
                },
              }}
            />
            {showZeroLine ? (
              <ReferenceLine
                yAxisId="right"
                y={0}
                stroke="var(--muted-foreground)"
                strokeOpacity={0.55}
                strokeDasharray="4 4"
              />
            ) : null}
            <PlayerRaceLines
              players={players}
              selectedPlayerIds={selectedPlayerIds}
              colors={colors}
              isDark={chartTheme.isDark}
            />
          </LineChart>
        </ResponsiveContainer>
        <RaceHoverLayer
          store={hover}
          render={(h) => {
            const player = playerById.get(h.id);
            const row = rowByLabel.get(h.label);
            const value = row?.[h.id];
            if (!player || typeof value !== "number") return null;
            const { above, below } = playerRaceNeighborsAt(players, h.id, row);
            return (
              <>
                <p className="flex items-center gap-1.5">
                  <TeamLogo teamKey={player.teamId} size="xs" />
                  {player.displayName}
                </p>
                <p className="tabular-nums">
                  {h.label} ·{" "}
                  <span className="font-semibold">{formatPlayerRaceValue(value, metric)}</span>
                </p>
                <p className="text-muted-foreground">
                  {above
                    ? `${above.shortName} ${gapLabel(above.gap, metric)} ahead`
                    : "Top of this board"}
                  {below ? ` · ${below.shortName} ${gapLabel(below.gap, metric)} behind` : ""}
                </p>
                <p className="text-muted-foreground">
                  Click to {selectedPlayerIds.has(h.id) ? "unpin" : "pin"}
                </p>
              </>
            );
          }}
        />
      </div>

      <div
        className="mt-2 flex min-h-[2.375rem] flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-md border border-transparent px-3 py-2 data-[pinned]:border-border/60 data-[pinned]:bg-background/70"
        data-pinned={pinnedPlayer ? "" : undefined}
        aria-live="polite"
      >
        {pinnedPlayer ? (
          <>
            {pinnedNeighbors?.above ? (
              <span className={cn(type.caption, "inline-flex items-center gap-1.5")}>
                <span className="font-semibold">{pinnedNeighbors.above.shortName}</span>
                <span className="text-muted-foreground">
                  {gapLabel(pinnedNeighbors.above.gap, metric)} ahead
                </span>
              </span>
            ) : (
              <span className={cn(type.caption, "text-muted-foreground")}>No one ahead</span>
            )}
            <span className={cn(type.caption, "font-bold text-foreground")}>
              · {pinnedPlayer.displayName}{" "}
              {formatPlayerRaceValue(
                typeof pinnedValue === "number" ? pinnedValue : pinnedPlayer.currentValue,
                metric
              )}{" "}
              ·
            </span>
            {pinnedNeighbors?.below ? (
              <span className={cn(type.caption, "inline-flex items-center gap-1.5")}>
                <span className="font-semibold">{pinnedNeighbors.below.shortName}</span>
                <span className="text-muted-foreground">
                  {gapLabel(pinnedNeighbors.below.gap, metric)} behind
                </span>
              </span>
            ) : (
              <span className={cn(type.caption, "text-muted-foreground")}>No one behind</span>
            )}
          </>
        ) : (
          <p className={cn(type.caption, "text-center text-muted-foreground")}>
            Move along the chart to snap to the nearest player line, then click to pin.
          </p>
        )}
      </div>
    </div>
  );
}

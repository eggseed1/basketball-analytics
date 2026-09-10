"use client";

import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  FrostRechartsTooltip,
  rechartsFrostWrapperStyle,
} from "@/components/brand/frost-recharts-tooltip";
import { TeamLogo } from "@/components/brand/team-logo";
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
import { teamChartColor } from "@/lib/nba-brand";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

type RechartsPointerState = {
  activeLabel?: string | number;
};

type HoverSnapshot = {
  playerId: string | null;
  row: PlayerRaceChartRow | null;
};

type PlotCache = {
  top: number;
  height: number;
};

function svgPlotArea(svg: Element): PlotCache | null {
  const rect = svg.querySelector("clipPath rect");
  if (!rect) return null;
  const top = Number(rect.getAttribute("y"));
  const height = Number(rect.getAttribute("height"));
  if (!Number.isFinite(top) || !Number.isFinite(height) || height <= 0) {
    return null;
  }
  return { top, height };
}

function pointerSvgY(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number
): number | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(ctm.inverse()).y;
}

function resolveHoverFromPointer(
  root: HTMLElement | null,
  state: RechartsPointerState,
  rowByLabel: Map<string, PlayerRaceChartRow>,
  players: PlayerRacePlayer[],
  yDomain: [number, number],
  clientX: number,
  clientY: number,
  plotCache: MutableRefObject<PlotCache | null>
): HoverSnapshot {
  const svg = root?.querySelector("svg.recharts-surface");
  if (!(svg instanceof SVGSVGElement)) return { playerId: null, row: null };

  const row =
    state.activeLabel != null
      ? (rowByLabel.get(String(state.activeLabel)) ?? null)
      : null;
  if (!row) return { playerId: null, row: null };

  let plot = plotCache.current;
  if (!plot) {
    plot = svgPlotArea(svg);
    plotCache.current = plot;
  }
  const pointerY = pointerSvgY(svg, clientX, clientY);
  if (!plot || pointerY == null) return { playerId: null, row };

  return {
    playerId: nearestPlayerRaceAtPointer(
      players,
      row,
      pointerY,
      yDomain,
      plot
    ),
    row,
  };
}

function gapLabel(gap: number, metric: PlayerRaceMetric) {
  const n = Math.abs(gap);
  const unit = playerRaceMetricShort(metric).toLowerCase();
  const formatted = formatPlayerRaceValue(n, metric);
  return `${formatted} ${unit}`;
}

/**
 * Stable line layer — selection can remount strokes. Hover id only updates
 * when the nearest player changes (not every date tick), so paths stay calm.
 */
const PlayerRaceLines = memo(function PlayerRaceLines({
  players,
  selectedPlayerIds,
  hoveredPlayerId,
  isDark,
  onSelectPlayer,
}: {
  players: PlayerRacePlayer[];
  selectedPlayerIds: Set<string>;
  hoveredPlayerId: string | null;
  isDark: boolean;
  onSelectPlayer: (playerId: string) => void;
}) {
  const hasSelection = selectedPlayerIds.size > 0;
  const hasHover = hoveredPlayerId != null;
  const dense = players.length > 80;
  const surface = isDark ? "dark" : "light";
  const colors = useMemo(() => {
    const map = new Map<string, string>();
    for (const player of players) {
      map.set(
        player.playerId,
        teamChartColor(player.teamId, { surface }).color
      );
    }
    return map;
  }, [players, surface]);

  return (
    <>
      {players.map((player) => {
        const selected = selectedPlayerIds.has(player.playerId);
        const hovered = hoveredPlayerId === player.playerId;
        const color = colors.get(player.playerId) ?? "#8e8e93";
        const muted =
          (hasSelection && !selected && !hovered) ||
          (hasHover && !hovered && !selected);
        const emphasis: ChartLineEmphasis = muted
          ? "muted"
          : hovered
            ? "focus"
            : selected
              ? "selected"
              : "default";
        const baseOpacity = chartLineStrokeOpacity(emphasis, isDark);
        const strokeOpacity =
          dense && emphasis === "default" ? baseOpacity * 0.55 : baseOpacity;
        return (
          <Line
            key={player.playerId}
            yAxisId="right"
            type="monotone"
            dataKey={player.playerId}
            name={player.shortName}
            stroke={color}
            strokeWidth={
              hovered ? 2.75 : selected ? 2.25 : dense ? 0.9 : 1.15
            }
            strokeOpacity={strokeOpacity}
            dot={false}
            activeDot={false}
            connectNulls
            isAnimationActive={false}
            onClick={() => onSelectPlayer(player.playerId)}
            style={{ cursor: "pointer" }}
          />
        );
      })}
      {hoveredPlayerId ? (
        <Line
          key={`hover-top-${hoveredPlayerId}`}
          yAxisId="right"
          type="monotone"
          dataKey={hoveredPlayerId}
          stroke={colors.get(hoveredPlayerId) ?? "#8e8e93"}
          strokeWidth={3}
          strokeOpacity={chartLineStrokeOpacity("focus", isDark)}
          dot={false}
          activeDot={false}
          connectNulls
          isAnimationActive={false}
          legendType="none"
          style={{ pointerEvents: "none" }}
        />
      ) : null}
    </>
  );
});

const RaceHoverTooltip = memo(function RaceHoverTooltip({
  active,
  label,
  rowByLabel,
  playerById,
  players,
  selectedPlayerIds,
  hoverRef,
  metric,
  onSelectPlayer,
}: {
  active?: boolean;
  label?: string | number;
  rowByLabel: Map<string, PlayerRaceChartRow>;
  playerById: Map<string, PlayerRacePlayer>;
  players: PlayerRacePlayer[];
  selectedPlayerIds: Set<string>;
  hoverRef: MutableRefObject<HoverSnapshot>;
  metric: PlayerRaceMetric;
  onSelectPlayer: (playerId: string) => void;
}) {
  if (!active) return null;

  const row =
    (label != null ? rowByLabel.get(String(label)) : null) ??
    hoverRef.current.row;
  const focusId =
    hoverRef.current.playerId ??
    (selectedPlayerIds.size === 1 ? [...selectedPlayerIds][0]! : null);
  const focusPlayer = focusId ? (playerById.get(focusId) ?? null) : null;
  const focusValue =
    focusPlayer && row ? row[focusPlayer.playerId] : null;
  const neighbors = focusPlayer
    ? playerRaceNeighborsAt(players, focusPlayer.playerId, row)
    : null;

  return (
    <FrostRechartsTooltip active={active}>
      <p className={cn(type.caption, "font-semibold")}>
        {String(label ?? "")}
      </p>
      {focusPlayer && typeof focusValue === "number" ? (
        <div className="mt-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <TeamLogo teamKey={focusPlayer.teamId} size="xs" />
              <span>{focusPlayer.displayName}</span>
            </span>
            <span className="tabular-nums font-bold">
              {formatPlayerRaceValue(focusValue, metric)}
            </span>
          </div>
          {neighbors?.above ? (
            <p className={cn(type.caption, "mt-1 text-muted-foreground")}>
              {neighbors.above.shortName} is{" "}
              <span className="font-semibold text-foreground">
                {gapLabel(neighbors.above.gap, metric)} ahead
              </span>
            </p>
          ) : (
            <p className={cn(type.caption, "mt-1 text-muted-foreground")}>
              Top of this board
            </p>
          )}
          {neighbors?.below ? (
            <p className={cn(type.caption, "text-muted-foreground")}>
              {neighbors.below.shortName} is{" "}
              <span className="font-semibold text-foreground">
                {gapLabel(neighbors.below.gap, metric)} behind
              </span>
            </p>
          ) : null}
          <button
            type="button"
            className={cn(type.caption, "mt-2 font-semibold underline")}
            onClick={() => {
              if (focusId) onSelectPlayer(focusId);
            }}
          >
            Pin this player
          </button>
        </div>
      ) : (
        <p className={cn(type.caption, "mt-1.5 text-muted-foreground")}>
          Snap to a line to inspect
        </p>
      )}
    </FrostRechartsTooltip>
  );
});

const RaceHoverStrip = memo(function RaceHoverStrip({
  focusPlayerId,
  focusRow,
  players,
  playerById,
  rows,
  metric,
}: {
  focusPlayerId: string | null;
  focusRow: PlayerRaceChartRow | null;
  players: PlayerRacePlayer[];
  playerById: Map<string, PlayerRacePlayer>;
  rows: PlayerRaceChartRow[];
  metric: PlayerRaceMetric;
}) {
  const player = focusPlayerId
    ? (playerById.get(focusPlayerId) ?? null)
    : null;
  const row = focusRow ?? rows[rows.length - 1] ?? null;
  const neighbors = focusPlayerId
    ? playerRaceNeighborsAt(players, focusPlayerId, row)
    : null;

  if (!player) {
    return (
      <p
        className={cn(
          type.caption,
          "mt-2 text-center text-muted-foreground"
        )}
      >
        Move along the chart to snap to the nearest player line — click to pin.
      </p>
    );
  }

  const value = row?.[player.playerId];

  return (
    <div
      className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-md border border-border/60 bg-background/70 px-3 py-2"
      aria-live="polite"
    >
      {neighbors?.above ? (
        <span className={cn(type.caption, "inline-flex items-center gap-1.5")}>
          <span className="font-semibold">{neighbors.above.shortName}</span>
          <span className="text-muted-foreground">
            {gapLabel(neighbors.above.gap, metric)} ahead
          </span>
        </span>
      ) : (
        <span className={cn(type.caption, "text-muted-foreground")}>
          No one ahead
        </span>
      )}
      <span className={cn(type.caption, "font-bold text-foreground")}>
        · {player.displayName}{" "}
        {typeof value === "number"
          ? formatPlayerRaceValue(value, metric)
          : formatPlayerRaceValue(player.currentValue, metric)}{" "}
        ·
      </span>
      {neighbors?.below ? (
        <span className={cn(type.caption, "inline-flex items-center gap-1.5")}>
          <span className="font-semibold">{neighbors.below.shortName}</span>
          <span className="text-muted-foreground">
            {gapLabel(neighbors.below.gap, metric)} behind
          </span>
        </span>
      ) : (
        <span className={cn(type.caption, "text-muted-foreground")}>
          No one behind
        </span>
      )}
    </div>
  );
});

export function PlayerRaceTrackerChart({
  rows,
  players,
  selectedPlayerIds,
  onSelectPlayer,
  yDomain,
  metric,
}: {
  rows: PlayerRaceChartRow[];
  players: PlayerRacePlayer[];
  selectedPlayerIds: Set<string>;
  onSelectPlayer: (playerId: string) => void;
  yDomain: [number, number];
  metric: PlayerRaceMetric;
}) {
  const chartTheme = useChartTheme();
  /** Footer strip only — never feeds Recharts children on every date tick. */
  const [stripHover, setStripHover] = useState<HoverSnapshot>({
    playerId: null,
    row: null,
  });
  /** Nearest player under the pointer — updates only when that id changes. */
  const [hoveredPlayerId, setHoveredPlayerId] = useState<string | null>(null);
  const chartRootRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<HoverSnapshot>({ playerId: null, row: null });
  const plotCacheRef = useRef<PlotCache | null>(null);
  const hoverRafRef = useRef<number | null>(null);
  const lastHoverKeyRef = useRef<string>("");
  const lastHoverPlayerRef = useRef<string | null>(null);

  const playerById = useMemo(
    () => new Map(players.map((player) => [player.playerId, player])),
    [players]
  );

  const rowByLabel = useMemo(() => {
    const map = new Map<string, PlayerRaceChartRow>();
    for (const row of rows) map.set(row.label, row);
    return map;
  }, [rows]);

  const ticks = useMemo(() => playerRaceYAxisTicks(yDomain), [yDomain]);
  const showZeroLine = yDomain[0] < -1e-9 && yDomain[1] > 1e-9;

  const stripFocusId =
    stripHover.playerId ??
    (selectedPlayerIds.size === 1 ? [...selectedPlayerIds][0]! : null);

  useEffect(() => {
    plotCacheRef.current = null;
  }, [rows, players, yDomain]);

  useEffect(() => {
    return () => {
      if (hoverRafRef.current != null) {
        cancelAnimationFrame(hoverRafRef.current);
      }
    };
  }, []);

  const scheduleStripHover = (next: HoverSnapshot) => {
    hoverRef.current = next;
    const key = `${next.playerId ?? ""}|${next.row?.label ?? ""}`;
    if (key === lastHoverKeyRef.current) return;
    lastHoverKeyRef.current = key;
    if (hoverRafRef.current != null) cancelAnimationFrame(hoverRafRef.current);
    hoverRafRef.current = requestAnimationFrame(() => {
      setStripHover(next);
      if (next.playerId !== lastHoverPlayerRef.current) {
        lastHoverPlayerRef.current = next.playerId;
        setHoveredPlayerId(next.playerId);
      }
    });
  };

  const clearHover = () => {
    if (hoverRafRef.current != null) {
      cancelAnimationFrame(hoverRafRef.current);
      hoverRafRef.current = null;
    }
    lastHoverKeyRef.current = "";
    lastHoverPlayerRef.current = null;
    hoverRef.current = { playerId: null, row: null };
    setStripHover({ playerId: null, row: null });
    setHoveredPlayerId(null);
  };

  if (!rows.length || !players.length) {
    return (
      <div className="flex h-[min(420px,58vw)] items-center justify-center rounded-lg border border-dashed border-border/70 bg-secondary/30 px-4 text-center">
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          No regular-season game logs to chart for this window yet.
        </p>
      </div>
    );
  }

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
            onMouseMove={(state, reactEvent) => {
              const next = resolveHoverFromPointer(
                chartRootRef.current,
                state,
                rowByLabel,
                players,
                yDomain,
                reactEvent.clientX,
                reactEvent.clientY,
                plotCacheRef
              );
              scheduleStripHover(next);
            }}
            onClick={(state, reactEvent) => {
              const { playerId } = resolveHoverFromPointer(
                chartRootRef.current,
                state,
                rowByLabel,
                players,
                yDomain,
                reactEvent.clientX,
                reactEvent.clientY,
                plotCacheRef
              );
              if (playerId) onSelectPlayer(playerId);
            }}
            onMouseLeave={clearHover}
          >
            <CartesianGrid
              strokeDasharray="3 6"
              vertical
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
            <Tooltip
              cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }}
              isAnimationActive={false}
              animationDuration={0}
              wrapperStyle={rechartsFrostWrapperStyle}
              content={(props) => (
                <RaceHoverTooltip
                  active={props.active}
                  label={props.label}
                  rowByLabel={rowByLabel}
                  playerById={playerById}
                  players={players}
                  selectedPlayerIds={selectedPlayerIds}
                  hoverRef={hoverRef}
                  metric={metric}
                  onSelectPlayer={onSelectPlayer}
                />
              )}
            />
            <PlayerRaceLines
              players={players}
              selectedPlayerIds={selectedPlayerIds}
              hoveredPlayerId={hoveredPlayerId}
              isDark={chartTheme.isDark}
              onSelectPlayer={onSelectPlayer}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <RaceHoverStrip
        focusPlayerId={stripFocusId}
        focusRow={stripHover.row}
        players={players}
        playerById={playerById}
        rows={rows}
        metric={metric}
      />
    </div>
  );
}

"use client";

import { useMemo, useRef, useState } from "react";
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
  StandingsTrackerChartRow,
  StandingsTrackerTeam,
} from "@/lib/standings-tracker";
import {
  formatTrackerYTick,
  nearestTrackerTeamAtPointer,
  standingsNeighborsAt,
  trackerYAxisTicks,
} from "@/lib/standings-tracker";
import { useChartTheme } from "@/lib/chart-theme";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function diffLabel(diff: number) {
  return diff > 0 ? `+${diff}` : `${diff}`;
}

function gapGamesLabel(gap: number) {
  const n = Math.abs(gap);
  return n === 1 ? "1 game" : `${n} games`;
}

type RechartsPointerState = {
  activeLabel?: string | number;
};

function svgPlotArea(svg: Element): { top: number; height: number } | null {
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
  rows: StandingsTrackerChartRow[],
  teams: StandingsTrackerTeam[],
  yDomain: [number, number],
  clientX: number,
  clientY: number
): { teamId: string | null; row: StandingsTrackerChartRow | null } {
  const svg = root?.querySelector("svg.recharts-surface");
  if (!(svg instanceof SVGSVGElement)) return { teamId: null, row: null };

  const row = state.activeLabel != null
    ? rows.find((item) => item.label === String(state.activeLabel)) ?? null
    : null;
  if (!row) return { teamId: null, row: null };

  const plot = svgPlotArea(svg);
  const pointerY = pointerSvgY(svg, clientX, clientY);
  if (!plot || pointerY == null) return { teamId: null, row };

  return {
    teamId: nearestTrackerTeamAtPointer(teams, row, pointerY, yDomain, plot),
    row,
  };
}

export function StandingsTrackerChart({
  rows,
  teams,
  selectedTeamIds,
  onSelectTeam,
  yDomain,
}: {
  rows: StandingsTrackerChartRow[];
  teams: StandingsTrackerTeam[];
  selectedTeamIds: Set<string>;
  onSelectTeam: (teamId: string) => void;
  yDomain: [number, number];
}) {
  const chartTheme = useChartTheme();
  const [hoverTeamId, setHoverTeamId] = useState<string | null>(null);
  const [hoverRow, setHoverRow] = useState<StandingsTrackerChartRow | null>(
    null
  );
  const chartRootRef = useRef<HTMLDivElement>(null);

  const teamById = useMemo(
    () => new Map(teams.map((team) => [team.teamId, team])),
    [teams]
  );

  const ticks = useMemo(() => trackerYAxisTicks(yDomain), [yDomain]);
  const hasSelection = selectedTeamIds.size > 0;
  const focusTeamId =
    hoverTeamId ??
    (selectedTeamIds.size === 1 ? [...selectedTeamIds][0]! : null);

  const focusNeighbors = useMemo(() => {
    if (!focusTeamId) return null;
    const row = hoverRow ?? rows[rows.length - 1] ?? null;
    return {
      team: teamById.get(focusTeamId) ?? null,
      row,
      ...standingsNeighborsAt(teams, focusTeamId, row),
    };
  }, [focusTeamId, hoverRow, rows, teamById, teams]);

  if (!rows.length || !teams.length) {
    return (
      <div className="flex h-[min(420px,58vw)] items-center justify-center rounded-lg border border-dashed border-border/70 bg-secondary/30 px-4 text-center">
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          No regular-season results to chart for this window yet.
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-[280px] w-full flex-col">
      <div
        ref={chartRootRef}
        className="relative h-[min(400px,54vw)] min-h-[260px] w-full"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            margin={{ top: 12, right: 12, bottom: 8, left: 8 }}
            onMouseMove={(state, reactEvent) => {
              const { teamId, row } = resolveHoverFromPointer(
                chartRootRef.current,
                state,
                rows,
                teams,
                yDomain,
                reactEvent.clientX,
                reactEvent.clientY
              );
              setHoverTeamId(teamId);
              setHoverRow(row);
            }}
            onClick={(state, reactEvent) => {
              const { teamId } = resolveHoverFromPointer(
                chartRootRef.current,
                state,
                rows,
                teams,
                yDomain,
                reactEvent.clientX,
                reactEvent.clientY
              );
              if (teamId) onSelectTeam(teamId);
            }}
            onMouseLeave={() => {
              setHoverTeamId(null);
              setHoverRow(null);
            }}
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
              width={44}
              tickFormatter={formatTrackerYTick}
              label={{
                value: "Games above .500",
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
            <ReferenceLine
              yAxisId="right"
              y={0}
              stroke="var(--foreground)"
              strokeOpacity={chartTheme.referenceOpacity()}
              strokeDasharray="4 4"
              label={{
                value: ".500",
                position: "insideTopLeft",
                fill: "var(--muted-foreground)",
                fontSize: 10,
              }}
            />
            {/* Neighbor reference marks for the focused team */}
            {focusNeighbors?.above ? (
              <ReferenceLine
                yAxisId="right"
                y={focusNeighbors.above.diff}
                stroke="var(--muted-foreground)"
                strokeOpacity={chartTheme.referenceOpacity()}
                strokeDasharray="2 4"
              />
            ) : null}
            {focusNeighbors?.below ? (
              <ReferenceLine
                yAxisId="right"
                y={focusNeighbors.below.diff}
                stroke="var(--muted-foreground)"
                strokeOpacity={chartTheme.referenceOpacity()}
                strokeDasharray="2 4"
              />
            ) : null}
            <Tooltip
              wrapperStyle={rechartsFrostWrapperStyle}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const entries = payload
                  .filter((item) => typeof item.value === "number")
                  .sort(
                    (a, b) => Number(b.value ?? 0) - Number(a.value ?? 0)
                  );
                const focusId =
                  hoverTeamId ??
                  (hasSelection
                    ? entries.find((item) =>
                        selectedTeamIds.has(String(item.dataKey))
                      )?.dataKey
                    : entries[0]?.dataKey);
                const focusEntry = entries.find(
                  (item) => String(item.dataKey) === String(focusId)
                );
                const focusTeam = focusEntry
                  ? teamById.get(String(focusEntry.dataKey))
                  : null;
                const row =
                  rows.find((item) => item.label === label) ?? null;
                const neighbors = focusTeam
                  ? standingsNeighborsAt(teams, focusTeam.teamId, row)
                  : null;

                return (
                  <FrostRechartsTooltip active={active}>
                    <p className={cn(type.caption, "font-semibold")}>{label}</p>
                    {focusTeam && typeof focusEntry?.value === "number" ? (
                      <div className="mt-1.5 border-b border-border/60 pb-1.5">
                        <div className="flex items-center justify-between gap-3">
                          <span className="inline-flex items-center gap-1.5 font-semibold">
                            <TeamLogo teamKey={focusTeam.teamId} size="xs" />
                            <span>{focusTeam.displayName}</span>
                            <span className="text-muted-foreground">
                              {focusTeam.abbreviation}
                            </span>
                          </span>
                          <span className="tabular-nums font-bold">
                            {diffLabel(Number(focusEntry.value))}
                          </span>
                        </div>
                        {neighbors?.above ? (
                          <p className={cn(type.caption, "mt-1 text-muted-foreground")}>
                            {neighbors.above.abbreviation} is{" "}
                            <span className="font-semibold text-foreground">
                              {gapGamesLabel(neighbors.above.gap)} ahead
                            </span>
                          </p>
                        ) : (
                          <p className={cn(type.caption, "mt-1 text-muted-foreground")}>
                            Top of this board
                          </p>
                        )}
                        {neighbors?.below ? (
                          <p className={cn(type.caption, "text-muted-foreground")}>
                            {neighbors.below.abbreviation} is{" "}
                            <span className="font-semibold text-foreground">
                              {gapGamesLabel(neighbors.below.gap)} behind
                            </span>
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    <ul className="mt-1.5 flex flex-col gap-1">
                      {entries.slice(0, 5).map((item) => {
                        const team = teamById.get(String(item.dataKey));
                        if (!team) return null;
                        const isFocus = team.teamId === String(focusId);
                        return (
                          <li
                            key={team.teamId}
                            className={cn(
                              "flex items-center justify-between gap-3",
                              isFocus && "font-semibold"
                            )}
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <TeamLogo teamKey={team.teamId} size="xs" />
                              {team.abbreviation}
                            </span>
                            <span className="tabular-nums">
                              {diffLabel(Number(item.value))}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    <button
                      type="button"
                      className={cn(
                        type.caption,
                        "mt-2 font-semibold underline"
                      )}
                      onClick={() => {
                        if (focusId) onSelectTeam(String(focusId));
                      }}
                    >
                      Pin this team
                    </button>
                  </FrostRechartsTooltip>
                );
              }}
            />
            {teams.map((team) => {
              const selected = selectedTeamIds.has(team.teamId);
              const { color } = chartTheme.teamColor(team.teamId);
              const muted = hasSelection && !selected;
              const isFocus = focusTeamId === team.teamId;
              const emphasis = muted
                ? "muted"
                : isFocus
                  ? "focus"
                  : selected
                    ? "selected"
                    : "default";
              return (
                <Line
                  key={team.teamId}
                  yAxisId="right"
                  type="monotone"
                  dataKey={team.teamId}
                  name={team.abbreviation}
                  stroke={color}
                  strokeWidth={isFocus ? 2.75 : selected ? 2.25 : 1.2}
                  strokeOpacity={chartTheme.lineOpacity(emphasis)}
                  dot={false}
                  activeDot={
                    isFocus
                      ? {
                          r: 5,
                          strokeWidth: 2,
                          stroke: "var(--background)",
                          fill: color,
                        }
                      : false
                  }
                  connectNulls
                  isAnimationActive={false}
                  onClick={() => onSelectTeam(team.teamId)}
                  style={{ cursor: "pointer" }}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {focusNeighbors?.team ? (
        <div
          className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-md border border-border/60 bg-background/70 px-3 py-2"
          aria-live="polite"
        >
          {focusNeighbors.above ? (
            <span className={cn(type.caption, "inline-flex items-center gap-1.5")}>
              <TeamLogo teamKey={focusNeighbors.above.teamId} size="xs" />
              <span className="font-semibold">
                {focusNeighbors.above.abbreviation}
              </span>
              <span className="text-muted-foreground">
                {gapGamesLabel(focusNeighbors.above.gap)} ahead
              </span>
              <span className="tabular-nums text-muted-foreground">
                ({diffLabel(focusNeighbors.above.diff)})
              </span>
            </span>
          ) : (
            <span className={cn(type.caption, "text-muted-foreground")}>
              No one ahead
            </span>
          )}
          <span className={cn(type.caption, "font-bold text-foreground")}>
            · {focusNeighbors.team.displayName}{" "}
            <span className="text-muted-foreground">
              ({focusNeighbors.team.abbreviation})
            </span>{" "}
            {typeof (focusNeighbors.row?.[focusNeighbors.team.teamId]) ===
            "number"
              ? diffLabel(
                  Number(focusNeighbors.row[focusNeighbors.team.teamId])
                )
              : diffLabel(focusNeighbors.team.currentDiff)}{" "}
            ·
          </span>
          {focusNeighbors.below ? (
            <span className={cn(type.caption, "inline-flex items-center gap-1.5")}>
              <TeamLogo teamKey={focusNeighbors.below.teamId} size="xs" />
              <span className="font-semibold">
                {focusNeighbors.below.abbreviation}
              </span>
              <span className="text-muted-foreground">
                {gapGamesLabel(focusNeighbors.below.gap)} behind
              </span>
              <span className="tabular-nums text-muted-foreground">
                ({diffLabel(focusNeighbors.below.diff)})
              </span>
            </span>
          ) : (
            <span className={cn(type.caption, "text-muted-foreground")}>
              No one behind
            </span>
          )}
        </div>
      ) : (
        <p className={cn(type.caption, "mt-2 text-center text-muted-foreground")}>
          Move along the chart to snap to the nearest team line — click to pin.
        </p>
      )}
    </div>
  );
}

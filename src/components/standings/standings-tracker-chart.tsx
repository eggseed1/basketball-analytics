"use client";

import { useMemo, useRef } from "react";
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

function lastPoint(d: string): { x: number; y: number } | null {
  const nums = d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi);
  if (!nums || nums.length < 2) return null;
  return { x: Number(nums[nums.length - 2]), y: Number(nums[nums.length - 1]) };
}

export function StandingsTrackerChart({
  rows,
  teams,
  selectedTeamIds,
  onSelectTeam,
  yDomain,
  hoverLink,
}: {
  rows: StandingsTrackerChartRow[];
  teams: StandingsTrackerTeam[];
  selectedTeamIds: Set<string>;
  onSelectTeam: (teamId: string) => void;
  yDomain: [number, number];
  /** Lets a team list beside the chart light up a line. */
  hoverLink?: HoverLink;
}) {
  const chartTheme = useChartTheme();
  const chartRootRef = useRef<HTMLDivElement>(null);
  const hover = useHoverStore<RaceHover>(sameRaceHover);

  const teamById = useMemo(
    () => new Map(teams.map((team) => [team.teamId, team])),
    [teams]
  );
  const rowByLabel = useMemo(
    () => new Map(rows.map((row) => [row.label, row])),
    [rows]
  );

  const ticks = useMemo(() => trackerYAxisTicks(yDomain), [yDomain]);
  const hasSelection = selectedTeamIds.size > 0;
  const pinnedId =
    selectedTeamIds.size === 1 ? [...selectedTeamIds][0]! : null;
  const lastRow = rows[rows.length - 1] ?? null;

  const pinned = useMemo(() => {
    if (!pinnedId) return null;
    return {
      team: teamById.get(pinnedId) ?? null,
      ...standingsNeighborsAt(teams, pinnedId, lastRow),
    };
  }, [lastRow, pinnedId, teamById, teams]);

  const hoverAt = (
    teamId: string,
    row: StandingsTrackerChartRow,
    at: { x: number; y?: number } | null
  ): RaceHover | null => {
    const root = chartRootRef.current;
    const svg = chartSvg(root);
    const plot = svg ? plotBox(svg) : null;
    const value = row[teamId];
    if (!root || !svg || !plot || typeof value !== "number") return null;
    const previous = hover.get();
    const d = previous?.id === teamId ? previous.d : linePath(svg, teamId);
    const end = at ?? (d ? lastPoint(d) : null);
    if (!end) return null;
    const { above, below } = standingsNeighborsAt(teams, teamId, row);
    return {
      key: `${teamId}|${row.label}`,
      id: teamId,
      label: row.label,
      x: end.x,
      y: end.y ?? plotY(plot, yDomain, value),
      width: root.clientWidth,
      height: root.clientHeight,
      color: chartTheme.leagueTeamColor(teamId).color,
      d,
      plot,
      guides: [above, below]
        .filter((n) => n != null)
        .map((n) => plotY(plot, yDomain, n.diff)),
    };
  };

  useHoverLinkTarget(hoverLink, {
    show(teamId) {
      const row = [...rows].reverse().find((r) => typeof r[teamId] === "number");
      hover.set(row ? hoverAt(teamId, row, null) : null);
    },
    clear: () => hover.set(null),
  });

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
        className={cn("relative h-[min(400px,54vw)] min-h-[260px] w-full")}
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
              const teamId = nearestTrackerTeamAtPointer(teams, row, pointerY, yDomain, plot);
              hover.set(teamId ? hoverAt(teamId, row, { x }) : null);
            }}
            onClick={() => {
              const current = hover.get();
              if (current) onSelectTeam(current.id);
            }}
            onMouseLeave={() => hover.set(null)}
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
              width={54}
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
            {pinned?.above ? (
              <ReferenceLine
                yAxisId="right"
                y={pinned.above.diff}
                stroke="var(--muted-foreground)"
                strokeOpacity={chartTheme.referenceOpacity()}
                strokeDasharray="2 4"
              />
            ) : null}
            {pinned?.below ? (
              <ReferenceLine
                yAxisId="right"
                y={pinned.below.diff}
                stroke="var(--muted-foreground)"
                strokeOpacity={chartTheme.referenceOpacity()}
                strokeDasharray="2 4"
              />
            ) : null}
            {teams.map((team) => {
              const selected = selectedTeamIds.has(team.teamId);
              const { color } = chartTheme.leagueTeamColor(team.teamId);
              return (
                <Line
                  key={team.teamId}
                  className={raceLineClass(team.teamId)}
                  yAxisId="right"
                  type="monotone"
                  dataKey={team.teamId}
                  name={team.abbreviation}
                  stroke={color}
                  strokeWidth={selected ? 2.25 : 1.2}
                  strokeOpacity={chartTheme.lineOpacity(
                    hasSelection && !selected ? "muted" : selected ? "selected" : "default"
                  )}
                  dot={false}
                  activeDot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
        <RaceHoverLayer
          store={hover}
          render={(h) => {
            const team = teamById.get(h.id);
            const row = rowByLabel.get(h.label);
            const value = row?.[h.id];
            if (!team || typeof value !== "number") return null;
            const { above, below } = standingsNeighborsAt(teams, h.id, row);
            return (
              <>
                <p className="flex items-center gap-1.5">
                  <TeamLogo teamKey={team.teamId} size="xs" />
                  {team.displayName}
                </p>
                <p className="tabular-nums">
                  {h.label} · <span className="font-semibold">{diffLabel(value)}</span> vs .500
                </p>
                <p className="text-muted-foreground">
                  {above
                    ? `${above.abbreviation} ${gapGamesLabel(above.gap)} ahead`
                    : "Top of this board"}
                  {below ? ` · ${below.abbreviation} ${gapGamesLabel(below.gap)} behind` : ""}
                </p>
                <p className="text-muted-foreground">
                  Click to {selectedTeamIds.has(h.id) ? "unpin" : "pin"}
                </p>
              </>
            );
          }}
        />
      </div>

      <div
        className="mt-2 flex min-h-[2.375rem] flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-md border border-transparent px-3 py-2 data-[pinned]:border-border/60 data-[pinned]:bg-background/70"
        data-pinned={pinned?.team ? "" : undefined}
        aria-live="polite"
      >
        {pinned?.team ? (
          <>
            {pinned.above ? (
              <span className={cn(type.caption, "inline-flex items-center gap-1.5")}>
                <TeamLogo teamKey={pinned.above.teamId} size="xs" />
                <span className="font-semibold">{pinned.above.abbreviation}</span>
                <span className="text-muted-foreground">
                  {gapGamesLabel(pinned.above.gap)} ahead
                </span>
                <span className="tabular-nums text-muted-foreground">
                  ({diffLabel(pinned.above.diff)})
                </span>
              </span>
            ) : (
              <span className={cn(type.caption, "text-muted-foreground")}>No one ahead</span>
            )}
            <span className={cn(type.caption, "font-bold text-foreground")}>
              · {pinned.team.displayName}{" "}
              <span className="text-muted-foreground">({pinned.team.abbreviation})</span>{" "}
              {typeof lastRow?.[pinned.team.teamId] === "number"
                ? diffLabel(Number(lastRow[pinned.team.teamId]))
                : diffLabel(pinned.team.currentDiff)}{" "}
              ·
            </span>
            {pinned.below ? (
              <span className={cn(type.caption, "inline-flex items-center gap-1.5")}>
                <TeamLogo teamKey={pinned.below.teamId} size="xs" />
                <span className="font-semibold">{pinned.below.abbreviation}</span>
                <span className="text-muted-foreground">
                  {gapGamesLabel(pinned.below.gap)} behind
                </span>
                <span className="tabular-nums text-muted-foreground">
                  ({diffLabel(pinned.below.diff)})
                </span>
              </span>
            ) : (
              <span className={cn(type.caption, "text-muted-foreground")}>No one behind</span>
            )}
          </>
        ) : (
          <p className={cn(type.caption, "text-center text-muted-foreground")}>
            Move along the chart to snap to the nearest team line. Click to pin.
          </p>
        )}
      </div>
    </div>
  );
}

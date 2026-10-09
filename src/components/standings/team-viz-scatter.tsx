"use client";

import { useId, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from "recharts";

import { TeamLogo } from "@/components/brand/team-logo";
import {
  dotMarkByKey,
  nearestDotMark,
  sameMarkKey,
  StoreSnapLayer,
  useHoverStore,
  useHoverValue,
  type HoverMark,
  type HoverStore,
} from "@/components/charts/hover-layer";
import { useTeamVizParams } from "@/components/standings/team-viz-hub";
import { fitNumericDomain } from "@/lib/chart-numeric-domain";
import { useChartTheme } from "@/lib/chart-theme";
import { type } from "@/lib/design-system";
import { resolveTeamBrand, teamLogoUrl } from "@/lib/nba-brand";
import { teamProfileHref } from "@/lib/team-identity";
import { TEAM_VIZ_SCATTERS, type TeamVizRow, type TeamVizView } from "@/lib/team-viz";
import { cn } from "@/lib/utils";

type Point = {
  x: number;
  y: number;
  rank: number | null;
  key: string;
  row: TeamVizRow;
  highlighted: boolean;
  color: string;
};

function niceAxis([lo, hi]: [number, number]): { domain: [number, number]; ticks: number[] } {
  const raw = (hi - lo) / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  return { domain: [start, end], ticks };
}

function teamKey(row: TeamVizRow): string {
  return resolveTeamBrand(row.abbr)?.abbr.toUpperCase() ?? row.abbr.toUpperCase();
}

function LogoDot({ cx = 0, cy = 0, payload }: { cx?: number; cy?: number; payload?: Point }) {
  if (!payload) return null;
  const big = payload.highlighted;
  const r = big ? 17 : 12;
  const logo = teamLogoUrl(payload.key);
  return (
    <g>
      <circle
        data-dot-key={payload.key}
        cx={cx}
        cy={cy}
        r={r}
        fill="var(--card)"
        stroke={payload.color}
        strokeWidth={big ? 2.5 : 1.25}
      />
      {logo ? (
        <image
          href={logo}
          x={cx - r * 0.72}
          y={cy - r * 0.72}
          width={r * 1.44}
          height={r * 1.44}
          preserveAspectRatio="xMidYMid meet"
        />
      ) : (
        <text x={cx} y={cy + 3} textAnchor="middle" fontSize={9} fontWeight={700} fill="currentColor">
          {payload.key}
        </text>
      )}
      {big ? (
        <text
          x={cx}
          y={cy + r + 12}
          textAnchor="middle"
          fontSize={11}
          fontWeight={700}
          fill="currentColor"
        >
          {payload.key}
        </text>
      ) : null}
    </g>
  );
}

export function TeamVizScatter({
  view,
  rows,
  season,
}: {
  view: TeamVizView;
  rows: TeamVizRow[];
  season: string;
}) {
  const spec = TEAM_VIZ_SCATTERS[view]!;
  const chartId = useId();
  const router = useRouter();
  const chartTheme = useChartTheme();
  const { teamKeys, toggleTeam, conference } = useTeamVizParams();
  const plotRef = useRef<HTMLDivElement>(null);
  const hover = useHoverStore<HoverMark>(sameMarkKey);

  const allPoints = useMemo<Point[]>(() => {
    const out: Point[] = [];
    for (const row of rows) {
      const x = spec.x.value(row);
      const y = spec.y.value(row);
      if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      const key = teamKey(row);
      out.push({
        x,
        y,
        rank: spec.rank.value(row),
        key,
        row,
        highlighted: teamKeys.includes(key),
        color: chartTheme.leagueTeamColor(row.teamId).color,
      });
    }
    return out;
  }, [chartTheme, rows, spec, teamKeys]);

  const points = useMemo(
    () => (conference ? allPoints.filter((p) => p.row.conference === conference) : allPoints),
    [allPoints, conference]
  );
  const ordered = useMemo(
    () => [...points.filter((p) => !p.highlighted), ...points.filter((p) => p.highlighted)],
    [points]
  );

  const leagueAvg = useMemo(() => {
    if (!allPoints.length) return null;
    const n = allPoints.length;
    return {
      x: allPoints.reduce((s, p) => s + p.x, 0) / n,
      y: allPoints.reduce((s, p) => s + p.y, 0) / n,
    };
  }, [allPoints]);

  const [axisX, axisY] = useMemo(() => {
    const pad = { padRatio: 0.1, padAbsolute: 0, minSpan: 0.02, allowNegative: true } as const;
    if (spec.reference === "diagonal") {
      const both = niceAxis(fitNumericDomain([...points.map((p) => p.x), ...points.map((p) => p.y)], pad));
      return [both, both];
    }
    return [
      niceAxis(fitNumericDomain(points.map((p) => p.x), pad)),
      niceAxis(fitNumericDomain(points.map((p) => p.y), pad)),
    ];
  }, [points, spec.reference]);
  const domainX = axisX.domain;
  const domainY = axisY.domain;

  const pointByKey = useMemo(() => new Map(points.map((p) => [p.key, p])), [points]);

  const ranked = useMemo(
    () =>
      points
        .filter((p) => p.rank != null)
        .sort((a, b) => (spec.rank.higherIsBetter ? b.rank! - a.rank! : a.rank! - b.rank!)),
    [points, spec.rank.higherIsBetter]
  );

  if (points.length < 8) {
    return (
      <p className={cn(type.bodySm, "sports-card px-4 py-10 text-center text-muted-foreground")}>
        Not enough teams with data for {spec.title.toLowerCase()} in {season}.
      </p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(200px,240px)]">
      <figure
        aria-labelledby={`${chartId}-title`}
        aria-describedby={`${chartId}-desc`}
        className="flex min-w-0 flex-col gap-3 rounded-xl border border-border/70 frost-surface p-4 sm:p-5"
      >
        <div className="min-w-0">
          <h2 id={`${chartId}-title`} className={type.heading}>
            {spec.title}
          </h2>
          <p id={`${chartId}-desc`} className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
            {season} · {spec.blurb}
          </p>
        </div>

        <div
          ref={plotRef}
          data-snap-host
          className="relative h-[340px] w-full sm:h-[440px]"
          onPointerMove={(event) => {
            if (plotRef.current) hover.set(nearestDotMark(plotRef.current, event.clientX, event.clientY));
          }}
          onPointerLeave={() => hover.set(null)}
          onClick={() => {
            const key = hover.get()?.key;
            if (key) router.push(teamProfileHref(key, season));
          }}
        >
          {spec.quadrants ? (
            <div
              aria-hidden
              className={cn(
                type.caption,
                "pointer-events-none absolute inset-0 z-10 font-semibold uppercase tracking-wide text-muted-foreground/70"
              )}
            >
              <span className="absolute left-16 top-4">{spec.quadrants.topLeft}</span>
              <span className="absolute right-9 top-4">{spec.quadrants.topRight}</span>
              <span className="absolute bottom-14 left-16">{spec.quadrants.bottomLeft}</span>
              <span className="absolute bottom-14 right-9">{spec.quadrants.bottomRight}</span>
            </div>
          ) : null}
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 18, right: 24, bottom: 28, left: 12 }}>
              <CartesianGrid strokeDasharray="2 2" className="stroke-border" strokeOpacity={0.55} />
              <XAxis
                type="number"
                dataKey="x"
                name={spec.x.label}
                domain={domainX}
                ticks={axisX.ticks}
                reversed={spec.x.invert}
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => spec.x.format(Number(v))}
                label={{ value: spec.x.label, position: "insideBottom", offset: -16, style: { fontSize: 11 } }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name={spec.y.label}
                domain={domainY}
                ticks={axisY.ticks}
                reversed={spec.y.invert}
                width={56}
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => spec.y.format(Number(v))}
                label={{
                  value: spec.y.label,
                  angle: -90,
                  position: "insideLeft",
                  offset: 4,
                  style: { fontSize: 11, textAnchor: "middle" },
                }}
              />
              {spec.reference === "average" && leagueAvg ? (
                <>
                  <ReferenceLine x={leagueAvg.x} stroke="currentColor" strokeOpacity={0.3} strokeDasharray="4 4" />
                  <ReferenceLine y={leagueAvg.y} stroke="currentColor" strokeOpacity={0.3} strokeDasharray="4 4" />
                </>
              ) : null}
              {spec.reference === "diagonal" ? (
                <ReferenceLine
                  segment={[
                    { x: domainX[0], y: domainX[0] },
                    { x: domainX[1], y: domainX[1] },
                  ]}
                  stroke="currentColor"
                  strokeOpacity={0.35}
                  strokeDasharray="4 4"
                  ifOverflow="hidden"
                />
              ) : null}
              <Scatter data={ordered} isAnimationActive={false} shape={LogoDot} />
            </ScatterChart>
          </ResponsiveContainer>
          <StoreSnapLayer
            store={hover}
            size={34}
            color={(m) => pointByKey.get(m.key)?.color ?? "var(--foreground)"}
            render={(m) => {
              const p = pointByKey.get(m.key);
              if (!p) return null;
              return (
                <>
                  <p className="flex items-center gap-1.5">
                    <TeamLogo teamKey={p.key} size="xs" />
                    {p.row.name} · {p.row.wins}-{p.row.losses}
                  </p>
                  <p className="tabular-nums">
                    {spec.x.label}: {spec.x.format(p.x)}
                  </p>
                  <p className="tabular-nums">
                    {spec.y.label}: {spec.y.format(p.y)}
                  </p>
                  {p.rank != null && spec.rank.label !== spec.x.label && spec.rank.label !== spec.y.label ? (
                    <p className="tabular-nums text-muted-foreground">
                      {spec.rank.label}: {spec.rank.format(p.rank)}
                    </p>
                  ) : null}
                </>
              );
            }}
          />
        </div>
        <p className={cn(type.caption, "text-muted-foreground")}>
          {spec.reference === "average"
            ? "Dashed lines are the league average."
            : "Dashed line is where both values are equal."}{" "}
          Click a logo to open that team.
        </p>
      </figure>

      <aside className="sports-card flex max-h-[min(560px,70vh)] flex-col overflow-hidden p-3 md:sticky md:top-44">
        <h2 className={cn(type.bodySm, "font-bold")}>{spec.rank.label}</h2>
        <p className={cn(type.caption, "mb-2 text-muted-foreground")}>Click a team to highlight it.</p>
        <RankList
          ranked={ranked}
          format={spec.rank.format}
          hover={hover}
          onToggle={toggleTeam}
          onRowHover={(key) =>
            hover.set(key && plotRef.current ? dotMarkByKey(plotRef.current, [key]) : null)
          }
        />
      </aside>
    </div>
  );
}

/** The ranking beside the chart. Its row and the chart's logo light up together. */
function RankList({
  ranked,
  format,
  hover,
  onToggle,
  onRowHover,
}: {
  ranked: Point[];
  format: (value: number) => string;
  hover: HoverStore<HoverMark>;
  onToggle: (key: string) => void;
  onRowHover: (key: string | null) => void;
}) {
  const hoveredKey = useHoverValue(hover)?.key ?? null;
  return (
    <ol className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
      {ranked.map((p, index) => (
        <li key={p.key}>
          <button
            type="button"
            aria-pressed={p.highlighted}
            onClick={() => onToggle(p.key)}
            onPointerEnter={() => onRowHover(p.key)}
            onPointerLeave={() => onRowHover(null)}
            onFocus={() => onRowHover(p.key)}
            onBlur={() => onRowHover(null)}
            className={cn(
              type.caption,
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-secondary/70",
              hoveredKey === p.key && "bg-secondary/70",
              p.highlighted && "bg-secondary font-semibold"
            )}
          >
            <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground">{index + 1}</span>
            <TeamLogo teamKey={p.key} size="xs" />
            <span className="min-w-0 flex-1 truncate font-semibold">{p.key}</span>
            <span className="tabular-nums">{format(p.rank!)}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

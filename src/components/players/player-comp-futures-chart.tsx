"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
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
import { AppLink } from "@/components/ui/app-link";
import { type } from "@/lib/design-system";
import { chartSemantic, useChartTheme } from "@/lib/chart-theme";
import {
  formatCompValue,
  formatSimilarity,
  type CompFutures,
  type CompFuturesBundle,
  type CompFuturesPoint,
  type CompFuturesRow,
  type CompMetricId,
  type CompSlot,
} from "@/lib/player-comp-futures-shared";
import { playerSeasonChipHref } from "@/lib/player-destination";
import { cn } from "@/lib/utils";

const HISTORY = "var(--accent-info)";
const BAND = "var(--accent-info)";
const MEDIAN = "var(--foreground)";
const COMP = "var(--text-secondary)";
const HIGHLIGHT = "#e06a12";

function Spark({
  slots,
  min,
  max,
}: {
  slots: CompSlot[];
  min: number;
  max: number;
}) {
  const span = max - min || 1;
  const w = 72;
  const h = 22;
  const xAt = (index: number) => (index / Math.max(1, slots.length - 1)) * w;
  const yAt = (value: number) => h - ((value - min) / span) * (h - 2) - 1;
  const segments: string[] = [];
  let current: string[] = [];
  slots.forEach((slot, index) => {
    const drawn = slot.kind === "anchor" || slot.kind === "qualifying" || slot.kind === "short";
    if (!drawn || slot.value == null) {
      if (current.length) segments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${xAt(index).toFixed(1)},${yAt(slot.value).toFixed(1)}`);
  });
  if (current.length) segments.push(current.join(" "));
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="overflow-visible">
      {segments.map((points) => (
        <polyline
          key={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          points={points}
          className="text-foreground/70"
        />
      ))}
      {slots.map((slot, index) => {
        if (slot.value == null) return null;
        if (slot.kind !== "anchor" && slot.kind !== "qualifying" && slot.kind !== "short") return null;
        return (
          <circle
            key={slot.season}
            cx={xAt(index)}
            cy={yAt(slot.value)}
            r={slot.kind === "short" ? 1.4 : 1.1}
            fill={slot.kind === "short" ? "transparent" : "currentColor"}
            stroke="currentColor"
            className="text-foreground/70"
          />
        );
      })}
    </svg>
  );
}

function slotNote(slot: CompSlot | undefined): string {
  if (!slot) return "No season on file.";
  if (slot.kind === "unobserved") return `${slot.season} is not in the archive yet.`;
  if (slot.kind === "unavailable") return `${slot.season} has no rating in this metric's coverage.`;
  if (slot.kind === "missing") return `${slot.season} is missing. Blank, not 0.`;
  if (slot.kind === "short") {
    return `${slot.season}: ${slot.games ?? 0} games. Under 10, so it stays out of the range.`;
  }
  if (slot.kind === "unrated") {
    return `${slot.season}: ${slot.games} games, no rating. Counted as played, not in the range.`;
  }
  return slot.season;
}

export function PlayerCompFuturesChart({
  bundle,
  playerId,
  season,
  espnId,
}: {
  bundle: CompFuturesBundle;
  teamKey?: string | null;
  playerId?: string | null;
  season?: string | null;
  espnId?: string | null;
}) {
  const theme = useChartTheme();
  const [metricId, setMetricId] = useState(bundle.defaultId);
  const [items, setItems] = useState(bundle.items);
  const [loadingMetric, setLoadingMetric] = useState<CompMetricId | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const chips =
    bundle.availableMetrics ??
    items.map((item) => ({ id: item.metricId, label: item.metricLabel }));
  const data =
    items.find((item) => item.metricId === metricId) ?? items[0]!;
  const activeId = hoverId ?? pinnedId;
  const highlighted = data.fan.find((row) => row.playerId === activeId) ?? null;
  const bandOuter = theme.isDark ? 0.16 : 0.12;
  const bandInner = theme.isDark ? 0.34 : 0.24;

  const selectMetric = useCallback(
    async (nextId: CompMetricId) => {
      setHoverId(null);
      setPinnedId(null);
      if (items.some((item) => item.metricId === nextId)) {
        setMetricId(nextId);
        return;
      }
      if (!playerId || !season) return;
      setLoadingMetric(nextId);
      try {
        const params = new URLSearchParams({
          season,
          metric: nextId,
        });
        if (espnId) params.set("espnId", espnId);
        const res = await fetch(
          `/api/players/${encodeURIComponent(playerId)}/comp-futures?${params}`
        );
        if (!res.ok) return;
        const body = (await res.json()) as { item?: CompFutures };
        if (!body.item) return;
        setItems((prev) =>
          prev.some((item) => item.metricId === body.item!.metricId)
            ? prev
            : [...prev, body.item!]
        );
        setMetricId(nextId);
      } finally {
        setLoadingMetric(null);
      }
    },
    [espnId, items, playerId, season]
  );

  const sparkScale = useMemo(() => {
    const values = data.table.flatMap((row) =>
      row.slots.flatMap((slot) => (slot.value == null ? [] : [slot.value]))
    );
    if (!values.length) return { min: 0, max: 1 };
    return { min: Math.min(...values), max: Math.max(...values) };
  }, [data.table]);

  const rows = useMemo(() => {
    return data.points.map((point, index) => {
      const comps: Record<string, number | null> = {};
      data.fan.forEach((line, lineIndex) => {
        comps[`c${lineIndex}`] = line.values[index] ?? null;
      });
      const hi = highlighted?.values[index];
      return {
        age: point.age,
        focal: point.focal,
        p10: point.p10,
        p25: point.p25,
        p50: point.p50,
        outer: point.p90 != null && point.p10 != null ? point.p90 - point.p10 : null,
        inner: point.p75 != null && point.p25 != null ? point.p75 - point.p25 : null,
        hi: hi != null && Number.isFinite(hi) ? hi : null,
        ...comps,
      };
    });
  }, [data, highlighted]);

  const pointByAge = useMemo(() => {
    const map = new Map<number, CompFuturesPoint>();
    for (const point of data.points) map.set(point.age, point);
    return map;
  }, [data.points]);

  function togglePin(playerId: string) {
    setPinnedId((current) => (current === playerId ? null : playerId));
  }

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.9fr)] lg:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              aria-pressed={chip.id === metricId}
              aria-busy={loadingMetric === chip.id}
              onClick={() => {
                void selectMetric(chip.id);
              }}
              className={cn(
                type.caption,
                "glass-pill rounded-md px-2.5 py-1 font-semibold transition-colors",
                chip.id === metricId || loadingMetric === chip.id
                  ? "glass-pill-active"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <p className={cn(type.bodySm, "mt-3 text-muted-foreground")}>
          {formatCompValue(data.focalValue, data.digits)} {data.metricLabel} at age {data.focalAge} in{" "}
          {data.focalSeason} ranks{" "}
          <span className="font-semibold text-foreground">
            {data.rank} of {data.poolSize}
          </span>{" "}
          age-{data.focalAge} seasons with 10 or more games. {data.metricLabel} is {data.unit}, and{" "}
          {data.baseline}. {data.versionNote}. Coverage {data.coverageStart} through {data.coverageEnd}.
        </p>
        <div className="mt-3 h-[240px] w-full sm:h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 22, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid
                stroke={chartSemantic.grid}
                strokeOpacity={theme.gridOpacity()}
                vertical={false}
              />
              <XAxis
                dataKey="age"
                tick={{ fill: chartSemantic.axis, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: chartSemantic.axis, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={36}
                tickFormatter={(v: number) => formatCompValue(v, data.digits)}
              />
              <Tooltip
                wrapperStyle={rechartsFrostWrapperStyle}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const age = Number(label);
                  const point = pointByAge.get(age);
                  if (!point) return null;
                  const slot = highlighted?.slots[point.offset];
                  return (
                    <FrostRechartsTooltip active={active}>
                      <p className="text-[12px] font-semibold">
                        Age {age}
                        {point.season ? ` · ${point.season}` : ""}
                      </p>
                      {point.focal != null ? (
                        <p className="text-[12px]">
                          {data.focalName}: {formatCompValue(point.focal, data.digits)}
                        </p>
                      ) : null}
                      {point.offset > 0 && point.p50 != null ? (
                        <p className="text-[12px]">
                          From his mark: {formatCompValue(point.p50, data.digits)}, the median
                          change across {point.ratingCount} comps
                        </p>
                      ) : null}
                      {point.offset > 0 && point.suppressed ? (
                        <p className="text-[12px] text-muted-foreground">
                          Range hidden. {point.ratingCount} qualifying ratings, and this view needs{" "}
                          8.
                        </p>
                      ) : null}
                      {point.offset > 0 && point.participation != null ? (
                        <p className="text-[12px] text-muted-foreground">
                          Played 10+ games: {Math.round(point.participation * 100)}% (
                          {point.playedCount} of {point.observedCount} comps in seasons on file)
                        </p>
                      ) : null}
                      {point.offset > 0 && point.participation == null ? (
                        <p className="text-[12px] text-muted-foreground">
                          This season is outside the archive, so it is left out of the share who played.
                        </p>
                      ) : null}
                      {highlighted && point.offset >= 0 ? (
                        <p className="text-[12px]">
                          {highlighted.playerName}
                          {slot?.value != null
                            ? `: ${formatCompValue(slot.value, data.digits)}`
                            : ""}
                          . {slotNote(slot)}
                        </p>
                      ) : null}
                    </FrostRechartsTooltip>
                  );
                }}
              />
              <Area type="monotone" dataKey="p10" stackId="outer" stroke="none" fill="transparent" connectNulls={false} isAnimationActive={false} legendType="none" />
              <Area type="monotone" dataKey="outer" stackId="outer" stroke="none" fill={BAND} fillOpacity={bandOuter} connectNulls={false} isAnimationActive={false} legendType="none" />
              <Area type="monotone" dataKey="p25" stackId="inner" stroke="none" fill="transparent" connectNulls={false} isAnimationActive={false} legendType="none" />
              <Area type="monotone" dataKey="inner" stackId="inner" stroke="none" fill={BAND} fillOpacity={bandInner} connectNulls={false} isAnimationActive={false} legendType="none" />
              {data.fan.map((line, index) => (
                <Line
                  key={line.playerId}
                  type="monotone"
                  dataKey={`c${index}`}
                  stroke={COMP}
                  strokeOpacity={line.playerId === activeId ? 0 : 0.35}
                  strokeWidth={1}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                  legendType="none"
                  tooltipType="none"
                />
              ))}
              <Line
                type="monotone"
                dataKey="p50"
                stroke={MEDIAN}
                strokeDasharray="5 4"
                strokeWidth={1.7}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="focal"
                stroke={HISTORY}
                strokeWidth={2.4}
                dot={(dot: {
                  cx?: number;
                  cy?: number;
                  payload?: { age?: number; focal?: number | null };
                }) => {
                  if (dot.cx == null || dot.cy == null || dot.payload?.focal == null) return <g />;
                  const last = dot.payload.age === data.focalAge;
                  return (
                    <g>
                      <circle cx={dot.cx} cy={dot.cy} r={last ? 4.2 : 3.4} fill={HISTORY} />
                      {last ? (
                        <text x={dot.cx} y={dot.cy - 10} textAnchor="middle" fontSize={11} fontWeight={600} fill={HISTORY}>
                          {`${data.focalSeason} ${formatCompValue(data.focalValue, data.digits)}`}
                        </text>
                      ) : null}
                    </g>
                  );
                }}
                connectNulls
                isAnimationActive={false}
              />
              {highlighted ? (
                <Line
                  type="monotone"
                  dataKey="hi"
                  stroke={HIGHLIGHT}
                  strokeWidth={2.2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div
          className="grid text-center text-[10px] leading-tight text-muted-foreground"
          style={{
            gridTemplateColumns: `repeat(${data.points.length}, minmax(0, 1fr))`,
            paddingLeft: 36,
            paddingRight: 12,
          }}
        >
          {data.points.map((point) => (
            <div key={point.age} title={point.season ?? undefined}>
              {point.offset > 0 && point.participation != null
                ? `${Math.round(point.participation * 100)}%`
                : ""}
            </div>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Percents under the future ages are the historical share of comps with 10 or more games
          that season. Seasons not in the archive are left blank.
        </p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded-sm" style={{ background: HISTORY }} />
            {data.focalName}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded-sm" style={{ background: COMP, opacity: 0.7 }} />
            {data.fanCount} comp paths
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-px w-4 border-t border-dashed" style={{ borderColor: MEDIAN }} />
            Median change from his mark
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-4 rounded-sm" style={{ background: BAND, opacity: bandInner }} />
            Middle half of those changes
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-4 rounded-sm" style={{ background: BAND, opacity: bandOuter }} />
            Outer range of those changes
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded-sm" style={{ background: HIGHLIGHT }} />
            Highlighted comp
          </li>
        </ul>
      </div>
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[22rem] text-left text-[12px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="py-1.5 pr-2 font-semibold">Comp</th>
              <th className="py-1.5 pr-2 font-semibold tabular-nums">Age</th>
              <th className="py-1.5 pr-2 font-semibold tabular-nums">{data.metricLabel} then</th>
              <th className="py-1.5 pr-2 font-semibold">Anchor + 5</th>
              <th className="py-1.5 font-semibold tabular-nums">Similarity</th>
            </tr>
          </thead>
          <tbody>
            {data.table.map((row) => (
              <CompTableRow
                key={`${row.playerId}-${row.season}`}
                row={row}
                digits={data.digits}
                active={activeId === row.playerId}
                pinned={pinnedId === row.playerId}
                sparkMin={sparkScale.min}
                sparkMax={sparkScale.max}
                onHover={setHoverId}
                onToggle={() => togglePin(row.playerId)}
              />
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
          One anchor season per player, within {data.ageWindow} year of age {data.focalAge}. The
          sparkline is that season and the next five calendar seasons, on one scale. A gap is a
          missing season, not 0. An open dot is a season under 10 games. Hover, focus, or click a
          row to hold that path. The dashed line and the bands start at his last season and add
          the weighted change among comps with 10 or more games and a rating. The gray lines stay
          on those comps&apos; actual ratings. Similarity is 100 times e to the minus distance. In
          a check of past DRBL seasons, a normal closest match scored about 28, and a top-fifth
          season&apos;s closest match scored about 22. A score near 8 means the pool has no twin
          for that season. The bar uses that score as it is.
        </p>
      </div>
    </div>
  );
}

function CompTableRow({
  row,
  digits,
  active,
  pinned,
  sparkMin,
  sparkMax,
  onHover,
  onToggle,
}: {
  row: CompFuturesRow;
  digits: number;
  active: boolean;
  pinned: boolean;
  sparkMin: number;
  sparkMax: number;
  onHover: (id: string | null) => void;
  onToggle: () => void;
}) {
  return (
    <tr
      tabIndex={0}
      aria-pressed={pinned}
      className={cn(
        "cursor-pointer border-t border-border/50 outline-none focus-visible:bg-foreground/10",
        active && "bg-foreground/5"
      )}
      onMouseEnter={() => onHover(row.playerId)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(row.playerId)}
      onBlur={() => onHover(null)}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle();
        }
      }}
    >
      <td className="py-1.5 pr-2">
        {row.playerId.startsWith("n:") ? (
          <span className="font-semibold">{row.playerName}</span>
        ) : (
          <AppLink
            href={playerSeasonChipHref(row.playerId, row.season)}
            className="font-semibold hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {row.playerName}
          </AppLink>
        )}
        <div className="text-[11px] text-muted-foreground">{row.season}</div>
      </td>
      <td className="py-1.5 pr-2 tabular-nums">{row.age}</td>
      <td className="py-1.5 pr-2 tabular-nums font-medium">{formatCompValue(row.value, digits)}</td>
      <td className="py-1.5 pr-2">
        <Spark slots={row.slots} min={sparkMin} max={sparkMax} />
      </td>
      <td className="py-1.5 tabular-nums">
        <span
          className="inline-flex items-center gap-1.5"
          title="100 times e to the minus distance. About 28 is a normal closest match. Near 8 means no twin."
        >
          <span className="relative h-1.5 w-10 overflow-hidden rounded-full bg-foreground/10">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-foreground/55"
              style={{ width: `${Math.max(4, Math.min(100, row.similarity))}%` }}
            />
          </span>
          {formatSimilarity(row.similarity)}
        </span>
      </td>
    </tr>
  );
}

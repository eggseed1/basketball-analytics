/**
 * Lightweight SSR-safe player analytics visuals (P18C.1.3).
 * Prefer SVG over heavy chart clients for tab HTML budgets.
 */

import Link from "next/link";
import type { CSSProperties } from "react";

import { GlassSurface } from "@/components/brand/glass-surface";
import { boardType, type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function fmt(n: number, digits = 1): string {
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

function signed(n: number, digits = 1): string {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}`;
}

/** Full-height hover column for one point of a line chart: hit area, guide, dot. */
function HoverPoint({
  cx,
  cy,
  r,
  column,
  height,
  index,
  opacity,
}: {
  cx: number;
  cy: number;
  r: number;
  column: number;
  height: number;
  index: number;
  opacity?: number;
}) {
  return (
    <>
      <rect x={cx - column / 2} y={0} width={column} height={height} fill="transparent" />
      <line data-hover-guide x1={cx} x2={cx} y1={4} y2={height - 4} stroke="currentColor" strokeDasharray="3 3" />
      <circle
        data-motion-dot
        data-tip-anchor
        style={{ "--i": Math.min(index, 24) } as CSSProperties}
        cx={cx}
        cy={cy}
        r={r}
        fill="currentColor"
        opacity={opacity}
      />
    </>
  );
}

export function PlayerSparkTrend({
  title,
  question,
  points,
  seasonAvg,
  valueDigits = 1,
  hrefForPoint,
}: {
  title: string;
  question: string;
  points: Array<{ x: string; y: number; href?: string; label?: string }>;
  seasonAvg?: number;
  valueDigits?: number;
  hrefForPoint?: (p: { x: string; y: number; href?: string }) => string | null;
}) {
  if (!points.length) {
    return (
      <figure className="sports-card sports-card-subtle p-3">
        <figcaption className="text-[13px] font-semibold">{title}</figcaption>
        <p className="mt-1 text-[12px] text-muted-foreground">{question}</p>
        <p className="mt-3 text-[12px] text-muted-foreground">No data.</p>
      </figure>
    );
  }
  const ys = points.map((p) => p.y);
  const min = Math.min(...ys, seasonAvg ?? ys[0]!);
  const max = Math.max(...ys, seasonAvg ?? ys[0]!);
  const span = max - min || 1;
  const w = 640;
  const h = 160;
  const pad = 12;
  const coords = points.map((p, i) => {
    const x = pad + (i * (w - pad * 2)) / Math.max(1, points.length - 1);
    const y = h - pad - ((p.y - min) / span) * (h - pad * 2);
    return { ...p, cx: x, cy: y };
  });
  const path = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.cx.toFixed(1)},${c.cy.toFixed(1)}`)
    .join(" ");
  const column = (w - pad * 2) / Math.max(1, points.length - 1);
  const avgY =
    seasonAvg != null
      ? h - pad - ((seasonAvg - min) / span) * (h - pad * 2)
      : null;

  return (
    <figure className="sports-card sports-card-subtle p-3" aria-label={title}>
      <figcaption className="text-[13px] font-semibold">{title}</figcaption>
      <p className="mt-0.5 text-[12px] text-muted-foreground">{question}</p>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="mt-3 h-[140px] w-full"
        role="img"
        aria-label={`${title} trend chart`}
        data-hover-svg
      >
        {avgY != null ? (
          <line
            x1={pad}
            x2={w - pad}
            y1={avgY}
            y2={avgY}
            stroke="currentColor"
            strokeOpacity={0.35}
            strokeDasharray="4 4"
          />
        ) : null}
        <path
          d={path}
          pathLength={1}
          data-motion-line
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          opacity={0.85}
        />
        {coords.map((c, i) => {
          const href = c.href ?? hrefForPoint?.(c) ?? null;
          const label = c.label ?? c.x;
          const detail = `${fmt(c.y, valueDigits)}${
            seasonAvg != null ? ` · ${signed(c.y - seasonAvg, valueDigits)} vs season avg` : ""
          }`;
          const point = (
            <HoverPoint cx={c.cx} cy={c.cy} r={3} column={column} height={h} index={i} />
          );
          return href ? (
            <a
              key={c.x + c.cx}
              href={href}
              aria-label={`${label}: ${detail}`}
              data-hover-point
              data-tip={label}
              data-tip-sub={detail}
            >
              {point}
            </a>
          ) : (
            <g key={c.x + c.cx} data-hover-point data-tip={label} data-tip-sub={detail}>
              {point}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <span>
          n={points.length}
          {seasonAvg != null ? ` · season avg ${fmt(seasonAvg, valueDigits)}` : ""}
        </span>
        <span>
          range {fmt(min, valueDigits)}–{fmt(max, valueDigits)}
        </span>
      </div>
    </figure>
  );
}

export function PlayerBarDistribution({
  title,
  question,
  bins,
  mean,
  median,
  min,
  max,
}: {
  title: string;
  question: string;
  bins: Array<{ label: string; count: number }>;
  mean: number;
  median: number;
  min: number;
  max: number;
}) {
  const peak = Math.max(1, ...bins.map((b) => b.count));
  return (
    <figure className="sports-card sports-card-subtle p-3">
      <figcaption className="text-[13px] font-semibold">{title}</figcaption>
      <p className="mt-0.5 text-[12px] text-muted-foreground">{question}</p>
      <ul data-hover-group className="mt-3 flex h-[120px] items-end gap-1" role="img" aria-label={title}>
        {bins.map((b, i) => (
          <li
            key={b.label}
            style={{ "--i": i } as CSSProperties}
            className="flex h-full flex-1 flex-col items-center justify-end gap-1"
            data-hover-item
            data-tip={b.label}
            data-tip-sub={`${b.count} ${b.count === 1 ? "game" : "games"}`}
          >
            <span className="text-[9px] tabular-nums text-muted-foreground">
              {b.count || ""}
            </span>
            <div
              data-motion-bar="y"
              data-tip-anchor
              className="w-full rounded-t-sm bg-foreground/80"
              style={{ height: `${(b.count / peak) * 100}%`, minHeight: b.count ? 2 : 0 }}
            />
          </li>
        ))}
      </ul>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Mean</dt>
          <dd className="font-semibold tabular-nums">{fmt(mean)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Median</dt>
          <dd className="font-semibold tabular-nums">{fmt(median)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Min</dt>
          <dd className="font-semibold tabular-nums">{fmt(min)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Max</dt>
          <dd className="font-semibold tabular-nums">{fmt(max)}</dd>
        </div>
      </dl>
    </figure>
  );
}

/** Soft rank color for Advanced strips and impact markers. */
export function percentileAccent(p: number | null): string {
  if (p == null || !Number.isFinite(p)) return "var(--muted-foreground)";
  if (p >= 75) return "var(--data-positive)";
  if (p >= 50) return "var(--chart-1)";
  if (p >= 25) return "var(--chart-4)";
  return "var(--data-negative)";
}

export function PlayerPercentileStrip({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    label: string;
    valueLabel: string;
    percentile: number | null;
    help?: string;
  }>;
}) {
  return (
    <figure className="sports-card sports-card-subtle glass-text-scrim w-full p-3 sm:p-4">
      <figcaption className="text-[15px] font-bold tracking-tight">{title}</figcaption>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        League percentile among qualified peers this season.
      </p>
      <ul data-hover-group className="mt-3 flex flex-col gap-3">
        {rows.map((r) => {
          const p = r.percentile;
          const left = p == null ? null : Math.max(2, Math.min(98, p));
          const accent = percentileAccent(p);
          return (
            <li
              key={r.label}
              data-hover-item
              data-tip={r.label}
              data-tip-sub={p == null ? `${r.valueLabel}, no percentile` : `${r.valueLabel} · ${p}th percentile`}
              className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-2"
            >
              <span className="text-[12px] font-medium">{r.label}</span>
              <div
                className="relative h-2.5 overflow-hidden rounded-full bg-foreground/[0.08]"
                role="img"
                aria-label={
                  p == null
                    ? `${r.label} ${r.valueLabel}`
                    : `${r.label} ${r.valueLabel}, ${p}th percentile`
                }
              >
                {left != null ? (
                  <>
                    <span
                      data-motion-bar="x"
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${left}%`,
                        background: `color-mix(in oklab, ${accent} 42%, transparent)`,
                      }}
                    />
                    <span
                      data-motion-mark
                      data-tip-anchor
                      className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background"
                      style={{
                        left: `${left}%`,
                        background: accent,
                        "--mark-from": "2%",
                      } as CSSProperties}
                    />
                  </>
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] text-muted-foreground">
                    n/a
                  </span>
                )}
              </div>
              <span className="text-right text-[12px] tabular-nums">
                {r.valueLabel}
                {p != null ? (
                  <span
                    className="ml-1 text-[10px] font-semibold"
                    style={{ color: accent }}
                  >
                    {p}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

export function PlayerSplitDeltaMatrix({
  title,
  rows,
  metrics,
}: {
  title: string;
  rows: Array<{
    label: string;
    games: number;
    minutes: number;
    deltas: Record<string, number | null>;
  }>;
  metrics: string[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className={type.title}>{title}</h3>
        <p className={cn(type.caption, "text-muted-foreground")}>
          Difference vs season baseline (per game / rate). Sample size shown.
        </p>
      </div>
      <GlassSurface variant="subtle" effect="css" className="p-4 sm:p-5">
        <div className="board-scroll-host overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead
              className={cn(
                boardType.head,
                "border-b border-border font-semibold uppercase tracking-wide text-muted-foreground"
              )}
            >
              <tr>
                <th className="px-3 py-2">Split</th>
                <th className="px-2 py-2 text-right">G</th>
                <th className="px-2 py-2 text-right">MIN</th>
                {metrics.map((m) => (
                  <th key={m} className="px-2 py-2 text-right">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className={cn(boardType.cell, "px-3 py-2 font-semibold")}>
                    {r.label}
                  </td>
                  <td
                    className={cn(
                      boardType.cell,
                      "px-2 py-2 text-right tabular-nums"
                    )}
                  >
                    {r.games}
                  </td>
                  <td
                    className={cn(
                      boardType.cell,
                      "px-2 py-2 text-right tabular-nums"
                    )}
                  >
                    {fmt(r.minutes, 0)}
                  </td>
                  {metrics.map((m) => {
                    const d = r.deltas[m];
                    const isPct = m.includes("%");
                    const label =
                      d == null
                        ? "—"
                        : `${d > 0 ? "+" : ""}${(isPct ? d * 100 : d).toFixed(1)}${
                            isPct ? "pp" : ""
                          }`;
                    return (
                      <td
                        key={m}
                        className={cn(
                          boardType.cell,
                          "px-2 py-2 text-right tabular-nums",
                          d != null && d > 0 && "text-positive",
                          d != null && d < 0 && "text-negative"
                        )}
                      >
                        {label}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassSurface>
    </div>
  );
}

export function PlayerOpponentDeltaBars({
  title,
  rows,
  metricLabel,
}: {
  title: string;
  rows: Array<{ label: string; games: number; delta: number }>;
  metricLabel: string;
}) {
  const maxAbs = Math.max(0.01, ...rows.map((r) => Math.abs(r.delta)));
  return (
    <figure className="sports-card sports-card-subtle p-3">
      <figcaption className="text-[13px] font-semibold">{title}</figcaption>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        {metricLabel} vs season average · sorted best → worst · G shown
      </p>
      <ul data-hover-group className="mt-3 flex max-h-80 flex-col gap-1.5 overflow-y-auto">
        {rows.map((r) => {
          const width = (Math.abs(r.delta) / maxAbs) * 50;
          const positive = r.delta >= 0;
          return (
            <li
              key={r.label}
              data-hover-item
              className="grid grid-cols-[3rem_1fr_3.5rem] items-center gap-2 text-[12px]"
            >
              <span className="font-semibold">
                {r.label}
                <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                  {r.games}G
                </span>
              </span>
              <div className="relative h-3 rounded-sm bg-muted">
                <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                <div
                  data-motion-bar="x"
                  className={cn(
                    "absolute inset-y-0 rounded-sm",
                    positive ? "left-1/2 bg-foreground/70" : "right-1/2 bg-foreground/40"
                  )}
                  style={{ width: `${width}%`, transformOrigin: positive ? "left" : "right" }}
                />
              </div>
              <span className="text-right tabular-nums">
                {r.delta > 0 ? "+" : ""}
                {fmt(r.delta)}
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

export function PlayerShotProfileBars({
  title,
  slices,
}: {
  title: string;
  slices: Array<{
    label: string;
    share: number;
    accuracy: number | null;
    leagueAccuracy?: number | null;
    attempts: number;
  }>;
}) {
  return (
    <figure className="sports-card sports-card-subtle p-3">
      <figcaption className="text-[13px] font-semibold">{title}</figcaption>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        How often (bar) and how well (dot), with a league baseline marker when available.
      </p>
      <ul data-hover-group className="mt-3 flex flex-col gap-3">
        {slices.map((s) => (
          <li
            key={s.label}
            data-hover-item
            data-tip={`${s.label} · ${(s.share * 100).toFixed(1)}% of shots`}
            data-tip-sub={
              s.accuracy == null
                ? `${s.attempts} attempts`
                : `${(s.accuracy * 100).toFixed(1)}% FG${
                    s.leagueAccuracy != null ? ` · league ${(s.leagueAccuracy * 100).toFixed(1)}%` : ""
                  }`
            }
            className="grid grid-cols-[5.5rem_1fr_4rem] items-center gap-2"
          >
            <span className="text-[12px] font-medium">
              {s.label}
              <span className="block text-[10px] font-normal text-muted-foreground">
                {s.attempts} att
              </span>
            </span>
            <div data-tip-anchor className="relative h-3 rounded-sm bg-muted">
              <div
                data-motion-bar="x"
                className="absolute inset-y-0 left-0 rounded-sm bg-foreground/70"
                style={{ width: `${Math.max(2, s.share * 100)}%` }}
              />
              {s.accuracy != null ? (
                <span
                  data-motion-mark
                  className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background bg-foreground"
                  style={{ left: `${Math.max(2, Math.min(98, s.accuracy * 100))}%`, "--mark-from": "2%" } as CSSProperties}
                />
              ) : null}
              {s.leagueAccuracy != null ? (
                <span
                  className="absolute top-0 h-3 w-0.5 -translate-x-1/2 bg-muted-foreground"
                  style={{
                    left: `${Math.max(2, Math.min(98, s.leagueAccuracy * 100))}%`,
                  }}
                />
              ) : null}
            </div>
            <span className="text-right text-[11px] tabular-nums">
              {(s.share * 100).toFixed(0)}%
              {s.accuracy != null
                ? ` · ${(s.accuracy * 100).toFixed(0)}%`
                : ""}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function PlayerImpactMarker({
  title,
  valueLabel,
  percentile,
  bins,
  range,
  value,
  copy,
}: {
  title: string;
  valueLabel: string;
  percentile: number | null;
  bins: number[];
  /** Value span the bins cover, for hover labels and marker placement. */
  range?: { min: number; max: number; digits?: number };
  /** Player value; with `range` the marker sits on the bins' value axis. */
  value?: number | null;
  /** One line under the title. Defaults to league-distribution copy. */
  copy?: string;
}) {
  const binLabel = (i: number) => {
    if (!range) return null;
    const step = (range.max - range.min) / bins.length;
    const digits = range.digits ?? 1;
    return `${fmt(range.min + step * i, digits)} to ${fmt(range.min + step * (i + 1), digits)}`;
  };
  const max = Math.max(1, ...bins);
  const marker =
    range && value != null && range.max > range.min
      ? Math.max(0, Math.min(100, ((value - range.min) / (range.max - range.min)) * 100))
      : percentile == null
        ? null
        : Math.max(0, Math.min(100, percentile));
  const accent = percentileAccent(percentile);
  const markerBin =
    marker == null || !bins.length
      ? -1
      : Math.min(bins.length - 1, Math.floor((marker / 100) * bins.length));
  return (
    <figure className="sports-card sports-card-subtle glass-text-scrim p-3 sm:p-4">
      <figcaption className="text-[15px] font-bold tracking-tight">{title}</figcaption>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        {copy ?? "League distribution with player marker (same-season peers)."}
      </p>
      <p
        className="mt-2 text-[22px] font-bold tabular-nums tracking-tight"
        style={{ color: percentile != null ? accent : undefined }}
      >
        {valueLabel}
      </p>
      {percentile != null ? (
        <p className="text-[12px] font-semibold" style={{ color: accent }}>
          {percentile}th percentile
        </p>
      ) : null}
      <div className="relative mt-3 h-[72px]">
        <ul data-hover-group className="flex h-full items-end gap-0.5" role="img" aria-label={title}>
          {bins.map((c, i) => {
            const near = markerBin >= 0 && Math.abs(i - markerBin) <= 1;
            const fill = near
              ? accent
              : i / bins.length >= 0.66
                ? "var(--chart-1)"
                : i / bins.length >= 0.33
                  ? "var(--chart-4)"
                  : "var(--muted-foreground)";
            return (
              <li
                key={i}
                data-hover-item
                data-tip={binLabel(i) ?? undefined}
                data-tip-sub={binLabel(i) ? `${c} ${c === 1 ? "player" : "players"}` : undefined}
                className="flex h-full flex-1 items-end"
              >
                <span
                  data-motion-bar="y"
                  data-tip-anchor
                  className="block w-full rounded-t-sm"
                  style={{
                    height: `${(c / max) * 100}%`,
                    background: `color-mix(in oklab, ${fill} ${near ? 78 : 38}%, transparent)`,
                    "--i": Math.min(i, 30),
                  } as CSSProperties}
                />
              </li>
            );
          })}
        </ul>
        {marker != null ? (
          <div
            data-motion-mark
            className="pointer-events-none absolute bottom-0 top-0 w-0.5"
            style={{
              left: `${marker}%`,
              background: accent,
              boxShadow: `0 0 0 2px color-mix(in oklab, ${accent} 35%, transparent)`,
              "--mark-from": "0%",
            } as CSSProperties}
            aria-hidden
          />
        ) : null}
      </div>
    </figure>
  );
}

export function PlayerContextScatter({
  title,
  question,
  points,
  xLabel,
  yLabel,
}: {
  title: string;
  question: string;
  points: Array<{ x: number; y: number; highlight?: boolean; label?: string }>;
  xLabel: string;
  yLabel: string;
}) {
  if (points.length < 2) {
    return (
      <figure className="sports-card sports-card-subtle glass-text-scrim p-3 sm:p-4">
        <figcaption className="text-[15px] font-bold tracking-tight">{title}</figcaption>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Insufficient league context for scatter.
        </p>
      </figure>
    );
  }
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = 320;
  const h = 220;
  const pad = 28;
  return (
    <figure className="sports-card sports-card-subtle glass-text-scrim p-3 sm:p-4">
      <figcaption className="text-[15px] font-bold tracking-tight">{title}</figcaption>
      <p className="mt-0.5 text-[12px] text-muted-foreground">{question}</p>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="mt-3 h-[200px] w-full"
        role="img"
        aria-label={title}
        data-hover-svg
      >
        <text x={w / 2} y={h - 4} textAnchor="middle" fontSize={10} fill="currentColor" opacity={0.6}>
          {xLabel}
        </text>
        <text
          x={10}
          y={h / 2}
          textAnchor="middle"
          fontSize={10}
          fill="currentColor"
          opacity={0.6}
          transform={`rotate(-90 10 ${h / 2})`}
        >
          {yLabel}
        </text>
        {points.map((p, i) => {
          const cx =
            pad +
            ((p.x - minX) / (maxX - minX || 1)) * (w - pad * 2);
          const cy =
            h -
            pad -
            ((p.y - minY) / (maxY - minY || 1)) * (h - pad * 2);
          return (
            <circle
              key={i}
              data-motion-dot={p.highlight ? "focus" : "field"}
              data-hover-point
              data-tip={p.label}
              data-tip-sub={`${fmt(p.x)} ${xLabel} · ${fmt(p.y <= 1 ? p.y * 100 : p.y)} ${yLabel}`}
              cx={cx}
              cy={cy}
              r={p.highlight ? 5.5 : 2.5}
              fill={p.highlight ? "var(--chart-1)" : "var(--chart-5)"}
              fillOpacity={p.highlight ? 1 : 0.45}
              stroke={p.highlight ? "var(--background)" : "transparent"}
              strokeWidth={p.highlight ? 2 : 8}
            />
          );
        })}
      </svg>
    </figure>
  );
}

export function PlayerCareerArcChart({
  title,
  points,
  selectedSeason,
  peakSeason,
}: {
  title: string;
  points: Array<{
    season: string;
    value: number | null;
    teamAbbr: string;
    href: string;
  }>;
  selectedSeason: string;
  peakSeason: string | null;
}) {
  const usable = points.filter((p) => p.value != null) as Array<{
    season: string;
    value: number;
    teamAbbr: string;
    href: string;
  }>;
  if (!usable.length) {
    return (
      <figure className="sports-card sports-card-subtle p-3">
        <figcaption className="text-[13px] font-semibold">{title}</figcaption>
        <p className="mt-1 text-[12px] text-muted-foreground">No arc data.</p>
      </figure>
    );
  }
  const ys = usable.map((p) => p.value);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const w = 720;
  const h = 180;
  const pad = 16;
  const coords = usable.map((p, i) => {
    const x = pad + (i * (w - pad * 2)) / Math.max(1, usable.length - 1);
    const y = h - pad - ((p.value - min) / span) * (h - pad * 2);
    return { ...p, cx: x, cy: y };
  });
  const path = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.cx.toFixed(1)},${c.cy.toFixed(1)}`)
    .join(" ");
  const column = (w - pad * 2) / Math.max(1, usable.length - 1);

  return (
    <figure className="sports-card sports-card-subtle p-3">
      <figcaption className="text-[13px] font-semibold">{title}</figcaption>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        How did this player evolve? Team labels mark franchise changes.
      </p>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-[160px] w-full" role="img" aria-label={title} data-hover-svg>
        <path d={path} pathLength={1} data-motion-line fill="none" stroke="currentColor" strokeWidth={2} opacity={0.85} />
        {coords.map((c, i) => {
          const detail = `${fmt(c.value)}${c.season === peakSeason ? " · peak" : ""}${
            c.season === selectedSeason ? " · this season" : ""
          }`;
          return (
            <a
              key={c.season}
              href={c.href}
              aria-label={`${c.season} ${c.teamAbbr}: ${detail}`}
              data-hover-point
              data-tip={`${c.season} · ${c.teamAbbr}`}
              data-tip-sub={detail}
            >
              <HoverPoint
                cx={c.cx}
                cy={c.cy}
                r={c.season === selectedSeason || c.season === peakSeason ? 5 : 3}
                column={column}
                height={h}
                index={i}
                opacity={c.season === selectedSeason ? 1 : 0.75}
              />
            </a>
          );
        })}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        {coords.map((c) => (
          <li key={c.season}>
            <Link href={c.href} prefetch={false} className="hover:underline">
              {c.season.slice(2)} {c.teamAbbr}
            </Link>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function PlayerGameHighTimeline({
  title,
  events,
}: {
  title: string;
  events: Array<{
    label: string;
    value: string;
    date: string;
    href: string;
    result?: string;
    tied?: number;
  }>;
}) {
  const featured = events.slice(0, 3);
  const rest = events.slice(3);

  return (
    <div className="flex flex-col gap-3" aria-label={title}>
      <p className="text-[12px] text-muted-foreground">
        Biggest nights by category. Open a tile for the game board.
      </p>
      <div
        data-hover-group
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
      >
        {featured.map((e, i) => (
          <Link
            key={e.label + e.date}
            href={e.href}
            prefetch={false}
            data-motion-item
            data-hover-item
            data-stat-tile
            style={{ "--i": i } as CSSProperties}
            className="sports-card sports-card-subtle flex flex-col gap-1.5 p-3 transition-[transform,box-shadow] hover:-translate-y-0.5"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {e.label}
            </span>
            <span className="text-[28px] font-bold tabular-nums leading-none tracking-tight sm:text-[32px]">
              {e.value}
            </span>
            <span className="text-[12px] text-muted-foreground">{e.date}</span>
            {e.result ? (
              <span className="text-[11px] font-medium tabular-nums text-foreground/80">
                {e.result}
                {e.tied && e.tied > 0 ? ` · ${e.tied + 1} tied` : ""}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
      {rest.length > 0 ? (
        <div
          data-hover-group
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
        >
          {rest.map((e, i) => (
            <Link
              key={e.label + e.date}
              href={e.href}
              prefetch={false}
              data-motion-item
              data-hover-item
              data-stat-tile
              style={{ "--i": i + 3 } as CSSProperties}
              className="sports-card sports-card-subtle flex flex-col gap-1 p-2.5 transition-[transform,box-shadow] hover:-translate-y-0.5"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {e.label}
              </span>
              <span className="text-[22px] font-bold tabular-nums leading-none tracking-tight">
                {e.value}
              </span>
              <span className="truncate text-[11px] text-muted-foreground">
                {e.date}
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

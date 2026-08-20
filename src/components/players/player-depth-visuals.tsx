/**
 * Lightweight SSR-safe player analytics visuals (P18C.1.3).
 * Prefer SVG over heavy chart clients for tab HTML budgets.
 */

import Link from "next/link";

import { cn } from "@/lib/utils";

function fmt(n: number, digits = 1): string {
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
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
      <figure className="rounded-md border border-border p-3">
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
  const avgY =
    seasonAvg != null
      ? h - pad - ((seasonAvg - min) / span) * (h - pad * 2)
      : null;

  return (
    <figure
      className="rounded-md border border-border p-3"
      aria-label={title}
    >
      <figcaption className="text-[13px] font-semibold">{title}</figcaption>
      <p className="mt-0.5 text-[12px] text-muted-foreground">{question}</p>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="mt-3 h-[140px] w-full"
        role="img"
        aria-label={`${title} trend chart`}
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
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          opacity={0.85}
        />
        {coords.map((c) => {
          const href = c.href ?? hrefForPoint?.(c) ?? null;
          const circle = (
            <circle
              key={c.x + String(c.cx)}
              cx={c.cx}
              cy={c.cy}
              r={3}
              fill="currentColor"
            />
          );
          return href ? (
            <a key={c.x + c.cx} href={href} aria-label={c.label ?? c.x}>
              {circle}
            </a>
          ) : (
            circle
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
    <figure className="rounded-md border border-border p-3">
      <figcaption className="text-[13px] font-semibold">{title}</figcaption>
      <p className="mt-0.5 text-[12px] text-muted-foreground">{question}</p>
      <ul className="mt-3 flex h-[120px] items-end gap-1" role="img" aria-label={title}>
        {bins.map((b) => (
          <li
            key={b.label}
            className="flex flex-1 flex-col items-center justify-end gap-1"
            title={`${b.label}: ${b.count}`}
          >
            <span className="text-[9px] tabular-nums text-muted-foreground">
              {b.count || ""}
            </span>
            <div
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
    <figure className="rounded-md border border-border p-3">
      <figcaption className="text-[13px] font-semibold">{title}</figcaption>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        Marker = league percentile in the same season (qualified peers).
      </p>
      <ul className="mt-3 flex flex-col gap-3">
        {rows.map((r) => {
          const p = r.percentile;
          const left = p == null ? null : Math.max(2, Math.min(98, p));
          return (
            <li key={r.label} className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-2">
              <span className="text-[12px] font-medium">{r.label}</span>
              <div
                className="relative h-2 rounded-full bg-muted"
                role="img"
                aria-label={
                  p == null
                    ? `${r.label} ${r.valueLabel}`
                    : `${r.label} ${r.valueLabel}, ${p}th percentile`
                }
              >
                {left != null ? (
                  <span
                    className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
                    style={{ left: `${left}%` }}
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] text-muted-foreground">
                    n/a
                  </span>
                )}
              </div>
              <span className="text-right text-[12px] tabular-nums">
                {r.valueLabel}
                {p != null ? (
                  <span className="ml-1 text-[10px] text-muted-foreground">
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
    <figure className="rounded-md border border-border p-3">
      <figcaption className="text-[13px] font-semibold">{title}</figcaption>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        Difference vs season baseline (per game / rate). Sample size shown.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-[12px]">
          <thead className="border-b border-border text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5">Split</th>
              <th className="px-2 py-1.5 text-right">G</th>
              <th className="px-2 py-1.5 text-right">MIN</th>
              {metrics.map((m) => (
                <th key={m} className="px-2 py-1.5 text-right">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="px-2 py-1.5 font-semibold">{r.label}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.games}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {fmt(r.minutes, 0)}
                </td>
                {metrics.map((m) => {
                  const d = r.deltas[m];
                  const isPct = m.includes("%");
                  const label =
                    d == null
                      ? "—"
                      : `${d > 0 ? "+" : ""}${(isPct ? d * 100 : d).toFixed(
                          isPct ? 1 : 1
                        )}${isPct ? "pp" : ""}`;
                  return (
                    <td
                      key={m}
                      className={cn(
                        "px-2 py-1.5 text-right tabular-nums",
                        d != null && d > 0 && "text-emerald-700 dark:text-emerald-400",
                        d != null && d < 0 && "text-rose-700 dark:text-rose-400"
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
    </figure>
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
    <figure className="rounded-md border border-border p-3">
      <figcaption className="text-[13px] font-semibold">{title}</figcaption>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        {metricLabel} vs season average · sorted best → worst · G shown
      </p>
      <ul className="mt-3 flex max-h-80 flex-col gap-1.5 overflow-y-auto">
        {rows.map((r) => {
          const width = (Math.abs(r.delta) / maxAbs) * 50;
          const positive = r.delta >= 0;
          return (
            <li
              key={r.label}
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
                  className={cn(
                    "absolute inset-y-0 rounded-sm",
                    positive ? "left-1/2 bg-foreground/70" : "right-1/2 bg-foreground/40"
                  )}
                  style={{ width: `${width}%` }}
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
    <figure className="rounded-md border border-border p-3">
      <figcaption className="text-[13px] font-semibold">{title}</figcaption>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        How often (bar) + how well (dot) — league baseline marker when available.
      </p>
      <ul className="mt-3 flex flex-col gap-3">
        {slices.map((s) => (
          <li key={s.label} className="grid grid-cols-[5.5rem_1fr_4rem] items-center gap-2">
            <span className="text-[12px] font-medium">
              {s.label}
              <span className="block text-[10px] font-normal text-muted-foreground">
                {s.attempts} att
              </span>
            </span>
            <div className="relative h-3 rounded-sm bg-muted">
              <div
                className="absolute inset-y-0 left-0 rounded-sm bg-foreground/70"
                style={{ width: `${Math.max(2, s.share * 100)}%` }}
              />
              {s.accuracy != null ? (
                <span
                  className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background bg-foreground"
                  style={{ left: `${Math.max(2, Math.min(98, s.accuracy * 100))}%` }}
                  title={`FG% ${(s.accuracy * 100).toFixed(1)}`}
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
}: {
  title: string;
  valueLabel: string;
  percentile: number | null;
  bins: number[];
}) {
  const max = Math.max(1, ...bins);
  const marker = percentile == null ? null : Math.max(0, Math.min(100, percentile));
  return (
    <figure className="rounded-md border border-border p-3">
      <figcaption className="text-[13px] font-semibold">{title}</figcaption>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        League distribution with player marker (same-season qualified peers).
      </p>
      <p className="mt-2 text-[20px] font-bold tabular-nums">{valueLabel}</p>
      {percentile != null ? (
        <p className="text-[12px] text-muted-foreground">{percentile}th percentile</p>
      ) : null}
      <div className="relative mt-3 h-[72px]">
        <ul className="flex h-full items-end gap-0.5" role="img" aria-label={title}>
          {bins.map((c, i) => (
            <li
              key={i}
              className="flex-1 rounded-t-sm bg-muted-foreground/40"
              style={{ height: `${(c / max) * 100}%` }}
            />
          ))}
        </ul>
        {marker != null ? (
          <div
            className="absolute bottom-0 top-0 w-0.5 bg-foreground"
            style={{ left: `${marker}%` }}
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
      <figure className="rounded-md border border-border p-3">
        <figcaption className="text-[13px] font-semibold">{title}</figcaption>
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
    <figure className="rounded-md border border-border p-3">
      <figcaption className="text-[13px] font-semibold">{title}</figcaption>
      <p className="mt-0.5 text-[12px] text-muted-foreground">{question}</p>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="mt-3 h-[200px] w-full"
        role="img"
        aria-label={title}
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
              cx={cx}
              cy={cy}
              r={p.highlight ? 5 : 2.5}
              fill="currentColor"
              opacity={p.highlight ? 1 : 0.35}
            >
              {p.label ? <title>{p.label}</title> : null}
            </circle>
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
      <figure className="rounded-md border border-border p-3">
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

  return (
    <figure className="rounded-md border border-border p-3">
      <figcaption className="text-[13px] font-semibold">{title}</figcaption>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        How did this player evolve? Team labels mark franchise changes.
      </p>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-[160px] w-full" role="img" aria-label={title}>
        <path d={path} fill="none" stroke="currentColor" strokeWidth={2} opacity={0.85} />
        {coords.map((c) => (
          <a key={c.season} href={c.href}>
            <circle
              cx={c.cx}
              cy={c.cy}
              r={c.season === selectedSeason || c.season === peakSeason ? 5 : 3}
              fill="currentColor"
              opacity={c.season === selectedSeason ? 1 : 0.75}
            >
              <title>
                {c.season} {c.teamAbbr}: {fmt(c.value)}
              </title>
            </circle>
          </a>
        ))}
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
  }>;
}) {
  return (
    <figure className="rounded-md border border-border p-3">
      <figcaption className="text-[13px] font-semibold">{title}</figcaption>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        Biggest nights by category — open the game for flow / shots / PBP.
      </p>
      <ol className="relative mt-4 space-y-3 border-l border-border pl-4">
        {events.map((e) => (
          <li key={e.label + e.date} className="relative">
            <span className="absolute -left-[1.15rem] top-1.5 h-2.5 w-2.5 rounded-full bg-foreground" />
            <Link
              href={e.href}
              prefetch={false}
              className="flex flex-wrap items-baseline justify-between gap-2 text-[13px] hover:underline"
            >
              <span className="font-semibold">
                {e.label} {e.value}
              </span>
              <span className="text-muted-foreground">{e.date}</span>
            </Link>
          </li>
        ))}
      </ol>
    </figure>
  );
}

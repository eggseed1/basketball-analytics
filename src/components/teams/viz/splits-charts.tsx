import type { CSSProperties } from "react";

import { TransitionLink } from "@/components/continuity/query-nav";
import { type } from "@/lib/design-system";
import { formatNumber, formatPct } from "@/lib/format";
import type { TeamSplitBucket } from "@/lib/team-snapshot-games";
import type { TeamScheduleRow } from "@/lib/team-schedule";
import { cn } from "@/lib/utils";

import { LegendSwatch, LOSS, signed, VizCard, WIN } from "./viz-kit";

/**
 * Splits tab hero: one column per month, one square per game stacked from
 * the month's first game at the bottom, so hot and cold stretches stand out.
 */
export function SplitsMonthWaffle({
  rows,
  months,
  season,
  teamKey,
}: {
  rows: TeamScheduleRow[];
  months: TeamSplitBucket[];
  season: string;
  teamKey: string;
}) {
  const games = rows.filter(
    (r) => r.phase === "regular" && r.countsInRecord && r.result && r.teamScore != null && r.oppScore != null
  );
  if (games.length < 3) return null;
  const columns: Array<{ key: string; label: string; games: TeamScheduleRow[] }> = [];
  for (const g of games) {
    const last = columns[columns.length - 1];
    if (last && last.key === g.monthKey) last.games.push(g);
    else columns.push({ key: g.monthKey, label: g.monthLabel, games: [g] });
  }
  const tallest = Math.max(...columns.map((c) => c.games.length));
  const bucketFor = (label: string) =>
    months.find((m) => m.label.toLowerCase().startsWith(label.slice(0, 3).toLowerCase()) && m.label.includes(label.slice(-4)));

  return (
    <VizCard
      title="Month by month"
      accentKey={teamKey}
      subtitle={`Each square is a ${season} regular-season game, stacked from the first game of the month at the bottom. The number under each month is its average margin.`}
      aside={
        <div className="flex flex-wrap gap-3">
          <LegendSwatch color={WIN} label="Win" />
          <LegendSwatch color={LOSS} label="Loss" />
        </div>
      }
    >
      <div className="touch-scroll-x overflow-x-auto">
        <div
          className="grid min-w-max items-end gap-x-3 sm:gap-x-5"
          style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(2.25rem, 1fr))` }}
        >
          {columns.map((col, ci) => {
            const w = col.games.filter((g) => g.result === "W").length;
            const bucket = bucketFor(col.label);
            const margin =
              col.games.reduce((s, g) => s + ((g.teamScore as number) - (g.oppScore as number)), 0) /
              col.games.length;
            return (
              <div key={col.key} className="flex flex-col items-center gap-1.5">
                <div
                  className="flex flex-col-reverse gap-[3px]"
                  style={{ height: `calc(${tallest} * (0.85rem + 3px))` }}
                >
                  {col.games.map((g, gi) => (
                    <TransitionLink
                      key={g.id}
                      href={`/games/${encodeURIComponent(g.id)}?season=${encodeURIComponent(g.season)}`}
                      data-viz-mark
                      data-motion-dot
                      data-tip={`${g.dateLabel} · ${g.result} ${g.teamScore}-${g.oppScore}`}
                      data-tip-sub={`${g.home ? "vs" : "at"} ${g.oppAbbr} · margin ${signed((g.teamScore as number) - (g.oppScore as number), 0)}`}
                      aria-label={`${g.dateLabel}, ${g.result === "W" ? "win" : "loss"} ${g.home ? "versus" : "at"} ${g.oppAbbr}`}
                      className="block h-[0.85rem] w-8 rounded-[3px] sm:w-10"
                      style={
                        {
                          background: g.result === "W" ? WIN : LOSS,
                          "--viz-lift": 1.25,
                          "--i": ci * 3 + gi,
                        } as CSSProperties
                      }
                    />
                  ))}
                </div>
                <span
                  className={cn(type.caption, "font-semibold")}
                  data-tip={`${col.label}: ${w}-${col.games.length - w}`}
                  data-tip-sub={
                    bucket?.ppg != null && bucket.oppPpg != null
                      ? `${formatNumber(bucket.ppg, 1)} scored · ${formatNumber(bucket.oppPpg, 1)} allowed per game`
                      : undefined
                  }
                >
                  {col.label.slice(0, 3)}
                </span>
                <span className={cn(type.micro, "tabular-nums text-muted-foreground")}>
                  {w}-{col.games.length - w}
                </span>
                <span
                  className={cn(type.micro, "font-bold tabular-nums")}
                  style={{ color: margin >= 0 ? WIN : LOSS }}
                >
                  {signed(margin)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </VizCard>
  );
}

type Metric = {
  label: string;
  home: number | null;
  away: number | null;
  format: (v: number) => string;
  /** Lower is better (points allowed). */
  invert?: boolean;
  /** Zero-centered (margin). */
  signedScale?: boolean;
};

const HOME = "var(--viz-accent)";
const AWAY = "var(--chart-4)";

/**
 * Home and road side by side: each metric grows out from the middle, home to
 * the left and road to the right. A check marks the better side.
 */
export function HomeAwayMirror({
  home,
  away,
  teamKey,
}: {
  home: TeamSplitBucket | undefined;
  away: TeamSplitBucket | undefined;
  teamKey: string;
}) {
  if (!home?.games || !away?.games) return null;
  const pct = (b: TeamSplitBucket) => (b.wins + b.losses ? b.wins / (b.wins + b.losses) : null);
  const metrics: Metric[] = [
    { label: "Win%", home: pct(home), away: pct(away), format: (v) => formatPct(v, 0) },
    { label: "Scored", home: home.ppg, away: away.ppg, format: (v) => formatNumber(v, 1) },
    { label: "Allowed", home: home.oppPpg, away: away.oppPpg, format: (v) => formatNumber(v, 1), invert: true },
    { label: "Margin", home: home.diff, away: away.diff, format: (v) => signed(v), signedScale: true },
  ];

  return (
    <VizCard
      title="Home and away"
      accentKey={teamKey}
      subtitle={`${home.wins}-${home.losses} at home, ${away.wins}-${away.losses} on the road. A check marks the better side of each row.`}
    >
      <div className="flex flex-col gap-2">
        <div className={cn(type.micro, "grid grid-cols-[minmax(0,1fr)_5rem_minmax(0,1fr)] font-semibold uppercase tracking-wide text-muted-foreground")}>
          <span className="flex items-center justify-end gap-1.5">Home <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: HOME }} /></span>
          <span />
          <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: AWAY }} /> Away</span>
        </div>
        {metrics.map((m, i) => {
          if (m.home == null || m.away == null) return null;
          const scale = m.signedScale
            ? Math.max(Math.abs(m.home), Math.abs(m.away), 1)
            : Math.max(m.home, m.away) || 1;
          const width = (v: number) => Math.abs(v) / scale;
          const homeBetter = m.invert ? m.home < m.away : m.home > m.away;
          const tie = m.home === m.away;
          const check = (better: boolean) =>
            better && !tie ? <span aria-label="better" className="text-[var(--data-positive)]">✓</span> : null;
          return (
            <div key={m.label} data-viz-row className="grid grid-cols-[minmax(0,1fr)_5rem_minmax(0,1fr)] items-center gap-2 rounded-md py-1">
              <div className="flex items-center justify-end gap-2">
                {check(homeBetter)}
                <span className={cn(type.bodySm, "font-semibold tabular-nums")}>{m.format(m.home)}</span>
                <span
                  data-viz-bar
                  data-motion-bar="x"
                  data-tip={`Home ${m.label.toLowerCase()}: ${m.format(m.home)}`}
                  data-tip-sub={`Away ${m.format(m.away)}`}
                  className="h-5 rounded-l-md"
                  style={{ width: `calc((100% - 4.5rem) * ${width(m.home)})`, background: HOME, transformOrigin: "right", "--i": i } as CSSProperties}
                />
              </div>
              <span data-viz-label className={cn(type.caption, "text-center font-semibold text-muted-foreground")}>
                {m.label}
              </span>
              <div className="flex items-center gap-2">
                <span
                  data-viz-bar
                  data-motion-bar="x"
                  data-tip={`Away ${m.label.toLowerCase()}: ${m.format(m.away)}`}
                  data-tip-sub={`Home ${m.format(m.home)}`}
                  className="h-5 rounded-r-md"
                  style={{ width: `calc((100% - 4.5rem) * ${width(m.away)})`, background: AWAY, "--i": i } as CSSProperties}
                />
                <span className={cn(type.bodySm, "font-semibold tabular-nums")}>{m.format(m.away)}</span>
                {check(!homeBetter)}
              </div>
            </div>
          );
        })}
      </div>
    </VizCard>
  );
}

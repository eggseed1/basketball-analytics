import type { CSSProperties } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
import { ColumnPlot } from "@/components/learn/salary-guide-charts";
import type {
  DrblCarryoverBucket,
  DrblGuidePlayer,
  DrblGuideSnapshot,
  DrblOutcomeTest,
} from "@/data/runtime/drbl-guide";
import { nbaTeamAbbr } from "@/data/providers/nba/nba-team-meta";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

const POSITIVE = "var(--chart-3)";
const NEGATIVE = "var(--destructive)";
const DRBL = "var(--chart-1)";
const PBP = "color-mix(in oklab, var(--foreground) 38%, transparent)";

const signed = (v: number, digits = 2) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;
const pctOf = (value: number, low: number, high: number) => ((value - low) / (high - low || 1)) * 100;

export function LegendDot({ color, label, hollow = false }: { color: string; label: string; hollow?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block size-2.5 rounded-full"
        style={hollow ? { border: `2px solid ${color}` } : { background: color }}
      />
      {label}
    </span>
  );
}

// ---- Spread

/** How regular players spread out around zero in one season. */
export function DrblSpreadChart({ distribution }: { distribution: DrblGuideSnapshot["distribution"] }) {
  const max = Math.max(...distribution.bins.map((b) => b.players), 1);
  return (
    <figure className="flex flex-col gap-2">
      <ol className="flex h-48 items-end gap-[3px]" aria-label={`DRBL/100 spread for ${distribution.players} players in ${distribution.season}`}>
        {distribution.bins.map((b, i) => {
          const good = b.from >= 0;
          return (
            <li
              key={b.from}
              data-hover-item
              data-tip={`${signed(b.from, 1)} to ${signed(b.to, 1)}`}
              data-tip-sub={`${b.players} ${b.players === 1 ? "player" : "players"}`}
              className="relative flex h-full min-w-0 flex-1 flex-col justify-end"
            >
              <span
                data-motion-bar="y"
                data-tip-anchor
                className="block w-full rounded-t-sm"
                style={
                  {
                    height: `${(b.players / max) * 100}%`,
                    minHeight: b.players ? 2 : 0,
                    background: good ? POSITIVE : NEGATIVE,
                    opacity: 0.8,
                    "--i": i,
                  } as CSSProperties
                }
              />
              {b.from === 0 ? <span aria-hidden className="absolute inset-y-0 left-0 w-px bg-foreground/60" /> : null}
            </li>
          );
        })}
      </ol>
      <div className={cn(type.micro, "flex justify-between text-muted-foreground tabular-nums")}>
        <span>{signed(distribution.bins[0]?.from ?? 0, 1)}</span>
        <span className="font-semibold text-foreground">0 = average</span>
        <span>{signed(distribution.bins.at(-1)?.to ?? 0, 1)}</span>
      </div>
      <p className={cn(type.caption, "text-muted-foreground")}>
        Players with at least {distribution.minPossessions.toLocaleString()} possessions in {distribution.season}, in
        half-point bins. Hover a bar for the count.
      </p>
    </figure>
  );
}

// ---- Play-by-play rate to DRBL/100

/** Each player's play-by-play rate (hollow) and the published DRBL/100 (filled). */
export function BlendDumbbells({ rows, label }: { rows: DrblGuidePlayer[]; label: string }) {
  const values = rows.flatMap((r) => [r.drbl100, r.pbp100 ?? r.drbl100]);
  const low = Math.min(0, Math.floor(Math.min(...values)));
  const high = Math.max(0, Math.ceil(Math.max(...values)));
  const ticks = Array.from({ length: high - low + 1 }, (_, i) => low + i);
  const at = (v: number) => `${pctOf(v, low, high)}%`;
  return (
    <figure className="flex flex-col gap-2">
      <ol className="flex flex-col gap-1.5" aria-label={label}>
        <li aria-hidden className="grid grid-cols-[9rem_minmax(0,1fr)_3.5rem] gap-2 sm:grid-cols-[12rem_minmax(0,1fr)_4rem]">
          <span />
          <span className="relative h-4">
            {ticks.map((t) => (
              <span key={t} className={cn(type.micro, "absolute -translate-x-1/2 text-muted-foreground tabular-nums")} style={{ left: at(t) }}>
                {t === 0 ? "0" : signed(t, 0)}
              </span>
            ))}
          </span>
          <span />
        </li>
        {rows.map((r, i) => {
          const from = r.pbp100 ?? r.drbl100;
          const up = r.drbl100 >= from;
          return (
            <li
              key={r.id}
              data-hover-item
              data-tip={r.name}
              data-tip-sub={`Play-by-play ${signed(from)} · DRBL/100 ${signed(r.drbl100)} · ${r.possessions.toLocaleString()} possessions`}
              className="grid grid-cols-[9rem_minmax(0,1fr)_3.5rem] items-center gap-2 sm:grid-cols-[12rem_minmax(0,1fr)_4rem]"
            >
              <a href={`/players/${r.id}`} className={cn(type.caption, "flex min-w-0 items-center gap-1.5 font-semibold underline-offset-4 hover:underline")}>
                <TeamLogo teamKey={nbaTeamAbbr(r.teamId).toLowerCase()} size="xs" />
                <span className="truncate">{r.name}</span>
              </a>
              <span className="relative h-5">
                {ticks.map((t) => (
                  <span
                    key={t}
                    aria-hidden
                    className={cn("absolute inset-y-0 w-px", t === 0 ? "bg-foreground/45" : "bg-border/50")}
                    style={{ left: at(t) }}
                  />
                ))}
                <span
                  aria-hidden
                  data-tip-anchor
                  data-motion-bar="x"
                  className="absolute top-1/2 h-0.5 -translate-y-1/2"
                  style={
                    {
                      left: at(Math.min(from, r.drbl100)),
                      width: `${Math.abs(pctOf(r.drbl100, low, high) - pctOf(from, low, high))}%`,
                      background: up ? POSITIVE : NEGATIVE,
                      "--i": i,
                    } as CSSProperties
                  }
                />
                <span
                  aria-hidden
                  className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background"
                  style={{ left: at(from), border: `2px solid ${PBP}` }}
                />
                <span
                  aria-hidden
                  className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ left: at(r.drbl100), background: DRBL }}
                />
              </span>
              <span className={cn(type.caption, "text-right font-semibold tabular-nums")}>{signed(r.drbl100)}</span>
            </li>
          );
        })}
      </ol>
      <div className={cn(type.caption, "flex flex-wrap gap-4 text-muted-foreground")}>
        <LegendDot color={PBP} label="Play-by-play rate" hollow />
        <LegendDot color={DRBL} label="DRBL/100" />
      </div>
    </figure>
  );
}

// ---- Scale by games

export function CalibrationColumns({
  points,
  seasonGames,
}: {
  points: ReadonlyArray<{ games: number; calibration: number }>;
  seasonGames: number;
}) {
  const nearest = points.reduce((best, p) => (Math.abs(p.games - seasonGames) < Math.abs(best.games - seasonGames) ? p : best), points[0]!);
  return (
    <figure className="flex flex-col gap-2">
      <ColumnPlot
        label="Scale applied to DRBL/100 by games played league-wide"
        max={1}
        rule={1}
        columns={points.map((p) => ({
          key: String(p.games),
          value: p.calibration,
          top: p.calibration.toFixed(2),
          below: [`${p.games.toLocaleString()} games`, p.games === nearest.games ? "about a full season" : `${Math.round((p.games / 1230) * 82)} per team`],
          tip: `${p.games.toLocaleString()} league games: scale ${p.calibration.toFixed(2)}`,
          tipSub: `About ${Math.round((p.games / 1230) * 82)} games per team`,
          color: `color-mix(in oklab, ${DRBL} ${p.games === nearest.games ? 85 : 55}%, transparent)`,
        }))}
      />
      <p className={cn(type.caption, "text-muted-foreground")}>
        The dashed line is 1.00, where a rating would be taken at face value. Each bar was fit on earlier seasons by
        checking how far apart final margins really landed.
      </p>
    </figure>
  );
}

// ---- Paired bars (carryover, outcome test)

type PairRow = { key: string; label: string; sub: string; a: number; b: number; tip: string };

function PairedBars({
  rows,
  aLabel,
  bLabel,
  max,
  format,
  label,
}: {
  rows: PairRow[];
  aLabel: string;
  bLabel: string;
  max: number;
  format: (v: number) => string;
  label: string;
}) {
  return (
    <figure className="flex flex-col gap-2">
      <ol className="flex flex-col gap-3" aria-label={label}>
        {rows.map((r, i) => (
          <li
            key={r.key}
            data-hover-item
            data-tip={r.label}
            data-tip-sub={r.tip}
            className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]"
          >
            <span className="flex flex-col">
              <span className={cn(type.caption, "font-semibold tabular-nums")}>{r.label}</span>
              <span className={cn(type.micro, "text-muted-foreground")}>{r.sub}</span>
            </span>
            <span className="flex flex-col gap-1">
              {[
                { v: r.a, color: PBP, name: aLabel },
                { v: r.b, color: DRBL, name: bLabel },
              ].map((bar, j) => (
                <span key={bar.name} className="flex items-center gap-2">
                  <span className="relative h-3.5 flex-1">
                    <span
                      data-motion-bar="x"
                      data-tip-anchor={j === 1 ? true : undefined}
                      className="absolute inset-y-0 left-0 rounded-sm"
                      style={{ width: `${(Math.max(0, bar.v) / max) * 100}%`, background: bar.color, "--i": i * 2 + j } as CSSProperties}
                    />
                  </span>
                  <span className={cn(type.micro, "w-12 text-right font-semibold tabular-nums")}>{format(bar.v)}</span>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ol>
      <div className={cn(type.caption, "flex flex-wrap gap-4 text-muted-foreground")}>
        <LegendDot color={PBP} label={aLabel} />
        <LegendDot color={DRBL} label={bLabel} />
      </div>
    </figure>
  );
}

export function OutcomeTestChart({ tests }: { tests: DrblOutcomeTest[] }) {
  const max = Math.max(...tests.flatMap((t) => [t.pbpR2, t.blendR2])) * 1.1;
  return (
    <PairedBars
      label="Share of final-margin swings explained, play-by-play rate against DRBL/100"
      aLabel="Play-by-play rate alone"
      bLabel="DRBL/100"
      max={max}
      format={(v) => `${(v * 100).toFixed(1)}%`}
      rows={tests.map((t) => ({
        key: `${t.kind}-${t.label}`,
        label: t.label,
        sub: `${t.games.toLocaleString()} games`,
        a: t.pbpR2,
        b: t.blendR2,
        tip: `Typical miss: ${t.pbpRmse.toFixed(1)} points with the play-by-play rate, ${t.blendRmse.toFixed(1)} with DRBL/100, ${t.homeRmse.toFixed(1)} with home court alone`,
      }))}
    />
  );
}

export function CarryoverChart({ buckets }: { buckets: DrblCarryoverBucket[] }) {
  return (
    <PairedBars
      label="How closely this season's rating matches next season's, by possessions"
      aLabel="Play-by-play rate"
      bLabel="DRBL/100"
      max={1}
      format={(v) => v.toFixed(2)}
      rows={buckets.map((b) => ({
        key: b.label,
        label: b.label,
        sub: `${b.pairs.toLocaleString()} player seasons`,
        a: b.pbpToNextPbp,
        b: b.blendToNextBlend,
        tip: `Correlation with the next season: ${b.pbpToNextPbp.toFixed(2)} play-by-play, ${b.blendToNextBlend.toFixed(2)} DRBL/100`,
      }))}
    />
  );
}

// ---- DRBL/100 against WAR1

/** Every player last season: rate across, season total up. Bigger dots played more. */
export function DrblWar1Scatter({ scatter }: { scatter: DrblGuideSnapshot["scatter"] }) {
  const W = 640;
  const H = 380;
  const pad = { l: 44, r: 14, t: 12, b: 36 };
  const xs = scatter.points.map((p) => p[4]);
  const ys = scatter.points.map((p) => p[5]);
  const xLow = Math.floor(Math.min(...xs));
  const xHigh = Math.ceil(Math.max(...xs));
  const yLow = Math.floor(Math.min(0, ...ys));
  const yHigh = Math.ceil(Math.max(...ys));
  const maxPoss = Math.max(...scatter.points.map((p) => p[3]));
  const x = (v: number) => pad.l + ((v - xLow) / (xHigh - xLow)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - ((v - yLow) / (yHigh - yLow)) * (H - pad.t - pad.b);
  const labeled = new Set([
    ...[...scatter.points].sort((a, b) => b[5] - a[5]).slice(0, 3).map((p) => p[0]),
    ...[...scatter.points].sort((a, b) => b[4] - a[4]).slice(0, 1).map((p) => p[0]),
  ]);
  const labelLeft = (drbl: number) => x(drbl) > W * 0.7;
  const xTicks = Array.from({ length: xHigh - xLow + 1 }, (_, i) => xLow + i);
  const yStep = yHigh - yLow > 8 ? 2 : 1;
  const yTicks = Array.from({ length: Math.floor((yHigh - yLow) / yStep) + 1 }, (_, i) => yLow + i * yStep);

  return (
    <figure className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[540px]" role="img" aria-label={`DRBL/100 against WAR1 for ${scatter.points.length} players in ${scatter.season}`}>
          {yTicks.map((t) => (
            <g key={`y${t}`}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className={t === 0 ? "stroke-foreground/40" : "stroke-border/50"} strokeDasharray={t === 0 ? undefined : "3 6"} />
              <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">
                {t}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <g key={`x${t}`}>
              {t === 0 ? <line x1={x(0)} x2={x(0)} y1={pad.t} y2={H - pad.b} className="stroke-foreground/40" /> : null}
              <text x={x(t)} y={H - pad.b + 14} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                {t > 0 ? `+${t}` : t}
              </text>
            </g>
          ))}
          <text x={(pad.l + W - pad.r) / 2} y={H - 4} textAnchor="middle" className="fill-muted-foreground text-[10px] font-semibold">
            DRBL/100 (how good per possession)
          </text>
          <text x={12} y={(pad.t + H - pad.b) / 2} transform={`rotate(-90 12 ${(pad.t + H - pad.b) / 2})`} textAnchor="middle" className="fill-muted-foreground text-[10px] font-semibold">
            WAR1 (wins over the season)
          </text>
          {scatter.points.map(([id, name, , poss, drbl, war1]) => {
            const good = drbl >= 0;
            return (
              <a
                key={id}
                href={`/players/${id}`}
                data-tip={name}
                data-tip-sub={`DRBL/100 ${signed(drbl)} · WAR1 ${war1.toFixed(1)} · ${poss.toLocaleString()} possessions`}
                aria-label={`${name}: DRBL/100 ${signed(drbl)}, WAR1 ${war1.toFixed(1)}`}
              >
                <circle
                  cx={x(drbl)}
                  cy={y(war1)}
                  r={1.8 + 4.2 * Math.sqrt(poss / maxPoss)}
                  fill={good ? POSITIVE : NEGATIVE}
                  fillOpacity={0.45}
                  stroke={good ? POSITIVE : NEGATIVE}
                  strokeOpacity={0.85}
                  strokeWidth={0.8}
                />
              </a>
            );
          })}
          {scatter.points
            .filter((p) => labeled.has(p[0]))
            .map(([id, name, , , drbl, war1]) => (
              <text
                key={`l${id}`}
                x={x(drbl) + (labelLeft(drbl) ? -8 : 8)}
                y={y(war1) + 3}
                textAnchor={labelLeft(drbl) ? "end" : "start"}
                className="pointer-events-none fill-foreground text-[10px] font-semibold"
              >
                {name}
              </text>
            ))}
        </svg>
      </div>
      <p className={cn(type.caption, "text-muted-foreground")}>
        {scatter.points.length} players with at least {scatter.minPossessions.toLocaleString()} possessions in{" "}
        {scatter.season}. Bigger dots played more. Hover a dot for the numbers, or click it to open the player.
      </p>
    </figure>
  );
}

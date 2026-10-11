"use client";

import type { CompareShootingAverages } from "@/analytics/compare-player-context";
import {
  BAR_TRACK,
  SectionHeading,
  metricLabel,
  sideDisplay,
  sideValue,
  type DimensionMap,
} from "@/components/compare/compare-ui";
import { type } from "@/lib/design-system";
import { formatNumber, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

type Side = "a" | "b";

type SidesProps = {
  dims: DimensionMap;
  aName: string;
  bName: string;
  aColor: string;
  bColor: string;
  basisPhrase: string;
};

const MIX_PARTS = [
  { key: "twos", label: "2PT", opacity: 1 },
  { key: "threes", label: "3PT", opacity: 0.62 },
  { key: "fts", label: "FT", opacity: 0.32 },
] as const;

type Mix = { twos: number; threes: number; fts: number; total: number };

function pointsMix(dims: DimensionMap, side: Side): Mix | null {
  const fg2 = sideValue(dims, "fg2", side);
  const fg3 = sideValue(dims, "fg3", side);
  const ft = sideValue(dims, "ft", side);
  if (fg2 == null || fg3 == null || ft == null) return null;
  const twos = 2 * fg2;
  const threes = 3 * fg3;
  const total = twos + threes + ft;
  return total > 0 ? { twos, threes, fts: ft, total } : null;
}

/** Points by shot type, stacked on one scale so volume and mix both read. */
export function ScoringMix({
  dims,
  aName,
  bName,
  aColor,
  bColor,
  basisPhrase,
}: SidesProps) {
  const sides = [
    { side: "a" as const, name: aName, color: aColor, mix: pointsMix(dims, "a") },
    { side: "b" as const, name: bName, color: bColor, mix: pointsMix(dims, "b") },
  ];
  const peak = Math.max(...sides.map((s) => s.mix?.total ?? 0));
  if (!(peak > 0)) return null;

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="Scoring mix">
      <SectionHeading
        title="Scoring mix"
        caption={`Points ${basisPhrase} from twos, threes and free throws. Both bars share one scale.`}
      />
      <ul className="flex flex-col gap-4">
        {sides.map(({ side, name, color, mix }) => (
          <li key={side} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className={cn(type.caption, "truncate font-bold")}>{name}</span>
              <span className="text-lg font-black tabular-nums leading-none" style={{ color }}>
                {mix ? formatNumber(mix.total, 1) : "—"}
                <span className={cn(type.micro, "ml-1 font-semibold text-muted-foreground")}>
                  PTS
                </span>
              </span>
            </div>
            {mix ? (
              <div className={cn(BAR_TRACK, "flex h-6 gap-px")}>
                <div
                  data-motion-bar="x"
                  className="flex origin-left gap-px"
                  style={{ width: `${(mix.total / peak) * 100}%` }}
                >
                  {MIX_PARTS.map((part) => {
                    const value = mix[part.key];
                    const share = value / mix.total;
                    if (!(share > 0)) return null;
                    return (
                      <div
                        key={part.key}
                        className="relative flex h-full min-w-0 items-center justify-center overflow-hidden first:rounded-l-full last:rounded-r-full"
                        style={{ flexGrow: value, flexBasis: 0 }}
                        title={`${part.label}: ${formatNumber(value, 1)} points (${formatPct(share, 0)})`}
                      >
                        <span
                          aria-hidden
                          className="absolute inset-0"
                          style={{ background: color, opacity: part.opacity }}
                        />
                        {share >= 0.14 ? (
                          <span
                            className={cn(
                              type.micro,
                              "relative truncate px-1 font-bold tabular-nums",
                              part.opacity > 0.5 ? "text-white" : "text-foreground"
                            )}
                          >
                            {part.label} {formatNumber(value, 1)}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className={cn(type.caption, "text-muted-foreground")}>
                Shot types weren&apos;t tracked for this span, so the split is blank.
              </p>
            )}
            <p className={cn(type.micro, "tabular-nums text-muted-foreground")}>
              3PA rate {sideDisplay(dims, "threePar", side)} · FT rate{" "}
              {sideDisplay(dims, "ftr", side)} · TS% {sideDisplay(dims, "ts", side)}
            </p>
          </li>
        ))}
      </ul>
      <ul className={cn(type.micro, "flex flex-wrap gap-3 font-semibold text-muted-foreground")}>
        {MIX_PARTS.map((part) => (
          <li key={part.key} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-full bg-foreground"
              style={{ opacity: part.opacity }}
            />
            {part.label === "2PT" ? "Twos" : part.label === "3PT" ? "Threes" : "Free throws"}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Assists out to the right, turnovers to the left, AST/TO as the headline. */
export function Playmaking({
  dims,
  aName,
  bName,
  aColor,
  bColor,
  basisPhrase,
}: SidesProps) {
  const rows = (["a", "b"] as const).map((side) => ({
    side,
    name: side === "a" ? aName : bName,
    color: side === "a" ? aColor : bColor,
    ast: sideValue(dims, "ast", side),
    tov: sideValue(dims, "tov", side),
  }));
  const peak = Math.max(...rows.flatMap((r) => [r.ast ?? 0, r.tov ?? 0]));
  if (!(peak > 0)) return null;

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="Playmaking">
      <SectionHeading
        title="Playmaking"
        caption={`Assists against turnovers ${basisPhrase}. AST/TO is assists per turnover, so higher is safer.`}
      />
      <ul className="flex flex-col gap-4">
        {rows.map(({ side, name, color, ast, tov }) => (
          <li key={side} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className={cn(type.caption, "truncate font-bold")}>{name}</span>
              <span className="text-lg font-black tabular-nums leading-none" style={{ color }}>
                {sideDisplay(dims, "atr", side)}
                <span className={cn(type.micro, "ml-1 font-semibold text-muted-foreground")}>
                  {metricLabel("AST/TO")}
                </span>
              </span>
            </div>
            <div className="grid grid-cols-2 items-center gap-1">
              <div className="flex items-center gap-1.5">
                <span className={cn(type.micro, "w-12 shrink-0 text-right font-bold tabular-nums text-muted-foreground")}>
                  {tov != null ? `${formatNumber(tov, 1)} TOV` : "—"}
                </span>
                <div className={cn(BAR_TRACK, "flex h-3 flex-1 justify-end")}>
                  {tov != null ? (
                    <div
                      data-motion-bar="x"
                      className="h-full origin-right rounded-full bg-foreground/40"
                      style={{ width: `${(tov / peak) * 100}%` }}
                    />
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={cn(BAR_TRACK, "flex h-3 flex-1")}>
                  {ast != null ? (
                    <div
                      data-motion-bar="x"
                      className="h-full origin-left rounded-full"
                      style={{ width: `${(ast / peak) * 100}%`, background: color }}
                    />
                  ) : null}
                </div>
                <span className={cn(type.micro, "w-12 shrink-0 font-bold tabular-nums")}>
                  {ast != null ? `${formatNumber(ast, 1)} AST` : "—"}
                </span>
              </div>
            </div>
            <p className={cn(type.micro, "tabular-nums text-muted-foreground")}>
              AST% {sideDisplay(dims, "astPct", side)} · TOV%{" "}
              {sideDisplay(dims, "tovPct", side)} · USG% {sideDisplay(dims, "usg", side)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

const SPLIT_ROWS = [
  { id: "fgPct", label: "FG%", league: "fgPct" },
  { id: "fg2Pct", label: "2P%", league: "fg2Pct" },
  { id: "fg3Pct", label: "3P%", league: "fg3Pct" },
  { id: "ftPct", label: "FT%", league: "ftPct" },
  { id: "efg", label: "eFG%", league: "efg" },
  { id: "ts", label: "TS%", league: "ts" },
] as const;

/**
 * Dumbbells on a fixed 0-100% axis. A zoomed axis would make a one-point gap
 * look like a chasm.
 */
export function ShootingSplits({
  dims,
  aName,
  bName,
  aColor,
  bColor,
  leagueA,
  leagueB,
}: Omit<SidesProps, "basisPhrase"> & {
  leagueA: CompareShootingAverages | null;
  leagueB: CompareShootingAverages | null;
}) {
  const rows = SPLIT_ROWS.map((row) => ({
    ...row,
    a: sideValue(dims, row.id, "a"),
    b: sideValue(dims, row.id, "b"),
  })).filter((r) => r.a != null || r.b != null);
  if (!rows.length) return null;
  const sameLeague =
    leagueA && leagueB && leagueA.season === leagueB.season ? leagueA : null;
  const ticks = sameLeague
    ? [{ avg: sameLeague, color: "var(--foreground)" }]
    : [
        leagueA ? { avg: leagueA, color: aColor } : null,
        leagueB ? { avg: leagueB, color: bColor } : null,
      ].filter((t): t is { avg: CompareShootingAverages; color: string } => t != null);
  const pos = (v: number) => `${Math.max(0, Math.min(1, v)) * 100}%`;

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="Shooting splits">
      <SectionHeading
        title="Shooting splits"
        caption={
          ticks.length
            ? sameLeague
              ? `Each line runs from 0 to 100%. The tick is the ${sameLeague.season} average for players with 15+ games and 12+ minutes, weighted by attempts.`
              : "Each line runs from 0 to 100%. Ticks are each season's average for players with 15+ games and 12+ minutes, in that player's color."
            : "Each line runs from 0 to 100%."
        }
      />
      <div className={cn(type.micro, "flex flex-wrap gap-3 font-semibold")}>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full" style={{ background: aColor }} />
          {aName}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full" style={{ background: bColor }} />
          {bName}
        </span>
      </div>
      <ul className="flex flex-col gap-2.5">
        {rows.map((row) => {
          const lo = Math.min(row.a ?? row.b!, row.b ?? row.a!);
          const hi = Math.max(row.a ?? row.b!, row.b ?? row.a!);
          return (
            <li
              key={row.id}
              className="grid grid-cols-[3rem_minmax(0,1fr)_6.5rem] items-center gap-2"
            >
              <span className={cn(type.caption, "font-bold")}>{metricLabel(row.label)}</span>
              <div className="relative h-5">
                <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-foreground/[0.08]" />
                {[0.25, 0.5, 0.75].map((g) => (
                  <span
                    key={g}
                    aria-hidden
                    className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-foreground/15"
                    style={{ left: pos(g) }}
                  />
                ))}
                <span
                  aria-hidden
                  className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-foreground/25"
                  style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` }}
                />
                {ticks.map(({ avg, color }) => {
                  const v = avg[row.league];
                  return v != null ? (
                    <span
                      key={avg.season + color}
                      className="absolute top-0 h-5 w-0.5 -translate-x-1/2 rounded-full"
                      style={{ left: pos(v), background: color, opacity: 0.55 }}
                      title={`${avg.season} average ${formatPct(v)}`}
                    />
                  ) : null;
                })}
                {(["a", "b"] as const).map((side) => {
                  const v = row[side];
                  if (v == null) return null;
                  const color = side === "a" ? aColor : bColor;
                  return (
                    <span
                      key={side}
                      data-motion-dot
                      className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background"
                      style={{ left: pos(v), background: color }}
                      title={`${side === "a" ? aName : bName}: ${formatPct(v)}`}
                    />
                  );
                })}
              </div>
              <span className={cn(type.micro, "text-right font-bold tabular-nums")}>
                <span style={{ color: aColor }}>{row.a != null ? formatPct(row.a) : "—"}</span>
                <span className="text-muted-foreground"> · </span>
                <span style={{ color: bColor }}>{row.b != null ? formatPct(row.b) : "—"}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

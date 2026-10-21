"use client";

import { useState, type CSSProperties } from "react";

import { TransitionLink } from "@/components/continuity/query-nav";
import {
  Dumbbell,
  OnOffMethodNote,
  OnOffPhaseToggle,
  OnOffViewToggle,
  SmallSampleTag,
  phaseLabel,
  fmtCount,
  fmtPct,
  fmtRating,
  fmtRatingDelta,
  fmtSigned,
  fmtSignedPts,
  percentileLabel,
  rangeLabel,
  toneClass,
} from "@/components/on-off/on-off-parts";
import { OnOffSeasonTable, type OnOffSeasonTableRow } from "@/components/on-off/on-off-season-table";
import { OnOffTrendChart } from "@/components/on-off/on-off-trend";
import { MetricHelp } from "@/components/learn/metric-help";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { PlayerOnOffDetail, SideDetail } from "@/lib/on-off/derive";
import type { FourFactors, OnOffView } from "@/lib/on-off/metrics";
import { PAIR_MIN_POSS, type OnOffPhase } from "@/lib/on-off/types";
import { type } from "@/lib/design-system";
import { playerHref } from "@/lib/player-page-contract";
import { cn } from "@/lib/utils";

export type PlayerOnOffStint = {
  teamAbbr: string;
  /** Team chart color for the "on" marker. */
  color: string;
  games: number;
  views: Record<OnOffView, PlayerOnOffDetail | null>;
};

const shortName = (name: string) => name.split(" ").slice(1).join(" ") || name;

function scale(values: Array<number | null>, pad: number): [number, number] {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (!xs.length) return [0, 1];
  const lo = Math.min(...xs) - pad;
  const hi = Math.max(...xs) + pad;
  return hi - lo < 1 ? [lo - 0.5, hi + 0.5] : [lo, hi];
}

function Summary({
  d,
  playerName,
  view,
  phase,
}: {
  d: PlayerOnOffDetail;
  playerName: string;
  view: OnOffView;
  phase: OnOffPhase;
}) {
  const { row } = d;
  const { cmp } = row;
  const range = rangeLabel(cmp.netDiff, cmp.netDiffSe);
  const tileClass =
    "sports-card sports-card-subtle glass-text-scrim flex min-w-0 flex-col gap-1.5 p-3";
  const rankHint =
    row.netDiffPercentile != null
      ? `${percentileLabel(row.netDiffPercentile)} percentile in the league`
      : phase === "playoffs"
        ? "No league rank for playoff samples"
        : view === "clutch"
          ? "No league rank for clutch samples"
          : "League rank needs 2,000 possessions";

  const swingWash =
    cmp.netDiff == null || !Number.isFinite(cmp.netDiff) || Math.abs(cmp.netDiff) < 0.05
      ? undefined
      : cmp.netDiff > 0
        ? "color-mix(in oklab, var(--data-positive) 16%, transparent)"
        : "color-mix(in oklab, var(--data-negative) 16%, transparent)";

  const stats: Array<{
    label: string;
    value: string;
    tone?: string;
    hint?: string;
    wash?: string;
  }> = [
    {
      label: "On net",
      value: fmtSigned(cmp.on.net),
      tone: toneClass(cmp.on.net),
      wash:
        cmp.on.net != null && Math.abs(cmp.on.net) >= 0.05
          ? `color-mix(in oklab, ${cmp.on.net > 0 ? "var(--data-positive)" : "var(--data-negative)"} 12%, transparent)`
          : undefined,
    },
    {
      label: "Off net",
      value: fmtSigned(cmp.off.net),
      tone: toneClass(cmp.off.net),
      wash:
        cmp.off.net != null && Math.abs(cmp.off.net) >= 0.05
          ? `color-mix(in oklab, ${cmp.off.net > 0 ? "var(--data-positive)" : "var(--data-negative)"} 12%, transparent)`
          : undefined,
    },
    {
      label: "Luck-adjusted",
      value: fmtSigned(cmp.netLuckAdjDiff),
      tone: toneClass(cmp.netLuckAdjDiff),
      hint: "Opponent 3P% and FT% at league average",
      wash:
        cmp.netLuckAdjDiff != null && Math.abs(cmp.netLuckAdjDiff) >= 0.05
          ? `color-mix(in oklab, ${cmp.netLuckAdjDiff > 0 ? "var(--data-positive)" : "var(--data-negative)"} 12%, transparent)`
          : undefined,
    },
    {
      label: "On the floor",
      value: fmtPct(row.onShare, 0),
      hint: `${fmtCount(row.minutes)} min, ${fmtCount(row.poss)} poss`,
      wash: "color-mix(in oklab, var(--chart-1) 12%, transparent)",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6 lg:gap-4">
        <div
          className={cn(tileClass, "col-span-2 justify-between")}
          style={swingWash ? { background: swingWash } : undefined}
        >
          <div className="flex flex-col gap-1">
            <p
              className={cn(
                type.micro,
                "font-semibold uppercase tracking-[0.1em] text-muted-foreground"
              )}
            >
              On/off swing
            </p>
            <p
              className={cn(
                "text-[32px] font-bold tabular-nums leading-none tracking-tight sm:text-4xl",
                toneClass(cmp.netDiff)
              )}
            >
              {fmtSigned(cmp.netDiff)}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <p className={cn(type.caption, "text-muted-foreground")}>
              {range ? `95% range ${range}` : "Range unavailable"}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  type.caption,
                  row.netDiffPercentile != null
                    ? "font-semibold"
                    : "text-muted-foreground"
                )}
              >
                {rankHint}
              </span>
              {row.smallSample ? <SmallSampleTag /> : null}
            </div>
          </div>
        </div>
        {stats.map((s) => (
          <div
            key={s.label}
            className={tileClass}
            style={s.wash ? { background: s.wash } : undefined}
          >
            <p
              className={cn(
                type.micro,
                "font-semibold uppercase tracking-[0.1em] text-muted-foreground"
              )}
            >
              {s.label}
            </p>
            <p
              className={cn(
                "text-[22px] font-bold tabular-nums leading-none tracking-tight",
                s.tone
              )}
            >
              {s.value}
            </p>
            {s.hint ? (
              <p className={cn(type.caption, "text-muted-foreground")}>{s.hint}</p>
            ) : null}
          </div>
        ))}
      </div>
      <p className={cn(type.bodySm, "max-w-prose text-muted-foreground")}>
        {cmp.netDiff != null
          ? `The team was ${Math.abs(cmp.netDiff).toFixed(1)} points per 100 possessions ${
              cmp.netDiff < 0 ? "worse" : "better"
            } with ${shortName(playerName)} on the floor. `
          : null}
        {row.smallSample
          ? "That comes from a small sample, so trust the range more than the swing. "
          : null}
        {row.quality.teammatesOn != null && row.quality.opponentsOn != null ? (
          <>
            His teammates averaged {fmtRatingDelta(row.quality.teammatesOn)} DRBL/100 with him on
            the floor, against {fmtRatingDelta(row.quality.teammatesOff)} for the lineups that
            played while he sat. Opponents averaged {fmtRatingDelta(row.quality.opponentsOn)}{" "}
            against him and {fmtRatingDelta(row.quality.opponentsOff)} otherwise. Stronger
            teammates lift the on number and stronger opponents pull it down.
          </>
        ) : (
          <>
            Opponents averaged{" "}
            {row.oppStartersOn == null ? "—" : row.oppStartersOn.toFixed(1)} starters on the floor
            against him and {row.oppStartersOff == null ? "—" : row.oppStartersOff.toFixed(1)}{" "}
            while he sat, so higher numbers mean his minutes came against stronger groups.
          </>
        )}
      </p>
    </div>
  );
}

function RatingRows({ d, color }: { d: PlayerOnOffDetail; color: string }) {
  const { cmp } = d.row;
  const rtg = scale([cmp.on.ortg, cmp.off.ortg, cmp.on.drtg, cmp.off.drtg], 3);
  const net = scale([cmp.on.net, cmp.off.net, cmp.on.netLuckAdj, cmp.off.netLuckAdj, 0], 3);
  const rows: Array<{
    label: string;
    hint: string;
    on: number | null;
    off: number | null;
    higherIsBetter: boolean;
    range: [number, number];
  }> = [
    { label: "Offense", hint: "Points scored per 100", on: cmp.on.ortg, off: cmp.off.ortg, higherIsBetter: true, range: rtg },
    { label: "Defense", hint: "Points allowed per 100", on: cmp.on.drtg, off: cmp.off.drtg, higherIsBetter: false, range: rtg },
    { label: "Net", hint: "Offense minus defense", on: cmp.on.net, off: cmp.off.net, higherIsBetter: true, range: net },
    {
      label: "Net, luck-adjusted",
      hint: "Opponent shooting luck removed",
      on: cmp.on.netLuckAdj,
      off: cmp.off.netLuckAdj,
      higherIsBetter: true,
      range: net,
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className={cn(type.caption, "flex items-center gap-4 text-muted-foreground")}>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: color }} aria-hidden /> On
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border-2 border-muted-foreground/60" aria-hidden /> Off
        </span>
      </div>
      <ul data-hover-group className="flex flex-col gap-3">
        {rows.map((r, i) => {
          const diff = r.on != null && r.off != null ? r.on - r.off : null;
          return (
            <li
              key={r.label}
              data-hover-item
              style={{ "--i": i } as CSSProperties}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)_13rem]"
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold">{r.label}</p>
                <p className={cn(type.caption, "truncate text-muted-foreground")}>{r.hint}</p>
              </div>
              <div className="order-3 col-span-2 sm:order-none sm:col-span-1">
                {r.on != null && r.off != null ? (
                  <Dumbbell
                    on={r.on}
                    off={r.off}
                    min={r.range[0]}
                    max={r.range[1]}
                    color={color}
                    higherIsBetter={r.higherIsBetter}
                  />
                ) : null}
              </div>
              <div className="flex items-baseline justify-end gap-2 text-[13px] tabular-nums">
                <span className="text-muted-foreground">
                  On <span className="font-semibold text-foreground">{fmtRating(r.on)}</span>
                </span>
                <span className="text-muted-foreground">
                  Off <span className="font-semibold text-foreground">{fmtRating(r.off)}</span>
                </span>
                <span className={cn("w-12 text-right font-bold", toneClass(diff, r.higherIsBetter))}>
                  {fmtSigned(diff)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const FACTORS: Array<{ key: keyof FourFactors; label: string; offenseHigherIsBetter: boolean }> = [
  { key: "efg", label: "eFG%", offenseHigherIsBetter: true },
  { key: "tovPct", label: "TOV%", offenseHigherIsBetter: false },
  { key: "orbPct", label: "ORB%", offenseHigherIsBetter: true },
  { key: "ftRate", label: "FT rate", offenseHigherIsBetter: true },
];

const th = "px-2 py-1.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground";
const td = "px-2 py-1.5 text-right tabular-nums whitespace-nowrap";

function FactorTable({ title, side, defense }: { title: string; side: SideDetail; defense: boolean }) {
  return (
    <div className="sports-card sports-card-subtle glass-text-scrim min-w-0 p-3">
      <h4 className="mb-2 text-[13px] font-semibold">{title}</h4>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border/60">
            <th className={cn(th, "text-left")}>Factor</th>
            <th className={th}>On</th>
            <th className={th}>Off</th>
            <th className={th}>Diff</th>
          </tr>
        </thead>
        <tbody>
          {FACTORS.map((f) => {
            const on = side.on[f.key];
            const off = side.off[f.key];
            const diff = on != null && off != null ? on - off : null;
            const goodDir = f.offenseHigherIsBetter !== defense;
            const good =
              diff != null &&
              Number.isFinite(diff) &&
              Math.abs(diff) >= 0.0005 &&
              diff > 0 === goodDir;
            const bad =
              diff != null &&
              Number.isFinite(diff) &&
              Math.abs(diff) >= 0.0005 &&
              diff > 0 !== goodDir;
            return (
              <tr key={f.key} className="border-b border-border/60 last:border-0">
                <td className={cn(td, "text-left")}>{f.label}</td>
                <td className={td}>{fmtPct(on)}</td>
                <td className={td}>{fmtPct(off)}</td>
                <td
                  className={cn(
                    td,
                    "rounded-sm font-semibold",
                    toneClass(diff == null ? null : diff * 100, goodDir)
                  )}
                  style={
                    good
                      ? {
                          background:
                            "color-mix(in oklab, var(--data-positive) 14%, transparent)",
                        }
                      : bad
                        ? {
                            background:
                              "color-mix(in oklab, var(--data-negative) 14%, transparent)",
                          }
                        : undefined
                  }
                >
                  {fmtSignedPts(diff)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ShotTable({ title, side }: { title: string; side: SideDetail }) {
  return (
    <div className="sports-card sports-card-subtle glass-text-scrim min-w-0 p-3">
      <h4 className="mb-2 text-[13px] font-semibold">{title}</h4>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border">
            <th className={cn(th, "text-left")}>Zone</th>
            <th className={th} title="Share of field goal attempts">Share on</th>
            <th className={th}>Off</th>
            <th className={th} title="Field goal percentage">FG% on</th>
            <th className={th}>Off</th>
          </tr>
        </thead>
        <tbody>
          {side.shotsOn.map((z, i) => {
            const off = side.shotsOff[i]!;
            return (
              <tr key={z.zone} className="border-b border-border/60 last:border-0">
                <td className={cn(td, "text-left")}>{z.label}</td>
                <td className={cn(td, "font-semibold")}>{fmtPct(z.freq, 0)}</td>
                <td className={cn(td, "text-muted-foreground")}>{fmtPct(off.freq, 0)}</td>
                <td className={cn(td, "font-semibold")}>{fmtPct(z.pct, 0)}</td>
                <td className={cn(td, "text-muted-foreground")}>{fmtPct(off.pct, 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Teammates({
  d,
  playerName,
  season,
  pairMin,
}: {
  d: PlayerOnOffDetail;
  playerName: string;
  season: string;
  pairMin: number;
}) {
  if (!d.teammates.length) {
    return (
      <p className={cn(type.bodySm, "text-muted-foreground")}>
        Teammate splits start once both players pass {fmtCount(pairMin)} possessions.
      </p>
    );
  }
  const me = shortName(playerName);
  return (
    <ul data-hover-group className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {d.teammates.map((t) => {
        const mate = shortName(t.name);
        return (
          <li key={t.id} data-hover-item className="flex min-w-0 flex-col gap-2 rounded-md border border-border/70 p-3">
            <TransitionLink
              href={playerHref({ playerId: t.id, season, view: "onoff" })}
              className="truncate text-[14px] font-semibold"
            >
              {t.name}
            </TransitionLink>
            <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] gap-1">
              <span />
              <span className={cn(type.micro, "truncate text-center font-semibold text-muted-foreground")}>
                {mate} on
              </span>
              <span className={cn(type.micro, "truncate text-center font-semibold text-muted-foreground")}>
                {mate} off
              </span>
              <span className={cn(type.micro, "self-center pr-1 text-right font-semibold text-muted-foreground")}>
                {me} on
              </span>
              <PairCell state={t.states.both} label={`${me} and ${mate} together`} />
              <PairCell state={t.states.aOnly} label={`${me} without ${mate}`} />
              <span className={cn(type.micro, "self-center pr-1 text-right font-semibold text-muted-foreground")}>
                {me} off
              </span>
              <PairCell state={t.states.bOnly} label={`${mate} without ${me}`} />
              <PairCell state={t.states.neither} label="Neither on the floor" />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const THIN_PAIR_POSS = 100;

function PairCell({ state, label }: { state: { net: number | null; poss: number }; label: string }) {
  const has = state.poss > 0 && state.net != null && Number.isFinite(state.net);
  const thin = state.poss < THIN_PAIR_POSS;
  const strength = has ? Math.min(1, Math.abs(state.net!) / 15) * (thin ? 14 : 30) + 4 : 0;
  const color = has && state.net! < 0 ? "var(--data-negative)" : "var(--data-positive)";
  return (
    <div
      data-tip={label}
      data-tip-sub={`${has ? `${fmtSigned(state.net)} net` : "No possessions"} · ${fmtCount(state.poss)} poss${thin ? " · small sample" : ""}`}
      data-motion-pop
      className={cn(
        "flex h-14 flex-col items-center justify-center rounded-[5px] hover:scale-[1.06] hover:shadow-[var(--motion-chip-shadow)]",
        has ? "" : "bg-foreground/[0.04]",
        thin && has ? "border border-dashed border-foreground/20" : ""
      )}
      style={has ? { background: `color-mix(in oklab, ${color} ${strength}%, transparent)` } : undefined}
    >
      <span className={cn("text-[15px] font-bold tabular-nums", has ? toneClass(state.net) : "text-muted-foreground")}>
        {has ? fmtSigned(state.net) : "—"}
      </span>
      <span className={cn(type.micro, "tabular-nums text-muted-foreground")}>{fmtCount(state.poss)} poss</span>
    </div>
  );
}

function Replacements({ d, playerName, season }: { d: PlayerOnOffDetail; playerName: string; season: string }) {
  if (!d.replacements.length) {
    return (
      <p className={cn(type.bodySm, "text-muted-foreground")}>
        No regular teammate plays a bigger share when he sits.
      </p>
    );
  }
  const me = shortName(playerName);
  const pos = (share: number) => `${Math.min(1, Math.max(0, share)) * 100}%`;
  return (
    <div className="flex flex-col gap-3">
      <div className={cn(type.caption, "flex flex-wrap items-center gap-4 text-muted-foreground")}>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border-2 border-muted-foreground/60" aria-hidden /> With {me}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-foreground" aria-hidden /> While {me} sits
        </span>
      </div>
      <ul data-hover-group className="flex flex-col gap-2.5">
        {d.replacements.map((r, i) => (
          <li
            key={r.id}
            data-hover-item
            style={{ "--i": i } as CSSProperties}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_9rem]"
          >
            <TransitionLink
              href={playerHref({ playerId: r.id, season, view: "onoff" })}
              className="truncate text-[13px] font-semibold"
            >
              {r.name}
            </TransitionLink>
            <div
              className="relative order-3 col-span-2 h-5 sm:order-none sm:col-span-1"
              aria-label={`Plays ${fmtPct(r.shareWith, 0)} of possessions with ${me} on, ${fmtPct(r.shareWithout, 0)} while he sits`}
            >
              <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground/[0.07]" />
              <div
                data-motion-bar="x"
                className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground/25"
                style={{ left: pos(r.shareWith), width: `calc(${pos(r.shareWithout)} - ${pos(r.shareWith)})` }}
              />
              <span
                data-motion-dot
                className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-muted-foreground/60 bg-background"
                style={{ left: pos(r.shareWith) }}
              />
              <span
                data-motion-mark
                className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-background"
                style={{ left: pos(r.shareWithout), "--mark-from": pos(r.shareWith) } as CSSProperties}
              />
            </div>
            <p className="text-right text-[13px] tabular-nums">
              <span className="text-muted-foreground">{fmtPct(r.shareWith, 0)} → </span>
              <span className="font-semibold">{fmtPct(r.shareWithout, 0)}</span>
              <span className={cn(type.caption, "ml-1.5 text-muted-foreground")}>{fmtCount(r.possWithout)} poss</span>
            </p>
          </li>
        ))}
      </ul>
      <p className={cn(type.caption, "text-muted-foreground")}>
        Share of team possessions each one plays. The bar runs from 0 to 100%.
      </p>
    </div>
  );
}

function Lineups({ d }: { d: PlayerOnOffDetail }) {
  if (!d.lineups.length) {
    return <p className={cn(type.bodySm, "text-muted-foreground")}>No five-man group with him has 40 possessions yet.</p>;
  }
  return (
    <div className="touch-scroll-x overflow-x-auto">
      <table className="w-full min-w-[36rem] text-[13px]">
        <thead>
          <tr className="border-b border-border">
            <th className={cn(th, "text-left")}>Lineup</th>
            <th className={th}>Poss</th>
            <th className={th}>ORtg</th>
            <th className={th}>DRtg</th>
            <th className={th}>Net</th>
          </tr>
        </thead>
        <tbody>
          {d.lineups.map((l) => (
            <tr key={l.ids.join("-")} className="border-b border-border/60 last:border-0">
              <td className={cn(td, "max-w-[20rem] text-left")}>
                <span className="block truncate" title={l.names.join(", ")}>
                  {l.names.map(shortName).join(" · ")}
                </span>
              </td>
              <td className={td}>{fmtCount(l.poss)}</td>
              <td className={td}>{fmtRating(l.ratings.ortg)}</td>
              <td className={td}>{fmtRating(l.ratings.drtg)}</td>
              <td className={cn(td, "font-semibold", toneClass(l.ratings.net))}>{fmtSigned(l.ratings.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PlayerOnOffPanel({
  playerId,
  playerName,
  season,
  phases,
  history,
}: {
  playerId: string;
  playerName: string;
  season: string;
  phases: { regular: PlayerOnOffStint[]; playoffs?: PlayerOnOffStint[] };
  history: OnOffSeasonTableRow[];
}) {
  const [view, setView] = useState<OnOffView>("clean");
  const [phase, setPhase] = useState<OnOffPhase>("regular");
  const [stintIndex, setStintIndex] = useState("0");
  const hasPlayoffs = Boolean(phases.playoffs?.length);
  const activePhase: OnOffPhase = phase === "playoffs" && hasPlayoffs ? "playoffs" : "regular";
  const stints = activePhase === "playoffs" ? phases.playoffs! : phases.regular;
  const stint = stints[Number(stintIndex)] ?? stints[0]!;
  const d = stint.views[view] ?? stint.views.all;
  if (!d) return null;
  const usingFallback = stint.views[view] == null;
  const choosePhase = (next: OnOffPhase) => {
    setPhase(next);
    setStintIndex("0");
  };

  return (
    <section id="onoff" className="scroll-mt-16 flex flex-col gap-5 sm:gap-6" aria-label="On/off">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className={type.heading}>
            <MetricHelp conceptId="on_off">On/off</MetricHelp>
          </h2>
          <p className={cn(type.bodySm, "mt-1 max-w-prose text-muted-foreground")}>
            How {stint.teamAbbr} played per 100 possessions with {playerName} on the floor and
            off it. {season} {phaseLabel(activePhase)}, {d.row.gp} games played.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasPlayoffs ? <OnOffPhaseToggle value={activePhase} onChange={choosePhase} /> : null}
          {stints.length > 1 ? (
            <SegmentedControl
              size="sm"
              value={stintIndex}
              options={stints.map((s, i) => ({ id: String(i), label: s.teamAbbr }))}
              onChange={setStintIndex}
            />
          ) : null}
          <OnOffViewToggle value={view} onChange={setView} />
        </div>
      </div>

      {usingFallback ? (
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          {view === "clutch"
            ? `He played no clutch possessions for ${stint.teamAbbr}, so this shows every possession.`
            : "All of his possessions came in garbage time or end-of-quarter heaves, so this shows every possession."}
        </p>
      ) : null}

      <Summary d={d} playerName={playerName} view={view} phase={activePhase} />

      <div className="flex flex-col gap-3">
        <h3
          className={cn(type.heading, "border-l-[3px] border-[var(--chart-1)] pl-2.5")}
        >
          Ratings on and off
        </h3>
        <RatingRows d={d} color={stint.color} />
      </div>

      <div className="flex flex-col gap-3">
        <h3
          className={cn(type.heading, "border-l-[3px] pl-2.5")}
          style={{ borderColor: stint.color }}
        >
          Swing over the {activePhase === "playoffs" ? "playoffs" : "season"}
        </h3>
        {view === "clutch" || usingFallback ? (
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            No game-by-game line for clutch, since most games have a few clutch possessions or
            none.
          </p>
        ) : d.trend.some((p) => p.swing != null) ? (
          <OnOffTrendChart points={d.trend} color={stint.color} />
        ) : (
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            The line needs 250 possessions with him on the floor and 250 without.
          </p>
        )}
      </div>

      {history.length > 1 ? (
        <div className="flex flex-col gap-3">
          <h3 className={cn(type.heading, "border-l-[3px] border-[var(--chart-5)] pl-2.5")}>
            Season by season
          </h3>
          <OnOffSeasonTable
            rows={history}
            view={view}
            playerId={playerId}
            season={season}
            phase={activePhase}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <h3 className={cn(type.heading, "border-l-[3px] border-[var(--chart-3)] pl-2.5")}>
          Four factors
        </h3>
        <div className="grid gap-3 md:grid-cols-2 md:gap-4">
          <FactorTable title={`${stint.teamAbbr} offense`} side={d.offense} defense={false} />
          <FactorTable title="Opponent offense" side={d.defense} defense />
        </div>
        <p className={cn(type.caption, "text-muted-foreground")}>
          Diff is in percentage points. For opponent offense, green means opponents did worse with
          him on the floor.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className={cn(type.heading, "border-l-[3px] border-[var(--chart-4)] pl-2.5")}>
          Shot profile
        </h3>
        <div className="grid gap-3 md:grid-cols-2 md:gap-4">
          <ShotTable title={`${stint.teamAbbr} shots`} side={d.offense} />
          <ShotTable title="Opponent shots" side={d.defense} />
        </div>
        <p className={cn(type.caption, "text-muted-foreground")}>
          Every team shot while he was on the floor, not only his own. Rim is under 4 feet, short
          mid is 4 to 14 feet.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className={cn(type.heading, "border-l-[3px] border-[var(--data-positive)] pl-2.5")}>
          With and without teammates
        </h3>
        <p className={cn(type.bodySm, "max-w-prose text-muted-foreground")}>
          Team net rating in each combination of the two on or off the floor. Green is better, red is
          worse, and a dashed cell has under {THIN_PAIR_POSS} possessions. The teammates he shared the most
          time with come first.
        </p>
        <Teammates d={d} playerName={playerName} season={season} pairMin={PAIR_MIN_POSS[activePhase]} />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className={cn(type.heading, "border-l-[3px] border-[var(--chart-1)] pl-2.5")}>
          Who takes his minutes
        </h3>
        <p className={cn(type.bodySm, "max-w-prose text-muted-foreground")}>
          Teammates who play a bigger share of the floor when {shortName(playerName)} sits. Their
          play shapes his off number, so a strong backup shrinks his swing.
        </p>
        <Replacements d={d} playerName={playerName} season={season} />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className={cn(type.heading, "border-l-[3px] border-foreground/40 pl-2.5")}>
          His most-used lineups
        </h3>
        <Lineups d={d} />
      </div>

      <OnOffMethodNote />
    </section>
  );
}

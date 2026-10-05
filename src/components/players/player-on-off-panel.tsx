"use client";

import { useState } from "react";

import { TransitionLink } from "@/components/continuity/query-nav";
import {
  Dumbbell,
  OnOffMethodNote,
  OnOffViewToggle,
  SmallSampleTag,
  fmtCount,
  fmtPct,
  fmtRating,
  fmtSigned,
  fmtSignedPts,
  percentileLabel,
  rangeLabel,
  toneClass,
} from "@/components/on-off/on-off-parts";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { PlayerOnOffDetail, SideDetail } from "@/lib/on-off/derive";
import type { FourFactors, OnOffView } from "@/lib/on-off/metrics";
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

function Summary({ d, playerName }: { d: PlayerOnOffDetail; playerName: string }) {
  const { row } = d;
  const { cmp } = row;
  const range = rangeLabel(cmp.netDiff, cmp.netDiffSe);
  const stat = (label: string, value: string, tone?: string, hint?: string) => (
    <div className="flex min-w-0 flex-col gap-0.5">
      <p className={cn(type.micro, "font-semibold uppercase tracking-[0.1em] text-muted-foreground")}>{label}</p>
      <p className={cn("text-lg font-bold tabular-nums", tone)}>{value}</p>
      {hint ? <p className={cn(type.caption, "text-muted-foreground")}>{hint}</p> : null}
    </div>
  );
  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] sm:items-center">
      <div className="flex flex-col gap-1">
        <p className={cn(type.micro, "font-semibold uppercase tracking-[0.1em] text-muted-foreground")}>
          On/off swing
        </p>
        <p className={cn("text-4xl font-bold tabular-nums", toneClass(cmp.netDiff))}>{fmtSigned(cmp.netDiff)}</p>
        <p className={cn(type.caption, "text-muted-foreground")}>
          {range ? `95% range ${range}` : "Range unavailable"}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {row.netDiffPercentile != null ? (
            <span className={cn(type.caption, "font-semibold")}>
              {percentileLabel(row.netDiffPercentile)} percentile in the league
            </span>
          ) : (
            <span className={cn(type.caption, "text-muted-foreground")}>
              League rank needs 2,000 possessions
            </span>
          )}
          {row.smallSample ? <SmallSampleTag /> : null}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stat("On net", fmtSigned(cmp.on.net), toneClass(cmp.on.net))}
        {stat("Off net", fmtSigned(cmp.off.net), toneClass(cmp.off.net))}
        {stat(
          "Luck-adjusted",
          fmtSigned(cmp.netLuckAdjDiff),
          toneClass(cmp.netLuckAdjDiff),
          "Opponent 3P% and FT% at league average"
        )}
        {stat(
          "On the floor",
          fmtPct(row.onShare, 0),
          undefined,
          `${fmtCount(row.minutes)} min, ${fmtCount(row.poss)} poss`
        )}
      </div>
      <p className={cn(type.bodySm, "text-muted-foreground sm:col-span-2")}>
        {cmp.netDiff != null
          ? `The team was ${Math.abs(cmp.netDiff).toFixed(1)} points per 100 possessions ${
              cmp.netDiff < 0 ? "worse" : "better"
            } with ${shortName(playerName)} on the floor. `
          : null}
        Opponents averaged{" "}
        {row.oppStartersOn == null ? "—" : row.oppStartersOn.toFixed(1)} starters on the floor
        against him and {row.oppStartersOff == null ? "—" : row.oppStartersOff.toFixed(1)} while
        he sat, so higher numbers mean his minutes came against stronger groups.
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
      <ul className="flex flex-col gap-3">
        {rows.map((r) => {
          const diff = r.on != null && r.off != null ? r.on - r.off : null;
          return (
            <li
              key={r.label}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)_13rem]"
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold">{r.label}</p>
                <p className={cn(type.caption, "truncate text-muted-foreground")}>{r.hint}</p>
              </div>
              <div className="order-3 col-span-2 sm:order-none sm:col-span-1">
                {r.on != null && r.off != null ? (
                  <Dumbbell on={r.on} off={r.off} min={r.range[0]} max={r.range[1]} color={color} />
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
    <div className="min-w-0">
      <h4 className="mb-1 text-[13px] font-semibold">{title}</h4>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border">
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
            return (
              <tr key={f.key} className="border-b border-border/60 last:border-0">
                <td className={cn(td, "text-left")}>{f.label}</td>
                <td className={td}>{fmtPct(on)}</td>
                <td className={td}>{fmtPct(off)}</td>
                <td
                  className={cn(
                    td,
                    "font-semibold",
                    toneClass(diff == null ? null : diff * 100, f.offenseHigherIsBetter !== defense)
                  )}
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
    <div className="min-w-0">
      <h4 className="mb-1 text-[13px] font-semibold">{title}</h4>
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

function Teammates({ d, playerName, season }: { d: PlayerOnOffDetail; playerName: string; season: string }) {
  if (!d.teammates.length) {
    return (
      <p className={cn(type.bodySm, "text-muted-foreground")}>
        Teammate splits start once both players pass 400 possessions.
      </p>
    );
  }
  const me = shortName(playerName);
  return (
    <div className="touch-scroll-x overflow-x-auto">
      <table className="w-full min-w-[34rem] text-[13px]">
        <thead>
          <tr className="border-b border-border">
            <th className={cn(th, "text-left")}>Teammate</th>
            <th className={th}>Both on</th>
            <th className={th}>{me} only</th>
            <th className={th}>Teammate only</th>
            <th className={th}>Both off</th>
          </tr>
        </thead>
        <tbody>
          {d.teammates.map((t) => {
            const cell = (r: typeof t.states.both) => (
              <td className={cn(td, toneClass(r.net))} title={`${fmtCount(r.poss)} poss`}>
                {r.poss > 0 ? fmtSigned(r.net) : "—"}
                <span className="ml-1 text-[11px] text-muted-foreground">{fmtCount(r.poss)}</span>
              </td>
            );
            return (
              <tr key={t.id} className="border-b border-border/60 last:border-0">
                <td className={cn(td, "max-w-[12rem] text-left")}>
                  <TransitionLink
                    href={playerHref({ playerId: t.id, season, view: "onoff" })}
                    className="block truncate font-medium"
                  >
                    {t.name}
                  </TransitionLink>
                </td>
                {cell(t.states.both)}
                {cell(t.states.aOnly)}
                {cell(t.states.bOnly)}
                {cell(t.states.neither)}
              </tr>
            );
          })}
        </tbody>
      </table>
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
  playerName,
  season,
  stints,
}: {
  playerName: string;
  season: string;
  stints: PlayerOnOffStint[];
}) {
  const [view, setView] = useState<OnOffView>("clean");
  const [stintIndex, setStintIndex] = useState("0");
  const stint = stints[Number(stintIndex)] ?? stints[0]!;
  const d = stint.views[view] ?? stint.views.all;
  if (!d) return null;
  const usingFallback = stint.views[view] == null;

  return (
    <section id="onoff" className="scroll-mt-16 flex flex-col gap-8" aria-label="On/off">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[20px] font-bold tracking-tight">On/off</h2>
          <p className={cn(type.bodySm, "mt-1 max-w-prose text-muted-foreground")}>
            How {stint.teamAbbr} played per 100 possessions with {playerName} on the floor and
            off it. {season} regular season, {d.row.gp} games played.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          All of his possessions came in garbage time or end-of-quarter heaves, so this shows every
          possession.
        </p>
      ) : null}

      <Summary d={d} playerName={playerName} />

      <div className="flex flex-col gap-3">
        <h3 className={type.heading}>Ratings on and off</h3>
        <RatingRows d={d} color={stint.color} />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className={type.heading}>Four factors</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <FactorTable title={`${stint.teamAbbr} offense`} side={d.offense} defense={false} />
          <FactorTable title="Opponent offense" side={d.defense} defense />
        </div>
        <p className={cn(type.caption, "text-muted-foreground")}>
          Diff is in percentage points. For opponent offense, green means opponents did worse with
          him on the floor.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className={type.heading}>Shot profile</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <ShotTable title={`${stint.teamAbbr} shots`} side={d.offense} />
          <ShotTable title="Opponent shots" side={d.defense} />
        </div>
        <p className={cn(type.caption, "text-muted-foreground")}>
          Every team shot while he was on the floor, not only his own. Rim is under 4 feet, short
          mid is 4 to 14 feet.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className={type.heading}>With and without teammates</h3>
        <p className={cn(type.bodySm, "max-w-prose text-muted-foreground")}>
          Team net rating in each combination, with possessions beside it. The teammates he shared
          the most time with come first.
        </p>
        <Teammates d={d} playerName={playerName} season={season} />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className={type.heading}>His most-used lineups</h3>
        <Lineups d={d} />
      </div>

      <OnOffMethodNote />
    </section>
  );
}

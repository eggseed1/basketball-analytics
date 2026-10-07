"use client";

import { useEffect, useState } from "react";

import type { CareerBands, CareerBandSeason } from "@/analytics/career-bands";
import { AppLink } from "@/components/ui/app-link";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

const PRESETS = [
  { id: "2544", name: "LeBron James" },
  { id: "1717", name: "Dirk Nowitzki" },
  { id: "1495", name: "Tim Duncan" },
  { id: "201939", name: "Stephen Curry" },
  { id: "1713", name: "Vince Carter" },
  { id: "101108", name: "Chris Paul" },
  { id: "977", name: "Kobe Bryant" },
] as const;

type Kind = "peak" | "window" | "primeBand" | "longevity" | "below" | "incomplete";

const KIND_STYLE: Record<Kind, string> = {
  peak: "bg-amber-500",
  window: "bg-emerald-600 dark:bg-emerald-500",
  primeBand: "bg-emerald-600/40 dark:bg-emerald-500/40",
  longevity: "bg-sky-600/55 dark:bg-sky-400/55",
  below: "bg-foreground/15",
  incomplete: "border border-dashed border-foreground/45 bg-transparent",
};

function kindOf(s: CareerBandSeason): Kind {
  if (s.incomplete) return "incomplete";
  if (s.peak) return "peak";
  if (s.primeWindow) return "window";
  if (s.primeBand) return "primeBand";
  if (s.longevityBand) return "longevity";
  return "below";
}

const pct = (ofPeak: number) => `${(Math.floor(ofPeak * 1000) / 10).toFixed(1)}%`;

function describe(s: CareerBandSeason): string {
  if (s.incomplete) return `Only ${s.gamesPlayed} games, so it isn't counted in any band yet.`;
  const band = s.primeWindow
    ? "Part of the Prime run, and it counts toward Longevity too."
    : s.primeBand
      ? "Cleared 90% but sits outside the longest unbroken run, so it counts toward Longevity, not Prime."
      : s.longevityBand
        ? "Between 70% and 90%, so it counts toward Longevity only."
        : "Below the 70% floor, so it's outside every band.";
  return s.peak ? `His best season. ${band}` : band;
}

function summary(b: CareerBands): string | null {
  if (!b.peak) return null;
  const first = b.playerName.split(" ")[0];
  const parts = [`${b.playerName} peaked in ${b.peak.season} at ${b.peak.cpi.toFixed(1)} CPI.`];
  if (b.primeWindow) {
    const run = `${b.primeWindow.count} ${b.primeWindow.count === 1 ? "season" : "seasons"}`;
    const span = b.primeWindow.count > 1 ? `, ${b.primeWindow.from} to ${b.primeWindow.to}` : `, ${b.primeWindow.from}`;
    parts.push(
      b.primeBandCount > b.primeWindow.count
        ? `${first} cleared 90% of that in ${b.primeBandCount} seasons, but the longest unbroken run was ${run}${span}. That run is his Prime.`
        : `His Prime is ${run} in a row at 90% or better${span}.`
    );
  }
  if (b.longevityCount) {
    parts.push(`${b.longevityCount} seasons cleared 70%, which is his Longevity.`);
  }
  return parts.join(" ");
}

function Legend({ bands }: { bands: CareerBands }) {
  const counted = bands.seasons.filter((s) => !s.incomplete);
  const items: Array<{ kind: Kind; label: string }> = [
    { kind: "peak", label: "Peak" },
    { kind: "window", label: "Prime run" },
    { kind: "primeBand", label: `Hit 90% outside the run` },
    { kind: "longevity", label: "Longevity only, 70 to 89%" },
    { kind: "below", label: "Below 70%" },
  ];
  const present = new Set(counted.map(kindOf));
  if (bands.peak && counted.some((s) => s.peak && s.primeWindow)) present.add("window");
  return (
    <ul className={cn(type.caption, "flex flex-wrap gap-x-4 gap-y-1.5 text-muted-foreground")}>
      {items
        .filter((i) => present.has(i.kind))
        .map((i) => (
          <li key={i.kind} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("h-2.5 w-2.5 rounded-sm", KIND_STYLE[i.kind])} />
            {i.label}
          </li>
        ))}
      {bands.seasons.some((s) => s.incomplete) ? (
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn("h-2.5 w-2.5 rounded-sm", KIND_STYLE.incomplete)} />
          Not enough games yet
        </li>
      ) : null}
    </ul>
  );
}

function Chart({
  bands,
  selected,
  onSelect,
}: {
  bands: CareerBands;
  selected: string | null;
  onSelect: (season: string) => void;
}) {
  const n = bands.seasons.length;
  const ticks = new Set<number>([0, n - 1]);
  const peakIdx = bands.seasons.findIndex((s) => s.peak);
  if (peakIdx > 2 && peakIdx < n - 3) ticks.add(peakIdx);

  return (
    <div className="relative pl-9 pr-1">
      <div className="relative h-56">
        <div aria-hidden className="absolute inset-x-0 top-0 h-[10%] bg-emerald-500/[0.08]" />
        <div aria-hidden className="absolute inset-x-0 top-[10%] h-[20%] bg-sky-500/[0.07]" />
        {[
          { at: 90, label: "90%" },
          { at: 70, label: "70%" },
        ].map((line) => (
          <div
            key={line.at}
            aria-hidden
            className="absolute inset-x-0 border-t border-dashed border-foreground/35"
            style={{ bottom: `${line.at}%` }}
          >
            <span className={cn(type.micro, "absolute -left-9 -translate-y-1/2 font-semibold tabular-nums text-muted-foreground")}>
              {line.label}
            </span>
          </div>
        ))}
        <span className={cn(type.micro, "absolute -left-9 top-0 -translate-y-1/2 font-semibold tabular-nums text-muted-foreground")}>
          100%
        </span>
        <div className="absolute inset-0 flex items-end gap-[3px] sm:gap-1">
          {bands.seasons.map((s) => {
            const kind = kindOf(s);
            const active = selected === s.season;
            return (
              <button
                key={s.season}
                type="button"
                onClick={() => onSelect(s.season)}
                onMouseEnter={() => onSelect(s.season)}
                onFocus={() => onSelect(s.season)}
                aria-label={`${s.season}: ${pct(s.ofPeak)} of peak. ${describe(s)}`}
                aria-pressed={active}
                className="group flex h-full min-w-0 flex-1 items-end focus-visible:outline-none"
              >
                <span
                  className={cn(
                    "block w-full rounded-t-[3px] transition-[filter,box-shadow]",
                    KIND_STYLE[kind],
                    active
                      ? "ring-2 ring-foreground ring-offset-1 ring-offset-background"
                      : "group-hover:brightness-110 group-focus-visible:ring-2 group-focus-visible:ring-ring"
                  )}
                  style={{ height: `${Math.max(1.5, Math.min(1, s.ofPeak) * 100)}%` }}
                />
              </button>
            );
          })}
        </div>
      </div>
      <div className={cn(type.micro, "relative mt-1.5 h-4 text-muted-foreground")}>
        {[...ticks].map((i) => (
          <span
            key={i}
            className={cn(
              "absolute whitespace-nowrap tabular-nums",
              i === 0 ? "left-0" : i === n - 1 ? "right-0" : "-translate-x-1/2"
            )}
            style={i === 0 || i === n - 1 ? undefined : { left: `${((i + 0.5) / n) * 100}%` }}
          >
            {bands.seasons[i]!.season}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Interactive Peak / Prime / Longevity chart for a real career, used on Learn. */
export function CareerBandsExplorer() {
  const [playerId, setPlayerId] = useState<string>(PRESETS[0].id);
  const [cache, setCache] = useState<Record<string, CareerBands | "error">>({});
  const [selected, setSelected] = useState<string | null>(null);
  const bands = cache[playerId];

  useEffect(() => {
    if (cache[playerId]) return;
    const ctrl = new AbortController();
    fetch(`/api/players/${playerId}/career-bands`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<CareerBands>) : Promise.reject(new Error(String(r.status)))))
      .then((b) => setCache((c) => ({ ...c, [playerId]: b })))
      .catch((e: unknown) => {
        if ((e as Error).name !== "AbortError") setCache((c) => ({ ...c, [playerId]: "error" }));
      });
    return () => ctrl.abort();
  }, [playerId, cache]);

  const loaded = bands && bands !== "error" ? bands : null;
  const active =
    loaded?.seasons.find((s) => s.season === selected) ?? loaded?.seasons.find((s) => s.peak) ?? null;
  const text = loaded ? summary(loaded) : null;

  return (
    <section className="sports-card flex flex-col gap-4 p-4 sm:p-5" aria-labelledby="career-bands-heading">
      <div className="flex flex-col gap-1">
        <h2 id="career-bands-heading" className="text-[18px] font-bold">
          See it on a real career
        </h2>
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          Each bar is one qualifying season, as a share of that player&apos;s best. Tap or hover a bar for details.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Choose a player">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setPlayerId(p.id);
              setSelected(null);
            }}
            aria-pressed={p.id === playerId}
            className={cn(
              type.caption,
              "rounded-full border px-3 py-1 font-semibold transition-colors",
              p.id === playerId
                ? "border-foreground bg-foreground text-background"
                : "border-border hover:bg-secondary"
            )}
          >
            {p.name}
          </button>
        ))}
      </div>

      {bands === "error" ? (
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          Couldn&apos;t load this career right now. Try another player.
        </p>
      ) : !loaded ? (
        <div className="h-[17.5rem] animate-pulse rounded-md bg-foreground/[0.05]" aria-label="Loading career" />
      ) : loaded.seasons.length === 0 ? (
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          {loaded.limitedReason ?? "No qualifying seasons for this player."}
        </p>
      ) : (
        <>
          {text ? <p className={cn(type.bodySm, "max-w-3xl")}>{text}</p> : null}
          <Chart bands={loaded} selected={active?.season ?? null} onSelect={setSelected} />
          {active ? (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md bg-foreground/[0.04] px-3 py-2" aria-live="polite">
              <span className={cn(type.bodySm, "font-semibold tabular-nums")}>{active.season}</span>
              <span className={cn(type.bodySm, "tabular-nums")}>
                {pct(active.ofPeak)} of peak · CPI {active.cpi.toFixed(1)} · {active.gamesPlayed} games
              </span>
              <span className={cn(type.bodySm, "text-muted-foreground")}>{describe(active)}</span>
            </div>
          ) : null}
          <Legend bands={loaded} />
          <p className={cn(type.caption, "text-muted-foreground")}>
            A season counts with 20 games at 15 minutes a game, or 15 games at 18 minutes.{" "}
            <AppLink href={`/players/${loaded.playerId}`} className="font-semibold text-foreground underline-offset-2 hover:underline">
              Open {loaded.playerName}&apos;s page <span data-motion-arrow aria-hidden>→</span>
            </AppLink>
          </p>
        </>
      )}
    </section>
  );
}

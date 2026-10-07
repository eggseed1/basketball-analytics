"use client";

import { useMemo, useState } from "react";

import { AppLink } from "@/components/ui/app-link";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export type ShrinkagePlayer = [id: string, name: string, possessions: number, raw: number, drbl100: number];

const K = 1600;
const MAX_N = 12_000;
const rho = (n: number) => n / (n + K);
const sliderToN = (v: number) => Math.max(25, Math.round(((v / 1000) ** 2 * MAX_N) / 25) * 25);
const nToSlider = (n: number) => Math.round(Math.sqrt(Math.min(n, MAX_N) / MAX_N) * 1000);

type Band = "small" | "mid" | "large";
const bandOf = (n: number): Band => (n < 1000 ? "small" : n < 4000 ? "mid" : "large");
const BAND_STYLE: Record<Band, string> = {
  small: "bg-amber-500",
  mid: "bg-sky-500",
  large: "bg-emerald-600 dark:bg-emerald-500",
};
const BAND_LABEL: Record<Band, string> = {
  small: "Under 1,000 possessions",
  mid: "1,000 to 4,000",
  large: "Over 4,000",
};

function signed(x: number, digits: number): string {
  const text = Math.abs(x).toFixed(digits);
  if (Number(text) === 0) return (0).toFixed(digits);
  return `${x > 0 ? "+" : "−"}${text}`;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

function ticks(min: number, max: number): number[] {
  const step = max - min > 10 ? 2 : 1;
  const out: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max; t += step) out.push(t);
  return out;
}

type Preset = { label: string; player: ShrinkagePlayer };

function pickPresets(players: ShrinkagePlayer[]): Preset[] {
  const best = (rows: ShrinkagePlayer[], score: (p: ShrinkagePlayer) => number) =>
    rows.reduce<ShrinkagePlayer | null>((top, p) => (!top || score(p) > score(top) ? p : top), null);
  const tiny = players.filter((p) => p[2] < 500);
  const part = players.filter((p) => p[2] >= 1000 && p[2] < 2500);
  const presets: Array<Preset | null> = [
    (() => {
      const p = best(tiny, (r) => r[3]);
      return p ? { label: "Hot, tiny sample", player: p } : null;
    })(),
    (() => {
      const p = best(part, (r) => r[3]);
      return p ? { label: "Hot, part-time", player: p } : null;
    })(),
    (() => {
      const p = best(players, (r) => r[4]);
      return p ? { label: "Top DRBL/100", player: p } : null;
    })(),
    (() => {
      const p = best(tiny, (r) => -r[3]);
      return p ? { label: "Cold, tiny sample", player: p } : null;
    })(),
  ];
  const seen = new Set<string>();
  return presets.filter((p): p is Preset => {
    if (!p || seen.has(p.player[0])) return false;
    seen.add(p.player[0]);
    return true;
  });
}

function NumberLine({
  raw,
  shrunk,
  min,
  max,
}: {
  raw: number;
  shrunk: number;
  min: number;
  max: number;
}) {
  const at = (x: number) => `${((Math.min(max, Math.max(min, x)) - min) / (max - min)) * 100}%`;
  const lo = Math.min(raw, shrunk);
  const hi = Math.max(raw, shrunk);
  const rawLeftOfShrunk = raw < shrunk;
  const share = (x: number) => (x - min) / (max - min);
  const anchor = (x: number, outward: "left" | "right") =>
    share(x) > 0.85 ? "-translate-x-full" : share(x) < 0.15 ? "" : outward === "left" ? "-translate-x-full" : "";
  return (
    <div className="relative mx-2 h-20" aria-hidden>
      <div className="absolute inset-x-0 top-9 h-px bg-foreground/25" />
      <div
        className="absolute top-[34px] h-[5px] rounded-full bg-[var(--chart-3)]/30"
        style={{ left: at(lo), width: `calc(${at(hi)} - ${at(lo)})` }}
      />
      <div className="absolute top-6 h-6 w-px -translate-x-1/2 bg-foreground/50" style={{ left: at(0) }} />
      <span
        className={cn(type.micro, "absolute top-0 -translate-x-1/2 whitespace-nowrap font-semibold text-muted-foreground")}
        style={{ left: at(0) }}
      >
        Prior 0
      </span>
      <span
        className="absolute top-[30px] h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-foreground bg-background"
        style={{ left: at(raw) }}
      />
      <span
        className="absolute top-[30px] h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-[var(--chart-3)] ring-2 ring-background"
        style={{ left: at(shrunk) }}
      />
      <span
        className={cn(
          type.caption,
          "absolute top-12 whitespace-nowrap font-semibold tabular-nums",
          anchor(raw, rawLeftOfShrunk ? "left" : "right")
        )}
        style={{ left: at(raw) }}
      >
        Raw {signed(raw, 1)}
      </span>
      <span
        className={cn(
          type.caption,
          "absolute top-12 whitespace-nowrap font-semibold tabular-nums text-[var(--chart-3)]",
          anchor(shrunk, rawLeftOfShrunk ? "right" : "left")
        )}
        style={{ left: at(shrunk) }}
      >
        DRBL/100 {signed(shrunk, 2)}
      </span>
    </div>
  );
}

/** Raw rate vs published DRBL/100 for a real season, plus a what-if calculator. */
export function DrblShrinkageExplorer({
  season,
  players,
  minPossessions,
}: {
  season: string;
  players: ShrinkagePlayer[];
  minPossessions: number;
}) {
  const presets = useMemo(() => pickPresets(players), [players]);
  const byName = useMemo(() => [...players].sort((a, b) => a[1].localeCompare(b[1])), [players]);
  const first = presets[0]?.player ?? players[0]!;
  const [selectedId, setSelectedId] = useState<string | null>(first[0]);
  const [n, setN] = useState(first[2]);
  const [raw, setRaw] = useState(first[3]);

  const selected = selectedId ? players.find((p) => p[0] === selectedId) ?? null : null;
  const weight = rho(n);
  const shrunk = selected ? selected[4] : weight * raw;

  const xMin = Math.floor(Math.min(...players.map((p) => p[3])));
  const xMax = Math.ceil(Math.max(...players.map((p) => p[3])));
  const yAbs = Math.ceil(Math.max(...players.map((p) => Math.abs(p[4]))));
  const yMin = -yAbs;
  const yMax = yAbs;
  const left = (x: number) => ((x - xMin) / (xMax - xMin)) * 100;
  const bottom = (y: number) => ((y - yMin) / (yMax - yMin)) * 100;
  const svgY = (y: number) => 100 - bottom(y);

  const choose = (p: ShrinkagePlayer) => {
    setSelectedId(p[0]);
    setN(p[2]);
    setRaw(p[3]);
  };

  const zero = useMemo(() => {
    const share = (rows: ShrinkagePlayer[]) =>
      rows.length ? rows.filter((p) => p[4] < 0).length / rows.length : null;
    const sorted = players.map((p) => p[4]).sort((a, b) => a - b);
    const regulars = players.filter((p) => p[2] >= 4000);
    return {
      below: share(players),
      median: sorted.length ? sorted[Math.floor(sorted.length / 2)]! : null,
      regulars: regulars.length,
      regularsBelow: share(regulars),
    };
  }, [players]);

  const subject = selected ? selected[1] : "This made-up player";
  const sentence =
    `${subject} has a raw ${signed(raw, 1)} over ${n.toLocaleString()} possessions. ` +
    `The sample counts for ${pct(weight)} and the prior of zero for ${pct(1 - weight)}, ` +
    `so DRBL/100 is ${signed(shrunk, 2)}.`;

  return (
    <section className="sports-card flex flex-col gap-4 p-4 sm:p-5" aria-labelledby="shrinkage-heading">
      <div className="flex flex-col gap-1">
        <h2 id="shrinkage-heading" className="text-[18px] font-bold">
          Why small samples get pulled toward zero
        </h2>
      </div>

      <div className={cn(type.body, "flex max-w-3xl flex-col gap-3")}>
        <p>
          A player&apos;s raw rate swings a lot when he hasn&apos;t played much. A few good weeks can put
          a bench player far above everyone else per 100 possessions, and a few bad ones can sink him just
          as far. Most of that swing is luck, so DRBL doesn&apos;t use the raw rate as his rating.
        </p>
        <p>
          DRBL/100 starts every player at 0 and moves toward his raw rate as he plays. Possessions count
          on both offense and defense. The starting guess is worth {K.toLocaleString()} possessions, so a
          player&apos;s own numbers count for {pct(rho(400))} at 400 possessions, half at{" "}
          {K.toLocaleString()}, and {pct(rho(6400))} at 6,400.
        </p>
        <p>
          A hot or cold start barely moves DRBL/100. Only players who keep it up over thousands of
          possessions reach the top or bottom of the board. On the chart, the amber dots (small samples)
          sit close to the flat zero line, and the green dots (big samples) sit near the diagonal.
        </p>
      </div>

      <p className={cn(type.bodySm, "text-muted-foreground")}>
        Each dot is a {season} player. Across is his raw rate, up is his published DRBL/100. With no
        shrinkage every dot would sit on the dashed diagonal. Tap a dot or move the sliders.
      </p>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Example players">
        {presets.map(({ label, player }) => (
          <button
            key={player[0]}
            type="button"
            onClick={() => choose(player)}
            aria-pressed={player[0] === selectedId}
            className={cn(
              type.caption,
              "flex flex-col items-start rounded-md border px-3 py-1.5 text-left transition-colors",
              player[0] === selectedId
                ? "border-foreground bg-foreground text-background"
                : "border-border hover:bg-secondary"
            )}
          >
            <span className="font-semibold">{player[1]}</span>
            <span className={player[0] === selectedId ? "opacity-75" : "text-muted-foreground"}>
              {label} · {player[2].toLocaleString()} poss.
            </span>
          </button>
        ))}
      </div>

      <div className="relative mt-4 pb-6 pl-8">
        <div className="relative h-72">
        {ticks(yMin, yMax).map((t) => (
          <span
            key={`yl${t}`}
            className={cn(type.micro, "absolute -left-8 w-6 translate-y-1/2 text-right tabular-nums text-muted-foreground")}
            style={{ bottom: `${bottom(t)}%` }}
          >
            {t > 0 ? `+${t}` : t}
          </span>
        ))}
        <span
          className={cn(type.micro, "absolute -left-8 -top-5 whitespace-nowrap font-semibold text-muted-foreground")}
        >
          ↑ DRBL/100
        </span>
        <div className="absolute inset-0 overflow-hidden rounded-sm">
          {ticks(xMin, xMax).map((t) => (
            <div
              key={`x${t}`}
              aria-hidden
              className={cn("absolute inset-y-0 w-px", t === 0 ? "bg-foreground/30" : "bg-foreground/[0.07]")}
              style={{ left: `${left(t)}%` }}
            />
          ))}
          {ticks(yMin, yMax).map((t) => (
            <div
              key={`y${t}`}
              aria-hidden
              className={cn("absolute inset-x-0 h-px", t === 0 ? "bg-foreground/30" : "bg-foreground/[0.07]")}
              style={{ bottom: `${bottom(t)}%` }}
            />
          ))}
          <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line
              x1={left(xMin)}
              y1={svgY(xMin)}
              x2={left(xMax)}
              y2={svgY(xMax)}
              stroke="currentColor"
              strokeOpacity={0.45}
              strokeDasharray="5 4"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={left(xMin)}
              y1={svgY(weight * xMin)}
              x2={left(xMax)}
              y2={svgY(weight * xMax)}
              stroke="var(--chart-3)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {players.map((p) => (
            <button
              key={p[0]}
              type="button"
              tabIndex={-1}
              aria-hidden
              title={`${p[1]}: raw ${signed(p[3], 1)}, DRBL/100 ${signed(p[4], 2)}, ${p[2].toLocaleString()} poss.`}
              onClick={() => choose(p)}
              onMouseEnter={() => choose(p)}
              className="absolute flex h-3 w-3 -translate-x-1/2 translate-y-1/2 items-center justify-center"
              style={{ left: `${left(p[3])}%`, bottom: `${bottom(p[4])}%` }}
            >
              <span className={cn("block h-[7px] w-[7px] rounded-full opacity-70", BAND_STYLE[bandOf(p[2])])} />
            </button>
          ))}
          {raw >= xMin && raw <= xMax && Math.abs(shrunk) <= yAbs ? (
            <span
              aria-hidden
              className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 translate-y-1/2 rounded-full border-[3px] border-foreground bg-background/40"
              style={{ left: `${left(raw)}%`, bottom: `${bottom(shrunk)}%` }}
            />
          ) : null}
        </div>
        </div>
        <div className="relative mt-1 h-4">
          {ticks(xMin, xMax).map((t) => (
            <span
              key={`xl${t}`}
              className={cn(type.micro, "absolute -translate-x-1/2 tabular-nums text-muted-foreground")}
              style={{ left: `${left(t)}%` }}
            >
              {t > 0 ? `+${t}` : t}
            </span>
          ))}
        </div>
        <p className={cn(type.micro, "absolute bottom-0 right-0 font-semibold text-muted-foreground")}>
          Raw rate per 100 possessions <span data-motion-arrow aria-hidden>→</span>
        </p>
      </div>

      <ul className={cn(type.caption, "flex flex-wrap gap-x-4 gap-y-1.5 text-muted-foreground")}>
        {(Object.keys(BAND_LABEL) as Band[]).map((b) => (
          <li key={b} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("h-2.5 w-2.5 rounded-full", BAND_STYLE[b])} />
            {BAND_LABEL[b]}
          </li>
        ))}
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="w-4 border-t-2 border-dashed border-foreground/45" />
          No shrinkage
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="w-4 border-t-2 border-[var(--chart-3)]" />
          Where every player with {n.toLocaleString()} possessions lands
        </li>
      </ul>

      <div className="grid gap-4 rounded-md bg-foreground/[0.04] p-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={cn(type.caption, "flex justify-between font-semibold")}>
            <span>Possessions</span>
            <span className="tabular-nums">{n.toLocaleString()}</span>
          </span>
          <input
            type="range"
            min={0}
            max={1000}
            value={nToSlider(n)}
            onChange={(e) => {
              setSelectedId(null);
              setN(sliderToN(Number(e.target.value)));
            }}
            className="accent-[var(--chart-3)]"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={cn(type.caption, "flex justify-between font-semibold")}>
            <span>Raw rate</span>
            <span className="tabular-nums">{signed(raw, 1)}</span>
          </span>
          <input
            type="range"
            min={xMin}
            max={xMax}
            step={0.1}
            value={raw}
            onChange={(e) => {
              setSelectedId(null);
              setRaw(Number(e.target.value));
            }}
            className="accent-[var(--chart-3)]"
          />
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={cn(type.caption, "font-semibold")}>Or pick any player</span>
          <select
            value={selectedId ?? ""}
            onChange={(e) => {
              const p = players.find((row) => row[0] === e.target.value);
              if (p) choose(p);
            }}
            className={cn(type.bodySm, "rounded-md border border-border bg-background px-2 py-1.5")}
          >
            <option value="">Made-up player from the sliders</option>
            {byName.map((p) => (
              <option key={p[0]} value={p[0]}>
                {p[1]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-2" aria-live="polite">
        <p className={cn(type.bodySm, "max-w-3xl")}>{sentence}</p>
        <div className="flex h-6 overflow-hidden rounded-sm text-[12px] font-semibold" aria-hidden>
          <div
            className="flex items-center overflow-hidden whitespace-nowrap bg-[var(--chart-3)] px-2 text-white"
            style={{ width: `${weight * 100}%` }}
          >
            {weight >= 0.18 ? `Sample ${pct(weight)}` : null}
          </div>
          <div className="flex flex-1 items-center justify-end overflow-hidden whitespace-nowrap bg-foreground/15 px-2">
            {weight <= 0.82 ? `Prior ${pct(1 - weight)}` : null}
          </div>
        </div>
        <NumberLine raw={raw} shrunk={shrunk} min={xMin} max={xMax} />
      </div>

      <div className="flex max-w-3xl flex-col gap-1.5 rounded-md border border-border/60 p-3 sm:p-4">
        <h3 className="text-[15px] font-bold">What a DRBL/100 of 0 means</h3>
        <p className={type.bodySm}>
          Zero is average. It means the player produced what DRBL expects from someone in his role, and a
          negative number means he fell short of that expectation. Since zero is the middle, roughly half
          the league lands on each side.
          {zero.below != null && zero.median != null ? (
            <>
              {" "}
              In {season}, {pct(zero.below)} of these players are below zero and the median is{" "}
              {signed(zero.median, 2)}.
            </>
          ) : null}
          {zero.regularsBelow != null && zero.regulars >= 20 ? (
            <>
              {" "}
              Among the {zero.regulars} players with 4,000 or more possessions, {pct(zero.regularsBelow)} are
              below zero. That fits teams giving the most minutes to players who help them.
            </>
          ) : null}
        </p>
      </div>

      <p className={cn(type.caption, "text-muted-foreground")}>
        Players with at least {minPossessions} possessions in {season}. The prior is worth {K.toLocaleString()}{" "}
        possessions, so at {K.toLocaleString()} possessions the sample and the prior count equally.
        {selected ? (
          <>
            {" "}
            <AppLink
              href={`/players/${selected[0]}`}
              className="font-semibold text-foreground underline-offset-2 hover:underline"
            >
              Open {selected[1]}&apos;s page <span data-motion-arrow aria-hidden>→</span>
            </AppLink>
          </>
        ) : null}
      </p>
    </section>
  );
}

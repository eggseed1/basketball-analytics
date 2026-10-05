import { SegmentedControl } from "@/components/ui/segmented-control";
import type { OnOffView } from "@/lib/on-off/metrics";
import { Z95 } from "@/lib/on-off/derive";
import type { OnOffPhase } from "@/lib/on-off/types";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export const VIEW_OPTIONS: Array<{ id: OnOffView; label: string }> = [
  { id: "clean", label: "Filtered" },
  { id: "all", label: "All possessions" },
  { id: "clutch", label: "Clutch" },
];

export function OnOffViewToggle({
  value,
  onChange,
}: {
  value: OnOffView;
  onChange: (v: OnOffView) => void;
}) {
  return <SegmentedControl size="sm" value={value} options={VIEW_OPTIONS} onChange={onChange} />;
}

const PHASE_OPTIONS: Array<{ id: OnOffPhase; label: string }> = [
  { id: "regular", label: "Regular season" },
  { id: "playoffs", label: "Playoffs" },
];

export function OnOffPhaseToggle({
  value,
  onChange,
}: {
  value: OnOffPhase;
  onChange: (v: OnOffPhase) => void;
}) {
  return <SegmentedControl size="sm" value={value} options={PHASE_OPTIONS} onChange={onChange} />;
}

export function phaseLabel(phase: OnOffPhase): string {
  return phase === "playoffs" ? "playoffs" : "regular season";
}

const MINUS = "\u2212";

export function fmtRating(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const r = Number(v.toFixed(1));
  return r < 0 ? `${MINUS}${Math.abs(r).toFixed(1)}` : Math.abs(r).toFixed(1);
}

export function fmtSigned(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const r = Number(v.toFixed(digits));
  if (r === 0) return (0).toFixed(digits);
  return `${r > 0 ? "+" : MINUS}${Math.abs(r).toFixed(digits)}`;
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  return v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(digits)}%`;
}

export function fmtSignedPts(v: number | null | undefined, digits = 1): string {
  return v == null || !Number.isFinite(v) ? "—" : fmtSigned(v * 100, digits);
}

/** DRBL/100 player rating, two decimals with a sign. */
export function fmtRatingDelta(v: number | null | undefined): string {
  return fmtSigned(v, 2);
}

export function fmtCount(v: number): string {
  return Math.round(v).toLocaleString("en-US");
}

/** Text color for a difference where `good` says which direction helps the team. */
export function toneClass(diff: number | null | undefined, higherIsBetter = true): string {
  if (diff == null || !Number.isFinite(diff) || Math.abs(diff) < 0.05) return "text-muted-foreground";
  return diff > 0 === higherIsBetter ? "text-data-positive" : "text-data-negative";
}

export function rangeLabel(center: number | null, se: number | null): string | null {
  if (center == null || se == null) return null;
  return `${fmtSigned(center - Z95 * se)} to ${fmtSigned(center + Z95 * se)}`;
}

export function percentileLabel(p: number | null): string {
  if (p == null) return "—";
  const mod100 = p % 100;
  const mod10 = p % 10;
  const suffix =
    mod100 >= 11 && mod100 <= 13 ? "th" : mod10 === 1 ? "st" : mod10 === 2 ? "nd" : mod10 === 3 ? "rd" : "th";
  return `${p}${suffix}`;
}

export function Dumbbell({
  on,
  off,
  min,
  max,
  color,
}: {
  on: number;
  off: number;
  min: number;
  max: number;
  color: string;
}) {
  const pos = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  const left = Math.min(on, off);
  const right = Math.max(on, off);
  return (
    <div className="relative h-5" aria-hidden>
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground/10" />
      <div
        className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-foreground/20"
        style={{ left: pos(left), width: `calc(${pos(right)} - ${pos(left)})` }}
      />
      <span
        className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-muted-foreground/60 bg-background"
        style={{ left: pos(off) }}
      />
      <span
        className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background"
        style={{ left: pos(on), background: color }}
      />
    </div>
  );
}

export function SmallSampleTag() {
  return (
    <span className={cn(type.caption, "rounded-md bg-foreground/[0.07] px-1.5 py-0.5 font-semibold")}>
      Small sample
    </span>
  );
}

export function OnOffMethodNote({ className }: { className?: string }) {
  return (
    <div className={cn(type.caption, "flex flex-col gap-1.5 text-muted-foreground", className)}>
      <p>
        Ratings are points per 100 possessions, built from NBA play-by-play with every
        possession tagged by the ten players on the floor. Filtered leaves out garbage time,
        using the Cleaning the Glass definition, and possessions that start with 2 seconds or
        less on the clock. Clutch follows the NBA definition: the last five minutes of the
        fourth quarter or overtime with the score within five.
      </p>
      <p>
        Teammate and opponent quality average each player&apos;s season DRBL/100 over the
        possessions they played. It shows whether someone&apos;s minutes came with stronger
        lineups or against them. Players without a DRBL rating are left out of the average.
        Playoff splits use the same regular-season ratings and have no league rank, since
        playoff teams play anywhere from 4 to 28 games.
      </p>
      <p>
        Luck-adjusted sets opponents&apos; 3-point and free-throw percentages to league average,
        since defenses shape those shots but have little say in whether they fall. The range
        covers about 95% of the outcomes you would get from possession-to-possession noise
        alone.
      </p>
      <p>
        On/off follows the whole lineup. Teammates, opponents and the players who replace him
        all move it, so read it as context for a player&apos;s value. It does not measure that
        value by itself.
      </p>
    </div>
  );
}

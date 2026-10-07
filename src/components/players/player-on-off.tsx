import type { CSSProperties } from "react";

import { GlassSurface } from "@/components/brand/glass-surface";
import { teamColorAuto } from "@/components/players/player-play-types";
import type { OnOffSide, PlayerOnOffStint } from "@/data/runtime/on-off-snapshot";
import { type } from "@/lib/design-system";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Below this many on-court minutes the split mostly reflects noise. */
const SMALL_SAMPLE_MINUTES = 300;

const METRICS: Array<{
  key: keyof Omit<OnOffSide, "minutes">;
  label: string;
  /** True when a lower number is better for the team. */
  lowerIsBetter?: boolean;
}> = [
  { key: "ortg", label: "Offensive rating" },
  { key: "drtg", label: "Defensive rating", lowerIsBetter: true },
  { key: "net", label: "Net rating" },
];

function signed(n: number) {
  const v = Math.round(n * 10) / 10;
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`;
}

function toneClass(good: boolean | null) {
  if (good == null) return "text-muted-foreground";
  return good ? "text-data-positive" : "text-data-negative";
}

function Dumbbell({
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
        data-motion-bar="x"
        className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-foreground/20"
        style={{ left: pos(left), width: `calc(${pos(right)} - ${pos(left)})`, transformOrigin: on >= off ? "left" : "right" }}
      />
      <span
        data-motion-dot
        className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-muted-foreground/60 bg-background"
        style={{ left: pos(off) }}
      />
      <span
        data-motion-mark
        className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background"
        style={{ left: pos(on), background: color, "--mark-from": pos(off) } as CSSProperties}
      />
    </div>
  );
}

export function PlayerOnOffCard({
  stints,
  playerName,
  teamKey,
}: {
  stints: PlayerOnOffStint[];
  playerName: string;
  teamKey?: string | null;
}) {
  const main = stints[0]!;
  const others = stints.slice(1);
  const color = teamColorAuto(main.teamAbbr ?? teamKey);
  const swing = main.on.net - main.off.net;
  const small = main.on.minutes < SMALL_SAMPLE_MINUTES || main.off.minutes < SMALL_SAMPLE_MINUTES;

  return (
    <GlassSurface effect="css" className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={type.heading}>On/off</h2>
          <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
            {main.teamAbbr ?? "Team"} per 100 possessions with {playerName} on the floor and off it,{" "}
            {main.season} regular season.
          </p>
        </div>
        <div className="text-right">
          <p className={cn(type.micro, "font-semibold uppercase tracking-[0.1em] text-muted-foreground")}>
            Net swing
          </p>
          <p className={cn("text-2xl font-bold tabular-nums", toneClass(swing === 0 ? null : swing > 0))}>
            {signed(swing)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className={cn(type.caption, "inline-flex items-center gap-1.5 text-muted-foreground")}>
          <span aria-hidden className="size-3 rounded-full" style={{ background: color }} />
          On · {formatNumber(main.on.minutes, 0)} min
        </span>
        <span className={cn(type.caption, "inline-flex items-center gap-1.5 text-muted-foreground")}>
          <span aria-hidden className="size-3 rounded-full border-2 border-muted-foreground/60" />
          Off · {formatNumber(main.off.minutes, 0)} min
        </span>
        {small ? (
          <span className={cn(type.caption, "rounded-md bg-foreground/[0.07] px-1.5 py-0.5 font-semibold")}>
            Small sample
          </span>
        ) : null}
      </div>

      <ul data-hover-group className="flex flex-col gap-4">
        {METRICS.map((metric) => {
          const on = main.on[metric.key];
          const off = main.off[metric.key];
          const diff = on - off;
          const good = diff === 0 ? null : metric.lowerIsBetter ? diff < 0 : diff > 0;
          const lo = Math.min(on, off);
          const hi = Math.max(on, off);
          const pad = Math.max(3, (hi - lo) * 0.6);
          return (
            <li key={metric.key} data-hover-item className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className={cn(type.bodySm, "font-semibold")}>
                  {metric.label}
                  {metric.lowerIsBetter ? (
                    <span className={cn(type.caption, "ml-1.5 font-normal text-muted-foreground")}>
                      lower is better
                    </span>
                  ) : null}
                </span>
                <span className={cn(type.caption, "flex items-baseline gap-3 tabular-nums")}>
                  <span className="text-muted-foreground">
                    On <span className="font-semibold text-foreground">{on.toFixed(1)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Off <span className="font-semibold text-foreground">{off.toFixed(1)}</span>
                  </span>
                  <span className={cn("w-12 text-right font-bold", toneClass(good))}>{signed(diff)}</span>
                </span>
              </div>
              <Dumbbell on={on} off={off} min={lo - pad} max={hi + pad} color={color} />
            </li>
          );
        })}
      </ul>

      {others.length ? (
        <p className={cn(type.caption, "text-muted-foreground")}>
          Also played for{" "}
          {others
            .map(
              (s) =>
                `${s.teamAbbr ?? "another team"} (net swing ${signed(s.on.net - s.off.net)} in ${formatNumber(s.on.minutes, 0)} min)`
            )
            .join(", ")}
          .
        </p>
      ) : null}

      <p className={cn(type.caption, "text-muted-foreground")}>
        On/off tracks the whole lineup, so teammates, opponents and minutes against bench units all
        shape it. Read it as context, not as the player&apos;s value alone. Source: NBA Stats.
      </p>
    </GlassSurface>
  );
}

"use client";

import { useScoreDelaySeconds } from "@/components/sports/use-score-delay";
import {
  SCORE_DELAY_MAX_SECONDS,
  scoreDelayLabel,
  writeScoreDelay,
} from "@/lib/score-delay";
import { cn } from "@/lib/utils";

/** Slider from off to five minutes, one-second steps so it can match a stream exactly. */
export function ScoreDelaySlider({ className }: { className?: string }) {
  const delay = useScoreDelaySeconds();
  const label = scoreDelayLabel(delay);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-semibold">Delay live scores</span>
        <span className="text-[14px] font-semibold tabular-nums">{label}</span>
      </div>
      <input
        type="range"
        min={0}
        max={SCORE_DELAY_MAX_SECONDS}
        step={1}
        value={delay}
        aria-label="Live score delay in seconds"
        aria-valuetext={label}
        onChange={(e) => writeScoreDelay(Number(e.target.value))}
        className="w-full accent-current"
      />
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>Off</span>
        <span>{scoreDelayLabel(SCORE_DELAY_MAX_SECONDS)}</span>
      </div>
      <p className="text-[12px] text-muted-foreground">
        Match the lag on your stream. Scores, lineups, box scores and plays stay this far behind the
        live game.
      </p>
      {delay ? (
        <button
          type="button"
          onClick={() => writeScoreDelay(0)}
          className="self-start rounded-md border border-border px-2.5 py-1 text-[13px] font-semibold transition hover:bg-muted"
        >
          Turn off
        </button>
      ) : null}
    </div>
  );
}

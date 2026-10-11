"use client";

import { Popover } from "@base-ui/react/popover";
import { Timer } from "lucide-react";

import { FrostFloatingSurface } from "@/components/brand/frost-floating-surface";
import { useScoreDelaySeconds } from "@/components/sports/use-score-delay";
import {
  SCORE_DELAY_MAX_SECONDS,
  scoreDelayLabel,
  scoreDelayShortLabel,
  writeScoreDelay,
} from "@/lib/score-delay";
import { stripFloatingTransform } from "@/lib/strip-floating-transform";
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

/** Header button that opens the delay slider. */
export function ScoreDelayControl() {
  const delay = useScoreDelaySeconds();
  const title = delay ? `Live scores delayed ${scoreDelayLabel(delay)}` : "Delay live scores";
  return (
    <Popover.Root modal={false}>
      <Popover.Trigger
        type="button"
        aria-label={title}
        title={title}
        className={cn(
          "flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md text-foreground transition hover:bg-muted",
          delay ? "px-2 text-[13px] font-semibold" : "w-9"
        )}
      >
        <Timer className="size-4" aria-hidden />
        {delay ? <span className="tabular-nums">{scoreDelayShortLabel(delay)}</span> : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 outline-none"
          render={(positionerProps) => (
            <div {...positionerProps} style={stripFloatingTransform(positionerProps.style)} />
          )}
        >
          <Popover.Popup
            aria-label="Live score delay"
            className="w-72 max-w-[calc(100vw-1.5rem)]"
            render={(popupProps) => (
              <FrostFloatingSurface
                {...popupProps}
                className={cn(popupProps.className, "px-3.5 py-3 text-card-foreground")}
              />
            )}
          >
            <ScoreDelaySlider />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

"use client";

import { Timer } from "lucide-react";

import { useScoreDelaySeconds } from "@/components/sports/use-score-delay";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select";
import { SCORE_DELAY_OPTIONS, scoreDelayLabel, writeScoreDelay } from "@/lib/score-delay";
import { cn } from "@/lib/utils";

/** Header control: holds live scores back to match a delayed stream. */
export function ScoreDelayControl({ showLabel = false }: { showLabel?: boolean }) {
  const delay = useScoreDelaySeconds();
  const title = delay ? `Live scores delayed ${scoreDelayLabel(delay)}` : "Delay live scores";
  return (
    <Select
      value={String(delay)}
      onValueChange={(value) => {
        if (value != null) writeScoreDelay(Number(value));
      }}
    >
      <SelectTrigger
        aria-label={title}
        title={title}
        className={cn(
          "h-9 shrink-0 gap-1.5 rounded-md border-0 bg-transparent px-2 text-foreground hover:bg-muted dark:bg-transparent [&>svg:last-child]:hidden",
          delay ? "text-[13px] font-semibold" : showLabel ? "text-[13px]" : "w-9 justify-center px-0"
        )}
      >
        <Timer className="size-4" aria-hidden />
        {delay ? (
          <span className="tabular-nums">{scoreDelayLabel(delay)}</span>
        ) : showLabel ? (
          <span>Off</span>
        ) : null}
      </SelectTrigger>
      <SelectContent align="end" className="min-w-44">
        <SelectGroup>
          <SelectLabel>Delay live scores</SelectLabel>
          {SCORE_DELAY_OPTIONS.map((o) => (
            <SelectItem key={o.seconds} value={String(o.seconds)}>
              {o.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

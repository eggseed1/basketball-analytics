"use client";

import { type } from "@/lib/design-system";
import { formatBirthLine } from "@/lib/player-age";
import { usePlayerViewSeason } from "@/components/players/player-view-season";
import { cn } from "@/lib/utils";

function Dot() {
  return (
    <span className="text-border" aria-hidden>
      ·
    </span>
  );
}

/**
 * Height / weight on one line; birth (+ optional college) on the next.
 * Age follows the selected season (slider / URL).
 */
export function PlayerIdentityVitals({
  heightLabel,
  weightLabel,
  birthDate,
  season,
  college,
  className,
}: {
  heightLabel?: string | null;
  weightLabel?: string | null;
  birthDate?: string | null;
  season: string;
  college?: string | null;
  className?: string;
}) {
  const viewSeason = usePlayerViewSeason(season);
  const birthLine = formatBirthLine(birthDate, viewSeason);
  const collegeLabel = college?.trim() || null;

  const physical = [heightLabel, weightLabel].filter(Boolean) as string[];
  const hasBirth = Boolean(birthLine);
  if (!physical.length && !hasBirth && !collegeLabel) return null;

  return (
    <div
      className={cn(
        type.caption,
        "mt-0.5 flex flex-col items-center gap-0.5 text-muted-foreground",
        className
      )}
    >
      {physical.length ? (
        <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 sm:justify-start">
          {physical.map((bit, i) => (
            <span key={bit} className="inline-flex items-center gap-2">
              {i > 0 ? <Dot /> : null}
              <span>{bit}</span>
            </span>
          ))}
        </p>
      ) : null}
      {hasBirth || collegeLabel ? (
        <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 sm:justify-start">
          {birthLine ? <span>{birthLine}</span> : null}
          {birthLine && collegeLabel ? <Dot /> : null}
          {collegeLabel ? <span>{collegeLabel}</span> : null}
        </p>
      ) : null}
    </div>
  );
}

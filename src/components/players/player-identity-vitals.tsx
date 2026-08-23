"use client";

import { type } from "@/lib/design-system";
import { formatBirthLine } from "@/lib/player-age";
import { usePlayerViewSeason } from "@/components/players/player-view-season";
import { cn } from "@/lib/utils";

/**
 * Height / weight stay fixed; age follows the selected season (slider / URL).
 */
export function PlayerIdentityVitals({
  heightLabel,
  weightLabel,
  birthDate,
  season,
  className,
}: {
  heightLabel?: string | null;
  weightLabel?: string | null;
  birthDate?: string | null;
  season: string;
  className?: string;
}) {
  const viewSeason = usePlayerViewSeason(season);
  const birthLine = formatBirthLine(birthDate, viewSeason);
  const bits = [heightLabel, weightLabel, birthLine].filter(Boolean);
  if (!bits.length) return null;

  return (
    <p
      className={cn(
        type.caption,
        "mt-1 flex flex-wrap items-center justify-center gap-x-2 text-muted-foreground",
        className
      )}
    >
      {bits.map((bit, i) => (
        <span key={bit} className="inline-flex items-center gap-2">
          {i > 0 ? (
            <span className="text-border" aria-hidden>
              ·
            </span>
          ) : null}
          <span>{bit}</span>
        </span>
      ))}
    </p>
  );
}

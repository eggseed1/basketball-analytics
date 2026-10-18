import { type } from "@/lib/design-system";
import { priorSeasonStatsNotice } from "@/lib/player-board-season";
import { cn } from "@/lib/utils";

export function PriorSeasonStatsNotice({
  requestSeason,
  statsSeason,
  className,
  variant = "card",
}: {
  requestSeason: string;
  statsSeason: string;
  className?: string;
  /** Card sits in a section. Banner is one quiet line. */
  variant?: "card" | "banner";
}) {
  if (requestSeason === statsSeason) return null;
  return (
    <div
      role="status"
      className={cn(
        variant === "banner"
          ? "type-caption text-muted-foreground"
          : "rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground",
        className
      )}
    >
      <p>
        <span className="font-medium text-foreground">Preseason.</span>{" "}
        {priorSeasonStatsNotice(requestSeason, statsSeason)}
      </p>
    </div>
  );
}

export function SeasonNotStartedNotice({
  season,
  statsSeason,
}: {
  season: string;
  statsSeason?: string;
}) {
  if (statsSeason && statsSeason !== season) {
    return (
      <PriorSeasonStatsNotice requestSeason={season} statsSeason={statsSeason} />
    );
  }

  return (
    <div
      role="status"
      className={cn(
        type.bodySm,
        "rounded-lg border border-border bg-muted/40 px-3 py-2 text-muted-foreground"
      )}
    >
      <p>
        <span className="font-medium text-foreground">
          Season hasn&apos;t started yet.
        </span>{" "}
        {season} rosters are listed below. Stat columns show placeholders until
        regular-season games are played.
      </p>
    </div>
  );
}

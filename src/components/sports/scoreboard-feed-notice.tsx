import type { ScoreboardFeedSource } from "@/data/queries/scoreboard-feed";
import { cn } from "@/lib/utils";

/**
 * Subtle notice when scoreboard/gamefeed is stale or unavailable.
 * Never implies cached data is live.
 */
export function ScoreboardFeedNotice({
  source,
  warnings,
  className,
}: {
  source?: ScoreboardFeedSource;
  warnings?: string[];
  className?: string;
}) {
  if (!source || source === "live-espn") return null;
  const message =
    warnings?.[0] ??
    (source === "cached-espn"
      ? "Showing recently cached scoreboard data - not a live update."
      : "Live scores temporarily unavailable.");

  return (
    <p
      className={cn(
        "border-l-2 border-border pl-2 text-[12px] text-muted-foreground",
        className
      )}
      role="status"
    >
      {message}
    </p>
  );
}

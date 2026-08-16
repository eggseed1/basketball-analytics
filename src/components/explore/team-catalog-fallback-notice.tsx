import type { TeamCatalogSource } from "@/data/queries/teams-catalog";
import { cn } from "@/lib/utils";

/**
 * Subtle notice when Explore uses verified identity instead of live ESPN teams.
 * Hidden when live metadata succeeds.
 */
export function TeamCatalogFallbackNotice({
  source,
  warnings,
}: {
  source: TeamCatalogSource;
  warnings: string[];
}) {
  if (source === "live-espn" || source === "local-sample") return null;
  if (!warnings.length) return null;

  return (
    <p
      className={cn(
        "text-[12px] text-muted-foreground",
        source === "canonical-fallback" || source === "cached-espn"
          ? "border-l-2 border-border pl-2"
          : null
      )}
      role="status"
    >
      {warnings[0]}
    </p>
  );
}

import { Suspense } from "react";

import { StandingsTrackerView } from "@/components/standings/standings-tracker-view";
import {
  getStandingsTrackerPayload,
  getStandingsTrackerSeasonOptions,
} from "@/data/queries/standings-tracker";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

async function StandingsTrackerBody({ season }: { season: string }) {
  try {
    const [payload, seasonOptions] = await Promise.all([
      getStandingsTrackerPayload(season),
      Promise.resolve(getStandingsTrackerSeasonOptions()),
    ]);

    return (
      <Suspense
        fallback={
          <div className="sports-card h-[480px] animate-pulse bg-secondary/40" />
        }
      >
        <StandingsTrackerView payload={payload} seasonOptions={seasonOptions} />
      </Suspense>
    );
  } catch (error) {
    console.error("[standings-tracker] failed", {
      season,
      error: error instanceof Error ? error.message : String(error),
    });
    return (
      <div className="sports-card px-4 py-10 text-center">
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          Standings tracker unavailable for {season}. Try another season or
          refresh.
        </p>
      </div>
    );
  }
}

export function StandingsTrackerIsland({ season }: { season: string }) {
  return (
    <Suspense
      fallback={
        <div className="sports-card h-[480px] animate-pulse bg-secondary/40" />
      }
    >
      <StandingsTrackerBody season={season} />
    </Suspense>
  );
}

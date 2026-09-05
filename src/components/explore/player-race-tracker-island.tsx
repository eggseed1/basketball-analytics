import { Suspense } from "react";

import { PlayerRaceTrackerView } from "@/components/explore/player-race-tracker-view";
import {
  getPlayerRaceTrackerPayload,
  getPlayerRaceTrackerSeasonOptions,
} from "@/data/queries/player-race-tracker";
import { type } from "@/lib/design-system";
import type { PlayerRaceFieldSize } from "@/lib/player-race-tracker";
import { cn } from "@/lib/utils";

async function PlayerRaceTrackerBody({
  season,
  metric,
  topN,
  pin,
  team,
  rankEnd,
  minMinutes,
}: {
  season: string;
  metric?: string;
  topN?: PlayerRaceFieldSize | number;
  pin?: string;
  team?: string;
  rankEnd?: string;
  minMinutes?: number;
}) {
  try {
    const [payload, seasonOptions] = await Promise.all([
      getPlayerRaceTrackerPayload(
        season,
        metric,
        topN,
        pin,
        rankEnd,
        minMinutes,
        team
      ),
      getPlayerRaceTrackerSeasonOptions(),
    ]);

    return (
      <PlayerRaceTrackerView
        payload={payload}
        seasonOptions={
          seasonOptions.length ? seasonOptions : [payload.season]
        }
      />
    );
  } catch (error) {
    console.error("[player-race-tracker] failed", {
      season,
      metric,
      error: error instanceof Error ? error.message : String(error),
    });
    return (
      <div className="sports-card px-4 py-10 text-center">
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          Player race tracker unavailable for {season}. Try another season or
          metric.
        </p>
      </div>
    );
  }
}

export function PlayerRaceTrackerIsland({
  season,
  metric,
  topN,
  pin,
  team,
  rankEnd,
  minMinutes,
}: {
  season: string;
  metric?: string;
  topN?: PlayerRaceFieldSize | number;
  pin?: string;
  team?: string;
  rankEnd?: string;
  minMinutes?: number;
}) {
  return (
    <Suspense
      fallback={
        <div className="sports-card h-[480px] animate-pulse bg-secondary/40" />
      }
    >
      <PlayerRaceTrackerBody
        season={season}
        metric={metric}
        topN={topN}
        pin={pin}
        team={team}
        rankEnd={rankEnd}
        minMinutes={minMinutes}
      />
    </Suspense>
  );
}

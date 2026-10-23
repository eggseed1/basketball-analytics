import { Suspense } from "react";

import { SeasonFlowChart } from "@/components/teams/overview/season-flow-chart";
import {
  QuarterProfile,
  SplitsPanel,
} from "@/components/teams/overview/team-overview-panels";
import { TeamScoringShareIsland } from "@/components/teams/overview/team-scoring-share-island";

/**
 * Game-backed overview charts. Dynamic-imports team-overview-data so the
 * 1.4MB schedule snapshot stays off the overview shell module graph.
 */
export async function TeamOverviewSeasonFlow({
  teamId,
  teamKey,
  season,
}: {
  teamId: string;
  teamKey: string;
  season: string;
}) {
  const { ensureGameSnapshotLite } = await import(
    "@/data/runtime/game-snapshot"
  );
  await ensureGameSnapshotLite();
  const { buildSeasonHighlights, buildSeasonTrajectory } = await import(
    "@/lib/team-overview-data"
  );
  const trajectory = buildSeasonTrajectory(teamId, season);
  if (!trajectory.length) return null;
  const highlights = buildSeasonHighlights(teamId, season, trajectory);
  return (
    <SeasonFlowChart
      games={trajectory}
      highlights={highlights}
      teamKey={teamKey}
      season={season}
    />
  );
}

/** Scoring share, quarter profile, and splits — grid siblings with StrengthsPanel. */
export async function TeamOverviewGameGrid({
  teamId,
  teamKey,
  season,
}: {
  teamId: string;
  teamKey: string;
  season: string;
}) {
  const { ensureGameSnapshotLite } = await import(
    "@/data/runtime/game-snapshot"
  );
  await ensureGameSnapshotLite();
  const { buildQuarterProfile, buildSplitsBundle } = await import(
    "@/lib/team-overview-data"
  );
  const quarters = buildQuarterProfile(teamId, season);
  const splits = buildSplitsBundle(teamId, season);

  return (
    <>
      <Suspense
        fallback={
          <div
            className="sports-card h-72 animate-pulse"
            aria-label="Loading scoring share"
          />
        }
      >
        <TeamScoringShareIsland
          teamId={teamId}
          teamKey={teamKey}
          season={season}
        />
      </Suspense>
      <QuarterProfile
        rows={quarters.rows}
        games={quarters.games}
        season={season}
      />
      <SplitsPanel splits={splits} season={season} />
    </>
  );
}

import { TeamOpeningNight } from "@/components/teams/overview/team-opening-night";
import { nbaTodayIso } from "@/lib/nba-calendar-date";

/**
 * Opening-night facts need the schedule snapshot. Load that module here so
 * the default in-season overview never pulls game-snapshot.
 */
export async function TeamOpeningNightIsland({
  teamId,
  season,
  teamName,
}: {
  teamId: string;
  season: string;
  teamName: string;
}) {
  const { buildScheduleFacts } = await import("@/lib/team-overview-data");
  return (
    <TeamOpeningNight
      facts={buildScheduleFacts(teamId, season, nbaTodayIso())}
      season={season}
      teamId={teamId}
      teamName={teamName}
    />
  );
}

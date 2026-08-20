import { TeamRosterSection } from "@/components/teams/team-roster-section";
import { getTeamRosterCached } from "@/data/queries/request-cache";
import { buildRosterBuckets } from "@/lib/team-explorer";

export async function TeamRosterIsland({
  teamId,
  season,
  teamKey,
}: {
  teamId: string;
  season: string;
  teamKey: string;
}) {
  const roster = await getTeamRosterCached(teamId, season, 10);
  const buckets = buildRosterBuckets(roster.players);

  return (
    <section
      id="roster"
      className="scroll-mt-16 flex flex-col gap-3"
      aria-label="Roster"
    >
      <div>
        <h2 className="text-[20px] font-bold tracking-tight">Who drives it?</h2>
        <p className="text-[14px] text-muted-foreground">
          Compact roster explorer - transparent categories only.
        </p>
      </div>
      <div className="sports-card p-4 sm:p-5">
        <TeamRosterSection
          buckets={buckets}
          season={season}
          teamKey={teamKey}
          teamId={teamId}
          status={roster.status}
          unavailableMessage={roster.warning}
        />
      </div>
    </section>
  );
}

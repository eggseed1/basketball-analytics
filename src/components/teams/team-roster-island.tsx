import { PlayerSeasonTable } from "@/components/explore/player-season-table";
import { TeamRosterSection } from "@/components/teams/team-roster-section";
import { getExplorePlayersBoardView } from "@/data/queries/explore-players-board";
import { getTeamRosterCached } from "@/data/queries/request-cache";
import { buildRosterBuckets } from "@/lib/team-explorer";
import {
  defaultPlayerSeasonSortDir,
  parsePlayerSeasonSortKey,
  type PlayerSeasonSortKey,
} from "@/lib/player-season-sort";

export async function TeamRosterIsland({
  teamId,
  season,
  teamKey,
  sortParam,
  sortDirParam,
}: {
  teamId: string;
  season: string;
  teamKey: string;
  sortParam?: string | null;
  sortDirParam?: string | null;
}) {
  const requestedSort = parsePlayerSeasonSortKey(sortParam ?? undefined) ?? "mpg";
  const requestedDir =
    sortDirParam === "asc" || sortDirParam === "desc"
      ? sortDirParam
      : defaultPlayerSeasonSortDir(requestedSort);

  const [view, roster] = await Promise.all([
    getExplorePlayersBoardView({
      filters: {
        season,
        team: teamId,
        minimumMinutes: 0,
        minimumGames: 0,
      },
      sortKey: requestedSort as PlayerSeasonSortKey,
      sortDir: requestedDir,
      page: 1,
      pageSize: 60,
      includeContext: false,
    }),
    getTeamRosterCached(teamId, season, 0),
  ]);
  const buckets = buildRosterBuckets(
    roster.status === "ok" ? roster.players : []
  );

  return (
    <div className="flex flex-col gap-6">
      <section
        id="roster"
        className="scroll-mt-16 flex flex-col gap-3"
        aria-label="Roster board"
      >
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">Roster board</h2>
          <p className="text-[14px] text-muted-foreground">
            Full {season} roster — same columns as Explore Players, scoped to
            this team.
          </p>
        </div>
        {view.totalCount === 0 ? (
          <p className="text-[14px] text-muted-foreground">
            {roster.warning ??
              `No roster rows available for ${season}.`}
          </p>
        ) : (
          <PlayerSeasonTable
            players={view.rows}
            season={season}
            totalCount={view.totalCount}
            pageSize={view.pageSize}
            pageCount={1}
            sortKey={view.sortKey}
            sortDir={view.sortDir}
            hasDarko={view.hasDarko}
            hasRaptor={view.hasRaptor}
            hasDrbl={view.hasDrbl}
            seasonAwaitingGames={view.seasonAwaitingGames}
          />
        )}
      </section>

      <section
        className="flex flex-col gap-3"
        aria-label="Who drives it"
      >
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">
            Who drives it?
          </h2>
          <p className="text-[14px] text-muted-foreground">
            Compact highlights from the same roster.
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
            showExploreLink={false}
          />
        </div>
      </section>
    </div>
  );
}

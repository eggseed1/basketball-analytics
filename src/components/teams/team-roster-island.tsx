import { TeamRosterBoardClient } from "@/components/teams/team-roster-board-client";
import { getTeamRosterCached } from "@/data/queries/request-cache";
import { type } from "@/lib/design-system";
import { formatNumber } from "@/lib/format";
import {
  buildRosterBuckets,
  buildRotationLadder,
  MID_SEASON_MOVES_NOTE,
} from "@/lib/team-explorer";
import {
  defaultPlayerSeasonSortDir,
  parsePlayerSeasonSortKey,
  type PlayerSeasonSortKey,
} from "@/lib/player-season-sort";
import { isPreseasonRosterSeason } from "@/data/providers/nba/espn-roster-client";
import { cn } from "@/lib/utils";

export async function TeamRosterIsland({
  teamId,
  season,
  sortParam,
  sortDirParam,
}: {
  teamId: string;
  season: string;
  sortParam?: string | null;
  sortDirParam?: string | null;
}) {
  const requestedSort =
    parsePlayerSeasonSortKey(sortParam ?? undefined) ?? "mpg";
  const requestedDir =
    sortDirParam === "asc" || sortDirParam === "desc"
      ? sortDirParam
      : defaultPlayerSeasonSortDir(requestedSort);

  // Roster summary stays SSR; the explore board table loads client-side.
  const roster = await getTeamRosterCached(teamId, season, 0);
  const preseasonCopy = isPreseasonRosterSeason(season);
  const players = roster.status === "ok" ? roster.players : [];
  const buckets = buildRosterBuckets(players);
  const ladder = buildRotationLadder(players);
  const withMinutes = players.filter((p) => p.minutes > 0);
  const minutesLeader = buckets.rotation[0];
  const rosterPeople = players.map((p) => ({
    playerId: p.playerId,
    name: p.playerName,
  }));

  return (
    <div className="flex flex-col gap-6">
      <section
        id="roster"
        className="scroll-mt-16 flex flex-col gap-3"
        aria-label="Roster board"
      >
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">
            Roster board
          </h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            {preseasonCopy
              ? `${season} roster as listed today. Players who changed teams this offseason show up with their new team. Stats stay blank until games are played.`
              : `${season} roster with the same columns as Explore Players, scoped to this team.`}
            {!preseasonCopy && roster.omitsMidSeasonMoves
              ? ` ${MID_SEASON_MOVES_NOTE}`
              : null}
          </p>
        </div>

        {roster.status === "ok" && withMinutes.length ? (
          <div className="sports-card p-4 sm:p-5">
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className={cn(type.caption, "text-muted-foreground")}>
                  With minutes
                </dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {withMinutes.length}
                </dd>
              </div>
              <div>
                <dt className={cn(type.caption, "text-muted-foreground")}>
                  Likely starters
                </dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {ladder.starters.length || "—"}
                </dd>
              </div>
              <div>
                <dt className={cn(type.caption, "text-muted-foreground")}>
                  Bench regulars
                </dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {ladder.bench.length || "—"}
                </dd>
              </div>
              <div>
                <dt className={cn(type.caption, "text-muted-foreground")}>
                  Minutes leader
                </dt>
                <dd className="text-lg font-semibold">
                  {minutesLeader
                    ? `${minutesLeader.playerName.split(" ").slice(-1)[0]} · ${formatNumber(
                        minutesLeader.minutes,
                        0
                      )} min`
                    : "—"}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        <TeamRosterBoardClient
          teamId={teamId}
          season={season}
          sortKey={requestedSort as PlayerSeasonSortKey}
          sortDir={requestedDir}
          rosterPeople={rosterPeople}
        />
      </section>
    </div>
  );
}

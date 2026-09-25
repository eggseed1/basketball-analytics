import { TransitionLink } from "@/components/continuity/query-nav";
import { PlayerSeasonTable } from "@/components/explore/player-season-table";
import { TeamRosterSection } from "@/components/teams/team-roster-section";
import { getExplorePlayersBoardView } from "@/data/queries/explore-players-board";
import { getTeamRosterCached } from "@/data/queries/request-cache";
import { type } from "@/lib/design-system";
import { formatNumber } from "@/lib/format";
import {
  buildRosterBuckets,
  buildRotationLadder,
} from "@/lib/team-explorer";
import {
  defaultPlayerSeasonSortDir,
  parsePlayerSeasonSortKey,
  type PlayerSeasonSortKey,
} from "@/lib/player-season-sort";
import { teamPageHref } from "@/lib/team-destination";
import { cn } from "@/lib/utils";

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
  const requestedSort =
    parsePlayerSeasonSortKey(sortParam ?? undefined) ?? "mpg";
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
  const players = roster.status === "ok" ? roster.players : [];
  const buckets = buildRosterBuckets(players);
  const ladder = buildRotationLadder(players);
  const withMinutes = players.filter((p) => p.minutes > 0);
  const topMpg = buckets.rotation[0];
  const rotationHref = teamPageHref(teamId, { season, tab: "lineups" });
  const offenseHref = teamPageHref(teamId, { season, tab: "offense" });

  return (
    <div className="flex flex-col gap-6">
      <section
        id="roster"
        className="scroll-mt-16 flex flex-col gap-3"
        aria-label="Roster board"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-[20px] font-bold tracking-tight">
              Roster board
            </h2>
            <p className={cn(type.bodySm, "text-muted-foreground")}>
              Full {season} roster — same columns as Explore Players, scoped to
              this team.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <TransitionLink
              href={rotationHref}
              className={cn(type.caption, "font-semibold underline")}
            >
              Rotation →
            </TransitionLink>
            <TransitionLink
              href={offenseHref}
              className={cn(type.caption, "font-semibold underline")}
            >
              Offense →
            </TransitionLink>
          </div>
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
                  {topMpg
                    ? `${topMpg.playerName.split(" ").slice(-1)[0]} · ${formatNumber(
                        topMpg.minutes / Math.max(1, topMpg.gamesPlayed),
                        1
                      )} MPG`
                    : "—"}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        {view.totalCount === 0 ? (
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            {roster.warning ?? `No roster rows available for ${season}.`}
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
            hasHustle={view.hasHustle}
            seasonAwaitingGames={view.seasonAwaitingGames}
          />
        )}
      </section>

      <section className="flex flex-col gap-3" aria-label="Who drives it">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">
            Who drives it?
          </h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
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

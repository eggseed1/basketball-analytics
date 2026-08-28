import Link from "next/link";

import { PlayoffBracket } from "@/components/explore/playoff-bracket";
import { TeamGamesLog } from "@/components/teams/team-games-log";
import { getPlayoffBracketModel } from "@/data/queries/playoff-bracket";
import {
  gameSummariesToCompactRows,
  paginateSnapshotTeamGames,
  teamSnapshotGames,
} from "@/lib/team-snapshot-games";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function findStandingSeed(
  teamId: string,
  standings: Awaited<ReturnType<typeof getPlayoffBracketModel>>["standings"]
): number | null {
  if (!standings) return null;
  for (const conf of standings.conferences) {
    const row = conf.rows.find((r) => r.teamId === teamId);
    if (row?.playoffSeed && row.playoffSeed > 0) return row.playoffSeed;
    if (row) return row.rank;
  }
  return null;
}

/**
 * Playoffs tab — bracket projection/results + team postseason game log from snapshot.
 */
export async function TeamPlayoffsIsland({
  teamId,
  season,
}: {
  teamId: string;
  season: string;
}) {
  const { model, standings } = await getPlayoffBracketModel(season);
  const seed = findStandingSeed(teamId, standings);
  const playoffGames = teamSnapshotGames(teamId, season, {
    gameType: ["playoff", "play-in"],
  });
  const compact = gameSummariesToCompactRows(teamId, playoffGames);
  const page = paginateSnapshotTeamGames(compact, 1);

  let wins = 0;
  let losses = 0;
  for (const game of playoffGames) {
    if (game.status !== "final") continue;
    const home = game.homeTeamId === teamId;
    const pf = home ? game.homeScore : game.awayScore;
    const pa = home ? game.awayScore : game.homeScore;
    if (pf > pa) wins += 1;
    else if (pf < pa) losses += 1;
  }

  return (
    <section
      id="playoffs"
      className="scroll-mt-16 flex flex-col gap-4"
      aria-label="Playoffs"
    >
      <div>
        <h2 className="text-[20px] font-bold tracking-tight">Playoffs</h2>
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          {model.mode === "projected"
            ? "Projected bracket from standings / team board."
            : model.mode === "postseason"
              ? "Bracket updates as postseason games are recorded."
              : "Completed postseason bracket."}{" "}
          {seed != null ? `Your seed: ${seed}.` : null}
        </p>
      </div>

      <div className="sports-card p-4 sm:p-5">
        <dl className="grid gap-3 sm:grid-cols-3">
          <div>
            <dt className={cn(type.caption, "text-muted-foreground")}>Seed</dt>
            <dd className="text-xl font-semibold tabular-nums">
              {seed != null ? seed : "—"}
            </dd>
          </div>
          <div>
            <dt className={cn(type.caption, "text-muted-foreground")}>
              Postseason record
            </dt>
            <dd className="text-xl font-semibold tabular-nums">
              {wins + losses > 0 ? `${wins}-${losses}` : "—"}
            </dd>
          </div>
          <div>
            <dt className={cn(type.caption, "text-muted-foreground")}>
              Postseason games
            </dt>
            <dd className="text-xl font-semibold tabular-nums">
              {playoffGames.length || "—"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="sports-card overflow-x-auto p-4 sm:p-5">
        <PlayoffBracket model={model} />
      </div>

      <div className="sports-card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className={cn(type.bodySm, "font-semibold")}>
            Postseason game log
          </h3>
          <Link
            href={`/explore/teams?season=${encodeURIComponent(season)}`}
            className={cn(type.caption, "font-semibold underline")}
          >
            League bracket →
          </Link>
        </div>
        {compact.length === 0 ? (
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            No playoff or play-in games in the schedule snapshot for {season}{" "}
            yet.
          </p>
        ) : (
          <TeamGamesLog
            teamId={teamId}
            season={season}
            rows={page.rows}
            total={page.total}
            page={page.page}
            pageCount={page.pageCount}
          />
        )}
      </div>
    </section>
  );
}

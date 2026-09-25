import { TransitionLink } from "@/components/continuity/query-nav";
import { PlayoffBracket } from "@/components/explore/playoff-bracket";
import { TeamGamesLog } from "@/components/teams/team-games-log";
import { getPlayoffBracketModel } from "@/data/queries/playoff-bracket";
import {
  gameSummariesToCompactRows,
  paginateSnapshotTeamGames,
  teamSnapshotGames,
} from "@/lib/team-snapshot-games";
import { type } from "@/lib/design-system";
import { formatNumber, formatPct } from "@/lib/format";
import { teamPageHref } from "@/lib/team-destination";
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

function postseasonTotals(teamId: string, season: string) {
  const games = teamSnapshotGames(teamId, season, {
    gameType: ["playoff", "play-in"],
  });
  let wins = 0;
  let losses = 0;
  let pts = 0;
  let opp = 0;
  const results: Array<"W" | "L"> = [];
  for (const game of games) {
    if (game.status !== "final") continue;
    const home = game.homeTeamId === teamId;
    const pf = home ? game.homeScore : game.awayScore;
    const pa = home ? game.awayScore : game.homeScore;
    pts += pf;
    opp += pa;
    if (pf > pa) {
      wins += 1;
      results.push("W");
    } else if (pf < pa) {
      losses += 1;
      results.push("L");
    }
  }
  const gp = wins + losses;
  return {
    games,
    wins,
    losses,
    gp,
    ppg: gp ? pts / gp : null,
    oppPpg: gp ? opp / gp : null,
    diff: gp ? (pts - opp) / gp : null,
    recent: results.slice(0, 8),
  };
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
  const totals = postseasonTotals(teamId, season);
  const compact = gameSummariesToCompactRows(teamId, totals.games);
  const page = paginateSnapshotTeamGames(compact, 1);
  const gamesHref = teamPageHref(teamId, { season, tab: "games" });
  const winPct = totals.gp > 0 ? totals.wins / totals.gp : null;

  return (
    <section
      id="playoffs"
      className="scroll-mt-16 flex flex-col gap-4"
      aria-label="Playoffs"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
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
        <TransitionLink
          href={gamesHref}
          className={cn(type.caption, "font-semibold underline")}
        >
          Regular-season games →
        </TransitionLink>
      </div>

      <div className="sports-card flex flex-col gap-4 p-4 sm:p-5">
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <dt className={cn(type.caption, "text-muted-foreground")}>Seed</dt>
            <dd className="text-xl font-semibold tabular-nums">
              {seed != null ? seed : "—"}
            </dd>
          </div>
          <div>
            <dt className={cn(type.caption, "text-muted-foreground")}>
              Postseason
            </dt>
            <dd className="text-xl font-semibold tabular-nums">
              {totals.gp > 0 ? `${totals.wins}-${totals.losses}` : "—"}
            </dd>
          </div>
          <div>
            <dt className={cn(type.caption, "text-muted-foreground")}>Win%</dt>
            <dd className="text-xl font-semibold tabular-nums">
              {winPct != null ? formatPct(winPct, 0) : "—"}
            </dd>
          </div>
          <div>
            <dt className={cn(type.caption, "text-muted-foreground")}>PPG</dt>
            <dd className="text-xl font-semibold tabular-nums">
              {totals.ppg != null ? formatNumber(totals.ppg, 1) : "—"}
            </dd>
          </div>
          <div>
            <dt className={cn(type.caption, "text-muted-foreground")}>Opp</dt>
            <dd className="text-xl font-semibold tabular-nums">
              {totals.oppPpg != null ? formatNumber(totals.oppPpg, 1) : "—"}
            </dd>
          </div>
          <div>
            <dt className={cn(type.caption, "text-muted-foreground")}>Diff</dt>
            <dd className="text-xl font-semibold tabular-nums">
              {totals.diff != null
                ? `${totals.diff >= 0 ? "+" : ""}${formatNumber(totals.diff, 1)}`
                : "—"}
            </dd>
          </div>
        </dl>
        {totals.recent.length ? (
          <div>
            <p className={cn(type.caption, "mb-2 text-muted-foreground")}>
              Recent postseason results (newest first)
            </p>
            <ol className="flex flex-wrap gap-1.5" aria-label="Postseason form">
              {totals.recent.map((r, i) => (
                <li
                  key={`${r}-${i}`}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-sm text-[12px] font-bold",
                    r === "W"
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {r}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>

      <PlayoffBracket model={model} />

      <div className="sports-card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className={cn(type.bodySm, "font-semibold")}>
            Postseason game log
          </h3>
          <TransitionLink
            href={`/explore/bracket?season=${encodeURIComponent(season)}`}
            className={cn(type.caption, "font-semibold underline")}
          >
            League bracket →
          </TransitionLink>
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

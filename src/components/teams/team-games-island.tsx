import { TeamGamesSection } from "@/components/teams/team-games-section";
import { TeamGamesLog } from "@/components/teams/team-games-log";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { hasHistoryTeamGameIndex } from "@/data/history/team-matchup-index";
import { toGameSummary } from "@/data/queries/filter-utils";
import { getRuntimeSnapshotGames } from "@/data/runtime/game-snapshot";
import { getTeamSeasonGamesCached } from "@/data/queries/request-cache";
import type { GameSummary, TeamSeasonStats } from "@/data/types";
import type { TeamBrand } from "@/lib/nba-brand";
import {
  gameSummariesToCompactRows,
  hasTeamSnapshotGames,
  paginateSnapshotTeamGames,
  teamSnapshotGames,
  computeTeamFormSummary,
  computeTeamSplits,
} from "@/lib/team-snapshot-games";
import { withBudget } from "@/data/queries/budget";
import { type, sectionLinkClassName } from "@/lib/design-system";
import { formatNumber, formatPct } from "@/lib/format";
import { teamPageHref } from "@/lib/team-destination";
import { TransitionLink } from "@/components/continuity/query-nav";
import { nbaTodayIso } from "@/lib/nba-calendar-date";
import { cn } from "@/lib/utils";
import { buildTeamSchedule } from "@/lib/team-schedule";
import type { CompactTeamGameRow } from "@/data/history/team-matchup-index";
import { GamesScoreScatter, type ScoreGame } from "@/components/teams/viz/games-score-scatter";

function gameHref(id: string, season: string): string {
  return `/games/${encodeURIComponent(id)}?season=${encodeURIComponent(season)}`;
}

function scheduleScoreGames(teamId: string, season: string): ScoreGame[] {
  return buildTeamSchedule(teamId, season)
    .rows.filter(
      (r) =>
        r.phase !== "preseason" &&
        r.result != null &&
        r.teamScore != null &&
        r.oppScore != null
    )
    .map((r) => ({
      id: r.id,
      href: gameHref(r.id, r.season),
      dateLabel: r.dateLabel,
      home: r.home,
      oppAbbr: r.oppAbbr,
      teamScore: r.teamScore as number,
      oppScore: r.oppScore as number,
      overtime: r.overtime,
      postseason: r.phase === "postseason",
    }));
}

function summaryScoreGames(games: GameSummary[], team: TeamSeasonStats): ScoreGame[] {
  const abbr = team.abbreviation.toUpperCase();
  const out: ScoreGame[] = [];
  for (const g of games) {
    if (g.status !== "final" || g.gameType === "preseason") continue;
    if (!(g.homeScore > 0 && g.awayScore > 0)) continue;
    const home = g.homeTeamId === team.teamId || g.homeTeamAbbr?.toUpperCase() === abbr;
    const away = g.awayTeamId === team.teamId || g.awayTeamAbbr?.toUpperCase() === abbr;
    if (home === away) continue;
    const date = new Date(`${g.gameDate.slice(0, 10)}T12:00:00Z`);
    out.push({
      id: g.id,
      href: gameHref(g.id, g.season),
      dateLabel: Number.isNaN(date.getTime())
        ? g.gameDate
        : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }),
      home,
      oppAbbr: (home ? g.awayTeamAbbr : g.homeTeamAbbr) ?? "OPP",
      teamScore: home ? g.homeScore : g.awayScore,
      oppScore: home ? g.awayScore : g.homeScore,
      overtime: (g.homePeriodScores?.length ?? 0) > 4,
      postseason: g.gameType === "playoff" || g.gameType === "play-in",
    });
  }
  return out;
}

function compactScoreGames(rows: CompactTeamGameRow[]): ScoreGame[] {
  return rows
    .filter((r) => r.result != null && r.homeScore > 0 && r.awayScore > 0)
    .map((r) => {
      const home = r.homeAway === "home";
      const date = new Date(`${r.date.slice(0, 10)}T12:00:00Z`);
      return {
        id: r.gameId,
        href: gameHref(r.gameId, r.season),
        dateLabel: Number.isNaN(date.getTime())
          ? r.date
          : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }),
        home,
        oppAbbr: home ? r.awayTricode : r.homeTricode,
        teamScore: home ? r.homeScore : r.awayScore,
        oppScore: home ? r.awayScore : r.homeScore,
        overtime: r.ot,
        postseason: /playoff/i.test(r.seasonType),
      };
    });
}

function snapshotPoolsForSeason(season: string): {
  recentPool: GameSummary[];
  upcomingPool: GameSummary[];
} {
  const today = nbaTodayIso();
  const snapshot = getRuntimeSnapshotGames(season).map(toGameSummary);
  return {
    upcomingPool: snapshot.filter(
      (game) =>
        game.gameDate >= today &&
        (game.status === "scheduled" ||
          game.status === "pregame" ||
          game.status === "delayed" ||
          game.status === "in_progress")
    ),
    recentPool: snapshot
      .filter(
        (game) =>
          game.gameDate < today ||
          game.status === "final" ||
          game.status === "halftime"
      )
      .reverse(),
  };
}

function SnapshotTeamGamesBody({
  team,
  brand,
  season,
  gamesPage,
  fromHistory,
  theme,
}: {
  team: TeamSeasonStats;
  brand?: TeamBrand | null;
  season: string;
  gamesPage?: number;
  fromHistory?: boolean;
  theme?: string;
}) {
  const allTeamGames = teamSnapshotGames(team.teamId, season);
  const { recentPool, upcomingPool } = snapshotPoolsForSeason(season);
  const compact = gameSummariesToCompactRows(
    team.teamId,
    allTeamGames.filter((game) => game.status === "final")
  );
  const page = paginateSnapshotTeamGames(compact, gamesPage ?? 1);
  const overall = computeTeamSplits(team.teamId, season).find(
    (s) => s.id === "overall"
  );
  const form = computeTeamFormSummary(team.teamId, season);
  const splitsHref = teamPageHref(team.teamId, { season, tab: "splits" });
  const winPct =
    overall && overall.wins + overall.losses > 0
      ? overall.wins / (overall.wins + overall.losses)
      : null;

  return (
    <div className="sports-card flex flex-col gap-5 p-4 sm:p-5">
      {overall && overall.games > 0 ? (
        <div className="flex flex-col gap-2 border-b border-border/60 pb-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className={cn(type.bodySm, "font-semibold")}>Season slate</h3>
            <TransitionLink
              href={splitsHref}
              className={cn(type.caption, sectionLinkClassName)}
            >
              Full splits <span data-motion-arrow aria-hidden>→</span>
            </TransitionLink>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <dt className={cn(type.caption, "text-muted-foreground")}>
                Record
              </dt>
              <dd className="text-lg font-semibold tabular-nums">
                {overall.wins}-{overall.losses}
              </dd>
            </div>
            <div>
              <dt className={cn(type.caption, "text-muted-foreground")}>
                Win%
              </dt>
              <dd className="text-lg font-semibold tabular-nums">
                {winPct != null ? formatPct(winPct, 0) : "—"}
              </dd>
            </div>
            <div>
              <dt className={cn(type.caption, "text-muted-foreground")}>
                Diff
              </dt>
              <dd className="text-lg font-semibold tabular-nums">
                {overall.diff != null
                  ? `${overall.diff >= 0 ? "+" : ""}${formatNumber(overall.diff, 1)}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className={cn(type.caption, "text-muted-foreground")}>PPG</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {overall.ppg != null ? formatNumber(overall.ppg, 1) : "—"}
              </dd>
            </div>
            <div>
              <dt className={cn(type.caption, "text-muted-foreground")}>
                Streak
              </dt>
              <dd className="text-lg font-semibold tabular-nums">
                {form.streakLabel}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}
      <TeamGamesSection
        recentPool={recentPool}
        upcomingPool={upcomingPool}
        team={team}
        brand={brand}
        seasonAvgPpg={Number.isFinite(team.ppg) ? team.ppg : null}
      />
      {compact.length > 0 ? (
        <TeamGamesLog
          teamId={team.teamId}
          season={season}
          rows={page.rows}
          total={page.total}
          page={page.page}
          pageCount={page.pageCount}
          fromHistory={fromHistory}
          theme={theme}
        />
      ) : null}
    </div>
  );
}

export async function TeamGamesIsland({
  team,
  brand,
  season,
  gamesPage = 1,
  fromHistory,
  theme,
}: {
  team: TeamSeasonStats;
  brand?: TeamBrand | null;
  season: string;
  gamesPage?: number;
  fromHistory?: boolean;
  theme?: string;
}) {
  const currentSeason = canonicalSeasonFromStartYear(currentNbaStartYear());
  const useProductIndex = hasHistoryTeamGameIndex(season);

  if (hasTeamSnapshotGames(team.teamId, season)) {
    return (
      <section
        id="games"
        className="scroll-mt-16 flex flex-col gap-3"
        aria-label="Games"
      >
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">Games</h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            Recent results, the next few games, and the season game log. Each
            game opens in Game Lab. The full calendar is on the Schedule tab.
          </p>
        </div>
        <GamesScoreScatter
          games={scheduleScoreGames(team.teamId, season)}
          season={season}
          teamKey={team.abbreviation}
        />
        <SnapshotTeamGamesBody
          team={team}
          brand={brand}
          season={season}
          gamesPage={gamesPage}
          fromHistory={fromHistory}
          theme={theme}
        />
      </section>
    );
  }

  if (useProductIndex) {
    const {
      getCompactTeamSeasonGames,
      paginateCompactTeamGames,
      compactRowsToGameSummaries,
    } = await import("@/data/history/team-matchup-index");
    const all = getCompactTeamSeasonGames(team.teamId, season);
    const page = paginateCompactTeamGames(all, gamesPage);
    const recentPool = compactRowsToGameSummaries(all.slice(0, 8));
    const snapshot =
      all.length === 0 && season >= currentSeason
        ? snapshotPoolsForSeason(season)
        : null;

    return (
      <section
        id="games"
        className="scroll-mt-16 flex flex-col gap-3"
        aria-label="Games"
      >
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">Games</h2>
          <p className="text-[13px] text-muted-foreground">
            {snapshot
              ? "Recent / upcoming from schedule · opens Game Lab"
              : `From local historical game index · opens Game Lab · bounded page (${page.pageSize} max)`}
          </p>
        </div>
        {!snapshot ? (
          <GamesScoreScatter
            games={compactScoreGames(all)}
            season={season}
            teamKey={team.abbreviation}
          />
        ) : null}
        <div className="sports-card flex flex-col gap-5 p-4 sm:p-5">
          {page.total === 0 && !snapshot ? (
            <p className="text-[13px] text-muted-foreground">
              Historical games unavailable for {season}.
            </p>
          ) : snapshot ? (
            <TeamGamesSection
              recentPool={snapshot.recentPool}
              upcomingPool={snapshot.upcomingPool}
              team={team}
              brand={brand}
              seasonAvgPpg={null}
            />
          ) : (
            <>
              <TeamGamesSection
                recentPool={recentPool}
                upcomingPool={[]}
                team={team}
                brand={brand}
                seasonAvgPpg={
                  Number.isFinite(team.ppg) ? team.ppg : null
                }
              />
              <TeamGamesLog
                teamId={team.teamId}
                season={season}
                rows={page.rows}
                total={page.total}
                page={page.page}
                pageCount={page.pageCount}
                fromHistory={fromHistory}
                theme={theme}
              />
            </>
          )}
        </div>
      </section>
    );
  }

  if (season >= currentSeason) {
    const snapshot = snapshotPoolsForSeason(season);
    return (
      <section
        id="games"
        className="scroll-mt-16 flex flex-col gap-3"
        aria-label="Games"
      >
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">Games</h2>
          <p className="text-[13px] text-muted-foreground">
            Recent / upcoming from schedule · opens Game Lab
          </p>
        </div>
        <div className="sports-card p-4 sm:p-5">
          <TeamGamesSection
            recentPool={snapshot.recentPool}
            upcomingPool={snapshot.upcomingPool}
            team={team}
            brand={brand}
            seasonAvgPpg={
              Number.isFinite(team.ppg) ? team.ppg : null
            }
          />
        </div>
      </section>
    );
  }

  const teamGames = (
    await withBudget(
      getTeamSeasonGamesCached(team.teamId, season, team.abbreviation),
      6_000,
      {
        games: [] as GameSummary[],
        source: "unavailable" as const,
        warning: `Historical games unavailable for ${season}.`,
      }
    )
  ).value;

  return (
    <section
      id="games"
      className="scroll-mt-16 flex flex-col gap-3"
      aria-label="Games"
    >
      <div>
        <h2 className="text-[20px] font-bold tracking-tight">Games</h2>
        <p className="text-[13px] text-muted-foreground">
          {teamGames.source === "disk_cache"
            ? "From local historical game archive · opens Game Lab"
            : "Recent / upcoming from schedule · opens Game Lab"}
        </p>
      </div>
      <GamesScoreScatter
        games={summaryScoreGames(teamGames.games, team)}
        season={season}
        teamKey={team.abbreviation}
      />
      <div className="sports-card p-4 sm:p-5">
        {teamGames.games.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            {teamGames.warning ??
              `Historical games unavailable for ${season}.`}
          </p>
        ) : (
          <TeamGamesSection
            recentPool={teamGames.games}
            upcomingPool={[]}
            team={team}
            brand={brand}
            seasonAvgPpg={
              Number.isFinite(team.ppg) ? team.ppg : null
            }
          />
        )}
      </div>
    </section>
  );
}

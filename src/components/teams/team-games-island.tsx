import type { ReactNode } from "react";

import { TeamGamesSection } from "@/components/teams/team-games-section";
import {
  TeamGameLogTable,
  type TeamGameLogPhase,
  type TeamGameLogRow,
} from "@/components/teams/team-game-log-table";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { hasHistoryTeamGameIndex } from "@/data/history/team-matchup-index";
import { toGameSummary } from "@/data/queries/filter-utils";
import { getRuntimeSnapshotGames } from "@/data/runtime/game-snapshot";
import { teamGameBoxesByDate, teamGameBoxSeasons } from "@/data/runtime/team-game-box-snapshot";
import { getTeamSeasonGamesCached } from "@/data/queries/request-cache";
import type { GameSummary, TeamSeasonStats } from "@/data/types";
import type { TeamBrand } from "@/lib/nba-brand";
import { hasTeamSnapshotGames } from "@/lib/team-snapshot-games";
import { withBudget } from "@/data/queries/budget";
import { type } from "@/lib/design-system";
import { nbaTodayIso } from "@/lib/nba-calendar-date";
import { cn } from "@/lib/utils";
import { buildTeamSchedule } from "@/lib/team-schedule";
import type { CompactTeamGameRow } from "@/data/history/team-matchup-index";
import { GamesScoreScatter, type ScoreGame } from "@/components/teams/viz/games-score-scatter";

function gameHref(id: string, season: string): string {
  return `/games/${encodeURIComponent(id)}?season=${encodeURIComponent(season)}`;
}

function shortDateLabel(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? date
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function phaseFromLabel(label: string): TeamGameLogPhase {
  if (/play-?in/i.test(label)) return "playin";
  if (/playoff|postseason/i.test(label)) return "playoffs";
  return "regular";
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

/** Final games with team and opponent box totals joined by Eastern date. */
function scheduleLogRows(teamId: string, season: string): TeamGameLogRow[] {
  const teamBoxes = teamGameBoxesByDate(teamId, season);
  const oppBoxes = new Map<string, ReturnType<typeof teamGameBoxesByDate>>();
  const boxesFor = (id: string) => {
    let hit = oppBoxes.get(id);
    if (!hit) {
      hit = teamGameBoxesByDate(id, season);
      oppBoxes.set(id, hit);
    }
    return hit;
  };
  const out: TeamGameLogRow[] = [];
  for (const r of buildTeamSchedule(teamId, season).rows) {
    if (r.phase === "preseason" || !r.result || r.teamScore == null || r.oppScore == null) continue;
    const team = teamBoxes.get(r.date) ?? null;
    const opp = boxesFor(r.oppId).get(r.date) ?? null;
    const matched = team?.pts === r.teamScore && opp?.pts === r.oppScore;
    out.push({
      id: r.id,
      href: gameHref(r.id, r.season),
      date: r.date,
      dateLabel: shortDateLabel(r.date),
      phase: r.note === "Play-In" ? "playin" : r.phase === "postseason" ? "playoffs" : "regular",
      home: r.home,
      oppAbbr: r.oppAbbr,
      result: r.result,
      teamScore: r.teamScore,
      oppScore: r.oppScore,
      overtime: r.overtime,
      team: matched ? team : null,
      opp: matched ? opp : null,
    });
  }
  return out;
}

function compactLogRows(rows: CompactTeamGameRow[]): TeamGameLogRow[] {
  return rows
    .filter((r) => r.result != null && r.homeScore > 0 && r.awayScore > 0)
    .map((r) => {
      const home = r.homeAway === "home";
      return {
        id: r.gameId,
        href: gameHref(r.gameId, r.season),
        date: r.date.slice(0, 10),
        dateLabel: shortDateLabel(r.date),
        phase: phaseFromLabel(r.seasonType),
        home,
        oppAbbr: home ? r.awayTricode : r.homeTricode,
        result: r.result!,
        teamScore: home ? r.homeScore : r.awayScore,
        oppScore: home ? r.awayScore : r.homeScore,
        overtime: r.ot,
        team: null,
        opp: null,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function summaryLogRows(games: GameSummary[], team: TeamSeasonStats): TeamGameLogRow[] {
  const abbr = team.abbreviation.toUpperCase();
  const out: TeamGameLogRow[] = [];
  for (const g of games) {
    if (g.status !== "final" || g.gameType === "preseason") continue;
    if (!(g.homeScore > 0 && g.awayScore > 0)) continue;
    const home = g.homeTeamId === team.teamId || g.homeTeamAbbr?.toUpperCase() === abbr;
    const away = g.awayTeamId === team.teamId || g.awayTeamAbbr?.toUpperCase() === abbr;
    if (home === away) continue;
    const teamScore = home ? g.homeScore : g.awayScore;
    const oppScore = home ? g.awayScore : g.homeScore;
    if (teamScore === oppScore) continue;
    out.push({
      id: g.id,
      href: gameHref(g.id, g.season),
      date: g.gameDate.slice(0, 10),
      dateLabel: shortDateLabel(g.gameDate),
      phase: g.gameType === "play-in" ? "playin" : g.gameType === "playoff" ? "playoffs" : "regular",
      home,
      oppAbbr: (home ? g.awayTeamAbbr : g.homeTeamAbbr) ?? "OPP",
      result: teamScore > oppScore ? "W" : "L",
      teamScore,
      oppScore,
      overtime: (g.homePeriodScores?.length ?? 0) > 4,
      team: null,
      opp: null,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function logToScoreGames(rows: TeamGameLogRow[], season: string): ScoreGame[] {
  return rows.map((r) => ({
    id: r.id,
    href: gameHref(r.id, season),
    dateLabel: new Date(`${r.date}T12:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }),
    home: r.home,
    oppAbbr: r.oppAbbr,
    teamScore: r.teamScore,
    oppScore: r.oppScore,
    overtime: r.overtime,
    postseason: r.phase !== "regular",
  }));
}

function boxNoteFor(rows: TeamGameLogRow[], season: string): string | null {
  if (!rows.length) return null;
  const archived = teamGameBoxSeasons();
  if (!archived.includes(season)) {
    const span = archived.length ? `${archived[0]} through ${archived[archived.length - 1]}` : null;
    return `Team box totals aren't archived for ${season}, so this table shows results only.${span ? ` Box totals cover ${span}.` : ""}`;
  }
  const missing = rows.filter((r) => !r.team).length;
  if (!missing) return "Team totals from the NBA box score. REB counts player rebounds only.";
  return `${missing} of ${rows.length} games have no archived box score, so their stat cells are blank, not 0. REB counts player rebounds only.`;
}

function GameLogSection({ rows, season }: { rows: TeamGameLogRow[]; season: string }) {
  return (
    <section id="game-log" className="scroll-mt-16 flex flex-col gap-3" aria-label="Game log">
      <div>
        <h2 className="text-[20px] font-bold tracking-tight">Game log</h2>
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          Every final game in {season} with the team&apos;s box score line. Click a column to sort, or a game to open it.
        </p>
      </div>
      <div className="sports-card p-4 sm:p-5">
        <TeamGameLogTable rows={rows} season={season} boxNote={boxNoteFor(rows, season)} />
      </div>
    </section>
  );
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

function GamesHeader({ children }: { children: ReactNode }) {
  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">Games</h2>
      <p className={cn(type.bodySm, "text-muted-foreground")}>{children}</p>
    </div>
  );
}

export async function TeamGamesIsland({
  team,
  brand,
  season,
  schedule,
}: {
  team: TeamSeasonStats;
  brand?: TeamBrand | null;
  season: string;
  schedule?: ReactNode;
}) {
  const currentSeason = canonicalSeasonFromStartYear(currentNbaStartYear());
  const useProductIndex = hasHistoryTeamGameIndex(season);

  if (hasTeamSnapshotGames(team.teamId, season)) {
    const rows = scheduleLogRows(team.teamId, season);
    return (
      <section id="games" className="scroll-mt-16 flex flex-col gap-3" aria-label="Games">
        <GamesHeader>
          Every result on one chart, then the full schedule and a game-by-game box score log. Each game opens in Game Lab.
        </GamesHeader>
        <GamesScoreScatter
          games={scheduleScoreGames(team.teamId, season)}
          season={season}
          teamKey={team.abbreviation}
        />
        {schedule}
        {rows.length ? <GameLogSection rows={rows} season={season} /> : null}
      </section>
    );
  }

  if (useProductIndex) {
    const { getCompactTeamSeasonGames } = await import("@/data/history/team-matchup-index");
    const all = getCompactTeamSeasonGames(team.teamId, season);
    const rows = compactLogRows(all);
    const snapshot =
      all.length === 0 && season >= currentSeason
        ? snapshotPoolsForSeason(season)
        : null;

    return (
      <section id="games" className="scroll-mt-16 flex flex-col gap-3" aria-label="Games">
        <GamesHeader>
          {snapshot
            ? "Recent and upcoming games from the schedule. Each game opens in Game Lab."
            : "Every result from the historical game index, plus a game-by-game log. Each game opens in Game Lab."}
        </GamesHeader>
        {!snapshot ? (
          <GamesScoreScatter games={logToScoreGames(rows, season)} season={season} teamKey={team.abbreviation} />
        ) : null}
        {schedule}
        {snapshot ? (
          <div className="sports-card p-4 sm:p-5">
            <TeamGamesSection
              recentPool={snapshot.recentPool}
              upcomingPool={snapshot.upcomingPool}
              team={team}
              brand={brand}
              seasonAvgPpg={null}
            />
          </div>
        ) : rows.length ? (
          <GameLogSection rows={rows} season={season} />
        ) : (
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            Historical games unavailable for {season}.
          </p>
        )}
      </section>
    );
  }

  if (season >= currentSeason) {
    const snapshot = snapshotPoolsForSeason(season);
    return (
      <section id="games" className="scroll-mt-16 flex flex-col gap-3" aria-label="Games">
        <GamesHeader>Recent and upcoming games from the schedule. Each game opens in Game Lab.</GamesHeader>
        {schedule}
        <div className="sports-card p-4 sm:p-5">
          <TeamGamesSection
            recentPool={snapshot.recentPool}
            upcomingPool={snapshot.upcomingPool}
            team={team}
            brand={brand}
            seasonAvgPpg={Number.isFinite(team.ppg) ? team.ppg : null}
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
  const rows = summaryLogRows(teamGames.games, team);

  return (
    <section id="games" className="scroll-mt-16 flex flex-col gap-3" aria-label="Games">
      <GamesHeader>
        {teamGames.source === "disk_cache"
          ? "Results from the local historical game archive. Each game opens in Game Lab."
          : "Results from the schedule. Each game opens in Game Lab."}
      </GamesHeader>
      <GamesScoreScatter games={logToScoreGames(rows, season)} season={season} teamKey={team.abbreviation} />
      {schedule}
      {rows.length ? (
        <GameLogSection rows={rows} season={season} />
      ) : (
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          {teamGames.warning ?? `Historical games unavailable for ${season}.`}
        </p>
      )}
    </section>
  );
}

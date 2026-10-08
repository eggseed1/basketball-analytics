import type { GameSummary } from "@/data/types";
import { nbaCalendarDate, nbaTodayIso } from "@/lib/nba-calendar-date";
import { countsTowardStandings } from "@/lib/standings-game-filter";
import { teamSnapshotGames } from "@/lib/team-snapshot-games";

export type TeamSchedulePhase = "preseason" | "regular" | "postseason";

type GameStatus = NonNullable<GameSummary["status"]>;

export type TeamScheduleRow = {
  id: string;
  season: string;
  /** League calendar day (US Eastern). */
  date: string;
  dateLabel: string;
  monthKey: string;
  monthLabel: string;
  /** League-time label: "7:30 PM ET", "Time TBD", or null once the game has a result. */
  timeLabel: string | null;
  /** Tip-off instant while a time is set, so views can show the viewer's zone. */
  tipOffAt: string | null;
  phase: TeamSchedulePhase;
  /** "Play-In" or "NBA Cup final"; these sit outside the 82-game record. */
  note: string | null;
  countsInRecord: boolean;
  home: boolean;
  oppId: string;
  oppAbbr: string;
  oppName: string;
  status: GameStatus;
  result: "W" | "L" | null;
  teamScore: number | null;
  oppScore: number | null;
  overtime: boolean;
  /** Second night of a back-to-back (team also played the previous day). */
  backToBack: boolean;
  isNext: boolean;
};

export type TeamScheduleSummary = {
  regularSet: number;
  regularHome: number;
  regularAway: number;
  backToBacks: number;
  wins: number;
  losses: number;
  preseasonSet: number;
  postseasonPlayed: number;
  nextGame: TeamScheduleRow | null;
};

const REGULAR_SEASON_GAMES = 82;
/** Cup-era schedules publish 80 games; the last 2 follow the NBA Cup group stage. */
const CUP_ERA_PUBLISHED_GAMES = 80;

const etTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
});

function phaseOf(game: GameSummary): TeamSchedulePhase {
  if (game.gameType === "preseason") return "preseason";
  if (game.gameType === "playoff" || game.gameType === "play-in") {
    return "postseason";
  }
  return "regular";
}

function utcDateLabel(iso: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).toLocaleDateString(
    "en-US",
    { ...opts, timeZone: "UTC" }
  );
}

function previousDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) - 1));
  return dt.toISOString().slice(0, 10);
}

function timeLabel(game: GameSummary): string | null {
  if (game.status === "final") return null;
  if (/\bTBD\b/i.test(game.statusDetail ?? "")) return "Time TBD";
  if (!game.tipOffAt) return null;
  const d = new Date(game.tipOffAt);
  if (Number.isNaN(d.getTime())) return null;
  return `${etTime.format(d)} ET`;
}

const NO_SCORE_STATUSES = new Set<GameStatus>([
  "scheduled",
  "pregame",
  "postponed",
  "cancelled",
  "unknown",
]);

export function buildTeamSchedule(
  teamId: string,
  season: string,
  now: Date = new Date()
): { rows: TeamScheduleRow[]; summary: TeamScheduleSummary } {
  const today = nbaTodayIso(now);
  const games = teamSnapshotGames(teamId, season)
    .map((game) => ({
      game,
      date: game.tipOffAt ? nbaCalendarDate(game.tipOffAt) : game.gameDate,
    }))
    .sort((a, b) =>
      a.date === b.date
        ? (a.game.tipOffAt ?? "").localeCompare(b.game.tipOffAt ?? "")
        : a.date.localeCompare(b.date)
    );

  const playedDates = new Set(
    games
      .filter(({ game }) => game.status !== "postponed" && game.status !== "cancelled")
      .map(({ date }) => date)
  );

  const nextIdx = games.findIndex(
    ({ game, date }) =>
      date >= today &&
      game.status !== "final" &&
      game.status !== "postponed" &&
      game.status !== "cancelled"
  );

  const rows: TeamScheduleRow[] = games.map(({ game, date }, idx) => {
    const home = game.homeTeamId === teamId;
    const status: GameStatus = game.status ?? "unknown";
    const hasScore = !NO_SCORE_STATUSES.has(status);
    const teamScore = hasScore ? (home ? game.homeScore : game.awayScore) : null;
    const oppScore = hasScore ? (home ? game.awayScore : game.homeScore) : null;
    const result =
      game.status === "final" && teamScore != null && oppScore != null
        ? teamScore > oppScore
          ? "W"
          : teamScore < oppScore
            ? "L"
            : null
        : null;
    const periods = Math.max(
      game.homePeriodScores?.length ?? 0,
      game.awayPeriodScores?.length ?? 0
    );
    return {
      id: game.id,
      season: game.season,
      date,
      dateLabel: utcDateLabel(date, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      monthKey: date.slice(0, 7),
      monthLabel: utcDateLabel(date, { month: "long", year: "numeric" }),
      timeLabel: timeLabel(game),
      tipOffAt: timeLabel(game) && timeLabel(game) !== "Time TBD" ? (game.tipOffAt ?? null) : null,
      phase: phaseOf(game),
      note:
        game.gameType === "play-in"
          ? "Play-In"
          : game.cupChampionship
            ? "NBA Cup final"
            : null,
      countsInRecord: countsTowardStandings(game),
      home,
      oppId: home ? game.awayTeamId : game.homeTeamId,
      oppAbbr: (home ? game.awayTeamAbbr : game.homeTeamAbbr) ?? "",
      oppName: (home ? game.awayTeamName : game.homeTeamName) ?? "",
      status,
      result,
      teamScore,
      oppScore,
      overtime: game.status === "final" && periods > 4,
      backToBack:
        game.status !== "postponed" &&
        game.status !== "cancelled" &&
        playedDates.has(previousDay(date)),
      isNext: idx === nextIdx,
    };
  });

  const regular = rows.filter(
    (r) =>
      r.countsInRecord &&
      r.status !== "cancelled" &&
      r.status !== "postponed"
  );
  const summary: TeamScheduleSummary = {
    regularSet: regular.length,
    regularHome: regular.filter((r) => r.home).length,
    regularAway: regular.filter((r) => !r.home).length,
    backToBacks: regular.filter((r) => r.backToBack).length,
    wins: regular.filter((r) => r.result === "W").length,
    losses: regular.filter((r) => r.result === "L").length,
    preseasonSet: rows.filter((r) => r.phase === "preseason").length,
    postseasonPlayed: rows.filter(
      (r) => r.phase === "postseason" && r.status === "final"
    ).length,
    nextGame: nextIdx >= 0 ? rows[nextIdx]! : null,
  };

  return { rows, summary };
}

/** Plain-language note when the published slate is short of 82 games. */
export function regularSeasonGapNote(regularSet: number): string | null {
  if (regularSet <= 0 || regularSet >= REGULAR_SEASON_GAMES) return null;
  if (regularSet === CUP_ERA_PUBLISHED_GAMES) {
    return `${regularSet} of ${REGULAR_SEASON_GAMES} regular-season games are on the calendar. The NBA adds each team's last 2 after the NBA Cup group stage in December.`;
  }
  return `${regularSet} of ${REGULAR_SEASON_GAMES} regular-season games are on the published calendar so far.`;
}

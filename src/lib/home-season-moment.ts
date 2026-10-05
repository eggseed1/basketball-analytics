/**
 * Where the league calendar stands today, read from real schedule dates, and
 * which homepage modules lead at that point. Pure: callers pass the games.
 */

import type { Game } from "@/data/types";

export type HomeSeasonPhase =
  | "draft-free-agency"
  | "offseason"
  | "preseason"
  | "opening-weeks"
  | "regular-season"
  | "stretch-run"
  | "play-in"
  | "playoffs";

export type SeasonChampion = {
  season: string;
  teamId: string;
  abbr: string;
  name: string;
  runnerUpId: string;
  runnerUpAbbr: string;
  runnerUpName: string;
  /** Finals series score, winner first, e.g. "4-2". */
  result: string;
};

export type OpenerGame = {
  id: string;
  awayAbbr: string;
  homeAbbr: string;
};

export type ScheduleMarks = {
  season: string;
  preseasonStart: string | null;
  opener: string | null;
  regularEnd: string | null;
  playoffStart: string | null;
  openerGames: OpenerGame[];
  champion: SeasonChampion | null;
};

export type HomeSeasonMoment = {
  phase: HomeSeasonPhase;
  today: string;
  /** League year the homepage centers on (flips Jul 1). */
  season: string;
  marks: ScheduleMarks;
  /** Champion of the most recently finished season, when known. */
  champion: SeasonChampion | null;
  daysToOpener: number | null;
  daysToPreseason: number | null;
  /** Calendar days left through the last regular-season date, today included. */
  regularDaysLeft: number | null;
  /** 1-based week of the regular season. */
  regularWeek: number | null;
};

export const OPENING_WEEKS_DAYS = 21;
export const STRETCH_RUN_DAYS = 28;
const PLAYOFF_SERIES_COUNT = 15;
const SERIES_WINS = 4;

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T12:00:00Z`);
  const b = Date.parse(`${toIso}T12:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

function minDate(games: Game[]): string | null {
  let out: string | null = null;
  for (const g of games) if (g.gameDate && (!out || g.gameDate < out)) out = g.gameDate;
  return out;
}

function maxDate(games: Game[]): string | null {
  let out: string | null = null;
  for (const g of games) if (g.gameDate && (!out || g.gameDate > out)) out = g.gameDate;
  return out;
}

/**
 * Champion only once all 15 series have a 4-win team, so a finished
 * conference final is never mistaken for the Finals.
 */
export function seasonChampion(season: string, games: Game[]): SeasonChampion | null {
  type Series = {
    a: Game;
    wins: Map<string, number>;
    last: string;
  };
  const series = new Map<string, Series>();
  for (const g of games) {
    if (g.gameType !== "playoff" || g.status !== "final") continue;
    const hs = g.homeScore ?? 0;
    const as = g.awayScore ?? 0;
    if (hs === as) continue;
    const key = [g.homeTeamId, g.awayTeamId].sort().join("|");
    let s = series.get(key);
    if (!s) {
      s = { a: g, wins: new Map(), last: g.gameDate };
      series.set(key, s);
    }
    const winner = hs > as ? g.homeTeamId : g.awayTeamId;
    s.wins.set(winner, (s.wins.get(winner) ?? 0) + 1);
    if (g.gameDate > s.last) s.last = g.gameDate;
  }

  const decided = [...series.values()].filter((s) =>
    [...s.wins.values()].some((w) => w >= SERIES_WINS)
  );
  if (decided.length < PLAYOFF_SERIES_COUNT) return null;

  const finals = decided.reduce((best, s) => (s.last > best.last ? s : best));
  const g = finals.a;
  const homeWins = finals.wins.get(g.homeTeamId) ?? 0;
  const awayWins = finals.wins.get(g.awayTeamId) ?? 0;
  const homeWon = homeWins > awayWins;
  return {
    season,
    teamId: homeWon ? g.homeTeamId : g.awayTeamId,
    abbr: (homeWon ? g.homeTeamAbbr : g.awayTeamAbbr) ?? "",
    name: (homeWon ? g.homeTeamName : g.awayTeamName) ?? "",
    runnerUpId: homeWon ? g.awayTeamId : g.homeTeamId,
    runnerUpAbbr: (homeWon ? g.awayTeamAbbr : g.homeTeamAbbr) ?? "",
    runnerUpName: (homeWon ? g.awayTeamName : g.homeTeamName) ?? "",
    result: `${Math.max(homeWins, awayWins)}-${Math.min(homeWins, awayWins)}`,
  };
}

/** `today` limits results to games played by then; schedule dates stay complete. */
export function scheduleMarks(season: string, games: Game[], today?: string): ScheduleMarks {
  const own = games.filter((g) => g.season === season);
  const played = today ? own.filter((g) => g.gameDate <= today) : own;
  const preseason = own.filter((g) => g.gameType === "preseason");
  const regular = own.filter((g) => g.gameType === "regular");
  const playoff = own.filter((g) => g.gameType === "playoff");
  const opener = minDate(regular);
  const openerGames = opener
    ? regular
        .filter((g) => g.gameDate === opener)
        .sort((a, b) => (a.tipOffAt ?? "").localeCompare(b.tipOffAt ?? "") || a.id.localeCompare(b.id))
        .map((g) => ({
          id: g.id,
          awayAbbr: g.awayTeamAbbr ?? g.awayTeamId,
          homeAbbr: g.homeTeamAbbr ?? g.homeTeamId,
        }))
    : [];
  return {
    season,
    preseasonStart: minDate(preseason),
    opener,
    regularEnd: maxDate(regular),
    playoffStart: minDate(playoff),
    openerGames,
    champion: seasonChampion(season, played),
  };
}

/**
 * `current` is the league year that owns today (flips Jul 1); `previous` is
 * the one before it, used for the offseason champion.
 */
export function resolveHomeSeasonMoment(input: {
  today: string;
  current: ScheduleMarks;
  previous: ScheduleMarks | null;
}): HomeSeasonMoment {
  const { today, current, previous } = input;
  const base = {
    today,
    season: current.season,
    marks: current,
    daysToOpener: current.opener ? daysBetween(today, current.opener) : null,
    daysToPreseason: current.preseasonStart ? daysBetween(today, current.preseasonStart) : null,
    regularDaysLeft: null as number | null,
    regularWeek: null as number | null,
  };

  if (current.opener && today >= current.opener) {
    const sinceOpener = daysBetween(current.opener, today);
    const regularWeek = Math.floor(sinceOpener / 7) + 1;
    if (!current.regularEnd || today <= current.regularEnd) {
      const regularDaysLeft = current.regularEnd ? daysBetween(today, current.regularEnd) + 1 : null;
      const phase: HomeSeasonPhase =
        sinceOpener < OPENING_WEEKS_DAYS
          ? "opening-weeks"
          : regularDaysLeft != null && regularDaysLeft <= STRETCH_RUN_DAYS
            ? "stretch-run"
            : "regular-season";
      return {
        ...base,
        phase,
        champion: previous?.champion ?? null,
        regularDaysLeft,
        regularWeek,
      };
    }
    if (current.champion) {
      return { ...base, phase: "draft-free-agency", champion: current.champion };
    }
    const phase: HomeSeasonPhase =
      current.playoffStart && today >= current.playoffStart ? "playoffs" : "play-in";
    return { ...base, phase, champion: previous?.champion ?? null };
  }

  if (current.preseasonStart && today >= current.preseasonStart) {
    return { ...base, phase: "preseason", champion: previous?.champion ?? null };
  }

  // Before the league year's first game: the draft and free agency run through
  // July; after that it is the quiet stretch before camp.
  const month = Number(today.slice(5, 7));
  return {
    ...base,
    phase: month === 7 ? "draft-free-agency" : "offseason",
    champion: previous?.champion ?? null,
  };
}

export type HomeModuleId =
  | "moment"
  | "phase-bar"
  | "calendar"
  | "bracket"
  | "standings"
  | "standings-race"
  | "findings"
  | "top-performers"
  | "hot-cold"
  | "transactions"
  | "watchlist"
  | "sentiment"
  | "news";

export type HomeLayout = {
  /** Full width, in order, above the two-column grid. */
  top: HomeModuleId[];
  main: HomeModuleId[];
  side: HomeModuleId[];
  /** Full width, below the grid. */
  bottom: HomeModuleId[];
};

const LAYOUTS: Record<HomeSeasonPhase, HomeLayout> = {
  "draft-free-agency": {
    top: ["moment"],
    main: ["transactions", "news", "sentiment"],
    side: ["watchlist", "top-performers", "standings"],
    bottom: [],
  },
  offseason: {
    top: ["moment"],
    main: ["transactions", "news", "sentiment"],
    side: ["watchlist", "top-performers", "standings"],
    bottom: [],
  },
  preseason: {
    top: ["moment", "calendar"],
    main: ["findings", "transactions", "news", "sentiment"],
    side: ["watchlist", "top-performers", "standings"],
    bottom: [],
  },
  "opening-weeks": {
    top: ["phase-bar", "calendar"],
    main: ["findings", "watchlist", "sentiment", "news"],
    side: ["standings", "top-performers", "transactions"],
    bottom: ["hot-cold"],
  },
  "regular-season": {
    top: ["phase-bar", "calendar"],
    main: ["findings", "watchlist", "sentiment", "news"],
    side: ["standings", "top-performers", "transactions"],
    bottom: ["hot-cold"],
  },
  "stretch-run": {
    top: ["phase-bar", "calendar"],
    main: ["standings-race", "findings", "watchlist", "news"],
    side: ["top-performers", "sentiment", "transactions"],
    bottom: ["hot-cold"],
  },
  "play-in": {
    top: ["phase-bar", "calendar", "bracket"],
    main: ["findings", "watchlist", "news", "sentiment"],
    side: ["standings", "top-performers", "transactions"],
    bottom: [],
  },
  playoffs: {
    top: ["phase-bar", "calendar", "bracket"],
    main: ["findings", "watchlist", "news", "sentiment"],
    side: ["top-performers", "transactions"],
    bottom: [],
  },
};

export function homeLayoutForPhase(phase: HomeSeasonPhase): HomeLayout {
  return LAYOUTS[phase];
}

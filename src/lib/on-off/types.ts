import type { LeagueRates, OnOffSplit, OnOffView } from "@/lib/on-off/metrics";

export const ON_OFF_FILE_VERSION = 5;

export type OnOffPhase = "regular" | "playoffs";
export const ON_OFF_PHASES: readonly OnOffPhase[] = ["regular", "playoffs"];

/** Pair rows need both teammates above this many possessions, offense plus defense. */
export const PAIR_MIN_POSS: Record<OnOffPhase, number> = { regular: 400, playoffs: 150 };

export type OnOffViews = Record<OnOffView, OnOffSplit>;

/** [index into schedule, offense poss, points scored, defense poss, points allowed]. */
export type OnOffGameRow = [number, number, number, number, number];
/** Per-game totals for the views a trend makes sense for. Clutch is too thin per game. */
export type OnOffGameLog = { clean: OnOffGameRow[]; all: OnOffGameRow[] };
export const GAME_LOG_VIEWS = ["clean", "all"] as const;

export type OnOffScheduleGame = { id: string; date: string; opp: string; home: boolean };

/** Schedule indexes of his first and last game with the team, and team totals over those games. */
export type OnOffStint = { first: number; last: number; team: OnOffViews };

export type TeamOnOffPlayer = {
  /** NBA person id. */
  id: string;
  name: string;
  gp: number;
  starts: number;
  /** Regular-season DRBL/100, when the player is rated. */
  rating: number | null;
  log: OnOffGameLog;
  /** Present when his time with the team is shorter than its schedule. Off splits use it. */
  stint?: OnOffStint;
} & OnOffViews;

/**
 * Totals over the games both teammates were with the team. Each field is present only when it
 * differs from the full-season row: team when the shared window is shorter than the schedule,
 * a or b when that player also played outside it. Vectors hold RATING_KEYS only.
 */
export type OnOffSharedWindow = { team?: OnOffViews; a?: OnOffViews; b?: OnOffViews };

/** Two teammates on the floor together. With/without splits derive from these and the solo rows. */
export type TeamOnOffPair = { a: string; b: string; shared?: OnOffSharedWindow } & OnOffViews;

export type TeamOnOffLineup = { ids: string[] } & OnOffViews;

export type TeamOnOffFile = {
  version: number;
  season: string;
  phase: OnOffPhase;
  /** NBA team id. */
  teamId: string;
  teamAbbr: string;
  generatedAt: string;
  games: number;
  keys: readonly string[];
  schedule: OnOffScheduleGame[];
  team: OnOffViews;
  teamLog: OnOffGameLog;
  players: TeamOnOffPlayer[];
  pairs: TeamOnOffPair[];
  lineups: TeamOnOffLineup[];
};

/** Indexed like ON_OFF_VIEWS: [clean, all, clutch]. */
type PerView<T> = [T, T, T];

export type LeagueOnOffPlayer = {
  id: string;
  teamId: string;
  name: string;
  gp: number;
  poss: PerView<number>;
  /** Team possessions with him off the floor during his stint, offense plus defense. */
  offPoss: PerView<number>;
  netDiff: PerView<number | null>;
  /** 95% range of netDiff, from the unrounded swing and standard error. */
  netDiffRange: PerView<[number, number] | null>;
  netLuckAdjDiff: PerView<number | null>;
  ortgDiff: PerView<number | null>;
  drtgDiff: PerView<number | null>;
};

export type LeagueOnOffFile = {
  version: number;
  season: string;
  phase: OnOffPhase;
  generatedAt: string;
  games: number;
  gamesQuarantined: number;
  rates: Record<OnOffView, LeagueRates>;
  players: LeagueOnOffPlayer[];
};

export type OnOffManifest = {
  version: number;
  generatedAt: string;
  seasons: Array<{
    season: string;
    games: number;
    teams: string[];
    playoffs?: { games: number; teams: string[] };
  }>;
};

/** Folder under public/runtime/on-off for a season and phase. */
export function onOffDir(season: string, phase: OnOffPhase): string {
  return phase === "playoffs" ? `${season}/playoffs` : season;
}

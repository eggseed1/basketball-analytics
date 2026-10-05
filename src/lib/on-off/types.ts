import type { LeagueRates, OnOffSplit, OnOffView } from "@/lib/on-off/metrics";

export const ON_OFF_FILE_VERSION = 2;

export type OnOffViews = Record<OnOffView, OnOffSplit>;

export type TeamOnOffPlayer = {
  /** NBA person id. */
  id: string;
  name: string;
  gp: number;
  starts: number;
  /** Season DRBL/100, when the player is rated. */
  rating: number | null;
} & OnOffViews;

/** Two teammates on the floor together. With/without splits derive from these and the solo rows. */
export type TeamOnOffPair = { a: string; b: string } & OnOffViews;

export type TeamOnOffLineup = { ids: string[] } & OnOffViews;

export type TeamOnOffFile = {
  version: number;
  season: string;
  /** NBA team id. */
  teamId: string;
  teamAbbr: string;
  generatedAt: string;
  games: number;
  keys: readonly string[];
  team: OnOffViews;
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
  poss: PerView<number>;
  netDiff: PerView<number | null>;
  netLuckAdjDiff: PerView<number | null>;
  ortgDiff: PerView<number | null>;
  drtgDiff: PerView<number | null>;
};

export type LeagueOnOffFile = {
  version: number;
  season: string;
  generatedAt: string;
  games: number;
  gamesQuarantined: number;
  rates: Record<OnOffView, LeagueRates>;
  players: LeagueOnOffPlayer[];
};

export type OnOffManifest = {
  version: number;
  generatedAt: string;
  seasons: Array<{ season: string; games: number; teams: string[] }>;
};

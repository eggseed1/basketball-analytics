import type { LeagueRates, OnOffSplit, OnOffView } from "@/lib/on-off/metrics";

export const ON_OFF_FILE_VERSION = 1;

export type OnOffViews = Record<OnOffView, OnOffSplit>;

export type TeamOnOffPlayer = {
  /** NBA person id. */
  id: string;
  name: string;
  gp: number;
  starts: number;
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

/** Per view: [clean, all]. */
export type LeagueOnOffPlayer = {
  id: string;
  teamId: string;
  name: string;
  poss: [number, number];
  netDiff: [number | null, number | null];
  netLuckAdjDiff: [number | null, number | null];
  ortgDiff: [number | null, number | null];
  drtgDiff: [number | null, number | null];
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

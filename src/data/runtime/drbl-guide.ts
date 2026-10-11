/**
 * Numbers behind the DRBL guide at /learn/drbl, baked from the published
 * season artifacts and the outcome test by scripts/build-drbl-guide.ts.
 */
import snapshot from "./drbl-guide-snapshot.json";

export type DrblGuidePlayer = {
  id: string;
  name: string;
  teamId: string;
  possessions: number;
  drbl100: number;
  pbp100: number | null;
  offense: number | null;
  defense: number | null;
  war1: number | null;
};

/** [id, name, teamId, possessions, DRBL/100, WAR1] */
export type DrblGuideScatterPoint = readonly [string, string, string, number, number, number];

export type DrblCarryoverBucket = {
  label: string;
  pairs: number;
  pbpToNextPbp: number;
  blendToNextPbp: number;
  blendToNextBlend: number;
};

export type DrblOutcomeTest = {
  kind: "season-ahead" | "within-season";
  label: string;
  games: number;
  homeRmse: number;
  pbpRmse: number;
  blendRmse: number;
  pbpR2: number;
  blendR2: number;
};

export type DrblGuideSnapshot = {
  generatedAt: string;
  latestSeason: string;
  coverage: Array<{ season: string; games: number; players: number }>;
  distribution: {
    season: string;
    minPossessions: number;
    players: number;
    belowZero: number;
    weightedMean: number;
    weightedSd: number;
    bins: Array<{ from: number; to: number; players: number }>;
  };
  leaders: DrblGuidePlayer[];
  movers: { up: DrblGuidePlayer[]; down: DrblGuidePlayer[] };
  scatter: { season: string; minPossessions: number; points: DrblGuideScatterPoint[] };
  carryover: { minPossessions: number; seasons: string; buckets: DrblCarryoverBucket[] };
  outcome: { generatedAt: string; tests: DrblOutcomeTest[] };
  /** reports/contract-basis-study/latest.json: contract projections scored on next-season games (frozen). */
  contractBasis?: {
    generatedAt: string;
    seasons: string[];
    games: number;
    teamSeasons: number | null;
    drblBetterSeasons: number;
    rows: Array<{ key: "war1" | "mix" | "drbl"; r2: number; teamR: number | null }>;
  } | null;
};

export function drblGuide(): DrblGuideSnapshot {
  return snapshot as unknown as DrblGuideSnapshot;
}

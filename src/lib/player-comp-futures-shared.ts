/**
 * Client-safe types and formatters for comps/futures charts.
 * Keep heavy pool loaders in `player-comp-futures.ts` (server-only).
 */
import { formatNumber } from "@/lib/format";

export const COMP_METRICS = [
  { id: "drbl100", label: "DRBL/100", digits: 1, unit: "points per 100 possessions", baseline: "0 is average" },
  { id: "war1", label: "WAR1", digits: 1, unit: "a season total", baseline: "0 is average" },
  { id: "darko", label: "DARKO", digits: 2, unit: "points per 100 possessions", baseline: "0 is average" },
  { id: "bpm", label: "BPM", digits: 1, unit: "points per 100 possessions", baseline: "0 is average" },
  { id: "vorp", label: "VORP", digits: 1, unit: "wins above replacement", baseline: "0 is replacement" },
  { id: "raptor", label: "RAPTOR", digits: 2, unit: "points per 100 possessions", baseline: "0 is average" },
  { id: "drblO", label: "DRBL-O", digits: 1, unit: "points per 100 possessions", baseline: "0 is average" },
  { id: "drblD", label: "DRBL-D", digits: 1, unit: "points per 100 possessions", baseline: "0 is average" },
  { id: "darkoOff", label: "DARKO-O", digits: 2, unit: "points per 100 possessions", baseline: "0 is average" },
  { id: "darkoDef", label: "DARKO-D", digits: 2, unit: "points per 100 possessions", baseline: "0 is average" },
] as const;

export type CompMetricId = (typeof COMP_METRICS)[number]["id"];

export type CompSlotKind =
  | "anchor"
  | "qualifying"
  | "unrated"
  | "short"
  | "missing"
  | "unobserved"
  | "unavailable";

export type CompSlot = {
  season: string;
  games: number | null;
  value: number | null;
  kind: CompSlotKind;
};

export type CompFuturesPoint = {
  age: number;
  /** Elapsed seasons after the anchor. Negative numbers are the player's own history. */
  offset: number;
  season: string | null;
  focal: number | null;
  p10: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  /** Share of observed comps with 10+ games. Null when the horizon is unobserved. */
  participation: number | null;
  playedCount: number;
  observedCount: number;
  ratingCount: number;
  suppressed: boolean;
};

export type CompFuturesRow = {
  playerId: string;
  playerName: string;
  season: string;
  age: number;
  value: number;
  /** Full-precision similarity, 0 to 100. */
  similarity: number;
  slots: CompSlot[];
  future: Array<number | null>;
};

export type CompFanLine = {
  playerId: string;
  playerName: string;
  similarity: number;
  anchorSeason: string;
  anchorAge: number;
  anchorValue: number;
  slots: CompSlot[];
  values: Array<number | null>;
};

export type CompFutures = {
  metricId: CompMetricId;
  metricLabel: string;
  digits: number;
  unit: string;
  baseline: string;
  versionNote: string;
  coverageStart: string;
  coverageEnd: string;
  focalName: string;
  focalSeason: string;
  focalAge: number;
  focalValue: number;
  rank: number;
  poolSize: number;
  closestName: string;
  closestSeason: string;
  fanCount: number;
  ageWindow: number;
  points: CompFuturesPoint[];
  table: CompFuturesRow[];
  fan: CompFanLine[];
};

export type CompFuturesBundle = {
  defaultId: CompMetricId;
  items: CompFutures[];
  /**
   * Chip list when SSR ships only the default item. Client loads the rest
   * via `/api/players/[id]/comp-futures`.
   */
  availableMetrics?: Array<{ id: CompMetricId; label: string }>;
};

export type CompFocalProfile = {
  off: number | null;
  def: number | null;
  lag1: number | null;
  lag2: number | null;
  pts36: number | null;
  trb36: number | null;
  ast36: number | null;
  heightInches: number | null;
  positionCode: number | null;
  experience: number | null;
};

export function formatCompValue(value: number, digits = 1): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, digits)}`;
}

export function formatSimilarity(similarity: number): string {
  return similarity.toFixed(1);
}

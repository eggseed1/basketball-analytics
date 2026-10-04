/** Client-safe shapes for the team overview charts. Builders live in team-overview-data.ts. */

import { formatNumber, formatPct } from "@/lib/format";

export const ROLLING_WINDOW = 10;

export type TrajectoryPhase = "regular" | "play-in" | "playoff";

export type TrajectoryGame = {
  id: string;
  n: number;
  date: string;
  opponentId: string;
  opponentAbbr: string;
  home: boolean;
  pf: number;
  pa: number;
  margin: number;
  win: boolean;
  overtime: boolean;
  phase: TrajectoryPhase;
  /** Rolling average margin over the last `ROLLING_WINDOW` games, including this one. */
  rolling: number;
  /** Regular-season wins minus losses after this game; carries the final value into the postseason. */
  overUnder: number;
  /** Regular-season W-L after this game. */
  record: string;
};

export type SeasonHighlight = {
  id: string;
  label: string;
  value: string;
  detail?: string;
  gameId?: string;
};

export type DnaAxis = {
  key: string;
  label: string;
  percentile: number;
  display: string;
  rankLine: string;
  style: boolean;
};

export type StripPoint = { teamId: string; abbr: string; value: number };

export type StripFormat = "pct" | "num1" | "signed";

export type LeagueStripData = {
  key: string;
  label: string;
  /** Lower raw values are better, so the axis flips and better always reads right. */
  lowerIsBetter: boolean;
  points: StripPoint[];
  team: StripPoint;
  average: number;
  rank: number;
  format: StripFormat;
};

export type LadderRow = { teamId: string; abbr: string; conference: string; net: number };

export function formatStripValue(format: StripFormat, v: number): string {
  if (format === "pct") return formatPct(v);
  if (format === "signed") return `${v > 0 ? "+" : ""}${formatNumber(v, 1)}`;
  return formatNumber(v, 1);
}

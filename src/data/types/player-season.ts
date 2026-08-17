import type { Position } from "./player";

/**
 * Season-level counting and advanced stats for a player.
 * Percentages are stored as fractions in [0, 1] (e.g. 0.582 = 58.2%).
 * Ratings follow standard NBA scale (~100 = average).
 */
export interface PlayerSeason {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  /** Season identifier, e.g. "2024-25". */
  season: string;
  position?: Position;
  gamesPlayed: number;
  minutes: number;
  points: number;
  assists: number;
  rebounds: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fieldGoalPct: number;
  threePointPct: number;
  freeThrowPct: number;
  /** Derived rates — omit when inputs/denominators are unavailable. */
  trueShootingPct?: number;
  effectiveFieldGoalPct?: number;
  usagePct?: number;
  /**
   * Possession-aware ratings. Optional: ESPN season boards do not publish
   * individual DRtg/NET — missing must not be coerced to 0.
   */
  offensiveRating?: number;
  defensiveRating?: number;
  netRating?: number;
  /** Optional impact overlays (joined from DARKO / LEBRON feeds). */
  darkoDpm?: number;
  darkoOff?: number;
  darkoDef?: number;
  lebron?: number;
  oLebron?: number;
  dLebron?: number;
  winsAdded?: number;
}

import type { Position } from "./player";

/**
 * Season-level counting and advanced stats for a player.
 * Percentages are stored as fractions in [0, 1] (e.g. 0.582 = 58.2%).
 * Ratings follow standard NBA scale (~100 = average).
 *
 * Counting fields mirror Basketball-Reference Per Game / Totals columns.
 * Advanced fields combine stats.nba.com Advanced with BRef PER/WS/BPM/VORP.
 */
export interface PlayerSeason {
  playerId: string;
  playerName: string;
  /**
   * Canonical product team id (ESPN team id string) for UI / brand / routes.
   * Multi-team aggregate rows use `TOT` (no franchise brand).
   */
  teamId: string;
  teamName: string;
  teamAbbreviation?: string;
  /**
   * Provider namespace for `providerTeamId` when retained for provenance.
   * Product UI must not render providerTeamId as the team label.
   */
  teamIdProvider?: "espn" | "nba" | "bdl" | (string & {});
  /** Raw provider team id before canonicalization (e.g. NBA Stats TEAM_ID). */
  providerTeamId?: string;
  /** Convenience alias when teamIdProvider === "nba". */
  nbaTeamId?: string;
  /** Season identifier, e.g. "2024-25". */
  season: string;
  position?: Position;
  age?: number;
  /** Calendar draft year when known (NBA Stats drafthistory). */
  draftYear?: number;
  gamesPlayed: number;
  gamesStarted: number;
  minutes: number;

  /** Season totals (BRef Totals). */
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threePointersMade: number;
  threePointersAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  offensiveRebounds: number;
  defensiveRebounds: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  personalFouls: number;
  points: number;
  plusMinus: number;

  /** Shooting percentages (fractions). */
  fieldGoalPct: number;
  twoPointPct: number;
  threePointPct: number;
  freeThrowPct: number;
  /** Optional: omit when provider did not publish (do not invent 0). */
  effectiveFieldGoalPct?: number;
  trueShootingPct?: number;

  /** Advanced rates (fractions unless noted). */
  threePointAttemptRate: number;
  freeThrowRate: number;
  turnoverPct: number;
  /** Optional: omit when provider did not publish (do not invent 0). */
  usagePct?: number;
  assistPct: number;
  offensiveReboundPct: number;
  defensiveReboundPct: number;
  reboundPct: number;
  stealPct: number;
  blockPct: number;
  /** Player Impact Estimate (NBA Stats). */
  pie: number;

  /** Points per 100 possessions - optional when provider omits. */
  offensiveRating?: number;
  defensiveRating?: number;
  netRating?: number;

  /** Basketball-Reference advanced box. */
  per: number;
  ows: number;
  dws: number;
  winShares: number;
  winSharesPer48: number;
  obpm: number;
  dbpm: number;
  bpm: number;
  vorp: number;

  /**
   * DARKO Daily Player Metrics (darko.app), available from 1996-97.
   * DPM ≈ points per 100 possessions vs average; 0 when unavailable.
   */
  dpm: number;
  oDpm: number;
  dDpm: number;
  boxDpm: number;
  onOffDpm: number;

  /**
   * Optional impact overlays joined from public DARKO / LEBRON feeds (web IA).
   * Not canonical DRBL value; never substitute for drbl100 / R1 fields.
   */
  darkoDpm?: number;
  darkoOff?: number;
  darkoDef?: number;
  lebron?: number;
  oLebron?: number;
  dLebron?: number;
  winsAdded?: number;

  /**
   * Canonical DRBL/100 - validated P-only EB1600 point estimate (M16k1+).
   * Canonical overall ranking uses descending unrounded drbl100.
   */
  drbl100: number;
  /** Unshrunk Approach-B raw ability rate (for estimate availability). */
  rawAbilityRate?: number;
  /** Actual combined possession appearances from DRBL overlay. */
  drblPossessions?: number;
  /** Production ability model id when DRBL overlay is present. */
  abilityModelVersion?: string;
  /** Season DRBL board rank (descending unrounded validatedDRBL100). */
  drblRank?: number;
  /** DRBL-P possession / Approach B component. */
  drblP: number;
  /** DRBL-LN regularized lineup component. */
  drblLn: number;
  /** DRBL-B public behavioral component. */
  drblB: number;
  drblO: number;
  drblD: number;
  /** Shot-decision value /100 FGA (M6+C2); not fused into drbl100. */
  sdv100: number;
  /** Shot-making residual /100 FGA. */
  shotMaking100: number;
  epvShootMean: number;
  vContMean: number;
  /**
   * Canonical realized R1 Points (Approach-B attributed residual).
   * null when DRBL overlay is absent - never coerce missing to 0.
   */
  r1Points: number | null;
  /**
   * R1 Points / frozen P1. Not conventional WAR.
   * null when DRBL overlay is absent.
   */
  r1WinEquivalents: number | null;
  r1PointValueVersion?: string | null;
  r1WinEquivalentVersion?: string | null;
  /**
   * @deprecated Legacy seasonalImpact / pointsPerWin (historical WAR generations).
   * DEPRECATED_NONCANONICAL - retained for storage/API compatibility only.
   * Do not display as canonical cumulative value; do not alias to r1WinEquivalents.
   */
  drblWar: number;
  /** Seasonal points above replacement (pre-WAR conversion; legacy companion). */
  drblSeasonalImpact: number;
  /**
   * Leverage-weighted seasonal impact Σ BaseValue × λ*
   * (formal WP derivative; excluded from R1 Points / WAR1).
   */
  drblL: number;
  /** Mean normalized leverage λ* on the player's possessions. */
  drblMeanLeverage: number;
  /** Scale-standardized component disagreement index (diagnostic). */
  drblDisagreement: number;
  /** Analytical ± half-width - LEGACY DIAGNOSTIC ONLY; not a validated interval. */
  drblUncertainty: number;
  drblIntervalLo: number;
  drblIntervalHi: number;
}

export interface Game {
  id: string;
  season: string;
  /** ISO date string YYYY-MM-DD. */
  gameDate: string;
  /** Full tip-off timestamp when known (ISO). */
  tipOffAt?: string;
  /** ESPN short status line, e.g. "10/3 - 7:00 PM EDT". */
  statusDetail?: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamAbbr?: string;
  awayTeamAbbr?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  homeScore: number;
  awayScore: number;
  /**
   * Per-period points when the source provides linescores (Q1…OT).
   * Lengths should match; absent when the source has no period breakdown.
   */
  homePeriodScores?: number[];
  awayPeriodScores?: number[];
  /** Regular season, playoffs, etc. */
  gameType: "regular" | "playoff" | "play-in" | "preseason";
  status?: "scheduled" | "in_progress" | "final";
}

/** Convenience metrics derived for game exploration views. */
export interface GameSummary extends Game {
  totalPoints: number;
  margin: number;
  absMargin: number;
}

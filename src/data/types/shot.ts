/**
 * Canonical shot attempt. Coordinates use a half-court system with
 * basket at (0, 0), x/y in feet. See docs/data-architecture.md.
 */
export interface Shot {
  id: string;
  gameId: string;
  playerId: string;
  teamId: string;
  season: string;
  /** ISO date string YYYY-MM-DD. */
  gameDate: string;
  period: number;
  /** Seconds remaining in the period when the shot was taken. */
  secondsRemaining: number;
  /** Distance from basket in feet. */
  shotDistance: number;
  /** Court x in feet (left-right from offensive perspective). */
  locX: number;
  /** Court y in feet (baseline toward half-court). */
  locY: number;
  made: boolean;
  shotType: "2PT" | "3PT";
  shotZoneBasic?: string;
  shotZoneArea?: string;
  assisted: boolean;
  assistPlayerId?: string;
}

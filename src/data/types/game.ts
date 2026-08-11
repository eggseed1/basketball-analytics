export interface Game {
  id: string;
  season: string;
  /** ISO date string YYYY-MM-DD. */
  gameDate: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamAbbr?: string;
  awayTeamAbbr?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  homeScore: number;
  awayScore: number;
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

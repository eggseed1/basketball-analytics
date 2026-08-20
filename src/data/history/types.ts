/** Shared historical product types (safe for client imports). */

export interface HistoricalGameSummary {
  historyVersion: string;
  season: string;
  gameId: string;
  provider: string;
  /** Factual season type from product when present (Regular Season / Playoffs). */
  seasonType?: string;
  date: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTricode?: string | null;
  awayTricode?: string | null;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string | null;
  periodCount: number;
  boxAvailable: boolean;
  pbpAvailable: boolean;
  scoreTimelineAvailable: boolean;
  drblAvailable: boolean;
  largestHomeLead: number | null;
  largestAwayLead: number | null;
  largestDeficitOvercomeByWinner: number | null;
  leadChanges: number | null;
  ties: number | null;
  largestStrictRunHome: { points: number; teamId: string } | null;
  largestStrictRunAway: { points: number; teamId: string } | null;
}

export interface HistoricalPlayerGame {
  gameId: string;
  season: string;
  date: string;
  playerId: string;
  playerName: string;
  teamId: string;
  opponentId: string;
  homeAway: "home" | "away";
  result: string;
  minutes: string | null;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fgm: number;
  fga: number;
  threePm: number;
  threePa: number;
  ftm: number;
  fta: number;
  starter: boolean | null;
}

export interface HistoricalGameArtifact {
  historyVersion: string;
  season: string;
  summary: HistoricalGameSummary;
  playerGames: HistoricalPlayerGame[];
  teamGames: Record<string, unknown>[];
  scoreTimeline: unknown[] | null;
  gameFlow: Record<string, unknown> | null;
  events: Array<{
    eventIndex: number;
    period: number;
    clock: string;
    teamId: string | null;
    playerId: string | null;
    playerName: string | null;
    eventType: string;
    description: string;
    points: number;
    homeScore: number;
    awayScore: number;
    sourceEventId: string;
  }>;
}

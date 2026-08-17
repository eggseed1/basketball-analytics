/**
 * DRBL Phase A — shared types.
 * Spec: Differential Replacement Basketball Level v1.0
 */

export type DrblSeason = string; // "2024-25"

export interface DrblGameMeta {
  gameId: string;
  season: DrblSeason;
  gameDate: string; // YYYY-MM-DD
  homeTeamId: string;
  awayTeamId: string;
  homeTeamTricode: string;
  awayTeamTricode: string;
  homeScore: number;
  awayScore: number;
  status: number; // 3 = final
}

export type DrblActionType =
  | "2pt"
  | "3pt"
  | "freethrow"
  | "rebound"
  | "turnover"
  | "steal"
  | "block"
  | "foul"
  | "substitution"
  | "jumpball"
  | "period"
  | "timeout"
  | "game"
  | "violation"
  | "ejection"
  | "instantreplay"
  | "unknown";

export interface DrblEvent {
  gameId: string;
  actionNumber: number;
  orderNumber: number;
  period: number;
  /** Seconds remaining in the period. */
  clockSeconds: number;
  /** ISO clock string from source, e.g. PT11M43.00S */
  clockRaw: string;
  actionType: DrblActionType;
  subType: string;
  teamId: string | null;
  playerId: string | null;
  playerName: string | null;
  /** Team with possession when known. */
  possessionTeamId: string | null;
  description: string;
  shotResult: "Made" | "Missed" | null;
  isFieldGoal: boolean;
  pointsOnAction: number;
  scoreHome: number;
  scoreAway: number;
  x: number | null;
  y: number | null;
  qualifiers: string[];
  /** For substitutions: "in" | "out". */
  substitutionSide: "in" | "out" | null;
  /**
   * Related actors from CDN when present (strongly observed).
   * May be filled from description parse as a weaker fallback.
   * Optional for backward-compatible normalized JSON.
   */
  assistPlayerId?: string | null;
  assistPlayerName?: string | null;
  stealPlayerId?: string | null;
  blockPlayerId?: string | null;
  /** How assistPlayerId was obtained. */
  assistSource?: "cdn" | "description" | null;
}

export interface DrblBoxPlayer {
  playerId: string;
  playerName: string;
  teamId: string;
  starter: boolean;
  minutes: number;
  points: number;
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
}

export interface DrblBoxScore {
  gameId: string;
  season: DrblSeason;
  gameDate: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamTricode: string;
  awayTeamTricode: string;
  homeScore: number;
  awayScore: number;
  players: DrblBoxPlayer[];
}

export interface DrblLineupState {
  /** Event actionNumber after which this lineup is active. */
  afterActionNumber: number;
  period: number;
  clockSeconds: number;
  homePlayerIds: string[];
  awayPlayerIds: string[];
}

export type DrblPossessionEndReason =
  | "made_fg"
  | "made_ft"
  | "def_rebound"
  | "turnover"
  | "period"
  | "jumpball"
  | "team_rebound"
  | "other";

export interface DrblPossession {
  gameId: string;
  possessionId: string;
  offenseTeamId: string;
  defenseTeamId: string;
  period: number;
  startActionNumber: number;
  endActionNumber: number;
  startClockSeconds: number;
  endClockSeconds: number;
  points: number;
  endReason: DrblPossessionEndReason;
  /** Offense lineup at possession start (5 ids when known). */
  offensePlayerIds: string[];
  defensePlayerIds: string[];
  eventActionNumbers: number[];
}

export interface DrblReconcileStatDiff {
  playerId: string;
  playerName: string;
  teamId: string;
  field: string;
  box: number;
  events: number;
  delta: number;
}

export interface DrblLineupMinuteDiff {
  playerId: string;
  playerName: string;
  teamId: string;
  boxMinutes: number;
  reconstructedMinutes: number;
  delta: number;
}

export interface DrblLineupReconcileReport {
  gameId: string;
  ok: boolean;
  reconstructionVersion: string;
  lineupSnapshots: number;
  maxAbsMinuteDelta: number;
  playerMinuteDiffs: DrblLineupMinuteDiff[];
  warnings: string[];
}

export interface DrblGameReconcileReport {
  gameId: string;
  ok: boolean;
  /** True when score/event reconciliation failed — do not use as training. */
  quarantined: boolean;
  possessionCount: number;
  homePointsFromPossessions: number;
  awayPointsFromPossessions: number;
  homeScoreBox: number;
  awayScoreBox: number;
  scoreDeltaHome: number;
  scoreDeltaAway: number;
  playerDiffs: DrblReconcileStatDiff[];
  lineup: DrblLineupReconcileReport | null;
  warnings: string[];
}

export interface DrblSeasonReconcileSummary {
  season: DrblSeason;
  gamesAttempted: number;
  gamesOk: number;
  gamesFailed: number;
  gamesQuarantined: number;
  totalPossessions: number;
  meanAbsScoreError: number;
  failures: Array<{ gameId: string; reason: string }>;
}

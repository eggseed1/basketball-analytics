/** In-depth Franchise Lab GM - canonical sim types (original; not ZenGM). */

export type GmPosition = "PG" | "SG" | "SF" | "PF" | "C";
export type Conference = "East" | "West";

export interface GmRatings {
  /** Overall impact ~ DARKO-like pts/100 scale, typically -3..+8 */
  impact: number;
  offense: number;
  defense: number;
  shooting: number;
  finishing: number;
  playmaking: number;
  rebounding: number;
  /** 0-100 stamina / durability */
  durability: number;
  /** Potential ceiling offset for development */
  potential: number;
}

/** What the user sees until scouting reveals truth. */
export interface ScoutedRatings {
  impact: number | null;
  offense: number | null;
  defense: number | null;
  uncertainty: number; // 0 = known, 1 = pure projection
}

export type ScoutLetterGrade =
  | "A+"
  | "A"
  | "A-"
  | "B+"
  | "B"
  | "B-"
  | "C+"
  | "C"
  | "C-"
  | "D"
  | "F";

export type ProspectArchetypeId =
  | "paint_beast"
  | "rim_protector"
  | "stretch_big"
  | "floor_general"
  | "combo_guard"
  | "splash"
  | "iso_scorer"
  | "two_way_wing"
  | "three_and_d"
  | "athletic_freak"
  | "pass_first"
  | "glue_guy";

/** Fogged dossier shown on the draft board before identity reveal. */
export interface ScoutProfile {
  archetypeLabel: string;
  archetypeId: ProspectArchetypeId;
  comps: string[];
  grades: {
    athleticism: ScoutLetterGrade | null;
    shooting: ScoutLetterGrade | null;
    creation: ScoutLetterGrade | null;
    defense: ScoutLetterGrade | null;
    feel: ScoutLetterGrade | null;
    upside: ScoutLetterGrade | null;
  };
  heightInEstimate: number | null;
  weightLbsEstimate: number | null;
  medicalNote: string | null;
  summary: string;
  confidence: number; // 0-1
  /** Scouted big-board slot (noisy). */
  boardRankHint: number | null;
}

export interface GmContract {
  yearsRemaining: number;
  annualSalaryM: number;
  birdRights: "none" | "early" | "bird";
  option?: "player" | "team" | null;
  signedSeason: number;
}

export interface GmInjury {
  type: string;
  gamesRemaining: number;
  reinjuryRisk: number;
}

export interface GmPlayer {
  id: string;
  /** True identity - hidden for undrafted prospects until pick night. */
  name: string;
  /** Cool scouting codename shown instead of `name` while identity is sealed. */
  codename?: string;
  /**
   * When false, UI must show `codename` (draft fog).
   * Undefined/true = identity public (roster, FA, post-draft).
   */
  identityRevealed?: boolean;
  teamId: string | null; // null = free agent / draft pool
  position: GmPosition;
  age: number;
  heightIn: number;
  weightLbs: number;
  ratings: GmRatings;
  scouted: ScoutedRatings;
  /** Pre-draft scouting dossier (grades, comps, notes). */
  scoutProfile?: ScoutProfile;
  contract: GmContract | null;
  injury: GmInjury | null;
  morale: number; // 0-100
  personality: number; // leadership -50..50
  minutesPreference: number;
  draftYear?: number;
  draftPick?: number;
  nbaPlayerId?: string;
  darko?: number;
  raptor?: number;
}

export interface GmStaff {
  headCoach: {
    name: string;
    offenseBonus: number;
    defenseBonus: number;
    developmentBonus: number;
  };
  /** @deprecated Prefer `scout.eye`; kept for older saves. */
  scoutLevel: number;
  /** Hired director of scouting - drives draft fog & expertise. */
  scout?: import("@/gm/seed/scouts").GmScout | null;
  trainerLevel: number; // reduces injury severity
}

export interface GmTeam {
  id: string;
  abbr: string;
  city: string;
  name: string;
  conference: Conference;
  division: string;
  ownerPatience: number;
  ownerGoal: "contend" | "retool" | "tank";
  fanConfidence: number;
  payrollLuxuryTaxM: number;
  staff: GmStaff;
  /** Starters by slot */
  starters: Record<GmPosition, string | null>;
  benchOrder: string[];
  draftPicks: GmDraftPick[];
  tradeExceptionsM: number[];
}

export interface GmDraftPick {
  id: string;
  season: number; // calendar year of draft
  round: 1 | 2;
  originalTeamId: string;
  ownerTeamId: string;
  protected?: boolean;
}

export interface GmStandingsRow {
  teamId: string;
  wins: number;
  losses: number;
  confWins: number;
  confLosses: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface GmScheduleGame {
  id: string;
  season: number;
  /** 0-based index of unique calendar dates in the season. */
  day: number;
  /** Real tip date YYYY-MM-DD when seeded from NBA schedule. */
  gameDate?: string;
  homeTeamId: string;
  awayTeamId: string;
  played: boolean;
  homeScore?: number;
  awayScore?: number;
  boxScoreId?: string;
}

export interface GmBoxPlayerLine {
  playerId: string;
  playerName: string;
  teamId: string;
  minutes: number;
  points: number;
  assists: number;
  rebounds: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  plusMinus: number;
  trueShootingPct: number;
  usagePct: number;
  gameScore: number;
}

export interface GmBoxScore {
  id: string;
  gameId: string;
  season: number;
  day: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  players: GmBoxPlayerLine[];
}

export interface GmTradeAsset {
  type: "player" | "pick";
  id: string;
}

export interface GmTradeProposal {
  id: string;
  fromTeamId: string;
  toTeamId: string;
  fromAssets: GmTradeAsset[];
  toAssets: GmTradeAsset[];
  status: "pending" | "accepted" | "rejected";
}

export interface GmNewsItem {
  id: string;
  day: number;
  season: number;
  headline: string;
  body: string;
  tone: "info" | "good" | "bad" | "trade";
}

export interface GmSeasonPhase {
  phase:
    | "preseason"
    | "regular"
    | "play_in"
    | "playoffs"
    | "draft"
    | "free_agency"
    | "offseason";
}

export interface GmLeagueSettings {
  salaryCapM: number;
  luxuryTaxM: number;
  firstApronM: number;
  secondApronM: number;
  maxRoster: number;
  minRoster: number;
  seasonLength: number; // games per team ~82
}

export interface GmLeagueState {
  version: 1;
  season: number; // ending year e.g. 2026 for 2025-26
  day: number;
  phase: GmSeasonPhase["phase"];
  userTeamId: string;
  settings: GmLeagueSettings;
  teams: GmTeam[];
  players: GmPlayer[];
  freeAgents: string[]; // player ids
  draftPool: string[];
  schedule: GmScheduleGame[];
  standings: Record<string, GmStandingsRow>;
  boxScores: GmBoxScore[];
  news: GmNewsItem[];
  tradeLog: GmTradeProposal[];
  playoffBracket?: GmPlayoffSeries[];
  /** Full first-round pick order (lottery + reverse playoff). */
  lotteryOrder?: string[];
  /** Index into lotteryOrder for the current pick. */
  draftPickIndex?: number;
  /** Available directors of scouting to hire (user market). */
  scoutMarket?: import("@/gm/seed/scouts").GmScout[];
  createdAt: string;
  updatedAt: string;
}

export interface GmPlayoffSeries {
  id: string;
  round: number;
  conf: Conference | "Finals";
  teamAId: string;
  teamBId: string;
  winsA: number;
  winsB: number;
  done: boolean;
  winnerId?: string;
}

export const DEFAULT_SETTINGS: GmLeagueSettings = {
  salaryCapM: 140.588,
  luxuryTaxM: 170.814,
  firstApronM: 178.132,
  secondApronM: 188.931,
  maxRoster: 15,
  minRoster: 14,
  seasonLength: 82,
};

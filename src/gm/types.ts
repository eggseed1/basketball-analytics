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
  /** Locked in once the combine is run for this class. */
  combine?: {
    wingspanIn: number;
    verticalIn: number;
    sprint: number;
  };
}

export type GmSignVia =
  | "room"
  | "bird"
  | "early_bird"
  | "mle"
  | "taxpayer_mle"
  | "bae"
  | "minimum";

export interface GmContractYear {
  /** Ending year. 2027 is the 2026-27 season. */
  season: number;
  salaryM: number;
  option?: "player" | "team" | null;
  /** False when the published cell is not guaranteed. Missing means the cell did not say. */
  guaranteed?: boolean;
}

export interface GmContract {
  yearsRemaining: number;
  annualSalaryM: number;
  birdRights: "none" | "early" | "bird";
  option?: "player" | "team" | null;
  signedSeason: number;
  /** Which cap path was used when this deal was signed. */
  signedVia?: GmSignVia;
  /** Published seasons still on the deal. The cap uses the current year's salary. */
  years?: GmContractYear[];
  /** Published note from the contract book. */
  note?: string;
}

export interface GmDeadMoney {
  id: string;
  playerId: string;
  label: string;
  annualM: number;
  yearsLeft: number;
}

export interface GmInjury {
  type: string;
  gamesRemaining: number;
  reinjuryRisk: number;
}

/** Counting totals. Averages are totals divided by games played. */
export interface GmCountingLine {
  season: string;
  team: string;
  gp: number;
  gs?: number;
  min: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  /** Offensive and defensive rebound totals, when the season file has the split. */
  orb?: number;
  drb?: number;
  /** Percent points, 23.9 means 23.9% of available rebounds. */
  orbPct?: number;
  drbPct?: number;
  blkPct?: number;
  stlPct?: number;
  astPct?: number;
}

/** 25–99 skills. Overall is a position-weighted blend of these, not a separate stat. */
export interface GmAttributes {
  closeShot: number;
  drivingLayup: number;
  drivingDunk: number;
  standingDunk: number;
  postControl: number;
  midrange: number;
  threePoint: number;
  freeThrow: number;
  passAccuracy: number;
  ballHandle: number;
  speedWithBall: number;
  interiorDefense: number;
  perimeterDefense: number;
  steal: number;
  block: number;
  offReb: number;
  defReb: number;
  speed: number;
  agility: number;
  strength: number;
  vertical: number;
  stamina: number;
}

/** 0–100. How often the player chooses the action, separate from how well they do it. */
export interface GmTendencies {
  shootClose: number;
  shootMid: number;
  shootThree: number;
  drive: number;
  postUp: number;
  dish: number;
  flashyPass: number;
  steal: number;
  block: number;
  crashOffensive: number;
  foul: number;
}

export type GmDevPath = "boom" | "average" | "bust";

export interface GmPotential {
  floor: number;
  ceiling: number;
  boom: number;
  average: number;
  bust: number;
  /** Rolled once. Boom chases the ceiling, bust stays near the floor. */
  path: GmDevPath;
  peakStart: number;
  peakEnd: number;
}

export interface GmSheet {
  /** Bump when the attribute formula changes so old saves rebuild. */
  version?: number;
  overall: number;
  attributes: GmAttributes;
  tendencies: GmTendencies;
  potential: GmPotential;
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
  /** Overall, attributes, tendencies, and the potential path. */
  sheet?: GmSheet;
  scouted: ScoutedRatings;
  /** Pre-draft scouting dossier (grades, comps, notes). */
  scoutProfile?: ScoutProfile;
  contract: GmContract | null;
  injury: GmInjury | null;
  morale: number; // 0-100
  personality: number; // leadership -50..50
  minutesPreference: number;
  /** Pre-draft league grade. The room drafts off this. The true rating can disagree. */
  consensus?: number;
  draftPick?: number;
  /** Team that still holds Bird rights after the player hits the market. */
  rightsTeamId?: string | null;
  rightsKind?: "early" | "bird";
  /** Previous salary, used as the cap hold and the early-Bird ceiling. */
  lastSalaryM?: number;
  nbaPlayerId?: string;
  /** Real NBA season the player entered this save with. Totals, not averages. */
  nbaSeason?: GmCountingLine;
  /**
   * DRBL/100 from the season they entered with.
   * Unset when that season has no DRBL row. Never use 0 as a stand-in.
   */
  drbl100?: number | null;
  /** Published WAR1 (R1 points / P1) for that same entry season. */
  entryWar1?: number | null;
  /** Counting totals for the save's current season. Kept after old boxes are dropped. */
  seasonLine?: GmCountingLine;
  /** On-court possessions behind `seasonLine`, used for this season's WAR1. */
  seasonPossessions?: number;
  /** Counting line from the previous season in this save. The entry season is `nbaSeason`. */
  priorLine?: GmCountingLine;
  /** Ending year of the draft that put him in the league. */
  draftYear?: number;
  college?: string;
  draftLabel?: string;
  birthDate?: string;
  jersey?: string;
  darko?: number;
  raptor?: number;
}

export interface GmHeadCoach {
  id?: string;
  name: string;
  offenseBonus: number;
  defenseBonus: number;
  developmentBonus: number;
  /** Annual pay in millions. Missing on older saves. */
  salaryM?: number;
  yearsLeft?: number;
  /** False when the number is a market estimate, not a reported figure. */
  salaryReported?: boolean;
  yearsReported?: boolean;
  /** Deal is in its last year, so letting him go does not create a buyout. */
  walkYear?: boolean;
  offenseStyle?: GmOffense;
  defenseStyle?: GmDefense;
  tempo?: GmTempo;
  trait?: string;
  tradeoff?: string;
}

export interface GmStaffDead {
  name: string;
  annualM: number;
  yearsLeft: number;
}

export interface GmTrainerDeal {
  salaryM: number;
  yearsLeft: number;
  level: number;
}

export interface GmStaff {
  headCoach: GmHeadCoach;
  /** Former head coach on the bench. Adds a slice of his skills and a real salary. */
  associate?: GmHeadCoach | null;
  /** Money still owed to coaches who were let go. */
  dead?: GmStaffDead[];
  /** @deprecated Prefer `scout.eye`; kept for older saves. */
  scoutLevel: number;
  /** Hired director of scouting - drives draft fog & expertise. */
  scout?: import("@/gm/seed/scouts").GmScout | null;
  trainerLevel: number; // reduces injury severity
  trainer?: GmTrainerDeal;
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
  /** Guaranteed money still charged after a waive. */
  deadMoney?: GmDeadMoney[];
  /** Players the front office is shopping. */
  tradeBlock?: string[];
  /** Players who will not be included in a deal. */
  untouchables?: string[];
  /** Picks that originated here and now sit with another club. */
  owedPicks?: GmDraftPick[];
  /** Cash left to send in trades this season, in millions. */
  cashM?: number;
  /** User club only. Missing means the real rotation and a balanced scheme. */
  coaching?: GmCoaching;
}

export type GmOffense =
  | "balanced"
  | "pace_space"
  | "pick_roll"
  | "motion"
  | "post"
  | "iso";

export type GmDefense =
  | "balanced"
  | "drop"
  | "switch"
  | "no_middle"
  | "pressure"
  | "wall";

export type GmTempo = "slow" | "normal" | "fast";

export interface GmCoaching {
  offense: GmOffense;
  defense: GmDefense;
  tempo: GmTempo;
  /** First option, then second. */
  playThrough: [string | null, string | null];
  /** Planned minutes per player. Set when the user edits the rotation. */
  minutes?: Record<string, number>;
}

export interface GmDraftPick {
  id: string;
  season: number; // calendar year of draft
  round: 1 | 2;
  originalTeamId: string;
  ownerTeamId: string;
  protected?: boolean;
  /** Conveys only if the pick lands outside the top N. */
  protectionTopN?: number;
  /** The other club in a swap. */
  swapWithTeamId?: string;
  /** Published terms. A swap range or a conveyance stays here. */
  terms?: string;
  /** Cannot be traded while the club is over the second apron. */
  frozen?: boolean;
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
  /**
   * Emirates NBA Cup. Group games, quarterfinals and semifinals count as
   * regular-season games. The championship does not. Makeup games are the
   * two December games for teams that are out of the knockout.
   */
  cup?: "group" | "quarterfinal" | "semifinal" | "championship" | "makeup";
  /** Championship is at a neutral site, so nobody gets the home bump. */
  neutral?: boolean;
  /** All-Star games are exhibitions. They do not count in the standings. */
  exhibition?: "allstar";
  /** Share of a normal game. All-Star games are 12 minutes, so this is 0.25. */
  span?: number;
  /** Player ids for an All-Star side. Home list, then away list. */
  squad?: [string[], string[]];
  /** Play-in and playoff tips stay off the regular-season line. */
  postseason?: "play_in" | "playoffs";
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
  /** In the starting five for this tip. */
  started?: boolean;
}

/** Two-minute blocks the coach sent out. Twenty-four of them make the night. */
export interface GmShiftBlock {
  playerId: string;
  playerName: string;
  on: boolean[];
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
  /** Team possessions that night. On-court possessions scale minutes by this. */
  possessions?: number;
  players: GmBoxPlayerLine[];
  /** The user's shift plan for this tip. Absent on older boxes. */
  shiftPlan?: GmShiftBlock[];
  /** Play-in and playoff boxes stay off the regular-season line. */
  postseason?: "play_in" | "playoffs";
}

export interface GmTradeAsset {
  type: "player" | "pick" | "cash";
  id: string;
  /** Millions, only when type is cash. */
  cashM?: number;
}

export interface GmIncomingOffer {
  id: string;
  /** Team that called. */
  fromTeamId: string;
  /** The user's team. */
  toTeamId: string;
  /** What they send. */
  fromAssets: GmTradeAsset[];
  /** What they want. */
  toAssets: GmTradeAsset[];
  day: number;
  note: string;
}

export interface GmTradeProposal {
  id: string;
  fromTeamId: string;
  toTeamId: string;
  fromAssets: GmTradeAsset[];
  toAssets: GmTradeAsset[];
  status: "pending" | "accepted" | "rejected";
}

export interface GmDigestItem {
  headline: string;
  detail: string;
  tone: "info" | "good" | "bad";
  gameId?: string;
}

export interface GmAwardCandidate {
  id: string;
  name: string;
  teamId: string;
  detail: string;
}

export interface GmAwardRace {
  id:
    | "mvp"
    | "dpoy"
    | "roy"
    | "smoy"
    | "mip"
    | "coty"
    | "all-nba-1"
    | "all-nba-2"
    | "all-nba-3"
    | "all-def-1"
    | "all-def-2"
    | "all-rook-1"
    | "all-rook-2";
  title: string;
  candidates: GmAwardCandidate[];
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

export interface GmAutomation {
  /** CPU makes the user's draft picks. */
  autoDraft: boolean;
  /** Other teams sign as soon as free agency opens. */
  autoFreeAgency: boolean;
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
  /** Short recap of the last skip. Replaced each time you jump ahead. */
  digest?: GmDigestItem[];
  tradeLog: GmTradeProposal[];
  /** A live offer from another team. Sim pauses while this is set. */
  incomingOffer?: GmIncomingOffer;
  playoffBracket?: GmPlayoffSeries[];
  /** 7–10 play-in. Present only while that tournament is live. */
  playIn?: GmPlayInBoard;
  /** Full first-round pick order (lottery + reverse playoff). */
  lotteryOrder?: string[];
  /** Index into lotteryOrder for the current pick. */
  draftPickIndex?: number;
  /** User's order for this class. Missing means the scout board. */
  userDraftBoard?: string[];
  /** Combine measurables are on the dossiers for this class. */
  combineDone?: boolean;
  /** Set once the regular-season trade deadline day has passed. */
  tradeDeadlinePassed?: boolean;
  /** Depth charts rebuilt so each spot has its own starter and backup. */
  lineupRoles?: number;
  automation?: GmAutomation;
  /** Available directors of scouting to hire (user market). */
  scoutMarket?: import("@/gm/seed/scouts").GmScout[];
  /** Head coaches between jobs. */
  coachMarket?: GmHeadCoach[];
  /** Real coach contracts have been written onto this save. */
  staffBook?: number;
  /** Current-roster players have been put back on their teams. */
  rosterBook?: number;
  /** Published contracts and future picks have been written onto this save. */
  booksBook?: number;
  /** In-season development already applied for this year. */
  devMarks?: { season: number; january: boolean; finale: boolean };
  /** Wins from the season before this one. Cup tiebreaks use these after 2026-27. */
  priorWins?: Record<string, number>;
  /** Cup rooms. Absent on 2026-27, which uses the published groups. */
  cupGroups?: { East: string[][]; West: string[][] };
  /** All-Star sides, once the break roster is picked from this season. */
  allStar?: {
    stars: string[];
    stripes: string[];
    world: string[];
  };
  /** Regular-season awards, written when that season ends. */
  awards?: {
    season: number;
    races: GmAwardRace[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface GmPlayInConference {
  conf: Conference;
  sevenId: string;
  eightId: string;
  nineId: string;
  tenId: string;
  /** Winner of 7 vs 8. That team is the 7 seed. */
  sevenSeedId?: string;
  /** Loser of 7 vs 8. Hosts the last game. */
  sevenLoserId?: string;
  /** Winner of 9 vs 10. */
  nineWinnerId?: string;
  /** Winner of the last game. That team is the 8 seed. */
  eightSeedId?: string;
  results?: Array<{
    slot: "seven" | "nine" | "eight";
    homeId: string;
    awayId: string;
    homeScore: number;
    awayScore: number;
  }>;
}

export interface GmPlayInBoard {
  conferences: GmPlayInConference[];
}

export interface GmPlayoffGame {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
}

export interface GmPlayoffSeries {
  id: string;
  round: number;
  conf: Conference | "Finals";
  teamAId: string;
  teamBId: string;
  /** Regular-season seeds. Set on the first round. */
  seedA?: number;
  seedB?: number;
  winsA: number;
  winsB: number;
  done: boolean;
  winnerId?: string;
  /** Games in the order they were played. */
  games?: GmPlayoffGame[];
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

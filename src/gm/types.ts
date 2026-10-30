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
  /** Style whispers. Prefer ceiling/floor when set. */
  comps: string[];
  /** 2K-style upper-bound NBA comp (can be wrong if the scout is weak). */
  compCeiling?: string | null;
  /** 2K-style lower-bound NBA comp. */
  compFloor?: string | null;
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

/**
 * Madden-style development trait. Hidden on the draft board until the pick
 * is in. X-Factor and Superstar are rare and grow hard.
 */
export type GmDevTrait =
  | "xfactor"
  | "superstar"
  | "star"
  | "normal"
  | "bust";

export interface GmPotential {
  floor: number;
  ceiling: number;
  boom: number;
  average: number;
  bust: number;
  /** Rolled once. Boom chases the ceiling, bust stays near the floor. */
  path: GmDevPath;
  /** Madden-style trait. Drives growth rate. Hidden until drafted / rostered. */
  trait?: GmDevTrait;
  peakStart: number;
  peakEnd: number;
}

export interface GmSheet {
  /** Entry calibration retained through development and save migrations. */
  overallOffset?: number;
  /** Bump when the attribute formula changes so old saves rebuild. */
  version?: number;
  overall: number;
  attributes: GmAttributes;
  tendencies: GmTendencies;
  potential: GmPotential;
  /** Overall before the last progression tick. Used for roster arrows. */
  priorOverall?: number;
  /**
   * Simple-view category means before the last progression tick
   * (INS, MID, 3PT, INT D, PER D, PLAY, REB, ATHL, IQ).
   */
  priorSimple?: number[];
}

export interface GmSimProfile {
  offense?: number;
  version: 1;
  season?: string;
  confidence: number;
  source: "nba" | "estimated";
  baseline: Partial<GmAttributes>;
  impact: number;
  rates: { fga: number; threeShare: number; twoPct: number; threePct: number; ftPct: number; ftPerFga: number; ast: number; orb: number; drb: number; stl: number; blk: number; tov: number };
}

export interface GmFranchisePlan {
  intent: "contend" | "retool" | "develop";
  priorities: string[];
  targetWins: number;
  ownerPressure: boolean;
  commissioner: boolean;
  pauses: { offers: boolean; scouting: boolean; injuries: boolean };
}

export interface GmSeasonArchive {
  season: number;
  champion?: GmLeagueState["champion"];
  awards?: GmLeagueState["awards"];
  standings: GmLeagueState["standings"];
  trades: GmTradeProposal[];
  players: Array<{ id: string; name: string; teamId: string | null; age: number; overall: number; line?: GmCountingLine }>;
  userTeamId: string;
}

export interface GmPlayer {
  /** The real role at the selected season, used as a prior while he stays on that club. */
  realRole?: { season: number; teamId: string | null; starts: number; games: number; mpg: number };
  listedPosition?: GmPosition;
  simProfile?: GmSimProfile;
  developmentFocus?: "balanced" | "shooting" | "creation" | "defense" | "rebounding";
  rolePromise?: { teamId: string; minutes: number; madeDay: number; games?: number; totalMinutes?: number; lastGameId?: string; status: "pending" | "met" | "unmet" };
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
  /** Alternate listing for rotation bars. Inferred when blank. */
  secondaryPosition?: GmPosition | null;
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
  /** Team that still holds Bird / restricted / draft rights after the player hits the market. */
  rightsTeamId?: string | null;
  rightsKind?: "early" | "bird" | "restricted" | "exclusive_draft";
  /** Previous salary, used as the cap hold and the early-Bird ceiling. */
  lastSalaryM?: number;
  /** Qualifying-offer state for restricted free agency. */
  qoStatus?: GmQoStatus;
  qoAmountM?: number;
  /** Years of NBA service for RFA / max-salary bands (estimated when missing). */
  serviceYears?: number;
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
  /** Prospect / player pathway for scout knacks. */
  pipeline?: "ncaa" | "international" | "gleague";
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
  /** Player-development director — knack boosts growth for matching groups. */
  developer?: import("@/gm/seed/developers").GmDeveloper | null;
  trainerLevel: number; // reduces injury severity
  trainer?: GmTrainerDeal;
}

export interface GmTeam {
  injuryRotationBackup?: { starters: GmTeam["starters"]; benchOrder: string[]; coaching?: GmCoaching };
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

/** How many healthy bodies get minutes on a normal night. */
export type GmRotationDepth = 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface GmCoaching {
  /** Explicit block-by-block plan. Each block is two regulation minutes. */
  shifts?: Record<string, boolean[]>;
  closingLineup?: string[];
  /** Actual minutes at multiple positions, rather than one label for the entire night. */
  positionMinutes?: Record<string, Partial<Record<GmPosition, number>>>;
  offense: GmOffense;
  defense: GmDefense;
  tempo: GmTempo;
  /** First option, then second. */
  playThrough: [string | null, string | null];
  /**
   * Bodies in the minute book (6–13). Auto-balance deals 240 across this many
   * and zeros the rest. Default 8.
   */
  rotationDepth?: GmRotationDepth;
  /** Planned minutes per player. Set when the user edits the rotation. */
  minutes?: Record<string, number>;
  /**
   * Spot each player is staffing in the minute book.
   * Lets a SG covering SF count on the SF bar instead of flooding SG.
   */
  coverSlot?: Partial<Record<string, GmPosition>>;
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
  positionMinutes?: Partial<Record<GmPosition, number>>;
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
  /** The same events that produced this box. Older saves reconstruct their feed. */
  events?: import("@/data/types/play-by-play").PlayByPlayEvent[];
  stints?: Array<{ start: number; end: number; home: string[]; away: string[] }>;
  overtime?: number;
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

/** Calendar pause on a trade deadline, break, or free-agency open. */
export type GmTeamBuildingCheckpointKind =
  | "trade_deadline"
  | "all_star_break"
  | "season_end"
  | "free_agency";

export interface GmTeamBuildingCheckpoint {
  id: string;
  kind: GmTeamBuildingCheckpointKind;
  day: number;
  title: string;
  body: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}

/** Madden-style monthly prompt: put eyes on a few prospects. */
export interface GmScoutingFocusPrompt {
  id: string;
  /** YYYY-MM */
  monthKey: string;
  day: number;
  title: string;
  body: string;
  /** How many prospects can be focused (usually 3). */
  slots: number;
  /** Suggested ids from the draft pool. */
  suggestedPlayerIds: string[];
}

export interface GmScoutingFocus {
  monthKey: string;
  playerIds: string[];
  positionFocus: GmPosition | null;
}

/** Remembers rejected packages so the same call does not bounce back next day. */
export interface GmDeclinedOffer {
  /** Stable package key (caller + both asset lists). */
  key: string;
  fromTeamId: string;
  day: number;
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
  /** Internal ballot score used for ranking. */
  score?: number;
  /** Score relative to the race leader (1 = tied for first). */
  share?: number;
  /** Pseudo vote points (10-7-5-3-1) for majors. */
  votes?: number;
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
  /** Short race note (tight race, runaway, etc.). */
  note?: string;
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
  injuryFrequency?: number;
  developmentSpeed?: number;
  tradeDifficulty?: number;
  simPace?: number;
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
  /**
   * Hired scout assigns monthly focus without pausing.
   * Manual focus still digs deeper when you do it yourself.
   */
  autoScout?: boolean;
}

/**
 * Offseason desk stages. Options and qualifying offers run before the
 * moratorium; open/fill are the signing window. Lengths are game ticks.
 */
export type GmFaStage =
  | "options"
  | "qualifying_offers"
  | "rights"
  | "moratorium"
  | "open"
  | "fill";

export type GmFaOfferKind =
  | "interest"
  | "pending"
  | "counter"
  | "agreement"
  | "offer_sheet"
  | "awaiting_match"
  | "ready"
  | "signed"
  | "rejected"
  | "withdrawn"
  | "expired"
  | "invalidated";

export type GmFaOffer = {
  id: string;
  playerId: string;
  teamId: string;
  salaryM: number;
  years: number;
  day: number;
  kind: GmFaOfferKind;
  via?: GmSignVia;
  /** Player/team option on the final year, when the editor supports it. */
  option?: "player" | "team" | null;
  /** Agent/player response text from the last evaluation. */
  responseNote?: string;
  /** Utility breakdown snapshot for explanations (0–100 components). */
  utility?: GmFaUtilityBreakdown;
  /** Mutually exclusive alternative group; committing one invalidates siblings. */
  altGroup?: string;
  /** Revision number; identical reloads do not reseed decisions. */
  revision?: number;
};

export type GmFaUtilityBreakdown = {
  total: number;
  money: number;
  winning: number;
  role: number;
  continuity: number;
  fit: number;
  noise: number;
};

export type GmFaReservation = {
  id: string;
  teamId: string;
  playerId: string;
  salaryM: number;
  via: GmSignVia;
  offerId: string;
  kind: "agreement" | "offer_sheet" | "match_hold";
};

export type GmFaOfferSheet = {
  id: string;
  playerId: string;
  offeringTeamId: string;
  rightsTeamId: string;
  salaryM: number;
  years: number;
  via: GmSignVia;
  /** Absolute market day when the match window closes. */
  matchDeadlineDay: number;
  status: "pending_match" | "matched" | "declined" | "expired";
  offerId: string;
};

export type GmFaDecisionKind =
  | "team_option"
  | "player_option_result"
  | "qualifying_offer"
  | "rfa_match"
  | "ready_agreement"
  | "counter"
  | "lost_target";

export type GmFaDecision = {
  id: string;
  kind: GmFaDecisionKind;
  playerId: string;
  teamId?: string;
  headline: string;
  detail: string;
  deadlineDay?: number;
  read?: boolean;
  payload?: Record<string, string | number | boolean | null>;
};

export type GmFaMarketConfig = {
  moratoriumTicks: number;
  openTicks: number;
  fillTicks: number;
  /** Days the incumbent has to match an offer sheet after it posts. */
  rfaMatchTicks: number;
};

/** Free-agency desk: options → QO → rights → moratorium → open → fill. */
export type GmFaMarket = {
  stage: GmFaStage;
  /** Absolute tick since the summer desk opened. */
  day: number;
  agreements: GmFaOffer[];
  pending: GmFaOffer[];
  recap: string[];
  done?: boolean;
  config?: GmFaMarketConfig;
  watchlist?: string[];
  reservations?: GmFaReservation[];
  offerSheets?: GmFaOfferSheet[];
  decisions?: GmFaDecision[];
  /** Seed for preference noise; stable across reloads. */
  seed?: number;
  /** Last tick's recap lines (daily board). */
  dayRecap?: string[];
};

/** Employment vs rights vs negotiation — derived helpers use these labels. */
export type GmEmploymentStatus =
  | "contracted"
  | "unsigned"
  | "on_waivers"
  | "retired"
  | "unavailable";

export type GmRightsStatus =
  | "unrestricted"
  | "restricted"
  | "exclusive_draft"
  | "bird"
  | "early_bird"
  | "none";

export type GmNegotiationStatus =
  | "available"
  | "negotiating"
  | "awaiting_response"
  | "committed"
  | "offer_sheet_pending"
  | "signed"
  | "pending_option";

/** Qualifying-offer bookkeeping on a player entering the market. */
export type GmQoStatus =
  | "ineligible"
  | "eligible"
  | "tendered"
  | "accepted"
  | "declined"
  | "expired";

export interface GmLeagueState {
  tradeTalks?: Array<{ id: string; day: number; teamId: string; reason: string; youSend: GmTradeAsset[]; youReceive: GmTradeAsset[]; counter?: GmTradeAsset[] }>;
  franchise?: GmFranchisePlan;
  history?: GmSeasonArchive[];
  simulationBook?: number;
  version: 1;
  season: number; // ending year e.g. 2026 for 2025-26
  day: number;
  phase: GmSeasonPhase["phase"];
  userTeamId: string;
  settings: GmLeagueSettings;
  teams: GmTeam[];
  players: GmPlayer[];
  freeAgents: string[]; // player ids
  /** Live free-agency market. Set when the summer opens. */
  faMarket?: GmFaMarket;
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
  /** Packages the user already waved off this season. */
  declinedOffers?: GmDeclinedOffer[];
  /** Last day an incoming offer was answered (accept or decline). */
  lastOfferResolvedDay?: number;
  /**
   * Pause on a team-building date (deadline, break, FA open).
   * Sim stays stopped until the user continues or snoozes to manage the roster.
   */
  teamBuildingCheckpoint?: GmTeamBuildingCheckpoint;
  /** Checkpoint ids the user already continued past this season. */
  seenCheckpoints?: string[];
  /**
   * User chose to stay and manage after a checkpoint. Simming again re-opens
   * the same pause until they continue.
   */
  checkpointSnooze?: string;
  /** Monthly scouting focus prompt. Sim pauses until set or skipped. */
  scoutingFocusPrompt?: GmScoutingFocusPrompt;
  /** Active focus for the current calendar month. */
  scoutingFocus?: GmScoutingFocus;
  /** YYYY-MM keys already answered this season. */
  seenScoutingMonths?: string[];
  playoffBracket?: GmPlayoffSeries[];
  /** 7–10 play-in. Present only while that tournament is live. */
  playIn?: GmPlayInBoard;
  /** Full first-round pick order (lottery + reverse playoff). */
  lotteryOrder?: string[];
  /**
   * Flat pick schedule for this draft (usually 60). When set, each index is one
   * selection so draft-night trades can swap a single slot without moving both rounds.
   */
  draftOrder?: string[];
  /** Index into draftOrder (or lotteryOrder) for the current pick. */
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
  /** Available player-development directors to hire. */
  developerMarket?: import("@/gm/seed/developers").GmDeveloper[];
  /** Head coaches between jobs. */
  coachMarket?: GmHeadCoach[];
  /** Real coach contracts have been written onto this save. */
  staffBook?: number;
  /** Current-roster players have been put back on their teams. */
  rosterBook?: number;
  /** ESPN G/F/C shells split into PG/SG/SF/PF/C with sibling secondaries. */
  positionBook?: number;
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
  /**
   * Home page progression through postseason and summer.
   * Awards and the champion splash wait for an explicit Next.
   */
  homeFlow?: {
    awardsSeen?: boolean;
    championSeen?: boolean;
  };
  /** Written when the Finals end, before the draft desk opens. */
  champion?: {
    season: number;
    teamId: string;
    finalsMvpId: string;
    wins: number;
    losses: number;
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


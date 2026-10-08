import type { Streams } from "./rng";

export const SCHEMA_VERSION = 3;
export const ENGINE_VERSION = "1.2.0";

export type Mode = "random" | "daily";
export type DrawMode = "weighted" | "equal";
export type Pacing = "short" | "standard" | "extended";
export type PauseReason = "user" | "decision" | "hidden" | "ended" | null;
export type Speed = 1 | 2 | 4 | 8 | 16;
export type Workload = "low" | "balanced" | "high";
export type Stage = "infancy" | "childhood" | "youth" | "emerging" | "adult";

export type SkillKey =
  | "finishing"
  | "shooting"
  | "freeThrows"
  | "handle"
  | "passing"
  | "offBall"
  | "perimeterD"
  | "interiorD"
  | "rebounding"
  | "iq"
  | "decisions";

export type TraitKey = "coachability" | "confidence" | "composure" | "discipline" | "motivation";

export type AthleticKey = "strength" | "acceleration" | "lateral" | "vertical" | "stamina" | "coordination" | "durability";

export type FocusId =
  | "free-play"
  | "fundamentals"
  | "shooting"
  | "playmaking"
  | "finishing"
  | "defense"
  | "rebounding-post"
  | "strength"
  | "athleticism"
  | "film-iq"
  | "school"
  | "showcase";

export type NodeKind =
  | "home"
  | "playground"
  | "school-team"
  | "local-club"
  | "elite-youth"
  | "us-high-school"
  | "university"
  | "local-senior"
  | "domestic-pro"
  | "foreign-pro"
  | "g-league"
  | "nba"
  | "unattached";

export type Role = "none" | "deep-bench" | "bench" | "rotation" | "starter" | "star";

export interface Family {
  means: 1 | 2 | 3 | 4 | 5;
  support: "low" | "medium" | "high";
  courtAccess: "poor" | "fair" | "good" | "excellent";
  motherHeightCm: number;
  fatherHeightCm: number;
  savings: number;
  monthlyBudget: number;
  siblings: number;
}

export interface Body {
  heightCm: number;
  weightKg: number;
  wingspanCm: number;
  reachCm: number;
  frame: 1 | 2 | 3 | 4 | 5;
  verticalCm: number;
  vertical: number;
  strength: number;
  acceleration: number;
  lateral: number;
  stamina: number;
  coordination: number;
  durability: number;
  measuredAtMonths: number | null;
}

/** Hidden growth plan; only estimates derived from it reach the UI. */
export interface Growth {
  adultHeightCm: number;
  pubertyOffsetMonths: number;
  wingspanRatio: number;
  athleticCeiling: Record<AthleticKey, number>;
  frameMassFactor: number;
}

export interface Condition {
  health: number;
  energy: number;
  injury: { id: string; label: string; monthsLeft: number; severity: 1 | 2 | 3; causeEntryId: string | null } | null;
  injuryHistory: number;
}

export interface Placement {
  node: NodeKind;
  countryId: string;
  leagueId: string | null;
  teamName: string | null;
  role: Role;
  coaching: number;
  since: number;
  contract: { salary: number; yearsLeft: number; guaranteed: boolean; twoWay?: boolean } | null;
  costPerYear: number;
}

export interface SeasonLine {
  key: string;
  ageYears: number;
  calendarYear: number;
  node: NodeKind;
  leagueId: string | null;
  levelLabel: string;
  teamName: string | null;
  countryId: string;
  role: Role;
  gp: number;
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
  wins: number;
  losses: number;
  strength: number;
  awards?: string[];
}

export interface BoxScore {
  month: number;
  opponent: string;
  seasonKey?: string;
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
  teamScore: number;
  oppScore: number;
}

export interface Offer {
  id: string;
  kind: "join" | "scholarship" | "contract" | "camp" | "draft-entry" | "move";
  node: NodeKind;
  countryId: string;
  leagueId: string | null;
  teamName: string;
  role: Role;
  minutesBand: string;
  coaching: number;
  difficulty: number;
  exposure: number;
  costPerYear: number;
  salary: number;
  years: number;
  guaranteed: boolean;
  twoWay?: boolean;
  consequences: string[];
  reason: string;
}

export interface DecisionChoice {
  id: string;
  label: string;
  preview: string;
  disabled?: string;
}

export interface PendingDecision {
  id: string;
  templateId: string;
  title: string;
  body: string;
  choices: DecisionChoice[];
  rolls: number[];
  createdAt: number;
  offers?: Offer[];
  context?: Record<string, string | number | boolean | null>;
  required: boolean;
}

export interface HistoryEntry {
  id: string;
  month: number;
  kind: "birth" | "event" | "decision" | "season" | "move" | "injury" | "milestone" | "draft" | "offer" | "info";
  text: string;
  causeId?: string | null;
  tone?: "good" | "bad" | "neutral";
}

export interface ScoutEvidence {
  month: number;
  text: string;
  weight: number;
}

export interface Peer {
  id: string;
  name: string;
  countryId: string;
  heightCm: number;
  rating: number;
  potential: number;
  status: string;
  levelLabel: string;
  node: NodeKind;
  drafted: { year: number; pick: number } | null;
  debutMonth: number | null;
  done: boolean;
  log: { month: number; text: string }[];
}

export interface Achievements {
  nbaCaliber: number | null;
  campInvite: number | null;
  drafted: { month: number; round: 1 | 2; pick: number } | null;
  rosterSpot: number | null;
  nbaDebut: number | null;
}

export interface Identity {
  givenName: string;
  familyName: string;
  displayName: string;
  namePool: string;
  birthMonthOfYear: number;
  birthYear: number;
  hand: "right" | "left";
  look: { skin: number; hair: number; hairColor: number; eyes: number };
}

export interface Place {
  countryId: string;
  locality: string;
  localityKind: "capital" | "city" | "town" | "rural";
}

export interface DraftState {
  declaredYear: number | null;
  classSeed: number | null;
  result: { year: number; pick: number | null; team: string | null } | null;
  withdrewYears: number[];
}

export interface Education {
  level: "none" | "primary" | "secondary" | "university" | "done";
  academics: number;
  ncaaEligible: boolean;
  amateur: boolean;
  graduatedHighSchool: boolean;
  universityYears: number;
}

export type Lifestyle = "frugal" | "standard" | "lavish";
export type AdvisorStyle = "index" | "balanced" | "aggressive";

export interface Agent {
  name: string;
  firm: string;
  fee: number;
  reach: "global" | "regional" | "local";
  since: number;
}

export type Asset = "savings" | "bonds" | "index" | "stocks" | "property" | "crypto";

export interface Finance {
  cash: number;
  holdings: Record<Asset, number>;
  /** Target mix in percent; sums to 100. */
  target: Record<Asset, number>;
  autoInvest: boolean;
  advisor: AdvisorStyle | null;
  agent: Agent | null;
  lifestyle: Lifestyle;
  endorsements: { brand: string; perYear: number; yearsLeft: number }[];
  sendHomeShare: number;
  ytd: { year: number; gross: number; tax: number; fees: number; spend: number; returns: number };
  years: { year: number; gross: number; tax: number; fees: number; spend: number; returns: number; netWorth: number }[];
  market: { ytd: Record<Asset, number>; recent: number[]; years: { year: number; r: Record<Asset, number> }[] };
}

export type Track = "coach" | "scout" | "media" | "trainer";

export interface AfterYear {
  year: number;
  age: number;
  title: string;
  employer: string;
  wins: number | null;
  losses: number | null;
  note: string;
}

export interface AfterCareer {
  track: Track;
  step: number;
  title: string;
  employer: string;
  countryId: string;
  salary: number;
  since: number;
  rep: number;
  years: AfterYear[];
}

export type IntlKind = "olympics" | "world-cup" | "continental" | "u16" | "u17" | "u18" | "u19";

export interface IntlResult {
  id: string;
  name: string;
  kind: IntlKind;
  year: number;
  age: number;
  countryId: string;
  finish: string;
  medal: "gold" | "silver" | "bronze" | null;
  role: Role;
  gp: number;
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
  wins: number;
  losses: number;
}

export interface International {
  countryId: string | null;
  caps: number;
  tournaments: IntlResult[];
  declined: number;
}

export interface LifeState {
  schemaVersion: number;
  engineVersion: string;
  worldSnapshotVersion: string;
  runId: string;
  seed: number;
  mode: Mode;
  draw: DrawMode;
  pacing: Pacing;
  dailyDate: string | null;
  ageMonths: number;
  clock: { paused: boolean; pauseReason: PauseReason; speed: Speed; autoDecisions: boolean };
  identity: Identity;
  birthplace: Place;
  residence: Place;
  citizenships: string[];
  family: Family;
  education: Education;
  body: Body;
  growth: Growth;
  skills: Record<SkillKey, number>;
  potentials: Record<SkillKey, number>;
  traits: Record<TraitKey, number>;
  condition: Condition;
  plan: { primary: FocusId; secondary: FocusId | null; workload: Workload };
  placement: Placement;
  season: SeasonLine | null;
  seasons: SeasonLine[];
  lastGame: BoxScore | null;
  bestGame: (BoxScore & { label: string }) | null;
  gameLog: BoxScore[];
  finance: Finance;
  international: International;
  exposure: number;
  evidence: ScoutEvidence[];
  offers: Offer[];
  pendingDecision: PendingDecision | null;
  history: HistoryEntry[];
  cooldowns: Record<string, number>;
  flags: Record<string, number | boolean | string>;
  scheduled: { templateId: string; month: number; causeId: string | null }[];
  earnings: number;
  nbaGames: number;
  peers: Peer[];
  achievements: Achievements;
  draft: DraftState;
  rng: Streams;
  counters: { entry: number; decision: number; offer: number };
  ended: null | { month: number; reason: "retired" | "aged-out" | "chapter" };
  keepPlaying: boolean;
  after: AfterCareer | null;
}

export interface NewLifeOptions {
  seed: number;
  mode: Mode;
  draw: DrawMode;
  pacing: Pacing;
  dailyDate?: string | null;
  runId?: string;
}

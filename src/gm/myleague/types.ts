/**
 * Deep MyLeague - Layer B contracts.
 *
 * Original types for Franchise Lab / basketball-analytics.
 * Conceptually aligned with Basketball GM lifecycle; does not import ZenGM.
 *
 * Analytics providers are advisory only - they must never mutate sim state.
 */

/** Calendar year of the season end (e.g. 2016 for 2015-16). */
export type SeasonYear = number;

export type MyLeaguePhase =
  | "SEASON_REVIEW"
  | "FRONT_OFFICE_REVIEW"
  | "ROSTER_DECISIONS"
  | "STAFF_REVIEW"
  | "DRAFT_LOTTERY"
  | "DRAFT_COMBINE"
  | "DRAFT"
  | "POST_DRAFT"
  | "FREE_AGENCY"
  | "TRAINING_CAMP"
  | "PRESEASON"
  | "REGULAR_SEASON"
  | "TRADE_DEADLINE"
  | "PLAYOFFS"
  | "FINALS"
  | "SEASON_END";

export type MyLeagueMode = "historical_replay" | "alternate_history";

export type StartEraPreset =
  | "1947"
  | "1950s"
  | "1960s"
  | "1970s"
  | "1980s"
  | "1990s"
  | "2000s"
  | "2010s"
  | "2020s"
  | "latest"
  | "custom";

export type DataProvenance = {
  source: string;
  sourceVersion: string;
  retrievedAt: string; // ISO
  season: SeasonYear;
  dataQuality: "authoritative" | "estimated" | "synthetic" | "mixed";
};

/** Inclusive knowledge gate - UI/analytics must not leak future facts. */
export type KnowledgeDate = {
  season: SeasonYear;
  phase: MyLeaguePhase;
  day?: number;
};

export type InformationCutoff = {
  /** Fact may be shown only if knowledgeDate >= availableFrom */
  availableFrom: KnowledgeDate;
  /** Optional hard end (e.g. rumor expires) */
  availableUntil?: KnowledgeDate;
};

// ---------------------------------------------------------------------------
// Analytics (pluggable; optional)
// ---------------------------------------------------------------------------

export type AnalyticsContext = {
  season: SeasonYear;
  phase: MyLeaguePhase;
  knowledgeDate: KnowledgeDate;
  teamId?: string;
  opponentId?: string;
  playerId?: string;
  rosterPlayerIds?: string[];
  lineupPlayerIds?: string[];
  contractId?: string;
  draftContext?: {
    pick: number;
    round: number;
    prospectIds: string[];
  };
  transactionContext?: {
    kind: "trade" | "signing" | "waiver" | "extension";
    assetIds: string[];
  };
  leagueEnvironment: {
    salaryCapM: number;
    luxuryTaxM?: number;
    pace?: number;
    threePointRate?: number;
  };
  historicalContext?: {
    snapshotId: string;
    branchPoint?: KnowledgeDate;
  };
  simulationStateRef: string; // SimulationUniverse.id
};

export type AnalyticsEvaluation = {
  value: number;
  confidence: number; // 0-1
  percentile?: number;
  projections?: Record<string, number>;
  risks?: string[];
  strengths?: string[];
  weaknesses?: string[];
  comparablePlayerIds?: string[];
  recommendedActions?: string[];
  explanation?: string;
  modelId: string;
  modelVersion: string;
};

export interface AnalyticsProvider {
  readonly id: string;
  readonly version: string;
  evaluatePlayer(ctx: AnalyticsContext): Promise<AnalyticsEvaluation | null>;
  evaluateTeam(ctx: AnalyticsContext): Promise<AnalyticsEvaluation | null>;
  evaluateLineup(ctx: AnalyticsContext): Promise<AnalyticsEvaluation | null>;
  evaluateContract(ctx: AnalyticsContext): Promise<AnalyticsEvaluation | null>;
  evaluateTrade(ctx: AnalyticsContext): Promise<AnalyticsEvaluation | null>;
  evaluateDraftProspect(
    ctx: AnalyticsContext
  ): Promise<AnalyticsEvaluation | null>;
  evaluateFreeAgent(ctx: AnalyticsContext): Promise<AnalyticsEvaluation | null>;
  evaluateShotProfile?(
    ctx: AnalyticsContext
  ): Promise<AnalyticsEvaluation | null>;
  evaluateMatchup?(ctx: AnalyticsContext): Promise<AnalyticsEvaluation | null>;
  evaluateDevelopment?(
    ctx: AnalyticsContext
  ): Promise<AnalyticsEvaluation | null>;
  evaluateRosterConstruction?(
    ctx: AnalyticsContext
  ): Promise<AnalyticsEvaluation | null>;
  evaluateDecision?(
    ctx: AnalyticsContext
  ): Promise<AnalyticsEvaluation | null>;
}

// ---------------------------------------------------------------------------
// Real data provider
// ---------------------------------------------------------------------------

export type SeasonData = {
  season: SeasonYear;
  label: string; // "2015-16"
  provenance: DataProvenance;
};

export type TeamData = {
  id: string;
  abbrev: string;
  city: string;
  name: string;
  conference?: string;
  division?: string;
  provenance: DataProvenance;
};

export type PlayerData = {
  id: string;
  name: string;
  birthDate?: string;
  heightIn?: number;
  weightLbs?: number;
  position?: string;
  draftYear?: number;
  draftPick?: number;
  college?: string;
  provenance: DataProvenance;
};

export type RosterData = {
  season: SeasonYear;
  teamId: string;
  playerIds: string[];
  provenance: DataProvenance;
};

export type ContractData = {
  id: string;
  playerId: string;
  teamId: string;
  startSeason: SeasonYear;
  endSeason: SeasonYear;
  salaries: number[];
  provenance: DataProvenance;
};

export type DraftProspectData = {
  id: string;
  name: string;
  draftYear: number;
  provenance: DataProvenance;
};

export type DraftResultData = {
  draftYear: number;
  picks: Array<{ round: number; pick: number; teamId: string; playerId: string }>;
  provenance: DataProvenance;
};

export type TransactionData = {
  id: string;
  season: SeasonYear;
  type: string;
  description: string;
  provenance: DataProvenance;
};

export type SalaryCapData = {
  season: SeasonYear;
  salaryCapM: number;
  luxuryTaxM?: number;
  firstApronM?: number;
  secondApronM?: number;
  provenance: DataProvenance;
};

export type LeagueRulesData = {
  season: SeasonYear;
  rules: CBARules;
  provenance: DataProvenance;
};

export type AwardData = {
  season: SeasonYear;
  awards: Array<{ type: string; playerId?: string; teamId?: string }>;
  provenance: DataProvenance;
};

export type SeasonStatsData = {
  season: SeasonYear;
  // opaque bag - adapters normalize into canonical analytics types
  players: unknown[];
  teams: unknown[];
  provenance: DataProvenance;
};

export interface RealNBADataProvider {
  getSeason(season: SeasonYear): Promise<SeasonData>;
  getTeams(season: SeasonYear): Promise<TeamData[]>;
  getPlayers(season: SeasonYear): Promise<PlayerData[]>;
  getRosters(season: SeasonYear): Promise<RosterData[]>;
  getContracts(season: SeasonYear): Promise<ContractData[]>;
  getDraftClass(draftYear: number): Promise<DraftProspectData[]>;
  getDraft(draftYear: number): Promise<DraftResultData>;
  getTransactions(season: SeasonYear): Promise<TransactionData[]>;
  getSalaryCap(season: SeasonYear): Promise<SalaryCapData>;
  getLeagueRules(season: SeasonYear): Promise<LeagueRulesData>;
  getAwards(season: SeasonYear): Promise<AwardData>;
  getStats(season: SeasonYear): Promise<SeasonStatsData>;
}

// ---------------------------------------------------------------------------
// Historical snapshots (immutable)
// ---------------------------------------------------------------------------

export type HistoricalSeasonSnapshot = {
  id: string;
  season: SeasonYear;
  teams: TeamData[];
  players: PlayerData[];
  rosters: RosterData[];
  contracts: ContractData[];
  salaryCap: SalaryCapData;
  luxuryTax?: SalaryCapData;
  draft?: DraftResultData;
  draftClass?: DraftProspectData[];
  transactions: TransactionData[];
  awards?: AwardData;
  leagueRules: LeagueRulesData;
  playoffs?: unknown;
  standings?: unknown;
  statistics?: SeasonStatsData;
  provenance: DataProvenance;
  /** Snapshots must never be mutated after creation. */
  readonly immutable: true;
};

export type HistoricalUniverse = {
  id: string;
  label: "reality";
  /** season → snapshot id */
  seasons: Record<SeasonYear, string>;
  snapshots: Record<string, HistoricalSeasonSnapshot>;
  realDataHorizon: SeasonYear;
};

export type SimulationUniverse = {
  id: string;
  label: "simulation";
  parentHistoricalUniverseId: string;
  parentSnapshotId: string;
  branchPoint: KnowledgeDate;
  mode: MyLeagueMode;
  /** Live playable league ref (Franchise Lab GmLeagueState id / blob key) */
  leagueStateRef: string;
  currentSeason: SeasonYear;
  phase: MyLeaguePhase;
  day: number;
  timelineEventIds: string[];
  decisionLogIds: string[];
  staffByTeamId: Record<string, StaffMember[]>;
  evolution: LeagueEvolutionState;
  pendingDecisions: PendingDecision[];
};

// ---------------------------------------------------------------------------
// Timeline / decisions
// ---------------------------------------------------------------------------

export type TimelineEvent = {
  eventId: string;
  season: SeasonYear;
  date?: string;
  type: string;
  universe: "reality" | "simulation";
  realWorldEquivalent?: string; // eventId in reality
  description: string;
  participants: string[];
  phase?: MyLeaguePhase;
};

export type DecisionLog = {
  id: string;
  timestamp: string;
  season: SeasonYear;
  phase: MyLeaguePhase;
  userId: string;
  action: string;
  beforeStateRef: string;
  afterStateRef: string;
  analyticsRecommendation?: AnalyticsEvaluation | null;
  alternativeOptions?: string[];
  knowledgeDate: KnowledgeDate;
};

export type PendingDecision = {
  id: string;
  phase: MyLeaguePhase;
  kind: string;
  teamId: string;
  required: boolean;
  expiresAt?: KnowledgeDate;
};

// ---------------------------------------------------------------------------
// Staff / CBA / evolution
// ---------------------------------------------------------------------------

export type StaffRole =
  | "owner"
  | "president_basketball_ops"
  | "general_manager"
  | "assistant_gm"
  | "director_player_personnel"
  | "director_analytics"
  | "scouting_director"
  | "head_coach"
  | "lead_assistant"
  | "offensive_coordinator"
  | "defensive_coordinator"
  | "player_development_coach"
  | "shooting_coach"
  | "skills_coach"
  | "head_athletic_trainer"
  | "medical_director"
  | "performance_director";

export type StaffRatings = {
  scouting: number;
  playerDevelopment: number;
  analytics: number;
  contractNegotiation: number;
  tradeNegotiation: number;
  drafting: number;
  coaching: number;
  tacticalFlexibility: number;
  medical: number;
  injuryPrevention: number;
};

export type StaffMember = {
  id: string;
  teamId: string;
  name: string;
  role: StaffRole;
  ratings: StaffRatings;
  traits: string[];
  hiredSeason: SeasonYear;
};

export type CBARules = {
  season: SeasonYear;
  salaryCapM: number;
  luxuryTaxM: number;
  firstApronM?: number;
  secondApronM?: number;
  minSalaryM: number;
  maxSalaryM: number;
  rookieScale?: boolean;
  birdRights: boolean;
  restrictedFreeAgency: boolean;
  signAndTrade: boolean;
  tradeMatching: "soft" | "hard" | "none" | "era_specific";
  maxContractYears: number;
  maxRoster: number;
  minRoster: number;
  twoWayContracts: boolean;
  draftRounds: number;
  lotteryModel:
    | "none"
    | "coin_flip"
    | "weighted_pre2019"
    | "weighted_2019plus"
    | "custom";
  notes?: string;
};

export type FranchiseStrategy =
  | "win_now"
  | "rebuild"
  | "tank"
  | "asset_accumulation"
  | "balanced"
  | "draft_and_develop"
  | "star_hunting"
  | "cost_efficient"
  | "defense_first"
  | "pace_and_space"
  | "veteran_heavy"
  | "youth_heavy";

export type LeagueEvolutionState = {
  season: SeasonYear;
  expansionEligible: boolean;
  pendingExpansion?: {
    cities: string[];
    feeM: number;
  };
  pendingRelocation?: {
    teamId: string;
    proposedCity: string;
  };
  paceTrend: number;
  threePointRateTrend: number;
  futureCbaEpoch?: string;
  generatedPlayerSeed: number;
};

export type DeepContract = {
  id: string;
  playerId: string;
  teamId: string;
  startSeason: SeasonYear;
  endSeason: SeasonYear;
  salaries: number[];
  options?: Array<"player" | "team" | "early_termination">;
  incentives?: Array<{ type: string; amountM: number }>;
  guaranteeStatus: "full" | "partial" | "none";
  tradeRestrictions?: string[];
  bonuses?: Array<{ type: string; amountM: number }>;
  birdRights: "none" | "early" | "bird";
  extensionEligible: boolean;
};

// ---------------------------------------------------------------------------
// MyLeague save root
// ---------------------------------------------------------------------------

export type MyLeagueSettings = {
  mode: MyLeagueMode;
  startEra: StartEraPreset;
  startSeason: SeasonYear;
  difficulty: "easy" | "realistic" | "hard" | "analytics_only";
  scoutingFog: "easy" | "realistic" | "hard" | "analytics_only";
  historicalAccuracy: number; // 0-1
  automation: {
    autoLineup: boolean;
    autoScout: boolean;
    autoMinContracts: boolean;
    autoGLeague: boolean;
    autoStaff: boolean;
    autoTradeAiAssist: boolean;
  };
  analyticsProviderId: string | null;
  realDataProviderId: string;
};

export type GmCareerResume = {
  seasonsManaged: number;
  wins: number;
  losses: number;
  championships: number;
  finals: number;
  playoffAppearances: number;
  draftValueScore?: number;
  tradeValueScore?: number;
  contractValueScore?: number;
  developmentScore?: number;
};

export type MyLeague = {
  version: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  userTeamId: string;
  settings: MyLeagueSettings;
  historicalUniverseId: string;
  simulationUniverseId: string;
  career: GmCareerResume;
  /** Do not embed full historical blobs - reference snapshot IDs only. */
  notes?: string;
};

// ---------------------------------------------------------------------------
// Null analytics (sim must work without a model)
// ---------------------------------------------------------------------------

export const NullAnalyticsProvider: AnalyticsProvider = {
  id: "null",
  version: "0",
  async evaluatePlayer() {
    return null;
  },
  async evaluateTeam() {
    return null;
  },
  async evaluateLineup() {
    return null;
  },
  async evaluateContract() {
    return null;
  },
  async evaluateTrade() {
    return null;
  },
  async evaluateDraftProspect() {
    return null;
  },
  async evaluateFreeAgent() {
    return null;
  },
};

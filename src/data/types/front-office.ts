/**
 * Team front-office (payroll / contracts / draft assets) contracts.
 * Partner UI consumes presentation shapes — never raw provider CSV rows.
 */

export const FRONT_OFFICE_METHODOLOGY_VERSION = "p18c2-1.0";

export type CapabilityStatus = "SUPPORTED" | "PARTIAL" | "UNAVAILABLE";

export type CapThresholdStatus = "OFFICIAL" | "PROJECTED" | "UNKNOWN";

export type GuaranteeStatus =
  | "FULLY_GUARANTEED"
  | "PARTIALLY_GUARANTEED"
  | "NON_GUARANTEED"
  | "UNKNOWN";

export type OptionType =
  | "NONE"
  | "PLAYER_OPTION"
  | "TEAM_OPTION"
  | "EARLY_TERMINATION_OPTION"
  | "QUALIFYING_OFFER"
  | "OTHER"
  | "UNKNOWN";

export type SnapshotStatus = "VALIDATED" | "STALE" | "UNKNOWN";

export type DraftAssetType =
  | "OWN_PICK"
  | "ACQUIRED_PICK"
  | "OUTGOING_PICK"
  | "CONDITIONAL_PICK"
  | "SWAP_RIGHT"
  | "FORFEITED"
  | "OTHER"
  | "UNKNOWN";

export type DraftOwnershipStatus =
  | "CURRENTLY_OWNED"
  | "OWED_OUT"
  | "CONDITIONAL"
  | "ENCUMBERED"
  | "SWAP_AFFECTED"
  | "CONVEYED"
  | "UNKNOWN";

export type ProtectionKind =
  | "UNPROTECTED"
  | "TOP_N_PROTECTED"
  | "LOTTERY_PROTECTED"
  | "TEXT_VERIFIED_COMPLEX"
  | "UNKNOWN";

export type LeagueCapSeason = {
  season: string;
  seasonStartYear: number;
  salaryCap: number;
  luxuryTax: number;
  firstApron: number | null;
  secondApron: number | null;
  minimumTeamSalary: number | null;
  status: CapThresholdStatus;
  source: string;
  sourceDate: string;
  sourceUrl: string | null;
};

export type PlayerContractYear = {
  contractId: string;
  playerId: string;
  franchiseId: string;
  season: string;
  /** Integer USD dollars when known; null never means $0. */
  salary: number | null;
  capHit: number | null;
  guaranteedAmount: number | null;
  guaranteeStatus: GuaranteeStatus;
  optionType: OptionType;
  source: string;
};

export type PlayerContract = {
  contractId: string;
  playerId: string;
  franchiseId: string;
  signedDate: string | null;
  startSeason: string;
  endSeason: string;
  totalValue: number | null;
  guaranteedValue: number | null;
  contractType: "STANDARD" | "TWO_WAY" | "OTHER" | "UNKNOWN";
  source: string;
  lastVerified: string;
};

export type DraftAsset = {
  assetId: string;
  draftYear: number;
  round: 1 | 2 | null;
  originalFranchiseId: string | null;
  currentHolderFranchiseId: string | null;
  assetType: DraftAssetType;
  ownershipStatus: DraftOwnershipStatus;
  protection: ProtectionKind;
  protectionText: string | null;
  swap: boolean;
  conveyance: string | null;
  sourceTransactionId: string | null;
  source: string;
  lastVerified: string;
};

export type FrontOfficeCapabilities = {
  PAYROLL: CapabilityStatus;
  CONTRACTS: CapabilityStatus;
  CAP_THRESHOLDS: CapabilityStatus;
  FULL_CAP_ACCOUNTING: CapabilityStatus;
  FIRST_ROUND_ASSETS: CapabilityStatus;
  SECOND_ROUND_ASSETS: CapabilityStatus;
  SWAPS: CapabilityStatus;
  PROTECTIONS: CapabilityStatus;
  TRANSACTION_PROVENANCE: CapabilityStatus;
  CAP_HOLDS: CapabilityStatus;
  DEAD_MONEY: CapabilityStatus;
};

export type FrontOfficeSnapshotMeta = {
  methodologyVersion: string;
  snapshotDate: string;
  retrievedAt: string;
  sourceSet: string[];
  sourceHash: string;
  status: SnapshotStatus;
  season: string;
  seasonStartYear: number;
};

export type TeamContractRow = {
  playerId: string;
  playerName: string;
  age: number | null;
  contractId: string;
  contractType: PlayerContract["contractType"];
  years: PlayerContractYear[];
  guaranteedTotal: number | null;
  href: string;
};

export type FutureCommitmentBar = {
  season: string;
  totalSalaryDollars: number;
  playersUnderContract: number;
};

export type TeamPayrollArtifact = {
  franchiseId: string;
  abbr: string;
  displayName: string;
  season: string;
  contractRows: TeamContractRow[];
  futureCommitments: FutureCommitmentBar[];
  playerSalaryCommitments: number;
  playersWithSalary: number;
  playersWithoutSalary: number;
};

export type TeamDraftAssetsArtifact = {
  franchiseId: string;
  abbr: string;
  displayName: string;
  assets: DraftAsset[];
  swaps: DraftAsset[];
  unavailableReason: string | null;
};

export type TeamFrontOfficeArtifact = {
  franchiseId: string;
  abbr: string;
  displayName: string;
  payroll: TeamPayrollArtifact;
  draftAssets: TeamDraftAssetsArtifact;
  capabilities: FrontOfficeCapabilities;
};

export type FrontOfficeLeagueSnapshot = {
  meta: FrontOfficeSnapshotMeta;
  cap: LeagueCapSeason;
  capabilities: FrontOfficeCapabilities;
  teams: TeamFrontOfficeArtifact[];
  audit: {
    contractPlayerIdentityUnresolved: number;
    mixedSalaryUnits: number;
    salaryNullAsZero: number;
    teamsWithPayroll: number;
    teamsWithContracts: number;
    playersWithSalary: number;
    unmatchedSalaryNames: number;
    draftAssetsStructured: number;
  };
};

/** Presentation contracts for partner design (frozen semantics). */
export type TeamPayrollPresentation = {
  team: { franchiseId: string; abbr: string; displayName: string };
  season: string;
  updatedAt: string;
  snapshotStatus: SnapshotStatus;
  capContext: LeagueCapSeason;
  summary: {
    playerSalaryCommitments: number | null;
    playersWithSalary: number;
    playersWithoutSalary: number;
    label: "Player Salary Commitments";
  };
  contractRows: TeamContractRow[];
  futureCommitments: FutureCommitmentBar[];
  capabilities: FrontOfficeCapabilities;
  disclosures: string[];
};

export type TeamDraftAssetsPresentation = {
  franchise: { franchiseId: string; abbr: string; displayName: string };
  updatedAt: string;
  snapshotStatus: SnapshotStatus;
  summary: {
    futureFirstsControlled: number | null;
    futureSecondsControlled: number | null;
    unavailableReason: string | null;
  };
  assetsByYear: Record<string, DraftAsset[]>;
  swaps: DraftAsset[];
  outgoing: DraftAsset[];
  capabilities: FrontOfficeCapabilities;
  disclosures: string[];
};

export type TeamFrontOfficeSummary = {
  franchiseId: string;
  season: string;
  updatedAt: string;
  playerSalaryCommitments: number | null;
  futureFirstsControlled: number | null;
  futureSecondsControlled: number | null;
  payrollHref: string;
  draftAssetsHref: string;
  capabilities: FrontOfficeCapabilities;
  disclosures: string[];
};

/**
 * Movement Center domain types.
 * See docs/architecture/movement-center.md
 *
 * Distinct from `src/offseason` TransactionEvent (what happened) and
 * from `src/data/types/transaction-event` (ESPN archive rows).
 */

/** Visible evidence class — not outcome probability. */
export type MovementEvidenceClass = "reported" | "rumored" | "speculative";

/** Factual / lifecycle state of a claim or cluster. */
export type MovementClaimState =
  | "official"
  | "completed"
  /** The reported move didn't happen: the player went elsewhere or the window closed. */
  | "fell_through"
  | "denied"
  | "retracted"
  | "expired"
  | "unresolved";

export type MovementClaimType =
  | "trade_interest"
  | "trade_request"
  | "free_agent_interest"
  | "extension_talks"
  | "contract_movement"
  | "availability"
  | "front_office_change"
  | "other";

export type MovementProvenanceKind =
  | "original_report"
  | "cites_report"
  | "aggregation"
  | "commentary"
  | "hypothetical_analysis"
  | "community_speculation"
  | "official_statement"
  | "completed_transaction";

export type MovementResolutionOutcome =
  | "materialized"
  | "partially_materialized"
  | "did_not_materialize"
  | "contradicted"
  | "retracted"
  | "expired"
  | "still_unresolved"
  | "unable_to_determine";

export type MovementResolutionWindow =
  | "trade_deadline"
  | "offseason_free_agency"
  | "extension"
  | "trade_request"
  | "front_office";

/** One normalized claim extracted from a permitted source document. */
export type MovementClaim = {
  id: string;
  clusterId: string;
  summary: string;
  claimType: MovementClaimType;
  evidenceClass: MovementEvidenceClass;
  state: MovementClaimState;
  provenanceKind: MovementProvenanceKind;
  publishedAt: string;
  sourceId: string;
  sourceLabel: string;
  reporterLabel?: string;
  sourceUrl?: string;
  playerIds: string[];
  teamIds: string[];
  citesClaimId?: string;
  isOriginal: boolean;
  /** Scoring helper — explicit negotiation language in claim */
  negotiationSpecificity?: "contact" | "framework" | "active_talks" | "offer";
};

export type MovementDealAsset = {
  label: string;
  playerId?: string;
  /** Picks, cash, rights or considerations rather than a player. */
  nonPlayer?: true;
  /** Sending team, when the ledger names it. */
  fromTeamId?: string;
};

/** What one team took back in a completed trade, as written in the ledger. */
export type MovementDealSide = {
  teamId: string;
  teamName?: string;
  receives: MovementDealAsset[];
};

/**
 * An item one team's ledger entry says it sent, which the receiving team's own
 * entry in the same deal does not list.
 */
export type MovementDealUnconfirmed = {
  label: string;
  playerId?: string;
  nonPlayer?: true;
  claimedByTeamId: string;
  toTeamId: string;
};

export type MovementDeal = {
  date: string;
  sides: MovementDealSide[];
  unconfirmed?: MovementDealUnconfirmed[];
};

/** Story cluster — duplicate / derivative reports collapse here. */
export type MovementStoryCluster = {
  id: string;
  headline: string;
  primaryClaimId: string;
  claimIds: string[];
  evidenceClass: MovementEvidenceClass;
  state: MovementClaimState;
  firstSeenAt: string;
  lastMeaningfulAt: string;
  linkedPlayerIds: string[];
  linkedTeamIds: string[];
  /** Both sides of a completed trade, parsed from the transaction ledger. */
  deal?: MovementDeal;
  /** Why a story fell through, e.g. "Traded to the Celtics. Reports had named the Lakers." */
  resolutionNote?: string;
};

/** Explainable evidence strength 0–100 (not P(movement)). */
export type MovementEvidenceScore = {
  total: number;
  components: {
    sourceCredibility: number;
    reportDirectness: number;
    independentCorroboration: number;
    recency: number;
    entitySpecificity: number;
    negotiationSpecificity: number;
    hypotheticalPenalty: number;
    repetitionPenalty: number;
    denialCounterevidence: number;
  };
  methodologyVersion: string;
  computedAt: string;
};

export type PlayerMovementMonitor = {
  playerId: string;
  activityLevel: "low" | "moderate" | "high";
  linkedTeamIds: string[];
  direction: "rising" | "stable" | "falling";
  lastMeaningfulReportAt: string | null;
  evidenceScore: MovementEvidenceScore | null;
  topClusterIds: string[];
};

export type MovementResolution = {
  clusterId: string;
  playerIds: string[];
  outcome: MovementResolutionOutcome;
  resolvedAt: string;
  transactionRef?: string;
  note?: string;
  /** When true, player is removed from unresolved trade-speculation sentiment lanes. */
  suppressTradeSpeculation?: boolean;
};

export type MovementCuratedSnapshot = {
  meta: {
    methodologyVersion: string;
    status: string;
    season: string;
    snapshotDate: string;
    disclaimer: string;
    builtAt?: string;
    rosterPlayerCount?: number;
    headlinesScanned?: number;
    latestHeadlineAt?: string | null;
    latestTransactionDate?: string | null;
    tradeWindowStart?: string;
    feeds?: string[];
  };
  sources: Record<string, { label: string; credibility: number }>;
  clusters: MovementStoryCluster[];
  claims: MovementClaim[];
  resolutions?: MovementResolution[];
};

export type PlayerMovementBundle = {
  monitor: PlayerMovementMonitor;
  clusters: MovementStoryCluster[];
  claimsByCluster: Record<string, MovementClaim[]>;
  scoresByCluster: Record<string, MovementEvidenceScore>;
  season: string;
  disclaimer: string;
};

export type MovementFeedItem = {
  cluster: MovementStoryCluster;
  claims: MovementClaim[];
  score: MovementEvidenceScore;
};

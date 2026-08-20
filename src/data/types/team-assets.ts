/**
 * Team asset ledger + cap-fit primitives.
 *
 * Production only exposes categories backed by verified structured data.
 * ESPN free-text transactions never invent players, picks, TPEs, or rights.
 *
 * Eventual destination (not built here):
 * Transaction → Asset/Cap → Trade Builder → Legality → Analyzer → Genealogy
 */

import { TRANSACTION_LINEAGE_METHODOLOGY_VERSION } from "@/data/types/transaction-lineage";

export const TEAM_ASSETS_METHODOLOGY_VERSION = "1.0";

/** Asset categories the ledger can eventually hold. */
export type TeamAssetCategoryId =
  | "players"
  | "draft_capital"
  | "trade_exceptions"
  | "draft_rights"
  | "other";

/**
 * Explicit progression for future trade tooling.
 * Do not collapse these into “tradable.”
 */
export type CapFitTier =
  | "salary_fit"
  | "potentially_eligible"
  | "legality_requires_validation";

export const CAP_FIT_TIER_LABELS: Record<CapFitTier, string> = {
  salary_fit: "Salary fit",
  potentially_eligible: "Potentially eligible",
  legality_requires_validation: "Legality requires full trade validation",
};

export type TeamAssetCategoryAvailability =
  | "available"
  | "unavailable"
  | "unsupported"
  | "timeout"
  | "provider_error"
  | "blocked_pending_structured_source";

export type TeamAssetCategoryCoverage = {
  id: TeamAssetCategoryId;
  label: string;
  availability: TeamAssetCategoryAvailability;
  count: number;
  note: string | null;
};

/** Verified roster player - requires canonical playerId. */
export type TeamPlayerAsset = {
  kind: "player";
  playerId: string;
  playerName: string;
  teamId: string;
  season: string;
  position?: string;
  /** Optional board stats for display - never invented. */
  pointsPerGame?: number;
  minutesPerGame?: number;
  href: string;
};

export type TeamDraftPickAsset = {
  kind: "draft_pick";
  id: string;
  label: string;
  draftYear: number;
  round?: 1 | 2;
  originalTeamId?: string;
  currentOwnerTeamId: string;
  protected?: boolean;
  protectionNotes?: string;
  swap?: boolean;
  status?: "owned" | "traded" | "conveyed" | "expired" | "used";
};

export type TeamTradeExceptionAsset = {
  kind: "trade_exception";
  id: string;
  teamId: string;
  /** Remaining amount in dollars when the source provides it. */
  remainingAmount?: number;
  originalAmount?: number;
  createdAt?: string;
  expiresAt?: string;
  status?: "active" | "partially_used" | "expired";
  originatingTransactionId?: string;
  source: string;
};

export type TeamDraftRightsAsset = {
  kind: "draft_rights";
  id: string;
  playerId?: string;
  playerName: string;
  teamId: string;
  draftYear?: number;
  status?: "active" | "signed" | "renounced" | "expired" | "draft_and_stash";
  href?: string;
};

export type TeamAssetEntry =
  | TeamPlayerAsset
  | TeamDraftPickAsset
  | TeamTradeExceptionAsset
  | TeamDraftRightsAsset;

export type TeamAssetLedger = {
  teamId: string;
  /** Season used for roster/player board snapshot when present. */
  asOfSeason: string | null;
  asOfDate: string | null;
  methodologyVersion: string;
  lineageMethodologyVersion: string;
  /** Structured trade/pick ledger still empty in production. */
  structuredLedgerAvailable: boolean;
  genealogyUiReady: boolean;
  /**
   * Player-board capability for this snapshot.
   * Distinguishes unsupported historical eras from empty/failed modern boards.
   */
  playerBoardStatus?:
    | "ok"
    | "unsupported"
    | "timeout"
    | "error"
    | "unavailable";
  /** User-facing honest state when the player board is not usable. */
  warning?: string;
  categories: TeamAssetCategoryCoverage[];
  players: TeamPlayerAsset[];
  draftCapital: TeamDraftPickAsset[];
  tradeExceptions: TeamTradeExceptionAsset[];
  draftRights: TeamDraftRightsAsset[];
  notes: string[];
};

/**
 * Future TPE “what can fit?” result shape - empty until salary + TPE sources exist.
 * Tiers stay separate by design.
 */
export type TradeExceptionFitResult = {
  exceptionId: string;
  teamId: string;
  remainingAmount: number | null;
  salaryFit: TeamPlayerAsset[];
  potentiallyEligible: TeamPlayerAsset[];
  /** Always empty until validateTrade exists - never imply legality. */
  legalityValidated: TeamPlayerAsset[];
  disclaimer: string;
  available: boolean;
  unavailableReason: string | null;
};

export const TRADE_EXCEPTION_FIT_DISCLAIMER =
  "Salary fit only. Full trade legality requires additional roster, timing, and CBA rules - DRBL does not treat fit as permission to trade.";

export const EMPTY_TRADE_EXCEPTION_FIT = (
  exceptionId: string,
  teamId: string,
  reason: string
): TradeExceptionFitResult => ({
  exceptionId,
  teamId,
  remainingAmount: null,
  salaryFit: [],
  potentiallyEligible: [],
  legalityValidated: [],
  disclaimer: TRADE_EXCEPTION_FIT_DISCLAIMER,
  available: false,
  unavailableReason: reason,
});

/**
 * Real-world offseason / transaction intelligence.
 * REAL vs REPORTED vs MODEL vs SIMULATION must never be blurred.
 *
 * Lineage / asset genealogy types and empty-safe queries live under
 * `src/data/types/transaction-lineage.ts` and
 * `src/data/queries/transaction-lineage.ts`.
 * See docs/transaction-lineage.md - genealogy UI is blocked until ingest exists.
 * Real Offseason Tracker (event archive): `/offseason` · docs/offseason-tracker.md
 */

export type TransactionStatus =
  | "real"
  | "reported"
  | "model"
  | "simulation";

export type TransactionType =
  | "signing"
  | "trade"
  | "waive"
  | "draft"
  | "extension"
  | "option"
  | "release"
  | "other";

export type TransactionParty = {
  teamId?: string;
  teamAbbr?: string;
  playerId?: string;
  playerName?: string;
  pickDescription?: string;
};

export type ContractTerms = {
  years?: number;
  totalM?: number;
  averageM?: number;
  notes?: string;
};

/**
 * Canonical offseason / movement event.
 * Historical REAL rows should be treated as immutable once ingested.
 * Prefer CanonicalTransaction (transaction-lineage) when asset lists are known.
 */
export type TransactionEvent = {
  id: string;
  date: string;
  season: string;
  type: TransactionType;
  status: TransactionStatus;
  parties: TransactionParty[];
  contract?: ContractTerms;
  source?: string;
  sourceUrl?: string;
  /** Short analytical note - only when grounded in measurable context. */
  whyItMatters?: string;
};

export function statusLabel(status: TransactionStatus): string {
  switch (status) {
    case "real":
      return "Official";
    case "reported":
      return "Reported";
    case "model":
      return "Model";
    case "simulation":
      return "Simulation";
  }
}

const SOURCE_TEXT_CATEGORY_LABELS: Record<TransactionType, string> = {
  signing: "Signing (source text)",
  trade: "Trade-related (source text)",
  waive: "Waiver (source text)",
  draft: "Draft-related (source text)",
  extension: "Extension (source text)",
  option: "Option (source text)",
  release: "Release (source text)",
  other: "Other (source text)",
};

/**
 * Display label for ESPN free-text category (server + client safe).
 * These labels classify source wording - they do not mean DRBL has a
 * complete structured transaction package.
 */
export function sourceTextCategoryLabel(cat: TransactionType): string {
  return SOURCE_TEXT_CATEGORY_LABELS[cat] ?? cat;
}

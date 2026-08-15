/**
 * NBA transaction EVENT model — factual ESPN free-text archive rows.
 *
 * Distinct from structured CanonicalTransaction asset/ownership genealogy.
 * Events answer "what was recorded?" not "which assets moved?"
 */

import type { TransactionType } from "@/offseason";
import type {
  RelatedTransactionEventCluster,
  TransactionEventRecordStatus,
} from "@/data/providers/transactions/transaction-event-clusters";

export const TRANSACTION_EVENT_ARCHIVE_VERSION = "1.1";

/**
 * One provenance-backed free-text transaction event.
 * No player assets / pick ownership — those require a structured ledger.
 */
export type NbaTransactionEvent = {
  id: string;
  date: string;
  /** Canonical NBA season derived from the event date (YYYY-YY). */
  season: string;
  teamId: string;
  teamAbbr?: string;
  /** Raw ESPN description — never rewritten into fake structure. */
  description: string;
  /**
   * Keyword classification of the description.
   * This is SOURCE-TEXT CLASSIFICATION, not an official ESPN type enum.
   * `trade` means the source text looked trade-related — not that DRBL
   * knows the complete trade package.
   */
  sourceTextCategory: TransactionType;
  source: string;
  sourceUrl?: string;
  datasetVersion?: string;
  ingestedAt?: string;
  espnCalendarYear?: number;
  /**
   * Record maturity. ESPN archive rows are always `source_event` at rest;
   * clusters are a separate projection, never promoted here.
   */
  recordStatus?: TransactionEventRecordStatus;
  /** When this event belongs to a precomputed related-event cluster. */
  relatedClusterId?: string;
};

export type { RelatedTransactionEventCluster, TransactionEventRecordStatus };

export type OffseasonWindow = {
  /** Summer calendar year label, e.g. 2026 for "2026 NBA Offseason". */
  labelYear: number;
  startDate: string;
  endDate: string;
  /** Upcoming / associated NBA season start year (e.g. 2026 → 2026-27). */
  upcomingSeason: string;
};

export type TransactionEventFilters = {
  /** Offseason summer year (e.g. 2026). Mutually contextual with date range. */
  offseasonYear?: number;
  /** Canonical season YYYY-YY — filters by derived season field. */
  season?: string;
  teamId?: string;
  /** Inclusive YYYY-MM-DD */
  dateFrom?: string;
  /** Inclusive YYYY-MM-DD */
  dateTo?: string;
  /** Case-insensitive substring of description (and team abbr). */
  q?: string;
  /** Source-text category filter. */
  category?: TransactionType;
};

export type TransactionEventPage = {
  events: NbaTransactionEvent[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type TeamOffseasonActivity = {
  teamId: string;
  teamAbbr?: string;
  eventCount: number;
  /** Counts by source-text category — not official trade counts. */
  bySourceTextCategory: Partial<Record<TransactionType, number>>;
  activeDays: number;
};

export type OffseasonPulse = {
  offseasonYear: number;
  window: OffseasonWindow;
  eventCount: number;
  teamCount: number;
  eventsThisWeek: number;
  teamsThisWeek: number;
  mostActiveTeam: TeamOffseasonActivity | null;
  latestEvent: NbaTransactionEvent | null;
  archiveEarliestDate: string | null;
  archiveLatestDate: string | null;
  archiveEventCount: number;
};

export type TransactionEventCoverage = {
  source: string;
  datasetVersion: string | null;
  earliestDate: string | null;
  latestDate: string | null;
  /** Raw ESPN source events in the archive. */
  eventCount: number;
  sourceEventCount: number;
  relatedClusterCount: number;
  /** Always 0 for the ESPN free-text archive. */
  structuredTransactionCount: 0;
  /** Always 0 until a structured ledger is ingested. */
  ownershipEdgeCount: 0;
  structuredAssetsAvailable: false;
  genealogyUiReady: false;
  notes: string[];
};

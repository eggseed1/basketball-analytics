/**
 * Transform ESPN free-text transaction rows → CanonicalTransaction.
 *
 * Honest limits (do not “fix” in the transformer):
 * - No player assets (API has no athlete ids)
 * - No draft-pick assets / ownership edges
 * - Multi-team deals stay as separate team-centric blurbs
 * - Type is a documented keyword guess from description text
 */

import { createHash } from "node:crypto";
import { canonicalSeasonFromStartYear } from "@/data/providers/historical/season-range";
import {
  ESPN_TRANSACTIONS_DATASET_VERSION,
  ESPN_TRANSACTIONS_SOURCE,
} from "@/data/providers/transactions/espn-transactions-client";
import type { EspnTransactionRow } from "@/data/providers/transactions/espn-transactions-types";
import {
  TRANSACTION_LINEAGE_METHODOLOGY_VERSION,
  type CanonicalTransaction,
  type TransactionType,
} from "@/data/types/transaction-lineage";

export type EspnTransactionNormalizeResult = {
  transaction: CanonicalTransaction | null;
  issues: string[];
};

/** NBA season from calendar date: July-June flip (month >= 7 → that start year). */
export function canonicalSeasonFromIsoDate(isoDate: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  const startYear = month >= 7 ? year : year - 1;
  return canonicalSeasonFromStartYear(startYear);
}

/**
 * Controlled-vocabulary type from free text. Preserve raw description always.
 * Order is intentional: multi-action blurbs that mention a trade classify as trade.
 */
export function classifyEspnTransactionDescription(
  description: string
): TransactionType {
  const d = description.toLowerCase();
  if (
    /\btraded\b/.test(d) ||
    /\bin (a |an )?\w*-?team trade\b/.test(d) ||
    /\bin exchange for\b/.test(d) ||
    (/\bacquired\b/.test(d) && /\b(from|for)\b/.test(d) && /\bpick|rights|consideration|cash\b/.test(d))
  ) {
    return "trade";
  }
  if (/\bdraft(ed|)\b/.test(d) && !/\bdraft consideration/.test(d)) {
    return "draft";
  }
  if (/\bwaived\b/.test(d)) return "waive";
  if (/\breleased\b/.test(d)) return "release";
  if (/\bextension\b|\bextended\b/.test(d)) return "extension";
  if (/\b(picked up|declined|exercised).{0,40}\boption\b/.test(d)) {
    return "option";
  }
  if (/\b(re-?signed|signed)\b/.test(d)) return "signing";
  return "other";
}

export function espnTransactionStableId(
  dateIso: string,
  teamId: string,
  description: string
): string {
  const hash = createHash("sha1")
    .update(`${dateIso}|${teamId}|${description}`)
    .digest("hex")
    .slice(0, 16);
  return `espn-tx-${hash}`;
}

export function normalizeEspnTransactionRow(
  row: EspnTransactionRow,
  options: {
    espnCalendarYear: number;
    ingestedAt: string;
    sourceUrl?: string;
  }
): EspnTransactionNormalizeResult {
  const issues: string[] = [];
  const description = (row.description ?? "").trim();
  const dateRaw = (row.date ?? "").trim();
  const dateIso = dateRaw.slice(0, 10);
  const teamId =
    row.team?.id != null ? String(row.team.id).trim() : "";
  const teamAbbr = row.team?.abbreviation?.trim();

  if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    issues.push("missing_or_malformed_date");
  }
  if (!teamId) {
    issues.push("missing_team");
  }
  if (!description) {
    issues.push("missing_description");
  }

  if (issues.length) {
    return { transaction: null, issues };
  }

  const season = canonicalSeasonFromIsoDate(dateIso);
  if (!season) {
    issues.push("unresolvable_season");
    return { transaction: null, issues };
  }

  const type = classifyEspnTransactionDescription(description);
  const id = espnTransactionStableId(dateIso, teamId, description);

  const transaction: CanonicalTransaction = {
    id,
    date: dateIso,
    season,
    type,
    status: "real",
    parties: [
      {
        teamId,
        teamAbbr: teamAbbr || undefined,
      },
    ],
    teamIds: [teamId],
    assets: [],
    source: ESPN_TRANSACTIONS_SOURCE,
    sourceUrl:
      options.sourceUrl ??
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/transactions?season=${options.espnCalendarYear}`,
    sourceVersion: ESPN_TRANSACTIONS_DATASET_VERSION,
    methodologyVersion: TRANSACTION_LINEAGE_METHODOLOGY_VERSION,
    description,
    provenance: {
      source: ESPN_TRANSACTIONS_SOURCE,
      sourceRecordId: id,
      datasetVersion: ESPN_TRANSACTIONS_DATASET_VERSION,
      ingestedAt: options.ingestedAt,
      espnCalendarYear: options.espnCalendarYear,
      rawTypeGuess: type,
    },
  };

  return { transaction, issues };
}

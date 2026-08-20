/**
 * Fetch ESPN NBA transaction blurbs (calendar-year pages).
 * Does not invent structure beyond what the API returns.
 */

import { espnFetchJson } from "@/data/providers/nba/espn-client";
import type {
  EspnTransactionRow,
  EspnTransactionsResponse,
  EspnTransactionsYearDump,
} from "@/data/providers/transactions/espn-transactions-types";

export const ESPN_TRANSACTIONS_SOURCE = "espn-site-v2-transactions";
export const ESPN_TRANSACTIONS_DATASET_VERSION = "1.0";
export const ESPN_TRANSACTIONS_EARLIEST_YEAR = 2000;

const BASE =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/transactions";

/** Drop logo payloads - they dominate disk and are unused for lineage. */
export function sanitizeEspnTransactionRow(
  row: EspnTransactionRow
): EspnTransactionRow {
  const team = row.team;
  return {
    date: row.date,
    description: row.description,
    team: team
      ? {
          id: team.id,
          abbreviation: team.abbreviation,
          displayName: team.displayName,
          location: team.location,
          name: team.name,
        }
      : undefined,
  };
}

export function espnTransactionsLatestCalendarYear(now = new Date()): number {
  return now.getUTCFullYear();
}

export async function fetchEspnTransactionsPage(
  calendarYear: number,
  page: number,
  limit = 100
): Promise<EspnTransactionsResponse> {
  const url = `${BASE}?season=${calendarYear}&limit=${limit}&page=${page}`;
  return espnFetchJson<EspnTransactionsResponse>(url, {
    ttlMs: 0,
    retries: 3,
  });
}

/**
 * Pull every page for one ESPN calendar-year bucket.
 * ESPN's `season` query param for this endpoint is a calendar year (Jan-Dec),
 * not an NBA season label.
 */
export async function fetchEspnTransactionsCalendarYear(
  calendarYear: number,
  options: { delayMs?: number } = {}
): Promise<EspnTransactionsYearDump> {
  const delayMs = options.delayMs ?? 150;
  const first = await fetchEspnTransactionsPage(calendarYear, 1);
  const pageCount = Math.max(1, first.pageCount ?? 1);
  const rows: EspnTransactionRow[] = [
    ...(first.transactions ?? []).map(sanitizeEspnTransactionRow),
  ];

  for (let page = 2; page <= pageCount; page++) {
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
    const next = await fetchEspnTransactionsPage(calendarYear, page);
    rows.push(...(next.transactions ?? []).map(sanitizeEspnTransactionRow));
  }

  return {
    source: ESPN_TRANSACTIONS_SOURCE,
    datasetVersion: ESPN_TRANSACTIONS_DATASET_VERSION,
    espnCalendarYear: calendarYear,
    fetchedAt: new Date().toISOString(),
    apiCount: first.count ?? rows.length,
    rows,
  };
}

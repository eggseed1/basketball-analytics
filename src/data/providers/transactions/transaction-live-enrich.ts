import {
  espnTransactionsLatestCalendarYear,
  fetchEspnTransactionsPage,
  sanitizeEspnTransactionRow,
  LIVE_TRANSACTIONS_TIMEOUT_MS,
  LIVE_TRANSACTIONS_TTL_MS,
} from "@/data/providers/transactions/espn-transactions-client";
import { normalizeEspnTransactionRow } from "@/data/transformers/espn-transactions";
import type { CanonicalTransaction } from "@/data/types/transaction-lineage";

/** First N pages per calendar year — page 1 is newest. */
const LIVE_PAGES_PER_YEAR = 4;

function calendarYearsToRefresh(now = new Date()): number[] {
  const year = espnTransactionsLatestCalendarYear(now);
  // January still surfaces December blurbs under the previous calendar year.
  if (now.getUTCMonth() === 0) return [year, year - 1];
  return [year];
}

async function fetchRecentCanonicalForYear(
  calendarYear: number,
  ingestedAt: string
): Promise<CanonicalTransaction[]> {
  const out: CanonicalTransaction[] = [];
  const fetchOpts = {
    ttlMs: LIVE_TRANSACTIONS_TTL_MS,
    timeoutMs: LIVE_TRANSACTIONS_TIMEOUT_MS,
  } as const;

  let first;
  try {
    first = await fetchEspnTransactionsPage(
      calendarYear,
      1,
      100,
      fetchOpts
    );
  } catch {
    return [];
  }

  const pageCount = Math.max(1, first.pageCount ?? 1);
  const pagesToFetch = Math.min(LIVE_PAGES_PER_YEAR, pageCount);
  const pageBodies = [first];

  if (pagesToFetch > 1) {
    const rest = await Promise.all(
      Array.from({ length: pagesToFetch - 1 }, (_, i) =>
        fetchEspnTransactionsPage(calendarYear, i + 2, 100, fetchOpts).catch(
          () => null
        )
      )
    );
    for (const page of rest) {
      if (page) pageBodies.push(page);
    }
  }

  for (const response of pageBodies) {
    const rows = (response.transactions ?? []).map(sanitizeEspnTransactionRow);
    for (const row of rows) {
      const { transaction } = normalizeEspnTransactionRow(row, {
        espnCalendarYear: calendarYear,
        ingestedAt,
      });
      if (transaction) out.push(transaction);
    }
  }
  return out;
}

/**
 * Pull the newest ESPN transaction blurbs and return canonical rows.
 * Safe on Workers — network only, no filesystem.
 */
export async function fetchLiveEspnTransactionRows(
  now = new Date()
): Promise<CanonicalTransaction[]> {
  const ingestedAt = now.toISOString();
  const years = calendarYearsToRefresh(now);
  const batches = await Promise.all(
    years.map((year) => fetchRecentCanonicalForYear(year, ingestedAt))
  );
  const byId = new Map<string, CanonicalTransaction>();
  for (const batch of batches) {
    for (const tx of batch) byId.set(tx.id, tx);
  }
  return [...byId.values()];
}

/** Overlay live rows onto an archive list (live wins on id collision). */
export function mergeLiveTransactions(
  base: CanonicalTransaction[],
  live: CanonicalTransaction[]
): CanonicalTransaction[] {
  if (!live.length) return base;
  const byId = new Map(base.map((tx) => [tx.id, tx]));
  for (const tx of live) byId.set(tx.id, tx);
  return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
}

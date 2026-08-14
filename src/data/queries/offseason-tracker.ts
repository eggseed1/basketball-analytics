/**
 * Offseason Tracker queries — transaction EVENT archive (not genealogy).
 */

import {
  aggregateTeamActivity,
  buildOffseasonPulse,
  buildTransactionEventCoverage,
  buildTransactionEventIndex,
  clearTransactionEventIndexCache,
  filterTransactionEvents,
  groupEventsByDate,
  groupEventsByMonth,
  listOffseasonYearsWithEvents,
  paginateEvents,
} from "@/data/providers/transactions/transaction-event-index";
import {
  currentOffseasonLabelYear,
  currentOffseasonWindow,
  offseasonWindowForYear,
} from "@/data/providers/transactions/offseason-window";
import type {
  NbaTransactionEvent,
  OffseasonPulse,
  TeamOffseasonActivity,
  TransactionEventCoverage,
  TransactionEventFilters,
  TransactionEventPage,
} from "@/data/types/transaction-event";

export type {
  NbaTransactionEvent,
  OffseasonPulse,
  TeamOffseasonActivity,
  TransactionEventCoverage,
  TransactionEventFilters,
  TransactionEventPage,
};

export {
  clearTransactionEventIndexCache,
  currentOffseasonLabelYear,
  currentOffseasonWindow,
  offseasonWindowForYear,
};

export async function getTransactionEventCoverage(options?: {
  force?: boolean;
}): Promise<TransactionEventCoverage> {
  const index = await buildTransactionEventIndex({
    force: options?.force ?? true,
  });
  return buildTransactionEventCoverage(index);
}

export async function getOffseasonPulse(options?: {
  offseasonYear?: number;
  now?: Date;
  force?: boolean;
}): Promise<OffseasonPulse> {
  const index = await buildTransactionEventIndex({
    force: options?.force,
  });
  return buildOffseasonPulse(index, {
    offseasonYear: options?.offseasonYear,
    now: options?.now,
  });
}

export async function listTransactionEvents(
  filters: TransactionEventFilters = {},
  options: { page?: number; pageSize?: number; force?: boolean } = {}
): Promise<TransactionEventPage> {
  const index = await buildTransactionEventIndex({ force: options.force });
  const filtered = filterTransactionEvents(index, filters);
  return paginateEvents(filtered, options.page ?? 1, options.pageSize ?? 40);
}

export async function getTransactionEvent(
  id: string,
  options?: { force?: boolean }
): Promise<NbaTransactionEvent | null> {
  const index = await buildTransactionEventIndex({ force: options?.force });
  return index.byId.get(id) ?? null;
}

export async function getTeamOffseasonActivity(
  filters: TransactionEventFilters = {},
  options?: { force?: boolean; limit?: number }
): Promise<TeamOffseasonActivity[]> {
  const index = await buildTransactionEventIndex({ force: options?.force });
  const filtered = filterTransactionEvents(index, filters);
  const all = aggregateTeamActivity(filtered);
  const limit = options?.limit;
  return limit != null ? all.slice(0, limit) : all;
}

export async function getOffseasonTimeline(
  filters: TransactionEventFilters,
  options?: { force?: boolean; page?: number; pageSize?: number }
): Promise<{
  page: TransactionEventPage;
  byDate: Array<{ date: string; events: NbaTransactionEvent[] }>;
  byMonth: Array<{ monthKey: string; events: NbaTransactionEvent[] }>;
}> {
  const page = await listTransactionEvents(filters, options);
  return {
    page,
    byDate: groupEventsByDate(page.events),
    byMonth: groupEventsByMonth(page.events),
  };
}

export async function listAvailableOffseasonYears(options?: {
  force?: boolean;
}): Promise<number[]> {
  const index = await buildTransactionEventIndex({ force: options?.force });
  return listOffseasonYearsWithEvents(index);
}

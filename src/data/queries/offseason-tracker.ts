/**
 * Offseason Tracker queries — transaction EVENT archive (not genealogy).
 */

import {
  aggregateTeamActivity,
  buildFilteredOffseasonFeed,
  buildOffseasonPulse,
  buildTransactionEventCoverage,
  buildTransactionEventIndex,
  clearTransactionEventIndexCache,
  filterTransactionEvents,
  getRelatedClusterForEvent,
  groupEventsByDate,
  groupEventsByMonth,
  listOffseasonYearsWithEvents,
  paginateEvents,
} from "@/data/providers/transactions/transaction-event-index";
import type { OffseasonFeedItem } from "@/data/types/transaction-event";
import {
  currentOffseasonLabelYear,
  currentOffseasonWindow,
  offseasonWindowForYear,
} from "@/data/providers/transactions/offseason-window";
import type {
  NbaTransactionEvent,
  OffseasonPulse,
  RelatedTransactionEventCluster,
  TeamOffseasonActivity,
  TransactionEventCoverage,
  TransactionEventFilters,
  TransactionEventPage,
} from "@/data/types/transaction-event";

export type {
  NbaTransactionEvent,
  OffseasonPulse,
  RelatedTransactionEventCluster,
  TeamOffseasonActivity,
  TransactionEventCoverage,
  TransactionEventFilters,
  TransactionEventPage,
};

export type { OffseasonFeedItem };

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

export async function getTransactionEventWithRelations(
  id: string,
  options?: { force?: boolean }
): Promise<{
  event: NbaTransactionEvent;
  cluster: RelatedTransactionEventCluster | null;
  relatedEvents: NbaTransactionEvent[];
} | null> {
  const index = await buildTransactionEventIndex({ force: options?.force });
  const event = index.byId.get(id);
  if (!event) return null;
  const related = getRelatedClusterForEvent(index, id);
  return {
    event,
    cluster: related?.cluster ?? null,
    relatedEvents: related?.events ?? [],
  };
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
  feedByMonth: Array<{ monthKey: string; items: OffseasonFeedItem[] }>;
  feedTotal: number;
  feedPage: number;
  feedPageCount: number;
}> {
  const index = await buildTransactionEventIndex({ force: options?.force });
  const built = buildFilteredOffseasonFeed(index, filters, {
    page: options?.page ?? 1,
    pageSize: options?.pageSize ?? 40,
  });
  return {
    page: built.page,
    byDate: groupEventsByDate(built.page.events),
    byMonth: groupEventsByMonth(built.page.events),
    feedByMonth: built.byMonth,
    feedTotal: built.feed.total,
    feedPage: built.feed.page,
    feedPageCount: built.feed.pageCount,
  };
}

export async function listAvailableOffseasonYears(options?: {
  force?: boolean;
}): Promise<number[]> {
  const index = await buildTransactionEventIndex({ force: options?.force });
  return listOffseasonYearsWithEvents(index);
}

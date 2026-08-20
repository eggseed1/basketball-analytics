/**
 * Transaction EVENT index - ESPN free-text archive for the Offseason Tracker.
 * Does not build ownership edges or player assets.
 */

import { loadTransactionArchive } from "@/data/providers/transactions/transaction-archive-store";
import {
  buildOffseasonFeedItems,
  buildRelatedTransactionEventClusters,
  type OffseasonFeedItem,
  type RelatedTransactionEventCluster,
  type TransactionEventClusterIndex,
} from "@/data/providers/transactions/transaction-event-clusters";
import type { CanonicalTransaction } from "@/data/types/transaction-lineage";
import type {
  NbaTransactionEvent,
  OffseasonPulse,
  TeamOffseasonActivity,
  TransactionEventCoverage,
  TransactionEventFilters,
  TransactionEventPage,
} from "@/data/types/transaction-event";
import { TRANSACTION_EVENT_ARCHIVE_VERSION } from "@/data/types/transaction-event";
import type { TransactionType } from "@/offseason";
import {
  currentOffseasonWindow,
  offseasonWindowForYear,
  weekDateRange,
} from "@/data/providers/transactions/offseason-window";

export type TransactionEventIndex = {
  builtAt: string;
  events: NbaTransactionEvent[];
  byId: Map<string, NbaTransactionEvent>;
  /** date → events (newest-first within day already global-sorted) */
  dates: string[];
  earliestDate: string | null;
  latestDate: string | null;
  source: string | null;
  datasetVersion: string | null;
  /** Precomputed related-event clusters (not structured trades). */
  clusters: TransactionEventClusterIndex;
};

let memory: { expiresAt: number; value: TransactionEventIndex } | null = null;
const TTL_MS = 1000 * 60 * 30;
let indexInflight: Promise<TransactionEventIndex> | null = null;

function toEvent(tx: CanonicalTransaction): NbaTransactionEvent | null {
  const teamId = tx.teamIds[0] ?? tx.parties[0]?.teamId;
  if (!teamId || !tx.date || !tx.description?.trim()) return null;
  return {
    id: tx.id,
    date: tx.date,
    season: tx.season,
    teamId,
    teamAbbr: tx.parties[0]?.teamAbbr,
    description: tx.description.trim(),
    sourceTextCategory: tx.type,
    source: tx.source ?? tx.provenance?.source ?? "espn-site-v2-transactions",
    sourceUrl: tx.sourceUrl,
    datasetVersion:
      tx.sourceVersion ?? tx.provenance?.datasetVersion ?? undefined,
    ingestedAt: tx.provenance?.ingestedAt,
    espnCalendarYear: tx.provenance?.espnCalendarYear,
    recordStatus: "source_event",
  };
}

export async function buildTransactionEventIndex(options: {
  force?: boolean;
  cwd?: string;
  now?: string;
} = {}): Promise<TransactionEventIndex> {
  if (!options.force && memory && memory.expiresAt > Date.now()) {
    return memory.value;
  }
  if (!options.force && indexInflight) {
    return indexInflight;
  }

  const build = async (): Promise<TransactionEventIndex> => {
    const archive = await loadTransactionArchive(options.cwd);
    const events: NbaTransactionEvent[] = [];
    for (const tx of archive.transactions) {
      const event = toEvent(tx);
      if (event) events.push(event);
    }
    events.sort(
      (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)
    );

    const clusters = buildRelatedTransactionEventClusters(events);
    for (const e of events) {
      const cid = clusters.byEventId.get(e.id);
      if (cid) e.relatedClusterId = cid;
    }

    const byId = new Map(events.map((e) => [e.id, e]));
    const dates = [...new Set(events.map((e) => e.date))].sort((a, b) =>
      b.localeCompare(a)
    );

    const value: TransactionEventIndex = {
      builtAt: options.now ?? new Date().toISOString(),
      events,
      byId,
      dates,
      earliestDate: events.length
        ? [...events].sort((a, b) => a.date.localeCompare(b.date))[0]!.date
        : null,
      latestDate: events[0]?.date ?? null,
      source: archive.manifest?.source ?? null,
      datasetVersion: archive.manifest?.datasetVersion ?? null,
      clusters,
    };
    memory = { expiresAt: Date.now() + TTL_MS, value };
    return value;
  };

  if (options.force) {
    return build();
  }
  indexInflight = build().finally(() => {
    indexInflight = null;
  });
  return indexInflight;
}

export function clearTransactionEventIndexCache(): void {
  memory = null;
  indexInflight = null;
}

export function filterTransactionEvents(
  index: TransactionEventIndex,
  filters: TransactionEventFilters = {}
): NbaTransactionEvent[] {
  let rows = index.events;

  if (filters.offseasonYear != null) {
    const w = offseasonWindowForYear(filters.offseasonYear);
    rows = rows.filter((e) => e.date >= w.startDate && e.date <= w.endDate);
  }
  if (filters.season) {
    rows = rows.filter((e) => e.season === filters.season);
  }
  if (filters.teamId) {
    const tid = String(filters.teamId);
    rows = rows.filter((e) => e.teamId === tid);
  }
  if (filters.dateFrom) {
    rows = rows.filter((e) => e.date >= filters.dateFrom!);
  }
  if (filters.dateTo) {
    rows = rows.filter((e) => e.date <= filters.dateTo!);
  }
  if (filters.category) {
    rows = rows.filter((e) => e.sourceTextCategory === filters.category);
  }
  if (filters.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    rows = rows.filter(
      (e) =>
        e.description.toLowerCase().includes(q) ||
        (e.teamAbbr?.toLowerCase().includes(q) ?? false) ||
        e.teamId.toLowerCase().includes(q)
    );
  }
  return rows;
}

export function paginateEvents(
  events: NbaTransactionEvent[],
  page = 1,
  pageSize = 40
): TransactionEventPage {
  const size = Math.max(1, Math.min(100, pageSize));
  const total = events.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, page), pageCount);
  const start = (p - 1) * size;
  return {
    events: events.slice(start, start + size),
    total,
    page: p,
    pageSize: size,
    pageCount,
  };
}

export function paginateFeedItems(
  items: OffseasonFeedItem[],
  page = 1,
  pageSize = 40
): {
  items: OffseasonFeedItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
} {
  const size = Math.max(1, Math.min(100, pageSize));
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, page), pageCount);
  const start = (p - 1) * size;
  return {
    items: items.slice(start, start + size),
    total,
    page: p,
    pageSize: size,
    pageCount,
  };
}

/**
 * Filter → expand related clusters → collapse into feed items → paginate.
 * Search still matches raw descriptions; cluster siblings surface together.
 */
export function buildFilteredOffseasonFeed(
  index: TransactionEventIndex,
  filters: TransactionEventFilters = {},
  options: { page?: number; pageSize?: number } = {}
): {
  page: TransactionEventPage;
  feed: ReturnType<typeof paginateFeedItems>;
  byMonth: Array<{ monthKey: string; items: OffseasonFeedItem[] }>;
} {
  const filtered = filterTransactionEvents(index, filters);
  const feedItems = buildOffseasonFeedItems(
    filtered,
    index.clusters,
    index.byId
  );
  const feed = paginateFeedItems(
    feedItems,
    options.page ?? 1,
    options.pageSize ?? 40
  );

  const pageEvents = feed.items.flatMap((item) =>
    item.kind === "source_event" ? [item.event] : item.events
  );
  const page: TransactionEventPage = {
    events: pageEvents,
    total: filtered.length,
    page: feed.page,
    pageSize: feed.pageSize,
    pageCount: feed.pageCount,
  };

  const byMonthMap = new Map<string, OffseasonFeedItem[]>();
  for (const item of feed.items) {
    const date =
      item.kind === "source_event" ? item.event.date : item.cluster.date;
    const key = date.slice(0, 7);
    const list = byMonthMap.get(key) ?? [];
    list.push(item);
    byMonthMap.set(key, list);
  }
  const byMonth = [...byMonthMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([monthKey, items]) => ({ monthKey, items }));

  return { page, feed, byMonth };
}

export function aggregateTeamActivity(
  events: NbaTransactionEvent[]
): TeamOffseasonActivity[] {
  const map = new Map<
    string,
    {
      teamId: string;
      teamAbbr?: string;
      eventCount: number;
      bySourceTextCategory: Partial<Record<TransactionType, number>>;
      days: Set<string>;
    }
  >();

  for (const e of events) {
    const row = map.get(e.teamId) ?? {
      teamId: e.teamId,
      teamAbbr: e.teamAbbr,
      eventCount: 0,
      bySourceTextCategory: {},
      days: new Set<string>(),
    };
    row.eventCount += 1;
    row.teamAbbr = row.teamAbbr ?? e.teamAbbr;
    row.bySourceTextCategory[e.sourceTextCategory] =
      (row.bySourceTextCategory[e.sourceTextCategory] ?? 0) + 1;
    row.days.add(e.date);
    map.set(e.teamId, row);
  }

  return [...map.values()]
    .map((r) => ({
      teamId: r.teamId,
      teamAbbr: r.teamAbbr,
      eventCount: r.eventCount,
      bySourceTextCategory: r.bySourceTextCategory,
      activeDays: r.days.size,
    }))
    .sort(
      (a, b) =>
        b.eventCount - a.eventCount ||
        (a.teamAbbr ?? "").localeCompare(b.teamAbbr ?? "")
    );
}

export function buildOffseasonPulse(
  index: TransactionEventIndex,
  options: { now?: Date; offseasonYear?: number } = {}
): OffseasonPulse {
  const now = options.now ?? new Date();
  const window =
    options.offseasonYear != null
      ? offseasonWindowForYear(options.offseasonYear)
      : currentOffseasonWindow(now);
  const offseasonEvents = filterTransactionEvents(index, {
    offseasonYear: window.labelYear,
  });
  const week = weekDateRange(now);
  const weekEvents = offseasonEvents.filter(
    (e) => e.date >= week.from && e.date <= week.to
  );
  const activity = aggregateTeamActivity(offseasonEvents);
  const weekTeams = new Set(weekEvents.map((e) => e.teamId));

  return {
    offseasonYear: window.labelYear,
    window,
    eventCount: offseasonEvents.length,
    teamCount: activity.length,
    eventsThisWeek: weekEvents.length,
    teamsThisWeek: weekTeams.size,
    mostActiveTeam: activity[0] ?? null,
    latestEvent: offseasonEvents[0] ?? null,
    archiveEarliestDate: index.earliestDate,
    archiveLatestDate: index.latestDate,
    archiveEventCount: index.events.length,
  };
}

export async function buildTransactionEventCoverage(
  index: TransactionEventIndex
): Promise<TransactionEventCoverage> {
  return {
    source: index.source ?? "espn-site-v2-transactions",
    datasetVersion: index.datasetVersion,
    earliestDate: index.earliestDate,
    latestDate: index.latestDate,
    eventCount: index.events.length,
    sourceEventCount: index.events.length,
    relatedClusterCount: index.clusters.clusters.length,
    structuredTransactionCount: 0,
    ownershipEdgeCount: 0,
    structuredAssetsAvailable: false,
    genealogyUiReady: false,
    notes: [
      "ESPN's historical transaction archive provides event-level free-text records. Some records describe only one side of a transaction.",
      "DRBL does not infer player/pick consideration from free text.",
      "When related source events can be safely connected (same date + reciprocal team mentions), DRBL may display them together as a source-event cluster.",
      "Source-text categories are keyword classifications, not official ESPN enums - and do not imply a complete trade package.",
      "Structured transactions / ownership edges: 0. Asset genealogy UI remains blocked (genealogyUiReady = false).",
      `Event index methodology v${TRANSACTION_EVENT_ARCHIVE_VERSION}.`,
    ],
  };
}

export function groupEventsByDate(
  events: NbaTransactionEvent[]
): Array<{ date: string; events: NbaTransactionEvent[] }> {
  const map = new Map<string, NbaTransactionEvent[]>();
  for (const e of events) {
    const list = map.get(e.date) ?? [];
    list.push(e);
    map.set(e.date, list);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, evs]) => ({ date, events: evs }));
}

export function groupEventsByMonth(
  events: NbaTransactionEvent[]
): Array<{ monthKey: string; events: NbaTransactionEvent[] }> {
  const map = new Map<string, NbaTransactionEvent[]>();
  for (const e of events) {
    const key = e.date.slice(0, 7);
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([monthKey, evs]) => ({ monthKey, events: evs }));
}

/** Available offseason label years that have at least one archive event in-window. */
export function listOffseasonYearsWithEvents(
  index: TransactionEventIndex
): number[] {
  if (!index.earliestDate || !index.latestDate) return [];
  const startY = Number(index.earliestDate.slice(0, 4));
  const endY = Number(index.latestDate.slice(0, 4));
  const years: number[] = [];
  for (let y = endY; y >= startY; y--) {
    const w = offseasonWindowForYear(y);
    const has = index.events.some(
      (e) => e.date >= w.startDate && e.date <= w.endDate
    );
    if (has) years.push(y);
  }
  return years;
}

export function getRelatedClusterForEvent(
  index: TransactionEventIndex,
  eventId: string
): {
  cluster: RelatedTransactionEventCluster;
  events: NbaTransactionEvent[];
} | null {
  const clusterId = index.clusters.byEventId.get(eventId);
  if (!clusterId) return null;
  const cluster = index.clusters.byClusterId.get(clusterId);
  if (!cluster) return null;
  const members = cluster.eventIds
    .map((id) => index.byId.get(id))
    .filter((e): e is NbaTransactionEvent => Boolean(e));
  return { cluster, events: members };
}

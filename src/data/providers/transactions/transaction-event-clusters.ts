/**
 * Related Transaction Event clustering.
 *
 * Groups ESPN free-text source events that appear to describe the same
 * real-world move — WITHOUT promoting them to structured transactions.
 *
 * Safe evidence only:
 * - same calendar date
 * - distinct teamIds (structured source fields)
 * - reciprocal mentions of the counterpart team's known brand aliases
 * - counterparty language (from / to / traded / acquired / in exchange)
 *
 * Does NOT parse player names, pick identities, or invent asset ledgers.
 */

import { createHash } from "node:crypto";

import type { NbaTransactionEvent } from "@/data/types/transaction-event";
import { ESPN_TEAM_META } from "@/data/providers/nba/team-meta";
import { TEAM_BRANDS, resolveTeamBrand } from "@/lib/nba-brand";

export const TRANSACTION_EVENT_CLUSTER_VERSION = "1.0";

/** Data maturity status for Offseason Tracker rows. */
export type TransactionEventRecordStatus =
  | "source_event"
  | "related_event_cluster"
  | "structured_transaction";

export type RelatedTransactionEventCluster = {
  id: string;
  date: string;
  eventIds: string[];
  teamIds: string[];
  /** Evidence summary — never an asset ledger. */
  evidence: string[];
  status: "related_event_cluster";
  /** Always false for ESPN archive clusters. */
  structuredLedgerAvailable: false;
  methodologyVersion: string;
};

export type TransactionEventClusterIndex = {
  clusters: RelatedTransactionEventCluster[];
  /** eventId → clusterId */
  byEventId: Map<string, string>;
  byClusterId: Map<string, RelatedTransactionEventCluster>;
};

/** Distinctive nicknames / display phrases keyed by ESPN team id. */
const NICKNAMES_BY_ESPN_ID: Record<string, string[]> = {
  "1": ["hawks", "atlanta hawks"],
  "2": ["celtics", "boston celtics"],
  "3": ["pelicans", "new orleans pelicans"],
  "4": ["bulls", "chicago bulls"],
  "5": ["cavaliers", "cavs", "cleveland cavaliers"],
  "6": ["mavericks", "mavs", "dallas mavericks"],
  "7": ["nuggets", "denver nuggets"],
  "8": ["pistons", "detroit pistons"],
  "9": ["warriors", "golden state warriors"],
  "10": ["rockets", "houston rockets"],
  "11": ["pacers", "indiana pacers"],
  "12": ["clippers", "la clippers", "l.a. clippers", "los angeles clippers"],
  "13": ["lakers", "la lakers", "l.a. lakers", "los angeles lakers"],
  "14": ["heat", "miami heat"],
  "15": ["bucks", "milwaukee bucks"],
  "16": ["timberwolves", "wolves", "minnesota timberwolves"],
  "17": ["nets", "brooklyn nets"],
  "18": ["knicks", "new york knicks"],
  "19": ["magic", "orlando magic"],
  "20": ["76ers", "sixers", "philadelphia 76ers", "philadelphia sixers"],
  "21": ["suns", "phoenix suns"],
  "22": ["trail blazers", "blazers", "portland trail blazers"],
  "23": ["kings", "sacramento kings"],
  "24": ["spurs", "san antonio spurs"],
  "25": ["thunder", "okc", "oklahoma city thunder"],
  "26": ["jazz", "utah jazz"],
  "27": ["wizards", "washington wizards"],
  "28": ["raptors", "toronto raptors"],
  "29": ["grizzlies", "memphis grizzlies"],
  "30": ["hornets", "charlotte hornets"],
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Brand aliases used only for counterparty team detection — not players. */
export function teamMentionAliases(teamId: string): string[] {
  const brand = resolveTeamBrand(teamId);
  const meta = ESPN_TEAM_META[teamId];
  const nicks = NICKNAMES_BY_ESPN_ID[teamId] ?? [];
  const out = new Set<string>();
  for (const n of nicks) out.add(n.toLowerCase());
  if (brand?.abbr) out.add(brand.abbr.toLowerCase());
  if (meta?.city && nicks[0]) {
    out.add(`${meta.city.toLowerCase()} ${nicks[0]}`);
  }
  // Prefer longer aliases first when matching.
  return [...out].sort((a, b) => b.length - a.length);
}

/**
 * True when free-text mentions this team via known brand aliases.
 * Does not extract players or picks.
 */
export function descriptionMentionsTeam(
  description: string,
  teamId: string
): boolean {
  const text = description.toLowerCase();
  for (const alias of teamMentionAliases(teamId)) {
    if (alias.length < 3) continue;
    const re = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i");
    if (re.test(text)) return true;
  }
  return false;
}

/**
 * Counterparty context: mention appears near acquisition / trade language.
 * Prevents clustering on incidental same-day brand mentions.
 */
export function hasCounterpartyTradeContext(
  description: string,
  counterpartTeamId: string
): boolean {
  if (!descriptionMentionsTeam(description, counterpartTeamId)) return false;
  const d = description.toLowerCase();
  // Must look like a move involving another club — not a pure signing blurb
  // that happens to name a former team casually without from/to/trade language.
  if (
    /\b(acquired|traded|sent|received|waived|claimed)\b/.test(d) &&
    /\b(from|to|for|in exchange)\b/.test(d)
  ) {
    return true;
  }
  if (/\bin (a |an )?\w*-?team trade\b/.test(d)) return true;
  if (/\bin exchange for\b/.test(d)) return true;
  return false;
}

function clusterIdFor(date: string, eventIds: string[]): string {
  const key = `${date}|${[...eventIds].sort().join("|")}`;
  const hash = createHash("sha1").update(key).digest("hex").slice(0, 16);
  return `tx-cluster-${hash}`;
}

/**
 * Build related-event clusters for an event list.
 * Each event appears in at most one cluster. Clusters require ≥2 events.
 */
export function buildRelatedTransactionEventClusters(
  events: NbaTransactionEvent[]
): TransactionEventClusterIndex {
  // Group by date for O(n_day²) pairwise checks — not full archive².
  const byDate = new Map<string, NbaTransactionEvent[]>();
  for (const e of events) {
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }

  type Edge = { a: string; b: string };
  const edges: Edge[] = [];

  for (const [, dayEvents] of byDate) {
    if (dayEvents.length < 2) continue;
    for (let i = 0; i < dayEvents.length; i++) {
      for (let j = i + 1; j < dayEvents.length; j++) {
        const a = dayEvents[i]!;
        const b = dayEvents[j]!;
        if (a.teamId === b.teamId) continue;
        const aMentionsB = hasCounterpartyTradeContext(a.description, b.teamId);
        const bMentionsA = hasCounterpartyTradeContext(b.description, a.teamId);
        if (aMentionsB && bMentionsA) {
          edges.push({ a: a.id, b: b.id });
        }
      }
    }
  }

  // Union-find over reciprocal edges (same date already enforced).
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p !== x) {
      const root = find(p);
      parent.set(x, root);
      return root;
    }
    return x;
  };
  const union = (x: string, y: string) => {
    const rx = find(x);
    const ry = find(y);
    if (rx === ry) return;
    // Deterministic: smaller id is parent.
    if (rx < ry) parent.set(ry, rx);
    else parent.set(rx, ry);
  };

  for (const e of edges) {
    if (!parent.has(e.a)) parent.set(e.a, e.a);
    if (!parent.has(e.b)) parent.set(e.b, e.b);
    union(e.a, e.b);
  }

  const groups = new Map<string, Set<string>>();
  for (const id of parent.keys()) {
    const root = find(id);
    const set = groups.get(root) ?? new Set();
    set.add(id);
    groups.set(root, set);
  }

  const byId = new Map(events.map((e) => [e.id, e]));
  const clusters: RelatedTransactionEventCluster[] = [];
  const byEventId = new Map<string, string>();
  const byClusterId = new Map<string, RelatedTransactionEventCluster>();

  for (const memberIds of groups.values()) {
    if (memberIds.size < 2) continue;
    const members = [...memberIds]
      .map((id) => byId.get(id))
      .filter((e): e is NbaTransactionEvent => Boolean(e))
      .sort(
        (a, b) =>
          a.teamId.localeCompare(b.teamId) || a.id.localeCompare(b.id)
      );
    if (members.length < 2) continue;

    // Guard: all members must share a date.
    const dates = new Set(members.map((m) => m.date));
    if (dates.size !== 1) continue;

    const date = members[0]!.date;
    const eventIds = members.map((m) => m.id);
    const teamIds = [...new Set(members.map((m) => m.teamId))].sort();
    const id = clusterIdFor(date, eventIds);
    const abbrs = teamIds.map(
      (tid) => resolveTeamBrand(tid)?.abbr ?? tid
    );

    const cluster: RelatedTransactionEventCluster = {
      id,
      date,
      eventIds,
      teamIds,
      evidence: [
        `Same transaction date (${date}).`,
        `Reciprocal counterparty team mentions between ${abbrs.join(" and ")}.`,
        "Cluster groups source events only — not a verified structured trade ledger.",
      ],
      status: "related_event_cluster",
      structuredLedgerAvailable: false,
      methodologyVersion: TRANSACTION_EVENT_CLUSTER_VERSION,
    };
    clusters.push(cluster);
    byClusterId.set(id, cluster);
    for (const eid of eventIds) byEventId.set(eid, id);
  }

  clusters.sort(
    (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)
  );

  return { clusters, byEventId, byClusterId };
}

/** Ensure TEAM_BRANDS is referenced so tree-shaking keeps brand resolution. */
void TEAM_BRANDS;

export type OffseasonFeedItem =
  | {
      kind: "source_event";
      event: NbaTransactionEvent;
      status: "source_event";
    }
  | {
      kind: "related_event_cluster";
      cluster: RelatedTransactionEventCluster;
      events: NbaTransactionEvent[];
      status: "related_event_cluster";
    };

/**
 * Collapse filtered events into feed items (clusters + leftover source events).
 * If any cluster member matches the filter, include all cluster members
 * (looked up from `allById`) so reciprocal sides stay visible.
 */
export function buildOffseasonFeedItems(
  filtered: NbaTransactionEvent[],
  clusterIndex: TransactionEventClusterIndex,
  allById: Map<string, NbaTransactionEvent>
): OffseasonFeedItem[] {
  const seenEvents = new Set<string>();
  const seenClusters = new Set<string>();
  const items: OffseasonFeedItem[] = [];

  for (const e of filtered) {
    const clusterId = clusterIndex.byEventId.get(e.id);
    if (clusterId) {
      if (seenClusters.has(clusterId)) continue;
      seenClusters.add(clusterId);
      const cluster = clusterIndex.byClusterId.get(clusterId)!;
      const members = cluster.eventIds
        .map((id) => allById.get(id))
        .filter((x): x is NbaTransactionEvent => Boolean(x))
        .sort(
          (a, b) =>
            a.teamId.localeCompare(b.teamId) || a.id.localeCompare(b.id)
        );
      for (const m of members) seenEvents.add(m.id);
      items.push({
        kind: "related_event_cluster",
        cluster,
        events: members,
        status: "related_event_cluster",
      });
      continue;
    }
    if (seenEvents.has(e.id)) continue;
    seenEvents.add(e.id);
    items.push({
      kind: "source_event",
      event: e,
      status: "source_event",
    });
  }

  return items;
}

export function transactionEventRecordStatusLabel(
  status: TransactionEventRecordStatus
): string {
  switch (status) {
    case "source_event":
      return "Source event";
    case "related_event_cluster":
      return "Related event cluster";
    case "structured_transaction":
      return "Structured transaction";
  }
}

/**
 * Related Transaction Event clustering.
 *
 * Groups ESPN free-text source records that appear to describe the SAME
 * underlying real-world transaction — WITHOUT promoting them to a structured
 * ledger.
 *
 * Hierarchy:
 *   Calendar day  → many transaction events
 *   Transaction event → one or more ESPN source records
 *
 * CORE RULE: same date / same team / same category alone NEVER justifies a merge.
 * Prefer under-grouping over false merging.
 *
 * Safe evidence for a 2-record cluster (all required):
 * - same calendar date (candidate window only — not identity)
 * - distinct teamIds (structured source fields)
 * - reciprocal counterparty trade context (from/to/traded/acquired + brand aliases)
 * - exactly one reciprocal partner each (ambiguous multi-partner same-day → no merge)
 *
 * Does NOT parse player names, pick identities, or invent asset ledgers.
 */

import { createHash } from "node:crypto";

import type {
  NbaTransactionEvent,
  OffseasonFeedItem,
  RelatedTransactionEventCluster,
} from "@/data/types/transaction-event";
import { ESPN_TEAM_META } from "@/data/providers/nba/team-meta";
import { TEAM_BRANDS, resolveTeamBrand } from "@/lib/nba-brand";

export type { TransactionEventRecordStatus } from "@/lib/transaction-event-status";
export { transactionEventRecordStatusLabel } from "@/lib/transaction-event-status";
export type { OffseasonFeedItem, RelatedTransactionEventCluster };

/** Bump when clustering rules change (feeds coverage / diagnostics). */
export const TRANSACTION_EVENT_CLUSTER_VERSION = "1.1";

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

/**
 * High-confidence pairwise check: two source records may describe the same
 * underlying trade. Does not use date/team alone as identity.
 */
export function areReciprocalSameTransactionCandidates(
  a: NbaTransactionEvent,
  b: NbaTransactionEvent
): boolean {
  if (a.id === b.id) return false;
  if (a.date !== b.date) return false;
  if (a.teamId === b.teamId) return false;
  // Reciprocal trade language is required. Category alone is never enough.
  const aTrade = hasCounterpartyTradeContext(a.description, b.teamId);
  const bTrade = hasCounterpartyTradeContext(b.description, a.teamId);
  return aTrade && bTrade;
}

function clusterIdFor(date: string, eventIds: string[]): string {
  const key = `${date}|${[...eventIds].sort().join("|")}`;
  const hash = createHash("sha1").update(key).digest("hex").slice(0, 16);
  return `tx-cluster-${hash}`;
}

/**
 * Build related-event clusters for an event list.
 *
 * Conservative rules:
 * - Pairwise only (exactly 2 source records per cluster)
 * - Reciprocal counterparty trade context required
 * - If a record has multiple reciprocal partners the same day → ambiguous → no merge
 * - Same team / same date alone never clusters
 */
export function buildRelatedTransactionEventClusters(
  events: NbaTransactionEvent[]
): TransactionEventClusterIndex {
  // Group by date for O(n_day²) pairwise checks — date is a search window only.
  const byDate = new Map<string, NbaTransactionEvent[]>();
  for (const e of events) {
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }

  type Edge = { a: string; b: string; date: string };
  const edges: Edge[] = [];

  for (const [date, dayEvents] of byDate) {
    if (dayEvents.length < 2) continue;
    for (let i = 0; i < dayEvents.length; i++) {
      for (let j = i + 1; j < dayEvents.length; j++) {
        const a = dayEvents[i]!;
        const b = dayEvents[j]!;
        if (!areReciprocalSameTransactionCandidates(a, b)) continue;
        edges.push({ a: a.id, b: b.id, date });
      }
    }
  }

  // Degree: records with >1 reciprocal partner same day are ambiguous.
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
  }

  const byId = new Map(events.map((e) => [e.id, e]));
  const clusters: RelatedTransactionEventCluster[] = [];
  const byEventId = new Map<string, string>();
  const byClusterId = new Map<string, RelatedTransactionEventCluster>();
  const used = new Set<string>();

  // Deterministic edge order.
  edges.sort(
    (x, y) =>
      x.date.localeCompare(y.date) ||
      x.a.localeCompare(y.a) ||
      x.b.localeCompare(y.b)
  );

  for (const edge of edges) {
    if (used.has(edge.a) || used.has(edge.b)) continue;
    // Ambiguous multi-partner same day → keep separate (under-group).
    if ((degree.get(edge.a) ?? 0) !== 1 || (degree.get(edge.b) ?? 0) !== 1) {
      continue;
    }

    const members = [byId.get(edge.a), byId.get(edge.b)].filter(
      (e): e is NbaTransactionEvent => Boolean(e)
    );
    if (members.length !== 2) continue;
    members.sort(
      (a, b) => a.teamId.localeCompare(b.teamId) || a.id.localeCompare(b.id)
    );

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
        "Reciprocal counterparty trade language between distinct teams.",
        `Teams: ${abbrs.join(" ↔ ")}.`,
        `Shared calendar date (${date}) used only as a candidate window — not transaction identity.`,
        "Cluster groups ESPN source records for one underlying transaction event — not a verified structured trade ledger.",
      ],
      status: "related_event_cluster",
      structuredLedgerAvailable: false,
      methodologyVersion: TRANSACTION_EVENT_CLUSTER_VERSION,
    };
    clusters.push(cluster);
    byClusterId.set(id, cluster);
    for (const eid of eventIds) {
      byEventId.set(eid, id);
      used.add(eid);
    }
  }

  clusters.sort(
    (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)
  );

  return { clusters, byEventId, byClusterId };
}

/** Ensure TEAM_BRANDS is referenced so tree-shaking keeps brand resolution. */
void TEAM_BRANDS;

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

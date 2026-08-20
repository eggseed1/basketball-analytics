/**
 * Client-safe Offseason Tracker presentation helpers.
 * Normalizes trade-related UX without inventing structured trade ledgers.
 *
 * Data model still distinguishes source_event vs related_event_cluster -
 * this module only shapes what the user sees at the top level.
 */

import type { OffseasonFeedItem } from "@/data/types/transaction-event";
import type { NbaTransactionEvent } from "@/data/types/transaction-event";
import type { TransactionType } from "@/offseason";

/** ESPN source-text category `trade` - wording only, not a verified package. */
export function isTradeRelatedSourceCategory(
  category: TransactionType | string | null | undefined
): boolean {
  return category === "trade";
}

export function espnSourceEventCountLabel(count: number): string {
  const n = Math.max(0, Math.floor(count));
  return n === 1 ? "1 ESPN source event" : `${n} ESPN source events`;
}

export const TRADE_RELATED_TRANSACTION_TITLE = "Trade-related transaction";

export type TradeRelatedPresentation = {
  kind: "trade_related_transaction";
  /** User-facing top-level title. */
  title: typeof TRADE_RELATED_TRANSACTION_TITLE;
  sourceCount: number;
  /** True when presentation is backed by a related-event cluster (2+ sources). */
  hasSourceCluster: boolean;
  sourceCountLabel: string;
};

export type NonTradeFeedPresentation =
  | {
      kind: "source_event";
      title: "Source event";
      sourceCount: 1;
      hasSourceCluster: false;
      sourceCountLabel: string;
    }
  | {
      kind: "related_event_cluster";
      title: "Related event cluster";
      sourceCount: number;
      hasSourceCluster: true;
      sourceCountLabel: string;
    };

export type OffseasonFeedPresentation =
  | TradeRelatedPresentation
  | NonTradeFeedPresentation;

export function tradeRelatedPresentation(
  sourceCount: number,
  hasSourceCluster: boolean
): TradeRelatedPresentation {
  const count = Math.max(1, Math.floor(sourceCount));
  return {
    kind: "trade_related_transaction",
    title: TRADE_RELATED_TRANSACTION_TITLE,
    sourceCount: count,
    hasSourceCluster,
    sourceCountLabel: espnSourceEventCountLabel(count),
  };
}

/** Single ESPN archive row - trade-related when source-text category is trade. */
export function presentationForSourceEvent(
  event: NbaTransactionEvent
): OffseasonFeedPresentation {
  if (isTradeRelatedSourceCategory(event.sourceTextCategory)) {
    return tradeRelatedPresentation(1, false);
  }
  return {
    kind: "source_event",
    title: "Source event",
    sourceCount: 1,
    hasSourceCluster: false,
    sourceCountLabel: espnSourceEventCountLabel(1),
  };
}

/**
 * Related-event cluster - trade-related when any member is trade-classified.
 * Source count = all ESPN records in the cluster (evidence size).
 */
export function presentationForRelatedCluster(
  events: NbaTransactionEvent[]
): OffseasonFeedPresentation {
  const count = Math.max(1, events.length);
  const anyTrade = events.some((e) =>
    isTradeRelatedSourceCategory(e.sourceTextCategory)
  );
  if (anyTrade) {
    return tradeRelatedPresentation(count, count > 1);
  }
  return {
    kind: "related_event_cluster",
    title: "Related event cluster",
    sourceCount: count,
    hasSourceCluster: true,
    sourceCountLabel: espnSourceEventCountLabel(count),
  };
}

export function presentationForOffseasonFeedItem(
  item: OffseasonFeedItem
): OffseasonFeedPresentation {
  if (item.kind === "related_event_cluster") {
    return presentationForRelatedCluster(item.events);
  }
  return presentationForSourceEvent(item.event);
}

/**
 * Client-safe transaction event status labels.
 * Keep Node clustering (node:crypto) out of the browser graph.
 */

export type TransactionEventRecordStatus =
  | "source_event"
  | "related_event_cluster"
  | "structured_transaction";

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

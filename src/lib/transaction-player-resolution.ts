/**
 * Client-safe transaction player resolution types + description partitioning.
 * Keep Node/query I/O out of this module — client UI imports it.
 */

import type { ExtractedTransactionPlayerMention } from "@/lib/transaction-player-extract";

export type TransactionPlayerResolutionStatus =
  | "resolved"
  | "ambiguous"
  | "unresolved"
  | "invalid";

export type TransactionPlayerCandidate = {
  playerId: string;
  playerName: string;
  teamIds: string[];
  seasons: string[];
};

export type TransactionPlayerResolution = {
  status: TransactionPlayerResolutionStatus;
  mention: ExtractedTransactionPlayerMention;
  playerId: string | null;
  playerName: string | null;
  href: string | null;
  teamKey: string | null;
  candidates: TransactionPlayerCandidate[];
  reason: string | null;
};

export type DescriptionPart =
  | { kind: "text"; text: string }
  | { kind: "player"; resolution: TransactionPlayerResolution };

/** Split description into text + resolved player parts for rendering. */
export function partitionTransactionDescription(
  description: string,
  resolutions: TransactionPlayerResolution[]
): DescriptionPart[] {
  const resolved = resolutions
    .filter((r) => r.status === "resolved" && r.playerId)
    .sort((a, b) => a.mention.start - b.mention.start);

  if (!resolved.length) {
    return [{ kind: "text", text: description }];
  }

  const parts: DescriptionPart[] = [];
  let cursor = 0;
  for (const r of resolved) {
    if (r.mention.start > cursor) {
      parts.push({
        kind: "text",
        text: description.slice(cursor, r.mention.start),
      });
    }
    parts.push({ kind: "player", resolution: r });
    cursor = Math.max(cursor, r.mention.end);
  }
  if (cursor < description.length) {
    parts.push({ kind: "text", text: description.slice(cursor) });
  }
  return parts;
}

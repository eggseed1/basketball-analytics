/**
 * Client-safe transaction player resolution types + description partitioning.
 * Keep Node/query I/O out of this module - client UI imports it.
 */

import type { ExtractedTransactionPlayerMention } from "@/lib/transaction-player-extract";
import { extractTeamMentions } from "@/lib/team-mention";

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
  | { kind: "player"; resolution: TransactionPlayerResolution }
  | { kind: "team"; teamKey: string; label: string };

function splitTextWithTeams(text: string): DescriptionPart[] {
  const mentions = extractTeamMentions(text);
  if (!mentions.length) {
    return text ? [{ kind: "text", text }] : [];
  }
  const parts: DescriptionPart[] = [];
  let cursor = 0;
  for (const m of mentions) {
    if (m.start > cursor) {
      parts.push({ kind: "text", text: text.slice(cursor, m.start) });
    }
    parts.push({
      kind: "team",
      teamKey: m.teamKey,
      label: m.raw,
    });
    cursor = Math.max(cursor, m.end);
  }
  if (cursor < text.length) {
    parts.push({ kind: "text", text: text.slice(cursor) });
  }
  return parts;
}

/** Split description into text + player + team parts for rendering. */
export function partitionTransactionDescription(
  description: string,
  resolutions: TransactionPlayerResolution[] = []
): DescriptionPart[] {
  const mentions = [...resolutions]
    .filter((r) => r.mention.end > r.mention.start)
    .sort((a, b) => a.mention.start - b.mention.start);

  const playerParts: DescriptionPart[] = [];
  let cursor = 0;
  for (const r of mentions) {
    if (r.mention.start < cursor) continue;
    if (r.mention.start > cursor) {
      playerParts.push(
        ...splitTextWithTeams(description.slice(cursor, r.mention.start))
      );
    }
    playerParts.push({ kind: "player", resolution: r });
    cursor = Math.max(cursor, r.mention.end);
  }
  if (cursor < description.length) {
    playerParts.push(...splitTextWithTeams(description.slice(cursor)));
  }
  return playerParts.length ? playerParts : [{ kind: "text", text: description }];
}

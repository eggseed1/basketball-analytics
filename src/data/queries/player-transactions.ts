import "server-only";

import { cache } from "react";

import {
  buildTransactionEventIndex,
  filterTransactionEvents,
} from "@/data/providers/transactions/transaction-event-index";
import { resolveTransactionPlayersInText } from "@/data/queries/transaction-player-resolve";
import { extractTransactionPlayerMentions } from "@/lib/transaction-player-extract";
import type { NbaTransactionEvent } from "@/data/types/transaction-event";

const DEFAULT_LIMIT = 8;
const SCAN_POOL = 150;

/** ESPN archive events that resolve to this player — newest first. */
export const getPlayerTransactionHistory = cache(
  async (
    playerId: string,
    playerName: string,
    options?: { limit?: number }
  ): Promise<NbaTransactionEvent[]> => {
    const limit = options?.limit ?? DEFAULT_LIMIT;
    const id = String(playerId ?? "").trim();
    const parts = playerName.trim().split(/\s+/).filter(Boolean);
    const lastName = parts[parts.length - 1];
    if (!id || !lastName || lastName.length < 2) return [];

    const index = await buildTransactionEventIndex();
    const candidates = filterTransactionEvents(index, { q: lastName })
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, SCAN_POOL);

    const verified: NbaTransactionEvent[] = [];
    for (const event of candidates) {
      if (!extractTransactionPlayerMentions(event.description).length) continue;
      const resolutions = await resolveTransactionPlayersInText(
        event.description,
        { teamId: event.teamId, season: event.season }
      );
      if (
        resolutions.some(
          (r) => r.status === "resolved" && r.playerId === id
        )
      ) {
        verified.push(event);
        if (verified.length >= limit) break;
      }
    }
    return verified;
  }
);

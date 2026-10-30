"use client";

import { useEffect, useState } from "react";

import type { PlayerGame } from "@/data/types";
import { isFinalStatus, isLiveLikeStatus, type GameStatusKind } from "@/lib/game-status";

const LIVE_BOX_POLL_MS = 12_000;

type BoxScoreResponse = {
  data?: { players?: PlayerGame[] };
  error?: string;
};

/**
 * Keep game-page player lines (top performers + box score) on the same live
 * payload. Full route refresh is slower and can leave the header ahead of the lab.
 * Disabled when the server already cut the box to a score delay.
 */
export function useLiveGamePlayers(
  gameId: string,
  initialPlayers: PlayerGame[],
  status: string,
  enabled: boolean
): PlayerGame[] {
  const [snapshot, setSnapshot] = useState({ gameId, initialPlayers, players: initialPlayers });
  const players = snapshot.gameId === gameId && snapshot.initialPlayers === initialPlayers
    ? snapshot.players : initialPlayers;

  useEffect(() => {
    if (!enabled) return;
    const kind = status as GameStatusKind;
    if (!isLiveLikeStatus(kind) || isFinalStatus(kind)) return;

    let cancelled = false;
    let inFlight = false;

    const pull = async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const res = await fetch(`/api/games/${encodeURIComponent(gameId)}/box-score`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = (await res.json()) as BoxScoreResponse;
        const next = body.data?.players;
        if (!cancelled && next?.length) setSnapshot({ gameId, initialPlayers, players: next });
      } catch {
        /* keep last good lines */
      } finally {
        inFlight = false;
      }
    };

    void pull();
    const id = window.setInterval(() => void pull(), LIVE_BOX_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [gameId, status, enabled, initialPlayers]);

  return players;
}

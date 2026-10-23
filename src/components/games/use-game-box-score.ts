"use client";

import { useEffect, useState } from "react";

import type { PlayerGame } from "@/data/types";

type BoxBody = {
  data?: { players?: PlayerGame[] };
  error?: string;
};

/**
 * Client box-score fetch for Game Lab when SSR missed roster lines (CDN timeout
 * or a poisoned page cache). Finals omit PBP from Flight and need names + totals.
 */
export function useGameBoxScore(
  gameId: string | undefined,
  options: { enabled?: boolean; initialPlayers?: PlayerGame[] } = {}
): { players: PlayerGame[]; loading: boolean } {
  const initial = options.initialPlayers ?? [];
  const enabled = Boolean(options.enabled) && initial.length === 0;
  const [players, setPlayers] = useState<PlayerGame[]>(initial);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!gameId || !enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const ac = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/games/${encodeURIComponent(gameId)}/box-score`,
          { signal: ac.signal, cache: "no-store" }
        );
        if (!res.ok) throw new Error(`box ${res.status}`);
        const body = (await res.json()) as BoxBody;
        const next = body.data?.players ?? [];
        if (!cancelled && next.length) setPlayers(next);
      } catch {
        // Keep empty; empty-state copy already explains the gap.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [gameId, enabled]);

  return { players: enabled ? players : initial, loading: enabled && loading };
}

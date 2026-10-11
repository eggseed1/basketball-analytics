"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import type { GameSummary } from "@/data/types";
import { isFinalStatus, isLiveLikeStatus } from "@/lib/game-status";
import {
  SCORE_DELAY_OPTIONS,
  maskGame,
  pickDelayed,
  readDelayedStatus,
  readScoreDelay,
  recordSnapshot,
  subscribeDelayedStatus,
  subscribeScoreDelay,
  type ScoreSnapshot,
} from "@/lib/score-delay";

const MAX_DELAY_MS = Math.max(...SCORE_DELAY_OPTIONS.map((o) => o.seconds)) * 1000;

const noopSubscribe = () => () => {};

export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** 0 on the server and during hydration, so server HTML always matches. */
export function useScoreDelaySeconds(): number {
  return useSyncExternalStore(subscribeScoreDelay, readScoreDelay, () => 0);
}

export function useDelayedStatus(gameId: string): GameSummary["status"] | undefined {
  return useSyncExternalStore(
    subscribeDelayedStatus,
    () => readDelayedStatus(gameId),
    () => undefined
  );
}

/**
 * Shows each game as it stood at least the chosen delay ago. Updates are
 * recorded while the delay is off too, so turning it on mid-game has history.
 */
export function useDelayedGames(games: GameSummary[]): GameSummary[] {
  const delayMs = useScoreDelaySeconds() * 1000;
  const history = useRef(new Map<string, ScoreSnapshot[]>());
  const [shown, setShown] = useState<ReadonlyMap<string, GameSummary | null>>(
    () => new Map()
  );

  useLayoutEffect(() => {
    const now = Date.now();
    for (const g of games) {
      const list = recordSnapshot(history.current.get(g.id), g, now);
      history.current.set(g.id, pickDelayed(list, now, MAX_DELAY_MS).list);
    }
    if (!delayMs) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const resolve = () => {
      const at = Date.now();
      const next = new Map<string, GameSummary | null>();
      let wake = Infinity;
      for (const g of games) {
        const picked = pickDelayed(history.current.get(g.id) ?? [], at, delayMs);
        next.set(g.id, picked.game);
        if (picked.nextAt != null) wake = Math.min(wake, picked.nextAt);
      }
      setShown(next);
      if (wake < Infinity) timer = setTimeout(resolve, Math.max(250, wake - at));
    };
    resolve();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [games, delayMs]);

  if (!delayMs) return games;
  return games.map((g) => {
    if (shown.has(g.id)) return shown.get(g.id) ?? maskGame(g);
    const risky = isLiveLikeStatus(g.status) || isFinalStatus(g.status) || g.status === "suspended";
    return risky ? maskGame(g) : g;
  });
}

/**
 * Wraps score UI so a CSS rule can hide it until the client applies the
 * delay. Without it, server-rendered live scores would show before hydration.
 */
export function ScoreDelayScope({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  return (
    <div data-score-scope="" data-delay-applied={hydrated ? "" : undefined} className="contents">
      {children}
    </div>
  );
}

"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { GameSummary } from "@/data/types";
import { isFinalStatus, isLiveLikeStatus } from "@/lib/game-status";
import {
  SCORE_DELAY_OPTIONS,
  insertSnapshot,
  maskGame,
  pickDelayed,
  pickDue,
  readScoreDelay,
  recordSnapshot,
  subscribeScoreDelay,
  type ScoreSnapshot,
  type Snapshot,
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

/**
 * When the server data inside a delayed section was fetched. Props from that
 * data are already late, so hooks below record them at this time, not at mount.
 */
const DelayAsOfContext = createContext<number | undefined>(undefined);

export function DelayAsOf({ at, children }: { at: number | undefined; children: ReactNode }) {
  return <DelayAsOfContext.Provider value={at}>{children}</DelayAsOfContext.Provider>;
}

export function useDelayAsOf(): number | undefined {
  return useContext(DelayAsOfContext);
}

type Delayed<T> = { due: Snapshot<T> | null; earliest: Snapshot<T> | null };

/**
 * Holds a changing value back by the chosen delay. `due` is the newest value
 * at least that old; `earliest` lets callers decide whether showing the first
 * value early is safe. With the delay off, `due` is always the current value.
 */
export function useDelayedValue<T>(value: T, at?: number): Delayed<T> & { delayMs: number } {
  const delayMs = useScoreDelaySeconds() * 1000;
  const history = useRef<Snapshot<T>[]>([]);
  const [state, setState] = useState<Delayed<T>>({ due: null, earliest: null });

  useLayoutEffect(() => {
    const now = Date.now();
    const list = insertSnapshot(history.current, value, at ?? now);
    history.current = pickDue(list, now, MAX_DELAY_MS).list;
    if (!delayMs) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const resolve = () => {
      const t = Date.now();
      const picked = pickDue(history.current, t, delayMs);
      setState({ due: picked.due, earliest: picked.earliest });
      if (picked.nextAt != null) timer = setTimeout(resolve, Math.max(250, picked.nextAt - t));
    };
    resolve();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [value, at, delayMs]);

  if (!delayMs) {
    const now = { at: at ?? 0, value };
    return { due: now, earliest: now, delayMs };
  }
  return { ...state, delayMs };
}

/**
 * Shows each game as it stood at least the chosen delay ago. Updates are
 * recorded while the delay is off too, so turning it on mid-game has history.
 */
export function useDelayedGames(games: GameSummary[]): GameSummary[] {
  const delayMs = useScoreDelaySeconds() * 1000;
  const asOf = useDelayAsOf();
  const history = useRef(new Map<string, ScoreSnapshot[]>());
  const [shown, setShown] = useState<ReadonlyMap<string, GameSummary | null>>(
    () => new Map()
  );

  useLayoutEffect(() => {
    const now = Date.now();
    for (const g of games) {
      const list = recordSnapshot(history.current.get(g.id), g, asOf ?? now);
      history.current.set(g.id, pickDue(list, now, MAX_DELAY_MS).list);
    }
    if (!delayMs) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const resolve = () => {
      const t = Date.now();
      const next = new Map<string, GameSummary | null>();
      let wake = Infinity;
      for (const g of games) {
        const picked = pickDelayed(history.current.get(g.id) ?? [], t, delayMs);
        next.set(g.id, picked.game);
        if (picked.nextAt != null) wake = Math.min(wake, picked.nextAt);
      }
      setShown(next);
      if (wake < Infinity) timer = setTimeout(resolve, Math.max(250, wake - t));
    };
    resolve();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [games, delayMs, asOf]);

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

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { GameSummary } from "@/data/types";
import { isFinalStatus, isLiveLikeStatus } from "@/lib/game-status";
import {
  SCORE_DELAY_MAX_SECONDS,
  insertSnapshot,
  maskGame,
  needsScoreMask,
  pickDelayed,
  pickDue,
  readScoreDelay,
  recordSnapshot,
  scoreProgressKey,
  subscribeScoreDelay,
  type ScoreSnapshot,
  type Snapshot,
} from "@/lib/score-delay";
import { eventsThrough, gameAtPoint, mergePoints, pointAt, type ScorePoint } from "@/lib/score-timeline";

const MAX_DELAY_MS = SCORE_DELAY_MAX_SECONDS * 1000;

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

const PLAYS_TICK_MS = 2_000;

/**
 * Polled plays the viewer may see: with a delay, those that happened at least
 * that long ago. Plays without times fall back to holding each poll for the delay.
 */
export function useDelayedPlays<E extends { wallMs?: number | null }>(events: E[] | null): E[] | null {
  const delayMs = useScoreDelaySeconds() * 1000;
  const held = useDelayedValue(events).due?.value ?? null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!delayMs || !events) return;
    const id = window.setInterval(() => setNow(Date.now()), PLAYS_TICK_MS);
    return () => window.clearInterval(id);
  }, [delayMs, events]);
  if (!delayMs || !events) return events;
  return eventsThrough(events, now - delayMs) ?? held;
}

const TIMELINE_POLL_MS = 10_000;
const TIMELINE_HIDDEN_POLL_MS = 60_000;
const TIMELINE_RETRY_MS = 2_500;
const TIMELINE_RETRIES = 4;

/**
 * Score points stamped with when each play happened, for live and recently
 * finished games. They let a delayed viewer see a game as it stood that long
 * ago from the first render instead of waiting out the delay.
 */
function useScoreTimelines(
  games: GameSummary[],
  delayMs: number
): ReadonlyMap<string, ScorePoint[]> {
  const [timelines, setTimelines] = useState<ReadonlyMap<string, ScorePoint[]>>(() => new Map());
  const candidates = delayMs
    ? games
        .filter((g) => isLiveLikeStatus(g.status) || isFinalStatus(g.status) || g.status === "suspended")
        .map((g) => `${g.id}|${isLiveLikeStatus(g.status) ? "live" : "done"}|${g.tipOffAt ?? ""}`)
        .sort()
        .join(",")
    : "";

  useEffect(() => {
    if (!candidates) return;
    const now = Date.now();
    const wanted = candidates.split(",").map((key) => {
      const [id, state, tip] = key.split("|");
      return { id: id!, live: state === "live", tipOffAt: tip || undefined };
    });
    const ids = wanted
      .filter((g) => needsScoreMask({ status: g.live ? "in_progress" : "final", tipOffAt: g.tipOffAt }, now))
      .map((g) => g.id);
    if (!ids.length) return;
    const anyLive = wanted.some((g) => g.live);

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const loaded = new Set<string>();
    let retries = 0;
    const load = async () => {
      try {
        const res = await fetch(`/api/scores/timeline?ids=${encodeURIComponent(ids.join(","))}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = (await res.json()) as { data?: Record<string, ScorePoint[]> };
        if (cancelled || !body.data) return;
        const fresh = body.data;
        for (const [id, points] of Object.entries(fresh)) if (points.length) loaded.add(id);
        setTimelines((prev) => {
          const next = new Map(prev);
          for (const [id, points] of Object.entries(fresh)) {
            if (points.length) next.set(id, mergePoints(prev.get(id) ?? [], points));
          }
          return next;
        });
      } catch {}
    };
    const loop = async () => {
      await load();
      if (cancelled) return;
      // A cold play-by-play fetch can miss the server's time budget; until a game has
      // a timeline it falls back to holding updates for the full delay.
      const missing = ids.some((id) => !loaded.has(id));
      if (missing && retries < TIMELINE_RETRIES) {
        retries += 1;
        timer = setTimeout(loop, TIMELINE_RETRY_MS);
        return;
      }
      if (!anyLive) return;
      const hidden = document.visibilityState === "hidden";
      timer = setTimeout(loop, hidden ? TIMELINE_HIDDEN_POLL_MS : TIMELINE_POLL_MS);
    };
    void loop();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [candidates]);

  return timelines;
}

function sameShown(
  a: ReadonlyMap<string, GameSummary | null>,
  b: ReadonlyMap<string, GameSummary | null>
): boolean {
  if (a.size !== b.size) return false;
  for (const [id, game] of b) {
    if (!a.has(id)) return false;
    const was = a.get(id) ?? null;
    if (was === game) continue;
    if (!was || !game || scoreProgressKey(was) !== scoreProgressKey(game)) return false;
  }
  return true;
}

/**
 * Shows each game as it stood the chosen delay ago. Play-by-play times place
 * the score exactly; without them, updates seen on this page are held back
 * instead, recorded while the delay is off too so turning it on mid-game has history.
 */
export function useDelayedGames(games: GameSummary[]): GameSummary[] {
  const delayMs = useScoreDelaySeconds() * 1000;
  const asOf = useDelayAsOf();
  const history = useRef(new Map<string, ScoreSnapshot[]>());
  const timelines = useScoreTimelines(games, delayMs);
  const [shown, setShown] = useState<ReadonlyMap<string, GameSummary | null>>(
    () => new Map()
  );
  const shownRef = useRef(shown);

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
        const points = timelines.get(g.id);
        if (points?.length) {
          const { point, nextAt } = pointAt(points, t - delayMs);
          next.set(g.id, point?.status === "final" && isFinalStatus(g.status) ? g : gameAtPoint(g, point));
          if (nextAt != null) wake = Math.min(wake, nextAt + delayMs);
          continue;
        }
        const picked = pickDelayed(history.current.get(g.id) ?? [], t, delayMs);
        next.set(g.id, picked.game);
        if (picked.nextAt != null) wake = Math.min(wake, picked.nextAt);
      }
      // `games` can arrive as a new array with the same content on every render;
      // skipping the update then stops this effect from re-rendering itself forever.
      if (!sameShown(shownRef.current, next)) {
        shownRef.current = next;
        setShown(next);
      }
      if (wake < Infinity) timer = setTimeout(resolve, Math.max(250, wake - t));
    };
    resolve();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [games, delayMs, asOf, timelines]);

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

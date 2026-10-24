"use client";

import { useEffect, useRef, useState } from "react";

import type { PlayByPlayEvent } from "@/data/types";
import {
  elapsedGameSeconds,
  isFinalStatus,
  isLiveLikeStatus,
  type GameStatusKind,
} from "@/lib/game-status";
import { resolveRefreshIntervalMs } from "@/lib/live-refresh-policy";

const LIVE_PLAYS_POLL_MS = 10_000;

function lastElapsed(events: readonly PlayByPlayEvent[]): number {
  let best = -1;
  for (const e of events) {
    const t = elapsedGameSeconds(e.period, e.clockSeconds);
    if (t > best) best = t;
  }
  return best;
}

/** True when `next` reaches further into the game than `prev` (or has more plays). */
export function playByPlayIsFresher(
  next: readonly PlayByPlayEvent[],
  prev: readonly PlayByPlayEvent[]
): boolean {
  if (!next.length) return false;
  if (!prev.length) return true;
  const nextT = lastElapsed(next);
  const prevT = lastElapsed(prev);
  if (nextT !== prevT) return nextT > prevT;
  return next.length > prev.length;
}

/**
 * Keep Game Lab charts and insights on the live play feed. The scoreboard
 * header already polls on its own; without this, the lab body stays on the
 * server snapshot until a full route refresh and can trail by a full quarter.
 */
export function useLiveGamePlayByPlay(
  gameId: string,
  initialEvents: PlayByPlayEvent[],
  status: string,
  enabled: boolean
): PlayByPlayEvent[] {
  const [events, setEvents] = useState(initialEvents);
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    setEvents((prev) =>
      playByPlayIsFresher(initialEvents, prev) ? initialEvents : prev
    );
  }, [initialEvents]);

  useEffect(() => {
    if (!enabled) return;
    const kind = status as GameStatusKind;
    const live = isLiveLikeStatus(kind);
    const final = isFinalStatus(kind);
    // Finals: one-shot hydrate when SSR omitted PBP to keep Flight HTML slim.
    // Live: keep polling.
    if (!live && !(final && initialEvents.length === 0)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(
          `/api/games/${encodeURIComponent(gameId)}/play-by-play`,
          { cache: "no-store" }
        );
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as {
          data?: { events?: PlayByPlayEvent[] };
        };
        const next = body.data?.events;
        if (!next?.length || cancelled) return;
        if (playByPlayIsFresher(next, eventsRef.current)) {
          setEvents(next);
        }
      } catch {
        /* keep last good set */
      }
    };

    if (final) {
      void poll();
      return () => {
        cancelled = true;
      };
    }

    const schedule = () => {
      if (cancelled) return;
      const hidden = document.visibilityState === "hidden";
      const interval = hidden
        ? (resolveRefreshIntervalMs(["in_progress"], { documentHidden: true }) ??
          60_000)
        : LIVE_PLAYS_POLL_MS;
      timer = setTimeout(async () => {
        await poll();
        schedule();
      }, interval);
    };

    void poll().then(schedule);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [gameId, status, enabled, initialEvents.length]);

  return events;
}

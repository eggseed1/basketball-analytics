"use client";

import { useEffect, useState } from "react";

import type { PlayByPlayEvent } from "@/data/types/play-by-play";
import { resolveRefreshIntervalMs } from "@/lib/live-refresh-policy";

const LIVE_PLAYS_POLL_MS = 10_000;

type PlayByPlayBody = {
  data?: { events?: PlayByPlayEvent[]; source?: string };
  source?: string;
};

type LoadedPlays = {
  events: PlayByPlayEvent[];
  source: string | null;
};

async function fetchPlayByPlay(gameId: string): Promise<LoadedPlays | null> {
  const res = await fetch(`/api/games/${encodeURIComponent(gameId)}/play-by-play`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = (await res.json()) as PlayByPlayBody;
  const events = body.data?.events ?? [];
  return {
    events,
    source: body.source ?? body.data?.source ?? null,
  };
}

/**
 * Client play-by-play for Game Lab. Keeps the full event list out of RSC/Flight
 * HTML (~200KB+ JSON / ~0.5MB+ inlined) and loads it after first paint.
 */
export function useGamePlayByPlay(
  gameId: string | undefined,
  options: { live?: boolean; initial?: PlayByPlayEvent[] } = {}
): { events: PlayByPlayEvent[]; source: string | null; loading: boolean } {
  const initial = options.initial ?? [];
  const live = Boolean(options.live);
  const [polled, setPolled] = useState<LoadedPlays | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!gameId) return;
    // Finals with empty SSR need an immediate fetch. Live games already have
    // SSR events — poll in the background so first paint is not a blank lab.
    const needsImmediate = initial.length === 0;
    if (!needsImmediate && !live) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const next = await fetchPlayByPlay(gameId);
        if (cancelled) return;
        if (!next) {
          if (needsImmediate) setFailed(true);
          return;
        }
        setPolled((prev) => {
          const baseline = prev?.events.length ?? initial.length;
          if (next.events.length < baseline) return prev;
          return next;
        });
        setFailed(false);
      } catch {
        if (!cancelled && needsImmediate) setFailed(true);
      }
    };

    const schedule = () => {
      if (cancelled || !live) return;
      const hidden =
        typeof document !== "undefined" && document.visibilityState === "hidden";
      const interval = hidden
        ? resolveRefreshIntervalMs(["in_progress"], { documentHidden: true }) ?? 60_000
        : LIVE_PLAYS_POLL_MS;
      timer = setTimeout(async () => {
        await poll();
        schedule();
      }, interval);
    };

    if (needsImmediate) {
      void poll().then(() => {
        if (live) schedule();
      });
    } else {
      // Live with SSR plays: first poll after a beat so paint stays snappy.
      timer = setTimeout(() => {
        void poll().then(schedule);
      }, 2_000);
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [gameId, live, initial.length]);

  const events =
    polled && polled.events.length >= initial.length ? polled.events : initial;
  const source = polled?.source ?? null;
  const loading = Boolean(gameId) && !polled && !failed && initial.length === 0;

  return { events, source, loading };
}

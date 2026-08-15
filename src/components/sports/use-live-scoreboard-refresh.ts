"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { GameSummary } from "@/data/types";
import type { GameStatusKind } from "@/lib/game-status";
import {
  createLiveRefreshDiagnostics,
  logLiveRefreshDiagnostics,
  needsLivePolling,
  resolveRefreshIntervalMs,
  type LiveRefreshDiagnostics,
} from "@/lib/live-refresh-policy";

type LiveApiResponse = {
  retrievedAt?: string;
  data?: GameSummary[];
  error?: string;
};

function mergeById(
  prev: GameSummary[],
  updates: GameSummary[]
): GameSummary[] {
  if (!updates.length) return prev;
  const map = new Map(updates.map((g) => [g.id, g]));
  return prev.map((g) => {
    const next = map.get(g.id);
    if (!next) return g;
    return {
      ...g,
      status: next.status ?? g.status,
      homeScore: next.homeScore,
      awayScore: next.awayScore,
      period: next.period ?? g.period,
      displayClock: next.displayClock ?? g.displayClock,
      statusDetail: next.statusDetail ?? g.statusDetail,
      tipOffAt: next.tipOffAt ?? g.tipOffAt,
      retrievedAt: next.retrievedAt ?? g.retrievedAt,
    };
  });
}

/**
 * One timer for a set of scoreboard games — never N independent loops.
 * Polls `/api/scores/live` in a batch; stops when all games are final/cancelled.
 */
export function useLiveScoreboardRefresh(
  initialGames: GameSummary[],
  options?: { season?: string; enabled?: boolean }
): {
  games: GameSummary[];
  lastRetrievedAt: string | null;
  failureStreak: number;
  diagnostics: LiveRefreshDiagnostics;
} {
  const [games, setGames] = useState(initialGames);
  const [lastRetrievedAt, setLastRetrievedAt] = useState<string | null>(null);
  const [failureStreak, setFailureStreak] = useState(0);
  const diagnostics = useRef(createLiveRefreshDiagnostics());
  const gamesRef = useRef(games);
  const failureRef = useRef(0);
  gamesRef.current = games;
  failureRef.current = failureStreak;

  const initialKey = initialGames.map((g) => g.id).join(",");
  useEffect(() => {
    setGames(initialGames);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key encodes identity
  }, [initialKey]);

  const enabled = options?.enabled !== false;
  const season = options?.season;

  const poll = useCallback(async (force: boolean) => {
    const current = gamesRef.current;
    const ids = current
      .filter((g) => needsLivePolling(g.status as GameStatusKind))
      .map((g) => g.id);
    if (!ids.length) return;

    diagnostics.current.polls += 1;
    diagnostics.current.activeGameCount = ids.length;

    const params = new URLSearchParams();
    if (season) params.set("season", season);
    if (force) params.set("force", "1");
    params.set("ids", ids.join(","));

    try {
      const res = await fetch(`/api/scores/live?${params.toString()}`, {
        cache: "no-store",
      });
      const body = (await res.json()) as LiveApiResponse;
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      const updates = body.data ?? [];
      setGames((prev) => mergeById(prev, updates));
      if (body.retrievedAt) setLastRetrievedAt(body.retrievedAt);
      failureRef.current = 0;
      setFailureStreak(0);
      diagnostics.current.successes += 1;
      diagnostics.current.lastError = null;
    } catch (err) {
      failureRef.current += 1;
      setFailureStreak(failureRef.current);
      diagnostics.current.failures += 1;
      diagnostics.current.lastError =
        err instanceof Error ? err.message : "refresh failed";
    } finally {
      logLiveRefreshDiagnostics("scoreboard", diagnostics.current);
    }
  }, [season]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = () => {
      if (cancelled) return;
      const statuses = gamesRef.current.map(
        (g) => g.status as GameStatusKind | undefined
      );
      const hidden =
        typeof document !== "undefined"
          ? document.visibilityState === "hidden"
          : false;
      const interval = resolveRefreshIntervalMs(statuses, {
        documentHidden: hidden,
        failureStreak: failureRef.current,
      });
      diagnostics.current.lastIntervalMs = interval;
      if (interval == null) return;

      timer = setTimeout(async () => {
        await poll(false);
        scheduleNext();
      }, interval);
    };

    const boot = setTimeout(() => {
      void poll(false).then(scheduleNext);
    }, 2_000);

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      void poll(true).then(scheduleNext);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearTimeout(boot);
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, poll]);

  return {
    games,
    lastRetrievedAt,
    failureStreak,
    diagnostics: diagnostics.current,
  };
}

export function useLiveGameRefresh(
  initial: GameSummary | null,
  options?: { season?: string; enabled?: boolean }
): {
  game: GameSummary | null;
  failureStreak: number;
} {
  const list = initial ? [initial] : [];
  const { games, failureStreak } = useLiveScoreboardRefresh(list, {
    season: options?.season ?? initial?.season,
    enabled: options?.enabled !== false && Boolean(initial),
  });
  return { game: games[0] ?? initial, failureStreak };
}

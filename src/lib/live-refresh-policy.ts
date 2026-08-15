/**
 * Live refresh cadence + freshness policy.
 * Does not change canonical game status — only how often we ask the provider.
 *
 * Thresholds (ms) are documented for ops; adjust carefully vs ESPN rate limits.
 */

import type { GameStatusKind } from "@/lib/game-status";
import {
  isFinalStatus,
  isLiveLikeStatus,
  isPreTipStatus,
  isTerminalNonFinalStatus,
} from "@/lib/game-status";

/** Provider day-scoreboard memory cache TTL for live path. */
export const LIVE_SCOREBOARD_TTL_MS = 15_000;

/** Cadence when at least one visible game is in this status. */
export const REFRESH_INTERVAL_MS: Record<GameStatusKind, number | null> = {
  scheduled: 120_000,
  pregame: 90_000,
  in_progress: 20_000,
  halftime: 45_000,
  period_break: 30_000,
  final: null,
  postponed: null,
  cancelled: null,
  suspended: 120_000,
  delayed: 60_000,
  unknown: 90_000,
};

/** Soft: emphasize “updated Xs ago”. Hard: show Updating… — status unchanged. */
export const FRESHNESS_SOFT_MS = 45_000;
export const FRESHNESS_HARD_MS = 90_000;

/** Consecutive failures → stepped backoff (ms). */
export const REFRESH_BACKOFF_MS = [20_000, 40_000, 90_000, 180_000] as const;

/** Slow down when the browser tab is hidden. */
export const HIDDEN_TAB_INTERVAL_MULTIPLIER = 3;

export type FreshnessBand = "fresh" | "aging" | "stale" | "unknown";

export function refreshIntervalForStatus(
  status: GameStatusKind | undefined
): number | null {
  if (status == null) return REFRESH_INTERVAL_MS.unknown;
  return REFRESH_INTERVAL_MS[status];
}

/**
 * For a set of visible games, pick the most urgent (shortest) positive interval.
 * Returns null when every game is terminal / final (stop aggressive polling).
 */
export function resolveRefreshIntervalMs(
  statuses: Array<GameStatusKind | undefined>,
  options?: { documentHidden?: boolean; failureStreak?: number }
): number | null {
  let best: number | null = null;
  for (const s of statuses) {
    const ms = refreshIntervalForStatus(s);
    if (ms == null) continue;
    if (best == null || ms < best) best = ms;
  }
  if (best == null) return null;

  const streak = options?.failureStreak ?? 0;
  if (streak > 0) {
    const idx = Math.min(streak - 1, REFRESH_BACKOFF_MS.length - 1);
    best = Math.max(best, REFRESH_BACKOFF_MS[idx]!);
  }

  if (options?.documentHidden) {
    best = best * HIDDEN_TAB_INTERVAL_MULTIPLIER;
  }
  return best;
}

export function shouldStopAggressiveRefresh(
  status: GameStatusKind | undefined
): boolean {
  return (
    isFinalStatus(status) ||
    status === "postponed" ||
    status === "cancelled"
  );
}

export function needsLivePolling(status: GameStatusKind | undefined): boolean {
  if (shouldStopAggressiveRefresh(status)) return false;
  return (
    isLiveLikeStatus(status) ||
    isPreTipStatus(status) ||
    status === "delayed" ||
    status === "suspended" ||
    status === "unknown"
  );
}

export function freshnessBand(
  retrievedAt: string | null | undefined,
  nowMs: number = Date.now()
): FreshnessBand {
  if (!retrievedAt) return "unknown";
  const t = Date.parse(retrievedAt);
  if (!Number.isFinite(t)) return "unknown";
  const age = nowMs - t;
  if (age < FRESHNESS_SOFT_MS) return "fresh";
  if (age < FRESHNESS_HARD_MS) return "aging";
  return "stale";
}

export function formatFreshnessLabel(
  retrievedAt: string | null | undefined,
  nowMs: number = Date.now()
): string | null {
  if (!retrievedAt) return null;
  const t = Date.parse(retrievedAt);
  if (!Number.isFinite(t)) return null;
  const ageSec = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (ageSec < 5) return "Updated just now";
  if (ageSec < 60) return `Updated ${ageSec}s ago`;
  const min = Math.floor(ageSec / 60);
  if (min < 60) return `Updated ${min}m ago`;
  return `Updated ${Math.floor(min / 60)}h ago`;
}

export function mergeLiveGameOverlay<T extends { id: string }>(
  current: T,
  overlay: Partial<T> & { id: string }
): T {
  if (overlay.id !== current.id) return current;
  return { ...current, ...overlay };
}

/** Dev-only counters — never shown to end users. */
export type LiveRefreshDiagnostics = {
  polls: number;
  successes: number;
  failures: number;
  cacheHints: number;
  lastIntervalMs: number | null;
  lastError: string | null;
  activeGameCount: number;
};

export function createLiveRefreshDiagnostics(): LiveRefreshDiagnostics {
  return {
    polls: 0,
    successes: 0,
    failures: 0,
    cacheHints: 0,
    lastIntervalMs: null,
    lastError: null,
    activeGameCount: 0,
  };
}

export function logLiveRefreshDiagnostics(
  scope: string,
  d: LiveRefreshDiagnostics
): void {
  if (process.env.NODE_ENV === "production") return;
  // eslint-disable-next-line no-console
  console.debug(`[live-refresh:${scope}]`, { ...d });
}

export function isTerminalNonPollingStatus(
  status: GameStatusKind | undefined
): boolean {
  return shouldStopAggressiveRefresh(status) || isTerminalNonFinalStatus(status);
}

/**
 * "New since your last visit" for home feed items. Each id keeps the first
 * and last time this browser showed it; an item is new when it first showed
 * during the current visit and the browser has been here before.
 */

const SEEN_KEY = "drbl-seen-v1";
const VISIT_KEY = "drbl-visit-v1";
/** Idle gap that starts a new visit. */
const VISIT_GAP_MS = 30 * 60 * 1000;
/** Ids not shown for this long are dropped. */
const FORGET_MS = 45 * 24 * 60 * 60 * 1000;
const MAX_IDS = 3000;

type SeenMap = Record<string, [first: number, last: number]>;
export type Visit = { start: number; lastActive: number; returning: boolean };

export function nextVisit(prev: Visit | null, seenCount: number, now: number): Visit {
  if (prev && now - prev.lastActive < VISIT_GAP_MS) return { ...prev, lastActive: now };
  return { start: now, lastActive: now, returning: seenCount > 0 };
}

export function isNewInVisit(seen: SeenMap, visit: Visit, id: string): boolean {
  if (!visit.returning) return false;
  const first = seen[id]?.[0];
  return first == null || first >= visit.start;
}

export function recordSeen(seen: SeenMap, ids: readonly string[], now: number): SeenMap {
  const next: SeenMap = {};
  for (const [id, pair] of Object.entries(seen)) {
    if (now - pair[1] < FORGET_MS) next[id] = pair;
  }
  for (const id of ids) next[id] = [next[id]?.[0] ?? now, now];
  const entries = Object.entries(next);
  if (entries.length <= MAX_IDS) return next;
  entries.sort((a, b) => b[1][1] - a[1][1]);
  return Object.fromEntries(entries.slice(0, MAX_IDS));
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

let seenCache: SeenMap | null = null;
let visitCache: Visit | null = null;

function loaded(): { seen: SeenMap; visit: Visit } {
  if (seenCache && visitCache) return { seen: seenCache, visit: visitCache };
  const seen = readJson<SeenMap>(SEEN_KEY) ?? {};
  const visit = nextVisit(readJson<Visit>(VISIT_KEY), Object.keys(seen).length, Date.now());
  try {
    localStorage.setItem(VISIT_KEY, JSON.stringify(visit));
  } catch {
    // Storage full or blocked: tags just don't show.
  }
  seenCache = seen;
  visitCache = visit;
  return { seen, visit };
}

export function isNewSinceLastVisit(id: string): boolean {
  try {
    const { seen, visit } = loaded();
    return isNewInVisit(seen, visit, id);
  } catch {
    return false;
  }
}

let pending: string[] = [];

/** Batched so a page of tags writes storage once. */
export function markSeen(id: string): void {
  pending.push(id);
  if (pending.length > 1) return;
  queueMicrotask(() => {
    const ids = pending;
    pending = [];
    try {
      const { seen } = loaded();
      seenCache = recordSeen(seen, ids, Date.now());
      localStorage.setItem(SEEN_KEY, JSON.stringify(seenCache));
    } catch {
      // Storage full or blocked.
    }
  });
}

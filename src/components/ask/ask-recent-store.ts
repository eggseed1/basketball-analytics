/**
 * External store for ASK DRBL recent queries.
 *
 * useSyncExternalStore requires: same store state → same snapshot reference.
 * Snapshots are only replaced when the store actually changes.
 */

export const ASK_RECENT_STORAGE_KEY = "ask-drbl-recent-v1.1";

const RECENT_EVENT = "ask-drbl-recent";

export type AskRecentEntry = {
  q: string;
  title: string;
  status?: string;
  at: number;
};

/** Stable empty snapshot — never allocate a new [] for getServerSnapshot / empty. */
export const EMPTY_ASK_RECENT: readonly AskRecentEntry[] = Object.freeze([]);

let cachedSnapshot: AskRecentEntry[] = EMPTY_ASK_RECENT as AskRecentEntry[];
let hasReadFromStorage = false;

function parseRecent(raw: string | null): AskRecentEntry[] {
  if (!raw) return EMPTY_ASK_RECENT as AskRecentEntry[];
  try {
    const parsed = JSON.parse(raw) as AskRecentEntry[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return EMPTY_ASK_RECENT as AskRecentEntry[];
    }
    return parsed.slice(0, 8);
  } catch {
    return EMPTY_ASK_RECENT as AskRecentEntry[];
  }
}

function readFromLocalStorage(): AskRecentEntry[] {
  if (typeof window === "undefined") {
    return EMPTY_ASK_RECENT as AskRecentEntry[];
  }
  return parseRecent(window.localStorage.getItem(ASK_RECENT_STORAGE_KEY));
}

function commitSnapshot(next: AskRecentEntry[]): AskRecentEntry[] {
  cachedSnapshot =
    next.length === 0 ? (EMPTY_ASK_RECENT as AskRecentEntry[]) : next;
  hasReadFromStorage = true;
  return cachedSnapshot;
}

function notifySubscribers() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(RECENT_EVENT));
}

/** SSR / server snapshot — stable forever. */
export function getServerAskRecent(): AskRecentEntry[] {
  return EMPTY_ASK_RECENT as AskRecentEntry[];
}

/**
 * Client snapshot for useSyncExternalStore.
 * Returns the same array reference until the store changes.
 */
export function getAskRecentSnapshot(): AskRecentEntry[] {
  if (typeof window === "undefined") {
    return EMPTY_ASK_RECENT as AskRecentEntry[];
  }
  if (!hasReadFromStorage) {
    commitSnapshot(readFromLocalStorage());
  }
  return cachedSnapshot;
}

export function pushAskRecent(entry: AskRecentEntry): void {
  if (typeof window === "undefined") return;
  const current = getAskRecentSnapshot();
  const next = [entry, ...current.filter((x) => x.q !== entry.q)].slice(0, 8);
  window.localStorage.setItem(ASK_RECENT_STORAGE_KEY, JSON.stringify(next));
  commitSnapshot(next);
  notifySubscribers();
}

export function clearAskRecent(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ASK_RECENT_STORAGE_KEY);
  commitSnapshot(EMPTY_ASK_RECENT as AskRecentEntry[]);
  notifySubscribers();
}

export function subscribeAskRecent(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onCustom = () => onStoreChange();

  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== ASK_RECENT_STORAGE_KEY) return;
    // Another tab/window changed localStorage — refresh cache, then notify.
    commitSnapshot(readFromLocalStorage());
    onStoreChange();
  };

  window.addEventListener(RECENT_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(RECENT_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

/** Test / diagnostics: reset in-memory cache without touching localStorage. */
export function __resetAskRecentStoreForTests(): void {
  cachedSnapshot = EMPTY_ASK_RECENT as AskRecentEntry[];
  hasReadFromStorage = false;
}

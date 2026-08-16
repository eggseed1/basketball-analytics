/**
 * Snapshot-identity regression for ASK recent external store.
 * useSyncExternalStore requires: same store state → same snapshot reference.
 */
import assert from "node:assert/strict";

import {
  ASK_RECENT_STORAGE_KEY,
  EMPTY_ASK_RECENT,
  __resetAskRecentStoreForTests,
  clearAskRecent,
  getAskRecentSnapshot,
  getServerAskRecent,
  pushAskRecent,
  subscribeAskRecent,
} from "../src/components/ask/ask-recent-store";

function installMemoryLocalStorage() {
  const map = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
  };
  const listeners = new Map<string, Set<(event?: Event) => void>>();
  const windowMock = {
    localStorage: storage,
    addEventListener(type: string, handler: (event?: Event) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(handler);
    },
    removeEventListener(type: string, handler: (event?: Event) => void) {
      listeners.get(type)?.delete(handler);
    },
    dispatchEvent(event: Event) {
      const set = listeners.get(event.type);
      if (set) for (const handler of set) handler(event);
      return true;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: windowMock,
    configurable: true,
  });
}

function main() {
  // Server snapshot stability (no window required)
  __resetAskRecentStoreForTests();
  const s1 = getServerAskRecent();
  const s2 = getServerAskRecent();
  assert.equal(s1, s2, "getServerAskRecent must return same reference");
  assert.equal(s1, EMPTY_ASK_RECENT, "server snapshot must be EMPTY_ASK_RECENT");

  installMemoryLocalStorage();
  __resetAskRecentStoreForTests();

  const a = getAskRecentSnapshot();
  const b = getAskRecentSnapshot();
  assert.equal(a, b, "getAskRecentSnapshot must cache until store changes");
  assert.equal(a, EMPTY_ASK_RECENT, "empty client snapshot uses EMPTY_ASK_RECENT");

  let notifyCount = 0;
  const unsub = subscribeAskRecent(() => {
    notifyCount += 1;
  });

  pushAskRecent({
    q: "What was Jokic's TS% in 2024-25?",
    title: "Jokic TS%",
    status: "ok",
    at: 1,
  });
  const afterPush = getAskRecentSnapshot();
  assert.notEqual(afterPush, a, "push must allocate a new snapshot");
  assert.equal(getAskRecentSnapshot(), afterPush, "stable after push");
  assert.equal(afterPush.length, 1);
  assert.equal(afterPush[0]?.q, "What was Jokic's TS% in 2024-25?");
  assert.equal(
    globalThis.localStorage.getItem(ASK_RECENT_STORAGE_KEY) != null,
    true,
    "persists to localStorage"
  );
  assert.ok(notifyCount >= 1, "subscribers notified on push");

  pushAskRecent({
    q: "Compare Boston and OKC",
    title: "BOS vs OKC",
    status: "ok",
    at: 2,
  });
  const afterSecond = getAskRecentSnapshot();
  assert.notEqual(afterSecond, afterPush);
  assert.equal(afterSecond.length, 2);
  assert.equal(afterSecond[0]?.q, "Compare Boston and OKC");
  assert.equal(getAskRecentSnapshot(), afterSecond);

  clearAskRecent();
  const afterClear = getAskRecentSnapshot();
  assert.equal(afterClear, EMPTY_ASK_RECENT);
  assert.equal(getAskRecentSnapshot(), afterClear);
  assert.equal(globalThis.localStorage.getItem(ASK_RECENT_STORAGE_KEY), null);

  unsub();
  console.log("test-ask-recent-store: ok");
}

main();

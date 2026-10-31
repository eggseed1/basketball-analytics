import assert from "node:assert/strict";
import test from "node:test";

import { loadGameShellWithFallback } from "./game-shell-loading";

const current = { id: "known", source: "provider", score: 128 };
const snapshot = { id: "known", source: "snapshot", score: 126 };
const remote = { id: "other", source: "cdn", score: 110 };
const never = () => new Promise<null>(() => {});

test("fresh provider data wins over a snapshot without starting either fallback", async () => {
  const calls: string[] = [];
  const shell = await loadGameShellWithFallback({
    primary: async () => { calls.push("provider"); return current; },
    snapshot: async () => { calls.push("snapshot"); return snapshot; },
    fallback: async () => { calls.push("cdn"); return remote; },
  });
  assert.equal(shell, current);
  assert.deepEqual(calls, ["provider"]);
});

test("a pending provider cannot hide a known game behind the same stalled CDN request", async () => {
  let finishPrimary!: (value: typeof current) => void;
  const pending = new Promise<typeof current>((resolve) => { finishPrimary = resolve; });
  let remoteCalls = 0;
  const shell = await loadGameShellWithFallback({
    primary: () => pending,
    snapshot: async () => snapshot,
    fallback: async () => { remoteCalls++; return pending; },
    primaryMs: 5,
    fallbackMs: 5,
  });
  assert.equal(shell, snapshot);
  assert.equal(remoteCalls, 0);
  finishPrimary(current);
  await pending;
  assert.equal(shell, snapshot, "late provider completion cannot replace the returned snapshot");
});

test("provider failure still resolves a known snapshot", async () => {
  const shell = await loadGameShellWithFallback({
    primary: async () => { throw new Error("upstream unavailable"); },
    snapshot: async () => snapshot,
    fallback: never,
  });
  assert.equal(shell, snapshot);
});

test("a snapshot miss or failure still tries the independent remote fallback", async () => {
  for (const local of [async () => null, async () => { throw new Error("asset unavailable"); }]) {
    const shell = await loadGameShellWithFallback({
      primary: async () => null,
      snapshot: local,
      fallback: async () => remote,
    });
    assert.equal(shell, remote);
  }
});

test("an unknown game stays missing when every source misses or fails", async () => {
  for (const fallback of [async () => null, async () => { throw new Error("cdn unavailable"); }]) {
    assert.equal(await loadGameShellWithFallback({
      primary: async () => null,
      snapshot: async () => null,
      fallback,
    }), null);
  }
});

test("the fallback budget bounds a stalled snapshot and remote request", async () => {
  for (const local of [never, async () => null]) {
    assert.equal(await loadGameShellWithFallback({
      primary: async () => null,
      snapshot: local,
      fallback: never,
      fallbackMs: 5,
    }), null);
  }
});

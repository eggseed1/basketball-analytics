/**
 * ASSETS loaders must not sticky-cache a null miss for the isolate lifetime.
 * Simulates: first ensure fails → second ensure can succeed.
 *
 * Regression: clearing `inflight` inside an async IIFE `finally` runs BEFORE
 * the outer `inflight = pending` assignment when the body has no await, leaving
 * a settled miss stuck forever.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("ASSETS miss retry contract", () => {
  it("retries after a transient miss (promise.finally clear)", async () => {
    let attempts = 0;
    let cached: { ok: true } | undefined;
    let inflight: Promise<boolean> | null = null;

    async function ensure(): Promise<boolean> {
      if (cached != null) return true;
      if (inflight) return inflight;
      const pending = (async () => {
        attempts += 1;
        if (attempts === 1) return false;
        cached = { ok: true };
        return true;
      })();
      inflight = pending;
      void pending.finally(() => {
        if (inflight === pending) inflight = null;
      });
      return pending;
    }

    assert.equal(await ensure(), false);
    assert.equal(cached, undefined);
    assert.equal(await ensure(), true);
    assert.equal(await ensure(), true);
    assert.equal(attempts, 2);
  });

  it("broken async-finally clear leaves a stuck miss (document anti-pattern)", async () => {
    let attempts = 0;
    let inflight: Promise<boolean> | null = null;

    async function brokenEnsure(): Promise<boolean> {
      if (inflight) return inflight;
      inflight = (async () => {
        try {
          attempts += 1;
          return false;
        } finally {
          inflight = null;
        }
      })();
      return inflight;
    }

    assert.equal(await brokenEnsure(), false);
    // Outer assignment re-sticks the settled promise after finally cleared it.
    assert.equal(await brokenEnsure(), false);
    assert.equal(attempts, 1);
  });
});

/**
 * Live refresh policy tests.
 * Run: npx tsx scripts/test-live-refresh.ts
 */
import assert from "node:assert/strict";

import {
  FRESHNESS_HARD_MS,
  FRESHNESS_SOFT_MS,
  REFRESH_INTERVAL_MS,
  freshnessBand,
  formatFreshnessLabel,
  needsLivePolling,
  resolveRefreshIntervalMs,
  shouldStopAggressiveRefresh,
} from "../src/lib/live-refresh-policy";

function main() {
  // Cadence by status
  assert.equal(REFRESH_INTERVAL_MS.in_progress, 20_000);
  assert.equal(REFRESH_INTERVAL_MS.halftime, 45_000);
  assert.equal(REFRESH_INTERVAL_MS.scheduled, 120_000);
  assert.equal(REFRESH_INTERVAL_MS.final, null);
  assert.equal(REFRESH_INTERVAL_MS.postponed, null);
  assert.equal(REFRESH_INTERVAL_MS.cancelled, null);

  // Multi-game: most urgent wins; one interval not N timers
  {
    const ms = resolveRefreshIntervalMs([
      "scheduled",
      "in_progress",
      "final",
    ]);
    assert.equal(ms, 20_000);
  }
  {
    const ms = resolveRefreshIntervalMs(["halftime", "scheduled"]);
    assert.equal(ms, 45_000);
  }
  {
    const ms = resolveRefreshIntervalMs(["final", "cancelled"]);
    assert.equal(ms, null);
  }

  // Hidden tab slows cadence
  {
    const ms = resolveRefreshIntervalMs(["in_progress"], {
      documentHidden: true,
    });
    assert.equal(ms, 20_000 * 3);
  }

  // Backoff on failures
  {
    const ms = resolveRefreshIntervalMs(["in_progress"], {
      failureStreak: 3,
    });
    assert.ok(ms != null && ms >= 90_000);
  }

  // Finalization
  assert.equal(shouldStopAggressiveRefresh("final"), true);
  assert.equal(shouldStopAggressiveRefresh("in_progress"), false);
  assert.equal(needsLivePolling("final"), false);
  assert.equal(needsLivePolling("in_progress"), true);
  assert.equal(needsLivePolling("scheduled"), true);

  // Stale freshness - status is independent
  {
    const now = Date.now();
    assert.equal(
      freshnessBand(new Date(now - 10_000).toISOString(), now),
      "fresh"
    );
    assert.equal(
      freshnessBand(new Date(now - FRESHNESS_SOFT_MS - 1).toISOString(), now),
      "aging"
    );
    assert.equal(
      freshnessBand(new Date(now - FRESHNESS_HARD_MS - 1).toISOString(), now),
      "stale"
    );
    const label = formatFreshnessLabel(
      new Date(now - 12_000).toISOString(),
      now
    );
    assert.match(label ?? "", /12s/);
  }

  // Recovery: failure streak 0 returns base cadence
  {
    assert.equal(
      resolveRefreshIntervalMs(["in_progress"], { failureStreak: 0 }),
      20_000
    );
  }

  console.log("test-live-refresh: all assertions passed");
}

main();

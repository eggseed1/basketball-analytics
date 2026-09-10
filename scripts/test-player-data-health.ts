/**
 * Deterministic player-board health / provider guardrail tests (no network).
 * Run: npx tsx scripts/test-player-data-health.ts
 */
import assert from "node:assert/strict";

import {
  assessPlayerBoardHealth,
  formatPlayerBoardHealthReport,
} from "../src/data/diagnostics/player-board-health";
import {
  LOCAL_SAMPLE_PLAYER_COUNT,
  LOCAL_SAMPLE_PLAYER_SEASON_COUNT,
  describeProvider,
  configuredDataProviderKey,
} from "../src/data/diagnostics/provider-meta";

// --- Provider meta ---
{
  const nba = describeProvider("nba");
  assert.equal(nba.name, "nba");
  assert.equal(nba.isLive, true);
  assert.equal(nba.isSample, false);
  assert.match(nba.description, /ESPN/i);

  const local = describeProvider("local");
  assert.equal(local.isSample, true);
  assert.equal(local.isLive, false);
  assert.match(local.description, /sample/i);
}

// --- Local sample status ---
{
  const h = assessPlayerBoardHealth({
    providerName: "local",
    season: "2024-25",
    rowCount: LOCAL_SAMPLE_PLAYER_SEASON_COUNT,
  });
  assert.equal(h.status, "sample_dataset");
  assert.equal(h.isSampleData, true);
  assert.match(h.message, /sample/i);
  assert.ok(h.message.includes(String(LOCAL_SAMPLE_PLAYER_COUNT)));
}

// --- Healthy live board ---
{
  const h = assessPlayerBoardHealth({
    providerName: "nba",
    season: "2025-26",
    rowCount: 582,
  });
  assert.equal(h.status, "healthy");
  assert.equal(h.isSampleData, false);
  assert.match(h.message, /582/);
}

// --- Zero rows modern → board unavailable (not “data loss”) ---
{
  const h = assessPlayerBoardHealth({
    providerName: "nba",
    season: "2025-26",
    rowCount: 0,
  });
  assert.equal(h.status, "board_unavailable");
  assert.match(h.message, /not automatically data loss/i);
}

// --- Unsupported historical season ---
{
  const h = assessPlayerBoardHealth({
    providerName: "nba",
    season: "1969-70",
    rowCount: 0,
    historicalGamesCachePresent: true,
  });
  assert.equal(h.status, "season_unsupported");
  assert.equal(h.espnBoardExpected, false);
  assert.equal(h.historicalGamesCachePresent, true);
  assert.match(h.message, /unavailable/i);
  assert.match(h.message, /game cache/i);
}

// --- Provider failure on modern season ---
{
  const h = assessPlayerBoardHealth({
    providerName: "nba",
    season: "2025-26",
    rowCount: 0,
    error: new Error("ESPN request failed (500)"),
  });
  assert.equal(h.status, "provider_failure");
  assert.match(h.message, /temporarily unavailable/i);
}

// --- Historical ESPN failure → unsupported (not generic outage) ---
{
  const h = assessPlayerBoardHealth({
    providerName: "nba",
    season: "1969-70",
    rowCount: 0,
    error: new Error("ESPN request failed (500)"),
    historicalGamesCachePresent: true,
  });
  assert.equal(h.status, "season_unsupported");
  assert.match(h.message, /unavailable/i);
  assert.match(h.message, /game cache/i);
}

// --- Accidental sample-sized live board ---
{
  const h = assessPlayerBoardHealth({
    providerName: "nba",
    season: "2024-25",
    rowCount: 17,
  });
  assert.equal(h.status, "sample_sized_unexpected");
}

// --- Valid empty after filters (thin but not sample-sized) ---
{
  const h = assessPlayerBoardHealth({
    providerName: "nba",
    season: "2024-25",
    rowCount: 80,
  });
  assert.equal(h.status, "empty_qualifying");
}

// --- Report formatter ---
{
  const h = assessPlayerBoardHealth({
    providerName: "local",
    season: "2024-25",
    rowCount: 15,
  });
  const text = formatPlayerBoardHealthReport(h, {
    raptor: "not found",
    jokic: "found",
  });
  assert.match(text, /Provider: local/);
  assert.match(text, /Status: sample_dataset/);
  assert.match(text, /LeBron: not found/);
}

// --- Config key helper (does not mutate env) ---
{
  const key = configuredDataProviderKey();
  assert.ok(typeof key === "string" && key.length > 0);
  if (!process.env.DATA_PROVIDER && !process.env.VERCEL) {
    assert.equal(
      key,
      "local",
      "tsx without DATA_PROVIDER / VERCEL must resolve to local sample, not silent nba"
    );
  }
}

console.log("test-player-data-health: all assertions passed");

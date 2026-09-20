/**
 * Run: npx tsx --test src/data/queries/trade-simulator-stats-season.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import { resolveTradeStatsSeason } from "./trade-simulator";

test("preseason roster season falls back to last DRBL season", () => {
  // 2026-27 has no bundled DRBL rows in this repo; 2025-26 does.
  assert.equal(resolveTradeStatsSeason("2026-27"), "2025-26");
});

test("completed season with DRBL keeps itself", () => {
  assert.equal(resolveTradeStatsSeason("2025-26"), "2025-26");
});

/**
 * Assert homepage findings use the prepared snapshot projection (no chart payloads).
 * Run: npx tsx scripts/test-home-findings-ssr.ts
 */
import assert from "node:assert/strict";

import { getBundledRecentInsights } from "../src/data/runtime/recent-insights-snapshot";
import { projectHomeFindings } from "../src/lib/home-findings-project";
import { stripInsightFlowsForHome } from "../src/lib/home-insights-slim";

const raw = getBundledRecentInsights();
assert.ok(raw.length > 0, "bundled insights should be non-empty");

const projected = projectHomeFindings(stripInsightFlowsForHome(raw));
assert.ok(projected.length > 0);

for (const insight of projected.slice(0, 12)) {
  assert.ok(insight.headline?.length, "headline required");
  assert.ok(insight.description?.length, "description required");
  assert.equal(insight.game?.flow, undefined, "flow must stay off home projection");
  assert.equal(insight.moment, undefined, "moment charts stay off home projection");
  assert.equal(insight.trend, undefined, "trend charts stay off home projection");
}

console.log(
  "ok",
  projected.length,
  "projected findings; sample:",
  projected[0]!.headline
);

/**
 * Assert homepage findings keep chart payloads from the bundled snapshot.
 * Run: npx tsx --require ./scripts/lib/stub-server-only.cjs scripts/test-home-findings-ssr.ts
 */
import assert from "node:assert/strict";

import { getBundledRecentInsights } from "../src/data/runtime/recent-insights-snapshot";
import { loadHomeInsightsDesk } from "../src/lib/home-findings-load";

async function main() {
  const raw = getBundledRecentInsights();
  assert.ok(raw.length > 0, "bundled insights should be non-empty");

  const desk = await loadHomeInsightsDesk();
  assert.equal(desk.insights.length, raw.length);
  assert.ok(desk.insights.length > 0);

  let withVisual = 0;
  for (const insight of desk.insights) {
    assert.ok(insight.headline?.length, "headline required");
    assert.ok(insight.description?.length, "description required");
    if (
      insight.moment ||
      insight.trend?.length ||
      insight.periodPoints?.length ||
      insight.contributors?.length ||
      insight.game?.flow ||
      insight.game?.home.periods?.length
    ) {
      withVisual += 1;
    }
  }
  assert.ok(withVisual > 0, "at least one card should carry chart material");

  console.log(
    "ok",
    desk.insights.length,
    "findings;",
    withVisual,
    "with chart material; sample:",
    desk.insights[0]!.headline
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

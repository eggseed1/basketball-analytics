/**
 * Run: npx tsx scripts/test-impact-risers.ts
 */
import assert from "node:assert/strict";
import {
  computeImpactMovers,
  formatImpactDelta,
} from "../src/analytics/impact-risers";

{
  const prior = [
    { playerId: "1", playerName: "A", impact: 2.0 },
    { playerId: "2", playerName: "B", impact: 3.0 },
    { playerId: "3", playerName: "C", impact: 1.0 },
  ];
  const current = [
    { playerId: "1", playerName: "A", impact: 4.5 },
    { playerId: "2", playerName: "B", impact: 1.5 },
    { playerId: "4", playerName: "D", impact: 5.0 },
  ];
  const movers = computeImpactMovers({
    prior,
    current,
    fromSeason: "2023-24",
    toSeason: "2024-25",
    minAbsDelta: 0.8,
    limit: 5,
  });
  assert.equal(movers.risers[0]?.playerName, "A");
  assert.ok((movers.risers[0]?.delta ?? 0) > 2);
  assert.equal(movers.fallers[0]?.playerName, "B");
  assert.ok(!movers.risers.some((m) => m.playerName === "D"));
  assert.equal(formatImpactDelta(2.5), "+2.50");
  assert.ok(formatImpactDelta(-1.2).startsWith("-"));
}

console.log("impact-risers checks passed");

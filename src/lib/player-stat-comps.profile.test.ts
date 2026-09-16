/**
 * Run: npx tsx --test src/lib/player-stat-comps.profile.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import { findSimilarProfile } from "./player-stat-comps";
import type { StatCompRow } from "./player-stat-comps";

function row(
  id: string,
  name: string,
  stats: Partial<StatCompRow>
): StatCompRow {
  return {
    playerId: id,
    playerName: name,
    season: "2025-26",
    gamesPlayed: 70,
    minutes: 70 * 32,
    points: 0,
    assists: 0,
    rebounds: 0,
    darkoDpm: 0,
    trueShootingPct: 0.57,
    usagePct: 0.22,
    assistPct: 0.2,
    reboundPct: 0.1,
    ...stats,
  };
}

test("profile match prefers the closest shape, not the closest single impact", () => {
  const focal = row("focal", "Focal", {
    darkoDpm: 2,
    trueShootingPct: 0.62,
    usagePct: 0.3,
    assistPct: 0.35,
    reboundPct: 0.08,
  });
  const twin = row("twin", "Twin", { ...focal, playerId: "twin", playerName: "Twin" });
  const sameImpactDifferentRole = row("big", "Big", {
    darkoDpm: 2,
    trueShootingPct: 0.5,
    usagePct: 0.16,
    assistPct: 0.08,
    reboundPct: 0.28,
  });
  const rest = Array.from({ length: 8 }, (_, i) =>
    row(`p${i}`, `Player ${i}`, {
      darkoDpm: -1 + i * 0.4,
      trueShootingPct: 0.5 + i * 0.01,
      usagePct: 0.16 + i * 0.01,
      assistPct: 0.1 + i * 0.01,
      reboundPct: 0.12 + i * 0.01,
    })
  );
  const hits = findSimilarProfile({
    focal,
    rows: [twin, sameImpactDifferentRole, ...rest],
    focalIds: ["focal"],
  });
  assert.equal(hits[0]?.playerId, "twin");
  const big = hits.find((hit) => hit.playerId === "big");
  if (big) assert.ok(big.value > (hits[0]?.value ?? 0));
  assert.match(hits[0]?.display ?? "", /gap/);
});

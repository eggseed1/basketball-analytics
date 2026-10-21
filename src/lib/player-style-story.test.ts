/**
 * Run: npx tsx --test src/lib/player-style-story.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import { dietContinuumPosition } from "@/lib/player-style-story";

test("rim diet sits on the inside of the continuum", () => {
  assert.ok(dietContinuumPosition("rim", 0.05) < 0.25);
});

test("perimeter diet sits on the outside of the continuum", () => {
  assert.ok(dietContinuumPosition("perimeter", 0.55) > 0.7);
});

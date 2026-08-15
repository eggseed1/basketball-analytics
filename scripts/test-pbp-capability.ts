/**
 * Locks honest PBP capability denial until ingest is deliberately wired.
 * Run: npx tsx scripts/test-pbp-capability.ts
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";

import { getPbpCapability } from "../src/pbp";

const cap = getPbpCapability();
assert.equal(cap.gamesIndexed, false);
assert.equal(cap.possessionsDerived, false);
assert.equal(cap.shotLocations, false);
assert.equal(cap.lineups, false);

// No production PBP event store under data/ yet.
const candidates = [
  "data/pbp",
  "data/play-by-play",
  "data/playbyplay",
  "data/cache/pbp",
];
for (const rel of candidates) {
  assert.equal(
    existsSync(path.join(process.cwd(), rel)),
    false,
    `Unexpected PBP path present: ${rel} — update audit + capability gates`
  );
}

console.log("test-pbp-capability: all assertions passed (PBP not ready)");

/**
 * Assert public metric names appear in learn/drbl page source.
 * Run: npx tsx scripts/test-learn-drbl-page.ts
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const REQUIRED = [
  "DRBL/100",
  "WAR1",
  "R1 Points",
  "DRBL-O",
  "DRBL-D",
  "DRBL-P",
  "DRBL-LN",
  "DRBL-B",
  "non-additive",
  "traditional WAR",
  "not 0",
  "Go deeper",
  "See it on the board",
  "drblGuide()",
];

const SECTIONS = ["measures", "pieces", "small-samples", "scale", "tested", "carryover", "war1", "sides", "built-on", "seasons", "limits"];

/** Research codenames belong in reports, not on the fan-facing guide. */
const FORBIDDEN = ["UIR", "M16j", "M17b", "research boundary", "validated rate", "DARKO"];

async function main() {
  const file = path.join(
    process.cwd(),
    "src",
    "app",
    "learn",
    "drbl",
    "page.tsx"
  );
  const src = await readFile(file, "utf8");
  for (const needle of REQUIRED) {
    assert.ok(
      src.includes(needle),
      `learn/drbl page missing public metric / phrase: ${needle}`
    );
  }
  for (const needle of FORBIDDEN) {
    assert.ok(!src.includes(needle), `learn/drbl page should not mention ${needle}`);
  }
  for (const id of SECTIONS) {
    assert.ok(src.includes(`id: "${id}"`), `contents bar missing ${id}`);
    assert.ok(src.includes(`id="${id}"`), `guide section missing ${id}`);
  }
  // DRBL/100 leads; WAR1 gets its own section after it.
  assert.ok(src.indexOf('id="measures"') < src.indexOf('id="war1"'));
  console.log("test-learn-drbl-page: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

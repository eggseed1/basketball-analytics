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
];

/** Research codenames belong in reports, not on the fan-facing overview. */
const FORBIDDEN = ["UIR", "M16j", "M17b", "research boundary"];

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
  // Primary surface should not headline both R1 Points and WAR1 as equals.
  const simpleIdx = src.indexOf("Two main numbers");
  const deepIdx = src.indexOf("R1 Points and the WAR1 conversion");
  assert.ok(simpleIdx >= 0 && deepIdx > simpleIdx);
  const simpleBlock = src.slice(simpleIdx, deepIdx);
  assert.ok(simpleBlock.includes("WAR1"));
  assert.ok(
    !simpleBlock.includes("Wins Above R1"),
    "Wins Above R1 must not be a simple-surface primary label"
  );
  assert.ok(
    !simpleBlock.includes('title="R1 Points"'),
    "R1 Points must not be a simple-surface Card title"
  );
  console.log("test-learn-drbl-page: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Assert public metric names appear in learn/drbl page source.
 * Run: npx tsx scripts/test-learn-drbl-page.ts
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const REQUIRED = [
  "DRBL/100",
  "R1 Points",
  "R1 Win Equivalents",
  "DRBL-O",
  "DRBL-D",
  "DRBL-P",
  "DRBL-LN",
  "DRBL-B",
  "validatedDRBL100",
  "k = 1600",
  "UIR",
  "M16j",
  "M17b",
  "non-additive",
];

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
  console.log("test-learn-drbl-page: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

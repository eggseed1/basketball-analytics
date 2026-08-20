/**
 * Season age from birth date (Feb 1 of ending year).
 * Run: npx tsx scripts/test-player-age.ts
 */
import assert from "node:assert/strict";

import { ageAsOfSeason, formatBirthLine } from "../src/lib/player-age";

console.log("player-age…");

// Luka Dončić, born 1999-02-28
assert.equal(ageAsOfSeason("1999-02-28", "2018-19"), 19);
assert.equal(ageAsOfSeason("1999-02-28", "2024-25"), 25);
assert.equal(ageAsOfSeason("1999-02-28", "2025-26"), 26);
assert.equal(
  formatBirthLine("1999-02-28", "2024-25"),
  "Born 1999-02-28 (Age: 25)"
);

// Birthday on Feb 1 counts as that age
assert.equal(ageAsOfSeason("2000-02-01", "2020-21"), 21);
assert.equal(ageAsOfSeason("2000-02-02", "2020-21"), 20);

assert.equal(ageAsOfSeason(null, "2024-25"), null);
assert.equal(ageAsOfSeason("1999-02-28", "nope"), null);

console.log("OK - player-age");

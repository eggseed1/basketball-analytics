import assert from "node:assert/strict";

import {
  canonicalSeasonFromStartYear,
  dailyGameLogMinGp,
  firstRegularSeasonTipDate,
  nbaSeasonPhase,
  nbaSeasonPhaseInfo,
} from "./lib/nba-season-phase.mjs";

function utc(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d, 12));
}

assert.equal(nbaSeasonPhase(utc(2026, 8, 29)), "offseason");
assert.equal(nbaSeasonPhase(utc(2027, 1, 15)), "regular");
assert.equal(nbaSeasonPhase(utc(2027, 4, 20)), "playoffs");
assert.equal(nbaSeasonPhase(utc(2027, 6, 15)), "playoffs");

const tip = firstRegularSeasonTipDate("2026-27");
if (tip) {
  const tipDate = new Date(`${tip}T12:00:00.000Z`);
  const before = new Date(tipDate.getTime() - 24 * 60 * 60 * 1000);
  assert.equal(nbaSeasonPhase(before), "offseason");
  assert.equal(nbaSeasonPhase(tipDate), "regular");
} else {
  // Soft Oct 15 handoff when the snapshot has no opener yet.
  assert.equal(nbaSeasonPhase(utc(2026, 10, 10)), "offseason");
  assert.equal(nbaSeasonPhase(utc(2026, 10, 15)), "regular");
}

const oct = nbaSeasonPhaseInfo(utc(2026, 10, 20));
assert.equal(oct.season, "2026-27");
assert.equal(oct.startYear, 2026);
if (!tip || tip <= "2026-10-20") {
  assert.equal(oct.phase, "regular");
  assert.equal(oct.shouldRefreshPlayerViz, true);
}

const august = nbaSeasonPhaseInfo(utc(2026, 8, 29));
assert.equal(august.shouldRefreshPlayerViz, false);
assert.equal(august.season, "2026-27");

assert.equal(canonicalSeasonFromStartYear(2025), "2025-26");
assert.equal(dailyGameLogMinGp(utc(2026, 10, 20)), 1);
assert.equal(dailyGameLogMinGp(utc(2027, 2, 1)), 10);
assert.equal(dailyGameLogMinGp(utc(2027, 3, 1)), 15);

console.log("nba-season-phase: ok", tip ? `(tip ${tip})` : "(no tip in snapshot)");

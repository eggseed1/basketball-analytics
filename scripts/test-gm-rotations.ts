/**
 * Minutes-per-position bars, auto-balance, position reassignment OVR.
 * Run: npx tsx scripts/test-gm-rotations.ts
 */
import assert from "node:assert/strict";

import { playerSheet } from "../src/gm/engine/attributes";
import {
  autoBalanceRotation,
  suggestedMinutes,
} from "../src/gm/engine/coaching";
import {
  assignLeaguePositions,
  classifyListedPosition,
  minutesPerPosition,
  overallAtPosition,
  positionFit,
  reassignPosition,
  rotationQuality,
  secondaryOptions,
  setSecondaryPosition,
} from "../src/gm/engine/lineup";
import type { GmPlayer, GmTeam } from "../src/gm/types";

function player(
  id: string,
  position: GmPlayer["position"],
  impact: number
): GmPlayer {
  const base: GmPlayer = {
    id,
    name: id,
    teamId: "bos",
    position,
    age: 26,
    heightIn: 78,
    weightLbs: 210,
    ratings: {
      impact,
      offense: impact,
      defense: impact * 0.8,
      finishing: 55 + impact * 4,
      shooting: 55 + impact * 3,
      playmaking: 50 + impact * 4,
      rebounding: 48,
      durability: 70,
      potential: 5,
    },
    scouted: { impact, offense: impact, defense: impact, uncertainty: 0.1 },
    contract: null,
    injury: null,
    morale: 80,
    personality: 0,
    minutesPreference: 28,
  };
  return { ...base, sheet: playerSheet(base) };
}

const roster = [
  player("pg", "PG", 3.2),
  player("sg", "SG", 2.4),
  player("sf", "SF", 2.8),
  player("pf", "PF", 2.1),
  player("c", "C", 3.5),
  player("b1", "PG", 1.2),
  player("b2", "SG", 1.0),
  player("b3", "SF", 0.8),
  player("b4", "PF", 0.6),
  player("b5", "C", 1.4),
];

const team = {
  id: "bos",
  starters: {
    PG: "pg",
    SG: "sg",
    SF: "sf",
    PF: "pf",
    C: "c",
  },
  coaching: undefined,
} as GmTeam;

const balanced = autoBalanceRotation(team, roster);
assert.ok(Object.values(balanced.minutes).reduce((a, b) => a + b, 0) >= 220);
// Default is an 11-man book; depth should balance near 48 per spot.
assert.ok(balanced.quality >= 0.78, `expected solid default balance, got ${balanced.quality}`);

const rows = minutesPerPosition(roster, balanced.minutes, balanced.coverSlot);
assert.equal(rows.length, 5);
assert.ok(rows.every((row) => row.total > 0));
// Position bars must sit near 48 when the roster can cover every spot.
for (const row of rows) {
  assert.ok(
    Math.abs(row.total - 48) <= 12,
    `${row.position} should be near 48, got ${row.total}`
  );
}

// Sibling secondaries must not double-count when cover slots are missing.
const twinned = roster.map((player) => ({
  ...player,
  secondaryPosition:
    player.position === "PG"
      ? ("SG" as const)
      : player.position === "SG"
        ? ("PG" as const)
        : player.position === "SF"
          ? ("PF" as const)
          : player.position === "PF"
            ? ("SF" as const)
            : ("PF" as const),
}));
const twinMinutes = Object.fromEntries(
  twinned.map((player) => [player.id, balanced.minutes[player.id] ?? 0])
);
const twinSum = Object.values(twinMinutes).reduce((sum, value) => sum + value, 0);
const twinRows = minutesPerPosition(twinned, twinMinutes);
assert.equal(
  twinRows.reduce((sum, row) => sum + row.total, 0),
  twinSum,
  "bars must sum to player minutes, not 2x via secondary listings"
);
assert.ok(
  twinRows.every((row) => row.secondary === 0),
  "without cover slots, minutes stay on primary only"
);

function bodiesWithMinutes(minutes: Record<string, number>): number {
  return Object.values(minutes).filter((value) => value >= 8).length;
}

const six = autoBalanceRotation(
  { ...team, coaching: { ...team.coaching, rotationDepth: 6 } as GmTeam["coaching"] },
  roster
);
const eight = autoBalanceRotation(
  { ...team, coaching: { ...team.coaching, rotationDepth: 8 } as GmTeam["coaching"] },
  roster
);
const thirteen = autoBalanceRotation(
  { ...team, coaching: { ...team.coaching, rotationDepth: 13 } as GmTeam["coaching"] },
  roster
);
assert.ok(
  bodiesWithMinutes(six.minutes) <= 6,
  `6-man should dress at most 6, got ${bodiesWithMinutes(six.minutes)}`
);
assert.ok(
  bodiesWithMinutes(eight.minutes) <= 8,
  `8-man should dress at most 8, got ${bodiesWithMinutes(eight.minutes)}`
);
assert.ok(
  bodiesWithMinutes(thirteen.minutes) >= bodiesWithMinutes(eight.minutes),
  "13-man should not be shallower than 8-man"
);
assert.equal(
  Object.values(eight.minutes).reduce((a, b) => a + b, 0),
  240,
  "8-man book should still sum to 240"
);
assert.equal(
  Object.values(six.minutes).reduce((a, b) => a + b, 0),
  240,
  "6-man book should still sum to 240"
);
const sixMax = Math.max(...Object.values(six.minutes));
const eightMax = Math.max(...Object.values(eight.minutes));
const thirteenMax = Math.max(...Object.values(thirteen.minutes), 0);
assert.ok(
  sixMax >= eightMax - 2,
  `shallower book should feed stars at least as much (${sixMax} vs ${eightMax})`
);
assert.ok(
  eightMax >= thirteenMax - 2,
  `8-man should feed stars at least as much as 13 (${eightMax} vs ${thirteenMax})`
);

// Default with no coaching depth preference is an 11-man book.
const defaulted = autoBalanceRotation(team, roster);
assert.ok(
  bodiesWithMinutes(defaulted.minutes) <= 11,
  `default book should be at most 11, got ${bodiesWithMinutes(defaulted.minutes)}`
);
assert.ok(
  bodiesWithMinutes(defaulted.minutes) >= 9,
  `default book should dress a deep bench, got ${bodiesWithMinutes(defaulted.minutes)}`
);

// Skewed roster: many guards, one wing. Cover slot must still staff SF.
const skewed = [
  player("g1", "PG", 3),
  player("g2", "PG", 2.5),
  player("g3", "SG", 2.8),
  player("g4", "SG", 2.2),
  player("g5", "SG", 1.8),
  player("w1", "SF", 2.4),
  player("f1", "PF", 2.1),
  player("c1", "C", 3.1),
  player("c2", "C", 1.5),
  player("b1", "SG", 1.0),
];
const skewedTeam = {
  ...team,
  starters: { PG: "g1", SG: "g3", SF: "w1", PF: "f1", C: "c1" },
} as GmTeam;
const skewedBalanced = autoBalanceRotation(skewedTeam, skewed);
const skewedRows = minutesPerPosition(
  skewed,
  skewedBalanced.minutes,
  skewedBalanced.coverSlot
);
assert.ok(
  skewedRows.every((row) => row.total >= 30),
  `skewed cover should staff every spot: ${skewedRows.map((r) => `${r.position}:${r.total}`).join(" ")}`
);
assert.ok(
  skewedBalanced.quality > 0.75,
  `skewed auto-balance should still score decently, got ${skewedBalanced.quality}`
);

const hogged: Record<string, number> = {};
for (const p of roster) hogged[p.id] = 0;
hogged.pg = 40;
hogged.sg = 40;
hogged.sf = 40;
hogged.pf = 40;
hogged.c = 40;
const bad = rotationQuality(roster, hogged);
assert.ok(bad < balanced.quality, "star hogging should score worse than auto-balance");

const center = roster.find((p) => p.id === "c")!;
center.heightIn = 84;
center.weightLbs = 260;
center.ratings.rebounding = 78;
center.sheet = playerSheet(center);
const asPg = reassignPosition(center, "PG");
assert.equal(asPg.position, "PG");
assert.notEqual(asPg.sheet!.overall, center.sheet!.overall);
assert.equal(overallAtPosition(center, "C"), center.sheet!.overall);

const sketched = suggestedMinutes(team, roster);
assert.ok((sketched.pg ?? 0) >= 20);

// ESPN G/F collapse → five spots + sibling secondary.
const wingGuard = player("wg", "SG", 1.5);
wingGuard.heightIn = 74;
wingGuard.ratings.playmaking = 78;
const point = classifyListedPosition(wingGuard);
assert.equal(point.position, "PG");
assert.equal(point.secondaryPosition, "SG");
const tallWing = player("tw", "SF", 1.2);
tallWing.heightIn = 83;
tallWing.ratings.rebounding = 72;
const big = classifyListedPosition(tallWing);
assert.equal(big.position, "PF");
assert.equal(big.secondaryPosition, "SF");
const covered = assignLeaguePositions([
  { ...player("a", "SG", 2), teamId: "x", heightIn: 77, secondaryPosition: null },
  { ...player("b", "SG", 1), teamId: "x", heightIn: 78, secondaryPosition: null },
  { ...player("c", "SF", 1), teamId: "x", heightIn: 79, secondaryPosition: null },
  { ...player("d", "SF", 1), teamId: "x", heightIn: 80, secondaryPosition: null },
  { ...player("e", "C", 2), teamId: "x", heightIn: 84, secondaryPosition: null },
]);
assert.ok(covered.some((p) => p.position === "PG"), "team should gain a PG");
assert.ok(covered.some((p) => p.position === "PF"), "team should gain a PF");
assert.ok(covered.every((p) => p.secondaryPosition), "everyone gets a secondary");

const combo = setSecondaryPosition(player("combo", "SG", 2), "PG");
assert.equal(combo.secondaryPosition, "PG");
assert.deepEqual(secondaryOptions("SG"), ["PG", "SF"]);
assert.ok(positionFit(combo, "SG") > positionFit(combo, "PG"));
assert.ok(positionFit(combo, "PG") > positionFit(combo, "C"));
const refused = setSecondaryPosition(combo, "C");
assert.equal(refused.secondaryPosition, "PG", "illegal secondary should no-op");

console.log("rotations ok", {
  quality: balanced.quality,
  hog: bad,
  cToPg: `${center.sheet!.overall} -> ${asPg.sheet!.overall}`,
  bars: rows.map((r) => `${r.position}:${r.total}`).join(" "),
});

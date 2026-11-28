/**
 * Fan mood movers and season form.
 *   npx tsx scripts/test-sentiment-movers.ts
 */
import assert from "node:assert/strict";

import type { PlayerSentimentProfile, SentimentSeriesPoint } from "../src/sentiment/curated-types";
import { computeSentimentMovers, fanMoodShift } from "../src/sentiment/movers";
import {
  buildSeasonFormIndex,
  formatBpm,
  isRotationPlayer,
  qualifiesForForm,
  seasonFormFor,
} from "../src/sentiment/season-form";
import { toneVsProduction } from "../src/sentiment/tone-vs-production";
import type { TrackedPlayerSentimentRow } from "../src/sentiment/curated-types";

const DAY = 86_400_000;
const anchor = Date.parse("2026-11-26T12:00:00Z");
const dateAgo = (days: number) => new Date(anchor - days * DAY).toISOString().slice(0, 10);

function profile(id: string, fan: SentimentSeriesPoint[]): PlayerSentimentProfile {
  return {
    playerIds: [id],
    displayName: `Player ${id}`,
    window: "7d",
    fan: {
      polarity: "neutral",
      score: 0.1,
      direction: "stable",
      mentionVolume: 30,
      coverageConfidence: 0.6,
      platformBreakdown: {},
      topicBreakdown: {},
      origin: "fans",
      asOf: dateAgo(0),
    },
    series: { fan, media: [] },
  };
}

// One-post days that flip between -1 and +1 are noise, not a mood swing.
const jittery = profile(
  "jitter",
  [
    { date: dateAgo(13), score: -1, count: 1 },
    { date: dateAgo(11), score: -1, count: 2 },
    { date: dateAgo(9), score: -0.9, count: 1 },
    { date: dateAgo(5), score: 1, count: 1 },
    { date: dateAgo(3), score: -1, count: 1 },
    { date: dateAgo(0), score: 1, count: 3 },
  ]
);
assert.equal(fanMoodShift(jittery, 7), null, "thin windows give no shift");

// A real week: 40 posts at +0.3 against 30 posts at -0.2.
const real = profile(
  "real",
  [
    { date: dateAgo(12), score: -0.2, count: 15 },
    { date: dateAgo(9), score: -0.2, count: 15 },
    { date: dateAgo(4), score: 0.3, count: 20 },
    { date: dateAgo(1), score: 0.3, count: 20 },
  ]
);
const shift = fanMoodShift(real, 7);
assert.ok(shift, "enough posts in both windows");
assert.equal(shift.itemsNow, 40);
assert.equal(shift.itemsPrior, 30);
assert.ok(shift.delta > 0.2 && shift.delta < 0.5, `shrunk delta stays below the raw 0.5, got ${shift.delta}`);

// Windows are dates, so a gap in the series does not pull old days into "now".
const sparse = profile(
  "sparse",
  [
    { date: dateAgo(20), score: 0.9, count: 40 },
    { date: dateAgo(10), score: -0.4, count: 25 },
    { date: dateAgo(2), score: 0.4, count: 25 },
  ]
);
const sparseShift = fanMoodShift(sparse, 7);
assert.ok(sparseShift && sparseShift.delta > 0, "uses the 10-day-old day as the prior window");
assert.equal(sparseShift.itemsPrior, 25);

// Rotation gate and attached form.
const index = buildSeasonFormIndex("2026-27", [
  { espnId: "real", nbaId: "9001", gp: 20, mp: 640, bpm: 3.8, vorp: 0.9, per: 20, pts: 22 },
  { espnId: "bench", nbaId: "9002", gp: 20, mp: 160, bpm: -1, vorp: 0, per: 9, pts: 3 },
]);
const formFor = (p: PlayerSentimentProfile) => seasonFormFor(p.playerIds, index);
const bench = { ...real, playerIds: ["bench"], displayName: "Bench" };
const gated = computeSentimentMovers([real, bench], { lookbackDays: 7, formFor });
assert.deepEqual(gated.risers.map((r) => r.playerId), ["real"], "bench players stay off the board");
assert.equal(gated.risers[0]?.form?.bpm, 3.8);
const ungated = computeSentimentMovers([real, bench], { lookbackDays: 7 });
assert.equal(ungated.risers.length, 2, "no form data means volume floors only");

// A shift under the minimum is dropped.
const flat = profile("flat", [
  { date: dateAgo(10), score: 0.1, count: 20 },
  { date: dateAgo(2), score: 0.12, count: 25 },
]);
assert.equal(computeSentimentMovers([flat], { lookbackDays: 7 }).risers.length, 0);

// Season form index.
assert.equal(index.get("9001")?.mpg, 32);
assert.equal(seasonFormFor(["x", "9001"], index)?.bpm, 3.8, "any known id matches");
const traded = buildSeasonFormIndex("2026-27", [
  { espnId: "t", gp: 5, mp: 100, bpm: 1 },
  { espnId: "t", gp: 14, mp: 400, bpm: 2 },
]);
assert.equal(traded.get("t")?.bpm, 2, "the longer stint wins");
assert.equal(qualifiesForForm(index.get("9002")), false, "10 mpg is under the 15 mpg floor");
assert.equal(qualifiesForForm(index.get("9001")), true);
assert.equal(isRotationPlayer(index.get("9002")), false);
assert.equal(formatBpm(3.84), "+3.8");
assert.equal(formatBpm(-0.04), "0.0");
assert.equal(formatBpm(-1.26), "−1.3");

// Tone vs production prefers this season's BPM, and falls back to DRBL/100.
function toneRow(i: number, score: number, bpm: number | null, drbl?: number): TrackedPlayerSentimentRow {
  return {
    playerId: `t${i}`,
    displayName: `T${i}`,
    window: "7d",
    fan: {
      polarity: "neutral",
      score,
      direction: "stable",
      mentionVolume: 40,
      coverageConfidence: 0.6,
      platformBreakdown: {},
      topicBreakdown: {},
      origin: "fans",
    },
    ...(bpm != null
      ? { form: { season: "2026-27", gp: 20, mpg: 30, bpm, vorp: null, per: null, pts: null } }
      : {}),
    ...(drbl != null ? { performance: { season: "2025-26", drbl100: drbl, possessions: 2000 } } : {}),
  };
}
const withForm = Array.from({ length: 24 }, (_, i) => toneRow(i, i / 24, i - 12, i));
const viaBpm = toneVsProduction(withForm, "fan", { minVolume: 10 });
assert.equal(viaBpm?.metric, "bpm");
assert.equal(viaBpm?.season, "2026-27");
const noForm = Array.from({ length: 24 }, (_, i) => toneRow(i, i / 24, null, i));
const viaDrbl = toneVsProduction(noForm, "fan", { minVolume: 10 });
assert.equal(viaDrbl?.metric, "drbl100");
assert.equal(viaDrbl?.season, "2025-26");

console.log("sentiment movers tests passed");

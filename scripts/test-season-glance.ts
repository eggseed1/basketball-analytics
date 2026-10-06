/**
 * Season at a glance: season picking, labels, play-type totals and shot zones.
 */
import assert from "node:assert/strict";

import {
  buildPlayTypeMix,
  buildShotProfile,
  buildUsageEfficiency,
  pickTeamMap,
  priorSeason,
  type StandingsRowLite,
} from "../src/lib/season-glance";

const teams = (games: number, season: string) => ({
  season,
  rows: Array.from({ length: 30 }, (_, i): StandingsRowLite => ({
    teamId: String(i + 1),
    abbreviation: `T${i}`,
    displayName: `Team ${i}`,
    wins: Math.floor(games / 2),
    losses: games - Math.floor(games / 2),
    ppg: games ? 110 + i * 0.2 : 0,
    oppPpg: games ? 112 - i * 0.1 : 0,
  })),
});

// Two games in falls back to last season; ten games in uses the new one.
assert.equal(pickTeamMap([teams(82, "2025-26"), teams(2, "2026-27")])?.season, "2025-26");
assert.equal(pickTeamMap([teams(82, "2025-26"), teams(10, "2026-27")])?.season, "2026-27");
assert.equal(pickTeamMap([teams(0, "2026-27")]), null);
const map = pickTeamMap([teams(82, "2025-26")])!;
assert.ok(Math.abs(map.leaguePpg - (110 + 29 * 0.1)) < 1e-9);

// Usage: minutes floor, dedupe keeps the combined row, top four usage plus two efficient.
const usage = buildUsageEfficiency([
  { n: "Traded Guy", t: "2TM", e: "9", mp: 2400, ts: 0.6, usg: 31 },
  { n: "Traded Guy", t: "AAA", e: "9", mp: 1500, ts: 0.58, usg: 30 },
  { n: "Bench", t: "BBB", e: "1", mp: 900, ts: 0.7, usg: 15 },
  { n: "A One", t: "C", e: "2", mp: 2000, ts: 0.55, usg: 33 },
  { n: "B Two", t: "C", e: "3", mp: 2000, ts: 0.56, usg: 30 },
  { n: "C Three", t: "C", e: "4", mp: 2000, ts: 0.57, usg: 29 },
  { n: "D Four", t: "C", e: "5", mp: 2000, ts: 0.66, usg: 25 },
  { n: "E Five", t: "C", e: "6", mp: 2000, ts: 0.64, usg: 24 },
  { n: "F Six", t: "C", e: "7", mp: 2000, ts: 0.7, usg: 18 },
]);
assert.equal(usage.length, 7);
assert.equal(usage.find((p) => p.name === "Traded Guy")?.team, "2TM");
assert.deepEqual(
  usage.filter((p) => p.labeled).map((p) => p.name).sort(),
  ["A One", "B Two", "C Three", "D Four", "E Five", "Traded Guy"]
);
assert.equal(usage.find((p) => p.name === "F Six")?.labeled, false);

// Play types: league totals, Misc dropped, sorted by share.
const mix = buildPlayTypeMix(
  [
    ["p1", 0, 100, 90, 50, 65, 10, 2],
    ["p2", 0, 100, 100, 50, 60, 10, 3],
  ],
  ["Isolation", "Cut", "Misc"]
);
assert.deepEqual(mix.map((r) => r.key), ["Isolation", "Cut"]);
assert.ok(Math.abs(mix[0]!.ppp - 0.95) < 1e-9);
assert.ok(Math.abs(mix[1]!.ppp - 1.25) < 1e-9);
assert.ok(Math.abs(mix[0]!.share - 2 / 3) < 1e-9);

// Shot zones: corners combine, backcourt ignored, change in points of share.
const zones = (rim: number, mid: number) => ({
  "Restricted Area": [rim * 0.65, rim] as [number, number],
  "In The Paint (Non-RA)": [40, 100] as [number, number],
  "Mid-Range": [mid * 0.4, mid] as [number, number],
  "Left Corner 3": [20, 50] as [number, number],
  "Right Corner 3": [20, 50] as [number, number],
  "Above the Break 3": [100, 300] as [number, number],
  Backcourt: [1, 40] as [number, number],
});
const profile = buildShotProfile(zones(300, 100), zones(250, 150));
assert.equal(profile.length, 5);
assert.ok(Math.abs(profile.find((z) => z.id === "corner3")!.share - 100 / 900) < 1e-9);
assert.ok(Math.abs(profile.find((z) => z.id === "rim")!.shareChange! - 50 / 9) < 1e-9);
assert.ok(Math.abs(profile.find((z) => z.id === "mid")!.shareChange! + 50 / 9) < 1e-9);
assert.equal(buildShotProfile(zones(300, 100), null)[0]!.shareChange, null);
const missing = zones(300, 100) as Record<string, [number, number]>;
delete missing["Mid-Range"];
assert.deepEqual(buildShotProfile(missing, null), []);

assert.equal(priorSeason("2025-26"), "2024-25");
assert.equal(priorSeason("2000-01"), "1999-00");

console.log("test-season-glance: PASS");

import assert from "node:assert/strict";
import test from "node:test";
import { snapshotRegressed } from "./lib/live-runtime-guard.mjs";

const at = (date, wins, losses) => ({
  generatedAt: date,
  seasons: { "2026-27": { conferences: [{ rows: Array.from({ length: 30 }, (_, i) => ({
    teamId: String(i + 1), wins: i === 1 ? wins : 3, losses: i === 1 ? losses : 2
  })) }] } }
});
const games = (date, completed) => ({
  generatedAt: date,
  seasons: ["2026-27"],
  games: Array.from({ length: completed }, (_, i) => ({
    id: String(i), season: "2026-27", gameType: "regular", status: "final"
  }))
});
const night = "2026-11-03T18:03:26.127Z";
const stale = "2026-11-02T23:33:16.695Z";
test("nightly Celtics 5-2 is not replaced with 5-1 by a merge", () => {
  assert.equal(snapshotRegressed("src/data/runtime/standings-snapshot.json", at(stale, 5, 1), at(night, 5, 2)), true);
});
test("even a newly timestamped snapshot cannot erase a completed game", () => {
  assert.equal(snapshotRegressed("src/data/runtime/standings-snapshot.json", at("2026-11-03T20:00:00Z", 5, 1), at(night, 5, 2)), true);
  assert.equal(snapshotRegressed("src/data/runtime/game-snapshot.json", games("2026-11-03T20:00:00Z", 100), games(night, 101)), true);
});
test("newer valid board is retained; old nightly records do not roll it back", () => {
  assert.equal(snapshotRegressed("src/data/runtime/standings-snapshot.json", at("2026-11-04T16:00:00Z", 6, 2), at(night, 5, 2)), false);
  assert.equal(snapshotRegressed("src/data/runtime/game-snapshot.json", games("2026-11-04T16:00:00Z", 110), games(night, 101)), false);
});
test("missing or partial boards are restored", () => {
  assert.equal(snapshotRegressed("src/data/runtime/standings-snapshot.json", null, at(night, 5, 2)), true);
  assert.equal(snapshotRegressed("src/data/runtime/game-snapshot.json", games(stale, 10), games(night, 101)), true);
});
const boxes = (date, days) => ({
  generatedAt: date,
  teams: { "2026-27": { "2": days.map(d => [d, 93, 30, 75, 10, 30, 23, 25, 12, 29, 22, 7, 5, 12, 18]) } }
});
test("team-game statistics cannot fall back to October 27 after the next nightly run", () => {
  const before = boxes(stale, ["2026-10-20", "2026-10-23", "2026-10-26"]);
  const after = boxes(night, ["2026-10-20", "2026-10-23", "2026-10-26", "2026-11-02"]);
  assert.equal(snapshotRegressed("src/data/runtime/team-game-box-snapshot.json", before, after), true);
  assert.equal(snapshotRegressed("src/data/runtime/team-game-box-snapshot.json",
    boxes("2026-11-04T16:00:00Z", ["2026-10-20", "2026-10-23", "2026-10-26", "2026-11-02", "2026-11-03"]),
    after), false);
  assert.equal(snapshotRegressed("src/data/runtime/team-game-box-snapshot.json",
    boxes("2026-11-04T16:00:00Z", ["2026-10-20"]), after), true);
});
test("unverifiable nightly source fails closed", () => {
  assert.throws(() => snapshotRegressed("src/data/runtime/standings-snapshot.json", at(night, 5, 2), at("bad-date", 5, 2)));
});

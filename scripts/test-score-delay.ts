/**
 * Score delay: snapshot buffering, masking and preference parsing.
 * Run: npx tsx scripts/test-score-delay.ts
 */
import assert from "node:assert/strict";

import type { GameSummary } from "../src/data/types";
import { shouldDisplayScores } from "../src/lib/game-status";
import {
  insertSnapshot,
  maskGame,
  needsScoreMask,
  parseScoreDelay,
  pickDelayed,
  pickDue,
  recordSnapshot,
  type ScoreSnapshot,
} from "../src/lib/score-delay";

const T0 = Date.parse("2026-11-01T00:00:00Z");

function game(over: Partial<GameSummary>): GameSummary {
  return {
    id: "g1",
    season: "2026-27",
    gameDate: "2026-10-31",
    tipOffAt: new Date(T0 - 60 * 60_000).toISOString(),
    homeTeamId: "1610612747",
    awayTeamId: "1610612744",
    homeScore: 0,
    awayScore: 0,
    status: "in_progress",
    ...over,
  } as GameSummary;
}

function testParse() {
  assert.equal(parseScoreDelay("60"), 60);
  assert.equal(parseScoreDelay("45"), 0);
  assert.equal(parseScoreDelay(null), 0);
  assert.equal(parseScoreDelay("-15"), 0);
}

function testRecordDedupes() {
  const a = game({ homeScore: 10, awayScore: 8, period: 1, displayClock: "5:00" });
  let list = recordSnapshot(undefined, a, T0);
  list = recordSnapshot(list, { ...a }, T0 + 5_000);
  assert.equal(list.length, 1);
  list = recordSnapshot(list, { ...a, homeScore: 12 }, T0 + 10_000);
  assert.equal(list.length, 2);
}

function testLiveAtMountIsMasked() {
  const list: ScoreSnapshot[] = [{ at: T0, value: game({ homeScore: 50, awayScore: 48 }) }];
  const early = pickDelayed(list, T0 + 30_000, 60_000);
  assert.equal(early.game, null);
  assert.equal(early.nextAt, T0 + 60_000);
  const due = pickDelayed(list, T0 + 60_000, 60_000);
  assert.equal(due.game?.homeScore, 50);
}

function testShowsNewestDueSnapshot() {
  const list: ScoreSnapshot[] = [
    { at: T0, value: game({ status: "scheduled" }) },
    { at: T0 + 20_000, value: game({ homeScore: 2 }) },
    { at: T0 + 40_000, value: game({ homeScore: 4 }) },
  ];
  const pre = pickDelayed(list, T0 + 30_000, 30_000);
  assert.equal(pre.game?.status, "scheduled", "pre-tip snapshot needs no mask");
  assert.equal(pre.nextAt, T0 + 50_000);
  const mid = pickDelayed(list, T0 + 55_000, 30_000);
  assert.equal(mid.game?.homeScore, 2);
  assert.equal(mid.list.length, 2, "older snapshots pruned");
  assert.equal(mid.nextAt, T0 + 70_000);
}

function testLateArrivingServerDataSortsByFetchTime() {
  let list = insertSnapshot<string>(undefined, "poll@T0+50", T0 + 50_000);
  list = insertSnapshot(list, "server@T0+20", T0 + 20_000);
  assert.deepEqual(list.map((s) => s.value), ["server@T0+20", "poll@T0+50"]);
  const picked = pickDue(list, T0 + 60_000, 30_000);
  assert.equal(picked.due?.value, "server@T0+20");
  assert.equal(picked.nextAt, T0 + 80_000);
  assert.equal(insertSnapshot(list, "poll@T0+50", T0 + 55_000), list, "same value is not stored twice");
}

function testRecentFinalMaskedOldFinalShown() {
  const recent = game({ status: "final", homeScore: 110, awayScore: 104 });
  assert.equal(needsScoreMask(recent, T0), true);
  const old = game({ status: "final", tipOffAt: "2026-10-20T23:30:00Z" });
  assert.equal(needsScoreMask(old, T0), false);
  assert.equal(needsScoreMask(game({ status: "scheduled" }), T0), false);
  const shown = pickDelayed([{ at: T0, value: old }], T0 + 1_000, 120_000);
  assert.equal(shown.game, old);
}

function testMaskHidesEverything() {
  const m = maskGame(
    game({
      status: "final",
      homeScore: 110,
      awayScore: 104,
      homeRecord: "5-1",
      homePeriodScores: [30, 25, 30, 25],
      awayPeriodScores: [25, 25, 30, 24],
    })
  );
  assert.equal(m.status, "in_progress");
  assert.equal(shouldDisplayScores(m), false);
  assert.equal(m.homeRecord, undefined);
  assert.equal(m.homePeriodScores, undefined);
}

testParse();
testRecordDedupes();
testLiveAtMountIsMasked();
testShowsNewestDueSnapshot();
testLateArrivingServerDataSortsByFetchTime();
testRecentFinalMaskedOldFinalShown();
testMaskHidesEverything();
console.log("score-delay: ok");

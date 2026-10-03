import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSentimentGameRows,
  gameReaction,
  pearson,
  type SentimentHistoryFile,
} from "@/sentiment/game-reaction";

const history: SentimentHistoryFile = {
  playerIds: ["1"],
  builtAt: "2026-11-05T00:00:00Z",
  fan: [
    { date: "2026-11-01", score: 0.5, count: 2 },
    { date: "2026-11-02", score: -0.1, count: 2 },
    { date: "2026-11-04", score: 0.2, count: 1 },
  ],
  media: [{ date: "2026-10-30", score: 0.3, count: 4 }],
};

const game = (gameDate: string, extra: Record<string, unknown> = {}) => ({
  gameId: `g-${gameDate}`,
  gameDate,
  season: "2026-27",
  opponentTeamId: "1610612738",
  isHome: true,
  minutes: 34,
  points: 28,
  rebounds: 6,
  assists: 5,
  fieldGoalsAttempted: 20,
  freeThrowsAttempted: 5,
  ...extra,
});

test("gameReaction weights game day and the next day by count", () => {
  const r = gameReaction(history.fan, "2026-11-01");
  assert.equal(r.count, 4);
  assert.equal(r.score, 0.2);
});

test("gameReaction stays blank below the item floor", () => {
  const r = gameReaction(history.fan, "2026-11-04");
  assert.equal(r.count, 1);
  assert.equal(r.score, null);
});

test("buildSentimentGameRows drops games before tracking began and DNPs", () => {
  const rows = buildSentimentGameRows(
    [
      game("2026-10-20"),
      game("2026-11-03", { didNotPlay: true, minutes: 0 }),
      game("2026-11-01"),
    ],
    history
  );
  assert.deepEqual(
    rows.map((r) => r.date),
    ["2026-11-01"]
  );
  assert.equal(rows[0]!.media.score, null);
  assert.ok(Math.abs(rows[0]!.tsPct! - 28 / (2 * (20 + 0.44 * 5))) < 1e-9);
});

test("buildSentimentGameRows returns nothing without history", () => {
  assert.deepEqual(buildSentimentGameRows([game("2026-11-01")], null), []);
});

test("pearson handles flat and tiny samples", () => {
  assert.equal(pearson([[1, 1], [2, 2]]), null);
  assert.equal(pearson([[1, 5], [2, 5], [3, 5]]), null);
  assert.equal(pearson([[1, 2], [2, 4], [3, 6]]), 1);
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PUBLISHED,
  bootDelta,
  cvPredict,
  gameFeature,
  scoreOutcomes,
  type OutcomeGame,
} from "../outcome-test";

function game(i: number, homeStar: boolean): OutcomeGame {
  const home = homeStar ? ["star", "h2", "h3", "h4", "h5"] : ["h1", "h2", "h3", "h4", "h5"];
  const away = ["a1", "a2", "a3", "a4", "a5"];
  const poss = Array.from({ length: 100 }, (_, k) => ({
    offenseIsHome: k % 2 === 0,
    off: k % 2 === 0 ? home : away,
    def: k % 2 === 0 ? away : home,
    points: 1,
  }));
  return {
    gameId: String(i),
    date: "2025-01-01",
    homeTeamId: "H",
    awayTeamId: "A",
    margin: homeStar ? 10 + (i % 3) : -2 + (i % 3),
    poss,
  };
}

describe("outcome test helpers", () => {
  it("turns ratings into a home-minus-away possession sum", () => {
    const games = [game(0, true)];
    const exposure = new Map([...games[0]!.poss[0]!.off, ...games[0]!.poss[0]!.def].map((id) => [id, 1000]));
    const ratings = new Map([["star", 4]]);
    // star plays 100 possessions at +4 per 100; unrated players use the mean (4).
    const [x] = gameFeature(games, ratings, exposure);
    assert.ok(Math.abs(x! - (100 * 5 * 4 - 100 * 5 * 4) / 100) < 1e-9);
    const [y] = gameFeature(games, new Map([["star", 4], ["h2", 0], ["a1", 0]]), exposure);
    assert.ok(y! > 0);
  });

  it("recovers a linear relation out of fold", () => {
    const x = Array.from({ length: 200 }, (_, i) => i / 10);
    const y = x.map((v) => 3 + 2 * v);
    const pred = cvPredict([x], y);
    for (let i = 0; i < y.length; i++) assert.ok(Math.abs(pred[i]! - y[i]!) < 1e-6);
  });

  it("calls identical predictions no clear difference", () => {
    const y = Array.from({ length: 50 }, (_, i) => i % 7);
    const p = y.map((v) => v + 1);
    const d = bootDelta(p, p, y, 200);
    assert.equal(d.delta, 0);
    assert.equal(d.verdict, "no clear difference");
  });

  it("scores a rating that knows who the star is above one that doesn't", () => {
    const games = Array.from({ length: 120 }, (_, i) => game(i, i % 2 === 0));
    const exposure = new Map<string, number>();
    for (const g of games) for (const p of g.poss) for (const id of [...p.off, ...p.def]) exposure.set(id, (exposure.get(id) ?? 0) + 1);
    const flat = new Map([...exposure.keys()].map((id) => [id, 0]));
    const knows = new Map(flat);
    knows.set("star", 10);
    const report = scoreOutcomes(
      "toy",
      games,
      {
        [PUBLISHED]: gameFeature(games, flat, exposure),
        Knows: gameFeature(games, knows, exposure),
      },
      null
    );
    const knowsRow = report.results.find((r) => r.name === "Knows")!;
    assert.ok(knowsRow.r2 > 0.9);
    assert.equal(knowsRow.vsPublished!.verdict, "better");
  });
});

import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import type { AnchoredLineupPossession } from "../anchored-lineup";
import {
  BOX_FORWARD_CONFIG,
  BOX_FORWARD_FEATURES,
  BOX_FORWARD_VERSION,
  boxForwardBlock,
  boxForwardFeatures,
  boxForwardRatings,
  boxPriorV2ForSeason,
  buildBoxPriorV2,
  calibrateBoxForward,
  calibrationAt,
  fitBoxForwardCalibration,
  loadBoxForwardWeights,
  onCourtNetPer100,
  playerShrink,
  solveBoxForward,
  type BoxForwardWeights,
} from "../box-forward";
import {
  BOX_PRIOR_CONFIG,
  BOX_PRIOR_FEATURES,
  BOX_PRIOR_VERSION,
  addBoxScoreToTotals,
  type BoxPriorFit,
  type BoxPriorTotals,
} from "../box-prior";
import { BOX_BLEND_ABILITY_INPUT, BOX_BLEND_MODEL_VERSION, publishBoxBlend } from "../published-rating";

const NF = BOX_FORWARD_FEATURES.length;
const PLAYERS = Array.from({ length: 30 }, (_, i) => `p${i}`);

function lcg(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

function lineups(count: number, rnd: () => number) {
  const rows: { off: string[]; def: string[] }[] = [];
  for (let k = 0; k < count; k++) {
    const shuffled = [...PLAYERS].sort(() => rnd() - 0.5);
    rows.push({ off: shuffled.slice(0, 5), def: shuffled.slice(5, 10) });
  }
  return rows;
}

function weightedSd(m: ReadonlyMap<string, number>, w: ReadonlyMap<string, number>) {
  let W = 0;
  let s1 = 0;
  let s2 = 0;
  for (const [id, v] of m) {
    const a = w.get(id)!;
    W += a;
    s1 += a * v;
    s2 += a * v * v;
  }
  return Math.sqrt(s2 / W - (s1 / W) ** 2);
}

function randomWindow(rnd: () => number) {
  return {
    features: new Map(PLAYERS.map((id) => [id, Array.from({ length: NF }, () => rnd() * 2 - 1)])),
    v1: new Map(PLAYERS.map((id) => [id, rnd() * 4 - 2])),
    appearances: new Map(PLAYERS.map((id, i) => [id, 1000 + 100 * i])),
  };
}

describe("box forward", () => {
  it("shrinks on-court net toward 0 with pseudo appearances", () => {
    const rows: AnchoredLineupPossession[] = [
      { offenseIsHome: true, offensePlayerIds: ["a", "b", "c", "d", "e"], defensePlayerIds: ["f", "g", "h", "i", "j"], points: 3 },
    ];
    const net = onCourtNetPer100(rows, 1500);
    assert.equal(net.get("a"), 300 / 1501);
    assert.equal(net.get("f"), -300 / 1501);
  });

  it("recovers a planted forward effect from later possessions", () => {
    const rnd = lcg(11);
    const window = randomWindow(rnd);
    const k = BOX_FORWARD_FEATURES.indexOf("drblPbp100");
    const edge = 0.02;
    const rows: AnchoredLineupPossession[] = lineups(4000, rnd).map(({ off, def }, i) => {
      const z = (id: string) => window.features.get(id)![k]!;
      const s = off.reduce((a, id) => a + z(id), 0) - def.reduce((a, id) => a + z(id), 0);
      return { offenseIsHome: i % 2 === 0, offensePlayerIds: off, defensePlayerIds: def, points: 1.1 + edge * s };
    });
    const half = rows.length / 2;
    const w = solveBoxForward([boxForwardBlock(rows.slice(0, half), window), boxForwardBlock(rows.slice(half), window)]);
    assert.equal(w.length, NF);
    assert.ok(Math.abs(w[k]! - 100 * edge) < 1e-4, String(w[k]));
    for (const [i, v] of w.entries()) if (i !== k) assert.ok(Math.abs(v) < 1e-4, `${BOX_FORWARD_FEATURES[i]} ${v}`);
  });

  it("skips non-5v5 possessions and refuses an empty fit", () => {
    const window = { features: new Map([["a", new Array(NF).fill(1)]]), v1: new Map([["a", 1]]), appearances: new Map([["a", 1]]) };
    const block = boxForwardBlock([{ offenseIsHome: true, offensePlayerIds: ["a"], defensePlayerIds: ["b"], points: 2 }], window);
    assert.equal(block.possessions, 0);
    assert.throws(() => solveBoxForward([]));
    assert.throws(() => calibrateBoxForward([], new Array(NF).fill(0)));
  });

  it("calibrates the blend to the scoreboard's points per 100", () => {
    const rnd = lcg(23);
    const window = randomWindow(rnd);
    const weights = Array.from({ length: NF }, (_, i) => (i % 3) - 1);
    const forward = boxForwardRatings(window.features, weights);
    const s = weightedSd(window.v1, window.appearances) / weightedSd(forward, window.appearances);
    const share = BOX_FORWARD_CONFIG.v1Share;
    const blend = (id: string) => share * window.v1.get(id)! + (1 - share) * s * forward.get(id)!;
    const slope = 0.0069;
    const rows: AnchoredLineupPossession[] = lineups(3000, rnd).map(({ off, def }, i) => {
      const x = off.reduce((a, id) => a + blend(id), 0) - def.reduce((a, id) => a + blend(id), 0);
      return { offenseIsHome: i % 2 === 0, offensePlayerIds: off, defensePlayerIds: def, points: 1.1 + (i % 2 === 0 ? 0.03 : 0) + slope * x };
    });
    const c = calibrateBoxForward([boxForwardBlock(rows, window)], weights);
    assert.ok(Math.abs(c - 100 * slope) < 1e-6, String(c));
    assert.ok(Math.abs(fitBoxForwardCalibration([boxForwardBlock(rows, window)], weights).sse) < 1e-6);
  });

  it("scores the per-player shrink by error on later points", () => {
    const rnd = lcg(29);
    const window = randomWindow(rnd);
    const weights = Array.from({ length: NF }, (_, i) => (i % 3) - 1);
    const forward = boxForwardRatings(window.features, weights);
    const s = weightedSd(window.v1, window.appearances) / weightedSd(forward, window.appearances);
    const share = BOX_FORWARD_CONFIG.v1Share;
    const k = 2000;
    const shrunk = (id: string) =>
      playerShrink(window.appearances.get(id)!, k) * (share * window.v1.get(id)! + (1 - share) * s * forward.get(id)!);
    const slope = 0.008;
    const rows: AnchoredLineupPossession[] = lineups(3000, rnd).map(({ off, def }, i) => {
      const x = off.reduce((a, id) => a + shrunk(id), 0) - def.reduce((a, id) => a + shrunk(id), 0);
      return { offenseIsHome: i % 2 === 0, offensePlayerIds: off, defensePlayerIds: def, points: 1.1 + slope * x };
    });
    const right = fitBoxForwardCalibration([boxForwardBlock(rows, window, k)], weights);
    const none = fitBoxForwardCalibration([boxForwardBlock(rows, window)], weights);
    assert.ok(Math.abs(right.calibration - 100 * slope) < 1e-6, String(right.calibration));
    assert.ok(right.sse < 1e-6 && none.sse > right.sse, `${right.sse} ${none.sse}`);
    assert.equal(playerShrink(500, 0), 1);
    assert.equal(playerShrink(0, 100), 0);
    assert.equal(playerShrink(300, 100), 0.75);
  });

  it("blends half v1 with forward rescaled to v1's spread, then calibrates and shrinks per player", () => {
    const rnd = lcg(5);
    const boxFeatures = new Map(PLAYERS.map((id) => [id, Array.from({ length: BOX_PRIOR_FEATURES.length }, () => rnd() * 2 - 1)]));
    const appearances = new Map(PLAYERS.map((id, i) => [id, 1000 + 100 * i]));
    const rows: AnchoredLineupPossession[] = lineups(500, rnd).map(({ off, def }, i) => ({
      offenseIsHome: i % 2 === 0,
      offensePlayerIds: off,
      defensePlayerIds: def,
      points: i % 3,
    }));
    const fit: BoxPriorFit = {
      version: BOX_PRIOR_VERSION,
      config: BOX_PRIOR_CONFIG,
      possessions: rows.length,
      weightsPer100: new Array(BOX_PRIOR_FEATURES.length).fill(0),
      ratingsPer100: new Map(PLAYERS.map((id, i) => [id, (i - 15) / 10])),
    };
    const drblPbp100 = new Map(PLAYERS.map((id, i) => [id, i % 7]));
    const weights = Array.from({ length: NF }, (_, i) => (i % 3) - 1);
    const calibration = 0.7;
    const playerShrinkK = 1000;
    const v2 = buildBoxPriorV2({
      fit,
      boxFeatures,
      forwardWeightsPer100: weights,
      calibration,
      playerShrinkK,
      appearances,
      rows,
      drblPbp100,
      rawAbilityRate: new Map(),
      possessions: new Map(),
    });
    const forward = boxForwardRatings(boxForwardFeatures(boxFeatures, appearances, drblPbp100, rows), weights);
    const v1 = new Map(PLAYERS.map((id) => [id, BOX_PRIOR_CONFIG.boxScale * fit.ratingsPer100.get(id)!]));
    assert.ok(Math.abs(v2.forwardScale - weightedSd(v1, appearances) / weightedSd(forward, appearances)) < 1e-9);
    assert.equal(v2.fitSource, "season");
    const share = BOX_FORWARD_CONFIG.v1Share;
    assert.equal(v2.ratings.size, PLAYERS.length);
    for (const id of PLAYERS) {
      const n = appearances.get(id)!;
      const want =
        calibration * (n / (n + playerShrinkK)) * (share * v1.get(id)! + (1 - share) * v2.forwardScale * forward.get(id)!);
      assert.ok(Math.abs(v2.ratings.get(id)! - want) < 1e-9, id);
    }
  });

  it("uses the frozen box weights when the season is too short to fit", () => {
    const totals: BoxPriorTotals = new Map();
    addBoxScoreToTotals(
      totals,
      PLAYERS.slice(0, 10).map((id, i) => ({
        playerId: id,
        playerName: id,
        teamId: i < 5 ? "H" : "A",
        starter: i % 5 < 3,
        minutes: 20 + i,
        points: i,
        fieldGoalsMade: 1,
        fieldGoalsAttempted: 3 + (i % 4),
        threePointersMade: 0,
        threePointersAttempted: i % 3,
        freeThrowsMade: 0,
        freeThrowsAttempted: i % 2,
        offensiveRebounds: i % 2,
        defensiveRebounds: i % 5,
        rebounds: (i % 2) + (i % 5),
        assists: i % 3,
        steals: i % 2,
        blocks: i % 3,
        turnovers: 1,
        personalFouls: 2,
      }))
    );
    const rows: AnchoredLineupPossession[] = Array.from({ length: 50 }, (_, i) => ({
      offenseIsHome: i % 2 === 0,
      offensePlayerIds: i % 2 === 0 ? PLAYERS.slice(0, 5) : PLAYERS.slice(5, 10),
      defensePlayerIds: i % 2 === 0 ? PLAYERS.slice(5, 10) : PLAYERS.slice(0, 5),
      points: i % 3,
    }));
    const appearances = new Map(PLAYERS.slice(0, 10).map((id) => [id, 50]));
    const weights: BoxForwardWeights = {
      version: BOX_FORWARD_VERSION,
      fittedAt: "2026-10-10T00:00:00.000Z",
      features: [...BOX_FORWARD_FEATURES],
      weightsPer100: new Array(NF).fill(0.1),
      calibration: [
        { games: 50, calibration: 0.2 },
        { games: 600, calibration: 0.66 },
      ],
      playerShrinkK: 100,
      fallbackBoxWeightsPer100: BOX_PRIOR_FEATURES.map((_, i) => (i === 0 ? 1 : 0)),
      fallbackFrom: "2025-26",
      blocks: [],
    };
    const players = PLAYERS.slice(0, 10).map((id, i) => ({ playerId: id, drblPbp100: i - 5, rawAbilityRate: i - 5, possessions: 50 }));
    const v2 = boxPriorV2ForSeason({ rows, appearances, totals, players, games: 10, weights });
    assert.ok(v2);
    assert.equal(v2.fitSource, "frozen");
    assert.equal(v2.calibration, 0.2);
    assert.equal(v2.windowGames, 10);
    assert.equal(v2.playerShrinkK, 100);
    assert.equal(v2.fit.possessions, 0);
    assert.equal(v2.ratings.size, 10);
    for (const v of v2.ratings.values()) assert.ok(Number.isFinite(v));
    assert.equal(boxPriorV2ForSeason({ rows, appearances, totals: new Map(), players, games: 10, weights }), null);
  });

  it("interpolates the calibration log-linearly in games and holds it flat outside the fitted range", () => {
    const points = [
      { games: 50, calibration: 0.2 },
      { games: 200, calibration: 0.4 },
      { games: 800, calibration: 0.6 },
    ];
    assert.equal(calibrationAt(points, 10), 0.2);
    assert.equal(calibrationAt(points, 50), 0.2);
    assert.ok(Math.abs(calibrationAt(points, 100) - 0.3) < 1e-12);
    assert.ok(Math.abs(calibrationAt(points, 400) - 0.5) < 1e-12);
    assert.equal(calibrationAt(points, 1230), 0.6);
    assert.throws(() => calibrationAt([], 100));
  });

  it("loads the tracked weights and rejects a file fit on other features", async () => {
    const tracked = await loadBoxForwardWeights();
    assert.ok(tracked, "drbl/models/box-forward-weights.json missing or stale");
    assert.equal(tracked.weightsPer100.length, NF);
    assert.ok(tracked.calibration.length > 0 && tracked.calibration.every((p) => p.calibration > 0));
    assert.equal(tracked.fallbackBoxWeightsPer100.length, BOX_PRIOR_FEATURES.length);
    const dir = await mkdtemp(path.join(tmpdir(), "box-forward-"));
    const bad = path.join(dir, "w.json");
    await writeFile(bad, JSON.stringify({ ...tracked, features: [...BOX_FORWARD_FEATURES].reverse() }));
    assert.equal(await loadBoxForwardWeights(bad), null);
    await writeFile(bad, JSON.stringify({ ...tracked, calibration: 0.66 }));
    assert.equal(await loadBoxForwardWeights(bad), null);
    await writeFile(bad, JSON.stringify({ ...tracked, calibration: [{ games: 100, calibration: 0.5 }, { games: 50, calibration: 0.4 }] }));
    assert.equal(await loadBoxForwardWeights(bad), null);
    await writeFile(bad, JSON.stringify({ ...tracked, playerShrinkK: -1 }));
    assert.equal(await loadBoxForwardWeights(bad), null);
    await writeFile(bad, JSON.stringify({ ...tracked, playerShrinkK: undefined }));
    assert.equal(await loadBoxForwardWeights(bad), null);
    assert.equal(await loadBoxForwardWeights(path.join(dir, "missing.json")), null);
    assert.equal(tracked.version, BOX_FORWARD_VERSION);
  });
});

describe("publishBoxBlend", () => {
  const row = (playerId: string, drbl100: number, actualPossessions = 1000) => ({
    playerId,
    drbl100,
    actualPossessions,
    forecastPossessions: 5000,
    replacementLevelRate: -2,
    pointsPerWin: 30,
    rank: 9,
    drblBox100: 4,
  });

  it("moves the play-by-play rate to drblPbp100 and re-ranks on the blend", () => {
    const out = publishBoxBlend([row("a", 3), row("b", 1)], new Map([["a", 0.5], ["b", 2.345]]));
    assert.deepEqual(out.map((r) => [r.playerId, r.rank, r.drbl100, r.drblPbp100]), [
      ["b", 1, 2.35, 1],
      ["a", 2, 0.5, 3],
    ]);
    assert.equal(out[0]!.forecastImpact, Number((((2.345 + 2) * 5000) / 100).toFixed(2)));
    assert.equal(out[0]!.forecastWar, Number((((2.345 + 2) * 5000) / 100 / 30).toFixed(4)));
    assert.equal(out[0]!.publishedAbilityInput, BOX_BLEND_ABILITY_INPUT);
    assert.equal(out[0]!.abilityModelVersion, BOX_BLEND_MODEL_VERSION);
    assert.equal("drblBox100" in out[0]!, false);
  });

  it("keeps an existing drblPbp100 when republishing", () => {
    const [r] = publishBoxBlend([{ ...row("a", 0.5), drblPbp100: 3 }], new Map([["a", 1]]));
    assert.equal(r!.drblPbp100, 3);
  });

  it("drops a rare missing player instead of writing 0, and refuses when many are missing", () => {
    const many = Array.from({ length: 200 }, (_, i) => row(`p${i}`, 1));
    const ratings = new Map(many.slice(1).map((r) => [r.playerId, 1]));
    const logged: string[] = [];
    const out = publishBoxBlend(many, ratings, (m) => logged.push(m));
    assert.equal(out.length, 199);
    assert.equal(out.some((r) => r.playerId === "p0"), false);
    assert.equal(logged.length, 1);
    assert.throws(() => publishBoxBlend(many, new Map([["p1", 1]]), () => {}));
  });
});

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
  buildBoxPriorV2,
  loadBoxForwardWeights,
  onCourtNetPer100,
  solveBoxForward,
} from "../box-forward";
import { BOX_PRIOR_CONFIG, BOX_PRIOR_FEATURES, BOX_PRIOR_VERSION, attachBoxPrior, type BoxPriorFit } from "../box-prior";

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
    const features = new Map(PLAYERS.map((id) => [id, Array.from({ length: NF }, () => rnd() * 2 - 1)]));
    const k = BOX_FORWARD_FEATURES.indexOf("drbl100");
    const edge = 0.02;
    const rows: AnchoredLineupPossession[] = lineups(4000, rnd).map(({ off, def }, i) => {
      const s = off.reduce((a, id) => a + features.get(id)![k]!, 0) - def.reduce((a, id) => a + features.get(id)![k]!, 0);
      return { offenseIsHome: i % 2 === 0, offensePlayerIds: off, defensePlayerIds: def, points: 1.1 + edge * s };
    });
    const half = rows.length / 2;
    const w = solveBoxForward([boxForwardBlock(rows.slice(0, half), features), boxForwardBlock(rows.slice(half), features)]);
    assert.equal(w.length, NF);
    assert.ok(Math.abs(w[k]! - 100 * edge) < 1e-4, String(w[k]));
    for (const [i, v] of w.entries()) if (i !== k) assert.ok(Math.abs(v) < 1e-4, `${BOX_FORWARD_FEATURES[i]} ${v}`);
  });

  it("skips non-5v5 possessions and refuses an empty fit", () => {
    const features = new Map([["a", new Array(NF).fill(1)]]);
    const block = boxForwardBlock(
      [{ offenseIsHome: true, offensePlayerIds: ["a"], defensePlayerIds: ["b"], points: 2 }],
      features
    );
    assert.equal(block.possessions, 0);
    assert.throws(() => solveBoxForward([]));
  });

  it("blends half v1 with forward rescaled to v1's spread", () => {
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
    const drbl100 = new Map(PLAYERS.map((id, i) => [id, i % 7]));
    const weights = Array.from({ length: NF }, (_, i) => (i % 3) - 1);
    const v2 = buildBoxPriorV2({
      fit,
      boxFeatures,
      forwardWeightsPer100: weights,
      appearances,
      rows,
      drbl100,
      rawAbilityRate: new Map(),
      possessions: new Map(),
    });
    const forward = boxForwardRatings(boxForwardFeatures(boxFeatures, appearances, drbl100, rows), weights);
    const sd = (m: ReadonlyMap<string, number>) => {
      let W = 0;
      let s1 = 0;
      let s2 = 0;
      for (const [id, v] of m) {
        const w = appearances.get(id)!;
        W += w;
        s1 += w * v;
        s2 += w * v * v;
      }
      return Math.sqrt(s2 / W - (s1 / W) ** 2);
    };
    const v1 = new Map(PLAYERS.map((id) => [id, BOX_PRIOR_CONFIG.boxScale * fit.ratingsPer100.get(id)!]));
    assert.ok(Math.abs(v2.forwardScale - sd(v1) / sd(forward)) < 1e-9);
    const share = BOX_FORWARD_CONFIG.v1Share;
    assert.equal(v2.ratings.size, PLAYERS.length);
    for (const id of PLAYERS) {
      const want = share * v1.get(id)! + (1 - share) * v2.forwardScale * forward.get(id)!;
      assert.ok(Math.abs(v2.ratings.get(id)! - want) < 1e-9, id);
    }
  });

  it("writes rounded values and leaves players without one absent", () => {
    const out = attachBoxPrior(
      [{ playerId: "a" }, { playerId: "b", drblBox100: 9 }],
      new Map([["a", 1.23456]])
    );
    assert.equal(out[0]!.drblBox100, 1.23);
    assert.equal("drblBox100" in out[1]!, false);
  });

  it("loads the tracked weights and rejects a file fit on other features", async () => {
    const tracked = await loadBoxForwardWeights();
    assert.ok(tracked, "drbl/models/box-forward-weights.json missing or stale");
    assert.equal(tracked.weightsPer100.length, NF);
    const dir = await mkdtemp(path.join(tmpdir(), "box-forward-"));
    const bad = path.join(dir, "w.json");
    await writeFile(bad, JSON.stringify({ ...tracked, features: [...BOX_FORWARD_FEATURES].reverse() }));
    assert.equal(await loadBoxForwardWeights(bad), null);
    assert.equal(await loadBoxForwardWeights(path.join(dir, "missing.json")), null);
    assert.equal(tracked.version, BOX_FORWARD_VERSION);
  });
});

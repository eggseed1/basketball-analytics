import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertWidthMonotoneInN,
  fitQ0,
  fitQ1,
  fitQ2,
  intervalsFromWidths,
  pinballLoss,
  widthsOf,
} from "../research-direct-quantile-uncertainty-v2";

describe("research-direct-quantile-uncertainty-v2", () => {
  it("pinball is asymmetric", () => {
    assert.ok(Math.abs(pinballLoss(1, 0.8) - 0.8) < 1e-12);
    assert.ok(Math.abs(pinballLoss(-1, 0.8) - 0.2) < 1e-12);
  });

  it("Q0 uses nested empirical quantiles", () => {
    const e = [0.1, 0.5, 1, 2, 3, 4, 5, 10];
    const p = fitQ0(e);
    assert.ok(p.a50 <= p.a80 && p.a80 <= p.a95);
  });

  it("Q1 nests and is monotone in N", () => {
    const ns = [100, 200, 400, 800];
    const e = ns.map((n) => 40 / Math.sqrt(n));
    const p = fitQ1(e, ns);
    assert.ok(p.c50 <= p.c80 && p.c80 <= p.c95);
    assertWidthMonotoneInN("Q1_INVERSE_SQRT", p, 50, 2000);
    const wLo = widthsOf("Q1_INVERSE_SQRT", 100, p);
    const wHi = widthsOf("Q1_INVERSE_SQRT", 1600, p);
    assert.ok(wLo.w80 >= wHi.w80);
  });

  it("Q2 fits and nests", () => {
    const ns = [80, 150, 300, 600, 1200, 2400];
    const e2 = ns.map((n, i) => Math.sqrt(1.2 ** 2 + (40 + i) ** 2 / n));
    const fit = fitQ2(e2, ns);
    assert.ok(fit.converged);
    assert.ok(fit.floor50 <= fit.floor80 && fit.floor80 <= fit.floor95);
    assertWidthMonotoneInN("Q2_FLOOR_PLUS_SAMPLING", fit, 50, 5000);
  });

  it("intervals preserve center", () => {
    const iv = intervalsFromWidths(2, { w50: 1, w80: 2, w95: 3 });
    assert.equal((iv.pi80Lo + iv.pi80Hi) / 2, 2);
    assert.ok(iv.pi95Lo <= iv.pi80Lo && iv.pi80Lo <= iv.pi50Lo);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertMonotoneSigma,
  computeResearchPredictionIntervalsV1,
  empiricalAbsZQuantiles,
  fitU0,
  fitU1,
  fitU2,
  sigmaU0,
  sigmaU1,
  sigmaU2,
  weightedIntervalScore,
} from "../research-predictive-uncertainty-v1";

describe("research-predictive-uncertainty-v1", () => {
  it("fits U0 as RMSE of residuals", () => {
    const e = [1, -1, 2, -2];
    const { s } = fitU0(e);
    assert.ok(Math.abs(s - Math.sqrt(2.5)) < 1e-12);
  });

  it("fits U1 closed form", () => {
    const errors = [2, -2];
    const ns = [100, 400];
    const { c } = fitU1(errors, ns);
    // c^2 = mean(e^2 N) = (4*100 + 4*400)/2 = 1000
    assert.ok(Math.abs(c - Math.sqrt(1000)) < 1e-10);
  });

  it("U2 NLL improves vs bad params and is monotone in N", () => {
    const ns = [50, 100, 200, 400, 800];
    const errors = ns.map((n) => 3 / Math.sqrt(n));
    const fit = fitU2(errors, ns);
    assert.ok(fit.converged);
    assertMonotoneSigma("U2_FLOOR_PLUS_SAMPLING", fit, 50, 800);
    assert.ok(sigmaU2(50, fit) >= sigmaU2(800, fit) - 1e-12);
  });

  it("builds nested intervals around locked point", () => {
    const iv = computeResearchPredictionIntervalsV1(1.5, 1000, {
      modelType: "U0_CONSTANT",
      params: { s: 2 },
      quantiles: { q50: 0.7, q80: 1.3, q95: 2.0 },
    });
    assert.ok(iv.researchPI50Lo > iv.researchPI80Lo);
    assert.ok(iv.researchPI80Lo > iv.researchPI95Lo);
    assert.ok(iv.researchPI50Hi < iv.researchPI80Hi);
    assert.ok(iv.researchPI80Hi < iv.researchPI95Hi);
    assert.equal((iv.researchPI50Lo + iv.researchPI50Hi) / 2, 1.5);
  });

  it("computes finite WIS", () => {
    const w = weightedIntervalScore(0, 0, -1, 1, -2, 2, -3, 3);
    assert.ok(Number.isFinite(w) && w > 0);
  });

  it("empirical quantiles are ordered", () => {
    const e = [1, -2, 3, -0.5, 4];
    const s = e.map(() => 1);
    const q = empiricalAbsZQuantiles(e, s);
    assert.ok(q.q50 <= q.q80 && q.q80 <= q.q95);
  });

  it("U0/U1 sigma helpers", () => {
    assert.equal(sigmaU0(999, { s: 2 }), 2);
    assert.ok(Math.abs(sigmaU1(100, { c: 10 }) - 1) < 1e-12);
  });
});

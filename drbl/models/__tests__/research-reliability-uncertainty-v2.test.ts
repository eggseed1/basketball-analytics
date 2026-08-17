import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertPointEstimateIndependentOfReliability,
  fitReliabilityScale,
  fitRobustScale,
  intervalsFromSigma,
  sigmaWithReliability,
  standardizeFeature,
} from "../research-reliability-uncertainty-v2";

describe("research-reliability-uncertainty-v2", () => {
  it("robust scale uses training IQR", () => {
    const s = fitRobustScale([0.5, 1, 2, 3, 4, 8]);
    assert.ok(s.iqrLog1p > 0);
    const z = standardizeFeature(2, s);
    assert.ok(Number.isFinite(z));
  });

  it("gammas nonnegative and increase sigma", () => {
    const p = { sigmaFloor: 1, c: 40, gammas: [0.2] };
    const lo = sigmaWithReliability(400, p, [0]);
    const hi = sigmaWithReliability(400, p, [1]);
    assert.ok(hi > lo);
    assert.throws(() =>
      sigmaWithReliability(400, { ...p, gammas: [-0.1] }, [1])
    );
  });

  it("fit recovers nonnegative gammas", () => {
    const ns = Array.from({ length: 60 }, (_, i) => 100 + i * 30);
    const z = ns.map((_, i) => [(i % 10) / 5 - 1]);
    const errors = ns.map((n, i) => {
      const sig = Math.sqrt(1.2 ** 2 + 50 ** 2 / n) * Math.exp(0.3 * z[i]![0]!);
      return ((i % 2 === 0 ? 1 : -1) * sig * 0.8);
    });
    const fit = fitReliabilityScale(errors, ns, z, 1);
    assert.ok(fit.converged);
    assert.ok(fit.gammas[0]! >= -1e-12);
  });

  it("intervals nest and center", () => {
    const iv = intervalsFromSigma(2, 1.5, { q50: 0.7, q80: 1.3, q95: 2 });
    assert.equal((iv.pi80Lo + iv.pi80Hi) / 2, 2);
    assert.ok(iv.w50 <= iv.w80 && iv.w80 <= iv.w95);
  });

  it("point estimate independent of reliability", () => {
    assertPointEstimateIndependentOfReliability(
      1.2,
      800,
      (raw, n) => (n / (n + 1600)) * raw,
      [
        { R1: 0, R2: 0, R3: 0 },
        { R1: 5, R2: 3, R3: 40 },
      ]
    );
  });
});

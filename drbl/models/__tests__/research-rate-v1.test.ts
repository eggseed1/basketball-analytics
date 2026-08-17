import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CALIBRATION_IDENTITY_VERSION,
  CALIBRATION_ZERO_LINEAR_VERSION,
  computeResearchRateV1,
  fitAffineOLS,
  fitZeroLinearSlope,
} from "../research-rate-v1";
import { RESEARCH_K } from "../research-ability-v1";

describe("research-rate-v1", () => {
  it("identity equals EB1600(raw)", () => {
    const raw = 4;
    const n = 800;
    const r = computeResearchRateV1(
      { rawAbilityRate: raw, actualCombinedPossessionAppearances: n },
      {
        calibrationType: "identity",
        b: 1,
        calibrationVersion: CALIBRATION_IDENTITY_VERSION,
      }
    );
    const expected = (n / (n + RESEARCH_K)) * raw;
    assert.ok(Math.abs(r.researchFinalDRBL100 - expected) < 1e-12);
    assert.equal(r.posteriorOperationsApplied, 1);
    assert.equal(r.calibrationLayerCount, 0);
    assert.equal(r.researchFinalDRBL100, r.researchPosteriorP100);
  });

  it("zero-linear multiplies posterior and preserves zero", () => {
    const b = 1.25;
    const r = computeResearchRateV1(
      { rawAbilityRate: 3, actualCombinedPossessionAppearances: 1600 },
      {
        calibrationType: "zero_linear",
        b,
        calibrationVersion: CALIBRATION_ZERO_LINEAR_VERSION,
      }
    );
    const post = (1600 / (1600 + RESEARCH_K)) * 3;
    assert.ok(Math.abs(r.researchFinalDRBL100 - b * post) < 1e-12);
    assert.equal(r.calibrationLayerCount, 1);

    const z = computeResearchRateV1(
      { rawAbilityRate: 0, actualCombinedPossessionAppearances: 900 },
      {
        calibrationType: "zero_linear",
        b,
        calibrationVersion: CALIBRATION_ZERO_LINEAR_VERSION,
      }
    );
    assert.equal(z.researchFinalDRBL100, 0);
  });

  it("fitZeroLinearSlope is OLS through origin", () => {
    const x = [1, 2, 3];
    const y = [2, 4, 6];
    assert.ok(Math.abs(fitZeroLinearSlope(x, y) - 2) < 1e-12);
  });

  it("fitAffineOLS recovers known line", () => {
    const x = [0, 1, 2, 3];
    const y = [1, 3, 5, 7]; // a=1, b=2
    const { a, b } = fitAffineOLS(x, y);
    assert.ok(Math.abs(a - 1) < 1e-10);
    assert.ok(Math.abs(b - 2) < 1e-10);
  });
});

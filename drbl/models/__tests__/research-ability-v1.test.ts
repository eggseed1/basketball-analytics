import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { empiricalBayesRate } from "../leaderboard";
import {
  RESEARCH_K,
  RESEARCH_POSTERIOR_LAYER_COUNT,
  RESEARCH_PRIOR_MEAN,
  computeResearchAbilityV1,
  wrongPathEb1600OfDrblP,
  wrongPathEb1600OfEb200,
  wrongPathEb200OfEb1600,
} from "../research-ability-v1";

describe("research-ability-v1", () => {
  it("matches EB1600(raw) identity", () => {
    const cases = [
      { raw: 5.0, n: 500 },
      { raw: -2.5, n: 1200 },
      { raw: 0, n: 800 },
      { raw: 3.2, n: 50 },
      { raw: 1.1, n: 10000 },
    ];
    for (const c of cases) {
      const r = computeResearchAbilityV1({
        rawAbilityRate: c.raw,
        actualCombinedPossessionAppearances: c.n,
      });
      const expected = empiricalBayesRate(
        c.raw,
        c.n,
        RESEARCH_PRIOR_MEAN,
        RESEARCH_K
      ).posterior;
      assert.ok(Math.abs(r.researchDRBL100 - expected) < 1e-12);
      assert.equal(r.posteriorOperationsApplied, 1);
      assert.equal(r.researchK, 1600);
      assert.equal(r.researchPriorMean, 0);
    }
  });

  it("does not equal wrong double-shrink paths", () => {
    const raw = 4.5;
    const n = 700;
    const r = computeResearchAbilityV1({
      rawAbilityRate: raw,
      actualCombinedPossessionAppearances: n,
    }).researchDRBL100;
    assert.notEqual(r, wrongPathEb1600OfEb200(raw, n));
    assert.notEqual(r, wrongPathEb200OfEb1600(raw, n));
    const drblP = empiricalBayesRate(raw, n, 0, 200).posterior;
    assert.notEqual(r, wrongPathEb1600OfDrblP(drblP, n));
  });

  it("ignores legacy fusion inputs by API (shadow independent)", () => {
    const a = computeResearchAbilityV1({
      rawAbilityRate: 2.2,
      actualCombinedPossessionAppearances: 1500,
    });
    // Perturbing unused legacy values cannot be passed into the function.
    const b = computeResearchAbilityV1({
      rawAbilityRate: 2.2,
      actualCombinedPossessionAppearances: 1500,
    });
    assert.equal(a.researchDRBL100, b.researchDRBL100);
  });

  it("has no pseudo-exposure in seasonal impact", () => {
    const raw = 3;
    const n = 1000;
    const r = computeResearchAbilityV1({
      rawAbilityRate: raw,
      actualCombinedPossessionAppearances: n,
    });
    assert.ok(
      Math.abs(r.researchSeasonalImpact - (r.researchDRBL100 * n) / 100) < 1e-12
    );
    assert.notEqual(
      r.researchSeasonalImpact,
      (r.researchDRBL100 * (n + RESEARCH_K)) / 100
    );
  });

  it("N=0 returns prior mean", () => {
    const r = computeResearchAbilityV1({
      rawAbilityRate: 9,
      actualCombinedPossessionAppearances: 0,
    });
    assert.equal(r.researchDRBL100, RESEARCH_PRIOR_MEAN);
    assert.equal(r.researchReliability, 0);
  });

  it("large N approaches raw", () => {
    const raw = 2.75;
    const r = computeResearchAbilityV1({
      rawAbilityRate: raw,
      actualCombinedPossessionAppearances: 1_000_000,
    });
    // With k=1600, residual ≈ raw * k/(N+k) ≈ 0.0044
    assert.ok(Math.abs(r.researchDRBL100 - raw) < 0.01);
    assert.ok(r.researchReliability > 0.998);
  });

  it("raw=0 → posterior 0; sign preserved; magnitude shrunk", () => {
    const z = computeResearchAbilityV1({
      rawAbilityRate: 0,
      actualCombinedPossessionAppearances: 400,
    });
    assert.equal(z.researchDRBL100, 0);

    const pos = computeResearchAbilityV1({
      rawAbilityRate: 5,
      actualCombinedPossessionAppearances: 400,
    });
    const neg = computeResearchAbilityV1({
      rawAbilityRate: -5,
      actualCombinedPossessionAppearances: 400,
    });
    assert.ok(pos.researchDRBL100 > 0);
    assert.ok(neg.researchDRBL100 < 0);
    assert.ok(Math.abs(pos.researchDRBL100) <= 5);
    assert.ok(Math.abs(neg.researchDRBL100) <= 5);
    assert.equal(RESEARCH_POSTERIOR_LAYER_COUNT, 1);
  });
});

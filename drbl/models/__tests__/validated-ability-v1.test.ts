import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  VALIDATED_K,
  VALIDATED_POSTERIOR_OPERATION_COUNT,
  computeValidatedAbilityV1,
  isValidatedAbilityShadowEnabled,
} from "../validated-ability-v1";
import { computeResearchAbilityV1 } from "../research-ability-v1";
import { computeResearchRateV1 } from "../research-rate-v1";

describe("validated-ability-v1", () => {
  it("matches N/(N+1600)*raw and research aliases", () => {
    const raw = 2;
    const N = 1600;
    const v = computeValidatedAbilityV1({
      rawAbilityRate: raw,
      actualCombinedPossessionAppearances: N,
    });
    assert.equal(v.validatedReliability, 0.5);
    assert.equal(v.validatedDRBL100, 1);
    assert.equal(v.posteriorOperationsApplied, 1);
    assert.equal(v.validatedPosteriorK, VALIDATED_K);
    assert.equal(v.validatedPriorMean, 0);
    assert.equal(v.validatedCalibration, "identity");
    assert.equal(v.validatedZeroSemantics, "r1_replacement");
    assert.equal(v.aliases.researchDRBL100, v.validatedDRBL100);
    assert.equal(v.aliases.researchFinalDRBL100, v.validatedDRBL100);
    const r = computeResearchAbilityV1({
      rawAbilityRate: raw,
      actualCombinedPossessionAppearances: N,
    });
    const rate = computeResearchRateV1({
      rawAbilityRate: raw,
      actualCombinedPossessionAppearances: N,
    });
    assert.equal(v.validatedDRBL100, r.researchDRBL100);
    assert.equal(v.validatedDRBL100, rate.researchFinalDRBL100);
  });

  it("raw=-2, N=1600 → -1; raw=0 → 0", () => {
    assert.equal(
      computeValidatedAbilityV1({
        rawAbilityRate: -2,
        actualCombinedPossessionAppearances: 1600,
      }).validatedDRBL100,
      -1
    );
    assert.equal(
      computeValidatedAbilityV1({
        rawAbilityRate: 0,
        actualCombinedPossessionAppearances: 500,
      }).validatedDRBL100,
      0
    );
  });

  it("is pure in rawAbilityRate and N only (legacy fields cannot be passed)", () => {
    const base = computeValidatedAbilityV1({
      rawAbilityRate: 3,
      actualCombinedPossessionAppearances: 800,
    });
    // TypeScript surface only accepts raw+N; runtime purity: recompute identical.
    const again = computeValidatedAbilityV1({
      rawAbilityRate: 3,
      actualCombinedPossessionAppearances: 800,
    });
    assert.equal(base.validatedDRBL100, again.validatedDRBL100);
    assert.equal(
      base.posteriorOperationsApplied,
      VALIDATED_POSTERIOR_OPERATION_COUNT
    );
  });

  it("|validated| moves toward |raw| as N increases", () => {
    const raw = 4;
    const a = Math.abs(
      computeValidatedAbilityV1({
        rawAbilityRate: raw,
        actualCombinedPossessionAppearances: 200,
      }).validatedDRBL100
    );
    const b = Math.abs(
      computeValidatedAbilityV1({
        rawAbilityRate: raw,
        actualCombinedPossessionAppearances: 2000,
      }).validatedDRBL100
    );
    assert.ok(b > a);
    assert.ok(b < raw);
  });

  it("shadow feature flag defaults OFF", () => {
    assert.equal(isValidatedAbilityShadowEnabled(process.env), false);
    assert.equal(
      isValidatedAbilityShadowEnabled({ ...process.env, DRBL_VALIDATED_ABILITY_SHADOW: "true" }),
      true
    );
  });
});

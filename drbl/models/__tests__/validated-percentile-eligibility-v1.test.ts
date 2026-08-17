import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  VALIDATED_PERCENTILE_PRODUCT_MIN_MINUTES,
  existingProductQualification,
  hasValidatedDrblEstimate,
  qualifiesForValidatedDrblPercentile,
} from "../validated-percentile-eligibility-v1";
import { computeValidatedAbilityV1 } from "../validated-ability-v1";

describe("validated-percentile-eligibility-v1", () => {
  it("zero DRBL with valid N is a real estimate", () => {
    const v = computeValidatedAbilityV1({
      rawAbilityRate: 0,
      actualCombinedPossessionAppearances: 800,
    });
    assert.equal(v.validatedDRBL100, 0);
    assert.equal(
      hasValidatedDrblEstimate({
        validatedDRBL100: v.validatedDRBL100,
        validatedRawP100: v.validatedRawP100,
        validatedActualPossessions: v.validatedActualPossessions,
      }),
      true
    );
  });

  it("N=0 or nonfinite is not an estimate", () => {
    assert.equal(
      hasValidatedDrblEstimate({
        validatedDRBL100: 0,
        validatedRawP100: 0,
        validatedActualPossessions: 0,
      }),
      false
    );
    assert.equal(
      hasValidatedDrblEstimate({
        validatedDRBL100: NaN,
        validatedRawP100: 1,
        validatedActualPossessions: 100,
      }),
      false
    );
  });

  it("preserves minutes >= 500 exact boundary", () => {
    assert.equal(VALIDATED_PERCENTILE_PRODUCT_MIN_MINUTES, 500);
    assert.equal(existingProductQualification({ minutes: 499 }), false);
    assert.equal(existingProductQualification({ minutes: 500 }), true);
    assert.equal(existingProductQualification({ minutes: 501 }), true);
  });

  it("percentile = qualification AND estimate; no uncertainty fields", () => {
    const v = computeValidatedAbilityV1({
      rawAbilityRate: 2,
      actualCombinedPossessionAppearances: 1600,
    });
    const base = {
      validatedDRBL100: v.validatedDRBL100,
      validatedRawP100: v.validatedRawP100,
      validatedActualPossessions: v.validatedActualPossessions,
    };
    assert.equal(
      qualifiesForValidatedDrblPercentile({ ...base, minutes: 400 }),
      false
    );
    assert.equal(
      qualifiesForValidatedDrblPercentile({ ...base, minutes: 500 }),
      true
    );
    assert.equal(
      qualifiesForValidatedDrblPercentile({
        validatedDRBL100: 0,
        validatedRawP100: 0,
        validatedActualPossessions: 0,
        minutes: 2000,
      }),
      false
    );
  });
});

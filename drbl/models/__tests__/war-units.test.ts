import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  asCombinedCount,
  asCombinedRate,
  asImpact,
  asPairedCount,
  asPairedRate,
  asPPW,
  assertRateExposureIdentity,
  assertRejectMismatchedPairedRateOnCombinedExposure,
  combinedRateToPaired,
  diagnosticWarCombinedConverted,
  diagnosticWarPaired,
  impactFromCombinedRate,
  impactFromPairedRate,
  pairedRateToCombined,
  warFromImpactPoints,
} from "../war-units";

describe("WAR unit conversion identities (M16e1)", () => {
  it("combined and paired formulations share impact", () => {
    const impact = asImpact(100);
    const nCombined = asCombinedCount(10000);
    const nPaired = asPairedCount(5000);
    const rCombined = asCombinedRate(1.0);
    const rPaired = asPairedRate(2.0);

    assert.equal(impactFromCombinedRate(rCombined, nCombined), 100);
    assert.equal(impactFromPairedRate(rPaired, nPaired), 100);
    assert.equal(
      combinedRateToPaired(rCombined, nCombined, nPaired),
      2
    );
    assert.equal(pairedRateToCombined(rPaired, nPaired, nCombined), 1);

    assertRateExposureIdentity({
      rate: 1,
      exposure: 10000,
      impact: 100,
    });
    assertRateExposureIdentity({
      rate: 2,
      exposure: 5000,
      impact: 100,
    });

    assertRejectMismatchedPairedRateOnCombinedExposure({
      pairedRate: 2,
      nCombined: 10000,
      expectedImpactFromPaired: 100,
    });
  });

  it("paired WAR equals combined-converted WAR", () => {
    const paired = diagnosticWarPaired({
      calibratedRatePaired: 8,
      replacementPaired: -2,
      nPaired: 5000,
      pointsPerWin: 40,
    });
    const combined = diagnosticWarCombinedConverted({
      calibratedRatePaired: 8,
      replacementPaired: -2,
      nPaired: 5000,
      nCombined: 10000,
      pointsPerWin: 40,
    });
    assert.equal(paired.aboveReplacementRatePaired, 10);
    assert.equal(paired.seasonalImpactPaired, 500);
    assert.equal(paired.warPaired, 12.5);
    assert.equal(combined.calibratedRateCombined, 4);
    assert.equal(combined.replacementCombined, -1);
    assert.equal(combined.seasonalImpactCombined, 500);
    assert.equal(combined.warCombinedConverted, 12.5);
    assert.ok(
      Math.abs(paired.warPaired - combined.warCombinedConverted) < 1e-12
    );
  });

  it("warFromImpactPoints", () => {
    assert.equal(warFromImpactPoints(asImpact(500), asPPW(40)), 12.5);
  });
});

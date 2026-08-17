import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeWAR } from "../../models/pipeline-value";

describe("WAR dimensional inverse identity", () => {
  it("rate * exposure / 100 reconstructs season impact", () => {
    const rate = 2.6742;
    const n = 10737;
    const impact = (rate * n) / 100;
    assert.ok(Math.abs(impact - rate * n * 0.01) < 1e-9);
    const recon = (100 * impact) / n;
    assert.ok(Math.abs(recon - rate) < 1e-9);
  });

  it("computeWAR uses paired exposure (4.0.1 unit repair)", () => {
    const finalAbility = 8.936940534423483;
    const replacement = -1.4886147765794517;
    const nCombined = 10737;
    const ppw = 38.714285714285715;
    const w = computeWAR({
      finalAbilityDRBL100: finalAbility,
      replacementLevelDRBL100: replacement,
      actualOnCourtPossessions: nCombined, // legacy combined → halved
      pointsPerWin: ppw,
    });
    const above = finalAbility - replacement;
    const impact = (above * (nCombined / 2)) / 100;
    assert.ok(Math.abs(w.aboveReplacementRate - above) < 1e-9);
    assert.ok(Math.abs(w.impactAboveReplacement - impact) < 1e-9);
    assert.ok(Math.abs(w.war - impact / ppw) < 1e-9);
    assert.ok(Math.abs(w.war - 14.457090620289106) < 1e-6);
  });
});

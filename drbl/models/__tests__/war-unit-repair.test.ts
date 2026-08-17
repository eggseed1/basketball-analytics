import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeWAR,
  pairedOnCourtPossessionsFromCombined,
  WAR_EXPOSURE_UNIT,
  WAR_FORMULA_VERSION,
} from "../../models/pipeline-value";

describe("WAR 4.0.1 unit repair", () => {
  it("versions and exposure unit", () => {
    assert.equal(WAR_FORMULA_VERSION, "4.0.1");
    assert.equal(WAR_EXPOSURE_UNIT, "paired_team_possessions");
  });

  it("paired exposure halves former combined WAR", () => {
    const finalAbility = 8.936940534423483;
    const replacement = -1.4886147765794517;
    const nCombined = 10737;
    const nPaired = pairedOnCourtPossessionsFromCombined(nCombined);
    const ppw = 38.714285714285715;

    assert.equal(nPaired, 5368.5);

    const warPaired = computeWAR({
      finalAbilityDRBL100: finalAbility,
      replacementLevelDRBL100: replacement,
      pairedOnCourtPossessions: nPaired,
      pointsPerWin: ppw,
    });
    // Legacy arg name auto-halves combined → same result
    const warLegacyArg = computeWAR({
      finalAbilityDRBL100: finalAbility,
      replacementLevelDRBL100: replacement,
      actualOnCourtPossessions: nCombined,
      pointsPerWin: ppw,
    });

    assert.ok(Math.abs(warPaired.war - 14.457090620289106) < 1e-6);
    assert.ok(Math.abs(warLegacyArg.war - warPaired.war) < 1e-9);
    assert.ok(Math.abs(warPaired.war * 2 - 28.914181240578213) < 1e-6);
  });
});

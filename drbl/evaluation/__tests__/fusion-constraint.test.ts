import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FUSION_CONSTRAINT_TYPE,
  FUSION_CONSTRAINT_DETAIL,
} from "../m16c-dataset";
import {
  fitFusionRidgeFull,
  predictFusionFull,
  toSimplexWeights,
  type FusionStackRow,
} from "../../models/fusion";

describe("fusion constraint (M16c/M16d)", () => {
  it("documents ridge_with_intercept as the prediction constraint", () => {
    assert.equal(FUSION_CONSTRAINT_TYPE, "ridge_with_intercept");
    assert.match(FUSION_CONSTRAINT_DETAIL, /unrestricted ridge/i);
  });

  it("allows signed coefficients (not nonnegative simplex predictions)", () => {
    const rows: FusionStackRow[] = [];
    for (let i = 0; i < 40; i++) {
      const p = (i % 10) - 5;
      const ln = 10 - p; // negatively related to P, positively to a fake target mix
      rows.push({
        playerId: String(i),
        drblP: p,
        drblLn: ln,
        drblB: null,
        targetPer100: 0.2 * p - 0.5 * ln,
        possessions: 1000,
        asOfDate: "2024-01-01",
      });
    }
    const beta = fitFusionRidgeFull(rows, 8);
    // Target rewards negative LN → expect signed (likely negative) wLn
    assert.ok(
      beta.wLn < 0,
      `expected signed negative wLn, got ${beta.wLn}`
    );
    const pred = predictFusionFull(rows[0]!, beta);
    assert.ok(Number.isFinite(pred));
    // Simplex report forces nonnegative — distinct from prediction weights
    const sx = toSimplexWeights(beta);
    assert.ok(sx.wP >= 0 && sx.wLn >= 0 && sx.wB >= 0);
  });
});

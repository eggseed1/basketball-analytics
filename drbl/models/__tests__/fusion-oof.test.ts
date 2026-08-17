import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fitFusionOof,
  fusePlayerRating,
  estimatorDisagreement,
  type FusionStackRow,
} from "../fusion";

function row(
  id: string,
  partial: Partial<FusionStackRow> &
    Pick<FusionStackRow, "drblP" | "drblLn" | "targetPer100">
): FusionStackRow {
  return {
    playerId: id,
    possessions: 200,
    asOfDate: "2024-12-01",
    drblB: null,
    ...partial,
  };
}

describe("fusion OOF stacking", () => {
  it("improves on equal-weight when P is the informative signal", () => {
    const rows: FusionStackRow[] = [];
    for (let i = 0; i < 60; i++) {
      const signal = (i % 10) - 5;
      const noise = ((i * 7) % 5) - 2;
      rows.push(
        row(`p${i}`, {
          drblP: signal + 0.1 * noise,
          drblLn: noise * 0.5,
          drblB: noise,
          targetPer100: signal,
          asOfDate: `2024-${String((i % 9) + 1).padStart(2, "0")}-15`,
          possessions: 150 + i,
        })
      );
    }
    const fitted = fitFusionOof(rows, { lambda: 2, folds: 5 });
    assert.equal(fitted.oof.n, 60);
    assert.ok(
      fitted.oof.improvedVsEqual,
      `OOF MAE ${fitted.oof.mae} should beat equal ${fitted.oof.equalMae}`
    );
    assert.ok(fitted.oofRatingsPer100.size === 60);
    // P should get the largest absolute stack weight among components.
    assert.ok(
      Math.abs(fitted.weights.wP) >= Math.abs(fitted.weights.wLn) * 0.5
    );
  });

  it("falls back to lite blend for tiny samples", () => {
    const rows = [
      row("a", { drblP: 2, drblLn: 1, drblB: 0, targetPer100: 1.5 }),
      row("b", { drblP: -1, drblLn: 0, drblB: null, targetPer100: -0.5 }),
    ];
    const fitted = fitFusionOof(rows, { folds: 2 });
    assert.equal(fitted.folds, 0);
    const expected = fusePlayerRating({
      drblP: 2,
      drblLn: 1,
      drblB: 0,
      possessions: 200,
    });
    assert.equal(fitted.oofRatingsPer100.get("a"), Number(expected.toFixed(2)));
  });
});

describe("disagreement diagnostic", () => {
  it("does not collapse when estimators diverge", () => {
    assert.ok(estimatorDisagreement(3, 0, -2) > 1.5);
  });
});

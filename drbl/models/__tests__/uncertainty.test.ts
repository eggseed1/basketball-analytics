import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calibrateUncertainty,
  fitScaleMultiplier,
  predictHalfWidth,
  rawUncertaintyScale,
  type UncertaintyObservation,
} from "../uncertainty";

function obs(
  id: string,
  partial: Partial<UncertaintyObservation> &
    Pick<UncertaintyObservation, "possessions" | "error">
): UncertaintyObservation {
  return {
    playerId: id,
    disagreement: 0.5,
    asOfDate: "2024-12-01",
    ...partial,
  };
}

describe("uncertainty calibration", () => {
  it("scales down with more possessions", () => {
    assert.ok(
      rawUncertaintyScale(100, 0) > rawUncertaintyScale(400, 0)
    );
  });

  it("achieves near-nominal OOF coverage on scaled noise", () => {
    const rows: UncertaintyObservation[] = [];
    for (let i = 0; i < 80; i++) {
      const possessions = 80 + (i % 10) * 40;
      const disagreement = (i % 5) * 0.2;
      const scale = rawUncertaintyScale(possessions, disagreement);
      // Errors drawn from approx ±scale with ~80% inside 1.28*scale
      const u = ((i * 17) % 100) / 100; // pseudo-uniform
      const signed = u < 0.5 ? -1 : 1;
      const mag = scale * (0.3 + 1.6 * ((i * 13) % 100) / 100);
      rows.push(
        obs(`p${i}`, {
          possessions,
          disagreement,
          error: signed * mag,
          asOfDate: `2024-${String((i % 9) + 1).padStart(2, "0")}-10`,
        })
      );
    }
    const calib = calibrateUncertainty(rows, {
      targetCoverage: 0.8,
      folds: 5,
      tolerance: 0.12,
    });
    assert.ok(calib.scaleMultiplier > 0);
    assert.ok(calib.oof.n >= 60);
    assert.ok(
      Math.abs(calib.oof.coverage - 0.8) <= 0.15,
      `coverage ${calib.oof.coverage} far from 0.8`
    );
    const hwSmall = predictHalfWidth(400, 0.2, calib);
    const hwLarge = predictHalfWidth(80, 1.5, calib);
    assert.ok(hwLarge > hwSmall);
  });

  it("fitScaleMultiplier rises with heavier tails", () => {
    const light = [
      obs("a", { possessions: 200, error: 0.2 }),
      obs("b", { possessions: 200, error: -0.25 }),
      obs("c", { possessions: 200, error: 0.1 }),
      obs("d", { possessions: 200, error: -0.15 }),
      obs("e", { possessions: 200, error: 0.3 }),
    ];
    const heavy = light.map((r, i) =>
      obs(r.playerId, { possessions: 200, error: r.error * (3 + i) })
    );
    const kLight = fitScaleMultiplier(light, { targetCoverage: 0.8 });
    const kHeavy = fitScaleMultiplier(heavy, { targetCoverage: 0.8 });
    assert.ok(kHeavy > kLight);
  });
});

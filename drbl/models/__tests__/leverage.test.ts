import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  leverageLambdaRaw,
  offenseWinProbability,
  normalizeLeverage,
  remainingPossessions,
} from "../leverage";
import type { PossessionEpState } from "../expected-points";

function state(partial: Partial<PossessionEpState> = {}): PossessionEpState {
  return {
    period: 2,
    clockSeconds: 360,
    offenseIsHome: true,
    scoreDiff: 0,
    ...partial,
  };
}

describe("win-probability leverage", () => {
  it("gives higher WP when offense is ahead", () => {
    const behind = offenseWinProbability(state({ scoreDiff: -8 }));
    const ahead = offenseWinProbability(state({ scoreDiff: 8 }));
    assert.ok(ahead > 0.5 && behind < 0.5);
    assert.ok(ahead > behind);
  });

  it("has higher λ in late close games than early blowouts", () => {
    const clutch = leverageLambdaRaw(
      state({ period: 4, clockSeconds: 24, scoreDiff: 0 })
    );
    const blowout = leverageLambdaRaw(
      state({ period: 1, clockSeconds: 600, scoreDiff: 20 })
    );
    assert.ok(
      clutch > blowout * 2,
      `clutch ${clutch} should dwarf blowout ${blowout}`
    );
  });

  it("normalizes so mean λ* = 1", () => {
    const raws = [0.01, 0.02, 0.03];
    const mean = raws.reduce((a, b) => a + b, 0) / raws.length;
    const stars = raws.map((r) => normalizeLeverage(r, mean));
    const meanStar = stars.reduce((a, b) => a + b, 0) / stars.length;
    assert.ok(Math.abs(meanStar - 1) < 1e-9);
  });

  it("counts remaining possessions from clock", () => {
    const rem = remainingPossessions(
      state({ period: 4, clockSeconds: 144 })
    );
    assert.ok(rem > 5 && rem < 20);
  });
});

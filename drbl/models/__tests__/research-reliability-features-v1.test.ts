import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeAppearanceValueDispersion,
  computeSplitHalfPShift,
  computeTemporalSegmentDispersion,
  equalSegmentSizes,
  streamAccounting,
  syntheticStreamFromValues,
} from "../research-reliability-features-v1";

describe("research-reliability-features-v1", () => {
  it("equal segment sizes sum to N and differ by at most 1", () => {
    for (const n of [4, 5, 7, 50, 51, 100]) {
      const s = equalSegmentSizes(n, 4);
      assert.equal(s.reduce((a, b) => a + b, 0), n);
      assert.ok(Math.max(...s) - Math.min(...s) <= 1);
    }
  });

  it("R1 stable segments → 0; volatile → high", () => {
    const stable = syntheticStreamFromValues(
      Array.from({ length: 40 }, () => 0.01)
    );
    const r1s = computeTemporalSegmentDispersion(stable);
    assert.ok(r1s.available);
    assert.ok(Math.abs(r1s.value!) < 1e-12);

    // 10 apps each at rates -2,+2,-2,+2 points/100 → values -0.02,+0.02,...
    const vals: number[] = [];
    for (const rate of [-2, 2, -2, 2]) {
      for (let i = 0; i < 10; i++) vals.push(rate / 100);
    }
    const volatile = syntheticStreamFromValues(vals);
    const r1v = computeTemporalSegmentDispersion(volatile);
    assert.ok(r1v.available);
    assert.ok(r1v.value! > 1.5);
    assert.ok(Math.abs(r1v.pBar! - streamAccounting(volatile).rawAbilityRate) < 1e-12);
  });

  it("R2 absolute half shift", () => {
    const same = syntheticStreamFromValues([
      ...Array(10).fill(0.01),
      ...Array(10).fill(0.01),
    ]);
    const z = computeSplitHalfPShift(same);
    assert.equal(z.value, 0);

    const shift = syntheticStreamFromValues([
      ...Array(10).fill(-0.02),
      ...Array(10).fill(0.02),
    ]);
    const s = computeSplitHalfPShift(shift);
    assert.ok(Math.abs(s.value! - 4) < 1e-12);
  });

  it("R3 constant appearances → 0", () => {
    const c = computeAppearanceValueDispersion(
      syntheticStreamFromValues(Array(20).fill(0.03))
    );
    assert.ok(c.available);
    assert.ok(Math.abs(c.value!) < 1e-12);
    const mixed = computeAppearanceValueDispersion(
      syntheticStreamFromValues([0, 0.02, -0.01, 0.04])
    );
    assert.ok(mixed.value! > 0);
    assert.ok(
      Math.abs(mixed.meanV! * 100 - streamAccounting(syntheticStreamFromValues([0, 0.02, -0.01, 0.04])).rawAbilityRate) <
        1e-12
    );
  });

  it("feature APIs do not accept future arguments (arity)", () => {
    assert.equal(computeTemporalSegmentDispersion.length, 1);
    assert.equal(computeSplitHalfPShift.length, 1);
    assert.equal(computeAppearanceValueDispersion.length, 1);
  });
});

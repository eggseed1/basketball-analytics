import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertM1Monotone,
  assertM2MonotoneDense,
  finiteSampleQuantile,
  fitM1,
  fitM2,
  intervalsFromWidths,
  repairM1Widths,
  widthsM1,
  widthsM2,
} from "../research-monotone-conditional-uncertainty-v3";

describe("research-monotone-conditional-uncertainty-v3", () => {
  it("finite-sample quantile uses ceil((m+1)*p)", () => {
    const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    // m=10, p=0.8 → ceil(11*0.8)=ceil(8.8)=9 → value 9
    assert.equal(finiteSampleQuantile(s, 0.8), 9);
    // p=0.95 → ceil(10.45)=11 → clamp 10 → 10
    assert.equal(finiteSampleQuantile(s, 0.95), 10);
  });

  it("M1 upward repair enforces regime monotone + nesting", () => {
    const r = repairM1Widths(
      { w50: 1, w80: 2, w95: 3 },
      { w50: 5, w80: 4, w95: 6 }, // mid w50 > high later
      { w50: 2, w80: 3, w95: 4 }
    );
    assertM1Monotone({ T1: 100, T2: 200, ...r });
  });

  it("M1 fits and is monotone in N", () => {
    const ns = [80, 100, 200, 400, 800, 1200, 2000, 3000];
    const e = ns.map((n) => 30 / Math.sqrt(n) + 0.5);
    const p = fitM1(e, ns);
    assertM1Monotone(p);
    const wLo = widthsM1(90, p);
    const wHi = widthsM1(2500, p);
    assert.ok(wLo.w80 >= wHi.w80);
  });

  it("M2 pinball fit converges nested monotone", () => {
    const ns: number[] = [];
    const e: number[] = [];
    for (let i = 0; i < 40; i++) {
      const n = 100 + i * 80;
      ns.push(n);
      e.push(Math.sqrt(1.5 ** 2 + 40 ** 2 / n) * (1 + (i % 3) * 0.05));
    }
    const fit = fitM2(e, ns);
    assert.ok(fit.converged);
    assertM2MonotoneDense(fit, Math.min(...ns), Math.max(...ns), 200);
    const wLo = widthsM2(120, fit);
    const wHi = widthsM2(3000, fit);
    assert.ok(wLo.w95 >= wHi.w95);
  });

  it("intervals preserve center", () => {
    const iv = intervalsFromWidths(1.5, { w50: 1, w80: 2, w95: 3 });
    assert.equal((iv.pi80Lo + iv.pi80Hi) / 2, 1.5);
  });
});

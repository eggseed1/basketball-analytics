/**
 * Research direct-quantile predictive intervals v2 (M16i1).
 *
 * Models Q_tau(|future error| | N) directly — not sigma(N) × global residual quantile.
 * Does not modify the locked DRBL/100 point estimate.
 */

export const RESEARCH_PREDICTIVE_INTERVAL_V2 =
  "drbl-predictive-interval-v2";

export type DirectQuantileModel =
  | "Q0_CONSTANT"
  | "Q1_INVERSE_SQRT"
  | "Q2_FLOOR_PLUS_SAMPLING";

export type Q0Params = { a50: number; a80: number; a95: number };
export type Q1Params = { c50: number; c80: number; c95: number };
export type Q2Params = {
  floor50: number;
  floor80: number;
  floor95: number;
  sample50: number;
  sample80: number;
  sample95: number;
};

export type WidthTriple = { w50: number; w80: number; w95: number };

export function pinballLoss(residual: number, tau: number): number {
  return residual >= 0 ? tau * residual : (1 - tau) * -residual;
}

export function empiricalQuantile(sortedAsc: number[], tau: number): number {
  if (!sortedAsc.length) return NaN;
  const p = Math.min(1, Math.max(0, tau)) * 100;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.floor((p / 100) * (sortedAsc.length - 1)))
  );
  return sortedAsc[idx]!;
}

export function fitQ0(absErrors: number[]): Q0Params {
  const s = [...absErrors].sort((a, b) => a - b);
  const a50 = empiricalQuantile(s, 0.5);
  const a80 = empiricalQuantile(s, 0.8);
  const a95 = empiricalQuantile(s, 0.95);
  return {
    a50: Math.min(a50, a80, a95),
    a80: Math.min(Math.max(a50, a80), a95),
    a95: Math.max(a50, a80, a95),
  };
}

/** Exact pinball fit for width = c/sqrt(N): c = Q_tau(|e| * sqrt(N)). */
export function fitQ1(absErrors: number[], ns: number[]): Q1Params {
  const z = absErrors.map((e, i) => e * Math.sqrt(Math.max(1, ns[i]!)));
  const s = [...z].sort((a, b) => a - b);
  let c50 = empiricalQuantile(s, 0.5);
  let c80 = empiricalQuantile(s, 0.8);
  let c95 = empiricalQuantile(s, 0.95);
  c50 = Math.min(c50, c80, c95);
  c80 = Math.min(Math.max(c50, c80), c95);
  c95 = Math.max(c50, c80, c95);
  return { c50, c80, c95 };
}

function widthQ2(
  n: number,
  floor: number,
  sample: number
): number {
  const nn = Math.max(1, n);
  return Math.sqrt(Math.max(0, floor) ** 2 + Math.max(0, sample) ** 2 / nn);
}

function totalPinballQ2(
  absErrors: number[],
  ns: number[],
  p: Q2Params
): number {
  let s = 0;
  for (let i = 0; i < absErrors.length; i++) {
    const e = absErrors[i]!;
    const n = ns[i]!;
    const w50 = widthQ2(n, p.floor50, p.sample50);
    const w80 = widthQ2(n, p.floor80, p.sample80);
    const w95 = widthQ2(n, p.floor95, p.sample95);
    s += pinballLoss(e - w50, 0.5);
    s += pinballLoss(e - w80, 0.8);
    s += pinballLoss(e - w95, 0.95);
  }
  return s;
}

function enforceQ2Nesting(p: Q2Params): Q2Params {
  let { floor50, floor80, floor95, sample50, sample80, sample95 } = p;
  floor50 = Math.max(0, floor50);
  floor80 = Math.max(0, floor80);
  floor95 = Math.max(0, floor95);
  sample50 = Math.max(0, sample50);
  sample80 = Math.max(0, sample80);
  sample95 = Math.max(0, sample95);
  // monotone floors / samples
  floor80 = Math.max(floor80, floor50);
  floor95 = Math.max(floor95, floor80);
  sample80 = Math.max(sample80, sample50);
  sample95 = Math.max(sample95, sample80);
  return { floor50, floor80, floor95, sample50, sample80, sample95 };
}

/**
 * Deterministic grid + coordinate refine for Q2 pinball with nesting.
 */
export function fitQ2(
  absErrors: number[],
  ns: number[]
): Q2Params & { objective: number; converged: boolean; iterations: number } {
  if (!absErrors.length) {
    throw new Error("DIRECT_QUANTILE_FIT_FAILURE empty Q2");
  }
  const q0 = fitQ0(absErrors);
  const q1 = fitQ1(absErrors, ns);
  // Initialize near Q0 floors and Q1 samples
  let best: Q2Params = enforceQ2Nesting({
    floor50: q0.a50 * 0.5,
    floor80: q0.a80 * 0.5,
    floor95: q0.a95 * 0.5,
    sample50: q1.c50 * 0.5,
    sample80: q1.c80 * 0.5,
    sample95: q1.c95 * 0.5,
  });
  let bestObj = totalPinballQ2(absErrors, ns, best);

  const floorScales = [0, 0.25, 0.5, 0.75, 1, 1.25];
  const sampleScales = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5];
  for (const fs of floorScales) {
    for (const ss of sampleScales) {
      const cand = enforceQ2Nesting({
        floor50: q0.a50 * fs,
        floor80: q0.a80 * fs,
        floor95: q0.a95 * fs,
        sample50: q1.c50 * ss,
        sample80: q1.c80 * ss,
        sample95: q1.c95 * ss,
      });
      const obj = totalPinballQ2(absErrors, ns, cand);
      if (obj < bestObj) {
        bestObj = obj;
        best = cand;
      }
    }
  }
  // Also try pure Q0 / pure Q1 corners
  for (const cand of [
    enforceQ2Nesting({
      floor50: q0.a50,
      floor80: q0.a80,
      floor95: q0.a95,
      sample50: 0,
      sample80: 0,
      sample95: 0,
    }),
    enforceQ2Nesting({
      floor50: 0,
      floor80: 0,
      floor95: 0,
      sample50: q1.c50,
      sample80: q1.c80,
      sample95: q1.c95,
    }),
  ]) {
    const obj = totalPinballQ2(absErrors, ns, cand);
    if (obj < bestObj) {
      bestObj = obj;
      best = cand;
    }
  }

  let iterations = 0;
  const keys = [
    "floor50",
    "floor80",
    "floor95",
    "sample50",
    "sample80",
    "sample95",
  ] as const;
  let step = Math.max(0.05, q0.a80 * 0.1);
  for (let round = 0; round < 60; round++) {
    let improved = false;
    for (const k of keys) {
      for (const dir of [1, -1]) {
        const trial = { ...best, [k]: Math.max(0, best[k] + dir * step) };
        const cand = enforceQ2Nesting(trial);
        const obj = totalPinballQ2(absErrors, ns, cand);
        iterations++;
        if (obj + 1e-12 < bestObj) {
          bestObj = obj;
          best = cand;
          improved = true;
        }
      }
    }
    if (!improved) {
      step *= 0.5;
      if (step < 1e-5) break;
    }
  }
  return {
    ...best,
    objective: bestObj,
    converged: Number.isFinite(bestObj),
    iterations,
  };
}

export function widthsOf(
  model: DirectQuantileModel,
  n: number,
  params: Q0Params | Q1Params | Q2Params
): WidthTriple {
  const nn = Math.max(1, n);
  if (model === "Q0_CONSTANT") {
    const p = params as Q0Params;
    return { w50: p.a50, w80: p.a80, w95: p.a95 };
  }
  if (model === "Q1_INVERSE_SQRT") {
    const p = params as Q1Params;
    const s = Math.sqrt(nn);
    return { w50: p.c50 / s, w80: p.c80 / s, w95: p.c95 / s };
  }
  const p = params as Q2Params;
  return {
    w50: widthQ2(nn, p.floor50, p.sample50),
    w80: widthQ2(nn, p.floor80, p.sample80),
    w95: widthQ2(nn, p.floor95, p.sample95),
  };
}

export function assertWidthMonotoneInN(
  model: DirectQuantileModel,
  params: Q0Params | Q1Params | Q2Params,
  nMin: number,
  nMax: number
): void {
  if (model === "Q0_CONSTANT") return;
  let prev50 = Infinity;
  let prev80 = Infinity;
  let prev95 = Infinity;
  for (let i = 0; i <= 50; i++) {
    const n = nMin + ((nMax - nMin) * i) / 50;
    const w = widthsOf(model, n, params);
    if (
      w.w50 > prev50 + 1e-9 ||
      w.w80 > prev80 + 1e-9 ||
      w.w95 > prev95 + 1e-9
    ) {
      throw new Error("DIRECT_QUANTILE_MONOTONICITY_FAILURE");
    }
    if (!(w.w50 <= w.w80 + 1e-9 && w.w80 <= w.w95 + 1e-9)) {
      throw new Error("INTERVAL_NESTING_FAILURE dense grid");
    }
    prev50 = w.w50;
    prev80 = w.w80;
    prev95 = w.w95;
  }
}

export type DirectIntervals = {
  w50: number;
  w80: number;
  w95: number;
  pi50Lo: number;
  pi50Hi: number;
  pi80Lo: number;
  pi80Hi: number;
  pi95Lo: number;
  pi95Hi: number;
};

export function intervalsFromWidths(
  prediction: number,
  w: WidthTriple
): DirectIntervals {
  if (!(w.w50 <= w.w80 + 1e-9 && w.w80 <= w.w95 + 1e-9)) {
    throw new Error("INTERVAL_NESTING_FAILURE");
  }
  const mk = (half: number) => ({
    lo: prediction - half,
    hi: prediction + half,
  });
  const a = mk(w.w50);
  const b = mk(w.w80);
  const c = mk(w.w95);
  return {
    w50: w.w50,
    w80: w.w80,
    w95: w.w95,
    pi50Lo: a.lo,
    pi50Hi: a.hi,
    pi80Lo: b.lo,
    pi80Hi: b.hi,
    pi95Lo: c.lo,
    pi95Hi: c.hi,
  };
}

export function q2CollapseStatus(p: Q2Params): "CONSTANT" | "INVERSE_SQRT" | "NO" {
  const floors = [p.floor50, p.floor80, p.floor95];
  const samples = [p.sample50, p.sample80, p.sample95];
  const maxF = Math.max(...floors);
  const maxS = Math.max(...samples);
  if (maxS <= 1e-8 * Math.max(1, maxF)) return "CONSTANT";
  if (maxF <= 1e-8 * Math.max(1, maxS)) return "INVERSE_SQRT";
  return "NO";
}

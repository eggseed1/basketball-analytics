/**
 * Research predictive uncertainty v1 (M16i).
 *
 * Empirically calibrated predictive intervals around the LOCKED research DRBL/100.
 * Does not modify the point estimate. Exposure-only scale models U0/U1/U2.
 */

import { RESEARCH_K, RESEARCH_RATE_VERSION } from "./research-rate-v1";

export const RESEARCH_PREDICTIVE_UNCERTAINTY_VERSION =
  "drbl-predictive-uncertainty-v1";

export type UncertaintyModelType = "U0_CONSTANT" | "U1_INVERSE_SQRT" | "U2_FLOOR_PLUS_SAMPLING";

export type U0Params = { s: number };
export type U1Params = { c: number };
export type U2Params = { sigmaFloor: number; c: number };

export type QuantileParams = { q50: number; q80: number; q95: number };

export type ResearchUncertaintyConfig = {
  modelType: UncertaintyModelType;
  params: U0Params | U1Params | U2Params;
  quantiles: QuantileParams;
};

export function sigmaU0(n: number, p: U0Params): number {
  void n;
  return Math.max(1e-12, p.s);
}

export function sigmaU1(n: number, p: U1Params): number {
  return Math.max(1e-12, p.c / Math.sqrt(Math.max(1, n)));
}

export function sigmaU2(n: number, p: U2Params): number {
  const nn = Math.max(1, n);
  return Math.sqrt(Math.max(0, p.sigmaFloor) ** 2 + Math.max(0, p.c) ** 2 / nn);
}

export function sigmaOf(
  modelType: UncertaintyModelType,
  n: number,
  params: U0Params | U1Params | U2Params
): number {
  if (modelType === "U0_CONSTANT") return sigmaU0(n, params as U0Params);
  if (modelType === "U1_INVERSE_SQRT") return sigmaU1(n, params as U1Params);
  return sigmaU2(n, params as U2Params);
}

/** Gaussian NLL for relative scale fitting (not used for coverage). */
export function gaussianNll(
  errors: number[],
  sigmas: number[]
): number {
  let s = 0;
  for (let i = 0; i < errors.length; i++) {
    const sig = Math.max(1e-12, sigmas[i]!);
    const e = errors[i]!;
    s += Math.log(sig) + (e * e) / (2 * sig * sig);
  }
  return s;
}

export function fitU0(errors: number[]): U0Params {
  if (!errors.length) throw new Error("UNCERTAINTY_SCALE_FIT_FAILURE empty U0");
  const mse = errors.reduce((a, e) => a + e * e, 0) / errors.length;
  const s = Math.sqrt(Math.max(mse, 1e-18));
  return { s };
}

export function fitU1(errors: number[], ns: number[]): U1Params {
  if (!errors.length) throw new Error("UNCERTAINTY_SCALE_FIT_FAILURE empty U1");
  let acc = 0;
  for (let i = 0; i < errors.length; i++) {
    acc += errors[i]! * errors[i]! * Math.max(1, ns[i]!);
  }
  const c = Math.sqrt(Math.max(acc / errors.length, 1e-18));
  return { c };
}

/**
 * Deterministic grid + refine for U2 MLE.
 * Closed-form limits: c=0 → U0; sf=0 → U1.
 */
export function fitU2(
  errors: number[],
  ns: number[]
): U2Params & { nll: number; converged: boolean } {
  if (!errors.length) throw new Error("UNCERTAINTY_SCALE_FIT_FAILURE empty U2");
  const u0 = fitU0(errors);
  const u1 = fitU1(errors, ns);
  let best = { sigmaFloor: u0.s, c: 0, nll: Infinity };
  const floors = new Set<number>([0, u0.s * 0.25, u0.s * 0.5, u0.s * 0.75, u0.s, u0.s * 1.25]);
  const cs = new Set<number>([0, u1.c * 0.25, u1.c * 0.5, u1.c * 0.75, u1.c, u1.c * 1.25, u1.c * 1.5]);
  // denser grid
  for (let i = 0; i <= 40; i++) {
    floors.add((u0.s * i) / 40);
    cs.add((u1.c * i) / 20);
  }
  for (const sf of floors) {
    for (const c of cs) {
      const sigs = ns.map((n) => sigmaU2(n, { sigmaFloor: sf, c }));
      const nll = gaussianNll(errors, sigs);
      if (nll < best.nll) best = { sigmaFloor: sf, c, nll };
    }
  }
  // local refine
  let sf = best.sigmaFloor;
  let c = best.c;
  let stepSf = Math.max(1e-6, u0.s * 0.05);
  let stepC = Math.max(1e-6, u1.c * 0.05);
  for (let iter = 0; iter < 80; iter++) {
    let improved = false;
    for (const [dsf, dc] of [
      [stepSf, 0],
      [-stepSf, 0],
      [0, stepC],
      [0, -stepC],
      [stepSf, stepC],
      [stepSf, -stepC],
      [-stepSf, stepC],
      [-stepSf, -stepC],
    ] as Array<[number, number]>) {
      const nsf = Math.max(0, sf + dsf);
      const nc = Math.max(0, c + dc);
      const sigs = ns.map((n) => sigmaU2(n, { sigmaFloor: nsf, c: nc }));
      const nll = gaussianNll(errors, sigs);
      if (nll + 1e-12 < best.nll) {
        best = { sigmaFloor: nsf, c: nc, nll };
        sf = nsf;
        c = nc;
        improved = true;
      }
    }
    if (!improved) {
      stepSf *= 0.5;
      stepC *= 0.5;
      if (stepSf < 1e-8 && stepC < 1e-8) break;
    }
  }
  return {
    sigmaFloor: best.sigmaFloor,
    c: best.c,
    nll: best.nll,
    converged: Number.isFinite(best.nll),
  };
}

export function empiricalAbsZQuantiles(
  errors: number[],
  sigmas: number[]
): QuantileParams {
  const zs = errors
    .map((e, i) => Math.abs(e) / Math.max(1e-12, sigmas[i]!))
    .sort((a, b) => a - b);
  const pct = (p: number) => {
    if (!zs.length) return NaN;
    const idx = Math.min(
      zs.length - 1,
      Math.max(0, Math.floor((p / 100) * (zs.length - 1)))
    );
    return zs[idx]!;
  };
  return { q50: pct(50), q80: pct(80), q95: pct(95) };
}

export function intervalScore(
  y: number,
  lo: number,
  hi: number,
  alpha: number
): number {
  const width = hi - lo;
  let score = width;
  if (y < lo) score += (2 / alpha) * (lo - y);
  if (y > hi) score += (2 / alpha) * (y - hi);
  return score;
}

/** WIS for nominal 50/80/95 around locked median m. */
export function weightedIntervalScore(
  y: number,
  m: number,
  pi50Lo: number,
  pi50Hi: number,
  pi80Lo: number,
  pi80Hi: number,
  pi95Lo: number,
  pi95Hi: number
): number {
  const alphas = [0.5, 0.2, 0.05] as const;
  const intervals = [
    [pi50Lo, pi50Hi],
    [pi80Lo, pi80Hi],
    [pi95Lo, pi95Hi],
  ] as const;
  let num = 0.5 * Math.abs(y - m);
  let den = 0.5;
  for (let k = 0; k < 3; k++) {
    const a = alphas[k]!;
    const [lo, hi] = intervals[k]!;
    num += (a / 2) * intervalScore(y, lo, hi, a);
    den += a / 2;
  }
  return num / den;
}

export type ResearchIntervals = {
  researchPredictiveSigma: number;
  researchPI50Lo: number;
  researchPI50Hi: number;
  researchPI80Lo: number;
  researchPI80Hi: number;
  researchPI95Lo: number;
  researchPI95Hi: number;
  researchUncertaintyVersion: typeof RESEARCH_PREDICTIVE_UNCERTAINTY_VERSION;
  pointEstimateVersion: typeof RESEARCH_RATE_VERSION;
  modelType: UncertaintyModelType;
};

export function computeResearchPredictiveUncertaintyV1(
  n: number,
  config: ResearchUncertaintyConfig
): number {
  return sigmaOf(config.modelType, n, config.params);
}

export function computeResearchPredictionIntervalsV1(
  lockedDrbl100: number,
  n: number,
  config: ResearchUncertaintyConfig
): ResearchIntervals {
  const sigma = computeResearchPredictiveUncertaintyV1(n, config);
  const { q50, q80, q95 } = config.quantiles;
  const mk = (q: number) => ({
    lo: lockedDrbl100 - q * sigma,
    hi: lockedDrbl100 + q * sigma,
  });
  const a = mk(q50);
  const b = mk(q80);
  const c = mk(q95);
  if (!(a.lo <= lockedDrbl100 && lockedDrbl100 <= a.hi)) {
    throw new Error("INTERVAL_NESTING_FAILURE PI50");
  }
  if (!(b.lo <= lockedDrbl100 && lockedDrbl100 <= b.hi)) {
    throw new Error("INTERVAL_NESTING_FAILURE PI80");
  }
  if (!(c.lo <= lockedDrbl100 && lockedDrbl100 <= c.hi)) {
    throw new Error("INTERVAL_NESTING_FAILURE PI95");
  }
  const w50 = a.hi - a.lo;
  const w80 = b.hi - b.lo;
  const w95 = c.hi - c.lo;
  if (!(w50 <= w80 + 1e-12 && w80 <= w95 + 1e-12)) {
    throw new Error("INTERVAL_NESTING_FAILURE widths");
  }
  return {
    researchPredictiveSigma: sigma,
    researchPI50Lo: a.lo,
    researchPI50Hi: a.hi,
    researchPI80Lo: b.lo,
    researchPI80Hi: b.hi,
    researchPI95Lo: c.lo,
    researchPI95Hi: c.hi,
    researchUncertaintyVersion: RESEARCH_PREDICTIVE_UNCERTAINTY_VERSION,
    pointEstimateVersion: RESEARCH_RATE_VERSION,
    modelType: config.modelType,
  };
}

export function assertMonotoneSigma(
  modelType: UncertaintyModelType,
  params: U0Params | U1Params | U2Params,
  nMin: number,
  nMax: number
): void {
  if (modelType === "U0_CONSTANT") return;
  const grid = 40;
  let prev = Infinity;
  for (let i = 0; i <= grid; i++) {
    const n = nMin + ((nMax - nMin) * i) / grid;
    const s = sigmaOf(modelType, n, params);
    if (s > prev + 1e-9) {
      throw new Error("UNCERTAINTY_MONOTONICITY_FAILURE");
    }
    prev = s;
  }
}

export { RESEARCH_K };

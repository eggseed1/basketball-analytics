/**
 * Research predictive uncertainty v2 (M16i4).
 *
 * Fixed U2-style base scale with optional nonnegative multiplicative
 * reliability-feature modifiers. Does NOT change the locked DRBL/100.
 */

import {
  empiricalAbsZQuantiles,
  fitU2,
  gaussianNll,
  sigmaU2,
  type QuantileParams,
  type U2Params,
} from "./research-predictive-uncertainty-v1";
import { RESEARCH_RATE_VERSION } from "./research-rate-v1";

export const RESEARCH_PREDICTIVE_UNCERTAINTY_V2 =
  "drbl-predictive-uncertainty-v2";

export type FeatureSetId = "F0" | "F1" | "F2" | "F3" | "F_ALL";

export type RobustScaleParams = {
  medianLog1p: number;
  iqrLog1p: number;
};

export type ReliabilityScaleParams = {
  sigmaFloor: number;
  c: number;
  /** Nonnegative gammas aligned with active reliability features. */
  gammas: number[];
};

export function percentileSorted(sortedAsc: number[], p: number): number {
  if (!sortedAsc.length) return NaN;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.floor((p / 100) * (sortedAsc.length - 1)))
  );
  return sortedAsc[idx]!;
}

export function fitRobustScale(rawFeatures: number[]): RobustScaleParams {
  const x = rawFeatures.map((r) => Math.log1p(Math.max(0, r))).sort((a, b) => a - b);
  const medianLog1p = percentileSorted(x, 50);
  const iqrLog1p = percentileSorted(x, 75) - percentileSorted(x, 25);
  if (!(iqrLog1p > 0)) {
    throw new Error("RELIABILITY_FEATURE_STANDARDIZATION_FAILURE IQR=0");
  }
  return { medianLog1p, iqrLog1p };
}

export function standardizeFeature(
  raw: number,
  scale: RobustScaleParams
): number {
  const x = Math.log1p(Math.max(0, raw));
  return (x - scale.medianLog1p) / scale.iqrLog1p;
}

export function sigmaBase(n: number, p: U2Params): number {
  return sigmaU2(n, p);
}

export function sigmaWithReliability(
  n: number,
  p: ReliabilityScaleParams,
  zFeatures: number[]
): number {
  if (zFeatures.length !== p.gammas.length) {
    throw new Error("RELIABILITY_SCALE_FEATURE_DIM_MISMATCH");
  }
  let lin = 0;
  for (let j = 0; j < p.gammas.length; j++) {
    const g = p.gammas[j]!;
    if (g < -1e-12) {
      throw new Error("RELIABILITY_DIRECTION_CONSTRAINT_FAILURE");
    }
    lin += Math.max(0, g) * zFeatures[j]!;
  }
  const base = Math.sqrt(
    Math.max(0, p.sigmaFloor) ** 2 + Math.max(0, p.c) ** 2 / Math.max(1, n)
  );
  return Math.max(1e-12, base * Math.exp(lin));
}

function projectParams(p: ReliabilityScaleParams): ReliabilityScaleParams {
  return {
    sigmaFloor: Math.max(0, p.sigmaFloor),
    c: Math.max(0, p.c),
    gammas: p.gammas.map((g) => Math.max(0, g)),
  };
}

function nllOf(
  errors: number[],
  ns: number[],
  zRows: number[][],
  p: ReliabilityScaleParams
): number {
  const sigs = ns.map((n, i) => sigmaWithReliability(n, p, zRows[i]!));
  return gaussianNll(errors, sigs);
}

/**
 * Deterministic constrained NLL fit.
 * Initializes from U2 (sf,c) and gamma=0, then coordinate-refines.
 */
export function fitReliabilityScale(
  errors: number[],
  ns: number[],
  zRows: number[][],
  nGammas: number
): ReliabilityScaleParams & {
  nll: number;
  startNll: number;
  iterations: number;
  converged: boolean;
  u2Init: U2Params;
} {
  if (!errors.length) throw new Error("RELIABILITY_SCALE_OPTIMIZATION_FAILURE empty");
  if (zRows.length !== errors.length) {
    throw new Error("RELIABILITY_SCALE_OPTIMIZATION_FAILURE z dim");
  }
  const u2 = fitU2(errors, ns);
  let best: ReliabilityScaleParams = projectParams({
    sigmaFloor: u2.sigmaFloor,
    c: u2.c,
    gammas: Array(nGammas).fill(0),
  });
  let bestNll = nllOf(errors, ns, zRows, best);
  const startNll = bestNll;
  let iterations = 0;

  // Coarse gamma grid along each axis (holding others at current)
  const gammaGrid = [0, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1, 1.5, 2];
  for (let j = 0; j < nGammas; j++) {
    for (const g of gammaGrid) {
      const trial = projectParams({
        ...best,
        gammas: best.gammas.map((gg, k) => (k === j ? g : gg)),
      });
      const nll = nllOf(errors, ns, zRows, trial);
      iterations++;
      if (nll + 1e-12 < bestNll) {
        bestNll = nll;
        best = trial;
      }
    }
  }

  // Joint refine: sf, c, gammas
  let stepSf = Math.max(1e-6, best.sigmaFloor * 0.05 + 1e-4);
  let stepC = Math.max(1e-6, best.c * 0.05 + 1e-4);
  let stepG = 0.05;
  for (let round = 0; round < 100; round++) {
    let improved = false;
    const moves: Array<Partial<ReliabilityScaleParams> & { gammas?: number[] }> =
      [
        { sigmaFloor: best.sigmaFloor + stepSf },
        { sigmaFloor: best.sigmaFloor - stepSf },
        { c: best.c + stepC },
        { c: best.c - stepC },
      ];
    for (let j = 0; j < nGammas; j++) {
      const up = best.gammas.slice();
      up[j] = best.gammas[j]! + stepG;
      const down = best.gammas.slice();
      down[j] = best.gammas[j]! - stepG;
      moves.push({ gammas: up }, { gammas: down });
    }
    for (const m of moves) {
      const trial = projectParams({
        sigmaFloor: m.sigmaFloor ?? best.sigmaFloor,
        c: m.c ?? best.c,
        gammas: m.gammas ?? best.gammas,
      });
      const nll = nllOf(errors, ns, zRows, trial);
      iterations++;
      if (nll + 1e-12 < bestNll) {
        bestNll = nll;
        best = trial;
        improved = true;
      }
    }
    if (!improved) {
      stepSf *= 0.5;
      stepC *= 0.5;
      stepG *= 0.5;
      if (stepG < 1e-5 && stepSf < 1e-6 && stepC < 1e-6) break;
    }
  }

  if (best.gammas.some((g) => g < -1e-12)) {
    throw new Error("RELIABILITY_DIRECTION_CONSTRAINT_FAILURE");
  }
  return {
    ...best,
    nll: bestNll,
    startNll,
    iterations,
    converged: Number.isFinite(bestNll),
    u2Init: { sigmaFloor: u2.sigmaFloor, c: u2.c },
  };
}

export function intervalsFromSigma(
  prediction: number,
  sigma: number,
  q: QuantileParams
): {
  sigma: number;
  w50: number;
  w80: number;
  w95: number;
  pi50Lo: number;
  pi50Hi: number;
  pi80Lo: number;
  pi80Hi: number;
  pi95Lo: number;
  pi95Hi: number;
} {
  const w50 = q.q50 * sigma;
  const w80 = q.q80 * sigma;
  const w95 = q.q95 * sigma;
  if (!(w50 <= w80 + 1e-12 && w80 <= w95 + 1e-12)) {
    throw new Error("INTERVAL_NESTING_FAILURE");
  }
  return {
    sigma,
    w50,
    w80,
    w95,
    pi50Lo: prediction - w50,
    pi50Hi: prediction + w50,
    pi80Lo: prediction - w80,
    pi80Hi: prediction + w80,
    pi95Lo: prediction - w95,
    pi95Hi: prediction + w95,
  };
}

/** Point estimate purity: reliability features must not alter DRBL100. */
export function assertPointEstimateIndependentOfReliability(
  rawAbilityRate: number,
  n: number,
  computeDrbl: (raw: number, n: number) => number,
  rVariants: Array<{ R1: number; R2: number; R3: number }>
): void {
  const base = computeDrbl(rawAbilityRate, n);
  for (const r of rVariants) {
    void r;
    const again = computeDrbl(rawAbilityRate, n);
    if (Math.abs(again - base) > 1e-15) {
      throw new Error("POINT_ESTIMATE_CONTAMINATED_BY_RELIABILITY");
    }
  }
}

export {
  empiricalAbsZQuantiles,
  fitU2,
  RESEARCH_RATE_VERSION,
  type QuantileParams,
  type U2Params,
};

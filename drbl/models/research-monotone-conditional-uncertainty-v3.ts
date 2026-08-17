/**
 * Research monotone conditional predictive intervals v3 (M16i2).
 *
 * M1: three training-tertile regimes with finite-sample abs-error quantiles
 * M2: monotone piecewise-linear quantiles in log(N) with 3 interior knots
 *
 * Does not modify the locked DRBL/100 point estimate.
 */

import { pinballLoss } from "./research-direct-quantile-uncertainty-v2";

export const RESEARCH_PREDICTIVE_INTERVAL_V3 =
  "drbl-predictive-interval-v3";

export type WidthTriple = { w50: number; w80: number; w95: number };

export type M1Params = {
  T1: number;
  T2: number;
  low: WidthTriple;
  mid: WidthTriple;
  high: WidthTriple;
};

export type M2Params = {
  knotsLogN: [number, number, number, number, number];
  w50: [number, number, number, number, number];
  w80: [number, number, number, number, number];
  w95: [number, number, number, number, number];
};

/** Finite-sample empirical predictive quantile: j = ceil((m+1)*p) clamped to 1..m. */
export function finiteSampleQuantile(
  sortedAsc: number[],
  p: number
): number {
  const m = sortedAsc.length;
  if (!m) return NaN;
  const j = Math.min(m, Math.max(1, Math.ceil((m + 1) * p)));
  return sortedAsc[j - 1]!;
}

export function percentileOf(sortedAsc: number[], p: number): number {
  if (!sortedAsc.length) return NaN;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.floor((p / 100) * (sortedAsc.length - 1)))
  );
  return sortedAsc[idx]!;
}

function nestUpward(w: WidthTriple): WidthTriple {
  const w50 = Math.max(0, w.w50);
  const w80 = Math.max(w.w80, w50);
  const w95 = Math.max(w.w95, w80);
  return { w50, w80, w95 };
}

/** Upward-only regime monotone repair then nesting (Phase 11). */
export function repairM1Widths(
  rawLow: WidthTriple,
  rawMid: WidthTriple,
  rawHigh: WidthTriple
): { low: WidthTriple; mid: WidthTriple; high: WidthTriple } {
  // Per-level: high fixed, mid = max(raw_mid, high), low = max(raw_low, mid)
  const repairLevel = (lo: number, mid: number, hi: number) => {
    const high = Math.max(0, hi);
    const midR = Math.max(0, mid, high);
    const lowR = Math.max(0, lo, midR);
    return { low: lowR, mid: midR, high };
  };
  const r50 = repairLevel(rawLow.w50, rawMid.w50, rawHigh.w50);
  const r80 = repairLevel(rawLow.w80, rawMid.w80, rawHigh.w80);
  const r95 = repairLevel(rawLow.w95, rawMid.w95, rawHigh.w95);
  return {
    low: nestUpward({ w50: r50.low, w80: r80.low, w95: r95.low }),
    mid: nestUpward({ w50: r50.mid, w80: r80.mid, w95: r95.mid }),
    high: nestUpward({ w50: r50.high, w80: r80.high, w95: r95.high }),
  };
}

function regimeAbsErrors(
  absErrors: number[],
  ns: number[],
  lo: number,
  hi: number | null
): number[] {
  const out: number[] = [];
  for (let i = 0; i < absErrors.length; i++) {
    const n = ns[i]!;
    if (hi == null) {
      if (n > lo) out.push(absErrors[i]!);
    } else if (lo < 0) {
      if (n <= hi) out.push(absErrors[i]!);
    } else {
      if (n > lo && n <= hi) out.push(absErrors[i]!);
    }
  }
  return out;
}

function empTriple(abs: number[]): WidthTriple {
  const s = [...abs].sort((a, b) => a - b);
  if (!s.length) return { w50: 0, w80: 0, w95: 0 };
  return {
    w50: finiteSampleQuantile(s, 0.5),
    w80: finiteSampleQuantile(s, 0.8),
    w95: finiteSampleQuantile(s, 0.95),
  };
}

export function fitM1(absErrors: number[], ns: number[]): M1Params {
  if (!absErrors.length) throw new Error("M1_FIT_FAILURE empty");
  const nSorted = [...ns].sort((a, b) => a - b);
  const T1 = percentileOf(nSorted, 100 / 3);
  const T2 = percentileOf(nSorted, 200 / 3);
  const lowAbs = regimeAbsErrors(absErrors, ns, -1, T1);
  const midAbs = regimeAbsErrors(absErrors, ns, T1, T2);
  const highAbs = regimeAbsErrors(absErrors, ns, T2, null);
  // Fallback if empty regime: use all training abs errors
  const all = empTriple(absErrors);
  const rawLow = lowAbs.length ? empTriple(lowAbs) : all;
  const rawMid = midAbs.length ? empTriple(midAbs) : all;
  const rawHigh = highAbs.length ? empTriple(highAbs) : all;
  const repaired = repairM1Widths(rawLow, rawMid, rawHigh);
  return { T1, T2, ...repaired };
}

export function widthsM1(n: number, p: M1Params): WidthTriple {
  if (n <= p.T1) return p.low;
  if (n <= p.T2) return p.mid;
  return p.high;
}

export function assertM1Monotone(p: M1Params): void {
  for (const key of ["w50", "w80", "w95"] as const) {
    if (!(p.low[key] + 1e-12 >= p.mid[key] && p.mid[key] + 1e-12 >= p.high[key])) {
      throw new Error("MONOTONICITY_FAILURE M1");
    }
  }
  for (const r of [p.low, p.mid, p.high]) {
    if (!(r.w50 <= r.w80 + 1e-12 && r.w80 <= r.w95 + 1e-12)) {
      throw new Error("INTERVAL_NESTING_FAILURE M1");
    }
  }
}

/** Build knot locations from training logN only. */
export function m2KnotsFromLogN(logNs: number[]): M2Params["knotsLogN"] {
  const s = [...logNs].sort((a, b) => a - b);
  if (!s.length) throw new Error("M2_KNOT_FAILURE empty");
  const xmin = s[0]!;
  const xmax = s[s.length - 1]!;
  const k25 = percentileOf(s, 25);
  const k50 = percentileOf(s, 50);
  const k75 = percentileOf(s, 75);
  // Ensure nondecreasing knot positions
  const knots: number[] = [xmin, k25, k50, k75, xmax];
  for (let i = 1; i < knots.length; i++) {
    if (knots[i]! < knots[i - 1]!) knots[i] = knots[i - 1]!;
  }
  return knots as M2Params["knotsLogN"];
}

function interpPiecewise(
  x: number,
  knots: number[],
  vals: number[]
): number {
  if (x <= knots[0]!) return vals[0]!;
  if (x >= knots[knots.length - 1]!) return vals[vals.length - 1]!;
  for (let i = 0; i < knots.length - 1; i++) {
    const a = knots[i]!;
    const b = knots[i + 1]!;
    if (x >= a && x <= b) {
      if (b - a < 1e-15) return vals[i]!;
      const t = (x - a) / (b - a);
      return vals[i]! * (1 - t) + vals[i + 1]! * t;
    }
  }
  return vals[vals.length - 1]!;
}

export function widthsM2(n: number, p: M2Params): WidthTriple {
  const x = Math.log(Math.max(1e-12, n));
  return {
    w50: interpPiecewise(x, p.knotsLogN, p.w50),
    w80: interpPiecewise(x, p.knotsLogN, p.w80),
    w95: interpPiecewise(x, p.knotsLogN, p.w95),
  };
}

/** Project to monotone non-increasing knot widths + nesting. */
export function projectM2(p: M2Params): M2Params {
  const fixMono = (w: number[]): [number, number, number, number, number] => {
    const out = w.map((v) => Math.max(0, v));
    for (let i = out.length - 2; i >= 0; i--) {
      out[i] = Math.max(out[i]!, out[i + 1]!);
    }
    return out as [number, number, number, number, number];
  };
  let w50 = fixMono([...p.w50]);
  let w80 = fixMono([...p.w80]);
  let w95 = fixMono([...p.w95]);
  for (let iter = 0; iter < 20; iter++) {
    for (let k = 0; k < 5; k++) {
      w80[k] = Math.max(w80[k]!, w50[k]!);
      w95[k] = Math.max(w95[k]!, w80[k]!);
    }
    w50 = fixMono(w50);
    w80 = fixMono(w80);
    w95 = fixMono(w95);
  }
  return { knotsLogN: p.knotsLogN, w50, w80, w95 };
}

function totalPinballM2(
  absErrors: number[],
  ns: number[],
  p: M2Params
): number {
  let s = 0;
  for (let i = 0; i < absErrors.length; i++) {
    const e = absErrors[i]!;
    const w = widthsM2(ns[i]!, p);
    s += pinballLoss(e - w.w50, 0.5);
    s += pinballLoss(e - w.w80, 0.8);
    s += pinballLoss(e - w.w95, 0.95);
  }
  return s;
}

function empAbsInLogBin(
  absErrors: number[],
  logNs: number[],
  lo: number,
  hi: number,
  includeHi: boolean
): number[] {
  const out: number[] = [];
  for (let i = 0; i < absErrors.length; i++) {
    const x = logNs[i]!;
    if (includeHi ? x >= lo && x <= hi : x >= lo && x < hi) {
      out.push(absErrors[i]!);
    }
  }
  return out;
}

/** Initialize M2 from training exposure-quartile abs-error quantiles. */
export function initM2(
  absErrors: number[],
  ns: number[]
): M2Params {
  const logNs = ns.map((n) => Math.log(Math.max(1e-12, n)));
  const knots = m2KnotsFromLogN(logNs);
  const nSorted = [...ns].sort((a, b) => a - b);
  const cuts = [25, 50, 75].map((p) => percentileOf(nSorted, p));
  const bins: number[][] = [[], [], [], []];
  for (let i = 0; i < ns.length; i++) {
    const n = ns[i]!;
    const e = absErrors[i]!;
    if (n <= cuts[0]!) bins[0]!.push(e);
    else if (n <= cuts[1]!) bins[1]!.push(e);
    else if (n <= cuts[2]!) bins[2]!.push(e);
    else bins[3]!.push(e);
  }
  const qOf = (bin: number[], p: number) => {
    if (!bin.length) return finiteSampleQuantile([...absErrors].sort((a, b) => a - b), p);
    return finiteSampleQuantile([...bin].sort((a, b) => a - b), p);
  };
  // Map 4 quartile bins → 5 knots: use Q1,Q1,Q2,Q3,Q4 then project
  const mk = (p: number): [number, number, number, number, number] => [
    qOf(bins[0]!, p),
    qOf(bins[0]!, p),
    qOf(bins[1]!, p),
    qOf(bins[2]!, p),
    qOf(bins[3]!, p),
  ];
  return projectM2({
    knotsLogN: knots,
    w50: mk(0.5),
    w80: mk(0.8),
    w95: mk(0.95),
  });
}

export type M2FitResult = M2Params & {
  startObjective: number;
  finalObjective: number;
  iterations: number;
  converged: boolean;
  constraintResidual: number;
  minWidth: number;
  maxWidth: number;
  initial: M2Params;
};

function constraintResidual(p: M2Params): number {
  let r = 0;
  for (const level of [p.w50, p.w80, p.w95]) {
    for (let i = 0; i < 4; i++) {
      r += Math.max(0, level[i + 1]! - level[i]!);
    }
  }
  for (let k = 0; k < 5; k++) {
    r += Math.max(0, p.w50[k]! - p.w80[k]!);
    r += Math.max(0, p.w80[k]! - p.w95[k]!);
  }
  return r;
}

/**
 * Deterministic constrained pinball fit for M2 (no regularization).
 */
export function fitM2(absErrors: number[], ns: number[]): M2FitResult {
  if (!absErrors.length) throw new Error("M2_FIT_FAILURE empty");
  const initial = initM2(absErrors, ns);
  const startObjective = totalPinballM2(absErrors, ns, initial);
  let best = projectM2({ ...initial });
  let bestObj = totalPinballM2(absErrors, ns, best);
  let iterations = 0;

  const levels = ["w50", "w80", "w95"] as const;
  let step = Math.max(0.05, best.w80[2]! * 0.1);
  for (let round = 0; round < 80; round++) {
    let improved = false;
    for (const level of levels) {
      for (let k = 0; k < 5; k++) {
        for (const dir of [1, -1]) {
          const trialRaw: M2Params = {
            knotsLogN: best.knotsLogN,
            w50: [...best.w50] as M2Params["w50"],
            w80: [...best.w80] as M2Params["w80"],
            w95: [...best.w95] as M2Params["w95"],
          };
          trialRaw[level][k] = Math.max(0, trialRaw[level][k]! + dir * step);
          const cand = projectM2(trialRaw);
          const obj = totalPinballM2(absErrors, ns, cand);
          iterations++;
          if (obj + 1e-12 < bestObj) {
            bestObj = obj;
            best = cand;
            improved = true;
          }
        }
      }
    }
    if (!improved) {
      step *= 0.5;
      if (step < 1e-5) break;
    }
  }

  const allW = [...best.w50, ...best.w80, ...best.w95];
  const residual = constraintResidual(best);
  const converged =
    Number.isFinite(bestObj) && residual < 1e-8 && allW.every((w) => w >= -1e-12);
  if (!converged) {
    throw new Error("MONOTONE_QUANTILE_OPTIMIZATION_FAILURE");
  }
  return {
    ...best,
    startObjective,
    finalObjective: bestObj,
    iterations,
    converged,
    constraintResidual: residual,
    minWidth: Math.min(...allW),
    maxWidth: Math.max(...allW),
    initial,
  };
}

export function assertM2MonotoneDense(
  p: M2Params,
  nMin: number,
  nMax: number,
  grid = 1000
): void {
  let prev50 = Infinity;
  let prev80 = Infinity;
  let prev95 = Infinity;
  for (let i = 0; i <= grid; i++) {
    const n = nMin + ((nMax - nMin) * i) / grid;
    const w = widthsM2(n, p);
    if (
      w.w50 > prev50 + 1e-8 ||
      w.w80 > prev80 + 1e-8 ||
      w.w95 > prev95 + 1e-8
    ) {
      throw new Error("MONOTONICITY_FAILURE M2");
    }
    if (!(w.w50 <= w.w80 + 1e-8 && w.w80 <= w.w95 + 1e-8)) {
      throw new Error("INTERVAL_NESTING_FAILURE M2 dense");
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
  return {
    w50: w.w50,
    w80: w.w80,
    w95: w.w95,
    pi50Lo: prediction - w.w50,
    pi50Hi: prediction + w.w50,
    pi80Lo: prediction - w.w80,
    pi80Hi: prediction + w.w80,
    pi95Lo: prediction - w.w95,
    pi95Hi: prediction + w.w95,
  };
}

export { pinballLoss, empAbsInLogBin };

/**
 * Metric utilities + paired block bootstrap (M16b). No model math.
 */

export function rmse(y: number[], yhat: number[]): number {
  const n = Math.min(y.length, yhat.length);
  if (!n) return NaN;
  let s = 0;
  for (let i = 0; i < n; i++) s += (yhat[i]! - y[i]!) ** 2;
  return Math.sqrt(s / n);
}

export function mae(y: number[], yhat: number[]): number {
  const n = Math.min(y.length, yhat.length);
  if (!n) return NaN;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(yhat[i]! - y[i]!);
  return s / n;
}

export function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return NaN;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    dx += (xs[i]! - mx) ** 2;
    dy += (ys[i]! - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den > 1e-12 ? num / den : NaN;
}

export function spearman(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return NaN;
  const rank = (arr: number[]) => {
    const order = arr
      .map((v, i) => ({ v, i }))
      .sort((a, b) => a.v - b.v);
    const r = new Array(n);
    for (let i = 0; i < order.length; i++) r[order[i]!.i] = i + 1;
    return r as number[];
  };
  return pearson(rank(xs.slice(0, n)), rank(ys.slice(0, n)));
}

export function r2(y: number[], yhat: number[]): number {
  const n = Math.min(y.length, yhat.length);
  if (n < 2) return NaN;
  const my = y.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (y[i]! - my) ** 2;
    ssRes += (y[i]! - yhat[i]!) ** 2;
  }
  return ssTot > 1e-12 ? 1 - ssRes / ssTot : NaN;
}

/** Mulberry32 PRNG for reproducible bootstrap. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PairedBootstrapResult {
  pointEstimate: number;
  ciLow: number;
  ciHigh: number;
  probCandidateBeatsBaseline: number;
  resamples: number;
  seed: number;
}

/**
 * Paired block bootstrap on grouped residuals (e.g. game blocks).
 * metricDiff(i) = metric(candidate_i) - metric(baseline_i) is NOT used;
 * instead we resample groups of paired (y, yhatA, yhatB) rows.
 */
export function pairedBlockBootstrapRmseDiff(
  y: number[],
  yhatBaseline: number[],
  yhatCandidate: number[],
  blockIds: string[],
  options: { resamples?: number; seed?: number; confidenceLevel?: number } = {}
): PairedBootstrapResult {
  const resamples = options.resamples ?? 1000;
  const seed = options.seed ?? 42;
  const conf = options.confidenceLevel ?? 0.95;
  const n = Math.min(y.length, yhatBaseline.length, yhatCandidate.length, blockIds.length);
  const blocks = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const id = blockIds[i]!;
    const arr = blocks.get(id) ?? [];
    arr.push(i);
    blocks.set(id, arr);
  }
  const blockKeys = [...blocks.keys()];
  const rmseDiff = (idxs: number[]) => {
    let sA = 0;
    let sB = 0;
    for (const i of idxs) {
      sA += (yhatBaseline[i]! - y[i]!) ** 2;
      sB += (yhatCandidate[i]! - y[i]!) ** 2;
    }
    const m = idxs.length || 1;
    return Math.sqrt(sB / m) - Math.sqrt(sA / m);
  };
  const allIdx = Array.from({ length: n }, (_, i) => i);
  const pointEstimate = rmseDiff(allIdx);
  const rng = mulberry32(seed);
  const diffs: number[] = [];
  for (let r = 0; r < resamples; r++) {
    const sampled: number[] = [];
    for (let b = 0; b < blockKeys.length; b++) {
      const key = blockKeys[Math.floor(rng() * blockKeys.length)]!;
      sampled.push(...(blocks.get(key) ?? []));
    }
    diffs.push(rmseDiff(sampled));
  }
  diffs.sort((a, b) => a - b);
  const alpha = (1 - conf) / 2;
  const ciLow = diffs[Math.floor(alpha * diffs.length)]!;
  const ciHigh = diffs[Math.min(diffs.length - 1, Math.floor((1 - alpha) * diffs.length))]!;
  const probCandidateBeatsBaseline =
    diffs.filter((d) => d < 0).length / diffs.length;
  return {
    pointEstimate,
    ciLow,
    ciHigh,
    probCandidateBeatsBaseline,
    resamples,
    seed,
  };
}

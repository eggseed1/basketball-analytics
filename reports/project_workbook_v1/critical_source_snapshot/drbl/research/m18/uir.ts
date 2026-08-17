/**
 * M18 UIR residualization — statistical residual of lineup impact
 * after observable Approach-B (P_RAW) and allowed context.
 * NOT L − P raw subtraction.
 */
export type ResidualRow = {
  playerId: string;
  anonId: string;
  season: string;
  L: number;
  P_RAW: number;
  N: number;
  /** Optional role axes (UIR-B). */
  roleOffenseLean?: number;
  roleDefenseLean?: number;
  teamId: string;
};

export type Residualizer = {
  version: string;
  kind: "UIR-A" | "UIR-B" | "UIR-C";
  /** OLS: L ~ a + b1*P_RAW + b2*logN [+ roles] */
  coef: number[];
  featureNames: string[];
};

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Tiny OLS with ridge on non-intercept for stability. */
export function fitResidualizer(
  rows: ResidualRow[],
  kind: "UIR-A" | "UIR-B" | "UIR-C",
  ridge = 1e-6
): Residualizer {
  const featureNames =
    kind === "UIR-B"
      ? ["intercept", "P_RAW", "logN", "roleO", "roleD"]
      : ["intercept", "P_RAW", "logN"];
  const X: number[][] = [];
  const y: number[] = [];
  for (const r of rows) {
    if (!Number.isFinite(r.L) || !Number.isFinite(r.P_RAW) || !(r.N > 0))
      continue;
    const base = [1, r.P_RAW, Math.log(r.N + 1)];
    if (kind === "UIR-B") {
      base.push(r.roleOffenseLean ?? 0, r.roleDefenseLean ?? 0);
    }
    X.push(base);
    y.push(r.L);
  }
  const p = featureNames.length;
  const xtx = Array.from({ length: p }, () => Array.from({ length: p }, () => 0));
  const xty = Array.from({ length: p }, () => 0);
  for (let n = 0; n < X.length; n++) {
    const x = X[n]!;
    for (let i = 0; i < p; i++) {
      xty[i]! += x[i]! * y[n]!;
      for (let j = 0; j < p; j++) xtx[i]![j]! += x[i]! * x[j]!;
    }
  }
  for (let i = 1; i < p; i++) xtx[i]![i]! += ridge;
  // Gauss-Jordan
  const a = xtx.map((r) => r.slice());
  const b = xty.slice();
  for (let col = 0; col < p; col++) {
    let pivot = col;
    for (let r = col + 1; r < p; r++) {
      if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(a[pivot]![col]!) < 1e-14) continue;
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    [b[col], b[pivot]] = [b[pivot]!, b[col]!];
    const div = a[col]![col]!;
    for (let j = col; j < p; j++) a[col]![j]! /= div;
    b[col]! /= div;
    for (let r = 0; r < p; r++) {
      if (r === col) continue;
      const f = a[r]![col]!;
      for (let j = col; j < p; j++) a[r]![j]! -= f * a[col]![j]!;
      b[r]! -= f * b[col]!;
    }
  }
  return {
    version: "m18-uir-residualizer-v1",
    kind,
    coef: b,
    featureNames,
  };
}

export function applyResidualizer(
  row: ResidualRow,
  model: Residualizer
): number {
  const feats = [1, row.P_RAW, Math.log(row.N + 1)];
  if (model.kind === "UIR-B") {
    feats.push(row.roleOffenseLean ?? 0, row.roleDefenseLean ?? 0);
  }
  let pred = 0;
  for (let i = 0; i < model.coef.length; i++) pred += model.coef[i]! * (feats[i] ?? 0);
  return row.L - pred;
}

export function computeUirMap(
  rows: ResidualRow[],
  model: Residualizer
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    out.set(r.playerId, applyResidualizer(r, model));
  }
  return out;
}

/** Nested OLS for incremental prediction: y ~ P  vs  y ~ P + UIR. */
export function fitPredictCompare(
  y: number[],
  pRaw: number[],
  uir: number[]
): {
  m0: { rmse: number; mae: number; pearson: number; spearman: number; r2: number };
  m1: { rmse: number; mae: number; pearson: number; spearman: number; r2: number };
  deltaRMSE: number;
  deltaMAE: number;
} {
  const n = y.length;
  // M0: y ~ a + b P
  const m0coef = ols2(pRaw, y);
  const m0hat = pRaw.map((x) => m0coef.a + m0coef.b * x);
  // M1: y ~ a + b P + c UIR
  const m1coef = ols3(pRaw, uir, y);
  const m1hat = pRaw.map(
    (x, i) => m1coef.a + m1coef.b * x + m1coef.c * uir[i]!
  );
  const m0 = metrics(y, m0hat);
  const m1 = metrics(y, m1hat);
  return {
    m0,
    m1,
    deltaRMSE: m1.rmse - m0.rmse,
    deltaMAE: m1.mae - m0.mae,
  };
}

function ols2(x: number[], y: number[]): { a: number; b: number } {
  const n = x.length;
  let sx = 0,
    sy = 0,
    sxx = 0,
    sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i]!;
    sy += y[i]!;
    sxx += x[i]! * x[i]!;
    sxy += x[i]! * y[i]!;
  }
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-12) return { a: mean(y), b: 0 };
  const b = (n * sxy - sx * sy) / den;
  const a = (sy - b * sx) / n;
  return { a, b };
}

function ols3(
  x1: number[],
  x2: number[],
  y: number[]
): { a: number; b: number; c: number } {
  const n = y.length;
  // Normal equations 3x3
  let s1 = 0,
    s2 = 0,
    sy = 0,
    s11 = 0,
    s22 = 0,
    s12 = 0,
    s1y = 0,
    s2y = 0;
  for (let i = 0; i < n; i++) {
    const a = x1[i]!;
    const b = x2[i]!;
    const yi = y[i]!;
    s1 += a;
    s2 += b;
    sy += yi;
    s11 += a * a;
    s22 += b * b;
    s12 += a * b;
    s1y += a * yi;
    s2y += b * yi;
  }
  // [n s1 s2; s1 s11 s12; s2 s12 s22] [a;b;c] = [sy;s1y;s2y]
  const A = [
    [n, s1, s2],
    [s1, s11, s12],
    [s2, s12, s22],
  ];
  const B = [sy, s1y, s2y];
  for (let i = 0; i < 3; i++) A[i]![i]! += 1e-9;
  const coef = solve3(A, B);
  return { a: coef[0]!, b: coef[1]!, c: coef[2]! };
}

function solve3(aIn: number[][], bIn: number[]): number[] {
  const a = aIn.map((r) => r.slice());
  const b = bIn.slice();
  const n = 3;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    }
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    [b[col], b[pivot]] = [b[pivot]!, b[col]!];
    const div = a[col]![col]!;
    if (Math.abs(div) < 1e-14) continue;
    for (let j = col; j < n; j++) a[col]![j]! /= div;
    b[col]! /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r]![col]!;
      for (let j = col; j < n; j++) a[r]![j]! -= f * a[col]![j]!;
      b[r]! -= f * b[col]!;
    }
  }
  return b;
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return NaN;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0,
    dx = 0,
    dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    dx += (xs[i]! - mx) ** 2;
    dy += (ys[i]! - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den > 1e-12 ? num / den : NaN;
}

function spearman(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return NaN;
  const rank = (arr: number[]) => {
    const order = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const r = new Array(n);
    for (let i = 0; i < order.length; i++) r[order[i]!.i] = i + 1;
    return r as number[];
  };
  return pearson(rank(xs), rank(ys));
}

function metrics(y: number[], yhat: number[]) {
  const n = y.length;
  let abs = 0,
    sq = 0;
  const my = mean(y);
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const e = yhat[i]! - y[i]!;
    abs += Math.abs(e);
    sq += e * e;
    ssTot += (y[i]! - my) ** 2;
  }
  return {
    rmse: Math.sqrt(sq / n),
    mae: abs / n,
    pearson: pearson(yhat, y),
    spearman: spearman(yhat, y),
    r2: ssTot > 1e-12 ? 1 - sq / ssTot : NaN,
  };
}

export function bootstrapDeltaRmse(
  y: number[],
  pRaw: number[],
  uir: number[],
  opts: { resamples?: number; seed?: number } = {}
): {
  deltaRMSE: number;
  ciLow: number;
  ciHigh: number;
  probImproves: number;
} {
  const resamples = opts.resamples ?? 1000;
  const seed = opts.seed ?? 42;
  let t = seed >>> 0;
  const rng = () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const point = fitPredictCompare(y, pRaw, uir).deltaRMSE;
  const diffs: number[] = [];
  const n = y.length;
  for (let r = 0; r < resamples; r++) {
    const yi: number[] = [];
    const pi: number[] = [];
    const ui: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = Math.floor(rng() * n);
      yi.push(y[j]!);
      pi.push(pRaw[j]!);
      ui.push(uir[j]!);
    }
    diffs.push(fitPredictCompare(yi, pi, ui).deltaRMSE);
  }
  diffs.sort((a, b) => a - b);
  return {
    deltaRMSE: point,
    ciLow: diffs[Math.floor(0.025 * diffs.length)]!,
    ciHigh: diffs[Math.min(diffs.length - 1, Math.floor(0.975 * diffs.length))]!,
    probImproves: diffs.filter((d) => d < 0).length / diffs.length,
  };
}

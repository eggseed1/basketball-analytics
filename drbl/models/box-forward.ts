/**
 * The box-blend rating published as DRBL/100.
 *
 *   blend   = ½ × v1 + ½ × s × forward
 *   DRBL/100 = calibration × n/(n + K) × blend
 *
 * v1 is the play-by-play raw rate shrunk toward the same-season box rating
 * (box-prior.ts). forward is a box rating whose features add the play-by-play
 * DRBL/100 (EB1600, kept as drblPbp100) and shrunk on-court net, with weights
 * fit on later possessions: season N → season N+1, and each season's first
 * half → second half. s rescales forward to v1's appearance-weighted spread.
 * calibration is the slope of those later possessions' points on the blend's
 * lineup sums, so DRBL/100 reads as points per 100 possessions; it is fit
 * separately for windows of different length, since an early-season blend is
 * mostly noise and needs a smaller multiplier. Each player's value is also
 * multiplied by n/(n + K) for his own sample n, so thin samples stay near 0.
 *
 * Weights, calibration and a frozen copy of last season's box weights (used
 * while a new season is too short to fit its own) are fit offline by
 * `npm run drbl:box-forward-fit` and kept in BOX_FORWARD_WEIGHTS_PATH,
 * because the nightly compute only has the current season's possessions.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { choleskySolve, type AnchoredLineupPossession } from "./anchored-lineup";
import {
  BOX_PRIOR_CONFIG,
  BOX_PRIOR_FEATURES,
  boxPriorFeatures,
  boxPriorFitFromWeights,
  boxPriorSummary,
  fitBoxPrior,
  shrinkTowardBoxPrior,
  type BoxPriorConfig,
  type BoxPriorFit,
  type BoxPriorSummary,
  type BoxPriorTotals,
} from "./box-prior";

export const BOX_FORWARD_VERSION = "drbl-box-forward-v2";

export const BOX_FORWARD_FEATURES = [...BOX_PRIOR_FEATURES, "drblPbp100", "onCourtNetPer100"] as const;

/** Repo-relative; rewritten by `npm run drbl:box-forward-fit`. */
export const BOX_FORWARD_WEIGHTS_PATH = path.join("drbl", "models", "box-forward-weights.json");

export const BOX_FORWARD_CONFIG = Object.freeze({
  /** Pseudo appearances at 0 added to on-court net. */
  netShrinkAppearances: 1500,
  /** Share of v1 in the blend. */
  v1Share: 0.5,
  /**
   * Candidate K for the per-player n/(n+K) shrink; the fit keeps the one that predicts later points best.
   * Starts at 500: below that, later-points error is flat while bench ratings stop carrying over to the
   * next season.
   */
  playerShrinkGrid: [500, 1000, 2000, 4000, 8000] as readonly number[],
});

const NF = BOX_FORWARD_FEATURES.length;
/** Block columns: forward features, v1, home, intercept. */
const V1 = NF;
const HOME = NF + 1;
const ONE = NF + 2;
const NC = NF + 3;

export interface BoxForwardBlockInfo {
  /** early: first `games` of a season → the rest; half: first half → second half; pair: full season → next season. */
  kind: "early" | "half" | "pair";
  /** Season the features come from. */
  from: string;
  /** Season the target possessions come from. */
  to: string;
  /** Games in the feature window. */
  games: number;
  possessions: number;
}

/** Calibration fit on feature windows of about `games` games. */
export interface BoxForwardCalibrationPoint {
  games: number;
  calibration: number;
}

export interface BoxForwardWeights {
  version: typeof BOX_FORWARD_VERSION;
  fittedAt: string;
  features: string[];
  /** Points per 100 possessions per one SD of each feature, one player on court. */
  weightsPer100: number[];
  /**
   * Multipliers that put the blend in points per 100 possessions, by games in
   * the rating window (ascending). Short windows need smaller ones because
   * their box rates and play-by-play rates are mostly noise.
   */
  calibration: BoxForwardCalibrationPoint[];
  /**
   * Each player's blend is multiplied by n/(n + playerShrinkK), n being his
   * possession appearances in the rating window, so thin samples sit near 0.
   */
  playerShrinkK: number;
  /** Same-season box weights used when a season is too short to fit its own. */
  fallbackBoxWeightsPer100: number[];
  /** Season the fallback box weights were fit on. */
  fallbackFrom: string;
  blocks: BoxForwardBlockInfo[];
}

/** Feature window behind a block: forward features, v1 ratings and appearances. */
export interface BoxForwardWindow {
  features: ReadonlyMap<string, number[]>;
  v1: ReadonlyMap<string, number>;
  appearances: ReadonlyMap<string, number>;
}

export interface BoxForwardBlock {
  /** Normal equations over lineup sums of [features…, v1, home, 1] on later points. */
  xtx: Float64Array;
  xty: Float64Array;
  /** Sum of squared points, for the residual error of a fit. */
  yy: number;
  possessions: number;
  /** Appearance-weighted moments of the window's players (unshrunk), for the blend's rescaling. */
  weight: number;
  mean: Float64Array;
  second: Float64Array;
  v1Sd: number;
}

function standardize(values: ReadonlyMap<string, number>, weights: ReadonlyMap<string, number>): Map<string, number> {
  let W = 0;
  let s1 = 0;
  for (const [id, w] of weights) {
    W += w;
    s1 += w * (values.get(id) ?? 0);
  }
  const mean = W > 0 ? s1 / W : 0;
  let s2 = 0;
  for (const [id, w] of weights) s2 += w * ((values.get(id) ?? 0) - mean) ** 2;
  const sd = W > 0 ? Math.sqrt(s2 / W) || 1 : 1;
  const out = new Map<string, number>();
  for (const id of weights.keys()) out.set(id, ((values.get(id) ?? 0) - mean) / sd);
  return out;
}

function weightedSd(values: ReadonlyMap<string, number>, weights: ReadonlyMap<string, number>): number {
  let W = 0;
  let s1 = 0;
  let s2 = 0;
  for (const [id, v] of values) {
    const w = weights.get(id) ?? 0;
    W += w;
    s1 += w * v;
    s2 += w * v * v;
  }
  return W > 0 ? Math.sqrt(Math.max(0, s2 / W - (s1 / W) ** 2)) : 0;
}

/** Shrunk on-court net points per 100 appearances over 5v5 possessions. */
export function onCourtNetPer100(
  rows: readonly AnchoredLineupPossession[],
  shrink: number = BOX_FORWARD_CONFIG.netShrinkAppearances
): Map<string, number> {
  const net = new Map<string, number>();
  const n = new Map<string, number>();
  for (const r of rows) {
    for (const id of r.offensePlayerIds) {
      net.set(id, (net.get(id) ?? 0) + r.points);
      n.set(id, (n.get(id) ?? 0) + 1);
    }
    for (const id of r.defensePlayerIds) {
      net.set(id, (net.get(id) ?? 0) - r.points);
      n.set(id, (n.get(id) ?? 0) + 1);
    }
  }
  const out = new Map<string, number>();
  for (const [id, v] of net) out.set(id, (100 * v) / (n.get(id)! + shrink));
  return out;
}

/**
 * `boxFeatures` from boxPriorFeatures; players missing a play-by-play rate or
 * on-court value count as 0 before standardizing.
 */
export function boxForwardFeatures(
  boxFeatures: ReadonlyMap<string, number[]>,
  appearances: ReadonlyMap<string, number>,
  drblPbp100: ReadonlyMap<string, number>,
  rows: readonly AnchoredLineupPossession[]
): Map<string, number[]> {
  const weights = new Map<string, number>();
  for (const id of boxFeatures.keys()) weights.set(id, (appearances.get(id) ?? 0) / 2);
  const zp = standardize(drblPbp100, weights);
  const zn = standardize(onCourtNetPer100(rows), weights);
  const out = new Map<string, number[]>();
  for (const [id, z] of boxFeatures) out.set(id, [...z, zp.get(id)!, zn.get(id)!]);
  return out;
}

/** n/(n + K) for a player with n appearances; 1 when K is 0. */
export function playerShrink(appearances: number, playerShrinkK: number): number {
  if (playerShrinkK <= 0) return 1;
  return appearances > 0 ? appearances / (appearances + playerShrinkK) : 0;
}

/**
 * Target-window points against feature-window lineup sums (5v5 only). With
 * `playerShrinkK`, each player's row enters the sums times n/(n + K); the
 * moments used to rescale the blend stay unshrunk, as in buildBoxPriorV2.
 */
export function boxForwardBlock(
  rows: readonly AnchoredLineupPossession[],
  window: BoxForwardWindow,
  playerShrinkK = 0
): BoxForwardBlock {
  const xtx = new Float64Array(NC * NC);
  const xty = new Float64Array(NC);
  const row = new Float64Array(NC);
  let yy = 0;
  let possessions = 0;
  const shrink = new Map<string, number>();
  const add = (id: string, sign: number) => {
    let r = shrink.get(id);
    if (r === undefined) {
      r = playerShrink(window.appearances.get(id) ?? 0, playerShrinkK);
      shrink.set(id, r);
    }
    const z = window.features.get(id);
    if (z) for (let i = 0; i < NF; i++) row[i]! += sign * r * z[i]!;
    row[V1]! += sign * r * (window.v1.get(id) ?? 0);
  };
  for (const r of rows) {
    if (r.offensePlayerIds.length !== 5 || r.defensePlayerIds.length !== 5) continue;
    row.fill(0);
    for (const id of r.offensePlayerIds) add(id, 1);
    for (const id of r.defensePlayerIds) add(id, -1);
    row[HOME] = r.offenseIsHome ? 1 : 0;
    row[ONE] = 1;
    for (let a = 0; a < NC; a++) {
      xty[a]! += row[a]! * r.points;
      for (let b = 0; b < NC; b++) xtx[a * NC + b]! += row[a]! * row[b]!;
    }
    yy += r.points * r.points;
    possessions += 1;
  }
  const mean = new Float64Array(NF);
  const second = new Float64Array(NF * NF);
  let weight = 0;
  for (const [id, z] of window.features) {
    const w = window.appearances.get(id) ?? 0;
    weight += w;
    for (let i = 0; i < NF; i++) {
      mean[i]! += w * z[i]!;
      for (let j = 0; j < NF; j++) second[i * NF + j]! += w * z[i]! * z[j]!;
    }
  }
  return { xtx, xty, yy, possessions, weight, mean, second, v1Sd: weightedSd(window.v1, window.appearances) };
}

/** Weights per 100 from pooled blocks; one shared home and intercept term. */
export function solveBoxForward(blocks: readonly BoxForwardBlock[]): number[] {
  if (blocks.length === 0) throw new Error("solveBoxForward needs at least one block");
  const idx = [...Array.from({ length: NF }, (_, i) => i), HOME, ONE];
  const n = idx.length;
  const xtx = new Float64Array(n * n);
  const xty = new Float64Array(n);
  for (const b of blocks) {
    for (let i = 0; i < n; i++) {
      xty[i]! += b.xty[idx[i]!]!;
      for (let j = 0; j < n; j++) xtx[i * n + j]! += b.xtx[idx[i]! * NC + idx[j]!]!;
    }
  }
  for (let i = 0; i < n; i++) xtx[i * n + i]! += 1e-9;
  return Array.from(choleskySolve(xtx, xty, n))
    .slice(0, NF)
    .map((b) => 100 * b);
}

function forwardSdOf(block: BoxForwardBlock, weightsPer100: readonly number[]): number {
  if (block.weight <= 0) return 0;
  let m = 0;
  let q = 0;
  for (let i = 0; i < NF; i++) {
    m += weightsPer100[i]! * block.mean[i]!;
    for (let j = 0; j < NF; j++) q += weightsPer100[i]! * weightsPer100[j]! * block.second[i * NF + j]!;
  }
  m /= block.weight;
  return Math.sqrt(Math.max(0, q / block.weight - m * m));
}

/** Slope of later points on the blend's lineup sums, per 100; 1 means the blend is already in points per 100. */
export function calibrateBoxForward(blocks: readonly BoxForwardBlock[], weightsPer100: readonly number[]): number {
  return fitBoxForwardCalibration(blocks, weightsPer100).calibration;
}

/** calibrateBoxForward plus the residual sum of squares of that fit (slope, home and intercept). */
export function fitBoxForwardCalibration(
  blocks: readonly BoxForwardBlock[],
  weightsPer100: readonly number[]
): { calibration: number; sse: number } {
  if (blocks.length === 0) throw new Error("calibrateBoxForward needs at least one block");
  const share = BOX_FORWARD_CONFIG.v1Share;
  const a = new Float64Array(9);
  const b = new Float64Array(3);
  let yy = 0;
  for (const blk of blocks) {
    yy += blk.yy;
    const fsd = forwardSdOf(blk, weightsPer100);
    const s = fsd > 0 ? blk.v1Sd / fsd : 0;
    const coef = new Float64Array(NC);
    for (let i = 0; i < NF; i++) coef[i] = (1 - share) * s * weightsPer100[i]!;
    coef[V1] = share;
    const dot = (col: number) => {
      let v = 0;
      for (let i = 0; i < NC; i++) v += coef[i]! * blk.xtx[i * NC + col]!;
      return v;
    };
    let sxx = 0;
    for (let i = 0; i < NC; i++) sxx += coef[i]! * dot(i);
    let sxy = 0;
    for (let i = 0; i < NC; i++) sxy += coef[i]! * blk.xty[i]!;
    const sxh = dot(HOME);
    const sx1 = dot(ONE);
    const m = [sxx, sxh, sx1, sxh, blk.xtx[HOME * NC + HOME]!, blk.xtx[HOME * NC + ONE]!, sx1, blk.xtx[ONE * NC + HOME]!, blk.xtx[ONE * NC + ONE]!];
    for (let i = 0; i < 9; i++) a[i]! += m[i]!;
    b[0]! += sxy;
    b[1]! += blk.xty[HOME]!;
    b[2]! += blk.xty[ONE]!;
  }
  for (let i = 0; i < 3; i++) a[i * 3 + i]! += 1e-12;
  const beta = choleskySolve(a, b, 3);
  return { calibration: 100 * beta[0]!, sse: yy - (beta[0]! * b[0]! + beta[1]! * b[1]! + beta[2]! * b[2]!) };
}

/** Calibration for a window of `games` games: log-linear between fitted points, flat beyond them. */
export function calibrationAt(points: readonly BoxForwardCalibrationPoint[], games: number): number {
  if (points.length === 0) throw new Error("calibrationAt needs at least one point");
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (games <= first.games) return first.calibration;
  if (games >= last.games) return last.calibration;
  const i = points.findIndex((p) => p.games > games);
  const a = points[i - 1]!;
  const b = points[i]!;
  const t = (Math.log(games) - Math.log(a.games)) / (Math.log(b.games) - Math.log(a.games));
  return a.calibration + t * (b.calibration - a.calibration);
}

export function boxForwardRatings(
  features: ReadonlyMap<string, number[]>,
  weightsPer100: readonly number[]
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, z] of features) out.set(id, z.reduce((s, v, i) => s + v * weightsPer100[i]!, 0));
  return out;
}

export interface BoxPriorV2 {
  /** Published DRBL/100: calibration × n/(n + playerShrinkK) × blend. */
  ratings: Map<string, number>;
  /** Multiplier putting forward ratings on v1's spread before blending. */
  forwardScale: number;
  calibration: number;
  playerShrinkK: number;
  fit: BoxPriorFit;
  /** "frozen" when the window was too short to fit its own box weights. */
  fitSource: "season" | "frozen";
  forwardWeightsPer100: number[];
  /** Games in the rating window, when known. */
  windowGames?: number;
}

/** v1 ratings for a window: play-by-play raw rate shrunk toward the box rating. */
export function boxPriorV1(
  fit: BoxPriorFit,
  rawAbilityRate: ReadonlyMap<string, number>,
  possessions: ReadonlyMap<string, number>,
  config: BoxPriorConfig = BOX_PRIOR_CONFIG
): Map<string, number> {
  return shrinkTowardBoxPrior(rawAbilityRate, possessions, fit.ratingsPer100, config);
}

/** Calibrated, sample-shrunk blend for every player with box features. */
export function buildBoxPriorV2(args: {
  fit: BoxPriorFit;
  fitSource?: "season" | "frozen";
  boxFeatures: ReadonlyMap<string, number[]>;
  forwardWeightsPer100: readonly number[];
  calibration: number;
  playerShrinkK?: number;
  appearances: ReadonlyMap<string, number>;
  rows: readonly AnchoredLineupPossession[];
  drblPbp100: ReadonlyMap<string, number>;
  rawAbilityRate: ReadonlyMap<string, number>;
  possessions: ReadonlyMap<string, number>;
  config?: BoxPriorConfig;
}): BoxPriorV2 {
  const v1 = boxPriorV1(args.fit, args.rawAbilityRate, args.possessions, args.config ?? BOX_PRIOR_CONFIG);
  const forward = boxForwardRatings(
    boxForwardFeatures(args.boxFeatures, args.appearances, args.drblPbp100, args.rows),
    args.forwardWeightsPer100
  );
  const fsd = weightedSd(forward, args.appearances);
  const forwardScale = fsd > 0 ? weightedSd(v1, args.appearances) / fsd : 0;
  const share = BOX_FORWARD_CONFIG.v1Share;
  const k = args.playerShrinkK ?? 0;
  const ratings = new Map<string, number>();
  for (const [id, v] of v1) {
    const blend = share * v + (1 - share) * forwardScale * (forward.get(id) ?? 0);
    ratings.set(id, args.calibration * playerShrink(args.appearances.get(id) ?? 0, k) * blend);
  }
  return {
    ratings,
    forwardScale,
    calibration: args.calibration,
    playerShrinkK: k,
    fit: args.fit,
    fitSource: args.fitSource ?? "season",
    forwardWeightsPer100: [...args.forwardWeightsPer100],
  };
}

/**
 * DRBL/100 from one season's possessions so far (`games` games), box totals
 * and player rows. Falls back to the frozen box weights when the season is
 * too short to fit its own; null only when no player has box features.
 */
export function boxPriorV2ForSeason(args: {
  rows: readonly AnchoredLineupPossession[];
  appearances: ReadonlyMap<string, number>;
  totals: BoxPriorTotals;
  players: readonly { playerId: string; drblPbp100: number; rawAbilityRate: number; possessions: number }[];
  games: number;
  weights: BoxForwardWeights;
}): BoxPriorV2 | null {
  const boxFeatures = boxPriorFeatures(args.totals, args.appearances);
  if (boxFeatures.size === 0) return null;
  const seasonFit = fitBoxPrior(args.rows, boxFeatures);
  const fit = seasonFit ?? boxPriorFitFromWeights(boxFeatures, args.weights.fallbackBoxWeightsPer100);
  const pick = (f: (p: (typeof args.players)[number]) => number) =>
    new Map(args.players.map((p) => [p.playerId, f(p)]));
  const v2 = buildBoxPriorV2({
    fit,
    fitSource: seasonFit ? "season" : "frozen",
    boxFeatures,
    forwardWeightsPer100: args.weights.weightsPer100,
    calibration: calibrationAt(args.weights.calibration, args.games),
    playerShrinkK: args.weights.playerShrinkK,
    appearances: args.appearances,
    rows: args.rows,
    drblPbp100: pick((p) => p.drblPbp100),
    rawAbilityRate: pick((p) => p.rawAbilityRate),
    possessions: pick((p) => p.possessions),
  });
  return { ...v2, windowGames: args.games };
}

export interface BoxPriorV2Summary extends BoxPriorSummary {
  v1Share: number;
  forwardScale: number;
  /** Calibration applied, for a window of `windowGames` games. */
  calibration: number;
  windowGames: number | null;
  playerShrinkK: number;
  boxFitSource: "season" | "frozen";
  forward: {
    version: typeof BOX_FORWARD_VERSION;
    fittedAt: string;
    blocks: BoxForwardBlockInfo[];
    calibration: BoxForwardCalibrationPoint[];
    fallbackFrom: string;
    weightsPer100: Record<(typeof BOX_FORWARD_FEATURES)[number], number>;
  };
}

export function boxPriorV2Summary(v2: BoxPriorV2, weights: BoxForwardWeights): BoxPriorV2Summary {
  return {
    ...boxPriorSummary(v2.fit),
    v1Share: BOX_FORWARD_CONFIG.v1Share,
    forwardScale: Number(v2.forwardScale.toFixed(4)),
    calibration: Number(v2.calibration.toFixed(4)),
    windowGames: v2.windowGames ?? null,
    playerShrinkK: v2.playerShrinkK,
    boxFitSource: v2.fitSource,
    forward: {
      version: weights.version,
      fittedAt: weights.fittedAt,
      blocks: weights.blocks,
      calibration: weights.calibration,
      fallbackFrom: weights.fallbackFrom,
      weightsPer100: Object.fromEntries(
        BOX_FORWARD_FEATURES.map((f, i) => [f, Number(v2.forwardWeightsPer100[i]!.toFixed(3))])
      ) as BoxPriorV2Summary["forward"]["weightsPer100"],
    },
  };
}

/** Null when the file is missing, invalid or was fit on a different feature list. */
export async function loadBoxForwardWeights(
  file: string = path.join(process.cwd(), BOX_FORWARD_WEIGHTS_PATH)
): Promise<BoxForwardWeights | null> {
  try {
    const w = JSON.parse(await readFile(file, "utf8")) as BoxForwardWeights;
    const sameFeatures =
      Array.isArray(w.features) &&
      w.features.length === NF &&
      w.features.every((f, i) => f === BOX_FORWARD_FEATURES[i]);
    if (w.version !== BOX_FORWARD_VERSION || !sameFeatures || w.weightsPer100?.length !== NF) return null;
    if (!w.weightsPer100.every((v) => Number.isFinite(v))) return null;
    const points = Array.isArray(w.calibration) ? w.calibration : [];
    if (points.length === 0) return null;
    if (!points.every((p, i) => p.games > (i === 0 ? 0 : points[i - 1]!.games) && Number.isFinite(p.calibration) && p.calibration > 0)) {
      return null;
    }
    if (!Number.isFinite(w.playerShrinkK) || w.playerShrinkK < 0) return null;
    if (w.fallbackBoxWeightsPer100?.length !== BOX_PRIOR_FEATURES.length) return null;
    if (!w.fallbackBoxWeightsPer100.every((v) => Number.isFinite(v))) return null;
    return w;
  } catch {
    return null;
  }
}

/** loadBoxForwardWeights, throwing instead of returning null. */
export async function requireBoxForwardWeights(file?: string): Promise<BoxForwardWeights> {
  const w = await loadBoxForwardWeights(file);
  if (!w) {
    throw new Error(
      `${BOX_FORWARD_WEIGHTS_PATH} missing, invalid or fit on other features; run npm run drbl:box-forward-fit`
    );
  }
  return w;
}

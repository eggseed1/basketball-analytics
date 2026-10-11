/**
 * Forward half of the v2 box shadow (drblBox100).
 *
 * Features: the box-prior features plus DRBL/100 and shrunk on-court net per
 * 100, standardized within the season with offensive-possession weights.
 * Weights come from regressing points on later possessions on the earlier
 * features: season N → season N+1, and each season's first half → second
 * half. They are fit offline by `npm run drbl:box-forward-fit` and frozen in
 * BOX_FORWARD_WEIGHTS_PATH, because the nightly compute only has the current
 * season's possessions.
 *
 * drblBox100 (v2) = ½ × v1 + ½ × s × forward, where v1 is DRBL-P shrunk
 * toward the same-season box rating and s rescales forward to v1's
 * appearance-weighted spread.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { choleskySolve, type AnchoredLineupPossession } from "./anchored-lineup";
import {
  BOX_PRIOR_CONFIG,
  BOX_PRIOR_FEATURES,
  boxPriorFeatures,
  boxPriorSummary,
  fitBoxPrior,
  shrinkTowardBoxPrior,
  type BoxPriorConfig,
  type BoxPriorFit,
  type BoxPriorSummary,
  type BoxPriorTotals,
} from "./box-prior";

export const BOX_FORWARD_VERSION = "drbl-box-forward-v1";

export const BOX_FORWARD_FEATURES = [...BOX_PRIOR_FEATURES, "drbl100", "onCourtNetPer100"] as const;

/** Repo-relative; rewritten by `npm run drbl:box-forward-fit`. */
export const BOX_FORWARD_WEIGHTS_PATH = path.join("drbl", "models", "box-forward-weights.json");

export const BOX_FORWARD_CONFIG = Object.freeze({
  /** Pseudo appearances at 0 added to on-court net. */
  netShrinkAppearances: 1500,
  /** Share of v1 in the blend. */
  v1Share: 0.5,
});

const NF = BOX_FORWARD_FEATURES.length;

export interface BoxForwardBlockInfo {
  kind: "half" | "pair";
  /** Season the features come from. */
  from: string;
  /** Season the target possessions come from. */
  to: string;
  possessions: number;
}

export interface BoxForwardWeights {
  version: typeof BOX_FORWARD_VERSION;
  fittedAt: string;
  features: string[];
  /** Points per 100 possessions per one SD of each feature, one player on court. */
  weightsPer100: number[];
  blocks: BoxForwardBlockInfo[];
}

export interface BoxForwardBlock {
  xtx: Float64Array;
  xty: Float64Array;
  possessions: number;
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
 * `boxFeatures` from boxPriorFeatures; players missing a DRBL/100 or on-court
 * value count as 0 before standardizing.
 */
export function boxForwardFeatures(
  boxFeatures: ReadonlyMap<string, number[]>,
  appearances: ReadonlyMap<string, number>,
  drbl100: ReadonlyMap<string, number>,
  rows: readonly AnchoredLineupPossession[]
): Map<string, number[]> {
  const weights = new Map<string, number>();
  for (const id of boxFeatures.keys()) weights.set(id, (appearances.get(id) ?? 0) / 2);
  const zp = standardize(drbl100, weights);
  const zn = standardize(onCourtNetPer100(rows), weights);
  const out = new Map<string, number[]>();
  for (const [id, z] of boxFeatures) out.set(id, [...z, zp.get(id)!, zn.get(id)!]);
  return out;
}

/** Normal equations of target-window points on earlier-window features (5v5 only). */
export function boxForwardBlock(
  rows: readonly AnchoredLineupPossession[],
  features: ReadonlyMap<string, number[]>
): BoxForwardBlock {
  const n = NF + 2;
  const xtx = new Float64Array(n * n);
  const xty = new Float64Array(n);
  const row = new Float64Array(n);
  let possessions = 0;
  for (const r of rows) {
    if (r.offensePlayerIds.length !== 5 || r.defensePlayerIds.length !== 5) continue;
    row.fill(0);
    for (const id of r.offensePlayerIds) {
      const z = features.get(id);
      if (z) for (let i = 0; i < NF; i++) row[i]! += z[i]!;
    }
    for (const id of r.defensePlayerIds) {
      const z = features.get(id);
      if (z) for (let i = 0; i < NF; i++) row[i]! -= z[i]!;
    }
    row[NF] = r.offenseIsHome ? 1 : 0;
    row[NF + 1] = 1;
    for (let a = 0; a < n; a++) {
      xty[a]! += row[a]! * r.points;
      for (let b = 0; b < n; b++) xtx[a * n + b]! += row[a]! * row[b]!;
    }
    possessions += 1;
  }
  return { xtx, xty, possessions };
}

/** Weights per 100 from pooled blocks; one shared home and intercept term. */
export function solveBoxForward(blocks: readonly BoxForwardBlock[]): number[] {
  if (blocks.length === 0) throw new Error("solveBoxForward needs at least one block");
  const n = NF + 2;
  const xtx = new Float64Array(n * n);
  const xty = new Float64Array(n);
  for (const b of blocks) {
    for (let i = 0; i < n * n; i++) xtx[i]! += b.xtx[i]!;
    for (let i = 0; i < n; i++) xty[i]! += b.xty[i]!;
  }
  for (let i = 0; i < n; i++) xtx[i * n + i]! += 1e-9;
  return Array.from(choleskySolve(xtx, xty, n))
    .slice(0, NF)
    .map((b) => 100 * b);
}

export function boxForwardRatings(
  features: ReadonlyMap<string, number[]>,
  weightsPer100: readonly number[]
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, z] of features) out.set(id, z.reduce((s, v, i) => s + v * weightsPer100[i]!, 0));
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

export interface BoxPriorV2 {
  ratings: Map<string, number>;
  /** Multiplier putting forward ratings on v1's spread before blending. */
  forwardScale: number;
  fit: BoxPriorFit;
  forwardWeightsPer100: number[];
}

/** v1 and forward ratings blended for every player with box features. */
export function buildBoxPriorV2(args: {
  fit: BoxPriorFit;
  boxFeatures: ReadonlyMap<string, number[]>;
  forwardWeightsPer100: readonly number[];
  appearances: ReadonlyMap<string, number>;
  rows: readonly AnchoredLineupPossession[];
  drbl100: ReadonlyMap<string, number>;
  rawAbilityRate: ReadonlyMap<string, number>;
  possessions: ReadonlyMap<string, number>;
  config?: BoxPriorConfig;
}): BoxPriorV2 {
  const v1 = shrinkTowardBoxPrior(
    args.rawAbilityRate,
    args.possessions,
    args.fit.ratingsPer100,
    args.config ?? BOX_PRIOR_CONFIG
  );
  const forward = boxForwardRatings(
    boxForwardFeatures(args.boxFeatures, args.appearances, args.drbl100, args.rows),
    args.forwardWeightsPer100
  );
  const fsd = weightedSd(forward, args.appearances);
  const forwardScale = fsd > 0 ? weightedSd(v1, args.appearances) / fsd : 0;
  const share = BOX_FORWARD_CONFIG.v1Share;
  const ratings = new Map<string, number>();
  for (const [id, v] of v1) ratings.set(id, share * v + (1 - share) * forwardScale * (forward.get(id) ?? 0));
  return { ratings, forwardScale, fit: args.fit, forwardWeightsPer100: [...args.forwardWeightsPer100] };
}

/** Full-season v2 from one season's possessions, box totals and player rows; null below the box fit floor. */
export function boxPriorV2ForSeason(args: {
  rows: readonly AnchoredLineupPossession[];
  appearances: ReadonlyMap<string, number>;
  totals: BoxPriorTotals;
  players: readonly { playerId: string; drbl100: number; rawAbilityRate: number; possessions: number }[];
  weights: BoxForwardWeights;
}): BoxPriorV2 | null {
  const boxFeatures = boxPriorFeatures(args.totals, args.appearances);
  const fit = fitBoxPrior(args.rows, boxFeatures);
  if (!fit) return null;
  const pick = (f: (p: (typeof args.players)[number]) => number) =>
    new Map(args.players.map((p) => [p.playerId, f(p)]));
  return buildBoxPriorV2({
    fit,
    boxFeatures,
    forwardWeightsPer100: args.weights.weightsPer100,
    appearances: args.appearances,
    rows: args.rows,
    drbl100: pick((p) => p.drbl100),
    rawAbilityRate: pick((p) => p.rawAbilityRate),
    possessions: pick((p) => p.possessions),
  });
}

export interface BoxPriorV2Summary extends BoxPriorSummary {
  v1Share: number;
  forwardScale: number;
  forward: {
    version: typeof BOX_FORWARD_VERSION;
    fittedAt: string;
    blocks: BoxForwardBlockInfo[];
    weightsPer100: Record<(typeof BOX_FORWARD_FEATURES)[number], number>;
  };
}

export function boxPriorV2Summary(v2: BoxPriorV2, weights: BoxForwardWeights): BoxPriorV2Summary {
  return {
    ...boxPriorSummary(v2.fit),
    v1Share: BOX_FORWARD_CONFIG.v1Share,
    forwardScale: Number(v2.forwardScale.toFixed(4)),
    forward: {
      version: weights.version,
      fittedAt: weights.fittedAt,
      blocks: weights.blocks,
      weightsPer100: Object.fromEntries(
        BOX_FORWARD_FEATURES.map((f, i) => [f, Number(v2.forwardWeightsPer100[i]!.toFixed(3))])
      ) as BoxPriorV2Summary["forward"]["weightsPer100"],
    },
  };
}

/** Null when the file is missing or was fit on a different feature list. */
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
    return w;
  } catch {
    return null;
  }
}

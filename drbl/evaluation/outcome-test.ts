/**
 * Scoreboard outcome test: do player ratings predict final margins of games
 * the ratings never saw? Pure helpers; data loading lives in
 * scripts/drbl-outcome-test.ts.
 *
 * A rating becomes one number per game: home-minus-away on-court strength
 * summed over every possession (per 100). A 10-fold cross-validated linear
 * fit maps that to the home margin, so ratings on different scales compete
 * fairly.
 */
import {
  ANCHORED_LINEUP_CONFIG,
  anchoredPriorFill,
  createAnchoredLineupInput,
  type AnchoredLineupInput,
} from "../models/anchored-lineup";

export interface OutcomePossession {
  offenseIsHome: boolean;
  off: string[];
  def: string[];
  points: number;
}

export interface OutcomeGame {
  gameId: string;
  date: string;
  homeTeamId: string;
  awayTeamId: string;
  /** Final home margin. */
  margin: number;
  poss: OutcomePossession[];
}

export type Ratings = ReadonlyMap<string, number>;

export function exposureOf(games: readonly OutcomeGame[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const g of games)
    for (const p of g.poss) {
      for (const id of p.off) m.set(id, (m.get(id) ?? 0) + 1);
      for (const id of p.def) m.set(id, (m.get(id) ?? 0) + 1);
    }
  return m;
}

export function anchoredInputOf(games: readonly OutcomeGame[]): AnchoredLineupInput {
  const input = createAnchoredLineupInput();
  input.appearances = exposureOf(games);
  for (const g of games)
    for (const p of g.poss)
      if (p.off.length === 5 && p.def.length === 5)
        input.rows.push({
          offenseIsHome: p.offenseIsHome,
          offensePlayerIds: p.off,
          defensePlayerIds: p.def,
          points: p.points,
        });
  return input;
}

/** Players under the exposure floor or without a rating get the mid-exposure mean. */
export function ratingLookup(ratings: Ratings, exposure: ReadonlyMap<string, number>) {
  const fill = anchoredPriorFill(ratings, exposure);
  return (id: string): number => {
    const v = ratings.get(id);
    if (v == null || !Number.isFinite(v)) return fill;
    if ((exposure.get(id) ?? 0) < ANCHORED_LINEUP_CONFIG.minPriorAppearances) return fill;
    return v;
  };
}

export function gameFeature(
  games: readonly OutcomeGame[],
  ratings: Ratings,
  exposure: ReadonlyMap<string, number>
): number[] {
  const f = ratingLookup(ratings, exposure);
  return games.map((g) => {
    let x = 0;
    for (const p of g.poss) {
      let s = 0;
      for (const id of p.off) s += f(id);
      for (const id of p.def) s -= f(id);
      x += ((p.offenseIsHome ? 1 : -1) * s) / 100;
    }
    return x;
  });
}

export function rawPlusMinus(games: readonly OutcomeGame[]): Map<string, number> {
  const sum = new Map<string, number>();
  const n = new Map<string, number>();
  for (const g of games)
    for (const p of g.poss) {
      for (const id of p.off) {
        sum.set(id, (sum.get(id) ?? 0) + p.points);
        n.set(id, (n.get(id) ?? 0) + 1);
      }
      for (const id of p.def) {
        sum.set(id, (sum.get(id) ?? 0) - p.points);
        n.set(id, (n.get(id) ?? 0) + 1);
      }
    }
  const r = new Map<string, number>();
  for (const [id, v] of sum) r.set(id, (100 * v) / n.get(id)!);
  return r;
}

/** Team net rating from the rating window, scaled by test-game possessions. */
export function teamFeature(train: readonly OutcomeGame[], test: readonly OutcomeGame[]): number[] {
  const net = new Map<string, { pts: number; poss: number }>();
  const add = (team: string, pts: number, poss: number) => {
    const cur = net.get(team) ?? { pts: 0, poss: 0 };
    cur.pts += pts;
    cur.poss += poss;
    net.set(team, cur);
  };
  for (const g of train)
    for (const p of g.poss) {
      const off = p.offenseIsHome ? g.homeTeamId : g.awayTeamId;
      const def = p.offenseIsHome ? g.awayTeamId : g.homeTeamId;
      add(off, p.points, 1);
      add(def, -p.points, 0);
    }
  const rating = (t: string) => {
    const v = net.get(t);
    return v && v.poss > 0 ? (100 * v.pts) / v.poss : 0;
  };
  return test.map((g) => ((rating(g.homeTeamId) - rating(g.awayTeamId)) * g.poss.length) / 200);
}

function solve(a: number[][], b: number[]): number[] {
  const k = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
    [m[c], m[piv]] = [m[piv]!, m[c]!];
    const d = m[c]![c]! || 1e-12;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = m[r]![c]! / d;
      for (let j = c; j <= k; j++) m[r]![j]! -= f * m[c]![j]!;
    }
  }
  return m.map((row, i) => row[k]! / (row[i]! || 1e-12));
}

/** Least squares with intercept; returns [intercept, ...slopes]. */
export function ols(features: readonly number[][], y: readonly number[], rows: readonly number[]): number[] {
  const k = features.length + 1;
  const a = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b = new Array<number>(k).fill(0);
  for (const r of rows) {
    const x = [1, ...features.map((f) => f[r]!)];
    for (let i = 0; i < k; i++) {
      b[i]! += x[i]! * y[r]!;
      for (let j = 0; j < k; j++) a[i]![j]! += x[i]! * x[j]!;
    }
  }
  for (let i = 1; i < k; i++) a[i]![i]! += 1e-9;
  return solve(a, b);
}

/** Out-of-fold predictions from a 10-fold linear calibration (fold = index mod 10). */
export function cvPredict(features: readonly number[][], y: readonly number[]): number[] {
  const n = y.length;
  const pred = new Array<number>(n).fill(0);
  for (let f = 0; f < 10; f++) {
    const train: number[] = [];
    for (let i = 0; i < n; i++) if (i % 10 !== f) train.push(i);
    const beta = ols(features, y, train);
    for (let i = f; i < n; i += 10) {
      let p = beta[0]!;
      for (let c = 0; c < features.length; c++) p += beta[c + 1]! * features[c]![i]!;
      pred[i] = p;
    }
  }
  return pred;
}

export const rmse = (pred: readonly number[], y: readonly number[]): number =>
  Math.sqrt(pred.reduce((s, v, i) => s + (v - y[i]!) ** 2, 0) / y.length);

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DeltaRmse {
  /** RMSE(candidate) − RMSE(published); negative means the candidate predicts better. */
  delta: number;
  lo: number;
  hi: number;
  verdict: "better" | "worse" | "no clear difference";
}

/** Game-bootstrap 95% interval on the RMSE difference (fixed seed). */
export function bootDelta(
  candidate: readonly number[],
  baseline: readonly number[],
  y: readonly number[],
  samples = 1000,
  seed = 20261010
): DeltaRmse {
  const rnd = mulberry(seed);
  const n = y.length;
  const ds: number[] = [];
  for (let b = 0; b < samples; b++) {
    let sa = 0;
    let sb = 0;
    for (let k = 0; k < n; k++) {
      const i = Math.floor(rnd() * n);
      sa += (candidate[i]! - y[i]!) ** 2;
      sb += (baseline[i]! - y[i]!) ** 2;
    }
    ds.push(Math.sqrt(sa / n) - Math.sqrt(sb / n));
  }
  ds.sort((a, b) => a - b);
  const lo = ds[Math.floor(0.025 * samples)]!;
  const hi = ds[Math.floor(0.975 * samples)]!;
  return {
    delta: rmse(candidate, y) - rmse(baseline, y),
    lo,
    hi,
    verdict: hi < 0 ? "better" : lo > 0 ? "worse" : "no clear difference",
  };
}

export interface ScoredRating {
  name: string;
  rmse: number;
  r2: number;
  vsPublished?: DeltaRmse;
}

export interface OutcomeReport {
  label: string;
  games: number;
  results: ScoredRating[];
  /** Published plus each candidate as a second slope: does it add anything? */
  incremental: ScoredRating[];
}

export const PUBLISHED = "Published DRBL/100";

/** `features` must include PUBLISHED. Home-court-only R² is 0 by construction. */
export function scoreOutcomes(
  label: string,
  test: readonly OutcomeGame[],
  features: Record<string, number[]>,
  teamX: number[] | null
): OutcomeReport {
  const y = test.map((g) => g.margin);
  const base = cvPredict([], y);
  const sse0 = base.reduce((s, v, i) => s + (v - y[i]!) ** 2, 0);
  const fit = (cols: number[][]) => {
    const pred = cvPredict(cols, y);
    const sse = pred.reduce((s, v, i) => s + (v - y[i]!) ** 2, 0);
    return { pred, rmse: rmse(pred, y), r2: 1 - sse / sse0 };
  };
  const pubX = features[PUBLISHED];
  if (!pubX) throw new Error(`features must include "${PUBLISHED}"`);
  const pub = fit([pubX]);
  const results: ScoredRating[] = [{ name: "Home court only", rmse: rmse(base, y), r2: 0 }];
  if (teamX) {
    const t = fit([teamX]);
    results.push({ name: "Team net rating (roster-blind)", rmse: t.rmse, r2: t.r2, vsPublished: bootDelta(t.pred, pub.pred, y) });
  }
  const incremental: ScoredRating[] = [];
  for (const [name, x] of Object.entries(features)) {
    if (name === PUBLISHED) {
      results.push({ name, rmse: pub.rmse, r2: pub.r2 });
      continue;
    }
    const s = fit([x]);
    results.push({ name, rmse: s.rmse, r2: s.r2, vsPublished: bootDelta(s.pred, pub.pred, y) });
    const both = fit([pubX, x]);
    incremental.push({
      name: `Published + ${name}`,
      rmse: both.rmse,
      r2: both.r2,
      vsPublished: bootDelta(both.pred, pub.pred, y),
    });
  }
  return { label, games: test.length, results, incremental };
}
